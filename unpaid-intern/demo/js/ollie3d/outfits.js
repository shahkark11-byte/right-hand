// Outfits and props for the 3D Ollie, built from three.js shapes in the same soft vinyl-toy style as the body.
// addWardrobe(ctx, outfit, prop) returns { update(rig, pose, tMs) } that moves the parts that follow his hands or swing.
// ctx comes from model.js: { own, vinyl, radiusAt, fall, EYE, ARM, place, base, root, bodyPivot, face, arms }.
import * as THREE from '../../vendor/three.module.min.js';

const TAU = Math.PI * 2;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp = (a, b, u) => a + (b - a) * u;

const tube = (pts, r, mat, closed = false) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, closed), Math.max(12, pts.length * 6), r, 8, closed), mat);
function tapered(r, len, k0, k1) {
  const geo = new THREE.CapsuleGeometry(r, len - 2 * r, 8, 16), P = geo.attributes.position, half = len / 2;
  for (let i = 0; i < P.count; i++) {
    const t = Math.max(0, Math.min(1, (half - P.getY(i)) / len)), k = lerp(k0, k1, t);
    P.setXYZ(i, P.getX(i) * k, P.getY(i) - half, P.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return geo;
}
// A patch of surface that follows the body: angle a (0 = front) between a0 and a1, height from lo(a) to hi(a), pushed out by off.
function bodyPatch(ctx, a0, a1, lo, hi, off, NA = 40, NY = 10) {
  const pos = [], idx = [];
  for (let i = 0; i <= NA; i++) {
    const a = a0 + (a1 - a0) * i / NA, y0 = lo(a), y1 = hi(a);
    for (let j = 0; j <= NY; j++) { const y = y0 + (y1 - y0) * j / NY, r = ctx.radiusAt(y) + off; pos.push(Math.sin(a) * r, y, Math.cos(a) * r); }
  }
  for (let i = 0; i < NA; i++) for (let j = 0; j < NY; j++) { const a = i * (NY + 1) + j, b = a + NY + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return ctx.own(g);
}
// A cap that hugs the top of the head from height y0 up, pushed out by off, with a rolled edge.
function shell(ctx, y0, off, mat) {
  const pts = [];
  for (let i = 0; i <= 24; i++) { const y = y0 + (1 - y0) * i / 24; pts.push(new THREE.Vector2(ctx.radiusAt(y) + off, y)); }
  pts.push(new THREE.Vector2(0.001, 1 + off));
  const g = new THREE.Group();
  g.add(new THREE.Mesh(ctx.own(new THREE.LatheGeometry(pts, 64)), mat));
  const edge = new THREE.Mesh(ctx.own(new THREE.TorusGeometry(ctx.radiusAt(y0) + off, 0.012, 8, 64)), mat);
  edge.rotation.x = Math.PI / 2; edge.position.y = y0; g.add(edge);
  return g;
}
// Where an arm's hand is, in bodyPivot space.
const tip = (arm, len, out = new THREE.Vector3()) => out.set(0, -len * arm.scale.y, 0).applyQuaternion(arm.quaternion).add(arm.position);
const upright = (g, m) => g.scale.set(1 / m.bodyPivot.scale.x, 1 / m.bodyPivot.scale.y, 1 / m.bodyPivot.scale.z);

/* ---------- outfits ---------- */
const OUTFIT = {
  suit(ctx) {
    const navy = ctx.vinyl('#22304A', { side: THREE.DoubleSide }), navy2 = ctx.vinyl('#2D3F60'), white = ctx.vinyl('#F4F1EA', { side: THREE.DoubleSide }), red = ctx.vinyl('#8C2F2F', { side: THREE.DoubleSide });
    // short jacket: low at the front (a V opening for the shirt), higher at the sides and back; never up to the face
    const top = a => { const A = Math.abs(a); return A < 0.42 ? 0.17 + 0.14 * A / 0.42 : A < 0.95 ? 0.31 : 0.31 + 0.3 * (A - 0.95) / (Math.PI - 0.95); };
    ctx.bodyPivot.add(new THREE.Mesh(bodyPatch(ctx, -Math.PI, Math.PI, () => 0.03, top, 0.014, 96, 14), navy));
    ctx.bodyPivot.add(new THREE.Mesh(bodyPatch(ctx, -0.45, 0.45, a => top(a) - 0.01, () => 0.37, 0.006, 24, 6), white));
    ctx.bodyPivot.add(new THREE.Mesh(bodyPatch(ctx, -0.07, 0.07, () => 0.12, () => 0.35, 0.011, 8, 8), red));
    const knot = new THREE.Mesh(ctx.own(new THREE.SphereGeometry(0.024, 12, 10)), red); knot.position.set(0, 0.345, ctx.radiusAt(0.345) + 0.014); knot.scale.set(1, 0.8, 0.8);
    ctx.bodyPivot.add(knot);
    for (const s of [-1, 1]) {
      const pts = [0.43, 0.3, 0.15, 0.0].map(k => { const a = s * k, y = 0.17 + 0.14 * Math.min(1, k / 0.42) + (k > 0.42 ? 0.03 : 0); return V3(Math.sin(a) * (ctx.radiusAt(y) + 0.024), y, Math.cos(a) * (ctx.radiusAt(y) + 0.024)); });
      const lap = tube(pts, 0.017, navy2); ctx.own(lap.geometry); ctx.bodyPivot.add(lap);
    }
    const sleeve = ctx.own(tapered(0.099, 0.15, 1.08, 0.96));
    ctx.arms.forEach(g => g.add(new THREE.Mesh(sleeve, navy)));
  },
  grad(ctx, parts) {
    const blk = ctx.vinyl('#1A1A1C'), gold = ctx.vinyl('#E3A51F', { roughness: 0.4 });
    ctx.bodyPivot.add(shell(ctx, 0.9, 0.012, blk));
    const board = new THREE.Group(); board.position.set(0, 1.03, 0); board.rotation.set(0.07, 0.25, -0.07);
    board.add(new THREE.Mesh(ctx.own(new THREE.BoxGeometry(0.52, 0.028, 0.52)), blk));
    const button = new THREE.Mesh(ctx.own(new THREE.SphereGeometry(0.022, 12, 8)), gold); button.position.y = 0.02; board.add(button);
    const cord = tube([V3(0, 0.02, 0), V3(0.12, 0.018, 0.1), V3(0.22, 0.016, 0.2)], 0.007, gold); ctx.own(cord.geometry); board.add(cord);
    const tassel = new THREE.Group(); tassel.position.set(0.22, 0.012, 0.2);
    const cone = new THREE.Mesh(ctx.own(new THREE.CylinderGeometry(0.014, 0.034, 0.11, 10)), gold); cone.position.y = -0.065; tassel.add(cone);
    board.add(tassel); ctx.bodyPivot.add(board);
    parts.push((m, p, t) => { tassel.rotation.z = 0.12 + 0.12 * Math.sin(t / 260) - 1.8 * p.root.rotZ - 0.6 * p.root.y; tassel.rotation.x = 0.08 * Math.sin(t / 330 + 1); });
  },
  glasses(ctx) {
    const frame = ctx.vinyl('#25272B', { roughness: 0.4 }), R = ctx.EYE.r * 1.22, lift = 0.05;
    for (const s of [-1, 1]) {
      const g = ctx.place(new THREE.Group(), s * ctx.EYE.x, ctx.EYE.y, ctx.EYE.sink);
      const ring = Array.from({ length: 40 }, (_, i) => { const a = i / 40 * TAU, u = Math.cos(a) * R, v = Math.sin(a) * R; return V3(u, v, ctx.fall(u, v) + ctx.EYE.sink + lift); });
      const r = tube(ring, 0.0075, frame, true); ctx.own(r.geometry); g.add(r);
      const temple = tube([V3(s * R, 0, ctx.fall(R, 0) + ctx.EYE.sink + lift), V3(s * (R + 0.04), 0, ctx.fall(R + 0.04, 0) + ctx.EYE.sink + lift * 0.45), V3(s * (R + 0.09), 0, ctx.fall(R + 0.09, 0) + ctx.EYE.sink)], 0.0065, frame);
      ctx.own(temple.geometry); g.add(temple);
      ctx.face.add(g);
    }
    const y = ctx.EYE.y + 0.02, x0 = ctx.EYE.x - R, zAt = x => Math.sqrt(Math.max(1e-4, ctx.radiusAt(y) ** 2 - x * x)) + lift + 0.004;
    const bridge = tube([V3(-x0, y, zAt(x0)), V3(0, y + 0.02, zAt(0) + 0.006), V3(x0, y, zAt(x0))], 0.0075, frame); ctx.own(bridge.geometry); ctx.face.add(bridge);
  },
  detective(ctx) {
    const brown = ctx.vinyl('#7A5A3A', { roughness: 0.8, clearcoat: 0 }), y0 = 0.8, r0 = ctx.radiusAt(y0) + 0.016;
    ctx.bodyPivot.add(shell(ctx, y0, 0.016, brown));
    const front = new THREE.Mesh(ctx.own(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 28, 1, false, -Math.PI / 2, Math.PI)), brown); front.position.set(0, y0 - 0.01, r0 - 0.02);
    const back = new THREE.Mesh(ctx.own(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 28, 1, false, Math.PI / 2, Math.PI)), brown); back.position.set(0, y0 - 0.01, -(r0 - 0.02));
    ctx.bodyPivot.add(front, back);
    for (const s of [-1, 1]) { const flap = new THREE.Mesh(ctx.own(new THREE.SphereGeometry(1, 12, 10)), brown); flap.scale.set(0.03, 0.07, 0.07); flap.position.set(s * (r0 - 0.005), 0.82, 0); ctx.bodyPivot.add(flap); }
  },
  hardhat(ctx) {
    const yel = ctx.vinyl('#F2C230', { clearcoat: 0.4, clearcoatRoughness: 0.3 }), y0 = 0.76, r0 = ctx.radiusAt(y0) + 0.02;
    ctx.bodyPivot.add(shell(ctx, y0, 0.02, yel));
    const brim = new THREE.Mesh(ctx.own(new THREE.CylinderGeometry(r0 + 0.045, r0 + 0.045, 0.018, 48)), yel); brim.position.y = y0 + 0.002; ctx.bodyPivot.add(brim);
    const visor = new THREE.Mesh(ctx.own(new THREE.CylinderGeometry(r0 + 0.09, r0 + 0.09, 0.018, 48, 1, false, -0.9, 1.8)), yel); visor.position.y = y0 + 0.002; ctx.bodyPivot.add(visor);
    const pts = []; for (let i = 0; i <= 14; i++) { const f = i / 14 * Math.PI, y = y0 + 0.02 + (1.0 - y0 - 0.02) * Math.sin(f); pts.push(V3(0, y + 0.02 * Math.sin(f), Math.cos(f) * (ctx.radiusAt(y) + 0.032))); }
    const ridge = tube(pts, 0.014, ctx.vinyl('#E0AB1E')); ctx.own(ridge.geometry); ctx.bodyPivot.add(ridge);
  },
  wig(ctx) {
    const white = ctx.vinyl('#F1EEE6', { roughness: 0.85, clearcoat: 0 }), roll = ctx.own(new THREE.SphereGeometry(1, 12, 10));
    ctx.bodyPivot.add(shell(ctx, 0.74, 0.02, white));
    const ring = (y, n, sz, a0 = 0) => { for (let i = 0; i < n; i++) { const a = a0 + i / n * TAU, r = ctx.radiusAt(y) + 0.03; const m = new THREE.Mesh(roll, white); m.scale.set(sz * 1.5, sz * 0.85, sz); m.rotation.y = a; m.position.set(Math.sin(a) * r, y, Math.cos(a) * r); ctx.bodyPivot.add(m); } };
    for (const s of [-1, 1]) for (let k = 0; k < 2; k++) { const y = 0.7 - k * 0.09, m = new THREE.Mesh(roll, white); m.scale.set(0.05, 0.06, 0.06); m.position.set(s * (ctx.radiusAt(y) + 0.035), y, 0.05); ctx.bodyPivot.add(m); }
    ring(0.785, 12, 0.058); ring(0.875, 10, 0.054, 0.3); ring(0.95, 5, 0.042, 0.6);
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(roll, white); const sz = 0.058 - k * 0.006; m.scale.set(sz, sz, sz); m.position.set(s * (0.19 - k * 0.012), 0.69 - k * 0.1, -(ctx.radiusAt(0.69 - k * 0.1) * 0.82)); ctx.bodyPivot.add(m); }
  },
};

