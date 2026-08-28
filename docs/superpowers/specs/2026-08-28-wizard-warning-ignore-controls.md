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
5. **Mutation-surface footprint: one new staged server action, one new `pending_syncs` column, no new tables.** R2 established the first-seen wizard row has NO `shows` row during review (`created_show_id` is stamped by finalize — `app/api/admin/onboarding/finalize/route.ts:568`; "first-seen: no show id existed until this apply", `lib/sync/phase2.ts:497`), so a slug-keyed route cannot serve the wizard's primary path. The design therefore forks by row linkage (§2.0): LINKED rows reuse `POST /api/admin/show/[slug]/data-quality/ignore` and `/unignore` verbatim; FIRST-SEEN rows get a staged ignore server action writing a new `pending_syncs.ignored_warnings` jsonb column (migration), mirrored on the ratified staged use-raw architecture (fence 8). Report needs no fork: the submit path already supports staged wizard sheets with no show record (`lib/reports/submit.ts:279` and `lib/reports/submit.ts:290`), with `ReportButton.showId` nullable (`components/shared/ReportButton.tsx:48`). The new action registers in `AUDITABLE_MUTATIONS` with success-branch behavioral proof (invariant 10); the migration follows the validation-schema-parity checklist.
6. **No prune-on-rescan.** `ignored_warnings` orphan pruning runs on the cron sync path only (DQIGNORE-3, `lib/sync/runScheduledCronSync.ts:1885`). A wizard re-scan does not prune; an orphaned ignore row is invisible (its fingerprint matches nothing) and the next cron sync of the published show prunes it. Documented limit.
7. **Fail-open on ignore-set read faults.** `loadIgnoredWarnings` infra_error resolves to an empty fingerprint set — every warning renders active (fail toward VISIBLE), matching the published modal's posture (`app/admin/_showReviewModal.tsx:314-318`). Do not propose fail-closed.

8. **The staged ignore store mirrors staged use-raw — do not relitigate the storage location.** Pre-create decisions live on `pending_syncs` and migrate at finalize; that architecture is ratified (spec 2026-07-10-structural-transform-use-raw §9a; `app/admin/onboarding/_actions/useRawStaged.ts:1-30`; migration `supabase/migrations/20260711000000_use_raw_decisions.sql`; finalize ride-along `app/api/admin/onboarding/finalize/route.ts:1049`). Staged ignores take the same shape: column on `pending_syncs`, admin-gated server action under `withShowLock(driveFileId)` (invariant 2, single JS-wrapper holder — the same layer the use-raw staged action holds), post-commit `logAdminOutcome`, and survival across rescan by OMISSION from the scan upsert's `do update set` list (`lib/sync/runOnboardingScan.ts:564-575` replaces `parse_result` and peers while `use_raw_decisions` survives by being absent from that list; the new column does the same).
9. **Dual backend by row linkage is deliberate.** Linked rows write the durable show-keyed table directly (those ignores are already prune-managed); first-seen rows write the staged column, and finalize carries the fingerprints into `public.ignored_warnings` for the created show (§2.7). One control component with a discriminated target (the `UseRawControlBoundary` surface-locator precedent, `components/admin/UseRawControlBoundary.tsx:41`) renders both. Do not propose collapsing to a single backend: the staged-only form loses durable ignores on linked re-scans, and the show-only form cannot exist pre-create (R2 F1).

## 2. Design

### 2.0 Row-linkage taxonomy (drives everything below)

A staged step-3 row is exactly one of:

**Reviewable preview — the single structural predicate.** A row HAS a reviewable preview iff `parseResult` is a non-null object whose `show` is truthy — the exact `hasReviewablePreview` gate the live card and buckets already apply (`components/admin/wizard/Step3Review.tsx:776-779`; `lib/admin/step3Buckets.ts:53-61`). `warnings` is NOT part of the predicate: on a reviewable preview it coerces through `arr()` (absent / null / non-array → `[]`, `lib/admin/step3Buckets.ts:39`). So `{}` and `{warnings: [...]}` with no `show` are NO-PREVIEW, while `{show: …, warnings: null}` is reviewable with an empty coerced warnings list. Every row lands in exactly one class:

- **FIRST-SEEN** — a reviewable preview and NO `linkedShowRef` (no resolved candidate, or a candidate without a usable slug — Phase A emits the field only for a usable pair). This is the wizard's primary path: the show is created only by finalize. Ignore backend: the staged column + server action (§2.6). Report backend: staged submit (no show record). Fingerprint source: `pending_syncs.ignored_warnings`.
- **LINKED** — a reviewable preview AND `linkedShowRef` (a `matchedCandidate` from either branch, §2.1 Phase A, with a usable `slug`). Ignore backend: the existing slug-keyed routes. Report backend: show-keyed submit. Fingerprint source: `loadIgnoredWarnings(showId)`.
- **NO-PREVIEW** — `hasReviewablePreview` false (hard_failed / skipped / resolved / badge-only post-finalize rows; `parse_result` null, non-object, or lacking `show`). No warning model, no controls, chrome unchanged.

The `warningModel` is present for FIRST-SEEN and LINKED rows; the `dq` threading (§2.2) carries a discriminated backend target so the client renders one control component either way.

### 2.1 Server derivation (two phases: sync identity capture, then async enrichment)

