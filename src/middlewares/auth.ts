import { FastifyRequest, FastifyReply } from 'fastify';
import { SettingsRepo } from '../db/index.js';

/**
 * 校验网关调用的访问令牌（若系统配置了 gateway_token）
 */
export async function gatewayAuthMiddleware(req: FastifyRequest, reply: FastifyReply) {
  const settings = SettingsRepo.getAll();
  const requiredToken = settings.gateway_token;

  if (!requiredToken || requiredToken.trim() === '') {
    return; // 未设置网关 Token，直接放行
  }

  // 检查 Header 或 Query
  const authHeader = req.headers['authorization'];
  const googKeyHeader = req.headers['x-goog-api-key'];
  const urlObj = new URL(req.url, 'http://localhost');
  const queryKey = urlObj.searchParams.get('key');

  let clientToken = '';
  if (googKeyHeader && typeof googKeyHeader === 'string') {
    clientToken = googKeyHeader;
  } else if (authHeader && authHeader.startsWith('Bearer ')) {
    clientToken = authHeader.slice(7);
  } else if (queryKey) {
    clientToken = queryKey;
  }

  if (clientToken !== requiredToken.trim()) {
    reply.status(401).send({
      error: {
        code: 401,
        message: 'Invalid or missing gateway authentication token (Master Key).',
        status: 'UNAUTHENTICATED'
      }
    });
  }
}

/**
 * 校验管理员后台接口访问权限
 */
export async function adminAuthMiddleware(req: FastifyRequest, reply: FastifyReply) {
  const settings = SettingsRepo.getAll();
  const adminPassword = settings.admin_password;

  // 如果未配置管理员密码，免密管理
  if (!adminPassword || adminPassword.trim() === '') {
    return;
  }

  const tokenHeader = req.headers['x-admin-token'] || req.headers['authorization'];
  let token = '';
  if (typeof tokenHeader === 'string') {
    token = tokenHeader.startsWith('Bearer ') ? tokenHeader.slice(7) : tokenHeader;
  }

  if (token !== adminPassword.trim()) {
    reply.status(401).send({
      code: 401,
      message: 'Unauthorized: Invalid Admin Password/Token'
    });
  }
}
