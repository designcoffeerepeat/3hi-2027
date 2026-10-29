import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Service page heroes ('3d_Float_Shape' in Figma). One WebGL scene draws the
// whole hero: the background, the sun with its slowly flowing gradient, the
// drifting clouds (same layout as the home page Shopify spotlight) and an
// interactive glass shape in front. Everything sits in the same scene so the
// glass refracts the sun and clouds behind it.

export type Shape = 'prism' | 'blob' | 'cubes' | 'ribbon' | 'knot' | 'fins' | 'bag';

export interface FloatOptions {
  shape: Shape;
  background: string; // a colour, or "linear-gradient(90deg, a 0%, a 52%, b 100%)"
  sun: { color: string; at: number }[];
  clouds: string;
  reduced: boolean;
}

const MAX_STOPS = 4;

const backdropVert = /* glsl */ `
  varying vec2 vUv;
  uniform float uDepth;
  void main() {
    vUv = uv;
    // A full screen quad, whatever the camera does
    gl_Position = vec4(position.xy, uDepth, 1.0);
  }
`;

const backdropFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform vec2 uRes;
  uniform float uTime;
  uniform float uFront;
  uniform vec3 uBg0;
  uniform vec3 uBg1;
  uniform vec2 uBgRange;
  uniform vec3 uSunC;            // x, y (px, y down), radius (px)
  uniform vec3 uStops[${MAX_STOPS}];
  uniform float uAt[${MAX_STOPS}];
  uniform int uCount;
  uniform sampler2D uCloud;
  uniform vec4 uRect[3];         // x, y, w, h in px, y down
  uniform vec2 uLook[3];         // opacity, flip

  vec3 ramp(float g) {
    vec3 c = uStops[0];
    for (int i = 1; i < ${MAX_STOPS}; i++) {
      if (i >= uCount) break;
      float a = uAt[i - 1];
      float b = uAt[i];
      c = mix(c, uStops[i], smoothstep(a, b, g));
    }
    return c;
  }

  vec4 cloud(int i, vec2 p) {
    vec4 r = uRect[i];
    vec2 uv = (p - r.xy) / r.zw;
    // No early return: sampling in every pixel keeps the texture lookup
    // smooth along the edges of each cloud image.
    float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    uv = clamp(uv, 0.0, 1.0);
    if (uLook[i].y > 0.5) uv.x = 1.0 - uv.x;
    vec4 t = texture2D(uCloud, vec2(uv.x, 1.0 - uv.y));
    t.a *= uLook[i].x * inside;
    return t;
  }

  void main() {
    vec2 p = vec2(vUv.x * uRes.x, (1.0 - vUv.y) * uRes.y);

    if (uFront > 0.5) {
      vec4 c = cloud(2, p);
      gl_FragColor = vec4(c.rgb, c.a);
      #include <colorspace_fragment>
      return;
    }

    vec3 col = mix(uBg0, uBg1, smoothstep(uBgRange.x, uBgRange.y, vUv.x));

    // Sun: a radial gradient whose focus wanders and whose bands ripple,
    // so the colours slowly flow inside the disc.
    vec2 q = (p - uSunC.xy) / uSunC.z;
    float d = length(q);
    if (d < 1.02) {
      vec2 b = q * 0.5 + 0.5;
      float t = uTime;
      vec2 f = vec2(0.239, 0.882) + vec2(sin(t * 0.21), cos(t * 0.17)) * 0.14;
      vec2 w = vec2(sin(b.y * 4.0 + t * 0.35), cos(b.x * 3.5 - t * 0.3)) * 0.06;
      float g = length(b + w - f) / 1.05;
      g += 0.04 * sin(atan(q.y, q.x) * 2.0 + t * 0.25);
      vec3 sun = ramp(clamp(g, 0.0, 1.0));
      float edge = 1.0 - smoothstep(1.0 - 1.5 / uSunC.z, 1.0, d);
      col = mix(col, sun, edge);
    }

    for (int i = 0; i < 2; i++) {
      vec4 c = cloud(i, p);
      col = mix(col, c.rgb, c.a);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

function parseBackground(bg: string) {
  const colors = bg.match(/#[0-9a-f]{3,6}/gi) ?? ['#000000'];
  if (!bg.startsWith('linear-gradient') || colors.length < 2) {
    return { c0: new THREE.Color(colors[0]), c1: new THREE.Color(colors[0]), range: new THREE.Vector2(0, 1) };
  }
  const stops = [...bg.matchAll(/(#[0-9a-f]{3,6})\s+(\d+)%/gi)].map((m) => ({ c: m[1], at: Number(m[2]) / 100 }));
  const first = stops[stops.length - 2] ?? { c: colors[0], at: 0 };
  const last = stops[stops.length - 1] ?? { c: colors[colors.length - 1], at: 1 };
  return { c0: new THREE.Color(first.c), c1: new THREE.Color(last.c), range: new THREE.Vector2(first.at, last.at) };
}

/* ---------- Geometry helpers ---------- */

// Sweeps an elliptical cross section along a curve. profile(t) gives the
// half width, half thickness and twist (radians) at each point.
function sweep(
  curve: THREE.Curve<THREE.Vector3>,
  steps: number,
  radial: number,
  closed: boolean,
  profile: (t: number) => { w: number; h: number; twist: number },
) {
  const frames = curve.computeFrenetFrames(steps, closed);
  const pos: number[] = [];
  const idx: number[] = [];
  const P = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    curve.getPointAt(t, P);
    const k = closed && i === steps ? 0 : i;
    const N = frames.normals[k];
    const B = frames.binormals[k];
    const { w, h, twist } = profile(t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const x = Math.cos(a) * w;
      const y = Math.sin(a) * h;
      const cx = x * Math.cos(twist) - y * Math.sin(twist);
      const cy = x * Math.sin(twist) + y * Math.cos(twist);
      v.copy(P).addScaledVector(N, cx).addScaledVector(B, cy);
      pos.push(v.x, v.y, v.z);
    }
  }
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = (i + 1) * (radial + 1) + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function glass(params: THREE.MeshPhysicalMaterialParameters = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.04,
    transmission: 1,
    thickness: 0.5,
    ior: 1.5,
    iridescence: 0.8,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [120, 700],
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.2,
    side: THREE.DoubleSide,
    ...params,
  });
}

/* ---------- Shapes ----------
   Each builder returns a group sized to about 1 world unit across, plus an
   update hook for its own idle motion and hover reaction. */

interface Built {
  group: THREE.Group;
  update?: (t: number, dt: number, hover: number) => void;
  pickables?: THREE.Object3D[];
}

function buildPrism(): Built {
  const group = new THREE.Group();
  const mat = glass({ dispersion: 6, thickness: 1.2, iridescence: 1, flatShading: true, roughness: 0.02 });
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4, 0), mat);
  group.add(m);
  // Small chip floating below, as in the Figma render
  const chip = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), mat);
  chip.position.set(-0.2, -0.44, 0.25);
  group.add(chip);
  return {
    group,
    pickables: [m, chip],
    update: (t, dt, hover) => {
      m.rotation.x += dt * (0.12 + hover * 0.5);
      m.rotation.z += dt * (0.05 + hover * 0.2);
      chip.rotation.y += dt * 0.8;
      chip.position.y = -0.44 + Math.sin(t * 1.3) * 0.03;
    },
  };
}

