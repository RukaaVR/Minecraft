// More gameplay on Game: shaped block placement (slabs, stairs, ladders, levers...),
// redstone hooks, ender pearls, eyes of ender and the stronghold portal, the End and
// the Ender Dragon, boats, experience, wolves, shears, spawners and mob spawning extras.
'use strict';

const FACE_OF_NORMAL = (n) => (n[0] === 1 ? 0 : n[0] === -1 ? 1 : n[1] === 1 ? 2 : n[1] === -1 ? 3 : n[2] === 1 ? 4 : 5);
const END_SPAWN = [100, 48, 0];

// Wrap a Game method so new behaviour runs around the original.
function wrapGame(name, fn) {
  const orig = Game.prototype[name];
  Game.prototype[name] = function (...args) { return fn.call(this, orig, ...args); };
}

// ---------------------------------------------------------------- block hooks
wrapGame('changeBlock', function (orig, x, y, z, id, opts = {}) {
  const old = this.world.getBlock(x, y, z);
  const ok = orig.call(this, x, y, z, id, opts);
  if (ok && !opts.batch) this.redstoneNotify(x, y, z, old, id);
  return ok;
});

wrapGame('neighbourUpdates', function (orig, x, y, z, old, id) {
  orig.call(this, x, y, z, old, id);
  if (isSolid(id)) return;
  // Ladders, levers and buttons fall off when their wall goes
  const w = this.world;
  for (let f = 0; f < 6; f++) {
    const [dx, dy, dz] = FACE_DIRS[f];
    const nx = x + dx, ny = y + dy, nz = z + dz;
    const nb = w.getBlock(nx, ny, nz);
    if (!BLOCKS[nb] || !BLOCKS[nb].needsWall) continue;
    const d = w.getData(nx, ny, nz);
    const face = d && d.face !== undefined ? d.face : (nb === B.LADDER ? 4 : 2);
    const [ax, ay, az] = FACE_DIRS[face];
    if (nx + ax === x && ny + ay === y && nz + az === z) {
      this.changeBlock(nx, ny, nz, B.AIR, { noUpdate: true });
      if (this.player.mode === 'survival') this.dropBlockItems(nx, ny, nz, nb, true);
    }
  }
  // Sugar cane needs water next to its base
  if (w.getBlock(x, y + 1, z) === B.SUGAR_CANE && !this.caneCanStay(x, y + 1, z)) {
    let top = y + 1;
    while (w.getBlock(x, top + 1, z) === B.SUGAR_CANE) top++;
    for (let yy = top; yy >= y + 1; yy--) {
      this.changeBlock(x, yy, z, B.AIR, { noUpdate: true });
      if (this.player.mode === 'survival') this.dropBlockItems(x, yy, z, B.SUGAR_CANE, true);
    }
  }
});

