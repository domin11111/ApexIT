import { ApiError, AuditPage, AuditQuery } from '@apex/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { requireAdmin } from '../../admin/session';
import type { AdminDeps } from './deps';

export const auditRoutes: FastifyPluginAsyncZod<{ deps: AdminDeps }> = async (app, { deps }) => {
  app.get(
    '/audit',
    {
      schema: {
        tags: ['admin'],
        summary: 'Журнал аудита (только администратор)',
        querystring: AuditQuery,
        response: { 200: AuditPage, 401: ApiError, 403: ApiError },
      },
    },
    async (request) => {
      requireAdmin(request, { role: 'ADMIN' });
      const { entity, cursor, limit } = request.query;
      const rows = await deps.prisma.auditLog.findMany({
        where: entity ? { entity } : {},
        include: { user: { select: { email: true } } },
        orderBy: { id: 'desc' },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      const page = rows.slice(0, limit);
      return {
        items: page.map((row) => ({
          id: row.id,
          user: row.user?.email ?? null,
          action: row.action,
          entity: row.entity,
          entityId: row.entityId,
          diff: row.diff,
          ip: row.ip,
          createdAt: row.createdAt.toISOString(),
        })),
        nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
      };
    },
  );
};
