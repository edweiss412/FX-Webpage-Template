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

- `next.config.ts:46-75` `async redirects()` array (307 default, e.g. `/admin/observability → /admin/dev/telemetry`). The old staged URL redirect is added here.
- `lib/audit/trustDomains.ts:60-62` registers the staged page path; `:110-126` register the surviving API routes. The page entry is removed on delete; API entries stay.

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

Each show row shows exactly one status. **Live/Held derive from the row's LINKED show, not from `Step3Row.status` alone** (CRITICAL correction, R1): finalize creates a show for every clean row at `published = false` and the final CAS flips only `publish_intent = true` shows to Live (`onboarding_scan_manifest.publish_intent`, migration `20260623000001_onboarding_publish_intent.sql:10`; `created_show_id` links the row to its show, migration `20260611000000_onboarding_manifest_created_show_id.sql:15`; finalize route `:114,:524`). So `published` is the Live/Held signal and `publish_intent` is the *pre-finalize checkbox intent*, a distinct thing.

| Display state | Derivation | Tone | Row affordance |
|---|---|---|---|
| **Live** | provenance-joined show (§4.3) AND `shows.published = true` | accent/live | badge only |
| **Held** | provenance-joined show (§4.3) AND `shows.published = false` (draft) | idle/neutral | badge; existing per-row publish semantics preserved |
| **Ready** | no linked show yet, clean (`staged`/`applied`), not blocking | idle | publish checkbox (unchanged pre-finalize); `publish_intent` seeds checked/unchecked |
| **Needs review — re-apply** | blocking via `staged` + `lastFinalizeFailureCode != null` (RESCAN_REVIEW_REQUIRED / demoted-wedge) | warn | **`Review →`** → modal (§4.4). No inline approve. |
| **Needs review — other** | `hard_failed` / `live_row_conflict` / `discard_retryable` | warn | **existing inline controls, unchanged** (§4.2.1) |
| **In progress** | transient, during an active publish run only | positive (pulse) | none (client-only) |

This derivation is checkpoint-agnostic — the presence of a linked published/held show is the signal, so pre-finalize (no linked shows, except an already-existing Live show re-touched by a §7.4 D10 no-op) and post-finalize both work without special-casing. `publish_intent` never means Live.

#### 4.2.1 Blocking rows are NOT one kind (CRITICAL correction, R1)

The standalone staged page and the modal fold serve ONLY the **re-apply / rescan-review** blocking rows — `staged` rows carrying a `lastFinalizeFailureCode` (the rows that today link to the staged page via `Step3SheetCard.tsx:183` / `Step3ReviewModal.tsx:1087`). The other blocking statuses keep their **existing inline controls, untouched** (`Step3Review.tsx:459-504`):

- `hard_failed` + `pendingIngestionId` → `HardFailedActions` (Retry / Defer / Ignore).
- `discard_retryable` → `ManifestIgnoreAction` (Permanently ignore; legacy).
- `live_row_conflict` → `ManifestIgnoreAction` + `DashboardResolveLink` + `HelpAffordance`.

These already render their resolution inline on the Step-3 row (never on the deleted page) and carry no blind-approve risk (no "approve" action — explicit Retry/Defer/Ignore/Resolve). They are **out of scope** for the modal fold; the consolidation must not disturb them.

**Guard — every re-apply "Needs review" row MUST render the `Review →` control.** These are the only rows with a blind-approve risk; approval happens only after the modal shows what changed (§4.4). Load-bearing rule.

`In progress` is **not** a persisted re-entry state. At a static server render no batch is executing in that request; rows are settled. It appears only as the optimistic client treatment while the footer's publish/resume loop runs. An interrupted session (`in_progress` checkpoint at load) surfaces a **Resume** affordance in the footer, not a per-row "in progress".

### 4.3 Unified per-session disposition read

Extend the existing row build (`OnboardingWizard.tsx:357`, its Supabase reads at `:238/:259/:281`) so it produces `Step3Row[]` for a session in **any** finalize state, adding the published/Held distinction:

