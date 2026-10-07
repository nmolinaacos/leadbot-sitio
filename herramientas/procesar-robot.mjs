// Limpia y reclasifica las texturas del robot de Tripo, suaviza y simplifica
// la malla, la corta en cabeza / cuerpo / brazos y exporta un .glb liviano.
//
// Uso (en una carpeta con robot.glb, el modelo original):
//   npm i @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer sharp
//   node procesar-robot.mjs        → leadbot-robot.glb (copiarlo a assets/)
// Variables: SIZE (texturas, 2048), RATIO (triángulos que quedan, 0.3), SMOOTH (pasadas, 6), NSCALE (relieve, 0.4).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsClearcoat, EXTMeshoptCompression, EXTTextureWebP } from '@gltf-transform/extensions';
import { weld, simplify, prune, dedup, quantize, reorder } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const SIZE = Number(process.env.SIZE || 2048);
const RATIO = Number(process.env.RATIO || 0.3);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read('robot.glb');
const root = doc.getRoot();
const mat = root.listMaterials()[0];

const raw = async (tex, channels) => sharp(Buffer.from(tex.getImage())).resize(SIZE, SIZE).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { data: base, info } = await raw(mat.getBaseColorTexture());
// Versión suavizada del color: quita las manchas del blanco.
const { data: soft } = await sharp(base, { raw: info }).median(7).blur(2.2).raw().toBuffer({ resolveWithObject: true });

const N = info.width * info.height;
// 0) Mapa de posiciones: en qué punto del robot (en 3D) cae cada píxel de la
// textura. Se rasteriza cada triángulo en el espacio UV.
const posMap = new Float32Array(N * 3).fill(NaN);
{
  const prim = root.listMeshes()[0].listPrimitives()[0];
  const P = prim.getAttribute('POSITION'), UV = prim.getAttribute('TEXCOORD_0');
  const idx = prim.getIndices().getArray();
  const Wd = info.width, Ht = info.height;
  const p = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], uv = [[0, 0], [0, 0], [0, 0]];
  for (let t = 0; t < idx.length; t += 3) {
    for (let j = 0; j < 3; j++) { P.getElement(idx[t + j], p[j]); UV.getElement(idx[t + j], uv[j]); }
    const xs = uv.map((q) => q[0] * Wd), ys = uv.map((q) => q[1] * Ht);
    const minX = Math.max(0, Math.floor(Math.min(...xs))), maxX = Math.min(Wd - 1, Math.ceil(Math.max(...xs)));
    const minY = Math.max(0, Math.floor(Math.min(...ys))), maxY = Math.min(Ht - 1, Math.ceil(Math.max(...ys)));
    const d = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2]);
    if (Math.abs(d) < 1e-9) continue;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      const a = ((ys[1] - ys[2]) * (px - xs[2]) + (xs[2] - xs[1]) * (py - ys[2])) / d;
      const b = ((ys[2] - ys[0]) * (px - xs[2]) + (xs[0] - xs[2]) * (py - ys[2])) / d;
      const c = 1 - a - b;
      if (a < -0.02 || b < -0.02 || c < -0.02) continue;
      const o = (y * Wd + x) * 3;
      posMap[o] = a * p[0][0] + b * p[1][0] + c * p[2][0];
      posMap[o + 1] = a * p[0][1] + b * p[1][1] + c * p[2][1];
      posMap[o + 2] = a * p[0][2] + b * p[1][2] + c * p[2][2];
    }
  }
}
// 1) Clasifica cada píxel (pesos de 0 a 255 por material) a partir del color suavizado.
const W8 = { blanco: Buffer.alloc(N), metal: Buffer.alloc(N), grafito: Buffer.alloc(N), oscuro: Buffer.alloc(N), luz: Buffer.alloc(N), boca: Buffer.alloc(N) };
const stats = { blanco: 0, metal: 0, grafito: 0, oscuro: 0, luz: 0, boca: 0 };
for (let i = 0; i < N; i++) {
  const r = soft[i * 3], g = soft[i * 3 + 1], b = soft[i * 3 + 2];
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const sat = max ? (max - min) / max : 0;
  let k;
  if (sat > 0.32 && b > r * 1.2 && b > 105) k = 'luz';
  else if (sat > 0.18 && r > b * 1.08 && lum < 150) k = 'boca';
  // Negro de los ojos: casi negro o azul marino saturado.
  // (por posición: frente de la cabeza, donde están los ojos)
  else if (lum < 34 || (lum < 112 && posMap[i * 3 + 1] > 0.55 && posMap[i * 3 + 2] > 0.1)) k = 'oscuro';
  else if (lum > 112) k = 'blanco';
  else if (lum < 78) k = 'grafito';
  else k = 'metal';
  W8[k][i] = 255;
  stats[k]++;
}
// 2) Bordes suaves entre materiales.
const blur = async (buf, r) => sharp(buf, { raw: { width: info.width, height: info.height, channels: 1 } }).blur(r).extractChannel(0).raw().toBuffer();
for (const k of Object.keys(W8)) W8[k] = await blur(W8[k], k === 'luz' || k === 'oscuro' ? 1.2 : k === 'blanco' ? 2.4 : 5);

