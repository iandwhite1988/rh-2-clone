# Handoff — rh-2-clone

Last verified: 2026-07-29, against the live `main` branch.

## What this repo is

A Red Alert 2 style RTS running entirely in the browser on a 2D canvas. No
build step, no runtime dependencies — a static site Vercel can serve from the
repository root.

There are **two independent games in here**, and confusing them is the single
easiest way to waste an hour:

| Path | What it is | State |
| --- | --- | --- |
| `index.html` | Single-file prototype. Markup, styles, and the whole game loop in one file. Does **not** import from `src/`. | Works. Verified booting at 61 FPS, no console errors, full harvest→deliver economy cycle. |
| `advanced.html` + `src/` | Modular ES-module build. | Works. Verified booting at 61 FPS, 26 sidebar buttons, no console errors. |

Editing `src/renderer.js` changes `advanced.html` only. It has no effect on
`/`, which is what a browser hitting the site root loads. That mismatch caused
repeated confusion — check which page you are actually looking at first.

## Live file inventory

```
index.html            18,115 b   prototype (self-contained, upgraded art)
advanced.html          1,928 b   shell for the modular build; inline styles
sidebar.html           5,660 b   static sidebar markup — NOT WIRED TO ANYTHING
README.md              3,995 b
package.json             421 b   dev server only (`serve`)
vercel.json              125 b   framework: null, outputDirectory: "."
src/entities.js        5,917 b   EntityManager + unit/building defs
src/game.js            7,700 b   host: economy, placement, selection, loop
src/input.js           3,343 b   mouse/keyboard, exposes mouse.worldX/Y
src/main.js            3,322 b   entry point; generates the sidebar in JS
src/renderer.js       13,559 b   Yuri's Revenge style vector art
repo-publisher/                  Claude Code plugin (see below)
```

Absent, despite appearing in the target tree: `styles.css`, `src/map.js`,
`src/ui.js`. They were deleted when the architecture changed — they belonged to
an older build and had become unreachable dead code.

## Open items, most consequential first

**1. There is no opponent.** Every entity is created with `owner: 0`. The
combat code in `EntityManager.update` and the attack branch in `orderAt` are
written and correct, but nothing ever triggers them, and there is no win or
lose condition. Both games are currently base-builders, not RTSs. Giving the
enemy a starting base is the highest-value next change — it activates code
that already exists.

**2. `sidebar.html` is orphaned and its prices disagree with the game.** The
markup is in the repo but no page includes it, and nothing binds its
`data-type` buttons. It also has no credits or selected readout, so dropping it
into a page as-is will make `main.js` throw on the first frame when
`getElementById('credits')` returns null. Its costs conflict with the source of
truth in `src/game.js`:

| Item | `sidebar.html` | `src/game.js` |
| --- | --- | --- |
| War Factory | $800 | $2000 |
| Ore Refinery | $1000 | $2000 |
| Guardian GI | $400 | $300 |
| Initiate | $200 | $300 |
| Gattling Tank | $800 | $600 |

Pick one as authoritative and sync the other, or the UI will quote prices the
game does not charge.

**3. Sprites are not set up.** The target layout calls for
`assets/sprites/<type>.png`, one per unit. Nothing loads images yet — all art
is drawn with canvas primitives. A loader was written during this session but
never pushed and is gone; it needs redoing. The approach that works: a manifest
mapping entity `type` → filename, with `drawEntity` preferring a loaded sprite
and falling back to the existing vector art, so the game stays playable while
the art is half finished. Avoid attempting to load one image per type
unconditionally — 27 missing files produce 27 console 404s on every load.

**4. Prototype-only gaps** (`index.html`): building placement is unvalidated
(structures can be placed off-map, overlapping, or on the Construction Yard,
and credits are still deducted); the camera never clamps; canvas size is fixed
at load with no resize handler; `id="credits"` appears twice, which is invalid
HTML and works only because `updateUI()` writes to both; the starting Power
Plant at (5,5) overlaps the 2×2 Construction Yard at (4,4); each harvester
scans all 2,400 tiles every frame.

