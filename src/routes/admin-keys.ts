import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ApiKeysRepo } from '../db/index.js';
import { adminAuthMiddleware } from '../middlewares/auth.js';
import { ProxyForwarderService } from '../services/proxy-forwarder.js';
import { z } from 'zod';

export const adminKeysRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.addHook('preHandler', adminAuthMiddleware);

  // 获取所有 API Keys
  fastify.get('/api/admin/keys', async () => {
    const keys = ApiKeysRepo.getAll();
    return {
      code: 200,
      data: keys.map(k => ({
        ...k,
        // 脱敏展示 key，例如 AIzaSyD...5xQz
        masked_key: k.key.length > 10 ? `${k.key.slice(0, 7)}...${k.key.slice(-4)}` : '******'
      }))
    };
  });

  // 单条添加 Key
  fastify.post('/api/admin/keys', async (req, reply) => {
    const schema = z.object({
      name: z.string().optional(),
      key: z.string().min(5, 'API Key is too short')
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ code: 400, message: parsed.error.issues[0].message });
    }

    try {
      const name = parsed.data.name?.trim() || '';
      const key = ApiKeysRepo.add(name, parsed.data.key);
      return { code: 200, data: key, message: 'Key added successfully' };
    } catch (err: any) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return reply.status(409).send({ code: 409, message: 'This API key already exists' });
      }
      return reply.status(500).send({ code: 500, message: err.message });
    }
  });

  // 批量导入 Keys (支持文本多行粘贴)
  fastify.post('/api/admin/keys/batch', async (req, reply) => {
    const schema = z.object({
      text: z.string().optional(),
      items: z.array(z.object({
        name: z.string().optional(),
        key: z.string()
      })).optional()
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ code: 400, message: 'Invalid payload format' });
    }

    const itemsToAdd: { name: string; key: string }[] = [];

    if (parsed.data.items && parsed.data.items.length > 0) {
      for (const item of parsed.data.items) {
        if (item.key && item.key.trim()) {
          itemsToAdd.push({
            name: item.name ? item.name.trim() : '',
            key: item.key.trim()
          });
        }
      }
    } else if (parsed.data.text) {
      // 按行解析，支持纯 `key` 或 `key,自定义别名` 格式
      const lines = parsed.data.text.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        let key = trimmed;
        let name = '';

        if (trimmed.includes(',')) {
          const parts = trimmed.split(',');
          key = parts[0].trim();
          name = parts.slice(1).join(',').trim();
        } else if (trimmed.includes('----')) {
          const parts = trimmed.split('----');
          key = parts[0].trim();
          name = parts.slice(1).join('----').trim();
        }

        if (key) {
          itemsToAdd.push({
            name,
            key
          });
        }
      }
    }

    if (itemsToAdd.length === 0) {
      return reply.status(400).send({ code: 400, message: 'No valid API keys found in input' });
    }

    const result = ApiKeysRepo.addBatch(itemsToAdd);
    return {
      code: 200,
      data: result,
      message: `Batch imported: ${result.added} added, ${result.skipped} skipped (duplicates/empty)`
    };
  });

  // 更新 Key (名称、状态)
  fastify.put('/api/admin/keys/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const numId = parseInt(id, 10);
    const key = ApiKeysRepo.getById(numId);
    if (!key) {
      return reply.status(404).send({ code: 404, message: 'Key not found' });
    }

    const schema = z.object({
      name: z.string().optional(),
      status: z.enum(['active', 'disabled', 'cooldown']).optional(),
      key: z.string().optional()
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ code: 400, message: 'Invalid data' });
    }

    const updateData: any = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.status !== undefined) {
      updateData.status = parsed.data.status;
      if (parsed.data.status === 'active') {
        updateData.cooldown_until = null;
        updateData.consecutive_errors = 0;
      }
    }
    if (parsed.data.key !== undefined && parsed.data.key.trim() !== '') {
      updateData.key = parsed.data.key.trim();
    }

    ApiKeysRepo.update(numId, updateData);
    return { code: 200, message: 'Key updated successfully' };
  });

  // 删除 Key
  fastify.delete('/api/admin/keys/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const numId = parseInt(id, 10);
    ApiKeysRepo.delete(numId);
    return { code: 200, message: 'Key deleted successfully' };
  });

  // 重置所有 Key 状态（解除所有冷却/连续错误计次）
  fastify.post('/api/admin/keys/reset-all-status', async () => {
    ApiKeysRepo.resetAllStatus();
    return { code: 200, message: 'All keys status reset to active' };
  });

  // 测试单个 Key 连通性
  fastify.post('/api/admin/keys/:id/test', async (req, reply) => {
    const { id } = req.params as { id: string };
    const keyObj = ApiKeysRepo.getById(parseInt(id, 10));
    if (!keyObj) {
      return reply.status(404).send({ code: 404, message: 'Key not found' });
    }

    const result = await ProxyForwarderService.testKey(keyObj.key);
    return { code: 200, data: result };
  });
};
