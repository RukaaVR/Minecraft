// Block definitions and the procedurally painted texture atlas.
'use strict';

const TILE = 16;          // pixels per tile
const ATLAS_COLS = 8;
const ATLAS_ROWS = 4;

// Tile indices in the atlas
const T = {
  GRASS_TOP: 0, GRASS_SIDE: 1, DIRT: 2, STONE: 3, LOG_SIDE: 4, LOG_TOP: 5,
  LEAVES: 6, SAND: 7, WATER: 8, PLANKS: 9, COBBLE: 10, GLASS: 11, BRICK: 12,
  BEDROCK: 13, SNOW: 14, SNOW_SIDE: 15, COAL: 16, IRON: 17, GOLD: 18,
  DIAMOND: 19, GRAVEL: 20, WOOL_WHITE: 21, WOOL_RED: 22, WOOL_BLUE: 23,
  WOOL_YELLOW: 24, OBSIDIAN: 25, CACTUS_SIDE: 26, CACTUS_TOP: 27,
  BOOKSHELF: 28, TNT_SIDE: 29, TNT_TOP: 30, PUMPKIN: 31,
};

const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, COBBLE: 4, PLANKS: 5, LOG: 6,
  LEAVES: 7, SAND: 8, GRAVEL: 9, GLASS: 10, BRICK: 11, BEDROCK: 12,
  WATER: 13, SNOW_GRASS: 14, SNOW: 15, COAL: 16, IRON: 17, GOLD: 18,
  DIAMOND: 19, WOOL_WHITE: 20, WOOL_RED: 21, WOOL_BLUE: 22,
  WOOL_YELLOW: 23, OBSIDIAN: 24, CACTUS: 25, BOOKSHELF: 26, TNT: 27,
  PUMPKIN: 28,
};

// tiles: [top, bottom, side]
// cutout: rendered in the solid pass with alpha testing (leaves, glass)
const BLOCKS = [];
function defBlock(id, name, tiles, opts = {}) {
  if (typeof tiles === 'number') tiles = [tiles, tiles, tiles];
  BLOCKS[id] = {
    id, name, tiles,
    solid: opts.solid !== false,
    cutout: !!opts.cutout,
    liquid: !!opts.liquid,
    breakable: opts.breakable !== false,
  };
}
defBlock(B.AIR, 'Air', 0, { solid: false });
defBlock(B.GRASS, 'Grass Block', [T.GRASS_TOP, T.DIRT, T.GRASS_SIDE]);
defBlock(B.DIRT, 'Dirt', T.DIRT);
defBlock(B.STONE, 'Stone', T.STONE);
defBlock(B.COBBLE, 'Cobblestone', T.COBBLE);
defBlock(B.PLANKS, 'Oak Planks', T.PLANKS);
defBlock(B.LOG, 'Oak Log', [T.LOG_TOP, T.LOG_TOP, T.LOG_SIDE]);
defBlock(B.LEAVES, 'Oak Leaves', T.LEAVES, { cutout: true });
defBlock(B.SAND, 'Sand', T.SAND);
defBlock(B.GRAVEL, 'Gravel', T.GRAVEL);
defBlock(B.GLASS, 'Glass', T.GLASS, { cutout: true });
defBlock(B.BRICK, 'Bricks', T.BRICK);
defBlock(B.BEDROCK, 'Bedrock', T.BEDROCK, { breakable: false });
defBlock(B.WATER, 'Water', T.WATER, { solid: false, liquid: true });
defBlock(B.SNOW_GRASS, 'Snowy Grass', [T.SNOW, T.DIRT, T.SNOW_SIDE]);
defBlock(B.SNOW, 'Snow Block', T.SNOW);
defBlock(B.COAL, 'Coal Ore', T.COAL);
defBlock(B.IRON, 'Iron Ore', T.IRON);
defBlock(B.GOLD, 'Gold Ore', T.GOLD);
defBlock(B.DIAMOND, 'Diamond Ore', T.DIAMOND);
defBlock(B.WOOL_WHITE, 'White Wool', T.WOOL_WHITE);
defBlock(B.WOOL_RED, 'Red Wool', T.WOOL_RED);
defBlock(B.WOOL_BLUE, 'Blue Wool', T.WOOL_BLUE);
defBlock(B.WOOL_YELLOW, 'Yellow Wool', T.WOOL_YELLOW);
defBlock(B.OBSIDIAN, 'Obsidian', T.OBSIDIAN);
defBlock(B.CACTUS, 'Cactus', [T.CACTUS_TOP, T.CACTUS_TOP, T.CACTUS_SIDE]);
defBlock(B.BOOKSHELF, 'Bookshelf', [T.PLANKS, T.PLANKS, T.BOOKSHELF]);
defBlock(B.TNT, 'TNT', [T.TNT_TOP, T.TNT_TOP, T.TNT_SIDE]);
defBlock(B.PUMPKIN, 'Pumpkin', [T.PUMPKIN, T.PUMPKIN, T.PUMPKIN]);

