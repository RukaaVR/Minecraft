// Procedural textures for the Nether, fluids, farming, village blocks and newer items.
'use strict';

function paintExtraTiles(painter, vary, clear, h) {
  const { fill, speckle, stoneBase, dirtLike, planksLike, cobbleLike } = h;
  let p;
  const ore = (tile, seed, base, color) => {
    const q = painter(tile, seed);
    base(q);
    for (let n = 0; n < 6; n++) {
      const cx = 2 + Math.floor(q.rand() * 12), cy = 2 + Math.floor(q.rand() * 12);
      for (let k = 0; k < 4; k++) {
        const c = vary(q.rand, color, 30);
        q.set(cx + Math.floor(q.rand() * 3) - 1, cy + Math.floor(q.rand() * 3) - 1, c[0], c[1], c[2]);
      }
    }
  };
  const netherrack = (q) => {
    fill(q, [111, 54, 52], 26);
    speckle(q, [140, 70, 66], 22, 2);
    speckle(q, [80, 30, 32], 26);
  };

  // ---- Nether
  p = painter(T.NETHERRACK, 700); netherrack(p);
  p = painter(T.SOUL_SAND, 701);
  fill(p, [84, 64, 51], 20);
  for (let n = 0; n < 5; n++) {
    const cx = 2 + Math.floor(p.rand() * 12), cy = 2 + Math.floor(p.rand() * 12);
    p.set(cx, cy, 45, 32, 25); p.set(cx + 2, cy, 45, 32, 25); p.set(cx + 1, cy + 2, 45, 32, 25);
  }
  ore(T.QUARTZ_ORE, 702, netherrack, [235, 225, 215]);
  p = painter(T.NETHER_BRICKS, 703);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const off = Math.floor(y / 4) % 2 ? 4 : 0;
    const mortar = y % 4 === 3 || (x + off) % 8 === 7;
    const c = mortar ? vary(p.rand, [30, 14, 18], 8) : vary(p.rand, [68, 32, 38], 14);
    p.set(x, y, c[0], c[1], c[2]);
  }
  p = painter(T.LAVA, 704);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const v = Math.sin(x * 0.8 + Math.cos(y * 0.6) * 2) + Math.cos(y * 0.9 + x * 0.3);
    const hot = v > 0.6 ? 1 : v < -0.9 ? -1 : 0;
    const c = hot > 0 ? vary(p.rand, [255, 220, 90], 20) : hot < 0 ? vary(p.rand, [190, 60, 10], 20) : vary(p.rand, [240, 120, 20], 20);
    p.set(x, y, c[0], c[1], c[2]);
  }
  p = painter(T.PORTAL, 705);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const a = Math.atan2(y - 7.5, x - 7.5), r = Math.hypot(x - 7.5, y - 7.5);
    const v = Math.sin(a * 3 + r * 0.9) * 0.5 + 0.5;
    p.set(x, y, 90 + v * 90, 20 + v * 40, 180 + v * 70, 190);
  }

  // ---- Farming
  p = painter(T.FARMLAND_TOP, 706);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const furrow = y % 4 === 0 ? -25 : 0;
    const c = vary(p.rand, [88, 58, 36], 18); p.set(x, y, c[0] + furrow, c[1] + furrow, c[2] + furrow);
  }
  for (let s = 0; s < 4; s++) {
    p = painter(T.WHEAT0 + s, 707 + s); clear(p);
    const hgt = 3 + s * 4;
    const col = s < 3 ? [60 + s * 20, 150 - s * 10, 40] : [200, 170, 60];
    for (const x0 of [2, 5, 9, 12]) {
      for (let y = 15; y > 15 - hgt; y--) {
        const c = vary(p.rand, col, 25); p.set(x0 + (y % 3 === 0 ? 1 : 0), y, c[0], c[1], c[2]);
      }
      if (s === 3) for (let y = 15 - hgt; y < 15 - hgt + 4; y++) { p.set(x0 - 1, y, 170, 140, 50); p.set(x0 + 1, y, 170, 140, 50); }
    }
  }
  // ---- Door (bottom has panels, top has two windows)
  const door = (tile, seed, top) => {
    const q = painter(tile, seed);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const frame = x < 2 || x > 13 || (top ? y < 2 : y > 13) || y === 7 || y === 8;
      const c = vary(q.rand, frame ? [130, 98, 55] : [170, 132, 78], 12);
      q.set(x, y, c[0], c[1], c[2]);
    }
    if (top) for (let y = 3; y < 7; y++) for (let x = 3; x < 13; x++) if (x !== 7 && x !== 8) q.set(x, y, 0, 0, 0, 0);
    else for (let y = 10; y < 13; y++) for (let x = 3; x < 13; x++) if (x !== 7 && x !== 8) q.set(x, y, 120, 90, 50);
    if (!top) { q.set(12, 2, 60, 60, 60); q.set(12, 3, 60, 60, 60); }
  };
  door(T.DOOR_TOP, 712, true);
  door(T.DOOR_BOTTOM, 713, false);
  // ---- Bed
  p = painter(T.BED_FOOT, 714);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const c = vary(p.rand, [175, 35, 35], 14); p.set(x, y, c[0], c[1], c[2]); }
  p = painter(T.BED_HEAD, 715);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const pillow = y < 7 && x > 1 && x < 14;
    const c = pillow ? vary(p.rand, [235, 235, 235], 8) : vary(p.rand, [175, 35, 35], 14);
    p.set(x, y, c[0], c[1], c[2]);
  }
  const bedSide = (tile, seed) => {
    const q = painter(tile, seed); clear(q);
    for (let y = 7; y < 16; y++) for (let x = 0; x < TILE; x++) {
      let c;
      if (y < 10) c = vary(q.rand, [175, 35, 35], 14);
      else if (y < 13) c = vary(q.rand, [160, 125, 75], 12);
      else if (x < 3 || x > 12) c = vary(q.rand, [140, 105, 60], 12);
      else continue;
      q.set(x, y, c[0], c[1], c[2]);
    }
  };
  bedSide(T.BED_SIDE, 716);
  bedSide(T.BED_SIDE_HEAD, 717);
  // ---- Hay
  p = painter(T.HAY_TOP, 718);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const ring = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)) > 6.5 ? -30 : 0;
    const c = vary(p.rand, [200, 165, 50], 30); p.set(x, y, c[0] + ring, c[1] + ring, c[2]);
  }
  p = painter(T.HAY_SIDE, 719);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const band = (y === 3 || y === 12) ? [120, 70, 30] : null;
    const c = band || vary(p.rand, [205, 170, 55], 30);
    p.set(x, y, c[0], c[1] - (x % 3 === 0 ? 15 : 0), c[2]);
  }
  ore(T.EMERALD_ORE, 720, stoneBase, [40, 210, 90]);
  p = painter(T.EMERALD_BLOCK, 721);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const edge = x === 0 || y === 0 || x === 15 || y === 15;
    const c = vary(p.rand, [60, 210, 110], 14); p.set(x, y, c[0] - (edge ? 40 : 0), c[1] - (edge ? 40 : 0), c[2] - (edge ? 40 : 0));
  }
  // ---- Dirt path
  p = painter(T.PATH_TOP, 722); fill(p, [148, 122, 68], 20); speckle(p, [120, 98, 52], 20); speckle(p, [170, 145, 90], 10);
  p = painter(T.PATH_SIDE, 723); dirtLike(p);
  for (let x = 0; x < TILE; x++) for (let y = 0; y < 2; y++) { const c = vary(p.rand, [148, 122, 68], 18); p.set(x, y, c[0], c[1], c[2]); }
  for (let x = 0; x < TILE; x++) p.set(x, 0, 0, 0, 0, 0); // 15/16 tall
  // ---- Sapling
  p = painter(T.SAPLING, 724); clear(p);
  for (let y = 9; y < 16; y++) { p.set(7, y, 100, 75, 40); p.set(8, y, 90, 68, 36); }
  for (let n = 0; n < 40; n++) {
    const x = 3 + Math.floor(p.rand() * 10), y = 1 + Math.floor(p.rand() * 9);
    if (Math.hypot(x - 7.5, y - 5) < 4.8) { const c = vary(p.rand, [60, 135, 40], 30); p.set(x, y, c[0], c[1], c[2]); }
  }
  // ---- Mossy cobble
  p = painter(T.MOSSY_COBBLE, 725); cobbleLike(p); speckle(p, [80, 120, 50], 30, 2);

  paintItems2(painter, vary, clear);
  if (typeof paintTiles3 === 'function') paintTiles3(painter, vary, clear, h);
}

