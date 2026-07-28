/**
 * Canvas Renderer – Higher detail Yuri's Revenge style
 */

export class Renderer {
  constructor(game) {
    this.game = game;
  }

  draw() {
    const g = this.game;
    const ctx = g.ctx;
    const TILE = g.TILE;

    ctx.fillStyle = '#0b170b';
    ctx.fillRect(0, 0, g.canvas.width, g.canvas.height);

    const startX = Math.max(0, Math.floor(g.camera.x / TILE) - 1);
    const startY = Math.max(0, Math.floor(g.camera.y / TILE) - 1);
    const endX = Math.min(g.MAP_W, startX + Math.ceil(g.canvas.width / TILE) + 2);
    const endY = Math.min(g.MAP_H, startY + Math.ceil(g.canvas.height / TILE) + 2);

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const px = x * TILE - g.camera.x;
        const py = y * TILE - g.camera.y;

        if (g.map.tiles[y][x] === 1) {
          ctx.fillStyle = '#4a3b12';
          ctx.fillRect(px, py, TILE - 1, TILE - 1);
          ctx.fillStyle = '#c9a227';
          ctx.beginPath();
          ctx.arc(px + 9, py + 11, 4.5, 0, Math.PI * 2);
          ctx.arc(px + 19, py + 17, 3.8, 0, Math.PI * 2);
          ctx.arc(px + 13, py + 22, 3.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255, 230, 140, 0.55)';
          ctx.beginPath();
          ctx.arc(px + 9, py + 10, 1.8, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const shade = ((x * 3 + y * 7) % 5);
          const colors = ['#152b15', '#1a331a', '#183018', '#1c361c', '#132613'];
          ctx.fillStyle = colors[shade];
          ctx.fillRect(px, py, TILE - 1, TILE - 1);
        }
      }
    }

    for (const e of g.entities.list) {
      this.drawEntity(e);
    }

