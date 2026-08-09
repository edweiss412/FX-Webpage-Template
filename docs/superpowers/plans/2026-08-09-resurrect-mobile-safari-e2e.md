# Plan — resurrect mobile-safari e2e (BL-RESURRECT-MOBILE-SAFARI-E2E)

**Spec:** `docs/superpowers/specs/ci/2026-08-09-resurrect-mobile-safari-e2e-design.md` (canonical; this plan implements it task-for-task).
**Branch:** `test/resurrect-mobile-safari-e2e` · **Worktree:** `../FX-worktrees/resurrect-mobile-safari-e2e` · **Implementer:** Opus / Claude Code (delegated session; spec §1.1.1).
**Date:** 2026-08-09

Every task: failing/red verification → minimal change → green → commit (conventional-commits, one task per commit). Invariants 1, 6, 11, 12 apply throughout. No UI surface is designed; if §Task 1–2 triage forces a product fix under `app/`/`components/`, the invariant-8 impeccable dual-gate fires for that diff (spec §1.1.6).

## Meta-test inventory (declared per writing-plans rule)

**EXTENDS:**
- `scripts/check-crew-e2e-executed.mjs` `REQUIRED` registry — new rows for each newly wired spec; values equal live Playwright resolution (the wiring meta-test derives and pins this, see below).
- `tests/ci/_metaE2eWorkflowCoverage.test.ts` — allowlist rows REMOVED (wired or deleted files). The suite walks `tests/e2e/` from disk, so a row naming a deleted file fails until removed: that failure is Task 3's natural RED.
- `tests/help/walker-routes.test.ts` frozen shrink-only DML count pins — rows removed for deleted files (shrink direction, permitted by design).

**CREATES:** none. `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` already pins: REQUIRED key set == exact workflow file list, thresholds == live resolution under the workflow's own projects, oracle step present in command position, json reporter present (verified at plan time, lines cited below). No new meta-test is needed — the existing pair fails-by-default on every drift this plan could introduce.

## e2e harness-readiness (mandatory checklist)

- **(a) Server boot:** CI = the crew-e2e.yml job's `CREW_E2E_ONLY=1` port-3000 webServer (cold `pnpm build && pnpm start`, prod artifact); local = same env var, dev server. One Playwright invocation, both projects, per the workflow's own one-invocation comment.
- **(b) Readiness gate:** every new/migrated test awaits `getByTestId("crew-shell")` visibility (or an equivalent testid the assertion targets) after `page.goto(..., { waitUntil: "domcontentloaded" })` before its first assertion. Never `networkidle`. Theme persistence's first-paint assertion reads `document.documentElement.dataset.theme` at `domcontentloaded` deliberately BEFORE any hydration wait — that is the no-FOUC contract under test.
- **(c) Detach safety:** all `getBoundingClientRect` reads go through `locator.evaluate` on elements already gated visible in the same test step; no sampler outlives its element; no polling loop holds a handle across navigation.

## Plan-time verification transcript (commands run 2026-08-09 in the worktree)

