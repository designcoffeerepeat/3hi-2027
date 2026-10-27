import * as THREE from 'three';

// 'xt - 1 three.js 3D Interaction': the mark as the x, y, z gizmo of a 3D
// design tool. Drag to orbit it like a work space; when left alone it drifts
// gently and settles back into the logo pose.

export function createAxis(canvas: HTMLCanvasElement, surface: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  camera.position.set(0, 0, 6.6);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d4ff, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(3, 4, 6);
  scene.add(key);

  const T = 0.151; // 50 / 661 * 2, the stroke weight of the mark
  const L = 2 + T; // square caps

  const gizmo = new THREE.Group();
  scene.add(gizmo);

  // X: black
  const x = new THREE.Mesh(
    new THREE.BoxGeometry(L, T, T),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.55 }),
  );
  // Y: cyan with the pink to purple gradient, baked into vertex colours
  const yGeo = new THREE.BoxGeometry(T, L, T, 1, 24, 1);
  const pos = yGeo.attributes.position;
  const cols: number[] = [];
  const cyan = new THREE.Color(0x00cde4);
  const stops = [new THREE.Color(0xff00aa), new THREE.Color(0x39007e), new THREE.Color(0x00cde4)];
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = 1 - (pos.getY(i) / L + 0.5);
    if (t < 0.5) tmp.lerpColors(stops[0], stops[1], t / 0.5);
    else tmp.lerpColors(stops[1], stops[2], (t - 0.5) / 0.5);
    tmp.lerp(cyan, 0.5);
    cols.push(tmp.r, tmp.g, tmp.b);
  }
  yGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const y = new THREE.Mesh(yGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 }));
  // Z: sun yellow
  const z = new THREE.Mesh(
    new THREE.BoxGeometry(T, T, L),
    new THREE.MeshStandardMaterial({ color: 0xffd600, roughness: 0.4 }),
  );
  gizmo.add(x, y, z);

  // Tiny end caps hint at the positive direction of each axis, like a gizmo.
  const capGeo = new THREE.SphereGeometry(T * 0.9, 20, 12);
  const caps: [THREE.Vector3, number][] = [
    [new THREE.Vector3(L / 2 + T, 0, 0), 0x111111],
    [new THREE.Vector3(0, L / 2 + T, 0), 0x2f6fd8],
    [new THREE.Vector3(0, 0, L / 2 + T), 0xffd600],
  ];
  for (const [p, c] of caps) {
    const m = new THREE.Mesh(capGeo, new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 }));
    m.position.copy(p);
    m.scale.setScalar(0.0001);
    m.userData.cap = true;
    gizmo.add(m);
  }

  // Rest pose: z axis reads as the yellow diagonal of the logo.
  const rest = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.52, -0.62, 0, 'XYZ'));
  gizmo.quaternion.copy(rest);

  const vel = new THREE.Vector2(); // radians per frame around screen y and x
  let dragging = false;
  let last = { x: 0, y: 0 };
  let lastMove = -1e9;
  let touched = false;
  const qy = new THREE.Quaternion();
  const qx = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3(1, 0, 0);

  function rotateBy(dx: number, dy: number) {
    qy.setFromAxisAngle(up, dx);
    qx.setFromAxisAngle(right, dy);
    gizmo.quaternion.premultiply(qy).premultiply(qx);
  }

  surface.addEventListener('pointerdown', (e) => {
    dragging = true;
    last = { x: e.clientX, y: e.clientY };
    vel.set(0, 0);
    surface.setPointerCapture(e.pointerId);
    if (!touched) {
      touched = true;
      surface.classList.add('is-touched');
    }
  });
  surface.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = (e.clientX - last.x) * 0.008;
    const dy = (e.clientY - last.y) * 0.008;
    last = { x: e.clientX, y: e.clientY };
    rotateBy(dx, dy);
    vel.set(dx, dy);
    lastMove = performance.now();
  });
  const end = () => {
    dragging = false;
    lastMove = performance.now();
  };
  surface.addEventListener('pointerup', end);
  surface.addEventListener('pointercancel', end);

  function resize() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, r.width);
    const h = Math.max(1, r.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  const wobble = new THREE.Quaternion();
  const target = new THREE.Quaternion();
  const e = new THREE.Euler();

  function render(ms: number) {
    const t = ms / 1000;
    if (!dragging) {
      // Inertia after a spin
      if (vel.lengthSq() > 1e-8) {
        rotateBy(vel.x, vel.y);
        vel.multiplyScalar(0.94);
      }
      // Idle: a slow breathing drift around the rest pose. After a spin it
      // waits a moment, then eases back.
      const idleFor = (ms - lastMove) / 1000;
      e.set(Math.sin(t * 0.6) * 0.12, Math.sin(t * 0.43 + 1) * 0.22, Math.sin(t * 0.31) * 0.05);
      wobble.setFromEuler(e);
      target.copy(rest).multiply(wobble);
      const pull = idleFor > 2.2 ? Math.min(0.035, (idleFor - 2.2) * 0.01) : 0;
      if (pull > 0) gizmo.quaternion.slerp(target, pull);
    }
    // Caps grow in once someone starts to play, so the idle pose stays the logo.
    for (const c of gizmo.children) {
      if (c.userData.cap) {
        const s = c.scale.x + ((touched ? 1 : 0.0001) - c.scale.x) * 0.08;
        c.scale.setScalar(s);
      }
    }
    renderer.render(scene, camera);
  }

  return { resize, render, renderer };
}
