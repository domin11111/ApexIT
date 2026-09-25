import { AdminAsset, AdminLeadPage, AdminMe, AdminProductDetail, ApiError, AuditPage, LoginResponse, ProductDetailDto, TotpSetupResponse, UploadTicket } from '@apex/contracts';
import { Document, NodeIO } from '@gltf-transform/core';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCatalogPublisher } from '../src/admin/publish';
import { runModelJob } from '../src/assets/jobs';
import { CatalogCache } from '../src/cache/catalog-cache';
import { hashPassword } from '../src/security/password';
import { totp } from '../src/security/totp';
import { startHarness, type Harness } from './harness';

let h: Harness;

beforeAll(async () => {
  h = await startHarness();
  await h.prisma.adminUser.createMany({
    data: [
      { email: 'admin@apex.test', role: 'ADMIN', passwordHash: await hashPassword('admin-password-123') },
      { email: 'editor@apex.test', role: 'EDITOR', passwordHash: await hashPassword('editor-password-123') },
    ],
  });
});

afterAll(async () => {
  await h?.stop();
});

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

let clients = 0;

/**
 * Клиент админки: хранит cookie сессии и шлёт заголовок против CSRF, как браузер админки.
 * У каждого клиента свой IP — иначе тесты упрутся в лимит попыток входа (10 за 15 минут с IP).
 */
function adminClient() {
  let cookie = '';
  clients += 1;
  const remoteAddress = `10.1.0.${clients}`;
  const request = async (method: Method, url: string, payload?: unknown, { csrf = true } = {}) => {
    const response: LightMyRequestResponse = await h.app.inject({
      method,
      url,
      remoteAddress,
      headers: { ...(cookie ? { cookie } : {}), ...(csrf && method !== 'GET' ? { 'x-apex-admin': '1' } : {}) },
      ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
    });
    const set = response.cookies.find((c) => c.name === 'apex_admin');
    if (set) cookie = set.value ? `apex_admin=${set.value}` : '';
    const text = response.body;
    return { status: response.statusCode, headers: response.headers, cookies: response.cookies, body: (text && response.headers['content-type']?.includes('json') ? JSON.parse(text) : text) as unknown };
  };
  return { request, login: (email: string, password: string) => request('POST', '/api/admin/auth/login', { email, password }) };
}

const lead = (over: Record<string, unknown> = {}) => ({
  name: 'Анна Петрова',
  company: 'ООО «Вычисления»',
  email: 'Anna@Example.com',
  intent: 'QUOTE',
  productSlug: 'epyc-9965',
  locale: 'ru',
  consent: true,
  captchaToken: 'test-token',
  ...over,
});

const postLead = (payload: unknown, ip: string) =>
  h.app.inject({ method: 'POST', url: '/api/v1/leads', payload: payload as Record<string, unknown>, remoteAddress: ip });

