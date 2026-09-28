// Loaded only with ?perf in the URL: a small meter for checking smoothness in a real
// browser. It shows frames per second, the slowest recent frame, how many frames took
// longer than 50 ms, how many library rows exist right now, and the build. Long frames
// are also logged to the console with the scripts that ran in them, where supported.
import { BUILD } from './data.js';

const box = document.createElement('div');
box.className = 'perf-meter';
box.setAttribute('aria-hidden', 'true');
document.body.append(box);

let frames = 0;
let last = performance.now();
let worst = 0;
let long = 0;
function tick(t) {
  const dt = t - last;
  last = t;
  if (!document.hidden) {
    frames++;
    worst = Math.max(worst, dt);
    if (dt > 50) long++;
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

setInterval(() => {
  const rows = document.querySelectorAll('#list a.row').length;
  box.textContent = `${frames * 2} fps · slowest ${Math.round(worst)} ms · long frames ${long} · rows ${rows} · build ${BUILD}`;
  frames = 0;
  worst = 0;
}, 500);

if (PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame')) {
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      const scripts = (e.scripts || []).map((s) => `${s.sourceFunctionName || s.invoker || '?'} ${Math.round(s.duration)}ms`);
      console.info(`[perf] long frame ${Math.round(e.duration)} ms`, scripts.length ? scripts : '(rendering, no script)');
    }
  }).observe({ type: 'long-animation-frame', buffered: true });
}
