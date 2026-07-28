// Unit / building definitions and their per-frame behaviour.

import { TILE, ORE_VALUE } from './map.js';

export const FACTIONS = [
  { name: 'Allied', color: '#4c9ae8', dark: '#1d4c78', light: '#8cc6ff' },
  { name: 'Soviet', color: '#e0574a', dark: '#7d2018', light: '#ff9a8c' },
];

// power > 0 supplies the grid, power < 0 draws from it.
export const BUILDINGS = {
  conyard: {
    name: 'Construction Yard', short: 'CY', w: 3, h: 3, cost: 2500, hp: 1500,
    power: 0, buildTime: 25, sight: 7,
    desc: 'Builds structures. Losing it ends your base.',
  },
  power: {
    name: 'Power Plant', short: 'PP', w: 2, h: 2, cost: 300, hp: 600,
    power: 100, buildTime: 6, sight: 4,
    desc: 'Supplies 100 power to the grid.',
  },
  refinery: {
    name: 'Ore Refinery', short: 'REF', w: 3, h: 2, cost: 1000, hp: 900,
    power: -40, buildTime: 14, sight: 5, requires: ['power'], freeUnit: 'harvester',
    desc: 'Processes ore into credits. Ships with a free miner.',
  },
  barracks: {
    name: 'Barracks', short: 'BRK', w: 2, h: 2, cost: 500, hp: 700,
    power: -20, buildTime: 8, sight: 4, requires: ['power'], produces: 'infantry',
    desc: 'Trains infantry.',
  },
  factory: {
    name: 'War Factory', short: 'WF', w: 3, h: 2, cost: 1500, hp: 1000,
    power: -50, buildTime: 18, sight: 4, requires: ['refinery'], produces: 'vehicle',
    desc: 'Builds vehicles.',
  },
  turret: {
    name: 'Gun Turret', short: 'GUN', w: 1, h: 1, cost: 600, hp: 750,
    power: -30, buildTime: 9, sight: 8, requires: ['barracks'],
    weapon: { damage: 24, range: 200, cooldown: 0.8, speed: 640, kind: 'shell', splash: 14, vsInfantry: 1.3 },
    desc: 'Automated base defence.',
  },
};

export const UNITS = {
  gi: {
    name: 'GI', short: 'GI', cost: 200, hp: 130, speed: 44, buildTime: 4,
    from: 'barracks', category: 'infantry', kind: 'infantry', radius: 7, sight: 6,
    weapon: { damage: 10, range: 125, cooldown: 0.3, speed: 900, kind: 'bullet', vsInfantry: 1.4, vsBuilding: 0.4 },
    desc: 'Cheap rifle infantry. Strong in numbers.',
  },
  dog: {
    name: 'Attack Dog', short: 'DOG', cost: 200, hp: 100, speed: 104, buildTime: 4,
    from: 'barracks', category: 'infantry', kind: 'infantry', radius: 6, sight: 7,
    weapon: { damage: 34, range: 30, cooldown: 0.85, kind: 'melee', vsInfantry: 3, vsVehicle: 0.12, vsBuilding: 0.05 },
    desc: 'Fast scout. Shreds infantry, useless vs armour.',
  },
  harvester: {
    name: 'Ore Miner', short: 'MIN', cost: 1400, hp: 1200, speed: 58, buildTime: 14,
    from: 'factory', category: 'vehicle', kind: 'vehicle', radius: 13, sight: 5,
    harvester: true, capacity: 700, harvestRate: 3.2, unloadRate: 420,
    desc: 'Mines ore fields and returns credits to a refinery.',
  },
  tank: {
    name: 'Grizzly Tank', short: 'TNK', cost: 700, hp: 460, speed: 64, buildTime: 9,
    from: 'factory', category: 'vehicle', kind: 'vehicle', radius: 12, sight: 6,
    weapon: { damage: 42, range: 160, cooldown: 1.1, speed: 700, kind: 'shell', splash: 18, vsInfantry: 0.7, vsBuilding: 1.2 },
    desc: 'Main battle tank. The backbone of any push.',
  },
  prism: {
    name: 'Prism Tank', short: 'PRS', cost: 1200, hp: 320, speed: 52, buildTime: 13,
    from: 'factory', category: 'vehicle', kind: 'vehicle', radius: 12, sight: 9,
    requires: ['factory', 'barracks'],
    weapon: { damage: 95, range: 245, cooldown: 2.2, kind: 'beam', vsInfantry: 1.5, vsBuilding: 1.4 },
    desc: 'Long-range energy beam. Fragile, devastating.',
  },
};

export const CATEGORY_OF = { infantry: 'infantry', vehicle: 'vehicle' };

let nextId = 1;

export function damageFactor(weapon, target) {
  if (target.etype === 'building') return weapon.vsBuilding ?? 1;
  return target.def.kind === 'infantry' ? weapon.vsInfantry ?? 1 : weapon.vsVehicle ?? 1;
}

