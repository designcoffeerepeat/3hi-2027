import Lenis from 'lenis';
import { createStory, smooth, easeOut, easeInOut, tickAngle } from './three/story';
import { createAxis } from './three/axis';
import { initScan } from './scan';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.documentElement;

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
const webgl = hasWebGL();
if (!webgl) root.classList.add('no-webgl');

/* Smooth scroll */
const lenis = reduced ? null : new Lenis({ lerp: 0.1, wheelMultiplier: 0.9 });
const scrollY = () => window.scrollY;

/* Header: shrinks to half size once the page scrolls */
const header = document.querySelector<HTMLElement>('[data-header]');
function updateHeader(y: number) {
  header?.classList.toggle('is-compact', y > 120);
  // Hidden again at the very bottom, where the footer has its own link
  toTop?.classList.toggle('is-on', y > window.innerHeight && !footerTopInView);
}

/* Header scan bar steps aside while the AI scan section or the footer
   (which has its own scan bar) is on screen */
const scanSections = [...document.querySelectorAll<HTMLElement>('#ai-scan, footer')];
const headerNav = header?.querySelector<HTMLElement>('.header__nav');
const headerRight = header?.querySelector<HTMLElement>('.header__right');
function measureNav() {
  if (!headerNav || !headerRight) return;
  const cs = getComputedStyle(headerNav);
  const w = headerRight.offsetWidth + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  headerNav.style.setProperty('--nav-short', `${Math.ceil(w)}px`);
}
if (header && scanSections.length) {
  const inView = new Set<Element>();
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) e.isIntersecting ? inView.add(e.target) : inView.delete(e.target);
      header.classList.toggle('is-scan-away', inView.size > 0);
    },
    { rootMargin: '-35% 0px -35% 0px' },
  );
  scanSections.forEach((el) => io.observe(el));
}

/* Floating back to top button */
const toTop = document.querySelector<HTMLAnchorElement>('[data-to-top]');
// Finds the first solid background under the button's centre, so it can
// switch to yellow over black sections.
let toneCheck = 0;
function updateToTopTone(ms: number) {
  if (!toTop || !toTop.classList.contains('is-on') || ms - toneCheck < 120) return;
  toneCheck = ms;
  const r = toTop.getBoundingClientRect();
  const stack = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  let dark = false;
  for (const el of stack) {
    if (toTop.contains(el)) continue;
    const cs = getComputedStyle(el);
    const m = cs.backgroundColor.match(/[\d.]+/g);
    if (!m) continue;
    const [rr, gg, bb, a = '1'] = m;
    if (Number(a) * Number(cs.opacity) < 0.5) continue;
    dark = 0.2126 * +rr + 0.7152 * +gg + 0.0722 * +bb < 60;
    break;
  }
  toTop.classList.toggle('is-on-dark', dark);
}
const footerTop = document.querySelector<HTMLElement>('[data-footer-top]');
let footerTopInView = false;
if (footerTop) {
  new IntersectionObserver(([e]) => (footerTopInView = e.isIntersecting)).observe(footerTop);
}
document.querySelectorAll<HTMLAnchorElement>('a[href="#top"]').forEach((a) =>
  a.addEventListener('click', (e) => {
    e.preventDefault();
    if (lenis) lenis.scrollTo(0, { duration: 2 });
    else window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  }),
);

