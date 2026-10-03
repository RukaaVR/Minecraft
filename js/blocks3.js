// More blocks: biome woods, building shapes (stairs, slabs, fences, panes, ladders),
// redstone, enchanting, the End, sugar cane and spawners.
'use strict';

Object.assign(T, {
  BIRCH_LOG: 256, BIRCH_LOG_TOP: 257, BIRCH_LEAVES: 258, BIRCH_PLANKS: 259,
  SPRUCE_LOG: 260, SPRUCE_LOG_TOP: 261, SPRUCE_LEAVES: 262, SPRUCE_PLANKS: 263,
  LADDER: 264, LAPIS_ORE: 265, LAPIS_BLOCK: 266, REDSTONE_ORE: 267, WIRE_OFF: 268, WIRE_ON: 269,
  RTORCH_ON: 270, RTORCH_OFF: 271, LEVER: 272, LAMP_OFF: 273, LAMP_ON: 274, REDSTONE_BLOCK: 275,
  ENCH_TOP: 276, ENCH_SIDE: 277, END_STONE: 278, FRAME_TOP: 279, FRAME_SIDE: 280, FRAME_EYE_TOP: 281,
  END_PORTAL: 282, DRAGON_EGG: 283, SPAWNER: 284, SUGAR_CANE: 285, GLASS_PANE_SIDE: 286, ITEM3: 288,
});
Object.assign(B, {
  BIRCH_LOG: 88, BIRCH_LEAVES: 89, BIRCH_PLANKS: 90, SPRUCE_LOG: 91, SPRUCE_LEAVES: 92, SPRUCE_PLANKS: 93,
  OAK_SLAB: 94, COBBLE_SLAB: 95, STONE_SLAB: 96, OAK_STAIRS: 97, COBBLE_STAIRS: 98, BRICK_STAIRS: 99,
  OAK_FENCE: 100, GLASS_PANE: 101, LADDER: 102, LAPIS_ORE: 103, LAPIS_BLOCK: 104, REDSTONE_ORE: 105,
  WIRE: 106, RTORCH: 107, RTORCH_OFF: 108, LEVER: 109, BUTTON: 110, PLATE: 111, LAMP: 112, LAMP_ON: 113,
  REDSTONE_BLOCK: 114, ENCHANTING_TABLE: 115, END_STONE: 116, END_FRAME: 117, END_PORTAL: 118,
  DRAGON_EGG: 119, NETHER_FENCE: 120, WIRE_ON: 121, END_FRAME_EYE: 122, SUGAR_CANE: 123, SPAWNER: 124,
});
Object.assign(ITEM, {
  LAPIS: 292, REDSTONE: 293, ENDER_PEARL: 294, EYE_OF_ENDER: 295, BLAZE_ROD: 296, BLAZE_POWDER: 297,
  SLIMEBALL: 298, SHEARS: 299, BOAT: 360, BOOK: 361, PAPER: 362,
});

