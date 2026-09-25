'use client';

import type { AdminMe, TotpSetupResponse } from '@apex/contracts';
import { useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { useState } from 'react';
import { adminFetch, errorText } from '@/admin/api';
import { ME_KEY, useMe } from '@/admin/session';
import { Badge, Button, Card, Field, Input, Notice, PageHeader } from '@/admin/ui';

/**
 * Второй фактор (TOTP): секрет показывается один раз QR-кодом и текстом,
 * включается только после проверки кода из приложения — нельзя «запереть» себя опечаткой.
 */
export default function SecurityPage() {
  const client = useQueryClient();
  const me = useMe();
  const [setup, setSetup] = useState<(TotpSetupResponse & { qr: string }) | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      setCode('');
    }
  };

  const begin = () =>
    run(async () => {
      const result = await adminFetch<TotpSetupResponse>('/auth/totp/setup', 'POST', {});
      // QR рисуется локально: секрет не уходит сторонним сервисам генерации картинок
      const qr = await QRCode.toDataURL(result.uri, { margin: 1, width: 220, color: { dark: '#050507', light: '#f5f5f7' } });
      setSetup({ ...result, qr });
    });
  const enable = () =>
    run(async () => {
      client.setQueryData(ME_KEY, await adminFetch<AdminMe>('/auth/totp/enable', 'POST', { code }));
      setSetup(null);
    });
  const disable = () =>
    run(async () => {
      client.setQueryData(ME_KEY, await adminFetch<AdminMe>('/auth/totp/disable', 'POST', { code }));
    });

  const enabled = me.data?.totpEnabled ?? false;
  const codeInput = (
    <Field label="Код из приложения">
      {(id) => (
        <Input id={id} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="max-w-40 font-mono tracking-[0.3em]" />
      )}
    </Field>
  );

  return (
    <>
      <PageHeader title="Безопасность" description="Вход по паролю и коду из приложения-аутентификатора (Google Authenticator, 1Password, Aegis)." />
      <Card title={<span className="flex items-center gap-3">Второй фактор {enabled ? <Badge tone="green">включён</Badge> : <Badge tone="amber">выключен</Badge>}</span>}>
        {enabled ? (
          <div className="flex flex-col gap-3">
            <p className="text-small text-fg-secondary">При входе после пароля нужен код из приложения. Чтобы отключить — введите текущий код.</p>
            {codeInput}
            <Button variant="danger" className="self-start" disabled={busy || code.length !== 6} onClick={() => void disable()}>
              Отключить второй фактор
            </Button>
          </div>
        ) : setup ? (
          <div className="grid gap-6 sm:grid-cols-[220px_minmax(0,1fr)]">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL, сгенерирован в браузере */}
            <img src={setup.qr} alt="QR-код для приложения-аутентификатора" width={220} height={220} className="rounded-lg" />
            <div className="flex flex-col gap-3">
              <p className="text-small text-fg-secondary">Отсканируйте QR-код или введите ключ вручную, затем подтвердите кодом из приложения.</p>
              <p className="break-all rounded-lg bg-white/[0.03] p-3 font-mono text-small">{setup.secret}</p>
              {codeInput}
              <Button variant="primary" className="self-start" disabled={busy || code.length !== 6} onClick={() => void enable()}>
                Включить
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-small text-fg-secondary">Утечка пароля не даст доступа к админке без телефона.</p>
            <Button variant="primary" className="self-start" disabled={busy} onClick={() => void begin()}>
              Настроить
            </Button>
          </div>
        )}
        {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
      </Card>
    </>
  );
}