/* Full screen menu */
const menu = document.querySelector<HTMLElement>('[data-menu]');
const openBtn = document.querySelector<HTMLButtonElement>('[data-menu-open]');
const closeBtn = document.querySelector<HTMLButtonElement>('[data-menu-close]');
// Services submenu inside the menu
menu?.querySelectorAll<HTMLButtonElement>('[data-menu-toggle]').forEach((btn) => {
  btn.addEventListener('click', () => btn.setAttribute('aria-expanded', String(btn.getAttribute('aria-expanded') !== 'true')));
});
// The burger bars first turn into the close mark, then the menu opens out
// from that spot. Closing runs the same steps backwards.
const MORPH = reduced ? 0 : 380;
let menuTimer = 0;
function openMenu() {
  if (!menu) return;
  window.clearTimeout(menuTimer);
  openBtn?.setAttribute('aria-expanded', 'true');
  if (openBtn) {
    const r = openBtn.getBoundingClientRect();
    menu.style.setProperty('--ox', `${r.left + r.width / 2}px`);
    menu.style.setProperty('--oy', `${r.top + r.height / 2}px`);
  }
  lenis?.stop();
  document.body.style.overflow = 'hidden';
  menuTimer = window.setTimeout(() => {
    menu.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add('is-open')));
    closeBtn?.focus({ focusVisible: false } as FocusOptions);
  }, MORPH);
}
function closeMenu() {
  if (!menu || menu.hidden) return;
  window.clearTimeout(menuTimer);
  menu.classList.remove('is-open');
  document.body.style.overflow = '';
  lenis?.start();
  openBtn?.focus({ preventScroll: true });
  menuTimer = window.setTimeout(
    () => {
      menu.hidden = true;
      openBtn?.setAttribute('aria-expanded', 'false');
    },
    reduced ? 0 : 650,
  );
}
openBtn?.addEventListener('click', openMenu);
closeBtn?.addEventListener('click', closeMenu);
menu?.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('a')) closeMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMenu();
});

/* Services dropdown: opens on hover (mouse) or click, closes on Escape,
   on the scrim or when the pointer leaves for a moment. */
const drop = document.querySelector<HTMLElement>('[data-drop]');
const dropBtn = document.querySelector<HTMLButtonElement>('[data-drop-open]');
const dropScrim = document.querySelector<HTMLElement>('[data-drop-scrim]');
let dropTimer = 0;
let dropOpen = false;
let dropOpenedAt = 0;
function setDrop(open: boolean) {
  if (!drop || !dropBtn) return;
  window.clearTimeout(dropTimer);
  if (open === dropOpen) return;
  dropOpen = open;
  dropOpenedAt = performance.now();
  dropBtn.setAttribute('aria-expanded', String(open));
  dropScrim?.classList.toggle('is-on', open);
  if (open) {
    drop.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => drop.classList.add('is-open')));
  } else {
    drop.classList.remove('is-open');
    dropTimer = window.setTimeout(() => (drop.hidden = true), reduced ? 0 : 350);
  }
}
if (drop && dropBtn) {
  const hoverable = window.matchMedia('(hover: hover)').matches;
  // A click right after hover opened it should not close it again
  dropBtn.addEventListener('click', () => {
    if (dropOpen && performance.now() - dropOpenedAt < 600) return;
    setDrop(!dropOpen);
  });
  if (hoverable) {
    const later = () => {
      window.clearTimeout(dropTimer);
      dropTimer = window.setTimeout(() => setDrop(false), 260);
    };
    for (const el of [dropBtn, drop]) {
      el.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && setDrop(true));
      el.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && later());
    }
  }
  dropScrim?.addEventListener('click', () => setDrop(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dropOpen) {
      setDrop(false);
      dropBtn.focus();
    }
  });
  // "Run the scan" jumps to the nearest scan bar on the page
  drop.querySelector('[data-drop-scan]')?.addEventListener('click', () => {
    setDrop(false);
    const input =
      document.querySelector<HTMLInputElement>('#ai-scan input') ??
      document.querySelector<HTMLInputElement>('footer input');
    if (!input) return;
    const target = input.closest('form') ?? input;
    if (lenis) lenis.scrollTo(target as HTMLElement, { offset: -window.innerHeight / 3, duration: 1.6 });
    else target.scrollIntoView({ block: 'center' });
    window.setTimeout(() => input.focus({ preventScroll: true }), lenis ? 1600 : 0);
  });
}

/* FAQ: smooth open and close for the <details> accordion */
document.querySelectorAll<HTMLDetailsElement>('[data-faq]').forEach((d) => {
  const summary = d.querySelector('summary');
  const body = d.querySelector<HTMLElement>('.faq__a');
  if (!summary || !body || reduced) return;
  summary.addEventListener('click', (e) => {
    e.preventDefault();
    const opening = !d.open;
    if (opening) d.open = true;
    const full = body.scrollHeight;
    const anim = body.animate(
      { height: opening ? ['0px', `${full}px`] : [`${full}px`, '0px'], opacity: opening ? [0, 1] : [1, 0] },
      { duration: 450, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    );
    anim.onfinish = () => {
      if (!opening) d.open = false;
    };
  });
});

/* Every scan bar opens the AI visibility scan modal */
initScan(lenis, reduced);

/* Reveal on enter */
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      }
    }
  },
  { rootMargin: '0px 0px -12% 0px' },
);
document.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));

