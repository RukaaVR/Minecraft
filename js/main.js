// Bootstrap: renderer, main loop.
'use strict';

(function () {
  THREE.ColorManagement.enabled = false;
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.autoClear = false;
  document.getElementById('game').appendChild(renderer.domElement);

  const game = new Game(renderer);
  const ui = new UI(game);
  game.setShaders(game.settings.shaders || 'MEDIUM');
  game.startPanorama();

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    game.resize(window.innerWidth, window.innerHeight);
  });

  let last = performance.now();
  let frames = 0, acc = 0, slow = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    frames++; acc += dt;
    if (acc >= 0.5) {
      ui.fps = Math.round(frames / acc); frames = 0; acc = 0;
      // If the shaders make the game too slow, step the preset down automatically.
      if (game.hdr && game.mode === 'play' && game.settings.shadersAuto !== false && ui.screen === 'none') {
        slow = ui.fps < 24 ? slow + 1 : 0;
        if (slow >= 10) {
          slow = 0;
          const order = ['LOW', 'MEDIUM', 'HIGH', 'ULTRA'];
          const i = order.indexOf(game.settings.shaders);
          if (i > 0) { game.setShaders(order[i - 1]); ui.chat.system(`Shaders lowered to ${order[i - 1]} to keep the game smooth (change in Options).`, '#aaa'); }
        }
      }
    }
    try {
      game.update(dt, ui.input());
      ui.updateHud(dt);
      game.render(dt);
    } catch (e) {
      console.error(e);
    }
  }
  requestAnimationFrame(frame);
  window.webcraft = { game, ui }; // handy for debugging in the console
})();
