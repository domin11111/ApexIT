import { ApiError, LeadCreate, LeadCreateResponse } from '@apex/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { createLead, type LeadDeps } from '../leads/service';

export const leadRoutes: FastifyPluginAsyncZod<{ deps: LeadDeps; perHour: number }> = async (app, { deps, perHour }) => {
  app.post(
    '/leads',
    {
      // B2: не больше N заявок в час с одного IP — отдельный счётчик от общего лимита API
      config: { rateLimit: { max: perHour, timeWindow: '1 hour', keyGenerator: (request) => `lead:${request.ip}` } },
      schema: {
        tags: ['leads'],
        summary: 'Заявка: запрос КП или информации',
        description:
          'Проверяются капча (Cloudflare Turnstile) и правило статусов: по превью-продукту — только INFO. ' +
          'Заявка сохраняется, менеджеры получают письмо и сообщение в Telegram. Лимит — 5 заявок в час с IP.',
        body: LeadCreate,
        response: { 201: LeadCreateResponse, 400: ApiError, 422: ApiError, 429: ApiError },
      },
    },
    async (request, reply) => {
      await createLead(deps, request.body, { ip: request.ip, userAgent: request.headers['user-agent'] });
      return reply.code(201).send({ ok: true });
    },
  );
};
