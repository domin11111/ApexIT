import { AdminLead, AdminLeadPage, AdminLeadQuery, ApiError, IdParam, LeadCommentCreate, LeadStatusUpdate, type LeadStatus } from '@apex/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { audit } from '../../admin/audit';
import { requireAdmin } from '../../admin/session';
import type { Prisma } from '../../generated/prisma/client';
import { HttpError } from '../../http/errors';
import type { AdminDeps } from './deps';

const errors = { 400: ApiError, 401: ApiError, 403: ApiError, 404: ApiError, 429: ApiError };

const leadInclude = {
  configuration: { select: { shareCode: true } },
  comments: { orderBy: { createdAt: 'asc' }, include: { author: { select: { email: true } } } },
} satisfies Prisma.LeadInclude;
type LeadRow = Prisma.LeadGetPayload<{ include: typeof leadInclude }>;

const toAdminLead = (lead: LeadRow): AdminLead => ({
  id: lead.id,
  name: lead.name,
  company: lead.company,
  email: lead.email,
  phone: lead.phone,
  message: lead.message,
  intent: lead.intent,
  productSlug: lead.productSlug,
  configurationShareCode: lead.configuration?.shareCode ?? null,
  status: lead.status,
  source: lead.source,
  locale: lead.locale,
  createdAt: lead.createdAt.toISOString(),
  comments: lead.comments.map((c) => ({ id: c.id, body: c.body, author: c.author?.email ?? null, createdAt: c.createdAt.toISOString() })),
});

/**
 * Ячейка CSV: кавычки удваиваются; значения, начинающиеся с = + - @, экранируются апострофом —
 * иначе Excel выполнит их как формулу (CSV injection).
 */
export function csvCell(value: string | null | undefined): string {
  const text = value ?? '';
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export const leadAdminRoutes: FastifyPluginAsyncZod<{ deps: AdminDeps }> = async (app, { deps }) => {
  const { prisma } = deps;

  const where = (status?: LeadStatus, q?: string): Prisma.LeadWhereInput => ({
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { company: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  });

  app.get(
    '/leads',
    { schema: { tags: ['admin'], summary: 'Заявки: фильтр по статусу, поиск, курсор', querystring: AdminLeadQuery, response: { 200: AdminLeadPage, ...errors } } },
    async (request) => {
      requireAdmin(request);
      const { status, q, cursor, limit } = request.query;
      const [rows, grouped] = await Promise.all([
        prisma.lead.findMany({
          where: where(status, q),
          include: leadInclude,
          // uuid v7 растёт со временем: сортировка по id = по дате, курсор стабилен
          orderBy: { id: 'desc' },
          take: limit + 1,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
        prisma.lead.groupBy({ by: ['status'], _count: { _all: true } }),
      ]);
      const counts: Record<LeadStatus, number> = { NEW: 0, IN_PROGRESS: 0, CLOSED: 0 };
      for (const row of grouped) counts[row.status] = row._count._all;
      const page = rows.slice(0, limit);
      return { items: page.map(toAdminLead), nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null, counts };
    },
  );

  app.get(
    '/leads/export.csv',
    {
      schema: {
        tags: ['admin'],
        summary: 'Экспорт заявок в CSV (UTF-8 с BOM — открывается в Excel)',
        querystring: z.object({ status: AdminLeadQuery.shape.status, q: AdminLeadQuery.shape.q }),
        produces: ['text/csv'],
      },
    },
    async (request, reply) => {
      const admin = requireAdmin(request);
      const { status, q } = request.query;
      const leads = await prisma.lead.findMany({ where: where(status, q), include: leadInclude, orderBy: { id: 'desc' }, take: 10_000 });
      const header = ['Дата', 'Статус', 'Намерение', 'Имя', 'Компания', 'Почта', 'Телефон', 'Продукт', 'Сборка', 'Источник', 'Сообщение'];
      const lines = leads.map((l) =>
        [l.createdAt.toISOString(), l.status, l.intent, l.name, l.company, l.email, l.phone, l.productSlug, l.configuration?.shareCode, l.source, l.message]
          .map(csvCell)
          .join(';'),
      );
      await audit(prisma, { userId: admin.user.id, action: 'lead.export', entity: 'Lead', entityId: '*', diff: { count: leads.length, status: status ?? null }, ip: request.ip });
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`)
        .send(`\uFEFF${[header.map(csvCell).join(';'), ...lines].join('\r\n')}`);
    },
  );

  app.get(
    '/leads/:id',
    { schema: { tags: ['admin'], summary: 'Заявка с комментариями', params: IdParam, response: { 200: AdminLead, ...errors } } },
    async (request) => {
      requireAdmin(request);
      const lead = await prisma.lead.findUnique({ where: { id: request.params.id }, include: leadInclude });
      if (!lead) throw new HttpError(404, 'NOT_FOUND', 'Заявка не найдена');
      return toAdminLead(lead);
    },
  );

  app.patch(
    '/leads/:id',
    { schema: { tags: ['admin'], summary: 'Сменить статус заявки', params: IdParam, body: LeadStatusUpdate, response: { 200: AdminLead, ...errors } } },
    async (request) => {
      const admin = requireAdmin(request);
      const before = await prisma.lead.findUnique({ where: { id: request.params.id } });
      if (!before) throw new HttpError(404, 'NOT_FOUND', 'Заявка не найдена');
      const lead = await prisma.$transaction(async (tx) => {
        const updated = await tx.lead.update({ where: { id: before.id }, data: { status: request.body.status }, include: leadInclude });
        await audit(tx, { userId: admin.user.id, action: 'lead.status', entity: 'Lead', entityId: before.id, before: { status: before.status }, after: { status: updated.status }, ip: request.ip });
        return updated;
      });
      return toAdminLead(lead);
    },
  );

  app.post(
    '/leads/:id/comments',
    { schema: { tags: ['admin'], summary: 'Комментарий менеджера к заявке', params: IdParam, body: LeadCommentCreate, response: { 201: AdminLead, ...errors } } },
    async (request, reply) => {
      const admin = requireAdmin(request);
      const exists = await prisma.lead.count({ where: { id: request.params.id } });
      if (!exists) throw new HttpError(404, 'NOT_FOUND', 'Заявка не найдена');
      const lead = await prisma.$transaction(async (tx) => {
        const comment = await tx.leadComment.create({ data: { leadId: request.params.id, authorId: admin.user.id, body: request.body.body } });
        await audit(tx, { userId: admin.user.id, action: 'lead.comment', entity: 'Lead', entityId: request.params.id, diff: { commentId: comment.id }, ip: request.ip });
        return tx.lead.findUniqueOrThrow({ where: { id: request.params.id }, include: leadInclude });
      });
      return reply.code(201).send(toAdminLead(lead));
    },
  );
};
