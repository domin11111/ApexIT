import type { ApiError } from '@apex/contracts';
import { DomainError } from '@apex/domain';
import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod';

export function apiError(code: string, message: string, requestId: string, details?: unknown): ApiError {
  return { error: { code, message, requestId, ...(details === undefined ? {} : { details }) } };
}

/** Все ошибки наружу — в едином формате ApiError, внутренности — только в лог. */
export function registerErrorHandlers(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply
        .code(400)
        .send(apiError('VALIDATION_ERROR', 'Некорректные параметры запроса', request.id, error.validation));
    }

    if (error instanceof DomainError) {
      return reply.code(error.status).send(error.toApiError(request.id));
    }

    if (isResponseSerializationError(error)) {
      // Ответ не прошёл контракт — это баг сервера, клиенту деталей не показываем.
      request.log.error({ err: error, issues: error.cause.issues }, 'Ответ не соответствует контракту');
      return reply.code(500).send(apiError('INTERNAL_ERROR', 'Внутренняя ошибка сервера', request.id));
    }

    // Остальное — ошибки Fastify и плагинов (rate limit, битый JSON и т. п.)
    const { statusCode, code, message } = (error ?? {}) as Partial<FastifyError>;
    const status = typeof statusCode === 'number' ? statusCode : 500;
    if (status === 429) {
      return reply.code(429).send(apiError('RATE_LIMITED', 'Слишком много запросов — попробуйте позже', request.id));
    }
    if (status < 500) {
      return reply.code(status).send(apiError(code || 'BAD_REQUEST', message ?? 'Некорректный запрос', request.id));
    }

    request.log.error({ err: error }, 'Необработанная ошибка');
    return reply.code(500).send(apiError('INTERNAL_ERROR', 'Внутренняя ошибка сервера', request.id));
  });

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send(apiError('NOT_FOUND', `Маршрут ${request.method} ${request.url} не найден`, request.id)),
  );
}
