<!-- spec-lint: not-ui — dev-tooling spec; no app/ or components/ file is modified. Cited UI paths are read-only capture targets, not surfaces this spec changes. -->

# Attention-gallery screenshot capture (`pnpm screenshot:gallery`) — design

Date: 2026-07-26. Status: ratified (user-approved design, autonomous-ship authorized).

A durable local capture sweep: every rendered attention-gallery scenario, screenshotted
in the real published-show modal, both themes, written to a gitignored directory with a
machine-readable index so an agent (or a human) can review every modal state on demand.

## 1. Purpose

The attention gallery (`app/admin/dev/attention-gallery/page.tsx`) deep-links any
rendered scenario via `?scenario=<id>` (`page.tsx:48` →
`resolveInitialScenario`, `buildSwitcherScenarios.ts:194`). Nothing today captures
those states as images. This feature adds `pnpm screenshot:gallery`: a sweep that
produces a **local review artifact** — NOT a CI drift gate.

### 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| Local review artifact only: no CI job, no committed baselines, no byte-comparison gate, no Docker/amd64 pinning | User answer "Local review artifact" in the brainstorming session, 2026-07-26. AGENTS.md byte-gate discipline applies only to committed byte-compared baselines, which this feature deliberately has none of. |
| Capture matrix: 1280×800 desktop viewport, light + dark. No mobile viewport in v1 | User answer "Desktop, light+dark", 2026-07-26. |
| Approach: new project inside `playwright.screenshots.config.ts` reusing the port-3004 prod-build webServer | User answer "A: screenshots-harness project", 2026-07-26. |
| Output directory is gitignored; sweeps are regenerate-on-demand | Follows from "local review artifact". Staleness is acceptable by design; the index file's generatedAt makes it visible. |
| Shared capture helpers are extracted from `scripts/help-screenshots.ts` into a new capture-core module (§3; mechanical move, no behavior change) | Design approval, 2026-07-26. The help path keeps its exact current semantics; the help screenshot suite re-run is the regression proof (§8.3). |
| generatedAt in index.json uses `new Date().toISOString()` | This is a plain node/Playwright script, not a Workflow script; no determinism contract applies to a gitignored artifact. |

## 2. CLI surface

`package.json` (scripts block, alongside `screenshot:help` at `package.json:44`):

```
"screenshot:gallery": "ENABLE_TEST_AUTH=true TEST_AUTH_SECRET=test-secret-fixture playwright test -c playwright.screenshots.config.ts --project=screenshots-gallery"
```

Environment knobs (all optional):

| Env var | Storage | Write path | Read path | Effect |
| --- | --- | --- | --- | --- |
| `GALLERY_SCENARIO` | process env, per-invocation | user shell | the gallery capture script's filter parser (§3 item 2, §6) | Comma-separated rendered-scenario ids; restricts the sweep to those ids. Unset/empty → full sweep. |
| `SCREENSHOT_BASE_URL` | process env | user shell | capture env guard in the gallery script (same contract as `scripts/help-screenshots.ts:29`, the `SCREENSHOT_BASE_URL` read) | Overrides `http://localhost:3004`. |
| `TEST_AUTH_SECRET` | process env | package.json script line | capture env guard | Required; guard throws without it (mirrors `help-screenshots.ts` "TEST_AUTH_SECRET is required" throw). |

No other flags. There is no theme filter and no viewport knob in v1 (YAGNI; the sweep is
fast enough to always do both themes).

## 3. Architecture

Four files change / are added:

<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->

1. **`scripts/capture-core.ts` (new)** — extraction target. Moves, verbatim, the
   browser-side determinism + encoding helpers that are today module-private in
   `scripts/help-screenshots.ts`:
   - `installDeterminism` (`help-screenshots.ts:72`) — `data-theme` attribute init
     script + WebSocket no-op stub
   - `disableAnimations` (`help-screenshots.ts:118`) — pre-navigation animation/transition
     suppression style
   - `encodeWebp` (`help-screenshots.ts:173`) — sharp PNG→WebP (quality 90)
   - a generalized quiescence wait: `waitForQuiescence(page, {waitForSelector, stableMs})`
     with the same body as `help-screenshots.ts:149` (selector visible → `networkidle` →
     `fonts.ready` + double-rAF → stable-ms timeout), parameterized instead of
     `ManifestEntry`-typed.
   `help-screenshots.ts` imports these and deletes its local copies. Manifest-specific
   logic (fixture ranges, frozen clocks, `themesFor`) stays in `help-screenshots.ts`.