The step-3 read (`components/admin/OnboardingWizard.tsx`) is a SEQUENTIAL set of awaits (manifest at `components/admin/OnboardingWizard.tsx:356`, pending_syncs at `components/admin/OnboardingWizard.tsx:377`, pending_ingestions at `components/admin/OnboardingWizard.tsx:399`, shows at `components/admin/OnboardingWizard.tsx:425`) followed by a synchronous `manifestRows.map(...)` into `assembleStep3Row` (`components/admin/OnboardingWizard.tsx:545-566`), and the linked show is resolved INSIDE that synchronous function (`lib/admin/assembleStep3Row.ts:132-165`). There is no existing parallel wave to join, so the model lands in two phases:

**Phase A (sync, inside `assembleStep3Row`):** the step-3 `shows` select (`components/admin/OnboardingWizard.tsx:425-433`) adds `slug` to its column list, `ShowCandidate` gains the field, and both resolution branches capture the winning candidate's identity from the existing `matchedCandidate` (declared `lib/admin/assembleStep3Row.ts:137`, assigned `lib/admin/assembleStep3Row.ts:148` and `lib/admin/assembleStep3Row.ts:162`) into a new `Step3Row` field:

```ts
// components/admin/wizard/Step3Review.tsx (Step3Row)
linkedShowRef?: { id: string; slug: string } | null;
```

`null`/absent when no candidate resolved or the candidate row lacks a usable string `slug`.

**Phase B (async, post-assembly, in the wizard server component):** a new enrichment helper runs after the rows array exists:

```ts
// lib/admin/enrichStep3WarningModels.ts (server-only)
export async function enrichStep3WarningModels(
  rows: Step3Row[],
  loader: (showId: string) => Promise<LoadIgnoredWarningsResult>, // prod: loadIgnoredWarnings
): Promise<Step3Row[]>;
```

Per row, by taxonomy (§2.0):

- **LINKED** (has `linkedShowRef` + valid preview): awaits the loader (`Promise.all` across qualifying rows), treats `infra_error` as an empty fingerprint set (§1.1.7), stamps the model with report scope `linkedShowRef.slug`.
- **FIRST-SEEN** (reviewable preview, no `linkedShowRef`): NO loader call — the fingerprint set comes from the row's own `pending_syncs.ignored_warnings` column, carried through the SAME chain `use_raw_decisions` rides today, one field per hop: the step-3 `pending_syncs` select (`components/admin/OnboardingWizard.tsx:380`) → the `stagedByDfid` projection (`components/admin/OnboardingWizard.tsx:478-489`) → `StagedPreviewForRow` (`lib/admin/assembleStep3Row.ts:75-84`, beside its `useRawDecisions` field) → a new raw `Step3Row.stagedIgnoredWarnings?` field (the `useRawDecisions` precedent at `components/admin/wizard/Step3Review.tsx:112-116`), normalized by a small parser (non-array or entries without a string `fingerprint` → dropped; wholly malformed → `[]` — fail toward VISIBLE, §1.1.7 posture). Enrichment reads that field; nothing re-queries. Report scope is `staged-${driveFileId}`.
- **NO-PREVIEW**: passes through untouched.

**Structural validity (R2 F2, disjoint per §2.0):** the wizard's parse loader accepts ANY non-null object as `ParseResult` (`components/admin/OnboardingWizard.tsx:497-499`). Enrichment classifies with the §2.0 predicate: `hasReviewablePreview` false → NO-PREVIEW pass-through; true → model-bearing, with `warnings` reaching `buildWizardWarningModel` only through the `arr()` coercion (the `warningsOf` precedent, `app/admin/onboarding/_actions/useRawStaged.ts:64-70`), so `{show, warnings: null}` yields `{ active: [], ignored: [] }` and never a throw. One malformed row degrades exactly as its card already does, never a failed step-3 render.

The loader parameter exists so the presence-matrix tests exercise the helper directly; production passes `loadIgnoredWarnings` (`lib/admin/loadIgnoredWarnings.ts:16`, already registered in `tests/admin/_metaInfraContract.test.ts`).

**The stamping helper** (SERVER-ONLY — it transitively pulls `node:crypto` via `buildReportSurfaceId`, the same constraint documented at `lib/admin/sectionWarningModel.ts:14-20`):

```ts
// lib/admin/wizardWarningModel.ts
export type WizardWarningItem = {
  /** Index into the row's FULL ParseResult.warnings array, the JUMP-TARGET
   *  identity only (`data-warning-index` / `data-attention-anchor`). React
   *  keys are NOT indices: they stay content-derived via `stableWarningKeys`
   *  (`lib/dataQuality/warningIdentity.ts:46`), exactly as today. */
  index: number;
  reportSurfaceId: string; // buildReportSurfaceId(reportScope, warning)
};
export type WizardWarningModel = {
  active: WizardWarningItem[];   // fingerprint not in the ignored set (or no fingerprint)
  ignored: WizardWarningItem[];  // fingerprint in the ignored set
};
export function buildWizardWarningModel(args: {
  /** LINKED: the show slug; FIRST-SEEN: `staged-${driveFileId}`. Only a stable
   *  scope string for the opaque surface id (`lib/dataQuality/warningFingerprint.ts:18`
   *  hashes the identity; the scope only namespaces it). */
  reportScope: string;
  warnings: readonly ParseWarning[];
  ignoredFingerprints: ReadonlySet<string>;
}): WizardWarningModel;
```

