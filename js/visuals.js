// Presentation polish: a live 3D player in the inventory, natural body/head motion and
// poses, dynamic light from held torches, camera feel (hurt tilt, shake, landing dip),
// items that fly into you when picked up, soft blob shadows, a vignette and crit sparks.
'use strict';

const wrapAngle = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

// ---------------------------------------------------------------- poses for humanoid models
// state: { yaw, pitch, walkPhase, walkAmount, swing, sneak, sprint, air, vy, dt }
function poseHuman(model, st) {
  const P = model.parts, S = MODEL_SCALE;
  if (!model.base) {
    model.base = {};
    for (const k of ['head', 'armL', 'armR', 'body', 'legL', 'legR']) model.base[k] = P[k].position.clone();
    model.bodyYaw = st.yaw;
  }
  // The body only turns with the head when walking, or when the head turns past 50 degrees
  const diff = wrapAngle(st.yaw - model.bodyYaw);
  if (st.walkAmount > 0.1) model.bodyYaw += diff * Math.min(1, st.dt * 9);
  else if (Math.abs(diff) > 0.87) model.bodyYaw += diff - Math.sign(diff) * 0.87;
  model.bodyYaw = wrapAngle(model.bodyYaw);
  model.inner.rotation.y = model.bodyYaw + Math.PI;
  const headYaw = wrapAngle(st.yaw - model.bodyYaw);
  animateModel(model, 'player', st.walkPhase, st.walkAmount, headYaw, st.pitch, st.swing);
  // reset to rest, then lean for sneaking / sprinting
  for (const k in model.base) P[k].position.copy(model.base[k]);
  const lean = st.sneak ? 0.5 : st.sprint ? 0.12 : 0;
  model.lean = (model.lean || 0) + (lean - (model.lean || 0)) * Math.min(1, st.dt * 12);
  const L = model.lean;
  P.body.rotation.x = L;
  const fwd = Math.sin(L) * 10 * S, down = (1 - Math.cos(L)) * 10 * S;
  for (const k of ['head', 'armL', 'armR']) { P[k].position.z += fwd; P[k].position.y -= down; }
  if (st.sneak) { P.legL.position.z -= 1.5 * S; P.legR.position.z -= 1.5 * S; P.armL.rotation.x += 0.25; P.armR.rotation.x += 0.25; }
  // arms lift a little while falling
  if (st.air && st.vy < -6) { const f = Math.min(1, (-st.vy - 6) / 20); P.armL.rotation.z -= f * 0.6; P.armR.rotation.z += f * 0.6; }
}

// ---------------------------------------------------------------- 3D player in the inventory
const Preview = {
  renderer: null, scene: null, camera: null, model: null, mouse: { x: 0, y: 0 }, running: false,
  ensure() {
    if (this.renderer) return;
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(92, 96);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.domElement.className = 'pp-img pp-3d';
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 92 / 96, 0.1, 20);
    this.camera.position.set(0, 1.0, 4.0);
    this.camera.lookAt(0, 0.93, 0);
    this.model = buildModel('player');
    this.scene.add(this.model.root);
    document.addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
  },
  element(game) {
    this.ensure();
    this.game = game;
    if (!this.running) { this.running = true; requestAnimationFrame(() => this.loop()); }
    return this.renderer.domElement;
  },
  loop() {
    const el = this.renderer.domElement;
    if (!el.isConnected) { this.running = false; return; }
    requestAnimationFrame(() => this.loop());
    const g = this.game, p = g.player, m = this.model;
    setModelArmor(m, p.armor.slots.map((s) => (s ? s.id : 0)));
    setModelHeld(m, p.heldStack ? p.heldStack.id : 0, g.entityMat);
    // look toward the mouse, like the inventory player in Minecraft
    const r = el.getBoundingClientRect();
    const dx = (this.mouse.x - (r.left + r.width / 2)) / 120, dy = (this.mouse.y - (r.top + r.height * 0.2)) / 120;
    const yaw = -Math.atan(dx) * 0.9, pitch = -Math.atan(dy) * 0.6;
    m.inner.rotation.y = yaw * 0.45;
    animateModel(m, 'player', 0, 0, yaw * 0.55, pitch, 0);
    this.renderer.render(this.scene, this.camera);
  },
};
UI.prototype.playerPreview = function () { return Preview.element(this.game); };

