// More Nova Network games: The Bridge (score in the enemy goal) and Murder Mystery
// (find the murderer before they get everyone). Built on the match system in network.js.
'use strict';

Object.assign(NOVA_GAMES, {
  bridge: { title: 'THE BRIDGE', color: '#5555FF', icon: B.WOOL_BLUE, desc: '2v2. Build across and jump into the enemy goal. First to 3 points wins.', mode: 'Doubles 2v2' },
  murder: { title: 'MURDER MYSTERY', color: '#FF5555', icon: toolId(2, 3), desc: 'One murderer, one detective, everyone else innocent. Survive, collect gold, find the killer.', mode: 'Classic 8 players' },
});
const BRIDGE_WIN = 3;
const MURDER_TIME = 240;
const ROLE_INFO = {
  m: { name: 'MURDERER', color: '#FF5555', tip: 'Kill all players before time runs out!' },
  d: { name: 'DETECTIVE', color: '#55FFFF', tip: 'Find and shoot the murderer! Shooting an innocent kills you.' },
  i: { name: 'INNOCENT', color: '#55FF55', tip: 'Stay alive. Collect 10 gold for a bow and watch your back.' },
};

// ---------------------------------------------------------------- maps
Object.assign(Arena, {
  build_bridge(seed) {
    const b = arenaBuilder(), rnd = mulberry32(seed ^ 0xb21d);
    const Y = 70;
    const goals = [], spawns = [], cages = [];
    [-1, 1].forEach((s, t) => {
      const wool = t === 0 ? B.WOOL_RED : B.WOOL_BLUE;
      // Base: a platform with a goal hole at the back
      for (let x = 19; x <= 33; x++) for (let z = -7; z <= 7; z++) {
        const wx = s * x;
        const edge = x === 19 || x === 33 || Math.abs(z) === 7;
        b.set(wx, Y, z, edge ? wool : (x + z) % 3 === 0 ? B.STONE_BRICKS : B.SANDSTONE);
        const depth = 2 + Math.floor((7 - Math.abs(z)) * 0.6 + rnd() * 2);
        for (let k = 1; k <= depth; k++) b.set(wx, Y - k, z, B.STONE);
      }
      // Goal: a 3x3 hole of portal blocks ringed by a low wall
      const gx = s * 29;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { b.set(gx + dx, Y, dz, B.END_PORTAL); b.set(gx + dx, Y - 1, dz, B.OBSIDIAN); }
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (Math.abs(dx) === 2 || Math.abs(dz) === 2) b.set(gx + dx, Y, dz, B.OBSIDIAN);
      for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) { b.box(gx + dx, Y + 1, dz, gx + dx, Y + 2, dz, wool); b.set(gx + dx, Y + 3, dz, B.GLOWSTONE); }
      goals.push({ x: gx, y: Y, z: 0 });
      // Spawn cages, one per player
      for (const z of [-2, 2]) {
        const cx = s * 22, cy = Y + 4;
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = 0; dy <= 4; dy++) {
          const shell = dy === 0 || dy === 4 || Math.abs(dx) === 1 || Math.abs(dz) === 1;
          if (!shell) continue;
          b.set(cx + dx, cy + dy, z + dz, B.GLASS);
          cages.push([cx + dx, cy + dy, z + dz]);
        }
        spawns.push({ team: t, spawn: [cx + 0.5, cy + 1, z + 0.5], yaw: s < 0 ? -Math.PI / 2 : Math.PI / 2 });
      }
    });
    // Middle platform
    for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) {
      b.set(x, Y, z, Math.abs(x) === 4 || Math.abs(z) === 4 ? B.WOOL_WHITE : B.STONE_BRICKS);
      for (let k = 1; k <= 3 + Math.floor(rnd() * 3); k++) b.set(x, Y - k, z, B.STONE);
    }
    b.set(0, Y + 1, 0, B.GLOWSTONE);
    const spec = b.finish({ goals, spawns, cages, voidY: Y - 16, center: [0.5, Y + 8, 0.5], buildY: [Y - 5, Y + 6] });
    spec.mapKeys = new Set(spec.blocks.map((bl) => bl[0] + ',' + bl[1] + ',' + bl[2]));
    return spec;
  },

  build_murder(seed) {
    const b = arenaBuilder(), rnd = mulberry32(seed ^ 0x4d4d);
    const Y = 64, R = 23;
    // Town square: grass and paths, a stone wall around it
    for (let x = -R; x <= R; x++) for (let z = -R; z <= R; z++) {
      const path = Math.abs(x) <= 1 || Math.abs(z) <= 1 || Math.abs(Math.abs(x) - Math.abs(z)) === 0 && Math.abs(x) < 7;
      b.set(x, Y, z, path ? B.PATH : B.GRASS);
      for (let k = 1; k <= 3; k++) b.set(x, Y - k, z, k === 1 ? B.DIRT : B.STONE);
      if (Math.abs(x) === R || Math.abs(z) === R) { b.box(x, Y + 1, z, x, Y + 4, z, B.STONE_BRICKS); b.set(x, Y + 5, z, B.OAK_FENCE); }
      else if (!path && rnd() < 0.05) b.set(x, Y + 1, z, rnd() < 0.7 ? B.TALL_GRASS : rnd() < 0.5 ? B.POPPY : B.DANDELION);
    }
    // Fountain
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      const d = Math.hypot(dx, dz);
      if (d <= 2.2) { b.set(dx, Y, dz, B.WATER); b.set(dx, Y - 1, dz, B.STONE_BRICKS); b.set(dx, Y + 1, dz, 0); }
      else if (d <= 3.3) b.set(dx, Y + 1, dz, B.STONE_SLAB);
    }
    b.box(0, Y, 0, 0, Y + 2, 0, B.STONE_BRICKS); b.set(0, Y + 3, 0, B.GLOWSTONE);
    // Houses with doorways, windows and furniture
    const houses = [[-14, -14], [0, -15], [14, -14], [-15, 0], [15, 0], [-14, 14], [0, 15], [14, 14]];
    const goldSpots = [];
    houses.forEach(([hx, hz], i) => {
      const w = 3, wall = [B.PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS, B.STONE_BRICKS][i % 4];
      const doorSide = Math.abs(hx) > Math.abs(hz) ? [Math.sign(-hx), 0] : [0, Math.sign(-hz)];
      for (let dx = -w; dx <= w; dx++) for (let dz = -w; dz <= w; dz++) {
        b.set(hx + dx, Y, hz + dz, B.PLANKS);
        for (let dy = 1; dy <= 6; dy++) b.set(hx + dx, Y + dy, hz + dz, 0);
        const edge = Math.abs(dx) === w || Math.abs(dz) === w;
        if (edge) {
          for (let dy = 1; dy <= 3; dy++) b.set(hx + dx, Y + dy, hz + dz, (Math.abs(dx) === w && Math.abs(dz) === w) ? B.LOG : (dy === 2 && (dx === 0 || dz === 0) ? B.GLASS : wall));
        }
        b.set(hx + dx, Y + 4, hz + dz, Math.abs(dx) === w || Math.abs(dz) === w ? B.OAK_SLAB : B.PLANKS);
      }
      // doorway (2 high) toward the middle
      const [sx, sz] = doorSide;
      for (const k of [-1, 0]) for (let dy = 1; dy <= 2; dy++) b.set(hx + sx * w + (sz ? k : 0), Y + dy, hz + sz * w + (sx ? k : 0), 0);
      b.set(hx - sx * 2 + sz, Y + 1, hz - sz * 2 + sx, [B.CRAFTING_TABLE, B.BOOKSHELF, B.FURNACE, B.CHEST][i % 4]);
      b.set(hx - sx * 2 - sz, Y + 1, hz - sz * 2 - sx, B.BOOKSHELF);
      b.set(hx, Y + 3, hz, B.GLOWSTONE);
      goldSpots.push([hx + 0.5, Y + 1.2, hz + 0.5], [hx + 1.5, Y + 1.2, hz - 1.5]);
    });
    // Trees and lamps between the houses
    for (const [x, z] of [[-8, -20], [8, -20], [-20, 8], [20, -8], [8, 20], [-8, 20], [-20, -8], [20, 8]]) b.tree(x, Y + 1, z, B.LOG, B.LEAVES, 4);
    for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6], [0, -9], [0, 9], [-9, 0], [9, 0]]) { b.box(x, Y + 1, z, x, Y + 2, z, B.OAK_FENCE); b.set(x, Y + 3, z, B.GLOWSTONE); }
    for (let i = 0; i < 24; i++) {
      const a = rnd() * Math.PI * 2, r = 4 + rnd() * 16;
      const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
      if (!b.get(x, Y + 1, z) && b.get(x, Y, z) !== B.WATER) goldSpots.push([x + 0.5, Y + 1.2, z + 0.5]);
    }
    const spawns = [];
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; spawns.push({ spawn: [Math.round(Math.cos(a) * 8) + 0.5, Y + 1, Math.round(Math.sin(a) * 8) + 0.5], yaw: Math.atan2(Math.cos(a), Math.sin(a)) }); }
    return b.finish({ spawns, goldSpots, voidY: Y - 30, center: [0.5, Y + 12, 0.5] });
  },
});

