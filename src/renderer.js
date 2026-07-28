// Canvas rendering: terrain cache, entities, effects, shroud and minimap.

import { TILE, TERRAIN_COLORS, ORE_MAX } from './map.js';
import { FACTIONS, BUILDINGS } from './entities.js';
import { MAP_W, MAP_H } from './game.js';

function rrect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function hash(n) {
  let x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

export class Renderer {
  constructor(canvas, minimapCanvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.minimap = minimapCanvas;
    this.mctx = minimapCanvas.getContext('2d');
    this.game = game;

    this.camera = { x: 0, y: 0 };
    this.ui = { selectionBox: null, placement: null, hover: null };

    this.worldW = MAP_W * TILE;
    this.worldH = MAP_H * TILE;

    this.buildTerrainCache();
    this.buildOreCache();
    this.buildShroudCache();
    this.buildMinimapCache();
    this.resize();
  }

  // ---- caches -------------------------------------------------------------

  buildTerrainCache() {
    const c = document.createElement('canvas');
    c.width = this.worldW;
    c.height = this.worldH;
    const g = c.getContext('2d');
    const map = this.game.map;

    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        const i = map.idx(tx, ty);
        const t = map.terrain[i];
        g.fillStyle = TERRAIN_COLORS[t][map.variant[i]];
        g.fillRect(tx * TILE, ty * TILE, TILE, TILE);

        // Speckle so large areas do not read as flat colour.
        const speckles = t === 0 ? 2 : 4;
        g.fillStyle = 'rgba(0,0,0,0.07)';
        for (let s = 0; s < speckles; s++) {
          const hx = hash(i * 7 + s) * TILE;
          const hy = hash(i * 13 + s * 3) * TILE;
          const size = 2 + hash(i + s) * 3;
          g.fillRect(tx * TILE + hx, ty * TILE + hy, size, size);
        }
      }
    }

    // Soften transitions between terrain types.
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        const t = map.terrainAt(tx, ty);
        const edges = [
          [0, -1, tx * TILE, ty * TILE, TILE, 3],
          [0, 1, tx * TILE, (ty + 1) * TILE - 3, TILE, 3],
          [-1, 0, tx * TILE, ty * TILE, 3, TILE],
          [1, 0, (tx + 1) * TILE - 3, ty * TILE, 3, TILE],
        ];
        for (const [dx, dy, x, y, w, h] of edges) {
          if (map.terrainAt(tx + dx, ty + dy) === t) continue;
          g.fillStyle = 'rgba(0,0,0,0.14)';
          g.fillRect(x, y, w, h);
        }
      }
    }

    this.terrainCanvas = c;
  }

  buildOreCache() {
    const c = document.createElement('canvas');
    c.width = this.worldW;
    c.height = this.worldH;
    this.oreCanvas = c;
    this.octx = c.getContext('2d');
    const map = this.game.map;
    for (let i = 0; i < map.size; i++) if (map.ore[i] > 0) this.drawOreTile(i);
  }

  drawOreTile(i) {
    const map = this.game.map;
    const tx = i % MAP_W;
    const ty = Math.floor(i / MAP_W);
    const g = this.octx;
    g.clearRect(tx * TILE, ty * TILE, TILE, TILE);

    const amount = map.ore[i];
    if (amount <= 0) return;
    const count = Math.max(1, Math.round((amount / ORE_MAX) * 7));
    for (let n = 0; n < count; n++) {
      const px = tx * TILE + 3 + hash(i * 3 + n) * (TILE - 8);
      const py = ty * TILE + 3 + hash(i * 5 + n * 7) * (TILE - 8);
      const s = 2.5 + hash(i + n * 11) * 2.5;
      g.fillStyle = n % 3 === 0 ? '#ffd75e' : '#e3ad3a';
      g.beginPath();
      g.moveTo(px, py - s);
      g.lineTo(px + s, py);
      g.lineTo(px, py + s);
      g.lineTo(px - s, py);
      g.closePath();
      g.fill();
    }
  }

  buildShroudCache() {
    const c = document.createElement('canvas');
    c.width = MAP_W;
    c.height = MAP_H;
    this.shroudCanvas = c;
    this.sctx = c.getContext('2d');
    this.shroudData = this.sctx.createImageData(MAP_W, MAP_H);
  }

  buildMinimapCache() {
    const c = document.createElement('canvas');
    c.width = MAP_W;
    c.height = MAP_H;
    const g = c.getContext('2d');
    const map = this.game.map;
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        const i = map.idx(tx, ty);
        g.fillStyle = TERRAIN_COLORS[map.terrain[i]][0];
        g.fillRect(tx, ty, 1, 1);
      }
    }
    this.miniTerrain = c;
  }

  // ---- camera -------------------------------------------------------------

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.viewW = rect.width;
    this.viewH = rect.height;
    this.clampCamera();
  }

  clampCamera() {
    this.camera.x = Math.max(0, Math.min(this.worldW - this.viewW, this.camera.x));
    this.camera.y = Math.max(0, Math.min(this.worldH - this.viewH, this.camera.y));
  }

  panBy(dx, dy) {
    this.camera.x += dx;
    this.camera.y += dy;
    this.clampCamera();
  }

  centerOn(wx, wy) {
    this.camera.x = wx - this.viewW / 2;
    this.camera.y = wy - this.viewH / 2;
    this.clampCamera();
  }

  screenToWorld(sx, sy) {
    return { x: sx + this.camera.x, y: sy + this.camera.y };
  }

  worldToScreenX(wx) {
    return wx - this.ox;
  }
  worldToScreenY(wy) {
    return wy - this.oy;
  }

  onScreen(wx, wy, pad = 64) {
    const sx = wx - this.ox;
    const sy = wy - this.oy;
    return sx > -pad && sy > -pad && sx < this.viewW + pad && sy < this.viewH + pad;
  }

  // ---- main render --------------------------------------------------------

  render() {
    const ctx = this.ctx;
    const game = this.game;
    this.ox = Math.floor(this.camera.x);
    this.oy = Math.floor(this.camera.y);

    ctx.clearRect(0, 0, this.viewW, this.viewH);

    const sw = Math.min(this.viewW, this.worldW - this.ox);
    const sh = Math.min(this.viewH, this.worldH - this.oy);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.terrainCanvas, this.ox, this.oy, sw, sh, 0, 0, sw, sh);

    // Repaint ore tiles that changed since the last frame.
    const dirty = game.map.oreDirty;
    if (dirty.length) {
      for (const i of dirty) this.drawOreTile(i);
      dirty.length = 0;
    }
    ctx.drawImage(this.oreCanvas, this.ox, this.oy, sw, sh, 0, 0, sw, sh);

    this.drawBuildings();
    this.drawUnits();
    this.drawProjectiles();
    this.drawEffects();
    this.drawShroud();
    this.drawPlacement();
    this.drawSelectionBox();
    this.renderMinimap();
  }

  // ---- entities -----------------------------------------------------------

  drawBuildings() {
    const ctx = this.ctx;
    const game = this.game;
    const sorted = [...game.buildings].sort((a, b) => a.y - b.y);

    for (const b of sorted) {
      if (!this.onScreen(b.x, b.y, 96)) continue;
      if (b.owner !== 0 && !game.isExplored(b.x, b.y)) continue;

      const f = FACTIONS[b.owner];
      const x = this.worldToScreenX(b.tx * TILE);
      const y = this.worldToScreenY(b.ty * TILE);
      const w = b.w * TILE;
      const h = b.h * TILE;

      ctx.save();
      if (b.constructing) ctx.globalAlpha = 0.55 + 0.45 * Math.min(1, b.buildTimer / 1.6);

      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      rrect(ctx, x + 4, y + 6, w - 6, h - 6, 5);
      ctx.fill();

      const grad = ctx.createLinearGradient(x, y, x, y + h);
      grad.addColorStop(0, '#5d6068');
      grad.addColorStop(1, '#33363c');
      ctx.fillStyle = grad;
      rrect(ctx, x + 2, y + 2, w - 6, h - 8, 5);
      ctx.fill();

      ctx.strokeStyle = f.dark;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Faction band + inner detail.
      ctx.fillStyle = f.color;
      ctx.fillRect(x + 6, y + 6, w - 14, 5);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x + 8, y + 16, w - 18, h - 30);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      for (let i = 0; i < b.w; i++) {
        ctx.fillRect(x + 10 + i * TILE, y + 20, 6, h - 38);
      }

      if (b.type === 'turret') {
        ctx.save();
        ctx.translate(x + w / 2, y + h / 2);
        ctx.rotate(b.angle);
        ctx.fillStyle = '#2c2f34';
        ctx.fillRect(0, -3.5, 22, 7);
        ctx.fillStyle = f.dark;
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.82)';
        ctx.font = 'bold 11px ui-monospace, Menlo, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.def.short, x + w / 2, y + h / 2 + 4);
      }

      if (b.constructing) {
        ctx.fillStyle = 'rgba(120,200,255,0.16)';
        for (let sy = y; sy < y + h; sy += 6) ctx.fillRect(x + 2, sy, w - 6, 3);
      }
      ctx.restore();

      if (b.selected) {
        ctx.strokeStyle = '#7ce87c';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(x + 1, y + 1, w - 4, h - 6);
        ctx.setLineDash([]);
      }
      this.drawHealthBar(x + w / 2, y - 4, w - 12, b.hp / b.maxHp, b.selected || b.hp < b.maxHp);
    }
  }

  drawUnits() {
    const ctx = this.ctx;
    const game = this.game;
    const sorted = [...game.units].sort((a, b) => a.y - b.y);

    for (const u of sorted) {
      if (!this.onScreen(u.x, u.y)) continue;
      if (u.owner !== 0 && !game.isVisible(u.x, u.y)) continue;

      const f = FACTIONS[u.owner];
      const x = this.worldToScreenX(u.x);
      const y = this.worldToScreenY(u.y);

      if (u.selected) {
        ctx.strokeStyle = '#7ce87c';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(x, y, u.hitRadius + 5, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(x + 2, y + u.hitRadius * 0.7, u.hitRadius * 0.95, u.hitRadius * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.translate(x, y);
      if (u.hitFlash > 0) ctx.filter = 'brightness(1.7)';

      switch (u.type) {
        case 'gi':
          this.drawInfantry(ctx, u, f);
          break;
        case 'dog':
          this.drawDog(ctx, u, f);
          break;
        case 'harvester':
          this.drawHarvester(ctx, u, f);
          break;
        case 'prism':
          this.drawPrism(ctx, u, f);
          break;
        default:
          this.drawTank(ctx, u, f);
      }
      ctx.restore();

      this.drawHealthBar(x, y - u.hitRadius - 10, 26, u.hp / u.maxHp, u.selected || u.hp < u.maxHp);
    }
  }

  drawInfantry(ctx, u, f) {
    ctx.rotate(u.angle + Math.PI / 2);

    // Dark outline first so a soldier stays readable against grass.
    ctx.fillStyle = 'rgba(12,16,20,0.85)';
    rrect(ctx, -6, -5.5, 12, 15, 4);
    ctx.fill();

    ctx.fillStyle = f.color;
    rrect(ctx, -4.5, -3.5, 9, 12, 3);
    ctx.fill();
    ctx.fillStyle = f.dark;
    ctx.fillRect(-4.5, 3, 9, 4);

    ctx.fillStyle = '#e6d8b8';
    ctx.beginPath();
    ctx.arc(0, -5.5, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = f.light;
    ctx.beginPath();
    ctx.arc(0, -6.5, 4, Math.PI, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1b1f25';
    ctx.fillRect(3.5, -7, 2.4, 9);
  }

  drawDog(ctx, u, f) {
    ctx.rotate(u.angle);
    ctx.fillStyle = '#6b5744';
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#54432f';
    ctx.beginPath();
    ctx.arc(7, 0, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#6b5744';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(-13, -3);
    ctx.stroke();
    ctx.fillStyle = f.color;
    ctx.fillRect(2, -4.5, 3, 9);
  }

  drawTank(ctx, u, f) {
    ctx.save();
    ctx.rotate(u.angle);
    ctx.fillStyle = '#25282d';
    ctx.fillRect(-13, -11, 26, 5);
    ctx.fillRect(-13, 6, 26, 5);
    const grad = ctx.createLinearGradient(0, -8, 0, 8);
    grad.addColorStop(0, f.light);
    grad.addColorStop(0.35, f.color);
    grad.addColorStop(1, f.dark);
    ctx.fillStyle = grad;
    rrect(ctx, -13, -8, 26, 16, 3);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.rotate(u.turretAngle);
    ctx.fillStyle = '#2b2f35';
    ctx.fillRect(4, -2.5, 18, 5);
    ctx.fillStyle = f.dark;
    ctx.beginPath();
    ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = f.light;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }

  drawPrism(ctx, u, f) {
    ctx.save();
    ctx.rotate(u.angle);
    ctx.fillStyle = '#25282d';
    ctx.fillRect(-12, -10, 24, 4);
    ctx.fillRect(-12, 6, 24, 4);
    ctx.fillStyle = f.dark;
    rrect(ctx, -12, -7, 24, 14, 3);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.rotate(u.turretAngle);
    const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 220);
    ctx.fillStyle = `rgba(150,225,255,${pulse})`;
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(2, -6);
    ctx.lineTo(-4, 0);
    ctx.lineTo(2, 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#e6fbff';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  drawHarvester(ctx, u, f) {
    ctx.save();
    ctx.rotate(u.angle);
    ctx.fillStyle = '#25282d';
    ctx.fillRect(-15, -13, 30, 5);
    ctx.fillRect(-15, 8, 30, 5);
    const grad = ctx.createLinearGradient(0, -10, 0, 10);
    grad.addColorStop(0, '#9aa0a8');
    grad.addColorStop(1, '#4d5158');
    ctx.fillStyle = grad;
    rrect(ctx, -15, -10, 30, 20, 3);
    ctx.fill();
    ctx.fillStyle = f.color;
    ctx.fillRect(-15, -10, 5, 20);

    // Cargo level.
    const fill = u.cargo / u.def.capacity;
    ctx.fillStyle = '#2a2c30';
    ctx.fillRect(-6, -7, 18, 14);
    if (fill > 0) {
      ctx.fillStyle = '#e8b93f';
      ctx.fillRect(-6, 7 - 14 * fill, 18, 14 * fill);
    }
    ctx.restore();
  }

  drawHealthBar(x, y, width, ratio, show) {
    if (!show) return;
    const ctx = this.ctx;
    const w = Math.max(18, width);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - w / 2, y, w, 4);
    ctx.fillStyle = ratio > 0.6 ? '#5ad25a' : ratio > 0.3 ? '#e2c23f' : '#e2503f';
    ctx.fillRect(x - w / 2 + 1, y + 1, (w - 2) * Math.max(0, ratio), 2);
  }

  // ---- projectiles & effects ---------------------------------------------

  drawProjectiles() {
    const ctx = this.ctx;
    for (const p of this.game.projectiles) {
      const x = this.worldToScreenX(p.x);
      const y = this.worldToScreenY(p.y);

      if (p.weapon.kind === 'beam') {
        const a = Math.max(0, p.life / 0.16);
        const fx = this.worldToScreenX(p.beamFrom.x);
        const fy = this.worldToScreenY(p.beamFrom.y);
        const tx = this.worldToScreenX(p.beamTo.x);
        const ty = this.worldToScreenY(p.beamTo.y);
        ctx.strokeStyle = `rgba(150,230,255,${a * 0.35})`;
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.strokeStyle = `rgba(240,253,255,${a})`;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        continue;
      }

      if (p.weapon.kind === 'shell') {
        ctx.fillStyle = '#ffd98a';
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(255,240,170,0.9)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - Math.cos(p.angle || 0) * 9, y - Math.sin(p.angle || 0) * 9);
        ctx.stroke();
      }
    }
  }

  drawEffects() {
    const ctx = this.ctx;
    for (const e of this.game.effects) {
      const x = this.worldToScreenX(e.x);
      const y = this.worldToScreenY(e.y);
      const t = e.t / e.life;

      if (e.type === 'explosion') {
        const r = (e.size || 20) * (0.35 + t * 0.9);
        ctx.fillStyle = `rgba(255,${Math.floor(160 - t * 90)},60,${(1 - t) * 0.85})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(255,220,150,${(1 - t) * 0.6})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r * 1.25, 0, Math.PI * 2);
        ctx.stroke();
      } else if (e.type === 'muzzle') {
        ctx.fillStyle = `rgba(255,230,140,${1 - t})`;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(e.angle || 0);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(e.size || 8, -4);
        ctx.lineTo(e.size || 8, 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (e.type === 'hit') {
        ctx.fillStyle = e.color || '#fff';
        ctx.globalAlpha = 1 - t;
        ctx.beginPath();
        ctx.arc(x, y, (e.size || 8) * (0.6 + t), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (e.type === 'marker') {
        ctx.strokeStyle = e.color || '#7ce87c';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 1 - t;
        ctx.beginPath();
        ctx.arc(x, y, 6 + t * 16, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  // ---- shroud -------------------------------------------------------------

  drawShroud() {
    const game = this.game;

    // Vision only changes a few times a second — no need to rebuild the mask
    // on every frame.
    if (this.shroudVersion !== game.visionVersion) {
      this.shroudVersion = game.visionVersion;
      const data = this.shroudData.data;
      for (let i = 0; i < game.map.size; i++) {
        const o = i * 4;
        data[o] = 0;
        data[o + 1] = 0;
        data[o + 2] = 0;
        data[o + 3] = game.visible[i] ? 0 : game.explored[i] ? 118 : 255;
      }
      this.sctx.putImageData(this.shroudData, 0, 0);
    }

    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
      this.shroudCanvas,
      this.ox / TILE,
      this.oy / TILE,
      this.viewW / TILE,
      this.viewH / TILE,
      0,
      0,
      this.viewW,
      this.viewH
    );
    ctx.imageSmoothingEnabled = false;
  }

  // ---- overlays -----------------------------------------------------------

  drawPlacement() {
    const p = this.ui.placement;
    if (!p) return;
    const def = BUILDINGS[p.type];
    const ctx = this.ctx;
    const x = this.worldToScreenX(p.tx * TILE);
    const y = this.worldToScreenY(p.ty * TILE);
    const w = def.w * TILE;
    const h = def.h * TILE;

    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = p.valid ? '#4fd06a' : '#e0503f';
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = p.valid ? '#9dffb0' : '#ff8b7a';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    for (let i = 1; i < def.w; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * TILE, y);
      ctx.lineTo(x + i * TILE, y + h);
      ctx.stroke();
    }
    for (let i = 1; i < def.h; i++) {
      ctx.beginPath();
      ctx.moveTo(x, y + i * TILE);
      ctx.lineTo(x + w, y + i * TILE);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawSelectionBox() {
    const box = this.ui.selectionBox;
    if (!box) return;
    const ctx = this.ctx;
    const x = Math.min(box.x0, box.x1);
    const y = Math.min(box.y0, box.y1);
    const w = Math.abs(box.x1 - box.x0);
    const h = Math.abs(box.y1 - box.y0);
    ctx.fillStyle = 'rgba(124,232,124,0.12)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#7ce87c';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  }

  // ---- minimap ------------------------------------------------------------

  renderMinimap() {
    const g = this.mctx;
    const size = this.minimap.width;
    const scale = size / MAP_W;
    const game = this.game;

    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, size, size);
    g.drawImage(this.miniTerrain, 0, 0, size, size);

    const map = game.map;
    g.fillStyle = '#e8b93f';
    for (let i = 0; i < map.size; i++) {
      if (map.ore[i] === 0) continue;
      g.fillRect((i % MAP_W) * scale, Math.floor(i / MAP_W) * scale, scale, scale);
    }

    for (const b of game.buildings) {
      if (b.owner !== 0 && !game.isExplored(b.x, b.y)) continue;
      g.fillStyle = FACTIONS[b.owner].color;
      g.fillRect(b.tx * scale, b.ty * scale, b.w * scale, b.h * scale);
    }
    for (const u of game.units) {
      if (u.owner !== 0 && !game.isVisible(u.x, u.y)) continue;
      g.fillStyle = u.owner === 0 ? FACTIONS[0].light : FACTIONS[1].light;
      g.fillRect((u.x / TILE) * scale - 1, (u.y / TILE) * scale - 1, 2.5, 2.5);
    }

    g.imageSmoothingEnabled = true;
    g.drawImage(this.shroudCanvas, 0, 0, size, size);
    g.imageSmoothingEnabled = false;

    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 1;
    g.strokeRect(
      (this.camera.x / TILE) * scale,
      (this.camera.y / TILE) * scale,
      (this.viewW / TILE) * scale,
      (this.viewH / TILE) * scale
    );
  }
}
