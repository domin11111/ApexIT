'use client';

import { motion } from '@apex/ui/tokens';
import { useRef, type ReactNode } from 'react';
import { usePrefersReducedMotion } from '@/hooks/use-media-query';
import { gsap, SplitText, useGSAP } from '@/lib/gsap';

/**
 * Появление текста по словам: каждое слово выезжает снизу из-под маски.
 * Запускается, когда секция входит в экран, и откатывается при скролле назад.
 */
export function RevealText({
  as = 'h2',
  id,
  className,
  children,
}: {
  as?: 'h1' | 'h2' | 'h3' | 'p';
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  // Все варианты — блочные текстовые элементы; для JSX достаточно одного конкретного типа
  const Tag = as as 'h2';
  const ref = useRef<HTMLHeadingElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || reducedMotion) return;
      const split = SplitText.create(el, { type: 'words', mask: 'words' });
      gsap.from(split.words, {
        yPercent: 110,
        duration: 1.1,
        ease: motion.gsap.outExpo,
        stagger: motion.stagger.words,
        scrollTrigger: {
          trigger: el.closest('[data-scene]') ?? el,
          start: 'top 45%',
          toggleActions: 'play none none reverse',
        },
      });
      return () => split.revert();
    },
    { dependencies: [reducedMotion] },
  );

  return (
    <Tag ref={ref} id={id} className={className}>
      {children}
    </Tag>
  );
}
