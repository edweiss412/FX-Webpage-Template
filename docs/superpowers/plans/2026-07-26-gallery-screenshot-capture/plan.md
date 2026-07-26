<!-- spec-lint: not-ui — dev-tooling plan; no app/ or components/ file is modified. -->

# Attention-gallery screenshot capture — implementation plan

Spec: `docs/superpowers/specs/2026-07-26-gallery-screenshot-capture-design.md`
(APPROVED by Codex adversarial review round 7, 2026-07-26). The spec is canonical;
this plan sequences it into TDD tasks. Section references (§) below are spec sections.

Branch: `feat/gallery-screenshot-capture` (worktree `FX-worktrees/gallery-screenshot-capture`).

## Pre-draft verification

Every file/line named here was grepped against the live tree during the spec's seven
review rounds (spec carries the citations). Additional plan-time checks:

- `tests/help/capture-script.test.ts` (117 lines) source-scans `scripts/help-screenshots.ts`
  in three guard blocks (sharp settings :14-20, disableAnimations + ordering :28-45,
  waitForQuiescence recipe).
- `LOCAL_ONLY_ALLOWLIST` rows are `"tests/e2e/<file>": <REASON_CONST>` (string constants,
  `tests/ci/_metaE2eWorkflowCoverage.test.ts:35-48`).
- `REQUIRED_PATHS` for the drift workflow lives at
  `tests/cross-cutting/ci-workflow-speedup.test.ts:82-105` (quoted-glob strings).
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
- Unit tests land in `tests/scripts/gallery-screenshots.test.ts` (vitest `BASE_INCLUDE`
  collects `tests/**/*.test.ts`, `vitest.projects.ts:34`).

## Meta-test inventory

- EXTENDS `tests/ci/_metaE2eWorkflowCoverage.test.ts` — new `LOCAL_ONLY_ALLOWLIST` row
  (Task 3).
- EXTENDS `tests/cross-cutting/ci-workflow-speedup.test.ts` — capture-core path in
  `REQUIRED_PATHS` (Task 1).
- UPDATES `tests/help/capture-script.test.ts` — guard read-targets relocate with the
  extraction (Task 1).
- Auth/advisory-lock/admin-alert/tile registries: none apply — no auth helper, no
  locked-table mutation, no admin alert, no tile rendering in scope. Mutation-surface
  observability (invariant 10): no new route/action, so the filesystem-walked discovery
  in `tests/log/_metaMutationSurfaceObservability.test.ts` gains no subject.

## e2e harness-readiness (mandatory checklist)

- **Server boot:** the existing webServer in `playwright.screenshots.config.ts` — prod
  build via `pnpm build` (with-admin-dev-flag wrapper) + `next start` on port 3004,
  `ADMIN_DEV_PANEL_ENABLED=true`, `reuseExistingServer: !CI`.
- **Readiness gate before first assertion:** per scenario — bounded 3-attempt goto
  (`gotoScenario` pattern, `tests/e2e/attention-modal-gallery.spec.ts:154-171`), dialog
  `[data-testid="published-show-review-modal"]` visible, control-bar label equality
  (§5 identity guard), THEN quiescence (networkidle + fonts.ready + double-rAF +
  500 ms). Never networkidle alone.
- **Detach-safety:** no element handle is retained across evaluates or navigations —
  the overflow protocol re-identifies its target by scan tag (next bullet), and the
  identity guard re-queries the control bar fresh per attempt. No sampler outlives
  its page.
- **Picker bridge (Node test ↔ browser execution):** Playwright serializes only the
  pageFunction — arguments cannot carry callables — so the picker never crosses into
  the page. Two-evaluate protocol instead: evaluate #1 (self-contained pageFunction)
  walks the dialog's descendants in document order, TAGS each scrollable candidate
  with `data-gallery-scan-idx="<i>"`, and returns the
  `{scrollHeight, clientHeight, clientWidth}` metrics array to Node; Node runs the
  unit-tested `pickScrollContainer` on the metrics; evaluate #2 queries
  `[data-gallery-scan-idx="<winner>"]`, sets max `scrollTop`, and strips ALL scan
  tags (attributes never paint, and both evaluates run on the same settled page with
  no navigation between — re-identification is by tag, not retained handle). Picker
  logic exists exactly once, in Node, tested.

## Tasks (TDD; one commit each, conventional style)

### Task 0 — pre-extraction help baseline (no repo change)

Run `pnpm screenshot:help`; copy `public/help/screenshots/` to the scratchpad
(`gallery-ship/help-baseline-pre/`). Then `git restore public/help/screenshots/`.
This is the §8.3 same-host "before" leg. No commit (nothing changes).

