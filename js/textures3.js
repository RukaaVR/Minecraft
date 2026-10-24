// Redrawn block and item textures, painted over the atlas after the original painters run.
// Everything here is a pixel-art pass over the tiles from blocks.js / textures2.js / blocks3.js:
// tileable value noise and Voronoi cells give structure (stones, pebbles, leaf clusters),
// small hand-tuned palettes (3-6 shades per material) give the flat Minecraft look, and
// bevels put the highlight on the top-left and the shadow on the bottom-right of each shape.
// Tile indices, alpha (cutout holes) and block definitions are unchanged.
'use strict';
(() => {
  if (typeof buildAtlas !== 'function') return;

  // ---------------------------------------------------------------- helpers
  const N = 16;
  const ci = (v, a, b) => (v < a ? a : v > b ? b : v);
  const hx = (s) => s.trim().split(/\s+/).map((h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]);
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  // Shades of a base colour: k < 1 darkens (leaning cool), k > 1 lightens (leaning warm)
  const shades = (base, ks) => ks.map((k) => (k <= 1 ? [base[0] * k, base[1] * k, base[2] * (k + (1 - k) * 0.15)] : mix(base, [255, 252, 240], k - 1)));
  const ih = (a, b, s) => {
    let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const rng = (seed) => mulberry32(seed * 7919 + 4099);
  const md = (v, n) => ((v % n) + n) % n;
  // Value noise that tiles every 16 px; cw/ch = lattice cell size (divides 16)
  const vn = (x, y, cw, ch, s) => {
    const nx = N / cw, ny = N / ch, fx = x / cw, fy = y / ch;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = ih(md(x0, nx), md(y0, ny), s), b = ih(md(x0 + 1, nx), md(y0, ny), s);
    const c = ih(md(x0, nx), md(y0 + 1, ny), s), d = ih(md(x0 + 1, nx), md(y0 + 1, ny), s);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  const wd = (a, b) => { let d = a - b; if (d > 8) d -= 16; else if (d < -8) d += 16; return d; };
  // Points with a minimum (wrapped) spacing
  const scatter = (rand, n, minD, tries = 600) => {
    const pts = [];
    for (let k = 0; k < tries && pts.length < n; k++) {
      const p = [rand() * N, rand() * N];
      let ok = true;
      for (const q of pts) if (Math.hypot(wd(p[0], q[0]), wd(p[1], q[1])) < minD) { ok = false; break; }
      if (ok) pts.push(p);
    }
    return pts;
  };
  // Wrapped Voronoi: nearest id, distances to the 1st/2nd/3rd nearest point and offset from the nearest
  const worley = (pts, sx = 1, sy = 1) => {
    const id = new Int16Array(256), d1 = new Float32Array(256), d2 = new Float32Array(256), d3 = new Float32Array(256);
    const ox = new Float32Array(256), oy = new Float32Array(256);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let a = 1e9, b = 1e9, c = 1e9, ai = 0, ax = 0, ay = 0;
      for (let k = 0; k < pts.length; k++) {
        const dx = wd(x + 0.5, pts[k][0]), dy = wd(y + 0.5, pts[k][1]);
        const d = Math.hypot(dx * sx, dy * sy);
        if (d < a) { c = b; b = a; a = d; ai = k; ax = dx; ay = dy; } else if (d < b) { c = b; b = d; } else if (d < c) c = d;
      }
      const i = y * N + x;
      id[i] = ai; d1[i] = a; d2[i] = b; d3[i] = c; ox[i] = ax; oy[i] = ay;
    }
    return { id, d1, d2, d3, ox, oy };
  };
  const I = (x, y) => (y & 15) * N + (x & 15);
  const lv = () => new Int8Array(256);

  // 16x16 RGBA tile buffer
  const mk = () => {
    const a = new Uint8ClampedArray(1024);
    const t = {
      a,
      set(x, y, c, al = 255) {
        if (x < 0 || y < 0 || x > 15 || y > 15) return;
        const i = (y * N + x) * 4; a[i] = c[0]; a[i + 1] = c[1]; a[i + 2] = c[2]; a[i + 3] = al;
      },
      get(x, y) { const i = I(x, y) * 4; return [a[i], a[i + 1], a[i + 2], a[i + 3]]; },
      al(x, y) { return x < 0 || y < 0 || x > 15 || y > 15 ? 0 : a[(y * N + x) * 4 + 3]; },
      clone() { const u = mk(); u.a.set(a); return u; },
      clear(x0 = 0, y0 = 0, x1 = 15, y1 = 15) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) t.set(x, y, [0, 0, 0], 0); return t; },
    };
    return t;
  };
  // Paint a level map through a palette (HOLE = leave transparent)
  const HOLE = -100; // level for a transparent pixel
  const paint = (L, pal, t = mk()) => {
    for (let i = 0; i < 256; i++) { const l = L[i]; if (l <= HOLE) continue; t.set(i & 15, i >> 4, pal[ci(l, 0, pal.length - 1)]); }
    return t;
  };
  const rect = (t, x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) t.set(x, y, c); };
  // Draw a small sprite: rows of chars, map char -> colour (or null to skip)
  const stamp = (t, x0, y0, rows, map, wrap = false) => {
    rows.forEach((row, dy) => { for (let dx = 0; dx < row.length; dx++) { const c = map[row[dx]]; if (!c) continue; if (wrap) t.set((x0 + dx) & 15, (y0 + dy) & 15, c); else t.set(x0 + dx, y0 + dy, c); } });
  };
  // Dark outline around opaque pixels (items)
  const outline = (t, c = [40, 30, 22]) => {
    const solid = new Uint8Array(256);
    for (let i = 0; i < 256; i++) solid[i] = t.a[i * 4 + 3] > 0 ? 1 : 0;
    const s = (x, y) => x >= 0 && y >= 0 && x < N && y < N && solid[y * N + x];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!solid[y * N + x] && (s(x - 1, y) || s(x + 1, y) || s(x, y - 1) || s(x, y + 1))) t.set(x, y, c);
  };

  // ---------------------------------------------------------------- palettes
  const PAL = {
    stone: hx('545454 636363 717171 7e7e7e 8b8b8b 999999'),
    cobble: hx('383838 4e4e4e 646464 767676 878787 999999 aeaeae'),
    dirt: hx('523826 63452f 79563b 8b6545 9a7350 ab845f'),
    grass: hx('3d6a22 4e822b 5e9a35 6eab40 80bf4d 98cf60'),
    sand: hx('bdab7d cbba8c d8c99c e1d4a9 e9dfb8 f2ead0'),
    gravel: hx('4a4644 5e5a57 74706d 88837f 9c9792 b3aea8'),
    gravelB: hx('4f4338 66574a 7c6c5d 908071 a39383'),
    snow: hx('c8d6e0 d9e4ec e8eff4 f3f7fa ffffff'),
    oakPl: hx('6b5030 8f6c3e a8834e b8915a c49e64 d2ad72'),
    birchPl: hx('8f7d55 b19d6c c4af7d d0bc89 dac897 e5d6a8'),
    sprucePl: hx('3c2a16 553d22 694c2c 75562f 806038 8c6a40'),
    oakBark: hx('2e2314 41321d 554128 66502f 776039 87703f'),
    oakRing: hx('6e5530 9c7a4a b28e5a bf9d66 cdac75 d9bb86'),
    birchBark: hx('2a2a28 55534d 9b988e c8c5bb dddbd2 eeede6 fbfaf4'),
    birchRing: hx('8a7650 b39d6d c7b07c d3bd8a decb9a'),
    spruceBark: hx('1f160c 2c2012 3a2a18 47341e 553f25 624a2c'),
    spruceRing: hx('4e391f 72552f 86663a 957443 a3824e'),
    oakLeaf: hx('23521a 307022 3d8a2c 4b9f36 5ab241 72c654'),
    birchLeaf: hx('45692a 567f33 68963d 7aa848 8dba56 a5ce6a'),
    spruceLeaf: hx('183520 21442a 2b5433 35633c 427349 528458'),
    brick: hx('5a2a20 7a3828 8f4430 a1503a b0604a c07258'),
    mortar: hx('7d766e 948d84 a9a298 bbb4aa'),
    sbrick: hx('3c3c3c 545454 666666 747474 828282 919191 a4a4a4'),
    nbrick: hx('160a0c 2a1216 3b1b20 4b222a 5a2b33 6a3540'),
    nether: hx('3d1515 561f1f 6e2928 82332f 963f3a a84f48 bb6458'),
    soul: hx('2a1e16 3b2b20 4c382b 5c4535 6d5442 7f6550'),
    end: hx('a4a46c bcbd80 cfd193 dcdea2 e7e9b4 f2f4c8'),
    obsidian: hx('07050d 0f0a1a 181128 231a39 34254f 4b3870 6c56a0'),
    glow: hx('5e3b17 8c5a22 b98035 dca34a f2c766 fde39a fff6d2'),
    lava: hx('8a2304 b33b08 d4580d e9781a f59c2a fbc246 ffe27a fff3b8'),
    water: hx('1c3994 22429f 2a4fb6 3159c6 3d68d4 5280e0 6d98ea'),
    portal: hx('2c0560 410a85 5813a8 7024c4 8a3ddc a75ef0 c88cff'),
    farm: hx('2e1d10 3e2816 4f341d 5e3f25 6d4b2e 7c5838'),
    path: hx('6b5530 816839 977b45 a68a52 b49860 c3a874'),
    hay: hx('6b4a12 94701c b3901f c8a52b d9b93a e8cd55 f5e283'),
    band: hx('3f220e 5a3317 74441f'),
    pumpkin: hx('7a3a06 a1520c c46c12 d9821c e69628 f1ac3e f8c562'),
    cactus: hx('133511 1e4a19 2a6122 37772b 468c36 5aa246 77b860'),
    sandstone: hx('a99668 bba77a cbb88a d7c597 e0cfa3 e9dab2 f2e6c4'),
    iron: hx('5e5e5e 8a8a8a a8a8a8 c2c2c2 d6d6d6 e6e6e6 f5f5f5'),
    gold: hx('7a4a06 b07a10 d9a51c efc22e f9d84a fde97a fff6be'),
    diamond: hx('0d5d5b 18837f 2bb0aa 4fd0c8 7fe6de b0f4ee e4fffc'),
    emerald: hx('064a22 0d6c32 159045 1fae58 3fcb75 7be3a1 c4f7d6'),
    lapis: hx('0e1d52 16296f 1f3790 2a47ab 3b5cc4 5878d8 8fa6ee'),
    redstone: hx('4a0503 760a06 a1120b c41d12 e0321f f25a43 ff9a86'),
    wood: hx('3a2814 5a3f1f 7a5830 94703f a7824c b8955c'),
    chest: hx('2e1c0b 4f3215 6d4720 8a5c2b a06d36 b58046 c69455'),
    metal: hx('1e2328 2e353d 404952 55606b 6c7884 8a96a2'),
    red: hx('5e0f0f 7f1717 9e2020 b52a26 c83a32 d85848'),
    white: hx('9a9a96 b8b8b4 cfcfcb e2e2de f0f0ec fcfcfa'),
  };

  // ---------------------------------------------------------------- materials
  // Stone: soft horizontal clusters with a gentle emboss
  const stoneL = (seed, lo = 0.4, hi = 0.6) => {
    const B = lv(), L = lv();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const v = vn(x, y, 8, 4, seed) * 0.42 + vn(x, y, 4, 2, seed + 1) * 0.38 + vn(x, y, 2, 2, seed + 2) * 0.2;
      B[y * N + x] = v < lo ? 1 : v < hi ? 2 : 3;
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const l = B[I(x, y)], up = B[I(x, y - 1)], lf = B[I(x - 1, y)];
      let o = l + 1;
      if (l > up || l > lf) o++;
      else if (l < up) o--;
      L[I(x, y)] = o;
    }
    return L;
  };
  const stone = (seed = 11) => paint(stoneL(seed), PAL.stone);

  // Rounded stones with dark mortar between them (cobble, gravel, bedrock, netherrack...)
  const cells = (seed, n, minD, gap, round = 0.72) => {
    const rand = rng(seed);
    const pts = scatter(rand, n, minD);
    const W = worley(pts);
    const nn = pts.map((p, k) => Math.min(...pts.map((q, j) => (j === k ? 99 : Math.hypot(wd(p[0], q[0]), wd(p[1], q[1]))))));
    const tone = pts.map(() => rand());
    const R = new Int16Array(256);
    for (let i = 0; i < 256; i++) {
      const k = W.id[i];
      R[i] = (W.d2[i] - W.d1[i] < gap || W.d1[i] > nn[k] * round || W.d3[i] - W.d1[i] < gap * 2.2) ? -1 : k;
    }
    return { pts, W, R, tone, nn, rand };
  };
  // Level per pixel from a cell map: base tone + light from the top-left + bevel at the gaps
  const cellLevels = (C, base, spread, bev = 1, gapLv = 0, gapShadow = -1) => {
    const L = lv(), { R, W, tone, nn } = C;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, r = R[i];
      if (r < 0) {
        L[i] = R[I(x, y - 1)] >= 0 || R[I(x - 1, y)] >= 0 ? gapLv + gapShadow : gapLv;
        continue;
      }
      const s = (W.ox[i] + W.oy[i]) / Math.max(1.5, nn[r] * 0.6);
      let l = base + Math.floor(tone[r] * spread) - Math.round(s * 0.9);
      if (R[I(x, y - 1)] !== r || R[I(x - 1, y)] !== r) l += bev;
      else if (R[I(x, y + 1)] !== r || R[I(x + 1, y)] !== r) l -= bev;
      L[i] = l;
    }
    return L;
  };
  const cobbleC = (seed) => cells(seed, 8, 5.0, 1.0, 0.74);
  const cobble = (seed = 31) => paint(cellLevels(cobbleC(seed), 3, 2, 1, 1, -1), PAL.cobble);

  const dirtL = (seed) => {
    const L = lv();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const v = vn(x, y, 4, 4, seed) * 0.55 + vn(x, y, 2, 2, seed + 1) * 0.45;
      L[y * N + x] = v < 0.36 ? 2 : v < 0.62 ? 3 : 4;
    }
    // little clumps: light lump with a dark shadow pixel under/right of it
    const rand = rng(seed + 7);
    const pts = scatter(rand, 13, 3.3);
    pts.forEach(([px, py], k) => {
      const x = Math.floor(px), y = Math.floor(py);
      const big = k % 3 === 0;
      L[I(x, y)] = 5; if (big) { L[I(x + 1, y)] = 4; L[I(x, y + 1)] = 4; }
      L[I(x + (big ? 1 : 0), y + 1 + (big ? 1 : 0))] = 0;
      L[I(x + 1 + (big ? 1 : 0), y + (big ? 1 : 0))] = 1;
    });
    // dark grit
    for (let k = 0; k < 7; k++) { const x = Math.floor(rand() * N), y = Math.floor(rand() * N); if (L[I(x, y)] < 4) L[I(x, y)] = 1; }
    return L;
  };
  const dirt = (seed = 21) => paint(dirtL(seed), PAL.dirt);

  const grassTopL = (seed) => {
    const L = lv();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const v = vn(x, y, 4, 4, seed) * 0.5 + vn(x, y, 2, 2, seed + 1) * 0.3 + ih(x, y, seed + 2) * 0.2;
      L[y * N + x] = v < 0.36 ? 1 : v < 0.52 ? 2 : v < 0.68 ? 3 : 4;
    }
    // blade tips: bright pixel with a darker one beneath it
    const rand = rng(seed + 5);
    for (const [px, py] of scatter(rand, 26, 2.2)) {
      const x = Math.floor(px), y = Math.floor(py);
      L[I(x, y)] = 5; L[I(x, y + 1)] = Math.min(L[I(x, y + 1)], 2); if (rand() < 0.5) L[I(x + 1, y + 1)] = 0;
    }
    return L;
  };
  // Side of a block with an overhanging fringe (grass / snow / path) over dirt
  const fringeSide = (seed, base, pal, depthFn, levelsFn) => {
    const t = base.clone();
    for (let x = 0; x < N; x++) {
      const d = depthFn(x);
      for (let y = 0; y < d; y++) t.set(x, y, pal[levelsFn(x, y, d)]);
      // shadow cast on the dirt just under the fringe
      const c = t.get(x, d); t.set(x, d, mul(c, 0.78));
    }
    return t;
  };
  const grassDepth = (seed) => {
    const rand = rng(seed);
    const dep = [];
    for (let x = 0; x < N; x++) dep.push(3 + Math.round(vn(x, 0, 4, 16, seed) * 2));
    // a few longer drips
    for (let k = 0; k < 4; k++) { const x = Math.floor(rand() * N); dep[x] += 1 + Math.floor(rand() * 2); }
    return (x) => dep[x];
  };

  const sandL = (seed, pal = 0) => {
    const L = lv();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const wob = Math.sin((x / N) * Math.PI * 2 + vn(x, y, 8, 8, seed) * 2) * 1.2;
      const rip = Math.sin(((y + wob) / N) * Math.PI * 2 * 3);
      const v = vn(x, y, 2, 2, seed + 1) * 0.6 + ih(x, y, seed + 2) * 0.4;
      L[y * N + x] = 2 + (rip > 0.72 ? 1 : rip < -0.8 ? -1 : 0) + (v < 0.28 ? -1 : v > 0.74 ? 1 : 0) + pal;
    }
    return L;
  };

  const gravel = (seed = 41) => {
    const C = cells(seed, 17, 3.1, 0.8, 0.85);
    const L = cellLevels(C, 2, 3, 1, 0, 0);
    const t = paint(L, PAL.gravel);
    // some pebbles are brownish
    for (let i = 0; i < 256; i++) {
      const r = C.R[i];
      if (r >= 0 && C.tone[r] > 0.62 && ((r * 7) % 3 === 0)) t.set(i & 15, i >> 4, PAL.gravelB[ci(L[i] - 1, 0, 4)]);
    }
    return t;
  };

  const planksT = (pal, seed, joints = [3, 11, 6, 14]) => {
    const L = lv(), rand = rng(seed);
    for (let b = 0; b < 4; b++) {
      const y0 = b * 4, j = joints[b];
      for (let y = y0; y < y0 + 3; y++) {
        for (let x = 0; x < N; x++) {
          const v = vn(x, y, 8, 1, seed + b * 7 + y);
          L[I(x, y)] = (y === y0 ? 3 : 2) + (v > 0.78 ? 1 : 0);
        }
        // one long grain line per row, sometimes a short second one
        const g = (len) => { const x0 = Math.floor(rand() * N); for (let k = 0; k < len; k++) L[I(x0 + k, y)] = y === y0 ? 2 : 1; };
        g(4 + Math.floor(rand() * 6));
        if (rand() < 0.4) g(2 + Math.floor(rand() * 2));
      }
      // seam under the board, butt joint with a darker end-grain pixel beside it
      for (let x = 0; x < N; x++) L[I(x, y0 + 3)] = 0;
      for (let y = y0; y < y0 + 3; y++) { L[I(j, y)] = 0; L[I(j - 1, y)] = Math.min(L[I(j - 1, y)], 1); L[I(j + 1, y)] = Math.max(L[I(j + 1, y)], 3); }
      // a knot on some boards
      if (rand() < 0.35) { const kx = md(j + 4 + Math.floor(rand() * 6), 16), ky = y0 + 1; L[I(kx, ky)] = 0; L[I(kx + 1, ky)] = 1; L[I(kx - 1, ky)] = 1; }
    }
    return paint(L, pal);
  };

  const barkL = (seed, period = 4, birch = false) => {
    const L = lv();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const v = vn(x, y, 1, 8, seed) * 0.6 + vn(x, y, 2, 4, seed + 1) * 0.4;
      L[y * N + x] = v < 0.35 ? 2 : v < 0.65 ? 3 : 4;
    }
    if (!birch) {
      const furrows = N / period;
      for (let k = 0; k < furrows; k++) {
        for (let y = 0; y < N; y++) {
          const w = vn(k * 3, y, 16, 4, seed + 9 + k) > 0.55 ? 1 : 0;
          const x = k * period + ((k * 5) % 3) + w;
          L[I(x, y)] = ih(x, y, seed) < 0.12 ? 1 : 0;
          L[I(x + 1, y)] = Math.min(L[I(x + 1, y)], 2);
          L[I(x - 1, y)] = Math.max(L[I(x - 1, y)], 4) + (ih(x, y, seed + 3) < 0.3 ? 1 : 0);
        }
      }
    }
    return L;
  };
  const logSide = (pal, seed, period) => paint(barkL(seed, period), pal);
  const birchSide = (seed) => {
    const L = lv();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const v = vn(x, y, 2, 8, seed) * 0.6 + ih(x, y, seed + 1) * 0.4;
      L[y * N + x] = v < 0.3 ? 4 : v < 0.75 ? 5 : 6;
    }
    // dark horizontal marks (lenticels) of a few sizes
    const rand = rng(seed + 3);
    const marks = [[0, 1, 4, 2], [5, 4, 3, 1], [10, 2, 5, 2], [2, 8, 2, 1], [8, 9, 4, 1], [12, 7, 3, 2], [0, 13, 3, 1], [6, 13, 5, 2], [13, 12, 2, 1]];
    for (const [mx, my, len, h] of marks) {
      const ox = Math.floor(rand() * 2);
      for (let k = 0; k < len; k++) for (let j = 0; j < h; j++) {
        const x = mx + ox + k, y = my + j;
        const edge = k === 0 || k === len - 1;
        L[I(x, y)] = edge ? 1 : (j === 0 ? 0 : 1);
      }
      for (let k = 0; k < len; k++) L[I(mx + ox + k, my + h)] = 3; // soft grey under each mark
    }
    return paint(L, PAL.birchBark);
  };
  const logTop = (bark, ring, seed, rings = [1.2, 3.2, 5.1]) => {
    const t = mk();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = Math.abs(x - 7.5), dy = Math.abs(y - 7.5);
      if (dx > 6.6 || dy > 6.6) {
        const v = vn(x, y, 2, 2, seed) > 0.5 ? 3 : 2;
        t.set(x, y, bark[(x === 0 || y === 0 || x === 15 || y === 15) ? v : v - 1]);
        continue;
      }
      const d = Math.max(dx, dy) * 0.55 + Math.hypot(dx, dy) * 0.45 + (vn(x, y, 4, 4, seed + 1) - 0.5) * 0.9;
      let l = 3;
      for (const r of rings) if (Math.abs(d - r) < 0.55) l = 1;
      if (l === 3 && (d < 1.0 || ih(x, y, seed + 2) < 0.12)) l = 2;
      if (l === 3 && ih(x, y, seed + 3) < 0.1) l = 4;
      if (dx > 5.6 || dy > 5.6) l = Math.min(l, 2) - (dx > 6 || dy > 6 ? 0 : 0);
      t.set(x, y, ring[l]);
    }
    return t;
  };

  // Leaves: overlapping clumps lit from the top-left, fine leaf-sized noise inside,
  // see-through gaps under the shaded side of each clump
  const leaves = (pal, seed, n = 10, minD = 4.0, R = 3.4, holeP = 0.7) => {
    const rand = rng(seed);
    const pts = scatter(rand, n, minD);
    const W = worley(pts);
    const rad = pts.map(() => R * (0.85 + rand() * 0.3));
    const L = lv();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, r = W.id[i];
      const s = (W.ox[i] + W.oy[i]) / rad[r], d = W.d1[i] / rad[r];
      const v = 0.56 - s * 0.3 - d * 0.22 + (vn(x, y, 2, 2, seed) - 0.5) * 0.5 + (ih(x, y, seed + 1) - 0.5) * 0.3;
      if ((d > 0.95 && s > -0.3 && ih(x, y, seed + 2) < holeP) || (v < 0.14 && ih(x, y, seed + 3) < holeP)) { L[i] = HOLE; continue; }
      L[i] = v < 0.22 ? 0 : v < 0.36 ? 1 : v < 0.5 ? 2 : v < 0.64 ? 3 : v < 0.78 ? 4 : 5;
    }
    return paint(L, pal);
  };
  const spruceLeaves = (seed) => {
    // dense needle sprays: small clumps with short diagonal needle highlights
    const t = leaves(PAL.spruceLeaf, seed, 14, 3.3, 2.8, 0.6);
    const rand = rng(seed + 1);
    for (const [px, py] of scatter(rand, 14, 3.2)) {
      const x = Math.floor(px), y = Math.floor(py);
      if (t.al(x, y) && t.al(x + 1, y + 1)) { t.set(x, y, PAL.spruceLeaf[5]); t.set(x + 1, y + 1, PAL.spruceLeaf[4]); }
    }
    return t;
  };

  // Ore: stone with distinct mineral clusters (h highlight, m mid, d dark, s stone shadow)
  const ORE_SHAPES = [
    ['.hm', 'hmd', 'md.'],
    ['hm.', 'mmd', '.dd'],
    ['.h.', 'hmd', '.md'],
    ['hm', 'md'],
    ['.hm.', 'hmmd', '.mdd'],
    ['h.', 'mh', '.d'],
  ];
  const ore = (base, cols, seed, count = 6, shapes = ORE_SHAPES, shadow = null) => {
    const t = base.clone(), rand = rng(seed);
    const pts = scatter(rand, count, 4.6);
    pts.forEach(([px, py], k) => {
      const sh = shapes[(k + Math.floor(rand() * shapes.length)) % shapes.length];
      const x0 = Math.floor(px), y0 = Math.floor(py);
      // shadow on the stone under/right of the cluster
      sh.forEach((row, dy) => { for (let dx = 0; dx < row.length; dx++) if (row[dx] !== '.') { const c = t.get(x0 + dx + 1, y0 + dy + 1); if (shadow) t.set((x0 + dx + 1) & 15, (y0 + dy + 1) & 15, shadow); else t.set((x0 + dx + 1) & 15, (y0 + dy + 1) & 15, mul(c, 0.72)); } });
      stamp(t, x0, y0, sh, { h: cols[2], m: cols[1], d: cols[0] }, true);
    });
    return t;
  };

  // Wool: soft fuzz with little curled fibres (bright stroke, shadow under it)
  const wool = (base, seed) => {
    const dark = base[0] + base[1] + base[2] < 150;
    const pal = dark ? [mul(base, 0.55), mul(base, 0.8), base, mix(base, [80, 80, 88], 0.3), mix(base, [110, 110, 120], 0.45), mix(base, [130, 130, 140], 0.55)]
      : shades(base, [0.72, 0.84, 0.93, 1.0, 1.06, 1.12]);
    const L = lv();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const v = vn(x, y, 4, 4, seed) * 0.6 + vn(x, y, 2, 2, seed + 1) * 0.4;
      L[y * N + x] = v < 0.38 ? 2 : v < 0.6 ? 3 : 4;
    }
    const rand = rng(seed + 2);
    scatter(rand, 26, 2.6).forEach(([px, py], k) => {
      const x = Math.floor(px), y = Math.floor(py), dir = k % 2 ? 1 : -1;
      L[I(x, y)] = 5; L[I(x + dir, y)] = 4; L[I(x + dir, y + 1)] = 1; L[I(x, y + 1)] = 2;
    });
    return paint(L, pal);
  };

  // Polished block (metal / gem): bevelled frame + inner pattern
  const blockFrame = (L, inset = 0) => {
    for (let i = 0; i < N; i++) {
      L[I(i, 0)] = 6; L[I(0, i)] = 6; L[I(i, 15)] = 1; L[I(15, i)] = 1;
    }
    L[I(0, 15)] = 3; L[I(15, 0)] = 3;
    if (inset) for (let i = 1; i < 15; i++) { L[I(i, 1)] = Math.max(L[I(i, 1)], 5); L[I(1, i)] = Math.max(L[I(1, i)], 5); L[I(i, 14)] = Math.min(L[I(i, 14)], 2); L[I(14, i)] = Math.min(L[I(14, i)], 2); }
  };

  // ---------------------------------------------------------------- plants & sprites
  // A grass blade growing up from the bottom row, bending more towards its tip
  const blade = (t, x, h, lean, cols) => {
    let fx = x + 0.5;
    for (let k = 0; k < h; k++) {
      const c = k < h * 0.3 ? cols[0] : k < h * 0.7 ? cols[1] : cols[2];
      t.set(Math.floor(fx), 15 - k, c);
      fx += lean * (k / h) * (k / h) * 0.9;
    }
  };

  // ---------------------------------------------------------------- the repaint
  // put(tile, buffer) writes a finished 16x16 buffer into the atlas
  function repaint(put) {
    const has = (k) => typeof T[k] === 'number';
    const P = PAL;

    // --- terrain
    const stoneT = stone(11);
    put(T.STONE, stoneT);
    const dirtT = dirt(21);
    put(T.DIRT, dirtT);
    put(T.GRASS_TOP, paint(grassTopL(1), P.grass));
    const gd = grassDepth(3);
    put(T.GRASS_SIDE, fringeSide(3, dirtT, P.grass, gd, (x, y, d) => (y === d - 1 ? 1 : y === 0 ? 4 : (ih(x, y, 4) < 0.3 ? 2 : 3))));
    const sandT = paint(sandL(8), P.sand);
    put(T.SAND, sandT);
    put(T.GRAVEL, gravel(41));
    const cobbleT = cobble(31);
    put(T.COBBLE, cobbleT);

    // bedrock: chunky high-contrast rock
    {
      const C = cells(14, 13, 3.4, 0.7, 0.95);
      const L = cellLevels(C, 1, 4, 1, 0, 0);
      put(T.BEDROCK, paint(L, hx('1c1c1c 333333 4a4a4a 616161 7a7a7a 959595 b0b0b0')));
    }
    // snow
    {
      const L = lv();
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const v = vn(x, y, 4, 4, 15) * 0.6 + vn(x, y, 2, 2, 16) * 0.4;
        L[y * N + x] = v < 0.33 ? 1 : v < 0.62 ? 2 : 3;
        if (ih(x, y, 17) < 0.05) L[y * N + x] = 4;
      }
      const snowT = paint(L, P.snow);
      put(T.SNOW, snowT);
      const sd = grassDepth(16);
      put(T.SNOW_SIDE, fringeSide(16, dirtT, P.snow, (x) => sd(x) + 1, (x, y, d) => (y === d - 1 ? 0 : y === 0 ? 4 : (ih(x, y, 18) < 0.3 ? 2 : 3))));
    }

    // --- ores
    put(T.COAL, ore(stoneT, hx('141414 2a2a2a 4a4a4a'), 17));
    put(T.IRON, ore(stoneT, hx('9c6f52 d8af93 f0d3bd'), 18));
    put(T.GOLD, ore(stoneT, hx('b8860b f6d23a fff4a0'), 19));
    put(T.DIAMOND, ore(stoneT, hx('1a9c96 5fe6dc d4fffb'), 20));
    if (has('EMERALD_ORE')) put(T.EMERALD_ORE, ore(stoneT, hx('0d7a35 2fd06a b4ffcf'), 720, 5, [['.h.', 'hmd', 'md.', '.d.'], ['h.', 'md'], ['.h', 'hm', 'md']]));
    if (has('LAPIS_ORE')) put(T.LAPIS_ORE, ore(stoneT, hx('122a8a 2a54c8 7a9cf0'), 909, 7));
    if (has('REDSTONE_ORE')) put(T.REDSTONE_ORE, ore(stoneT, hx('7a0806 d81a12 ff7a66'), 910, 7));

    // --- wood
    put(T.PLANKS, planksT(P.oakPl, 10));
    put(T.LOG_SIDE, logSide(P.oakBark, 5, 4));
    put(T.LOG_TOP, logTop(P.oakBark, P.oakRing, 6));
    put(T.LEAVES, leaves(P.oakLeaf, 7));
    if (has('BIRCH_LOG')) {
      put(T.BIRCH_LOG, birchSide(900));
      put(T.BIRCH_LOG_TOP, logTop(P.birchBark.slice(2), P.birchRing, 901, [2.2, 4.4]));
      put(T.BIRCH_LEAVES, leaves(P.birchLeaf, 902, 11, 3.8, 3.1, 0.75));
      put(T.BIRCH_PLANKS, planksT(P.birchPl, 903, [4, 12, 8, 1]));
      put(T.SPRUCE_LOG, logSide(P.spruceBark, 904, 3));
      put(T.SPRUCE_LOG_TOP, logTop(P.spruceBark, P.spruceRing, 905, [1.0, 2.6, 4.2, 5.6]));
      put(T.SPRUCE_LEAVES, spruceLeaves(906));
      put(T.SPRUCE_PLANKS, planksT(P.sprucePl, 907, [2, 9, 13, 5]));
    }

    // --- glass: frame with a soft inner edge, two highlight streaks, see-through middle
    {
      const t = mk();
      const fr = hx('9fb9c4 c6dde4 e8f4f7 ffffff');
      for (let i = 0; i < N; i++) {
        t.set(i, 0, fr[2]); t.set(0, i, fr[2]); t.set(i, 15, fr[0]); t.set(15, i, fr[0]);
      }
      t.set(0, 0, fr[3]); t.set(15, 15, fr[0]); t.set(15, 0, fr[1]); t.set(0, 15, fr[1]);
      for (const [x, y] of [[3, 2], [2, 3], [4, 2], [2, 4], [3, 3], [5, 2], [2, 5]]) t.set(x, y, fr[3]);
      for (const [x, y] of [[6, 3], [5, 4], [4, 5], [3, 6]]) t.set(x, y, fr[2]);
      for (const [x, y] of [[12, 10], [11, 11], [10, 12], [13, 9]]) t.set(x, y, fr[1]);
      put(T.GLASS, t);
    }

    // --- bricks
    {
      const L = lv(), rand = rng(13);
      for (let c = 0; c < 4; c++) {
        const y0 = c * 4, off = c % 2 ? 4 : 0;
        for (let b = 0; b < 2; b++) {
          const x0 = b * 8 + off, tone = 2 + Math.floor(rand() * 2) - (rand() < 0.2 ? 1 : 0);
          for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 7; dx++) {
            let l = tone;
            if (dy === 0) l += 1; else if (dy === 2) l -= 1;
            if (dx === 0 && dy < 2) l += 1;
            if (dx === 6) l -= 1;
            if (ih(x0 + dx, y0 + dy, 13) < 0.12) l -= 1;
            L[I(x0 + dx, y0 + dy)] = l;
          }
          for (let dy = 0; dy < 4; dy++) L[I(x0 + 7, y0 + dy)] = -2;
        }
        for (let x = 0; x < N; x++) L[I(x, y0 + 3)] = -2;
      }
      const t = paint(L.map((l) => (l === -2 ? HOLE : l)), P.brick);
      for (let i = 0; i < 256; i++) if (L[i] === -2) {
        const x = i & 15, y = i >> 4;
        const under = L[I(x, y - 1)] !== -2; // mortar right under a brick is shaded
        t.set(x, y, P.mortar[under ? 1 : (ih(x, y, 14) < 0.5 ? 2 : 3)]);
      }
      put(T.BRICK, t);
    }

    // --- stone bricks
    const stoneBricksL = (seed, crackSeed = 0) => {
      const L = lv(), sl = stoneL(seed, 0.42, 0.62);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const course = y < 8 ? 0 : 1, yy = y % 8;
        const jx = course === 0 ? 15 : 7;
        const xx = md(x - jx - 1, 16);
        if (yy === 7 || x === jx) { L[I(x, y)] = 0; continue; }
        let l = sl[I(x, y)] + 1;
        if (yy === 0 || xx === 0) l = 6;
        else if (yy === 6 || xx === 14) l = 1;
        else l = ci(l, 2, 5);
        L[I(x, y)] = l;
      }
      if (crackSeed) {
        let x = 3, y = 9;
        const rand = rng(crackSeed);
        for (let k = 0; k < 9; k++) { L[I(x, y)] = 0; x += rand() < 0.6 ? 1 : 0; y += rand() < 0.5 ? 1 : -1; y = ci(y, 8, 13); }
      }
      return L;
    };
    put(T.STONE_BRICKS, paint(stoneBricksL(52), P.sbrick));

    // --- metal and gem blocks
    {
      // iron: brushed plate, split in two with a riveted seam
      const L = lv();
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const v = vn(x, y, 16, 1, 48) * 0.7 + vn(x, y, 4, 1, 49) * 0.3;
        L[I(x, y)] = v < 0.4 ? 3 : v < 0.65 ? 4 : 5;
      }
      for (let i = 1; i < 15; i++) { L[I(i, 7)] = 2; L[I(i, 8)] = 6; }
      blockFrame(L, 1);
      for (const [x, y] of [[3, 3], [12, 3], [3, 11], [12, 11]]) { L[I(x, y)] = 1; L[I(x - 1, y - 1)] = 6; L[I(x, y - 1)] = 5; L[I(x + 1, y)] = 2; }
      put(T.IRON_BLOCK, paint(L, P.iron));
    }
    const gemBlock = (pal, seed, facet) => {
      const L = lv();
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        let l = 3 + (vn(x, y, 4, 4, seed) > 0.55 ? 1 : 0);
        l += facet(x, y);
        L[I(x, y)] = l;
      }
      blockFrame(L, 1);
      return paint(L, pal);
    };
    put(T.GOLD_BLOCK, gemBlock(P.gold, 49, (x, y) => {
      const d = md(x + y, 16);
      return (d === 5 || d === 6) && x > 1 && y > 1 && x < 14 && y < 14 ? 2 : d === 11 ? 1 : (x - y === 0 ? -1 : 0);
    }));
    put(T.DIAMOND_BLOCK, gemBlock(P.diamond, 50, (x, y) => {
      const a = md(x + y, 8), b = md(x - y, 8);
      return a === 0 ? 2 : b === 0 ? -2 : (a === 1 ? 1 : (b === 7 ? -1 : 0));
    }));
    if (has('EMERALD_BLOCK')) put(T.EMERALD_BLOCK, gemBlock(P.emerald, 147, (x, y) => {
      const cx = md(x, 5), cy = md(y, 5);
      return cx === 0 || cy === 0 ? -2 : (cx === 1 || cy === 1 ? 1 : 0);
    }));
    if (has('LAPIS_BLOCK')) {
      const L = lv();
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const v = vn(x, y, 4, 4, 266) * 0.6 + vn(x, y, 2, 2, 267) * 0.4;
        L[I(x, y)] = v < 0.35 ? 2 : v < 0.6 ? 3 : 4;
        if (ih(x, y, 268) < 0.05) L[I(x, y)] = 5;
      }
      blockFrame(L, 1);
      const t = paint(L, P.lapis);
      for (const [x, y] of [[4, 5], [11, 3], [9, 11], [3, 12]]) t.set(x, y, [214, 182, 76]); // pyrite flecks
      put(T.LAPIS_BLOCK, t);
    }
    if (has('REDSTONE_BLOCK')) {
      const L = lv();
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const cx = md(x, 4) - 1.5, cy = md(y + (Math.floor(x / 4) % 2) * 2, 4) - 1.5;
        const d = Math.hypot(cx, cy);
        L[I(x, y)] = d < 0.8 ? 5 : d < 1.6 ? 3 : 2;
        if (d < 0.8 && cx < 0 && cy < 0) L[I(x, y)] = 6;
      }
      blockFrame(L, 0);
      put(T.REDSTONE_BLOCK, paint(L, P.redstone));
    }

    // --- wool
    put(T.WOOL_WHITE, wool([234, 236, 236], 22));
    put(T.WOOL_RED, wool([164, 42, 38], 23));
    put(T.WOOL_BLUE, wool([52, 62, 160], 24));
    put(T.WOOL_YELLOW, wool([232, 196, 48], 25));
    put(T.WOOL_BLACK, wool([30, 30, 34], 26));
    put(T.WOOL_GREEN, wool([84, 110, 30], 27));

    // --- obsidian: glassy shards with purple glints
    const obsidianT = (() => {
      // near-black glass with a few purple glints and soft violet clouding
      const L = lv();
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const v = vn(x, y, 8, 4, 25) * 0.5 + vn(x, y, 4, 2, 26) * 0.35 + vn(x, y, 2, 2, 27) * 0.15;
        L[I(x, y)] = v < 0.4 ? 1 : v < 0.6 ? 2 : 3;
      }
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (L[I(x, y)] < L[I(x, y - 1)]) L[I(x, y)] = 0;
      for (const [x, y, len] of [[2, 3, 3], [10, 1, 2], [12, 9, 3], [5, 11, 2], [8, 6, 2], [1, 14, 2]]) {
        for (let k = 0; k < len; k++) L[I(x + k, y - k)] = k === len - 1 ? 6 : 5;
        L[I(x - 1, y + 1)] = 4;
      }
      return paint(L, P.obsidian);
    })();
    put(T.OBSIDIAN, obsidianT);

    // --- cactus
    {
      const L = lv();
      const rib = [1, 4, 3, 2];
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        let l = rib[md(x - 1, 4)] + (vn(x, y, 1, 4, 26) > 0.6 ? 1 : 0);
        if (x === 0 || x === 15) l = 0;
        L[I(x, y)] = l;
      }
      const t = paint(L, P.cactus);
      for (const [x, y] of [[2, 2], [6, 6], [10, 3], [14, 9], [2, 11], [6, 14], [10, 12], [14, 1]]) { t.set(x, y, [24, 30, 16]); t.set(x, y - 1, [226, 222, 186]); }
      put(T.CACTUS_SIDE, t);
      const L2 = lv();
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
        let l = d > 6.6 ? 1 : d > 5.6 ? 4 : d > 3.5 ? 3 : d > 1.6 ? 4 : 5;
        if ((x === 7 || x === 8 || y === 7 || y === 8) && d > 1.6 && d < 5.6) l = 2;
        L2[I(x, y)] = l;
      }
      put(T.CACTUS_TOP, paint(L2, P.cactus));
    }

    // --- bookshelf
    {
      const t = planksT(P.oakPl, 28, [5, 13, 9, 2]);
      const shelf = (y0) => {
        let x = 0;
        const rand = rng(281 + y0);
        const bc = hx('8c2a22 a83a2e 2c4a8c 3c62aa 2e6a34 418a44 6e4a22 8e6630 5e2a6a 7a3e88 b09040 c8a858');
        while (x < N) {
          const w = rand() < 0.75 ? 2 : (rand() < 0.5 ? 1 : 3);
          const h = 6 - Math.floor(rand() * 3);
          const ci2 = Math.floor(rand() * 6) * 2, band = rand() < 0.55;
          for (let dx = 0; dx < w && x + dx < N; dx++) for (let y = y0; y < y0 + 6; y++) {
            const top = y0 + 6 - h;
            if (y < top) { t.set(x + dx, y, [38, 26, 14]); continue; }
            let c = bc[ci2 + (dx === 0 ? 1 : 0)];
            if (dx === w - 1 && w > 1) c = mul(c, 0.78);
            if (y === top + 1 && h > 4 && band) c = mix(c, [236, 206, 120], 0.6);
            t.set(x + dx, y, c);
          }
          x += w;
          if (rand() < 0.15 && x < N) { for (let y = y0; y < y0 + 6; y++) t.set(x, y, [38, 26, 14]); x++; }
        }
      };
      shelf(1); shelf(9);
      for (let x = 0; x < N; x++) { t.set(x, 0, P.oakPl[4]); t.set(x, 7, P.oakPl[3]); t.set(x, 8, P.oakPl[1]); t.set(x, 15, P.oakPl[0]); }
      put(T.BOOKSHELF, t);
    }

    // --- TNT
    {
      const side = mk(), stick = hx('7e140e a62218 c9301f de4630 ef6a50');
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const k = md(x, 4);
        let l = [0, 4, 3, 2][k];
        if (y === 0 || y === 15) l = Math.max(0, l - 1);
        side.set(x, y, stick[l]);
      }
      const wb = hx('2a2a2a b9b5ac dedbd2 f4f2ec');
      for (let x = 0; x < N; x++) { side.set(x, 5, wb[1]); side.set(x, 10, wb[1]); for (let y = 6; y < 10; y++) side.set(x, y, wb[y === 6 ? 3 : 2]); }
      stamp(side, 2, 6, ['###.#..#.###', '.#..##.#..#.', '.#..#.##..#.', '.#..#..#..#.'], { '#': wb[0] });
      put(T.TNT_SIDE, side);
      const top = mk();
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const cx = md(x, 4) - 1.5, cy = md(y, 4) - 1.5, d = Math.hypot(cx, cy);
        top.set(x, y, d > 2 ? stick[0] : d > 1.2 ? stick[2] : (cx < 0 && cy < 0 ? stick[4] : stick[3]));
      }
      rect(top, 6, 6, 9, 9, [60, 60, 60]);
      rect(top, 7, 7, 8, 8, [30, 30, 30]);
      top.set(7, 6, [120, 120, 120]); top.set(6, 7, [100, 100, 100]);
      put(T.TNT_TOP, top);
    }

    // --- pumpkin
    {
      const L = lv(), rib = [0, 5, 4, 3, 3, 2];
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        let l = rib[md(x - 1, 6)] + (vn(x, y, 1, 8, 31) > 0.62 ? 1 : 0);
        if (md(x - 1, 6) !== 0 && (y === 0 || y === 15)) l -= 1;
        L[I(x, y)] = l;
      }
      const side = paint(L, P.pumpkin);
      put(T.PUMPKIN, side);
      const face = side.clone(), cut = [62, 26, 4], rim = [140, 62, 8];
      stamp(face, 3, 4, ['...#', '..##', '.###'], { '#': cut });
      stamp(face, 9, 4, ['#...', '##..', '###.'], { '#': cut });
      stamp(face, 3, 9, ['#........#', '##########', '.##.##.##.', '..........'], { '#': cut });
      for (const [x, y] of [[6, 3], [9, 3], [3, 8], [12, 8]]) face.set(x, y, rim);
      put(T.PUMPKIN_FACE, face);
      const top = mk();
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const dx = Math.abs(x - 7.5), dy = Math.abs(y - 7.5), d = Math.hypot(dx, dy);
        const groove = d > 2.5 && (dx < 0.6 || dy < 0.6 || Math.abs(dx - dy) < 0.6); // eight ribs
        let l = (d < 3.5 ? 5 : d < 5.5 ? 4 : 3) - (groove ? 2 : 0);
        if (Math.max(dx, dy) > 7) l = Math.min(l, 2);
        top.set(x, y, P.pumpkin[ci(l, 0, 6)]);
      }
      stamp(top, 6, 6, ['.ab.', 'abbc', 'bbcc', '.cc.'], { a: [128, 160, 70], b: [92, 122, 44], c: [62, 86, 30] });
      put(T.PUMPKIN_TOP, top);
    }

    // --- crafting table
    {
      const pl = P.oakPl;
      const top = mk();
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const v = vn(x, y, 8, 1, 37) * 0.7 + ih(x, y, 38) * 0.3;
        top.set(x, y, pl[v < 0.3 ? 2 : v < 0.75 ? 3 : 4]);
      }
      for (let i = 0; i < N; i++) { top.set(i, 0, pl[1]); top.set(0, i, pl[1]); top.set(i, 15, pl[0]); top.set(15, i, pl[0]); top.set(i, 1, pl[5]); top.set(1, i, pl[5]); top.set(i, 14, pl[1]); top.set(14, i, pl[1]); }
      for (let i = 2; i < 14; i++) for (const g of [5, 10]) { top.set(i, g, P.wood[1]); top.set(g, i, P.wood[1]); }
      for (let i = 2; i < 14; i++) for (const g of [6, 11]) { if (i !== 5 && i !== 10) { top.set(i, g, pl[5]); top.set(g, i, pl[5]); } }
      put(T.CT_TOP, top);
      const side = planksT(pl, 38, [4, 11, 7, 14]);
      for (let x = 0; x < N; x++) { side.set(x, 0, pl[5]); side.set(x, 1, P.wood[3]); side.set(x, 2, P.wood[2]); side.set(x, 3, P.wood[0]); }
      const front = side.clone();
      // saw on the side
      const metal = hx('4e5258 8a9098 c2c8ce e6eaee');
      stamp(side, 2, 5, ['hh.', 'hmm', 'hmmm', 'hmmd', 'hmmd', 'hmmd', 'hmd.', 'hd..'], { h: metal[3], m: metal[2], d: metal[1] });
      stamp(side, 2, 13, ['bb', 'bb'], { b: P.wood[1] });
      for (const y of [6, 8, 10, 12]) side.set(5, y, metal[0]);
      // hammer on the side
      stamp(side, 9, 5, ['hmmmd', 'mmmmd'], { h: metal[3], m: metal[2], d: metal[0] });
      for (let y = 7; y < 14; y++) { side.set(11, y, P.wood[4]); side.set(12, y, P.wood[1]); }
      put(T.CT_SIDE, side);
      // front: a pickaxe and a pair of shears hanging on the rack
      stamp(front, 2, 5, ['.ohhhhho.', 'oh.....mo', 'o...bB..o', '....bB...', '....bB...', '....bB...', '....bB...', '....oo...'], { o: metal[0], h: metal[3], m: metal[2], b: P.wood[4], B: P.wood[1] });
      stamp(front, 11, 5, ['hoh', 'mom', '.m.', 'r.r', 'r.r', 'rr.'], { h: metal[3], m: metal[2], o: metal[0], r: [160, 40, 34] });
      put(T.CT_FRONT, front);
    }

    // --- furnace
    {
      const body = (seed) => {
        const L = stoneL(seed, 0.45, 0.65);
        for (let i = 0; i < 256; i++) L[i] = ci(L[i], 1, 4) + 1;
        return L;
      };
      const pal = hx('2c2c2c 4f4f4f 6a6a6a 7b7b7b 8a8a8a 999999 adadad');
      const sideL = body(40);
      for (let x = 0; x < N; x++) { sideL[I(x, 0)] = 6; sideL[I(x, 1)] = 5; sideL[I(x, 2)] = 2; sideL[I(x, 15)] = 1; }
      for (let y = 3; y < 15; y++) { sideL[I(0, y)] = Math.min(sideL[I(0, y)], 5); }
      const side = paint(sideL, pal);
      put(T.FURNACE_SIDE, side);
      const topL = body(41);
      for (let i = 0; i < N; i++) { topL[I(i, 0)] = 6; topL[I(0, i)] = 6; topL[I(i, 15)] = 1; topL[I(15, i)] = 1; topL[I(i, 1)] = 5; topL[I(1, i)] = 5; topL[I(i, 14)] = 2; topL[I(14, i)] = 2; }
      put(T.FURNACE_TOP, paint(topL, pal));
      const frontL = sideL.slice();
      // hearth opening with a lintel and a grate
      for (let x = 2; x < 14; x++) { frontL[I(x, 6)] = 6; frontL[I(x, 7)] = 4; frontL[I(x, 8)] = 1; }
      const front = paint(frontL, pal);
      const hole = hx('0d0d0d 161616 1f1f1f 2b2b2b');
      for (let y = 9; y < 15; y++) for (let x = 3; x < 13; x++) front.set(x, y, hole[y < 10 ? 0 : y > 13 ? 2 : 1]);
      for (let y = 9; y < 15; y++) { front.set(2, y, pal[1]); front.set(13, y, pal[5]); }
      for (let x = 2; x < 14; x++) front.set(x, 15, pal[1]);
      for (const x of [4, 7, 10]) front.set(x, 13, hole[3]);
      put(T.FURNACE_FRONT, front);
      const lit = front.clone();
      const fire = hx('6e1a04 b83a0a e8640f f8962a ffc95a fff0b0');
      for (let y = 9; y < 15; y++) for (let x = 3; x < 13; x++) lit.set(x, y, y < 11 ? [58, 14, 4] : [86, 22, 6]); // glowing back wall
      for (let y = 9; y < 15; y++) for (let x = 3; x < 13; x++) {
        const hgt = 15 - y;
        const tongue = 3 + vn(x, 0, 1, 16, 43) * 3;
        if (hgt > tongue + 0.5) continue;
        const k = ci(Math.floor(5 - (hgt / tongue) * 4 + (ih(x, y, 44) < 0.25 ? 1 : 0)), 0, 5);
        lit.set(x, y, fire[5 - k]);
      }
      for (let x = 3; x < 13; x++) lit.set(x, 14, fire[x % 3 === 0 ? 3 : 4]);
      for (let x = 2; x < 14; x++) lit.set(x, 8, mix(pal[1], fire[2], 0.35));
      put(T.FURNACE_LIT, lit);
    }

    // --- chest (cube): wooden box with iron-trimmed lid and a latch
    {
      const pal = P.chest;
      const wood = (seed) => {
        const L = lv(), rand = rng(seed);
        for (let y = 0; y < N; y++) {
          for (let x = 0; x < N; x++) L[I(x, y)] = 4;
          if (y % 4 === 3) for (let x = 0; x < N; x++) L[I(x, y)] = 3;
          const x0 = Math.floor(rand() * N), len = 2 + Math.floor(rand() * 5);
          for (let k = 0; k < len; k++) L[I(x0 + k, y)] = 3;
          if (rand() < 0.5) L[I(Math.floor(rand() * N), y)] = 5;
        }
        return L;
      };
      const frame = (L, seam) => {
        for (let i = 0; i < N; i++) { L[I(i, 0)] = 1; L[I(0, i)] = 1; L[I(i, 15)] = 0; L[I(15, i)] = 0; L[I(i, 1)] = Math.max(L[I(i, 1)], 5); L[I(1, i)] = Math.max(L[I(1, i)], 5); }
        if (seam) for (let x = 0; x < N; x++) { L[I(x, 5)] = 0; L[I(x, 6)] = 6; L[I(x, 4)] = 2; }
      };
      const topL = wood(44); frame(topL, false);
      put(T.CHEST_TOP, paint(topL, pal));
      const sideL = wood(45); frame(sideL, true);
      put(T.CHEST_SIDE, paint(sideL, pal));
      const frontL = wood(46); frame(frontL, true);
      const front = paint(frontL, pal);
      stamp(front, 6, 3, ['dddd', 'dhmd', 'dmmd', 'dmmd', 'dmmd', 'dddd'], { d: [48, 48, 52], h: [230, 232, 236], m: [168, 172, 178] });
      put(T.CHEST_FRONT, front);
    }

    // --- plants (cutout)
    {
      const g = P.grass;
      const t = mk(), rand = rng(47);
      const bases = [1, 2, 4, 5, 7, 8, 9, 11, 12, 14];
      bases.forEach((bx, k) => {
        const h = [9, 13, 7, 14, 11, 15, 8, 12, 10, 6][k];
        const lean = (bx < 7 ? -1 : 1) * (0.4 + rand() * 1.1) * (k % 3 === 0 ? -0.6 : 1);
        blade(t, bx, h, lean, k % 2 ? [g[0], g[2], g[4]] : [g[1], g[3], g[5]]);
      });
      put(T.TALL_GRASS, t);
      const flower = (tile, petals, center, shape) => {
        const f = mk();
        const st = hx('2d5e1c 3f7d26 58a034');
        for (let y = 8; y < 16; y++) { f.set(7, y, st[1]); }
        stamp(f, 4, 10, ['aa.....', '.ab....', '..b.ba.', '....bba'], { a: st[2], b: st[1] });
        stamp(f, 4, 2, shape, { h: petals[2], m: petals[1], d: petals[0], c: center });
        return f;
      };
      put(T.DANDELION, flower(T.DANDELION, hx('c89a10 f2cf2a fff07a'), [222, 160, 18], ['..hh..', '.hmmm.', 'hmcmmd', 'hmmmmd', '.mmmd.', '..dd..']));
      put(T.POPPY, flower(T.POPPY, hx('8c0f12 c81e1e ee5a4c'), [36, 24, 14], ['.h..h.', 'hmmhmm', 'mmccmd', 'hmccmd', '.mmmd.', '..dd..']));
      // torches: two-pixel stick, bright flame on top (rows 6-7), glowing tip (row 8)
      const torch = (tile, flame) => {
        const q = mk();
        for (let y = 9; y < 16; y++) { q.set(7, y, [150, 112, 62]); q.set(8, y, [104, 76, 40]); }
        q.set(7, 6, flame[0]); q.set(8, 6, flame[1]); q.set(7, 7, flame[2]); q.set(8, 7, flame[3]); q.set(7, 8, flame[4]); q.set(8, 8, flame[5]);
        put(tile, q);
      };
      torch(T.TORCH, hx('fffbe0 fff0a8 ffd860 ffb030 d88a2a a86a26'));
      if (has('RTORCH_ON')) {
        torch(T.RTORCH_ON, hx('ffb0a0 ff7058 ff2a14 d81a10 a0261a 7a1e14'));
        torch(T.RTORCH_OFF, hx('8a3028 6a2018 5a1a12 44140e 5e3a22 4a2c18'));
      }
      // sapling
      const sp = mk();
      for (let y = 9; y < 16; y++) { sp.set(7, y, [108, 80, 44]); sp.set(8, y, [84, 62, 34]); }
      const lp = P.oakLeaf;
      stamp(sp, 3, 1, ['...hm....', '..hmmd...', '.hmmmmd..', 'hmmdmmmd.', '.mdd.hmmd', '..d.hmmmd', '...hmmmd.', '....mdd..', '.....d...'], { h: lp[5], m: lp[3], d: lp[1] });
      stamp(sp, 3, 6, ['hm.', 'mmd', '.d.'], { h: lp[4], m: lp[2], d: lp[0] });
      put(T.SAPLING, sp);
    }

    // --- light sources
    {
      const C = cells(46, 10, 3.8, 0.75, 1.1);
      const L = lv();
      for (let i = 0; i < 256; i++) {
        const r = C.R[i];
        if (r < 0) { L[i] = 1; continue; }
        const q = C.W.d1[i] / Math.max(1.5, C.nn[r] * 0.55);
        L[i] = q < 0.35 ? 6 : q < 0.65 ? 5 : q < 0.95 ? 4 : 3;
        if (C.W.ox[i] > 0.8 && C.W.oy[i] > 0.8) L[i] = Math.max(2, L[i] - 1);
      }
      put(T.GLOWSTONE, paint(L, P.glow));
    }
    if (has('LAMP_OFF')) {
      const lamp = (on) => {
        const t = mk();
        const fr = hx('2c1a0c 4a2e16 6a4424 875a30');
        const glass = on ? hx('c86a1e eda03c ffd27a ffeeb8 fffbe8') : hx('2a1a10 3e2818 573a22 70502e 8a6a40');
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          const fx = x === 0 || x === 15 || x === 7 || x === 8, fy = y === 0 || y === 15 || y === 7 || y === 8;
          if (fx || fy) { t.set(x, y, fr[(x === 0 || y === 0 || x === 8 || y === 8) ? 3 : (x === 7 || y === 7) ? 0 : 1]); continue; }
          const px = x < 8 ? x - 1 : x - 9, py = y < 8 ? y - 1 : y - 9; // 0..5 inside each pane
          const d = Math.hypot(px - 2.5, py - 2.5);
          let l = on ? (d < 1.2 ? 4 : d < 2.4 ? 3 : 2) : (d < 1.6 ? 2 : 1);
          if (Math.abs(px - py) === 0 && px < 4) l += 1;
          if (px === 5 || py === 5) l -= 1;
          t.set(x, y, glass[ci(l, 0, 4)]);
        }
        return t;
      };
      put(T.LAMP_OFF, lamp(false));
      put(T.LAMP_ON, lamp(true));
    }

    // --- sandstone
    {
      const pal = P.sandstone, side = lv();
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const n = vn(x, y, 4, 1, 51);
        let l;
        if (y < 3) l = y === 0 ? 5 : 4;
        else if (y === 3) l = 2;
        else if (y < 12) l = [3, 4, 3, 2, 3, 4, 3, 2][y - 4] + (n > 0.7 ? 1 : n < 0.25 ? -1 : 0);
        else l = 2 + (y === 12 ? 1 : 0) - (y === 15 ? 1 : 0) + (n > 0.65 ? 1 : 0);
        side[I(x, y)] = l;
      }
      for (let x = 0; x < N; x++) if (vn(x, 0, 2, 16, 52) > 0.6) side[I(x, 11)] = 1;
      put(T.SANDSTONE_SIDE, paint(side, pal));
      const top = sandL(57, 1);
      put(T.SANDSTONE_TOP, paint(top, pal));
    }

    // --- nether
    const netherL = (seed) => {
      const C = cells(seed, 16, 3.0, 0.7, 0.9);
      const L = cellLevels(C, 2, 3, 1, 1, -1);
      for (let i = 0; i < 256; i++) if (ih(i, 3, seed) < 0.06) L[i] = 0;
      return L;
    };
    const netherT = paint(netherL(700), P.nether);
    put(T.NETHERRACK, netherT);
    {
      const L = lv();
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const v = vn(x, y, 4, 4, 701) * 0.6 + vn(x, y, 2, 2, 702) * 0.4;
        L[I(x, y)] = v < 0.35 ? 2 : v < 0.62 ? 3 : 4;
      }
      // trapped souls: two eyes and an open mouth with a lit rim
      const faces = [['4.4', '1.1', '...', '.4.', '.0.'], ['4..4', '0..0', '....', '.44.', '.10.'], ['4.4', '0.1', '...', '414', '.0.']];
      [[2, 2, 0], [10, 4, 1], [5, 10, 2], [13, 11, 0]].forEach(([fx, fy, f]) => {
        faces[f].forEach((r, dy) => { for (let dx = 0; dx < r.length; dx++) if (r[dx] !== '.') L[I(fx + dx, fy + dy)] = +r[dx]; });
      });
      put(T.SOUL_SAND, paint(L, P.soul));
    }
    put(T.QUARTZ_ORE, ore(netherT, hx('b8aaa0 eae2da ffffff'), 702, 6, [['hm', 'mmd', '.md'], ['.h', 'hmd', 'md'], ['hmm', '.md'], ['h.', 'md', 'm.', 'd.']], [70, 22, 24]));
    {
      const L = lv();
      for (let c = 0; c < 4; c++) {
        const y0 = c * 4, off = c % 2 ? 4 : 0;
        for (let x = 0; x < N; x++) {
          const xx = md(x - off, 8);
          for (let dy = 0; dy < 4; dy++) {
            let l;
            if (dy === 3 || xx === 7) l = 0;
            else if (dy === 0 || xx === 0) l = 4;
            else if (dy === 2 || xx === 6) l = 2;
            else l = 3;
            if (l === 3 && ih(x, y0 + dy, 703) < 0.2) l = 2;
            L[I(x, y0 + dy)] = l;
          }
        }
      }
      put(T.NETHER_BRICKS, paint(L, P.nbrick));
    }

    // --- fluids (no animation frames in this atlas)
    {
      const C = cells(704, 8, 4.6, 0.6, 1.4);
      const L = lv();
      for (let i = 0; i < 256; i++) {
        const x = i & 15, y = i >> 4;
        const crust = C.W.d2[i] - C.W.d1[i];
        const v = vn(x, y, 4, 4, 705);
        let l = crust < 0.8 ? 1 : crust < 1.8 ? 3 : 5;
        if (C.W.d1[i] < 1.4) l = 6;
        if (v > 0.7) l += 1; else if (v < 0.25) l -= 1;
        if (C.W.d1[i] < 0.6) l = 7;
        L[i] = l;
      }
      put(T.LAVA, paint(L, P.lava));
    }
    {
      const L = lv();
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const wob = Math.sin((x / N) * Math.PI * 4) * 1.3 + (vn(x, y, 8, 4, 9) - 0.5) * 2.5;
        const w = Math.sin(((y + wob) / N) * Math.PI * 2 * 3);
        const v = vn(x, y, 4, 2, 10);
        let l = (v < 0.45 ? 2 : 3) + (w > 0.9 ? 1 : 0);
        if (w > 0.9 && v > 0.62) l = 5;
        else if (w < -0.85 && v < 0.5) l = 1;
        L[I(x, y)] = l;
      }
      put(T.WATER, paint(L, P.water));
    }
    {
      // portal: swirling bands, keeps its 190 alpha
      const t = mk();
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const a = vn(x, y, 8, 8, 705) * 6.28, b = vn(x, y, 4, 4, 706);
        const v = Math.sin((x + y) / N * Math.PI * 4 + a * 1.4) * 0.6 + b * 0.8;
        const l = ci(Math.floor((v + 0.6) * 3.2), 0, 6);
        t.set(x, y, P.portal[l], 190);
      }
      put(T.PORTAL, t);
    }

    // --- farming
    {
      // tilled rows: lumpy ridges with a shaded furrow between them, clods on top
      const L = lv();
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const r = md(y + (vn(x, 0, 8, 16, 706) > 0.6 ? 1 : 0), 4), v = vn(x, y, 2, 2, 707) * 0.6 + ih(x, y, 708) * 0.4;
        let l = [3, 4, 3, 1][r] + (v > 0.75 ? 1 : v < 0.25 ? -1 : 0);
        if (r === 3 && v > 0.7) l = 2;
        L[I(x, y)] = l;
      }
      for (const [px, py] of scatter(rng(709), 8, 4)) { const x = Math.floor(px), y = Math.floor(py); L[I(x, y)] = 5; L[I(x + 1, y + 1)] = 0; }
      put(T.FARMLAND_TOP, paint(L, P.farm));
      const crop = (s) => {
        const t = mk(), rand = rng(707 + s);
        const green = hx('2d5e1c 3f7d26 58a034 7cc04a');
        const gold = hx('6e5016 9c7a2a c9a03e e3c25e f2dc8e');
        const xs = s === 0 ? [2, 6, 10, 13] : [1, 5, 9, 13];
        xs.forEach((x0, k) => {
          const h = [3, 6, 10, 10][s] - (k % 2) * (s ? 2 : 1);
          const cols = s < 3 ? green : gold;
          let x = x0;
          for (let k2 = 0; k2 < h; k2++) {
            const y = 15 - k2;
            t.set(x, y, s < 3 ? cols[k2 < 2 ? 1 : 2 + (k2 > h - 3 ? 1 : 0)] : cols[k2 < 2 ? 1 : 2]);
            if (s < 3 && k2 === Math.floor(h / 2)) t.set(x + (k % 2 ? 1 : -1), y - 1, cols[3]);
            if (s < 3 && h > 6 && k2 === h - 3) t.set(x + (k % 2 ? -1 : 1), y - 1, cols[2]);
            if (rand() < 0.15 && k2 > 1 && k2 < h - 2) x = ci(x + (k % 2 ? 1 : -1), x0 - 1, x0 + 1);
          }
          if (s === 3) {
            // ear of wheat: zigzag kernels around a darker stem
            const top = 15 - h - 5;
            stamp(t, x - 1, top, ['.h.', 'hmh', 'mdm', 'hmh', 'mdm', '.d.'], { h: gold[4], m: gold[3], d: gold[1] });
            t.set(x + (k % 2 ? 1 : -1), 15 - Math.floor(h / 2), gold[2]);
          }
        });
        return t;
      };
      for (let s = 0; s < 4; s++) put(T.WHEAT0 + s, crop(s));
      // hay
      const hp = P.hay;
      const side = mk();
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const v = vn(x, y, 1, 4, 719) * 0.7 + ih(x, y, 720) * 0.3;
        side.set(x, y, hp[v < 0.3 ? 2 : v < 0.55 ? 3 : v < 0.8 ? 4 : 5]);
      }
      for (const y0 of [2, 12]) for (let x = 0; x < N; x++) { side.set(x, y0, P.band[2]); side.set(x, y0 + 1, P.band[x % 4 === 0 ? 0 : 1]); }
      put(T.HAY_SIDE, side);
      const top = mk();
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const v = vn(x, y, 2, 2, 718) * 0.6 + ih(x, y, 719) * 0.4;
        let l = v < 0.35 ? 3 : v < 0.6 ? 4 : v < 0.85 ? 5 : 6;
        if (md(x + 2 * y, 5) === 0) l = 2;
        if (md(x - y, 7) === 0 && l > 3) l = 6;
        if (x === 0 || y === 0 || x === 15 || y === 15) l = 1;
        top.set(x, y, hp[l]);
      }
      for (const x0 of [2, 12]) for (let x = x0; x < x0 + 2; x++) { top.set(x, 0, P.band[1]); top.set(x, 15, P.band[0]); }
      put(T.HAY_TOP, top);
    }

    // --- door (top keeps its window holes)
    {
      const pl = P.oakPl;
      const door = (isTop) => {
        const t = planksT(pl, isTop ? 712 : 713, [16, 16, 16, 16]);
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          // vertical boards instead of horizontal
          const b = md(x, 4) === 3;
          const v = vn(x, y, 1, 8, 714 + (isTop ? 1 : 0));
          t.set(x, y, pl[b ? 1 : v < 0.3 ? 2 : v < 0.8 ? 3 : 4]);
        }
        for (let y = 0; y < N; y++) { t.set(0, y, pl[4]); t.set(1, y, pl[3]); t.set(14, y, pl[2]); t.set(15, y, pl[0]); }
        if (isTop) {
          for (let x = 0; x < N; x++) { t.set(x, 0, pl[5]); t.set(x, 1, pl[3]); t.set(x, 8, pl[4]); t.set(x, 9, pl[1]); }
          for (const x0 of [3, 9]) {
            for (let y = 2; y < 7; y++) for (let x = x0; x < x0 + 4; x++) t.set(x, y, [0, 0, 0], 0);
            for (let x = x0 - 1; x < x0 + 5; x++) { t.set(x, 7, pl[5]); }
            for (let y = 2; y < 7; y++) { t.set(x0 - 1, y, pl[1]); t.set(x0 + 4, y, pl[4]); }
          }
        } else {
          for (let x = 0; x < N; x++) { t.set(x, 14, pl[1]); t.set(x, 15, pl[0]); }
          for (let y = 4; y < 12; y++) for (let x = 3; x < 13; x++) {
            const e = y === 4 || x === 3 ? 5 : y === 11 || x === 12 ? 1 : 3;
            t.set(x, y, pl[e]);
          }
          t.set(12, 2, [70, 70, 74]); t.set(12, 3, [140, 140, 146]); t.set(11, 2, [40, 40, 44]);
        }
        return t;
      };
      put(T.DOOR_TOP, door(true));
      put(T.DOOR_BOTTOM, door(false));
    }

    // --- bed: blanket on top, pillow at the head, frame + legs on the side (rows 7-15)
    {
      const rp = P.red, wp = P.white, wd2 = P.wood;
      const blanket = (t, y0, y1) => {
        for (let y = y0; y <= y1; y++) for (let x = 0; x < N; x++) {
          let l = 3;
          if (md(x + y, 6) === 0) l = 2; // quilt stitching
          if (x === 0 || x === 15) l = 1;
          if (x === 1 || x === 14) l = Math.min(l, 2);
          t.set(x, y, rp[l]);
        }
      };
      const foot = mk();
      blanket(foot, 0, 15);
      for (let x = 0; x < N; x++) { foot.set(x, 13, rp[5]); foot.set(x, 14, rp[4]); foot.set(x, 15, rp[1]); }
      put(T.BED_FOOT, foot);
      const head = mk();
      blanket(head, 7, 15);
      for (let y = 0; y < 7; y++) for (let x = 0; x < N; x++) head.set(x, y, wp[x === 0 || x === 15 ? 1 : 2]);
      for (let y = 1; y < 6; y++) for (let x = 2; x < 14; x++) {
        const corner = (y === 1 || y === 5) && (x === 2 || x === 13);
        if (corner) continue;
        head.set(x, y, wp[y === 1 || x === 2 ? 5 : y === 5 || x === 13 ? 3 : 4]);
      }
      for (let x = 0; x < N; x++) { head.set(x, 7, wp[4]); head.set(x, 8, rp[5]); }
      put(T.BED_HEAD, head);
      const bedSide = (isHead) => {
        const t = mk();
        for (let x = 0; x < N; x++) {
          t.set(x, 7, isHead ? wp[4] : rp[4]); t.set(x, 8, rp[3]); t.set(x, 9, rp[1]);
          t.set(x, 10, wd2[4]); t.set(x, 11, wd2[3]); t.set(x, 12, wd2[1]);
        }
        for (let y = 13; y < 16; y++) for (const x of [0, 1, 2, 13, 14, 15]) t.set(x, y, wd2[x === 0 || x === 13 ? 3 : x === 2 || x === 15 ? 1 : 2]);
        return t;
      };
      put(T.BED_SIDE, bedSide(false));
      put(T.BED_SIDE_HEAD, bedSide(true));
    }

    // --- dirt path
    {
      const L = lv();
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const v = vn(x, y, 4, 4, 722) * 0.6 + vn(x, y, 2, 2, 723) * 0.4;
        L[I(x, y)] = v < 0.35 ? 2 : v < 0.65 ? 3 : 4;
      }
      for (const [px, py] of scatter(rng(724), 9, 4)) { const x = Math.floor(px), y = Math.floor(py); L[I(x, y)] = 5; L[I(x + 1, y + 1)] = 1; }
      put(T.PATH_TOP, paint(L, P.path));
      const side = fringeSide(723, dirtT, P.path, () => 3, (x, y) => (y === 2 ? 2 : 3 + (ih(x, y, 725) < 0.3 ? 1 : 0)));
      for (let x = 0; x < N; x++) side.set(x, 0, [0, 0, 0], 0); // the block is 15/16 tall
      put(T.PATH_SIDE, side);
    }

    // --- mossy cobblestone: moss creeping through the mortar and over stone tops
    {
      const t = cobbleT.clone();
      const moss = hx('1f3512 2b4818 395e20 4a7428 5b8832 6f9e3e');
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const c = t.get(x, y), g = (c[0] - 50) / 120; // 0 = mortar .. 1 = lit stone
        const v = vn(x, y, 8, 8, 151) * 0.6 + vn(x, y, 4, 4, 152) * 0.4;
        const inGap = c[0] < 90;
        if (v < (inGap ? 0.38 : 0.52)) continue;
        if (!inGap && ih(x, y, 153) < 0.25) continue;
        t.set(x, y, moss[ci(Math.round(g * 4) + (v > 0.66 ? 1 : 0), 0, 5)]);
      }
      put(T.MOSSY_COBBLE, t);
    }

    // --- ladder
    if (has('LADDER')) {
      const t = mk(), w = P.wood;
      for (let y = 0; y < N; y++) { t.set(2, y, w[4]); t.set(3, y, w[2]); t.set(12, y, w[4]); t.set(13, y, w[2]); }
      for (const y of [1, 5, 9, 13]) for (let x = 4; x < 12; x++) { t.set(x, y, w[5]); t.set(x, y + 1, w[2]); }
      for (const y of [1, 5, 9, 13]) { t.set(3, y, w[0]); t.set(12, y + 1, w[1]); }
      put(T.LADDER, t);
    }

    // --- redstone dust (cross) and lever
    if (has('WIRE_OFF')) {
      const wire = (cols) => {
        const t = mk();
        for (let i = 0; i < N; i++) for (const w of [7, 8]) { t.set(i, w, cols[w === 7 ? 2 : 1]); t.set(w, i, cols[w === 7 ? 2 : 1]); }
        for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) if (Math.hypot(x - 7.5, y - 7.5) < 2.6) t.set(x, y, cols[ih(x, y, 913) < 0.3 ? 3 : 2]);
        for (let i = 0; i < N; i++) {
          if (ih(i, 1, 914) < 0.3) t.set(i, ih(i, 2, 914) < 0.5 ? 6 : 9, cols[0]);
          if (ih(i, 3, 914) < 0.3) t.set(ih(i, 4, 914) < 0.5 ? 6 : 9, i, cols[0]);
        }
        return t;
      };
      put(T.WIRE_OFF, wire(hx('4a0604 6a0a06 8a120c a81c12')));
      put(T.WIRE_ON, wire(hx('a01008 e82a14 ff4a2a ff8a66')));
      // lever: cobble base plate with a wooden handle and a dark slot (fully opaque, as before)
      const lv2 = cobbleT.clone();
      rect(lv2, 5, 4, 10, 11, [118, 118, 118]);
      for (let i = 5; i <= 10; i++) { lv2.set(i, 4, [150, 150, 150]); lv2.set(i, 11, [70, 70, 70]); }
      for (let i = 4; i <= 11; i++) { lv2.set(5, i, [150, 150, 150]); lv2.set(10, i, [70, 70, 70]); }
      rect(lv2, 7, 6, 8, 9, [44, 44, 44]);
      for (let y = 1; y < 9; y++) { lv2.set(7, y, [150, 112, 62]); lv2.set(8, y, [104, 76, 40]); }
      put(T.LEVER, lv2);
    }

    // --- enchanting table, end
    if (has('ENCH_TOP')) {
      const top = obsidianT.clone();
      const cloth = hx('5a0c14 7e1420 a01e2c b82a38');
      for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) {
        const edge = x === 2 || y === 2 || x === 13 || y === 13;
        top.set(x, y, edge ? [214, 176, 70] : cloth[md(x + y, 4) === 0 ? 1 : md(x - y, 4) === 0 ? 3 : 2]);
      }
      // open book
      stamp(top, 4, 5, ['bbbbbbbb', 'bppppppb', 'bpllplpb', 'bppppppb', 'bpllpllb', 'bppppppb', 'bbbbbbbb'], { b: [96, 52, 30], p: [236, 228, 206], l: [150, 140, 120] });
      for (let y = 6; y < 11; y++) top.set(7, y, [180, 170, 150]);
      put(T.ENCH_TOP, top);
      const side = obsidianT.clone();
      for (let x = 0; x < N; x++) {
        side.set(x, 4, cloth[3]); side.set(x, 5, cloth[2]); side.set(x, 6, cloth[x % 3 === 0 ? 1 : 2]); side.set(x, 7, [214, 176, 70]);
      }
      for (const x of [0, 1, 14, 15]) for (let y = 8; y < 10; y++) side.set(x, y, [92, 220, 210]);
      put(T.ENCH_SIDE, side);
    }
    if (has('END_STONE')) {
      const L = lv();
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const v = vn(x, y, 4, 4, 922) * 0.6 + vn(x, y, 2, 2, 923) * 0.4;
        L[I(x, y)] = v < 0.35 ? 2 : v < 0.62 ? 3 : 4;
      }
      // small craters: dark on the upper-left inside, lit lip on the lower-right
      for (const [px, py] of scatter(rng(924), 9, 4.2)) {
        const x = Math.floor(px), y = Math.floor(py), big = px % 1 > 0.5;
        L[I(x, y)] = 0; L[I(x + 1, y)] = 1; L[I(x, y + 1)] = 1; L[I(x + 1, y + 1)] = big ? 1 : 5;
        if (big) { L[I(x + 2, y + 1)] = 5; L[I(x + 1, y + 2)] = 5; L[I(x + 2, y)] = 4; }
      }
      const endT = paint(L, P.end);
      put(T.END_STONE, endT);
      const teal = hx('0f3b30 1a5444 286e58 3a8a70 58a88a');
      const frameTop = (eye) => {
        const t = endT.clone();
        for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) {
          const e = x === 3 || y === 3 ? 0 : x === 12 || y === 12 ? 4 : (md(x + y, 3) === 0 ? 2 : 1);
          t.set(x, y, teal[e]);
        }
        if (eye) {
          stamp(t, 4, 4, ['..gggg..', '.gGGGGg.', 'gGGkkGGg', 'gGkkkkGg', 'gGkkkkGg', 'gGGkkGGg', '.gGGGGg.', '..gggg..'], { g: [24, 90, 70], G: [60, 170, 120], k: [10, 26, 20] });
          t.set(6, 6, [210, 250, 220]);
        }
        return t;
      };
      put(T.FRAME_TOP, frameTop(false));
      put(T.FRAME_EYE_TOP, frameTop(true));
      const fs = endT.clone();
      for (let x = 0; x < N; x++) {
        for (let y = 0; y < 3; y++) fs.set(x, y, [[24, 90, 70], [40, 130, 96], [18, 64, 50]][y]);
        fs.set(x, 3, teal[4]); fs.set(x, 4, teal[2]); fs.set(x, 5, md(x, 4) === 1 ? teal[4] : teal[1]); fs.set(x, 6, teal[0]);
      }
      put(T.FRAME_SIDE, fs);
      const portal = mk();
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) portal.set(x, y, hx('070a12 0c1220 111a2c')[vn(x, y, 4, 4, 926) < 0.4 ? 0 : vn(x, y, 2, 2, 927) < 0.6 ? 1 : 2]);
      for (const [px, py] of scatter(rng(928), 9, 3.5)) {
        const x = Math.floor(px), y = Math.floor(py), c = [[120, 230, 200], [200, 255, 240], [90, 160, 220]][Math.floor(px * 7) % 3];
        portal.set(x, y, c); if (px % 1 > 0.6) { portal.set(x + 1, y, mul(c, 0.5)); portal.set(x, y + 1, mul(c, 0.5)); }
      }
      put(T.END_PORTAL, portal);
      const egg = mk();
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const v = vn(x, y, 4, 4, 929) * 0.7 + ih(x, y, 930) * 0.3;
        egg.set(x, y, hx('0b0612 140a20 1e1030 2c1846 4a2a70')[v < 0.3 ? 0 : v < 0.6 ? 1 : v < 0.85 ? 2 : v < 0.95 ? 3 : 4]);
      }
      put(T.DRAGON_EGG, egg);
    }
    if (has('SPAWNER')) {
      const t = mk(), m = P.metal;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const bx = x % 5 === 0 || x === 15, by = y % 5 === 0 || y === 15;
        if (!bx && !by) continue;
        let l = bx && by ? 5 : bx ? (x === 15 ? 1 : 3) : (y === 15 ? 1 : 4);
        if (bx && !by && md(y, 5) === 4) l = 1;
        if (by && !bx && md(x, 5) === 4) l = 2;
        t.set(x, y, m[l]);
      }
      put(T.SPAWNER, t);
    }
    if (has('SUGAR_CANE')) {
      const t = mk();
      const sc = hx('4f7a2a 6f9e3c 8cbc56 a8d670 c6e894');
      for (const [x0, off] of [[3, 0], [8, 2], [12, 4]]) for (let y = 0; y < N; y++) {
        const node = md(y + off, 6) === 0;
        t.set(x0, y, sc[node ? 4 : 3]); t.set(x0 + 1, y, sc[node ? 2 : 1]);
        if (md(y + off, 6) === 1) t.set(x0 + 1, y, sc[0]);
      }
      stamp(t, 0, 4, ['c..', '.cc'], { c: sc[2] });
      stamp(t, 5, 9, ['..c', 'cc.'], { c: sc[2] });
      stamp(t, 9, 2, ['c..', '.c.'], { c: sc[2] });
      stamp(t, 13, 13, ['.cc', 'c..'], { c: sc[2] });
      put(T.SUGAR_CANE, t);
    }

    // --- block-breaking cracks: thin fractures radiating from the middle, longer each stage
    {
      const rand = rng(300);
      const order = new Float32Array(256).fill(99);
      const line = (x, y, ang, len, t0, depth) => {
        for (let k = 0; k < len; k++) {
          ang += (rand() - 0.5) * 0.7;
          x += Math.cos(ang); y += Math.sin(ang);
          const px = Math.round(x), py = Math.round(y);
          if (px < 0 || py < 0 || px > 15 || py > 15) return;
          const i = py * N + px;
          order[i] = Math.min(order[i], t0 + k);
          if (depth < 1 && k > 1 && rand() < 0.22) line(x, y, ang + (rand() < 0.5 ? -1 : 1) * (0.7 + rand() * 0.5), Math.floor((len - k) * 0.7), t0 + k + 1, depth + 1);
        }
      };
      const arms = 7;
      for (let a = 0; a < arms; a++) line(7.5, 7.5, (a / arms) * Math.PI * 2 + rand() * 0.6, 10, a % 2 ? 1.5 : 0, 0);
      order[I(7, 7)] = order[I(8, 8)] = order[I(7, 8)] = 0;
      for (let s = 0; s < 10; s++) {
        const t = mk(), lim = 0.6 + s * 1.0;
        for (let i = 0; i < 256; i++) if (order[i] <= lim) t.set(i & 15, i >> 4, [16, 16, 16], 200);
        // lighter chipping along the older parts of the fractures
        if (s > 3) for (let i = 0; i < 256; i++) if (order[i] <= lim - 3 && ih(i, 7, 301) < 0.3) { const x = (i & 15) + 1, y = i >> 4; if (x < 16 && t.al(x, y) === 0) t.set(x, y, [60, 60, 60], 110); }
        put(T.CRACK0 + s, t);
      }
    }

    paintItemSprites(put);
  }

  // ---------------------------------------------------------------- items
  // Hand-drawn 16x16 sprites; chars map to palette slots. Handles run from the bottom-left.
  const HANDLE = hx('2a1c0e 4a3218 6b4a24 8a6232');
  const TOOL_PAL = [
    hx('3e2a12 6b4a24 8a6232 a8823e c09a52'), // wood
    hx('2e2e2e 545454 747474 8f8f8f aaaaaa'), // stone
    hx('3c3c3c 8c8c8c b8b8b8 d8d8d8 f4f4f4'), // iron
    hx('6a4806 b88a10 e8c02a f8dc50 fff4a8'), // gold
    hx('0c4a46 16807a 2fbcb2 5ee6dc b8fff8'), // diamond
  ];
  const TOOL_SPRITES = {
    // o outline, 1..4 head shades (dark..light), h/H handle dark/light
    pickaxe: [
      '................',
      '....oooooo......',
      '...o344443o.....',
      '....oo22224o....',
      '.......oo2o3o...',
      '........oHo23o..',
      '.......oHho23o..',
      '......oHho.o2o..',
      '.....oHho..o2o..',
      '....oHho....oo..',
      '...oHho.........',
      '..oHho..........',
      '.oHho...........',
      '.oho............',
      '..o.............',
      '................'],
    axe: [
      '................',
      '.......oo.......',
      '......o34o......',
      '.....o3442oo....',
      '.....o34422o....',
      '......o4Ho2o....',
      '......oHho1o....',
      '.....oHhooo.....',
      '....oHho........',
      '...oHho.........',
      '..oHho..........',
      '.oHho...........',
      '.oho............',
      '..o.............',
      '................',
      '................'],
    shovel: [
      '................',
      '..........ooo...',
      '.........o343o..',
      '........o34432o.',
      '........o44322o.',
      '.........o3221o.',
      '........oHo11o..',
      '.......oHhoo....',
      '......oHho......',
      '.....oHho.......',
      '....oHho........',
      '...oHho.........',
      '..oHho..........',
      '.oho............',
      '..o.............',
      '................'],
    sword: [
      '................',
      '............ooo.',
      '...........o44o.',
      '..........o443o.',
      '.........o443o..',
      '........o443o...',
      '.......o443o....',
      '..oo..o443o.....',
      '..o2oo443o......',
      '...o2232o.......',
      '....o22o........',
      '...oHho2o.......',
      '..oHho.oo.......',
      '.oho............',
      '.oo.............',
      '................'],
    hoe: [
      '................',
      '.......ooooo....',
      '......o34443o...',
      '.......ooo2Ho...',
      '.........oHho...',
      '........oHho....',
      '.......oHho.....',
      '......oHho......',
      '.....oHho.......',
      '....oHho........',
      '...oHho.........',
      '..oHho..........',
      '.oHho...........',
      '.oho............',
      '..o.............',
      '................'],
  };
  const SIMPLE = {
    stick: ['................', '................', '............oo..', '...........oHo..', '..........oHho..', '.........oHho...', '........oHho....', '.......oHho.....', '......oHho......', '.....oHho.......', '....oHho........', '...oHho.........', '...oho..........', '....o...........', '................', '................'],
    ingot: ['................', '................', '................', '................', '......oooooo....', '.....o444443o...', '....o4333332o...', '...o43333321o...', '..oooooooo21o...', '..o44443322o....', '..o3333221o.....', '..oo22211o......', '...oooooo.......', '................', '................', '................'],
    gem: ['................', '................', '....oooooooo....', '...o44433332o...', '..o4434433221o..', '.o443333332211o.', '.oooooooooooooo.', '..o3322222211o..', '...o32222211o...', '....o322221o....', '.....o3221o.....', '......o21o......', '.......oo.......', '................', '................', '................'],
    lump: ['................', '................', '................', '......ooo.......', '....oo343oo.....', '...o3443332o....', '..o34332222o....', '..o4332212o.....', '..o3322111o.....', '...o222111oo....', '...o32211221o...', '....oo11111o....', '......ooooo.....', '................', '................', '................'],
    apple: ['................', '........o.......', '.......oho......', '.......oho.oo...', '....ooooooggo...', '...o4433ooggo...', '..o443333322o...', '..o4433333221o..', '..o4333333221o..', '..o3333332221o..', '..o3333322211o..', '...o33322211o...', '...o322211o.o...', '....oo2oo1o.....', '......o..o......', '................'],
  };
  const sprite = (rows, map) => {
    const t = mk();
    rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const c = map[r[x]]; if (c) t.set(x, y, c); } });
    return t;
  };
  function paintItemSprites(put) {
    if (typeof TOOL_MATERIALS === 'undefined') return;
    const S0 = T.ITEM0;
    const outlineC = [24, 18, 12];
    TOOL_MATERIALS.forEach((m, mi) => {
      const pal = TOOL_PAL[mi] || TOOL_PAL[2];
      const map = { o: outlineC, 1: pal[1], 2: pal[2], 3: pal[3], 4: pal[4], h: HANDLE[2], H: HANDLE[3] };
      ['pickaxe', 'axe', 'shovel', 'sword'].forEach((k, ti) => put(S0 + 16 + mi * 4 + ti, sprite(TOOL_SPRITES[k], map)));
      if (typeof T.ITEM2 === 'number') put(T.ITEM2 + 7 + mi, sprite(TOOL_SPRITES.hoe, map));
    });
    const hm = { o: outlineC, h: HANDLE[2], H: HANDLE[3] };
    put(S0 + 0, sprite(SIMPLE.stick, hm));
    const ing = (pal) => sprite(SIMPLE.ingot, { o: outlineC, 1: pal[0], 2: pal[1], 3: pal[2], 4: pal[3] });
    put(S0 + 3, ing(hx('6e6e6e a8a8a8 d0d0d0 f6f6f6')));
    put(S0 + 4, ing(hx('a07008 dcae1e f6d63e fff3a0')));
    put(S0 + 5, sprite(SIMPLE.gem, { o: [10, 40, 40], 1: [20, 120, 116], 2: [44, 190, 182], 3: [110, 232, 224], 4: [220, 255, 252] }));
    put(S0 + 1, sprite(SIMPLE.lump, { o: [8, 8, 8], 1: [18, 18, 20], 2: [34, 34, 36], 3: [58, 58, 62], 4: [96, 96, 104] }));
    put(S0 + 2, sprite(SIMPLE.lump, { o: [14, 10, 6], 1: [36, 26, 16], 2: [56, 40, 24], 3: [78, 58, 36], 4: [110, 86, 56] }));
    put(S0 + 6, sprite(SIMPLE.apple, { o: [44, 10, 10], 1: [120, 14, 14], 2: [178, 24, 22], 3: [214, 40, 34], 4: [248, 120, 100], h: [96, 64, 28], g: [70, 150, 40] }));
    if (typeof T.ITEM2 === 'number') put(T.ITEM2 + 2, sprite(SIMPLE.gem, { o: [6, 40, 18], 1: [10, 110, 46], 2: [30, 176, 80], 3: [90, 226, 140], 4: [200, 255, 220] }));
  }

  // Hook in after the last original painter. textures2.js calls paintTiles3(painter, ...) at
  // the very end of the atlas build, before the single putImageData, so writing through the
  // painter needs no canvas read-back. If that hook ever goes away, buildAtlas falls back to
  // reading the finished canvas back and repainting it.
  let painted = false;
  const viaPainter = (painter) => (tile, t) => {
    const q = painter(tile, 0), a = t.a;
    for (let y = 0, i = 0; y < N; y++) for (let x = 0; x < N; x++, i += 4) q.set(x, y, a[i], a[i + 1], a[i + 2], a[i + 3]);
  };
  if (typeof paintTiles3 === 'function') {
    // eslint-disable-next-line no-func-assign
    paintTiles3 = ((orig) => function (painter) {
      const r = orig.apply(this, arguments);
      try { repaint(viaPainter(painter)); painted = true; } catch (e) { console.warn('textures3: repaint failed', e); }
      return r;
    })(paintTiles3);
  }
  // eslint-disable-next-line no-func-assign
  buildAtlas = ((orig) => function () {
    painted = false;
    const canvas = orig.apply(this, arguments);
    if (!painted) {
      try {
        const ctx = canvas.getContext('2d');
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height), data = img.data, AW = canvas.width;
        repaint((tile, t) => {
          const ox = (tile % ATLAS_COLS) * N, oy = Math.floor(tile / ATLAS_COLS) * N;
          for (let y = 0; y < N; y++) data.set(t.a.subarray(y * 64, y * 64 + 64), ((oy + y) * AW + ox) * 4);
        });
        ctx.putImageData(img, 0, 0);
      } catch (e) { console.warn('textures3: repaint failed', e); }
    }
    painted = false;
    return canvas;
  })(buildAtlas);
})();
