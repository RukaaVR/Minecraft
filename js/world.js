// Chunked voxel world: terrain generation, storage, lighting and meshing.
'use strict';

const CHUNK_SIZE = 16;
const WORLD_HEIGHT = 128;
const SEA_LEVEL = 30;
const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT;

// Face definitions: corners are [x, y, z, uFlag, vFlag]; indices (0,1,2)(2,1,3).
// Order: 0 -x, 1 +x, 2 -y, 3 +y, 4 -z, 5 +z
const FACES = [
  { dir: [-1, 0, 0], shade: 0.8, corners: [[0, 1, 0, 0, 1], [0, 0, 0, 0, 0], [0, 1, 1, 1, 1], [0, 0, 1, 1, 0]] },
  { dir: [1, 0, 0], shade: 0.8, corners: [[1, 1, 1, 0, 1], [1, 0, 1, 0, 0], [1, 1, 0, 1, 1], [1, 0, 0, 1, 0]] },
  { dir: [0, -1, 0], shade: 0.5, corners: [[1, 0, 1, 1, 0], [0, 0, 1, 0, 0], [1, 0, 0, 1, 1], [0, 0, 0, 0, 1]] },
  { dir: [0, 1, 0], shade: 1.0, corners: [[0, 1, 1, 1, 1], [1, 1, 1, 0, 1], [0, 1, 0, 1, 0], [1, 1, 0, 0, 0]] },
  { dir: [0, 0, -1], shade: 0.65, corners: [[1, 0, 0, 0, 0], [0, 0, 0, 1, 0], [1, 1, 0, 0, 1], [0, 1, 0, 1, 1]] },
  { dir: [0, 0, 1], shade: 0.65, corners: [[0, 0, 1, 0, 0], [1, 0, 1, 1, 0], [0, 1, 1, 0, 1], [1, 1, 1, 1, 1]] },
];
const AO_CURVE = [0.5, 0.68, 0.84, 1.0];
// Light level (0-15) -> brightness, like Minecraft's 0.8^(15-l) curve.
const LIGHT_CURVE = new Float32Array(16);
for (let i = 0; i < 16; i++) LIGHT_CURVE[i] = Math.max(0.03, Math.pow(0.8, 15 - i));
function lightBrightness(l) {
  const i = Math.floor(l), f = l - i;
  if (i >= 15) return 1;
  return LIGHT_CURVE[i] * (1 - f) + LIGHT_CURVE[i + 1] * f;
}

// Door collision / render box for a facing (0:+z 1:-x 2:-z 3:+x) and open state.
function doorBox(facing, open) {
  const t = 3 / 16;
  const side = (facing + (open ? 1 : 0)) % 4;
  switch (side) {
    case 0: return [[0, 0, 1 - t], [1, 1, 1]];
    case 1: return [[0, 0, 0], [t, 1, 1]];
    case 2: return [[0, 0, 0], [1, 1, t]];
    default: return [[1 - t, 0, 0], [1, 1, 1]];
  }
}

class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.blocks = new Uint8Array(CHUNK_VOLUME);
    this.light = null; // Uint8Array (sky << 4 | block), computed when meshed
    this.lightH = 0;
    this.dirty = true;
    this.solidMesh = null;
    this.waterMesh = null;
    this.maxY = 0;
  }
  static index(x, y, z) { return (y * CHUNK_SIZE + z) * CHUNK_SIZE + x; }
  get(x, y, z) { return this.blocks[Chunk.index(x, y, z)]; }
  set(x, y, z, id) { this.blocks[Chunk.index(x, y, z)] = id; }
}

// Shared scratch buffers for meshing (region = chunk + 8 block margin).
const MARGIN = 8;
const RW = CHUNK_SIZE + MARGIN * 2;
const R_IDS = new Uint8Array(RW * RW * WORLD_HEIGHT);
const R_SKY = new Uint8Array(RW * RW * WORLD_HEIGHT);
const R_BLK = new Uint8Array(RW * RW * WORLD_HEIGHT);
const R_QUEUE = new Int32Array(RW * RW * WORLD_HEIGHT);
const R_TOP = new Int32Array(RW * RW);

class World {
  constructor(scene, seed, materials, dim = 0) {
    this.scene = scene;
    this.seed = seed;
    this.dim = dim; // 0 overworld, 1 nether
    this.villageCache = new Map();
    this.materials = materials;
    this.chunks = new Map();
    this.edits = new Map(); // "cx,cz" -> Map(index -> id)
    this.blockData = new Map(); // "x,y,z" -> {facing, items, ...}
    this.noise = new SimplexNoise(seed);
    this.noise2 = new SimplexNoise(seed + 1013);
    this.noise3 = new SimplexNoise(seed + 7777);
    this.caveNoise = new SimplexNoise(seed + 4242);
    this.uvCache = [];
    for (let t = 0; t < ATLAS_COLS * ATLAS_ROWS; t++) this.uvCache[t] = tileUV(t);
  }

  static key(cx, cz) { return cx + ',' + cz; }
  static bkey(x, y, z) { return x + ',' + y + ',' + z; }

  getChunk(cx, cz) { return this.chunks.get(World.key(cx, cz)); }

  getBlock(x, y, z) {
    if (y < 0 || y >= WORLD_HEIGHT) return B.AIR;
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.chunks.get(World.key(cx, cz));
    if (!chunk) return B.AIR;
    return chunk.blocks[((y * CHUNK_SIZE + (z - cz * CHUNK_SIZE)) * CHUNK_SIZE + (x - cx * CHUNK_SIZE))];
  }