Object.assign(Game.prototype, {
  redstoneNotify(x, y, z, old, id) {
    if (!this.redstone || !this.isAuthority) return;
    const rs = this.redstone;
    let near = rs.isComponent(old) || rs.isComponent(id);
    for (let f = 0; f < 6 && !near; f++) {
      const [dx, dy, dz] = FACE_DIRS[f];
      if (rs.isComponent(this.world.getBlock(x + dx, y + dy, z + dz))) near = true;
    }
    if (near) rs.mark(x, y, z);
  },

  caneCanStay(x, y, z) {
    const w = this.world, below = w.getBlock(x, y - 1, z);
    if (below === B.SUGAR_CANE) return true;
    if (![B.GRASS, B.DIRT, B.SAND, B.SNOW_GRASS].includes(below)) return false;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (isWater(w.getBlock(x + dx, y - 1, z + dz))) return true;
    return false;
  },

  // Extra checks and block data for placing one of the shaped blocks.
  // Returns {data} to place, {done:true} if it handled the click, or null to refuse.
  placementFor(bid, hit, tx, ty, tz) {
    const b = BLOCKS[bid], w = this.world, p = this.player;
    const hitY = p.eye.y + p.lookDir().y * hit.dist - hit.y;
    const upper = hit.normal[1] === -1 || (hit.normal[1] === 0 && hitY > 0.5);
    if (b.shape === slabShape) {
      // Clicking a matching slab on its open side makes a double slab
      const hd = w.getData(hit.x, hit.y, hit.z) || {};
      if (hit.id === bid && ((hit.normal[1] === 1 && !hd.top) || (hit.normal[1] === -1 && hd.top))) {
        this.changeBlock(hit.x, hit.y, hit.z, b.baseBlock);
        w.setData(hit.x, hit.y, hit.z, null);
        return { done: true };
      }
      const td = w.getData(tx, ty, tz) || {};
      if (w.getBlock(tx, ty, tz) === bid) {
        this.changeBlock(tx, ty, tz, b.baseBlock);
        w.setData(tx, ty, tz, null);
        return { done: true };
      }
      return { data: upper ? { top: true } : null };
    }
    if (b.shape === stairShape) return { data: { facing: (this._facingToward(p, tx, tz) + 2) % 4, top: upper } };
    if (b.needsWall) {
      if (!isSolid(hit.id) || !OPAQUE[hit.id]) return null;
      if (bid === B.LADDER && hit.normal[1] !== 0) return null;
      return { data: { face: FACE_OF_NORMAL(hit.normal) } };
    }
    if (bid === B.SUGAR_CANE) {
      if (w.getBlock(tx, ty, tz) !== B.AIR && !BLOCKS[w.getBlock(tx, ty, tz)].replaceable) return null;
      return this.caneCanStay(tx, ty, tz) ? { data: null, skipSupport: true } : null;
    }
    return { data: null };
  },

  // Right-clicking one of the new interactive blocks. Returns true if handled.
  interactNew(hit, held) {
    const id = hit.id, w = this.world, p = this.player;
    if (id === B.LEVER) {
      const d = w.getData(hit.x, hit.y, hit.z) || {};
      this.redstone.setOn(hit.x, hit.y, hit.z, !d.on);
      this.doSwing(); this.useCooldown = 0.25;
      return true;
    }
    if (id === B.BUTTON) {
      const d = w.getData(hit.x, hit.y, hit.z) || {};
      if (!d.on) this.redstone.pressButton(hit.x, hit.y, hit.z);
      this.doSwing(); this.useCooldown = 0.25;
      return true;
    }
    if (id === B.ENCHANTING_TABLE) { this.ui.openEnchant(hit.x, hit.y, hit.z); return true; }
    if (id === B.END_FRAME && held && held.id === ITEM.EYE_OF_ENDER) {
      const d = w.getData(hit.x, hit.y, hit.z);
      this.changeBlock(hit.x, hit.y, hit.z, B.END_FRAME_EYE, { noUpdate: true });
      if (d) w.setData(hit.x, hit.y, hit.z, d);
      if (p.mode !== 'creative') p.inventory.removeFrom(p.selected, 1);
      Sound.tone(300, 0.6, 0.25, 'sine', 120);
      this.particles.smoke(hit.x + 0.5, hit.y + 1, hit.z + 0.5, 6);
      this.tryOpenEndPortal(hit.x, hit.y, hit.z);
      this.doSwing(); this.useCooldown = 0.3;
      return true;
    }
    return false;
  },

  // Light the portal if a complete ring of 12 eyed frames surrounds a 3x3 hole.
  tryOpenEndPortal(x, y, z) {
    const w = this.world;
    for (let cx = x - 4; cx <= x + 4; cx++) for (let cz = z - 4; cz <= z + 4; cz++) {
      let ok = true;
      for (let i = -1; i <= 1 && ok; i++) {
        for (const [fx, fz] of [[cx + i, cz - 2], [cx + i, cz + 2], [cx - 2, cz + i], [cx + 2, cz + i]]) {
          if (w.getBlock(fx, y, fz) !== B.END_FRAME_EYE) { ok = false; break; }
        }
      }
      if (!ok) continue;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) this.changeBlock(cx + dx, y, cz + dz, B.END_PORTAL, { noUpdate: true, batch: true });
      this.flushBlocks();
      Sound.tone(110, 3, 0.4, 'sawtooth', 110);
      Sound.tone(220, 3, 0.25, 'sine', 330);
      this.chat.system('The End Portal has opened', '#c8f');
      return true;
    }
    return false;
  },

  // Right-click with an item that does something new. Returns true if handled.
  useNewItem(hit, held) {
    const p = this.player, w = this.world;
    const consume = () => { if (p.mode !== 'creative') p.inventory.removeFrom(p.selected, 1); };
    if (held.id === ITEM.ENDER_PEARL) {
      const dir = p.lookDir();
      this.spawnProjectile('pearl', p.eye.addScaledVector(dir, 0.4), dir.multiplyScalar(26), { owner: 'player' });
      Sound.noise(900, 1.5, 0.2, 0.3);
      consume(); this.doSwing(); this.useCooldown = 1;
      return true;
    }
    if (held.id === ITEM.EYE_OF_ENDER && !(hit && hit.id === B.END_FRAME)) {
      if (w.dim !== 0) return true;
      const [sx, , sz] = Structures.strongholdPos(w);
      const dx = sx + 0.5 - p.pos.x, dz = sz + 0.5 - p.pos.z, d = Math.hypot(dx, dz) || 1;
      const close = d < 12;
      const v = new THREE.Vector3(dx / d * (close ? 1 : 7), close ? -3 : 4, dz / d * (close ? 1 : 7));
      this.spawnProjectile('eye', p.eye, v, { owner: 'player', target: [sx, sz] });
      Sound.tone(400, 0.6, 0.2, 'sine', 300);
      consume(); this.doSwing(); this.useCooldown = 0.5;
      return true;
    }
    if (held.id === ITEM.BOAT) {
      const fh = w.raycast(p.eye, p.lookDir(), 5, true);
      if (!fh) return true;
      let bx = fh.x + 0.5, by = fh.y + 1, bz = fh.z + 0.5;
      if (isWater(fh.id)) by = fh.y + fluidHeight(fh.id) - 0.3;
      else if (fh.normal[1] !== 1) return true;
      this.boats.push(new Boat(this, bx, by, bz, p.yaw));
      Sound.block('wood');
      consume(); this.doSwing(); this.useCooldown = 0.4;
      return true;
    }
    return false;
  },

  // Right-clicking a mob with something
  useOnMob(m, held) {
    const p = this.player;
    if (!this.isAuthority && ((m.type === 'wolf' && held && held.id === ITEM.BONE && !m.owner) || (m.type === 'sheep' && held && held.id === ITEM.SHEARS))) {
      // the host owns the mobs: ask it to tame or shear
      const act = m.type === 'wolf' ? 'tame' : 'shear';
      if (act === 'tame' && p.mode !== 'creative') p.inventory.removeFrom(p.selected, 1);
      if (act === 'shear' && p.mode !== 'creative') this.damageHeld(1);
      this.net.send('hitmob', { id: m.id, dmg: 0, act });
      this.doSwing(); this.useCooldown = 0.3;
      return true;
    }
    if (m.type === 'wolf' && held && held.id === ITEM.BONE && !m.owner) {
      if (p.mode !== 'creative') p.inventory.removeFrom(p.selected, 1);
      if (Math.random() < 1 / 3 || p.mode === 'creative') {
        m.owner = this.settings.name; m.angry = 0;
        this.particles.burst(m.pos.x - 0.5, m.pos.y + 0.5, m.pos.z - 0.5, B.WOOL_RED, 8);
        this.chat.system('Wolf tamed', '#5f5');
      } else this.particles.smoke(m.pos.x, m.pos.y + 1, m.pos.z, 4);
      this.doSwing(); this.useCooldown = 0.3;
      return true;
    }
    if (m.type === 'sheep' && held && held.id === ITEM.SHEARS && !m.sheared) {
      m.sheared = true;
      if (m.model.parts.body) m.model.parts.body.scale.set(0.8, 0.85, 0.9);
      const n = 1 + Math.floor(Math.random() * 3);
      this.spawnItem(stackOf(B.WOOL_WHITE, n), m.pos.x, m.pos.y + 1, m.pos.z);
      Sound.noise(3000, 2, 0.15, 0.3);
      if (p.mode !== 'creative') this.damageHeld(1);
      this.doSwing(); this.useCooldown = 0.3;
      return true;
    }
    return false;
  },

  pearlLanded(pos) {
    const p = this.player;
    if (p.dead) return;
    const w = this.world;
    let y = pos.y;
    for (let i = 0; i < 4 && (isSolid(w.getBlock(Math.floor(pos.x), Math.floor(y), Math.floor(pos.z))) || isSolid(w.getBlock(Math.floor(pos.x), Math.floor(y + 1), Math.floor(pos.z)))); i++) y = Math.floor(y) + 1;
    this.particles.smoke(p.pos.x, p.pos.y + 1, p.pos.z, 10);
    p.pos.set(pos.x, y, pos.z);
    p.vel.set(0, 0, 0);
    p.fallStart = null;
    if (p.riding) this.dismount();
    Sound.tone(520, 0.3, 0.2, 'sine', -300);
    if (p.usesHealth) p.damage(5, 'fall');
  },

  // ---------------------------------------------------------------- boats
  boatTarget(eye, dir, maxDist) {
    let best = null, bd = maxDist;
    for (const b of this.boats) {
      const t = b.rayHit(eye, dir, bd);
      if (t !== null && t < bd) { bd = t; best = b; }
    }
    return best ? { boat: best, dist: bd } : null;
  },

  hitBoat(b) {
    b.hits++;
    this.doSwing();
    Sound.block('wood', 0.6);
    if (b.hits >= 3 || this.player.mode === 'creative') {
      if (this.player.riding === b) this.dismount();
      if (this.player.mode !== 'creative') this.spawnItem(stackOf(ITEM.BOAT, 1), b.pos.x, b.pos.y + 0.5, b.pos.z);
      b.dispose();
      this.boats.splice(this.boats.indexOf(b), 1);
    }
  },

  mount(b) {
    const p = this.player;
    if (this.boats.some((o) => o !== b && o.rider) || b.rider) return;
    p.riding = b; b.rider = p;
    p.flying = false;
  },

  dismount() {
    const p = this.player, b = p.riding;
    if (!b) return;
    p.riding = null; b.rider = null;
    p.pos.set(b.pos.x, b.pos.y + 0.9, b.pos.z);
    p.vel.set(0, 3, 0);
    p.fallStart = null;
    this.useCooldown = 0.3;
  },

  updateBoats(dt) {
    const p = this.player;
    for (const b of this.boats) {
      if (b === p.riding) continue;
      if (this.world.isLoaded(b.pos.x, b.pos.z)) b.update(dt, null);
    }
  },

  // Player sits in the boat; steering uses the movement keys.
  updateRiding(dt) {
    const p = this.player, b = p.riding;
    if (!b || p.dead || p.mode === 'spectator' || !this.boats.includes(b)) { if (b) this.dismount(); p.riding = null; return false; }
    if (p.keys.has('ShiftLeft') || p.keys.has('ShiftRight')) { this.dismount(); return false; }
    b.update(dt, p);
    p.pos.set(b.pos.x, b.pos.y + 0.15, b.pos.z);
    p.vel.set(0, 0, 0);
    p.onGround = true;
    p.fallStart = null;
    p.sneaking = false; p.sprinting = false;
    p.inWater = false; p.eyeInWater = false;
    p.tickStats(dt);
    return true;
  },

  // ---------------------------------------------------------------- experience on events
  xpFromBlock(id, x, y, z) {
    const r = ORE_XP[id];
    if (!r || this.player.mode !== 'survival') return;
    const n = r[0] + Math.floor(Math.random() * (r[1] - r[0] + 1));
    if (n > 0) this.spawnXP(x + 0.5, y + 0.5, z + 0.5, n);
  },

  // ---------------------------------------------------------------- the End
  enterEnd() {
    const p = this.player;
    this._switchWorld(2);
    const w = this.world;
    const [x, y, z] = END_SPAWN;
    const ccx = Math.floor(x / CHUNK_SIZE), ccz = Math.floor(z / CHUNK_SIZE);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!w.getChunk(ccx + dx, ccz + dz)) w.generateChunk(ccx + dx, ccz + dz);
    // Obsidian platform like Minecraft's, with air above it
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      this.changeBlock(x + dx, y - 1, z + dz, B.OBSIDIAN, { noUpdate: true, batch: true });
      for (let dy = 0; dy < 3; dy++) this.changeBlock(x + dx, y + dy, z + dz, B.AIR, { noUpdate: true, batch: true });
    }
    this.flushBlocks();
    p.pos.set(x + 0.5, y, z + 0.5);
    p.yaw = Math.PI / 2; // face the island centre
    p.vel.set(0, 0, 0);
    p.fallStart = null;
    p.portalLock = true;
    this.spawnPending = false;
    this.chat.system('Entered the End', '#c8f');
    this.endFightSetup();
    this.save();
  },

  endFightSetup() {
    if (!this.isAuthority || this.world.dim !== 2 || this.endState.dragonKilled) return;
    const broken = this.endState.crystalsBroken || (this.endState.crystalsBroken = []);
    const have = new Set();
    let dragon = false;
    for (const m of this.mobs.values()) {
      if (m.type === 'dragon') dragon = true;
      if (m.type === 'crystal') have.add(m.pillar);
    }
    if (!dragon) this.spawnMob('dragon', 0, 85, -40);
    // Crystals sit on the pillars until destroyed (they come back if their chunk was unloaded)
    Structures.END_PILLARS.forEach((pl, i) => {
      if (broken.includes(i) || have.has(i) || !this.world.isLoaded(pl.x, pl.z)) return;
      const c = this.spawnMob('crystal', pl.x + 0.5, pl.h + 1, pl.z + 0.5);
      c.pillar = i;
    });
  },

  // Dragon defeated: exit portal, egg and a lot of experience
  dragonDefeated(mob) {
    if (this.endState.dragonKilled) return;
    this.endState.dragonKilled = true;
    const w = this.world;
    let top = 40;
    for (let y = 100; y > 1; y--) if (w.getBlock(0, y, 0) === B.END_STONE) { top = y; break; }
    const set = (x, y, z, id) => this.changeBlock(x, y, z, id, { noUpdate: true, batch: true });
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      const r = Math.hypot(dx, dz);
      if (r > 3.3) continue;
      set(dx, top, dz, B.BEDROCK);
      for (let dy = 1; dy <= 4; dy++) set(dx, top + dy, dz, B.AIR);
      if (r < 2.5 && (dx || dz)) set(dx, top + 1, dz, B.END_PORTAL);
      else if (r >= 2.5) set(dx, top + 1, dz, B.BEDROCK);
    }
    for (let dy = 1; dy <= 4; dy++) set(0, top + dy, 0, B.BEDROCK);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) set(dx, top + 3, dz, B.TORCH);
    set(0, top + 5, 0, B.DRAGON_EGG);
    this.flushBlocks();
    this.chat.system('The Ender Dragon has been slain!', '#c8f');
    if (this.net.active) this.net.send('chat', { n: '', t: 'The Ender Dragon has been slain!' });
    Sound.tone(60, 4, 0.5, 'sawtooth', -40);
  },

  updateEndPortal(dt) {
    const p = this.player;
    const inEnd = boxInBlock(this.world, p.pos, 0.3, 1.0, (b) => b === B.END_PORTAL);
    if (!inEnd) { p.endLock = false; return; }
    if (p.endLock || p.dead) return;
    p.endLock = true;
    if (this.world.dim === 2) this.leaveEnd(true);
    else if (this.world.dim === 0) this.enterEnd();
  },

  leaveEnd(credits) {
    const p = this.player;
    const go = () => {
      this._switchWorld(0);
      const sp = p.spawn || this.worldSpawn;
      p.pos.set(sp.x, sp.y, sp.z);
      p.vel.set(0, 0, 0);
      p.fallStart = null;
      this.spawnPending = true;
      this.save();
    };
    if (credits && !this.endState.creditsSeen) {
      this.endState.creditsSeen = true;
      this.ui.showCredits(go);
    } else go();
  },

  // ---------------------------------------------------------------- spawners and extra spawning
  tickSpawners(dt) {
    this.spawnerTimer = (this.spawnerTimer || 0) - dt;
    if (this.spawnerTimer > 0 || this.difficulty === 0) return;
    this.spawnerTimer = 1;
    const p = this.player;
    for (const [k, d] of this.world.blockData) {
      if (!d || d.type !== 'spawner') continue;
      const [x, y, z] = k.split(',').map(Number);
      if (this.world.getBlock(x, y, z) !== B.SPAWNER) continue;
      if (!this.allPlayers().some((q) => q.pos.distanceTo(new THREE.Vector3(x, y, z)) < 16)) continue;
      d.delay = (d.delay ?? 10) - 1;
      if (Math.random() < 0.3) this.particles.smoke(x + 0.5, y + 0.5, z + 0.5, 2);
      if (d.delay > 0) continue;
      d.delay = 10 + Math.floor(Math.random() * 30);
      const type = MOB_TYPES.includes(d.mob) ? d.mob : 'zombie';
      let near = 0;
      for (const m of this.mobs.values()) if (m.type === type && m.pos.distanceTo(new THREE.Vector3(x, y, z)) < 9) near++;
      if (near >= 6) continue;
      for (let i = 0; i < 4; i++) {
        const sx = x + Math.floor(Math.random() * 9) - 4, sz = z + Math.floor(Math.random() * 9) - 4, sy = y + Math.floor(Math.random() * 3) - 1;
        if (this.world.getBlock(sx, sy, sz) !== B.AIR || this.world.getBlock(sx, sy + 1, sz) !== B.AIR) continue;
        if (!isSolid(this.world.getBlock(sx, sy - 1, sz)) && type !== 'blaze') continue;
        this.spawnMob(type, sx + 0.5, sy, sz + 0.5);
        this.particles.smoke(sx + 0.5, sy + 0.5, sz + 0.5, 6);
      }
    }
    void p;
  },

  // Called by updateSpawning's hooks for mobs added in this update.
  extraSpawn(players) {
    const w = this.world;
    if (this.difficulty === 0) return false;
    const p = players[Math.floor(Math.random() * players.length)];
    const a = Math.random() * Math.PI * 2, d = 24 + Math.random() * 24;
    const x = Math.floor(p.pos.x + Math.cos(a) * d), z = Math.floor(p.pos.z + Math.sin(a) * d);
    if (!w.isLoaded(x, z)) return false;
    let count = 0;
    for (const m of this.mobs.values()) if (['enderman', 'slime', 'blaze'].includes(m.type)) count++;
    if (count >= 6) return false;
    if (w.dim === 2) {
      // Endermen roam the island
      const sy = w.surfaceY(x, z);
      if (sy > 0 && w.getBlock(x, sy, z) === B.END_STONE && Math.random() < 0.5) { this.spawnMob('enderman', x + 0.5, sy + 1, z + 0.5); return true; }
      return false;
    }
    if (w.dim === 1) {
      // Blazes in and around fortresses
      for (const f of Structures.fortressesIn(w, x - 16, z - 16, x + 16, z + 16)) {
        const [x0, y0, z0, x1, y1, z1] = f.box;
        const bx = x0 + Math.floor(Math.random() * (x1 - x0)), bz = z0 + Math.floor(Math.random() * (z1 - z0));
        for (let y = y0; y <= y1; y++) {
          if (w.getBlock(bx, y, bz) === B.AIR && w.getBlock(bx, y + 1, bz) === B.AIR && isSolid(w.getBlock(bx, y - 1, bz))) {
            if (players.some((q) => q.pos.distanceTo(new THREE.Vector3(bx, y, bz)) < 16)) break;
            this.spawnMob('blaze', bx + 0.5, y, bz + 0.5);
            return true;
          }
        }
      }
      return false;
    }
    // Overworld: endermen at night on the surface, slimes deep underground
    const sy = w.surfaceY(x, z);
    if (Math.random() < 0.5 && this.daylight < 0.35 && isSolid(w.getBlock(x, sy, z)) && w.getBlock(x, sy + 1, z) === B.AIR && w.getBlock(x, sy + 2, z) === B.AIR && w.getBlock(x, sy + 3, z) === B.AIR) {
      if (players.every((q) => q.pos.distanceTo(new THREE.Vector3(x, sy, z)) > 20)) { this.spawnMob('enderman', x + 0.5, sy + 1, z + 0.5); return true; }
    }
    // Slime chunks: one in ten, decided by the chunk position and seed
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    if (hash3(cx, 7, cz, w.seed + 4242) < 0.1) {
      for (let tries = 0; tries < 4; tries++) {
        const y = 6 + Math.floor(Math.random() * 34);
        if (w.getBlock(x, y, z) === B.AIR && w.getBlock(x, y + 1, z) === B.AIR && isSolid(w.getBlock(x, y - 1, z))) {
          this.spawnMob('slime', x + 0.5, y, z + 0.5);
          return true;
        }
      }
    }
    return false;
  },
});

