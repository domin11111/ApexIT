import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LeadCreate } from '@apex/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Приём заявки без API (боевая копия на lenivec.online): та же логика, что у apps/api —
 * honeypot, капча, правило B3, журнал и Telegram. Сеть подменена: тест ничего никуда не шлёт.
 */

let dataDir: string;
const fetchMock = vi.fn<typeof fetch>();

const lead = (patch: Partial<LeadCreate> = {}): LeadCreate => ({
  name: 'Анна Петрова',
  email: 'Anna@Example.com',
  intent: 'INFO',
  locale: 'ru',
  consent: true,
  captchaToken: 'token',
  ...patch,
});

/** Модули читают окружение при импорте — грузим заново под каждый тест. */
async function load(env: Record<string, string> = {}) {
  vi.resetModules();
  vi.stubEnv('APEX_DATA_DIR', dataDir);
  vi.stubEnv('TURNSTILE_SECRET', '');
  vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
  vi.stubEnv('TELEGRAM_CHAT_ID', '');
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return import('./leads');
}

const journal = () => {
  try {
    return readFileSync(join(dataDir, 'leads.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
  } catch {
    return [];
  }
};

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'apex-leads-'));
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('createLead', () => {
  it('honeypot: «успех» для бота, но ни записи, ни уведомления', async () => {
    const { createLead } = await load({ TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '1' });
    await createLead(lead({ website: 'http://spam' }), '1.2.3.4', null);
    expect(journal()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('заявка пишется в журнал без капчи и согласия, почта — строчными, IP — только хешем', async () => {
    const { createLead } = await load();
    await createLead(lead({ productSlug: 'epyc-9965', intent: 'QUOTE' }), '1.2.3.4', 'Mozilla/5.0');
    const [saved] = journal();
    expect(saved).toMatchObject({ name: 'Анна Петрова', email: 'anna@example.com', productSlug: 'epyc-9965', intent: 'QUOTE', userAgent: 'Mozilla/5.0' });
    expect(saved).not.toHaveProperty('captchaToken');
    expect(saved).not.toHaveProperty('consent');
    expect(JSON.stringify(saved)).not.toContain('1.2.3.4');
  });

  it('правило B3: по превью (Micron, PREVIEW) нельзя запросить КП — только информацию', async () => {
    const { createLead } = await load();
    await expect(createLead(lead({ productSlug: 'micron-ddr5-512gb-rdimm', intent: 'QUOTE' }), 'ip', null)).rejects.toMatchObject({
      status: 422,
      code: 'LEAD_INTENT_NOT_ALLOWED',
    });
    await createLead(lead({ productSlug: 'micron-ddr5-512gb-rdimm', intent: 'INFO' }), 'ip', null);
    // Venice — COMING_SOON: «скоро», но заказать уже можно
    await createLead(lead({ productSlug: 'epyc-9996-venice', intent: 'QUOTE' }), 'ip', null);
    expect(journal()).toHaveLength(2);
  });

  it('неизвестные продукт и сборка — 422 с понятным кодом', async () => {
    const { createLead } = await load();
    await expect(createLead(lead({ productSlug: 'no-such-product' }), 'ip', null)).rejects.toMatchObject({ code: 'LEAD_UNKNOWN_PRODUCT' });
    await expect(createLead(lead({ configurationShareCode: 'aaaaaaaaaa' }), 'ip', null)).rejects.toMatchObject({ code: 'LEAD_UNKNOWN_CONFIGURATION' });
  });

  it('капча: Turnstile отказал — 422 и ничего не записано', async () => {
    const { createLead } = await load({ TURNSTILE_SECRET: 'secret' });
    fetchMock.mockResolvedValueOnce(Response.json({ success: false }));
    await expect(createLead(lead(), '1.2.3.4', null)).rejects.toMatchObject({ code: 'CAPTCHA_FAILED' });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('challenges.cloudflare.com');
    expect(journal()).toEqual([]);
  });

  it('уведомление в Telegram: HTML с экранированием и ссылкой на продукт', async () => {
    const { createLead } = await load({ TELEGRAM_BOT_TOKEN: 'bot-token', TELEGRAM_CHAT_ID: '42' });
    fetchMock.mockResolvedValueOnce(Response.json({ ok: true }));
    await createLead(lead({ productSlug: 'epyc-9965', message: '<script>' }), 'ip', null);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://api.telegram.org/botbot-token/sendMessage');
    const body = JSON.parse(String(init?.body)) as { chat_id: string; text: string; parse_mode: string };
    expect(body).toMatchObject({ chat_id: '42', parse_mode: 'HTML' });
    expect(body.text).toContain('&lt;script&gt;');
    expect(body.text).toContain('/products/epyc-9965');
  });

  it('Telegram недоступен — заявка всё равно принята и лежит в журнале', async () => {
    const { createLead } = await load({ TELEGRAM_BOT_TOKEN: 'bot-token', TELEGRAM_CHAT_ID: '42' });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    await createLead(lead(), 'ip', null);
    expect(journal()).toHaveLength(1);
    await vi.waitFor(() => expect(errors).toHaveBeenCalled());
  });
});

describe('POST /api/v1/leads', () => {
  const post = (route: { POST: (r: Request) => Promise<Response> }, body: unknown, ip = '5.6.7.8') =>
    route.POST(new Request('http://localhost/api/v1/leads', { method: 'POST', headers: { 'x-real-ip': ip }, body: typeof body === 'string' ? body : JSON.stringify(body) }));

  it('201 и no-store; не JSON и невалидная схема — 400', async () => {
    await load();
    const route = await import('@/app/api/v1/leads/route');
    const ok = await post(route, lead());
    expect(ok.status).toBe(201);
    expect(ok.headers.get('cache-control')).toBe('no-store');
    expect((await post(route, '{oops', '9.9.9.9')).status).toBe(400);
    expect((await post(route, { name: 'x' }, '9.9.9.8')).status).toBe(400);
  });

  it('не больше 5 заявок в час с одного IP', async () => {
    await load();
    const route = await import('@/app/api/v1/leads/route');
    for (let i = 0; i < 5; i++) expect((await post(route, lead())).status).toBe(201);
    const limited = await post(route, lead());
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });
    // Другой IP — свой счётчик
    expect((await post(route, lead(), '10.0.0.1')).status).toBe(201);
  });
});