// ---- shapes: (get(dx,dy,dz) -> neighbour id, data) -> boxes in block-local coords
const FACING_DIR = [[0, 1], [-1, 0], [0, -1], [1, 0]]; // facing 0:+z 1:-x 2:-z 3:+x
const slabShape = (get, d) => (d && d.top ? [[0, 0.5, 0, 1, 1, 1]] : [[0, 0, 0, 1, 0.5, 1]]);
const stairShape = (get, d) => {
  d = d || {};
  const top = !!d.top, f = d.facing || 0;
  const base = top ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1];
  const y0 = top ? 0 : 0.5, y1 = top ? 0.5 : 1;
  const [dx, dz] = FACING_DIR[f];
  const step = [dx > 0 ? 0.5 : 0, y0, dz > 0 ? 0.5 : 0, dx < 0 ? 0.5 : 1, y1, dz < 0 ? 0.5 : 1];
  return [base, step];
};
function fenceConnects(id, self) {
  const b = BLOCKS[id];
  return id === self || (b && (b.fenceLike || (OPAQUE[id] && b.solid)));
}
const fenceShape = (h) => (get, d, self) => {
  const out = [[6 / 16, 0, 6 / 16, 10 / 16, h, 10 / 16]];
  const arms = h > 1 ? [[6 / 16, 1]] : [[6 / 16, 9 / 16], [12 / 16, 15 / 16]];
  const add = (dx, dz) => {
    for (const [a0, a1] of arms) {
      if (dx) out.push([dx > 0 ? 10 / 16 : 0, a0, 7 / 16, dx > 0 ? 1 : 6 / 16, Math.min(a1, h), 9 / 16]);
      else out.push([7 / 16, a0, dz > 0 ? 10 / 16 : 0, 9 / 16, Math.min(a1, h), dz > 0 ? 1 : 6 / 16]);
    }
  };
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (fenceConnects(get(dx, 0, dz), self)) add(dx, dz);
  return out;
};
const paneShape = (get, d, self) => {
  const out = [[7 / 16, 0, 7 / 16, 9 / 16, 1, 9 / 16]];
  const ok = (id) => id === self || id === B.GLASS || (OPAQUE[id] && BLOCKS[id].solid);
  if (ok(get(1, 0, 0))) out.push([9 / 16, 0, 7 / 16, 1, 1, 9 / 16]);
  if (ok(get(-1, 0, 0))) out.push([0, 0, 7 / 16, 7 / 16, 1, 9 / 16]);
  if (ok(get(0, 0, 1))) out.push([7 / 16, 0, 9 / 16, 9 / 16, 1, 1]);
  if (ok(get(0, 0, -1))) out.push([7 / 16, 0, 0, 9 / 16, 1, 7 / 16]);
  return out;
};
// Attached to the wall on side `face` (FACES index: 0 -x, 1 +x, 2 -y, 3 +y, 4 -z, 5 +z)
function wallBox(face, t, w0, w1, h0, h1) {
  switch (face) {
    case 0: return [0, h0, w0, t, h1, w1];
    case 1: return [1 - t, h0, w0, 1, h1, w1];
    case 4: return [w0, h0, 0, w1, h1, t];
    case 5: return [w0, h0, 1 - t, w1, h1, 1];
    case 3: return [w0, 1 - t, w0, w1, 1, w1];
    default: return [w0, 0, w0, w1, t, w1];
  }
}
const ladderShape = (get, d) => [wallBox(d && d.face !== undefined ? d.face : 4, 2 / 16, 0, 1, 0, 1)];
const leverShape = (get, d) => [wallBox(d && d.face !== undefined ? d.face : 2, 3 / 16, 5 / 16, 11 / 16, 4 / 16, 12 / 16)];
const buttonShape = (get, d) => [wallBox(d && d.face !== undefined ? d.face : 2, d && d.on ? 1 / 16 : 2 / 16, 5 / 16, 11 / 16, 6 / 16, 10 / 16)];

const PLANK_TYPES = [B.PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS];
const LOG_TYPES = [B.LOG, B.BIRCH_LOG, B.SPRUCE_LOG];

