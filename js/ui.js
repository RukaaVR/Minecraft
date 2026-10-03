// Menus, HUD, chat, container screens and input.
'use strict';

const $ = (id) => document.getElementById(id);
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// ---------------------------------------------------------------- pixel icons
function pixelIcon(rows, palette, scale = 2) {
  const c = document.createElement('canvas');
  c.width = rows[0].length * scale; c.height = rows.length * scale;
  const ctx = c.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    const col = palette[ch];
    if (!col) return;
    ctx.fillStyle = col;
    ctx.fillRect(x * scale, y * scale, scale, scale);
  }));
  return c.toDataURL();
}
const HEART = [
  '.XX...XX.', 'XRRX.XRRX', 'XRWRXRRRX', 'XRRRRRRRX', 'XRRRRRRRX', '.XRRRRRX.', '..XRRRX..', '...XRX...', '....X....',
];
const HEART_HALF = HEART.map((r) => [...r].map((ch, x) => (x > 4 && (ch === 'R' || ch === 'W') ? 'E' : ch)).join(''));
const HEART_EMPTY = HEART.map((r) => r.replace(/[RW]/g, 'E'));
const FOOD = [
  '.....XXX.', '....XMMMX', '...XMHMMX', '...XMMMMX', '..XXMMMX.', '.XBXXXX..', 'XBX......', 'XX.......', '.........',
];
const FOOD_HALF = FOOD.map((r) => [...r].map((ch, x) => (x < 6 && (ch === 'M' || ch === 'H') && x <= 5 ? (x < 5 ? 'E' : ch) : ch)).join(''));
const FOOD_EMPTY = FOOD.map((r) => r.replace(/[MHB]/g, 'E'));
const BUBBLE = ['..XXXXX..', '.XWWBBBX.', 'XWWBBBBBX', 'XWBBBBBBX', 'XBBBBBBBX', 'XBBBBBBBX', '.XBBBBBX.', '..XXXXX..', '.........'];
const ARMOR_ICON = ['.XXXXXXX.', 'XAAXAXAAX', 'XAAAAAAAX', '.XAAAAAX.', '.XAAAAAX.', '.XAAAAAX.', '.XAAAAAX.', '.XXXXXXX.', '.........'];
const ICONS = {
  armor: pixelIcon(ARMOR_ICON, { X: '#2a2a2a', A: '#dcdcdc' }),
  armorHalf: pixelIcon(ARMOR_ICON.map((r) => [...r].map((ch, x) => (x > 4 && ch === 'A' ? 'E' : ch)).join('')), { X: '#2a2a2a', A: '#dcdcdc', E: '#3a3a3a' }),
  armorEmpty: pixelIcon(ARMOR_ICON.map((r) => r.replace(/A/g, 'E')), { X: '#2a2a2a', E: '#3a3a3a' }),
  heart: pixelIcon(HEART, { X: '#2a0000', R: '#e01010', W: '#ffb0b0', E: '#3a0a0a' }),
  heartHalf: pixelIcon(HEART_HALF, { X: '#2a0000', R: '#e01010', W: '#ffb0b0', E: '#3a0a0a' }),
  heartEmpty: pixelIcon(HEART_EMPTY, { X: '#2a0000', E: '#3a0a0a' }),
  heartHard: pixelIcon(HEART, { X: '#2a0000', R: '#b00000', W: '#ffe0e0', E: '#3a0a0a' }),
  food: pixelIcon(FOOD, { X: '#2a1a0a', M: '#b5651d', H: '#e8a060', B: '#eeeeee', E: '#2e1e10' }),
  foodHalf: pixelIcon(FOOD_HALF, { X: '#2a1a0a', M: '#b5651d', H: '#e8a060', B: '#eeeeee', E: '#2e1e10' }),
  foodEmpty: pixelIcon(FOOD_EMPTY, { X: '#2a1a0a', E: '#2e1e10' }),
  bubble: pixelIcon(BUBBLE, { X: '#1b3c8c', W: '#ffffff', B: '#4f8ff7' }),
};

const SPLASHES = [
  'Now with creepers!', '100% procedural!', 'Punch a tree!', 'Also try the server!', 'Made of cubes!',
  'Survival, Creative, Adventure!', 'Ssssss...', 'Open to friends!', 'No downloads!', 'Diamonds below Y=16!',
];

class UI {
  constructor(game) {
    this.game = game;
    game.ui = this;
    this.screen = 'title';
    this.gui = null;     // open container screen
    this.cursor = null;  // item on the cursor
    this.mouse = [false, false, false];
    this.dragLook = false;
    this.chatOpen = false;
    this.hideHud = false;
    this.camMode = 0;    // 0 first person, 1 behind, 2 front
    this.iconCache = new Map();
    this.hudCache = {};
    this.selectedWorld = null;
    this.toastTimer = 0;
    this.lobbyUnsub = null;
    this.chat = new Chat(this);
    game.chat = this.chat;
    this.loadSettings();
    this.bindMenus();
    this.bindInput();
    this.buildDirtBackground();
    this.showScreen('title');
  }

  // ---------------------------------------------------------------- settings
  loadSettings() {
    try { Object.assign(this.game.settings, JSON.parse(localStorage.getItem('webcraft-settings-v2') || '{}')); } catch (e) { /* */ }
    Sound.volume = this.game.settings.volume;
  }
  saveSettings() {
    try { localStorage.setItem('webcraft-settings-v2', JSON.stringify(this.game.settings)); } catch (e) { /* */ }
  }

  iconFor(id) {
    if (!this.iconCache.has(id)) this.iconCache.set(id, drawItemIcon(this.game.atlasCanvas, id, 48).toDataURL());
    return this.iconCache.get(id);
  }

