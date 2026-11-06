// Ollie as a toy: an olive body, a two-leaf sprout, big glossy eyes with real eyelids, a stub of a mouth, arms and legs.
// buildOllie(variant) returns a rig; applyPose(rig, pose, tMs) poses it from the numbers poses.js produces.
// Units: the body is 1.0 tall and sits on short legs. Scene graph:
//   root (on the ground) > bodyPivot (squash, stretch, lean) > body, face (eyes, mouth, blush, brows), arms, sprout;  legs and shadow on root.
import * as THREE from '../../vendor/three.module.min.js';
import { addWardrobe } from './outfits.js';

const TAU = Math.PI * 2;
const COLORS = { green: '#8DAA3C', black: '#262626' };
const FEATURE = { green: '#2F4A1A', black: '#556446' };
const W = 0.46, BODY_Y = 0.095, HIP_Y = 0.135;
const EYE = { x: 0.222, y: 0.61, r: 0.113, depth: 0.066, sink: 0.012 };   // a flat dome (0.28 of the eye's width) so it stays inside the silhouette from the side
const ARM = { x: 0.4, y: 0.4, len: 0.25 };

const lerp = (a, b, u) => a + (b - a) * u;
const clamp01 = u => Math.max(0, Math.min(1, u));
const hash = n => { const s = Math.sin(n * 91.7 + 17.3) * 43758.5453; return s - Math.floor(s); };

