# PSAT-1 — Durable pull-sheet override in the Step-3 read (recovery-loop fix)

**Date:** 2026-07-17
**Slug:** `psat1-durable-override-dto`
**Backlog:** `BL-PSAT-STEP3-DURABLE-OVERRIDE-DTO`
**Deferred:** `DEFERRED.md` → PSAT-1 (mark RESOLVED on ship)
**Owner routing:** UI work → Opus / Claude Code (invariant-8 impeccable dual-gate).
**Master spec cross-refs:** §5.4 (pull-sheet archived-tab override), §5.6 (S1–S4 state machine), §5.8 (audit-before-re-scan / deferred-apply gate), §9 (per-sheet re-scan).

---

## 1. Problem

The Step-3 wizard review derives the archived-tab override affordance state from the **persisted parse preview** (`pending_syncs.parse_result.archivedPullSheetTabs`), never from the **durable override row** (`pending_syncs.pull_sheet_override`). When those two disagree, Step-3 re-offers an already-committed decision, and the recovery attempt loops.

### 1.1 Root cause (cited, live code)

- `components/admin/wizard/step3ReviewSections.tsx:3828` derives the control-gate from the preview:
  ```tsx
  overrideActive={s.archivedPullSheetTabs.some((t) => t.included)}
  ```
- `components/admin/OnboardingWizard.tsx:430` — the `pending_syncs` select list does **not** include `pull_sheet_override`:
  ```
  "staged_id, drive_file_id, staged_modified_time, parse_result, source_anchors, last_finalize_failure_code, triggered_review_items, use_raw_decisions"
  ```
  So the durable override is never read into the Step-3 render at all.

### 1.2 The loop

The accept/revoke route (`app/api/admin/onboarding/pull-sheet-override/route.ts`) commits the `set_pull_sheet_override` RPC, then triggers a **best-effort** post-commit re-scan to refresh the preview. Per §5.8 (audit-before-re-scan) the route returns HTTP 200 on RPC success **even if that re-scan fails** (transient Drive/DB fault). On re-scan failure:

- **Accept committed, re-scan failed:** durable `pull_sheet_override = A`, but preview `archivedPullSheetTabs` still has tab A with `included:false`. Step-3 renders **S2 (offer)** again → the offer's Accept posts `expectedOverrideSnapshot: null` (`step3ReviewSections.tsx:2148`) → the RPC row-state CAS sees `current = A` vs `expected = null` → `40001` → route `409` → `router.refresh()` reloads the **same stale envelope** → S2 again → loop.
- **Revoke committed, re-scan failed** (inverse): durable `pull_sheet_override = null`, but preview still has tab A `included:true`. Step-3 renders **S3 (revoke note)** again → the revoke posts `expectedOverrideSnapshot: {A}` → CAS sees `current = null` → `40001` → `409` → refresh → S3 again → loop.

The admin is stuck until a **later** re-scan happens to succeed and refreshes the preview.

### 1.3 What this is NOT (do not relitigate)

1. **Not a data bug.** The override RPC commits exactly as intended.
2. **Publication stays fail-safe.** The Task-11 finalize consistency gate (`evaluateFinalizeOverrideGate`, `lib/sync/pullSheetOverride.ts:56`) refuses any `applied ≠ desired` mismatch with `STAGED_PARSE_OUTDATED_AT_PHASE_D`, so no wrong gear can publish regardless of this UI loop.
3. **Infra-gated.** The loop requires the post-commit re-scan to FAIL; it is a recovery-UX defect, not a correctness defect.

---

## 2. Goals / Non-goals

### Goals

- Derive the Step-3 pack-list override state from the **durable** `pending_syncs.pull_sheet_override`, not the preview.
- When durable and preview **disagree** (committed-but-preview-stale), render an explicit **recovery state** offering a real re-scan, instead of re-offering S2/S3.
- Break the loop: the recovery affordance must actually refresh the preview (a re-scan), not merely `router.refresh()` the stale envelope.