    if (g.buildMode) {
      const tx = Math.floor(g.input.mouse.worldX / TILE);
      const ty = Math.floor(g.input.mouse.worldY / TILE);
      const size = (g.buildMode === 'refinery' || g.buildMode === 'factory' || g.buildMode === 'conyard') ? 2 : 1;
      const px = tx * TILE - g.camera.x;
      const py = ty * TILE - g.camera.y;

      ctx.fillStyle = 'rgba(0, 255, 120, 0.22)';
      ctx.fillRect(px, py, size * TILE, size * TILE);
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(px + 1, py + 1, size * TILE - 2, size * TILE - 2);
      ctx.setLineDash([]);
    }
  }

  drawEntity(e) {
    const g = this.game;
    const ctx = g.ctx;
    const TILE = g.TILE;
    const px = e.x * TILE - g.camera.x;
    const py = e.y * TILE - g.camera.y;
    const w = (e.w || 1) * TILE;
    const h = (e.h || 1) * TILE;

    if (e.isBuilding) {
      this.drawBuilding(e, px, py, w, h);
    } else {
      this.drawUnit(e, px, py, TILE);
    }

    // Health bar
    if (e.hp < e.maxHp) {
      const barW = Math.max(w, 22);
      ctx.fillStyle = '#1a0000';
      ctx.fillRect(px, py - 9, barW, 5);
      const ratio = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = ratio > 0.5 ? '#22cc22' : ratio > 0.25 ? '#cccc22' : '#cc2222';
      ctx.fillRect(px, py - 9, barW * ratio, 5);
      ctx.strokeStyle = '#000';
      ctx.strokeRect(px, py - 9, barW, 5);
    }

    // Selection brackets
    if (e.selected) {
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 1.5;
      const s = 7;
      ctx.beginPath();
      ctx.moveTo(px, py + s); ctx.lineTo(px, py); ctx.lineTo(px + s, py);
      ctx.moveTo(px + w - s, py); ctx.lineTo(px + w, py); ctx.lineTo(px + w, py + s);
      ctx.moveTo(px, py + h - s); ctx.lineTo(px, py + h); ctx.lineTo(px + s, py + h);
      ctx.moveTo(px + w - s, py + h); ctx.lineTo(px + w, py + h); ctx.lineTo(px + w, py + h - s);
      ctx.stroke();
    }
  }

  drawBuilding(e, px, py, w, h) {
    const ctx = this.game.ctx;

    switch (e.type) {
      case 'conyard':
        ctx.fillStyle = '#3a5a3a';
        ctx.fillRect(px, py, w, h);
        ctx.fillStyle = '#2a402a';
        ctx.fillRect(px + 4, py + 4, w - 8, 16);
        ctx.fillStyle = '#555';
        ctx.fillRect(px + w - 18, py + 6, 11, 42);
        ctx.fillStyle = '#777';
        ctx.fillRect(px + w - 30, py + 10, 24, 7);
        ctx.fillStyle = '#88aacc';
        ctx.fillRect(px + 10, py + 28, 11, 7);
        ctx.fillRect(px + 28, py + 28, 11, 7);
        break;

      case 'power':
        ctx.fillStyle = '#2a4a6a';
        ctx.fillRect(px, py + 8, w, h - 8);
        ctx.fillStyle = '#444';
        ctx.fillRect(px + 9, py, 14, 22);
        ctx.fillStyle = '#666';
        ctx.fillRect(px + 11, py - 5, 10, 7);
        break;

      case 'barracks':
        ctx.fillStyle = '#5a3a3a';
        ctx.fillRect(px, py, w, h);
        ctx.fillStyle = '#3a2525';
        ctx.fillRect(px + 2, py + 2, w - 4, 9);
        ctx.fillStyle = '#222';
        ctx.fillRect(px + 9, py + 17, 14, 13);
        break;

      case 'factory':
        ctx.fillStyle = '#5a5a2a';
        ctx.fillRect(px, py, w, h);
        ctx.fillStyle = '#333';
        ctx.fillRect(px + 7, py + 18, w - 14, 26);
        break;

      case 'refinery':
        ctx.fillStyle = '#6a4a2a';
        ctx.fillRect(px, py, w, h);
        ctx.fillStyle = '#8a6a3a';
        ctx.beginPath();
        ctx.arc(px + 18, py + 20, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#444';
        ctx.fillRect(px + 34, py + 26, 26, 14);
        break;
    }

    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
  }

  drawUnit(e, px, py, TILE) {
    const ctx = this.game.ctx;
    const cx = px + TILE / 2;
    const cy = py + TILE / 2;

    switch (e.type) {
      // Allied Infantry
      case 'gi':
        ctx.fillStyle = '#4a7a4a'; ctx.fillRect(cx - 4, cy - 1, 8, 9);
        ctx.fillStyle = '#d4a574'; ctx.beginPath(); ctx.arc(cx, cy - 6, 3.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3a5a3a'; ctx.beginPath(); ctx.arc(cx, cy - 7, 3.6, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#333'; ctx.fillRect(cx + 3, cy - 1, 7, 2);
        break;

      case 'guardian':
        ctx.fillStyle = '#3a6a3a'; ctx.fillRect(cx - 5, cy - 2, 10, 10);
        ctx.fillStyle = '#d4a574'; ctx.beginPath(); ctx.arc(cx, cy - 7, 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#222'; ctx.fillRect(cx - 6, cy + 2, 12, 3);
        break;

      case 'rocketeer':
        ctx.fillStyle = '#3a6aaa'; ctx.fillRect(cx - 4, cy - 2, 8, 9);
        ctx.fillStyle = '#d4a574'; ctx.beginPath(); ctx.arc(cx, cy - 6, 3.1, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff5500';
        ctx.beginPath();
        ctx.moveTo(cx - 5, cy + 7); ctx.lineTo(cx - 1, cy + 14); ctx.lineTo(cx + 2, cy + 7);
        ctx.moveTo(cx + 1, cy + 7); ctx.lineTo(cx + 5, cy + 14); ctx.lineTo(cx + 8, cy + 7);
        ctx.fill();
        break;

      case 'seal':
        ctx.fillStyle = '#2a4a2a'; ctx.fillRect(cx - 4, cy - 1, 8, 9);
        ctx.fillStyle = '#d4a574'; ctx.beginPath(); ctx.arc(cx, cy - 6, 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#111'; ctx.fillRect(cx + 2, cy - 2, 8, 2);
        break;

      case 'tanya':
        ctx.fillStyle = '#8b4513'; ctx.fillRect(cx - 4, cy - 1, 8, 9);
        ctx.fillStyle = '#f4c9a0'; ctx.beginPath(); ctx.arc(cx, cy - 6, 3.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#222';
        ctx.fillRect(cx + 3, cy - 1, 6, 2);
        ctx.fillRect(cx - 9, cy + 1, 5, 2);
        break;

      case 'chrono':
        ctx.fillStyle = '#4a3a7a'; ctx.fillRect(cx - 4, cy - 1, 8, 9);
        ctx.fillStyle = '#d4a574'; ctx.beginPath(); ctx.arc(cx, cy - 6, 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#aa88ff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.stroke();
        break;

      // Allied Vehicles
      case 'tank':
        ctx.fillStyle = '#333'; ctx.fillRect(cx - 13, cy + 4, 26, 7);
        ctx.fillStyle = '#5a7a5a'; ctx.fillRect(cx - 12, cy - 4, 24, 10);
        ctx.fillStyle = '#4a6a4a'; ctx.beginPath(); ctx.arc(cx, cy - 2, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#333'; ctx.fillRect(cx + 5, cy - 4, 15, 3);
        break;

      case 'prism':
        ctx.fillStyle = '#333'; ctx.fillRect(cx - 11, cy + 3, 22, 6);
        ctx.fillStyle = '#6a8aaa'; ctx.fillRect(cx - 10, cy - 5, 20, 10);
        ctx.fillStyle = '#aaddff';
        ctx.beginPath();
        ctx.moveTo(cx, cy - 14);
        ctx.lineTo(cx - 6, cy - 4);
        ctx.lineTo(cx + 6, cy - 4);
        ctx.fill();
        break;

      case 'mirage':
        ctx.fillStyle = '#333'; ctx.fillRect(cx - 12, cy + 3, 24, 6);
        ctx.fillStyle = '#5a7a4a'; ctx.fillRect(cx - 11, cy - 5, 22, 10);
        ctx.fillStyle = '#3a5a2a';
        ctx.beginPath(); ctx.arc(cx - 4, cy - 8, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 5, cy - 7, 4, 0, Math.PI * 2); ctx.fill();
        break;

      case 'robot':
        ctx.fillStyle = '#555'; ctx.fillRect(cx - 10, cy + 2, 20, 7);
        ctx.fillStyle = '#888'; ctx.fillRect(cx - 9, cy - 5, 18, 9);
        ctx.fillStyle = '#aaa'; ctx.beginPath(); ctx.arc(cx, cy - 3, 5, 0, Math.PI * 2); ctx.fill();
        break;

      case 'ifv':
        ctx.fillStyle = '#333'; ctx.fillRect(cx - 11, cy + 3, 22, 6);
        ctx.fillStyle = '#6a8a4a'; ctx.fillRect(cx - 10, cy - 5, 20, 10);
        ctx.fillStyle = '#5a7a3a'; ctx.fillRect(cx - 4, cy - 9, 8, 6);
        ctx.fillStyle = '#222'; ctx.fillRect(cx + 3, cy - 8, 10, 2);
        break;

      case 'harvester':
        ctx.fillStyle = '#8a7a30'; ctx.fillRect(cx - 14, cy - 6, 28, 14);
        ctx.fillStyle = '#6a5a20'; ctx.fillRect(cx - 14, cy - 11, 11, 9);
        ctx.fillStyle = '#333';
        ctx.fillRect(cx - 13, cy + 6, 9, 5);
        ctx.fillRect(cx + 4, cy + 6, 9, 5);
        if (e.cargo > 0) {
          ctx.fillStyle = '#c9a227';
          ctx.fillRect(cx - 1, cy - 4, 13 * (e.cargo / e.maxCargo), 8);
        }
        break;

      // Soviet
      case 'tesla':
        ctx.fillStyle = '#4a2a2a'; ctx.fillRect(cx - 5, cy - 1, 10, 10);
        ctx.fillStyle = '#d4a574'; ctx.beginPath(); ctx.arc(cx, cy - 7, 3.3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#88ccff'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - 8, cy + 2); ctx.lineTo(cx - 12, cy - 6);
        ctx.moveTo(cx + 8, cy + 2); ctx.lineTo(cx + 12, cy - 6);
        ctx.stroke();
        break;

      case 'rhino':
        ctx.fillStyle = '#333'; ctx.fillRect(cx - 14, cy + 4, 28, 8);
        ctx.fillStyle = '#6a3a3a'; ctx.fillRect(cx - 13, cy - 5, 26, 11);
        ctx.fillStyle = '#5a2a2a'; ctx.beginPath(); ctx.arc(cx, cy - 2, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#333'; ctx.fillRect(cx + 6, cy - 4, 16, 4);
        break;

      case 'apocalypse':
        ctx.fillStyle = '#222'; ctx.fillRect(cx - 16, cy + 5, 32, 9);
        ctx.fillStyle = '#5a2a2a'; ctx.fillRect(cx - 15, cy - 6, 30, 13);
        ctx.fillStyle = '#333';
        ctx.fillRect(cx + 8, cy - 8, 18, 3);
        ctx.fillRect(cx + 8, cy - 3, 18, 3);
        ctx.fillStyle = '#4a1a1a';
        ctx.beginPath(); ctx.arc(cx - 2, cy - 2, 9, 0, Math.PI * 2); ctx.fill();
        break;

      case 'terror':
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#aa2222';
        ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
        break;

      case 'v3':
        ctx.fillStyle = '#333'; ctx.fillRect(cx - 12, cy + 3, 24, 7);
        ctx.fillStyle = '#6a3a3a'; ctx.fillRect(cx - 11, cy - 4, 22, 9);
        // Rocket
        ctx.fillStyle = '#888';
        ctx.fillRect(cx - 3, cy - 18, 6, 16);
        ctx.fillStyle = '#aa4444';
        ctx.beginPath();
        ctx.moveTo(cx - 3, cy - 18);
        ctx.lineTo(cx, cy - 24);
        ctx.lineTo(cx + 3, cy - 18);
        ctx.fill();
        break;

      // Yuri
      case 'initiate':
        ctx.fillStyle = '#5a2a6a'; ctx.fillRect(cx - 4, cy - 1, 8, 9);
        ctx.fillStyle = '#d4a574'; ctx.beginPath(); ctx.arc(cx, cy - 6, 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#cc66ff';
        ctx.beginPath(); ctx.arc(cx, cy - 8, 2, 0, Math.PI * 2); ctx.fill();
        break;

      case 'brute':
        ctx.fillStyle = '#6a3a3a';
        ctx.fillRect(cx - 7, cy - 3, 14, 13);
        ctx.fillStyle = '#d4a574';
        ctx.beginPath(); ctx.arc(cx, cy - 8, 5, 0, Math.PI * 2); ctx.fill();
        break;

      case 'lasher':
        ctx.fillStyle = '#333'; ctx.fillRect(cx - 12, cy + 3, 24, 7);
        ctx.fillStyle = '#5a3a6a'; ctx.fillRect(cx - 11, cy - 5, 22, 10);
        ctx.fillStyle = '#4a2a5a';
        ctx.beginPath(); ctx.arc(cx, cy - 2, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#333'; ctx.fillRect(cx + 4, cy - 4, 13, 3);
        break;

      case 'gattling':
        ctx.fillStyle = '#333'; ctx.fillRect(cx - 11, cy + 3, 22, 6);
        ctx.fillStyle = '#5a3a6a'; ctx.fillRect(cx - 10, cy - 5, 20, 10);
        // Gattling barrels
        ctx.fillStyle = '#888';
        ctx.fillRect(cx + 2, cy - 9, 12, 2);
        ctx.fillRect(cx + 2, cy - 6, 12, 2);
        ctx.fillRect(cx + 2, cy - 3, 12, 2);
        break;

      case 'magnetron':
        ctx.fillStyle = '#333'; ctx.fillRect(cx - 11, cy + 3, 22, 6);
        ctx.fillStyle = '#4a2a6a'; ctx.fillRect(cx - 10, cy - 5, 20, 10);
        // Dish
        ctx.strokeStyle = '#aa66ff';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy - 10, 8, 0, Math.PI * 2); ctx.stroke();
        break;

      default:
        ctx.fillStyle = '#888';
        ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill();
    }
  }
}
