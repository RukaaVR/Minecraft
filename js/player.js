// The local player: movement, game modes, health, hunger and air.
'use strict';

const PLAYER_WIDTH = 0.6;
const PLAYER_HEIGHT = 1.8;
const EYE_HEIGHT = 1.62;
const SNEAK_EYE = 1.32;

const GAME_MODES = ['survival', 'creative', 'adventure', 'spectator'];

class Player {
  constructor(world) {
    this.world = world;
    this.pos = new THREE.Vector3(0, 80, 0);
    this.vel = new THREE.Vector3();
    this.w = PLAYER_WIDTH;
    this.h = PLAYER_HEIGHT;
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.flying = false;
    this.inWater = false;
    this.eyeInWater = false;
    this.keys = new Set();
    this.lastSpaceTap = 0;
    this.lastWTap = 0;
    this.sprinting = false;
    this.sneaking = false;
    this.bobTime = 0;
    this.mode = 'survival';
    this.hardcore = false;
    this.health = 20;
    this.food = 20;
    this.saturation = 5;
    this.exhaustion = 0;
    this.air = 15; // seconds of air (10 bubbles)
    this.fallStart = null;
    this.hurtTime = 0;
    this.invuln = 0;
    this.regenTimer = 0;
    this.starveTimer = 0;
    this.drownTimer = 0;
    this.dead = false;
    this.spawn = null;
    this.inventory = new Inventory(36);
    this.armor = new Inventory(4); // helmet, chestplate, leggings, boots
    this.inLava = false;
    this.eyeInLava = false;
    this.fireTime = 0;
    this.fireTick = 0;
    this.lavaTick = 0;
    this.portalTime = 0;
    this.portalCooldown = 0;
    this.sleeping = false;
    this.selected = 0;
    this.xp = 0;
    this.enchantSeed = (Math.random() * 2147483647) | 0;
    this.riding = null;
    this.onDamage = null; // callback(amount, cause)
  }

