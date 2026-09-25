import '../config/load-env';
import { parseArgs } from 'node:util';
import { createRedis } from '../cache/redis';
import { loadEnv } from '../config/env';
import { createPrisma } from '../db/prisma';
import { randomToken } from '../security/crypto';
import { devLoginKey } from '../routes/admin/dev-login';

/**
 * Одноразовая ссылка входа в админку для локальной разработки (без ввода пароля):
 *   pnpm --filter @apex/api admin:dev-login -- --email you@company.com
 * Только для существующего пользователя (заводится командой admin:create).
 * Работает только при NODE_ENV=development и ADMIN_DEV_LOGIN=true. Ссылка живёт 5 минут.
 */
const env = loadEnv();
if (env.NODE_ENV !== 'development' || !env.ADMIN_DEV_LOGIN) {
  console.error('Вход по ссылке выключен: нужны NODE_ENV=development и ADMIN_DEV_LOGIN=true');
  process.exit(1);
}

const { values } = parseArgs({ options: { email: { type: 'string' } } });
if (!values.email) {
  console.error('Укажите --email существующего пользователя админки');
  process.exit(1);
}
const email = values.email.toLowerCase();

const prisma = createPrisma(env.DATABASE_URL);
const redis = createRedis(env.REDIS_URL);
try {
  await redis.connect();
  const user = await prisma.adminUser.findUnique({ where: { email } });
  if (!user?.isActive) {
    console.error(`Активного пользователя ${email} нет — создайте его: pnpm --filter @apex/api admin:create -- --email ${email} --role ADMIN`);
    process.exit(1);
  }
  const token = randomToken();
  await redis.set(devLoginKey(token), user.id, 'EX', 300);
  const base = env.API_PUBLIC_URL ?? `http://localhost:${env.API_PORT}`;
  console.log(`${base}/api/admin/auth/dev-login?token=${token}`);
} finally {
  redis.disconnect();
  await prisma.$disconnect();
}
