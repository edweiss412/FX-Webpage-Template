# Step-3 Crew Preview + Ops-Log Disposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin-only route that renders the real crew page from a staged `parse_result` (reached from the step-3 review modal), plus the ratified WON'T-BUILD ledger disposition for the ops-log dashboard entry.

**Architecture:** A pure adapter (`parse_result → ShowForViewer`) reproduces every viewer-dependent projection transform; `CrewShell` gains a `staticPreview` posture suppressing its five emission surfaces; a new `requireAdmin`-gated route + segment error boundary renders the result under a sticky preview banner. Arm 2 is docs-only ledger work.

**Tech Stack:** Next.js 16 RSC, Supabase (read-only), Vitest/jsdom, Playwright.

**Spec:** `docs/superpowers/specs/step3-onboarding/2026-08-15-step3-crew-preview-and-opslog-disposition-design.md` (APPROVED, cross-model round 4). Cited below as "spec".

## Global Constraints

- Invariant 5: no raw error codes in UI; §2.7's exact copy strings; admin-only inline copy uses the `// not-subject:M5-D8`-style precedent (`app/admin/show/[slug]/preview/[crewId]/page.tsx:44-49`).
- Invariant 8: impeccable dual-gate (critique + audit) on the affected diff before adversarial diff review (Task 9); closeout marker line in §12 below.
- Invariant 9: the new Supabase lookup is an exported helper with a `tests/admin/_metaInfraContract.test.ts` registry row (Task 5).
- Invariant 10: N/A — no mutating route or server action is added (spec §2.1); GET pages are outside `tests/log/_metaMutationSurfaceObservability.test.ts`'s population.
- Invariant 2 (advisory locks): N/A — read-only surface, no lock holder added (spec §2.1). No `pg_advisory*` touched.
- Invariant 12: ledger markers come off in the PR's LAST commit (Task 10).
- Copy mechanics: no em-dash in user-visible copy; apostrophes typographic; every interactive target ≥44px (`min-h-tap-min`); tokens only (DESIGN.md §10).
- Heavy phases (`pnpm test`, `pnpm test:e2e`, builds) run under `pnpm heavy` (AGENTS.md slot semaphore).
- Commit per task, conventional-commits style.

**AC crosswalk (spec §4 → tasks):** AC-1 adapter renders every entitled section + financial-string absence (Tasks 1, 3) · AC-2 posture emits nothing (Tasks 2, 3, 8) · AC-3 viewer selection through real transforms (Tasks 1, 3) · AC-4 route guards + malformation arms (Task 5) · AC-5 modal entry link (Task 6) · AC-6 real-browser render, picker, boundary arm, zero forbidden requests (Tasks 4, 7, 8) · AC-7 ledger changes green under the ledger meta-tests (Task 10) · AC-8 existing callers byte-identical (Tasks 2, 3).

**Meta-test inventory (writing-plans rule):** this plan EXTENDS `tests/admin/_metaInfraContract.test.ts` (one registry row, Task 5) and the e2e coverage allowlist `tests/ci/_metaE2eWorkflowCoverage.test.ts` (one `UNSEEN` row, Task 8). No other registry applies: no admin_alerts catalog change (no new alert code), no advisory-lock topology change, no sentinel-hiding surface, no email normalization.

**e2e harness readiness (writing-plans rule):** the Playwright task (Task 8) boots the standard dev server via the existing `crew-e2e`/`admin-route-boundaries` harness config (no new server mechanism); readiness gate = the page's own `data-testid="staged-preview-banner"` visible before the first assertion (never `networkidle` alone); no sampler/`locator.evaluate` call outlives its element (assertions use auto-retrying `expect(locator)` forms only).

**Layout-dimensions verdict:** N/A — no fixed-dimension parent with flex/grid children is introduced (spec Dimensional Invariants section: banner is a sticky flow element). If implementation gives the banner fixed dimensions, Task 8 upgrades to a real `getBoundingClientRect` assertion per the global rule.

<!-- tasks: depth=3 red-contract -->

### Task 1: Adapter — `buildStagedShowForViewer`

**Files:**
<!-- spec-lint: ignore — file created by this task; not yet tracked -->
- Create: `lib/data/stagedShowForViewer.ts`
<!-- spec-lint: ignore — file created by this task; not yet tracked -->
- Test: `tests/data/stagedShowForViewer.test.ts`