// ---------------------------------------------------------------- shared helpers
Object.assign(Game.prototype, {
  nwIsFinal(team) {
    const nw = this.nw;
    if (nw.kind === 'bedwars') return !nw.beds[team];
    if (nw.kind === 'bridge') return false;
    return true;
  },
  nwRole(name) { const m = this.nw && this.nw.member(name); return m ? m.role || 'i' : 'i'; },
  // The kit for the current game (The Bridge refills it on every respawn and round)
  nwGiveKit() {
    const nw = this.nw, p = this.player, inv = p.inventory;
    inv.clear();
    if (nw.kind === 'bridge') {
      const wool = NOVA_TEAMS[nw.myTeam === 1 ? 1 : 0].wool;
      inv.slots[0] = stackOf(toolId(2, 3), 1);
      inv.slots[1] = stackOf(ITEM.BOW, 1);
      inv.slots[2] = stackOf(toolId(4, 0), 1);
      inv.slots[3] = stackOf(wool, 64);
      inv.slots[4] = stackOf(wool, 64);
      inv.slots[5] = stackOf(ITEM.APPLE, 8);
      inv.slots[8] = stackOf(ITEM.ARROW, 8);
      for (let i = 0; i < 4; i++) p.armor.slots[i] = stackOf(armorId(i === 1 ? 1 : 0, i), 1);
      p.armor.changed();
    }
    if (nw.kind === 'murder') {
      const role = this.nwRole(this.settings.name);
      if (role === 'd') { inv.slots[1] = stackOf(ITEM.BOW, 1); inv.slots[8] = stackOf(ITEM.ARROW, 1); }
      p.armor.clear();
    }
    inv.changed();
  },
});

