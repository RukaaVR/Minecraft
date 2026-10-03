// Player skins: hand-drawn pixel art in the 64x64 Minecraft layout, with a second
// "overlay" layer (hair tufts, hood) drawn as slightly larger boxes. Outfits swap the
// palette, so bots and teams get the same model with different colours.
'use strict';

// Palette keys used in the pixel maps below ('.' = transparent, overlay only)
const SKIN_PALETTE = {
  H: [75, 46, 25], h: [109, 69, 39], k: [54, 32, 15],             // hair
  S: [200, 148, 107], t: [217, 168, 130], s: [169, 122, 85],       // skin
  W: [244, 244, 244], E: [47, 111, 208], B: [58, 34, 16], M: [140, 74, 60],
  C: [30, 154, 150], L: [43, 184, 178], c: [21, 118, 114], J: [20, 108, 105], Z: [233, 233, 233], // shirt + hood
  P: [53, 63, 154], l: [69, 82, 181], p: [38, 47, 120],            // trousers
  G: [59, 39, 23], g: [209, 166, 64],                               // belt
  O: [107, 107, 107], q: [138, 138, 138], o: [68, 68, 68],         // shoes
  X: [42, 42, 42], x: [192, 192, 192],                              // watch
};
const mirrorRows = (rows) => rows.map((r) => [...r].reverse().join(''));
const fillRows = (ch, w, h) => Array.from({ length: h }, () => ch.repeat(w));

// Face order for a box: top, bottom, right, front, left, back (Minecraft unwrap)
const HEAD_SIDE = ['HHHHHHHH', 'HHHhHHHH', 'HHHHHHtS', 'HHHHHSSS', 'HHHHsSSS', 'HHHsSSSS', 'HHHHSSSS', 'kHHSSSSs'];
const ARM_FRONT = ['CCCC', 'CLCC', 'CCCC', 'CCCc', 'cccc', 'SSSS', 'SSSS', 'SSSs', 'SSSs', 'SSSs', 'tSSs', 'tSSs'];
const ARM_OUT = ['CCCc', 'CCCc', 'CCCc', 'CCCc', 'cccc', 'SSSs', 'SSSs', 'SSSs', 'SSss', 'SSss', 'SSss', 'sSss'];
const ARM_BACK = ['cCCC', 'cCCC', 'cCCC', 'cCCC', 'cccc', 'sSSS', 'sSSS', 'sSSS', 'sSSS', 'sSSS', 'sSSS', 'sSSS'];
const ARM_IN = ['cCCC', 'cCCC', 'cCCC', 'cCCC', 'cccc', 'sSSS', 'sSSS', 'sSSS', 'sSSS', 'sSSS', 'sSSs', 'sSSs'];
const watch = (rows, face) => rows.map((r, i) => (i === 9 ? (face ? 'XxxX' : 'XXXX') : r));
const LEG_FRONT = ['PPPP', 'PlPP', 'PPPP', 'PPPP', 'PPPP', 'PPPP', 'PpPP', 'PPPP', 'pPPp', 'OOOO', 'OqOO', 'oooo'];
const LEG_OUT = ['PPPp', 'PPPp', 'PPPp', 'PPPp', 'PPPp', 'PPpp', 'PPPp', 'PPPp', 'pPPp', 'OOOO', 'OOOo', 'oooo'];
const LEG_BACK = ['pPPP', 'pPPP', 'pPPP', 'pPPP', 'pPPP', 'pPPP', 'pPPP', 'pPPP', 'ppPP', 'OOOO', 'oOOO', 'oooo'];

