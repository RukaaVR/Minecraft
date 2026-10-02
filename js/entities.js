// Mobs, dropped items, projectiles, other players and particles.
'use strict';

const MOB_TYPES = ['pig', 'cow', 'sheep', 'chicken', 'zombie', 'creeper', 'skeleton', 'spider', 'villager', 'piglin', 'ghast'];
const MOB_INFO = {
  pig: { health: 10, speed: 1.4, hostile: false },
  cow: { health: 10, speed: 1.3, hostile: false },
  sheep: { health: 8, speed: 1.3, hostile: false },
  chicken: { health: 4, speed: 1.3, hostile: false },
  zombie: { health: 20, speed: 2.4, hostile: true },
  creeper: { health: 20, speed: 2.1, hostile: true },
  skeleton: { health: 20, speed: 2.3, hostile: true },
  spider: { health: 16, speed: 3.2, hostile: true },
  villager: { health: 20, speed: 1.2, hostile: false, persistent: true },
  piglin: { health: 20, speed: 2.4, hostile: false, neutral: true },
  ghast: { health: 10, speed: 2.0, hostile: true, flying: true },
};
const PROFESSIONS = ['farmer', 'librarian', 'toolsmith', 'butcher', 'cleric', 'armorer'];
// [[costId, costCount], [cost2Id, cost2Count] | null, [resultId, resultCount]]
const TRADES = {
  farmer: [[[ITEM.WHEAT, 20], null, [ITEM.EMERALD, 1]], [[ITEM.EMERALD, 1], null, [ITEM.BREAD, 6]], [[B.PUMPKIN, 6], null, [ITEM.EMERALD, 1]], [[ITEM.EMERALD, 1], null, [ITEM.APPLE, 4]]],
  librarian: [[[B.BOOKSHELF, 1], null, [ITEM.EMERALD, 2]], [[ITEM.EMERALD, 9], null, [B.BOOKSHELF, 1]], [[ITEM.EMERALD, 1], null, [B.GLASS, 4]], [[ITEM.EMERALD, 2], null, [B.TORCH, 16]]],
  toolsmith: [[[ITEM.COAL, 15], null, [ITEM.EMERALD, 1]], [[ITEM.EMERALD, 3], null, [toolId(2, 0), 1]], [[ITEM.EMERALD, 3], null, [toolId(2, 1), 1]], [[ITEM.EMERALD, 1], [ITEM.STICK, 1], [hoeId(2), 1]]],
  butcher: [[[ITEM.PORK_RAW, 7], null, [ITEM.EMERALD, 1]], [[ITEM.CHICKEN_RAW, 14], null, [ITEM.EMERALD, 1]], [[ITEM.EMERALD, 1], null, [ITEM.PORK_COOKED, 5]], [[ITEM.EMERALD, 1], null, [ITEM.BEEF_COOKED, 5]]],
  cleric: [[[ITEM.ROTTEN_FLESH, 32], null, [ITEM.EMERALD, 1]], [[ITEM.EMERALD, 1], null, [B.GLOWSTONE, 2]], [[ITEM.GOLD_INGOT, 3], null, [ITEM.EMERALD, 1]], [[ITEM.EMERALD, 4], null, [ITEM.FLINT_STEEL, 1]]],
  armorer: [[[ITEM.IRON_INGOT, 4], null, [ITEM.EMERALD, 1]], [[ITEM.EMERALD, 5], null, [armorId(1, 0), 1]], [[ITEM.EMERALD, 9], null, [armorId(1, 1), 1]], [[ITEM.EMERALD, 7], null, [armorId(1, 2), 1]], [[ITEM.EMERALD, 4], null, [armorId(1, 3), 1]]],
};

function mobDrops(type, r) {
  const n = (a, b) => a + Math.floor(r() * (b - a + 1));
  switch (type) {
    case 'pig': return [[ITEM.PORK_RAW, n(1, 3)]];
    case 'cow': return [[ITEM.BEEF_RAW, n(1, 3)], [ITEM.LEATHER, n(0, 2)]];
    case 'sheep': return [[B.WOOL_WHITE, 1]];
    case 'chicken': return [[ITEM.CHICKEN_RAW, 1], [ITEM.FEATHER, n(0, 2)]];
    case 'zombie': return [[ITEM.ROTTEN_FLESH, n(0, 2)], r() < 0.025 ? [ITEM.IRON_INGOT, 1] : [0, 0]];
    case 'creeper': return [[ITEM.GUNPOWDER, n(0, 2)]];
    case 'skeleton': return [[ITEM.BONE, n(0, 2)], [ITEM.ARROW, n(0, 2)]];
    case 'spider': return [[ITEM.STRING, n(0, 2)]];
    case 'piglin': return [[ITEM.ROTTEN_FLESH, n(0, 1)], [ITEM.GOLD_NUGGET, n(0, 1)]];
    case 'ghast': return [[ITEM.GUNPOWDER, n(0, 2)]];
  }
  return [];
}