// Spawn points for the new maps
{
  const P = Game.prototype;
  const spawnPoint = P.nwSpawnPoint;
  P.nwSpawnPoint = function (team, slot) {
    const nw = this.nw, spec = nw.spec;
    if (nw.kind === 'bridge') {
      const list = spec.spawns.filter((s) => s.team === team);
      const s = list[Math.floor(slot / 2) % list.length] || spec.spawns[0];
      return { pos: s.spawn.slice(), yaw: s.yaw };
    }
    if (nw.kind === 'murder') { const s = spec.spawns[slot % spec.spawns.length]; return { pos: s.spawn.slice(), yaw: s.yaw }; }
    return spawnPoint.call(this, team, slot);
  };

  // Match start: roles for Murder Mystery
  const start = P.nwStartMatch;
  P.nwStartMatch = function (kind) {
    if (kind === 'murder') {
      const nw = this.nw;
      const realLoad = this.nwLoadArena;
      // assign roles before the map loads so bots spawn with them
      this.nwLoadArena = function (...a) {
        delete this.nwLoadArena;
        const order = nw.members.map((_, i) => i).sort(() => Math.random() - 0.5);
        nw.members.forEach((m) => { m.role = 'i'; });
        nw.members[order[0]].role = 'm';
        nw.members[order[1]].role = 'd';
        return realLoad.apply(this, a);
      };
    }
    start.call(this, kind);
  };

  const spawnBot = P.nwSpawnBotMember;
  P.nwSpawnBotMember = function (mem) {
    const m = spawnBot.call(this, mem);
    const nw = this.nw;
    if (nw.kind === 'bridge') { m.blocks = 999; m.hasBow = Math.random() < 0.5; m.arrows = 8; m.armor = 0.3; m.plan = { step: 'bridge' }; m.role = mem.slot < 2 ? 'rusher' : (Math.random() < 0.5 ? 'defender' : 'rusher'); }
    if (nw.kind === 'murder') {
      m.role = mem.role || 'i'; m.armor = 0; m.blocks = 0; m.gold = 0; m.hasBow = m.role === 'd'; m.arrows = m.role === 'd' ? 999 : 0;
      m.plan = { step: 'wander' };
      if (m.role === 'd') m._setWeapon(ITEM.BOW); else m._setWeapon(0);
      m.swordTier = 2;
    }
    return m;
  };

  // Local setup: kits, role titles, cages
  const setup = P.nwSetupLocal;
  P.nwSetupLocal = function () {
    setup.call(this);
    const nw = this.nw;
    if (!nw || (nw.kind !== 'bridge' && nw.kind !== 'murder') || nw.setupFor !== nw.id) return;
    this.nwGiveKit();
    nw.myRound = nw.round || 0;
    if (nw.kind === 'murder') {
      const r = ROLE_INFO[this.nwRole(this.settings.name)];
      this.nwTitle('ROLE: ' + r.name, r.tip, r.color, 4);
      this.chat.rich([['You are the ', '#FFFFFF'], [r.name, r.color], ['! ', '#FFFFFF'], [r.tip, '#AAAAAA']]);
      nw.knifeAt = this.nwRole(this.settings.name) === 'm' ? 10 : null;
    } else {
      this.nwTitle('THE BRIDGE', `You are on ${NOVA_TEAMS[nw.myTeam].name} team. Score in the enemy goal!`, NOVA_TEAMS[nw.myTeam].color, 3);
    }
  };
}

