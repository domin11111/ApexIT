import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { FastifyBaseLogger } from 'fastify';
import type { Env } from '../config/env';

/**
 * Хранилище файлов. Ключи public/… отдаются напрямую (CDN / публичное чтение бакета),
 * uploads/… — приватные исходники, доступ только по presigned URL.
 */
export interface Storage {
  /** Presigned PUT: браузер админки грузит файл напрямую, минуя API */
  presignPut(key: string, contentType: string, expiresInSeconds: number): Promise<string>;
  /** Размер объекта или null, если его нет */
  size(key: string): Promise<number | null>;
  get(key: string): Promise<Uint8Array>;
  put(key: string, body: Uint8Array, contentType: string, cacheControl?: string): Promise<void>;
  delete(keys: string[]): Promise<void>;
  publicUrl(key: string): string;
}

export function createS3Storage(env: Env): Storage {
  const client = new S3Client({
    region: env.S3_REGION,
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}),
    ...(env.S3_ACCESS_KEY && env.S3_SECRET_KEY
      ? { credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY } }
      : {}),
  });
  const Bucket = env.S3_BUCKET;
  const publicBase = (env.ASSET_PUBLIC_URL ?? `${env.S3_ENDPOINT ?? `https://${Bucket}.s3.${env.S3_REGION}.amazonaws.com`}/${Bucket}`).replace(/\/$/, '');

  return {
    presignPut: (key, contentType, expiresIn) =>
      getSignedUrl(client, new PutObjectCommand({ Bucket, Key: key, ContentType: contentType }), { expiresIn }),

    async size(key) {
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return head.ContentLength ?? 0;
      } catch (err) {
        if ((err as { name?: string }).name === 'NotFound' || (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) {
          return null;
        }
        throw err;
      }
    },

    async get(key) {
      const object = await client.send(new GetObjectCommand({ Bucket, Key: key }));
      if (!object.Body) throw new Error(`Пустой объект ${key}`);
      return object.Body.transformToByteArray();
    },

    async put(key, body, contentType, cacheControl) {
      await client.send(
        new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType, ...(cacheControl ? { CacheControl: cacheControl } : {}) }),
      );
    },

    async delete(keys) {
      if (keys.length === 0) return;
      await client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys.map((Key) => ({ Key })) } }));
    },

    publicUrl: (key) => `${publicBase}/${key}`,
  };
}

/**
 * Локальная разработка: бакет, публичное чтение public/… и CORS для загрузки из браузера админки.
 * В production это настраивается инфраструктурой (Terraform / панель провайдера), а не приложением.
 */
export async function ensureStorageSetup(env: Env, log: FastifyBaseLogger): Promise<void> {
  const client = new S3Client({
    region: env.S3_REGION,
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}),
    ...(env.S3_ACCESS_KEY && env.S3_SECRET_KEY
      ? { credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY } }
      : {}),
  });
  const Bucket = env.S3_BUCKET;
  try {
    await client.send(new HeadBucketCommand({ Bucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket }));
    log.info({ bucket: Bucket }, 'Создан бакет S3');
  }
  await client.send(
    new PutBucketPolicyCommand({
      Bucket,
      Policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [{ Effect: 'Allow', Principal: '*', Action: ['s3:GetObject'], Resource: [`arn:aws:s3:::${Bucket}/public/*`] }],
      }),
    }),
  );
  await client
    .send(
      new PutBucketCorsCommand({
        Bucket,
        CORSConfiguration: {
          CORSRules: [
            { AllowedOrigins: env.WEB_ORIGIN, AllowedMethods: ['PUT', 'GET', 'HEAD'], AllowedHeaders: ['*'], ExposeHeaders: ['ETag'], MaxAgeSeconds: 3600 },
          ],
        },
      }),
    )
    .catch((err: unknown) => log.warn({ err }, 'Хранилище не поддерживает CORS бакета — настройте CORS на стороне сервера'));
}
