import * as THREE from 'three';

// Service page heroes ('3d_Float_Shape' in Figma), drawn in the same simple
// language as the 'xt' axis in the AI scan section: square bars in ink, the
// cyan gradient and sun yellow, matte, on a transparent canvas. The sun and
// clouds behind are CSS (ServiceHero.astro), so the WebGL work stays tiny.

export type Shape = 'prism' | 'blob' | 'cubes' | 'ribbon' | 'knot' | 'fins' | 'bag';

export interface FloatOptions {
  shape: Shape;
  tone?: 'dark' | 'light';
  reduced: boolean;
}

const T = 0.07; // bar weight, the same ratio as the xt mark

/* ---------- Materials ---------- */

function palette(tone: 'dark' | 'light') {
  // On dark heroes the 'black' bar of the mark turns white so it stays visible
  const ink = new THREE.MeshStandardMaterial({ color: tone === 'dark' ? 0xf4f2ee : 0x111111, roughness: 0.55 });
  const sun = new THREE.MeshStandardMaterial({ color: 0xffd600, roughness: 0.4 });
  const grad = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 });
  return { ink, sun, grad };
}

// Bakes the xt pink, purple and cyan gradient along the longest side
function gradientColors(geo: THREE.BufferGeometry) {
  geo.computeBoundingBox();
  const b = geo.boundingBox!;
  const size = b.getSize(new THREE.Vector3());
  const axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
  const min = b.min[axis];
  const len = size[axis] || 1;
  const pos = geo.attributes.position;
  const stops = [new THREE.Color(0xff00aa), new THREE.Color(0x39007e), new THREE.Color(0x00cde4)];
  const cyan = new THREE.Color(0x00cde4);
  const c = new THREE.Color();
  const cols: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const v = axis === 'x' ? pos.getX(i) : axis === 'y' ? pos.getY(i) : pos.getZ(i);
    const t = 1 - (v - min) / len;
    if (t < 0.5) c.lerpColors(stops[0], stops[1], t / 0.5);
    else c.lerpColors(stops[1], stops[2], (t - 0.5) / 0.5);
    c.lerp(cyan, 0.5);
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return geo;
}

type Pal = ReturnType<typeof palette>;
type Look = keyof Pal;

function box(w: number, h: number, d: number, look: Look, pal: Pal) {
  const geo = new THREE.BoxGeometry(w, h, d, 1, look === 'grad' ? 16 : 1, 1);
  if (look === 'grad') gradientColors(geo);
  return new THREE.Mesh(geo, pal[look]);
}

// A bar from a to b, with square caps like the mark
function bar(a: THREE.Vector3, b: THREE.Vector3, look: Look, pal: Pal, weight = T) {
  const dir = b.clone().sub(a);
  const m = box(weight, dir.length() + weight, weight, look, pal);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

const V = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);

/* ---------- Shapes ----------
   Each builder returns a group about 1 unit across and an update hook for
   its idle motion and hover reaction (hover runs 0 to 1). */

interface Built {
  group: THREE.Group;
  update?: (t: number, dt: number, hover: number) => void;
}

// Services: an open cube frame, its edges coloured like the x, y, z axes
function buildPrism(pal: Pal): Built {
  const group = new THREE.Group();
  const h = 0.3;
  for (const a of [-h, h]) {
    for (const b of [-h, h]) {
      group.add(bar(V(-h, a, b), V(h, a, b), 'ink', pal));
      group.add(bar(V(a, -h, b), V(a, h, b), 'grad', pal));
      group.add(bar(V(a, b, -h), V(a, b, h), 'sun', pal));
    }
  }
  group.rotation.set(0.52, -0.62, 0);
  return {
    group,
    update: (_t, dt, hover) => {
      group.rotation.y += dt * hover * 1.4;
    },
  };
}

