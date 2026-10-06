# syntax=docker/dockerfile:1.7
#
# Образ сайта: Next.js в режиме standalone. Контекст — корень монорепо:
#
#   docker build -f apps/web/Dockerfile -t apex-web \
#     --build-arg NEXT_PUBLIC_SITE_URL=https://example.com \
#     --build-arg NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x... .
#
# Переменные NEXT_PUBLIC_* вшиваются в бандл при сборке — поэтому они build-arg, а не env.
# API_URL — в рантайме: страницы собираются из встроенного каталога (API при сборке недоступен),
# а дальше ISR освежает их из API. Без API_URL сайт работает сам: заявки и сборки принимают
# его маршруты app/api/v1 (данные — в томе /data).

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter "@apex/web..."

ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=
# Под префиксом, как на lenivec.online: --build-arg BASE_PATH=/app/components
ARG BASE_PATH=
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY \
    BASE_PATH=$BASE_PATH \
    NEXT_OUTPUT=standalone \
    NEXT_PUBLIC_API_URL= \
    NEXT_PUBLIC_API_MOCKING=disabled \
    API_URL=
RUN pnpm --filter @apex/web build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 APEX_DATA_DIR=/data
# standalone — сервер и только нужные зависимости; статику и public Next туда не кладёт
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
RUN mkdir /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000'+(process.env.BASE_PATH||'')+'/icon.svg').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
