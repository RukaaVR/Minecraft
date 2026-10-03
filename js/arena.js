// Minigame maps for the Nova Network: the lobby hub, Bed Wars and SkyWars.
// Each map is a fixed layout built once per world and stamped into chunks;
// everything else is empty void.
'use strict';

const NOVA_TEAMS = [
  { name: 'Red', color: '#FF5555', wool: B.WOOL_RED, letter: 'R', shirt: [200, 40, 40] },
  { name: 'Blue', color: '#5555FF', wool: B.WOOL_BLUE, letter: 'B', shirt: [50, 70, 210] },
  { name: 'Green', color: '#55FF55', wool: B.WOOL_GREEN, letter: 'G', shirt: [60, 170, 60] },
  { name: 'Yellow', color: '#FFFF55', wool: B.WOOL_YELLOW, letter: 'Y', shirt: [220, 200, 50] },
];

function arenaBuilder() {
  const m = new Map(), data = new Map();
  const b = {
    set(x, y, z, id) { if (y > 0 && y < WORLD_HEIGHT) m.set(x + ',' + y + ',' + z, id); },
    get(x, y, z) { return m.get(x + ',' + y + ',' + z) || 0; },
    box(x0, y0, z0, x1, y1, z1, id) {
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
        for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
          for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) b.set(x, y, z, id);
    },
    data(x, y, z, d) { data.set(x + ',' + y + ',' + z, d); },
    // A floating island: flat top at y, tapering rock underneath
    island(cx, y, cz, r, top, rnd, under = B.STONE) {
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) for (let dz = -Math.ceil(r); dz <= Math.ceil(r); dz++) {
        const d = Math.hypot(dx, dz) + (rnd ? rnd() * 0.6 : 0);
        if (d > r) continue;
        b.set(cx + dx, y, cz + dz, top);
        const depth = Math.floor((r - d) * 1.4 + 1 + (rnd ? rnd() * 2 : 0));
        for (let k = 1; k <= depth; k++) b.set(cx + dx, y - k, cz + dz, k <= 2 && top === B.GRASS ? B.DIRT : under);
      }
    },
    tree(x, y, z, log = B.LOG, leaves = B.LEAVES, h = 4) {
      for (let ly = y + h - 2; ly <= y + h + 1; ly++) {
        const rad = ly >= y + h ? 1 : 2;
        for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
          if (rad === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
          if (!b.get(x + dx, ly, z + dz)) b.set(x + dx, ly, z + dz, leaves);
        }
      }
      for (let k = 0; k < h; k++) b.set(x, y + k, z, log);
    },
    finish(extra) {
      const blocks = [];
      for (const [k, id] of m) {
        if (!id) continue;
        const [x, y, z] = k.split(',').map(Number);
        blocks.push([x, y, z, id]);
      }
      return Object.assign({ blocks, byChunk: Structures._bucket(blocks), data }, extra);
    },
  };
  return b;
}

// 5x5 pixel font for the big lobby sign
const BIG_FONT = {
  N: ['X...X', 'XX..X', 'X.X.X', 'X..XX', 'X...X'],
  O: ['.XXX.', 'X...X', 'X...X', 'X...X', '.XXX.'],
  V: ['X...X', 'X...X', 'X...X', '.X.X.', '..X..'],
  A: ['.XXX.', 'X...X', 'XXXXX', 'X...X', 'X...X'],
};