// AI Integration: a spark of bars through one point that opens on hover
function buildBlob(pal: Pal): Built {
  const group = new THREE.Group();
  const looks: Look[] = ['ink', 'grad', 'sun', 'grad'];
  const arms = looks.map((look, i) => {
    const pivot = new THREE.Group();
    pivot.add(bar(V(0, -0.42), V(0, 0.42), look, pal));
    pivot.rotation.z = (i * Math.PI) / 4;
    group.add(pivot);
    return pivot;
  });
  group.rotation.set(0.3, -0.5, 0);
  let open = 0;
  return {
    group,
    update: (t, _dt, hover) => {
      open += (hover - open) * 0.08;
      arms.forEach((a, i) => {
        a.rotation.x = (i - 1.5) * open * 0.45;
        a.rotation.z = (i * Math.PI) / 4 + Math.sin(t * 0.5 + i) * 0.04;
      });
    },
  };
}

// SEO: three rising columns on a base line; hover lifts them higher
function buildRibbon(pal: Pal): Built {
  const group = new THREE.Group();
  group.add(bar(V(-0.42, -0.38), V(0.42, -0.38), 'ink', pal));
  const heights = [0.32, 0.52, 0.76];
  const looks: Look[] = ['ink', 'grad', 'sun'];
  const cols = heights.map((hgt, i) => {
    const c = box(0.16, 1, 0.16, looks[i], pal);
    c.position.x = -0.26 + i * 0.26;
    group.add(c);
    return { c, hgt };
  });
  group.rotation.set(0.25, -0.55, 0);
  let lift = 0;
  return {
    group,
    update: (t, _dt, hover) => {
      lift += (hover - lift) * 0.08;
      cols.forEach(({ c, hgt }, i) => {
        const h = hgt * (1 + lift * 0.25) + Math.sin(t * 0.9 + i) * 0.015;
        c.scale.y = h;
        c.position.y = -0.38 + T / 2 + h / 2;
      });
    },
  };
}

// Growth Marketing: an arrow pointing up and to the right; hover pushes it on
function buildKnot(pal: Pal): Built {
  const group = new THREE.Group();
  const arrow = new THREE.Group();
  const tip = V(0.36, 0.36);
  arrow.add(bar(V(-0.4, -0.4), tip, 'grad', pal));
  arrow.add(bar(tip, V(0.36, 0.02), 'sun', pal));
  arrow.add(bar(tip, V(0.02, 0.36), 'ink', pal));
  group.add(arrow);
  group.rotation.set(0.2, -0.45, 0);
  let push = 0;
  return {
    group,
    update: (t, _dt, hover) => {
      push += (hover - push) * 0.08;
      const d = push * 0.08 * (0.6 + 0.4 * Math.sin(t * 6)) + Math.sin(t * 1.1) * 0.01;
      arrow.position.set(d, d, 0);
    },
  };
}

// Social Media: a hashtag whose four bars come apart on hover
function buildFins(pal: Pal): Built {
  const group = new THREE.Group();
  const parts = [
    { m: bar(V(-0.12, -0.42), V(-0.02, 0.42), 'grad', pal), out: V(-1, 0, 0.6) },
    { m: bar(V(0.1, -0.42), V(0.2, 0.42), 'grad', pal), out: V(1, 0, -0.6) },
    { m: bar(V(-0.4, 0.14), V(0.4, 0.14), 'ink', pal), out: V(0, 1, 0.8) },
    { m: bar(V(-0.4, -0.14), V(0.4, -0.14), 'sun', pal), out: V(0, -1, -0.8) },
  ];
  const home = parts.map((p) => p.m.position.clone());
  parts.forEach((p) => group.add(p.m));
  group.rotation.set(0.25, -0.5, 0);
  let spread = 0;
  return {
    group,
    update: (t, _dt, hover) => {
      spread += (hover - spread) * 0.08;
      parts.forEach((p, i) => {
        p.m.position.copy(home[i]).addScaledVector(p.out, spread * 0.14 + Math.sin(t * 0.8 + i) * 0.006);
      });
    },
  };
}