function buildBlob(): Built {
  const group = new THREE.Group();
  // Indexed, so recomputed normals stay smooth instead of faceted
  const geo = mergeVertices(new THREE.IcosahedronGeometry(0.42, 20));
  const base = Float32Array.from(geo.attributes.position.array as Float32Array);
  const mat = glass({ color: 0xf2e9ff, thickness: 1.4, iridescence: 1, dispersion: 2, roughness: 0.08 });
  const m = new THREE.Mesh(geo, mat);
  group.add(m);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  let amp = 0.06;
  return {
    group,
    pickables: [m],
    update: (t, _dt, hover) => {
      amp += (0.06 + hover * 0.08 - amp) * 0.05;
      for (let i = 0; i < pos.count; i++) {
        v.set(base[i * 3], base[i * 3 + 1], base[i * 3 + 2]).normalize();
        // A soft rounded triangle that breathes
        const theta = Math.atan2(v.y, v.x);
        const tri = 1 + 0.18 * Math.cos(3 * theta + 0.5) * (1 - Math.abs(v.z));
        const n =
          Math.sin(v.x * 3.1 + t * 0.9) * Math.cos(v.y * 2.7 - t * 0.7) +
          Math.sin(v.z * 3.7 + t * 0.6) * 0.6;
        const r = 0.42 * tri * (1 + amp * n);
        pos.setXYZ(i, v.x * r, v.y * r, v.z * r * 0.72);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
    },
  };
}

function buildRibbon(): Built {
  const group = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.62, 0.42, -0.1),
    new THREE.Vector3(0.25, 0.3, 0.15),
    new THREE.Vector3(0.02, 0.02, 0),
    new THREE.Vector3(-0.18, -0.28, -0.12),
    new THREE.Vector3(-0.5, -0.46, 0.08),
  ]);
  const geo = sweep(curve, 160, 24, false, (t) => ({
    w: 0.04 + 0.14 * Math.pow(Math.abs(Math.cos(Math.PI * t)), 0.8),
    h: 0.02,
    twist: Math.PI * 1.1 * t,
  }));
  const m = new THREE.Mesh(
    geo,
    glass({
      color: 0xf4a6c8,
      thickness: 0.5,
      iridescence: 1,
      dispersion: 1.5,
      attenuationColor: new THREE.Color(0xe58bb4),
      attenuationDistance: 2.5,
    }),
  );
  m.scale.setScalar(0.82);
  group.add(m);
  return {
    group,
    pickables: [m],
    update: (t, _dt, hover) => {
      m.rotation.y = Math.sin(t * 0.4) * 0.35 + hover * 0.3;
      m.rotation.x = Math.sin(t * 0.3) * 0.15;
    },
  };
}

