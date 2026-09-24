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
│  └─ web/                    Next.js 16 + React Three Fiber + GSAP + Lenis
├─ packages/
│  ├─ contracts/              Zod-схемы API и общие перечисления (единый источник истины)
│  ├─ domain/                 логика каталога без фреймворка: DTO, локализация, сравнение
│  ├─ collection/             данные коллекции: вход для сида и MSW-моков фронта
│  ├─ mocks/                  MSW-обработчики /api/v1 для фронта до готовности бэкенда
│  ├─ ui/                     дизайн-токены (TS + CSS для Tailwind 4), позже — компоненты
│  └─ config/                 общие tsconfig и ESLint
├─ docker-compose.yml         PostgreSQL 17, Redis 7
└─ turbo.json
```

Внутренние пакеты отдают TypeScript-исходники напрямую (без сборки): Next.js транспилирует их
через `transpilePackages`, API запускается через `tsx` и собирается бандлером.

## Быстрый старт

Требуется Node.js 24 LTS (минимум 22.12, см. `.nvmrc`), pnpm 10.34 (`npm i -g pnpm@10.34.5`
или `corepack enable`) и Docker Desktop с WSL 2.

Для VS Code в `.vscode/extensions.json` перечислены рекомендуемые расширения: Prisma, ESLint,
Prettier, Tailwind CSS, EditorConfig, Vitest, Docker, GLSL.

```bash
cp .env.example .env
pnpm install
pnpm infra:up          # PostgreSQL + Redis
pnpm db:migrate        # применить схему (первый запуск создаст миграцию init)
pnpm db:seed           # залить коллекцию
pnpm test              # токены ↔ CSS, данные коллекции ↔ бриф
pnpm typecheck
```

## API

```bash
pnpm --filter @apex/api dev       # http://localhost:4000, документация — /docs
pnpm --filter @apex/api build     # бандл dist/server.mjs (tsdown)
pnpm --filter @apex/api openapi   # выгрузить apps/api/openapi.json
```

| Метод | Путь | Что отдаёт |
|---|---|---|
| GET | `/api/v1/products?category=&status=&locale=` | продукты коллекции |
| GET | `/api/v1/products/:slug?locale=` | продукт: характеристики, хотспоты, модели, совместимость |
| GET | `/api/v1/compare?slugs=a,b[,c]&locale=` | таблица сравнения с лучшими значениями и долями для баров |
| GET | `/api/v1/platforms?locale=` | сокеты SP5 / SP7 |
| GET | `/api/v1/platforms/:socket/motherboards?locale=` | материнские платы платформы |
| GET | `/health` | состояние БД и кэша |

Ответы каталога кэшируются в Redis (5 минут, сброс — инкремент версии каталога), отдаются
с ETag (`If-None-Match` → 304) и `Cache-Control: public, max-age=60, stale-while-revalidate=300`.
Без Redis API продолжает работать — из БД, без кэша и лимитов. Ошибки — в едином формате
`{ error: { code, message, details?, requestId } }`.

Архитектура: сценарии каталога живут в `@apex/domain` и работают поверх `CatalogSource`.
API подставляет источник на Prisma, моки — источник в памяти на тех же записях коллекции,
поэтому ответы совпадают по построению; интеграционный тест сверяет их побайтно.

## Фронтенд

```bash
pnpm --filter @apex/web dev       # http://localhost:3000 (ru), /en — английская версия
```

Без `API_URL` в `apps/web/.env.local` серверные компоненты берут данные из встроенного сервиса
каталога (те же ответы, что у API), а запросы из браузера перехватывает MSW. `/lab` — служебная
страница (noindex): все модели, разлёт, подсветка, свет и список узлов для хотспотов.

- **Сцена.** Один фиксированный canvas под HTML-секциями; скролл управляет им через `scrollState`.
  Качество адаптивное: `PerformanceMonitor` переключает high → medium (без bloom) → low (без постобработки).
- **Прелоадер** показывает реальный прогресс загрузки 3D-ассетов и укладывается в 2,5 с.
- **Доступность.** Весь текст — HTML; при `prefers-reduced-motion` нет плавного скролла,
  интро и собственного курсора; без WebGL — статичный фолбэк.

### 3D-модели

Процедурные модели (`apps/web/src/three/models/procedural`) и готовые GLB подчиняются одному
контракту (`rig.ts`): имена узлов для хотспотов, `userData.explode` для разобранного вида,
`userData.glow` для подсветки, `userData.spin` для вентиляторов. Сцены управляют моделью только
через `RigControls`, поэтому замена процедурной модели на GLB не требует правок сцен.

Готовую модель подключают через `ModelSource { url, manifest }`: манифест (`glb.ts`) поворачивает
модель к нашим осям, переименовывает узлы и добавляет разметку разлёта. Масштаб нормализуется
автоматически. Для моделей под CC-BY в манифесте указывается автор — он выводится в титрах.

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
