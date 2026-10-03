// Nova Network: a minigame server you join from the Multiplayer screen. A hub lobby with
// NPCs, parkour, ranks and chat, plus Bed Wars and SkyWars matches filled with bot
// players. The player who starts it (or opens it to friends) is the host: the host runs
// the bots, the match clock and the rules, and friends who join play on the same teams.
'use strict';

const NOVA_NAME = 'NOVA NETWORK';
const NOVA_RANKS = {
  '': { color: '#AAAAAA', segs: [] },
  VIP: { color: '#55FF55', segs: [['[VIP]', '#55FF55']] },
  'VIP+': { color: '#55FF55', segs: [['[VIP', '#55FF55'], ['+', '#FFAA00'], [']', '#55FF55']] },
  MVP: { color: '#55FFFF', segs: [['[MVP]', '#55FFFF']] },
  'MVP+': { color: '#55FFFF', segs: [['[MVP', '#55FFFF'], ['+', '#FF5555'], [']', '#55FFFF']] },
};
const NOVA_GAMES = {
  bedwars: { title: 'BED WARS', color: '#FF5555', icon: B.BED_FOOT, desc: '4 teams of 2. Protect your bed, destroy the others.', mode: '4v4v4v4 Doubles' },
  skywars: { title: 'SKYWARS', color: '#55FFFF', icon: ITEM.BOW, desc: '8 players on floating islands. Loot, bridge and be the last one standing.', mode: 'Solo Normal' },
  duels: { title: 'DUELS', color: '#FFAA00', icon: toolId(2, 3), desc: '1v1 Classic. Iron sword, bow and iron armor. First to fall loses.', mode: 'Classic 1v1' },
};
const SLOTS = { bedwars: 8, skywars: 8, duels: 2, bridge: 4, murder: 8 };
const TEAM_GAMES = new Set(['bedwars', 'bridge']);
const BOT_A = ['Shadow', 'Pixel', 'Crafty', 'Diamond', 'Ender', 'Blaze', 'Frosty', 'Turbo', 'Lucky', 'Cyber', 'Swift', 'Ninja', 'Dino', 'Cookie', 'Waffle', 'Rusty', 'Echo', 'Storm', 'Mango', 'Sneaky', 'Sir', 'Captain', 'Toast', 'Nether', 'Obsidian', 'Lava', 'Creeper', 'Ghost'];
const BOT_B = ['Miner', 'Wolf', 'Gamer', 'Knight', 'Builder', 'Hunter', 'Pvp', 'Bridger', 'Clutch', 'Fox', 'Tiger', 'Panda', 'Slayer', 'Archer', 'Bean', 'Noodle', 'Potato', 'Yeti', 'Taco', 'Pickle', 'Golem', 'Blocks', 'Cactus'];
const LOBBY_LINES = ['anyone wanna bedwars?', 'gg', 'how do i get mvp+', 'parkour is so hard', 'hi', 'who wants to party', 'skywars is better than bedwars', 'lag?', 'just got 10 finals in one game', 'what is this server called again', 'lol', 'that parkour took me 20 tries', 'bedwars or skywars?', 'good morning', 'whos online', 'i love this lobby', 'can someone teach me speedbridging', 'brb', 'nice', 'fountain looks cool'];
const GAME_LINES = ['gl hf', 'rush mid?', 'who is on red', 'nooo my bed', 'gg', 'gg wp', 'close one', 'teaming?', 'lol', 'they are coming', 'defend!', 'ez', 'one more'];
const BW_BREAKABLE = new Set([B.WOOL_WHITE, B.WOOL_RED, B.WOOL_BLUE, B.WOOL_YELLOW, B.WOOL_GREEN, B.WOOL_BLACK, B.END_STONE, B.PLANKS, B.OBSIDIAN, B.LADDER, B.TNT, B.GLASS, B.COBBLE]);
const BW_BLASTABLE = new Set([B.WOOL_WHITE, B.WOOL_RED, B.WOOL_BLUE, B.WOOL_YELLOW, B.WOOL_GREEN, B.WOOL_BLACK, B.PLANKS, B.LADDER, B.TNT, B.COBBLE]);

function novaRank(rk) { return NOVA_RANKS[rk] || NOVA_RANKS['']; }
// Chat-style segments for a ranked name: [MVP+] Name
function rankedName(name, rk) {
  const r = novaRank(rk);
  return r.segs.length ? [...r.segs, [' ' + name, r.color]] : [[name, r.color]];
}
function segsText(segs) { return segs.map((s) => s[0]).join(''); }

// ---------------------------------------------------------------- saved profile
const NovaProfile = {
  data: null,
  get() {
    if (this.data) return this.data;
    let d = null;
    try { d = JSON.parse(localStorage.getItem('nova-profile') || 'null'); } catch (e) { d = null; }
    this.data = Object.assign({ coins: 0, kills: 0, finals: 0, beds: 0, wins: { bedwars: 0, skywars: 0 }, played: 0, parkour: null, rank: 'MVP+' }, d || {});
    return this.data;
  },
  save() { try { localStorage.setItem('nova-profile', JSON.stringify(this.get())); } catch (e) { /* storage blocked */ } },
  level() { const p = this.get(); return 1 + Math.floor(Math.sqrt((p.coins + p.kills * 5 + p.played * 20) / 40)); },
};

// ---------------------------------------------------------------- name tags and holograms
function novaTag(lines, scale = 0.3) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = (l) => `${l.bold ? 'bold ' : ''}${l.size || 28}px monospace`;
  let w = 0, h = 0;
  for (const l of lines) {
    ctx.font = font(l);
    w = Math.max(w, ctx.measureText(segsText(l.segs)).width);
    h += (l.size || 28) + 10;
  }
  c.width = Math.ceil(w) + 16; c.height = h + 4;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, c.width, c.height);
  let y = 2;
  for (const l of lines) {
    const sz = l.size || 28;
    ctx.font = font(l);
    ctx.textBaseline = 'middle';
    let x = (c.width - ctx.measureText(segsText(l.segs)).width) / 2;
    for (const [t, col] of l.segs) {
      ctx.fillStyle = '#000'; ctx.fillText(t, x + 2, y + sz / 2 + 7);
      ctx.fillStyle = col; ctx.fillText(t, x, y + sz / 2 + 5);
      x += ctx.measureText(t).width;
    }
    y += sz + 10;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true }));
  spr.scale.set(c.width / 38 * scale, c.height / 38 * scale, 1);
  spr.center.set(0.5, 0);
  return spr;
}

// ---------------------------------------------------------------- bot models
function buildBotModel(info) {
  const team = info.team >= 0 && info.team < 4 ? NOVA_TEAMS[info.team] : null;
  const v = (info.skin | 0) + 1;
  const key = `bot_${team ? 't' + info.team : 'r'}_${v}`;
  const skin = playerSkinTexture(key, outfitFor(v, team ? team.shirt : null), v * 13 + 7);
  const model = buildHumanModel(skin);
  model.phase = v * 0.7;
  return model;
}
EXTRA_MODELS.bot = () => buildBotModel({ team: -1, skin: 0 });

function encodeBot(i) { return [i.name, i.rank || '', i.team ?? -1, i.npc || '', i.skin | 0, i.sword ?? -1].join('|'); }
function decodeBot(s) {
  const [name, rank, team, npc, skin, sword] = String(s).split('|');
  return { name: (name || 'Bot').slice(0, 24), rank: NOVA_RANKS[rank] ? rank : '', team: parseInt(team, 10), npc: npc || null, skin: parseInt(skin, 10) || 0, sword: parseInt(sword, 10) };
}

MOB_TYPES.push('bot');
MOB_INFO.bot = { health: 20, speed: 4.3, hostile: false, persistent: true };
MOB_XP.bot = [0, 0];

MOB_INIT.bot = function (extra) {
  const info = extra.info ? decodeBot(extra.info) : Object.assign({ name: 'Bot', rank: '', team: -1, npc: null, skin: 0, sword: -1 }, extra.bot || {});
  this.bot = info;
  this.botInfo = encodeBot(info);
  this.name = info.name;
  this.team = info.team;
  this.npc = info.npc;
  this.model.mat.dispose();
  this.model.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  if (info.npc === 'shop') { this.model = buildModel('villager_armorer'); this.profession = 'armorer'; }
  else this.model = buildBotModel(info);
  this.w = 0.6; this.h = 1.8;
  this.health = 20;
  this.armor = 0;
  this.blocks = 0;
  this.plan = null;
  this.stuckT = 0; this.lastCheck = this.pos.clone(); this.sideT = 0; this.side = 1;
  this.placeT = 0; this.shopT = 0; this.bedT = 0; this.chatT = 10 + Math.random() * 30;
  this.goal = null;
  this.role = Math.random() < 0.65 ? 'rusher' : 'defender';
  if (info.sword >= 0) { this._setWeapon(toolId(info.sword, 3)); this.swordTier = info.sword; }
  if (info.npc === 'bedwars') this._setWeapon(B.WOOL_RED);
  if (info.npc === 'skywars') this._setWeapon(ITEM.BOW);
  if (info.npc === 'duels') this._setWeapon(toolId(2, 3));
  // Floating name: team letter or rank, coloured like the chat
  let segs;
  if (info.npc === 'shop') segs = [['ITEM SHOP', '#FFFF55']];
  else if (info.npc) segs = [['CLICK TO PLAY', '#FFFF55']];
  else if (info.team >= 0 && info.team < 4) segs = [[NOVA_TEAMS[info.team].letter + ' ', NOVA_TEAMS[info.team].color], [info.name, NOVA_TEAMS[info.team].color]];
  else segs = rankedName(info.name, info.rank);
  this.tag = novaTag([{ segs, bold: !!info.npc }], 0.26);
  this.tag.position.y = info.npc === 'shop' ? 2.15 : 2.05;
  this.model.root.add(this.tag);
};

MOB_RENDER.bot = function () {
  if (this.npc === 'shop') return;
  if (!this.npc && this.walkAmount > 0.3 && this.onGround !== false) {
    this.stepPhase = (this.stepPhase || 0);
    const ph = Math.floor(this.walkPhase / Math.PI);
    if (ph !== this.stepPhase) {
      this.stepPhase = ph;
      const w = this.game.world, under = w.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.1), Math.floor(this.pos.z));
      if (under && BLOCKS[under] && BLOCKS[under].sound) Sound.step(BLOCKS[under].sound, 0.7, this.pos);
    }
  }
  animateModel(this.model, 'player', this.walkPhase, this.walkAmount, 0, this.lookPitch || 0, this.swing);
};

const _botHurt = Mob.prototype.hurt;
Mob.prototype.hurt = function (amount, kx, kz, attacker) {
  if (this.type === 'bot') {
    const g = this.game, nw = g.nw;
    if (this.npc || !nw || nw.phase !== 'playing') return false;
    let atkTeam;
    if (attacker instanceof Mob) atkTeam = attacker.team;
    else if (attacker === null) atkTeam = nw.myTeam;
    else if (typeof attacker === 'string' && attacker !== 'env') atkTeam = nw.teamOfPeer(attacker);
    if (atkTeam !== undefined && atkTeam >= 0 && atkTeam === this.team) return false;
    amount *= 1 - (this.armor || 0);
    this.lastHitTime = g.simTime;
    if (attacker instanceof Mob || attacker === null || typeof attacker === 'string') this.revenge = attacker;
  }
  return _botHurt.call(this, amount, kx, kz, attacker);
};

// ---------------------------------------------------------------- bot brains
function botEnemies(bot) {
  const g = bot.game, nw = g.nw, out = [];
  for (const p of g.allPlayers()) {
    if (p.mode !== 'survival' && p.mode !== 'adventure') continue;
    const name = p.local ? g.settings.name : (g.remotePlayers.get(p.peer) || {}).name;
    const team = nw.teamOfName(name);
    if (team === undefined || team === bot.team) continue;
    out.push({ pos: p.pos, target: p, name, human: true });
  }
  for (const m of g.mobs.values()) {
    if (m === bot || m.type !== 'bot' || m.npc || m.dead || m.team === bot.team || m.team < 0) continue;
    out.push({ pos: m.pos, target: m, name: m.name, human: false });
  }
  return out;
}

Object.assign(Mob.prototype, {
  // Walk toward a point, laying blocks over gaps when the bot has some.
  _botMove(dt, goal, speed, stopAt = 1.2) {
    const g = this.game, w = g.world, nw = g.nw;
    let dirX = 0, dirZ = 0, sp = 0;
    if (goal) {
      const dx = goal.x - this.pos.x, dz = goal.z - this.pos.z;
      const d = Math.hypot(dx, dz) || 0.01;
      this.targetYaw = Math.atan2(-dx, -dz);
      if (d > stopAt) { dirX = dx / d; dirZ = dz / d; sp = speed; }
    }
    // heading somewhere well below: just walk off the edge instead of bridging out level
    const dropping = goal && goal.y > 0 && goal.y < this.pos.y - 2.5;
    if (sp > 0 && !dropping) {
      // strafe a little when stuck
      if (this.sideT > 0) { this.sideT -= dt; const sx = -dirZ * this.side, sz = dirX * this.side; dirX = dirX * 0.4 + sx; dirZ = dirZ * 0.4 + sz; }
      const fy = Math.floor(this.pos.y + 0.01) - 1;
      const ax = Math.floor(this.pos.x + dirX * 0.85), az = Math.floor(this.pos.z + dirZ * 0.85);
      const cx = Math.floor(this.pos.x), cz = Math.floor(this.pos.z);
      const gap = (x, z) => !isSolid(w.getBlock(x, fy, z)) && !isSolid(w.getBlock(x, fy - 1, z)) && !isSolid(w.getBlock(x, fy - 2, z));
      this.placeT -= dt;
      if (this.onGround && gap(ax, az)) {
        if (this.blocks > 0 && fy > nw.spec.voidY + 8) {
          sp = Math.min(sp, 2.6);
          if (this.placeT <= 0 && w.getBlock(ax, fy, az) === B.AIR) {
            this.placeT = 0.22;
            this.blocks--;
            this.swing = 1;
            if (this.holding !== 'block') { this.holding = 'block'; this._setWeapon(TEAM_GAMES.has(nw.kind) ? NOVA_TEAMS[this.team].wool : B.COBBLE); }
            g.changeBlock(ax, fy, az, TEAM_GAMES.has(nw.kind) ? NOVA_TEAMS[this.team].wool : B.COBBLE, { noUpdate: true, batch: true });
          }
          if (!isSolid(w.getBlock(ax, fy, az))) sp = 0.4;
        } else sp = 0;
      }
      if (!this.onGround && this.vel.y < 0 && this.blocks > 0 && w.getBlock(cx, fy, cz) === B.AIR && this.placeT <= 0 && this.pos.y - fy < 1.4) {
        this.placeT = 0.15; this.blocks--;
        g.changeBlock(cx, fy, cz, TEAM_GAMES.has(nw.kind) ? NOVA_TEAMS[this.team].wool : B.COBBLE, { noUpdate: true, batch: true });
      }
    }
    // Stuck: hop and step sideways for a moment
    this.stuckT += dt;
    if (this.stuckT > 1.5) {
      if (sp > 0 && this.lastCheck.distanceTo(this.pos) < 0.5) { if (this.onGround) this.vel.y = 8.6; this.sideT = 0.8; this.side = -this.side; }
      this.stuckT = 0; this.lastCheck.copy(this.pos);
    }
    return this._locomote(dt, dirX, dirZ, sp);
  },

  _botFight(dt, e) {
    const g = this.game, nw = g.nw;
    if (this.holding === 'block') { this.holding = 'sword'; this._setWeapon(toolId(Math.max(0, this.swordTier || 0), 3)); }
    const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z, dy = e.pos.y - this.pos.y;
    const d = Math.hypot(dx, dz) || 0.01;
    this.lookPitch = Math.atan2(dy, d) * 0.5;
    // circle-strafe in close combat
    if (d < 4.5 && Math.random() < dt * 1.6) { this.sideT = 0.35 + Math.random() * 0.4; this.side = Math.random() < 0.5 ? -1 : 1; }
    // Bow at range
    if (this.hasBow && d > 7 && d < 24 && this.attackCooldown === 0 && (this.arrows ?? 8) > 0 && Math.random() < dt * 2 && this.canSee(e.pos)) {
      this.attackCooldown = 1.3 + Math.random();
      this.swing = 1;
      if (this.arrows !== undefined) this.arrows--;
      const from = new THREE.Vector3(this.pos.x, this.pos.y + 1.5, this.pos.z);
      const lead = e.target && e.target.vel ? e.target.vel.clone().multiplyScalar(d / 40) : new THREE.Vector3();
      const to = new THREE.Vector3(e.pos.x + lead.x, e.pos.y + 1.1 + d * 0.045, e.pos.z + lead.z);
      const v = to.sub(from).normalize().multiplyScalar(40);
      v.x += (Math.random() - 0.5) * 2.4 / (this.difficulty || 1); v.y += (Math.random() - 0.5) * 1.4; v.z += (Math.random() - 0.5) * 2.4 / (this.difficulty || 1);
      g.spawnProjectile('arrow', from.addScaledVector(v.clone().normalize(), 0.8), v, { owner: this, damage: 4 + Math.floor(Math.random() * 3) });
      Sound.bow(this.pos);
      return;
    }
    if (d < 3.1 && Math.abs(dy) < 2.5 && this.attackCooldown === 0) {
      this.attackCooldown = (0.42 + Math.random() * 0.25) / (this.difficulty || 1);
      this.swing = 1;
      if (Math.random() < 0.72 + 0.12 * (this.difficulty || 1)) {
        const base = [4, 5, 6, 4, 7][Math.max(0, this.swordTier || 0)] || 4;
        const crit = !this.onGround && this.vel.y < 0 ? 1.5 : 1;
        const sharp = nw && nw.kind === 'bedwars' && this.team >= 0 && this.team < 4 && nw.up[this.team][0] ? 1.25 : 0;
        const dmg = Math.round((base + sharp) * crit * (0.8 + Math.random() * 0.25));
        if (e.human) {
          g.curAttacker = this.name;
          g.damagePlayer(e.target, dmg, { x: dx / d * 6, y: 5, z: dz / d * 6 }, 'player');
          g.curAttacker = null;
        } else {
          e.target.hurt(dmg, dx, dz, this);
        }
        if (Math.random() < 0.3 && this.onGround) this.vel.y = 7; // jump crits
      }
    }
  },

  _setWeapon(id) {
    const arm = this.model.parts.armR;
    if (!arm) return;
    if (this.weaponMesh) { arm.remove(this.weaponMesh); this.weaponMesh.geometry.dispose(); this.weaponMesh = null; }
    if (!id) return;
    const before = new Set(arm.children);
    this._giveWeapon(id);
    this.weaponMesh = arm.children.find((c) => !before.has(c)) || null;
  },

  _botRegear() {
    const nw = this.game.nw;
    let tier = this.swordTier ?? 0;
    if (nw.kind === 'bedwars') tier = nw.elapsed > 150 ? 2 : nw.elapsed > 20 ? 1 : 0;
    if (tier !== this.swordTier) {
      this.swordTier = tier;
      this._setWeapon(toolId(tier, 3));
      this.bot.sword = tier;
      this.botInfo = encodeBot(this.bot);
    }
    if (nw.kind === 'bedwars') this.armor = (nw.elapsed > 200 ? 0.4 : nw.elapsed > 60 ? 0.25 : 0.1) + 0.06 * (nw.up[this.team] ? nw.up[this.team][1] : 0);
  },
});