function angleLerp(from, to, t) {
  let diff = ((to - from + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return from + diff * Math.min(1, t);
}

class Entity {
  constructor(owner) {
    this.id = nextId++;
    this.owner = owner;
    this.dead = false;
    this.hitFlash = 0;
  }
  distTo(other) {
    return Math.hypot(other.x - this.x, other.y - this.y);
  }
  applyDamage(amount, game, attacker) {
    if (this.dead) return;
    this.hp -= amount;
    this.hitFlash = 0.12;
    if (attacker && this.etype === 'unit' && this.order.type === 'guard' && !this.autoTarget) {
      this.autoTarget = attacker;
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      game.onEntityDestroyed(this);
    }
  }
}

export class Building extends Entity {
  constructor(type, owner, tx, ty, complete = false) {
    super(owner);
    this.etype = 'building';
    this.type = type;
    this.def = BUILDINGS[type];
    this.tx = tx;
    this.ty = ty;
    this.w = this.def.w;
    this.h = this.def.h;
    this.x = (tx + this.w / 2) * TILE;
    this.y = (ty + this.h / 2) * TILE;
    this.maxHp = this.def.hp;
    this.hp = complete ? this.maxHp : this.maxHp * 0.2;
    this.constructing = !complete;
    this.buildTimer = 0;
    this.reload = 0;
    this.angle = -Math.PI / 2;
    this.autoTarget = null;
    this.rally = null;
  }

  get hitRadius() {
    return (Math.max(this.w, this.h) * TILE) / 2;
  }

  get powered() {
    return !this.constructing;
  }

  update(dt, game) {
    if (this.constructing) {
      this.buildTimer += dt;
      const t = Math.min(1, this.buildTimer / 1.6);
      this.hp = this.maxHp * (0.2 + 0.8 * t);
      if (t >= 1) {
        this.constructing = false;
        this.hp = this.maxHp;
      }
      return;
    }

    if (this.reload > 0) this.reload -= dt;

    const weapon = this.def.weapon;
    if (!weapon) return;

    // Turrets go offline in a brownout.
    if (game.powerRatio(this.owner) < 1) return;

    if (!this.autoTarget || this.autoTarget.dead || this.distTo(this.autoTarget) > weapon.range * 1.15) {
      this.autoTarget = game.findTarget(this, weapon.range);
    }
    const target = this.autoTarget;
    if (!target || target.dead) return;

    const desired = Math.atan2(target.y - this.y, target.x - this.x);
    this.angle = angleLerp(this.angle, desired, dt * 6);
    if (this.reload <= 0 && this.distTo(target) <= weapon.range + target.hitRadius) {
      game.fireWeapon(this, target, weapon);
      this.reload = weapon.cooldown;
    }
  }
}

export class Unit extends Entity {
  constructor(type, owner, x, y) {
    super(owner);
    this.etype = 'unit';
    this.type = type;
    this.def = UNITS[type];
    this.x = x;
    this.y = y;
    this.maxHp = this.def.hp;
    this.hp = this.maxHp;
    this.angle = -Math.PI / 2;
    this.turretAngle = this.angle;
    this.reload = 0;
    this.path = null;
    this.pathIndex = 0;
    this.order = { type: 'guard' };
    this.guardPost = { x, y };
    this.autoTarget = null;
    this.repathTimer = 0;
    this.moving = false;
    this.selected = false;

    if (this.def.harvester) {
      this.cargo = 0;
      this.harvestAcc = 0;
      this.hstate = 'seek';
      this.oreTile = null;
      this.oreSearchCooldown = 0;
    }
  }

  get hitRadius() {
    return this.def.radius;
  }
  get sightPx() {
    return this.def.sight * TILE;
  }
  get tileX() {
    return Math.floor(this.x / TILE);
  }
  get tileY() {
    return Math.floor(this.y / TILE);
  }

  setDestination(game, wx, wy) {
    const gx = Math.floor(wx / TILE);
    const gy = Math.floor(wy / TILE);
    const path = game.map.findPath(this.tileX, this.tileY, gx, gy);
    this.path = path;
    this.pathIndex = 0;
    this.destX = wx;
    this.destY = wy;
    return path !== null;
  }

  stop() {
    this.path = null;
    this.pathIndex = 0;
    this.order = { type: 'guard' };
    this.guardPost = { x: this.x, y: this.y };
    this.autoTarget = null;
    this.moving = false;
  }

  update(dt, game) {
    if (this.reload > 0) this.reload -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.repathTimer > 0) this.repathTimer -= dt;
    this.moving = false;

    if (this.def.harvester) this.updateHarvester(dt, game);
    else this.updateCombat(dt, game);

    this.applySeparation(dt, game);
  }

  // ---- movement -----------------------------------------------------------

  moveBy(dx, dy, game) {
    const map = game.map;
    const nx = this.x + dx;
    const ny = this.y + dy;
    if (map.isPassableAtWorld(nx, ny)) {
      this.x = nx;
      this.y = ny;
      return;
    }
    // Slide along whichever axis stays on walkable ground.
    if (map.isPassableAtWorld(nx, this.y)) this.x = nx;
    else if (map.isPassableAtWorld(this.x, ny)) this.y = ny;
  }

  followPath(dt, game) {
    if (!this.path || this.pathIndex >= this.path.length) return true;
    const node = this.path[this.pathIndex];
    const tx = node.x * TILE + TILE / 2;
    const ty = node.y * TILE + TILE / 2;
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 5) {
      this.pathIndex++;
      return this.pathIndex >= this.path.length;
    }
    const step = Math.min(dist, this.def.speed * dt);
    this.moveBy((dx / dist) * step, (dy / dist) * step, game);
    this.angle = angleLerp(this.angle, Math.atan2(dy, dx), dt * 7);
    this.moving = true;
    return false;
  }

  applySeparation(dt, game) {
    const near = game.queryRadius(this.x, this.y, this.hitRadius * 2.4);
    let px = 0;
    let py = 0;
    for (const other of near) {
      if (other === this || other.etype !== 'unit' || other.dead) continue;
      const dx = this.x - other.x;
      const dy = this.y - other.y;
      const d = Math.hypot(dx, dy);
      const min = this.hitRadius + other.hitRadius;
      if (d > min || d === 0) continue;
      const push = (min - d) / min;
      px += (dx / d) * push;
      py += (dy / d) * push;
    }
    if (px !== 0 || py !== 0) {
      const strength = this.def.speed * 0.9 * dt;
      this.moveBy(px * strength, py * strength, game);
    }
  }

  // ---- combat -------------------------------------------------------------

  engage(target, dt, game, chase) {
    const weapon = this.def.weapon;
    if (!weapon) {
      if (chase) this.moveToward(target, dt, game, 0);
      return;
    }
    const reach = weapon.range + target.hitRadius;
    const dist = this.distTo(target);

    if (dist <= reach) {
      this.path = null;
      const desired = Math.atan2(target.y - this.y, target.x - this.x);
      this.turretAngle = angleLerp(this.turretAngle, desired, dt * 8);
      if (this.def.kind === 'infantry') this.angle = this.turretAngle;
      if (this.reload <= 0) {
        game.fireWeapon(this, target, weapon);
        this.reload = weapon.cooldown;
      }
    } else if (chase) {
      this.moveToward(target, dt, game, weapon.range * 0.8);
    }
  }

  moveToward(target, dt, game, standoff) {
    if (this.repathTimer <= 0 || !this.path) {
      const tx = Math.floor(target.x / TILE);
      const ty = Math.floor(target.y / TILE);
      if (this.pathGoalX !== tx || this.pathGoalY !== ty || !this.path) {
        this.setDestination(game, target.x, target.y);
        this.pathGoalX = tx;
        this.pathGoalY = ty;
      }
      this.repathTimer = 0.7 + Math.random() * 0.4;
    }
    if (standoff > 0 && this.distTo(target) <= standoff) return;
    this.followPath(dt, game);
  }

  updateCombat(dt, game) {
    const order = this.order;

    if (order.type === 'attack') {
      const target = order.target;
      if (!target || target.dead) {
        this.stop();
        return;
      }
      this.engage(target, dt, game, true);
      return;
    }

    if (order.type === 'move' || order.type === 'attackMove') {
      if (order.type === 'attackMove' && this.def.weapon) {
        if (!this.autoTarget || this.autoTarget.dead || this.distTo(this.autoTarget) > this.sightPx * 1.2) {
          this.autoTarget = game.findTarget(this, this.sightPx);
        }
        if (this.autoTarget) {
          this.engage(this.autoTarget, dt, game, true);
          return;
        }
      }
      if (this.followPath(dt, game)) {
        this.order = { type: 'guard' };
        this.guardPost = { x: this.x, y: this.y };
      }
      return;
    }

    // Guarding: shoot anything that wanders in, chase only on a short leash.
    if (!this.def.weapon) return;
    if (!this.autoTarget || this.autoTarget.dead || this.distTo(this.autoTarget) > this.sightPx * 1.2) {
      this.autoTarget = game.findTarget(this, this.sightPx);
    }
    const target = this.autoTarget;
    if (!target) return;

    const leash = 5 * TILE;
    const fromPost = Math.hypot(this.x - this.guardPost.x, this.y - this.guardPost.y);
    const reach = this.def.weapon.range + target.hitRadius;
    if (this.distTo(target) <= reach) {
      this.engage(target, dt, game, false);
    } else if (fromPost < leash) {
      this.engage(target, dt, game, true);
    } else {
      // Wandered too far from the post — walk back.
      if (fromPost > 8) {
        if (!this.path) this.setDestination(game, this.guardPost.x, this.guardPost.y);
        this.followPath(dt, game);
      }
    }
  }

  // ---- harvesting ---------------------------------------------------------

  updateHarvester(dt, game) {
    const def = this.def;
    const map = game.map;

    switch (this.hstate) {
      case 'seek': {
        if (!this.oreTile || map.oreAt(this.oreTile.x, this.oreTile.y) === 0) {
          // A full-map ring search is expensive; back off when it comes up empty.
          if (this.oreSearchCooldown > 0) {
            this.oreSearchCooldown -= dt;
            return;
          }
          const from = this.oreTile || { x: this.tileX, y: this.tileY };
          const found = map.findOreNear(from.x, from.y, 34);
          if (!found) {
            this.oreTile = null;
            this.path = null;
            this.oreSearchCooldown = 2;
            return; // nothing left to mine
          }
          this.oreTile = found;
          this.setDestination(game, found.x * TILE + TILE / 2, found.y * TILE + TILE / 2);
        }
        const cx = this.oreTile.x * TILE + TILE / 2;
        const cy = this.oreTile.y * TILE + TILE / 2;
        if (Math.hypot(cx - this.x, cy - this.y) < TILE * 0.8) {
          this.hstate = 'harvest';
          this.path = null;
          return;
        }
        // Path ran out without arriving (blocked or stale) — pick a fresh tile
        // rather than mining from a distance.
        if (this.followPath(dt, game)) {
          this.path = null;
          this.oreTile = null;
        }
        return;
      }

      case 'harvest': {
        if (!this.oreTile) {
          this.hstate = 'seek';
          return;
        }
        // Only ever mine the tile we are actually standing on.
        const ox = this.oreTile.x * TILE + TILE / 2;
        const oy = this.oreTile.y * TILE + TILE / 2;
        if (Math.hypot(ox - this.x, oy - this.y) > TILE * 1.2) {
          this.hstate = 'seek';
          return;
        }
        this.harvestAcc += def.harvestRate * dt;
        const whole = Math.floor(this.harvestAcc);
        if (whole > 0) {
          this.harvestAcc -= whole;
          const got = map.takeOre(this.oreTile.x, this.oreTile.y, whole);
          this.cargo += got * ORE_VALUE;
          if (got < whole) {
            this.oreTile = null;
            this.hstate = 'seek';
          }
        }
        if (this.cargo >= def.capacity) {
          this.cargo = def.capacity;
          this.hstate = 'deliver';
          this.path = null;
        }
        return;
      }

      case 'deliver': {
        const ref = game.nearestBuilding(this.owner, 'refinery', this.x, this.y);
        if (!ref) {
          this.path = null;
          return; // no refinery: sit on the cargo until one exists
        }
        if (this.distTo(ref) < ref.hitRadius + TILE * 0.9) {
          this.hstate = 'unload';
          this.path = null;
          this.dockedAt = ref;
          return;
        }
        if (this.repathTimer <= 0 || !this.path) {
          this.setDestination(game, ref.x, ref.y);
          this.repathTimer = 1.2;
        }
        this.followPath(dt, game);
        return;
      }

      case 'unload': {
        const amount = Math.min(this.cargo, def.unloadRate * dt);
        this.cargo -= amount;
        game.players[this.owner].credits += amount;
        game.players[this.owner].harvested += amount;
        if (this.cargo <= 0.5) {
          this.cargo = 0;
          this.hstate = 'seek';
        }
        return;
      }
    }
  }
}

export class Projectile {
  constructor(x, y, target, weapon, owner) {
    this.id = nextId++;
    this.x = x;
    this.y = y;
    this.originX = x;
    this.originY = y;
    this.target = target;
    this.weapon = weapon;
    this.owner = owner;
    this.dead = false;
    this.life = weapon.kind === 'beam' ? 0.16 : 3;
    this.lastX = target.x;
    this.lastY = target.y;
  }

  update(dt, game) {
    this.life -= dt;
    if (this.life <= 0) {
      this.dead = true;
      return;
    }
    if (this.weapon.kind === 'beam' || this.weapon.kind === 'melee') return;

    if (this.target && !this.target.dead) {
      this.lastX = this.target.x;
      this.lastY = this.target.y;
    }
    const dx = this.lastX - this.x;
    const dy = this.lastY - this.y;
    const dist = Math.hypot(dx, dy);
    const step = this.weapon.speed * dt;
    this.angle = Math.atan2(dy, dx);
    if (dist <= step) {
      this.x = this.lastX;
      this.y = this.lastY;
      this.dead = true;
      game.onProjectileImpact(this);
      return;
    }
    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
  }
}