Partition semantics are `partitionByIgnored`'s (`lib/dataQuality/partitionByIgnored.ts:4-16`): a warning with a `null` fingerprint is always active. Items carry indices, not copies of the warnings, so every consumer re-joins against the one `warnings` array it already holds and no second copy can drift.

New `Step3Row` field `warningModel?: WizardWarningModel` — present exactly for FIRST-SEEN and LINKED rows (§2.0); an empty or fully coerced-away warnings array yields `{ active: [], ignored: [] }`.

### 2.2 Threading (staged section data)

`StagedSectionData` (`components/admin/review/sectionData.ts:62-68`) gains:

```ts
export type WizardDqTarget =
  | { kind: "show"; slug: string; showId: string }        // LINKED rows
  | { kind: "staged"; wizardSessionId: string; driveFileId: string }; // FIRST-SEEN rows
dq?: { target: WizardDqTarget; model: WizardWarningModel };
```

populated by `buildStagedSectionData` from the new `Step3Row` fields at its existing construction sites — `target.kind` follows the §2.0 taxonomy — and absent for NO-PREVIEW rows (`exactOptionalPropertyTypes` — key omitted, never `undefined`). The discriminated locator is the `UseRawControlBoundary` surface precedent (`components/admin/UseRawControlBoundary.tsx:41`). The registry's warnings row (`step3ReviewSections.tsx`, the `id: "warnings"` def) passes it to `WarningsBreakdown` as a new optional prop, staged-gated with the same `isStaged(s)` spread pattern the `wizardSessionId` threading uses.

### 2.3 Client render (`WarningsBreakdown`)

New optional prop `dq?: { target: WizardDqTarget; model: WizardWarningModel }`. Behavior:

- **Absent** (published mount, standalone fixtures, NO-PREVIEW rows): byte-identical rendering to today. This is the guard for every partial-data case; FIRST-SEEN and LINKED rows always carry `dq` (§2.2).
- **Present:** the visible list renders the ACTIVE rows only (in existing order — active items' `index` fields select from the already-computed `rows`). **Jump-anchor contract:** each rendered active row carries its ORIGINAL full-array index in BOTH jump attributes — `data-warning-index` AND `data-attention-anchor={`warning:${index}`}` (today both use the rendered position `i`, `components/admin/wizard/step3ReviewSections.tsx:3078` and `components/admin/wizard/step3ReviewSections.tsx:3082`, valid only because staged rendered index equals full index; active-only rendering breaks that equality). The attention menu resolves rows by `[data-attention-anchor]` (`components/admin/review/ShowReviewSurface.tsx:568`) against ids minted as `warning:${e.index}` over the full array (`components/admin/wizard/Step3ReviewModal.tsx:319`), so original indices are the only values that keep menu jumps landing. The per-row testid keeps the original index too (`warning-${index}`). Rows in the Ignored disclosure carry NEITHER jump attribute — they are filtered out of attention (§2.4), so a stale anchor must not shadow an active target. **React keys are unchanged:** `stableWarningKeys` (content identity + occurrence suffix, `lib/dataQuality/warningIdentity.ts:43-52`) computed over each rendered subset (active list; disclosure list) — never model indices, which would reintroduce the state-migration-on-rescan problem the content keys exist to prevent. Each active `warn`-severity row appends, after the existing use-raw / recognize-role boundaries:
  ```tsx
  <DataQualityWarningControls
    target={dq.target} warning={w}
    driveFileId={dfid} mode="active"
    reportSurfaceId={item.reportSurfaceId}
  />
  ```
  `DataQualityWarningControls` generalizes from `{slug, showId}` props to the discriminated `target` (§1.1.9): the `show` arm keeps today's fetch to `/api/admin/show/[slug]/data-quality/{ignore|unignore}` byte-identical (`components/admin/DataQualityWarningControls.tsx:63-70`); the `staged` arm calls the §2.6 server action (one function, `action` discriminator) instead. The Report half needs no fork beyond identity, but identity must actually travel: `ReportButton.showId` takes the linked show id or `null` (`components/shared/ReportButton.tsx:48`; staged submit support `lib/reports/submit.ts:279`), and the component's `autocapture.fieldRef` — today `code`/`sourceCell`/`blockRef` only (`components/admin/DataQualityWarningControls.tsx:99-104`, with the `driveFileId` prop accepted then dropped, `components/admin/DataQualityWarningControls.tsx:14`) — gains `driveFileId`, because the submit path resolves a show-less report's sheet identity from exactly that field (`driveFileIdFromFieldRef`, `lib/reports/submit.ts:299-307`). Additive on both arms (a published report simply carries one more identity field); without it a FIRST-SEEN report reads only "staged wizard sheet (no show record)". Every published mount site (`components/admin/showpage/sectionWarningExtras.tsx:120-127` and peers) passes `target={{ kind: "show", slug, showId }}` — a mechanical call-site migration with unchanged behavior. The component still self-gates Ignore on `hasIgnorableSnippet`; Report always renders. Active `info`-severity rows are unchanged (§1.1.4).
- The catalog `controlsNote` line (spec 2026-08-27 §4.3 gate: shown only where controls actually mount) renders on control-bearing rows, sourced from the catalog entry when present.
- **Ignored disclosure:** below the list, when `dq.model.ignored.length > 0`, a native `<details>` "Ignored (N)" disclosure — same pattern, chrome, and instant-body treatment as the published one (`components/admin/showpage/sectionWarningExtras.tsx:280-314`) — renders the ignored rows muted with `mode="ignored"` controls (Un-ignore + Report).
- After a successful ignore/unignore the control calls `router.refresh()` (existing component behavior); the wizard modal survives refresh and receives the recomputed partition as new props — the exact mechanism the in-modal Re-scan already relies on (`components/admin/wizard/Step3ReviewModal.tsx:211-212`).

### 2.4 Warning-derived chrome (two choke points, one structural guard)

Every wizard surface that derives ANYTHING from a row's warnings — counts, dots, borders, chips, callouts, button labels — must read the ACTIVE partition, or the chrome contradicts the list under it. The full consumer inventory (swept 2026-08-28; the R1 review confirmed the first draft's five-row table was incomplete, so this section is now derivation-first: two choke points, every consumer named, and a guard that fails on a bypass):

