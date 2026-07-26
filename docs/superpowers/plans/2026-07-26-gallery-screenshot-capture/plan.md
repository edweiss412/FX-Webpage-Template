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
  (Task 4).
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
- **Detach-safety:** the overflow scan + scroll runs as ONE `page.evaluate` over the
  live DOM (no retained element handles across navigation); the identity guard
  re-queries the control bar fresh per attempt. No sampler outlives its page.

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
typecheck. §8.3 "after" leg runs in Task 6.

### Task 2 — pure units (`test:` then `infra:`, or one `infra:` commit with tests-first inside)

<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
File: `scripts/gallery-screenshots.ts` (pure parts) + `tests/scripts/gallery-screenshots.test.ts`.
TDD each unit in spec §8.1 order:

1. `parseScenarioFilter(raw, partition)` — comma/trim/dedup/empty→full; unknown id →
   throw listing valid ids; excluded id → throw naming its exclusion reason.
2. `deriveIndexEntries(partition, now)` — one entry per rendered scenario;
   `<id>-<theme>.webp` names; nullable overflow slots; `capturedAt === now`; excluded
   passthrough. Anti-tautology: assert count === `partitionScenarios().rendered.length`
   and spot-check `T2_MULTI_HOLD.id`; never a mirrored hardcoded list.
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
   test (zero canonical mutation). No full-sweep pre-clear exists.

### Task 3 — captureGallery() browser flow (`infra:`)

<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
Wire the impure sweep in `scripts/gallery-screenshots.ts`: capture env guard
(TEST_AUTH_SECRET throw, SCREENSHOT_BASE_URL default `http://localhost:3004`);
`chromium.launch({args: CAPTURE_LAUNCH_ARGS})`; per theme SEQUENTIALLY — full context
options (§3 item 2: baseURL, colorScheme, viewport 1280×800, locale, timezoneId,
reducedMotion), `signInAs(page, DEVELOPER_FIXTURE, {baseUrl})`, capture every
selected scenario (goto retry → identity guard → quiescence → viewport shot →
overflow companion via `pickScrollContainer` + max scroll + double-rAF), CLOSE context
before next theme's signInAs (§3 session-revocation constraint); stage writes;
finalize via the Task-2 orchestrator. Unit-level proof for this task is the Task-2
suite; the browser path is exercised by Task 4's capture spec (env-bound by design).
Typecheck + eslint gate the commit.

### Task 4 — harness wiring + capture spec (`infra:`)

RED: `tests/ci/_metaE2eWorkflowCoverage.test.ts` fails after adding
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
`tests/e2e/screenshots-gallery-capture.spec.ts` without its allowlist row.
GREEN, one commit:

<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
- `tests/e2e/screenshots-gallery-capture.spec.ts` — FIRST import
  `./helpers/loadTestEnv`; one `test()` calling `captureGallery()` then the §8.2
  postconditions (always-block + unfiltered/filtered branch).
- `screenshots-gallery` project in `playwright.screenshots.config.ts`
  (testMatch, `timeout: 1_800_000`, Desktop Chrome use-block mirroring
  screenshots-help-capture, no dependencies).
- `package.json`: `screenshot:gallery` script (ENABLE_TEST_AUTH + TEST_AUTH_SECRET
  inline, `--project=screenshots-gallery`).
- `.gitignore`: `/screenshots/` (Edit tool, not `echo >>`; verify with
  `git check-ignore -v screenshots/attention-gallery/index.json`).
- `LOCAL_ONLY_ALLOWLIST` row with a reason citing spec §1.1.

VERIFY: `pnpm vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts tests/help/playwright-config.test.ts`;
playwright-tsconfig typecheck.

### Task 5 — full-sweep measurement + review sample (`docs:` if any doc edits)

Run `pnpm screenshot:gallery` (server builds once). Record wall clock; tighten the
project timeout to ~2× measured (amend config if <900 s measured; keep 1800 s
otherwise) and note the measurement in the PR body. Verify §8.2 postconditions passed;
spot-open several WebPs (light+dark+overflow) to confirm the modal is actually in
frame. Re-run with `GALLERY_SCENARIO=<one id>` to exercise the filtered path against
the fresh index.

### Task 6 — close-out gates

- §8.3 "after" leg: `pnpm screenshot:help`, byte-compare against Task 0's aside copy
  (same host/arch), then `git restore public/help/screenshots/`.
- Full local suite `pnpm test`; typecheck (vitest AND playwright tsconfigs); eslint;
  `pnpm format:check`.
- Whole-diff Codex cross-model review (fresh-eyes brief, split-scope if large) to
  APPROVE.
- Push; `gh pr create`; real CI green (all twelve required contexts REPORTED);
  `gh pr merge --merge`; ff local main; verify `0  0`.

## Deliberately out of scope

Spec §9 non-goals; DEFERRED.md/BACKLOG.md entries none — nothing deferred.