<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->

2. **`scripts/gallery-screenshots.ts` (new)** — exports `captureGallery(): Promise<void>`:
   - Scenario list: `partitionScenarios()`
     (`app/admin/dev/attention-gallery/buildSwitcherScenarios.ts:141`) — the same server
     helper the route calls. Never a hardcoded id list; a catalog change flows through
     automatically (same derivation posture as `tests/e2e/attention-modal-gallery.spec.ts`).
   - Auth: `signInAs(page, DEVELOPER_FIXTURE, { baseUrl })`
     (`tests/e2e/helpers/signInAs.ts:43`), fixture
     `{ email: "fxav-developer@example.com", isAdmin: true, label: ... }` — the JWT-arm
     developer identity used by `tests/e2e/attention-modal-gallery.spec.ts:60`; no DB
     seed needed (`requireDeveloper()` admits the `developer:true` claim).
   - Browser: own `chromium.launch({ args: CAPTURE_LAUNCH_ARGS })`
     (`scripts/capture-launch-args.ts:22`) exactly like `captureAll()`
     (`help-screenshots.ts:215`, `help-screenshots.ts:225`) — Playwright-config launchOptions do not reach
     a script-launched browser.
   - One `BrowserContext` per theme (`colorScheme: theme`), pages per scenario.

<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->

3. **`tests/e2e/screenshots-gallery-capture.spec.ts` (new)** — one test calling
   `captureGallery()` (pattern: `tests/e2e/screenshots-help-capture.spec.ts`, which is a
   single `test()` invoking `captureAll()`).

4. **`playwright.screenshots.config.ts`** — new project:

   ```
   {
     name: "screenshots-gallery",
     testMatch: /screenshots-gallery-capture\.spec\.ts/,
     timeout: 300_000,
     use: { ...same Desktop Chrome block as "screenshots-help-capture": baseURL http://localhost:3004,
            colorScheme light, reducedMotion reduce, CAPTURE_LAUNCH_ARGS, locale en-US,
            timezoneId America/New_York, viewport 1280×800 }
   }
   ```

   - **No `dependencies`.** The help setup project seeds show fixtures; the gallery needs
     no DB rows (scenario data is fixture-built server-side in `partitionScenarios()`,
     and the developer fixture authenticates via JWT claim alone).
   - The existing webServer entry is reused untouched: port 3004, prod build via
     `pnpm build` (= `scripts/with-admin-dev-flag.mjs next build`, `package.json:8`) with
     `ADMIN_DEV_PANEL_ENABLED: "true"` (`playwright.screenshots.config.ts:104`), so the
     build-gated gallery route (`scripts/with-admin-dev-flag.mjs:63`) is present.
     `reuseExistingServer: !CI` means repeat sweeps skip the build.
   - Timeout 300 s: the sweep serially captures every rendered scenario × 2 themes in one
     test; sized like the help-capture bump (180 s for a smaller manifest) with headroom.

## 4. Capture sequence (per scenario × theme)

1. `installDeterminism(page, theme)` + `disableAnimations(page)` (init scripts, pre-nav).
2. `signInAs(page, DEVELOPER_FIXTURE, { baseUrl })` — once per context, before first goto.
3. `page.goto("<base>/admin/dev/attention-gallery?scenario=<id>")`, `domcontentloaded`.
4. **Scenario-identity guard (§5).**
5. Quiescence wait: dialog `[data-testid="published-show-review-modal"]` visible →
   `networkidle` → `fonts.ready` + double-rAF → 500 ms stable wait
   (`DEFAULT_EXPECT_STABLE_MS`, `scripts/help-screenshots.ts:13`).
