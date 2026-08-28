# Wizard Sheet-warnings panel: per-warning Ignore + Report controls

**Date:** 2026-08-28 · **Branch:** `feat/wizard-warning-ignore-controls` · **Status:** DRAFT
**Owner ask (2026-08-28, from the RFI & PC Chicago wizard screenshot):** reviewing warnings in the onboarding wizard's REVIEW BEFORE PUBLISHING modal, the operator agreed with the parser's reading of a hotel judgment call (`HOTEL_GUEST_SPLIT_AMBIGUOUS`) and accepted two near-miss rows (`UNKNOWN_FIELD`) as fine-to-omit, and found no way to say so, and no way to report a single warning row. The published per-show surface has all three affordances; the wizard panel has none.

## 1. Problem and evidence

The wizard review modal's Sheet warnings panel (`components/admin/wizard/step3ReviewSections.tsx`, `WarningsBreakdown`, registry row `id: "warnings"` / `label: "Sheet warnings"`) renders each warning as a list row with title, optional `Closest match` candidate, helpful context, an `Open in Sheet` deep link, and the staged-only use-raw / recognize-role control boundaries (`step3ReviewSections.tsx:3198-3215`). It renders no Report button and no Ignore button.

The published surface renders both, per warning, through `DataQualityWarningControls` (`components/admin/DataQualityWarningControls.tsx:43` — Report via `ReportButton`, Ignore/Un-ignore via the `data-quality/ignore|unignore` routes), mounted by `buildSectionWarningExtras` (`components/admin/showpage/sectionWarningExtras.tsx:148`) with a durable content-keyed ignore table (`public.ignored_warnings`, migration `supabase/migrations/20260702120000_ignored_warnings.sql`), an `Ignored (N)` disclosure, and post-commit forensic telemetry (`WARNING_IGNORED` in `app/api/admin/show/[slug]/data-quality/ignore/route.ts`).

The catalog copy already promises the affordance: `UNKNOWN_FIELD`'s `controlsNote` reads "Use Report to flag it to us, or Ignore to hide this notice." (`lib/messages/catalog.ts:1365`). The wizard is the FIRST surface where Doug meets these warnings, and it is the one surface where the promise is false.

Both warning families in the owner's screenshot are ignorable today: `UNKNOWN_FIELD` emits `rawSnippet: `${key} | ${value}`` (`lib/parser/warnings.ts:425`), and both `HOTEL_GUEST_SPLIT_AMBIGUOUS` emit sites carry `rawSnippet: params.rawCell` (`lib/parser/warnings.ts:341` and `lib/parser/warnings.ts:615`). `hasIgnorableSnippet` (`lib/dataQuality/ignorableSnippet.ts:8`) gates on exactly that field.

## 1.1 Resolved scope — do not relitigate