/* Story: hero, clock and Shopify spotlight */
const story = document.querySelector<HTMLElement>('[data-story]');
const storyCanvas = document.querySelector<HTMLCanvasElement>('[data-story-gl]');
const hero = story?.querySelector<HTMLElement>('[data-hero]');
const heroTitle = hero?.querySelector<HTMLElement>('.hero__title');
const heroCopy = hero?.querySelector<HTMLElement>('[data-hero-copy]');
const heroThree = story?.querySelector<HTMLElement>('[data-hero-three]');
const heroDown = hero?.querySelector<HTMLAnchorElement>('[data-hero-down]');
if (reduced) heroThree?.querySelector('svg')?.pauseAnimations();
// The down arrow plays the clock transition and lands on the Shopify spotlight
heroDown?.addEventListener('click', (e) => {
  if (!story) return;
  e.preventDefault();
  const y = story.offsetTop + (story.offsetHeight - window.innerHeight) * 0.96;
  if (lenis) lenis.scrollTo(y, { duration: 3.2 });
  else window.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });
});
const spot = story?.querySelector<HTMLElement>('[data-spot]');
const stage = story?.querySelector<HTMLElement>('[data-spot-stage]');
const spotSun = story?.querySelector<HTMLElement>('[data-spot-sun]');
const spotModel = story?.querySelector<HTMLElement>('[data-spot-model]');
const spotOverline = story?.querySelector<HTMLElement>('[data-spot-overline]');
const spotText = story?.querySelector<HTMLElement>('[data-spot-text]');
const spotLetters = story ? [...story.querySelectorAll<HTMLElement>('[data-spot-title] span')] : [];
const clouds = story ? [...story.querySelectorAll<HTMLElement>('[data-spot-clouds]')] : [];

const storyGL = webgl && storyCanvas ? createStory(storyCanvas) : null;

// Hovering (or tapping) an arm of the hero clock names its horizon
const xtLabel = story?.querySelector<HTMLElement>('[data-xt-label]');
const xtNames: string[] = JSON.parse(xtLabel?.dataset.labels || '[]');
const xtNum = xtLabel?.querySelector<HTMLElement>('[data-xt-num]');
const xtName = xtLabel?.querySelector<HTMLElement>('[data-xt-name]');
const xtAt = { x: 0, y: 0 };
let xtShown = -1;
if (storyGL && storyCanvas && xtLabel) {
  const sticky = storyCanvas.parentElement!;
  const at = (e: PointerEvent) => {
    const r = storyCanvas.getBoundingClientRect();
    xtAt.x = e.clientX - r.left;
    xtAt.y = e.clientY - r.top;
    storyGL.point(xtAt.x, xtAt.y);
  };
  sticky.addEventListener('pointermove', at);
  // Touch has no hover: a tap names the arm until the next tap
  sticky.addEventListener('pointerdown', at);
  sticky.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && storyGL.point(null));
}

function updateXtLabel(live: boolean) {
  if (!storyGL || !xtLabel) return;
  const i = live ? storyGL.hovered : -1;
  if (i >= 0) {
    if (i !== xtShown && xtNum && xtName) {
      xtNum.textContent = `Horizon ${String(i + 1).padStart(2, '0')}`;
      xtName.textContent = xtNames[i] ?? '';
    }
    // Up and to the right of the pointer, kept on screen
    const x = Math.min(xtAt.x + 20, window.innerWidth - xtLabel.offsetWidth - 16);
    const y = Math.max(xtAt.y - xtLabel.offsetHeight - 20, 16);
    xtLabel.style.translate = `${x}px ${y}px`;
  }
  if ((i >= 0) !== (xtShown >= 0)) xtLabel.classList.toggle('is-on', i >= 0);
  xtShown = i;
}

