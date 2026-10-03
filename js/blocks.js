// Block definitions and the procedurally painted texture atlas.
'use strict';

const TILE = 16;          // pixels per tile
const ATLAS_COLS = 16;
const ATLAS_ROWS = 24;

// Tile indices in the atlas
const T = {
  GRASS_TOP: 0, GRASS_SIDE: 1, DIRT: 2, STONE: 3, LOG_SIDE: 4, LOG_TOP: 5,
  LEAVES: 6, SAND: 7, WATER: 8, PLANKS: 9, COBBLE: 10, GLASS: 11, BRICK: 12,
  BEDROCK: 13, SNOW: 14, SNOW_SIDE: 15, COAL: 16, IRON: 17, GOLD: 18,
  DIAMOND: 19, GRAVEL: 20, WOOL_WHITE: 21, WOOL_RED: 22, WOOL_BLUE: 23,
  WOOL_YELLOW: 24, OBSIDIAN: 25, CACTUS_SIDE: 26, CACTUS_TOP: 27,
  BOOKSHELF: 28, TNT_SIDE: 29, TNT_TOP: 30, PUMPKIN: 31,
  CT_TOP: 32, CT_SIDE: 33, CT_FRONT: 34, FURNACE_FRONT: 35, FURNACE_LIT: 36,
  FURNACE_SIDE: 37, FURNACE_TOP: 38, CHEST_TOP: 39, CHEST_SIDE: 40,
  CHEST_FRONT: 41, TALL_GRASS: 42, DANDELION: 43, POPPY: 44, TORCH: 45,
  GLOWSTONE: 46, STONE_BRICKS: 47, IRON_BLOCK: 48, GOLD_BLOCK: 49,
  DIAMOND_BLOCK: 50, SANDSTONE_SIDE: 51, SANDSTONE_TOP: 52, WOOL_BLACK: 53,
  WOOL_GREEN: 54, PUMPKIN_TOP: 55, PUMPKIN_FACE: 56,
  NETHERRACK: 128, SOUL_SAND: 129, QUARTZ_ORE: 130, NETHER_BRICKS: 131, LAVA: 132, PORTAL: 133,
  FARMLAND_TOP: 134, WHEAT0: 135, /* 135..138 */ DOOR_TOP: 139, DOOR_BOTTOM: 140, BED_FOOT: 141,
  BED_HEAD: 142, BED_SIDE: 143, HAY_TOP: 144, HAY_SIDE: 145, EMERALD_ORE: 146, EMERALD_BLOCK: 147,
  PATH_TOP: 148, PATH_SIDE: 149, SAPLING: 150, MOSSY_COBBLE: 151, BED_SIDE_HEAD: 152,
  ITEM2: 160, // second block of item sprites (see items.js)
  CRACK0: 64, // 10 stages: 64..73
  ITEM0: 80,  // item sprites start here (see items.js)
};

const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, COBBLE: 4, PLANKS: 5, LOG: 6,
  LEAVES: 7, SAND: 8, GRAVEL: 9, GLASS: 10, BRICK: 11, BEDROCK: 12,
  WATER: 13, SNOW_GRASS: 14, SNOW: 15, COAL_ORE: 16, IRON_ORE: 17, GOLD_ORE: 18,
  DIAMOND_ORE: 19, WOOL_WHITE: 20, WOOL_RED: 21, WOOL_BLUE: 22,
  WOOL_YELLOW: 23, OBSIDIAN: 24, CACTUS: 25, BOOKSHELF: 26, TNT: 27,
  PUMPKIN: 28, CRAFTING_TABLE: 29, FURNACE: 30, CHEST: 31, TALL_GRASS: 32,
  DANDELION: 33, POPPY: 34, TORCH: 35, GLOWSTONE: 36, STONE_BRICKS: 37,
  IRON_BLOCK: 38, GOLD_BLOCK: 39, DIAMOND_BLOCK: 40, SANDSTONE: 41,
  WOOL_BLACK: 42, WOOL_GREEN: 43, FURNACE_LIT: 44,
  NETHERRACK: 45, SOUL_SAND: 46, QUARTZ_ORE: 47, NETHER_BRICKS: 48, LAVA: 49, PORTAL_X: 50, PORTAL_Z: 51,
  FARMLAND: 52, WHEAT0: 53, /* 53..60 = stages 0..7 */ DOOR_LOWER: 61, DOOR_UPPER: 62, BED_FOOT: 63,
  BED_HEAD: 64, HAY: 65, EMERALD_ORE: 66, EMERALD_BLOCK: 67, PATH: 68, SAPLING: 69,
  WATER1: 70, /* 70..76 = flowing water levels 1..7 */ WATER_FALL: 77, MOSSY_COBBLE: 78,
  LAVA1: 80, /* 80..86 = flowing lava levels 1..7 */ LAVA_FALL: 87,
};

