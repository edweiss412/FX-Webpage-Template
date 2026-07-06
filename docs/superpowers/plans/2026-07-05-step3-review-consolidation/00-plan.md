# Step-3 Review Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the four onboarding-finalize surfaces (`FinalizeInProgress`, `ReadyToPublish`/`StaleReadyToPublish`, standalone staged `page.tsx`) into ONE Step-3 "Review & publish" surface with per-row lifecycle status, whose only resolution path for a blocked re-apply row is the folded `Step3ReviewModal`.

**Architecture:** A single server read (`fetchStep3Data`) runs across every finalize checkpoint and derives each row's display state via one total ordered algorithm (spec §4.2). `app/admin/page.tsx` renders the unified Step-3 for `null`/`in_progress`/`all_batches_complete`; the footer selects Publish/Resume/Finish by checkpoint. Re-apply rows resolve in a folded modal (Approve & apply / Re-scan / Ignore), never a blind inline approve. No mutation-API, DB-schema, §12.4-code, or advisory-lock change.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, TypeScript, Supabase (postgres.js), Tailwind v4, Vitest + jsdom (unit/component), Playwright (real-browser layout).

**Spec:** `docs/superpowers/specs/2026-07-05-step3-review-consolidation.md` (adversarial-approved R11). Every task cites the spec section it implements.

## Global Constraints

- **TDD per task**: failing test → minimal impl → green → commit. Never impl before its test. (AGENTS.md inv. 1)
- **Commit per task**, conventional commits `<type>(<scope>): <summary>`, `--no-verify` (shared hook belongs to the main checkout). (inv. 6)
- **No raw error codes in UI**: every failure code renders via `lib/messages/lookup.ts` / `messageFor` / `ErrorExplainer`. (inv. 5)
- **Supabase call-boundary**: every client call destructures `{ data, error }`; infra fault → discriminated `{ kind: "infra_error" }`; register the new read in `tests/admin/_metaInfraContract.test.ts`. (inv. 9)
- **No new mutation surface**: resolution reuses existing registered routes (`apply`/`discard`/`rescan-sheet`/`finalize`/`finalize-cas`); the unified read is read-only and must NOT import `lib/log`. No `AUDITABLE_MUTATIONS` edit. (inv. 10)
- **No advisory-lock change**: no `pg_advisory*` call site added. (inv. 2)
- **UI-quality gate**: UI-heavy diff → `/impeccable critique` AND `/impeccable audit` before cross-model review; HIGH/CRITICAL fixed or `DEFERRED.md`. (inv. 8)
- **Three distinct signals — never conflate** (spec §12): pre-finalize checkbox = manifest `status` (`applied`=checked/`staged`=unchecked); `publish_intent` = finalize-stamped realized intent (pre-CAS Ready-to-publish + CAS flip); `shows.published && !archived` = crew-visible Live.
- **Copy bans** (DESIGN.md): no em dashes, no `--` in copy; object+effect button labels.

## Live-code anchors (verified pre-draft)

- `Step3Row` `components/admin/wizard/Step3Review.tsx:79-108`; `Step3PublishCounts` `:110`; `computeSelectableCounts` `:639`; `Step3ReviewProps` `:123`.
- `Step3ReviewWithFinalize` props `components/admin/wizard/Step3ReviewWithFinalize.tsx:52`.
- `Step3ReviewModal` props `components/admin/wizard/Step3ReviewModal.tsx:149-161`; `SectionData` `step3ReviewSections.tsx:62`; modal already imports `RescanSheetButton` (`:64`) + `NotPublishableNote` (`:58`).
- `Step3SheetCard` + `PublishCheckbox({driveFileId,checked,onToggle})` `components/admin/wizard/Step3SheetCard.tsx:79`; null-parse guard `:292-315`; checkbox render `:501-505`.
- `StagedReviewCard` `allowedActionsFor` `:115-122`, `describeItem` `:131-187`, `actionLabel` `:189-200`, `expectedRenameValue` `:124-129`, corrupt gate `:308-312`, discard mapping `:443-450`.
- `useFinalizeRun(props)` `components/admin/FinalizeButton.tsx:139`; `FinalizeRunProps` `:124`; `FinalizeRun` `:445`; batch loop + auto-CAS `:344-362`; `FinalizeTrigger` `:462`; `casPhaseLabel` `:99`.
- `RescanSheetButton` props `{driveFileId, wizardSessionId, resultPlacement}` `components/admin/RescanSheetButton.tsx:34`; label `:166`.
- `fetchStep3Data`/`Step3FetchResult`/`isCleanReviewRow`/`Step3Container` `components/admin/OnboardingWizard.tsx:219/:205/:214/:415`.
- `app/admin/page.tsx:150-208` checkpoint branch; `checkpoint = { status, batches_completed, last_processed_at }`; `readUnresolvedSheets`, `isCheckpointStale`, `nowDate`, `FinalizeInProgress`/`ReadyToPublish`/`StaleReadyToPublish`/`DashboardWithHeader`.
- `CleanupAbandonedFinalizeButton({sessionId})` `components/admin/CleanupAbandonedFinalizeButton.tsx:26`.
- `TriggeredReviewItem` `lib/parser/types.ts:435`; `isStructurallyValidReviewItem` `lib/staging/reviewPayloadGuards.ts:69`; `parseTriggeredReviewItems` `lib/staging/triggeredReviewItems.ts:24` (DIFFERENT module — plan-R2 fix); `ReviewerChoice` `lib/sync/applyStaged.ts`.
- `DiscardVariant`/`DiscardStagedArgs` (wizard shape `{driveFileId, sourceScope:"wizard", wizardSessionId, stagedId, variant?}`) `lib/sync/discardStaged.ts:20/:55`; wizard accepts all variants `:441-460`; live-only rejection `:504-507`.
- `next.config.ts:46-75` `redirects()` → `[{source,destination,permanent}]`.
- Provenance join: `finalize-cas/route.ts:494-503,549`; existing-show paths never write `created_show_id` `finalize/route.ts:1057-1102`; `publish_intent` stamp `:527-529`; CAS publishes `applied && created_show_id && publish_intent` `finalize-cas/route.ts:517-526`.
- `resolveShowPageAccess.ts:190,196` (archived > published precedence); crew-read RLS `20260602000001_b2_r5_archived_crew_read_lockdown.sql:17`.
- `lib/audit/trustDomains.ts:60-62` staged page entry (delete); API entries `:154-170` + `:110-126` (keep).
- `_metaInfraContract.test.ts` registry row `{helper, path, contract}` (`:13`).