**Choke point 1 — row-level (`gapWarnings`).** Every row-level bucket derivation already routes through the single private accessor `gapWarnings(row)` in `lib/admin/step3Buckets.ts:47`. `Step3RowLike` (`lib/admin/step3Buckets.ts:32-35`) gains optional `warningModel`, and `gapWarnings` drops warnings whose index is in `warningModel.ignored` when the model is present. That one edit makes active-aware, with no per-surface change:

- card `needsLook` border + Review-vs-View button label (`components/admin/wizard/Step3SheetCard.tsx:514`, `components/admin/wizard/Step3SheetCard.tsx:717`, `components/admin/wizard/Step3SheetCard.tsx:754` via `nonAmbiguityGapTotal`, `lib/admin/step3Buckets.ts:68`)
- card judgment chip (`Step3SheetCard.tsx:520` via `rowIsJudgment`, `step3Buckets.ts:94`)
- page-level summary counts `needsLookCount` / `judgmentCount` (`components/admin/wizard/Step3Review.tsx:1039-1042` via `deriveStep3Buckets`, `step3Buckets.ts:114`)

The card's data-gap glyph (`Step3SheetCard.tsx:513`, `summarizeDataGaps(warnings)` called on a raw array) is the one row-level site NOT behind the accessor: it switches to the same filtered set (via `gapWarnings` or an exported active-warnings accessor from `step3Buckets.ts` — plan's choice, one function either way).

**Choke point 2 — SectionData-level (staged-aware entries wrapper).** The modal-side consumers all start from `warningsBySection(data.warnings, ...)`, which mints entries with full-array indices. A single shared wrapper (client-safe, no crypto) filters MAPPED entries by the ignored index set while preserving each surviving entry's original `index`, and is the only way staged chrome obtains warning entries:

- `Step3ReviewModal` attention memo (pill "N need a look · M judgment call" + menu rows + footer count, `components/admin/wizard/Step3ReviewModal.tsx:313-329`) — filtered entries feed `deriveWarningAttention` unchanged (entries stay warn-only, so its info-severity throw at `lib/admin/warningAttention.ts:34-35` is untriggered)
- `ShowReviewSurface` section-state memo (`components/admin/review/ShowReviewSurface.tsx:282-284`) — section dots and both rails
- `ShowReviewSurface` warnings-panel dot (`ShowReviewSurface.tsx:343`, today `data.warnings.some(isWarnSeverity)`) — becomes "any ACTIVE warn entry"
- staged section callouts + their `+N more in Sheet warnings` overflow (`ShowReviewSurface.tsx:1149-1156` feeding `components/admin/wizard/step3ReviewSections.tsx:633-703`) — inherit the filter through the section-state memo

**Panel counts.** The panel heading count and the `warnings` rail count already share the single-predicate rule (`lib/admin/visibleWarningRows.ts`, `lib/admin/sheetWarningsCount.ts:12-15`); the wizard branch of both switches to one shared helper that subtracts ignored rows (active rows of both severities; no control path creates an info-row fingerprint, so in practice this equals `rows.length − ignored warn rows`).

**Structural guard (shipped with the feature, not after it).** A meta-style test walks the wizard chrome modules (`components/admin/wizard/`, `components/admin/review/ShowReviewSurface.tsx`) and fails on any NEW direct read of `data.warnings` / `parseResult.warnings` / `warningsBySection(` outside a registered-site list containing exactly: the two choke points, the panel's own render path (`WarningsBreakdown` and the registry `railCount`/`render` closures), the enrichment/stamping helpers, and the attention memo's wrapper call. A bypass added later fails the walk by default — the derived-cover shape AGENTS.md's class-sweep rule requires.

The ignored index set crosses the RSC boundary once (`Step3Row.warningModel`, reaching the modal inside `dq`) and every consumer derives from it through a choke point; no surface re-derives ignore state independently. Published-mode chrome is untouched: `gapWarnings` consumers are wizard-only, and the wrapper is identity (no filtering) when `dq` is absent, which is every published and standalone mount.

### 2.5 Announce

The provider gate `value={routedWarningsRenderElsewhere ? announceCtx : NOOP_WARNING_ANNOUNCE}` (`components/admin/review/ShowReviewSurface.tsx:864-866`) widens so staged mounts also receive the real `announceCtx` (the `useAnnounceLog` region already lives in the shared surface). "Warning ignored." / "Warning restored." then announce in the wizard exactly as on the published surface. Standalone mounts outside the surface keep `NOOP_WARNING_ANNOUNCE` (context default, unchanged).

