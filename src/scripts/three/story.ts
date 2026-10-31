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
  uniform float uDim;
  varying vec2 vUv;
  void main() {
    vec3 cyan = vec3(0.0, 0.804, 0.894);
    vec3 pink = vec3(1.0, 0.0, 0.667);
    vec3 purple = vec3(0.224, 0.0, 0.494);
    float t = 1.0 - vUv.y;
    vec3 g = t < 0.5 ? mix(pink, purple, t / 0.5) : mix(purple, cyan, (t - 0.5) / 0.5);
    gl_FragColor = vec4(mix(mix(cyan, g, 0.5), vec3(1.0), uDim * 0.6), 1.0);
  }
`;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Second hand: snaps forward every half second with a small overshoot,
// like a quartz watch, and still goes round once a minute.
export function tickAngle(ms: number) {
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
    new THREE.ShaderMaterial({
      vertexShader: barVert,
      fragmentShader: vertFrag,
      depthTest: false,
      uniforms: { uDim: { value: 0 } },
    }),
  );
  const hand = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ color: 0xffd600, depthTest: false }));
  horiz.renderOrder = 1;
  vert.renderOrder = 2;
  hand.renderOrder = 3;
  clock.add(horiz, vert, hand);

  let w = 1;
  let h = 1;
  let dpr = 1;
  // Phones: bottom of the hero title (CSS px from the top of the canvas),
  // measured in main.ts. The clock's black arm rests just below it.
  let titleBottom: number | null = null;
  function below(y: number | null) {
    titleBottom = y;
  }

  // Hover: each arm is one of the 3 horizons (0 black, 1 blue, 2 yellow).
  // The arm under the pointer stays, the other two fade back.
  const pointer = { x: -1e4, y: -1e4 };
  let hovered = -1;
  let lastMs = 0;
  const dims = [0, 0, 0];
  const base = [new THREE.Color(0x000000), null, new THREE.Color(0xffd600)];
  const white = new THREE.Color(0xffffff);

  /** Pointer in CSS px relative to the canvas, or null when it left. */
  function point(x: number | null, y = 0) {
    pointer.x = x ?? -1e4;
    pointer.y = y;
  }

  function hitTest(S: number, T: number) {
    // Pointer relative to the clock centre, y up
    const dx = pointer.x - w / 2 - clock.position.x;
    const dy = h / 2 - pointer.y - clock.position.y;
    const half = (S + T) / 2;
    const reach = T / 2 + Math.max(10, T * 0.4);
    // Top most first: the hand, then blue, then black
    const c = Math.cos(-hand.rotation.z);
    const s = Math.sin(-hand.rotation.z);
    const rx = dx * c - dy * s;
    const ry = dx * s + dy * c;
    if (Math.abs(rx) <= half && Math.abs(ry) <= reach) return 2;
    if (Math.abs(dx) <= reach && Math.abs(dy) <= half) return 1;
    if (Math.abs(dy) <= reach && Math.abs(dx) <= half) return 0;
    return -1;
  }

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
  function render(progress: number, ms: number) {
    const mobile = w < 900;
    const u = Math.min(w / 1920, h / 1080);
    // Always centred; the hero text is fitted around it (see main.ts)
    // Phones: off to the right and partly off screen, as in 'Home - Mobile'
    // Phones: 15% larger than the Figma frame
    const S = mobile ? Math.min(w * 0.723, h * 0.36) * 1.15 : 661 * u;
    const cx0 = mobile ? w * 0.17 : 0;
    const T = (S * 50) / 661;
    const cy0 = mobile
      ? h / 2 - (titleBottom != null ? titleBottom + 22 + T / 2 : Math.min(322, h * 0.4))
      : -92 * u;

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

    // Hover only while the clock rests in the hero
    const dt = Math.min(0.05, (ms - (lastMs || ms)) / 1000);
    lastMs = ms;
    hovered = progress < 0.04 ? hitTest(S, T) : -1;
    const fade = 1 - smooth(0, 0.04, progress);
    [horiz, vert, hand].forEach((m, i) => {
      dims[i] += ((hovered >= 0 && hovered !== i ? 1 : 0) - dims[i]) * Math.min(1, dt * 10);
      const d = dims[i] * fade;
      const col = base[i];
      if (col) (m.material as THREE.MeshBasicMaterial).color.copy(col).lerp(white, d * 0.6);
      else (m.material as THREE.ShaderMaterial).uniforms.uDim.value = d;
    });

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
    sun.visible = a < 1 && !mobile; // phones use the CSS glows

    renderer.render(scene, camera);
  }

  return {
    resize,
    render,
    point,
    below,
    get hovered() {
      return hovered;
    },
    renderer,
  };
}