Object.assign(MOB_AI, {
  bot(dt) {
    const g = this.game, nw = g.nw;
    if (!nw) { this._locomote(dt, 0, 0, 0); return; }
    if (this.npc) {
      // NPCs stand still and watch the nearest player
      const p = g.player;
      if (p && p.pos.distanceTo(this.pos) < 10) this.targetYaw = Math.atan2(-(p.pos.x - this.pos.x), -(p.pos.z - this.pos.z));
      if (this.home) { this.pos.x = this.home[0]; this.pos.z = this.home[2]; }
      this._locomote(dt, 0, 0, 0);
      return;
    }
    if (nw.kind === 'lobby') {
      // Wander the hub, hop around, sometimes race to the parkour
      // stay out of the fountain: climb out if we fell in, and wander around it rather than through it
      const rc = Math.hypot(this.pos.x, this.pos.z) || 0.01;
      if (rc < 4.8) {
        if (this.onGround || boxInBlock(g.world, this.pos, this.w, 0.6, isWater)) this.vel.y = Math.max(this.vel.y, 7.5);
        this._botMove(dt, new THREE.Vector3(this.pos.x / rc * 8, 65, this.pos.z / rc * 8), 3.6, 0.5);
        return;
      }
      if (!this.goal || this.pos.distanceTo(this.goal) < 1.5 || Math.random() < dt * 0.05) {
        const a = Math.atan2(this.pos.z, this.pos.x) + (Math.random() - 0.5) * 2.2, r = 6 + Math.random() * 13;
        this.goal = Math.random() < 0.25 ? null : new THREE.Vector3(Math.cos(a) * r, 65, Math.sin(a) * r);
        this.sprint = Math.random() < 0.3;
      }
      if (!this.goal) { this._locomote(dt, 0, 0, 0); return; }
      if (Math.random() < dt * 0.15 && this.onGround) this.vel.y = 8.6;
      this._botMove(dt, this.goal, 3.2 + (this.sprint ? 1.4 : 0), 0.5);
      return;
    }
    if (this.pos.y < nw.spec.voidY) { this.health = 0; this.deathTime = 0; return; }
    if (nw.phase !== 'playing') { this._locomote(dt, 0, 0, 0); return; }
    this._botRegear();
    const enemies = botEnemies(this);
    let near = null, nd = Infinity;
    for (const e of enemies) {
      const d = e.pos.distanceTo(this.pos);
      if (d < nd) { nd = d; near = e; }
    }
    // Revenge: whoever hit us last is the target if close
    if (this.revenge && this.revenge instanceof Mob && !this.revenge.dead && this.revenge.pos.distanceTo(this.pos) < 12) {
      near = { pos: this.revenge.pos, target: this.revenge, name: this.revenge.name, human: false }; nd = this.revenge.pos.distanceTo(this.pos);
    }
    const spec = nw.spec;
    // Sudden death: everyone loses health over time
    if (nw.sudden) { this.suddenT = (this.suddenT || 0) + dt; if (this.suddenT > 2) { this.suddenT = 0; this.health -= 1; this.hurtTime = 0.3; if (this.health <= 0) this.deathTime = 0; } }
    if (nw.kind === 'bedwars') {
      const home = spec.teams[this.team];
      const atHome = Math.hypot(this.pos.x - home.center[0], this.pos.z - home.center[2]) < 8;
      // Heal pool
      if (atHome && nw.up[this.team][3]) { this.healT = (this.healT || 0) + dt; if (this.healT > 2) { this.healT = 0; this.health = Math.min(20, this.health + 1); } }
      // Shopping: blocks and gear come from standing at the generator and shop
      if (atHome && this.blocks < 16) {
        this.shopT += dt;
        if (this.shopT > 2.5 + Math.random()) { this.blocks = 48 + Math.floor(Math.random() * 17); this.shopT = 0; }
        if (!near || nd > 10) { this._botMove(dt, new THREE.Vector3(home.gen[0], 0, home.gen[2]), 4.3, 1); return; }
      }
      // Out of blocks away from home: walk back along the bridge to restock
      if (atHome) this.strandT = 0;
      if (!atHome && this.blocks <= 0 && (!near || nd > 6)) {
        // stranded at a gap: find a few blocks left in the pocket after a while
        this.strandT = (this.strandT || 0) + dt;
        if (this.strandT > 8) { this.strandT = 0; this.blocks = 24; }
        this._botMove(dt, new THREE.Vector3(home.gen[0], 0, home.gen[2]), 4.3, 1);
        return;
      }
      if (near && nd < (this.role === 'defender' ? 12 : 9)) {
        this._botMove(dt, near.pos, 5.6, 2.2);
        this._botFight(dt, near);
        return;
      }
      if (this.role === 'defender' && nw.elapsed < 240 && nw.beds[this.team]) {
        const bed = home.bed[0];
        if (!this.goal || Math.random() < dt * 0.3) this.goal = new THREE.Vector3(bed[0] + 0.5 + (Math.random() - 0.5) * 6, 65, bed[2] + 0.5 + (Math.random() - 0.5) * 6);
        this._botMove(dt, this.goal, 3, 1);
        return;
      }
      // Rush: the nearest enemy bed, or the nearest enemy once beds are gone
      let target = null, td = Infinity;
      spec.teams.forEach((t, i) => {
        if (i === this.team || !nw.beds[i] || !nw.teamAlive(i)) return;
        const d = Math.hypot(t.bed[1][0] - this.pos.x, t.bed[1][2] - this.pos.z);
        if (d < td) { td = d; target = { bed: t.bed, team: i }; }
      });
      if (target) {
        const [bx, by, bz] = target.bed[1];
        const goal = new THREE.Vector3(bx + 0.5, by, bz + 0.5);
        const d = Math.hypot(goal.x - this.pos.x, goal.z - this.pos.z);
        if (d < 2.8) {
          this.bedT += dt; this.swing = 1; this.targetYaw = Math.atan2(-(goal.x - this.pos.x), -(goal.z - this.pos.z));
          // Dig through the defense first, a block at a time
          const def = g.nwDefenseLeft(target.team);
          if (def) {
            if (this.bedT > 0.9) { this.bedT = 0; g.particles.burst(def[0], def[1], def[2], g.world.getBlock(...def), 6); Sound.dig('wool', this.pos); g.changeBlock(def[0], def[1], def[2], B.AIR, { noUpdate: true }); }
          } else if (this.bedT > 1.4) { this.bedT = 0; g.nwBreakBed(target.team, this.name); }
          this._locomote(dt, 0, 0, 0);
        } else { this.bedT = 0; this._botMove(dt, goal, 5.2, 1.5); }
        return;
      }
      if (near) { this._botMove(dt, near.pos, 5.6, 2.2); this._botFight(dt, near); return; }
      this._locomote(dt, 0, 0, 0);
      return;
    }
    // SkyWars and Duels: loot your island, maybe head to mid, then hunt
    if (!this.plan) this.plan = { step: 'loot', t: 2 + Math.random() * 3 };
    if (near && nd < (nw.kind === 'duels' ? 40 : 7)) { this._botMove(dt, near.pos, nd > 8 ? 5.6 : 4.8, 2.2); this._botFight(dt, near); return; }
    if (this.plan.step === 'loot') {
      this.plan.t -= dt;
      const isl = spec.islands[this.slot] || spec.islands[0];
      const c = isl.chests[0];
      this._botMove(dt, new THREE.Vector3(c[0] + 0.5, c[1], c[2] + 0.5), 4.3, 1.4);
      if (this.plan.t <= 0) {
        const tier = [1, 1, 2, 2, 4][Math.floor(Math.random() * 5)];
        this.armor = 0.15 + Math.random() * 0.3; this.blocks = 32 + Math.floor(Math.random() * 32);
        this._setWeapon(toolId(tier, 3)); this.swordTier = tier; this.bot.sword = tier; this.botInfo = encodeBot(this.bot);
        this.plan = { step: Math.random() < 0.55 ? 'mid' : 'hunt', t: 0 };
      } else return;
    }
    if (this.plan.step === 'mid') {
      const goal = new THREE.Vector3(0.5, 65, 0.5);
      if (this.pos.distanceTo(goal) < 4) {
        this.plan.t += dt;
        if (this.plan.t > 3) { this.armor = Math.min(0.55, this.armor + 0.2); this.hasBow = this.hasBow || Math.random() < 0.5; if (this.swordTier < 4 && Math.random() < 0.5) { this.swordTier = 4; this._setWeapon(toolId(4, 3)); this.bot.sword = 4; this.botInfo = encodeBot(this.bot); } this.plan.step = 'hunt'; }
        this._locomote(dt, 0, 0, 0);
      } else this._botMove(dt, goal, 5.2, 1);
      return;
    }
    if (near) { this._botMove(dt, near.pos, 5.6, 2.2); this._botFight(dt, near); return; }
    this._locomote(dt, 0, 0, 0);
  },
});

// ---------------------------------------------------------------- match state
class NovaState {
  constructor(game) {
    this.game = game;
    this.kind = 'lobby';
    this.id = 0;
    this.seed = 777;
    this.phase = 'lobby';
    this.phaseT = 0;
    this.elapsed = 0;
    this.members = [];
    this.beds = [true, true, true, true];
    this.up = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]; // sharpness, protection, forge, heal pool
    this.winner = '';
    this.winnerTeam = -1;
    this.spec = null;
    this.holos = [];
    this.genT = [];
    this.respawnQueue = [];
    this.myTeam = -1; this.mySlot = -1;
    this.setupFor = -1;
    this.respawnAt = 0;
    this.eliminated = false;
    this.lastPhase = '';
    this.lastPt = -1;
    this.parkour = null;
    this.chatT = 3;
    this.hostLeft = false;
  }
  welcomeInfo() { return { k: this.kind, id: this.id, s: this.seed }; }
  member(name) { return this.members.find((m) => m.name === name); }
  teamOfName(name) { const m = this.member(name); return m ? m.team : undefined; }
  teamOfPeer(peer) { const rp = this.game.remotePlayers.get(peer); return rp ? this.teamOfName(rp.name) : undefined; }
  get me() { return this.member(this.game.settings.name); }
  // Is a member still in the game? Remote players report it in their presence.
  memberAlive(m) {
    if (m.bot || !m.peer) return m.alive;
    const rp = this.game.remotePlayers.get(m.peer);
    if (!rp) return false;
    const s = rp.pres && rp.pres.mgs;
    return Array.isArray(s) && s[0] === this.id ? !!s[1] : m.alive;
  }
  teamAlive(t) { return this.members.some((m) => m.team === t && this.memberAlive(m)); }
  toWire() {
    return {
      k: this.kind, id: this.id, s: this.seed, ph: this.phase, pt: Math.ceil(this.phaseT), e: Math.floor(this.elapsed),
      bd: this.beds.map((b) => (b ? 1 : 0)).join(''), w: this.winner, wt: this.winnerTeam, up: this.up.map((u) => u.join('')).join(','),
      mb: this.members.map((m) => [m.name, m.rank, m.team, this.memberAlive(m) ? 1 : 0, m.kills, m.finals, m.bot ? 1 : 0, m.beds]),
    };
  }
}