defBlock(B.BIRCH_LOG, 'Birch Log', [T.BIRCH_LOG_TOP, T.BIRCH_LOG_TOP, T.BIRCH_LOG], { hardness: 2, tool: 'axe', sound: 'wood' });
defBlock(B.BIRCH_LEAVES, 'Birch Leaves', T.BIRCH_LEAVES, { cutout: true, leaves: true, hardness: 0.2, sound: 'grass', lightCost: 1, drops: (r) => (r() < 0.05 ? [[B.SAPLING, 1]] : r() < 0.02 ? [[ITEM.STICK, 1]] : []) });
defBlock(B.BIRCH_PLANKS, 'Birch Planks', T.BIRCH_PLANKS, { hardness: 2, tool: 'axe', sound: 'wood' });
defBlock(B.SPRUCE_LOG, 'Spruce Log', [T.SPRUCE_LOG_TOP, T.SPRUCE_LOG_TOP, T.SPRUCE_LOG], { hardness: 2, tool: 'axe', sound: 'wood' });
defBlock(B.SPRUCE_LEAVES, 'Spruce Leaves', T.SPRUCE_LEAVES, { cutout: true, leaves: true, hardness: 0.2, sound: 'grass', lightCost: 1, drops: (r) => (r() < 0.05 ? [[B.SAPLING, 1]] : []) });
defBlock(B.SPRUCE_PLANKS, 'Spruce Planks', T.SPRUCE_PLANKS, { hardness: 2, tool: 'axe', sound: 'wood' });
defBlock(B.OAK_SLAB, 'Oak Slab', T.PLANKS, { model: 'shape', shape: slabShape, hardness: 2, tool: 'axe', sound: 'wood', baseBlock: B.PLANKS });
defBlock(B.COBBLE_SLAB, 'Cobblestone Slab', T.COBBLE, { model: 'shape', shape: slabShape, hardness: 2, tool: 'pickaxe', level: 0, baseBlock: B.COBBLE });
defBlock(B.STONE_SLAB, 'Stone Slab', T.STONE, { model: 'shape', shape: slabShape, hardness: 2, tool: 'pickaxe', level: 0, baseBlock: B.STONE });
defBlock(B.OAK_STAIRS, 'Oak Stairs', T.PLANKS, { model: 'shape', shape: stairShape, hardness: 2, tool: 'axe', sound: 'wood' });
defBlock(B.COBBLE_STAIRS, 'Cobblestone Stairs', T.COBBLE, { model: 'shape', shape: stairShape, hardness: 2, tool: 'pickaxe', level: 0 });
defBlock(B.BRICK_STAIRS, 'Stone Brick Stairs', T.STONE_BRICKS, { model: 'shape', shape: stairShape, hardness: 1.5, tool: 'pickaxe', level: 0 });
defBlock(B.OAK_FENCE, 'Oak Fence', T.PLANKS, { model: 'shape', shape: fenceShape(1), collide: fenceShape(1.5), hardness: 2, tool: 'axe', sound: 'wood' });
defBlock(B.NETHER_FENCE, 'Nether Brick Fence', T.NETHER_BRICKS, { model: 'shape', shape: fenceShape(1), collide: fenceShape(1.5), hardness: 2, tool: 'pickaxe', level: 0 });
defBlock(B.GLASS_PANE, 'Glass Pane', [T.GLASS, T.GLASS, T.GLASS], { model: 'shape', shape: paneShape, cutout: true, hardness: 0.3, sound: 'glass', drops: () => [] });
defBlock(B.LADDER, 'Ladder', T.LADDER, { model: 'shape', shape: ladderShape, cutout: true, solid: false, climbable: true, hardness: 0.4, tool: 'axe', sound: 'wood', needsWall: true });
defBlock(B.LAPIS_ORE, 'Lapis Lazuli Ore', T.LAPIS_ORE, { hardness: 3, tool: 'pickaxe', level: 1, drops: (r) => [[ITEM.LAPIS, 4 + Math.floor(r() * 5)]] });
defBlock(B.LAPIS_BLOCK, 'Block of Lapis Lazuli', T.LAPIS_BLOCK, { hardness: 3, tool: 'pickaxe', level: 1 });
defBlock(B.REDSTONE_ORE, 'Redstone Ore', T.REDSTONE_ORE, { hardness: 3, tool: 'pickaxe', level: 2, drops: (r) => [[ITEM.REDSTONE, 4 + Math.floor(r() * 2)]] });
defBlock(B.WIRE, 'Redstone Dust', T.WIRE_OFF, { model: 'shape', shape: () => [[0, 0, 0, 1, 1 / 32, 1]], cutout: true, solid: false, hardness: 0, sound: 'stone', needsSupport: true, redstone: 'wire', inCreative: false, drops: () => [[ITEM.REDSTONE, 1]] });
defBlock(B.WIRE_ON, 'Redstone Dust', T.WIRE_ON, { model: 'shape', shape: () => [[0, 0, 0, 1, 1 / 32, 1]], cutout: true, solid: false, hardness: 0, sound: 'stone', needsSupport: true, redstone: 'wire', inCreative: false, emissive: true, drops: () => [[ITEM.REDSTONE, 1]] });
defBlock(B.RTORCH, 'Redstone Torch', T.RTORCH_ON, { solid: false, cutout: true, model: 'torch', hardness: 0, sound: 'wood', light: 7, needsSupport: true, redstone: 'torch' });
defBlock(B.RTORCH_OFF, 'Redstone Torch', T.RTORCH_OFF, { solid: false, cutout: true, model: 'torch', hardness: 0, sound: 'wood', needsSupport: true, redstone: 'torch', inCreative: false, drops: () => [[B.RTORCH, 1]] });
defBlock(B.LEVER, 'Lever', T.LEVER, { model: 'shape', shape: leverShape, cutout: true, solid: false, hardness: 0.5, sound: 'wood', redstone: 'lever', needsWall: true });
defBlock(B.BUTTON, 'Stone Button', T.STONE, { model: 'shape', shape: buttonShape, solid: false, hardness: 0.5, redstone: 'button', needsWall: true });
defBlock(B.PLATE, 'Stone Pressure Plate', T.STONE, { model: 'shape', shape: (g, d) => [[1 / 16, 0, 1 / 16, 15 / 16, d && d.on ? 0.5 / 16 : 1 / 16, 15 / 16]], solid: false, hardness: 0.5, redstone: 'plate', needsSupport: true });
defBlock(B.LAMP, 'Redstone Lamp', T.LAMP_OFF, { hardness: 0.3, sound: 'glass', redstone: 'lamp' });
defBlock(B.LAMP_ON, 'Redstone Lamp', T.LAMP_ON, { hardness: 0.3, sound: 'glass', redstone: 'lamp', light: 15, emissive: true, inCreative: false, drops: () => [[B.LAMP, 1]] });
defBlock(B.REDSTONE_BLOCK, 'Block of Redstone', T.REDSTONE_BLOCK, { hardness: 5, tool: 'pickaxe', level: 0, redstone: 'source' });
defBlock(B.ENCHANTING_TABLE, 'Enchanting Table', [T.ENCH_TOP, T.OBSIDIAN, T.ENCH_SIDE], { model: 'shape', shape: () => [[0, 0, 0, 1, 0.75, 1]], hardness: 5, tool: 'pickaxe', level: 0, light: 7 });
defBlock(B.END_STONE, 'End Stone', T.END_STONE, { hardness: 3, tool: 'pickaxe', level: 0 });
defBlock(B.END_FRAME, 'End Portal Frame', [T.FRAME_TOP, T.END_STONE, T.FRAME_SIDE], { model: 'shape', shape: () => [[0, 0, 0, 1, 13 / 16, 1]], hardness: -1, light: 1 });
defBlock(B.END_FRAME_EYE, 'End Portal Frame', [T.FRAME_EYE_TOP, T.END_STONE, T.FRAME_SIDE], { model: 'shape', shape: () => [[0, 0, 0, 1, 13 / 16, 1], [4 / 16, 13 / 16, 4 / 16, 12 / 16, 1, 12 / 16]], hardness: -1, light: 1, inCreative: false });
defBlock(B.END_PORTAL, 'End Portal', T.END_PORTAL, { model: 'shape', shape: () => [[0, 0.7, 0, 1, 0.75, 1]], solid: false, translucent: true, hardness: -1, light: 15, inCreative: false, matOverride: 13, drops: () => [] });
defBlock(B.DRAGON_EGG, 'Dragon Egg', T.DRAGON_EGG, { model: 'shape', shape: () => [[2 / 16, 0, 2 / 16, 14 / 16, 14 / 16, 14 / 16], [4 / 16, 14 / 16, 4 / 16, 12 / 16, 1, 12 / 16]], hardness: 3, light: 1, gravity: true });
defBlock(B.SUGAR_CANE, 'Sugar Cane', T.SUGAR_CANE, { solid: false, cutout: true, model: 'cross', hardness: 0, sound: 'grass', needsSupport: true });
defBlock(B.SPAWNER, 'Monster Spawner', T.SPAWNER, { cutout: true, hardness: 5, tool: 'pickaxe', level: 0, drops: () => [], inCreative: false });
BLOCKS[B.OAK_FENCE].fenceLike = true;
BLOCKS[B.NETHER_FENCE].fenceLike = true;
buildBlockTables();