// ---------------------------------------------------------------- host rules
{
  const P = Game.prototype;
  const load = P.nwLoadArena;
  P.nwLoadArena = function (kind, id, seed) {
    if (this.nw) { this.nw.score = [0, 0]; this.nw.round = 0; this.nw.myRound = -1; this.nw.bowDrop = null; this.nw.goldT = 1; }
    load.call(this, kind, id, seed);
  };

  P.nwWinCheck = function () {
    const nw = this.nw;
    if (nw.kind === 'bridge') {
      if (nw.score[0] >= BRIDGE_WIN || nw.score[1] >= BRIDGE_WIN) this.nwEnd(nw.score[0] > nw.score[1] ? 0 : 1);
      else if (nw.elapsed > 600) this.nwEnd(nw.score[0] === nw.score[1] ? -1 : nw.score[0] > nw.score[1] ? 0 : 1);
      return;
    }
    if (nw.kind === 'murder') {
      const murderer = nw.members.find((m) => m.role === 'm');
      const mAlive = murderer && nw.memberAlive(murderer);
      const others = nw.members.filter((m) => m.role !== 'm' && nw.memberAlive(m)).length;
      if (!mAlive) this.nwEndMurder('innocents');
      else if (others === 0) this.nwEndMurder('murderer');
      else if (nw.elapsed > MURDER_TIME) this.nwEndMurder('innocents');
    }
  };

  P.nwEndMurder = function (side) {
    const nw = this.nw;
    if (nw.phase === 'ended') return;
    const mm = nw.members.find((m) => m.role === 'm'), dd = nw.members.find((m) => m.role === 'd');
    nw.phase = 'ended'; nw.phaseT = 9;
    nw.winner = side === 'murderer' ? (mm ? mm.name : 'Murderer') : 'Innocents';
    nw.winnerTeam = side === 'murderer' ? -2 : -3;
    const line = [['▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬', '#55FF55']];
    this.nwFeed(line);
    this.nwFeed([['            MURDER MYSTERY', '#FFFFFF']]);
    this.nwFeed([['  Winner: ', '#FFAA00'], [side === 'murderer' ? 'MURDERER' : 'PLAYERS', side === 'murderer' ? '#FF5555' : '#55FF55']]);
    this.nwFeed([['  Detective: ', '#AAAAAA'], [dd ? dd.name : '?', '#55FFFF']]);
    this.nwFeed([['  Murderer: ', '#AAAAAA'], [mm ? mm.name : '?', '#FF5555'], [mm ? ` (${mm.kills + mm.finals} kills)` : '', '#AAAAAA']]);
    this.nwFeed(line, { ne: { wt: nw.winnerTeam, w: nw.winner } });
  };

  const hostTick = P.nwHostTick;
  P.nwHostTick = function (dt) {
    const nw = this.nw;
    // The Bridge: after a goal everyone waits in cages again
    if (nw && nw.kind === 'bridge' && nw.phase === 'starting' && nw.round > 0 && nw.cagesBuiltFor !== nw.round) {
      nw.cagesBuiltFor = nw.round;
      for (const [x, y, z] of nw.spec.cages) if (this.world.getBlock(x, y, z) === B.AIR) this.changeBlock(x, y, z, B.GLASS, { noUpdate: true, batch: true });
      this.flushBlocks();
      for (const m of this.mobs.values()) {
        if (m.type !== 'bot' || !m.member) continue;
        const sp = this.nwSpawnPoint(m.member.team, m.member.slot);
        m.pos.set(sp.pos[0], sp.pos[1], sp.pos[2]); m.vel.set(0, 0, 0); m.health = 20;
      }
    }
    const wasStarting = nw && nw.phase === 'starting';
    hostTick.call(this, dt);
    if (!this.nw || nw !== this.nw) return;
    if (nw.kind === 'bridge' && wasStarting && nw.phase === 'playing') {
      for (const [x, y, z] of nw.spec.cages) if (this.world.getBlock(x, y, z) === B.GLASS) this.changeBlock(x, y, z, B.AIR, { noUpdate: true, batch: true });
      this.flushBlocks();
    }
    if (nw.phase !== 'playing') return;
    if (nw.kind === 'bridge') {
      // bots that drop into a goal
      for (const m of this.mobs.values()) {
        if (m.type !== 'bot' || !m.member || m.dead) continue;
        if (boxInBlock(this.world, m.pos, 0.3, 1.0, (b) => b === B.END_PORTAL)) {
          const side = m.pos.x < 0 ? 0 : 1;
          if (side !== m.team) this.nwGoal(m.name, m.team);
          else { m.health = 0; m.deathTime = 0; }
        }
      }
    }
    if (nw.kind === 'murder') {
      // bots pick up the dropped bow
      if (nw.bowDrop) {
        for (const m of this.mobs.values()) {
          if (m.type !== 'bot' || m.dead || m.role === 'm' || m.hasBow) continue;
          if (Math.hypot(m.pos.x - nw.bowDrop[0], m.pos.z - nw.bowDrop[2]) < 1.5) {
            m.hasBow = true; m.arrows = 999; m.role = 'h'; m._setWeapon(ITEM.BOW); nw.bowDrop = null;
            this.nwFeed([['A player has picked up the bow!', '#FFAA00']], { ev: 'bowtaken' });
            break;
          }
        }
      }
    }
  };

  // Host: score a goal and reset the round
  P.nwGoal = function (name, team) {
    const nw = this.nw;
    if (nw.phase !== 'playing') return;
    nw.score[team]++;
    const m = nw.member(name);
    if (m) m.goals = (m.goals || 0) + 1;
    const T = NOVA_TEAMS;
    this.nwFeed([[name, T[team].color], [' scored! ', '#AAAAAA'], [String(nw.score[0]), T[0].color], [' - ', '#AAAAAA'], [String(nw.score[1]), T[1].color]], { gl: { n: name, t: team } });
    if (nw.score[team] >= BRIDGE_WIN) { this.nwWinCheck(); return; }
    nw.round++;
    nw.phase = 'starting';
    nw.phaseT = 4;
  };

  // Every client: show goals, kill credit for murders, bow drops
  const apply = P.nwApplyMeta;
  P.nwApplyMeta = function (d) {
    apply.call(this, d);
    const nw = this.nw;
    if (!nw) return;
    if (d.goal && this.isAuthority) this.nwGoal(String(d.goal.n || ''), d.goal.t | 0);
    if (d.gl) {
      const mine = nw.myTeam === (d.gl.t | 0);
      this.nwTitle(String(d.gl.n), mine ? 'scored for your team!' : 'scored!', NOVA_TEAMS[d.gl.t | 0].color, 2.5);
      Sound.tone(mine ? 880 : 300, 0.4, 0.25, 'triangle', mine ? 300 : -100);
      if (d.gl.n === this.settings.name) { const prof = NovaProfile.get(); prof.coins += 15; prof.goals = (prof.goals || 0) + 1; NovaProfile.save(); this.chat.rich([['+15 coins! ', '#FFAA00'], ['(Goal)', '#AAAAAA']]); }
    }
    if (d.bow && nw.kind === 'murder') {
      const [x, y, z] = d.bow;
      nw.bowWasDropped = true;
      if (this.isAuthority) nw.bowDrop = [x, y, z];
      this.spawnItem(stackOf(ITEM.BOW, 1), x, y + 0.5, z, new THREE.Vector3(0, 2, 0));
      this.nwTitle('', 'The bow has been dropped! Find it!', '#FFAA00', 2.5);
    }
    if (d.ev === 'bowtaken' && nw.kind === 'murder') {
      for (let i = this.items.length - 1; i >= 0; i--) if (this.items[i].stack.id === ITEM.BOW) { this.items[i].dispose(); this.items.splice(i, 1); }
    }
    // Bots who saw a murder now know who did it
    if (d.nk && nw.kind === 'murder' && this.isAuthority && d.nk.k) {
      const killer = String(d.nk.k);
      let kp = null;
      if (killer === this.settings.name) kp = this.player.pos;
      for (const m of this.mobs.values()) if (m.type === 'bot' && m.name === killer) kp = m.pos;
      for (const rp of this.remotePlayers.values()) if (rp.name === killer) kp = rp.pos;
      if (kp) for (const m of this.mobs.values()) if (m.type === 'bot' && !m.dead && m.name !== killer && m.pos.distanceTo(kp) < 16) m.knows = killer;
    }
  };

  // Bot deaths: bridge bots come back fast; dead detectives drop the bow
  const botDied = P.nwBotDied;
  P.nwBotDied = function (mob) {
    const nw = this.nw;
    botDied.call(this, mob);
    if (nw.kind === 'bridge') { const q = nw.respawnQueue[nw.respawnQueue.length - 1]; if (q) q.at = this.simTime + 1; }
    if (nw.kind === 'murder' && mob.hasBow && mob.role !== 'm') this.nwFeed([['The Detective has been killed!', '#55FFFF']], { bow: [mob.pos.x, Math.max(65, mob.pos.y), mob.pos.z] });
  };
}