  isLoaded(x, z) { return this.chunks.has(World.key(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE))); }

  // Returns {sky, block} light levels 0..15 at a block position.
  getLight(x, y, z) {
    if (y >= WORLD_HEIGHT) return { sky: 15, block: 0 };
    if (y < 0) return { sky: 0, block: 0 };
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.chunks.get(World.key(cx, cz));
    const top = this.dim >= 1 ? 0 : 15;
    if (!chunk || !chunk.light) return { sky: top, block: 0 };
    if (y >= chunk.lightH) return { sky: top, block: 0 };
    const v = chunk.light[(y * CHUNK_SIZE + (z - cz * CHUNK_SIZE)) * CHUNK_SIZE + (x - cx * CHUNK_SIZE)];
    return { sky: v >> 4, block: v & 15 };
  }

  setBlock(x, y, z, id) {
    if (y < 0 || y >= WORLD_HEIGHT) return false;
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return false;
    const lx = x - cx * CHUNK_SIZE, lz = z - cz * CHUNK_SIZE;
    const old = chunk.get(lx, y, lz);
    if (old === id) return false;
    chunk.set(lx, y, lz, id);
    if (y + 2 > chunk.maxY) chunk.maxY = Math.min(WORLD_HEIGHT, y + 2);
    chunk.dirty = true;

    const k = World.key(cx, cz);
    if (!this.edits.has(k)) this.edits.set(k, new Map());
    this.edits.get(k).set(Chunk.index(lx, y, lz), id);

    if (id === B.AIR || !BLOCKS[id].facing) {
      // Drop container data of removed blocks (furnace -> lit furnace keeps it).
      const keep = (old === B.FURNACE && id === B.FURNACE_LIT) || (old === B.FURNACE_LIT && id === B.FURNACE);
      if (!keep) this.blockData.delete(World.bkey(x, y, z));
    }

    // Light and AO reach into neighbouring chunks.
    const mark = (dx, dz) => { const n = this.getChunk(cx + dx, cz + dz); if (n) n.dirty = true; };
    const near = MARGIN;
    const west = lx < near, east = lx >= CHUNK_SIZE - near, north = lz < near, south = lz >= CHUNK_SIZE - near;
    if (west) mark(-1, 0);
    if (east) mark(1, 0);
    if (north) mark(0, -1);
    if (south) mark(0, 1);
    if (west && north) mark(-1, -1);
    if (west && south) mark(-1, 1);
    if (east && north) mark(1, -1);
    if (east && south) mark(1, 1);
    return true;
  }

  getData(x, y, z) { return this.blockData.get(World.bkey(x, y, z)); }
  setData(x, y, z, data) {
    if (data) this.blockData.set(World.bkey(x, y, z), data);
    else this.blockData.delete(World.bkey(x, y, z));
    const c = this.getChunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
    if (c) c.dirty = true;
  }

  // ------------------------------------------------------------------------
  // Terrain generation
  // ------------------------------------------------------------------------

  columnInfo(x, z) {
    const n = this.noise, n2 = this.noise2, n3 = this.noise3;
    const continental = n.fbm2D(x / 600, z / 600, 3);
    const hills = n.fbm2D(x / 140, z / 140, 4);
    const detail = n2.fbm2D(x / 40, z / 40, 3);
    const mountainMask = Math.max(0, n2.fbm2D(x / 400 + 100, z / 400, 3) * 1.6 - 0.25);
    const mountains = Math.pow(Math.abs(n3.fbm2D(x / 120, z / 120, 4)), 0.9) * 70 * mountainMask;
    let h = SEA_LEVEL + 2 + continental * 14 + hills * 9 + detail * 3 + mountains;
    h = Math.max(4, Math.min(WORLD_HEIGHT - 12, Math.floor(h)));
    const temperature = n3.fbm2D(x / 500 + 50, z / 500 - 50, 2);
    const humidity = n2.fbm2D(x / 420 - 30, z / 420 + 70, 2);
    let biome;
    if (temperature > 0.28) biome = 'desert';
    else if (temperature < -0.32) biome = 'snowy';
    else if (temperature < -0.12) biome = 'taiga';
    else if (humidity > 0.22) biome = 'birch';
    else if (humidity > 0.0) biome = 'forest';
    else biome = 'plains';
    return { height: h, desert: biome === 'desert', biome };
  }

  // Tree density per biome
  static treeDensity(biome) {
    return { plains: 0.003, forest: 0.035, birch: 0.03, taiga: 0.03, snowy: 0.014, desert: 0.004 }[biome] || 0.01;
  }

  generateChunk(cx, cz) {
    if (this.arena) return this.generateArena(cx, cz);
    if (this.dim === 1) return this.generateNether(cx, cz);
    if (this.dim === 2) return this.generateEnd(cx, cz);
    const chunk = new Chunk(cx, cz);
    const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;
    const heights = new Int32Array(CHUNK_SIZE * CHUNK_SIZE);
    const deserts = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
    const biomes = new Array(CHUNK_SIZE * CHUNK_SIZE);
    let maxY = SEA_LEVEL + 1;
    const seed = this.seed;

    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const wx = ox + x, wz = oz + z;
        const { height: h, desert, biome } = this.columnInfo(wx, wz);
        heights[z * CHUNK_SIZE + x] = h;
        deserts[z * CHUNK_SIZE + x] = desert ? 1 : 0;
        biomes[z * CHUNK_SIZE + x] = biome;
        const beach = h <= SEA_LEVEL + 1;
        const snowy = h > 78 || biome === 'snowy';
        for (let y = 0; y <= Math.max(h, SEA_LEVEL); y++) {
          let id;
          if (y === 0 || (y < 3 && hash3(wx, y, wz, seed) < 0.5)) id = B.BEDROCK;
          else if (y > h) id = B.WATER;
          else if (y === h) {
            if (desert || beach) id = h < SEA_LEVEL - 2 ? B.GRAVEL : B.SAND;
            else if (snowy) id = B.SNOW_GRASS;
            else id = h < SEA_LEVEL ? B.DIRT : B.GRASS;
          } else if (y > h - 4) {
            id = (desert || beach) ? (y < h - 2 && desert ? B.SANDSTONE : B.SAND) : B.DIRT;
          } else {
            id = B.STONE;
            const r = hash3(wx, y, wz, seed + 99);
            if (r < 0.012) id = B.COAL_ORE;
            else if (r < 0.018 && y < 64) id = B.IRON_ORE;
            else if (r < 0.0205 && y < 32) id = B.GOLD_ORE;
            else if (r < 0.022 && y < 16) id = B.DIAMOND_ORE;
            else if (r < 0.0226 && h > 72 && y > 40) id = B.EMERALD_ORE;
            else if (r >= 0.0226 && r < 0.0234 && y < 32) id = B.LAPIS_ORE;
            else if (r >= 0.0234 && r < 0.0248 && y < 16) id = B.REDSTONE_ORE;
            else if (r > 0.995) id = B.GRAVEL;
          }
          if (id !== B.WATER && id !== B.BEDROCK && y < h - 1 && y > 3) {
            const c = this.caveNoise.noise3D(wx / 28, y / 18, wz / 28);
            const c2 = this.caveNoise.noise3D(wx / 28 + 100, y / 18, wz / 28 + 100);
            if (Math.abs(c) < 0.09 && Math.abs(c2) < 0.09 && !(h <= SEA_LEVEL && y > h - 6)) id = B.AIR;
          }
          chunk.set(x, y, z, id);
        }
        // Surface plants
        const top = chunk.get(x, h, z);
        if ((top === B.SAND || top === B.GRASS) && h === SEA_LEVEL + 1 && hash3(wx, 9, wz, seed + 77) < 0.04) {
          const tall = 1 + Math.floor(hash3(wx, 10, wz, seed) * 3);
          for (let i = 1; i <= tall; i++) chunk.set(x, h + i, z, B.SUGAR_CANE);
        } else if (!desert && h > SEA_LEVEL && top === B.GRASS) {
          const r = hash3(wx, 7, wz, seed + 555) * (biome === 'forest' || biome === 'birch' ? 0.7 : biome === 'taiga' ? 1.6 : 1);
          if (r < 0.12) chunk.set(x, h + 1, z, B.TALL_GRASS);
          else if (r < 0.13) chunk.set(x, h + 1, z, B.DANDELION);
          else if (r < 0.137) chunk.set(x, h + 1, z, B.POPPY);
          else if (r < 0.1375) chunk.set(x, h + 1, z, B.PUMPKIN);
        }
        if (h + 2 > maxY) maxY = h + 2;
      }
    }

    // Trees / cacti (scan a margin so trees crossing borders are consistent).
    // Villages sit in clearings: no trees near their centre.
    const villages = Villages.villagesIn(this, ox - 2, oz - 2, ox + CHUNK_SIZE + 2, oz + CHUNK_SIZE + 2);
    const inVillage = (x, z) => villages.some((v) => Math.abs(x - v.center[0]) < Villages.REACH - 6 && Math.abs(z - v.center[2]) < Villages.REACH - 6);
    const R = 2;
    for (let z = -R; z < CHUNK_SIZE + R; z++) {
      for (let x = -R; x < CHUNK_SIZE + R; x++) {
        const wx = ox + x, wz = oz + z;
        const r = hash3(wx, 0, wz, seed + 31337);
        if (r > 0.035) continue;
        if (villages.length && inVillage(wx, wz)) continue;
        let h, desert, biome;
        if (x >= 0 && z >= 0 && x < CHUNK_SIZE && z < CHUNK_SIZE) {
          h = heights[z * CHUNK_SIZE + x]; desert = deserts[z * CHUNK_SIZE + x] === 1; biome = biomes[z * CHUNK_SIZE + x];
        } else {
          const info = this.columnInfo(wx, wz); h = info.height; desert = info.desert; biome = info.biome;
        }
        if (r > World.treeDensity(biome)) continue;
        if (h <= SEA_LEVEL + 1 || h > 82) continue;
        if (biome === 'taiga' || biome === 'snowy' || (h > 76 && !desert)) {
          // Spruce: tall trunk with a cone of needles
          const trunk = 6 + Math.floor(hash3(wx, 2, wz, seed) * 4);
          const top = h + trunk;
          for (let ly = top + 1, k = 0; ly >= h + 3; ly--, k++) {
            const rad = k === 0 ? 0 : k === 1 ? 1 : (k % 2 === 0 ? Math.min(3, 1 + (k >> 2)) : Math.min(2, (k >> 2)));
            for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
              if (Math.abs(dx) + Math.abs(dz) > rad + (rad > 1 ? 1 : 0)) continue;
              this._put(chunk, x + dx, ly, z + dz, B.SPRUCE_LEAVES, false);
            }
          }
          for (let i = 1; i <= trunk; i++) this._put(chunk, x, h + i, z, B.SPRUCE_LOG, true);
          if (x >= 0 && z >= 0 && x < CHUNK_SIZE && z < CHUNK_SIZE) chunk.set(x, h, z, B.DIRT);
          maxY = Math.max(maxY, top + 3);
          continue;
        }
        const birch = biome === 'birch' || (biome === 'forest' && hash3(wx, 3, wz, seed) < 0.2);
        const LOGB = birch ? B.BIRCH_LOG : B.LOG, LEAF = birch ? B.BIRCH_LEAVES : B.LEAVES;
        if (desert) {
          if (r > 0.004) continue;
          const tall = 1 + Math.floor(hash3(wx, 1, wz, seed) * 3);
          for (let i = 1; i <= tall; i++) this._put(chunk, x, h + i, z, B.CACTUS, true);
          maxY = Math.max(maxY, h + tall + 2);
          continue;
        }
        const trunk = (birch ? 5 : 4) + Math.floor(hash3(wx, 2, wz, seed) * 3);
        const top = h + trunk;
        for (let ly = top - 2; ly <= top + 1; ly++) {
          const rad = ly >= top ? 1 : 2;
          for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
            if (rad === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2 && hash3(wx + dx, ly, wz + dz, seed) < 0.6) continue;
            if (ly === top + 1 && Math.abs(dx) === 1 && Math.abs(dz) === 1) continue;
            this._put(chunk, x + dx, ly, z + dz, LEAF, false);
          }
        }
        for (let i = 1; i <= trunk; i++) this._put(chunk, x, h + i, z, LOGB, true);
        if (x >= 0 && z >= 0 && x < CHUNK_SIZE && z < CHUNK_SIZE) chunk.set(x, h, z, B.DIRT);
        maxY = Math.max(maxY, top + 3);
      }
    }

    // Villages and the stronghold
    for (const [x, y, z, id] of Villages.blocksForChunk(this, cx, cz).concat(Structures.blocksForChunk(this, cx, cz))) {
      chunk.set(x - ox, y, z - oz, id);
      if (y + 2 > maxY) maxY = y + 2;
    }
    return this._finishChunk(chunk, maxY);
  }

  _finishChunk(chunk, maxY) {
    const cx = chunk.cx, cz = chunk.cz;
    const edits = this.edits.get(World.key(cx, cz));
    if (edits) {
      for (const [idx, id] of edits) {
        chunk.blocks[idx] = id;
        const y = Math.floor(idx / (CHUNK_SIZE * CHUNK_SIZE));
        if (y + 2 > maxY) maxY = y + 2;
      }
    }
    chunk.maxY = Math.min(WORLD_HEIGHT, maxY + 1);
    this.chunks.set(World.key(cx, cz), chunk);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const n = this.getChunk(cx + dx, cz + dz);
      if (n) n.dirty = true;
    }
    return chunk;
  }

  // Nether: netherrack caverns, a lava sea, soul sand, glowstone and quartz.
  generateNether(cx, cz) {
    const chunk = new Chunk(cx, cz);
    const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;
    const seed = this.seed + 666;
    const n = this.caveNoise, n2 = this.noise2;
    const LAVA_SEA = 31;
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const wx = ox + x, wz = oz + z;
        const soul = n2.noise2D(wx / 22, wz / 22) > 0.35;
        for (let y = 0; y < WORLD_HEIGHT; y++) {
          let id;
          if (y === 0 || y === WORLD_HEIGHT - 1 || (y < 4 && hash3(wx, y, wz, seed) < 0.5) || (y > WORLD_HEIGHT - 5 && hash3(wx, y, wz, seed) < 0.5)) {
            id = B.BEDROCK;
          } else {
            const fall = Math.pow((y - 66) / 60, 4) * 1.6;
            const d = n.noise3D(wx / 46, y / 30, wz / 46) * 0.65 + n.noise3D(wx / 15, y / 11, wz / 15) * 0.25 + fall - 0.12;
            if (d > 0) {
              id = B.NETHERRACK;
              const r = hash3(wx, y, wz, seed + 7);
              if (r < 0.014) id = B.QUARTZ_ORE;
              else if (soul && y < 44 && y > 24) id = B.SOUL_SAND;
            } else id = y <= LAVA_SEA ? B.LAVA : B.AIR;
          }
          chunk.set(x, y, z, id);
        }
      }
    }
    // Glowstone hanging from ceilings (scan a margin for clusters crossing borders)
    const R = 3;
    for (let z = -R; z < CHUNK_SIZE + R; z++) for (let x = -R; x < CHUNK_SIZE + R; x++) {
      const wx = ox + x, wz = oz + z;
      if (hash3(wx, 1, wz, seed + 99) > 0.006) continue;
      // find a ceiling: solid above air, searching down from y=120
      let cy = -1;
      for (let y = 118; y > 70; y--) {
        const above = this._netherSolid(wx, y + 1, wz), here = this._netherSolid(wx, y, wz);
        if (above && !here) { cy = y; break; }
      }
      if (cy < 0) continue;
      for (let i = 0; i < 40; i++) {
        const gx = x + Math.floor(hash3(wx, i, wz, seed + 3) * 5) - 2;
        const gz = z + Math.floor(hash3(wx, i, wz, seed + 4) * 5) - 2;
        const gy = cy - Math.floor(hash3(wx, i, wz, seed + 5) * 4);
        this._put(chunk, gx, gy, gz, B.GLOWSTONE, false);
      }
    }
    for (const [x, y, z, id] of Structures.blocksForChunk(this, cx, cz)) chunk.set(x - ox, y, z - oz, id);
    return this._finishChunk(chunk, WORLD_HEIGHT);
  }

  // The End: a floating island of end stone with obsidian pillars around the centre.
  generateEnd(cx, cz) {
    const chunk = new Chunk(cx, cz);
    const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;
    const n = this.noise2;
    let maxY = 1;
    for (let z = 0; z < CHUNK_SIZE; z++) for (let x = 0; x < CHUNK_SIZE; x++) {
      const wx = ox + x, wz = oz + z;
      const r = Math.hypot(wx, wz);
      const nn = n.noise2D(wx / 40, wz / 40);
      const edge = 84 + nn * 14;
      if (r < edge) {
        const t = r / edge;
        const top = Math.floor(60 + nn * 3 - t * t * 8);
        const bottom = Math.floor(60 - (1 - t * t) * 34 + nn * 5);
        for (let y = Math.max(1, bottom); y <= top; y++) chunk.set(x, y, z, B.END_STONE);
        maxY = Math.max(maxY, top + 2);
      }
      for (const pl of Structures.END_PILLARS) {
        if (Math.hypot(wx - pl.x, wz - pl.z) <= pl.r + 0.5) {
          for (let y = 50; y <= pl.h; y++) chunk.set(x, y, z, B.OBSIDIAN);
          if (wx === pl.x && wz === pl.z) chunk.set(x, pl.h + 1, z, B.BEDROCK);
          maxY = Math.max(maxY, pl.h + 3);
        }
      }
    }
    return this._finishChunk(chunk, Math.min(WORLD_HEIGHT, maxY));
  }

  // Minigame maps: built from a fixed layout (see network.js), void everywhere else.
  generateArena(cx, cz) {
    const chunk = new Chunk(cx, cz);
    const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;
    let maxY = 1;
    for (const [x, y, z, id] of Arena.blocksForChunk(this, cx, cz)) {
      chunk.set(x - ox, y, z - oz, id);
      if (y + 2 > maxY) maxY = y + 2;
    }
    return this._finishChunk(chunk, Math.min(WORLD_HEIGHT, maxY));
  }

  // Same density test as generateNether, for blocks outside the chunk being built.
  _netherSolid(wx, y, wz) {
    const n = this.caveNoise;
    const fall = Math.pow((y - 66) / 60, 4) * 1.6;
    return n.noise3D(wx / 46, y / 30, wz / 46) * 0.65 + n.noise3D(wx / 15, y / 11, wz / 15) * 0.25 + fall - 0.12 > 0;
  }

  _put(chunk, x, y, z, id, overwrite) {
    if (x < 0 || z < 0 || x >= CHUNK_SIZE || z >= CHUNK_SIZE || y <= 0 || y >= WORLD_HEIGHT) return;
    const cur = chunk.get(x, y, z);
    if (overwrite ? cur !== B.BEDROCK : (cur === B.AIR || BLOCKS[cur].replaceable && cur !== B.WATER)) chunk.set(x, y, z, id);
  }

  hasAllNeighbours(cx, cz) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!this.chunks.has(World.key(cx + dx, cz + dz))) return false;
    }
    return true;
  }

  // ------------------------------------------------------------------------
  // Lighting (flood fill in a region around the chunk) + meshing
  // ------------------------------------------------------------------------

  _computeRegion(chunk) {
    let H = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const c = this.getChunk(chunk.cx + dx, chunk.cz + dz);
      if (c && c.maxY > H) H = c.maxY;
    }
    H = Math.min(WORLD_HEIGHT, H + 1);
    const plane = RW * RW;
    const ids = R_IDS, sky = R_SKY, blk = R_BLK, q = R_QUEUE;
    ids.fill(0, 0, plane * H);
    sky.fill(0, 0, plane * H);
    blk.fill(0, 0, plane * H);

    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const c = this.getChunk(chunk.cx + dx, chunk.cz + dz);
      if (!c) continue;
      const lx0 = Math.max(-MARGIN, dx * CHUNK_SIZE), lx1 = Math.min(CHUNK_SIZE + MARGIN, dx * CHUNK_SIZE + CHUNK_SIZE);
      const lz0 = Math.max(-MARGIN, dz * CHUNK_SIZE), lz1 = Math.min(CHUNK_SIZE + MARGIN, dz * CHUNK_SIZE + CHUNK_SIZE);
      const yMax = Math.min(H, c.maxY);
      for (let y = 0; y < yMax; y++) {
        for (let lz = lz0; lz < lz1; lz++) {
          const src = (y * CHUNK_SIZE + (lz - dz * CHUNK_SIZE)) * CHUNK_SIZE - dx * CHUNK_SIZE;
          const dst = (y * RW + (lz + MARGIN)) * RW + MARGIN;
          for (let lx = lx0; lx < lx1; lx++) ids[dst + lx] = c.blocks[src + lx];
        }
      }
    }

    // Sky light: straight down until something stops it, then flood fill.
    let head = 0, tail = 0;
    const qlen = q.length;
    const noSky = this.dim >= 1;
    for (let rz = 0; rz < RW && !noSky; rz++) for (let rx = 0; rx < RW; rx++) {
      let y = H - 1;
      while (y >= 0 && LIGHT_PASS[ids[(y * RW + rz) * RW + rx]] === 1) {
        sky[(y * RW + rz) * RW + rx] = 15;
        y--;
      }
      R_TOP[rz * RW + rx] = y + 1;
    }
    for (let rz = 0; rz < RW && !noSky; rz++) for (let rx = 0; rx < RW; rx++) {
      const top = R_TOP[rz * RW + rx];
      let deepest = top;
      if (rx > 0) deepest = Math.max(deepest, R_TOP[rz * RW + rx - 1]);
      if (rx < RW - 1) deepest = Math.max(deepest, R_TOP[rz * RW + rx + 1]);
      if (rz > 0) deepest = Math.max(deepest, R_TOP[(rz - 1) * RW + rx]);
      if (rz < RW - 1) deepest = Math.max(deepest, R_TOP[(rz + 1) * RW + rx]);
      for (let y = top; y <= deepest && y < H; y++) { q[tail] = (y * RW + rz) * RW + rx; tail = (tail + 1) % qlen; }
    }
    const flood = (arr) => {
      while (head !== tail) {
        const i = q[head]; head = (head + 1) % qlen;
        const l = arr[i];
        if (l <= 1) continue;
        const rx = i % RW, rz = Math.floor(i / RW) % RW, y = Math.floor(i / plane);
        const visit = (j) => {
          const pass = LIGHT_PASS[ids[j]];
          if (!pass) return;
          const nl = l - pass;
          if (nl > arr[j]) { arr[j] = nl; q[tail] = j; tail = (tail + 1) % qlen; }
        };
        if (rx > 0) visit(i - 1);
        if (rx < RW - 1) visit(i + 1);
        if (rz > 0) visit(i - RW);
        if (rz < RW - 1) visit(i + RW);
        if (y > 0) visit(i - plane);
        if (y < H - 1) visit(i + plane);
      }
    };
    flood(sky);

    // Block light from emitters.
    head = tail = 0;
    for (let i = 0, n = plane * H; i < n; i++) {
      const e = EMIT[ids[i]];
      if (e) { blk[i] = e; q[tail++] = i; }
    }
    flood(blk);

    // Save this chunk's own light for entity shading / spawning rules.
    if (!chunk.light || chunk.light.length < CHUNK_SIZE * CHUNK_SIZE * H) chunk.light = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    for (let y = 0; y < H; y++) for (let z = 0; z < CHUNK_SIZE; z++) for (let x = 0; x < CHUNK_SIZE; x++) {
      const i = (y * RW + z + MARGIN) * RW + x + MARGIN;
      chunk.light[(y * CHUNK_SIZE + z) * CHUNK_SIZE + x] = (sky[i] << 4) | blk[i];
    }
    chunk.lightH = H;
    return H;
  }

  buildMesh(chunk) {
    const H = this._computeRegion(chunk);
    const ids = R_IDS, sky = R_SKY, blk = R_BLK;
    const solid = { pos: [], uv: [], light: [], idx: [] };
    const trans = { pos: [], uv: [], light: [], idx: [] };
    const ox = chunk.cx * CHUNK_SIZE, oz = chunk.cz * CHUNK_SIZE;
    const uvc = this.uvCache;
    const skyTop = this.dim >= 1 ? 0 : 15;

    const R = (x, y, z) => (y * RW + z + MARGIN) * RW + x + MARGIN;
    const getId = (x, y, z) => (y < 0 || y >= H) ? B.AIR : ids[R(x, y, z)];
    const getSky = (x, y, z) => y >= H ? skyTop : y < 0 ? 0 : sky[R(x, y, z)];
    const getBlk = (x, y, z) => (y >= H || y < 0) ? 0 : blk[R(x, y, z)];

    // vertex: [x, y, z, u, v, sky(0..1), block(0..1), ao, code]; code = material + 16 * face
    const pushQuad = (out, verts, flip) => {
      const base = out.pos.length / 3;
      for (const v of verts) {
        out.pos.push(v[0], v[1], v[2]);
        out.uv.push(v[3], v[4]);
        out.light.push(v[5], v[6], v[7], v[8]);
      }
      if (flip) out.idx.push(base, base + 1, base + 3, base, base + 3, base + 2);
      else out.idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
    };

    // UV fraction of a point on a face (matches FACES' uv layout)
    const faceUV = (f, px, py, pz) => {
      switch (f) {
        case 0: return [pz, py];
        case 1: return [1 - pz, py];
        case 2: return [px, 1 - pz];
        case 3: return [1 - px, pz];
        case 4: return [1 - px, py];
        default: return [px, py];
      }
    };
    // An axis-aligned box inside block (x, y, z), local coords 0..1, lit by the block's own cell.
    const addBox = (out, x, y, z, b0, b1, tileOf, mat, skip, uvRot) => {
      const s = getSky(x, y, z) / 15, bl = getBlk(x, y, z) / 15;
      for (let f = 0; f < 6; f++) {
        if (skip && skip(f)) continue;
        const tile = tileOf(f);
        if (tile < 0) continue;
        const [u0, v0, u1, v1] = uvc[tile];
        const face = FACES[f];
        const verts = [];
        for (const c of face.corners) {
          const px = c[0] ? b1[0] : b0[0], py = c[1] ? b1[1] : b0[1], pz = c[2] ? b1[2] : b0[2];
          let [fu, fv] = faceUV(f, px, py, pz);
          if (uvRot && f === 3) {
            for (let r = 0; r < uvRot; r++) [fu, fv] = [1 - fv, fu];
          }
          verts.push([ox + x + px, y + py, oz + z + pz, u0 + (u1 - u0) * fu, v0 + (v1 - v0) * fv, s, bl, face.shade < 1 && f !== 3 ? 1 : 1, mat + 16 * f]);
        }
        pushQuad(out, verts, false);
      }
    };

    const tickables = [];
    for (let y = 0; y < Math.min(chunk.maxY, H); y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const id = ids[R(x, y, z)];
          if (id === B.AIR) continue;
          const block = BLOCKS[id];
          const wx = ox + x, wz = oz + z;
          const model = block.model;
          if ((id >= B.WHEAT0 && id < B.WHEAT0 + 7) || id === B.SAPLING) tickables.push([wx, y, wz]);

          if (model === 'cross') {
            const s = getSky(x, y, z) / 15, bl = getBlk(x, y, z) / 15;
            const [u0, v0, u1, v1] = uvc[block.tiles[0]];
            const a = 0.15, b = 0.85;
            const bottom = 1 + 16 * 6, top = 8 + 16 * 6; // foliage, top vertices sway
            for (const [[x0, z0], [x1, z1]] of [[[a, a], [b, b]], [[b, a], [a, b]]]) {
              const q1 = [
                [wx + x0, y, wz + z0, u0, v0, s, bl, 1, bottom], [wx + x1, y, wz + z1, u1, v0, s, bl, 1, bottom],
                [wx + x0, y + 1, wz + z0, u0, v1, s, bl, 1, top], [wx + x1, y + 1, wz + z1, u1, v1, s, bl, 1, top],
              ];
              pushQuad(solid, q1, false);
              pushQuad(solid, [q1[1], q1[0], q1[3], q1[2]], false);
            }
            continue;
          }
          if (model === 'torch') {
            const tile = block.tiles[0];
            addBox(solid, x, y, z, [7 / 16, 0, 7 / 16], [9 / 16, 10 / 16, 9 / 16], (f) => (f === 2 ? -1 : tile), 4);
            continue;
          }
          if (model === 'shape') {
            const d = this.blockData.get(World.bkey(wx, y, wz));
            const get = (dx, dy, dz) => getId(x + dx, y + dy, z + dz);
            const boxes = block.shape(get, d, id);
            const out = block.translucent ? trans : solid;
            const facing = d && d.facing ? d.facing : 0;
            const topOnly = block.redstone === 'wire';
            for (const bx of boxes) {
              addBox(out, x, y, z, [bx[0], bx[1], bx[2]], [bx[3], bx[4], bx[5]], (f) => faceTile(id, f, facing), block.mat, (f) => {
                if (topOnly) return f !== 3;
                switch (f) {
                  case 0: return bx[0] === 0 && OPAQUE[get(-1, 0, 0)];
                  case 1: return bx[3] === 1 && OPAQUE[get(1, 0, 0)];
                  case 2: return bx[1] === 0 && OPAQUE[get(0, -1, 0)];
                  case 3: return bx[4] === 1 && OPAQUE[get(0, 1, 0)];
                  case 4: return bx[2] === 0 && OPAQUE[get(0, 0, -1)];
                  default: return bx[5] === 1 && OPAQUE[get(0, 0, 1)];
                }
              });
            }
            continue;
          }
          if (model === 'pane') {
            const alongX = id === B.PORTAL_X;
            const b0 = alongX ? [0, 0, 6 / 16] : [6 / 16, 0, 0], b1 = alongX ? [1, 1, 10 / 16] : [10 / 16, 1, 1];
            addBox(trans, x, y, z, b0, b1, () => block.tiles[0], 12, (f) => {
              const d = FACES[f].dir;
              const n = getId(x + d[0], y + d[1], z + d[2]);
              return n === id || OPAQUE[n];
            });
            continue;
          }
          if (model === 'door') {
            const lowerY = id === B.DOOR_UPPER ? y - 1 : y;
            const d = this.blockData.get(World.bkey(wx, lowerY, wz)) || {};
            const box = doorBox(d.facing || 0, !!d.open);
            addBox(solid, x, y, z, box[0], box[1], (f) => (f === 2 || f === 3 ? T.PLANKS : block.tiles[0]), 0);
            continue;
          }
          if (model === 'bed') {
            const d = this.blockData.get(World.bkey(wx, y, wz)) || {};
            const facing = d.facing || 0;
            addBox(solid, x, y, z, [0, 0, 0], [1, 9 / 16, 1], (f) => faceTile(id, f), 0,
              (f) => f === 2 && OPAQUE[getId(x, y - 1, z)], [0, 1, 2, 3][facing]);
            continue;
          }

          // ---- cubes and fluids
          const fluid = FLUID[id];
          const isW = fluid === 1;
          const out = isW ? trans : solid;
          let facing = 0;
          if (block.facing) { const d = this.blockData.get(World.bkey(wx, y, wz)); if (d) facing = d.facing || 0; }
          let topH = block.height;
          if (fluid) topH = FLUID[getId(x, y + 1, z)] === fluid ? 1 : fluidHeight(id);
          const mat = block.mat;

          for (let f = 0; f < 6; f++) {
            const face = FACES[f];
            const dx = face.dir[0], dy = face.dir[1], dz = face.dir[2];
            const nid = getId(x + dx, y + dy, z + dz);
            if (fluid) {
              if (FLUID[nid] === fluid || OPAQUE[nid]) continue;
              if (dy === -1 && nid !== B.AIR) continue;
            } else {
              if (OPAQUE[nid] && !(dy === 1 && topH < 1)) continue;
              if (nid === id && (id === B.GLASS || id === B.LEAVES && false)) continue;
            }

            const [u0, v0, u1, v1] = uvc[faceTile(id, f, facing)];
            const nx = x + dx, ny = y + dy, nz = z + dz;
            const verts = [];
            const ao = [0, 0, 0, 0];
            const smooth = !fluid;

            for (let c = 0; c < 4; c++) {
              const corner = face.corners[c];
              const py = corner[1] ? topH : 0;
              let ls, lb, aoL = 1;
              if (smooth) {
                const sx = dx === 0 ? (corner[0] ? 1 : -1) : 0;
                const sy = dy === 0 ? (corner[1] ? 1 : -1) : 0;
                const sz = dz === 0 ? (corner[2] ? 1 : -1) : 0;
                let ax1, ay1, az1, ax2, ay2, az2;
                if (dx !== 0) { ax1 = nx; ay1 = ny + sy; az1 = nz; ax2 = nx; ay2 = ny; az2 = nz + sz; }
                else if (dy !== 0) { ax1 = nx + sx; ay1 = ny; az1 = nz; ax2 = nx; ay2 = ny; az2 = nz + sz; }
                else { ax1 = nx + sx; ay1 = ny; az1 = nz; ax2 = nx; ay2 = ny + sy; az2 = nz; }
                const ax3 = ax1 + ax2 - nx, ay3 = ay1 + ay2 - ny, az3 = az1 + az2 - nz;
                let s = getSky(nx, ny, nz), b = getBlk(nx, ny, nz), cnt = 1;
                const o1 = OPAQUE[getId(ax1, ay1, az1)], o2 = OPAQUE[getId(ax2, ay2, az2)];
                const o3 = OPAQUE[getId(ax3, ay3, az3)];
                if (!o1) { s += getSky(ax1, ay1, az1); b += getBlk(ax1, ay1, az1); cnt++; }
                if (!o2) { s += getSky(ax2, ay2, az2); b += getBlk(ax2, ay2, az2); cnt++; }
                if (!o3 && !(o1 && o2)) { s += getSky(ax3, ay3, az3); b += getBlk(ax3, ay3, az3); cnt++; }
                const level = (o1 && o2) ? 0 : 3 - (o1 + o2 + o3);
                ao[c] = level;
                aoL = AO_CURVE[level];
                ls = s / cnt; lb = b / cnt;
              } else {
                // fluids: light from the cell itself (or the one above for the top)
                const ly = dy === 1 ? y + 1 : y;
                ls = Math.max(getSky(x, ly, z), getSky(nx, ny, nz)); lb = Math.max(getBlk(x, y, z), getBlk(nx, ny, nz));
              }
              const vflag = corner[4] ? (dy === 0 ? topH : 1) : 0;
              verts.push([
                ox + x + corner[0], y + py, oz + z + corner[2],
                corner[3] ? u1 : u0, v0 + (v1 - v0) * vflag,
                ls / 15, lb / 15, aoL, mat + 16 * f,
              ]);
            }
            pushQuad(out, verts, ao[0] + ao[3] > ao[1] + ao[2]);
          }
        }
      }
    }

    chunk.tickables = tickables;
    chunk.solidMesh = this._replaceMesh(chunk.solidMesh, solid, 'solid');
    chunk.waterMesh = this._replaceMesh(chunk.waterMesh, trans, 'water');
    if (chunk.solidMesh) chunk.solidMesh.layers.enable(1); // shadow casters
    if (chunk.waterMesh) chunk.waterMesh.renderOrder = 1;
    chunk.dirty = false;
  }

  _replaceMesh(old, data, kind) {
    if (old) {
      this.scene.remove(old);
      old.geometry.dispose();
    }
    if (data.idx.length === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(data.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(data.uv, 2));
    geo.setAttribute('light', new THREE.Float32BufferAttribute(data.light, 4));
    const IndexArray = data.pos.length / 3 > 65535 ? Uint32Array : Uint16Array;
    geo.setIndex(new THREE.BufferAttribute(new IndexArray(data.idx), 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.materials[kind]);
    mesh.userData.kind = kind;
    if (kind === 'water') mesh.layers.set(2); // translucent pass
    mesh.matrixAutoUpdate = false;
    this.scene.add(mesh);
    return mesh;
  }

  unloadChunk(chunk) {
    for (const m of [chunk.solidMesh, chunk.waterMesh]) {
      if (m) { this.scene.remove(m); m.geometry.dispose(); }
    }
    this.chunks.delete(World.key(chunk.cx, chunk.cz));
  }

  dispose() {
    for (const chunk of [...this.chunks.values()]) this.unloadChunk(chunk);
  }

  // Generate / mesh / unload around the given centres, with a per-frame budget.
  update(centres, renderDistance, budgetMs = 8) {
    const start = performance.now();
    const cc = centres.map(([x, z]) => [Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)]);
    const [pcx, pcz] = cc[0];

    for (const chunk of this.chunks.values()) {
      let keep = false;
      for (const [ccx, ccz] of cc) {
        if (Math.abs(chunk.cx - ccx) <= renderDistance + 2 && Math.abs(chunk.cz - ccz) <= renderDistance + 2) { keep = true; break; }
      }
      if (!keep) this.unloadChunk(chunk);
    }

    const toGen = [], toMesh = [];
    const r = renderDistance + 1;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const d2 = dx * dx + dz * dz;
      if (d2 > r * r + 1) continue;
      const cx = pcx + dx, cz = pcz + dz;
      const chunk = this.getChunk(cx, cz);
      if (!chunk) toGen.push([d2, cx, cz]);
      else if (chunk.dirty && d2 <= renderDistance * renderDistance + 1 && this.hasAllNeighbours(cx, cz)) toMesh.push([d2, chunk]);
    }
    // Other players' / simulation centres: make sure their chunks exist for physics.
    for (let i = 1; i < cc.length; i++) {
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!this.getChunk(cc[i][0] + dx, cc[i][1] + dz)) toGen.push([1e6, cc[i][0] + dx, cc[i][1] + dz]);
      }
    }
    toMesh.sort((a, b) => a[0] - b[0]);
    toGen.sort((a, b) => a[0] - b[0]);

    for (const [, chunk] of toMesh) {
      this.buildMesh(chunk);
      if (performance.now() - start > budgetMs) return;
    }
    for (const [, cx, cz] of toGen) {
      if (this.getChunk(cx, cz)) continue;
      this.generateChunk(cx, cz);
      if (performance.now() - start > budgetMs) return;
    }
  }

  // Voxel ray traversal (Amanatides & Woo). Returns hit block + face normal.
  raycast(origin, dir, maxDist, hitFluids = false) {
    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    const stepX = Math.sign(dir.x), stepY = Math.sign(dir.y), stepZ = Math.sign(dir.z);
    const tDeltaX = stepX ? Math.abs(1 / dir.x) : Infinity;
    const tDeltaY = stepY ? Math.abs(1 / dir.y) : Infinity;
    const tDeltaZ = stepZ ? Math.abs(1 / dir.z) : Infinity;
    const frac = (v, s) => s > 0 ? Math.floor(v) + 1 - v : v - Math.floor(v);
    let tMaxX = stepX ? frac(origin.x, stepX) * tDeltaX : Infinity;
    let tMaxY = stepY ? frac(origin.y, stepY) * tDeltaY : Infinity;
    let tMaxZ = stepZ ? frac(origin.z, stepZ) * tDeltaZ : Infinity;
    let normal = [0, 0, 0];
    let t = 0;
    while (t <= maxDist) {
      const id = this.getBlock(x, y, z);
      if (id !== B.AIR && (hitFluids || id !== B.WATER)) {
        if (!BLOCKS[id].shape) return { x, y, z, id, normal, dist: t };
        // Shaped blocks (slabs, stairs, fences...) are hit only on their actual boxes
        const bx = x, by = y, bz = z;
        const get = (dx, dy, dz) => this.getBlock(bx + dx, by + dy, bz + dz);
        let best = null;
        for (const box of BLOCKS[id].shape(get, this.getData(x, y, z), id)) {
          const h = rayBoxNormal(origin, dir, x + box[0], y + box[1], z + box[2], x + box[3], y + box[4], z + box[5]);
          if (h && h.t <= maxDist && (!best || h.t < best.t)) best = h;
        }
        if (best) return { x, y, z, id, normal: best.normal, dist: best.t };
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX; t = tMaxX; tMaxX += tDeltaX; normal = [-stepX, 0, 0];
      } else if (tMaxY < tMaxZ) {
        y += stepY; t = tMaxY; tMaxY += tDeltaY; normal = [0, -stepY, 0];
      } else {
        z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; normal = [0, 0, -stepZ];
      }
    }
    return null;
  }

  // Highest block a player could stand on.
  surfaceY(x, z) {
    for (let y = WORLD_HEIGHT - 1; y > 0; y--) {
      const id = this.getBlock(x, y, z);
      if (isSolid(id) || id === B.WATER) return y;
    }
    return -1;
  }

  // Deterministic list of blocks an explosion destroys.
  explosionBlocks(cx, cy, cz, power) {
    const out = [];
    const r = Math.ceil(power);
    const bx = Math.floor(cx), by = Math.floor(cy), bz = Math.floor(cz);
    for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const x = bx + dx, y = by + dy, z = bz + dz;
      const id = this.getBlock(x, y, z);
      if (id === B.AIR || id === B.WATER) continue;
      const b = BLOCKS[id];
      if (b.hardness < 0 || b.hardness >= 20) continue;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const reach = power * (0.7 + 0.3 * hash3(x, y, z, 77)) - b.hardness * 0.3;
      if (d <= reach) out.push([x, y, z, id]);
    }
    return out;
  }

  // ---- persistence ----
  serializeEdits() {
    const out = {};
    for (const [k, m] of this.edits) {
      if (m.size === 0) continue;
      const arr = [];
      for (const [idx, id] of m) arr.push(idx, id);
      out[k] = arr;
    }
    return out;
  }
  loadEdits(obj) {
    for (const k of Object.keys(obj || {})) {
      const arr = obj[k];
      const m = new Map();
      for (let i = 0; i < arr.length; i += 2) m.set(arr[i], arr[i + 1]);
      this.edits.set(k, m);
    }
  }
  // Flat list of [x, y, z, id] for every edit (used to sync multiplayer).
  editList() {
    const out = [];
    for (const [k, m] of this.edits) {
      const [cx, cz] = k.split(',').map(Number);
      for (const [idx, id] of m) {
        const x = idx % CHUNK_SIZE, z = Math.floor(idx / CHUNK_SIZE) % CHUNK_SIZE, y = Math.floor(idx / (CHUNK_SIZE * CHUNK_SIZE));
        out.push([cx * CHUNK_SIZE + x, y, cz * CHUNK_SIZE + z, id]);
      }
    }
    return out;
  }
  // Apply an edit that may be in an unloaded chunk.
  applyRemoteEdit(x, y, z, id) {
    if (this.isLoaded(x, z)) { this.setBlock(x, y, z, id); return; }
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    const k = World.key(cx, cz);
    if (!this.edits.has(k)) this.edits.set(k, new Map());
    this.edits.get(k).set(Chunk.index(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE), id);
  }
  serializeData() {
    const out = {};
    for (const [k, v] of this.blockData) out[k] = v;
    return out;
  }
  loadData(obj) {
    for (const k of Object.keys(obj || {})) this.blockData.set(k, obj[k]);
  }
}

// Ray vs axis-aligned box: entry distance and the face normal it enters through.
function rayBoxNormal(o, d, x0, y0, z0, x1, y1, z1) {
  let tmin = -Infinity, tmax = Infinity, normal = [0, 0, 0];
  const lo = [x0, y0, z0], hi = [x1, y1, z1], O = [o.x, o.y, o.z], D = [d.x, d.y, d.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(D[i]) < 1e-9) { if (O[i] < lo[i] || O[i] > hi[i]) return null; continue; }
    let t0 = (lo[i] - O[i]) / D[i], t1 = (hi[i] - O[i]) / D[i];
    let n = -1;
    if (t0 > t1) { const tt = t0; t0 = t1; t1 = tt; n = 1; }
    if (t0 > tmin) { tmin = t0; normal = [0, 0, 0]; normal[i] = n; }
    tmax = Math.min(tmax, t1);
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return { t: Math.max(0, tmin), normal };
}
