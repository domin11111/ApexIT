import { ConfigurationPayload, ConfigurationTotals, type LeadCreate } from '@apex/contracts';
import { isOrderable } from '@apex/contracts/status';
import type { ConfiguratorService } from '@apex/domain';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../db/prisma';
import { HttpError } from '../http/errors';
import { hashIp } from '../security/crypto';
import type { CaptchaVerifier } from './captcha';
import type { Notifier } from './notifier';

export type LeadDeps = {
  prisma: Db;
  captcha: CaptchaVerifier;
  notifier: Notifier;
  configurator: ConfiguratorService;
  ipSalt: string;
  log: FastifyBaseLogger;
};

export type LeadContext = { ip: string; userAgent: string | undefined };

/** Что произошло с заявкой — для логов и тестов; клиент всегда получает одинаковый ответ. */
export type LeadOutcome = { kind: 'saved'; id: string } | { kind: 'honeypot' };

/**
 * Приём заявки (F7, B2): honeypot → капча → продукт и сборка из ссылок → правило B3
 * (PREVIEW — только «запросить информацию») → сохранение → уведомления в фоне.
 */
export async function createLead(deps: LeadDeps, input: LeadCreate, context: LeadContext): Promise<LeadOutcome> {
  // Honeypot заполнен — бот. Отвечаем «успехом», чтобы он не понял, что его вычислили
  if (input.website) {
    deps.log.info({ ip: hashIp(context.ip, deps.ipSalt) }, 'Заявка отброшена honeypot');
    return { kind: 'honeypot' };
  }

  if (!(await deps.captcha(input.captchaToken, context.ip))) {
    throw new HttpError(422, 'CAPTCHA_FAILED', 'Не удалось подтвердить, что вы не робот — обновите страницу и попробуйте ещё раз');
  }

  const product = input.productSlug
    ? await deps.prisma.product.findFirst({
        where: { slug: input.productSlug, publishedAt: { not: null } },
        select: { slug: true, brand: true, name: true, status: true },
      })
    : null;
  if (input.productSlug && !product) throw new HttpError(422, 'LEAD_UNKNOWN_PRODUCT', 'Продукт из заявки не найден');
  if (product && input.intent === 'QUOTE' && !isOrderable(product.status)) {
    throw new HttpError(422, 'LEAD_INTENT_NOT_ALLOWED', 'Этот продукт — превью: по нему можно запросить только информацию');
  }

  const configuration = input.configurationShareCode
    ? await deps.prisma.configuration.findUnique({ where: { shareCode: input.configurationShareCode } })
    : null;
  if (input.configurationShareCode && !configuration) {
    throw new HttpError(422, 'LEAD_UNKNOWN_CONFIGURATION', 'Сборка из заявки не найдена');
  }
  const payload = configuration ? ConfigurationPayload.parse(configuration.payload) : null;
  if (payload && input.intent === 'QUOTE' && !(await deps.configurator.validate(payload, 'ru')).orderable) {
    throw new HttpError(422, 'LEAD_INTENT_NOT_ALLOWED', 'В сборке есть превью-продукт: по ней можно запросить только информацию');
  }

  const lead = await deps.prisma.lead.create({
    data: {
      name: input.name,
      company: input.company || null,
      email: input.email.toLowerCase(),
      phone: input.phone || null,
      message: input.message || null,
      intent: input.intent,
      productSlug: product?.slug ?? null,
      configurationId: configuration?.id ?? null,
      source: configuration ? 'configurator' : product ? 'product' : 'request',
      locale: input.locale,
      ipHash: hashIp(context.ip, deps.ipSalt),
      userAgent: context.userAgent?.slice(0, 300) ?? null,
    },
  });

  // Уведомления не задерживают ответ посетителю; ошибки каналов пишет сам notifier
  void deps.notifier
    .leadCreated({
      id: lead.id,
      name: lead.name,
      company: lead.company,
      email: lead.email,
      phone: lead.phone,
      message: lead.message,
      intent: lead.intent,
      locale: lead.locale,
      product: product ? { slug: product.slug, name: `${product.brand} ${product.name}` } : null,
      configuration: configuration ? { shareCode: configuration.shareCode, totals: ConfigurationTotals.parse(configuration.totals) } : null,
    })
    .catch((err: unknown) => deps.log.error({ err, leadId: lead.id }, 'Сбой уведомлений о заявке'));

  return { kind: 'saved', id: lead.id };
}
