// Mobs, dropped items, other players and particles.
'use strict';

const MOB_TYPES = ['pig', 'cow', 'sheep', 'chicken', 'zombie', 'creeper'];
const MOB_INFO = {
  pig: { health: 10, speed: 1.4, hostile: false },
  cow: { health: 10, speed: 1.3, hostile: false },
  sheep: { health: 8, speed: 1.3, hostile: false },
  chicken: { health: 4, speed: 1.3, hostile: false },
  zombie: { health: 20, speed: 2.4, hostile: true },
  creeper: { health: 20, speed: 2.1, hostile: true },
};
function mobDrops(type, r) {
  const n = (a, b) => a + Math.floor(r() * (b - a + 1));
  switch (type) {
    case 'pig': return [[ITEM.PORK_RAW, n(1, 3)]];
    case 'cow': return [[ITEM.BEEF_RAW, n(1, 3)], [ITEM.LEATHER, n(0, 2)]];
    case 'sheep': return [[B.WOOL_WHITE, 1]];
    case 'chicken': return [[ITEM.CHICKEN_RAW, 1], [ITEM.FEATHER, n(0, 2)]];
    case 'zombie': return [[ITEM.ROTTEN_FLESH, n(0, 2)]];
    case 'creeper': return [[ITEM.GUNPOWDER, n(0, 2)]];
  }
  return [];
}

let nextEntityId = 1;

class Mob {
  constructor(game, type, x, y, z, id) {
    this.game = game;
    this.type = type;
    this.id = id || (nextEntityId++);
    this.info = MOB_INFO[type];
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.target = new THREE.Vector3(x, y, z); // remote interpolation target
    this.yaw = Math.random() * Math.PI * 2;
    this.targetYaw = this.yaw;
    this.headYaw = 0;
    this.model = buildModel(type);
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
    this.attackCooldown = 0;
    this.fuse = 0;
    this.burnTimer = 0;
    this.ambient = 5 + Math.random() * 15;
    this.swing = 0;
    this.lastHitBy = null;
    game.scene.add(this.model.root);
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
    this.vel.x = knockX / kl * 6; this.vel.z = knockZ / kl * 6; this.vel.y = 5;
    this.lastHitBy = attacker;
    if (!this.info.hostile) this.panic = 4;
    Sound.mobHurt(this.type);
    if (this.health <= 0) this.deathTime = 0;
    return true;
  }

