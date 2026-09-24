/**
 * Проверка на этапе компиляции: перечисления Prisma обязаны совпадать с @apex/contracts.
 * Добавили статус в schema.prisma и забыли контракты (или наоборот) — typecheck упадёт здесь.
 */
import type * as Contracts from '@apex/contracts';
import type * as Db from '../generated/prisma/enums';

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

export type EnumParity = [
  Assert<Same<Db.ProductCategory, Contracts.ProductCategory>>,
  Assert<Same<Db.ProductStatus, Contracts.ProductStatus>>,
  Assert<Same<Db.CompareDirection, Contracts.CompareDirection>>,
  Assert<Same<Db.CompatibilityLevel, Contracts.CompatibilityLevel>>,
  Assert<Same<Db.ModelPreset, Contracts.ModelPreset>>,
  Assert<Same<Db.HotspotVisibility, Contracts.HotspotVisibility>>,
  Assert<Same<Db.AssetType, Contracts.AssetType>>,
  Assert<Same<Db.AssetVariant, Contracts.AssetVariant>>,
  Assert<Same<Db.AssetStatus, Contracts.AssetStatus>>,
  Assert<Same<Db.LeadStatus, Contracts.LeadStatus>>,
  Assert<Same<Db.LeadIntent, Contracts.LeadIntent>>,
  Assert<Same<Db.AdminRole, Contracts.AdminRole>>,
];
