'use client';

import { Component, type ReactNode } from 'react';
import { useExperience } from '@/stores/experience';

/**
 * Сцена не смогла создать WebGL-контекст (драйвер в чёрном списке, исчерпан лимит контекстов) —
 * R3F бросает ошибку при монтировании. Ловим её и переключаем сайт на статичные рендеры.
 */
export class WebglBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch() {
    useExperience.getState().setWebgl('unsupported');
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}
