// Axis-aligned box physics shared by the player, mobs and dropped items.
'use strict';

function boxCollides(world, px, py, pz, w, h) {
  const hw = w / 2;
  const x0 = Math.floor(px - hw), x1 = Math.floor(px + hw);
  const y0 = Math.floor(py), y1 = Math.floor(py + h);
  const z0 = Math.floor(pz - hw), z1 = Math.floor(pz + hw);
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    if (isSolid(world.getBlock(x, y, z))) return true;
  }
  return false;
}

function boxInBlock(world, pos, w, h, id) {
  const hw = w / 2;
  for (let y = Math.floor(pos.y); y <= Math.floor(pos.y + h); y++)
    for (let z = Math.floor(pos.z - hw); z <= Math.floor(pos.z + hw); z++)
      for (let x = Math.floor(pos.x - hw); x <= Math.floor(pos.x + hw); x++)
        if (world.getBlock(x, y, z) === id) return true;
  return false;
}

// Moves body = {pos, vel, w, h, onGround} by vel*dt with collision.
// Returns {hitX, hitZ, landed, fallVel}.
function moveBody(world, body, dt, opts = {}) {
  const res = { hitX: false, hitZ: false, landed: false, fallVel: 0 };
  if (opts.noclip) {
    body.pos.addScaledVector(body.vel, dt);
    body.onGround = false;
    return res;
  }
  const w = body.w, h = body.h, hw = w / 2, eps = 0.001;
  const dist = Math.max(Math.abs(body.vel.x), Math.abs(body.vel.y), Math.abs(body.vel.z)) * dt;
  const steps = Math.max(1, Math.ceil(dist / 0.3));
  const sdt = dt / steps;
  const wasOnGround = body.onGround;
  body.onGround = false;
  const p = body.pos;

  const moveAxis = (axis, amount) => {
    if (amount === 0) return;
    const before = p[axis];
    p[axis] += amount;
    // Sneaking: don't walk off edges.
    if (opts.sneak && wasOnGround && axis !== 'y' && !boxCollides(world, p.x, p.y - 0.1, p.z, w, 0.05)) {
      p[axis] = before;
      body.vel[axis] = 0;
      return;
    }
    if (!boxCollides(world, p.x, p.y, p.z, w, h)) return;
    if (axis === 'y') {
      if (amount < 0) {
        p.y = Math.floor(p.y) + 1;
        body.onGround = true;
        res.landed = true;
        res.fallVel = body.vel.y;
      } else p.y = Math.floor(p.y + h) - h - eps;
      body.vel.y = 0;
    } else {
      // Step up half-slabs is not a thing here; try auto-jump-free resolution.
      if (amount > 0) p[axis] = Math.floor(p[axis] + hw) - hw - eps;
      else p[axis] = Math.floor(p[axis] - hw) + 1 + hw + eps;
      body.vel[axis] = 0;
      if (axis === 'x') res.hitX = true; else res.hitZ = true;
    }
    if (boxCollides(world, p.x, p.y, p.z, w, h)) p[axis] = before;
  };

  for (let i = 0; i < steps; i++) {
    moveAxis('x', body.vel.x * sdt);
    moveAxis('z', body.vel.z * sdt);
    moveAxis('y', body.vel.y * sdt);
  }
  // Ground check when standing still
  if (!body.onGround && body.vel.y <= 0 && boxCollides(world, p.x, p.y - 0.01, p.z, w, 0.005)) body.onGround = true;
  return res;
}