// ---------------------------------------------------------------- game integration
Object.assign(Game.prototype, {
  // Start the network as its host (from the Multiplayer screen)
  startNetwork() {
    this._resetEntities();
    if (this.world) this.world.dispose();
    this.world = null;
    this.remote = false;
    this.worldId = null;
    this.worldName = 'Nova Network';
    this.difficulty = 2; this.cheats = false; this.hardcore = false;
    this.defaultMode = 'adventure';
    this.endState = { dragonKilled: true, creditsSeen: true };
    this.weather.set('clear');
    this.nw = new NovaState(this);
    this.player = null;
    this.nwLoadArena('lobby', 1, 777);
    this.mode = 'play';
    this.chat.rich([['Welcome to the ', '#FFFF55'], [NOVA_NAME, '#FFAA00'], ['!', '#FFFF55']]);
    this.chat.rich([['Right-click an NPC or the ', '#AAAAAA'], ['Game Menu', '#55FF55'], [' book to play. Press Tab for the player list.', '#AAAAAA']]);
  },

  joinRemoteNetwork(info) {
    this.nw = new NovaState(this);
    this.nwLoadArena(info.k || 'lobby', info.id | 0, info.s | 0);
  },

  // Replace the world with a fresh copy of a map
  nwLoadArena(kind, id, seed) {
    const nw = this.nw;
    const keep = this.remotePlayers;
    this.remotePlayers = new Map();
    this._resetEntities();
    this.remotePlayers = keep;
    for (const h of nw.holos) { this.scene.remove(h); h.material.map.dispose(); h.material.dispose(); }
    nw.holos = [];
    if (this.world) this.world.dispose();
    this.worlds = [null, null, null];
    this.worldSeed = seed;
    const w = new World(this.scene, seed, this.materials, 0);
    w.arena = kind;
    const origBlast = w.explosionBlocks.bind(w);
    w.explosionBlocks = (...a) => {
      const list = origBlast(...a);
      if (kind === 'bedwars') return list.filter((b) => BW_BLASTABLE.has(b[3]));
      if (kind === 'lobby') return [];
      return list;
    };
    this.worlds[0] = w;
    this.world = w;
    this.fluidQueue.clear();
    this.pendingBlocks = [];
    nw.kind = kind; nw.id = id; nw.seed = seed;
    nw.spec = Arena.spec(w);
    nw.phase = kind === 'lobby' ? 'lobby' : 'starting';
    nw.phaseT = kind === 'skywars' ? 7 : 5;
    nw.elapsed = 0;
    nw.beds = [true, true, true, true];
    nw.up = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    nw.defended = [false, false, false, false];
    nw.teamOut = [false, false, false, false];
    nw.refilled = false; nw.sudden = false;
    nw.winner = ''; nw.winnerTeam = -1;
    nw.genT = (nw.spec.gens || []).map((gn) => gn.every * Math.random());
    nw.respawnQueue = [];
    nw.respawnAt = 0; nw.eliminated = false; nw.setupFor = -1; nw.parkour = null;
    nw.lastPhase = ''; nw.lastPt = -1;
    if (!this.player) { this.player = new Player(w); this._wirePlayer(); }
    this.player.world = w;
    this.player.riding = null;
    this.spawnPending = false;
    this.timeOfDay = 0.3;
    // Holograms over the lobby pedestals
    if (kind === 'lobby') {
      for (const [k, p] of Object.entries(nw.spec.pedestals)) {
        const gm = NOVA_GAMES[k];
        const h = novaTag([
          { segs: [[gm.title, gm.color]], bold: true, size: 34 },
          { segs: [[gm.mode, '#AAAAAA']], size: 22 },
          { segs: [['Bots fill empty slots', '#55FF55']], size: 22 },
        ], 0.3);
        h.position.set(p.pos[0] + 0.5, p.pos[1] + 2.4, p.pos[2] + 0.5);
        this.scene.add(h); nw.holos.push(h);
      }
      const pk = nw.spec.parkour[0];
      const h = novaTag([{ segs: [['PARKOUR', '#FFAA00']], bold: true, size: 32 }, { segs: [['Step on the diamond block to start', '#FFFFFF']], size: 20 }], 0.28);
      h.position.set(pk[0] + 0.5, pk[1] + 2.2, pk[2] + 0.5);
      this.scene.add(h); nw.holos.push(h);
      const sign = novaTag([{ segs: [[NOVA_NAME, '#FFAA00']], bold: true, size: 40 }, { segs: [['Bed Wars · SkyWars · Parkour', '#FFFF55']], size: 24 }], 0.5);
      sign.position.set(0.5, 76, -22.5);
      this.scene.add(sign); nw.holos.push(sign);
      this.nwSetupLocal();
    }
    if (this.isAuthority) this.nwSpawnBots();
  },

  // Host: fill the map with bots (and NPCs)
  nwSpawnBots() {
    const nw = this.nw, spec = nw.spec;
    if (nw.kind === 'lobby') {
      for (const [k, p] of Object.entries(spec.pedestals)) {
        const m = this.spawnMob('bot', p.pos[0] + 0.5, p.pos[1], p.pos[2] + 0.5, { bot: { name: NOVA_GAMES[k].title, npc: k, skin: { bedwars: 3, skywars: 5, duels: 11 }[k] || 0 } });
        m.home = [p.pos[0] + 0.5, p.pos[1], p.pos[2] + 0.5];
        m.yaw = m.targetYaw = Math.PI;
      }
      const taken = new Set([this.settings.name]);
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 14;
        this.spawnMob('bot', Math.cos(a) * r, 65, Math.sin(a) * r, { bot: { name: this.nwBotName(taken), rank: this.nwBotRank(), team: -1, skin: Math.floor(Math.random() * 40) } });
      }
      return;
    }
    if (nw.kind === 'bedwars') {
      spec.teams.forEach((t) => {
        const m = this.spawnMob('bot', t.shop[0], t.shop[1], t.shop[2], { bot: { name: 'Item Shop', npc: 'shop' } });
        m.home = t.shop.slice();
      });
    }
    for (const mem of nw.members) if (mem.bot) this.nwSpawnBotMember(mem);
  },

  nwSpawnPoint(team, slot) {
    const nw = this.nw, spec = nw.spec;
    if (nw.kind === 'bedwars') {
      const t = spec.teams[team];
      const off = slot % 2 ? 1 : -1;
      const side = [[1, 0], [0, 1], [1, 0], [0, 1]][team];
      return { pos: [t.spawn[0] + side[0] * off, t.spawn[1], t.spawn[2] + side[1] * off], yaw: t.yaw };
    }
    if (nw.kind === 'skywars') { const s = spec.islands[slot]; return { pos: s.spawn.slice(), yaw: s.yaw }; }
    if (nw.kind === 'duels') { const s = spec.spawns[slot % 2]; return { pos: s.spawn.slice(), yaw: s.yaw }; }
    return { pos: spec.spawn.slice(), yaw: Math.PI };
  },

  nwSpawnBotMember(mem) {
    const sp = this.nwSpawnPoint(mem.team, mem.slot);
    const kind = this.nw.kind;
    const m = this.spawnMob('bot', sp.pos[0], sp.pos[1], sp.pos[2], { bot: { name: mem.name, rank: mem.rank, team: TEAM_GAMES.has(kind) ? mem.team : -2, skin: mem.skin, sword: kind === 'bedwars' ? 0 : kind === 'duels' || kind === 'bridge' ? 2 : -1 } });
    if (!TEAM_GAMES.has(kind)) { m.team = mem.team; m.bot.team = -2; }
    if (kind === 'duels') { m.armor = 0.42; m.hasBow = true; m.arrows = 16; m.plan = { step: 'hunt', t: 0 }; }
    else if (kind === 'skywars') m.hasBow = Math.random() < 0.45;
    else m.hasBow = false;
    m.difficulty = 0.7 + Math.random() * 0.5;
    m.yaw = m.targetYaw = sp.yaw;
    m.slot = mem.slot;
    m.member = mem;
    mem.mobId = m.id;
    return m;
  },

  nwBotName(taken) {
    for (let tries = 0; tries < 50; tries++) {
      const a = BOT_A[Math.floor(Math.random() * BOT_A.length)], b = BOT_B[Math.floor(Math.random() * BOT_B.length)];
      const style = Math.random();
      const n = style < 0.3 ? a + b : style < 0.55 ? a + '_' + b : style < 0.8 ? a + b + Math.floor(Math.random() * 99) : 'x' + a + b + 'x';
      if (!taken.has(n) && n.length <= 16) { taken.add(n); return n; }
    }
    return 'Player' + Math.floor(Math.random() * 9999);
  },
  nwRank() { return NovaProfile.get().rank || ''; },
  nwBotRank() { const r = Math.random(); return r < 0.55 ? '' : r < 0.7 ? 'VIP' : r < 0.82 ? 'VIP+' : r < 0.92 ? 'MVP' : 'MVP+'; },


  // ---------------------------------------------------------------- matches (host)
  nwQueue(kind) {
    const nw = this.nw;
    if (!nw || !NOVA_GAMES[kind]) return;
    if (!this.isAuthority) { this.chat.rich([['Only the party leader (the host) can start a game.', '#FF5555']]); return; }
    if (nw.queued) return;
    nw.queued = true;
    const code = 'mini' + (100 + Math.floor(Math.random() * 400)) + 'ABCDEFGH'[Math.floor(Math.random() * 8)];
    this.nwFeed([['Sending you to ', '#55FF55'], [code, '#FFFF55'], ['!', '#55FF55']]);
    Sound.tone(880, 0.15, 0.15, 'triangle', 0);
    setTimeout(() => { nw.queued = false; if (this.nw === nw) this.nwStartMatch(kind); }, 900);
  },

  nwStartMatch(kind) {
    const nw = this.nw;
    const humans = [{ name: this.settings.name, peer: null, rank: this.nwRank() }];
    for (const rp of this.remotePlayers.values()) humans.push({ name: rp.name, peer: rp.peer, rank: (rp.pres && NOVA_RANKS[rp.pres.rk]) ? rp.pres.rk : '' });
    const slots = SLOTS[kind];
    const members = [];
    const taken = new Set(humans.map((h) => h.name));
    const order = kind === 'bedwars' ? [0, 2, 4, 6, 1, 3, 5, 7] : kind === 'bridge' ? [0, 1, 2, 3] : [0, 1, 2, 3, 4, 5, 6, 7].slice(0, slots);
    for (let i = 0; i < slots; i++) {
      const slot = order[i];
      const team = kind === 'bedwars' ? Math.floor(slot / 2) : kind === 'bridge' ? slot % 2 : slot;
      const h = humans[i];
      const base = { slot, team, alive: true, final: false, kills: 0, finals: 0, beds: 0 };
      if (h) members.push(Object.assign(base, { name: h.name, peer: h.peer, rank: h.rank, bot: false }));
      else members.push(Object.assign(base, { name: this.nwBotName(taken), rank: this.nwBotRank(), bot: true, skin: Math.floor(Math.random() * 40) }));
    }
    nw.members = members;
    this.nwLoadArena(kind, nw.id + 1, (Math.random() * 1e9) | 0);
    this.nwSetupLocal();
  },

  nwToLobby() {
    const nw = this.nw;
    nw.members = [];
    this.nwLoadArena('lobby', nw.id + 1, 777);
  },

  // Put the local player into the current map
  nwSetupLocal() {
    const nw = this.nw, p = this.player;
    const inv = p.inventory;
    p.vel.set(0, 0, 0); p.fallStart = null;
    p.health = 20; p.food = 20; p.saturation = 5; p.fireTime = 0; p.air = 15;
    p.dead = false;
    if (nw.kind === 'lobby') {
      nw.myTeam = -1; nw.mySlot = -1;
      p.setMode('adventure');
      p.noDamage = true;
      inv.clear(); p.armor.clear();
      const menu = stackOf(ITEM.BOOK, 1); menu.label = 'Game Menu';
      inv.slots[0] = menu;
      const stats = stackOf(ITEM.EMERALD, 1); stats.label = 'Profile';
      inv.slots[8] = stats;
      inv.changed();
      const s = nw.spec.spawn;
      p.pos.set(s[0], s[1], s[2]); p.yaw = 0; p.pitch = 0;
      nw.setupFor = nw.id;
      if (this.ui) this.ui.selectSlot(0);
      return;
    }
    const me = nw.me;
    if (!me) return;
    nw.myTeam = me.team; nw.mySlot = me.slot;
    p.setMode('survival');
    p.noDamage = true;
    inv.clear(); p.armor.clear();
    if (nw.kind === 'bedwars') inv.slots[0] = stackOf(toolId(0, 3), 1);
    if (nw.kind === 'duels') {
      inv.slots[0] = stackOf(toolId(2, 3), 1);
      inv.slots[1] = stackOf(ITEM.BOW, 1);
      inv.slots[2] = stackOf(ITEM.BEEF_COOKED, 6);
      inv.slots[8] = stackOf(ITEM.ARROW, 16);
      for (let i = 0; i < 4; i++) p.armor.slots[i] = stackOf(armorId(1, i), 1);
      p.armor.changed();
    }
    inv.changed();
    const sp = this.nwSpawnPoint(me.team, me.slot);
    p.pos.set(sp.pos[0], sp.pos[1], sp.pos[2]);
    p.yaw = sp.yaw; p.pitch = 0;
    nw.setupFor = nw.id;
    if (this.ui) this.ui.selectSlot(0);
    const gm = NOVA_GAMES[nw.kind];
    const opp = nw.kind === 'duels' ? nw.members.find((m) => m !== me) : null;
    this.nwTitle(gm.title, TEAM_GAMES.has(nw.kind) ? `You are on ${NOVA_TEAMS[me.team].name} Team` : nw.kind === 'duels' ? `Opponent: ${opp ? opp.name : '?'}` : 'Loot your chests and be the last one standing', gm.color);
    NovaProfile.get().played++; NovaProfile.save();
  },

  // ---------------------------------------------------------------- per frame
  nwUpdate(dt) {
    const nw = this.nw, p = this.player;
    if (!nw || !this.world || !nw.spec) return;
    this.timeOfDay = nw.kind === 'skywars' ? 0.36 : 0.3;
    this.weather.raining = false; this.weather.thundering = false;
    const host = this.isAuthority;
    if (host) this.nwHostTick(dt);
    // Phase titles and sounds (everyone)
    if (nw.phase !== nw.lastPhase) {
      const prev = nw.lastPhase;
      nw.lastPhase = nw.phase;
      if (nw.phase === 'playing' && prev) {
        p.noDamage = false;
        if (nw.kind === 'bedwars') this.nwTitle('', 'Protect your bed and destroy the enemy beds!', '#FFFF55');
        else if (nw.kind === 'duels') this.nwTitle('FIGHT!', '', '#FF5555', 1.5);
        else this.nwTitle('', 'The cages opened! FIGHT!', '#FF5555');
        Sound.tone(440, 0.4, 0.25, 'square', 440);
      }
      if (nw.phase === 'ended') this.nwShowEnd();
    }
    if (nw.phase === 'starting') {
      const pt = Math.ceil(nw.phaseT);
      if (pt !== nw.lastPt && pt <= 5 && pt > 0) {
        nw.lastPt = pt;
        this.chat.rich([['The game starts in ', '#FFFF55'], [String(pt), pt <= 3 ? '#FF5555' : '#FFAA00'], [` second${pt === 1 ? '' : 's'}!`, '#FFFF55']]);
        this.nwTitle(String(pt), '', pt <= 3 ? '#FF5555' : '#FFFF55', 0.9);
        Sound.tone(500 + (5 - pt) * 60, 0.15, 0.2, 'triangle', 0);
      }
    }
    if (nw.kind === 'lobby') this.nwLobbyLocal(dt);
    else this.nwGameLocal(dt);
    this.nwRenderHud();
  },

  nwHostTick(dt) {
    const nw = this.nw;
    // Lobby bots chat
    nw.chatT -= dt;
    if (nw.chatT <= 0) {
      nw.chatT = nw.kind === 'lobby' ? 5 + Math.random() * 9 : 14 + Math.random() * 25;
      const bots = [...this.mobs.values()].filter((m) => m.type === 'bot' && !m.npc && !m.dead);
      if (bots.length) {
        const b = bots[Math.floor(Math.random() * bots.length)];
        const lines = nw.kind === 'lobby' ? LOBBY_LINES : nw.kind === 'bedwars' ? GAME_LINES : GAME_LINES.filter((l) => !/bed|defend/.test(l));
        const text = lines[Math.floor(Math.random() * lines.length)];
        const name = nw.kind === 'lobby' ? rankedName(b.name, b.bot.rank) : (b.team >= 0 && b.team < 4 && TEAM_GAMES.has(nw.kind) ? [['[' + NOVA_TEAMS[b.team].name.toUpperCase() + '] ', NOVA_TEAMS[b.team].color], ...rankedName(b.name, b.bot.rank)] : rankedName(b.name, b.bot.rank));
        this.nwFeed([...name, [': ' + text, b.bot.rank ? '#FFFFFF' : '#AAAAAA']]);
      }
    }
    if (nw.kind === 'lobby') return;
    if (nw.phase === 'starting') {
      nw.phaseT -= dt;
      if (nw.phaseT <= 0) {
        nw.phase = 'playing';
        if (nw.kind === 'skywars') {
          for (const [x, y, z] of nw.spec.cages) if (this.world.getBlock(x, y, z) === B.GLASS) this.changeBlock(x, y, z, B.AIR, { noUpdate: true, batch: true });
          this.flushBlocks();
        }
      }
      return;
    }
    if (nw.phase === 'ended') {
      nw.phaseT -= dt;
      if (nw.phaseT <= 0) this.nwToLobby();
      return;
    }
    nw.elapsed += dt;
    // Bot respawns
    for (let i = nw.respawnQueue.length - 1; i >= 0; i--) {
      const r = nw.respawnQueue[i];
      if (this.simTime < r.at) continue;
      nw.respawnQueue.splice(i, 1);
      if ((nw.kind === 'bedwars' && nw.beds[r.mem.team]) || nw.kind === 'bridge') { r.mem.alive = true; this.nwSpawnBotMember(r.mem); }
      else { r.mem.alive = false; r.mem.final = true; }
    }
    // Beds broken by players
    if (nw.kind === 'bedwars') {
      nw.spec.teams.forEach((t, i) => {
        if (!nw.beds[i]) return;
        const id0 = this.world.getBlock(...t.bed[0]), id1 = this.world.getBlock(...t.bed[1]);
        if ((id0 !== B.BED_FOOT && id0 !== B.BED_HEAD) || (id1 !== B.BED_FOOT && id1 !== B.BED_HEAD)) {
          let by = nw.lastBedBreak;
          if (!by && this.lastBlockFrom) { const rp = this.remotePlayers.get(this.lastBlockFrom); by = rp ? rp.name : null; }
          nw.lastBedBreak = null;
          this.nwBedGone(i, by);
        }
      });
      // After 12 minutes every bed breaks (sudden death)
      if (nw.elapsed > 720 && nw.beds.some((b) => b)) {
        nw.spec.teams.forEach((t, i) => { if (nw.beds[i]) { this.changeBlock(...t.bed[0], B.AIR, { noUpdate: true }); this.changeBlock(...t.bed[1], B.AIR, { noUpdate: true }); nw.beds[i] = false; } });
        nw.sudden = true;
        this.nwFeed([['All beds have been destroyed! ', '#FF5555'], ['SUDDEN DEATH', '#FFAA00']], { ev: 'sudden' });
      }
    }
    // Win check
    nw.winT = (nw.winT || 0) - dt;
    if (nw.winT > 0) return;
    nw.winT = 0.5;
    if (nw.kind === 'bedwars') {
      const alive = [0, 1, 2, 3].filter((t) => nw.teamAlive(t) || nw.respawnQueue.some((r) => r.mem.team === t && nw.beds[t]));
      if (alive.length <= 1) this.nwEnd(alive.length ? alive[0] : -1);
    } else if (nw.kind === 'skywars' || nw.kind === 'duels') {
      const alive = nw.members.filter((m) => nw.memberAlive(m));
      if (alive.length <= 1) this.nwEnd(alive.length ? alive[0].team : -1, alive.length ? alive[0].name : '');
    } else if (this.nwWinCheck) this.nwWinCheck();
  },

  // Host: a team's bed was destroyed
  nwBreakBed(team, byName) {
    const t = this.nw.spec.teams[team];
    this.particles.burst(t.bed[0][0], t.bed[0][1], t.bed[0][2], B.WOOL_RED, 10);
    this.changeBlock(...t.bed[0], B.AIR, { noUpdate: true });
    this.changeBlock(...t.bed[1], B.AIR, { noUpdate: true });
    this.nwBedGone(team, byName);
  },
  nwBedGone(team, byName) {
    const nw = this.nw;
    if (!nw.beds[team]) return;
    nw.beds[team] = false;
    const tm = NOVA_TEAMS[team];
    const killer = byName ? nw.member(byName) : null;
    if (killer) killer.beds = (killer.beds || 0) + 1;
    const segs = [['BED DESTRUCTION > ', '#FFFFFF'], [tm.name + ' Bed', tm.color], [' was destroyed by ', '#AAAAAA']];
    if (byName) segs.push([byName, killer && killer.team >= 0 ? NOVA_TEAMS[killer.team].color : '#FFFFFF'], ['!', '#AAAAAA']);
    else segs[2] = [' was destroyed!', '#AAAAAA'];
    this.nwFeed(segs, { nb: { t: team, by: byName || '' } });
  },

  nwEnd(team, name) {
    const nw = this.nw;
    if (nw.phase === 'ended') return;
    nw.phase = 'ended';
    nw.phaseT = 9;
    nw.winnerTeam = team;
    if (TEAM_GAMES.has(nw.kind)) nw.winner = team >= 0 ? NOVA_TEAMS[team].name : 'Nobody';
    else nw.winner = name || 'Nobody';
    const top = nw.members.filter((m) => m.kills + m.finals > 0).sort((a, b) => (b.kills + b.finals) - (a.kills + a.finals)).slice(0, 3);
    const gm = NOVA_GAMES[nw.kind];
    const line = [['▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬', '#55FF55']];
    this.nwFeed(line);
    this.nwFeed([['                ' + gm.title, '#FFFFFF']]);
    const winners = nw.members.filter((m) => m.team === team).map((m) => m.name).join(', ');
    this.nwFeed([['  Winner - ', '#FFAA00'], [team >= 0 && TEAM_GAMES.has(nw.kind) ? NOVA_TEAMS[team].name + ' - ' + winners : nw.winner, team >= 0 && TEAM_GAMES.has(nw.kind) ? NOVA_TEAMS[team].color : '#FFFF55']]);
    ['1st', '2nd', '3rd'].forEach((place, i) => {
      if (top[i]) this.nwFeed([[`  ${place} Killer - `, ['#FFFF55', '#FFAA00', '#FF5555'][i]], [`${top[i].name} - ${top[i].kills + top[i].finals}`, '#AAAAAA']]);
    });
    this.nwFeed(line, { ne: { wt: team, w: nw.winner } });
  },

  // ---------------------------------------------------------------- local player (every client)
  nwLobbyLocal(dt) {
    const nw = this.nw, p = this.player;
    p.food = 20; p.saturation = 5;
    if (p.pos.y < nw.spec.voidY) {
      const s = nw.spec.spawn;
      p.pos.set(s[0], s[1], s[2]); p.vel.set(0, 0, 0); p.fallStart = null;
      if (nw.parkour) { this.chat.rich([['Parkour challenge cancelled.', '#FF5555']]); nw.parkour = null; }
    }
    // Parkour
    const pk = nw.spec.parkour;
    const under = this.world.getBlock(Math.floor(p.pos.x), Math.floor(p.pos.y - 0.1), Math.floor(p.pos.z));
    const onBlock = (b) => Math.floor(p.pos.x) === b[0] && Math.floor(p.pos.z) === b[2] && Math.abs(p.pos.y - (b[1] + 1)) < 0.2;
    if (under === B.DIAMOND_BLOCK && onBlock(pk[0]) && (!nw.parkour || nw.parkour.t > 1)) {
      if (!nw.parkour) this.chat.rich([['Parkour challenge started! ', '#55FF55'], ['Reach the gold block. Fall and you go back to the start.', '#AAAAAA']]);
      nw.parkour = { t: 0 };
      Sound.tone(700, 0.15, 0.2, 'triangle', 0);
    }
    if (nw.parkour) {
      nw.parkour.t += dt;
      if (p.pos.y < pk[0][1] - 4) {
        p.pos.set(pk[0][0] + 0.5, pk[0][1] + 1, pk[0][2] + 0.5); p.vel.set(0, 0, 0); p.fallStart = null;
        nw.parkour.t = 0;
      }
      const end = pk[pk.length - 1];
      if (under === B.GOLD_BLOCK && onBlock(end)) {
        const t = nw.parkour.t;
        const prof = NovaProfile.get();
        const best = prof.parkour === null || t < prof.parkour;
        if (best) prof.parkour = +t.toFixed(2);
        prof.coins += 25;
        NovaProfile.save();
        this.chat.rich([['Parkour complete in ', '#55FF55'], [t.toFixed(2) + 's', '#FFFF55'], [best ? ' (new best!)' : ` (best ${prof.parkour}s)`, '#AAAAAA'], ['  +25 coins', '#FFAA00']]);
        this.nwTitle('PARKOUR COMPLETE', t.toFixed(2) + ' seconds', '#55FF55', 2);
        Sound.tone(523, 0.15, 0.2, 'triangle', 0); setTimeout(() => Sound.tone(659, 0.15, 0.2, 'triangle', 0), 150); setTimeout(() => Sound.tone(784, 0.3, 0.2, 'triangle', 0), 300);
        nw.parkour = null;
      }
    }
  },

  nwGameLocal(dt) {
    const nw = this.nw, p = this.player;
    if (nw.setupFor !== nw.id) { if (nw.me) this.nwSetupLocal(); else if (p.mode !== 'spectator') { p.setMode('spectator'); const c = nw.spec.center; p.pos.set(c[0], c[1] + 8, c[2]); } return; }
    // Generators drop resources locally for everyone
    if (nw.phase === 'playing' && nw.spec.gens && !nw.genExternal) {
      nw.spec.gens.forEach((gn, i) => {
        nw.genT[i] -= dt;
        if (nw.genT[i] > 0) return;
        nw.genT[i] = gn.every * (nw.elapsed > 300 && gn.item === ITEM.DIAMOND ? 0.6 : 1);
        let n = 0;
        for (const it of this.items) if (it.stack.id === gn.item && Math.abs(it.pos.x - gn.pos[0]) < 2 && Math.abs(it.pos.z - gn.pos[2]) < 2) n += it.stack.count;
        if (n < gn.max) this.spawnItem(stackOf(gn.item, 1), gn.pos[0], gn.pos[1], gn.pos[2], new THREE.Vector3(0, 0, 0));
      });
    }
    // Falling into the void
    if (p.mode === 'survival' && p.pos.y < nw.spec.voidY) { p.health = 0; this.onDeath('void'); }
    // Respawn countdown
    if (nw.respawnAt) {
      const left = Math.ceil(nw.respawnAt - this.simTime);
      if (left !== nw.lastRespawnLeft && left > 0 && nw.kind !== 'bridge') { nw.lastRespawnLeft = left; this.nwTitle('YOU DIED!', `You will respawn in ${left} second${left === 1 ? '' : 's'}!`, '#FF5555', 1.1); }
      if (this.simTime >= nw.respawnAt) {
        nw.respawnAt = 0;
        const me = nw.me;
        const sp = this.nwSpawnPoint(nw.myTeam, me ? me.slot : 0);
        p.setMode('survival');
        p.pos.set(sp.pos[0], sp.pos[1], sp.pos[2]); p.vel.set(0, 0, 0); p.fallStart = null;
        p.health = 20; p.food = 20;
        if (nw.kind === 'bridge' && this.nwGiveKit) this.nwGiveKit();
        else if (!p.inventory.slots.some((s) => s && ITEMS[s.id].tool && ITEMS[s.id].tool.type === 'sword')) p.inventory.add(stackOf(toolId(0, 3), 1), PICKUP_ORDER);
        if (nw.kind !== 'bridge') this.nwTitle('RESPAWNED!', '', '#55FF55', 1.2);
      }
    }
    if (nw.phase === 'starting' && nw.kind === 'bedwars') {
      const me = nw.me;
      if (me) { const sp = this.nwSpawnPoint(me.team, me.slot); if (Math.hypot(p.pos.x - sp.pos[0], p.pos.z - sp.pos[2]) > 3) { p.pos.set(sp.pos[0], sp.pos[1], sp.pos[2]); p.vel.set(0, 0, 0); } }
    }
  },

  // The local player died in a match
  nwLocalDeath(cause) {
    const nw = this.nw, p = this.player;
    if (p.mode === 'spectator' || nw.eliminated) return;
    const me = nw.me;
    const myName = this.settings.name;
    const recent = this.lastHurtBy && performance.now() - this.lastHurtBy.t < 10000 ? this.lastHurtBy.name : null;
    const final = this.nwIsFinal(nw.myTeam);
    this.nwKillFeed(myName, nw.myTeam, recent, cause === 'void', final);
    this.lastHurtBy = null;
    // Items: SkyWars drops everything; Bed Wars keeps armor and tools
    const inv = p.inventory;
    if (nw.kind === 'skywars') {
      for (const s of [...inv.slots, ...p.armor.slots]) if (s) this.spawnItem(copyStack(s), p.pos.x, Math.max(p.pos.y, nw.spec.voidY + 25), p.pos.z);
      inv.clear(); p.armor.clear();
    } else if (nw.kind === 'bridge' || nw.kind === 'murder') {
      inv.clear();
    } else {
      inv.slots = inv.slots.map((s) => (s && ITEMS[s.id].tool && ['pickaxe', 'axe', 'shears'].includes(ITEMS[s.id].tool.type) ? s : null));
      inv.changed();
    }
    p.health = 20; p.food = 20; p.fireTime = 0; p.vel.set(0, 0, 0); p.fallStart = null; p.dead = false;
    p.setMode('spectator');
    const c = nw.spec.center;
    p.pos.set(c[0], c[1] + 10, c[2]);
    Sound.hurt();
    if (final) {
      nw.eliminated = true;
      if (me) me.alive = false;
      this.nwTitle('YOU DIED!', 'You are now a spectator!', '#FF5555', 3);
    } else {
      nw.respawnAt = this.simTime + (nw.kind === 'bridge' ? 0.4 : 5);
      nw.lastRespawnLeft = -1;
    }
  },

  // A kill feed line plus the stats it carries
  nwKillFeed(victim, vTeam, killer, voidDeath, final) {
    const nw = this.nw;
    const col = (name, team) => (team >= 0 && team < 4 && TEAM_GAMES.has(nw.kind) ? NOVA_TEAMS[team].color : name === this.settings.name ? '#55FFFF' : '#AAAAAA');
    const kTeam = killer ? nw.teamOfName(killer) : undefined;
    const segs = [[victim, col(victim, vTeam)]];
    if (killer) segs.push([voidDeath ? ' was knocked into the void by ' : [' was slain by ', ' was killed by ', ' got wrecked by '][Math.floor(Math.random() * 3)], '#AAAAAA'], [killer, col(killer, kTeam)], ['.', '#AAAAAA']);
    else segs.push([voidDeath ? ' fell into the void.' : ' died.', '#AAAAAA']);
    if (final) segs.push([' FINAL KILL!', '#55FFFF']);
    this.nwFeed(segs, { nk: { v: victim, k: killer || '', f: final ? 1 : 0 } });
  },

  // Host: a bot died
  nwBotDied(mob) {
    const nw = this.nw;
    const mem = mob.member || nw.members.find((m) => m.mobId === mob.id);
    if (!mem || nw.phase !== 'playing') return;
    let killer = null;
    const recent = mob.lastHitTime !== undefined && this.simTime - mob.lastHitTime < 10;
    if (recent) {
      const by = mob.lastHitBy;
      if (by instanceof Mob) killer = by.name || null;
      else if (by === null) killer = this.settings.name;
      else if (typeof by === 'string' && by !== 'env') { const rp = this.remotePlayers.get(by); killer = rp ? rp.name : null; }
    }
    const final = this.nwIsFinal(mem.team);
    this.nwKillFeed(mem.name, mem.team, killer, mob.pos.y < nw.spec.voidY + 2, final);
    if (final) { mem.alive = false; mem.final = true; }
    else nw.respawnQueue.push({ at: this.simTime + 5, mem });
  },

  // ---------------------------------------------------------------- chat feed
  // Show a coloured line here and send it to everyone else, with optional game data.
  nwFeed(segs, meta) {
    this.chat.rich(segs);
    const msg = { n: '', t: segsText(segs).slice(0, 256), segs };
    if (meta) Object.assign(msg, meta);
    if (this.net.active) this.net.send('chat', msg);
    if (meta) this.nwApplyMeta(meta);
  },

  nwApplyMeta(d) {
    const nw = this.nw;
    if (!nw) return;
    const me = this.settings.name;
    const prof = NovaProfile.get();
    if (d.nk) {
      const k = String(d.nk.k || ''), v = String(d.nk.v || '');
      if (this.isAuthority) {
        const km = nw.member(k), vm = nw.member(v);
        if (km && k !== v) { if (d.nk.f) km.finals++; else km.kills++; }
        if (vm && d.nk.f && !vm.bot) { vm.alive = false; vm.final = true; }
      }
      if (k === me && v !== me) {
        const coins = d.nk.f ? 20 : 10;
        if (d.nk.f) prof.finals++; else prof.kills++;
        prof.coins += coins; NovaProfile.save();
        this.chat.rich([['+' + coins + ' coins! ', '#FFAA00'], [d.nk.f ? '(Final Kill)' : '(Kill)', '#AAAAAA']]);
        Sound.tone(1200, 0.12, 0.2, 'triangle', 0);
      }
    }
    if (d.nb) {
      const t = d.nb.t | 0;
      if (!this.isAuthority) nw.beds[t] = false;
      if (t === nw.myTeam) { this.nwTitle('BED DESTROYED!', 'You will no longer respawn!', '#FF5555', 3); Sound.tone(90, 1.5, 0.4, 'sawtooth', -40); }
      else Sound.tone(300, 0.6, 0.25, 'sawtooth', -150);
      if (d.nb.by === me) { prof.beds++; prof.coins += 25; NovaProfile.save(); this.chat.rich([['+25 coins! ', '#FFAA00'], ['(Bed Destroyed)', '#AAAAAA']]); }
    }
  },

  nwShowEnd() {
    const nw = this.nw;
    const won = TEAM_GAMES.has(nw.kind) ? nw.winnerTeam >= 0 && nw.winnerTeam === nw.myTeam : nw.winner === this.settings.name;
    if (!won && nw.kind !== 'lobby') { const prof = NovaProfile.get(); prof.losses = (prof.losses || 0) + 1; NovaProfile.save(); }
    if (won) {
      const prof = NovaProfile.get();
      prof.wins[nw.kind] = (prof.wins[nw.kind] || 0) + 1; prof.coins += 100; NovaProfile.save();
      this.nwTitle('VICTORY!', TEAM_GAMES.has(nw.kind) ? `${NOVA_TEAMS[nw.winnerTeam].name} Team wins!` : nw.kind === 'duels' ? 'You won the duel!' : 'You were the last one standing!', '#FFAA00', 5);
      this.chat.rich([['+100 coins! ', '#FFAA00'], ['(Win)', '#AAAAAA']]);
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => Sound.tone(f, 0.25, 0.2, 'triangle', 0), i * 140));
    } else {
      this.nwTitle('GAME OVER!', `${nw.winner} won the game`, '#FF5555', 5);
    }
    // Fireworks over the map
    const c = nw.spec.center, wools = [B.WOOL_RED, B.WOOL_BLUE, B.WOOL_GREEN, B.WOOL_YELLOW, B.WOOL_WHITE];
    for (let i = 0; i < 8; i++) setTimeout(() => {
      if (this.nw !== nw) return;
      const p = this.player.pos;
      this.particles.burst(p.x + (Math.random() - 0.5) * 16, p.y + 6 + Math.random() * 6, p.z + (Math.random() - 0.5) * 16, wools[i % wools.length], 18);
      Sound.noise(1200, 1, 0.3, 0.25);
    }, 300 + i * 450);
    void c;
  },

  // ---------------------------------------------------------------- shop
  nwShopOffers() {
    const t = Math.max(0, this.nw.myTeam);
    const I = ITEM.IRON_INGOT, G = ITEM.GOLD_INGOT, E = ITEM.EMERALD;
    return [
      [[I, 4], null, [NOVA_TEAMS[t].wool, 16]], [[I, 24], null, [B.END_STONE, 12]], [[G, 4], null, [B.PLANKS, 16]], [[E, 4], null, [B.OBSIDIAN, 4]],
      [[I, 4], null, [B.LADDER, 8]], [[I, 10], null, [toolId(1, 3), 1]], [[G, 7], null, [toolId(2, 3), 1]], [[E, 4], null, [toolId(4, 3), 1]],
      [[I, 24], null, [armorId(1, 3), 1]], [[G, 6], null, [armorId(1, 2), 1]], [[G, 12], null, [armorId(1, 1), 1]], [[E, 6], null, [armorId(3, 1), 1]],
      [[I, 10], null, [toolId(1, 0), 1]], [[G, 3], null, [toolId(2, 0), 1]], [[I, 20], null, [ITEM.SHEARS, 1]],
      [[G, 12], null, [ITEM.BOW, 1]], [[G, 2], null, [ITEM.ARROW, 8]], [[G, 4], null, [B.TNT, 1]], [[E, 4], null, [ITEM.ENDER_PEARL, 1]],
      [[I, 4], null, [ITEM.BEEF_COOKED, 2]], [[G, 3], null, [ITEM.WATER_BUCKET, 1]],
    ];
  },

  // ---------------------------------------------------------------- rules
  nwCanBreak(id, x, y, z) {
    const nw = this.nw;
    if (nw.kind === 'lobby' || nw.phase !== 'playing') return false;
    if (nw.kind === 'skywars') return id !== B.BEDROCK;
    if (id === B.BED_FOOT || id === B.BED_HEAD) {
      const own = nw.spec.teams[nw.myTeam];
      return !(own && own.bed.some((b) => b[0] === x && b[1] === y && b[2] === z));
    }
    return BW_BREAKABLE.has(id);
  },

  // ---------------------------------------------------------------- HUD: sidebar, titles, tab list
  nwTitle(main, sub, color = '#FFFFFF', secs = 2.5) {
    const el = document.getElementById('nova-title');
    if (!el) return;
    el.querySelector('.nt-main').textContent = main;
    el.querySelector('.nt-main').style.color = color;
    el.querySelector('.nt-sub').textContent = sub;
    el.hidden = false;
    el.style.opacity = 1;
    clearTimeout(this._titleTimer);
    this._titleTimer = setTimeout(() => { el.style.opacity = 0; this._titleTimer = setTimeout(() => { el.hidden = true; }, 400); }, secs * 1000);
  },

  nwRenderHud() {
    const nw = this.nw;
    const sb = document.getElementById('nova-board');
    if (!sb) return;
    nw.hudT = (nw.hudT || 0) - 1;
    if (nw.hudT > 0) return;
    nw.hudT = 10;
    sb.hidden = !!(this.ui && this.ui.hideHud);
    const d = new Date();
    const date = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
    const prof = NovaProfile.get();
    const lines = [];
    const add = (...segs) => lines.push(segs);
    let title;
    if (nw.kind === 'lobby') {
      title = NOVA_NAME;
      add([date + '  L' + (nw.id % 90 + 1), '#555555']);
      add(['', '']);
      add(['Rank: ', '#FFFFFF'], ...(prof.rank ? novaRank(prof.rank).segs : [['Default', '#AAAAAA']]));
      add(['Level: ', '#FFFFFF'], [String(NovaProfile.level()), '#55FFFF']);
      add(['Coins: ', '#FFFFFF'], [prof.coins.toLocaleString(), '#FFAA00']);
      add(['', '']);
      add(['Bed Wars Wins: ', '#FFFFFF'], [String(prof.wins.bedwars || 0), '#55FF55']);
      add(['SkyWars Wins: ', '#FFFFFF'], [String(prof.wins.skywars || 0), '#55FF55']);
      add(['Final Kills: ', '#FFFFFF'], [String(prof.finals), '#55FF55']);
      add(['', '']);
      const bots = [...this.mobs.values()].filter((m) => m.type === 'bot' && !m.npc).length;
      add(['Lobby Players: ', '#FFFFFF'], [String(bots + this.remotePlayers.size + 1), '#55FF55']);
      if (nw.parkour) add(['Parkour: ', '#FFFFFF'], [nw.parkour.t.toFixed(1) + 's', '#FFFF55']);
    } else if (nw.kind === 'bedwars') {
      title = 'BED WARS';
      add([date + '  m' + nw.id + 'A', '#555555']);
      add(['', '']);
      const left = nw.phase === 'starting' ? `Starting in ${Math.ceil(nw.phaseT)}s` : nw.phase === 'ended' ? 'Game Over' : (nw.elapsed < 720 ? 'Bed Gone in ' + fmtTime(720 - nw.elapsed) : 'Sudden Death');
      add([left, '#FFFFFF']);
      add(['', '']);
      NOVA_TEAMS.forEach((t, i) => {
        const alive = nw.members.filter((m) => m.team === i && nw.memberAlive(m)).length;
        const state = nw.beds[i] ? ['✔', '#55FF55'] : alive ? [String(alive), '#55FF55'] : ['✘', '#FF5555'];
        add([t.letter + ' ', t.color], [t.name + ': ', '#FFFFFF'], state, [i === nw.myTeam ? ' YOU' : '', '#AAAAAA']);
      });
      add(['', '']);
      const me = nw.me || { kills: 0, finals: 0, beds: 0 };
      add(['Kills: ', '#FFFFFF'], [String(me.kills), '#55FF55']);
      add(['Final Kills: ', '#FFFFFF'], [String(me.finals), '#55FF55']);
      add(['Beds Broken: ', '#FFFFFF'], [String(me.beds || 0), '#55FF55']);
    } else if (nw.kind === 'duels') {
      title = 'DUELS';
      add([date + '  m' + nw.id + 'D', '#555555']);
      add(['', '']);
      add(['Time: ', '#FFFFFF'], [nw.phase === 'starting' ? 'Starting in ' + Math.ceil(nw.phaseT) + 's' : fmtTime(nw.elapsed), '#55FF55']);
      add(['', '']);
      const opp = nw.members.find((m) => m.name !== this.settings.name);
      add(['Opponent: ', '#FFFFFF'], [opp ? opp.name : '?', '#FF5555']);
      const om = opp && [...this.mobs.values()].find((m) => m.type === 'bot' && m.name === opp.name && !m.dead);
      const orp = opp && [...this.remotePlayers.values()].find((r) => r.name === opp.name);
      const ohp = om ? Math.ceil(om.health) : orp && orp.pres && typeof orp.pres.hp === 'number' ? orp.pres.hp : null;
      if (ohp !== null) add(['Their health: ', '#FFFFFF'], [ohp + ' ❤', '#FF5555']);
      add(['Your health: ', '#FFFFFF'], [Math.ceil(this.player.health) + ' ❤', '#FF5555']);
      add(['', '']);
      add(['Mode: ', '#FFFFFF'], ['Classic 1v1', '#55FF55']);
      add(['Duels Wins: ', '#FFFFFF'], [String(prof.wins.duels || 0), '#55FF55']);
    } else {
      title = 'SKYWARS';
      add([date + '  m' + nw.id + 'B', '#555555']);
      add(['', '']);
      const alive = nw.members.filter((m) => nw.memberAlive(m)).length;
      add(['Players left: ', '#FFFFFF'], [String(alive), '#55FF55']);
      add(['', '']);
      add([nw.phase === 'starting' ? 'Cages open: ' : 'Time: ', '#FFFFFF'], [nw.phase === 'starting' ? Math.ceil(nw.phaseT) + 's' : fmtTime(nw.elapsed), '#55FF55']);
      add(['', '']);
      const me = nw.me || { kills: 0, finals: 0 };
      add(['Kills: ', '#FFFFFF'], [String(me.kills + me.finals), '#55FF55']);
      add(['Map: ', '#FFFFFF'], ['Skyreach', '#55FF55']);
      add(['Mode: ', '#FFFFFF'], ['Normal', '#55FF55']);
    }
    add(['', '']);
    add(['nova network', '#FFFF55']);
    const html = (segs) => segs.map(([t, c]) => `<span style="color:${c}">${escapeHtml(t) || '&nbsp;'}</span>`).join('');
    sb.innerHTML = `<div class="nb-title">${escapeHtml(title)}</div>` + lines.map((l) => `<div class="nb-line">${html(l)}</div>`).join('');
    // Tab list
    const tab = document.getElementById('nova-tab');
    if (tab && !tab.hidden) this.nwRenderTab(tab);
  },

  nwRenderTab(tab) {
    const nw = this.nw;
    const rows = [];
    const me = this.settings.name;
    const push = (segs, ping) => rows.push(`<div class="tab-row"><span>${segs.map(([t, c]) => `<span style="color:${c}">${escapeHtml(t)}</span>`).join('')}</span><span class="tab-ping">${'▮'.repeat(ping)}</span></div>`);
    if (nw.kind === 'lobby') {
      push(rankedName(me, this.nwRank()), 5);
      for (const rp of this.remotePlayers.values()) push(rankedName(rp.name, rp.pres && rp.pres.rk), 4);
      for (const m of this.mobs.values()) if (m.type === 'bot' && !m.npc) push(rankedName(m.name, m.bot.rank), 3 + (m.id % 3));
    } else {
      for (const m of nw.members) {
        const col = TEAM_GAMES.has(nw.kind) ? NOVA_TEAMS[m.team].color : '#FFFFFF';
        const alive = nw.memberAlive(m);
        const pre = TEAM_GAMES.has(nw.kind) ? [[NOVA_TEAMS[m.team].letter + ' ', col]] : [];
        push([...pre, [m.name, alive ? col : '#555555'], [m.bot ? '' : '', '#AAAAAA']], m.bot ? 3 + (m.name.length % 3) : 5);
      }
    }
    tab.innerHTML = `<div class="tab-head">You are playing on <b style="color:#FFAA00">${NOVA_NAME}</b></div><div class="tab-grid">${rows.join('')}</div><div class="tab-foot">Bots fill every empty slot · ${rows.length} online</div>`;
  },
});