function buildKnot(): Built {
  const group = new THREE.Group();
  class Loop extends THREE.Curve<THREE.Vector3> {
    getPoint(u: number, target = new THREE.Vector3()) {
      const a = u * Math.PI * 2;
      // A figure-of-eight loop with depth, like the Figma glass ribbon
      return target.set(Math.sin(a) * 0.5, Math.sin(2 * a) * 0.28, Math.cos(a) * 0.22);
    }
  }
  const geo = sweep(new Loop(), 220, 20, true, (t) => ({
    w: 0.12 + 0.06 * Math.sin(t * Math.PI * 4),
    h: 0.018,
    twist: Math.PI * 2 * t,
  }));
  const m = new THREE.Mesh(
    geo,
    glass({ color: 0xffd3ea, thickness: 0.4, iridescence: 1, dispersion: 1.5, attenuationColor: new THREE.Color(0xd77aa8), attenuationDistance: 0.8 }),
  );
  group.add(m);
  return {
    group,
    pickables: [m],
    update: (_t, dt, hover) => {
      m.rotation.y += dt * (0.18 + hover * 0.6);
    },
  };
}

function buildFins(): Built {
  const group = new THREE.Group();
  const shape = new THREE.Shape();
  // A paddle: wide round head, tapering stem
  shape.moveTo(0, -0.42);
  shape.bezierCurveTo(0.08, -0.4, 0.06, -0.1, 0.2, 0.12);
  shape.bezierCurveTo(0.32, 0.32, 0.18, 0.46, 0, 0.46);
  shape.bezierCurveTo(-0.18, 0.46, -0.32, 0.32, -0.2, 0.12);
  shape.bezierCurveTo(-0.06, -0.1, -0.08, -0.4, 0, -0.42);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.02,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.02,
    bevelSegments: 6,
    curveSegments: 32,
  });
  geo.center();
  const pink = glass({ color: 0xffc4e0, thickness: 0.3, iridescence: 0.7, attenuationColor: new THREE.Color(0xf29ac4), attenuationDistance: 3 });
  const green = glass({ color: 0xbff0d4, thickness: 0.3, iridescence: 0.7, attenuationColor: new THREE.Color(0x7fd6a8), attenuationDistance: 3 });
  const fins: THREE.Mesh[] = [];
  const N = 7;
  for (let i = 0; i < N; i++) {
    const f = new THREE.Mesh(geo, i === N - 1 ? green : pink);
    fins.push(f);
    group.add(f);
  }
  // Tipped over so the stack cascades from top right to bottom left
  group.rotation.set(0.35, -0.55, -0.95);
  let spread = 0;
  return {
    group,
    pickables: fins,
    update: (t, _dt, hover) => {
      spread += (hover - spread) * 0.06;
      const s = 0.1 + spread * 0.12 + Math.sin(t * 0.8) * 0.015;
      fins.forEach((f, i) => {
        const k = i - (N - 1) / 2;
        f.position.set(k * 0.03, k * -0.075, k * 0.07);
        f.rotation.set(k * 0.05, k * s, 0);
      });
    },
  };
}

