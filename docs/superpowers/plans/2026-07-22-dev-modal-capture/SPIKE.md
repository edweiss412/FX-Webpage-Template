# Task 1 spike — capture-library decision (spec §3.3/§3.4)

Run: `pnpm exec tsx scripts/devcapture-spike.mts` (2026-07-22, real dev server on 127.0.0.1:3000, real published review modal, seeded show via `seedShowWithCrew`, `settleDashboardAdminState`, developer fixture sign-in, both inner panes overflowed with 2000/3000 px filler + sentinel divs, clone-expanded capture, programmatic pngjs sentinel scan).

## Results (verbatim run output)

```
INFO html-to-image plain 1024x640 382ms
FAIL html-to-image: 1024x4939 rail=0px content=0px (485ms)
INFO modern-screenshot plain 1024x640 497ms
FAIL modern-screenshot: 1024x4938 rail=0px content=0px (487ms)
INFO html2canvas plain 1024x640 536ms
PASS html2canvas: 1024x4939 rail=2880px content=2760px (601ms)
```

## Decision: `html2canvas`

| Criterion (§3.3) | html-to-image | modern-screenshot | html2canvas |
| --- | --- | --- | --- |
| (a) full-height clone expansion | image is full-height but content BLANK (sentinels 0 px) | same — blank raster | PASS — both sentinels found (2880/2760 px) |
| (b) CSS fidelity on repo styles | n/a (blank) | n/a (blank) | visually faithful: header, section panels, rail, tokens, rounded corners (preview inspected) |
| (c) cost | 31.5 kB IIFE | ~90 kB | 360 kB IIFE — acceptable: dev-only surface, loaded via dynamic `import()` inside `captureElementPng` so it never enters the admin bundle for non-capture flows |
| capture time (expanded, 4939 px) | — | — | ~600 ms |

Both SVG-foreignObject engines (html-to-image, modern-screenshot) produced a correctly-sized but entirely blank raster against this app's CSS in Next dev — failure is wholesale, not sentinel-specific. html2canvas's DOM-walking renderer handles it.

## Clone-override list (consumed by Task 7 `captureElementPng`)

On a `cloneNode(true)` of the shell panel, mounted offscreen (`position: fixed; left: -100000px; top: 0`), width pinned to the live panel's `getBoundingClientRect().width`:

- panel clone: `max-height: none; height: auto; overflow: visible` (the panel ships `overflow-clip` — without lifting it, spilled pane content clips at the panel box)
- each of `[data-testid$="-review-rail"]`, `[data-testid$="-review-content"]`, `[data-testid$="-review-main"]` inside the clone: `overflow: visible; max-height: none; height: auto`
- capture the CLONE with `html2canvas(clone, { scale: min(finite(dpr) ? dpr : 1, 2) })`, then remove it (try/finally)

## Operational findings (bind the Task 7-9 implementations)

1. **React reconciliation wipes foreign DOM injected into the panes.** Sentinels appended in a separate earlier step vanished before capture (live `scrollHeight` dropped back to 1707). The e2e MUST inject filler/sentinels in the same `page.evaluate` tick as (or immediately before) triggering capture, and treat sentinel-absence-in-live-DOM as a harness bug.
2. **tsx-serialized `page.evaluate` callbacks need `window.__name` stubbed** (`page.addInitScript("window.__name = (f) => f;")`) — esbuild keepNames wrapper leaks into the serialized function (affects any tsx-driven Playwright script; the Playwright test runner itself is unaffected).
3. **html2canvas ESM bundle exposes `.default`** — unwrap when loading via IIFE global; the Task 7 dynamic `import("html2canvas")` gets the callable directly.
4. Dashboard state: real-app modal requires `settleDashboardAdminState()` (onboarding otherwise swallows `/admin?show=<slug>`).