/* ---------- the body: an egg, widest a little below the middle ---------- */
const PROFILE = [];
for (let i = 0; i <= 96; i++) {
  const th = Math.PI * i / 96;
  PROFILE.push({ y: 0.5 * (1 - Math.cos(th)), r: W * Math.sin(th) * (1 + 0.07 * Math.cos(th)) });
}
function radiusAt(y) {
  y = clamp01(y);
  for (let i = 1; i < PROFILE.length; i++) {
    if (y <= PROFILE[i].y) { const a = PROFILE[i - 1], b = PROFILE[i], u = (y - a.y) / ((b.y - a.y) || 1); return lerp(a.r, b.r, u); }
  }
  return 0;
}
// A point on the front of the body at sideways offset x and height y, with the surface normal there.
function surface(x, y) {
  const r = radiusAt(y), z = Math.sqrt(Math.max(r * r - x * x, 1e-6)), dr = (radiusAt(y + 0.01) - radiusAt(y - 0.01)) / 0.02;
  const rad = Math.hypot(x, z);
  return { pos: new THREE.Vector3(x, y, z), n: new THREE.Vector3(x / rad, -dr, z / rad).normalize() };
}
function bodyGeometry(base) {
  const geo = new THREE.LatheGeometry(PROFILE.map(p => new THREE.Vector2(Math.max(p.r, 0.0005), p.y)), 96);
  const c = new THREE.Color(base), low = c.clone().multiplyScalar(0.8), pos = geo.attributes.position, col = [];
  for (let i = 0; i < pos.count; i++) {
    const u = clamp01(pos.getY(i) / 0.55), m = low.clone().lerp(c, u * u * (3 - 2 * u));
    col.push(m.r, m.g, m.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

/* ---------- small shapes ---------- */
function starShape(R) {
  const s = new THREE.Shape(), k = 0.14;
  s.moveTo(0, R); s.quadraticCurveTo(k * R, k * R, R, 0); s.quadraticCurveTo(k * R, -k * R, 0, -R);
  s.quadraticCurveTo(-k * R, -k * R, -R, 0); s.quadraticCurveTo(-k * R, k * R, 0, R);
  return s;
}
function zShape(R) {
  const s = new THREE.Shape(), p = [[-1, 1], [1, 1], [1, 0.7], [-0.3, -0.7], [1, -0.7], [1, -1], [-1, -1], [-1, -0.7], [0.3, 0.7], [-1, 0.7]];
  p.forEach(([x, y], i) => (i ? s.lineTo(x * R, y * R) : s.moveTo(x * R, y * R)));
  return s;
}
// A leaf built from a curved grid: an almond outline (u along it, v across), folded along the midline so the centre ridge stands up,
// arched along its length with the tip curling up. The rib is a thin tube along the ridge (see ribGeometry).
const leafBend = (u, L) => 0.22 * L * u * u - 0.04 * L * Math.sin(Math.PI * Math.min(1, u * 1.2));
function leafGeometry(L, Wd) {
  const NU = 20, NV = 10, pos = [], idx = [];
  for (let i = 0; i <= NU; i++) {
    const u = i / NU, w = Wd * 0.5 * (0.16 + 0.84 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.78)), 0.85));
    for (let j = 0; j <= NV; j++) {
      const v = j / NV * 2 - 1;
      pos.push(u * L, v * w - 0.03 * u * u * L, leafBend(u, L) - 0.26 * Math.abs(v) * w);
    }
  }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    const a = i * (NV + 1) + j, b = a + NV + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function ribGeometry(L) {
  const pts = [];
  for (let i = 1; i <= 18; i++) { const u = i / 20; pts.push(new THREE.Vector3(u * L, -0.03 * u * u * L, leafBend(u, L) + 0.004)); }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0065, 6, false);
}
// The stem: a thick curved tube that thins toward the top, so the leaf roots wrap it with no ball at the end.
function stemGeometry(pts, r, k0, k1) {
  const curve = new THREE.CatmullRomCurve3(pts), T = 24, Rr = 10;
  const geo = new THREE.TubeGeometry(curve, T, r, Rr, false), P = geo.attributes.position;
  for (let i = 0; i <= T; i++) {
    const c = curve.getPointAt(i / T), k = lerp(k0, k1, i / T);
    for (let j = 0; j <= Rr; j++) { const n = i * (Rr + 1) + j; P.setXYZ(n, c.x + (P.getX(n) - c.x) * k, c.y + (P.getY(n) - c.y) * k, c.z + (P.getZ(n) - c.z) * k); }
  }
  geo.computeVertexNormals();
  return geo;
}
// A tiny studio for the eyes to reflect: a few bright panels. stage.js turns it into an environment map with PMREMGenerator.
export function makeEnvScene() {
  const sc = new THREE.Scene(); sc.background = new THREE.Color('#4a5046');
  const panel = (w, h, pos, power, color) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, 0, 0); sc.add(m);
  };
  panel(2.6, 1.7, [-1.8, 2.4, 5], 14, '#ffffff');
  panel(0.9, 2.6, [3, 0.8, 4.5], 5, '#eaf2ff');
  panel(3.5, 1.2, [0, 4, 2], 3, '#ffffff');
  return sc;
}
// An eye that sits ON the body: a dome whose rim follows the curve of the surface (the body falls away from the tangent plane),
// so it hugs the egg from any angle instead of floating as a flat plate. cut (optional) clamps v, which is how the eyelid closes from the top.
const fall = (u, v) => -(u * u / 0.92 + v * v / 1.04);
const domeZ = (u, v, R, d) => fall(u, v) + d * Math.sqrt(Math.max(0, 1 - (u * u + v * v) / (R * R)));
function eyeShape(geo, unit, R, depth, cut) {
  const P = geo.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = unit[3 * i], y = unit[3 * i + 1], z = unit[3 * i + 2], u = x * R;
    let v = y * R; if (cut !== undefined && v < cut) v = cut;
    P.setXYZ(i, u, v, z > 0 ? domeZ(u, v, R, depth) + 0.0015 : fall(u, v) - 0.003);
  }
  P.needsUpdate = true; geo.computeVertexNormals();
}
function eyeGeometry(R, depth) {
  const geo = new THREE.SphereGeometry(1, 40, 28), unit = Float32Array.from(geo.attributes.position.array);
  eyeShape(geo, unit, R, depth);
  geo.userData.unit = unit;
  return geo;
}
// A limb with a thick root that tapers to a rounded tip.
function taperedCapsule(r, len, root, tip) {
  const geo = new THREE.CapsuleGeometry(r, len - 2 * r, 8, 20), P = geo.attributes.position, half = len / 2;
  for (let i = 0; i < P.count; i++) {
    const t = clamp01((half - P.getY(i)) / len);        // 0 at the root, 1 at the tip
    const k = lerp(root, tip, t);
    P.setXYZ(i, P.getX(i) * k, P.getY(i) - half, P.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return geo;
}
// One smooth leg: a short thick shin into a slightly wider rounded foot, hip at y = 0.
function legGeometry() {
  const pts = [[0.001, 0.04], [0.07, 0.035], [0.083, 0], [0.088, -0.05], [0.098, -0.095], [0.1, -0.112], [0.085, -0.13], [0.05, -0.1355], [0.001, -0.1365]];
  const geo = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)).reverse(), 32);
  geo.scale(1, 1, 1.22); geo.translate(0, 0, 0.02);
  return geo;
}
function canvasTexture(draw, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d', { willReadFrequently: true }), w, h);   // a software canvas survives a GPU reset
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const softDisc = (rgb) => canvasTexture((g, w, h) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.55, `rgba(${rgb},.7)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.save(); g.translate(0, h / 2); g.scale(1, h / w); g.translate(0, -w / 2); g.fillStyle = gr; g.fillRect(0, 0, w, w); g.restore();
}, 128, 64);

const tube = (pts, r, mat, closed = false) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, closed, 'catmullrom', 0.5), 40, r, 8, closed), mat);
// Put a group on the body surface at (x, y), facing outward, sunk in by `sink`.
function place(g, x, y, sink = 0) {
  const s = surface(x, y);
  g.position.copy(s.pos).addScaledVector(s.n, -sink);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), s.n);
  return g;
}
const onBody = x => -1.09 * x * x;                 // the surface falls away from a flat tangent plane

/* ---------- build ---------- */
export function buildOllie(variant = 'green', opts = {}) {
  const base = COLORS[variant] || COLORS.green, ink = FEATURE[variant] || FEATURE.green;
  const disposables = [];
  const own = o => (disposables.push(o), o);
  const cool = variant === 'black' ? { sheen: 0.3, sheenRoughness: 0.5, sheenColor: new THREE.Color('#a8b0c0') } : {};   // soft cool highlights on the black one
  const vinyl = (color, extra) => own(new THREE.MeshPhysicalMaterial({ color, roughness: 0.65, clearcoat: 0.1, clearcoatRoughness: 0.5, ...extra }));
  const flat = (color, extra) => own(new THREE.MeshBasicMaterial({ color, ...extra }));
  const inkMat = own(new THREE.MeshStandardMaterial({ color: ink, roughness: 0.6 }));

  const root = new THREE.Group(), bodyPivot = new THREE.Group();
  bodyPivot.position.y = BODY_Y;
  root.add(bodyPivot);

  const bodyMat = own(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.65, clearcoat: 0.1, clearcoatRoughness: 0.5, ...cool }));
  const body = new THREE.Mesh(own(bodyGeometry(base)), bodyMat);
  bodyPivot.add(body);

  // contact shadow
  const shadowMat = own(new THREE.MeshBasicMaterial({ map: own(softDisc('40,40,30')), transparent: true, opacity: 0.32, depthWrite: false }));
  const shadow = new THREE.Mesh(own(new THREE.PlaneGeometry(1.1, 0.5)), shadowMat);
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.002;
  root.add(shadow);

  // legs: one smooth chunky piece each, on the root; they ride with the body when it jumps
  const legMat = vinyl(new THREE.Color(base).multiplyScalar(0.92), cool);
  const legGeo = own(legGeometry());
  const legs = [-1, 1].map(s => {
    const g = new THREE.Group(); g.position.set(s * 0.135, HIP_Y, 0.01);
    g.add(new THREE.Mesh(legGeo, legMat)); root.add(g);
    return g;
  });

  // arms: capsules pivoting at the shoulder. Rotation order Z, X, Y: pitch forward first, then swing sideways.
  const armMat = vinyl(new THREE.Color(base).multiplyScalar(0.97), cool);
  const armGeo = own(taperedCapsule(0.088, ARM.len, 1.1, 0.72));
  const arms = [-1, 1].map(s => {
    const g = new THREE.Group(); g.position.set(s * ARM.x, ARM.y, 0.02); g.rotation.order = 'ZXY';
    g.add(new THREE.Mesh(armGeo, armMat));
    bodyPivot.add(g);
    return g;
  });

  // sprout: a thick curved stem and two almond leaves, pivoting at the stem base
  const sprout = new THREE.Group(); sprout.position.set(0, 0.97, 0);
  const stemMat = vinyl('#3F6B2E', { roughness: 0.55 });
  const stem = new THREE.Mesh(own(stemGeometry([new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.004, 0.07, 0.005), new THREE.Vector3(0.015, 0.15, 0.01), new THREE.Vector3(0.04, 0.22, 0.01)], 0.045, 1, 0.66)), stemMat);
  const stemTip = new THREE.Mesh(own(new THREE.SphereGeometry(0.03, 14, 10)), stemMat); stemTip.position.set(0.04, 0.22, 0.01);
  sprout.add(stem, stemTip);
  const leafTop = vinyl('#5A8A3A', { roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35, side: THREE.BackSide }), leafUnder = vinyl('#3E6A2D', { roughness: 0.55, side: THREE.FrontSide });
  const lg = own(leafGeometry(0.43, 0.31)), ribGeo = own(ribGeometry(0.43)), ribMat = vinyl('#86B55C', { roughness: 0.4, clearcoat: 0.3 });
  const leaves = [1, -1].map(s => {
    const outer = new THREE.Group(); outer.position.set(0.04, 0.2, 0.012); outer.scale.x = s;
    const tilt = new THREE.Group(); tilt.add(new THREE.Mesh(lg, leafTop), new THREE.Mesh(lg, leafUnder), new THREE.Mesh(ribGeo, ribMat));
    outer.add(tilt); sprout.add(outer);
    return { outer, tilt, s };
  });
  bodyPivot.add(sprout);

  // face
  const face = new THREE.Group(); bodyPivot.add(face);
  const eyeMat = own(new THREE.MeshPhysicalMaterial({ color: '#0B0B0B', roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.5 }));
  const bandTex = own(softDisc('255,255,255'));
  const bandMat = own(new THREE.MeshBasicMaterial({ map: bandTex, transparent: true, opacity: 0.38, depthWrite: false }));
  const rimMat = own(new THREE.MeshStandardMaterial({ color: new THREE.Color(base).multiplyScalar(0.28), roughness: 0.7 }));
  const lidMat = vinyl(base, cool);
  const white = flat('#ffffff');
  const star = own(new THREE.ShapeGeometry(starShape(1), 12)), dot = own(new THREE.CircleGeometry(1, 16));
  const eyeGeo = own(eyeGeometry(EYE.r, EYE.depth));
  const lidGeo = own(eyeGeometry(EYE.r * 1.06, EYE.depth * 1.12 + 0.004));
  const happyArc = (up) => { const pts = []; for (let i = 0; i <= 8; i++) { const x = (i / 8 * 2 - 1) * 0.085, k = 1 - (x / 0.085) ** 2; pts.push(new THREE.Vector3(x, (up ? 1 : -1) * 0.04 * k - (up ? 0.02 : -0.02), onBody(x) + EYE.sink + 0.004)); } return pts; };
  const hl = (u, v) => domeZ(u, v, EYE.r, EYE.depth) + 0.0035;
  // lay a flat reflection on the dome, tilted to follow its surface
  const onDome = (mesh, u, v) => {
    const e = 0.004, dzu = (domeZ(u + e, v, EYE.r, EYE.depth) - domeZ(u - e, v, EYE.r, EYE.depth)) / (2 * e), dzv = (domeZ(u, v + e, EYE.r, EYE.depth) - domeZ(u, v - e, EYE.r, EYE.depth)) / (2 * e);
    mesh.position.set(u, v, hl(u, v));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(-dzu, -dzv, 1).normalize());
  };
  const rimPts = Array.from({ length: 48 }, (_, i) => { const a = i / 48 * TAU, u = Math.cos(a) * EYE.r * 1.03, v = Math.sin(a) * EYE.r * 1.03; return new THREE.Vector3(u, v, fall(u, v) + EYE.sink + 0.001); });
  const eyes = [-1, 1].map(s => {
    const g = place(new THREE.Group(), s * EYE.x, EYE.y, EYE.sink);
    const squashZ = new THREE.Group();
    const ball = new THREE.Mesh(eyeGeo, eyeMat), lid = new THREE.Mesh(lidGeo, lidMat);
    const rim = tube(rimPts, 0.0045, rimMat, true); own(rim.geometry);
    squashZ.add(rim, ball, lid);
    const gl = new THREE.Group();
    const big = new THREE.Mesh(star, white); big.scale.setScalar(0.046); onDome(big, 0.036, 0.04);
    const small = new THREE.Mesh(dot, white); small.scale.setScalar(0.011); onDome(small, -0.04, -0.04);
    const band = new THREE.Mesh(own(new THREE.PlaneGeometry(0.1, 0.034)), bandMat); onDome(band, -0.004, 0.066);
    gl.add(big, small, band);
    const arcHappy = tube(happyArc(true), 0.0105, inkMat), arcShut = tube(happyArc(false), 0.009, inkMat);
    own(arcHappy.geometry); own(arcShut.geometry);
    g.add(squashZ, gl, arcHappy, arcShut);
    face.add(g);
    return { g, ball, lid, squashZ, gl, arcHappy, arcShut };
  });

  // mouth: five shapes, one shown at a time
  const mouthG = place(new THREE.Group(), 0, 0.485, 0.0); face.add(mouthG);
  const mz = x => onBody(x) + 0.003;
  const line = (xs, f, r = 0.0075) => { const m = tube(xs.map(x => new THREE.Vector3(x, f(x), mz(x))), r, inkMat); own(m.geometry); return m; };
  const wPts = [-0.07, -0.05, -0.034, -0.017, 0, 0.017, 0.034, 0.05, 0.07];
  const mouths = {
    w: line(wPts, x => { const c = x < 0 ? -0.0345 : 0.0345; return -0.026 * Math.cos(Math.abs(x - c) / 0.0345 * Math.PI / 2); }),
    smile: line([-0.05, -0.03, -0.01, 0.01, 0.03, 0.05], x => -0.03 * (1 - (x / 0.05) ** 2) + 0.012),
    worry: line([-0.06, -0.04, -0.02, 0, 0.02, 0.04, 0.06], x => 0.012 * Math.sin(x / 0.06 * Math.PI * 1.5)),
  };
  const dShape = new THREE.Shape(); dShape.moveTo(-0.045, 0.01); dShape.lineTo(0.045, 0.01); dShape.bezierCurveTo(0.045, -0.06, -0.045, -0.06, -0.045, 0.01);
  const tongue = new THREE.Shape(); tongue.absellipse(0, -0.037, 0.026, 0.014, 0, TAU);
  const open = new THREE.Group();
  const dMesh = new THREE.Mesh(own(new THREE.ShapeGeometry(dShape, 14)), flat(ink)), tMesh = new THREE.Mesh(own(new THREE.ShapeGeometry(tongue, 14)), flat('#E58A92'));
  dMesh.position.z = 0.004; tMesh.position.z = 0.0055; open.add(dMesh, tMesh);
  const oMouth = new THREE.Group();
  const oRing = new THREE.Mesh(own(new THREE.CircleGeometry(0.024, 20)), flat(ink)), oIn = new THREE.Mesh(own(new THREE.CircleGeometry(0.014, 20)), flat('#E58A92'));
  oRing.position.z = 0.004; oIn.position.z = 0.0055; oMouth.add(oRing, oIn);
  mouths.open = open; mouths.o = oMouth;
  Object.values(mouths).forEach(m => { m.visible = false; mouthG.add(m); });

  // blush
  const blushTex = own(softDisc('235,160,166'));
  const blushes = [-1, 1].map(s => {
    const m = new THREE.Mesh(own(new THREE.PlaneGeometry(0.2, 0.125)), own(new THREE.MeshBasicMaterial({ map: blushTex, transparent: true, opacity: 0.4, depthWrite: false })));
    const g = place(new THREE.Group(), s * 0.285, 0.435, -0.004); m.position.z = 0.012; g.add(m); face.add(g);
    return m;
  });

  // brows
  const browMat = inkMat;
  const brows = [-1, 1].map(s => {
    const g = place(new THREE.Group(), s * EYE.x, 0.765, 0);
    const b = tube([-0.05, -0.025, 0, 0.025, 0.05].map(x => new THREE.Vector3(x, 0.014 * (1 - (x / 0.05) ** 2), onBody(x) + 0.004)), 0.0075, browMat);
    own(b.geometry); g.add(b); g.visible = false; face.add(g);
    return g;
  });

  // fx
  const fx = new THREE.Group(); root.add(fx);
  const zMat = flat('#7C9A52', { transparent: true }), zGeo = own(new THREE.ShapeGeometry(zShape(1), 4));
  const zs = [0.08, 0.06, 0.045].map(sz => { const m = new THREE.Mesh(zGeo, zMat.clone()); own(m.material); m.scale.setScalar(sz); m.visible = false; fx.add(m); return m; });
  const goldMat = own(new THREE.MeshStandardMaterial({ color: '#E3A51F', metalness: 0.55, roughness: 0.32 }));
  const coinGeo = own(new THREE.CylinderGeometry(0.055, 0.055, 0.014, 28).rotateX(Math.PI / 2));
  const coins = Array.from({ length: 8 }, (_, i) => { const m = new THREE.Mesh(coinGeo, goldMat); m.visible = false; fx.add(m); return m; });
  const sparkGeo = own(new THREE.ShapeGeometry(starShape(1), 10));
  const sparkCols = ['#E8B93C', '#8FA84A', '#F5D36B', '#B9CF6A', '#E8B93C'];
  const sparkles = sparkCols.map(c => { const m = new THREE.Mesh(sparkGeo, own(new THREE.MeshBasicMaterial({ color: c, transparent: true }))); m.visible = false; fx.add(m); return m; });

  // the idea bulb: a small glowing lightbulb that pops in above the sprout
  const bulb = new THREE.Group(); bulb.visible = false;
  const glass = new THREE.Mesh(own(new THREE.SphereGeometry(0.06, 20, 16)), own(new THREE.MeshStandardMaterial({ color: '#FFF4C8', emissive: '#FFE08A', emissiveIntensity: 1.3, roughness: 0.2 })));
  const cap = new THREE.Mesh(own(new THREE.CylinderGeometry(0.03, 0.026, 0.05, 14)), own(new THREE.MeshStandardMaterial({ color: '#8E9298', roughness: 0.5 }))); cap.position.y = -0.075;
  const glow = new THREE.Mesh(own(new THREE.PlaneGeometry(0.26, 0.26)), own(new THREE.MeshBasicMaterial({ map: own(softDisc('255,224,138')), transparent: true, opacity: 0.8, depthWrite: false }))); glow.position.z = -0.03;
  bulb.add(glass, cap, glow); fx.add(bulb);

  // outfit and prop
  const wardrobe = addWardrobe({ own, vinyl, radiusAt, fall, EYE, ARM, place, base, root, bodyPivot, face, arms }, opts.outfit, opts.prop);

  const rig = { variant, outfit: opts.outfit || 'none', prop: opts.prop || 'none', wardrobe, bulb, eyeMat, lidGeo, lidAmt: -1, root, bodyPivot, body, legs, arms, sprout, leaves, eyes, mouths, blushes, brows, shadow, zs, coins, sparkles, base,
    setEnv(tex) { eyeMat.envMap = tex; eyeMat.needsUpdate = true; },
    dispose() { disposables.forEach(d => d.dispose && d.dispose()); } };
  return rig;
}

/* ---------- posing ---------- */
const SPARK_SPOTS = [[-0.62, 0.95], [0.66, 1.0], [0.72, 0.52], [-0.7, 0.45], [0.35, 1.5]];

export function applyPose(m, p, tMs = 0) {
  const { root, bodyPivot } = m;
  root.position.y = p.root.y; root.rotation.z = p.root.rotZ; root.rotation.y = p.root.rotY;
  bodyPivot.scale.set(p.body.sx, p.body.sy, p.body.sz); bodyPivot.rotation.x = p.root.rotX;
  m.shadow.scale.setScalar(Math.max(0.55, 1 - p.root.y * 1.6)); m.shadow.material.opacity = 0.32 * Math.max(0.4, 1 - p.root.y * 2.5);
  m.shadow.position.y = 0.002 - p.root.y; m.shadow.rotation.z = -p.root.rotZ * 0;

  // limbs keep their shape while the body squashes
  const inv = [1 / p.body.sx, 1 / p.body.sy, 1 / p.body.sz];
  // an arm raised forward (rotX > 0.5) swings from the front of the body, so hands can reach in front of the belly; thinking aims the left hand at the chin
  [[m.arms[0], p.armL], [m.arms[1], p.armR]].forEach(([g, a], i) => {
    const side = i ? 1 : -1, fw = clamp01((a.rotX - 0.5) / 0.5);
    g.rotation.set(-a.rotX, 0, a.rotZ); g.scale.set(...inv);
    g.position.set(side * ARM.x, ARM.y, 0.02);
    if (fw > 0) g.position.lerp(_front.set(side * 0.2, 0.3, 0.4), fw);
    if (i === 0 && a.rotZ > 1.0 && fw > 0) g.quaternion.slerp(_q.setFromUnitVectors(_down, _tip.set(-0.03, 0.4, 0.5).sub(g.position).normalize()), fw);
  });

  // sprout: sways, and droops by folding the leaves down and bowing the stem
  m.sprout.scale.set(...inv);
  m.sprout.rotation.set(p.sprout.droop * 0.5, 0, p.sprout.rotZ + p.sprout.droop * 0.35);
  m.leaves.forEach(({ outer, tilt, s }) => {
    outer.rotation.z = s * (0.36 - p.sprout.droop * 0.9 + 0.35 * p.sprout.rotZ);   // up and out, a little more level than before
    tilt.rotation.x = -0.3 + p.sprout.droop * 0.5;
  });

  // eyes
  const shape = p.eyes.shape, lidAmt = shape === 'sparkle' || shape === 'wide' ? 1 - p.eyes.open : 1;
  const ballsOn = shape === 'sparkle' || shape === 'wide';
  m.eyes.forEach((e, i) => {
    const s = i ? 1 : -1;
    e.g.scale.setScalar(shape === 'wide' ? 1.1 : 1);
    e.squashZ.visible = ballsOn; e.gl.visible = ballsOn && lidAmt < 0.5; e.lid.visible = lidAmt > 0.02;
    e.arcHappy.visible = shape === 'happy'; e.arcShut.visible = shape === 'closed';
    e.squashZ.position.set(p.eyes.lookX * 0.012, p.eyes.lookY * 0.012, 0);
    e.gl.position.set(p.eyes.lookX * 0.022, p.eyes.lookY * 0.02, 0);
  });

  // the eyelid closes from the top: its geometry is cut at a moving line
  if (Math.abs(lidAmt - m.lidAmt) > 0.004 && lidAmt > 0.02) {
    m.lidAmt = lidAmt;
    const R = EYE.r * 1.06;
    eyeShape(m.lidGeo, m.lidGeo.userData.unit, R, EYE.depth * 1.12 + 0.004, lerp(1.1, -1.1, clamp01(lidAmt)) * R);
  }

  // mouth, blush, brows
  for (const k in m.mouths) m.mouths[k].visible = k === p.mouth;
  m.blushes.forEach(b => { b.material.opacity = Math.min(1, 1.25 * p.blush); });
  m.brows.forEach((b, i) => {
    b.visible = p.brows.show;
    const left = i === 0, r = p.brows.raise;
    const s = surface((left ? -1 : 1) * EYE.x, 0.765 + (left ? -0.012 : 0.05) * r);
    b.position.copy(s.pos); b.rotation.z = (left ? 0.18 : -0.12) * r;
  });

  m.wardrobe.update(m, p, tMs);
  fxUpdate(m, p, tMs);
}

const _front = new THREE.Vector3(), _tip = new THREE.Vector3(), _down = new THREE.Vector3(0, -1, 0), _q = new THREE.Quaternion();

function fxUpdate(m, p, tMs) {
  const has = k => p.fx.includes(k);
  m.bulb.visible = has('bulb');
  if (m.bulb.visible) {
    const k = clamp01((tMs - 1400) / 260), pop = k < 1 ? 1.25 * Math.sin(k * Math.PI / 2 * 1.2) : 1 + 0.04 * Math.sin(tMs / 160);
    m.bulb.position.set(0.05, 1.53 + 0.008 * Math.sin(tMs / 220), 0.15); m.bulb.scale.setScalar(Math.max(0.01, pop));
  }
  m.zs.forEach((z, i) => {
    z.visible = has('z');
    if (!z.visible) return;
    const u = ((tMs + i * 987) % 3770) / 3770;
    z.position.set(0.3 + u * 0.28 + i * 0.03, 1.15 + u * 0.4, 0.3);
    z.material.opacity = Math.sin(Math.PI * u) * 0.9;
    z.scale.setScalar([0.08, 0.06, 0.045][i] * (0.7 + u * 0.5));
  });
  m.coins.forEach((c, i) => {
    const t = (tMs - 100 - i * 30) / 1000;
    c.visible = has('coins') && t > 0 && t < 1.4;
    if (!c.visible) return;
    const ang = (-150 + 300 / 7 * i) * Math.PI / 180, speed = 0.55 + 0.35 * hash(i);
    c.position.set(Math.sin(ang) * speed * Math.min(t, 1.0) * 0.9, 0.85 + 2.0 * t - 2.6 * t * t * 0.5 * 2 + 0.2 * hash(i + 9), 0.35);
    c.rotation.y = t * 7 + i; c.scale.setScalar(clamp01(t * 8) * (t > 1.15 ? clamp01((1.4 - t) * 4) : 1));
  });
  m.sparkles.forEach((s, i) => {
    const t = (tMs - i * 170) / 1700;
    s.visible = has('sparkle') && t > 0 && t < 1;
    if (!s.visible) return;
    const k = t < 0.35 ? t / 0.35 * 1.15 : t < 0.65 ? 1.15 - (t - 0.35) / 0.3 * 0.45 : 0.7 * (1 - (t - 0.65) / 0.35);
    s.position.set(SPARK_SPOTS[i][0], SPARK_SPOTS[i][1], 0.4); s.rotation.z = t * 2.4; s.scale.setScalar(0.09 * k);
  });
}
