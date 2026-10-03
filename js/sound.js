// Procedural sound engine (WebAudio). Every sound is synthesized: noise grains, oscillators,
// vowel (formant) filters and plucked strings, mixed through a small room reverb.
// Sounds with a position pan left/right and fade with distance from the listener.
// The recipes follow the "Sound design" board in the WebCraft Character Design canvas.
'use strict';

const Sound = {
  ctx: null,
  volume: 0.6,
  musicVolume: 0.5,
  noiseBuf: null,
  listener: { x: 0, y: 0, z: 0, yaw: 0 },
  init() {
    if (this.ctx) return;
    try {
      const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const len = ctx.sampleRate * 2;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // master: sfx + music -> compressor -> out; a shared reverb send
      this.comp = ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14; this.comp.ratio.value = 4; this.comp.attack.value = 0.004; this.comp.release.value = 0.2;
      this.comp.connect(ctx.destination);
      this.sfx = ctx.createGain(); this.sfx.gain.value = 1.5; this.sfx.connect(this.comp);
      this.musicBus = ctx.createGain(); this.musicBus.gain.value = this.musicVolume * 0.5; this.musicBus.connect(this.comp);
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this._impulse(1.6, 2.6);
      this.reverbGain = ctx.createGain(); this.reverbGain.gain.value = 0.22;
      this.reverb.connect(this.reverbGain); this.reverbGain.connect(this.comp);
      this.musicVerb = ctx.createConvolver();
      this.musicVerb.buffer = this._impulse(3.2, 2.2);
      const mv = ctx.createGain(); mv.gain.value = 0.55;
      this.musicVerb.connect(mv); mv.connect(this.musicBus);
      this.music = new MusicPlayer(this);
    } catch (e) { this.ctx = null; }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  setMusicVolume(v) { this.musicVolume = v; if (this.musicBus) this.musicBus.gain.value = v * 0.5; },

  // Decaying stereo noise: a cheap room impulse response
  _impulse(seconds, decay) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return buf;
  },

  // Where a sound goes: optionally panned and attenuated by position, with a reverb send
  _out(vol, pos, wet = 0.25) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    let v = vol * this.volume;
    let dest = this.sfx;
    if (pos) {
      const L = this.listener;
      const dx = pos.x - L.x, dy = (pos.y ?? L.y) - L.y, dz = pos.z - L.z;
      const dist = Math.hypot(dx, dy, dz);
      v *= Math.max(0, 1 - dist / 24) ** 1.4;
      if (v < 0.002) return null;
      if (ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        // listener's right vector from yaw (camera looks along -z when yaw = 0)
        const rx = Math.cos(L.yaw), rz = -Math.sin(L.yaw);
        p.pan.value = Math.max(-1, Math.min(1, (dx * rx + dz * rz) / Math.max(1, dist) * 0.85));
        p.connect(this.sfx);
        dest = p;
        g.connect(p);
      } else g.connect(dest);
    } else g.connect(dest);
    if (wet > 0) {
      const s = ctx.createGain();
      s.gain.value = wet;
      g.connect(s); s.connect(this.reverb);
    }
    g.gain.value = 0;
    g.v = v;
    return g;
  },
  _env(g, t, attack, dur, peak) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
  },

  // ---------------------------------------------------------------- building blocks
  // Filtered noise grain. Old signature kept: noise(freq, q, dur, vol, type)
  noise(freq, q, dur, vol, type = 'bandpass', opts = {}) {
    if (!this.ctx || this.volume <= 0) return;
    const ctx = this.ctx, t = ctx.currentTime + (opts.delay || 0);
    // filters remove most of white noise's energy: make up for it (narrower band, more gain)
    const makeup = type === 'bandpass' ? 2.2 + Math.min(4, q) * 1.1 : type === 'lowpass' ? 1.6 + 600 / Math.max(200, freq) : 1.6;
    const out = this._out(vol * makeup, opts.pos, opts.wet ?? 0.15);
    if (!out) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = opts.rate || 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (opts.sweep) f.frequency.exponentialRampToValueAtTime(Math.max(30, opts.sweep), t + dur);
    this._env(out, t, opts.attack || 0.004, dur, out.v);
    src.connect(f); f.connect(out);
    src.start(t, Math.random() * 1.5, dur + (opts.attack || 0) + 0.05);
  },
  // Oscillator note. Old signature kept: tone(freq, dur, vol, type, slide)
  tone(freq, dur, vol, type = 'square', slide = 0, opts = {}) {
    if (!this.ctx || this.volume <= 0) return;
    const ctx = this.ctx, t = ctx.currentTime + (opts.delay || 0);
    const bright = type === 'square' || type === 'sawtooth';
    const out = this._out(vol * (bright ? 0.6 : 1) * (opts.formant ? 1.8 + (opts.q || 3) * 0.55 : 1), opts.pos, opts.wet ?? 0.18);
    if (!out) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    let node = o;
    if (opts.formant) {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.Q.value = opts.q || 3;
      f.frequency.setValueAtTime(opts.formant[0], t);
      for (let i = 1; i < opts.formant.length; i++) f.frequency.linearRampToValueAtTime(opts.formant[i], t + dur * i / (opts.formant.length - 1));
      o.connect(f); node = f;
    }
    if (opts.vibrato) {
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = opts.vibrato[0]; lg.gain.value = opts.vibrato[1];
      lfo.connect(lg); lg.connect(o.frequency);
      lfo.start(t); lfo.stop(t + dur + 0.1);
    }
    if (opts.tremolo) {
      const lfo = ctx.createOscillator(), lg = ctx.createGain(), am = ctx.createGain();
      lfo.frequency.value = opts.tremolo; lg.gain.value = 0.5; am.gain.value = 0.5;
      lfo.connect(lg); lg.connect(am.gain); node.connect(am); node = am;
      lfo.start(t); lfo.stop(t + dur + 0.1);
    }
    node.connect(out);
    this._env(out, t, opts.attack || 0.005, dur, out.v);
    o.start(t); o.stop(t + dur + (opts.attack || 0) + 0.05);
  },
  // Karplus-Strong plucked string (bow twang, music)
  pluck(freq, dur, vol, opts = {}) {
    if (!this.ctx || this.volume <= 0) return;
    const ctx = this.ctx, sr = ctx.sampleRate, n = Math.floor(sr * dur);
    const buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
    const period = Math.max(2, Math.floor(sr / freq));
    const line = new Float32Array(period);
    for (let i = 0; i < period; i++) line[i] = Math.random() * 2 - 1;
    const damp = opts.damp ?? 0.996;
    for (let i = 0; i < n; i++) { const j = i % period, k = (i + 1) % period; const v = line[j]; d[i] = v; line[j] = (v + line[k]) * 0.5 * damp; }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const out = this._out(vol, opts.pos, opts.wet ?? 0.2);
    if (!out) return;
    out.gain.value = out.v;
    src.connect(out);
    src.start(ctx.currentTime + (opts.delay || 0));
  },
  // A bell: inharmonic sine partials
  bell(freq, dur, vol, opts = {}) {
    this.tone(freq, dur, vol, 'sine', 0, opts);
    this.tone(freq * 2.76, dur * 0.55, vol * 0.35, 'sine', 0, opts);
    this.tone(freq * 5.4, dur * 0.25, vol * 0.12, 'sine', 0, opts);
  },

  // ---------------------------------------------------------------- blocks
  _material(kind, loud, opts = {}) {
    const r = Math.random, p = opts.pitch || 1, o = Object.assign({ wet: 0.12 }, opts);
    switch (kind) {
      case 'grass':
        this.noise(2400 * p, 0.8, 0.07, 0.42 * loud, 'bandpass', o);
        this.noise(2000 * p, 0.8, 0.06, 0.3 * loud, 'bandpass', Object.assign({}, o, { delay: (o.delay || 0) + 0.03 }));
        this.noise(5000, 0.7, 0.04, 0.12 * loud, 'highpass', o);
        break;
      case 'stone':
        this.tone(1800 * p * (0.9 + r() * 0.2), 0.03, 0.18 * loud, 'sine', -900, o);
        this.noise(900 * p, 1.4, 0.09, 0.5 * loud, 'bandpass', o);
        break;
      case 'wood':
        this.tone(190 * p * (0.9 + r() * 0.2), 0.09, 0.4 * loud, 'sine', -70, o);
        this.noise(520 * p, 2.2, 0.08, 0.45 * loud, 'bandpass', o);
        break;
      case 'gravel':
        for (let i = 0; i < 4; i++) this.noise(1400 * p * (0.8 + r() * 0.5), 0.9, 0.05, 0.3 * loud, 'lowpass', Object.assign({}, o, { delay: (o.delay || 0) + r() * 0.12 }));
        break;
      case 'sand':
        this.noise(2200 * p, 0.6, 0.12, 0.32 * loud, 'lowpass', Object.assign({}, o, { attack: 0.03 }));
        break;
      case 'wool':
        this.noise(450 * p, 0.8, 0.1, 0.5 * loud, 'lowpass', Object.assign({}, o, { attack: 0.01 }));
        break;
      case 'glass':
        for (let i = 0; i < 3; i++) this.tone((2600 + r() * 1600) * p, 0.2 + r() * 0.2, 0.08 * loud, 'sine', 0, Object.assign({}, o, { delay: (o.delay || 0) + i * 0.03 }));
        this.noise(6000, 1, 0.15, 0.15 * loud, 'highpass', o);
        break;
      default:
        this.noise(900 * p, 1, 0.1, 0.45 * loud, 'bandpass', o);
    }
  },
  // Breaking / placing a block (old name kept)
  block(kind, loud = 1, pos) {
    this._material(kind, loud * 1.1, { pos, pitch: 0.85 });
    if (loud >= 1) for (let i = 0; i < 3; i++) this.noise(700 + Math.random() * 900, 0.9, 0.05, 0.12 * loud, 'bandpass', { delay: 0.05 + i * 0.04 + Math.random() * 0.03, pos });
  },
  dig(kind, pos) { this._material(kind, 0.85, { pos, pitch: 1 }); },
  place(kind, pos) { this._material(kind, 0.95, { pos, pitch: 0.8 }); },
  step(kind, loud = 1, pos) { this._material(kind, 0.32 * loud, { pos, pitch: 1.1 + Math.random() * 0.1, wet: 0.05 }); },
  glassBreak(pos) {
    for (let i = 0; i < 6; i++) this.tone(2400 + Math.random() * 3000, 0.25 + Math.random() * 0.3, 0.12, 'sine', 0, { delay: i * 0.025, pos });
    this.noise(5000, 1, 0.25, 0.4, 'highpass', { pos });
  },

  // ---------------------------------------------------------------- player
  hurt() {
    this.tone(210, 0.17, 0.9, 'sawtooth', -60, { formant: [700, 450], q: 4 });
    this.noise(1800, 0.8, 0.12, 0.12, 'bandpass');
  },
  pop() { this.tone(600 + Math.random() * 700, 0.07, 0.22, 'sine', 500, { wet: 0.05 }); },
  xp() { this.bell(900 + Math.random() * 700, 0.25, 0.3); },
  levelUp() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.bell(f, 0.6, 0.16, { delay: i * 0.09, wet: 0.4 })); },
  eat() { for (let i = 0; i < 3; i++) this.noise(1200 + Math.random() * 800, 1.2, 0.06, 0.32, 'bandpass', { delay: i * 0.09 }); },
  burp() { this.tone(130, 0.3, 0.35, 'sawtooth', -30, { formant: [500, 380], q: 3, vibrato: [6, 8] }); },
  click() { this.tone(1200, 0.02, 0.15, 'square', 0, { wet: 0 }); this.noise(5000, 1, 0.015, 0.1, 'highpass', { wet: 0 }); },
  splash(pos) { this.noise(2500, 0.6, 0.4, 0.45, 'lowpass', { sweep: 400, pos, wet: 0.2 }); this.noise(800, 1, 0.25, 0.2, 'bandpass', { delay: 0.05, pos }); },
  bow(pos) { this.pluck(110, 0.5, 0.5, { pos, damp: 0.99 }); this.noise(1500, 0.7, 0.2, 0.15, 'bandpass', { sweep: 600, pos }); },
  door(open, pos) {
    this.tone(open ? 85 : 70, 0.35, 0.35, 'sawtooth', open ? 30 : -15, { formant: [900, 1300, 800], q: 6, vibrato: [11, 9], pos });
    this.tone(150, 0.1, 0.4, 'sine', -60, { delay: open ? 0.3 : 0.25, pos });
    this.noise(450, 2, 0.08, 0.3, 'bandpass', { delay: open ? 0.3 : 0.25, pos });
  },
  chest(open, pos) {
    this.tone(open ? 70 : 95, 0.45, 0.6, 'sawtooth', open ? 40 : -30, { formant: [700, 1100], q: 6, vibrato: [8, 6], pos });
    if (!open) { this.tone(130, 0.12, 0.45, 'sine', -50, { delay: 0.4, pos }); this.noise(400, 2, 0.1, 0.3, 'bandpass', { delay: 0.4, pos }); }
  },

  // ---------------------------------------------------------------- world
  explode(pos) {
    this.noise(160, 0.6, 1.6, 1.3, 'lowpass', { pos, wet: 0.45 });
    this.noise(70, 0.4, 2.0, 1.1, 'lowpass', { pos, wet: 0.45 });
    this.noise(3000, 0.5, 0.15, 0.6, 'bandpass', { pos });
    for (let i = 0; i < 8; i++) this.noise(1500 + Math.random() * 3000, 1, 0.04, 0.15, 'bandpass', { delay: 0.1 + Math.random() * 0.8, pos });
  },
  fuse(pos) { this.noise(4000, 1, 1.4, 0.3, 'highpass', { pos, attack: 0.05 }); },
  thunder(delay = 0) {
    this.noise(3500, 0.6, 0.2, 0.7, 'bandpass', { delay, wet: 0.5 });
    this.noise(90, 0.3, 2.5, 1.2, 'lowpass', { delay: delay + 0.05, wet: 0.6, attack: 0.05 });
    this.noise(220, 0.5, 1.8, 0.5, 'lowpass', { delay: delay + 0.3, wet: 0.6 });
  },
  // Continuous rain bed; level 0..1
  setRain(level) {
    if (!this.ctx) return;
    if (!this.rainSrc && level > 0.01) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf; src.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1200;
      const f2 = this.ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 7000;
      const g = this.ctx.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(f2); f2.connect(g); g.connect(this.sfx);
      src.start();
      this.rainSrc = src; this.rainGain = g;
    }
    if (this.rainGain) this.rainGain.gain.setTargetAtTime(level * 0.16 * this.volume, this.ctx.currentTime, 0.4);
  },

  // ---------------------------------------------------------------- mobs
  mob(type, pos) {
    const r = Math.random(), o = { pos };
    switch (type) {
      case 'pig':
        this.tone(160 + r * 30, 0.14, 0.4, 'sawtooth', -40, Object.assign({ formant: [520, 420], q: 4 }, o));
        this.tone(150 + r * 30, 0.12, 0.35, 'sawtooth', -30, Object.assign({ formant: [500, 400], q: 4, delay: 0.18 }, o));
        break;
      case 'cow': this.tone(105 + r * 15, 0.85, 0.45, 'sawtooth', -20, Object.assign({ formant: [400, 700, 350], q: 5, vibrato: [5, 4], attack: 0.12 }, o)); break;
      case 'sheep': this.tone(290 + r * 40, 0.5, 0.3, 'square', -30, Object.assign({ formant: [900, 800], q: 3, tremolo: 7, attack: 0.04 }, o)); break;
      case 'chicken': for (let i = 0; i < 3; i++) this.tone(900 + Math.random() * 400, 0.04, 0.25, 'square', 300, Object.assign({ delay: i * 0.07, formant: [1500, 1200], q: 2 }, o)); break;
      case 'zombie':
        this.tone(80 + r * 15, 0.9, 0.5, 'sawtooth', -15, Object.assign({ formant: [300, 380, 260], q: 4, vibrato: [4, 3], attack: 0.15 }, o));
        this.noise(400, 1, 0.8, 0.12, 'bandpass', Object.assign({ attack: 0.15 }, o));
        break;
      case 'skeleton': for (let i = 0; i < 6; i++) this.tone(700 + Math.random() * 500, 0.025, 0.25, 'square', -300, Object.assign({ delay: i * 0.04, formant: [900], q: 2 }, o)); break;
      case 'spider': for (let i = 0; i < 3; i++) this.noise(3000, 2, 0.12, 0.3, 'bandpass', Object.assign({ delay: i * 0.15 }, o)); break;
      case 'villager': this.tone(220 + r * 30, 0.4, 0.35, 'triangle', -40, Object.assign({ formant: [1100, 900], q: 3, attack: 0.04 }, o)); break;
      case 'piglin': this.tone(140 + r * 20, 0.35, 0.4, 'sawtooth', 30, Object.assign({ formant: [450, 650], q: 4 }, o)); break;
      case 'ghast': this.tone(420 + r * 80, 1.2, 0.3, 'sine', -200, Object.assign({ vibrato: [6, 20], attack: 0.3, wet: 0.6 }, o)); break;
      case 'enderman': this.tone(400, 0.7, 0.3, 'sine', -200, Object.assign({ vibrato: [9, 120], attack: 0.1 }, o)); break;
      case 'wolf': this.tone(340 + r * 60, 0.12, 0.4, 'sawtooth', -120, Object.assign({ formant: [900, 600], q: 3 }, o)); this.noise(1200, 1, 0.08, 0.15, 'bandpass', o); break;
      case 'slime': this.noise(300, 1.5, 0.15, 0.4, 'lowpass', Object.assign({ sweep: 150 }, o)); break;
      case 'blaze': this.noise(600, 0.7, 0.9, 0.3, 'bandpass', Object.assign({ sweep: 200, attack: 0.2 }, o)); break;
      case 'golem': this.tone(90, 0.3, 0.4, 'square', -20, Object.assign({ formant: [300], q: 2 }, o)); break;
      case 'bot': break;
    }
  },
  mobHurt(type, pos) {
    const o = { pos };
    if (type === 'zombie' || type === 'piglin') this.tone(130, 0.3, 0.45, 'sawtooth', -40, Object.assign({ formant: [450, 320], q: 4 }, o));
    else if (type === 'creeper' || type === 'spider') this.noise(800, 1, 0.2, 0.4, 'bandpass', o);
    else if (type === 'skeleton') for (let i = 0; i < 3; i++) this.tone(900, 0.03, 0.3, 'square', -400, Object.assign({ delay: i * 0.04 }, o));
    else if (type === 'pig') this.tone(260, 0.2, 0.4, 'sawtooth', -60, Object.assign({ formant: [700, 500], q: 4 }, o));
    else if (type === 'cow') this.tone(150, 0.3, 0.45, 'sawtooth', -40, Object.assign({ formant: [600, 400], q: 4 }, o));
    else if (type === 'bot' || type === 'villager') this.tone(type === 'bot' ? 200 : 260, 0.17, 0.45, 'sawtooth', -60, Object.assign({ formant: [700, 450], q: 4 }, o));
    else this.tone(300, 0.2, 0.35, 'sawtooth', -100, Object.assign({ formant: [800, 500], q: 3 }, o));
  },
};