### Non-goals

- **No DB schema change.** `pending_syncs.pull_sheet_override` already exists (written by the RPC; read by `finalize/route.ts:1055`).
- **No advisory-lock topology change.** This is a read-path + render change only; the `set_pull_sheet_override` RPC remains the sole `show:` lock holder for this hashkey.
- **No change to the accept/revoke route or the RPC.** The route's audit-before-re-scan / 200-on-RPC-success contract (§5.8) is unchanged.
- **No new `§12.4` error code.** The recovery state renders plain-English copy + the existing `RescanSheetButton` (which already routes any code through `messageFor`); invariant 5 holds.

---

## 3. Design

### 3.1 Thread the durable override through the Step-3 read

The durable override is reduced to an `OverrideSnapshot` (`{ tabName, fingerprint } | null`, `lib/sync/pullSheetOverride.ts:22`) at the loader boundary and carried, mode-agnostic, to the render site. Threading path (each hop cited):

| Hop | File:symbol | Change |
| --- | --- | --- |
| 1. Select | `OnboardingWizard.tsx:430` | Add `pull_sheet_override` to the `pending_syncs` select list. |
| 2. Raw row type | `OnboardingWizard.tsx:247` `PendingSyncRowForBuild` | Add `pull_sheet_override?: unknown`. |
| 3. Raw row assembly | `OnboardingWizard.tsx:519` `rawPendingByDfid.set(...)` | Add `pull_sheet_override: ps.pull_sheet_override`. |
| 4. Row derivation | `OnboardingWizard.tsx:283` `buildStep3Row` | Reduce `pending.pull_sheet_override` (untyped jsonb) to an `OverrideSnapshot` via a validated coercer; attach to the row when non-null. |
| 5. Row type | `Step3Review.tsx:80` `Step3Row` | Add `pullSheetOverride?: OverrideSnapshot` (optional; absent for non-staged rows — `exactOptionalPropertyTypes`). |
| 6. Card | `Step3SheetCard.tsx:596` `buildStagedSectionData(...)` call | Pass `pullSheetOverride: row.pullSheetOverride ?? null`. |
| 7. DTO input + field | `sectionData.ts:91` `buildStagedSectionData` + `sectionData.ts:42` `SectionCore` | Add `pullSheetOverride: OverrideSnapshot` to `SectionCore`; pass through in `buildStagedSectionData`. |
| 8. Published DTO | `publishedAdapter.ts:40` `buildPublishedSectionData` | Set `pullSheetOverride: null` (published packlist has no staged affordance; `archivedPullSheetTabs` is already `[]` there — `publishedAdapter.ts:81`). |
| 9. Render site | `step3ReviewSections.tsx:3824` `<PackListBreakdown>` | Pass `pullSheetOverride={s.pullSheetOverride}` instead of the boolean `overrideActive`. |
| 10. Component | `step3ReviewSections.tsx:1925` `PackListBreakdown` | Replace the `overrideActive: boolean` prop with `pullSheetOverride: OverrideSnapshot`; derive state internally (§3.2). |

**Freeze-flag threading (separate from the override snapshot — see §3.4).** `PackListBreakdown` renders only inside the shared `ShowReviewSurface` via `s.render(data)` (`ShowReviewSurface.tsx:819`), which today passes only `data` — no run-state. The S5 `RescanSheetButton` is a mutator under the Step-3 publish-run freeze contract, so `isPublishRunActive` must reach it. Thread it via a small React context (NOT by polluting the content DTO `SectionData`):

