import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';

// Сначала apps/api/.env, затем корневой .env монорепо. dotenv не перезаписывает уже заданные
// переменные, поэтому окружение процесса (CI, Docker) всегда главнее файлов.
config({
  path: [
    fileURLToPath(new URL('../../.env', import.meta.url)),
    fileURLToPath(new URL('../../../../.env', import.meta.url)),
  ],
  quiet: true,
});
