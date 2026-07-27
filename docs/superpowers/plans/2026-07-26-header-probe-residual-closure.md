# Header Probe Residual Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all four residual findings of `BL-HEADER-PROBE-RESIDUAL-VACUITY`: anchor the real-route width chain at 320 and 430 (finding 1), and add a committed pixel-baseline gate over the section-header matrix captured only inside the pinned Playwright image (findings 2–4).

**Architecture:** Part A extends a shared width constant that two live CI'd loops iterate, pinned red-first by a new set-equality structural test. Part B is a DB-free Playwright screenshot spec reusing the static section-header harness, an env-gated config, an unfiltered PR gate workflow running the capture inside the pinned Playwright jammy image (v1.59.1), and a post-merge regen workflow; initial baselines are the gate's own failure-artifact actuals (spec §3.6).

**Tech Stack:** Playwright `toHaveScreenshot` (`maxDiffPixels: 0`, `threshold: 0`), tsx-subprocess static harness, Tailwind v4 compiled product CSS, GitHub Actions + pinned Docker.

**Spec (canonical):** `docs/superpowers/specs/2026-07-26-header-probe-residual-closure-design.md` — APPROVED, Codex R3. Its §1.1 decisions are ratified: do not relitigate. Its §3.3 capture grid (50 baselines: 10 idle composites + 40 state captures) and §3.6 production procedure are the authority; this plan does not restate them as authority.

## Global Constraints

- TDD (AGENTS invariant 1): each task's assertions run RED before the mechanism lands; RED/GREEN recorded in commit messages.
- Conventional commits, one task per commit (invariant 6); `--no-verify`.
- No UI files touched ⇒ impeccable dual-gate (invariant 8) does not attach. No mutation surfaces ⇒ invariant 10 untouched. (`tests/e2e/_sectionHeaderCellHarness.tsx` is a test harness, not a `components/` surface; the Task 3 mutation commit touches only it and is reverted.)
- Byte rule (AGENTS "Byte-comparison CI gates"): every committed baseline byte originates from the pinned image on the native-amd64 runner — initial bytes via the gate's failure artifact, later bytes via the regen workflow. No sanctioned local capture (spec §1.1).

## Meta-test inventory (project writing-plans rule)

<!-- spec-lint: ignore — files created by this plan's tasks -->
- **CREATES `tests/cross-cutting/section-header-width-anchors.test.ts`:** set-equality pin `new Set(REAL_ROUTE_WIDTHS)` equals `new Set(Object.keys(ROW_WIDTHS).map(Number))` — RED today (3 vs 5), GREEN after Part A, and permanently blocks a sixth matrix width from entering unanchored.
- **REWRITES `tests/cross-cutting/playwright-version-pin.test.ts`:** from single-workflow major.minor-of-caret (currently `tests/cross-cutting/playwright-version-pin.test.ts:7` hardcodes `screenshots-drift.yml`, and its comparison at `tests/cross-cutting/playwright-version-pin.test.ts:78-84` is major.minor of the package.json literal) to a registry over `["screenshots-drift.yml", "screenshots-regen.yml", "section-header-visual.yml", "section-header-visual-regen.yml"]`, comparing each image tag's FULL semver against the INSTALLED `@playwright/test` version (createRequire → the package's own manifest `version` field) and asserting `--platform linux/amd64` on every `docker run` block in each registered workflow. RED first: registry rows for the two new workflows before they exist.
- **SATISFIES `tests/ci/_metaE2eWorkflowCoverage.test.ts` fail-by-default:** the new spec is discovered by its readdir sweep and becomes `covered` because the gate workflow is an unfiltered `pull_request` workflow whose run command names the spec path literally (`SPEC_RE` extraction at `tests/ci/_workflowCoverageScan.ts:30` applied in `tests/ci/_workflowCoverageScan.ts:179`). NO allowlist row. The regen workflow is dispatch-only and names no spec path, so it adds no false coverage claim.
- Supabase call-boundary, advisory-lock, sentinel, admin-alert registries: none apply — no runtime code, no DB, no mutation surface.

## e2e harness readiness (project writing-plans rule)