// ---- items
defItem(ITEM.LAPIS, 'Lapis Lazuli', T.ITEM3 + 0);
defItem(ITEM.REDSTONE, 'Redstone Dust', T.ITEM3 + 1, { places: B.WIRE });
defItem(ITEM.ENDER_PEARL, 'Ender Pearl', T.ITEM3 + 2, { stack: 16 });
defItem(ITEM.EYE_OF_ENDER, 'Eye of Ender', T.ITEM3 + 3);
defItem(ITEM.BLAZE_ROD, 'Blaze Rod', T.ITEM3 + 4, { fuel: 120 });
defItem(ITEM.BLAZE_POWDER, 'Blaze Powder', T.ITEM3 + 5);
defItem(ITEM.SLIMEBALL, 'Slimeball', T.ITEM3 + 6);
defItem(ITEM.SHEARS, 'Shears', T.ITEM3 + 7, { stack: 1, tool: { type: 'shears', level: 0, speed: 1.5, uses: 238, damage: 1 } });
defItem(ITEM.BOAT, 'Oak Boat', T.ITEM3 + 8, { stack: 1 });
defItem(ITEM.BOOK, 'Book', T.ITEM3 + 9);
defItem(ITEM.PAPER, 'Paper', T.ITEM3 + 10);
for (const id of Object.values(B)) {
  const b = BLOCKS[id];
  if (!b || ITEMS[id] || id === B.AIR) continue;
  const fuel = PLANK_TYPES.includes(id) || LOG_TYPES.includes(id) || id === B.OAK_SLAB || id === B.OAK_STAIRS || id === B.OAK_FENCE || id === B.LADDER ? 15 : 0;
  ITEMS[id] = { id, name: b.name, tile: b.tiles[0], stack: 64, block: id, food: 0, saturation: 0, tool: null, fuel };
}
if (ITEMS[B.SUGAR_CANE]) ITEMS[B.SUGAR_CANE].tile = T.SUGAR_CANE;
ITEMS[ITEM.REDSTONE].block = B.WIRE;
ALL_ITEM_IDS.length = 0;
for (const id of Object.keys(ITEMS).map(Number)) ALL_ITEM_IDS.push(id);

