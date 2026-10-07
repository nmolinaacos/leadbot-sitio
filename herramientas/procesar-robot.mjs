// Repinta las texturas del robot de Tripo por zonas en 3D (como la imagen de
// referencia), suaviza y simplifica
// la malla, la corta en cabeza / cuerpo / brazos y exporta un .glb liviano.
//
// Uso (en una carpeta con robot.glb, el modelo original):
//   npm i @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer sharp
//   node procesar-robot.mjs        → leadbot-robot.glb (copiarlo a assets/)
// Variables: SIZE (texturas, 2048), RATIO (triángulos que quedan, 0.3), SMOOTH (pasadas, 10), NSCALE (relieve, 0.08).
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
// 1) Pintura por posición en 3D (como la imagen de referencia): la cabeza se
// pinta con formas limpias (casco, cara, ojos, sonrisa, audífonos) y el cuerpo
// usa la zona de la IA muy suavizada (blanco / metal / grafito).
const smoothL = await sharp(base, { raw: info }).median(13).blur(16).raw().toBuffer();
const lumAt = (buf, i) => 0.2126 * buf[i * 3] + 0.7152 * buf[i * 3 + 1] + 0.0722 * buf[i * 3 + 2];
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const MATS = {
  casco: { c: [244, 246, 249], rough: 0.2, metal: 0 },
  cara: { c: [214, 219, 226], rough: 0.42, metal: 0 },
  metalClaro: { c: [170, 177, 188], rough: 0.38, metal: 0.6 },
  lente: { c: [5, 7, 11], rough: 0.04, metal: 0.1 },
  aro: { c: [20, 190, 255], rough: 0.2, metal: 0, em: [0, 200, 255] },
  aroBorde: { c: [12, 34, 70], rough: 0.2, metal: 0.2, em: [5, 40, 110] },
  boca: { c: [40, 32, 32], rough: 0.4, metal: 0 },
  oscuro: { c: [40, 44, 52], rough: 0.36, metal: 0.5 },
  orejaAro: { c: [62, 122, 255], rough: 0.25, metal: 0.55, em: [12, 45, 140] },
  blanco: { c: [240, 243, 247], rough: 0.24, metal: 0 },
  metal: { c: [150, 157, 168], rough: 0.45, metal: 0.6 },
  grafito: { c: [66, 72, 84], rough: 0.45, metal: 0.55 },
  luz: { c: [60, 205, 255], rough: 0.2, metal: 0, em: [35, 190, 255] },
};
const EYES = [[-0.158, 0.672], [0.165, 0.675]];
const LENS = 0.071, RING = 0.088, RING_EDGE = 0.095;
// Devuelve [[material, peso], ...] para un punto del robot.
const paint = (x, y, z, i) => {
  if (y > 0.455) {
    const front = z > 0.06;
    const ax = Math.abs(x);
    // Audífonos.
    if (ax > 0.305) {
      const r = Math.hypot(y - 0.655, z - 0.005);
      if (r < 0.045) return [['oscuro', 1]];
      if (r < 0.064) return [['orejaAro', 1]];
      return [['casco', 1]];
    }
    // Ojos: lente negro, aro cian y un borde azul marino.
    if (front) for (const [cx, cy] of EYES) {
      const r = Math.hypot(x - cx, y - cy);
      if (r < RING_EDGE + 0.004) {
        const lens = 1 - sstep(LENS - 0.002, LENS + 0.002, r);
        const ring = sstep(LENS - 0.002, LENS + 0.002, r) * (1 - sstep(RING - 0.002, RING + 0.002, r));
        const edge = sstep(RING - 0.002, RING + 0.002, r) * (1 - sstep(RING_EDGE - 0.002, RING_EDGE + 0.003, r));
        const rest = Math.max(0, 1 - lens - ring - edge);
        return [['lente', lens], ['aro', ring], ['aroBorde', edge], ['cara', rest]];
      }
    }
    // Sonrisa: un arco fino.
    if (front && z > 0.15) {
      const r = Math.hypot(x, y - 0.578);
      const onArc = 1 - sstep(0.0025, 0.005, Math.abs(r - 0.04));
      if (onArc > 0 && y < 0.562 && ax < 0.033) return [['boca', onArc], ['cara', 1 - onArc]];
    }
    // Ranura del casco y marcas oscuras de arriba (las de la IA).
    if (y > 0.82 && ax < 0.14 && z > 0.12 && y < 0.93 && lumAt(soft, i) < 125) return [['oscuro', 1]];
    // Aro del mentón y cuello.
    if (y < 0.5 && front) return [['metalClaro', 1]];
    if (y < 0.5) return [['oscuro', 1]];
    // Cara (gris claro) dentro del casco blanco.
    if (front && y > 0.505 && y < 0.812 && ax < 0.29) {
      const k = Math.pow(ax / 0.29, 4) + Math.pow(Math.abs(y - 0.66) / 0.155, 4);
      const inFace = 1 - sstep(0.9, 1.0, k);
      return [['cara', inFace], ['casco', 1 - inFace]];
    }
    return [['casco', 1]];
  }
  // Cuerpo: blanco / metal / grafito según la zona (muy suavizada) de la IA.
  const L = lumAt(smoothL, i);
  const r0 = soft[i * 3], g0 = soft[i * 3 + 1], b0 = soft[i * 3 + 2];
  const mx = Math.max(r0, g0, b0), mn = Math.min(r0, g0, b0);
  if (mx && (mx - mn) / mx > 0.34 && b0 > r0 * 1.25 && b0 > 110) return [['luz', 1]];
  const w = sstep(98, 122, L), g = 1 - sstep(55, 75, L);
  return [['blanco', w], ['grafito', g * (1 - w)], ['metal', (1 - w) * (1 - g)]];
};

