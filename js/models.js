// Box models (players, mobs) with painted skins, plus item/block meshes.
'use strict';

const MODEL_SCALE = 1 / 16;

function makeSkinCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Paint a box's 6 faces in Minecraft's skin unwrap at (u, v).
function paintBox(ctx, u, v, w, h, d, color, rand, amt = 18) {
  const regions = [
    [u + d, v, w, d], [u + d + w, v, w, d],
    [u, v + d, d, h], [u + d, v + d, w, h], [u + d + w, v + d, d, h], [u + d + w + d, v + d, w, h],
  ];
  for (const [x0, y0, rw, rh] of regions) {
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      const c = typeof color === 'function' ? color(x, y, rw, rh) : color;
      const n = (rand() - 0.5) * amt;
      ctx.fillStyle = `rgb(${c[0] + n | 0},${c[1] + n | 0},${c[2] + n | 0})`;
      ctx.fillRect(x0 + x, y0 + y, 1, 1);
    }
  }
}
function px(ctx, x, y, c, w = 1, h = 1) {
  ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
  ctx.fillRect(x, y, w, h);
}

// Box geometry with Minecraft-style skin UVs. Pivot is applied by the caller.
function skinBox(w, h, d, u, v, texW, texH, inflate = 0) {
  const g = new THREE.BoxGeometry((w + inflate) * MODEL_SCALE, (h + inflate) * MODEL_SCALE, (d + inflate) * MODEL_SCALE);
  const rects = [
    [u + d + w, v + d, d, h], // +x
    [u, v + d, d, h],         // -x
    [u + d, v, w, d],         // +y
    [u + d + w, v, w, d],     // -y
    [u + d, v + d, w, h],     // +z (front)
    [u + d + w + d, v + d, w, h], // -z (back)
  ];
  const uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) {
    const [rx, ry, rw, rh] = rects[f];
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      const ux = uv.getX(k), uy = uv.getY(k);
      uv.setXY(k, (rx + ux * rw) / texW, 1 - (ry + (1 - uy) * rh) / texH);
    }
  }
  return g;
}

// A part = pivot group containing a mesh offset from the pivot.
function part(parent, mat, geo, pivot, offset) {
  const g = new THREE.Group();
  g.position.set(pivot[0] * MODEL_SCALE, pivot[1] * MODEL_SCALE, pivot[2] * MODEL_SCALE);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(offset[0] * MODEL_SCALE, offset[1] * MODEL_SCALE, offset[2] * MODEL_SCALE);
  g.add(m);
  parent.add(g);
  return g;
}

