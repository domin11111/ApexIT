import { AdminMe, ApiError, LoginRequest, LoginResponse, OkResponse, TotpCode, TotpSetupResponse } from '@apex/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { audit } from '../../admin/audit';
import { requireAdmin, toMe } from '../../admin/session';
import { HttpError } from '../../http/errors';
import { decryptSecret, encryptSecret } from '../../security/crypto';
import { dummyPasswordHash, verifyPassword } from '../../security/password';
import { generateTotpSecret, otpauthUri, verifyTotp } from '../../security/totp';
import type { AdminDeps } from './deps';

const errors = { 400: ApiError, 401: ApiError, 403: ApiError, 429: ApiError };

export const authRoutes: FastifyPluginAsyncZod<{ deps: AdminDeps }> = async (app, { deps }) => {
  const { prisma, sessions, redis, env } = deps;

  /** Код TOTP нельзя использовать дважды: помним использованный шаг 90 с */
  const consumeTotp = async (userId: string, secret: string, code: string) => {
    const step = verifyTotp(secret, code);
    if (step === null) return false;
    const fresh = await redis.set(`apex:totp:${userId}:${step}`, '1', 'EX', 90, 'NX');
    return fresh === 'OK';
  };

  app.post(
    '/auth/login',
    {
      // Подбор пароля: 10 попыток за 15 минут с IP
      config: { rateLimit: { max: 10, timeWindow: '15 minutes', keyGenerator: (request) => `login:${request.ip}` } },
      schema: { tags: ['admin'], summary: 'Вход по почте и паролю', body: LoginRequest, response: { 200: LoginResponse, ...errors } },
    },
    async (request, reply) => {
      const { email, password } = request.body;
      const user = await prisma.adminUser.findUnique({ where: { email } });
      // Неизвестная почта проверяется против заглушки — время ответа не выдаёт, есть ли такой пользователь
      const valid = await verifyPassword(user?.passwordHash ?? (await dummyPasswordHash()), password);
      if (!user || !user.isActive || !valid) {
        throw new HttpError(401, 'INVALID_CREDENTIALS', 'Неверная почта или пароль');
      }

      const session = await sessions.create(reply, request, user);
      await prisma.adminUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await audit(prisma, { userId: user.id, action: 'auth.login', entity: 'AdminUser', entityId: user.id, diff: {}, ip: request.ip });

      const me = toMe({
        sessionId: session.id,
        mfaPassed: session.mfaPassed,
        user: { id: user.id, email: user.email, role: user.role, totpEnabled: user.totpEnabledAt !== null },
      });
      return { next: session.mfaPassed ? 'done' : 'totp', me } as const;
    },
  );

  app.post(
    '/auth/totp',
    {
      config: { rateLimit: { max: 10, timeWindow: '15 minutes', keyGenerator: (request) => `totp:${request.ip}` } },
      schema: { tags: ['admin'], summary: 'Второй фактор: код TOTP', body: TotpCode, response: { 200: AdminMe, ...errors } },
    },
    async (request, reply) => {
      const admin = requireAdmin(request, { mfa: false });
      const user = await prisma.adminUser.findUniqueOrThrow({ where: { id: admin.user.id } });
      if (!user.totpSecret || !user.totpEnabledAt) throw new HttpError(400, 'TOTP_NOT_ENABLED', 'Второй фактор не включён');
      if (!(await consumeTotp(user.id, decryptSecret(user.totpSecret, env.TOTP_ENCRYPTION_KEY), request.body.code))) {
        throw new HttpError(401, 'INVALID_TOTP', 'Неверный или уже использованный код');
      }
      await sessions.elevate(reply, admin.sessionId);
      await audit(prisma, { userId: user.id, action: 'auth.mfa', entity: 'AdminUser', entityId: user.id, diff: {}, ip: request.ip });
      return toMe({ ...admin, mfaPassed: true });
    },
  );

  app.post(
    '/auth/logout',
    { schema: { tags: ['admin'], summary: 'Выход', response: { 200: OkResponse } } },
    async (request, reply) => {
      await sessions.destroy(reply, request.admin?.sessionId ?? null);
      return { ok: true } as const;
    },
  );

  app.get(
    '/auth/me',
    { schema: { tags: ['admin'], summary: 'Текущий пользователь', response: { 200: AdminMe, ...errors } } },
    async (request) => toMe(requireAdmin(request, { mfa: false })),
  );

  // ── Настройка второго фактора ───────────────────────────────────────────
  app.post(
    '/auth/totp/setup',
    { schema: { tags: ['admin'], summary: 'Новый секрет TOTP (ещё не включён)', response: { 200: TotpSetupResponse, ...errors } } },
    async (request) => {
      const admin = requireAdmin(request);
      if (admin.user.totpEnabled) throw new HttpError(400, 'TOTP_ALREADY_ENABLED', 'Второй фактор уже включён');
      const secret = generateTotpSecret();
      await prisma.adminUser.update({
        where: { id: admin.user.id },
        data: { totpSecret: encryptSecret(secret, env.TOTP_ENCRYPTION_KEY), totpEnabledAt: null },
      });
      return { secret, uri: otpauthUri({ secret, account: admin.user.email, issuer: 'APEX Compute' }) };
    },
  );

  app.post(
    '/auth/totp/enable',
    { schema: { tags: ['admin'], summary: 'Включить TOTP кодом из приложения', body: TotpCode, response: { 200: AdminMe, ...errors } } },
    async (request) => {
      const admin = requireAdmin(request);
      const user = await prisma.adminUser.findUniqueOrThrow({ where: { id: admin.user.id } });
      if (!user.totpSecret) throw new HttpError(400, 'TOTP_NOT_SET_UP', 'Сначала получите секрет');
      if (!(await consumeTotp(user.id, decryptSecret(user.totpSecret, env.TOTP_ENCRYPTION_KEY), request.body.code))) {
        throw new HttpError(401, 'INVALID_TOTP', 'Неверный код — проверьте время на телефоне');
      }
      await prisma.adminUser.update({ where: { id: user.id }, data: { totpEnabledAt: new Date() } });
      await audit(prisma, { userId: user.id, action: 'auth.totp.enable', entity: 'AdminUser', entityId: user.id, diff: {}, ip: request.ip });
      return toMe({ ...admin, user: { ...admin.user, totpEnabled: true } });
    },
  );

  app.post(
    '/auth/totp/disable',
    { schema: { tags: ['admin'], summary: 'Отключить TOTP (нужен текущий код)', body: TotpCode, response: { 200: AdminMe, ...errors } } },
    async (request) => {
      const admin = requireAdmin(request);
      const user = await prisma.adminUser.findUniqueOrThrow({ where: { id: admin.user.id } });
      if (!user.totpSecret || !user.totpEnabledAt) throw new HttpError(400, 'TOTP_NOT_ENABLED', 'Второй фактор не включён');
      if (!(await consumeTotp(user.id, decryptSecret(user.totpSecret, env.TOTP_ENCRYPTION_KEY), request.body.code))) {
        throw new HttpError(401, 'INVALID_TOTP', 'Неверный код');
      }
      await prisma.adminUser.update({ where: { id: user.id }, data: { totpSecret: null, totpEnabledAt: null } });
      await audit(prisma, { userId: user.id, action: 'auth.totp.disable', entity: 'AdminUser', entityId: user.id, diff: {}, ip: request.ip });
      return toMe({ ...admin, user: { ...admin.user, totpEnabled: false } });
    },
  );
};