  // Authoritative simulation (singleplayer or multiplayer host).
  simulate(dt) {
    const world = this.game.world;
    this.hurtTime = Math.max(0, this.hurtTime - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.swing = Math.max(0, this.swing - dt * 3);
    if (this.dead) {
      this.deathTime += dt;
      this.vel.x *= 0.9; this.vel.z *= 0.9;
      this.vel.y -= 32 * dt;
      moveBody(world, this, dt);
      return;
    }

    let dirX = 0, dirZ = 0, speed = 0;
    const target = this.info.hostile ? this.game.nearestTarget(this.pos, 32) : null;
    if (target) {
      const dx = target.pos.x - this.pos.x, dz = target.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      const dy = target.pos.y - this.pos.y;
      this.targetYaw = Math.atan2(-dx, -dz);
      if (this.type === 'creeper') {
        if (d < 3.2 && Math.abs(dy) < 3) {
          if (this.fuse === 0) Sound.fuse();
          this.fuse += dt;
        } else this.fuse = Math.max(0, this.fuse - dt);
        if (this.fuse >= 1.5) {
          this.deathTime = 99; // removed silently
          this.game.explode(this.pos.x, this.pos.y + 0.5, this.pos.z, 3, true);
          return;
        }
        if (this.fuse === 0) { dirX = dx / d; dirZ = dz / d; speed = this.info.speed; }
      } else {
        if (d > 1.0) { dirX = dx / d; dirZ = dz / d; speed = this.info.speed; }
        if (d < 1.6 && Math.abs(dy) < 1.6 && this.attackCooldown === 0) {
          this.attackCooldown = 1;
          this.swing = 1;
          const dmg = [0, 2, 3, 4][this.game.difficulty];
          this.game.damagePlayer(target, dmg, { x: dx / d * 5, z: dz / d * 5, y: 4 }, 'mob');
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
        if (Math.random() < 0.5) { const a = Math.random() * Math.PI * 2; this.wanderDir = [Math.cos(a), Math.sin(a)]; }
        else this.wanderDir = null;
        this.wanderTimer = 2 + Math.random() * 4;
      }
      if (this.wanderDir) {
        dirX = this.wanderDir[0]; dirZ = this.wanderDir[1];
        speed = speed || this.info.speed * 0.6;
        this.targetYaw = Math.atan2(-dirX, -dirZ);
        // Don't walk off cliffs or into water when calm
        const fx = Math.floor(this.pos.x + dirX * 0.8), fz = Math.floor(this.pos.z + dirZ * 0.8), fy = Math.floor(this.pos.y);
        if (this.panic <= 0 && (!isSolid(world.getBlock(fx, fy - 1, fz)) && !isSolid(world.getBlock(fx, fy - 2, fz)) || world.getBlock(fx, fy - 1, fz) === B.WATER)) {
          this.wanderDir = null; speed = 0;
        }
      }
    }

    // Turn smoothly
    let dy = this.targetYaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * Math.min(1, dt * 8);

    const inWater = boxInBlock(world, this.pos, this.w, this.h * 0.6, B.WATER);
    const ctrl = this.onGround ? 12 : 3;
    if (this.hurtTime < 0.25) {
      this.vel.x += (dirX * speed - this.vel.x) * Math.min(1, ctrl * dt);
      this.vel.z += (dirZ * speed - this.vel.z) * Math.min(1, ctrl * dt);
    }
    if (inWater) { this.vel.y += (2.5 - this.vel.y) * Math.min(1, 4 * dt); }
    else this.vel.y -= 32 * dt;
    const res = moveBody(world, this, dt);
    if ((res.hitX || res.hitZ) && this.onGround && speed > 0) this.vel.y = 8.6;

    const moving = Math.hypot(this.vel.x, this.vel.z);
    this.walkPhase += moving * dt * 4;
    this.walkAmount = Math.min(1, moving / 2);

    // Zombies burn in daylight
    if (this.type === 'zombie' && this.game.daylight > 0.75 && !inWater) {
      const l = world.getLight(Math.floor(this.pos.x), Math.floor(this.pos.y + 1.6), Math.floor(this.pos.z));
      if (l.sky >= 15) {
        this.burnTimer += dt;
        if (this.burnTimer >= 1) { this.burnTimer = 0; this.hurt(1, 0, 0, null); this.vel.set(0, this.vel.y, 0); }
      }
    }

    this.ambient -= dt;
    if (this.ambient <= 0) {
      this.ambient = 8 + Math.random() * 20;
      if (this.game.player.pos.distanceTo(this.pos) < 16) Sound.mob(this.type);
    }
    if (this.pos.y < -30) this.deathTime = 99;
  }

  // Non-authoritative: follow network state.
  follow(dt) {
    this.hurtTime = Math.max(0, this.hurtTime - dt);
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
    if (this.dead) {
      m.inner.rotation.z = Math.min(Math.PI / 2, this.deathTime * 4);
    }
    animateModel(m, this.type, this.walkPhase, this.walkAmount, 0, 0, this.swing);
    if (this.type === 'creeper') {
      const s = 1 + Math.min(this.fuse, 1.5) * 0.12;
      m.inner.scale.set(s, 1 + (s - 1) * 0.5, s);
    }
    const light = this.game.lightAt(this.pos.x, this.pos.y + this.h * 0.6, this.pos.z);
    if (this.hurtTime > 0 || this.dead) m.mat.color.setRGB(Math.max(0.6, light), light * 0.3, light * 0.3);
    else if (this.fuse > 0 && Math.floor(this.fuse * 8) % 2 === 0) m.mat.color.setRGB(1.6, 1.6, 1.6);
    else m.mat.color.setRGB(light, light, light);
  }

  // Ray / AABB intersection distance or null
  rayHit(origin, dir, maxDist) {
    const hw = this.w / 2 + 0.1;
    return rayAABB(origin, dir, this.pos.x - hw, this.pos.y, this.pos.z - hw, this.pos.x + hw, this.pos.y + this.h, this.pos.z + hw, maxDist);
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
    if (boxInBlock(world, this.pos, this.w, this.h, B.WATER)) this.vel.y += (1 - this.vel.y) * Math.min(1, dt * 3);
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
    m.root.visible = this.mode !== 'spectator';
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
    if (this.mode === 'spectator') return null;
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