function storyProgress() {
  if (!story) return 0;
  const r = story.getBoundingClientRect();
  const span = r.height - window.innerHeight;
  return span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
}

function updateStory(p: number, ms: number) {
  if (!story) return;
  const vh = window.innerHeight;
  // Hero copy lifts away at two speeds as the clock grows
  const a = smooth(0.04, 0.3, p);
  if (heroTitle) {
    heroTitle.style.translate = `0 ${-a * vh * 0.45}px`;
    heroTitle.style.opacity = String(1 - smooth(0.06, 0.24, p));
  }
  if (heroCopy) {
    heroCopy.style.translate = `0 ${-a * vh * 0.25}px`;
    heroCopy.style.opacity = String(1 - smooth(0.08, 0.26, p));
  }
  if (heroDown) heroDown.style.translate = `0 ${-a * vh * 0.3}px`;
  if (heroDown) heroDown.style.opacity = p > 0 ? String(1 - smooth(0, 0.08, p)) : '';
  if (heroThree) {
    heroThree.style.translate = `0 ${-a * vh * 0.15}px`;
    heroThree.style.opacity = String(0.25 * (1 - smooth(0.04, 0.22, p)));
  }
  if (hero) hero.style.visibility = p > 0.32 ? 'hidden' : '';

  // Spotlight builds on top once the black arm covers the screen
  const show = smooth(0.48, 0.53, p);
  if (spot) {
    spot.style.opacity = String(show);
    spot.style.visibility = show > 0 ? 'visible' : 'hidden';
  }
  const t = ms / 1000;
  const sunIn = easeOut(smooth(0.5, 0.68, p));
  if (spotSun) spotSun.style.translate = `0 ${(1 - sunIn) * -42}%`;
  const cloudIn = easeOut(smooth(0.5, 0.74, p));
  clouds.forEach((c, i) => {
    const depth = Number(c.dataset.spotClouds) || 1;
    const drift = Math.sin(t * 0.25 + i * 1.7) * 14 * depth;
    c.style.translate = `${drift}px ${(1 - cloudIn) * 34 * depth}%`;
  });
  if (spotOverline) spotOverline.style.opacity = String(smooth(0.58, 0.68, p));
  const modelIn = easeOut(smooth(0.58, 0.82, p));
  if (spotModel) spotModel.style.translate = `0 ${(1 - modelIn) * 105}%`;
  spotLetters.forEach((l, i) => {
    const v = easeOut(smooth(0.78 + i * 0.012, 0.88 + i * 0.012, p));
    l.style.opacity = String(v);
    l.style.translate = `0 ${(1 - v) * 40}%`;
  });
  if (spotText) {
    const v = smooth(0.86, 0.95, p);
    spotText.style.opacity = String(v);
    spotText.style.translate = `0 ${(1 - v) * 30}px`;
  }

  // The canvas is fully hidden behind the spotlight after the hand off
  if (storyGL) {
    const r = story.getBoundingClientRect();
    const onScreen = r.bottom > 0 && r.top < vh;
    if (onScreen && show < 1) storyGL.render(p, ms);
    updateXtLabel(onScreen && p < 0.04);
  }
}

// The hero clock always sits in the middle of the screen. Its second hand
// sweeps a full circle, so the title and the copy are fitted to either side
// of that circle (plus a margin) rather than the clock moving out of the way.
function measureHero() {
  if (!story) return;
  const w = window.innerWidth;
  if (!heroTitle || !heroCopy || w < 900) {
    story.style.removeProperty('--title-fit');
    story.style.removeProperty('--copy-max');
    return;
  }
  const u = Math.min(w / 1920, window.innerHeight / 1080);
  const radius = (661 * u * (1 + 50 / 661)) / 2;
  const margin = Math.max(24, 40 * u);
  // Title: measure at full size, then scale the type down if it would cross
  story.style.setProperty('--title-fit', '1');
  const lines = [...heroTitle.querySelectorAll<HTMLElement>('.hero__line > span')];
  const left = heroTitle.offsetLeft;
  const natural = Math.max(...lines.map((l) => l.offsetLeft + l.offsetWidth));
  const room = w / 2 - radius - margin - left;
  story.style.setProperty('--title-fit', Math.min(1, room / natural).toFixed(3));
  // Copy: narrow the column so it starts clear of the circle
  const copyRight = heroCopy.offsetLeft + heroCopy.offsetWidth;
  story.style.setProperty('--copy-max', `${Math.max(220, copyRight - (w / 2 + radius + margin))}px`);
}

