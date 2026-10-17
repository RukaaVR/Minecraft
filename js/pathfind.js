// Mob pathfinding (A* on the block grid) so mobs walk around walls instead of pushing into them.
'use strict';

// Everything lives in this block so no names leak into the scope the scripts share; the one
// global it adds is window.PF_Pathfinder (settings, counters and helpers for tuning and tests).
//
// It hooks in without touching other files:
//  - Mob.prototype._seek (mobs2.js) is wrapped to remember the point a MOB_AI mob walks to
//    (wolves, endermen, golems).
//  - Mob.prototype._locomote (entities.js) is wrapped. When a mob is walking toward a goal (a
//    _seek point, or the player the default AI chases) or wandering, the direction it asked for
//    is replaced by one that follows a path on the block grid. It also notices mobs that stop
//    making progress, and substeps the physics when frames are long so 1-block jumps still work.
//  - Searches are queued and run first come, first served under a per-frame time/node budget;
//    a mob without a fresh path keeps its old one or steers straight, as before.
// Only the authority (singleplayer or the host) simulates mobs, so only it ever searches.
{
  const CFG = {
    enabled: true,      // pathfinding on/off (off = the original steering)
    substeps: true,     // split long frames into <= 1/60 s physics steps for walking mobs
    substep: 1 / 60,
    maxNodes: 1200,     // A* node expansions per search
    wanderNodes: 220,   // flood size when choosing a wander spot
    range: 32,          // goals farther than this (horizontally) are steered at directly
    frameMs: 1.5,       // planning time budget per frame, all mobs together
    frameNodes: 6000,   // node budget per frame
    maxDrop: 3,         // highest drop a chasing mob takes (wandering mobs: 1)
    weight: 1.4,        // heuristic weight (weighted A* explores far fewer nodes)
    debug: false,       // keep a log of searches that found no complete path
  };
  // Flyers, hoppers and the minigame bots (which bridge on purpose) keep their own movement.
  const SKIP = { bot: 1, dragon: 1, crystal: 1, ghast: 1, blaze: 1, slime: 1 };
  const NO_SUBSTEP = { bot: 1 };
  const debugLog = [];
  const stats = { searches: 0, chase: 0, wander: 0, nodes: 0, ms: 0, frameMaxMs: 0, searchMaxMs: 0, partial: 0, direct: 0, stuck: 0, deferred: 0, errors: 0, lastError: null };

  // ------------------------------------------------------------------ block kinds
  const K_PASS = 0, K_WATER = 1, K_LAVA = 2, K_FULL = 3, K_LOW = 4, K_TALL = 5, K_WALL = 6, K_AVOID = 7, K_DYN = 8, K_DOOR = 9;
  const KIND = new Uint8Array(256);
  let kindsFor = -1;
  function buildKinds() {
    if (kindsFor === BLOCKS.length) return;
    kindsFor = BLOCKS.length;
    const avoid = new Set([B.END_PORTAL, B.PORTAL_X, B.PORTAL_Z].filter((v) => v !== undefined));
    for (let id = 0; id < 256; id++) {
      const b = BLOCKS[id];
      let k = K_PASS;
      if (!b) k = K_PASS;
      else if (FLUID[id] === 1) k = K_WATER;
      else if (FLUID[id] === 2) k = K_LAVA;
      else if (!b.solid) k = avoid.has(id) ? K_AVOID : K_PASS;   // air, plants, torches, ladders...
      else if (id === B.CACTUS) k = K_WALL;                       // never stand on cactus
      else if (b.model === 'door' || b.shape || b.collide) k = K_DYN;
      else if (b.height <= 0.6) k = K_LOW;                        // beds
      else k = K_FULL;                                            // cubes, soul sand, farmland, paths
      KIND[id] = k;
    }
  }
  // Shaped blocks depend on their data (slab half, door open, fence arms).
  const tmpBoxes = [];
  function dynKind(world, x, y, z, id) {
    const b = BLOCKS[id];
    if (b.model === 'door') {
      const d = world.getData(x, id === B.DOOR_UPPER ? y - 1 : y, z);
      return d && d.open ? K_PASS : K_DOOR; // closed: a wall unless this mob opens or breaks doors
    }
    tmpBoxes.length = 0;
    try { blockBoxes(world, x, y, z, id, tmpBoxes); } catch (e) { return K_FULL; }
    if (!tmpBoxes.length) return K_PASS;
    let top = 0, area = 0;
    for (const q of tmpBoxes) { if (q[4] - y > top) top = q[4] - y; area += (q[3] - q[0]) * (q[5] - q[2]); }
    if (top > 1.01) return K_TALL;    // fences: too high to jump, nothing to stand on
    if (area < 0.6) return K_WALL;    // panes: in the way, nothing to stand on
    if (top <= 0.6) return K_LOW;     // bottom slabs: walk up without jumping
    return K_FULL;                    // stairs, top slabs, tables...
  }

  // ------------------------------------------------------------------ fast block access
  // World.getBlock builds a string key per call; searches touch thousands of blocks.
  const FAST = typeof CHUNK_SIZE !== 'undefined' && CHUNK_SIZE === 16;
  const chunkMemo = new Map();
  let cw = null, ccx = 0x7fffffff, ccz = 0, cblk = null;
  function blockAt(world, x, y, z) {
    if (y < 0 || y >= WORLD_HEIGHT) return 0;
    if (!FAST) return world.isLoaded(x, z) ? world.getBlock(x, y, z) : -1;
    const cx = x >> 4, cz = z >> 4;
    if (cx !== ccx || cz !== ccz || world !== cw) {
      if (world !== cw) { chunkMemo.clear(); cw = world; }
      const key = (cx + 32768) * 65536 + (cz + 32768);
      let blk = chunkMemo.get(key);
      if (blk === undefined) { const ch = world.getChunk(cx, cz); blk = ch ? ch.blocks : null; chunkMemo.set(key, blk); }
      ccx = cx; ccz = cz; cblk = blk;
    }
    if (!cblk) return -1; // not loaded: treat as a wall
    return cblk[(((y << 4) | (z & 15)) << 4) | (x & 15)];
  }

  // ------------------------------------------------------------------ search window
  // Caches live in typed arrays over a window around the start, stamped per search so
  // nothing needs clearing between searches.
  const WX = 72, WY = 40, WSIZE = WX * WX * WY;
  const cellSt = new Uint16Array(WSIZE), cellK = new Uint8Array(WSIZE);
  const colSt = new Uint16Array(WSIZE), colV = new Int8Array(WSIZE);
  const gSt = new Uint16Array(WSIZE), closedSt = new Uint16Array(WSIZE);
  const gSc = new Float32Array(WSIZE), par = new Int32Array(WSIZE);
  let epoch = 0, ox = 0, oy = 0, oz = 0, W = null;
  function begin(world, cx, cy, cz) {
    if (++epoch > 65535) { epoch = 1; cellSt.fill(0); colSt.fill(0); gSt.fill(0); closedSt.fill(0); }
    W = world; ox = cx - (WX >> 1); oy = cy - (WY >> 1); oz = cz - (WX >> 1);
  }
  function idxOf(x, y, z) { return ((y - oy) * WX + (z - oz)) * WX + (x - ox); }
  function cell(x, y, z) {
    const lx = x - ox, ly = y - oy, lz = z - oz;
    if (lx < 0 || lx >= WX || lz < 0 || lz >= WX || ly < 0 || ly >= WY) return K_WALL;
    const i = (ly * WX + lz) * WX + lx;
    if (cellSt[i] === epoch) return cellK[i];
    const id = blockAt(W, x, y, z);
    let k = id < 0 ? K_WALL : KIND[id];
    if (k === K_DYN) k = dynKind(W, x, y, z, id);
    if (k === K_DOOR && !DOORS) k = K_WALL;
    cellSt[i] = epoch; cellK[i] = k;
    return k;
  }
  const bodyOK = (k) => k === K_PASS || k === K_WATER || k === K_DOOR;

  // Per-search mob parameters
  let FP = 1, H = 1.95, HC = 2, HCL = 3, CLIMB = false, MAXDROP = 3, WATEROK = true, MOBW = 0.6, DOORS = 0, DOORCOST = 0;

  // One 1x1 column with the feet in block y. Returns -1 when the body can't be there,
  // else code | danger: code 0 = room but nothing to stand on, 1 = on the ground,
  // 2 = on a low block (slab/bed) in its own cell (feet at y + 0.5), 3 = swimming;
  // danger (8) = next to lava.
  function col(x, y, z) {
    const lx = x - ox, ly = y - oy, lz = z - oz;
    if (lx < 1 || lx >= WX - 1 || lz < 1 || lz >= WX - 1 || ly < 1 || ly >= WY - 5) return -1;
    const i = (ly * WX + lz) * WX + lx;
    if (colSt[i] === epoch) return colV[i];
    let code;
    const k0 = cell(x, y, z);
    let kb = -1;
    if (k0 === K_LOW) code = 2;
    else if (k0 === K_PASS || k0 === K_DOOR) {
      kb = cell(x, y - 1, z);
      if (kb === K_FULL) code = 1;
      else if (kb === K_TALL) code = -1;   // a fence pokes up into this cell
      else code = 0;                       // air, water, slab, pane, lava below: not a floor here
    } else if (k0 === K_WATER) code = cell(x, y + 1, z) === K_WATER ? 0 : 3; // swim at the surface
    else code = -1;
    if (code >= 0) {
      const n = code === 2 ? HCL : HC;
      for (let j = 1; j < n; j++) if (!bodyOK(cell(x, y + j, z))) { code = -1; break; }
    }
    if (code >= 0 && k0 === K_DOOR) code |= 16; // through a closed door
    if (code >= 0 && (kb === K_LAVA || cell(x + 1, y, z) === K_LAVA || cell(x - 1, y, z) === K_LAVA || cell(x, y, z + 1) === K_LAVA || cell(x, y, z - 1) === K_LAVA ||
      cell(x + 1, y - 1, z) === K_LAVA || cell(x - 1, y - 1, z) === K_LAVA || cell(x, y - 1, z + 1) === K_LAVA || cell(x, y - 1, z - 1) === K_LAVA)) code |= 8;
    colSt[i] = epoch; colV[i] = code;
    return code;
  }
  // A node: the feet block of a 1x1 mob, or the min corner of the 2x2 footprint of a wide one
  // (spiders, golems), which then stands centred on the shared corner.
  function stand(x, y, z) {
    if (FP === 1) return col(x, y, z);
    const a = col(x, y, z), b = col(x + 1, y, z), c = col(x, y, z + 1), d = col(x + 1, y, z + 1);
    if (a < 0 || b < 0 || c < 0 || d < 0) return -1;
    const ca = a & 7, cb = b & 7, cc = c & 7, cd = d & 7;
    const low = ca === 2 || cb === 2 || cc === 2 || cd === 2;
    if (low && HCL > HC) {
      const t = y + HCL - 1;
      if ((ca !== 2 && !bodyOK(cell(x, t, z))) || (cb !== 2 && !bodyOK(cell(x + 1, t, z))) ||
        (cc !== 2 && !bodyOK(cell(x, t, z + 1))) || (cd !== 2 && !bodyOK(cell(x + 1, t, z + 1)))) return -1;
    }
    let code = 0;
    if (ca === 1 || ca === 2 || cb === 1 || cb === 2 || cc === 1 || cc === 2 || cd === 1 || cd === 2) code = low ? 2 : 1;
    else if (ca === 3 || cb === 3 || cc === 3 || cd === 3) code = 3;
    return code | ((a | b | c | d) & 24);
  }
  const canStand = (r) => r >= 0 && (r & 7) !== 0 && ((r & 7) !== 3 || WATEROK);
  // Room for the body in the origin column(s) from block y0 to y1 (for jumps and climbs)
  function headroom(x, z, y0, y1) {
    for (let y = y0; y <= y1; y++) {
      if (!bodyOK(cell(x, y, z))) return false;
      if (FP === 2 && (!bodyOK(cell(x + 1, y, z)) || !bodyOK(cell(x, y, z + 1)) || !bodyOK(cell(x + 1, y, z + 1)))) return false;
    }
    return true;
  }

  // ------------------------------------------------------------------ A*
  const HEAP_CAP = 1 << 15;
  const heapI = new Int32Array(HEAP_CAP), heapF = new Float32Array(HEAP_CAP);
  let heapN = 0;
  function hpush(i, f) {
    if (heapN >= HEAP_CAP) return;
    let k = heapN++;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heapF[p] <= f) break;
      heapI[k] = heapI[p]; heapF[k] = heapF[p]; k = p;
    }
    heapI[k] = i; heapF[k] = f;
  }
  function hpop() {
    const top = heapI[0], n = --heapN;
    if (n > 0) {
      const li = heapI[n], lf = heapF[n];
      let k = 0;
      for (;;) {
        let c = 2 * k + 1;
        if (c >= n) break;
        if (c + 1 < n && heapF[c + 1] < heapF[c]) c++;
        if (heapF[c] >= lf) break;
        heapI[k] = heapI[c]; heapF[k] = heapF[c]; k = c;
      }
      heapI[k] = li; heapF[k] = lf;
    }
    return top;
  }

  const DX = [1, -1, 0, 0, 1, 1, -1, -1], DZ = [0, 0, 1, -1, 1, -1, 1, -1];
  let SX = 0, SY = 0, SZ = 0, GX = 0, GY = 0, GZ = 0, FLOOD = false, FLOODR2 = 0;
  let found = -1, best = -1, expanded = 0;
  const flood = [];
  function heur(x, y, z) {
    const dx = Math.abs(x - GX), dz = Math.abs(z - GZ);
    return (dx > dz ? dx + 0.4142 * dz : dz + 0.4142 * dx) + 0.5 * Math.abs(y - GY);
  }
  function relax(from, x, y, z, g) {
    const j = idxOf(x, y, z);
    if (closedSt[j] === epoch) return;
    if (gSt[j] === epoch && gSc[j] <= g) return;
    if (FLOOD && (x - SX) * (x - SX) + (z - SZ) * (z - SZ) > FLOODR2) return;
    gSt[j] = epoch; gSc[j] = g; par[j] = from;
    hpush(j, FLOOD ? g : g + CFG.weight * heur(x, y, z));
  }
  const moveCost = (r, base) => base * ((r & 7) === 3 ? 3 : 1) + (r & 8 ? 4 : 0) + (r & 16 ? DOORCOST : 0);

  function expand(i, x, y, z) {
    const r0 = stand(x, y, z), c0 = r0 & 7;
    const off0 = c0 === 2 ? 0.5 : 0, n0 = c0 === 2 ? HCL : HC;
    const g0 = gSc[i];
    for (let d = 0; d < 8; d++) {
      const nx = x + DX[d], nz = z + DZ[d];
      if (d >= 4) {
        // diagonals: level ground only, and both side cells open (no cutting corners)
        const r = stand(nx, y, nz);
        if (!canStand(r) || !canStand(stand(nx, y, z)) || !canStand(stand(x, y, nz))) continue;
        relax(i, nx, y, nz, g0 + moveCost(r, 1.4142));
        continue;
      }
      const r = stand(nx, y, nz);
      if (canStand(r)) { relax(i, nx, y, nz, g0 + moveCost(r, 1)); continue; }
      if (r >= 0 && (r & 7) === 3) continue; // water, and this mob keeps out of it
      if (r < 0) {
        // something in the way: jump up one block if there's headroom, spiders climb
        const ru = stand(nx, y + 1, nz);
        if (canStand(ru)) {
          const offu = (ru & 7) === 2 ? 0.5 : 0;
          if (1 + offu - off0 <= 1.2 && headroom(x, z, y + n0, Math.floor(y + 1 + offu + H - 0.02))) {
            relax(i, nx, y + 1, nz, g0 + moveCost(ru, 1.6));
            continue;
          }
        }
        if (CLIMB) {
          for (let yy = y + 1; yy <= y + 6; yy++) {
            if (!headroom(x, z, y + n0, yy + HC - 1)) break;
            const rc = stand(nx, yy, nz);
            if (canStand(rc)) { relax(i, nx, yy, nz, g0 + moveCost(rc, 1 + (yy - y))); break; }
            if (rc >= 0) break;
          }
        }
        continue;
      }
      // room but no floor: walk off and drop (deeper only into water)
      for (let yy = y - 1, lim = y - MAXDROP - (WATEROK ? 6 : 0); yy >= lim; yy--) {
        const rd = stand(nx, yy, nz);
        if (rd < 0) break;
        const cd = rd & 7;
        if (cd === 0) continue;
        if (cd === 3 ? WATEROK : y - yy <= MAXDROP) relax(i, nx, yy, nz, g0 + moveCost(rd, 1 + 0.35 * (y - yy)));
        break;
      }
    }
  }
  // Next to the target is close enough (melee reaches 1.6 blocks), which also copes with
  // targets standing somewhere a mob can't (a fence post, a 1x1 hole).
  function isGoal(x, y, z) {
    return Math.abs(y - GY) <= 1 && Math.abs(x - GX) <= 1 && Math.abs(z - GZ) <= 1;
  }
  function search(maxNodes, isFlood) {
    FLOOD = isFlood; found = -1; expanded = 0; heapN = 0; flood.length = 0;
    const si = idxOf(SX, SY, SZ);
    gSt[si] = epoch; gSc[si] = 0; par[si] = -1;
    let bestH = isFlood ? 0 : heur(SX, SY, SZ);
    best = si;
    hpush(si, bestH * CFG.weight);
    while (heapN > 0) {
      const i = hpop();
      if (closedSt[i] === epoch) continue;
      closedSt[i] = epoch;
      const lx = i % WX, t = (i - lx) / WX, lz = t % WX, ly = (t - lz) / WX;
      const x = lx + ox, y = ly + oy, z = lz + oz;
      if (isFlood) flood.push(i);
      else {
        if (isGoal(x, y, z)) { found = i; break; }
        const h = heur(x, y, z);
        if (h < bestH) { bestH = h; best = i; }
      }
      if (++expanded >= maxNodes) break;
      expand(i, x, y, z);
    }
    stats.nodes += expanded;
    frameNodes += expanded;
  }
  // A clear straight walk at level y: every column a body of radius r sweeps over is open
  // ground (no holes, steps, water or lava).
  function lineClear(ax, az, bx, bz, y, r) {
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / 0.3));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps, cx = ax + dx * t, cz = az + dz * t;
      const x0 = Math.floor(cx - r), x1 = Math.floor(cx + r), z0 = Math.floor(cz - r), z1 = Math.floor(cz + r);
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) if (col(x, y, z) !== 1) return false;
    }
    return true;
  }
  // Node chain from the start to `end`, string-pulled: on level ground, waypoints that can
  // be walked to in a straight line are skipped so mobs don't zig-zag along the grid.
  const PX = [], PY = [], PZ = [];
  function makePath(end) {
    PX.length = PY.length = PZ.length = 0;
    for (let i = end, n = 0; i >= 0 && n < 4000; i = par[i], n++) {
      const lx = i % WX, t = (i - lx) / WX, lz = t % WX, ly = (t - lz) / WX;
      PX.push(lx + ox); PY.push(ly + oy); PZ.push(lz + oz);
    }
    PX.reverse(); PY.reverse(); PZ.reverse();
    const n = PX.length, half = FP === 2 ? 1 : 0.5, r = MOBW / 2 + 0.05;
    const out = [];
    const add = (k) => { const c = stand(PX[k], PY[k], PZ[k]) & 7; out.push({ x: PX[k] + half, y: PY[k] + (c === 2 ? 0.5 : 0), z: PZ[k] + half }); };
    add(0);
    let i = 0;
    while (i < n - 1) {
      let j = i + 1;
      if (stand(PX[i], PY[i], PZ[i]) === 1) {
        for (let k = i + 1; k < n && k <= i + 16; k++) {
          if (PY[k] !== PY[i] || stand(PX[k], PY[k], PZ[k]) !== 1) break;
          if (k > i + 1 && !lineClear(PX[i] + half, PZ[i] + half, PX[k] + half, PZ[k] + half, PY[i], r)) break;
          j = k;
        }
      }
      add(j);
      i = j;
    }
    return out;
  }

  // ------------------------------------------------------------------ planning
  function setParams(m, wander, panic) {
    FP = m.w > 1.0 ? 2 : 1;
    MOBW = m.w; H = m.h;
    HC = Math.max(1, Math.ceil(m.h - 0.05));
    HCL = Math.max(1, Math.ceil(m.h + 0.5 - 0.05));
    CLIMB = m.type === 'spider';
    DOORS = doorMode(m);
    DOORCOST = DOORS === 1 ? 1.5 : 8;
    MAXDROP = wander && !panic ? 1 : CLIMB ? 6 : CFG.maxDrop; // spiders climb down walls
    WATEROK = !wander || panic;
  }
  const GOAL_DY = [0, -1, 1, -2, 2, -3, -4];
  function findStart(bx, by, bz) {
    const ok = (r) => r >= 0 && (r & 7) !== 0;
    for (const dy of [0, -1, 1, -2, -3]) if (ok(stand(bx, by + dy, bz))) { SX = bx; SY = by + dy; SZ = bz; return true; }
    for (const dy of [0, -1, 1]) for (let d = 0; d < 8; d++) {
      if (ok(stand(bx + DX[d], by + dy, bz + DZ[d]))) { SX = bx + DX[d]; SY = by + dy; SZ = bz + DZ[d]; return true; }
    }
    return false;
  }
  function plan(m) {
    const st = m._pf, kind = st.reqKind;
    st.reqKind = 0;
    if (!kind) return;
    buildKinds();
    const wander = kind === 2;
    setParams(m, wander, wander && st.wPanic);
    const half = FP === 2 ? 0.5 : 0;
    const bx = Math.floor(m.pos.x - half), bz = Math.floor(m.pos.z - half), by = Math.floor(m.pos.y + 0.05);
    begin(m.game.world, bx, by, bz);
    st.planAt = m.game.simTime;
    st.path = null; st.direct = false; st.standing = false; st.complete = false;
    if (!findStart(bx, by, bz)) return; // mid-air or somewhere odd: steer straight for now
    if (!wander) {
      stats.chase++;
      const g = st.goalRef;
      st.gx = g.x; st.gy = g.y; st.gz = g.z;
      GX = Math.floor(g.x - half); GZ = Math.floor(g.z - half); GY = Math.floor(g.y + 0.05);
      if (Math.abs(GX - SX) > (WX >> 1) - 3 || Math.abs(GZ - SZ) > (WX >> 1) - 3 || Math.abs(GY - SY) > (WY >> 1) - 6) { st.direct = true; return; }
      // settle the goal on something to stand on (the target may be jumping or swimming;
      // for a target under water, aim for the surface above it)
      let up = 0;
      while (up < 10 && cell(GX, GY + up, GZ) === K_WATER && cell(GX, GY + up + 1, GZ) === K_WATER) up++;
      if (up) GY += up;
      for (const dy of GOAL_DY) {
        const r = stand(GX, GY + dy, GZ);
        if (r >= 0 && (r & 7) !== 0) { GY += dy; break; }
      }
      search(CFG.maxNodes, false);
      st.complete = found >= 0;
      if (!st.complete) {
        stats.partial++;
        if (CFG.debug) debugLog.push({ type: m.type, start: [SX, SY, SZ], goal: [GX, GY, GZ], target: [+g.x.toFixed(2), +g.y.toFixed(2), +g.z.toFixed(2)], expanded, best: [best % WX + ox, ((best / WX | 0) / WX | 0) + oy, (best / WX | 0) % WX + oz], goalStand: stand(GX, GY, GZ) });
        if (debugLog.length > 50) debugLog.shift();
      }
      const end = st.complete ? found : best;
      if (end === idxOf(SX, SY, SZ)) { st.standing = !st.complete; st.direct = st.complete; return; }
      const path = makePath(end);
      if (st.complete && path.length <= 2 && m.game.simTime >= st.noDirectUntil) { st.direct = true; stats.direct++; return; }
      st.path = path; st.pi = 1;
    } else {
      stats.wander++;
      const want = st.wWant;
      FLOODR2 = (want + 3) * (want + 3);
      GX = SX; GY = SY; GZ = SZ;
      search(CFG.wanderNodes, true);
      let bestI = -1, bestS = -1e9;
      const dX = st.wDirX, dZ = st.wDirZ;
      for (let k = 1; k < flood.length; k++) {
        const i = flood[k];
        const lx = i % WX, t = (i - lx) / WX, lz = t % WX;
        const ex = lx + ox - SX, ez = lz + oz - SZ, len = Math.hypot(ex, ez);
        if (len < 1.5) continue;
        const along = (ex * dX + ez * dZ) / len;
        const s = along * Math.min(len, want) - 0.6 * Math.max(0, len - want) - 0.3 * (gSc[i] - len) + Math.random() * 0.3;
        if (s > bestS) { bestS = s; bestI = i; }
      }
      if (bestI < 0) { st.wDone = true; return; }
      st.path = makePath(bestI); st.pi = 1; st.complete = true;
    }
  }

  // ------------------------------------------------------------------ queue and budget
  const queue = [];
  let frameKey = NaN, frameMs = 0, frameNodes = 0;
  function frameTick(g) {
    if (g.simTime === frameKey) return;
    frameKey = g.simTime;
    if (frameMs > stats.frameMaxMs) stats.frameMaxMs = frameMs;
    frameMs = 0; frameNodes = 0;
    chunkMemo.clear(); ccx = 0x7fffffff; cw = null; // chunks may have (un)loaded
  }
  function enqueue(m, st) {
    if (st.queued) return;
    st.queued = true;
    queue.push(m);
  }
  function service(g) {
    while (queue.length && frameMs < CFG.frameMs && frameNodes < CFG.frameNodes) {
      const m = queue.shift(), st = m._pf;
      st.queued = false;
      if (m.dead || m.game !== g || !g.mobs || g.mobs.get(m.id) !== m) { st.reqKind = 0; continue; }
      const t0 = performance.now();
      try { plan(m); } catch (e) {
        st.path = null; st.direct = true; st.planAt = g.simTime;
        stats.errors++; stats.lastError = String(e && e.stack || e);
      }
      const t = performance.now() - t0;
      frameMs += t; stats.ms += t; stats.searches++;
      if (t > stats.searchMaxMs) stats.searchMaxMs = t;
    }
    if (queue.length) stats.deferred++;
  }

  // ------------------------------------------------------------------ following a path
  let FX = 0, FZ = 0, FDIST = 0, FDY = 0;
  function follow(m, st) {
    const p = st.path, n = p.length, px = m.pos.x, pz = m.pos.z, py = m.pos.y;
    const reach = st.fp === 2 ? 0.5 : 0.35;
    let i = st.pi;
    while (i < n) {
      const w = p[i], dx = w.x - px, dz = w.z - pz, dyw = w.y - py;
      if (dx * dx + dz * dz < reach * reach && dyw < 0.7) { i++; continue; }
      // walked past it along the segment (corners on level ground)
      if (i < n - 1 && Math.abs(dyw) < 0.6) {
        const q = p[i - 1];
        if ((px - w.x) * (w.x - q.x) + (pz - w.z) * (w.z - q.z) > 0) { i++; continue; }
      }
      break;
    }
    st.pi = i;
    if (i >= n) return false;
    const w = p[i], q = p[i - 1];
    const dx = w.x - px, dz = w.z - pz, d = Math.hypot(dx, dz);
    // knocked or teleported well off the current leg: plan again
    const sx = w.x - q.x, sz = w.z - q.z, sl = sx * sx + sz * sz;
    const u = sl > 0 ? Math.max(0, Math.min(1, ((px - q.x) * sx + (pz - q.z) * sz) / sl)) : 0;
    if (Math.hypot(q.x + sx * u - px, q.z + sz * u - pz) > 3) st.planAt = -1e9;
    FDIST = d; FDY = w.y - py;
    if (d < 1e-4) { FX = 0; FZ = 0; } else { FX = dx / d; FZ = dz / d; }
    return true;
  }

  // Steering results: 0 = keep the AI's own direction, 1 = use FX/FZ, 2 = stand still
  function chaseSteer(m, st, goal) {
    const now = m.game.simTime;
    if (st.mode !== 1) { st.mode = 1; st.path = null; st.direct = false; st.standing = false; st.planAt = -1e9; }
    const dx = goal.x - m.pos.x, dz = goal.z - m.pos.z, dy = goal.y - m.pos.y;
    const dist = Math.hypot(dx, dz);
    if (dist > CFG.range || Math.abs(dy) > 14) { st.path = null; st.standing = false; return 0; }
    if (dist < 1.5 && Math.abs(dy) < 1) return 0; // within reach: the AI's own steering is best
    const gm = (goal.x - st.gx) ** 2 + (goal.y - st.gy) ** 2 + (goal.z - st.gz) ** 2;
    const age = now - st.planAt;
    // re-plan when the target has moved, and now and then anyway (less often while waiting
    // at the end of a partial path: the target is probably unreachable)
    if ((gm > 4 && age > 0.3) || age > (st.complete || st.direct ? 1.25 : st.standing ? (gm < 1 ? 6 : 4) : 2.5)) {
      st.goalRef = goal; st.reqKind = 1;
      enqueue(m, st); service(m.game);
    }
    if (st.direct) return 0;
    if (st.path) {
      if (st.complete && st.pi >= st.path.length - 1) return 0; // last leg: straight at the target
      if (follow(m, st)) return 1;
      st.path = null;
      if (st.complete) return 0;
      st.standing = true;
    }
    return st.standing ? 2 : 0; // end of a partial path: wait there rather than push into a wall
  }
  function wanderSteer(m, st, dirX, dirZ, speed) {
    if (st.mode !== 2) { st.mode = 2; st.path = null; st.direct = false; st.wRef = null; }
    if (m.wanderDir !== st.wRef) {
      st.wRef = m.wanderDir; st.wDone = false; st.path = null;
      st.wDirX = dirX; st.wDirZ = dirZ; st.wPanic = m.panic > 0;
      st.wWant = st.wPanic ? 5 : Math.max(2.5, Math.min(8, speed * Math.max(1, m.wanderTimer || 0)));
      st.reqKind = 2;
      enqueue(m, st); service(m.game);
    }
    if (st.path) {
      if (follow(m, st)) return 1;
      st.path = null; st.wDone = true;
    }
    if (st.wDone || st.queued) return 2;
    return 0;
  }
  function trackStuck(m, st, dt, speed, mode) {
    if (speed <= 0 || mode === 0 || m.hurtTime >= 0.25 || st.atDoor) { st.chkT = 0; st.chkX = m.pos.x; st.chkZ = m.pos.z; return; }
    st.chkT += dt;
    if (st.chkT < 0.8) return;
    const moved = Math.hypot(m.pos.x - st.chkX, m.pos.z - st.chkZ);
    st.chkT = 0; st.chkX = m.pos.x; st.chkZ = m.pos.z;
    if (moved > 0.3) { if (moved > 0.6) st.stuck = 0; return; }
    stats.stuck++;
    st.stuck++;
    if (mode === 1) {
      st.planAt = -1e9; st.noDirectUntil = m.game.simTime + 3; st.direct = false;
      if (st.stuck >= 2) { st.sideT = 0.6; st.side = Math.random() < 0.5 ? -1 : 1; }
    } else {
      // wandering into something: pick somewhere else to go
      const a = Math.atan2(st.wDirZ, st.wDirX) + (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2 + Math.random() * Math.PI / 2);
      st.wDirX = Math.cos(a); st.wDirZ = Math.sin(a); st.wPanic = m.panic > 0;
      st.path = null; st.wDone = false; st.reqKind = 2;
      enqueue(m, st);
    }
  }

  // The player the default AI (zombies, skeletons, creepers, spiders, piglins) is walking to
  function defaultChaseGoal(m, dirX, dirZ) {
    if (MOB_AI[m.type]) return null;
    if (!(m.info.hostile || (m.info.neutral && m.angry > 0))) return null;
    const t = m.game.nearestTarget(m.pos, m.type === 'skeleton' ? 20 : 32);
    if (!t) return null;
    const dx = t.pos.x - m.pos.x, dz = t.pos.z - m.pos.z, d = Math.hypot(dx, dz) || 0.01;
    if ((dx * dirX + dz * dirZ) / d < 0.9) return null; // e.g. a skeleton backing off
    return t.pos;
  }
  function newState(m) {
    return {
      fp: m.w > 1.0 ? 2 : 1, mode: 0, path: null, pi: 0, complete: false, direct: false, standing: false,
      planAt: -1e9, gx: 1e9, gy: 1e9, gz: 1e9, goalRef: null, seekGoal: null, queued: false, reqKind: 0,
      wRef: null, wDone: false, wDirX: 1, wDirZ: 0, wWant: 4, wPanic: false,
      chkT: 0, chkX: m.pos.x, chkZ: m.pos.z, stuck: 0, sideT: 0, side: 1, inWater: false, noDirectUntil: 0,
    };
  }

  // ------------------------------------------------------------------ doors
  // Villagers and piglins open doors (and close them behind them); zombies bash them down on
  // Normal and Hard. Everyone else treats a closed door as a wall.
  const OPENERS = { villager: 1, piglin: 1 }, BREAKERS = { zombie: 1, husk: 1, drowned: 1 };
  function doorMode(m) {
    if (OPENERS[m.type]) return 1;
    if (BREAKERS[m.type] && m.game.difficulty >= 2 && !m.game.nw) return 2;
    return 0;
  }
  // The closed door the mob is walking into, as its lower block, or null
  function doorAhead(m, dx, dz) {
    const w = m.game.world, reach = m.w / 2 + 0.45;
    const x = Math.floor(m.pos.x + dx * reach), z = Math.floor(m.pos.z + dz * reach), y = Math.floor(m.pos.y + 0.05);
    for (const yy of [y, y + 1]) {
      const id = w.getBlock(x, yy, z);
      if (id !== B.DOOR_LOWER && id !== B.DOOR_UPPER) continue;
      const ly = id === B.DOOR_UPPER ? yy - 1 : yy, d = w.getData(x, ly, z);
      return d && d.open ? null : { x, y: ly, z };
    }
    return null;
  }
  function doorStep(m, st, dt, dx, dz, mode) {
    const g = m.game, d = doorAhead(m, dx, dz);
    st.atDoor = false;
    if (!d) { st.breakT = 0; return; }
    const key = d.x + ',' + d.y + ',' + d.z, pos = { x: d.x + 0.5, y: d.y + 1, z: d.z + 0.5 };
    if (mode === 1) {
      g.toggleDoor(d.x, d.y, d.z, B.DOOR_LOWER);
      m.swing = 1;
      (st.opened || (st.opened = [])).push({ x: d.x, y: d.y, z: d.z, t: g.simTime });
      return;
    }
    // bashing: knock, crack, and finally break it
    st.atDoor = true;
    if (st.breakKey !== key) { st.breakKey = key; st.breakT = 0; st.knock = 0; }
    st.breakT += dt; st.knock -= dt;
    m.targetYaw = Math.atan2(-dx, -dz);
    if (st.knock <= 0) {
      st.knock = 0.7;
      m.swing = 1;
      Sound.block('wood', 0.9, pos);
      if (g.particles) g.particles.burst(pos.x, pos.y, pos.z, B.DOOR_LOWER, 5);
    }
    if (st.breakT >= (g.difficulty >= 3 ? 3 : 6)) {
      st.breakT = 0; st.breakKey = null; st.atDoor = false;
      g.changeBlock(d.x, d.y, d.z, B.AIR);
      g.spawnItem(stackOf(ITEM.DOOR, 1), pos.x, pos.y - 0.5, pos.z);
      Sound.block('wood', 1.4, pos);
      if (g.particles) g.particles.burst(pos.x, pos.y, pos.z, B.DOOR_LOWER, 18);
      st.planAt = -1e9;
    }
  }
  // Villagers shut the doors they opened once they're through
  function closeBehind(m, st) {
    if (!st.opened || !st.opened.length) return;
    const g = m.game, w = g.world;
    st.opened = st.opened.filter((o) => {
      const dist = Math.hypot(m.pos.x - o.x - 0.5, m.pos.z - o.z - 0.5);
      if (dist > 12 || w.getBlock(o.x, o.y, o.z) !== B.DOOR_LOWER) return false;
      const d = w.getData(o.x, o.y, o.z);
      if (!d || !d.open) return false;
      if (g.simTime - o.t < 0.8 || dist < 1.6) return true;
      const busy = (p) => Math.floor(p.x) === o.x && Math.floor(p.z) === o.z && p.y < o.y + 2 && p.y > o.y - 1;
      if (g.player && busy(g.player.pos)) return true;
      for (const other of g.mobs.values()) if (other !== m && busy(other.pos)) return true;
      g.toggleDoor(o.x, o.y, o.z, B.DOOR_LOWER);
      return false;
    });
  }

  // ------------------------------------------------------------------ hooks
  const origSeek = Mob.prototype._seek;
  if (origSeek) {
    Mob.prototype._seek = function (dt, target, speed, stopAt) {
      if (CFG.enabled && target && !SKIP[this.type]) (this._pf || (this._pf = newState(this))).seekGoal = target;
      return origSeek.apply(this, arguments);
    };
  }

  const origLoco = Mob.prototype._locomote;
  // The original locomotion in steps of at most 1/60 s: at low frame rates a single step
  // integrates jumps so coarsely that they peak below one block.
  function locomote(m, dt, x, z, s) {
    const n = CFG.substeps && !NO_SUBSTEP[m.type] && dt > CFG.substep * 1.05 ? Math.min(4, Math.ceil(dt / CFG.substep - 0.05)) : 1;
    if (n <= 1) return origLoco.call(m, dt, x, z, s);
    const h = dt / n;
    let wet = false, lava = false;
    for (let k = 0; k < n; k++) {
      const r = origLoco.call(m, h, x, z, s);
      if (r) { wet = wet || r.inWater; lava = lava || r.inLava; }
    }
    return { inWater: wet, inLava: lava };
  }

  Mob.prototype._locomote = function (dt, dirX, dirZ, speed) {
    const g = this.game;
    if (!CFG.enabled || SKIP[this.type] || this.info.flying || this.dead || !g || !g.world) return locomote(this, dt, dirX, dirZ, speed);
    const st = this._pf || (this._pf = newState(this));
    frameTick(g);
    if (queue.length) service(g);
    const seek = st.seekGoal;
    st.seekGoal = null;

    let mode = 0, goal = null;
    if (speed > 0 && this.hurtTime < 0.25) {
      if (seek) goal = seek;
      else if (this.wanderDir && this.wanderDir[0] === dirX && this.wanderDir[1] === dirZ) mode = 2;
      else goal = defaultChaseGoal(this, dirX, dirZ);
      if (goal) mode = 1;
    }
    let ox = dirX, oz = dirZ, os = speed, steer = false;
    if (mode === 1) {
      const r = chaseSteer(this, st, goal);
      if (r === 1) { ox = FX; oz = FZ; steer = true; } else if (r === 2) os = 0;
    } else if (mode === 2) {
      const r = wanderSteer(this, st, dirX, dirZ, speed);
      if (r === 1) {
        ox = FX; oz = FZ; steer = true;
        // keep wanderDir pointing where the mob really walks (the AI's ledge check reads it)
        if (FX !== 0 || FZ !== 0) { this.wanderDir[0] = FX; this.wanderDir[1] = FZ; }
      } else if (r === 2) os = 0;
    }
    if (st.sideT > 0 && os > 0) {
      // repeatedly stuck while chasing: sidestep for a moment
      st.sideT -= dt;
      const sx = -oz * st.side, sz = ox * st.side;
      ox = ox * 0.3 + sx; oz = oz * 0.3 + sz;
      const l = Math.hypot(ox, oz) || 1;
      ox /= l; oz /= l;
    }
    if (steer && os > 0) {
      if (FX !== 0 || FZ !== 0) this.targetYaw = Math.atan2(-ox, -oz);
      // hop up a one-block step on the path (bumping into it also jumps, see _locomote)
      if (FDY > 0.55 && FDY < 1.4 && this.type !== 'spider') {
        if (this.onGround && FDIST < 0.75 + this.w / 2) this.vel.y = 8.6;
        else if (st.inWater && FDIST < 1.6) this.vel.y = Math.max(this.vel.y, 6);
      }
    }
    const dm = g.isAuthority === false ? 0 : doorMode(this);
    if (dm && os > 0 && (ox || oz)) doorStep(this, st, dt, ox, oz, dm);
    else st.atDoor = false;
    if (dm === 1) closeBehind(this, st);
    const res = locomote(this, dt, ox, oz, os);
    st.inWater = !!(res && res.inWater);
    trackStuck(this, st, dt, os, mode);
    return res;
  };

  window.PF_Pathfinder = {
    CFG, stats, queue, debugLog,
    path: (m) => (m._pf && m._pf.path) || null,
    state: (m) => m._pf || null,
    resetStats() { for (const k in stats) stats[k] = k === 'lastError' ? null : 0; },
    // Plan a chase to `goal` right now (tests/debugging); returns what the search did.
    debugPlan(m, goal) {
      const st = m._pf || (m._pf = newState(m));
      st.goalRef = goal; st.reqKind = 1; st.mode = 1;
      plan(m);
      return { start: [SX, SY, SZ], goal: [GX, GY, GZ], found: found >= 0, expanded, complete: st.complete, direct: st.direct, standing: st.standing, path: st.path && st.path.map((w) => [+w.x.toFixed(1), +w.y.toFixed(1), +w.z.toFixed(1)]) };
    },
  };
}