// Mob deaths: experience, slime splitting, the dragon
wrapGame('onMobKilled', function (orig, mob, killerPeer) {
  if (mob._dropped) return;
  orig.call(this, mob, killerPeer);
  const r = MOB_XP[mob.type] || [0, 0];
  const xp = r[0] + Math.floor(Math.random() * (r[1] - r[0] + 1)) * (mob.type === 'slime' ? mob.size || 1 : 1);
  if (xp > 0) {
    if (killerPeer) this.net.send('mobdrop', { to: killerPeer, x: mob.pos.x, y: mob.pos.y + 0.5, z: mob.pos.z, items: [], xp });
    else this.spawnXP(mob.pos.x, mob.pos.y + 0.5, mob.pos.z, xp);
  }
  if (mob.type === 'slime' && (mob.size || 1) > 1) {
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this.spawnMob('slime', mob.pos.x + (Math.random() - 0.5), mob.pos.y + 0.5, mob.pos.z + (Math.random() - 0.5), { size: mob.size / 2 });
  }
  if (mob.type === 'dragon') this.dragonDefeated(mob);
  if (mob.type === 'crystal') {
    if (mob.pillar !== undefined) (this.endState.crystalsBroken || (this.endState.crystalsBroken = [])).push(mob.pillar);
    this.explode(mob.pos.x, mob.pos.y + 0.5, mob.pos.z, 3, true);
  }
});

