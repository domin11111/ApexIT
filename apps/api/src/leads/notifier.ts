import type { ConfigurationTotals } from '@apex/contracts';
import type { FastifyBaseLogger } from 'fastify';
import nodemailer from 'nodemailer';
import type { Env } from '../config/env';

/** Всё, что нужно менеджеру, чтобы ответить на заявку, не открывая админку. */
export type LeadNotice = {
  id: string;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  message: string | null;
  intent: 'QUOTE' | 'INFO';
  locale: string;
  product: { slug: string; name: string } | null;
  configuration: { shareCode: string; totals: ConfigurationTotals } | null;
};

export interface Notifier {
  leadCreated(lead: LeadNotice): Promise<void>;
}

const INTENT = { QUOTE: 'Запрос коммерческого предложения', INFO: 'Запрос информации' } as const;

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Строки уведомления: [подпись, значение]. Общие для письма и Telegram. */
export function leadLines(lead: LeadNotice, webUrl: string): Array<[string, string]> {
  const lines: Array<[string, string]> = [
    ['Имя', lead.name],
    ['Компания', lead.company ?? '—'],
    ['Почта', lead.email],
    ['Телефон', lead.phone ?? '—'],
  ];
  if (lead.product) lines.push(['Продукт', `${lead.product.name} — ${webUrl}/products/${lead.product.slug}`]);
  if (lead.configuration) {
    const { totals, shareCode } = lead.configuration;
    lines.push([
      'Конфигурация',
      `${totals.cores} ядер · ${totals.memoryGb} ГБ ОЗУ · ${totals.vramGb} ГБ VRAM · ~${totals.totalPowerW} Вт — ${webUrl}/configurator?c=${shareCode}`,
    ]);
  }
  if (lead.message) lines.push(['Сообщение', lead.message]);
  lines.push(['Язык', lead.locale], ['В админке', `${webUrl}/admin/leads/${lead.id}`]);
  return lines;
}

export function leadEmail(lead: LeadNotice, webUrl: string) {
  const lines = leadLines(lead, webUrl);
  const subject = `${INTENT[lead.intent]}: ${lead.name}${lead.company ? `, ${lead.company}` : ''}`;
  const text = [subject, '', ...lines.map(([label, value]) => `${label}: ${value}`)].join('\n');
  const html = `<h2 style="font-family:sans-serif">${escapeHtml(subject)}</h2><table style="font-family:sans-serif;border-collapse:collapse">${lines
    .map(([label, value]) => `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top">${escapeHtml(label)}</td><td style="padding:4px 0">${escapeHtml(value)}</td></tr>`)
    .join('')}</table>`;
  return { subject, text, html };
}

export function leadTelegram(lead: LeadNotice, webUrl: string): string {
  const lines = leadLines(lead, webUrl);
  return [`<b>${escapeHtml(INTENT[lead.intent])}</b>`, ...lines.map(([label, value]) => `<b>${escapeHtml(label)}:</b> ${escapeHtml(value)}`)].join('\n');
}

/**
 * Уведомления менеджерам: письмо (SMTP) и сообщение в Telegram-чат.
 * Каналы независимы: сбой одного не мешает другому; ни один не блокирует ответ посетителю.
 */
export function createNotifier(env: Env, log: FastifyBaseLogger): Notifier {
  const mailer = env.SMTP_URL && env.LEAD_NOTIFY_EMAILS.length > 0 ? nodemailer.createTransport(env.SMTP_URL) : null;
  const telegram = env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID ? { token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID } : null;
  if (!mailer) log.warn('SMTP_URL или LEAD_NOTIFY_EMAILS не заданы — письма о заявках не отправляются');
  if (!telegram) log.info('Telegram не настроен — уведомления только на почту');

  return {
    async leadCreated(lead) {
      const jobs: Array<Promise<unknown>> = [];
      if (mailer) {
        const { subject, text, html } = leadEmail(lead, env.WEB_URL);
        jobs.push(mailer.sendMail({ from: env.MAIL_FROM, to: env.LEAD_NOTIFY_EMAILS, replyTo: lead.email, subject, text, html }));
      }
      if (telegram) {
        jobs.push(
          fetch(`https://api.telegram.org/bot${telegram.token}/sendMessage`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ chat_id: telegram.chatId, text: leadTelegram(lead, env.WEB_URL), parse_mode: 'HTML', disable_web_page_preview: true }),
            signal: AbortSignal.timeout(8000),
          }).then(async (response) => {
            if (!response.ok) throw new Error(`Telegram ответил ${response.status}: ${await response.text()}`);
          }),
        );
      }
      const results = await Promise.allSettled(jobs);
      for (const result of results) {
        if (result.status === 'rejected') log.error({ err: result.reason, leadId: lead.id }, 'Уведомление о заявке не отправлено');
      }
    },
  };
}
