import { hash, verify } from '@node-rs/argon2';

/**
 * argon2id с параметрами OWASP (19 МиБ, 2 прохода). Хеш содержит параметры и соль —
 * их можно усилить позже, старые хеши продолжат проверяться.
 */
// Algorithm.Argon2id = 2: const enum пакета недоступен при isolatedModules
const ARGON2ID = 2;
const OPTIONS = { algorithm: ARGON2ID, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string) => hash(password, OPTIONS);

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** Хеш-заглушка: при неизвестном email тратим то же время, что и на проверку, — не выдаём, есть ли пользователь. */
let dummyHash: Promise<string> | undefined;
export const dummyPasswordHash = () => (dummyHash ??= hashPassword('apex-timing-equalizer'));
