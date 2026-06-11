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

- **Unit boundary:** extract the "apply a staged parse_result with reviewer choices under an already-held per-show lock" core so that `applyStaged` (dashboard) and Phase D (wizard) are two thin callers of one function. The shadow payload already carries everything the core needs: `parse_result`, `staged_modified_time`, `staged_id`, `reviewer_choices` (`stageExistingShowShadow`, finalize/route.ts:412-450).
- `baseModifiedTime` for the holds context = the payload's `staged_modified_time` (the wizard analogue of `args.binding.modifiedTime` in phase2).
- The existing CAS gate stays exactly where it is: `last_seen_modified_time IS NULL OR <= staged_modified_time`, failure code `STAGED_PARSE_OUTDATED_AT_PHASE_D`, per-row rollback, shadow row retained (finalize-cas/route.ts:276-305 semantics preserved).
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

### 3.4 What F1 explicitly does NOT change

- Phase A/B/C/D structure, batching, checkpoints, CAS protocol, Storage temp→canonical move, manifest lifecycle.
- Drive/Storage I/O placement (Phase D stays SQL-only; the full apply is pure SQL).
- `published` flip ownership (Phase D bulk UPDATE remains the sole writer for wizard-promoted rows).
- Diagram payload handling (payload diagrams already point at canonical Storage paths from Phase B's move).

## 4. F2 — Remediation for already-damaged shows

One-shot **data-only** migration (no schema change; `pnpm gen:schema-manifest` will be a no-op but is still run + committed per the post-migration checklist):

```sql
update public.shows s
   set last_seen_modified_time = null
 where not exists (select 1 from public.crew_members cm where cm.show_id = s.id)
   and exists (select 1 from public.sync_audit sa
                where sa.show_id = s.id
                  and sa.parse_result_summary->>'source' in ('onboarding_finalize', 'onboarding_finalize_cas'))
   and not exists (select 1 from public.sync_audit sa2
                where sa2.show_id = s.id
                  and coalesce(sa2.parse_result_summary->>'source', 'sync') not in ('onboarding_finalize', 'onboarding_finalize_cas'));
```

- Condition = "every audit writer was wizard finalize" AND "zero crew" — matches exactly the damage signature; idempotent (after backfill, crew exists → no-op on re-apply).
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

- **Extend `cleanupAbandonedFinalize`** (`lib/onboarding/sessionLifecycle.ts:321`, guards `session_too_fresh` / `finalize_active_within_last_hour` at :350/:369): it already deletes `shows_pending_changes` + `wizard_finalize_checkpoints` for an abandoned session (:376-401 region). Gap to close: cleanup is per-session and operator-initiated; checkpoints from sessions that were *superseded without cleanup* accumulate invisibly. Add a "stale finalize debris" reap to the existing admin cleanup entry point: sessions whose checkpoint is non-terminal (`status <> 'final_cas_done'`), is NOT the active `app_settings.pending_wizard_session_id`, and has no batch activity within the existing one-hour guard window are eligible; reap reuses the per-session cleanup (same deletes, same audit logging), looped over eligible sessions. Surface: the existing cleanup-abandoned-finalize admin affordance + route (`app/api/admin/onboarding/cleanup-abandoned-finalize/[sessionId]/route.ts`) gains a sibling "clean up all stale sessions" action; exact UI placement is plan-level (UI work = Opus per routing rule).
- **One-time purge** of the current 18+18 synthetic rows rides the F2 migration (delete checkpoints + shadows for non-active sessions whose every shadow `drive_file_id` is `like 'drive-%'` — fixture-prefix-scoped so it can never touch real Drive ids).

## 7. F5 — BL-WIZARD-SESSION-CAS-TURNOVER-RACE (promoted from BACKLOG.md)

Promotion condition (c) of the backlog entry is met: the M-onboarding-fixups milestone is now scheduled.

**Current-state correction (the backlog entry is partially stale).** Since the entry was filed (2026-05-24), M12 R41-R9/R11/R16 hardened the route: `transitionManifestRow` now runs FIRST, as a CAS UPDATE whose predicate embeds `EXISTS (app_settings.pending_wizard_session_id = $session)`, and a 0-row outcome returns the EXISTING typed code `WIZARD_SESSION_SUPERSEDED` 409 (`app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts` `transitionManifestRow`; code already cataloged at `lib/messages/catalog.ts:133` — NO new §12.4 row is needed). All three mutations already share one transaction.

**The remaining window:** under READ COMMITTED, the `EXISTS` subquery reads the `app_settings` row at statement time without locking it. A concurrent finalize/new-scan can supersede the session between that statement and this transaction's commit; the stale deferral upsert + pending-ingestion delete still commit. Scope of the fix, per the backlog's own prescription:

- **Lock-then-act protocol**: either (a) `SELECT pending_wizard_session_id FROM app_settings ... FOR UPDATE` inside the same transaction before the three mutations, or (b) a SECURITY DEFINER RPC taking the session id and CHECKing it per mutation. (a) is the minimal closure of the remaining window given the ordering hardening already in place; (b) remains the backlog's structural preference. Plan decides with an explicit trade-off note; either way the topology stays single-holder.
- **Regression test** per the backlog: flip `pending_wizard_session_id` between the manifest UPDATE and commit via a concurrent-transaction harness; assert no deferral/delete commits and the route returns `WIZARD_SESSION_SUPERSEDED`.
- **Audit trail**: `admin_alerts` row with superseded vs current session ids (catalog completeness meta-test `tests/messages/_metaAdminAlertCatalog.test.ts` gains the row).
- **PostgREST DML lockdown checklist**: if option (b) is chosen and the RPC gates mutations on tables still granting `authenticated` DML, add the REVOKE migration + `RPC_GATED_TABLES` registry row (`tests/db/postgrest-dml-lockdown.test.ts`) in the same commit.
- The sibling consumers the route comment names (`requireCurrentWizardRow`, `lib/sync/discardStaged.ts`) get a class-sweep for the same statement-vs-commit window before the plan is drafted (class-sweep-before-patching rule).

## 8. Disagreement-loop preempts (do not relitigate)

- **Finalize applies children including crew** — ratified at master spec §6.8.1 line 1665 (4L = §5.2 snapshot replacement) + line 1673 ("exactly as live Apply step 4L would") + line 2591 payload enumeration. The `UPDATE shows SET <payload-columns>` phrasing at 2591(c) is the documented internal tension; this spec resolves it toward 4L. Reviewer findings proposing "children were intentionally deferred to first sync" must cite spec text newer than these lines.
- **D-2 feed/MI-11 reuse** — owner decision 2026-06-10; do not propose the "apply silently" or "feed-without-holds" variants.
- **First-seen branch writes no feed rows** — intentional asymmetry, §3.1 last bullet (feed documents changes to live shows; first-seen rows are unpublished until Phase D).
- **F3 ships page copy, not a §12.4 code** — escalate as an explicit costed alternative if disputed, don't assume.
- **Remediation uses watermark-null, not `requires_resync`** — `requires_resync` is a publish-gate flag (B2 lifecycle, `app/admin/show/[slug]/_actions/publish.ts:6`), not a re-parse trigger; the watermark-null idiom is precedented at `supabase/migrations/20260608000004_retire_live_pending_syncs.sql:34`.

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