function fmtTime(s) { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function escapeHtml(t) { return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---------------------------------------------------------------- hooks into the game
wrapGame('update', function (orig, dt, input) {
  orig.call(this, dt, input);
  if (this.nw && this.mode === 'play') this.nwUpdate(dt);
});

for (const name of ['startPanorama', 'startWorld', 'startRemoteWorld']) {
  wrapGame(name, function (orig, ...a) {
    if (this.nw) {
      for (const h of this.nw.holos) this.scene.remove(h);
      this.nw = null;
      for (const id of ['nova-board', 'nova-title', 'nova-tab', 'nova-bar', 'nova-spec']) { const e = document.getElementById(id); if (e) e.hidden = true; }
    }
    if (this.player) this.player.noDamage = false;
    return orig.apply(this, a);
  });
}

wrapGame('updateSpawning', function (orig, dt) { if (!this.nw) orig.call(this, dt); });
wrapGame('updateVillages', function (orig, dt) { if (!this.nw) orig.call(this, dt); });

wrapGame('onDeath', function (orig, cause) {
  if (this.nw && this.nw.kind !== 'lobby') { this.nwLocalDeath(cause); return; }
  if (this.nw) { this.player.health = 20; return; }
  orig.call(this, cause);
});

wrapGame('onMobKilled', function (orig, mob, killerPeer) {
  if (mob._dropped) return;
  if (this.nw && mob.type === 'bot' && !mob.npc) this.nwBotDied(mob);
  orig.call(this, mob, killerPeer);
});

wrapGame('updateMining', function (orig, dt, holding) {
  if (this.nw && holding) {
    const t = this.target();
    if (t.entity && t.entity.type === 'bot' && t.entity.npc) { this.stopMining(); if (this.useCooldown <= 0) { this.useCooldown = 0.5; this.nwClickNpc(t.entity); } return; }
    if (t.block && !this.nwCanBreak(t.block.id, t.block.x, t.block.y, t.block.z)) { this.stopMining(); return; }
  }
  orig.call(this, dt, holding);
});

wrapGame('breakBlock', function (orig, hit, harvest) {
  if (this.nw) {
    const id = this.world.getBlock(hit.x, hit.y, hit.z);
    if (!this.nwCanBreak(id, hit.x, hit.y, hit.z)) return;
    if (id === B.BED_FOOT || id === B.BED_HEAD) {
      this.nw.lastBedBreak = this.settings.name;
      harvest = false;
    }
  }
  orig.call(this, hit, harvest);
});

wrapGame('attackEntity', function (orig, ent) {
  const nw = this.nw;
  if (nw) {
    if (ent instanceof Mob && ent.type === 'bot' && ent.npc) { this.nwClickNpc(ent); return; }
    if (nw.kind === 'lobby' || nw.phase !== 'playing') return;
    if (ent instanceof RemotePlayer && nw.teamOfName(ent.name) === nw.myTeam) return;
    if (ent instanceof Mob && ent.type === 'bot' && ent.team === nw.myTeam) return;
  }
  orig.call(this, ent);
});

wrapGame('use', function (orig) {
  const nw = this.nw;
  if (nw) {
    const p = this.player;
    const t = this.target();
    if (t.entity && t.entity instanceof Mob && t.entity.type === 'bot' && t.entity.npc) {
      if (this.useCooldown <= 0) { this.useCooldown = 0.4; this.nwClickNpc(t.entity); }
      return;
    }
    const held = p.heldStack;
    if (nw.kind === 'lobby') {
      if (held && held.id === ITEM.BOOK && this.useCooldown <= 0) { this.useCooldown = 0.4; this.ui.openGui('netmenu'); }
      else if (held && held.id === ITEM.EMERALD && this.useCooldown <= 0) { this.useCooldown = 0.4; this.nwShowProfile(); }
      return;
    }
    if (nw.phase === 'ended') return;
  }
  orig.call(this);
});

wrapGame('changeBlock', function (orig, x, y, z, id, opts = {}) {
  const ok = orig.call(this, x, y, z, id, opts);
  // Bed Wars TNT lights itself
  if (ok && this.nw && this.nw.kind === 'bedwars' && id === B.TNT && !opts.batch && !opts.noUpdate) {
    orig.call(this, x, y, z, B.AIR, { noUpdate: true });
    this.primeTnt(x, y, z, 2.5);
  }
  return ok;
});

wrapGame('tradeOffers', function (orig, mob) {
  if (this.nw && mob.npc === 'shop') return this.nwShopOffers();
  return orig.call(this, mob);
});

Object.assign(Game.prototype, {
  nwClickNpc(m) {
    if (m.npc === 'shop') { if (this.nw.phase === 'playing' && this.player.mode === 'survival') this.ui.openTrade(m); return; }
    if (NOVA_GAMES[m.npc]) this.nwQueue(m.npc);
  },
  nwShowProfile() {
    const prof = NovaProfile.get();
    const me = this.settings.name;
    this.chat.rich([['▬▬▬▬▬▬ ', '#55FF55'], ...rankedName(me, prof.rank), [' ▬▬▬▬▬▬', '#55FF55']]);
    this.chat.rich([['Level ', '#AAAAAA'], [String(NovaProfile.level()), '#55FFFF'], ['  Coins ', '#AAAAAA'], [prof.coins.toLocaleString(), '#FFAA00'], ['  Games ', '#AAAAAA'], [String(prof.played), '#FFFFFF']]);
    this.chat.rich([['Wins: ', '#AAAAAA'], [`Bed Wars ${prof.wins.bedwars || 0}`, '#FF5555'], ['  ', ''], [`SkyWars ${prof.wins.skywars || 0}`, '#55FFFF']]);
    this.chat.rich([['Kills ', '#AAAAAA'], [String(prof.kills), '#FFFFFF'], ['  Final kills ', '#AAAAAA'], [String(prof.finals), '#FFFFFF'], ['  Beds ', '#AAAAAA'], [String(prof.beds), '#FFFFFF'], ['  Parkour best ', '#AAAAAA'], [prof.parkour === null ? '-' : prof.parkour + 's', '#FFFF55']]);
  },
  // Presence fields for the network
  presenceExtra(pres) {
    const nw = this.nw;
    if (!nw) return;
    pres.rk = this.nwRank();
    pres.mgs = [nw.id, nw.eliminated ? 0 : 1];
    if (this.net.isHost) pres.mg = nw.toWire();
  },
  // Clients follow the host's match state
  onHostPresence(pres) {
    const nw = this.nw, mg = pres.mg;
    if (!nw || !mg || typeof mg.id !== 'number') return;
    if (mg.id !== nw.id) {
      nw.members = [];
      this.nwLoadArena(NOVA_GAMES[String(mg.k)] ? String(mg.k) : 'lobby', mg.id, mg.s | 0);
    }
    nw.phase = ['lobby', 'starting', 'playing', 'ended'].includes(mg.ph) ? mg.ph : nw.phase;
    nw.phaseT = +mg.pt || 0;
    nw.elapsed = +mg.e || 0;
    if (typeof mg.bd === 'string') nw.beds = [...mg.bd].map((c) => c === '1');
    if (typeof mg.up === 'string') { const u = mg.up.split(','); if (u.length === 4) nw.up = u.map((t) => [0, 1, 2, 3].map((i) => Math.min(4, parseInt(t[i], 10) || 0))); }
    nw.winner = String(mg.w || '').slice(0, 24);
    nw.winnerTeam = mg.wt | 0;
    if (Array.isArray(mg.mb)) {
      nw.members = mg.mb.filter(Array.isArray).map((a, i) => ({
        name: String(a[0]).slice(0, 24), rank: NOVA_RANKS[a[1]] ? a[1] : '', team: a[2] | 0, slot: i, alive: !!a[3],
        kills: a[4] | 0, finals: a[5] | 0, bot: !!a[6], beds: a[7] | 0, peer: null,
      }));
      // match up slots with the host's ordering
      if (nw.kind === 'bedwars') { const order = [0, 2, 4, 6, 1, 3, 5, 7]; nw.members.forEach((m, i) => { m.slot = order[i]; }); }
    }
  },
  // Coloured chat from the network (kill feed, bed messages, ranked chat)
  chatHook(d, from) {
    if (!this.nw) return false;
    if (Array.isArray(d.segs)) {
      this.chat.rich(d.segs.filter(Array.isArray).slice(0, 20).map((s) => [String(s[0]).slice(0, 120), /^#[0-9a-fA-F]{3,6}$/.test(s[1]) ? s[1] : '#FFFFFF']));
      this.nwApplyMeta(d);
      if (d.ne && !this.isAuthority) { /* end titles come from the phase change */ }
      return true;
    }
    if (d.n) {
      const rp = this.remotePlayers.get(from);
      const rk = typeof d.rk === 'string' && NOVA_RANKS[d.rk] ? d.rk : (rp && rp.pres && rp.pres.rk) || '';
      this.chat.rich([...rankedName(String(d.n).slice(0, 24), rk), [': ' + String(d.t || '').slice(0, 256), rk ? '#FFFFFF' : '#AAAAAA']]);
      return true;
    }
    return false;
  },
});

// Commands: /play, /lobby, /hub, /stats
wrapGame('runCommand', function (orig, text) {
  if (this.nw) {
    const args = text.slice(1).trim().split(/\s+/);
    const cmd = (args.shift() || '').toLowerCase();
    if (cmd === 'play') {
      const k = (args[0] || '').toLowerCase().replace(/[^a-z]/g, '');
      if (NOVA_GAMES[k]) this.nwQueue(k); else this.chat.rich([['Usage: /play bedwars or /play skywars', '#FF5555']]);
      return;
    }
    if (cmd === 'lobby' || cmd === 'hub' || cmd === 'l' || cmd === 'leave') {
      if (!this.isAuthority) { this.chat.rich([['Only the host can send everyone back to the lobby.', '#FF5555']]); return; }
      this.nwToLobby();
      return;
    }
    if (cmd === 'stats' || cmd === 'profile' || cmd === 'coins') { this.nwShowProfile(); return; }
    if (cmd === 'help') { this.chat.rich([['Network commands: ', '#FFAA00'], ['/play bedwars, /play skywars, /lobby, /stats', '#FFFFFF']]); return; }
    if (!['list', 'seed'].includes(cmd)) { this.chat.rich([['Unknown command. Type "/help" for help.', '#FF5555']]); return; }
  }
  orig.call(this, text);
});

// Damage switch for the lobby and pre-game
const _playerDamage = Player.prototype.damage;
Player.prototype.damage = function (amount, cause, knock) {
  if (this.noDamage) return false;
  const g = window.webcraft && window.webcraft.game;
  if (g && g.player === this && g.nw && g.nw.kind === 'bedwars' && g.nw.myTeam >= 0 && !['void', 'starve', 'fall'].includes(cause)) amount *= 1 - 0.08 * g.nw.up[g.nw.myTeam][1];
  return _playerDamage.call(this, amount, cause, knock);
};

// ---------------------------------------------------------------- UI pieces
Chat.prototype.rich = function (segs) {
  this.lines.push({ segs, text: segsText(segs), t: performance.now() });
  if (this.lines.length > 100) this.lines.shift();
  this.render();
};
const _chatSend = Chat.prototype.send;
Chat.prototype.send = function (text) {
  const g = this.ui.game;
  if (!g.nw || text.startsWith('/')) { _chatSend.call(this, text); return; }
  this.history.push(text);
  if (this.history.length > 50) this.history.shift();
  const rk = g.nwRank();
  const pre = g.TEAM_GAMES.has(nw.kind) && g.nw.myTeam >= 0 ? [['[' + NOVA_TEAMS[g.nw.myTeam].name.toUpperCase() + '] ', NOVA_TEAMS[g.nw.myTeam].color]] : [];
  this.rich([...pre, ...rankedName(g.settings.name, rk), [': ' + text, rk ? '#FFFFFF' : '#AAAAAA']]);
  if (g.net.active) g.net.send('chat', { n: g.settings.name, t: text.slice(0, 256), rk });
};

const _buildGui = UI.prototype.buildGui;
UI.prototype.buildGui = function () {
  const gui = this.gui;
  if (!gui || gui.kind !== 'netmenu') return _buildGui.call(this);
  const g = this.game;
  const panel = document.getElementById('gui-panel');
  panel.innerHTML = '';
  panel.className = 'gui-panel gui-netmenu';
  gui.slots = [];
  panel.appendChild(el('div', 'gui-title', 'Game Menu'));
  const list = el('div', 'netmenu-list');
  panel.appendChild(list);
  for (const [k, gm] of Object.entries(NOVA_GAMES)) {
    const btn = el('button', 'netmenu-game');
    btn.type = 'button';
    const icon = el('div', 'slot');
    this.slotContent(icon, stackOf(gm.icon, 1));
    const info = el('div', 'netmenu-info');
    const t = el('div', 'netmenu-title', gm.title);
    t.style.color = gm.color;
    info.append(t, el('div', 'netmenu-mode', gm.mode), el('div', 'netmenu-desc', gm.desc), el('div', 'netmenu-click', 'Click to play!'));
    btn.append(icon, info);
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); this.closeScreen(); g.nwQueue(k); });
    list.appendChild(btn);
  }
  const prof = NovaProfile.get();
  panel.appendChild(el('div', 'netmenu-foot', `Coins: ${prof.coins.toLocaleString()} · Level ${NovaProfile.level()} · Bed Wars wins ${prof.wins.bedwars || 0} · SkyWars wins ${prof.wins.skywars || 0}`));
  this.renderGui();
};

// Tab shows the player list while held
document.addEventListener('keydown', (e) => {
  const g = window.webcraft && window.webcraft.game;
  if (e.code !== 'Tab' || !g || !g.nw || g.mode !== 'play' || !g.ui || g.ui.screen !== 'none' || g.ui.chatOpen) return;
  e.preventDefault();
  const tab = document.getElementById('nova-tab');
  if (tab.hidden) { tab.hidden = false; g.nwRenderTab(tab); }
});
document.addEventListener('keyup', (e) => {
  if (e.code !== 'Tab') return;
  const tab = document.getElementById('nova-tab');
  if (tab) tab.hidden = true;
});

// ================================================================ more network detail
const UPGRADES = [
  { key: 'sharp', name: 'Sharpened Swords', desc: 'Your team permanently gains Sharpness I on all swords.', costs: [4], icon: toolId(2, 3) },
  { key: 'prot', name: 'Reinforced Armor', desc: 'Your team permanently gains Protection on all armor.', costs: [2, 4, 8, 16], icon: armorId(1, 1) },
  { key: 'forge', name: 'Iron Forge', desc: 'Upgrade resource spawning on your island.', costs: [2, 4], icon: B.FURNACE },
  { key: 'heal', name: 'Heal Pool', desc: 'Creates a regeneration field around your base.', costs: [1], icon: B.GLOWSTONE },
];
const ROMAN_N = ['', 'I', 'II', 'III', 'IV'];
const SHOP = {
  Blocks: [
    { item: 'wool', n: 16, cost: [ITEM.IRON_INGOT, 4] }, { item: B.END_STONE, n: 12, cost: [ITEM.IRON_INGOT, 24] },
    { item: B.PLANKS, n: 16, cost: [ITEM.GOLD_INGOT, 4] }, { item: B.GLASS, n: 4, cost: [ITEM.IRON_INGOT, 12] },
    { item: B.LADDER, n: 8, cost: [ITEM.IRON_INGOT, 4] }, { item: B.OBSIDIAN, n: 4, cost: [ITEM.EMERALD, 4] },
  ],
  Melee: [
    { item: toolId(1, 3), n: 1, cost: [ITEM.IRON_INGOT, 10], sword: 1 }, { item: toolId(2, 3), n: 1, cost: [ITEM.GOLD_INGOT, 7], sword: 2 },
    { item: toolId(4, 3), n: 1, cost: [ITEM.EMERALD, 4], sword: 4 },
  ],
  Armor: [
    { item: 'chain', n: 1, cost: [ITEM.IRON_INGOT, 24], armor: 0, label: 'Permanent Leather Boots & Leggings' },
    { item: 'iron', n: 1, cost: [ITEM.GOLD_INGOT, 12], armor: 1, label: 'Permanent Iron Armor' },
    { item: 'diamond', n: 1, cost: [ITEM.EMERALD, 6], armor: 3, label: 'Permanent Diamond Armor' },
  ],
  Tools: [
    { item: toolId(1, 0), n: 1, cost: [ITEM.IRON_INGOT, 10] }, { item: toolId(2, 0), n: 1, cost: [ITEM.GOLD_INGOT, 3] },
    { item: toolId(1, 1), n: 1, cost: [ITEM.IRON_INGOT, 10] }, { item: ITEM.SHEARS, n: 1, cost: [ITEM.IRON_INGOT, 20] },
  ],
  Ranged: [
    { item: ITEM.ARROW, n: 8, cost: [ITEM.GOLD_INGOT, 2] }, { item: ITEM.BOW, n: 1, cost: [ITEM.GOLD_INGOT, 12] },
  ],
  Utility: [
    { item: B.TNT, n: 1, cost: [ITEM.GOLD_INGOT, 4] }, { item: ITEM.ENDER_PEARL, n: 1, cost: [ITEM.EMERALD, 4] },
    { item: ITEM.WATER_BUCKET, n: 1, cost: [ITEM.GOLD_INGOT, 3] }, { item: ITEM.BEEF_COOKED, n: 2, cost: [ITEM.IRON_INGOT, 4] },
    { item: ITEM.APPLE, n: 1, cost: [ITEM.GOLD_INGOT, 3] },
  ],
};
const TIPS = ['Press Space in mid-air to double jump', 'Hold Tab to see who is online', 'Right-click the Game Menu book to pick a game', 'Launch pads fling you across the lobby', 'Beat the parkour for coins', 'Bots fill every empty slot', 'Team upgrades cost diamonds in Bed Wars', 'Open to Friends from the pause menu to party up', 'Use /play duels for a quick 1v1'];
const RES_NAMES = { [ITEM.IRON_INGOT]: 'Iron', [ITEM.GOLD_INGOT]: 'Gold', [ITEM.EMERALD]: 'Emerald', [ITEM.DIAMOND]: 'Diamond' };
const RES_COLORS = { [ITEM.IRON_INGOT]: '#FFFFFF', [ITEM.GOLD_INGOT]: '#FFAA00', [ITEM.EMERALD]: '#55FF55', [ITEM.DIAMOND]: '#55FFFF' };

Object.assign(Game.prototype, {
  // ---------------------------------------------------------------- bed defense
  // Blocks around a bed (two layers), outer first
  nwBedShell(team) {
    const nw = this.nw;
    if (!nw.shells) nw.shells = [];
    if (nw.shells[team]) return nw.shells[team];
    const bed = nw.spec.teams[team].bed;
    const isBed = (x, y, z) => bed.some((b) => b[0] === x && b[1] === y && b[2] === z);
    const inner = [], outer = [], seen = new Set();
    const around = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]];
    for (const [bx, by, bz] of bed) for (const [dx, dy, dz] of around) {
      const q = [bx + dx, by + dy, bz + dz], k = q.join(',');
      if (!isBed(...q) && !seen.has(k)) { seen.add(k); inner.push(q); }
    }
    for (const [x, y, z] of inner) for (const [dx, dy, dz] of around) {
      const q = [x + dx, y + dy, z + dz], k = q.join(',');
      if (!isBed(...q) && !seen.has(k)) { seen.add(k); outer.push(q); }
    }
    nw.shells[team] = { inner, outer };
    return nw.shells[team];
  },
  nwDefenseLeft(team) {
    const sh = this.nwBedShell(team);
    for (const q of [...sh.outer, ...sh.inner]) if (BW_BREAKABLE.has(this.world.getBlock(...q))) return q;
    return null;
  },
  // Host: bot-only teams cover their bed in wool, then end stone
  nwBuildDefense(team) {
    const sh = this.nwBedShell(team);
    for (const [q, id] of [...sh.outer.map((q) => [q, B.END_STONE]), ...sh.inner.map((q) => [q, NOVA_TEAMS[team].wool])]) {
      if (this.world.getBlock(...q) === B.AIR) this.changeBlock(q[0], q[1], q[2], id, { noUpdate: true, batch: true });
    }
    this.flushBlocks();
  },

  // ---------------------------------------------------------------- upgrades
  nwBuyUpgrade(idx) {
    const nw = this.nw, p = this.player, up = UPGRADES[idx];
    const lvl = nw.up[nw.myTeam][idx];
    if (lvl >= up.costs.length) { this.chat.rich([['You already have the maximum level!', '#FF5555']]); Sound.click(); return; }
    const cost = up.costs[lvl];
    const have = p.inventory.count(ITEM.DIAMOND);
    if (have < cost) { this.chat.rich([[`You don't have enough Diamond! Need ${cost - have} more!`, '#FF5555']]); Sound.tone(200, 0.15, 0.2, 'square', 0); return; }
    this.nwTake(ITEM.DIAMOND, cost);
    nw.up[nw.myTeam][idx]++; // clients count it now; the host's state confirms it
    const tm = NOVA_TEAMS[nw.myTeam];
    this.nwFeed([[this.settings.name, tm.color], [' purchased ', '#55FF55'], [up.name + (up.costs.length > 1 ? ' ' + ROMAN_N[lvl + 1] : ''), '#FFAA00']], this.isAuthority ? null : { upg: { t: nw.myTeam, i: idx } });
    Sound.tone(900, 0.12, 0.2, 'triangle', 300);
    if (this.ui.gui && this.ui.gui.kind === 'novaup') this.ui.buildGui();
  },
  nwTake(id, n) {
    const inv = this.player.inventory;
    for (let i = 0; i < inv.slots.length && n > 0; i++) {
      const s = inv.slots[i];
      if (s && s.id === id) { const k = Math.min(n, s.count); s.count -= k; n -= k; if (s.count <= 0) inv.slots[i] = null; }
    }
    inv.changed();
  },
  // Bonus melee damage for the local player (Sharpened Swords)
  dmgBonus() {
    const nw = this.nw;
    if (!nw || nw.kind !== 'bedwars' || nw.myTeam < 0) return 0;
    const held = this.player.heldStack;
    return nw.up[nw.myTeam][0] && held && ITEMS[held.id].tool && ITEMS[held.id].tool.type === 'sword' ? 1.25 : 0;
  },

  // ---------------------------------------------------------------- shop
  nwBuy(entry) {
    const nw = this.nw, p = this.player, inv = p.inventory;
    const [cid, cn] = entry.cost;
    const have = inv.count(cid);
    if (have < cn) { this.chat.rich([[`You don't have enough ${RES_NAMES[cid]}! Need ${cn - have} more!`, '#FF5555']]); Sound.tone(200, 0.15, 0.2, 'square', 0); return false; }
    let name;
    if (entry.armor !== undefined) {
      const tier = entry.armor;
      const cur = p.armorTier || 0;
      if (tier < cur || (tier === 0 && cur >= 0 && p.armor.slots[3])) { this.chat.rich([['You already have better armor!', '#FF5555']]); return false; }
      this.nwTake(cid, cn);
      p.armorTier = Math.max(cur, tier);
      p.armor.slots[3] = stackOf(armorId(tier, 3), 1);
      p.armor.slots[2] = stackOf(armorId(tier, 2), 1);
      if (tier > 0) { p.armor.slots[1] = stackOf(armorId(tier, 1), 1); p.armor.slots[0] = stackOf(armorId(tier, 0), 1); }
      p.armor.changed();
      name = entry.label;
    } else {
      const id = entry.item === 'wool' ? NOVA_TEAMS[Math.max(0, nw.myTeam)].wool : entry.item;
      if (!inv.canFit(stackOf(id, entry.n))) { this.chat.rich([['Your inventory is full!', '#FF5555']]); return false; }
      this.nwTake(cid, cn);
      if (entry.sword) {
        // swords replace the wooden one
        const ws = inv.slots.findIndex((s) => s && s.id === toolId(0, 3));
        if (ws >= 0) { inv.slots[ws] = stackOf(id, 1); inv.changed(); } else inv.add(stackOf(id, 1), PICKUP_ORDER);
      } else inv.add(stackOf(id, entry.n), PICKUP_ORDER);
      name = ITEMS[id].name;
    }
    this.chat.rich([['You purchased ', '#55FF55'], [name, '#FFAA00']]);
    Sound.tone(1000, 0.08, 0.2, 'triangle', 200);
    return true;
  },

  // ---------------------------------------------------------------- holograms over generators
  nwGenHolos(dt) {
    const nw = this.nw;
    if (nw.kind !== 'bedwars') return;
    nw.genHoloT = (nw.genHoloT || 0) - dt;
    if (nw.genHoloT > 0) return;
    nw.genHoloT = 1;
    if (!nw.genHolos) nw.genHolos = [];
    const gens = nw.spec.gens;
    let hi = 0;
    gens.forEach((gn, i) => {
      if (gn.item !== ITEM.DIAMOND && gn.item !== ITEM.EMERALD) return;
      const dia = gn.item === ITEM.DIAMOND;
      const tier = dia ? (nw.elapsed > 360 ? 3 : nw.elapsed > 180 ? 2 : 1) : (nw.elapsed > 480 ? 2 : 1);
      const left = nw.phase === 'playing' ? Math.max(0, Math.ceil(nw.genT[i])) : Math.ceil(gn.every);
      const key = tier + '|' + left;
      let h = nw.genHolos[hi];
      if (!h || h.userData.key !== key) {
        if (h) { this.scene.remove(h); h.material.map.dispose(); h.material.dispose(); }
        h = novaTag([
          { segs: [['Tier ', '#FFFF55'], [ROMAN_N[tier], '#FF5555']], size: 22 },
          { segs: [[dia ? 'Diamond' : 'Emerald', dia ? '#55FFFF' : '#55FF55']], bold: true, size: 30 },
          { segs: [['Spawns in ', '#FFFF55'], [String(left), '#FF5555'], [' seconds', '#FFFF55']], size: 22 },
        ], 0.3);
        h.userData.key = key;
        h.position.set(gn.pos[0], gn.pos[1] + 2.2, gn.pos[2]);
        this.scene.add(h);
        nw.genHolos[hi] = h; nw.holos.push(h);
      }
      hi++;
    });
  },
  // Generator speed for the local copy
  nwGenEvery(gn) {
    const nw = this.nw;
    let every = gn.every;
    if (gn.item === ITEM.DIAMOND) every *= nw.elapsed > 360 ? 0.5 : nw.elapsed > 180 ? 0.7 : 1;
    if (gn.item === ITEM.EMERALD) every *= nw.elapsed > 480 ? 0.6 : 1;
    if ((gn.item === ITEM.IRON_INGOT || gn.item === ITEM.GOLD_INGOT) && nw.spec.teams) {
      const t = nw.spec.teams.findIndex((tm) => tm.gen === gn.pos);
      if (t >= 0) every /= 1 + 0.5 * nw.up[t][2];
    }
    return every;
  },

  // ---------------------------------------------------------------- SkyWars refills
  nwRefill() {
    const nw = this.nw, w = this.world, spec = nw.spec;
    const rnd = mulberry32((Math.random() * 1e9) | 0);
    const fill = (pos, table, rolls) => {
      if (w.getBlock(...pos) !== B.CHEST) return;
      const d = { type: 'chest', slots: Structures._loot(rnd, table, rolls) };
      w.setData(pos[0], pos[1], pos[2], d);
      this.net.send('bdata', { x: pos[0], y: pos[1], z: pos[2], d, w: 0 });
    };
    for (const isl of spec.islands) for (const c of isl.chests) fill(c, spec.lootIsland, 5);
    for (const c of spec.mid) fill(c, spec.lootMid, 6);
  },

  // ---------------------------------------------------------------- name tags with health
  nwTagFor(mob) {
    const nw = this.nw;
    const hp = Math.max(0, Math.ceil(mob.health));
    const info = mob.bot;
    if (!info || mob.npc || !nw || nw.kind === 'lobby') return;
    if (mob.tagHp === hp) return;
    mob.tagHp = hp;
    const team = mob.team >= 0 && mob.team < 4 && TEAM_GAMES.has(nw.kind) ? NOVA_TEAMS[mob.team] : null;
    const name = team ? [[team.letter + ' ', team.color], [info.name, team.color]] : [[info.name, '#FF5555']];
    if (mob.tag) { mob.model.root.remove(mob.tag); mob.tag.material.map.dispose(); mob.tag.material.dispose(); }
    mob.tag = novaTag([{ segs: name }, { segs: [[String(hp), '#FFFFFF'], [' ❤', '#FF5555']], size: 22 }], 0.26);
    mob.tag.position.y = 2.05;
    mob.model.root.add(mob.tag);
  },
  // Team-coloured tags for real players
  nwRemoteTags() {
    const nw = this.nw;
    for (const rp of this.remotePlayers.values()) {
      const t = TEAM_GAMES.has(nw.kind) ? nw.teamOfName(rp.name) : undefined;
      const rk = rp.pres && rp.pres.rk;
      const segs = t !== undefined && t >= 0 ? [[NOVA_TEAMS[t].letter + ' ', NOVA_TEAMS[t].color], [rp.name, NOVA_TEAMS[t].color]] : nw.kind === 'lobby' ? rankedName(rp.name, rk) : [[rp.name, '#FF5555']];
      const hp = rp.pres && typeof rp.pres.hp === 'number' && nw.kind !== 'lobby' ? rp.pres.hp : null;
      const key = segsText(segs) + '|' + segs.map((x) => x[1]).join() + '|' + hp;
      if (rp.tagKey === key) continue;
      rp.tagKey = key;
      rp.model.root.remove(rp.tag);
      if (rp.tag.material) { if (rp.tag.material.map) rp.tag.material.map.dispose(); rp.tag.material.dispose(); }
      const lines = [{ segs }];
      if (hp !== null) lines.push({ segs: [[String(hp), '#FFFFFF'], [' ❤', '#FF5555']], size: 22 });
      rp.tag = novaTag(lines, 0.26);
      rp.tag.position.y = 2.05;
      rp.model.root.add(rp.tag);
    }
  },

  // ---------------------------------------------------------------- lobby extras
  nwLobbyExtras(dt) {
    const nw = this.nw, p = this.player, spec = nw.spec;
    // Launch pads
    for (const pad of spec.pads || []) {
      if (Math.floor(p.pos.x) === pad.pos[0] && Math.floor(p.pos.z) === pad.pos[2] && Math.abs(p.pos.y - pad.pos[1]) < 0.6 && !(nw.padT > 0)) {
        nw.padT = 1;
        const [dx, dz] = pad.dir, l = Math.hypot(dx, dz);
        p.vel.set(dx / l * 13, 17, dz / l * 13);
        p.onGround = false;
        nw.fling = { x: dx / l * 13, z: dz / l * 13, t: 0 };
        Sound.tone(300, 0.4, 0.25, 'sine', 600);
        this.particles.smoke(p.pos.x, p.pos.y, p.pos.z, 8);
      }
    }
    nw.padT = (nw.padT || 0) - dt;
    // Double jump in the lobby
    const space = p.keys.has('Space');
    if (p.onGround) nw.djUsed = false;
    else if (space && !nw.spaceWas && !nw.djUsed && !nw.fling) {
      nw.djUsed = true;
      const d = p.lookDir();
      p.vel.y = 10; p.vel.x += d.x * 5; p.vel.z += d.z * 5;
      Sound.tone(500, 0.2, 0.15, 'sine', 400);
      this.particles.smoke(p.pos.x, p.pos.y, p.pos.z, 5);
    }
    nw.spaceWas = space;
    if (nw.fling) {
      nw.fling.t += dt;
      if ((p.onGround && nw.fling.t > 0.2) || nw.fling.t > 3) nw.fling = null;
      else { p.vel.x = nw.fling.x; p.vel.z = nw.fling.z; }
    }
    // Lobby banner tips
    nw.tipT = (nw.tipT || 0) - dt;
    if (nw.tipT <= 0) {
      nw.tipT = 7;
      nw.tipI = ((nw.tipI ?? -1) + 1) % TIPS.length;
      const bar = document.getElementById('nova-bar');
      if (bar) { bar.innerHTML = `<b style="color:#FFAA00">${NOVA_NAME}</b> <span style="color:#AAAAAA">·</span> <span style="color:#FFFF55">${escapeHtml(TIPS[nw.tipI])}</span>`; bar.hidden = false; }
    }
    // Bots come and go (host)
    if (this.isAuthority) {
      nw.joinT = (nw.joinT ?? 20) - dt;
      if (nw.joinT <= 0) {
        nw.joinT = 15 + Math.random() * 25;
        const bots = [...this.mobs.values()].filter((m) => m.type === 'bot' && !m.npc);
        if (bots.length > 9 && Math.random() < 0.5) {
          const b = bots[Math.floor(Math.random() * bots.length)];
          this.particles.smoke(b.pos.x, b.pos.y + 1, b.pos.z, 6);
          b.dispose(); this.mobs.delete(b.id);
        } else if (bots.length < 16) {
          const taken = new Set(bots.map((m) => m.name)); taken.add(this.settings.name);
          const rank = Math.random() < 0.35 ? 'MVP+' : this.nwBotRank();
          const name = this.nwBotName(taken);
          const sp = spec.spawn;
          this.spawnMob('bot', sp[0] + (Math.random() - 0.5) * 4, sp[1], sp[2] + (Math.random() - 0.5) * 4, { bot: { name, rank, team: -1, skin: Math.floor(Math.random() * 40) } });
          if (rank === 'MVP+' || rank === 'MVP') this.nwFeed([['>', '#55FFFF'], ['>', '#FF5555'], ['> ', '#55FF55'], ...rankedName(name, rank), [' joined the lobby! ', '#FFAA00'], ['<', '#55FF55'], ['<', '#FF5555'], ['<', '#55FFFF']]);
        }
      }
    }
  },

  nwLeaderboards() {
    const nw = this.nw, spec = nw.spec;
    const prof = NovaProfile.get();
    const r = mulberry32(4242);
    for (const bd of spec.boards || []) {
      const names = [];
      const taken = new Set();
      for (let i = 0; i < 9; i++) { let n; do { n = BOT_A[Math.floor(r() * BOT_A.length)] + (r() < 0.5 ? '_' : '') + BOT_B[Math.floor(r() * BOT_B.length)]; } while (taken.has(n)); taken.add(n); names.push(n); }
      let score = bd.game === 'bedwars' ? 4800 : 3100;
      const rows = names.map((n, i) => { score -= Math.floor(120 + r() * 400); return { n, s: score, rk: ['MVP+', 'MVP+', 'MVP', 'MVP+', 'VIP+', 'MVP', 'VIP', 'VIP+', ''][i] }; });
      const mine = prof.wins[bd.game] || 0;
      const lines = [
        { segs: [[bd.game === 'bedwars' ? 'Bed Wars' : 'SkyWars', '#FFAA00'], [' Wins Leaderboard', '#FFFF55']], bold: true, size: 26 },
        { segs: [['All-Time', '#AAAAAA']], size: 20 },
        ...rows.map((row, i) => ({ segs: [[`${i + 1}. `, '#FFFF55'], ...rankedName(row.n, row.rk), [' - ', '#AAAAAA'], [row.s.toLocaleString(), '#FFFF55']], size: 20 })),
        { segs: [['', '#FFFFFF']], size: 8 },
        { segs: [['You: ', '#AAAAAA'], ...rankedName(this.settings.name, this.nwRank()), [' - ', '#AAAAAA'], [String(mine), '#FFFF55']], size: 20 },
      ];
      const h = novaTag(lines, 0.3);
      h.position.set(bd.pos[0], bd.pos[1] + 0.9, bd.pos[2]);
      this.scene.add(h);
      nw.holos.push(h);
    }
  },
});