1. **Live/dead census:** crew-page 2 live describes, 15 live tests (10 layout + 5 nav), SIX statically-skipped blocks — five pre-redesign tile blocks (delete) + the §4.10 transition-audit block ~:892, line-wrapped `.skip` form, KEPT (spec §2.1/§6.4); right-now-transitions 1 live / 2 skip; the other ten 0 live. Seeded local run of crew-page mobile-safari: 12 passed / 3 failed / 10 skipped (7.2m; the 10 = the six blocks' statically-skipped tests). Three runtime-conditional `test.skip` guards in crew-page (gear grid, key-times ×2) did not fire on the seed.
2. **Wiring pins:** `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` — "the executed-count oracle's thresholds match live Playwright resolution" imports `REQUIRED` and pins key-set == workflow file list and each value == live resolution; "crew-e2e.yml asserts the guarded specs actually EXECUTED" pins the oracle step + json reporter.
3. **Helper importers:** `rg -l "helpers/rightNow" tests/` → live importers include `crew-page.spec.ts` and `tests/e2e/helpers/layout.ts` → helper STAYS. `rg -l "lockedCrewRestriction" tests/` → live importers include `devCaptureStaged.ts`, `published-review-modal.realtime.spec.ts`, `walker-routes.test.ts` → helper STAYS. Both need comment repairs only.
4. **walker-routes registry rows for deleted files:** `empty-state.spec.ts` 2, `notes-tile.spec.ts` 5, `pack-list.spec.ts` 9, `right-now.spec.ts` 1, `transport-tile.spec.ts` 2 → five rows removed. (schedule-tile has no row — its DML moved to the locked helper; comment at `tests/help/walker-routes.test.ts` near the registry cites it and gets repaired.)
5. **Coverage-allowlist rows touched:** REMOVED (deleted files) — `schedule-tile` :179, `transport-tile` :190, `status-financials` :187, `role-spoof` :173, `pack-list` :157, `notes-tile` :154, `right-now` :172, `layout-dimensions` :149, `empty-state` :143. RECLASSIFIED `UNSEEN` → `PATH_GATED_BY_EXCLUSION` (wired files, spec §3.1) — `crew-page` :138, `theme-toggle` :189, and `right-now-transitions` :171 iff Task 6 lands. (Line numbers drafting-time locators; the suite is disk-walked so staleness fails loud.)
6. **Class-sweep (spec §3.4), run at plan time** — `rg -n "<basename>\.spec"` per deleted basename, dispositions:

| Hit | Disposition |
| --- | --- |
| `playwright.config.ts` both testMatch regexes (9 basenames) + `role-spoof.spec` workers comment (~:39) | Task 3 removes tokens + rewrites comment |
| `tests/ci/_metaE2eWorkflowCoverage.test.ts` rows | Task 3 removes (see 5.) |
| `tests/help/walker-routes.test.ts` rows + schedule-tile comment | Task 3 removes/repairs (see 4.) |
| `tests/e2e/helpers/rightNow.ts` header comments citing right-now.spec/schedule-tile.spec | Task 3 rewrites comments (helper stays) |
| `tests/e2e/helpers/lockedCrewRestriction.ts` comment citing schedule-tile.spec | Task 3 rewrites comment |
| `components/atoms/Section.tsx` comment ~:238 ("layout-dimensions.spec.ts is describe.skip and runs nowhere") | Task 3 updates to cite the surviving coverage (crew-layout-dimensions + spec §2.3 row) |
| `tests/e2e/layout-dimensions.spec.ts` + `tests/e2e/empty-state.spec.ts` cross-cites of notes-tile.spec | moot — both files deleted in Task 3 |
| `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md` FULL-MIGRATE/PARTIAL-PORT rows naming these files (rows ~:69–:98) | Task 7 annotates each row: superseded-by-deletion, cite spec §2.3 + §6 |
| Historic docs (M4/M5 handoffs, 03-04-tiles.md, old specs, audits, L-wave sweep artifacts, `2026-08-03-lead-capability-prose-settle-design.md`) | RECORD — describe past state truthfully; untouched |
| `BACKLOG.md` entry + the spec doc's self-references | Task 8 archives entry; spec is this arc's artifact |

7. **Registry count reconciliation (authored AND run):** allowlist removals = 9 (deleted); allowlist reclassifications = 2 (+1 conditional, `right-now-transitions`); walker-routes removals = 5; `REQUIRED` additions = 2 (+1 conditional). After Task 9, re-run both suites and paste actual counts into the PR body — the disk-walked suites are the authority.

## Acceptance criteria (restated from spec §5 — task `ac=` ids resolve here)

- **AC-1** — workflow names the wired specs; full-set `REQUIRED` rows on genuinely-executing projects only; `expectWired` enrollment + exact-title `EXPECTED_SKIPS` rows; executed-count oracle passes on the run's own report.
- **AC-2** — five consecutive green normal-dispatch crew-e2e runs including the newly wired specs, linked in the PR.
- **AC-3** — nine dead files gone; no un-annotated reference survives (testMatch, allowlist, prose — class-sweep output in PR body).
- **AC-4** — the two residue tests exist and pass in CI, or their demotion `BL-` rows exist with flake evidence.
- **AC-5** — coverage meta-test passes: zero rows for deleted files, `PATH_GATED_BY_EXCLUSION` rows for wired files; parent census restated from the allowlist.
- **AC-6** — full local gates green before push; real CI green before merge.

<!-- tasks: depth=2 -->

## Task 1 — triage `inv5` tab-bar failure (crew-page)

<!-- task: red=`CREW_E2E_ONLY=1 pnpm exec playwright test --project=mobile-safari tests/e2e/crew-page.spec.ts --grep "inv5"` ac=AC-2 -->

Reproduce in isolation. Root-cause before touching anything (systematic-debugging; no assertion-loosening). Known from the seeded run: `inv5: bottom tab-bar full-width + bottom-anchored + equal tabs (390px); top tabs ≥44px (≥720px)` fails locally. Outcomes per spec §4: environmental → prove with prod-build run (`pnpm build && pnpm start`, re-run test) + record mechanism; product bug → small fix in-arc (UI gate fires) or severity-tagged `BL-` row + registered per-test skip with citation; test defect → repair test. RED validity: the failing production line (or stale assertion) is named in the commit body once diagnosed.

## Task 2 — triage the two admin-preview failures (crew-page)

<!-- task: red=`CREW_E2E_ONLY=1 pnpm exec playwright test --project=mobile-safari tests/e2e/crew-page.spec.ts --grep "preview-as|footer report"` ac=AC-2 -->

Same contract as Task 1. Both failures target `/admin/show/<slug>/preview/<crewId>` (non-200; 180s goto timeout). Hypothesis to test FIRST (cheapest): dev-server cold-compile/auth-env — run against local prod build (the CI shape). If green there with a diagnosed dev-only mechanism, record in PR body and proceed (spec §4.2). If red: root-cause as product bug or test defect per spec §4.3–4.4.

## Task 3 — delete the nine dead files + every registry/comment repair

<!-- task: red=`pnpm vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts tests/help/walker-routes.test.ts` ac=AC-3,AC-5 -->

Order: capture `pnpm exec playwright test --list` output FIRST (baseline file set), delete the nine files, run the two suites — both go red on stale rows (disk-walked; that is the RED) — then: edit BOTH `playwright.config.ts` testMatch regexes per the spec §3.4 collision table — eight tokens removed bare; `layout-dimensions` REPLACED by explicit `crew-layout-dimensions|admin-layout-dimensions|admin-nav-layout-dimensions` alternatives (spec review R1 F2: the bare token substring-registers those three surviving, actively-invoked specs); remove the DELETED files' allowlist rows (wired files reclassify in Task 9, a different operation); remove the five walker-routes rows; apply every comment repair from the class-sweep table. Green = both suites + a second `--list` whose file set equals baseline minus exactly the nine deleted files (the spec-mandated collision re-check). Also delete the five dead `test.describe.skip` blocks inside `crew-page.spec.ts` (lines ≥1416 region) and the two inside `right-now-transitions.spec.ts`. **KEEP crew-page's §4.10 transition-audit block (~:892)** — distinct class, documented limit (spec §2.1/§6.4). Verify with a pattern matching BOTH skip forms (`test.describe.skip(` AND the line-wrapped `test.describe␤.skip(`): expected survivors = exactly 1 in crew-page.spec.ts, 0 in right-now-transitions.spec.ts.

## Task 4 — rewrite `theme-toggle.spec.ts` live

<!-- task: red=`CREW_E2E_ONLY=1 pnpm exec playwright test --project=mobile-safari tests/e2e/theme-toggle.spec.ts` ac=AC-1,AC-4 -->

Replace file content: live describe on the seeded shareToken route using crew-page.spec.ts's EXACT resolution recipe — `lookupSeededShow` + share-token helper + `signInAs(page, ADMIN_FIXTURE)` (spec §3.2 R2: unauthenticated token requests render `SignInOrSkipGate`/`PickerInterstitial`, and the toggle exists only in the CrewShell Footer — `components/layout/Footer.tsx` via `_CrewShell`). Await `crew-shell` testid visible before every toggle interaction. Contract per spec §3.2 (all four parts):

1. Persistence BOTH directions: light→dark tap → `data-theme` flips + `localStorage["fxav-theme"]` written → reload → survives; then dark→light tap → reload → persisted `"light"` + restored attribute.
2. No-FOUC first-body-child oracle (R5-repaired): `page.addInitScript` installs a MutationObserver on `document.documentElement` recording `{value, readyState, bodyChildCount}` per `data-theme` mutation; after reload assert persisted value with `readyState === "loading"` AND `bodyChildCount <= 1` (live placement: `NO_FOUC_SCRIPT` is body's FIRST child, `app/layout.tsx` — only the executing bootstrap script precedes the mutation, no paintable sibling). DOMContentLoaded mutant fails readyState; end-of-body mutant fails bodyChildCount — that pair IS mutant (b) below.
3. A11y states across the cycle: light mode `aria-pressed="false"` + name "Switch to dark theme"; dark mode `aria-pressed="true"` + "Switch to light theme"; post-reload aria-pressed reflects restored theme (verify live copy in `components/layout/ThemeToggle.tsx` first; pin the live copy).
4. Tap target ≥44×44 (`--spacing-tap-min`, DESIGN.md §3).

Project honesty (spec §3.2): author WITHOUT project early-returns so both testMatch projects genuinely execute, or restrict to mobile-safari and drop from the desktop regex — never a counted no-op. Readiness/detach rules from the harness checklist. **Discriminating-power proof (four-mutant rule, run before review dispatch, results in commit body):** (a) `STORAGE_KEY` write disabled in `ThemeToggle.tsx` → persistence fails; (b) no-FOUC inline script in `app/layout.tsx` deferred to a DOMContentLoaded handler → during-parse oracle fails (readyState "interactive"); (c) localStorage key renamed in the write path only → reload restore fails; (d) toggle shrunk below 44px via injected style → tap-target fails. Restore after each.

## Task 5 — GearSection `rawSnippet` component test (pack-list residue)

<!-- task: red=`pnpm vitest run tests/components/crew/sections/GearSection.rawSnippet.test.tsx` ac=AC-4 -->

New vitest file (jsdom, existing GearSection test conventions). Fixture: gear item with `rawSnippet` set to a fixture-derived sentinel string; assert the rendered item node (scoped extraction — the item's own container, siblings removed per anti-tautology) contains it; negative: item without `rawSnippet` renders no snippet node. Production line under test: the `item.rawSnippet ?` branch in `components/crew/sections/GearSection.tsx`. Four mutants recorded in commit: emptied value / suffixed value / snippet present in props but branch disabled / discriminating param varied.

## Task 6 — migrate right-now-transitions §5.7 to the shareToken route (timeboxed)

<!-- task: red=`CREW_E2E_ONLY=1 pnpm exec playwright test --project=mobile-safari tests/e2e/right-now-transitions.spec.ts` ac=AC-1 -->

NOT a bare URL swap (spec §3.5, R2-repaired). Per-case contract:

1. Extend `driveToState` (`tests/e2e/helpers/rightNow.ts`) to assert the RENDERED RightNow state kind (the hero's state/treatment attribute) after navigation — HTTP 200 alone passes on lost semantics. This extension is the task's first RED (mutant: request `viewer_off_day` under a viewer that ignores restrictions → helper must fail).
2. Migrate the two clock-driven cases (midnight rollover; non-show-now → show-day) to the shareToken route under the §3.2 admin recipe; keep `page.clock.install` + the `run_of_show` beforeAll/afterAll seed mutation.
3. The recovery case enters `viewer_off_day` by mutating the viewer's restriction — admin resolution never enters it. Options in order: per-test crew row through real resolution (stage-restricted picker-cookie precedent) if it fits the timebox; else CASE valve — `BL-` row (exception (a)/(c), probe attached) + registered static skip carrying the ref, and the file wires only if `REQUIRED` + skip registration stay honest.

**Whole-file valve:** further harness dependencies beyond the above → `BL-` row (exception (c)) WITH the fired valve's probe evidence copied in, file stays `UNSEEN`, skip wiring in Task 9, and the disposition is recorded under spec §6.6 (the consequence bound's documented-limit state — not silent). Deleting the two dead blocks already happened in Task 3. Project honesty: wire only under projects where tests genuinely execute.

## Task 7 — footer sticky/flow e2e test (layout-dimensions residue) + DEFERRED.md dispositions

<!-- task: red=`CREW_E2E_ONLY=1 pnpm exec playwright test --project=mobile-safari tests/e2e/crew-page.spec.ts --grep "footer position"` ac=AC-4 -->

One test appended to the live layout-invariants describe in `crew-page.spec.ts` (spec §3.3.2): short-content section → footer bottom edge within viewport; long-content section → footer below fold, page scrolls to it. `getBoundingClientRect` via gated locators. Discriminating-power: assert against two DIFFERENT sections of the seeded show already known short/long (derive from fixture, never hardcode pixel values); if the seed lacks a reliably-short section, mutate content in beforeAll via the established locked-helper pattern and restore after. Same demotion valve as Task 4/5 (spec §3.3, flake evidence required). Also in this commit: annotate the M4 `DEFERRED.md` rows per the class-sweep table.

## Task 8 — ledger corrections

<!-- task: red=`pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` ac=AC-5 -->

Archive `BL-RESURRECT-MOBILE-SAFARI-E2E` → `BACKLOG-archive.md` (resolution: this arc; keep the 2026-08-06 CORRECTION block in the archived body for auditability). Restate the parent `BL-E2E-APP-DEPENDENT-SPECS-CI-DARK` census FROM the meta-test allowlist after Tasks 3+9 (run the suite, count rows — never arithmetic). File any valve `BL-` rows (Tasks 4–7) with exception letters + evidence. The in-progress marker stays until the PR's LAST commit (invariant 12; removed there, not here).

## Task 9 — wire into crew-e2e.yml + REQUIRED rows + allowlist removals

<!-- task: red=`pnpm vitest run tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts tests/ci/_metaE2eWorkflowCoverage.test.ts` ac=AC-1,AC-5 -->

Add `tests/e2e/crew-page.spec.ts` + `tests/e2e/theme-toggle.spec.ts` (+ `right-now-transitions.spec.ts` iff Task 6 landed) to the workflow's single `playwright test` invocation. **Project honesty (spec §3.1, R1 F3):** remove `crew-page` from the desktop-chromium testMatch regex in this commit — its 22 `project.name !== "mobile-safari"` early-returns make desktop executions counted no-ops; apply the same test to theme-toggle and right-now-transitions (wire each only under projects where its tests genuinely execute). RED: the wiring suite's key-set parity check fails until `REQUIRED` gains matching rows; add rows with values from `pnpm exec playwright test --list` under exactly the projects each spec is wired for (full executable set — never 1; runtime-skip-registered tests documented per row like picker-flow's). **Vestigial project-gate sweep FIRST** (spec §3.1, R4 F1): in the same commit as the desktop-regex removal, delete all 22 `testInfo.project.name` early-return sites in crew-page.spec.ts (17 live + 5 in the kept §4.10 block — that block keeps tests/titles/header verbatim, loses only gate lines). `expectNoProjectGate` inside `expectWired` scans the whole file, so enrollment is impossible while any remain. Verify sweep neutrality: executed count still 15, skip inventory still the 4 §4.10 titles. **Enroll each wired spec in `expectWired`** (spec §3.1, R3 F1): one invocation per wired file in `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` + an exact-title `EXPECTED_SKIPS` row (crew-page: the §4.10 block's four titles + any Task-1/2 triage skips; theme-toggle: `[]`; right-now-transitions: valve skip title if the case valve fired) — this is the machine pin for project honesty + skip inventory; RED for this half: enrollment added before workflow edit fails on the unwired file. **Reclassify** the wired files' allowlist rows `UNSEEN` → `PATH_GATED_BY_EXCLUSION` (spec §3.1 — crew-e2e.yml is paths-ignore-triggered; the scanner never marks its specs covered; precedent rows: crew-section-toggle, alert-action-links, font-binding, font-rendering-census). Update the workflow header comment (spec §3.1) and check job runtime: if the enlarged suite approaches the 25-minute timeout in dispatch runs, raise `timeout-minutes` in the same commit with the measured duration cited.

## Task 10 — full local gates

<!-- task: red=`pnpm test` ac=AC-6 -->

`pnpm test` (full vitest), `pnpm typecheck` (vitest AND playwright tsconfigs), `pnpm lint`, `pnpm format:check`, `pnpm spec:lint` on this plan + the spec. All green before push. (e2e/env-bound suites are excluded from `pnpm test` by design — the e2e proof is Task 11's dispatch runs.)

## Task 11 — push, 5-green bar, PR, whole-diff review, merge

<!-- task: red=`gh run list --workflow=crew-e2e.yml --branch test/resurrect-mobile-safari-e2e --limit 5` ac=AC-2,AC-6 -->

Push. Fire `gh workflow run crew-e2e.yml --ref test/resurrect-mobile-safari-e2e` — **five consecutive green runs** (sequential; a red run resets the count and triggers triage per spec §4). Open PR (class-sweep output + registry reconciliation counts + triage mechanisms in body). Whole-diff Codex review via codex-guard (`--stage diff`; split tight-scope briefs if the diff exceeds a handful of files — it will: split (1) workflow+registries, (2) test rewrites/deletions, (3) docs/ledger). Repair to APPROVE. Remove the ledger in-progress marker in the PR's last commit. Real CI green → `gh pr merge --merge` → ff-sync main → verify `0 0` → Stage 4.4 teardown (CronDelete, pane/agent label clear).

<!-- tasks: end -->

## Closeout

impeccable-gate: N/A — no UI surface

(Re-evaluate if Task 1/2 triage lands a product fix under `app/`/`components/` — then run the dual gate on that diff and record findings here per invariant 8.)