// ---------------------------------------------------------------- per-frame polish
{
  const P = Game.prototype;

  // Third-person local model and other players use the natural poses
  const updateCamera = P.updateCamera;
  P.updateCamera = function (dt) {
    updateCamera.call(this, dt);
    const p = this.player, lm = this.localModel;
    if (lm && lm.root.visible) {
      poseHuman(lm, { yaw: p.yaw, pitch: p.pitch, walkPhase: p.bobTime * Math.PI, walkAmount: Math.min(1, Math.hypot(p.vel.x, p.vel.z) / 4), swing: this.swing, sneak: p.sneaking, sprint: p.sprinting, air: !p.onGround && !p.flying, vy: p.vel.y, dt });
      if (p.riding) { lm.parts.legL.rotation.x = lm.parts.legR.rotation.x = -1.4; }
      lm.root.position.copy(p.pos);
      if (p.riding) lm.root.position.y -= 0.45;
      blobShadow(this, lm, p.pos, 0.36);
    } else if (lm && lm.shadow) lm.shadow.visible = false;
    this.cameraFx(dt);
  };

  // Camera feel: hurt tilt, explosion shake, landing dip
  P.cameraFx = function (dt) {
    const p = this.player, cam = this.camera;
    if (this.mode !== 'play' || !p) return;
    const fx = this.fx || (this.fx = { hurt: 0, hurtDir: 1, shake: 0, dip: 0, lastHealth: p.health, wasGround: true, fallV: 0 });
    if (p.health < fx.lastHealth - 0.01 && !p.dead) { fx.hurt = 1; fx.hurtDir = Math.random() < 0.5 ? -1 : 1; }
    fx.lastHealth = p.health;
    if (!p.onGround) fx.fallV = Math.min(fx.fallV, p.vel.y);
    if (p.onGround && !fx.wasGround && fx.fallV < -10 && !p.flying) fx.dip = Math.min(1, (-fx.fallV - 10) / 18) * 0.12;
    if (p.onGround) fx.fallV = 0;
    fx.wasGround = p.onGround;
    fx.hurt = Math.max(0, fx.hurt - dt * 2.4);
    fx.shake = Math.max(0, fx.shake - dt * 1.8);
    fx.dip = Math.max(0, fx.dip - dt * 0.6);
    const camMode = this.ui ? this.ui.camMode : 0;
    if (camMode !== 0) return;
    // Minecraft's hurt tilt: a quick roll that eases back
    const h = Math.sin(fx.hurt * fx.hurt * Math.PI);
    cam.rotation.z += h * 0.22 * fx.hurtDir;
    if (fx.shake > 0) {
      const a = fx.shake * fx.shake * 0.12, t = performance.now() / 1000;
      cam.position.x += Math.sin(t * 61) * a; cam.position.y += Math.sin(t * 53 + 1) * a; cam.position.z += Math.sin(t * 47 + 2) * a;
      cam.rotation.z += Math.sin(t * 37) * a * 0.3;
    }
    cam.position.y -= Math.sin(Math.min(1, fx.dip / 0.12) * Math.PI) * fx.dip;
  };

  // Explosions shake the camera by distance
  const boom = P.explosionEffects;
  P.explosionEffects = function (x, y, z, power, authority) {
    boom.call(this, x, y, z, power, authority);
    if (!this.player) return;
    const d = this.player.pos.distanceTo(new THREE.Vector3(x, y, z));
    const fx = this.fx || (this.fx = { hurt: 0, hurtDir: 1, shake: 0, dip: 0, lastHealth: this.player.health, wasGround: true, fallV: 0 });
    fx.shake = Math.max(fx.shake, Math.min(1, power / 4 * Math.max(0, 1 - d / 40)));
  };

  // Light from what you're holding (torches, glowstone, lava, lanterns...)
  P.heldLightLevel = function () {
    const p = this.player, s = p && p.heldStack;
    if (!s || p.mode === 'spectator' || p.dead) return 0;
    if (s.id === ITEM.LAVA_BUCKET) return 15;
    if (s.id < 256 && BLOCKS[s.id] && BLOCKS[s.id].light) return BLOCKS[s.id].light;
    const it = ITEMS[s.id];
    if (it && it.block !== null && BLOCKS[it.block] && BLOCKS[it.block].light) return BLOCKS[it.block].light;
    return 0;
  };
  const update = P.update;
  P.update = function (dt, input) {
    update.call(this, dt, input);
    if (!this.player || !this.world) return;
    const lvl = this.mode === 'play' ? this.heldLightLevel() : 0;
    this.heldLight = (this.heldLight || 0) + (lvl - (this.heldLight || 0)) * Math.min(1, dt * 10);
    const pos = this.player.pos;
    const v = [pos.x, pos.y + 1.2, pos.z, this.heldLight > 0.2 ? this.heldLight : 0];
    for (const m of [this.vanillaMats.solid, this.vanillaMats.water]) m.uniforms.heldLight.value.set(...v);
    if (this.halcyon) this.halcyon.u.heldLight.value.set(...v);
    this.updateCollecting(dt);
    this.updateVignette(dt);
  };
  // Entities near you are lit by it too
  const lightAt = P.lightAt;
  P.lightAt = function (x, y, z) {
    const base = lightAt.call(this, x, y, z);
    if (!this.heldLight || this.heldLight < 0.2 || !this.player) return base;
    const p = this.player.pos;
    const d = Math.hypot(x - p.x, y - p.y - 1.2, z - p.z);
    const lvl = Math.max(0, this.heldLight - d);
    if (lvl <= 0) return base;
    const held = this.hdr ? this.halcyon.entityLight(0, lvl) : LIGHT_CURVE[Math.round(lvl)];
    return Math.max(base, held);
  };

  // Items fly into you instead of vanishing
  P.pickupItems = function () {
    const p = this.player;
    if (p.mode === 'spectator') return;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.pickupDelay > 0) continue;
      const d = Math.hypot(it.pos.x - p.pos.x, it.pos.y - (p.pos.y + 0.6), it.pos.z - p.pos.z);
      if (d > 1.6) continue;
      const before = it.stack.count;
      const left = p.inventory.add(it.stack, PICKUP_ORDER);
      if (left === before) continue;
      Sound.pop();
      if (left > 0) { it.stack.count = left; continue; }
      this.items.splice(i, 1);
      (this.collecting || (this.collecting = [])).push({ it, t: 0, from: it.mesh.position.clone() });
    }
  };
  P.updateCollecting = function (dt) {
    const list = this.collecting;
    if (!list || !list.length) return;
    const p = this.player.pos;
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i];
      c.t += dt / 0.14;
      const to = new THREE.Vector3(p.x, p.y + 0.9, p.z);
      c.it.mesh.position.lerpVectors(c.from, to, Math.min(1, c.t * c.t));
      if (c.it.shadow) c.it.shadow.visible = false;
      if (c.t >= 1) { c.it.dispose(); list.splice(i, 1); }
    }
  };

  // Low health: a pulsing red vignette
  P.updateVignette = function (dt) {
    const el = document.getElementById('vignette');
    if (!el) return;
    const p = this.player;
    const on = this.mode === 'play' && p && p.usesHealth && !p.dead && p.health <= 6;
    const pulse = on ? (0.35 + 0.25 * Math.sin(performance.now() / 260)) * (1 - p.health / 8) : 0;
    el.style.setProperty('--hurt', pulse.toFixed(3));
  };

  // Critical hits throw sparks
  const attack = P.attackEntity;
  P.attackEntity = function (ent) {
    const p = this.player;
    const crit = p.vel.y < -0.5 && !p.onGround && !p.inWater && this.attackCooldown <= 0;
    attack.call(this, ent);
    if (crit && ent && ent.pos) this.particles.crit(ent.pos.x, ent.pos.y + (ent.h || 1.8) * 0.6, ent.pos.z);
  };
}

