import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ProxyForwarderService } from '../services/proxy-forwarder.js';
import { gatewayAuthMiddleware } from '../middlewares/auth.js';

export const apiProxyRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // 网关鉴权
  fastify.addHook('preHandler', gatewayAuthMiddleware);

  const proxyHandler = async (req: any, reply: any) => {
    await ProxyForwarderService.forward(req, reply);
  };

  // 严格只匹配 Google 官方 Generative AI 原生路径
  const routes = [
    '/v1beta',
    '/v1beta/*',
    '/v1',
    '/v1/*',
    '/gemini',
    '/gemini/*',
    '/models',
    '/models/*'
  ];

  for (const r of routes) {
    fastify.all(r, proxyHandler);
  }
};
