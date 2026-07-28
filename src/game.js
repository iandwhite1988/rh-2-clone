// World simulation: players, economy, production, combat resolution and the AI.

import { GameMap, TILE, ORE_VALUE } from './map.js';
import { BUILDINGS, UNITS, FACTIONS, Building, Unit, Projectile, damageFactor } from './entities.js';

export const MAP_W = 64;
export const MAP_H = 64;
export const BUILD_RADIUS = 9; // tiles from an existing structure
const CELL = 64; // spatial hash cell size in px

function newQueue() {
  return { type: null, progress: 0, spent: 0, ready: false, paused: false };
}

export class Player {
  constructor(id, factionIndex, isAI) {
    this.id = id;
    this.faction = FACTIONS[factionIndex];
    this.credits = 5000;
    this.harvested = 0;
    this.isAI = isAI;
    this.defeated = false;
    this.queues = {
      building: newQueue(),
      infantry: newQueue(),
      vehicle: newQueue(),
    };
  }
}

class AI {
  constructor(playerId) {
    this.id = playerId;
    this.think = 0;
    this.waveSize = 4;
    this.attackCooldown = 45;
  }

  update(dt, game) {
    this.think -= dt;
    this.attackCooldown -= dt;
    if (this.think > 0) return;
    this.think = 1.5;

    const player = game.players[this.id];
    if (player.defeated) return;

    this.manageBuilding(game, player);
    this.manageUnits(game, player);
    this.manageAttack(game, player);
  }

  manageBuilding(game, player) {
    const q = player.queues.building;
    if (q.ready) {
      const spot = game.findPlacementNear(this.id, q.type);
      if (spot) game.placeQueuedBuilding(this.id, spot.x, spot.y);
      return;
    }
    if (q.type) return;

    const have = (type) => game.buildings.filter((b) => b.owner === this.id && b.type === type && !b.constructing).length;
    const power = game.power(this.id);

    let want = null;
    if (power.produced - power.consumed < 40) want = 'power';
    else if (have('refinery') === 0) want = 'refinery';
    else if (have('barracks') === 0) want = 'barracks';
    else if (have('factory') === 0) want = 'factory';
    else if (have('turret') < 3 && player.credits > 1400) want = 'turret';
    else if (have('refinery') < 2 && player.credits > 2200) want = 'refinery';
    else if (have('power') < 4 && player.credits > 2500) want = 'power';

    if (want && game.canBuild(this.id, want, 'building')) {
      game.startProduction(this.id, 'building', want);
    }
  }

  manageUnits(game, player) {
    const mine = game.units.filter((u) => u.owner === this.id);
    const harvesters = mine.filter((u) => u.def.harvester).length;
    const refineries = game.buildings.filter((b) => b.owner === this.id && b.type === 'refinery' && !b.constructing).length;

    if (!player.queues.vehicle.type && game.canBuild(this.id, 'harvester', 'vehicle')) {
      if (harvesters < Math.min(4, refineries * 2)) {
        game.startProduction(this.id, 'vehicle', 'harvester');
        return;
      }
    }

    if (player.credits < 800) return;

    if (!player.queues.infantry.type) {
      const type = Math.random() < 0.75 ? 'gi' : 'dog';
      if (game.canBuild(this.id, type, 'infantry')) game.startProduction(this.id, 'infantry', type);
    }
    if (!player.queues.vehicle.type && player.credits > 1200) {
      const type = Math.random() < 0.7 ? 'tank' : 'prism';
      if (game.canBuild(this.id, type, 'vehicle')) game.startProduction(this.id, 'vehicle', type);
      else if (game.canBuild(this.id, 'tank', 'vehicle')) game.startProduction(this.id, 'vehicle', 'tank');
    }
  }

