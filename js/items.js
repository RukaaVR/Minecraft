// Items (blocks + tools/food/materials), crafting recipes and smelting.
'use strict';

const ITEM = {
  STICK: 256, COAL: 257, CHARCOAL: 258, IRON_INGOT: 259, GOLD_INGOT: 260,
  DIAMOND: 261, APPLE: 262, PORK_RAW: 263, PORK_COOKED: 264, BEEF_RAW: 265,
  BEEF_COOKED: 266, CHICKEN_RAW: 267, CHICKEN_COOKED: 268, ROTTEN_FLESH: 269,
  GUNPOWDER: 270, LEATHER: 271, FLINT_STEEL: 272, FEATHER: 273, BREAD: 274,
  // tools: 300 + material*4 + type
};
const TOOL_MATERIALS = [
  { key: 'wooden', name: 'Wooden', level: 0, speed: 2, uses: 59, dmg: 0, color: [150, 115, 65] },
  { key: 'stone', name: 'Stone', level: 1, speed: 4, uses: 131, dmg: 1, color: [130, 130, 130] },
  { key: 'iron', name: 'Iron', level: 2, speed: 6, uses: 250, dmg: 2, color: [225, 225, 225] },
  { key: 'golden', name: 'Golden', level: 0, speed: 12, uses: 32, dmg: 0, color: [250, 215, 60] },
  { key: 'diamond', name: 'Diamond', level: 3, speed: 8, uses: 1561, dmg: 3, color: [90, 230, 220] },
];
const TOOL_TYPES = [
  { key: 'pickaxe', name: 'Pickaxe', baseDmg: 2 },
  { key: 'axe', name: 'Axe', baseDmg: 3.5 },
  { key: 'shovel', name: 'Shovel', baseDmg: 2.5 },
  { key: 'sword', name: 'Sword', baseDmg: 4 },
];
function toolId(mat, type) { return 300 + mat * 4 + type; }

// ITEMS[id] for every item id, including blocks
const ITEMS = {};
function defItem(id, name, tile, o = {}) {
  ITEMS[id] = Object.assign({ id, name, tile, stack: 64, block: null, food: 0, saturation: 0, tool: null, fuel: 0 }, o);
}
defItem(ITEM.STICK, 'Stick', T.ITEM0 + 0, { fuel: 5 });
defItem(ITEM.COAL, 'Coal', T.ITEM0 + 1, { fuel: 80 });
defItem(ITEM.CHARCOAL, 'Charcoal', T.ITEM0 + 2, { fuel: 80 });
defItem(ITEM.IRON_INGOT, 'Iron Ingot', T.ITEM0 + 3);
defItem(ITEM.GOLD_INGOT, 'Gold Ingot', T.ITEM0 + 4);
defItem(ITEM.DIAMOND, 'Diamond', T.ITEM0 + 5);
defItem(ITEM.APPLE, 'Apple', T.ITEM0 + 6, { food: 4, saturation: 2.4 });
defItem(ITEM.PORK_RAW, 'Raw Porkchop', T.ITEM0 + 7, { food: 3, saturation: 1.8 });
defItem(ITEM.PORK_COOKED, 'Cooked Porkchop', T.ITEM0 + 8, { food: 8, saturation: 12.8 });
defItem(ITEM.BEEF_RAW, 'Raw Beef', T.ITEM0 + 9, { food: 3, saturation: 1.8 });
defItem(ITEM.BEEF_COOKED, 'Steak', T.ITEM0 + 10, { food: 8, saturation: 12.8 });
defItem(ITEM.CHICKEN_RAW, 'Raw Chicken', T.ITEM0 + 11, { food: 2, saturation: 1.2 });
defItem(ITEM.CHICKEN_COOKED, 'Cooked Chicken', T.ITEM0 + 12, { food: 6, saturation: 7.2 });
defItem(ITEM.ROTTEN_FLESH, 'Rotten Flesh', T.ITEM0 + 13, { food: 4, saturation: 0.8 });
defItem(ITEM.GUNPOWDER, 'Gunpowder', T.ITEM0 + 14);
defItem(ITEM.LEATHER, 'Leather', T.ITEM0 + 15);
defItem(ITEM.FLINT_STEEL, 'Flint and Steel', T.ITEM0 + 36, { stack: 1, tool: { type: 'ignite', level: 0, speed: 1, uses: 64, damage: 1 } });
defItem(ITEM.FEATHER, 'Feather', T.ITEM0 + 37);
defItem(ITEM.BREAD, 'Bread', T.ITEM0 + 38, { food: 5, saturation: 6 });
TOOL_MATERIALS.forEach((m, mi) => TOOL_TYPES.forEach((t, ti) => {
  const id = toolId(mi, ti);
  defItem(id, `${m.name} ${t.name}`, T.ITEM0 + 16 + mi * 4 + ti, {
    stack: 1,
    tool: { type: t.key, level: m.level, speed: m.speed, uses: m.uses, damage: t.baseDmg + m.dmg },
    fuel: mi === 0 ? 10 : 0,
  });
}));
for (const b of BLOCKS) {
  if (!b || b.id === B.AIR) continue;
  const fuel = [B.LOG, B.PLANKS, B.CRAFTING_TABLE, B.CHEST, B.BOOKSHELF].includes(b.id) ? 15 : 0;
  ITEMS[b.id] = { id: b.id, name: b.name, tile: b.tiles[0], stack: 64, block: b.id, food: 0, saturation: 0, tool: null, fuel };
}
const ALL_ITEM_IDS = Object.keys(ITEMS).map(Number);