// 3) Color, metal/rugosidad y emisión por material.
const MAT = {
  blanco: { c: [238, 241, 246], rough: 0.3, metal: 0, keep: 0.12 },
  metal: { c: [168, 175, 187], rough: 0.4, metal: 0.6, keep: 0.15 },
  grafito: { c: [104, 111, 123], rough: 0.4, metal: 0.65, keep: 0.12 },
  oscuro: { c: [8, 11, 18], rough: 0.08, metal: 0.05, keep: 0.4 },
  luz: { c: [70, 200, 255], rough: 0.25, metal: 0, keep: 0.2, glow: [40, 190, 255] },
  boca: { c: [70, 40, 32], rough: 0.4, metal: 0, keep: 0.5 },
};
const color = Buffer.alloc(N * 3);
const rm = Buffer.alloc(N * 3);
const emissive = Buffer.alloc(N * 3);
for (let i = 0; i < N; i++) {
  let tw = 0, cr = 0, cg = 0, cb = 0, ro = 0, me = 0, er = 0, eg = 0, eb = 0;
  for (const k of Object.keys(MAT)) {
    const w = W8[k][i] / 255;
    if (!w) continue;
    const m = MAT[k];
    tw += w;
    // keep: cuánto del detalle original se conserva (para no verse plano).
    const or = base[i * 3], og = base[i * 3 + 1], ob = base[i * 3 + 2];
    const lumO = (0.2126 * or + 0.7152 * og + 0.0722 * ob) / 255;
    const shade = 1 + (lumO - 0.7) * m.keep;
    cr += w * m.c[0] * shade; cg += w * m.c[1] * shade; cb += w * m.c[2] * shade;
    ro += w * m.rough; me += w * m.metal;
    if (m.glow) { er += w * m.glow[0]; eg += w * m.glow[1]; eb += w * m.glow[2]; }
  }
  tw = tw || 1;
  color[i * 3] = Math.min(255, cr / tw); color[i * 3 + 1] = Math.min(255, cg / tw); color[i * 3 + 2] = Math.min(255, cb / tw);
  rm[i * 3] = 255; rm[i * 3 + 1] = Math.round((ro / tw) * 255); rm[i * 3 + 2] = Math.round((me / tw) * 255);
  emissive[i * 3] = er / tw; emissive[i * 3 + 1] = eg / tw; emissive[i * 3 + 2] = eb / tw;
}
// Centro y radio de cada ojo (en coordenadas del modelo original), para la escena.
{
  const eyes = [[], []];
  for (let i = 0; i < N; i++) {
    if (W8.oscuro[i] < 200 || Number.isNaN(posMap[i * 3])) continue;
    const x = posMap[i * 3], y = posMap[i * 3 + 1], z = posMap[i * 3 + 2];
    if (y < 0.55 || z < 0.1) continue;
    eyes[x < 0 ? 0 : 1].push([x, y, z]);
  }
  // Ajuste de esfera por mínimos cuadrados: x²+y²+z² = 2ax + 2by + 2cz + d.
  const fit = (pts) => {
    const M = Array.from({ length: 4 }, () => new Float64Array(4)), v = new Float64Array(4);
    for (const [x, y, z] of pts) {
      const row = [2 * x, 2 * y, 2 * z, 1], rhs = x * x + y * y + z * z;
      for (let i = 0; i < 4; i++) { v[i] += row[i] * rhs; for (let j = 0; j < 4; j++) M[i][j] += row[i] * row[j]; }
    }
    // Gauss
    for (let i = 0; i < 4; i++) {
      let piv = i; for (let r = i + 1; r < 4; r++) if (Math.abs(M[r][i]) > Math.abs(M[piv][i])) piv = r;
      [M[i], M[piv]] = [M[piv], M[i]]; [v[i], v[piv]] = [v[piv], v[i]];
      for (let r = 0; r < 4; r++) if (r !== i) { const f = M[r][i] / M[i][i]; for (let c = 0; c < 4; c++) M[r][c] -= f * M[i][c]; v[r] -= f * v[i]; }
    }
    const a = v[0] / M[0][0], b = v[1] / M[1][1], c = v[2] / M[2][2], d = v[3] / M[3][3];
    return { centro: [a, b, c].map((q) => +q.toFixed(4)), radio: +Math.sqrt(d + a * a + b * b + c * c).toFixed(4) };
  };
  const near = (pts, cx) => pts.filter((p) => Math.abs(p[0] - cx) < 0.09 && p[1] > 0.6 && p[1] < 0.78);
  for (const [pts, cx] of [[eyes[0], -0.155], [eyes[1], 0.158]]) { const f = near(pts, cx); const zs = f.map(p => p[2]).sort((a, b) => a - b); console.log('esfera', JSON.stringify(fit(f)), f.length, 'z', zs[0], zs[f.length >> 1], zs[f.length - 1]); }
  const info2 = eyes.map((pts) => {
    const c = pts.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]).map((v) => v / pts.length);
    const rad = Math.sqrt(pts.reduce((a, p) => a + (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2, 0) / pts.length) * Math.SQRT2;
    const zmax = Math.max(...pts.map((p) => p[2]));
    return { centro: c.map((v) => +v.toFixed(4)), radio: +rad.toFixed(4), zmax: +zmax.toFixed(4), n: pts.length };
  });
  console.log('ojos', JSON.stringify(info2));
}
console.log('píxeles', Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, (v / N * 100).toFixed(1) + ' %'])));

