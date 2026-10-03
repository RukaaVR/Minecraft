// Item stacks and inventories.
'use strict';

// A stack is {id, count, dmg} (dmg = tool damage taken) or null.
function stackOf(id, count = 1, dmg = 0, ench) {
  const s = { id, count, dmg };
  if (ench && typeof ench === 'object' && Object.keys(ench).length) s.ench = Object.assign({}, ench);
  return s;
}
function copyStack(s, count) { return s ? stackOf(s.id, count ?? s.count, s.dmg, s.ench) : null; }
function maxStack(id) { return ITEMS[id] ? ITEMS[id].stack : 64; }
function sameKind(a, b) { return a && b && a.id === b.id && (a.dmg || 0) === (b.dmg || 0) && !a.ench && !b.ench && maxStack(a.id) > 1; }

class Inventory {
  constructor(size) {
    this.slots = new Array(size).fill(null);
    this.onChange = null;
  }
  changed() { if (this.onChange) this.onChange(); }

  // Add a stack; returns leftover count (0 = everything fit).
  add(stack, order) {
    if (!stack) return 0;
    let left = stack.count;
    const idx = order || this.slots.map((_, i) => i);
    for (const i of idx) {
      const s = this.slots[i];
      if (s && sameKind(s, stack) && s.count < maxStack(s.id)) {
        const n = Math.min(left, maxStack(s.id) - s.count);
        s.count += n; left -= n;
        if (!left) break;
      }
    }
    if (left) {
      for (const i of idx) {
        if (!this.slots[i]) {
          const n = Math.min(left, maxStack(stack.id));
          this.slots[i] = stackOf(stack.id, n, stack.dmg || 0, stack.ench);
          left -= n;
          if (!left) break;
        }
      }
    }
    if (left !== stack.count) this.changed();
    return left;
  }

  canFit(stack) {
    let left = stack.count;
    for (const s of this.slots) {
      if (!s) left -= maxStack(stack.id);
      else if (sameKind(s, stack)) left -= maxStack(s.id) - s.count;
      if (left <= 0) return true;
    }
    return false;
  }

  count(id) { return this.slots.reduce((n, s) => n + (s && s.id === id ? s.count : 0), 0); }

  removeFrom(i, n = 1) {
    const s = this.slots[i];
    if (!s) return;
    s.count -= n;
    if (s.count <= 0) this.slots[i] = null;
    this.changed();
  }

  clear() { this.slots.fill(null); this.changed(); }

  serialize() { return this.slots.map((s) => (s ? (s.ench ? [s.id, s.count, s.dmg || 0, s.ench] : [s.id, s.count, s.dmg || 0]) : 0)); }
  load(arr) {
    this.slots = this.slots.map((_, i) => {
      const s = arr[i];
      return s && ITEMS[s[0]] ? stackOf(s[0], s[1], s[2], s[3]) : null;
    });
    this.changed();
  }
}

// Inventory order used when picking items up: hotbar first, then main.
const PICKUP_ORDER = [...Array(9).keys(), ...Array.from({ length: 27 }, (_, i) => i + 9)];
