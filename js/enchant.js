// Experience (orbs, levels) and enchanting.
'use strict';

// ---------------------------------------------------------------- experience
// Points needed to go from `level` to level + 1 (Minecraft's curve)
function xpForLevel(level) {
  if (level < 16) return 2 * level + 7;
  if (level < 31) return 5 * level - 38;
  return 9 * level - 158;
}
// Total points -> { level, progress 0..1 }
function xpLevel(points) {
  let level = 0, left = points;
  while (left >= xpForLevel(level)) { left -= xpForLevel(level); level++; }
  return { level, progress: left / xpForLevel(level) };
}
function xpTotalForLevel(level) {
  let t = 0;
  for (let i = 0; i < level; i++) t += xpForLevel(i);
  return t;
}

const ORE_XP = {
  [B.COAL_ORE]: [0, 2], [B.DIAMOND_ORE]: [3, 7], [B.EMERALD_ORE]: [3, 7], [B.LAPIS_ORE]: [2, 5],
  [B.REDSTONE_ORE]: [1, 5], [B.QUARTZ_ORE]: [2, 5],
};
const MOB_XP = { pig: [1, 3], cow: [1, 3], sheep: [1, 3], chicken: [1, 3], zombie: [5, 5], skeleton: [5, 5], creeper: [5, 5], spider: [5, 5], piglin: [5, 5], ghast: [5, 5], enderman: [5, 5], blaze: [10, 10], slime: [1, 4], wolf: [1, 3], golem: [0, 0], villager: [0, 0], dragon: [500, 500], crystal: [0, 0] };