// Tool levels: wood/gold 0, stone 1, iron 2, diamond 3
const BLOCKS = [];
function defBlock(id, name, tiles, o = {}) {
  if (typeof tiles === 'number') tiles = [tiles, tiles, tiles];
  BLOCKS[id] = {
    id, name, tiles,
    solid: o.solid !== false,
    cutout: !!o.cutout,
    liquid: !!o.liquid,
    model: o.model || 'cube',
    hardness: o.hardness ?? 1,
    tool: o.tool || null,          // preferred tool type
    level: o.level ?? -1,          // minimum tool level required to get drops (-1 = none)
    drops: o.drops,                // undefined = drops itself; function(rand) -> [[id, count]]
    light: o.light || 0,
    lightCost: o.lightCost || 0,   // extra light lost when passing through
    sound: o.sound || 'stone',
    gravity: !!o.gravity,
    replaceable: !!o.replaceable,
    needsSupport: !!o.needsSupport,
    inCreative: o.inCreative !== false,
    facing: !!o.facing,
    height: o.height ?? 1,          // top of the block (cube model)
    fluid: o.fluid || null,         // 'water' | 'lava'
    flevel: o.flevel ?? 0,          // fluid level: 0 source, 1..7 flowing, 8 falling
    translucent: !!o.translucent,   // rendered in the transparent pass
    mat: 0,                         // shader material id (set below)
  };
  // Optional behaviour hooks used by later files
  for (const k of ['shape', 'collide', 'leaves', 'emissive', 'matOverride', 'climbable', 'redstone', 'slow', 'dataTile', 'baseBlock', 'needsWall', 'fenceLike']) {
    if (o[k] !== undefined) BLOCKS[id][k] = o[k];
  }
}
const dropNone = () => [];
defBlock(B.AIR, 'Air', 0, { solid: false, hardness: 0, replaceable: true, inCreative: false });
defBlock(B.GRASS, 'Grass Block', [T.GRASS_TOP, T.DIRT, T.GRASS_SIDE], { hardness: 0.6, tool: 'shovel', sound: 'grass', drops: () => [[B.DIRT, 1]] });
defBlock(B.DIRT, 'Dirt', T.DIRT, { hardness: 0.5, tool: 'shovel', sound: 'gravel' });
defBlock(B.STONE, 'Stone', T.STONE, { hardness: 1.5, tool: 'pickaxe', level: 0, drops: () => [[B.COBBLE, 1]] });
defBlock(B.COBBLE, 'Cobblestone', T.COBBLE, { hardness: 2, tool: 'pickaxe', level: 0 });
defBlock(B.PLANKS, 'Oak Planks', T.PLANKS, { hardness: 2, tool: 'axe', sound: 'wood' });
defBlock(B.LOG, 'Oak Log', [T.LOG_TOP, T.LOG_TOP, T.LOG_SIDE], { hardness: 2, tool: 'axe', sound: 'wood' });
defBlock(B.LEAVES, 'Oak Leaves', T.LEAVES, {
  cutout: true, hardness: 0.2, sound: 'grass', lightCost: 1,
  drops: (r) => { const v = r(); return v < 0.05 ? [[B.SAPLING, 1]] : v < 0.06 ? [[ITEM.APPLE, 1]] : v < 0.08 ? [[ITEM.STICK, 1]] : []; },
});
defBlock(B.SAND, 'Sand', T.SAND, { hardness: 0.5, tool: 'shovel', sound: 'sand', gravity: true });
defBlock(B.GRAVEL, 'Gravel', T.GRAVEL, { hardness: 0.6, tool: 'shovel', sound: 'gravel', gravity: true, drops: (r) => (r() < 0.1 ? [[ITEM.FLINT, 1]] : [[B.GRAVEL, 1]]) });
defBlock(B.GLASS, 'Glass', T.GLASS, { cutout: true, hardness: 0.3, sound: 'glass', drops: dropNone });
defBlock(B.BRICK, 'Bricks', T.BRICK, { hardness: 2, tool: 'pickaxe', level: 0 });
defBlock(B.BEDROCK, 'Bedrock', T.BEDROCK, { hardness: -1, inCreative: true });
defBlock(B.WATER, 'Water', T.WATER, { solid: false, liquid: true, hardness: -1, replaceable: true, lightCost: 2, inCreative: false, fluid: 'water' });
defBlock(B.SNOW_GRASS, 'Snowy Grass', [T.SNOW, T.DIRT, T.SNOW_SIDE], { hardness: 0.6, tool: 'shovel', sound: 'grass', drops: () => [[B.DIRT, 1]] });
defBlock(B.SNOW, 'Snow Block', T.SNOW, { hardness: 0.2, tool: 'shovel', sound: 'wool' });
defBlock(B.COAL_ORE, 'Coal Ore', T.COAL, { hardness: 3, tool: 'pickaxe', level: 0, drops: () => [[ITEM.COAL, 1]] });
defBlock(B.IRON_ORE, 'Iron Ore', T.IRON, { hardness: 3, tool: 'pickaxe', level: 1 });
defBlock(B.GOLD_ORE, 'Gold Ore', T.GOLD, { hardness: 3, tool: 'pickaxe', level: 2 });
defBlock(B.DIAMOND_ORE, 'Diamond Ore', T.DIAMOND, { hardness: 3, tool: 'pickaxe', level: 2, drops: () => [[ITEM.DIAMOND, 1]] });
defBlock(B.WOOL_WHITE, 'White Wool', T.WOOL_WHITE, { hardness: 0.8, sound: 'wool' });
defBlock(B.WOOL_RED, 'Red Wool', T.WOOL_RED, { hardness: 0.8, sound: 'wool' });
defBlock(B.WOOL_BLUE, 'Blue Wool', T.WOOL_BLUE, { hardness: 0.8, sound: 'wool' });
defBlock(B.WOOL_YELLOW, 'Yellow Wool', T.WOOL_YELLOW, { hardness: 0.8, sound: 'wool' });
defBlock(B.OBSIDIAN, 'Obsidian', T.OBSIDIAN, { hardness: 50, tool: 'pickaxe', level: 3 });
defBlock(B.CACTUS, 'Cactus', [T.CACTUS_TOP, T.CACTUS_TOP, T.CACTUS_SIDE], { hardness: 0.4, sound: 'wool' });
defBlock(B.BOOKSHELF, 'Bookshelf', [T.PLANKS, T.PLANKS, T.BOOKSHELF], { hardness: 1.5, tool: 'axe', sound: 'wood' });
defBlock(B.TNT, 'TNT', [T.TNT_TOP, T.TNT_TOP, T.TNT_SIDE], { hardness: 0, sound: 'grass' });
defBlock(B.PUMPKIN, 'Pumpkin', [T.PUMPKIN_TOP, T.PUMPKIN_TOP, T.PUMPKIN, T.PUMPKIN, T.PUMPKIN_FACE, T.PUMPKIN], { hardness: 1, tool: 'axe', sound: 'wood', facing: true });
defBlock(B.CRAFTING_TABLE, 'Crafting Table', [T.CT_TOP, T.PLANKS, T.CT_SIDE, T.CT_SIDE, T.CT_FRONT, T.CT_FRONT], { hardness: 2.5, tool: 'axe', sound: 'wood' });
defBlock(B.FURNACE, 'Furnace', [T.FURNACE_TOP, T.FURNACE_TOP, T.FURNACE_SIDE, T.FURNACE_SIDE, T.FURNACE_FRONT, T.FURNACE_SIDE], { hardness: 3.5, tool: 'pickaxe', level: 0, facing: true });
defBlock(B.FURNACE_LIT, 'Furnace', [T.FURNACE_TOP, T.FURNACE_TOP, T.FURNACE_SIDE, T.FURNACE_SIDE, T.FURNACE_LIT, T.FURNACE_SIDE], { hardness: 3.5, tool: 'pickaxe', level: 0, facing: true, light: 13, inCreative: false, drops: () => [[B.FURNACE, 1]] });
defBlock(B.CHEST, 'Chest', [T.CHEST_TOP, T.CHEST_TOP, T.CHEST_SIDE, T.CHEST_SIDE, T.CHEST_FRONT, T.CHEST_SIDE], { hardness: 2.5, tool: 'axe', sound: 'wood', facing: true });
defBlock(B.TALL_GRASS, 'Grass', T.TALL_GRASS, { solid: false, cutout: true, model: 'cross', hardness: 0, sound: 'grass', replaceable: true, needsSupport: true, drops: (r) => (r() < 0.125 ? [[ITEM.SEEDS, 1]] : []) });
defBlock(B.DANDELION, 'Dandelion', T.DANDELION, { solid: false, cutout: true, model: 'cross', hardness: 0, sound: 'grass', needsSupport: true });
defBlock(B.POPPY, 'Poppy', T.POPPY, { solid: false, cutout: true, model: 'cross', hardness: 0, sound: 'grass', needsSupport: true });
defBlock(B.TORCH, 'Torch', T.TORCH, { solid: false, cutout: true, model: 'torch', hardness: 0, sound: 'wood', light: 14, needsSupport: true });
defBlock(B.GLOWSTONE, 'Glowstone', T.GLOWSTONE, { hardness: 0.3, sound: 'glass', light: 15 });
defBlock(B.STONE_BRICKS, 'Stone Bricks', T.STONE_BRICKS, { hardness: 1.5, tool: 'pickaxe', level: 0 });
defBlock(B.IRON_BLOCK, 'Block of Iron', T.IRON_BLOCK, { hardness: 5, tool: 'pickaxe', level: 1 });
defBlock(B.GOLD_BLOCK, 'Block of Gold', T.GOLD_BLOCK, { hardness: 3, tool: 'pickaxe', level: 2 });
defBlock(B.DIAMOND_BLOCK, 'Block of Diamond', T.DIAMOND_BLOCK, { hardness: 5, tool: 'pickaxe', level: 2 });
defBlock(B.SANDSTONE, 'Sandstone', [T.SANDSTONE_TOP, T.SANDSTONE_TOP, T.SANDSTONE_SIDE], { hardness: 0.8, tool: 'pickaxe', level: 0 });
defBlock(B.WOOL_BLACK, 'Black Wool', T.WOOL_BLACK, { hardness: 0.8, sound: 'wool' });
defBlock(B.WOOL_GREEN, 'Green Wool', T.WOOL_GREEN, { hardness: 0.8, sound: 'wool' });