describe('заявки POST /api/v1/leads', () => {
  it('сохраняет заявку и уведомляет менеджеров', async () => {
    const response = await postLead(lead({ message: 'Нужно 4 сервера' }), '10.0.0.1');
    expect(response.statusCode).toBe(201);
    const saved = await h.prisma.lead.findFirstOrThrow({ where: { email: 'anna@example.com' } });
    expect(saved).toMatchObject({ source: 'product', productSlug: 'epyc-9965', status: 'NEW', intent: 'QUOTE' });
    expect(saved.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(h.notices.at(-1)).toMatchObject({ id: saved.id, product: { name: 'AMD EPYC 9965' }, message: 'Нужно 4 сервера' });
  });

  it('honeypot: бот получает «успех», но заявка не сохраняется', async () => {
    const before = await h.prisma.lead.count();
    const response = await postLead(lead({ website: 'http://spam.example', email: 'bot@spam.example' }), '10.0.0.2');
    expect(response.statusCode).toBe(201);
    expect(await h.prisma.lead.count()).toBe(before);
  });

  it('капча не пройдена — 422', async () => {
    h.captcha.pass = false;
    const response = await postLead(lead(), '10.0.0.3');
    h.captcha.pass = true;
    expect(response.statusCode).toBe(422);
    expect(ApiError.parse(response.json()).error.code).toBe('CAPTCHA_FAILED');
  });

  it('B3: по превью-продукту можно только INFO', async () => {
    const quote = await postLead(lead({ productSlug: 'micron-ddr5-512gb-rdimm' }), '10.0.0.4');
    expect(ApiError.parse(quote.json()).error.code).toBe('LEAD_INTENT_NOT_ALLOWED');
    const info = await postLead(lead({ productSlug: 'micron-ddr5-512gb-rdimm', intent: 'INFO' }), '10.0.0.4');
    expect(info.statusCode).toBe(201);
  });

  it('заявка со сборкой из конфигуратора', async () => {
    const payload = { schemaVersion: 1, socket: 'SP5', motherboardId: null, cpu: { slug: 'epyc-9965', count: 1 }, memory: null, gpu: { slug: 'rtx-pro-6000-blackwell', count: 2 } };
    const { shareCode } = (await h.app.inject({ method: 'POST', url: '/api/v1/configurations', payload })).json() as { shareCode: string };
    const response = await postLead(lead({ productSlug: undefined, configurationShareCode: shareCode, email: 'build@example.com' }), '10.0.0.5');
    expect(response.statusCode).toBe(201);
    expect(h.notices.at(-1)?.configuration).toMatchObject({ shareCode, totals: { cores: 192, vramGb: 192 } });
  });

  it('лимит — 5 заявок в час с одного IP', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await postLead(lead({ email: `rate${i}@example.com` }), '10.0.0.9')).statusCode);
    expect(codes).toEqual([201, 201, 201, 201, 201, 429]);
  });
});

describe('вход в админку', () => {
  it('неверный пароль — 401; без сессии — 401', async () => {
    const client = adminClient();
    expect((await client.login('admin@apex.test', 'wrong')).status).toBe(401);
    expect((await client.login('nobody@apex.test', 'whatever')).status).toBe(401);
    expect((await client.request('GET', '/api/admin/products')).status).toBe(401);
  });

  it('подбор пароля: после 10 попыток с IP — 429', async () => {
    const client = adminClient();
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await client.login('admin@apex.test', `guess-${i}`)).status);
    expect(codes.slice(0, 10).every((code) => code === 401)).toBe(true);
    expect(codes[10]).toBe(429);
  });

  it('сессия: httpOnly + SameSite=Strict cookie, выход', async () => {
    const client = adminClient();
    const login = await client.login('ADMIN@apex.test', 'admin-password-123');
    expect(LoginResponse.parse(login.body)).toMatchObject({ next: 'done', me: { email: 'admin@apex.test', role: 'ADMIN' } });
    const cookie = login.cookies.find((c) => c.name === 'apex_admin')!;
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/' });
    expect(login.headers['cache-control']).toBe('no-store');
    // В БД хранится только хеш токена
    expect(await h.prisma.adminSession.count({ where: { tokenHash: cookie.value } })).toBe(0);

    expect((await client.request('GET', '/api/admin/auth/me')).status).toBe(200);
    await client.request('POST', '/api/admin/auth/logout', {});
    expect((await client.request('GET', '/api/admin/auth/me')).status).toBe(401);
  });

  it('меняющий запрос без x-apex-admin отклоняется (CSRF)', async () => {
    const client = adminClient();
    await client.login('admin@apex.test', 'admin-password-123');
    const response = await client.request('POST', '/api/admin/auth/logout', {}, { csrf: false });
    expect(response.status).toBe(403);
    expect(ApiError.parse(response.body).error.code).toBe('CSRF');
  });

  it('TOTP: включение, вход с кодом, повтор кода запрещён', async () => {
    await h.prisma.adminUser.create({ data: { email: 'mfa@apex.test', role: 'EDITOR', passwordHash: await hashPassword('mfa-password-1234') } });
    const client = adminClient();
    await client.login('mfa@apex.test', 'mfa-password-1234');
    const { secret } = TotpSetupResponse.parse((await client.request('POST', '/api/admin/auth/totp/setup', {})).body);
    const stored = await h.prisma.adminUser.findUniqueOrThrow({ where: { email: 'mfa@apex.test' } });
    expect(stored.totpSecret).not.toContain(secret);

    const enableCode = totp(secret);
    expect(AdminMe.parse((await client.request('POST', '/api/admin/auth/totp/enable', { code: enableCode })).body).totpEnabled).toBe(true);
    await client.request('POST', '/api/admin/auth/logout', {});

    const login = await client.login('mfa@apex.test', 'mfa-password-1234');
    expect(LoginResponse.parse(login.body).next).toBe('totp');
    const blocked = await client.request('GET', '/api/admin/products');
    expect(ApiError.parse(blocked.body).error.code).toBe('MFA_REQUIRED');

    // Тот же код уже использован при включении — второй раз не принимается
    expect((await client.request('POST', '/api/admin/auth/totp', { code: enableCode })).status).toBe(401);
    const next = totp(secret, Date.now() + 30_000);
    expect(AdminMe.parse((await client.request('POST', '/api/admin/auth/totp', { code: next })).body).mfaPassed).toBe(true);
    expect((await client.request('GET', '/api/admin/products')).status).toBe(200);
  });

  it('роли: редактор не видит журнал и пользователей', async () => {
    const editor = adminClient();
    await editor.login('editor@apex.test', 'editor-password-123');
    expect((await editor.request('GET', '/api/admin/audit')).status).toBe(403);
    expect((await editor.request('GET', '/api/admin/users')).status).toBe(403);
    expect((await editor.request('GET', '/api/admin/leads')).status).toBe(200);
  });
});

