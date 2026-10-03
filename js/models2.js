// Models for wolves, endermen, iron golems, slimes, blazes, the Ender Dragon,
// end crystals and boats.
'use strict';

function makeSkin(name, w, h, paint) {
  if (SKINS[name]) return SKINS[name];
  const c = makeSkinCanvas(w, h);
  const ctx = c.getContext('2d');
  paint(ctx, mulberry32(name.length * 131 + name.charCodeAt(0) * 7));
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  SKINS[name] = { tex, w, h };
  return SKINS[name];
}

const EXTRA_MODELS = {
  wolf() {
    const skin = makeSkin('wolf', 64, 32, (ctx, r) => {
      paintBox(ctx, 0, 0, 6, 6, 4, [200, 200, 200], r, 16);   // head
      paintBox(ctx, 0, 10, 3, 3, 4, [180, 180, 180], r, 12);  // snout
      paintBox(ctx, 18, 0, 6, 6, 9, [190, 190, 190], r, 18);  // body
      paintBox(ctx, 0, 18, 2, 8, 2, [175, 175, 175], r, 14);  // leg
      paintBox(ctx, 10, 18, 2, 8, 2, [170, 170, 170], r, 14); // tail
      paintBox(ctx, 16, 18, 2, 2, 1, [160, 160, 160], r, 8);  // ear
      px(ctx, 4, 6, [20, 20, 20]); px(ctx, 7, 6, [20, 20, 20]);
      px(ctx, 4 + 3, 14, [30, 20, 20]);
    });
    const root = new THREE.Group(), inner = new THREE.Group();
    root.add(inner);
    const mat = new THREE.MeshBasicMaterial({ map: skin.tex });
    const W = 64, H = 32, parts = {};
    for (const [n, x, z] of [['legFL', -1.5, 3], ['legFR', 1.5, 3], ['legBL', -1.5, -4], ['legBR', 1.5, -4]]) parts[n] = part(inner, mat, skinBox(2, 8, 2, 0, 18, W, H), [x, 8, z], [0, -4, 0]);
    parts.body = part(inner, mat, skinBox(6, 6, 9, 18, 0, W, H), [0, 8, -0.5], [0, 3, 0]);
    parts.head = part(inner, mat, skinBox(6, 6, 4, 0, 0, W, H), [0, 12, 5], [0, 0, 2]);
    const snout = new THREE.Mesh(skinBox(3, 3, 4, 0, 10, W, H), mat); snout.position.set(0, -1 * MODEL_SCALE, 5 * MODEL_SCALE); parts.head.add(snout);
    for (const ex of [-2, 2]) { const ear = new THREE.Mesh(skinBox(2, 2, 1, 16, 18, W, H), mat); ear.position.set(ex * MODEL_SCALE, 4 * MODEL_SCALE, 1 * MODEL_SCALE); parts.head.add(ear); }
    parts.tail = part(inner, mat, skinBox(2, 8, 2, 10, 18, W, H), [0, 12, -5], [0, -4, 0]);
    parts.tail.rotation.x = 0.9;
    const collar = new THREE.Mesh(new THREE.BoxGeometry(7 * MODEL_SCALE, 1.5 * MODEL_SCALE, 2 * MODEL_SCALE), new THREE.MeshBasicMaterial({ color: 0xc02020 }));
    collar.position.set(0, -2.5 * MODEL_SCALE, -0.5 * MODEL_SCALE);
    collar.visible = false;
    parts.head.add(collar);
    parts.collar = collar;
    return { root, inner, parts, mat, height: 0.85, width: 0.6, headY: 12 };
  },

  enderman() {
    const skin = makeSkin('enderman', 64, 32, (ctx, r) => {
      paintBox(ctx, 0, 0, 8, 8, 8, [22, 20, 26], r, 8);
      paintBox(ctx, 32, 16, 8, 12, 4, [18, 16, 22], r, 8);
      paintBox(ctx, 56, 0, 2, 30, 2, [20, 18, 24], r, 6);
      px(ctx, 9, 12, [220, 120, 255], 2, 1); px(ctx, 13, 12, [220, 120, 255], 2, 1);
      px(ctx, 9, 12, [170, 60, 230]); px(ctx, 14, 12, [170, 60, 230]);
    });
    const root = new THREE.Group(), inner = new THREE.Group();
    root.add(inner);
    const mat = new THREE.MeshBasicMaterial({ map: skin.tex });
    const W = 64, H = 32, parts = {};
    parts.legL = part(inner, mat, skinBox(2, 30, 2, 56, 0, W, H), [-2, 30, 0], [0, -15, 0]);
    parts.legR = part(inner, mat, skinBox(2, 30, 2, 56, 0, W, H), [2, 30, 0], [0, -15, 0]);
    parts.body = part(inner, mat, skinBox(8, 12, 4, 32, 16, W, H), [0, 30, 0], [0, 6, 0]);
    parts.armL = part(inner, mat, skinBox(2, 30, 2, 56, 0, W, H), [-5, 40, 0], [0, -13, 0]);
    parts.armR = part(inner, mat, skinBox(2, 30, 2, 56, 0, W, H), [5, 40, 0], [0, -13, 0]);
    parts.head = part(inner, mat, skinBox(8, 8, 8, 0, 0, W, H), [0, 42, 0], [0, 4, 0]);
    return { root, inner, parts, mat, height: 2.9, width: 0.6, headY: 42 };
  },

  golem() {
    const skin = makeSkin('golem', 128, 128, (ctx, r) => {
      const iron = (x, y) => (r() < 0.06 ? [80, 120, 50] : [205, 195, 185]);
      paintBox(ctx, 0, 0, 8, 10, 8, [200, 190, 180], r, 14);
      paintBox(ctx, 0, 40, 18, 12, 11, iron, r, 18);
      paintBox(ctx, 60, 20, 4, 30, 6, iron, r, 16);
      paintBox(ctx, 60, 60, 6, 16, 5, [195, 185, 175], r, 16);
      paintBox(ctx, 24, 0, 2, 4, 2, [190, 175, 165], r, 8);
      px(ctx, 9, 13, [200, 30, 20]); px(ctx, 13, 13, [200, 30, 20]);
      px(ctx, 8, 11, [90, 80, 75], 8, 1);
    });
    const root = new THREE.Group(), inner = new THREE.Group();
    root.add(inner);
    const mat = new THREE.MeshBasicMaterial({ map: skin.tex });
    const W = 128, H = 128, parts = {};
    parts.legL = part(inner, mat, skinBox(6, 16, 5, 60, 60, W, H), [-4, 16, 0], [0, -8, 0]);
    parts.legR = part(inner, mat, skinBox(6, 16, 5, 60, 60, W, H), [4, 16, 0], [0, -8, 0]);
    parts.body = part(inner, mat, skinBox(18, 12, 11, 0, 40, W, H), [0, 16, 0], [0, 10, 0]);
    parts.armL = part(inner, mat, skinBox(4, 30, 6, 60, 20, W, H), [-11, 33, 0], [0, -13, 0]);
    parts.armR = part(inner, mat, skinBox(4, 30, 6, 60, 20, W, H), [11, 33, 0], [0, -13, 0]);
    parts.head = part(inner, mat, skinBox(8, 10, 8, 0, 0, W, H), [0, 34, -2], [0, 5, 2]);
    const nose = new THREE.Mesh(skinBox(2, 4, 2, 24, 0, W, H), mat); nose.position.set(0, 3 * MODEL_SCALE, 7 * MODEL_SCALE); parts.head.add(nose);
    return { root, inner, parts, mat, height: 2.7, width: 1.4, headY: 34 };
  },

  slime() {
    const skin = makeSkin('slime', 64, 32, (ctx, r) => {
      paintBox(ctx, 0, 0, 8, 8, 8, [110, 200, 90], r, 22);
      px(ctx, 9, 11, [30, 60, 30], 2, 2); px(ctx, 13, 11, [30, 60, 30], 2, 2); px(ctx, 12, 14, [30, 60, 30]);
    });
    const root = new THREE.Group(), inner = new THREE.Group();
    root.add(inner);
    const mat = new THREE.MeshBasicMaterial({ map: skin.tex, transparent: true, opacity: 0.85 });
    const parts = {};
    parts.body = part(inner, mat, skinBox(8, 8, 8, 0, 0, 64, 32), [0, 4, 0], [0, 0, 0]);
    parts.head = null;
    return { root, inner, parts, mat, height: 0.52, width: 0.52, headY: 4 };
  },

  blaze() {
    const skin = makeSkin('blaze', 64, 32, (ctx, r) => {
      paintBox(ctx, 0, 0, 8, 8, 8, [240, 190, 40], r, 30);
      paintBox(ctx, 32, 0, 2, 8, 2, [250, 210, 60], r, 30);
      px(ctx, 9, 11, [60, 20, 0], 2, 1); px(ctx, 13, 11, [60, 20, 0], 2, 1);
    });
    const root = new THREE.Group(), inner = new THREE.Group();
    root.add(inner);
    const mat = new THREE.MeshBasicMaterial({ map: skin.tex });
    const parts = {};
    parts.head = part(inner, mat, skinBox(8, 8, 8, 0, 0, 64, 32), [0, 24, 0], [0, 4, 0]);
    parts.rods = [];
    for (let i = 0; i < 12; i++) {
      const rod = new THREE.Mesh(skinBox(2, 8, 2, 32, 0, 64, 32), mat);
      parts.rods.push(rod);
      inner.add(rod);
    }
    return { root, inner, parts, mat, height: 1.8, width: 0.6, headY: 24 };
  },

  dragon() {
    const skin = makeSkin('dragon', 64, 64, (ctx, r) => {
      paintBox(ctx, 0, 0, 16, 16, 16, [26, 22, 30], r, 10);
      for (let i = 0; i < 40; i++) px(ctx, Math.floor(r() * 64), Math.floor(r() * 32), [45, 38, 52]);
      px(ctx, 19, 22, [220, 120, 255], 3, 1); px(ctx, 26, 22, [220, 120, 255], 3, 1);
    });
    const root = new THREE.Group(), inner = new THREE.Group();
    root.add(inner);
    const mat = new THREE.MeshBasicMaterial({ map: skin.tex });
    const dark = new THREE.MeshBasicMaterial({ color: 0x1a161e, side: THREE.DoubleSide });
    const wingMat = new THREE.MeshBasicMaterial({ color: 0x2a2232, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
    const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    const parts = {};
    const body = box(3, 2.4, 8, dark); body.position.set(0, 2, 0); inner.add(body); parts.body = body;
    parts.neck = [];
    for (let i = 0; i < 5; i++) { const n = box(1.2, 1.2, 1.2, dark); inner.add(n); parts.neck.push(n); }
    const head = new THREE.Group(); inner.add(head); parts.head = head;
    const skull = new THREE.Mesh(skinBox(16, 16, 16, 0, 0, 64, 64), mat); skull.scale.set(1.6, 1.0, 1.6); head.add(skull);
    const jaw = box(1.6, 0.4, 2.2, dark); jaw.position.set(0, -0.5, 1.8); head.add(jaw);
    const snout = box(1.5, 0.7, 2, dark); snout.position.set(0, 0.1, 1.9); head.add(snout);
    parts.tail = [];
    for (let i = 0; i < 10; i++) { const t = box(0.9, 0.9, 1.2, dark); inner.add(t); parts.tail.push(t); }
    parts.wings = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(side * 1.5, 2.8, 1); inner.add(pivot);
      const bone = box(8, 0.4, 0.4, dark); bone.position.set(side * 4, 0, 0); pivot.add(bone);
      const mem = new THREE.Mesh(new THREE.PlaneGeometry(8, 6), wingMat); mem.rotation.x = -Math.PI / 2; mem.position.set(side * 4, 0, -3); pivot.add(mem);
      const tipPivot = new THREE.Group(); tipPivot.position.set(side * 8, 0, 0); pivot.add(tipPivot);
      const tip = new THREE.Mesh(new THREE.PlaneGeometry(8, 5), wingMat); tip.rotation.x = -Math.PI / 2; tip.position.set(side * 4, 0, -2.5); tipPivot.add(tip);
      parts.wings.push({ pivot, tipPivot, side });
    }
    return { root, inner, parts, mat, extraMats: [dark, wingMat], height: 4, width: 8, headY: 40 };
  },

  crystal() {
    const root = new THREE.Group(), inner = new THREE.Group();
    root.add(inner);
    const mat = new THREE.MeshBasicMaterial({ color: 0xd9a0ff, transparent: true, opacity: 0.55, wireframe: false, side: THREE.DoubleSide, depthWrite: false });
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xff70d0 });
    const outer = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), mat);
    const middle = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), coreMat);
    for (const m of [outer, middle, core]) { m.position.y = 1.2; inner.add(m); }
    return { root, inner, parts: { outer, middle, core, head: null }, mat, extraMats: [coreMat], height: 2, width: 2, headY: 16 };
  },

  boat() {
    const root = new THREE.Group(), inner = new THREE.Group();
    root.add(inner);
    const skin = makeSkin('boat', 16, 16, (ctx, r) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const n = (r() - 0.5) * 20 - (y % 4 === 3 ? 25 : 0); ctx.fillStyle = `rgb(${160 + n | 0},${125 + n | 0},${75 + n | 0})`; ctx.fillRect(x, y, 1, 1); } });
    const mat = new THREE.MeshBasicMaterial({ map: skin.tex });
    const box = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); inner.add(m); return m; };
    box(1.3, 0.12, 2.2, 0, 0.12, 0);
    box(0.12, 0.4, 2.2, -0.65, 0.35, 0); box(0.12, 0.4, 2.2, 0.65, 0.35, 0);
    box(1.4, 0.4, 0.12, 0, 0.35, 1.1); box(1.4, 0.4, 0.12, 0, 0.35, -1.1);
    return { root, inner, parts: { head: null }, mat, height: 0.6, width: 1.4, headY: 4 };
  },
};

// Route the new types through buildModel
// eslint-disable-next-line no-func-assign
buildModel = ((orig) => function (type) {
  if (EXTRA_MODELS[type]) return EXTRA_MODELS[type]();
  return orig(type);
})(buildModel);
