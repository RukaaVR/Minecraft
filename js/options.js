// Options, laid out like Minecraft's: FOV and Online at the top, then Skin Customization,
// Music & Sounds, Video Settings, Controls (with rebindable key binds), Chat Settings and
// Accessibility Settings. Every setting is saved and applied live.
'use strict';

// Rebindable actions. `def` is the default key; the rest of the game is written against
// these default codes, and the input layer below translates whatever key you bound.
const KEY_ACTIONS = [
  { id: 'forward', name: 'Walk Forwards', cat: 'Movement', def: 'KeyW' },
  { id: 'back', name: 'Walk Backwards', cat: 'Movement', def: 'KeyS' },
  { id: 'left', name: 'Strafe Left', cat: 'Movement', def: 'KeyA' },
  { id: 'right', name: 'Strafe Right', cat: 'Movement', def: 'KeyD' },
  { id: 'jump', name: 'Jump', cat: 'Movement', def: 'Space' },
  { id: 'sneak', name: 'Sneak', cat: 'Movement', def: 'ShiftLeft' },
  { id: 'sprint', name: 'Sprint', cat: 'Movement', def: 'ControlLeft' },
  { id: 'attack', name: 'Attack/Destroy', cat: 'Gameplay', def: 'Mouse0' },
  { id: 'use', name: 'Use Item/Place Block', cat: 'Gameplay', def: 'Mouse2' },
  { id: 'pick', name: 'Pick Block', cat: 'Gameplay', def: 'Mouse1' },
  { id: 'drop', name: 'Drop Selected Item', cat: 'Inventory', def: 'KeyQ' },
  { id: 'inventory', name: 'Open/Close Inventory', cat: 'Inventory', def: 'KeyE' },
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ id: 'hotbar' + n, name: 'Hotbar Slot ' + n, cat: 'Inventory', def: 'Digit' + n })),
  { id: 'chat', name: 'Open Chat', cat: 'Multiplayer', def: 'KeyT' },
  { id: 'command', name: 'Open Command', cat: 'Multiplayer', def: 'Slash' },
  { id: 'playerList', name: 'List Players', cat: 'Multiplayer', def: 'Tab' },
  { id: 'screenshot', name: 'Take Screenshot', cat: 'Miscellaneous', def: 'F2' },
  { id: 'perspective', name: 'Toggle Perspective', cat: 'Miscellaneous', def: 'F5' },
  { id: 'debug', name: 'Debug Screen', cat: 'Miscellaneous', def: 'F3' },
  { id: 'hideHud', name: 'Hide HUD', cat: 'Miscellaneous', def: 'F1' },
  { id: 'fullscreen', name: 'Toggle Fullscreen', cat: 'Miscellaneous', def: 'F11' },
];