describe('контент: правки видны в публичном API', () => {
  let admin: ReturnType<typeof adminClient>;
  let productId: string;

  beforeAll(async () => {
    admin = adminClient();
    await admin.login('admin@apex.test', 'admin-password-123');
    productId = (await h.prisma.product.findUniqueOrThrow({ where: { slug: 'epyc-9965' } })).id;
  });

  it('PATCH продукта сбрасывает кэш и пишет журнал', async () => {
    // Прогреваем кэш публичного ответа
    await h.app.inject({ method: 'GET', url: '/api/v1/products/epyc-9965?locale=en' });
    const response = await admin.request('PATCH', `/api/admin/products/${productId}`, {
      tagline: { ru: '192 ядра. Одна сущность.', en: '192 cores. One entity. Updated.' },
    });
    expect(response.status).toBe(200);
    const publicEn = ProductDetailDto.parse((await h.app.inject({ method: 'GET', url: '/api/v1/products/epyc-9965?locale=en' })).json());
    expect(publicEn.tagline).toBe('192 cores. One entity. Updated.');

    const journal = AuditPage.parse((await admin.request('GET', '/api/admin/audit?entity=Product')).body);
    const entry = journal.items.find((i) => i.action === 'product.update' && i.entityId === productId);
    expect(entry?.user).toBe('admin@apex.test');
    expect(entry?.diff).toMatchObject({ i18n: { after: { en: { tagline: '192 cores. One entity. Updated.' } } } });
  });

  it('характеристики и хотспоты заменяются целиком', async () => {
    const detail = AdminProductDetail.parse((await admin.request('GET', `/api/admin/products/${productId}`)).body);
    const groups = detail.groups.map((g) =>
      g.key === 'compute' ? { ...g, specs: g.specs.map((s) => (s.key === 'cpu.cores' ? { ...s, value: { ru: '192 ядра', en: '192 cores' } } : s)) } : g,
    );
    expect((await admin.request('PUT', `/api/admin/products/${productId}/specs`, { groups })).status).toBe(200);
    const hotspots = [...detail.hotspots, { ...detail.hotspots[0]!, key: 'new-spot', position: [0.1, 0.2, 0.3] }];
    expect((await admin.request('PUT', `/api/admin/products/${productId}/hotspots`, { hotspots })).status).toBe(200);

    const publicRu = ProductDetailDto.parse((await h.app.inject({ method: 'GET', url: '/api/v1/products/epyc-9965' })).json());
    expect(publicRu.specGroups.flatMap((g) => g.specs).find((s) => s.key === 'cpu.cores')?.value).toBe('192 ядра');
    expect(publicRu.hotspots.at(-1)).toMatchObject({ key: 'new-spot', position: [0.1, 0.2, 0.3] });

    const duplicate = await admin.request('PUT', `/api/admin/products/${productId}/hotspots`, { hotspots: [hotspots[0], hotspots[0]] });
    expect(duplicate.status).toBe(400);
  });

  it('снятие с публикации убирает продукт из публичного API', async () => {
    await admin.request('POST', `/api/admin/products/${productId}/publish`, { published: false });
    expect((await h.app.inject({ method: 'GET', url: '/api/v1/products/epyc-9965' })).statusCode).toBe(404);
    await admin.request('POST', `/api/admin/products/${productId}/publish`, { published: true });
    expect((await h.app.inject({ method: 'GET', url: '/api/v1/products/epyc-9965' })).statusCode).toBe(200);
  });
});

