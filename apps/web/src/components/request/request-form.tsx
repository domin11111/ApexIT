'use client';

import { LeadCreate, type ProductStatus, type SavedConfigurationDto } from '@apex/contracts';
import { isOrderable } from '@apex/contracts/status';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePrefersReducedMotion } from '@/hooks/use-media-query';
import { Link } from '@/i18n/navigation';
import { ApiRequestError, apiFetch } from '@/lib/api-client';
import { gsap, useGSAP } from '@/lib/gsap';
import { Magnetic } from '../ui/magnetic';
import { Turnstile, type TurnstileHandle } from './turnstile';

type Field = 'name' | 'company' | 'email' | 'phone' | 'message' | 'consent';
type Intent = 'QUOTE' | 'INFO';

export type RequestProduct = { slug: string; title: string; status: ProductStatus; accentColor: string };

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/**
 * Форма запроса (F7): плавающие подписи, проверка той же Zod-схемой, что и в API,
 * honeypot для ботов, Turnstile, прикреплённые продукт и сборка, анимация успеха.
 */
export function RequestForm({
  locale,
  product,
  configurationCode,
  initialIntent,
  statuses,
}: {
  locale: 'ru' | 'en';
  product: RequestProduct | null;
  configurationCode: string | null;
  initialIntent: Intent;
  /** Статусы продуктов коллекции — чтобы понять, можно ли заказать сборку */
  statuses: Record<string, ProductStatus>;
}) {
  const t = useTranslations('request');
  const [values, setValues] = useState({ name: '', company: '', email: '', phone: '', message: '', website: '' });
  const [consent, setConsent] = useState(false);
  const [intent, setIntent] = useState<Intent>(initialIntent);
  const [attachConfiguration, setAttachConfiguration] = useState(true);
  const [errors, setErrors] = useState<Partial<Record<Field | 'captcha' | 'form', string>>>({});
  const [captchaToken, setCaptchaToken] = useState(SITE_KEY ? '' : 'captcha-disabled');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const turnstile = useRef<TurnstileHandle>(null);

  const configuration = useQuery({
    queryKey: ['configuration', configurationCode],
    queryFn: () => apiFetch<SavedConfigurationDto>(`/configurations/${encodeURIComponent(configurationCode!)}`),
    enabled: configurationCode !== null,
    retry: false,
    staleTime: Infinity,
  });
  const attached = attachConfiguration && configuration.data ? configuration.data : null;

  // B3: превью-продукт (сам или в сборке) — только «запросить информацию»
  const previewOnly = useMemo(() => {
    if (product && !isOrderable(product.status)) return true;
    if (!attached) return false;
    const { cpu, memory, gpu } = attached.payload;
    return [cpu.slug, memory?.slug, gpu?.slug].some((slug) => slug && statuses[slug] && !isOrderable(statuses[slug]));
  }, [product, attached, statuses]);
  const effectiveIntent: Intent = previewOnly ? 'INFO' : intent;

  const set = (field: keyof typeof values) => (value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    if (errors[field as Field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const submit = async () => {
    const candidate = {
      name: values.name,
      company: values.company || undefined,
      email: values.email,
      phone: values.phone || undefined,
      message: values.message || undefined,
      intent: effectiveIntent,
      productSlug: product?.slug,
      configurationShareCode: attached?.shareCode,
      locale,
      consent,
      website: values.website || undefined,
      captchaToken,
    };
    const parsed = LeadCreate.safeParse(candidate);
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'captchaToken') next.captcha = t('errors.captcha');
        else if (field === 'name' || field === 'email' || field === 'phone' || field === 'message' || field === 'consent') next[field] = t(`errors.${field}`);
      }
      setErrors(next);
      return;
    }

    setStatus('sending');
    setErrors({});
    try {
      await apiFetch('/leads', { method: 'POST', body: parsed.data });
      setStatus('sent');
    } catch (error) {
      setStatus('idle');
      turnstile.current?.reset();
      const code = error instanceof ApiRequestError ? error.code : null;
      setErrors({
        form:
          code === 'CAPTCHA_FAILED'
            ? t('errors.captchaFailed')
            : code === 'RATE_LIMITED'
              ? t('errors.rateLimited')
              : code === 'LEAD_INTENT_NOT_ALLOWED'
                ? t('errors.notAllowed')
                : t('errors.generic'),
      });
    }
  };

  if (status === 'sent') return <Success email={values.email} />;

  const nf = new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: 1 });
  const gb = (value: number) => (value >= 1024 ? `${nf.format(value / 1024)} ${locale === 'ru' ? 'ТБ' : 'TB'}` : `${nf.format(value)} ${locale === 'ru' ? 'ГБ' : 'GB'}`);

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-6"
      aria-describedby={errors.form ? 'form-error' : undefined}
    >
      {/* Что прикреплено к заявке */}
      {(product || configurationCode) && (
        <div className="flex flex-col gap-3">
          {product && (
            <Attachment label={t('attached.product')} accent={product.accentColor}>
              <Link href={`/products/${product.slug}`} className="hover:text-accent">
                {product.title}
              </Link>
            </Attachment>
          )}
          {configurationCode && attachConfiguration && (
            <Attachment
              label={t('attached.configuration')}
              action={
                <button type="button" onClick={() => setAttachConfiguration(false)} className="text-caption text-fg-tertiary hover:text-fg">
                  {t('attached.remove')}
                </button>
              }
            >
              {configuration.isLoading && <span className="text-fg-tertiary">{t('attached.loading')}</span>}
              {configuration.isError && <span className="text-badge-coming">{t('attached.missing')}</span>}
              {configuration.data && (
                <span>
                  <Link href={{ pathname: '/configurator', query: { c: configuration.data.shareCode } }} className="font-mono hover:text-accent">
                    {configuration.data.shareCode}
                  </Link>
                  <span className="mt-1 block text-small text-fg-secondary">
                    {t('summary', {
                      cores: nf.format(configuration.data.totals.cores),
                      memory: gb(configuration.data.totals.memoryGb),
                      vram: gb(configuration.data.totals.vramGb),
                      power: nf.format(configuration.data.totals.totalPowerW),
                    })}
                  </span>
                </span>
              )}
            </Attachment>
          )}
        </div>
      )}

      <fieldset>
        <legend className="eyebrow mb-3">{t('intent.label')}</legend>
        <div role="radiogroup" className="inline-flex rounded-pill border border-line p-1">
          {(['QUOTE', 'INFO'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={effectiveIntent === option}
              disabled={option === 'QUOTE' && previewOnly}
              onClick={() => setIntent(option)}
              className="h-10 rounded-pill px-5 text-small text-fg-secondary transition-colors hover:text-fg disabled:pointer-events-none disabled:opacity-35 aria-checked:bg-fg aria-checked:text-void"
            >
              {t(`intent.${option}`)}
            </button>
          ))}
        </div>
        {previewOnly && <p className="mt-2 text-small text-fg-tertiary">{t('intent.previewOnly')}</p>}
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <FloatingInput label={t('fields.name')} value={values.name} onChange={set('name')} error={errors.name} autoComplete="name" required />
        <FloatingInput label={t('fields.company')} value={values.company} onChange={set('company')} autoComplete="organization" hint={t('fields.optional')} />
        <FloatingInput label={t('fields.email')} type="email" value={values.email} onChange={set('email')} error={errors.email} autoComplete="email" required />
        <FloatingInput label={t('fields.phone')} type="tel" value={values.phone} onChange={set('phone')} error={errors.phone} autoComplete="tel" hint={t('fields.optional')} />
      </div>
      <FloatingInput label={t('fields.message')} value={values.message} onChange={set('message')} error={errors.message} multiline hint={t('fields.optional')} />

      {/* Honeypot: поле невидимо для людей и скринридеров; бот, заполнивший его, получит «успех» без сохранения */}
      <div aria-hidden className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={values.website} onChange={(event) => set('website')(event.target.value)} />
        </label>
      </div>

      <label className="flex cursor-pointer items-start gap-3 text-small text-fg-secondary">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => {
            setConsent(event.target.checked);
            setErrors((e) => ({ ...e, consent: undefined }));
          }}
          aria-invalid={Boolean(errors.consent)}
          className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
        />
        <span>
          {t('consent')}
          {errors.consent && <span className="mt-1 block text-[#ff6b61]">{errors.consent}</span>}
        </span>
      </label>

      {SITE_KEY && (
        <div>
          <Turnstile ref={turnstile} siteKey={SITE_KEY} locale={locale} onToken={setCaptchaToken} />
          {errors.captcha && <p className="mt-2 text-small text-[#ff6b61]">{errors.captcha}</p>}
        </div>
      )}

      {errors.form && (
        <p id="form-error" role="alert" className="text-small text-[#ff6b61]">
          {errors.form}
        </p>
      )}

      <div>
        <Magnetic>
          <button
            type="submit"
            disabled={status === 'sending'}
            className="inline-flex h-12 items-center rounded-pill bg-fg px-7 text-small font-medium text-void transition-shadow hover:shadow-[var(--glow-accent)] disabled:opacity-50"
          >
            {status === 'sending' ? t('sending') : t('submit')}
          </button>
        </Magnetic>
      </div>
    </form>
  );
}