### Task 1 — capture-core extraction (`infra:`)

RED: edit the three `tests/help/capture-script.test.ts` guards to read the asserted
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
bodies from `scripts/capture-core.ts` (sharp settings, disableAnimations body; the
registered-before-goto ORDER guard keeps reading `help-screenshots.ts` — the call site
stays there). Tests fail (file absent).
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
GREEN: create `scripts/capture-core.ts` — move `installDeterminism`,
`disableAnimations`, `encodeWebp`, `CaptureTheme`, `DEFAULT_EXPECT_STABLE_MS`, and a
parameterized `waitForQuiescence(page, {waitForSelector, stableMs})` (§3 item 1);
`help-screenshots.ts` imports them (its `ManifestEntry` selector precedence stays
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
local). Same commit: add `"scripts/capture-core.ts"` to
`.github/workflows/screenshots-drift.yml` paths and to `REQUIRED_PATHS` in
`tests/cross-cutting/ci-workflow-speedup.test.ts`.
VERIFY: `pnpm vitest run tests/help/capture-script.test.ts tests/cross-cutting/ci-workflow-speedup.test.ts`;
typecheck. §8.3 "after" leg runs in Task 5.

### Task 2 — pure units (ONE `infra:` commit; tests authored first within it)

<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
File: `scripts/gallery-screenshots.ts` (pure parts) + `tests/scripts/gallery-screenshots.test.ts`.
TDD each unit in spec §8.1 order:

1. `parseScenarioFilter(raw, partition)` — comma/trim/dedup/empty→full; unknown id →
   throw listing valid ids; excluded id → throw naming its exclusion reason; empty
   RENDERED set (catalog regression) → throw. Filtered result preserves the rendered
   (group-sorted) catalog order, never the filter-input order — asserted with a
   filter given in reversed order.
1b. `prepareRun(env, partition, now)` — the pre-launch composition (filter parse +
   catalog guard + entry derivation + capture-env resolution): all §5 input-guard
   throws happen HERE, and `captureGallery` calls it BEFORE `chromium.launch` by
   construction (the browser adapter receives an already-validated plan). Env
   contract tested here too: missing `TEST_AUTH_SECRET` → throw;
   `SCREENSHOT_BASE_URL` set → used as baseUrl; unset → default
   `http://localhost:3004` (spec §2). Unit tests drive prepareRun directly.
1c. identity-guard message constructor — on label mismatch the built error names the
   scenario id and the stale-server remedy (§5); failure mode: silent fallback-to-0
   sweep mislabeling every capture.
2. `deriveIndexEntries(partition, now)` — one entry per rendered scenario;
   `<id>-<theme>.webp` names; nullable overflow slots; `capturedAt === now`; excluded
   passthrough. Anti-tautology: assert count === `partitionScenarios().rendered.length`
   and spot-check `T2_MULTI_HOLD.id`; never a mirrored hardcoded list.
2b. `buildIndex(entries, excluded, now)` — the §7 ROOT shape: `generatedAt === now`,
   `viewport === {width: 1280, height: 800}`, `themes === ["light", "dark"]`,
   scenarios + excluded arrays. Failure mode: a root field silently dropped.
3. `pickScrollContainer(candidates)` — pure over
   `{scrollHeight, clientHeight, clientWidth}[]`: overflow predicate
   (`scrollHeight > clientHeight + 1`), greatest area wins, tie → LAST in document
   order, none → null. Must encode the round-1 defect: height-tie rail vs pane →
   pane (wider) wins.
4. `loadPriorIndex(readFn, path)` — absent → `{prior: null, warning: null}`;
   unreadable/malformed/schema-invalid → `{prior: null, warning: <one line>}`.
5. `reconcile(prior, captured, renderedCatalog, filesOnDisk)` → `{index, filesToDelete}`
   — every §6 rule: metadata refresh on carry (id join key; files+capturedAt carry),
   removed-id prune + files to delete, missing-file entry drop, unreferenced `*.webp`
   to delete (index.json + `.staging/` exempt), never-captured omitted, null prior =
   empty prior.
6. Finalize orchestrator over injected fs adapter
   (`read/mkdir/write/rename/delete/list`) with a recording fake: order test (staging
   discard first → staging-only writes → renames+deletes → index LAST) and aborted-run
   test (zero canonical mutation). No full-sweep pre-clear exists. The orchestrator
   also takes an injected `warn` sink; when `loadPriorIndex` returns a warning the
   recording fake asserts exactly one line is emitted (§6 caller-prints obligation).