describe('заявки в админке', () => {
  it('список со счётчиками, статус, комментарий, CSV без формул', async () => {
    const admin = adminClient();
    await admin.login('admin@apex.test', 'admin-password-123');
    await postLead(lead({ name: '=HYPERLINK("http://evil")', email: 'csv@example.com' }), '10.0.1.1');

    const page = AdminLeadPage.parse((await admin.request('GET', '/api/admin/leads?limit=2')).body);
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).not.toBeNull();
    expect(page.counts.NEW).toBeGreaterThanOrEqual(4);
    const next = AdminLeadPage.parse((await admin.request('GET', `/api/admin/leads?limit=2&cursor=${page.nextCursor}`)).body);
    expect(next.items[0]?.id).not.toBe(page.items[0]?.id);

    const target = page.items[0]!;
    expect((await admin.request('PATCH', `/api/admin/leads/${target.id}`, { status: 'IN_PROGRESS' })).status).toBe(200);
    const commented = await admin.request('POST', `/api/admin/leads/${target.id}/comments`, { body: 'Позвонил, ждут КП' });
    expect(commented.body).toMatchObject({ status: 'IN_PROGRESS', comments: [{ body: 'Позвонил, ждут КП', author: 'admin@apex.test' }] });

    const csv = await admin.request('GET', '/api/admin/leads/export.csv?q=csv');
    expect(csv.headers['content-type']).toContain('text/csv');
    const text = String(csv.body);
    expect(text.startsWith('﻿')).toBe(true);
    expect(text).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });
});