function sizeStage() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  // Measured against the content frame (3000px), not the whole screen.
  const wide = w < 900 ? 1 : Math.min(1.35, Math.max(1, Math.min(w, 3000) / h / (16 / 9)));
  story?.style.setProperty('--wide', wide.toFixed(3));
  // Phones: the spotlight frame is 390 design pixels wide
  stage?.style.setProperty('--m-scale', (w / 390).toFixed(4));
  // Fit the 1080 tall artboard to the screen height, but never let a narrow
  // window squeeze it below 1400 artboard pixels wide.
  for (const el of stages) {
    // The spotlight fills the window; service heroes measure their section
    const box = el === stage ? null : el.parentElement!.getBoundingClientRect();
    const sw = box?.width || w;
    const sh = box?.height || h;
    const s = Math.min(sh / 1080, sw / 1400);
    el.style.setProperty('--stage-scale', String(s));
    el.style.setProperty('--stage-w', `${sw / s}px`);
    el.style.setProperty('--stage-h', `${sh / s}px`);
  }
}
const stages = [stage, ...document.querySelectorAll<HTMLElement>('[data-stage]')].filter(Boolean) as HTMLElement[];

/* Service heroes: layers lift at their own speeds, then the ticking
   'xt - 2sm' mark grows to the middle, its flat arm floods the screen in the
   next section's colour and the other two arms fly off, like the clock on
   the home page. The clouds follow the pointer and the floating object is
   nudged away from it. Phones keep a still hero (CSS). */
const sh = document.querySelector<HTMLElement>('[data-sh]');
const shPin = sh?.querySelector<HTMLElement>('.sh__pin');
const shAnchor = sh?.querySelector<HTMLElement>('[data-sh-anchor]');
const shObj = sh?.querySelector<HTMLElement>('[data-sh-obj]');
const shArms = sh ? (['x', 'y', 'hand'].map((k) => sh.querySelector<HTMLElement>(`[data-sh-${k}]`)) as HTMLElement[]) : [];
const shRest = { x: 0, y: 0, s: 100 };
let shCopyY = 0;
let shVisible = true;
if (sh) new IntersectionObserver((entries) => (shVisible = entries[0].isIntersecting)).observe(sh);

// Pointer: -1 to 1 across the hero for the clouds, and a push away from
// the pointer while it is over the object
const shPoint = { x: 0, y: 0, mx: 0, my: 0, nx: 0, ny: 0, tnx: 0, tny: 0, on: false };
if (shPin && !reduced) {
  shPin.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = shPin.getBoundingClientRect();
    shPoint.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    shPoint.y = ((e.clientY - r.top) / r.height) * 2 - 1;
    shPoint.on = true;
    shPoint.tnx = 0;
    shPoint.tny = 0;
    if (!shObj) return;
    const o = shObj.getBoundingClientRect();
    const dx = e.clientX - (o.left + o.width / 2);
    const dy = e.clientY - (o.top + o.height / 2);
    const reach = Math.min(o.width, o.height) * 0.5;
    const d = Math.hypot(dx, dy);
    if (d < reach && d > 0) {
      const push = (1 - d / reach) * 36;
      shPoint.tnx = (-dx / d) * push;
      shPoint.tny = (-dy / d) * push;
    }
  });
  shPin.addEventListener('pointerleave', () => {
    shPoint.on = false;
    shPoint.tnx = 0;
    shPoint.tny = 0;
  });
}

