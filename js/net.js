// Multiplayer networking. Two transports share one message protocol:
//  - RoomTransport: the claude.ai artifact "room" capability (friends who have the page open)
//  - WSTransport: a self-hosted WebSocket server (server/server.js)
'use strict';

const NET_TOPICS = ['hello', 'welcome', 'edits', 'block', 'blocks', 'chat', 'hitmob', 'hurt', 'mobdrop', 'boom', 'bdata'];

async function getRoomCapability() {
  try {
    if (!window.claude || typeof window.claude.use !== 'function') return null;
    return await window.claude.use('room');
  } catch (e) { return null; }
}

class RoomTransport {
  constructor(named) {
    this.r = named;
    this.unsubs = [];
    this.myId = null;
  }
  start(onMessage, onPeers, onError) {
    for (const topic of NET_TOPICS) {
      this.unsubs.push(this.r.on(topic, (msg) => {
        if (msg.sameTab) return;
        onMessage(topic, msg.data, msg.peer);
      }, (e) => onError && onError(e)));
    }
    this.unsubs.push(this.r.onPeers((change) => {
      const list = [];
      for (const p of change.peers) {
        if (p.sameTab) { this.myId = p.peer; continue; }
        list.push({ id: p.peer, presence: p.presence || {} });
      }
      onPeers(list, change.left.map((p) => p.peer));
    }, (e) => onError && onError(e)));
  }
  send(topic, data) { return this.r.emit(topic, data).catch(() => {}); }
  presence(obj) { return this.r.presence(obj).catch(() => {}); }
  close() {
    for (const u of this.unsubs) try { u(); } catch (e) { /* ignore */ }
    this.unsubs = [];
    return this.r.leave().catch(() => {});
  }
}

class WSTransport {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.myId = null;
    this.isHostRole = false;
    this.onRole = null;
  }
  connect() {
    return new Promise((resolve, reject) => {
      let ws;
      try { ws = new WebSocket(this.url); } catch (e) { reject(e); return; }
      this.ws = ws;
      const timer = setTimeout(() => { reject(new Error('Connection timed out')); try { ws.close(); } catch (e) { /* */ } }, 8000);
      ws.onopen = () => { clearTimeout(timer); resolve(); };
      ws.onerror = () => { clearTimeout(timer); reject(new Error('Could not connect to ' + this.url)); };
    });
  }
  start(onMessage, onPeers, onError) {
    this.ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === 'role') {
        this.myId = m.d.id;
        this.isHostRole = !!m.d.host;
        if (this.onRole) this.onRole(this.isHostRole);
      } else if (m.t === 'peers') {
        const list = (m.d || []).filter((p) => p.id !== this.myId);
        onPeers(list, m.left || []);
      } else {
        onMessage(m.t, m.d, m.from);
      }
    };
    this.ws.onclose = () => onError && onError({ code: 'closed', message: 'Disconnected from server' });
  }
  send(topic, data) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ t: topic, d: data }));
  }
  presence(obj) { this.send('presence', obj); }
  close() { try { this.ws.close(); } catch (e) { /* ignore */ } }
}

// Encode/decode block lists compactly: "x,y,z,id;x,y,z,id"
function encodeBlocks(list) { return list.map((b) => b.join(',')).join(';'); }
function decodeBlocks(s) {
  if (typeof s !== 'string' || !s) return [];
  return s.split(';').map((t) => t.split(',').map(Number)).filter((a) => a.length === 4 && a.every(Number.isFinite));
}
// Split into parts that fit the room's 4 KiB message limit.
function chunkBlocks(list, maxBytes = 3400) {
  const parts = [];
  let cur = [], size = 0;
  for (const b of list) {
    const s = b.join(',').length + 1;
    if (size + s > maxBytes && cur.length) { parts.push(encodeBlocks(cur)); cur = []; size = 0; }
    cur.push(b); size += s;
  }
  if (cur.length) parts.push(encodeBlocks(cur));
  return parts;
}

class Net {
  constructor(game) {
    this.game = game;
    this.transport = null;
    this.kind = null;       // 'room' | 'ws'
    this.isHost = false;    // simulates mobs + time
    this.serverAuth = false; // server answers 'hello' (ws)
    this.peers = new Map(); // id -> presence
    this.handlers = {};
    this.lastPresence = 0;
    this.presenceState = {};
    this.code = null;
    this.connected = false;
    this.onPeersChanged = null;
    this.onDisconnect = null;
  }

