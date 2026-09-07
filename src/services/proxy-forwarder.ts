import { FastifyRequest, FastifyReply } from 'fastify';
import { fetch, ProxyAgent, RequestInit } from 'undici';
import { Readable } from 'node:stream';
import { config } from '../config.js';
import { SettingsRepo, LogsRepo } from '../db/index.js';
import { KeyPoolService } from './key-pool.js';
import type { ApiKey } from '../types/index.js';

export class ProxyForwarderService {
  /**
   * 从请求路径和 Body 中提取模型名称（用于日志和监控）
   */
  public static extractModelName(path: string, body?: any): string {
    const match = path.match(/models\/([^/:]+)/);
    if (match && match[1]) {
      return match[1];
    }
    if (path.includes('/models')) {
      return 'models';
    }
    if (body && typeof body === 'object' && body.model) {
      return String(body.model);
    }
    return 'gemini-api';
  }

  /**
   * 构造上游 Google API 的请求地址
   * 纯透明转发官方 Gemini API 路径
   */
  public static buildTargetUrl(originalPath: string, searchParams: URLSearchParams, targetApiKey: string): string {
    let cleanPath = originalPath.replace(/^\/gemini/, '');
    if (!cleanPath.startsWith('/')) {
      cleanPath = '/' + cleanPath;
    }

    // 若客户端直接访问 /models，补齐默认版本 /v1beta/models
    if (cleanPath === '/models' || cleanPath === '/models/') {
      cleanPath = '/v1beta/models';
    } else if (cleanPath.startsWith('/models/')) {
      cleanPath = '/v1beta' + cleanPath;
    }

    // 替换/注入官方要求的 key 参数
    searchParams.set('key', targetApiKey);

    const baseUrl = config.geminiBaseUrl.replace(/\/+$/, '');
    const queryString = searchParams.toString();

    return `${baseUrl}${cleanPath}${queryString ? '?' + queryString : ''}`;
  }

  /**
   * 创建 undici fetch options 与代理配置
   */
  public static getFetchDispatcher(): any {
    const settings = SettingsRepo.getAll();
    const proxyUrl = settings.proxy_url || config.defaultProxyUrl;

    if (proxyUrl && proxyUrl.trim() !== '') {
      try {
        return new ProxyAgent(proxyUrl.trim());
      } catch (e) {
        console.error('Failed to create ProxyAgent with url:', proxyUrl, e);
      }
    }
    return undefined;
  }

  /**
   * 核心处理：纯透明转发 Google 官方 Gemini 请求
   */
  public static async forward(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const startTime = Date.now();
    const settings = SettingsRepo.getAll();
    const maxRetries = Math.max(1, settings.max_retries || 3);
    const clientIp = req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1';

    const model = this.extractModelName(req.url, req.body);
    const isStream = req.url.includes('streamGenerateContent') ||
      (req.headers['accept'] || '').includes('text/event-stream') ||
      (req.body && typeof req.body === 'object' && (req.body as any).stream === true);

    const triedKeyIds: number[] = [];
    let lastError: any = null;
    let selectedKey: ApiKey | null = null;
    let retryCount = 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // 严格持久化轮询获取下一个可用 Key
      selectedKey = KeyPoolService.getNextKey(triedKeyIds);
      if (!selectedKey) {
        reply.status(503).send({
          error: {
            code: 503,
            message: 'All API keys in the pool are exhausted, in cooldown, or disabled. Please check the dashboard.',
            status: 'UNAVAILABLE'
          }
        });
        return;
      }

      triedKeyIds.push(selectedKey.id);
      retryCount = attempt;

      // 构建目标上游 Google API 地址
      const urlObj = new URL(req.url, 'http://localhost');
      const targetUrl = this.buildTargetUrl(urlObj.pathname, urlObj.searchParams, selectedKey.key);

      // 透传请求头，清除客户端传来的自定义鉴权并注入官方 API Key
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        const lowerKey = k.toLowerCase();
        if (['host', 'connection', 'content-length', 'authorization', 'x-goog-api-key', 'accept-encoding'].includes(lowerKey)) {
          continue;
        }
        if (typeof v === 'string') {
          headers[lowerKey] = v;
        }
      }