| Hop | File:symbol | Change |
| --- | --- | --- |
| F1 | `ShowReviewSurface.tsx` props (`:142`) | Add optional `isPublishRunActive?: boolean` (default `false`). |
| F2 | `Step3ReviewModal.tsx:715` renders `<ShowReviewSurface …>` (`:55`/`:122` import; the resolved `isPublishRunActive` flag is computed at `:167`) | Pass `isPublishRunActive={isPublishRunActive}` (the modal already holds it — `:79`,`:167`). |
| F3 | `PublishedReviewPage.tsx:188` renders `<ShowReviewSurface layout="page">` | Omit the prop → default `false` (published never shows S5). |
| F4 | `ShowReviewSurface.tsx` around the section render (`:819`) | Provide a new `Step3RunStateContext` (`{ isPublishRunActive }`, default `{ isPublishRunActive: false }`) wrapping the `{s.render(data)}` region — mirrors the existing `Step3SectionChromeContext` pattern in `step3ReviewSections.tsx`. |
| F5 | `step3ReviewSections.tsx` `PackListBreakdown` | `const { isPublishRunActive } = useContext(Step3RunStateContext);` and pass `disabled={isPublishRunActive}` to the S5 `RescanSheetButton`. The local variable MUST be named `isPublishRunActive` so the extended freeze meta-test (§5) matches the literal `disabled={isPublishRunActive}`. |

**Coercer (hop 4) — MUST agree with finalize's durable-override validation (Codex R4 P2).** The durable `pending_syncs.pull_sheet_override` column stores the **full audit shape** `{tabName, fingerprint, acceptedBy, acceptedAt}` (written by the `set_pull_sheet_override` RPC), and finalize accepts it as a valid override ONLY when all four are present strings — `coercePullSheetOverride` (`finalize/route.ts:290`). If Step-3 treated a partial `{tabName, fingerprint}` as an active override while finalize treats it as `null`, "override active" would mean two different things across the two surfaces. So the loader reducer MUST use the SAME full-shape validator, then reduce to the snapshot:

1. **Extract** `coercePullSheetOverride` from `finalize/route.ts:290` into `lib/sync/pullSheetOverride.ts` as an exported function (single source of truth), and re-import it in `finalize/route.ts` (drop the local copy — the existing finalize tests cover it). `coerceOverrideSnapshot` (`finalize/route.ts:309`, the reduced-shape validator for the `*_applied` column) stays where it is; it is a different column's validator.
2. **Define** the loader reducer as the composition:
   ```ts
   /** Reduce an untyped pending_syncs.pull_sheet_override jsonb value to an
    *  OverrideSnapshot, using the SAME full-audit-shape validation finalize uses,
    *  then dropping the audit fields (§5.8). Partial/absent shape → null, so
    *  Step-3 "override active" agrees exactly with the finalize gate. */
   export const coerceOverrideSnapshotFromRow = (value: unknown): OverrideSnapshot =>
     overrideSnapshot(coercePullSheetOverride(value));
   ```
   (`overrideSnapshot` is `lib/sync/pullSheetOverride.ts:30`.)

Net effect: a durable value missing `acceptedBy`/`acceptedAt` reduces to `null` in Step-3 exactly as it does at finalize — no split-brain on override validity.

### 3.2 Divergence detection — snapshot equality

Inside `PackListBreakdown` (staged only), compute:

```ts
const staged = wizardSessionId != null;
const includedTab = staged ? (archivedPullSheetTabs.find((t) => t.included) ?? null) : null;
const previewSnapshot: OverrideSnapshot = includedTab
  ? { tabName: includedTab.tabName, fingerprint: includedTab.fingerprint }
  : null;
const durableSnapshot: OverrideSnapshot = pullSheetOverride; // reduced at the loader
const overrideActive = durableSnapshot !== null;
const divergent = staged && !overrideSnapshotsEqual(durableSnapshot, previewSnapshot);
```

`overrideSnapshotsEqual` (`lib/sync/pullSheetOverride.ts:72`) is the existing comparator: both-null equal; one-null-one-set not equal; two set snapshots equal iff `tabName` AND `fingerprint` agree. Snapshot equality (not a boolean) is deliberate: it catches boolean disagreement **and** an accept-A-then-preview-shows-B tab swap.