// ---- Nether
defBlock(B.NETHERRACK, 'Netherrack', T.NETHERRACK, { hardness: 0.4, tool: 'pickaxe', level: 0, sound: 'stone' });
defBlock(B.SOUL_SAND, 'Soul Sand', T.SOUL_SAND, { hardness: 0.5, tool: 'shovel', sound: 'sand', height: 14 / 16 });
defBlock(B.QUARTZ_ORE, 'Nether Quartz Ore', T.QUARTZ_ORE, { hardness: 3, tool: 'pickaxe', level: 0, drops: () => [[ITEM.QUARTZ, 1]] });
defBlock(B.NETHER_BRICKS, 'Nether Bricks', T.NETHER_BRICKS, { hardness: 2, tool: 'pickaxe', level: 0 });
defBlock(B.PORTAL_X, 'Nether Portal', T.PORTAL, { solid: false, model: 'pane', hardness: -1, light: 11, translucent: true, inCreative: false, drops: dropNone, sound: 'glass' });
defBlock(B.PORTAL_Z, 'Nether Portal', T.PORTAL, { solid: false, model: 'pane', hardness: -1, light: 11, translucent: true, inCreative: false, drops: dropNone, sound: 'glass' });
// ---- Fluids: source, 7 flowing levels, falling
defBlock(B.LAVA, 'Lava', T.LAVA, { solid: false, liquid: false, fluid: 'lava', hardness: -1, replaceable: true, light: 15, inCreative: false });
for (let l = 1; l <= 7; l++) {
  defBlock(B.WATER1 + l - 1, 'Water', T.WATER, { solid: false, liquid: true, fluid: 'water', flevel: l, hardness: -1, replaceable: true, lightCost: 2, inCreative: false });
  defBlock(B.LAVA1 + l - 1, 'Lava', T.LAVA, { solid: false, fluid: 'lava', flevel: l, hardness: -1, replaceable: true, light: 15, inCreative: false });
}
defBlock(B.WATER_FALL, 'Water', T.WATER, { solid: false, liquid: true, fluid: 'water', flevel: 8, hardness: -1, replaceable: true, lightCost: 2, inCreative: false });
defBlock(B.LAVA_FALL, 'Lava', T.LAVA, { solid: false, fluid: 'lava', flevel: 8, hardness: -1, replaceable: true, light: 15, inCreative: false });
// ---- Farming & villages
defBlock(B.FARMLAND, 'Farmland', [T.FARMLAND_TOP, T.DIRT, T.DIRT], { hardness: 0.6, tool: 'shovel', sound: 'gravel', height: 15 / 16, drops: () => [[B.DIRT, 1]] });
for (let st = 0; st < 8; st++) {
  defBlock(B.WHEAT0 + st, 'Wheat Crops', T.WHEAT0 + Math.floor(st / 2), {
    solid: false, cutout: true, model: 'cross', hardness: 0, sound: 'grass', needsSupport: true, inCreative: false,
    drops: (r) => (st === 7 ? [[ITEM.WHEAT, 1], [ITEM.SEEDS, Math.floor(r() * 4)]] : [[ITEM.SEEDS, 1]]),
  });
}
defBlock(B.DOOR_LOWER, 'Oak Door', T.DOOR_BOTTOM, { model: 'door', cutout: true, hardness: 3, tool: 'axe', sound: 'wood', inCreative: false, drops: () => [[ITEM.DOOR, 1]] });
defBlock(B.DOOR_UPPER, 'Oak Door', T.DOOR_TOP, { model: 'door', cutout: true, hardness: 3, tool: 'axe', sound: 'wood', inCreative: false, drops: dropNone });
defBlock(B.BED_FOOT, 'Red Bed', [T.BED_FOOT, T.PLANKS, T.BED_SIDE], { model: 'bed', height: 9 / 16, hardness: 0.2, sound: 'wool', inCreative: false, drops: () => [[ITEM.BED, 1]] });
defBlock(B.BED_HEAD, 'Red Bed', [T.BED_HEAD, T.PLANKS, T.BED_SIDE_HEAD], { model: 'bed', height: 9 / 16, hardness: 0.2, sound: 'wool', inCreative: false, drops: dropNone });
defBlock(B.HAY, 'Hay Bale', [T.HAY_TOP, T.HAY_TOP, T.HAY_SIDE], { hardness: 0.5, sound: 'grass' });
defBlock(B.EMERALD_ORE, 'Emerald Ore', T.EMERALD_ORE, { hardness: 3, tool: 'pickaxe', level: 2, drops: () => [[ITEM.EMERALD, 1]] });
defBlock(B.EMERALD_BLOCK, 'Block of Emerald', T.EMERALD_BLOCK, { hardness: 5, tool: 'pickaxe', level: 2 });
defBlock(B.PATH, 'Dirt Path', [T.PATH_TOP, T.DIRT, T.PATH_SIDE], { hardness: 0.65, tool: 'shovel', sound: 'gravel', height: 15 / 16, drops: () => [[B.DIRT, 1]] });
defBlock(B.SAPLING, 'Oak Sapling', T.SAPLING, { solid: false, cutout: true, model: 'cross', hardness: 0, sound: 'grass', needsSupport: true });
defBlock(B.MOSSY_COBBLE, 'Mossy Cobblestone', T.MOSSY_COBBLE, { hardness: 2, tool: 'pickaxe', level: 0 });