// A readable name for a key or mouse button code
function keyName(code) {
  if (code == null) return 'Not Bound';
  const special = {
    Mouse0: 'Left Button', Mouse1: 'Middle Button', Mouse2: 'Right Button', Mouse3: 'Button 4', Mouse4: 'Button 5',
    Space: 'Space', ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ControlLeft: 'Left Control', ControlRight: 'Right Control',
    AltLeft: 'Left Alt', AltRight: 'Right Alt', MetaLeft: 'Left Meta', MetaRight: 'Right Meta', Slash: '/', Backslash: '\\', Backquote: '`',
    Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.',
    ArrowUp: 'Up Arrow', ArrowDown: 'Down Arrow', ArrowLeft: 'Left Arrow', ArrowRight: 'Right Arrow', CapsLock: 'Caps Lock',
  };
  if (special[code]) return special[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Keypad ' + code.slice(6);
  if (code.startsWith('Mouse')) return 'Button ' + (+code.slice(5) + 1);
  return code.replace(/([a-z])([A-Z])/g, '$1 $2');
}

{
  const $ = (id) => document.getElementById(id);
  const DEFAULTS = {
    fov: 70, renderDistance: 6, sensitivity: 1, volume: 0.6, music: 0.5,
    vol_blocks: 1, vol_hostile: 1, vol_friendly: 1, vol_players: 1, vol_weather: 1, subtitles: false,
    viewBobbing: true, guiScale: 1, brightness: 0.5, clouds: true, particles: 2, entityShadows: true, maxFps: 260,
    invertMouse: false, invertScroll: false, sneakToggle: false, sprintToggle: false, autoJump: false, keys: {},
    distortion: 1, fovEffects: 1, damageTilt: 1, hideLightning: false, menuBlur: true,
    chatVisible: true, chatScale: 1, chatOpacity: 1, chatBg: 0.5, chatWidth: 1, nameTags: true,
    skin: { hair: 0, tone: 0, shirt: 0, pants: 0, hat: true, jacket: true },
  };
  const HAIR = [['Brown', 0], ['Black', 1], ['Blonde', 2], ['Ginger', 3], ['Grey', 4], ['Purple', 5]];
  const TONES = ['Medium', 'Light', 'Tan', 'Dark', 'Warm'];
  const SHIRTS = [['Teal', [30, 154, 150]], ['Red', [178, 48, 48]], ['Blue', [58, 94, 186]], ['Green', [70, 140, 60]], ['Yellow', [214, 160, 40]],
    ['Purple', [130, 70, 160]], ['Black', [60, 60, 66]], ['White', [220, 220, 220]], ['Orange', [200, 96, 40]], ['Sky', [36, 120, 160]]];
  const PANTS = [['Blue', [53, 63, 154]], ['Black', [48, 48, 52]], ['Brown', [90, 66, 46]], ['Grey', [70, 80, 90]], ['Green', [36, 70, 50]], ['Khaki', [120, 108, 80]]];
  const SHADER_NAMES = { OFF: 'Off (Fast)', LOW: 'Halcyon Low', MEDIUM: 'Halcyon Medium', HIGH: 'Halcyon High', ULTRA: 'Halcyon Ultra' };
  const pct = (v) => Math.round(v * 100) + '%';
  const onOff = (v) => (v ? 'ON' : 'OFF');
  let game = null, ui = null;
  const S = () => game.settings;

  // ---------------------------------------------------------------- skin
  function skinPalette(sk) {
    sk = sk || {};
    if (!sk.hair && !sk.tone && !sk.shirt && !sk.pants) return {};
    return Object.assign(
      outfitPalette((SHIRTS[sk.shirt] || SHIRTS[0])[1], (PANTS[sk.pants] || PANTS[0])[1]),
      SKIN_TONES[sk.tone] || SKIN_TONES[0], HAIR_COLORS[sk.hair] || HAIR_COLORS[0],
    );
  }
  function setLayers(model, sk) {
    if (!model) return;
    model.root.traverse((o) => {
      if (o.userData.layer === 'hat') o.visible = sk.hat !== false;
      if (o.userData.layer === 'jacket') o.visible = sk.jacket !== false;
    });
  }
  function applySkin() {
    const sk = S().skin;
    LOCAL_SKIN_PALETTE = skinPalette(sk);
    const old = SKINS.player;
    delete SKINS.player;
    const tex = skinTexture('player').tex;
    for (const m of [game.localModel, typeof Preview !== 'undefined' ? Preview.model : null]) {
      if (!m) continue;
      m.mat.map = tex; m.mat.needsUpdate = true;
      setLayers(m, sk);
    }
    game.handId = -12345; // rebuild the first-person arm
    if (old && old.tex !== tex) old.tex.dispose();
  }

  // ---------------------------------------------------------------- apply everything
  function applyAll() {
    const s = S();
    Sound.volume = s.volume;
    Sound.setMusicVolume(s.music);
    const root = document.documentElement.style;
    root.setProperty('--gui-zoom', s.guiScale);
    root.setProperty('--chat-size', (20 * s.chatScale).toFixed(1) + 'px');
    root.setProperty('--chat-opacity', s.chatOpacity);
    root.setProperty('--chat-bg', `rgba(0, 0, 0, ${(s.chatBg * 0.9).toFixed(2)})`);
    root.setProperty('--chat-width', Math.round(560 * s.chatWidth) + 'px');
    document.body.classList.toggle('chat-hidden', !s.chatVisible);
    document.body.classList.toggle('menu-blur', !!s.menuBlur);
    if (s.nameTags !== false && game.remotePlayers) for (const rp of game.remotePlayers.values()) if (rp.tag) rp.tag.visible = true;
    rebuildKeyMap();
  }

  // ---------------------------------------------------------------- key binds: input translation
  const ACTION = Object.fromEntries(KEY_ACTIONS.map((a) => [a.id, a]));
  const DEFAULT_CODES = new Set(KEY_ACTIONS.map((a) => a.def));
  let physToAction = new Map();
  const boundCode = (a) => (S().keys && a.id in S().keys ? S().keys[a.id] : a.def);
  function rebuildKeyMap() {
    physToAction = new Map();
    for (const a of KEY_ACTIONS) { const c = boundCode(a); if (c && !physToAction.has(c)) physToAction.set(c, a.id); }
  }
  function conflicts(a) {
    const c = boundCode(a);
    return !!c && KEY_ACTIONS.some((b) => b !== a && boundCode(b) === c);
  }
  // The game-side code for a physical key: the default key of the action it's bound to,
  // null if the key's own action was moved elsewhere, else the key itself
  function logical(phys) {
    const a = physToAction.get(phys);
    if (a) return ACTION[a].def;
    if (DEFAULT_CODES.has(phys)) return null;
    return phys;
  }
  const canvas = () => game.renderer.domElement;
  function sendKey(type, code, orig, target) {
    const ev = new KeyboardEvent(type, { code, key: orig ? orig.key : code, bubbles: true, cancelable: true, repeat: orig ? orig.repeat : false,
      ctrlKey: orig ? orig.ctrlKey : false, shiftKey: orig ? orig.shiftKey : false, altKey: orig ? orig.altKey : false, metaKey: orig ? orig.metaKey : false });
    ev._wc = true;
    const ok = (target || document.body).dispatchEvent(ev);
    if (!ok && orig) orig.preventDefault();
  }
  function sendMouse(type, button, orig) {
    const ev = new MouseEvent(type, { button, bubbles: true, cancelable: true, clientX: orig ? orig.clientX : innerWidth / 2, clientY: orig ? orig.clientY : innerHeight / 2 });
    ev._wc = true;
    const ok = canvas().dispatchEvent(ev);
    if (!ok && orig) orig.preventDefault();
  }
  // Deliver a logical press: keys go to the keyboard handlers, Mouse* to the mouse handlers
  let sneakOn = false, sprintOn = false;
  function deliver(down, code, orig, target) {
    if (code.startsWith('Mouse')) {
      if (orig && orig.repeat) { orig.preventDefault(); return; }
      sendMouse(down ? 'mousedown' : 'mouseup', +code.slice(5), orig && orig.type.startsWith('mouse') ? orig : null);
      if (orig && orig.type.startsWith('key')) orig.preventDefault();
      return;
    }
    if (code === 'ShiftLeft' && S().sneakToggle) {
      if (!down || (orig && orig.repeat)) return;
      sneakOn = !sneakOn;
      sendKey(sneakOn ? 'keydown' : 'keyup', code, orig, target);
      return;
    }
    if (code === 'ControlLeft' && S().sprintToggle) {
      if (!down || (orig && orig.repeat)) return;
      sprintOn = !sprintOn;
      if (sprintOn) sendKey('keydown', code, orig, target); else if (game.player) game.player.sprinting = false;
      return;
    }
    sendKey(down ? 'keydown' : 'keyup', code, orig, target);
  }
  const typing = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
  let listening = null; // the action waiting for a new key in the Key Binds screen

  function onKey(e) {
    if (e._wc) return;
    if (listening) {
      if (e.type === 'keydown') {
        e.preventDefault(); e.stopImmediatePropagation();
        bind(listening, e.code === 'Escape' ? null : e.code);
      }
      return;
    }
    if (typing(e) || e.code === 'Escape') return;
    const code = logical(e.code);
    const toggled = (code === 'ShiftLeft' && S().sneakToggle) || (code === 'ControlLeft' && S().sprintToggle);
    if (code === e.code && !toggled) return; // nothing to translate
    e.stopImmediatePropagation();
    if (code === null) return;
    deliver(e.type === 'keydown', code, e, e.target);
  }
  function onMouse(e) {
    if (e._wc) return;
    if (listening) {
      if (e.type === 'mousedown') { e.preventDefault(); e.stopImmediatePropagation(); bind(listening, 'Mouse' + e.button); }
      return;
    }
    if (e.type === 'mousedown' && e.target !== canvas()) return;
    const phys = 'Mouse' + e.button, code = logical(phys);
    if (code === phys) return;
    // an unbound button still captures the mouse when clicking into the game
    if (e.type === 'mousedown' && !document.pointerLockElement && !ui.dragLook && game.mode === 'play' && ui.screen === 'none') return;
    e.stopImmediatePropagation();
    if (code === null) return;
    deliver(e.type === 'mousedown', code, e, document.body);
  }
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);
  window.addEventListener('mousedown', onMouse, true);
  window.addEventListener('mouseup', onMouse, true);
  window.addEventListener('blur', () => { sneakOn = false; sprintOn = false; });
  // Invert mouse / invert hotbar scrolling
  document.addEventListener('mousemove', (e) => {
    if (e._wc || !game || !S().invertMouse || !e.movementY) return;
    e.stopImmediatePropagation();
    const ev = new MouseEvent('mousemove', { clientX: e.clientX, clientY: e.clientY, movementX: e.movementX, movementY: -e.movementY, bubbles: true });
    ev._wc = true;
    e.target.dispatchEvent(ev);
  }, true);
  window.addEventListener('wheel', (e) => {
    if (e._wc || !game || !S().invertScroll) return;
    e.stopImmediatePropagation();
    const ev = new WheelEvent('wheel', { deltaY: -e.deltaY, deltaX: e.deltaX, bubbles: true });
    ev._wc = true;
    window.dispatchEvent(ev);
  }, true);
  // New actions: screenshot and fullscreen; Escape steps back through option pages
  window.addEventListener('keydown', (e) => {
    if (!game || typing(e)) return;
    if (e.code === 'F2' && game.mode === 'play') { e.preventDefault(); game.wantScreenshot = true; }
    if (e.code === 'F11') { e.preventDefault(); toggleFullscreen(); }
    if (e.code === 'Escape' && ui.screen === 'options' && !listening) { e.preventDefault(); back(); }
  });
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  // ---------------------------------------------------------------- pages
  const toggle = (key, label, tip, apply) => ({ type: 'cycle', key, label, values: [true, false], fmt: onOff, tip, apply });
  const vol = (key, label) => ({ type: 'slider', key, label, min: 0, max: 1, step: 0.01, fmt: (v) => (v === 0 ? 'OFF' : pct(v)) });
  const PAGES = {
    main: { title: 'Options', items: () => [
      { type: 'slider', key: 'fov', label: 'FOV', min: 30, max: 110, step: 1, fmt: (v) => (v === 70 ? 'Normal' : v === 110 ? 'Quake Pro' : v) },
      { type: 'link', label: 'Online...', page: 'online' },
      difficultyItem(),
      { type: 'link', label: 'Skin Customization...', page: 'skin' },
      { type: 'link', label: 'Music & Sounds...', page: 'sounds' },
      { type: 'link', label: 'Video Settings...', page: 'video' },
      { type: 'link', label: 'Controls...', page: 'controls' },
      { type: 'link', label: 'Chat Settings...', page: 'chat' },
      { type: 'link', label: 'Accessibility Settings...', page: 'access' },
    ] },
    online: { title: 'Online Options', items: () => [
      { type: 'text', key: 'name', label: 'Username', full: true, tip: 'The name other players see. Letters, numbers and underscores, up to 16.' },
      toggle('nameTags', 'Name Tags', 'Show the names above other players and bots.'),
    ] },
    skin: { title: 'Skin Customization', custom: renderSkinPage },
    sounds: { title: 'Music & Sound Options', items: () => [
      Object.assign(vol('volume', 'Master Volume'), { full: true }),
      vol('music', 'Music'), vol('vol_weather', 'Weather'),
      vol('vol_blocks', 'Blocks'), vol('vol_hostile', 'Hostile Creatures'),
      vol('vol_friendly', 'Friendly Creatures'), vol('vol_players', 'Players'),
      Object.assign(toggle('subtitles', 'Show Subtitles', 'Shows what you hear, and from which side, in the corner of the screen.'), { full: true }),
    ] },
    video: { title: 'Video Settings', items: () => [
      { type: 'cycle', key: 'shaders', label: 'Shaders', values: ['OFF', 'LOW', 'MEDIUM', 'HIGH', 'ULTRA'], fmt: (v) => SHADER_NAMES[v],
        tip: 'Your Halcyon shader pack: soft shadows, volumetric clouds, reflective water, god rays and bloom. Lower it if the game feels slow.',
        apply: (v) => { S().shadersAuto = false; game.setShaders(v); } },
      { type: 'slider', key: 'renderDistance', label: 'Render Distance', min: 2, max: 12, step: 1, fmt: (v) => v + ' chunks' },
      { type: 'slider', key: 'maxFps', label: 'Max Framerate', min: 30, max: 260, step: 10, fmt: (v) => (v >= 260 ? 'Unlimited' : v + ' fps') },
      { type: 'slider', key: 'brightness', label: 'Brightness', min: 0, max: 1, step: 0.01, fmt: (v) => (v === 0 ? 'Moody' : v === 1 ? 'Bright' : pct(v)), tip: 'Lifts the darkness in caves and at night.' },
      toggle('viewBobbing', 'View Bobbing'),
      { type: 'cycle', key: 'guiScale', label: 'GUI Scale', values: [1, 1.25, 1.5, 0.75], fmt: (v) => ({ 0.75: 'Small', 1: 'Normal', 1.25: 'Large', 1.5: 'Huge' })[v] },
      toggle('clouds', 'Clouds'),
      { type: 'cycle', key: 'particles', label: 'Particles', values: [2, 1, 0], fmt: (v) => ['Minimal', 'Decreased', 'All'][v] },
      toggle('entityShadows', 'Entity Shadows'),
      { type: 'action', label: () => 'Fullscreen: ' + onOff(!!document.fullscreenElement), run: toggleFullscreen },
    ] },
    controls: { title: 'Controls', items: () => [
      { type: 'link', label: 'Mouse Settings...', page: 'mouse' },
      { type: 'link', label: 'Key Binds...', page: 'keys' },
      { type: 'cycle', key: 'sneakToggle', label: 'Sneak', values: [false, true], fmt: (v) => (v ? 'Toggle' : 'Hold') },
      { type: 'cycle', key: 'sprintToggle', label: 'Sprint', values: [false, true], fmt: (v) => (v ? 'Toggle' : 'Hold') },
      toggle('autoJump', 'Auto-Jump', 'Jump up single blocks automatically while walking into them.'),
    ] },
    mouse: { title: 'Mouse Settings', items: () => [
      { type: 'slider', key: 'sensitivity', label: 'Sensitivity', min: 0.2, max: 3, step: 0.05, fmt: (v) => (v <= 0.2 ? '*yawn*' : v >= 3 ? 'HYPERSPEED!!!' : pct(v)) },
      toggle('invertMouse', 'Invert Mouse'),
      toggle('invertScroll', 'Invert Hotbar Scroll'),
    ] },
    keys: { title: 'Key Binds', custom: renderKeysPage },
    chat: { title: 'Chat Settings', items: () => [
      { type: 'cycle', key: 'chatVisible', label: 'Chat', values: [true, false], fmt: (v) => (v ? 'Shown' : 'Hidden') },
      { type: 'slider', key: 'chatScale', label: 'Text Size', min: 0.6, max: 1.6, step: 0.05, fmt: pct },
      { type: 'slider', key: 'chatOpacity', label: 'Chat Text Opacity', min: 0.1, max: 1, step: 0.01, fmt: pct },
      { type: 'slider', key: 'chatBg', label: 'Text Background Opacity', min: 0, max: 1, step: 0.01, fmt: pct },
      { type: 'slider', key: 'chatWidth', label: 'Width', min: 0.4, max: 1.4, step: 0.05, fmt: (v) => Math.round(560 * v) + 'px' },
    ] },
    access: { title: 'Accessibility Settings', items: () => [
      toggle('subtitles', 'Show Subtitles', 'Shows what you hear, and from which side, in the corner of the screen.'),
      toggle('autoJump', 'Auto-Jump', 'Jump up single blocks automatically while walking into them.'),
      toggle('viewBobbing', 'View Bobbing', 'The camera and your hand sway as you walk.'),
      toggle('hideLightning', 'Hide Lightning Flashes', 'Lightning still strikes, but the sky doesn\'t flash.'),
      { type: 'slider', key: 'distortion', label: 'Screen Effects', min: 0, max: 1, step: 0.01, fmt: pct, tip: 'How much explosions shake the camera and hard landings jolt it.' },
      { type: 'slider', key: 'fovEffects', label: 'FOV Effects', min: 0, max: 1, step: 0.01, fmt: pct, tip: 'How much the field of view widens when you sprint or fly fast.' },
      { type: 'slider', key: 'damageTilt', label: 'Damage Tilt', min: 0, max: 1, step: 0.01, fmt: pct, tip: 'How much the camera rolls when you take damage.' },
      toggle('menuBlur', 'Menu Background Blur', 'Blurs the game behind menus.'),
      { type: 'cycle', key: 'sneakToggle', label: 'Sneak', values: [false, true], fmt: (v) => (v ? 'Toggle' : 'Hold') },
      { type: 'cycle', key: 'sprintToggle', label: 'Sprint', values: [false, true], fmt: (v) => (v ? 'Toggle' : 'Hold') },
    ] },
  };
  function difficultyItem() {
    const g = game;
    const live = g.mode === 'play';
    const can = live && g.isAuthority && !g.hardcore && !g.nw && !g.remote;
    return {
      type: 'action', full: true,
      label: () => 'Difficulty: ' + (live ? (g.hardcore ? 'Hardcore' : ['Peaceful', 'Easy', 'Normal', 'Hard'][g.difficulty]) : 'set per world'),
      disabled: !can,
      tip: can ? 'Peaceful has no hostile mobs and heals you; Hard hits harder and lets zombies break doors.' : live ? 'Only the host can change the difficulty here.' : 'Choose a difficulty when you create a world, or change it here while playing.',
      run: () => { g.difficulty = (g.difficulty + 1) % 4; if (g.chat) g.chat.system('Set difficulty to ' + DIFFICULTIES[g.difficulty]); },
    };
  }

  let stack = ['main'];
  function open(page) { stack.push(page); render(); }
  function back() {
    listening = null;
    if (stack.length > 1) { stack.pop(); render(); return; }
    ui.saveSettings();
    ui.showScreen(ui.optionsBack || 'title');
  }
  function save() { ui.saveSettings(); }

  function setValue(it, v) {
    S()[it.key] = v;
    if (it.apply) it.apply(v);
    applyAll();
    save();
  }
  function itemEl(it) {
    const tip = it.tip || '';
    const hover = (el) => {
      el.addEventListener('mouseenter', () => { $('opt-desc').textContent = tip; });
      el.addEventListener('mouseleave', () => { $('opt-desc').textContent = ''; });
      el.addEventListener('focus', () => { $('opt-desc').textContent = tip; });
    };
    let el;
    if (it.type === 'slider') {
      el = document.createElement('label');
      el.className = 'opt-slider';
      const input = document.createElement('input');
      Object.assign(input, { type: 'range', min: it.min, max: it.max, step: it.step });
      input.value = S()[it.key];
      const span = document.createElement('span');
      const show = () => { span.textContent = `${it.label}: ${it.fmt(+input.value)}`; };
      input.oninput = () => { setValue(it, +input.value); show(); };
      show();
      el.append(input, span);
      hover(input);
    } else if (it.type === 'text') {
      el = document.createElement('div');
      el.className = 'opt-text';
      const lab = document.createElement('span');
      lab.textContent = it.label;
      const input = document.createElement('input');
      Object.assign(input, { type: 'text', maxLength: 16, className: 'field', value: S()[it.key] || '' });
      input.onchange = () => { S()[it.key] = ui.cleanName(input.value); input.value = S()[it.key]; save(); };
      el.append(lab, input);
      hover(input);
    } else {
      el = document.createElement('button');
      el.className = 'btn';
      const label = () => {
        if (it.type === 'cycle') return `${it.label}: ${it.fmt(S()[it.key])}`;
        return typeof it.label === 'function' ? it.label() : it.label;
      };
      el.textContent = label();
      el.disabled = !!it.disabled;
      el.onclick = () => {
        Sound.click();
        if (it.type === 'link') { open(it.page); return; }
        if (it.type === 'action') { it.run(); setTimeout(() => { el.textContent = label(); }, 60); return; }
        const vals = it.values, i = vals.indexOf(S()[it.key]);
        setValue(it, vals[(i + 1) % vals.length]);
        el.textContent = label();
      };
      hover(el);
    }
    if (it.full) el.classList.add('full');
    return el;
  }
  function render() {
    const page = PAGES[stack[stack.length - 1]];
    $('opt-title').textContent = page.title;
    $('opt-desc').textContent = '';
    const body = $('opt-body');
    body.innerHTML = '';
    body.className = 'opt-body';
    const footer = $('opt-footer');
    for (const b of [...footer.querySelectorAll('.extra')]) b.remove();
    if (page.custom) page.custom(body, footer);
    else {
      const grid = document.createElement('div');
      grid.className = 'opt-grid';
      for (const it of page.items()) grid.appendChild(itemEl(it));
      body.appendChild(grid);
    }
  }

  // Skin Customization: a live 3D model beside the outfit choices
  function renderSkinPage(body) {
    const sk = S().skin;
    const wrap = document.createElement('div');
    wrap.className = 'opt-skin';
    const box = document.createElement('div');
    box.className = 'player-preview opt-skin-preview';
    if (typeof Preview !== 'undefined') { box.appendChild(Preview.element(game)); setLayers(Preview.model, sk); }
    const grid = document.createElement('div');
    grid.className = 'opt-grid';
    const choice = (label, key, names) => ({ type: 'action', label: () => `${label}: ${names[sk[key] || 0]}`, run: () => { sk[key] = ((sk[key] || 0) + 1) % names.length; applySkin(); save(); } });
    const layer = (label, key) => ({ type: 'action', label: () => `${label}: ${onOff(sk[key] !== false)}`, run: () => { sk[key] = sk[key] === false; applySkin(); save(); } });
    for (const it of [
      layer('Hat', 'hat'), layer('Jacket', 'jacket'),
      choice('Hair', 'hair', HAIR.map((h) => h[0])), choice('Skin', 'tone', TONES),
      choice('Shirt', 'shirt', SHIRTS.map((s) => s[0])), choice('Trousers', 'pants', PANTS.map((p) => p[0])),
      { type: 'action', full: true, label: 'Reset to Default', run: () => { Object.assign(sk, DEFAULTS.skin); applySkin(); save(); render(); } },
    ]) grid.appendChild(itemEl(it));
    wrap.append(box, grid);
    body.appendChild(wrap);
    const p = document.createElement('p');
    p.className = 'desc center';
    p.textContent = 'Other players see your outfit in multiplayer.';
    body.appendChild(p);
  }

  // Key Binds: a scrolling list by category, click a key then press the new one
  function bind(id, code) {
    S().keys = S().keys || {};
    if (code === ACTION[id].def) delete S().keys[id]; else S().keys[id] = code;
    listening = null;
    applyAll(); save(); render();
  }
  function renderKeysPage(body, footer) {
    const list = document.createElement('div');
    list.className = 'opt-keys';
    let cat = '';
    for (const a of KEY_ACTIONS) {
      if (a.cat !== cat) {
        cat = a.cat;
        const h = document.createElement('div');
        h.className = 'opt-key-cat';
        h.textContent = cat;
        list.appendChild(h);
      }
      const row = document.createElement('div');
      row.className = 'opt-key-row';
      const name = document.createElement('span');
      name.textContent = a.name;
      const key = document.createElement('button');
      key.className = 'btn opt-key';
      const code = boundCode(a);
      if (listening === a.id) { key.textContent = '> ' + keyName(code) + ' <'; key.classList.add('listening'); }
      else key.textContent = keyName(code);
      if (conflicts(a)) key.classList.add('conflict');
      key.onclick = () => { Sound.click(); listening = a.id; render(); };
      const reset = document.createElement('button');
      reset.className = 'btn opt-key-reset';
      reset.textContent = 'Reset';
      reset.disabled = code === a.def;
      reset.onclick = () => { Sound.click(); bind(a.id, a.def); };
      row.append(name, key, reset);
      list.appendChild(row);
    }
    body.appendChild(list);
    $('opt-desc').textContent = listening ? 'Press a key or mouse button. Escape unbinds it.' : 'Click a key to change it. Red keys are bound to more than one action.';
    const all = document.createElement('button');
    all.className = 'btn extra';
    all.textContent = 'Reset Keys';
    all.onclick = () => { Sound.click(); S().keys = {}; listening = null; applyAll(); save(); render(); };
    footer.prepend(all);
    const keep = list.dataset.scroll;
    if (keep) list.scrollTop = +keep;
  }

  // ---------------------------------------------------------------- hook into the UI and game
  UI.prototype.renderOptions = function () { render(); };
  const loadSettings = UI.prototype.loadSettings;
  UI.prototype.loadSettings = function () {
    loadSettings.call(this);
    game = this.game; ui = this;
    const s = game.settings;
    for (const k in DEFAULTS) if (s[k] === undefined) s[k] = JSON.parse(JSON.stringify(DEFAULTS[k]));
    s.skin = Object.assign({}, DEFAULTS.skin, s.skin);
    LOCAL_SKIN_PALETTE = skinPalette(s.skin);
    applyAll();
  };
  const showScreen = UI.prototype.showScreen;
  UI.prototype.showScreen = function (name) {
    if (name === 'options' && this.screen !== 'options') stack = ['main'];
    if (name !== 'options') listening = null;
    showScreen.call(this, name);
    if (name === 'options') $('btn-opt-done').onclick = () => { Sound.click(); back(); };
  };

  const P = Game.prototype;
  // Toggle sprint keeps you sprinting while you move forwards; auto-jump; brightness and clouds for Halcyon
  const update = P.update;
  P.update = function (dt, input) {
    const p = this.player, s = this.settings;
    if (p && this.mode === 'play') {
      if (s.sprintToggle && sprintOn && p.keys.has('KeyW') && !p.sneaking) p.sprinting = true;
      if (s.autoJump) autoJump(p);
    }
    update.call(this, dt, input);
    if (this.halcyon && this.halcyon.u) {
      const u = this.halcyon.u;
      if (u.gammaBoost) u.gammaBoost.value = Math.max(0, ((s.brightness ?? 0.5) - 0.5) * 0.3);
      if (u.cloudsOn) u.cloudsOn.value = s.clouds === false ? 0 : 1;
    }
    const skKey = JSON.stringify(s.skin);
    for (const m of [this.localModel, typeof Preview !== 'undefined' ? Preview.model : null]) {
      if (m && m.skinLayersKey !== skKey) { m.skinLayersKey = skKey; setLayers(m, s.skin); }
    }
    updateSubtitles(dt);
  };
  function autoJump(p) {
    if (!p.onGround || p.flying || p.sneaking || p.inWater || p.inLava || p.mode === 'spectator') return;
    const k = p.keys;
    let fx = 0, fz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) fz -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fz += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) fx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) fx += 1;
    if (!fx && !fz) return;
    const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw), len = Math.hypot(fx, fz);
    const wx = (fx * cos + fz * sin) / len, wz = (-fx * sin + fz * cos) / len;
    const w = p.world, x = p.pos.x + wx * 0.65, z = p.pos.z + wz * 0.65, y = Math.floor(p.pos.y + 0.01);
    const ahead = w.getBlock(Math.floor(x), y, Math.floor(z)), def = BLOCKS[ahead];
    if (!isSolid(ahead) || (def && (def.model === 'fence' || def.model === 'pane' || def.model === 'wall'))) return;
    for (const dy of [1, 2]) if (isSolid(w.getBlock(Math.floor(x), y + dy, Math.floor(z)))) return;
    if (isSolid(w.getBlock(Math.floor(p.pos.x), y + 2, Math.floor(p.pos.z)))) return;
    p.vel.y = 9.0;
    p.onGround = false;
  }
  // Brighter entities with the brightness slider
  const lightAt = P.lightAt;
  P.lightAt = function (x, y, z) {
    const l = lightAt.call(this, x, y, z);
    const b = Math.max(0, ((this.settings.brightness ?? 0.5) - 0.5) * 0.5);
    return b > 0 ? l + (1 - Math.min(1, l)) * b : l;
  };
  // F2: a screenshot of the frame just drawn
  const render0 = P.render;
  P.render = function (dt) {
    render0.call(this, dt);
    if (!this.wantScreenshot) return;
    this.wantScreenshot = false;
    const d = new Date(), two = (n) => String(n).padStart(2, '0');
    const name = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}_${two(d.getHours())}.${two(d.getMinutes())}.${two(d.getSeconds())}.png`;
    this.renderer.domElement.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      if (this.chat) this.chat.system('Saved screenshot as ' + name, '#aaa');
    });
  };
  // Your outfit travels with your presence; other players' models wear theirs
  const presenceExtra = P.presenceExtra;
  P.presenceExtra = function (pres) {
    if (presenceExtra) presenceExtra.call(this, pres);
    const sk = this.settings.skin;
    pres.sk = [sk.hair | 0, sk.tone | 0, sk.shirt | 0, sk.pants | 0, sk.hat === false ? 0 : 1, sk.jacket === false ? 0 : 1];
  };
  const applyState = RemotePlayer.prototype.applyState;
  RemotePlayer.prototype.applyState = function (s) {
    applyState.call(this, s);
    if (!s || !Array.isArray(s.sk)) return;
    const v = s.sk.slice(0, 6).map((n) => Math.max(0, Math.min(9, n | 0)));
    const key = v.join(',');
    if (key === this.skinKey) return;
    this.skinKey = key;
    const sk = { hair: v[0] % HAIR.length, tone: v[1] % TONES.length, shirt: v[2] % SHIRTS.length, pants: v[3] % PANTS.length, hat: v[4] !== 0, jacket: v[5] !== 0 };
    const pal = skinPalette(sk);
    const tex = Object.keys(pal).length ? playerSkinTexture('skin:' + key, pal, 1).tex : skinTexture('player').tex;
    this.model.mat.map = tex; this.model.mat.needsUpdate = true;
    setLayers(this.model, sk);
  };
  // Name tags on or off
  const rpUpdate = RemotePlayer.prototype.update;
  RemotePlayer.prototype.update = function (dt) {
    rpUpdate.call(this, dt);
    if (this.tag && game && S().nameTags === false) this.tag.visible = false;
  };
  const mobRender = Mob.prototype.render;
  Mob.prototype.render = function () {
    mobRender.call(this);
    if (this.tag && S().nameTags === false) this.tag.visible = false;
  };
  // Particles: All / Decreased / Minimal
  for (const [name, argIndex, def] of [['burst', 4, 14], ['smoke', 3, 30]]) {
    const orig = Particles.prototype[name];
    Particles.prototype[name] = function (...a) {
      const lvl = game ? S().particles : 2;
      if (lvl < 2) a[argIndex] = Math.max(1, Math.round((a[argIndex] ?? def) * (lvl === 1 ? 0.45 : 0.12)));
      return orig.apply(this, a);
    };
  }
  if (Particles.prototype.crit) {
    const crit = Particles.prototype.crit;
    Particles.prototype.crit = function (...a) { if (!game || S().particles > 0) return crit.apply(this, a); };
  }
  // Entity shadows on or off
  // eslint-disable-next-line no-func-assign
  blobShadow = ((orig) => function (g, owner, pos, radius) {
    if (g.settings.entityShadows === false) { if (owner.shadow) owner.shadow.visible = false; return; }
    return orig(g, owner, pos, radius);
  })(blobShadow);

  // ---------------------------------------------------------------- sound categories and subtitles
  const CAT = {
    block: 'blocks', dig: 'blocks', place: 'blocks', glassBreak: 'blocks', door: 'blocks', chest: 'blocks', explode: 'blocks', fuse: 'blocks',
    step: 'players', hurt: 'players', pop: 'players', xp: 'players', levelUp: 'players', eat: 'players', burp: 'players', bow: 'players', splash: 'players',
    thunder: 'weather',
  };
  const MOB_NAMES = { pig: 'Pig', cow: 'Cow', sheep: 'Sheep', chicken: 'Chicken', zombie: 'Zombie', creeper: 'Creeper', skeleton: 'Skeleton', spider: 'Spider', villager: 'Villager', piglin: 'Piglin', ghast: 'Ghast', enderman: 'Enderman', wolf: 'Wolf', slime: 'Slime', blaze: 'Blaze', golem: 'Iron Golem', dragon: 'Ender Dragon', bot: 'Player' };
  const MOB_VERBS = { pig: 'oinks', cow: 'moos', sheep: 'baas', chicken: 'clucks', zombie: 'groans', skeleton: 'rattles', spider: 'hisses', villager: 'mumbles', piglin: 'snorts', ghast: 'cries', enderman: 'vwoops', wolf: 'pants', slime: 'squishes', blaze: 'breathes', golem: 'creaks' };
  const SUBS = {
    block: () => 'Block broken', dig: () => 'Block breaking', place: () => 'Block placed', glassBreak: () => 'Glass breaks',
    door: (open) => (open ? 'Door opens' : 'Door closes'), chest: (open) => (open ? 'Chest opens' : 'Chest closes'),
    explode: () => 'Explosion', fuse: () => 'Fuse hisses', hurt: () => 'Player hurts', eat: () => 'Eating', burp: () => 'Burp',
    xp: () => 'Experience gained', levelUp: () => 'Level up', bow: () => 'Arrow fired', splash: () => 'Splashing', thunder: () => 'Thunder roars',
    pop: () => 'Item picked up',
  };
  const POS_ARG = { block: 2, dig: 1, place: 1, step: 2, glassBreak: 0, door: 1, chest: 1, explode: 0, fuse: 0, splash: 0, bow: 0 };
  const subs = [];
  function subtitle(text, pos) {
    if (!game || !S().subtitles || !text) return;
    let side = 0;
    if (pos) {
      const L = Sound.listener, dx = pos.x - L.x, dz = pos.z - L.z, d = Math.hypot(dx, dz);
      if (d > 32) return;
      const r = (dx * Math.cos(L.yaw) - dz * Math.sin(L.yaw)) / Math.max(1, d);
      side = r < -0.35 ? -1 : r > 0.35 ? 1 : 0;
    }
    const old = subs.find((s) => s.text === text);
    if (old) { old.t = 3; old.side = side; return; }
    subs.push({ text, side, t: 3 });
    if (subs.length > 6) subs.shift();
  }
  function updateSubtitles(dt) {
    const box = $('subtitles');
    if (!box) return;
    for (const s of subs) s.t -= dt;
    while (subs.length && subs[0].t <= 0) subs.shift();
    const show = game && S().subtitles && subs.length;
    box.hidden = !show;
    if (!show) return;
    box.innerHTML = '';
    for (const s of subs) {
      const row = document.createElement('div');
      row.className = 'sub';
      row.style.opacity = Math.min(1, s.t / 1.2).toFixed(2);
      row.innerHTML = `<b>${s.side < 0 ? '&lt;' : '&nbsp;'}</b><span></span><b>${s.side > 0 ? '&gt;' : '&nbsp;'}</b>`;
      row.querySelector('span').textContent = s.text;
      box.appendChild(row);
    }
  }
  for (const name of Object.keys(CAT)) {
    const f = Sound[name];
    if (typeof f !== 'function') continue;
    Sound[name] = function (...a) {
      const prev = this._cat;
      this._cat = CAT[name];
      try { return f.apply(this, a); } finally {
        this._cat = prev;
        if (name === 'step') { if (a[2]) subtitle('Footsteps', a[2]); } else if (SUBS[name]) subtitle(SUBS[name](a[0]), POS_ARG[name] !== undefined ? a[POS_ARG[name]] : null);
      }
    };
  }
  for (const name of ['mob', 'mobHurt']) {
    const f = Sound[name];
    Sound[name] = function (type, pos) {
      const prev = this._cat, info = MOB_INFO[type] || {};
      this._cat = type === 'bot' ? 'players' : info.hostile || info.neutral ? 'hostile' : 'friendly';
      try { return f.call(this, type, pos); } finally {
        this._cat = prev;
        const n = MOB_NAMES[type];
        if (n && (name === 'mobHurt' || MOB_VERBS[type])) subtitle(`${n} ${name === 'mobHurt' ? 'hurts' : MOB_VERBS[type]}`, pos);
      }
    };
  }
  const out = Sound._out;
  Sound._out = function (v, pos, wet) {
    const c = this._cat, k = c && game ? (S()['vol_' + c] ?? 1) : 1;
    return out.call(this, v * k, pos, wet);
  };
  const setRain = Sound.setRain;
  Sound.setRain = function (level) { return setRain.call(this, level * (game ? S().vol_weather ?? 1 : 1)); };
}