// ---------------------------------------------------------------- local player rules
{
  const P = Game.prototype;
  const gameLocal = P.nwGameLocal;
  P.nwGameLocal = function (dt) {
    gameLocal.call(this, dt);
    const nw = this.nw, p = this.player;
    if (!nw || nw.setupFor !== nw.id) return;
    if (nw.kind === 'bridge') {
      // New round: back to your cage with a fresh kit
      if ((nw.round || 0) !== nw.myRound && nw.phase === 'starting') {
        nw.myRound = nw.round || 0;
        const me = nw.me;
        const sp = this.nwSpawnPoint(nw.myTeam, me ? me.slot : 0);
        nw.respawnAt = 0;
        p.setMode('survival');
        p.pos.set(sp.pos[0], sp.pos[1], sp.pos[2]); p.vel.set(0, 0, 0); p.fallStart = null; p.health = 20;
        this.nwGiveKit();
      }
      if (nw.phase === 'playing' && p.mode === 'survival' && boxInBlock(this.world, p.pos, 0.3, 1.0, (b) => b === B.END_PORTAL)) {
        const side = p.pos.x < 0 ? 0 : 1;
        if (side !== nw.myTeam && !nw.goalSent) {
          nw.goalSent = true;
          setTimeout(() => { if (this.nw === nw) nw.goalSent = false; }, 1500);
          if (this.isAuthority) this.nwGoal(this.settings.name, nw.myTeam);
          else this.nwFeed([[this.settings.name, NOVA_TEAMS[nw.myTeam].color], [' jumped in!', '#AAAAAA']], { goal: { n: this.settings.name, t: nw.myTeam } });
          p.pos.y += 3; p.vel.set(0, 0, 0);
        } else if (side === nw.myTeam) { p.health = 0; this.onDeath('void'); }
      }
      p.food = 20;
    }
    if (nw.kind === 'murder' && nw.phase === 'playing') {
      p.food = 20;
      const role = this.nwRole(this.settings.name);
      // the murderer gets the knife after 10 seconds
      if (nw.knifeAt !== null && nw.knifeAt !== undefined) {
        if (nw.elapsed >= nw.knifeAt) { nw.knifeAt = null; p.inventory.slots[1] = stackOf(toolId(2, 3), 1); p.inventory.slots[1].label = 'Knife'; p.inventory.changed(); this.nwTitle('', 'You have your knife!', '#FF5555', 1.5); }
        else if (Math.ceil(nw.knifeAt - nw.elapsed) !== nw.lastKnife) { nw.lastKnife = Math.ceil(nw.knifeAt - nw.elapsed); if (nw.lastKnife <= 5) this.chat.rich([['You get your knife in ', '#FFFF55'], [String(nw.lastKnife), '#FF5555'], [' seconds', '#FFFF55']]); }
      }
      // detectives get their arrow back
      if (p.mode === 'survival' && p.inventory.count(ITEM.BOW) && !p.inventory.count(ITEM.ARROW) && (role === 'd' || nw.hero)) {
        nw.arrowT = (nw.arrowT || 0) + dt;
        if (nw.arrowT > (role === 'd' ? 3 : 5)) { nw.arrowT = 0; p.inventory.add(stackOf(ITEM.ARROW, 1), PICKUP_ORDER); }
      }
      // gold: 10 pieces buy a bow and an arrow
      if (role !== 'm' && p.inventory.count(ITEM.GOLD_INGOT) >= 10) {
        this.nwTake(ITEM.GOLD_INGOT, 10);
        if (!p.inventory.count(ITEM.BOW)) p.inventory.add(stackOf(ITEM.BOW, 1), PICKUP_ORDER);
        p.inventory.add(stackOf(ITEM.ARROW, 1), PICKUP_ORDER);
        this.chat.rich([['You collected 10 gold and got a bow!', '#FFAA00']]);
        Sound.tone(900, 0.2, 0.2, 'triangle', 300);
      }
      // picking up the dropped bow makes you the hero
      if (role !== 'm' && role !== 'd' && !nw.hero && p.inventory.count(ITEM.BOW) && nw.bowWasDropped) { nw.hero = true; this.nwFeed([['A player has picked up the bow!', '#FFAA00']], { ev: 'bowtaken' }); }
      // gold spawns around the map (each player sees their own)
      nw.goldT = (nw.goldT || 0) - dt;
      if (nw.goldT <= 0) {
        nw.goldT = 2.5 + Math.random() * 2;
        let n = 0;
        for (const it of this.items) if (it.stack.id === ITEM.GOLD_INGOT) n++;
        if (n < 10) { const s = nw.spec.goldSpots[Math.floor(Math.random() * nw.spec.goldSpots.length)]; this.spawnItem(stackOf(ITEM.GOLD_INGOT, 1), s[0], s[1], s[2], new THREE.Vector3(0, 0, 0)); }
      }
    }
  };

  // The Bridge: only build in the build zone and only break placed blocks
  const canBreak = P.nwCanBreak;
  P.nwCanBreak = function (id, x, y, z) {
    const nw = this.nw;
    if (nw.kind === 'bridge') return nw.phase === 'playing' && !nw.spec.mapKeys.has(x + ',' + y + ',' + z);
    if (nw.kind === 'murder') return false;
    return canBreak.call(this, id, x, y, z);
  };

  const use = P.use;
  P.use = function () {
    const nw = this.nw;
    if (nw && nw.kind === 'bridge' && nw.phase === 'playing') {
      const t = this.target(), p = this.player, held = p.heldStack;
      if (t.block && held && ITEMS[held.id].block !== null && !ITEMS[held.id].food) {
        const h = t.block;
        const x = h.x + h.normal[0], y = h.y + h.normal[1], z = h.z + h.normal[2];
        const [y0, y1] = nw.spec.buildY;
        const nearGoal = nw.spec.goals.some((g) => Math.abs(x - g.x) <= 3 && Math.abs(z - g.z) <= 3);
        if (y < y0 || y > y1 || Math.abs(z) > 12 || nearGoal) { if (this.useCooldown <= 0) { this.useCooldown = 0.4; this.chat.rich([["You can't place blocks there!", '#FF5555']]); } return; }
      }
    }
    if (nw && nw.kind === 'murder') {
      const p = this.player, held = p.heldStack;
      if (held && ITEMS[held.id].block !== null && !ITEMS[held.id].food) return; // no building
    }
    use.call(this);
  };

  // Murder Mystery melee: only the murderer's knife hurts, and it kills in one hit
  const attack = P.attackEntity;
  P.attackEntity = function (ent) {
    const nw = this.nw;
    if (nw && nw.kind === 'murder' && nw.phase === 'playing' && !(ent instanceof Boat) && !(ent instanceof Mob && ent.npc)) {
      if (this.attackCooldown > 0 || this.player.mode === 'spectator') return;
      this.attackCooldown = 0.6;
      this.doSwing();
      const held = this.player.heldStack;
      const knife = this.nwRole(this.settings.name) === 'm' && held && ITEMS[held.id].tool && ITEMS[held.id].tool.type === 'sword';
      if (!knife) return;
      const dir = this.player.lookDir();
      if (ent instanceof Mob) {
        if (this.isAuthority) { if (ent.hurt(100, dir.x, dir.z, null) && ent.dead) this.onMobKilled(ent, null); }
        else { ent.hurtTime = 0.4; this.net.send('hitmob', { id: ent.id, dmg: 20, kx: dir.x, kz: dir.z }); }
      } else if (ent instanceof RemotePlayer) {
        ent.hurtTime = 0.4;
        this.net.send('hurt', { to: ent.peer, dmg: 40, kx: dir.x * 3, ky: 3, kz: dir.z * 3, by: this.settings.name });
      }
      Sound.noise(1500, 1, 0.15, 0.35);
      return;
    }
    attack.call(this, ent);
  };

  // Murder Mystery: dying as the detective (or hero) drops the bow; murders are never respawned
  const death = P.nwLocalDeath;
  P.nwLocalDeath = function (cause) {
    const nw = this.nw, p = this.player;
    if (nw && nw.kind === 'murder' && p.mode !== 'spectator' && p.inventory.count(ITEM.BOW) && this.nwRole(this.settings.name) !== 'm') {
      this.nwFeed([['The Detective has been killed!', '#55FFFF']], { bow: [p.pos.x, Math.max(65, p.pos.y), p.pos.z] });
      nw.bowWasDropped = true;
    }
    death.call(this, cause);
  };
}

