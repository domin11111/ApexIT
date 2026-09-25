import type { AdminMe, AdminRole } from '@apex/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from '../db/prisma';
import { HttpError } from '../http/errors';
import { randomToken, sha256 } from '../security/crypto';

export const SESSION_COOKIE = 'apex_admin';
/** Любой меняющий запрос админки обязан нести этот заголовок: чужой сайт не отправит его без CORS-предзапроса */
export const CSRF_HEADER = 'x-apex-admin';

export type AdminSessionContext = {
  sessionId: string;
  mfaPassed: boolean;
  user: { id: string; email: string; role: AdminRole; totpEnabled: boolean };
};

declare module 'fastify' {
  interface FastifyRequest {
    admin: AdminSessionContext | null;
  }
}

export const toMe = ({ user, mfaPassed }: AdminSessionContext): AdminMe => ({
  id: user.id,
  email: user.email,
  role: user.role,
  totpEnabled: user.totpEnabled,
  mfaPassed,
});

export type SessionOptions = { hours: number; secure: boolean };

/**
 * Сессии админки: в cookie — случайный токен, в БД — только его sha256.
 * httpOnly (недоступен JS), SameSite=Strict (не уходит с чужих сайтов), Secure в production.
 */
export function createSessionStore(prisma: Db, options: SessionOptions) {
  const cookie = (reply: FastifyReply, token: string, expires: Date) =>
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: options.secure,
      path: '/',
      expires,
    });

  return {
    async create(reply: FastifyReply, request: FastifyRequest, user: { id: string; totpEnabledAt: Date | null }) {
      const token = randomToken();
      const expiresAt = new Date(Date.now() + options.hours * 3600_000);
      const session = await prisma.adminSession.create({
        data: {
          userId: user.id,
          tokenHash: sha256(token),
          mfaPassed: user.totpEnabledAt === null,
          expiresAt,
          ip: request.ip,
          userAgent: request.headers['user-agent']?.slice(0, 300) ?? null,
        },
      });
      cookie(reply, token, expiresAt);
      return session;
    },

    /** После второго фактора токен меняется — защита от фиксации сессии */
    async elevate(reply: FastifyReply, sessionId: string) {
      const token = randomToken();
      const session = await prisma.adminSession.update({
        where: { id: sessionId },
        data: { tokenHash: sha256(token), mfaPassed: true },
      });
      cookie(reply, token, session.expiresAt);
    },

    async resolve(request: FastifyRequest): Promise<AdminSessionContext | null> {
      const token = request.cookies[SESSION_COOKIE];
      if (!token) return null;
      const session = await prisma.adminSession.findUnique({
        where: { tokenHash: sha256(token) },
        include: { user: { select: { id: true, email: true, role: true, isActive: true, totpEnabledAt: true } } },
      });
      if (!session || !session.user.isActive) return null;
      if (session.expiresAt < new Date()) {
        await prisma.adminSession.delete({ where: { id: session.id } }).catch(() => undefined);
        return null;
      }
      return {
        sessionId: session.id,
        mfaPassed: session.mfaPassed,
        user: {
          id: session.user.id,
          email: session.user.email,
          role: session.user.role,
          totpEnabled: session.user.totpEnabledAt !== null,
        },
      };
    },

    async destroy(reply: FastifyReply, sessionId: string | null) {
      if (sessionId) await prisma.adminSession.delete({ where: { id: sessionId } }).catch(() => undefined);
      reply.clearCookie(SESSION_COOKIE, { path: '/' });
    },

    /** Все сессии пользователя — при деактивации или смене пароля */
    revokeAll: (userId: string) => prisma.adminSession.deleteMany({ where: { userId } }),
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;

/**
 * Проверки доступа для preHandler: вход, второй фактор (по умолчанию обязателен) и роль.
 * Возвращает контекст — обработчику не нужно проверять null.
 */
export function requireAdmin(request: FastifyRequest, { role, mfa = true }: { role?: AdminRole; mfa?: boolean } = {}): AdminSessionContext {
  const admin = request.admin;
  if (!admin) throw new HttpError(401, 'UNAUTHENTICATED', 'Войдите в админку');
  if (mfa && !admin.mfaPassed) throw new HttpError(403, 'MFA_REQUIRED', 'Подтвердите вход кодом из приложения-аутентификатора');
  if (role === 'ADMIN' && admin.user.role !== 'ADMIN') throw new HttpError(403, 'FORBIDDEN', 'Недостаточно прав: нужна роль администратора');
  return admin;
}
