# syntax=docker/dockerfile:1.7
#
# Образ API — он же воркер обработки 3D-моделей и разовая задача миграций (одна сборка, три команды).
# Контекст — корень монорепо:
#
#   docker build -f apps/api/Dockerfile -t apex-api .
#
#   docker run apex-api                                     # API на :4000
#   docker run apex-api node dist/worker.mjs                # воркер BullMQ
#   docker run apex-api sh -c "prisma migrate deploy && node dist/seed.mjs"   # миграции + коллекция

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /repo

# --- Сборка: зависимости только для API и его пакетов, Prisma Client, бандл tsdown ---------------
FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter "@apex/api..."
# prisma generate не ходит в базу, но конфиг требует адрес
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm --filter @apex/api db:generate \
 && pnpm --filter @apex/api build
# Отдельная папка с production-зависимостями одного пакета (внутренние @apex/* уже вшиты в бандл)
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm --filter @apex/api deploy --prod --legacy /out

# --- Рантайм ------------------------------------------------------------------------------------------
FROM node:24-bookworm-slim AS runtime

# KTX-Software: воркер сжимает текстуры загруженных моделей в KTX2 (без него — оставляет WebP)
ARG KTX_VERSION=4.4.2
ADD https://github.com/KhronosGroup/KTX-Software/releases/download/v${KTX_VERSION}/KTX-Software-${KTX_VERSION}-Linux-x86_64.deb /tmp/ktx.deb
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates openssl /tmp/ktx.deb \
 && rm -rf /var/lib/apt/lists/* /tmp/ktx.deb

WORKDIR /app
# Из /out — только production-зависимости: dist у pnpm deploy выпал бы (он в .gitignore), поэтому
# бандл, схему с миграциями и конфиг Prisma кладём явно
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/apps/api/package.json /repo/apps/api/prisma.config.ts ./
COPY --from=build --chown=node:node /repo/apps/api/src/config/load-env.ts ./src/config/load-env.ts
COPY --from=build --chown=node:node /repo/apps/api/prisma ./prisma
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
ENV NODE_ENV=production PATH=/app/node_modules/.bin:$PATH
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||4000)+'/api/v1/platforms?locale=ru').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.mjs"]
