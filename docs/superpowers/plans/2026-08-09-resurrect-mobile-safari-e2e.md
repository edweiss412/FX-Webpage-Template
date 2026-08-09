# Plan — resurrect mobile-safari e2e (BL-RESURRECT-MOBILE-SAFARI-E2E)

**Spec:** `docs/superpowers/specs/ci/2026-08-09-resurrect-mobile-safari-e2e-design.md` (canonical; this plan implements it task-for-task).
**Branch:** `test/resurrect-mobile-safari-e2e` · **Worktree:** `../FX-worktrees/resurrect-mobile-safari-e2e` · **Implementer:** Opus / Claude Code (delegated session; spec §1.1.1).
**Date:** 2026-08-09

Every task: failing/red verification → minimal change → green → commit (conventional-commits, one task per commit). Invariants 1, 6, 11, 12 apply throughout. No UI surface is designed; if Task 1–2 triage OR Task 7's Branch-B fix lands product code under `app/`/`components/`, the invariant-8 impeccable dual-gate fires for that diff (spec §1.1.6).

## Meta-test inventory (declared per writing-plans rule)

**EXTENDS:**
- `scripts/check-crew-e2e-executed.mjs` `REQUIRED` registry — new rows for each newly wired spec; values equal live Playwright resolution (the wiring meta-test derives and pins this, see below).
- `tests/ci/_metaE2eWorkflowCoverage.test.ts` — allowlist rows REMOVED (wired or deleted files). The suite walks `tests/e2e/` from disk, so a row naming a deleted file fails until removed: that failure is Task 3's natural RED.
- `tests/help/walker-routes.test.ts` frozen shrink-only DML count pins — rows removed for deleted files (shrink direction, permitted by design).