6. `page.screenshot({ type: "png" })` — **viewport shot** (1280×800, modal as-seen; NOT
   `fullPage`, which is meaningless for a fixed overlay).
7. **Overflow companion shot.** The modal panel is height-capped
   (`max-h-[85vh]`/`sm:max-h-[80vh]`, `components/admin/review/ReviewModalShell.tsx:623`)
   and its content pane scrolls internally
   (`overflow-y-auto`, `components/admin/review/ShowReviewSurface.tsx:1030`; the ≥lg
   section rail at `ShowReviewSurface.tsx:867` also scrolls). Inside the dialog, find the scrollable
   descendant with the largest `clientHeight` where `scrollHeight > clientHeight + 1`
   (largest-wins deliberately selects the content pane over the narrow rail). If one
   exists: set its `scrollTop` to max, double-rAF, re-shoot →
   `<id>-<theme>-overflow.webp`. If none: no companion file.
8. `encodeWebp` both PNGs, write to output dir (§6).
9. Append the scenario's index.json entry (§7).

## 5. Scenario-identity guard

`resolveInitialScenario` silently falls back to index 0 on an unknown id
(`buildSwitcherScenarios.ts:194` — returns `null`, switcher starts at 0). Because the
script derives ids from the same `partitionScenarios()` the server calls, a mismatch is
impossible **against the same build** — but `reuseExistingServer` can leave a *stale*
server running an older catalog. Undetected, that captures wrong-scenario images labeled
with new ids.

Guard: before shooting, assert the control bar
(`[data-testid="attention-switcher-controls"]`,
`components/admin/dev/SwitcherControls.tsx:74`) renders the expected scenario `label`
(its aria-live region prints the active scenario's human label,
`SwitcherControls.tsx:89-93`). On mismatch, fail the sweep with an error naming the
scenario id and the remedy ("stale server on :3004; stop it or rebuild"). Label
collisions across scenarios would weaken the guard to "some scenario with this label";
that residual risk is accepted — ids are not printed in the control bar, and the guard's
job is only to catch the stale-build/fallback-to-0 class.

Guard conditions for other inputs: `GALLERY_SCENARIO` naming an id not in the rendered
set → throw before launching the browser, listing valid ids (an excluded id is named in
the message as excluded, with its reason). Empty rendered set (catalog regression) →
throw. Missing `TEST_AUTH_SECRET` → throw (existing contract).

## 6. Output directory + filter lifecycle

- Output: `screenshots/attention-gallery/` under the repo root. New `.gitignore` entry:
  `/screenshots/` (top-level only; does NOT shadow the committed
  `public/help/screenshots/`).
- Full sweep (no `GALLERY_SCENARIO`): delete the directory's contents first, then
  recreate — no orphaned files from renamed/removed scenarios.
- Filtered sweep: overwrite only the targeted scenarios' files; index.json is
  rewritten whole (entries for non-targeted scenarios keep their previous `files` data
  read from the prior index.json when present; absent prior index → index lists only
  captured scenarios). `generatedAt` always reflects the current run.
- Filter parsing: split on `,`, trim, drop empties; result deduplicated. Order follows
  the rendered (group-sorted) order, not the filter's.

## 7. index.json schema

```json
{
  "generatedAt": "<ISO-8601>",
  "viewport": { "width": 1280, "height": 800 },
  "themes": ["light", "dark"],
  "scenarios": [
    {
      "id": "<scenario id>",
      "label": "<human label>",
      "tier": "<tier>",
      "group": "<ScenarioGroupId>",
      "codes": ["<MessageCode>", "..."],
      "files": {
        "light": "t2-multi-hold-light.webp",
        "dark": "t2-multi-hold-dark.webp",
        "lightOverflow": "t2-multi-hold-light-overflow.webp or null",
        "darkOverflow": "... or null"
      }
    }
  ],
  "excluded": [ { "id": "...", "label": "...", "reason": "structural|cut|global" } ]
}
```