// ---------------------------------------------------------------- generative music
// Soft piano phrases over a slow chord loop, then long silences (like the game's ambient music).
class MusicPlayer {
  constructor(s) {
    this.s = s;
    this.next = 20 + Math.random() * 40; // first phrase after a short wait
    this.playing = false;
    this.cave = 60;
  }
  note(freq, t, vel) {
    const ctx = this.s.ctx;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(this.s.musicBus);
    const send = ctx.createGain(); send.gain.value = 0.7; g.connect(send); send.connect(this.s.musicVerb);
    // piano-ish: a few partials with their own decays and a soft hammer
    [[1, 1, 2.6], [2, 0.42, 1.6], [3, 0.2, 1.1], [4.2, 0.08, 0.6]].forEach(([mul, amp, dec]) => {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq * mul * (1 + (Math.random() - 0.5) * 0.0015);
      og.gain.setValueAtTime(0.0001, t);
      og.gain.linearRampToValueAtTime(amp * vel, t + 0.008);
      og.gain.exponentialRampToValueAtTime(0.0001, t + dec * (1.2 - Math.log2(freq / 220) * 0.15));
      o.connect(og); og.connect(g);
      o.start(t); o.stop(t + 3.5);
    });
    g.gain.setValueAtTime(1, t);
  }
  phrase() {
    const ctx = this.s.ctx;
    const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const chords = [[48, 55, 59, 64], [45, 52, 60, 64, 71], [41, 48, 57, 64], [43, 50, 55, 64]]; // Cmaj7, Am9, Fmaj7, G6
    const scale = [60, 62, 64, 67, 69, 72, 74, 76, 79];
    let t = ctx.currentTime + 0.2;
    const bars = 4 + Math.floor(Math.random() * 4);
    let mel = 4;
    for (let b = 0; b < bars; b++) {
      const ch = chords[(b + (Math.random() < 0.3 ? 1 : 0)) % chords.length];
      ch.forEach((m, i) => this.note(midi(m), t + i * 0.09, 0.07));
      const beats = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < beats; k++) {
        if (Math.random() < 0.25) continue;
        mel = Math.max(0, Math.min(scale.length - 1, mel + Math.floor(Math.random() * 5) - 2));
        this.note(midi(scale[mel]), t + 0.6 + k * (3.6 / beats) + Math.random() * 0.15, 0.09);
      }
      t += 4.2 + Math.random() * 0.6;
    }
    return t - ctx.currentTime;
  }
  // called every frame; underground = deep and dark
  update(dt, underground) {
    if (!this.s.ctx || this.s.musicVolume <= 0) return;
    this.next -= dt;
    if (this.next <= 0) {
      const len = this.phrase();
      this.next = len + 60 + Math.random() * 120;
    }
    if (underground) {
      this.cave -= dt;
      if (this.cave <= 0) {
        this.cave = 90 + Math.random() * 180;
        // a distant, eerie drone
        this.s.tone(55 + Math.random() * 20, 4, 0.12, 'sine', -10, { attack: 1.5, wet: 0.9, vibrato: [0.3, 2] });
        this.s.tone(82 + Math.random() * 20, 3.5, 0.06, 'triangle', 15, { attack: 1.2, wet: 0.9, delay: 0.8 });
      }
    }
  }
}
