// Redstone: dust carries a signal (15 minus distance), levers/buttons/plates/torches/
// redstone blocks are sources, torches invert, and lamps, doors and TNT respond.
// Runs on the authority (singleplayer or multiplayer host); results are ordinary
// block changes, so everyone sees them.
'use strict';

const FACE_DIRS = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]];

class Redstone {
  constructor(game) {
    this.game = game;
    this.dirty = [];
    this.buttons = new Map();   // key -> time to release
    this.plates = new Map();    // key -> last time something stood on it
    this.doorPower = new Map(); // key -> last powered state we applied
    this.tntPower = new Set();
  }

  mark(x, y, z) { if (this.dirty.length < 64) this.dirty.push([x, y, z]); }

  isComponent(id) { return !!(BLOCKS[id] && (BLOCKS[id].redstone || id === B.DOOR_LOWER || id === B.DOOR_UPPER || id === B.TNT)); }

  // The block a wall/floor-mounted lever or button is attached to
  attachedTo(x, y, z, d) {
    const f = d && d.face !== undefined ? d.face : 2;
    const [dx, dy, dz] = FACE_DIRS[f];
    return [x + dx, y + dy, z + dz];
  }

  tick(dt) {
    const g = this.game, w = g.world;
    if (!g.isAuthority || !w) return;
    const now = g.simTime;
    // Buttons release after 1 second
    for (const [k, t] of this.buttons) {
      if (now < t) continue;
      this.buttons.delete(k);
      const [x, y, z] = k.split(',').map(Number);
      const d = w.getData(x, y, z);
      if (w.getBlock(x, y, z) === B.BUTTON && d && d.on) this.setOn(x, y, z, false);
    }
    // Pressure plates: anything standing on one presses it
    const standers = [g.player.dead || g.player.mode === 'spectator' ? null : g.player.pos, ...[...g.mobs.values()].map((m) => m.pos), ...[...g.remotePlayers.values()].filter((r) => r.dim === w.dim).map((r) => r.pos)];
    for (const p of standers) {
      if (!p) continue;
      const x = Math.floor(p.x), y = Math.floor(p.y + 0.05), z = Math.floor(p.z);
      if (w.getBlock(x, y, z) !== B.PLATE) continue;
      const k = x + ',' + y + ',' + z;
      if (!this.plates.has(k)) this.setOn(x, y, z, true);
      this.plates.set(k, now);
    }
    for (const [k, t] of this.plates) {
      if (now - t < 0.6) continue;
      this.plates.delete(k);
      const [x, y, z] = k.split(',').map(Number);
      if (w.getBlock(x, y, z) === B.PLATE) this.setOn(x, y, z, false);
    }
    if (!this.dirty.length) return;
    const work = this.dirty.splice(0, 8);
    for (const [x, y, z] of work) this.evaluate(x, y, z);
    g.flushBlocks();
  }

  setOn(x, y, z, on) {
    const g = this.game, w = g.world;
    const d = Object.assign({}, w.getData(x, y, z) || {}, { on });
    w.setData(x, y, z, d);
    g.net.send('bdata', { x, y, z, d, w: w.dim });
    Sound.click();
    this.mark(x, y, z);
  }

  pressButton(x, y, z) {
    this.setOn(x, y, z, true);
    this.buttons.set(x + ',' + y + ',' + z, this.game.simTime + 1);
  }

