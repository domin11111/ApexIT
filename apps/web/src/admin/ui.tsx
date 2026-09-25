'use client';

import type { Localized } from '@apex/contracts';
import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

/*
 * Примитивы интерфейса админки: рабочий инструмент без анимаций сцены,
 * но в тех же токенах, что и сайт.
 */

export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  const styles = {
    primary: 'bg-fg text-void hover:bg-fg/90',
    secondary: 'border border-line text-fg hover:border-fg/40 hover:bg-white/5',
    ghost: 'text-fg-secondary hover:text-fg hover:bg-white/5',
    danger: 'border border-[#ff6b61]/50 text-[#ff6b61] hover:bg-[#ff6b61]/10',
  }[variant];
  return (
    <button
      type="button"
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg px-4 text-small font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 ${styles} ${className}`}
      {...props}
    />
  );
}

const control =
  'w-full rounded-lg border border-line bg-white/[0.03] px-3 py-2 text-small text-fg outline-none transition-colors placeholder:text-fg-tertiary hover:border-fg/30 focus:border-accent aria-invalid:border-[#ff6b61]';

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-caption text-fg-tertiary">
        {label}
      </label>
      {children(id)}
      {hint && !error && <p className="text-caption text-fg-tertiary">{hint}</p>}
      {error && <p className="text-caption text-[#ff6b61]">{error}</p>}
    </div>
  );
}

export const Input = (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} className={`${control} ${props.className ?? ''}`} />;
export const Textarea = (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={3} {...props} className={`${control} resize-y ${props.className ?? ''}`} />;
export const Select = (props: SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} className={`${control} ${props.className ?? ''}`} />;

/** Текст на двух языках: ru обязателен (базовые колонки), en — перевод */
export function LocalizedField({
  label,
  value,
  onChange,
  multiline = false,
  required = false,
}: {
  label: string;
  value: Localized;
  onChange: (value: Localized) => void;
  multiline?: boolean;
  required?: boolean;
}) {
  const Control = multiline ? Textarea : Input;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {(['ru', 'en'] as const).map((lang) => (
        <Field key={lang} label={`${label} · ${lang.toUpperCase()}`} error={required && lang === 'ru' && !value.ru.trim() ? 'Обязательно' : null}>
          {(id) => <Control id={id} value={value[lang]} onChange={(event) => onChange({ ...value, [lang]: event.target.value })} />}
        </Field>
      ))}
    </div>
  );
}

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-white/[0.02] p-5 ${className}`}>
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="text-body font-medium">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-h3">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-small text-fg-secondary">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

const BADGE_TONES = {
  neutral: 'border-line text-fg-secondary',
  green: 'border-badge-available/40 text-badge-available',
  blue: 'border-badge-coming/40 text-badge-coming',
  amber: 'border-badge-preview/40 text-badge-preview',
  red: 'border-[#ff6b61]/40 text-[#ff6b61]',
} as const;

export function Badge({ tone = 'neutral', children }: { tone?: keyof typeof BADGE_TONES; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-pill border px-2.5 py-0.5 font-mono text-caption ${BADGE_TONES[tone]}`}>{children}</span>;
}

export function Notice({ tone = 'neutral', children }: { tone?: 'neutral' | 'error' | 'success'; children: ReactNode }) {
  const styles = { neutral: 'border-line text-fg-secondary', error: 'border-[#ff6b61]/40 text-[#ff6b61]', success: 'border-badge-available/40 text-badge-available' }[tone];
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-small ${styles}`}>
      {children}
    </p>
  );
}

export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export const formatBytes = (bytes: number | null | undefined) =>
  bytes == null ? '—' : bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} МБ` : `${Math.round(bytes / 1024)} КБ`;