// ---- recipes (planks of any wood work wherever oak planks do: see matchRecipe)
shapeless([B.BIRCH_LOG], B.BIRCH_PLANKS, 4);
shapeless([B.SPRUCE_LOG], B.SPRUCE_PLANKS, 4);
shaped(['PPP'], { P: B.PLANKS }, B.OAK_SLAB, 6);
shaped(['CCC'], { C: B.COBBLE }, B.COBBLE_SLAB, 6);
shaped(['SSS'], { S: B.STONE }, B.STONE_SLAB, 6);
shaped(['P  ', 'PP ', 'PPP'], { P: B.PLANKS }, B.OAK_STAIRS, 4);
shaped(['C  ', 'CC ', 'CCC'], { C: B.COBBLE }, B.COBBLE_STAIRS, 4);
shaped(['C  ', 'CC ', 'CCC'], { C: B.STONE_BRICKS }, B.BRICK_STAIRS, 4);
shaped(['PSP', 'PSP'], { P: B.PLANKS, S: ITEM.STICK }, B.OAK_FENCE, 3);
shaped(['NNN', 'NNN'], { N: B.NETHER_BRICKS }, B.NETHER_FENCE, 6);
shaped(['GGG', 'GGG'], { G: B.GLASS }, B.GLASS_PANE, 16);
shaped(['S S', 'SSS', 'S S'], { S: ITEM.STICK }, B.LADDER, 3);
shaped(['R', 'S'], { R: ITEM.REDSTONE, S: ITEM.STICK }, B.RTORCH);
shaped(['S', 'C'], { S: ITEM.STICK, C: B.COBBLE }, B.LEVER);
shapeless([B.STONE], B.BUTTON);
shaped(['SS'], { S: B.STONE }, B.PLATE);
shaped([' R ', 'RGR', ' R '], { R: ITEM.REDSTONE, G: B.GLOWSTONE }, B.LAMP);
shaped(['RRR', 'RRR', 'RRR'], { R: ITEM.REDSTONE }, B.REDSTONE_BLOCK);
shapeless([B.REDSTONE_BLOCK], ITEM.REDSTONE, 9);
shaped(['LLL', 'LLL', 'LLL'], { L: ITEM.LAPIS }, B.LAPIS_BLOCK);
shapeless([B.LAPIS_BLOCK], ITEM.LAPIS, 9);
shaped([' B ', 'DOD', 'OOO'], { B: ITEM.BOOK, D: ITEM.DIAMOND, O: B.OBSIDIAN }, B.ENCHANTING_TABLE);
shaped(['CCC'], { C: B.SUGAR_CANE }, ITEM.PAPER, 3);
shapeless([ITEM.PAPER, ITEM.PAPER, ITEM.PAPER, ITEM.LEATHER], ITEM.BOOK);
shaped(['PPP', 'BBB', 'PPP'], { P: B.PLANKS, B: ITEM.BOOK }, B.BOOKSHELF);
shapeless([ITEM.BLAZE_ROD], ITEM.BLAZE_POWDER, 2);
shapeless([ITEM.ENDER_PEARL, ITEM.BLAZE_POWDER], ITEM.EYE_OF_ENDER);
shaped(['P P', 'PPP'], { P: B.PLANKS }, ITEM.BOAT);
shaped([' I', 'I '], { I: ITEM.IRON_INGOT }, ITEM.SHEARS);
// The old leather-only bookshelf recipe is superseded by books
for (let i = RECIPES.length - 1; i >= 0; i--) {
  const r = RECIPES[i];
  if (r.out === B.BOOKSHELF && r.key && r.key.B === ITEM.LEATHER) RECIPES.splice(i, 1);
}
SMELTING[B.LAPIS_ORE] = ITEM.LAPIS;
SMELTING[B.REDSTONE_ORE] = ITEM.REDSTONE;
SMELTING[B.BIRCH_LOG] = ITEM.CHARCOAL;
SMELTING[B.SPRUCE_LOG] = ITEM.CHARCOAL;
SMELTING[B.SAND] = B.GLASS;

