/**
 * Знак коллекции: кольцо-«дорожка» с золотым треугольником первого контакта,
 * как метка pin 1 на корпусе процессора. Кольцо рисует прелоадер, затем оно становится логотипом.
 */
export function LogoMark({ className, ringProps }: { className?: string; ringProps?: React.SVGProps<SVGCircleElement> }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden fill="none">
      <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="1.5" pathLength={1} {...ringProps} />
      <path d="M9 39 L9 31 L17 39 Z" fill="var(--gold-contact)" data-pin />
    </svg>
  );
}
