# Agenda fold seeded e2e + WebKit a11y leg — design

**Date:** 2026-08-02
**Backlog:** `BL-AGENDA-FOLD-NO-SEEDED-E2E` (primary, BACKLOG.md — "the fold is never exercised through the real crew page") + `BL-AGENDA-A11Y-WEBKIT-COVERAGE` (rider, BACKLOG.md — "the fold's accessibility proof runs Chromium only").
**Diff class:** test + test-helper + CI config only. No UI code, no DB migrations, no advisory-lock surfaces, no error-code catalog rows.

## 1. Problem

Coverage for the per-viewer agenda day fold (PR #610) is matcher unit tests, jsdom component
tests, two self-hosted browser specs, and a jsdom mock of the `ScheduleSection` seam. Nothing
renders the fold through the real crew page, so the composition
`effectiveViewerDateRestriction` → `aggregateDays`/`visibleShowDays` → `visibleAgendaDaysForViewer`
→ rendered `<details>` fold is only ever verified in pieces. Separately, the fold's real-browser
accessibility proof (`tests/e2e/agendaScheduleLayout.spec.ts`, the `a11y:` test at line 453) runs
only under the single `standalone-chromium` project (`tests/e2e/standalone.config.ts:98-103`),
even though the `<h3>`-inside-`<summary>` structure is outside HTML's strict content model and
"the engine exposes both semantics" is an empirical per-engine claim. Safari is an explicit crew
target.

## 1.1 Resolved scope — do not relitigate

All four ratified by the project owner in the 2026-08-02 brainstorming session (AskUserQuestion,
all four answers = the recommended option):

1. **Autonomous ship approved.** Full pipeline through merged PR; user spec/plan review gates
   waived per AGENTS.md brainstorming gate.
2. **Placement: extend `tests/e2e/stage-restricted-crew-schedule.spec.ts`** with a second,
   self-contained `describe` block (own seeded show, own teardown). NOT a new spec file. The file
   is already in the `mobile-safari` project's `testMatch` (`playwright.config.ts:63-66`), so
   there is no new config entry and no new coverage-registry row.
3. **CI wiring: add the file to the crew-e2e run command** (`.github/workflows/crew-e2e.yml:143`)
   and transition its registry row in `tests/ci/_metaE2eWorkflowCoverage.test.ts:109` from
   `UNSEEN` to `PATH_GATED_BY_EXCLUSION` — NOT a deletion. `crew-e2e.yml` carries
   `pull_request.paths-ignore`, so the scanner deliberately never classifies its specs as
   `covered` (review R1 probe: the proposed command yields `covered: []`, rejection reason
   `pull_request.paths/paths-ignore filter`); the three specs already in that workflow all hold
   `PATH_GATED_BY_EXCLUSION` rows (`_metaE2eWorkflowCoverage.test.ts:60-61` and the picker-flow
   row), and a deleted row would make the dark-spec assertion
   (`_metaE2eWorkflowCoverage.test.ts:170`) fail. The pre-existing stage-restricted assertions
   start running in CI (on every PR the paths-ignore filter doesn't exclude) as a deliberate
   side effect.
4. **WebKit rider shape: a scoped project in `tests/e2e/standalone.config.ts`** (Desktop Safari,
   testMatch pinned to `agendaScheduleLayout.spec.ts`, `grep` pinned to the `a11y:` title), NOT a
   workflow matrix leg.

Also settled, cited so review verifies instead of re-deriving:

- **The show-wide completeness rule of `visibleAgendaDaysForViewer` is untouched.** Per-link
  completeness is `BL-AGENDA-PERLINK-COMPLETENESS` (BACKLOG.md), explicitly deferred there
  because loosening it re-opens a six-defect class. This diff adds tests and config only; any
  finding proposing matcher/component changes is out of scope.
- **`BL-AGENDA-ADMIN-WRAPPER-HARNESS-FIDELITY` is owned by another session** (step-3 cluster).
  Nothing here touches the admin wizard harness.
- **The BACKLOG framing "this is fixture and seed work" (`supabase/seed.ts:228`) is superseded.**
  Re-verification against live code (the whole lesson of BACKLOG's sweep-status section) found
  the crew e2e suite's actual seeding seam is `tests/e2e/helpers/seedShowWithCrew.ts` —
  direct service-role inserts, already carrying `dates` and per-crew `dateRestriction` options.
  Extending it with an `agendaLinks` option is strictly cheaper and stays inside the established
  crew-e2e pattern. `supabase/seed.ts` is not touched.
- **Dimensional invariants / transition inventory / flag lifecycle / tier×domain matrices: N/A**
  — no component, no visual state, no flag, no DB object changes. Guard conditions for the one
  new helper option are in §3.1.

## 2. What ships

Two independent units, one PR:

- **U1 — seeded fold e2e:** `seedShowWithCrew` gains `agendaLinks`; a new `describe` in
  `stage-restricted-crew-schedule.spec.ts` seeds a show whose `agenda_links` carry a
  high-confidence extraction with parseable day labels plus TWO date-restricted crew members
  with complementary day assignments, loads the real share-link route as each viewer
  (picker-cookie path), and asserts each viewer's own day row is open and marked while the
  other day folds. Wired into `crew-e2e.yml`.
- **U2 — WebKit a11y leg:** a `standalone-webkit-a11y` project in `standalone.config.ts` scoped
  to exactly the a11y test, webkit browser install lines in `standalone-e2e.yml`, and the
  regenerated `tests/e2e/standalone-baseline.json`.

## 3. U1 — seeded fold e2e

### 3.1 Helper extension

`tests/e2e/helpers/seedShowWithCrew.ts` — `SeedShowWithCrewOptions` gains:

```ts
/** shows.agenda_links jsonb. Omit → column left NULL (getShowForViewer decodes to []). */
agendaLinks?: ShowRow["agenda_links"];
```

written in the existing `shows` insert as `agenda_links: options.agendaLinks ?? null` (same
pattern as the `dates` option at `seedShowWithCrew.ts:128`). `ShowRow["agenda_links"]` is
`{ label: string; fileId?: string; url?: string; extracted?: AgendaExtraction }[]`
(`lib/parser/types.ts:236`). Guard conditions: omitted/`undefined` → `null` column, which
`getShowForViewer` decodes to `[]` (`lib/data/getShowForViewer.ts:431`) → `hasAgenda` false →
no agenda area rendered (`components/crew/sections/ScheduleSection.tsx`, `hasAgenda`), i.e.
every existing caller is byte-identical unaffected. Empty array behaves the same. No other
values are validated by the helper — it is a test seam and callers own their fixture shapes,
same as the existing `dates` option.

### 3.2 Fixture, grounded derivation

Show dates (all in the past relative to any run date, matching the template's frozen-clock
convention): `travelIn 2026-05-04`, `set 2026-05-05`, `showDays ["2026-05-06", "2026-05-07"]`,
`travelOut 2026-05-08`. TWO date-restricted crew members, both no-email, unclaimed
(picker-cookie selection by id, exactly the template's viewer mechanism at
`stage-restricted-crew-schedule.spec.ts` header "Why a picker-cookie viewer"):

- "Fold Fiona", `dateRestriction: { kind: "explicit", days: ["2026-05-06"] }` → expects row 0
  open+marked, row 1 folded.
- "Thursday Theo", `dateRestriction: { kind: "explicit", days: ["2026-05-07"] }` → expects row 1
  open+marked, row 0 folded.

The second viewer exists to kill a degeneracy the review R1 probe demonstrated: with one viewer
assigned row 0, a seam regression that returns a CONSTANT `{kind:"subset", rows:{0}}` for every
explicit viewer satisfies every single-viewer assertion (and the admin control cannot catch it —
admins bypass the matcher with `{kind:"all"}`). Two viewers with complementary assignments make
"same subset for every viewer" fail one of the two tests, so the suite genuinely pins the
`viewerDates`/`restrictionDays` → row composition.

`agenda_links`: one link,

```ts
{
  label: "AGENDA",
  fileId: "agenda-fold-e2e-fileid",       // fake; AgendaEmbed renders buttons only and
                                           // fetches /api/asset/agenda/... solely on click
                                           // (components/agenda/AgendaEmbed.tsx:95-101), which
                                           // this spec never performs.
  extracted: {
    confidence: "high", corrections: 0, extractorVersion: 1,
    days: [
      { dayLabel: "Wednesday, May 6, 2026", date: null, sessions: [ ...≥1 session ] },
      { dayLabel: "Thursday, May 7, 2026",  date: null, sessions: [ ...≥1 session ] },
    ],
  },
}
```

Every session carries a non-empty `time` string, `title`/`room`/`drift` string-or-null, and
`tracks: []` — the exact shape `normalizeAgendaExtraction` requires
(`lib/agenda/normalizeAgendaExtraction.ts:16-48`); top-level requires `confidence`
"high"|"low", numeric `corrections` and `extractorVersion`, and a non-empty `days` array for
"high" (`normalizeAgendaExtraction.ts:50-73`). `date: null` mirrors the live extractor
(`lib/crew/agendaViewerDays.ts` header: "The live extractor writes `date: null` on every
`AgendaDay`").

Walk the real pipeline (`ScheduleSection.tsx`, hoisted day-derivation block →
`AgendaScheduleBlock` render):

- `aggregateDays(dates)` → 5 aggregate days; `visibleShowDays(dates, restriction)` →
  showDays ∩ {05-06} = {05-06}; `visibleDays` filter → [05-06]; `viewerDates = ["2026-05-06"]`;
  `restrictionDays = ["2026-05-06"]`.
- `visibleAgendaDaysForViewer(extracted, viewerDates, restrictionDays)`
  (`lib/crew/agendaViewerDays.ts:193`): both labels parse to exactly one date each (05-06,
  05-07) — no ambiguity; disagreement guard: parsed ∩ restriction ⊆ R ✓; located = R (one
  date), complete; every row parses → Fiona returns `{ kind: "subset", rows: {0} }`, Theo
  `{ kind: "subset", rows: {1} }`. (Review R1 ran the Fiona derivation as a live probe:
  `{kind:"subset", rows:[0]}` confirmed.)
- `AgendaScheduleBlock` (`components/crew/AgendaScheduleBlock.tsx:68-88`): for Fiona `isOpen(0)`
  true, `isOpen(1)` false, marker rule: rows.size 1 < days.length 2 → `markerOn(0)` only; for
  Theo the mirror image on row 1.

### 3.3 Assertions (two viewer tests)

Each viewer test navigates `/show/<slug>/<shareToken>?s=schedule` — the `?s=schedule` query is
LOAD-BEARING: an absent `s` resolves to `"today"` (`lib/crew/resolveActiveSection.ts:16`) and
`CrewSections` renders ONLY the active section (`components/crew/CrewSections.tsx:103`), so
without it the agenda area never mounts and assertion 1 fails vacuously. The template's tests
carry the same query (`stage-restricted-crew-schedule.spec.ts:144`). Cookie state: a seeded
`__Host-fxav_picker` cookie for the crew member id and NO Google session (template mechanism,
`seedPickerCookie` helper). With V = the viewer's own row index (Fiona 0, Theo 1) and F = the
other row:

1. Composition proof: `[data-testid="agenda-schedule"]` visible (real jsonb round-trip survived
   `normalizeAgendaExtraction` on the real page).
2. Viewer's day open: `[data-testid="agenda-day-V"]` has the `open` attribute
   (`AgendaScheduleBlock.tsx`, `<details ... open={isOpen(di)}>`).
3. Viewer's day marked: `[data-testid="agenda-day-marker-V"]` visible with text "Your day".
4. Other day folded, not hidden: `[data-testid="agenda-day-F"]` present WITHOUT the `open`
   attribute; its summary `[data-testid="agenda-day-summary-F"]` visible (fold ≠ removal — the
   fold is a de-emphasis, unlike the day-card privacy boundary).
5. No marker on the folded day: `[data-testid="agenda-day-marker-F"]` count 0.

### 3.4 Anti-tautology controls

Two independent controls:

- **Admin test:** same seeded show, same `?s=schedule` navigation, admin viewer via
  `signInAs(ADMIN_FIXTURE)` (template's control-test mechanism): admin resolves
  `dateRestriction {kind:'none'}` → `viewerDays {kind:'all'}` → BOTH `agenda-day-0` and
  `agenda-day-1` carry `open`, and `agenda-day-marker-*` count 0 (marker renders only when it
  distinguishes). Proves the folded rows in §3.3 are a genuine narrowing produced by the
  restriction, not a fixture artifact.
- **Cross-viewer pair (§3.2):** Fiona and Theo have complementary expectations over the SAME
  extraction, so any viewer-independent constant subset fails one of them. This is the control
  the admin test cannot provide, because admins never enter the matcher.

### 3.5 CI wiring

- `.github/workflows/crew-e2e.yml:143`: append `tests/e2e/stage-restricted-crew-schedule.spec.ts`
  to the existing single `playwright test` invocation. The file is claimed by `mobile-safari`
  only (absent from `desktop-chromium`'s testMatch, `playwright.config.ts:76-80`), which is the
  project whose webkit binary the job already installs (`crew-e2e.yml:125-126`).
- **Stale-comment sweep, same commit as the yml edit** (class-swept per review R1 finding 5 —
  every prose surface asserting the three-spec inventory or Chromium-only coverage):
  - `crew-e2e.yml:2-4` header ("client-side section-toggle suite … and the crew picker flow"):
    extend to name all four specs.
  - `crew-e2e.yml:142` step name ("Run crew section-toggle + picker-flow + alert-action-links
    e2e"): extend.
  - `crew-e2e.yml:132-136` "verified with --list: 6 + 6 + 4 tests, 3 files" comment: refresh
    with measured counts (measured at implementation time via `--list`; today's pre-change
    measurement is already 6 + 7 + 4 + 3 in 4 files — the picker-flow count in the live comment
    is ALREADY stale — so the refreshed comment is written from the post-change `--list` run,
    not incremented).
  - `tests/e2e/agendaScheduleLayout.spec.ts:463-466` a11y-test comment ("runs Chromium only …
    filed as BL-AGENDA-A11Y-WEBKIT-COVERAGE"): rewrite to state the WebKit leg exists
    (`standalone-webkit-a11y` project) and the backlog item is closed.
- `tests/ci/_metaE2eWorkflowCoverage.test.ts:109`: transition the stage-restricted spec's
  registry row from `UNSEEN` to `PATH_GATED_BY_EXCLUSION` (see §1.1 item 3 for why not a
  deletion), and update the row's preceding provenance comment. TDD shape: the transition is prose-accuracy, not
  assertion-forced — the registry maps spec → reason string and neither string trips an
  assertion here (the dark-spec assertion at `_metaE2eWorkflowCoverage.test.ts:170` fires only
  on a MISSING row) — so the plan pairs the yml edit + row transition in one commit and proves
  the meta-test green after; the behavioral red for T3 lives in the scanner probe recorded in
  the plan body, not in a red test run.

### 3.6 What U1 leaves unproven (documented limits)

- Single-link agendas only. Multi-PDF date-partitioned shapes systematically fail open by design
  (`BL-AGENDA-PERLINK-COMPLETENESS`, untouched).
- The marker assertion is coupled to the copy "Your day" (`AgendaScheduleBlock.tsx`,
  `agenda-day-marker-${di}` span). A copy change breaks the test loudly; acceptable — the
  testid-based locators carry the structural weight, the text assertion pins the user-visible
  contract.
- The picker-cookie path asserts the cookie-selection viewer identity, not the Google-OAuth
  bootstrap (identical to the template's ratified trade; OAuth-side coverage lives in
  `picker-flow.spec.ts` on desktop-chromium).

## 4. U2 — WebKit a11y leg

### 4.1 Config

`tests/e2e/standalone.config.ts` gains a second project:

```ts
{
  name: "standalone-webkit-a11y",
  testMatch: /agendaScheduleLayout\.spec\.ts/,   // project-level override of the top-level allowlist
  grep: /a11y:/,                                  // UNANCHORED, see below
  use: { ...devices["Desktop Safari"] },
},
```

**The grep is deliberately unanchored.** Playwright applies a project's `grep` to the JOINED
title — `<project name> <file name> <test title>` — per Playwright 1.59.1's vendored internals
(title assembly in the common test module, project filtering in the runner's load utilities;
both probed live in review R1 against this repo's installed copy). A caret-anchored form of
the pattern therefore matches ZERO tests (the joined string starts with the project name) and
the project would be silently empty. The unanchored pattern, WITH the trailing colon, matches
only the one test whose TITLE contains the `a11y:` token: the joined prefix
`standalone-webkit-a11y agendaScheduleLayout.spec.ts` contains `a11y` followed by a space,
never `a11y` followed by a colon, and the file's only test carrying the token in its title is
the top-level one at `agendaScheduleLayout.spec.ts:453` (no `describe` wrapper). Implementation
verifies with `--project=standalone-webkit-a11y --list` resolving exactly 1 test; the baseline
comparator (§4.2) then pins that count structurally.

Rationale pinned in a comment: `devices["Desktop Safari"]` matches the hand-run probe measured
during #610 (BACKLOG: "a temporary `probe-webkit` project ran the a11y test green in 5.0s"); the
`grep` scoping means the file's dimensional tests do NOT run on WebKit (deliberate — the BACKLOG
entry declined a whole-config WebKit leg precisely because it "runs all 439 standalone specs a
second time and would surface unrelated engine differences").

### 4.2 Workflow + baseline

- `.github/workflows/standalone-e2e.yml:68-69`: `playwright install-deps chromium` →
  `chromium webkit`; `playwright install chromium` → `chromium webkit`.
- `tests/e2e/standalone-baseline.json`: regenerate via
  `node scripts/check-standalone-baseline.mjs --write` and commit. The baseline stores per-file
  multisets of `[projectId, projectName, specId, titles]` identities
  (`scripts/check-standalone-baseline.mjs` header), so the new project's test identities are new
  rows; without the regen the post-run comparator step (`standalone-e2e.yml:73`) fails. The
  `--list-check` meta-test tripwire keeps local and CI in lockstep.

### 4.3 Guard conditions / limits

- WebKit runs ONLY the a11y-titled test(s) of one file. Everything else stays
  chromium-only — scope expansion is a future decision, not drift (the grep + testMatch pin it).
- If WebKit's accessibility-tree exposure of `<h3>`-in-`<summary>` regresses in a future
  Playwright/WebKit bump, this leg reds. That is the entire point (the dark-spec-rots lesson:
  a hand-run measurement is not coverage).

## 4.4 Dimensional Invariants

N/A — this diff renders no new component and changes no layout, class, or dimension of any
existing one. The assertions in §3.3 read existing testids/attributes only; the one dimensional
suite this spec touches (`agendaScheduleLayout.spec.ts`) is scoped OUT of the new WebKit project
by the `grep` in §4.1 precisely so no dimensional claim is extended to a second engine.

## 4.5 Transition Inventory

N/A — no visual states are added or modified. The `<details>` open/closed states and their
chevron transition are shipped behavior (PR #610) with their own inventory in that spec; this
diff only asserts the INITIAL open/closed state the server renders.

## 5. Registry / meta-test fan-out (companion-surface checklist)

| Surface | Action |
|---|---|
| `tests/ci/_metaE2eWorkflowCoverage.test.ts` | row transition UNSEEN → PATH_GATED_BY_EXCLUSION + provenance comment (§3.5) |
| `tests/e2e/standalone-baseline.json` | regenerate + commit (§4.2) |
| Stale-comment sweep: `crew-e2e.yml:2-4` header, `crew-e2e.yml:142` step name, `crew-e2e.yml:132-136` --list count comment; `agendaScheduleLayout.spec.ts:463-466` Chromium-only note | all refreshed in the same commits as the edits that stale them (§3.5) |
| `tests/docs/_metaDeferralLedgerGraduation.test.ts` | add BOTH graduated IDs to the graduation registry (`BACKLOG_GRADUATED`, `_metaDeferralLedgerGraduation.test.ts:90`) — the registry drives the archive-only and per-section provenance checks; graduation without the rows leaves those protections dark |
| `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` | extend with the stage-restricted run-command assertion (§6 T3 red) |
| new `tests/ci/` wiring guard for the WebKit leg | created by §6 T4 (project resolves exactly 1 a11y test; standalone-e2e.yml installs webkit) — note: a NEW test file in `tests/` must satisfy the spec-registration detector (`tests/ci/_metaSpecRegistration.test.ts`); vitest include globs cover `tests/ci/*.test.ts` already, plan verifies |
| `tests/ci/_metaStandaloneConfigBranches` / `_standaloneConfigProbe` / `_metaStandaloneConfigEnv` | no action expected — probes observe via `--list`/import and carry no project-count pin (verified: the probe's own header documents project-level testMatch/grep as its motivating cases); plan re-runs them to confirm |
| `tests/log/_metaMutationSurfaceObservability` (invariant 10) | N/A — no mutation surface added |
| invariant-9 registry | N/A — no new Supabase call site; the one touched insert already destructures `{ data, error }` (`seedShowWithCrew.ts:116-130`) |
| §12.4 catalog | N/A — no codes |
| impeccable dual-gate (invariant 8) | N/A — no UI surface; plan closeout carries `impeccable-gate: N/A — no UI surface` |
| BACKLOG graduation | on ship, graduate `BL-AGENDA-FOLD-NO-SEEDED-E2E` + `BL-AGENDA-A11Y-WEBKIT-COVERAGE` to `BACKLOG-archive.md` + update the "Last reconciled" header (graduation meta-test shapes apply) |

## 6. Test plan (TDD order)

1. **T1 (U1 helper):** unit-level typecheck-red — new `describe` in the spec file references
   `agendaLinks` in `seedShowWithCrew` options → `pnpm typecheck` red → add the option → green.
   (The helper has no standalone unit suite; the spec IS its consumer test, per the existing
   helper's pattern.)
2. **T2 (U1 spec):** the three tests of §3.3/§3.4 (Fiona viewer, Theo viewer, admin control),
   red against a stub (option present but not written to the insert → agenda area absent →
   assertion 1 fails), green once the insert carries the column. Run locally:
   `pnpm exec playwright test --project=mobile-safari
   tests/e2e/stage-restricted-crew-schedule.spec.ts`.
3. **T3 (U1 CI):** RED FIRST — extend `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts`
   (the established anti-dark wiring-guard pattern: comment-stripped YAML, run-command
   assertion) to pin `tests/e2e/stage-restricted-crew-schedule.spec.ts` named in the
   crew-e2e.yml run command. The new assertion fails against today's yml (file not named) —
   this is the genuine red the registry row cannot provide (review R2: after the row
   transition, a yml that omits the file still leaves `_metaE2eWorkflowCoverage` green because
   the row exempts it; the wiring guard closes that hole STRUCTURALLY, and permanently). GREEN —
   the yml edit. The registry row transition + stale-comment sweep ride the green commit
   (prose-accuracy edits carry no red state; the behavioral evidence for the row's reason
   string is the scanner probe recorded in the plan body).
4. **T4 (U2):** RED FIRST — a new wiring guard in `tests/ci/` (name fixed at plan time,
   following the same pattern) asserting BOTH: (a) the standalone config resolves a
   `standalone-webkit-a11y` project to EXACTLY one test — file `agendaScheduleLayout.spec.ts`,
   title containing `a11y:` — via a `--list` probe (this also permanently pins the §4.1
   joined-title grep trap: a grep regression to zero or to many tests reds it); (b)
   `standalone-e2e.yml`'s comment-stripped install lines cover webkit. Both assertions fail
   against today's tree (no such project; chromium-only installs). GREEN — the §4.1 project +
   the §4.2 install-line edits. THEN the baseline: `check-standalone-baseline.mjs --list-check`
   is red until `--write` regenerates `tests/e2e/standalone-baseline.json` (comparator
   lockstep, not the TDD red); finally
   `pnpm exec playwright test --config tests/e2e/standalone.config.ts
   --project=standalone-webkit-a11y` green locally (webkit binary already present locally;
   if absent, `pnpm exec playwright install webkit` first).
5. **Full gates before push:** full `pnpm test`, `pnpm typecheck` (vitest AND playwright tsconfigs),
   `pnpm lint`, `pnpm format:check`, plus the touched playwright suites; real CI green is a
   separate close-out gate (crew-e2e.yml and standalone-e2e.yml both fire on the PR).

## 7. Out of scope

- Admin-side wrapper harness fidelity (`BL-AGENDA-ADMIN-WRAPPER-HARNESS-FIDELITY` — other session).
- Per-link completeness (`BL-AGENDA-PERLINK-COMPLETENESS`).
- Any matcher, component, or route code change.
- WebKit coverage for any spec beyond the scoped a11y test.
