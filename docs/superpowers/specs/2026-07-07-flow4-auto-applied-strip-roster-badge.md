# Flow 4.2 + 4.3 — Recently-auto-applied strip + roster-shift badge

**Status:** Draft (autonomous ship; user spec-review gate WAIVED per `/ship-feature` consent)
**Date:** 2026-07-07
**Worktree:** `/Users/ericweiss/fxav-flow4-strip` · branch `feat/flow4-auto-applied-strip` (off `origin/main` `13df05f33`)
**Audit source:** `docs/audits/e2e-real-world-variation-preparedness-2026-07-07.md` §6 Flow 4 (grade C−, target A−), items **4.2** + **4.3**.
**Predecessor:** Flow 4.1 (gate single-crew drops on published shows) shipped + merged as its own PR.

---

## 1. Problem

Flow 4 is "re-sync that changed data on a live show." Two gaps remain after 4.1:

- **4.2** — When the cron sync auto-applies an unambiguous crew change (add / rename / field edit), it happens **silently**. There is a per-show Changes feed, but no cross-show surface that says "here's what we changed automatically while you weren't looking — glance and disposition." Doug has no single place to catch a bad auto-apply.
- **4.3** — A show whose **roster** (crew membership) shifted since Doug last looked gives no signal on the dashboard. The `DataQualityBadge` (amber ⚠) lights only for *parse* data-gaps, not for "someone got added/removed/renamed under you."

## 2. Goal

1. **4.2 strip** — A "Recently auto-applied" subsection in the dashboard's right-hand Needs-attention column: cross-show, grouped by show, listing auto-applied changes that are **not yet dispositioned**, each with **Accept** / **Undo** (and group-level **Accept all** / **Undo all**).
2. **4.3 badge** — Fold a **roster-shift** input into the existing `DataQualityBadge` so a published show with un-dispositioned roster-membership changes shows amber **until Doug dispositions them** (Accept, Undo, or a sheet-edit that supersedes). No time-decay.

Both share one new piece of per-row state (`show_change_log.acknowledged_at`) and one new mutation (`acknowledge_changes` RPC). Undo reuses the shipped `undo_change` RPC + `UndoChangeButton` verbatim.

## 3. Non-goals

- No in-app crew editing. The durable fix for a wrong auto-apply is still editing the Google Sheet; Undo only reverses + holds (§6.3).
- No new `admin_alerts` code, no new §12.4 catalog code (§9).
- No changes to the cron decision rules, MI invariants, or the per-show Changes feed's own rendering.
- No badge on **unpublished/draft** shows for roster-shift (drafts are expected to churn). Data-gap badge behavior on drafts is unchanged.
- `section_shrunk` and `asset_drift` change-kinds are **out of scope** for the strip (not crew/field edits). Strip scope is exactly: `crew_added`, `crew_removed`, `crew_renamed`, `crew_email_changed`, `field_changed`.

---

## 4. Grounding — verified live-code citations

Every claim below was grepped against the worktree before drafting (project "live-code citation pass" rule).

