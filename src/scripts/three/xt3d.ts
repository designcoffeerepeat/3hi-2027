import * as THREE from 'three';

// 3D take on the hero 'xt - 1' mark, built like the AI scan gizmo (without
// its end spheres): black x, blue y and yellow z axes that turn slowly and
// can be dragged to orbit.
// Each arm is one of the 3 horizons; hovering (or tapping) an arm names it.
// On scroll the gizmo faces front, the yellow axis swings down into the
// diagonal and everything flattens, handing over to the 2D clock in
// story.ts without a jump.

const vert = /* glsl */ `
  varying vec3 vN;
  varying float vT;
  void main() {
    vN = normalize(normalMatrix * normal);
    vT = 0.5 - position.y;
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

  const xt = new THREE.Group(); // position and size
  const gizmo = new THREE.Group(); // orbit (idle turn and drag)
  const flat = new THREE.Group(); // squashes depth for the hand off
  xt.add(flat);
  flat.add(gizmo);
  scene.add(xt);

  const mat = (color: number, grad = false) =>
    new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uGrad: { value: grad ? 1 : 0 },
        uFlat: { value: 0 },
        uDim: { value: 0 },
      },
    });

  // Unit bars (1 long, scaled in render). Depths differ a touch so the
  // front faces stack like the 2D clock once flat: black, blue, yellow.
  const T = 50 / 661;
  const L = 1 + T; // square caps
  const box = new THREE.BoxGeometry(1, 1, 1);
  const colors = [0x000000, 0x00cde4, 0xffd600];
  const arms = colors.map((c, i) => new THREE.Mesh(box, mat(c, i === 1)));
  const [x, y, z] = arms;
  x.scale.set(L, T, T);
  y.scale.set(T, L, T * 1.04);
  z.scale.set(L, T, T * 1.08);
  gizmo.add(x, y, z);

  // The yellow arm lies along z as a gizmo, and along the clock's diagonal
  // once flat. Both are rotations of a bar along x.
  const zAxis = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0));
  const zFlat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 4));

  // Rest pose: the same three quarter view as the AI scan gizmo
  const rest = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.52, -0.62, 0, 'XYZ'));
  gizmo.quaternion.copy(rest);
  const orbit = rest.clone(); // the pose the idle turn and drags act on

  let w = 1;
  let h = 1;
  let S = 1;
  let last = 0;
  let hovered = -1;
  const dims = [0, 0, 0];
  const pointer = new THREE.Vector2(-9, -9);
  const ray = new THREE.Raycaster();
  const vel = new THREE.Vector2();
  let dragging = false;
  let lastMove = -1e9;
  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3(1, 0, 0);

  function rotateBy(dx: number, dy: number) {
    qa.setFromAxisAngle(up, dx);
    qb.setFromAxisAngle(right, dy);
    orbit.premultiply(qa).premultiply(qb);
  }

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
  function point(px: number | null, py = 0) {
    if (px === null) pointer.set(-9, -9);
    else pointer.set((px / w) * 2 - 1, -(py / h) * 2 + 1);
  }

  /** True when a press at this point (CSS px) should grab the gizmo. */
  function grabs(px: number, py: number) {
    const cx = w / 2 + xt.position.x;
    const cy = h / 2 - xt.position.y;
    return Math.hypot(px - cx, py - cy) < S * 0.62;
  }

  function dragStart() {
    dragging = true;
    vel.set(0, 0);
  }
  function dragMove(dx: number, dy: number) {
    if (!dragging) return;
    const k = 0.008;
    rotateBy(dx * k, dy * k);
    vel.set(dx * k, dy * k);
    lastMove = performance.now();
  }
  function dragEnd() {
    dragging = false;
    lastMove = performance.now();
  }

  // progress: the story's scroll progress. The 3D mark only lives at the
  // very top, then the flat clock takes over at HANDOFF.
  const HANDOFF = 0.05;

  function render(progress: number, ms: number, reduced: boolean) {
    const dt = Math.min(0.05, (ms - (last || ms)) / 1000);
    last = ms;
    const mobile = w < 900;
    const u = Math.min(w / 1920, h / 1080);
    S = mobile ? Math.min(w * 0.62, h * 0.32) : 661 * u;
    xt.position.set(0, mobile ? h * 0.03 : -92 * u, 0);
    xt.scale.setScalar(S);

    // Idle: inertia after a spin, then a slow turn about the vertical,
    // nearly paused while an arm is hovered so its label can be read.
    if (!dragging && progress <= 0) {
      if (vel.lengthSq() > 1e-8) {
        rotateBy(vel.x, vel.y);
        vel.multiplyScalar(0.94);
      }
      const idle = (ms - lastMove) / 1000;
      const speed = reduced ? 0 : (hovered >= 0 ? 0.04 : 0.3) * smooth(0.6, 2.4, idle);
      if (speed > 0) rotateBy(dt * speed, 0);
    }

    // Scroll: face front, swing yellow into the diagonal, then flatten
    const e = smooth(0, HANDOFF, progress);
    gizmo.quaternion.copy(orbit).slerp(qa.identity(), e);
    z.quaternion.copy(zAxis).slerp(zFlat, e);
    flat.scale.z = 1 - e * 0.98;
    for (const m of arms) (m.material as THREE.ShaderMaterial).uniforms.uFlat.value = e;

    // Hover: the arm under the pointer stays, the other two fade back
    hovered = -1;
    if (progress <= 0.002) {
      xt.updateMatrixWorld(true);
      ray.setFromCamera(pointer, camera);
      const hit = ray.intersectObjects(arms, false)[0];
      if (hit) hovered = arms.indexOf(hit.object as THREE.Mesh);
    }
    arms.forEach((a, i) => {
      const target = hovered >= 0 && hovered !== i ? 1 : 0;
      dims[i] += (target - dims[i]) * Math.min(1, dt * 10);
      const d = dims[i] * (1 - e);
      (a.material as THREE.ShaderMaterial).uniforms.uDim.value = d;
    });

    renderer.render(scene, camera);
  }

  // Where the hovered arm's label goes, in CSS px: whichever end of the
  // arm is nearer the top right, so it stays clear of the hero title.
  const v = new THREE.Vector3();
  function label(i: number) {
    if (i < 0) return null;
    const ends = [0.5, -0.5].map((s) => {
      if (i === 1) v.set(0, s, 0);
      else v.set(s, 0, 0);
      v.applyMatrix4(arms[i].matrixWorld).project(camera);
      return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
    });
    return ends[0].x - ends[0].y >= ends[1].x - ends[1].y ? ends[0] : ends[1];
  }

  return {
    resize,
    render,
    point,
    label,
    grabs,
    dragStart,
    dragMove,
    dragEnd,
    get hovered() {
      return hovered;
    },
    get dragging() {
      return dragging;
    },
    HANDOFF,
    renderer,
  };
}