// ---------------------------------------------------------------- blob shadows
let SHADOW_TEX = null;
function shadowTexture() {
  if (SHADOW_TEX) return SHADOW_TEX;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 31);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.6, 'rgba(0,0,0,0.32)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  SHADOW_TEX = new THREE.CanvasTexture(c);
  return SHADOW_TEX;
}
function blobShadow(game, owner, pos, radius) {
  if (!owner.shadow) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 1;
    game.scene.add(m);
    owner.shadow = m;
  }
  const w = game.world, sh = owner.shadow;
  const x = Math.floor(pos.x), z = Math.floor(pos.z);
  let y = Math.floor(pos.y + 0.01);
  const top = y;
  while (y > top - 5 && !isSolid(w.getBlock(x, y - 1, z))) y--;
  const h = pos.y - y;
  if (y <= top - 5 || h > 4.5) { sh.visible = false; return; }
  sh.visible = true;
  const k = Math.max(0, 1 - h / 4.5);
  sh.position.set(pos.x, y + 0.015, pos.z);
  sh.scale.setScalar(radius * 2 * (0.6 + 0.4 * k));
  sh.material.opacity = k;
}
function dropShadow(game, owner) {
  if (!owner.shadow) return;
  game.scene.remove(owner.shadow);
  owner.shadow.geometry.dispose(); owner.shadow.material.dispose();
  owner.shadow = null;
}
{
  const render = Mob.prototype.render;
  Mob.prototype.render = function () {
    render.call(this);
    if (this.info.flying && this.type !== 'blaze') { if (this.shadow) this.shadow.visible = false; return; }
    blobShadow(this.game, this, this.pos, Math.max(0.3, Math.min(1.6, (this.w || 0.6) * 0.75)));
    if (this.dead && this.shadow) this.shadow.material.opacity *= Math.max(0, 1 - this.deathTime);
  };
  const dispose = Mob.prototype.dispose;
  Mob.prototype.dispose = function () { dropShadow(this.game, this); dispose.call(this); };

  const rpUpdate = RemotePlayer.prototype.update;
  RemotePlayer.prototype.update = function (dt) {
    rpUpdate.call(this, dt);
    const m = this.model;
    if (!m.root.visible) { if (this.shadow) this.shadow.visible = false; return; }
    poseHuman(m, { yaw: this.yaw, pitch: this.pitch, walkPhase: this.walkPhase, walkAmount: this.walkAmount, swing: this.swing, sneak: this.sneak, sprint: this.walkAmount > 0.95, air: false, vy: 0, dt });
    blobShadow(this.game, this, this.pos, 0.36);
  };
  const rpDispose = RemotePlayer.prototype.dispose;
  RemotePlayer.prototype.dispose = function () { dropShadow(this.game, this); rpDispose.call(this); };

  const itUpdate = ItemEntity.prototype.update;
  ItemEntity.prototype.update = function (dt) {
    itUpdate.call(this, dt);
    blobShadow(this.game, this, this.pos, 0.22);
  };
  const itDispose = ItemEntity.prototype.dispose;
  ItemEntity.prototype.dispose = function () { dropShadow(this.game, this); itDispose.call(this); };
}

// ---------------------------------------------------------------- crit sparks
Particles.prototype.crit = function (x, y, z) {
  const geo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const shared = { mat, refs: 14, geo };
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x + (Math.random() - 0.5) * 0.6, y + (Math.random() - 0.5) * 0.8, z + (Math.random() - 0.5) * 0.6);
    this.game.scene.add(m);
    this.list.push({ mesh: m, life: 0.35 + Math.random() * 0.3, vel: new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6), smoke: true, shared });
  }
};