// Arrows in Murder Mystery kill instantly; shooting an innocent kills the shooter
{
  const hit = Projectile.prototype.onHitEntity;
  Projectile.prototype.onHitEntity = function (c, dir) {
    const g = this.game, nw = g.nw;
    if (!nw || nw.kind !== 'murder' || this.kind !== 'arrow') return hit.call(this, c, dir);
    const shooterName = this.fromPlayer ? g.settings.name : this.owner instanceof Mob ? this.owner.name : null;
    let victimName = null;
    if (c === 'local') { victimName = g.settings.name; if (shooterName) g.lastHurtBy = { name: shooterName, t: performance.now() }; g.player.damage(40, 'arrow', { x: dir.x * 2, y: 2, z: dir.z * 2 }); }
    else if (c instanceof RemotePlayer) { victimName = c.name; g.net.send('hurt', { to: c.peer, dmg: 40, kx: dir.x, ky: 2, kz: dir.z, by: shooterName || undefined }); }
    else if (c instanceof Mob) {
      victimName = c.name || null;
      if (g.isAuthority) { if (c.hurt(100, dir.x, dir.z, this.owner instanceof Mob ? this.owner : null) && c.dead) g.onMobKilled(c, null); }
      else g.net.send('hitmob', { id: c.id, dmg: 20, kx: dir.x, kz: dir.z });
    }
    Sound.noise(1200, 1, 0.12, 0.3);
    // shooting an innocent is a death sentence
    if (victimName && g.nwRole(victimName) !== 'm') {
      if (this.fromPlayer && g.player.mode === 'survival') { g.chat.rich([['You killed an innocent!', '#FF5555']]); g.lastHurtBy = null; g.player.damage(40, 'kill'); }
      else if (this.owner instanceof Mob && g.isAuthority && !this.owner.dead) { this.owner.health = 0; this.owner.deathTime = 0; }
    }
  };
}

