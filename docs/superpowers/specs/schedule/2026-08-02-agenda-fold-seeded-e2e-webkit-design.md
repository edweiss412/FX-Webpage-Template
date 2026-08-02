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
   and delete its `UNSEEN` row from `tests/ci/_metaE2eWorkflowCoverage.test.ts:109` (the
   registry's shadowing assertion forces the deletion once the spec becomes covered). The
   pre-existing stage-restricted assertions start running in CI as a deliberate side effect.
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
  high-confidence extraction with parseable day labels plus a date-restricted crew member, loads
  the real share-link route as that viewer (picker-cookie path), and asserts the viewer's day row
  is open and marked while the other day folds. Wired into `crew-e2e.yml`.
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
`travelOut 2026-05-08`. Crew member "Fold Fiona", `dateRestriction: { kind: "explicit", days:
["2026-05-06"] }`, no email, unclaimed (picker-cookie selection by id, exactly the template's
viewer mechanism at `stage-restricted-crew-schedule.spec.ts` header "Why a picker-cookie
viewer").

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
  05-07) — no ambiguity; disagreement guard: parsed ∩ restriction ⊆ R ✓; located = {05-06} =
  R, complete; every row parses → returns `{ kind: "subset", rows: {0} }`.
- `AgendaScheduleBlock` (`components/crew/AgendaScheduleBlock.tsx:68-88`): `isOpen(0)` true,
  `isOpen(1)` false; marker rule: rows.size 1 < days.length 2 → `markerOn(0)` true only.

### 3.3 Assertions (the viewer test)

Navigate `/show/<slug>/<shareToken>` with a seeded `__Host-fxav_picker` cookie for the crew
member id and NO Google session (template mechanism, `seedPickerCookie` helper). Then:

1. Composition proof: `[data-testid="agenda-schedule"]` visible (real jsonb round-trip survived
   `normalizeAgendaExtraction` on the real page).
2. Viewer's day open: `[data-testid="agenda-day-0"]` has the `open` attribute
   (`AgendaScheduleBlock.tsx`, `<details ... open={isOpen(di)}>`).
3. Viewer's day marked: `[data-testid="agenda-day-marker-0"]` visible with text "Your day".
4. Other day folded, not hidden: `[data-testid="agenda-day-1"]` present WITHOUT the `open`
   attribute; its summary `[data-testid="agenda-day-summary-1"]` visible (fold ≠ removal — the
   fold is a de-emphasis, unlike the day-card privacy boundary).
5. No marker on the folded day: `[data-testid="agenda-day-marker-1"]` count 0.

### 3.4 Anti-tautology control (the admin test)

Same seeded show, admin viewer via `signInAs(ADMIN_FIXTURE)` (template's control-test
mechanism): admin resolves `dateRestriction {kind:'none'}` → `viewerDays {kind:'all'}` →
BOTH `agenda-day-0` and `agenda-day-1` carry `open`, and `agenda-day-marker-*` count 0 (marker
renders only when it distinguishes). Proves the folded row in §3.3 is a genuine narrowing
produced by the restriction, not a fixture artifact.

### 3.5 CI wiring

- `.github/workflows/crew-e2e.yml:143`: append `tests/e2e/stage-restricted-crew-schedule.spec.ts`
  to the existing single `playwright test` invocation. The file is claimed by `mobile-safari`
  only (absent from `desktop-chromium`'s testMatch, `playwright.config.ts:76-80`), which is the
  project whose webkit binary the job already installs (`crew-e2e.yml:125-126`). The adjacent
  "verified with --list: 6 + 6 + 4 tests, 3 files" comment is refreshed with the new measured
  counts (measured at implementation time via `--list`, not predicted here).
- `tests/ci/_metaE2eWorkflowCoverage.test.ts:109`: delete the
  `"tests/e2e/stage-restricted-crew-schedule.spec.ts": UNSEEN` row. TDD ordering: the registry's
  shadowing assertion fails while the row exists and the workflow names the file — delete-row is
  the green step after the yml edit (or equivalently: row deletion first makes the
  stale/shadowing pair the failing test; either order yields a failing-then-green pair, the plan
  picks one).

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
  grep: /^a11y:/,                                 // exactly the a11y-titled test(s) in that file
  use: { ...devices["Desktop Safari"] },
},
```

Rationale pinned in a comment: `devices["Desktop Safari"]` matches the hand-run probe measured
during #610 (BACKLOG: "a temporary `probe-webkit` project ran the a11y test green in 5.0s"); the
`grep` scoping means the file's dimensional tests do NOT run on WebKit (deliberate — the BACKLOG
entry declined a whole-config WebKit leg precisely because it "runs all 439 standalone specs a
second time and would surface unrelated engine differences"). The a11y test's title starts with
`a11y:` (`agendaScheduleLayout.spec.ts:453`).

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
| `tests/ci/_metaE2eWorkflowCoverage.test.ts` | delete UNSEEN row (§3.5) |
| `tests/e2e/standalone-baseline.json` | regenerate + commit (§4.2) |
| `crew-e2e.yml` --list count comment | refresh measured counts (§3.5) |
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
2. **T2 (U1 spec):** the two tests of §3.3/§3.4, red against a stub (option present but not
   written to the insert → agenda area absent → assertion 1 fails), green once the insert
   carries the column. Run locally: `pnpm exec playwright test --project=mobile-safari
   tests/e2e/stage-restricted-crew-schedule.spec.ts`.
3. **T3 (U1 CI):** registry row deletion + yml edit as a failing/green pair (§3.5); local proof
   via the meta-test file run.
4. **T4 (U2):** baseline comparator `--list-check` red after adding the project (baseline lacks
   the new identities) → regen baseline → green; then
   `pnpm exec playwright test --config tests/e2e/standalone.config.ts
   --project=standalone-webkit-a11y` green locally (webkit binary present from repo setup;
   if absent, `pnpm exec playwright install webkit` first).
5. **Full gates before push:** full `pnpm test`, `pnpm typecheck` (vitest AND playwright tsconfigs),
   `pnpm lint`, `pnpm format:check`, plus the touched playwright suites; real CI green is a
   separate close-out gate (crew-e2e.yml and standalone-e2e.yml both fire on the PR).

## 7. Out of scope

- Admin-side wrapper harness fidelity (`BL-AGENDA-ADMIN-WRAPPER-HARNESS-FIDELITY` — other session).
- Per-link completeness (`BL-AGENDA-PERLINK-COMPLETENESS`).
- Any matcher, component, or route code change.
- WebKit coverage for any spec beyond the scoped a11y test.