let nextEntityId = 1;

class Mob {
  constructor(game, type, x, y, z, id, extra = {}) {
    this.game = game;
    this.type = type;
    this.id = id || (nextEntityId++);
    this.info = MOB_INFO[type];
    this.profession = extra.profession || (type === 'villager' ? PROFESSIONS[Math.floor(Math.random() * PROFESSIONS.length)] : null);
    this.home = extra.home || null;
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.target = new THREE.Vector3(x, y, z); // remote interpolation target
    this.yaw = Math.random() * Math.PI * 2;
    this.targetYaw = this.yaw;
    this.model = buildModel(type === 'villager' ? 'villager_' + this.profession : type);
    if (type === 'piglin' || type === 'skeleton') this._giveWeapon(type === 'piglin' ? toolId(3, 3) : ITEM.BOW);
    this.w = this.model.width;
    this.h = this.model.height;
    this.health = this.info.health;
    this.onGround = false;
    this.hurtTime = 0;
    this.invuln = 0;
    this.deathTime = -1;
    this.walkPhase = 0;
    this.walkAmount = 0;
    this.wanderTimer = 0;
    this.wanderDir = null;
    this.panic = 0;
    this.attackCooldown = 1;
    this.fuse = 0;
    this.burnTimer = 0;
    this.angry = 0;
    this.ambient = 5 + Math.random() * 15;
    this.swing = 0;
    this.lastHitBy = null;
    this.flyTarget = null;
    game.scene.add(this.model.root);
  }

  _giveWeapon(id) {
    const cube = isCubeItem(id);
    const m = new THREE.Mesh(cube ? blockGeometry(id, 0.3) : itemGeometry(id, 0.55), this.game.entityMat);
    m.position.set(0, -0.6, 0.2);
    m.rotation.y = Math.PI / 2;
    if (this.model.parts.armR) this.model.parts.armR.add(m);
  }

  get dead() { return this.deathTime >= 0; }

  dispose() {
    this.game.scene.remove(this.model.root);
    this.model.mat.dispose();
  }

  hurt(amount, knockX, knockZ, attacker) {
    if (this.dead || this.invuln > 0) return false;
    this.health -= amount;
    this.hurtTime = 0.4;
    this.invuln = 0.5;
    const kl = Math.hypot(knockX, knockZ) || 1;
    if (!this.info.flying) { this.vel.x = knockX / kl * 6; this.vel.z = knockZ / kl * 6; this.vel.y = 5; }
    else { this.vel.x += knockX / kl * 3; this.vel.z += knockZ / kl * 3; }
    this.lastHitBy = attacker;
    if (!this.info.hostile && !this.info.neutral) this.panic = 4;
    if (this.info.neutral && attacker !== 'env') {
      // Zombified piglins anger the whole group nearby
      for (const m of this.game.mobs.values()) if (m.type === this.type && m.pos.distanceTo(this.pos) < 24) m.angry = 30;
    }
    Sound.mobHurt(this.type);
    if (this.health <= 0) this.deathTime = 0;
    return true;
  }

  canSee(p) {
    const eye = new THREE.Vector3(this.pos.x, this.pos.y + this.h * 0.85, this.pos.z);
    const to = new THREE.Vector3(p.x, p.y + 1.5, p.z).sub(eye);
    const d = to.length();
    const hit = this.game.world.raycast(eye, to.normalize(), d);
    return !hit || !isSolid(hit.id);
  }