// ---------------------------------------------------------------- bots
{
  const ai = MOB_AI.bot;
  MOB_AI.bot = function (dt) {
    const g = this.game, nw = g.nw;
    if (!nw || this.npc || (nw.kind !== 'bridge' && nw.kind !== 'murder') || nw.phase !== 'playing' || this.pos.y < nw.spec.voidY) return ai.call(this, dt);
    const enemies = botEnemies(this);
    let near = null, nd = Infinity;
    for (const e of enemies) { const d = e.pos.distanceTo(this.pos); if (d < nd) { nd = d; near = e; } }
    if (nw.kind === 'bridge') {
      const goal = nw.spec.goals[1 - this.team], own = nw.spec.goals[this.team];
      this.blocks = 999;
      // let the cage drop us onto the base first
      if (this.pos.y > 72.5 || nw.elapsed < 1) { this._locomote(dt, 0, 0, 0); return; }
      const toGoal = Math.hypot(goal.x - this.pos.x, goal.z - this.pos.z);
      // close to the goal: dive in, whatever is around
      if (toGoal < 9) { this._botMove(dt, new THREE.Vector3(goal.x + 0.5, 71, goal.z + 0.5), 5.6, 0.2); return; }
      // defenders take turns pushing forward
      this.swapT = (this.swapT || 0) + dt;
      if (this.swapT > 18) { this.swapT = 0; if (Math.random() < 0.45) this.role = this.role === 'defender' ? 'rusher' : 'defender'; }
      if (near && nd < (this.role === 'defender' ? 7 : 3.5)) { this._botMove(dt, near.pos, nd > 3 ? 5.4 : 4.6, 2.2); this._botFight(dt, near); return; }
      if (this.role === 'defender') {
        const threat = enemies.find((e) => Math.hypot(e.pos.x - own.x, e.pos.z - own.z) < 18);
        if (threat) { this._botMove(dt, threat.pos, 5.4, 2.2); this._botFight(dt, threat); return; }
        const guard = new THREE.Vector3(own.x * 0.82, 71, 0);
        this._botMove(dt, guard, 3, 2);
        return;
      }
      if (near && nd < 16 && this.hasBow) this._botFight(dt, near);
      this._botMove(dt, new THREE.Vector3(goal.x + 0.5, 71, goal.z + 0.5), 5.2, 0.2);
      return;
    }
    // Murder Mystery
    const spec = nw.spec;
    if (this.role === 'm') {
      const armed = nw.elapsed > 10;
      // pick a victim: someone alone, or anyone once time is running out
      let target = null, best = Infinity;
      for (const e of enemies) {
        let crowd = 0;
        for (const o of enemies) if (o !== e && o.pos.distanceTo(e.pos) < 6) crowd++;
        const score = e.pos.distanceTo(this.pos) + crowd * (nw.elapsed > 120 ? 2 : 12);
        if (score < best) { best = score; target = e; }
      }
      if (armed && target && (best < 26 || nw.elapsed > 90)) {
        const d = target.pos.distanceTo(this.pos);
        if (d < 8 && this.holding !== 'knife') { this.holding = 'knife'; this._setWeapon(toolId(2, 3)); }
        this._botMove(dt, target.pos, d < 10 ? 5.4 : 4.3, 1.4);
        if (d < 2.6 && this.attackCooldown === 0) {
          this.attackCooldown = 0.8; this.swing = 1;
          if (target.human) { g.curAttacker = this.name; g.damagePlayer(target.target, 40, { x: 0, y: 3, z: 0 }, 'player'); g.curAttacker = null; }
          else target.target.hurt(100, target.pos.x - this.pos.x, target.pos.z - this.pos.z, this);
          Sound.noise(1500, 1, 0.15, 0.3);
        }
        return;
      }
      if (this.holding === 'knife') { this.holding = null; this._setWeapon(0); }
    } else {
      // anyone who knows the murderer runs, or hunts them if they have a bow
      const killer = this.knows ? enemies.find((e) => e.name === this.knows) : null;
      if (killer) {
        const d = killer.pos.distanceTo(this.pos);
        if (this.hasBow) {
          if (d > 8) this._botMove(dt, killer.pos, 4.6, 7);
          else { const away = this.pos.clone().multiplyScalar(2).sub(killer.pos); this._botMove(dt, away, 3.6, 0.5); }
          if (d < 22 && this.attackCooldown === 0 && this.canSee(killer.pos)) {
            this.attackCooldown = 2.2; this.swing = 1;
            const from = new THREE.Vector3(this.pos.x, this.pos.y + 1.5, this.pos.z);
            const v = new THREE.Vector3(killer.pos.x, killer.pos.y + 1.1 + d * 0.04, killer.pos.z).sub(from).normalize().multiplyScalar(42);
            v.x += (Math.random() - 0.5) * 1.6; v.z += (Math.random() - 0.5) * 1.6;
            g.spawnProjectile('arrow', from.addScaledVector(v.clone().normalize(), 0.8), v, { owner: this, damage: 40 });
            Sound.noise(1500, 2, 0.15, 0.25);
          }
          return;
        }
        if (d < 14) { const away = this.pos.clone().multiplyScalar(2).sub(killer.pos); this._botMove(dt, away, 5.2, 0.5); return; }
      }
      // pick up the dropped bow
      if (nw.bowDrop && !this.hasBow) { this._botMove(dt, new THREE.Vector3(nw.bowDrop[0], 65, nw.bowDrop[2]), 5, 0.3); return; }
    }
    // wander between gold spots and collect gold
    if (!this.goal || this.pos.distanceTo(this.goal) < 1.2) {
      if (this.goal && this.role !== 'm') { this.gold = (this.gold || 0) + (Math.random() < 0.5 ? 1 : 0); if (this.gold >= 10 && !this.hasBow) { this.hasBow = true; this.arrows = 1; } }
      const s = spec.goldSpots[Math.floor(Math.random() * spec.goldSpots.length)];
      this.goal = new THREE.Vector3(s[0], 65, s[2]);
    }
    this._botMove(dt, this.goal, 3.2, 0.6);
  };

  // No name tags in Murder Mystery (you have to work out who's who)
  const render = MOB_RENDER.bot;
  MOB_RENDER.bot = function (light) {
    render.call(this, light);
    const nw = this.game.nw;
    if (this.tag) this.tag.visible = !(nw && nw.kind === 'murder' && !this.npc);
  };
}
{
  const tags = Game.prototype.nwRemoteTags;
  Game.prototype.nwRemoteTags = function () {
    tags.call(this);
    const hide = this.nw && this.nw.kind === 'murder';
    for (const rp of this.remotePlayers.values()) if (rp.tag) rp.tag.visible = !hide;
  };
}

// ---------------------------------------------------------------- network state
{
  const wire = NovaState.prototype.toWire;
  NovaState.prototype.toWire = function () {
    const w = wire.call(this);
    w.sc = (this.score || [0, 0]).join(',');
    w.rd = this.round || 0;
    if (this.kind === 'murder') w.mb.forEach((row, i) => { row[8] = this.members[i].role || 'i'; });
    if (this.kind === 'bridge') w.mb.forEach((row, i) => { row[9] = this.members[i].goals || 0; });
    return w;
  };
  const hostPres = Game.prototype.onHostPresence;
  Game.prototype.onHostPresence = function (pres) {
    hostPres.call(this, pres);
    const nw = this.nw, mg = pres.mg;
    if (!nw || !mg) return;
    if (typeof mg.sc === 'string') nw.score = mg.sc.split(',').map((v) => v | 0);
    nw.round = mg.rd | 0;
    if (Array.isArray(mg.mb)) mg.mb.forEach((a, i) => {
      const m = nw.members[i];
      if (!m || !Array.isArray(a)) return;
      if (typeof a[8] === 'string') m.role = 'mdi'.includes(a[8]) ? a[8] : 'i';
      m.goals = a[9] | 0;
      if (nw.kind === 'bridge') m.slot = i;
    });
  };
}

