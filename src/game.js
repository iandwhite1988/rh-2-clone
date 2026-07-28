/**
 * Game host: owns the canvas, map, economy and the main loop.
 * EntityManager and Renderer are driven from here.
 */

import { EntityManager } from './entities.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';

// entities.js defines stats but not prices, so the economy lives here.
export const BUILD_COSTS = {
  power: 300,
  barracks: 500,
  factory: 2000,
  refinery: 2000,
  conyard: 2500,
};

// `from` is the structure required to produce the unit.
export const UNIT_COSTS = {
  // Allied infantry
  gi: { cost: 200, from: 'barracks', side: 'Allied' },
  guardian: { cost: 300, from: 'barracks', side: 'Allied' },
  rocketeer: { cost: 600, from: 'barracks', side: 'Allied' },
  seal: { cost: 1000, from: 'barracks', side: 'Allied' },
  tanya: { cost: 1500, from: 'barracks', side: 'Allied' },
  chrono: { cost: 1500, from: 'barracks', side: 'Allied' },
  // Allied vehicles
  tank: { cost: 700, from: 'factory', side: 'Allied' },
  prism: { cost: 1200, from: 'factory', side: 'Allied' },
  mirage: { cost: 1000, from: 'factory', side: 'Allied' },
  robot: { cost: 600, from: 'factory', side: 'Allied' },
  ifv: { cost: 600, from: 'factory', side: 'Allied' },
  harvester: { cost: 1400, from: 'factory', side: 'Allied' },
  // Soviet
  tesla: { cost: 500, from: 'barracks', side: 'Soviet' },
  rhino: { cost: 900, from: 'factory', side: 'Soviet' },
  apocalypse: { cost: 1750, from: 'factory', side: 'Soviet' },
  terror: { cost: 500, from: 'factory', side: 'Soviet' },
  v3: { cost: 800, from: 'factory', side: 'Soviet' },
  // Yuri
  initiate: { cost: 300, from: 'barracks', side: 'Yuri' },
  brute: { cost: 500, from: 'barracks', side: 'Yuri' },
  lasher: { cost: 700, from: 'factory', side: 'Yuri' },
  gattling: { cost: 600, from: 'factory', side: 'Yuri' },
  magnetron: { cost: 1000, from: 'factory', side: 'Yuri' },
};

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.TILE = 32;
    this.MAP_W = 60;
    this.MAP_H = 40;

    this.credits = 5000;
    this.camera = { x: 0, y: 0 };
    this.buildMode = null;
    this.selected = [];
    this.message = '';
    this.messageTimer = 0;

    this.map = this.generateMap();
    this.entities = new EntityManager(this);
    this.renderer = new Renderer(this);
    this.input = new Input(this);

    this.setupBase();
    this.input.attach();
  }

  generateMap() {
    const tiles = Array.from({ length: this.MAP_H }, () => Array(this.MAP_W).fill(0));
    for (let i = 0; i < 8; i++) {
      const ox = 10 + Math.floor(Math.random() * 40);
      const oy = 8 + Math.floor(Math.random() * 25);
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const x = ox + dx;
          const y = oy + dy;
          if (x < 0 || y < 0 || x >= this.MAP_W || y >= this.MAP_H) continue;
          if (Math.random() > 0.3) tiles[y][x] = 1;
        }
      }
    }
    return { w: this.MAP_W, h: this.MAP_H, tiles };
  }

  setupBase() {
    // Keep the start area clear of ore so the base is not sitting on a field.
    for (let y = 3; y <= 9; y++) {
      for (let x = 3; x <= 9; x++) this.map.tiles[y][x] = 0;
    }
    this.entities.createBuilding('conyard', 4, 4);
    this.entities.createBuilding('power', 7, 4);
  }

  // ---- economy ------------------------------------------------------------

  notify(text) {
    this.message = text;
    this.messageTimer = 3;
  }

  startBuild(type) {
    const cost = BUILD_COSTS[type];
    if (cost === undefined) return;
    if (this.credits < cost) {
      this.notify('Insufficient funds');
      return;
    }
    this.buildMode = type;
  }

  footprint(type) {
    return type === 'refinery' || type === 'factory' || type === 'conyard' ? 2 : 1;
  }

  placeBuilding(tx, ty) {
    const type = this.buildMode;
    if (!type) return false;
    const cost = BUILD_COSTS[type];
    if (this.credits < cost) {
      this.notify('Insufficient funds');
      return false;
    }

    const size = this.footprint(type);
    if (tx < 0 || ty < 0 || tx + size > this.MAP_W || ty + size > this.MAP_H) {
      this.notify('Cannot build there');
      return false;
    }
    for (let y = ty; y < ty + size; y++) {
      for (let x = tx; x < tx + size; x++) {
        if (this.entities.isOccupied(x, y)) {
          this.notify('Space occupied');
          return false;
        }
      }
    }

    const b = this.entities.createBuilding(type, tx, ty);
    if (!b) return false;
    this.credits -= cost;
    this.buildMode = null;
    return true;
  }

  produce(type) {
    const def = UNIT_COSTS[type];
    if (!def) return;
    if (this.credits < def.cost) {
      this.notify('Insufficient funds');
      return;
    }
    const producer = this.entities.list.find(
      (e) => e.isBuilding && e.owner === 0 && e.type === def.from && e.hp > 0
    );
    if (!producer) {
      this.notify(`Requires ${def.from === 'barracks' ? 'Barracks' : 'War Factory'}`);
      return;
    }
    this.credits -= def.cost;
    const w = producer.w || 1;
    const u = this.entities.createUnit(
      type,
      producer.x + w + Math.random(),
      producer.y + Math.random()
    );
    if (u) this.notify(`${u.name} ready`);
  }

  // ---- selection & orders -------------------------------------------------

  entityAt(wx, wy) {
    const tx = wx / this.TILE;
    const ty = wy / this.TILE;
    for (const e of this.entities.list) {
      if (e.hp <= 0) continue;
      if (e.isBuilding) {
        const w = e.w || 1;
        const h = e.h || 1;
        if (tx >= e.x && tx < e.x + w && ty >= e.y && ty < e.y + h) return e;
      } else if (Math.hypot(e.x + 0.5 - tx, e.y + 0.5 - ty) < 0.6) {
        return e;
      }
    }
    return null;
  }

  selectAt(wx, wy, additive = false) {
    const hit = this.entityAt(wx, wy);
    if (!additive) {
      for (const e of this.entities.list) e.selected = false;
      this.selected = [];
    }
    if (hit && hit.owner === 0) {
      hit.selected = true;
      if (!this.selected.includes(hit)) this.selected.push(hit);
    }
  }

  selectInBox(x0, y0, x1, y1) {
    const ax = Math.min(x0, x1) / this.TILE;
    const ay = Math.min(y0, y1) / this.TILE;
    const bx = Math.max(x0, x1) / this.TILE;
    const by = Math.max(y0, y1) / this.TILE;
    for (const e of this.entities.list) e.selected = false;
    this.selected = this.entities.list.filter(
      (e) => e.isUnit && e.owner === 0 && e.hp > 0 && e.x >= ax && e.x <= bx && e.y >= ay && e.y <= by
    );
    for (const e of this.selected) e.selected = true;
  }

  orderAt(wx, wy) {
    if (!this.selected.length) return;
    const tx = wx / this.TILE;
    const ty = wy / this.TILE;
    const hit = this.entityAt(wx, wy);
    const enemy = hit && hit.owner !== 0 ? hit : null;

    for (const u of this.selected) {
      if (!u.isUnit) continue;
      if (enemy) {
        u.target = enemy;
        u.path = [];
      } else {
        u.target = null;
        u.path = [{ x: tx, y: ty }];
      }
    }
  }

  // ---- loop ---------------------------------------------------------------

  update(dt) {
    this.entities.update(dt);
    this.selected = this.selected.filter((e) => e.hp > 0);
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.message = '';
    }
  }

  start() {
    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.input.update(dt);
      this.update(dt);
      this.renderer.draw();
      if (this.onFrame) this.onFrame();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}