function Attachment({ label, accent, action, children }: { label: string; accent?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="glass flex items-start justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <p className="eyebrow mb-1 flex items-center gap-2">
          {accent && <span className="size-1.5 rounded-full" style={{ background: accent }} aria-hidden />}
          {label}
        </p>
        <div className="text-body">{children}</div>
      </div>
      {action}
    </div>
  );
}

/**
 * Поле с плавающей подписью: пока пусто и без фокуса — подпись внутри поля,
 * при вводе она уезжает наверх. Работает на CSS (peer + placeholder-shown), без JS.
 */
function FloatingInput({
  label,
  value,
  onChange,
  error,
  hint,
  type = 'text',
  autoComplete,
  required,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  hint?: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  multiline?: boolean;
}) {
  const id = useId();
  const field =
    'peer block w-full rounded-lg border bg-white/[0.03] px-4 pb-2.5 pt-6 text-body text-fg outline-none transition-colors placeholder:text-transparent focus:border-accent';
  const tone = error ? 'border-[#ff6b61]' : 'border-line hover:border-fg/30';
  const common = {
    id,
    value,
    placeholder: ' ',
    onChange: (event: { target: { value: string } }) => onChange(event.target.value),
    'aria-invalid': Boolean(error),
    'aria-describedby': error ? `${id}-error` : undefined,
    required,
    autoComplete,
  };
  return (
    <div className="relative">
      {multiline ? <textarea rows={4} className={`${field} ${tone} resize-y`} {...common} /> : <input type={type} className={`${field} ${tone}`} {...common} />}
      <label
        htmlFor={id}
        className="pointer-events-none absolute left-4 right-4 top-2 truncate text-[0.75rem] tracking-normal text-fg-tertiary transition-all peer-placeholder-shown:top-[1.05rem] peer-placeholder-shown:text-small peer-focus:top-2 peer-focus:text-[0.75rem] peer-focus:text-accent"
      >
        {label}
        {hint && <span className="ml-1.5">· {hint}</span>}
      </label>
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-small text-[#ff6b61]">
          {error}
        </p>
      )}
    </div>
  );
}

