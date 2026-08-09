# Resurrect mobile-safari e2e — wire what lives, delete what's superseded, revive the one unique gap

**Date:** 2026-08-09 · **Ledger:** `BL-RESURRECT-MOBILE-SAFARI-E2E` (BACKLOG.md) · **Branch:** `test/resurrect-mobile-safari-e2e` · **Effort:** L

This spec closes `BL-RESURRECT-MOBILE-SAFARI-E2E` at its honest scope. The 2026-08-06 L-wave
correction already established that the `mobile-safari` Playwright project is not dark — three
workflows run it — and that the entry's real content is the set of M4 tile/crew specs matched by
the project but named in no workflow run command. This arc probed that set (2026-08-09) and found
it splits three ways: one file with live, current-route tests worth wiring; ten files that are
100% `test.describe.skip` against a retired mock surface and a route that no longer exists; and
one narrow behavior (theme persistence) tested nowhere else that deserves a rewrite. The work is:
wire the live file, delete the superseded dead files, rewrite the unique one, close or file the
small residues, and correct the ledger.

## 1.1 Resolved scope — do not relitigate

Each decision below is ratified; reviewers verify the citation, not the decision.

1. **Autonomous ship ratified by the user 2026-08-09** (this arc's kickoff conversation): spec +
   plan by this session, implementation + closeout by a delegated Opus session. Both user review
   gates waived per the AGENTS.md autonomous-ship gate.
2. **Scope = wire live + delete superseded + revive theme-toggle.** User selected this over "full
   resurrection" (rewriting all ten dead suites) and over "ledger correction only", after an
   investigation pass whose findings are §2. Do not propose resurrecting the eight
   identity-dependent dead suites; that alternative was considered and rejected.
3. **The ten dead suites' premise is retired, not dormant.** The `?crew=`/`?as=`/`?role=` viewer
   mock is fully removed from production code: the only `searchParams` read in the crew tree is
   `gate`/`s` (`app/show/[slug]/[shareToken]/page.tsx`, the `searchParams` prop type), and
   `tests/data/show-page-role-spoof.test.ts` is a build-failing static guard that the page never
   reads `searchParams.role`. The slug-only route `/show/[slug]` has no `page.tsx` (only
   `layout.tsx`, `[shareToken]/`, `unpublish/` exist under `app/show/[slug]/`) and no middleware
   exists to redirect it, so every dead suite's `page.goto` 404s unconditionally. Deleting these
   suites is not deleting coverage; §2.3 is the per-file coverage accounting.
4. **role-spoof.spec.ts is deleted despite its PARTIAL verdict.** The residue ("nothing executes a
   spoof against a rendered page") has no live surface to exercise: the params it spoofs no longer
   reach any code path, and the static guard pins that they never will silently return. This is a
   DOCUMENTED LIMIT (§6), not a follow-up work item.
5. **Acceptance bar for newly wired specs: five consecutive green normal-dispatch runs** before a
   spec counts as wired — the bar the ledger entry itself sets, demonstrated by
   `lifecycle-layout-e2e.yml` (spec §6.1 / AC-6 of the CI-dark cluster design).
6. **No UI surface.** This arc touches `.github/workflows/`, `tests/`, `scripts/`,
   `playwright.config.ts`, and ledger/spec docs only. `impeccable-gate: N/A — no UI surface`
   applies at closeout. If failure triage (§4) forces a product-code fix under `app/` or
   `components/`, that fix triggers the invariant-8 dual gate for the affected diff — the N/A
   marker holds only while the diff stays out of UI files.
7. **Numeric counts in this spec are probe-time snapshots, not contracts.** Executable-test counts
   change during triage (a repaired test, a deleted runtime skip). The binding rule is the
   derivation procedure (§3.4): `REQUIRED` counts come from the wiring-time `--list`/report of the
   actual run, per the established `font-rendering-census` pattern in
   `scripts/check-crew-e2e-executed.mjs` ("derived from an actual --list run, NOT from arithmetic").

## 2. Findings the scope rests on (probed 2026-08-09)

### 2.1 The population

The ledger entry names ~12 spec files matched by the `mobile-safari` `testMatch`
(`playwright.config.ts`, `mobile-safari` project) but named in no workflow run command — all
`UNSEEN` rows of `tests/ci/_metaE2eWorkflowCoverage.test.ts`.

- **`tests/e2e/crew-page.spec.ts` — live.** Two live describes ("crew redesign layout invariants
  (§4.9 / test 12)" and "crew redesign nav addressability + preview-as + footer report"): 15 live
  test declarations (10 layout + 5 nav; all 15 executed in the §2.2 run — 12 passed, 3 failed;
  spec review R2 corrected an earlier 18-declaration miscount), current
  `/show/[slug]/[shareToken]` route resolved via `signInAs(page, ADMIN_FIXTURE)` (the admin arm
  of `resolveShowPageAccess` renders the CrewShell), Waldorf seed
  (`seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf`), same harness pattern as the already-wired
  `crew-section-toggle.spec.ts`. Three of the layout tests carry runtime-conditional
  `test.skip(...)` guards (gear-grid ≥2 cards, key-times-strip presence) that did not fire on the
  seed. Plus SIX statically-skipped blocks in two distinct classes:
  - **Five pre-redesign tile blocks** (`test.describe.skip`, lines ≥1416) — same class as the
    dead files; deleted (§3.1).
  - **One §4.10 transition-audit block** (`test.describe .skip`, line-wrapped, ~:892, 4 tests) —
    a DIFFERENT class: skipped for a documented webkit technique limit (frozen-clock +
    controlled-rAF stalls the very AnimatePresence transition under test; the block's own header
    documents it and cites its live coverage — `tests/components/crew/transitionAudit.test.tsx`
    structural audit, the §4.9 layout tests, the Task-3 nav tests). KEPT — not deleted, not
    re-enabled; recorded as a documented limit (§6), excluded from `REQUIRED` derivation by its
    static-skip status. Its five project-gate lines are removed with the rest (§3.1's vestigial
    sweep) — a runtime no-op inside a statically-skipped block; the block's tests, titles, and
    header survive verbatim.
- **Ten spec files 100% `test.describe.skip`** (each a spec file under `tests/e2e/`, named by its
  basename here and throughout): schedule-tile,
  transport-tile, status-financials, role-spoof, pack-list, notes-tile, right-now,
  layout-dimensions, empty-state, theme-toggle. All ten carry the same verbatim TODO ("migrate off
  ?crew=/?as=admin mock to signInAs… retired in Task 5.7 follow-up") and all navigate the
  404-ing slug-only route. Three of the ten exercise specific non-LEAD identities
  (transport-tile, status-financials, role-spoof); the other seven navigate as an explicit LEAD
  crew id (spec review R2 corrected an "eight of ten non-LEAD" mischaracterization). The shared
  cost is per-test SPECIFIC crew identity — the retired `?crew=` mock's whole function —
  which `signInAs` cannot reproduce for ANY particular crew row (LEAD or not) without per-test
  crew rows whose email matches a fixture: the actual cost the TODO names.
- **`tests/e2e/right-now-transitions.spec.ts` — mixed.** Two skipped blocks (66-pair matrix audit,
  compound audits) plus one live block ("RightNow per-day Show anchor selection (§5.7)", 3 tests)
  that also navigates the dead slug-only route, so it 404s despite not being skipped.

### 2.2 Local run of the live crew-page tests (seeded, dev server, webkit, 2026-08-09)

12 passed / 3 failed / 7.2 minutes. Failures, for the implementer's triage queue (§4):

1. `inv5: bottom tab-bar full-width + bottom-anchored + equal tabs (390px); top tabs ≥44px` —
   geometry assertion failure, cause unestablished.
2. `preview-as: /admin/show/<slug>/preview/<crewId>?s=venue renders the CrewShell` — non-200.
3. `footer report metadata: preview-as footer carries admin-preview-footer-<slug>-<crewId>` —
   180s `page.goto` timeout on the same admin-preview route family as (2).

(2) and (3) share the admin-preview route family and are plausibly local-dev-only (cold compile /
auth env); CI runs the built artifact. Plausibly ≠ established: §4 requires root-causing, not
assuming.

### 2.3 Coverage accounting for the dead suites

Framing: every tile component the dead suites exercised was deleted in the crew redesign —
`tests/migration/crew-redesign-cleanup.test.ts` pins ScheduleTile / TransportTile / PackListTile /
NotesTile / FinancialsTile / ShowStatusTile gone. Verdicts are on the surviving *behavior* in the
section components.

| File | Verdict | Live coverage / residue |
| --- | --- | --- |
| schedule-tile | SUPERSEDED | `stage-restricted-crew-schedule.spec.ts` (wired) + `tests/components/crew/sections/ScheduleSection.viewerDays.test.tsx` + `ScheduleSection.test.tsx` (unconfirmed-days placeholder) |
| transport-tile | SUPERSEDED | `tests/visibility/scopeTiles.test.ts` (driver / passenger / neither + case-trim the e2e lacked); projection in `tests/data/getShowForViewer.test.ts`; render in `TravelSection.test.tsx` |
| status-financials | SUPERSEDED | COI moved to Venue: `tests/components/crew/sections/VenueSection.test.tsx` asserts `data-testid="coi-status"` renders, sentinel-guarded |
| role-spoof | PARTIAL → documented limit (§1.1.4) | positive controls in `scopeTiles.test.ts`; negative pinned statically by `tests/data/show-page-role-spoof.test.ts` |
| pack-list | PARTIAL → residue closed in-arc | phase gate + stage_restriction: `tests/visibility/packList.test.ts`; cap: `CardinalityCapBoundary.test.tsx`; wiring: `GearSection.test.tsx`. **Residue:** `GearSection.tsx` renders `item.rawSnippet` inline (the `item.rawSnippet ?` branch) and no test in any crew-render context references `rawSnippet` — §3.3 adds one component test |
| notes-tile | SUPERSEDED | `TodaySection.test.tsx` (5 sources in order, transport gated) + `CardinalityCapBoundary.test.tsx` (SOURCE_CAP, TRUNCATE_AT summary/details) |
| right-now | SUPERSEDED | `tests/time/rightNow.test.ts` (all §8.2 precedence rows) + `tests/components/crew/rightNowHero.test.tsx` (12-state eyebrow/lead map) |
| layout-dimensions | PARTIAL → residue closed in-arc | inv1–3 live in `crew-page.spec.ts` + `crew-layout-dimensions.spec.ts`; inv4 moot (NotesTile gone). **Residue:** footer sticky-to-viewport on short content / natural flow on long — §3.3 adds one e2e test to the live crew-page spec |
| empty-state | SUPERSEDED | `tests/visibility/emptyState.test.ts` (sentinels; N/A + TBA named) + `tests/visibility/openingReelText.test.ts` (URL-strip) + `GearSection.test.tsx`; `empty-state-reachability.spec.ts` is a separate file and stays, but it is itself still `UNSEEN` and NOT load-bearing for this verdict — the vitest coverage is. Its "no `<video>`" assertion is obsolete — M7 shipped OpeningReelVideo |
| theme-toggle | UNIQUE → rewritten in-arc (§3.2) | live `crew-page.spec.ts` covers only the instant `data-theme` flip mid-crossfade. Nothing covers persistence: `ThemeToggle.tsx` writes `localStorage["fxav-theme"]` (`STORAGE_KEY`), read by the no-FOUC inline script in `app/layout.tsx`; `tests/help/header.test.tsx` mocks the component. Tap-target ≥44px also untested |

## 3. Work items

### 3.1 Wire `crew-page.spec.ts` into `crew-e2e.yml`

After §4 triage reaches 0 failed locally: add `tests/e2e/crew-page.spec.ts` to the workflow's
single `playwright test` invocation (it keeps the one-invocation shape — the workflow's own
comment explains why: each Playwright process cold-builds its own webServer).

**Mobile-safari only — remove crew-page from the desktop-chromium `testMatch` in the same
commit.** Probed (spec review R1): every live crew-page test early-returns off
`testInfo.project.name !== "mobile-safari"` (22 sites), so a desktop-chromium execution is a
passing no-op that `scripts/check-crew-e2e-executed.mjs` (`status === "passed"`) and the wiring
parity test would both credit as executed coverage. The `font-rendering-census` both-projects
precedent does NOT apply — that suite runs real assertions under both projects; crew-page does
not. Its `REQUIRED` count is therefore the mobile-safari resolution alone.

**Vestigial project-gate sweep — prerequisite of enrollment** (spec review R4 F1): once
crew-page leaves the desktop-chromium regex, its 22 `testInfo.project.name` early-return sites
(17 in live tests, 5 in the kept §4.10 block) are runtime no-ops — and
`expectWired`'s `expectNoProjectGate` scans the WHOLE FILE and rejects any `project`/`testInfo`
identifier, so enrollment is impossible while they remain. Remove all 22 in the same commit as
the regex change. Verification that the sweep changed nothing real: executed count unchanged
(the same 15 tests run under mobile-safari) and skip inventory unchanged (the §4.10 block's four
titles still statically skipped).

**Enroll every newly wired spec in `expectWired`** (spec review R3 F1):
`tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` gets one `expectWired` invocation per
wired file (crew-page, theme-toggle, right-now-transitions-if-wired) — that helper, not
`REQUIRED`, is what machine-pins the exact static-skip inventory (via an `EXPECTED_SKIPS` row
listing each deliberately-skipped case by exact title — crew-page's kept §4.10 block's four
titles, any triage or §3.5 valve skips) and the project set the spec genuinely executes under.
Without enrollment, AC-1's "no early-return no-ops credited" is a promise with no guard.

Add a `REQUIRED` row per §3.4. **Reclassify** the file's allowlist row in
`tests/ci/_metaE2eWorkflowCoverage.test.ts` from `UNSEEN` to `PATH_GATED_BY_EXCLUSION` — NOT
removed. crew-e2e.yml triggers via `pull_request.paths-ignore`, and the scanner deliberately
never marks a paths-filtered workflow's specs covered (its own "rejects a pull_request
paths-IGNORE filter too" case pins `covered.has(spec) === false`); every already-wired crew-e2e
spec (`crew-section-toggle`, `alert-action-links`, `font-binding`, `font-rendering-census`) sits
in the allowlist as `PATH_GATED_BY_EXCLUSION`, and the wired files follow that precedent. This
reclassification rule applies to every file this arc wires (theme-toggle §3.2,
right-now-transitions §3.5). Update the crew-e2e.yml header comment that currently says "The rest
of the mobile-safari project (crew-page.spec + the M4 tile specs) is still dead-in-CI" — after
this arc that sentence is false.

Delete the five pre-redesign `test.describe.skip` blocks inside `crew-page.spec.ts` (same class as
the dead files; the redesign-cleanup meta-test pins their subject components deleted). The §4.10
transition-audit block (~:892) is NOT in that class and is KEPT — not deleted, not re-enabled;
only its five vestigial project-gate lines go, in §3.1's sweep (§2.1, §6.4) — post-task
verification counts skip forms with a pattern that matches the line-wrapped `describe␤.skip` form
too, expecting exactly one surviving skipped block in the file.

### 3.2 Rewrite `theme-toggle.spec.ts` live

Replace the file's dead content with a live describe against the seeded shareToken route, using
`crew-page.spec.ts`'s exact resolution recipe: `lookupSeededShow` + share-token helper +
`signInAs(page, ADMIN_FIXTURE)`. The recipe matters (spec review R2 F2): an unauthenticated
share-token request renders `SignInOrSkipGate`/`PickerInterstitial`, not the CrewShell, and the
theme toggle exists ONLY in the CrewShell's Footer (`components/layout/Footer.tsx`, rendered via
`_CrewShell`). Every test awaits the crew-shell testid visible before touching the toggle. The
CONTRACT is identity-agnostic (any resolved viewer gets the Footer toggle) — the RESOLUTION is
not, and the recipe is part of the test. Tests:

1. **Persistence + no-FOUC, both directions.** Light→dark: tap toggle → `<html data-theme>` flips
   AND `localStorage["fxav-theme"]` holds the new value → `page.reload()` → the theme survives.
   Then dark→light: tap again, reload again, assert the persisted `"light"` value and restored
   attribute — the reverse branch is part of the contract, not a symmetry assumption.
2. **The no-FOUC oracle proves FIRST-BODY-CHILD application — before any paintable sibling
   exists** (spec review R1 F4 + R3 F2 + R5 F1: a `DOMContentLoaded` handler passes an
   after-the-event check; an end-of-`<body>` script still executes with
   `readyState === "loading"`; and a `bodyPresent === false` requirement is unsatisfiable
   because the live `NO_FOUC_SCRIPT` is the FIRST CHILD OF `<body>` — `app/layout.tsx` renders
   `html > body > script dangerouslySetInnerHTML NO_FOUC_SCRIPT` before `GlobalErrorListener`
   and `children` — so `document.body` necessarily exists when it runs). Oracle:
   `page.addInitScript` installs a `MutationObserver` on `document.documentElement` attributes
   recording `{ value, readyState, bodyChildCount: document.body ? document.body.childElementCount : 0 }`
   per `data-theme` mutation (plus the attribute's initial state when the script runs). After
   reload, assert the attribute reached its persisted value with `readyState === "loading"` AND
   `bodyChildCount <= 1` — at mutation time the body held at most the executing bootstrap script
   itself, so no paintable sibling content preceded the theme application. A
   DOMContentLoaded-handler mutant fails on `readyState`; an end-of-body-script mutant fails on
   `bodyChildCount` (the page's real content parses as earlier siblings). If the bootstrap ever
   legitimately moves (e.g. into `<head>`), the recorded fields make the new placement's expected
   values explicit rather than silently green — the assertion is on the pair, not on placement
   folklore.
3. **Accessibility state pinned across the cycle** (spec review R1 F5 — the dead suite carried
   this and nothing else does): in light mode `aria-pressed="false"` + accessible name "Switch to
   dark theme"; in dark mode `aria-pressed="true"` + "Switch to light theme"; after the reload in
   (1), `aria-pressed` reflects the restored theme. (Copy strings verified against
   `components/layout/ThemeToggle.tsx` at implementation time; if the live copy differs, the test
   pins the live copy and this spec's strings are drafting-time locators.)
4. **Tap target:** toggle's bounding box ≥ 44×44px (DESIGN.md §3 `--spacing-tap-min`).

Wire it into the same crew-e2e.yml invocation + `REQUIRED` row + allowlist reclassification per
§3.1. It stays in both `testMatch` regexes (already present) ONLY if its tests genuinely execute
under both projects — the rewrite must not early-return off a project; if it is authored
mobile-safari-only, remove it from the desktop-chromium regex, same rule as crew-page.

### 3.3 Close the two cheap residues in-arc

1. **pack-list residue:** one component test in `tests/components/crew/sections/`
   (GearSection context) asserting a fixture item with `rawSnippet` set renders that snippet's
   text. Anti-tautology: fixture-derived expected string, scoped extraction to the gear item node.
2. **layout-dimensions residue:** one e2e test appended to the live layout-invariants describe in
   `crew-page.spec.ts`: with short section content the footer's bottom edge is within the viewport
   (bottom-anchored); with long content the footer sits below the fold and the page scrolls to it
   (natural flow). Real-browser `getBoundingClientRect`, per the layout-dimensions plan rule.

**Demotion valve:** if either residue test proves flaky against the 5-green bar, it may be demoted
to a `BL-` row carrying the flake evidence (run logs) and naming exception (c) — but the default
is in-arc, and a demotion without evidence is a review finding.

### 3.4 Delete the nine dead files + config/registry cleanup

Delete nine files under `tests/e2e/`: schedule-tile, transport-tile, status-financials,
role-spoof, pack-list, notes-tile, right-now, layout-dimensions, empty-state (theme-toggle is
rewritten, not deleted). For each:

- Remove its alternative from BOTH `testMatch` regexes in `playwright.config.ts` — **subject to a
  substring-collision check per token** (spec review R1 F2). The regexes are substring
  alternations over basenames, so a token may register files beyond the deleted one. Probed
  collision table for the nine: `layout-dimensions` ALSO matches the surviving
  `crew-layout-dimensions`, `admin-layout-dimensions`, and `admin-nav-layout-dimensions` specs
  (all three actively invoked — phantom-gap-e2e.yml and admin-layout-e2e.yml), so that token is
  NOT removed bare: replace it with explicit `crew-layout-dimensions|admin-layout-dimensions|admin-nav-layout-dimensions`
  alternatives in each regex that needs them (dropping only the bare-basename match). The other
  eight tokens (`schedule-tile`, `transport-tile`, `status-financials`, `role-spoof`,
  `pack-list`, `notes-tile`, `right-now`, `empty-state`) match no surviving file — `right-now`
  does not match `right-now-transitions.spec.ts` and `empty-state` does not match
  `empty-state-reachability.spec.ts`, because each alternative must be followed immediately by
  the literal spec-file suffix — and are removed bare. The implementation re-runs this collision check
  (`--list` before/after, equal file sets minus the deleted nine) rather than trusting this
  table.
- Remove its `UNSEEN` row from `tests/ci/_metaE2eWorkflowCoverage.test.ts` (deleted files' rows
  are REMOVED; wired files' rows are RECLASSIFIED per §3.1 — two different operations).
- **Class-sweep to a derivation:** `rg` each deleted basename across the repo (source comments,
  docs, specs, ledgers) and repair or annotate every reference — the sweep output is the list of
  hits with dispositions, recorded in the PR body. Precedent: `Section.tsx`'s stale "Verified by
  tests/e2e/layout-dimensions.spec.ts" citation was exactly this class (L-wave found it).

`REQUIRED` counts for newly wired specs are derived from the wiring-time run report / `--list`
(per project pair, summed, matching how the checker counts), full executable set — never a floor
of 1, per the registry's own R12 rationale in `scripts/check-crew-e2e-executed.mjs`.

### 3.5 `right-now-transitions.spec.ts`

- Delete the two `test.describe.skip` blocks (66-pair + compound audits). The matrix's structural
  invariants stay pinned by `tests/time/rightNowTransitions.test.ts`; the 12-state copy map by
  `rightNowHero.test.tsx`. The rendered-treatment loss is a documented limit (§6).
- Migrate the live §5.7 block (3 tests) from the dead `/show/[slug]?crew=` URL to the seeded
  shareToken route, and wire the file. **The migration is NOT a bare URL swap** (spec review R2
  F2). Per-case contract:
  - **Each case names its viewer contract, and state entry is ASSERTED.** The block's
    `driveToState` helper verifies only HTTP 200 today (`tests/e2e/helpers/rightNow.ts`, the
    navigate-and-check-200 step); the migrated helper must also assert the RENDERED RightNow
    state matches the requested kind (the hero's state/treatment attribute), so a viewer whose
    resolution ignores the fixture's restriction fails loud instead of passing on coincident
    anchor text.
  - **The clock-driven cases** (midnight rollover; non-show-now → show-day) enter their states
    via `page.clock` against `run_of_show` — genuinely per-show; the admin-resolution recipe
    (§3.2) is expected to work.
  - **The recovery case enters `viewer_off_day` by mutating the VIEWER's restriction** — a
    viewer-scoped state an admin viewer never enters (admin ignores restrictions). Migrating it
    honestly needs a restricted crew viewer through real resolution: per-test crew rows, the
    same cost the dead suites' TODO names. If that exceeds the timebox, THE CASE defers via a
    `BL-` row (exception (a)/(c), probe attached) with a registered static skip carrying the
    `BL-` ref — and the file wires only if its `REQUIRED` row and skip registration stay honest;
    otherwise the whole-file valve below fires.

  Same project-honesty rule as §3.1/§3.2: wire only under projects where the tests genuinely
  execute; reclassify the allowlist row per §3.1 when wired. **Whole-file valve:** if migration
  beyond the above surfaces further harness dependencies, defer via a `BL-` row naming exception
  (c) with the probe output; the file then keeps its `UNSEEN` row and its live block stays
  local-only.

### 3.6 Ledger + docs

- Archive `BL-RESURRECT-MOBILE-SAFARI-E2E` to `BACKLOG-archive.md` as resolved at honest scope
  (wire-live + delete-superseded + revive-unique), removing the in-progress marker in the PR's
  last commit per invariant 12.
- Update the parent `BL-E2E-APP-DEPENDENT-SPECS-CI-DARK` census: its 43-row `UNSEEN` population
  shrinks by every row this arc removes (deleted files + wired files); restate the count from the
  meta-test allowlist after the change, not by arithmetic.
- Add this spec to the specs README index (its directory's README row convention).
- New `BL-` rows only where a §3.3/§3.5 valve fires, each naming its exception and evidence.

## 4. Triage contract for the three known failures

For each §2.2 failure, in the worktree, before wiring:

1. Reproduce individually (`--grep`), then root-cause. No fix without a diagnosed mechanism —
   systematic-debugging discipline, not assertion-loosening.
2. If the cause is environmental (dev-server compile latency, auth env), prove it by running the
   test against a local production build (`pnpm build && pnpm start`, the CI shape) — green there
   with a diagnosed dev-only mechanism is an acceptable close (record in PR body).
3. If the cause is a product bug: small fixes land in-arc (triggering the UI gate per §1.1.6 if
   under `app/`/`components/`); anything larger files a severity-tagged `BL-` row with the repro,
   and the affected TEST (not the whole file) is excluded from wiring via a registered skip with a
   citation — the checker's `REQUIRED` count then reflects the reduced executable set, and the
   skip registration includes the `BL-` ref.
4. If the cause is a test defect (stale assumption, race): repair the test.

## 5. Acceptance criteria

- AC-1: `crew-e2e.yml`'s invocation names `crew-page.spec.ts` + `theme-toggle.spec.ts` (+
  `right-now-transitions.spec.ts` unless the §3.5 valve fired), each with a full-set `REQUIRED`
  row counting only projects under which its tests genuinely execute (no early-return no-ops
  credited; §3.1), each ENROLLED in `expectWired` with an exact-title `EXPECTED_SKIPS` row
  (§3.1 — the machine pin for that promise), and `scripts/check-crew-e2e-executed.mjs` passes on
  the run's own report.
- AC-2: five consecutive green normal-dispatch runs of `crew-e2e.yml` including the newly wired
  specs (workflow_dispatch; the runs used for the bar are linked in the PR).
- AC-3: the nine dead files are gone; neither `testMatch` regex nor the coverage allowlist nor any
  repo prose references them un-annotated (class-sweep output in PR body).
- AC-4: the two residue tests (§3.3) exist and pass in CI, or their demotion `BL-` rows exist with
  flake evidence.
- AC-5: `tests/ci/_metaE2eWorkflowCoverage.test.ts` passes with zero rows for DELETED files and
  `PATH_GATED_BY_EXCLUSION` rows (not `UNSEEN`) for every wired file; the parent ledger entry's
  census is restated from the allowlist.
- AC-6: full local suite (`pnpm test`), typecheck (vitest AND playwright tsconfigs), eslint,
  `format:check` green before push; real CI green before merge.

## 6. Documented limits

1. **Rendered framer-motion transition treatments are not e2e-audited.** The 66-pair matrix and
   compound audits die with §3.5. The matrix's structure and the 12-state copy stay unit-pinned;
   the *rendered animation* has no executable audit. Reviving one is a deliberate future decision,
   not this arc's debt — the suites being deleted never ran in CI either.
2. **No executable role-spoof e2e.** The spoofable params are gone from the code; the static
   source guard (`tests/data/show-page-role-spoof.test.ts`) is the pin. A spoof arriving by a
   future NEW param surface is outside any existing test's reach — that is a property of the
   guard's design (source-scan), stated here so nobody reads the deletion as having removed a
   runtime defense that existed. It did not exist: the dead suite asserted against a route that
   404s.
3. **The superseded suites' behaviors keep unit/component coverage only** (§2.3 SUPERSEDED
   rows). The e2e layer proves the section components mount in a real browser via the wired
   `crew-page`/`crew-section-toggle`/`stage-restricted` specs; per-identity e2e variants
   (rendering as a SPECIFIC crew row — LEAD or non-LEAD; §2.1's corrected census) remain unbuilt,
   same as before this arc. `stage-restricted-crew-schedule.spec.ts` is the one wired precedent
   for a specific restricted-crew viewer (picker-cookie path).
4. **The crew-page §4.10 transition-audit block stays statically skipped** (webkit frozen-clock
   technique limit; the block's header documents the mechanism and its three live coverage
   surfaces). Its 4 tests are excluded from the `REQUIRED` derivation by static-skip status —
   recorded here so the wiring cannot be read as having revived them.
5. **The recovery/`viewer_off_day` §5.7 case may defer** per §3.5's case valve; if it does, its
   `BL-` row + registered skip are the surfaced record.
6. **If §3.5's WHOLE-FILE valve fires, `right-now-transitions.spec.ts` stays live, `UNSEEN`, and
   local-only** — the one arc outcome where a touched file is neither CI-executed nor deleted.
   That disposition is legal ONLY as this documented limit plus its `BL-` row (spec review R3
   F3): the consequence bound's third state ("documented as a limit in §6") is THIS entry, and
   the implementer copies the fired valve's probe evidence into the `BL-` row so the limit is
   auditable, not asserted.

## 7. Out of scope

- The parent `BL-E2E-APP-DEPENDENT-SPECS-CI-DARK`'s non-mobile-safari residual (admin/help/etc.
  `UNSEEN` rows) — untouched except the census restatement.
- Branch-protection promotion of e2e jobs (owner action, per the parent entry).
- Any rewrite of the eight identity-dependent suites (ratified out, §1.1.2).

## Dimensional Invariants

None — this spec designs no UI component and changes no layout. The only dimension assertions are
test-side: the §3.2 tap-target check (≥44×44px per DESIGN.md §3 `--spacing-tap-min`) and the §3.3
footer-position e2e test, both `getBoundingClientRect` in a real browser.

## Transition Inventory

None — no component states are introduced or modified. The deleted 66-pair transition audit's
subject matrix stays unit-pinned (§6.1).

## 8. Review posture (for adversarial-review dispatch)

Consequence bound: every spec this arc touches is either executed in CI with a full-set
executed-count pin, deleted with its coverage accounted for in §2.3, or explicitly documented as
a limit in §6 — never silently dark. Threat-model fence: the guards touched (executed-count
registry, workflow-coverage allowlist) defend against accidental authoring drift by ordinary
contributors; adversarial evasion of the test infrastructure is out of scope and files to
documented limits. Convergence: the §5 ACs are the closable bound; enumeration of further
hypothetical dead-spec classes is not a finding without a live instance.
