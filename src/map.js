// Tile map: procedural terrain, ore fields, and A* pathfinding.

export const TILE = 32;

export const TERRAIN = { WATER: 0, SAND: 1, GRASS: 2, ROCK: 3 };

const PASSABLE = [false, true, true, false];

// Ore economy: each tile holds up to ORE_MAX units, each worth ORE_VALUE credits.
export const ORE_VALUE = 25;
export const ORE_MAX = 12;

export const TERRAIN_COLORS = [
  ['#173650', '#1d4162'], // water
  ['#b09a63', '#bda66f'], // sand
  ['#3c6533', '#45723a'], // grass
  ['#57534b', '#635e55'], // rock
];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function valueNoise(w, h, cell, rand) {
  const gw = Math.ceil(w / cell) + 2;
  const gh = Math.ceil(h / cell) + 2;
  const grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();

  const out = new Float32Array(w * h);
  const fade = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const fx = x / cell;
      const fy = y / cell;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fade(fx - x0);
      const ty = fade(fy - y0);
      const a = grid[y0 * gw + x0];
      const b = grid[y0 * gw + x0 + 1];
      const c = grid[(y0 + 1) * gw + x0];
      const d = grid[(y0 + 1) * gw + x0 + 1];
      out[y * w + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }
  }
  return out;
}

// Binary min-heap over integer tile indices.
class Heap {
  constructor() {
    this.items = [];
    this.keys = [];
  }
  get size() {
    return this.items.length;
  }
  clear() {
    this.items.length = 0;
    this.keys.length = 0;
  }
  push(item, key) {
    const { items, keys } = this;
    let i = items.length;
    items.push(item);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= keys[i]) break;
      [items[p], items[i]] = [items[i], items[p]];
      [keys[p], keys[i]] = [keys[i], keys[p]];
      i = p;
    }
  }
  pop() {
    const { items, keys } = this;
    const top = items[0];
    const lastItem = items.pop();
    const lastKey = keys.pop();
    if (items.length) {
      items[0] = lastItem;
      keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < keys.length && keys[l] < keys[m]) m = l;
        if (r < keys.length && keys[r] < keys[m]) m = r;
        if (m === i) break;
        [items[m], items[i]] = [items[i], items[m]];
        [keys[m], keys[i]] = [keys[i], keys[m]];
        i = m;
      }
    }
    return top;
  }
}

const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

export class GameMap {
  constructor(width, height, seed) {
    this.width = width;
    this.height = height;
    this.size = width * height;
    this.rand = mulberry32(seed);

    this.terrain = new Uint8Array(this.size);
    this.variant = new Uint8Array(this.size);
    this.ore = new Uint8Array(this.size);
    this.blocked = new Uint8Array(this.size); // building footprints

    // Tiles whose ore changed since the renderer last looked.
    this.oreDirty = [];

    // Reusable A* scratch buffers (generation-stamped so no clearing is needed).
    this._g = new Float32Array(this.size);
    this._came = new Int32Array(this.size);
    this._stamp = new Int32Array(this.size);
    this._closed = new Uint8Array(this.size);
    this._gen = 0;
    this._heap = new Heap();

    this.generate();
  }

  idx(tx, ty) {
    return ty * this.width + tx;
  }

  inBounds(tx, ty) {
    return tx >= 0 && ty >= 0 && tx < this.width && ty < this.height;
  }

  terrainAt(tx, ty) {
    return this.inBounds(tx, ty) ? this.terrain[ty * this.width + tx] : TERRAIN.WATER;
  }

  isPassable(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return false;
    const i = ty * this.width + tx;
    return PASSABLE[this.terrain[i]] && this.blocked[i] === 0;
  }

  isPassableAtWorld(x, y) {
    return this.isPassable(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  generate() {
    const { width: w, height: h, rand } = this;
    const base = valueNoise(w, h, 14, rand);
    const detail = valueNoise(w, h, 6, rand);
    const rocks = valueNoise(w, h, 8, rand);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const v = base[i] * 0.7 + detail[i] * 0.3;
        let t;
        if (v < 0.29) t = TERRAIN.WATER;
        else if (v < 0.36) t = TERRAIN.SAND;
        else t = TERRAIN.GRASS;
        if (t === TERRAIN.GRASS && rocks[i] > 0.75) t = TERRAIN.ROCK;
        this.terrain[i] = t;
        this.variant[i] = rand() < 0.5 ? 0 : 1;
      }
    }
  }

