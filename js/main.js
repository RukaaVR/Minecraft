// Game bootstrap: rendering, sky, UI, input and saving.
'use strict';

(function () {
  const SAVE_KEY = 'webcraft-save-v1';
  const DAY_LENGTH = 20 * 60; // seconds for a full day/night cycle
  const REACH = 6;

  // ---------------------------------------------------------------- renderer
  THREE.ColorManagement.enabled = false;
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.autoClear = false;
  document.getElementById('game').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 1000);
  camera.rotation.order = 'YXZ';
  scene.fog = new THREE.Fog(0x87ceeb, 50, 120);

  const atlasCanvas = buildAtlas();
  const atlas = new THREE.CanvasTexture(atlasCanvas);
  atlas.magFilter = THREE.NearestFilter;
  atlas.minFilter = THREE.NearestFilter;
  atlas.generateMipmaps = false;

  const materials = {
    solid: new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5 }),
    water: new THREE.MeshBasicMaterial({
      map: atlas, vertexColors: true, transparent: true, opacity: 0.72,
      depthWrite: false, side: THREE.DoubleSide,
    }),
  };

  // ---------------------------------------------------------------- settings
  const settings = { renderDistance: 6, sensitivity: 1 };
  try {
    Object.assign(settings, JSON.parse(localStorage.getItem('webcraft-settings') || '{}'));
  } catch (e) { /* ignore */ }
  const saveSettings = () => {
    try { localStorage.setItem('webcraft-settings', JSON.stringify(settings)); } catch (e) { /* ignore */ }
  };

  // ---------------------------------------------------------------- world state
  let world, player;
  let timeOfDay = 0.3; // 0 = midnight, 0.25 = sunrise, 0.5 = noon
  let spawnPending = true;
  const hotbar = [B.GRASS, B.DIRT, B.STONE, B.COBBLE, B.PLANKS, B.LOG, B.GLASS, B.BRICK, B.LEAVES];
  let selected = 0;

  function findSpawn(w) {
    for (let r = 0; r < 400; r += 8) {
      for (let a = 0; a < 8; a++) {
        const x = Math.round(Math.cos(a / 8 * Math.PI * 2) * r);
        const z = Math.round(Math.sin(a / 8 * Math.PI * 2) * r);
        const info = w.columnInfo(x, z);
        if (info.height > SEA_LEVEL + 1 && info.height < 70) return { x: x + 0.5, z: z + 0.5, y: info.height + 2 };
      }
    }
    return { x: 0.5, z: 0.5, y: 90 };
  }

  function clearWorld() {
    if (!world) return;
    for (const chunk of [...world.chunks.values()]) world.unloadChunk(chunk);
  }

  function newWorld(seed) {
    clearWorld();
    world = new World(scene, seed, materials);
    player = new Player(world);
    const s = findSpawn(world);
    player.pos.set(s.x, s.y, s.z);
    timeOfDay = 0.3;
    spawnPending = true;
    saveGame();
  }

  function loadGame() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { data = null; }
    if (!data || typeof data.seed !== 'number') return false;
    clearWorld();
    world = new World(scene, data.seed, materials);
    world.loadEdits(data.edits);
    player = new Player(world);
    const p = data.player || {};
    player.pos.set(p.x ?? 0.5, p.y ?? 90, p.z ?? 0.5);
    player.yaw = p.yaw || 0;
    player.pitch = p.pitch || 0;
    player.flying = !!p.flying;
    timeOfDay = data.time ?? 0.3;
    if (Array.isArray(data.hotbar) && data.hotbar.length === 9) {
      data.hotbar.forEach((id, i) => { if (BLOCKS[id] && id !== B.AIR) hotbar[i] = id; });
    }
    spawnPending = false;
    return true;
  }

  function saveGame() {
    if (!world) return;
    const data = {
      seed: world.seed,
      edits: world.serializeEdits(),
      player: {
        x: player.pos.x, y: player.pos.y, z: player.pos.z,
        yaw: player.yaw, pitch: player.pitch, flying: player.flying,
      },
      time: timeOfDay,
      hotbar,
    };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* storage full / blocked */ }
  }

  // ---------------------------------------------------------------- sky
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0, fog: false });
  const moonMat = new THREE.MeshBasicMaterial({ color: 0xdde4f0, fog: false });
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), sunMat);
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), moonMat);
  scene.add(sun, moon);

  // Stars
  const starGeo = new THREE.BufferGeometry();
  const starPos = [];
  const starRand = mulberry32(12345);
  for (let i = 0; i < 900; i++) {
    const u = starRand() * 2 - 1, th = starRand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    starPos.push(s * Math.cos(th) * 400, Math.abs(u) * 400, s * Math.sin(th) * 400);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // Blocky clouds from a pixel noise texture.
  const cloudCanvas = document.createElement('canvas');
  cloudCanvas.width = cloudCanvas.height = 64;
  {
    const ctx = cloudCanvas.getContext('2d');
    const cn = new SimplexNoise(99);
    const img = ctx.createImageData(64, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      // Tileable noise by sampling on a torus.
      const ax = x / 64 * Math.PI * 2, ay = y / 64 * Math.PI * 2;
      const v = cn.noise3D(Math.cos(ax) * 1.6, Math.sin(ax) * 1.6 + Math.cos(ay) * 1.6, Math.sin(ay) * 1.6);
      const i = (y * 64 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = v > 0.15 ? 220 : 0;
    }
    ctx.putImageData(img, 0, 0);
  }
  const cloudTex = new THREE.CanvasTexture(cloudCanvas);
  cloudTex.magFilter = THREE.NearestFilter;
  cloudTex.minFilter = THREE.NearestFilter;
  cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping;
  cloudTex.repeat.set(4, 4);
  const cloudMat = new THREE.MeshBasicMaterial({
    map: cloudTex, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, opacity: 0.85,
  });
  const clouds = new THREE.Mesh(new THREE.PlaneGeometry(1536, 1536), cloudMat);
  clouds.rotation.x = -Math.PI / 2;
  clouds.renderOrder = 2;
  scene.add(clouds);

  const daySky = new THREE.Color(0x87ceeb);
  const nightSky = new THREE.Color(0x070b1d);
  const duskSky = new THREE.Color(0xf08a4b);
  const waterFog = new THREE.Color(0x1d3f8f);
  const skyColor = new THREE.Color();

  function updateSky(dt) {
    timeOfDay = (timeOfDay + dt / DAY_LENGTH) % 1;
    const angle = (timeOfDay - 0.25) * Math.PI * 2; // 0 at sunrise
    const sunH = Math.sin(angle);
    const daylight = THREE.MathUtils.clamp(sunH * 2.2 + 0.45, 0.18, 1);

    skyColor.copy(nightSky).lerp(daySky, THREE.MathUtils.clamp(sunH * 2 + 0.4, 0, 1));
    const dusk = Math.max(0, 1 - Math.abs(sunH) * 4);
    skyColor.lerp(duskSky, dusk * 0.45);

    const eye = camera.position;
    const dist = 300;
    sun.position.set(eye.x + Math.cos(angle) * dist, eye.y + Math.sin(angle) * dist, eye.z + 40);
    sun.lookAt(eye);
    moon.position.set(eye.x - Math.cos(angle) * dist, eye.y - Math.sin(angle) * dist, eye.z - 40);
    moon.lookAt(eye);
    stars.position.copy(eye);
    starMat.opacity = THREE.MathUtils.clamp(-sunH * 3, 0, 1);
    stars.visible = starMat.opacity > 0.01;

    clouds.position.set(eye.x, 112, eye.z);
    cloudTex.offset.set((eye.x / 1536) * 4 + performance.now() / 400000, (-eye.z / 1536) * 4);
    cloudMat.color.setScalar(Math.max(0.25, daylight));

    const c = daylight;
    materials.solid.color.setRGB(c, c, c);
    materials.water.color.setRGB(c, c, c);

    if (player.eyeInWater) {
      scene.background = waterFog.clone().multiplyScalar(c);
      scene.fog.color.copy(scene.background);
      scene.fog.near = 0.1;
      scene.fog.far = 18;
    } else {
      scene.background = skyColor.clone();
      scene.fog.color.copy(skyColor);
      const far = settings.renderDistance * CHUNK_SIZE;
      scene.fog.near = far * 0.55;
      scene.fog.far = far * 0.95;
    }
    document.getElementById('underwater').style.display = player.eyeInWater ? 'block' : 'none';
  }

  // ---------------------------------------------------------------- block helpers
  function blockGeometry(id, size = 1, uvRegion = null) {
    const pos = [], uv = [], col = [], idx = [];
    const b = BLOCKS[id];
    FACES.forEach((face) => {
      const tile = face.dir[1] === 1 ? 0 : face.dir[1] === -1 ? 1 : 2;
      let [u0, v0, u1, v1] = tileUV(b.tiles[tile]);
      if (uvRegion) {
        const du = (u1 - u0), dv = (v1 - v0);
        u0 += du * uvRegion[0]; v0 += dv * uvRegion[1];
        u1 = u0 + du * uvRegion[2]; v1 = v0 + dv * uvRegion[2];
      }
      const base = pos.length / 3;
      for (const c of face.corners) {
        pos.push((c[0] - 0.5) * size, (c[1] - 0.5) * size, (c[2] - 0.5) * size);
        uv.push(c[3] ? u1 : u0, c[4] ? v1 : v0);
        col.push(face.shade, face.shade, face.shade);
      }
      idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    return g;
  }

  // Selection outline
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
    new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 })
  );
  outline.visible = false;
  scene.add(outline);

  // Break particles
  const particles = [];
  const particleMat = new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5 });
  function spawnParticles(x, y, z, id) {
    for (let i = 0; i < 14; i++) {
      const geo = blockGeometry(id, 0.14, [Math.random() * 0.75, Math.random() * 0.75, 0.25]);
      const m = new THREE.Mesh(geo, particleMat);
      m.position.set(x + 0.2 + Math.random() * 0.6, y + 0.2 + Math.random() * 0.6, z + 0.2 + Math.random() * 0.6);
      scene.add(m);
      particles.push({
        mesh: m, life: 0.6 + Math.random() * 0.4,
        vel: new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 4 + 1, (Math.random() - 0.5) * 4),
      });
    }
  }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.vel.y -= 18 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      const bx = Math.floor(p.mesh.position.x), by = Math.floor(p.mesh.position.y - 0.07), bz = Math.floor(p.mesh.position.z);
      if (isSolid(world.getBlock(bx, by, bz)) && p.vel.y < 0) {
        p.mesh.position.y = by + 1 + 0.07; p.vel.set(p.vel.x * 0.5, 0, p.vel.z * 0.5);
      }
      if (p.life <= 0) {
        scene.remove(p.mesh); p.mesh.geometry.dispose(); particles.splice(i, 1);
      }
    }
  }

  // Held block (rendered in its own scene on top of the world)
  const handScene = new THREE.Scene();
  const handCamera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 10);
  const handMat = new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5 });
  let handMesh = null, handId = -1, swing = 0;
  function updateHand(dt) {
    const id = hotbar[selected];
    if (id !== handId) {
      if (handMesh) { handScene.remove(handMesh); handMesh.geometry.dispose(); }
      handMesh = new THREE.Mesh(blockGeometry(id, 0.4), handMat);
      handScene.add(handMesh);
      handId = id;
    }
    swing = Math.max(0, swing - dt * 4);
    const s = Math.sin(swing * Math.PI);
    const bob = player.bobTime;
    handMesh.position.set(0.52 + Math.cos(bob) * 0.02 - s * 0.2, -0.48 + Math.abs(Math.sin(bob)) * 0.03 + s * 0.12, -0.85 - s * 0.15);
    handMesh.rotation.set(0.1 - s * 0.6, 0.75, 0);
    handMat.color.copy(materials.solid.color);
  }

  // ---------------------------------------------------------------- UI
  const $ = (id) => document.getElementById(id);
  const hotbarEl = $('hotbar');
  const iconCache = new Map();
  function iconFor(id) {
    if (!iconCache.has(id)) iconCache.set(id, drawBlockIcon(atlasCanvas, id, 48).toDataURL());
    return iconCache.get(id);
  }
  function renderHotbar() {
    hotbarEl.innerHTML = '';
    hotbar.forEach((id, i) => {
      const slot = document.createElement('div');
      slot.className = 'slot' + (i === selected ? ' selected' : '');
      const img = document.createElement('img');
      img.src = iconFor(id);
      img.alt = BLOCKS[id].name;
      slot.appendChild(img);
      const n = document.createElement('span');
      n.className = 'num'; n.textContent = i + 1;
      slot.appendChild(n);
      hotbarEl.appendChild(slot);
    });
  }
  let toastTimer = 0;
  function selectSlot(i) {
    selected = (i + 9) % 9;
    renderHotbar();
    const t = $('toast');
    t.textContent = BLOCKS[hotbar[selected]].name;
    t.style.opacity = 1;
    toastTimer = 1.5;
  }

  const inventoryEl = $('inventory');
  function buildInventory() {
    const grid = $('inv-grid');
    grid.innerHTML = '';
    BLOCKS.forEach((b) => {
      if (b.id === B.AIR || b.id === B.BEDROCK || b.id === B.WATER) return;
      const slot = document.createElement('button');
      slot.className = 'slot';
      slot.title = b.name;
      const img = document.createElement('img');
      img.src = iconFor(b.id);
      img.alt = b.name;
      slot.appendChild(img);
      slot.addEventListener('click', () => {
        hotbar[selected] = b.id;
        renderHotbar();
        selectSlot(selected);
      });
      grid.appendChild(slot);
    });
  }

  let state = 'menu'; // 'menu' | 'playing' | 'inventory'
  let pointerLockSupported = 'requestPointerLock' in renderer.domElement;
  let dragLook = false;

  function showMenu() {
    state = 'menu';
    $('menu').style.display = 'flex';
    inventoryEl.style.display = 'none';
    $('play').textContent = world ? 'Resume' : 'Play';
    saveGame();
  }
  function startPlaying() {
    $('menu').style.display = 'none';
    inventoryEl.style.display = 'none';
    state = 'playing';
    if (pointerLockSupported) {
      try {
        const r = renderer.domElement.requestPointerLock();
        if (r && r.catch) r.catch(() => { dragLook = true; });
      } catch (e) { dragLook = true; }
    } else dragLook = true;
  }
  function openInventory() {
    state = 'inventory';
    inventoryEl.style.display = 'flex';
    if (document.pointerLockElement) document.exitPointerLock();
  }

  $('play').addEventListener('click', () => {
    if (!world && !loadGame()) newWorld(randomSeed());
    renderHotbar();
    startPlaying();
  });
  $('new-world').addEventListener('click', () => {
    const txt = $('seed').value.trim();
    let seed;
    if (!txt) seed = randomSeed();
    else if (/^-?\d+$/.test(txt)) seed = parseInt(txt, 10) | 0;
    else { seed = 0; for (const ch of txt) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) | 0; }
    newWorld(seed);
    renderHotbar();
    startPlaying();
  });
  const rd = $('render-distance');
  rd.value = settings.renderDistance;
  $('rd-label').textContent = settings.renderDistance;
  rd.addEventListener('input', () => {
    settings.renderDistance = parseInt(rd.value, 10);
    $('rd-label').textContent = settings.renderDistance;
    camera.far = Math.max(400, settings.renderDistance * CHUNK_SIZE * 1.5);
    camera.updateProjectionMatrix();
    saveSettings();
  });
  const sens = $('sensitivity');
  sens.value = settings.sensitivity;
  sens.addEventListener('input', () => { settings.sensitivity = parseFloat(sens.value); saveSettings(); });
  $('inv-close').addEventListener('click', () => startPlaying());

  function randomSeed() { return (Math.random() * 2147483647) | 0; }

  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && state === 'playing' && !dragLook) showMenu();
  });
  document.addEventListener('pointerlockerror', () => { dragLook = true; });

  // ---------------------------------------------------------------- input
  window.addEventListener('keydown', (e) => {
    if (state === 'menu') return;
    if (e.code === 'KeyE') {
      e.preventDefault();
      if (state === 'inventory') startPlaying(); else openInventory();
      return;
    }
    if (e.code === 'Escape' && (state === 'inventory' || dragLook)) { showMenu(); return; }
    if (state !== 'playing') return;
    if (e.code.startsWith('Digit')) {
      const n = parseInt(e.code.slice(5), 10);
      if (n >= 1 && n <= 9) selectSlot(n - 1);
    }
    if (e.code === 'F3' || e.code === 'Backquote') {
      e.preventDefault();
      const d = $('debug');
      d.style.display = d.style.display === 'block' ? 'none' : 'block';
    }
    if (e.code === 'KeyF') { player.flying = !player.flying; player.vel.y = 0; }
    if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
    player.onKeyDown(e.code);
  });
  window.addEventListener('keyup', (e) => { if (player) player.onKeyUp(e.code); });
  window.addEventListener('blur', () => { if (player) player.keys.clear(); });

  let mouseDown = [false, false, false];
  let dragMoved = 0;
  let breakCooldown = 0, placeCooldown = 0;

  renderer.domElement.addEventListener('mousedown', (e) => {
    if (state !== 'playing') return;
    if (!document.pointerLockElement && !dragLook) { startPlaying(); return; }
    mouseDown[e.button] = true;
    dragMoved = 0;
    if (e.button === 0 && !dragLook) { breakBlock(); breakCooldown = 0.25; }
    if (e.button === 2) { placeBlock(); placeCooldown = 0.22; }
    if (e.button === 1) { e.preventDefault(); pickBlock(); }
  });
  window.addEventListener('mouseup', (e) => {
    if (dragLook && e.button === 0 && mouseDown[0] && dragMoved < 6 && state === 'playing') breakBlock();
    mouseDown[e.button] = false;
  });
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('mousemove', (e) => {
    if (state !== 'playing') return;
    const locked = !!document.pointerLockElement;
    if (!locked && !(dragLook && mouseDown[0])) return;
    dragMoved += Math.abs(e.movementX) + Math.abs(e.movementY);
    const s = 0.0022 * settings.sensitivity;
    player.yaw -= e.movementX * s;
    player.pitch -= e.movementY * s;
    player.pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, player.pitch));
  });
  window.addEventListener('wheel', (e) => {
    if (state !== 'playing') return;
    selectSlot(selected + (e.deltaY > 0 ? 1 : -1));
  }, { passive: true });

  function currentTarget() {
    return world.raycast(player.eye, player.lookDir(), REACH);
  }

  function breakBlock() {
    const hit = currentTarget();
    swing = 1;
    if (!hit || !BLOCKS[hit.id].breakable) return;
    // Let adjacent water flow into the gap.
    let fill = B.AIR;
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) {
      if (world.getBlock(hit.x + dx, hit.y + dy, hit.z + dz) === B.WATER) { fill = B.WATER; break; }
    }
    world.setBlock(hit.x, hit.y, hit.z, fill);
    spawnParticles(hit.x, hit.y, hit.z, hit.id);
  }

  function placeBlock() {
    const hit = currentTarget();
    if (!hit) return;
    swing = 1;
    const x = hit.x + hit.normal[0], y = hit.y + hit.normal[1], z = hit.z + hit.normal[2];
    const existing = world.getBlock(x, y, z);
    if (existing !== B.AIR && existing !== B.WATER) return;
    const id = hotbar[selected];
    if (isSolid(id) && player.intersectsBlock(x, y, z)) return;
    world.setBlock(x, y, z, id);
  }

  function pickBlock() {
    const hit = currentTarget();
    if (!hit || hit.id === B.BEDROCK) return;
    const existing = hotbar.indexOf(hit.id);
    if (existing >= 0) selectSlot(existing);
    else { hotbar[selected] = hit.id; selectSlot(selected); }
  }

  window.addEventListener('resize', () => {
    camera.aspect = handCamera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    handCamera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  window.addEventListener('beforeunload', saveGame);
  setInterval(() => { if (state !== 'menu') saveGame(); }, 10000);

  // ---------------------------------------------------------------- loop
  let last = performance.now();
  let fpsFrames = 0, fpsTime = 0, fps = 0;
  camera.far = Math.max(400, settings.renderDistance * CHUNK_SIZE * 1.5);
  camera.updateProjectionMatrix();

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    fpsFrames++; fpsTime += dt;
    if (fpsTime >= 0.5) { fps = Math.round(fpsFrames / fpsTime); fpsFrames = 0; fpsTime = 0; }

    if (!world) {
      // Title screen: slowly orbiting camera over an empty sky.
      renderer.setClearColor(0x87ceeb);
      renderer.clear();
      return;
    }

    world.update(player.pos.x, player.pos.z, settings.renderDistance);

    const pcx = Math.floor(player.pos.x / CHUNK_SIZE), pcz = Math.floor(player.pos.z / CHUNK_SIZE);
    const here = world.getChunk(pcx, pcz);
    const ready = here && !here.dirty;

    if (ready && spawnPending) {
      const bx = Math.floor(player.pos.x), bz = Math.floor(player.pos.z);
      let y = WORLD_HEIGHT - 2;
      while (y > 0 && world.getBlock(bx, y, bz) === B.AIR) y--;
      player.pos.y = y + 1;
      spawnPending = false;
    }

    if (state === 'playing' && ready) {
      player.update(dt);
      if (mouseDown[0] && !dragLook) { breakCooldown -= dt; if (breakCooldown <= 0) { breakBlock(); breakCooldown = 0.25; } }
      if (mouseDown[2]) { placeCooldown -= dt; if (placeCooldown <= 0) { placeBlock(); placeCooldown = 0.22; } }
    }
    if (state !== 'menu') updateSky(dt);
    updateParticles(dt);

    // Camera
    const bob = player.onGround ? Math.sin(player.bobTime) * 0.05 : 0;
    camera.position.set(player.pos.x, player.pos.y + EYE_HEIGHT + Math.abs(bob), player.pos.z);
    camera.rotation.set(player.pitch, player.yaw, 0);
    const targetFov = (player.keys.has('ShiftLeft') || player.keys.has('ControlLeft')) && player.vel.lengthSq() > 20 ? 85 : 75;
    if (Math.abs(camera.fov - targetFov) > 0.1) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 8);
      camera.updateProjectionMatrix();
    }

    // Target outline
    const hit = state === 'playing' ? currentTarget() : null;
    outline.visible = !!hit;
    if (hit) outline.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);

    updateHand(dt);

    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) $('toast').style.opacity = 0;
    }

    if ($('debug').style.display === 'block') {
      const p = player.pos;
      const hours = Math.floor(timeOfDay * 24), mins = Math.floor((timeOfDay * 24 % 1) * 60);
      $('debug').textContent =
        `WebCraft  ${fps} fps\n` +
        `XYZ: ${p.x.toFixed(2)} / ${p.y.toFixed(2)} / ${p.z.toFixed(2)}\n` +
        `Chunk: ${pcx}, ${pcz}   loaded: ${world.chunks.size}\n` +
        `Facing: ${((((-player.yaw * 180 / Math.PI) % 360) + 360) % 360).toFixed(0)}°  ` +
        `Time: ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}\n` +
        `Seed: ${world.seed}\n` +
        `Flying: ${player.flying}  Ground: ${player.onGround}  Water: ${player.inWater}\n` +
        (hit ? `Looking at: ${BLOCKS[hit.id].name} (${hit.x}, ${hit.y}, ${hit.z})` : '');
    }
    $('loading').style.display = ready ? 'none' : 'block';

    renderer.clear();
    renderer.render(scene, camera);
    renderer.clearDepth();
    renderer.render(handScene, handCamera);
  }

  buildInventory();
  renderHotbar();
  try { if (localStorage.getItem(SAVE_KEY)) $('play').textContent = 'Continue'; } catch (e) { /* ignore */ }
  requestAnimationFrame(frame);
})();
