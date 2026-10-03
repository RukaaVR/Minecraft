// Behaviour for wolves, endermen, iron golems, slimes, blazes, the Ender Dragon and
// end crystals, plus boats.
'use strict';

MOB_TYPES.push('wolf', 'enderman', 'golem', 'slime', 'blaze', 'dragon', 'crystal');
Object.assign(MOB_INFO, {
  wolf: { health: 8, speed: 3.0, hostile: false, neutral: true },
  enderman: { health: 40, speed: 3.0, hostile: false, neutral: true },
  golem: { health: 100, speed: 1.6, hostile: false, persistent: true },
  slime: { health: 16, speed: 2.0, hostile: true },
  blaze: { health: 20, speed: 2.0, hostile: true, flying: true },
  dragon: { health: 200, speed: 18, hostile: true, flying: true, persistent: true, boss: true },
  crystal: { health: 1, speed: 0, hostile: false, persistent: true },
});
const _mobDrops = mobDrops;
// eslint-disable-next-line no-func-assign
mobDrops = function (type, r) {
  const n = (a, b) => a + Math.floor(r() * (b - a + 1));
  switch (type) {
    case 'enderman': return [[ITEM.ENDER_PEARL, n(0, 1)]];
    case 'golem': return [[ITEM.IRON_INGOT, n(3, 5)], [B.POPPY, n(0, 2)]];
    case 'slime': return [[ITEM.SLIMEBALL, n(0, 2)]];
    case 'blaze': return [[ITEM.BLAZE_ROD, n(0, 1)]];
    case 'wolf': case 'dragon': case 'crystal': return [];
  }
  return _mobDrops(type, r);
};

// Per-type setup after construction
const MOB_INIT = {
  slime(extra) {
    this.size = extra.size || [1, 2, 4][Math.floor(Math.random() * 3)];
    this.model.inner.scale.setScalar(this.size);
    this.w = this.h = 0.52 * this.size;
    this.health = this.size * this.size;
    this.hopTimer = 1;
  },
  dragon() { this.yaw = 0; this.phase = 'circle'; this.phaseTimer = 20; this.circleAngle = 0; this.contactCooldown = 0; this.healTimer = 0; this.healTarget = null; this.beam = null; },
  crystal() { this.spin = Math.random() * 6; },
  golem(extra) { this.home = extra.home || null; },
  wolf() { this.owner = null; this.sitting = false; },
};

// ---------------------------------------------------------------- helpers
function angleTo(from, to) { return Math.atan2(-(to.x - from.x), -(to.z - from.z)); }