### 2.6 Staged ignore server action (FIRST-SEEN backend)

ONE new admin server action (single exported function with an `action` discriminator — not a pair; one module, mirror of `app/admin/onboarding/_actions/useRawStaged.ts` clause for clause):

```ts
// app/admin/onboarding/_actions/stagedWarningIgnore.ts ("use server")
export type SetStagedWarningIgnoreResult =
  | { ok: true; state: "ignored" | "unignored" }
  // idempotent no-op (already ignored / already absent) is ok:true with the same
  // state and NO forensic emit (the useRawStaged mutated-flag discipline)
  | { ok: false; code: "session_not_found" | "infra_error" | "concurrent" }
  | { ok: false; code: "warning_not_found" | "warning_not_ignorable" | "warning_stale" };

export async function setStagedWarningIgnore(args: {
  wizardSessionId: string;
  driveFileId: string;
  action: "ignore" | "unignore";
  code: string;
  rawSnippet: string;
}): Promise<SetStagedWarningIgnoreResult>;
```

Result-arm mapping, one per live `useRawStaged` arm (`app/admin/onboarding/_actions/useRawStaged.ts:45-48`): `session_not_found` = pairing verify miss; `infra_error` = client construction / SQL fault / lock-wrapper fault; `concurrent` = lock not acquired; `warning_not_found` / `warning_stale` = the locked parse no longer carries the referenced warning; `warning_not_ignorable` = the referenced warning has no ignorable snippet (`hasIgnorableSnippet` false — the client hides Ignore for these, so reaching it is a defense arm, not a UX path). The client's staged arm maps every `ok: false` to the existing failCopy error plate (`components/admin/DataQualityWarningControls.tsx:55-58` wording, unchanged).

Contract, each clause inherited from the ratified staged use-raw action:

- `assertSameOriginServerAction` + `requireAdmin`/`requireAdminIdentity` gate (admin mutation).
- **Pre-lock pairing verify:** the `(wizardSessionId, driveFileId)` pair must exist in `pending_syncs` before locking, so a client arg can never steer the advisory lock onto an unrelated show (`useRawStaged.ts:15-21` rationale).
- **Under `withShowLock(driveFileId)`** (invariant 2 — the JS-wrapper layer is the SINGLE holder for this hashkey on this path, same as use-raw): locked re-read of that row's `parse_result` + current `ignored_warnings`; compute `warningFingerprint({code, rawSnippet})` and validate it matches a live ignorable warning of the locked parse (stale/absent → typed refusal, mirroring `warning_not_found` / `warning_stale`); `ignore` upserts `{ fingerprint, code, ignored_by }` (ignored_by = canonicalized admin email, invariant 3 — same shape the durable table's CHECK enforces, `supabase/migrations/20260702120000_ignored_warnings.sql:8-9`); `unignore` removes the entry; commit.
- **Post-commit, outside the lock tx** (invariant 10): `logAdminOutcome` with `STAGED_WARNING_IGNORED` / `STAGED_WARNING_UNIGNORED` (forensic codes, NOT §12.4 rows), emitted only on a real mutation. The action registers in `AUDITABLE_MUTATIONS` with a success-branch sink-spy behavioral test.
- Invariant 9 at the Supabase/SQL call boundaries: every SUPABASE client await destructures `{ data, error }`, and returned-error vs thrown-error paths resolve to the typed `infra_error` arm, never silence. Auth, lock-wrapper, and telemetry awaits follow their own contracts (`requireAdmin` throws its coded error; `withShowLock` surfaces acquisition failure as `concurrent`; `logAdminOutcome` never throws over the caller) — the same split the live use-raw action implements.
- **Advisory-lock holder topology (invariant 2).** The hashkey is `hashtext('show:' || drive_file_id)`. Two acquisition layers exist: (a) the JS wrapper `withShowLock` (`lib/sync/lockedShowTx.ts:88`) and (b) in-RPC `pg_advisory_xact_lock` inside self-locking SECURITY DEFINER functions. The R4 probe corrected the enumerated form: direct `withShowLock` acquirers include `useRawStaged.ts`, `lib/onboarding/rescanWizardSheet.ts`, `lib/sync/applyStaged.ts`, `lib/sync/runOnboardingScan.ts`, `lib/sync/retrySingleFile.ts`, `lib/sync/unpublishShow.ts`, `lib/sync/assetRecovery.ts`, `lib/sync/promoteSnapshot.ts:370` and `lib/sync/promoteSnapshot.ts:582`, and `lib/sync/runScheduledCronSync.ts:1948`; NOT every `withShowLock` importer acquires (`lib/onboarding/applyRescanDecisionUnderLock.ts` is callee-handed / acquire-free, and `lib/showLifecycle/archiveShow.ts` delegates to a self-locking RPC — layer (b)). Because an enumerated list re-opens on every new caller, the PLAN derives the authoritative list from `rg -n 'withShowLock[<(]' app lib` at plan time (the character class catches both plain and generic `withShowLock<...>(` call forms — R5 measured the paren-only pattern missing four of the enumerated holders) and the implementation pins it structurally. The new action acquires ONLY at layer (a) — the same layer as `useRawStaged` — with plain `select`/`update` on `pending_syncs` through the lock tx, calling NO RPC that locks. Pinning mechanism, stated precisely: `tests/auth/advisoryLockRpcDeadlock.test.ts:135-187` today scans `withShowAdvisoryLock` (`lib/db/advisoryLock.ts:32`) callbacks — a DIFFERENT wrapper — so the suite gains a parallel arm (same scan shape, targeting `withShowLock` bodies) asserting the new action's in-lock body invokes no self-locking RPC; the existing arm is unchanged.