const NUM_BLOCKS = BLOCKS.length;

// Lookup tables used by the mesher / lighting (fast typed arrays).
const OPAQUE = new Uint8Array(256);
const LIGHT_PASS = new Uint8Array(256); // 0 = blocks light, else 1 + extra cost
const EMIT = new Uint8Array(256);
const FLUID = new Uint8Array(256); // 0 none, 1 water, 2 lava
// (Re)build the lookup tables; called again after later files add blocks.
function buildBlockTables() {
  for (const b of BLOCKS) {
    if (!b) continue;
    OPAQUE[b.id] = (b.id !== B.AIR && !b.cutout && !b.liquid && !b.fluid && !b.translucent && b.model === 'cube' && b.height === 1) ? 1 : 0;
    LIGHT_PASS[b.id] = OPAQUE[b.id] ? 0 : 1 + b.lightCost;
    EMIT[b.id] = b.light;
    FLUID[b.id] = b.fluid === 'water' ? 1 : b.fluid === 'lava' ? 2 : 0;
    // Material ids for the shaders (see halcyon_glsl.js)
    if (b.leaves || b.id === B.LEAVES) b.mat = 2;
    else if (b.model === 'cross') b.mat = 1;
    else if (b.fluid === 'lava' || b.emissive || b.id === B.GLOWSTONE || b.id === B.TORCH) b.mat = 4;
    else if (b.id === B.GRASS) b.mat = 6;
    else if (b.fluid === 'water') b.mat = 10;
    else if (b.model === 'pane') b.mat = 12;
    else if (b.matOverride !== undefined) b.mat = b.matOverride;
  }
}
buildBlockTables();
function isWater(id) { return FLUID[id] === 1; }
function isLava(id) { return FLUID[id] === 2; }
// Fluid surface height (0..1) for a fluid block
function fluidHeight(id) {
  const l = BLOCKS[id].flevel;
  if (l >= 8) return 1;
  return 0.875 * (8 - l) / 8 + (l === 0 ? 0 : 0.02);
}

