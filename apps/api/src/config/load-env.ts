import { resolve } from 'node:path';
import { config } from 'dotenv';

// В production переменные приходят из окружения контейнера — файлы .env не читаем.
// Локально: сначала .env рабочей директории (apps/api), затем корневой .env монорепо.
// Пути — от process.cwd(), а не от файла: после бандлинга import.meta.url указывает в dist/.
// dotenv не перезаписывает уже заданные переменные, так что окружение процесса всегда главнее.
if (process.env.NODE_ENV !== 'production') {
  config({ path: [resolve('.env'), resolve('../../.env')], quiet: true });
}