<!-- spec-lint: ignore — files created by this plan's tasks -->
- **New visual spec:** self-booted static server (the `tests/e2e/section-header-layout.layout.spec.ts:46-119` mechanism: tsx harness subprocess with explicit `HARNESS_ENV` from `tests/e2e/section-header-layout.layout.spec.ts:31`, `compileEntryCss` from `tests/e2e/helpers/liveEntryToolchain.ts:113`, `createServer` on an ephemeral loopback port). No dev server, no Supabase, no hydration gate — pages are static markup; readiness = `goto(..., { waitUntil: "load" })` + the DOM contract assertions (15 cells, distinct headings, corner link present, zero SMIL elements) before the first capture. State captures use `expect(locator).toHaveScreenshot` (auto-waits); the pseudo-state oracle (spec §3.3) runs `link.evaluate` immediately before each capture while the state is held, so no evaluate outlives its element.
- **Part A (width chain):** runs under the main `playwright.config.ts` (dev server :3000, seeded DB). Local run needs the settled dashboard state (`tests/e2e/helpers/dashboardState.ts:36` `settleDashboardAdminState`, per the sibling wide-inline plan's measurement caution); CI provides it in `phantom-gap-e2e.yml`'s seeded run.
<!-- spec-lint: ignore — files created by this plan's tasks -->
- **CI wiring named explicitly:** Part A: existing `.github/workflows/phantom-gap-e2e.yml:182` `-g "width chain"` step — no edit. Part B: new gate workflow (unfiltered `pull_request` + `workflow_dispatch`) and new regen workflow (`workflow_dispatch`, `contents: write`); both under `.github/workflows/` per spec §3.5. The new spec's `testMatch` lives ONLY in the new `tests/e2e/visual.config.ts` (explicit single-spec allow-list). Verified: no `playwright.config.ts` project matcher alternative ends in `visual`, so the main config cannot match the new spec; the gate workflow yaml avoids `needs:`/`shell:`/`working-directory:`/`defaults:` keys (scanner unmodelled-override rule — the composite setup action's internal `shell: bash` lives in `action.yml`, which the scanner does not read).

---

### Task 1: Part A — anchor the width chain at 320 and 430

<!-- spec-lint: ignore — files created by this plan's tasks -->
**Files:** Create `tests/cross-cutting/section-header-width-anchors.test.ts`; modify `tests/e2e/_sectionHeaderWidths.ts:38` (+ doc comment).

- [ ] **Step 1 (RED):** write the set-equality test above; `pnpm vitest run tests/cross-cutting/section-header-width-anchors.test.ts` fails (REAL_ROUTE_WIDTHS has 3 of 5 keys).
- [ ] **Step 2 (GREEN):** extend `REAL_ROUTE_WIDTHS` to `[320, 375, 430, 640, 1280] as const`; update its doc comment ("the subset … already loads" → all five keys, anchored 2026-07-26 closing finding 1). Vitest test green.
- [ ] **Step 3 (behavioral proof):** `pnpm exec playwright test --project=desktop-chromium tests/e2e/admin-layout-dimensions.spec.ts -g "width chain"` — 10 cases (5 widths × 2 loops), all green locally. The hosting describe never settles the dashboard itself (`tests/e2e/admin-layout-dimensions.spec.ts:527` resolves only the slug), so FIRST apply the settle SQL once against the local DB (the exact update `settleDashboardAdminState` performs, `tests/e2e/helpers/dashboardState.ts:36`): `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "UPDATE app_settings SET watched_folder_id='seed-fixture-folder', watched_folder_name='Seed fixture folder', watched_folder_set_by_email='seed-mode@fxav.local', watched_folder_set_at='2026-01-01T12:00:00.000Z', pending_folder_id=NULL, pending_folder_name=NULL, pending_folder_set_by_email=NULL, pending_folder_set_at=NULL, pending_wizard_session_id=NULL, pending_wizard_session_at=NULL WHERE id='default';"` — the LOCAL loopback DB literally, never `$TEST_DATABASE_URL`, which this repo's `.env.local` points at the persistent validation project (`scripts/preflight-env.mjs:120` warns exactly this; plan-review R2 finding 1). Local seed DB — no restore needed. If 320/430 report different real widths: that IS the finding — measured `ROW_WIDTHS` update per spec §2 Risk, recorded in the PR body.
- [ ] **Step 4:** commit `test(admin): anchor the section-header width chain at 320 and 430` (RED/GREEN counts in body).

### Task 2: Part B — config, spec, workflows, and version-pin registry (ONE commit — a spec-only commit would leave `tests/ci/_metaE2eWorkflowCoverage.test.ts` red as a new dark spec, plan-review R1 finding 1)

<!-- spec-lint: ignore — files created by this plan's tasks -->
**Files:** Create `tests/e2e/visual.config.ts`, `tests/e2e/section-header-visual.spec.ts`, `.github/workflows/section-header-visual.yml`, `.github/workflows/section-header-visual-regen.yml`; rewrite `tests/cross-cutting/playwright-version-pin.test.ts`.