  // Authoritative simulation (singleplayer or multiplayer host).
  simulate(dt) {
    const world = this.game.world;
    this.hurtTime = Math.max(0, this.hurtTime - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.swing = Math.max(0, this.swing - dt * 3);
    this.angry = Math.max(0, this.angry - dt);
    if (this.dead) {
      this.deathTime += dt;
      this.vel.x *= 0.9; this.vel.z *= 0.9;
      if (!this.info.flying) this.vel.y -= 32 * dt; else this.vel.y = -1;
      moveBody(world, this, dt);
      return;
    }
    if (this.info.flying) { this.simulateFlying(dt); return; }

    let dirX = 0, dirZ = 0, speed = 0;
    const hostileNow = this.info.hostile || (this.info.neutral && this.angry > 0) ||
      (this.type === 'spider' && false);
    const target = hostileNow ? this.game.nearestTarget(this.pos, this.type === 'skeleton' ? 20 : 32) : null;
    if (target) {
      const dx = target.pos.x - this.pos.x, dz = target.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz) || 0.01;
      const dy = target.pos.y - this.pos.y;
      this.targetYaw = Math.atan2(-dx, -dz);
      if (this.type === 'creeper') {
        if (d < 3.2 && Math.abs(dy) < 3) {
          if (this.fuse === 0) Sound.fuse();
          this.fuse += dt;
        } else this.fuse = Math.max(0, this.fuse - dt);
        if (this.fuse >= 1.5) {
          this.deathTime = 99;
          this.game.explode(this.pos.x, this.pos.y + 0.5, this.pos.z, 3, true);
          return;
        }
        if (this.fuse === 0) { dirX = dx / d; dirZ = dz / d; speed = this.info.speed; }
      } else if (this.type === 'skeleton') {
        // keep some distance and shoot
        const see = this.canSee(target.pos);
        if (d > 10 || !see) { dirX = dx / d; dirZ = dz / d; speed = this.info.speed; }
        else if (d < 5) { dirX = -dx / d; dirZ = -dz / d; speed = this.info.speed * 0.8; }
        if (see && d < 16 && this.attackCooldown === 0) {
          this.attackCooldown = 2;
          this.swing = 1;
          const from = new THREE.Vector3(this.pos.x, this.pos.y + 1.5, this.pos.z);
          const to = new THREE.Vector3(target.pos.x, target.pos.y + 1.2 + d * 0.06, target.pos.z);
          const v = to.sub(from).normalize().multiplyScalar(26);
          v.x += (Math.random() - 0.5) * 2; v.z += (Math.random() - 0.5) * 2;
          this.game.spawnProjectile('arrow', from, v, { owner: this, damage: [0, 2, 3, 4][this.game.difficulty] });
          Sound.noise(1800, 2, 0.15, 0.25);
        }
      } else {
        if (d > 1.0) { dirX = dx / d; dirZ = dz / d; speed = this.info.speed; }
        if (this.type === 'spider' && d < 4 && d > 1.5 && this.onGround && Math.random() < dt * 2) { this.vel.y = 6; this.vel.x += dirX * 4; this.vel.z += dirZ * 4; }
        const reach = this.type === 'spider' ? 1.8 : 1.6;
        if (d < reach && Math.abs(dy) < 1.8 && this.attackCooldown === 0) {
          this.attackCooldown = 1;
          this.swing = 1;
          const base = this.type === 'piglin' ? [0, 5, 8, 12] : this.type === 'spider' ? [0, 2, 2, 3] : [0, 2, 3, 4];
          this.game.damagePlayer(target, base[this.game.difficulty], { x: dx / d * 5, z: dz / d * 5, y: 4 }, 'mob');
        }
      }
    } else {
      this.fuse = Math.max(0, this.fuse - dt);
      this.wanderTimer -= dt;
      if (this.panic > 0) {
        this.panic -= dt;
        if (this.wanderTimer <= 0 || !this.wanderDir) {
          const a = Math.random() * Math.PI * 2; this.wanderDir = [Math.cos(a), Math.sin(a)]; this.wanderTimer = 1;
        }
        speed = this.info.speed * 1.8;
      } else if (this.wanderTimer <= 0) {
        if (Math.random() < 0.5) {
          let a = Math.random() * Math.PI * 2;
          // Villagers stay near their village
          if (this.home && Math.hypot(this.pos.x - this.home[0], this.pos.z - this.home[2]) > 24) a = Math.atan2(this.home[2] - this.pos.z, this.home[0] - this.pos.x);
          this.wanderDir = [Math.cos(a), Math.sin(a)];
        } else this.wanderDir = null;
        this.wanderTimer = 2 + Math.random() * 4;
      }
      if (this.wanderDir) {
        dirX = this.wanderDir[0]; dirZ = this.wanderDir[1];
        speed = speed || this.info.speed * 0.6;
        this.targetYaw = Math.atan2(-dirX, -dirZ);
        const fx = Math.floor(this.pos.x + dirX * 0.8), fz = Math.floor(this.pos.z + dirZ * 0.8), fy = Math.floor(this.pos.y);
        const below = world.getBlock(fx, fy - 1, fz);
        if (this.panic <= 0 && ((!isSolid(below) && !isSolid(world.getBlock(fx, fy - 2, fz))) || FLUID[below])) {
          this.wanderDir = null; speed = 0;
        }
      }
      // Villagers turn to look at nearby players
      if (this.type === 'villager' && !this.wanderDir) {
        const p = this.game.player;
        if (p && p.pos.distanceTo(this.pos) < 6) this.targetYaw = Math.atan2(-(p.pos.x - this.pos.x), -(p.pos.z - this.pos.z));
      }
    }

    let dyaw = this.targetYaw - this.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    this.yaw += dyaw * Math.min(1, dt * 8);

    const inWater = boxInBlock(world, this.pos, this.w, this.h * 0.6, isWater);
    const inLava = boxInBlock(world, this.pos, this.w, this.h * 0.6, isLava);
    const ctrl = this.onGround ? 12 : 3;
    if (this.hurtTime < 0.25) {
      this.vel.x += (dirX * speed - this.vel.x) * Math.min(1, ctrl * dt);
      this.vel.z += (dirZ * speed - this.vel.z) * Math.min(1, ctrl * dt);
    }
    if (inWater || inLava) { this.vel.y += (2.5 - this.vel.y) * Math.min(1, 4 * dt); }
    else this.vel.y -= 32 * dt;
    const res = moveBody(world, this, dt);
    if ((res.hitX || res.hitZ) && this.onGround && speed > 0) this.vel.y = 8.6;

    const moving = Math.hypot(this.vel.x, this.vel.z);
    this.walkPhase += moving * dt * 4;
    this.walkAmount = Math.min(1, moving / 2);

    // Undead burn in daylight; everything burns in lava
    if ((this.type === 'zombie' || this.type === 'skeleton') && this.game.daylight > 0.75 && !inWater && world.dim === 0) {
      const l = world.getLight(Math.floor(this.pos.x), Math.floor(this.pos.y + 1.6), Math.floor(this.pos.z));
      if (l.sky >= 15) {
        this.burnTimer += dt;
        if (this.burnTimer >= 1) { this.burnTimer = 0; this.hurt(1, 0, 0, 'env'); this.vel.set(0, this.vel.y, 0); }
      }
    }
    if (inLava && this.type !== 'piglin') {
      this.burnTimer += dt;
      if (this.burnTimer >= 0.5) { this.burnTimer = 0; this.hurt(4, 0, 0, 'env'); }
    }

    this.ambient -= dt;
    if (this.ambient <= 0) {
      this.ambient = 8 + Math.random() * 20;
      if (this.game.player.pos.distanceTo(this.pos) < 16) Sound.mob(this.type);
    }
    if (this.pos.y < -30) this.deathTime = 99;
  }