function itemInfo(id) { return ITEMS[id]; }
function findItemByName(name) {
  name = name.toLowerCase().replace(/^minecraft:/, '').replace(/[_\s]+/g, ' ').trim();
  for (const id of ALL_ITEM_IDS) if (ITEMS[id].name.toLowerCase() === name) return id;
  for (const id of ALL_ITEM_IDS) if (ITEMS[id].name.toLowerCase().includes(name)) return id;
  const n = parseInt(name, 10);
  return ITEMS[n] ? n : null;
}

// ---------------------------------------------------------------------------
// Crafting
// ---------------------------------------------------------------------------
// Shaped recipes: pattern rows + key. Shapeless: list of ingredients.
const RECIPES = [];
function shaped(pattern, key, out, count = 1) { RECIPES.push({ type: 'shaped', pattern, key, out, count }); }
function shapeless(items, out, count = 1) { RECIPES.push({ type: 'shapeless', items, out, count }); }

shapeless([B.LOG], B.PLANKS, 4);
shaped(['P', 'P'], { P: B.PLANKS }, ITEM.STICK, 4);
shaped(['PP', 'PP'], { P: B.PLANKS }, B.CRAFTING_TABLE);
shaped(['CCC', 'C C', 'CCC'], { C: B.COBBLE }, B.FURNACE);
shaped(['PPP', 'P P', 'PPP'], { P: B.PLANKS }, B.CHEST);
shaped(['C', 'S'], { C: ITEM.COAL, S: ITEM.STICK }, B.TORCH, 4);
shaped(['C', 'S'], { C: ITEM.CHARCOAL, S: ITEM.STICK }, B.TORCH, 4);
shaped(['SS', 'SS'], { S: B.STONE }, B.STONE_BRICKS, 4);
shaped(['SS', 'SS'], { S: B.SAND }, B.SANDSTONE);
shaped(['GSG', 'SGS', 'GSG'], { G: ITEM.GUNPOWDER, S: B.SAND }, B.TNT);
shaped(['PPP', 'BBB', 'PPP'], { P: B.PLANKS, B: ITEM.LEATHER }, B.BOOKSHELF);
shaped(['III', 'III', 'III'], { I: ITEM.IRON_INGOT }, B.IRON_BLOCK);
shaped(['III', 'III', 'III'], { I: ITEM.GOLD_INGOT }, B.GOLD_BLOCK);
shaped(['III', 'III', 'III'], { I: ITEM.DIAMOND }, B.DIAMOND_BLOCK);
shapeless([B.IRON_BLOCK], ITEM.IRON_INGOT, 9);
shapeless([B.GOLD_BLOCK], ITEM.GOLD_INGOT, 9);
shapeless([B.DIAMOND_BLOCK], ITEM.DIAMOND, 9);
shapeless([ITEM.IRON_INGOT, B.GRAVEL], ITEM.FLINT_STEEL);
shapeless([B.WOOL_WHITE, ITEM.COAL], B.WOOL_BLACK);
shapeless([B.WOOL_WHITE, B.DANDELION], B.WOOL_YELLOW);
shapeless([B.WOOL_WHITE, B.POPPY], B.WOOL_RED);
shapeless([B.WOOL_WHITE, B.CACTUS], B.WOOL_GREEN);
shaped(['FF', 'FF'], { F: ITEM.FEATHER }, B.WOOL_WHITE);
shaped(['GGG', 'GGG', 'GGG'], { G: B.TORCH }, B.GLOWSTONE);
const TOOL_HEADS = [B.PLANKS, B.COBBLE, ITEM.IRON_INGOT, ITEM.GOLD_INGOT, ITEM.DIAMOND];
TOOL_HEADS.forEach((m, mi) => {
  shaped(['MMM', ' S ', ' S '], { M: m, S: ITEM.STICK }, toolId(mi, 0));
  shaped(['MM', 'MS', ' S'], { M: m, S: ITEM.STICK }, toolId(mi, 1));
  shaped(['M', 'S', 'S'], { M: m, S: ITEM.STICK }, toolId(mi, 2));
  shaped(['M', 'M', 'S'], { M: m, S: ITEM.STICK }, toolId(mi, 3));
});

