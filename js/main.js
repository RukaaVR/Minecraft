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
  game.startPanorama();

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    game.resize(window.innerWidth, window.innerHeight);
  });

  let last = performance.now();
  let frames = 0, acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    frames++; acc += dt;
    if (acc >= 0.5) { ui.fps = Math.round(frames / acc); frames = 0; acc = 0; }
    try {
      game.update(dt, ui.input());
      ui.updateHud(dt);
      game.render();
    } catch (e) {
      console.error(e);
    }
  }
  requestAnimationFrame(frame);
  window.webcraft = { game, ui }; // handy for debugging in the console
})();