- [ ] **Step 1: config.** `standalone.config.ts` shape (testDir ".", workers 1, reporter list, one chromium project); guard at top: `if (process.env.SECTION_HEADER_VISUAL_CONTAINER !== "1") throw` with a message pointing at the two workflows (refuses ACCIDENTAL bare-host runs — spec §1.1); `testMatch: /section-header-visual\.spec\.ts/`; `expect: { toHaveScreenshot: { maxDiffPixels: 0, threshold: 0 } }`; `snapshotPathTemplate: "{testFileDir}/{testFileName}-snapshots/{arg}{ext}"` (platform suffix dropped — constant by construction; a suffixed name would let a stray host run mint a parallel baseline set instead of failing).
- [ ] **Step 2: spec.** `beforeAll` = the layout spec's mechanism (tsx subprocess + `compileEntryCss` + static server) + DOM contract: 15 cells, distinct headings, `[data-cell="G1-clean"] a[href]` present, and ZERO SMIL elements (`animate, animateTransform, animateMotion, set` count = 0 — spec §3.1 finding-3 closure). Composite page per width (15 width-wrapped cell markups, each preceded by a text label). Tests per spec §3.3: 10 idle full-page captures (5 widths × 2 themes via `data-theme` attribute) named `idle-${width}-${theme}.png`; 40 state element-captures of the G1-clean container (hover / keyboard-driven focus / held `mouse.down` active / keyboard-focus+hover), each preceded by the pseudo-state oracle `link.evaluate(el => el.matches(sel))` with the §3.3 selector per state (focus-visible-based for the two focus states), named `${state}-${width}-${theme}.png`.
<!-- spec-lint: ignore — pseudo-class selector literals in matches() calls, not file citations -->
- [ ] **Step 2a: state isolation (spec §3.3 amendment):** every state capture starts from a fresh `page.goto`; exclusive oracles — hover `el.matches(':hover:not(:focus-visible)')`, focus `el.matches(':focus-visible:not(:hover)')`, active `el.matches(':active')` plus a negated focus-visible check (a real press inherently hovers; the baseline deliberately records pressed-while-hovered), compound `el.matches(':hover:focus-visible')`.
- [ ] **Step 3 (meta-test RED):** rewrite `tests/cross-cutting/playwright-version-pin.test.ts` as the registry from the inventory; RED while the two registered workflows are missing.
- [ ] **Step 4: workflows.** Gate workflow per spec §3.5 (unfiltered `pull_request` + `workflow_dispatch`; checkout → setup → the §3.5 docker run verbatim → `if: failure()` upload of `test-results/` named `section-header-visual-actuals`). Regen workflow per spec §3.5 (dispatch-only, `contents: write`, `--update-snapshots` run, no-update re-comparison run, bot commit + push; post-merge tool).
- [ ] **Step 5 (GREEN):** `pnpm typecheck`; host-refusal proof (config without the env var throws — record it); `pnpm vitest run tests/cross-cutting/playwright-version-pin.test.ts tests/ci/_metaE2eWorkflowCoverage.test.ts` — registry green, new spec `covered`, no allowlist row.
- [ ] **Step 6:** ONE commit `test(admin): section-header visual-baseline gate — spec, config, workflows, version-pin registry` (RED/GREEN counts in body).

### Task 3: Part B — PR, red-run artifact baselines, sensitivity proof

<!-- spec-lint: ignore — snapshots dir created by this task; harness mutation is temporary and reverted -->
**Files:** Create `tests/e2e/section-header-visual.spec.ts-snapshots/*.png` (50 files, Step 2); temporarily modify then revert `tests/e2e/_sectionHeaderCellHarness.tsx` (Steps 3–4).

- [ ] **Step 1:** push; open the PR. First `section-header-visual` run FAILS on missing snapshots — **the recorded Part B RED and the producer** (spec §3.6).
- [ ] **Step 2 (baselines):** download `section-header-visual-actuals`, place the 50 `-actual` PNGs as `tests/e2e/section-header-visual.spec.ts-snapshots/*.png` (names stripped of `-actual`), INSPECT them (15 cells visible per composite, link + state styling visible in state captures — a blank capture committed as baseline gates on nothing), commit `test(admin): commit section-header visual baselines (pinned-runner actuals)`, push. Gate run on this SHA must be GREEN — runner-to-runner determinism proven.
- [ ] **Step 3 (sensitivity proof):** push `test(admin): TEMP visual mutation — gate sensitivity probe, revert follows` adding a 1px visual mutation to the G1 fixture wrapper in `tests/e2e/_sectionHeaderCellHarness.tsx` (harness-side, no product surface); gate must FAIL.
- [ ] **Step 4:** push `revert: TEMP visual mutation (gate sensitivity proven)` restoring the harness byte-identically; gate green again. All four run URLs (red, green, mutation-fail, revert-green) recorded in the PR body.

### Task 4: Close-out

**Files:** Modify `BACKLOG.md`; spec status line.

- [ ] **Step 1:** rewrite the `BL-HEADER-PROBE-RESIDUAL-VACUITY` entry per spec §5 (closure record: finding 1 = five-width chain + set-equality pin; findings 2–4 = the 50-baseline pixel gate; non-required-context follow-up noted; "What IS covered" updated to 50 baselines + five-width chain). Mark the spec APPROVED (Codex R3).
- [ ] **Step 2:** `pnpm spec:lint` both docs; full local gates: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`. Commit `docs: close BL-HEADER-PROBE-RESIDUAL-VACUITY`.
- [ ] **Step 3:** whole-diff cross-model review (fresh-eyes; tight scope per surface if needed) → APPROVE; all PR checks green (incl. the new gate); `gh pr merge --merge`; ff-sync the main checkout and verify `git rev-list --left-right --count main...origin/main` = `0  0`.