`id`, `label`, `tier`, `group`, `codes` come straight from
`GallerySwitcherScenario` (`lib/dev/galleryModalTypes.ts:34`); fields populated
per the `rendered.push` shape (`buildSwitcherScenarios.ts:169`). `excluded` mirrors `partitionScenarios().excluded` so a reviewer sees what
is deliberately absent. Filenames are `<id>-<theme>[-overflow].webp`; scenario ids are
already filesystem-safe slugs (kebab-case, enforced by their use in `?scenario=` URLs).

## 8. Testing

TDD per task (invariant 1). Three layers:

1. **DB-free unit tests** (run in `pnpm test`):
   - filter parsing: comma splitting, trimming, dedup, unknown-id → throw naming valid
     ids, excluded-id → throw naming the exclusion reason, empty → full set.
   - filename/index.json derivation: given `partitionScenarios()` output, every
     rendered scenario yields exactly one entry with `<id>-<theme>.webp` names and
     null-able overflow slots; `excluded` array passthrough. (Pure function over the
     real catalog — no browser, no DB; the scenario catalog itself is fixture data.)
   - anti-tautology posture: expected filenames in tests are derived from the catalog's
     actual ids (e.g. assert entry count equals `partitionScenarios().rendered.length`
     and spot-check a known id like `T2_MULTI_HOLD`'s), never a hardcoded full list that
     would silently pass when the derivation and the test share a bug — the assertion
     source is the catalog module, the subject is the derivation function.
   - capture-core extraction: `scripts/help-screenshots.ts` type-checks and its existing
     unit-level guards still pass; no new unit tests for the moved bodies (they are
     exercised by both capture suites).
<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->

2. **Env-bound capture spec** — `tests/e2e/screenshots-gallery-capture.spec.ts` is a
   Playwright spec under `tests/e2e/`, which `pnpm test` (vitest) never collects —
   the vitest include set is `tests/**/*.test.ts(x)` only (`BASE_INCLUDE`,
   `vitest.projects.ts:34`), so a `*.spec.ts` file is invisible to it
   (`vitest.config.ts:22` additionally drops env-bound `.test` files in the
   unit-suite CI lane). It runs only via `pnpm screenshot:gallery`, locally, on
   demand. **No CI workflow references it** (§1.1).
3. **Help-path regression:** after the capture-core extraction, run
   `pnpm screenshot:help` locally and `git status public/help/screenshots/` — the
   committed WebPs must be byte-identical (per the AGENTS.md reviewer-caveat pattern,
   restore via `git restore public/help/screenshots/` after verification if the host
   architecture dirties them; the extraction claim is proven by the run completing and
   the diff being architecture-noise-only or empty).

## 9. Non-goals

- No CI job, no committed screenshots, no drift gate, no Docker image pinning (§1.1).
- No mobile viewport, no per-theme filter, no PNG output, no GIF/video.
- No capture of excluded scenarios (they do not render in the modal by definition).
- No impeccable gate: no file under `app/` or `components/` is touched, no token block,
  no `DESIGN.md` change (invariant-8 surface definition).
- No mutation surface: the script performs only GETs against a dev-gated route; the
  gallery's own `GalleryWriteGuard` containment (`page.tsx` header notes) is untouched.
  Invariant-10 registries are not in scope.

## 10. Invariant compliance

| Invariant | Disposition |
| --- | --- |
| 1 TDD | §8; each task red→green→commit. |
| 2 advisory locks | N/A — no mutation of locked tables. |
| 3 email canonicalization | N/A. |
| 4 no global cursor | N/A. |
| 5 no raw codes in UI | N/A — no UI. `codes` in index.json is an agent-facing artifact, not user-visible UI. |
| 6 commit style | Bare `infra:` for the tooling/config/script commits (the established M0 convention per AGENTS.md rule 6); `docs:` for spec/plan documents. |
| 7 spec canonical | This spec; no master-spec conflict (dev tooling, outside §12.4 etc.). |
| 8 impeccable | N/A (§9). |
| 9 Supabase call-boundary | N/A — no Supabase client calls in the script (auth goes through the test-auth HTTP route via `signInAs`). |
| 10 mutation telemetry | N/A (§9). |
| 11 worktree | Work happens in `FX-worktrees/gallery-screenshot-capture`. |
