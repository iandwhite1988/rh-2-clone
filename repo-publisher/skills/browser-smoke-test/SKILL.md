---
name: browser-smoke-test
description: Loads a web page in a real headless browser to confirm it actually boots — capturing uncaught exceptions, console errors, failed module loads, and a screenshot — before claiming a change works. Use this after publishing or editing any HTML/JS/canvas project, whenever you are about to tell the user something "works" or "is done", and whenever a page mysteriously renders blank or a script seems not to run. A passing syntax check or green build is not evidence the page runs, so reach for this instead of asserting success.
---

# Smoke-testing in a real browser

`node --check` proves a file parses. A green build proves it compiled. Neither
tells you the page boots — a module that 404s, a constructor that throws on the
first frame, or a `getElementById` returning null all produce a blank screen
with a clean build.

Loading the page in a browser takes about thirty seconds and converts "should
work" into "I watched it work".

## Setup

Chromium is typically preinstalled in these environments and Playwright is
configured to find it. Do not run `playwright install`.

```bash
# Serve the directory you want to test — the published copy, not your
# working tree, if you are verifying something you just pushed.
cd <dir> && python3 -m http.server 4173 &

# Playwright's node package, if not already present
npm install playwright --no-audit --no-fund
```

Locate the browser binary rather than assuming a path, since the version suffix
changes:

```bash
find /opt/pw-browsers -maxdepth 3 -name chrome -o -maxdepth 3 -name headless_shell
```

## The test

```js
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '<path from find>' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', async (d) => { errors.push('DIALOG: ' + d.message()); await d.dismiss(); });

  await page.goto('http://localhost:4173/', { waitUntil: 'load' });
  await page.waitForTimeout(1500);

  // Did the app actually initialise? Check a global it sets, not just the DOM.
  const booted = await page.evaluate(() => typeof window.__app !== 'undefined');

  // Frame rate, for anything animated.
  const fps = await page.evaluate(() => new Promise((r) => {
    let f = 0; const t0 = performance.now();
    (function tick() {
      f++;
      performance.now() - t0 > 1500
        ? r(Math.round(f / (performance.now() - t0) * 1000))
        : requestAnimationFrame(tick);
    })();
  }));

  console.log({ booted, fps, errors: errors.length ? errors : 'none' });
  await page.screenshot({ path: 'smoke.png' });
  await browser.close();
})();
```

## Reading the result honestly

**Filter console noise carefully, or not at all.** It is tempting to suppress
`favicon` and `404` messages as harmless. A missing favicon is harmless; a
404 on `src/main.js` means the entire application failed to load, and a filter
matching `404` hides both identically. If you filter, filter on `favicon` only
— then a genuine module 404 still reaches you.

**"No errors" is not "it works".** A page can throw nothing and still be inert.
That is why the test checks for a global the app sets on successful init. If
the app exposes nothing, add a line to it that does — a single
`window.__app = app` is cheap and makes every future check trustworthy.

**Look at the screenshot.** Automated assertions miss things a glance catches
instantly: art drawn outside its footprint, an element off-screen, everything
rendering in the top-left corner because a coordinate system is wrong.

## Driving it, not just loading it

Booting is the floor. When the change touched behaviour, exercise it — click
the button, run the simulation for thirty seconds, then read state back:

```js
await page.evaluate(() => document.querySelector('[data-type="power"]').click());
await page.waitForTimeout(20000);
const state = await page.evaluate(() => ({ credits: window.__app.credits }));
```

Watching a number move is what catches the logic bugs — a resource loop that
never pays out, a unit that sets a destination and never travels to it. Those
pass every syntax check ever written.
