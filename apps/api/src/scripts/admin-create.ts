import '../config/load-env';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { AdminUserCreate } from '@apex/contracts';
import { createPrisma } from '../db/prisma';
import { hashPassword } from '../security/password';

/**
 * Первый (и любой следующий) пользователь админки:
 *   pnpm --filter @apex/api admin:create -- --email you@company.com --role ADMIN
 * Пароль вводится скрыто и не попадает в историю shell.
 */

/** Ввод без эха: символы не выводятся в терминал */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout, terminal: true });
    const output = rl as unknown as { _writeToOutput: (text: string) => void };
    stdout.write(question);
    output._writeToOutput = () => undefined;
    rl.question('', (answer) => {
      rl.close();
      stdout.write('\n');
      resolve(answer);
    });
  });
}

const { values } = parseArgs({ options: { email: { type: 'string' }, role: { type: 'string', default: 'EDITOR' } } });
if (!values.email) {
  console.error('Укажите --email (и при необходимости --role ADMIN)');
  process.exit(1);
}

const password = await askHidden('Пароль (от 12 символов): ');
if ((await askHidden('Повторите пароль: ')) !== password) {
  console.error('Пароли не совпадают');
  process.exit(1);
}

const input = AdminUserCreate.safeParse({ email: values.email, role: values.role, password });
if (!input.success) {
  console.error(input.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n'));
  process.exit(1);
}

const prisma = createPrisma(process.env.DATABASE_URL!);
try {
  const user = await prisma.adminUser.upsert({
    where: { email: input.data.email },
    create: { email: input.data.email, role: input.data.role, passwordHash: await hashPassword(input.data.password) },
    update: { role: input.data.role, passwordHash: await hashPassword(input.data.password), isActive: true },
  });
  await prisma.auditLog.create({
    data: { userId: null, action: 'user.cli', entity: 'AdminUser', entityId: user.id, diff: { email: user.email, role: user.role } },
  });
  console.log(`✓ ${user.email} (${user.role}). Второй фактор включается в админке: «Безопасность».`);
} finally {
  await prisma.$disconnect();
}