function isOpaque(id) { return OPAQUE[id] === 1; }
function isSolid(id) { return BLOCKS[id] ? BLOCKS[id].solid : false; }

// Tile index for a face. face: 0 -x, 1 +x, 2 -y, 3 +y, 4 -z, 5 +z (FACES order)
// facing: 0..3 = direction the front points (0:+z, 1:-x, 2:-z, 3:+x)
function faceTile(id, face, facing = 0) {
  const t = BLOCKS[id].tiles;
  if (t.length === 3 && BLOCKS[id].model === 'bed') {
    // bed: top tile rotated by facing is handled in the mesher; sides use the side tile
    return face === 3 ? t[0] : face === 2 ? t[1] : t[2];
  }
  if (face === 3) return t[0];
  if (face === 2) return t[1];
  if (t.length === 3) return t[2];
  // 6-tile blocks: [top, bottom, side, side, front, side(back)]
  const dirs = [5, 0, 4, 1]; // face index the front faces for facing 0..3
  return face === dirs[facing] ? t[4] : t[2];
}

// ---------------------------------------------------------------------------
// Texture painting
// ---------------------------------------------------------------------------

function buildAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * TILE;
  canvas.height = ATLAS_ROWS * TILE;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(canvas.width, canvas.height);
  const data = img.data;

  const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));
  function painter(tile, seed) {
    const ox = (tile % ATLAS_COLS) * TILE;
    const oy = Math.floor(tile / ATLAS_COLS) * TILE;
    const rand = mulberry32(seed * 7919 + 13);
    const set = (x, y, r, g, b, a = 255) => {
      if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
      const i = ((oy + y) * canvas.width + ox + x) * 4;
      data[i] = clamp255(r); data[i + 1] = clamp255(g); data[i + 2] = clamp255(b); data[i + 3] = a;
    };
    const get = (x, y) => {
      const i = ((oy + y) * canvas.width + ox + x) * 4;
      return [data[i], data[i + 1], data[i + 2], data[i + 3]];
    };
    return { set, get, rand, tile };
  }
  const vary = (rand, c, amt) => {
    const d = (rand() - 0.5) * amt;
    return [c[0] + d, c[1] + d, c[2] + d];
  };
  const fill = (p, base, amt) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const c = vary(p.rand, base, amt); p.set(x, y, c[0], c[1], c[2]);
    }
  };
  const speckle = (p, color, count, size = 1) => {
    for (let n = 0; n < count; n++) {
      const x = Math.floor(p.rand() * TILE), y = Math.floor(p.rand() * TILE);
      for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
        const c = vary(p.rand, color, 20); p.set(x + dx, y + dy, c[0], c[1], c[2]);
      }
    }
  };
  const copyTile = (from, p) => {
    const src = painter(from, 0);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const c = src.get(x, y); p.set(x, y, c[0], c[1], c[2], c[3]);
    }
  };
  const stoneBase = (p) => {
    fill(p, [125, 125, 125], 22);
    speckle(p, [100, 100, 100], 22, 2);
    speckle(p, [145, 145, 145], 10);
  };
  const ore = (tile, seed, color) => {
    const p = painter(tile, seed);
    stoneBase(p);
    for (let n = 0; n < 6; n++) {
      const cx = 2 + Math.floor(p.rand() * 12), cy = 2 + Math.floor(p.rand() * 12);
      for (let k = 0; k < 4; k++) {
        const x = cx + Math.floor(p.rand() * 3) - 1, y = cy + Math.floor(p.rand() * 3) - 1;
        const c = vary(p.rand, color, 40); p.set(x, y, c[0], c[1], c[2]);
      }
    }
  };
  const wool = (tile, seed, color) => {
    const p = painter(tile, seed);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const stripe = ((x + y * 2) % 4 === 0) ? -12 : 0;
      const c = vary(p.rand, color, 14); p.set(x, y, c[0] + stripe, c[1] + stripe, c[2] + stripe);
    }
  };
  const metalBlock = (tile, seed, color) => {
    const p = painter(tile, seed);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const edge = x === 0 || y === 0 || x === 15 || y === 15;
      const hi = (x === 1 || y === 1) ? 30 : 0;
      const c = vary(p.rand, color, 10);
      p.set(x, y, c[0] + hi - (edge ? 40 : 0), c[1] + hi - (edge ? 40 : 0), c[2] + hi - (edge ? 40 : 0));
    }
  };
  const dirtLike = (p) => {
    fill(p, [134, 96, 67], 26);
    speckle(p, [105, 75, 50], 18);
    speckle(p, [160, 120, 90], 8);
  };
  const planksLike = (p) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const seam = (y % 4 === 3) || (x === ((Math.floor(y / 4) * 5) % 16)) ? -35 : 0;
      const c = vary(p.rand, [162, 130, 78], 14); p.set(x, y, c[0] + seam, c[1] + seam, c[2] + seam);
    }
  };
  const cobbleLike = (p) => {
    fill(p, [110, 110, 110], 20);
    for (let n = 0; n < 9; n++) {
      const cx = Math.floor(p.rand() * TILE), cy = Math.floor(p.rand() * TILE);
      const rr = 2 + p.rand() * 2.5;
      for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
        const d = Math.sqrt(x * x + y * y);
        if (d < rr) { const c = vary(p.rand, [140, 140, 140], 20); p.set(cx + x, cy + y, c[0], c[1], c[2]); }
        else if (d < rr + 1) p.set(cx + x, cy + y, 80, 80, 80);
      }
    }
  };
  const clear = (p) => { for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) p.set(x, y, 0, 0, 0, 0); };

  let p;
  p = painter(T.GRASS_TOP, 1); fill(p, [95, 159, 53], 34); speckle(p, [120, 185, 70], 20);
  p = painter(T.DIRT, 2); dirtLike(p);
  p = painter(T.GRASS_SIDE, 3); dirtLike(p);
  for (let x = 0; x < TILE; x++) {
    const h = 3 + Math.floor(p.rand() * 3);
    for (let y = 0; y < h; y++) { const c = vary(p.rand, [95, 159, 53], 30); p.set(x, y, c[0], c[1], c[2]); }
  }
  p = painter(T.STONE, 4); stoneBase(p);
  p = painter(T.LOG_SIDE, 5);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const dark = (x % 4 === 0 || (x * 7 + y) % 11 === 0) ? -25 : 0;
    const c = vary(p.rand, [104, 83, 50], 18); p.set(x, y, c[0] + dark, c[1] + dark, c[2] + dark);
  }
  p = painter(T.LOG_TOP, 6);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d > 6.5) { const c = vary(p.rand, [104, 83, 50], 18); p.set(x, y, c[0], c[1], c[2]); continue; }
    const ring = Math.floor(d) % 2 === 0 ? 0 : -22;
    const c = vary(p.rand, [182, 146, 94], 12); p.set(x, y, c[0] + ring, c[1] + ring, c[2] + ring);
  }
  p = painter(T.LEAVES, 7);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const r = p.rand();
    if (r < 0.18) { p.set(x, y, 0, 0, 0, 0); continue; }
    const c = vary(p.rand, r < 0.5 ? [52, 120, 38] : [72, 148, 50], 30);
    p.set(x, y, c[0], c[1], c[2]);
  }
  p = painter(T.SAND, 8); fill(p, [219, 207, 163], 18); speckle(p, [196, 184, 140], 16);
  p = painter(T.WATER, 9);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const w = Math.sin((x + y * 0.5) * 0.8) * 10;
    const c = vary(p.rand, [48, 92, 210], 14); p.set(x, y, c[0] + w, c[1] + w, c[2] + w);
  }
  p = painter(T.PLANKS, 10); planksLike(p);
  p = painter(T.COBBLE, 11); cobbleLike(p);
  p = painter(T.GLASS, 12);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const edge = x === 0 || y === 0 || x === TILE - 1 || y === TILE - 1;
    const shine = (x - y === 3 || x - y === 5) && x > 2 && x < 10;
    if (edge) p.set(x, y, 200, 225, 235);
    else if (shine) p.set(x, y, 235, 245, 250);
    else p.set(x, y, 0, 0, 0, 0);
  }
  p = painter(T.BRICK, 13);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const off = Math.floor(y / 4) % 2 ? 4 : 0;
    const mortar = y % 4 === 3 || (x + off) % 8 === 7;
    const c = mortar ? vary(p.rand, [170, 165, 155], 14) : vary(p.rand, [150, 72, 56], 22);
    p.set(x, y, c[0], c[1], c[2]);
  }
  p = painter(T.BEDROCK, 14); fill(p, [80, 80, 80], 60); speckle(p, [30, 30, 30], 30, 2);
  p = painter(T.SNOW, 15); fill(p, [240, 248, 252], 10);
  p = painter(T.SNOW_SIDE, 16); dirtLike(p);
  for (let x = 0; x < TILE; x++) {
    const h = 3 + Math.floor(p.rand() * 3);
    for (let y = 0; y < h; y++) { const c = vary(p.rand, [240, 248, 252], 10); p.set(x, y, c[0], c[1], c[2]); }
  }
  ore(T.COAL, 17, [30, 30, 30]);
  ore(T.IRON, 18, [216, 175, 147]);
  ore(T.GOLD, 19, [250, 220, 60]);
  ore(T.DIAMOND, 20, [90, 230, 225]);
  p = painter(T.GRAVEL, 21); fill(p, [130, 124, 122], 40); speckle(p, [95, 90, 88], 20, 2); speckle(p, [170, 165, 160], 10);
  wool(T.WOOL_WHITE, 22, [232, 232, 232]);
  wool(T.WOOL_RED, 23, [170, 44, 40]);
  wool(T.WOOL_BLUE, 24, [52, 62, 160]);
  wool(T.WOOL_YELLOW, 25, [230, 200, 50]);
  wool(T.WOOL_BLACK, 26, [30, 30, 34]);
  wool(T.WOOL_GREEN, 27, [84, 110, 30]);
  p = painter(T.OBSIDIAN, 28); fill(p, [22, 16, 34], 14); speckle(p, [60, 40, 90], 14);
  p = painter(T.CACTUS_SIDE, 29);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const ridge = x % 4 === 1 ? 20 : 0;
    const c = vary(p.rand, [60, 130, 40], 16); p.set(x, y, c[0] + ridge, c[1] + ridge, c[2] + ridge);
  }
  for (let n = 0; n < 10; n++) p.set(Math.floor(p.rand() * 4) * 4, Math.floor(p.rand() * 16), 20, 30, 15);
  p = painter(T.CACTUS_TOP, 30); fill(p, [80, 150, 55], 16);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if (x === 0 || y === 0 || x === 15 || y === 15) p.set(x, y, 45, 100, 30);
  p = painter(T.BOOKSHELF, 31);
  const bookColors = [[160, 40, 40], [40, 80, 160], [50, 130, 60], [170, 140, 50], [110, 50, 130]];
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    let c;
    if (y === 0 || y === 15 || y === 7 || y === 8) c = vary(p.rand, [162, 130, 78], 14);
    else {
      const bc = bookColors[(Math.floor(x / 2) + (y > 7 ? 2 : 0)) % bookColors.length];
      c = vary(p.rand, bc, 16);
      if (x % 2 === 1) c = [c[0] - 30, c[1] - 30, c[2] - 30];
    }
    p.set(x, y, c[0], c[1], c[2]);
  }
  p = painter(T.TNT_SIDE, 32);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    let c = vary(p.rand, [200, 50, 40], 18);
    if (y >= 5 && y <= 10) c = vary(p.rand, [230, 230, 225], 10);
    if (y >= 6 && y <= 9 && x >= 3 && x <= 12 && (x + y) % 3 === 0) c = [30, 30, 30];
    p.set(x, y, c[0], c[1], c[2]);
  }
  p = painter(T.TNT_TOP, 33); fill(p, [200, 50, 40], 18);
  for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) p.set(x, y, 40, 40, 40);
  p = painter(T.PUMPKIN, 34);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const groove = x % 5 === 0 ? -30 : 0;
    const c = vary(p.rand, [222, 130, 30], 16); p.set(x, y, c[0] + groove, c[1] + groove, c[2] + groove);
  }
  p = painter(T.PUMPKIN_FACE, 35); copyTile(T.PUMPKIN, p);
  for (const [x, y] of [[3, 5], [4, 5], [4, 4], [11, 5], [12, 5], [11, 4], [7, 8], [8, 8]]) p.set(x, y, 60, 30, 5);
  for (let x = 3; x <= 12; x++) p.set(x, 11, 60, 30, 5);
  for (const x of [4, 7, 10]) p.set(x, 10, 60, 30, 5);
  p = painter(T.PUMPKIN_TOP, 36);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const d = Math.hypot(x - 7.5, y - 7.5);
    const c = vary(p.rand, [210, 120, 28], 16); p.set(x, y, c[0] - d * 2, c[1] - d * 2, c[2]);
  }
  for (let y = 6; y < 10; y++) for (let x = 7; x < 9; x++) p.set(x, y, 90, 70, 30);

  // crafting table
  p = painter(T.CT_TOP, 37); planksLike(p);
  for (let i = 0; i < TILE; i++) { p.set(i, 0, 90, 60, 30); p.set(i, 15, 90, 60, 30); p.set(0, i, 90, 60, 30); p.set(15, i, 90, 60, 30); }
  for (let i = 2; i < 14; i++) { p.set(i, 7, 110, 80, 45); p.set(7, i, 110, 80, 45); }
  p = painter(T.CT_SIDE, 38); planksLike(p);
  for (let y = 0; y < 4; y++) for (let x = 0; x < TILE; x++) { const c = vary(p.rand, [120, 85, 45], 10); p.set(x, y, c[0], c[1], c[2]); }
  for (let y = 6; y < 13; y++) { p.set(3, y, 140, 140, 140); p.set(12, y, 90, 60, 30); }
  for (let x = 2; x < 6; x++) p.set(x, 6, 160, 160, 160);
  p = painter(T.CT_FRONT, 39); copyTile(T.CT_SIDE, p);
  for (let y = 6; y < 13; y++) for (let x = 6; x < 10; x++) p.set(x, y, 150, 115, 70);
  for (let x = 5; x < 11; x++) p.set(x, 6, 80, 55, 25);
  // furnace
  p = painter(T.FURNACE_SIDE, 40); cobbleLike(p);
  p = painter(T.FURNACE_TOP, 41); stoneBase(p);
  p = painter(T.FURNACE_FRONT, 42); cobbleLike(p);
  for (let y = 8; y < 14; y++) for (let x = 3; x < 13; x++) p.set(x, y, 30, 30, 30);
  for (let x = 3; x < 13; x++) p.set(x, 7, 70, 70, 70);
  p = painter(T.FURNACE_LIT, 43); copyTile(T.FURNACE_FRONT, p);
  for (let y = 9; y < 14; y++) for (let x = 4; x < 12; x++) {
    const r = p.rand(); p.set(x, y, 255, 120 + r * 120, 20 + r * 40);
  }
  // chest
  const chestWood = (p) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const c = vary(p.rand, [160, 110, 50], 16);
      const edge = x === 0 || x === 15 || y === 0 || y === 15;
      p.set(x, y, c[0] - (edge ? 50 : 0), c[1] - (edge ? 40 : 0), c[2] - (edge ? 20 : 0));
    }
  };
  p = painter(T.CHEST_TOP, 44); chestWood(p);
  p = painter(T.CHEST_SIDE, 45); chestWood(p); for (let x = 0; x < TILE; x++) p.set(x, 5, 70, 45, 20);
  p = painter(T.CHEST_FRONT, 46); chestWood(p); for (let x = 0; x < TILE; x++) p.set(x, 5, 70, 45, 20);
  for (let y = 4; y < 8; y++) for (let x = 7; x < 9; x++) p.set(x, y, 200, 200, 200);
  // plants
  p = painter(T.TALL_GRASS, 47); clear(p);
  for (let n = 0; n < 9; n++) {
    let x = 1 + Math.floor(p.rand() * 14); const h = 6 + Math.floor(p.rand() * 9);
    for (let y = 15; y > 15 - h; y--) {
      const c = vary(p.rand, [80, 150, 45], 30); p.set(x, y, c[0], c[1], c[2]);
      if (p.rand() < 0.25) x += p.rand() < 0.5 ? -1 : 1;
    }
  }
  const flower = (tile, seed, petal, center) => {
    const pp = painter(tile, seed); clear(pp);
    for (let y = 8; y < 16; y++) pp.set(7, y, 60, 130, 40);
    pp.set(6, 12, 60, 130, 40); pp.set(8, 11, 60, 130, 40); pp.set(5, 11, 60, 130, 40);
    for (let y = 3; y < 8; y++) for (let x = 5; x < 10; x++) {
      if ((x === 5 || x === 9) && (y === 3 || y === 7)) continue;
      const c = vary(pp.rand, petal, 25); pp.set(x, y, c[0], c[1], c[2]);
    }
    pp.set(7, 5, center[0], center[1], center[2]);
  };
  flower(T.DANDELION, 48, [245, 225, 40], [200, 150, 20]);
  flower(T.POPPY, 49, [200, 30, 30], [40, 20, 10]);
  p = painter(T.TORCH, 50); clear(p);
  for (let y = 8; y < 16; y++) for (let x = 7; x < 9; x++) { const c = vary(p.rand, [120, 90, 50], 20); p.set(x, y, c[0], c[1], c[2]); }
  p.set(7, 7, 255, 200, 60); p.set(8, 7, 255, 150, 30);
  p.set(7, 6, 255, 250, 200); p.set(8, 6, 255, 230, 120);
  p = painter(T.GLOWSTONE, 51); fill(p, [200, 160, 80], 40); speckle(p, [255, 230, 140], 30, 2); speckle(p, [140, 100, 50], 10);
  p = painter(T.STONE_BRICKS, 52);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const off = Math.floor(y / 8) % 2 ? 4 : 0;
    const mortar = y % 8 === 7 || (x + off) % 8 === 7;
    const c = mortar ? vary(p.rand, [85, 85, 85], 8) : vary(p.rand, [128, 128, 128], 16);
    p.set(x, y, c[0], c[1], c[2]);
  }
  metalBlock(T.IRON_BLOCK, 53, [220, 220, 220]);
  metalBlock(T.GOLD_BLOCK, 54, [250, 210, 60]);
  metalBlock(T.DIAMOND_BLOCK, 55, [110, 230, 225]);
  p = painter(T.SANDSTONE_SIDE, 56);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const band = y < 3 ? 10 : y > 12 ? -12 : 0;
    const c = vary(p.rand, [216, 200, 150], 10); p.set(x, y, c[0] + band, c[1] + band, c[2] + band);
  }
  p = painter(T.SANDSTONE_TOP, 57); fill(p, [222, 208, 160], 10);

  // crack stages (transparent overlay)
  for (let s = 0; s < 10; s++) {
    p = painter(T.CRACK0 + s, 300); // same seed: cracks grow stage by stage
    clear(p);
    const lines = 2 + s * 2;
    for (let n = 0; n < lines; n++) {
      let x = 8 + Math.floor((p.rand() - 0.5) * 6), y = 8 + Math.floor((p.rand() - 0.5) * 6);
      const len = 3 + s;
      for (let k = 0; k < len; k++) {
        p.set(x, y, 20, 20, 20, 200);
        x += Math.floor(p.rand() * 3) - 1; y += Math.floor(p.rand() * 3) - 1;
      }
    }
  }

  paintItems(painter, vary, clear);
  paintExtraTiles(painter, vary, clear, { fill, speckle, stoneBase, dirtLike, planksLike, cobbleLike, copyTile });

  ctx.putImageData(img, 0, 0);
  return canvas;
}

