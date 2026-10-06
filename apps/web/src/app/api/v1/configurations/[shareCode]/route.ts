import { ShareCode } from '@apex/contracts';
import { json, respond } from '@/server/http';
import { localConfigurator } from '@/server/services';

/** GET /api/v1/configurations/:shareCode — сохранённая сборка по коду из ссылки. */
export async function GET(_request: Request, { params }: { params: Promise<{ shareCode: string }> }) {
  return respond(async () => json(await localConfigurator().load(ShareCode.parse((await params).shareCode))));
}
