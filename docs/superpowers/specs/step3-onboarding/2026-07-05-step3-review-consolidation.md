# Step-3 Review Consolidation — Design Spec

**Date:** 2026-07-05
**Status:** Draft (autonomous /ship-feature)
**Slug:** `step3-review-consolidation`

## 1. Goal

Collapse the four separate onboarding-finalize surfaces into a **single Step-3 "Review & publish" page** whose per-show rows carry their own lifecycle status, and whose only resolution path for a blocked show is the show-detail review modal Doug already uses. An operator who pauses mid-finalize, or returns to a session with blocked shows, lands back on the *same* review page — not a distinct interstitial — and never approves a changed sheet blind.

Today `/admin` renders one of four surfaces depending on the finalize checkpoint (`app/admin/page.tsx:157-208`):

- `checkpoint.status === "in_progress"` → `<FinalizeInProgress>` (`app/admin/page.tsx:172-182`)
- `checkpoint.status === "all_batches_complete"` → `<ReadyToPublish>` / `<StaleReadyToPublish>` (`app/admin/page.tsx:183-192`)
- `checkpoint.status === "final_cas_done"` → `<DashboardWithHeader>` (defensive, `app/admin/page.tsx:193-201`)
- `checkpoint === null` → `<OnboardingWizard>` (the wizard, incl. Step-3, `app/admin/page.tsx:203-208`)

Plus a standalone per-sheet recovery page at `app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx` reached via links in `Step3ReviewModal.tsx:1087` and `Step3SheetCard.tsx:183`.

The wizard Step-3 (`OnboardingWizard.tsx:444` → `Step3ReviewWithFinalize`) already renders per-show rows with a per-row status badge (`Step3Review.tsx` `badgeForStatus`) and a Publish/finalize footer. This spec makes that surface the single home for the whole finalize lifecycle.

## 2. Non-goals / Out of scope

- No change to the **finalize execution model** (batched, checkpointed, resumable POST loop in `app/api/admin/onboarding/finalize/route.ts`) or the CAS flip. We re-home the *entry surface* and *resolution UI*, not the publish pipeline.
- No change to the **mutation API routes** (`apply` / `discard` / `approve` / `unapprove` / `staged-diagram` under `app/api/admin/onboarding/staged*`). They survive verbatim; only the *page* that calls them is deleted.
- No change to the **Held model** (Task B2): finalize creates a show for every clean row; checked → CAS to Live (`published=true`), unchecked → Held (`published=false`). We surface these states; we do not alter them.
- No change to the **live-show** staged route `app/admin/show/staged/[stagedId]` (existing-show re-apply). Different entry point, out of scope.
- No DB schema change, no new `§12.4` catalog code, no advisory-lock topology change.

## 3. Current-state reference (verified citations)

### 3.1 Row model

`Step3Row` (`components/admin/wizard/Step3Review.tsx:79-92`) with `status: Step3ManifestStatus`:

```
"staged" | "hard_failed" | "skipped_non_sheet" | "applied"
| "defer_until_modified" | "permanent_ignore" | "discard_retryable" | "live_row_conflict"
```

- `isCleanReviewRow(s) = s === "staged" || s === "applied"` (`OnboardingWizard.tsx:214`). `applied` = **checked-to-publish** (publish-intent), NOT live. `staged` = **unchecked clean** (→ Held on finish).
- `isResolved(s)` = `applied | defer_until_modified | permanent_ignore | skipped_non_sheet` (`Step3Review.tsx:137-143`).
- Blocking = `hard_failed | live_row_conflict | discard_retryable`, plus `staged` **with** a non-null `lastFinalizeFailureCode` (the demoted-wedge case). This is exactly the `readUnresolvedSheets` predicate (`app/admin/_unresolvedSheets.ts:141`): `BLOCKING_STATUSES.has(status) || (status === "staged" && failureCode !== null)`.
- Per-row status badge already exists: `badgeForStatus(status) → { label, tone: "ok"|"warn"|"info"|"blocked" }` (`Step3Review.tsx:145+`).
- `Step3Row.lastFinalizeFailureCode` (`Step3Review.tsx`, threaded from `pending_syncs`) already drives a "dirty re-scan" distinct render (`RESCAN_REVIEW_REQUIRED`) with a link to the reapply page and the publish checkbox suppressed.

Rows are built server-side in `OnboardingWizard.tsx:357` (`manifestRows.map(...)`), returned as `Step3FetchResult = { kind:"ok"; rows; finishable } | { kind:"infra_error"; message }` (`OnboardingWizard.tsx:206`), and mounted at `OnboardingWizard.tsx:444`. This path runs **only** in the `checkpoint === null` branch.

### 3.2 Surfaces to delete

- `components/admin/FinalizeInProgress.tsx` — `FinalizeInProgress({ sessionId, batchesCompleted, unresolved, lastProcessedAt })`: progress + unresolved-sheet links + abandoned-finalize cleanup section.
- `components/admin/ReadyToPublish.tsx` — `ReadyToPublish({ sessionId })`: "Ready to publish" + `RunFinalCASButton`.
- `components/admin/StaleReadyToPublish.tsx` — `StaleReadyToPublish({ sessionId })`: stale publish + discard sections.
- `app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx` — renders `<StagedReviewCard mode="wizard_failed_reapply" …>` (`:295-300`) or a resolved/not-found fallback.
- `app/admin/_unresolvedSheets.ts` — folded into the unified read (its predicate moves; the file may be deleted or repurposed).

### 3.3 Resolution UI (StagedReviewCard) — reused, folded into the modal

`components/admin/StagedReviewCard.tsx` (759 LOC):
- `allowedActionsFor(item)` (`:115-122`): `["apply"]` default; `["rename","reject"]` for MI-12; `["rename","independent"]` for MI-13/MI-14.
- `actionLabel(action,item,isWizardMode)` (`:189-200`): `apply` → "Approve" (wizard) / "Apply this change"; `reject` → "Reject this change"; `independent` → "Treat as different people"; `rename` → `Rename to "<target>"`.
- `describeItem(item)` (`:131-187`): plain-language per invariant.
- Per-item `<fieldset>` radio group, choices **forced-unset** (`initialChoices`, MI-14 rationale) so no blind bulk-approve.
- `reviewItemsCorrupt` fail-closed gate.
- Endpoints: wizard mode → `/api/admin/onboarding/staged/<wsid>/<dfid>/{apply,discard}`; live mode → `/api/admin/show/staged/...` or `/api/admin/staged/...`.

### 3.4 Review modal (fold target)

`components/admin/wizard/Step3ReviewModal.tsx:149-161`:
```
Step3ReviewModal({ data: SectionData, checked, isDirtyRescan,
                   onRequestSetChecked, onClose })
```
`data` carries `{ dfid, wizardSessionId }` (`:162`). `role="dialog" aria-modal`, focus-trapped, drag-down-to-close grab handle, left section nav (jump links with tone dots), scrollable parsed body, footer with `handlePublish` / `publishLabel` "Publish this show" and `NotPublishableNote` (`:57-59`) for recovery flows. The recovery link out lives at `:1087`.

### 3.5 Publish / resume triggers

- `components/admin/FinalizeButton.tsx` — `useFinalizeRun(...)`, `FinalizeTrigger`, streams NDJSON batch progress; POSTs `/api/admin/onboarding/finalize` (+ `finalize-cas`). Consumed by `Step3ReviewWithFinalize.tsx:83`.
- `components/admin/ResumeFinalizeButton.tsx` — `ResumeFinalizeButton({ sessionId })`, POSTs a single resume batch.
- `RunFinalCASButton` (used by `ReadyToPublish`) — runs the final CAS phase.

### 3.6 Redirect + audit machinery

- `next.config.ts:46-75` `async redirects()` array. Per-entry status: an entry with `permanent: true` is 308 (e.g. `/admin/observability → /admin/dev/telemetry`, `next.config.ts:70`); omitting `permanent` (or `permanent: false`) yields a 307. The old staged URL redirect is added here as a **307** (`permanent: false`/omitted — reversible).
- `lib/audit/trustDomains.ts:60-62` registers the staged page path; the surviving API routes are at `:154-170` (core staged apply/discard/approve/unapprove) and `:110-126` (staged-diagram + cleanup). The page entry is removed on delete; API entries stay.

