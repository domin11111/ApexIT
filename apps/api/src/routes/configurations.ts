import {
  ApiError,
  ConfigurationPayload,
  CreateConfigurationResponse,
  LocaleQuery,
  SavedConfigurationDto,
  ShareCode,
  ValidateConfigurationResponse,
} from '@apex/contracts';
import type { ConfiguratorService } from '@apex/domain';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

export const configurationRoutes: FastifyPluginAsyncZod<{ configurator: ConfiguratorService }> = async (
  app,
  { configurator },
) => {
  app.post(
    '/configurations/validate',
    {
      schema: {
        tags: ['configurator'],
        summary: 'Проверка совместимости сборки',
        description:
          'Правила движка: сокет CPU ↔ платформа, число сокетов, TDP против лимита платы, слоты и ёмкость памяти, ' +
          'баланс каналов, слоты PCIe x16. Возвращает проблемы с объяснениями, итоги (ядра, память, VRAM, ватты) и лимиты.',
        querystring: LocaleQuery,
        body: ConfigurationPayload,
        response: { 200: ValidateConfigurationResponse, 400: ApiError, 404: ApiError, 429: ApiError },
      },
    },
    async (request) => configurator.validate(request.body, request.query.locale),
  );

  app.post(
    '/configurations',
    {
      // Запись в БД — лимит строже общего
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        tags: ['configurator'],
        summary: 'Сохранить сборку и получить код для ссылки',
        description:
          'Сохраняется только совместимая сборка (иначе 422 со списком ошибок). Код детерминирован: ' +
          'та же сборка всегда получает ту же ссылку.',
        body: ConfigurationPayload,
        response: { 201: CreateConfigurationResponse, 400: ApiError, 404: ApiError, 422: ApiError, 429: ApiError },
      },
    },
    async (request, reply) => reply.code(201).send(await configurator.save(request.body)),
  );

  app.get(
    '/configurations/:shareCode',
    {
      schema: {
        tags: ['configurator'],
        summary: 'Сохранённая сборка по коду',
        params: z.object({ shareCode: ShareCode }),
        response: { 200: SavedConfigurationDto, 400: ApiError, 404: ApiError, 429: ApiError },
      },
    },
    async (request, reply) => {
      const saved = await configurator.load(request.params.shareCode);
      // Код выводится из содержимого сборки — ответ по нему никогда не меняется
      reply.header('cache-control', 'public, max-age=86400, immutable');
      return saved;
    },
  );
};