**Why this never collides with S4 (content-changed).** The content-changed / tab-missing path (`discardAndRerun`, `lib/sync/pullSheetOverride.ts:164`) atomically, inside the re-scan transaction, (a) clears the durable override (`clearOverride()` → `null`) and (b) flags the re-detected preview entry `contentChangedSinceAccept = true` (`included:false`). So after a **successful** re-scan the durable snapshot is `null` and `previewSnapshot` is `null` → `overrideSnapshotsEqual(null, null) === true` → **not divergent** → S4 renders normally. The only way durable and preview diverge is PSAT-1's exact scenario: the accept/revoke RPC commits the durable override in its own tx, and the **separate** best-effort post-commit re-scan (which would refresh the preview) fails. There is no other producer of divergence.

### 3.3 State machine (§5.6) with the new recovery state

`PackListBreakdown` renders the pack-list cases (`PackListCases`, unchanged) PLUS one archived-tab region. The archived-tab region is a **single mutually-exclusive, total state machine** evaluated in strict **first-match-wins precedence order** — S5 is checked FIRST so it preempts S1/S2/S3/S4:

| Order | State | Condition (staged; each row assumes all earlier rows' conditions are false) | Renders |
| --- | --- | --- | --- |
| 1 | **S5 (divergent — NEW)** | `divergent` | The recovery block (§3.4). **Preempts S1/S2/S3/S4** — a durable-set + empty-preview row is S5, NOT S1. |
| 2 | S1 (empty) | `!hasCases && archivedPullSheetTabs.length === 0` | "No pack list parsed." (unchanged). |
| 3 | S3 (included note) | `overrideActive && includedTab` | `ArchivedTabIncludedNote` (unchanged). |
| 4 | S2 (offer) / S4 (re-confirm) | `!overrideActive` → `offers = tabs.filter(!included)` | `ArchivedTabOffer` per offer (unchanged; S4 = `contentChangedSinceAccept`). |

Because S5 is row 1, its condition (`divergent`) is the guard on every later row. Concretely: S1's implemented gate MUST become `!divergent && !hasCases && archivedPullSheetTabs.length === 0` (so the durable-set/empty-preview case in §3.5 falls to S5, not the empty state — the P2 exclusivity fix). S3/S2/S4 already carry `!divergent` in their derivations below. **Totality (over the full input tuple).** The distinguishing inputs are `(durableSnapshot, archivedPullSheetTabs, hasCases)` — NOT just `previewSnapshot`, which is derived only from the *included* tab and so cannot by itself separate S1/S2/S4 (all three can have `previewSnapshot === null`). The array's non-included/`contentChangedSinceAccept` dimension is what separates them. The precedence chain is total and exclusive when read in order:

1. `divergent` → **S5** (regardless of the array — this is why S5 is row 1).
2. else `!hasCases && archivedPullSheetTabs.length === 0` → **S1** (empty).
3. else `overrideActive && includedTab` → **S3** (an included tab whose snapshot equals the durable one — else step 1 would have caught it).
4. else → **S2/S4**: `offers = archivedPullSheetTabs.filter((t) => !t.included)`; each renders `ArchivedTabOffer` (S4 when `contentChangedSinceAccept`, else S2). If that filtered list is empty, only the cases render.

Every `(durableSnapshot, archivedPullSheetTabs, hasCases)` triple matches exactly one of steps 1–4 (the `else` chain makes them disjoint and exhaustive). Cases (`hasCases`) render independently in every non-empty state.

Updated internal derivations (the boolean `overrideActive` prop is gone):

```ts
const offers = staged && !divergent && !overrideActive
  ? archivedPullSheetTabs.filter((t) => !t.included)
  : [];
// includedNote gate: staged && !divergent && overrideActive && includedTab
```

### 3.4 Recovery block (S5) — real re-scan, not reload

A new internal component `ArchivedTabRescanNeeded` renders inside the pack-list region when `divergent`:

- A short note, matching the existing card chrome (`bg-info-bg`, `border-border`, typographic quotes, **no em dash** per DESIGN.md UI-copy rule):
  > **Gear saved.** The preview is out of date. Re-scan to refresh it.
- The existing `components/admin/RescanSheetButton.tsx` (`POST /api/admin/onboarding/rescan-sheet` → re-fetch + re-parse + re-stage + `router.refresh()`), passed `driveFileId={dfid}`, `wizardSessionId={wizardSessionId}`, **and `disabled={isPublishRunActive}`** (the Step-3 publish-run freeze contract, spec §4.4 R8 — every `RescanSheetButton` mutator freezes while a publish/resume finalize run is active). `isPublishRunActive` comes from `Step3RunStateContext` (hops F1–F5 in §3.1). Omitting this freeze prop would ship an enabled body-level re-scan during an active publish run and is caught at CI time by the extended freeze meta-test (§5).
- **Rationale (do not relitigate):** the deferred-text copy suggestion "reload to update" is **wrong**. `router.refresh()` re-reads the SAME stale envelope (the preview was never refreshed because the post-commit re-scan failed). Only a NEW re-scan converges the preview to the durable override. `RescanSheetButton` is exactly that re-scan.

Guard: S5 only renders when `dfid != null && wizardSessionId != null` (both are non-null in staged mode; `RescanSheetButton` requires `driveFileId: string`). If `dfid` is somehow null in a staged row (should not happen — `isStaged(s)` ⇒ `s.dfid` is a string, and `dfid = s.driveFileId = dfid`), fall back to rendering nothing new (never crash; never re-offer S2/S3 — S5's suppression still holds).

### 3.5 Guard conditions (every input null/empty)

| Input | Value | Behavior |
| --- | --- | --- |
| `pullSheetOverride` | `null` (no durable override) | `overrideActive = false`; divergence iff preview has an included tab (revoke-stale) → S5; else S2/S4. |
| `pullSheetOverride` | `{tabName, fingerprint}` | `overrideActive = true`; divergence iff no matching included tab → S5; else S3. |
| `archivedPullSheetTabs` | `[]` | `previewSnapshot = null`; divergent iff durable set → S5; else S1/normal. |
| `wizardSessionId` | absent (published mode) | `staged = false`; `divergent = false` always; no affordance, no S5 (published packlist is display-only). |
| `dfid` | `null` in staged (defensive) | S5 renders nothing (no crash); cases still render. |
| jsonb `pull_sheet_override` | malformed / non-object / partial (missing `acceptedBy` or `acceptedAt`) | `coerceOverrideSnapshotFromRow` → `null` (treated as no override — identical to finalize's `coercePullSheetOverride`, §3.1 hop 4). |

### 3.6 Published mode

`buildPublishedSectionData` sets `pullSheetOverride: null` and already sets `archivedPullSheetTabs: []`. In published mode `wizardSessionId` is absent, so `staged = false`, `divergent = false`, and the pack list renders plain (no affordance). Unchanged behavior.

---

## 4. Testing

### 4.1 Unit — loader reduce (`buildStep3Row`)

- Durable `pull_sheet_override = {tabName:'OLD A', fingerprint:'f1', acceptedBy, acceptedAt}` → `row.pullSheetOverride === {tabName:'OLD A', fingerprint:'f1'}` (audit fields dropped).
- Durable `null` → `row.pullSheetOverride` absent (`exactOptionalPropertyTypes`; not `undefined`-valued).
- Malformed jsonb (`{}`, `"x"`, number, missing `fingerprint`) → reduced to `null`/absent.
- Non-pending row (`pending === null`) → `row.pullSheetOverride` absent.

### 4.1b Integration — `fetchStep3Data` production wiring (MANDATORY — pins the actual root cause)

The §4.1 tests exercise the PURE `buildStep3Row` in isolation; they can all pass while the production read never reads the durable column (the exact live bug). So this milestone MUST also add a `fetchStep3Data` wiring test — modeled directly on the existing `source_anchors` threading test at `tests/components/onboardingWizard.fetchStep3.test.ts:285` (the `describe("fetchStep3Data — source_anchors threading")` block; the SELECT-column assertion is at `:291`). Two assertions, both **fail-first on `origin/main`**:

1. **SELECT column present:** after `fetchStep3Data(SESSION_ID)` with a seeded `pending_syncs` row, `expect(seed.selectByTable["pending_syncs"]).toContain("pull_sheet_override")`. This catches "coercion + threading added but the production SELECT column forgotten" (the mock passthrough would otherwise mask it) — the class the source_anchors test's own comment calls out at `tests/components/onboardingWizard.fetchStep3.test.ts:303-304`.
2. **Durable value threaded onto the row:** seed `pending_syncs.pull_sheet_override = {tabName:'OLD A', fingerprint:'fp1', acceptedBy, acceptedAt}`; assert the returned row's `pullSheetOverride === {tabName:'OLD A', fingerprint:'fp1'}` (reduced, audit fields dropped) — proving the `rawPendingByDfid` assembly (`OnboardingWizard.tsx:519`) copies the column through to `buildStep3Row`. A `null` durable value → row field absent.

Without §4.1b, an implementation can be green on §4.1/§4.2/§4.3 and still leave the production loop unfixed.

### 4.2 Unit — `coerceOverrideSnapshotFromRow`

Table (asserts parity with finalize's full-shape contract, Codex R4 P2): full audit shape `{tabName, fingerprint, acceptedBy, acceptedAt}` all strings → `{tabName, fingerprint}` snapshot; **missing `acceptedBy` OR `acceptedAt` → null** (matches `coercePullSheetOverride`); non-string `tabName`/`fingerprint` → null; non-object / array / null → null; extra keys ignored. Add/keep a parity assertion that `coerceOverrideSnapshotFromRow(v)` is `overrideSnapshot(coercePullSheetOverride(v))` for a representative set (so the extraction can't drift from finalize's validator).

### 4.3 Component — `PackListBreakdown` state machine

Derive expected state from fixtures (anti-tautology: assert against the durable/preview inputs, never a container that renders both). The `archivedPullSheetTabs fixture` column is the EXACT preview array each case must supply — the fixture is spelled out so a case can't be satisfied by an accidentally-empty array that has nothing to suppress. `fp1`/`fp2` are distinct fingerprints; every non-published case supplies `wizardSessionId`.

| # | durable `pullSheetOverride` | `archivedPullSheetTabs` fixture (EXACT) | expected | failure mode the case pins |
| --- | --- | --- | --- | --- |
| a | `null` | `[{tabName:'OLD A', fingerprint:fp1, included:false, contentChangedSinceAccept:false}]` | **S2 offer** for `OLD A` | normal first-discovery offer still renders |
| b | `{OLD A, fp1}` | `[{tabName:'OLD A', fingerprint:fp1, included:true, contentChangedSinceAccept:false}]` | **S3 included note** | converged accept renders the revoke note |
| c | `{OLD A, fp1}` | `[{tabName:'OLD A', fingerprint:fp1, included:false, contentChangedSinceAccept:false}]` (tab PRESENT, not included — the accept-stale preview) | **S5 recovery block** (`RescanSheetButton` present) AND assert the `data-testid` for the `OLD A` S2 offer (`pack-list-archived-offer-…-OLD A`) is **absent** | catches the accept-stale re-offer loop: the non-included tab that WOULD render S2 is suppressed by S5. (Empty-array fixture is explicitly disallowed here — it would leave nothing to suppress.) |
| d | `null` | `[{tabName:'OLD A', fingerprint:fp1, included:true, contentChangedSinceAccept:false}]` (tab still INCLUDED — the revoke-stale preview) | **S5 recovery block** AND assert the S3 revoke note (`ArchivedTabIncludedNote` Revoke button) is **absent** | catches the revoke-stale re-offer loop: the included tab that WOULD render S3 is suppressed by S5 |
| e | `{OLD B, fp2}` | `[{tabName:'OLD A', fingerprint:fp1, included:true, contentChangedSinceAccept:false}]` | **S5** (snapshot `tabName` mismatch) | catches the accept-A-then-preview-shows-B tab swap (boolean-only detection would miss it) |
| f | `null` | `[{tabName:'OLD A', fingerprint:fp2, included:false, contentChangedSinceAccept:true}]` (durable null, re-detected entry NOT included, content-changed flag set — the exact `discardAndRerun` output) | **S4 re-confirm** (NOT S5) — `previewSnapshot === null` because no tab is `included`, so `overrideSnapshotsEqual(null, null) === true` → not divergent | catches S5 stealing the content-changed re-confirm (proves the S4 non-collision from §3.2) |
| g | `null` | `[{tabName:'OLD A', fingerprint:fp1, included:false, contentChangedSinceAccept:false}]`, **no `wizardSessionId`** (published mode) | plain pack list, no affordance, no S5 | published mode never shows the staged affordance or S5 |

Each assertion asserts the S5 recovery block via its own `data-testid` AND asserts the competing state's affordance is absent (cases c/d) — proving suppression, not merely presence.

### 4.4 Real-browser (impeccable / Playwright)

The S5 recovery block is new UI. Render it in the real-browser harness (mirrors `reference_step3_modal_realbrowser_harnesses`): assert the note text, the `RescanSheetButton` renders and is focusable, no raw code leaks, no em dash in rendered copy. If S5 sits inside a fixed-dimension parent, add a `getBoundingClientRect` layout assertion; otherwise document "no fixed-dimension parent — layout task N/A."

**Freeze behavioral test (component):** an additional `PackListBreakdown` case in divergent (S5) state, rendered inside a `Step3RunStateContext.Provider value={{ isPublishRunActive: true }}` — assert the S5 `RescanSheetButton` is `disabled` (the frozen path). A twin case with `isPublishRunActive: false` asserts it is enabled. This is the behavioral complement to the static freeze meta-test (§5), catching a freeze-prop that is present but wired to the wrong value.

### 4.5 Regression

- Existing `PackListBreakdown` tests that passed `overrideActive` must be migrated to `pullSheetOverride` (the prop is renamed/retyped). Grep `overrideActive` across `tests/` and update every call site.
- The existing S2/S3/S4 paths must be byte-behavior-identical when `!divergent`.

---

## 5. Invariants & meta-tests

- **Invariant 8 (UI dual-gate).** Files under `components/` are touched → `/impeccable critique` AND `/impeccable audit` on the diff; P0/P1 fixed or deferred via `DEFERRED.md` before cross-model review.
- **Invariant 5 (no raw codes in UI).** S5 renders plain copy + `RescanSheetButton` (which routes codes through `messageFor`). No new `§12.4` code.
- **Invariant 2 (advisory lock).** Untouched — read-path/render only. No `pg_advisory*` change ⇒ `advisoryLockRpcDeadlock.test.ts` unaffected.
- **Invariant 9 (Supabase call-boundary).** The `pending_syncs` select already destructures `{ data, error }` at `OnboardingWizard.tsx`; adding one column to the existing `.select(...)` introduces no new call site. No `_metaInfraContract` row needed. (Confirm during implementation.)
- **Invariant 10 (mutation-surface telemetry).** No new mutation surface — the accept/revoke route and RPC are unchanged; `RescanSheetButton` posts to the existing, already-instrumented `/rescan-sheet` route.

**Meta-test inventory:** This milestone **EXTENDS one** structural meta-test and creates/extends none of the others.

- **EXTENDS `tests/components/admin/wizard/_metaStep3FreezeContract.test.ts:24` (`SURFACES`).** The S5 recovery block adds a NEW `<RescanSheetButton>` render site in `components/admin/wizard/step3ReviewSections.tsx`, a file **not** currently in the meta-test's `SURFACES` list (`Step3ReviewModal.tsx`, `Step3SheetCard.tsx`). Add `components/admin/wizard/step3ReviewSections.tsx` to `SURFACES` so the fails-by-default guard scans the new site and enforces `disabled={isPublishRunActive}` on it. This is the structural defense (same-vector-→-structural-pin rule): the freeze contract's whole point is that a new un-frozen Re-scan mutator fails CI immediately; a new render site in an unscanned file would silently bypass it. The meta-test's per-file `els.length > 0` sanity assertion holds (the file has exactly one `RescanSheetButton`).
- **Creates/extends none of:** Supabase call-boundary (`_metaInfraContract`), sentinel-hiding, admin-alert-catalog, advisory-lock topology, no-inline-email. Reason: no new Supabase helper, no new admin alert, no lock surface, no email path.

---

## 6. Watchpoints (pre-load the reviewer — do not relitigate)

1. **`Step3Review.tsx` has a pre-existing NUL byte at line ~1165** (present on `origin/main`; `git show origin/main:...` confirms). It is far from the `Step3Row` type at line 80. My diff does not touch that region. Any grep/format anomaly around it is pre-existing, not introduced here.
2. **"reload to update" copy is deliberately rejected** in favor of a real re-scan (`RescanSheetButton`) — see §3.4. `router.refresh()` cannot heal the loop.
3. **Snapshot equality, not boolean** — chosen to catch the tab-swap case (§3.2). Ratified by the user before spec.
4. **S5 vs S4 non-collision is structural** (§3.2): `discardAndRerun` nulls the durable override in-tx, so content-changed is always `null==null` (not divergent). Case (f) pins this.
5. **`overrideActive` prop is removed** from `PackListBreakdown` and replaced by `pullSheetOverride: OverrideSnapshot`. All call sites (one prod render + tests) migrate.
6. **No DB / no lock / no RPC / no route-behavior change** — the fix is in the read + render layer. The one `finalize/route.ts` edit is a pure refactor: extract `coercePullSheetOverride` to the lib and re-import it (identical logic, existing finalize tests still cover it). No finalize behavior changes.
7. **S5 `RescanSheetButton` freezes on `isPublishRunActive`** (§3.4, hops F1–F5) — honoring the existing Step-3 publish-run freeze contract + extending its meta-test (§5). The sibling archived-tab accept/revoke buttons (`ArchivedTabOffer`/`ArchivedTabIncludedNote`) are **deliberately NOT** brought under the freeze contract here — that contract is `RescanSheetButton`-specific, and expanding it to the accept/revoke affordances is out of scope (would relitigate a pre-existing boundary). S5 introduces a `RescanSheetButton`, which the contract already governs everywhere it renders.

---

## 7. Numeric sweep

- States in the pack-list region: **5** (S1 empty, S2 offer, S3 included note, S4 re-confirm, **S5 divergent-recovery** new). §3.3 and §4.3 agree.
- Override-snapshot threading hops: **10** (§3.1 first table). Freeze-flag threading hops: **5** (F1–F5, §3.1 second table).
- Source files touched: `OnboardingWizard.tsx`, `Step3Review.tsx`, `Step3SheetCard.tsx`, `sectionData.ts`, `publishedAdapter.ts`, `step3ReviewSections.tsx`, `lib/sync/pullSheetOverride.ts` (extracted `coercePullSheetOverride` + new `coerceOverrideSnapshotFromRow`), `app/api/admin/onboarding/finalize/route.ts` (re-import the extracted coercer, drop local copy), `ShowReviewSurface.tsx` (freeze prop + context), `Step3ReviewModal.tsx` (pass freeze prop) = **10 source files** (+ tests, the freeze meta-test extension, and `DEFERRED.md`/`BACKLOG.md`). (`PublishedReviewPage.tsx` omits the freeze prop — a default, not an edit; not counted.)
- New `§12.4` codes: **0**. New DB columns: **0**. New advisory-lock holders: **0**. Structural meta-tests extended: **1** (`_metaStep3FreezeContract`).