const SKIN_PARTS = [
  { name: 'head', u: 0, v: 0, w: 8, h: 8, d: 8, faces: [
    ['HHHHHHHH', 'HhHHhHHH', 'HHHHHHhH', 'HHhHHHHH', 'HHHHHhHH', 'HhHHHHHH', 'HHHHhHHH', 'HHHHHHHH'],
    fillRows('s', 8, 8),
    HEAD_SIDE,
    ['HHHHHHHH', 'HHhHHHhH', 'HtSSSStH', 'SBBSSBBS', 'SWESSEWS', 'SSSssSSS', 'SSsMMsSS', 'sSSSSSSs'],
    mirrorRows(HEAD_SIDE),
    ['HHHHHHHH', 'HhHHHhHH', 'HHHHHHHH', 'HHhHHHHH', 'HHHHHhHH', 'HHHHHHHH', 'kHHHHHHk', 'kkHHHHkk'],
  ] },
  { name: 'hat', u: 32, v: 0, w: 8, h: 8, d: 8, overlay: true, faces: [
    ['HhHHHHhH', 'HHHhHHHH', 'hHHHHHhH', 'HHHHhHHH', 'HHhHHHHH', 'HHHHHHhH', 'hHHHHHHH', 'HHHhHHHH'],
    fillRows('.', 8, 8),
    ['HHHHHHHH', 'HHHHHHhH', 'HHHH....', 'HHH.....', 'HH......', 'H.......', '........', '........'],
    ['HHhHHHHh', 'kH.HHh.H', 'k......k', '........', '........', '........', '........', '........'],
    ['HHHHHHHH', 'HhHHHHHH', '....HHHH', '.....HHH', '......HH', '.......H', '........', '........'],
    ['HHHHHHHH', 'HhHHHHhH', 'HHHHhHHH', 'HHHHHHHH', 'kHHhHHHk', 'kHHHHHHk', '.kHHHHk.', '..k..k..'],
  ] },
  { name: 'body', u: 16, v: 16, w: 8, h: 12, d: 4, faces: [
    ['CCCCCCCC', 'CCCssCCC', 'CCCssCCC', 'CCCCCCCC'],
    fillRows('P', 8, 4),
    ['cCCc', 'cCCc', 'cCCc', 'cCCc', 'cCCc', 'cCCc', 'cCCc', 'cCCc', 'cCCc', 'cCCc', 'GGGG', 'PPPP'],
    ['cCCttCCc', 'CCCssCCC', 'CZCCCCZC', 'CZCCCCZC', 'CCCCCCCC', 'CLCCCCCC', 'CCCCCCLC', 'CCccccCC', 'CcCCCCcC', 'cCCCCCCc', 'GGGggGGG', 'PPPPPPPP'],
    ['cCCc', 'cCCc', 'cCCc', 'cCCc', 'cCCc', 'cCCc', 'cCCc', 'cCCc', 'cCCc', 'cCCc', 'GGGG', 'PPPP'],
    ['cCCCCCCc', 'CCCCCCCC', 'CCCCCCCC', 'CCCLCCCC', 'CCCCCCCC', 'CCCCCCCC', 'CCCCCLCC', 'CCCCCCCC', 'CCCCCCCC', 'cCCCCCCc', 'GGGGGGGG', 'pPPPPPPp'],
  ] },
  { name: 'jacket', u: 16, v: 32, w: 8, h: 12, d: 4, overlay: true, faces: [
    ['JJJJJJJJ', 'J......J', 'J......J', 'JJJJJJJJ'],
    fillRows('.', 8, 4),
    ['JJJJ', ...fillRows('.', 4, 11)],
    ['JJ....JJ', ...fillRows('.', 8, 11)],
    ['JJJJ', ...fillRows('.', 4, 11)],
    ['JJJJJJJJ', '.JJJJJJ.', '..JJJJ..', ...fillRows('.', 8, 9)],
  ] },
  { name: 'armR', u: 40, v: 16, w: 4, h: 12, d: 4, faces: [fillRows('C', 4, 4), fillRows('t', 4, 4), ARM_OUT, ARM_FRONT, ARM_IN, ARM_BACK] },
  { name: 'armL', u: 32, v: 48, w: 4, h: 12, d: 4, faces: [fillRows('C', 4, 4), fillRows('t', 4, 4), watch(ARM_IN), watch(mirrorRows(ARM_FRONT)), watch(mirrorRows(ARM_OUT), true), watch(mirrorRows(ARM_BACK))] },
  { name: 'legR', u: 0, v: 16, w: 4, h: 12, d: 4, faces: [fillRows('P', 4, 4), fillRows('o', 4, 4), LEG_OUT, LEG_FRONT, LEG_OUT.map((r) => r.replace(/p/g, 'P')), LEG_BACK] },
  { name: 'legL', u: 16, v: 48, w: 4, h: 12, d: 4, faces: [fillRows('P', 4, 4), fillRows('o', 4, 4), LEG_OUT.map((r) => r.replace(/p/g, 'P')), mirrorRows(LEG_FRONT), mirrorRows(LEG_OUT), mirrorRows(LEG_BACK)] },
];

