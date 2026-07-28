/**
 * Entry point: sizes the canvas, builds the sidebar, starts the loop.
 * The sidebar is generated from the cost tables so every unit defined in
 * entities.js is reachable without hand-writing markup for each one.
 */

import { Game, BUILD_COSTS, UNIT_COSTS } from './game.js';

const SIDEBAR_W = 220;
const canvas = document.getElementById('game');

function sizeCanvas() {
  canvas.width = Math.max(320, window.innerWidth - SIDEBAR_W);
  canvas.height = window.innerHeight;
}
sizeCanvas();

const game = new Game(canvas);
window.addEventListener('resize', sizeCanvas);

const BUILD_LABELS = {
  power: 'Power Plant',
  barracks: 'Barracks',
  factory: 'War Factory',
  refinery: 'Ore Refinery',
};

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

function buildSidebar() {
  const root = document.getElementById('sidebar');
  root.innerHTML = '';

  const creditsEl = el('div', 'credits', 'Credits: 5000');
  creditsEl.id = 'credits';
  const selectedEl = el('div', 'selected', 'Selected: None');
  selectedEl.id = 'selected';
  root.append(creditsEl, selectedEl);

  root.appendChild(el('h3', null, 'Structures'));
  for (const [type, cost] of Object.entries(BUILD_COSTS)) {
    if (type === 'conyard') continue; // not player-buildable
    const b = el('button', 'item', `${BUILD_LABELS[type] || type} ($${cost})`);
    b.addEventListener('click', () => game.startBuild(type));
    root.appendChild(b);
  }

  // Units grouped by side, then by producing structure.
  const bySide = {};
  for (const [type, def] of Object.entries(UNIT_COSTS)) {
    (bySide[def.side] ||= []).push([type, def]);
  }
  for (const [side, entries] of Object.entries(bySide)) {
    root.appendChild(el('h3', null, side));
    entries.sort((a, b) => a[1].cost - b[1].cost);
    for (const [type, def] of entries) {
      const b = el('button', 'item', `${labelFor(type)} ($${def.cost})`);
      b.title = `Built from: ${def.from}`;
      b.addEventListener('click', () => game.produce(type));
      root.appendChild(b);
    }
  }
}

// entities.js keeps display names inside createUnit, so mirror the few we show.
const NAMES = {
  gi: 'GI', guardian: 'Guardian GI', rocketeer: 'Rocketeer', seal: 'Navy SEAL',
  tanya: 'Tanya', chrono: 'Chrono Legionnaire', tank: 'Grizzly Tank',
  prism: 'Prism Tank', mirage: 'Mirage Tank', robot: 'Robot Tank', ifv: 'IFV',
  harvester: 'Chrono Miner', tesla: 'Tesla Trooper', rhino: 'Rhino Tank',
  apocalypse: 'Apocalypse Tank', terror: 'Terror Drone', v3: 'V3 Launcher',
  initiate: 'Initiate', brute: 'Brute', lasher: 'Lasher Tank',
  gattling: 'Gattling Tank', magnetron: 'Magnetron',
};
function labelFor(type) {
  return NAMES[type] || type;
}

function updateHud() {
  document.getElementById('credits').textContent = `Credits: ${Math.floor(game.credits)}`;
  const sel = game.selected;
  document.getElementById('selected').textContent =
    'Selected: ' + (sel.length ? (sel.length === 1 ? sel[0].name : `${sel.length} units`) : 'None');
  const msg = document.getElementById('message');
  msg.textContent = game.message || '';
  msg.style.opacity = game.message ? '1' : '0';
}

buildSidebar();
game.onFrame = updateHud;
game.start();

window.__game = game;