      // Google 官方接口认证
      headers['x-goog-api-key'] = selectedKey.key;
      headers['host'] = 'generativelanguage.googleapis.com';

      const dispatcher = this.getFetchDispatcher();

      const fetchOptions: RequestInit = {
        method: req.method,
        headers,
        dispatcher,
      };

      if (['POST', 'PUT', 'PATCH'].includes(req.method.toUpperCase()) && req.body) {
        if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
          fetchOptions.body = req.body;
        } else {
          headers['content-type'] = headers['content-type'] || 'application/json';
          fetchOptions.body = JSON.stringify(req.body);
        }
      }

      try {
        const requestSentTime = Date.now();
        const upstreamRes = await fetch(targetUrl, fetchOptions);

        const isRateLimit = upstreamRes.status === 429;
        const isQuotaOrAuthError = upstreamRes.status === 403 || upstreamRes.status === 401;
        const isServerError = upstreamRes.status >= 500;

        // 若是可重试错误且未达重试上限，自动轮询下一个 Key 重试
        if ((isRateLimit || isServerError || isQuotaOrAuthError) && attempt < maxRetries) {
          const errBody = await upstreamRes.text().catch(() => '');
          KeyPoolService.handleFailure(selectedKey.id, `HTTP ${upstreamRes.status}: ${errBody.slice(0, 300)}`, isRateLimit);
          console.warn(`[Key #${selectedKey.id}] Request failed (HTTP ${upstreamRes.status}), switching to next key... (Attempt ${attempt + 1}/${maxRetries})`);
          continue;
        }

        // 设置响应状态码
        reply.status(upstreamRes.status);

        // 透传关键响应头，严格排除 Hop-by-Hop 传输控制头与已被自动解压的 content-encoding
        const hopByHopHeaders = [
          'content-length',
          'content-encoding',
          'transfer-encoding',
          'connection',
          'keep-alive',
          'alt-svc'
        ];

        for (const [hk, hv] of upstreamRes.headers.entries()) {
          const lowerHk = hk.toLowerCase();
          if (!hopByHopHeaders.includes(lowerHk)) {
            reply.header(hk, hv);
          }
        }

        // 处理错误响应
        if (upstreamRes.status >= 400) {
          const errBody = await upstreamRes.text().catch(() => '');
          KeyPoolService.handleFailure(selectedKey.id, `HTTP ${upstreamRes.status}: ${errBody.slice(0, 300)}`, isRateLimit);
          const totalLatency = Date.now() - startTime;

          LogsRepo.add({
            key_id: selectedKey.id,
            key_name: selectedKey.name,
            model,
            endpoint: urlObj.pathname,
            method: req.method,
            status_code: upstreamRes.status,
            is_stream: isStream ? 1 : 0,
            ttft_latency: totalLatency,
            total_latency: totalLatency,
            retry_count: attempt,
            client_ip: clientIp,
            error_message: errBody.slice(0, 500),
            created_at: startTime
          });

          return reply.send(errBody);
        }

        // 处理成功响应：流式 (SSE) 与普通非流式
        if (isStream && upstreamRes.body) {
          let ttftLatency = 0;
          let firstChunkReceived = false;

          async function* transformStream() {
            for await (const chunk of upstreamRes.body as AsyncIterable<Uint8Array>) {
              if (!firstChunkReceived) {
                firstChunkReceived = true;
                ttftLatency = Date.now() - requestSentTime;
              }
              yield chunk;
            }
          }

          const nodeStream = Readable.from(transformStream());

          nodeStream.on('end', () => {
            const totalLatency = Date.now() - startTime;
            if (!firstChunkReceived) {
              ttftLatency = totalLatency;
            }
            KeyPoolService.handleSuccess(selectedKey!.id, totalLatency);
            LogsRepo.add({
              key_id: selectedKey!.id,
              key_name: selectedKey!.name,
              model,
              endpoint: urlObj.pathname,
              method: req.method,
              status_code: upstreamRes.status,
              is_stream: 1,
              ttft_latency: ttftLatency,
              total_latency: totalLatency,
              retry_count: attempt,
              client_ip: clientIp,
              error_message: null,
              created_at: startTime
            });
          });

          return reply.send(nodeStream);
        } else {
          // 普通非流式请求 (JSON)
          const text = await upstreamRes.text();
          const totalLatency = Date.now() - startTime;

          KeyPoolService.handleSuccess(selectedKey.id, totalLatency);
          LogsRepo.add({
            key_id: selectedKey.id,
            key_name: selectedKey.name,
            model,
            endpoint: urlObj.pathname,
            method: req.method,
            status_code: upstreamRes.status,
            is_stream: 0,
            ttft_latency: totalLatency,
            total_latency: totalLatency,
            retry_count: attempt,
            client_ip: clientIp,
            error_message: null,
            created_at: startTime
          });

          if (!reply.getHeader('content-type')) {
            reply.header('content-type', 'application/json; charset=utf-8');
          }

          return reply.send(text);
        }
      } catch (err: any) {
        lastError = err;
        console.error(`[Key #${selectedKey.id}] Network error:`, err.message);
        KeyPoolService.handleFailure(selectedKey.id, `Network Error: ${err.message}`, false);

        if (attempt < maxRetries) {
          continue;
        }
      }
    }

    const totalLatency = Date.now() - startTime;
    if (selectedKey) {
      LogsRepo.add({
        key_id: selectedKey.id,
        key_name: selectedKey.name,
        model,
        endpoint: req.url,
        method: req.method,
        status_code: 502,
        is_stream: isStream ? 1 : 0,
        ttft_latency: totalLatency,
        total_latency: totalLatency,
        retry_count: retryCount,
        client_ip: clientIp,
        error_message: lastError ? String(lastError.message || lastError) : 'Max retries reached',
        created_at: startTime
      });
    }

    reply.status(502).send({
      error: {
        code: 502,
        message: `Upstream Gemini gateway error: ${lastError?.message || 'Max retries exhausted'}`,
        status: 'BAD_GATEWAY'
      }
    });
  }

  /**
   * 测试单个 Key 的连通性
   */
  public static async testKey(key: string): Promise<{ success: boolean; latency: number; error?: string }> {
    const startTime = Date.now();
    const dispatcher = this.getFetchDispatcher();
    const testUrl = `${config.geminiBaseUrl}/v1beta/models?key=${key}`;

    try {
      const res = await fetch(testUrl, {
        method: 'GET',
        dispatcher,
        headers: {
          'x-goog-api-key': key
        }
      });

      const latency = Date.now() - startTime;
      if (res.ok) {
        return { success: true, latency };
      } else {
        const errorText = await res.text().catch(() => '');
        return { success: false, latency, error: `HTTP ${res.status}: ${errorText.slice(0, 200)}` };
      }
    } catch (err: any) {
      return { success: false, latency: Date.now() - startTime, error: err.message || 'Connection failed' };
    }
  }

  /**
   * 测试代理连通性
   */
  public static async testProxy(proxyUrl: string): Promise<{ success: boolean; latency: number; error?: string }> {
    const startTime = Date.now();
    try {
      const dispatcher = new ProxyAgent(proxyUrl.trim());
      const res = await fetch('https://generativelanguage.googleapis.com', {
        method: 'GET',
        dispatcher,
      });
      const latency = Date.now() - startTime;
      return { success: true, latency };
    } catch (err: any) {
      return { success: false, latency: Date.now() - startTime, error: err.message || 'Proxy test failed' };
    }
  }
}
