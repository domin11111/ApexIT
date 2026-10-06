import 'server-only';
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ConfigurationRecord, ConfigurationStore } from '@apex/domain';

/*
 * Данные сайта, когда он работает без API и базы (боевая сборка на lenivec.online):
 * сохранённые сборки конфигуратора и журнал заявок — обычные файлы в APEX_DATA_DIR
 * (deploy/data, вне git). Процесс один, поэтому достаточно очереди записи в памяти.
 */
const DATA_DIR = process.env.APEX_DATA_DIR || join(process.cwd(), '.data');
/** Предохранитель от раздувания файла: совместимых сборок в каталоге заведомо меньше */
const MAX_CONFIGURATIONS = 20_000;

type StoredConfiguration = { payload: unknown; totals: unknown; createdAt: string };

let configurations: Map<string, StoredConfiguration> | undefined;
let writing: Promise<void> = Promise.resolve();

async function loadConfigurations(): Promise<Map<string, StoredConfiguration>> {
  if (configurations) return configurations;
  try {
    const raw = JSON.parse(await readFile(join(DATA_DIR, 'configurations.json'), 'utf8')) as Record<string, StoredConfiguration>;
    configurations = new Map(Object.entries(raw));
  } catch {
    // Файла ещё нет (или он испорчен) — начинаем с пустого хранилища
    configurations = new Map();
  }
  return configurations;
}

/** Запись через временный файл и rename: оборванная запись не оставит полфайла. */
function persist(map: Map<string, StoredConfiguration>): Promise<void> {
  writing = writing.then(async () => {
    await mkdir(DATA_DIR, { recursive: true });
    const file = join(DATA_DIR, 'configurations.json');
    await writeFile(`${file}.tmp`, JSON.stringify(Object.fromEntries(map)), 'utf8');
    await rename(`${file}.tmp`, file);
  });
  return writing;
}

export const fileConfigurationStore: ConfigurationStore = {
  async find(shareCode) {
    const stored = (await loadConfigurations()).get(shareCode);
    return stored ? ({ shareCode, payload: stored.payload, totals: stored.totals, createdAt: new Date(stored.createdAt) } satisfies ConfigurationRecord) : null;
  },
  async insert(record) {
    const map = await loadConfigurations();
    if (map.has(record.shareCode)) return false;
    if (map.size >= MAX_CONFIGURATIONS) throw new Error('Хранилище сборок переполнено');
    map.set(record.shareCode, { payload: record.payload, totals: record.totals, createdAt: record.createdAt.toISOString() });
    await persist(map);
    return true;
  },
};

/** Заявка — строкой JSON в leads.jsonl: запасная копия на случай, если Telegram недоступен. */
export async function appendLead(entry: object): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await appendFile(join(DATA_DIR, 'leads.jsonl'), `${JSON.stringify(entry)}\n`, 'utf8');
}