- Inputs: `onboarding_scan_manifest` (`status`, `publish_intent`, `created_show_id`, `wizard_session_id`), `pending_syncs` (`parse_result`, `last_finalize_failure_code`, `staged_id`, and — new — `triggered_review_items`; the current select at `OnboardingWizard.tsx:259-260` omits `triggered_review_items` and must add it), and — new — `public.shows` for the `published` flag (Live/Held; `published` gates crew visibility, `sessionLifecycle.ts:583,856`).
- **Live/Held provenance join (HIGH, R2) — MUST match the canonical `created_show_id` consumer join; never trust `created_show_id` bare and NEVER fall back to a broad `drive_file_id` match** (a forged/stale manifest pointer or same-drive pre-existing show would misclassify Live/Held and wrongly suppress the checkbox/review affordance). Use ALL of (per `finalize-cas/route.ts:494-503,549` and migration `20260611000000:3-7`):
  ```
  m.created_show_id = s.id
  AND m.drive_file_id = s.drive_file_id
  AND s.wizard_created_session_id = m.wizard_session_id
  ```
  A row is **Live** iff a `shows` row satisfies all three AND `s.published = true`; **Held** iff all three AND `s.published = false`. A manifest row with `created_show_id IS NULL` (no linked show yet) is never Live/Held — it falls to Ready/Needs-review from its manifest status.
- Live/Held per §4.2: linked show + `published`. Ready/Needs-review per the manifest status + blocking predicate (`_unresolvedSheets.ts:141`).
- Reuses the blocking predicate; `_unresolvedSheets.ts`'s predicate + `readUnresolvedSheets` fold into this read (the file is deleted; §11).
- Fail-closed: an infra error on any read returns `{ kind:"infra_error" }` (invariant 9, matching the existing `Step3FetchResult` union `OnboardingWizard.tsx:206`) and the surface shows a soft degraded note, never a blank 500 and never a falsely-empty list.

**Guard — empty rows.** A session with zero manifest rows (Start-Over rotated, 0-sheet scan) renders the existing empty Step-3 (no footer, `Step3ReviewWithFinalize.tsx:95` already gates `rows.length > 0`).

### 4.3.1 Row + modal data contract (HIGH, R1)

The folded modal's `Approve & apply` calls the surviving wizard apply route, which requires `{ stagedId, reviewerChoicesVersion: 1, reviewerChoices }` (`app/api/admin/onboarding/staged/[…]/apply/route.ts:143-159`). The current `Step3Row` and `SectionData` (`step3ReviewSections.tsx:2017-2025`) do NOT carry the needed fields. Extend the contract:

- **`Step3Row`** gains (all optional, coerced in `fetchStep3Data`): `stagedId?: string` (already selected at `OnboardingWizard.tsx:259/:326`, just thread it onto the row), `triggeredReviewItems?: TriggeredReviewItem[]` (add to the select + coerce via `parseTriggeredReviewItems`), `reviewItemsCorrupt?: boolean` (set when the jsonb fails to parse — the fail-closed flag `StagedReviewCard` already consumes at `:223/:312`).
- **`SectionData`** already carries `row: Step3Row`, so these thread through automatically; the modal reads them from `data.row`.
- **Modal `Approve & apply` payload**: `{ stagedId: data.row.stagedId, reviewerChoicesVersion: 1, reviewerChoices }` where `reviewerChoices` are built from the tier-3 radio picks + the auto-bound single-action items (§4.4). `Ignore this sheet` maps to the `discard` route `kind: "permanent_ignore"` (`StagedReviewCard.tsx:443-450`). `Re-scan this sheet` uses the separate `rescan-sheet` route (not the discard route). `defer_until_modified` is no longer surfaced (§4.4).
- **Corrupt guard**: `reviewItemsCorrupt === true` → suppress `Approve & apply`, offer only discard, exactly as `StagedReviewCard.tsx:308-312` does today.

### 4.4 Resolution modal (re-apply rows only)