| # | Fact | Citation |
|---|------|----------|
| G1 | `show_change_log` DDL; columns id, show_id, drive_file_id, occurred_at, source, change_kind, entity_ref, summary, before_image, after_image, status, undo_of, created_by | `supabase/migrations/20260608000001_show_change_log.sql:7-20` |
| G2 | `status` CHECK = `('applied','pending','rejected','undone','superseded')` | `…20260608000001_show_change_log.sql:28-29` |
| G3 | `source` CHECK = `('auto_apply','mi11_approve','mi11_reject','undo')` | `…20260608000001_show_change_log.sql:25-26` |
| G4 | `change_kind` CHECK is open-ended (`length(change_kind) > 0`) — NOT an enum | `…20260608000001_show_change_log.sql:34-35` |
| G5 | `acknowledged_at` / `acknowledged_by` do **not** exist yet | grep empty |
| G6 | `individually_undoable boolean not null default true` | `…20260608000005_show_change_log_individually_undoable.sql:14-15` |
| G7 | `revoke all on table public.show_change_log from anon, authenticated` (reads AND writes locked from PostgREST roles) | `…20260608000001_show_change_log.sql:42` |
| G8 | DML-lockdown meta-test pins `show_change_log`; read-lockdown test exists | `tests/db/postgrest-dml-lockdown.test.ts:297-298`; `tests/db/feed-tables-read-lockdown.test.ts` |
| G9 | `public.is_admin()`, `public.auth_email_canonical()` | `…20260501002000_rls_policies.sql:23`, `:11` |
| G10 | `undo_change(p_change_log_id uuid)`: revoke from public,anon; grant execute to authenticated; is_admin-gated; undoable set = crew_added/removed/renamed | `…20260608000003_undo_change_rpc.sql:89,138,294-295` |
| G11 | `queryChangeLog` selects `id,show_id,drive_file_id,occurred_at,source,change_kind,entity_ref,summary,status`; filters showId/sinceHours/limit only; does NOT select `acknowledged_at`, does NOT filter source/status | `lib/observe/query/changeLog.ts:12-13,41,48-52` |
| G12 | `undoChange(changeLogId: string): Promise<{ok:true;showId?:string}\|{ok:false;code:string}>` | `lib/sync/holds/undoChange.ts:24,46` |
| G13 | `undoChange` calls `.rpc("undo_change",{p_change_log_id})`; NO JS-side advisory wrap (relies on in-RPC self-lock); sole JS caller | `lib/sync/holds/undoChange.ts:54` |
| G14 | `UndoChangeButton` props: `changeLogId: string`, `undoAction: UndoServerAction` (`(prev, formData) => UndoButtonResult`); renders `<ErrorExplainer code=… surface="admin" />` on failure | `components/admin/UndoChangeButton.tsx:45-53,68` |
| G15 | `DataQualityBadge` props `{ slug: string; dataGaps: DataGapsSummary \| undefined }`; returns null when `!dataGaps \|\| total===0` | `components/admin/DataQualityBadge.tsx:9-16` |
| G16 | `DataGapsSummary = { total: number; classes: Record<GapCode, number> }`; `formatDataGapBreakdown` | `lib/parser/dataGaps.ts:60,173` |
| G17 | `ActiveShowRow.dataGaps?: DataGapsSummary` | `lib/admin/showDisplay.ts:50` |
| G18 | dataGaps computed `summarizeDataGaps(args.parseResult.warnings)`, persisted as `data_gaps` | `lib/sync/runScheduledCronSync.ts:2279,2292` |
| G19 | `loadNeedsAttention(): NeedsAttention \| {kind:"infra_error";message}`; `RENDER_CAP = 20` | `lib/admin/loadNeedsAttention.ts:28,30`; `lib/admin/needsAttention.ts:21,122` |
| G20 | Dashboard two-col split; `<NeedsAttentionInbox>` render site | `components/admin/Dashboard.tsx:553,690` |
| G21 | Observability infra: `AUDITABLE_MUTATIONS` registry, static + behavioral meta-tests, `logAdminOutcome` | `tests/log/_auditableMutations.ts`; `tests/log/_metaMutationSurfaceObservability.test.ts`; `tests/log/adminOutcomeBehavior.test.ts`; `lib/log/logAdminOutcome.ts:27` |
| G22 | `UNDO_SUPERSEDED`, `UNDO_EMAIL_CLAIMED`, `UNDO_NOT_FOUND` present in catalog; undo infra maps to `SYNC_INFRA_ERROR` | `lib/messages/catalog.ts:931,944,957`; `lib/sync/holds/undoChange.ts:37` |
| G23 | `shows`: PK `id`, `published boolean not null default true` | `…20260501000000_initial_public_schema.sql:4,26` |

---

## 5. Data model

### 5.1 New columns (per-row disposition)

```sql
alter table public.show_change_log
  add column if not exists acknowledged_at  timestamptz,
  add column if not exists acknowledged_by  text;
```

- **Nullable, no default.** NULL = un-dispositioned. Stamped on Accept.
- No CHECK change (status/source/change_kind CHECKs untouched — G2/G3/G4). **No CHECK/enum migration matrix applies.**
- `acknowledged_by` holds a canonical admin email (`auth_email_canonical()`, G9) on Accept — satisfies email-canonicalization invariant 3 at the write boundary. NULL for the backfill (no admin actor).
- **Clean-start backfill (one-shot, forward-only), in the SAME migration:**
  ```sql
  update public.show_change_log
     set acknowledged_at = now()
   where source = 'auto_apply' and status = 'applied' and acknowledged_at is null;
  ```
  Treats every auto-apply already committed *before this feature shipped* as reviewed, so **only post-deploy auto-applies surface** in the strip/badge. Without it, the no-decay badge (§6.4) would light amber for the entire historical `status='applied'` auto_apply backlog on first render — a flood. This is a **one-shot forward-only** step (migrations run once; NOT re-apply-idempotent by design — a manual re-run would re-ack genuinely un-dispositioned post-deploy rows, so it is guarded by the migration ledger, per the accepted one-shot-migration lifecycle). See D6/D8.

### 5.2 Disposition state machine (per `show_change_log` row)

A row is **un-dispositioned** ⇔ `source='auto_apply' AND status='applied' AND acknowledged_at IS NULL`.

| Action | Effect | Leaves strip? | Badge effect |
|--------|--------|---------------|--------------|
| **Accept** (`acknowledge_changes`) | `acknowledged_at=now(), acknowledged_by=<admin>` (WHERE still `status='applied'`) | yes | clears its contribution |
| **Undo** (`undo_change`, existing) | reverses crew row + writes `sync_holds` override; flips `status→'undone'` | yes | clears its contribution |
| **Sheet edit → next sync** | newer same-entity row supersedes via `cleanup_superseded_before_images` → `status→'superseded'` | yes (self-healing) | clears its contribution |
| No action | row persists (until above) | no | stays amber |