  // Ghasts drift around and shoot fireballs at players they can see.
  simulateFlying(dt) {
    const world = this.game.world;
    const target = this.game.nearestTarget(this.pos, 64);
    if (!this.flyTarget || this.pos.distanceTo(this.flyTarget) < 2 || Math.random() < dt * 0.1) {
      this.flyTarget = new THREE.Vector3(this.pos.x + (Math.random() - 0.5) * 32, this.pos.y + (Math.random() - 0.5) * 12, this.pos.z + (Math.random() - 0.5) * 32);
      this.flyTarget.y = Math.max(40, Math.min(110, this.flyTarget.y));
    }
    const d = this.flyTarget.clone().sub(this.pos);
    const len = d.length() || 1;
    this.vel.lerp(d.multiplyScalar(this.info.speed / len), Math.min(1, dt));
    const res = moveBody(world, this, dt, { stepHeight: 0 });
    if (res.hitX || res.hitZ || this.onGround) this.flyTarget = null;
    if (target && this.canSee(target.pos)) {
      const dx = target.pos.x - this.pos.x, dz = target.pos.z - this.pos.z;
      this.targetYaw = Math.atan2(-dx, -dz);
      if (this.attackCooldown === 0) {
        this.attackCooldown = 3;
        this.swing = 1;
        Sound.tone(200, 0.6, 0.25, 'sawtooth', 300);
        const from = new THREE.Vector3(this.pos.x, this.pos.y + 2, this.pos.z);
        const v = new THREE.Vector3(target.pos.x, target.pos.y + 1, target.pos.z).sub(from).normalize().multiplyScalar(14);
        from.addScaledVector(v.clone().normalize(), 2.6);
        this.game.spawnProjectile('fireball', from, v, { owner: this });
      }
    } else {
      this.targetYaw = Math.atan2(-this.vel.x, -this.vel.z);
    }
    let dyaw = this.targetYaw - this.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    this.yaw += dyaw * Math.min(1, dt * 3);
    this.walkPhase += dt * 6;
    this.ambient -= dt;
    if (this.ambient <= 0) { this.ambient = 6 + Math.random() * 10; if (this.game.player.pos.distanceTo(this.pos) < 40) Sound.tone(500, 0.8, 0.15, 'triangle', -300); }
  }

