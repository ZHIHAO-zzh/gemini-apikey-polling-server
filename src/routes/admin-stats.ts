import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { StatsRepo } from '../db/index.js';
import { adminAuthMiddleware } from '../middlewares/auth.js';

export const adminStatsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.addHook('preHandler', adminAuthMiddleware);

  // 获取仪表盘概览数据
  fastify.get('/api/admin/stats/overview', async () => {
    const overview = StatsRepo.getOverview();
    return {
      code: 200,
      data: overview
    };
  });

  // 获取时序图表数据 (最近 24 小时或 7 天)
  fastify.get('/api/admin/stats/timeseries', async (req) => {
    const query = req.query as any;
    const hours = parseInt(query.hours || '24', 10);
    const series = StatsRepo.getTimeSeries(hours);
    return {
      code: 200,
      data: series
    };
  });

  // 获取模型分布数据
  fastify.get('/api/admin/stats/models', async () => {
    const models = StatsRepo.getModelDistribution();
    return {
      code: 200,
      data: models
    };
  });
};