Object.assign(Mob.prototype, {
  // Walk toward a point (or wander when target is null).
  _seek(dt, target, speed, stopAt = 1) {
    let dirX = 0, dirZ = 0, sp = 0;
    if (target) {
      const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
      const d = Math.hypot(dx, dz) || 0.01;
      this.targetYaw = Math.atan2(-dx, -dz);
      if (d > stopAt) { dirX = dx / d; dirZ = dz / d; sp = speed; }
    } else {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        if (Math.random() < 0.6) {
          let a = Math.random() * Math.PI * 2;
          if (this.home && Math.hypot(this.pos.x - this.home[0], this.pos.z - this.home[2]) > 20) a = Math.atan2(this.home[2] - this.pos.z, this.home[0] - this.pos.x);
          this.wanderDir = [Math.cos(a), Math.sin(a)];
        } else this.wanderDir = null;
        this.wanderTimer = 2 + Math.random() * 4;
      }
      if (this.wanderDir) { dirX = this.wanderDir[0]; dirZ = this.wanderDir[1]; sp = this.info.speed * 0.5; this.targetYaw = Math.atan2(-dirX, -dirZ); }
    }
    return this._locomote(dt, dirX, dirZ, sp);
  },
  _melee(target, dmg, reach = 1.8, knockUp = 4) {
    if (this.attackCooldown > 0) return;
    const d = Math.hypot(target.pos.x - this.pos.x, target.pos.z - this.pos.z);
    if (d > reach || Math.abs(target.pos.y - this.pos.y) > 2.5) return;
    this.attackCooldown = 1;
    this.swing = 1;
    const kx = (target.pos.x - this.pos.x) / (d || 1) * 5, kz = (target.pos.z - this.pos.z) / (d || 1) * 5;
    if (target instanceof Mob) target.hurt(dmg, kx, kz, this);
    else this.game.damagePlayer(target, dmg, { x: kx, z: kz, y: knockUp }, 'mob');
  },
  // Random teleport within `range` blocks onto solid ground with 3 blocks of air.
  teleport(range = 16, near = null) {
    const w = this.game.world;
    const c = near || this.pos;
    for (let i = 0; i < 24; i++) {
      const x = Math.floor(c.x + (Math.random() - 0.5) * range * 2), z = Math.floor(c.z + (Math.random() - 0.5) * range * 2);
      if (!w.isLoaded(x, z)) continue;
      for (let y = Math.floor(c.y) + 8; y > Math.floor(c.y) - 12; y--) {
        if (isSolid(w.getBlock(x, y - 1, z)) && !FLUID[w.getBlock(x, y - 1, z)] && w.getBlock(x, y, z) === B.AIR && w.getBlock(x, y + 1, z) === B.AIR && w.getBlock(x, y + 2, z) === B.AIR) {
          this.game.particles.smoke(this.pos.x, this.pos.y + 1, this.pos.z, 10);
          this.pos.set(x + 0.5, y, z + 0.5);
          this.vel.set(0, 0, 0);
          Sound.tone(300, 0.3, 0.2, 'sine', 600);
          return true;
        }
      }
    }
    return false;
  },
});