// Hook the extras into the per-frame code
{
  const P = Game.prototype;
  const hostTick = P.nwHostTick;
  P.nwHostTick = function (dt) {
    hostTick.call(this, dt);
    const nw = this.nw;
    if (!nw || nw.phase !== 'playing') return;
    if (nw.kind === 'bedwars') {
      // Bot-only teams build a bed defense; bot teams buy upgrades over time
      nw.spec.teams.forEach((t, i) => {
        const allBots = nw.members.filter((m) => m.team === i).every((m) => m.bot);
        if (!allBots || !nw.beds[i]) return;
        if (!nw.defended[i] && nw.elapsed > 14 + i * 3) { nw.defended[i] = true; this.nwBuildDefense(i); }
        const want = [nw.elapsed > 70 ? 1 : 0, (nw.elapsed > 130 ? 1 : 0) + (nw.elapsed > 260 ? 1 : 0), nw.elapsed > 100 ? 1 : 0, nw.elapsed > 160 ? 1 : 0];
        for (let k = 0; k < 4; k++) if (nw.up[i][k] < want[k]) nw.up[i][k] = want[k];
      });
      // Teams that are completely gone
      for (let t = 0; t < 4; t++) {
        if (nw.teamOut[t] || nw.beds[t]) continue;
        const pending = nw.respawnQueue.some((r) => r.mem.team === t);
        if (!pending && !nw.teamAlive(t)) {
          nw.teamOut[t] = true;
          this.nwFeed([['TEAM ELIMINATED > ', '#FFFFFF'], [NOVA_TEAMS[t].name + ' Team', NOVA_TEAMS[t].color], [' has been eliminated!', '#FF5555']]);
        }
      }
    }
    if (nw.kind === 'skywars') {
      if (!nw.refilled && nw.elapsed > 180) { nw.refilled = true; this.nwRefill(); this.nwFeed([['All chests have been refilled!', '#FFFF55']], { ev: 'refill' }); }
      if (!nw.sudden && nw.elapsed > 420) { nw.sudden = true; this.nwFeed([['SUDDEN DEATH! ', '#FF5555'], ['Everyone is losing health. Finish it!', '#FFAA00']], { ev: 'sudden' }); }
    }
    if (nw.kind === 'duels' && !nw.sudden && nw.elapsed > 240) { nw.sudden = true; this.nwFeed([['SUDDEN DEATH! ', '#FF5555'], ['Both players are losing health.', '#FFAA00']], { ev: 'sudden' }); }
  };

  const gameLocal = P.nwGameLocal;
  P.nwGameLocal = function (dt) {
    gameLocal.call(this, dt);
    const nw = this.nw, p = this.player;
    if (!nw || nw.setupFor !== nw.id) return;
    this.nwGenHolos(dt);
    // Heal pool on your island
    if (nw.kind === 'bedwars' && nw.myTeam >= 0 && nw.up[nw.myTeam][3] && p.mode === 'survival') {
      const c = nw.spec.teams[nw.myTeam].center;
      if (Math.hypot(p.pos.x - c[0], p.pos.z - c[2]) < 9) { nw.healT = (nw.healT || 0) + dt; if (nw.healT > 2) { nw.healT = 0; p.heal(1); } }
    }
    // Sudden death drains everyone still playing
    if (nw.sudden && p.mode === 'survival' && nw.phase === 'playing') {
      nw.suddenT = (nw.suddenT || 0) + dt;
      if (nw.suddenT > 2) { nw.suddenT = 0; p.damage(1, 'starve'); }
    }
    // Spectator controls after you are out
    const spec = document.getElementById('nova-spec');
    if (spec) spec.hidden = !(nw.eliminated || nw.phase === 'ended');
    // Health tags
    for (const m of this.mobs.values()) if (m.type === 'bot') this.nwTagFor(m);
  };

  const lobbyLocal = P.nwLobbyLocal;
  P.nwLobbyLocal = function (dt) {
    lobbyLocal.call(this, dt);
    this.nwLobbyExtras(dt);
    const spec = document.getElementById('nova-spec');
    if (spec) spec.hidden = true;
  };

  const update = P.nwUpdate;
  P.nwUpdate = function (dt) {
    update.call(this, dt);
    const nw = this.nw;
    if (!nw) return;
    nw.tagT = (nw.tagT || 0) - dt;
    if (nw.tagT <= 0) { nw.tagT = 0.5; this.nwRemoteTags(); }
    const bar = document.getElementById('nova-bar');
    if (bar && nw.kind !== 'lobby') bar.hidden = true;
  };

  const load = P.nwLoadArena;
  P.nwLoadArena = function (kind, id, seed) {
    if (this.nw) { this.nw.genHolos = []; this.nw.shells = []; this.nw.genExternal = false; }
    load.call(this, kind, id, seed);
    if (kind === 'lobby') this.nwLeaderboards();
    if (this.isAuthority && kind === 'bedwars') {
      this.nw.spec.teams.forEach((t) => {
        const m = this.spawnMob('bot', t.upgrades[0], t.upgrades[1], t.upgrades[2], { bot: { name: 'Team Upgrades', npc: 'upgrades' } });
        m.home = t.upgrades.slice();
      });
    }
    this.player.armorTier = 0;
  };

  // Generators use the upgraded speeds
  const genOrig = P.nwGameLocal;
  void genOrig;

  const applyMeta = P.nwApplyMeta;
  P.nwApplyMeta = function (d) {
    applyMeta.call(this, d);
    const nw = this.nw;
    if (!nw) return;
    if (d.upg && this.isAuthority) { const t = d.upg.t | 0, i = d.upg.i | 0; if (nw.up[t] && i >= 0 && i < 4 && nw.up[t][i] < UPGRADES[i].costs.length) nw.up[t][i]++; }
    if (d.ev === 'refill') this.nwTitle('', 'Chests refilled!', '#FFFF55', 2);
    if (d.ev === 'sudden') { nw.sudden = true; this.nwTitle('SUDDEN DEATH', '', '#FF5555', 2); Sound.tone(80, 1.2, 0.35, 'sawtooth', -20); }
  };

  const extra = P.presenceExtra;
  P.presenceExtra = function (pres) {
    extra.call(this, pres);
    if (this.nw) pres.hp = Math.ceil(this.player.health);
  };

  // NPC clicks for the upgrade shop
  const click = P.nwClickNpc;
  P.nwClickNpc = function (m) {
    if (m.npc === 'upgrades') { if (this.nw.phase === 'playing' && this.player.mode === 'survival') this.ui.openGui('novaup'); return; }
    if (m.npc === 'shop') { if (this.nw.phase === 'playing' && this.player.mode === 'survival') this.ui.openGui('novashop', { cat: 'Blocks' }); return; }
    click.call(this, m);
  };
}

