import type { FastifyBaseLogger } from 'fastify';

/** Проверка токена капчи: true — человек. */
export type CaptchaVerifier = (token: string, ip: string) => Promise<boolean>;

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Cloudflare Turnstile. Без секрета проверка выключена — это допустимо только в development/test
 * (loadEnv не даст запустить production без TURNSTILE_SECRET).
 * Недоступность Cloudflare = отказ: лучше попросить повторить, чем пропустить бота.
 */
export function turnstileVerifier(secret: string | undefined, log: FastifyBaseLogger): CaptchaVerifier {
  if (!secret) {
    log.warn('TURNSTILE_SECRET не задан — капча в заявках не проверяется');
    return async () => true;
  }
  return async (token, ip) => {
    try {
      const response = await fetch(SITEVERIFY_URL, {
        method: 'POST',
        body: new URLSearchParams({ secret, response: token, remoteip: ip }),
        signal: AbortSignal.timeout(5000),
      });
      const result = (await response.json()) as { success?: boolean; 'error-codes'?: string[] };
      if (!result.success) log.info({ errors: result['error-codes'] }, 'Капча не пройдена');
      return result.success === true;
    } catch (err) {
      log.error({ err }, 'Turnstile недоступен');
      return false;
    }
  };
}