// Mining ores gives experience
wrapGame('breakBlock', function (orig, hit, harvest) {
  const id = this.world.getBlock(hit.x, hit.y, hit.z);
  orig.call(this, hit, harvest);
  if (harvest && this.world.getBlock(hit.x, hit.y, hit.z) === B.AIR) this.xpFromBlock(id, hit.x, hit.y, hit.z);
});

// Dying drops experience (7 per level, at most 100) and loses it
wrapGame('onDeath', function (orig, cause) {
  const p = this.player;
  if (p.dead) return;
  const lvl = xpLevel(p.xp || 0).level;
  if (p.riding) this.dismount();
  orig.call(this, cause);
  if (!this.hardcore) this.spawnXP(p.pos.x, p.pos.y + 1, p.pos.z, Math.min(100, lvl * 7));
  p.xp = 0;
});

// Respawning while in the End goes back to the Overworld
wrapGame('respawn', function (orig) {
  const inEnd = this.world.dim === 2;
  if (inEnd) {
    this._switchWorld(0);
  }
  orig.call(this);
});

wrapGame('_resetEntities', function (orig) {
  orig.call(this);
  if (this.player && this.player.riding) { this.player.riding = null; }
  for (const b of this.boats || []) b.dispose();
  this.boats = [];
  for (const o of this.orbs || []) o.dispose();
  this.orbs = [];
  if (this.redstone) { this.redstone.dirty = []; this.redstone.buttons.clear(); this.redstone.plates.clear(); }
});

