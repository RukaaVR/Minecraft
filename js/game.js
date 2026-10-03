// The game: world + player + entities + rendering + rules.
'use strict';

const DAY_LENGTH = 20 * 60; // seconds in a full day, like Minecraft
const DIFFICULTIES = ['peaceful', 'easy', 'normal', 'hard'];

const CHUNK_VERT = `
attribute vec4 light;
varying vec2 vUv;
varying vec4 vLight;
varying float vDist;
void main() {
  vUv = uv;
  vLight = light;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const CHUNK_FRAG = `
uniform sampler2D map;
uniform float daylight;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
uniform float opacity;
uniform float alphaTest;
uniform float minLight;
varying vec2 vUv;
varying vec4 vLight;
varying float vDist;
float curve(float l) { return max(0.03, pow(0.8, 15.0 - l * 15.0)); }
void main() {
  vec4 t = texture2D(map, vUv);
  if (t.a < alphaTest) discard;
  float face = floor(vLight.w / 16.0 + 0.001);
  float shade = face < 1.5 ? 0.8 : face < 2.5 ? 0.5 : face < 3.5 ? 1.0 : face < 5.5 ? 0.65 : 1.0;
  float sky = curve(vLight.x) * daylight;
  float blk = curve(vLight.y);
  if (vLight.y <= 0.0) blk = 0.0;
  vec3 lc = max(vec3(sky), vec3(blk, blk * 0.92, blk * 0.78));
  lc = max(lc, vec3(minLight));
  vec3 c = t.rgb * lc * vLight.z * shade;
  float f = smoothstep(fogNear, fogFar, vDist);
  gl_FragColor = vec4(mix(c, fogColor, f), t.a * opacity);
}`;

function makeChunkMaterial(atlas, o = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: atlas },
      daylight: { value: 1 },
      fogColor: { value: new THREE.Color(0x87ceeb) },
      fogNear: { value: 50 },
      fogFar: { value: 100 },
      opacity: { value: o.opacity ?? 1 },
      alphaTest: { value: o.alphaTest ?? 0 },
      minLight: { value: 0.02 },
    },
    vertexShader: CHUNK_VERT,
    fragmentShader: CHUNK_FRAG,
    transparent: !!o.transparent,
    depthWrite: !o.transparent,
    side: o.side ?? THREE.FrontSide,
  });
}

function breakInfo(blockId, stack, player) {
  const b = BLOCKS[blockId];
  if (b.hardness < 0) return { time: Infinity, harvest: false };
  const tool = stack && ITEMS[stack.id] ? ITEMS[stack.id].tool : null;
  const right = !!(tool && b.tool && tool.type === b.tool);
  const harvest = b.level < 0 || (right && tool.level >= b.level);
  if (b.hardness === 0) return { time: 0.05, harvest, right };
  let speed = right ? tool.speed : 1;
  if (tool && tool.type === 'sword' && blockId === B.LEAVES) speed = 1.5;
  const eff = enchLevel(stack, 'efficiency');
  if (eff && right) speed += eff * eff + 1;
  let time = b.hardness * (harvest ? 1.5 : 5) / speed;
  if (player.eyeInWater) time *= 5;
  if (!player.onGround && !player.flying && !player.inWater) time *= 5;
  return { time, harvest, right };
}

class Game {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 1000);
    this.camera.rotation.order = 'YXZ';
    this.handScene = new THREE.Scene();
    this.handCamera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 10);

    this.atlasCanvas = buildAtlas();
    const atlas = new THREE.CanvasTexture(this.atlasCanvas);
    atlas.magFilter = THREE.NearestFilter;
    atlas.minFilter = THREE.NearestFilter;
    atlas.generateMipmaps = false;
    this.atlas = atlas;
    this.vanillaMats = {
      solid: makeChunkMaterial(atlas, { alphaTest: 0.5 }),
      water: makeChunkMaterial(atlas, { transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
    };
    this.halcyon = null;
    const game = this;
    // World meshes ask for their material here, so switching renderers is a swap.
    this.materials = {
      get solid() { return game.hdr ? game.halcyon.mats.solid : game.vanillaMats.solid; },
      get water() { return game.hdr ? game.halcyon.mats.water : game.vanillaMats.water; },
    };
    this.camera.layers.enable(2);
    this.entityMat = new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });
    this.crackMat = new THREE.MeshBasicMaterial({ map: atlas, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    this.smokeGeo = new THREE.BoxGeometry(1, 1, 1);
    this.smokeMat = new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.6, depthWrite: false });

    this.settings = { renderDistance: 6, sensitivity: 1, fov: 70, volume: 0.6, name: 'Player' + Math.floor(Math.random() * 900 + 100), shaders: 'MEDIUM' };
    this.world = null;
    this.player = null;
    this.net = new Net(this);
    this.mobs = new Map();
    this.items = [];
    this.projectiles = [];
    this.worlds = [null, null, null];
    this.orbs = [];
    this.boats = [];
    this.endState = { dragonKilled: false, creditsSeen: false };
    this.fluidQueue = new Map();
    this.pendingBlocks = [];
    this.villagePopulated = new Set();
    this.simTime = 0;
    this.dayCount = 0;
    this.bowCharge = 0;
    this.tnts = [];
    this.remotePlayers = new Map();
    this.particles = new Particles(this);
    this.timeOfDay = 0.3;
    this.daylight = 1;
    this.difficulty = 2;
    this.cheats = false;
    this.hardcore = false;
    this.worldName = '';
    this.worldId = null;
    this.mode = 'menu'; // 'menu' | 'play'
    this.remote = false; // joined someone else's world
    this.paused = false;
    this.spawnPending = false;
    this.mining = null;
    this.eating = 0;
    this.swing = 0;
    this.swingCount = 0;
    this.useCooldown = 0;
    this.attackCooldown = 0;
    this.spawnTimer = 0;
    this.stepDist = 0;
    this.saveTimer = 0;
    this.panoramaAngle = 0;
    this.pendingEdits = null;
    this.chat = null; // set by UI
    this.ui = null;

    this._buildSky();
    this._buildOverlays();
    this._setupNet();
    this.redstone = new Redstone(this);
    this.weather = new Weather(this);
  }

  // ---------------------------------------------------------------- setup
  _buildSky() {
    const scene = this.scene;
    this.sun = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0xfff6c0, fog: false }));
    this.moon = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshBasicMaterial({ color: 0xdde4f0, fog: false }));
    scene.add(this.sun, this.moon);
    const starPos = [];
    const r = mulberry32(12345);
    for (let i = 0; i < 900; i++) {
      const u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      starPos.push(s * Math.cos(th) * 400, Math.abs(u) * 400, s * Math.sin(th) * 400);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true });
    this.stars = new THREE.Points(sg, this.starMat);
    scene.add(this.stars);

    const cc = document.createElement('canvas');
    cc.width = cc.height = 64;
    const ctx = cc.getContext('2d');
    const cn = new SimplexNoise(99);
    const img = ctx.createImageData(64, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const ax = x / 64 * Math.PI * 2, ay = y / 64 * Math.PI * 2;
      const v = cn.noise3D(Math.cos(ax) * 1.6, Math.sin(ax) * 1.6 + Math.cos(ay) * 1.6, Math.sin(ay) * 1.6);
      const i = (y * 64 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = v > 0.15 ? 220 : 0;
    }
    ctx.putImageData(img, 0, 0);
    this.cloudTex = new THREE.CanvasTexture(cc);
    this.cloudTex.magFilter = this.cloudTex.minFilter = THREE.NearestFilter;
    this.cloudTex.wrapS = this.cloudTex.wrapT = THREE.RepeatWrapping;
    this.cloudTex.repeat.set(4, 4);
    this.cloudMat = new THREE.MeshBasicMaterial({ map: this.cloudTex, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, opacity: 0.85 });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(1536, 1536), this.cloudMat);
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.renderOrder = 2;
    scene.add(this.clouds);
    this.skyColors = {
      day: new THREE.Color(0x87ceeb), night: new THREE.Color(0x070b1d),
      dusk: new THREE.Color(0xf08a4b), water: new THREE.Color(0x1d3f8f), current: new THREE.Color(),
    };
  }

  _buildOverlays() {
    this.outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5 }),
    );
    this.outline.visible = false;
    this.scene.add(this.outline);
    this.crackMesh = null;
    this.crackStage = -1;
    this.handMesh = null;
    this.handId = -1;
  }

  // ---------------------------------------------------------------- lifecycle
  _resetEntities() {
    for (const m of this.mobs.values()) m.dispose();
    this.mobs.clear();
    for (const it of this.items) it.dispose();
    this.items = [];
    for (const t of this.tnts) { this.scene.remove(t.mesh); t.mesh.geometry.dispose(); }
    this.tnts = [];
    for (const pr of this.projectiles) pr.dispose();
    this.projectiles = [];
    this.villagePopulated.clear();
    for (const rp of this.remotePlayers.values()) rp.dispose();
    this.remotePlayers.clear();
    this.particles.clear();
    if (this.crackMesh) { this.scene.remove(this.crackMesh); this.crackMesh = null; }
  }

  startPanorama() {
    this._resetEntities();
    if (this.world) this.world.dispose();
    this.worldSeed = 1987;
    this.worlds = [null, null, null];
    this.world = this.worldFor(0);
    this.player = new Player(this.world);
    const info = this.world.columnInfo(8, 8);
    this.player.pos.set(8, Math.max(info.height, SEA_LEVEL) + 14, 8);
    this.player.setMode('spectator');
    this.mode = 'menu';
    this.timeOfDay = 0.32;
  }

  // opts: {id, name, seed, mode, difficulty, cheats, hardcore, saved}
  startWorld(opts) {
    this._resetEntities();
    if (this.world) this.world.dispose();
    const saved = opts.saved || null;
    this.worldId = opts.id;
    this.worldName = opts.name;
    this.remote = false;
    this.difficulty = saved ? saved.difficulty ?? 2 : opts.difficulty ?? 2;
    this.cheats = saved ? !!saved.cheats : !!opts.cheats;
    this.hardcore = saved ? !!saved.hardcore : !!opts.hardcore;
    this.defaultMode = saved ? saved.mode || 'survival' : opts.mode || 'survival';
    const seed = saved ? saved.seed : opts.seed;
    this.worldSeed = seed;
    this.worlds = [null, null, null];
    this.world = this.worldFor(0);
    this.player = new Player(this.world);
    this._wirePlayer();
    this.dayCount = saved ? saved.dayCount || 0 : 0;
    if (saved) {
      this.world.loadEdits(saved.edits);
      this.world.loadData(saved.data);
      if (saved.netherEdits || saved.netherData) {
        const n = this.worldFor(1);
        n.loadEdits(saved.netherEdits);
        n.loadData(saved.netherData);
      }
      if (saved.endEdits || saved.endData) {
        const e = this.worldFor(2);
        e.loadEdits(saved.endEdits);
        e.loadData(saved.endData);
      }
      this.endState = Object.assign({ dragonKilled: false, creditsSeen: false }, saved.endState || {});
      if (saved.weather) this.weather.set(saved.weather);
      if (saved.dim === 1 || saved.dim === 2) { this.world = this.worldFor(saved.dim); this.player.world = this.world; }
      this.player.load(saved.player);
      this.timeOfDay = saved.time ?? 0.3;
      this.worldSpawn = saved.spawn || this.findSpawn();
      this.spawnPending = false;
    } else {
      this.worldSpawn = this.findSpawn();
      this.player.pos.set(this.worldSpawn.x, this.worldSpawn.y, this.worldSpawn.z);
      this.player.setMode(this.defaultMode);
      this.timeOfDay = 0.3;
      this.spawnPending = true;
      this.endState = { dragonKilled: false, creditsSeen: false };
      this.weather.set('clear');
    }
    this.player.hardcore = this.hardcore;
    this.mode = 'play';
    this.save();
  }

  // Joined someone else's world (multiplayer client)
  startRemoteWorld(w) {
    this._resetEntities();
    if (this.world) this.world.dispose();
    this.remote = true;
    this.worldId = null;
    this.worldName = String(w.name || 'Multiplayer').slice(0, 40);
    this.difficulty = Math.max(0, Math.min(3, w.difficulty | 0));
    this.cheats = false;
    this.hardcore = false;
    this.worldSeed = w.seed | 0;
    this.worlds = [null, null, null];
    this.world = this.worldFor(0);
    this.player = new Player(this.world);
    this._wirePlayer();
    const sp = w.spawn && Number.isFinite(w.spawn.x) ? w.spawn : this.findSpawn();
    this.worldSpawn = sp;
    this.player.pos.set(sp.x, sp.y, sp.z);
    this.player.setMode(GAME_MODES.includes(w.mode) ? w.mode : 'survival');
    this.timeOfDay = +w.time || 0.3;
    this.spawnPending = true;
    this.mode = 'play';
    this.pendingEdits = { got: 0, total: null, started: performance.now() };
  }

  _wirePlayer() {
    this.player.onDamage = (amount, cause) => {
      Sound.hurt();
      if (this.player.health <= 0) this.onDeath(cause);
    };
    this.player.inventory.onChange = () => { if (this.ui) this.ui.inventoryChanged(); };
  }

  async stop() {
    if (this.mode === 'play' && !this.remote) this.save();
    await this.net.close();
    this._resetEntities();
    this.mode = 'menu';
  }

  findSpawn() {
    for (let r = 0; r < 600; r += 8) {
      for (let a = 0; a < 8; a++) {
        const x = Math.round(Math.cos(a / 8 * Math.PI * 2) * r);
        const z = Math.round(Math.sin(a / 8 * Math.PI * 2) * r);
        const info = this.world.columnInfo(x, z);
        if (info.height > SEA_LEVEL + 1 && info.height < 70) return { x: x + 0.5, z: z + 0.5, y: info.height + 2 };
      }
    }
    return { x: 0.5, z: 0.5, y: 90 };
  }

  // ---------------------------------------------------------------- saving
  save() {
    if (!this.world || this.remote || !this.worldId || this.mode !== 'play') return;
    const data = {
      seed: this.world.seed,
      mode: this.defaultMode,
      difficulty: this.difficulty,
      cheats: this.cheats,
      hardcore: this.hardcore,
      edits: this.worldFor(0).serializeEdits(),
      data: this.worldFor(0).serializeData(),
      netherEdits: this.worlds[1] ? this.worlds[1].serializeEdits() : undefined,
      netherData: this.worlds[1] ? this.worlds[1].serializeData() : undefined,
      endEdits: this.worlds[2] ? this.worlds[2].serializeEdits() : undefined,
      endData: this.worlds[2] ? this.worlds[2].serializeData() : undefined,
      endState: this.endState,
      weather: this.weather.thundering ? 'thunder' : this.weather.raining ? 'rain' : 'clear',
      dim: this.world.dim,
      dayCount: this.dayCount,
      player: this.player.serialize(),
      time: this.timeOfDay,
      spawn: this.worldSpawn,
    };
    WorldStore.save(this.worldId, this.worldName, data, this.player.mode);
  }

  // ---------------------------------------------------------------- helpers
  lightAt(x, y, z) {
    if (!this.world) return 1;
    const l = this.world.getLight(Math.floor(x), Math.floor(y), Math.floor(z));
    if (this.hdr) return this.halcyon.entityLight(l.sky, l.block);
    const amb = this.world.dim === 1 ? 0.4 : 0.06;
    return Math.max(LIGHT_CURVE[l.sky] * this.daylight, LIGHT_CURVE[l.block], amb);
  }

  // Turn the Halcyon shaders on/off or change preset ('OFF', 'LOW', 'MEDIUM', 'HIGH', 'ULTRA').
  setShaders(preset) {
    this.settings.shaders = preset;
    if (preset !== 'OFF') {
      if (!this.halcyon) this.halcyon = new HalcyonRenderer(this.renderer, this, preset);
      else if (this.halcyon.presetName !== preset) this.halcyon.setPreset(preset);
    }
    const on = preset !== 'OFF' && this.halcyon && this.halcyon.supported;
    this.hdr = !!on;
    if (this.world) for (const ch of this.world.chunks.values()) {
      if (ch.solidMesh) ch.solidMesh.material = this.materials.solid;
      if (ch.waterMesh) ch.waterMesh.material = this.materials.water;
    }
    for (const o of [this.sun, this.moon, this.stars, this.clouds]) o.visible = !this.hdr;
    this._hdrDefines(this.scene);
    this._hdrDefines(this.handScene);
    return this.hdr;
  }

  // Entity materials: linearise textures in HDR mode
  _hdrDefines(root) {
    const want = this.hdr;
    root.traverse((o) => {
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) {
        if (!m || m.isShaderMaterial) continue;
        const has = !!(m.defines && m.defines.HDR_LINEAR);
        if (has === want) continue;
        m.defines = Object.assign({}, m.defines);
        if (want) m.defines.HDR_LINEAR = 1; else delete m.defines.HDR_LINEAR;
        m.needsUpdate = true;
      }
    });
  }

  allPlayers() {
    const list = [];
    if (this.player && !this.player.dead) list.push({ pos: this.player.pos, local: true, mode: this.player.mode });
    const dim = this.world ? this.world.dim : 0;
    for (const rp of this.remotePlayers.values()) if (rp.dim === dim) list.push({ pos: rp.pos, local: false, peer: rp.peer, mode: rp.mode });
    return list;
  }

  nearestTarget(pos, range) {
    let best = null, bd = range;
    for (const p of this.allPlayers()) {
      if (p.mode !== 'survival' && p.mode !== 'adventure') continue;
      const d = p.pos.distanceTo(pos);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  damagePlayer(target, dmg, knock, cause) {
    if (dmg <= 0) return;
    if (target.local) {
      if (this.curAttacker) this.lastHurtBy = { name: this.curAttacker, t: performance.now() };
      this.player.damage(dmg, cause, knock);
    } else this.net.send('hurt', { to: target.peer, dmg, kx: knock.x, ky: knock.y, kz: knock.z, by: this.curAttacker || undefined });
  }

  get isAuthority() { return !this.net.active || this.net.isHost; }

  // ---------------------------------------------------------------- blocks
  // Change a block as the result of a local action and tell other players.
  changeBlock(x, y, z, id, opts = {}) {
    const old = this.world.getBlock(x, y, z);
    if (!this.world.setBlock(x, y, z, id)) return false;
    if (opts.batch) {
      this.pendingBlocks.push([x, y, z, id]);
      return true;
    }
    let facing = null;
    if (id !== B.AIR && BLOCKS[id].facing && opts.facing !== undefined) {
      facing = opts.facing;
      const prev = this.world.getData(x, y, z) || {};
      this.world.setData(x, y, z, Object.assign({}, prev, { facing }));
    }
    const msg = { x, y, z, id, w: this.world.dim };
    if (facing !== null) msg.f = facing;
    this.net.send('block', msg);
    if (id !== old) this.removePartner(x, y, z, old);
    if (!opts.noUpdate) this.neighbourUpdates(x, y, z, old, id);
    return true;
  }

  // Plants/torches pop off, sand falls, water fills gaps.
  neighbourUpdates(x, y, z, old, id) {
    const w = this.world;
    if (!isSolid(id)) {
      const above = w.getBlock(x, y + 1, z);
      if (BLOCKS[above].needsSupport) {
        this.changeBlock(x, y + 1, z, B.AIR);
        if (this.player.mode === 'survival') this.dropBlockItems(x, y + 1, z, above, true);
      } else if (BLOCKS[above].gravity) {
        this.fall(x, y + 1, z);
      }
    }
    if (id !== B.AIR && BLOCKS[id].gravity) this.fall(x, y, z);
    this.scheduleAround(x, y, z);
  }

  fall(x, y, z) {
    const w = this.world;
    const id = w.getBlock(x, y, z);
    if (!BLOCKS[id].gravity) return;
    let ty = y;
    while (ty > 0 && BLOCKS[w.getBlock(x, ty - 1, z)].replaceable) ty--;
    if (ty === y) return;
    this.changeBlock(x, y, z, B.AIR, { noUpdate: true });
    this.changeBlock(x, ty, z, id, { noUpdate: true });
    this.fall(x, y + 1, z);
    const above = w.getBlock(x, y + 1, z);
    if (BLOCKS[above].needsSupport) this.changeBlock(x, y + 1, z, B.AIR);
  }

  dropBlockItems(x, y, z, id, harvest) {
    if (!harvest) return;
    const b = BLOCKS[id];
    const r = Math.random;
    const drops = b.drops ? b.drops(r) : [[id, 1]];
    for (const [did, n] of drops) if (n > 0) this.spawnItem(stackOf(did, n), x + 0.5, y + 0.4, z + 0.5);
    // Container contents
    const data = this.world.getData(x, y, z);
    if (data && data.slots) {
      for (const s of data.slots) if (s) this.spawnItem(stackOf(s[0], s[1], s[2], s[3]), x + 0.5, y + 0.5, z + 0.5);
    }
  }

  spawnItem(stack, x, y, z, vel) {
    if (!stack || !ITEMS[stack.id] || stack.count <= 0) return;
    this.items.push(new ItemEntity(this, stack, x, y, z, vel));
  }

  // ---------------------------------------------------------------- explosions
  explode(x, y, z, power, authority) {
    const list = this.world.explosionBlocks(x, y, z, power);
    const cleared = [];
    for (const [bx, by, bz, id] of list) {
      if (this.world.getBlock(bx, by, bz) !== id) continue;
      if (id === B.TNT) {
        this.world.setBlock(bx, by, bz, B.AIR);
        cleared.push([bx, by, bz, B.AIR]);
        this.primeTnt(bx, by, bz, 0.5 + Math.random());
        continue;
      }
      if (this.world.getData(bx, by, bz)) this.dropBlockItems(bx, by, bz, id, false);
      this.world.setBlock(bx, by, bz, B.AIR);
      cleared.push([bx, by, bz, B.AIR]);
      if (Math.random() < 0.3) this.dropBlockItems(bx, by, bz, id, true);
    }
    if (authority) {
      this.net.sendBlocks(cleared.map((b) => [b[0], b[1], b[2], b[3], this.world.dim]));
      this.net.send('boom', { x, y, z, p: power, w: this.world.dim });
      for (const [bx, by, bz] of cleared) this.scheduleAround(bx, by, bz);
    }
    this.explosionEffects(x, y, z, power, authority);
  }

  explosionEffects(x, y, z, power, authority) {
    Sound.explode();
    this.particles.smoke(x, y, z, 40);
    const c = new THREE.Vector3(x, y, z);
    const hurt = (pos, h) => {
      const d = pos.distanceTo(c) || 0.1;
      const impact = Math.max(0, 1 - d / (power * 2));
      return { dmg: Math.floor((impact * impact + impact) / 2 * 7 * power * 2 * 0.5), dir: pos.clone().sub(c).normalize().multiplyScalar(impact * 12) };
    };
    const p = this.player;
    if (p && !p.dead) {
      const { dmg, dir } = hurt(p.pos.clone().add(new THREE.Vector3(0, 0.9, 0)));
      if (dmg > 0) p.damage(dmg, 'explosion', { x: dir.x, y: Math.max(4, dir.y), z: dir.z });
      else if (dir.lengthSq() > 0.01) p.vel.add(dir);
    }
    if (authority) {
      for (const m of this.mobs.values()) {
        const { dmg, dir } = hurt(m.pos);
        if (dmg > 0) m.hurt(dmg, dir.x, dir.z, null);
      }
    }
    for (const it of this.items) {
      const d = it.pos.distanceTo(c);
      if (d < power * 2) it.vel.add(it.pos.clone().sub(c).normalize().multiplyScalar(6));
    }
  }

  primeTnt(x, y, z, fuse = 4) {
    const mesh = new THREE.Mesh(blockGeometry(B.TNT, 0.98), this.entityMat.clone());
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.scene.add(mesh);
    this.tnts.push({ pos: new THREE.Vector3(x + 0.5, y, z + 0.5), vel: new THREE.Vector3(0, 3, 0), w: 0.98, h: 0.98, onGround: false, fuse, mesh });
    Sound.fuse();
  }

  // ---------------------------------------------------------------- interaction
  target() {
    if (!this.player || this.player.mode === 'spectator') return { block: null, entity: null };
    const eye = this.player.eye, dir = this.player.lookDir();
    const reach = this.player.mode === 'creative' ? 5 : 4.5;
    const block = this.world.raycast(eye, dir, reach);
    let entity = null, ed = block ? block.dist : reach;
    const er = this.player.mode === 'creative' ? 5 : 3;
    for (const m of this.mobs.values()) {
      if (m.dead) continue;
      const t = m.rayHit(eye, dir, Math.min(ed, er));
      if (t !== null && t < ed) { ed = t; entity = m; }
    }
    for (const rp of this.remotePlayers.values()) {
      const t = rp.rayHit(eye, dir, Math.min(ed, er));
      if (t !== null && t < ed) { ed = t; entity = rp; }
    }
    const bt = this.boatTarget(eye, dir, Math.min(ed, er));
    if (bt) { entity = bt.boat; ed = bt.dist; }
    return { block: entity ? null : block, entity };
  }

  doSwing() {
    this.swing = 1;
    this.swingCount++;
  }

  attackEntity(ent) {
    const p = this.player;
    if (p.mode === 'spectator' || this.attackCooldown > 0) return;
    this.attackCooldown = 0.25;
    this.doSwing();
    const held = p.heldStack;
    const tool = held && ITEMS[held.id].tool;
    if (ent instanceof Boat) { this.attackCooldown = 0.25; this.hitBoat(ent); return; }
    let dmg = tool && tool.type !== 'ignite' ? tool.damage : 1;
    const sharp = enchLevel(held, 'sharpness');
    if (sharp) dmg += 0.5 * sharp + 0.5;
    if (p.vel.y < -0.5 && !p.onGround && !p.inWater) dmg = Math.floor(dmg * 1.5);
    const dir = p.lookDir();
    if (ent instanceof Mob) {
      if (ent.type !== 'wolf' || !ent.owner) this.ownerTarget = ent;
      if (this.isAuthority) {
        if (ent.hurt(dmg, dir.x, dir.z, null) && ent.dead) this.onMobKilled(ent, null);
      } else {
        ent.hurtTime = 0.4;
        Sound.mobHurt(ent.type);
        this.net.send('hitmob', { id: ent.id, dmg, kx: dir.x, kz: dir.z });
      }
    } else if (ent instanceof RemotePlayer) {
      if (ent.mode === 'creative' || ent.mode === 'spectator') return;
      ent.hurtTime = 0.4;
      Sound.hurt();
      this.net.send('hurt', { to: ent.peer, dmg, kx: dir.x * 5, ky: 4, kz: dir.z * 5 });
    }
    p.exhaustion += 0.1;
    if (tool && p.mode !== 'creative') this.damageHeld(tool.type === 'sword' ? 1 : 2);
  }

  onMobKilled(mob, killerPeer) {
    if (mob._dropped) return;
    mob._dropped = true;
    const drops = mobDrops(mob.type, Math.random);
    if (killerPeer) {
      this.net.send('mobdrop', { to: killerPeer, x: mob.pos.x, y: mob.pos.y + 0.5, z: mob.pos.z, items: drops });
    } else {
      for (const [id, n] of drops) if (n > 0) this.spawnItem(stackOf(id, n), mob.pos.x, mob.pos.y + 0.5, mob.pos.z);
    }
  }

  damageHeld(amount) {
    const p = this.player;
    const s = p.heldStack;
    if (!s || !ITEMS[s.id].tool) return;
    const unb = enchLevel(s, 'unbreaking');
    if (unb && Math.random() > 1 / (unb + 1)) return;
    s.dmg = (s.dmg || 0) + amount;
    if (s.dmg >= ITEMS[s.id].tool.uses) {
      p.inventory.slots[p.selected] = null;
      Sound.noise(2000, 2, 0.3, 0.5);
    }
    p.inventory.changed();
  }

  // Called every frame while the attack button is held.
  updateMining(dt, holding) {
    const p = this.player;
    if (!holding || p.mode === 'spectator' || p.dead) { this.stopMining(); return; }
    const t = this.target();
    if (t.entity) { this.stopMining(); return; }
    const hit = t.block;
    if (!hit) { this.stopMining(); return; }
    if (p.mode === 'adventure') { this.stopMining(); return; }
    if (p.mode === 'creative') {
      this.stopMining();
      if (this.useCooldown > 0) return;
      const held = p.heldStack;
      if (held && ITEMS[held.id].tool && ITEMS[held.id].tool.type === 'sword') return;
      this.useCooldown = 0.2;
      this.breakBlock(hit, false);
      return;
    }
    if (!this.mining || this.mining.x !== hit.x || this.mining.y !== hit.y || this.mining.z !== hit.z || this.mining.id !== hit.id) {
      this.mining = { x: hit.x, y: hit.y, z: hit.z, id: hit.id, progress: 0, soundT: 0 };
    }
    const info = breakInfo(hit.id, p.heldStack, p);
    this.mining.progress += dt / info.time;
    this.mining.soundT -= dt;
    if (this.mining.soundT <= 0) { this.mining.soundT = 0.25; Sound.block(BLOCKS[hit.id].sound, 0.4); this.doSwing(); }
    if (this.mining.progress >= 1) {
      this.breakBlock(hit, info.harvest);
      if (info.right && info.time > 0.06) this.damageHeld(1);
      else if (p.heldStack && ITEMS[p.heldStack.id].tool && BLOCKS[hit.id].hardness > 0) this.damageHeld(ITEMS[p.heldStack.id].tool.type === 'sword' ? 2 : 1);
      p.exhaustion += 0.005;
      this.mining = null;
      this.useCooldown = 0.15;
    }
  }

  stopMining() { this.mining = null; }

  breakBlock(hit, harvest) {
    const id = this.world.getBlock(hit.x, hit.y, hit.z);
    if (id === B.AIR || BLOCKS[id].hardness < 0 && this.player.mode !== 'creative') return;
    if (id === B.BEDROCK && this.player.mode !== 'creative') return;
    if (this.player.mode === 'survival') this.dropBlockItems(hit.x, hit.y, hit.z, id, harvest);
    if (id === B.GLASS) Sound.glassBreak(); else Sound.block(BLOCKS[id].sound);
    this.particles.burst(hit.x, hit.y, hit.z, id);
    this.changeBlock(hit.x, hit.y, hit.z, B.AIR);
  }

  // Right click
  use() {
    const p = this.player;
    if (p.dead || p.mode === 'spectator' || this.useCooldown > 0) return;
    const t = this.target();
    const held = p.heldStack;
    const item = held ? ITEMS[held.id] : null;
    const hit = t.block;

    if (t.entity && t.entity instanceof Boat) {
      if (!p.riding) this.mount(t.entity);
      this.useCooldown = 0.4;
      return;
    }
    if (t.entity && t.entity instanceof Mob && !t.entity.dead && this.useOnMob(t.entity, held)) return;
    if (t.entity && t.entity instanceof Mob && t.entity.type === 'villager' && !t.entity.dead) {
      this.ui.openTrade(t.entity);
      return;
    }
    if (hit && !p.sneaking) {
      const id = hit.id;
      if (id === B.DOOR_LOWER || id === B.DOOR_UPPER) { this.toggleDoor(hit.x, hit.y, hit.z, id); this.doSwing(); this.useCooldown = 0.25; return; }
      if (id === B.BED_FOOT || id === B.BED_HEAD) { this.useBed(hit); this.useCooldown = 0.5; return; }
      if (id === B.CRAFTING_TABLE) { this.ui.openCrafting(); return; }
      if (id === B.FURNACE || id === B.FURNACE_LIT) { this.ui.openFurnace(hit.x, hit.y, hit.z); return; }
      if (id === B.CHEST) { this.ui.openChest(hit.x, hit.y, hit.z); return; }
      if (this.interactNew(hit, held)) return;
      if (id === B.TNT && item && held.id === ITEM.FLINT_STEEL) {
        this.changeBlock(hit.x, hit.y, hit.z, B.AIR);
        this.primeTnt(hit.x, hit.y, hit.z);
        if (p.mode !== 'creative') this.damageHeld(1);
        this.doSwing();
        this.useCooldown = 0.25;
        return;
      }
    }
    if (item && (item.armor || item.places || held.id === ITEM.BUCKET || held.id === ITEM.WATER_BUCKET || held.id === ITEM.LAVA_BUCKET || held.id === ITEM.BONE_MEAL || held.id === ITEM.FLINT_STEEL || (item.tool && item.tool.type === 'hoe'))) {
      if (this.useSpecial(hit, held, item)) { this.useCooldown = 0.25; return; }
    }
    if (item && held.id === ITEM.BOW) return;
    if (item && this.useNewItem(hit, held)) return;
    if (item && item.food > 0 && (p.food < 20 || p.mode === 'creative')) {
      if (p.mode !== 'creative') { this.eating = Math.max(this.eating, 0.0001); }
      return;
    }
    if (hit && item && item.block !== null && p.mode !== 'adventure') {
      const nx = hit.x + hit.normal[0], ny = hit.y + hit.normal[1], nz = hit.z + hit.normal[2];
      let tx = nx, ty = ny, tz = nz;
      if (BLOCKS[hit.id].replaceable && hit.id !== B.WATER) { tx = hit.x; ty = hit.y; tz = hit.z; }
      const existing = this.world.getBlock(tx, ty, tz);
      if (!BLOCKS[existing].replaceable) return;
      if (ty < 0 || ty >= WORLD_HEIGHT) return;
      const bid = item.block;
      const b = BLOCKS[bid];
      const how = this.placementFor(bid, hit, tx, ty, tz);
      if (!how) return;
      if (how.done) { Sound.block(b.sound); this.doSwing(); this.useCooldown = 0.2; if (p.mode === 'survival') p.inventory.removeFrom(p.selected, 1); return; }
      if (b.solid && p.intersectsBlock(tx, ty, tz)) return;
      for (const m of this.mobs.values()) {
        if (b.solid && m.pos.x + m.w / 2 > tx && m.pos.x - m.w / 2 < tx + 1 && m.pos.z + m.w / 2 > tz && m.pos.z - m.w / 2 < tz + 1 && m.pos.y < ty + 1 && m.pos.y + m.h > ty) return;
      }
      if (b.needsSupport && !how.skipSupport && !isSolid(this.world.getBlock(tx, ty - 1, tz))) return;
      if ((bid === B.TALL_GRASS || bid === B.DANDELION || bid === B.POPPY) && ![B.GRASS, B.DIRT, B.SNOW_GRASS].includes(this.world.getBlock(tx, ty - 1, tz))) return;
      // Facing blocks put their front toward the player
      this.changeBlock(tx, ty, tz, bid, { facing: b.facing ? this._facingToward(p, tx, tz) : undefined });
      if (how.data) this.world.setData(tx, ty, tz, how.data);
      if (how.data) this.net.send('bdata', { x: tx, y: ty, z: tz, d: how.data, w: this.world.dim });
      if (bid === B.CHEST) this.world.setData(tx, ty, tz, Object.assign(this.world.getData(tx, ty, tz) || {}, { type: 'chest', slots: new Array(27).fill(0) }));
      if (bid === B.FURNACE) this.world.setData(tx, ty, tz, Object.assign(this.world.getData(tx, ty, tz) || {}, { type: 'furnace', slots: [0, 0, 0], burn: 0, burnMax: 0, cook: 0 }));
      if (b.facing || bid === B.CHEST || bid === B.FURNACE) this.net.send('bdata', { x: tx, y: ty, z: tz, d: this.world.getData(tx, ty, tz), w: this.world.dim });
      Sound.block(b.sound);
      this.doSwing();
      this.useCooldown = 0.2;
      if (p.mode === 'survival') p.inventory.removeFrom(p.selected, 1);
    }
  }

  // facing index (0:+z, 1:-x, 2:-z, 3:+x) pointing from block toward player
  _facingToward(p, tx, tz) {
    const dx = p.pos.x - (tx + 0.5), dz = p.pos.z - (tz + 0.5);
    if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 3 : 1;
    return dz > 0 ? 0 : 2;
  }

  pickBlock() {
    const t = this.target();
    if (!t.block) return;
    const id = t.block.id === B.FURNACE_LIT ? B.FURNACE : t.block.id;
    if (!ITEMS[id]) return;
    const inv = this.player.inventory;
    for (let i = 0; i < 9; i++) if (inv.slots[i] && inv.slots[i].id === id) { this.ui.selectSlot(i); return; }
    if (this.player.mode === 'creative') {
      let slot = this.player.selected;
      for (let i = 0; i < 9; i++) if (!inv.slots[i]) { slot = i; break; }
      inv.slots[slot] = stackOf(id, 64);
      inv.changed();
      this.ui.selectSlot(slot);
    } else {
      for (let i = 9; i < 36; i++) if (inv.slots[i] && inv.slots[i].id === id) {
        const s = inv.slots[this.player.selected];
        inv.slots[this.player.selected] = inv.slots[i];
        inv.slots[i] = s;
        inv.changed();
        return;
      }
    }
  }

  dropHeld(all) {
    const p = this.player;
    if (p.mode === 'spectator' || p.dead) return;
    const s = p.heldStack;
    if (!s) return;
    const n = all ? s.count : 1;
    const dir = p.lookDir();
    const eye = p.eye;
    this.spawnItem(stackOf(s.id, n, s.dmg, s.ench), eye.x + dir.x * 0.3, eye.y - 0.3, eye.z + dir.z * 0.3, new THREE.Vector3(dir.x * 5, dir.y * 5 + 2, dir.z * 5));
    this.items[this.items.length - 1].pickupDelay = 1.5;
    p.inventory.removeFrom(p.selected, n);
  }

  updateEating(dt, holding) {
    const p = this.player;
    if (this.eating <= 0) return;
    const held = p.heldStack;
    const item = held ? ITEMS[held.id] : null;
    if (!holding || !item || item.food <= 0) { this.eating = 0; return; }
    const before = this.eating;
    this.eating += dt;
    if (Math.floor(before * 5) !== Math.floor(this.eating * 5)) Sound.eat();
    if (this.eating >= 1.6) {
      this.eating = 0;
      p.eat(item);
      Sound.burp();
      p.inventory.removeFrom(p.selected, 1);
      if (held.id === ITEM.ROTTEN_FLESH && Math.random() < 0.8) p.exhaustion += 4;
    }
  }

  // ---------------------------------------------------------------- death
  onDeath(cause) {
    const p = this.player;
    if (p.dead) return;
    p.dead = true;
    this.ui.closeScreen();
    const msgs = {
      fall: 'hit the ground too hard', drown: 'drowned', starve: 'starved to death', mob: 'was slain',
      explosion: 'blew up', player: 'was killed by another player', void: 'fell out of the world', kill: 'died',
      lava: 'tried to swim in lava', fire: 'burned to death', arrow: 'was shot by an arrow',
      dragon: 'was slain by the Ender Dragon', lightning: 'was struck by lightning',
    };
    const text = `${this.settings.name} ${msgs[cause] || 'died'}`;
    this.chat.system(text);
    if (this.net.active) this.net.send('chat', { n: '', t: text });
    // Drop everything
    for (let i = 0; i < p.inventory.slots.length; i++) {
      const s = p.inventory.slots[i];
      if (s) this.spawnItem(stackOf(s.id, s.count, s.dmg, s.ench), p.pos.x, p.pos.y + 1, p.pos.z);
    }
    p.inventory.clear();
    this.ui.showDeath(text, this.hardcore);
  }

  respawn() {
    const p = this.player;
    p.dead = false;
    p.health = 20; p.food = 20; p.saturation = 5; p.air = 15; p.exhaustion = 0;
    p.vel.set(0, 0, 0);
    p.fallStart = null;
    if (this.hardcore) { p.setMode('spectator'); return; }
    const sp = p.spawn || this.worldSpawn;
    p.pos.set(sp.x, sp.y, sp.z);
    this.spawnPending = true;
  }

  // ---------------------------------------------------------------- furnaces
  tickFurnaces(dt) {
    for (const [k, d] of this.world.blockData) {
      if (!d || d.type !== 'furnace') continue;
      const [x, y, z] = k.split(',').map(Number);
      if (!this.world.isLoaded(x, z)) continue;
      const s = d.slots;
      const input = s[0] ? s[0] : null;
      const result = input ? SMELTING[input[0]] : undefined;
      const out = s[2];
      const canSmelt = result !== undefined && (!out || (out[0] === result && out[1] < maxStack(result)));
      let changed = false;
      if (d.burn > 0) d.burn -= dt;
      if (d.burn <= 0 && canSmelt && s[1] && ITEMS[s[1][0]] && ITEMS[s[1][0]].fuel > 0) {
        d.burnMax = d.burn = ITEMS[s[1][0]].fuel;
        s[1][1]--;
        if (s[1][1] <= 0) s[1] = 0;
        changed = true;
      }
      if (d.burn > 0 && canSmelt) {
        d.cook += dt;
        if (d.cook >= SMELT_TIME) {
          d.cook = 0;
          s[0][1]--;
          if (s[0][1] <= 0) s[0] = 0;
          if (out) out[1]++; else s[2] = [result, 1, 0];
          changed = true;
        }
      } else d.cook = Math.max(0, d.cook - dt * 2);
      if (d.burn < 0) d.burn = 0;
      const lit = d.burn > 0;
      const id = this.world.getBlock(x, y, z);
      if (lit && id === B.FURNACE) this.world.setBlock(x, y, z, B.FURNACE_LIT);
      else if (!lit && id === B.FURNACE_LIT) this.world.setBlock(x, y, z, B.FURNACE);
      if (changed && this.ui) this.ui.containerChanged(x, y, z);
    }
  }

  // ---------------------------------------------------------------- mobs
  spawnMob(type, x, y, z, extra) {
    const m = new Mob(this, type, x, y, z, null, extra);
    this.mobs.set(m.id, m);
    return m;
  }

  updateSpawning(dt) {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 0.5;
    const w = this.world;
    const players = this.allPlayers().filter((p) => p.mode !== 'spectator');
    if (!players.length) return;
    let passive = 0, hostile = 0;
    for (const m of this.mobs.values()) {
      let near = Infinity;
      for (const p of players) near = Math.min(near, p.pos.distanceTo(m.pos));
      const far = m.info.persistent ? 1e9 : m.info.hostile ? 80 : 110;
      if (near > far || !w.isLoaded(m.pos.x, m.pos.z) || (m.info.hostile && this.difficulty === 0)) {
        m.dispose(); this.mobs.delete(m.id); continue;
      }
      if (m.info.hostile || m.info.neutral) hostile++; else if (!m.info.persistent) passive++;
    }
    const cap = this.net.active ? 30 : 60;
    if (passive + hostile >= cap) return;
    const p = players[Math.floor(Math.random() * players.length)];
    const a = Math.random() * Math.PI * 2;
    const d = 24 + Math.random() * 24;
    const x = Math.floor(p.pos.x + Math.cos(a) * d), z = Math.floor(p.pos.z + Math.sin(a) * d);
    if (!w.isLoaded(x, z)) return;
    const tooClose = (y) => players.some((q) => q.pos.distanceTo(new THREE.Vector3(x, y, z)) < 20);
    if (w.dim === 2) return;

    if (w.dim === 1) {
      // Nether: zombified piglins on netherrack, ghasts in big open caverns
      if (this.difficulty === 0 && Math.random() < 0.7) return;
      if (hostile >= 10 * players.length) return;
      const ghast = Math.random() < 0.25;
      for (let tries = 0; tries < 8; tries++) {
        const y = 32 + Math.floor(Math.random() * 80);
        if (tooClose(y)) continue;
        if (ghast) {
          let open = true;
          for (let dx = -2; dx <= 2 && open; dx += 2) for (let dy = 0; dy <= 4 && open; dy += 2) for (let dz = -2; dz <= 2 && open; dz += 2) if (w.getBlock(x + dx, y + dy, z + dz) !== B.AIR) open = false;
          if (open && this.difficulty > 0) { this.spawnMob('ghast', x + 0.5, y, z + 0.5); return; }
        } else if (w.getBlock(x, y, z) === B.AIR && w.getBlock(x, y + 1, z) === B.AIR && w.getBlock(x, y - 1, z) === B.NETHERRACK) {
          const n = 1 + Math.floor(Math.random() * 3);
          for (let i = 0; i < n; i++) this.spawnMob('piglin', x + 0.5 + i * 0.7, y, z + 0.5);
          return;
        }
      }
      return;
    }

    const sy = w.surfaceY(x, z);
    if (sy < 0 || tooClose(sy)) return;
    if (passive < 10 * players.length && this.daylight > 0.5 && w.getBlock(x, sy, z) === B.GRASS && Math.random() < 0.3) {
      const type = ['pig', 'cow', 'sheep', 'chicken'][Math.floor(Math.random() * 4)];
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const ox = x + Math.floor(Math.random() * 5) - 2, oz = z + Math.floor(Math.random() * 5) - 2;
        const oy = w.surfaceY(ox, oz);
        if (w.getBlock(ox, oy, oz) === B.GRASS && !isSolid(w.getBlock(ox, oy + 1, oz))) this.spawnMob(type, ox + 0.5, oy + 1, oz + 0.5);
      }
      return;
    }
    if (this.difficulty === 0 || hostile >= 12 * players.length) return;
    const r = Math.random();
    const type = r < 0.4 ? 'zombie' : r < 0.65 ? 'skeleton' : r < 0.85 ? 'creeper' : 'spider';
    if (this.daylight < 0.35 && isSolid(w.getBlock(x, sy, z)) && w.getBlock(x, sy + 1, z) === B.AIR) {
      const l = w.getLight(x, sy + 1, z);
      if (l.block < 8 && Villages.near(w, x, z, 40).length === 0) { this.spawnMob(type, x + 0.5, sy + 1, z + 0.5); return; }
    }
    for (let tries = 0; tries < 6; tries++) {
      const y = 5 + Math.floor(Math.random() * Math.max(1, sy - 8));
      if (w.getBlock(x, y, z) !== B.AIR || w.getBlock(x, y + 1, z) !== B.AIR || !isSolid(w.getBlock(x, y - 1, z))) continue;
      const l = w.getLight(x, y, z);
      if (l.sky < 4 && l.block < 6) { this.spawnMob(type, x + 0.5, y, z + 0.5); return; }
    }
  }

  serializeMobs() {
    const out = [];
    for (const m of this.mobs.values()) {
      if (out.length >= 36) break;
      let flags = 0;
      if (m.hurtTime > 0) flags |= 1;
      if (m.dead) flags |= 2;
      out.push([m.id, MOB_TYPES.indexOf(m.type), Math.round(m.pos.x * 10), Math.round(m.pos.y * 10), Math.round(m.pos.z * 10), Math.round(m.yaw * 100), flags, Math.round(m.fuse * 10), m.swing > 0.5 ? 1 : 0, m.profession ? PROFESSIONS.indexOf(m.profession) : -1, m.size || 0, Math.ceil(m.health), m.owner ? 1 : 0, m.botInfo || 0]);
    }
    return out;
  }

  applyMobState(list) {
    if (!Array.isArray(list)) return;
    const seen = new Set();
    for (const a of list) {
      if (!Array.isArray(a) || a.length < 8) continue;
      const [id, ti, x, y, z, yaw, flags, fuse] = a;
      const type = MOB_TYPES[ti];
      if (!type) continue;
      seen.add(id);
      let m = this.mobs.get(id);
      if (!m) {
        m = new Mob(this, type, x / 10, y / 10, z / 10, id, { profession: PROFESSIONS[a[9]] || undefined, size: a[10] || undefined, info: typeof a[13] === 'string' ? a[13] : undefined });
        this.mobs.set(id, m);
      }
      m.target.set(x / 10, y / 10, z / 10);
      m.targetYaw = yaw / 100;
      if (flags & 1 && m.hurtTime <= 0) m.hurtTime = 0.3;
      if (flags & 2 && !m.dead) m.deathTime = 0;
      m.fuse = fuse / 10;
      if (a[8]) m.swing = 1;
      if (typeof a[11] === 'number') m.health = a[11];
      m.owner = a[12] ? m.owner || 'remote' : null;
    }
    for (const [id, m] of this.mobs) if (!seen.has(id)) { m.dispose(); this.mobs.delete(id); }
  }

  // ---------------------------------------------------------------- network
  _setupNet() {
    const net = this.net;
    net.on('hello', (d, from) => {
      if (!net.isHost || net.serverAuth) return;
      net.sendWorldTo(from, {
        seed: this.world.seed, mode: this.defaultMode, difficulty: this.difficulty,
        time: this.timeOfDay, spawn: this.worldSpawn, name: this.worldName,
        nw: this.nw ? this.nw.welcomeInfo() : undefined,
      });
    });
    net.on('welcome', (d) => {
      if (!this.awaitingWelcome) return;
      this.awaitingWelcome = false;
      if (typeof d.seed !== 'number') return;
      this.startRemoteWorld(d);
      if (d.nw && typeof this.joinRemoteNetwork === 'function') this.joinRemoteNetwork(d.nw);
      this.ui.onJoined();
    });
    net.on('edits', (d) => {
      if (!this.world || !this.remote) return;
      for (const [x, y, z, id, w] of decodeBlocks(d.d)) if (BLOCKS[id]) this.worldFor(w === 1 || w === 2 ? w : 0).applyRemoteEdit(x, y, z, id);
      if (this.pendingEdits) {
        this.pendingEdits.got++;
        this.pendingEdits.total = d.total | 0;
        if (this.pendingEdits.got >= this.pendingEdits.total) this.pendingEdits = null;
      }
    });
    const applyBlock = (x, y, z, id, w) => {
      if (!BLOCKS[id] || !Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) return;
      const dim = w === 1 || w === 2 ? w : 0;
      if (dim !== this.world.dim) { this.worldFor(dim).applyRemoteEdit(x, y, z, id); return; }
      const old = this.world.getBlock(x, y, z);
      if (id === B.AIR && old !== B.AIR && this.world.isLoaded(x, z)) {
        if (this.player.pos.distanceTo(new THREE.Vector3(x, y, z)) < 24) { this.particles.burst(x, y, z, old, 6); Sound.block(BLOCKS[old].sound, 0.5); }
      }
      this.world.applyRemoteEdit(x, y, z, id);
      if (this.isAuthority) { this.scheduleAround(x, y, z); this.redstoneNotify(x, y, z, old, id); }
      if (this.ui) this.ui.containerChanged(x, y, z);
    };
    net.on('block', (d, from) => {
      if (!this.world) return;
      this.lastBlockFrom = from;
      applyBlock(d.x, d.y, d.z, d.id, d.w);
      if (typeof d.f === 'number' && (d.w | 0) === this.world.dim) this.world.setData(d.x, d.y, d.z, Object.assign({}, this.world.getData(d.x, d.y, d.z) || {}, { facing: d.f & 3 }));
    });
    net.on('blocks', (d) => {
      if (!this.world) return;
      for (const [x, y, z, id, w] of decodeBlocks(d.d)) applyBlock(x, y, z, id, w);
    });
    net.on('bdata', (d) => {
      if (!this.world || !Number.isInteger(d.x)) return;
      const v = d.d && typeof d.d === 'object' ? d.d : null;
      const dw = d.w === 1 || d.w === 2 ? d.w : 0;
      this.worldFor(dw).setData(d.x, d.y, d.z, v);
      if (this.isAuthority && dw === this.world.dim) {
        this.redstone.mark(d.x, d.y, d.z);
        if (v && v.on && this.world.getBlock(d.x, d.y, d.z) === B.BUTTON) this.redstone.buttons.set(d.x + ',' + d.y + ',' + d.z, this.simTime + 1);
      }
      if (this.ui) this.ui.containerChanged(d.x, d.y, d.z);
    });
    net.on('chat', (d, from) => {
      if (this.chatHook && this.chatHook(d, from)) return;
      const t = String(d.t || '').slice(0, 256);
      if (!t) return;
      if (d.n) this.chat.add(`<${String(d.n).slice(0, 24)}> ${t}`);
      else this.chat.system(t);
    });
    net.on('hitmob', (d, from) => {
      if (!this.isAuthority) return;
      const m = this.mobs.get(d.id);
      if (!m || m.dead) return;
      const dmg = Math.max(0, Math.min(20, +d.dmg || 0));
      if (m.hurt(dmg, +d.kx || 0, +d.kz || 0, from) && m.dead) this.onMobKilled(m, from);
    });
    net.on('hurt', (d, from) => {
      if (!this.player) return;
      const rp = this.remotePlayers.get(from);
      this.lastHurtBy = { name: typeof d.by === 'string' ? d.by.slice(0, 24) : rp ? rp.name : null, t: performance.now() };
      const dmg = Math.max(0, Math.min(40, +d.dmg || 0));
      this.player.damage(dmg, 'player', { x: +d.kx || 0, y: +d.ky || 4, z: +d.kz || 0 });
    });
    net.on('mobdrop', (d) => {
      if (!Array.isArray(d.items)) return;
      for (const it of d.items) {
        if (Array.isArray(it) && ITEMS[it[0]] && it[1] > 0) this.spawnItem(stackOf(it[0], Math.min(64, it[1] | 0)), +d.x, +d.y, +d.z);
      }
      if (d.xp > 0) this.spawnXP(+d.x, +d.y, +d.z, Math.min(500, d.xp | 0));
    });
    net.on('boom', (d) => {
      if (!this.player || (d.w | 0) !== this.world.dim) return;
      this.explosionEffects(+d.x, +d.y, +d.z, Math.min(8, +d.p || 3), false);
    });
    net.onPeersChanged = (peers, left) => {
      const known = new Set();
      for (const [id, pres] of peers) {
        known.add(id);
        if (!pres || !Array.isArray(pres.p)) continue;
        let rp = this.remotePlayers.get(id);
        if (!rp) {
          rp = new RemotePlayer(this, id, String(pres.n || 'Player').slice(0, 24));
          this.remotePlayers.set(id, rp);
          if (this.mode === 'play') this.chat.system(`${rp.name} joined the game`, '#ff5');
        }
        rp.applyState(pres);
        rp.pres = pres;
        if (pres.host && !this.isAuthority) {
          if (typeof pres.t === 'number') this.timeOfDay = pres.t;
          if (typeof pres.wr === 'number') { this.weather.raining = !!(pres.wr & 1); this.weather.thundering = !!(pres.wr & 2); }
          const same = (pres.d | 0) === this.world.dim;
          this.applyMobState(same ? pres.mobs : []);
          this.applyProjectileState(same ? pres.pr : []);
          if (this.onHostPresence) this.onHostPresence(pres);
        }
      }
      for (const [id, rp] of this.remotePlayers) {
        if (!known.has(id)) {
          if (this.mode === 'play') this.chat.system(`${rp.name} left the game`, '#ff5');
          rp.dispose();
          this.remotePlayers.delete(id);
        }
      }
    };
    net.onDisconnect = (msg) => {
      if (this.remote) this.ui.disconnected(msg);
      else { this.chat.system('Multiplayer session ended: ' + msg, '#f55'); this.net.close(); }
    };
  }

  async openToFriends() {
    const code = Math.random().toString(36).slice(2, 8);
    await this.net.hostRoom(code);
    return code;
  }

  async joinGame(kind, target) {
    this.awaitingWelcome = true;
    if (kind === 'room') await this.net.joinRoom(target);
    else await this.net.joinServer(target);
    this.net.presence({ n: this.settings.name }, true);
    // Keep saying hello until the host answers.
    const hello = () => {
      if (!this.awaitingWelcome || !this.net.active) return;
      this.net.send('hello', { n: this.settings.name });
      setTimeout(hello, 2000);
    };
    hello();
  }

  sendPresence() {
    if (!this.net.active || !this.player) return;
    const p = this.player;
    const pres = {
      n: this.settings.name,
      p: [+p.pos.x.toFixed(2), +p.pos.y.toFixed(2), +p.pos.z.toFixed(2)],
      r: [+p.yaw.toFixed(2), +p.pitch.toFixed(2)],
      h: p.heldStack ? p.heldStack.id : 0,
      m: p.mode,
      s: this.swingCount % 1000,
      k: p.sneaking ? 1 : 0,
    };
    pres.d = this.world.dim;
    if (this.net.isHost) {
      pres.host = 1;
      pres.t = +this.timeOfDay.toFixed(5);
      pres.wr = (this.weather.raining ? 1 : 0) | (this.weather.thundering ? 2 : 0);
      pres.mobs = this.serializeMobs();
      pres.pr = this.serializeProjectiles();
    }
    if (this.presenceExtra) this.presenceExtra(pres);
    this.net.presence(pres);
  }

  // ---------------------------------------------------------------- commands
  runCommand(text) {
    const args = text.slice(1).trim().split(/\s+/);
    const cmd = (args.shift() || '').toLowerCase();
    const say = (m, c) => this.chat.system(m, c);
    const p = this.player;
    const allowed = this.cheats || (!this.remote && this.defaultMode === 'creative');
    const open = ['help', 'seed', 'list'];
    if (!open.includes(cmd) && !allowed) { say('Commands need cheats. Turn on "Allow Cheats" when creating a world.', '#f55'); return; }
    const num = (s, base) => (s && s.startsWith('~') ? base + (parseFloat(s.slice(1)) || 0) : parseFloat(s));
    switch (cmd) {
      case 'help':
        say('/gamemode <survival|creative|adventure|spectator>, /time set <day|noon|night|midnight|n>, /tp <x> <y> <z>, /give <item> [count], /summon <mob>, /locate <village|stronghold|fortress>, /weather <clear|rain|thunder>, /xp <n>[L], /enchant <name> [level], /kill, /clear, /spawnpoint, /setworldspawn, /difficulty <level>, /seed, /list');
        break;
      case 'seed': say('Seed: ' + this.world.seed); break;
      case 'locate': {
        const what = (args[0] || '').replace('minecraft:', '');
        if (what === 'stronghold') {
          if (this.world.dim !== 0) { say('Strongholds are only in the Overworld', '#f55'); return; }
          const [sx, sy, sz] = Structures.strongholdPos(this.world);
          say(`The nearest stronghold is at [${sx}, ${sy}, ${sz}] (${Math.round(Math.hypot(sx - p.pos.x, sz - p.pos.z))} blocks away)`);
          return;
        }
        if (what === 'fortress') {
          if (this.world.dim !== 1) { say('Fortresses are only in the Nether', '#f55'); return; }
          const list = Structures.fortressesIn(this.world, p.pos.x - 700, p.pos.z - 700, p.pos.x + 700, p.pos.z + 700);
          if (!list.length) { say('Could not find a fortress nearby', '#f55'); return; }
          const f = list.reduce((a, b) => (Math.hypot(a.center[0] - p.pos.x, a.center[2] - p.pos.z) < Math.hypot(b.center[0] - p.pos.x, b.center[2] - p.pos.z) ? a : b));
          say(`The nearest fortress is at [${f.center[0]}, ${f.center[1]}, ${f.center[2]}] (${Math.round(Math.hypot(f.center[0] - p.pos.x, f.center[2] - p.pos.z))} blocks away)`);
          return;
        }
        if (what !== 'village') { say('Usage: /locate <village|stronghold|fortress>', '#f55'); return; }
        if (this.world.dim !== 0) { say('Villages are only in the Overworld', '#f55'); return; }
        let best = null, bd = Infinity;
        const cx = Math.floor(p.pos.x / Villages.CELL), cz = Math.floor(p.pos.z / Villages.CELL);
        for (let r = 0; r <= 6 && !best; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const v = Villages.villageAt(this.world, cx + dx, cz + dz);
          if (!v) continue;
          const d = Math.hypot(v.center[0] - p.pos.x, v.center[2] - p.pos.z);
          if (d < bd) { bd = d; best = v; }
        }
        if (!best) { say('Could not find a village nearby', '#f55'); return; }
        say(`The nearest village is at [${Math.floor(best.center[0])}, ~, ${Math.floor(best.center[2])}] (${Math.round(bd)} blocks away)`);
        break;
      }
      case 'weather': {
        const k = (args[0] || '').toLowerCase();
        if (!['clear', 'rain', 'thunder'].includes(k)) { say('Usage: /weather <clear|rain|thunder>', '#f55'); return; }
        if (!this.isAuthority) { say('Only the host can change the weather.', '#f55'); return; }
        this.weather.set(k);
        say({ clear: 'Set the weather to clear', rain: 'Set the weather to rain', thunder: 'Set the weather to rain & thunder' }[k]);
        break;
      }
      case 'xp': case 'experience': {
        const m = /^(-?\d+)(l?)$/i.exec(args[0] || '');
        if (!m) { say('Usage: /xp <amount>[L]', '#f55'); return; }
        const n = parseInt(m[1], 10);
        if (m[2]) {
          const lvl = Math.max(0, xpLevel(p.xp).level + n);
          p.xp = xpTotalForLevel(lvl);
          say(`Gave ${n} experience levels to ${this.settings.name}`);
        } else { p.xp = Math.max(0, p.xp + n); say(`Gave ${n} experience points to ${this.settings.name}`); }
        break;
      }
      case 'enchant': {
        const key = (args[0] || '').replace('minecraft:', '').toLowerCase();
        const held = p.heldStack;
        if (!ENCHANTS[key]) { say('Enchantments: ' + Object.keys(ENCHANTS).join(', '), '#f55'); return; }
        if (!held || !ENCHANTS[key].applies(ITEMS[held.id])) { say('That enchantment cannot go on the held item', '#f55'); return; }
        const lvl = Math.max(1, Math.min(ENCHANTS[key].max, parseInt(args[1], 10) || 1));
        held.ench = Object.assign({}, held.ench || {}, { [key]: lvl });
        p.inventory.changed();
        say(`Applied enchantment ${enchName(key, lvl)} to ${ITEMS[held.id].name}`);
        break;
      }
      case 'list': say(`Players: ${[this.settings.name, ...[...this.remotePlayers.values()].map((r) => r.name)].join(', ')}`); break;
      case 'gamemode': case 'gm': {
        const map = { 0: 'survival', 1: 'creative', 2: 'adventure', 3: 'spectator', s: 'survival', c: 'creative', a: 'adventure', sp: 'spectator' };
        const m = map[args[0]] || (GAME_MODES.includes(args[0]) ? args[0] : null);
        if (!m) { say('Usage: /gamemode <survival|creative|adventure|spectator>', '#f55'); return; }
        p.setMode(m);
        say(`Set own game mode to ${m[0].toUpperCase() + m.slice(1)} Mode`);
        this.ui.refreshHud();
        break;
      }
      case 'time': {
        if (!this.isAuthority) { say('Only the host can change the time.', '#f55'); return; }
        const v = { day: 0.29, noon: 0.5, sunset: 0.73, night: 0.8, midnight: 0, sunrise: 0.24 }[args[1]];
        if (args[0] === 'set') {
          const n = v !== undefined ? v : (parseFloat(args[1]) / 24000 + 0.25) % 1;
          if (!Number.isFinite(n)) { say('Usage: /time set <day|noon|night|midnight|ticks>', '#f55'); return; }
          this.timeOfDay = n; say('Set the time');
        } else if (args[0] === 'add') {
          this.timeOfDay = (this.timeOfDay + (parseFloat(args[1]) || 0) / 24000) % 1; say('Added time');
        } else say('Usage: /time set <value>', '#f55');
        break;
      }
      case 'tp': case 'teleport': {
        const x = num(args[0], p.pos.x), y = num(args[1], p.pos.y), z = num(args[2], p.pos.z);
        if (![x, y, z].every(Number.isFinite)) { say('Usage: /tp <x> <y> <z>', '#f55'); return; }
        p.pos.set(x, y, z); p.vel.set(0, 0, 0); p.fallStart = null;
        say(`Teleported to ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}`);
        break;
      }
      case 'give': {
        const count = args.length > 1 && /^\d+$/.test(args[args.length - 1]) ? parseInt(args.pop(), 10) : 1;
        const id = findItemByName(args.join(' '));
        if (id === null || !args.length) { say('Unknown item. Try /give diamond_pickaxe', '#f55'); return; }
        let left = Math.min(count, 64 * 36);
        while (left > 0) {
          const n = Math.min(left, maxStack(id));
          const rest = p.inventory.add(stackOf(id, n), PICKUP_ORDER);
          if (rest) this.spawnItem(stackOf(id, rest), p.pos.x, p.pos.y + 1, p.pos.z);
          left -= n;
        }
        say(`Gave ${count} [${ITEMS[id].name}] to ${this.settings.name}`);
        break;
      }
      case 'summon': {
        const type = (args[0] || '').replace('minecraft:', '');
        if (!MOB_TYPES.includes(type)) { say('Mobs: ' + MOB_TYPES.join(', '), '#f55'); return; }
        if (!this.isAuthority) { say('Only the host can summon mobs.', '#f55'); return; }
        const d = p.lookDir();
        const sz = type === 'slime' && args[1] ? { size: Math.max(1, Math.min(4, parseInt(args[1], 10) || 1)) } : undefined;
        this.spawnMob(type, p.pos.x + d.x * 3, p.pos.y + 0.5, p.pos.z + d.z * 3, sz);
        say(`Summoned new ${type[0].toUpperCase() + type.slice(1)}`);
        break;
      }
      case 'kill':
        if (p.mode === 'creative' || p.mode === 'spectator') { say('You cannot die in this mode'); break; }
        p.health = 0;
        this.onDeath('kill');
        break;
      case 'clear': p.inventory.clear(); say('Cleared your inventory'); break;
      case 'spawnpoint': p.spawn = { x: p.pos.x, y: p.pos.y, z: p.pos.z }; say('Set your spawn point'); break;
      case 'setworldspawn': this.worldSpawn = { x: p.pos.x, y: p.pos.y, z: p.pos.z }; say('Set the world spawn point'); break;
      case 'difficulty': {
        const i = DIFFICULTIES.indexOf((args[0] || '').toLowerCase());
        if (i < 0) { say('Difficulty is ' + DIFFICULTIES[this.difficulty]); return; }
        this.difficulty = i; say('Set difficulty to ' + DIFFICULTIES[i]);
        break;
      }
      default: say(`Unknown command "${cmd}". Type /help for a list.`, '#f55');
    }
  }

  // ---------------------------------------------------------------- frame
  update(dt, input) {
    const world = this.world;
    if (!world) return;
    const p = this.player;
    const centres = [[p.pos.x, p.pos.z]];
    if (this.net.isHost) for (const rp of this.remotePlayers.values()) if (rp.dim === world.dim) centres.push([rp.pos.x, rp.pos.z]);
    const loading = !this.isReady();
    world.update(centres, this.settings.renderDistance, loading ? 14 : 7);

    if (this.mode === 'menu') {
      this.panoramaAngle += dt * 0.03;
      p.yaw = this.panoramaAngle;
      p.pitch = -0.15;
      this.updateSky(dt, true);
      this.updateCamera(dt);
      return;
    }

    const ready = this.isReady();
    if (ready && this.spawnPending) {
      const bx = Math.floor(p.pos.x), bz = Math.floor(p.pos.z);
      let y = WORLD_HEIGHT - 2;
      while (y > 0 && !isSolid(world.getBlock(bx, y, bz)) && world.getBlock(bx, y, bz) !== B.WATER) y--;
      p.pos.y = y + 1;
      p.vel.set(0, 0, 0);
      p.fallStart = null;
      this.spawnPending = false;
    }

    this.useCooldown = Math.max(0, this.useCooldown - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    if (ready && !p.dead) {
      if (!this.updateRiding(dt)) p.update(dt);
      if (this.world.getBlock(Math.floor(p.pos.x), Math.floor(p.pos.y + 0.5), Math.floor(p.pos.z)) === B.LADDER || this.world.getBlock(Math.floor(p.pos.x), Math.floor(p.pos.y), Math.floor(p.pos.z)) === B.LADDER) this.climb(dt);
      if (input.active) {
        this.updateMining(dt, input.attack);
        this.updateEating(dt, input.use);
        this.updateBow(dt, input.use);
        if (input.use && this.eating <= 0 && this.useCooldown <= 0) this.use();
      } else { this.stopMining(); this.eating = 0; this.updateBow(dt, false); }
      this.updatePortal(dt);
      this.updateEndPortal(dt);
      // Footsteps
      if (p.onGround && !p.sneaking) {
        this.stepDist += Math.hypot(p.vel.x, p.vel.z) * dt;
        if (this.stepDist > 1.8) {
          this.stepDist = 0;
          const under = world.getBlock(Math.floor(p.pos.x), Math.floor(p.pos.y - 0.1), Math.floor(p.pos.z));
          if (under) Sound.step(BLOCKS[under].sound);
        }
      }
      this.pickupItems();
    }
    if (p.dead) this.stopMining();

    // Simulation
    if (this.isAuthority) {
      const before = this.timeOfDay;
      this.timeOfDay = (this.timeOfDay + dt / DAY_LENGTH) % 1;
      if (this.timeOfDay < before) this.dayCount = (this.dayCount || 0) + 1;
      if (ready) this.updateSpawning(dt);
      for (const [id, m] of this.mobs) {
        if (!world.isLoaded(m.pos.x, m.pos.z)) continue;
        m.simulate(dt);
        if (m.dead && m.deathTime > 0.9) {
          if (m.deathTime < 50) this.particles.smoke(m.pos.x, m.pos.y + 0.5, m.pos.z, 6);
          if (m.deathTime < 50 && m.health <= 0) this.onMobKilled(m, null);
          m.dispose(); this.mobs.delete(id);
        }
      }
    } else {
      for (const m of this.mobs.values()) m.follow(dt);
    }
    for (const m of this.mobs.values()) m.render();
    for (const rp of this.remotePlayers.values()) rp.update(dt);

    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (!world.isLoaded(it.pos.x, it.pos.z)) continue;
      it.update(dt);
      if (it.age > 300 || it.pos.y < -40) { it.dispose(); this.items.splice(i, 1); }
    }
    for (let i = this.tnts.length - 1; i >= 0; i--) {
      const t = this.tnts[i];
      t.vel.y -= 20 * dt;
      moveBody(world, t, dt);
      t.fuse -= dt;
      t.mesh.position.set(t.pos.x, t.pos.y + 0.49, t.pos.z);
      const flash = Math.floor(t.fuse * 4) % 2 === 0;
      const l = this.lightAt(t.pos.x, t.pos.y + 0.5, t.pos.z);
      t.mesh.material.color.setRGB(flash ? 2 : l, flash ? 2 : l, flash ? 2 : l);
      if (t.fuse <= 0) {
        this.scene.remove(t.mesh); t.mesh.geometry.dispose(); t.mesh.material.dispose();
        this.tnts.splice(i, 1);
        this.explode(t.pos.x, t.pos.y + 0.5, t.pos.z, 4, true);
      }
    }
    this.simTime += dt;
    if (this.isAuthority) {
      this.redstone.tick(dt);
      this.tickSpawners(dt);
      if (world.dim === 2) {
        this.endTimer = (this.endTimer || 0) - dt;
        if (this.endTimer <= 0) { this.endTimer = 5; this.endFightSetup(); }
      }
    }
    this.weather.tick(dt);
    this.updateOrbs(dt);
    this.updateBoats(dt);
    this.tickFluids();
    this.tickGrowth(dt);
    this.updateVillages(dt);
    this.updateProjectiles(dt);
    this.flushBlocks();
    this.tickFurnaces(dt);
    this.particles.update(dt);
    this.updateSky(dt, false);
    this.updateCamera(dt);
    this.updateTargetOverlay();
    this.updateHand(dt);
    this.sendPresence();
    this.swing = Math.max(0, this.swing - dt * 4);

    this.saveTimer += dt;
    if (this.saveTimer > 15) { this.saveTimer = 0; this.save(); }
  }

  isReady() {
    const p = this.player;
    const c = this.world.getChunk(Math.floor(p.pos.x / CHUNK_SIZE), Math.floor(p.pos.z / CHUNK_SIZE));
    return !!(c && !c.dirty);
  }

  pickupItems() {
    const p = this.player;
    if (p.mode === 'spectator') return;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.pickupDelay > 0) continue;
      const d = Math.hypot(it.pos.x - p.pos.x, (it.pos.y) - (p.pos.y + 0.6), it.pos.z - p.pos.z);
      if (d > 1.6) continue;
      const left = p.inventory.add(it.stack, PICKUP_ORDER);
      if (left === it.stack.count) continue;
      Sound.pop();
      if (left > 0) { it.stack.count = left; continue; }
      it.dispose();
      this.items.splice(i, 1);
    }
  }

  updateSky(dt, menu) {
    const angle = (this.timeOfDay - 0.25) * Math.PI * 2;
    const sunH = Math.sin(angle);
    this.daylight = THREE.MathUtils.clamp(sunH * 2.2 + 0.45, 0.2, 1);
    const sc = this.skyColors;
    sc.current.copy(sc.night).lerp(sc.day, THREE.MathUtils.clamp(sunH * 2 + 0.4, 0, 1));
    sc.current.lerp(sc.dusk, Math.max(0, 1 - Math.abs(sunH) * 4) * 0.45);

    const eye = this.camera.position;
    const dist = 300;
    this.sun.position.set(eye.x + Math.cos(angle) * dist, eye.y + Math.sin(angle) * dist, eye.z + 40);
    this.sun.lookAt(eye);
    this.moon.position.set(eye.x - Math.cos(angle) * dist, eye.y - Math.sin(angle) * dist, eye.z - 40);
    this.moon.lookAt(eye);
    this.stars.position.copy(eye);
    this.starMat.opacity = THREE.MathUtils.clamp(-sunH * 3, 0, 1);
    this.stars.visible = this.starMat.opacity > 0.01;
    this.clouds.position.set(eye.x, 112, eye.z);
    this.cloudTex.offset.set((eye.x / 1536) * 4 + performance.now() / 400000, (-eye.z / 1536) * 4);
    this.cloudMat.color.setScalar(Math.max(0.25, this.daylight));

    let fogColor, near, far;
    const underwater = !menu && this.player.eyeInWater;
    const nether = this.world.dim === 1, end = this.world.dim === 2;
    if (nether || end) this.daylight = 0;
    const wr = this.weather ? this.weather.rain : 0, wt = this.weather ? this.weather.thunder : 0;
    if (!nether && !end) {
      this.daylight *= 1 - wr * 0.3 - wt * 0.25;
      sc.current.lerp(new THREE.Color(0x5d6670).multiplyScalar(Math.max(0.15, this.daylight)), wr * 0.8);
      if (this.weather && this.weather.flash > 0) this.daylight = Math.min(1, this.daylight + this.weather.flash * 0.6);
      this.starMat.opacity *= 1 - wr;
    }
    const vis = !this.hdr && !nether && !end;
    this.cloudMat.color.multiplyScalar(1 - wr * 0.45);
    this.sun.visible = this.moon.visible = this.clouds.visible = vis;
    if (!vis) this.stars.visible = false;
    if (!menu && this.player.eyeInLava) {
      fogColor = new THREE.Color(0.8, 0.25, 0.02);
      near = 0.1; far = 2.5;
    } else if (end && !underwater) {
      fogColor = new THREE.Color(0.07, 0.05, 0.11);
      const fd = this.settings.renderDistance * CHUNK_SIZE;
      near = fd * 0.4; far = fd * 0.95;
    } else if (nether && !underwater) {
      fogColor = new THREE.Color(0.2, 0.03, 0.03);
      const fd = this.settings.renderDistance * CHUNK_SIZE;
      near = 4; far = Math.min(fd * 0.9, 90);
    } else if (underwater) {
      fogColor = sc.water.clone().multiplyScalar(this.daylight);
      near = 0.1; far = 18;
    } else {
      fogColor = sc.current.clone();
      // Darker fog underground so caves don't glow sky-blue
      const l = this.world.getLight(Math.floor(eye.x), Math.floor(eye.y), Math.floor(eye.z));
      const sky = menu ? 15 : l.sky;
      fogColor.multiplyScalar(0.15 + 0.85 * (sky / 15));
      const fd = this.settings.renderDistance * CHUNK_SIZE;
      near = fd * 0.55 * (1 - wr * 0.5); far = fd * 0.95 * (1 - wr * 0.35);
    }
    this.renderer.setClearColor(fogColor);
    for (const m of [this.vanillaMats.solid, this.vanillaMats.water]) {
      m.uniforms.minLight.value = nether ? 0.36 : end ? 0.3 : 0.02;
      m.uniforms.daylight.value = this.daylight;
      m.uniforms.fogColor.value.copy(fogColor);
      m.uniforms.fogNear.value = near;
      m.uniforms.fogFar.value = far;
    }
    this.underwater = underwater;
  }

  updateCamera(dt) {
    const p = this.player;
    const camMode = this.mode === 'play' && this.ui ? this.ui.camMode : 0;
    const bob = p.onGround && this.mode === 'play' && camMode === 0 ? Math.sin(p.bobTime * Math.PI) * 0.04 : 0;
    this.camera.position.set(p.pos.x, p.pos.y + p.eyeHeight + Math.abs(bob), p.pos.z);
    this.camera.rotation.set(p.pitch, p.yaw, 0);
    // Third person (F5): pull the camera back (or in front), stopping at walls.
    if (!this.localModel) {
      this.localModel = buildModel('player');
      this.scene.add(this.localModel.root);
    }
    const lm = this.localModel;
    lm.root.visible = camMode > 0 && p.mode !== 'spectator' && !p.dead;
    if (camMode > 0) {
      const dir = p.lookDir();
      if (camMode === 1) dir.multiplyScalar(-1);
      const eye = this.camera.position.clone();
      const hit = this.world.raycast(eye, dir, 4);
      const dist = hit ? Math.max(0.3, hit.dist - 0.3) : 4;
      this.camera.position.addScaledVector(dir, dist);
      if (camMode === 2) this.camera.rotation.set(-p.pitch, p.yaw + Math.PI, 0);
      lm.root.position.copy(p.pos);
      if (p.sneaking) lm.root.position.y -= 0.15;
      lm.inner.rotation.y = p.yaw + Math.PI;
      lm.parts.body.rotation.x = p.sneaking ? 0.4 : 0;
      animateModel(lm, 'player', p.bobTime * Math.PI, Math.min(1, Math.hypot(p.vel.x, p.vel.z) / 4), 0, p.pitch, this.swing);
      if (p.riding) { lm.parts.legL.rotation.x = lm.parts.legR.rotation.x = -1.4; lm.root.position.y -= 0.45; lm.inner.rotation.y = p.riding.yaw + Math.PI; }
      const l = this.lightAt(p.pos.x, p.pos.y + 1.5, p.pos.z);
      lm.mat.color.setRGB(l, l, l);
    }
    const targetFov = this.settings.fov + (p.sprinting ? 10 : 0) + (p.flying && p.sprinting ? 5 : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 8);
      this.camera.updateProjectionMatrix();
    }
  }

  updateTargetOverlay() {
    const t = this.target();
    const hit = t.block;
    this.outline.visible = !!hit && !this.player.dead;
    if (hit) {
      const b = BLOCKS[hit.id];
      if (b.model === 'cross' || b.model === 'torch') {
        this.outline.scale.set(b.model === 'torch' ? 0.2 : 0.75, b.model === 'torch' ? 0.65 : 0.9, b.model === 'torch' ? 0.2 : 0.75);
        this.outline.position.set(hit.x + 0.5, hit.y + (b.model === 'torch' ? 0.32 : 0.45), hit.z + 0.5);
      } else if (b.shape) {
        // Outline the shape's bounding box (slabs, stairs, fences...)
        const get = (dx, dy, dz) => this.world.getBlock(hit.x + dx, hit.y + dy, hit.z + dz);
        const lo = [1, 1, 1], hi = [0, 0, 0];
        for (const bx of b.shape(get, this.world.getData(hit.x, hit.y, hit.z), hit.id)) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], bx[i]); hi[i] = Math.max(hi[i], bx[i + 3]); }
        this.outline.scale.set(Math.max(0.02, hi[0] - lo[0]), Math.max(0.02, hi[1] - lo[1]), Math.max(0.02, hi[2] - lo[2]));
        this.outline.position.set(hit.x + (lo[0] + hi[0]) / 2, hit.y + (lo[1] + hi[1]) / 2, hit.z + (lo[2] + hi[2]) / 2);
      } else {
        this.outline.scale.set(1, 1, 1);
        this.outline.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      }
    }
    this.targetInfo = t;
    // Crack overlay
    const stage = this.mining ? Math.min(9, Math.floor(this.mining.progress * 10)) : -1;
    if (stage < 0) {
      if (this.crackMesh) this.crackMesh.visible = false;
      this.crackStage = -1;
      return;
    }
    if (stage !== this.crackStage) {
      this.crackStage = stage;
      if (this.crackMesh) { this.scene.remove(this.crackMesh); this.crackMesh.geometry.dispose(); }
      const g = new THREE.BoxGeometry(1.002, 1.002, 1.002);
      const [u0, v0, u1, v1] = tileUV(T.CRACK0 + stage);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
      this.crackMesh = new THREE.Mesh(g, this.crackMat);
      this.scene.add(this.crackMesh);
    }
    this.crackMesh.visible = true;
    this.crackMesh.position.set(this.mining.x + 0.5, this.mining.y + 0.5, this.mining.z + 0.5);
  }

  updateHand(dt) {
    const p = this.player;
    const held = p.heldStack;
    const id = held ? held.id : 0;
    if (id !== this.handId) {
      if (this.handMesh) { this.handScene.remove(this.handMesh); this.handMesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
      if (!id) {
        const skin = skinTexture('player');
        const mat = new THREE.MeshBasicMaterial({ map: skin.tex });
        const arm = new THREE.Mesh(skinBox(4, 12, 4, 40, 16, skin.w, skin.h), mat);
        this.handMesh = new THREE.Group();
        arm.rotation.set(Math.PI / 2 - 0.35, 0, 0.25);
        this.handMesh.add(arm);
        this.handMesh.userData.arm = true;
      } else if (isCubeItem(id)) {
        this.handMesh = new THREE.Mesh(blockGeometry(id, 0.4), this.entityMat.clone());
      } else {
        this.handMesh = new THREE.Mesh(itemGeometry(id, 0.42), this.entityMat.clone());
        this.handMesh.userData.flat = true;
      }
      this.handScene.add(this.handMesh);
      this.handId = id;
    }
    const s = Math.sin(this.swing * Math.PI);
    const bob = p.bobTime * Math.PI;
    const m = this.handMesh;
    m.visible = p.mode !== 'spectator' && !p.dead;
    let x = 0.52 + Math.cos(bob) * 0.015 - s * 0.25, y = -0.5 + Math.abs(Math.sin(bob)) * 0.025 + s * 0.12, z = -0.85 - s * 0.15;
    if (this.eating > 0) { x = 0.25; y = -0.38 + Math.abs(Math.sin(this.eating * 18)) * 0.04; z = -0.6; }
    if (m.userData.arm) { m.position.set(x + 0.08, y - 0.12, z + 0.1); m.rotation.set(-s * 0.8, 0.15 - s * 0.3, 0); }
    else if (m.userData.flat) {
      const draw = this.bowCharge > 0 ? this.bowCharge : 0;
      m.position.set(x - 0.02 - draw * 0.2, y + 0.12 + draw * 0.1, z - 0.05 + draw * 0.15);
      m.rotation.set(-s * 1.0, -0.6 + draw * 0.5, 0.1 - draw * 0.3);
    }
    else { m.position.set(x, y, z); m.rotation.set(0.1 - s * 0.6, 0.75, 0); }
    const l = this.lightAt(p.pos.x, p.pos.y + 1.6, p.pos.z);
    m.traverse((o) => { if (o.material) o.material.color.setRGB(l, l, l); });
  }

  render(dt = 0.016) {
    const r = this.renderer;
    if (this.hdr && this.world) {
      this.halcyon.updateFrame(this, dt);
      this._hdrDefines(this.scene);
      this._hdrDefines(this.handScene);
      this.halcyon.render(this);
      return;
    }
    r.setRenderTarget(null);
    r.clear();
    r.render(this.scene, this.camera);
    if (this.mode === 'play' && (!this.ui || this.ui.camMode === 0)) {
      r.clearDepth();
      r.render(this.handScene, this.handCamera);
    }
  }

  resize(w, h) {
    this.camera.aspect = this.handCamera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.handCamera.updateProjectionMatrix();
  }
}

// ---------------------------------------------------------------- world storage
const WorldStore = {
  INDEX: 'webcraft-worlds-v2',
  list() {
    try { return JSON.parse(localStorage.getItem(this.INDEX)) || []; } catch (e) { return []; }
  },
  load(id) {
    try { return JSON.parse(localStorage.getItem('webcraft-world-' + id)); } catch (e) { return null; }
  },
  save(id, name, data, mode) {
    try {
      localStorage.setItem('webcraft-world-' + id, JSON.stringify(data));
      const list = this.list().filter((w) => w.id !== id);
      list.unshift({ id, name, mode, hardcore: data.hardcore, seed: data.seed, last: Date.now() });
      localStorage.setItem(this.INDEX, JSON.stringify(list));
      return true;
    } catch (e) { return false; }
  },
  remove(id) {
    try {
      localStorage.removeItem('webcraft-world-' + id);
      localStorage.setItem(this.INDEX, JSON.stringify(this.list().filter((w) => w.id !== id)));
    } catch (e) { /* ignore */ }
  },
};
