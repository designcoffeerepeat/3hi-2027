/* Pill filters for the Work and Blog grids. Each card lists its topics in
   data-tags; an optional search box narrows by text as well. */
export function initFilters(opts: { scrollTop?: number } = {}) {
  const list = document.querySelector<HTMLElement>('[data-filter-list]');
  if (!list) return;
  const pills = [...document.querySelectorAll<HTMLButtonElement>('[data-filter]')];
  const search = document.querySelector<HTMLInputElement>('[data-filter-search]');
  const empty = document.querySelector<HTMLElement>('[data-filter-empty]');
  const items = [...list.querySelectorAll<HTMLElement>('[data-tags]')];
  let active = 'all';

  function apply() {
    const q = search?.value.trim().toLowerCase() ?? '';
    let shown = 0;
    for (const el of items) {
      const tags = (el.dataset.tags ?? '').split(' ');
      const ok = (active === 'all' || tags.includes(active)) && (!q || el.textContent!.toLowerCase().includes(q));
      el.hidden = !ok;
      if (ok) {
        shown++;
        el.classList.add('is-in');
      }
    }
    if (empty) empty.hidden = shown > 0;
    list.dispatchEvent(new CustomEvent('filtered', { detail: { shown } }));
  }

  pills.forEach((p) =>
    p.addEventListener('click', () => {
      active = p.dataset.filter ?? 'all';
      pills.forEach((o) => o.setAttribute('aria-pressed', String(o === p)));
      apply();
      // Work: bring the pill row up near the top so the results show
      if (opts.scrollTop != null) {
        const row = p.parentElement ?? p;
        const y = row.getBoundingClientRect().top + window.scrollY - opts.scrollTop;
        if (Math.abs(row.getBoundingClientRect().top - opts.scrollTop) > 8) {
          const lenis = (window as any).__lenis;
          if (lenis) lenis.scrollTo(y, { duration: 1.1 });
          else window.scrollTo({ top: y, behavior: 'smooth' });
        }
      }
    }),
  );
  search?.addEventListener('input', apply);
}
