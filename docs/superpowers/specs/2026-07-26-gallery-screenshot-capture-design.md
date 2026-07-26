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
| Output directory is gitignored; sweeps are regenerate-on-demand | Follows from "local review artifact". Staleness is acceptable by design; the index file's generatedAt plus each entry's capturedAt make it visible. |
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

Primary components (four numbered below). Full diff inventory: those four, plus
`package.json` (the script line), `.gitignore` (the output dir), the three
extraction-coupled updates named in item 1 (help capture guard file, screenshots-drift
path filter, required-path list), the `LOCAL_ONLY_ALLOWLIST` row named in item 3, and
the modified `scripts/help-screenshots.ts` (imports the extracted helpers), and one new
unit-test file, `tests/scripts/gallery-screenshots.test.ts` (§8.1).

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
   `help-screenshots.ts` imports these and deletes its local copies. The `CaptureTheme`
   type and `DEFAULT_EXPECT_STABLE_MS` (`help-screenshots.ts:13`) move with the helpers;
   `help-screenshots.ts` re-imports them. Manifest-specific logic (fixture ranges,
   frozen clocks, `themesFor`, the `waitFor ?? captureSelector ?? "body"` selector
   precedence at `help-screenshots.ts:150`) stays in `help-screenshots.ts`.

   **The move is NOT test-invisible.** `tests/help/capture-script.test.ts` source-scans
   `scripts/help-screenshots.ts` directly: the pinned sharp WebP settings
   (`capture-script.test.ts:14-20`), the `disableAnimations` body + its
   registered-before-goto ordering (`capture-script.test.ts:28-45`), and the
   `waitForQuiescence` recipe guard. The extraction task updates each guard to scan the
   file that now holds the asserted body (the new capture-core module for moved bodies;
   `help-screenshots.ts` keeps the call-site ordering assertions — `disableAnimations`
   is still invoked before `page.goto` in `captureEntryTheme`). Same assertions,
   relocated targets, in the same commit as the move.

   **CI coupling:** the committed help baselines become dependent on the new module, so
   the same commit adds the capture-core path to the screenshots-drift workflow's
   PR path filter (`.github/workflows/screenshots-drift.yml:30-35`) and to the
   structural required-path list at
   `tests/cross-cutting/ci-workflow-speedup.test.ts:82-105` — otherwise a later
   capture-core-only change would skip the
   per-PR drift gate. This is maintenance of the EXISTING help gate, not a new gallery
   CI surface (§1.1 unaffected).

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
   - One `BrowserContext` per theme. **Playwright-config `use` options do not reach a
     script-created context either** (default context viewport is 1280×720, not the
     project's 1280×800), so `browser.newContext()` passes every option explicitly,
     mirroring the help path's context construction (`help-screenshots.ts:231-238`):
     `baseURL: baseUrl`, `colorScheme: theme`, `viewport: { width: 1280, height: 800 }`,
     `locale: "en-US"`, `timezoneId: "America/New_York"`,
     `reducedMotion: "reduce"`. Pages per scenario.

<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->

3. **`tests/e2e/screenshots-gallery-capture.spec.ts` (new)** — one test calling
   `captureGallery()` (pattern: `tests/e2e/screenshots-help-capture.spec.ts`, which is a
   single `test()` invoking `captureAll()`), followed by postcondition assertions (§8.2).
   Its FIRST import is `./helpers/loadTestEnv` — `captureGallery()`'s import chain
   reaches server modules that throw at module evaluation without `.env.local` values
   (`HASH_FOR_LOG_PEPPER` et al., `lib/email/hashForLog.ts:6-13`); the gallery
   acceptance spec pins the same must-be-first pattern
   (`tests/e2e/attention-modal-gallery.spec.ts:42-44`).
   Because it is deliberately not CI-covered, the same commit adds a reasoned row to
   `LOCAL_ONLY_ALLOWLIST` in `tests/ci/_metaE2eWorkflowCoverage.test.ts` — the
   filesystem-walked coverage guard (its dark-spec assertion at
   `tests/ci/_metaE2eWorkflowCoverage.test.ts:155-157`) otherwise fails
   on any un-wired `tests/e2e/*.spec.ts`. The row's reason cites this spec's §1.1
   no-CI ratification.

4. **`playwright.screenshots.config.ts`** — new project:

   ```
   {
     name: "screenshots-gallery",
     testMatch: /screenshots-gallery-capture\.spec\.ts/,
     timeout: 1_800_000,
     use: { ...same Desktop Chrome block as "screenshots-help-capture": baseURL http://localhost:3004,
            colorScheme light, reducedMotion reduce, CAPTURE_LAUNCH_ARGS, locale en-US,
            timezoneId America/New_York, viewport 1280×800 }
   }
   ```

   - **No `dependencies` on the help setup project.** The help setup seeds show
     fixtures; the gallery needs no such seed (scenario data is fixture-built
     server-side in `partitionScenarios()`, and `requireDeveloper()` admits the
     fixture's `developer:true` JWT claim without an `admin_emails` row). A running,
     migrated local Supabase IS still a prerequisite: `signInAs` first deletes the
     fixture user DIRECTLY via the service-role Supabase admin client
     (`admin.auth.admin.deleteUser`, `tests/e2e/helpers/signInAs.ts:98-105`), then
     re-creates it through the test-auth route
     (`tests/e2e/helpers/signInAs.ts:48-66`), and the page gate calls the
     `is_session_live` / `is_developer` RPCs (`lib/auth/requireDeveloper.ts:172-200`).
     `pnpm preflight` already fail-louds on an unreachable local DB. Because the sweep
     churns the shared `fxav-developer@example.com` auth user, do not run it
     concurrently with another suite signing in as the same fixture.
   - The existing webServer entry is reused untouched: port 3004, prod build via
     `pnpm build` (= `scripts/with-admin-dev-flag.mjs next build`, `package.json:8`) with
     `ADMIN_DEV_PANEL_ENABLED: "true"` (`playwright.screenshots.config.ts:104`), so the
     build-gated gallery route (`scripts/with-admin-dev-flag.mjs:63`) is present.
     `reuseExistingServer: !CI` means repeat sweeps skip the build.
   - Timeout 1800 s (`timeout: 1_800_000`): the catalog is large — the gallery
     acceptance harness describes its walk as a 72-scenario sweep
     (`tests/e2e/attention-modal-gallery.spec.ts:156`) — and this test serially
     captures every rendered scenario × 2 themes plus quiescence waits, per-capture
     500 ms stabilization, and sharp encoding. 1800 s is a provisional ceiling, not a
     measurement; the implementation plan includes a timed full-sweep task that records
     the actual wall clock in the PR and tightens the ceiling to ~2× measured.

## 4. Capture sequence (per scenario × theme)

1. `installDeterminism(page, theme)` + `disableAnimations(page)` (init scripts, pre-nav).
2. `signInAs(page, DEVELOPER_FIXTURE, { baseUrl })` — once per context, before first goto.
3. Navigate to `<base>/admin/dev/attention-gallery?scenario=<id>` with the bounded
   3-attempt retry the acceptance harness already uses
   (`gotoScenario`, `tests/e2e/attention-modal-gallery.spec.ts:154-171`): the route's
   SSR can transiently blip under a long sweep; a reload absorbs the transient while
   the final attempt still throws.
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
   section rail at `ShowReviewSurface.tsx:867` also scrolls). Inside the dialog, find every
   scrollable descendant (`scrollHeight > clientHeight + 1`) and pick the one with the
   greatest `clientWidth * clientHeight` AREA. Height alone cannot discriminate: the
   rail and the content pane are siblings of the same stretched flex row and tie on
   `clientHeight`; the rail is a fixed `w-60` (240 px) while the content pane is
   `flex-1`, so area selects the content pane deterministically. Ties on area (none
   expected) break toward the LAST in document order (the content pane follows the
   rail). The selection is a pure function over
   `{scrollHeight, clientHeight, clientWidth}[]` so it is unit-testable (§8.1). If a
   scroller is selected: set its `scrollTop` to max, double-rAF, re-shoot →
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
- Filtered sweep: capture only the targeted scenarios, then run the **end-of-run
  reconciliation** that makes the invariant enforced rather than assumed — **after any
  run, the index lists exactly the currently-rendered scenarios whose files exist on
  disk, and the output dir contains no WEBP file the index does not reference** (the
  file universe of the reconciliation is `*.webp`; index.json itself is exempt).
  Reconciliation order:
  1. Build candidate entries: freshly captured scenarios (new files, new `capturedAt`)
     plus prior-index entries for non-targeted ids — with `label`/`tier`/`group`/`codes`
     REFRESHED from the current catalog (id is the join key; only `files` and
     `capturedAt` carry over), so index metadata always reflects the current catalog
     (§7 contract).
  2. Drop any candidate whose id is not in the current rendered set (renamed/removed
     scenario), and any carried-forward candidate with a missing referenced file
     (e.g. a previously crashed run) — a dropped entry's surviving files are deleted.
  3. Delete every WebP in the output dir not referenced by a surviving entry (covers
     stale `-overflow.webp` companions when a re-captured scenario no longer overflows,
     and unindexed leftovers of any origin). Index slots for absent overflow shots are
     null.
  4. Currently-rendered scenarios with no files (e.g. newly added, not targeted):
     OMITTED — a filtered run yields a partial index by design; the full sweep restores
     completeness. No placeholder entries.
  - `generatedAt` reflects the current run; each entry's `capturedAt` reflects when ITS
    files were shot, so carried-forward age stays visible (§1.1 staleness row).
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
      "codes": ["<string>", "..."],
      "capturedAt": "<ISO-8601 of the run that shot this entry's files>",
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
per the `rendered.push` shape (`buildSwitcherScenarios.ts:169`). `codes` is `string[]`,
not a catalog-code type — the catalog deliberately contains an uncataloged sentinel
(`GALLERY_UNCATALOGED_CODE`, `lib/dev/attentionScenarios/tier2.ts:431`). `excluded`
mirrors `partitionScenarios().excluded` so a reviewer sees what is deliberately absent.
Filenames are `<id>-<theme>[-overflow].webp`; scenario ids are filesystem-safe because
scenario validation enforces the id charset
(`lib/dev/attentionScenarios/validate.ts:313-318`).

## 8. Testing

TDD per task (invariant 1). Three layers:

1. **DB-free unit tests** (run in `pnpm test`):
   - filter parsing: comma splitting, trimming, dedup, unknown-id → throw naming valid
     ids, excluded-id → throw naming the exclusion reason, empty → full set.
   - filename/index.json derivation: given `partitionScenarios()` output, every
     rendered scenario yields exactly one entry with `<id>-<theme>.webp` names,
     null-able overflow slots, and `capturedAt` equal to the injected run timestamp
     (the derivation takes `now` as a parameter — fresh entries MUST carry it);
     `excluded` array passthrough. (Pure function over the real catalog — no browser,
     no DB; the scenario catalog itself is fixture data.)
   - anti-tautology posture: expected filenames in tests are derived from the catalog's
     actual ids (e.g. assert entry count equals `partitionScenarios().rendered.length`
     and spot-check a known id like `T2_MULTI_HOLD`'s), never a hardcoded full list that
     would silently pass when the derivation and the test share a bug — the assertion
     source is the catalog module, the subject is the derivation function.
   - scroll-container selection: the pure `{scrollHeight, clientHeight, clientWidth}[]`
     picker (§4 step 7). Failure modes caught: height-tie between rail and content pane
     must select the wider pane (the round-1 review defect); no scrollable candidate →
     null; single candidate → itself; area tie → last in document order.
   - index reconciliation (§6): every rule — stale overflow slot nulled + its file in
     the delete set, removed-id entry pruned (files in the delete set), non-targeted
     entry carried with metadata REFRESHED from the current catalog and `capturedAt`
     preserved, carried entry with a missing referenced file dropped, unreferenced
     on-disk file in the delete set, never-captured id omitted. The reconciliation is a
     pure function over (priorIndex, capturedEntries, renderedCatalog, filesOnDisk) →
     (index, filesToDelete); expected outputs derived from constructed fixtures, not
     mirrored from the implementation.
   - scenario-identity guard message: on label mismatch the constructed error names the
     scenario id and the stale-server remedy (§5). Failure mode caught: a silent
     fallback-to-index-0 sweep mislabeling every capture.
   - capture-core extraction: `tests/help/capture-script.test.ts` guards are UPDATED in
     the extraction commit to scan the file that now holds each asserted body (§3
     item 1) — same assertions, relocated read targets. The moved bodies get no
     additional unit tests; both capture suites exercise them.
<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->

2. **Env-bound capture spec** — `tests/e2e/screenshots-gallery-capture.spec.ts` is a
   Playwright spec under `tests/e2e/`, which `pnpm test` (vitest) never collects —
   the vitest include set is `tests/**/*.test.ts(x)` only (`BASE_INCLUDE`,
   `vitest.projects.ts:34`), so a `*.spec.ts` file is invisible to it
   (`vitest.config.ts:22` additionally drops env-bound `.test` files in the
   unit-suite CI lane). It runs only via `pnpm screenshot:gallery`, locally, on
   demand. **No CI workflow references it** (§1.1); the `LOCAL_ONLY_ALLOWLIST` row
   (§3 item 3) records that exemption structurally. The package script does not set or
   clear `GALLERY_SCENARIO`, so a user-filtered `GALLERY_SCENARIO=<id> pnpm
   screenshot:gallery` flows through to the same spec; the postconditions therefore
   BRANCH on the parsed filter state rather than assuming a full sweep. Always: index.json
   exists and parses; every NON-NULL `files` value exists on disk; the on-disk WebP
   count equals the index's non-null file references (no orphans); every entry's
   `capturedAt` parses as ISO-8601; the index's `viewport` equals the §1.1 1280×800
   matrix. Unfiltered additionally: entry count equals
   `partitionScenarios().rendered.length`. Filtered additionally: every targeted id has
   an entry whose `capturedAt` is from this run.
3. **Help-path regression (same-host pre/post comparison):** comparing a host capture
   against the COMMITTED baselines cannot prove the extraction changed nothing — the
   baselines are pinned-image linux/amd64 bytes and a dev-host capture legitimately
   diverges from them (AGENTS.md byte-comparison discipline), so "architecture noise"
   would mask a real regression. Instead: (a) BEFORE the extraction commit, run
   `pnpm screenshot:help` on this host and copy `public/help/screenshots/` aside to a
   scratch dir; (b) apply the extraction; (c) run the capture again on the same host and
   byte-compare against the aside copy — same host, same architecture, so any byte
   difference IS extraction-induced and fails the check; (d) `git restore
   public/help/screenshots/` so the committed amd64 baselines are untouched in the PR.

## 9. Non-goals

- No CI job, no committed screenshots, no drift gate, no Docker image pinning (§1.1).
- No mobile viewport, no per-theme filter, no PNG output, no GIF/video.
- No capture of excluded scenarios (they do not render in the modal by definition).
- No impeccable gate: no file under `app/` or `components/` is touched, no token block,
  no `DESIGN.md` change (invariant-8 surface definition).
- No new mutation surface in repo code: the script adds no route handler and no server
  action, so invariant-10 registries gain no row. Precision matters here: the sweep is
  NOT free of writes — `signInAs` churns the fixture user in Supabase Auth (admin-client
  delete, then route-based create; `tests/e2e/helpers/signInAs.ts:48-66`) — but those are
  pre-existing harness surfaces, unchanged by this feature. The gallery page's own
  `GalleryWriteGuard` containment (`page.tsx` header notes) is untouched, and the
  script performs no app-table mutation of its own.

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
| 9 Supabase call-boundary | No NEW Supabase call sites: the script's only Supabase touch is the existing `signInAs` helper (admin-client delete at `tests/e2e/helpers/signInAs.ts:98-105`, route create at `tests/e2e/helpers/signInAs.ts:48-66`), unchanged by this feature. |
| 10 mutation telemetry | N/A (§9). |
| 11 worktree | Work happens in `FX-worktrees/gallery-screenshot-capture`. |
