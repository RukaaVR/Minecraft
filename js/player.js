// First-person player: input, physics and collision.
'use strict';

const PLAYER_WIDTH = 0.6;
const PLAYER_HEIGHT = 1.8;
const EYE_HEIGHT = 1.62;

class Player {
  constructor(world) {
    this.world = world;
    this.pos = new THREE.Vector3(0, 80, 0); // feet position
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.flying = false;
    this.inWater = false;
    this.eyeInWater = false;
    this.keys = new Set();
    this.lastSpaceTap = 0;
    this.bobTime = 0;
  }

  get eye() {
    return new THREE.Vector3(this.pos.x, this.pos.y + EYE_HEIGHT, this.pos.z);
  }

  lookDir() {
    const cp = Math.cos(this.pitch);
    return new THREE.Vector3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  onKeyDown(code) {
    if (code === 'Space' && !this.keys.has('Space')) {
      const now = performance.now();
      if (now - this.lastSpaceTap < 300) { this.flying = !this.flying; this.vel.y = 0; }
      this.lastSpaceTap = now;
    }
    this.keys.add(code);
  }
  onKeyUp(code) { this.keys.delete(code); }

  collides(px, py, pz) {
    const w = PLAYER_WIDTH / 2;
    const x0 = Math.floor(px - w), x1 = Math.floor(px + w);
    const y0 = Math.floor(py), y1 = Math.floor(py + PLAYER_HEIGHT);
    const z0 = Math.floor(pz - w), z1 = Math.floor(pz + w);
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if (isSolid(this.world.getBlock(x, y, z))) return true;
    }
    return false;
  }

  // Does the player's box overlap the block at (x, y, z)?
  intersectsBlock(x, y, z) {
    const w = PLAYER_WIDTH / 2;
    return this.pos.x + w > x && this.pos.x - w < x + 1 &&
      this.pos.y + PLAYER_HEIGHT > y && this.pos.y < y + 1 &&
      this.pos.z + w > z && this.pos.z - w < z + 1;
  }

  moveAxis(axis, amount) {
    if (amount === 0) return;
    const p = this.pos;
    p[axis] += amount;
    if (!this.collides(p.x, p.y, p.z)) return;
    const w = PLAYER_WIDTH / 2, eps = 0.001;
    if (axis === 'y') {
      if (amount < 0) { p.y = Math.floor(p.y) + 1; this.onGround = true; }
      else p.y = Math.floor(p.y + PLAYER_HEIGHT) - PLAYER_HEIGHT - eps;
      this.vel.y = 0;
    } else {
      if (amount > 0) p[axis] = Math.floor(p[axis] + w) - w - eps;
      else p[axis] = Math.floor(p[axis] - w) + 1 + w + eps;
      this.vel[axis] = 0;
    }
    // Safety: if still stuck (e.g. spawned inside a block), undo the move.
    if (this.collides(p.x, p.y, p.z)) p[axis] -= amount;
  }

  update(dt) {
    const k = this.keys;
    const feetBlock = this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.4), Math.floor(this.pos.z));
    this.inWater = feetBlock === B.WATER;
    const eye = this.eye;
    this.eyeInWater = this.world.getBlock(Math.floor(eye.x), Math.floor(eye.y), Math.floor(eye.z)) === B.WATER;

    // Desired horizontal movement
    let fx = 0, fz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) fz -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fz += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) fx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) fx += 1;
    const len = Math.hypot(fx, fz);
    if (len > 0) { fx /= len; fz /= len; }
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wx = fx * cos + fz * sin;
    const wz = -fx * sin + fz * cos;

    const sprint = k.has('ShiftLeft') || k.has('ControlLeft') || k.has('ShiftRight');
    let speed = this.flying ? (sprint ? 22 : 11) : (sprint ? 5.8 : 4.3);
    if (this.inWater && !this.flying) speed *= 0.55;

    // Smooth acceleration
    const accel = this.onGround || this.flying ? 14 : 4;
    const t = Math.min(1, accel * dt);
    this.vel.x += (wx * speed - this.vel.x) * t;
    this.vel.z += (wz * speed - this.vel.z) * t;

    if (this.flying) {
      let vy = 0;
      if (k.has('Space')) vy += 1;
      if (k.has('KeyC') || k.has('KeyQ')) vy -= 1;
      this.vel.y += (vy * speed - this.vel.y) * Math.min(1, 12 * dt);
    } else if (this.inWater) {
      this.vel.y -= 10 * dt;
      if (k.has('Space')) this.vel.y += 22 * dt;
      this.vel.y = Math.max(-3, Math.min(3.5, this.vel.y));
    } else {
      this.vel.y -= 28 * dt;
      if (k.has('Space') && this.onGround) this.vel.y = 8.6;
      this.vel.y = Math.max(-50, this.vel.y);
    }

    // Integrate with sub-steps so fast falls never tunnel.
    const dist = Math.max(Math.abs(this.vel.x), Math.abs(this.vel.y), Math.abs(this.vel.z)) * dt;
    const steps = Math.max(1, Math.ceil(dist / 0.35));
    const sdt = dt / steps;
    this.onGround = false;
    for (let i = 0; i < steps; i++) {
      this.moveAxis('x', this.vel.x * sdt);
      this.moveAxis('z', this.vel.z * sdt);
      this.moveAxis('y', this.vel.y * sdt);
    }
    if (this.flying && this.onGround) this.flying = false;

    if (this.onGround && len > 0) this.bobTime += dt * speed * 1.6;

    if (this.pos.y < -20) { this.pos.y = 100; this.vel.set(0, 0, 0); }
  }
}
