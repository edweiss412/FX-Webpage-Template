# M-onboarding-fixups — Wizard finalize full Phase-2 apply + onboarding-flow repairs

**Date:** 2026-06-10
**Status:** Draft — pending adversarial review + owner sign-off
**Master spec:** `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (this milestone RESTORES conformance to it; no amendment is proposed)
**Origin incident:** All six real shows onboarded via the wizard on 2026-05-29 have 0 `crew_members`, 0 `rooms`, empty `event_details`-adjacent child data, and empty `shows_internal`, despite `last_sync_status = 'ok'`. The live parser, run against the live sheets, extracts everything correctly (verified 2026-06-10: 6 crew / 7 rooms for `2025-10-aii-iii-consultants-roundtable`). Downstream casualty: with zero crew, the share-link picker has no identities, so no picker asset session can exist and the agenda proxy 401s (`app/api/asset/agenda/[show]/[id]/route.ts:248`) — the crew-page "agenda could not be loaded" symptom.

---

## 1. Root cause (diagnosed, evidence-backed)

The onboarding wizard's two apply writers persist **only `shows` columns** and silently drop every child table in the staged `parse_result`:

- **First-seen branch:** `applyFirstSeenDraft` — `app/api/admin/onboarding/finalize/route.ts:324-373` — bespoke `INSERT INTO public.shows (...)` listing title/client/venue/dates/event_details/agenda_links/diagrams/opening-reel/coi/pull_sheet. No `crew_members`, `rooms`, `hotel_reservations`, `transportation`, `contacts`, `shows_internal`, no crew-auth provisioning.
- **Existing-show branch (Phase D):** `applyShadow` — `app/api/admin/onboarding/finalize-cas/route.ts:241-307` — bespoke `UPDATE public.shows SET ...` with the same column list. Same omissions.

Both stamp `last_seen_modified_time = staged_modified_time` and `last_sync_status = 'ok'`, so the cron watermark gate (`lib/sync/perFileProcessor.ts:214-220`) skips the file on every subsequent pass until Doug edits the sheet. The damage is permanent-until-edit, and wizard re-runs (observed 2026-05-29, 2026-06-08, 2026-06-10 in `sync_audit`) re-apply only show-level fields each time.

**This violates the ratified master spec**, which is explicit on both branches:

- §6.8.1 step 4L (master spec line 1665): Apply runs "the §5.2 destructive transaction's **snapshot-replacement steps**" against the stored `parse_result` — the full Phase-2 apply, child tables included.
- Wizard finalize promotion (line 1673): "for EACH row, run §5.2 Phase 2 against `parse_result` **exactly as live Apply step 4L would**."
- Phase B contract (line 2581): "Run the §6.8.1 step-list 4L → 5L → 6L Phase-2 + sync_audit + DELETE flow against `parse_result`."
- Shadow-payload contract (line 2591 + `shows_pending_changes` DDL comment, lines 528-543): the payload is "the full Phase-2 column set the prior contract would have written," explicitly enumerating "transportation, hotel_reservations, rooms, contacts, last_seen_modified_time, last_synced_at, parse_warnings, raw_unrecognized."

The likely origin of the narrowing: the spec's shadow-payload prose describes the Phase-D apply as `UPDATE shows SET <payload-columns>` while simultaneously enumerating child-table data in the payload — an internal tension the implementation resolved by taking the literal `UPDATE shows` reading. This spec resolves the tension in the only direction consistent with §6.8.1 4L: **"payload columns" means the full Phase-2 apply surface, child tables included.**

Note: `crew_members` is absent from the line-2591 enumeration ("etc." carries it). §6.8.1 4L's snapshot-replacement reference (§5.2, master spec lines 1104-1127) unambiguously includes the crew delete-then-upsert, so crew is in scope for both branches. This reading is part of what adversarial review should NOT relitigate (§8).

## 2. Resolved decisions (owner, 2026-06-10)

| # | Decision |
|---|----------|
| D-1 | Scope = full **M-onboarding-fixups** milestone: F1 core fix, F2 remediation, F3 re-apply-page 404, F4 checkpoint/shadow cleanup, F5 BL-WIZARD-SESSION-CAS-TURNOVER-RACE. |
| D-2 | Existing-show wizard applies flow through the **same machinery as dashboard Apply**: `show_change_log` feed entries + MI-11 hold semantics, with wizard reviewer choices satisfying the identity gate the same way dashboard choices do. No second apply variant. |
| D-3 | Remediation = **auto-detect + watermark reset** (one-shot data migration; mechanism per the `20260608000004_retire_live_pending_syncs.sql:34` idiom: `last_seen_modified_time = null`), not manual clicks, not a new admin button. |
| D-4 | Re-apply page's row-gone state = **friendly "already resolved" page** (replace `notFound()`), not a redirect, not a kept 404. |
| D-5 | Checkpoint/shadow cleanup = **extend the existing `cleanupAbandonedFinalize` path** (`lib/onboarding/sessionLifecycle.ts:321`) + one-time purge of current debris; no new TTL cron. |
| D-6 | F1 approach = **Approach A, reuse the live Apply engine** (`applyParseResult` / the `applyStaged` core), not extending the bespoke writers (B), not stub-and-let-cron-backfill (C). Rationale: A is what §6.8.1 4L literally specifies, it delivers D-2 for free, and it deletes the duplicated snapshot-replacement SQL whose drift caused the bug. |

## 3. F1 — Finalize runs the full Phase-2 apply

### 3.1 First-seen branch (finalize Phase B per-row transaction)

Replace `applyFirstSeenDraft`'s bespoke INSERT with the shared apply pipeline, invoked inside the existing per-row transaction and per-show advisory lock:

- The first-seen insert keeps `insertFirstSeenShowWithSlugRetry` (`lib/sync/runScheduledCronSync.ts:323`) for slug-collision retry — already shared with cron.
- After (or as part of) the show insert, the apply MUST run the full child set the `ApplyTx` contract defines (`lib/sync/applyParseResult.ts:20-40`): `upsertCrewMembers`, `replaceHotelReservations`, `replaceRooms`, `replaceTransportation`, `replaceContacts`, `upsertShowsInternal` (this finally persists `parse_warnings` + `raw_unrecognized`, today empty for every row in the table), and `provisionAddedCrewAuth` for added crew names.
- **Published-visibility flag lifecycle.** The wizard first-seen row MUST stay `published = false` until Phase D's bulk flip (master spec line 2581: "interim-batch `published = false` semantics"). The cron first-seen insert path omits `published` (defaults `true` per DDL) and carries B2 auto-publish token semantics (`runScheduledCronSync.ts:1074-1097`). The shared apply therefore gains an explicit first-seen visibility option: storage = `shows.published`; write paths = wizard Phase B (`false`) and cron first-seen (existing auto-publish semantics, unchanged); read paths = crew-page gating + Phase D bulk flip; effect = wizard interim invisibility preserved. No zombie flag: every value is written and read.
- Sync-audit attribution is already correct (operator's Apply click; `insertFinalizeAudit`, finalize/route.ts:375-410) and is unchanged.
- Crew added here is **initial ingestion on a not-yet-published show**: no prior live crew exists, so no MI-11 surface and no feed backfill is required for the first-seen branch (the `show_change_log` feed documents *changes to a live show*; the show becomes visible only at Phase D). This asymmetry with §3.2 is intentional.

### 3.2 Existing-show branch (Phase D `applyShadow`)

Replace the `shows`-only UPDATE with the same hold-aware apply core the dashboard staged-Apply uses (`applyStaged` → `phase2.ts:328-335` `applyParseResult` with `holds: { port, baseModifiedTime }`, MI-11 holds written before the apply at `phase2.ts:297-335`, `writeAutoApplyChanges` feed rows at `phase2.ts:337-350`):

- **Unit boundary:** extract the "apply a staged parse_result with reviewer choices under an already-held per-show lock" core so that `applyStaged` (dashboard) and Phase D (wizard) are two thin callers of one function.
- **Shadow payload completeness (R1 finding 1).** The payload today carries only `parse_result`, `staged_modified_time`, `staged_id`, `reviewer_choices` (`stageExistingShowShadow`, finalize/route.ts:412-450) — and Phase B then DELETEs the `pending_syncs` row (`deleteApprovedPending`, finalize/route.ts:452-470), so `triggered_review_items` no longer exist by Phase D. The dashboard apply contract needs them: `validateReviewerChoices` checks choices against items, `deriveAuthSideEffects` derives revocations from items+choices, and MI-11 detection keys off items (`lib/sync/applyStaged.ts`). Phase B therefore MUST extend the shadow payload with `triggered_review_items` (copied from the `pending_syncs` row before deletion), and Phase D MUST run the same choice-validation + side-effect derivation the dashboard runs.
- **Concrete MI-11 boundary (R4 finding 2).** The legacy whole-parse staged path deliberately FAILS CLOSED on MI-11 (`Phase2GateBypassError`, P2-F7 guard, `lib/sync/applyStaged.ts:1352-1354`) because MI-11 must be passed into the Phase-2 core as `mi11Items` so `sync_holds` are written before the hold-aware apply (`lib/sync/phase2.ts:297-335`). Phase D therefore must NOT route through the legacy whole-parse path: it extracts MI-11 items from the payload's `triggered_review_items` and invokes the shared Phase-2 core with `mi11Items` + holds port + reviewer choices — the same composition `runPhase2` uses. The P2-F7 guard is PRESERVED untouched on the legacy path (its comment's "MI-11 cannot fire wizard" claim describes the pre-F1 world where the wizard never mutated existing shows' crew; F1 changes that by routing through the hold-aware core, not by relaxing the guard). Required test: a wizard existing-show apply whose items include MI-11 writes the `sync_holds` row and pins identity exactly as the cron decision-rule path does; a second test pins that the legacy whole-parse path still throws on MI-11.
- **Fail-closed on missing/corrupt review items (R2 finding 1).** An existing-show shadow payload whose `triggered_review_items` key is absent or fails `parseTriggeredReviewItems` coercion is REFUSED, not applied choice-free: Phase D records a typed per-row failure (reusing the corrupt-payload guard posture `applyStaged` already has for `reviewItemsCorrupt`/`parseResultCorrupt` rows), leaves the shadow row in place for operator cleanup/re-stage, and continues sibling rows. Coercing to `[]` would let an identity-bearing change (MI-11 email change) apply with no hold and no revocation floor — fail-open on an identity gate. There are zero legitimate legacy shadows in any environment (validation's 18 are synthetic e2e debris purged by F4; production has none), so fail-closed costs nothing operationally. Required test: an MI-11 email change whose payload lacks the key is refused, not applied.
- **Required test (R1 finding 1):** an existing-show wizard apply with an MI-11-triggering row proving reviewer-choice validation, hold creation, audit payload, and feed behavior are identical to dashboard Apply for the same inputs.
- `baseModifiedTime` for the holds context = the payload's `staged_modified_time` (the wizard analogue of `args.binding.modifiedTime` in phase2).
- The existing CAS gate stays exactly where it is: `last_seen_modified_time IS NULL OR <= staged_modified_time`, failure code `STAGED_PARSE_OUTDATED_AT_PHASE_D`, per-row rollback, shadow row retained (finalize-cas/route.ts:276-305 semantics preserved).
- **Per-row commit independence is RATIFIED, not an oversight (R6 finding 1 disposition).** Master spec line 2591(c) defines Phase D's per-row apply as best-effort: a CAS-failing row "ROLLBACKs only that show, leaves the staged row in `shows_pending_changes` for the operator to clear … or for the next finalize click to re-apply" — mirroring Phase B's "sibling rows are NOT aborted — best-effort policy" (line 2581 B.1). F1 keeps this. A committed row is an internally-complete apply of an operator-approved parse for that one show — children, holds, feed, and auth side-effects land atomically per row inside that row's transaction, with blast radius identical to a dashboard Apply of the same parse. A later sibling's CAS failure does not make the earlier show's applied content wrong, and the operator-recovery contract (retained shadow + `per_row` failure code + re-fire/cleanup) is unchanged. All-or-nothing Phase D would contradict the ratified contract and reintroduce the long-lock contention the per-row design exists to avoid (master spec line 2587). Required multi-shadow regression: shadow A applies fully (children + holds + feed + auth, committed); shadow B CAS-fails (typed `per_row` code, shadow retained, B's show entirely untouched — no partial child writes); the wizard session stays unresolved until B is cleared, while A's applied state persists by design.
- Feed + MI-11 behavior follows D-2: notable auto-applied changes land in `show_change_log`; MI-11-eligible items (existing-crew email change) behave exactly as a dashboard Apply with choices — the wizard's `reviewer_choices` are passed as the choices payload per master spec line 1673.
- Audit attribution unchanged (payload's `applied_by_email` / `applied_at_intent`).

### 3.3 Advisory-lock holder topology (mandatory enumeration)

For hashkey `show:<drive_file_id>`:

| Surface | Holder layer today | After F1 |
|---|---|---|
| Cron/manual/push sync | JS-side `withPostgresSyncPipelineLock` (`runScheduledCronSync.ts`) | unchanged |
| Dashboard staged Apply | JS-side locked tx, `applyStaged` runs lock-already-held | unchanged |
| Wizard finalize Phase B per-row tx | JS-side `pg_advisory_xact_lock` in the per-row tx (master spec line 2581 B.2) | same holder; the shared apply core is invoked lock-already-held and MUST NOT re-acquire |
| Wizard finalize-cas Phase D per-row apply | per-show advisory lock in Phase D loop (master spec line 2591 c) | same holder; shared core invoked lock-already-held |

Single-holder rule (AGENTS.md invariant 2) is preserved: the shared apply core never acquires locks itself. The plan MUST extend `tests/auth/advisoryLockRpcDeadlock.test.ts` if any new lock-acquiring surface appears, and assert the core is acquire-free.

**Milestone-wide lock-posture matrix (class-sweep after lock-topology findings in R1 and R3).** Every mutation surface this spec defines, with its single holder:

| Surface | Mutates | Holder |
|---|---|---|
| F1 Phase B per-row tx | shows + children | existing Phase B `pg_advisory_xact_lock` (master spec 2581 B.2); shared core acquire-free |
| F1 Phase D per-row apply | shows + children | existing Phase D per-row lock (master spec 2591 c); shared core acquire-free |
| F2 remediation migration | shows | the migration's own DO-block loop (§4) |
| F4 stale-session reap | shows (interim rows), pending_syncs, pending_ingestions, deferred_ingestions, manifest, shadows, checkpoints | the reap tx, locks enumerated per affected `drive_file_id` (§6) |
| F5 retry-route hardening | manifest, deferred_ingestions, pending_ingestions | existing JS-side `withPostgresSyncPipelineLock` (retry/route.ts:73); F5 adds NO locks at all — per-statement currency predicates instead (§7), so the global lock-order rule (`app_settings` never acquired while holding a per-show lock) is never tested by this path |

### 3.4 What F1 explicitly does NOT change

- Phase A/B/C/D structure, batching, checkpoints, CAS protocol, Storage temp→canonical move, manifest lifecycle.
- Drive/Storage I/O placement (Phase D stays SQL-only; the full apply is pure SQL).
- `published` flip ownership (Phase D bulk UPDATE remains the sole writer for wizard-promoted rows).
- Diagram payload handling (payload diagrams already point at canonical Storage paths from Phase B's move).

## 4. F2 — Remediation for already-damaged shows

One-shot **data-only** migration (no schema change; `pnpm gen:schema-manifest` will be a no-op but is still run + committed per the post-migration checklist):

```sql
do $$
declare r record;
begin
  for r in
    select s.id, s.drive_file_id
      from public.shows s
     where s.last_seen_modified_time is not null
       and not exists (select 1 from public.crew_members cm where cm.show_id = s.id)
       and exists (select 1 from public.sync_audit sa
                    where sa.show_id = s.id
                      and sa.parse_result_summary->>'source' in ('onboarding_finalize', 'onboarding_finalize_cas')
                      and sa.staged_modified_time >= s.last_seen_modified_time)
     order by s.drive_file_id   -- deterministic lock order (deadlock prevention)
  loop
    perform pg_advisory_xact_lock(hashtext('show:' || r.drive_file_id));
    update public.shows set last_seen_modified_time = null where id = r.id;
  end loop;