// UV rectangle for a tile, inset slightly to avoid bleeding between tiles.
function tileUV(tile) {
  const col = tile % ATLAS_COLS;
  const row = Math.floor(tile / ATLAS_COLS);
  const eps = 0.02 / TILE / ATLAS_COLS;
  const u0 = col / ATLAS_COLS + eps;
  const u1 = (col + 1) / ATLAS_COLS - eps;
  const v1 = 1 - row / ATLAS_ROWS - eps * 2;
  const v0 = 1 - (row + 1) / ATLAS_ROWS + eps * 2;
  return [u0, v0, u1, v1];
}

function tileSrc(tile) { return [(tile % ATLAS_COLS) * TILE, Math.floor(tile / ATLAS_COLS) * TILE]; }

// Draw an inventory icon: isometric cube for cube blocks, flat sprite otherwise.
function drawItemIcon(atlas, id, size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const b = id < 256 ? BLOCKS[id] : null;
  if (!b || b.model !== 'cube') {
    const tile = b ? b.tiles[0] : ITEMS[id].tile;
    const [sx, sy] = tileSrc(tile);
    ctx.drawImage(atlas, sx, sy, TILE, TILE, size * 0.06, size * 0.06, size * 0.88, size * 0.88);
    return c;
  }
  const s = size / 2;
  const h = size * 0.25;
  const cx = size / 2;
  function face(tile, a, bb, cc, d, e, f, shade) {
    ctx.save();
    ctx.setTransform(a, bb, cc, d, e, f);
    const [sx, sy] = tileSrc(tile);
    ctx.drawImage(atlas, sx, sy, TILE, TILE, 0, 0, 1, 1);
    if (shade > 0) { ctx.fillStyle = `rgba(0,0,0,${shade})`; ctx.fillRect(0, 0, 1, 1); }
    ctx.restore();
  }
  const top = faceTile(id, 3), left = faceTile(id, 5, 0), right = faceTile(id, 1, 0);
  face(top, s * 0.98, h * 0.98, -s * 0.98, h * 0.98, cx, 1, 0);
  face(left, s * 0.98, h * 0.98, 0, s * 0.96, 1, h + 1, 0.2);
  face(right, s * 0.98, -h * 0.98, 0, s * 0.96, cx, 2 * h * 0.98 + 1, 0.4);
  return c;
}