  // Non-authoritative: follow network state.
  follow(dt) {
    this.hurtTime = Math.max(0, this.hurtTime - dt);
    this.swing = Math.max(0, this.swing - dt * 3);
    const before = this.pos.clone();
    this.pos.lerp(this.target, Math.min(1, dt * 10));
    let dy = this.targetYaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * Math.min(1, dt * 10);
    const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z) / Math.max(dt, 1e-4);
    this.walkPhase += moved * dt * 4;
    this.walkAmount = Math.min(1, moved / 2);
    if (this.dead) this.deathTime += dt;
  }

  render() {
    const m = this.model;
    m.root.position.copy(this.pos);
    m.inner.rotation.y = this.yaw + Math.PI;
    if (this.dead) m.inner.rotation.z = Math.min(Math.PI / 2, this.deathTime * 4);
    const animType = this.type === 'villager' ? 'villager' : this.type;
    animateModel(m, animType, this.walkPhase, this.walkAmount, 0, 0, this.swing);
    if (this.type === 'creeper') {
      const s = 1 + Math.min(this.fuse, 1.5) * 0.12;
      m.inner.scale.set(s, 1 + (s - 1) * 0.5, s);
    }
    let light = this.game.lightAt(this.pos.x, this.pos.y + Math.min(this.h, 2) * 0.6, this.pos.z);
    if (this.type === 'ghast') light = Math.max(light, this.game.lightAt(this.pos.x, this.pos.y + 1, this.pos.z) * 1.2);
    if (this.hurtTime > 0 || this.dead) m.mat.color.setRGB(Math.max(0.6 * light * 2, light), light * 0.3, light * 0.3);
    else if (this.fuse > 0 && Math.floor(this.fuse * 8) % 2 === 0) m.mat.color.setRGB(light * 2.5, light * 2.5, light * 2.5);
    else m.mat.color.setRGB(light, light, light);
  }

  rayHit(origin, dir, maxDist) {
    const hw = this.w / 2 + 0.1;
    return rayAABB(origin, dir, this.pos.x - hw, this.pos.y, this.pos.z - hw, this.pos.x + hw, this.pos.y + this.h, this.pos.z + hw, maxDist);
  }
}

