import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { SettingsRepo, ApiKeysRepo } from '../db/index.js';
import { adminAuthMiddleware } from '../middlewares/auth.js';
import { ProxyForwarderService } from '../services/proxy-forwarder.js';
import { z } from 'zod';

export const adminSettingsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // 检查是否需要登录以及登录接口
  fastify.post('/api/admin/auth/login', async (req, reply) => {
    const settings = SettingsRepo.getAll();
    const adminPassword = settings.admin_password;

    // 若无密码设置，直接返回成功
    if (!adminPassword || adminPassword.trim() === '') {
      return { code: 200, message: 'No password required', token: '' };
    }

    const { password } = (req.body as any) || {};
    if (password === adminPassword) {
      return { code: 200, message: 'Login successful', token: adminPassword };
    }

    return reply.status(401).send({ code: 401, message: 'Invalid Admin Password' });
  });

  // 检查当前系统是否启用了密码保护
  fastify.get('/api/admin/auth/status', async () => {
    const settings = SettingsRepo.getAll();
    return {
      code: 200,
      data: {
        authRequired: !!(settings.admin_password && settings.admin_password.trim() !== '')
      }
    };
  });

  // 后续接口均需要管理权限
  fastify.register(async (authedFastify) => {
    authedFastify.addHook('preHandler', adminAuthMiddleware);

    // 获取系统配置与当前持久化轮询游标详情
    authedFastify.get('/api/admin/settings', async () => {
      const settings = SettingsRepo.getAll();
      const currentKey = settings.last_key_id ? ApiKeysRepo.getById(settings.last_key_id) : null;

      return {
        code: 200,
        data: {
          ...settings,
          current_cursor_key: currentKey ? {
            id: currentKey.id,
            name: currentKey.name,
            masked_key: currentKey.key.length > 10 ? `${currentKey.key.slice(0, 7)}...${currentKey.key.slice(-4)}` : '******'
          } : null
        }
      };
    });

    // 更新系统设置
    authedFastify.put('/api/admin/settings', async (req, reply) => {
      const schema = z.object({
        max_retries: z.number().min(0).max(10).optional(),
        cooldown_duration: z.number().min(5).max(86400).optional(),
        error_threshold: z.number().min(1).max(20).optional(),
        proxy_url: z.string().optional(),
        gateway_token: z.string().optional(),
        admin_password: z.string().optional(),
        log_retention_days: z.number().min(1).max(365).optional(),
        strict_persistent_cursor: z.boolean().optional(),
        key_usage_count_per_turn: z.number().min(1).max(1000).optional(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ code: 400, message: parsed.error.issues[0].message });
      }

      SettingsRepo.setMany(parsed.data);
      return { code: 200, message: 'Settings saved successfully' };
    });

    // 测试代理服务器连通性
    authedFastify.post('/api/admin/settings/test-proxy', async (req, reply) => {
      const { proxy_url } = (req.body as any) || {};
      if (!proxy_url || typeof proxy_url !== 'string') {
        return reply.status(400).send({ code: 400, message: 'Please provide a valid proxy URL' });
      }

      const res = await ProxyForwarderService.testProxy(proxy_url);
      return { code: 200, data: res };
    });
  });
};