`Review →` on a **re-apply Needs-review row** (§4.2.1: `staged` + `lastFinalizeFailureCode`) opens `Step3ReviewModal` for that show. (Other blocking statuses keep their inline controls — §4.2.1 — and never reach this modal.) The modal's footer swaps "Publish this show" for the **resolution actions**, and the body renders **what changed**, tiered:

- **Tier 1 — pure context** (`ONBOARDING_SCAN_REVIEW`, `FIRST_SEEN_REVIEW`): a one-line reason in the modal **header subline**. No card, no radio. (In practice a clean never-failed show is **Ready**, not Needs-review; tier-1 copy appears only in a re-apply context.)
- **Tier 2 — section diagnostics** (`MI-6/7/8/9/11`, `DIAGRAMS_*`, `REEL_DRIFT`): single-action; render the `describeItem` line **anchored to its section** in the body (nav dot flags it). No radio — the single action is the footer button.
- **Tier 3 — identity conflicts** (`MI-12/13/14`): full item card with the forced-unset radio group (`allowedActionsFor` ≥ 2 options).

**Single-action-no-radio rule.** When `allowedActionsFor(item).length === 1`, render no radio; the footer `Approve & apply` **is** the explicit act. The submit path binds the sole action to the button (so the "choice required per item" guard — the current skip-when-unset logic — still receives a choice). Radios render only when `length ≥ 2`.

**Footer actions (redesigned copy + reduced set).** Three immediate, unambiguous actions, each named by object + effect (all Doug-facing → routed through `lib/messages/lookup.ts`, never raw literals — invariant 5):

- **`Approve & apply`** (primary) — resolve now; disabled until every tier-3 item is chosen ("N of M chosen"). Calls the surviving wizard `apply` route (§4.3.1 payload).
- **`Re-scan this sheet`** (secondary) — **reuse `components/admin/RescanSheetButton.tsx` verbatim** (label "Re-scan this sheet" / pending "Re-scanning…", `:143`; `POST /api/admin/onboarding/rescan-sheet {driveFileId, wizardSessionId}`, with its result overlay). Immediate re-fetch + re-parse (the Thread-3 rescan): clean → the row clears / becomes Ready; dirty → the modal refreshes with new review items. Replaces the old "Retry on next sync" (`try_again_next_sync`) — same intent, immediate feedback, existing component.
- **`Ignore this sheet`** (secondary) — the `permanent_ignore` discard; the show is removed from setup and appears in **Ignored sheets** on the dashboard, restorable via the existing `unignore` route (`app/api/admin/ignored-sheets/[driveFileId]/unignore/route.ts`). Subline: "You can restore it from Ignored sheets." Replaces the ambiguous "Stop showing this sheet."

**Dropped: `defer_until_modified` ("Wait for next edit").** The backend `kind` stays (route unchanged), but no button renders it. Rationale: its only effect (auto-resurface on next sheet edit, `discardStaged.ts:447`) is already achieved by editing the sheet (sync re-stages on modtime bump) or by `Re-scan this sheet`, and `permanent_ignore` also clears on a manual re-sync (`runManualSyncForShow.ts:473`). It added a confusing third deferral with no distinct value.

**Row-dependent variants (R2 note).** `StagedReviewCard.tsx:38-39`: not every row exposes every discard variant. The footer renders only the variants allowed for the row (`allowedDiscardVariants`), never a hardcoded set; `Approve & apply` + `Re-scan this sheet` are universal, `Ignore this sheet` renders where `permanent_ignore` is allowed.

**Guard — DIRTY with empty/corrupt items.** DIRTY implies ≥ 1 invariant, but defensively (`sentinelItems ?? []`, or `reviewItemsCorrupt`): render the generic "changed, re-review" header + open the modal so Doug can eyeball the sections; suppress `Approve` for the corrupt case (existing `reviewItemsCorrupt` fail-closed behavior preserved).

After a successful `Approve & apply`, the modal footer returns to the ordinary "Publish this show" / closes; the row's status refreshes (Live/Held/Ready) via the standard router refresh — the same transition the modal already performs through `NotPublishableNote`.