// Opaque = hides faces of neighbours
function isOpaque(id) {
  const b = BLOCKS[id];
  return id !== B.AIR && !b.cutout && !b.liquid;
}
function isSolid(id) { return BLOCKS[id].solid; }

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

  function painter(tile, seed) {
    const ox = (tile % ATLAS_COLS) * TILE;
    const oy = Math.floor(tile / ATLAS_COLS) * TILE;
    const rand = mulberry32(seed * 7919 + 13);
    const set = (x, y, r, g, b, a = 255) => {
      if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
      const i = ((oy + y) * canvas.width + ox + x) * 4;
      data[i] = clamp255(r); data[i + 1] = clamp255(g); data[i + 2] = clamp255(b); data[i + 3] = a;
    };
    return { set, rand };
  }
  const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));
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
  const ore = (tile, seed, color) => {
    const p = painter(tile, seed);
    fill(p, [125, 125, 125], 30);
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
  const dirtLike = (p) => {
    fill(p, [134, 96, 67], 26);
    speckle(p, [105, 75, 50], 18);
    speckle(p, [160, 120, 90], 8);
  };

  let p;
  // grass top
  p = painter(T.GRASS_TOP, 1);
  fill(p, [95, 159, 53], 34);
  speckle(p, [120, 185, 70], 20);
  // dirt
  p = painter(T.DIRT, 2); dirtLike(p);
  // grass side
  p = painter(T.GRASS_SIDE, 3); dirtLike(p);
  for (let x = 0; x < TILE; x++) {
    const h = 3 + Math.floor(p.rand() * 3);
    for (let y = 0; y < h; y++) { const c = vary(p.rand, [95, 159, 53], 30); p.set(x, y, c[0], c[1], c[2]); }
  }
  // stone
  p = painter(T.STONE, 4);
  fill(p, [125, 125, 125], 22);
  speckle(p, [100, 100, 100], 22, 2);
  speckle(p, [145, 145, 145], 10);
  // log side
  p = painter(T.LOG_SIDE, 5);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const dark = (x % 4 === 0 || (x * 7 + y) % 11 === 0) ? -25 : 0;
    const c = vary(p.rand, [104, 83, 50], 18); p.set(x, y, c[0] + dark, c[1] + dark, c[2] + dark);
  }
  // log top
  p = painter(T.LOG_TOP, 6);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d > 6.5) { const c = vary(p.rand, [104, 83, 50], 18); p.set(x, y, c[0], c[1], c[2]); continue; }
    const ring = Math.floor(d) % 2 === 0 ? 0 : -22;
    const c = vary(p.rand, [182, 146, 94], 12); p.set(x, y, c[0] + ring, c[1] + ring, c[2] + ring);
  }
  // leaves (cutout)
  p = painter(T.LEAVES, 7);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const r = p.rand();
    if (r < 0.18) { p.set(x, y, 0, 0, 0, 0); continue; }
    const c = vary(p.rand, r < 0.5 ? [52, 120, 38] : [72, 148, 50], 30);
    p.set(x, y, c[0], c[1], c[2]);
  }
  // sand
  p = painter(T.SAND, 8);
  fill(p, [219, 207, 163], 18);
  speckle(p, [196, 184, 140], 16);
  // water
  p = painter(T.WATER, 9);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const w = Math.sin((x + y * 0.5) * 0.8) * 10;
    const c = vary(p.rand, [48, 92, 210], 14); p.set(x, y, c[0] + w, c[1] + w, c[2] + w);
  }
  // planks
  p = painter(T.PLANKS, 10);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const seam = (y % 4 === 3) || (x === ((Math.floor(y / 4) * 5) % 16)) ? -35 : 0;
    const c = vary(p.rand, [162, 130, 78], 14); p.set(x, y, c[0] + seam, c[1] + seam, c[2] + seam);
  }
  // cobble
  p = painter(T.COBBLE, 11);
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
  // glass (cutout)
  p = painter(T.GLASS, 12);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const edge = x === 0 || y === 0 || x === TILE - 1 || y === TILE - 1;
    const shine = (x - y === 3 || x - y === 5) && x > 2 && x < 10;
    if (edge) p.set(x, y, 200, 225, 235);
    else if (shine) p.set(x, y, 235, 245, 250);
    else p.set(x, y, 0, 0, 0, 0);
  }
  // brick
  p = painter(T.BRICK, 13);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const row = Math.floor(y / 4);
    const off = row % 2 ? 4 : 0;
    const mortar = y % 4 === 3 || (x + off) % 8 === 7;
    const c = mortar ? vary(p.rand, [170, 165, 155], 14) : vary(p.rand, [150, 72, 56], 22);
    p.set(x, y, c[0], c[1], c[2]);
  }
  // bedrock
  p = painter(T.BEDROCK, 14);
  fill(p, [80, 80, 80], 60);
  speckle(p, [30, 30, 30], 30, 2);
  // snow
  p = painter(T.SNOW, 15);
  fill(p, [240, 248, 252], 10);
  // snow side
  p = painter(T.SNOW_SIDE, 16); dirtLike(p);
  for (let x = 0; x < TILE; x++) {
    const h = 3 + Math.floor(p.rand() * 3);
    for (let y = 0; y < h; y++) { const c = vary(p.rand, [240, 248, 252], 10); p.set(x, y, c[0], c[1], c[2]); }
  }
  ore(T.COAL, 17, [30, 30, 30]);
  ore(T.IRON, 18, [216, 175, 147]);
  ore(T.GOLD, 19, [250, 220, 60]);
  ore(T.DIAMOND, 20, [90, 230, 225]);
  // gravel
  p = painter(T.GRAVEL, 21);
  fill(p, [130, 124, 122], 40);
  speckle(p, [95, 90, 88], 20, 2);
  speckle(p, [170, 165, 160], 10);
  wool(T.WOOL_WHITE, 22, [232, 232, 232]);
  wool(T.WOOL_RED, 23, [170, 44, 40]);
  wool(T.WOOL_BLUE, 24, [52, 62, 160]);
  wool(T.WOOL_YELLOW, 25, [230, 200, 50]);
  // obsidian
  p = painter(T.OBSIDIAN, 26);
  fill(p, [22, 16, 34], 14);
  speckle(p, [60, 40, 90], 14);
  // cactus side
  p = painter(T.CACTUS_SIDE, 27);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const ridge = x % 4 === 1 ? 20 : 0;
    const c = vary(p.rand, [60, 130, 40], 16); p.set(x, y, c[0] + ridge, c[1] + ridge, c[2] + ridge);
  }
  for (let n = 0; n < 10; n++) p.set(Math.floor(p.rand() * 4) * 4, Math.floor(p.rand() * 16), 20, 30, 15);
  // cactus top
  p = painter(T.CACTUS_TOP, 28);
  fill(p, [80, 150, 55], 16);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    if (x === 0 || y === 0 || x === 15 || y === 15) p.set(x, y, 45, 100, 30);
  }
  // bookshelf
  p = painter(T.BOOKSHELF, 29);
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
  // TNT side
  p = painter(T.TNT_SIDE, 30);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    let c = vary(p.rand, [200, 50, 40], 18);
    if (y >= 5 && y <= 10) c = vary(p.rand, [230, 230, 225], 10);
    if (y >= 6 && y <= 9 && x >= 3 && x <= 12 && (x + y) % 3 === 0) c = [30, 30, 30];
    p.set(x, y, c[0], c[1], c[2]);
  }
  // TNT top
  p = painter(T.TNT_TOP, 31);
  fill(p, [200, 50, 40], 18);
  for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) p.set(x, y, 40, 40, 40);
  // pumpkin
  p = painter(T.PUMPKIN, 32);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const groove = x % 5 === 0 ? -30 : 0;
    const c = vary(p.rand, [222, 130, 30], 16); p.set(x, y, c[0] + groove, c[1] + groove, c[2] + groove);
  }

  ctx.putImageData(img, 0, 0);
  return canvas;
}