## 4. Target architecture

### 4.1 One surface for the whole lifecycle

`/admin` renders the **unified Step-3 review surface** for every non-terminal finalize state:

| checkpoint.status | Today | Target |
|---|---|---|
| `null` | Wizard Step-3 | Step-3 (unchanged pre-finalize) |
| `in_progress` | FinalizeInProgress | **Step-3** (Resume affordance in footer) |
| `all_batches_complete` | ReadyToPublish / Stale | **Step-3** (Finish/CAS affordance in footer; stale variant = a footer note) |
| `final_cas_done` | Dashboard (defensive) | Dashboard (unchanged) |

The per-show rows come from a **unified server read** that runs across finalize states (§4.3). The footer's primary action is chosen by checkpoint state (§4.5).

### 4.2 Row display states

Each show row shows exactly **one** status. **Live/Held derive from the row's LINKED show, not from `Step3Row.status` alone** (CRITICAL correction, R1): finalize creates a show for every clean row at `published = false` and the final CAS flips only `publish_intent = true` shows to Live (`onboarding_scan_manifest.publish_intent`, migration `20260623000001_onboarding_publish_intent.sql:10`; `created_show_id` links the row to its show, migration `20260611000000_onboarding_manifest_created_show_id.sql:15`; finalize route `:114,:524`; CAS publishes only `status='applied' AND created_show_id IS NOT NULL AND publish_intent=true`, `finalize-cas/route.ts:517-526`). So `published` is the *crew-visible* signal, and `publish_intent` is the *checked-for-publish* signal — a **distinct** thing that determines the pre-CAS "will go Live on Finish" state.

#### 4.2 canonical derivation (ordered, total — structural defense, R8)

This has been the most-revised surface (R1/R5/R6/R7/R8). To close the class, the display state is derived by a **single ordered algorithm** — evaluate top-to-bottom, **first match wins** — over the row's manifest status, failure code, parseResult, and its linked show (session-provenance join OR existing-show branch, §4.3). Every row lands in exactly one state; the `§4.2.2` matrix proves totality across checkpoints. `In progress` is an **orthogonal transient overlay** (client-only, during an active run) layered on top, not a persisted state.

Let `linkedShow` = the show matched by EITHER the session-provenance join OR the existing-show branch (§4.3); `crewVisible(linkedShow)` = `published = true AND archived = false`.

1. **Needs review — other** — status ∈ {`hard_failed`, `live_row_conflict`, `discard_retryable`} → warn; **existing inline controls, unchanged** (§4.2.1). *(highest precedence: a hard block outranks any linked-show state.)*
2. **Needs review — re-apply** — `staged` AND `lastFinalizeFailureCode != null`:
   - well-formed `parseResult` → warn; **`Review →`** → modal (§4.4). No inline approve.
   - null/corrupt `parseResult` → warn; **inline no-details** `Re-scan`/`Ignore`, no Approve (§4.4 guard).