// Names and titles for the extra NPCs
{
  const init = MOB_INIT.bot;
  MOB_INIT.bot = function (extra) {
    init.call(this, extra);
    if (this.npc === 'upgrades') {
      this.model.root.remove(this.tag);
      this.model.mat.dispose();
      this.model = buildModel('villager_librarian');
      this.tag = novaTag([{ segs: [['TEAM', '#55FFFF']], bold: true }, { segs: [['UPGRADES', '#55FFFF']], bold: true }], 0.24);
      this.tag.position.y = 2.15;
      this.model.root.add(this.tag);
    }
  };
  const render = MOB_RENDER.bot;
  MOB_RENDER.bot = function (light) { if (this.npc === 'upgrades') return; render.call(this, light); };
}

// Projectiles from bots credit the bot
{
  const hit = Projectile.prototype.onHitEntity;
  Projectile.prototype.onHitEntity = function (c, dir) {
    const g = this.game;
    const nw = g.nw;
    if (nw && nw.kind !== 'lobby') {
      // no friendly fire from arrows
      const ownTeam = this.owner instanceof Mob ? this.owner.team : this.fromPlayer ? nw.myTeam : undefined;
      const hitTeam = c === 'local' ? nw.myTeam : c instanceof RemotePlayer ? nw.teamOfName(c.name) : c instanceof Mob ? c.team : undefined;
      if (ownTeam !== undefined && ownTeam >= 0 && ownTeam === hitTeam) return;
    }
    if (c === 'local' && this.owner instanceof Mob && this.owner.name) g.lastHurtBy = { name: this.owner.name, t: performance.now() };
    if (c instanceof Mob && c.type === 'bot' && this.owner instanceof Mob && this.kind === 'arrow' && g.isAuthority) {
      if (this.owner.team === c.team) return;
      const dmg = this.damage || 4;
      if (c.hurt(dmg, dir.x, dir.z, this.owner) && c.dead) g.onMobKilled(c, null);
      Sound.noise(1200, 1, 0.12, 0.3);
      return;
    }
    hit.call(this, c, dir);
  };
}

