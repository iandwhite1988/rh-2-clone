// Entry point: boots the game, owns the animation loop, handles restarts.

import { Game } from './game.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { UI } from './ui.js';

const app = {
  canvas: document.getElementById('game'),
  minimapCanvas: document.getElementById('minimap'),
  game: null,
  renderer: null,
  ui: null,
  input: null,
};

function newRound(seed) {
  app.game = new Game(seed);
  app.renderer = new Renderer(app.canvas, app.minimapCanvas, app.game);
  const [bx, by] = app.game.baseCenter(0);
  app.renderer.centerOn(bx, by);
}

app.restart = () => {
  newRound();
  app.ui.buildList();
  app.ui.onSelectionChanged();
  app.ui.displayedCredits = app.game.players[0].credits;
  app.input.cancelPlacement();
  app.input.attackMoveArmed = false;
  app.ui.setCursorMode(null);
};

newRound();
app.ui = new UI(app);
app.input = new Input(app);
app.input.attach();
app.ui.onSelectionChanged();
app.ui.displayedCredits = app.game.players[0].credits;

window.addEventListener('resize', () => app.renderer.resize());

let last = performance.now();
function frame(now) {
  // Clamp dt so a backgrounded tab does not fast-forward the battle.
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  app.input.update(dt);
  app.game.update(dt);
  app.renderer.render();
  app.ui.refresh();

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Handy for poking at the sim from the console.
window.__ra2 = app;