  manageAttack(game, player) {
    // With the base gone there is nothing to defend — everything goes hunting,
    // which also stops a handful of survivors from stalling the match forever.
    const lastStand = !game.buildings.some((b) => b.owner === this.id && !b.dead);
    const army = game.units.filter(
      (u) => u.owner === this.id && !u.def.harvester && u.order.type === 'guard'
    );
    if (!lastStand) {
      if (this.attackCooldown > 0) return;
      if (army.length < this.waveSize) return;
    }
    if (!army.length) return;

    const enemyId = this.id === 0 ? 1 : 0;
    let targets = game.buildings.filter((b) => b.owner === enemyId && !b.dead);
    if (!targets.length) targets = game.units.filter((u) => u.owner === enemyId && !u.dead);
    if (!targets.length) return;

    // Aim at whatever is closest to the staging army.
    const ax = army.reduce((s, u) => s + u.x, 0) / army.length;
    const ay = army.reduce((s, u) => s + u.y, 0) / army.length;
    let best = targets[0];
    let bestD = Infinity;
    for (const t of targets) {
      const d = Math.hypot(t.x - ax, t.y - ay);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }

    for (const u of army) {
      u.order = { type: 'attackMove', x: best.x, y: best.y };
      u.setDestination(game, best.x, best.y);
    }
    if (!lastStand) {
      this.waveSize = Math.min(14, this.waveSize + 2);
      this.attackCooldown = 55;
    }
  }
}

export class Game {
  constructor(seed = Math.floor(Math.random() * 1e9)) {
    this.seed = seed;
    this.map = new GameMap(MAP_W, MAP_H, seed);
    this.players = [new Player(0, 0, false), new Player(1, 1, true)];
    this.ai = new AI(1);

    this.units = [];
    this.buildings = [];
    this.projectiles = [];
    this.effects = [];
    this.selection = [];
    this.messages = [];
    this.controlGroups = {};

    this.time = 0;
    this.over = null; // 'victory' | 'defeat'
    this.paused = false;

    this.explored = new Uint8Array(this.map.size);
    this.visible = new Uint8Array(this.map.size);
    this.visionTimer = 0;
    this.oreTimer = 1.5;

    this.grid = new Map();
    this.setup();
    this.updateVision();
  }

  // ---- setup --------------------------------------------------------------

  setup() {
    const map = this.map;
    this.startPositions = [
      { x: 11, y: MAP_H - 12 },
      { x: MAP_W - 12, y: 11 },
    ];

    for (const p of this.startPositions) map.clearArea(p.x, p.y, 9);

    // A dedicated ore field beside each base, plus contested fields in between.
    map.addOreField(this.startPositions[0].x + 9, this.startPositions[0].y - 7, 7, 1);
    map.addOreField(this.startPositions[1].x - 9, this.startPositions[1].y + 7, 7, 1);
    map.addOreField(Math.floor(MAP_W / 2), Math.floor(MAP_H / 2), 9, 1);
    map.addOreField(Math.floor(MAP_W * 0.25), Math.floor(MAP_H * 0.28), 6, 0.9);
    map.addOreField(Math.floor(MAP_W * 0.75), Math.floor(MAP_H * 0.72), 6, 0.9);

    for (let i = 0; i < 2; i++) {
      const s = this.startPositions[i];
      this.addBuilding('conyard', i, s.x - 1, s.y - 1, true);
      this.addBuilding('power', i, s.x + 3, s.y - 1, true);
      this.addBuilding('refinery', i, s.x - 2, s.y + 2, true);

      this.spawnUnit('harvester', i, (s.x + 1.5) * TILE, (s.y + 4.5) * TILE);
      this.spawnUnit('gi', i, (s.x - 2.5) * TILE, (s.y - 2.5) * TILE);
      this.spawnUnit('gi', i, (s.x - 3.5) * TILE, (s.y - 1.5) * TILE);
    }
  }

