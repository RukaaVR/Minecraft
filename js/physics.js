// Axis-aligned box physics shared by the player, mobs and dropped items.
// Uses Minecraft's approach: gather the collision boxes around the mover and
// clip the movement along each axis in turn (Y, then X, then Z).
'use strict';

// Collision boxes of the block at (x, y, z) in world coordinates.
function blockBoxes(world, x, y, z, id, out) {
  const b = BLOCKS[id];
  if (!b || !b.solid) return;
  if (b.model === 'door') {
    const lowerY = id === B.DOOR_UPPER ? y - 1 : y;
    const d = world.getData(x, lowerY, z) || {};
    const [b0, b1] = doorBox(d.facing || 0, !!d.open);
    out.push([x + b0[0], y + b0[1], z + b0[2], x + b1[0], y + b1[1], z + b1[2]]);
    return;
  }
  if (b.shape) {
    const get = (dx, dy, dz) => world.getBlock(x + dx, y + dy, z + dz);
    for (const bx of (b.collide || b.shape)(get, world.getData(x, y, z), id)) out.push([x + bx[0], y + bx[1], z + bx[2], x + bx[3], y + bx[4], z + bx[5]]);
    return;
  }
  out.push([x, y, z, x + 1, y + b.height, z + 1]);
}

function collectBoxes(world, x0, y0, z0, x1, y1, z1) {
  const out = [];
  for (let y = Math.floor(y0) - 1; y <= Math.floor(y1); y++)
    for (let z = Math.floor(z0); z <= Math.floor(z1); z++)
      for (let x = Math.floor(x0); x <= Math.floor(x1); x++) {
        const id = world.getBlock(x, y, z);
        if (id !== B.AIR) blockBoxes(world, x, y, z, id, out);
      }
  return out;
}

function boxCollides(world, px, py, pz, w, h) {
  const hw = w / 2;
  const boxes = collectBoxes(world, px - hw, py, pz - hw, px + hw, py + h, pz + hw);
  for (const b of boxes) {
    if (px + hw > b[0] && px - hw < b[3] && py + h > b[1] && py < b[4] && pz + hw > b[2] && pz - hw < b[5]) return true;
  }
  return false;
}

function boxInBlock(world, pos, w, h, id) {
  const hw = w / 2;
  for (let y = Math.floor(pos.y); y <= Math.floor(pos.y + h); y++)
    for (let z = Math.floor(pos.z - hw); z <= Math.floor(pos.z + hw); z++)
      for (let x = Math.floor(pos.x - hw); x <= Math.floor(pos.x + hw); x++) {
        const b = world.getBlock(x, y, z);
        if (typeof id === 'function' ? id(b) : b === id) return true;
      }
  return false;
}

// Clip a movement along one axis against boxes. box = [x0,y0,z0,x1,y1,z1]
function clipAxis(boxes, box, axis, d) {
  const a = axis, o1 = (axis + 1) % 3, o2 = (axis + 2) % 3;
  for (const b of boxes) {
    if (box[o1 + 3] <= b[o1] || box[o1] >= b[o1 + 3]) continue;
    if (box[o2 + 3] <= b[o2] || box[o2] >= b[o2 + 3]) continue;
    if (d > 0 && box[a + 3] <= b[a] + 1e-7) d = Math.min(d, b[a] - box[a + 3]);
    else if (d < 0 && box[a] >= b[a + 3] - 1e-7) d = Math.max(d, b[a + 3] - box[a]);
  }
  return d;
}

// Moves body = {pos, vel, w, h, onGround} by vel*dt with collision.
// opts: noclip, sneak (don't walk off edges), stepHeight (auto step up, default 0.6 when on ground)
function moveBody(world, body, dt, opts = {}) {
  const res = { hitX: false, hitZ: false, landed: false, fallVel: 0 };
  const p = body.pos;
  if (opts.noclip) {
    p.addScaledVector(body.vel, dt);
    body.onGround = false;
    return res;
  }
  const hw = body.w / 2, h = body.h;
  let dx = body.vel.x * dt, dy = body.vel.y * dt, dz = body.vel.z * dt;
  const wanted = [dx, dy, dz];
  const wasOnGround = body.onGround;

  // Sneaking: stop at edges by trimming horizontal motion that would leave support.
  if (opts.sneak && wasOnGround) {
    const supported = (ox, oz) => boxCollides(world, p.x + ox, p.y - 0.6, p.z + oz, body.w, 0.55);
    while (dx !== 0 && !supported(dx, 0)) dx = Math.abs(dx) < 0.05 ? 0 : dx - Math.sign(dx) * 0.05;
    while (dz !== 0 && !supported(0, dz)) dz = Math.abs(dz) < 0.05 ? 0 : dz - Math.sign(dz) * 0.05;
    while (dx !== 0 && dz !== 0 && !supported(dx, dz)) { dx = 0; }
  }

  const sweep = (sx, sy, sz, ddx, ddy, ddz) => {
    const boxes = collectBoxes(world,
      Math.min(sx - hw, sx - hw + ddx), Math.min(sy, sy + ddy), Math.min(sz - hw, sz - hw + ddz),
      Math.max(sx + hw, sx + hw + ddx), Math.max(sy + h, sy + h + ddy), Math.max(sz + hw, sz + hw + ddz));
    const box = [sx - hw, sy, sz - hw, sx + hw, sy + h, sz + hw];
    ddy = clipAxis(boxes, box, 1, ddy); box[1] += ddy; box[4] += ddy;
    ddx = clipAxis(boxes, box, 0, ddx); box[0] += ddx; box[3] += ddx;
    ddz = clipAxis(boxes, box, 2, ddz); box[2] += ddz; box[5] += ddz;
    return [ddx, ddy, ddz];
  };

  let [mx, my, mz] = sweep(p.x, p.y, p.z, dx, dy, dz);
  // Auto step-up (slabs, paths, soul sand) when walking into a low obstacle on the ground
  const step = opts.stepHeight ?? 0.6;
  if (step > 0 && (wasOnGround || (dy < 0 && my !== dy)) && (mx !== dx || mz !== dz)) {
    let [ux, uy, uz] = sweep(p.x, p.y, p.z, 0, step, 0);
    let [sx2, , sz2] = sweep(p.x, p.y + uy, p.z, dx, 0, dz);
    let [, dy2] = sweep(p.x + sx2, p.y + uy, p.z + sz2, 0, -uy + Math.min(0, dy), 0);
    if (sx2 * sx2 + sz2 * sz2 > mx * mx + mz * mz + 1e-6) { mx = sx2; mz = sz2; my = uy + dy2; }
    void ux; void uz;
  }
  p.x += mx; p.y += my; p.z += mz;

  body.onGround = false;
  if (my !== wanted[1]) {
    if (wanted[1] < 0) { body.onGround = true; res.landed = true; res.fallVel = body.vel.y; }
    body.vel.y = 0;
  }
  if (Math.abs(mx - dx) > 1e-9) { body.vel.x = 0; res.hitX = true; }
  if (Math.abs(mz - dz) > 1e-9) { body.vel.z = 0; res.hitZ = true; }
  if (opts.sneak && wasOnGround && (dx !== wanted[0] || dz !== wanted[2])) { res.hitX = res.hitX || dx !== wanted[0]; }
  if (!body.onGround && body.vel.y <= 0 && boxCollides(world, p.x, p.y - 0.01, p.z, body.w, 0.005)) body.onGround = true;
  return res;
}
