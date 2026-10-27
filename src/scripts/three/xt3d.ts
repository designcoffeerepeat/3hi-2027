import * as THREE from 'three';

// 3D take on the hero 'xt - 1' mark: the three arms as solid bars that turn
// slowly in space. Each arm is one of the 3 horizons; hovering (or tapping)
// an arm names it. On scroll the mark turns to face front and flattens, so
// it hands over to the 2D clock in story.ts without a jump.

const vert = /* glsl */ `
  uniform float uLen;
  varying vec3 vN;
  varying float vT;
  void main() {
    vN = normalize(normalMatrix * normal);
    vT = 0.5 - position.y / uLen;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Same colours as the 2D clock, with soft shading that fades out (uFlat)
// as the mark lands on the flat clock.
const frag = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uGrad;
  uniform float uFlat;
  uniform float uDim;
  varying vec3 vN;
  varying float vT;
  void main() {
    vec3 col = uColor;
    if (uGrad > 0.5) {
      vec3 cyan = vec3(0.0, 0.804, 0.894);
      vec3 pink = vec3(1.0, 0.0, 0.667);
      vec3 purple = vec3(0.224, 0.0, 0.494);
      float t = clamp(vT, 0.0, 1.0);
      vec3 g = t < 0.5 ? mix(pink, purple, t / 0.5) : mix(purple, cyan, (t - 0.5) / 0.5);
      col = mix(cyan, g, 0.5);
    }
    vec3 l = normalize(vec3(0.45, 0.6, 1.0));
    float shade = 0.78 + 0.32 * max(dot(normalize(vN), l), 0.0);
    col = col * mix(min(shade, 1.08), 1.0, uFlat);
    col = mix(col, vec3(1.0), uDim * 0.6);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function createXt3d(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const FOV = 30;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 10000);

  const xt = new THREE.Group(); // position and scroll pose
  const spin = new THREE.Group(); // idle turn
  const flat = new THREE.Group(); // squashes depth for the hand off
  xt.add(spin);
  spin.add(flat);
  scene.add(xt);

  // Unit bars, scaled to the clock size in render(). Depths differ a touch
  // so the front faces stack like the 2D clock (black, then blue, then yellow).
  const box = new THREE.BoxGeometry(1, 1, 1);
  const mat = (color: number, grad = false) =>
    new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uGrad: { value: grad ? 1 : 0 },
        uLen: { value: 1 },
        uFlat: { value: 0 },
        uDim: { value: 0 },
      },
    });
  const arms = [mat(0x000000), mat(0x00cde4, true), mat(0xffd600)].map((m) => new THREE.Mesh(box, m));
  const [horiz, vertArm, hand] = arms;
  hand.rotation.z = Math.PI / 4;
  flat.add(...arms);

  // Arm ends the labels hang from, in unit arm space
  const tips = [new THREE.Vector3(0.5, 0, 0), new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0.5, 0, 0)];

  let w = 1;
  let h = 1;
  let angle = 0.35;
  let last = 0;
  let hovered = -1;
  const dims = [0, 0, 0];
  const pointer = new THREE.Vector2(-9, -9);
  const ray = new THREE.Raycaster();

  function resize() {
    const r = canvas.getBoundingClientRect();
    w = Math.max(1, r.width);
    h = Math.max(1, r.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // One world unit is one CSS pixel at z = 0, like the ortho clock
    camera.position.set(0, 0, h / 2 / Math.tan((FOV * Math.PI) / 360));
    camera.updateProjectionMatrix();
  }

  /** Pointer in CSS px relative to the canvas, or null when it left. */
  function point(x: number | null, y = 0) {
    if (x === null) pointer.set(-9, -9);
    else pointer.set((x / w) * 2 - 1, -(y / h) * 2 + 1);
  }

  // progress: the story's scroll progress. The 3D mark only lives at the
  // very top, then the flat clock takes over at HANDOFF.
  const HANDOFF = 0.05;

  function render(progress: number, ms: number, reduced: boolean) {
    const dt = Math.min(0.05, (ms - (last || ms)) / 1000);
    last = ms;
    const mobile = w < 900;
    const u = Math.min(w / 1920, h / 1080);
    const S = mobile ? Math.min(w * 0.62, h * 0.32) : 661 * u;
    const T = (S * 50) / 661;
    xt.position.set(0, mobile ? h * 0.03 : -92 * u, 0);

    horiz.scale.set(S + T, T, T);
    vertArm.scale.set(T, S + T, T * 1.04);
    hand.scale.set(S + T, T, T * 1.08);
    (vertArm.material as THREE.ShaderMaterial).uniforms.uLen.value = 1;

    // Scroll: turn to face front and flatten by HANDOFF
    const e = smooth(0, HANDOFF, progress);
    if (progress <= 0 && !reduced) angle += dt * (hovered >= 0 ? 0.05 : 0.32);
    const wrapped = Math.atan2(Math.sin(angle), Math.cos(angle));
    spin.rotation.set(Math.sin(ms / 4200) * 0.22 * (1 - e), wrapped * (1 - e), 0);
    flat.scale.z = 1 - e * 0.999;
    for (const a of arms) (a.material as THREE.ShaderMaterial).uniforms.uFlat.value = e;

    // Hover: the arm under the pointer stays, the other two fade back
    hovered = -1;
    if (progress <= 0.002) {
      ray.setFromCamera(pointer, camera);
      const hit = ray.intersectObjects(arms, false)[0];
      if (hit) hovered = arms.indexOf(hit.object as THREE.Mesh);
    }
    arms.forEach((a, i) => {
      const target = hovered >= 0 && hovered !== i ? 1 : 0;
      dims[i] += (target - dims[i]) * Math.min(1, dt * 10);
      (a.material as THREE.ShaderMaterial).uniforms.uDim.value = dims[i] * (1 - e);
    });

    renderer.render(scene, camera);
  }

  // Where the hovered arm's label goes, in CSS px. The label hangs off
  // whichever end of the arm is nearer the top right, so it never sits
  // under the hero text on the left.
  const v = new THREE.Vector3();
  function label(i: number) {
    if (i < 0) return null;
    const ends = [tips[i].clone(), tips[i].clone().negate()].map((t) => {
      v.copy(t).applyMatrix4(arms[i].matrixWorld).project(camera);
      return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
    });
    return ends[0].x - ends[0].y >= ends[1].x - ends[1].y ? ends[0] : ends[1];
  }

  return {
    resize,
    render,
    point,
    label,
    get hovered() {
      return hovered;
    },
    HANDOFF,
    renderer,
  };
}
