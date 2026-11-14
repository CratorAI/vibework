/** At most one timer and one frame; no display-refresh polling between draws. */
export function homeFieldScheduler(draw: () => void, running: () => boolean, interval = 70) {
  let timer = 0;
  let frame = 0;
  const stop = () => {
    window.clearTimeout(timer);
    cancelAnimationFrame(frame);
    timer = frame = 0;
  };
  const tick = () => {
    frame = 0;
    if (!running()) return;
    draw();
    timer = window.setTimeout(() => {
      timer = 0;
      if (running()) frame = requestAnimationFrame(tick);
    }, interval);
  };
  const sync = () => {
    stop();
    if (running()) frame = requestAnimationFrame(tick);
  };
  return { sync, stop };
}
