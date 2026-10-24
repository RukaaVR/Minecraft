// More mobs: rabbits, foxes, cats, bats, squid, bees, goats, husks, strays, drowned, witches,
// cave spiders, silverfish, phantoms, polar bears and horses. Models, animation, AI, sounds,
// drops, spawning and multiplayer state, plus the witch's splash potions and the status
// effects (poison, slowness, hunger) that witches, cave spiders, bees, strays and husks inflict.
'use strict';

// Everything lives in this block so no names leak into the scope the scripts share. It hooks in
// by wrapping the engine, never replacing it:
//  - MOB_TYPES / MOB_INFO / MOB_AI / MOB_INIT / MOB_RENDER entries, mobDrops and buildModel
//  - Mob.prototype.simulate (creepers keep away from cats), hurt and dispose
//  - Player.prototype.step / tickStats / serialize / load (effects, time since last sleep)
//  - Particles.prototype.update / clear (per frame: potions, particles, the effects HUD)
//  - Projectile.prototype.onHitEntity (strays' arrows slow you down)
//  - Sound.mob / Sound.mobHurt (synth voices; every other mob goes to the original)
//  - Game.prototype methods, once game.js and the files after it have run: spawning, cats
//    in villages, mob and potion state for multiplayer, silverfish hiding in stone
// The one global it adds is window.M3Mobs (helpers for tests and debugging).
{
  const NEW = ['rabbit', 'fox', 'cat', 'bat', 'squid', 'bee', 'goat', 'husk', 'stray', 'drowned', 'witch', 'cave_spider', 'silverfish', 'phantom', 'polar_bear', 'horse'];
  const IS_NEW = new Set(NEW);
  MOB_TYPES.push(...NEW);
  Object.assign(MOB_INFO, {
    rabbit: { health: 3, speed: 2.8, hostile: false },
    fox: { health: 10, speed: 3.0, hostile: false },
    cat: { health: 10, speed: 2.6, hostile: false, persistent: true },
    bat: { health: 6, speed: 3.2, hostile: false, flying: true },
    squid: { health: 10, speed: 2.0, hostile: false, swims: true },
    bee: { health: 10, speed: 3.0, hostile: false, neutral: true, flying: true },
    goat: { health: 10, speed: 2.4, hostile: false, neutral: true },
    husk: { health: 20, speed: 2.4, hostile: true },
    stray: { health: 20, speed: 2.3, hostile: true },
    drowned: { health: 20, speed: 2.2, hostile: true },
    witch: { health: 26, speed: 2.0, hostile: true },
    cave_spider: { health: 12, speed: 3.4, hostile: true },
    silverfish: { health: 8, speed: 3.0, hostile: true },
    phantom: { health: 20, speed: 8, hostile: true, flying: true },
    polar_bear: { health: 30, speed: 2.6, hostile: false, neutral: true },
    horse: { health: 22, speed: 2.6, hostile: false },
  });

  // ---------------------------------------------------------------- drops
  // Existing items stand in where Minecraft's are missing (no rabbit hide, ink sac,
  // phantom membrane, copper, glass bottle...): leather, gold nuggets.
  const prevDrops = mobDrops;
  // eslint-disable-next-line no-func-assign
  mobDrops = function (type, r) {
    const n = (a, b) => a + Math.floor(r() * (b - a + 1));
    switch (type) {
      case 'rabbit': return [[ITEM.LEATHER, n(0, 1)]];
      case 'cat': return [[ITEM.STRING, n(0, 2)]];
      case 'husk': return [[ITEM.ROTTEN_FLESH, n(0, 2)], r() < 0.025 ? [ITEM.IRON_INGOT, 1] : [0, 0]];
      case 'stray': return [[ITEM.BONE, n(0, 2)], [ITEM.ARROW, n(0, 2)]];
      case 'drowned': return [[ITEM.ROTTEN_FLESH, n(0, 2)], r() < 0.11 ? [ITEM.GOLD_NUGGET, n(1, 2)] : [0, 0]];
      case 'witch': {
        const pool = [ITEM.GUNPOWDER, ITEM.REDSTONE, ITEM.STICK], out = [];
        for (let i = n(1, 3); i > 0; i--) out.push([pool[Math.floor(r() * pool.length)], n(0, 2)]);
        return out;
      }
      case 'cave_spider': return [[ITEM.STRING, n(0, 2)]];
      case 'phantom': return [[ITEM.LEATHER, n(0, 1)]];
      case 'horse': return [[ITEM.LEATHER, n(0, 2)]];
      case 'fox': case 'bat': case 'squid': case 'bee': case 'goat': case 'silverfish': case 'polar_bear': return [];
    }
    return prevDrops(type, r);
  };
  const XP = { rabbit: [1, 3], fox: [1, 3], cat: [1, 3], bat: [0, 0], squid: [1, 3], bee: [1, 3], goat: [1, 3], husk: [5, 5], stray: [5, 5], drowned: [5, 5], witch: [5, 5], cave_spider: [5, 5], silverfish: [5, 5], phantom: [5, 5], polar_bear: [1, 3], horse: [1, 3] };

  // ---------------------------------------------------------------- model helpers
  const MS = MODEL_SCALE;
  const sub = (parent, pos) => pivotAt(parent, pos, parent.userData.px || [0, 0, 0]);
  function limbIn(M, parent, key, pivot, min, inflate = 0) { const g = sub(parent, pivot); boxIn(g, M, key, min, inflate); return g; }
  const fur = (keys, scale = 2, grain = 0.18, off = 0) => furMix(keys, scale, grain, off);
  // How far (in texels) a pixel of a side/top/bottom face is from the box's front (+z) end
  function fromFront(x, y, w, h, F) {
    switch (F.face) {
      case 'right': return w - 1 - x;
      case 'left': return x;
      case 'top': return h - 1 - y;
      case 'bottom': return y;
      case 'front': return 0;
      default: return 99;
    }
  }
  // Different maps for the mob's right (-x) and left (+x) sides: `right` is drawn for the
  // right face; the left face gets it mirrored so features (eyes...) sit at the same end.
  const sides = (base, right) => (x, y, w, h, F) => {
    const row = right[y], ch = row && row[F.face === 'left' ? w - 1 - x : x];
    return ch && ch !== '?' ? ch : MobSheet.pixel(base, x, y, w, h, F);
  };
  const remember = (...groups) => { for (const g of groups) g.userData.base = g.position.clone(); };
  function place(g, dx = 0, dy = 0, dz = 0) { const b = g.userData.base; g.position.set(b.x + dx * MS, b.y + dy * MS, b.z + dz * MS); }
  // Move every part into one group pivoted at `pivot`, so the whole body can lean (swimming)
  function regroup(M, pivot) {
    const g = new THREE.Group();
    g.position.set(pivot[0] * MS, pivot[1] * MS, pivot[2] * MS);
    g.userData.px = pivot;
    for (const c of [...M.inner.children]) { M.inner.remove(c); c.position.x -= pivot[0] * MS; c.position.y -= pivot[1] * MS; c.position.z -= pivot[2] * MS; g.add(c); }
    M.inner.add(g);
    return g;
  }

  // ---------------------------------------------------------------- textures
  // Variants share one box layout (same packing), so switching skin is just a texture swap.
  const RABBIT_V = ['brown', 'white', 'black', 'gold', 'salt'];
  const RABBIT_PAL = {
    brown: { B: [150, 114, 78], b: [122, 90, 60], c: [176, 140, 102], W: [228, 214, 192], w: [202, 186, 162], E: [26, 20, 18] },
    white: { B: [240, 238, 234], b: [214, 212, 206], c: [252, 252, 250], W: [255, 255, 255], w: [230, 228, 224], E: [204, 52, 72], P: [244, 184, 190] },
    black: { B: [58, 54, 54], b: [40, 38, 38], c: [80, 74, 72], W: [104, 98, 96], w: [80, 74, 72], E: [8, 6, 6], P: [164, 120, 120], N: [146, 98, 104] },
    gold: { B: [226, 188, 114], b: [202, 162, 92], c: [240, 208, 146], W: [248, 234, 202], w: [230, 212, 178], E: [32, 22, 14] },
    salt: { B: [132, 122, 110], b: [92, 84, 76], c: [178, 168, 154], W: [210, 202, 192], w: [180, 172, 162], E: [16, 14, 12] },
  };
  function rabbitSheet(v) {
    const pal = Object.assign({ P: [232, 166, 164], N: [214, 126, 134], K: [24, 18, 16] }, RABBIT_PAL[v] || RABBIT_PAL.brown);
    return mobSheet('m3x_rabbit_' + v, pal, 211, (s) => {
      const coat = v === 'salt' ? fur('bBcBc', 1.2, 0.45) : fur('bBBBc', 1.8, 0.15);
      s.box('head', 5, 4, 5, { all: coat, bottom: 'W',
        front: ['bBcBb', 'EBBBE', 'BWNWB', 'bWWWb'],
        lr: sides(coat, ['?????', '???E?', '?????', '???WW']) });
      s.box('ear', 2, 5, 1, { all: coat, front: ['bB', 'PB', 'PP', 'PB', 'BB'], top: 'b' });
      s.box('body', 6, 5, 8, { all: coat, top: fur('bBBc', 2, 0.12), bottom: 'W', front: overMap(coat, ['??????', '?WWWW?', 'WWWWWW', 'WWWWWW', 'WWWWWW']) });
      s.box('thigh', 2, 4, 5, { all: coat, bottom: 'w' });
      s.box('foot', 2, 1, 6, { all: 'w', top: coat, bottom: 'W' });
      s.box('arm', 2, 4, 2, { sides: rowBands([[3, coat], [1, 'W']]), top: coat, bottom: 'W' });
      s.box('tail', 3, 3, 2, { all: fur('wWWW', 1.5, 0.1) });
    });
  }

  const FOX_PAL = {
    red: { O: [226, 126, 46], o: [196, 100, 32], Q: [242, 154, 74], W: [246, 240, 230], w: [222, 212, 198], K: [36, 26, 24], E: [18, 12, 12], T: [252, 250, 246], n: [40, 30, 28] },
    snow: { O: [234, 232, 228], o: [204, 200, 194], Q: [250, 250, 248], W: [255, 255, 255], w: [226, 224, 220], K: [96, 84, 80], E: [18, 12, 12], T: [255, 255, 255], n: [52, 42, 40] },
  };
  function foxSheet(v, asleep) {
    return mobSheet('m3x_fox_' + v + (asleep ? '_s' : ''), FOX_PAL[v] || FOX_PAL.red, 223, (s) => {
      const coat = fur('oOOOQ', 2, 0.15);
      s.box('head', 8, 6, 6, { all: coat, bottom: 'W', top: fur('oOOO', 2, 0.12),
        front: ['oOOOOOOo', 'OOOOOOOO', asleep ? 'OKKOOKKO' : 'OWEOOEWO', 'WOOOOOOW', 'WWOOOOWW', 'wWWWWWWw'],
        lr: sides(coat, ['??????', '??????', '??????', '???WWW', '??WWWW', '?WWWWW']) });
      s.box('ear', 2, 2, 1, { all: 'O', front: ['KK', 'OW'], back: ['KK', 'oo'], top: 'K' });
      s.box('snout', 4, 2, 3, { all: 'W', top: ['WWWW', 'WWWW', 'wnnw'], front: ['WnnW', 'wWWw'], bottom: 'w' });
      s.box('body', 6, 6, 11, { lr: rowBands([[4, coat], [2, 'w']]), top: fur('oOOo', 2, 0.12), bottom: 'W',
        front: ['OOOOOO', 'OWWWWO', 'OWWWWO', 'WWWWWW', 'WWWWWW', 'wWWWWw'], back: coat });
      s.box('leg', 2, 6, 2, { sides: rowBands([[3, 'O'], [3, 'K']]), top: 'O', bottom: 'K' });
      s.box('tail', 4, 4, 9, { all: (x, y, w, h, F) => {
        const f = fromFront(x, y, w, h, F);
        if (f >= 6) return f === 6 && pxHash(x, y, 3) < 0.4 ? 'Q' : 'T';
        return coat(x, y, w, h, F);
      } });
    });
  }

  const CAT_V = ['tabby', 'tuxedo', 'ginger', 'siamese', 'white'];
  const CAT_PAL = {
    tabby: { B: [150, 140, 126], b: [74, 64, 56], c: [186, 176, 162], W: [222, 214, 202], E: [146, 204, 72], D: [74, 64, 56] },
    tuxedo: { B: [42, 40, 42], b: [28, 26, 28], c: [60, 58, 60], W: [238, 238, 234], E: [220, 200, 64], D: [28, 26, 28] },
    ginger: { B: [224, 150, 72], b: [178, 100, 40], c: [242, 184, 112], W: [248, 228, 202], E: [126, 194, 62], D: [178, 100, 40] },
    siamese: { B: [236, 224, 200], b: [212, 196, 170], c: [248, 240, 224], W: [248, 242, 230], E: [92, 164, 232], D: [86, 64, 52] },
    white: { B: [242, 242, 238], b: [216, 216, 210], c: [252, 252, 250], W: [255, 255, 255], E: [112, 172, 222], D: [216, 216, 210] },
  };
  function catSheet(v) {
    const pal = Object.assign({ K: [30, 24, 22], P: [218, 144, 146] }, CAT_PAL[v] || CAT_PAL.tabby);
    return mobSheet('m3x_cat_' + v, pal, 233, (s) => {
      const striped = v === 'tabby' || v === 'ginger';
      const base = fur('BBBc', 2, 0.1);
      const coat = striped ? (x, y, w, h, F) => {
        const f = fromFront(x, y, w, h, F);
        if (F.face === 'top' || F.face === 'bottom') return (f % 3 === 0 && x > 0 && x < w - 1) ? 'b' : base(x, y, w, h, F);
        return f % 3 === 0 && y < h - 1 ? 'b' : base(x, y, w, h, F);
      } : v === 'siamese' ? (x, y, w, h, F) => (fromFront(x, y, w, h, F) > 10 ? 'b' : base(x, y, w, h, F)) : base;
      const faces = {
        tabby: ['bBbBb', 'BEBEB', 'cBBBc', 'BcccB'], ginger: ['bBbBb', 'BEBEB', 'cBBBc', 'BcccB'],
        tuxedo: ['BBBBB', 'BEBEB', 'BWWWB', 'WWWWW'], siamese: ['BDDDB', 'DEDED', 'DDDDD', 'bDDDb'], white: ['bBBBb', 'BEBEB', 'BBBBB', 'cBBBc'],
      };
      const muzzle = v === 'siamese' ? ['DPD', 'DDD'] : v === 'tabby' || v === 'ginger' ? ['cPc', 'WWW'] : ['WPW', 'WWW'];
      s.box('head', 5, 4, 5, { all: v === 'siamese' ? fur('BBc') : coat, bottom: v === 'tuxedo' ? 'W' : 'c', front: faces[v] || faces.tabby, top: striped ? ['BbBbB', 'BbBbB', 'BBBBB', 'BbBbB', 'BBbBB'] : base });
      s.box('muzzle', 3, 2, 2, { all: v === 'siamese' ? 'D' : v === 'tuxedo' ? 'W' : 'c', front: muzzle });
      s.box('ear', 1, 2, 2, { all: v === 'siamese' ? 'D' : 'b', front: v === 'siamese' ? 'D' : ['b', 'P'] });
      s.box('body', 4, 5, 14, { all: coat, bottom: v === 'tuxedo' ? 'W' : 'c', front: v === 'tuxedo' ? ['BBBB', 'BWWB', 'WWWW', 'WWWW', 'WWWW'] : coat });
      const paw = v === 'tuxedo' || v === 'white' ? 'W' : v === 'siamese' ? 'D' : 'c';
      const legCoat = v === 'siamese' ? 'D' : coat;
      s.box('frontLeg', 2, 8, 2, { sides: rowBands([[6, legCoat], [2, paw]]), top: 'B', bottom: paw });
      s.box('backLeg', 2, 6, 2, { sides: rowBands([[4, legCoat], [2, paw]]), top: 'B', bottom: paw });
      const tail = v === 'siamese' ? 'D' : striped ? (x, y, w, h, F) => (Math.floor(fromFront(x, y, w, h, F) / 2) % 2 ? 'b' : 'B') : 'B';
      s.box('tail', 1, 1, 8, { all: tail });
      s.box('tail2', 1, 1, 6, { all: v === 'siamese' ? 'D' : striped ? (x, y, w, h, F) => (Math.floor(fromFront(x, y, w, h, F) / 2) % 2 ? 'B' : 'b') : 'B', back: v === 'tuxedo' ? 'W' : 'b' });
    });
  }

  function batSheet() {
    return mobSheet('m3x_bat', {
      F: [86, 66, 48], f: [64, 48, 36], g: [104, 82, 60], s: [132, 104, 80], K: [10, 8, 8], M: [46, 38, 34], m: [32, 26, 24], L: [74, 60, 52], P: [150, 96, 96],
    }, 241, (s) => {
      const coat = fur('fFFg', 1.5, 0.15);
      const membrane = (cols) => (x, y, w, h, F) => {
        if (F.face === 'top' || F.face === 'bottom') {
          if (y === (F.face === 'top' ? h - 1 : 0)) return 'L';
          if (cols.includes(x)) return 'L';
          return pxHash(x, y + F.gy, 3) < 0.25 ? 'm' : 'M';
        }
        return 'L';
      };
      s.box('head', 4, 3, 3, { all: coat, front: ['FfFF', 'KFFK', 'fssf'], bottom: 'g' });
      s.box('ear', 1, 2, 1, { all: 'f', front: ['f', 'P'] });
      s.box('body', 3, 2, 5, { all: coat, bottom: 'g' });
      s.box('wing', 6, 1, 5, { all: membrane([5]) });
      s.box('wingTip', 5, 1, 4, { all: membrane([2]) });
      s.box('feet', 2, 1, 1, { all: 'K' });
    });
  }

  function squidSheet() {
    return mobSheet('m3x_squid', {
      B: [58, 86, 116], b: [44, 68, 94], c: [76, 110, 142], d: [34, 52, 74], W: [226, 232, 238], K: [14, 16, 22], s: [100, 132, 160],
    }, 251, (s) => {
      const coat = fur('bBBBc', 3, 0.12);
      s.box('body', 12, 16, 12, { all: coat, top: fur('dbB', 3, 0.12),
        bottom: overMap(fur('dbb', 2, 0.1), ['????????????', '????????????', '????????????', '????????????', '?????dd?????', '????dKKd????', '????dKKd????', '?????dd?????']),
        front: overMap(coat, ['????????????', '????????????', '????????????', '????????????', '????????????', '????????????', '????????????', '????????????', '????????????', '????????????', '????????????', '?WWWK??KWWW?', '?WWKK??KKWW?', '????????????', '????????????', '????????????']) });
      s.box('tentacle', 2, 18, 2, { sides: rowBands([[15, coat], [3, 'd']]), front: (x, y, w, h, F) => (y % 3 === 1 && y < 15 ? 's' : coat(x, y, w, h, F)), bottom: 'd' });
    });
  }

  function beeSheet(angry) {
    return mobSheet('m3x_bee' + (angry ? '_angry' : ''), {
      Y: [240, 198, 60], y: [216, 170, 40], B: [90, 54, 26], b: [66, 40, 20], K: [22, 16, 14], W: [140, 232, 244], R: [222, 40, 36],
      k: [70, 60, 56], w: [236, 244, 255, 0.5], v: [206, 224, 242, 0.7], L: [36, 26, 22],
    }, 263, (s) => {
      const bands = ['Y', 'Y', 'Y', 'B', 'B', 'Y', 'Y', 'B', 'B', 'b'];
      const striped = (x, y, w, h, F) => { const c = bands[Math.min(9, fromFront(x, y, w, h, F))]; return c === 'Y' && pxHash(x, y + F.gy, 9) < 0.12 ? 'y' : c; };
      const eye = angry ? 'R' : 'W';
      s.box('body', 7, 7, 10, { all: striped, back: overMap('B', ['bBBBBBb', 'BBBBBBB', 'BBBBBBB', 'BBBbBBB', 'BBBBBBB', 'BBBBBBB', 'bBBBBBb']),
        front: ['YYYYYYY', 'YYYYYYY', 'KKYYYKK', 'K' + eye + 'YYY' + eye + 'K', 'YYYYYYY', 'yYYYYYy', 'yyYYYyy'] });
      s.box('stinger', 1, 1, 2, { all: 'k' });
      s.box('antenna', 1, 2, 3, { all: 'K' });
      s.box('wing', 9, 1, 6, { all: (x, y, w, h, F) => (F.face === 'top' || F.face === 'bottom' ? (x === 0 || y === 0 || (x + y) % 4 === 0 ? 'v' : 'w') : 'v') });
      s.box('legs', 7, 2, 1, { all: 'L' });
    });
  }

  function goatSheet() {
    return mobSheet('m3x_goat', {
      W: [236, 232, 222], w: [214, 208, 196], g: [190, 184, 172], G: [164, 158, 148], H: [196, 186, 166], h: [140, 128, 110], K: [66, 60, 58],
      E: [214, 172, 60], k: [24, 20, 18], n: [176, 156, 146], p: [204, 170, 162],
    }, 271, (s) => {
      const coat = fur('gwWWW', 2.6, 0.12);
      s.box('body', 9, 10, 15, { all: coat, bottom: 'w' });
      s.box('leg', 3, 7, 3, { sides: rowBands([[5, coat], [2, 'K']]), top: 'W', bottom: 'K' });
      s.box('head', 5, 7, 9, { all: fur('wWWW', 2, 0.1), front: ['wWWWw', 'WWWWW', 'WWWWW', 'WWWWW', 'WWWWW', 'WnWnW', 'wWWWw'],
        lr: sides(fur('wWWW', 2, 0.1), ['?????????', '?????????', '??kE?????', '?????????', '?????????', '?????????', '?????????']) });
      s.box('horn', 2, 7, 2, { sides: rowBands([[3, 'H'], [4, 'h']]), top: 'H', bottom: 'h' });
      s.box('ear', 3, 2, 1, { all: 'w', front: ['wpp', 'wpp'] });
      s.box('beard', 2, 4, 2, { all: fur('wW', 1.2, 0.1) });
    });
  }

  function huskSheet() {
    return mobSheet('m3x_husk', {
      S: [178, 156, 108], s: [152, 132, 90], t: [196, 176, 128], d: [120, 102, 70], K: [40, 30, 20],
      C: [104, 84, 60], c: [84, 66, 46], L: [128, 106, 76], P: [74, 62, 50], p: [58, 48, 38], l: [90, 76, 62], O: [52, 42, 34], o: [40, 32, 26],
    }, 281, (s) => {
      const skin = fur('sSSSt', 2, 0.15), shirt = fur('cCCCL', 2, 0.15), pants = fur('pPPPl', 2, 0.15);
      s.box('head', 8, 8, 8, { all: skin, top: fur('ddsS', 2, 0.15), bottom: 's',
        front: ['sSsSSsSs', 'SSSSSSSS', 'SsSSSSsS', 'SddSSddS', 'SKKSSKKS', 'SSSssSSS', 'SsddddsS', 'sSSSSSSs'] });
      const torso = rowBands([[8, shirt], [1, overMap(shirt, ['cCcCCcCc'])], [1, 'O'], [2, pants]]);
      s.box('body', 8, 12, 4, { all: torso, top: shirt, bottom: pants });
      s.box('arm', 4, 12, 4, { sides: rowBands([[4, shirt], [8, skin]]), top: shirt, bottom: 's' });
      s.box('leg', 4, 12, 4, { sides: rowBands([[10, pants], [2, 'O']]), top: pants, bottom: 'o' });
    });
  }

  function drownedSheet() {
    return mobSheet('m3x_drowned', {
      G: [86, 150, 140], g: [66, 124, 116], h: [112, 174, 162], D: [46, 96, 90], E: [150, 255, 236], e: [60, 200, 190],
      C: [78, 116, 96], c: [60, 94, 78], P: [46, 70, 96], p: [34, 54, 76], l: [58, 86, 112], k: [64, 126, 46], K: [42, 94, 32], O: [36, 48, 60],
    }, 293, (s) => {
      const skin = fur('gGGGh', 2, 0.15), pants = fur('pPPPl', 2, 0.15);
      const rags = (x, y, w, h, F) => (pxHash(F.gx + x, F.gy + y, 5) < 0.22 ? skin(x, y, w, h, F) : fur('cCCC', 2, 0.15)(x, y, w, h, F));
      const kelp = (x, y, w, h, F) => (y <= (pxHash(F.gx + x, 1, 7) * 4 | 0) ? ((x + y) % 3 ? 'k' : 'K') : skin(x, y, w, h, F));
      s.box('head', 8, 8, 8, { all: kelp, top: fur('kKk', 1.4, 0.2), bottom: 'g',
        front: ['kKkkKkkK', 'kGkGGkGk', 'GGGhGGGG', 'GDDGGDDG', 'GeeGGeeG', 'GGGgDGGG', 'GgDDDDgG', 'gGGGGGGg'] });
      s.box('eyes', 8, 8, 8, { all: '.', front: ['........', '........', '........', '........', '.EE..EE.', '........', '........', '........'] });
      s.box('body', 8, 12, 4, { all: rowBands([[9, rags], [3, pants]]), top: 'c', bottom: pants });
      s.box('arm', 4, 12, 4, { sides: rowBands([[3, rags], [9, skin]]), top: 'c', bottom: 'g' });
      s.box('leg', 4, 12, 4, { sides: rowBands([[8, pants], [4, skin]]), top: pants, bottom: 'g' });
    });
  }

  function straySheet() {
    return mobSheet('m3x_stray', {
      B: [196, 208, 214], b: [164, 178, 186], d: [124, 138, 148], D: [84, 96, 106], W: [226, 236, 240], K: [16, 18, 22],
      R: [70, 86, 92], r: [52, 66, 72], q: [92, 108, 112],
    }, 307, (s) => {
      const bone = fur('bBBBW', 1.8, 0.15), cloth = fur('rRRq', 1.6, 0.2);
      const torn = (holes) => (x, y, w, h, F) => (pxHash(F.gx + x, F.gy + y, 11) < holes || (y === h - 1 && x % 2) ? '.' : cloth(x, y, w, h, F));
      s.box('head', 8, 8, 8, { all: bone, bottom: 'd', front: ['BWBBBBWB', 'BBBBBBBB', 'BbBBBBbB', 'BKKBBKKB', 'BKKBBKKB', 'BBBddBBB', 'BdKKKKdB', 'bBdBdBBb'] });
      s.box('body', 8, 12, 4, {
        front: ['BBBBBBBB', '...BB...', '.bBBBBb.', '...BB...', '.bBBBBb.', '...BB...', '.bBBBBb.', '...BB...', '...BB...', '...Bb...', '.BBBBBB.', '.BB..BB.'],
        back: ['BBBBBBBB', '...BB...', '.bBBBBb.', '...BB...', '.bBBBBb.', '...BB...', '.bBBBBb.', '...BB...', '...BB...', '...bB...', '.BBBBBB.', '.BB..BB.'],
        lr: ['BBBB', '....', 'bBBb', '....', 'bBBb', '....', 'bBBb', '....', '....', '....', 'BBBB', 'B..B'],
        top: 'B', bottom: ['.BBBBBB.', '.BBBBBB.', '.BBBBBB.', '.BBBBBB.'],
      });
      s.box('limb', 2, 12, 2, { sides: ['BW', 'BB', 'BB', 'BB', 'Bb', 'bd', 'Bb', 'BB', 'BW', 'BB', 'BB', 'bb'], top: 'B', bottom: 'b' });
      // tattered clothes over the bones
      s.box('cloak', 8, 12, 4, { all: torn(0.16), top: cloth, bottom: '.' });
      s.box('hood', 8, 8, 8, { all: (x, y, w, h, F) => (y < 2 + (pxHash(F.gx + x, 0, 13) * 2 | 0) ? cloth(x, y, w, h, F) : '.'), top: cloth, back: torn(0.1), front: (x, y) => (y === 0 ? 'R' : '.'), bottom: '.' });
      s.box('rag', 2, 12, 2, { all: (x, y, w, h, F) => (y < 7 + (pxHash(F.gx + x, 2, 17) * 3 | 0) ? cloth(x, y, w, h, F) : '.'), top: '.', bottom: '.' });
    });
  }

  function witchSheet() {
    return mobSheet('m3x_witch', {
      S: [178, 138, 112], s: [154, 116, 94], t: [196, 158, 132], N: [170, 126, 102], n: [142, 102, 82], G: [104, 132, 64], E: [250, 250, 250], V: [96, 156, 70],
      U: [72, 50, 40], R: [76, 44, 84], r: [58, 32, 66], q: [94, 60, 104], T: [84, 110, 64], L: [64, 46, 52], l: [48, 34, 40], O: [42, 30, 36],
      H: [68, 42, 76], h: [50, 28, 58], X: [92, 142, 64], x: [70, 112, 48],
    }, 311, (s) => {
      const skin = fur('sSSSt', 2, 0.12), robe = fur('rRRRq', 2.2, 0.15), hat = fur('hHHH', 2, 0.15);
      s.box('head', 8, 10, 8, { all: skin, bottom: 's', top: hat,
        front: ['SSSSSSSS', 'SSSSSSSS', 'StSSSStS', 'SSSSSSSS', 'SUUSSUUS', 'SEVSSVES', 'SSSSSSSS', 'SSSSSSSS', 'SSsssSSS', 'sSSSSSSs'] });
      s.box('nose', 2, 4, 2, { all: 'N', front: ['NN', 'NN', 'NN', 'nn'], bottom: 'n' });
      s.box('wart', 1, 1, 1, { all: 'G' });
      s.box('body', 8, 12, 6, { all: robe });
      s.box('robe', 8, 18, 6, { all: rowBands([[17, robe], [1, 'r']]), front: (x, y, w, h, F) => (y === 0 && x >= 2 && x <= 5 ? 'S' : x >= 3 && x <= 4 && y > 1 ? 'T' : y === h - 1 ? 'r' : robe(x, y, w, h, F)), top: robe, bottom: 'r' });
      s.box('armSide', 4, 8, 4, { all: rowBands([[6, robe], [2, skin]]), bottom: 'S' });
      s.box('hands', 8, 4, 4, { all: skin, front: ['SsSSSSsS', 'SSSsSSSS', 'SsSSSsSS', 'sSSSSSSs'] });
      s.box('leg', 4, 12, 4, { sides: rowBands([[11, fur('lLL')], [1, 'O']]), top: 'L', bottom: 'O' });
      s.box('hatBrim', 10, 2, 10, { all: rowBands([[1, 'X'], [1, 'x']]), top: hat, bottom: 'h' });
      s.box('hat1', 7, 4, 7, { all: hat, top: hat });
      s.box('hat2', 4, 4, 4, { all: hat });
      s.box('hat3', 1, 2, 1, { all: 'h' });
    });
  }

  function caveSpiderSheet() {
    const fur2 = (x, y, w, h, F) => {
      const t = pxNoise(F.gx + x, F.gy + y, F.seed, 1.4) * 0.6 + pxHash(F.gx + x, F.gy + y, F.seed + 2) * 0.4;
      return t < 0.22 ? 'd' : t < 0.58 ? 's' : t < 0.88 ? 'S' : 'h';
    };
    return mobSheet('m3x_cave_spider', {
      S: [16, 70, 82], s: [10, 52, 62], d: [6, 32, 40], h: [30, 100, 112], H: [56, 142, 150], R: [210, 30, 30], r: [150, 16, 16], P: [255, 120, 120],
    }, 317, (s) => {
      s.box('head', 8, 8, 8, { all: fur2, front: overMap(fur2, ['????????', '????????', 'r??????r', '?RP??PR?', '?RR??RR?', '???rr???', '?s?dd?s?', 'sd????ds']) });
      s.box('eyes', 8, 8, 8, { all: '.', front: ['........', '........', 'r......r', '.RP..PR.', '.RR..RR.', '...rr...', '........', '........'] });
      s.box('neck', 6, 6, 6, { all: fur2 });
      s.box('abdomen', 10, 8, 12, { all: fur2, top: overMap(fur2, ['??????????', '????HH????', '???HhhH???', '??H????H??', '???HHHH???', '??H????H??', '??????????', '????HH????', '???H??H???', '??????????', '??????????', '??????????']) });
      s.box('leg', 16, 2, 2, { all: (x, y, w, h, F) => (w === 16 && (x === 5 || x === 10) ? 'H' : fur2(x, y, w, h, F)) });
    });
  }

  const SILVER_SEGS = [[3, 2, 2], [4, 3, 2], [6, 4, 3], [3, 3, 3], [2, 2, 3], [2, 1, 2], [1, 1, 2]];
  const SILVER_Z = [7.5, 5.5, 3, 0, -3, -5.5, -7.5];
  function silverfishSheet() {
    return mobSheet('m3x_silverfish', {
      G: [146, 146, 150], g: [118, 118, 122], d: [92, 92, 96], L: [172, 172, 176], K: [30, 30, 34],
    }, 331, (s) => {
      const shell = fur('dgGGL', 1.3, 0.25);
      SILVER_SEGS.forEach(([w, h, d], i) => s.box('seg' + i, w, h, d, { all: shell, front: i === 0 ? ['KgK'.padEnd(w, 'g'), 'ggg'.padEnd(w, 'g')] : shell, bottom: 'd' }));
      const ridges = (x, y, w, h, F) => (F.face === 'top' ? (x % 3 === 0 ? 'g' : 'G') : y % 2 ? (pxHash(x, y + F.gy, 4) < 0.3 ? 'd' : 'g') : (pxHash(x, y + F.gy, 5) < 0.3 ? 'L' : 'G'));
      s.box('layer0', 10, 8, 3, { all: ridges });
      s.box('layer1', 6, 4, 3, { all: ridges });
      s.box('layer2', 6, 5, 2, { all: ridges });
    });
  }

  function phantomSheet() {
    return mobSheet('m3x_phantom', {
      B: [58, 72, 116], b: [44, 56, 94], c: [76, 92, 140], d: [34, 44, 74], M: [112, 128, 170], m: [92, 106, 150], L: [182, 192, 214], E: [156, 255, 128], e: [96, 210, 90], K: [16, 20, 30],
    }, 337, (s) => {
      const hide = fur('dbBBc', 1.6, 0.18);
      const wing = (x, y, w, h, F) => {
        if (F.face !== 'top' && F.face !== 'bottom') return 'b';
        if (y === h - 1 || x % 4 === 1) return F.face === 'top' ? 'L' : 'c';
        return F.face === 'top' ? ((x + y) % 3 ? 'M' : 'm') : 'c';
      };
      s.box('body', 5, 3, 9, { all: hide, bottom: fur('cbc', 1.4, 0.15), top: overMap(hide, ['?????', '??L??', '?????', '??L??', '?????', '??L??', '?????', '??L??', '?????']) });
      s.box('head', 7, 3, 5, { all: hide, front: ['bbbbbbb', 'eEbbbEe', 'dbbbbbd'], bottom: 'c' });
      s.box('eyes', 7, 3, 5, { all: '.', front: ['.......', '.E...E.', '.......'], lr: sides('.', ['.....', '...EE', '.....']) });
      s.box('wingBase', 6, 2, 9, { all: wing });
      s.box('wingTip', 13, 1, 9, { all: wing });
      s.box('tailBase', 3, 2, 6, { all: hide, top: overMap(hide, ['???', '?L?', '???', '?L?', '???', '?L?']) });
      s.box('tailTip', 1, 1, 6, { all: 'b' });
    });
  }

  function polarBearSheet() {
    return mobSheet('m3x_polar_bear', {
      W: [244, 244, 238], w: [226, 226, 218], g: [206, 206, 198], G: [184, 184, 176], K: [24, 22, 22], m: [236, 232, 224],
    }, 347, (s) => {
      const coat = fur('gwWWW', 2.4, 0.12);
      s.box('body', 14, 11, 14, { all: coat, bottom: fur('gw') });
      s.box('legF', 4, 10, 6, { sides: rowBands([[9, coat], [1, 'g']]), top: 'W', bottom: 'G' });
      s.box('legB', 4, 10, 8, { sides: rowBands([[9, coat], [1, 'g']]), top: 'W', bottom: 'G' });
      s.box('head', 7, 7, 7, { all: coat, bottom: 'w', front: ['wWWWWWw', 'WWWWWWW', 'WWWWWWW', 'WKWWWKW', 'WWWWWWW', 'WWWWWWW', 'wWWWWWw'] });
      s.box('mouth', 5, 3, 3, { all: 'm', top: ['mmmmm', 'mmmmm', 'mKKKm'], front: ['wKKKw', 'mmmmm', 'wmmmw'], bottom: 'w' });
      s.box('ear', 2, 2, 1, { all: 'w', front: ['wg', 'gg'] });
    });
  }

  const HORSE_V = ['white', 'creamy', 'chestnut', 'brown', 'black', 'gray', 'darkbrown'];
  const HORSE_PAL = {
    white: { B: [232, 228, 220], b: [208, 202, 192], c: [246, 244, 238], M: [214, 210, 200], m: [184, 178, 168] },
    creamy: { B: [204, 170, 116], b: [180, 146, 94], c: [222, 192, 142], M: [238, 224, 196], m: [210, 194, 164] },
    chestnut: { B: [156, 88, 44], b: [128, 68, 32], c: [178, 110, 62], M: [96, 52, 26], m: [72, 38, 18] },
    brown: { B: [116, 76, 46], b: [94, 60, 36], c: [136, 94, 60], M: [42, 30, 22], m: [28, 20, 14] },
    black: { B: [44, 40, 40], b: [30, 28, 28], c: [62, 58, 58], M: [24, 22, 22], m: [14, 12, 12] },
    gray: { B: [128, 124, 120], b: [104, 100, 96], c: [150, 146, 142], M: [76, 72, 70], m: [56, 52, 50] },
    darkbrown: { B: [72, 50, 34], b: [56, 38, 26], c: [90, 64, 44], M: [30, 22, 16], m: [20, 14, 10] },
  };
  function horseSheet(v) {
    const sock = v === 'chestnut' || v === 'darkbrown' || v === 'black';
    const blaze = v === 'chestnut' || v === 'brown' || v === 'black';
    const pal = Object.assign({ K: [56, 50, 46], E: [24, 20, 18], W: [240, 238, 232], n: [40, 32, 30] }, HORSE_PAL[v] || HORSE_PAL.brown);
    return mobSheet('m3x_horse_' + v, pal, 353, (s) => {
      const coat = fur('bBBBc', 2.4, 0.12), mane = fur('mMMM', 1.4, 0.2);
      s.box('body', 10, 10, 22, { all: coat, bottom: fur('bB') });
      s.box('leg', 4, 11, 4, { sides: rowBands([[7, coat], [3, sock ? 'W' : coat], [1, 'K']]), top: 'B', bottom: 'K' });
      s.box('neck', 4, 12, 7, { all: coat });
      s.box('mane', 2, 16, 2, { all: mane });
      s.box('skull', 6, 5, 7, { all: coat, front: blaze ? ['BBWWBB', 'BBWWBB', 'BBWWBB', 'BBWWBB', 'BBWWBB'] : coat,
        lr: sides(coat, ['???????', '????EE?', '????E??', '???????', '???????']) });
      s.box('muzzle', 4, 5, 5, { all: coat, front: blaze ? ['BWWB', 'BWWB', 'BWWB', 'nBBn', 'bbbb'] : ['BBBB', 'BBBB', 'BBBB', 'nBBn', 'bbbb'], bottom: 'b' });
      s.box('ear', 2, 3, 1, { all: coat, front: ['Bb', 'bn', 'bb'] });
      s.box('tail', 3, 14, 4, { all: mane });
    });
  }

  const POT = {
    harm: { L: [132, 28, 52], l: [180, 60, 84], d: [88, 14, 30], hex: 0x9a2040 },
    slow: { L: [92, 110, 132], l: [128, 146, 168], d: [64, 78, 96], hex: 0x6a7f99 },
    poison: { L: [82, 150, 52], l: [120, 190, 84], d: [52, 104, 32], hex: 0x56a034 },
    heal: { L: [236, 46, 52], l: [252, 110, 116], d: [176, 24, 30], hex: 0xf03040 },
  };
  const POT_KINDS = ['harm', 'slow', 'poison', 'heal'];
  function potionSheet(kind) {
    return mobSheet('m3x_potion_' + kind, Object.assign({ G: [214, 230, 240], g: [180, 200, 214], C: [150, 110, 70], c: [120, 86, 54] }, POT[kind]), 359, (s) => {
      s.box('liquid', 4, 4, 4, { all: ['lLLL', 'lLLL', 'LLLL', 'LLLd'], top: 'g', bottom: 'd' });
      s.box('neck', 2, 2, 2, { all: 'G', top: 'g' });
      s.box('cork', 2, 1, 2, { all: 'C', top: 'c' });
    });
  }
  // A small potion bottle (thrown by witches, drunk by witches)
  function potionModel(kind) {
    const M = newMobModel(potionSheet(kind));
    boxIn(M.inner, M, 'liquid', [-2, -3, -2]);
    boxIn(M.inner, M, 'neck', [-1, 1, -1]);
    boxIn(M.inner, M, 'cork', [-1, 3, -1]);
    return shadeModel(M);
  }

  // ---------------------------------------------------------------- the models
  const BUILD = {
    rabbit() {
      const S = rabbitSheet('brown'), M = newMobModel(S), P = M.parts;
      P.body = limb(M, 'body', [0, 5, -1], [-3, 2.5, -5]);
      P.legBL = limb(M, 'thigh', [-3, 5, -2.5], [-4, 1.5, -5]); boxIn(P.legBL, M, 'foot', [-4, 0, -5]);
      P.legBR = limb(M, 'thigh', [3, 5, -2.5], [2, 1.5, -5]); boxIn(P.legBR, M, 'foot', [2, 0, -5]);
      P.legFL = limb(M, 'arm', [-1.5, 4, 2], [-2.5, 0, 1]);
      P.legFR = limb(M, 'arm', [1.5, 4, 2], [0.5, 0, 1]);
      P.head = limb(M, 'head', [0, 7, 3], [-2.5, 6, 2.5]);
      P.earL = sub(P.head, [-1.5, 10, 4]); boxIn(P.earL, M, 'ear', [-2.5, 10, 3.5]);
      P.earR = sub(P.head, [1.5, 10, 4]); boxIn(P.earR, M, 'ear', [0.5, 10, 3.5]);
      P.tail = limb(M, 'tail', [0, 5.5, -5], [-1.5, 4, -6.5]);
      M.skins = (v) => rabbitSheet(v);
      return finishModel(M, 0.5, 0.4, 7);
    },

    fox() {
      const S = foxSheet('red', false), M = newMobModel(S), P = M.parts;
      for (const [n, x, z] of [['legFL', -2, 3.5], ['legFR', 2, 3.5], ['legBL', -2, -4.5], ['legBR', 2, -4.5]]) P[n] = limb(M, 'leg', [x, 6, z], [x - 1, 0, z - 1]);
      P.body = limb(M, 'body', [0, 8, 0], [-3, 5, -6]);
      P.head = limb(M, 'head', [0, 9, 5], [-4, 7, 4.5]);
      boxIn(P.head, M, 'snout', [-2, 7, 10.5]);
      boxIn(P.head, M, 'ear', [-4, 13, 6.5]); boxIn(P.head, M, 'ear', [2, 13, 6.5]);
      P.tail = limb(M, 'tail', [0, 9.5, -6], [-2, 6.5, -15]);
      P.tail.rotation.x = -0.35;
      remember(P.body, P.head, P.tail, P.legFL, P.legFR, P.legBL, P.legBR);
      return finishModel(M, 0.7, 0.6, 9);
    },

    cat() {
      const S = catSheet('tabby'), M = newMobModel(S), P = M.parts;
      P.legFL = limb(M, 'frontLeg', [-1, 8, 4.5], [-2, 0, 3.5]);
      P.legFR = limb(M, 'frontLeg', [1, 8, 4.5], [0, 0, 3.5]);
      P.legBL = limb(M, 'backLeg', [-1, 6, -5], [-2, 0, -6]);
      P.legBR = limb(M, 'backLeg', [1, 6, -5], [0, 0, -6]);
      P.body = limb(M, 'body', [0, 6, 6.5], [-2, 6, -7.5]);
      P.head = limb(M, 'head', [0, 11, 6.5], [-2.5, 9.5, 6]);
      boxIn(P.head, M, 'muzzle', [-1.5, 9.5, 11]);
      boxIn(P.head, M, 'ear', [-2.5, 13.5, 7.5]); boxIn(P.head, M, 'ear', [1.5, 13.5, 7.5]);
      P.tail = sub(P.body, [0, 10.5, -7.5]); boxIn(P.tail, M, 'tail', [-0.5, 10, -15.5]);
      P.tail2 = sub(P.tail, [0, 10.5, -15.5]); boxIn(P.tail2, M, 'tail2', [-0.5, 10, -21.5]);
      M.inner.scale.setScalar(0.8);
      remember(P.head, P.legBL, P.legBR);
      return finishModel(M, 0.7, 0.6, 11);
    },

    bat() {
      const S = batSheet(), M = newMobModel(S), P = M.parts;
      P.body = pivotAt(M.inner, [0, 6, 0]);
      boxIn(P.body, M, 'body', [-1.5, 5, -2.5]);
      boxIn(P.body, M, 'feet', [-1, 5, -3.5]);
      P.head = sub(P.body, [0, 6, 2.5]); boxIn(P.head, M, 'head', [-2, 4.5, 2.5]);
      boxIn(P.head, M, 'ear', [-2, 7.5, 3.5]); boxIn(P.head, M, 'ear', [1, 7.5, 3.5]);
      P.wingR = sub(P.body, [-1.5, 6.5, 0.5]); boxIn(P.wingR, M, 'wing', [-7.5, 6, -2]);
      P.tipR = sub(P.wingR, [-7.5, 6.5, 0.5]); boxIn(P.tipR, M, 'wingTip', [-12.5, 6, -1.5]);
      P.wingL = sub(P.body, [1.5, 6.5, 0.5]); boxIn(P.wingL, M, 'wing', [1.5, 6, -2]);
      P.tipL = sub(P.wingL, [7.5, 6.5, 0.5]); boxIn(P.tipL, M, 'wingTip', [7.5, 6, -1.5]);
      M.inner.scale.setScalar(0.75);
      remember(P.body);
      return finishModel(M, 0.5, 0.5, 6);
    },

    squid() {
      const S = squidSheet(), M = newMobModel(S), P = M.parts;
      P.body = pivotAt(M.inner, [0, 8, 0]);
      boxIn(P.body, M, 'body', [-6, 0, -6]);
      P.tentacles = [];
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2, x = Math.cos(a) * 4.5, z = Math.sin(a) * 4.5;
        const t = sub(P.body, [x, 0.5, z]); boxIn(t, M, 'tentacle', [x - 1, -17.5, z - 1]);
        t.userData.rx = Math.cos(a); t.userData.rz = Math.sin(a);
        P.tentacles.push(t);
      }
      M.inner.scale.setScalar(0.65);
      P.head = null;
      return finishModel(M, 0.8, 0.8, 12);
    },

    bee() {
      const S = beeSheet(false), M = newMobModel(S), P = M.parts;
      P.body = pivotAt(M.inner, [0, 5.5, 0]);
      boxIn(P.body, M, 'body', [-3.5, 2, -5]);
      P.stinger = boxIn(P.body, M, 'stinger', [-0.5, 4.5, -7]);
      boxIn(P.body, M, 'antenna', [-2.5, 9, 3]); boxIn(P.body, M, 'antenna', [1.5, 9, 3]);
      for (const z of [1.5, -0.5, -2.5]) boxIn(P.body, M, 'legs', [-3.5, 0.5, z]).scale.z = 0.5;
      const wingMat = new THREE.MeshBasicMaterial({ map: S.tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      P.wingR = sub(P.body, [-1.5, 9, 1]); boxIn(P.wingR, M, 'wing', [-10.5, 9, -2], 0, wingMat).scale.y = 0.3;
      P.wingL = sub(P.body, [1.5, 9, 1]); boxIn(P.wingL, M, 'wing', [1.5, 9, -2], 0, wingMat).scale.y = 0.3;
      M.tintMats = [wingMat];
      P.head = null;
      remember(P.body);
      return finishModel(M, 0.6, 0.7, 6);
    },

    goat() {
      const S = goatSheet(), M = newMobModel(S), P = M.parts;
      for (const [n, x, z] of [['legFL', -2.5, 5], ['legFR', 2.5, 5], ['legBL', -2.5, -5], ['legBR', 2.5, -5]]) P[n] = limb(M, 'leg', [x, 7, z], [x - 1.5, 0, z - 1.5]);
      P.body = limb(M, 'body', [0, 7, 0], [-4.5, 6, -8]);
      P.head = limb(M, 'head', [0, 14, 6], [-2.5, 11, 4]);
      for (const x of [-1.5, 1.5]) { const h = sub(P.head, [x, 17.5, 6]); boxIn(h, M, 'horn', [x - 1, 17, 5]); h.rotation.x = -0.95; h.rotation.z = x * 0.08; }
      boxIn(P.head, M, 'ear', [-5.5, 15, 8]); boxIn(P.head, M, 'ear', [2.5, 15, 8]);
      boxIn(P.head, M, 'beard', [-1, 8, 10]);
      return finishModel(M, 1.3, 0.9, 14);
    },

    husk() {
      const M = BESTIARY._humanoid(huskSheet(), 4);
      M.inner.scale.setScalar(1.0625);
      M.parts.armL.rotation.x = M.parts.armR.rotation.x = -Math.PI / 2;
      return finishModel(M, 1.9, 0.6, 24);
    },

    drowned() {
      const S = drownedSheet(), M = BESTIARY._humanoid(S, 4), P = M.parts;
      glowLayer(M, P.head, 'eyes', [-4, 24, -4]);
      P.armL.rotation.x = P.armR.rotation.x = -Math.PI / 2;
      P.root = regroup(M, [0, 12, 0]);
      remember(P.root);
      return M;
    },

    stray() {
      const S = straySheet(), M = newMobModel(S, { alphaTest: 0.5, side: THREE.DoubleSide }), P = M.parts;
      P.legL = limb(M, 'limb', [-2, 12, 0], [-3, 0, -1]); boxIn(P.legL, M, 'rag', [-3, 0, -1], 1.2);
      P.legR = limb(M, 'limb', [2, 12, 0], [1, 0, -1]); boxIn(P.legR, M, 'rag', [1, 0, -1], 1.2);
      P.body = limb(M, 'body', [0, 12, 0], [-4, 12, -2]); boxIn(P.body, M, 'cloak', [-4, 12, -2], 1);
      P.armL = limb(M, 'limb', [-5, 22, 0], [-6, 12, -1]);
      P.armR = limb(M, 'limb', [5, 22, 0], [4, 12, -1]);
      P.head = limb(M, 'head', [0, 24, 0], [-4, 24, -4]); boxIn(P.head, M, 'hood', [-4, 24, -4], 1);
      P.armL.rotation.x = -Math.PI / 2; P.armR.rotation.x = -Math.PI / 2; P.armL.rotation.y = 0.3;
      return finishModel(M, 1.95, 0.6, 24);
    },

    witch() {
      const S = witchSheet(), M = newMobModel(S), P = M.parts;
      P.legL = limb(M, 'leg', [-2, 12, 0], [-4, 0, -2]);
      P.legR = limb(M, 'leg', [2, 12, 0], [0, 0, -2]);
      P.body = limb(M, 'body', [0, 12, 0], [-4, 12, -3]);
      boxIn(P.body, M, 'robe', [-4, 6, -3], 1);
      P.arms = pivotAt(M.inner, [0, 21, 1]);
      boxIn(P.arms, M, 'armSide', [-8, 15, -1]); boxIn(P.arms, M, 'armSide', [4, 15, -1]);
      boxIn(P.arms, M, 'hands', [-4, 15, -1]);
      P.arms.rotation.x = -0.75;
      P.head = limb(M, 'head', [0, 24, 0], [-4, 24, -4]);
      P.nose = sub(P.head, [0, 27, 4]); boxIn(P.nose, M, 'nose', [-1, 23, 4]); boxIn(P.nose, M, 'wart', [1, 24, 5]);
      const h1 = sub(P.head, [0, 34, 0]); boxIn(h1, M, 'hatBrim', [-5, 33, -5]); boxIn(h1, M, 'hat1', [-3.5, 35, -3]);
      const h2 = sub(h1, [0, 39, 0.5]); boxIn(h2, M, 'hat2', [-2, 39, -1]); h2.rotation.x = -0.1;
      const h3 = sub(h2, [0, 43, 1]); boxIn(h3, M, 'hat3', [-0.5, 43, 0.5]); h3.rotation.x = -0.35;
      // the healing potion she drinks, held in both hands
      const pot = potionModel('heal');
      pot.root.position.set(0, 17 * MS - P.arms.position.y, 4 * MS - P.arms.position.z);
      pot.root.visible = false;
      P.arms.add(pot.root);
      P.potion = pot.root;
      M.tintMats = [pot.mat];
      return finishModel(M, 1.95, 0.6, 24);
    },

    cave_spider() {
      const S = caveSpiderSheet(), M = newMobModel(S), P = M.parts;
      P.body = limb(M, 'abdomen', [0, 9, -3], [-5, 5, -15]);
      limb(M, 'neck', [0, 9, 0], [-3, 6, -3]);
      P.head = limb(M, 'head', [0, 9, 3], [-4, 5, 3]);
      glowLayer(M, P.head, 'eyes', [-4, 5, 3]);
      P.spiderLegs = [];
      const splay = [-0.78, -0.39, 0.39, 0.78], droop = [0.64, 0.56, 0.56, 0.64];
      for (let i = 0; i < 8; i++) {
        const side = i < 4 ? -1 : 1, k = i % 4, z = -2 + k;
        const leg = pivotAt(M.inner, [side * 4, 9, z]);
        boxIn(leg, M, 'leg', [side > 0 ? 3 : -19, 8, z - 1]);
        leg.userData.droop = -side * droop[k]; leg.userData.splay = -side * splay[k]; leg.userData.side = side;
        leg.rotation.set(0, leg.userData.splay, leg.userData.droop);
        P.spiderLegs.push(leg);
      }
      M.inner.scale.setScalar(0.7);
      return finishModel(M, 0.5, 0.7, 9);
    },

    silverfish() {
      const S = silverfishSheet(), M = newMobModel(S), P = M.parts;
      P.segs = SILVER_SEGS.map(([w, h, d], i) => limb(M, 'seg' + i, [0, 0, SILVER_Z[i]], [-w / 2, 0, SILVER_Z[i] - d / 2]));
      boxIn(P.segs[2], M, 'layer0', [-5, 0, SILVER_Z[2] - 1.5]);
      boxIn(P.segs[4], M, 'layer1', [-3, 0, SILVER_Z[4] - 1.5]);
      boxIn(P.segs[1], M, 'layer2', [-3, 0, SILVER_Z[1] - 1]);
      remember(...P.segs);
      M.inner.scale.setScalar(0.55);
      P.head = null;
      return finishModel(M, 0.3, 0.4, 2);
    },

    phantom() {
      const S = phantomSheet(), M = newMobModel(S), P = M.parts;
      P.body = pivotAt(M.inner, [0, 4, 0]);
      boxIn(P.body, M, 'body', [-2.5, 2.5, -4.5]);
      P.head = sub(P.body, [0, 4, 4.5]); boxIn(P.head, M, 'head', [-3.5, 2.5, 4.5]);
      glowLayer(M, P.head, 'eyes', [-3.5, 2.5, 4.5]);
      P.head.rotation.x = 0.2;
      P.wingR = sub(P.body, [-2.5, 5, 0]); boxIn(P.wingR, M, 'wingBase', [-8.5, 4, -4.5]);
      P.tipR = sub(P.wingR, [-8.5, 5, 0]); boxIn(P.tipR, M, 'wingTip', [-21.5, 4.5, -4.5]);
      P.wingL = sub(P.body, [2.5, 5, 0]); boxIn(P.wingL, M, 'wingBase', [2.5, 4, -4.5]);
      P.tipL = sub(P.wingL, [8.5, 5, 0]); boxIn(P.tipL, M, 'wingTip', [8.5, 4.5, -4.5]);
      P.tail = sub(P.body, [0, 4, -4.5]); boxIn(P.tail, M, 'tailBase', [-1.5, 3, -10.5]);
      P.tailTip = sub(P.tail, [0, 4, -10.5]); boxIn(P.tailTip, M, 'tailTip', [-0.5, 3.5, -16.5]);
      return finishModel(M, 0.5, 0.9, 4);
    },

    polar_bear() {
      const S = polarBearSheet(), M = newMobModel(S), P = M.parts;
      P.rear = pivotAt(M.inner, [0, 0, -4]);
      P.legBL = limbIn(M, P.rear, 'legB', [-4.5, 10, -4], [-6.5, 0, -8]);
      P.legBR = limbIn(M, P.rear, 'legB', [4.5, 10, -4], [2.5, 0, -8]);
      P.legFL = limbIn(M, P.rear, 'legF', [-4.5, 10, 4], [-6.5, 0, 1]);
      P.legFR = limbIn(M, P.rear, 'legF', [4.5, 10, 4], [2.5, 0, 1]);
      P.body = limbIn(M, P.rear, 'body', [0, 14, 0], [-7, 9, -8]);
      P.head = limbIn(M, P.rear, 'head', [0, 16, 6], [-3.5, 12, 6]);
      boxIn(P.head, M, 'mouth', [-2.5, 12, 13]);
      boxIn(P.head, M, 'ear', [-4.5, 19, 8]); boxIn(P.head, M, 'ear', [2.5, 19, 8]);
      return finishModel(M, 1.4, 1.4, 16);
    },

    horse() {
      const S = horseSheet('brown'), M = newMobModel(S), P = M.parts;
      for (const [n, x, z] of [['legFL', -3, 8], ['legFR', 3, 8], ['legBL', -3, -8], ['legBR', 3, -8]]) P[n] = limb(M, 'leg', [x, 11, z], [x - 2, 0, z - 2]);
      P.body = limb(M, 'body', [0, 16, 0], [-5, 11, -11]);
      P.neck = limb(M, 'neck', [0, 18, 9], [-2, 16, 6]);
      boxIn(P.neck, M, 'mane', [-1, 15, 4.5]);
      P.head = sub(P.neck, [0, 28, 9]);
      boxIn(P.head, M, 'skull', [-3, 26, 6.5]);
      boxIn(P.head, M, 'muzzle', [-2, 25, 13.5]);
      boxIn(P.head, M, 'ear', [-2.5, 31, 8]); boxIn(P.head, M, 'ear', [0.5, 31, 8]);
      P.tail = limb(M, 'tail', [0, 20, -11], [-1.5, 6, -13]);
      P.neck.rotation.x = 0.5; P.head.rotation.x = 0.45; P.tail.rotation.x = 0.45;
      return finishModel(M, 1.6, 1.4, 28);
    },
  };

  // Our types build here; everything else goes to the existing builders
  // eslint-disable-next-line no-func-assign
  buildModel = ((orig) => function (type) {
    if (BUILD[type]) return shadeModel(BUILD[type]());
    return orig(type);
  })(buildModel);

  // Texture variants: swap the skin when the wanted one changes
  function skin(m, sheet) {
    if (m.model._skin === sheet) return;
    m.model._skin = sheet;
    m.model.mat.map = sheet.tex;
    if (m.model.glowMat) m.model.glowMat.map = sheet.tex;
  }

  // ---------------------------------------------------------------- shared state helpers
  const DIFF = (g, arr) => arr[Math.max(0, Math.min(3, g.difficulty | 0))];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
  function turn(m, dt, rate = 8) { m.yaw += wrapA(m.targetYaw - m.yaw) * Math.min(1, dt * rate); }
  const hdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  function goalOf(m) { return m._m3goal || (m._m3goal = new THREE.Vector3()); }
  // Nearest player of any mode but spectator, with whether they sneak (for skittish animals)
  function nearPlayer(m, range) {
    const g = m.game, p = g.player;
    let best = null, bd = range;
    if (p && !p.dead && p.mode !== 'spectator') { const d = p.pos.distanceTo(m.pos); if (d < bd) { bd = d; best = { pos: p.pos, d, sneak: p.sneaking, local: true }; } }
    for (const rp of g.remotePlayers.values()) {
      if (rp.mode === 'spectator' || rp.dim !== g.world.dim) continue;
      const d = rp.pos.distanceTo(m.pos);
      if (d < bd) { bd = d; best = { pos: rp.pos, d, sneak: rp.sneak, peer: rp.peer }; }
    }
    return best;
  }
  function nearMob(m, types, range, pred) {
    let best = null, bd = range;
    for (const o of m.game.mobs.values()) {
      if (o === m || o.dead || !types[o.type] || (pred && !pred(o))) continue;
      const d = o.pos.distanceTo(m.pos);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  function wet(m, frac = 0.6) { return boxInBlock(m.game.world, m.pos, m.w, m.h * frac, isWater); }
  function sunBurn(m, dt, inWater) {
    const g = m.game, w = g.world;
    m._burning = false;
    if (g.daylight > 0.75 && !inWater && w.dim === 0 && !(g.weather && g.weather.rain > 0.5)) {
      const l = w.getLight(Math.floor(m.pos.x), Math.floor(m.pos.y + Math.min(m.h, 1.6)), Math.floor(m.pos.z));
      if (l.sky >= 15) {
        m._burning = true;
        m.burnTimer += dt;
        if (Math.random() < dt * 8) puff(g, m.pos.x, m.pos.y + m.h * 0.6, m.pos.z, Math.random() < 0.5 ? 0xffa020 : 0xffe060, 1, { spread: m.w, size: 0.1, up: 1.5, speed: 0.5, life: 0.5 });
        if (m.burnTimer >= 1) { m.burnTimer = 0; m.hurt(1, 0, 0, 'env'); m.vel.x = 0; m.vel.z = 0; }
      }
    }
  }
  function lavaBurn(m, dt, inLava) {
    if (!inLava) return;
    m.burnTimer += dt;
    if (m.burnTimer >= 0.5) { m.burnTimer = 0; m.hurt(4, 0, 0, 'env'); }
  }
  function tidy(m) { if (m.pos.y < -30) m.deathTime = 99; }

  // ---------------------------------------------------------------- voices
  // Synth sounds; Sound.mob / Sound.mobHurt route our types here. `ctx` is the mob making the
  // sound when we know it (sleeping foxes snore, angry bees buzz higher, cubs squeak).
  let voiceMob = null;
  const tone = (...a) => Sound.tone(...a), hiss = (...a) => Sound.noise(...a);
  const SYN = {
    rabbit: {
      amb(pos) { for (let i = 0; i < 3; i++) hiss(5200, 3, 0.035, 0.1, 'bandpass', { delay: i * 0.08, pos }); },
      hurt(pos) { tone(1300, 0.12, 0.35, 'sawtooth', 500, { formant: [2200, 1800], q: 3, pos }); },
    },
    fox: {
      amb(pos, m) {
        if (m && m.m3sleep) { hiss(240, 1.2, 0.9, 0.16, 'lowpass', { attack: 0.45, pos }); return; }
        if (m && m.game.daylight < 0.35 && Math.random() < 0.3) { tone(1100, 0.55, 0.32, 'sawtooth', -500, { formant: [2200, 1400], q: 4, vibrato: [14, 40], pos }); return; }
        tone(720, 0.11, 0.34, 'sawtooth', -260, { formant: [1400, 900], q: 3, pos });
        tone(640, 0.1, 0.3, 'sawtooth', -220, { formant: [1300, 850], q: 3, delay: 0.16, pos });
      },
      hurt(pos) { tone(900, 0.18, 0.45, 'sawtooth', 600, { formant: [1800, 1200], q: 3, pos }); },
    },
    cat: {
      amb(pos, m) {
        if (m && m.m3sleep && Math.random() < 0.6) { SYN.cat.purr(pos); return; }
        tone(520 + Math.random() * 80, 0.55, 0.36, 'sawtooth', 120, { formant: [700, 1500, 900], q: 4, vibrato: [5, 12], attack: 0.06, pos });
      },
      purr(pos) { tone(52, 1.4, 0.3, 'sawtooth', 0, { formant: [300], q: 1.5, tremolo: 24, attack: 0.3, pos }); },
      hurt(pos) { tone(720, 0.25, 0.4, 'sawtooth', 300, { formant: [1600, 1100], q: 3, pos }); hiss(3500, 1, 0.2, 0.15, 'highpass', { pos }); },
    },
    bat: {
      amb(pos) { for (let i = 0; i < 3; i++) tone(3200 + Math.random() * 1400, 0.035, 0.16, 'square', 700, { delay: i * 0.07, formant: [4000], q: 2, pos }); },
      hurt(pos) { tone(3800, 0.1, 0.26, 'square', -1200, { formant: [4200], q: 2, pos }); },
    },
    squid: {
      amb(pos) { hiss(500, 1, 0.5, 0.2, 'lowpass', { sweep: 180, attack: 0.08, pos }); for (let i = 0; i < 3; i++) tone(500 + Math.random() * 600, 0.05, 0.08, 'sine', 300, { delay: 0.1 + i * 0.08, pos }); },
      hurt(pos) { hiss(700, 1.5, 0.25, 0.35, 'lowpass', { sweep: 200, pos }); tone(260, 0.2, 0.2, 'sine', -120, { pos }); },
      ink(pos) { hiss(400, 0.8, 0.5, 0.35, 'lowpass', { sweep: 120, pos, attack: 0.02 }); },
    },
    bee: {
      amb(pos, m) {
        const angry = m && (m.angry > 0 || m.m3angry);
        tone(angry ? 265 : 215, 0.9, angry ? 0.3 : 0.17, 'sawtooth', angry ? 12 : -6, { formant: [angry ? 900 : 650], q: 1.5, tremolo: 32, attack: 0.15, pos });
      },
      hurt(pos) { tone(330, 0.25, 0.35, 'sawtooth', 120, { formant: [1100], q: 2, tremolo: 40, pos }); },
      sting(pos) { hiss(2600, 2, 0.08, 0.35, 'bandpass', { pos }); },
    },
    goat: {
      amb(pos, m) {
        if (m && m.m3special) { tone(620, 0.8, 0.38, 'sawtooth', 200, { formant: [1500, 1900, 1200], q: 4, vibrato: [8, 40], pos }); return; }
        tone(310 + Math.random() * 40, 0.5, 0.34, 'square', -30, { formant: [850, 700], q: 3, tremolo: 9, attack: 0.03, pos });
      },
      hurt(pos) { tone(420, 0.25, 0.4, 'square', -60, { formant: [1000, 800], q: 3, tremolo: 12, pos }); },
      ram(pos) { hiss(180, 0.8, 0.35, 0.8, 'lowpass', { pos, wet: 0.3 }); tone(90, 0.2, 0.5, 'sine', -40, { pos }); },
      stamp(pos) { hiss(300, 1, 0.08, 0.3, 'lowpass', { pos }); },
    },
    husk: {
      amb(pos) { tone(66 + Math.random() * 10, 1.0, 0.45, 'sawtooth', -10, { formant: [260, 320, 220], q: 3, vibrato: [3, 2], attack: 0.18, pos }); hiss(900, 0.7, 0.9, 0.2, 'bandpass', { attack: 0.2, pos }); },
      hurt(pos) { tone(115, 0.3, 0.45, 'sawtooth', -35, { formant: [400, 280], q: 3, pos }); hiss(1200, 0.8, 0.25, 0.2, 'bandpass', { pos }); },
    },
    stray: {
      amb(pos) { for (let i = 0; i < 5; i++) tone(600 + Math.random() * 400, 0.025, 0.2, 'square', -260, { delay: i * 0.05, formant: [800], q: 2, pos }); hiss(3000, 0.6, 0.8, 0.1, 'highpass', { attack: 0.3, pos }); },
      hurt(pos) { for (let i = 0; i < 3; i++) tone(820, 0.03, 0.28, 'square', -380, { delay: i * 0.04, pos }); hiss(2600, 0.7, 0.2, 0.12, 'highpass', { pos }); },
    },
    drowned: {
      amb(pos) { tone(76 + Math.random() * 12, 0.9, 0.4, 'sawtooth', -12, { formant: [300, 360, 240], q: 4, vibrato: [5, 4], attack: 0.15, pos }); for (let i = 0; i < 4; i++) tone(300 + Math.random() * 700, 0.04, 0.1, 'sine', 400, { delay: 0.2 + i * 0.12, pos }); },
      hurt(pos) { tone(125, 0.3, 0.45, 'sawtooth', -40, { formant: [430, 300], q: 4, pos }); hiss(600, 1, 0.2, 0.2, 'lowpass', { sweep: 200, pos }); },
    },
    witch: {
      amb(pos) { for (let i = 0; i < 4; i++) tone(540 - i * 34, 0.09, 0.32, 'sawtooth', -60, { formant: [1000, 820], q: 3, delay: i * 0.13, pos }); },
      hurt(pos) { tone(300, 0.22, 0.42, 'sawtooth', -80, { formant: [900, 600], q: 3, pos }); },
      drink(pos) { for (let i = 0; i < 4; i++) hiss(480, 1.5, 0.07, 0.3, 'lowpass', { delay: i * 0.32, pos }); },
      throw(pos) { hiss(1400, 0.7, 0.25, 0.25, 'bandpass', { sweep: 500, pos }); tone(500, 0.06, 0.2, 'sawtooth', 150, { formant: [1000], q: 3, delay: 0.02, pos }); },
    },
    cave_spider: {
      amb(pos) { for (let i = 0; i < 3; i++) hiss(3800, 2.4, 0.1, 0.24, 'bandpass', { delay: i * 0.12, pos }); },
      hurt(pos) { hiss(1200, 1.2, 0.18, 0.38, 'bandpass', { pos }); },
    },
    silverfish: {
      amb(pos) { for (let i = 0; i < 5; i++) tone(2600 + Math.random() * 1200, 0.025, 0.12, 'square', -400, { delay: i * 0.045, formant: [3000], q: 3, pos }); },
      hurt(pos) { tone(2200, 0.15, 0.25, 'square', 600, { formant: [2800], q: 3, pos }); },
    },
    phantom: {
      amb(pos) { tone(880 + Math.random() * 120, 0.7, 0.32, 'sawtooth', -420, { formant: [1700, 1100], q: 5, vibrato: [11, 30], attack: 0.05, pos, wet: 0.5 }); },
      hurt(pos) { tone(1100, 0.3, 0.4, 'sawtooth', -500, { formant: [2000, 1300], q: 4, pos }); },
      flap(pos) { hiss(420, 0.8, 0.22, 0.22, 'lowpass', { attack: 0.06, pos }); },
      bite(pos) { hiss(1800, 1.5, 0.08, 0.4, 'bandpass', { pos }); tone(300, 0.08, 0.3, 'square', -150, { pos }); },
      swoop(pos) { tone(1400, 0.6, 0.35, 'sawtooth', -900, { formant: [2400, 1200], q: 4, pos, wet: 0.5 }); },
    },
    polar_bear: {
      amb(pos, m) {
        if (m && m.size < 1) { tone(230, 0.45, 0.36, 'sawtooth', 40, { formant: [900, 1100], q: 4, vibrato: [6, 6], attack: 0.06, pos }); return; }
        tone(90 + Math.random() * 14, 0.9, 0.42, 'sawtooth', -12, { formant: [380, 300, 260], q: 4, vibrato: [5, 3], attack: 0.1, pos });
      },
      hurt(pos, m) { const cub = m && m.size < 1; tone(cub ? 300 : 140, 0.3, 0.45, 'sawtooth', -50, { formant: cub ? [1000, 800] : [500, 350], q: 3, pos }); },
      warn(pos) { tone(110, 1.0, 0.55, 'sawtooth', -30, { formant: [520, 380], q: 3, vibrato: [7, 6], attack: 0.08, pos }); hiss(300, 0.7, 0.9, 0.3, 'lowpass', { attack: 0.08, pos }); },
    },
    horse: {
      amb(pos) {
        if (Math.random() < 0.4) { hiss(900, 1, 0.3, 0.3, 'bandpass', { sweep: 400, pos }); return; }
        tone(560 + Math.random() * 60, 0.9, 0.34, 'sawtooth', -260, { formant: [1100, 1500, 900], q: 4, vibrato: [8, 30], attack: 0.04, pos });
      },
      hurt(pos) { tone(700, 0.3, 0.4, 'sawtooth', -200, { formant: [1300, 900], q: 4, pos }); },
    },
  };
  {
    const mob = Sound.mob, mobHurt = Sound.mobHurt;
    Sound.mob = function (type, pos) {
      const s = SYN[type];
      if (s) { s.amb(pos, voiceMob && voiceMob.type === type ? voiceMob : null); return; }
      return mob.call(this, type, pos);
    };
    Sound.mobHurt = function (type, pos) {
      const s = SYN[type];
      if (s) { s.hurt(pos, voiceMob && voiceMob.type === type ? voiceMob : null); return; }
      return mobHurt.call(this, type, pos);
    };
  }
  // A mob's ambient call (through Sound.mob, so volume categories and subtitles apply)
  function speak(m) { voiceMob = m; try { Sound.mob(m.type, m.pos); } finally { voiceMob = null; } }
  function ambient(m, dt, lo, hi, range = 24) {
    m.ambient -= dt;
    if (m.ambient > 0) return;
    m.ambient = rnd(lo, hi);
    if (m.game.player && m.game.player.pos.distanceTo(m.pos) < range) speak(m);
  }
  // An extra sound (ram, sting, drink...), in the mob's volume category
  function sfx(m, name) {
    const s = SYN[m.type] && SYN[m.type][name];
    if (!s || !m.game.player || m.game.player.pos.distanceTo(m.pos) > 32) return;
    const prev = Sound._cat;
    Sound._cat = m.info.hostile || m.info.neutral ? 'hostile' : 'friendly';
    try { s(m.pos, m); } finally { Sound._cat = prev; }
  }

  // ---------------------------------------------------------------- particles
  // Small coloured cubes: ink clouds, potion splashes, flames on burning undead.
  const FX_GEO = new THREE.BoxGeometry(1, 1, 1);
  const FX_MATS = new Map();
  function fxMat(hex, opacity) {
    const k = hex + ':' + opacity;
    let m = FX_MATS.get(k);
    if (!m) { m = new THREE.MeshBasicMaterial({ color: hex, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }); FX_MATS.set(k, m); }
    return m;
  }
  function fxState(g) { const P = g.particles; return P.m3 || (P.m3 = { parts: [], pots: [] }); }
  function puff(g, x, y, z, hex, n, o = {}) {
    if (!g || !g.particles) return;
    const L = fxState(g).parts;
    const sp = o.speed ?? 2, spread = o.spread ?? 0.4;
    for (let i = 0; i < n && L.length < 500; i++) {
      const mesh = new THREE.Mesh(FX_GEO, fxMat(hex, o.opacity ?? 1));
      mesh.scale.setScalar((o.size ?? 0.12) * rnd(0.6, 1.4));
      mesh.position.set(x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.5) * spread, z + (Math.random() - 0.5) * spread);
      g.scene.add(mesh);
      L.push({ mesh, life: (o.life ?? 0.8) * rnd(0.6, 1.2), grav: o.grav ?? 0, drag: o.drag ?? 0, grow: o.grow ?? 0,
        vel: new THREE.Vector3((Math.random() - 0.5) * sp, (Math.random() - 0.4) * sp + (o.up ?? 0), (Math.random() - 0.5) * sp) });
    }
  }
  function updateParts(g, dt) {
    const L = fxState(g).parts;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) { g.scene.remove(p.mesh); L[i] = L[L.length - 1]; L.pop(); continue; }
      p.vel.y -= p.grav * dt;
      if (p.drag) p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.grow) p.mesh.scale.multiplyScalar(1 + p.grow * dt);
    }
  }
  function inkBurst(m) {
    const g = m.game, c = m.pos;
    puff(g, c.x, c.y + 0.4, c.z, 0x0c0c14, 26, { size: 0.22, spread: 0.6, speed: 2.2, drag: 2.2, grow: 0.9, life: 1.6, opacity: 0.85 });
    puff(g, c.x, c.y + 0.4, c.z, 0x202032, 12, { size: 0.16, spread: 0.5, speed: 1.6, drag: 2, grow: 0.7, life: 1.3, opacity: 0.7 });
    sfx(m, 'ink');
  }

  // ---------------------------------------------------------------- status effects
  // p.m3fx = { poison, slow, hunger } in seconds left. Poison takes a heart every 1.25 s (never
  // the last one), slowness cuts walking speed by about a third, hunger drains food.
  function addFx(p, fx) {
    if (!p || !fx || !p.usesHealth || p.dead) return;
    const e = p.m3fx || (p.m3fx = {});
    for (const k of ['poison', 'slow', 'hunger']) if (+fx[k] > 0) e[k] = Math.max(e[k] || 0, Math.min(60, +fx[k]));
  }
  // target: a player from game.allPlayers()/nearestTarget, 'local', or a RemotePlayer
  function giveFx(g, target, fx) {
    if (!fx) return;
    if (target === 'local' || target.local) addFx(g.player, fx);
    else if (target.peer && g.net && g.net.active) g.net.send('hurt', { to: target.peer, dmg: 0, fx });
  }
  {
    const tick = Player.prototype.tickStats;
    Player.prototype.tickStats = function (dt) {
      tick.call(this, dt);
      const e = this.m3fx;
      if (!e) return;
      if (!this.usesHealth || this.dead) { this.m3fx = null; return; }
      if (e.poison > 0) {
        e.poison -= dt; e.pt = (e.pt || 0) + dt;
        if (e.pt >= 1.25) { e.pt = 0; if (this.health > 1) { this.health = Math.max(1, this.health - 1); this.hurtTime = 0.3; Sound.hurt(); } }
      }
      if (e.slow > 0) e.slow -= dt;
      if (e.hunger > 0) { e.hunger -= dt; this.exhaustion += 0.5 * dt; }
      if (!(e.poison > 0) && !(e.slow > 0) && !(e.hunger > 0)) this.m3fx = null;
    };
    const step = Player.prototype.step;
    Player.prototype.step = function (dt) {
      step.call(this, dt);
      const e = this.m3fx;
      if (e && e.slow > 0 && !this.flying) { const f = Math.pow(0.87, dt * 60); this.vel.x *= f; this.vel.z *= f; }
    };
    // Time since the player last slept (phantoms come after three days without sleep)
    const ser = Player.prototype.serialize, load = Player.prototype.load;
    Player.prototype.serialize = function () { const d = ser.call(this); d.m3rest = Math.round(this.m3rest || 0); return d; };
    Player.prototype.load = function (d) { load.call(this, d); this.m3rest = d && +d.m3rest > 0 ? +d.m3rest : 0; };
  }
  let hudKey = '', hudBox = null;
  function updateHud(g) {
    const p = g.player, e = p && p.m3fx;
    const secs = (v) => (v > 0 ? Math.ceil(v) : 0);
    const key = e ? `${secs(e.poison)}|${secs(e.slow)}|${secs(e.hunger)}` : '';
    if (key === hudKey) return;
    hudKey = key;
    const hearts = document.getElementById('hearts'), food = document.getElementById('food');
    if (hearts) hearts.style.filter = e && e.poison > 0 ? 'hue-rotate(75deg) saturate(1.3)' : '';
    if (food) food.style.filter = e && e.hunger > 0 ? 'hue-rotate(65deg) saturate(0.8) brightness(0.9)' : '';
    if (!hudBox) {
      const hud = document.getElementById('hud');
      if (!hud) return;
      hudBox = document.createElement('div');
      hudBox.id = 'm3-effects';
      hudBox.style.cssText = 'position:fixed;top:8px;right:10px;display:flex;flex-direction:column;gap:3px;align-items:flex-end;font:16px var(--font-ui, monospace);color:#fff;text-shadow:2px 2px 0 #222;pointer-events:none';
      hud.appendChild(hudBox);
    }
    hudBox.textContent = '';
    if (!e) return;
    const row = (name, color, s) => {
      if (!(s > 0)) return;
      const d = document.createElement('div');
      d.style.cssText = 'background:rgba(0,0,0,.45);padding:2px 7px;border-left:6px solid ' + color;
      d.textContent = `${name} ${Math.floor(s / 60)}:${String(Math.ceil(s) % 60).padStart(2, '0')}`;
      hudBox.appendChild(d);
    };
    row('Poison', '#4e9331', e.poison); row('Slowness', '#5a6c81', e.slow); row('Hunger', '#587653', e.hunger);
  }

  // ---------------------------------------------------------------- witches' splash potions
  // Thrown bottles fly in an arc and shatter on a block or a player, hurting and slowing every
  // player within 4 blocks. Only the host simulates hits; clients draw copies (see the hooks).
  function throwPotion(g, owner, kind, from, vel, remote = false) {
    const M = potionModel(kind);
    M.root.position.copy(from);
    g.scene.add(M.root);
    fxState(g).pots.push({ kind, pos: from.clone(), vel: vel.clone(), M, age: 0, owner, remote });
  }
  function disposePot(g, q) {
    g.scene.remove(q.M.root);
    q.M.mat.dispose();
    q.M.root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  }
  function updatePots(g, dt) {
    const L = fxState(g).pots;
    for (let i = L.length - 1; i >= 0; i--) {
      const q = L[i];
      q.age += dt;
      q.vel.y -= 20 * dt;
      const len = q.vel.length() * dt, dir = q.vel.clone().normalize();
      let at = null;
      const hit = g.world.raycast(q.pos, dir, len);
      if (hit && isSolid(hit.id)) at = q.pos.clone().addScaledVector(dir, Math.max(0, hit.dist - 0.1));
      if (!at && !q.remote) {
        for (const t of g.allPlayers()) {
          if (t.mode === 'spectator') continue;
          const p = t.pos, k = rayAABB(q.pos, dir, p.x - 0.45, p.y, p.z - 0.45, p.x + 0.45, p.y + 1.85, p.z + 0.45, len);
          if (k !== null) { at = q.pos.clone().addScaledVector(dir, k); break; }
        }
      }
      if (at || q.age > 6 || q.pos.y < -20) {
        if (at) splash(g, q, at);
        disposePot(g, q); L.splice(i, 1);
        continue;
      }
      q.pos.addScaledVector(dir, len);
      q.M.root.position.copy(q.pos);
      q.M.root.rotation.x += dt * 9; q.M.root.rotation.z += dt * 4;
      const l = g.lightAt(q.pos.x, q.pos.y, q.pos.z);
      q.M.mat.color.setRGB(l, l, l);
    }
  }
  function splash(g, q, at) {
    const hex = POT[q.kind].hex;
    puff(g, at.x, at.y + 0.2, at.z, hex, 24, { size: 0.1, spread: 0.5, speed: 5, up: 2, grav: 9, life: 0.7 });
    puff(g, at.x, at.y + 0.2, at.z, 0xffffff, 6, { size: 0.08, spread: 0.3, speed: 3, up: 1, grav: 6, life: 0.4 });
    Sound.glassBreak(at);
    if (q.remote) return;
    for (const t of g.allPlayers()) {
      if (t.mode !== 'survival' && t.mode !== 'adventure') continue;
      const d = Math.hypot(t.pos.x - at.x, t.pos.z - at.z), dy = Math.abs(t.pos.y + 0.9 - at.y);
      if (d > 4 || dy > 3) continue;
      const k = Math.max(0.25, 1 - d / 4);
      const kx = (t.pos.x - at.x) / (d || 1), kz = (t.pos.z - at.z) / (d || 1);
      let dmg = 0, fx;
      if (q.kind === 'harm') { dmg = DIFF(g, [0, 3, 4, 6]) * k; fx = { slow: 3 * k }; }
      else if (q.kind === 'slow') { dmg = 1; fx = { slow: 10 * k }; }
      else if (q.kind === 'poison') { dmg = 1; fx = { poison: 6 * k, slow: 3 * k }; }
      if (dmg >= 0.5) g.damagePlayer(t, Math.round(dmg), { x: kx * 2, y: 2.5, z: kz * 2 }, 'magic');
      giveFx(g, t, fx);
    }
  }

  // ---------------------------------------------------------------- per-type setup
  const FOX_ITEMS = [0, ITEM.FEATHER, ITEM.LEATHER, ITEM.WHEAT, ITEM.EMERALD];
  Object.assign(MOB_INIT, {
    rabbit(extra) { this.variant = extra.variant ?? 0; },
    fox(extra) { this.variant = extra.variant ?? 0; this.m3held = extra.held ?? (Math.random() < 0.2 ? 1 + Math.floor(Math.random() * 4) : 0); this.pounceCd = 0; this.preyT = 0; },
    cat(extra) { this.variant = extra.variant ?? Math.floor(Math.random() * CAT_V.length); this.home = extra.home || null; this.sitT = 0; },
    bat() { this.m3sleep = false; this.flyGoal = null; },
    squid() { this.swimDir = null; this.swimT = 0; this.pulse = Math.random(); this.airTime = 0; },
    bee(extra) { this.home = extra.home || [this.pos.x, this.pos.y, this.pos.z]; this.flower = null; this.flowerT = 0; this.scanT = 0; this.stung = false; },
    goat(extra) { this.m3special = extra.screamer ?? Math.random() < 0.02; this.ramCd = rnd(10, 40); this.leapCd = rnd(5, 15); this.ram = null; },
    witch() { this.drinking = 0; this.potionCd = 0; },
    phantom() { this.state = 'circle'; this.anchor = null; this.swoopCd = rnd(2, 6); this.circleA = Math.random() * 6.3; this.stateT = 0; },
    polar_bear(extra) {
      this.size = extra.size === 0.5 || extra.baby ? 0.5 : 1;
      if (this.size < 1) { this.model.inner.scale.setScalar(0.5); this.model.parts.head.scale.setScalar(1.4); this.w *= 0.5; this.h *= 0.5; }
      this.rearT = 0;
    },
    horse(extra) { this.variant = extra.variant ?? Math.floor(Math.random() * HORSE_V.length); this.grazeT = 0; },
    stray() {
      this._giveWeapon(ITEM.BOW);
      const arm = this.model.parts.armR, bow = arm && arm.children.find((c) => c.isMesh && c.material === this.game.entityMat);
      if (bow) { bow.rotation.set(0, Math.PI / 2, -Math.PI / 4); bow.position.set(0, -0.62, 0.05); }
    },
  });
  for (const t of NEW) {
    const init = MOB_INIT[t];
    MOB_INIT[t] = function (extra) { hookGame(); if (init) init.call(this, extra || {}); };
  }

  // ---------------------------------------------------------------- AI
  // Wander, or run about when panicking (passive mobs), like the default AI
  function roam(m, dt, speedMul = 1) {
    if (m.panic > 0) {
      m.panic -= dt;
      m.wanderTimer -= dt;
      if (m.wanderTimer <= 0 || !m.wanderDir) { const a = Math.random() * Math.PI * 2; m.wanderDir = [Math.cos(a), Math.sin(a)]; m.wanderTimer = 1; }
      m.targetYaw = Math.atan2(-m.wanderDir[0], -m.wanderDir[1]);
      return m._locomote(dt, m.wanderDir[0], m.wanderDir[1], m.info.speed * 1.8 * speedMul);
    }
    return m._seek(dt, null, m.info.speed * speedMul);
  }
  function flee(m, dt, from, speed) {
    const dx = m.pos.x - from.x, dz = m.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
    const goal = goalOf(m).set(m.pos.x + dx / d * 8, m.pos.y, m.pos.z + dz / d * 8);
    return m._seek(dt, goal, speed, 0.5);
  }
  function stand(m, dt) { return m._locomote(dt, 0, 0, 0); }
  // Fly toward a point (bats, bees, phantoms): no gravity, no pathfinding
  function flyTo(m, dt, gx, gy, gz, speed, accel = 2.5) {
    const dx = gx - m.pos.x, dy = gy - m.pos.y, dz = gz - m.pos.z, d = Math.hypot(dx, dy, dz) || 1;
    const k = Math.min(1, dt * accel), s = Math.min(speed, d * 2.5);
    m.vel.x += (dx / d * s - m.vel.x) * k;
    m.vel.y += (dy / d * s - m.vel.y) * k;
    m.vel.z += (dz / d * s - m.vel.z) * k;
    const res = moveBody(m.game.world, m, dt, { stepHeight: 0 });
    if (Math.hypot(m.vel.x, m.vel.z) > 0.3) m.targetYaw = Math.atan2(-m.vel.x, -m.vel.z);
    turn(m, dt, 5);
    m.walkPhase += dt * 6;
    m.walkAmount = Math.min(1, Math.hypot(m.vel.x, m.vel.z) / 2);
    return res;
  }
  // Chase and hit like a zombie. Returns true on the frame a hit lands.
  function brawl(m, dt, t, dmg, reach = 1.6) {
    m._seek(dt, t.pos, m.info.speed, 1);
    const before = m.attackCooldown;
    m._melee(t, DIFF(m.game, dmg), reach);
    return m.attackCooldown > before;
  }
  function solidAt(w, x, y, z) { return isSolid(w.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))); }
  const PREY = { chicken: 1, rabbit: 1 };
  function killDrops(g, prey) {
    // a kill by an animal drops the loot but no experience
    if (!prey.dead || prey._dropped) return;
    prey._dropped = true;
    for (const [id, n] of mobDrops(prey.type, Math.random)) if (n > 0) g.spawnItem(stackOf(id, n), prey.pos.x, prey.pos.y + 0.5, prey.pos.z);
  }

  Object.assign(MOB_AI, {
    rabbit(dt) {
      const g = this.game;
      const threat = nearPlayer(this, 6) || nearMob(this, { fox: 1, wolf: 1, cat: 1 }, 7);
      let res;
      if (threat && !(threat.sneak && threat.d > 2.5)) res = flee(this, dt, threat.pos, this.info.speed * 1.3);
      else res = roam(this, dt, 0.8);
      // hop: rabbits move in bounces
      if (this.onGround && Math.hypot(this.vel.x, this.vel.z) > 0.4) this.vel.y = 5.2;
      lavaBurn(this, dt, res && res.inLava);
      ambient(this, dt, 6, 16, 12);
      tidy(this);
      void g;
    },

    fox(dt) {
      const g = this.game, day = g.daylight > 0.6;
      const pl = nearPlayer(this, 6);
      if (this.m3sleep) {
        if (!day || this.hurtTime > 0 || this.panic > 0 || (pl && pl.d < 3 && !pl.sneak) || wet(this)) this.m3sleep = false;
        else { stand(this, dt); ambient(this, dt, 4, 8, 10); return; }
      }
      this.m3pose = false;
      this.pounceCd -= dt;
      let res;
      if (this.panic > 0) res = roam(this, dt, 1.1);
      else if (pl && pl.d < 5 && !pl.sneak) res = flee(this, dt, pl.pos, this.info.speed * 1.4);
      else if (!day) {
        // hunt: stalk low and slow, then pounce
        this.preyT -= dt;
        if (this.preyT <= 0 || (this.prey && (this.prey.dead || this.prey.pos.distanceTo(this.pos) > 18))) {
          this.preyT = 1;
          this.prey = nearMob(this, PREY, 14);
        }
        const prey = this.prey;
        if (prey) {
          const d = hdist(prey.pos, this.pos);
          if (d > 3.5) { this.m3pose = true; res = this._seek(dt, prey.pos, this.info.speed * 0.5, 1); }
          else {
            res = this._seek(dt, prey.pos, this.info.speed * 1.2, 0.6);
            if (this.onGround && this.pounceCd <= 0 && d > 1.2) {
              this.pounceCd = 2.5;
              this.vel.y = 7.5;
              this.vel.x = (prey.pos.x - this.pos.x) / d * 5; this.vel.z = (prey.pos.z - this.pos.z) / d * 5;
            }
          }
          this._melee(prey, 2, 1.4);
          if (prey.dead) { killDrops(g, prey); this.prey = null; }
        } else res = roam(this, dt);
      } else {
        res = roam(this, dt, 0.8);
        if (!this.wanderDir && Math.random() < dt * 0.08) this.m3sleep = true;
      }
      lavaBurn(this, dt, res && res.inLava);
      ambient(this, dt, 8, 22, 16);
      tidy(this);
    },

    cat(dt) {
      const g = this.game;
      if (this.m3sleep) {
        this.sitT -= dt;
        const pl = nearPlayer(this, 2);
        if (this.sitT <= 0 || this.hurtTime > 0 || this.panic > 0 || wet(this) || (pl && !pl.sneak && Math.random() < dt * 0.3)) this.m3sleep = false;
        else { stand(this, dt); ambient(this, dt, 6, 14, 10); return; }
      }
      let res;
      const pl = nearPlayer(this, 3);
      if (this.panic > 0) res = roam(this, dt, 1.1);
      else if (pl && pl.d < 2.2 && !pl.sneak) res = flee(this, dt, pl.pos, this.info.speed);
      else {
        // stray cats chase rabbits now and then
        if (!this.prey && Math.random() < dt * 0.05) this.prey = nearMob(this, { rabbit: 1 }, 10);
        if (this.prey && !this.prey.dead && this.prey.pos.distanceTo(this.pos) < 16) {
          res = this._seek(dt, this.prey.pos, this.info.speed * 1.4, 0.8);
          this._melee(this.prey, 3, 1.3);
          if (this.prey.dead) { killDrops(g, this.prey); this.prey = null; }
        } else {
          this.prey = null;
          res = roam(this, dt, 0.8);
          if (!this.wanderDir && Math.random() < dt * 0.06) { this.m3sleep = true; this.sitT = rnd(8, 25); }
        }
      }
      lavaBurn(this, dt, res && res.inLava);
      ambient(this, dt, 10, 30, 16);
      tidy(this);
    },

    bat(dt) {
      const g = this.game, w = g.world;
      const cx = Math.floor(this.pos.x), cz = Math.floor(this.pos.z), above = Math.floor(this.pos.y + this.h + 0.1);
      if (this.m3sleep) {
        const pl = nearPlayer(this, 4);
        if (!isSolid(w.getBlock(cx, above, cz)) || this.hurtTime > 0 || (pl && !pl.sneak) || Math.random() < dt * 0.01) { this.m3sleep = false; this.vel.y = -1; }
        else { this.vel.set(0, 0, 0); this.pos.y = above - this.h; this.walkAmount = 0; ambient(this, dt, 10, 30, 10); return; }
      }
      // erratic flight: a new point nearby every second or so, a little toward the ceiling
      if (!this.flyGoal || this.pos.distanceTo(this.flyGoal) < 0.6 || Math.random() < dt * 0.8) {
        const gx = this.pos.x + rnd(-4, 4), gy = this.pos.y + rnd(-1.5, 2.2), gz = this.pos.z + rnd(-4, 4);
        if (!solidAt(w, gx, gy, gz) && !isWater(w.getBlock(Math.floor(gx), Math.floor(gy), Math.floor(gz)))) this.flyGoal = (this.flyGoal || new THREE.Vector3()).set(gx, gy, gz);
      }
      const goal = this.flyGoal || this.pos;
      const res = flyTo(this, dt, goal.x, goal.y + Math.sin(g.simTime * 7 + this.id) * 0.3, goal.z, this.info.speed, 3);
      if (res.hitX || res.hitZ || this.onGround) this.flyGoal = null;
      if (this.onGround) this.vel.y = 2;
      if (isSolid(w.getBlock(cx, above, cz)) && Math.random() < dt * 0.25) { this.m3sleep = true; this.pos.y = above - this.h; this.vel.set(0, 0, 0); }
      if (wet(this, 0.5)) this.vel.y = 3;
      lavaBurn(this, dt, boxInBlock(w, this.pos, this.w, this.h, isLava));
      ambient(this, dt, 4, 12, 16);
      tidy(this);
    },

    squid(dt) {
      const g = this.game, w = g.world;
      const inWater = wet(this, 0.5);
      if (inWater) {
        this.airTime = 0;
        this.swimT -= dt;
        const pl = this.panic > 0 ? nearPlayer(this, 16) : null;
        if (pl) {
          // squirt away from whoever hurt us
          const dx = this.pos.x - pl.pos.x, dz = this.pos.z - pl.pos.z, d = Math.hypot(dx, dz) || 1;
          this.swimDir = new THREE.Vector3(dx / d, -0.3, dz / d).normalize();
        } else if (this.swimT <= 0 || !this.swimDir) {
          this.swimT = rnd(2, 5);
          const a = Math.random() * Math.PI * 2;
          this.swimDir = Math.random() < 0.25 ? null : new THREE.Vector3(Math.cos(a), rnd(-0.4, 0.4), Math.sin(a)).normalize();
        }
        this.panic = Math.max(0, this.panic - dt);
        // stay under the surface
        const top = Math.floor(this.pos.y + this.h + 0.2);
        if (this.swimDir && this.swimDir.y > 0 && !isWater(w.getBlock(Math.floor(this.pos.x), top, Math.floor(this.pos.z)))) this.swimDir.y = -0.2;
        // jet propulsion: a push each time the tentacles snap shut
        this.pulse = (this.pulse + dt * (pl ? 1.6 : 0.7)) % 1;
        if (this.swimDir && this.pulse < 0.25) this.vel.addScaledVector(this.swimDir, dt * (pl ? 26 : 9));
        this.vel.multiplyScalar(Math.max(0, 1 - dt * 1.6));
        const res = moveBody(w, this, dt, { stepHeight: 0 });
        if (res.hitX || res.hitZ) this.swimT = 0;
        const hv = Math.hypot(this.vel.x, this.vel.z);
        if (hv > 0.2) this.targetYaw = Math.atan2(-this.vel.x, -this.vel.z);
        turn(this, dt, 2);
      } else {
        // stranded: flop about and slowly suffocate
        this.vel.y -= 32 * dt;
        this.vel.x *= Math.pow(0.1, dt); this.vel.z *= Math.pow(0.1, dt);
        if (this.onGround && Math.random() < dt * 1.2) { this.vel.y = 4; this.vel.x = rnd(-1.5, 1.5); this.vel.z = rnd(-1.5, 1.5); }
        moveBody(w, this, dt);
        this.airTime += dt;
        if (this.airTime > 2) { this.airTime = 1; this.hurt(1, 0, 0, 'env'); }
      }
      this.walkPhase += dt * 4;
      ambient(this, dt, 10, 25, 14);
      tidy(this);
    },

    bee(dt) {
      const g = this.game, w = g.world;
      if (this.stung) {
        // lost its stinger: drifts about, then dies
        this.stungT -= dt;
        if (this.stungT <= 0) { this.health = 0; this.deathTime = 0; this._dropped = true; return; }
        if (!this.flyGoal || Math.random() < dt) this.flyGoal = new THREE.Vector3(this.pos.x + rnd(-3, 3), this.pos.y + rnd(-1, 0.6), this.pos.z + rnd(-3, 3));
        flyTo(this, dt, this.flyGoal.x, this.flyGoal.y, this.flyGoal.z, 1.5, 2);
        tidy(this);
        return;
      }
      const t = this.angry > 0 ? g.nearestTarget(this.pos, 24) : null;
      if (t) {
        flyTo(this, dt, t.pos.x, t.pos.y + 1.1, t.pos.z, 4.6, 3);
        if (this.attackCooldown <= 0 && this.pos.distanceTo(new THREE.Vector3(t.pos.x, t.pos.y + 0.9, t.pos.z)) < 1.4) {
          this.attackCooldown = 1; this.swing = 1;
          const d = hdist(t.pos, this.pos) || 1;
          g.damagePlayer(t, DIFF(g, [0, 1, 2, 3]), { x: (t.pos.x - this.pos.x) / d * 2, y: 2, z: (t.pos.z - this.pos.z) / d * 2 }, 'mob');
          giveFx(g, t, { poison: DIFF(g, [0, 0, 6, 10]) });
          sfx(this, 'sting');
          this.stung = true; this.m3pose = true; this.stungT = rnd(6, 25); this.angry = 0; this.flyGoal = null;
        }
      } else {
        // visit flowers near home; hover lower and slower at night
        const night = g.daylight < 0.4;
        this.scanT -= dt;
        if (this.scanT <= 0 && !this.flower) {
          this.scanT = rnd(2, 4);
          const h = this.home;
          for (let k = 0; k < 24 && !this.flower; k++) {
            const x = Math.floor(h[0] + rnd(-8, 8)), z = Math.floor(h[2] + rnd(-8, 8));
            for (let y = Math.floor(h[1]) + 4; y > Math.floor(h[1]) - 6; y--) {
              const id = w.getBlock(x, y, z);
              if (id === B.DANDELION || id === B.POPPY) { this.flower = new THREE.Vector3(x + 0.5, y + 0.55, z + 0.5); this.flowerT = rnd(3, 7); break; }
              if (isSolid(id)) break;
            }
          }
        }
        let gx, gy, gz;
        if (this.flower && !night) {
          gx = this.flower.x; gy = this.flower.y + 0.25 + Math.sin(g.simTime * 2 + this.id) * 0.15; gz = this.flower.z;
          if (this.pos.distanceTo(this.flower) < 1.2) {
            this.flowerT -= dt;
            if (Math.random() < dt * 2) puff(g, this.pos.x, this.pos.y + 0.2, this.pos.z, 0xf6e27a, 1, { size: 0.06, speed: 0.4, grav: 1, life: 0.6 });
          }
          if (this.flowerT <= 0) { this.flower = null; this.flyGoal = null; }
        } else {
          if (!this.flyGoal || this.pos.distanceTo(this.flyGoal) < 0.8 || Math.random() < dt * 0.15) {
            const h = this.home, gyBase = w.surfaceY(Math.floor(h[0]), Math.floor(h[2])) + 1;
            this.flyGoal = new THREE.Vector3(h[0] + rnd(-6, 6), gyBase + (night ? rnd(0.3, 1) : rnd(1, 3.5)), h[2] + rnd(-6, 6));
          }
          gx = this.flyGoal.x; gy = this.flyGoal.y; gz = this.flyGoal.z;
        }
        const res = flyTo(this, dt, gx, gy, gz, night ? 1.2 : 2.4, 2);
        if (res.hitX || res.hitZ) this.flyGoal = null;
      }
      lavaBurn(this, dt, boxInBlock(w, this.pos, this.w, this.h, isLava));
      if (wet(this, 0.5)) { this.vel.y = 3; this.burnTimer += dt; if (this.burnTimer > 1) { this.burnTimer = 0; this.hurt(1, 0, 0, 'env'); } }
      ambient(this, dt, 2.5, 5, 10);
      tidy(this);
    },

    goat(dt) {
      const g = this.game, w = g.world;
      this.ramCd -= dt; this.leapCd -= dt;
      this.m3pose = false;
      let res;
      const r = this.ram;
      if (r && r.state === 'prep') {
        this.m3pose = true;
        const t = r.target;
        this.targetYaw = Math.atan2(-(t.pos.x - this.pos.x), -(t.pos.z - this.pos.z));
        res = stand(this, dt);
        r.t -= dt;
        if (r.t <= 0) {
          const d = hdist(t.pos, this.pos) || 1;
          r.state = 'charge'; r.t = 2.2; r.dx = (t.pos.x - this.pos.x) / d; r.dz = (t.pos.z - this.pos.z) / d;
          sfx(this, 'stamp');
        }
      } else if (r && r.state === 'charge') {
        this.m3pose = true;
        this.targetYaw = Math.atan2(-r.dx, -r.dz);
        res = this._locomote(dt, r.dx, r.dz, 8);
        r.t -= dt;
        let hit = false;
        for (const t of g.allPlayers()) {
          if (t.mode !== 'survival' && t.mode !== 'adventure') continue;
          if (hdist(t.pos, this.pos) < 1.3 && Math.abs(t.pos.y - this.pos.y) < 1.8) {
            g.damagePlayer(t, DIFF(g, [0, 1, 2, 3]), { x: r.dx * 12, y: 6, z: r.dz * 12 }, 'mob');
            hit = true;
          }
        }
        if (hit) sfx(this, 'ram');
        if (hit || r.t <= 0 || Math.hypot(this.vel.x, this.vel.z) < 0.5 && r.t < 1.9) { this.ram = null; this.ramCd = rnd(20, 60); }
      } else {
        // now and then, ram a player who stands 4-12 blocks away
        if (this.ramCd <= 0) {
          this.ramCd = 3;
          const t = g.nearestTarget(this.pos, 12);
          if (t && hdist(t.pos, this.pos) > 4 && this.canSee(t.pos)) { this.ram = { state: 'prep', t: 1.2, target: t }; }
        }
        res = roam(this, dt, 0.8);
        // high jumper: leap up two-block ledges and now and then just for fun
        if (this.onGround && this.wanderDir) {
          const fx = this.pos.x + this.wanderDir[0] * 0.9, fz = this.pos.z + this.wanderDir[1] * 0.9, fy = this.pos.y;
          const ledge = solidAt(w, fx, fy + 1, fz) && !solidAt(w, fx, fy + 2, fz) && !solidAt(w, fx, fy + 3, fz) && !solidAt(w, this.pos.x, fy + 3, this.pos.z);
          if (ledge || (this.leapCd <= 0 && Math.random() < dt * 0.5)) { this.vel.y = 11.5; this.leapCd = rnd(8, 20); }
        }
      }
      lavaBurn(this, dt, res && res.inLava);
      ambient(this, dt, 8, 24, 16);
      tidy(this);
    },

    husk(dt) {
      const g = this.game;
      const t = g.nearestTarget(this.pos, 32);
      let res;
      if (t) {
        if (brawl(this, dt, t, [0, 2, 3, 4])) giveFx(g, t, { hunger: DIFF(g, [0, 5, 7, 10]) });
      } else res = this._seek(dt, null, this.info.speed);
      lavaBurn(this, dt, res && res.inLava);
      ambient(this, dt, 8, 24);
      tidy(this);
    },

    stray(dt) {
      const g = this.game;
      const t = g.nearestTarget(this.pos, 20);
      let res;
      if (t) {
        const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 0.01;
        const see = this.canSee(t.pos);
        if (d > 10 || !see) res = this._seek(dt, t.pos, this.info.speed, 1);
        else {
          this.targetYaw = Math.atan2(-dx, -dz);
          res = d < 5 ? this._locomote(dt, -dx / d, -dz / d, this.info.speed * 0.8) : stand(this, dt);
          this.targetYaw = Math.atan2(-dx, -dz);
        }
        if (see && d < 16 && this.attackCooldown <= 0) {
          this.attackCooldown = 2; this.swing = 1;
          const from = new THREE.Vector3(this.pos.x, this.pos.y + 1.5, this.pos.z);
          const v = new THREE.Vector3(t.pos.x, t.pos.y + 1.2 + d * 0.06, t.pos.z).sub(from).normalize().multiplyScalar(26);
          v.x += (Math.random() - 0.5) * 2; v.z += (Math.random() - 0.5) * 2;
          g.spawnProjectile('arrow', from, v, { owner: this, damage: DIFF(g, [0, 2, 3, 4]) });
          const pr = g.projectiles[g.projectiles.length - 1];
          if (pr && pr.owner === this) pr.m3slow = DIFF(g, [0, 6, 8, 10]); // tipped with slowness
          Sound.noise(1800, 2, 0.15, 0.25, 'bandpass', { pos: this.pos });
        }
      } else res = this._seek(dt, null, this.info.speed);
      sunBurn(this, dt, res && res.inWater);
      lavaBurn(this, dt, res && res.inLava);
      ambient(this, dt, 8, 24);
      tidy(this);
    },

    drowned(dt) {
      const g = this.game, w = g.world;
      const inWater = wet(this, 0.7);
      const t = g.nearestTarget(this.pos, inWater ? 20 : 28);
      let res = null;
      if (inWater) {
        // swim: straight at the target through the water
        let gx, gy, gz, sp = 2.6;
        if (t) { gx = t.pos.x; gy = t.pos.y + 0.6; gz = t.pos.z; }
        else {
          if (!this.flyGoal || this.pos.distanceTo(this.flyGoal) < 1 || Math.random() < dt * 0.2) this.flyGoal = new THREE.Vector3(this.pos.x + rnd(-6, 6), this.pos.y + rnd(-2, 1), this.pos.z + rnd(-6, 6));
          gx = this.flyGoal.x; gy = this.flyGoal.y; gz = this.flyGoal.z; sp = 1.2;
        }
        const r = flyTo(this, dt, gx, gy, gz, sp, 2);
        // haul out at the shore
        if ((r.hitX || r.hitZ) && t) this.vel.y = 5;
        this.walkPhase += dt * 2;
        if (t) this._melee(t, DIFF(g, [0, 2, 3, 4]), 1.6);
        this.swimming = true;
      } else {
        this.swimming = false;
        if (t) brawl(this, dt, t, [0, 2, 3, 4]);
        else res = this._seek(dt, null, this.info.speed);
        sunBurn(this, dt, false);
      }
      lavaBurn(this, dt, res && res.inLava);
      ambient(this, dt, 8, 24);
      tidy(this);
    },

    witch(dt) {
      const g = this.game;
      this.potionCd -= dt;
      if (this.drinking > 0) {
        this.drinking -= dt;
        this.m3pose = true;
        if (this.drinking <= 0) {
          this.m3pose = false;
          this.health = Math.min(this.info.health, this.health + 4);
          puff(g, this.pos.x, this.pos.y + 1.6, this.pos.z, 0xb050e0, 8, { size: 0.08, speed: 1, up: 1.5, life: 0.8 });
        }
      } else if (this.health < this.info.health && this.potionCd <= 0 && Math.random() < dt * 1.5) {
        this.drinking = 1.6; this.potionCd = 5; this.m3pose = true;
        sfx(this, 'drink');
      }
      const t = g.nearestTarget(this.pos, 16);
      let res;
      const slow = this.drinking > 0 ? 0.3 : 1;
      if (t) {
        const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 0.01;
        const see = this.canSee(t.pos);
        if (d > 8 || !see) res = this._seek(dt, t.pos, this.info.speed * slow, 1);
        else {
          this.targetYaw = Math.atan2(-dx, -dz);
          res = d < 4 ? this._locomote(dt, -dx / d, -dz / d, this.info.speed * 0.8 * slow) : stand(this, dt);
          this.targetYaw = Math.atan2(-dx, -dz);
        }
        if (see && d < 11 && this.attackCooldown <= 0 && this.drinking <= 0) {
          this.attackCooldown = 3; this.swing = 1;
          // like Minecraft's: slowness at range, poison while you're healthy, else harming
          const fx = t.local ? g.player.m3fx || {} : {}, health = t.local ? g.player.health : 20;
          const kind = d >= 8 && !(fx.slow > 0) ? 'slow' : health >= 8 && !(fx.poison > 0) && Math.random() < 0.6 ? 'poison' : 'harm';
          const from = new THREE.Vector3(this.pos.x, this.pos.y + 1.55, this.pos.z);
          const T0 = Math.max(0.35, d / 11), aim = new THREE.Vector3(t.pos.x - from.x, t.pos.y + 1.0 - from.y, t.pos.z - from.z);
          const v = new THREE.Vector3(aim.x / T0, aim.y / T0 + 10 * T0, aim.z / T0);
          from.addScaledVector(new THREE.Vector3(dx / d, 0, dz / d), 0.5);
          throwPotion(g, this, kind, from, v);
          sfx(this, 'throw');
        }
      } else res = this._seek(dt, null, this.info.speed * slow);
      lavaBurn(this, dt, res && res.inLava);
      ambient(this, dt, 8, 22);
      tidy(this);
    },

    cave_spider(dt) {
      const g = this.game, w = g.world;
      const t = g.nearestTarget(this.pos, 16);
      let res;
      if (t) {
        const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 0.01;
        // climb whatever is in the way
        if (solidAt(w, this.pos.x + dx / d * 0.6, this.pos.y + 0.3, this.pos.z + dz / d * 0.6)) this.vel.y = Math.max(this.vel.y, 3.5);
        res = this._seek(dt, t.pos, this.info.speed, 0.8);
        if (d < 4 && d > 1.5 && this.onGround && Math.random() < dt * 2) { this.vel.y = 5.5; this.vel.x += dx / d * 3; this.vel.z += dz / d * 3; }
        const before = this.attackCooldown;
        this._melee(t, DIFF(g, [0, 2, 2, 3]), 1.5);
        if (this.attackCooldown > before) giveFx(g, t, { poison: DIFF(g, [0, 0, 5, 8]) });
      } else res = this._seek(dt, null, this.info.speed);
      lavaBurn(this, dt, res && res.inLava);
      ambient(this, dt, 6, 18, 16);
      tidy(this);
    },

    silverfish(dt) {
      const g = this.game, w = g.world;
      const t = g.nearestTarget(this.pos, 12);
      let res;
      if (t) {
        res = this._seek(dt, t.pos, this.info.speed, 0.5);
        this._melee(t, DIFF(g, [0, 1, 1, 1]), 1.1, 2);
      } else {
        res = this._seek(dt, null, this.info.speed * 0.7);
        // hide in a stone block next to it now and then (breaking that stone lets it out)
        if (this.hurtTime <= 0 && Math.random() < dt * 0.06) {
          const fx = Math.floor(this.pos.x), fy = Math.floor(this.pos.y), fz = Math.floor(this.pos.z);
          for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]]) {
            if (w.getBlock(fx + dx, fy + dy, fz + dz) !== B.STONE) continue;
            (w._m3inf || (w._m3inf = new Set())).add((fx + dx) + ',' + (fy + dy) + ',' + (fz + dz));
            g.particles.burst(fx + dx, fy + dy, fz + dz, B.STONE, 6);
            this.deathTime = 99;
            return;
          }
        }
      }
      lavaBurn(this, dt, res && res.inLava);
      ambient(this, dt, 6, 18, 12);
      tidy(this);
    },

    phantom(dt) {
      const g = this.game, w = g.world;
      const t = g.nearestTarget(this.pos, 64);
      this.stateT += dt;
      if (t && (!this.anchor || this.stateT > 12)) {
        this.anchor = (this.anchor || new THREE.Vector3()).set(t.pos.x + rnd(-4, 4), t.pos.y + rnd(18, 26), t.pos.z + rnd(-4, 4));
        if (this.state === 'circle') this.stateT = 0;
      }
      if (!this.anchor) this.anchor = this.pos.clone();
      // cats scare phantoms off
      let scared = false;
      if (t) for (const c of g.mobs.values()) if (c.type === 'cat' && !c.dead && c.pos.distanceTo(t.pos) < 16) { scared = true; break; }
      let gx, gy, gz, sp, acc;
      if (this.state === 'swoop' && t && !scared) {
        gx = t.pos.x; gy = t.pos.y + 1; gz = t.pos.z; sp = 12; acc = 4;
        const d = this.pos.distanceTo(new THREE.Vector3(t.pos.x, t.pos.y + 0.9, t.pos.z));
        if (d < 1.7 && this.attackCooldown <= 0) {
          this.attackCooldown = 1; this.swing = 1;
          const hd = hdist(t.pos, this.pos) || 1;
          g.damagePlayer(t, DIFF(g, [0, 2, 2, 3]), { x: (t.pos.x - this.pos.x) / hd * 3, y: 3, z: (t.pos.z - this.pos.z) / hd * 3 }, 'mob');
          sfx(this, 'bite');
          this.state = 'climb'; this.stateT = 0;
        }
        if (this.stateT > 5 || this.onGround) { this.state = 'climb'; this.stateT = 0; }
      } else if (this.state === 'climb' || (this.state === 'swoop')) {
        gx = this.anchor.x + Math.cos(this.circleA) * 10; gy = this.anchor.y; gz = this.anchor.z + Math.sin(this.circleA) * 10; sp = 7; acc = 2;
        if (this.pos.y > this.anchor.y - 4 || this.stateT > 6) { this.state = 'circle'; this.stateT = 0; this.swoopCd = rnd(4, 9); }
      } else {
        this.circleA += dt * 0.6;
        gx = this.anchor.x + Math.cos(this.circleA) * 12; gy = this.anchor.y + Math.sin(this.circleA * 0.7) * 2; gz = this.anchor.z + Math.sin(this.circleA) * 12; sp = 7; acc = 2;
        this.swoopCd -= dt;
        if (t && this.swoopCd <= 0 && !scared && this.canSee(t.pos)) { this.state = 'swoop'; this.stateT = 0; sfx(this, 'swoop'); }
      }
      const res = flyTo(this, dt, gx, gy, gz, sp, acc);
      if ((res.hitX || res.hitZ) && this.state === 'swoop') { this.state = 'climb'; this.stateT = 0; }
      if (this.hurtTime > 0.35 && this.state === 'swoop') { this.state = 'climb'; this.stateT = 0; }
      this.walkPhase += dt * 4;
      if (Math.random() < dt * 0.6) sfx(this, 'flap');
      sunBurn(this, dt, false);
      lavaBurn(this, dt, boxInBlock(w, this.pos, this.w, this.h, isLava));
      ambient(this, dt, 6, 14, 40);
      tidy(this);
    },

    polar_bear(dt) {
      const g = this.game;
      let res;
      if (this.size < 1) {
        // cubs tag along after the nearest adult
        const mom = this.panic > 0 ? null : nearMob(this, { polar_bear: 1 }, 16, (o) => o.size >= 1);
        if (mom && hdist(mom.pos, this.pos) > 3) res = this._seek(dt, mom.pos, this.info.speed, 2.5);
        else res = roam(this, dt, 0.8);
      } else {
        // a mother with a cub nearby attacks players who come close
        if (g.nearestTarget(this.pos, 8) && nearMob(this, { polar_bear: 1 }, 16, (o) => o.size < 1)) this.angry = Math.max(this.angry, 4);
        const t = this.angry > 0 ? g.nearestTarget(this.pos, 20) : null;
        if (t) {
          const d = hdist(t.pos, this.pos);
          if (d < 2.8 && this.rearT <= 0 && this.attackCooldown <= 0) { this.rearT = 0.9; sfx(this, 'warn'); }
          res = this._seek(dt, t.pos, this.info.speed * 1.3, 1.3);
          if (this.rearT > 0) {
            this.rearT -= dt;
            if (this.rearT <= 0.25) this._melee(t, DIFF(g, [0, 4, 6, 9]), 2.4, 5);
          }
        } else { this.rearT = 0; res = roam(this, dt, 0.7); }
      }
      this.m3pose = this.rearT > 0;
      lavaBurn(this, dt, res && res.inLava);
      ambient(this, dt, 10, 30, 18);
      tidy(this);
    },

    horse(dt) {
      let res;
      if (this.m3sleep) {
        // grazing
        this.grazeT -= dt;
        if (this.grazeT <= 0 || this.panic > 0 || this.hurtTime > 0) this.m3sleep = false;
        res = stand(this, dt);
      } else {
        res = roam(this, dt, 0.8);
        if (!this.wanderDir && this.panic <= 0 && Math.random() < dt * 0.1) { this.m3sleep = true; this.grazeT = rnd(2, 6); }
      }
      lavaBurn(this, dt, res && res.inLava);
      ambient(this, dt, 10, 30, 18);
      tidy(this);
    },
  });

  // ---------------------------------------------------------------- hurt / death hooks
  // Goats and polar bears don't anger their whole herd (Mob.hurt does that for neutral mobs);
  // a hurt cub angers the adults instead. Foxes drop what they carry; silverfish call friends.
  const SOLO = { goat: 1, polar_bear: 1 };
  {
    const hurt = Mob.prototype.hurt;
    Mob.prototype.hurt = function (amount, kx, kz, attacker) {
      if (!IS_NEW.has(this.type)) return hurt.call(this, amount, kx, kz, attacker);
      let saved = null;
      if (SOLO[this.type]) { saved = []; for (const m of this.game.mobs.values()) if (m !== this && m.type === this.type) saved.push([m, m.angry]); }
      const ok = hurt.call(this, amount, kx, kz, attacker);
      if (saved) for (const [m, a] of saved) m.angry = a;
      if (!ok) return ok;
      const g = this.game;
      if (this.dead && this.type === 'fox' && this.m3held && FOX_ITEMS[this.m3held]) {
        g.spawnItem(stackOf(FOX_ITEMS[this.m3held], 1), this.pos.x, this.pos.y + 0.5, this.pos.z);
        this.m3held = 0;
      }
      if (attacker === 'env') { if (SOLO[this.type]) this.angry = 0; return ok; }
      switch (this.type) {
        case 'goat': this.angry = 0; this.ramCd = Math.min(this.ramCd, 1); break;
        case 'polar_bear':
          if (this.size < 1) {
            this.angry = 0; this.panic = 4;
            for (const m of g.mobs.values()) if (m.type === 'polar_bear' && m.size >= 1 && m.pos.distanceTo(this.pos) < 20) m.angry = 30;
          }
          break;
        case 'squid': this.panic = 3; break;
        case 'fox': this.m3sleep = false; break;
        case 'silverfish':
          for (const k of [...(g.world._m3inf || [])]) {
            const [x, y, z] = k.split(',').map(Number);
            if (Math.abs(x - this.pos.x) > 5 || Math.abs(y - this.pos.y) > 3 || Math.abs(z - this.pos.z) > 5) continue;
            g.world._m3inf.delete(k);
            if (g.world.getBlock(x, y, z) !== B.STONE) continue;
            g.changeBlock(x, y, z, B.AIR);
            g.particles.burst(x, y, z, B.STONE, 8);
            g.spawnMob('silverfish', x + 0.5, y, z + 0.5);
          }
          break;
      }
      return ok;
    };
    const dispose = Mob.prototype.dispose;
    Mob.prototype.dispose = function () {
      if (this._m3item) { this._m3item.parent && this._m3item.parent.remove(this._m3item); this._m3item.geometry.dispose(); this._m3item = null; }
      dispose.call(this);
    };
  }

  // Creepers keep away from cats
  {
    const simulate = Mob.prototype.simulate;
    Mob.prototype.simulate = function (dt) {
      if (this.type !== 'creeper' || this.dead || MOB_AI.creeper) return simulate.call(this, dt);
      this._m3catT = (this._m3catT || 0) - dt;
      if (this._m3catT <= 0) { this._m3catT = 0.5; this._m3cat = nearMob(this, { cat: 1 }, 6); }
      const cat = this._m3cat;
      if (!cat || cat.dead || cat.pos.distanceTo(this.pos) > 7) return simulate.call(this, dt);
      this.hurtTime = Math.max(0, this.hurtTime - dt);
      this.invuln = Math.max(0, this.invuln - dt);
      this.attackCooldown = Math.max(0, this.attackCooldown - dt);
      this.swing = Math.max(0, this.swing - dt * 3);
      this.fuse = Math.max(0, this.fuse - dt * 2);
      const res = flee(this, dt, cat.pos, this.info.speed * 1.2);
      lavaBurn(this, dt, res && res.inLava);
      tidy(this);
    };
  }

  // Strays' arrows slow you down
  {
    const onHit = Projectile.prototype.onHitEntity;
    Projectile.prototype.onHitEntity = function (c, dir) {
      onHit.call(this, c, dir);
      if (!this.m3slow || this.remote) return;
      if (c === 'local') addFx(this.game.player, { slow: this.m3slow });
      else if (c instanceof RemotePlayer) giveFx(this.game, c, { slow: this.m3slow });
    };
  }

  // ---------------------------------------------------------------- rendering
  // Head turns toward a nearby player (bestiary.js does this for the original mobs)
  function look(m) {
    const head = m.model.parts.head;
    let yaw = 0, pitch = 0;
    const p = m.game.player;
    if (head && !m.dead && p && !p.dead && p.mode !== 'spectator') {
      const s = m.model.inner.scale.y;
      const hy = m.pos.y + (m.model.headY || 24) * MS * s + 0.2;
      const dx = p.pos.x - m.pos.x, dz = p.pos.z - m.pos.z, dy = p.pos.y + 1.6 - hy, dist = Math.hypot(dx, dz);
      if (dist < 8 && dist > 0.3) {
        const rel = wrapA(Math.atan2(-dx, -dz) - m.yaw);
        if (Math.abs(rel) < 1.9) { yaw = Math.max(-1.0, Math.min(1.0, rel)); pitch = Math.max(-0.6, Math.min(0.6, Math.atan2(dy, dist))); }
      }
    }
    m.lookYaw = (m.lookYaw || 0) + (yaw - (m.lookYaw || 0)) * 0.15;
    m.lookPitch = (m.lookPitch || 0) + (pitch - (m.lookPitch || 0)) * 0.15;
    return m;
  }
  function headLook(m, basePitch = 0) {
    look(m);
    const head = m.model.parts.head;
    if (head) { head.rotation.y = m.lookYaw; head.rotation.x = basePitch - m.lookPitch; }
  }
  // Velocity seen by the renderer (works on clients, which only get positions)
  function motion(m) {
    const now = m.game.simTime || 0;
    let s = m._mo;
    if (!s) s = m._mo = { t: now, x: m.pos.x, y: m.pos.y, z: m.pos.z, vx: 0, vy: 0, vz: 0, hv: 0 };
    const dt = now - s.t;
    if (dt > 1e-4) {
      const k = Math.min(1, dt * 10);
      s.vx += ((m.pos.x - s.x) / dt - s.vx) * k; s.vy += ((m.pos.y - s.y) / dt - s.vy) * k; s.vz += ((m.pos.z - s.z) / dt - s.vz) * k;
      s.t = now; s.x = m.pos.x; s.y = m.pos.y; s.z = m.pos.z;
      s.hv = Math.hypot(s.vx, s.vz);
    }
    return s;
  }
  const clock = (m) => (m.game.simTime || 0) + m.id * 0.37;
  const angryNow = (m) => m.angry > 0 || !!m.m3angry;

  Object.assign(MOB_RENDER, {
    rabbit() {
      skin(this, rabbitSheet(RABBIT_V[this.variant] || 'brown'));
      const P = this.model.parts, mo = motion(this), t = clock(this);
      const air = THREE.MathUtils.clamp(mo.vy / 4, -1, 1), moving = Math.min(1, mo.hv / 1.5);
      P.legBL.rotation.x = P.legBR.rotation.x = air > 0 ? air * 1.0 : air * 0.3;
      P.legFL.rotation.x = P.legFR.rotation.x = -air * 0.7;
      P.body.rotation.x = -0.15 - air * 0.2;
      const twitch = Math.sin(t * 1.7) > 0.95 ? 0.2 : 0;
      P.earL.rotation.x = -0.25 - moving * 0.35 - twitch; P.earR.rotation.x = -0.25 - moving * 0.35;
      P.earL.rotation.z = 0.12; P.earR.rotation.z = -0.12;
      headLook(this, Math.max(0, Math.sin(t * 9)) * 0.08 * (1 - moving));
    },

    fox() {
      skin(this, foxSheet(this.variant === 1 ? 'snow' : 'red', !!this.m3sleep));
      const P = this.model.parts, t = clock(this);
      for (const n of ['legFL', 'legFR', 'legBL', 'legBR']) { P[n].visible = true; P[n].scale.y = 1; place(P[n]); }
      if (this.m3sleep) {
        place(P.body, 0, -4.5, 0); place(P.head, -1, -4.5, -1); place(P.tail, 0, -4.5, 0);
        for (const n of ['legFL', 'legFR', 'legBL', 'legBR']) P[n].visible = false;
        P.head.rotation.set(0.15, 0.7, 0.25);
        P.tail.rotation.set(-0.1, 2.1, 0);
        P.body.rotation.z = 0.1 + Math.sin(t * 1.2) * 0.02;
      } else {
        const low = this.m3pose ? 2 : 0;
        place(P.body, 0, -low, 0); place(P.head, 0, -low, 0); place(P.tail, 0, -low, 0);
        if (low) for (const n of ['legFL', 'legFR', 'legBL', 'legBR']) { place(P[n], 0, -low, 0); P[n].scale.y = 4 / 6; }
        P.body.rotation.z = 0; P.head.rotation.z = 0;
        P.tail.rotation.set(this.m3pose ? -0.05 : -0.35 + this.walkAmount * 0.2, Math.sin(t * 2.2) * 0.15 * (1 - this.walkAmount), 0);
        headLook(this, this.m3pose ? 0.25 : 0);
      }
      // something in its mouth
      const id = FOX_ITEMS[this.m3held] || 0;
      if (id && (!this._m3item || this._m3item.userData.id !== id)) {
        if (this._m3item) { P.head.remove(this._m3item); this._m3item.geometry.dispose(); }
        const mesh = new THREE.Mesh(isCubeItem(id) ? blockGeometry(id, 0.2) : itemGeometry(id, 0.32), this.game.entityMat);
        mesh.position.set(0.12, -0.18, 0.62); mesh.rotation.set(0, Math.PI / 2, 0.6);
        mesh.userData.id = id;
        P.head.add(mesh); this._m3item = mesh;
      } else if (!id && this._m3item) { P.head.remove(this._m3item); this._m3item.geometry.dispose(); this._m3item = null; }
    },

    cat() {
      skin(this, catSheet(CAT_V[this.variant] || 'tabby'));
      const P = this.model.parts, t = clock(this);
      place(P.legBL); place(P.legBR); place(P.head);
      if (this.m3sleep) {
        P.body.rotation.x = -0.44;
        for (const l of [P.legBL, P.legBR]) { place(l, 0, -5, 0.5); l.rotation.x = -1.45; }
        P.legFL.rotation.x = P.legFR.rotation.x = 0;
        place(P.head, 0, 0.5, -0.5);
        P.tail.rotation.set(-0.15, 0.5 + Math.sin(t * 0.8) * 0.15, 0);
        P.tail2.rotation.set(0.1, 0.6, 0);
        headLook(this, 0);
      } else {
        P.body.rotation.x = 0;
        P.tail.rotation.set(-0.9 + this.walkAmount * 0.55, Math.sin(t * 1.6) * 0.25 * (1 - this.walkAmount), 0);
        P.tail2.rotation.set(0.5 - this.walkAmount * 0.4, 0, 0);
        headLook(this, 0);
      }
    },

    bat() {
      const P = this.model.parts, t = clock(this);
      if (this.m3sleep) {
        P.body.rotation.set(Math.PI / 2, 0, 0);
        place(P.body, 0, 0.5, 0);
        // wings wrapped down around the body like a cloak
        P.wingR.rotation.set(0, 1.45, 0.25); P.wingL.rotation.set(0, -1.45, -0.25);
        P.tipR.rotation.set(0, 1.5, 0); P.tipL.rotation.set(0, -1.5, 0);
        P.head.rotation.x = 0;
      } else {
        const flap = Math.sin(t * 24);
        P.body.rotation.set(0.25, 0, 0);
        place(P.body, 0, flap * 0.5, 0);
        P.wingR.rotation.set(0, 0, flap * 0.9); P.wingL.rotation.set(0, 0, -flap * 0.9);
        P.tipR.rotation.set(0, 0, flap * 0.5); P.tipL.rotation.set(0, 0, -flap * 0.5);
        P.head.rotation.x = -0.2;
      }
    },

    squid() {
      const P = this.model.parts, mo = motion(this), t = clock(this);
      const inWater = isWater(this.game.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.4), Math.floor(this.pos.z)));
      const speed = Math.hypot(mo.hv, mo.vy);
      const lean = inWater ? THREE.MathUtils.clamp(mo.hv * 0.45, 0, 1.3) : 0;
      this._lean = (this._lean || 0) + (lean - (this._lean || 0)) * 0.08;
      P.body.rotation.x = this._lean;
      P.body.rotation.z = inWater ? 0 : 1.35;
      const ph = t * (1.6 + speed * 1.2) + this.id;
      const flare = inWater ? (Math.sin(ph) + 1) * 0.32 + 0.05 : 0.9 + Math.sin(t * 6) * 0.15;
      for (const tt of P.tentacles) { tt.rotation.x = -flare * tt.userData.rz; tt.rotation.z = flare * tt.userData.rx; }
      if (this.hurtTime > 0 && !this._inkSeen && !this.dead) inkBurst(this);
      this._inkSeen = this.hurtTime > 0;
    },

    bee() {
      skin(this, beeSheet(angryNow(this)));
      const P = this.model.parts, t = clock(this);
      const flutter = Math.sin(t * 60);
      P.wingR.rotation.z = 0.35 + flutter * 0.45; P.wingL.rotation.z = -(0.35 + flutter * 0.45);
      place(P.body, 0, Math.sin(t * 3) * 0.6, 0);
      P.body.rotation.x = 0.12 + Math.sin(t * 2.3) * 0.04;
      P.stinger.visible = !this.m3pose;
    },

    goat() {
      const P = this.model.parts;
      look(this);
      P.head.rotation.y = this.lookYaw * 0.6;
      P.head.rotation.x = (this.m3pose ? 1.0 : 0.55) - this.lookPitch * 0.5;
    },

    husk() { zombieArms(this); headLook(this); },
    drowned() {
      zombieArms(this);
      const P = this.model.parts;
      const inWater = isWater(this.game.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 1.2), Math.floor(this.pos.z)));
      const mo = motion(this);
      const swim = inWater && Math.hypot(mo.hv, mo.vy) > 0.3 ? 1 : 0;
      this._swim = (this._swim || 0) + (swim - (this._swim || 0)) * 0.08;
      P.root.rotation.x = this._swim * 1.25;
      if (this._swim > 0.05) {
        const k = Math.sin(clock(this) * 8) * 0.5 * this._swim;
        P.legL.rotation.x = k; P.legR.rotation.x = -k;
      }
      headLook(this, -this._swim * 0.9);
    },
    stray() {
      const P = this.model.parts;
      P.armR.rotation.x = -Math.PI / 2 - Math.sin(this.swing * Math.PI) * 0.3;
      headLook(this);
    },
    witch() {
      const P = this.model.parts, t = clock(this);
      const drinking = !!this.m3pose;
      P.arms.rotation.x = drinking ? -1.55 : -0.75 - Math.sin(this.swing * Math.PI) * 0.9;
      P.potion.visible = drinking;
      P.nose.rotation.x = Math.sin(t * 2.1) * 0.05;
      P.nose.rotation.z = Math.sin(t * 1.3) * 0.08;
      headLook(this, drinking ? -0.45 : 0);
    },
    cave_spider() {},
    silverfish() {
      const P = this.model.parts, t = clock(this) * 12, mv = 0.25 + this.walkAmount;
      P.segs.forEach((s, i) => {
        s.rotation.y = Math.cos(t + i * 0.45) * 0.09 * (1 + Math.abs(i - 2)) * mv;
        place(s, Math.sin(t + i * 0.45) * 0.55 * Math.abs(i - 2) * mv, 0, 0);
      });
    },
    phantom() {
      const P = this.model.parts, mo = motion(this), t = clock(this);
      const flap = Math.sin(t * 5);
      P.wingR.rotation.z = flap * 0.45; P.wingL.rotation.z = -flap * 0.45;
      P.tipR.rotation.z = flap * 0.35; P.tipL.rotation.z = -flap * 0.35;
      const pitch = THREE.MathUtils.clamp(-mo.vy * 0.09, -0.9, 0.9);
      this._pitch = (this._pitch || 0) + (pitch - (this._pitch || 0)) * 0.1;
      P.body.rotation.x = this._pitch;
      P.tail.rotation.x = Math.sin(t * 2.5) * 0.12; P.tailTip.rotation.x = Math.sin(t * 2.5 - 0.6) * 0.18;
      if (this.model.glowMat) this.model.glowMat.color.setRGB(1, 1, 1);
    },
    polar_bear() {
      const P = this.model.parts;
      const k = this.m3pose ? 1 : 0;
      this._rear = (this._rear || 0) + (k - (this._rear || 0)) * 0.2;
      const r = this._rear;
      P.rear.rotation.x = -0.95 * r;
      P.legBL.rotation.x += 0.95 * r; P.legBR.rotation.x += 0.95 * r;
      P.legFL.rotation.x = P.legFL.rotation.x * (1 - r) - 0.5 * r; P.legFR.rotation.x = P.legFR.rotation.x * (1 - r) - 0.5 * r;
      headLook(this, 0.6 * r);
    },
    horse() {
      skin(this, horseSheet(HORSE_V[this.variant] || 'brown'));
      const P = this.model.parts, t = clock(this);
      const graze = this.m3sleep ? 1 : 0;
      this._graze = (this._graze || 0) + (graze - (this._graze || 0)) * 0.06;
      look(this);
      P.neck.rotation.x = 0.5 + this._graze * 1.55 - this.lookPitch * 0.4 * (1 - this._graze);
      P.neck.rotation.y = this.lookYaw * 0.5 * (1 - this._graze);
      P.head.rotation.x = 0.45 + this._graze * 0.2 + Math.sin(t * 6) * 0.05 * this._graze;
      P.tail.rotation.x = 0.45 + this.walkAmount * 0.4;
      P.tail.rotation.z = Math.sin(t * 1.1) * 0.12;
    },
  });
  function zombieArms(m) {
    const P = m.model.parts;
    P.armL.rotation.x = -Math.PI / 2 + Math.sin(m.walkPhase * 0.5) * 0.05;
    P.armR.rotation.x = -Math.PI / 2 - Math.sin(m.swing * Math.PI) * 0.8;
  }

  // ---------------------------------------------------------------- multiplayer state
  // One number per mob rides along in the host's mob list (index 14): skin variant (bits 0-2),
  // asleep / sitting / hanging / grazing (bit 3), a pose (bit 4: stalking, drinking, ramming,
  // rearing, stung), angry (bit 5), special (bit 6: screaming goat), held item (bits 8-10).
  function bitsOf(m) {
    return (m.variant & 7) | (m.m3sleep ? 8 : 0) | (m.m3pose ? 16 : 0) | (m.angry > 0 ? 32 : 0) | (m.m3special ? 64 : 0) | ((m.m3held & 7) << 8);
  }
  function applyBits(m, b) {
    m.variant = b & 7; m.m3sleep = !!(b & 8); m.m3pose = !!(b & 16); m.m3angry = !!(b & 32); m.m3special = !!(b & 64); m.m3held = (b >> 8) & 7;
  }

  // ---------------------------------------------------------------- spawning
  const CAPS = { rabbit: 8, fox: 4, bat: 6, squid: 8, bee: 6, goat: 4, horse: 6, polar_bear: 5, husk: 6, stray: 6, drowned: 5, witch: 2, cave_spider: 6, silverfish: 6, phantom: 5, cat: 10 };
  const DAY_SECS = () => (typeof DAY_LENGTH !== 'undefined' ? DAY_LENGTH : 1200);
  function pick(weights) {
    let sum = 0;
    for (const k in weights) if (weights[k] > 0) sum += weights[k];
    if (sum <= 0) return null;
    let r = Math.random() * sum;
    for (const k in weights) { if (!(weights[k] > 0)) continue; r -= weights[k]; if (r <= 0) return k; }
    return null;
  }
  const openAt = (w, x, y, z) => { const a = w.getBlock(x, y, z), b = w.getBlock(x, y + 1, z); return !isSolid(a) && !FLUID[a] && !isSolid(b) && !FLUID[b]; };
  const SURF = new Set();
  function spawnTick(g) {
    const w = g.world;
    if (!w || w.dim !== 0 || w.arena || g.nw) return;
    const players = g.allPlayers().filter((p) => p.mode !== 'spectator');
    if (!players.length) return;
    if (!SURF.size) for (const b of [B.GRASS, B.SNOW_GRASS, B.SAND, B.SNOW, B.DIRT, B.STONE, B.GRAVEL]) if (b !== undefined) SURF.add(b);
    const count = {};
    let total = 0, passive = 0, hostile = 0;
    for (const m of g.mobs.values()) {
      count[m.type] = (count[m.type] || 0) + 1; total++;
      if (m.info.hostile) hostile++; else if (!m.info.persistent) passive++;
    }
    if (total >= (g.net.active ? 30 : 60)) return;
    const room = (t) => !(t in CAPS) || (count[t] || 0) < CAPS[t];
    const hostileOK = g.difficulty > 0 && hostile < 12 * players.length;
    const passiveOK = passive < 12 * players.length;
    phantomTick(g, count, hostileOK);
    const p = players[Math.floor(Math.random() * players.length)];
    const a = Math.random() * Math.PI * 2, d = 22 + Math.random() * 26;
    const x = Math.floor(p.pos.x + Math.cos(a) * d), z = Math.floor(p.pos.z + Math.sin(a) * d);
    if (!w.isLoaded(x, z)) return;
    const tooClose = (y) => players.some((q) => Math.hypot(q.pos.x - x, q.pos.y - y, q.pos.z - z) < 18);
    const sy = w.surfaceY(x, z);
    if (sy < 2) return;
    const top = w.getBlock(x, sy, z);
    const col = w.columnInfo(x, z), biome = col.biome;
    const day = g.daylight > 0.5, night = g.daylight < 0.35;
    const r = Math.random();
    const spawned = [];
    const put = (type, x0, y0, z0, extra) => { const m = g.spawnMob(type, x0, y0, z0, extra); spawned.push(m); return m; };

    if (top === B.WATER) {
      // water: squid any time, drowned in the dark
      let depth = 0;
      while (depth < 30 && isWater(w.getBlock(x, sy - depth, z))) depth++;
      if (depth < 3 || tooClose(sy)) return;
      const bottom = sy - depth + 1;
      const type = pick({ squid: passiveOK && room('squid') ? 3 : 0, drowned: hostileOK && room('drowned') && (night || depth > 8 && Math.random() < 0.15) ? 2 : 0 });
      if (type === 'squid') { const n = 1 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) put('squid', x + rnd(0.2, 0.8), bottom + rnd(0.5, depth - 1.8), z + rnd(0.2, 0.8)); }
      else if (type === 'drowned') put('drowned', x + 0.5, bottom, z + 0.5);
      return spawned;
    }
    if (r < 0.55) {
      // surface
      if (!SURF.has(top) || !openAt(w, x, sy + 1, z) || tooClose(sy + 1)) return;
      const y = sy + 1, grass = top === B.GRASS, mountain = col.height >= 80 && biome !== 'desert';
      if (day && passiveOK) {
        const wts = {};
        if (mountain) { wts.goat = 4; wts.rabbit = 0.6; }
        else if (biome === 'desert') wts.rabbit = 2.5;
        else if (biome === 'snowy') { wts.rabbit = 3; wts.fox = 2; wts.polar_bear = 1.5; }
        else if (biome === 'taiga') { wts.fox = 3; wts.rabbit = 2; }
        else if (biome === 'forest' || biome === 'birch') { wts.rabbit = 2; wts.fox = 1; if (grass) wts.bee = 2; }
        else { wts.rabbit = 2; if (grass) { wts.horse = 2; wts.bee = 1.5; } }
        for (const k in wts) if (!room(k)) delete wts[k];
        const type = pick(wts);
        if (!type) return;
        const near = (n, f) => {
          for (let i = 0; i < n; i++) {
            const ox = x + Math.floor(rnd(-2, 3)), oz = z + Math.floor(rnd(-2, 3)), oy = w.surfaceY(ox, oz);
            if (SURF.has(w.getBlock(ox, oy, oz)) && openAt(w, ox, oy + 1, oz)) f(ox + 0.5, oy + 1, oz + 0.5, i);
          }
        };
        if (type === 'rabbit') { const v = biome === 'desert' ? 3 : biome === 'snowy' ? (Math.random() < 0.8 ? 1 : 4) : Math.random() < 0.1 ? 2 : Math.random() < 0.15 ? 4 : 0; near(2 + Math.floor(Math.random() * 2), (a, b, c) => put('rabbit', a, b, c, { variant: v })); }
        else if (type === 'fox') near(1 + Math.floor(Math.random() * 2), (a, b, c) => put('fox', a, b, c, { variant: biome === 'snowy' ? 1 : 0 }));
        else if (type === 'polar_bear') near(1 + Math.floor(Math.random() * 2), (a, b, c, i) => put('polar_bear', a, b, c, i > 0 ? { size: 0.5 } : {}));
        else if (type === 'goat') near(1 + Math.floor(Math.random() * 3), (a, b, c) => put('goat', a, b, c));
        else if (type === 'horse') { const v = Math.floor(Math.random() * HORSE_V.length); near(2 + Math.floor(Math.random() * 3), (a, b, c) => put('horse', a, b, c, { variant: Math.random() < 0.7 ? v : Math.floor(Math.random() * HORSE_V.length) })); }
        else if (type === 'bee') {
          let flowers = 0;
          for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) { const fy = w.surfaceY(x + dx, z + dz) + 1, id = w.getBlock(x + dx, fy, z + dz); if (id === B.DANDELION || id === B.POPPY) flowers++; }
          if (!flowers) return;
          const n = 2 + Math.floor(Math.random() * 2);
          for (let i = 0; i < n; i++) put('bee', x + rnd(0, 1), y + rnd(1, 2), z + rnd(0, 1), { home: [x + 0.5, y, z + 0.5] });
        }
        return spawned;
      }
      if (night && hostileOK && isSolid(top)) {
        const l = w.getLight(x, y, z);
        if (l.block >= 8 || Villages.near(w, x, z, 40).length) return;
        const swampy = (biome === 'forest' || biome === 'birch' || biome === 'plains') && col.height <= SEA_LEVEL + 3;
        // the base spawner already brings zombies and skeletons (converted to husks/strays above)
        const wts = { none: 6, husk: biome === 'desert' ? 2 : 0, stray: biome === 'snowy' ? 2 : 0, witch: swampy ? 1.2 : 0.15 };
        for (const k in wts) if (!room(k)) delete wts[k];
        const type = pick(wts);
        if (type && type !== 'none') put(type, x + 0.5, y, z + 0.5);
      }
      return spawned;
    }
    // underground: bats, cave spiders and silverfish in dark caves
    for (let tries = 0; tries < 12; tries++) {
      const y = 5 + Math.floor(Math.random() * Math.max(1, sy - 12));
      if (!openAt(w, x, y, z) || !isSolid(w.getBlock(x, y - 1, z))) continue;
      const l = w.getLight(x, y, z);
      if (l.sky >= 4 || l.block >= 6 || tooClose(y)) continue;
      const floor = w.getBlock(x, y - 1, z);
      const wts = {
        bat: passiveOK && room('bat') && y < SEA_LEVEL + 10 && !isSolid(w.getBlock(x, y + 2, z)) ? 3 : 0,
        cave_spider: hostileOK && room('cave_spider') && y < 40 ? 1.2 : 0,
        silverfish: hostileOK && room('silverfish') && floor === B.STONE ? 1 : 0,
        witch: hostileOK && room('witch') ? 0.12 : 0,
      };
      const type = pick(wts);
      if (!type) return spawned;
      if (type === 'bat') { put('bat', x + 0.5, y + 1, z + 0.5); if (Math.random() < 0.4) put('bat', x + 0.5, y + 1.2, z + 0.5); }
      else if (type === 'cave_spider') { put('cave_spider', x + 0.5, y, z + 0.5); if (Math.random() < 0.4) put('cave_spider', x + 0.5, y, z + 0.5); }
      else put(type, x + 0.5, y, z + 0.5);
      return spawned;
    }
    return spawned;
  }
  // Phantoms: at night, for a player who hasn't slept in three days, out under the sky
  function phantomTick(g, count, hostileOK) {
    const p = g.player;
    if (!hostileOK || !p || p.dead || !p.usesHealth || g.daylight >= 0.35) return;
    const rest = p.m3rest || 0, need = 3 * DAY_SECS();
    if (rest < need || (count.phantom || 0) >= CAPS.phantom) return;
    // like Minecraft's: more likely the longer you've gone without sleep
    if (Math.random() > 0.5 / 60 * 2 * Math.min(1, (rest - need) / need + 0.5)) return;
    const w = g.world, l = w.getLight(Math.floor(p.pos.x), Math.floor(p.pos.y + 1), Math.floor(p.pos.z));
    if (l.sky < 15 || p.pos.y < SEA_LEVEL) return;
    const n = 1 + Math.floor(Math.random() * (1 + g.difficulty));
    for (let i = 0; i < n && (count.phantom || 0) + i < CAPS.phantom; i++) {
      const x = p.pos.x + rnd(-10, 10), y = Math.min(WORLD_HEIGHT - 3, p.pos.y + rnd(20, 34)), z = p.pos.z + rnd(-10, 10);
      if (y > p.pos.y + 6 && !solidAt(w, x, y, z)) g.spawnMob('phantom', x, y, z);
    }
  }
  // Zombies spawned in deserts are usually husks; skeletons in snow, strays
  function convertSpawns(g, firstId) {
    const w = g.world;
    if (!w || w.dim !== 0) return;
    for (const m of [...g.mobs.values()]) {
      if (m.id < firstId || (m.type !== 'zombie' && m.type !== 'skeleton')) continue;
      const biome = w.columnInfo(Math.floor(m.pos.x), Math.floor(m.pos.z)).biome;
      const to = m.type === 'zombie' && biome === 'desert' ? 'husk' : m.type === 'skeleton' && biome === 'snowy' ? 'stray' : null;
      if (!to || Math.random() > 0.8) continue;
      m.dispose(); g.mobs.delete(m.id);
      g.spawnMob(to, m.pos.x, m.pos.y, m.pos.z);
    }
  }
  function villageCats(g, v) {
    const w = g.world, n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const x = Math.floor(v.center[0] + rnd(-10, 10)), z = Math.floor(v.center[2] + rnd(-10, 10)), y = w.surfaceY(x, z) + 1;
      if (y < 2 || !openAt(w, x, y, z)) continue;
      const m = g.spawnMob('cat', x + 0.5, y, z + 0.5, { home: v.center });
      m.villageId = v.id;
    }
  }

  // ---------------------------------------------------------------- per-frame work
  function frame(g, dt) {
    hookGame();
    const p = g.player;
    if (p && g.isAuthority) {
      if (p.dead || p.sleeping) p.m3rest = 0;
      else p.m3rest = (p.m3rest || 0) + dt;
    }
    if (p && p.dead && p.m3fx) p.m3fx = null;
    if (g.net && g.net.handlers && g.net.handlers.hurt && !g.net.handlers.hurt.m3) {
      // effects sent with 'hurt' messages (by the host's mobs to other players)
      const h = g.net.handlers.hurt;
      const wrapped = function (d, from) { if (d && d.fx && typeof d.fx === 'object') addFx(g.player, d.fx); return h(d, from); };
      wrapped.m3 = true;
      g.net.handlers.hurt = wrapped;
    }
    updatePots(g, dt);
    updateParts(g, dt);
    updateHud(g);
  }
  {
    const update = Particles.prototype.update, clear = Particles.prototype.clear;
    Particles.prototype.update = function (dt) {
      update.call(this, dt);
      try { frame(this.game, dt); } catch (e) { console.error('mobs3', e); }
    };
    Particles.prototype.clear = function () {
      clear.call(this);
      const s = this.m3;
      if (!s) return;
      for (const p of s.parts) this.game.scene.remove(p.mesh);
      for (const q of s.pots) disposePot(this.game, q);
      s.parts = []; s.pots = [];
    };
  }

  // ---------------------------------------------------------------- Game hooks (installed late)
  // game.js and the files that extend Game load after this one: hook them once they exist.
  let hooked = false;
  function hookGame() {
    if (hooked) return true;
    if (typeof Game === 'undefined' || !Game.prototype.updateProjectiles || !Game.prototype.serializeProjectiles || typeof MOB_XP === 'undefined') return false;
    hooked = true;
    const G = Game.prototype;
    for (const t in XP) if (!MOB_XP[t]) MOB_XP[t] = XP[t];

    const updateSpawning = G.updateSpawning;
    G.updateSpawning = function (dt) {
      const tick = this.spawnTimer - dt <= 0, firstId = nextEntityId;
      updateSpawning.call(this, dt);
      if (!tick || this.nw || !this.world) return;
      try { convertSpawns(this, firstId); spawnTick(this); } catch (e) { console.error('mobs3 spawning', e); }
    };

    const updateVillages = G.updateVillages;
    if (updateVillages) {
      G.updateVillages = function (dt) {
        const before = new Set(this.villagePopulated);
        updateVillages.call(this, dt);
        if (this.villagePopulated.size === before.size || !this.world || this.world.dim !== 0) return;
        const p = this.player;
        for (const v of Villages.near(this.world, p.pos.x, p.pos.z, 110)) if (this.villagePopulated.has(v.id) && !before.has(v.id)) villageCats(this, v);
      };
    }

    const serializeMobs = G.serializeMobs, applyMobState = G.applyMobState;
    G.serializeMobs = function () {
      const out = serializeMobs.call(this);
      for (const a of out) { const m = this.mobs.get(a[0]); if (m && IS_NEW.has(m.type)) a[14] = bitsOf(m); }
      return out;
    };
    G.applyMobState = function (list) {
      applyMobState.call(this, list);
      if (!Array.isArray(list)) return;
      for (const a of list) {
        if (!Array.isArray(a) || typeof a[14] !== 'number') continue;
        const m = this.mobs.get(a[0]);
        if (m && IS_NEW.has(m.type)) applyBits(m, a[14]);
      }
    };

    // Potions ride along with the projectiles the host shares: kind 100 + potion index
    const serializeProjectiles = G.serializeProjectiles, applyProjectileState = G.applyProjectileState;
    G.serializeProjectiles = function () {
      const out = serializeProjectiles.call(this);
      const pots = this.particles && this.particles.m3 ? this.particles.m3.pots : [];
      for (const q of pots) if (!q.remote && out.length < 16) out.push([100 + POT_KINDS.indexOf(q.kind), Math.round(q.pos.x * 10), Math.round(q.pos.y * 10), Math.round(q.pos.z * 10), Math.round(q.vel.x * 10), Math.round(q.vel.y * 10), Math.round(q.vel.z * 10)]);
      return out;
    };
    G.applyProjectileState = function (list) {
      const mine = Array.isArray(list) ? list.filter((a) => Array.isArray(a) && a[0] >= 100) : [];
      applyProjectileState.call(this, Array.isArray(list) ? list.filter((a) => !(Array.isArray(a) && a[0] >= 100)) : list);
      const s = fxState(this);
      for (const q of s.pots.filter((q) => q.remote)) disposePot(this, q);
      s.pots = s.pots.filter((q) => !q.remote);
      for (const a of mine) {
        const kind = POT_KINDS[a[0] - 100];
        if (!kind || a.length < 7) continue;
        throwPotion(this, null, kind, new THREE.Vector3(a[1] / 10, a[2] / 10, a[3] / 10), new THREE.Vector3(a[4] / 10, a[5] / 10, a[6] / 10), true);
      }
    };

    // Breaking a stone block a silverfish hid in lets it out
    const breakBlock = G.breakBlock;
    G.breakBlock = function (hit, harvest) {
      const w = this.world, k = hit.x + ',' + hit.y + ',' + hit.z;
      const inf = w && w._m3inf && w._m3inf.has(k);
      const r = breakBlock.call(this, hit, harvest);
      if (inf && w.getBlock(hit.x, hit.y, hit.z) !== B.STONE) {
        w._m3inf.delete(k);
        if (this.isAuthority && this.difficulty > 0) this.spawnMob('silverfish', hit.x + 0.5, hit.y, hit.z + 0.5);
      }
      return r;
    };
    return true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hookGame);
  else setTimeout(hookGame, 0);

  // ---------------------------------------------------------------- debugging / tests
  window.M3Mobs = {
    types: NEW, caps: CAPS, hooked: () => hooked, spawnTick, addFx, throwPotion, bitsOf, applyBits,
    biomeAt: (g, x, z) => g.world.columnInfo(Math.floor(x), Math.floor(z)).biome,
  };
}
