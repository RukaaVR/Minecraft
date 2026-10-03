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
};
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
  const v = info.skin | 0;
  const key = `bot_${team ? 't' + info.team : 'r'}_${v}`;
  const r0 = mulberry32(v * 7919 + 13);
  const skins = [[196, 140, 110], [230, 190, 160], [140, 95, 70], [100, 65, 45], [245, 205, 180]];
  const hairs = [[70, 45, 25], [20, 20, 20], [200, 160, 60], [150, 60, 30], [90, 90, 90], [230, 230, 230], [60, 30, 120]];
  const skinC = skins[Math.floor(r0() * skins.length)], hair = hairs[Math.floor(r0() * hairs.length)];
  const shirt = team ? team.shirt : [Math.floor(40 + r0() * 200), Math.floor(40 + r0() * 200), Math.floor(40 + r0() * 200)];
  const pants = [Math.floor(30 + r0() * 90), Math.floor(30 + r0() * 90), Math.floor(60 + r0() * 120)];
  const eye = [[60, 50, 140], [40, 120, 50], [90, 60, 30], [40, 40, 40]][Math.floor(r0() * 4)];
  const skin = makeSkin(key, 64, 32, (ctx, rand) => {
    paintBox(ctx, 0, 0, 8, 8, 8, skinC, rand, 12);
    paintBox(ctx, 16, 16, 8, 12, 4, shirt, rand, 14);
    paintBox(ctx, 40, 16, 4, 12, 4, (x, y) => (y < 4 ? shirt : skinC), rand, 12);
    paintBox(ctx, 0, 16, 4, 12, 4, pants, rand, 14);
    px(ctx, 8, 0, hair, 8, 8); px(ctx, 0, 8, hair, 8, 2 + (v % 3)); px(ctx, 16, 8, hair, 8, 2 + (v % 3)); px(ctx, 24, 8, hair, 8, 8);
    px(ctx, 8, 8, hair, 8, 1 + (v % 2));
    px(ctx, 9, 12, [255, 255, 255], 2, 1); px(ctx, 13, 12, [255, 255, 255], 2, 1);
    px(ctx, 10, 12, eye); px(ctx, 13, 12, eye);
    px(ctx, 10, 15, [Math.max(0, skinC[0] - 70), Math.max(0, skinC[1] - 70), Math.max(0, skinC[2] - 60)], 4, 1);
    px(ctx, 0, 28, [60, 50, 50], 16, 4);
  });
  const root = new THREE.Group(), inner = new THREE.Group();
  root.add(inner);
  const mat = new THREE.MeshBasicMaterial({ map: skin.tex });
  const W = 64, H = 32, parts = {};
  parts.legL = part(inner, mat, skinBox(4, 12, 4, 0, 16, W, H), [-2, 12, 0], [0, -6, 0]);
  parts.legR = part(inner, mat, skinBox(4, 12, 4, 0, 16, W, H), [2, 12, 0], [0, -6, 0]);
  parts.body = part(inner, mat, skinBox(8, 12, 4, 16, 16, W, H), [0, 12, 0], [0, 6, 0]);
  parts.armL = part(inner, mat, skinBox(4, 12, 4, 40, 16, W, H), [-6, 22, 0], [0, -4, 0]);
  parts.armR = part(inner, mat, skinBox(4, 12, 4, 40, 16, W, H), [6, 22, 0], [0, -4, 0]);
  parts.head = part(inner, mat, skinBox(8, 8, 8, 0, 0, W, H), [0, 24, 0], [0, 4, 0]);
  return { root, inner, parts, mat, height: 1.8, width: 0.6, headY: 24 };
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
    if (sp > 0) {
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
            g.changeBlock(ax, fy, az, nw.kind === 'bedwars' ? NOVA_TEAMS[this.team].wool : B.COBBLE, { noUpdate: true, batch: true });
          }
          if (!isSolid(w.getBlock(ax, fy, az))) sp = 0.4;
        } else sp = 0;
      }
      if (!this.onGround && this.vel.y < 0 && this.blocks > 0 && w.getBlock(cx, fy, cz) === B.AIR && this.placeT <= 0 && this.pos.y - fy < 1.4) {
        this.placeT = 0.15; this.blocks--;
        g.changeBlock(cx, fy, cz, nw.kind === 'bedwars' ? NOVA_TEAMS[this.team].wool : B.COBBLE, { noUpdate: true, batch: true });
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
    const g = this.game;
    const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z, dy = e.pos.y - this.pos.y;
    const d = Math.hypot(dx, dz) || 0.01;
    this.lookPitch = Math.atan2(dy, d) * 0.5;
    if (d < 3.1 && Math.abs(dy) < 2.5 && this.attackCooldown === 0) {
      this.attackCooldown = 0.45 + Math.random() * 0.25;
      this.swing = 1;
      if (Math.random() < 0.8) {
        const base = [4, 5, 6, 4, 7][Math.max(0, this.swordTier || 0)] || 4;
        const crit = !this.onGround && this.vel.y < 0 ? 1.5 : 1;
        const dmg = Math.round(base * crit * (0.8 + Math.random() * 0.25));
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
    if (nw.kind === 'bedwars') this.armor = nw.elapsed > 200 ? 0.4 : nw.elapsed > 60 ? 0.25 : 0.1;
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
      // Wander the hub, hop around, chat now and then
      if (!this.goal || this.pos.distanceTo(this.goal) < 1.5 || Math.random() < dt * 0.05) {
        const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 15;
        this.goal = Math.random() < 0.25 ? null : new THREE.Vector3(Math.cos(a) * r, 65, Math.sin(a) * r);
        this.idleT = 1 + Math.random() * 4;
      }
      if (!this.goal) { this.idleT -= dt; this._locomote(dt, 0, 0, 0); return; }
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
    const spec = nw.spec;
    if (nw.kind === 'bedwars') {
      const home = spec.teams[this.team];
      const atHome = Math.hypot(this.pos.x - home.center[0], this.pos.z - home.center[2]) < 8;
      // Shopping: blocks and gear come from standing at the generator and shop
      if (atHome && this.blocks < 16) {
        this.shopT += dt;
        if (this.shopT > 2.5 + Math.random()) { this.blocks = 48 + Math.floor(Math.random() * 17); this.shopT = 0; }
        if (!near || nd > 10) { this._botMove(dt, new THREE.Vector3(home.gen[0], 0, home.gen[2]), 4.3, 1); return; }
      }
      // Out of blocks away from home: walk back along the bridge to restock
      if (!atHome && this.blocks <= 0 && (!near || nd > 6)) { this._botMove(dt, new THREE.Vector3(home.gen[0], 0, home.gen[2]), 4.3, 1); return; }
      if (near && nd < (this.role === 'defender' ? 12 : 9)) {
        this._botMove(dt, near.pos, 5.6, 2.2);
        this._botFight(dt, near);
        return;
      }
      if (this.role === 'defender' && nw.elapsed < 240) {
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
        if (d < 2.6) {
          this.bedT += dt; this.swing = 1; this.targetYaw = Math.atan2(-(goal.x - this.pos.x), -(goal.z - this.pos.z));
          if (this.bedT > 1.4) { this.bedT = 0; g.nwBreakBed(target.team, this.name); }
          this._locomote(dt, 0, 0, 0);
        } else { this.bedT = 0; this._botMove(dt, goal, 5.2, 1.5); }
        return;
      }
      if (near) { this._botMove(dt, near.pos, 5.6, 2.2); this._botFight(dt, near); return; }
      this._locomote(dt, 0, 0, 0);
      return;
    }
    // SkyWars: loot your island, maybe head to mid, then hunt
    if (!this.plan) this.plan = { step: 'loot', t: 2 + Math.random() * 3 };
    if (near && nd < 7) { this._botMove(dt, near.pos, 5.6, 2.2); this._botFight(dt, near); return; }
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
        if (this.plan.t > 3) { this.armor = Math.min(0.55, this.armor + 0.2); if (this.swordTier < 4 && Math.random() < 0.5) { this.swordTier = 4; this._setWeapon(toolId(4, 3)); this.bot.sword = 4; this.botInfo = encodeBot(this.bot); } this.plan.step = 'hunt'; }
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
      bd: this.beds.map((b) => (b ? 1 : 0)).join(''), w: this.winner, wt: this.winnerTeam,
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
        const m = this.spawnMob('bot', p.pos[0] + 0.5, p.pos[1], p.pos[2] + 0.5, { bot: { name: NOVA_GAMES[k].title, npc: k, skin: k === 'bedwars' ? 3 : 5 } });
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
    return { pos: spec.spawn.slice(), yaw: Math.PI };
  },

  nwSpawnBotMember(mem) {
    const sp = this.nwSpawnPoint(mem.team, mem.slot);
    const m = this.spawnMob('bot', sp.pos[0], sp.pos[1], sp.pos[2], { bot: { name: mem.name, rank: mem.rank, team: this.nw.kind === 'bedwars' ? mem.team : -2, skin: mem.skin, sword: this.nw.kind === 'bedwars' ? 0 : -1 } });
    if (this.nw.kind === 'skywars') { m.team = mem.team; m.bot.team = -2; }
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
    const slots = 8;
    const members = [];
    const taken = new Set(humans.map((h) => h.name));
    const order = kind === 'bedwars' ? [0, 2, 4, 6, 1, 3, 5, 7] : [0, 1, 2, 3, 4, 5, 6, 7];
    for (let i = 0; i < slots; i++) {
      const slot = order[i];
      const team = kind === 'bedwars' ? Math.floor(slot / 2) : slot;
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
    inv.changed();
    const sp = this.nwSpawnPoint(me.team, me.slot);
    p.pos.set(sp.pos[0], sp.pos[1], sp.pos[2]);
    p.yaw = sp.yaw; p.pitch = 0;
    nw.setupFor = nw.id;
    if (this.ui) this.ui.selectSlot(0);
    const gm = NOVA_GAMES[nw.kind];
    this.nwTitle(gm.title, nw.kind === 'bedwars' ? `You are on ${NOVA_TEAMS[me.team].name} Team` : 'Loot your chests and be the last one standing', gm.color);
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
        else this.nwTitle('', 'The cages opened! FIGHT!', '#FF5555');
        Sound.tone(440, 0.4, 0.25, 'square', 440);
      }
      if (nw.phase === 'ended') this.nwShowEnd();
    }
    if (nw.phase === 'starting') {
      const pt = Math.ceil(nw.phaseT);
      if (pt !== nw.lastPt && pt <= 5 && pt > 0) {
        nw.lastPt = pt;
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
        const lines = nw.kind === 'lobby' ? LOBBY_LINES : GAME_LINES;
        const text = lines[Math.floor(Math.random() * lines.length)];
        const name = nw.kind === 'lobby' ? rankedName(b.name, b.bot.rank) : (b.team >= 0 && b.team < 4 ? [['[' + NOVA_TEAMS[b.team].name.toUpperCase() + '] ', NOVA_TEAMS[b.team].color], ...rankedName(b.name, b.bot.rank)] : rankedName(b.name, b.bot.rank));
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
      if (nw.kind === 'bedwars' && nw.beds[r.mem.team]) { r.mem.alive = true; this.nwSpawnBotMember(r.mem); }
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
        this.nwFeed([['All beds have been destroyed! ', '#FF5555'], ['SUDDEN DEATH', '#FFAA00']]);
      }
    }
    // Win check
    nw.winT = (nw.winT || 0) - dt;
    if (nw.winT > 0) return;
    nw.winT = 0.5;
    if (nw.kind === 'bedwars') {
      const alive = [0, 1, 2, 3].filter((t) => nw.teamAlive(t) || nw.respawnQueue.some((r) => r.mem.team === t && nw.beds[t]));
      if (alive.length <= 1) this.nwEnd(alive.length ? alive[0] : -1);
    } else {
      const alive = nw.members.filter((m) => nw.memberAlive(m));
      if (alive.length <= 1) this.nwEnd(alive.length ? alive[0].team : -1, alive.length ? alive[0].name : '');
    }
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
    if (nw.kind === 'bedwars') nw.winner = team >= 0 ? NOVA_TEAMS[team].name : 'Nobody';
    else nw.winner = name || 'Nobody';
    const top = nw.members.filter((m) => m.kills + m.finals > 0).sort((a, b) => (b.kills + b.finals) - (a.kills + a.finals)).slice(0, 3);
    const gm = NOVA_GAMES[nw.kind];
    const line = [['▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬', '#55FF55']];
    this.nwFeed(line);
    this.nwFeed([['                ' + gm.title, '#FFFFFF']]);
    const winners = nw.members.filter((m) => m.team === team).map((m) => m.name).join(', ');
    this.nwFeed([['  Winner - ', '#FFAA00'], [team >= 0 && nw.kind === 'bedwars' ? NOVA_TEAMS[team].name + ' - ' + winners : nw.winner, team >= 0 && nw.kind === 'bedwars' ? NOVA_TEAMS[team].color : '#FFFF55']]);
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
    if (nw.phase === 'playing' && nw.spec.gens) {
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
      if (left !== nw.lastRespawnLeft && left > 0) { nw.lastRespawnLeft = left; this.nwTitle('YOU DIED!', `You will respawn in ${left} second${left === 1 ? '' : 's'}!`, '#FF5555', 1.1); }
      if (this.simTime >= nw.respawnAt) {
        nw.respawnAt = 0;
        const me = nw.me;
        const sp = this.nwSpawnPoint(nw.myTeam, me ? me.slot : 0);
        p.setMode('survival');
        p.pos.set(sp.pos[0], sp.pos[1], sp.pos[2]); p.vel.set(0, 0, 0); p.fallStart = null;
        p.health = 20; p.food = 20;
        if (!p.inventory.slots.some((s) => s && ITEMS[s.id].tool && ITEMS[s.id].tool.type === 'sword')) p.inventory.add(stackOf(toolId(0, 3), 1), PICKUP_ORDER);
        this.nwTitle('RESPAWNED!', '', '#55FF55', 1.2);
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
    const final = nw.kind === 'skywars' || !nw.beds[nw.myTeam];
    this.nwKillFeed(myName, nw.myTeam, recent, cause === 'void', final);
    this.lastHurtBy = null;
    // Items: SkyWars drops everything; Bed Wars keeps armor and tools
    const inv = p.inventory;
    if (nw.kind === 'skywars') {
      for (const s of [...inv.slots, ...p.armor.slots]) if (s) this.spawnItem(copyStack(s), p.pos.x, Math.max(p.pos.y, nw.spec.voidY + 25), p.pos.z);
      inv.clear(); p.armor.clear();
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
      nw.respawnAt = this.simTime + 5;
      nw.lastRespawnLeft = -1;
    }
  },

  // A kill feed line plus the stats it carries
  nwKillFeed(victim, vTeam, killer, voidDeath, final) {
    const nw = this.nw;
    const col = (name, team) => (team >= 0 && team < 4 && nw.kind === 'bedwars' ? NOVA_TEAMS[team].color : name === this.settings.name ? '#55FFFF' : '#AAAAAA');
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
    const final = nw.kind === 'skywars' || !nw.beds[mem.team];
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
    const won = nw.kind === 'bedwars' ? nw.winnerTeam >= 0 && nw.winnerTeam === nw.myTeam : nw.winner === this.settings.name;
    if (won) {
      const prof = NovaProfile.get();
      prof.wins[nw.kind] = (prof.wins[nw.kind] || 0) + 1; prof.coins += 100; NovaProfile.save();
      this.nwTitle('VICTORY!', nw.kind === 'bedwars' ? `${NOVA_TEAMS[nw.winnerTeam].name} Team wins!` : 'You were the last one standing!', '#FFAA00', 5);
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
        const col = nw.kind === 'bedwars' ? NOVA_TEAMS[m.team].color : '#FFFFFF';
        const alive = nw.memberAlive(m);
        const pre = nw.kind === 'bedwars' ? [[NOVA_TEAMS[m.team].letter + ' ', col]] : [];
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
      for (const id of ['nova-board', 'nova-title', 'nova-tab']) { const e = document.getElementById(id); if (e) e.hidden = true; }
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
      this.nwLoadArena(String(mg.k) === 'bedwars' || String(mg.k) === 'skywars' ? String(mg.k) : 'lobby', mg.id, mg.s | 0);
    }
    nw.phase = ['lobby', 'starting', 'playing', 'ended'].includes(mg.ph) ? mg.ph : nw.phase;
    nw.phaseT = +mg.pt || 0;
    nw.elapsed = +mg.e || 0;
    if (typeof mg.bd === 'string') nw.beds = [...mg.bd].map((c) => c === '1');
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
  const pre = g.nw.kind === 'bedwars' && g.nw.myTeam >= 0 ? [['[' + NOVA_TEAMS[g.nw.myTeam].name.toUpperCase() + '] ', NOVA_TEAMS[g.nw.myTeam].color]] : [];
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
