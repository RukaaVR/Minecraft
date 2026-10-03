// Weather: rain (snow in cold biomes), thunderstorms with lightning.
'use strict';

class Weather {
  constructor(game) {
    this.game = game;
    this.raining = false;
    this.thundering = false;
    this.rain = 0;          // smoothed 0..1
    this.thunder = 0;
    this.timer = 300 + Math.random() * 600;
    this.flash = 0;
    this.boltTimer = 10;
    this.bolt = null;
    const N = 1400;
    this.N = N;
    this.drops = new Float32Array(N * 4); // x, y, z, speed
    this.geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(N * 2 * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.mat = new THREE.LineBasicMaterial({ color: 0x9bb4d8, transparent: true, opacity: 0.55, depthWrite: false });
    this.lines = new THREE.LineSegments(this.geo, this.mat);
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    game.scene.add(this.lines);
    this.colTop = new Map();
    this.colTimer = 0;
    this.seeded = false;
  }

  // Authority advances the weather cycle; others take it from the host's presence.
  tick(dt) {
    const g = this.game;
    if (g.isAuthority && g.world && g.world.dim === 0) {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.raining) { this.raining = false; this.thundering = false; this.timer = 600 + Math.random() * 900; }
        else { this.raining = true; this.thundering = Math.random() < 0.3; this.timer = 300 + Math.random() * 400; }
      }
    }
    const want = g.world && g.world.dim === 0 && this.raining ? 1 : 0;
    this.rain += (want - this.rain) * Math.min(1, dt * 0.3);
    this.thunder += ((want && this.thundering ? 1 : 0) - this.thunder) * Math.min(1, dt * 0.3);
    this.flash = Math.max(0, this.flash - dt * 3);
    if (this.thunder > 0.5) {
      this.boltTimer -= dt;
      if (this.boltTimer <= 0) { this.boltTimer = 6 + Math.random() * 18; this.strike(); }
    }
    if (this.bolt) {
      this.bolt.life -= dt;
      if (this.bolt.life <= 0) { g.scene.remove(this.bolt.mesh); this.bolt.mesh.geometry.dispose(); this.bolt = null; }
    }
    this.updateDrops(dt);
    if (this.rain > 0.05 && Math.random() < dt * 4 * this.rain) Sound.noise(5000 + Math.random() * 3000, 0.4, 0.08, 0.04 * this.rain, 'highpass');
  }

  set(kind) {
    this.raining = kind !== 'clear';
    this.thundering = kind === 'thunder';
    this.timer = 300 + Math.random() * 600;
  }

  strike() {
    const g = this.game, p = g.player;
    const a = Math.random() * Math.PI * 2, d = 10 + Math.random() * 70;
    const x = Math.floor(p.pos.x + Math.cos(a) * d), z = Math.floor(p.pos.z + Math.sin(a) * d);
    if (!g.world.isLoaded(x, z)) return;
    const y = g.world.surfaceY(x, z) + 1;
    const pts = [];
    let cx = x + 0.5, cz = z + 0.5;
    for (let yy = y + 90; yy > y; yy -= 4) {
      pts.push(cx, yy, cz);
      cx += (Math.random() - 0.5) * 3; cz += (Math.random() - 0.5) * 3;
      pts.push(cx, yy - 4, cz);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const mesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xeef4ff }));
    g.scene.add(mesh);
    this.bolt = { mesh, life: 0.25 };
    this.flash = 1;
    const dist = Math.hypot(x - p.pos.x, z - p.pos.z);
    setTimeout(() => { Sound.noise(90, 0.3, 2.5, 1.0, 'lowpass'); Sound.noise(400, 0.5, 0.6, 0.5); }, Math.min(3000, dist * 3));
    if (dist < 3) p.damage(5, 'lightning');
    for (const m of g.mobs.values()) {
      if (Math.hypot(m.pos.x - x, m.pos.z - z) < 3 && g.isAuthority) {
        if (m.type === 'pig' || m.type === 'villager') m.hurt(20, 0, 0, 'env');
        else if (m.type === 'creeper') m.charged = true;
      }
    }
  }

  // Columns are rechecked twice a second to find where rain stops (roofs, trees)
  topAt(x, z) {
    const k = x + ',' + z;
    let t = this.colTop.get(k);
    if (t === undefined) { t = this.game.world.surfaceY(x, z) + 1; this.colTop.set(k, t); }
    return t;
  }

  updateDrops(dt) {
    const g = this.game;
    const on = this.rain > 0.02 && g.world && g.world.dim === 0;
    this.lines.visible = on;
    if (!on) return;
    this.colTimer -= dt;
    if (this.colTimer <= 0) { this.colTimer = 0.5; this.colTop.clear(); }
    const cam = g.camera.position;
    const biome = g.world.columnInfo(Math.floor(cam.x), Math.floor(cam.z));
    const snow = biome.biome === 'snowy' || biome.height > 78;
    const dry = biome.desert;
    this.lines.visible = !dry;
    if (dry) return;
    this.mat.color.set(snow ? 0xffffff : 0x9bb4d8);
    this.mat.opacity = (snow ? 0.9 : 0.5) * this.rain;
    const n = Math.floor(this.N * this.rain);
    const D = this.drops, P = this.positions;
    for (let i = 0; i < this.N; i++) {
      const o = i * 4;
      if (!this.seeded || D[o + 1] < cam.y - 20 || Math.abs(D[o] - cam.x) > 18 || Math.abs(D[o + 2] - cam.z) > 18) {
        D[o] = cam.x + (Math.random() - 0.5) * 36;
        D[o + 2] = cam.z + (Math.random() - 0.5) * 36;
        D[o + 1] = cam.y + 8 + Math.random() * 20;
        D[o + 3] = snow ? 2 + Math.random() : 18 + Math.random() * 6;
      }
      D[o + 1] -= D[o + 3] * dt;
      if (snow) { D[o] += Math.sin(D[o + 1] * 0.7 + i) * dt * 0.6; }
      const top = this.topAt(Math.floor(D[o]), Math.floor(D[o + 2]));
      const visible = i < n && D[o + 1] > top;
      if (D[o + 1] < top) D[o + 1] = cam.y - 30; // respawn next frame
      const len = snow ? 0.12 : 0.7;
      const v = i * 6;
      if (visible) {
        P[v] = D[o]; P[v + 1] = D[o + 1]; P[v + 2] = D[o + 2];
        P[v + 3] = D[o] + (snow ? 0.08 : 0); P[v + 4] = D[o + 1] + len; P[v + 5] = D[o + 2];
      } else {
        P[v] = P[v + 3] = 0; P[v + 1] = P[v + 4] = -1000; P[v + 2] = P[v + 5] = 0;
      }
    }
    this.seeded = true;
    this.geo.attributes.position.needsUpdate = true;
  }
}
