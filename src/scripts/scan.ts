import type Lenis from 'lenis';

/* Free AI visibility scan.

   With PUBLIC_SCAN_ENDPOINT set, the address is POSTed there as JSON { url }
   and the answer is shown as is. Without it, a static site cannot read
   another website (browsers block cross site requests), so the modal shows a
   demo result built from the address alone, labelled as a demo. */

type Result = { url: string; score: number; summary?: string; checks: number[]; demo: boolean };

export function normalizeUrl(raw: string): URL | null {
  let v = raw.trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  try {
    const u = new URL(v);
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(u.hostname) ? u : null;
  } catch {
    return null;
  }
}

// Small seeded random so the same address always gets the same demo numbers.
function seeded(text: string) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function demoResult(url: URL, count: number): Result {
  const rand = seeded(url.hostname.replace(/^www\./, ''));
  const checks = Array.from({ length: count }, () => Math.round(22 + rand() * 70));
  const score = Math.round(checks.reduce((s, c) => s + c, 0) / count);
  return { url: url.href, score, checks, demo: true };
}

async function runScan(url: URL, count: number, wait: number): Promise<Result> {
  const endpoint = import.meta.env.PUBLIC_SCAN_ENDPOINT as string | undefined;
  if (endpoint) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ url: url.href }),
      });
      if (res.ok) {
        const data = await res.json();
        const checks = (data.checks ?? []).map((c: any) => Math.round(typeof c === 'number' ? c : c.score));
        return { url: url.href, score: Math.round(data.score), summary: data.summary, checks, demo: false };
      }
    } catch {
      // Fall through to the labelled demo
    }
  }
  // Give the steps a moment to play, like a real scan would.
  await new Promise((r) => setTimeout(r, wait));
  return demoResult(url, count);
}

export function initScan(lenis: Lenis | null, reduced: boolean) {
  const modal = document.querySelector<HTMLElement>('[data-scan-modal]');
  if (!modal) return;
  const summaries = JSON.parse(modal.dataset.summaries || '{}');
  const host = modal.querySelector<HTMLElement>('[data-scan-host]')!;
  const steps = [...modal.querySelectorAll<HTMLElement>('[data-scan-steps] li')];
  const urlEl = modal.querySelector<HTMLElement>('[data-scan-url]')!;
  const dial = modal.querySelector<HTMLElement>('[data-scan-dial]')!;
  const scoreEl = modal.querySelector<HTMLElement>('[data-scan-score]')!;
  const summary = modal.querySelector<HTMLElement>('[data-scan-summary]')!;
  const demo = modal.querySelector<HTMLElement>('[data-scan-demo]')!;
  const rows = [...modal.querySelectorAll<HTMLElement>('[data-scan-checks] li')];
  const closeBtn = modal.querySelector<HTMLButtonElement>('[data-scan-close]')!;
  let opener: HTMLElement | null = null;
  let run = 0;
  let timers: number[] = [];

  const tone = (v: number) => (v >= 70 ? 'var(--sun)' : v >= 45 ? 'var(--paper)' : '#ff975e');

  function open() {
    opener = document.activeElement as HTMLElement | null;
    modal!.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => modal!.classList.add('is-open')));
    lenis?.stop();
    document.body.style.overflow = 'hidden';
    closeBtn.focus({ focusVisible: false } as FocusOptions);
  }

  function close() {
    if (modal!.hidden) return;
    run++;
    timers.forEach(clearTimeout);
    modal!.classList.remove('is-open');
    document.body.style.overflow = '';
    lenis?.start();
    window.setTimeout(() => (modal!.hidden = true), reduced ? 0 : 800);
    opener?.focus({ preventScroll: true });
  }

  function reset() {
    modal!.dataset.state = 'scanning';
    dial.style.setProperty('--v', '0');
    scoreEl.textContent = '0';
    rows.forEach((r) => {
      r.querySelector<HTMLElement>('[data-check-bar]')!.style.setProperty('--v', '0');
      r.querySelector('[data-check-score]')!.textContent = '0/100';
    });
    steps.forEach((s) => s.classList.remove('is-on', 'is-done'));
  }

  function playSteps(every: number) {
    timers = steps.map((s, i) =>
      window.setTimeout(() => {
        s.classList.add('is-on');
        steps[i - 1]?.classList.add('is-done');
      }, i * every),
    );
  }

  function show(r: Result) {
    modal!.dataset.state = 'result';
    modal!.scrollTop = 0;
    urlEl.textContent = r.url;
    summary.textContent =
      r.summary || (r.score >= 75 ? summaries.high : r.score >= 50 ? summaries.mid : summaries.low);
    demo.hidden = !r.demo;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        dial.style.setProperty('--v', String(r.score));
        rows.forEach((row, i) => {
          const v = r.checks[i] ?? 0;
          const bar = row.querySelector<HTMLElement>('[data-check-bar]')!;
          bar.style.setProperty('--v', String(v));
          bar.style.setProperty('--tone', tone(v));
          row.querySelector('[data-check-score]')!.textContent = `${v}/100`;
        });
      }),
    );
    const t0 = performance.now();
    const count = (now: number) => {
      const k = reduced ? 1 : Math.min((now - t0) / 1400, 1);
      scoreEl.textContent = String(Math.round(r.score * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(count);
    };
    requestAnimationFrame(count);
  }

  async function scan(url: URL) {
    const id = ++run;
    reset();
    host.textContent = url.hostname.replace(/^www\./, '');
    if (modal!.hidden) open();
    const every = reduced ? 0 : 700;
    playSteps(every);
    const result = await runScan(url, rows.length, every * steps.length + 300);
    if (id !== run) return;
    steps.forEach((s) => s.classList.add('is-on', 'is-done'));
    window.setTimeout(() => id === run && show(result), reduced ? 0 : 500);
  }

  document.querySelectorAll<HTMLFormElement>('[data-scan]').forEach((form) => {
    const input = form.querySelector('input') as HTMLInputElement;
    input.addEventListener('input', () => input.setCustomValidity(''));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const url = normalizeUrl(input.value);
      if (!url) {
        input.setCustomValidity(modal.dataset.error || 'Enter a website address');
        input.reportValidity();
        return;
      }
      // Keep every scan bar on the page in step
      document.querySelectorAll<HTMLInputElement>('[data-scan] input').forEach((i) => (i.value = input.value));
      scan(url);
    });
  });

  closeBtn.addEventListener('click', close);
  modal.querySelector('[data-scan-again]')?.addEventListener('click', () => {
    close();
    const field = document.querySelector<HTMLInputElement>('#scan-home');
    const section = document.querySelector<HTMLElement>('#ai-scan');
    if (section) {
      if (lenis) lenis.scrollTo(section, { offset: -40 });
      else section.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
    }
    window.setTimeout(() => field?.select(), 900);
  });
  modal.querySelector('[data-scan-cta]')?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}