function updateShPointer() {
  if (!sh || window.innerWidth < 900) return;
  const k = 0.06;
  shPoint.mx += ((shPoint.on ? shPoint.x : 0) - shPoint.mx) * k;
  shPoint.my += ((shPoint.on ? shPoint.y : 0) - shPoint.my) * k;
  shPoint.nx += (shPoint.tnx + shPoint.mx * 14 - shPoint.nx) * 0.08;
  shPoint.ny += (shPoint.tny + shPoint.my * 10 - shPoint.ny) * 0.08;
  sh.style.setProperty('--mx', shPoint.mx.toFixed(4));
  sh.style.setProperty('--my', shPoint.my.toFixed(4));
  sh.style.setProperty('--nx', `${shPoint.nx.toFixed(2)}px`);
  sh.style.setProperty('--ny', `${shPoint.ny.toFixed(2)}px`);
}

function measureSh() {
  if (!shPin || !shAnchor) return;
  const p = shPin.getBoundingClientRect();
  const r = shAnchor.getBoundingClientRect();
  // The copy stage carries the anchor and may be mid parallax on desktop
  const lift = window.innerWidth < 900 ? 0 : shCopyY;
  shRest.x = r.left - p.left + r.width / 2;
  shRest.y = r.top - p.top + r.height / 2 - lift;
  shRest.s = r.width;
  sh!.classList.add('is-ready');
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function placeArm(el: HTMLElement, x: number, y: number, len: number, thick: number, angle = 0) {
  el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${angle.toFixed(4)}rad) scale(${(len / 100).toFixed(4)},${(thick / 100).toFixed(4)}) translate(-50px,-50px)`;
}

function shProgress() {
  if (!sh || reduced || window.innerWidth < 900) return 0;
  const r = sh.getBoundingClientRect();
  const span = r.height - window.innerHeight;
  return span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
}

function updateSh(p: number, ms: number) {
  if (!sh || !shPin || shArms.some((a) => !a)) return;
  // Phones: still hero, no mark
  if (window.innerWidth < 900) return;
  const w = shPin.clientWidth;
  const h = shPin.clientHeight;
  const mobile = w < 900;
  const lift = smooth(0, 0.5, p);
  shCopyY = -lift * h * 0.3;
  sh.style.setProperty('--sy', `${(-lift * h * 0.08).toFixed(1)}px`);
  sh.style.setProperty('--ay', `${(-lift * h * 0.2).toFixed(1)}px`);
  sh.style.setProperty('--ty', `${(-lift * h * 0.42).toFixed(1)}px`);
  sh.style.setProperty('--cy', `${shCopyY.toFixed(1)}px`);

  const a = easeInOut(smooth(0.02, 0.42, p)); // grows to the middle
  const b = easeInOut(smooth(0.38, 0.72, p)); // flat arm floods
  const c = easeInOut(smooth(0.68, 0.94, p)); // the other arms fly off
  const L = lerp(shRest.s, mobile ? Math.max(w * 1.3, h * 0.9) : h * 1.7, a);
  const T = L * 0.0756; // stroke to length, as drawn
  const cx = lerp(shRest.x, w / 2, a);
  const cy = lerp(shRest.y, h / 2, a);
  const [x, y, hand] = shArms;

  placeArm(x, cx, cy, lerp(L + T, Math.max(L + T, w * 1.3), b), lerp(T, h * 1.4, b));
  // Turns to the flood colour early, while it is still a thin bar
  x.style.setProperty('--fill', smooth(0, 0.22, b).toFixed(3));
  placeArm(y, cx + lerp(0, -0.38 * w, b) - c * 0.6 * w, cy, T, L + T);
  // Second hand ticks like a quartz watch, then settles on the diagonal
  const tick = reduced ? Math.PI / 4 : tickAngle(ms);
  let delta = (Math.PI / 4 - tick) % Math.PI;
  if (delta > Math.PI / 2) delta -= Math.PI;
  if (delta < -Math.PI / 2) delta += Math.PI;
  const angle = -(tick + delta * smooth(0.02, 0.2, p));
  placeArm(hand, cx + lerp(0, 0.34 * w, b) + c * 0.6 * w, cy + lerp(0, 0.3 * h, b) + c * 0.6 * h, L + T, T, angle);
}

/* Interactive axis in the AI scan section */
const axisCanvas = document.querySelector<HTMLCanvasElement>('[data-axis-gl]');
const axisSurface = axisCanvas?.parentElement as HTMLElement | undefined;
const axisGL = webgl && axisCanvas && axisSurface ? createAxis(axisCanvas, axisSurface) : null;
let axisVisible = false;
if (axisSurface) {
  new IntersectionObserver((entries) => (axisVisible = entries[0].isIntersecting), { rootMargin: '100px' }).observe(
    axisSurface,
  );
}

/* Parallax: [data-speed] moves vertically, [data-speed-x] horizontally,
   relative to how far its parent sits from the middle of the screen. */
const parallaxY = [...document.querySelectorAll<HTMLElement>('[data-speed]')];
const parallaxX = [...document.querySelectorAll<HTMLElement>('[data-speed-x]')];
function updateParallax() {
  if (reduced) return;
  const vh = window.innerHeight;
  const mobile = window.innerWidth < 900;
  for (const el of parallaxY) {
    const r = (el.parentElement ?? el).getBoundingClientRect();
    if (r.bottom < -200 || r.top > vh + 200) continue;
    const d = r.top + r.height / 2 - vh / 2;
    const speed = Number(el.dataset.speed) * (mobile ? 0.6 : 1);
    const y = Math.max(-160, Math.min(160, d * speed));
    el.style.translate = `0 ${y.toFixed(1)}px`;
  }
  for (const el of parallaxX) {
    const r = (el.parentElement ?? el).getBoundingClientRect();
    if (r.bottom < -200 || r.top > vh + 200) continue;
    const d = r.top + r.height / 2 - vh / 2;
    const x = Math.max(-240, Math.min(240, d * Number(el.dataset.speedX) * (mobile ? 0.25 : 1)));
    el.style.translate = `${x.toFixed(1)}px 0`;
  }
}

/* Intro: words light up as the paragraph passes through the screen */
const scrub = document.querySelector<HTMLElement>('[data-scrub-words]');
const scrubWords = scrub ? [...scrub.querySelectorAll('span')] : [];
function updateScrub() {
  if (!scrub) return;
  const vh = window.innerHeight;
  const r = scrub.getBoundingClientRect();
  const p = reduced ? 1 : Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.35)));
  const n = Math.round(p * scrubWords.length);
  scrubWords.forEach((w, i) => w.classList.toggle('is-on', i < n));
}

/* Marquee speeds up with scroll velocity */
const marquee = document.querySelector<HTMLElement>('[data-marquee]');
const marqueeAnim = marquee?.getAnimations()[0];
let velocity = 0;
function updateMarquee() {
  if (!marqueeAnim || reduced) return;
  const target = 1 + Math.min(6, Math.abs(velocity) * 0.25);
  marqueeAnim.playbackRate += (target - marqueeAnim.playbackRate) * 0.08;
}

/* Testimonials carousel (only when there is more than one) */
const quotes = document.querySelector<HTMLElement>('[data-quotes]');
if (quotes) {
  const items = [...quotes.querySelectorAll<HTMLElement>('[data-quote]')];
  const current = quotes.querySelector('[data-quotes-current]');
  let i = 0;
  const go = (n: number) => {
    i = (n + items.length) % items.length;
    items.forEach((q, k) => q.classList.toggle('is-active', k === i));
    if (current) current.textContent = String(i + 1).padStart(2, '0');
  };
  quotes.querySelector('[data-quotes-prev]')?.addEventListener('click', () => go(i - 1));
  quotes.querySelector('[data-quotes-next]')?.addEventListener('click', () => go(i + 1));
}

/* Loop */
function resize() {
  storyGL?.resize();
  axisGL?.resize();
  sizeStage();
  measureSh();
  measureHero();
  measureNav();
}
document.fonts?.ready.then(() => {
  measureSh();
  measureHero();
  measureNav();
});
window.addEventListener('resize', resize);
resize();

lenis?.on('scroll', (l: Lenis) => (velocity = l.velocity));

function frame(ms: number) {
  lenis?.raf(ms);
  const y = scrollY();
  updateHeader(y);
  updateToTopTone(ms);
  updateStory(storyProgress(), ms);
  updateParallax();
  updateScrub();
  updateMarquee();
  if (!lenis) velocity *= 0.9;
  if (axisGL && axisVisible) axisGL.render(ms);
  if (sh && shVisible) {
    updateSh(shProgress(), ms);
    updateShPointer();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