1. **This spec deliberately supersedes the published-only fence on warning controls.** `renderSectionExtras` guards `if (!isPublished(d)) return null` with the comment "§5.3 is published-only (staged warnings render through the modal's §E3 callouts + Warnings section)" (`components/admin/showpage/sectionWarningExtras.tsx:158-160`). That fence is NOT removed — the section-extras factory stays published-only. The wizard gets its own mount inside `WarningsBreakdown` (the §4.6 "complete render site" for wizard warning controls, where use-raw and recognize-role already live). Reviewers must not raise "staged mode was ratified controls-free": widening staged affordances is this spec's entire purpose, and the precedent is the use-raw boundary, which crossed the same line in spec 2026-07-16 §4.3.
2. **Announcer widening is in scope and supersedes one clause.** Announcer spec 2026-07-22 §2.5 ratified the wizard no-op default ("a control mounted outside the provider (wizard, standalone harnesses) announces nothing", `components/admin/review/warningAnnounceContext.ts:5-9`). With mutate controls arriving on the wizard panel, a silent state change is an a11y defect, so the provider gate at `components/admin/review/ShowReviewSurface.tsx:864-866` widens to staged mounts (§2.5 below). Standalone harnesses keep the no-op default. Do not relitigate the widening; do not propose keeping the wizard silent.
3. **Bulk ignore is deferred, deliberately.** Published `BulkIgnoreControls` (>=2 distinct-content same-code, `components/admin/BulkIgnoreControls.tsx:19`) does not come to the wizard in v1. The wizard panel is a flat list, not per-code eyebrow groups; restructuring it into grouped card slots is UI churn out of proportion to wizard list sizes. Per-warning Ignore covers the ask. Not a class-sweep gap: the defect class repaired here is "per-warning affordances missing"; bulk is a separate feature.
4. **Info-severity rows get no controls.** The published surface routes only `warn`-severity rows into control-bearing cards (`lib/admin/sectionWarningModel.ts:24-25` — "info is dropped by `warningsBySection`"); wizard parity keeps info rows control-free. Documented limit, not a finding.
5. **No new mutation surfaces, routes, tables, or migrations.** The wizard reuses `POST /api/admin/show/[slug]/data-quality/ignore` and `/unignore` verbatim (slug-keyed; the route resolves any `shows` row — publication status is irrelevant to it) and the existing report submit path, which already supports staged wizard rows (`lib/reports/submit.ts:279` and `lib/reports/submit.ts:290`). Invariant 10 is satisfied by the existing route emits; nothing new to register in `AUDITABLE_MUTATIONS`.
6. **No prune-on-rescan.** `ignored_warnings` orphan pruning runs on the cron sync path only (DQIGNORE-3, `lib/sync/runScheduledCronSync.ts:1885`). A wizard re-scan does not prune; an orphaned ignore row is invisible (its fingerprint matches nothing) and the next cron sync of the published show prunes it. Documented limit.
7. **Fail-open on ignore-set read faults.** `loadIgnoredWarnings` infra_error resolves to an empty fingerprint set — every warning renders active (fail toward VISIBLE), matching the published modal's posture (`app/admin/_showReviewModal.tsx:314-318`). Do not propose fail-closed.

## 2. Design

### 2.1 Server derivation (one new read + one new pure helper)

The wizard's server assembly (`components/admin/OnboardingWizard.tsx` step-3 read + `lib/admin/assembleStep3Row.ts`) gains show identity and a per-row warning model:

- The step-3 `shows` select (`components/admin/OnboardingWizard.tsx:425-433`) adds `slug` to its column list.
- `assembleStep3Row` already resolves the row's linked show via the session-provenance join or the existing-show branch (`lib/admin/assembleStep3Row.ts:132-160`). Both branches additionally capture the resolved candidate's `{ id, slug }` into a new `Step3Row` field:
  ```ts
  // components/admin/wizard/Step3Review.tsx (Step3Row)
  linkedShowRef?: { id: string; slug: string } | null;
  ```
  `null`/absent when no candidate resolved or the candidate row lacks a usable string `slug`.
- For each staged row with a `linkedShowRef`, the wizard loader calls `loadIgnoredWarnings(showId)` (`lib/admin/loadIgnoredWarnings.ts:16`, already registered in `tests/admin/_metaInfraContract.test.ts`) inside the existing parallel read wave. infra_error → empty set (§1.1.7).
- A new pure server helper stamps the model (SERVER-ONLY — it transitively pulls `node:crypto` via `buildReportSurfaceId`, the same constraint documented at `lib/admin/sectionWarningModel.ts:14-20`):
  ```ts
  // lib/admin/wizardWarningModel.ts
  export type WizardWarningItem = {
    /** Index into the row's FULL ParseResult.warnings array, the identity the
     *  modal's jump targets and stable keys already use. */
    index: number;
    reportSurfaceId: string; // buildReportSurfaceId(slug, warning)
  };
  export type WizardWarningModel = {
    active: WizardWarningItem[];   // fingerprint not in the ignored set (or no fingerprint)
    ignored: WizardWarningItem[];  // fingerprint in the ignored set
  };
  export function buildWizardWarningModel(args: {
    slug: string;
    warnings: readonly ParseWarning[];
    ignoredFingerprints: ReadonlySet<string>;
  }): WizardWarningModel;
  ```
  Partition semantics are `partitionByIgnored`'s (`lib/dataQuality/partitionByIgnored.ts:4-16`): a warning with a `null` fingerprint is always active. Items carry indices, not copies of the warnings, so the client re-joins against the one `warnings` array it already renders and no second copy can drift.
