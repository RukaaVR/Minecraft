// Village generation: a well, dirt-path roads, houses, farms and lamp posts.
// Villages are laid out deterministically per 320x320 cell, cached, and stamped
// into each chunk as it generates (pieces can cross chunk borders).
'use strict';

const Villages = {
  CELL: 288,
  REACH: 64, // max distance of any village block from its centre

  _cellKey(cx, cz) { return cx + ',' + cz; },

  villageAt(world, cellX, cellZ) {
    const k = this._cellKey(cellX, cellZ);
    if (world.villageCache.has(k)) return world.villageCache.get(k);
    const v = this._build(world, cellX, cellZ);
    world.villageCache.set(k, v);
    return v;
  },

  // Villages whose area may touch the box [x0..x1] x [z0..z1]
  villagesIn(world, x0, z0, x1, z1) {
    if (world.dim !== 0) return [];
    const out = [];
    const c0x = Math.floor((x0 - this.REACH) / this.CELL), c1x = Math.floor((x1 + this.REACH) / this.CELL);
    const c0z = Math.floor((z0 - this.REACH) / this.CELL), c1z = Math.floor((z1 + this.REACH) / this.CELL);
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
      const v = this.villageAt(world, cx, cz);
      if (v) out.push(v);
    }
    return out;
  },

  blocksForChunk(world, cx, cz) {
    const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;
    const vs = this.villagesIn(world, ox, oz, ox + CHUNK_SIZE - 1, oz + CHUNK_SIZE - 1);
    if (!vs.length) return [];
    const out = [];
    const key = cx + ',' + cz;
    for (const v of vs) {
      const list = v.byChunk.get(key);
      if (!list) continue;
      for (const b of list) out.push(b);
      for (const [bk, d] of v.data) {
        const [x, , z] = bk.split(',').map(Number);
        if (Math.floor(x / CHUNK_SIZE) === cx && Math.floor(z / CHUNK_SIZE) === cz && !world.blockData.has(bk)) {
          world.blockData.set(bk, JSON.parse(JSON.stringify(d)));
        }
      }
    }
    return out;
  },

  _build(world, cellX, cellZ) {
    const seed = world.seed;
    const rnd = mulberry32((Math.imul(cellX, 73856093) ^ Math.imul(cellZ, 19349663) ^ seed ^ 0x5bd1e995) >>> 0);
    if (rnd() > 0.6) return null;
    const cx = cellX * this.CELL + 64 + Math.floor(rnd() * (this.CELL - 128));
    const cz = cellZ * this.CELL + 64 + Math.floor(rnd() * (this.CELL - 128));
    const hcache = new Map();
    const H = (x, z) => {
      const k = x + ',' + z;
      if (!hcache.has(k)) hcache.set(k, world.columnInfo(x, z).height);
      return hcache.get(k);
    };
    const center = world.columnInfo(cx, cz);
    const y0 = center.height;
    if (y0 <= SEA_LEVEL + 1 || y0 > 80) return null;
    // Needs fairly flat ground
    let lo = y0, hi = y0;
    for (let a = 0; a < 8; a++) {
      for (const r of [12, 24]) {
        const h = H(cx + Math.round(Math.cos(a * Math.PI / 4) * r), cz + Math.round(Math.sin(a * Math.PI / 4) * r));
        lo = Math.min(lo, h); hi = Math.max(hi, h);
      }
    }
    if (hi - lo > 12 || lo <= SEA_LEVEL - 2) return null;

    const desert = center.desert;
    const S = desert
      ? { wall: B.SANDSTONE, corner: B.SANDSTONE, floor: B.SANDSTONE, roof: B.SANDSTONE, roof2: B.SANDSTONE, found: B.SANDSTONE }
      : { wall: B.PLANKS, corner: B.LOG, floor: B.COBBLE, roof: B.PLANKS, roof2: B.LOG, found: B.COBBLE };

    const blocks = [];
    const data = new Map();
    const put = (x, y, z, id) => { if (y > 0 && y < WORLD_HEIGHT) blocks.push([x, y, z, id]); };
    const setData = (x, y, z, d) => data.set(x + ',' + y + ',' + z, d);
    const occupied = [];
    const free = (x0, z0, x1, z1) => {
      for (const o of occupied) if (x0 <= o[2] && x1 >= o[0] && z0 <= o[3] && z1 >= o[1]) return false;
      return true;
    };
    const occupy = (x0, z0, x1, z1) => occupied.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]);

    // ---- well
    for (let x = cx - 1; x <= cx + 2; x++) for (let z = cz - 1; z <= cz + 2; z++) {
      for (let y = H(x, z) + 1; y < y0; y++) put(x, y, z, S.found);
      for (let y = y0 + 1; y <= y0 + 6; y++) put(x, y, z, B.AIR);
      const inner = x >= cx && x <= cx + 1 && z >= cz && z <= cz + 1;
      put(x, y0 - 2, z, S.found);
      put(x, y0 - 1, z, inner ? B.WATER : S.found);
      put(x, y0, z, inner ? B.WATER : S.found);
      if (!inner) put(x, y0 + 1, z, S.found);
      const corner = (x === cx - 1 || x === cx + 2) && (z === cz - 1 || z === cz + 2);
      if (corner) { put(x, y0 + 2, z, S.corner); put(x, y0 + 3, z, S.corner); }
      put(x, y0 + 4, z, S.roof);
    }
    occupy(cx - 2, cz - 2, cx + 3, cz + 3);

    // ---- roads + buildings
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const roads = [];
    for (const [dx, dz] of dirs) {
      const len = 18 + Math.floor(rnd() * 14);
      const sx = dx > 0 ? cx + 3 : dx < 0 ? cx - 2 : cx;
      const sz = dz > 0 ? cz + 3 : dz < 0 ? cz - 2 : cz;
      roads.push({ dx, dz, len, sx, sz });
      for (let t = 0; t < len; t++) {
        for (let w = -1; w <= 1; w++) {
          const x = sx + dx * t + (dx === 0 ? w : 0);
          const z = sz + dz * t + (dz === 0 ? w : 0);
          const h = H(x, z);
          if (h <= SEA_LEVEL) continue;
          put(x, h, z, B.PATH);
          for (let y = h + 1; y <= h + 4; y++) put(x, y, z, B.AIR);
        }
      }
      const a = dx !== 0 ? [sx, sz - 1, sx + dx * len, sz + 1] : [sx - 1, sz, sx + 1, sz + dz * len];
      occupy(a[0], a[1], a[2], a[3]);
    }

    const villagers = [];
    for (const road of roads) {
      const { dx, dz, len, sx, sz } = road;
      const px = -dz, pz = dx; // perpendicular
      for (let t = 5; t < len - 2; t += 8 + Math.floor(rnd() * 4)) {
        for (const side of [-1, 1]) {
          const roll = rnd();
          let type = roll < 0.42 ? 'small' : roll < 0.62 ? 'big' : roll < 0.8 ? 'farm' : roll < 0.9 ? 'lamp' : null;
          if (!type) continue;
          const size = { small: [5, 5], big: [7, 6], farm: [7, 9], lamp: [1, 1] }[type];
          // local i along road (width), j away from road (depth); front wall at j = 0
          const along = (size[0] - 1) / 2;
          const ox = sx + dx * t + px * side * 3, oz = sz + dz * t + pz * side * 3;
          const toWorld = (i, j) => [ox + dx * (i - along) + px * side * j, oz + dz * (i - along) + pz * side * j];
          const c0 = toWorld(0, 0), c1 = toWorld(size[0] - 1, size[1] - 1);
          const bx0 = Math.min(c0[0], c1[0]), bx1 = Math.max(c0[0], c1[0]), bz0 = Math.min(c0[1], c1[1]), bz1 = Math.max(c0[1], c1[1]);
          if (!free(bx0 - 1, bz0 - 1, bx1 + 1, bz1 + 1)) continue;
          if (Math.abs(bx0 - cx) > this.REACH - 8 || Math.abs(bx1 - cx) > this.REACH - 8 || Math.abs(bz0 - cz) > this.REACH - 8 || Math.abs(bz1 - cz) > this.REACH - 8) continue;
          const mid = toWorld(Math.floor(size[0] / 2), Math.floor(size[1] / 2));
          const by = H(mid[0], mid[1]);
          if (by <= SEA_LEVEL || Math.abs(by - y0) > 8) continue;
          occupy(bx0, bz0, bx1, bz1);
          // Facing that points from the building toward the road: (-px*side, -pz*side)
          const fx = -px * side, fz = -pz * side;
          const facing = fz > 0 ? 0 : fx < 0 ? 1 : fz < 0 ? 2 : 3;
          this._building(type, size, toWorld, by, H, put, setData, S, facing, rnd, villagers, { dx, dz, px: px * side, pz: pz * side });
        }
      }
    }

    // Bucket blocks per chunk (later entries win)
    const byChunk = new Map();
    for (const b of blocks) {
      const k = Math.floor(b[0] / CHUNK_SIZE) + ',' + Math.floor(b[2] / CHUNK_SIZE);
      if (!byChunk.has(k)) byChunk.set(k, []);
      byChunk.get(k).push(b);
    }
    return { center: [cx + 0.5, y0 + 1, cz + 0.5], desert, byChunk, data, villagers, id: cellX + ':' + cellZ };
  },

  _building(type, size, toWorld, y0, H, put, setData, S, facing, rnd, villagers, axes) {
    const [w, d] = size;
    const foundation = (i, j, top) => {
      const [x, z] = toWorld(i, j);
      for (let y = H(x, z) + 1; y < top; y++) put(x, y, z, S.found);
    };
    const at = (i, j, dy, id) => { const [x, z] = toWorld(i, j); put(x, y0 + dy, z, id); };
    const clearAbove = (i, j, from, to) => { for (let dy = from; dy <= to; dy++) at(i, j, dy, B.AIR); };

    if (type === 'lamp') {
      foundation(0, 0, y0);
      at(0, 0, 0, S.found);
      at(0, 0, 1, S.corner === B.LOG ? B.LOG : S.found);
      at(0, 0, 2, S.corner === B.LOG ? B.LOG : S.found);
      at(0, 0, 3, B.TORCH);
      return;
    }
    if (type === 'farm') {
      for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) {
        foundation(i, j, y0);
        clearAbove(i, j, 1, 4);
        const border = i === 0 || j === 0 || i === w - 1 || j === d - 1;
        if (border) { at(i, j, 0, B.LOG); continue; }
        if (i === Math.floor(w / 2)) { at(i, j, 0, B.WATER); at(i, j, -1, S.found); continue; }
        at(i, j, 0, B.FARMLAND);
        at(i, j, 1, B.WHEAT0 + 2 + Math.floor(rnd() * 6));
      }
      return;
    }
    // Houses
    const height = 3;
    for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) {
      foundation(i, j, y0);
      at(i, j, 0, S.floor);
      clearAbove(i, j, 1, height + 6);
      const edgeI = i === 0 || i === w - 1, edgeJ = j === 0 || j === d - 1;
      if (edgeI || edgeJ) {
        for (let dy = 1; dy <= height; dy++) at(i, j, dy, edgeI && edgeJ ? S.corner : S.wall);
      }
      if (S.roof === B.SANDSTONE) {
        at(i, j, height + 1, S.roof);
      } else {
        // stepped pyramid roof: each layer shrinks by one block on every side
        for (let k = 0; ; k++) {
          if (i < k || j < k || i > w - 1 - k || j > d - 1 - k) break;
          at(i, j, height + 1 + k, k % 2 ? S.roof2 : S.roof);
        }
      }
    }
    // Windows
    const winJ = [Math.floor(d / 2)];
    if (d >= 6) winJ.push(2, d - 2);
    for (const j of new Set(winJ)) { at(0, j, 2, B.GLASS); at(w - 1, j, 2, B.GLASS); }
    at(Math.floor(w / 2), d - 1, 2, B.GLASS);
    if (w >= 7) { at(1, d - 1, 2, B.GLASS); at(w - 2, d - 1, 2, B.GLASS); }
    // Door in the middle of the front wall, opening toward the road
    const di = Math.floor(w / 2);
    at(di, 0, 1, B.DOOR_LOWER);
    at(di, 0, 2, B.DOOR_UPPER);
    const [dxw, dzw] = toWorld(di, 0);
    setData(dxw, y0 + 1, dzw, { facing, open: false });
    // Doorstep: clear the way in and fill any gap below it
    const [sx, sz] = toWorld(di, -1);
    put(sx, y0 + 1, sz, B.AIR);
    put(sx, y0 + 2, sz, B.AIR);
    for (let y = H(sx, sz) + 1; y <= y0; y++) put(sx, y, sz, S.found);
    // Interior: bed, torch, and a chest or crafting table
    const bedI = w - 2, footJ = d - 3, headJ = d - 2;
    const [fx, fz] = toWorld(bedI, footJ), [hx, hz] = toWorld(bedI, headJ);
    at(bedI, footJ, 1, B.BED_FOOT);
    at(bedI, headJ, 1, B.BED_HEAD);
    // bed facing: from foot toward head (away from the road)
    const bf = (facing + 2) % 4;
    setData(fx, y0 + 1, fz, { facing: bf });
    setData(hx, y0 + 1, hz, { facing: bf });
    at(1, 1, 1, B.TORCH);
    const [chx, chz] = toWorld(1, d - 2);
    void axes;
    if (rnd() < 0.6) {
      at(1, d - 2, 1, B.CHEST);
      const loot = new Array(27).fill(0);
      const add = (id, n) => { if (n > 0) { let k = Math.floor(rnd() * 27); while (loot[k]) k = (k + 1) % 27; loot[k] = [id, n, 0]; } };
      add(ITEM.BREAD, 1 + Math.floor(rnd() * 3));
      add(ITEM.APPLE, Math.floor(rnd() * 4));
      add(ITEM.SEEDS, Math.floor(rnd() * 6));
      add(ITEM.IRON_INGOT, Math.floor(rnd() * 3));
      add(ITEM.EMERALD, Math.floor(rnd() * 3));
      if (rnd() < 0.15) add(toolId(2, 0), 1);
      setData(chx, y0 + 1, chz, { type: 'chest', facing, slots: loot });
    } else at(1, d - 2, 1, B.CRAFTING_TABLE);
    if (w >= 7) {
      at(w - 2, 1, 1, B.FURNACE);
      const [fux, fuz] = toWorld(w - 2, 1);
      setData(fux, y0 + 1, fuz, { type: 'furnace', facing: (facing + 2) % 4, slots: [0, 0, 0], burn: 0, burnMax: 0, cook: 0 });
    }
    const [vx, vz] = toWorld(di, 2);
    villagers.push([vx + 0.5, y0 + 1, vz + 0.5]);
  },

  // Villages (with centres) near a point, for spawning villagers
  near(world, x, z, r) {
    return this.villagesIn(world, x - r, z - r, x + r, z + r).filter((v) => Math.hypot(v.center[0] - x, v.center[2] - z) < r);
  },
};