function buildBag(): Built {
  const group = new THREE.Group();
  const body = new RoundedBoxGeometry(0.62, 0.7, 0.26, 4, 0.025);
  // Slight taper: wider at the top like a shopping bag
  const p = body.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const k = 1 + y * 0.12;
    p.setX(i, p.getX(i) * k);
  }
  body.computeVertexNormals();
  // Holographic film rather than solid glass, so the dark sky does not
  // turn it black
  const mat = glass({
    color: 0xc8fbff,
    transmission: 0.92,
    metalness: 0.12,
    roughness: 0.05,
    thickness: 0.06,
    iridescence: 1,
    iridescenceIOR: 1.6,
    iridescenceThicknessRange: [100, 1400],
    envMapIntensity: 2.4,
    dispersion: 3,
  });
  const bag = new THREE.Mesh(body, mat);
  group.add(bag);
  const handleMat = glass({ color: 0xc6ffb8, thickness: 0.2, iridescence: 0.6 });
  for (const z of [0.08, -0.08]) {
    const c = new THREE.CubicBezierCurve3(
      new THREE.Vector3(-0.17, 0.33, z),
      new THREE.Vector3(-0.18, 0.72, z),
      new THREE.Vector3(0.18, 0.72, z),
      new THREE.Vector3(0.17, 0.33, z),
    );
    group.add(new THREE.Mesh(new THREE.TubeGeometry(c, 48, 0.014, 10, false), handleMat));
  }
  group.position.y = -0.12;
  group.rotation.y = 0.45;
  let swing = 0;
  let swingV = 0;
  return {
    group,
    pickables: [bag],
    update: (t, dt, hover) => {
      // Hover gives the bag a nudge; it swings back on a spring
      swingV += (-swing * 6 + hover * 0.8 * Math.sin(t * 3)) * dt;
      swingV *= 0.985;
      swing += swingV * dt * 4;
      group.rotation.z = swing * 0.25 + Math.sin(t * 0.6) * 0.04;
    },
  };
}

/* ---------- The magnetic cubes (UX/UI) ---------- */

interface Cube {
  mesh: THREE.Mesh;
  slot: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  target: THREE.Vector3;
}

