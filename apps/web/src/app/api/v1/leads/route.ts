import { LeadCreate } from '@apex/contracts';
import { clientIp, HttpError, json, rateLimiter, readJson, respond } from '@/server/http';
import { createLead } from '@/server/leads';

/** Не больше 5 заявок в час с одного IP — как в API. */
const allow = rateLimiter(5, 60 * 60 * 1000);

/** POST /api/v1/leads — заявка, когда сайт работает без API (боевая сборка на lenivec.online). */
export async function POST(request: Request) {
  return respond(async () => {
    const ip = clientIp(request);
    if (!allow(`lead:${ip}`)) throw new HttpError(429, 'RATE_LIMITED', 'Слишком много заявок — попробуйте через час');
    await createLead(LeadCreate.parse(await readJson(request)), ip, request.headers.get('user-agent'));
    return json({ ok: true }, 201);
  });
}
