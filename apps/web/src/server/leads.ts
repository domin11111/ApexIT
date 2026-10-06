import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import type { ConfigurationTotals, LeadCreate } from '@apex/contracts';
import { isOrderable } from '@apex/contracts/status';
import { DomainError } from '@apex/domain';
import { mockCatalog } from '@/lib/catalog';
import { SITE_URL } from '@/lib/site';
import { appendLead } from './data';
import { HttpError } from './http';
import { localConfigurator } from './services';

/*
 * Приём заявки без API и базы — та же логика, что у apps/api (leads/service.ts):
 * honeypot → капча → продукт и сборка из ссылок → правило B3 (по превью — только запрос
 * информации) → запись в журнал → уведомление в Telegram в фоне.
 */

const INTENT = { QUOTE: 'Запрос коммерческого предложения', INFO: 'Запрос информации' } as const;
const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Cloudflare Turnstile. Без секрета проверка выключена (разработка); недоступность Cloudflare — отказ. */
async function captchaPassed(token: string, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) return true;
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token, ...(ip === 'local' ? {} : { remoteip: ip }) }),
      signal: AbortSignal.timeout(5000),
    });
    return ((await response.json()) as { success?: boolean }).success === true;
  } catch (error) {
    console.error('[leads] Turnstile недоступен', error);
    return false;
  }
}

type Notice = {
  id: string;
  input: LeadCreate;
  product: { slug: string; name: string } | null;
  configuration: { shareCode: string; totals: ConfigurationTotals } | null;
};

function telegramText({ input, product, configuration }: Notice): string {
  const lines: Array<[string, string]> = [
    ['Имя', input.name],
    ['Компания', input.company || '—'],
    ['Почта', input.email],
    ['Телефон', input.phone || '—'],
  ];
  if (product) lines.push(['Продукт', `${product.name} — ${SITE_URL}/products/${product.slug}`]);
  if (configuration) {
    const { totals, shareCode } = configuration;
    lines.push(['Конфигурация', `${totals.cores} ядер · ${totals.memoryGb} ГБ ОЗУ · ${totals.vramGb} ГБ VRAM · ~${totals.totalPowerW} Вт — ${SITE_URL}/configurator?c=${shareCode}`]);
  }
  if (input.message) lines.push(['Сообщение', input.message]);
  lines.push(['Язык', input.locale]);
  return [`<b>${escapeHtml(INTENT[input.intent])}</b>`, ...lines.map(([label, value]) => `<b>${escapeHtml(label)}:</b> ${escapeHtml(value)}`)].join('\n');
}

async function notifyTelegram(notice: Notice): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn('[leads] Telegram не настроен — заявка только в журнале', notice.id);
    return;
  }
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: telegramText(notice), parse_mode: 'HTML', link_preview_options: { is_disabled: true } }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Telegram ответил ${response.status}`);
}

export async function createLead(input: LeadCreate, ip: string, userAgent: string | null): Promise<void> {
  // Honeypot заполнен — бот. Отвечаем «успехом», чтобы он не понял, что его вычислили
  if (input.website) return;

  if (!(await captchaPassed(input.captchaToken, ip))) {
    throw new HttpError(422, 'CAPTCHA_FAILED', 'Не удалось подтвердить, что вы не робот — обновите страницу и попробуйте ещё раз');
  }

  let product: Notice['product'] = null;
  if (input.productSlug) {
    try {
      const found = await mockCatalog().getProduct(input.productSlug, 'ru');
      if (input.intent === 'QUOTE' && !isOrderable(found.status)) {
        throw new HttpError(422, 'LEAD_INTENT_NOT_ALLOWED', 'Этот продукт — превью: по нему можно запросить только информацию');
      }
      product = { slug: found.slug, name: `${found.brand} ${found.name}` };
    } catch (error) {
      if (error instanceof DomainError) throw new HttpError(422, 'LEAD_UNKNOWN_PRODUCT', 'Продукт из заявки не найден');
      throw error;
    }
  }

  let configuration: Notice['configuration'] = null;
  if (input.configurationShareCode) {
    const configurator = localConfigurator();
    const saved = await configurator.load(input.configurationShareCode).catch((error: unknown) => {
      if (error instanceof DomainError) throw new HttpError(422, 'LEAD_UNKNOWN_CONFIGURATION', 'Сборка из заявки не найдена');
      throw error;
    });
    if (input.intent === 'QUOTE' && !(await configurator.validate(saved.payload, 'ru')).orderable) {
      throw new HttpError(422, 'LEAD_INTENT_NOT_ALLOWED', 'В сборке есть превью-продукт: по ней можно запросить только информацию');
    }
    configuration = { shareCode: saved.shareCode, totals: saved.totals };
  }

  const id = randomUUID();
  // Без капчи, honeypot и согласия — они своё отработали; IP — только хешем, как в API
  const { captchaToken: _captcha, website: _website, consent: _consent, ...fields } = input;
  await appendLead({
    id,
    at: new Date().toISOString(),
    ...fields,
    email: input.email.toLowerCase(),
    ipHash: createHash('sha256').update(`${process.env.LEAD_IP_SALT ?? ''}:${ip}`).digest('hex').slice(0, 32),
    userAgent: userAgent?.slice(0, 300) ?? null,
  });

  // Уведомление не задерживает ответ посетителю: заявка уже в журнале
  void notifyTelegram({ id, input, product, configuration }).catch((error: unknown) => console.error('[leads] Telegram:', id, error));
}