// ---------------------------------------------------------------- AI
Object.assign(MOB_AI, {
  wolf(dt) {
    const g = this.game;
    let target = null;
    if (this.owner) {
      // Tamed: attack what the owner fights, otherwise follow
      if (g.ownerTarget && g.ownerTarget !== this && !g.ownerTarget.dead && g.ownerTarget.pos.distanceTo(this.pos) < 20) target = g.ownerTarget;
      if (target) { this._seek(dt, target.pos, 3.6, 1.2); this._melee(target, 4); return; }
      // follow whoever tamed it (the host or a friend)
      let op = g.player.pos;
      if (this.owner && this.owner !== g.settings.name) for (const rp of g.remotePlayers.values()) if (rp.name === this.owner) op = rp.pos;
      const d = op.distanceTo(this.pos);
      if (d > 24) { this.pos.set(op.x + 1, op.y, op.z + 1); this.vel.set(0, 0, 0); }
      this._seek(dt, d > 4 ? op : null, 3.4, 3);
      return;
    }
    if (this.angry > 0) {
      const t = g.nearestTarget(this.pos, 24);
      if (t) { this._seek(dt, t.pos, 3.6, 1.2); this._melee(t, [0, 3, 4, 6][g.difficulty]); return; }
    }
    // Wild wolves hunt sheep now and then
    for (const m of g.mobs.values()) if (m.type === 'sheep' && !m.dead && m.pos.distanceTo(this.pos) < 10) { target = m; break; }
    if (target && Math.random() < 0.002) this.hunt = target;
    if (this.hunt && !this.hunt.dead) { this._seek(dt, this.hunt.pos, 3.2, 1.2); this._melee(this.hunt, 3); return; }
    this._seek(dt, null, 2);
  },

  enderman(dt) {
    const g = this.game, w = g.world;
    const p = g.player;
    // Looking at an enderman's head makes it angry (unless wearing a pumpkin)
    if (!this.angry && !p.dead && p.usesHealth) {
      const head = new THREE.Vector3(this.pos.x, this.pos.y + 2.6, this.pos.z);
      const to = head.clone().sub(p.eye);
      const d = to.length();
      if (d < 48 && to.normalize().dot(p.lookDir()) > 0.995 - 0.15 / Math.max(d, 1) && this.canSee(p.pos)) {
        const helmet = p.armor.slots[0];
        if (!(helmet && helmet.id === B.PUMPKIN)) { this.angry = 30; Sound.tone(150, 0.6, 0.3, 'sawtooth', -60); }
      }
    }
    const wet = boxInBlock(w, this.pos, this.w, this.h, isWater) || (g.weather && g.weather.rain > 0.5 && w.getLight(Math.floor(this.pos.x), Math.floor(this.pos.y + 2), Math.floor(this.pos.z)).sky >= 15);
    if (wet && Math.random() < dt * 2) { this.hurt(1, 0, 0, 'env'); this.teleport(); }
    if (this.angry > 0) {
      const t = g.nearestTarget(this.pos, 64);
      if (t) {
        if (t.pos.distanceTo(this.pos) > 12 && Math.random() < dt * 0.4) this.teleport(6, t.pos);
        this._seek(dt, t.pos, 4.2, 1.2);
        this._melee(t, [0, 4, 7, 10][g.difficulty]);
        return;
      }
    }
    this._seek(dt, null, 2);
  },

  golem(dt) {
    const g = this.game;
    let target = null, bd = 16;
    for (const m of g.mobs.values()) {
      if (m.dead || !(m.info.hostile && m.type !== 'creeper') || m.info.flying) continue;
      const d = m.pos.distanceTo(this.pos);
      if (d < bd) { bd = d; target = m; }
    }
    if (!target && this.angry > 0) target = g.nearestTarget(this.pos, 24);
    if (target) {
      this._seek(dt, target.pos, 2.2, 1.6);
      if (this.attackCooldown <= 0 && Math.hypot(target.pos.x - this.pos.x, target.pos.z - this.pos.z) < 2.6) {
        this.attackCooldown = 1.2;
        this.swing = 1;
        const dmg = 7 + Math.floor(Math.random() * 14);
        if (target instanceof Mob) { target.hurt(dmg, 0, 0, this); target.vel.y = 10; if (target.dead) g.onMobKilled(target, null); }
        else g.damagePlayer(target, dmg / 2, { x: 0, z: 0, y: 10 }, 'mob');
        Sound.noise(200, 1, 0.3, 0.5);
      }
      return;
    }
    this._seek(dt, null, 1);
  },

  slime(dt) {
    const g = this.game;
    const t = g.nearestTarget(this.pos, 16);
    this.hopTimer -= dt;
    if (t) this.targetYaw = angleTo(this.pos, t.pos);
    else if (this.hopTimer <= 0) this.targetYaw = Math.random() * Math.PI * 2;
    let dirX = 0, dirZ = 0, sp = 0;
    if (!this.onGround) { dirX = -Math.sin(this.yaw); dirZ = -Math.cos(this.yaw); sp = 2 + this.size * 0.4; }
    else if (this.hopTimer <= 0) {
      this.hopTimer = 0.8 + Math.random() * 1.2;
      this.vel.y = 6 + this.size;
      Sound.noise(500 / this.size, 1, 0.15, 0.25);
    }
    this._locomote(dt, dirX, dirZ, sp);
    this.model.inner.scale.y = this.size * (this.onGround ? 1 : 1.2);
    if (t && this.size > 1) this._melee(t, this.size, 0.6 + this.size * 0.5);
  },

  blaze(dt) {
    const g = this.game, w = g.world;
    const t = g.nearestTarget(this.pos, 32);
    const goalY = t ? t.pos.y + 3 + Math.sin(g.simTime + this.id) : this.pos.y + Math.sin(g.simTime * 0.5 + this.id) * 0.5;
    this.vel.y += ((goalY - this.pos.y) * 1.5 - this.vel.y) * Math.min(1, dt * 2);
    let dx = 0, dz = 0;
    if (t) {
      this.targetYaw = angleTo(this.pos, t.pos);
      const d = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
      if (d > 10) { dx = (t.pos.x - this.pos.x) / d; dz = (t.pos.z - this.pos.z) / d; }
      if (this.attackCooldown <= 0 && d < 24 && this.canSee(t.pos)) {
        this.attackCooldown = 4;
        this.burst = 3;
      }
      if (this.burst > 0 && (this.burstTimer = (this.burstTimer || 0) - dt) <= 0) {
        this.burst--;
        this.burstTimer = 0.3;
        const from = new THREE.Vector3(this.pos.x, this.pos.y + 1.4, this.pos.z);
        const v = new THREE.Vector3(t.pos.x, t.pos.y + 1, t.pos.z).sub(from).normalize();
        v.x += (Math.random() - 0.5) * 0.15; v.z += (Math.random() - 0.5) * 0.15;
        g.spawnProjectile('smallfire', from.addScaledVector(v, 0.8), v.multiplyScalar(16), { owner: this });
        Sound.noise(900, 1, 0.2, 0.3);
      }
    }
    this.vel.x += (dx * 2 - this.vel.x) * Math.min(1, dt * 2);
    this.vel.z += (dz * 2 - this.vel.z) * Math.min(1, dt * 2);
    let dyaw = this.targetYaw - this.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    this.yaw += dyaw * Math.min(1, dt * 5);
    moveBody(w, this, dt, { stepHeight: 0 });
    if (boxInBlock(w, this.pos, this.w, this.h, isWater)) this.hurt(1, 0, 0, 'env');
  },

  crystal(dt) { this.vel.set(0, 0, 0); this.spin += dt * 2; },

  dragon(dt) {
    const g = this.game;
    this.contactCooldown = Math.max(0, this.contactCooldown - dt);
    const players = g.allPlayers().filter((p) => p.mode === 'survival' || p.mode === 'adventure');
    const target = players.length ? players.reduce((a, b) => (a.pos.distanceTo(this.pos) < b.pos.distanceTo(this.pos) ? a : b)) : null;
    this.phaseTimer -= dt;
    if (this.phase === 'circle' && this.phaseTimer <= 0 && target) { this.phase = 'charge'; this.phaseTimer = 7; Sound.tone(80, 1.5, 0.4, 'sawtooth', -30); }
    else if (this.phase === 'charge' && this.phaseTimer <= 0) { this.phase = 'circle'; this.phaseTimer = 12 + Math.random() * 10; }
    let goal;
    if (this.phase === 'charge' && target) {
      goal = new THREE.Vector3(target.pos.x, target.pos.y + 1, target.pos.z);
      if (goal.distanceTo(this.pos) < 4) { this.phase = 'circle'; this.phaseTimer = 10 + Math.random() * 10; }
    } else {
      this.circleAngle += dt * 0.18;
      goal = new THREE.Vector3(Math.cos(this.circleAngle) * 55, 80 + Math.sin(this.circleAngle * 2) * 10, Math.sin(this.circleAngle) * 55);
    }
    const speed = this.phase === 'charge' ? 22 : 16;
    const want = goal.sub(this.pos).normalize().multiplyScalar(speed);
    this.vel.lerp(want, Math.min(1, dt * 1.2));
    this.pos.addScaledVector(this.vel, dt);
    this.targetYaw = Math.atan2(-this.vel.x, -this.vel.z);
    let dyaw = this.targetYaw - this.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    this.yaw += dyaw * Math.min(1, dt * 2.5);
    this.walkPhase += dt * 3;
    // Ram anything it flies through
    for (const p of players) {
      if (this.contactCooldown > 0) break;
      const d = p.pos.distanceTo(this.pos);
      if (d < 5) {
        this.contactCooldown = 1;
        const k = p.pos.clone().sub(this.pos).normalize().multiplyScalar(10);
        g.damagePlayer(p, 10, { x: k.x, y: 8, z: k.z }, 'dragon');
      }
    }
    // Heal from the nearest end crystal
    this.healTarget = null;
    let best = 48;
    for (const m of g.mobs.values()) {
      if (m.type !== 'crystal' || m.dead) continue;
      const d = m.pos.distanceTo(this.pos);
      if (d < best) { best = d; this.healTarget = m; }
    }
    if (this.healTarget) {
      this.healTimer += dt;
      if (this.healTimer > 0.5) { this.healTimer = 0; this.health = Math.min(this.info.health, this.health + 1); }
    }
    if (Math.random() < dt * 0.15 && g.player.pos.distanceTo(this.pos) < 100) Sound.tone(70 + Math.random() * 30, 1.2, 0.3, 'sawtooth', -20);
  },
});