**Storage shape:** `pending_syncs.ignored_warnings jsonb not null default '[]'::jsonb` — an array of `{ fingerprint, code, ignored_by }`. New migration; the scan upsert's `do update set` list does NOT touch it (survives rescan, §1.1.8); the finalize cleanup that deletes the `pending_syncs` row disposes of it with the row.

**Client behavior on success:** identical to the show arm — announce ("Warning ignored." / "Warning restored.") then `router.refresh()`; the wizard re-reads the column through Phase B and the partition moves.

### 2.7 Finalize carry (staged fingerprints become durable ignores)

`ignored_warnings` rides to the apply exactly where `use_raw_decisions` rides today — one field added per hop, BOTH apply paths, no new plumbing shapes:

- **First-seen path:** the finalize locked select (`app/api/admin/onboarding/finalize/route.ts:1039-1049`) gains the column; the direct forwarding site (`app/api/admin/onboarding/finalize/route.ts:1338`) carries it into the apply args.
- **Update path (existing-show apply — the R3 probe's chain):** the shadow hand-off carries it through `stageExistingShowShadow` (`app/api/admin/onboarding/finalize/route.ts:1201`), the shadow payload writer/parser (`lib/onboarding/shadowPayload.ts:76` declares `useRawDecisions`; `lib/onboarding/shadowPayload.ts:294` normalizes it back — the new field sits beside it in both places, with the §2.1 normalizer), `parseShadowPayloadForApply` in finalize-cas (`app/api/admin/onboarding/finalize-cas/route.ts:433`), and into `applyStagedCore` (`app/api/admin/onboarding/finalize-cas/route.ts:560`).
- **Shared tail:** `ApplyStagedCoreArgs` gains the field beside `useRawDecisions` (`lib/sync/applyStagedCore.ts:458-460`, forwarded at `lib/sync/applyStagedCore.ts:614`), through `Phase2Args`, to the phase-2 site that already re-persists kept use-raw decisions and holds `snapshot.showId` for BOTH insert and update applies (`lib/sync/phase2.ts:461-476` obtains the snapshot; `lib/sync/phase2.ts:538` and `lib/sync/phase2.ts:552` use it). There it inserts each staged entry into `public.ignored_warnings (show_id, fingerprint, code, ignored_by)` with `on conflict (show_id, fingerprint) do nothing` — the staging-time `ignored_by` preserved (it already satisfies the canonical CHECK).

This covers the documented live case where a FIRST-SEEN row gains a show before finalize (`app/api/admin/onboarding/finalize/route.ts:674-682`): whichever path applies, the same tail inserts against `snapshot.showId`. Orphaned fingerprints (warning vanished between staging and apply) carry harmlessly and the cron prune removes them later (§1.1.6). Carry failures follow the surrounding phase-2 fault posture; they never abort an otherwise successful apply silently — same discipline as the use-raw re-persist.

**DB completeness matrix (tier × layer):**

| Layer | `pending_syncs.ignored_warnings` | `public.ignored_warnings` |
|---|---|---|
| DDL | new migration: jsonb NOT NULL DEFAULT '[]' | unchanged |
| CHECK | none (shape enforced by the single writer action; malformed → empty-set coercion on read, §2.1) | existing canonical CHECK unchanged |
| Write paths | §2.6 action (only writer); scan upsert omits it; finalize row-delete disposes | existing routes; NEW: §2.7 finalize carry insert |
| Read paths | step-3 select (§2.1 Phase B); finalize locked select (§2.7) | `loadIgnoredWarnings` (unchanged) |
| Cleanup | dies with the `pending_syncs` row | DQIGNORE-3 cron prune (unchanged) |
| Frontend | §2.3 staged arm | §2.3 show arm (published + LINKED) |
| Tests | §6 action + carry + coercion suites | existing suites unchanged |
| Validation project | migration applied surgically + `pnpm gen:schema-manifest` (validation-schema-parity gate) | N/A — no DDL change |

## 3. Guard conditions

| Input | Case | Render |
|---|---|---|
| row taxonomy | NO-PREVIEW (hard_failed, skipped, resolved, badge-only) | no `warningModel`, no `dq` prop → panel byte-identical to today |
| `parse_result` | null, non-object, or object without truthy `show` (includes `{}`) | NO-PREVIEW (§2.0 predicate): no model, no `dq`, chrome unchanged |
| `parse_result` | reviewable (`show` truthy) with `warnings` absent, null, or non-array | model-bearing: `arr()`-coerced to empty (§2.1), model `{active: [], ignored: []}`, no throw |
| `pending_syncs.ignored_warnings` | malformed column value (non-array, entries missing string `fingerprint`) | coerced to empty set — all rows active, controls still mount (fail toward VISIBLE) |
| `linkedShowRef` | matched candidate without a usable string `slug` (defensive — `shows.slug` is populated in practice) | the row degrades to the staged arm: the staged backend needs only `(wizardSessionId, driveFileId)`, both always present on a reviewable pending row, and the finalize carry (§2.7) still lands the fingerprints on the applied show |
| `loadIgnoredWarnings` (LINKED rows) | `infra_error` | empty set → all rows active, controls still mount (§1.1.7) |
| `dq.model.active` | empty, `ignored` non-empty | the CLEAN sentence ("Nothing needs a look on this sheet." — the published branch's wording at `components/admin/wizard/step3ReviewSections.tsx:2988-2992`, whose own comment already covers the all-ignored case) renders for the visible list, PLUS the Ignored (N) disclosure below it; the `warnings-empty` sentence ("No parse warnings for this sheet.") stays reserved for a genuinely empty warnings array |
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
| compound: attention menu open when an ignore's refresh lands | the ignored row's menu entry vanishes with the re-render (instant — server truth). When the active count reaches zero, `pillInteractive` goes false and BOTH the pill's interactive state and the menu UNMOUNT in that render — the gate "gates BOTH the button states and the menu mount" (`components/admin/wizard/Step3ReviewModal.tsx:331-340`, mount site `components/admin/wizard/Step3ReviewModal.tsx:549-643`). Instant, deliberate: existing contract, unchanged by this spec |

No new animation anywhere; every treatment is instant and deliberate except the existing chevron rotate.

## 5.1 Dimensional Invariants

None introduced. No fixed-height or fixed-width parent gains flex/grid children in this change: the controls join the existing per-row flex column inside the panel's normal document flow, and the disclosure is a native `<details>` in the same flow. No real-browser layout assertion is required on dimension grounds (§6 covers the gate rationale).

## 6. Testing

TDD per task (plan defines tasks; anchors here):

- **Model:** unit tests for `buildWizardWarningModel` — partition against fingerprints, index fidelity, null-fingerprint always active, empty-warnings shape. Derive expectations from fixture warnings run through the REAL `warningFingerprint`, never hardcoded hashes (anti-tautology).
- **Assembly (Phase A):** `assembleStep3Row` tests — `linkedShowRef` from both resolution branches, absent-slug candidate → null.
- **Enrichment (Phase B):** `enrichStep3WarningModels` tests with an injected loader — the presence matrix over the §2.0 taxonomy (LINKED × loader ok/infra_error; FIRST-SEEN reading the staged column, well-formed and malformed; NO-PREVIEW pass-through), infra_error → all-active.
- **Choke points:** `gapWarnings`-level tests through its public consumers (`nonAmbiguityGapTotal`, `rowIsJudgment`, `deriveStep3Buckets` with a `warningModel`-bearing row — the ignored warn row stops counting; absent model → unchanged), and wrapper-level tests for the SectionData entries filter (original `index` preserved on survivors; identity when `dq` absent; warn-only precondition maintained so `deriveWarningAttention`'s info-severity throw stays unreachable).
- **Render:** `WarningsBreakdown` with `dq` — controls on warn rows only, Ignore hidden for snippet-less rows, Ignored (N) disclosure content (no jump attributes on disclosure rows), byte-identical no-`dq` render (existing snapshot/suite must stay green untouched), controlsNote gate, all-ignored clean sentence.
- **Staged report body:** a request-body assertion — submitting Report from a FIRST-SEEN row sends `show_id: null` with `fieldRef.driveFileId` equal to the fixture row's drive file id, asserted against the intercepted request body (expected id derived from the fixture, never hardcoded), proving the §2.3 identity plumbing end to end.
- **Jump-anchor contract:** with warning 0 ignored and warning 1 active, the rendered active row carries `data-attention-anchor="warning:1"` and `data-warning-index="1"`, and the attention menu's entry id resolves to it (assert via the same `[data-attention-anchor="${id}"]` selector the surface uses, `components/admin/review/ShowReviewSurface.tsx:568`); React keys assert `stableWarningKeys` output, not indices.
- **Counts:** shared-derivation tests per §2.4 consumer asserting the surface reads the active partition (fixture with 1 ignored warn + 1 active warn + 1 info; expected counts derived from the fixture, and the ignored row's label must be ABSENT from the counted chrome — scope the extraction so the disclosure's copy of the label can't satisfy the assertion).
- **Structural guard:** the §2.4 registered-site walk ships in the same PR as the first choke-point edit, discovered from the filesystem (a new file in the walked tree is covered by default).
- **Staged action (§2.6):** suite mirroring the staged use-raw action's — pairing-verify refusal on an unknown `(wizardSessionId, driveFileId)`; advisory lock HELD during the mutation (the `withShowLock` topology assertion, template `tests/auth/advisoryLockRpcDeadlock.test.ts`); fingerprint validation against the LOCKED parse (stale/absent → typed refusal); ignore/unignore jsonb round-trip; idempotent duplicate ignore mutates nothing and emits nothing; post-commit emit only on real mutation. `AUDITABLE_MUTATIONS` registry row + sink-spy success-branch proof (invariant 10, `tests/log/adminOutcomeBehavior.test.ts` pattern).
- **Finalize carry (§2.7):** TWO separate end-to-end proofs, one per apply path — (a) first-seen create: staged fingerprints land in `public.ignored_warnings` for the CREATED show; (b) existing-show update THROUGH the shadow payload round-trip (`stageExistingShowShadow` → `parseShadowPayloadForApply` → `applyStagedCore`): fingerprints land for the UPDATED show. Both: `on conflict do nothing`, staging-time `ignored_by` preserved, orphaned fingerprints carry without error, fault posture matches the surrounding phase-2 discipline. A shadow-payload round-trip unit test pins the new field beside `useRawDecisions` in writer and parser.
- **Malformed-shape matrix (§2.1):** enrichment over rows split BY THE §2.0 PREDICATE — NO-PREVIEW shapes (`parse_result` null / non-object / `{}` / object without truthy `show`) pass through with no model; reviewable shapes (`show` truthy) with `warnings` absent / null / non-array get the empty model — no throw either side; malformed `ignored_warnings` column values coerce to the empty set.
- **Migration:** local apply + `pnpm gen:schema-manifest` committed + surgical validation-project apply, per the validation-schema-parity checklist (three steps, one PR).
- **Announce:** staged surface mounts real announce (provider widening) — producer announce fires on the success branch in a staged mount.
- **Routes:** untouched — existing route suites stand; no new mutation-surface registry rows (§1.1.5). The meta-tests that walk surfaces (`tests/log/_metaMutationSurfaceObservability.test.ts`) see no new surface by construction.
- **Real-browser:** none required — no fixed-dimension parent/child relationship is introduced (controls join an existing flex column flow). Invariant-8 impeccable critique + audit run on the diff regardless.

## 7. Documented limits

- Info-severity rows carry no controls (§1.1.4). Re-file trigger: an owner request to dismiss an info row.
- No bulk ignore in the wizard (§1.1.3). Re-file trigger: an owner hits a wizard sheet where per-row ignoring is materially slower (≥ roughly 5 same-code rows).
- Wizard re-scan does not prune orphaned ignores (§1.1.6); cron sync does.
- An ignore landed from the wizard survives into the published surface (same table, same fingerprints) — intended, not incidental: the wizard decision IS the show's decision.
- `loadIgnoredWarnings` per LINKED row adds one read per such row to the enrichment pass; FIRST-SEEN rows read their own already-selected column. Wizard manifests are small (bounded by a scan batch), so no batching in v1. Re-file trigger: a measured step-3 load regression attributable to this pass.
- A staged ignore on a row whose finalize never runs (abandoned session) dies with the `pending_syncs` row via the existing cleanup — by design; nothing to prune.
- Staged and linked backends can in principle hold the same fingerprint twice for one show (staged before finalize, direct route after); the carry's `on conflict do nothing` makes the duplicate harmless.

## 8. Citations pass

Verified live in the worktree at `b608e71b3` (2026-08-28): every `file:line` in this document was read this session before drafting; key anchors — `DataQualityWarningControls` props (`components/admin/DataQualityWarningControls.tsx:10-17`), ignore route slug resolution + body contract (`app/api/admin/show/[slug]/data-quality/ignore/route.ts:96-113`), `partitionByIgnored` (`lib/dataQuality/partitionByIgnored.ts:4`), `buildReportSurfaceId(slug, w)` (`lib/dataQuality/warningFingerprint.ts:18`), `loadIgnoredWarnings` (`lib/admin/loadIgnoredWarnings.ts:16`), `Step3Row` (`components/admin/wizard/Step3Review.tsx:83`), staged data builder (`components/admin/review/sectionData.ts:104`), announce gate (`components/admin/review/ShowReviewSurface.tsx:864-866`), attention memo (`components/admin/wizard/Step3ReviewModal.tsx:313-329`), shows select (`components/admin/OnboardingWizard.tsx:425-433`), `visibleWarningRows` (`lib/admin/visibleWarningRows.ts`), panel count helper (`lib/admin/sheetWarningsCount.ts:17-21`), row-bucket accessor + consumers (`lib/admin/step3Buckets.ts:47`, `lib/admin/step3Buckets.ts:68`, `lib/admin/step3Buckets.ts:94`, `lib/admin/step3Buckets.ts:114`), stable keys (`lib/dataQuality/warningIdentity.ts:46`), attention derivation info-throw (`lib/admin/warningAttention.ts:27-35`), attention selector (`components/admin/review/ShowReviewSurface.tsx:568`), card derivations (`components/admin/wizard/Step3SheetCard.tsx:513-520`), summary buckets (`components/admin/wizard/Step3Review.tsx:1039-1042`). R1 probes (2026-08-28) re-verified the sequential read shape of the step-3 loader and the `[data-attention-anchor]` selector path. R2-repair probes verified: staged use-raw action contract (`app/admin/onboarding/_actions/useRawStaged.ts:1-80`), finalize decision ride-along (`app/api/admin/onboarding/finalize/route.ts:1039-1049` and `app/api/admin/onboarding/finalize/route.ts:1338`), phase-2 re-persist site (`lib/sync/phase2.ts:552`), first-seen show creation (`lib/sync/phase2.ts:497`, `app/api/admin/onboarding/finalize/route.ts:568`), scan-upsert column preservation by omission (`lib/sync/runOnboardingScan.ts:564-575`), parse-result loose coercion (`components/admin/OnboardingWizard.tsx:497-499`), durable-table canonical CHECK (`supabase/migrations/20260702120000_ignored_warnings.sql:8-9`), pending select (`components/admin/OnboardingWizard.tsx:380`), attention-menu mount gate (`components/admin/wizard/Step3ReviewModal.tsx:331-340` and `components/admin/wizard/Step3ReviewModal.tsx:549-643`).
