import { ApiError } from '@apex/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { audit } from '../../admin/audit';
import { HttpError } from '../../http/errors';
import { sha256 } from '../../security/crypto';
import type { AdminDeps } from './deps';

/** Ключ одноразового токена в Redis; токен выдаёт `pnpm admin:dev-login`, живёт 5 минут */
export const devLoginKey = (token: string) => `apex:admin:dev-login:${sha256(token)}`;

/**
 * Вход без пароля для локальной разработки и проверки интерфейса: одноразовая ссылка из CLI.
 * Регистрируется только при NODE_ENV=development и ADMIN_DEV_LOGIN=true (в production loadEnv это запрещает).
 * Сессия создаётся с пройденным вторым фактором — как после полного входа.
 */
export const devLoginRoutes: FastifyPluginAsyncZod<{ deps: AdminDeps }> = async (app, { deps }) => {
  app.get(
    '/auth/dev-login',
    { schema: { hide: true, querystring: z.object({ token: z.string().min(20) }), response: { 400: ApiError } } },
    async (request, reply) => {
      const userId = await deps.redis.getdel(devLoginKey(request.query.token));
      if (!userId) throw new HttpError(400, 'INVALID_TOKEN', 'Ссылка недействительна или уже использована');
      const user = await deps.prisma.adminUser.findUniqueOrThrow({ where: { id: userId } });
      const session = await deps.sessions.create(reply, request, { id: user.id, totpEnabledAt: null });
      await audit(deps.prisma, { userId, action: 'auth.dev-login', entity: 'AdminUser', entityId: userId, diff: { sessionId: session.id }, ip: request.ip });
      return reply.redirect(`${deps.env.WEB_URL}/admin`);
    },
  );
};
