/**
 * Mouse + keyboard. Exposes mouse.worldX / mouse.worldY, which the renderer
 * reads to draw the build preview.
 */

const CAMERA_SPEED = 420;

export class Input {
  constructor(game) {
    this.game = game;
    this.mouse = { x: 0, y: 0, worldX: 0, worldY: 0 };
    this.keys = new Set();
    this.dragStart = null;
    this.dragging = false;
    this.box = null;
  }

  attach() {
    const c = this.game.canvas;

    c.addEventListener('contextmenu', (e) => e.preventDefault());

    c.addEventListener('mousemove', (e) => {
      const r = c.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
      this.mouse.worldX = this.mouse.x + this.game.camera.x;
      this.mouse.worldY = this.mouse.y + this.game.camera.y;

      if (this.dragStart && !this.game.buildMode) {
        const d = Math.hypot(this.mouse.x - this.dragStart.sx, this.mouse.y - this.dragStart.sy);
        if (d > 6) this.dragging = true;
        if (this.dragging) {
          this.box = {
            x0: this.dragStart.wx,
            y0: this.dragStart.wy,
            x1: this.mouse.worldX,
            y1: this.mouse.worldY,
          };
        }
      }
    });

    c.addEventListener('mousedown', (e) => {
      const g = this.game;
      if (e.button === 2) {
        if (g.buildMode) {
          g.buildMode = null;
          return;
        }
        g.orderAt(this.mouse.worldX, this.mouse.worldY);
        return;
      }
      if (e.button !== 0) return;

      if (g.buildMode) {
        const tx = Math.floor(this.mouse.worldX / g.TILE);
        const ty = Math.floor(this.mouse.worldY / g.TILE);
        g.placeBuilding(tx, ty);
        return;
      }
      this.dragStart = {
        sx: this.mouse.x,
        sy: this.mouse.y,
        wx: this.mouse.worldX,
        wy: this.mouse.worldY,
      };
      this.dragging = false;
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button !== 0 || !this.dragStart) return;
      const g = this.game;
      if (this.dragging) {
        g.selectInBox(this.dragStart.wx, this.dragStart.wy, this.mouse.worldX, this.mouse.worldY);
      } else {
        g.selectAt(this.mouse.worldX, this.mouse.worldY, e.shiftKey);
      }
      this.dragStart = null;
      this.dragging = false;
      this.box = null;
    });

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === 'escape') {
        this.game.buildMode = null;
        for (const en of this.game.entities.list) en.selected = false;
        this.game.selected = [];
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
  }

  update(dt) {
    const g = this.game;
    let dx = 0;
    let dy = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) dx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) dx += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) dy -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) dy += 1;
    if (!dx && !dy) return;

    g.camera.x += dx * CAMERA_SPEED * dt;
    g.camera.y += dy * CAMERA_SPEED * dt;
    g.camera.x = Math.max(0, Math.min(g.MAP_W * g.TILE - g.canvas.width, g.camera.x));
    g.camera.y = Math.max(0, Math.min(g.MAP_H * g.TILE - g.canvas.height, g.camera.y));
  }
}