// UV rectangle for a tile, inset slightly to avoid bleeding between tiles.
function tileUV(tile) {
  const col = tile % ATLAS_COLS;
  const row = Math.floor(tile / ATLAS_COLS);
  const eps = 0.01 / ATLAS_COLS;
  const u0 = col / ATLAS_COLS + eps;
  const u1 = (col + 1) / ATLAS_COLS - eps;
  // Canvas row 0 is at the top; texture v=1 is the top with flipY.
  const v1 = 1 - row / ATLAS_ROWS - eps;
  const v0 = 1 - (row + 1) / ATLAS_ROWS + eps;
  return [u0, v0, u1, v1];
}

// Draw a small isometric block icon (for the hotbar / inventory).
function drawBlockIcon(atlas, id, size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const b = BLOCKS[id];
  const src = (tile) => [(tile % ATLAS_COLS) * TILE, Math.floor(tile / ATLAS_COLS) * TILE];
  const s = size / 2;
  const h = size * 0.25;
  const cx = size / 2;

  function face(tile, a, bb, cc, d, e, f, shade) {
    ctx.save();
    ctx.setTransform(a, bb, cc, d, e, f);
    const [sx, sy] = src(tile);
    ctx.drawImage(atlas, sx, sy, TILE, TILE, 0, 0, 1, 1);
    if (shade > 0) { ctx.fillStyle = `rgba(0,0,0,${shade})`; ctx.fillRect(0, 0, 1, 1); }
    ctx.restore();
  }
  // top: rhombus
  face(b.tiles[0], s * 0.98, h * 0.98, -s * 0.98, h * 0.98, cx, 1, 0);
  // left face
  face(b.tiles[2], s * 0.98, h * 0.98, 0, s * 1.0, 1, h + 1, 0.2);
  // right face
  face(b.tiles[2], s * 0.98, -h * 0.98, 0, s * 1.0, cx, 2 * h * 0.98 + 1, 0.4);
  return c;
}