## Meta-test inventory (declared, spec §10)

- **EXTENDS** `tests/admin/_metaInfraContract.test.ts` — register the unified read's Supabase call boundary.
- **CREATES** a deletion-safety grep guard (Task 5.2) walking the tree for surviving imports/links of deleted symbols/routes.
- **CREATES** a redirect test (Task 4.1) asserting old staged URL → 307 `/admin`.
- **N/A**: advisory-lock topology (no `pg_advisory*`); `admin_alerts` catalog (no new code); email-normalization (untouched); `_metaMutationSurfaceObservability` (no new surface; a deleted *page* drops from discovery with no registry edit).

## File structure

**Create:**
- `lib/admin/step3DisplayState.ts` — pure display-state derivation (spec §4.2 algorithm) + `Step3DisplayState` type.
- `lib/admin/step3ReviewItemTiers.ts` — extracted `allowedActionsFor`/`describeItem`/`actionLabel`/`expectedRenameValue`/`tierForItem` (shared by the folded modal; formerly private to `StagedReviewCard`).
- Tests: `tests/admin/step3DisplayState.test.ts`, `tests/admin/step3ReviewItemTiers.test.ts`, `tests/components/admin/wizard/Step3ReviewModalResolution.test.tsx`, `tests/components/admin/wizard/Step3ActiveRunFreeze.test.tsx`, `tests/components/admin/FinalizeRunModes.test.tsx`, `tests/admin/step3UnifiedRead.test.ts`, `tests/admin/step3InfraFooter.test.tsx`, `tests/config/step3StagedRedirect.test.ts`, `tests/admin/step3DeletionSafety.test.ts`, `tests/e2e/step3-unified-layout.spec.ts`.

**Modify:**
- `components/admin/wizard/Step3Review.tsx` — `Step3Row` gains `stagedId?`/`triggeredReviewItems?`/`reviewItemsCorrupt?`/`publishIntent?`/`linkedShow?`; row renders derived badge + `Review →`; thread `isPublishRunActive`.
- `components/admin/OnboardingWizard.tsx` — `fetchStep3Data` joins `public.shows`, computes display state, coerces new fields; runs across checkpoints; `checkpointStatus` prop.
- `components/admin/wizard/Step3ReviewModal.tsx` — fold resolution body + footer (Approve & apply / Re-scan / Ignore) behind a `resolution` prop.
- `components/admin/wizard/Step3ReviewWithFinalize.tsx` — `checkpointStatus` input; footer selects Publish/Resume/Finish; re-home `CleanupAbandonedFinalizeButton`; stale note.
- `components/admin/wizard/Step3SheetCard.tsx` — checkbox/rescan/inline controls gate on `isPublishRunActive`; null-parse recovery drops the deleted-page link, adds inline Ignore.
- `components/admin/FinalizeButton.tsx` — `useFinalizeRun` gains `mode: "publish" | "resume" | "finish"` selecting the endpoint sequence.
- `app/admin/page.tsx` — render unified Step-3 for `in_progress`/`all_batches_complete`.
- `next.config.ts` — staged-URL 307 redirect.
- `lib/audit/trustDomains.ts` — drop staged page entry.

**Delete:** `components/admin/FinalizeInProgress.tsx`, `ReadyToPublish.tsx`, `StaleReadyToPublish.tsx`, `ResumeFinalizeButton.tsx`, `app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx`, `app/admin/_unresolvedSheets.ts` (folded).

---

## Test-fixture convention

Unit-test bodies (derivation, tiers, read) are shown complete. For component/e2e tests, the plan shows the **load-bearing assertions** verbatim; fixture object literals (a full `SectionData`, `TriggeredReviewItem`, or seeded row) are completed by the implementer from the cited live shapes (`SectionData` `step3ReviewSections.tsx:62`; `TriggeredReviewItem` `lib/parser/types.ts:435`; `Step3Row` `Step3Review.tsx:79`) — a full literal here would be large and would drift from the real shapes. Every such test states its concrete failure mode (anti-tautology, spec §11): assert against the derived state / data source, clone-strip sibling controls that independently render the scanned label, derive expected values from fixture dimensions.

## Ordering constraint (HIGH, spec §13)

The staged `page.tsx` + its link-outs must NOT be deleted/redirected until BOTH the modal resolution (Phase 2) AND the checkpoint-state Step-3 render (Phase 3) exist — otherwise an `in_progress` session still renders `FinalizeInProgress` whose re-apply links redirect to `/admin` (still the interstitial), stranding resolution. Phases 1→2→3→4 are strictly ordered; Phases 5-6 follow.

---
See `01-phase1.md` … `06-phase6.md` for the task-by-task steps.