  get eyeHeight() { return this.sneaking && !this.flying ? SNEAK_EYE : EYE_HEIGHT; }
  get eye() { return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z); }
  get creativeLike() { return this.mode === 'creative' || this.mode === 'spectator'; }
  get canFly() { return this.mode === 'creative' || this.mode === 'spectator'; }
  get usesHealth() { return this.mode === 'survival' || this.mode === 'adventure'; }
  get heldStack() { return this.inventory.slots[this.selected]; }

  lookDir() {
    const cp = Math.cos(this.pitch);
    return new THREE.Vector3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'spectator') this.flying = true;
    else if (!this.canFly) this.flying = false;
    this.fallStart = null;
  }

  onKeyDown(code) {
    const now = performance.now();
    if (code === 'Space' && !this.keys.has('Space')) {
      if (this.canFly && this.mode !== 'spectator' && now - this.lastSpaceTap < 300) { this.flying = !this.flying; this.vel.y = 0; }
      this.lastSpaceTap = now;
    }
    if (code === 'KeyW' && !this.keys.has('KeyW')) {
      if (now - this.lastWTap < 280) this.sprinting = true;
      this.lastWTap = now;
    }
    if (code === 'ControlLeft' || code === 'ControlRight') this.sprinting = true;
    this.keys.add(code);
  }
  onKeyUp(code) { this.keys.delete(code); }

  intersectsBlock(x, y, z) {
    const w = PLAYER_WIDTH / 2;
    return this.pos.x + w > x && this.pos.x - w < x + 1 &&
      this.pos.y + PLAYER_HEIGHT > y && this.pos.y < y + 1 &&
      this.pos.z + w > z && this.pos.z - w < z + 1;
  }

  get armorPoints() {
    let pts = 0;
    for (const s of this.armor.slots) if (s && ITEMS[s.id].armor) pts += ITEMS[s.id].armor.points;
    return pts;
  }

  damage(amount, cause, knock) {
    if (!this.usesHealth || this.dead || amount <= 0) return false;
    if (this.invuln > 0 && cause !== 'starve' && cause !== 'drown' && cause !== 'void' && cause !== 'fire') return false;
    // Armor (Minecraft's formula, toughness 0); fall, drowning, starving and the void bypass it
    if (!['fall', 'drown', 'starve', 'void', 'kill'].includes(cause)) {
      const pts = this.armorPoints;
      if (pts > 0) {
        const reduction = Math.min(20, Math.max(pts / 5, pts - amount / 2)) / 25;
        amount *= 1 - reduction;
        const wear = Math.max(1, Math.floor(amount / 4));
        this.armor.slots.forEach((s, i) => {
          if (!s) return;
          const unb = typeof enchLevel === 'function' ? enchLevel(s, 'unbreaking') : 0;
          if (unb && Math.random() < 0.6 * (1 - 1 / (unb + 1))) return;
          s.dmg = (s.dmg || 0) + wear;
          if (s.dmg >= ITEMS[s.id].armor.uses) { this.armor.slots[i] = null; Sound.noise(2000, 2, 0.3, 0.5); }
        });
        this.armor.changed();
      }
    }
    // Protection enchantments (feather falling only for falls)
    if (typeof enchLevel === 'function' && !['void', 'kill', 'starve'].includes(cause)) {
      let epf = 0;
      for (const s of this.armor.slots) {
        if (!s) continue;
        epf += enchLevel(s, 'protection');
        if (cause === 'fall') epf += enchLevel(s, 'feather_falling') * 3;
      }
      if (epf > 0) amount *= 1 - Math.min(20, epf) * 0.04;
    }
    this.health = Math.max(0, this.health - amount);
    this.hurtTime = 0.4;
    this.invuln = 0.5;
    this.exhaustion += 0.1;
    if (knock) { this.vel.x += knock.x; this.vel.z += knock.z; this.vel.y = Math.max(this.vel.y, knock.y || 4); }
    if (this.onDamage) this.onDamage(amount, cause);
    return true;
  }

  heal(amount) { this.health = Math.min(20, this.health + amount); }

  eat(item) {
    this.food = Math.min(20, this.food + item.food);
    this.saturation = Math.min(this.food, this.saturation + item.saturation);
  }

  update(dt) {
    const k = this.keys;
    const world = this.world;
    this.inWater = boxInBlock(world, this.pos, this.w, 0.9, isWater);
    this.inLava = boxInBlock(world, this.pos, this.w, 0.9, isLava);
    const eye = this.eye;
    const eyeBlock = world.getBlock(Math.floor(eye.x), Math.floor(eye.y), Math.floor(eye.z));
    const eyeFrac = eye.y - Math.floor(eye.y);
    this.eyeInWater = isWater(eyeBlock) && eyeFrac < fluidHeight(eyeBlock) + 0.05;
    this.eyeInLava = isLava(eyeBlock);
    const under = world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.05), Math.floor(this.pos.z));
    this.onSoulSand = under === B.SOUL_SAND;
    this.inPortal = boxInBlock(world, this.pos, 0.3, 1.0, (b) => b === B.PORTAL_X || b === B.PORTAL_Z);
    const spectator = this.mode === 'spectator';

    this.sneaking = !spectator && (k.has('ShiftLeft') || k.has('ShiftRight')) && !this.flying;
    let fx = 0, fz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) fz -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fz += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) fx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) fx += 1;
    if (fz >= 0 || this.sneaking || (this.usesHealth && this.food <= 6)) this.sprinting = false;
    const len = Math.hypot(fx, fz);
    if (len > 0) { fx /= len; fz /= len; }
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wx = fx * cos + fz * sin;
    const wz = -fx * sin + fz * cos;

    let speed;
    if (this.flying) speed = this.sprinting ? 21 : 10.9;
    else speed = this.sneaking ? 1.3 : this.sprinting ? 5.6 : 4.3;
    if (this.inWater && !this.flying) speed *= 0.5;
    if (this.inLava && !this.flying) speed *= 0.3;
    if (this.onSoulSand && !this.flying) speed *= 0.45;

    const accel = this.onGround || this.flying ? 14 : 3;
    const t = Math.min(1, accel * dt);
    this.vel.x += (wx * speed - this.vel.x) * t;
    this.vel.z += (wz * speed - this.vel.z) * t;

    if (this.flying) {
      let vy = 0;
      if (k.has('Space')) vy += 1;
      if (k.has('ShiftLeft') || k.has('ShiftRight')) vy -= 1;
      this.vel.y += (vy * 8 - this.vel.y) * Math.min(1, 12 * dt);
    } else if (this.inWater || this.inLava) {
      this.vel.y -= (this.inLava ? 6 : 10) * dt;
      if (k.has('Space')) this.vel.y += (this.inLava ? 14 : 24) * dt;
      this.vel.y = Math.max(-3, Math.min(this.inLava ? 2 : 3.5, this.vel.y));
    } else {
      this.vel.y -= 32 * dt;
      if (k.has('Space') && this.onGround) {
        this.vel.y = 9.0;
        this.exhaustion += this.sprinting ? 0.2 : 0.05;
        if (this.sprinting) { this.vel.x += wx * 1.5; this.vel.z += wz * 1.5; }
      }
      this.vel.y = Math.max(-78, this.vel.y * (1 - 0.02 * dt * 60));
    }

    const before = this.pos.clone();
    const res = moveBody(world, this, dt, { noclip: spectator, sneak: this.sneaking });
    if (this.flying && this.onGround && !spectator) this.flying = false;
    if (res.hitX || res.hitZ) this.sprinting = false;

    // Fall damage
    if (this.onGround || this.inWater || this.inLava || this.flying) {
      if (this.fallStart !== null && this.onGround && !this.inWater && !this.flying) {
        const fall = this.fallStart - this.pos.y;
        if (fall > 3.5 && this.usesHealth) this.damage(Math.floor(fall - 3), 'fall');
      }
      this.fallStart = null;
    } else if (this.vel.y < 0) {
      if (this.fallStart === null || this.pos.y > this.fallStart) this.fallStart = Math.max(this.pos.y, before.y);
    } else {
      this.fallStart = null;
    }

    const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
    if (this.onGround && moved > 0.001) this.bobTime += moved * 2.2;
    if (this.usesHealth) this.exhaustion += moved * (this.sprinting ? 0.1 : 0.01);

    this.tickStats(dt);
    if (this.pos.y < -40) {
      if (this.usesHealth) this.damage(4, 'void');
      else if (!spectator) { this.pos.y = 110; this.vel.set(0, 0, 0); }
    }
  }

  tickStats(dt) {
    this.hurtTime = Math.max(0, this.hurtTime - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.portalCooldown = Math.max(0, this.portalCooldown - dt);
    if (!this.usesHealth) { this.air = 15; this.fireTime = 0; return; }

    // Lava and fire
    if (this.inLava) {
      this.fireTime = 8;
      this.lavaTick += dt;
      if (this.lavaTick >= 0.5) { this.lavaTick = 0; this.damage(4, 'lava'); }
    }
    if (this.inWater) this.fireTime = 0;
    if (this.fireTime > 0) {
      this.fireTime -= dt;
      this.fireTick += dt;
      if (this.fireTick >= 1) { this.fireTick = 0; if (!this.inLava) this.damage(1, 'fire'); }
    }

    // Air
    if (this.eyeInWater) {
      this.air -= dt;
      if (this.air <= 0) {
        this.air = 0;
        this.drownTimer += dt;
        if (this.drownTimer >= 1) { this.drownTimer = 0; this.damage(2, 'drown'); }
      }
    } else this.air = Math.min(15, this.air + dt * 5);

    // Hunger
    while (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else this.food = Math.max(0, this.food - 1);
    }
    this.regenTimer += dt;
    if (this.food >= 18 && this.health < 20 && !this.hardcoreNoRegen) {
      if (this.regenTimer >= 4) { this.regenTimer = 0; this.heal(1); this.exhaustion += 6; }
    } else if (this.food === 0) {
      this.starveTimer += dt;
      if (this.starveTimer >= 4) { this.starveTimer = 0; if (this.health > 1) this.damage(1, 'starve'); }
    } else this.regenTimer = Math.min(this.regenTimer, 4);
  }

  serialize() {
    return {
      x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: this.yaw, pitch: this.pitch,
      flying: this.flying, mode: this.mode, health: this.health, food: this.food,
      saturation: this.saturation, air: this.air, spawn: this.spawn,
      inv: this.inventory.serialize(), selected: this.selected, armor: this.armor.serialize(),
      xp: this.xp, enchantSeed: this.enchantSeed,
    };
  }
  load(d) {
    if (!d) return;
    this.pos.set(d.x ?? 0.5, d.y ?? 90, d.z ?? 0.5);
    this.yaw = d.yaw || 0; this.pitch = d.pitch || 0;
    if (d.mode) this.setMode(d.mode);
    this.flying = !!d.flying && this.canFly;
    this.health = d.health ?? 20; this.food = d.food ?? 20;
    this.saturation = d.saturation ?? 5; this.air = d.air ?? 15;
    this.spawn = d.spawn || null;
    if (d.inv) this.inventory.load(d.inv);
    if (d.armor) this.armor.load(d.armor);
    this.selected = d.selected || 0;
    this.xp = d.xp || 0;
    if (d.enchantSeed) this.enchantSeed = d.enchantSeed;
  }
}
