// Recorded sound effects (made with ForgeGUI's sound generator). They stream from ForgeGUI's
// storage the first time sound starts, and play through the same chain as the synthesized
// sounds (panning, distance falloff, reverb, volume categories, subtitles). Anything that
// can't load (offline, or a page that blocks outside media) keeps its synthesized sound.
'use strict';
{
  const BASE = 'https://azyjlkhpdgafuobyxoax.supabase.co/storage/v1/object/public/asset-audio/d452b901-9522-4d96-86f7-ea38f63047a2/chat/';
  const FILES = {
    zombie: '17853812-728a-4de4-8f82-6598c617d5d7-sound_effect-0-05705821-8762-4f9e-af48-2670290d9dc6',
    skeleton: '856d5d22-2df0-4d51-859a-e1e1a2d92c5d-sound_effect-0-ba3132da-b88d-41c1-ba93-b5802f45e309',
    creeper: '55338878-0568-463b-b694-fc8e79bad2e9-sound_effect-0-64f0f9bf-b863-4992-98ab-d0e483aa9d49',
    spider: 'dae96935-dec7-4d5d-ab56-930853e6a639-sound_effect-0-c6813c9e-431d-447c-bb75-b7110cd59bf2',
    cow: 'aa732fdd-3e2a-43dd-8b31-ca0bd3697506-sound_effect-0-6295d4c0-533b-4652-b09c-3dbf09a314f5',
    pig: '2ca046f4-502d-4798-986e-9a31ad3e0d72-sound_effect-0-6f3f7039-a928-48e8-b952-5996ee99308d',
    sheep: '1eba15c6-4c42-4ffc-82cf-bdf84b7a501a-sound_effect-0-75033b99-6285-402c-91b3-261dd7bba3a8',
    chicken: 'b5df8528-e7d7-45ab-8f80-d1a0203f4b79-sound_effect-0-ab5c501a-4437-48a6-9054-1963439faa63',
    villager: '98108f7a-d7ef-4da9-b19a-74aebc773c2b-sound_effect-0-8c7ec418-f74a-4073-aea0-1ba12008e480',
    cat: 'e3641f75-409e-492f-b664-80633d5cd5c9-sound_effect-0-86fe61c1-59d0-41b7-8502-de97a7f37da0',
    fox: 'daaa4ac5-314a-48fc-a55a-98752f526a11-sound_effect-0-f4b9e35e-5dc5-4086-8fd8-d892b808949e',
    bee: '11573897-03e1-43c6-9846-859f1a761689-sound_effect-0-5943da2c-a6e0-4b2e-9483-8ea6e7e1afbd',
    bat: '026f77c7-eee3-49f0-9436-a5c556d14dc9-sound_effect-0-651a3fd9-f370-43df-be32-0c0c1cd86ec3',
    witch: 'a23afecc-123a-4e69-96bd-135ff0dad9da-sound_effect-0-f0851ff1-0905-4f63-988a-13ca1974ea80',
    phantom: '4418009e-aefb-497f-aa84-0d97fd62c4ac-sound_effect-0-7b69fd3a-6e1e-427a-8387-02431e660e48',
    goat: '6832c962-b756-4c80-9151-dd2f0abd20e3-sound_effect-0-39d6dc3e-c230-4138-b21d-fe48af6334bc',
    drowned: 'f9db62f1-b36e-4a09-a8c4-a3bdbb48dc8f-sound_effect-0-dcd1e48e-889d-4edc-b36e-77e2fd1b6074',
    wolf: 'affe3f63-f74e-4da0-8699-b1cd27d0a690-sound_effect-0-a04b5d8e-0953-44e2-a981-e0f2dc186897',
    enderman: '53f82ac6-fd8d-437f-b2a0-fbdcb9f1cef5-sound_effect-0-00a4521a-3a1e-45ed-9c00-c5e7cadbffe9',
    ghast: '432df94f-b910-4e6e-84f7-c7fda49bd8fb-sound_effect-0-da6cdc92-5da1-49d8-8824-f373ef0e5257',
    blaze: 'c002a540-8f9e-476c-a842-63298dea22de-sound_effect-0-3af8ae12-07c7-47ca-90ff-ad48c5f3ab13',
    hurt: '97779225-9894-464f-a5be-153d79ae15e6-sound_effect-0-cabd615b-1837-4286-affc-a916867ef091',
    explode: 'b35eb565-7639-4656-bd29-0fcb57e4413a-sound_effect-0-38af46a6-55d8-4a54-b781-5d90bcebdf96',
    door_open: 'be15775b-da85-4904-a1f3-13bd3ffea467-sound_effect-0-9fa89503-79b9-4f13-9058-cef5bcb93efc',
    door_close: 'b74f3741-9cd8-40d2-9971-bb6b84f888b8-sound_effect-0-ca45d51d-fdd4-4b2f-af37-b184d8287f0f',
    chest_open: '38ef71d4-c843-43b6-a825-0233eb5f0ac0-sound_effect-0-9e4df591-0261-4519-8c3e-e4513f1e8aca',
    xp: 'f85aa1a7-8953-4907-839b-752795ac469e-sound_effect-0-c383a20d-826f-4cfc-b8c1-70fdabbabcc7',
    levelup: '220e265f-8964-467a-8a60-ecfe50721d0c-sound_effect-0-80484b76-8381-459b-9bcd-40283775148f',
    eat: 'f59dbad4-43cc-4145-8bfa-35dacc7185fd-sound_effect-0-bb07e5be-351f-4591-97de-ecedd5dfc5ba',
    bow: 'ade58653-ba8b-4314-ba76-db1c7f00cd49-sound_effect-0-c88e1f2c-e6bc-4f64-967a-1b1a9adc9f75',
    thunder: '081753fa-b996-4a40-8372-274d6778a711-sound_effect-0-972c812a-10e0-4906-8f3b-d35ce129a77b',
    splash: '7de99fbc-093b-4cdf-86c1-e47677b21b4f-sound_effect-0-5535a22d-6dc8-47ec-8b2a-0c35bf4ddb07',
    break_stone: 'e3c8e49b-849f-405d-8522-b80d90e0c5ec-sound_effect-0-a8834b85-ecbf-4d75-aee8-13a2094908cc',
    break_glass: 'ebb06a3a-8674-4f3a-9bc6-afe420bb85aa-sound_effect-0-ac5dede5-d605-47b3-abd7-3266eedb667a',
  };
  // How loud each recording plays next to the synthesized sounds
  const GAIN = { explode: 0.9, thunder: 0.8, door_open: 0.9, door_close: 0.9, break_stone: 1, splash: 0.7, bee: 0.35, xp: 0.35, eat: 0.5, levelup: 0.5 };
  const buffers = {};
  let started = false;
  function load() {
    if (started || !Sound.ctx) return;
    started = true;
    for (const [name, file] of Object.entries(FILES)) {
      fetch(BASE + file + '.mp3', { mode: 'cors' })
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
        .then((b) => Sound.ctx.decodeAudioData(b))
        .then((buf) => { buffers[name] = buf; })
        .catch(() => { /* keep the synthesized sound */ });
    }
  }
  // Play a recording if it's loaded; returns false so the caller can fall back
  function play(name, pos, opts = {}) {
    const buf = buffers[name], ctx = Sound.ctx;
    if (!buf || !ctx) return false;
    const g = Sound._out((opts.vol ?? 0.55) * (GAIN[name] ?? 1), pos, opts.wet ?? 0.18);
    if (!g) return true; // too far away to hear
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 0.92 + Math.random() * 0.16;
    g.gain.value = g.v;
    src.connect(g);
    src.start(ctx.currentTime + (opts.delay || 0));
    return true;
  }
  Sound.sample = play;
  Sound.samplesLoaded = () => Object.keys(buffers);

  const init = Sound.init;
  Sound.init = function () { init.call(this); load(); };

  const wrap = (name, fn) => {
    const orig = Sound[name];
    Sound[name] = function (...a) { if (!fn.apply(this, a)) return orig.apply(this, a); };
  };
  wrap('mob', (type, pos) => FILES[type] !== undefined && type !== 'creeper' && play(type, pos));
  wrap('hurt', () => play('hurt', null, { rate: 0.95 + Math.random() * 0.1 }));
  wrap('explode', (pos) => play('explode', pos, { wet: 0.4, rate: 0.9 + Math.random() * 0.15 }));
  wrap('fuse', (pos) => play('creeper', pos, { rate: 1 }));
  wrap('door', (open, pos) => play(open ? 'door_open' : 'door_close', pos));
  wrap('chest', (open, pos) => open && play('chest_open', pos));
  wrap('xp', () => play('xp', null, { rate: 0.8 + Math.random() * 0.5 }));
  wrap('levelUp', () => play('levelup', null, { rate: 1, wet: 0.35 }));
  wrap('eat', () => play('eat', null));
  wrap('bow', (pos) => play('bow', pos));
  wrap('thunder', (delay = 0) => play('thunder', null, { delay, wet: 0.5, rate: 0.85 + Math.random() * 0.2 }));
  wrap('splash', (pos) => play('splash', pos));
  wrap('glassBreak', (pos) => play('break_glass', pos));
  wrap('block', (kind, loud = 1, pos) => kind === 'stone' && play('break_stone', pos, { vol: 0.55 * loud }));
}
