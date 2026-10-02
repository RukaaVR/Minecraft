#!/usr/bin/env node
// WebCraft multiplayer server.
// Serves the game over HTTP and relays multiplayer traffic over WebSocket on the same port.
// The server stores the world (seed + every block change) and saves it to disk.
// The first player to join simulates mobs and the day/night cycle; if they leave, the next player takes over.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
}));
const PORT = parseInt(args.port || process.env.PORT || '25565', 10);
const WORLD_FILE = path.resolve(args.world || process.env.WORLD || path.join(__dirname, 'world.json'));
const ROOT = path.resolve(__dirname, '..');
const MODES = ['survival', 'creative', 'adventure', 'spectator'];
const DIFFS = ['peaceful', 'easy', 'normal', 'hard'];

function hashSeed(s) {
  if (/^-?\d+$/.test(String(s))) return parseInt(s, 10) | 0;
  let h = 0;
  for (const ch of String(s)) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return h;
}

// ---------------------------------------------------------------- world state
let world = {
  name: args.name || process.env.WORLD_NAME || 'WebCraft Server',
  seed: args.seed !== undefined ? hashSeed(args.seed) : (Math.random() * 2147483647) | 0,
  mode: MODES.includes(args.mode) ? args.mode : 'survival',
  difficulty: Math.max(0, DIFFS.indexOf(args.difficulty || 'normal')),
  time: 0.3,
  edits: {},  // "x,y,z" -> id
  data: {},   // "x,y,z" -> block data (chests, furnaces, facing)
};
if (fs.existsSync(WORLD_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(WORLD_FILE, 'utf8'));
    world = Object.assign(world, saved);
    if (args.mode && MODES.includes(args.mode)) world.mode = args.mode;
    console.log(`Loaded world "${world.name}" (seed ${world.seed}, ${Object.keys(world.edits).length} block changes)`);
  } catch (e) {
    console.error('Could not read world file, starting fresh:', e.message);
  }
} else {
  console.log(`Created new world "${world.name}" with seed ${world.seed}`);
}
let dirty = false;
function save() {
  if (!dirty) return;
  dirty = false;
  fs.writeFileSync(WORLD_FILE + '.tmp', JSON.stringify(world));
  fs.renameSync(WORLD_FILE + '.tmp', WORLD_FILE);
}
setInterval(save, 30000);

function setBlock(x, y, z, id) {
  if (![x, y, z, id].every(Number.isInteger) || y < 0 || y > 255 || id < 0 || id > 255) return false;
  world.edits[`${x},${y},${z}`] = id;
  dirty = true;
  return true;
}

// ---------------------------------------------------------------- http (static files)
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.md': 'text/markdown' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/index.html';
  if (p === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT) || file.startsWith(path.join(ROOT, 'server')) || file.includes(`${path.sep}.git`)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});

// ---------------------------------------------------------------- websocket
const wss = new WebSocketServer({ server, maxPayload: 1 << 20 });
const clients = new Map(); // id -> {ws, presence, joined}
let nextId = 1;
let hostId = null;

function send(ws, t, d, from) {
  if (ws.readyState === 1) ws.send(JSON.stringify(from ? { t, d, from } : { t, d }));
}
function broadcast(t, d, from, except) {
  for (const [id, c] of clients) if (id !== except) send(c.ws, t, d, from);
}
function pickHost() {
  const ids = [...clients.keys()];
  const newHost = ids.length ? ids[0] : null;
  if (newHost === hostId) return;
  hostId = newHost;
  for (const [id, c] of clients) send(c.ws, 'role', { id, host: id === hostId });
}

wss.on('connection', (ws, req) => {
  const id = 'p' + (nextId++);
  clients.set(id, { ws, presence: {}, joined: false });
  send(ws, 'role', { id, host: false });
  pickHost();
  if (hostId === id) send(ws, 'role', { id, host: true });
  console.log(`Connection ${id} from ${req.socket.remoteAddress} (${clients.size} online)`);

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    const c = clients.get(id);
    const d = m.d && typeof m.d === 'object' ? m.d : {};
    switch (m.t) {
      case 'hello': {
        const name = String(d.n || 'Player').slice(0, 16);
        if (!c.joined) {
          c.joined = true;
          console.log(`${name} joined the game`);
        }
        send(ws, 'welcome', { seed: world.seed, mode: world.mode, difficulty: world.difficulty, time: world.time, name: world.name, spawn: world.spawn || null });
        const list = Object.entries(world.edits).map(([k, v]) => k + ',' + v).join(';');
        send(ws, 'edits', { part: 0, total: 1, d: list });
        for (const [k, v] of Object.entries(world.data)) {
          const [x, y, z] = k.split(',').map(Number);
          send(ws, 'bdata', { x, y, z, d: v });
        }
        break;
      }
      case 'presence':
        c.presence = d;
        if (id === hostId && typeof d.t === 'number') world.time = d.t;
        break;
      case 'block':
        if (setBlock(d.x, d.y, d.z, d.id)) {
          if (typeof d.f === 'number') { world.data[`${d.x},${d.y},${d.z}`] = Object.assign({}, world.data[`${d.x},${d.y},${d.z}`], { facing: d.f & 3 }); }
          if (d.id === 0) delete world.data[`${d.x},${d.y},${d.z}`];
          broadcast('block', d, id, id);
        }
        break;
      case 'blocks':
        if (typeof d.d === 'string') {
          for (const part of d.d.split(';')) {
            const [x, y, z, b] = part.split(',').map(Number);
            setBlock(x, y, z, b);
          }
          broadcast('blocks', d, id, id);
        }
        break;
      case 'bdata':
        if ([d.x, d.y, d.z].every(Number.isInteger)) {
          const k = `${d.x},${d.y},${d.z}`;
          if (d.d && typeof d.d === 'object') world.data[k] = d.d; else delete world.data[k];
          dirty = true;
          broadcast('bdata', d, id, id);
        }
        break;
      case 'chat':
        if (d.t) console.log(`<${String(d.n || '').slice(0, 16)}> ${String(d.t).slice(0, 256)}`);
        broadcast(m.t, d, id, id);
        break;
      case 'hitmob': case 'hurt': case 'mobdrop': case 'boom':
        broadcast(m.t, d, id, id);
        break;
    }
  });

  ws.on('close', () => {
    const c = clients.get(id);
    clients.delete(id);
    if (c && c.presence && c.presence.n) console.log(`${String(c.presence.n).slice(0, 16)} left the game`);
    if (id === hostId) { hostId = null; pickHost(); }
    for (const [, o] of clients) send(o.ws, 'peers', [...clients].filter(([cid]) => cid !== null).map(([cid, cc]) => ({ id: cid, presence: cc.presence })));
  });
});

// Presence to everyone, 10 times a second
setInterval(() => {
  if (!clients.size) return;
  const list = [...clients].map(([cid, cc]) => ({ id: cid, presence: cc.presence }));
  for (const [, c] of clients) send(c.ws, 'peers', list);
}, 100);

server.listen(PORT, () => {
  console.log(`WebCraft server running.`);
  console.log(`  Play in a browser:   http://localhost:${PORT}`);
  console.log(`  Or Direct Connect:   localhost:${PORT}`);
  console.log(`  World: ${world.mode} mode, ${DIFFS[world.difficulty]}, saved to ${WORLD_FILE}`);
});

function shutdown() {
  console.log('Saving world…');
  dirty = true;
  save();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