// grid: array of item ids (0 = empty), size w x w. Returns {out, count} or null.
function matchRecipe(grid, w) {
  let minX = w, minY = w, maxX = -1, maxY = -1;
  const filled = [];
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const id = grid[y * w + x];
    if (!id) continue;
    filled.push(id);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  if (!filled.length) return null;
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  for (const r of RECIPES) {
    if (r.type === 'shapeless') {
      if (r.items.length !== filled.length) continue;
      const left = filled.slice();
      let ok = true;
      for (const it of r.items) {
        const i = left.indexOf(it);
        if (i < 0) { ok = false; break; }
        left.splice(i, 1);
      }
      if (ok) return { out: r.out, count: r.count };
      continue;
    }
    const ph = r.pattern.length, pw = Math.max(...r.pattern.map((s) => s.length));
    if (ph !== bh || pw !== bw) continue;
    for (const mirror of [false, true]) {
      let ok = true;
      for (let y = 0; y < bh && ok; y++) for (let x = 0; x < bw && ok; x++) {
        const row = r.pattern[y].padEnd(pw, ' ');
        const ch = row[mirror ? pw - 1 - x : x];
        const want = ch === ' ' ? 0 : r.key[ch];
        if ((grid[(y + minY) * w + (x + minX)] || 0) !== want) ok = false;
      }
      if (ok) return { out: r.out, count: r.count };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Smelting
// ---------------------------------------------------------------------------
const SMELTING = {
  [B.IRON_ORE]: ITEM.IRON_INGOT,
  [B.GOLD_ORE]: ITEM.GOLD_INGOT,
  [B.SAND]: B.GLASS,
  [B.COBBLE]: B.STONE,
  [B.LOG]: ITEM.CHARCOAL,
  [B.CACTUS]: B.WOOL_GREEN,
  [ITEM.PORK_RAW]: ITEM.PORK_COOKED,
  [ITEM.BEEF_RAW]: ITEM.BEEF_COOKED,
  [ITEM.CHICKEN_RAW]: ITEM.CHICKEN_COOKED,
  [B.STONE]: B.STONE_BRICKS,
};
const SMELT_TIME = 10; // seconds per item (Minecraft: 200 ticks)

// ---------------------------------------------------------------------------
// Item sprites (painted into the shared atlas by buildAtlas)
// ---------------------------------------------------------------------------
function paintItems(painter, vary, clear) {
  const outline = (p, dark = [40, 30, 20]) => {
    const solid = [];
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) solid.push(p.get(x, y)[3] > 0);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      if (solid[y * TILE + x]) continue;
      const n = (dx, dy) => { const xx = x + dx, yy = y + dy; return xx >= 0 && yy >= 0 && xx < TILE && yy < TILE && solid[yy * TILE + xx]; };
      if (n(1, 0) || n(-1, 0) || n(0, 1) || n(0, -1)) p.set(x, y, dark[0], dark[1], dark[2]);
    }
  };
  const blob = (tile, seed, color, fn, amt = 20) => {
    const p = painter(tile, seed); clear(p);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const v = fn(x, y);
      if (!v) continue;
      const base = Array.isArray(v) ? v : color;
      const c = vary(p.rand, base, amt); p.set(x, y, c[0], c[1], c[2]);
    }
    outline(p);
    return p;
  };
  const ell = (cx, cy, rx, ry) => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  const S = T.ITEM0;
  const stickFn = (x, y) => x + y === 15 && x >= 3 && x <= 12;
  blob(S + 0, 500, [120, 85, 45], (x, y) => stickFn(x, y) || (x + y === 16 && x >= 4 && x <= 12));
  blob(S + 1, 501, [35, 35, 35], ell(7.5, 8, 5, 4.5), 30);
  blob(S + 2, 502, [60, 45, 30], ell(7.5, 8, 5, 4.5), 30);
  const ingot = (x, y) => y >= 6 && y <= 10 && x >= 2 + (10 - y) * 0 && x >= (y < 8 ? 4 : 2) && x <= (y < 8 ? 12 : 13);
  blob(S + 3, 503, [215, 215, 215], (x, y) => ingot(x, y) && (y === 6 ? [245, 245, 245] : true), 12);
  blob(S + 4, 504, [245, 205, 50], (x, y) => ingot(x, y) && (y === 6 ? [255, 240, 140] : true), 12);
  blob(S + 5, 505, [90, 230, 220], (x, y) => Math.abs(x - 7.5) + Math.abs(y - 8) * 1.2 <= 6 && y >= 3 && (x + y < 11 ? [190, 255, 250] : true), 15);
  blob(S + 6, 506, [210, 30, 30], (x, y) => (ell(7.5, 9.5, 5.5, 5)(x, y)) || (x === 8 && y >= 2 && y <= 4 && [90, 60, 20]) || (x === 9 && y === 3 && [60, 150, 40]), 20);
  const meat = ell(7.5, 8, 6, 4);
  const boneEnd = (x, y) => (x >= 12 && y >= 10 && y <= 12);
  blob(S + 7, 507, [240, 140, 140], (x, y) => meat(x, y) && ((x + y) % 5 === 0 ? [250, 200, 200] : true));
  blob(S + 8, 508, [170, 100, 60], (x, y) => meat(x, y) && ((x + y) % 5 === 0 ? [210, 150, 100] : true));
  blob(S + 9, 509, [200, 50, 50], (x, y) => meat(x, y) && ((x * y) % 7 === 0 ? [240, 230, 220] : true));
  blob(S + 10, 510, [110, 60, 35], (x, y) => meat(x, y) && ((x * y) % 7 === 0 ? [160, 110, 70] : true));
  const drum = (x, y) => ell(6, 6.5, 4.5, 4)(x, y) || (x - y >= -1 && x - y <= 1 && x >= 8 && x <= 12) || boneEnd(x, y);
  blob(S + 11, 511, [240, 200, 180], (x, y) => drum(x, y) && (x >= 9 ? [240, 240, 230] : true));
  blob(S + 12, 512, [200, 140, 80], (x, y) => drum(x, y) && (x >= 9 ? [240, 240, 230] : true));
  blob(S + 13, 513, [130, 90, 60], (x, y) => meat(x, y) && ((x + y * 3) % 4 === 0 ? [90, 120, 60] : true), 40);
  blob(S + 14, 514, [90, 90, 90], (x, y) => y >= 7 && Math.abs(x - 7.5) <= (y - 5) * 0.9, 50);
  blob(S + 15, 515, [150, 85, 45], (x, y) => x >= 3 && x <= 12 && y >= 3 && y <= 12 && !(x === 3 && y === 3) && !(x === 12 && y === 12), 20);
  // Tools: drawn from shapes, coloured by material
  TOOL_MATERIALS.forEach((m, mi) => {
    const handle = [120, 85, 45];
    const shapes = [
      // pickaxe
      (x, y) => (stickFn(x, y) && x <= 9 ? handle : false) ||
        ((x - y === 3 || x - y === 4) && x >= 4 && x <= 13 ? m.color : false) ||
        ((x === 4 && y === 1) || (x === 13 && y === 10) ? m.color : false),
      // axe
      (x, y) => (stickFn(x, y) && x <= 10 ? handle : false) ||
        (x >= 6 && x <= 11 && y >= 1 && y <= 7 && x + y >= 9 && x + y <= 14 && x - y >= 2 ? m.color : false),
      // shovel
      (x, y) => (stickFn(x, y) && x <= 10 ? handle : false) ||
        (ell(11.5, 3.5, 2.6, 2.6)(x, y) ? m.color : false),
      // sword
      (x, y) => ((x + y === 15 || x + y === 14) && x >= 6 && x <= 14 && y >= 1 ? m.color : false) ||
        ((x - y === -4 || x - y === -5) && x >= 3 && x <= 7 && y >= 8 && y <= 11 ? [90, 60, 30] : false) ||
        (x + y === 15 && x >= 1 && x <= 4 ? handle : false),
    ];
    shapes.forEach((fn, ti) => blob(S + 16 + mi * 4 + ti, 600 + mi * 4 + ti, m.color, fn, 14));
  });
  blob(S + 36, 536, [120, 120, 120], (x, y) => (ell(6, 7, 4, 4)(x, y) && !ell(6, 7, 2.2, 2.2)(x, y) && x < 8 ? true : false) || (x >= 9 && x <= 12 && y >= 6 && y <= 12 ? [60, 60, 60] : false));
  blob(S + 37, 537, [235, 235, 235], (x, y) => (x + y >= 13 && x + y <= 17 && x >= 4 && y >= 2 && x <= 13) || (x + y === 15 && x < 4 && x >= 1 && [200, 200, 200]));
  blob(S + 38, 538, [190, 140, 70], (x, y) => ell(7.5, 9, 6.5, 3.5)(x, y) && ((x % 4 === 1 && y < 9) ? [220, 180, 110] : true));
}
