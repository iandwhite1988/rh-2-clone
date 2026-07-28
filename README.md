# RA2 Clone

A Red Alert 2 style real-time strategy game running in the browser on a 2D
canvas. No build step and no runtime dependencies — the repository is a static
site that Vercel serves straight from the root.

There are two entry points.

| Page | What it is |
| --- | --- |
| `/` (`index.html`) | The single-file prototype. Everything — markup, styles, game loop — lives in one HTML file. |
| `/advanced.html` | A larger multi-file build with fog of war, pathfinding and a skirmish AI, loading `styles.css` and `src/*.js`. |

## Running it locally

```bash
npm install     # only pulls in a static file server for development
npm run dev     # http://localhost:3000
```

Any static server works. Opening the files directly over `file://` works for
the prototype but **not** for `/advanced.html`, because browsers block ES
module imports from the filesystem.

## The prototype (`/`)

Left-click selects, or places a structure once you have picked one from the
sidebar. Right-click moves the selection. `WASD` or the arrow keys pan the
camera.

Build a Refinery and a War Factory, then produce a Harvester: it drives to the
nearest ore, fills to 700, returns to the Refinery and converts the load into
credits. GIs need a Barracks; tanks and harvesters need a War Factory.

Known gaps, in rough order of how much they matter:

- **There is no opponent.** Every entity is owned by player 0, so the combat
  and attack-move code never runs and there is no win or lose condition.
- **Placement is unchecked.** Structures can be dropped off the map, on top of
  each other, or over the Construction Yard.
- **The camera is unclamped**, so panning runs off into empty space.
- **The canvas size is fixed at load**, so resizing the window leaves it
  mismatched.
- `id="credits"` is used twice, which is invalid HTML; it works only because
  `updateUI()` writes to both elements.
- The starting Power Plant at (5,5) overlaps the 2×2 Construction Yard at
  (4,4).
- Each harvester scans all 2,400 tiles every frame to find ore.

## The full build (`/advanced.html`)

**Economy.** Miners drive to the nearest ore field, fill up, and return to a
refinery. Production spends credits gradually as an item builds, so a stalled
bank pauses the queue. Ore fields slowly regrow.

**Power.** Power plants supply the grid and most structures draw from it. When
demand exceeds supply, production halves and gun turrets stop firing.

**Tech tree.** Refinery and barracks need a power plant; the war factory needs
a refinery; prism tanks need the factory plus a barracks.

**Combat.** Weapons carry per-armour multipliers — dogs shred infantry but
barely scratch tanks, prism tanks outrange everything but die fast.

**Fog of war.** The map starts shrouded. Explored ground stays dimmed and
remembers enemy structures; enemy units are drawn only while visible.

Controls: left-click select, left-drag box-select, right-click move/attack,
`A` attack-move, `S` stop, arrows or screen edge to scroll, `H` to jump to
base, `Ctrl`+`1`–`9` to set a control group, `1`–`9` to recall, `Space` to
pause.

## Project layout

```
index.html      the single-file prototype
advanced.html   page shell for the multi-file build
styles.css      dark command-panel UI (used by advanced.html)
src/main.js     entry point, animation loop, restart handling
src/game.js     world simulation: economy, production, combat, AI, victory
src/entities.js unit + structure stats and their per-frame behaviour
src/map.js      procedural terrain, ore fields, A* pathfinding
src/renderer.js canvas drawing: terrain cache, entities, fog of war, minimap
src/input.js    mouse + keyboard: selection, orders, camera, placement
src/ui.js       sidebar: build menus, resources, selection panel, overlays
```

## Deploying

Nothing to build. On Vercel, import the repository and accept the defaults —
`vercel.json` pins the framework preset to "other" and serves the repository
root. Every push to `main` redeploys.

## License

MIT