// Arrows and fireballs
class Projectile {
  constructor(game, kind, pos, vel, opts = {}) {
    this.game = game;
    this.kind = kind;
    this.pos = pos.clone();
    this.vel = vel.clone();
    this.owner = opts.owner || null;     // Mob or 'player'
    this.damage = opts.damage || 0;
    this.fromPlayer = opts.owner === 'player';
    this.age = 0;
    this.stuck = false;
    this.remote = !!opts.remote;         // display only (from the network)
    const id = kind === 'arrow' ? ITEM.ARROW : null;
    if (kind === 'arrow') {
      this.mesh = new THREE.Mesh(itemGeometry(id, 0.7), game.entityMat);
    } else {
      const g = new THREE.BoxGeometry(0.9, 0.9, 0.9);
      const [u0, v0, u1, v1] = tileUV(T.ITEM2 + 37);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
      this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: game.atlas, color: 0xffffff }));
    }
    game.scene.add(this.mesh);
  }
  dispose() {
    this.game.scene.remove(this.mesh);
    if (this.kind !== 'arrow') { this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
  }
  // Returns false when the projectile should be removed.
  update(dt) {
    const g = this.game, world = g.world;
    this.age += dt;
    if (this.stuck) { return this.age < 30; }
    if (this.kind === 'arrow') { this.vel.y -= 20 * dt; this.vel.multiplyScalar(Math.pow(0.99, dt * 20)); }
    const step = this.vel.clone().multiplyScalar(dt);
    const len = step.length();
    const dir = step.clone().normalize();
    if (!this.remote) {
      // Entity hits
      const candidates = [];
      for (const m of g.mobs.values()) if (m !== this.owner && !m.dead) candidates.push(m);
      if (!this.fromPlayer && g.player && !g.player.dead && g.player.mode !== 'spectator') candidates.push('local');
      if (this.fromPlayer) for (const rp of g.remotePlayers.values()) candidates.push(rp);
      for (const c of candidates) {
        let t;
        if (c === 'local') {
          const p = g.player.pos;
          t = rayAABB(this.pos, dir, p.x - 0.4, p.y, p.z - 0.4, p.x + 0.4, p.y + 1.8, p.z + 0.4, len);
        } else t = c.rayHit(this.pos, dir, len);
        if (t === null) continue;
        this.onHitEntity(c, dir);
        return false;
      }
    }
    const hit = world.raycast(this.pos, dir, len);
    if (hit && isSolid(hit.id)) {
      this.pos.addScaledVector(dir, Math.max(0, hit.dist - 0.05));
      if (this.kind === 'fireball') {
        if (!this.remote && g.isAuthority) g.explode(this.pos.x, this.pos.y, this.pos.z, 1, true);
        return false;
      }
      this.stuck = true;
      this.age = 0;
      Sound.noise(900, 2, 0.1, 0.2);
      if (this.fromPlayer && !this.remote) {
        g.spawnItem(stackOf(ITEM.ARROW, 1), this.pos.x, this.pos.y, this.pos.z, new THREE.Vector3());
        return false;
      }
    } else {
      this.pos.add(step);
    }
    this.mesh.position.copy(this.pos);
    if (this.kind === 'arrow') {
      this.mesh.lookAt(this.pos.clone().add(this.vel));
      this.mesh.rotateY(Math.PI / 2);
      this.mesh.rotateZ(-Math.PI / 4);
    } else this.mesh.rotation.y += dt * 4;
    return this.age < 20 && this.pos.y > -20;
  }
  onHitEntity(c, dir) {
    const g = this.game;
    if (this.kind === 'fireball') {
      if (g.isAuthority) g.explode(this.pos.x, this.pos.y, this.pos.z, 1, true);
      return;
    }
    const speed = this.vel.length();
    const dmg = this.damage || Math.max(1, Math.ceil(speed / 30 * 9));
    if (c === 'local') g.player.damage(dmg, 'arrow', { x: dir.x * 4, y: 3, z: dir.z * 4 });
    else if (c instanceof RemotePlayer) g.net.send('hurt', { to: c.peer, dmg, kx: dir.x * 4, ky: 3, kz: dir.z * 4 });
    else if (c instanceof Mob) {
      if (g.isAuthority) { if (c.hurt(dmg, dir.x, dir.z, null) && c.dead) g.onMobKilled(c, null); }
      else { c.hurtTime = 0.4; g.net.send('hitmob', { id: c.id, dmg, kx: dir.x, kz: dir.z }); }
    }
    Sound.noise(1200, 1, 0.12, 0.3);
  }
}

function rayAABB(o, d, x0, y0, z0, x1, y1, z1, maxDist) {
  let tmin = 0, tmax = maxDist;
  for (const [oa, da, a0, a1] of [[o.x, d.x, x0, x1], [o.y, d.y, y0, y1], [o.z, d.z, z0, z1]]) {
    if (Math.abs(da) < 1e-9) { if (oa < a0 || oa > a1) return null; continue; }
    let t0 = (a0 - oa) / da, t1 = (a1 - oa) / da;
    if (t0 > t1) [t0, t1] = [t1, t0];
    tmin = Math.max(tmin, t0); tmax = Math.min(tmax, t1);
    if (tmin > tmax) return null;
  }
  return tmin;
}