  get active() { return !!this.transport; }
  get myId() { return this.transport ? this.transport.myId : null; }

  on(topic, fn) { this.handlers[topic] = fn; }

  _start() {
    this.transport.start(
      (topic, data, from) => {
        if (data && typeof data === 'object' && data.to && data.to !== this.myId) return;
        const h = this.handlers[topic];
        if (h) {
          try { h(data || {}, from); } catch (e) { console.error('net handler', topic, e); }
        }
      },
      (list, left) => {
        this.peers.clear();
        for (const p of list) this.peers.set(p.id, p.presence);
        if (this.onPeersChanged) this.onPeersChanged(this.peers, left);
      },
      (err) => {
        if (!this.transport) return;
        this.connected = false;
        if (this.onDisconnect) this.onDisconnect(err && err.message ? err.message : 'Connection lost');
      },
    );
    this.connected = true;
  }

  // Host an existing (singleplayer) world for friends via the artifact room.
  async hostRoom(code) {
    const room = await getRoomCapability();
    if (!room) throw new Error('Live multiplayer is only available when this game is opened as a shared claude.ai artifact.');
    const named = await room.join('wc-' + code);
    this.transport = new RoomTransport(named);
    this.kind = 'room';
    this.isHost = true;
    this.code = code;
    this._start();
    this.lobby = room;
    room.presence({ hosting: { code, name: this.game.worldName.slice(0, 40), mode: this.game.player.mode } }).catch(() => {});
  }

  async joinRoom(code) {
    const room = await getRoomCapability();
    if (!room) throw new Error('Live multiplayer is only available when this game is opened as a shared claude.ai artifact.');
    const named = await room.join('wc-' + code);
    this.transport = new RoomTransport(named);
    this.kind = 'room';
    this.isHost = false;
    this.code = code;
    this._start();
  }

  async joinServer(url) {
    const t = new WSTransport(url);
    await t.connect();
    this.transport = t;
    this.kind = 'ws';
    this.serverAuth = true;
    t.onRole = (host) => {
      const was = this.isHost;
      this.isHost = host;
      if (host && !was && this.game.chat) this.game.chat.system('You are now simulating mobs and time for this server.');
    };
    this._start();
  }

  send(topic, data) {
    if (this.transport) this.transport.send(topic, data);
  }

  // Throttled presence (about 10 per second).
  presence(obj, force = false) {
    if (!this.transport) return;
    const now = performance.now();
    if (!force && now - this.lastPresence < 100) return;
    this.lastPresence = now;
    this.transport.presence(obj);
  }

  sendBlocks(list) {
    if (!this.transport || !list.length) return;
    if (this.kind === 'ws') { this.send('blocks', { d: encodeBlocks(list) }); return; }
    for (const part of chunkBlocks(list)) this.send('blocks', { d: part });
  }

  // Host side: answer a joiner with the world state.
  sendWorldTo(peer, welcome) {
    this.send('welcome', Object.assign({ to: peer }, welcome));
    const parts = chunkBlocks(this.game.world.editList());
    const datas = [...this.game.world.blockData.entries()];
    let i = 0;
    const total = parts.length;
    const tick = () => {
      if (!this.transport) return;
      if (i < total) {
        this.send('edits', { to: peer, part: i, total, d: parts[i] });
        i++;
        setTimeout(tick, 120);
      } else {
        if (!total) this.send('edits', { to: peer, part: 0, total: 0, d: '' });
        datas.forEach(([k, v], j) => {
          const [x, y, z] = k.split(',').map(Number);
          setTimeout(() => this.send('bdata', { to: peer, x, y, z, d: v }), j * 60);
        });
      }
    };
    tick();
  }

  async close() {
    const t = this.transport;
    this.transport = null;
    this.connected = false;
    this.peers.clear();
    this.isHost = false;
    this.serverAuth = false;
    if (this.lobby) { this.lobby.presence({ hosting: null }).catch(() => {}); this.lobby = null; }
    if (t) await t.close();
  }
}
