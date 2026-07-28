// Sidebar: build menus, resource readout, selection panel, messages, overlays.

import { BUILDINGS, UNITS } from './entities.js';

const TABS = [
  { id: 'building', label: 'Build' },
  { id: 'infantry', label: 'Infantry' },
  { id: 'vehicle', label: 'Vehicles' },
];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export class UI {
  constructor(app) {
    this.app = app;
    this.tab = 'building';
    this.items = new Map();
    this.displayedCredits = 0;
    this.lastMessageKey = '';

    this.creditsEl = document.getElementById('credits');
    this.powerFillEl = document.getElementById('power-fill');
    this.powerTextEl = document.getElementById('power-text');
    this.tabsEl = document.getElementById('tabs');
    this.listEl = document.getElementById('build-list');
    this.selectionEl = document.getElementById('selection-info');
    this.messagesEl = document.getElementById('messages');
    this.overlayEl = document.getElementById('overlay');
    this.hintEl = document.getElementById('cursor-hint');

    this.buildTabs();
    this.buildList();
  }

  get game() {
    return this.app.game;
  }

  buildTabs() {
    this.tabsEl.innerHTML = '';
    for (const tab of TABS) {
      const btn = el('button', 'tab', tab.label);
      btn.dataset.tab = tab.id;
      btn.addEventListener('click', () => this.setTab(tab.id));
      this.tabsEl.appendChild(btn);
    }
    this.syncTabs();
  }

  syncTabs() {
    for (const btn of this.tabsEl.children) {
      btn.classList.toggle('active', btn.dataset.tab === this.tab);
    }
  }

  setTab(id) {
    this.tab = id;
    this.syncTabs();
    this.buildList();
  }

  entriesForTab() {
    if (this.tab === 'building') {
      return Object.entries(BUILDINGS)
        .filter(([type]) => type !== 'conyard')
        .map(([type, def]) => ({ type, def, category: 'building' }));
    }
    return Object.entries(UNITS)
      .filter(([, def]) => def.category === this.tab)
      .map(([type, def]) => ({ type, def, category: this.tab }));
  }

  buildList() {
    this.listEl.innerHTML = '';
    this.items.clear();

    for (const entry of this.entriesForTab()) {
      const btn = el('button', 'build-item');
      btn.dataset.type = entry.type;

      const icon = el('span', 'icon', entry.def.short);
      const meta = el('span', 'meta');
      meta.appendChild(el('span', 'name', entry.def.name));
      meta.appendChild(el('span', 'cost', `$${entry.def.cost}`));
      const progress = el('span', 'progress');
      const status = el('span', 'status');

      btn.append(icon, meta, progress, status);
      btn.title = `${entry.def.name} — ${entry.def.desc}`;

      btn.addEventListener('click', () => this.onBuildClick(entry));
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const q = this.game.players[0].queues[entry.category];
        if (q.type === entry.type) {
          this.game.cancelProduction(0, entry.category);
          if (this.app.input.placing === entry.type) this.app.input.cancelPlacement();
        }
      });

      this.items.set(entry.type, { btn, progress, status, entry });
      this.listEl.appendChild(btn);
    }
  }

  onBuildClick(entry) {
    const game = this.game;
    const q = game.players[0].queues[entry.category];

    if (q.type === entry.type && q.ready) {
      this.app.input.startPlacement(entry.type);
      return;
    }
    if (q.type === entry.type) return; // already building
    if (q.type) {
      game.addMessage('Already building in this category');
      return;
    }
    if (!game.canBuild(0, entry.type, entry.category)) {
      const missing = (entry.def.requires || []).find((r) => !game.hasBuilding(0, r));
      const from = entry.category !== 'building' ? entry.def.from : null;
      const need = missing || (from && !game.hasBuilding(0, from) ? from : null);
      game.addMessage(need ? `Requires ${BUILDINGS[need].name}` : 'Cannot build that yet');
      return;
    }
    game.startProduction(0, entry.category, entry.type);
  }

  setCursorMode(mode) {
    this.app.canvas.classList.toggle('attack-cursor', mode === 'attack-move');
    this.hintEl.classList.toggle('visible', mode === 'attack-move');
    this.hintEl.textContent = mode === 'attack-move' ? 'Attack-move: click a destination' : '';
  }

  onSelectionChanged() {
    const sel = this.game.selection;
    this.selectionEl.innerHTML = '';
    if (!sel.length) {
      this.selectionEl.appendChild(el('div', 'muted', 'Nothing selected'));
      return;
    }

    if (sel.length === 1) {
      const e = sel[0];
      const box = el('div', 'sel-single');
      box.appendChild(el('div', 'sel-name', e.def.name));
      box.appendChild(el('div', 'muted', e.def.desc || ''));
      if (e.def.harvester) {
        box.appendChild(
          el('div', 'muted', `Cargo ${Math.round(e.cargo)} / ${e.def.capacity}`)
        );
      }
      if (e.etype === 'building' && e.def.produces) {
        box.appendChild(el('div', 'muted', e.rally ? 'Rally point set' : 'Right-click to set rally'));
      }
      this.selectionEl.appendChild(box);
      return;
    }

    const counts = new Map();
    for (const e of sel) counts.set(e.def.name, (counts.get(e.def.name) || 0) + 1);
    const list = el('div', 'sel-multi');
    for (const [name, n] of counts) list.appendChild(el('div', 'sel-row', `${n}× ${name}`));
    this.selectionEl.appendChild(list);
  }

  refresh() {
    const game = this.game;
    const player = game.players[0];

    // Credits tick toward the real value so income reads as movement.
    const diff = player.credits - this.displayedCredits;
    this.displayedCredits += Math.abs(diff) < 2 ? diff : diff * 0.18;
    this.creditsEl.textContent = `$${Math.round(this.displayedCredits)}`;

    const power = game.power(0);
    const ratio = power.produced === 0 ? (power.consumed > 0 ? 1 : 0) : Math.min(1, power.consumed / power.produced);
    this.powerFillEl.style.width = `${Math.round(ratio * 100)}%`;
    this.powerFillEl.classList.toggle('low', power.consumed > power.produced);
    this.powerTextEl.textContent = `${power.consumed} / ${power.produced}`;

    for (const [type, item] of this.items) {
      const { entry, btn, progress, status } = item;
      const q = player.queues[entry.category];
      const active = q.type === type;
      const affordable = player.credits >= entry.def.cost * 0.25;
      const allowed = game.canBuild(0, type, entry.category);

      btn.classList.toggle('active', active);
      btn.classList.toggle('ready', active && q.ready);
      btn.classList.toggle('disabled', !allowed);
      btn.classList.toggle('poor', allowed && !affordable && !active);
      progress.style.width = active ? `${Math.round(q.progress * 100)}%` : '0%';
      status.textContent = active ? (q.ready ? 'READY' : q.paused ? 'HOLD' : `${Math.round(q.progress * 100)}%`) : '';
    }

    const key = game.messages.map((m) => m.text).join('|');
    if (key !== this.lastMessageKey) {
      this.lastMessageKey = key;
      this.messagesEl.innerHTML = '';
      for (const m of game.messages) this.messagesEl.appendChild(el('div', 'message', m.text));
    }

    if (game.selection.length === 1 && game.selection[0].def.harvester) this.onSelectionChanged();

    if (game.over && !this.overlayShown) this.showOverlay(game.over);
    if (game.paused && !game.over) this.hintEl.textContent = 'Paused — press Space';
  }

  showOverlay(result) {
    this.overlayShown = true;
    const game = this.game;
    const minutes = Math.floor(game.time / 60);
    const seconds = Math.floor(game.time % 60).toString().padStart(2, '0');

    this.overlayEl.innerHTML = '';
    const card = el('div', 'overlay-card');
    card.appendChild(el('h1', result === 'victory' ? 'win' : 'lose', result === 'victory' ? 'Victory' : 'Defeat'));
    card.appendChild(
      el(
        'p',
        null,
        result === 'victory'
          ? 'Enemy forces eliminated. The field is yours.'
          : 'Your base has been destroyed.'
      )
    );
    card.appendChild(el('p', 'muted', `Time ${minutes}:${seconds} · Ore refined $${Math.round(game.players[0].harvested)}`));
    const btn = el('button', 'primary', 'Play again');
    btn.addEventListener('click', () => {
      this.overlayShown = false;
      this.overlayEl.classList.add('hidden');
      this.app.restart();
    });
    card.appendChild(btn);
    this.overlayEl.appendChild(card);
    this.overlayEl.classList.remove('hidden');
  }
}