// Extra spawns (endermen, slimes, blazes, End) share the regular spawn tick
wrapGame('updateSpawning', function (orig, dt) {
  const before = this.spawnTimer;
  orig.call(this, dt);
  if (before - dt > 0) return;
  const players = this.allPlayers().filter((p) => p.mode !== 'spectator');
  if (!players.length) return;
  if (Math.random() < (this.world.dim === 2 ? 0.25 : 0.12)) this.extraSpawn(players);
});

Object.assign(Game.prototype, {
  // Ladders: walk into them (or hold jump) to climb, sneak to hold on
  climb(dt) {
    const p = this.player;
    if (p.flying || p.mode === 'spectator' || p.riding) return;
    const k = p.keys;
    const moving = k.has('KeyW') || k.has('KeyA') || k.has('KeyS') || k.has('KeyD') || k.has('ArrowUp');
    if (k.has('Space') || moving) p.vel.y = 2.4;
    else if (p.sneaking) p.vel.y = 0;
    else p.vel.y = Math.max(p.vel.y, -2.4);
    p.fallStart = null;
  },
});

Object.assign(Game.prototype, {
  // Host: a client tamed a wolf or sheared a sheep
  remoteMobAction(m, act, name, peer) {
    if (act === 'tame' && m.type === 'wolf' && !m.owner) {
      if (Math.random() < 1 / 3) { m.owner = name || 'friend'; m.angry = 0; this.net.send('chat', { n: '', t: `${name || 'A player'} tamed a wolf` }); }
    } else if (act === 'shear' && m.type === 'sheep' && !m.sheared) {
      m.sheared = true;
      if (m.model.parts.body) m.model.parts.body.scale.set(0.8, 0.85, 0.9);
      this.net.send('mobdrop', { to: peer, x: m.pos.x, y: m.pos.y + 1, z: m.pos.z, items: [[B.WOOL_WHITE, 1 + Math.floor(Math.random() * 3)]] });
    }
  },
});