function paintItems2(painter, vary, clear) {
  const outline = (p, dark = [40, 30, 20]) => {
    const solid = [];
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) solid.push(p.get(x, y)[3] > 0);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      if (solid[y * TILE + x]) continue;
      const n = (dx, dy) => { const xx = x + dx, yy = y + dy; return xx >= 0 && yy >= 0 && xx < TILE && yy < TILE && solid[yy * TILE + xx]; };
      if (n(1, 0) || n(-1, 0) || n(0, 1) || n(0, -1)) p.set(x, y, dark[0], dark[1], dark[2]);
    }
  };
  const blob = (tile, seed, color, fn, amt = 20, line = true) => {
    const p = painter(tile, seed); clear(p);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const v = fn(x, y);
      if (!v) continue;
      const c = vary(p.rand, Array.isArray(v) ? v : color, amt); p.set(x, y, c[0], c[1], c[2]);
    }
    if (line) outline(p);
    return p;
  };
  const ell = (cx, cy, rx, ry) => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  const stickFn = (x, y) => x + y === 15 && x >= 3 && x <= 12;
  const S = T.ITEM2;
  // 0 seeds, 1 wheat
  blob(S + 0, 800, [70, 140, 40], (x, y) => [[4, 9], [6, 6], [9, 10], [11, 7], [7, 12], [10, 4]].some(([a, b]) => Math.abs(x - a) + Math.abs(y - b) <= 1));
  blob(S + 1, 801, [215, 180, 70], (x, y) => (x + y >= 13 && x + y <= 16 && x > 2 && x < 14) || (Math.abs(x - y - 1) <= 1 && x > 7 && x < 13 ? [190, 150, 50] : false));
  // 2 emerald, 3 quartz
  blob(S + 2, 802, [50, 200, 100], (x, y) => Math.abs(x - 7.5) * 1.3 + Math.abs(y - 7.5) <= 6.5 && (x + y < 13 ? [150, 255, 180] : true), 12);
  blob(S + 3, 803, [235, 228, 220], (x, y) => (x + y >= 10 && x + y <= 18 && Math.abs(x - y) <= 5), 14);
  // 4 bucket, 5 water bucket, 6 lava bucket
  const bucket = (x, y) => y >= 5 && y <= 13 && x >= 3 + (y - 5) * 0.25 && x <= 12 - (y - 5) * 0.25;
  blob(S + 4, 804, [190, 190, 190], (x, y) => bucket(x, y) && (y === 5 ? [120, 120, 120] : true), 10);
  blob(S + 5, 805, [190, 190, 190], (x, y) => bucket(x, y) && (y <= 6 ? [50, 90, 220] : true), 10);
  blob(S + 6, 806, [190, 190, 190], (x, y) => bucket(x, y) && (y <= 6 ? [255, 130, 20] : true), 10);
  // 7..11 hoes
  TOOL_MATERIALS.forEach((m, mi) => blob(S + 7 + mi, 807 + mi, m.color, (x, y) => (stickFn(x, y) && x <= 10 ? [120, 85, 45] : false) ||
    ((y === 2 || y === 3) && x >= 7 && x <= 12 ? m.color : false), 14));
  // 12 bow, 13 arrow, 14 string, 15 bone, 16 flint, 17 nugget
  blob(S + 12, 812, [120, 85, 45], (x, y) => {
    const d = Math.hypot(x - 2, y - 2);
    if (d >= 10 && d <= 11.5 && x >= 2 && y >= 2) return true;
    if (Math.abs(x - y) <= 0 && x >= 4 && x <= 12) return [230, 230, 230];
    return false;
  });
  blob(S + 13, 813, [120, 85, 45], (x, y) => (stickFn(x, y) && x >= 4 && x <= 11) || ((x >= 11 && y <= 4 && x + y >= 14 && x + y <= 16) ? [90, 90, 90] : false) || ((x <= 4 && y >= 11 && Math.abs(x + y - 15) <= 1) ? [240, 240, 240] : false));
  blob(S + 14, 814, [235, 235, 235], (x, y) => Math.abs(y - (8 + Math.sin(x * 0.8) * 3)) < 0.8 && x > 1 && x < 15);
  blob(S + 15, 815, [235, 230, 210], (x, y) => (Math.abs(x - y) <= 1 && x > 3 && x < 12) || ell(3.5, 3.5, 1.8, 1.8)(x, y) || ell(12, 12, 1.8, 1.8)(x, y), 10);
  blob(S + 16, 816, [50, 50, 55], (x, y) => ell(8, 8, 4.5, 5.5)(x, y) && (x + y < 12 ? [90, 90, 95] : true), 15);
  blob(S + 17, 817, [250, 210, 60], (x, y) => ell(8, 9, 3, 2.5)(x, y), 15);
  // 18..33 armor (4 materials x helmet, chestplate, leggings, boots)
  ARMOR_MATERIALS.forEach((m, mi) => {
    const c = m.color;
    const shapes = [
      (x, y) => y >= 4 && y <= 10 && x >= 3 && x <= 12 && !(y >= 8 && x >= 5 && x <= 10),
      (x, y) => y >= 2 && y <= 14 && x >= 2 && x <= 13 && !(y <= 4 && x >= 6 && x <= 9) && !(y >= 6 && (x <= 3 || x >= 12)),
      (x, y) => y >= 2 && y <= 14 && x >= 3 && x <= 12 && !(y >= 6 && x >= 7 && x <= 8),
      (x, y) => y >= 8 && y <= 13 && ((x >= 2 && x <= 6) || (x >= 9 && x <= 13)) && !(y <= 10 && (x === 6 || x === 9) && false),
    ];
    shapes.forEach((fn, pi) => blob(S + 18 + mi * 4 + pi, 818 + mi * 4 + pi, c, fn, 14));
  });
  // 34 door item, 35 bed item, 36 bone meal, 37 fireball
  blob(S + 34, 834, [165, 128, 75], (x, y) => x >= 4 && x <= 11 && y >= 1 && y <= 14 && !((y >= 3 && y <= 5) && x >= 6 && x <= 9 ? false : false) && ((y >= 3 && y <= 5 && x >= 6 && x <= 9) ? [120, 90, 50] : true), 12);
  blob(S + 35, 835, [175, 35, 35], (x, y) => (y >= 6 && y <= 9 && x >= 1 && x <= 14 ? (x <= 4 ? [235, 235, 235] : true) : false) || ((y >= 10 && y <= 12) && (x === 1 || x === 14) ? [140, 105, 60] : false), 12);
  blob(S + 36, 836, [240, 240, 230], (x, y) => ell(8, 9, 4.5, 4)(x, y) && (x * y) % 5 !== 0, 15);
  blob(S + 37, 837, [255, 140, 30], (x, y) => ell(7.5, 7.5, 6.5, 6.5)(x, y) && ((x * 7 + y * 3) % 5 === 0 ? [255, 230, 120] : (x + y) % 4 === 0 ? [120, 40, 10] : true), 30, false);
}