describe('3D-модели: загрузка → обработка → продукт', () => {
  /** Маленькая GLB-модель: куб из 12 треугольников с именованным узлом */
  async function cubeGlb(): Promise<Uint8Array> {
    const doc = new Document();
    const buffer = doc.createBuffer();
    const positions = new Float32Array([-1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1]);
    const indices = new Uint16Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 0, 4, 7, 0, 7, 3]);
    const primitive = doc
      .createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(indices).setBuffer(buffer))
      .setMaterial(doc.createMaterial('metal').setMetallicFactor(1));
    doc.createScene('scene').addChild(doc.createNode('ihs').setMesh(doc.createMesh('cube').addPrimitive(primitive)));
    return new NodeIO().writeBinary(doc);
  }

  it('полный путь модели', async () => {
    const admin = adminClient();
    await admin.login('admin@apex.test', 'admin-password-123');

    const ticket = UploadTicket.parse((await admin.request('POST', '/api/admin/assets/uploads', { fileName: 'venice.glb', sizeBytes: 2048 })).body);
    expect(ticket.headers['content-type']).toBe('model/gltf-binary');
    // «Браузер» кладёт файл по presigned URL — в тесте прямо в хранилище
    const complete0 = await admin.request('POST', `/api/admin/assets/${ticket.assetId}/complete`, {});
    expect(complete0.status).toBe(409);
    await h.storage.put(`uploads/${ticket.assetId}/source.glb`, await cubeGlb(), 'model/gltf-binary');
    expect(AdminAsset.parse((await admin.request('POST', `/api/admin/assets/${ticket.assetId}/complete`, {})).body).status).toBe('PROCESSING');
    expect(h.queued).toContain(ticket.assetId);

    // Модель ещё не готова — назначить продукту нельзя
    const product = await h.prisma.product.findUniqueOrThrow({ where: { slug: 'epyc-9996-venice' } });
    expect((await admin.request('PATCH', `/api/admin/products/${product.id}`, { modelAssetId: ticket.assetId })).status).toBe(409);

    // Задача воркера (без KTX-Software в тестовой среде)
    const publisher = createCatalogPublisher({ cache: new CatalogCache(h.redis, 60, h.app.log), webUrl: 'http://web.test', secret: undefined, log: h.app.log });
    await runModelJob({ prisma: h.prisma, storage: h.storage, publisher, ktxDir: undefined, log: h.app.log }, ticket.assetId);
    const ready = AdminAsset.parse((await admin.request('GET', `/api/admin/assets/${ticket.assetId}`)).body);
    expect(ready.status).toBe('READY');
    expect(ready.meta).toMatchObject({ source: { triangles: 12, nodes: ['ihs'] }, desktop: { triangles: 12 } });
    expect(ready.variants.map((v) => v.variant)).toEqual(['MOBILE']);
    expect(ready.url).toMatch(/^http:\/\/assets\.test\/public\/models\/.+\/desktop-[0-9a-f]{12}\.glb$/);
    expect(h.storage.objects.get(ready.url.replace('http://assets.test/', ''))?.contentType).toBe('model/gltf-binary');

    // Манифест и назначение продукту → модель в публичном API
    expect((await admin.request('PATCH', `/api/admin/assets/${ticket.assetId}`, { manifest: { rotation: [0, 90, 0], nodes: { ihs: 'ihs' } } })).status).toBe(200);
    expect((await admin.request('PATCH', `/api/admin/products/${product.id}`, { modelAssetId: ticket.assetId })).status).toBe(200);
    const venice = ProductDetailDto.parse((await h.app.inject({ method: 'GET', url: '/api/v1/products/epyc-9996-venice' })).json());
    expect(venice.models.map((m) => m.variant).sort()).toEqual(['DESKTOP', 'MOBILE']);
    expect(venice.models.find((m) => m.variant === 'DESKTOP')?.meta).toMatchObject({ manifest: { rotation: [0, 90, 0] } });

    // Используемую модель удалить нельзя
    expect((await admin.request('DELETE', `/api/admin/assets/${ticket.assetId}`)).status).toBe(409);
  });

  it('битый файл — FAILED с объяснением', async () => {
    const admin = adminClient();
    await admin.login('admin@apex.test', 'admin-password-123');
    const ticket = UploadTicket.parse((await admin.request('POST', '/api/admin/assets/uploads', { fileName: 'broken.glb', sizeBytes: 10 })).body);
    await h.storage.put(`uploads/${ticket.assetId}/source.glb`, new TextEncoder().encode('not a glb'), 'model/gltf-binary');
    const publisher = createCatalogPublisher({ cache: new CatalogCache(h.redis, 60, h.app.log), webUrl: 'http://web.test', secret: undefined, log: h.app.log });
    await runModelJob({ prisma: h.prisma, storage: h.storage, publisher, ktxDir: undefined, log: h.app.log }, ticket.assetId);
    const failed = AdminAsset.parse((await admin.request('GET', `/api/admin/assets/${ticket.assetId}`)).body);
    expect(failed.status).toBe('FAILED');
    expect(String(failed.meta.error)).toContain('glTF');
  });
});

describe('пользователи', () => {
  it('администратор заводит и отключает редактора; отключённый выходит из сессий', async () => {
    const admin = adminClient();
    await admin.login('admin@apex.test', 'admin-password-123');
    const created = await admin.request('POST', '/api/admin/users', { email: 'New@apex.test', role: 'EDITOR', password: 'new-editor-password' });
    expect(created.status).toBe(201);
    const id = (created.body as { id: string }).id;

    const editor = adminClient();
    await editor.login('new@apex.test', 'new-editor-password');
    expect((await editor.request('GET', '/api/admin/leads')).status).toBe(200);

    expect((await admin.request('PATCH', `/api/admin/users/${id}`, { isActive: false })).status).toBe(200);
    expect((await editor.request('GET', '/api/admin/leads')).status).toBe(401);

    const me = AdminMe.parse((await admin.request('GET', '/api/admin/auth/me')).body);
    expect((await admin.request('PATCH', `/api/admin/users/${me.id}`, { role: 'EDITOR' })).status).toBe(400);
  });
});
