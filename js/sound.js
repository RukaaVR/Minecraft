// Small procedural sound engine (WebAudio). No audio files needed.
'use strict';

const Sound = {
  ctx: null,
  volume: 0.6,
  noiseBuf: null,
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  _gain(v, at = 0) {
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.connect(this.ctx.destination);
    return g;
  },
  // Filtered noise burst
  noise(freq, q, dur, vol, type = 'bandpass') {
    if (!this.ctx || this.volume <= 0) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this._gain();
    g.gain.setValueAtTime(vol * this.volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  },
  tone(freq, dur, vol, type = 'square', slide = 0) {
    if (!this.ctx || this.volume <= 0) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    const g = this._gain();
    g.gain.setValueAtTime(vol * this.volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    o.start(t); o.stop(t + dur + 0.02);
  },
  block(kind, loud = 1) {
    const m = {
      stone: [900, 1.2, 0.12], wood: [450, 2, 0.12], grass: [2500, 0.7, 0.14], gravel: [1400, 0.8, 0.14],
      sand: [3000, 0.5, 0.15], glass: [3500, 3, 0.2], wool: [600, 0.5, 0.1],
    }[kind] || [900, 1, 0.12];
    this.noise(m[0], m[1], m[2], 0.5 * loud);
  },
  step(kind) {
    const m = { stone: 700, wood: 380, grass: 1800, gravel: 1100, sand: 2400, glass: 900, wool: 500 }[kind] || 800;
    this.noise(m, 0.8, 0.08, 0.12);
  },
  glassBreak() { for (let i = 0; i < 3; i++) setTimeout(() => this.noise(3000 + i * 800, 4, 0.2, 0.4), i * 40); },
  hurt() { this.tone(220, 0.15, 0.25, 'sawtooth', -90); },
  pop() { this.tone(900 + Math.random() * 400, 0.08, 0.15, 'sine', 400); },
  eat() { this.noise(1200, 1, 0.1, 0.25); },
  burp() { this.tone(140, 0.3, 0.2, 'sawtooth', -40); },
  click() { this.tone(1200, 0.04, 0.12, 'square'); },
  explode() {
    this.noise(200, 0.4, 1.2, 1.2, 'lowpass');
    this.noise(80, 0.3, 1.6, 1.0, 'lowpass');
  },
  fuse() { this.noise(4000, 1, 1.4, 0.25, 'highpass'); },
  splash() { this.noise(1500, 0.5, 0.35, 0.3); },
  mob(type) {
    const r = Math.random();
    switch (type) {
      case 'pig': this.tone(180 + r * 40, 0.25, 0.18, 'sawtooth', 60); break;
      case 'cow': this.tone(110 + r * 20, 0.6, 0.18, 'sawtooth', -30); break;
      case 'sheep': this.tone(300 + r * 40, 0.4, 0.12, 'triangle', -40); this.tone(310, 0.4, 0.06, 'square', -40); break;
      case 'chicken': this.tone(900 + r * 200, 0.08, 0.12, 'square', 300); break;
      case 'zombie': this.tone(90 + r * 20, 0.7, 0.2, 'sawtooth', -20); break;
      case 'creeper': break;
    }
  },
  mobHurt(type) {
    if (type === 'zombie') this.tone(120, 0.3, 0.25, 'sawtooth', -40);
    else if (type === 'creeper') this.noise(800, 1, 0.2, 0.3);
    else this.tone(300, 0.2, 0.2, 'sawtooth', -100);
  },
};