const SKINS = {};
function skinTexture(name) {
  if (SKINS[name]) return SKINS[name];
  const rand = mulberry32(name.length * 977 + name.charCodeAt(0));
  let c, ctx;
  const humanoid = (skin, shirt, pants, face) => {
    c = makeSkinCanvas(64, 32); ctx = c.getContext('2d');
    paintBox(ctx, 0, 0, 8, 8, 8, skin, rand, 14);       // head
    paintBox(ctx, 16, 16, 8, 12, 4, shirt, rand, 14);   // body
    paintBox(ctx, 40, 16, 4, 12, 4, (x, y) => (y < 4 ? shirt : skin), rand, 14); // arm
    paintBox(ctx, 0, 16, 4, 12, 4, pants, rand, 14);    // leg
    face(ctx);
  };
  if (name === 'player') {
    humanoid([196, 140, 110], [0, 170, 170], [60, 60, 160], (ctx) => {
      // hair on top/back/sides
      px(ctx, 8, 0, [70, 45, 25], 8, 8);
      px(ctx, 0, 8, [70, 45, 25], 8, 3); px(ctx, 16, 8, [70, 45, 25], 8, 3); px(ctx, 24, 8, [70, 45, 25], 8, 8);
      px(ctx, 8, 8, [70, 45, 25], 8, 2);
      px(ctx, 9, 12, [255, 255, 255], 2, 1); px(ctx, 13, 12, [255, 255, 255], 2, 1);
      px(ctx, 10, 12, [60, 50, 140]); px(ctx, 13, 12, [60, 50, 140]);
      px(ctx, 11, 14, [150, 90, 70], 2, 1); px(ctx, 10, 15, [110, 60, 50], 4, 1);
      px(ctx, 0, 28, [80, 70, 70], 16, 4); // shoes
    });
  } else if (name === 'zombie') {
    humanoid([90, 140, 80], [40, 150, 160], [60, 60, 150], (ctx) => {
      px(ctx, 9, 12, [20, 30, 20], 2, 2); px(ctx, 13, 12, [20, 30, 20], 2, 2);
      px(ctx, 10, 14, [50, 80, 40], 4, 1);
    });
  } else if (name === 'creeper') {
    c = makeSkinCanvas(64, 32); ctx = c.getContext('2d');
    const green = (x, y) => (rand() < 0.3 ? [60, 160, 50] : rand() < 0.5 ? [100, 200, 90] : [80, 180, 70]);
    paintBox(ctx, 0, 0, 8, 8, 8, green, rand, 20);
    paintBox(ctx, 16, 16, 8, 12, 4, green, rand, 20);
    paintBox(ctx, 0, 16, 4, 6, 4, green, rand, 20);
    px(ctx, 9, 10, [10, 10, 10], 2, 2); px(ctx, 13, 10, [10, 10, 10], 2, 2);
    px(ctx, 11, 12, [10, 10, 10], 2, 3); px(ctx, 10, 13, [10, 10, 10], 1, 3); px(ctx, 13, 13, [10, 10, 10], 1, 3);
  } else if (name === 'pig') {
    c = makeSkinCanvas(64, 64); ctx = c.getContext('2d');
    paintBox(ctx, 0, 0, 8, 8, 8, [240, 160, 160], rand, 12);
    paintBox(ctx, 0, 16, 10, 8, 16, [235, 155, 155], rand, 12);
    paintBox(ctx, 0, 44, 4, 6, 4, [225, 145, 145], rand, 12);
    paintBox(ctx, 32, 0, 4, 3, 1, [250, 180, 180], rand, 8);
    px(ctx, 33, 2, [150, 80, 80]); px(ctx, 35, 2, [150, 80, 80]);
    px(ctx, 9, 11, [255, 255, 255]); px(ctx, 10, 11, [20, 20, 20]); px(ctx, 13, 11, [20, 20, 20]); px(ctx, 14, 11, [255, 255, 255]);
  } else if (name === 'cow') {
    c = makeSkinCanvas(64, 64); ctx = c.getContext('2d');
    const patches = (x, y) => ((Math.sin(x * 0.9) + Math.cos(y * 0.7 + x * 0.3)) > 0.6 ? [235, 235, 235] : [70, 50, 35]);
    paintBox(ctx, 0, 0, 8, 8, 6, [70, 50, 35], rand, 12);
    paintBox(ctx, 0, 16, 12, 10, 18, patches, rand, 12);
    paintBox(ctx, 0, 48, 4, 12, 4, (x, y) => (y > 9 ? [40, 30, 20] : [70, 50, 35]), rand, 12);
    px(ctx, 7, 12, [230, 230, 230], 6, 2); // muzzle
    px(ctx, 7, 9, [10, 10, 10]); px(ctx, 12, 9, [10, 10, 10]);
    px(ctx, 8, 13, [40, 30, 30]); px(ctx, 11, 13, [40, 30, 30]);
  } else if (name === 'sheep') {
    c = makeSkinCanvas(64, 64); ctx = c.getContext('2d');
    paintBox(ctx, 0, 0, 6, 6, 8, [200, 190, 180], rand, 10);
    paintBox(ctx, 0, 16, 10, 10, 16, [235, 235, 235], rand, 22);
    paintBox(ctx, 0, 46, 4, 8, 4, (x, y) => (y < 4 ? [235, 235, 235] : [200, 190, 180]), rand, 12);
    px(ctx, 9, 10, [20, 20, 20]); px(ctx, 12, 10, [20, 20, 20]);
    px(ctx, 10, 12, [240, 170, 170], 2, 1);
  } else if (name === 'chicken') {
    c = makeSkinCanvas(64, 32); ctx = c.getContext('2d');
    paintBox(ctx, 0, 0, 4, 6, 3, [245, 245, 245], rand, 8);
    paintBox(ctx, 0, 9, 6, 6, 8, [245, 245, 245], rand, 10);
    paintBox(ctx, 28, 0, 4, 2, 2, [240, 180, 40], rand, 8);
    paintBox(ctx, 28, 4, 2, 2, 2, [220, 40, 40], rand, 8);
    paintBox(ctx, 40, 0, 1, 5, 1, [240, 180, 40], rand, 8);
    paintBox(ctx, 40, 10, 1, 4, 6, [230, 230, 230], rand, 10);
    px(ctx, 3, 4, [10, 10, 10]); px(ctx, 6, 4, [10, 10, 10]);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  SKINS[name] = { tex, w: c.width, h: c.height };
  return SKINS[name];
}

// Build a model. Returns {root, parts, materials, height, eye}
function buildModel(type) {
  const root = new THREE.Group();
  const inner = new THREE.Group(); // gets the yaw rotation
  root.add(inner);
  const skin = skinTexture(type === 'player' ? 'player' : type);
  const mat = new THREE.MeshBasicMaterial({ map: skin.tex, transparent: false });
  const W = skin.w, H = skin.h;
  const parts = {};
  if (type === 'player' || type === 'zombie') {
    parts.legL = part(inner, mat, skinBox(4, 12, 4, 0, 16, W, H), [-2, 12, 0], [0, -6, 0]);
    parts.legR = part(inner, mat, skinBox(4, 12, 4, 0, 16, W, H), [2, 12, 0], [0, -6, 0]);
    parts.body = part(inner, mat, skinBox(8, 12, 4, 16, 16, W, H), [0, 12, 0], [0, 6, 0]);
    parts.armL = part(inner, mat, skinBox(4, 12, 4, 40, 16, W, H), [-6, 22, 0], [0, -4, 0]);
    parts.armR = part(inner, mat, skinBox(4, 12, 4, 40, 16, W, H), [6, 22, 0], [0, -4, 0]);
    parts.head = part(inner, mat, skinBox(8, 8, 8, 0, 0, W, H), [0, 24, 0], [0, 4, 0]);
    if (type === 'zombie') { parts.armL.rotation.x = -Math.PI / 2; parts.armR.rotation.x = -Math.PI / 2; }
    return { root, inner, parts, mat, height: 1.8, width: 0.6, headY: 24 };
  }
  if (type === 'creeper') {
    for (const [n, x, z] of [['legFL', -2, 4], ['legFR', 2, 4], ['legBL', -2, -4], ['legBR', 2, -4]]) {
      parts[n] = part(inner, mat, skinBox(4, 6, 4, 0, 16, W, H), [x, 6, z], [0, -3, 0]);
    }
    parts.body = part(inner, mat, skinBox(8, 12, 4, 16, 16, W, H), [0, 6, 0], [0, 6, 0]);
    parts.head = part(inner, mat, skinBox(8, 8, 8, 0, 0, W, H), [0, 18, 0], [0, 4, 0]);
    return { root, inner, parts, mat, height: 1.7, width: 0.6, headY: 18 };
  }
  if (type === 'pig' || type === 'cow' || type === 'sheep') {
    const cfg = {
      pig: { body: [10, 8, 16, 0, 16], legs: [4, 6, 4, 0, 44], head: [8, 8, 8, 0, 0], bodyY: 6, headPos: [0, 12, 9], h: 0.9, w: 0.9 },
      cow: { body: [12, 10, 18, 0, 16], legs: [4, 12, 4, 0, 48], head: [8, 8, 6, 0, 0], bodyY: 12, headPos: [0, 20, 10], h: 1.4, w: 0.9 },
      sheep: { body: [10, 10, 16, 0, 16], legs: [4, 8, 4, 0, 46], head: [6, 6, 8, 0, 0], bodyY: 8, headPos: [0, 16, 9], h: 1.3, w: 0.9 },
    }[type];
    const [bw, bh, bd, bu, bv] = cfg.body;
    const [lw, lh, ld, lu, lv] = cfg.legs;
    const lx = bw / 2 - lw / 2, lz = bd / 2 - ld / 2;
    for (const [n, x, z] of [['legFL', -lx, lz], ['legFR', lx, lz], ['legBL', -lx, -lz], ['legBR', lx, -lz]]) {
      parts[n] = part(inner, mat, skinBox(lw, lh, ld, lu, lv, W, H), [x, lh, z], [0, -lh / 2, 0]);
    }
    parts.body = part(inner, mat, skinBox(bw, bh, bd, bu, bv, W, H), [0, cfg.bodyY, 0], [0, bh / 2, 0]);
    const [hw, hh, hd, hu, hv] = cfg.head;
    parts.head = part(inner, mat, skinBox(hw, hh, hd, hu, hv, W, H), cfg.headPos, [0, 0, hd / 2]);
    if (type === 'pig') {
      const snout = new THREE.Mesh(skinBox(4, 3, 1, 32, 0, W, H), mat);
      snout.position.set(0, -1 * MODEL_SCALE, (hd + 0.5) * MODEL_SCALE);
      parts.head.add(snout);
    }
    return { root, inner, parts, mat, height: cfg.h, width: cfg.w, headY: cfg.headPos[1] };
  }
  if (type === 'chicken') {
    parts.legL = part(inner, mat, skinBox(1, 5, 1, 40, 0, W, H), [-1, 5, 0], [0, -2.5, 0]);
    parts.legR = part(inner, mat, skinBox(1, 5, 1, 40, 0, W, H), [1, 5, 0], [0, -2.5, 0]);
    parts.body = part(inner, mat, skinBox(6, 6, 8, 0, 9, W, H), [0, 5, 0], [0, 3, 0]);
    parts.wingL = part(inner, mat, skinBox(1, 4, 6, 40, 10, W, H), [-3.5, 10, 0], [0, -2, 0]);
    parts.wingR = part(inner, mat, skinBox(1, 4, 6, 40, 10, W, H), [3.5, 10, 0], [0, -2, 0]);
    parts.head = part(inner, mat, skinBox(4, 6, 3, 0, 0, W, H), [0, 9, 4], [0, 3, 0.5]);
    const beak = new THREE.Mesh(skinBox(4, 2, 2, 28, 0, W, H), mat);
    beak.position.set(0, 3.5 * MODEL_SCALE, 3 * MODEL_SCALE);
    parts.head.add(beak);
    const wattle = new THREE.Mesh(skinBox(2, 2, 2, 28, 4, W, H), mat);
    wattle.position.set(0, 1.5 * MODEL_SCALE, 2.5 * MODEL_SCALE);
    parts.head.add(wattle);
    return { root, inner, parts, mat, height: 0.7, width: 0.4, headY: 9 };
  }
  throw new Error('unknown model ' + type);
}

// Walk / idle animation.
function animateModel(model, type, walkPhase, walkAmount, headYaw, headPitch, swing = 0) {
  const p = model.parts;
  const s = Math.sin(walkPhase) * walkAmount;
  if (p.legL) { p.legL.rotation.x = s * 0.9; p.legR.rotation.x = -s * 0.9; }
  if (p.legFL) {
    p.legFL.rotation.x = s * 0.8; p.legBR.rotation.x = s * 0.8;
    p.legFR.rotation.x = -s * 0.8; p.legBL.rotation.x = -s * 0.8;
  }
  if (type === 'player') {
    p.armL.rotation.x = -s * 0.9;
    p.armR.rotation.x = s * 0.9 - Math.sin(swing * Math.PI) * 1.4;
  } else if (type === 'zombie') {
    p.armL.rotation.x = -Math.PI / 2 + Math.sin(walkPhase * 0.5) * 0.05;
    p.armR.rotation.x = -Math.PI / 2 - Math.sin(swing * Math.PI) * 0.8;
  }
  if (p.wingL) { p.wingL.rotation.z = -Math.abs(s) * 0.5; p.wingR.rotation.z = Math.abs(s) * 0.5; }
  if (p.head) { p.head.rotation.y = headYaw; p.head.rotation.x = -headPitch; }
}

// Name tag sprite
function makeNameTag(text) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = 'bold 28px monospace';
  const w = Math.ceil(ctx.measureText(text).width) + 16;
  c.width = w; c.height = 40;
  ctx.font = 'bold 28px monospace';
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(0, 0, w, 40);
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 8, 21);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(w / 40 * 0.3, 0.3, 1);
  return spr;
}