3. **Resolved / set aside** — status ∈ {`permanent_ignore`, `defer_until_modified`} → muted "Set aside for this setup" (session-scoped, §4.4); `skipped_non_sheet` → muted "Skipped (not a sheet)". *(no publish affordance.)*
4. **Live** — `linkedShow` exists AND `crewVisible(linkedShow)` → accent/live. Badge only for a session-created show. For a pre-existing Live show re-touched this session (§4.3 existing-show branch), badge **plus** the existing-show apply-edits checkbox — but that checkbox is editable ONLY at `checkpoint null` (see rule 7's checkbox boundary); post-finalize it is badge-only. An existing-live row with an unapplied staged shadow is **still Live** (the show is serving; its pending edits apply on Finish/CAS) — Live is accurate, not a false state.
5. **Ready to publish** *(pre-CAS checked, NEW — R8)* — `linkedShow` exists via the **session-provenance join**, `published = false`, `archived = false`, AND `publish_intent = true` → positive/idle "Ready to publish". This is a first-seen CHECKED show created Held that CAS will flip to Live on **Finish**. It is NOT Held (it is going Live) and NOT Live yet (CAS hasn't run). Badge only; the intent was baked during the finalize loop, so no re-editable checkbox here.
6. **Held** *(broadened — 2026-07-16 amendment, closes the archived/held existing-show ready-badge hole)* — `linkedShow` exists (via **either** the session-provenance join **or** the existing-show branch, §4.3) AND NOT Live (rule 4) AND NOT Ready-to-publish (rule 5) → idle/neutral. Provenance-agnostic: a deliberately-unchecked session-created show (stays draft), an archived show, OR an **existing show** re-touched this session that is not crew-visible (e.g. archived, or held behind an unresolved publish blocker) — all resolve to Held. The `sessionLinked` guard that previously scoped this rule to session-provenance-only now belongs to **rule 5 only** (rule 5 still requires `sessionLinked = true`); rule 6 no longer checks `sessionLinked` at all. Was `sessionLinked AND linkedShow AND ((published=false AND publish_intent=false) OR archived=true)` — that guard let an existing archived or blocker-held show (reached via the existing-show branch, `sessionLinked=false`) fall through past rule 6 to rule 7 "Ready", showing a green ready-to-publish badge on a show that could not actually be published.
7. **Ready** *(pre-finalize)* — no linked show yet, clean (`staged`/`applied`), not blocking → idle; publish **checkbox** (editable). **Checkbox-state source (HIGH, R9): the manifest `status`, NOT `publish_intent`.** Approve writes `status='applied'` only (`approve/route.ts:180-181`), unapprove writes `status='staged'` only (`unapprove/route.ts:104-105`); `publish_intent` defaults `false` and is stamped ONLY later, during finalize (`recordCreatedShowProvenance`, `finalize/route.ts:527-529`). So pre-finalize **checked = `status==='applied'`, unchecked = `status==='staged'`** (matching `isCleanReviewRow`/§3.1); deriving the pre-finalize checkbox from `publish_intent` would render every checked row unchecked. **Checkbox-affordance boundary (MEDIUM, R9): the editable checkbox exists ONLY at `checkpoint null`** — on Ready rows here AND on the existing-show Live rows of rule 4 (the apply-edits opt-in). At `in_progress`/`all_batches_complete` no editable checkbox renders anywhere: finalize has consumed intent into `publish_intent`, so those rows are badge-only.

| Display state | Tone | Row affordance |
|---|---|---|
| Needs review — other | warn | existing inline controls (§4.2.1) |
| Needs review — re-apply (well-formed) | warn | `Review →` modal (§4.4) |
| Needs review — re-apply (no-details) | warn | inline `Re-scan`/`Ignore`, no Approve |
| Set aside / Skipped | muted | none |
| Live | accent/live | badge (+ existing-show checkbox if pre-existing re-touch) |
| Ready to publish (pre-CAS checked) | positive/idle | badge (read-only) |
| Held | idle/neutral | badge |
| Ready (pre-finalize) | idle | editable publish checkbox |
| In progress (overlay) | positive (pulse) | none (client-only, transient) |

#### 4.2.2 Checkpoint × row-kind proof matrix (totality)

Proves the algorithm is total and correct at every checkpoint. Columns are the `null`/`in_progress`/`all_batches_complete` checkpoints (`final_cas_done` renders the Dashboard, out of the row surface). Row-kinds are the post-finalize show states.

| Row kind | `null` (pre-finalize) | `in_progress` / `all_batches_complete` (pre-CAS) | after Finish (CAS done) |
|---|---|---|---|
| First-seen, CHECKED (pre-finalize `status='applied'` → finalize stamps `publish_intent=true`) | **Ready** (checkbox checked, from `status='applied'`) — no show yet | **Ready to publish** (show `published=false`, `publish_intent=true`) — rule 5 | **Live** (`published=true`) — rule 4 |
| First-seen, UNCHECKED (pre-finalize `status='staged'` → `publish_intent=false`) | **Ready** (checkbox unchecked, from `status='staged'`) | **Held** (show `published=false`, `publish_intent=false`) — rule 6 | **Held** (stays `published=false`) — rule 6 |
| Existing-show, CHECKED (D-apply shadow) | **Live** (existing-show branch; edits pending) — rule 4 | **Live** (still serving; shadow pending) — rule 4 | **Live** (edits applied) — rule 4 |
| Existing-show, UNCHECKED (D10 no-op) | **Live** (existing-show branch) — rule 4 | **Live** (unchanged) — rule 4 | **Live** (unchanged) — rule 4 |
| Existing-show, ARCHIVED (re-touched this session, `sessionLinked=false`) | **Held** (existing-show branch; `archived=true`, not crew-visible) — rule 6 | **Held** (unchanged) — rule 6 | **Held** (unchanged) — rule 6 |
| Existing-show, HELD by unresolved blocker (not archived, re-touched this session, `sessionLinked=false`) | **Held** (existing-show branch; `published=false`, not crew-visible) — rule 6 | **Held** (unchanged) — rule 6 | **Held** (unchanged) — rule 6 |
| Re-apply blocked (`staged`+failure) | **Needs review — re-apply** — rule 2 | **Needs review — re-apply** — rule 2 | (resolved before Finish) |
| Hard block (`hard_failed`/conflict) | **Needs review — other** — rule 1 | **Needs review — other** — rule 1 | (resolved before Finish) |
| Archived linked show | — | **Held** (`archived=true`) — rule 6 | **Held** — rule 6 |

`publish_intent` never means Live; only `published=true AND archived=false` does. Rule 5 is the one place `publish_intent` shapes display — the pre-CAS "checked, awaiting Finish" state — and it is explicitly distinct from Live.

#### 4.2.1 Blocking rows are NOT one kind (CRITICAL correction, R1)

The standalone staged page and the modal fold serve ONLY the **re-apply / rescan-review** blocking rows — `staged` rows carrying a `lastFinalizeFailureCode` (the rows that today link to the staged page via `Step3SheetCard.tsx:183` / `Step3ReviewModal.tsx:1087`). The other blocking statuses keep their **existing inline controls, untouched** (`Step3Review.tsx:459-504`):

- `hard_failed` + `pendingIngestionId` → `HardFailedActions` (Retry / Defer / Ignore).
- `discard_retryable` → `ManifestIgnoreAction` (Permanently ignore; legacy).
- `live_row_conflict` → `ManifestIgnoreAction` + `DashboardResolveLink` + `HelpAffordance`.

These already render their resolution inline on the Step-3 row (never on the deleted page) and carry no blind-approve risk (no "approve" action — explicit Retry/Defer/Ignore/Resolve). They are **out of scope** for the modal fold; the consolidation must not disturb them.

**Guard — every re-apply "Needs review" row with a well-formed `parseResult` MUST render the `Review →` control.** These are the only rows with a blind-approve risk; approval happens only after the modal shows what changed (§4.4). Load-bearing rule. (The sole exception is a null/corrupt-`parseResult` re-apply row, which cannot open the parse-dependent modal — it renders the inline no-details `Re-scan`/`Ignore` recovery with **no Approve**, §4.4 guard. That row also carries no blind-approve risk, since Approve is absent.)

`In progress` is **not** a persisted re-entry state. At a static server render no batch is executing in that request; rows are settled. It appears only as the optimistic client treatment while the footer's publish/resume loop runs. An interrupted session (`in_progress` checkpoint at load) surfaces a **Resume** affordance in the footer, not a per-row "in progress".

### 4.3 Unified per-session disposition read

Extend the existing row build (`OnboardingWizard.tsx:357`, its Supabase reads at `:238/:259/:281`) so it produces `Step3Row[]` for a session in **any** finalize state, adding the published/Held distinction:

- Inputs: `onboarding_scan_manifest` (`status`, `publish_intent`, `created_show_id`, `wizard_session_id`), `pending_syncs` (`parse_result`, `last_finalize_failure_code`, `staged_id`, and — new — `triggered_review_items`; the current select at `OnboardingWizard.tsx:259-260` omits `triggered_review_items` and must add it), and — new — `public.shows` for the `published`, `archived`, + `wizard_created_session_id` flags (Live/Held; crew visibility requires `published = true AND archived = false` — `resolveShowPageAccess.ts:190,196` returns `archived` at higher precedence than `unpublished`, and the crew-read RLS repair gates on both, `20260602000001_b2_r5_archived_crew_read_lockdown.sql:17`; `published` gate also at `lib/onboarding/sessionLifecycle.ts:595,867` — SQL predicates; the `:582-585`/`:854-856` lines are the explanatory comments).
- **Live/Held session-provenance join (HIGH, R2) — MUST match the canonical `created_show_id` consumer join; never trust `created_show_id` bare and NEVER fall back to a broad `drive_file_id` match for a SESSION-CREATED show** (a forged/stale manifest pointer or a same-drive session-created Held show would misclassify Live/Held and wrongly suppress the checkbox/review affordance). Use ALL of (per `finalize-cas/route.ts:494-503,549` and migration `20260611000000:3-7`):
  ```
  m.created_show_id = s.id
  AND m.drive_file_id = s.drive_file_id
  AND s.wizard_created_session_id = m.wizard_session_id
  ```
  A row is **Live** iff a `shows` row satisfies all three AND `s.published = true AND s.archived = false`; **Held** iff all three AND NOT Live (`s.published = false`, OR `s.archived = true` — an archived show is not crew-visible, so it renders neutral/Held, never Live; R6).
- **Existing-show Live branch (HIGH, R5/R7) — the ONLY safe way to render an already-existing Live show re-touched this session.** Existing-show finalize paths deliberately do NOT write `created_show_id`: the CHECKED existing-show apply stages a shadow + stamps `publish_intent` only (`finalize/route.ts:1057-1064`), and the UNCHECKED D10 no-op leaves `created_show_id` NULL by design (`:1077-1102`). So the session-provenance join above cannot match them, and without this branch an already-Live sheet would fall through to Ready/Needs-review — contradicting §4.2/§6. A row is **Live** via this branch iff `m.created_show_id IS NULL` AND a `shows` row satisfies:
  ```
  s.drive_file_id = m.drive_file_id
  AND s.published = true
  AND s.archived = false
  AND s.wizard_created_session_id IS DISTINCT FROM m.wizard_session_id
  ```
  **The discriminator is "not created by THIS session," NOT "null provenance" (HIGH, R7).** A first-seen onboarding create permanently stamps `shows.wizard_created_session_id` (`applyStagedCore.ts:426-429`, migration `20260611000000:9-17`), so a show created by a *prior* onboarding session and re-touched by this session carries the OLD session id, not NULL. `IS DISTINCT FROM m.wizard_session_id` matches BOTH an external production show (null provenance) AND a prior-session show (old id), while excluding this session's own show (which anyway has `created_show_id` SET → handled by the session-provenance join). This is NOT the broad drive-match R2 forbade: R2's danger was (a) a forged `created_show_id` pointer or (b) a same-drive *session-created* (Held) show being called Live — both are in the non-null `created_show_id` path (the session join), and this branch is gated on `m.created_show_id IS NULL` so neither can enter it; the `published = true` requirement additionally excludes any Held (draft) show. A published, non-archived show keyed to this exact `drive_file_id` and not created by this session genuinely IS the Live show for that sheet. The existing-show checkbox (apply-edits intent) still renders alongside the Live badge (§4.2).
- A manifest row with `created_show_id IS NULL` AND no matching crew-visible other-session show is never Live/Held — it falls to Ready/Needs-review from its manifest status. (A pre-existing *draft* or *archived* show — `published = false`, or `archived = true` — fails the existing-show Live branch and, having no session-provenance link, is not Held either, so it falls to Ready.)
- Live/Held per §4.2: linked show + `published`/`archived`. Ready/Needs-review per the manifest status + blocking predicate (`_unresolvedSheets.ts:141`).
- Reuses the blocking predicate; `_unresolvedSheets.ts`'s predicate + `readUnresolvedSheets` fold into this read (the file is deleted; §11).
- Fail-closed: an infra error on any read returns `{ kind:"infra_error" }` (invariant 9, matching the existing `Step3FetchResult` union `OnboardingWizard.tsx:206`) and the surface shows a soft degraded note, never a blank 500 and never a falsely-empty list.
- **Infra error MUST NOT strand checkpoint recovery (HIGH, R8).** The unified read now joins more tables (`pending_syncs` + `public.shows`), so a transient `shows`/join failure is more likely than the old manifest-only read. The **checkpoint footer actions — Resume / Finish / `CleanupAbandonedFinalizeButton` — derive from `checkpointStatus` (the separate checkpoint read at `app/admin/page.tsx:157`), NOT from the row read**, and MUST remain rendered when the row read returns `{kind:"infra_error"}`. On a rows infra error at a non-null checkpoint, render the degraded row note **inside** the unified surface while STILL showing the checkpoint footer (so Doug can Resume/Finish/Cleanup) — mirroring today's behavior where an unresolved-sheet read failure still renders `FinalizeInProgress` with its Resume + Cleanup controls. Only the pre-finalize (`checkpoint null`) surface, which has no checkpoint footer, degrades to the note alone.

**Guard — empty rows.** A session with zero manifest rows (Start-Over rotated, 0-sheet scan) renders the existing empty Step-3 (no footer, `Step3ReviewWithFinalize.tsx:95` already gates `rows.length > 0`).

### 4.3.1 Row + modal data contract (HIGH, R1)

The folded modal's `Approve & apply` calls the surviving wizard apply route, which requires `{ stagedId, reviewerChoicesVersion: 1, reviewerChoices }` (`app/api/admin/onboarding/staged/[…]/apply/route.ts:143-159`). The current `Step3Row` and `SectionData` (`step3ReviewSections.tsx:2017-2025`) do NOT carry the needed fields. Extend the contract:

- **`Step3Row`** gains (all optional, coerced in `fetchStep3Data`): `stagedId?: string` (already selected at `OnboardingWizard.tsx:259/:326`, just thread it onto the row), `triggeredReviewItems?: TriggeredReviewItem[]` (add to the select + coerce via `parseTriggeredReviewItems`), `reviewItemsCorrupt?: boolean`.
  - **Guaranteed discard exit is intrinsic — no per-row variant computation needed (HIGH R10 / corrected R11).** The **wizard-scope** discard path accepts `permanent_ignore` for EVERY re-apply row — first-seen AND existing-show — writing a wizard deferral + marking the manifest (`discardStaged.ts:441-460`, test `tests/sync/discardStaged.test.ts:344-348`). The `INVALID_REVIEWER_ACTION` rejection that limits existing-show rows to `try_again` is the **live-scope** path only (`show && variant !== "try_again"`, `discardStaged.ts:504-507`), NOT the wizard scope these rows use. So `Ignore this sheet` → `permanent_ignore` is **always valid** here, and the discard route needs **no parsed review items** — a corrupt or null-`parseResult` row can still Ignore. Therefore the guaranteed exit holds without threading any `allowedDiscardVariants`; `StagedReviewCard.tsx:36-40`'s first-seen-only exposure is a UI/product policy of the old card, not a route constraint, and the folded modal simply always offers `Ignore this sheet` (§4.4).
  - **`reviewItemsCorrupt` MUST mirror the staged page's TWO-LEVEL guard (HIGH, R6), not array-parse alone.** The staged page treats items as valid ONLY when `parsedReviewItems.ok AND parsedReviewItems.items.every(isStructurallyValidReviewItem)` (`staged/[…]/page.tsx:222-226`); a bare-cast element like `[null]` or a missing-field object parses as an array yet crashes `allowedActionsFor(item)` / `describeItem` on `item.id`/`item.invariant` derefs. So set `reviewItemsCorrupt = true` when the array parse fails **OR** any element fails `isStructurallyValidReviewItem` (`lib/staging/reviewPayloadGuards.ts:69`) — reuse that shared guard verbatim, matching the Apply-path `STAGED_REVIEW_ITEMS_CORRUPT` posture. `triggeredReviewItems` is populated only when BOTH levels pass. The fail-closed flag `StagedReviewCard` already consumes at `:223/:312`.
- **`SectionData`** already carries `row: Step3Row`, so these thread through automatically; the modal reads them from `data.row`.
- **Modal `Approve & apply` payload**: `{ stagedId: data.row.stagedId, reviewerChoicesVersion: 1, reviewerChoices }` where `reviewerChoices` are built from the tier-3 radio picks + the auto-bound single-action items (§4.4). `Ignore this sheet` maps to the `discard` route `kind: "permanent_ignore"` — always valid in wizard scope (§4.3.1; `StagedReviewCard.tsx:443-450`). `Re-scan this sheet` uses the separate `rescan-sheet` route (not the discard route). `defer_until_modified` is no longer surfaced (§4.4).
- **Corrupt guard**: `reviewItemsCorrupt === true` → suppress `Approve & apply`, offer discard, exactly as `StagedReviewCard.tsx:308-312` does today. **Guaranteed discard exit (HIGH R10 / R11):** `Ignore this sheet` (`permanent_ignore`) is always offered and always accepted in wizard scope (above) — the discard route needs no parsed review items — so a corrupt row is never stranded with only `Re-scan`.

### 4.4 Resolution modal (re-apply rows only)

`Review →` on a **re-apply Needs-review row** (§4.2.1: `staged` + `lastFinalizeFailureCode`) opens `Step3ReviewModal` for that show. (Other blocking statuses keep their inline controls — §4.2.1 — and never reach this modal.) The modal's footer swaps "Publish this show" for the **resolution actions**, and the body renders **what changed**, tiered:

**Guard — null/corrupt `parseResult` (HIGH, R7).** `Step3ReviewModal`/`SectionData` REQUIRE a well-formed `parseResult` (`SectionData.pr`, `Step3ReviewModal.tsx:149-162`, `step3ReviewSections.tsx:2017-2029`); the current `Step3SheetCard` refuses to render details when `!pr || typeof pr !== "object" || !pr.show` and falls back to an inline "We couldn't read the details of this sheet" recovery (`Step3SheetCard.tsx:292-315`). Deleting the staged page must NOT strand these rows. So a re-apply row whose `parseResult` is null/corrupt does **NOT** open the parse-dependent modal and does **NOT** link the deleted page: it renders an **inline no-details recovery** on the Step-3 row — the same message + **`Re-scan this sheet`** (`RescanSheetButton`, primary recovery) and the guaranteed **`Ignore this sheet`** discard (`permanent_ignore`, always valid in wizard scope with no parsed items, §4.3.1 — so this null-parse row still has a valid durable exit), with **no Approve** (nothing parsed to approve). The `RescanReviewBanner`'s old reapply-page link (`Step3SheetCard.tsx:311-312`) is replaced by the inline `Re-scan`/`Ignore` pair. Only a re-apply row with a well-formed `parseResult` gets the `Review →` modal affordance. (Distinct from `reviewItemsCorrupt`, §4.3.1: that is a parsed-`parseResult` row whose *review-items jsonb* is bad — modal opens, Approve suppressed. Null-`parseResult` is the stronger case — no modal at all.)

**Tiering RULE (not an enumeration — HIGH, R3).** The tier is derived mechanically per item so every current AND future `TriggeredReviewItem` variant is covered (`lib/parser/types.ts:435-490`; `describeItem` already renders all, `StagedReviewCard.tsx:131-187`):

- `allowedActionsFor(item).length >= 2` → **Tier 3** (identity conflict, radio group). Today exactly `MI-12` (`["rename","reject"]`) and `MI-13`/`MI-14` (`["rename","independent"]`) — `StagedReviewCard.tsx:115-122`.
- `allowedActionsFor(item).length === 1` AND invariant ∈ `{ONBOARDING_SCAN_REVIEW, FIRST_SEEN_REVIEW}` → **Tier 1** (pure context): one-line reason in the modal **header subline**; no card, no radio.
- `allowedActionsFor(item).length === 1`, all other invariants → **Tier 2** (single-action diagnostic): render the `describeItem` line **anchored to its section**; no radio; the footer button is the action. This explicitly includes `MI-6/7/7b/8/8b/8c/9/10/11`, the orphan variants `MI-13-orphan-remove/add` + `MI-14-orphan-remove/add`, `DIAGRAMS_*`, and `REEL_DRIFT` (all fall to the default `["apply"]` — `StagedReviewCard.tsx:115,122`).

The test asserts the rule over the full `TriggeredReviewItem` union (a new invariant must land in exactly one tier), not a hardcoded list.
- **Tier 3 — identity conflicts** (`MI-12/13/14`): full item card with the forced-unset radio group (`allowedActionsFor` ≥ 2 options).

**Single-action-no-radio rule.** When `allowedActionsFor(item).length === 1`, render no radio; the footer `Approve & apply` **is** the explicit act. The submit path binds the sole action to the button (so the "choice required per item" guard — the current skip-when-unset logic — still receives a choice). Radios render only when `length ≥ 2`.

**Footer actions (redesigned copy + reduced set).** Three immediate, unambiguous actions, each named by object + effect. **Copy-routing scope note (LOW, R6):** invariant 5 (`lib/messages/lookup.ts`) governs **error/failure codes** (§12.4 catalog copy) rendered in the UI — NOT ordinary static action labels. These three button labels are plain UI copy authored inline (and `Re-scan this sheet` is `RescanSheetButton`'s existing hardcoded label at `:166`, reused verbatim). Any **failure code** surfaced inside the modal (apply/rescan/discard error) still routes through `lookup.ts`/`messageFor` (§9 invariant 5). No new §12.4 code is added.

- **`Approve & apply`** (primary) — resolve now; disabled until every tier-3 item is chosen ("N of M chosen"). Calls the surviving wizard `apply` route (§4.3.1 payload).
- **`Re-scan this sheet`** (secondary) — **reuse `components/admin/RescanSheetButton.tsx` verbatim** (label "Re-scan this sheet" / pending "Re-scanning…", `:166`; `POST /api/admin/onboarding/rescan-sheet {driveFileId, wizardSessionId}`, with its result overlay). Immediate re-fetch + re-parse (the Thread-3 rescan): clean → the row clears / becomes Ready; dirty → the modal refreshes with new review items. Replaces the old "Retry on next sync" (`try_again_next_sync`) — same intent, immediate feedback, existing component.
- **`Ignore this sheet`** (secondary, **always present** — the guaranteed discard exit, R10/R11) — the wizard staged `discard` route with `kind: "permanent_ignore"`. Wizard scope accepts `permanent_ignore` for EVERY re-apply row (first-seen and existing-show; `discardStaged.ts:441-460`) and needs no parsed review items, so this exit is always valid — including for corrupt / null-`parseResult` rows. **Semantics (HIGH, R3):** `permanent_ignore` writes a **session-scoped** `deferred_ingestions` row (`wizard_session_id = <session>`, `discardStaged.ts:295-325`), cleared when finalize completes (`finalize-cas/route.ts:633-639`); it does **NOT** appear in the dashboard **Ignored sheets** list (`wizard_session_id IS NULL`, `loadIgnoredSheets.ts:59`), so the spec makes **no** "restore via unignore" promise. Copy: **"Ignore this sheet"** + subline **"Removed from this setup."** (object-named, honest). Purpose: let Doug clear an unresolvable/corrupt sheet so finalize proceeds. **Out of scope:** a durable, dashboard-visible ignore for `staged`+failure rows would require a new null-session ignore path — deliberately deferred to honor the "no mutation-API change" non-goal (§2).

**Dropped: `defer_until_modified` ("Wait for next edit").** The backend `kind` stays (route unchanged), but no button renders it. Rationale: its only effect (auto-resurface on next sheet edit, `discardStaged.ts:447`) is already achieved by editing the sheet (sync re-stages on modtime bump) or by `Re-scan this sheet`, and `permanent_ignore` also clears on a manual re-sync (`runManualSyncForShow.ts:473`). It added a confusing third deferral with no distinct value.

**Footer is a fixed set (R2 + R11 correction).** All three footer actions — `Approve & apply`, `Re-scan this sheet`, `Ignore this sheet` — render on every well-formed re-apply modal (Approve suppressed only when `reviewItemsCorrupt`). `Ignore this sheet` = `permanent_ignore`, valid on every wizard re-apply row (§4.3.1). The old card's first-seen-only ignore exposure (`StagedReviewCard.tsx:36-40`) was a live-scope/UI policy, not a wizard-route constraint — the folded modal does not replicate it.

**Guard — DIRTY with empty/corrupt items.** DIRTY implies ≥ 1 invariant, but defensively (`sentinelItems ?? []`, or `reviewItemsCorrupt`): render the generic "changed, re-review" header + open the modal so Doug can eyeball the sections; suppress `Approve` for the corrupt case (existing `reviewItemsCorrupt` fail-closed behavior preserved).

After a successful `Approve & apply`, the modal footer returns to the ordinary "Publish this show" / closes; the row's status refreshes (Live/Held/Ready) via the standard router refresh — the same transition the modal already performs through `NotPublishableNote`.

**Guard — freeze the ENTIRE row list during an active publish run (HIGH R1 + MEDIUM R3 + HIGH R8).** While the footer's publish/resume loop is running (`run.isRunning`, `Step3ReviewWithFinalize.tsx:113`), **every mutating control on every Step-3 row is disabled** — not just the modal. The active finalize loop re-POSTs `/finalize` on every `batch_complete` (`FinalizeButton.tsx`) and reselects finishable-clean rows each batch (`finalize/route.ts`), so ANY concurrent row mutation races it. The full freeze list (HIGH R8 — the prior spec only froze the modal, leaving three live race surfaces):
  - **Publish checkbox** (`PublishCheckbox`, `Step3SheetCard.tsx:501-505`) — today has NO disabled prop; toggling it mid-run POSTs approve/unapprove (mutating manifest `status`) under the loop. Gate on `isPublishRunActive`. (This checkbox only renders pre-finalize per rule 7, but a run can start from that surface — so still gate it.)
  - **Row-level `Re-scan this sheet`** (`RescanSheetButton`, `Step3SheetCard.tsx` + `:314`) — only self-disables on its own pending (`RescanSheetButton.tsx:157-166`); gate on `isPublishRunActive` too.
  - **Inline blocking-row controls** (`HardFailedActions` / `ManifestIgnoreAction` / `DashboardResolveLink`, §4.2.1, `Step3Review.tsx:459-504`) — gate on `isPublishRunActive`.
  - **`Review →`** trigger AND **every modal mutator** — `Approve & apply`, `Re-scan this sheet`, `Ignore this sheet` (apply / rescan-sheet / discard routes).
  Disabling ALL row mutators during a run serializes: Doug resolves/edits before publishing or after a run settles, never concurrently. (A blocked row is inherently a "this run is stuck" state, so freezing it during a run is also correct UX.) Tested: with `isPublishRunActive` true, EACH of — publish checkbox, row Re-scan, inline hard-fail/conflict actions, row `Review →`, and an open modal's Approve / Re-scan / Ignore — is disabled.

**Prop path (R2 LOW + R3 MEDIUM + R8).** `run.isRunning` currently lives inside `Step3ReviewWithFinalize` (`:83-113`), while the rows + modal controls live under `Step3Review` / `Step3SheetCard` / `Step3ReviewModal`. The plan threads an `isPublishRunActive: boolean` prop from `Step3ReviewWithFinalize` → `Step3Review` (row list) → **each `Step3SheetCard`** (disables its `PublishCheckbox` + row `RescanSheetButton` + inline blocking controls) and → the `Review →` trigger → `Step3ReviewModal` → the footer's `Approve & apply` / `RescanSheetButton` / `Ignore`. So EVERY row mutator and every mutating control of an already-open modal disable while a run is active. Tests prove each control (checkbox, row Re-scan, inline actions, row `Review →`, open-modal Approve/Re-scan/Ignore) is disabled mid-run.

### 4.5 Footer / primary action by checkpoint state

`Step3ReviewWithFinalize` gains a `checkpointStatus` input and selects the primary footer action:

- `null` → `FinalizeTrigger` (Publish N shows & finish) — unchanged.
- `in_progress` → **Resume** (drives the existing resume batch loop; `ResumeFinalizeButton` logic folded into the run). `ResumeFinalizeButton.tsx` is mounted ONLY by `FinalizeInProgress.tsx:100` (deleted §4.6), so the standalone component is deleted; its `re_apply_url` failure renderer (`ResumeFinalizeButton.tsx:143-149`) is subsumed by the footer run, whose surfaced re-apply rows resolve via the modal / redirect exactly like the race-row (§4.6).
- `all_batches_complete` → **Finish** (final CAS; `RunFinalCASButton` logic folded in). A **stale** checkpoint adds a footer note (replacing `StaleReadyToPublish`'s standalone discard/publish framing) — discard remains reachable.

**Endpoint contract by mode (HIGH, R7) — the three modes call DIFFERENT endpoints; folding must preserve the boundaries.** The combined `useFinalizeRun` today drives the `/finalize` batch loop and then, on `all_batches_complete`, *auto-posts* `/finalize-cas` in the SAME run (`FinalizeButton.tsx:344-362`). The old `ResumeFinalizeButton` instead posts ONLY `/finalize` and refreshes (`ResumeFinalizeButton.tsx:82-105`) — Resume must **stop before CAS** so the checkpoint settles at `all_batches_complete` and the operator gets the deliberate Finish step (never a silent auto-publish). So `useFinalizeRun` gains a **mode** (`"publish" | "resume" | "finish"`) selecting the endpoint sequence:
  - **`publish`** (checkpoint `null`): `/finalize` loop → then `/finalize-cas`. Unchanged (one continuous run).
  - **`resume`** (checkpoint `in_progress`): `/finalize` loop ONLY; **halt at `all_batches_complete` WITHOUT calling `/finalize-cas`** → `router.refresh()`, re-rendering the footer in Finish mode.
  - **`finish`** (checkpoint `all_batches_complete`): `/finalize-cas` ONLY; no `/finalize` loop.
  This mode boundary is load-bearing: a Resume that auto-CASes would publish held/unchecked intent before the operator confirms Finish.

**Abandoned-finalize cleanup MUST be re-homed (HIGH, R4).** `FinalizeInProgress.tsx:171` and `StaleReadyToPublish.tsx:77` both render `CleanupAbandonedFinalizeButton` — the recovery path for a stuck/stale session (the finalize-resume-deadlock recovery). Deleting those interstitials must NOT drop it. The unified Step-3 footer renders `CleanupAbandonedFinalizeButton` (unchanged component) as a secondary control whenever the checkpoint is `in_progress` OR a **stale** `all_batches_complete` — the exact two states that expose it today. A test asserts the cleanup control is present in both states on the unified surface.

The disabled gate stays keyed on `finishable` (blocking rows block finish), unchanged (`Step3ReviewWithFinalize.tsx:79-88`).

### 4.6 Deletions + redirect

- Delete `FinalizeInProgress.tsx`, `ReadyToPublish.tsx`, `StaleReadyToPublish.tsx`, `ResumeFinalizeButton.tsx` (logic folded into the footer Resume run, §4.5), the staged `page.tsx`, and (folded) `_unresolvedSheets.ts`.
- Remove the **four** in-app renderers of a staged-page / `re_apply_url` link (HIGH R4/R5): the two direct staged-page links `Step3ReviewModal.tsx:1087` and `Step3SheetCard.tsx:183`; the finalize **race-row** terminal-state link `FinalizeButton.tsx:513-539` (`<Link href={failure.re_apply_url}>`, server-built at `finalize/route.ts:258-260`); AND the **resume** failure link `ResumeFinalizeButton.tsx:143-149` (same `re_apply_url` field). The modal now resolves re-apply rows in place; the race-row and resume links are subsumed by the folded footer run. Minimum: the `re_apply_url` (unchanged server field) is caught by the redirect (§below) so it lands on the unified Step-3 — a test asserts a race-row `re_apply_url` resolves to `/admin` (the unified surface post-fold). Deep-linking a specific row directly to its modal is a nice-to-have, out of scope.
- Add a `next.config.ts` redirect: `/admin/onboarding/staged/:wizardSessionId/:driveFileId → /admin` (307, reversible; Step-3 is the session's home and the row is surfaced there). Keeps bookmarks/alert links landing sane.
- Remove the staged **page** entry from `lib/audit/trustDomains.ts:60-62`; keep the API-route entries (core `:154-170`, staged-diagram/cleanup `:110-126`).

## 5. Guard conditions (per input)

| Input | null / empty / degraded | Render |
|---|---|---|
| session rows | `[]` | empty Step-3, no footer |
| any read | infra error | soft degraded note, discriminated `{kind:"infra_error"}`, never blank 500 |
| `Step3Row.parseResult` | null (non-staged) | no card body; badge only |
| `lastFinalizeFailureCode` | null on a staged row | **Ready** (not blocking) |
| `triggeredReviewItems` | empty on DIRTY | generic header + modal opens; corrupt → suppress Approve |
| published `shows` read | drive_file_id absent | not Live/Held → falls to Ready/Needs-review from manifest |
| checkpoint | `final_cas_done` + non-null session | Dashboard (unchanged defensive branch) |

## 6. Mode boundaries

The unified Step-3 has these modes; each row + footer element belongs to exactly one:

- **Pre-finalize** (`checkpoint null`): rows Ready (checkbox) / Needs-review; footer = Publish trigger. Normally no Live/Held rows, BUT a manifest row for an already-existing Live show (a §7.4 D10 no-op re-touch, `finalize/route.ts:846`) legitimately renders **Live** — the **existing-show branch** (§4.3: `m.created_show_id IS NULL` + `drive_file_id` match + `published=true, archived=false` + `wizard_created_session_id IS DISTINCT FROM m.wizard_session_id`) handles it, NOT the session-provenance join (which cannot match — existing-show paths never write `created_show_id`). So "no Live/Held pre-finalize" is the common case, not an invariant.
- **Mid-finalize** (`in_progress`): rows Live / **Ready-to-publish** (pre-CAS checked, rule 5) / Held (unchecked) + Needs-review + Ready(remaining un-run rows); footer = Resume. Transient In-progress overlay during an active run. The pre-finalize editable checkbox is gone here (finalize consumed intent).
- **Batches-complete** (`all_batches_complete`): rows Live / **Ready-to-publish** (checked, will go Live on Finish) / Held (unchecked) + any Needs-review; footer = Finish (CAS), stale note if stale.
- **Modal** (any mode, Needs-review row): resolution UI; independent of the page mode.

Shared across all page modes: the row list component, the per-row status badge, the `Review →` control on Needs-review rows, the section-nav modal.

## 7. Transition inventory

Page-level state transitions and their treatment:

| From → To | Trigger | Treatment |
|---|---|---|
| Ready → In progress → Live/Held | Publish/Finish run | client optimistic pulse → settle on NDJSON per-row done; row badge crossfades |
| Needs-review → (modal open) | `Review →` | modal mount (existing dialog enter transition) |
| (modal) → Ready/Live/Held | Approve & apply success | modal close + router refresh; row badge updates instant |
| (modal) → Needs-review / removed | Re-scan / Ignore | Re-scan: modal refreshes (dirty) or row clears (clean). Ignore: row leaves the setup list (session-scoped). |
| pre-finalize → mid-finalize | Publish started, page reload/interruption | server re-render into `in_progress` mode; Resume footer |
| mid-finalize → batches-complete | last batch done | footer swaps Resume → Finish |
| Any modal mutation while a publish run is active | compound | **ALL modal mutators disabled during an active run** (§4.4 guard, `run.isRunning`): `Review →`, `Approve & apply`, `Re-scan this sheet`, `Ignore this sheet`. No apply/rescan/discard can race a row into the server's per-batch finishable reselection (`finalize/route.ts`). Serialized by construction; a test asserts all four are disabled while `run.isRunning`. |

## 8. Dimensional invariants

The unified surface reuses existing layout components (`WizardFooter`, `Step3Review` grid, `Step3ReviewModal`); no new fixed-dimension parent is introduced. The footer center already reserves `min-h-12` to avoid idle→tracking jolt (`Step3ReviewWithFinalize.tsx:131`). **No new dimensional invariants**; the plan's layout task re-verifies the footer + modal render at the existing breakpoints with a real-browser assertion (jsdom insufficient) since row-status badges are added to the grid.

## 9. Invariants honored (AGENTS.md)

1. **TDD per task** — every task failing-test-first.
2. **Advisory lock** — N/A directly. Resolution rides the existing `apply`/`discard`/finalize routes, which already hold the per-show lock at their established layer. **No new lock holder**; the advisory-lock topology test (`tests/auth/advisoryLockRpcDeadlock.test.ts` / `_advisoryLockSingleHolderContract.test.ts`) is unchanged. Declared explicitly per the writing-plans advisory-lock rule: this plan does NOT add a `pg_advisory*` call site.
3. **Email canonicalization** — untouched.
4. **No global sync cursor** — untouched.
5. **No raw error codes in UI** — every failure code rendered via `lib/messages/lookup.ts` (the modal + row already do; the folded resolution keeps `messageFor`/`ErrorExplainer`).
6. **Commit per task** — conventional commits.
7. **Spec canonical** — this spec + ratified amendments.
8. **UI quality gate** — this is UI-heavy (files under `app/` non-api + `components/`). `/impeccable critique` AND `/impeccable audit` run on the diff before cross-model review; HIGH/CRITICAL fixed or `DEFERRED.md`.
9. **Supabase call-boundary discipline** — the new unified read destructures `{ data, error }`, distinguishes returned vs thrown, surfaces `{kind:"infra_error"}`. Registered in the relevant infra-contract meta-test (`tests/admin/_metaInfraContract.test.ts`) — see §10.
10. **Mutation surface observability** — **no new mutation surface** is created (the resolution reuses existing registered routes; the unified read is read-only). The read core must not import `lib/log` if it lives under an observe-guarded tree; otherwise it's a plain admin read. No `AUDITABLE_MUTATIONS` change expected. Declared: this plan adds no mutating route/action.

## 10. Meta-test inventory (declared)

- **CREATES:** none required beyond registry rows.
- **EXTENDS:**
  - `tests/admin/_metaInfraContract.test.ts` — register the new unified per-session disposition read (Supabase call-boundary).
  - `tests/log/_metaMutationSurfaceObservability.test.ts` — **no new surface**; confirm the filesystem walk still passes after deleting the staged page (a deleted route drops from discovery; no registry edit needed unless a route file is removed — none is; only a page).
  - Redirect coverage — a test asserting the old staged URL 307s to `/admin` (mirrors the `next.config.ts` redirect tests for `/admin/observability`).
- **N/A:** advisory-lock topology (no `pg_advisory*` touched, §9.2); `admin_alerts` catalog (no new code); email-normalization (untouched).

## 11. Testing strategy

- **Row-status derivation — total, ordered algorithm** (unit; the §4.2 structural defense): drive the derivation over the full space and assert exactly one state per row, matching the §4.2.2 matrix. Derive expectations from fixtures, not hardcoded. Explicit failure modes / required cases: (a) a `staged`+failure_code row → Needs-review, not Ready (the blind-approve hole); (b) a session-linked `published=true AND archived=true` show → **Held/neutral**, NOT Live (R6 archived precedence); (c) a pre-existing other-session `published=true, archived=false` show for a matching `drive_file_id` → Live via the existing-show branch, same show `archived=true` → Ready; (d) **R8 pre-CAS**: a first-seen session-linked show `published=false, publish_intent=true` → **Ready to publish** (NOT Held), the same show `publish_intent=false` → **Held**, and both flip correctly after CAS (`published=true` → Live); (e) rule-1 precedence: a `hard_failed` row with (defensively) a linked show still renders Needs-review — other, not Live.
- **Corrupt review-items guard** (unit): `triggered_review_items = [null]` and a missing-field element (e.g. `[{id:"x"}]`, no `invariant`) BOTH set `reviewItemsCorrupt=true` and suppress `Approve & apply` — proving the two-level guard (array-parse OR `isStructurallyValidReviewItem`) is wired, not array-parse alone (R6). Failure mode caught: an element-level bad cast crashing `allowedActionsFor`/`describeItem`.
- **Guaranteed discard exit for corrupt rows** (unit, HIGH R10/R11): a corrupt row (empty `triggeredReviewItems`) still renders a valid `Ignore this sheet` → `permanent_ignore` discard (accepted in wizard scope for every row, no parsed items needed) and is NEVER absent. Failure mode caught: a corrupt row stranded with only `Re-scan` (no way to unblock finalize).
- **`Review →` presence** (component): every **re-apply** Needs-review row **with a well-formed `parseResult`** renders the control; a `hard_failed`/`discard_retryable`/`live_row_conflict` row keeps its inline controls and renders NO `Review →` (§4.2.1); a null/corrupt-`parseResult` re-apply row renders inline `Re-scan`/`Ignore`, no `Review →` (§4.4). No Needs-review row exposes an inline approve. Anti-tautology: assert against the row's derived state, and clone-strip sibling controls before scanning.
- **Single-action-no-radio** (component): a 1-action item renders no `role="radio"`; a ≥2-action item (MI-13) renders the radio group forced-unset; `Approve & apply` disabled until chosen.
- **Modal fold** (real-browser): `Review →` opens `Step3ReviewModal`; footer shows resolution actions; body shows tier-2 line anchored to section + tier-3 radios; Approve calls the `apply` endpoint (mocked) and closes.
- **Null/corrupt `parseResult` fallback** (component, HIGH R7): a re-apply row with `parseResult = null` (or `!pr.show`) renders **no `Review →`** and **no Approve** — only the inline no-details message + `Re-scan this sheet` + `Ignore this sheet`, and **no `/admin/onboarding/staged/` link**. Failure mode caught: a corrupt-parse row stranded (no resolution path) after the staged page is deleted.
- **Mode endpoint contract** (unit/integration, HIGH R7): with fetch mocked, **Resume** (`in_progress`) drives `/finalize` to `all_batches_complete` and **never calls `/finalize-cas`** (asserts `/finalize-cas` fetch count === 0, then `router.refresh`); **Finish** (`all_batches_complete`) calls **only `/finalize-cas`** (zero `/finalize` batch POSTs); **Publish** (`null`) calls both in sequence. Failure mode caught: a Resume that auto-CASes and silently publishes before the operator confirms Finish.
- **Unified surface by checkpoint** (integration): `in_progress` / `all_batches_complete` render Step-3 with the right footer action (Resume / Finish), not the deleted interstitials.
- **Full active-run freeze** (component, HIGH R8): with `isPublishRunActive` true, assert EACH row mutator is disabled — the publish checkbox, the row `Re-scan this sheet`, the inline blocking controls (`HardFailedActions`/`ManifestIgnoreAction`), the row `Review →`, AND an open modal's Approve / Re-scan / Ignore. Failure mode caught: a checkbox/row-rescan/inline-action mutating manifest `status`/state under the live `/finalize` loop.
- **Infra error preserves checkpoint footer** (integration, HIGH R8): a rows `{kind:"infra_error"}` at `in_progress` / `all_batches_complete` still renders the checkpoint footer (Resume / Finish / `CleanupAbandonedFinalizeButton`, derived from `checkpointStatus`) alongside the degraded row note — never drops recovery. At `checkpoint null`, degrades to the note alone (no footer to preserve).
- **Redirect** (unit): old staged URL → 307 `/admin`.
- **Deletion safety** (grep/structural, HIGH R1 + MEDIUM R2): covers deleted **components, pages, AND helpers**, plus registry rows and URL-shape assertions. **The grep guard is AUTHORITATIVE** (a structural test walking the tree, failing on any surviving import/link of a deleted symbol/route); the list below is the illustrative known breaker set to rewrite/delete, not an exhaustive substitute for the guard:
  - `tests/admin/_metaInfraContract.test.ts:188-190` + `:946-961` (registers `readUnresolvedSheets` / staged reads) — update the registry when `_unresolvedSheets.ts` folds in.
  - `tests/components/wizardStagedPage.heading.test.tsx`, `tests/components/admin/WizardStagedReapplyResolved.test.tsx` — deleted with the page (or repurposed to the modal).
  - `tests/admin/unresolvedSheets.test.ts:72-78` — asserts old reapply URL; delete/rewrite against the unified read.
  - `tests/components/admin/FinalizeReentry.test.tsx`, `FinalizeInProgress.test.tsx`, `AdminPage.test.tsx`, `RunFinalCASButton.test.tsx`, `RescanSheetButton.test.tsx`, `tests/e2e/admin-phase2-surfaces.spec.ts` — rewrite against the unified Step-3 surface or delete with their component.
  - `lib/audit/trustDomains.ts:60-62` — remove the staged-page entry; keep the API entries (core routes `:154-170`, staged-diagram/cleanup `:110-126`).
  - The grep guard asserts: no import of `FinalizeInProgress`/`ReadyToPublish`/`StaleReadyToPublish`/`ResumeFinalizeButton`/the staged `page.tsx`/`_unresolvedSheets` survives; and no in-app `/admin/onboarding/staged/` link literal survives across the FOUR renderers (`Step3ReviewModal.tsx:1087`, `Step3SheetCard.tsx:183`, `FinalizeButton.tsx` race-row, `ResumeFinalizeButton.tsx:143-149`) — the race-row/resume `re_apply_url` are either repointed or provably covered by the redirect test.
  - **NOT deleted:** `CleanupAbandonedFinalizeButton` is re-homed into the unified footer (§4.5), so the guard must NOT flag its surviving import; a test asserts it renders on the unified surface for `in_progress` + stale `all_batches_complete`.
- **Layout** (real-browser Playwright): footer + modal at mobile/desktop breakpoints with row-status badges present; no horizontal overflow; footer center min-height preserved.

## 12. Watchpoints / disagreement-loop preempts

- **Display-state derivation is CLOSED via the §4.2 total ordered algorithm (structural defense, R8).** This surface drew findings R1/R5/R6/R7/R8 (Live/Held join → archived → prior-session → pre-CAS `publish_intent`). Rather than patch cells, §4.2 now specifies ONE ordered, first-match-wins algorithm proven total by the §4.2.2 checkpoint×row matrix, and §11 tests it over the full space. Any new display concern is a change to that one algorithm + matrix, not a new special case. Do NOT re-derive per-cell; audit against the algorithm.
- **`applied` ≠ Live.** Pre-finalize `applied` is publish-intent (checkbox checked), realized as Live only after CAS. Do NOT relitigate as "applied means published." Cited: `OnboardingWizard.tsx:214`, finalize route Held model (`:114,:524`).
- **Held is intentional.** Unchecked-clean rows become `published=false` Held drafts by design (Task B2). Not a bug, not "unpublished failure."
- **In-progress is client-transient.** Finalize is a resumable batch loop; no persisted "publishing now" row exists at a static render. Re-entry = Resume, not a per-row spinner. Cited: `finalize/route.ts` batch loop, `Step3ReviewWithFinalize.tsx:155` tracking.
- **Mutation APIs stay.** Only the *page* is deleted; the `apply/discard/approve/unapprove/staged-diagram` routes and their `trustDomains`/`AUDITABLE_MUTATIONS` entries are unchanged. Do NOT flag "deleted mutation surface."
- **No advisory-lock change.** Resolution reuses existing lock-holding routes; single-holder topology untouched.
- **Redirect is intentional 307**, not a 410 — bookmarks/alert deep-links must land on the session's review page.
- **Tier-1 rarely surfaces.** A clean never-failed show is Ready (Publish = consent), not Needs-review. Tier-1 copy appears only in a re-apply context; the modal is still the resolution home when it does.
- **Three distinct intent/state signals — do NOT conflate (R1/R9).** (1) Pre-finalize **checkbox** = manifest `status` (`applied`=checked / `staged`=unchecked; approve/unapprove write only `status`, `approve/route.ts:180`, `unapprove/route.ts:104`). (2) **`publish_intent`** = the realized checked intent, stamped by finalize (`finalize/route.ts:527-529`), default `false` — it drives the pre-CAS Ready-to-publish state (rule 5) and which shows CAS flips (`finalize-cas/route.ts:517-526`). (3) **`shows.published` + `archived`** = crew-visible Live. Do NOT derive the pre-finalize checkbox from `publish_intent`, and do NOT derive Live/Held from `publish_intent`. Cited: migrations `20260623000001`, `20260611000000`; finalize `:114,:524,:527`.
- **Not all blocking rows are re-apply rows (R1).** Only `staged`+`lastFinalizeFailureCode` rows route to the modal. `hard_failed`/`live_row_conflict`/`discard_retryable` keep their existing inline controls (`Step3Review.tsx:459-504`) and are out of scope. Do NOT route them to the modal or delete their controls.
- **Resolution disabled during an active publish run (R1/R3).** ALL modal mutators (Approve/Re-scan/Ignore) + row `Review →` disabled while `isPublishRunActive`. Intentional serialization.
- **Wizard Ignore is session-scoped (R3).** `permanent_ignore` in the wizard writes a session-scoped `deferred_ingestions` row (`discardStaged.ts:295`), NOT the durable dashboard Ignored-sheets list (`wizard_session_id IS NULL`, `loadIgnoredSheets.ts:59`). Copy makes no unignore/dashboard promise. A durable ignore for `staged`+failure rows is out of scope (would need a new null-session path). Do NOT relitigate the missing dashboard entry as a bug.
- **Tiers derived by rule, not list (R3).** `allowedActionsFor().length` decides tier (≥2 → tier-3 radio; 1 → tier-1 pure-context or tier-2 diagnostic). Every current + future invariant is covered, incl. orphans / MI-7b/8b/8c/10. Do NOT flag "missing invariant X" — the rule covers the union.

## 13. Rollout / sequencing (for the plan)

Decomposable into safe phases:

**Ordering constraint (HIGH, R2):** the staged `page.tsx` and its link-outs must NOT be deleted/redirected until the modal resolution AND the checkpoint-state Step-3 render both exist — otherwise, during the window, an `in_progress` session still renders `FinalizeInProgress` whose re-apply links would redirect to `/admin` (still the interstitial), stranding resolution. So the surface fold precedes the delete, and the delete+redirect is atomic with the re-entry fold.

1. **Data contract + unified read** — extend `Step3Row` (`stagedId`, `triggeredReviewItems`, `reviewItemsCorrupt`; §4.3.1) + the provenance-joined `shows` read for Live/Held (§4.3); display-state derivation + badges behind the existing pre-finalize surface (no behavior change yet).
2. **Modal resolution behavior** — fold `StagedReviewCard` resolution into `Step3ReviewModal` (tiers, single-action-no-radio, corrupt guard, active-run disable §4.4); thread `isPublishRunActive`; wire `Approve & apply`/`Re-scan this sheet`/`Ignore this sheet` to the existing apply/rescan-sheet/discard routes. Both the standalone page and the modal work during this phase (dual-path, safe).
3. **Interstitial + checkpoint fold** — render the unified Step-3 for `in_progress` + `all_batches_complete`; fold Resume/Finish (CAS) into the footer with the stale note; delete `FinalizeInProgress` / `ReadyToPublish` / `StaleReadyToPublish`. After this, `/admin` renders Step-3 (with the modal) for every non-terminal checkpoint — so `/admin` is now a valid redirect target for a re-apply row.
4. **Redirect + staged-page delete** — only now delete the standalone staged `page.tsx`, add the `next.config.ts` redirect (→ `/admin`, which is the unified surface post-phase-3), remove the two link-outs, drop the `trustDomains` page entry. Atomic with phase 3's guarantee.
5. **Registry + test cleanup** — fold `_unresolvedSheets` into the unified read; update `_metaInfraContract` registry rows; delete/rewrite the affected tests (§11); add the redirect + deletion-safety guards.
6. **Impeccable dual-gate + cross-model review + CI.**