- New `Step3Row` field `warningModel?: WizardWarningModel` — present exactly when `linkedShowRef` is present and `parseResult` is non-null (an empty warnings array yields `{ active: [], ignored: [] }`).

### 2.2 Threading (staged section data)

`StagedSectionData` (`components/admin/review/sectionData.ts:62-68`) gains:

```ts
dq?: { slug: string; showId: string; model: WizardWarningModel };
```

populated by `buildStagedSectionData` from the new `Step3Row` fields at its existing construction sites, absent when either is missing (`exactOptionalPropertyTypes` — key omitted, never `undefined`). The registry's warnings row (`step3ReviewSections.tsx`, the `id: "warnings"` def) passes it to `WarningsBreakdown` as a new optional prop, staged-gated with the same `isStaged(s)` spread pattern the `wizardSessionId` threading uses.

### 2.3 Client render (`WarningsBreakdown`)

New optional prop `dq?: { slug: string; showId: string; model: WizardWarningModel }`. Behavior:

- **Absent** (published mount, standalone fixtures, staged row without a linked show): byte-identical rendering to today. This is the guard for every partial-data case.
- **Present:** the visible list renders the ACTIVE rows only (in existing order — active items' `index` fields select from the already-computed `rows`); each active `warn`-severity row appends, after the existing use-raw / recognize-role boundaries:
  ```tsx
  <DataQualityWarningControls
    slug={dq.slug} showId={dq.showId} warning={w}
    driveFileId={dfid} mode="active"
    reportSurfaceId={item.reportSurfaceId}
  />
  ```
  (`components/admin/DataQualityWarningControls.tsx:43-49` — props verified; the component self-gates Ignore on `hasIgnorableSnippet`, Report always renders.) Active `info`-severity rows are unchanged (§1.1.4).
- The catalog `controlsNote` line (spec 2026-08-27 §4.3 gate: shown only where controls actually mount) renders on control-bearing rows, sourced from the catalog entry when present.
- **Ignored disclosure:** below the list, when `dq.model.ignored.length > 0`, a native `<details>` "Ignored (N)" disclosure — same pattern, chrome, and instant-body treatment as the published one (`components/admin/showpage/sectionWarningExtras.tsx:280-314`) — renders the ignored rows muted with `mode="ignored"` controls (Un-ignore + Report).
- After a successful ignore/unignore the control calls `router.refresh()` (existing component behavior); the wizard modal survives refresh and receives the recomputed partition as new props — the exact mechanism the in-modal Re-scan already relies on (`components/admin/wizard/Step3ReviewModal.tsx:211-212`).

### 2.4 Count surfaces (single-predicate discipline)

Every wizard count a successful Ignore can change must read the ACTIVE partition, or the chrome contradicts the list under it. Inventory — each cell names its one source after this change:

| Surface | Today | After |
|---|---|---|
| Panel heading count (`WarningsBreakdown` → `BreakdownSection count`, wizard branch) | `rows.length` (all severities) | active rows only, both severities read from the partition (no control path creates an info-row fingerprint, so in practice this equals `rows.length − ignored warn rows`) |
| Rail count for `id: "warnings"` (registry `railCount`, wizard branch: `visibleWarningRows(s.warnings, false).length`) | all rows | same derivation as the heading — the two already share the single-predicate rule (`lib/admin/sheetWarningsCount.ts:12-15`); the wizard branch routes through one shared helper taking the ignored index set |
| Modal attention pill + menu ("N need a look · M judgment call", `Step3ReviewModal.tsx:313-329` memo over `data.warnings`) | full array | entries whose `index` is in `dq.model.ignored` are dropped before `deriveWarningAttention`; jump ids keep full-array indices so `[data-warning-index]` targets stay valid |
| Section status dots / per-section flags (`warningsBySection` consumers in the staged modal) | full array | same ignored-index filter, applied once where the modal builds its `bySection` entries (`Step3ReviewModal.tsx:314-316`) |
| Step-3 card warning chip (card list, outside the modal) | full array via `parseResult.warnings` | active partition via the same `warningModel` on `Step3Row` |

The ignored index set crosses the RSC boundary once (inside `dq.model`) and every client count derives from it; no surface re-derives ignore state independently. Published-mode counts are untouched (their gate `routedWarningsRenderElsewhere` and `sheetWarningsPanelCount` behavior is out of scope).

### 2.5 Announce

The provider gate `value={routedWarningsRenderElsewhere ? announceCtx : NOOP_WARNING_ANNOUNCE}` (`components/admin/review/ShowReviewSurface.tsx:864-866`) widens so staged mounts also receive the real `announceCtx` (the `useAnnounceLog` region already lives in the shared surface). "Warning ignored." / "Warning restored." then announce in the wizard exactly as on the published surface. Standalone mounts outside the surface keep `NOOP_WARNING_ANNOUNCE` (context default, unchanged).

## 3. Guard conditions

| Input | Case | Render |
|---|---|---|
| `Step3Row.linkedShowRef` | absent/null (no show row, hard_failed, skipped, candidate without slug) | no `warningModel`, no `dq` prop → panel byte-identical to today |
| `loadIgnoredWarnings` | `infra_error` | empty set → all rows active, controls still mount (§1.1.7) |
| `dq.model.active` | empty, `ignored` non-empty | affirmative empty state (existing `spec §3.10` sentence) renders for the visible list, PLUS the Ignored (N) disclosure below it |
| `dq.model.ignored` | empty | no disclosure element at all (not an empty `<details>`) |
| `warning.rawSnippet` | absent/blank on an active warn row | Report renders, Ignore self-hides (`components/admin/DataQualityWarningControls.tsx:53` and `components/admin/DataQualityWarningControls.tsx:85`) |
| `dfid` | null | existing behavior: per-warning controls in this panel already gate on non-null `dfid` (`WarningsBreakdown` doc comment); `dq` controls follow the same gate |
| model/warnings drift | an item `index` out of range for `warnings` | item is skipped (defensive re-join; cannot happen server-side because both derive from one array in one pass) |
| duplicate fingerprints | two rows with identical `code`+normalized snippet, fingerprint ignored | both partition to ignored (fingerprint semantics, `partitionByIgnored.ts:10-13`) |

## 4. Mode boundaries

- **Staged (wizard modal):** the only mode where `dq` exists. Controls: Report + Ignore/Un-ignore (new), use-raw + recognize-role (existing, unchanged). Correction-loop verb stays "rescan".
- **Published (consolidated modal):** `WarningsBreakdown` mounts with `mode="resync"` and NO `dq` prop — its warn rows render as section extras elsewhere with their own controls (`warning-surface-trim §3.2` behavior untouched). Nothing in this spec renders a second control set on published surfaces.
- **Standalone/fixture mounts:** no `dq`, no controls — unchanged.

Shared elements: the row chrome (title, candidate, context, Open in Sheet) is shared across all modes; the Ignored disclosure and DQ controls belong to staged mode only; the use-raw/recognize-role boundaries belong to staged mode only (existing).

## 5. Transition inventory

States of one warn row's control cluster: `idle`, `running`, `error` (component-local, `DataQualityWarningControls.tsx:18`), plus row location `active-list` vs `ignored-disclosure` (server truth).

| Transition | Treatment |
|---|---|
| idle → running (Ignore/Un-ignore pressed) | instant — existing component behavior (label swap "Ignoring…", `aria-busy`) |
| running → error | instant — existing `role="alert"` error plate |
| running → success (row moves active↔ignored) | instant re-render on `router.refresh()` — deliberate: server truth swaps the row between list and disclosure with no animation, matching the published panel (`sectionWarningExtras.tsx:279` "body instant") |
| error → idle (retry) | instant (existing) |
| disclosure closed ↔ open | chevron rotate transition only, body instant (existing published pattern, copied) |
| compound: ignore fired while Re-scan/publish run active | ignore POST is independent of the publish run; the refresh lands whenever it lands — no freeze is added (the panel's controls are not part of the §4.4 footer freeze set, same as use-raw today) |
| compound: second row's Ignore pressed while first is running | each control instance owns its state; both refresh once each on success (existing published behavior, unchanged) |

No new animation anywhere; every treatment is instant and deliberate except the existing chevron rotate.

## 5.1 Dimensional Invariants

None introduced. No fixed-height or fixed-width parent gains flex/grid children in this change: the controls join the existing per-row flex column inside the panel's normal document flow, and the disclosure is a native `<details>` in the same flow. No real-browser layout assertion is required on dimension grounds (§6 covers the gate rationale).

## 6. Testing

TDD per task (plan defines tasks; anchors here):

- **Model:** unit tests for `buildWizardWarningModel` — partition against fingerprints, index fidelity, null-fingerprint always active, empty-warnings shape. Derive expectations from fixture warnings run through the REAL `warningFingerprint`, never hardcoded hashes (anti-tautology).
- **Assembly:** `assembleStep3Row` threading tests — `linkedShowRef` from both resolution branches, absent-slug candidate → null, `warningModel` presence matrix.
- **Render:** `WarningsBreakdown` with `dq` — controls on warn rows only, Ignore hidden for snippet-less rows, Ignored (N) disclosure content, byte-identical no-`dq` render (existing snapshot/suite must stay green untouched), controlsNote gate.
- **Counts:** one shared-derivation test per §2.4 row asserting the surface reads the active partition (fixture with 1 ignored warn + 1 active warn + 1 info; expected counts derived from the fixture, and the ignored row's label must be ABSENT from the counted chrome — scope the extraction so the disclosure's copy of the label can't satisfy the assertion).
- **Announce:** staged surface mounts real announce (provider widening) — producer announce fires on the success branch in a staged mount.
- **Routes:** untouched — existing route suites stand; no new mutation-surface registry rows (§1.1.5). The meta-tests that walk surfaces (`tests/log/_metaMutationSurfaceObservability.test.ts`) see no new surface by construction.
- **Real-browser:** none required — no fixed-dimension parent/child relationship is introduced (controls join an existing flex column flow). Invariant-8 impeccable critique + audit run on the diff regardless.

## 7. Documented limits

- Info-severity rows carry no controls (§1.1.4). Re-file trigger: an owner request to dismiss an info row.
- No bulk ignore in the wizard (§1.1.3). Re-file trigger: an owner hits a wizard sheet where per-row ignoring is materially slower (≥ roughly 5 same-code rows).
- Wizard re-scan does not prune orphaned ignores (§1.1.6); cron sync does.
- An ignore landed from the wizard survives into the published surface (same table, same fingerprints) — intended, not incidental: the wizard decision IS the show's decision.
- `loadIgnoredWarnings` per staged row adds one read per linked staged row to the step-3 wave; wizard manifests are small (bounded by a scan batch), so no batching in v1. Re-file trigger: a measured step-3 load regression attributable to this wave.

## 8. Citations pass

Verified live in the worktree at `b608e71b3` (2026-08-28): every `file:line` in this document was read this session before drafting; key anchors — `DataQualityWarningControls` props (`components/admin/DataQualityWarningControls.tsx:10-17`), ignore route slug resolution + body contract (`app/api/admin/show/[slug]/data-quality/ignore/route.ts:96-113`), `partitionByIgnored` (`lib/dataQuality/partitionByIgnored.ts:4`), `buildReportSurfaceId(slug, w)` (`lib/dataQuality/warningFingerprint.ts:18`), `loadIgnoredWarnings` (`lib/admin/loadIgnoredWarnings.ts:16`), `Step3Row` (`components/admin/wizard/Step3Review.tsx:83`), staged data builder (`components/admin/review/sectionData.ts:104`), announce gate (`components/admin/review/ShowReviewSurface.tsx:864-866`), attention memo (`components/admin/wizard/Step3ReviewModal.tsx:313-329`), shows select (`components/admin/OnboardingWizard.tsx:425-433`), `visibleWarningRows` (`lib/admin/visibleWarningRows.ts`), panel count helper (`lib/admin/sheetWarningsCount.ts:17-21`).
