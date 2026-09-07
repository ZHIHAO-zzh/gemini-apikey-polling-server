import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { initDatabase, LogsRepo, SettingsRepo, ApiKeysRepo } from './db/index.js';
import { apiProxyRoutes } from './routes/api-proxy.js';
import { adminKeysRoutes } from './routes/admin-keys.js';
import { adminLogsRoutes } from './routes/admin-logs.js';
import { adminStatsRoutes } from './routes/admin-stats.js';
import { adminSettingsRoutes } from './routes/admin-settings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function bootstrap() {
  console.log('🚀 Initializing Gemini API Key Polling Server...');

  // 1. 初始化 SQLite 数据库
  initDatabase();
  console.log(`📦 Database loaded at ${config.dbPath}`);

  // 2. 创建 Fastify 实例
  const fastify = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'warn'
    },
    bodyLimit: 50 * 1024 * 1024 // 允许 50MB (支持多模态请求)
  });

  // 3. 注册跨域支持
  await fastify.register(cors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']
  });

  // 4. 注册业务路由
  await fastify.register(adminKeysRoutes);
  await fastify.register(adminLogsRoutes);
  await fastify.register(adminStatsRoutes);
  await fastify.register(adminSettingsRoutes);
  await fastify.register(apiProxyRoutes);

  // 5. 静态资源托管（前端 SPA 构建产物）
  // 查找可能的静态目录位置
  const candidates = [
    path.join(__dirname, '../public'),
    path.join(__dirname, 'public'),
    path.join(process.cwd(), 'dist/public'),
    path.join(process.cwd(), 'public')
  ];

  let staticRoot = candidates.find(dir => fs.existsSync(dir));

  if (staticRoot) {
    console.log(`🌐 Serving static dashboard UI from ${staticRoot}`);
    await fastify.register(fastifyStatic, {
      root: staticRoot,
      prefix: '/',
      decorateReply: true
    });

    // SPA Fallback 兜底路由
    fastify.setNotFoundHandler(async (req, reply) => {
      // 如果是 API 请求、代理请求、或者带静态资源后缀（.js, .css, .png, .ico 等）的 404，不返回 index.html
      const cleanPath = req.url.split('?')[0];
      if (
        cleanPath.startsWith('/api') ||
        cleanPath.startsWith('/v1') ||
        cleanPath.startsWith('/gemini') ||
        /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map|json)$/i.test(cleanPath)
      ) {
        return reply.status(404).send({
          error: {
            code: 404,
            message: `Not Found: ${req.method} ${req.url}`
          }
        });
      }

      const indexPath = path.join(staticRoot!, 'index.html');
      if (fs.existsSync(indexPath)) {
        return reply.sendFile('index.html');
      }

      return reply.status(404).send({
        error: {
          code: 404,
          message: `Not Found: ${req.method} ${req.url}`
        }
      });
    });
  } else {
    // 若未构建前端，提供基本提示页
    fastify.get('/', async () => {
      return {
        name: 'Google Gemini API Key Polling Server',
        status: 'running',
        docs: 'Access Gemini API via /v1beta/models/... or manage via dashboard when built.'
      };
    });
  }

  // 6. 定时后台任务 (每分钟检查冷却解除，每天自动清理旧日志)
  setInterval(() => {
    try {
      ApiKeysRepo.checkAndUpdateCooldowns();
    } catch (e) {
      console.error('Error during cooldown check:', e);
    }
  }, 10 * 1000);

  setInterval(() => {
    try {
      const settings = SettingsRepo.getAll();
      if (settings.log_retention_days > 0) {
        const cleaned = LogsRepo.cleanOldLogs(settings.log_retention_days);
        if (cleaned > 0) {
          console.log(`🧹 Auto-cleaned ${cleaned} expired request logs.`);
        }
      }
    } catch (e) {
      console.error('Error during log retention cleanup:', e);
    }
  }, 6 * 60 * 60 * 1000); // 每 6 小时检查一次

  // 7. 启动服务监听
  try {
    await fastify.listen({ port: config.port, host: config.host });
    console.log(`✨ Gemini Gateway is successfully running at http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
    console.log(`🔑 Gemini Endpoint: http://localhost:${config.port}/v1beta/...`);
    console.log(`📊 Web Dashboard: http://localhost:${config.port}/`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

bootstrap();