// Generator timing with upgrades: replace the spawn loop's interval
{
  const P = Game.prototype;
  const local = P.nwGameLocal;
  P.nwGameLocal = function (dt) {
    const nw = this.nw;
    if (nw && nw.spec && nw.spec.gens && nw.phase === 'playing') {
      // run the generators here with upgraded speeds, then stop the base loop from doing it again
      nw.spec.gens.forEach((gn, i) => {
        nw.genT[i] -= dt;
        if (nw.genT[i] > 0) return;
        nw.genT[i] = this.nwGenEvery(gn);
        let n = 0, pile = null;
        for (const it of this.items) if (it.stack.id === gn.item && Math.abs(it.pos.x - gn.pos[0]) < 2 && Math.abs(it.pos.z - gn.pos[2]) < 2) { n += it.stack.count; if (!pile || it.stack.count < pile.stack.count) pile = it; }
        if (n >= gn.max) return;
        // stack onto the pile already sitting on the generator
        if (pile && pile.stack.count < maxStack(gn.item) && pile.age > 0.5) { pile.stack.count++; pile.age = 0.6; }
        else this.spawnItem(stackOf(gn.item, 1), gn.pos[0], gn.pos[1], gn.pos[2], new THREE.Vector3(0, 0, 0));
      });
      nw.genExternal = true;
      local.call(this, dt);
      return;
    }
    local.call(this, dt);
  };
}

