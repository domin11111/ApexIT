import type { FastifyBaseLogger } from 'fastify';
import type { CatalogPublisher } from '../../admin/publish';
import type { SessionStore } from '../../admin/session';
import type { ModelQueue } from '../../assets/jobs';
import type { Redis } from '../../cache/redis';
import type { Env } from '../../config/env';
import type { Db } from '../../db/prisma';
import type { Storage } from '../../storage/storage';

export type AdminDeps = {
  prisma: Db;
  redis: Redis;
  env: Env;
  sessions: SessionStore;
  publisher: CatalogPublisher;
  storage: Storage;
  queue: ModelQueue;
  log: FastifyBaseLogger;
};
