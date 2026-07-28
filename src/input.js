// Mouse and keyboard: selection, orders, camera control, building placement.

import { TILE } from './map.js';
import { BUILDINGS } from './entities.js';
import { MAP_W, MAP_H } from './game.js';

const EDGE = 18;
const CAMERA_SPEED = 950;

export class Input {
  constructor(app) {
    this.app = app;
    this.canvas = app.canvas;
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, inside: false };
    this.dragStart = null;
    this.dragging = false;
    this.placing = null;
    this.attackMoveArmed = false;
    this.panning = null;
    this.minimapDragging = false;
    this.lastClick = { time: 0, type: null };
  }

  get game() {
    return this.app.game;
  }
  get renderer() {
    return this.app.renderer;
  }

  attach() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    c.addEventListener('mouseleave', () => {
      this.mouse.inside = false;
    });
    c.addEventListener('mouseenter', () => {
      this.mouse.inside = true;
    });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.renderer.panBy(e.deltaX, e.deltaY);
    }, { passive: false });

    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));

    const mm = this.app.minimapCanvas;
    mm.addEventListener('contextmenu', (e) => e.preventDefault());
    mm.addEventListener('mousedown', (e) => this.onMinimapDown(e));
    mm.addEventListener('mousemove', (e) => {
      if (this.minimapDragging) this.jumpToMinimap(e);
    });
  }

  // ---- helpers ------------------------------------------------------------

  canvasPos(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  worldFromEvent(e) {
    const p = this.canvasPos(e);
    return this.renderer.screenToWorld(p.x, p.y);
  }

  startPlacement(type) {
    this.placing = type;
    this.attackMoveArmed = false;
  }

  cancelPlacement() {
    this.placing = null;
    this.renderer.ui.placement = null;
  }

  setSelection(entities) {
    for (const e of this.game.selection) e.selected = false;
    this.game.selection = entities;
    for (const e of entities) e.selected = true;
    this.app.ui.onSelectionChanged();
  }

  // ---- mouse --------------------------------------------------------------

  onMouseDown(e) {
    const world = this.worldFromEvent(e);

    if (e.button === 1) {
      e.preventDefault();
      this.panning = this.canvasPos(e);
      return;
    }

    if (e.button === 2) {
      if (this.placing) {
        this.cancelPlacement();
        return;
      }
      this.attackMoveArmed = false;
      const units = this.game.selection.filter((s) => s.etype === 'unit');
      if (units.length) this.game.issueOrder(units, world.x, world.y, false, false);
      else {
        // Right-click with a structure selected sets its rally point.
        for (const b of this.game.selection) {
          if (b.etype === 'building' && b.def.produces) {
            b.rally = { x: world.x, y: world.y };
            this.game.addEffect('marker', world.x, world.y, { color: '#7ce87c' });
          }
        }
      }
      return;
    }

    if (e.button !== 0) return;

    if (this.placing) {
      const tx = Math.floor(world.x / TILE);
      const ty = Math.floor(world.y / TILE);
      const def = BUILDINGS[this.placing];
      const px = tx - Math.floor(def.w / 2);
      const py = ty - Math.floor(def.h / 2);
      if (this.game.placeQueuedBuilding(0, px, py)) {
        this.placing = null;
        this.renderer.ui.placement = null;
        this.app.ui.refresh();
      } else {
        this.game.addMessage('Cannot build there');
      }
      return;
    }

    if (this.attackMoveArmed) {
      const units = this.game.selection.filter((s) => s.etype === 'unit');
      if (units.length) this.game.issueOrder(units, world.x, world.y, false, true);
      this.attackMoveArmed = false;
      this.app.ui.setCursorMode(null);
      return;
    }

    this.dragStart = this.canvasPos(e);
    this.dragging = false;
  }

  onMouseMove(e) {
    const p = this.canvasPos(e);
    this.mouse.x = p.x;
    this.mouse.y = p.y;
    this.mouse.inside = p.x >= 0 && p.y >= 0 && p.x <= this.renderer.viewW && p.y <= this.renderer.viewH;

    if (this.panning) {
      this.renderer.panBy(this.panning.x - p.x, this.panning.y - p.y);
      this.panning = p;
      return;
    }

    if (this.placing) {
      const world = this.renderer.screenToWorld(p.x, p.y);
      const def = BUILDINGS[this.placing];
      const tx = Math.floor(world.x / TILE) - Math.floor(def.w / 2);
      const ty = Math.floor(world.y / TILE) - Math.floor(def.h / 2);
      this.renderer.ui.placement = {
        type: this.placing,
        tx,
        ty,
        valid: this.game.canPlace(0, this.placing, tx, ty),
      };
      return;
    }

    if (this.dragStart) {
      const dist = Math.hypot(p.x - this.dragStart.x, p.y - this.dragStart.y);
      if (dist > 5) this.dragging = true;
      if (this.dragging) {
        this.renderer.ui.selectionBox = {
          x0: this.dragStart.x,
          y0: this.dragStart.y,
          x1: p.x,
          y1: p.y,
        };
      }
    }
  }

  onMouseUp(e) {
    if (e.button === 1) {
      this.panning = null;
      return;
    }
    this.minimapDragging = false;
    if (e.button !== 0 || !this.dragStart) return;

    const p = this.canvasPos(e);
    const additive = e.shiftKey;

    if (this.dragging) {
      const a = this.renderer.screenToWorld(Math.min(this.dragStart.x, p.x), Math.min(this.dragStart.y, p.y));
      const b = this.renderer.screenToWorld(Math.max(this.dragStart.x, p.x), Math.max(this.dragStart.y, p.y));
      const picked = this.game.units.filter(
        (u) => u.owner === 0 && !u.dead && u.x >= a.x && u.x <= b.x && u.y >= a.y && u.y <= b.y
      );
      // A box drag prefers combat units; miners only if that is all there is.
      const combat = picked.filter((u) => !u.def.harvester);
      const result = combat.length ? combat : picked;
      this.setSelection(additive ? [...new Set([...this.game.selection, ...result])] : result);
    } else {
      const world = this.renderer.screenToWorld(p.x, p.y);
      const hit = this.game.entityAt(world.x, world.y);
      const now = performance.now();
      const isDouble = now - this.lastClick.time < 320 && hit && this.lastClick.type === hit.type;
      this.lastClick = { time: now, type: hit ? hit.type : null };

      if (!hit) {
        if (!additive) this.setSelection([]);
      } else if (hit.owner !== 0) {
        this.setSelection([hit]);
      } else if (isDouble && hit.etype === 'unit') {
        const onScreen = this.game.units.filter(
          (u) => u.owner === 0 && u.type === hit.type && this.renderer.onScreen(u.x, u.y, 0)
        );
        this.setSelection(onScreen);
      } else if (additive) {
        const sel = new Set(this.game.selection);
        if (sel.has(hit)) sel.delete(hit);
        else sel.add(hit);
        this.setSelection([...sel]);
      } else {
        this.setSelection([hit]);
      }
    }

    this.dragStart = null;
    this.dragging = false;
    this.renderer.ui.selectionBox = null;
  }

  // ---- minimap ------------------------------------------------------------

  jumpToMinimap(e) {
    const mm = this.app.minimapCanvas;
    const r = mm.getBoundingClientRect();
    const tx = ((e.clientX - r.left) / r.width) * MAP_W;
    const ty = ((e.clientY - r.top) / r.height) * MAP_H;
    this.renderer.centerOn(tx * TILE, ty * TILE);
  }

  onMinimapDown(e) {
    e.preventDefault();
    const mm = this.app.minimapCanvas;
    const r = mm.getBoundingClientRect();
    const wx = ((e.clientX - r.left) / r.width) * MAP_W * TILE;
    const wy = ((e.clientY - r.top) / r.height) * MAP_H * TILE;

    if (e.button === 2) {
      const units = this.game.selection.filter((s) => s.etype === 'unit');
      if (units.length) this.game.issueOrder(units, wx, wy, false, false);
      return;
    }
    this.minimapDragging = true;
    this.renderer.centerOn(wx, wy);
  }

  // ---- keyboard -----------------------------------------------------------

  onKeyDown(e) {
    const key = e.key.toLowerCase();
    this.keys.add(key);

    if (key === 'escape') {
      if (this.placing) this.cancelPlacement();
      else if (this.attackMoveArmed) {
        this.attackMoveArmed = false;
        this.app.ui.setCursorMode(null);
      } else this.setSelection([]);
      return;
    }

    if (key === 'a') {
      if (this.game.selection.some((s) => s.etype === 'unit' && s.def.weapon)) {
        this.attackMoveArmed = true;
        this.app.ui.setCursorMode('attack-move');
      }
      return;
    }

    if (key === 's') {
      for (const u of this.game.selection) if (u.etype === 'unit') u.stop();
      return;
    }

    if (key === 'h') {
      const [bx, by] = this.game.baseCenter(0);
      this.renderer.centerOn(bx, by);
      return;
    }

    if (key === ' ') {
      e.preventDefault();
      this.game.paused = !this.game.paused;
      this.app.ui.refresh();
      return;
    }

    if (key >= '0' && key <= '9') {
      const slot = key;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        this.game.controlGroups[slot] = [...this.game.selection];
      } else {
        const group = (this.game.controlGroups[slot] || []).filter((en) => !en.dead);
        this.game.controlGroups[slot] = group;
        if (group.length) {
          this.setSelection(group);
          const cx = group.reduce((s, u) => s + u.x, 0) / group.length;
          const cy = group.reduce((s, u) => s + u.y, 0) / group.length;
          if (!this.renderer.onScreen(cx, cy, -80)) this.renderer.centerOn(cx, cy);
        }
      }
    }
  }

  // ---- per-frame ----------------------------------------------------------

  update(dt) {
    let dx = 0;
    let dy = 0;
    if (this.keys.has('arrowleft')) dx -= 1;
    if (this.keys.has('arrowright')) dx += 1;
    if (this.keys.has('arrowup')) dy -= 1;
    if (this.keys.has('arrowdown')) dy += 1;

    if (this.mouse.inside && !this.dragging) {
      if (this.mouse.x < EDGE) dx -= 1;
      else if (this.mouse.x > this.renderer.viewW - EDGE) dx += 1;
      if (this.mouse.y < EDGE) dy -= 1;
      else if (this.mouse.y > this.renderer.viewH - EDGE) dy += 1;
    }

    if (dx || dy) {
      const len = Math.hypot(dx, dy) || 1;
      this.renderer.panBy((dx / len) * CAMERA_SPEED * dt, (dy / len) * CAMERA_SPEED * dt);
    }
  }
}