// Outfits: palette swaps over the base drawing (hair, skin, shirt, trousers, shoes)
const SKIN_TONES = [
  { S: [200, 148, 107], t: [217, 168, 130], s: [169, 122, 85] },
  { S: [236, 196, 164], t: [245, 212, 186], s: [214, 168, 134] },
  { S: [156, 106, 74], t: [176, 126, 92], s: [128, 84, 56] },
  { S: [108, 70, 46], t: [128, 86, 58], s: [86, 54, 34] },
  { S: [222, 172, 132], t: [236, 192, 156], s: [196, 146, 108] },
];
const HAIR_COLORS = [
  { H: [75, 46, 25], h: [109, 69, 39], k: [54, 32, 15] }, { H: [28, 24, 22], h: [52, 46, 42], k: [16, 14, 12] },
  { H: [214, 170, 82], h: [236, 200, 120], k: [176, 134, 56] }, { H: [156, 62, 28], h: [190, 92, 50], k: [118, 44, 18] },
  { H: [120, 120, 124], h: [160, 160, 164], k: [90, 90, 94] }, { H: [88, 50, 140], h: [120, 80, 176], k: [62, 34, 104] },
];
function shade(rgb, f) { return rgb.map((v) => Math.max(0, Math.min(255, Math.round(v * f)))); }
function outfitPalette(shirt, pants, extra = {}) {
  return Object.assign({
    C: shirt, L: shade(shirt, 1.18), c: shade(shirt, 0.76), J: shade(shirt, 0.66),
    P: pants, l: shade(pants, 1.2), p: shade(pants, 0.74),
  }, extra);
}
// A deterministic outfit for a bot or team member (variant 0 = the default player)
function outfitFor(variant, teamShirt) {
  if (!variant && !teamShirt) return {};
  const r = mulberry32(variant * 7919 + 17);
  const shirts = [[30, 154, 150], [178, 48, 48], [58, 94, 186], [70, 140, 60], [214, 160, 40], [130, 70, 160], [60, 60, 66], [220, 220, 220], [200, 96, 40], [36, 120, 160]];
  const pants = [[53, 63, 154], [48, 48, 52], [90, 66, 46], [70, 80, 90], [36, 70, 50], [120, 108, 80]];
  const shirt = teamShirt || shirts[Math.floor(r() * shirts.length)];
  return Object.assign(
    outfitPalette(shirt, pants[Math.floor(r() * pants.length)]),
    SKIN_TONES[Math.floor(r() * SKIN_TONES.length)],
    HAIR_COLORS[Math.floor(r() * HAIR_COLORS.length)],
  );
}

// Paint a 64x64 skin canvas from the pixel maps
function paintPlayerSkin(paletteOverrides = {}, seed = 1) {
  const pal = Object.assign({}, SKIN_PALETTE, paletteOverrides);
  const c = makeSkinCanvas(64, 64);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  for (const p of SKIN_PARTS) {
    const { u, v, w, h, d } = p;
    const regions = [[u + d, v, w, d], [u + d + w, v, w, d], [u, v + d, d, h], [u + d, v + d, w, h], [u + d + w, v + d, d, h], [u + d + w + d, v + d, w, h]];
    regions.forEach(([x0, y0, rw, rh], f) => {
      const rows = p.faces[f];
      for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
        const ch = rows && rows[y] ? rows[y][x] : '.';
        const col = pal[ch];
        if (!col) continue;
        const n = (rnd() - 0.5) * 10;
        ctx.fillStyle = `rgb(${col[0] + n | 0},${col[1] + n | 0},${col[2] + n | 0})`;
        ctx.fillRect(x0 + x, y0 + y, 1, 1);
      }
    });
  }
  return c;
}

function playerSkinTexture(key, overrides, seed) {
  if (SKINS[key]) return SKINS[key];
  const c = paintPlayerSkin(overrides, seed);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  SKINS[key] = { tex, w: 64, h: 64 };
  return SKINS[key];
}

// The humanoid model: base boxes plus the overlay layer half a pixel bigger
function buildHumanModel(skin) {
  const root = new THREE.Group(), inner = new THREE.Group();
  root.add(inner);
  const mat = new THREE.MeshBasicMaterial({ map: skin.tex, transparent: false, alphaTest: 0.5 });
  const W = 64, H = 64, parts = {};
  const add = (name, pivot, offset, w, h, d, u, v, ou, ov) => {
    const g = part(inner, mat, skinBox(w, h, d, u, v, W, H), pivot, offset);
    if (ou !== undefined) {
      const o = new THREE.Mesh(skinBox(w, h, d, ou, ov, W, H, name === 'head' ? 1 : 0.5), mat);
      o.position.set(offset[0] * MODEL_SCALE, offset[1] * MODEL_SCALE, offset[2] * MODEL_SCALE);
      g.add(o);
    }
    parts[name] = g;
  };
  add('legL', [-2, 12, 0], [0, -6, 0], 4, 12, 4, 16, 48);
  add('legR', [2, 12, 0], [0, -6, 0], 4, 12, 4, 0, 16);
  add('body', [0, 12, 0], [0, 6, 0], 8, 12, 4, 16, 16, 16, 32);
  add('armL', [-6, 22, 0], [0, -4, 0], 4, 12, 4, 32, 48);
  add('armR', [6, 22, 0], [0, -4, 0], 4, 12, 4, 40, 16);
  add('head', [0, 24, 0], [0, 4, 0], 8, 8, 8, 0, 0, 32, 0);
  return { root, inner, parts, mat, height: 1.8, width: 0.6, headY: 24 };
}

