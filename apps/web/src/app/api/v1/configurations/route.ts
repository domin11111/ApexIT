import { ConfigurationPayload } from '@apex/contracts';
import { clientIp, HttpError, json, rateLimiter, readJson, respond } from '@/server/http';
import { localConfigurator } from '@/server/services';

const allow = rateLimiter(60, 60 * 60 * 1000);

/** POST /api/v1/configurations — сохранить совместимую сборку и получить код для ссылки. */
export async function POST(request: Request) {
  return respond(async () => {
    if (!allow(`configuration:${clientIp(request)}`)) throw new HttpError(429, 'RATE_LIMITED', 'Слишком много сохранений — попробуйте позже');
    return json(await localConfigurator().save(ConfigurationPayload.parse(await readJson(request))), 201);
  });
}