  buildDirtBackground() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const [sx, sy] = tileSrc(T.DIRT);
    ctx.drawImage(this.game.atlasCanvas, sx, sy, 16, 16, 0, 0, 64, 64);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, 64, 64);
    document.documentElement.style.setProperty('--dirt', `url(${c.toDataURL()})`);
  }

  // ---------------------------------------------------------------- screens
  showScreen(name) {
    this.screen = name;
    for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== 'screen-' + name;
    const inGame = this.game.mode === 'play';
    $('hud').hidden = !inGame || this.hideHud;
    document.body.classList.toggle('dirt-bg', !inGame && name !== 'title');
    if (name === 'title') {
      $('splash').textContent = SPLASHES[Math.floor(Math.random() * SPLASHES.length)];
    }
    if (name === 'worlds') this.renderWorldList();
    if (name === 'multiplayer') this.renderMultiplayer();
    if (name === 'options') this.renderOptions();
    if (name === 'pause') this.renderPause();
    if (name !== 'multiplayer' && this.lobbyUnsub) { this.lobbyUnsub(); this.lobbyUnsub = null; }
    if (name !== 'none') this.releaseMouse();
  }

  releaseMouse() {
    this.mouse = [false, false, false];
    if (document.pointerLockElement) document.exitPointerLock();
  }

  bindMenus() {
    const g = this.game;
    $('btn-singleplayer').onclick = () => { Sound.init(); this.showScreen('worlds'); };
    $('btn-multiplayer').onclick = () => { Sound.init(); this.showScreen('multiplayer'); };
    $('btn-options').onclick = () => { this.optionsBack = 'title'; this.showScreen('options'); };
    $('btn-play-world').onclick = () => this.playSelected();
    $('btn-create-world').onclick = () => this.showCreate();
    $('btn-delete-world').onclick = () => {
      if (!this.selectedWorld) return;
      const w = WorldStore.list().find((x) => x.id === this.selectedWorld);
      $('confirm-text').textContent = `"${w ? w.name : 'This world'}" will be lost forever! (A long time!)`;
      this.showScreen('confirm');
    };
    $('btn-confirm-yes').onclick = () => { WorldStore.remove(this.selectedWorld); this.selectedWorld = null; this.showScreen('worlds'); };
    $('btn-confirm-no').onclick = () => this.showScreen('worlds');
    $('btn-worlds-back').onclick = () => this.showScreen('title');

    // Create world
    this.createOpts = { mode: 'survival', difficulty: 2, cheats: false };
    const modeNames = { survival: 'Survival', hardcore: 'Hardcore', creative: 'Creative', adventure: 'Adventure' };
    const modeDesc = {
      survival: 'Search for resources, craft, gain health and hunger.',
      hardcore: 'Same as Survival, locked at hardest difficulty. One life only.',
      creative: 'Unlimited resources, free flying and destroy blocks instantly.',
      adventure: 'Survival, but you cannot place or break blocks. Explore and fight!',
    };
    const updateCreate = () => {
      const o = this.createOpts;
      $('btn-cw-mode').textContent = 'Game Mode: ' + modeNames[o.mode];
      $('cw-mode-desc').textContent = modeDesc[o.mode];
      $('btn-cw-diff').textContent = 'Difficulty: ' + (o.mode === 'hardcore' ? 'Hard' : DIFFICULTIES[o.difficulty][0].toUpperCase() + DIFFICULTIES[o.difficulty].slice(1));
      $('btn-cw-diff').disabled = o.mode === 'hardcore';
      $('btn-cw-cheats').textContent = 'Allow Cheats: ' + (o.cheats ? 'ON' : 'OFF');
      $('btn-cw-cheats').disabled = o.mode === 'hardcore';
    };
    this.updateCreate = updateCreate;
    $('btn-cw-mode').onclick = () => {
      const order = ['survival', 'hardcore', 'creative', 'adventure'];
      const o = this.createOpts;
      o.mode = order[(order.indexOf(o.mode) + 1) % order.length];
      if (o.mode === 'creative') o.cheats = true;
      if (o.mode === 'hardcore' || o.mode === 'survival') o.cheats = false;
      updateCreate();
    };
    $('btn-cw-diff').onclick = () => { this.createOpts.difficulty = (this.createOpts.difficulty + 1) % 4; updateCreate(); };
    $('btn-cw-cheats').onclick = () => { this.createOpts.cheats = !this.createOpts.cheats; updateCreate(); };
    $('btn-cw-create').onclick = () => this.createWorld();
    $('btn-cw-cancel').onclick = () => this.showScreen('worlds');

    // Multiplayer
    $('btn-mp-code').onclick = () => {
      const code = $('mp-code').value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      if (code) this.join('room', code);
    };
    $('btn-mp-direct').onclick = () => {
      let url = $('mp-address').value.trim();
      if (!url) return;
      if (!/^wss?:\/\//.test(url)) url = 'ws://' + url;
      if (!/:\d+/.test(url.replace(/^wss?:\/\//, ''))) url += ':25565';
      try { localStorage.setItem('webcraft-last-server', url); } catch (e) { /* */ }
      this.join('ws', url);
    };
    $('btn-mp-back').onclick = () => this.showScreen('title');
    $('mp-name').onchange = () => { this.game.settings.name = this.cleanName($('mp-name').value); this.saveSettings(); };

    // Options
    const bindRange = (id, key, fmt, apply) => {
      const r = $(id);
      r.oninput = () => {
        const v = parseFloat(r.value);
        this.game.settings[key] = v;
        $(id + '-label').textContent = fmt(v);
        if (apply) apply(v);
        this.saveSettings();
      };
    };
    bindRange('opt-fov', 'fov', (v) => 'FOV: ' + (v === 70 ? 'Normal' : v));
    bindRange('opt-rd', 'renderDistance', (v) => `Render Distance: ${v} chunks`);
    bindRange('opt-sens', 'sensitivity', (v) => `Sensitivity: ${Math.round(v * 100)}%`);
    bindRange('opt-vol', 'volume', (v) => `Sound: ${v === 0 ? 'OFF' : Math.round(v * 100) + '%'}`, (v) => { Sound.volume = v; });
    $('opt-name').onchange = () => { this.game.settings.name = this.cleanName($('opt-name').value); $('opt-name').value = this.game.settings.name; this.saveSettings(); };
    $('btn-opt-done').onclick = () => this.showScreen(this.optionsBack || 'title');
    $('btn-opt-shaders').onclick = () => {
      const order = ['OFF', 'LOW', 'MEDIUM', 'HIGH', 'ULTRA'];
      const cur = this.game.settings.shaders || 'MEDIUM';
      const next = order[(order.indexOf(cur) + 1) % order.length];
      this.game.settings.shadersAuto = false;
      this.game.setShaders(next);
      this.saveSettings();
      this.renderOptions();
    };

    // Pause
    $('btn-resume').onclick = () => this.resume();
    $('btn-pause-options').onclick = () => { this.optionsBack = 'pause'; this.showScreen('options'); };
    $('btn-open-friends').onclick = () => this.openToFriends();
    $('btn-quit').onclick = () => this.quitToTitle();

    // Death
    $('btn-respawn').onclick = () => { $('death').hidden = true; this.screen = 'none'; this.game.respawn(); this.resume(); };
    $('btn-death-title').onclick = () => this.quitToTitle();

    // Disconnected
    $('btn-dc-back').onclick = () => this.showScreen('title');
    $('btn-join-cancel').onclick = async () => { await this.game.stop(); this.game.startPanorama(); this.showScreen('multiplayer'); };
  }

  cleanName(s) { return (s || '').replace(/[^\w\- ]/g, '').trim().slice(0, 16) || 'Player'; }

  renderWorldList() {
    const list = WorldStore.list();
    const box = $('world-list');
    box.innerHTML = '';
    if (!list.length) box.appendChild(el('div', 'empty', 'No worlds yet. Create one!'));
    if (!list.find((w) => w.id === this.selectedWorld)) this.selectedWorld = list[0] ? list[0].id : null;
    for (const w of list) {
      const row = el('button', 'world-row' + (w.id === this.selectedWorld ? ' selected' : ''));
      row.type = 'button';
      const icon = el('img', 'world-icon');
      icon.src = this.iconFor(w.mode === 'creative' ? B.DIAMOND_BLOCK : w.hardcore ? B.TNT : B.GRASS);
      icon.alt = '';
      const info = el('div', 'world-info');
      info.appendChild(el('div', 'world-name', w.name));
      const d = new Date(w.last);
      info.appendChild(el('div', 'world-sub', `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`));
      const m = el('div', 'world-sub' + (w.hardcore ? ' hardcore' : ''), w.hardcore ? 'Hardcore Mode!' : (w.mode ? w.mode[0].toUpperCase() + w.mode.slice(1) : 'Survival') + ' Mode');
      info.appendChild(m);
      row.append(icon, info);
      row.onclick = () => { this.selectedWorld = w.id; this.renderWorldList(); };
      row.ondblclick = () => { this.selectedWorld = w.id; this.playSelected(); };
      box.appendChild(row);
    }
    $('btn-play-world').disabled = !this.selectedWorld;
    $('btn-delete-world').disabled = !this.selectedWorld;
  }

  showCreate() {
    $('cw-name').value = 'New World';
    $('cw-seed').value = '';
    this.createOpts = { mode: 'survival', difficulty: 2, cheats: false };
    this.updateCreate();
    this.showScreen('create');
  }

  createWorld() {
    const o = this.createOpts;
    const name = $('cw-name').value.trim().slice(0, 32) || 'New World';
    const txt = $('cw-seed').value.trim();
    let seed;
    if (!txt) seed = (Math.random() * 2147483647) | 0;
    else if (/^-?\d+$/.test(txt)) seed = parseInt(txt, 10) | 0;
    else { seed = 0; for (const ch of txt) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) | 0; }
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    this.selectedWorld = id;
    this.enterGame(() => this.game.startWorld({
      id, name, seed,
      mode: o.mode === 'hardcore' ? 'survival' : o.mode,
      difficulty: o.mode === 'hardcore' ? 3 : o.difficulty,
      cheats: o.mode === 'hardcore' ? false : o.cheats,
      hardcore: o.mode === 'hardcore',
    }));
  }

  playSelected() {
    const meta = WorldStore.list().find((w) => w.id === this.selectedWorld);
    if (!meta) return;
    const saved = WorldStore.load(meta.id);
    if (!saved) return;
    this.enterGame(() => this.game.startWorld({ id: meta.id, name: meta.name, saved }));
  }

  enterGame(start) {
    this.chat.clear();
    start();
    this.cursor = null;
    this.selectSlot(this.game.player.selected || 0);
    this.refreshHud();
    this.resume();
  }

  resume() {
    if (this.game.player && this.game.player.dead) return;
    this.closeScreen(true);
    this.showScreen('none');
    this.lock();
  }

  lock() {
    if (this.game.mode !== 'play') return;
    const canvas = this.game.renderer.domElement;
    if (!('requestPointerLock' in canvas)) { this.dragLook = true; return; }
    try {
      const r = canvas.requestPointerLock();
      if (r && r.catch) r.catch(() => { this.dragLook = true; });
    } catch (e) { this.dragLook = true; }
  }

  pause() {
    if (this.game.mode !== 'play' || this.screen !== 'none') return;
    this.showScreen('pause');
  }

  renderPause() {
    const g = this.game;
    const btn = $('btn-open-friends');
    btn.hidden = g.remote;
    if (g.net.active && g.net.kind === 'room' && g.net.isHost) {
      btn.disabled = true;
      btn.textContent = 'Open to Friends';
      $('pause-info').textContent = `Friends can join with code: ${g.net.code}`;
    } else {
      btn.disabled = false;
      btn.textContent = 'Open to Friends';
      $('pause-info').textContent = '';
    }
    $('btn-quit').textContent = g.remote ? 'Disconnect' : 'Save and Quit to Title';
  }

  async openToFriends() {
    const info = $('pause-info');
    info.textContent = 'Opening…';
    try {
      const code = await this.game.openToFriends();
      info.textContent = `Friends can join with code: ${code}`;
      this.chat.system(`Local game hosted. Join code: ${code}`, '#ff5');
      $('btn-open-friends').disabled = true;
    } catch (e) {
      info.textContent = e.message || 'Could not open the world to friends.';
    }
  }

  async quitToTitle() {
    this.closeScreen(true);
    $('death').hidden = true;
    await this.game.stop();
    this.game.startPanorama();
    this.showScreen('title');
  }

  showDeath(text, hardcore) {
    $('death-msg').textContent = text;
    $('btn-respawn').textContent = hardcore ? 'Spectate World' : 'Respawn';
    $('death').hidden = false;
    this.releaseMouse();
    this.screen = 'death';
  }

  disconnected(msg) {
    this.closeScreen(true);
    this.game.stop().then(() => this.game.startPanorama());
    $('dc-msg').textContent = msg;
    this.showScreen('disconnected');
  }

  // ---------------------------------------------------------------- multiplayer screen
  async renderMultiplayer() {
    $('mp-name').value = this.game.settings.name;
    let last = '';
    try { last = localStorage.getItem('webcraft-last-server') || ''; } catch (e) { /* */ }
    // When the page itself is served by a WebCraft server, suggest that server.
    if (!last && /^https?:$/.test(location.protocol) && location.host && !/claude\.ai|claudeusercontent/.test(location.host)) {
      last = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
    }
    $('mp-address').value = last;
    const list = $('mp-list');
    list.innerHTML = '';
    list.appendChild(el('div', 'empty', 'Looking for friends’ worlds…'));
    const room = await getRoomCapability();
    if (this.screen !== 'multiplayer') return;
    $('mp-code-row').hidden = !room;
    if (!room) {
      list.innerHTML = '';
      list.appendChild(el('div', 'empty', 'Friend worlds work when this game is opened as a shared claude.ai page. You can still join a WebCraft server below.'));
      return;
    }
    const render = (peers) => {
      list.innerHTML = '';
      const games = peers.filter((p) => !p.sameTab && p.presence && p.presence.hosting && p.presence.hosting.code);
      if (!games.length) {
        list.appendChild(el('div', 'empty', 'No open worlds yet. A friend with this page open can choose Open to Friends from their pause menu.'));
        return;
      }
      for (const p of games) {
        const h = p.presence.hosting;
        const row = el('button', 'world-row');
        row.type = 'button';
        const icon = el('img', 'world-icon');
        icon.src = this.iconFor(B.GRASS); icon.alt = '';
        const info = el('div', 'world-info');
        info.appendChild(el('div', 'world-name', String(h.name || 'World').slice(0, 40)));
        info.appendChild(el('div', 'world-sub', 'Open to friends · code ' + String(h.code).slice(0, 12)));
        row.append(icon, info);
        row.onclick = () => this.join('room', String(h.code).replace(/[^a-z0-9]/g, ''));
        list.appendChild(row);
      }
    };
    render(room.peers());
    if (this.lobbyUnsub) this.lobbyUnsub();
    this.lobbyUnsub = room.onPeers((c) => render(c.peers), () => {});
  }

  async join(kind, target) {
    this.game.settings.name = this.cleanName($('mp-name').value);
    this.saveSettings();
    $('join-msg').textContent = kind === 'room' ? 'Connecting to friend’s world…' : 'Connecting to the server…';
    this.showScreen('joining');
    try {
      await this.game.net.close();
      await this.game.joinGame(kind, target);
      setTimeout(() => {
        if (this.screen === 'joining' && this.game.awaitingWelcome) $('join-msg').textContent = 'Waiting for the host to answer… (make sure the code is right and the host is still in the world)';
      }, 6000);
    } catch (e) {
      $('dc-msg').textContent = e.message || 'Could not connect.';
      this.showScreen('disconnected');
    }
  }

  onJoined() {
    this.chat.clear();
    this.chat.system(`Joined ${this.game.worldName}`, '#ff5');
    this.selectSlot(0);
    this.refreshHud();
    this.resume();
  }

  // ---------------------------------------------------------------- options
  renderOptions() {
    const s = this.game.settings;
    const set = (id, v, label) => { $(id).value = v; $(id + '-label').textContent = label; };
    set('opt-fov', s.fov, 'FOV: ' + (s.fov === 70 ? 'Normal' : s.fov));
    set('opt-rd', s.renderDistance, `Render Distance: ${s.renderDistance} chunks`);
    set('opt-sens', s.sensitivity, `Sensitivity: ${Math.round(s.sensitivity * 100)}%`);
    set('opt-vol', s.volume, `Sound: ${s.volume === 0 ? 'OFF' : Math.round(s.volume * 100) + '%'}`);
    $('opt-name').value = s.name;
    const g = this.game;
    const names = { OFF: 'OFF', LOW: 'Halcyon (Low)', MEDIUM: 'Halcyon (Medium)', HIGH: 'Halcyon (High)', ULTRA: 'Halcyon (Ultra)' };
    const unsupported = s.shaders !== 'OFF' && g.halcyon && !g.halcyon.supported;
    $('btn-opt-shaders').textContent = 'Shaders: ' + (unsupported ? 'not supported in this browser' : names[s.shaders || 'MEDIUM']);
  }

  // ---------------------------------------------------------------- HUD
  selectSlot(i) {
    const p = this.game.player;
    if (!p) return;
    p.selected = ((i % 9) + 9) % 9;
    this.game.eating = 0;
    this.game.stopMining();
    this.renderHotbar();
    const s = p.heldStack;
    const t = $('toast');
    if (s) {
      t.textContent = ITEMS[s.id].name;
      t.style.opacity = 1;
      this.toastTimer = 2;
    } else t.style.opacity = 0;
  }

  inventoryChanged() {
    this.renderHotbar();
    if (this.gui) this.renderGui();
  }

  slotContent(node, stack) {
    node.innerHTML = '';
    if (!stack) return;
    const img = el('img');
    img.src = this.iconFor(stack.id);
    img.alt = '';
    img.draggable = false;
    node.appendChild(img);
    if (stack.ench) node.appendChild(el('div', 'glint'));
    if (stack.count > 1) node.appendChild(el('span', 'count', String(stack.count)));
    const tool = ITEMS[stack.id] && ITEMS[stack.id].tool;
    if (tool && stack.dmg > 0) {
      const f = 1 - stack.dmg / tool.uses;
      const bar = el('div', 'dura');
      const fillEl = el('div');
      fillEl.style.width = (f * 100) + '%';
      fillEl.style.background = `hsl(${Math.round(f * 120)}, 100%, 45%)`;
      bar.appendChild(fillEl);
      node.appendChild(bar);
    }
  }

  renderHotbar() {
    const p = this.game.player;
    if (!p) return;
    const bar = $('hotbar');
    if (bar.children.length !== 9) {
      bar.innerHTML = '';
      for (let i = 0; i < 9; i++) bar.appendChild(el('div', 'hslot'));
    }
    for (let i = 0; i < 9; i++) {
      const n = bar.children[i];
      n.classList.toggle('selected', i === p.selected);
      this.slotContent(n, p.inventory.slots[i]);
    }
  }

  refreshHud() {
    this.hudCache = {};
    this.renderHotbar();
  }

  updateHud(dt) {
    const g = this.game, p = g.player;
    if (g.mode !== 'play' || !p) return;
    const surv = p.usesHealth;
    $('stats').hidden = !surv;
    $('hotbar').hidden = p.mode === 'spectator';
    if (surv) {
      const hp = Math.ceil(p.health), food = Math.ceil(p.food), air = p.eyeInWater || p.air < 15 ? Math.ceil(p.air / 1.5) : -1;
      const armor = p.armorPoints;
      const key = `${hp}|${food}|${air}|${g.hardcore}|${p.hurtTime > 0 ? 1 : 0}|${armor}`;
      if (this.hudCache.stats !== key) {
        this.hudCache.stats = key;
        const hearts = $('hearts');
        hearts.innerHTML = '';
        for (let i = 0; i < 10; i++) {
          const v = hp - i * 2;
          const img = el('img');
          img.src = v >= 2 ? (g.hardcore ? ICONS.heartHard : ICONS.heart) : v === 1 ? ICONS.heartHalf : ICONS.heartEmpty;
          img.alt = '';
          hearts.appendChild(img);
        }
        hearts.classList.toggle('flash', p.hurtTime > 0);
        const foodEl = $('food');
        foodEl.innerHTML = '';
        for (let i = 0; i < 10; i++) {
          const v = food - i * 2;
          const img = el('img');
          img.src = v >= 2 ? ICONS.food : v === 1 ? ICONS.foodHalf : ICONS.foodEmpty;
          img.alt = '';
          foodEl.appendChild(img);
        }
        const armorEl = $('armor-row');
        armorEl.innerHTML = '';
        if (armor > 0) for (let i = 0; i < 10; i++) {
          const v = armor - i * 2;
          const img = el('img');
          img.src = v >= 2 ? ICONS.armor : v === 1 ? ICONS.armorHalf : ICONS.armorEmpty;
          img.alt = '';
          armorEl.appendChild(img);
        }
        const airEl = $('air');
        airEl.innerHTML = '';
        if (air >= 0) for (let i = 0; i < air; i++) { const img = el('img'); img.src = ICONS.bubble; img.alt = ''; airEl.appendChild(img); }
      }
      // Shake hearts when low
      $('hearts').classList.toggle('low', p.health <= 4);
      $('food').classList.toggle('low', p.food <= 0);
    }
    // Experience bar
    const xpBar = $('xpbar');
    xpBar.hidden = !surv;
    if (surv) {
      const xl = xpLevel(p.xp || 0);
      const xk = xl.level + '|' + Math.round(xl.progress * 182);
      if (this.hudCache.xp !== xk) {
        this.hudCache.xp = xk;
        $('xpfill').style.width = (xl.progress * 100) + '%';
        $('xplevel').textContent = xl.level > 0 ? String(xl.level) : '';
      }
    }
    // Boss bar for the Ender Dragon
    let boss = null;
    for (const m of g.mobs.values()) if (m.type === 'dragon' && !m.dead) { boss = m; break; }
    $('bossbar').hidden = !boss;
    if (boss) $('bossfill').style.width = Math.max(0, boss.health / boss.info.health * 100) + '%';
    $('hurt-overlay').style.opacity = p.hurtTime > 0 ? p.hurtTime * 1.2 : 0;
    $('portal-overlay').style.opacity = p.inPortal && !p.portalLock && p.portalCooldown <= 0 ? Math.min(0.8, p.portalTime / 4) : 0;
    $('fire-overlay').hidden = !(p.fireTime > 0 && p.usesHealth);
    $('underwater').hidden = !g.underwater;
    $('loading').hidden = g.isReady() && !g.pendingEdits;
    if (g.pendingEdits && performance.now() - g.pendingEdits.started > 15000) g.pendingEdits = null;
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) $('toast').style.opacity = 0;
    }
    if (this.debug) this.renderDebug();
    this.chat.update();
  }

  renderDebug() {
    const g = this.game, p = g.player;
    const hours = Math.floor((g.timeOfDay * 24 + 0) % 24), mins = Math.floor((g.timeOfDay * 24 % 1) * 60);
    const l = g.world.getLight(Math.floor(p.pos.x), Math.floor(p.pos.y + 0.5), Math.floor(p.pos.z));
    const t = g.targetInfo || {};
    const facing = ['south', 'west', 'north', 'east'][((Math.round(-p.yaw / (Math.PI / 2)) % 4) + 4 + 2) % 4];
    $('debug').textContent =
      `WebCraft (${this.fps} fps)\n` +
      `XYZ: ${p.pos.x.toFixed(3)} / ${p.pos.y.toFixed(3)} / ${p.pos.z.toFixed(3)}\n` +
      `Block: ${Math.floor(p.pos.x)} ${Math.floor(p.pos.y)} ${Math.floor(p.pos.z)}  Chunk: ${Math.floor(p.pos.x / 16)} ${Math.floor(p.pos.z / 16)}\n` +
      `Facing: ${facing}\n` +
      `Light: ${Math.max(l.sky, l.block)} (sky ${l.sky}, block ${l.block})\n` +
      `Day time: ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}  Difficulty: ${DIFFICULTIES[g.difficulty]}\n` +
      `Mode: ${p.mode}${g.hardcore ? ' (hardcore)' : ''}  Seed: ${g.world.seed}\n` +
      `Chunks: ${g.world.chunks.size}  Mobs: ${g.mobs.size}  Items: ${g.items.length}\n` +
      (g.net.active ? `Multiplayer: ${g.net.kind}${g.net.isHost ? ' (host)' : ''}  Players: ${g.remotePlayers.size + 1}\n` : '') +
      (t.block ? `Looking at: ${BLOCKS[t.block.id].name} ${t.block.x} ${t.block.y} ${t.block.z}` : t.entity ? `Looking at: ${t.entity.type || t.entity.name}` : '');
  }

  // ---------------------------------------------------------------- container screens
  // A slot ref: {get(), set(stack), accepts(stack)?, output?, creative?}
  openGui(kind, opts = {}) {
    const g = this.game;
    if (g.player.mode === 'spectator') return;
    this.gui = Object.assign({ kind }, opts);
    if (kind === 'inventory' && g.player.mode === 'creative') this.gui.kind = 'creative';
    if (this.gui.kind === 'inventory') this.gui.grid = new Array(4).fill(null);
    if (this.gui.kind === 'crafting') this.gui.grid = new Array(9).fill(null);
    this.screen = 'gui';
    $('gui').hidden = false;
    this.releaseMouse();
    g.stopMining();
    this.buildGui();
  }
  openCrafting() { this.openGui('crafting'); }
  openEnchant(x, y, z) { this.openGui('enchant', { pos: [x, y, z], item: null, lapis: null }); }
  openTrade(mob) { this.openGui('trade', { mob }); }

  // End credits: the player's own poem-free scroll, then back to the Overworld
  showCredits(cb) {
    const c = $('credits');
    const inner = $('credits-scroll');
    const name = this.game.settings.name;
    inner.innerHTML = '';
    const lines = [
      ['h', 'WEBCRAFT'], ['', ''], ['', `${name} defeated the Ender Dragon.`], ['', ''],
      ['', 'The island is quiet now. The crystals are dust, and the exit portal hums'],
      ['', 'with the light of a sky you have never seen.'], ['', ''],
      ['', 'You came from a world of grass and stone, of sunrises and long nights,'],
      ['', 'of caves that went deeper than you meant to go.'], ['', ''],
      ['', 'You built a house. Then a better one. You learned what creepers sound like.'],
      ['', 'You found a village, a fortress, a stronghold, and finally this place.'], ['', ''],
      ['', 'There is no more story than the one you make.'], ['', 'Go home. Build something.'], ['', ''], ['', ''],
      ['h', 'Credits'], ['', ''],
      ['s', 'Game'], ['', 'WebCraft, a browser tribute to Minecraft'], ['', ''],
      ['s', 'Shaders'], ['', 'Halcyon shader pack, ported to WebGL'], ['', ''],
      ['s', 'Rendering'], ['', 'three.js'], ['', ''],
      ['s', 'Player'], ['', name], ['', ''], ['', ''], ['', 'Thanks for playing.'],
    ];
    for (const [k, t] of lines) inner.appendChild(el('div', 'cl ' + (k || ''), t || '\u00a0'));
    c.hidden = false;
    this.releaseMouse();
    this.screen = 'credits';
    inner.style.animation = 'none';
    void inner.offsetHeight;
    inner.style.animation = '';
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      c.hidden = true;
      this.screen = 'none';
      cb();
      this.resume();
    };
    $('btn-credits-skip').onclick = finish;
    inner.onanimationend = finish;
  }

  // Fade to black, run cb, fade back (sleeping)
  sleep(cb) {
    const o = $('sleep-overlay');
    o.hidden = false;
    o.style.opacity = 0;
    requestAnimationFrame(() => { o.style.opacity = 1; });
    setTimeout(() => { cb(); o.style.opacity = 0; setTimeout(() => { o.hidden = true; }, 900); }, 2200);
  }
  openFurnace(x, y, z) {
    const w = this.game.world;
    if (!w.getData(x, y, z) || !w.getData(x, y, z).slots) w.setData(x, y, z, Object.assign(w.getData(x, y, z) || {}, { type: 'furnace', slots: [0, 0, 0], burn: 0, burnMax: 0, cook: 0 }));
    this.openGui('furnace', { pos: [x, y, z] });
  }
  openChest(x, y, z) {
    const w = this.game.world;
    if (!w.getData(x, y, z) || !w.getData(x, y, z).slots) w.setData(x, y, z, Object.assign(w.getData(x, y, z) || {}, { type: 'chest', slots: new Array(27).fill(0) }));
    Sound.noise(400, 1, 0.3, 0.3);
    this.openGui('chest', { pos: [x, y, z] });
  }

  containerChanged(x, y, z) {
    if (this.gui && this.gui.kind !== 'enchant' && this.gui.pos && this.gui.pos[0] === x && this.gui.pos[1] === y && this.gui.pos[2] === z) {
      if (!this.game.world.getData(x, y, z) || ![B.FURNACE, B.FURNACE_LIT, B.CHEST].includes(this.game.world.getBlock(x, y, z))) this.closeScreen();
      else this.renderGui();
    }
  }

  closeScreen(silent) {
    if (!this.gui) return;
    const g = this.game;
    const p = g.player;
    // Return crafting grid + cursor items
    const give = (s) => {
      if (!s) return;
      const left = p.inventory.add(s, PICKUP_ORDER);
      if (left) {
        const d = p.lookDir();
        g.spawnItem(stackOf(s.id, left, s.dmg, s.ench), p.pos.x + d.x, p.pos.y + 1.4, p.pos.z + d.z);
      }
    };
    if (this.gui.grid) this.gui.grid.forEach(give);
    if (this.gui.kind === 'enchant') { give(this.gui.item); give(this.gui.lapis); }
    give(this.cursor);
    this.cursor = null;
    if (this.gui.kind === 'chest') Sound.noise(350, 1, 0.3, 0.25);
    this.gui = null;
    $('gui').hidden = true;
    $('cursor-item').hidden = true;
    $('tooltip').hidden = true;
    if (!silent) this.resume();
  }

  // Stack <-> stored array helpers for block data
  static toArr(s) { return s ? (s.ench ? [s.id, s.count, s.dmg || 0, s.ench] : [s.id, s.count, s.dmg || 0]) : 0; }
  static fromArr(a) { return a && ITEMS[a[0]] ? stackOf(a[0], a[1], a[2], a[3]) : null; }

  dataRef(i) {
    const g = this.game;
    const [x, y, z] = this.gui.pos;
    return {
      get: () => { const d = g.world.getData(x, y, z); return d && d.slots ? UI.fromArr(d.slots[i]) : null; },
      set: (s) => {
        const d = g.world.getData(x, y, z);
        if (!d || !d.slots) return;
        d.slots[i] = UI.toArr(s);
        g.net.send('bdata', { x, y, z, d, w: g.world.dim });
      },
    };
  }

  invRef(i) {
    const inv = this.game.player.inventory;
    return { get: () => inv.slots[i], set: (s) => { inv.slots[i] = s; }, group: i < 9 ? 'hotbar' : 'main', index: i };
  }

  buildGui() {
    const gui = this.gui;
    const panel = $('gui-panel');
    panel.innerHTML = '';
    panel.className = 'gui-panel gui-' + gui.kind;
    gui.slots = []; // {ref, node}
    const addSlot = (parent, ref, cls = '') => {
      const node = el('div', 'slot ' + cls);
      parent.appendChild(node);
      const entry = { ref, node };
      gui.slots.push(entry);
      node.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); this.clickSlot(entry, e.button, e.shiftKey); });
      node.addEventListener('mouseenter', () => { this.hoverSlot = entry; this.showTooltip(entry); });
      node.addEventListener('mouseleave', () => { if (this.hoverSlot === entry) this.hoverSlot = null; $('tooltip').hidden = true; });
      node.addEventListener('contextmenu', (e) => e.preventDefault());
      return entry;
    };
    const title = (t) => panel.appendChild(el('div', 'gui-title', t));
    const row = (cls) => { const r = el('div', 'gui-row ' + (cls || '')); panel.appendChild(r); return r; };
    const gridOf = (parent, cols, refs, cls) => {
      const g = el('div', 'slot-grid');
      g.style.gridTemplateColumns = `repeat(${cols}, var(--slot))`;
      parent.appendChild(g);
      refs.forEach((r) => addSlot(g, r, cls));
      return g;
    };
    const playerInv = () => {
      if (gui.kind !== 'creative') panel.appendChild(el('div', 'gui-title', 'Inventory'));
      gridOf(panel, 9, Array.from({ length: 27 }, (_, i) => this.invRef(9 + i)));
      const hb = gridOf(panel, 9, Array.from({ length: 9 }, (_, i) => this.invRef(i)));
      hb.classList.add('hotbar-row');
    };
    const craftArea = (size) => {
      const r = row('craft-row');
      const refs = gui.grid.map((_, i) => ({ get: () => gui.grid[i], set: (s) => { gui.grid[i] = s; }, group: 'grid' }));
      gridOf(r, size, refs);
      r.appendChild(el('div', 'arrow'));
      const out = { output: true, get: () => this.craftResult(), set: () => {}, group: 'out' };
      addSlot(r, out, 'big');
    };

    if (gui.kind === 'trade') {
      const mob = gui.mob;
      title(`${mob.profession[0].toUpperCase() + mob.profession.slice(1)} Villager`);
      const list = el('div', 'trade-list');
      panel.appendChild(list);
      const inv = this.game.player.inventory;
      for (const offer of this.game.tradeOffers(mob)) {
        const [c1, c2, res] = offer;
        const btn = el('button', 'trade-row');
        btn.type = 'button';
        const icon = (id, n) => {
          const sl = el('div', 'slot small');
          this.slotContent(sl, stackOf(id, n));
          sl.title = ITEMS[id].name;
          return sl;
        };
        btn.appendChild(icon(c1[0], c1[1]));
        btn.appendChild(c2 ? icon(c2[0], c2[1]) : el('div', 'slot small blank'));
        btn.appendChild(el('div', 'arrow'));
        btn.appendChild(icon(res[0], res[1]));
        const can = inv.count(c1[0]) >= c1[1] && (!c2 || inv.count(c2[0]) >= c2[1]);
        btn.classList.toggle('disabled', !can);
        btn.addEventListener('mousedown', (e) => { e.preventDefault(); if (this.game.doTrade(offer)) this.buildGui(); else Sound.click(); });
        list.appendChild(btn);
      }
      playerInv();
      this.renderGui();
      return;
    }
    if (gui.kind === 'inventory') {
      const top = row('inv-top');
      const armorCol = el('div', 'armor-col');
      top.appendChild(armorCol);
      const pa = this.game.player.armor;
      for (let i = 0; i < 4; i++) {
        const ref = {
          get: () => pa.slots[i], set: (st) => { pa.slots[i] = st; pa.changed(); }, group: 'armor',
          accepts: (st) => !!(ITEMS[st.id].armor && ITEMS[st.id].armor.slot === i),
        };
        const e = addSlot(armorCol, ref, 'armor-slot');
        e.node.dataset.piece = ['helmet', 'chest', 'legs', 'boots'][i];
      }
      const preview = el('div', 'player-preview');
      preview.appendChild(this.playerPreview());
      preview.appendChild(el('div', 'pp-label', this.game.settings.name));
      top.appendChild(preview);
      const c = el('div', 'inv-craft');
      c.appendChild(el('div', 'gui-title', 'Crafting'));
      top.appendChild(c);
      const r = el('div', 'gui-row craft-row');
      c.appendChild(r);
      const refs = gui.grid.map((_, i) => ({ get: () => gui.grid[i], set: (s) => { gui.grid[i] = s; }, group: 'grid' }));
      gridOf(r, 2, refs);
      r.appendChild(el('div', 'arrow'));
      addSlot(r, { output: true, get: () => this.craftResult(), set: () => {}, group: 'out' }, 'big');
      playerInv();
    } else if (gui.kind === 'crafting') {
      title('Crafting');
      craftArea(3);
      playerInv();
    } else if (gui.kind === 'furnace') {
      title('Furnace');
      const r = row('furnace-row');
      const left = el('div', 'furnace-left');
      r.appendChild(left);
      addSlot(left, Object.assign(this.dataRef(0), { group: 'container' }));
      const flame = el('div', 'flame');
      flame.appendChild(el('div', 'flame-fill'));
      left.appendChild(flame);
      addSlot(left, Object.assign(this.dataRef(1), { group: 'container', accepts: (s) => ITEMS[s.id].fuel > 0 }));
      const arrow = el('div', 'arrow progress');
      arrow.appendChild(el('div', 'arrow-fill'));
      r.appendChild(arrow);
      addSlot(r, Object.assign(this.dataRef(2), { group: 'container', takeOnly: true }), 'big');
      playerInv();
    } else if (gui.kind === 'enchant') {
      title('Enchant');
      const r = row('enchant-row');
      const left = el('div', 'enchant-left');
      r.appendChild(left);
      const book = el('div', 'enchant-book');
      left.appendChild(book);
      const slots = el('div', 'enchant-slots');
      left.appendChild(slots);
      addSlot(slots, { group: 'container', get: () => gui.item, set: (st) => { gui.item = st; }, accepts: (st) => st.count === 1 || maxStack(st.id) === 1 });
      addSlot(slots, { group: 'container', get: () => gui.lapis, set: (st) => { gui.lapis = st; }, accepts: (st) => st.id === ITEM.LAPIS }, 'lapis-slot');
      const offers = el('div', 'enchant-offers');
      r.appendChild(offers);
      gui.offersEl = offers;
      playerInv();
    } else if (gui.kind === 'chest') {
      title('Chest');
      gridOf(panel, 9, Array.from({ length: 27 }, (_, i) => Object.assign(this.dataRef(i), { group: 'container' })));
      playerInv();
    } else if (gui.kind === 'creative') {
      title('Creative Inventory');
      const search = el('input', 'creative-search');
      search.id = 'creative-search';
      search.placeholder = 'Search items…';
      search.setAttribute('aria-label', 'Search items');
      panel.appendChild(search);
      const box = el('div', 'creative-box');
      panel.appendChild(box);
      const fill = () => {
        box.innerHTML = '';
        gui.slots = gui.slots.filter((s) => !s.ref.creative);
        const q = search.value.trim().toLowerCase();
        const ids = ALL_ITEM_IDS.filter((id) => {
          if (id < 256 && !BLOCKS[id].inCreative) return false;
          return !q || ITEMS[id].name.toLowerCase().includes(q);
        });
        gridOf(box, 9, ids.map((id) => ({ creative: true, id, get: () => stackOf(id, 1), set: () => {} })));
        this.renderGui();
      };
      search.addEventListener('input', fill);
      search.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') this.closeScreen(); });
      fill();
      const bottom = row('creative-bottom');
      const trash = el('div', 'slot trash');
      trash.title = 'Destroy Item';
      trash.textContent = '✕';
      trash.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (e.shiftKey) { this.game.player.inventory.clear(); }
        this.cursor = null; this.renderGui();
      });
      playerInv();
      panel.appendChild(bottom);
      bottom.appendChild(el('span', 'hint', 'Shift-click the ✕ to clear your inventory'));
      bottom.appendChild(trash);
    }
    this.renderGui();
  }

  // Flat front view of the player skin for the inventory screen.
  playerPreview() {
    const skin = skinTexture('player').tex.image;
    const c = document.createElement('canvas');
    const k = 3;
    c.width = 16 * k; c.height = 32 * k;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const blit = (sx, sy, sw, sh, dx, dy) => ctx.drawImage(skin, sx, sy, sw, sh, dx * k, dy * k, sw * k, sh * k);
    blit(8, 8, 8, 8, 4, 0);    // head
    blit(20, 20, 8, 12, 4, 8); // body
    blit(44, 20, 4, 12, 0, 8); // arms
    blit(44, 20, 4, 12, 12, 8);
    blit(4, 20, 4, 12, 4, 20); // legs
    blit(4, 20, 4, 12, 8, 20);
    c.className = 'pp-img';
    return c;
  }

  craftResult() {
    const gui = this.gui;
    if (!gui || !gui.grid) return null;
    const w = gui.grid.length === 4 ? 2 : 3;
    const r = matchRecipe(gui.grid.map((s) => (s ? s.id : 0)), w);
    return r ? stackOf(r.out, r.count) : null;
  }

  consumeGrid() {
    const gui = this.gui;
    gui.grid.forEach((s, i) => {
      if (!s) return;
      s.count--;
      if (s.count <= 0) gui.grid[i] = null;
    });
  }

  renderGui() {
    const gui = this.gui;
    if (!gui) return;
    for (const { ref, node } of gui.slots) this.slotContent(node, ref.get());
    if (gui.kind === 'furnace') {
      const d = this.game.world.getData(...gui.pos);
      if (d) {
        const ff = document.querySelector('.flame-fill');
        if (ff) ff.style.height = (d.burnMax ? Math.max(0, d.burn / d.burnMax) * 100 : 0) + '%';
        const af = document.querySelector('.arrow-fill');
        if (af) af.style.width = (d.cook / SMELT_TIME * 100) + '%';
      }
    }
    if (gui.kind === 'enchant' && gui.offersEl) this.renderEnchantOffers();
    const ci = $('cursor-item');
    ci.hidden = !this.cursor;
    if (this.cursor) this.slotContent(ci, this.cursor);
  }

  renderEnchantOffers() {
    const g = this.game, gui = this.gui, p = g.player;
    const box = gui.offersEl;
    box.innerHTML = '';
    const offers = gui.item ? enchantOffers(gui.item, g.countBookshelves(...gui.pos), p.enchantSeed) : [];
    const lvl = xpLevel(p.xp).level;
    const glyphs = 'ᔑʖᓵ↸ᒷ⎓⊣⍑╎⋮ꖌꖎᒲリ𝙹!¡ᑑ∷ᓭℸ⚍⍊∴̇/||⨅';
    for (let i = 0; i < 3; i++) {
      const o = offers[i];
      const btn = el('button', 'enchant-offer');
      btn.type = 'button';
      if (!o) { btn.classList.add('disabled'); box.appendChild(btn); continue; }
      const k = Object.keys(o.ench)[0];
      let gib = '';
      for (let j = 0; j < 12; j++) gib += glyphs[(o.cost * 7 + j * 13 + i * 5) % glyphs.length];
      btn.appendChild(el('span', 'eo-lapis', String(o.lapis)));
      const mid = el('span', 'eo-text');
      mid.appendChild(el('span', 'eo-gib', gib));
      mid.appendChild(el('span', 'eo-hint', enchName(k, o.ench[k]) + ' . . . ?'));
      btn.appendChild(mid);
      btn.appendChild(el('span', 'eo-cost', String(o.cost)));
      const creative = p.mode === 'creative';
      const can = creative || (lvl >= o.cost && gui.lapis && gui.lapis.count >= o.lapis);
      btn.classList.toggle('disabled', !can);
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (g.enchantItem(gui, i)) { p.inventory.changed(); this.renderGui(); } else Sound.click();
      });
      box.appendChild(btn);
    }
  }

  showTooltip(entry) {
    const s = entry.ref.get();
    const tt = $('tooltip');
    if (!s) { tt.hidden = true; return; }
    const tool = ITEMS[s.id].tool;
    tt.innerHTML = '';
    const name = el('div', s.ench ? 'tt-name ench' : 'tt-name', ITEMS[s.id].name + (tool && s.dmg ? `  (${tool.uses - s.dmg}/${tool.uses})` : ''));
    tt.appendChild(name);
    if (s.ench) for (const [k, l] of Object.entries(s.ench)) if (ENCHANTS[k]) tt.appendChild(el('div', 'tt-ench', enchName(k, l)));
    tt.hidden = false;
  }

  clickSlot(entry, button, shift) {
    const ref = entry.ref;
    const g = this.game;
    const p = g.player;
    Sound.init();
    if (ref.creative) {
      if (this.cursor) { this.cursor = null; }
      else if (shift) p.inventory.add(stackOf(ref.id, maxStack(ref.id)), PICKUP_ORDER);
      else this.cursor = stackOf(ref.id, button === 2 ? 1 : maxStack(ref.id));
      this.renderGui();
      return;
    }
    if (ref.output) {
      const res = ref.get();
      if (!res) return;
      if (shift) {
        let guard = 64;
        while (guard-- > 0) {
          const r = this.craftResult();
          if (!r || !p.inventory.canFit(r)) break;
          p.inventory.add(r, PICKUP_ORDER.slice().reverse());
          this.consumeGrid();
        }
      } else if (!this.cursor) {
        this.cursor = res; this.consumeGrid();
      } else if (sameKind(this.cursor, res) && this.cursor.count + res.count <= maxStack(res.id)) {
        this.cursor.count += res.count; this.consumeGrid();
      }
      Sound.click();
      p.inventory.changed();
      this.renderGui();
      return;
    }
    const cur = ref.get();
    if (shift && cur) {
      this.quickMove(entry);
    } else if (button === 0) {
      if (!this.cursor) { if (cur) { this.cursor = cur; ref.set(null); } }
      else if (ref.takeOnly) {
        if (cur && sameKind(cur, this.cursor) && this.cursor.count + cur.count <= maxStack(cur.id)) { this.cursor.count += cur.count; ref.set(null); }
      } else if (!cur) {
        if (!ref.accepts || ref.accepts(this.cursor)) { ref.set(this.cursor); this.cursor = null; }
      } else if (sameKind(cur, this.cursor)) {
        const n = Math.min(this.cursor.count, maxStack(cur.id) - cur.count);
        cur.count += n; this.cursor.count -= n;
        ref.set(cur);
        if (this.cursor.count <= 0) this.cursor = null;
      } else if (!ref.accepts || ref.accepts(this.cursor)) {
        ref.set(this.cursor); this.cursor = cur;
      }
    } else if (button === 2) {
      if (!this.cursor) {
        if (cur) {
          const half = Math.ceil(cur.count / 2);
          this.cursor = stackOf(cur.id, half, cur.dmg, cur.ench);
          cur.count -= half;
          ref.set(cur.count > 0 ? cur : null);
        }
      } else if (!ref.takeOnly && (!ref.accepts || ref.accepts(this.cursor))) {
        if (!cur) { ref.set(stackOf(this.cursor.id, 1, this.cursor.dmg, this.cursor.ench)); this.cursor.count--; }
        else if (sameKind(cur, this.cursor) && cur.count < maxStack(cur.id)) { cur.count++; ref.set(cur); this.cursor.count--; }
        if (this.cursor.count <= 0) this.cursor = null;
      }
    }
    p.inventory.changed();
    this.renderGui();
    this.showTooltip(entry);
  }

  quickMove(entry) {
    const ref = entry.ref;
    const s = ref.get();
    if (!s) return;
    const p = this.game.player;
    const gui = this.gui;
    let targets;
    if (gui.kind === 'inventory' && ITEMS[s.id].armor && ref.group !== 'armor') {
      targets = gui.slots.filter((e) => e.ref.group === 'armor').map((e) => e.ref);
    } else if (ref.group === 'container' || ref.group === 'grid' || ref.group === 'armor') {
      targets = gui.slots.filter((e) => e.ref.group === 'hotbar' || e.ref.group === 'main').map((e) => e.ref);
      targets.reverse();
    } else if (gui.kind === 'chest') {
      targets = gui.slots.filter((e) => e.ref.group === 'container').map((e) => e.ref);
    } else if (gui.kind === 'enchant') {
      const cs = gui.slots.filter((e) => e.ref.group === 'container').map((e) => e.ref);
      targets = s.id === ITEM.LAPIS ? [cs[1]] : s.count === 1 ? [cs[0]] : gui.slots.filter((e) => e.ref.group === (ref.group === 'hotbar' ? 'main' : 'hotbar')).map((e) => e.ref);
    } else if (gui.kind === 'furnace') {
      const cs = gui.slots.filter((e) => e.ref.group === 'container').map((e) => e.ref);
      targets = SMELTING[s.id] !== undefined ? [cs[0]] : ITEMS[s.id].fuel > 0 ? [cs[1]] : null;
      if (!targets) targets = gui.slots.filter((e) => e.ref.group === (ref.group === 'hotbar' ? 'main' : 'hotbar')).map((e) => e.ref);
    } else {
      targets = gui.slots.filter((e) => e.ref.group === (ref.group === 'hotbar' ? 'main' : 'hotbar')).map((e) => e.ref);
    }
    let left = s.count;
    for (const pass of [0, 1]) {
      for (const t of targets) {
        if (left <= 0) break;
        if (t.accepts && !t.accepts(s)) continue;
        const c = t.get();
        if (pass === 0 && c && sameKind(c, s) && c.count < maxStack(c.id)) {
          const n = Math.min(left, maxStack(c.id) - c.count);
          c.count += n; left -= n; t.set(c);
        } else if (pass === 1 && !c) {
          t.set(stackOf(s.id, left, s.dmg, s.ench)); left = 0;
        }
      }
    }
    if (left > 0) { s.count = left; ref.set(s); } else ref.set(null);
    p.inventory.changed();
  }

  // ---------------------------------------------------------------- input
  bindInput() {
    const g = this.game;
    const canvas = g.renderer.domElement;

    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.screen === 'none' && !this.dragLook && g.mode === 'play' && !this.chatOpen) this.pause();
    });
    document.addEventListener('pointerlockerror', () => { this.dragLook = true; });

    window.addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT' && e.target.id !== 'chat-input') return;
      if (this.chatOpen) return; // handled by chat input
      if (g.mode !== 'play') return;
      const p = g.player;
      if (this.screen === 'gui') {
        if (e.code === 'KeyE' || e.code === 'Escape') { e.preventDefault(); this.closeScreen(); return; }
        if (e.code.startsWith('Digit') && this.hoverSlot && !this.hoverSlot.ref.output && !this.hoverSlot.ref.creative) {
          const n = parseInt(e.code.slice(5), 10) - 1;
          if (n >= 0 && n < 9) {
            const a = this.hoverSlot.ref, inv = p.inventory;
            const s = a.get(); a.set(inv.slots[n]); inv.slots[n] = s; inv.changed(); this.renderGui();
          }
        }
        if (e.code === 'KeyQ' && this.hoverSlot && !this.hoverSlot.ref.output && !this.hoverSlot.ref.creative) {
          const ref = this.hoverSlot.ref, s = ref.get();
          if (s) {
            const n = e.ctrlKey ? s.count : 1;
            const d = p.lookDir();
            g.spawnItem(stackOf(s.id, n, s.dmg, s.ench), p.pos.x + d.x, p.pos.y + 1.4, p.pos.z + d.z, new THREE.Vector3(d.x * 4, 2, d.z * 4));
            s.count -= n; ref.set(s.count > 0 ? s : null); p.inventory.changed(); this.renderGui();
          }
        }
        return;
      }
      if (this.screen === 'death') return;
      if (this.screen !== 'none') {
        if (e.code === 'Escape' && this.screen === 'pause') { e.preventDefault(); this.resume(); }
        return;
      }
      if (e.code === 'Escape') { this.pause(); return; }
      if (e.code === 'KeyE') { e.preventDefault(); this.openGui('inventory'); return; }
      if (e.code === 'KeyT' || e.code === 'Slash' || e.code === 'Enter') {
        e.preventDefault();
        this.chat.open(e.code === 'Slash' ? '/' : '');
        return;
      }
      if (e.code.startsWith('Digit')) {
        const n = parseInt(e.code.slice(5), 10);
        if (n >= 1 && n <= 9) this.selectSlot(n - 1);
      }
      if (e.code === 'KeyQ') g.dropHeld(e.ctrlKey);
      if (e.code === 'F3' || e.code === 'Backquote') {
        e.preventDefault();
        this.debug = !this.debug;
        $('debug').hidden = !this.debug;
      }
      if (e.code === 'F1') { e.preventDefault(); this.hideHud = !this.hideHud; $('hud').hidden = this.hideHud; }
      if (e.code === 'F5') { e.preventDefault(); this.camMode = (this.camMode + 1) % 3; }
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab', 'ControlLeft'].includes(e.code)) e.preventDefault();
      if (e.ctrlKey && e.code === 'KeyW') e.preventDefault();
      p.onKeyDown(e.code);
    });
    window.addEventListener('keyup', (e) => { if (g.player) g.player.onKeyUp(e.code); });
    window.addEventListener('blur', () => { if (g.player) g.player.keys.clear(); this.mouse = [false, false, false]; });

    let dragMoved = 0;
    canvas.addEventListener('mousedown', (e) => {
      Sound.init(); Sound.resume();
      if (g.mode !== 'play') return;
      if (this.screen !== 'none') return;
      if (!document.pointerLockElement && !this.dragLook) { this.lock(); return; }
      this.mouse[e.button] = true;
      dragMoved = 0;
      if (e.button === 0) {
        const t = g.target();
        if (t.entity) g.attackEntity(t.entity);
        else if (!t.block) g.doSwing();
      }
      if (e.button === 2) g.use();
      if (e.button === 1) { e.preventDefault(); g.pickBlock(); }
    });
    window.addEventListener('mouseup', (e) => { this.mouse[e.button] = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousemove', (e) => {
      const ci = $('cursor-item');
      if (!ci.hidden) { ci.style.left = e.clientX + 'px'; ci.style.top = e.clientY + 'px'; }
      const tt = $('tooltip');
      if (!tt.hidden) { tt.style.left = e.clientX + 14 + 'px'; tt.style.top = e.clientY - 28 + 'px'; }
      if (g.mode !== 'play' || this.screen !== 'none') return;
      const locked = !!document.pointerLockElement;
      if (!locked && !(this.dragLook && this.mouse[0])) return;
      dragMoved += Math.abs(e.movementX) + Math.abs(e.movementY);
      const s = 0.0022 * g.settings.sensitivity;
      const p = g.player;
      p.yaw -= e.movementX * s;
      p.pitch -= e.movementY * s;
      p.pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, p.pitch));
    });
    window.addEventListener('wheel', (e) => {
      if (g.mode !== 'play' || this.screen !== 'none' || this.chatOpen) return;
      this.selectSlot(g.player.selected + (e.deltaY > 0 ? 1 : -1));
    }, { passive: true });

    // Click outside a container panel drops the cursor item
    $('gui').addEventListener('mousedown', (e) => {
      if (e.target !== $('gui') || !this.cursor) return;
      const p = g.player;
      const d = p.lookDir();
      const n = e.button === 2 ? 1 : this.cursor.count;
      g.spawnItem(stackOf(this.cursor.id, n, this.cursor.dmg, this.cursor.ench), p.pos.x + d.x, p.pos.y + 1.4, p.pos.z + d.z, new THREE.Vector3(d.x * 4, 2, d.z * 4));
      this.cursor.count -= n;
      if (this.cursor.count <= 0) this.cursor = null;
      this.renderGui();
    });
    $('gui').addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('beforeunload', (e) => {
      g.save();
      if (g.mode === 'play' && this.screen === 'none') { e.preventDefault(); e.returnValue = ''; }
    });
  }

  // State handed to Game.update each frame
  input() {
    const active = this.game.mode === 'play' && this.screen === 'none' && !this.chatOpen &&
      (!!document.pointerLockElement || this.dragLook);
    return {
      active,
      attack: active && this.mouse[0],
      use: active && this.mouse[2],
    };
  }
}

