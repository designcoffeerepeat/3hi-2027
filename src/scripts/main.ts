import Lenis from 'lenis';
import { createStory, smooth, easeOut } from './three/story';
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
}

/* Full screen menu */
const menu = document.querySelector<HTMLElement>('[data-menu]');
const openBtn = document.querySelector<HTMLButtonElement>('[data-menu-open]');
const closeBtn = document.querySelector<HTMLButtonElement>('[data-menu-close]');
function openMenu() {
  if (!menu) return;
  menu.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add('is-open')));
  openBtn?.setAttribute('aria-expanded', 'true');
  lenis?.stop();
  document.body.style.overflow = 'hidden';
  closeBtn?.focus({ focusVisible: false } as FocusOptions);
}
function closeMenu() {
  if (!menu || menu.hidden) return;
  menu.classList.remove('is-open');
  openBtn?.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
  lenis?.start();
  window.setTimeout(() => (menu.hidden = true), reduced ? 0 : 700);
  openBtn?.focus();
}
openBtn?.addEventListener('click', openMenu);
closeBtn?.addEventListener('click', closeMenu);
menu?.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('a')) closeMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMenu();
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
    if (onScreen && show < 1) storyGL.render(p, ms, safeZone);
  }
}

// Horizontal band the hero clock may use without touching the hero copy:
// from the end of the longest title line to the start of the copy column.
let safeZone = { left: 0, right: 0 };
function measureHero() {
  if (!heroTitle || !heroCopy || window.innerWidth < 900) {
    safeZone = { left: 0, right: window.innerWidth };
    return;
  }
  const lines = [...heroTitle.querySelectorAll<HTMLElement>('.hero__line > span')];
  const titleRight = Math.max(...lines.map((l) => l.offsetLeft + l.offsetWidth)) + heroTitle.offsetLeft;
  safeZone = { left: titleRight, right: heroCopy.offsetLeft };
}

function sizeStage() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  // Measured against the content frame (3000px), not the whole screen.
  const wide = w < 900 ? 1 : Math.min(1.35, Math.max(1, Math.min(w, 3000) / h / (16 / 9)));
  story?.style.setProperty('--wide', wide.toFixed(3));
  if (!stage) return;
  // Fit the 1080 tall artboard to the screen height, but never let a narrow
  // window squeeze it below 1400 artboard pixels wide.
  const s = Math.min(h / 1080, w / 1400);
  stage.style.setProperty('--stage-scale', String(s));
  stage.style.setProperty('--stage-w', `${w / s}px`);
  stage.style.setProperty('--stage-h', `${h / s}px`);
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
  measureHero();
}
document.fonts?.ready.then(measureHero);
window.addEventListener('resize', resize);
resize();

lenis?.on('scroll', (l: Lenis) => (velocity = l.velocity));

function frame(ms: number) {
  lenis?.raf(ms);
  const y = scrollY();
  updateHeader(y);
  updateStory(storyProgress(), ms);
  updateParallax();
  updateScrub();
  updateMarquee();
  if (!lenis) velocity *= 0.9;
  if (axisGL && axisVisible) axisGL.render(ms);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