class ItemEntity {
  constructor(game, stack, x, y, z, vel) {
    this.game = game;
    this.stack = stack;
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = vel ? vel.clone() : new THREE.Vector3((Math.random() - 0.5) * 3, 3 + Math.random() * 2, (Math.random() - 0.5) * 3);
    this.w = 0.25; this.h = 0.25;
    this.onGround = false;
    this.age = 0;
    this.pickupDelay = 0.6;
    this.spin = Math.random() * Math.PI * 2;
    const cube = isCubeItem(stack.id);
    this.mesh = new THREE.Mesh(cube ? blockGeometry(stack.id, 0.25) : itemGeometry(stack.id, 0.4), game.entityMat.clone());
    game.scene.add(this.mesh);
  }
  dispose() {
    this.game.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
  update(dt) {
    this.age += dt;
    this.pickupDelay -= dt;
    const world = this.game.world;
    if (boxInBlock(world, this.pos, this.w, this.h, isLava)) { this.age = 1e9; return; }
    if (boxInBlock(world, this.pos, this.w, this.h, isWater)) this.vel.y += (1 - this.vel.y) * Math.min(1, dt * 3);
    else this.vel.y -= 20 * dt;
    if (this.onGround) { this.vel.x *= Math.pow(0.02, dt); this.vel.z *= Math.pow(0.02, dt); }
    moveBody(world, this, dt);
    // Pushed out if stuck in a block
    if (boxCollides(world, this.pos.x, this.pos.y, this.pos.z, this.w, this.h)) this.pos.y += dt * 4;
    this.spin += dt * 1.5;
    this.mesh.position.set(this.pos.x, this.pos.y + 0.18 + Math.sin(this.age * 2.5) * 0.05, this.pos.z);
    this.mesh.rotation.y = this.spin;
    const l = this.game.lightAt(this.pos.x, this.pos.y + 0.2, this.pos.z);
    this.mesh.material.color.setRGB(l, l, l);
  }
}

class RemotePlayer {
  constructor(game, peer, name) {
    this.game = game;
    this.peer = peer;
    this.name = name;
    this.model = buildModel('player');
    this.pos = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.yaw = 0; this.targetYaw = 0; this.pitch = 0;
    this.walkPhase = 0; this.walkAmount = 0;
    this.swing = 0; this.lastSwingCount = 0;
    this.held = 0;
    this.mode = 'survival';
    this.sneak = false;
    this.dim = 0;
    this.hurtTime = 0;
    this.w = 0.6; this.h = 1.8;
    this.tag = makeNameTag(name);
    this.tag.position.y = 2.1;
    this.model.root.add(this.tag);
    this.heldMesh = null;
    this.first = true;
    game.scene.add(this.model.root);
  }
  setName(name) {
    if (name === this.name) return;
    this.name = name;
    this.model.root.remove(this.tag);
    this.tag = makeNameTag(name);
    this.tag.position.y = 2.1;
    this.model.root.add(this.tag);
  }
  applyState(s) {
    if (!s || !Array.isArray(s.p)) return;
    this.target.set(+s.p[0] || 0, +s.p[1] || 0, +s.p[2] || 0);
    if (this.first) { this.pos.copy(this.target); this.first = false; }
    if (Array.isArray(s.r)) { this.targetYaw = +s.r[0] || 0; this.pitch = +s.r[1] || 0; }
    if (typeof s.n === 'string') this.setName(s.n.slice(0, 24));
    if (typeof s.m === 'string') this.mode = s.m;
    this.sneak = !!s.k;
    this.dim = s.d === 1 ? 1 : 0;
    if (typeof s.s === 'number' && s.s !== this.lastSwingCount) { this.lastSwingCount = s.s; this.swing = 1; }
    const held = +s.h || 0;
    if (held !== this.held) this.setHeld(held);
  }
  setHeld(id) {
    this.held = id;
    if (this.heldMesh) { this.model.parts.armR.remove(this.heldMesh); this.heldMesh.geometry.dispose(); this.heldMesh = null; }
    if (!id || !ITEMS[id]) return;
    const cube = isCubeItem(id);
    this.heldMesh = new THREE.Mesh(cube ? blockGeometry(id, 0.3) : itemGeometry(id, 0.5), this.game.entityMat);
    this.heldMesh.position.set(0, -0.6, cube ? 0.2 : 0.25);
    if (!cube) this.heldMesh.rotation.y = Math.PI / 2;
    this.model.parts.armR.add(this.heldMesh);
  }
  update(dt) {
    const before = this.pos.clone();
    this.pos.lerp(this.target, Math.min(1, dt * 12));
    let dy = this.targetYaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * Math.min(1, dt * 12);
    const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z) / Math.max(dt, 1e-4);
    this.walkPhase += moved * dt * 2.5;
    this.walkAmount += (Math.min(1, moved / 3) - this.walkAmount) * Math.min(1, dt * 10);
    this.swing = Math.max(0, this.swing - dt * 4);
    this.hurtTime = Math.max(0, this.hurtTime - dt);
    const m = this.model;
    m.root.visible = this.mode !== 'spectator' && this.dim === this.game.world.dim;
    m.root.position.copy(this.pos);
    if (this.sneak) m.root.position.y -= 0.15;
    m.inner.rotation.y = this.yaw + Math.PI;
    m.parts.body.rotation.x = this.sneak ? 0.4 : 0;
    animateModel(m, 'player', this.walkPhase, this.walkAmount, 0, this.pitch, this.swing);
    const l = this.game.lightAt(this.pos.x, this.pos.y + 1.5, this.pos.z);
    if (this.hurtTime > 0) m.mat.color.setRGB(Math.max(0.6, l), l * 0.3, l * 0.3);
    else m.mat.color.setRGB(l, l, l);
  }
  rayHit(origin, dir, maxDist) {
    if (this.mode === 'spectator' || this.dim !== this.game.world.dim) return null;
    return rayAABB(origin, dir, this.pos.x - 0.4, this.pos.y, this.pos.z - 0.4, this.pos.x + 0.4, this.pos.y + 1.8, this.pos.z + 0.4, maxDist);
  }
  dispose() {
    this.game.scene.remove(this.model.root);
    this.model.mat.dispose();
  }
}

