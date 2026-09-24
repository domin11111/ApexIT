# APEX // Compute Collection

Сайт-премьера флагманских серверных комплектующих 2026 года: AMD EPYC 9996 «Venice», AMD EPYC 9965,
Micron 512GB DDR5 RDIMM, NVIDIA RTX PRO 6000 Blackwell.

## Структура

```
.
├─ apps/
│  ├─ api/                    Fastify 5 + Prisma 7 + PostgreSQL          (этап 2)
│  │  ├─ prisma/
│  │  │  ├─ schema.prisma     модель данных
│  │  │  └─ seed.ts           сид из @apex/collection
│  │  ├─ prisma.config.ts     подключение к БД, путь миграций, команда сида
│  │  └─ src/db/enum-parity.ts  compile-time проверка: enum'ы Prisma ≡ @apex/contracts
│  └─ web/                    Next.js 15 + R3F + GSAP                    (этап 3)
├─ packages/
│  ├─ contracts/              Zod-схемы API и общие перечисления (единый источник истины)
│  ├─ collection/             данные коллекции: вход для сида и MSW-моков фронта
│  ├─ ui/                     дизайн-токены (TS + CSS для Tailwind 4), позже — компоненты
│  └─ config/                 общие tsconfig и ESLint
├─ docker-compose.yml         PostgreSQL 17, Redis 7
└─ turbo.json
```

Внутренние пакеты отдают TypeScript-исходники напрямую (без сборки): Next.js транспилирует их
через `transpilePackages`, API запускается через `tsx` и собирается бандлером.

## Быстрый старт

Требуется Node.js ≥ 22.12, pnpm 10 (через `corepack enable`) и Docker.

```bash
cp .env.example .env
pnpm install
pnpm infra:up          # PostgreSQL + Redis
pnpm db:migrate        # применить схему (первый запуск создаст миграцию init)
pnpm db:seed           # залить коллекцию
pnpm test              # токены ↔ CSS, данные коллекции ↔ бриф
pnpm typecheck
```

## Договорённости

- **Локализация в БД.** Базовые текстовые колонки — на ru, переводы — в JSON-колонке `i18n`
  (`{ "en": { "title": "…" } }`). API отдаёт тексты уже под нужную локаль.
- **Характеристики.** `Spec.value` — готовая строка для показа, `numericValue` + `unit` — число
  в каноничной единице для счётчиков и `/compare`. Ключи — из реестра `SPEC_KEYS`.
- **3D-модели.** Пока у продукта нет GLB, фронт рисует процедурную модель по `modelPreset`.
  Хотспоты привязаны к именам узлов (`anchorNode`), общим для процедурной модели и GLB, поэтому
  замена модели через админку не требует правок кода.
- **Статусы.** `ProductStatus` + `STATUS_META` в `@apex/contracts` — одно перечисление для бейджей,
  CTA и правил движка (PREVIEW → только «запросить информацию»).

## Товарные знаки

AMD, EPYC, Micron, NVIDIA, RTX, Blackwell — товарные знаки их владельцев. До получения прав
на пресс-материалы используются собственные стилизованные 3D-модели без логотипов.
Характеристики неанонсированных и preview-продуктов могут измениться.