const Arena = {
  spec(world) {
    if (!world.arenaSpec) world.arenaSpec = this['build_' + world.arena](world.seed);
    return world.arenaSpec;
  },
  blocksForChunk(world, cx, cz) { return Structures._stamp(world, [this.spec(world)], cx, cz); },

  // ---------------------------------------------------------------- lobby
  build_lobby() {
    const b = arenaBuilder(), rnd = mulberry32(777);
    const Y = 64, R = 24;
    // Main platform with a rocky underside
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
      const d = Math.hypot(dx, dz);
      if (d > R + 0.4) continue;
      let top = B.STONE_BRICKS;
      if (d > 9.5 && d < 11.5) top = B.SANDSTONE;
      else if (d > 14 && d < 22 && (Math.abs(dx) > 4 && Math.abs(dz) > 4)) top = B.GRASS;
      b.set(dx, Y, dz, top);
      const depth = Math.floor((R - d) * 0.9 + 2 + rnd() * 3);
      for (let k = 1; k <= depth; k++) b.set(dx, Y - k, dz, k < 3 ? B.STONE_BRICKS : B.STONE);
      if (top === B.GRASS && rnd() < 0.12) b.set(dx, Y + 1, dz, rnd() < 0.5 ? B.POPPY : B.DANDELION);
    }
    // Edge wall of fences
    for (let a = 0; a < 360; a += 2) {
      const x = Math.round(Math.cos(a * Math.PI / 180) * R), z = Math.round(Math.sin(a * Math.PI / 180) * R);
      if (Math.abs(z) < 2 && x > 0) continue; // gap for the parkour
      if (b.get(x, Y, z)) b.set(x, Y + 1, z, B.OAK_FENCE);
    }
    // Fountain
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
      const d = Math.hypot(dx, dz);
      if (d <= 3.3) { b.set(dx, Y, dz, B.WATER); b.set(dx, Y - 1, dz, B.STONE_BRICKS); }
      else if (d <= 4.4) b.set(dx, Y + 1, dz, B.STONE_SLAB);
    }
    b.box(0, Y, 0, 0, Y + 3, 0, B.STONE_BRICKS);
    b.set(0, Y + 4, 0, B.GLOWSTONE);
    // Trees in the gardens
    for (const [x, z] of [[17, 17], [-17, 17], [17, -17], [-17, -17]]) b.tree(x, Y + 1, z, B.BIRCH_LOG, B.BIRCH_LEAVES, 5);
    // Lamp posts
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + Math.PI / 8;
      const x = Math.round(Math.cos(a) * 12.5), z = Math.round(Math.sin(a) * 12.5);
      b.box(x, Y + 1, z, x, Y + 3, z, B.OAK_FENCE);
      b.set(x, Y + 4, z, B.GLOWSTONE);
    }
    // Game pedestals
    const pedestals = {
      bedwars: { pos: [-6, Y + 1, -15], deco: B.WOOL_RED },
      skywars: { pos: [6, Y + 1, -15], deco: B.GRASS },
    };
    for (const p of Object.values(pedestals)) {
      const [x, , z] = p.pos;
      b.box(x - 2, Y, z - 2, x + 2, Y, z + 2, B.GOLD_BLOCK);
      b.box(x - 1, Y, z - 1, x + 1, Y, z + 1, p.deco);
      b.set(x, Y, z, B.GLOWSTONE);
    }
    // Big "NOVA" sign behind the pedestals
    const word = 'NOVA';
    let sx = -Math.floor((word.length * 6 - 1) / 2);
    for (const ch of word) {
      BIG_FONT[ch].forEach((row, ry) => [...row].forEach((c, rx) => { if (c === 'X') b.set(sx + rx, Y + 9 - ry, -23, B.GOLD_BLOCK); }));
      sx += 6;
    }
    b.box(-13, Y + 3, -24, 13, Y + 3, -24, B.STONE_BRICKS);
    // Parkour: start pad on the platform edge, jumps out over the void, gold finish
    const parkour = [[22, Y, 0]];
    let px = 22, py = Y, pz = 0;
    const steps = [[3, 0, 0], [3, 1, 1], [2, 1, -2], [3, 0, -1], [2, 1, 2], [3, 1, 1], [3, 0, -2], [2, 1, 0], [3, 1, 2], [3, 0, 0], [2, 1, -1], [3, 1, 0]];
    for (const [dx, dy, dz] of steps) { px += dx; py += dy; pz += dz; parkour.push([px, py, pz]); }
    parkour.forEach(([x, y, z], i) => b.set(x, y, z, i === 0 ? B.DIAMOND_BLOCK : i === parkour.length - 1 ? B.GOLD_BLOCK : (i % 2 ? B.WOOL_BLUE : B.WOOL_WHITE)));
    return b.finish({
      spawn: [0.5, Y + 1, 8.5], spawnYaw: 0, voidY: Y - 12,
      pedestals, parkour,
    });
  },

  // ---------------------------------------------------------------- Bed Wars (4 teams)
  build_bedwars(seed) {
    const b = arenaBuilder(), rnd = mulberry32(seed ^ 0x5bd1);
    const Y = 64, D = 42;
    const teams = [];
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    dirs.forEach(([ux, uz], t) => {
      const team = NOVA_TEAMS[t];
      const cx = ux * D, cz = uz * D;
      const vx = -uz, vz = ux; // sideways
      const at = (u, v) => [cx + ux * u + vx * v, cz + uz * u + vz * v];
      for (let u = -5; u <= 6; u++) for (let v = -5; v <= 5; v++) {
        const [x, z] = at(u, v);
        const edge = Math.abs(v) === 5 || u === -5 || u === 6;
        b.set(x, Y, z, edge ? team.wool : (Math.abs(v) + Math.abs(u)) % 4 === 0 ? B.STONE_BRICKS : B.SANDSTONE);
        const depth = 2 + Math.floor((5 - Math.max(Math.abs(v), Math.abs(u) - 1)) * 0.8 + rnd() * 2);
        for (let k = 1; k <= depth; k++) b.set(x, Y - k, z, k === 1 ? B.SANDSTONE : B.STONE);
      }
      // Bed (head toward the middle), generator at the back, shop at the side
      const [fx, fz] = at(-2, 0), [hx, hz] = at(-3, 0);
      b.set(fx, Y + 1, fz, B.BED_FOOT); b.set(hx, Y + 1, hz, B.BED_HEAD);
      b.data(fx, Y + 1, fz, { facing: t }); b.data(hx, Y + 1, hz, { facing: t });
      const [gx, gz] = at(5, 0);
      b.set(gx, Y, gz, B.IRON_BLOCK);
      for (const v of [-1, 1]) { const [ox, oz] = at(5, v); b.set(ox, Y + 1, oz, B.STONE_SLAB); }
      const [sx, sz] = at(3, -4), [spx, spz] = at(3, 0), [ux2, uz2] = at(3, 4);
      b.set(ux2, Y + 1, uz2, B.CHEST);
      b.data(ux2, Y + 1, uz2, { type: 'chest', slots: new Array(27).fill(0) });
      teams.push({
        spawn: [spx + 0.5, Y + 1, spz + 0.5], yaw: Math.atan2(ux, uz),
        bed: [[fx, Y + 1, fz], [hx, Y + 1, hz]],
        gen: [gx + 0.5, Y + 1.2, gz + 0.5],
        shop: [sx + 0.5, Y + 1, sz + 0.5],
        center: [cx, Y, cz],
      });
    });
    // Diamond islands on the diagonals
    const diamonds = [];
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = sx * 30, z = sz * 30;
      b.island(x, Y, z, 3.6, B.STONE_BRICKS, rnd);
      b.set(x, Y, z, B.DIAMOND_BLOCK);
      diamonds.push([x + 0.5, Y + 1.2, z + 0.5]);
    }
    // Middle island with emerald generators
    b.island(0, Y, 0, 8, B.STONE_BRICKS, rnd);
    b.box(-2, Y + 1, -2, 2, Y + 1, 2, B.STONE_BRICKS);
    b.box(-1, Y + 2, -1, 1, Y + 2, 1, B.STONE_BRICKS);
    const emeralds = [[-5, 5], [5, -5]].map(([x, z]) => { b.set(x, Y, z, B.EMERALD_BLOCK); return [x + 0.5, Y + 1.2, z + 0.5]; });
    b.set(0, Y + 3, 0, B.GLOWSTONE);
    return b.finish({
      teams, diamonds, emeralds, voidY: Y - 22, center: [0.5, Y + 4, 0.5],
      gens: [
        ...teams.map((t) => ({ pos: t.gen, item: ITEM.IRON_INGOT, every: 1.1, max: 48 })),
        ...teams.map((t) => ({ pos: t.gen, item: ITEM.GOLD_INGOT, every: 7, max: 12 })),
        ...diamonds.map((p) => ({ pos: p, item: ITEM.DIAMOND, every: 30, max: 4 })),
        ...emeralds.map((p) => ({ pos: p, item: ITEM.EMERALD, every: 55, max: 2 })),
      ],
    });
  },

  // ---------------------------------------------------------------- SkyWars (8 players)
  build_skywars(seed) {
    const b = arenaBuilder(), rnd = mulberry32(seed ^ 0x51c3);
    const Y = 64, D = 30;
    const islands = [], cages = [];
    const loot = (table, rolls) => Structures._loot(rnd, table, rolls);
    const ISLAND_LOOT = [
      [toolId(1, 3), 1, 1], [toolId(2, 3), 1, 1], [toolId(1, 0), 1, 1], [toolId(2, 1), 1, 1],
      [armorId(1, 0), 1, 1], [armorId(1, 1), 1, 1], [armorId(1, 2), 1, 1], [armorId(1, 3), 1, 1], [armorId(0, 1), 1, 1],
      [B.STONE, 16, 32], [B.PLANKS, 16, 32], [B.COBBLE, 16, 32], [ITEM.BOW, 1, 1], [ITEM.ARROW, 4, 10],
      [ITEM.ENDER_PEARL, 1, 1], [ITEM.SNOWBALL || ITEM.EGG || ITEM.ARROW, 4, 8], [ITEM.BEEF_COOKED, 2, 5], [ITEM.WATER_BUCKET, 1, 1], [ITEM.LAVA_BUCKET, 1, 1],
    ];
    const MID_LOOT = [
      [toolId(4, 3), 1, 1], [toolId(2, 3), 1, 1], [armorId(3, 0), 1, 1], [armorId(3, 1), 1, 1], [armorId(3, 2), 1, 1], [armorId(3, 3), 1, 1],
      [ITEM.ENDER_PEARL, 1, 2], [ITEM.BOW, 1, 1], [ITEM.ARROW, 8, 16], [B.TNT, 1, 3], [ITEM.FLINT_STEEL, 1, 1], [B.STONE, 32, 64], [ITEM.BEEF_COOKED, 4, 8],
    ];
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      const cx = Math.round(Math.cos(a) * D), cz = Math.round(Math.sin(a) * D);
      b.island(cx, Y, cz, 4.2, B.GRASS, rnd);
      if (i % 2 === 0) b.tree(cx + (cx > 0 ? 2 : -2), Y + 1, cz + (cz > 0 ? 2 : -2), B.LOG, B.LEAVES, 4);
      // Two chests facing the spawn
      const chests = [[cx + Math.round(-Math.sin(a) * 2), cz + Math.round(Math.cos(a) * 2)], [cx + Math.round(Math.sin(a) * 2), cz + Math.round(-Math.cos(a) * 2)]];
      for (const [x, z] of chests) {
        b.set(x, Y + 1, z, B.CHEST);
        b.data(x, Y + 1, z, { type: 'chest', slots: loot(ISLAND_LOOT, 6) });
      }
      // Glass cage the player waits in
      const cy = Y + 6;
      const cage = [];
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = 0; dy <= 4; dy++) {
        const shell = dy === 0 || dy === 4 || Math.abs(dx) === 1 || Math.abs(dz) === 1;
        if (!shell) continue;
        if (dy > 0 && dy < 4 && Math.abs(dx) === 1 && Math.abs(dz) === 1) continue;
        b.set(cx + dx, cy + dy, cz + dz, B.GLASS);
        cage.push([cx + dx, cy + dy, cz + dz]);
      }
      cages.push(...cage);
      islands.push({ spawn: [cx + 0.5, cy + 1, cz + 0.5], yaw: Math.atan2(cx, cz), center: [cx, Y, cz], chests: chests.map(([x, z]) => [x, Y + 1, z]) });
    }
    // Middle island: a hill with the best chests
    b.island(0, Y, 0, 8.5, B.GRASS, rnd);
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
      const h = Math.max(0, 3 - Math.floor(Math.hypot(dx, dz) * 0.75));
      for (let k = 1; k <= h; k++) b.set(dx, Y + k, dz, k === h ? B.GRASS : B.DIRT);
    }
    const mid = [[-2, -5], [2, 5], [5, -2], [-5, 2]].map(([x, z]) => {
      b.set(x, Y + 1, z, B.CHEST);
      b.data(x, Y + 1, z, { type: 'chest', slots: loot(MID_LOOT, 7) });
      return [x, Y + 1, z];
    });
    b.set(0, Y + 4, 0, B.ENCHANTING_TABLE);
    return b.finish({ islands, cages, mid, voidY: Y - 22, center: [0.5, Y + 6, 0.5] });
  },
};