**Guard — no resolution during an active publish run (HIGH, R1).** While the footer's publish/resume loop is running (`run.isRunning`, `Step3ReviewWithFinalize.tsx:113`), the `Review →` control and the modal's `Approve & apply` are **disabled**. The client loops and re-POSTs `/finalize` on every `batch_complete` (`FinalizeButton.tsx`), and the server reselects finishable-clean rows each batch (`finalize/route.ts`), so an apply completing mid-run would race a row into the active batch selection. Disabling resolution during a run serializes it: Doug resolves before publishing or after a run settles, never concurrently. (Resolution is inherently a "this run is blocked" action, so blocking it during a run is also the correct UX.)

**Prop path (R2 LOW).** `run.isRunning` currently lives inside `Step3ReviewWithFinalize` (`:83-113`), while `Review →` (row) and the modal controls live under `Step3Review` / `Step3ReviewModal`. The plan threads an `isPublishRunActive: boolean` prop down from `Step3ReviewWithFinalize` → `Step3Review` (row list) → the `Review →` trigger and → `Step3ReviewModal`, so BOTH the row trigger AND an already-open modal's `Approve & apply` disable while a run is active. Tests prove both: the row `Review →` is disabled during a run, and an open modal's submit is disabled mid-run.

### 4.5 Footer / primary action by checkpoint state

`Step3ReviewWithFinalize` gains a `checkpointStatus` input and selects the primary footer action:

