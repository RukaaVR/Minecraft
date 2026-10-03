// Structures: Nether fortresses, the stronghold (End portal room) and the End's pillars.
// Like villages, each is laid out deterministically, cached, and stamped into chunks.
'use strict';

const Structures = {
  FORTRESS_CELL: 320,

  // ---------------------------------------------------------------- shared helpers
  _bucket(blocks) {
    const byChunk = new Map();
    for (const b of blocks) {
      const k = Math.floor(b[0] / CHUNK_SIZE) + ',' + Math.floor(b[2] / CHUNK_SIZE);
      if (!byChunk.has(k)) byChunk.set(k, []);
      byChunk.get(k).push(b);
    }
    return byChunk;
  },

  _stamp(world, list, cx, cz) {
    const out = [];
    for (const s of list) {
      const blocks = s.byChunk.get(cx + ',' + cz);
      if (!blocks) continue;
      for (const b of blocks) out.push(b);
      for (const [bk, d] of s.data) {
        const [x, , z] = bk.split(',').map(Number);
        if (Math.floor(x / CHUNK_SIZE) === cx && Math.floor(z / CHUNK_SIZE) === cz && !world.blockData.has(bk)) {
          world.blockData.set(bk, JSON.parse(JSON.stringify(d)));
        }
      }
    }
    return out;
  },

  _loot(rnd, table, rolls) {
    const slots = new Array(27).fill(0);
    for (let i = 0; i < rolls; i++) {
      const [id, lo, hi] = table[Math.floor(rnd() * table.length)];
      let k = Math.floor(rnd() * 27);
      while (slots[k]) k = (k + 1) % 27;
      slots[k] = [id, lo + Math.floor(rnd() * (hi - lo + 1)), 0];
    }
    return slots;
  },

  // ---------------------------------------------------------------- Nether fortress
  fortressAt(world, cellX, cellZ) {
    const k = 'f' + cellX + ',' + cellZ;
    if (world.villageCache.has(k)) return world.villageCache.get(k);
    const rnd = mulberry32((Math.imul(cellX, 49157) ^ Math.imul(cellZ, 805459) ^ world.seed ^ 0x2545f491) >>> 0);
    let f = null;
    if (rnd() < 0.55) {
      const cx = cellX * this.FORTRESS_CELL + 80 + Math.floor(rnd() * 160);
      const cz = cellZ * this.FORTRESS_CELL + 80 + Math.floor(rnd() * 160);
      f = this._buildFortress(world, cx, 64 + Math.floor(rnd() * 8), cz, rnd);
    }
    world.villageCache.set(k, f);
    return f;
  },

  _buildFortress(world, cx, y, cz, rnd) {
    const blocks = [], data = new Map();
    const put = (x, yy, z, id) => { if (yy > 0 && yy < WORLD_HEIGHT - 1) blocks.push([x, yy, z, id]); };
    const NB = B.NETHER_BRICKS;
    const L = 40 + Math.floor(rnd() * 16);
    // Two crossing corridors
    const corridor = (alongX) => {
      for (let t = -L; t <= L; t++) {
        for (let w = -2; w <= 2; w++) {
          const x = alongX ? cx + t : cx + w, z = alongX ? cz + w : cz + t;
          put(x, y, z, NB);
          for (let h = 1; h <= 3; h++) {
            const wall = Math.abs(w) === 2;
            const window = wall && h === 2 && ((t + 100) % 4 === 0);
            put(x, y + h, z, wall ? (window ? B.NETHER_FENCE : NB) : B.AIR);
          }
          put(x, y + 4, z, NB);
        }
        // Support pillars every 8 blocks
        if ((t + 100) % 8 === 0) for (const w of [-2, 2]) {
          const x = alongX ? cx + t : cx + w, z = alongX ? cz + w : cz + t;
          for (let d = 1; d < 40; d++) {
            if (world._netherSolid(x, y - d, z) || y - d <= 31) break;
            put(x, y - d, z, NB);
          }
        }
      }
    };
    corridor(true);
    corridor(false);
    // Central spawner room
    for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) {
      put(cx + x, y, cz + z, NB);
      for (let h = 1; h <= 5; h++) {
        const wall = Math.abs(x) === 5 || Math.abs(z) === 5;
        const door = wall && (Math.abs(x) <= 1 || Math.abs(z) <= 1) && h <= 3;
        put(cx + x, y + h, cz + z, wall && !door ? NB : B.AIR);
      }
      put(cx + x, y + 6, cz + z, NB);
    }
    put(cx, y + 1, cz, B.SPAWNER);
    data.set(cx + ',' + (y + 1) + ',' + cz, { type: 'spawner', mob: 'blaze' });
    // Treasure chests at corridor ends
    const loot = [[ITEM.GOLD_INGOT, 1, 3], [ITEM.IRON_INGOT, 1, 5], [ITEM.DIAMOND, 1, 2], [B.OBSIDIAN, 2, 4], [ITEM.FLINT_STEEL, 1, 1], [toolId(3, 3), 1, 1], [armorId(2, 1), 1, 1], [ITEM.GOLD_NUGGET, 2, 6]];
    for (const [x, z] of [[cx + L - 1, cz], [cx - L + 1, cz], [cx, cz + L - 1], [cx, cz - L + 1]]) {
      if (rnd() < 0.5) continue;
      put(x, y + 1, z, B.CHEST);
      data.set(x + ',' + (y + 1) + ',' + z, { type: 'chest', facing: 0, slots: this._loot(rnd, loot, 3 + Math.floor(rnd() * 4)) });
    }
    return {
      byChunk: this._bucket(blocks), data,
      box: [cx - L - 3, y - 2, cz - L - 3, cx + L + 3, y + 8, cz + L + 3], center: [cx, y, cz],
    };
  },

  fortressesIn(world, x0, z0, x1, z1) {
    if (world.dim !== 1) return [];
    const out = [];
    const C = this.FORTRESS_CELL, R = 64;
    for (let cz = Math.floor((z0 - R) / C); cz <= Math.floor((z1 + R) / C); cz++)
      for (let cx = Math.floor((x0 - R) / C); cx <= Math.floor((x1 + R) / C); cx++) {
        const f = this.fortressAt(world, cx, cz);
        if (f) out.push(f);
      }
    return out;
  },

  inFortress(world, x, y, z) {
    for (const f of this.fortressesIn(world, x, z, x, z)) {
      const b = f.box;
      if (x >= b[0] && x <= b[3] && y >= b[1] && y <= b[4] && z >= b[2] && z <= b[5]) return true;
    }
    return false;
  },

  // ---------------------------------------------------------------- stronghold
  strongholdPos(world) {
    const r = mulberry32((world.seed ^ 0x51ed270b) >>> 0);
    const a = r() * Math.PI * 2, d = 640 + r() * 400;
    return [Math.round(Math.cos(a) * d), 22, Math.round(Math.sin(a) * d)];
  },

  stronghold(world) {
    if (world.villageCache.has('stronghold')) return world.villageCache.get('stronghold');
    const [cx, y, cz] = this.strongholdPos(world);
    const rnd = mulberry32((world.seed ^ 0x7f4a7c15) >>> 0);
    const blocks = [], data = new Map();
    const put = (x, yy, z, id) => blocks.push([x, yy, z, id]);
    const wallBlock = () => { const r = rnd(); return r < 0.2 ? B.MOSSY_COBBLE : r < 0.3 ? B.COBBLE : B.STONE_BRICKS; };
    // Portal room: x -5..5, z -8..8, y..y+7
    for (let x = -5; x <= 5; x++) for (let z = -8; z <= 8; z++) for (let h = 0; h <= 7; h++) {
      const shell = Math.abs(x) === 5 || Math.abs(z) === 8 || h === 0 || h === 7;
      put(cx + x, y + h, cz + z, shell ? wallBlock() : B.AIR);
    }
    // Raised platform with the frame ring and a lava pool below the portal
    for (let x = -2; x <= 2; x++) for (let z = 1; z <= 5; z++) put(cx + x, y + 1, cz + z, B.STONE_BRICKS);
    for (let x = -1; x <= 1; x++) for (let z = 2; z <= 4; z++) { put(cx + x, y + 1, cz + z, B.LAVA); put(cx + x, y + 2, cz + z, B.AIR); }
    const ring = [];
    for (let i = -1; i <= 1; i++) { ring.push([cx + i, cz + 1]); ring.push([cx + i, cz + 5]); ring.push([cx - 2, cz + 3 + i]); ring.push([cx + 2, cz + 3 + i]); }
    for (const [x, z] of ring) put(x, y + 2, z, rnd() < 0.1 ? B.END_FRAME_EYE : B.END_FRAME);
    // Stairs up to the platform
    for (let x = -1; x <= 1; x++) put(cx + x, y + 1, cz - 1, B.BRICK_STAIRS);
    for (let x = -1; x <= 1; x++) data.set((cx + x) + ',' + (y + 1) + ',' + (cz - 1), { facing: 0 });
    put(cx - 4, y + 1, cz - 7, B.TORCH); put(cx + 4, y + 1, cz - 7, B.TORCH);
    put(cx - 4, y + 1, cz + 7, B.TORCH); put(cx + 4, y + 1, cz + 7, B.TORCH);
    // Corridors leading out of the room
    for (const dir of [-1, 1]) {
      for (let t = 6; t <= 34; t++) for (let w = -2; w <= 2; w++) for (let h = 0; h <= 4; h++) {
        const shell = Math.abs(w) === 2 || h === 0 || h === 4;
        put(cx + dir * t, y + h, cz - 4 + w, shell ? wallBlock() : B.AIR);
      }
      put(cx + dir * 20, y + 1, cz - 5, B.TORCH);
    }
    // A small library-style alcove with a chest
    put(cx + 3, y + 1, cz - 6, B.BOOKSHELF); put(cx + 3, y + 2, cz - 6, B.BOOKSHELF);
    put(cx - 3, y + 1, cz - 6, B.CHEST);
    data.set((cx - 3) + ',' + (y + 1) + ',' + (cz - 6), { type: 'chest', facing: 0, slots: this._loot(rnd, [[ITEM.ENDER_PEARL, 1, 2], [ITEM.IRON_INGOT, 1, 4], [ITEM.BREAD, 1, 3], [ITEM.APPLE, 1, 3], [ITEM.REDSTONE, 4, 9], [ITEM.BOOK, 1, 3], [toolId(2, 0), 1, 1]], 5) });
    const s = { byChunk: this._bucket(blocks), data, center: [cx, y, cz], portal: [cx, y + 2, cz + 3] };
    world.villageCache.set('stronghold', s);
    return s;
  },

  // Blocks of all structures for a chunk of `world`
  blocksForChunk(world, cx, cz) {
    const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;
    if (world.dim === 1) return this._stamp(world, this.fortressesIn(world, ox, oz, ox + 15, oz + 15), cx, cz);
    if (world.dim === 0) {
      const [sx, , sz] = this.strongholdPos(world);
      if (Math.abs(ox + 8 - sx) < 60 && Math.abs(oz + 8 - sz) < 60) return this._stamp(world, [this.stronghold(world)], cx, cz);
    }
    return [];
  },

  // ---------------------------------------------------------------- the End
  END_PILLARS: (() => {
    const out = [];
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2;
      out.push({ x: Math.round(Math.cos(a) * 42), z: Math.round(Math.sin(a) * 42), r: 2 + (i % 3), h: 76 + ((i * 7) % 10) * 3 });
    }
    return out;
  })(),
};