// ---------------------------------------------------------------- chat
class Chat {
  constructor(ui) {
    this.ui = ui;
    this.lines = [];
    this.history = [];
    this.histIdx = -1;
    const input = $('chat-input');
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const t = input.value.trim();
        this.close();
        if (t) this.send(t);
      } else if (e.key === 'Escape') {
        this.close();
      } else if (e.key === 'ArrowUp') {
        if (this.history.length) { this.histIdx = Math.max(0, (this.histIdx < 0 ? this.history.length : this.histIdx) - 1); input.value = this.history[this.histIdx]; }
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        if (this.histIdx >= 0) { this.histIdx = Math.min(this.history.length, this.histIdx + 1); input.value = this.history[this.histIdx] || ''; }
        e.preventDefault();
      }
    });
  }
  open(prefix) {
    const ui = this.ui;
    ui.chatOpen = true;
    ui.releaseMouse();
    const input = $('chat-input');
    $('chat-bar').hidden = false;
    input.value = prefix;
    this.histIdx = -1;
    $('chat').classList.add('open');
    setTimeout(() => { input.focus(); input.setSelectionRange(prefix.length, prefix.length); }, 0);
  }
  close() {
    const ui = this.ui;
    ui.chatOpen = false;
    $('chat-bar').hidden = true;
    $('chat').classList.remove('open');
    $('chat-input').blur();
    if (ui.screen === 'none') ui.lock();
  }
  send(text) {
    const g = this.ui.game;
    this.history.push(text);
    if (this.history.length > 50) this.history.shift();
    if (text.startsWith('/')) { g.runCommand(text); return; }
    this.add(`<${g.settings.name}> ${text}`);
    if (g.net.active) g.net.send('chat', { n: g.settings.name, t: text.slice(0, 256) });
  }
  add(text, color) {
    this.lines.push({ text, color, t: performance.now() });
    if (this.lines.length > 100) this.lines.shift();
    this.render();
  }
  system(text, color) { this.add(text, color || '#ddd'); }
  clear() { this.lines = []; this.render(); }
  render() {
    const box = $('chat-lines');
    box.innerHTML = '';
    for (const l of this.lines.slice(-50)) {
      const d = el('div', 'chat-line', l.text);
      if (l.color) d.style.color = l.color;
      d.dataset.t = l.t;
      box.appendChild(d);
    }
    box.scrollTop = box.scrollHeight;
  }
  update() {
    const now = performance.now();
    for (const d of $('chat-lines').children) {
      const age = (now - +d.dataset.t) / 1000;
      d.classList.toggle('faded', age > 10);
    }
  }
}