**Interfaces:**
- Consumes: `ParseResult` (`lib/parser/types.ts:527`), `asParseResult` (`lib/db/coerceJsonbObject.ts:133`), `normalizeDateRestriction` (`lib/data/normalizeDateRestriction.ts`), `effectiveViewerDateRestriction` (`lib/crew/stageSchedule.ts`), `resolveTransportOwners` (`lib/data/transportOwnerResolve.ts`), `hotelVisibleToViewer` semantics (`lib/data/getShowForViewer.ts:784-787` — if not exported, replicate the filter inline with a comment citing the source), `aggregateDays` (the projection's runOfShow gate, `lib/data/getShowForViewer.ts:795-830`), types `ShowForViewer` (`lib/data/getShowForViewer.ts:143`) and `FinancialsRow` (`lib/data/getShowForViewer.ts:85`), `ProjectedRoomRow` (`lib/crew/resolveKeyTimes.ts:15`).
- Produces (Tasks 4–5, 7 rely on this exact signature):

```ts
export type StagedPreviewRosterEntry = { id: string; name: string; role: string };
export type StagedShowForViewerResult =
  | { kind: "ok"; data: ShowForViewer; selectedId: string; roster: StagedPreviewRosterEntry[] }
  | { kind: "empty_roster" }
  | { kind: "decode_error" };
export function buildStagedShowForViewer(
  parse: ParseResult,
  opts: {
    driveFileId: string | null;
    sourceAnchors: Record<string, SourceAnchor>;
    stagedModifiedTime: string | null;
    checkedAt: string;
    requestedViewerId: string | null;
  },
): StagedShowForViewerResult;
```

Behavior is spec §2.2 verbatim: the 23-field derivability table (Direct / Direct-reshaped / Viewer-filtered / Derived-in-memory / Defaulted / Viewer-derived buckets), surrogate ids `staged-crew-<index>` and `staged-room-<index>`, the runtime-grain normalizer contract (guard-conditions paragraph), agenda `fileId`/`extracted` strip, financial capture-then-null, LEAD-or-FINANCIALS financials gate.

- [ ] **Step 1: Write the failing test file** — cases (derive expectations from the fixture object built in-test, never hardcoded literals; the fixture is a hand-built `ParseResult` with 3 crew members [one LEAD with explicit `6/24` M/D date restriction, one `ONLY***`-style stage-restricted, one unrestricted non-LEAD], 2 hotel reservations naming different members, 2 rooms with the SAME name, agenda_links with one fileId entry + one url-only entry, po/proposal/invoice/invoice_notes populated, runOfShow spanning restricted + unrestricted days):
  1. surrogate ids deterministic (`staged-crew-0..2`, `staged-room-0..1`) and `resolveViewerContext`-compatible (call it: no throw for each roster id);
  2. hotel filter: viewer 0 sees only reservations naming them (assert against the fixture's names, mirroring `lib/data/getShowForViewer.ts:784-787`);
  3. date normalization: the explicit `M/D` viewer's `dateRestriction.days` are ISO and a subset of `show.dates` days;
  4. stage fold: the stage-restricted viewer's effective `dateRestriction` matches `effectiveViewerDateRestriction`'s output for the same inputs (call the real helper on the fixture and compare — right-answer-wrong-mechanism guard);
  5. runOfShow gating: restricted viewer's `runOfShow` keys ⊆ their allowed days; unrestricted viewer sees all aggregate-day keys;
  6. financials: present with the fixture's four values for the LEAD viewer, ABSENT for the non-LEAD viewer; `data.show.po/proposal/invoice/invoice_notes` are all null for EVERY viewer;
  7. agenda strip: every `data.show.agenda_links` entry lacks `fileId` and `extracted`;
  8. defaults: `tileErrors` `{}`, `diagrams` null, `openingReelHasVideo` false, `lastCheckedAt === opts.checkedAt`, `lastSyncedAt === opts.stagedModifiedTime`, `viewerVersionToken === "staged-preview"`;
  9. selection: `requestedViewerId: "staged-crew-1"` → `selectedId` = it; unknown/null → `"staged-crew-0"`;
  10. `empty_roster` on `crewMembers: []`;
  11. normalizers: crew entry `null` and crew entry `{..., name: 7}` dropped; `role_flags: null` → `[]`; `role_flags: [null, "LEAD"]` → `["LEAD"]`; room `{..., name: null}` dropped; `show.dates` union-shape failure → `{ kind: "decode_error" }`;
  12. `transportationOwnerIds` equals `resolveTransportOwners(transportation, roster)` over the surrogate roster.
- [ ] **Step 2: Run to verify red** — `pnpm vitest run tests/data/stagedShowForViewer.test.ts` — Expected: FAIL, the adapter module does not exist yet (unresolved import).
<!-- task: red=`pnpm vitest run tests/data/stagedShowForViewer.test.ts` red-state=authored red-target=`lib/data/stagedShowForViewer.ts` why=`adapter module absent; every case fails on unresolved import` ac=AC-1,AC-3 -->
- [ ] **Step 3: Implement the adapter** per the Produces signature and spec §2.2. Structure: `normalizeCrew(parse, show)` → roster + projected crew; `selectViewer(roster, requestedViewerId)`; per-bucket assembly helpers; single exported function. Reuse the four existing helpers; the hotel filter replicates the projection's alias-set predicate with a `// mirrors lib/data/getShowForViewer.ts:784-787` comment if `hotelVisibleToViewer` is unexported.
- [ ] **Step 4: Run to verify green** — same command. Expected: PASS.
- [ ] **Step 5: Typecheck + commit** — `pnpm typecheck`; `git add lib/data/stagedShowForViewer.ts tests/data/stagedShowForViewer.test.ts && git commit -m "feat(admin): parse_result -> ShowForViewer adapter for staged crew preview"`.

### Task 2: `cardReport` explicit-null widening

**Files:**
- Modify: `components/shared/CardReportTrigger.tsx` (prop type + null guard), `components/crew/primitives/CardHeaderActions.tsx`, `components/crew/sections/TodaySection.tsx`, `ScheduleSection.tsx`, `VenueSection.tsx`, `TravelSection.tsx`, `CrewSection.tsx`, `GearSection.tsx`, `BudgetSection.tsx` (each: `cardReport?: CardReportContext | null`, and thread the null through to `CardHeaderActions`/`CardReportTrigger`)
<!-- spec-lint: ignore — file created by this task; not yet tracked -->
- Test: `tests/components/crew/cardReportNullDisable.test.tsx` (new)

**Interfaces:**
- Produces: every section accepts `cardReport: null` meaning "reporting disabled, no trigger renders"; `undefined` keeps today's `DEFAULT_CARD_REPORT` parameter default (`lib/crew/cardReportContext.ts:26`, `components/crew/primitives/CardHeaderActions.tsx:28`). Task 3 relies on passing `null`.

- [ ] **Step 1: Write the failing test** — for one representative section rendered with a populated fixture (reuse `makeShowForViewer` from `tests/fixtures/showForViewer.ts`) plus `CardHeaderActions` directly: (a) `cardReport={null}` → zero elements match the trigger's accessible name/testid (clone-and-scan per anti-tautology: query the full rendered tree); (b) `cardReport` omitted → trigger present (proves the test can fail and the default is untouched); (c) type-level: `null` assignable (compile is the assertion).
- [ ] **Step 2: Run to verify red** — `pnpm vitest run tests/components/crew/cardReportNullDisable.test.tsx` — Expected: FAIL (type error: `null` not assignable / trigger renders under null).
<!-- task: red=`pnpm vitest run tests/components/crew/cardReportNullDisable.test.tsx` red-state=authored red-target=`components/shared/CardReportTrigger.tsx:38` why=`cardReport prop type rejects null and no null-disable branch exists` ac=AC-2 -->
- [ ] **Step 3: Implement** — widen types at the nine files; in `CardReportTrigger` (or `CardHeaderActions`, whichever receives it first) render no trigger when `cardReport === null`. No behavior change for existing callers.
- [ ] **Step 4: Run to verify green**; run the existing crew-section suites (`pnpm vitest run tests/components/crew/`) — Expected: all PASS untouched (AC-8 half).
- [ ] **Step 5: Typecheck + commit** — `git commit -m "feat(crew-page): explicit cardReport null disables card report triggers"`.

### Task 3: `CrewShell` `staticPreview` posture

**Files:**
- Modify: `app/show/[slug]/[shareToken]/_CrewShell.tsx` (new optional prop; five suppressions per spec §2.6: skip `upsertAdminAlert` at ~:162, skip both `after()` calls at ~:203/:443, do not mount `ShowRealtimeBridge` at ~:507, pass `showId={null}` to `Footer` — its report block is `{showId ? … }`-guarded (`components/layout/Footer.tsx:186`) with prop type `showId?: string | null` (`components/layout/Footer.tsx:63`) — and pass `cardReport={null}` to every section)
<!-- spec-lint: ignore — file created by this task; not yet tracked -->
- Test: `tests/components/crew/crewShellStaticPreview.test.tsx` (new)

**Interfaces:**
- Consumes: Task 2's `cardReport={null}`.
- Produces: `staticPreview?: boolean` prop on `CrewShell`; Task 5 passes `staticPreview` + adapter output.

- [ ] **Step 1: Write the failing test** — harness pattern of `tests/components/crew/crewShellSections.test.tsx` (hoisted `upsertAdminAlert` mock, pinned `nowDate`), fixture via `makeShowForViewer`:
  1. defect-injection arm (anti-tautology): `tileErrors: { venue: "boom" }` + `staticPreview: true` → `upsertAdminAlert` spy has ZERO calls; the SAME fixture with `staticPreview` absent → spy called (proves the assertion discriminates);
  2. no `ShowRealtimeBridge` in the tree under posture (mock it to a marker, assert absent; present in the non-posture render);
  3. no element matching the card-report trigger accessible name anywhere under posture; footer report affordance absent;
  4. AC-8: with `staticPreview` absent, rendered tree of a populated fixture is unchanged vs a pre-change snapshot of section keys + bridge + triggers (assert presence, not bytes);
  5. AC-3 budget gate through the REAL shell: adapter output for a LEAD-or-FINANCIALS-flagged viewer → `budget` in the captured `sectionNodes` keys; a viewer with neither flag → absent (the `crewShellSections.test.tsx` entitlement pattern, expected set derived from the fixture's flags).
- [ ] **Step 2: Run to verify red** — `pnpm vitest run tests/components/crew/crewShellStaticPreview.test.tsx` — Expected: FAIL (`staticPreview` prop not accepted / suppressions absent).
<!-- task: red=`pnpm vitest run tests/components/crew/crewShellStaticPreview.test.tsx` red-state=authored red-target=`app/show/[slug]/[shareToken]/_CrewShell.tsx:162` why=`CrewShell has no staticPreview prop; alert write, after() calls, bridge, footer report, and card triggers all emit unconditionally` ac=AC-2,AC-8 -->
- [ ] **Step 3: Implement** the five suppressions, each a one-line `if (!staticPreview)` guard (or conditional prop), with a comment citing spec §2.6's item number. The `after()` guards must skip REGISTRATION (never register-then-noop).
- [ ] **Step 4: Run to verify green**; run `pnpm vitest run tests/components/crew/ tests/show/ tests/app/crewShellCardReport.test.tsx` — Expected: PASS (regression half of AC-8).
- [ ] **Step 5: Typecheck + commit** — `git commit -m "feat(crew-page): staticPreview posture suppresses all five CrewShell emission surfaces"`.

### Task 4: `StagedPreviewBanner`

**Files:**
<!-- spec-lint: ignore — file created by this task; not yet tracked -->
- Create: `components/admin/StagedPreviewBanner.tsx`
<!-- spec-lint: ignore — file created by this task; not yet tracked -->
- Test: `tests/components/admin/stagedPreviewBanner.test.tsx` (new)

**Interfaces:**
- Consumes: Task 1's `StagedPreviewRosterEntry`.
- Produces: `StagedPreviewBanner({ stagedId, roster, selectedId, rawSection }: { stagedId: string; roster: StagedPreviewRosterEntry[]; selectedId: string; rawSection?: string | undefined })` — Server Component; Task 5 renders it above `CrewShell`.

Visual contract (spec §2.5): the `PreviewBanner` recipe verbatim (`components/admin/PreviewBanner.tsx:60-71` — `role="status"`, `aria-live="polite"`, sticky top, `z-sticky-banner`, `bg-warning-bg text-warning-text`, `shadow-tile`, `border-b border-border-strong`); testid `staged-preview-banner`. Copy: title "Previewing from the sheet (not published yet)"; identity "Viewing as <Name> (<Role>)"; exit link "Back to setup" → `/admin`. Picker: one link per roster entry to `/admin/wizard/preview/<stagedId>?as=<id>` (NO `s` param, spec §2.3), current entry a non-link `<span aria-current="true">`; ≥13 entries → first 11 inline + `<details>` disclosure holding the rest (cap rule, spec §2.3); every link and the exit `min-h-tap-min` inline-flex.

- [ ] **Step 1: Write the failing test** — jsdom: renders title/identity/exit copy exactly (and asserts the banner's text content contains no em-dash character); picker links for a 3-entry roster carry correct hrefs and NO `s=`; selected entry is a non-link with `aria-current`; 14-entry roster → 11 inline links + disclosure containing the remaining 3 (derive counts from the roster fixture length, not literals); `role="status"` present.
- [ ] **Step 2: Run to verify red** — `pnpm vitest run tests/components/admin/stagedPreviewBanner.test.tsx` — Expected: FAIL, component absent.
<!-- task: red=`pnpm vitest run tests/components/admin/stagedPreviewBanner.test.tsx` red-state=authored red-target=`components/admin/StagedPreviewBanner.tsx` why=`component module absent` ac=AC-6 -->
- [ ] **Step 3: Implement**; tokens only, no new tokens, no fixed dimensions (Dimensional Invariants: N/A stands).
- [ ] **Step 4: Run to verify green.**
- [ ] **Step 5: Typecheck + commit** — `git commit -m "feat(admin): staged crew preview banner with viewing-as picker"`.

### Task 5: Route + segment error boundary + invariant-9 registry row

**Files:**
<!-- spec-lint: ignore — both files created by this task; not yet tracked -->
- Create: `app/admin/wizard/preview/[stagedId]/page.tsx`, `app/admin/wizard/preview/[stagedId]/error.tsx`
- Modify: `tests/admin/_metaInfraContract.test.ts` (one `infraRegistry` row for `lookupStagedRow`)
<!-- spec-lint: ignore — file created by this task; not yet tracked -->
- Test: `tests/admin/stagedPreviewRoute.test.tsx` (new)

**Interfaces:**
- Consumes: Tasks 1, 3, 4.
- Produces: `export async function lookupStagedRow(stagedId: string): Promise<{ kind: "found"; row: { stagedId: string; driveFileId: string | null; parseResult: unknown; sourceAnchors: Record<string, SourceAnchor>; stagedModifiedTime: string | null } } | { kind: "not_found" } | { kind: "infra_error" }>` — the registry row's subject.

Route flow is spec §2.1 steps 1–6 verbatim: `requireAdmin()` first line; UUID regex pre-check → `notFound()`; `lookupStagedRow` (session-bound client, select `staged_id, drive_file_id, parse_result, source_anchors, staged_modified_time` from `pending_syncs`, `maybeSingle()`, try/catch → `infra_error`); `asParseResult` in try/catch → decode surface; adapter call with `checkedAt: (await nowDate()).toISOString()` (`lib/time/now`); render banner + `<CrewShell data={...} viewer={{ kind: "admin_preview", crewMemberId: selectedId }} showId="staged-preview" rawSection={s} staticPreview />`. `export const dynamic = "force-dynamic"`. Failure surfaces + testids per spec §2.7 (`staged-preview-infra-error`, `staged-preview-decode-error`, `staged-preview-empty-roster`); copy per §2.7 with the `not-subject` comment precedent. `error.tsx`: client component, same plain copy, testid `staged-preview-render-error`, "Back to setup" link.

- [ ] **Step 1: Write the failing test** — direct page-function invocation with `lookupStagedRow` module-mocked (the `crewShellUnmatchedViewer.test.tsx` await-the-component pattern) + `requireAdmin` mocked resolved:
  1. non-UUID param → `notFound()` thrown (assert via `next/navigation` mock);
  2. `not_found` → `notFound()`; `infra_error` → testid `staged-preview-infra-error`;
  3. container-garbage `parse_result` (`crewMembers: "garbage"`) → `staged-preview-decode-error`;
  4. nested arms (a)(b)(c) of AC-4 (crew `role_flags: null`, `null` crew element, room `name: null`) → preview renders (`crew-shell` testid present), never an error surface;
  5. empty roster → `staged-preview-empty-roster`;
  6. happy path threads `?as=` → identity line names roster entry 1; unknown `?as=` → entry 0;
  7. `error.tsx` component renders its copy + testid (direct render — the ROUTING proof is Task 8's e2e arm);
  8. no raw code string (grep rendered output for `/[A-Z]{3,}_[A-Z_]+/` → no match) on every failure surface.
- [ ] **Step 2: Run to verify red** — `pnpm vitest run tests/admin/stagedPreviewRoute.test.tsx` — Expected: FAIL, route module absent.
<!-- task: red=`pnpm vitest run tests/admin/stagedPreviewRoute.test.tsx` red-state=authored red-target=`app/admin/wizard/preview/[stagedId]/page.tsx` why=`route module and lookupStagedRow helper absent` ac=AC-4 -->
- [ ] **Step 3: Implement page + error.tsx.**
- [ ] **Step 4: Add the registry row** in `tests/admin/_metaInfraContract.test.ts` for `lookupStagedRow` (grep-visibility + infra_error-on-throwing-client, the file's existing row shape); run `pnpm vitest run tests/admin/_metaInfraContract.test.ts` — Expected: PASS with the new row (red first if the harness fails on an unregistered helper; if the meta only checks registered rows, the row's own two assertions are the red: add the row BEFORE Step 3's helper lands to observe it red, then green after — order Steps 4-before-3 in execution if so; the executor picks the observable-red ordering and records it).
- [ ] **Step 5: Run to verify green** — both test files.
- [ ] **Step 6: Typecheck + commit** — `git commit -m "feat(admin): staged crew preview route with segment error boundary"`.

### Task 6: Step-3 modal entry link

**Files:**
- Modify: `components/admin/wizard/Step3ReviewModal.tsx` (footer, leading position)
<!-- spec-lint: ignore — file created by this task; not yet tracked -->
- Test: `tests/components/admin/wizard/step3PreviewLink.test.tsx` (new; build the modal via the shared harness fixture `tests/components/admin/wizard/_step3ReviewFixture.ts`, the pattern the sibling suites in that directory use)

**Interfaces:**
- Consumes: the modal's existing `stagedId` (already in its props/resolution surface — `Step3ReviewModal.tsx:80`).

- [ ] **Step 1: Write the failing test** — modal rendered via the `_step3ReviewFixture.ts` harness: footer contains an anchor named "Open crew preview" with `href` = `/admin/wizard/preview/<stagedId>` (derive from the harness's stagedId fixture), `target="_blank"`, `rel="noopener noreferrer"`, class list includes `min-h-tap-min`; present regardless of warning state (render one warned fixture).
- [ ] **Step 2: Run to verify red** — `pnpm vitest run <modal suite file>` — Expected: the new cases FAIL (link absent).
<!-- task: red=`pnpm vitest run tests/components/admin/wizard` red-state=authored red-target=`components/admin/wizard/Step3ReviewModal.tsx:520` why=`the footer slot renders no preview link` ac=AC-5 -->
- [ ] **Step 3: Implement** — `text-accent-on-bg` link recipe, leading footer slot (spec §2.8).
- [ ] **Step 4: Run to verify green** (whole modal suite).
- [ ] **Step 5: Typecheck + commit** — `git commit -m "feat(admin): open-crew-preview link in step-3 review modal footer"`.

### Task 7: Transition-audit task (mandatory per global rule)

**Files:**
<!-- spec-lint: ignore — both suites are created by earlier tasks of this plan; not yet tracked -->
- Test: extend `tests/components/admin/stagedPreviewBanner.test.tsx` + `tests/admin/stagedPreviewRoute.test.tsx`

Spec Transition Inventory (paraphrase of the spec's own section, which is normative): the new surface introduces NO client-state transitions of its own; the added chrome (banner, picker, exit link) changes state only by full navigation, each instant with no animation; in-page section taps remain the EXISTING CrewSections client toggle, untouched; new pairs to enumerate: none (added chrome has one static state, so zero pairs); compound transitions: none added.

- [ ] **Step 1: Write the audit assertions** — (a) source-level: the two new component files and `error.tsx` contain NO `AnimatePresence`, `motion.`, `useState`, `useEffect`, or `transition-` class (read file contents in-test via a small fs walk of the three paths; failure mode caught: someone adds client state/animation to chrome the spec declares static); (b) `StagedPreviewBanner` and `error.tsx` have no `"use client"`… except `error.tsx` MUST be a client component (Next requirement) — assert `error.tsx` has `"use client"` AND no animation/transition tokens; banner has neither directive nor tokens.
- [ ] **Step 2: Run to verify red is N/A here** — these are guard additions to suites that already exist and pass (`red-state=live` is not claimable: the components land green in Tasks 4–5). Verify instead by mutation: temporarily add `className="transition-all"` to the banner locally → suite fails → revert (record in commit message).
<!-- task: red=`pnpm vitest run tests/components/admin/stagedPreviewBanner.test.tsx tests/admin/stagedPreviewRoute.test.tsx` red-state=authored red-target=`components/admin/StagedPreviewBanner.tsx` why=`audit assertions fail if static chrome gains animation or client state; proven by the recorded transition-all mutant` ac=AC-6 -->
- [ ] **Step 3: Run to verify green + commit** — `git commit -m "test(admin): transition audit pins staged-preview chrome static"`.

### Task 8: Real-browser e2e (AC-6) + coverage-allowlist row

**Files:**
<!-- spec-lint: ignore — file created by this task; not yet tracked -->
- Create: `tests/e2e/staged-preview.spec.ts`
- Modify: `tests/ci/_metaE2eWorkflowCoverage.test.ts` (one `UNSEEN` allowlist row)

Disposition (spec §7): registered `UNSEEN` — app-dependent (dev server + seeded DB); wiring into a workflow belongs to the batch process owned by `BL-E2E-APP-DEPENDENT-SPECS-CI-DARK` (BACKLOG.md — "read the current population off the allowlist"), not to this arc. The allowlist row is what keeps it visible rather than dark.

- [ ] **Step 1: Write the spec** — seeding via the `insertStaged` pattern (`tests/e2e/admin-route-boundaries.spec.ts:81`, real `pending_syncs` row whose `parse_result` is a fixture with ≥2 crew members); sign in as `ADMIN_FIXTURE`; assertions:
  1. banner + `crew-shell` render at 390px and 1280px, light and dark (theme toggle helper as in existing crew e2e);
  2. picker click → identity line switches to entry 1 (default section, per spec §2.3);
  3. "Back to setup" lands on `/admin`;
  4. network capture over the whole session: zero requests matching `/api/report`, `/api/realtime/`, `/api/asset/` (AC-2's browser half);
  5. boundary arm: request the URL with `x-test-force-infra-fail: page` + Bearer secret (the `maybeForceTestInfraFail` mechanism, `lib/auth/requireAdmin.ts`; harness envs `ENABLE_TEST_AUTH`/`TEST_AUTH_SECRET` as in `admin-route-boundaries.spec.ts`) → `staged-preview-render-error` visible; assert the admin-layout catch testid and Next generic error are NOT present (negative-regression flip per that file's pattern).
- [ ] **Step 2: Verify red** — the spec fails against the pre-Task-5 tree; since Tasks 1–6 land first, observable red = run with the route's error.tsx temporarily renamed (mutant) OR run the allowlist meta first: `pnpm vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts` — Expected: FAIL naming the unregistered spec file (fail-by-default walk). That is the live red.
<!-- task: red=`pnpm vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts` red-state=authored red-target=`tests/ci/_metaE2eWorkflowCoverage.test.ts:118` why=`disk-walked coverage meta fails by default on the new unlisted e2e spec until its UNSEEN row is added` ac=AC-6 -->
- [ ] **Step 3: Add the `UNSEEN` row**; run the meta green.
- [ ] **Step 4: Run the e2e locally** — `pnpm heavy pnpm exec playwright test tests/e2e/staged-preview.spec.ts` (heavy slot; dev-server boot + readiness via `staged-preview-banner` visibility). Expected: PASS; record the run output in the commit message.
- [ ] **Step 5: Commit** — `git commit -m "test(admin): staged-preview e2e with boundary arm and coverage row"`.

<!-- tasks: end -->

### Task 9: impeccable dual-gate (invariant 8)

(Outside the red-contract regions: a review gate, not a red/green test cycle.)

- [ ] **Step 1: Pre-gate mechanical checklist** over the diff's UI files (banner, error.tsx, modal footer link): em-dash grep on copy strings; apostrophe literals; `min-h-tap-min` on every interactive element; canonical type/token classes only (no arbitrary brackets); no raw hex.
- [ ] **Step 2: Run the impeccable v3 skill's critique arm, then its audit arm** (`/impeccable`, both halves) on the affected diff with the canonical v3 setup gates (context.mjs → register read). Fix P0/P1 findings or file explicit `DEFERRED.md` entries; record findings + dispositions in §12 below.
- [ ] **Step 2a: Append the gate marker to §12** in the exact §3.3 RAN-form grammar (authority: `tests/docs/_invariant8Closeout.ts:44-46` and the 2026-08-01 invariant-8 closeout-enforcement spec §3.3) with the run's real states and counts, then `pnpm vitest run tests/docs/_metaInvariant8Closeout.test.ts` — Expected: PASS. (Deliberately absent until then: the grammar's forms assert the gate RAN, and this plan merges before implementation.)
- [ ] **Step 3: Commit any fixes** — `git commit -m "fix(admin): impeccable gate dispositions for staged preview surfaces"`.

<!-- tasks: depth=3 -->

### Task 10: Arm 2 ledger changes + closeout

**Files:**
- Modify: `BACKLOG.md` (archive `BL-OPS-LOG-DASHBOARD-BANNER` per spec §3.3 → move to `BACKLOG-archive.md` with WON'T BUILD body + conjunctive re-open trigger; file `BL-APP-EVENTS-DEBUG-LEVEL-CHECK-MISMATCH` with probe evidence `lib/log/types.ts:2` vs `supabase/migrations/20260629000002_app_events.sql:4` vs `lib/log/persist.ts:12-40`), `BACKLOG-archive.md`

- [ ] **Step 1: Write the archive entry + new row** (spec §3.2–§3.3 content: audit summary, §3.1 principle, both banner retirements `app/admin/page.tsx:104-107` and `app/admin/page.tsx:118-123`, re-open trigger).
- [ ] **Step 2: Run the ledger meta-tests** — `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaDeferralLedgerGraduation.test.ts` — Expected: PASS (archives reject in-flight entries: the `BL-OPS-LOG-DASHBOARD-BANNER` marker must come OFF in the same commit that archives it, per invariant 12's graduating-entry rule).
<!-- task: red=`pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` ac=AC-7 -->
  (Red story, prose since this region is not red-contract enrolled — a marker red-target cannot cite a root-level file: the archive rejects in-flight entries, so the red is authored by staging the entry's move to the archive while its `**Status:** IN PROGRESS` line is still on; observed red, then the marker comes off and both land in one commit.)
- [ ] **Step 3: Commit** — `git commit -m "docs(backlog): ops-log dashboard banner resolved WON'T BUILD; file app_events debug-level CHECK mismatch"`.
- [ ] **Step 4: Full-suite closeout gates** — `pnpm heavy pnpm test`; `pnpm typecheck`; `pnpm exec eslint .`; `pnpm format:check`. All green before the diff review.
- [ ] **Step 5: Final commit removes the remaining ledger marker** — `BL-STEP3-FULL-CREW-PREVIEW`'s `**Status:** IN PROGRESS · **Branch:** feat/admin-ui-surfaces` line reverts to graduation state in the PR's LAST commit (invariant 12; the entry graduates to the archive as SHIPPED in the same commit).

<!-- tasks: end -->

## §12 Closeout

The invariant-8 dual gate runs in Task 9 (both arms on the affected diff, before adversarial diff review); its findings + dispositions land HERE, and Task 9 Step 2a appends the machine-checkable gate marker line in the §3.3 RAN-form grammar with the real counts. The marker is deliberately not pre-written: its grammar asserts the gate RAN, and this plan merges before implementation.

**Execution routing:** UI tasks (2–6, 9) are Opus-owned (AGENTS.md hard rule); the whole plan is one Opus arc. Whole-diff adversarial review (cross-model, split tight-scope if the diff exceeds a handful of files) follows Task 10; then CI green; then merge per the autonomous-ship pipeline.

**Registry-count reconciliation (authored AND run):** this plan adds exactly 1 `infraRegistry` row (Task 5), 1 e2e allowlist `UNSEEN` row (Task 8), 0 rows to every other registry — verified at plan time by `grep -c "path:" tests/admin/_metaInfraContract.test.ts` before/after being +1 in Task 5's step 4, and the allowlist meta's own fail-by-default walk being Task 8's red.