**CREATES (as extensions — plan review R1 F1, the existing suites are NOT fail-by-default for three of this plan's edits):**
- Wiring test: an `ENROLLED`/`EXEMPT` parity assertion — a const `ENROLLED` array drives the `expectWired` invocations (`ENROLLED.map(...)`), and an assertion pins `ENROLLED ∪ EXEMPT == the workflow's spec file list` where every `EXEMPT` row carries a reason string (the four pre-contract specs: crew-section-toggle, alert-action-links, font-binding, font-rendering-census). A spec added to the workflow without enrollment then fails by default.
- Wiring test: explicit-row requirement — for every `ENROLLED` spec, assert `spec in EXPECTED_SKIPS` (the `?? []` default at :366 makes a MISSING row indistinguishable from an empty one; theme-toggle's row is explicitly `[]`).
- Coverage meta-test: for every spec named in a paths-ignore workflow's run command, assert its allowlist value is NOT `UNSEEN` (the test's dark/stale/shadowing checks at :234-242 accept either classification today, so a forgotten reclassification is silent).

The existing pins (REQUIRED key set == workflow file list; thresholds == live resolution; oracle step; json reporter) remain load-bearing and unchanged.

## e2e harness-readiness (mandatory checklist)

- **(a) Server boot:** CI = the crew-e2e.yml job's `CREW_E2E_ONLY=1` port-3000 webServer (cold `pnpm build && pnpm start`, prod artifact); local = same env var, dev server. One Playwright invocation, both projects, per the workflow's own one-invocation comment.
- **(b) Readiness gate:** every new/migrated test awaits `getByTestId("crew-shell")` visibility (or an equivalent testid the assertion targets) after `page.goto(..., { waitUntil: "domcontentloaded" })` before its first assertion. Never `networkidle`. Theme persistence's first-paint assertion reads `document.documentElement.dataset.theme` at `domcontentloaded` deliberately BEFORE any hydration wait — that is the no-FOUC contract under test.
- **(c) Detach safety:** all `getBoundingClientRect` reads go through `locator.evaluate` on elements already gated visible in the same test step; no sampler outlives its element; no polling loop holds a handle across navigation.

## Plan-time verification transcript (commands run 2026-08-09 in the worktree)

1. **Live/dead census:** crew-page 2 live describes, 15 live tests (10 layout + 5 nav), SIX statically-skipped blocks — five pre-redesign tile blocks (delete) + the §4.10 transition-audit block ~:892, line-wrapped `.skip` form, KEPT (spec §2.1/§6.4); right-now-transitions 1 live / 2 skip; the other ten 0 live. Seeded local run of crew-page mobile-safari: 12 passed / 3 failed / 10 skipped (7.2m; the 10 = the six blocks' statically-skipped tests). Three runtime-conditional `test.skip` guards in crew-page (gear grid, key-times ×2) did not fire on the seed.
2. **Wiring pins:** `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` — "the executed-count oracle's thresholds match live Playwright resolution" imports `REQUIRED` and pins key-set == workflow file list and each value == live resolution; "crew-e2e.yml asserts the guarded specs actually EXECUTED" pins the oracle step + json reporter.
3. **Helper importers:** `rg -l "helpers/rightNow" tests/` → live importers include `crew-page.spec.ts` and `tests/e2e/helpers/layout.ts` → helper STAYS. `rg -l "lockedCrewRestriction" tests/` → live importers include `devCaptureStaged.ts`, `published-review-modal.realtime.spec.ts`, `walker-routes.test.ts` → helper STAYS. Both need comment repairs only.
4. **walker-routes registry rows for deleted files:** empty-state.spec.ts 2, notes-tile.spec.ts 5, pack-list.spec.ts 9, right-now.spec.ts 1, transport-tile.spec.ts 2 → five rows removed. (Named without backticks deliberately: Task 3 DELETES these files, so after execution they are historical names, not citations of tracked paths — `pnpm spec:lint` correctly rejects a live citation to a file the same plan removes.) (schedule-tile has no row — its DML moved to the locked helper; comment at `tests/help/walker-routes.test.ts` near the registry cites it and gets repaired.)
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
| tests/e2e/layout-dimensions.spec.ts + tests/e2e/empty-state.spec.ts cross-cites of notes-tile.spec (unbackticked — deleted by this task) | moot — both files deleted in Task 3 |
| `lib/visibility/openingReelText.ts:20` comment citing empty-state.spec.ts | Task 3 rewrites comment to cite the surviving vitest coverage (plan review R1 F4) |
| `tests/e2e/empty-state-reachability.spec.ts:192` comment citing empty-state.spec.ts | Task 3 rewrites comment (file survives; only the cross-cite is stale) |
| `tests/components/atoms/Section.test.tsx:27` comment citing tests/e2e/layout-dimensions.spec.ts | Task 3 rewrites comment alongside the `Section.tsx:238` sibling |
| `tests/fixtures/ledger-mass/2026-08-04.ledgers.json` deleted-spec citations | RECORD — frozen historical fixture for the ledger-mass suite; contents are data, not claims about the live tree; explicitly NOT edited |
| `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md` FULL-MIGRATE/PARTIAL-PORT rows naming these files (rows ~:69–:98) | Task 7 annotates each row: superseded-by-deletion, cite spec §2.3 + §6 |
| Historic docs (M4/M5 handoffs, 03-04-tiles.md, old specs, audits, L-wave sweep artifacts, `2026-08-03-lead-capability-prose-settle-design.md`) | RECORD — describe past state truthfully; untouched |
| `BACKLOG.md` entry + the spec doc's self-references | Task 11 archives entry (step 4); spec is this arc's artifact |

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

<!-- task: red=`CREW_E2E_ONLY=1 pnpm exec playwright test --project=mobile-safari tests/e2e/theme-toggle.spec.ts` ac=AC-1 -->

**RED form (plan review R1 F5):** the current file is wholly `describe.skip`, so a bare run is a
successful no-op, and this task pins EXISTING behavior — the failure-driven step is the
four-mutant protocol: apply mutant (a) (`STORAGE_KEY` write disabled in `ThemeToggle.tsx`), run
the rewritten suite, observe the persistence test FAIL naming the production line, restore, then
run mutants (b)–(d) the same way. Production lines under test: the `STORAGE_KEY` write in
`components/layout/ThemeToggle.tsx` and the `NO_FOUC_SCRIPT` block in `app/layout.tsx`.

Replace file content: live describe on the seeded shareToken route using crew-page.spec.ts's EXACT resolution recipe — `lookupSeededShow` + share-token helper + `signInAs(page, ADMIN_FIXTURE)` (spec §3.2 R2: unauthenticated token requests render `SignInOrSkipGate`/`PickerInterstitial`, and the toggle exists only in the CrewShell Footer — `components/layout/Footer.tsx` via `_CrewShell`). Await `crew-shell` testid visible before every toggle interaction. Contract per spec §3.2 (all four parts):

1. Persistence BOTH directions: light→dark tap → `data-theme` flips + `localStorage["fxav-theme"]` written → reload → survives; then dark→light tap → reload → persisted `"light"` + restored attribute.
2. No-FOUC first-body-child oracle. **As-drafted (superseded):** a MutationObserver on `document.documentElement` recording `{value, readyState, bodyChildCount}`, asserting `readyState === "loading"` AND `bodyChildCount <= 1`. **As shipped:** execution disproved both mechanical details and the spec was amended to match (§3.2.2 AMENDMENT 2026-08-09) — the observer targets `document` with `subtree` (documentElement can be absent at `document_start`, and the throw left the oracle silently empty), and the assertion is on `paintedTextLength === 0` (two NON-PAINTING siblings precede the bootstrap — Next's dev-overlay `<script>` and a React Suspense marker — so `<= 1` is unsatisfiable while nothing has painted). The INTENT is unchanged: DOMContentLoaded mutant fails `readyState`; end-of-`<body>` mutant fails the painted-text assertion, which is the half `readyState` alone cannot catch.
3. A11y states across the cycle: light mode `aria-pressed="false"` + name "Switch to dark theme"; dark mode `aria-pressed="true"` + "Switch to light theme"; post-reload aria-pressed reflects restored theme (verify live copy in `components/layout/ThemeToggle.tsx` first; pin the live copy).
4. Tap target ≥44×44 (`--spacing-tap-min`, DESIGN.md §3).

Project honesty (spec §3.2): author WITHOUT project early-returns so both testMatch projects genuinely execute, or restrict to mobile-safari and drop from the desktop regex — never a counted no-op. Readiness/detach rules from the harness checklist. **Discriminating-power proof (four-mutant rule, run before review dispatch, results in commit body):** (a) `STORAGE_KEY` write disabled in `ThemeToggle.tsx` → persistence fails; (b) no-FOUC inline script in `app/layout.tsx` deferred to a DOMContentLoaded handler → during-parse oracle fails (readyState "interactive"); (c) localStorage key renamed in the write path only → reload restore fails; (d) toggle shrunk below 44px via injected style → tap-target fails. Restore after each.

## Task 5 — GearSection `rawSnippet` component test (pack-list residue)

<!-- task: red=`pnpm vitest run tests/components/crew/sections/GearSection.rawSnippet.test.tsx` ac=AC-4 -->

**RED form (plan review R1 F5):** write the test, confirm green against live code, then force the
`item.rawSnippet ?` branch in `components/crew/sections/GearSection.tsx` to `false` — the test
fails naming that line — restore. That branch flip is the RED; "no test file" is the test-local
failure the RED-validity rule forbids.

New vitest file (jsdom, existing GearSection test conventions). Fixture: gear item with `rawSnippet` set to a fixture-derived sentinel string; assert the rendered item node (scoped extraction — the item's own container, siblings removed per anti-tautology) contains it; negative: item without `rawSnippet` renders no snippet node. Production line under test: the `item.rawSnippet ?` branch in `components/crew/sections/GearSection.tsx`. Four mutants recorded in commit: emptied value / suffixed value / snippet present in props but branch disabled / discriminating param varied. **No demotion valve** (plan review R2 F3): this is a deterministic vitest test outside the dispatch runs — it lands with its mutant proof or the task is incomplete.

## Task 6 — migrate right-now-transitions §5.7 to the shareToken route (timeboxed)

<!-- task: red=`CREW_E2E_ONLY=1 pnpm exec playwright test --project=mobile-safari tests/e2e/right-now-transitions.spec.ts` ac=AC-1 -->

NOT a bare URL swap (spec §3.5, R2-repaired). Per-case contract:

0. **Invariant-9 repair on the retained call surface FIRST** (plan review R4 F2 — five Supabase
   call sites survive the migration and violate the call-boundary discipline today): the helper's
   `showRes`/`crewRes` whole-response holds (`tests/e2e/helpers/rightNow.ts`), the spec's
   `si`/`upd` holds, and the `afterAll` `run_of_show` restore that never inspects its error —
   returned errors do not throw, so a FAILED RESTORE leaks mutated seed state while the suite and
   the dispatch bar stay green. Every retained site destructures `{ data, error }` and throws on
   `error` with a message naming the site (setup AND restore paths); the restore failure mode is
   the loud one by construction. These are test-local call sites, not lib helpers, so no
   `_metaInfraContract` registry row applies — the fail-loud throw IS the discipline here.
1. Extend `driveToState` (`tests/e2e/helpers/rightNow.ts`) to assert the RENDERED RightNow state kind after navigation — the live DOM already exposes the discriminant on the `right-now-state` element (`data-state` / `data-rendered-state` / `data-treatment`); HTTP 200 alone passes on lost semantics. This extension is the task's first RED (mutant: request `viewer_off_day` under a viewer that ignores restrictions → helper must fail).
2. Migrate the two clock-driven cases (midnight rollover; non-show-now → show-day) to the shareToken route under the §3.2 admin recipe; keep `page.clock.install` + the `run_of_show` beforeAll/afterAll seed mutation. **These two cases navigate directly (they do not call `driveToState` today — plan review R2 F4), so each gets its own rendered-state assertion: after every `goto` AND after every clock-tick transition, assert `data-state`/`data-rendered-state` on `right-now-state` matches the case's intended kind — the anchor-text assertions alone cannot distinguish a lost state from a coincident render.**
3. The recovery case enters `viewer_off_day` by mutating the viewer's restriction — admin resolution never enters it. Options in order: per-test crew row through real resolution via the LIVE stage-restricted mechanism — an email-matched test-auth session + `seedShowWithCrew` crew row (`tests/e2e/stage-restricted-crew-schedule.spec.ts` header: "Why an email-matched Google session (not a picker cookie)" — picker cookies fail on WebKit over plain http, and Task 6's command runs mobile-safari, so the picker-cookie path is NOT usable here; plan review R1 F8) if it fits the timebox; else CASE valve — `BL-` row (exception (a)/(c), probe attached) + registered static skip carrying the ref, and the file wires only if `REQUIRED` + skip registration stay honest.

**Whole-file valve:** further harness dependencies beyond the above → `BL-` row (exception (c)) WITH the fired valve's probe evidence copied in, file stays `UNSEEN`, skip wiring in Task 9, and the disposition is recorded under spec §6.6 (the consequence bound's documented-limit state — not silent). Deleting the two dead blocks already happened in Task 3. Project honesty: wire only under projects where tests genuinely execute.

## Task 7 — footer sticky/flow e2e test (layout-dimensions residue) + DEFERRED.md dispositions

<!-- task: red=`CREW_E2E_ONLY=1 pnpm exec playwright test --project=mobile-safari tests/e2e/crew-page.spec.ts --grep "footer position"` ac=AC-4 -->

**RED form (plan review R1 F5):** after writing the test (its title contains "footer position" so
the grep selects it), mutant-red it: strip the footer's bottom-anchoring class/style in the crew
Footer render path — short-content assertion fails; restore. The production mechanism under test
is the footer's anchored-vs-flow layout, not the test's own existence.

**Probe FIRST (plan review R2 F5 — the mutant premise must be true against the live tree):** the live topology is `page-shell` (flex min-h-screen column, `app/show/[slug]/layout.tsx`) → `crew-shell` (plain block div, `_CrewShell.tsx`) → `page-footer` with `mt-auto` (`components/layout/Footer.tsx`) — `mt-auto` is INERT inside a non-flex parent, so the short-content anchoring invariant may not hold in the product at all. Step 1: real-browser rect probe on a seeded short-content section at 390×844 — is the footer's bottom edge within the viewport?

- **Branch A (invariant holds):** identify the mechanism that actually anchors it (whatever the probe shows — NOT assumed `mt-auto`), then write the test (title contains "footer position") + mutant-red against THAT mechanism: strip it, short-content assertion fails, restore. Long-content half: footer below fold, page scrolls to it. `getBoundingClientRect` via gated locators; derive short/long from two different seeded sections, never hardcode pixels; if the seed lacks a reliably-short section, mutate content in beforeAll via the established locked-helper pattern and restore after.
- **Branch B (invariant broken in product):** file the severity-tagged product-defect `BL-` row with the probe output (spec §3.3 product-defect branch); NO test lands; if instead a small fix is chosen (e.g. making `crew-shell` participate in the flex chain), that diff is UI code and runs the invariant-8 impeccable dual gate before the test lands (§1.1.6 — update the closeout marker from N/A accordingly).

Footer FLAKE demotion (Branch A test flaking under the dispatch bar) is decided in Task 11 step 1 with run links (plan review R2 F3). Also in this commit: annotate the M4 `DEFERRED.md` rows per the class-sweep table.

## Task 8 — valve ledger rows (only)

<!-- task: red=`pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` ac=AC-4 -->

File any valve `BL-` rows fired by Task 6 (§5.7 case/whole-file) and Task 7's product-defect branch, with exception letters + probe evidence. NOT filed here: theme-toggle (no valve — AC-1 wires unconditionally), pack-list (no valve — deterministic vitest, plan review R2 F3), footer FLAKE demotion (evidence only exists during Task 11's dispatch bar; it files there, in the triage commit). The ARCHIVE of `BL-RESURRECT-MOBILE-SAFARI-E2E`, the parent-census restatement, and the in-progress marker removal all live in Task 11 step 3.

## Task 9 — wire into crew-e2e.yml + REQUIRED rows + allowlist removals

<!-- task: red=`pnpm vitest run tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts tests/ci/_metaE2eWorkflowCoverage.test.ts` ac=AC-1,AC-5 -->

Add `tests/e2e/crew-page.spec.ts` + `tests/e2e/theme-toggle.spec.ts` (+ `right-now-transitions.spec.ts` iff Task 6 landed) to the workflow's single `playwright test` invocation. **Project honesty (spec §3.1, R1 F3):** remove `crew-page` from the desktop-chromium testMatch regex in this commit — its 22 `project.name !== "mobile-safari"` early-returns make desktop executions counted no-ops; apply the same test to theme-toggle and right-now-transitions (wire each only under projects where its tests genuinely execute). RED: the wiring suite's key-set parity check fails until `REQUIRED` gains matching rows; add rows with values from `pnpm exec playwright test --list` under exactly the projects each spec is wired for (full executable set — never 1; runtime-skip-registered tests documented per row like picker-flow's). **Create the three fail-by-default assertions declared in the meta-test inventory — this task, explicit work items, each with its own mutant-red (plan review R2 F1: declared-but-unassigned guards can be silently omitted):**

1. Wiring test: introduce `const ENROLLED` (the wired specs) + `const EXEMPT` (the four pre-contract specs, each with a reason string); generate the `expectWired` invocations from `ENROLLED.map(...)`; assert `ENROLLED ∪ EXEMPT` equals the workflow's spec file list (derived via the existing `playwrightTestSegments`). Mutant-red: add a spec filename to the workflow command without enrolling — assertion fails.
2. Wiring test: for every `ENROLLED` spec assert `spec in EXPECTED_SKIPS` (kill the `?? []` pass-through for enrolled specs); theme-toggle's row is explicitly `[]`. Mutant-red: delete theme-toggle's row — fails.
3. Coverage meta-test: for every spec named in a paths-ignore workflow's run command, assert its allowlist value is not `UNSEEN`. Mutant-red: leave crew-page's row `UNSEEN` — fails (this is also the task's natural RED, since the reclassification lands in this task).

**Vestigial project-gate sweep** (spec §3.1, R4 F1): in the same commit as the desktop-regex removal, delete all 22 `testInfo.project.name` early-return sites in crew-page.spec.ts (17 live + 5 in the kept §4.10 block — that block keeps tests/titles/header verbatim, loses only gate lines). `expectNoProjectGate` inside `expectWired` scans the whole file, so enrollment is impossible while any remain. Verify sweep neutrality against a baseline captured immediately before the sweep in this task: run the file once pre-sweep and once post-sweep — executed/failed/skipped counts identical (triage in Tasks 1–2 may have changed the absolute numbers; the sweep must change NOTHING — spec §1.1.7), skip inventory still the 4 §4.10 titles. **Enroll each wired spec in `expectWired`** (spec §3.1, R3 F1): one invocation per wired file in `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` + an exact-title `EXPECTED_SKIPS` row (crew-page: the §4.10 block's four titles + any Task-1/2 triage skips; theme-toggle: `[]`; right-now-transitions: valve skip title if the case valve fired) — this is the machine pin for project honesty + skip inventory; RED for this half: enrollment added before workflow edit fails on the unwired file. **Reclassify** the wired files' allowlist rows `UNSEEN` → `PATH_GATED_BY_EXCLUSION` (spec §3.1 — crew-e2e.yml is paths-ignore-triggered; the scanner never marks its specs covered; precedent rows: crew-section-toggle, alert-action-links, font-binding, font-rendering-census). Update the workflow header comment (spec §3.1) and check job runtime: if the enlarged suite approaches the 25-minute timeout in dispatch runs, raise `timeout-minutes` in the same commit with the measured duration cited.

## Task 10 — full local gates

<!-- task: red=`pnpm test` ac=AC-6 -->

`pnpm test` (full vitest), `pnpm typecheck` (vitest AND playwright tsconfigs), `pnpm lint`, `pnpm format:check`, `pnpm spec:lint` on this plan + the spec. All green before push. (e2e/env-bound suites are excluded from `pnpm test` by design — the e2e proof is Task 11's dispatch runs.)

## Task 11 — ledger closeout, push, 5-green bar, PR, whole-diff review, merge

<!-- task: red=`BAR=$(gh run list --workflow=crew-e2e.yml --branch test/resurrect-mobile-safari-e2e -e workflow_dispatch --json conclusion,status,headSha | jq -re '[.[] | select(.status=="completed")][0:5] | if length == 5 and all(.conclusion=="success") and ([.[].headSha] | unique | length) == 1 then .[0].headSha else halt_error end') && git cat-file -e "$BAR^{commit}" && test -z "$(git diff --name-only "$BAR"..HEAD | grep -vE '^(docs/|BACKLOG|DEFERRED)')"` ac=AC-2,AC-5,AC-6 -->

Ordering is load-bearing (plan review R1 F2/F3 + R2 F2 — the reviewed diff must BE the merged diff, AND the in-progress marker must survive every step that can still add commits):

1. Push. Fire `gh workflow run crew-e2e.yml --ref test/resurrect-mobile-safari-e2e` five times, sequentially — **five consecutive green normal-dispatch runs**; a red run resets the count and triggers triage per spec §4 (triage commits land here, BEFORE any review or closeout; if a triage disposition demotes the footer residue, its `BL-` row + registered skip + `EXPECTED_SKIPS`/`REQUIRED` adjustments land in the same triage commit — this is where the footer flake valve lives, plan review R2 F3). The task's `red=` command is the executable two-part gate (plan review R3 F1 + R4 F1): (a) the latest five completed `workflow_dispatch` runs are all green AND share ONE `headSha` — the BAR sha, the code tip the bar was earned on; (b) every commit between the BAR sha and current `HEAD` touches only ledger/docs paths (`docs/`, `BACKLOG*`, `DEFERRED*`) — so the closeout commit and any reverted-and-redone scoped-round repairs never invalidate the bar, while ANY code/test/workflow commit after the bar forces re-earning it. Re-evaluate this gate immediately before merge. The `git cat-file -e "$BAR^{commit}"` link fails CLOSED when the bar sha is absent from the local repo (plan review R5 F1 — a bare `git diff` error inside command substitution yields empty stdout and `test -z` passes; probed 2026-08-09: fake sha → fails-closed, real ancestor sha → evaluates the tail).
2. Open PR (class-sweep output + registry reconciliation counts + triage mechanisms + 5-green run links in body). Whole-diff Codex review via codex-guard (`--stage diff`; split tight-scope briefs: (1) workflow+registries, (2) test rewrites/deletions, (3) docs/ledger). Repair rounds re-review the post-repair diff; if a repair touches the e2e surface (workflow, wired specs, registries), re-run step 1's gate before re-dispatching review. APPROVE must be on the tree as of its dispatch.
3. **Ledger closeout commit (the PR's last commit):** archive `BL-RESURRECT-MOBILE-SAFARI-E2E` → `BACKLOG-archive.md` (keep the 2026-08-06 CORRECTION block in the archived body), restate the parent `BL-E2E-APP-DEPENDENT-SPECS-CI-DARK` census FROM the final meta-test allowlist (run the suite, count rows — never arithmetic), REMOVE the in-progress marker — one commit, green against `tests/docs/_metaLedgerInProgress.test.ts` (archives reject in-flight entries, so marker removal and archive land together). The marker survives steps 1–2, so any triage/repair commit happens while the claim is still visible (invariant 12).
4. **Scoped closeout review:** dispatch a tight-scope codex-guard round on the closeout commit's diff alone (docs-only). If it demands repairs (plan review R3 F2 — nothing may land after the marker-removal commit): `git revert` the closeout commit (restoring the marker and un-archiving, so the claim is visible again while work continues), land the docs repair, re-run step 3 as a FRESH closeout commit, and re-dispatch this scoped round. The loop invariant: the marker-removal commit is ALWAYS the branch tip at merge time. The whole-diff APPROVE from step 2 remains valid for the code tree; the merged diff is the union both rounds covered.
5. Real CI green → `gh pr merge --merge` → ff-sync main → verify `git rev-list --left-right --count main...origin/main` == `0 0` → Stage 4.4 teardown (CronDelete, pane/agent label clear).

<!-- tasks: end -->

## Closeout

impeccable-gate: N/A — no UI surface

(Re-evaluate if Task 1/2 triage lands a product fix under `app/`/`components/` — then run the dual gate on that diff and record findings here per invariant 8.)
