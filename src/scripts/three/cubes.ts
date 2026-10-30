import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// AI Integration hero: eight tinted glass cubes that can be spun, pulled out
// and dropped back in. They snap to the nearest slot and swap places with
// whoever was there. No transmission pass: the glass is a see-through
// physical material lit by a small baked room, so it stays cheap.

interface Cube {
  mesh: THREE.Mesh;
  slot: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  target: THREE.Vector3;
}

// Tints from the 3d_Float_Shape cube in Figma
const TINTS = [0xff5b57, 0x8be04a, 0x6fd6f2, 0xf0e6f2, 0x9aa3ad, 0xff5b57, 0xc9f0ff, 0x8be04a];

export function createCubes(canvas: HTMLCanvasElement, surface: HTMLElement, reduced: boolean) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(28, 1, 5, 15);
  camera.position.set(0, 0, 10);
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(3, 4, 6);
  scene.add(key);

  const holder = new THREE.Group(); // placed and scaled to the layout
  const spin = new THREE.Group(); // turned by dragging
  const group = new THREE.Group();
  holder.add(spin);
  spin.add(group);
  scene.add(holder);

  const size = 0.28;
  const d = size / 2 + 0.006;
  const geo = new RoundedBoxGeometry(size, size, size, 3, 0.035);
  const slots: THREE.Vector3[] = [];
  for (const x of [-d, d]) for (const y of [-d, d]) for (const z of [-d, d]) slots.push(new THREE.Vector3(x, y, z));
  const cubes: Cube[] = slots.map((s, i) => {
    const mat = new THREE.MeshPhysicalMaterial({
      color: TINTS[i],
      metalness: 0,
      roughness: 0.12,
      transparent: true,
      opacity: 0.62,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      iridescence: 0.7,
      iridescenceIOR: 1.4,
      envMapIntensity: 1.6,
      specularIntensity: 1,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(s);
    group.add(mesh);
    return { mesh, slot: i, pos: s.clone(), vel: new THREE.Vector3(), target: s.clone() };
  });
  group.rotation.set(0.52, -0.62, 0);
  const pickables = cubes.map((c) => c.mesh);

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
    const sizePx = mobile ? Math.min(W * 0.95, H * 0.5) : 760 * S;
    const cy = mobile ? H * 0.34 : H / 2 + 40 * S;
    holder.position.set(0, -(cy - H / 2) * perPx, 0);
    holder.scale.setScalar(sizePx * perPx);
  }

  /* Interaction: drag to spin with inertia, tilt toward the pointer,
     or grab a cube and pull it out */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2(9, 9);
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
    slots.forEach((s, i) => {
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
    const h = pick();
    // Off the cubes, a touch is a scroll, not a spin
    if (!h && e.pointerType !== 'mouse') return;
    touched = true;
    surface.classList.add('is-touched');
    const cube = h ? cubes.find((c) => c.mesh === h.object) : null;
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
        group.worldToLocal(local.copy(hit.add(grabOffset)));
        // Magnetic pull towards the nearest slot when close to one
        const n = nearestSlot(local);
        const pull = Math.max(0, 1 - n.dist / 0.16);
        held.target.copy(local).lerp(slots[n.index], pull * pull * 0.85);
      }
    } else if (e.pointerType === 'mouse') {
      canvas.style.cursor = pick() ? 'grab' : '';
    }
  });

  function release(e: PointerEvent) {
    if (!dragging) return;
    if (dragging === 'cube' && held) {
      // Snap into the nearest slot; whoever was there swaps places
      const n = nearestSlot(held.pos);
      const other = cubes.find((c) => c.slot === n.index);
      if (other && other !== held) other.slot = held.slot;
      held.slot = n.index;
      cubes.forEach((c) => c.target.copy(slots[c.slot]));
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
    t += reduced ? 0 : dt;

    if (!pointerIn) tiltTarget.multiplyScalar(0.95);
    tilt.lerp(tiltTarget, 0.05);

    // Float, tilt toward the pointer, slow idle turn and drag inertia
    group.position.y = reduced ? 0 : Math.sin(t * 0.8) * 0.02;
    holder.rotation.set(-tilt.y * 0.15, tilt.x * 0.22, 0);
    if (dragging !== 'spin') {
      if (spinVel.lengthSq() > 1e-4) {
        rotateBy(spinVel.x * dt, spinVel.y * dt);
        spinVel.multiplyScalar(Math.pow(0.04, dt));
      } else if (!reduced && !dragging) {
        rotateBy(dt * 0.1, 0);
      }
    }

    for (const c of cubes) {
      const k = c === held ? 220 : 90;
      const damp = c === held ? 22 : 9;
      tmp.copy(c.target).sub(c.pos).multiplyScalar(k);
      tmp.addScaledVector(c.vel, -damp);
      c.vel.addScaledVector(tmp, dt);
      c.pos.addScaledVector(c.vel, dt);
      c.mesh.position.copy(c.pos);
      // Pulled out cubes tip a little; seated ones sit square
      const off = c.pos.distanceTo(slots[c.slot]);
      c.mesh.rotation.set(c.vel.y * 0.04, c.vel.x * 0.04, off * 0.6);
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