const webp = (buf, q = 86) => sharp(buf, { raw: info }).webp({ quality: q }).toBuffer();
// El mapa de metal/rugosidad se suaviza para que no haya bordes duros entre zonas.
const rmSoft = await sharp(rm, { raw: info }).blur(1.2).raw().toBuffer();
const emSoft = await sharp(emissive, { raw: info }).blur(1.5).raw().toBuffer();
await sharp(color, { raw: info }).png().toFile('rev_color.png');
await sharp(rmSoft, { raw: info }).png().toFile('rev_rm.png');
await sharp(emSoft, { raw: info }).png().toFile('rev_emissive.png');

doc.createExtension(EXTTextureWebP).setRequired(true);
const setTex = async (tex, buf) => { tex.setImage(await webp(buf)).setMimeType('image/webp'); };
await setTex(mat.getBaseColorTexture(), color);
await setTex(mat.getMetallicRoughnessTexture(), rmSoft);
const normal = mat.getNormalTexture();
mat.setNormalScale(Number(process.env.NSCALE || 0.4));
normal.setImage(await sharp(Buffer.from(normal.getImage())).resize(SIZE, SIZE).webp({ quality: 90 }).toBuffer()).setMimeType('image/webp');
const emTex = doc.createTexture('emisivo').setImage(await webp(emSoft)).setMimeType('image/webp');
mat.setEmissiveTexture(emTex).setEmissiveFactor([1, 1, 1]);
mat.setMetallicFactor(1).setRoughnessFactor(1);
// Laca transparente: el brillo de un plástico inyectado.
const clearcoat = doc.createExtension(KHRMaterialsClearcoat).createClearcoat().setClearcoatFactor(0.35).setClearcoatRoughnessFactor(0.18);
mat.setExtension('KHR_materials_clearcoat', clearcoat);
mat.setExtension('KHR_materials_volume', null);
mat.setName('leadbot');
for (const ext of root.listExtensionsUsed()) if (ext.extensionName === 'KHR_materials_volume' || ext.extensionName === 'FB_ngon_encoding') ext.dispose();