end $$;
```

- **Advisory-lock compliance (R1 finding 2):** every `shows` mutation runs inside the per-show `show:<drive_file_id>` advisory lock (plan-wide invariant 2), including this migration — the loop acquires the lock per candidate in deterministic `drive_file_id` order before the UPDATE, so a concurrent cron/manual/push apply for the same file serializes rather than interleaving. The migration is a one-shot single-transaction holder; no other layer acquires within it (single-holder rule preserved). The F2 plan task inherits the §3.3 lock-topology test requirement, not just F1/F5.
- **Eligibility = corrupted state, not audit purity (R7 finding 1).** Condition: zero `crew_members` AND a wizard-finalize audit row whose `staged_modified_time` is at-or-after the current watermark — i.e., the wizard was the LAST content writer. An earlier "no non-wizard audit rows exist" condition was rejected: any later non-wizard audit row (asset-recovery write, partial probe) would permanently exclude a still-damaged show, leaving it watermarked-as-current forever. A show whose watermark advanced past every wizard audit was re-applied by a real sync (which writes children), so exclusion is then correct; a zero-crew show in that state has a genuinely crew-less sheet. Idempotent: after backfill, crew exists → no-op; watermark-nulled rows fail the `is not null` guard → no-op. Required regression: a damaged wizard show WITH a later non-wizard audit row (not advancing the watermark) is still reset; a show whose watermark advanced past the wizard audit is untouched.
- Effect: next cron pass fails the watermark gate (`last_seen_modified_time is null` branch, `runScheduledCronSync.ts:950-955` / `perFileProcessor.ts:214`) and runs the full pipeline; backfilled crew lands in the Changes feed as additions (already-shipped feed semantics).
- Applies to the six validation shows; in production (no wizard-onboarded shows yet) it is a no-op.
- Migration must be applied to the validation project surgically (`supabase db query --linked` / psql) per the validation-schema-parity discipline; `notify pgrst, 'reload schema'` afterward.

## 5. F3 — Re-apply page "already resolved" state

`app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx:125` currently calls `notFound()` when the `pending_syncs` row for `(wizardSessionId, driveFileId, wizard_approved = false)` is gone — which is the NORMAL post-Apply state, reached via stale tabs/back-navigation (observed 2026-06-10).

Replace with a rendered state page (same layout shell as the page's existing infra-error state, page.tsx:104-121):

- Heading: "This sheet is already taken care of." Body: "It was applied or set aside — possibly from another tab. Nothing else is needed here." Two links: "Back to setup" (`/admin/onboarding`) and "Go to dashboard" (`/admin`).
- Guard conditions: `wizardSessionId` or `driveFileId` malformed/unknown → same state page (it is indistinguishable from "consumed" without leaking row existence; copy stays generic). Infra error path unchanged.
- No new §12.4 code: this is a state page, not an error-code rendering; no raw codes appear (invariant 5 satisfied vacuously). If adversarial review prefers a cataloged code, that is a §12.4 three-lockstep change and must be costed explicitly — do not relitigate silently (§8).

## 6. F4 — Stale checkpoint / orphaned shadow cleanup

Current debris in validation: 18 `wizard_finalize_checkpoints` rows stuck `in_progress` + 18 `shows_pending_changes` rows, all from synthetic e2e fixtures (`drive_file_id like 'drive-%'`), sessions never finalized.

- **Session-scoped stale-debris reap (R2 finding 2 — do NOT loop the existing cleanup).** `cleanupAbandonedFinalize` (`lib/onboarding/sessionLifecycle.ts:321`, guards `session_too_fresh` / `finalize_active_within_last_hour` at :350/:369) is NOT reusable as-is for multi-session reaping: it calls `purgeWizardRows` (:147-152, invoked at :425), which deletes wizard-scoped `pending_syncs` / `pending_ingestions` / `deferred_ingestions` across ALL sessions and truncates `onboarding_scan_manifest` UNCONDITIONALLY — safe only under the one-active-session assumption it was built for. Looping it over stale sessions would erase the active session's staging. The reap is therefore a NEW, strictly session-scoped path: for each eligible stale session (checkpoint `status <> 'final_cas_done'`, NOT the active `app_settings.pending_wizard_session_id`, no batch activity within the existing one-hour guard window), delete ONLY that session's `wizard_finalize_checkpoints`, `shows_pending_changes`, session-scoped manifest rows, and session-scoped `pending_syncs`/`pending_ingestions`/`deferred_ingestions` (every DELETE carries `wizard_session_id = $session`); plus the existing first-seen interim-row delete semantics (`published = false` rows for that session's applied manifest entries, per the :381 shape). It NEVER rotates `app_settings` and NEVER calls `purgeWizardRows`. **Lock topology (R3 finding 1; R5 finding 1):** before any DELETE, the reap collects every affected `drive_file_id` for the session — the union across `onboarding_scan_manifest`, `shows_pending_changes`, `pending_syncs`, `pending_ingestions`, AND `deferred_ingestions` (a stale session can hold ONLY a deferred row — the F5 commit-window residue is exactly that shape; enumeration shape per the existing `lockCleanupDriveFiles`, sessionLifecycle.ts:154+) — and acquires `pg_advisory_xact_lock(hashtext('show:' || drive_file_id))` for each in deterministic alphabetical order within the reap transaction; the reap is the single holder (no nested acquirer). **Eligibility extension (R5 finding 2, sweep half):** beyond non-terminal-checkpoint sessions, orphan session-scoped rows (`deferred_ingestions`/`pending_syncs`/`pending_ingestions`/manifest) whose `wizard_session_id` is neither NULL nor the active `app_settings.pending_wizard_session_id` are reapable REGARDLESS of that session's checkpoint status — including `final_cas_done` and checkpoint-less sessions — since the F5 residue's superseding event is typically a final-CAS. Required preservation tests: an active session and a fresh (`session_too_fresh`-window) session retain ALL pending/manifest/shadow rows while an eligible stale session's debris is fully removed; a stale session whose ONLY row is a `deferred_ingestions` row is reaped under its show lock; the lock-topology structural test covers this surface. Surface: the existing cleanup-abandoned-finalize admin affordance + route (`app/api/admin/onboarding/cleanup-abandoned-finalize/[sessionId]/route.ts`) gains a sibling "clean up stale sessions" action; exact UI placement is plan-level (UI work = Opus per routing rule).
- **One-time purge** of the current 18+18 synthetic rows rides the F2 migration (delete checkpoints + shadows for non-active sessions whose every shadow `drive_file_id` is `like 'drive-%'` — fixture-prefix-scoped so it can never touch real Drive ids).

## 7. F5 — BL-WIZARD-SESSION-CAS-TURNOVER-RACE (promoted from BACKLOG.md)

Promotion condition (c) of the backlog entry is met: the M-onboarding-fixups milestone is now scheduled.

**Current-state correction (the backlog entry is partially stale).** Since the entry was filed (2026-05-24), M12 R41-R9/R11/R16 hardened the route: `transitionManifestRow` now runs FIRST, as a CAS UPDATE whose predicate embeds `EXISTS (app_settings.pending_wizard_session_id = $session)`, and a 0-row outcome returns the EXISTING typed code `WIZARD_SESSION_SUPERSEDED` 409 (`app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts` `transitionManifestRow`; code already cataloged at `lib/messages/catalog.ts:133` — NO new §12.4 row is needed). All three mutations already share one transaction.

**The remaining window:** under READ COMMITTED, the `EXISTS` subquery reads the `app_settings` row at statement time without locking it. A concurrent finalize/new-scan can supersede the session between that statement and this transaction's commit; the stale deferral upsert + pending-ingestion delete still commit. Scope of the fix, per the backlog's own prescription:

- **Per-statement currency predicates, NO new locks (R4 finding 1 supersedes the backlog's lock-then-act options).** Locking `app_settings` inside the retry route would invert the established lock order — `cleanupAbandonedFinalize` acquires `finalize:` advisory lock → `app_settings FOR UPDATE` (sessionLifecycle.ts:331-340) → per-show advisory locks (:374), while the retry route holds the per-show lock from entry (`withPostgresSyncPipelineLock`, retry/route.ts:73) — a concurrent retry-vs-cleanup deadlock. The design instead: embed the session-currency `EXISTS (app_settings.pending_wizard_session_id = $session)` predicate (the shape `transitionManifestRow` already uses) in ALL THREE mutating statements (manifest UPDATE — already done; deferral upsert; pending-ingestion delete); any 0-row outcome rolls the transaction back and returns `WIZARD_SESSION_SUPERSEDED` 409. **Explicitly weakened guarantee (R5 finding 2).** This design does NOT close the commit window: a supersession committing between the last predicate-checked statement and this transaction's commit still commits the stale deferral/delete and returns 200. The guarantee is therefore stated in two halves: (i) any supersession visible at statement time → 0-row → rollback → typed 409, nothing commits; (ii) a commit-window supersession leaves residue that is **provably inert and swept**: the residual deferral row carries a non-NULL `wizard_session_id`, and the live sync gate reads ONLY `wizard_session_id IS NULL` deferrals (`readLiveDeferral`, `lib/sync/perFileProcessor.ts:103-114`), so the residue can never suppress live sync; the pending-ingestion delete targets a row the superseding purge already removed, so it no-ops; the F4 reap's orphan-row eligibility (§6) sweeps the deferral regardless of the superseding session reaching `final_cas_done`. Closing the window outright would require an `app_settings` row lock in a path that already holds a per-show advisory lock — the R4-1 deadlock inversion — or SERIALIZABLE; both rejected as disproportionate to inert debris. Required tests: (a) flip before any mutating statement → typed 409, nothing commits; (b) flip inside the commit window → residue exists, a regression pins that `readLiveDeferral` cannot see it (the inertness proof), and the F4 reap removes it.
- **Audit trail**: `admin_alerts` row with superseded vs current session ids when the 0-row path fires (catalog completeness meta-test `tests/messages/_metaAdminAlertCatalog.test.ts` gains the row).
- **Global lock-order rule, pinned in the spec:** no path acquires the `app_settings` row lock while holding a per-show advisory lock; paths needing both acquire `app_settings` first (cleanup's existing order, sessionLifecycle.ts:331-374). F5 itself acquires no locks, so it never tests this rule; the rule exists so future work doesn't reintroduce the R4-1 inversion.
- The sibling consumers the route comment names (`requireCurrentWizardRow`, `lib/sync/discardStaged.ts`) get a class-sweep for the same statement-vs-commit window before the plan is drafted (class-sweep-before-patching rule).

## 8. Disagreement-loop preempts (do not relitigate)

- **Finalize applies children including crew** — ratified at master spec §6.8.1 line 1665 (4L = §5.2 snapshot replacement) + line 1673 ("exactly as live Apply step 4L would") + line 2591 payload enumeration. The `UPDATE shows SET <payload-columns>` phrasing at 2591(c) is the documented internal tension; this spec resolves it toward 4L. Reviewer findings proposing "children were intentionally deferred to first sync" must cite spec text newer than these lines.
- **D-2 feed/MI-11 reuse** — owner decision 2026-06-10; do not propose the "apply silently" or "feed-without-holds" variants.
- **First-seen branch writes no feed rows** — intentional asymmetry, §3.1 last bullet (feed documents changes to live shows; first-seen rows are unpublished until Phase D).
- **F3 ships page copy, not a §12.4 code** — escalate as an explicit costed alternative if disputed, don't assume.
- **Remediation uses watermark-null, not `requires_resync`** — `requires_resync` is a publish-gate flag (B2 lifecycle, `app/admin/show/[slug]/_actions/publish.ts:6`), not a re-parse trigger; the watermark-null idiom is precedented at `supabase/migrations/20260608000004_retire_live_pending_syncs.sql:34`.
- **Phase D per-row best-effort commit independence is ratified** — master spec line 2591(c) ("ROLLBACKs only that show, leaves the staged row…") + line 2581 B.1 (sibling best-effort) + line 2587 (per-row transactions chosen over batch-wide tx for lock-contention reasons). Findings proposing all-or-nothing Phase D or cross-row compensation must cite spec text superseding these lines. The multi-shadow regression in §3.2 pins the ratified behavior, including that an earlier committed row PERSISTS when a later row CAS-fails.
- **F5's commit-window residue is accepted, not closed** — §7's explicitly weakened guarantee with the `readLiveDeferral` inertness proof + F4 sweep; do not re-propose SERIALIZABLE or app_settings locking from a per-show-locked path (the R4-1 inversion).

## 9. Meta-test inventory (pre-declared for the plan)

| Registry | Action |
|---|---|
| `tests/auth/advisoryLockRpcDeadlock.test.ts` | EXTEND: pin that the shared apply core acquires no advisory locks; add the F5 RPC if it acquires any. |
| `tests/auth/_metaInfraContract.test.ts` | EXTEND: registry rows for any new Supabase call boundaries (F4 reap reads, F5 RPC caller). |
| `tests/messages/_metaAdminAlertCatalog.test.ts` | EXTEND: F5 `admin_alerts` row. |
| `tests/db/postgrest-dml-lockdown.test.ts` | EXTEND if F5's RPC gates a table that still grants `authenticated` DML. |
| NEW structural guard | A meta-test asserting no file outside the shared apply module issues `insert into public.shows` / child-table snapshot-replacement SQL (the "second copy" tripwire that would have caught this bug at introduction). Walks `app/api/**` + `lib/**`, not a lexical file list. |

## 10. Testing spine (headline assertions; full TDD breakdown is plan-level)

1. **End-to-end first-seen finalize:** stage a wizard session from a fixture sheet; finalize; assert `crew_members`/`rooms`/`hotel_reservations`/`contacts`/`transportation`/`shows_internal` row counts and contents equal the staged `parse_result` (expectations derived from the fixture, never hardcoded); assert `published=false` pre-Phase-D and `true` after.
2. **Negative regression:** the test fails against the current bespoke-INSERT implementation (verified by writing it first, TDD invariant 1).
3. **Existing-show Phase D apply:** shadow payload with (a) a benign change → feed row written, applied; (b) an MI-11-eligible change with a reviewer choice → identical behavior to dashboard Apply with that choice; (c) CAS-stale live row → `STAGED_PARSE_OUTDATED_AT_PHASE_D`, no partial child writes.
4. **F2 migration:** seeded damaged show (wizard-only audit, zero crew) gets watermark-nulled; seeded healthy show and seeded manually-synced show untouched; apply-twice idempotent.
5. **F3:** consumed-row state renders the resolved page (200), not 404; malformed ids render the same page; infra error path unchanged.
6. **F4:** stale non-active `in_progress` session reaped; active session and fresh sessions refused per existing guards.
7. **F5:** the backlog's prescribed race harness.
8. **Anti-tautology:** every assertion above states its concrete failure mode in the plan task body; DOM-scanning tests (F3) scope their extraction per the established rule.

## 11. Out of scope

- Agenda-viewer behavior (resolves via crew backfill; no code change).
- The `slug-*`/`sh-*` synthetic show debris in validation (test data, not product).
- `shows_internal` read surfaces (persisting warnings is F1; surfacing them in admin UI is future work — file to BACKLOG if wanted).
- Any change to cron/push/manual sync semantics.

## 12. Decomposition note

F1+F2 are one coherent plan phase-set (shared apply core, then both writers, then remediation). F3+F4 are small independent phases. F5 is an independent phase with its own RPC + migration. One milestone plan with 5 phases is the expected shape; if adversarial review judges the surface too broad, split F5 into its own plan first — F1-F4 stay together.
