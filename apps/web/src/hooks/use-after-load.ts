'use client';

import { useEffect, useState } from 'react';

/** Колбэк после первой отрисовки контента (FCP); браузер без Paint Timing — сразу. */
function afterFirstPaint(callback: () => void): () => void {
  if (typeof PerformanceObserver === 'undefined' || !PerformanceObserver.supportedEntryTypes?.includes('paint')) {
    callback();
    return () => {};
  }
  const observer = new PerformanceObserver((list) => {
    if (list.getEntriesByName('first-contentful-paint').length === 0) return;
    observer.disconnect();
    callback();
  });
  observer.observe({ type: 'paint', buffered: true });
  return () => observer.disconnect();
}

/**
 * true — страница загружена, первый экран отрисован и главный поток свободен: пора монтировать
 * тяжёлое (WebGL-сцену). До этого первый экран — HTML и постер, и ни LCP, ни его ресурсы
 * не конкурируют с чанком three.js. При клиентском переходе всё это уже позади —
 * сцена монтируется в ближайший простой.
 */
export function useAfterLoad(timeout = 1500): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let idle = 0;
    let timer = 0;
    let painted = false;
    let loaded = document.readyState === 'complete';

    const schedule = () => {
      if (!painted || !loaded) return;
      // Safari до 18 не знает requestIdleCallback — хватит короткой паузы
      if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(() => setReady(true), { timeout });
      else timer = window.setTimeout(() => setReady(true), 200);
    };
    const onLoad = () => {
      loaded = true;
      schedule();
    };
    const stopPaint = afterFirstPaint(() => {
      painted = true;
      schedule();
    });
    if (!loaded) window.addEventListener('load', onLoad, { once: true });

    return () => {
      stopPaint();
      window.removeEventListener('load', onLoad);
      if (idle) window.cancelIdleCallback(idle);
      window.clearTimeout(timer);
    };
  }, [timeout]);

  return ready;
}
