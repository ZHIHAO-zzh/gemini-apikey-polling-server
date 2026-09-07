import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { LogsRepo } from '../db/index.js';
import { adminAuthMiddleware } from '../middlewares/auth.js';
import { z } from 'zod';

export const adminLogsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.addHook('preHandler', adminAuthMiddleware);

  // 分页查询日志
  fastify.get('/api/admin/logs', async (req) => {
    const query = req.query as any;

    const page = parseInt(query.page || '1', 10);
    const pageSize = parseInt(query.pageSize || '20', 10);
    const model = query.model ? String(query.model) : undefined;
    const keyId = query.keyId ? parseInt(query.keyId, 10) : undefined;
    const statusFilter = query.statusFilter ? (query.statusFilter as 'all' | 'success' | 'failed' | '429') : undefined;
    const startTime = query.startTime ? parseInt(query.startTime, 10) : undefined;
    const endTime = query.endTime ? parseInt(query.endTime, 10) : undefined;

    const result = LogsRepo.query({
      page,
      pageSize,
      model,
      keyId,
      statusFilter,
      startTime,
      endTime
    });

    return {
      code: 200,
      data: {
        list: result.list,
        total: result.total,
        page,
        pageSize
      }
    };
  });

  // 清空所有日志
  fastify.delete('/api/admin/logs', async () => {
    LogsRepo.clearAll();
    return { code: 200, message: 'All logs cleared' };
  });

  // 清理过期日志
  fastify.post('/api/admin/logs/clean', async (req, reply) => {
    const schema = z.object({
      days: z.number().min(1)
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ code: 400, message: 'Invalid days parameter' });
    }

    const count = LogsRepo.cleanOldLogs(parsed.data.days);
    return { code: 200, message: `Cleaned ${count} logs older than ${parsed.data.days} days` };
  });
};