- `null` → `FinalizeTrigger` (Publish N shows & finish) — unchanged.
- `in_progress` → **Resume** (drives the existing resume batch loop; `ResumeFinalizeButton` logic folded into the run).
- `all_batches_complete` → **Finish** (final CAS; `RunFinalCASButton` logic folded in). A **stale** checkpoint adds a footer note (replacing `StaleReadyToPublish`'s standalone discard/publish framing) — discard remains reachable.

The disabled gate stays keyed on `finishable` (blocking rows block finish), unchanged (`Step3ReviewWithFinalize.tsx:79-88`).

### 4.6 Deletions + redirect

- Delete `FinalizeInProgress.tsx`, `ReadyToPublish.tsx`, `StaleReadyToPublish.tsx`, the staged `page.tsx`, and (folded) `_unresolvedSheets.ts`.
- Remove the two link-outs (`Step3ReviewModal.tsx:1087`, `Step3SheetCard.tsx:183`) — the modal now resolves in place.
- Add a `next.config.ts` redirect: `/admin/onboarding/staged/:wizardSessionId/:driveFileId → /admin` (307, reversible; Step-3 is the session's home and the row is surfaced there). Keeps bookmarks/alert links landing sane.
- Remove the staged **page** entry from `lib/audit/trustDomains.ts:60-62`; keep the API-route entries (`:110-126`).

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

- **Pre-finalize** (`checkpoint null`): rows Ready (checkbox) / Needs-review; footer = Publish trigger. Normally no Live/Held rows, BUT a manifest row for an already-existing Live show (a §7.4 D10 no-op re-touch, `finalize/route.ts:846`) legitimately renders **Live** — the derivation (§4.2) handles it because the linked show is already `published=true`. So "no Live/Held pre-finalize" is the common case, not an invariant.
- **Mid-finalize** (`in_progress`): rows Live/Held (settled) + Needs-review + Ready(remaining); footer = Resume. Transient In-progress during an active run.
- **Batches-complete** (`all_batches_complete`): rows Live/Held + any Needs-review; footer = Finish (CAS), stale note if stale.
- **Modal** (any mode, Needs-review row): resolution UI; independent of the page mode.

Shared across all page modes: the row list component, the per-row status badge, the `Review →` control on Needs-review rows, the section-nav modal.

## 7. Transition inventory

Page-level state transitions and their treatment:

| From → To | Trigger | Treatment |
|---|---|---|
| Ready → In progress → Live/Held | Publish/Finish run | client optimistic pulse → settle on NDJSON per-row done; row badge crossfades |
| Needs-review → (modal open) | `Review →` | modal mount (existing dialog enter transition) |
| (modal) → Ready/Live/Held | Approve & apply success | modal close + router refresh; row badge updates instant |
| (modal) → Needs-review (unchanged) | Wait / Stop-showing | modal close; row stays Needs-review or leaves list (Stop-showing) |
| pre-finalize → mid-finalize | Publish started, page reload/interruption | server re-render into `in_progress` mode; Resume footer |
| mid-finalize → batches-complete | last batch done | footer swaps Resume → Finish |
| Approve while a publish run is active | compound | **Resolution is disabled during an active run** (§4.4 guard, `run.isRunning`). Doug cannot open `Review →` or click `Approve & apply` while the publish/resume loop runs, so no apply can race a row into the server's per-batch finishable reselection (`finalize/route.ts`). Serialized by construction; a test asserts `Review →`/`Approve` are disabled while `run.isRunning`. |

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

- **Row-status derivation** (unit): each `Step3ManifestStatus` × published/Held/failure-code → expected display state. Derive expectations from fixtures, not hardcoded. Explicit failure mode: a `staged`+failure_code row must be Needs-review, not Ready (the blind-approve hole).
- **`Review →` presence** (component): every Needs-review row renders the control; no Needs-review row exposes an inline approve. Anti-tautology: assert against the row's derived state, and clone-strip sibling controls before scanning.
- **Single-action-no-radio** (component): a 1-action item renders no `role="radio"`; a ≥2-action item (MI-13) renders the radio group forced-unset; `Approve & apply` disabled until chosen.
- **Modal fold** (real-browser): `Review →` opens `Step3ReviewModal`; footer shows resolution actions; body shows tier-2 line anchored to section + tier-3 radios; Approve calls the `apply` endpoint (mocked) and closes.
- **Unified surface by checkpoint** (integration): `in_progress` / `all_batches_complete` render Step-3 with the right footer action (Resume / Finish), not the deleted interstitials.
- **Redirect** (unit): old staged URL → 307 `/admin`.
- **Deletion safety** (grep/structural, HIGH R1 + MEDIUM R2): covers deleted **components, pages, AND helpers**, plus registry rows and URL-shape assertions. **The grep guard is AUTHORITATIVE** (a structural test walking the tree, failing on any surviving import/link of a deleted symbol/route); the list below is the illustrative known breaker set to rewrite/delete, not an exhaustive substitute for the guard:
  - `tests/admin/_metaInfraContract.test.ts:188-190` + `:946-961` (registers `readUnresolvedSheets` / staged reads) — update the registry when `_unresolvedSheets.ts` folds in.
  - `tests/components/wizardStagedPage.heading.test.tsx`, `tests/components/admin/WizardStagedReapplyResolved.test.tsx` — deleted with the page (or repurposed to the modal).
  - `tests/admin/unresolvedSheets.test.ts:72-78` — asserts old reapply URL; delete/rewrite against the unified read.
  - `tests/components/admin/FinalizeReentry.test.tsx`, `FinalizeInProgress.test.tsx`, `AdminPage.test.tsx`, `RunFinalCASButton.test.tsx`, `RescanSheetButton.test.tsx`, `tests/e2e/admin-phase2-surfaces.spec.ts` — rewrite against the unified Step-3 surface or delete with their component.
  - `lib/audit/trustDomains.ts:60-62` — remove the staged-page entry; keep the API entries (`:110-126`).
  - The grep guard asserts: no import of `FinalizeInProgress`/`ReadyToPublish`/`StaleReadyToPublish`/the staged `page.tsx`/`_unresolvedSheets` survives; the two link-outs (`Step3ReviewModal.tsx:1087`, `Step3SheetCard.tsx:183`) are gone.
- **Layout** (real-browser Playwright): footer + modal at mobile/desktop breakpoints with row-status badges present; no horizontal overflow; footer center min-height preserved.

## 12. Watchpoints / disagreement-loop preempts

- **`applied` ≠ Live.** Pre-finalize `applied` is publish-intent (checkbox checked), realized as Live only after CAS. Do NOT relitigate as "applied means published." Cited: `OnboardingWizard.tsx:214`, finalize route Held model (`:114,:524`).
- **Held is intentional.** Unchecked-clean rows become `published=false` Held drafts by design (Task B2). Not a bug, not "unpublished failure."
- **In-progress is client-transient.** Finalize is a resumable batch loop; no persisted "publishing now" row exists at a static render. Re-entry = Resume, not a per-row spinner. Cited: `finalize/route.ts` batch loop, `Step3ReviewWithFinalize.tsx:155` tracking.
- **Mutation APIs stay.** Only the *page* is deleted; the `apply/discard/approve/unapprove/staged-diagram` routes and their `trustDomains`/`AUDITABLE_MUTATIONS` entries are unchanged. Do NOT flag "deleted mutation surface."
- **No advisory-lock change.** Resolution reuses existing lock-holding routes; single-holder topology untouched.
- **Redirect is intentional 307**, not a 410 — bookmarks/alert deep-links must land on the session's review page.
- **Tier-1 rarely surfaces.** A clean never-failed show is Ready (Publish = consent), not Needs-review. Tier-1 copy appears only in a re-apply context; the modal is still the resolution home when it does.
- **`publish_intent` ≠ `published` (R1).** `onboarding_scan_manifest.publish_intent` is the pre-finalize checkbox intent; `shows.published` (via `created_show_id`) is Live. Do NOT derive Live/Held from `publish_intent`. Cited: migrations `20260623000001`, `20260611000000`; finalize `:114,:524`.
- **Not all blocking rows are re-apply rows (R1).** Only `staged`+`lastFinalizeFailureCode` rows route to the modal. `hard_failed`/`live_row_conflict`/`discard_retryable` keep their existing inline controls (`Step3Review.tsx:459-504`) and are out of scope. Do NOT route them to the modal or delete their controls.
- **Resolution disabled during an active publish run (R1).** Intentional serialization, not a missing affordance.

## 13. Rollout / sequencing (for the plan)

Decomposable into safe phases:

**Ordering constraint (HIGH, R2):** the staged `page.tsx` and its link-outs must NOT be deleted/redirected until the modal resolution AND the checkpoint-state Step-3 render both exist — otherwise, during the window, an `in_progress` session still renders `FinalizeInProgress` whose re-apply links would redirect to `/admin` (still the interstitial), stranding resolution. So the surface fold precedes the delete, and the delete+redirect is atomic with the re-entry fold.

1. **Data contract + unified read** — extend `Step3Row` (`stagedId`, `triggeredReviewItems`, `reviewItemsCorrupt`; §4.3.1) + the provenance-joined `shows` read for Live/Held (§4.3); display-state derivation + badges behind the existing pre-finalize surface (no behavior change yet).
2. **Modal resolution behavior** — fold `StagedReviewCard` resolution into `Step3ReviewModal` (tiers, single-action-no-radio, corrupt guard, active-run disable §4.4); thread `isPublishRunActive`; wire `Approve & apply`/`Wait`/`Stop-showing` to the existing apply/discard routes. Both the standalone page and the modal work during this phase (dual-path, safe).
3. **Interstitial + checkpoint fold** — render the unified Step-3 for `in_progress` + `all_batches_complete`; fold Resume/Finish (CAS) into the footer with the stale note; delete `FinalizeInProgress` / `ReadyToPublish` / `StaleReadyToPublish`. After this, `/admin` renders Step-3 (with the modal) for every non-terminal checkpoint — so `/admin` is now a valid redirect target for a re-apply row.
4. **Redirect + staged-page delete** — only now delete the standalone staged `page.tsx`, add the `next.config.ts` redirect (→ `/admin`, which is the unified surface post-phase-3), remove the two link-outs, drop the `trustDomains` page entry. Atomic with phase 3's guarantee.
5. **Registry + test cleanup** — fold `_unresolvedSheets` into the unified read; update `_metaInfraContract` registry rows; delete/rewrite the affected tests (§11); add the redirect + deletion-safety guards.
6. **Impeccable dual-gate + cross-model review + CI.**