/** Успех: галочка «прорисовывается» по контуру, текст поднимается — как дорожка на плате. */
function Success({ email }: { email: string }) {
  const t = useTranslations('request.success');
  const root = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useGSAP(
    () => {
      if (reducedMotion) return;
      const timeline = gsap.timeline();
      timeline
        .from('[data-ring]', { strokeDashoffset: 1, duration: 0.9, ease: 'power2.inOut' })
        .from('[data-check]', { strokeDashoffset: 1, duration: 0.5, ease: 'power2.out' }, '-=0.2')
        .from('[data-reveal]', { y: 16, opacity: 0, duration: 0.6, stagger: 0.08, ease: 'expo.out' }, '-=0.2');
    },
    { scope: root, dependencies: [reducedMotion] },
  );

  return (
    <div ref={root} role="status" className="glass flex flex-col items-start gap-5 p-8">
      <svg viewBox="0 0 64 64" className="size-16 text-accent" fill="none" aria-hidden>
        <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="1.5" pathLength={1} strokeDasharray="1" data-ring />
        <path d="M20 33 L28 41 L45 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1" data-check />
      </svg>
      <h2 className="text-h2" data-reveal>
        {t('title')}
      </h2>
      <p className="text-body text-fg-secondary" data-reveal>
        {t('body', { email })}
      </p>
      <Link href="/" className="text-small font-medium hover:text-accent" data-reveal>
        {t('back')} <span aria-hidden>→</span>
      </Link>
    </div>
  );
}
