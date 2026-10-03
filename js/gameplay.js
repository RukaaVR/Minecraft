// Gameplay systems added to Game: dimensions and portals, flowing fluids, farming,
// doors, beds and sleeping, bows, buckets, armor, villagers and trading.
'use strict';

const PROJ_KINDS = ['arrow', 'fireball', 'smallfire', 'pearl', 'eye'];

Object.assign(Game.prototype, {
  // ---------------------------------------------------------------- dimensions
  worldFor(dim) {
    if (!this.worlds[dim]) this.worlds[dim] = new World(this.scene, this.worldSeed, this.materials, dim);
    return this.worlds[dim];
  },

  // Move the local player to the other dimension through a portal.
  travelDimension() {
    const p = this.player;
    const from = this.world.dim, to = from === 0 ? 1 : 0;
    const scale = to === 1 ? 1 / 8 : 8;
    const tx = Math.floor(p.pos.x * scale), tz = Math.floor(p.pos.z * scale);
    this._switchWorld(to);
    const w = this.world;
    // Generate the area around the destination right away
    const ccx = Math.floor(tx / CHUNK_SIZE), ccz = Math.floor(tz / CHUNK_SIZE);
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (!w.getChunk(ccx + dx, ccz + dz)) w.generateChunk(ccx + dx, ccz + dz);
    // Look for an existing portal nearby
    let found = null;
    for (let r = 0; r <= 24 && !found; r++) {
      for (let dz = -r; dz <= r && !found; dz++) for (let dx = -r; dx <= r && !found; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        for (let y = 1; y < WORLD_HEIGHT - 1; y++) {
          const id = w.getBlock(tx + dx, y, tz + dz);
          if ((id === B.PORTAL_X || id === B.PORTAL_Z) && w.getBlock(tx + dx, y - 1, tz + dz) === B.OBSIDIAN) { found = [tx + dx, y, tz + dz, id]; break; }
        }
      }
    }
    if (!found) found = this.buildPortalAt(tx, tz);
    const [x, y, z, id] = found;
    p.pos.set(x + (id === B.PORTAL_X ? 1.0 : 0.5), y, z + (id === B.PORTAL_Z ? 1.0 : 0.5));
    p.vel.set(0, 0, 0);
    p.fallStart = null;
    p.portalCooldown = 4;
    p.portalTime = 0;
    p.portalLock = true; // must step out of the portal before it works again
    this.spawnPending = false;
    this.chat.system(to === 1 ? 'Entered the Nether' : 'Returned to the Overworld', '#c8f');
    this.save();
  },

  _switchWorld(dim) {
    const keep = this.remotePlayers;
    this.remotePlayers = new Map();
    this._resetEntities();
    this.remotePlayers = keep;
    if (this.world) this.world.dispose();
    this.world = this.worldFor(dim);
    this.player.world = this.world;
    this.fluidQueue.clear();
  },

  // Build a 4x5 obsidian portal (with a small platform) near x, z. Returns [x, y, z, id].
  buildPortalAt(x, z) {
    const w = this.world;
    let y = -1;
    const fits = (yy) => {
      for (let dx = 0; dx < 4; dx++) {
        if (!isSolid(w.getBlock(x + dx, yy - 1, z))) return false;
        for (let dy = 0; dy < 4; dy++) if (w.getBlock(x + dx, yy + dy, z) !== B.AIR) return false;
      }
      return true;
    };
    const lo = w.dim === 1 ? 33 : SEA_LEVEL + 1, hi = w.dim === 1 ? 110 : 120;
    for (let yy = w.dim === 1 ? 70 : w.surfaceY(x, z) + 1; yy >= lo && y < 0; yy--) if (fits(yy)) y = yy;
    for (let yy = 70; yy <= hi && y < 0; yy++) if (fits(yy)) y = yy;
    if (y < 0) y = w.dim === 1 ? 64 : Math.max(w.surfaceY(x, z) + 1, SEA_LEVEL + 2);
    const set = (bx, by, bz, id) => this.changeBlock(bx, by, bz, id, { noUpdate: true, batch: true });
    // platform + clearing
    for (let dx = -1; dx <= 4; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!isSolid(w.getBlock(x + dx, y - 1, z + dz))) set(x + dx, y - 1, z + dz, B.OBSIDIAN);
      for (let dy = 0; dy < 4; dy++) set(x + dx, y + dy, z + dz, B.AIR);
    }
    for (let dx = 0; dx < 4; dx++) for (let dy = -1; dy < 4; dy++) {
      const frame = dx === 0 || dx === 3 || dy === -1 || dy === 3;
      set(x + dx, y + dy, z, frame ? B.OBSIDIAN : B.PORTAL_X);
    }
    this.flushBlocks();
    return [x + 1, y, z, B.PORTAL_X];
  },

  // Light a portal inside an obsidian frame that contains (x, y, z).
  tryLightPortal(x, y, z) {
    const w = this.world;
    for (const axis of ['x', 'z']) {
      const ax = axis === 'x' ? 1 : 0, az = axis === 'z' ? 1 : 0;
      if (w.getBlock(x, y, z) !== B.AIR) return false;
      let by = y;
      while (by > y - 22 && w.getBlock(x, by - 1, z) === B.AIR) by--;
      if (w.getBlock(x, by - 1, z) !== B.OBSIDIAN) continue;
      let l = 0; while (l < 22 && w.getBlock(x - ax * (l + 1), by, z - az * (l + 1)) === B.AIR) l++;
      let r = 0; while (r < 22 && w.getBlock(x + ax * (r + 1), by, z + az * (r + 1)) === B.AIR) r++;
      const x0 = x - ax * l, z0 = z - az * l, width = l + r + 1;
      if (width < 2 || width > 21) continue;
      let h = 0; while (h < 22 && w.getBlock(x0, by + h, z0) === B.AIR) h++;
      if (h < 3 || h > 21) continue;
      let ok = true;
      for (let i = 0; i < width && ok; i++) {
        const cx = x0 + ax * i, cz = z0 + az * i;
        if (w.getBlock(cx, by - 1, cz) !== B.OBSIDIAN || w.getBlock(cx, by + h, cz) !== B.OBSIDIAN) ok = false;
        for (let j = 0; j < h && ok; j++) if (w.getBlock(cx, by + j, cz) !== B.AIR) ok = false;
      }
      for (let j = 0; j < h && ok; j++) {
        if (w.getBlock(x0 - ax, by + j, z0 - az) !== B.OBSIDIAN || w.getBlock(x0 + ax * width, by + j, z0 + az * width) !== B.OBSIDIAN) ok = false;
      }
      if (!ok) continue;
      const id = axis === 'x' ? B.PORTAL_X : B.PORTAL_Z;
      for (let i = 0; i < width; i++) for (let j = 0; j < h; j++) this.changeBlock(x0 + ax * i, by + j, z0 + az * i, id, { noUpdate: true, batch: true });
      this.flushBlocks();
      Sound.tone(220, 1.2, 0.2, 'sine', 200);
      return true;
    }
    return false;
  },

  // A portal block lost its frame: remove the whole connected portal.
  breakPortal(x, y, z) {
    const w = this.world;
    const start = w.getBlock(x, y, z);
    if (start !== B.PORTAL_X && start !== B.PORTAL_Z) return;
    const seen = new Set(), stack = [[x, y, z]];
    while (stack.length && seen.size < 500) {
      const [cx, cy, cz] = stack.pop();
      const k = cx + ',' + cy + ',' + cz;
      if (seen.has(k) || w.getBlock(cx, cy, cz) !== start) continue;
      seen.add(k);
      this.changeBlock(cx, cy, cz, B.AIR, { noUpdate: true, batch: true });
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) stack.push([cx + dx, cy + dy, cz + dz]);
    }
    this.flushBlocks();
  },

  updatePortal(dt) {
    const p = this.player;
    if (!p.inPortal) p.portalLock = false;
    if (!p.inPortal || p.portalLock || p.portalCooldown > 0 || p.dead) { p.portalTime = 0; return; }
    p.portalTime += dt;
    this.portalOverlay = Math.min(1, p.portalTime / 4);
    const need = p.mode === 'creative' || p.mode === 'spectator' ? 0.5 : 4;
    if (p.portalTime >= need) this.travelDimension();
  },

  // ---------------------------------------------------------------- batching
  flushBlocks() {
    if (this.pendingBlocks.length) {
      this.net.sendBlocks(this.pendingBlocks.map((b) => [b[0], b[1], b[2], b[3], this.world.dim]));
      this.pendingBlocks = [];
    }
  },

  // ---------------------------------------------------------------- fluids
  fluidId(kind, level) {
    if (kind === 1) return level === 0 ? B.WATER : level >= 8 ? B.WATER_FALL : B.WATER1 + level - 1;
    return level === 0 ? B.LAVA : level >= 8 ? B.LAVA_FALL : B.LAVA1 + level - 1;
  },

  fluidDelay(kind) { return kind === 1 ? 0.25 : this.world.dim === 1 ? 0.5 : 1.5; },

  scheduleFluid(x, y, z) {
    const id = this.world.getBlock(x, y, z);
    if (!FLUID[id]) return;
    const k = x + ',' + y + ',' + z;
    const t = this.simTime + this.fluidDelay(FLUID[id]);
    const cur = this.fluidQueue.get(k);
    if (!cur || cur.t > t) this.fluidQueue.set(k, { x, y, z, t });
  },

  scheduleAround(x, y, z) {
    if (!this.isAuthority) return;
    this.scheduleFluid(x, y, z);
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) this.scheduleFluid(x + dx, y + dy, z + dz);
  },

  tickFluids() {
    if (!this.isAuthority || !this.fluidQueue.size) return;
    let budget = 400;
    const due = [];
    for (const [k, e] of this.fluidQueue) {
      if (e.t <= this.simTime) { due.push(e); this.fluidQueue.delete(k); if (--budget <= 0) break; }
    }
    for (const e of due) this.fluidUpdate(e.x, e.y, e.z);
    this.flushBlocks();
  },

  canFlowInto(id) {
    return id === B.AIR || (BLOCKS[id].replaceable && !FLUID[id]) || (BLOCKS[id].needsSupport && !BLOCKS[id].solid && BLOCKS[id].model === 'cross');
  },

  fluidUpdate(x, y, z) {
    const w = this.world;
    if (!w.isLoaded(x, z)) return;
    const id = w.getBlock(x, y, z);
    const kind = FLUID[id];
    if (!kind) return;
    const lvl = BLOCKS[id].flevel;
    const source = lvl === 0;
    const step = kind === 1 ? 1 : (w.dim === 1 ? 1 : 2);
    const set = (bx, by, bz, nid) => { this.changeBlock(bx, by, bz, nid, { noUpdate: true, batch: true }); this.scheduleAround(bx, by, bz); };
    const H4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    // Lava meeting water hardens
    if (kind === 2) {
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) {
        if (isWater(w.getBlock(x + dx, y + dy, z + dz))) {
          set(x, y, z, source ? B.OBSIDIAN : B.COBBLE);
          Sound.noise(3000, 1, 0.4, 0.3);
          return;
        }
      }
    }
    if (!source) {
      let newLvl;
      const above = w.getBlock(x, y + 1, z);
      if (FLUID[above] === kind) newLvl = 8;
      else {
        let best = 99, sources = 0;
        for (const [dx, dz] of H4) {
          const nb = w.getBlock(x + dx, y, z + dz);
          if (FLUID[nb] !== kind) continue;
          const l = BLOCKS[nb].flevel;
          if (l === 0) sources++;
          best = Math.min(best, l === 8 ? 0 : l);
        }
        const below = w.getBlock(x, y - 1, z);
        if (kind === 1 && sources >= 2 && (isSolid(below) || below === B.WATER)) newLvl = 0;
        else newLvl = best + step;
        if (newLvl > 7) newLvl = -1;
      }
      if (newLvl !== lvl) {
        set(x, y, z, newLvl < 0 ? B.AIR : this.fluidId(kind, newLvl));
        return;
      }
    }
    // Spread down, then sideways
    const below = y > 0 ? w.getBlock(x, y - 1, z) : B.BEDROCK;
    if (this.canFlowInto(below) || (FLUID[below] === kind && BLOCKS[below].flevel !== 0 && BLOCKS[below].flevel !== 8)) {
      set(x, y - 1, z, this.fluidId(kind, 8));
      if (!source) return;
    } else if (kind === 2 && isWater(below)) {
      set(x, y - 1, z, B.STONE);
      return;
    }
    const next = (lvl === 8 ? 0 : lvl) + step;
    if (next > 7) return;
    for (const [dx, dz] of H4) {
      const nb = w.getBlock(x + dx, y, z + dz);
      if (this.canFlowInto(nb)) {
        if (BLOCKS[nb].needsSupport && nb !== B.AIR && this.player.mode === 'survival') this.dropBlockItems(x + dx, y, z + dz, nb, true);
        set(x + dx, y, z + dz, this.fluidId(kind, next));
      } else if (FLUID[nb] === kind) {
        const l = BLOCKS[nb].flevel;
        if (l !== 0 && l !== 8 && l > next) set(x + dx, y, z + dz, this.fluidId(kind, next));
      }
    }
  },

  // ---------------------------------------------------------------- growth (crops, saplings)
  tickGrowth(dt) {
    if (!this.isAuthority) return;
    this.growthTimer = (this.growthTimer || 0) + dt;
    if (this.growthTimer < 1) return;
    this.growthTimer = 0;
    const w = this.world, p = this.player;
    const pcx = Math.floor(p.pos.x / CHUNK_SIZE), pcz = Math.floor(p.pos.z / CHUNK_SIZE);
    for (const ch of w.chunks.values()) {
      if (!ch.tickables || Math.abs(ch.cx - pcx) > 5 || Math.abs(ch.cz - pcz) > 5) continue;
      for (const [x, y, z] of ch.tickables) {
        const id = w.getBlock(x, y, z);
        if (id >= B.WHEAT0 && id < B.WHEAT0 + 7) {
          const l = w.getLight(x, y, z);
          if (Math.max(l.sky * (this.daylight > 0.5 ? 1 : 0.4), l.block) >= 9 && Math.random() < 1 / 40) this.changeBlock(x, y, z, id + 1, { noUpdate: true, batch: true });
        } else if (id === B.SAPLING && Math.random() < 1 / 150) {
          this.growTree(x, y, z);
        }
      }
    }
    this.flushBlocks();
  },

  growTree(x, y, z) {
    const w = this.world;
    const trunk = 4 + Math.floor(Math.random() * 3);
    for (let dy = 1; dy <= trunk + 1; dy++) if (!BLOCKS[w.getBlock(x, y + dy, z)].replaceable && w.getBlock(x, y + dy, z) !== B.LEAVES) return false;
    const set = (bx, by, bz, id) => {
      const cur = w.getBlock(bx, by, bz);
      if (id === B.LEAVES && cur !== B.AIR && !BLOCKS[cur].replaceable) return;
      this.changeBlock(bx, by, bz, id, { noUpdate: true, batch: true });
    };
    const top = y + trunk - 1;
    for (let ly = top - 2; ly <= top + 1; ly++) {
      const rad = ly >= top ? 1 : 2;
      for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
        if (rad === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2 && Math.random() < 0.6) continue;
        if (ly === top + 1 && Math.abs(dx) === 1 && Math.abs(dz) === 1) continue;
        set(x + dx, ly, z + dz, B.LEAVES);
      }
    }
    for (let dy = 0; dy < trunk; dy++) this.changeBlock(x, y + dy, z, B.LOG, { noUpdate: true, batch: true });
    if (w.getBlock(x, y - 1, z) === B.GRASS) this.changeBlock(x, y - 1, z, B.DIRT, { noUpdate: true, batch: true });
    this.flushBlocks();
    return true;
  },

  boneMeal(hit) {
    const w = this.world, id = hit.id;
    if (id >= B.WHEAT0 && id < B.WHEAT0 + 7) {
      this.changeBlock(hit.x, hit.y, hit.z, Math.min(B.WHEAT0 + 7, id + 2 + Math.floor(Math.random() * 3)));
      return true;
    }
    if (id === B.SAPLING) { if (Math.random() < 0.45) this.growTree(hit.x, hit.y, hit.z); return true; }
    if (id === B.GRASS) {
      for (let i = 0; i < 12; i++) {
        const x = hit.x + Math.floor(Math.random() * 7) - 3, z = hit.z + Math.floor(Math.random() * 7) - 3;
        if (w.getBlock(x, hit.y, z) === B.GRASS && w.getBlock(x, hit.y + 1, z) === B.AIR) {
          const r = Math.random();
          this.changeBlock(x, hit.y + 1, z, r < 0.8 ? B.TALL_GRASS : r < 0.9 ? B.DANDELION : B.POPPY, { noUpdate: true, batch: true });
        }
      }
      this.flushBlocks();
      return true;
    }
    return false;
  },

  // ---------------------------------------------------------------- doors & beds
  toggleDoor(x, y, z, id) {
    const ly = id === B.DOOR_UPPER ? y - 1 : y;
    const d = Object.assign({ facing: 0, open: false }, this.world.getData(x, ly, z) || {});
    d.open = !d.open;
    this.world.setData(x, ly, z, d);
    const c = this.world.getChunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
    if (c) c.dirty = true;
    this.net.send('bdata', { x, y: ly, z, d, w: this.world.dim });
    Sound.door(d.open, { x: x + 0.5, y: y + 0.5, z: z + 0.5 });
  },

  // Remove the other half of a door or bed
  removePartner(x, y, z, old) {
    const w = this.world;
    if (old === B.DOOR_LOWER && w.getBlock(x, y + 1, z) === B.DOOR_UPPER) this.changeBlock(x, y + 1, z, B.AIR, { noUpdate: true });
    if (old === B.DOOR_UPPER && w.getBlock(x, y - 1, z) === B.DOOR_LOWER) this.changeBlock(x, y - 1, z, B.AIR, { noUpdate: true });
    if (old === B.BED_FOOT || old === B.BED_HEAD) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nb = w.getBlock(x + dx, y, z + dz);
        if ((old === B.BED_FOOT && nb === B.BED_HEAD) || (old === B.BED_HEAD && nb === B.BED_FOOT)) { this.changeBlock(x + dx, y, z + dz, B.AIR, { noUpdate: true }); break; }
      }
    }
    if (old === B.OBSIDIAN || old === B.PORTAL_X || old === B.PORTAL_Z) {
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const nb = w.getBlock(x + dx, y + dy, z + dz);
        if (nb === B.PORTAL_X || nb === B.PORTAL_Z) this.breakPortal(x + dx, y + dy, z + dz);
      }
    }
  },

  useBed(hit) {
    const p = this.player;
    if (this.world.dim === 1) {
      this.changeBlock(hit.x, hit.y, hit.z, B.AIR);
      this.explode(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, 5, true);
      return;
    }
    p.spawn = { x: hit.x + 0.5, y: hit.y + 1, z: hit.z + 0.5 };
    if (this.daylight > 0.45) { this.chat.system('Respawn point set. You can only sleep at night.'); return; }
    for (const m of this.mobs.values()) {
      if (m.info.hostile && m.pos.distanceTo(p.pos) < 8) { this.chat.system('You may not rest now; there are monsters nearby', '#f88'); return; }
    }
    if (this.net.active && this.remotePlayers.size) { this.chat.system('Respawn point set. Skipping the night needs everyone asleep, which multiplayer does not support yet.'); return; }
    p.sleeping = true;
    this.ui.sleep(() => {
      this.timeOfDay = 0.26;
      this.dayCount = (this.dayCount || 0) + 1;
      p.sleeping = false;
      this.chat.system('Respawn point set');
    });
  },

  // ---------------------------------------------------------------- villagers
  updateVillages(dt) {
    if (!this.isAuthority || this.world.dim !== 0) return;
    this.villageTimer = (this.villageTimer || 0) - dt;
    if (this.villageTimer > 0) return;
    this.villageTimer = 3;
    const p = this.player;
    for (const v of Villages.near(this.world, p.pos.x, p.pos.z, 100)) {
      if (this.villagePopulated.has(v.id)) {
        // repopulate if they were unloaded
        let alive = false;
        for (const m of this.mobs.values()) if (m.villageId === v.id) { alive = true; break; }
        if (alive || !this._chunkReady(v.center[0], v.center[2])) continue;
      }
      if (!this._chunkReady(v.center[0], v.center[2])) continue;
      let ok = true;
      for (const [x, , z] of v.villagers) if (!this._chunkReady(x, z)) ok = false;
      if (!ok) continue;
      this.villagePopulated.add(v.id);
      const spots = v.villagers.concat([[v.center[0] + 2.5, v.center[1], v.center[2] + 2.5], [v.center[0] - 1.5, v.center[1], v.center[2] + 3.5]]);
      for (const [x, , z] of spots) {
        const y = this.world.surfaceY(Math.floor(x), Math.floor(z)) + 1;
        const m = this.spawnMob('villager', x, y, z, { home: v.center });
        m.villageId = v.id;
      }
      // Every village has an iron golem guarding it
      const gx = v.center[0] - 3.5, gz = v.center[2] - 2.5;
      const golem = this.spawnMob('golem', gx, this.world.surfaceY(Math.floor(gx), Math.floor(gz)) + 1, gz, { home: v.center });
      golem.villageId = v.id;
    }
  },

  _chunkReady(x, z) {
    const c = this.world.getChunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
    return !!(c && !c.dirty);
  },

  tradeOffers(mob) { return TRADES[mob.profession] || TRADES.farmer; },

  doTrade(offer) {
    const inv = this.player.inventory;
    const [c1, c2, res] = offer;
    const have = (id, n) => inv.count(id) >= n;
    if (!have(c1[0], c1[1]) || (c2 && !have(c2[0], c2[1]))) return false;
    const take = (id, n) => {
      for (let i = 0; i < inv.slots.length && n > 0; i++) {
        const s = inv.slots[i];
        if (s && s.id === id) { const k = Math.min(n, s.count); s.count -= k; n -= k; if (s.count <= 0) inv.slots[i] = null; }
      }
    };
    take(c1[0], c1[1]);
    if (c2) take(c2[0], c2[1]);
    const left = inv.add(stackOf(res[0], res[1]), PICKUP_ORDER);
    if (left) this.spawnItem(stackOf(res[0], left), this.player.pos.x, this.player.pos.y + 1, this.player.pos.z);
    inv.changed();
    Sound.tone(700, 0.15, 0.2, 'triangle', 300);
    return true;
  },

  // ---------------------------------------------------------------- bow
  updateBow(dt, holding) {
    const p = this.player;
    const held = p.heldStack;
    const isBow = held && held.id === ITEM.BOW;
    if (!isBow) { this.bowCharge = 0; return; }
    const hasArrow = p.mode === 'creative' || p.inventory.count(ITEM.ARROW) > 0;
    if (holding && hasArrow) { this.bowCharge = Math.min(1, (this.bowCharge || 0) + dt); return; }
    if (!holding && this.bowCharge > 0.1) {
      const c = this.bowCharge;
      const f = Math.min(1, (c * c + c * 2) / 3);
      const dir = p.lookDir();
      const eye = p.eye;
      const power = enchLevel(held, 'power');
      const dmg = Math.max(1, Math.round(9 * f * (power ? 1 + 0.25 * (power + 1) : 1)));
      this.spawnProjectile('arrow', eye.clone().addScaledVector(dir, 0.4), dir.multiplyScalar(55 * f), { owner: 'player', damage: dmg });
      Sound.bow();
      if (p.mode !== 'creative') {
        if (!enchLevel(held, 'infinity')) for (let i = 0; i < p.inventory.slots.length; i++) {
          const s = p.inventory.slots[i];
          if (s && s.id === ITEM.ARROW) { p.inventory.removeFrom(i, 1); break; }
        }
        this.damageHeld(1);
      }
      this.doSwing();
    }
    this.bowCharge = 0;
  },

  spawnProjectile(kind, pos, vel, opts) {
    this.projectiles.push(new Projectile(this, kind, pos, vel, opts));
  },

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      if (!pr.update(dt)) { pr.dispose(); this.projectiles.splice(i, 1); }
    }
  },

  // Projectiles for remote viewers (host shares the ones its mobs fire)
  serializeProjectiles() {
    return this.projectiles.filter((p) => !p.remote && !p.stuck).slice(0, 12).map((p) => [PROJ_KINDS.indexOf(p.kind), Math.round(p.pos.x * 10), Math.round(p.pos.y * 10), Math.round(p.pos.z * 10), Math.round(p.vel.x * 10), Math.round(p.vel.y * 10), Math.round(p.vel.z * 10)]);
  },
  applyProjectileState(list) {
    for (const p of this.projectiles.filter((q) => q.remote)) { p.dispose(); }
    this.projectiles = this.projectiles.filter((q) => !q.remote);
    if (!Array.isArray(list)) return;
    for (const a of list) {
      if (!Array.isArray(a) || a.length < 7) continue;
      this.projectiles.push(new Projectile(this, PROJ_KINDS[a[0]] || 'arrow', new THREE.Vector3(a[1] / 10, a[2] / 10, a[3] / 10), new THREE.Vector3(a[4] / 10, a[5] / 10, a[6] / 10), { remote: true }));
    }
  },

  // Right-click actions that are not plain block placement. Returns true if handled.
  useSpecial(hit, held, item) {
    const p = this.player;
    const w = this.world;
    const survival = p.mode === 'survival' || p.mode === 'adventure';
    const consume = () => { if (p.mode !== 'creative') p.inventory.removeFrom(p.selected, 1); };
    const replaceHeld = (id) => {
      if (p.mode === 'creative') return;
      if (held.count > 1) { held.count--; const left = p.inventory.add(stackOf(id, 1), PICKUP_ORDER); if (left) this.spawnItem(stackOf(id, 1), p.pos.x, p.pos.y + 1, p.pos.z); }
      else p.inventory.slots[p.selected] = stackOf(id, 1);
      p.inventory.changed();
    };
    // Armor: equip
    if (item && item.armor) {
      const slot = item.armor.slot;
      const old = p.armor.slots[slot];
      p.armor.slots[slot] = stackOf(held.id, 1, held.dmg, held.ench);
      p.inventory.slots[p.selected] = old;
      p.inventory.changed(); p.armor.changed();
      Sound.noise(700, 1, 0.2, 0.3);
      return true;
    }
    // Buckets
    if (item && held.id === ITEM.BUCKET) {
      const fh = w.raycast(p.eye, p.lookDir(), 5, true);
      if (fh && FLUID[fh.id] && BLOCKS[fh.id].flevel === 0) {
        this.changeBlock(fh.x, fh.y, fh.z, B.AIR);
        this.scheduleAround(fh.x, fh.y, fh.z);
        replaceHeld(isWater(fh.id) ? ITEM.WATER_BUCKET : ITEM.LAVA_BUCKET);
        Sound.splash();
        return true;
      }
      return false;
    }
    if (item && (held.id === ITEM.WATER_BUCKET || held.id === ITEM.LAVA_BUCKET) && hit) {
      if (p.mode === 'adventure') return true;
      let tx = hit.x + hit.normal[0], ty = hit.y + hit.normal[1], tz = hit.z + hit.normal[2];
      if (BLOCKS[hit.id].replaceable && !FLUID[hit.id]) { tx = hit.x; ty = hit.y; tz = hit.z; }
      const cur = w.getBlock(tx, ty, tz);
      if (!this.canFlowInto(cur) && !(FLUID[cur] && BLOCKS[cur].flevel !== 0)) return true;
      if (held.id === ITEM.WATER_BUCKET && w.dim === 1) {
        Sound.noise(3000, 1, 0.5, 0.4);
        this.particles.smoke(tx + 0.5, ty + 0.5, tz + 0.5, 8);
      } else {
        this.changeBlock(tx, ty, tz, held.id === ITEM.WATER_BUCKET ? B.WATER : B.LAVA);
        this.scheduleAround(tx, ty, tz);
        Sound.splash();
      }
      if (p.mode !== 'creative') { p.inventory.slots[p.selected] = stackOf(ITEM.BUCKET, 1); p.inventory.changed(); }
      this.doSwing();
      return true;
    }
    if (!hit) return false;
    // Hoe: till grass/dirt
    if (item && item.tool && item.tool.type === 'hoe' && (hit.id === B.GRASS || hit.id === B.DIRT || hit.id === B.PATH) && hit.normal[1] === 1 && w.getBlock(hit.x, hit.y + 1, hit.z) === B.AIR) {
      if (p.mode === 'adventure') return true;
      this.changeBlock(hit.x, hit.y, hit.z, B.FARMLAND);
      Sound.dig('gravel');
      this.doSwing();
      if (p.mode !== 'creative') this.damageHeld(1);
      return true;
    }
    // Seeds on farmland
    if (item && held.id === ITEM.SEEDS) {
      if (hit.id === B.FARMLAND && hit.normal[1] === 1 && w.getBlock(hit.x, hit.y + 1, hit.z) === B.AIR && p.mode !== 'adventure') {
        this.changeBlock(hit.x, hit.y + 1, hit.z, B.WHEAT0);
        Sound.place('grass');
        consume();
        this.doSwing();
      }
      return true;
    }
    if (item && held.id === ITEM.BONE_MEAL) {
      if (this.isAuthority ? this.boneMeal(hit) : false) { consume(); this.particles.burst(hit.x, hit.y, hit.z, B.TALL_GRASS, 6); this.doSwing(); }
      else if (!this.isAuthority) this.chat.system('Only the host can use bone meal in multiplayer.', '#f88');
      return true;
    }
    // Flint and steel: portal or TNT
    if (item && held.id === ITEM.FLINT_STEEL) {
      const tx = hit.x + hit.normal[0], ty = hit.y + hit.normal[1], tz = hit.z + hit.normal[2];
      if (hit.id === B.OBSIDIAN && this.tryLightPortal(tx, ty, tz)) {
        if (p.mode !== 'creative') this.damageHeld(1);
        this.doSwing();
        return true;
      }
      return false;
    }
    // Doors and beds as items
    if (item && (held.id === ITEM.DOOR || held.id === ITEM.BED) && p.mode !== 'adventure') {
      if (hit.normal[1] !== 1 || !isSolid(hit.id)) return true;
      const x = hit.x, y = hit.y + 1, z = hit.z;
      const facing = this._facingToward(p, x, z);
      if (held.id === ITEM.DOOR) {
        if (w.getBlock(x, y, z) !== B.AIR || w.getBlock(x, y + 1, z) !== B.AIR || p.intersectsBlock(x, y, z) || p.intersectsBlock(x, y + 1, z)) return true;
        this.changeBlock(x, y, z, B.DOOR_LOWER, { noUpdate: true });
        this.changeBlock(x, y + 1, z, B.DOOR_UPPER, { noUpdate: true });
        const d = { facing: (facing + 2) % 4, open: false };
        w.setData(x, y, z, d);
        this.net.send('bdata', { x, y, z, d, w: w.dim });
      } else {
        // head goes one block away from the player
        const dir = [[0, 1], [-1, 0], [0, -1], [1, 0]][(facing + 2) % 4];
        const hx = x + dir[0], hz = z + dir[1];
        if (w.getBlock(x, y, z) !== B.AIR || w.getBlock(hx, y, hz) !== B.AIR || !isSolid(w.getBlock(hx, y - 1, hz))) return true;
        this.changeBlock(x, y, z, B.BED_FOOT, { noUpdate: true });
        this.changeBlock(hx, y, hz, B.BED_HEAD, { noUpdate: true });
        const d = { facing: (facing + 2) % 4 };
        w.setData(x, y, z, d); w.setData(hx, y, hz, Object.assign({}, d));
        this.net.send('bdata', { x, y, z, d, w: w.dim });
        this.net.send('bdata', { x: hx, y, z: hz, d, w: w.dim });
      }
      Sound.place('wood');
      consume();
      this.doSwing();
      return true;
    }
    if (item && held.id === ITEM.SEEDS) return true;
    return false;
  },
});
