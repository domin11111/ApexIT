import { AdminUserCreate, AdminUserDto, AdminUserUpdate, ApiError, IdParam } from '@apex/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { audit } from '../../admin/audit';
import { requireAdmin } from '../../admin/session';
import type { Prisma } from '../../generated/prisma/client';
import { HttpError } from '../../http/errors';
import { hashPassword } from '../../security/password';
import type { AdminDeps } from './deps';

const errors = { 400: ApiError, 401: ApiError, 403: ApiError, 404: ApiError, 409: ApiError };

type UserRow = Prisma.AdminUserGetPayload<object>;
const toDto = (u: UserRow): AdminUserDto => ({
  id: u.id,
  email: u.email,
  role: u.role,
  isActive: u.isActive,
  totpEnabled: u.totpEnabledAt !== null,
  lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  createdAt: u.createdAt.toISOString(),
});

/** Пользователи админки: заводит и отключает только администратор. */
export const userRoutes: FastifyPluginAsyncZod<{ deps: AdminDeps }> = async (app, { deps }) => {
  const { prisma, sessions } = deps;

  app.get(
    '/users',
    { schema: { tags: ['admin'], summary: 'Пользователи админки', response: { 200: z.object({ items: z.array(AdminUserDto) }), ...errors } } },
    async (request) => {
      requireAdmin(request, { role: 'ADMIN' });
      return { items: (await prisma.adminUser.findMany({ orderBy: { createdAt: 'asc' } })).map(toDto) };
    },
  );

  app.post(
    '/users',
    { schema: { tags: ['admin'], summary: 'Новый пользователь', body: AdminUserCreate, response: { 201: AdminUserDto, ...errors } } },
    async (request, reply) => {
      const admin = requireAdmin(request, { role: 'ADMIN' });
      const { email, role, password } = request.body;
      if (await prisma.adminUser.findUnique({ where: { email } })) throw new HttpError(409, 'EMAIL_TAKEN', 'Пользователь с такой почтой уже есть');
      const user = await prisma.$transaction(async (tx) => {
        const created = await tx.adminUser.create({ data: { email, role, passwordHash: await hashPassword(password) } });
        await audit(tx, { userId: admin.user.id, action: 'user.create', entity: 'AdminUser', entityId: created.id, before: null, after: { email, role }, ip: request.ip });
        return created;
      });
      return reply.code(201).send(toDto(user));
    },
  );

  app.patch(
    '/users/:id',
    { schema: { tags: ['admin'], summary: 'Роль и доступ пользователя', params: IdParam, body: AdminUserUpdate, response: { 200: AdminUserDto, ...errors } } },
    async (request) => {
      const admin = requireAdmin(request, { role: 'ADMIN' });
      const before = await prisma.adminUser.findUnique({ where: { id: request.params.id } });
      if (!before) throw new HttpError(404, 'NOT_FOUND', 'Пользователь не найден');
      // Себя нельзя отключить или понизить — иначе можно остаться без администратора
      if (before.id === admin.user.id && (request.body.isActive === false || request.body.role === 'EDITOR')) {
        throw new HttpError(400, 'SELF_LOCKOUT', 'Нельзя отключить или понизить собственную учётную запись');
      }
      const user = await prisma.$transaction(async (tx) => {
        const updated = await tx.adminUser.update({ where: { id: before.id }, data: request.body });
        await audit(tx, {
          userId: admin.user.id,
          action: 'user.update',
          entity: 'AdminUser',
          entityId: before.id,
          before: { role: before.role, isActive: before.isActive },
          after: { role: updated.role, isActive: updated.isActive },
          ip: request.ip,
        });
        return updated;
      });
      // Отключённый пользователь выходит из всех сессий сразу
      if (request.body.isActive === false) await sessions.revokeAll(user.id);
      return toDto(user);
    },
  );
};