  // Recompute everything in a cube around (cx, cy, cz).
  evaluate(cx, cy, cz) {
    const g = this.game, w = g.world;
    const R = 14;
    const comps = [];
    for (let y = Math.max(1, cy - R); y <= Math.min(WORLD_HEIGHT - 2, cy + R); y++)
      for (let z = cz - R; z <= cz + R; z++)
        for (let x = cx - R; x <= cx + R; x++) {
          const id = w.getBlock(x, y, z);
          if (id !== B.AIR && this.isComponent(id)) comps.push([x, y, z, id]);
        }
    if (!comps.length) return;
    const key = (x, y, z) => x + ',' + y + ',' + z;
    const torchLit = new Map();
    for (const [x, y, z, id] of comps) if (BLOCKS[id].redstone === 'torch') torchLit.set(key(x, y, z), id === B.RTORCH);

    let wire = new Map();
    for (let iter = 0; iter < 8; iter++) {
      // Sources and "charged" blocks (a block a lever/button is attached to, or the block above a lit torch)
      const sources = new Set(), charged = new Set();
      for (const [x, y, z, id] of comps) {
        const r = BLOCKS[id].redstone;
        const d = w.getData(x, y, z);
        if (r === 'source') sources.add(key(x, y, z));
        else if ((r === 'lever' || r === 'button' || r === 'plate') && d && d.on) {
          sources.add(key(x, y, z));
          const a = r === 'plate' ? [x, y - 1, z] : this.attachedTo(x, y, z, d);
          charged.add(key(...a));
        } else if (r === 'torch' && torchLit.get(key(x, y, z))) {
          sources.add(key(x, y, z));
          charged.add(key(x, y + 1, z));
        }
      }
      // Wire power: flood fill from wires next to sources or charged blocks
      wire = new Map();
      const queue = [];
      for (const [x, y, z, id] of comps) {
        if (BLOCKS[id].redstone !== 'wire') continue;
        let start = 0;
        for (const [dx, dy, dz] of FACE_DIRS) {
          const k = key(x + dx, y + dy, z + dz);
          if (sources.has(k) || charged.has(k)) start = 15;
        }
        if (start) { wire.set(key(x, y, z), start); queue.push([x, y, z, start]); }
      }
      while (queue.length) {
        const [x, y, z, l] = queue.shift();
        if (l <= 1) continue;
        const nexts = [];
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          nexts.push([x + dx, y, z + dz]);
          if (!isSolid(w.getBlock(x, y + 1, z))) nexts.push([x + dx, y + 1, z + dz]);
          if (!isSolid(w.getBlock(x + dx, y, z + dz))) nexts.push([x + dx, y - 1, z + dz]);
        }
        for (const [nx, ny, nz] of nexts) {
          const id = w.getBlock(nx, ny, nz);
          if (id !== B.WIRE && id !== B.WIRE_ON) continue;
          const k = key(nx, ny, nz);
          if ((wire.get(k) || 0) >= l - 1) continue;
          wire.set(k, l - 1);
          queue.push([nx, ny, nz, l - 1]);
        }
      }
      // A block is powered if a source, powered wire or charged block touches it
      const powered = (x, y, z) => {
        if (charged.has(key(x, y, z))) return true;
        for (const [dx, dy, dz] of FACE_DIRS) {
          const k = key(x + dx, y + dy, z + dz);
          if (sources.has(k) || (wire.get(k) || 0) > 0) return true;
        }
        return false;
      };
      this._powered = powered;
      // Torches turn off when the block they stand on is powered
      let changed = false;
      for (const [x, y, z, id] of comps) {
        if (BLOCKS[id].redstone !== 'torch') continue;
        const below = [x, y - 1, z];
        let on = true;
        if (charged.has(key(...below))) on = false;
        for (const [dx, dy, dz] of FACE_DIRS) {
          const k = key(below[0] + dx, below[1] + dy, below[2] + dz);
          if (k === key(x, y, z)) continue;
          if ((wire.get(k) || 0) > 0 || (sources.has(k) && !(torchLit.has(k)))) on = false;
        }
        if (torchLit.get(key(x, y, z)) !== on) { torchLit.set(key(x, y, z), on); changed = true; }
      }
      if (!changed) break;
    }

    // Apply
    const set = (x, y, z, id) => { if (w.getBlock(x, y, z) !== id) g.changeBlock(x, y, z, id, { noUpdate: true, batch: true }); };
    const powered = this._powered;
    for (const [x, y, z, id] of comps) {
      const r = BLOCKS[id].redstone;
      if (r === 'wire') set(x, y, z, (wire.get(key(x, y, z)) || 0) > 0 ? B.WIRE_ON : B.WIRE);
      else if (r === 'torch') set(x, y, z, torchLit.get(key(x, y, z)) ? B.RTORCH : B.RTORCH_OFF);
      else if (r === 'lamp') set(x, y, z, powered(x, y, z) ? B.LAMP_ON : B.LAMP);
      else if (id === B.DOOR_LOWER) {
        const p = powered(x, y, z) || powered(x, y + 1, z);
        const k = key(x, y, z);
        if (this.doorPower.get(k) !== p) {
          const had = this.doorPower.has(k);
          this.doorPower.set(k, p);
          const d = w.getData(x, y, z) || {};
          if ((had || p) && !!d.open !== p) g.toggleDoor(x, y, z, B.DOOR_LOWER);
        }
      } else if (id === B.TNT && powered(x, y, z)) {
        g.changeBlock(x, y, z, B.AIR, { noUpdate: true });
        g.primeTnt(x, y, z);
      }
    }
  }
}