// ---------------------------------------------------------------- armour on the model
const ARMOR_TEX = {};
function armorTexture(mat) {
  if (ARMOR_TEX[mat]) return ARMOR_TEX[mat];
  const base = ARMOR_MATERIALS[mat].color;
  const c = makeSkinCanvas(16, 16);
  const ctx = c.getContext('2d');
  const r = mulberry32(mat * 31 + 5);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const edge = x === 0 || y === 0 || x === 15 || y === 15;
    const f = (edge ? 0.72 : 1) * (1 + (y < 8 ? 0.08 : -0.04)) * (0.94 + r() * 0.12);
    const col = shade(base, f);
    ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
    ctx.fillRect(x, y, 1, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  ARMOR_TEX[mat] = tex;
  return tex;
}
// ids: [helmet, chestplate, leggings, boots] item ids (or 0)
function setModelArmor(model, ids) {
  const key = (ids || []).join(',');
  if (model.armorKey === key) return;
  model.armorKey = key;
  for (const m of model.armorMeshes || []) { m.parent.remove(m); m.geometry.dispose(); m.material.dispose(); }
  model.armorMeshes = [];
  const P = model.parts;
  const box = (parent, w, h, d, off, mat, lightness = 1) => {
    const g = new THREE.BoxGeometry(w * MODEL_SCALE, h * MODEL_SCALE, d * MODEL_SCALE);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: armorTexture(mat), color: new THREE.Color(lightness, lightness, lightness) }));
    m.position.set(off[0] * MODEL_SCALE, off[1] * MODEL_SCALE, off[2] * MODEL_SCALE);
    m.userData.armor = true;
    parent.add(m);
    model.armorMeshes.push(m);
  };
  (ids || []).forEach((id, slot) => {
    if (!id || !ITEMS[id] || !ITEMS[id].armor) return;
    const mat = Math.floor((id - 340) / 4);
    if (slot === 0) box(P.head, 9.4, 4.6, 9.4, [0, 6, 0], mat);
    if (slot === 1) { box(P.body, 9.2, 8.6, 5.2, [0, 7.6, 0], mat); box(P.armL, 5, 5, 5, [0, -1.2, 0], mat, 0.95); box(P.armR, 5, 5, 5, [0, -1.2, 0], mat, 0.95); }
    if (slot === 2) { box(P.body, 8.8, 3, 4.8, [0, 1.4, 0], mat, 0.9); box(P.legL, 4.7, 7, 4.7, [0, -3.6, 0], mat, 0.9); box(P.legR, 4.7, 7, 4.7, [0, -3.6, 0], mat, 0.9); }
    if (slot === 3) { box(P.legL, 4.9, 3.6, 4.9, [0, -10.3, 0], mat, 0.85); box(P.legR, 4.9, 3.6, 4.9, [0, -10.3, 0], mat, 0.85); }
  });
}

// Light the armour pieces like the body they're on
function lightModelArmor(model, r, g, b) {
  for (const m of model.armorMeshes || []) m.material.color.setRGB(r, g, b);
}
// What the model holds in its right hand (third person)
function setModelHeld(model, id, entityMat) {
  if (model.heldId === id) return;
  model.heldId = id;
  const arm = model.parts.armR;
  if (model.heldMesh) { arm.remove(model.heldMesh); model.heldMesh.geometry.dispose(); model.heldMesh = null; }
  if (!id || !ITEMS[id]) return;
  const cube = isCubeItem(id);
  const m = new THREE.Mesh(cube ? blockGeometry(id, 0.3) : itemGeometry(id, 0.5), entityMat);
  m.position.set(0, -0.6, cube ? 0.2 : 0.25);
  if (!cube) m.rotation.y = Math.PI / 2;
  arm.add(m);
  model.heldMesh = m;
}

// The player model and its skin come from here now
// eslint-disable-next-line no-func-assign
skinTexture = ((orig) => function (name) {
  if (name === 'player') return playerSkinTexture('player', {}, 1);
  return orig(name);
})(skinTexture);
// eslint-disable-next-line no-func-assign
buildModel = ((orig) => function (type) {
  if (type === 'player') return buildHumanModel(skinTexture('player'));
  return orig(type);
})(buildModel);
// eslint-disable-next-line no-func-assign
animateModel = ((orig) => function (model, type, walkPhase, walkAmount, headYaw, headPitch, swing = 0) {
  orig(model, type, walkPhase, walkAmount, headYaw, headPitch, swing);
  if (type !== 'player') return;
  // idle breathing sway on the arms, like Minecraft's
  const p = model.parts, t = performance.now() / 1000 + (model.phase || 0);
  const z = Math.cos(t * 1.8) * 0.05 + 0.05, x = Math.sin(t * 1.34) * 0.05;
  p.armR.rotation.z = z; p.armL.rotation.z = -z;
  p.armR.rotation.x += x; p.armL.rotation.x -= x;
})(animateModel);