// ---------------------------------------------------------------- extra rendering
Object.assign(MOB_RENDER, {
  blaze(light) {
    const rods = this.model.parts.rods, t = (this.game.simTime || 0) + this.id;
    rods.forEach((r, i) => {
      const ring = Math.floor(i / 4), a = t * (1.5 - ring * 0.4) + (i % 4) * Math.PI / 2 + ring;
      const rad = [10, 7, 4][ring] * MODEL_SCALE;
      r.position.set(Math.cos(a) * rad, (20 - ring * 7 + Math.sin(t * 2 + i) * 1.5) * MODEL_SCALE, Math.sin(a) * rad);
    });
    this.model.mat.color.setRGB(Math.max(light, 0.9) * 1.4, Math.max(light, 0.9) * 1.2, Math.max(light, 0.9) * 0.8);
  },
  wolf() {
    const p = this.model.parts;
    if (p.collar) p.collar.visible = !!this.owner;
    p.tail.rotation.x = this.angry > 0 ? 1.4 : this.owner ? 1.1 : 0.6;
  },
  golem() {
    const p = this.model.parts;
    p.armL.rotation.x = -Math.sin(this.walkPhase) * this.walkAmount * 0.5 - Math.sin(this.swing * Math.PI) * 1.5;
    p.armR.rotation.x = Math.sin(this.walkPhase) * this.walkAmount * 0.5 - Math.sin(this.swing * Math.PI) * 1.5;
  },
  enderman() {
    const p = this.model.parts;
    p.head.position.y = (42 + (this.angry > 0 ? 3 : 0)) * MODEL_SCALE;
  },
  crystal() {
    const p = this.model.parts, t = (this.game.simTime || 0) + this.spin;
    p.outer.rotation.set(t, t * 0.7, 0); p.middle.rotation.set(-t * 0.8, t, 0.4); p.core.rotation.set(t * 1.3, 0, t);
    const bob = Math.sin(t * 1.5) * 0.25;
    for (const m of [p.outer, p.middle, p.core]) m.position.y = 1.2 + bob;
    this.model.mat.color.setRGB(1.5, 0.9, 1.6);
    if (this.model.extraMats) this.model.extraMats[0].color.setRGB(2, 0.6, 1.5);
  },
  dragon(light) {
    const m = this.model, p = m.parts, t = this.walkPhase;
    m.inner.rotation.y = this.yaw + Math.PI;
    m.inner.rotation.x = THREE.MathUtils.clamp(-this.vel.y * 0.04, -0.6, 0.6);
    for (const w of p.wings) {
      const flap = Math.sin(t * 2) * 0.7;
      w.pivot.rotation.z = w.side * flap;
      w.tipPivot.rotation.z = w.side * Math.sin(t * 2 - 0.8) * 0.5;
    }
    p.neck.forEach((n, i) => n.position.set(0, 2.6 + i * 0.25 + Math.sin(t + i * 0.4) * 0.1, 4.2 + i * 1.1));
    p.head.position.set(0, 3.9 + Math.sin(t + 2) * 0.15, 10.4);
    p.tail.forEach((s, i) => s.position.set(Math.sin(t * 0.8 - i * 0.5) * i * 0.15, 2 + Math.sin(t - i * 0.3) * 0.2, -4.6 - i * 1.15));
    const l = Math.max(light, 0.35);
    for (const mt of [m.mat, ...(m.extraMats || [])]) mt.color.setRGB(this.hurtTime > 0 ? l * 2 : l, this.hurtTime > 0 ? l * 0.4 : l, this.hurtTime > 0 ? l * 0.4 : l);
    if (this.dead) {
      m.inner.rotation.z = 0;
      m.root.position.y += this.deathTime * 0.4;
    }
    // Healing beam to a crystal
    const g = this.game;
    if (this.healTarget && !this.healTarget.dead && !this.dead) {
      if (!this.beam) {
        this.beam = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xff80ff }));
        g.scene.add(this.beam);
      }
      const a = this.pos.clone().add(new THREE.Vector3(0, 2, 0)), b = this.healTarget.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
      this.beam.geometry.setFromPoints([a, b]);
      this.beam.visible = true;
    } else if (this.beam) this.beam.visible = false;
  },
});