  // Flatten a circle of terrain so a base can be built there.
  clearArea(cx, cy, radius) {
    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        if (!this.inBounds(x, y)) continue;
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy > radius * radius) continue;
        const i = this.idx(x, y);
        this.terrain[i] = TERRAIN.GRASS;
        this.ore[i] = 0;
        this.blocked[i] = 0;
      }
    }
  }

  addOreField(cx, cy, radius, richness = 1) {
    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        if (!this.inBounds(x, y)) continue;
        const i = this.idx(x, y);
        if (!PASSABLE[this.terrain[i]]) continue;
        const dx = x - cx;
        const dy = y - cy;
        const d = Math.sqrt(dx * dx + dy * dy) / radius;
        if (d > 1) continue;
        const falloff = (1 - d) * richness;
        if (this.rand() > falloff * 1.7) continue;
        const amount = Math.max(3, Math.round(ORE_MAX * (0.45 + falloff * 0.75) * (0.7 + this.rand() * 0.6)));
        this.ore[i] = Math.min(ORE_MAX, this.ore[i] + amount);
      }
    }
  }

  oreAt(tx, ty) {
    return this.inBounds(tx, ty) ? this.ore[this.idx(tx, ty)] : 0;
  }

  // Remove up to `units` of ore from a tile; returns how much was actually taken.
  takeOre(tx, ty, units) {
    if (!this.inBounds(tx, ty)) return 0;
    const i = this.idx(tx, ty);
    const taken = Math.min(this.ore[i], units);
    if (taken > 0) {
      this.ore[i] -= taken;
      this.oreDirty.push(i);
    }
    return taken;
  }

  // Expanding ring search for the closest tile matching `test`.
  search(tx, ty, maxRadius, test) {
    if (test(tx, ty)) return { x: tx, y: ty };
    for (let r = 1; r <= maxRadius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = tx + dx;
          const y = ty + dy;
          if (this.inBounds(x, y) && test(x, y)) return { x, y };
        }
      }
    }
    return null;
  }

  nearestPassable(tx, ty, maxRadius = 8) {
    return this.search(tx, ty, maxRadius, (x, y) => this.isPassable(x, y));
  }

  // Closest ore, but among the nearest tiles prefer the richest one so miners
  // do not thrash between nearly-exhausted patches.
  findOreNear(tx, ty, maxRadius = 30) {
    let best = null;
    let bestAmount = 0;
    let foundRadius = -1;

    for (let r = 0; r <= maxRadius; r++) {
      if (foundRadius >= 0 && r > foundRadius + 1) break;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = tx + dx;
          const y = ty + dy;
          if (!this.inBounds(x, y)) continue;
          const amount = this.ore[this.idx(x, y)];
          if (amount === 0 || !this.isPassable(x, y)) continue;
          if (amount > bestAmount) {
            bestAmount = amount;
            best = { x, y };
          }
          if (foundRadius < 0) foundRadius = r;
        }
      }
    }
    return best;
  }

  // Ore slowly thickens and creeps outward, so a long match cannot run the
  // whole map dry. Called on a timer, not every frame.
  regrowOre(attempts) {
    for (let k = 0; k < attempts; k++) {
      const i = Math.floor(this.rand() * this.size);
      const amount = this.ore[i];
      if (amount === 0) continue;

      if (amount < ORE_MAX && this.rand() < 0.55) {
        this.ore[i]++;
        this.oreDirty.push(i);
        continue;
      }
      const x = i % this.width;
      const y = (i - x) / this.width;
      const [dx, dy] = DIRS[Math.floor(this.rand() * 8)];
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      const ni = this.idx(nx, ny);
      if (this.ore[ni] >= ORE_MAX / 2 || !this.isPassable(nx, ny)) continue;
      this.ore[ni]++;
      this.oreDirty.push(ni);
    }
  }

  // A* over the tile grid. Units do not block each other (separation handles
  // crowding), so paths stay stable and cheap to compute.
  findPath(sx, sy, gx, gy, maxNodes = 6000) {
    if (!this.inBounds(sx, sy) || !this.inBounds(gx, gy)) return null;
    if (sx === gx && sy === gy) return [];

    if (!this.isPassable(gx, gy)) {
      const alt = this.nearestPassable(gx, gy, 6);
      if (!alt) return null;
      gx = alt.x;
      gy = alt.y;
      if (sx === gx && sy === gy) return [];
    }

    const { width: w, _g: g, _came: came, _stamp: stamp, _closed: closed, _heap: heap } = this;
    const gen = ++this._gen;
    heap.clear();

    const start = sy * w + sx;
    const goal = gy * w + gx;
    const h = (i) => {
      const dx = Math.abs((i % w) - gx);
      const dy = Math.abs(Math.floor(i / w) - gy);
      return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
    };

    stamp[start] = gen;
    g[start] = 0;
    came[start] = -1;
    closed[start] = 0;
    heap.push(start, h(start));

    let nodes = 0;
    let best = start;
    let bestH = h(start);

    while (heap.size > 0 && nodes < maxNodes) {
      const cur = heap.pop();
      if (closed[cur] === 1 && stamp[cur] === gen) continue;
      closed[cur] = 1;
      nodes++;

      if (cur === goal) return this._reconstruct(came, start, goal);

      const ch = h(cur);
      if (ch < bestH) {
        bestH = ch;
        best = cur;
      }

      const cx = cur % w;
      const cy = (cur - cx) / w;
      for (let d = 0; d < DIRS.length; d++) {
        const [dx, dy, cost] = DIRS[d];
        const nx = cx + dx;
        const ny = cy + dy;
        if (!this.isPassable(nx, ny)) continue;
        // No cutting corners around blocked tiles.
        if (dx !== 0 && dy !== 0) {
          if (!this.isPassable(cx + dx, cy) || !this.isPassable(cx, cy + dy)) continue;
        }
        const ni = ny * w + nx;
        if (stamp[ni] === gen && closed[ni] === 1) continue;
        const ng = g[cur] + cost;
        if (stamp[ni] !== gen || ng < g[ni]) {
          stamp[ni] = gen;
          g[ni] = ng;
          came[ni] = cur;
          closed[ni] = 0;
          heap.push(ni, ng + h(ni));
        }
      }
    }

    // Unreachable: walk as close as we can get instead of refusing to move.
    if (best !== start) return this._reconstruct(came, start, best);
    return null;
  }

  _reconstruct(came, start, goal) {
    const w = this.width;
    const path = [];
    let cur = goal;
    let guard = 0;
    while (cur !== start && cur !== -1 && guard++ < this.size) {
      path.push({ x: cur % w, y: Math.floor(cur / w) });
      cur = came[cur];
    }
    path.reverse();
    return path;
  }
}
