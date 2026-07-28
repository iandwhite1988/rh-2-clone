/**
 * Entity Manager + Unit / Building definitions
 * Expanded with Yuri's Revenge nostalgia units
 */

export class EntityManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.nextId = 1;
  }

  createBuilding(type, x, y, owner = 0) {
    const defs = {
      conyard:  { hp: 1500, w: 2, h: 2, name: 'Construction Yard' },
      power:    { hp: 750,  w: 1, h: 1, name: 'Power Plant' },
      barracks: { hp: 1000, w: 1, h: 1, name: 'Barracks' },
      factory:  { hp: 1200, w: 2, h: 2, name: 'War Factory' },
      refinery: { hp: 1000, w: 2, h: 2, name: 'Ore Refinery' }
    };
    const d = defs[type];
    if (!d) return null;

    const e = {
      id: this.nextId++,
      type,
      name: d.name,
      x, y,
      owner,
      hp: d.hp,
      maxHp: d.hp,
      w: d.w,
      h: d.h,
      isBuilding: true,
      isUnit: false,
      selected: false
    };
    this.list.push(e);
    return e;
  }

  createUnit(type, x, y, owner = 0) {
    const defs = {
      // Allied
      gi:         { hp: 125, speed: 1.6, range: 4.5, dmg: 18,  name: 'GI' },
      guardian:   { hp: 100, speed: 1.3, range: 5.5, dmg: 22,  name: 'Guardian GI' },
      rocketeer:  { hp: 125, speed: 2.2, range: 5.5, dmg: 25,  name: 'Rocketeer' },
      seal:       { hp: 125, speed: 1.7, range: 5.0, dmg: 35,  name: 'Navy SEAL' },
      tanya:      { hp: 150, speed: 1.8, range: 5.5, dmg: 50,  name: 'Tanya' },
      chrono:      { hp: 100, speed: 1.5, range: 4.0, dmg: 80,  name: 'Chrono Legionnaire' },
      tank:       { hp: 300, speed: 1.1, range: 5.5, dmg: 45,  name: 'Grizzly Tank' },
      prism:      { hp: 150, speed: 1.0, range: 7.0, dmg: 60,  name: 'Prism Tank' },
      mirage:     { hp: 200, speed: 1.2, range: 6.0, dmg: 40,  name: 'Mirage Tank' },
      robot:      { hp: 180, speed: 1.4, range: 5.0, dmg: 30,  name: 'Robot Tank' },
      ifv:        { hp: 200, speed: 1.5, range: 5.0, dmg: 22,  name: 'IFV' },
      harvester:  { hp: 400, speed: 0.95, range: 0,   dmg: 0,   name: 'Chrono Miner', cargo: 0, maxCargo: 700 },

      // Soviet
      tesla:      { hp: 150, speed: 1.2, range: 5.5, dmg: 40,  name: 'Tesla Trooper' },
      rhino:      { hp: 400, speed: 0.95, range: 5.5, dmg: 55,  name: 'Rhino Tank' },
      apocalypse: { hp: 600, speed: 0.8,  range: 6.0, dmg: 80,  name: 'Apocalypse Tank' },
      terror:     { hp: 80,  speed: 2.5,  range: 1.5, dmg: 100, name: 'Terror Drone' },
      v3:         { hp: 150, speed: 0.9,  range: 12,  dmg: 120, name: 'V3 Launcher' },

      // Yuri
      initiate:   { hp: 100, speed: 1.5, range: 5.0, dmg: 20,  name: 'Initiate' },
      brute:      { hp: 300, speed: 1.3, range: 1.8, dmg: 45,  name: 'Brute' },
      lasher:     { hp: 280, speed: 1.15, range: 5.0, dmg: 35, name: 'Lasher Tank' },
      gattling:   { hp: 220, speed: 1.2, range: 6.5, dmg: 18,  name: 'Gattling Tank' },
      magnetron:  { hp: 180, speed: 1.0, range: 7.0, dmg: 25,  name: 'Magnetron' }
    };

    const d = defs[type];
    if (!d) return null;

    const e = {
      id: this.nextId++,
      type,
      name: d.name,
      x, y,
      owner,
      hp: d.hp,
      maxHp: d.hp,
      speed: d.speed,
      range: d.range,
      dmg: d.dmg,
      target: null,
      path: [],
      isBuilding: false,
      isUnit: true,
      selected: false,
      cargo: d.cargo || 0,
      maxCargo: d.maxCargo || 0
    };
    this.list.push(e);
    return e;
  }

  isOccupied(tx, ty) {
    for (const e of this.list) {
      if (!e.isBuilding) continue;
      const w = e.w || 1;
      const h = e.h || 1;
      if (tx >= e.x && tx < e.x + w && ty >= e.y && ty < e.y + h) return true;
    }
    return false;
  }

  update(dt) {
    for (const e of this.list) {
      if (!e.isUnit || e.hp <= 0) continue;

      // Harvesters pick a destination here, then fall through to the movement
      // block below so they actually travel to it.
      if (e.type === 'harvester') {
        this.updateHarvester(e, dt);
      } else if (e.target && e.target.hp > 0) {
        const dist = Math.hypot(e.x - e.target.x, e.y - e.target.y);
        if (dist <= e.range) {
          e.target.hp -= e.dmg * dt * 0.7;
          if (e.target.hp <= 0) {
            this.remove(e.target);
            e.target = null;
          }
          continue;
        } else {
          e.path = [{ x: e.target.x, y: e.target.y }];
        }
      }

      if (e.path && e.path.length > 0) {
        const goal = e.path[0];
        const dx = goal.x - e.x;
        const dy = goal.y - e.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 0.12) {
          e.path.shift();
        } else {
          e.x += (dx / dist) * e.speed * dt;
          e.y += (dy / dist) * e.speed * dt;
        }
      }
    }
    this.list = this.list.filter(e => e.hp > 0);
  }

  updateHarvester(e) {
    if (e.cargo >= e.maxCargo) {
      const ref = this.list.find(b => b.type === 'refinery' && b.owner === 0 && b.hp > 0);
      if (ref) {
        const destX = ref.x + 1;
        const destY = ref.y + 1;
        const dist = Math.hypot(e.x - destX, e.y - destY);
        if (dist < 1.4) {
          this.game.credits += e.cargo;
          e.cargo = 0;
        } else {
          e.path = [{ x: destX, y: destY }];
        }
      }
      return;
    }

    const map = this.game.map;
    let best = null;
    let bestDist = Infinity;

    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        if (map.tiles[y][x] === 1) {
          const d = Math.hypot(e.x - x, e.y - y);
          if (d < bestDist) {
            bestDist = d;
            best = { x, y };
          }
        }
      }
    }

    if (best) {
      if (bestDist < 1.1) {
        map.tiles[best.y][best.x] = 0;
        e.cargo = Math.min(e.maxCargo, e.cargo + 70);
      } else {
        e.path = [best];
      }
    }
  }

  remove(entity) {
    this.list = this.list.filter(e => e.id !== entity.id);
  }
}