  addBuilding(type, owner, tx, ty, complete = false) {
    const def = BUILDINGS[type];
    tx = Math.max(0, Math.min(MAP_W - def.w, tx));
    ty = Math.max(0, Math.min(MAP_H - def.h, ty));
    const b = new Building(type, owner, tx, ty, complete);
    for (let y = ty; y < ty + def.h; y++) {
      for (let x = tx; x < tx + def.w; x++) {
        this.map.blocked[this.map.idx(x, y)] = 1;
      }
    }
    this.buildings.push(b);
    return b;
  }

  spawnUnit(type, owner, x, y) {
    const spot = this.map.nearestPassable(Math.floor(x / TILE), Math.floor(y / TILE), 8);
    const u = new Unit(
      type,
      owner,
      spot ? spot.x * TILE + TILE / 2 : x,
      spot ? spot.y * TILE + TILE / 2 : y
    );
    this.units.push(u);
    return u;
  }

  // ---- queries ------------------------------------------------------------

  rebuildGrid() {
    this.grid.clear();
    const add = (e) => {
      const cx = Math.floor(e.x / CELL);
      const cy = Math.floor(e.y / CELL);
      const key = cy * 4096 + cx;
      let list = this.grid.get(key);
      if (!list) this.grid.set(key, (list = []));
      list.push(e);
    };
    for (const u of this.units) add(u);
    for (const b of this.buildings) add(b);
  }