Accept never mutates crew (pure acknowledgment); Undo is the only verdict that changes crew + writes a hold. Both are terminal for the strip.

**Accept does NOT lock out a later Undo (R1-F2), by design.** `acknowledged_at` is a **strip/badge display filter only** — it is deliberately *not* consulted by `undo_change` (G10), which continues to gate solely on `status='applied'` + undoable kind. So an Accepted row remains undoable through the per-show Changes feed (the full history/control surface). This is a valid **soft→hard upgrade** ("I kept it" → "actually reverse it"), not a conflict: Accept sets `acknowledged_at` (no crew change); a subsequent Undo flips `status→'undone'` (crew reversed + hold) and leaves `acknowledged_at` set — a harmless, non-corrupting terminal state (both "acked" and "undone"; the strip filters it out either way). The strip itself never shows an Accepted row (it left on Accept), so the only place Undo-after-Accept is reachable is the per-show feed (deliberate) or a stale strip tab (inherent optimistic-UI staleness, identical to the existing feed's behavior). Pinned by a test (§12).

### 5.3 `acknowledge_changes` RPC

```sql
create or replace function public.acknowledge_changes(p_show_id uuid, p_ids uuid[])
  returns jsonb language plpgsql security definer
  set search_path = public, pg_temp as $$
declare v_rc int;
begin
  if not public.is_admin() then
    raise exception using errcode='42501', message='forbidden', hint='acknowledge_changes is admin-only';
  end if;
  if p_ids is null then
    raise exception using errcode='22004', message='p_ids must not be null';
  end if;

  update public.show_change_log
     set acknowledged_at = now(), acknowledged_by = public.auth_email_canonical()
   where show_id = p_show_id
     and source = 'auto_apply'
     and status = 'applied'
     and acknowledged_at is null
     and id = any(p_ids);
  get diagnostics v_rc = row_count;
  return jsonb_build_object('ok', true, 'count', v_rc);
end;
$$;
revoke all on function public.acknowledge_changes(uuid, uuid[]) from public, anon;
grant execute on function public.acknowledge_changes(uuid, uuid[]) to authenticated;
```

- **Always an explicit id set — no "NULL = all" convenience** (R1-F1 fix). `p_ids` is **required non-null**; it is exactly the set of un-dispositioned ids the loader computed **at render time** for the target group. Per-row Accept sends `ARRAY[id]`; **Accept-all sends the group's full render-time `acceptAllIds`** (§6.1). This closes the TOCTOU where a post-render cron auto-apply would be silently acknowledged by a stale tab's "Accept all": rows that arrived after the page rendered are simply not in `p_ids`, so they survive and keep the badge amber. An empty array acknowledges nothing (correct — no special-casing).
- **Idempotent, race-safe, no advisory lock.** The `WHERE status='applied' AND acknowledged_at IS NULL AND id = any(p_ids)` clause makes a double-submit, a concurrent supersede, or a concurrent undo a deterministic no-op. `show_change_log.acknowledged_at` is **not** in invariant-2's mandated lock set (shows/crew_members/crew_member_auth/pending_syncs/pending_ingestions), and this RPC touches nothing else — so it deliberately does **not** acquire `pg_advisory_xact_lock`. (Disagreement-loop preempt §11 D1.)
- **Grants mirror `undo_change`** (G10): revoke public/anon, grant authenticated, `is_admin()` body gate (raises 42501, no catalog code — same posture as undo/archive).
- **Scoped by `p_show_id`** so a stray/forged id from another show can't be acknowledged (defense-in-depth alongside is_admin + the `id = any(p_ids)` set).

### 5.4 Badge input (roster-shift count, per show)

Per **published, active** show, the dashboard fetch computes:

```
rosterShift = count of show_change_log rows WHERE
  show_id = <show> AND source='auto_apply' AND status='applied'
  AND acknowledged_at IS NULL
  AND change_kind IN ('crew_added','crew_removed','crew_renamed')
```

Represented as `RosterShiftSummary = { added: number; removed: number; renamed: number; total: number }` (all ≥0). `total===0` (or show unpublished) ⇒ no roster-shift contribution.

---

## 6. Behavior

### 6.1 4.2 strip — data + shape

- **Loader** `lib/admin/loadRecentAutoApplied.ts` (server-side, privileged client — reads are locked from authenticated, G7). Returns groups:
  ```ts
  type AutoAppliedRow = {
    id: string; changeKind: string; summary: string; occurredAt: string;
    undoable: boolean;            // changeKind ∈ {crew_added,crew_removed,crew_renamed} AND individually_undoable
  };
  type AutoAppliedGroup = {
    showId: string; slug: string; showName: string;
    rows: AutoAppliedRow[];       // display-capped (STRIP_RENDER_CAP), newest first
    acceptAllIds: string[];       // ALL un-dispositioned auto_apply ids for this show AS OF render
                                  //   (uncapped by display) — Accept-all's explicit p_ids (R1-F1)
    undoableIds: string[];        // undoable subset of the DISPLAYED rows (for Undo-all)
  };
  type RecentAutoApplied =
    | { kind: "ok"; groups: AutoAppliedGroup[]; renderedCount: number; overflowCount: number }
    | { kind: "infra_error"; message: string };
  ```
- **Filter:** `source='auto_apply' AND status='applied' AND acknowledged_at IS NULL AND change_kind IN (crew_added,crew_removed,crew_renamed,crew_email_changed,field_changed)`.
- **Window:** `occurred_at >= now() - interval '72 hours'` (display bound only — see §6.4 for why the badge is NOT window-bound).
- **Cap:** `STRIP_RENDER_CAP = 50` rows total across groups, newest-first; `overflowCount` drives a plain-text `"+N older changes not shown"` line (no link). Groups with zero displayed rows are omitted.
- **Summary text:** the stored `show_change_log.summary` is rendered **verbatim** (G1) — e.g. `Crew member Priya added`, `Crew member Bob renamed to Robert Chen`, `A field changed on this sync`. No re-derivation. (`field_changed`'s generic summary is a known limitation; enrichment filed to BACKLOG, not this PR.)

### 6.2 4.2 strip — actions per row

- **Accept** (all kinds): submits `acknowledge_changes(showId, [id])` via the dashboard-scoped `acceptChangeAction` (§7). On success the row leaves the strip (dashboard revalidate).
- **Undo** (undoable rows only — add/remove/rename): reuses `UndoChangeButton` + the `undoChange` **helper** verbatim (G12/G14), driven by a dashboard-scoped `undoFromDashboardAction` wrapper (§7 — the per-show `undoChangeAction` revalidates the wrong route). **Hidden entirely for `crew_email_changed` / `field_changed`** (not in `undo_change`'s undoable set, G10 — would always return `UNDO_NOT_FOUND`). This mirrors the feed's existing `canUndo` gate.
- **Group header:** show name + **Accept all** (`acceptAllAction` → `acknowledge_changes(showId, group.acceptAllIds)` — explicit render-time ids, R1-F1) + **Undo all** (client loops `undoFromDashboardAction` over the displayed `undoableIds` sequentially — each its own tx+lock, no nesting; dodges the M5-R20 nested-lock deadlock class). **Undo all confirms** (inline confirm: "Undo all N changes for this show?") because it mutates crew; **Accept all does not** (no mutation).
- A group with **no undoable rows** (all field/email) shows **Accept all** only — no Undo all.

### 6.3 Undo semantics (copy contract)

Undo reverses the DB crew row and writes a `sync_holds` `undo_override` (G10 body) so the next sync will not silently re-apply — it **does not edit the Google Sheet**. UI copy for Undo and its help text must not imply a sheet write. The durable correction remains a sheet edit (which self-heals, §6.4).

### 6.4 4.3 badge — visibility + no-decay

- `DataQualityBadge` gains an optional `rosterShift?: RosterShiftSummary` prop. Badge renders iff **`(dataGaps?.total ?? 0) > 0` OR `(rosterShift?.total ?? 0) > 0`**.
- Roster-shift contribution is populated **only for published shows** (§5.4). Unpublished shows: `rosterShift` undefined → no roster contribution (data-gap behavior unchanged).
- **No time-decay.** The badge is a pure function of current un-dispositioned roster state. It clears exactly when the last roster row is Accepted / Undone / superseded — never merely because time passed. (This is why 4.3 required per-row disposition state rather than a decay window; the 72h in §6.1 caps *strip display*, not the badge.)
- **Self-healing (roster rows only — R1-F4):** `cleanup_superseded_before_images` supersedes ONLY `crew_added` / `crew_removed` / `crew_renamed` rows (G10 tail — it filters `change_kind in (...)`). So for **roster-membership** rows, if Doug edits the sheet instead of clicking, the next sync's newer same-entity row supersedes the stale one → it drops from strip AND badge automatically; a *revert* surfaces as the reverse change (its own dispositionable row), not silent-zero. **`field_changed` / `crew_email_changed` rows do NOT self-heal** (cleanup doesn't touch them and they aren't undoable) — they persist in the strip until **Accept**. This is acceptable: those kinds don't drive the badge (badge is roster-only), and Accept is exactly the "seen it" affordance for them.
- **First-deploy behavior:** the §5.1 clean-start backfill stamps every pre-deploy `status='applied'` auto_apply row as acknowledged, so the first post-deploy render lights amber **only for auto-applies that land after deploy** — no historical flood. (Rows already undone/superseded/mi11-approved were never eligible anyway; the backfill additionally clears the never-undone applied backlog.)

### 6.5 Combined badge accessible name (invariant 5 — plain language, no raw codes)

- roster only: `Roster changed since last review: 1 added, 1 renamed` (omit zero-count segments; singular/plural per count).
- data-gap only (unchanged, G15/G16): `3 data gaps: <breakdown>`.
- both: `Roster changed since last review: 1 added, 1 renamed. 3 data gaps: <breakdown>`.
- Breakdown remains bounded by `formatDataGapBreakdown` (caps classes). Roster segment lists at most three counts (added/removed/renamed) → inherently bounded.

---

## 7. Server-action surface (two layers — R1-F3)

The live Undo surface is **two layers** (verified): a pure helper `lib/sync/holds/undoChange.ts` (calls the RPC, G12) wrapped by a **route-scoped form-action** `app/admin/show/[slug]/_actions/feed.ts:121 undoChangeAction(prev, formData)` that does `requireAdminIdentity()` → helper → `revalidateShow(showId)` + `revalidatePath("/admin/show/[slug]","page")` → post-commit `logAdminOutcome({code:"CHANGE_UNDONE", source:"admin.show.feed.undoChange", ...})`. The per-show wrapper **revalidates the wrong route** for a dashboard strip, so the strip needs its own dashboard-scoped wrappers.

### 7.1 New helper `lib/sync/holds/acknowledgeChanges.ts`

```ts
type AcknowledgeResult = { ok: true; count: number } | { ok: false; code: string };
export async function acknowledgeChanges(showId: string, ids: string[]): Promise<AcknowledgeResult>;
```
Calls `.rpc("acknowledge_changes", { p_show_id: showId, p_ids: ids })`, destructures `{ data, error }` (call-boundary invariant 9): returned-error → `{ok:false,code:'SYNC_INFRA_ERROR'}`; thrown → same typed infra path; raised 42501 (non-admin) → `{ok:false,code:'SYNC_INFRA_ERROR'}` (no user surface for a forbidden admin action — same as undo). Registered in the auth infra-contract meta-test.

### 7.2 New dashboard action module `app/admin/_actions/autoApplied.ts`

Three `(prev, formData) => Result` wrappers (mirror `feed.ts:121`, but revalidate the **dashboard** `/admin`), each `requireAdminIdentity()`-gated (⇒ admin mutation surfaces, invariant 10):

| Action | Body | Revalidate | `logAdminOutcome` |
|--------|------|-----------|-------------------|
| `acceptChangeAction` | `acknowledgeChanges(showId, [changeLogId])` | `revalidatePath("/admin","page")` | `{code:"CHANGES_ACKNOWLEDGED", source:"admin.dashboard.autoApplied.accept", actorEmail, showId, extra:{ids:1}}` |
| `acceptAllAction` | `acknowledgeChanges(showId, ids)` (ids from hidden field, the group's `acceptAllIds`) | `revalidatePath("/admin","page")` | `{code:"CHANGES_ACKNOWLEDGED", source:"admin.dashboard.autoApplied.acceptAll", actorEmail, showId, extra:{ids:n}}` |
| `undoFromDashboardAction` | `undoChange(changeLogId)` (reuse helper) | `revalidateShow(showId)` + `revalidatePath("/admin","page")` | reuse `{code:"CHANGE_UNDONE", source:"admin.dashboard.autoApplied.undo", ...}` |

- `CHANGES_ACKNOWLEDGED` is a **forensic `logAdminOutcome` code**, §12.4-EXEMPT via `_metaAdminOutcomeContract` (same class as `CHANGE_UNDONE`) — NOT a user-facing catalog code (§9 stands). `undoFromDashboardAction` reuses the existing `CHANGE_UNDONE` code with a new `source`.
- **Observability (invariant 10 — admin mutations):** `acceptChangeAction` + `acceptAllAction` + `undoFromDashboardAction` each registered in `AUDITABLE_MUTATIONS` (G21) with executable success-branch behavioral proof in `adminOutcomeBehavior.test.ts` (sink-spy records only after observing the code on the committed-success branch). Emits are POST-COMMIT, fail-open (`try/catch` best-effort), outside any tx — matching `feed.ts:136-146`.
- No new §12.4 code (§9). Idempotent no-op (`count===0`) is a **success**, never an error.
- The exact dashboard route segment for `revalidatePath` (`/admin` vs `/admin` with a page arg) is confirmed against `app/admin/page.tsx` at plan time.

---

## 8. File structure

**New**
- `supabase/migrations/2026XXXXXXXXXXXX_show_change_log_acknowledged.sql` — columns + backfill (§5.1) + `acknowledge_changes` RPC (§5.3).
- `lib/admin/loadRecentAutoApplied.ts` — strip loader (§6.1).
- `lib/sync/holds/acknowledgeChanges.ts` — Accept **helper** (§7.1).
- `app/admin/_actions/autoApplied.ts` — dashboard-scoped form-action wrappers `acceptChangeAction` / `acceptAllAction` / `undoFromDashboardAction` (§7.2).
- `components/admin/RecentAutoAppliedStrip.tsx` — strip UI (groups/rows/group controls).
- `components/admin/AcceptChangeButton.tsx` — Accept button (mirror `UndoChangeButton`, `useActionState`).

**Modified**
- `components/admin/Dashboard.tsx` — fetch `loadRecentAutoApplied` + per-show `rosterShift`; render `<RecentAutoAppliedStrip>` after `<NeedsAttentionInbox>` (G20 `:690`), concurrently with existing fetches.
- `components/admin/DataQualityBadge.tsx` — add `rosterShift` prop; OR into visibility; merge aria-label (§6.5).
- `lib/admin/showDisplay.ts` — add `rosterShift?: RosterShiftSummary` to `ActiveShowRow` (G17); populate from the dashboard aggregate.
- `tests/log/_auditableMutations.ts` — register `acceptChangeAction`, `acceptAllAction`, `undoFromDashboardAction`.
- `tests/auth/_metaInfraContract.test.ts` — register `acknowledgeChanges` helper (call-boundary invariant 9).
- `supabase/__generated__/schema-manifest.json` — regen (`pnpm gen:schema-manifest`) + commit; migration applied surgically to validation project (validation-schema-parity gate).

---

## 9. Error-code / §12.4 posture

**No new §12.4 code, no catalog row, no `gen:spec-codes` change.** Rationale:
- Accept is idempotent → no user-facing failure mode (a no-op is success).
- Accept infra faults reuse the existing `SYNC_INFRA_ERROR` (G22) via `ErrorExplainer surface="admin"`.
- Undo reuses the shipped `UNDO_NOT_FOUND / UNDO_SUPERSEDED / UNDO_EMAIL_CLAIMED` (G22) unchanged.
- Non-admin (42501) is not surfaced (admin-only action; same as undo/archive).

(Disagreement-loop preempt §11 D2: a reviewer may expect a new `ACK_*` code. It is deliberately omitted; the idempotent-success design has no error state that needs one.)

---

## 10. Guard conditions (per prop / input)

| Input | null / empty / zero | Behavior |
|-------|---------------------|----------|
| `DataQualityBadge.dataGaps` | undefined or total 0 | no data-gap contribution (unchanged, G15) |
| `DataQualityBadge.rosterShift` | undefined or total 0 | no roster contribution; badge hidden iff data-gap also empty |
| both empty | — | `return null` (unchanged early-return) |
| `RecentAutoApplied.groups` | `[]` | strip subsection **not rendered** (no empty card) |
| `loadRecentAutoApplied` | `kind:'infra_error'` | strip renders a bounded inline error (reuse existing needs-attention infra-error treatment), never a raw code |
| `AutoAppliedGroup.rows` | all field/email (no undoable) | group shows Accept / Accept-all only; no Undo controls |
| `acknowledge_changes` | `p_ids=[]` (empty) | `id = any('{}')` matches nothing → `count:0` success (acks nothing) |
| `acknowledge_changes` | `p_ids IS NULL` | raises `22004` (guard) — there is no "NULL = all" path (R1-F1); every caller sends explicit ids |
| `acknowledge_changes` | row already acked / undone / superseded | WHERE excludes it → no-op success (also the Undo-after-Accept race, §5.2) |
| `undoChange` on field/email row | — | button not rendered; if forced, RPC returns `UNDO_NOT_FOUND` (safe) |

**Critical guard (R1-F1):** there is **no** accept-all-by-show-scope path. Accept-all sends the group's explicit render-time `acceptAllIds`, so a post-render cron auto-apply can never be acknowledged by a stale tab. `p_ids IS NULL` is rejected (`22004`); `p_ids='{}'` acks nothing. A dedicated test pins both (§12).

---

## 11. Disagreement-loop preempts (Watchpoints for review)

| # | Contract | Citation / rationale |
|---|----------|----------------------|
| D1 | `acknowledge_changes` intentionally takes **no advisory lock** | Mutates only `show_change_log.acknowledged_at`, not in invariant-2 lock set; race-safe via `WHERE status='applied'`. Adding a lock would create a new deadlock-class surface for zero benefit. |
| D2 | **No new §12.4 code** | §9; accept is idempotent-success, infra reuses `SYNC_INFRA_ERROR`. |
| D3 | Undo **hidden** for field/email rows (not disabled) | `undo_change` undoable set is add/remove/rename only (G10); rendering Undo would guarantee `UNDO_NOT_FOUND`. |
| D4 | Strip reads + Accept both go through **privileged server paths** (loader server-side, accept via SECURITY DEFINER RPC) | `show_change_log` reads AND writes revoked from authenticated (G7). PostgREST-DML-lockdown respected; no new REVOKE needed (table already locked). |
| D5 | Badge has **no time-decay**; 72h is display-only | §6.4. The per-row disposition state is the clear signal, deliberately chosen over a decay window. |
| D6 | `acknowledged_at` needs no CHECK migration; additive nullable columns | §5.1; status/source/change_kind CHECKs untouched (G2/G3/G4). |
| D7 | Undo-all loops per-row `undo_change` (no batch RPC) | Avoids nesting a second advisory-lock holder inside a batch (M5-R20 class). Sequential, each its own tx. |
| D8 | Clean-start backfill is **one-shot forward-only**, intentionally NOT re-apply-idempotent | §5.1; guarded by the migration ledger (runs once). A re-run would re-ack post-deploy rows — accepted per one-shot-migration lifecycle; not a defect. |
| D9 | Accept does **not** block a later Undo | §5.2 (R1-F2); `acknowledged_at` is a strip/badge filter, not an undo guard. Undo-after-Accept is a valid soft→hard upgrade, non-corrupting; `undo_change` stays unchanged. |
| D10 | Accept-all uses explicit **render-time** ids, never a show-scope "ack everything now" | §5.3 (R1-F1); closes the stale-tab TOCTOU. `acknowledge_changes` rejects NULL `p_ids`. |
| D11 | field/email strip rows do **not** self-heal | §6.4 (R1-F4); `cleanup_superseded_before_images` is roster-kind-only. They clear via Accept; they don't drive the badge. |

---

## 12. Test plan (TDD per task)

**DB / RPC**
- `acknowledge_changes`: stamps `acknowledged_at`/`acknowledged_by` on matching ids; idempotent (2nd call `count:0`); is_admin gate (42501 when not admin); filters `source`/`status` (won't ack a `mi11_approve` or already-`undone` row); `p_show_id` scoping (won't ack an id belonging to another show even if passed in `p_ids`); **`p_ids='{}'` acks nothing** (`count:0`); **`p_ids IS NULL` raises 22004** (no accept-all-by-scope path). Applied to local DB (invariant 1) + validation project.
- **TOCTOU (R1-F1):** given a render-time id set S, a row inserted AFTER (not in S) is NOT acknowledged by `acknowledge_changes(show, S)` — proves a stale-tab Accept-all cannot silently clear a post-render cron change.
- **Undo-after-Accept (R1-F2):** Accept a row (acknowledged_at set, status still `applied`), then `undo_change` on it SUCCEEDS (status→`undone`, crew reversed) — asserts `acknowledged_at` is not an undo guard and the sequence leaves a harmless acked+undone terminal state.
- **Clean-start backfill:** a pre-existing `status='applied'` auto_apply row is stamped `acknowledged_at` by the migration (excluded from strip/badge afterward); a row inserted *after* the migration keeps `acknowledged_at IS NULL` (still surfaces). Proves the flood-guard.
- postgrest-dml-lockdown meta-test still green with new columns (G8).

**Loader**
- `loadRecentAutoApplied`: groups by show; filters to un-dispositioned auto_apply of in-scope kinds; excludes acked/undone/superseded/mi11/undo-source rows; 72h window; `STRIP_RENDER_CAP` + overflow count; `acceptAllIds` covers ALL un-dispositioned ids as-of-render (incl. beyond the display cap), `undoableIds` only the displayed undoable subset; `undoable` flag true only for add/remove/rename with `individually_undoable`; `infra_error` path on client fault (call-boundary invariant 9).
- **Self-heal scope (R1-F4):** a roster row superseded by a newer same-entity change is absent from the loader result; a `field_changed` / `crew_email_changed` row is NOT superseded by `cleanup_superseded_before_images` and remains until acknowledged.

**Server actions (§7.2)**
- `acknowledgeChanges` helper: success `{ok:true,count}`; infra fault → `{ok:false,code:'SYNC_INFRA_ERROR'}` (returned-error AND thrown paths, invariant 9); registered in `_metaInfraContract`.
- `acceptChangeAction` / `acceptAllAction` / `undoFromDashboardAction`: **behavioral observability proof** — sink-spy records only after observing the forensic `code` (`CHANGES_ACKNOWLEDGED` / `CHANGE_UNDONE`) on the committed-success branch (invariant 10); revalidation called on success.
- Meta-test `_metaMutationSurfaceObservability` discovers all three new dashboard actions and passes **only** because their `AUDITABLE_MUTATIONS` rows exist (fails-by-default proven by removing a row in a scratch run).

**Badge (4.3)**
- Visibility truth table: (dataGaps only) → amber; (rosterShift only) → amber; (both) → amber; (neither) → null. Anti-tautology: assert against the prop inputs, not a container that renders both.
- Combined aria-label exact strings (§6.5) incl. zero-segment omission + singular/plural; roster-only, gap-only, both.
- Producer test: roster count excludes drafts (unpublished), excludes acked/undone/superseded/non-roster kinds; counts only un-dispositioned add/remove/rename. Derive expected from fixture rows, never hardcoded.

**Strip UI (4.2)**
- Renders one group per show, newest-first rows, verbatim summary.
- Per-row: Accept present for all kinds; Undo present for add/remove/rename, **absent** for field/email.
- Group: Accept-all always; Undo-all only when ≥1 undoable row; Undo-all confirm gate present.
- Empty groups → subsection not rendered (§10).

**Layout-dimensions task:** the strip is a normal-flow stacked list (no fixed-dimension parent with flex/grid children) — **no** real-browser `getBoundingClientRect` parity task required. Declared explicitly per the writing-plans rule ("None applies because the strip has no fixed-height parent constraining flex children").

**Transition inventory:** rows appear/disappear on disposition. States per row: {present, accepting(pending), undoing(pending), gone}. Pairs — present→accepting (instant, button→"Accepting…"), present→undoing (instant, existing UndoChangeButton pending), accepting→gone (row removed on revalidate — instant, no exit animation needed), undoing→gone (same). No compound cross-row animation. Declared instant; a transition-audit task confirms each conditional render has no orphaned animation expectation.

---

## 13. Plan-wide invariant checklist

1. **TDD per task** — every task failing-test-first (§12).
2. **Advisory lock** — `acknowledge_changes` deliberately outside the lock set (D1); Undo-all avoids nested holders (D7); topology **unchanged**; `advisoryLockRpcDeadlock.test.ts` needs **no** new row (declared).
3. **Email canonicalization** — `acknowledged_by = auth_email_canonical()` (G9).
4. **No global sync cursor** — untouched.
5. **No raw error codes in UI** — badge aria-label plain language (§6.5); errors via `ErrorExplainer`/`messageFor` (G14/G22).
6. **Commit per task** — conventional commits (`feat(admin):`, `feat(db):`, `test(admin):`, …).
7. **Spec canonical** — this doc; no plan/spec conflict.
8. **UI quality gate (impeccable v3 dual-gate)** — `DataQualityBadge`, `RecentAutoAppliedStrip`, `AcceptChangeButton`, `Dashboard` diff → `/impeccable critique` + `/impeccable audit` before Codex whole-diff review; HIGH/CRITICAL fixed or DEFERRED.md.
9. **Supabase call-boundary** — `acknowledgeChanges` destructures `{data,error}`, typed infra path (§7).
10. **Mutation-surface observability** — the three dashboard actions (§7.2) are admin mutations → AUDITABLE_MUTATIONS rows + behavioral proof + post-commit `logAdminOutcome`. New forensic code `CHANGES_ACKNOWLEDGED` is §12.4-EXEMPT via `_metaAdminOutcomeContract` (same class as `CHANGE_UNDONE`).

**Meta-test inventory:** EXTEND `tests/log/_auditableMutations.ts` (register the 3 dashboard actions); EXTEND `tests/auth/_metaInfraContract.test.ts` (register the `acknowledgeChanges` helper); rely on existing `_metaMutationSurfaceObservability` + `_metaAdminOutcomeContract` fails-by-default discovery. No new advisory-lock/email/sentinel/alert-catalog meta-test. postgrest-dml-lockdown (G8) already covers `show_change_log` — new columns don't change it.

**Numeric literals (single-source):** `STRIP_RENDER_CAP = 50`; strip window `72h`. Referenced by name in §6.1/§6.4/§10/§12; no other section restates the values.

---

## 14. Acceptance criteria

- AC-1: An auto-applied crew add/remove/rename on a published show appears in the strip **and** lights the amber badge on that show's dashboard row.
- AC-2: Accept (row) → row leaves strip, no crew change; if it was the last un-dispositioned roster row, badge clears.
- AC-3: Accept all → every un-dispositioned auto_apply row for the show (incl. past the display window) acked; badge clears; one click.
- AC-4: Undo (row) → crew reversed + hold written (existing behavior), row leaves strip; badge clears if last.
- AC-5: Undo all → all undoable rows in the group reversed sequentially; confirm gate shown first.
- AC-6: field/email rows show Accept but **no** Undo.
- AC-7: Editing the sheet (no button click) → next sync supersedes the stale **roster** row (add/remove/rename) → it disappears from strip + badge (self-healing). field/email rows do NOT self-heal (clear only via Accept) — asserted explicitly.
- AC-8: Unpublished show with roster changes → **no** roster badge (data-gap badge unaffected).
- AC-9: No new §12.4 code; `x1-catalog-parity` unaffected.
- AC-10: `acknowledge_changes` idempotent + admin-gated + show-scoped + `p_ids='{}'`≠accept-all (§10).
- AC-11: First deploy surfaces **no** historical backlog — the clean-start backfill marks pre-deploy applied auto_apply rows acknowledged; only post-deploy auto-applies light the strip/badge (§5.1, §6.4).