### Task 3 — capture spec + harness wiring + browser flow (one TDD task, `infra:`)

The browser sweep is env-bound, so its failing test IS the capture spec (invariant 1:
test before implementation, inside one task/commit).

RED (all wiring lands first; the test RUNS and FAILS):

<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
- `tests/e2e/screenshots-gallery-capture.spec.ts` — FIRST import
  `./helpers/loadTestEnv`; one `test()` calling `captureGallery()` then the §8.2
  postconditions: always-block (index parses; `light`/`dark` non-null; every non-null
  file exists; WebP count === non-null references; `capturedAt` ISO on every entry;
  root `viewport` === 1280×800, root `themes` === `["light","dark"]`, root
  `generatedAt` ISO) + unfiltered branch (count === rendered.length) / filtered branch
  (targeted ids present with this-run `capturedAt`).
- `screenshots-gallery` project in `playwright.screenshots.config.ts`
  (testMatch, `timeout: 1_800_000`, Desktop Chrome use-block mirroring
  screenshots-help-capture, no dependencies).
- `package.json`: `screenshot:gallery` script (ENABLE_TEST_AUTH + TEST_AUTH_SECRET
  inline, `--project=screenshots-gallery`).
- `.gitignore`: `/screenshots/` (Edit tool, not `echo >>`; verify with
  `git check-ignore -v screenshots/attention-gallery/index.json`).
- `LOCAL_ONLY_ALLOWLIST` row with a reason citing spec §1.1 (without it,
  `tests/ci/_metaE2eWorkflowCoverage.test.ts` fails — run it red first to prove the
  guard bites, then add the row).
- `captureGallery()` exists but is the minimal stub (`prepareRun` then throw
  "not implemented"). Run `pnpm screenshot:gallery` → the test FAILS. Record the
  failure output.

GREEN (same task, same commit): implement the sweep in
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
`scripts/gallery-screenshots.ts` — `prepareRun` BEFORE `chromium.launch({args:
CAPTURE_LAUNCH_ARGS})`; per theme SEQUENTIALLY: fresh context with the full §3 item 2
options (baseURL, colorScheme, viewport 1280×800, locale, timezoneId, reducedMotion),
`signInAs(page, DEVELOPER_FIXTURE, {baseUrl})`; then ONE PAGE PER SCENARIO — each page:
`installDeterminism(page, theme)` + `disableAnimations(page)` registered BEFORE
navigation (capture-core imports), goto retry, identity guard, quiescence, viewport
shot, overflow companion (the harness-readiness picker bridge: tag-scan evaluate →
Node-side tested `pickScrollContainer` → tag-targeted scroll evaluate), page CLOSED before the next
scenario; context CLOSED before the next theme's `signInAs` (session revocation);
staged writes; finalize via the Task-2 orchestrator (which prints any loader warning
through its `warn` sink). Run `pnpm screenshot:gallery` → test PASSES.

VERIFY: `pnpm vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts tests/help/playwright-config.test.ts`;
`pnpm typecheck`; eslint on changed files.

### Task 4 — full-sweep measurement + review sample (`infra:` only if the timeout is amended)

Run `pnpm screenshot:gallery` (server builds once). Record wall clock; verify §8.2
postconditions passed; spot-open several WebPs (light+dark+overflow) to confirm the
modal is actually in frame. Re-run with `GALLERY_SCENARIO=<one id>` to exercise the
filtered path against the fresh index. Timeout amendment protocol (measurement-driven
config constant — TDD RED/GREEN does not apply, the rerun is the verification): if
measured < 900 s, set the project timeout to ~2× measured, RERUN the full sweep under
the new ceiling to prove it green, and commit `infra:` with the measurement in the
message; otherwise keep 1_800_000 and no commit. Either way the measurement goes in
the PR body.

### Task 5 — close-out gates

- §8.3 "after" leg: `pnpm screenshot:help`, byte-compare against Task 0's aside copy
  (same host/arch), then `git restore public/help/screenshots/`.
- Full local suite `pnpm test`; `pnpm typecheck` (single root tsconfig covers all TS
  incl. Playwright specs, `package.json:29`); eslint;
  `pnpm format:check`.
- Whole-diff Codex cross-model review (fresh-eyes brief, split-scope if large) to
  APPROVE.
- Push; `gh pr create`; real CI green (all twelve required contexts REPORTED);
  `gh pr merge --merge`; ff local main; verify `0  0`.

## Deliberately out of scope

Spec §9 non-goals; DEFERRED.md/BACKLOG.md entries none — nothing deferred.
