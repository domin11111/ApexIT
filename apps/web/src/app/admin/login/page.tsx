'use client';

import type { AdminMe, LoginResponse } from '@apex/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { adminFetch, errorText } from '@/admin/api';
import { ME_KEY, useMe } from '@/admin/session';
import { Button, Field, Input, Notice } from '@/admin/ui';
import { LogoMark } from '@/components/chrome/logo-mark';

/** Вход: почта и пароль → при включённом TOTP второй шаг с кодом из приложения. */
export default function AdminLoginPage() {
  const router = useRouter();
  const client = useQueryClient();
  const me = useMe();
  const [step, setStep] = useState<'password' | 'totp'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Уже вошёл (или вернулся с полупройденным входом) — продолжаем с нужного шага
  const needsTotp = me.data && !me.data.mfaPassed;
  useEffect(() => {
    if (me.data?.mfaPassed) router.replace('/admin');
  }, [me.data, router]);

  const finish = (user: AdminMe) => {
    client.setQueryData(ME_KEY, user);
    router.replace('/admin');
  };

  const submitPassword = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await adminFetch<LoginResponse>('/auth/login', 'POST', { email, password });
      setPassword('');
      if (result.next === 'totp') {
        client.setQueryData(ME_KEY, result.me);
        setStep('totp');
      } else finish(result.me);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    setBusy(true);
    setError(null);
    try {
      finish(await adminFetch<AdminMe>('/auth/totp', 'POST', { code }));
    } catch (e) {
      setCode('');
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const totpStep = step === 'totp' || needsTotp;

  return (
    <main className="grid min-h-svh place-items-center px-4">
      <form
        className="flex w-full max-w-sm flex-col gap-5 rounded-xl border border-line bg-white/[0.02] p-8"
        onSubmit={(event) => {
          event.preventDefault();
          void (totpStep ? submitCode() : submitPassword());
        }}
      >
        <div className="flex items-center gap-3">
          <LogoMark className="size-8 text-fg" />
          <div>
            <p className="font-medium">APEX Compute</p>
            <p className="text-caption text-fg-tertiary">{totpStep ? 'Код из приложения-аутентификатора' : 'Вход в админку'}</p>
          </div>
        </div>

        {totpStep ? (
          <Field label="Шесть цифр">
            {(id) => (
              <Input
                id={id}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                autoFocus
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                className="text-center font-mono text-h3 tracking-[0.4em]"
              />
            )}
          </Field>
        ) : (
          <>
            <Field label="Почта">{(id) => <Input id={id} type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />}</Field>
            <Field label="Пароль">
              {(id) => <Input id={id} type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />}
            </Field>
          </>
        )}

        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" variant="primary" disabled={busy || (totpStep ? code.length !== 6 : !email || !password)}>
          {busy ? 'Проверяем…' : totpStep ? 'Подтвердить' : 'Войти'}
        </Button>
      </form>
    </main>
  );
}