class XPOrb {
  constructor(game, x, y, z, value) {
    this.game = game;
    this.value = value;
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3((Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3);
    this.w = 0.25; this.h = 0.25; this.onGround = false;
    this.age = 0;
    const size = value >= 20 ? 0.36 : value >= 7 ? 0.28 : 0.2;
    this.mesh = new THREE.Mesh(tileSprite(T.ITEM3 + 11, size), new THREE.MeshBasicMaterial({ map: game.atlas, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }));
    game.scene.add(this.mesh);
  }
  dispose() { this.game.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
  update(dt) {
    const g = this.game, p = g.player;
    this.age += dt;
    const target = new THREE.Vector3(p.pos.x, p.pos.y + 0.8, p.pos.z);
    const d = target.distanceTo(this.pos);
    if (d < 7 && !p.dead && p.mode !== 'spectator' && this.age > 0.5) {
      const pull = target.sub(this.pos).normalize().multiplyScalar((1 - d / 7) * 30 * dt);
      this.vel.add(pull);
    }
    this.vel.y -= 12 * dt;
    this.vel.multiplyScalar(Math.pow(0.4, dt));
    moveBody(g.world, this, dt, { stepHeight: 0 });
    this.mesh.position.set(this.pos.x, this.pos.y + 0.15 + Math.sin(this.age * 4) * 0.04, this.pos.z);
    this.mesh.quaternion.copy(g.camera.quaternion);
    const pulse = 0.75 + Math.sin(this.age * 6) * 0.25;
    this.mesh.material.color.setRGB(pulse * 1.5, 1.6, pulse * 0.6);
    if (d < 1.3 && this.age > 0.5 && !p.dead && p.mode !== 'spectator') { g.giveXP(this.value); return false; }
    return this.age < 300;
  }
}

// A flat camera-facing quad textured with one atlas tile
function tileSprite(tile, size) {
  const [u0, v0, u1, v1] = tileUV(tile);
  const g = new THREE.PlaneGeometry(size, size);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
  return g;
}

// ---------------------------------------------------------------- enchantments
const ENCHANTS = {
  efficiency: { name: 'Efficiency', max: 5, applies: (it) => it.tool && ['pickaxe', 'axe', 'shovel', 'shears', 'hoe'].includes(it.tool.type) },
  sharpness: { name: 'Sharpness', max: 5, applies: (it) => it.tool && (it.tool.type === 'sword' || it.tool.type === 'axe') },
  power: { name: 'Power', max: 5, applies: (it) => it.tool && it.tool.type === 'bow' },
  infinity: { name: 'Infinity', max: 1, applies: (it) => it.tool && it.tool.type === 'bow' },
  protection: { name: 'Protection', max: 4, applies: (it) => !!it.armor },
  feather_falling: { name: 'Feather Falling', max: 4, applies: (it) => it.armor && it.armor.slot === 3 },
  unbreaking: { name: 'Unbreaking', max: 3, applies: (it) => !!(it.tool || it.armor) },
};
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
function enchName(key, lvl) { return ENCHANTS[key].name + (ENCHANTS[key].max > 1 ? ' ' + ROMAN[lvl] : ''); }
function enchLevel(stack, key) { return stack && stack.ench ? stack.ench[key] || 0 : 0; }
function canEnchant(stack) {
  if (!stack || stack.ench) return false;
  const it = ITEMS[stack.id];
  return Object.values(ENCHANTS).some((e) => e.applies(it));
}

// Three offers for an item with `shelves` bookshelves around the table.
function enchantOffers(stack, shelves, seed) {
  if (!canEnchant(stack)) return [];
  const r = mulberry32((seed ^ stack.id * 7919) >>> 0);
  const b = Math.min(15, shelves);
  const base = 1 + Math.floor(r() * 8) + Math.floor(b / 2) + Math.floor(r() * (b + 1));
  const costs = [Math.max(Math.floor(base / 3), 1), Math.floor(base * 2 / 3) + 1, Math.max(base, b * 2)];
  const it = ITEMS[stack.id];
  const pool = Object.keys(ENCHANTS).filter((k) => ENCHANTS[k].applies(it));
  return costs.map((cost, slot) => {
    const ench = {};
    const pick = () => {
      const free = pool.filter((k) => !ench[k] && !(k === 'infinity' && ench.power === undefined && false));
      if (!free.length) return;
      const k = free[Math.floor(r() * free.length)];
      ench[k] = Math.max(1, Math.min(ENCHANTS[k].max, Math.ceil(cost / (30 / ENCHANTS[k].max))));
    };
    pick();
    let chance = (cost + 1) / 50;
    while (r() < chance) { pick(); chance /= 2; }
    return { cost, lapis: slot + 1, ench };
  });
}

Object.assign(Game.prototype, {
  spawnXP(x, y, z, amount) {
    if (amount <= 0 || !this.player || !this.player.usesHealth && this.player.mode !== 'creative') return;
    // split into orbs like Minecraft (sizes 1, 3, 7, 17, 37...)
    const sizes = [37, 17, 7, 3, 1];
    let left = Math.round(amount);
    while (left > 0 && this.orbs.length < 200) {
      const s = sizes.find((v) => v <= left) || 1;
      this.orbs.push(new XPOrb(this, x, y, z, s));
      left -= s;
    }
  },
  giveXP(n) {
    const p = this.player;
    const before = xpLevel(p.xp).level;
    p.xp += n;
    const after = xpLevel(p.xp).level;
    Sound.xp();
    if (after > before && after % 5 === 0) Sound.levelUp();
  },
  updateOrbs(dt) {
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      if (!this.orbs[i].update(dt)) { this.orbs[i].dispose(); this.orbs.splice(i, 1); }
    }
  },
  countBookshelves(x, y, z) {
    let n = 0;
    for (let dy = 0; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== 2) continue;
      if (this.world.getBlock(x + dx, y + dy, z + dz) === B.BOOKSHELF) n++;
    }
    return n;
  },
  // Apply an offer to the stack in the table; returns true on success.
  enchantItem(table, offerIndex) {
    const p = this.player;
    const offers = enchantOffers(table.item, this.countBookshelves(...table.pos), p.enchantSeed);
    const o = offers[offerIndex];
    if (!o) return false;
    const creative = p.mode === 'creative';
    const lvl = xpLevel(p.xp).level;
    if (!creative && (lvl < o.cost || !table.lapis || table.lapis.count < o.lapis)) return false;
    table.item.ench = o.ench;
    if (!creative) {
      p.xp = xpTotalForLevel(Math.max(0, lvl - o.lapis)) + Math.floor(xpLevel(p.xp).progress * xpForLevel(Math.max(0, lvl - o.lapis)));
      table.lapis.count -= o.lapis;
      if (table.lapis.count <= 0) table.lapis = null;
    }
    p.enchantSeed = (Math.random() * 2147483647) | 0;
    Sound.tone(700, 0.5, 0.2, 'sine', 700);
    Sound.tone(1050, 0.6, 0.12, 'triangle', 600);
    return true;
  },
});
