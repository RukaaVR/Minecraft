// Mob models and textures, redrawn: Minecraft's proportions, hand-drawn pixel faces,
// soft clustered fur, wool and camouflage, glowing eyes, and per-face shading baked
// into vertex colours so every model reads as a solid 3D object (players too).
'use strict';

// ---------------------------------------------------------------- noise for painting
function pxHash(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1440670441);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function pxNoise(x, y, s, scale) {
  const fx = x / scale, fy = y / scale, ix = Math.floor(fx), iy = Math.floor(fy);
  let tx = fx - ix, ty = fy - iy;
  tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const a = pxHash(ix, iy, s), b = pxHash(ix + 1, iy, s), c = pxHash(ix, iy + 1, s), d = pxHash(ix + 1, iy + 1, s);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
// Pick from `keys` (dark to light) by clustered noise plus a little per-pixel grain
function furMix(keys, scale = 2, grain = 0.35, off = 0) {
  return (x, y, w, h, F) => {
    let n = pxNoise(F.gx + x, F.gy + y, F.seed + off, scale) * (1 - grain) + pxHash(F.gx + x, F.gy + y, F.seed + off + 11) * grain;
    n = Math.max(0, Math.min(0.999, (n - 0.5) * 1.7 + 0.5));
    return keys[Math.floor(n * keys.length)];
  };
}
// Rows painted by different specs: rowBands([[rows, spec], ...]) — rows counted from the top
function rowBands(list) {
  return (x, y, w, h, F) => {
    let at = 0;
    for (const [n, spec] of list) {
      if (y < at + n) return MobSheet.pixel(spec, x, y - at, w, n, Object.assign({}, F, { gy: F.gy + at }));
      at += n;
    }
    const [n, spec] = list[list.length - 1];
    return MobSheet.pixel(spec, x, y - (at - n), w, n, Object.assign({}, F, { gy: F.gy + at - n }));
  };
}
// A pixel map over a base: '?' shows the base
const overMap = (base, map) => ({ base, map });

// ---------------------------------------------------------------- texture sheets
// Boxes are packed into the sheet automatically; each face is painted from a palette
// key, a pixel map (rows of keys, '.' = transparent), a function, or {base, map}.
// Face pixel coordinates read as you'd see the face from outside: x left to right,
// y top to bottom (top face: last row is the front; right = the mob's right, -x).
const SIDE_FACES = { right: 1, front: 1, left: 1, back: 1 };
const MOB_SHEETS = {};
class MobSheet {
  constructor(name, pal, seed) { this.name = name; this.pal = pal; this.seed = seed; this.boxes = new Map(); }
  box(key, w, h, d, faces = {}) { this.boxes.set(key, { w, h, d, faces }); return this; }
  static pixel(spec, x, y, w, h, F) {
    if (typeof spec === 'function') return spec(x, y, w, h, F);
    if (typeof spec === 'string') return spec;
    if (Array.isArray(spec)) { const row = spec[y]; return (row && row[x]) || '.'; }
    if (spec && spec.map) {
      const row = spec.map[y], ch = row && row[x];
      return ch && ch !== '?' ? ch : MobSheet.pixel(spec.base, x, y, w, h, F);
    }
    return '.';
  }
  build() {
    const list = [...this.boxes.values()].sort((a, b) => (b.h + b.d) - (a.h + a.d));
    let W = 64;
    while (W < Math.max(...list.map((b) => 2 * (b.w + b.d)))) W *= 2;
    let x = 0, y = 0, rowH = 0;
    for (const b of list) {
      const bw = 2 * (b.w + b.d);
      if (x + bw > W) { x = 0; y += rowH; rowH = 0; }
      b.u = x; b.v = y; x += bw; rowH = Math.max(rowH, b.d + b.h);
    }
    let H = 32;
    while (H < y + rowH) H *= 2;
    this.W = W; this.H = H;
    const c = makeSkinCanvas(W, H), ctx = c.getContext('2d');
    const img = ctx.createImageData(W, H);
    for (const b of list) {
      const { u, v, w, h, d } = b;
      const rects = { top: [u + d, v, w, d], bottom: [u + d + w, v, w, d], right: [u, v + d, d, h], front: [u + d, v + d, w, h], left: [u + d + w, v + d, d, h], back: [u + d + w + d, v + d, w, h] };
      for (const face in rects) {
        const f = b.faces;
        const spec = f[face] !== undefined ? f[face]
          : (face === 'left' || face === 'right') && f.lr !== undefined ? f.lr
          : SIDE_FACES[face] && f.sides !== undefined ? f.sides : f.all;
        const [x0, y0, rw, rh] = rects[face];
        const F = { gx: x0, gy: y0, seed: this.seed, face };
        for (let py = 0; py < rh; py++) for (let px = 0; px < rw; px++) {
          let col = MobSheet.pixel(spec, px, py, rw, rh, F);
          if (typeof col === 'string') col = this.pal[col];
          if (!col) continue;
          const i = ((y0 + py) * W + x0 + px) * 4;
          img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2];
          img.data[i + 3] = col.length > 3 ? Math.round(col[3] * 255) : 255;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    this.tex = tex;
    SKINS[this.name] = { tex, w: W, h: H };
    return this;
  }
  geo(key, inflate = 0) {
    const b = this.boxes.get(key);
    return skinBox(b.w, b.h, b.d, b.u, b.v, this.W, this.H, inflate);
  }
}
function mobSheet(name, pal, seed, define) {
  if (!MOB_SHEETS[name]) { const s = new MobSheet(name, pal, seed); define(s); MOB_SHEETS[name] = s.build(); }
  return MOB_SHEETS[name];
}

// ---------------------------------------------------------------- model assembly
// Positions are in model pixels, measured from the feet; +z is the mob's front.
function newMobModel(sheet, matOpts = {}) {
  const root = new THREE.Group(), inner = new THREE.Group();
  root.add(inner);
  const mat = new THREE.MeshBasicMaterial(Object.assign({ map: sheet.tex }, matOpts));
  return { root, inner, mat, parts: {}, sheet };
}
function pivotAt(parent, pos, parentPos = [0, 0, 0]) {
  const g = new THREE.Group();
  g.position.set((pos[0] - parentPos[0]) * MODEL_SCALE, (pos[1] - parentPos[1]) * MODEL_SCALE, (pos[2] - parentPos[2]) * MODEL_SCALE);
  g.userData.px = pos;
  parent.add(g);
  return g;
}
// Box `key` with its minimum corner at `min`, added to a group pivoted at `pivot`
function boxIn(group, model, key, min, inflate = 0, mat = model.mat) {
  const b = model.sheet.boxes.get(key), pv = group.userData.px || [0, 0, 0];
  const m = new THREE.Mesh(model.sheet.geo(key, inflate), mat);
  m.position.set((min[0] + b.w / 2 - pv[0]) * MODEL_SCALE, (min[1] + b.h / 2 - pv[1]) * MODEL_SCALE, (min[2] + b.d / 2 - pv[2]) * MODEL_SCALE);
  group.add(m);
  return m;
}
function limb(model, key, pivot, min, inflate = 0) {
  const g = pivotAt(model.inner, pivot);
  boxIn(g, model, key, min, inflate);
  return g;
}
// Eyes that glow in the dark: a second, untinted layer over the face
function glowLayer(model, group, key, min) {
  model.glowMat = model.glowMat || new THREE.MeshBasicMaterial({ map: model.sheet.tex, alphaTest: 0.5 });
  const m = boxIn(group, model, key, min, 0.08, model.glowMat);
  m.renderOrder = 1;
  return m;
}
const finishModel = (model, height, width, headY) => Object.assign(model, { height, width, headY });

// Per-face shading, like Minecraft's entity lighting: tops bright, undersides dark
const FACE_SHADE = [0.64, 0.64, 1, 0.52, 0.84, 0.84]; // +x, -x, +y, -y, +z, -z
function shadeBoxGeometry(g) {
  if (g.attributes.color) return;
  const n = g.attributes.position.count, per = n / 6, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.fill(g.type === 'BoxGeometry' ? FACE_SHADE[Math.min(5, Math.floor(i / per))] : 1, i * 3, i * 3 + 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}
function shadeModel(model) {
  const mats = new Set();
  model.root.traverse((o) => { if (o.isMesh && o.geometry.type === 'BoxGeometry' && o.material && o.material.map) { shadeBoxGeometry(o.geometry); mats.add(o.material); } });
  model.root.traverse((o) => { if (o.isMesh && mats.has(o.material)) shadeBoxGeometry(o.geometry); });
  for (const m of mats) { m.vertexColors = true; m.needsUpdate = true; }
  return model;
}

// ---------------------------------------------------------------- the mobs
const BESTIARY = {
  pig() {
    const S = mobSheet('m3_pig', {
      P: [239, 166, 163], p: [225, 146, 144], Q: [248, 186, 182], q: [208, 126, 126], H: [176, 100, 100],
      W: [252, 252, 252], K: [28, 22, 22], N: [246, 194, 190], n: [150, 82, 84], T: [214, 128, 128],
    }, 11, (s) => {
      const skin = furMix('pPPPPQ', 2.6, 0.2);
      s.box('head', 8, 8, 8, { all: skin, bottom: furMix('qp'), front: overMap(skin, ['????????', '????????', '????????', 'WK????KW', '????????', '????????', '????????', 'p??????p']) });
      s.box('snout', 4, 3, 1, { all: 'N', top: 'Q', bottom: 'p', front: ['NQQN', 'nNNn', 'NNNN'] });
      s.box('body', 10, 8, 16, { all: furMix('pPPPQ', 3), top: furMix('pPPQQ', 3), bottom: furMix('qqp'), back: overMap(furMix('pPPPQ', 3), ['??????????', '????TTT???', '????T?T???', '????TT????']) });
      s.box('leg', 4, 6, 4, { sides: overMap(furMix('pPP'), ['????', '????', '????', '????', '????', 'HHHH']), top: 'P', bottom: 'H' });
    });
    const M = newMobModel(S), P = M.parts;
    for (const [n, x, z] of [['legFL', -3, 5], ['legFR', 3, 5], ['legBL', -3, -7], ['legBR', 3, -7]]) P[n] = limb(M, 'leg', [x, 6, z], [x - 2, 0, z - 2]);
    P.body = limb(M, 'body', [0, 6, 0], [-5, 6, -8]);
    P.head = limb(M, 'head', [0, 12, 6], [-4, 8, 6]);
    boxIn(P.head, M, 'snout', [-2, 9, 14]);
    return finishModel(M, 0.9, 0.9, 12);
  },

  cow() {
    const coat = (x, y, w, h, F) => {
      const v = pxNoise(F.gx + x, F.gy + y, F.seed, 3.4), r = pxHash(F.gx + x, F.gy + y, F.seed + 5);
      if (v > 0.63) return r < 0.18 ? 'w' : 'W';
      if (v > 0.6) return 'w';
      return r < 0.2 ? 'b' : r > 0.9 ? 'c' : 'B';
    };
    const S = mobSheet('m3_cow', {
      B: [77, 57, 40], b: [61, 45, 31], c: [96, 73, 52], W: [236, 234, 230], w: [206, 202, 196], E: [246, 246, 246], K: [16, 14, 12],
      M: [198, 182, 170], m: [172, 156, 144], n: [94, 70, 64], H: [226, 222, 210], h: [166, 160, 148], U: [234, 160, 160], u: [204, 126, 128], O: [52, 46, 42],
    }, 23, (s) => {
      const hair = furMix('bBBBc', 2);
      s.box('head', 8, 8, 6, { all: hair, bottom: 'm',
        top: overMap(hair, ['????????', '????????', '????????', '???WW???', '???WW???', '???WW???']),
        front: ['BBBBBBBB', 'BbBWWBbB', 'BBWWWWBB', 'EKBWWBKE', 'BBBWWBBB', 'BMMMMMMB', 'BMnMMnMB', 'BmMMMMmB'] });
      s.box('horn', 1, 3, 1, { all: 'H', top: 'h' });
      s.box('body', 12, 10, 18, { all: coat });
      s.box('udder', 4, 1, 6, { all: 'U', bottom: ['UUUU', 'uUUu', 'UUUU', 'UUUU', 'uUUu', 'UUUU'] });
      s.box('leg', 4, 12, 4, { sides: overMap(coat, ['????', '????', '????', '????', '????', '????', '????', '????', '????', '????', '????', 'OOOO']), top: coat, bottom: 'O' });
    });
    const M = newMobModel(S), P = M.parts;
    for (const [n, x, z] of [['legFL', -4, 6], ['legFR', 4, 6], ['legBL', -4, -7], ['legBR', 4, -7]]) P[n] = limb(M, 'leg', [x, 12, z], [x - 2, 0, z - 2]);
    P.body = limb(M, 'body', [0, 12, 0], [-6, 12, -10]);
    boxIn(P.body, M, 'udder', [-2, 11, -10]);
    P.head = limb(M, 'head', [0, 20, 8], [-4, 16, 8]);
    boxIn(P.head, M, 'horn', [-5, 22, 11]); boxIn(P.head, M, 'horn', [4, 22, 11]);
    return finishModel(M, 1.4, 0.9, 20);
  },

  sheep() {
    const wool = (x, y, w, h, F) => {
      const v = pxNoise(F.gx + x, F.gy + y, F.seed, 1.6), r = pxHash(F.gx + x, F.gy + y, F.seed + 3);
      if (v < 0.3) return r < 0.5 ? 'z' : 'x';
      if (v > 0.72) return 'y';
      return r < 0.12 ? 'x' : 'X';
    };
    const S = mobSheet('m3_sheep', {
      F: [226, 206, 188], f: [204, 182, 163], g: [184, 160, 140], E: [252, 252, 252], K: [26, 22, 20], R: [228, 150, 150], r: [194, 114, 116], H: [108, 92, 80],
      X: [236, 236, 236], x: [216, 216, 216], y: [249, 249, 249], z: [196, 196, 196],
    }, 37, (s) => {
      const face = furMix('fFFFF', 3, 0.15);
      s.box('head', 6, 6, 8, { all: face, bottom: 'f', front: ['FFFFFF', 'FFFFFF', 'EKFFKE', 'FFFFFF', 'fFRRFf', 'fFrrFf'] });
      s.box('headWool', 6, 6, 6, { all: wool });
      s.box('body', 8, 6, 16, { all: furMix('fFFFF', 3, 0.15), bottom: 'f' });
      s.box('bodyWool', 8, 6, 16, { all: wool });
      s.box('leg', 4, 12, 4, { sides: overMap(face, ['????', '????', '????', '????', '????', '????', '????', '????', '????', '????', 'HHHH', 'HHHH']), top: 'F', bottom: 'H' });
      s.box('legWool', 4, 6, 4, { all: wool });
    });
    const M = newMobModel(S), P = M.parts;
    P.wool = [];
    for (const [n, x, z] of [['legFL', -3, 5], ['legFR', 3, 5], ['legBL', -3, -7], ['legBR', 3, -7]]) {
      P[n] = limb(M, 'leg', [x, 12, z], [x - 2, 0, z - 2]);
      P.wool.push(boxIn(P[n], M, 'legWool', [x - 2, 6, z - 2], 1));
    }
    P.body = limb(M, 'body', [0, 12, 0], [-4, 12, -8]);
    P.wool.push(boxIn(P.body, M, 'bodyWool', [-4, 12, -8], 3.5));
    P.head = limb(M, 'head', [0, 18, 8], [-3, 16, 6]);
    P.wool.push(boxIn(P.head, M, 'headWool', [-3, 16, 6], 1.2));
    return finishModel(M, 1.3, 0.9, 18);
  },

  chicken() {
    const S = mobSheet('m3_chicken', {
      W: [250, 250, 250], w: [232, 232, 232], g: [212, 212, 212], G: [188, 188, 188], K: [22, 22, 22],
      Y: [248, 184, 48], y: [214, 140, 28], R: [214, 42, 32], r: [168, 30, 24], O: [242, 168, 46], o: [204, 128, 30],
    }, 41, (s) => {
      const feathers = furMix('gwWWW', 1.8);
      s.box('head', 4, 6, 3, { all: feathers, top: furMix('wWW'), bottom: 'w',
        front: ['WWWW', 'KWWK', 'WWWW', 'WWWW', 'wWWw', 'wwww'],
        right: ['WWW', 'WWK', 'WWW', 'WWW', 'wWW', 'www'], left: ['WWW', 'KWW', 'WWW', 'WWW', 'WWw', 'www'] });
      s.box('beak', 4, 2, 2, { all: 'Y', front: ['YYYY', 'yyyy'], bottom: 'y' });
      s.box('wattle', 2, 2, 2, { all: 'R', front: ['RR', 'rr'] });
      s.box('body', 6, 6, 8, { all: feathers, top: furMix('wWWW'), bottom: 'w' });
      s.box('wing', 1, 4, 6, { all: 'W', lr: ['WWWWWW', 'WwWWwW', 'wWwWwW', 'gGgGgw'], bottom: 'g' });
      s.box('leg', 1, 4, 1, { all: 'O', front: ['O', 'o', 'O', 'O'] });
      s.box('foot', 3, 1, 3, { all: 'o', top: ['OoO', 'OOO', 'OOO'] });
    });
    const M = newMobModel(S), P = M.parts;
    for (const [n, x] of [['legL', -1.5], ['legR', 1.5]]) {
      P[n] = limb(M, 'leg', [x, 5, 0.5], [x - 0.5, 1, 0]);
      boxIn(P[n], M, 'foot', [x - 1.5, 0, -0.5]);
    }
    P.body = limb(M, 'body', [0, 5, 0], [-3, 5, -4]);
    P.wingL = limb(M, 'wing', [-3.5, 11, 0], [-4, 7, -3]);
    P.wingR = limb(M, 'wing', [3.5, 11, 0], [3, 7, -3]);
    P.head = limb(M, 'head', [0, 9, 4], [-2, 9, 3]);
    boxIn(P.head, M, 'beak', [-2, 11, 6]);
    boxIn(P.head, M, 'wattle', [-1, 9, 5]);
    return finishModel(M, 0.7, 0.4, 9);
  },

  wolf() {
    const S = mobSheet('m3_wolf', {
      G: [218, 214, 211], g: [198, 193, 189], d: [172, 166, 161], D: [140, 134, 129], W: [242, 240, 237], w: [228, 224, 220], K: [22, 20, 20], N: [44, 38, 36],
    }, 53, (s) => {
      const fur = furMix('gGGGw', 1.8), back = furMix('DDdg', 1.8);
      s.box('head', 6, 6, 4, { all: fur, top: back, bottom: 'W', front: ['dGGGGd', 'GdGGdG', 'GKGGKG', 'GGGGGG', 'WGGGGW', 'WWGGWW'] });
      s.box('ear', 2, 2, 1, { all: 'd', front: ['Dd', 'dw'] });
      s.box('snout', 3, 3, 4, { all: 'G', front: ['gNg', 'GGG', 'WWW'], top: ['GGG', 'GGG', 'GgG', 'gNg'], lr: ['GGGG', 'GGGG', 'WWWW'], bottom: 'W' });
      s.box('body', 6, 6, 9, { all: rowBands([[2, back], [2, fur], [2, furMix('wW')]]), top: back, bottom: 'W', back: furMix('dgG') });
      s.box('mane', 8, 7, 6, { all: rowBands([[3, furMix('dDdg', 1.6)], [4, fur]]), top: back, front: rowBands([[2, furMix('dgG')], [3, fur], [2, 'W']]), bottom: 'W' });
      s.box('leg', 2, 8, 2, { sides: rowBands([[7, fur], [1, 'd']]), top: 'G', bottom: 'd' });
      s.box('tail', 2, 8, 2, { all: rowBands([[6, furMix('dgG')], [2, 'D']]) });
    });
    const M = newMobModel(S), P = M.parts;
    for (const [n, x, z] of [['legFL', -1.5, 4], ['legFR', 1.5, 4], ['legBL', -1.5, -7], ['legBR', 1.5, -7]]) P[n] = limb(M, 'leg', [x, 8, z], [x - 1, 0, z - 1]);
    P.body = limb(M, 'body', [0, 7, 0], [-3, 7, -9]);
    boxIn(P.body, M, 'mane', [-4, 7, 0]);
    P.head = limb(M, 'head', [0, 10.5, 7], [-3, 7.5, 5]);
    boxIn(P.head, M, 'snout', [-1.5, 7.5, 9]);
    boxIn(P.head, M, 'ear', [-3, 13.5, 6]); boxIn(P.head, M, 'ear', [1, 13.5, 6]);
    P.tail = limb(M, 'tail', [0, 12, -8], [-1, 4, -9]);
    P.tail.rotation.x = 0.6;
    const collar = new THREE.Mesh(new THREE.BoxGeometry(8.4 * MODEL_SCALE, 1.5 * MODEL_SCALE, 2.4 * MODEL_SCALE), new THREE.MeshBasicMaterial({ color: 0xc02020 }));
    collar.position.set(0, 10 * MODEL_SCALE, 5 * MODEL_SCALE);
    collar.visible = false;
    M.inner.add(collar);
    P.collar = collar;
    M.tintMats = [collar.material];
    return finishModel(M, 0.85, 0.6, 10.5);
  },

  creeper() {
    const camo = (x, y, w, h, F) => {
      const t = pxNoise(F.gx + x, F.gy + y, F.seed, 1.5) * 0.55 + pxHash(F.gx + x, F.gy + y, F.seed + 9) * 0.45;
      return t < 0.24 ? 'C' : t < 0.4 ? 'B' : t < 0.6 ? 'a' : t < 0.78 ? 'A' : t < 0.9 ? 'b' : 'c';
    };
    const S = mobSheet('m3_creeper', {
      A: [92, 196, 78], a: [70, 170, 58], B: [52, 140, 42], b: [120, 216, 102], C: [36, 104, 30], c: [170, 218, 160], K: [14, 14, 14], k: [44, 44, 44],
    }, 61, (s) => {
      s.box('head', 8, 8, 8, { all: camo, front: overMap(camo, ['????????', '????????', '?KK??KK?', '?KK??KK?', '???KK???', '??KkkK??', '??KKKK??', '??K??K??']) });
      s.box('body', 8, 12, 4, { all: camo });
      s.box('leg', 4, 6, 4, { all: camo, bottom: 'C' });
    });
    const M = newMobModel(S), P = M.parts;
    for (const [n, x, z] of [['legFL', -2, 4], ['legFR', 2, 4], ['legBL', -2, -4], ['legBR', 2, -4]]) P[n] = limb(M, 'leg', [x, 6, z], [x - 2, 0, z - 2]);
    P.body = limb(M, 'body', [0, 6, 0], [-4, 6, -2]);
    P.head = limb(M, 'head', [0, 18, 0], [-4, 18, -4]);
    return finishModel(M, 1.7, 0.6, 18);
  },

  zombie() {
    const S = mobSheet('m3_zombie', {
      G: [102, 152, 74], g: [82, 128, 58], h: [126, 176, 96], D: [60, 96, 44], K: [24, 36, 20],
      C: [42, 160, 160], c: [30, 128, 128], L: [64, 188, 188], t: [22, 100, 100],
      P: [72, 62, 172], p: [56, 48, 138], l: [92, 84, 198], O: [96, 96, 96], o: [70, 70, 70],
    }, 71, (s) => {
      const skin = furMix('gGGGh', 2, 0.25), shirt = furMix('cCCCL', 2), pants = furMix('pPPPl', 2);
      s.box('head', 8, 8, 8, { all: skin, top: furMix('DDgG'), bottom: 'g', front: ['DgGGGGgD', 'GGGhGGGG', 'GGGGGGhG', 'GDDGGDDG', 'GKKGGKKG', 'GGGgDGGG', 'GgDDDDgG', 'gGGGGGGg'] });
      const torso = rowBands([[8, shirt], [1, overMap(shirt, ['tCtCCtCt'])], [1, overMap(skin, ['?t??t??t'])], [2, pants]]);
      s.box('body', 8, 12, 4, { all: torso, top: shirt, bottom: pants });
      s.box('arm', 4, 12, 4, { sides: rowBands([[3, shirt], [1, ['tCtC']], [8, skin]]), top: shirt, bottom: 'g' });
      s.box('leg', 4, 12, 4, { sides: rowBands([[9, pants], [1, 'O'], [1, ['OoOO']], [1, 'o']]), top: pants, bottom: 'o' });
    });
    return BESTIARY._humanoid(S, 4);
  },

  skeleton() {
    const S = mobSheet('m3_skeleton', {
      B: [198, 198, 198], b: [168, 168, 168], d: [130, 130, 130], D: [92, 92, 92], W: [228, 228, 228], K: [16, 16, 16], k: [52, 52, 52],
    }, 79, (s) => {
      const bone = furMix('bBBBW', 1.8);
      s.box('head', 8, 8, 8, { all: bone, bottom: 'd', front: ['BWBBBBWB', 'BBBBBBBB', 'BbBBBBbB', 'BKKBBKKB', 'BKKBBKKB', 'BBBddBBB', 'BdKKKKdB', 'bBdBdBBb'] });
      s.box('body', 8, 12, 4, {
        front: ['BBBBBBBB', '...BB...', '.bBBBBb.', '...BB...', '.bBBBBb.', '...BB...', '.bBBBBb.', '...BB...', '...BB...', '...Bb...', '.BBBBBB.', '.BB..BB.'],
        back: ['BBBBBBBB', '...BB...', '.bBBBBb.', '...BB...', '.bBBBBb.', '...BB...', '.bBBBBb.', '...BB...', '...BB...', '...bB...', '.BBBBBB.', '.BB..BB.'],
        lr: ['BBBB', '....', 'bBBb', '....', 'bBBb', '....', 'bBBb', '....', '....', '....', 'BBBB', 'B..B'],
        top: 'B', bottom: ['.BBBBBB.', '.BBBBBB.', '.BBBBBB.', '.BBBBBB.'],
      });
      s.box('limb', 2, 12, 2, { sides: ['BW', 'BB', 'BB', 'BB', 'Bb', 'bd', 'Bb', 'BB', 'BW', 'BB', 'BB', 'bb'], top: 'B', bottom: 'b' });
    });
    const M = newMobModel(S, { alphaTest: 0.5, side: THREE.DoubleSide }), P = M.parts;
    P.legL = limb(M, 'limb', [-2, 12, 0], [-3, 0, -1]);
    P.legR = limb(M, 'limb', [2, 12, 0], [1, 0, -1]);
    P.body = limb(M, 'body', [0, 12, 0], [-4, 12, -2]);
    P.armL = limb(M, 'limb', [-5, 22, 0], [-6, 12, -1]);
    P.armR = limb(M, 'limb', [5, 22, 0], [4, 12, -1]);
    P.head = limb(M, 'head', [0, 24, 0], [-4, 24, -4]);
    P.armL.rotation.x = -Math.PI / 2; P.armR.rotation.x = -Math.PI / 2; P.armL.rotation.y = 0.3;
    return finishModel(M, 1.95, 0.6, 24);
  },

  // Shared biped body: head, body, arms and legs (armWidth 4, or 3 for slim)
  _humanoid(S, aw, matOpts) {
    const M = newMobModel(S, matOpts), P = M.parts;
    P.legL = limb(M, 'leg', [-2, 12, 0], [-4, 0, -2]);
    P.legR = limb(M, 'leg', [2, 12, 0], [0, 0, -2]);
    P.body = limb(M, 'body', [0, 12, 0], [-4, 12, -2]);
    P.armL = limb(M, 'arm', [-6, 22, 0], [-4 - aw, 12, -2]);
    P.armR = limb(M, 'arm', [6, 22, 0], [4, 12, -2]);
    P.head = limb(M, 'head', [0, 24, 0], [-S.boxes.get('head').w / 2, 24, -4]);
    return finishModel(M, 1.8, 0.6, 24);
  },

  piglin() {
    const S = mobSheet('m3_piglin', {
      P: [236, 166, 152], p: [214, 140, 128], Q: [246, 190, 176], q: [188, 114, 104], N: [244, 186, 174], n: [118, 58, 56],
      E: [250, 250, 250], K: [42, 26, 22], T: [244, 240, 222], G: [244, 202, 62], g: [204, 156, 30], L: [116, 82, 52], l: [92, 64, 40], m: [142, 106, 70],
    }, 83, (s) => {
      const skin = furMix('pPPPPQ', 3, 0.15), leather = furMix('lLLm', 1.8);
      s.box('head', 10, 8, 8, { all: skin, bottom: 'p', front: ['pPPPPPPPPp', 'PPPQPPQPPP', 'PPPPPPPPPP', 'PEKPPPPKEP', 'PPPPPPPPPP', 'PPPPPPPPPP', 'PPPPPPPPPP', 'qPPPPPPPPq'] });
      s.box('snout', 4, 4, 1, { all: 'N', front: ['NQQN', 'nNNn', 'NNNN', 'qNNq'] });
      s.box('tusk', 1, 2, 1, { all: 'T' });
      s.box('ear', 1, 5, 4, { all: skin });
      const strap = (x, y, w, h, F) => (Math.abs(x - y * (w / 8)) < 1 ? 'L' : skin(x, y, w, h, F));
      s.box('body', 8, 12, 4, { all: rowBands([[8, skin], [1, furMix('gGG')], [3, leather]]), front: rowBands([[8, strap], [1, furMix('gGG')], [3, leather]]), top: skin, bottom: leather });
      s.box('arm', 4, 12, 4, { sides: rowBands([[9, skin], [1, 'G'], [2, skin]]), top: skin, bottom: 'p' });
      s.box('leg', 4, 12, 4, { sides: rowBands([[10, leather], [2, 'K']]), top: leather, bottom: 'K' });
    });
    const M = BESTIARY._humanoid(S, 4), P = M.parts;
    boxIn(P.head, M, 'snout', [-2, 24, 4]);
    boxIn(P.head, M, 'tusk', [2, 24, 4]); boxIn(P.head, M, 'tusk', [-3, 24, 4]);
    for (const side of [-1, 1]) {
      const ear = pivotAt(P.head, [side * 5, 30, 0], [0, 24, 0]);
      ear.userData.px = [side * 5, 30, 0];
      boxIn(ear, M, 'ear', [side > 0 ? 5 : -6, 25, -2]);
      ear.rotation.z = side * 0.52;
    }
    return M;
  },

  villager(prof = 'farmer') {
    const base = { R: [112, 84, 58], r: [92, 68, 46], q: [132, 102, 72], A: [112, 84, 58], a: [92, 68, 46], T: [92, 68, 46] };
    const looks = {
      farmer: { R: [124, 92, 60], r: [102, 74, 48], q: [146, 112, 76] },
      librarian: { R: [226, 218, 196], r: [198, 188, 166], q: [240, 234, 218], T: [160, 40, 40], A: [226, 218, 196], a: [198, 188, 166] },
      cleric: { R: [122, 56, 150], r: [98, 42, 122], q: [146, 76, 176], T: [214, 176, 64], A: [122, 56, 150], a: [98, 42, 122] },
      butcher: { A: [236, 236, 236], a: [208, 208, 208] },
      toolsmith: { A: [52, 52, 56], a: [38, 38, 42] },
      armorer: { A: [44, 44, 48], a: [32, 32, 36] },
    };
    const S = mobSheet('m3_villager_' + prof, Object.assign({
      S: [189, 139, 114], s: [168, 118, 94], t: [204, 158, 134], N: [176, 124, 100], n: [148, 100, 80], E: [250, 250, 250], V: [52, 140, 64], U: [78, 52, 40], K: [30, 26, 24],
      L: [74, 58, 44], l: [58, 44, 34], O: [50, 40, 32], X: [176, 30, 30], Y: [214, 184, 96], y: [186, 152, 72], k: [150, 60, 40],
    }, base, looks[prof] || {}), 97, (s) => {
      const skin = furMix('sSSSt', 2), robe = furMix('rRRRq', 2.2);
      let face = ['SSSSSSSS', 'SSSSSSSS', 'StSSSStS', 'SSSSSSSS', 'SUUUUUUS', 'SEVSSVES', 'SSSSSSSS', 'SSSSSSSS', 'SSSssSSS', 'sSSSSSSs'];
      if (prof === 'armorer') face = ['SSSSSSSS', 'SSSSSSSS', 'StSSSStS', 'KKKKKKKK', 'SUUUUKKS', 'SEVSSKKS', 'SSSSSKKS', 'SSSSSSSS', 'SSSssSSS', 'sSSSSSSs'];
      s.box('head', 8, 10, 8, { all: skin, bottom: 's', front: face,
        back: prof === 'armorer' ? overMap(skin, ['????????', '????????', '????????', 'KKKKKKKK']) : skin,
        lr: prof === 'armorer' ? overMap(skin, ['????????', '????????', '????????', 'KKKKKKKK']) : skin });
      s.box('nose', 2, 4, 2, { all: 'N', front: ['NN', 'NN', 'NN', 'nn'], bottom: 'n' });
      s.box('body', 8, 12, 6, { all: robe });
      const apron = prof === 'butcher' || prof === 'toolsmith' || prof === 'armorer';
      const trim = prof === 'librarian' || prof === 'cleric';
      const front = (x, y, w, h, F) => {
        if (y === 0 && x >= 2 && x <= 5) return 'S';
        if (y === 1 && x >= 3 && x <= 4) return 'S';
        if (apron && y >= 2 && y <= 15 && x >= 1 && x <= 6) {
          if (prof === 'butcher' && pxHash(x, y, 5) < 0.12) return 'X';
          return x === 1 || x === 6 || y === 15 ? 'a' : 'A';
        }
        if (trim && x >= 3 && x <= 4 && y >= 2) return 'T';
        if (y === h - 1) return 'r';
        return robe(x, y, w, h, F);
      };
      s.box('robe', 8, 18, 6, { all: rowBands([[17, robe], [1, 'r']]), front, top: robe, bottom: 'r' });
      s.box('armSide', 4, 8, 4, { all: rowBands([[6, robe], [2, skin]]), bottom: 'S' });
      s.box('hands', 8, 4, 4, { all: skin, front: ['SsSSSSsS', 'SSSsSSSS', 'SsSSSsSS', 'sSSSSSSs'] });
      s.box('leg', 4, 12, 4, { sides: rowBands([[11, furMix('lLL')], [1, 'O']]), top: 'L', bottom: 'O' });
      if (prof === 'farmer') {
        s.box('hatTop', 8, 4, 8, { all: rowBands([[3, furMix('yYYY', 1.5)], [1, 'k']]), top: furMix('yYY', 1.5) });
        s.box('brim', 16, 1, 16, { all: 'y', top: furMix('yYYY', 1.5) });
      }
      if (prof === 'butcher') s.box('band', 8, 1, 8, { all: 'X' });
    });
    const M = newMobModel(S), P = M.parts;
    P.legL = limb(M, 'leg', [-2, 12, 0], [-4, 0, -2]);
    P.legR = limb(M, 'leg', [2, 12, 0], [0, 0, -2]);
    P.body = limb(M, 'body', [0, 12, 0], [-4, 12, -3]);
    boxIn(P.body, M, 'robe', [-4, 6, -3], 1);
    P.arms = pivotAt(M.inner, [0, 21, 1]);
    boxIn(P.arms, M, 'armSide', [-8, 15, -1]); boxIn(P.arms, M, 'armSide', [4, 15, -1]);
    boxIn(P.arms, M, 'hands', [-4, 15, -1]);
    P.arms.rotation.x = -0.75;
    P.head = limb(M, 'head', [0, 24, 0], [-4, 24, -4]);
    boxIn(P.head, M, 'nose', [-1, 23, 4]);
    if (prof === 'farmer') { boxIn(P.head, M, 'hatTop', [-4, 32, -4], 1.4); boxIn(P.head, M, 'brim', [-8, 32.4, -8]); }
    if (prof === 'butcher') boxIn(P.head, M, 'band', [-4, 30, -4], 1.2);
    return finishModel(M, 1.95, 0.6, 24);
  },

  spider() {
    const fur = (x, y, w, h, F) => {
      const t = pxNoise(F.gx + x, F.gy + y, F.seed, 1.4) * 0.5 + pxHash(F.gx + x, F.gy + y, F.seed + 2) * 0.5;
      return t < 0.22 ? 'd' : t < 0.58 ? 's' : t < 0.88 ? 'S' : 'h';
    };
    const eyes = ['........', '........', 'r......r', '.RP..PR.', '.RR..RR.', '...rr...', '........', '........'];
    const S = mobSheet('m3_spider', {
      S: [58, 50, 46], s: [44, 38, 35], d: [30, 26, 24], h: [84, 74, 68], H: [112, 98, 88], R: [222, 22, 22], r: [160, 14, 14], P: [255, 128, 128],
    }, 101, (s) => {
      s.box('head', 8, 8, 8, { all: fur, front: overMap(fur, ['????????', '????????', 'r??????r', '?RP??PR?', '?RR??RR?', '???rr???', '?s?dd?s?', 'sd????ds']) });
      s.box('eyes', 8, 8, 8, { all: '.', front: eyes });
      s.box('neck', 6, 6, 6, { all: fur });
      s.box('abdomen', 10, 8, 12, { all: fur, top: overMap(fur, ['??????????', '????HH????', '???H??H???', '??????????', '???HHHH???', '??H????H??', '??????????', '????HH????', '???H??H???', '??????????', '??????????', '??????????']) });
      s.box('leg', 16, 2, 2, { all: (x, y, w, h, F) => (w === 16 && (x === 5 || x === 10) ? 'd' : fur(x, y, w, h, F)) });
    });
    const M = newMobModel(S), P = M.parts;
    P.body = limb(M, 'abdomen', [0, 9, -3], [-5, 5, -15]);
    limb(M, 'neck', [0, 9, 0], [-3, 6, -3]);
    P.head = limb(M, 'head', [0, 9, 3], [-4, 5, 3]);
    glowLayer(M, P.head, 'eyes', [-4, 5, 3]);
    P.spiderLegs = [];
    // back to front; side -1 = the spider's right (-x)
    const splay = [-0.78, -0.39, 0.39, 0.78], droop = [0.64, 0.56, 0.56, 0.64];
    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? -1 : 1, k = i % 4, z = -2 + k;
      const leg = pivotAt(M.inner, [side * 4, 9, z]);
      boxIn(leg, M, 'leg', [side > 0 ? 3 : -19, 8, z - 1]);
      leg.userData.droop = -side * droop[k];
      leg.userData.splay = -side * splay[k];
      leg.userData.side = side;
      leg.rotation.set(0, leg.userData.splay, leg.userData.droop);
      P.spiderLegs.push(leg);
    }
    return finishModel(M, 0.9, 1.4, 9);
  },

  enderman() {
    const S = mobSheet('m3_enderman', {
      B: [20, 20, 22], b: [28, 27, 32], c: [38, 36, 44], M: [244, 204, 255], P: [214, 92, 250], p: [160, 40, 210],
    }, 107, (s) => {
      const dark = furMix('BBBbc', 2);
      s.box('head', 8, 8, 8, { all: dark, front: overMap(dark, ['????????', '????????', '????????', '????????', 'pPM??MPp']) });
      s.box('eyes', 8, 8, 8, { all: '.', front: ['........', '........', '........', '........', 'pPM..MPp'] });
      s.box('body', 8, 12, 4, { all: dark });
      s.box('limb', 2, 30, 2, { all: dark });
    });
    const M = newMobModel(S), P = M.parts;
    P.legL = limb(M, 'limb', [-2, 30, 0], [-3, 0, -1]);
    P.legR = limb(M, 'limb', [2, 30, 0], [1, 0, -1]);
    P.body = limb(M, 'body', [0, 30, 0], [-4, 30, -2]);
    P.armL = limb(M, 'limb', [-5, 40, 0], [-6, 10, -1]);
    P.armR = limb(M, 'limb', [5, 40, 0], [4, 10, -1]);
    P.head = limb(M, 'head', [0, 42, 0], [-4, 42, -4]);
    glowLayer(M, P.head, 'eyes', [-4, 42, -4]);
    return finishModel(M, 2.9, 0.6, 42);
  },

  golem() {
    const S = mobSheet('m3_golem', {
      I: [216, 208, 197], i: [190, 182, 171], j: [166, 158, 148], J: [234, 228, 220], K: [124, 116, 108], V: [58, 96, 32], v: [86, 130, 44], R: [176, 32, 24], N: [198, 184, 172], n: [170, 156, 146],
    }, 113, (s) => {
      const plate = furMix('iIIIIJ', 3, 0.2);
      const iron = (x, y, w, h, F) => {
        const c = pxNoise(F.gx + x, F.gy + y, F.seed + 7, 2.2);
        if (c > 0.47 && c < 0.5 && pxHash(F.gx + x, F.gy + y, F.seed + 8) < 0.5) return 'j';
        return plate(x, y, w, h, F);
      };
      const vines = (len) => (x, y, w, h, F) => {
        const col = pxHash(F.gx + x, 0, F.seed + 3), end = 2 + pxHash(F.gx + x, 1, F.seed + 4) * h * len;
        if (col < 0.24 && y < end) return pxHash(F.gx + x, F.gy + y, F.seed + 5) < 0.3 ? 'v' : 'V';
        return iron(x, y, w, h, F);
      };
      s.box('head', 8, 10, 8, { all: iron, front: overMap(iron, ['????????', '????????', '????????', '????????', '?KKKKKK?', '?R????R?', '????????', '????????', '????????', '????????']) });
      s.box('nose', 2, 4, 2, { all: 'N', bottom: 'n', front: ['NN', 'NN', 'Nn', 'nn'] });
      s.box('chest', 18, 12, 11, { all: vines(0.7), top: iron, bottom: 'j' });
      s.box('waist', 9, 5, 6, { all: vines(1), bottom: 'j' });
      s.box('arm', 4, 30, 6, { sides: rowBands([[26, vines(0.35)], [4, furMix('jji')]]), top: iron, bottom: 'j' });
      s.box('leg', 6, 16, 5, { sides: rowBands([[15, iron], [1, 'j']]), top: iron, bottom: 'j' });
    });
    const M = newMobModel(S), P = M.parts;
    P.legL = limb(M, 'leg', [-4, 16, 0], [-7, 0, -2.5]);
    P.legR = limb(M, 'leg', [4, 16, 0], [1, 0, -2.5]);
    P.body = limb(M, 'chest', [0, 21, 0], [-9, 21, -5]);
    boxIn(P.body, M, 'waist', [-4.5, 16, -3]);
    P.armL = limb(M, 'arm', [-11, 33, 0.5], [-13, 3.5, -2.5]);
    P.armR = limb(M, 'arm', [11, 33, 0.5], [9, 3.5, -2.5]);
    P.head = limb(M, 'head', [0, 33, 2], [-4, 33, -0.5]);
    boxIn(P.head, M, 'nose', [-1, 32, 7.5]);
    return finishModel(M, 2.7, 1.4, 33);
  },

  slime() {
    const S = mobSheet('m3_slime', {
      O: [118, 200, 96, 0.62], o: [100, 184, 80, 0.62], e: [156, 226, 132, 0.8], G: [92, 172, 70], g: [74, 148, 56], K: [24, 50, 22],
    }, 127, (s) => {
      s.box('outer', 8, 8, 8, { all: (x, y, w, h, F) => (x === 0 || y === 0 || x === w - 1 || y === h - 1 ? 'e' : furMix('oO', 2)(x, y, w, h, F)) });
      s.box('core', 6, 6, 6, { all: furMix('gGG', 2) });
      s.box('eye', 2, 2, 2, { all: 'K' });
      s.box('mouth', 1, 1, 1, { all: 'K' });
    });
    const M = newMobModel(S), P = M.parts;
    const outerMat = new THREE.MeshBasicMaterial({ map: S.tex, transparent: true, depthWrite: false });
    P.body = pivotAt(M.inner, [0, 0, 0]);
    boxIn(P.body, M, 'core', [-3, 1, -3]);
    boxIn(P.body, M, 'eye', [-3.3, 4, 1.5]); boxIn(P.body, M, 'eye', [1.3, 4, 1.5]);
    boxIn(P.body, M, 'mouth', [0, 2, 2.5]);
    boxIn(P.body, M, 'outer', [-4, 0, -4], 0, outerMat).renderOrder = 2;
    M.tintMats = [outerMat];
    P.head = null;
    return finishModel(M, 0.52, 0.52, 4);
  },

  blaze() {
    const S = mobSheet('m3_blaze', {
      Y: [252, 214, 52], y: [236, 172, 24], Z: [255, 242, 150], o: [214, 120, 16], K: [56, 24, 8], k: [110, 48, 10],
    }, 131, (s) => {
      const fire = furMix('oyYYZ', 1.6);
      s.box('head', 8, 8, 8, { all: fire, front: overMap(fire, ['????????', '????????', '????????', '?KK??KK?', '?kK??Kk?', '????????', '????????', '????????']) });
      s.box('rod', 2, 8, 2, { all: rowBands([[2, 'Z'], [3, 'Y'], [2, 'y'], [1, 'o']]), top: 'Z', bottom: 'o' });
    });
    const M = newMobModel(S), P = M.parts;
    P.head = limb(M, 'head', [0, 24, 0], [-4, 24, -4]);
    P.rods = [];
    for (let i = 0; i < 12; i++) { const rod = new THREE.Mesh(S.geo('rod'), M.mat); P.rods.push(rod); M.inner.add(rod); }
    return finishModel(M, 1.8, 0.6, 24);
  },

  ghast() {
    const S = mobSheet('m3_ghast', {
      W: [244, 244, 244], w: [228, 228, 228], g: [208, 208, 208], G: [178, 178, 178], K: [70, 70, 70], k: [110, 110, 110], R: [196, 70, 70],
    }, 137, (s) => {
      const skin = furMix('gwWWW', 2.5);
      s.box('body', 16, 16, 16, { all: skin, bottom: furMix('Ggw', 2), front: overMap(skin, [
        '????????????????', '????????????????', '????????????????', '????????????????',
        '????????????????', '???KKKK??KKKK???', '????gk????kg????', '????g??????g????',
        '????k??????k????', '???????????????', '?????KKKKKK?????', '????KkRRRRkK????',
        '????KKKKKKKK????', '????????????????', '????????????????', '????????????????'].map((r) => r.padEnd(16, '?'))) });
      s.box('tentacle', 2, 9, 2, { all: rowBands([[7, furMix('wWW')], [2, 'g']]) });
    });
    const M = newMobModel(S), P = M.parts;
    P.body = pivotAt(M.inner, [0, 32, 0]);
    boxIn(P.body, M, 'body', [-8, 24, -8]);
    P.body.scale.set(4, 4, 4);
    P.tentacles = [];
    for (let i = 0; i < 9; i++) {
      const tx = ((i % 3) - 1) * 20, tz = (Math.floor(i / 3) - 1) * 20;
      const t = pivotAt(M.inner, [tx, 2, tz]);
      boxIn(t, M, 'tentacle', [tx - 1, -7, tz - 1]);
      t.scale.set(4, 4 + (i % 3) * 0.6, 4);
      P.tentacles.push(t);
    }
    P.head = null;
    return finishModel(M, 4, 4, 24);
  },

  // Built at 4x scale: one texel is a quarter of a block
  dragon() {
    const S = mobSheet('m3_dragon', {
      D: [30, 26, 34], d: [21, 18, 25], e: [42, 36, 48], s: [64, 58, 72], g: [96, 90, 104], P: [226, 128, 255], p: [176, 64, 232], T: [214, 210, 202], K: [10, 8, 12],
    }, 151, (s) => {
      const scales = (x, y, w, h, F) => ((x + (y % 2) * 2) % 4 === 0 && pxHash(F.gx + x, F.gy + y, 3) < 0.6 ? 'd' : furMix('dDDDe', 1.6)(x, y, w, h, F));
      s.box('body', 12, 10, 32, { all: scales, top: overMap(scales, Array.from({ length: 32 }, () => '?????ss?????')), bottom: furMix('Dee', 2) });
      s.box('plate', 2, 3, 4, { all: furMix('sgs', 1.2) });
      s.box('neck', 5, 5, 5, { all: scales, top: overMap(scales, ['??s??', '??s??', '??s??', '??s??', '??s??']) });
      s.box('skull', 6, 4, 6, { all: scales, front: ['DDDDDD', 'DeDDeD', 'DDDDDD', 'dDDDDd'], left: overMap(scales, ['??????', 'Pp????']), right: overMap(scales, ['??????', '????pP']) });
      s.box('eyes', 6, 4, 6, { all: '.', left: ['......', 'Pp....'], right: ['......', '....pP'] });
      s.box('snout', 6, 3, 8, { all: scales, front: ['DKDDKD', 'DDDDDD', 'TdTdTd'], lr: overMap(scales, ['????????', '????????', 'dTdTdTdT']) });
      s.box('jaw', 6, 2, 9, { all: furMix('dDe'), top: 'K', lr: overMap(furMix('dDe'), ['TdTdTdTdT', '?????????']) });
      s.box('horn', 1, 3, 2, { all: furMix('sg') });
      s.box('tail', 4, 4, 5, { all: scales, top: overMap(scales, ['?ss?', '?ss?', '?ss?', '?ss?', '?ss?']) });
      s.box('bone', 32, 2, 2, { all: furMix('sgD', 1.4) });
    });
    const M = newMobModel(S), P = M.parts;
    const box = (parent, key, x, y, z, scale = 4) => {
      const m = new THREE.Mesh(S.geo(key), M.mat);
      m.scale.setScalar(scale); m.position.set(x, y, z); parent.add(m); return m;
    };
    P.body = box(M.inner, 'body', 0, 2, 0);
    for (let i = 0; i < 4; i++) box(P.body, 'plate', 0, (5 + 1.5) * MODEL_SCALE, (10 - i * 7) * MODEL_SCALE, 1);
    P.neck = [];
    for (let i = 0; i < 5; i++) P.neck.push(box(M.inner, 'neck', 0, 0, 0));
    P.head = new THREE.Group(); M.inner.add(P.head);
    box(P.head, 'skull', 0, 0, 0);
    const eyes = new THREE.Mesh(S.geo('eyes', 0.1), null); eyes.scale.setScalar(4); P.head.add(eyes);
    M.glowMat = new THREE.MeshBasicMaterial({ map: S.tex, alphaTest: 0.5 }); eyes.material = M.glowMat;
    box(P.head, 'snout', 0, -0.1, 1.6);
    box(P.head, 'jaw', 0, -0.62, 1.5);
    for (const sx of [-0.45, 0.45]) { const h = box(P.head, 'horn', sx, 0.7, -0.4); h.rotation.x = -0.5; }
    P.tail = [];
    for (let i = 0; i < 10; i++) { const t = box(M.inner, 'tail', 0, 0, 0); t.scale.setScalar(4 * (1 - i * 0.045)); P.tail.push(t); }
    const wingMat = new THREE.MeshBasicMaterial({ color: 0x2a2232, side: THREE.DoubleSide, transparent: true, opacity: 0.93 });
    P.wings = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(side * 1.5, 2.8, 1); M.inner.add(pivot);
      box(pivot, 'bone', side * 4, 0, 0);
      const mem = new THREE.Mesh(new THREE.PlaneGeometry(8, 6), wingMat); mem.rotation.x = -Math.PI / 2; mem.position.set(side * 4, 0, -3); pivot.add(mem);
      const tipPivot = new THREE.Group(); tipPivot.position.set(side * 8, 0, 0); pivot.add(tipPivot);
      const tipBone = box(tipPivot, 'bone', side * 4, 0, 0); tipBone.scale.set(4, 3, 3);
      const tip = new THREE.Mesh(new THREE.PlaneGeometry(8, 5), wingMat); tip.rotation.x = -Math.PI / 2; tip.position.set(side * 4, 0, -2.5); tipPivot.add(tip);
      P.wings.push({ pivot, tipPivot, side });
    }
    wingMat.userData.base = new THREE.Color(0x2a2232);
    M.tintMats = [wingMat];
    return finishModel(M, 4, 8, 40);
  },
};

// ---------------------------------------------------------------- hook into the game
// eslint-disable-next-line no-func-assign
buildModel = ((orig) => function (type) {
  let model;
  if (type.startsWith('villager')) model = BESTIARY.villager(type.slice(9) || 'farmer');
  else if (BESTIARY[type] && type[0] !== '_') model = BESTIARY[type]();
  else model = orig(type);
  return shadeModel(model);
})(buildModel);
// eslint-disable-next-line no-func-assign
buildHumanModel = ((orig) => (skin) => shadeModel(orig(skin)))(buildHumanModel);
// eslint-disable-next-line no-func-assign
setModelArmor = ((orig) => function (model, ids) {
  const before = model.armorKey;
  orig(model, ids);
  if (model.armorKey !== before) for (const m of model.armorMeshes || []) { shadeBoxGeometry(m.geometry); m.material.vertexColors = true; }
})(setModelArmor);

// Spider legs scuttle, chicken wings flap
// eslint-disable-next-line no-func-assign
animateModel = ((orig) => function (model, type, walkPhase, walkAmount, headYaw, headPitch, swing = 0) {
  const legs = model.parts.spiderLegs;
  if (legs) {
    const p = model.parts;
    model.parts.spiderLegs = null;
    orig(model, type, walkPhase, walkAmount, headYaw, headPitch, swing);
    model.parts.spiderLegs = legs;
    legs.forEach((l, i) => {
      const k = i % 4, ph = walkPhase * 2 + (k % 2 ? Math.PI : 0) + (l.userData.side > 0 ? Math.PI / 2 : 0);
      l.rotation.y = l.userData.splay + Math.cos(ph) * 0.4 * walkAmount * l.userData.side;
      l.rotation.z = l.userData.droop + Math.max(0, Math.sin(ph)) * 0.4 * walkAmount * l.userData.side;
    });
    if (p.head) { p.head.rotation.y = headYaw; p.head.rotation.x = -headPitch; }
    return;
  }
  orig(model, type, walkPhase, walkAmount, headYaw, headPitch, swing);
  if (model.parts.wingL && type === 'chicken') {
    const flap = walkAmount > 0.05 ? Math.abs(Math.sin(walkPhase * 1.6)) * walkAmount * 0.9 : 0;
    model.parts.wingL.rotation.z = -flap; model.parts.wingR.rotation.z = flap;
  }
})(animateModel);

// Skeletons hold the bow upright, like Minecraft's
MOB_INIT.skeleton = function () {
  const arm = this.model.parts.armR, bow = arm && arm.children.find((c) => c.isMesh && c.material === this.game.entityMat);
  if (bow) { bow.rotation.set(0, Math.PI / 2, -Math.PI / 4); bow.position.set(0, -0.62, 0.05); }
};

// Mobs look at a nearby player; extra materials follow the hurt tint; sheared sheep lose their wool
{
  const COLLAR_RED = new THREE.Color(0.78, 0.12, 0.12);
  const LOOKERS = { pig: 1, cow: 1, sheep: 1, chicken: 1, wolf: 1, zombie: 1, skeleton: 1, piglin: 1, villager: 1, creeper: 1, golem: 1, enderman: 1, spider: 1, blaze: 1 };
  const render = Mob.prototype.render;
  Mob.prototype.render = function () {
    render.call(this);
    const m = this.model, head = m.parts && m.parts.head;
    if (m.tintMats) for (const t of m.tintMats) { t.color.copy(m.mat.color); if (t.userData.base) t.color.multiply(t.userData.base); }
    if (m.parts.collar) m.parts.collar.material.color.multiply(COLLAR_RED);
    if (!head || !LOOKERS[this.type] || this.dead) return;
    const g = this.game, p = g.player;
    let yaw = 0, pitch = 0;
    if (p && !p.dead && p.mode !== 'spectator') {
      const hy = this.pos.y + (m.headY || 24) * MODEL_SCALE + 0.2;
      const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, dy = p.pos.y + 1.6 - hy, dist = Math.hypot(dx, dz);
      if (dist < 8 && dist > 0.3) {
        let rel = Math.atan2(-dx, -dz) - this.yaw;
        while (rel > Math.PI) rel -= Math.PI * 2;
        while (rel < -Math.PI) rel += Math.PI * 2;
        if (Math.abs(rel) < 1.9) { yaw = Math.max(-1.1, Math.min(1.1, rel)); pitch = Math.max(-0.7, Math.min(0.7, Math.atan2(dy, dist))); }
      }
    }
    const k = 0.15;
    this.lookYaw = (this.lookYaw || 0) + (yaw - (this.lookYaw || 0)) * k;
    this.lookPitch = (this.lookPitch || 0) + (pitch - (this.lookPitch || 0)) * k;
    head.rotation.y = this.lookYaw;
    head.rotation.x = -this.lookPitch;
  };
  const dispose = Mob.prototype.dispose;
  Mob.prototype.dispose = function () {
    dispose.call(this);
    const m = this.model;
    if (m.glowMat) m.glowMat.dispose();
    for (const t of m.tintMats || []) t.dispose();
    const own = new Set([m.mat, m.glowMat, ...(m.tintMats || [])]);
    m.root.traverse((o) => { if (o.isMesh && own.has(o.material)) o.geometry.dispose(); });
  };
  MOB_RENDER.sheep = function () {
    const p = this.model.parts;
    if (p.wool) for (const w of p.wool) w.visible = !this.sheared;
    if (p.body) p.body.scale.set(1, 1, 1);
  };
}
