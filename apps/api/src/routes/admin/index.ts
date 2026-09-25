import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { CSRF_HEADER } from '../../admin/session';
import { HttpError } from '../../http/errors';
import { assetRoutes } from './assets';
import { auditRoutes } from './audit';
import { authRoutes } from './auth';
import { catalogAdminRoutes } from './catalog';
import type { AdminDeps } from './deps';
import { devLoginRoutes } from './dev-login';
import { leadAdminRoutes } from './leads';
import { userRoutes } from './users';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Закрытое API админки (/api/admin, B4).
 * Каждый запрос: сессия из httpOnly cookie → request.admin; меняющие запросы — только с заголовком
 * x-apex-admin (защита от CSRF поверх SameSite=Strict); ответы не кэшируются.
 */
export const adminRoutes: FastifyPluginAsyncZod<{ deps: AdminDeps }> = async (app, { deps }) => {
  app.decorateRequest('admin', null);

  app.addHook('onRequest', async (request) => {
    if (!SAFE_METHODS.has(request.method) && request.headers[CSRF_HEADER] !== '1') {
      throw new HttpError(403, 'CSRF', 'Запрос без заголовка админки отклонён');
    }
    request.admin = await deps.sessions.resolve(request);
  });
  app.addHook('onSend', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
  });

  await app.register(authRoutes, { deps });
  await app.register(catalogAdminRoutes, { deps });
  await app.register(leadAdminRoutes, { deps });
  await app.register(assetRoutes, { deps });
  await app.register(auditRoutes, { deps });
  await app.register(userRoutes, { deps });
  // Вход по одноразовой ссылке из CLI — только в development и только если явно включён
  if (deps.env.NODE_ENV === 'development' && deps.env.ADMIN_DEV_LOGIN) await app.register(devLoginRoutes, { deps });
};
