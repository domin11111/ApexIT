import 'server-only';
import { createConfiguratorService } from '@apex/domain';
import { mockCatalog } from '@/lib/catalog';
import { fileConfigurationStore } from './data';

/** Конфигуратор на встроенном каталоге и файловом хранилище — для маршрутов app/api/v1. */
let configurator: ReturnType<typeof createConfiguratorService> | undefined;
export const localConfigurator = () => (configurator ??= createConfiguratorService({ catalog: mockCatalog(), store: fileConfigurationStore }));
