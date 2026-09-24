import type { SwaggerTransformObject } from '@fastify/swagger';
import { jsonSchemaTransformObject } from 'fastify-type-provider-zod';

/** Интересующая нас часть документа OpenAPI 3.x (тип плагина включает ещё и Swagger 2.0). */
type OpenapiDocument = {
  paths?: unknown;
  components?: { schemas?: Record<string, unknown> } & Record<string, unknown>;
};

const refsIn = (value: unknown): string[] =>
  [...JSON.stringify(value ?? null).matchAll(/#\/components\/schemas\/([\w.-]+)/g)].flatMap((m) => (m[1] ? [m[1]] : []));

/**
 * fastify-type-provider-zod кладёт в components каждую именованную схему дважды:
 * как ответ (`Spec`) и как вход (`SpecInput`). Входные варианты оставляем, только если
 * на них реально ссылаются маршруты (тела POST появятся на следующих этапах).
 */
export const transformObject: SwaggerTransformObject = (document) => {
  const openapi = jsonSchemaTransformObject(document) as OpenapiDocument;
  const schemas = openapi.components?.schemas;
  if (!schemas) return openapi as ReturnType<SwaggerTransformObject>;

  const reachable = new Set<string>();
  const queue = refsIn(openapi.paths);
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    queue.push(...refsIn(schemas[id]));
  }

  const pruned: OpenapiDocument = {
    ...openapi,
    components: {
      ...openapi.components,
      schemas: Object.fromEntries(Object.entries(schemas).filter(([id]) => !id.endsWith('Input') || reachable.has(id))),
    },
  };
  return pruned as ReturnType<SwaggerTransformObject>;
};