**5. Modular-build gaps** (`src/`): the War Factory's art assumes a 64px
footprint in places; `main.js` generates the sidebar in JavaScript, which is
what `sidebar.html` is meant to replace.

## One change made to hand-written code

`src/entities.js` — in `EntityManager.update`, harvesters originally hit
`continue` immediately after `updateHarvester(e, dt)`, which skipped the
movement block below it. They set a path and never followed it, so the economy
produced no credits at all. Changed to `if (harvester) {...} else if (target)
{...}` so both fall through to movement.

Verified before: credits 0, cargo 0, ore down 1 after 20s. After: credits 700,
ore down 10 — one complete cycle. If this code is re-pasted from its original
source, the bug comes back.

## Environment limits

These are proxy restrictions in the Claude Code sandbox, not repo problems:

- **Creating repositories is blocked.** `POST /user/repos` returns 403,
  "sessions are bound to their configured repositories."
- **Repository settings writes are blocked.** Changing visibility returns 403,
  "Repository settings writes are not permitted through this proxy."
- **Vercel is unreachable.** `api.vercel.com` fails at CONNECT with 403. No
  token, CLI, or plugin can deploy from inside the sandbox.
- Local `git` writes outside the session's designated repo are blocked, so
  pushes go through the GitHub API rather than `git push`.

## Manual steps only the owner can do

1. **Make the repo public** — https://github.com/iandwhite1988/rh-2-clone/settings
   → Danger Zone → Change repository visibility. It is currently private, so
   links do not open for anyone else, including other AI tools asked to review it.
2. **Deploy to Vercel** — https://vercel.com/new, import the repo, accept
   defaults. `vercel.json` already pins the preset and output directory; there
   is nothing to build and no environment variables to set.
3. **Verify on the deployed URL.** Everything above was verified on a local
   static server against files downloaded back from GitHub. That is not the
   same as the deployed site.

## How to verify a change

Do not trust a syntax check. Serve the files and load them in a browser:

```bash
cd <repo> && python3 -m http.server 4173 &
# Chromium is preinstalled; do not run `playwright install`
find /opt/pw-browsers -maxdepth 3 -name chrome
```

Then load the page with Playwright, listen for `pageerror` and console errors,
and confirm the app actually initialised by checking the global it sets —
`window.__ra2` for the prototype, `window.__game` for the modular build. When
filtering console noise, filter on `favicon` only: a filter matching `404`
hides a failed module load, which looks identical to a missing icon and means
the whole app failed to boot.

For anything touching the economy or movement, run it for 20–30 seconds and
read state back. Watching credits climb is what catches logic bugs that every
syntax check passes.

## After pushing, confirm it landed

A successful API response does not mean the repo contains what you sent. Read
files back and diff them:

```bash
curl -sS -H "Authorization: Bearer $GITHUB_TOKEN" \
     -H "Accept: application/vnd.github.raw" \
     "https://api.github.com/repos/iandwhite1988/rh-2-clone/contents/PATH" -o /tmp/remote
diff /tmp/remote <local> && echo match
```

A file omitted from a multi-file push is invisible otherwise — the push
succeeds, the repo keeps the old version, and the commit message says
otherwise. This happened once here with `src/renderer.js` and left
`advanced.html` dead until it was caught by a size mismatch.

## repo-publisher plugin

`repo-publisher/` is a Claude Code plugin encoding the above lessons so the
next agent does not rediscover them: three skills
(`publish-pasted-code`, `architecture-fit-check`, `browser-smoke-test`), two
Sonnet subagents (`github-publisher`, `integration-reviewer`), and a `/publish`
command.

Install with `cp -r repo-publisher ~/.claude/plugins/` then `/plugin` to
confirm it loaded. It is self-contained and can be moved to its own repository
once one can be created.