function buildCubes(): Built & { cubes: Cube[]; slots: THREE.Vector3[] } {
  const group = new THREE.Group();
  const size = 0.3;
  const d = size / 2 + 0.01;
  const slots: THREE.Vector3[] = [];
  for (const x of [-d, d]) for (const y of [-d, d]) for (const z of [-d, d]) slots.push(new THREE.Vector3(x, y, z));
  const tints = [0xbfefff, 0xffd6f4, 0xfff2a8, 0xd8ccff, 0xb9ffe2, 0xffc9b8, 0xc7e0ff, 0xf8ffc8];
  const geo = new RoundedBoxGeometry(size, size, size, 4, 0.035);
  const cubes: Cube[] = slots.map((s, i) => {
    const mesh = new THREE.Mesh(geo, glass({ color: tints[i], thickness: 0.6, iridescence: 0.9, dispersion: 2 }));
    mesh.position.copy(s);
    mesh.userData.cube = i;
    group.add(mesh);
    return { mesh, slot: i, pos: s.clone(), vel: new THREE.Vector3(), target: s.clone() };
  });
  group.rotation.set(0.5, 0.7, 0);
  return { group, cubes, slots, pickables: cubes.map((c) => c.mesh) };
}

/* ---------- Scene ---------- */

export function createFloat(canvas: HTMLCanvasElement, surface: HTMLElement, opts: FloatOptions) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0, 10);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(3, 5, 6);
  scene.add(key, new THREE.AmbientLight(0xffffff, 0.4));

  /* Backdrop: background, sun and the two back cloud layers in one quad */
  const bg = parseBackground(opts.background);
  const stops = opts.sun.slice(0, MAX_STOPS);
  const stopCols = Array.from({ length: MAX_STOPS }, (_, i) => new THREE.Color(stops[Math.min(i, stops.length - 1)].color));
  const stopAt = Array.from({ length: MAX_STOPS }, (_, i) => stops[Math.min(i, stops.length - 1)].at);
  const cloudTex = new THREE.TextureLoader().load(opts.clouds);
  cloudTex.colorSpace = THREE.SRGBColorSpace;
  cloudTex.generateMipmaps = false;
  cloudTex.minFilter = THREE.LinearFilter;
  const uniforms = {
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uFront: { value: 0 },
    uDepth: { value: 0.9999 },
    uBg0: { value: bg.c0 },
    uBg1: { value: bg.c1 },
    uBgRange: { value: bg.range },
    uSunC: { value: new THREE.Vector3(0, 0, 400) },
    uStops: { value: stopCols },
    uAt: { value: stopAt },
    uCount: { value: stops.length },
    uCloud: { value: cloudTex },
    uRect: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    uLook: { value: [new THREE.Vector2(0.5, 1), new THREE.Vector2(1, 0), new THREE.Vector2(1, 0)] },
  };
  const quad = new THREE.PlaneGeometry(2, 2);
  const backMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: backdropVert,
    fragmentShader: backdropFrag,
    depthWrite: false,
    toneMapped: false,
  });
  const back = new THREE.Mesh(quad, backMat);
  back.frustumCulled = false;
  back.renderOrder = -10;
  scene.add(back);

  // Front cloud layer drawn over the shape, like 'cloud 3' in the spotlight
  const frontMat = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uFront: { value: 1 }, uDepth: { value: -0.9999 } },
    vertexShader: backdropVert,
    fragmentShader: backdropFrag,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const front = new THREE.Mesh(quad, frontMat);
  front.frustumCulled = false;
  front.renderOrder = 10;
  scene.add(front);

  /* The shape */
  const holder = new THREE.Group(); // placed and scaled to the layout
  const spin = new THREE.Group(); // turned by dragging
  holder.add(spin);
  scene.add(holder);

  const builders: Record<Shape, () => Built> = {
    prism: buildPrism,
    blob: buildBlob,
    ribbon: buildRibbon,
    knot: buildKnot,
    fins: buildFins,
    bag: buildBag,
    cubes: buildCubes,
  };
  const built = (builders[opts.shape] ?? buildPrism)();
  spin.add(built.group);
  const cubeKit = opts.shape === 'cubes' ? (built as ReturnType<typeof buildCubes>) : null;

  /* Layout: same artboard maths as the spotlight stage (1920 x 1080) */
  let W = 1;
  let H = 1;
  let S = 1;
  let mobile = false;
  const shapeCenter = new THREE.Vector2();
  function resize() {
    const r = surface.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    mobile = W < 900;
    S = Math.min(H / 1080, W / 1400);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    uniforms.uRes.value.set(W, H);

    const sunR = mobile ? Math.max(400 * S, W * 0.42) : 400 * S;
    uniforms.uSunC.value.set(W / 2, mobile ? H * 0.04 : 0, sunR);

    // World units per CSS pixel at z = 0
    const perPx = (2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / H;
    const sizePx = mobile ? Math.min(W * 0.9, H * 0.5) : 815 * S;
    if (mobile) shapeCenter.set(W / 2, H * 0.36);
    else shapeCenter.set(W / 2, H / 2 + 60 * S);
    holder.position.set((shapeCenter.x - W / 2) * perPx, -(shapeCenter.y - H / 2) * perPx, 0);
    holder.scale.setScalar(sizePx * perPx);
  }

  const cloudBase = [
    { left: -1367, bottom: -574, width: 2111, depth: 0.8 },
    { left: -988, bottom: -542, width: 2443, depth: 1 },
    { left: -1010, bottom: -656, width: 1623, depth: 1.25 },
  ];
  function placeClouds(t: number) {
    const s = mobile ? Math.max(S, W / 1100) : S;
    cloudBase.forEach((c, i) => {
      const w = c.width * s;
      const h = (w * 1122) / 2000;
      const drift = opts.reduced ? 0 : Math.sin(t * 0.25 + i * 1.7) * 14 * c.depth * s;
      const x = W / 2 + c.left * s + drift;
      const y = H - c.bottom * s - h;
      uniforms.uRect.value[i].set(x, y, w, h);
    });
  }

  /* Interaction */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2(9, 9);
  let hover = 0;
  let hoverTarget = 0;
  let pointerIn = false;
  const tilt = new THREE.Vector2();
  const tiltTarget = new THREE.Vector2();
  const spinVel = new THREE.Vector2(); // radians per second around screen y, x
  let dragging: 'spin' | 'cube' | null = null;
  let last = { x: 0, y: 0, t: 0 };
  let touched = false;

  const dragPlane = new THREE.Plane();
  const hit = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const local = new THREE.Vector3();
  let held: Cube | null = null;
  const grabOffset = new THREE.Vector3();

  function setPointer(e: PointerEvent) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    tiltTarget.set(ndc.x, ndc.y);
  }

  function pick() {
    if (!built.pickables) return null;
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObjects(built.pickables, false)[0] ?? null;
  }

  function nearestSlot(p: THREE.Vector3) {
    let best = 0;
    let bestD = Infinity;
    cubeKit!.slots.forEach((s, i) => {
      const dd = s.distanceToSquared(p);
      if (dd < bestD) {
        bestD = dd;
        best = i;
      }
    });
    return { index: best, dist: Math.sqrt(bestD) };
  }

  function toLocal(world: THREE.Vector3, out: THREE.Vector3) {
    return built.group.worldToLocal(out.copy(world));
  }

  canvas.addEventListener('pointerdown', (e) => {
    setPointer(e);
    touched = true;
    surface.classList.add('is-touched');
    const h = pick();
    if (cubeKit && h) {
      const cube = cubeKit.cubes.find((c) => c.mesh === h.object)!;
      held = cube;
      dragging = 'cube';
      // Drag on a plane facing the camera through the cube
      const wp = cube.mesh.getWorldPosition(tmp);
      dragPlane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()).negate(), wp);
      raycaster.ray.intersectPlane(dragPlane, hit);
      grabOffset.copy(wp).sub(hit);
    } else {
      dragging = 'spin';
    }
    last = { x: e.clientX, y: e.clientY, t: performance.now() };
    canvas.setPointerCapture(e.pointerId);
    surface.classList.add('is-dragging');
  });

  canvas.addEventListener('pointermove', (e) => {
    setPointer(e);
    pointerIn = true;
    if (dragging === 'spin') {
      const now = performance.now();
      const dt = Math.max(1, now - last.t) / 1000;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      rotateBy(dx * 0.008, dy * 0.008);
      spinVel.set((dx * 0.008) / dt, (dy * 0.008) / dt).clampLength(0, 8);
      last = { x: e.clientX, y: e.clientY, t: now };
    } else if (dragging === 'cube' && held) {
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(dragPlane, hit)) {
        toLocal(hit.add(grabOffset), local);
        // Magnetic pull towards the nearest slot when close to one
        const n = nearestSlot(local);
        const pull = Math.max(0, 1 - n.dist / 0.16);
        held.target.copy(local).lerp(cubeKit!.slots[n.index], pull * pull * 0.85);
      }
    } else if (e.pointerType === 'mouse') {
      const h = pick();
      hoverTarget = h ? 1 : 0;
      canvas.style.cursor = h ? 'grab' : '';
    }
  });

  function release(e: PointerEvent) {
    if (!dragging) return;
    if (dragging === 'cube' && held && cubeKit) {
      // Snap into the nearest slot; whoever was there swaps places
      const n = nearestSlot(held.pos);
      const other = cubeKit.cubes.find((c) => c.slot === n.index);
      if (other && other !== held) other.slot = held.slot;
      held.slot = n.index;
      cubeKit.cubes.forEach((c) => c.target.copy(cubeKit.slots[c.slot]));
      held = null;
    }
    dragging = null;
    surface.classList.remove('is-dragging');
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') {
      pointerIn = false;
      hoverTarget = 0;
      tiltTarget.set(0, 0);
    }
  });

  const qx = new THREE.Quaternion();
  const qy = new THREE.Quaternion();
  const AX = new THREE.Vector3(1, 0, 0);
  const AY = new THREE.Vector3(0, 1, 0);
  function rotateBy(ay: number, ax: number) {
    qy.setFromAxisAngle(AY, ay);
    qx.setFromAxisAngle(AX, ax);
    spin.quaternion.premultiply(qy).premultiply(qx);
  }

  /* Loop */
  let t = 0;
  let prev = performance.now();
  function render() {
    const now = performance.now();
    const dt = Math.min((now - prev) / 1000, 0.05);
    prev = now;
    t += opts.reduced ? 0 : dt;
    uniforms.uTime.value = t;
    placeClouds(t);

    hover += (hoverTarget - hover) * 0.08;
    if (!pointerIn) tiltTarget.multiplyScalar(0.95);
    tilt.lerp(tiltTarget, 0.05);

    // Float, tilt toward the pointer, idle spin and drag inertia
    holder.position.z = 0;
    built.group.position.y = opts.reduced ? 0 : Math.sin(t * 0.8) * 0.025;
    holder.rotation.set(-tilt.y * 0.18, tilt.x * 0.25, 0);
    if (dragging !== 'spin') {
      if (spinVel.lengthSq() > 1e-4) {
        rotateBy(spinVel.x * dt, spinVel.y * dt);
        spinVel.multiplyScalar(Math.pow(0.04, dt));
      } else if (!opts.reduced && !cubeKit) {
        rotateBy(dt * 0.08, 0);
      } else if (!opts.reduced && cubeKit && !dragging) {
        rotateBy(dt * 0.12, 0);
      }
    }

    built.update?.(t, dt, hover);

    if (cubeKit) {
      for (const c of cubeKit.cubes) {
        const k = c === held ? 220 : 90;
        const damp = c === held ? 22 : 9;
        tmp.copy(c.target).sub(c.pos).multiplyScalar(k);
        tmp.addScaledVector(c.vel, -damp);
        c.vel.addScaledVector(tmp, dt);
        c.pos.addScaledVector(c.vel, dt);
        c.mesh.position.copy(c.pos);
        // Pulled out cubes tip a little; seated ones sit square
        const off = c.pos.distanceTo(cubeKit.slots[c.slot]);
        c.mesh.rotation.set(c.vel.y * 0.04, c.vel.x * 0.04, off * 0.6);
      }
    }

    renderer.render(scene, camera);
  }

  resize();
  return {
    render,
    resize,
    get touched() {
      return touched;
    },
  };
}