  queryRadius(x, y, r) {
    const out = [];
    const x0 = Math.floor((x - r) / CELL);
    const x1 = Math.floor((x + r) / CELL);
    const y0 = Math.floor((y - r) / CELL);
    const y1 = Math.floor((y + r) / CELL);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const list = this.grid.get(cy * 4096 + cx);
        if (list) out.push(...list);
      }
    }
    return out;
  }

  findTarget(entity, range) {
    const candidates = this.queryRadius(entity.x, entity.y, range + 48);
    let best = null;
    let bestScore = Infinity;
    for (const e of candidates) {
      if (e.dead || e.owner === entity.owner) continue;
      const d = entity.distTo(e) - e.hitRadius;
      if (d > range) continue;
      // Prefer live threats over structures at similar distance.
      const score = d + (e.etype === 'building' ? 60 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  nearestBuilding(owner, type, x, y) {
    let best = null;
    let bestD = Infinity;
    for (const b of this.buildings) {
      if (b.owner !== owner || b.type !== type || b.dead || b.constructing) continue;
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  entityAt(wx, wy) {
    for (const u of this.units) {
      if (!u.dead && Math.hypot(u.x - wx, u.y - wy) <= u.hitRadius + 4) return u;
    }
    const tx = Math.floor(wx / TILE);
    const ty = Math.floor(wy / TILE);
    for (const b of this.buildings) {
      if (b.dead) continue;
      if (tx >= b.tx && tx < b.tx + b.w && ty >= b.ty && ty < b.ty + b.h) return b;
    }
    return null;
  }

  // ---- power & production -------------------------------------------------

  power(playerId) {
    let produced = 0;
    let consumed = 0;
    for (const b of this.buildings) {
      if (b.owner !== playerId || b.dead || b.constructing) continue;
      if (b.def.power > 0) produced += b.def.power;
      else consumed += -b.def.power;
    }
    return { produced, consumed };
  }

  powerRatio(playerId) {
    const { produced, consumed } = this.power(playerId);
    if (consumed <= produced) return 1;
    return Math.max(0.35, produced / Math.max(1, consumed));
  }

  hasBuilding(playerId, type) {
    return this.buildings.some((b) => b.owner === playerId && b.type === type && !b.dead && !b.constructing);
  }

  canBuild(playerId, type, category) {
    const def = category === 'building' ? BUILDINGS[type] : UNITS[type];
    if (!def) return false;
    if (category === 'building') {
      if (type !== 'conyard' && !this.hasBuilding(playerId, 'conyard')) return false;
    } else if (!this.hasBuilding(playerId, def.from)) {
      return false;
    }
    const requires = def.requires || [];
    return requires.every((r) => this.hasBuilding(playerId, r));
  }

  startProduction(playerId, category, type) {
    const player = this.players[playerId];
    const q = player.queues[category];
    if (q.type) return false;
    if (!this.canBuild(playerId, type, category)) return false;
    q.type = type;
    q.progress = 0;
    q.spent = 0;
    q.ready = false;
    q.paused = false;
    return true;
  }

  cancelProduction(playerId, category) {
    const player = this.players[playerId];
    const q = player.queues[category];
    if (!q.type) return;
    player.credits += q.spent;
    player.queues[category] = newQueue();
  }

  tickProduction(dt) {
    for (const player of this.players) {
      if (player.defeated) continue;
      const rate = this.powerRatio(player.id) < 1 ? 0.5 : 1;

      for (const category of ['building', 'infantry', 'vehicle']) {
        const q = player.queues[category];
        if (!q.type || q.ready) continue;

        const def = category === 'building' ? BUILDINGS[q.type] : UNITS[q.type];

        // Losing the producing structure cancels the order.
        if (!this.canBuild(player.id, q.type, category)) {
          this.cancelProduction(player.id, category);
          if (player.id === 0) this.addMessage('Production cancelled — prerequisite lost');
          continue;
        }

        const frac = (dt / def.buildTime) * rate;
        const cost = def.cost * frac;
        if (player.credits < cost) {
          if (!q.paused && player.id === 0) this.addMessage('Insufficient funds');
          q.paused = true;
          continue;
        }
        q.paused = false;
        player.credits -= cost;
        q.spent += cost;
        q.progress += frac;

        if (q.progress >= 1) {
          q.progress = 1;
          if (category === 'building') {
            q.ready = true;
            if (player.id === 0) this.addMessage(`${def.name} ready — click to place`);
          } else {
            this.completeUnit(player, q.type);
            player.queues[category] = newQueue();
          }
        }
      }
    }
  }

  completeUnit(player, type) {
    const def = UNITS[type];
    const src = this.nearestBuilding(player.id, def.from, ...this.baseCenter(player.id));
    const x = src ? src.x : this.startPositions[player.id].x * TILE;
    const y = src ? src.y + (src ? src.h * TILE * 0.5 + TILE : 0) : this.startPositions[player.id].y * TILE;
    const unit = this.spawnUnit(type, player.id, x, y);
    if (src && src.rally) {
      unit.order = { type: 'move', x: src.rally.x, y: src.rally.y };
      unit.setDestination(this, src.rally.x, src.rally.y);
    }
    if (player.id === 0) this.addMessage(`${def.name} ready`);
    return unit;
  }

  baseCenter(playerId) {
    const owned = this.buildings.filter((b) => b.owner === playerId && !b.dead);
    if (!owned.length) {
      const s = this.startPositions[playerId];
      return [s.x * TILE, s.y * TILE];
    }
    const x = owned.reduce((s, b) => s + b.x, 0) / owned.length;
    const y = owned.reduce((s, b) => s + b.y, 0) / owned.length;
    return [x, y];
  }

  // ---- building placement -------------------------------------------------

  canPlace(playerId, type, tx, ty) {
    const def = BUILDINGS[type];
    const map = this.map;
    if (tx < 0 || ty < 0 || tx + def.w > MAP_W || ty + def.h > MAP_H) return false;

    for (let y = ty; y < ty + def.h; y++) {
      for (let x = tx; x < tx + def.w; x++) {
        if (!map.isPassable(x, y)) return false;
        if (playerId === 0 && !this.explored[map.idx(x, y)]) return false;
      }
    }

    // Nothing standing in the footprint.
    const cx = (tx + def.w / 2) * TILE;
    const cy = (ty + def.h / 2) * TILE;
    const span = Math.max(def.w, def.h) * TILE;
    for (const u of this.queryRadius(cx, cy, span)) {
      if (u.etype !== 'unit' || u.dead) continue;
      const utx = Math.floor(u.x / TILE);
      const uty = Math.floor(u.y / TILE);
      if (utx >= tx && utx < tx + def.w && uty >= ty && uty < ty + def.h) return false;
    }

    // Must sit inside the existing base footprint.
    return this.buildings.some((b) => {
      if (b.owner !== playerId || b.dead) return false;
      const dx = Math.abs(b.tx + b.w / 2 - (tx + def.w / 2));
      const dy = Math.abs(b.ty + b.h / 2 - (ty + def.h / 2));
      return Math.max(dx, dy) <= BUILD_RADIUS;
    });
  }

  placeQueuedBuilding(playerId, tx, ty) {
    const player = this.players[playerId];
    const q = player.queues.building;
    if (!q.ready || !q.type) return false;
    if (!this.canPlace(playerId, q.type, tx, ty)) return false;

    const def = BUILDINGS[q.type];
    const b = this.addBuilding(q.type, playerId, tx, ty, false);
    player.queues.building = newQueue();

    if (def.freeUnit) {
      this.spawnUnit(def.freeUnit, playerId, b.x, b.y + def.h * TILE);
    }
    if (playerId === 0) this.addMessage(`${def.name} constructed`);
    return true;
  }

  findPlacementNear(playerId, type) {
    const [bx, by] = this.baseCenter(playerId);
    const ctx = Math.floor(bx / TILE);
    const cty = Math.floor(by / TILE);
    for (let r = 2; r <= BUILD_RADIUS; r++) {
      const candidates = [];
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          candidates.push({ x: ctx + dx, y: cty + dy });
        }
      }
      // Shuffle so bases do not grow in a perfect ring.
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }
      for (const c of candidates) {
        if (this.canPlace(playerId, type, c.x, c.y)) return c;
      }
    }
    return null;
  }

  // ---- orders -------------------------------------------------------------

  issueOrder(units, wx, wy, additive = false, attackMove = false) {
    const target = this.entityAt(wx, wy);
    const tile = { x: Math.floor(wx / TILE), y: Math.floor(wy / TILE) };
    const ore = this.map.oreAt(tile.x, tile.y);

    const movers = [];
    for (const u of units) {
      if (u.dead || u.owner !== 0) continue;

      if (target && target.owner !== u.owner && !target.dead) {
        if (u.def.weapon) {
          u.order = { type: 'attack', target };
          u.autoTarget = null;
          continue;
        }
      }
      if (u.def.harvester) {
        if (target && target.owner === u.owner && target.type === 'refinery') {
          u.hstate = u.cargo > 0 ? 'deliver' : 'seek';
          u.path = null;
          continue;
        }
        if (ore > 0) {
          u.oreTile = { x: tile.x, y: tile.y };
          u.hstate = 'seek';
          u.path = null;
          u.setDestination(this, wx, wy);
          continue;
        }
      }
      movers.push(u);
    }

    // Spread destinations so a group does not pile onto one tile.
    const spacing = 30;
    const cols = Math.ceil(Math.sqrt(movers.length));
    movers.forEach((u, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const ox = (col - (cols - 1) / 2) * spacing;
      const oy = (row - (Math.ceil(movers.length / cols) - 1) / 2) * spacing;
      const dx = wx + ox;
      const dy = wy + oy;
      u.order = { type: attackMove ? 'attackMove' : 'move', x: dx, y: dy };
      u.autoTarget = null;
      if (!u.setDestination(this, dx, dy)) u.setDestination(this, wx, wy);
      if (u.def.harvester) u.hstate = 'seek';
    });

    this.addEffect('marker', wx, wy, { color: target && target.owner !== 0 ? '#ff6b5b' : '#7ce87c' });
  }

  // ---- combat -------------------------------------------------------------

  fireWeapon(source, target, weapon) {
    const angle = Math.atan2(target.y - source.y, target.x - source.x);
    const muzzle = source.etype === 'building' ? source.hitRadius * 0.6 : source.hitRadius;
    const mx = source.x + Math.cos(angle) * muzzle;
    const my = source.y + Math.sin(angle) * muzzle;

    if (weapon.kind === 'melee') {
      target.applyDamage(weapon.damage * damageFactor(weapon, target), this, source);
      this.addEffect('hit', target.x, target.y, { color: '#ffd27a', size: 8 });
      return;
    }

    if (weapon.kind === 'beam') {
      target.applyDamage(weapon.damage * damageFactor(weapon, target), this, source);
      const p = new Projectile(mx, my, target, weapon, source.owner);
      p.beamFrom = { x: mx, y: my };
      p.beamTo = { x: target.x, y: target.y };
      this.projectiles.push(p);
      this.addEffect('hit', target.x, target.y, { color: '#9be7ff', size: 14 });
      return;
    }

    this.projectiles.push(new Projectile(mx, my, target, weapon, source.owner));
    this.addEffect('muzzle', mx, my, { angle, size: weapon.kind === 'shell' ? 10 : 6 });
  }

  onProjectileImpact(p) {
    const weapon = p.weapon;
    const target = p.target;
    if (target && !target.dead && Math.hypot(target.x - p.x, target.y - p.y) < target.hitRadius + 18) {
      target.applyDamage(weapon.damage * damageFactor(weapon, target), this, null);
    }
    if (weapon.splash) {
      this.splashDamage(p.x, p.y, weapon.splash, weapon.damage * 0.45, p.owner, weapon, target);
    }
    this.addEffect('explosion', p.x, p.y, {
      size: weapon.kind === 'shell' ? 22 : 10,
      color: weapon.kind === 'shell' ? '#ffb455' : '#ffe08a',
    });
  }

  splashDamage(x, y, radius, damage, owner, weapon, exclude) {
    for (const e of this.queryRadius(x, y, radius + 24)) {
      if (e.dead || e.owner === owner || e === exclude) continue;
      const d = Math.hypot(e.x - x, e.y - y) - e.hitRadius;
      if (d > radius) continue;
      const falloff = 1 - Math.max(0, d) / radius;
      e.applyDamage(damage * falloff * damageFactor(weapon, e), this, null);
    }
  }

  onEntityDestroyed(entity) {
    if (entity.etype === 'building') {
      for (let y = entity.ty; y < entity.ty + entity.h; y++) {
        for (let x = entity.tx; x < entity.tx + entity.w; x++) {
          this.map.blocked[this.map.idx(x, y)] = 0;
        }
      }
      this.addEffect('explosion', entity.x, entity.y, { size: Math.max(entity.w, entity.h) * 26, color: '#ff9a4d' });
      if (entity.owner === 0) this.addMessage(`${entity.def.name} lost`);
    } else {
      this.addEffect('explosion', entity.x, entity.y, {
        size: entity.def.kind === 'infantry' ? 12 : 24,
        color: entity.def.kind === 'infantry' ? '#e06b5b' : '#ff9a4d',
      });
      // A destroyed miner drops part of its load back onto the ground.
      if (entity.def.harvester && entity.cargo > 0) {
        const tx = Math.floor(entity.x / TILE);
        const ty = Math.floor(entity.y / TILE);
        const units = Math.min(8, Math.round(entity.cargo / ORE_VALUE / 2));
        const i = this.map.idx(tx, ty);
        if (this.map.inBounds(tx, ty)) {
          this.map.ore[i] = Math.min(12, this.map.ore[i] + units);
          this.map.oreDirty.push(i);
        }
      }
    }
    const si = this.selection.indexOf(entity);
    if (si !== -1) this.selection.splice(si, 1);
  }

  // ---- presentation helpers ----------------------------------------------

  addEffect(type, x, y, opts = {}) {
    this.effects.push({
      type,
      x,
      y,
      t: 0,
      life: type === 'marker' ? 0.5 : type === 'explosion' ? 0.45 : 0.12,
      ...opts,
    });
  }

  addMessage(text) {
    this.messages.push({ text, t: 0 });
    if (this.messages.length > 6) this.messages.shift();
  }

  // ---- vision -------------------------------------------------------------

  updateVision() {
    const map = this.map;
    this.visible.fill(0);
    this.visionVersion = (this.visionVersion || 0) + 1;
    const reveal = (cx, cy, radius) => {
      const r2 = radius * radius;
      for (let y = cy - radius; y <= cy + radius; y++) {
        if (y < 0 || y >= MAP_H) continue;
        for (let x = cx - radius; x <= cx + radius; x++) {
          if (x < 0 || x >= MAP_W) continue;
          const dx = x - cx;
          const dy = y - cy;
          if (dx * dx + dy * dy > r2) continue;
          const i = y * MAP_W + x;
          this.visible[i] = 1;
          this.explored[i] = 1;
        }
      }
    };
    for (const u of this.units) {
      if (u.owner !== 0 || u.dead) continue;
      reveal(Math.floor(u.x / TILE), Math.floor(u.y / TILE), u.def.sight);
    }
    for (const b of this.buildings) {
      if (b.owner !== 0 || b.dead) continue;
      reveal(Math.floor(b.x / TILE), Math.floor(b.y / TILE), b.def.sight);
    }
  }

  isVisible(wx, wy) {
    const tx = Math.floor(wx / TILE);
    const ty = Math.floor(wy / TILE);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
    return this.visible[ty * MAP_W + tx] === 1;
  }

  isExplored(wx, wy) {
    const tx = Math.floor(wx / TILE);
    const ty = Math.floor(wy / TILE);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
    return this.explored[ty * MAP_W + tx] === 1;
  }

  // ---- main loop ----------------------------------------------------------

  update(dt) {
    if (this.over || this.paused) return;
    this.time += dt;

    this.rebuildGrid();
    this.tickProduction(dt);
    this.ai.update(dt, this);

    for (const b of this.buildings) if (!b.dead) b.update(dt, this);
    for (const u of this.units) if (!u.dead) u.update(dt, this);
    for (const p of this.projectiles) if (!p.dead) p.update(dt, this);

    for (const e of this.effects) e.t += dt;
    this.effects = this.effects.filter((e) => e.t < e.life);
    for (const m of this.messages) m.t += dt;
    this.messages = this.messages.filter((m) => m.t < 6);

    if (this.units.some((u) => u.dead)) this.units = this.units.filter((u) => !u.dead);
    if (this.buildings.some((b) => b.dead)) this.buildings = this.buildings.filter((b) => !b.dead);
    if (this.projectiles.some((p) => p.dead)) this.projectiles = this.projectiles.filter((p) => !p.dead);

    this.visionTimer -= dt;
    if (this.visionTimer <= 0) {
      this.visionTimer = 0.2;
      this.updateVision();
    }

    this.oreTimer -= dt;
    if (this.oreTimer <= 0) {
      this.oreTimer = 1.5;
      this.map.regrowOre(26);
    }

    this.checkVictory();
  }

  checkVictory() {
    for (const p of this.players) {
      if (p.defeated) continue;
      // Without a structure there is no way to rebuild, so a side holding
      // nothing that can shoot is finished even if miners survive.
      const hasBuildings = this.buildings.some((b) => b.owner === p.id && !b.dead);
      const canFight = this.units.some((u) => u.owner === p.id && !u.dead && u.def.weapon);
      if (!hasBuildings && !canFight) p.defeated = true;
    }
    if (this.players[1].defeated) this.over = 'victory';
    else if (this.players[0].defeated) this.over = 'defeat';
  }
}