// Dragon and crystal hit boxes
const _rayHit = Mob.prototype.rayHit;
Mob.prototype.rayHit = function (origin, dir, maxDist) {
  if (this.type === 'dragon') {
    const c = this.pos;
    return rayAABB(origin, dir, c.x - 5, c.y, c.z - 5, c.x + 5, c.y + 4.5, c.z + 5, maxDist);
  }
  if (this.type === 'crystal') {
    const c = this.pos;
    return rayAABB(origin, dir, c.x - 1, c.y + 0.4, c.z - 1, c.x + 1, c.y + 2.2, c.z + 1, maxDist);
  }
  return _rayHit.call(this, origin, dir, maxDist);
};
const _dispose = Mob.prototype.dispose;
Mob.prototype.dispose = function () {
  if (this.beam) { this.game.scene.remove(this.beam); this.beam.geometry.dispose(); this.beam = null; }
  if (this.model.extraMats) for (const m of this.model.extraMats) m.dispose();
  _dispose.call(this);
};

// ---------------------------------------------------------------- boats
class Boat {
  constructor(game, x, y, z, yaw) {
    this.game = game;
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.yaw = yaw;
    this.w = 1.3; this.h = 0.5; this.onGround = false;
    this.hits = 0;
    this.model = buildModel('boat');
    game.scene.add(this.model.root);
  }
  dispose() { this.game.scene.remove(this.model.root); this.model.mat.dispose(); }
  update(dt, rider) {
    const w = this.game.world;
    const bx = Math.floor(this.pos.x), bz = Math.floor(this.pos.z);
    let water = false, surface = 0;
    for (let y = Math.floor(this.pos.y + 0.6); y >= Math.floor(this.pos.y - 0.4); y--) {
      const id = w.getBlock(bx, y, bz);
      if (isWater(id)) { water = true; surface = y + fluidHeight(id); break; }
    }
    if (rider) {
      const k = rider.keys;
      const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 0.5 : 0);
      const turn = (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) - (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0);
      this.yaw += turn * dt * 2.2;
      const sp = (water ? 8 : 1.2) * fwd;
      this.vel.x += (-Math.sin(this.yaw) * sp - this.vel.x) * Math.min(1, dt * (water ? 1.2 : 4));
      this.vel.z += (-Math.cos(this.yaw) * sp - this.vel.z) * Math.min(1, dt * (water ? 1.2 : 4));
    } else {
      this.vel.x *= Math.pow(water ? 0.3 : 0.01, dt);
      this.vel.z *= Math.pow(water ? 0.3 : 0.01, dt);
    }
    if (water) this.vel.y += ((surface - 0.3 - this.pos.y) * 6 - this.vel.y) * Math.min(1, dt * 4);
    else this.vel.y -= 20 * dt;
    moveBody(w, this, dt, { stepHeight: 0.4 });
    this.model.root.position.copy(this.pos);
    this.model.inner.rotation.y = this.yaw;
    const l = this.game.lightAt(this.pos.x, this.pos.y + 0.5, this.pos.z);
    this.model.mat.color.setRGB(l, l, l);
  }
  rayHit(origin, dir, maxDist) {
    return rayAABB(origin, dir, this.pos.x - 0.7, this.pos.y, this.pos.z - 0.7, this.pos.x + 0.7, this.pos.y + 0.6, this.pos.z + 0.7, maxDist);
  }
}
