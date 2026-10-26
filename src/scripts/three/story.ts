import * as THREE from 'three';

// Hero 'xt - 1' clock, the blurred hero sun and the hero to Shopify
// transition, all drawn on one orthographic canvas in CSS pixels.

const sunVert = /* glsl */ `
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const sunFrag = /* glsl */ `
  precision highp float;
  uniform vec2 uCenter;   // device px, origin bottom left
  uniform float uRadius;  // device px
  uniform float uOpacity;
  void main() {
    vec2 p = gl_FragCoord.xy;
    float d = distance(p, uCenter);
    float blur = uRadius * 0.62;
    float a = 1.0 - smoothstep(uRadius - blur, uRadius + blur, d);
    // Radial gradient anchored low left: orange, sun yellow, soft pink.
    vec2 g0 = uCenter + vec2(-0.52, -0.76) * uRadius;
    float t = clamp(distance(p, g0) / (1.68 * uRadius), 0.0, 1.0);
    vec3 c0 = vec3(1.0, 0.592, 0.369);
    vec3 c1 = vec3(1.0, 0.839, 0.0);
    vec3 c2 = vec3(1.0, 0.773, 0.996);
    vec3 col = t < 0.48 ? mix(c0, c1, t / 0.48) : mix(c1, c2, (t - 0.48) / 0.52);
    gl_FragColor = vec4(col, a * 0.5 * uOpacity);
  }
`;

const barVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Vertical arm: cyan with a 50% pink to purple to cyan gradient on top.
const vertFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  void main() {
    vec3 cyan = vec3(0.0, 0.804, 0.894);
    vec3 pink = vec3(1.0, 0.0, 0.667);
    vec3 purple = vec3(0.224, 0.0, 0.494);
    float t = 1.0 - vUv.y;
    vec3 g = t < 0.5 ? mix(pink, purple, t / 0.5) : mix(purple, cyan, (t - 0.5) / 0.5);
    gl_FragColor = vec4(mix(cyan, g, 0.5), 1.0);
  }
`;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Second hand: snaps forward every half second with a small overshoot,
// like a quartz watch, and still goes round once a minute.
function tickAngle(ms: number) {
  const s = ms / 500;
  const whole = Math.floor(s);
  const f = Math.min(1, (s - whole) / 0.36);
  const c1 = 2.2;
  const back = 1 + (c1 + 1) * Math.pow(f - 1, 3) + c1 * Math.pow(f - 1, 2);
  const step = (Math.PI * 2) / 120;
  return Math.PI / 4 - (whole + back) * step;
}

export function createStory(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);

  const sunMat = new THREE.ShaderMaterial({
    vertexShader: sunVert,
    fragmentShader: sunFrag,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uCenter: { value: new THREE.Vector2() },
      uRadius: { value: 100 },
      uOpacity: { value: 1 },
    },
  });
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), sunMat);
  sun.frustumCulled = false;
  sun.renderOrder = 0;
  scene.add(sun);

  const plane = new THREE.PlaneGeometry(1, 1);
  const clock = new THREE.Group();
  scene.add(clock);

  const horiz = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ color: 0x000000, depthTest: false }));
  const vert = new THREE.Mesh(
    plane,
    new THREE.ShaderMaterial({ vertexShader: barVert, fragmentShader: vertFrag, depthTest: false }),
  );
  const hand = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ color: 0xffd600, depthTest: false }));
  horiz.renderOrder = 1;
  vert.renderOrder = 2;
  hand.renderOrder = 3;
  clock.add(horiz, vert, hand);

  let w = 1;
  let h = 1;
  let dpr = 1;

  function resize() {
    const r = canvas.getBoundingClientRect();
    w = Math.max(1, r.width);
    h = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.left = -w / 2;
    camera.right = w / 2;
    camera.top = h / 2;
    camera.bottom = -h / 2;
    camera.updateProjectionMatrix();
  }

  // progress: 0 at the top of the pinned story, 1 when it releases.
  function render(progress: number, ms: number, safe = { left: 0, right: w }) {
    const mobile = w < 900;
    const u = Math.min(w / 1920, h / 1080);
    let S = mobile ? Math.min(w * 0.62, h * 0.32) : 661 * u;
    let cx0 = 0;
    if (!mobile && safe.right > safe.left) {
      // The second hand sweeps a full circle, so keep that circle (plus a
      // margin) clear of the title and the copy column.
      const margin = Math.max(24, 40 * u);
      const span = safe.right - safe.left - margin * 2;
      const fit = span / (1 + 50 / 661);
      if (fit < S) S = Math.max(fit, 120);
      const mid = (safe.left + safe.right) / 2 - w / 2;
      const half = (S * (1 + 50 / 661)) / 2;
      // Stay on the design's centre line when it is clear, else move into the gap.
      const lo = safe.left - w / 2 + margin + half;
      const hi = safe.right - w / 2 - margin - half;
      cx0 = lo <= 0 && hi >= 0 ? 0 : lo <= hi ? Math.min(Math.max(0, lo), hi) : mid;
    }
    const T = (S * 50) / 661;
    const cy0 = mobile ? h * 0.03 : -92 * u;

    const a = easeInOut(smooth(0.06, 0.32, progress)); // clock grows
    const b = easeInOut(smooth(0.3, 0.5, progress)); // black arm floods
    const c = easeInOut(smooth(0.47, 0.6, progress)); // arms leave

    const L = S * lerp(1, mobile ? 4.6 : 3.48, a);
    clock.position.set(lerp(cx0, 0, a), lerp(cy0, 0, a), 0);

    const flood = Math.max(w, h) * 1.6;
    horiz.scale.set(Math.max(L + T, w * 1.2 * b + (L + T) * (1 - b)), lerp(T, flood, b), 1);

    vert.scale.set(T, L + T, 1);
    vert.position.x = lerp(0, -0.38 * w, b) - c * 0.5 * w;

    hand.scale.set(L + T, T, 1);
    const tick = tickAngle(ms);
    const half = Math.PI;
    let delta = (Math.PI / 4 - tick) % half;
    if (delta > half / 2) delta -= half;
    if (delta < -half / 2) delta += half;
    hand.rotation.z = tick + delta * smooth(0.04, 0.16, progress);
    hand.position.set(lerp(0, 0.34 * w, b) + c * 0.6 * w, lerp(0, -0.3 * h, b) - c * 0.6 * h, 0);

    // Sun: drifts back and forth and breathes. Fades as the clock grows.
    const t = ms / 1000;
    const R = (mobile ? w * 0.75 : 483 * u) * (1 + 0.06 * Math.sin(t * 0.9) + 0.025 * Math.sin(t * 2.3));
    const sx = (mobile ? w * 0.1 : 483 * u) + Math.sin(t * 0.32) * (mobile ? w * 0.18 : 240 * u);
    // Design centre: 1174px down the 1080 artboard (header 203 + 488 + radius 483).
    const sy0 = mobile ? h * 1.02 : h / 2 + 634 * u;
    const sy = sy0 + Math.sin(t * 0.45 + 1.2) * (mobile ? 24 : 48 * u);
    sunMat.uniforms.uCenter.value.set(sx * dpr, (h - sy) * dpr);
    sunMat.uniforms.uRadius.value = R * dpr;
    sunMat.uniforms.uOpacity.value = 1 - a;
    sun.visible = a < 1;

    renderer.render(scene, camera);
  }

  return { resize, render, renderer };
}