const color = Buffer.alloc(N * 3);
const rm = Buffer.alloc(N * 3);
const emissive = Buffer.alloc(N * 3);
const valid = new Uint8Array(N);
for (let i = 0; i < N; i++) {
  const x = posMap[i * 3];
  if (Number.isNaN(x)) continue;
  valid[i] = 1;
  let tw = 0, cr = 0, cg = 0, cb = 0, ro = 0, me = 0, er = 0, eg = 0, eb = 0;
  for (const [k, w] of paint(x, posMap[i * 3 + 1], posMap[i * 3 + 2], i)) {
    if (w <= 0) continue;
    const m = MATS[k];
    tw += w; cr += w * m.c[0]; cg += w * m.c[1]; cb += w * m.c[2]; ro += w * m.rough; me += w * m.metal;
    if (m.em) { er += w * m.em[0]; eg += w * m.em[1]; eb += w * m.em[2]; }
  }
  tw = tw || 1;
  color[i * 3] = cr / tw; color[i * 3 + 1] = cg / tw; color[i * 3 + 2] = cb / tw;
  rm[i * 3] = 255; rm[i * 3 + 1] = Math.round((ro / tw) * 255); rm[i * 3 + 2] = Math.round((me / tw) * 255);
  emissive[i * 3] = er / tw; emissive[i * 3 + 1] = eg / tw; emissive[i * 3 + 2] = eb / tw;
}
// 2) Relleno de bordes: los píxeles fuera de los triángulos toman el color del
// vecino válido más cercano, para que no aparezcan líneas en las costuras.
{
  const Wd = info.width, Ht = info.height;
  let frontier = valid;
  for (let pass = 0; pass < 8; pass++) {
    const next = frontier.slice();
    for (let y = 0; y < Ht; y++) for (let x = 0; x < Wd; x++) {
      const i = y * Wd + x;
      if (frontier[i]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= Wd || ny >= Ht) continue;
        const j = ny * Wd + nx;
        if (!frontier[j]) continue;
        for (const buf of [color, rm, emissive]) { buf[i * 3] = buf[j * 3]; buf[i * 3 + 1] = buf[j * 3 + 1]; buf[i * 3 + 2] = buf[j * 3 + 2]; }
        next[i] = 1;
        break;
      }
    }
    frontier = next;
  }
}

const webp = (buf, q = 86) => sharp(buf, { raw: info }).webp({ quality: q }).toBuffer();
// El mapa de metal/rugosidad se suaviza para que no haya bordes duros entre zonas.
const rmSoft = rm;
const emSoft = emissive;
await sharp(color, { raw: info }).png().toFile('rev_color.png');
await sharp(rmSoft, { raw: info }).png().toFile('rev_rm.png');
await sharp(emSoft, { raw: info }).png().toFile('rev_emissive.png');

doc.createExtension(EXTTextureWebP).setRequired(true);
const setTex = async (tex, buf) => { tex.setImage(await webp(buf)).setMimeType('image/webp'); };
await setTex(mat.getBaseColorTexture(), color);
await setTex(mat.getMetallicRoughnessTexture(), rmSoft);
const normal = mat.getNormalTexture();
mat.setNormalScale(Number(process.env.NSCALE || 0.08));
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
  const ITER = Number(process.env.SMOOTH || 10);
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

