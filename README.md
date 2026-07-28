# RA2 Clone

A Red Alert 2 style real-time strategy game that runs entirely in the browser.
No engine, no build step, no dependencies at runtime — just ES modules and a
2D canvas.

Build a base, mine ore, and destroy the enemy before they destroy you.

## Running it locally

```bash
npm install     # only pulls in a static file server for development
npm run dev     # http://localhost:3000
```

Any static server works. Opening `index.html` directly from the filesystem
will **not** work, because browsers block ES module imports over `file://`.

## Controls

| Input | Action |
| --- | --- |
| Left click | Select unit or structure |
| Left drag | Box-select units |
| Right click | Move, attack, or mine (set rally point when a factory is selected) |
| `A` then click | Attack-move to a destination |
| `S` | Stop the selected units |
| Arrow keys / screen edge | Scroll the camera |
| Middle drag / minimap | Pan the camera |
| `H` | Jump to your base |
| `Ctrl` + `1`–`9` | Assign a control group |
| `1`–`9` | Recall a control group |
| `Space` | Pause |
| Double click a unit | Select every unit of that type on screen |

Left-click a sidebar entry to start production. When a structure finishes it
shows **READY** — click it again, then click the map to place it. Right-click
an entry in production to cancel it and refund what you have spent.

## How the game works

**Economy.** Ore miners drive to the nearest ore field, fill up, and return to
a refinery to convert cargo into credits. Production spends credits gradually
as an item builds, so a stalled bank pauses the queue instead of failing it.
Ore fields slowly regrow, so a long match cannot strip the map dry.

**Power.** Power plants supply the grid; most other structures draw from it.
When demand exceeds supply, production runs at half speed and gun turrets stop
firing — so bombing the enemy's power plants is a real tactic.

**Tech tree.** A refinery and barracks need a power plant. The war factory
needs a refinery. Prism tanks need the factory plus a barracks. Losing a
prerequisite cancels anything depending on it.

**Combat.** Weapons have per-armour multipliers: dogs shred infantry but barely
scratch tanks, tanks hit hard against structures, prism tanks outrange
everything at the cost of being fragile. Units defend themselves while idle but
only chase within a short leash of where you left them.

**Fog of war.** The map starts shrouded. Explored ground stays dimmed and
remembers enemy structures; enemy units are only drawn while something of yours
can actually see them.

**The AI** builds a base against the same rules you do — it expands power,
adds refineries and miners, and stages progressively larger attack waves. With
its base gone it sends everything hunting rather than hiding.

## Project layout

```
index.html      page shell: canvas viewport + sidebar markup
styles.css      dark command-panel UI
src/main.js     entry point, animation loop, restart handling
src/game.js     world simulation: economy, production, combat, AI, victory
src/entities.js unit + structure stats and their per-frame behaviour
src/map.js      procedural terrain, ore fields, A* pathfinding
src/renderer.js canvas drawing: terrain cache, entities, fog of war, minimap
src/input.js    mouse + keyboard: selection, orders, camera, placement
src/ui.js       sidebar: build menus, resources, selection panel, overlays
```

The simulation is deliberately separate from drawing: `game.js` never touches
the canvas, and `renderer.js` never mutates game state. `main.js` steps the
simulation with a clamped delta time, then draws whatever state resulted.

## Deploying

The repository is a static site — there is nothing to build.

On Vercel, import the repository and accept the defaults (`vercel.json` pins
the framework preset to "other" and serves the repository root). Every push to
`main` then redeploys automatically.

## License

MIT