await MeshoptSimplifier.ready;
await doc.transform(weld());
// Suavizado de Taubin (no encoge la forma): quita las ondulaciones de la malla
// generada por IA. Los vértices que comparten posición (costuras de UV) se
// mueven juntos para que no se abran grietas.
{
  const prim = root.listMeshes()[0].listPrimitives()[0];
  const pos = prim.getAttribute('POSITION');
  const idx = prim.getIndices().getArray();
  const n = pos.getCount();
  const P = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) pos.getElement(i, P.subarray(i * 3, i * 3 + 3));
  const key = (i) => `${Math.round(P[i * 3] * 1e5)},${Math.round(P[i * 3 + 1] * 1e5)},${Math.round(P[i * 3 + 2] * 1e5)}`;
  const groupOf = new Int32Array(n);
  const ids = new Map();
  for (let i = 0; i < n; i++) {
    const k = key(i);
    if (!ids.has(k)) ids.set(k, ids.size);
    groupOf[i] = ids.get(k);
  }
  const G = ids.size;
  const gp = new Float64Array(G * 3);
  const gc = new Float64Array(G);
  for (let i = 0; i < n; i++) { const g = groupOf[i]; if (gc[g]) continue; gp.set(P.subarray(i * 3, i * 3 + 3), g * 3); gc[g] = 1; }
  const nb = Array.from({ length: G }, () => new Set());
  for (let t = 0; t < idx.length; t += 3) {
    const a = groupOf[idx[t]], b = groupOf[idx[t + 1]], c = groupOf[idx[t + 2]];
    nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b);
  }
  const step = (f) => {
    const out = new Float64Array(gp.length);
    for (let g = 0; g < G; g++) {
      let x = 0, y = 0, z = 0, k = 0;
      for (const o of nb[g]) { if (o === g) continue; x += gp[o * 3]; y += gp[o * 3 + 1]; z += gp[o * 3 + 2]; k++; }
      if (!k) { out.set(gp.subarray(g * 3, g * 3 + 3), g * 3); continue; }
      out[g * 3] = gp[g * 3] + f * (x / k - gp[g * 3]);
      out[g * 3 + 1] = gp[g * 3 + 1] + f * (y / k - gp[g * 3 + 1]);
      out[g * 3 + 2] = gp[g * 3 + 2] + f * (z / k - gp[g * 3 + 2]);
    }
    gp.set(out);
  };
  const ITER = Number(process.env.SMOOTH || 6);
  for (let it = 0; it < ITER; it++) { step(0.5); step(-0.53); }
  for (let i = 0; i < n; i++) pos.setElement(i, [gp[groupOf[i] * 3], gp[groupOf[i] * 3 + 1], gp[groupOf[i] * 3 + 2]]);
  // Normales suaves por posición (sin costuras de sombreado).
  const gn = new Float64Array(G * 3);
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [groupOf[idx[t]], groupOf[idx[t + 1]], groupOf[idx[t + 2]]];
    const ax = gp[a * 3], ay = gp[a * 3 + 1], az = gp[a * 3 + 2];
    const ux = gp[b * 3] - ax, uy = gp[b * 3 + 1] - ay, uz = gp[b * 3 + 2] - az;
    const vx = gp[c * 3] - ax, vy = gp[c * 3 + 1] - ay, vz = gp[c * 3 + 2] - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const g of [a, b, c]) { gn[g * 3] += nx; gn[g * 3 + 1] += ny; gn[g * 3 + 2] += nz; }
  }
  const nor = prim.getAttribute('NORMAL');
  for (let i = 0; i < n; i++) {
    const g = groupOf[i];
    const x = gn[g * 3], y = gn[g * 3 + 1], z = gn[g * 3 + 2];
    const l = Math.hypot(x, y, z) || 1;
    nor.setElement(i, [x / l, y / l, z / l]);
  }
  console.log('suavizado', ITER, 'pasadas,', G, 'posiciones');
}
await doc.transform(
  simplify({ simplifier: MeshoptSimplifier, ratio: RATIO, error: 0.0008 }),
  dedup(),
  prune(),
);
// Cortar en partes que se mueven: cabeza, cuerpo y cada brazo (el modelo no
// trae esqueleto). Cada triángulo va a la parte de su centro.
{
  const HEAD = 0.455;
  const part = (x, y) => {
    if (y > HEAD) return 'cabeza';
    const ax = Math.abs(x);
    const arm = y > 0.12 && ((y > 0.255 && ax > 0.168) || ax > 0.205);
    return arm ? (x < 0 ? 'brazo_izq' : 'brazo_der') : 'cuerpo';
  };
  const scene = root.listScenes()[0];
  const node = root.listNodes().find((n) => n.getMesh());
  const mesh = node.getMesh();
  const prim = mesh.listPrimitives()[0];
  const pos = prim.getAttribute('POSITION');
  const idx = prim.getIndices().getArray();
  const buckets = { cabeza: [], cuerpo: [], brazo_izq: [], brazo_der: [] };
  const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
  for (let t = 0; t < idx.length; t += 3) {
    pos.getElement(idx[t], a); pos.getElement(idx[t + 1], b); pos.getElement(idx[t + 2], c);
    buckets[part((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3)].push(idx[t], idx[t + 1], idx[t + 2]);
  }
  const parent = node.getParentNode && node.getParentNode();
  for (const [name, list] of Object.entries(buckets)) {
    const indices = doc.createAccessor(name + '_idx').setType('SCALAR').setArray(new Uint32Array(list)).setBuffer(prim.getIndices().getBuffer());
    const p2 = doc.createPrimitive().setIndices(indices).setMaterial(prim.getMaterial());
    for (const sem of prim.listSemantics()) p2.setAttribute(sem, prim.getAttribute(sem));
    const m2 = doc.createMesh(name).addPrimitive(p2);
    const n2 = doc.createNode(name).setMesh(m2).setMatrix(node.getMatrix());
    scene.addChild(n2);
    console.log(name, list.length / 3, 'triángulos');
  }
  node.dispose();
  mesh.dispose();
}
await doc.transform(
  prune(),
  reorder({ encoder: MeshoptEncoder }),
  quantize(),
);
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
await io.write('leadbot-robot.glb', doc);