// Geometry for a whole block (centered), with optional UV sub-region for particles.
function blockGeometry(id, size = 1, uvRegion = null) {
  const pos = [], uv = [], col = [], idx = [];
  const b = BLOCKS[id];
  if (b.model !== 'cube') return itemGeometry(id, size);
  FACES.forEach((face, f) => {
    let [u0, v0, u1, v1] = tileUV(faceTile(id, f, 0));
    if (uvRegion) {
      const du = (u1 - u0), dv = (v1 - v0);
      u0 += du * uvRegion[0]; v0 += dv * uvRegion[1];
      u1 = u0 + du * uvRegion[2]; v1 = v0 + dv * uvRegion[2];
    }
    const base = pos.length / 3;
    for (const c of face.corners) {
      pos.push((c[0] - 0.5) * size, (c[1] - 0.5) * size, (c[2] - 0.5) * size);
      uv.push(c[3] ? u1 : u0, c[4] ? v1 : v0);
      col.push(face.shade, face.shade, face.shade);
    }
    idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

// A flat, slightly thick sprite for non-block items (double-sided quad).
function itemGeometry(id, size = 1) {
  const tile = id < 256 ? BLOCKS[id].tiles[0] : ITEMS[id].tile;
  const [u0, v0, u1, v1] = tileUV(tile);
  const s = size / 2;
  const pos = [-s, -s, 0, s, -s, 0, -s, s, 0, s, s, 0];
  const uv = [u0, v0, u1, v0, u0, v1, u1, v1];
  const col = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos.concat(pos), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv.concat(uv), 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col.concat(col), 3));
  g.setIndex([0, 1, 2, 2, 1, 3, 4 + 0, 4 + 2, 4 + 1, 4 + 2, 4 + 3, 4 + 1]);
  return g;
}

function isCubeItem(id) { return id < 256 && BLOCKS[id] && BLOCKS[id].model === 'cube'; }