// Shopify: a bag drawn as a box frame with a handle. Hover swings it, flips
// it over and tips out a few small blocks, then it turns back upright.
function buildBag(pal: Pal, space: THREE.Object3D): Built {
  const group = new THREE.Group();
  const flip = new THREE.Group();
  group.add(flip);
  const w = 0.25;
  const h = 0.32;
  const d = 0.12;
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      flip.add(bar(V(-w, a * h, b * d), V(w, a * h, b * d), 'ink', pal));
      flip.add(bar(V(a * w, -h, b * d), V(a * w, h, b * d), 'grad', pal));
      flip.add(bar(V(a * w, b * h, -d), V(a * w, b * h, d), 'sun', pal));
    }
  }
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.13, T / 2, 8, 32, Math.PI), pal.sun);
  handle.position.y = h;
  flip.add(handle);
  group.rotation.set(0.15, -0.5, 0);

  const blocks: { m: THREE.Mesh; vel: THREE.Vector3; spin: THREE.Vector3; life: number }[] = [];
  const looks: Look[] = ['sun', 'grad', 'ink'];
  const mouth = new THREE.Vector3();
  let swing = 0;
  let swingV = 0;
  let wasOn = false;
  let clock = -1;
  let poured = 0;
  return {
    group,
    update: (t, dt, hover) => {
      swingV += (-swing * 6 + hover * 0.8 * Math.sin(t * 3)) * dt;
      swingV *= 0.985;
      swing += swingV * dt * 4;
      group.rotation.z = swing * 0.25 + Math.sin(t * 0.6) * 0.03;

      const on = hover > 0.5;
      if (on && !wasOn && clock < 0) {
        clock = 0;
        poured = 0;
      }
      wasOn = on;
      if (clock >= 0) {
        clock += dt;
        const over = clock < 0.6 ? clock / 0.6 : clock < 1.6 ? 1 : Math.max(0, 1 - (clock - 1.6) / 0.7);
        const e = over * over * (3 - 2 * over);
        flip.rotation.z = e * Math.PI;
        flip.position.y = Math.sin(e * Math.PI) * 0.1;
        if (clock > 0.5 && poured < 6 && clock > 0.5 + poured * 0.15) {
          mouth.set((Math.random() - 0.5) * 0.3, h, 0);
          flip.localToWorld(mouth);
          space.worldToLocal(mouth);
          const m = box(0.07, 0.07, 0.07, looks[poured % 3], pal);
          m.position.copy(mouth);
          space.add(m);
          blocks.push({
            m,
            vel: V((Math.random() - 0.5) * 0.5, -0.15, (Math.random() - 0.5) * 0.3),
            spin: V(Math.random() * 6 - 3, Math.random() * 6 - 3, 0),
            life: 0,
          });
          poured++;
        }
        if (clock > 2.3) {
          clock = -1;
          flip.rotation.z = 0;
          flip.position.y = 0;
        }
      }
      for (let i = blocks.length - 1; i >= 0; i--) {
        const b = blocks[i];
        b.life += dt;
        b.vel.y -= 1.6 * dt;
        b.m.position.addScaledVector(b.vel, dt);
        b.m.rotation.x += b.spin.x * dt;
        b.m.rotation.y += b.spin.y * dt;
        const s = Math.min(1, b.life / 0.15) * Math.max(0, 1 - Math.max(0, b.life - 1.2) / 0.5);
        b.m.scale.setScalar(s);
        if (s <= 0 && b.life > 1) {
          space.remove(b.m);
          b.m.geometry.dispose();
          blocks.splice(i, 1);
        }
      }
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

function buildCubes(pal: Pal): Built & { cubes: Cube[]; slots: THREE.Vector3[] } {
  const group = new THREE.Group();
  const size = 0.28;
  const d = size / 2 + 0.008;
  const slots: THREE.Vector3[] = [];
  for (const x of [-d, d]) for (const y of [-d, d]) for (const z of [-d, d]) slots.push(V(x, y, z));
  const looks: Look[] = ['ink', 'sun', 'grad', 'ink', 'sun', 'grad', 'sun', 'ink'];
  const cubes: Cube[] = slots.map((s, i) => {
    const mesh = box(size, size, size, looks[i], pal);
    mesh.position.copy(s);
    group.add(mesh);
    return { mesh, slot: i, pos: s.clone(), vel: new THREE.Vector3(), target: s.clone() };
  });
  group.rotation.set(0.52, -0.62, 0);
  return { group, cubes, slots };
}

/* ---------- Scene ---------- */

export function createFloat(canvas: HTMLCanvasElement, surface: HTMLElement, opts: FloatOptions) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  camera.position.set(0, 0, 10);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d4ff, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(3, 4, 6);
  scene.add(key);

  const pal = palette(opts.tone ?? 'dark');
  const holder = new THREE.Group(); // placed and scaled to the layout
  const spin = new THREE.Group(); // turned by dragging
  holder.add(spin);
  scene.add(holder);

  const builders: Record<Shape, () => Built> = {
    prism: () => buildPrism(pal),
    blob: () => buildBlob(pal),
    ribbon: () => buildRibbon(pal),
    knot: () => buildKnot(pal),
    fins: () => buildFins(pal),
    bag: () => buildBag(pal, holder),
    cubes: () => buildCubes(pal),
  };
  const built = (builders[opts.shape] ?? builders.prism)();
  spin.add(built.group);
  const cubeKit = opts.shape === 'cubes' ? (built as ReturnType<typeof buildCubes>) : null;
  const pickables: THREE.Object3D[] = [];
  built.group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) pickables.push(o);
  });

  /* Layout: same artboard maths as the CSS stage (1920 x 1080) */
  function resize() {
    const r = surface.getBoundingClientRect();
    const W = Math.max(1, r.width);
    const H = Math.max(1, r.height);
    const mobile = W < 900;
    const S = Math.min(H / 1080, W / 1400);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    const perPx = (2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / H;
    const sizePx = mobile ? Math.min(W * 0.8, H * 0.42) : 560 * S;
    const cy = mobile ? H * 0.34 : H / 2 + 40 * S;
    holder.position.set(0, -(cy - H / 2) * perPx, 0);
    holder.scale.setScalar(sizePx * perPx);
  }

  /* Interaction: drag to spin with inertia, tilt toward the pointer, hover */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2(9, 9);
  let hover = 0;
  let hoverTarget = 0;
  let pointerIn = false;
  const tilt = new THREE.Vector2();
  const tiltTarget = new THREE.Vector2();
  const spinVel = new THREE.Vector2();
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
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObjects(pickables, false)[0] ?? null;
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

  canvas.addEventListener('pointerdown', (e) => {
    setPointer(e);
    touched = true;
    surface.classList.add('is-touched');
    const h = pick();
    // Touch has no hover, so pressing the shape plays its hover reaction
    if (e.pointerType !== 'mouse' && h) hoverTarget = 1;
    const cube = cubeKit && h ? cubeKit.cubes.find((c) => c.mesh === h.object) : null;
    if (cube) {
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
        built.group.worldToLocal(local.copy(hit.add(grabOffset)));
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
    if (e.pointerType !== 'mouse') hoverTarget = 0;
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

    hover += (hoverTarget - hover) * 0.1;
    if (!pointerIn) tiltTarget.multiplyScalar(0.95);
    tilt.lerp(tiltTarget, 0.05);

    // Float, tilt toward the pointer, slow idle turn and drag inertia
    built.group.position.y = opts.reduced ? 0 : Math.sin(t * 0.8) * 0.02;
    holder.rotation.set(-tilt.y * 0.15, tilt.x * 0.22, 0);
    if (dragging !== 'spin') {
      if (spinVel.lengthSq() > 1e-4) {
        rotateBy(spinVel.x * dt, spinVel.y * dt);
        spinVel.multiplyScalar(Math.pow(0.04, dt));
      } else if (!opts.reduced && !dragging) {
        rotateBy(dt * 0.1, 0);
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