class Particles {
  constructor(game) {
    this.game = game;
    this.list = [];
  }
  burst(x, y, z, id, n = 14) {
    if (!BLOCKS[id] && !ITEMS[id]) return;
    for (let i = 0; i < n; i++) {
      const geo = id < 256 && BLOCKS[id].model === 'cube'
        ? blockGeometry(id, 0.12, [Math.random() * 0.75, Math.random() * 0.75, 0.25])
        : itemGeometry(id, 0.12);
      const m = new THREE.Mesh(geo, this.game.entityMat);
      m.position.set(x + 0.2 + Math.random() * 0.6, y + 0.2 + Math.random() * 0.6, z + 0.2 + Math.random() * 0.6);
      this.game.scene.add(m);
      this.list.push({
        mesh: m, life: 0.5 + Math.random() * 0.5,
        vel: new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 4 + 1, (Math.random() - 0.5) * 4),
      });
    }
  }
  smoke(x, y, z, n = 30) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.game.smokeGeo, this.game.smokeMat);
      m.position.set(x + (Math.random() - 0.5) * 3, y + (Math.random() - 0.5) * 3, z + (Math.random() - 0.5) * 3);
      const s = 0.3 + Math.random() * 0.6; m.scale.set(s, s, s);
      this.game.scene.add(m);
      this.list.push({ mesh: m, life: 0.6 + Math.random() * 0.8, vel: new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2), smoke: true });
    }
  }
  update(dt) {
    const world = this.game.world;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (!p.smoke) p.vel.y -= 18 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (!p.smoke) {
        const bx = Math.floor(p.mesh.position.x), by = Math.floor(p.mesh.position.y - 0.06), bz = Math.floor(p.mesh.position.z);
        if (isSolid(world.getBlock(bx, by, bz)) && p.vel.y < 0) {
          p.mesh.position.y = by + 1.06; p.vel.set(p.vel.x * 0.5, 0, p.vel.z * 0.5);
        }
      }
      if (p.life <= 0) {
        this.game.scene.remove(p.mesh);
        if (!p.smoke) p.mesh.geometry.dispose();
        this.list.splice(i, 1);
      }
    }
  }
  clear() {
    for (const p of this.list) { this.game.scene.remove(p.mesh); if (!p.smoke) p.mesh.geometry.dispose(); }
    this.list = [];
  }
}