// ---------------------------------------------------------------- GUIs: item shop, upgrades, profile
{
  const build = UI.prototype.buildGui;
  UI.prototype.buildGui = function () {
    const gui = this.gui;
    if (!gui || !['novashop', 'novaup', 'novaprofile'].includes(gui.kind)) return build.call(this);
    const g = this.game, p = g.player;
    const panel = document.getElementById('gui-panel');
    panel.innerHTML = '';
    panel.className = 'gui-panel gui-novashop';
    gui.slots = [];
    const resRow = () => {
      const r = el('div', 'shop-res');
      for (const id of [ITEM.IRON_INGOT, ITEM.GOLD_INGOT, ITEM.DIAMOND, ITEM.EMERALD]) {
        const sp = el('span', '', `${RES_NAMES[id]}: ${p.inventory.count(id)}`);
        sp.style.color = RES_COLORS[id];
        r.appendChild(sp);
      }
      return r;
    };
    if (gui.kind === 'novashop') {
      panel.appendChild(el('div', 'gui-title', 'Item Shop'));
      const tabs = el('div', 'shop-tabs');
      for (const cat of Object.keys(SHOP)) {
        const t = el('button', 'shop-tab' + (cat === gui.cat ? ' on' : ''), cat);
        t.type = 'button';
        t.addEventListener('mousedown', (e) => { e.preventDefault(); gui.cat = cat; this.buildGui(); });
        tabs.appendChild(t);
      }
      panel.appendChild(tabs);
      const grid = el('div', 'shop-grid');
      for (const entry of SHOP[gui.cat]) {
        const id = entry.item === 'wool' ? NOVA_TEAMS[Math.max(0, g.nw.myTeam)].wool : entry.item === 'chain' ? armorId(0, 3) : entry.item === 'iron' ? armorId(1, 1) : entry.item === 'diamond' ? armorId(3, 1) : entry.item;
        const btn = el('button', 'shop-item');
        btn.type = 'button';
        const icon = el('div', 'slot');
        this.slotContent(icon, stackOf(id, entry.n));
        const can = p.inventory.count(entry.cost[0]) >= entry.cost[1];
        btn.classList.toggle('cant', !can);
        const info = el('div', 'shop-info');
        info.appendChild(el('div', 'shop-name', entry.label || (entry.n > 1 ? `${entry.n} × ` : '') + ITEMS[id].name));
        const cost = el('div', 'shop-cost', `${entry.cost[1]} ${RES_NAMES[entry.cost[0]]}`);
        cost.style.color = RES_COLORS[entry.cost[0]];
        info.appendChild(cost);
        btn.append(icon, info);
        btn.addEventListener('mousedown', (e) => { e.preventDefault(); if (g.nwBuy(entry)) this.buildGui(); });
        grid.appendChild(btn);
      }
      panel.appendChild(grid);
      panel.appendChild(resRow());
    } else if (gui.kind === 'novaup') {
      panel.appendChild(el('div', 'gui-title', 'Team Upgrades'));
      const grid = el('div', 'shop-grid');
      const lv = g.nw.up[g.nw.myTeam] || [0, 0, 0, 0];
      UPGRADES.forEach((u, i) => {
        const btn = el('button', 'shop-item up');
        btn.type = 'button';
        const icon = el('div', 'slot');
        this.slotContent(icon, stackOf(u.icon, 1));
        const max = lv[i] >= u.costs.length;
        const info = el('div', 'shop-info');
        info.appendChild(el('div', 'shop-name', u.name + (u.costs.length > 1 ? ` ${ROMAN_N[Math.min(lv[i] + 1, u.costs.length)]}` : '')));
        info.appendChild(el('div', 'shop-desc', u.desc));
        const cost = el('div', 'shop-cost', max ? 'UNLOCKED' : `${u.costs[lv[i]]} Diamond${u.costs[lv[i]] > 1 ? 's' : ''}`);
        cost.style.color = max ? '#55FF55' : '#55FFFF';
        info.appendChild(cost);
        btn.classList.toggle('cant', max || p.inventory.count(ITEM.DIAMOND) < u.costs[lv[i]]);
        btn.append(icon, info);
        btn.addEventListener('mousedown', (e) => { e.preventDefault(); g.nwBuyUpgrade(i); });
        grid.appendChild(btn);
      });
      panel.appendChild(grid);
      panel.appendChild(resRow());
    } else {
      const prof = NovaProfile.get();
      panel.appendChild(el('div', 'gui-title', 'Your Profile'));
      const head = el('div', 'prof-head');
      const nm = el('div', 'prof-name');
      for (const [t, c] of rankedName(g.settings.name, g.nwRank())) { const sp = el('span', '', t); sp.style.color = c; nm.appendChild(sp); }
      head.append(nm, el('div', 'prof-level', `Network Level ${NovaProfile.level()}`));
      panel.appendChild(head);
      const stats = [
        ['Coins', prof.coins.toLocaleString(), '#FFAA00'], ['Games played', prof.played, '#FFFFFF'],
        ['Bed Wars wins', prof.wins.bedwars || 0, '#FF5555'], ['SkyWars wins', prof.wins.skywars || 0, '#55FFFF'], ['Duels wins', prof.wins.duels || 0, '#FFAA00'],
        ['Kills', prof.kills, '#FFFFFF'], ['Final kills', prof.finals, '#FFFFFF'], ['Beds broken', prof.beds, '#FFFFFF'],
        ['Win streak', prof.streak || 0, '#55FF55'], ['Parkour best', prof.parkour === null ? '-' : prof.parkour + 's', '#FFFF55'],
      ];
      const grid = el('div', 'prof-grid');
      for (const [k, v, c] of stats) {
        const cell = el('div', 'prof-cell');
        const val = el('div', 'prof-val', String(v)); val.style.color = c;
        cell.append(val, el('div', 'prof-key', k));
        grid.appendChild(cell);
      }
      panel.appendChild(grid);
    }
    this.renderGui();
  };
}
Game.prototype.nwShowProfile = function () { this.ui.openGui('novaprofile'); };

// Win streaks
{
  const show = Game.prototype.nwShowEnd;
  Game.prototype.nwShowEnd = function () {
    const prof = NovaProfile.get();
    const before = prof.wins[this.nw.kind] || 0;
    show.call(this);
    const won = (prof.wins[this.nw.kind] || 0) > before;
    prof.streak = won ? (prof.streak || 0) + 1 : 0;
    NovaProfile.save();
    if (won && prof.streak > 1) this.chat.rich([['Win streak: ', '#FFAA00'], [String(prof.streak), '#55FF55']]);
  };
}

// Spectator keys: P plays again, L returns to the lobby
document.addEventListener('keydown', (e) => {
  const g = window.webcraft && window.webcraft.game;
  if (!g || !g.nw || g.mode !== 'play' || !g.ui || g.ui.screen !== 'none' || g.ui.chatOpen) return;
  const nw = g.nw;
  if (!(nw.eliminated || nw.phase === 'ended') || nw.kind === 'lobby') return;
  if (e.code === 'KeyP') { if (g.isAuthority) g.nwQueue(nw.kind); else g.chat.rich([['Only the host can start a game.', '#FF5555']]); }
  if (e.code === 'KeyL') g.runCommand('/lobby');
});

// Clients refresh a bot's sword when the host's description of it changes
Mob.prototype.botUpdate = function (str) {
  const info = decodeBot(str);
  this.botInfo = str;
  if (info.sword >= 0 && info.sword !== this.swordTier) { this.swordTier = info.sword; this._setWeapon(toolId(info.sword, 3)); }
  if (this.bot) this.bot.sword = info.sword;
};