// Any wood type counts as oak for recipes (Minecraft uses item tags for this)
const RECIPE_ALIAS = { [B.BIRCH_PLANKS]: B.PLANKS, [B.SPRUCE_PLANKS]: B.PLANKS, [B.BIRCH_LOG]: B.LOG, [B.SPRUCE_LOG]: B.LOG };
const _matchRecipeExact = matchRecipe;
// eslint-disable-next-line no-func-assign
matchRecipe = function (grid, w) {
  return _matchRecipeExact(grid, w) || _matchRecipeExact(grid.map((id) => RECIPE_ALIAS[id] || id), w);
};

// ---- textures
function paintTiles3(painter, vary, clear, h) {
  const { fill, speckle, stoneBase, cobbleLike } = h;
  let p;
  const logSide = (tile, seed, base, dark, birch) => {
    const q = painter(tile, seed);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      let c = vary(q.rand, base, 14);
      if (birch) { if ((x * 3 + y * 7) % 17 === 0 || (y % 5 === 0 && x % 6 < 3)) c = vary(q.rand, dark, 10); }
      else if (x % 4 === 0 || (x * 7 + y) % 11 === 0) c = [c[0] - 22, c[1] - 22, c[2] - 22];
      q.set(x, y, c[0], c[1], c[2]);
    }
  };
  const logTop = (tile, seed, bark, wood) => {
    const q = painter(tile, seed);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      if (d > 6.5) { const c = vary(q.rand, bark, 14); q.set(x, y, c[0], c[1], c[2]); continue; }
      const ring = Math.floor(d) % 2 === 0 ? 0 : -20;
      const c = vary(q.rand, wood, 10); q.set(x, y, c[0] + ring, c[1] + ring, c[2] + ring);
    }
  };
  const leaves = (tile, seed, a, b, holes) => {
    const q = painter(tile, seed);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const r = q.rand();
      if (r < holes) { q.set(x, y, 0, 0, 0, 0); continue; }
      const c = vary(q.rand, r < 0.5 ? a : b, 26); q.set(x, y, c[0], c[1], c[2]);
    }
  };
  const planks = (tile, seed, base) => {
    const q = painter(tile, seed);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const seam = (y % 4 === 3) || (x === ((Math.floor(y / 4) * 5) % 16)) ? -30 : 0;
      const c = vary(q.rand, base, 12); q.set(x, y, c[0] + seam, c[1] + seam, c[2] + seam);
    }
  };
  logSide(T.BIRCH_LOG, 900, [222, 220, 210], [40, 40, 40], true);
  logTop(T.BIRCH_LOG_TOP, 901, [220, 218, 210], [200, 175, 120]);
  leaves(T.BIRCH_LEAVES, 902, [100, 150, 60], [125, 170, 75], 0.2);
  planks(T.BIRCH_PLANKS, 903, [200, 180, 125]);
  logSide(T.SPRUCE_LOG, 904, [70, 50, 30], [50, 35, 20], false);
  logTop(T.SPRUCE_LOG_TOP, 905, [70, 50, 30], [130, 95, 55]);
  leaves(T.SPRUCE_LEAVES, 906, [45, 85, 50], [60, 100, 60], 0.12);
  planks(T.SPRUCE_PLANKS, 907, [115, 85, 50]);
  // ladder
  p = painter(T.LADDER, 908); clear(p);
  for (let y = 0; y < TILE; y++) { for (const x of [2, 3, 12, 13]) { const c = vary(p.rand, [130, 95, 55], 12); p.set(x, y, c[0], c[1], c[2]); } }
  for (const y of [2, 6, 10, 14]) for (let x = 4; x < 12; x++) { const c = vary(p.rand, [150, 110, 65], 12); p.set(x, y, c[0], c[1], c[2]); }
  const ore = (tile, seed, color) => {
    const q = painter(tile, seed); stoneBase(q);
    for (let n = 0; n < 7; n++) {
      const cx = 2 + Math.floor(q.rand() * 12), cy = 2 + Math.floor(q.rand() * 12);
      for (let k = 0; k < 4; k++) { const c = vary(q.rand, color, 30); q.set(cx + Math.floor(q.rand() * 3) - 1, cy + Math.floor(q.rand() * 3) - 1, c[0], c[1], c[2]); }
    }
  };
  ore(T.LAPIS_ORE, 909, [30, 70, 190]);
  ore(T.REDSTONE_ORE, 910, [220, 20, 20]);
  const solid = (tile, seed, base, amt) => { const q = painter(tile, seed); fill(q, base, amt); for (let i = 0; i < TILE; i++) { q.set(i, 0, base[0] * 0.7, base[1] * 0.7, base[2] * 0.7); q.set(0, i, base[0] * 0.7, base[1] * 0.7, base[2] * 0.7); } return q; };
  solid(T.LAPIS_BLOCK, 911, [35, 70, 170], 22);
  solid(T.REDSTONE_BLOCK, 912, [190, 20, 15], 30);
  const wire = (tile, seed, col) => {
    const q = painter(tile, seed); clear(q);
    for (let i = 0; i < TILE; i++) for (const w of [7, 8]) { q.set(i, w, col[0], col[1], col[2]); q.set(w, i, col[0], col[1], col[2]); }
    for (let n = 0; n < 10; n++) q.set(5 + Math.floor(q.rand() * 6), 5 + Math.floor(q.rand() * 6), col[0] * 0.8, col[1], col[2]);
  };
  wire(T.WIRE_OFF, 913, [110, 10, 8]);
  wire(T.WIRE_ON, 914, [255, 40, 20]);
  const rtorch = (tile, seed, flame) => {
    const q = painter(tile, seed); clear(q);
    for (let y = 8; y < 16; y++) for (let x = 7; x < 9; x++) { const c = vary(q.rand, [120, 90, 50], 20); q.set(x, y, c[0], c[1], c[2]); }
    q.set(7, 7, ...flame); q.set(8, 7, ...flame); q.set(7, 6, ...flame); q.set(8, 6, flame[0], flame[1] + 40, flame[2] + 30);
  };
  rtorch(T.RTORCH_ON, 915, [255, 30, 20]);
  rtorch(T.RTORCH_OFF, 916, [90, 20, 15]);
  p = painter(T.LEVER, 917); cobbleLike(p);
  for (let y = 2; y < 12; y++) for (let x = 7; x < 9; x++) p.set(x, y, 130, 95, 55);
  const lamp = (tile, seed, on) => {
    const q = painter(tile, seed);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const frame = x % 5 === 0 || y % 5 === 0;
      const c = frame ? vary(q.rand, on ? [150, 90, 40] : [70, 40, 25], 10) : vary(q.rand, on ? [255, 220, 150] : [120, 75, 45], 20);
      q.set(x, y, c[0], c[1], c[2]);
    }
  };
  lamp(T.LAMP_OFF, 918, false);
  lamp(T.LAMP_ON, 919, true);
  p = painter(T.ENCH_TOP, 920);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const edge = x < 2 || y < 2 || x > 13 || y > 13;
    const c = edge ? vary(p.rand, [30, 20, 45], 10) : vary(p.rand, [160, 30, 40], 18);
    p.set(x, y, c[0], c[1], c[2]);
  }
  for (let x = 4; x < 12; x++) { p.set(x, 7, 230, 220, 200); p.set(x, 8, 220, 210, 190); }
  p = painter(T.ENCH_SIDE, 921); fill(p, [25, 18, 38], 12);
  for (let x = 0; x < TILE; x++) for (let y = 0; y < 3; y++) { const c = vary(p.rand, [160, 30, 40], 18); p.set(x, y + 4, c[0], c[1], c[2]); }
  p = painter(T.END_STONE, 922); fill(p, [222, 224, 165], 18); speckle(p, [190, 190, 130], 22, 2);
  const frameTop = (tile, seed, eye) => {
    const q = painter(tile, seed);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const inner = x > 3 && x < 12 && y > 3 && y < 12;
      const c = inner ? vary(q.rand, [50, 110, 90], 14) : vary(q.rand, [200, 210, 160], 16);
      q.set(x, y, c[0], c[1], c[2]);
    }
    if (eye) for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) { const d = Math.hypot(x - 7.5, y - 7.5); q.set(x, y, d < 1.5 ? 20 : 40, d < 1.5 ? 30 : 160, d < 1.5 ? 20 : 110); }
  };
  frameTop(T.FRAME_TOP, 923, false);
  frameTop(T.FRAME_EYE_TOP, 924, true);
  p = painter(T.FRAME_SIDE, 925); fill(p, [200, 210, 160], 16);
  for (let x = 0; x < TILE; x++) for (let y = 0; y < 4; y++) { const c = vary(p.rand, [50, 110, 90], 14); p.set(x, y, c[0], c[1], c[2]); }
  p = painter(T.END_PORTAL, 926);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const r = p.rand();
    if (r < 0.06) { const c = vary(p.rand, [120, 230, 200], 30); p.set(x, y, c[0], c[1], c[2]); }
    else { const c = vary(p.rand, [10, 15, 25], 10); p.set(x, y, c[0], c[1], c[2]); }
  }
  p = painter(T.DRAGON_EGG, 927); fill(p, [20, 10, 30], 14); speckle(p, [70, 30, 100], 18);
  p = painter(T.SPAWNER, 928); clear(p);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if (x % 5 === 0 || y % 5 === 0 || x === 15 || y === 15) { const c = vary(p.rand, [40, 50, 60], 15); p.set(x, y, c[0], c[1], c[2]); }
  p = painter(T.SUGAR_CANE, 929); clear(p);
  for (const x0 of [3, 8, 12]) for (let y = 0; y < TILE; y++) {
    const node = y % 5 === 0;
    const c = vary(p.rand, node ? [150, 190, 100] : [120, 180, 80], 18);
    p.set(x0, y, c[0], c[1], c[2]); p.set(x0 + 1, y, c[0] - 15, c[1] - 15, c[2] - 15);
  }

  // ---- item sprites
  const outline = (q) => {
    const solidPx = [];
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) solidPx.push(q.get(x, y)[3] > 0);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      if (solidPx[y * TILE + x]) continue;
      const n = (dx, dy) => { const xx = x + dx, yy = y + dy; return xx >= 0 && yy >= 0 && xx < TILE && yy < TILE && solidPx[yy * TILE + xx]; };
      if (n(1, 0) || n(-1, 0) || n(0, 1) || n(0, -1)) q.set(x, y, 30, 25, 20);
    }
  };
  const blob = (tile, seed, color, fn, amt = 18) => {
    const q = painter(tile, seed); clear(q);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const v = fn(x, y);
      if (!v) continue;
      const c = vary(q.rand, Array.isArray(v) ? v : color, amt); q.set(x, y, c[0], c[1], c[2]);
    }
    outline(q);
  };
  const ell = (cx, cy, rx, ry) => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  const S = T.ITEM3;
  blob(S + 0, 950, [40, 80, 200], (x, y) => ell(7.5, 8, 4.5, 5)(x, y) && (x + y < 11 ? [120, 160, 255] : true));
  blob(S + 1, 951, [200, 20, 15], (x, y) => ell(7.5, 9, 5, 3.5)(x, y) && (x * y) % 3 !== 0);
  blob(S + 2, 952, [20, 90, 80], (x, y) => ell(7.5, 7.5, 5, 5)(x, y) && (Math.hypot(x - 6, y - 6) < 2 ? [120, 230, 200] : true));
  blob(S + 3, 953, [40, 150, 90], (x, y) => ell(7.5, 7.5, 5, 5)(x, y) && (Math.hypot(x - 7.5, y - 7.5) < 1.6 ? [10, 30, 10] : Math.abs(x - 7.5) < 2.5 && Math.abs(y - 7.5) < 1.5 ? [200, 230, 120] : true));
  blob(S + 4, 954, [250, 190, 40], (x, y) => (x + y === 15 || x + y === 16) && x >= 3 && x <= 12, 30);
  blob(S + 5, 955, [250, 170, 30], (x, y) => y >= 8 && Math.abs(x - 7.5) <= (y - 6) * 0.9, 40);
  blob(S + 6, 956, [110, 200, 90], (x, y) => ell(7.5, 8, 4.5, 4.5)(x, y) && (x + y < 12 ? [180, 250, 160] : true));
  blob(S + 7, 957, [200, 200, 200], (x, y) => ((x - y === 0 || x - y === 1) && x >= 4 && x <= 11) || ((x + y === 15 || x + y === 16) && x >= 4 && x <= 11) || (ell(4, 12, 2, 2)(x, y) ? [150, 40, 40] : false) || (ell(12, 12, 2, 2)(x, y) ? [150, 40, 40] : false));
  blob(S + 8, 958, [150, 110, 60], (x, y) => (y >= 8 && y <= 11 && x >= 1 && x <= 14 && (y > 8 || x <= 2 || x >= 13)), 15);
  blob(S + 9, 959, [120, 60, 40], (x, y) => x >= 3 && x <= 12 && y >= 2 && y <= 13 && (x >= 10 ? [235, 230, 210] : true), 12);
  blob(S + 10, 960, [240, 240, 230], (x, y) => x >= 3 && x <= 12 && y >= 2 && y <= 13, 8);
  // XP orb (entity sprite)
  blob(S + 11, 961, [120, 230, 40], (x, y) => ell(7.5, 7.5, 4, 4)(x, y) && (Math.hypot(x - 6.5, y - 6.5) < 1.5 ? [240, 255, 160] : true), 30);
}
