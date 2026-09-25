/**
 * Виньетка поверх канваса для уровней качества без композера (см. PostFx): тот же спад яркости
 * к краям, что у эффекта Vignette(offset 0.28, darkness 0.78), но силами CSS — без прохода на GPU.
 */
export function SceneVignette() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{ background: 'radial-gradient(ellipse 72% 72% at 50% 50%, transparent 55%, rgb(0 0 0 / 0.55) 100%)' }}
    />
  );
}