/* ---------- props ---------- */
const box = (ctx, w, h, d, mat) => new THREE.Mesh(ctx.own(new THREE.BoxGeometry(w, h, d)), mat);
const PROP = {
  laptop(ctx) {
    const wood = ctx.vinyl('#A67C52'), grey = ctx.vinyl('#3A3D42', { roughness: 0.5 });
    const g = new THREE.Group(); g.position.set(0, 0, 0.72);
    const desk = box(ctx, 0.6, 0.12, 0.3, wood); desk.position.y = 0.06; g.add(desk);
    const base = box(ctx, 0.4, 0.02, 0.26, grey); base.position.set(0, 0.13, 0); g.add(base);
    const keys = new THREE.Mesh(ctx.own(new THREE.PlaneGeometry(0.34, 0.14)), new THREE.MeshBasicMaterial({ color: '#8A8E96' })); keys.rotation.x = -Math.PI / 2; keys.position.set(0, 0.1415, 0.03); g.add(keys);
    const hinge = new THREE.Group(); hinge.position.set(0, 0.14, -0.13); hinge.rotation.x = -0.35;
    const lid = box(ctx, 0.4, 0.26, 0.016, grey); lid.position.y = 0.13; hinge.add(lid);
    const c = document.createElement('canvas'); c.width = 144; c.height = 88;
    const g2 = c.getContext('2d', { willReadFrequently: true }); g2.fillStyle = '#DDEEFF'; g2.fillRect(0, 0, 144, 88);
    g2.fillStyle = '#5B7FB0'; g2.fillRect(8, 8, 60, 8); g2.fillStyle = '#9DB6D6'; for (let i = 0; i < 6; i++) g2.fillRect(8, 24 + i * 9, 100 - (i % 3) * 22, 4); g2.fillStyle = '#F2C94C'; g2.fillRect(112, 8, 24, 24);
    const screenTex = ctx.own(new THREE.CanvasTexture(c)); screenTex.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(ctx.own(new THREE.PlaneGeometry(0.36, 0.22)), ctx.own(new THREE.MeshBasicMaterial({ map: screenTex }))); screen.position.set(0, 0.13, 0.0085); screen.rotation.y = 0; hinge.add(screen);
    const dot = new THREE.Mesh(ctx.own(new THREE.CircleGeometry(0.018, 16)), new THREE.MeshBasicMaterial({ color: '#E8F4FF' })); dot.position.set(0, 0.13, -0.0095); dot.rotation.y = Math.PI; hinge.add(dot);
    g.add(hinge); ctx.root.add(g);
  },
  briefcase(ctx, parts) {
    const brown = ctx.vinyl('#6B4A2E', { roughness: 0.7 }), gold = ctx.vinyl('#D9A441', { roughness: 0.4 });
    const g = new THREE.Group(), body = box(ctx, 0.3, 0.2, 0.08, brown); body.position.y = -0.11; g.add(body);
    const handle = new THREE.Mesh(ctx.own(new THREE.TorusGeometry(0.05, 0.011, 8, 16, Math.PI)), brown); handle.position.y = -0.01; g.add(handle);
    for (const s of [-1, 1]) { const c = box(ctx, 0.03, 0.025, 0.012, gold); c.position.set(s * 0.07, -0.045, 0.045); g.add(c); }
    ctx.bodyPivot.add(g);
    parts.push((m, p, t) => { upright(g, m); tip(m.arms[0], ctx.ARM.len, g.position); g.position.z += 0.02; g.rotation.z = -1.5 * p.root.rotZ + 0.05 * Math.sin(t / 700); });
  },
  book(ctx, parts) {
    const cover = ctx.vinyl('#2F4F7A'), page = ctx.vinyl('#F4F1EA');
    const g = new THREE.Group(), L = new THREE.Group(), R = new THREE.Group();
    for (const [grp, s] of [[L, -1], [R, 1]]) { const c = box(ctx, 0.17, 0.012, 0.22, cover); const pg = box(ctx, 0.155, 0.012, 0.2, page); pg.position.y = 0.011; grp.add(c, pg); grp.rotation.z = s * -0.18; grp.position.x = s * 0.085; g.add(grp); }
    g.rotation.x = -0.9; g.position.set(0, 0.3, 0.6); ctx.bodyPivot.add(g);
    parts.push((m, p, t) => { upright(g, m); R.rotation.z = -0.18 - 0.1 * Math.max(0, Math.sin(t / 3000 * TAU) - 0.7); });
  },
  magnifier(ctx, parts) {
    const gold = ctx.vinyl('#D9A441', { roughness: 0.35, clearcoat: 0.3 }), wood = ctx.vinyl('#8A5A33', { roughness: 0.7 });
    const g = new THREE.Group();
    const rim = new THREE.Mesh(ctx.own(new THREE.TorusGeometry(0.085, 0.012, 10, 36)), gold); g.add(rim);
    const glass = new THREE.Mesh(ctx.own(new THREE.CircleGeometry(0.083, 28)), ctx.own(new THREE.MeshPhysicalMaterial({ color: '#BFE6F2', transparent: true, opacity: 0.3, roughness: 0.05, clearcoat: 1 }))); g.add(glass);
    const handle = new THREE.Mesh(ctx.own(new THREE.CylinderGeometry(0.013, 0.016, 0.13, 10)), wood); handle.position.y = -0.15; g.add(handle);
    ctx.bodyPivot.add(g);
    parts.push((m, p) => { upright(g, m); tip(m.arms[1], ctx.ARM.len, g.position); g.position.y += 0.15; g.position.z += 0.03; g.rotation.z = -0.3; });
  },
  clipboard(ctx, parts) {
    const brown = ctx.vinyl('#8A5A33'), paper = ctx.vinyl('#F7F5EE'), grey = ctx.vinyl('#8E9298', { roughness: 0.4 });
    const g = new THREE.Group(), board = box(ctx, 0.21, 0.28, 0.018, brown); g.add(board);
    const sheet = box(ctx, 0.18, 0.24, 0.006, paper); sheet.position.z = 0.012; g.add(sheet);
    const clip = box(ctx, 0.07, 0.03, 0.02, grey); clip.position.set(0, 0.14, 0.02); g.add(clip);
    for (let i = 0; i < 4; i++) { const l = box(ctx, 0.12, 0.007, 0.004, ctx.vinyl('#5A6A8A')); l.position.set(0.01, 0.07 - i * 0.045, 0.017); g.add(l); const tk = box(ctx, 0.02, 0.007, 0.004, ctx.vinyl('#3E8B4A')); tk.position.set(-0.075, 0.07 - i * 0.045, 0.017); g.add(tk); }
    ctx.bodyPivot.add(g);
    parts.push((m, p) => { upright(g, m); tip(m.arms[0], ctx.ARM.len, g.position); g.position.x += 0.05; g.position.y += 0.1; g.position.z += 0.03; g.rotation.set(-0.25, 0.15, 0.08); });
  },
  gavel(ctx) {
    const wood = ctx.vinyl('#7A4E2A', { roughness: 0.6 });
    const g = new THREE.Group(), handle = new THREE.Mesh(ctx.own(new THREE.CylinderGeometry(0.013, 0.015, 0.17, 10)), wood); handle.position.y = -0.27; g.add(handle);
    const head = new THREE.Mesh(ctx.own(new THREE.CylinderGeometry(0.04, 0.04, 0.12, 16)), wood); head.rotation.z = Math.PI / 2; head.position.y = -0.37; g.add(head);
    for (const s of [-1, 1]) { const band = new THREE.Mesh(ctx.own(new THREE.CylinderGeometry(0.043, 0.043, 0.012, 16)), ctx.vinyl('#D9A441')); band.rotation.z = Math.PI / 2; band.position.set(s * 0.04, -0.37, 0); g.add(band); }
    ctx.arms[1].add(g);
  },
  envelope(ctx, parts) {
    const cream = ctx.vinyl('#F3EAD2', { side: THREE.DoubleSide }), flapMat = ctx.vinyl('#E8DCBC', { side: THREE.DoubleSide });
    const g = new THREE.Group(), body = box(ctx, 0.2, 0.13, 0.012, cream); g.add(body);
    const sh = new THREE.Shape(); sh.moveTo(-0.1, 0.065); sh.lineTo(0.1, 0.065); sh.lineTo(0, -0.01); sh.closePath();
    const flap = new THREE.Mesh(ctx.own(new THREE.ShapeGeometry(sh)), flapMat); flap.position.z = 0.0075; g.add(flap);
    ctx.bodyPivot.add(g);
    parts.push((m) => { upright(g, m); tip(m.arms[1], ctx.ARM.len, g.position); g.position.y += 0.08; g.position.z += 0.03; g.rotation.z = -0.15; });
  },
  certificate(ctx, parts) {
    const paper = ctx.vinyl('#F7F3E8'), red = ctx.vinyl('#B3262A');
    const g = new THREE.Group(), roll = new THREE.Mesh(ctx.own(new THREE.CylinderGeometry(0.036, 0.036, 0.3, 20)), paper); roll.rotation.z = Math.PI / 2; g.add(roll);
    const band = new THREE.Mesh(ctx.own(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 20)), red); band.rotation.z = Math.PI / 2; g.add(band);
    const seal = new THREE.Mesh(ctx.own(new THREE.SphereGeometry(0.028, 14, 10)), red); seal.scale.set(1, 1, 0.5); seal.position.set(0, 0, 0.04); g.add(seal);
    g.rotation.x = -0.35; g.position.set(0, 0.3, 0.62); ctx.bodyPivot.add(g);
    parts.push(m => upright(g, m));
  },
};

export function addWardrobe(ctx, outfit = 'none', prop = 'none') {
  const parts = [];
  if (OUTFIT[outfit]) OUTFIT[outfit](ctx, parts);
  if (PROP[prop]) PROP[prop](ctx, parts);
  return { update(m, p, t) { for (const f of parts) f(m, p, t); } };
}
