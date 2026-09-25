import type { Prisma } from '../generated/prisma/client';
import type { Db } from '../db/prisma';

type Tx = Db | Prisma.TransactionClient;

const SECRET_FIELDS = new Set(['passwordHash', 'totpSecret', 'tokenHash']);

/**
 * Разница двух состояний только по изменённым полям: { поле: { before, after } }.
 * Секреты не попадают в журнал даже в виде хешей.
 */
export function diffFields(before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of keys) {
    if (SECRET_FIELDS.has(key) || key === 'updatedAt') continue;
    const a = before?.[key] ?? null;
    const b = after?.[key] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b)) diff[key] = { before: a, after: b };
  }
  return diff;
}

export type AuditRecord = {
  userId: string | null;
  action: string;
  entity: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  /** Готовый diff — для действий без «до/после» (вход, публикация) */
  diff?: Record<string, unknown>;
  ip?: string | null;
};

/** Запись журнала аудита (B4). Можно вызывать внутри транзакции — запись откатится вместе с изменением. */
export async function audit(db: Tx, record: AuditRecord): Promise<void> {
  const diff = record.diff ?? diffFields(record.before ?? null, record.after ?? null);
  await db.auditLog.create({
    data: {
      userId: record.userId,
      action: record.action,
      entity: record.entity,
      entityId: record.entityId,
      diff: JSON.parse(JSON.stringify(diff)) as Prisma.InputJsonValue,
      ip: record.ip ?? null,
    },
  });
}