// End screens for the new games
{
  const show = Game.prototype.nwShowEnd;
  Game.prototype.nwShowEnd = function () {
    const nw = this.nw;
    if (nw.kind === 'murder') {
      const role = this.nwRole(this.settings.name);
      const murdererWon = nw.winnerTeam === -2;
      const won = murdererWon ? role === 'm' : role !== 'm';
      const prof = NovaProfile.get();
      if (won) { prof.wins.murder = (prof.wins.murder || 0) + 1; prof.coins += 100; prof.streak = (prof.streak || 0) + 1; }
      else prof.streak = 0;
      NovaProfile.save();
      this.nwTitle(won ? 'YOU WIN!' : 'YOU LOSE!', murdererWon ? 'The Murderer won!' : 'The Murderer has been stopped!', won ? '#55FF55' : '#FF5555', 5);
      if (won) this.chat.rich([['+100 coins! ', '#FFAA00'], ['(Win)', '#AAAAAA']]);
      return;
    }
    show.call(this);
  };
}

// ---------------------------------------------------------------- scoreboards
{
  const hud = Game.prototype.nwRenderHud;
  Game.prototype.nwRenderHud = function () {
    const nw = this.nw;
    if (!nw || (nw.kind !== 'bridge' && nw.kind !== 'murder')) return hud.call(this);
    const sb = document.getElementById('nova-board');
    nw.hudT2 = (nw.hudT2 || 0) - 1;
    if (nw.hudT2 > 0 || !sb) return;
    nw.hudT2 = 10;
    sb.hidden = !!(this.ui && this.ui.hideHud);
    const d = new Date();
    const date = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
    const lines = [];
    const add = (...segs) => lines.push(segs);
    let title;
    if (nw.kind === 'bridge') {
      title = 'THE BRIDGE';
      add([date + '  m' + nw.id + 'T', '#555555']);
      add(['', '']);
      add(['Time Left: ', '#FFFFFF'], [fmtTime(600 - nw.elapsed), '#55FF55']);
      add(['', '']);
      for (const t of [0, 1]) {
        const s = nw.score ? nw.score[t] : 0;
        add([`[${NOVA_TEAMS[t].letter}] `, NOVA_TEAMS[t].color], ['⬤'.repeat(s), NOVA_TEAMS[t].color], ['⬤'.repeat(Math.max(0, BRIDGE_WIN - s)), '#555555']);
      }
      add(['', '']);
      const me = nw.me || { kills: 0, goals: 0 };
      add(['Kills: ', '#FFFFFF'], [String(me.kills + (me.finals || 0)), '#55FF55']);
      add(['Goals: ', '#FFFFFF'], [String(me.goals || 0), '#55FF55']);
      add(['', '']);
      add(['Mode: ', '#FFFFFF'], ['Doubles', '#55FF55']);
    } else {
      title = 'MURDER MYSTERY';
      const role = this.nwRole(this.settings.name);
      const ri = ROLE_INFO[role];
      add([date + '  m' + nw.id + 'M', '#555555']);
      add(['', '']);
      add(['Role: ', '#FFFFFF'], [ri.name[0] + ri.name.slice(1).toLowerCase(), ri.color]);
      add(['', '']);
      const innocents = nw.members.filter((m) => m.role !== 'm' && nw.memberAlive(m)).length;
      add(['Innocents Left: ', '#FFFFFF'], [String(innocents), '#55FF55']);
      add(['Time Left: ', '#FFFFFF'], [nw.phase === 'starting' ? 'Starting...' : fmtTime(MURDER_TIME - nw.elapsed), '#55FF55']);
      add(['', '']);
      const det = nw.members.find((m) => m.role === 'd');
      add(['Detective: ', '#FFFFFF'], det && nw.memberAlive(det) ? ['Alive', '#55FF55'] : ['Bow Dropped', '#FFAA00']);
      if (role !== 'm') add(['Gold: ', '#FFFFFF'], [String(this.player.inventory.count(ITEM.GOLD_INGOT)) + '/10', '#FFAA00']);
      add(['', '']);
      add(['Map: ', '#FFFFFF'], ['Old Square', '#55FF55']);
    }
    add(['', '']);
    add(['nova network', '#FFFF55']);
    const html = (segs) => segs.map(([t, c]) => `<span style="color:${c}">${escapeHtml(t) || '&nbsp;'}</span>`).join('');
    sb.innerHTML = `<div class="nb-title">${escapeHtml(title)}</div>` + lines.map((l) => `<div class="nb-line">${html(l)}</div>`).join('');
    const tab = document.getElementById('nova-tab');
    if (tab && !tab.hidden) this.nwRenderTab(tab);
  };
}

// End portals are goals in The Bridge, not a way to the End
{
  const endPortal = Game.prototype.updateEndPortal;
  Game.prototype.updateEndPortal = function (dt) { if (this.nw) return; endPortal.call(this, dt); };
}
TIPS.push('The Bridge: jump into the enemy goal to score', 'Murder Mystery: 10 gold gets you a bow');

// NPCs for the new games hold something fitting
{
  const init = MOB_INIT.bot;
  MOB_INIT.bot = function (extra) {
    init.call(this, extra);
    if (this.npc === 'bridge') this._setWeapon(B.WOOL_BLUE);
    if (this.npc === 'murder') this._setWeapon(toolId(2, 3));
  };
}
