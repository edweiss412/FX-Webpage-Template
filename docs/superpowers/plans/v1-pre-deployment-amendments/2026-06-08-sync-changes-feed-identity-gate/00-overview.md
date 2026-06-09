# Sync changes feed + identity-only gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape the sync staged-review pipeline so routine sheet changes auto-apply, only MI-11 (existing-crew email change) is gated, every change shows in a per-show changes feed, and each auto-applied crew-identity change has a per-item undo — all backed by one per-entity `sync_holds` mechanism that keeps the apply engine atomic.

**Architecture:** A new `sync_holds` table (per-entity identity holds) and `show_change_log` table (feed source + before/after images) plus hold-aware additions to `applyParseResult`. The Phase-1 decision rule stages IFF MI-11 fired (and even then only that crew's identity holds, while the rest of the parse auto-applies). Admin actions (Approve/Reject/Undo) go through lock-taking SECURITY DEFINER RPCs; the sync path writes holds via service-role SQL inside the existing show lock. Single advisory-lock holder per key, never nested.

**Tech Stack:** Next.js 16 App Router (server actions, RSC), Supabase Postgres (SECURITY DEFINER RPCs, RLS, advisory locks), TypeScript, vitest, Playwright (UI layout/e2e), framer-motion (existing). Spec: `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-08-sync-changes-feed-identity-gate-design.md` (adversarial-APPROVED Codex R9).

---

## Phase decomposition + routing

| Phase | File | Scope | Implementer |
|---|---|---|---|
| 1 | `01-tables-and-lockdown.md` | `sync_holds` + `show_change_log` migrations: DDL, CHECKs, indexes, REVOKE, RLS, RPC-gating registry rows; `validation-schema-parity` regen + apply to validation | **Codex** |
| 2 | `02-decision-rule-and-hold-aware-apply.md` | Phase-1 decision rule (stage IFF MI-11); `sync_holds` write on detect; hold-aware `applyParseResult` (identity pin, delete-suppression, fold rename/removal, proposed-target reservation); `show_change_log` write on auto-apply | **Codex** |
| 3 | `03-mi11-gate-rpcs.md` | Approve/Reject lock-taking RPCs; collision graph + swap-safe park; Drive-modifiedTime two-stage orchestration + failure contract; `base_modified_time` staleness guard | **Codex** |
| 4 | `04-undo-and-tombstone.md` | Undo lock-taking RPC; `before_image` capture (crew-domain); held-present restore + held-absent tombstone; release semantics | **Codex** |
| 5 | `05-feed-data-layer.md` | Server-only (service-role) feed read data layer/RPC over `show_change_log` + open `sync_holds`; entry shaping; cap/truncation | **Codex** |
| 6 | `06-ui-feed-gate-undo.md` | Changes-feed component, slimmed MI-11 gate card (replaces whole-parse `StagedReviewCard`), undo/approve-reject affordances; impeccable dual-gate | **Opus + impeccable** |

Per-phase the cross-model adversarial review pairs across the harness boundary (Codex phases reviewed by Opus-side review; the Opus UI phase reviewed by Codex). Whole-plan adversarial review (this plan) is mandatory before execution handoff (below).

---

## Shared contracts (every phase references these — keep signatures identical)

### Table: `public.sync_holds`
```sql
create table if not exists public.sync_holds (
  id                 uuid primary key default gen_random_uuid(),
  show_id            uuid not null references public.shows(id) on delete cascade,
  drive_file_id      text not null,
  domain             text not null,                 -- 'crew_email' | 'crew_identity'
  entity_key         text not null,                 -- crew name (old) for crew_email; prior crew name for crew_identity
  held_value         jsonb not null,                -- prior crew row (identity pinned; non-identity fields NOT pinned) | {absent:true,name,email} tombstone
  proposed_value     jsonb,                         -- mi11_pending disposition: {disposition:'email_change'|'rename'|'removal', name?, email?}; null for undo_override
  base_modified_time timestamptz,                   -- sheet modifiedTime proposed_value was read at (staleness guard)
  kind               text not null,                 -- 'mi11_pending' | 'undo_override'
  created_at         timestamptz not null default now(),
  created_by         text not null,                 -- canonicalized admin email | 'system'
  constraint sync_holds_domain_chk check (domain in ('crew_email','crew_identity')),
  constraint sync_holds_kind_chk   check (kind   in ('mi11_pending','undo_override')),
  constraint sync_holds_uniq unique (show_id, domain, entity_key)
);
create index if not exists sync_holds_show_idx on public.sync_holds (show_id);
```

### Table: `public.show_change_log`
```sql
create table if not exists public.show_change_log (
  id            uuid primary key default gen_random_uuid(),
  show_id       uuid not null references public.shows(id) on delete cascade,
  drive_file_id text not null,
  occurred_at   timestamptz not null default now(),
  source        text not null,                      -- 'auto_apply' | 'mi11_approve' | 'mi11_reject' | 'undo'
  change_kind   text not null,                      -- STRUCTURAL values only, NEVER 'MI-*'. Undoable crew-identity: 'crew_added'|'crew_removed'|'crew_renamed'. Gate-resolved (NOT undoable): 'crew_email_changed' (the MI-11 email-change row, approve/reject). Non-crew notification: 'field_changed'|'section_shrunk'|'asset_drift'. (resolution #3 + #13 + PF8; a /^MI-/ guard test enforces it.)
  entity_ref    text,                               -- crew name | section+key (per-item undo addressing)
  summary       text not null,                      -- rendered via lib/messages (no raw codes)
  before_image  jsonb,                              -- prior crew entity values (crew-domain only; null for non-crew rows)
  after_image   jsonb,                              -- applied values (feed display)
  status        text not null,                      -- 'applied' | 'pending' | 'rejected' | 'undone' | 'superseded' (resolution #18: a row goes non-actionable on undo OR when a newer same-entity change supersedes it)
  created_by    text not null default 'system',     -- 'system' for auto_apply; admin email (current_admin_email()) for mi11_approve/mi11_reject/undo (PF7)
  undo_of       uuid references public.show_change_log(id)
);
create index if not exists show_change_log_feed_idx on public.show_change_log (show_id, occurred_at desc);
-- CHECK constraints on source/change_kind/status added with DROP IF EXISTS + ADD (apply-twice idempotent).
```

### TypeScript types (canonical — define once, import everywhere; suggested home `lib/sync/holds/types.ts`)
```ts
export type HoldKind = "mi11_pending" | "undo_override";
export type HoldDomain = "crew_email" | "crew_identity";
export type Disposition =
  | { disposition: "email_change"; name: string; email: string | null }
  | { disposition: "rename"; name: string; email: string | null }
  | { disposition: "removal" };
export type SyncHold = {
  id: string; showId: string; driveFileId: string; domain: HoldDomain;
  entityKey: string; heldValue: unknown; proposedValue: Disposition | null;
  baseModifiedTime: string | null; kind: HoldKind; createdAt: string; createdBy: string;
};
export type ChangeLogSource = "auto_apply" | "mi11_approve" | "mi11_reject" | "undo";
export type ChangeStatus = "applied" | "pending" | "rejected" | "undone" | "superseded"; // 'superseded' = a newer same-entity change made this row non-actionable (resolution #18); feed → action='none', a distinct badge
// Gate payload for a PENDING mi11 entry — everything Phase 6 needs to mount Approve/Reject
// WITHOUT a second query (resolves PF14). Present iff action==='approve_reject'.
export type FeedGate = {
  holdId: string;            // sync_holds.id — the Approve/Reject RPC target
  disposition: Disposition;  // email_change | rename | removal (drives copy + which RPC effect)
};
export type FeedEntry = {
  id: string; occurredAt: string; status: ChangeStatus;
  summary: string; action: "undo" | "approve_reject" | "none"; entityRef: string | null;
  gate?: FeedGate;           // set ⟺ action==='approve_reject' (an open mi11_pending hold)
  changeLogId?: string;      // set ⟺ action==='undo' (the show_change_log.id passed to undo_change)
};
```
(Swap/collision groups + the `IDENTITY_WOULD_COLLIDE` conflict are resolved at Approve TIME by `mi11_approve_hold` — approving any group member approves the closed group atomically, a genuine duplicate returns the typed conflict — so the feed needs only `holdId`+`disposition` to mount the controls; no collision-graph duplication in the read path.)

### RPC signatures (SECURITY DEFINER, lock-taking via `pg_advisory_xact_lock(hashtext('show:'||drive_file_id))`)
```
mi11_approve_hold(p_hold_id uuid, p_observed_modified_time timestamptz) returns jsonb
  -- compares p_observed_modified_time to base_modified_time; applies proposed_value disposition;
  -- handles collision groups (atomic NULL/placeholder park); writes show_change_log; releases hold.
mi11_reject_hold(p_hold_id uuid)                returns jsonb  -- converts to undo_override; writes show_change_log
undo_change(p_change_log_id uuid)               returns jsonb  -- restore before_image | tombstone; writes undo row + undo_override hold
-- All return a typed discriminated result: {ok:true,...} | {ok:false, code:'<MESSAGE_CODE>'} (codes via lib/messages).
```

### Feed data layer (server-only, service-role)
```ts
// lib/sync/feed/readShowChangeFeed.ts
export async function readShowChangeFeed(showId: string, opts?: { limit?: number }):
  Promise<{ entries: FeedEntry[]; truncated: boolean; totalShown: number }>;
// Reads show_change_log + open sync_holds (pending MI-11). NEVER via PostgREST from(); RLS denies anon/authenticated.
```

---

## Meta-test inventory (CREATES / EXTENDS — declared up front)

- **EXTEND** `tests/db/postgrest-dml-lockdown.test.ts` — add `RPC_GATED_TABLES` rows + REVOKEs for `sync_holds` AND `show_change_log`.
- **EXTEND** `tests/auth/advisoryLockRpcDeadlock.test.ts` — pin the new admin lock-taking RPCs (`mi11_approve_hold`/`mi11_reject_hold`/`undo_change`) as single-layer holders never nested under a JS-held show lock.
- **AUTO** `validation-schema-parity` — `sync_holds` + `show_change_log` are new `public` tables → `pnpm gen:schema-manifest` + apply migrations to the validation project (gate reds until they land there).
- **CREATE** `tests/db/feed-tables-read-lockdown.test.ts` — RLS read posture: anon + non-admin authenticated get zero rows / RLS-denied on `sync_holds` + `show_change_log` (incl. `before_image`); admin server path returns them.

## Advisory-lock topology (mandatory — plan touches `pg_advisory*`)
Two entry points per show hashkey, single-holder each, never nested:
1. **Sync/apply path** — JS holder via `lib/sync/lockedShowTx.ts:57` (`pg_advisory_xact_lock`); hold reads/writes are **direct service-role SQL inside that txn**. NO nested lock-taking RPC.
2. **Admin path** (`mi11_approve_hold`/`mi11_reject_hold`/`undo_change`) — each RPC acquires the lock itself; invoked only OUTSIDE a JS-held lock. The Drive read for Approve happens in the JS server action BEFORE the RPC call (RPC can't read Drive).
`tests/auth/advisoryLockRpcDeadlock.test.ts` is extended to pin this.

## Plan-wide invariants touched
2 (advisory-lock single-holder), 3 (email canonicalization), 4 (no global cursor — untouched, `base_modified_time` is per-show), 5 (no raw error codes — feed/RPC copy via `lib/messages`), 7 (spec canonical), 8 (impeccable dual-gate on Phase 6 UI), 9 (Supabase call-boundary — every `{data,error}` destructured, Drive-read failure typed). Cross-cutting: PostgREST DML lockdown + RLS read lockdown on the two new RPC-gated tables.

## Mandatory plan tasks (per writing-plans + AGENTS.md)
- Each phase: TDD per task (failing test → minimal impl → pass → commit).
- **Anti-tautology** on every feed/hold assertion (assert against the data source, derive expectations from fixtures).
- **Layout-dimensions** real-browser Playwright assertion in Phase 6 (feed entries inside any fixed-dimension parent).
- **Adversarial review (cross-model)** task at the end of each phase AND a whole-plan adversarial review before execution handoff.
- Migrations land in the validation project + manifest regen in Phase 1 (do not defer — `validation-schema-parity` enforces).

## R9 plan-level follow-up (carry into Phase 2 tests)
Add a test for **rename-while-held + non-identity field edits in the SAME later sheet row**: the identity (name) holds while phone/role/etc. on that same row auto-apply.

---

## Authoritative resolutions (these OVERRIDE any differing assumption in a phase file)

Resolutions of the open questions the phase-drafting raised. The implementer treats this section as canonical.

**1. Migration allocation (distinct timestamps — no collisions; today is 2026-06-09):**
| File | Phase |
|---|---|
| `supabase/migrations/20260608000000_sync_holds.sql` | 1 |
| `supabase/migrations/20260608000001_show_change_log.sql` | 1 |
| `supabase/migrations/20260608000002_mi11_gate_rpcs.sql` | 3 |
| `supabase/migrations/20260608000003_undo_change_rpc.sql` | 4 |
Phase 2 is **TS-only** (no migration — hold-aware apply lives in `lib/sync/applyParseResult.ts` + the decision rule in `lib/sync/phase1.ts`); if it needs a helper RPC, allocate `…000004`. **NOTE:** Phase 3's migration is `…000002` (NOT `…000000`, which is Phase 1's `sync_holds` — a phase-file draft used the colliding `…000000`; this allocation governs). Phase 4's undo RPC migration is `…000003`. Every migration is applied to the **validation project** via `psql "$TEST_DATABASE_URL" -f <migration>` then `psql "$TEST_DATABASE_URL" -c "notify pgrst, 'reload schema'"`, and `pnpm gen:schema-manifest` is re-run + the manifest committed — **in the phase that adds the migration** (the `validation-schema-parity` gate reds otherwise). `supabase db push` is blocked on validation (Phase-0 history divergence) — do NOT use it.

**2. Identity vs non-identity fields (F17).** `crew_members` columns: `id, show_id, name, email, phone, role, role_flags, date_restriction, stage_restriction, flight_info, last_changed_at, claimed_via_oauth_at`. **Identity (held by an MI-11 hold) = `{name, email}`.** **Non-identity (follow the sheet, auto-apply during a hold) = `{phone, role, role_flags, date_restriction, stage_restriction, flight_info}`.** A rename's insert copies the non-identity set from the old row.

**3. `change_kind` taxonomy + the undoable set.** `change_kind` CHECK is `length(change_kind) > 0` (open-ended, not an enum).
- **Crew-identity — UNDOABLE** (action=`undo`, `before_image` captured): `crew_added`, `crew_removed`, `crew_renamed`. Map: MI-6 crew shrinkage → one `crew_removed` per removed member; MI-12/13/14 → `crew_renamed`; orphan-add → `crew_added`; orphan-remove → `crew_removed`.
- **Non-crew / field — NOTIFICATION-ONLY** (action=`none`, `before_image` null): `field_changed` (MI-8/8b/8c and **MI-9 LEAD** — a non-identity crew field, so not undoable per F17), `section_shrunk` (MI-7/7b), `asset_drift` (DIAGRAMS_*/REEL_DRIFT).
- Feed "undoable" predicate = `change_kind ∈ {crew_added, crew_removed, crew_renamed}`.

**4. Claim revocation.** The OAuth claim lives on `crew_members.claimed_via_oauth_at`; **deleting the crew row removes the claim** — so "revoke claim" on a removal/tombstone is the DELETE itself. `revokeRemovedCrewAuth` (`lib/sync/runScheduledCronSync.ts:1150`) is a **vestigial no-op stub** (`void showId; void names;`) from the dead signed-link model — do NOT rely on or chase it. If a path ever keeps the row but must drop a claim, `set claimed_via_oauth_at = null`.

**5. New `lib/messages` codes (§12.4 three-lockstep — add ALL in a Phase 1 task so later phases can reference them).** Each code lands as: master-spec §12.4 prose edit + `pnpm gen:spec-codes` (regen `lib/messages/__generated__/spec-codes.ts`) + matching `lib/messages/catalog.ts` row, all in one commit (the x1-catalog-parity gate enforces lockstep). Codes:
`MI11_TARGET_MOVED`, `MI11_DRIVE_RECHECK_FAILED`, `MI11_HOLD_ALREADY_RESOLVED`, `IDENTITY_WOULD_COLLIDE`, `UNDO_SUPERSEDED`, `UNDO_EMAIL_CLAIMED`, `UNDO_NOT_FOUND` (typed RPC/action result codes), plus feed pending-summary copy `mi11_pending_email_change` / `mi11_pending_rename` / `mi11_pending_removal` / `mi11_pending_rename_folded`.

**6. `StagedReviewCard` / whole-parse review removal scope (Phase 6).** `StagedReviewCard` + `ParsePanel` are STILL used by the wizard `first_seen` / `wizard_failed_reapply` modes — **do NOT remove them**. Phase 6 removes only the **per-show LIVE whole-parse review mount** (the path no invariant reaches anymore). Grep importers first. First-seen stays governed by `auto_publish_clean_first_seen` (unchanged).

**7. Advisory-lock test ownership.** Each phase that adds a lock-taking RPC extends `tests/auth/advisoryLockRpcDeadlock.test.ts` (its `migrationFiles`/topology list) in THAT phase: Phase 3 adds `mi11_approve_hold`/`mi11_reject_hold`; Phase 4 adds `undo_change`. The list accumulates.

**8. Feed cap vs pending holds (Phases 5/6).** Pending `mi11_pending` entries ALWAYS render (above the cap, actionable) and do NOT count toward `truncated`, which keys only off the `show_change_log` row count (default cap N=50). `undo_override` holds are NOT rendered as pending entries (their effect surfaces as `undone`/`rejected` log rows).

**9. `before_image` cleanup.** A per-apply function nulls the `before_image` of any prior `show_change_log` row superseded by a new change to the **same crew entity** (one-step retention) — chosen over a periodic reaper.

**10. RLS read posture (Phase 1, F9).** Deny-by-default RLS (enable RLS + no `select` policy for `anon`/`authenticated`) + `REVOKE` DML; the feed reads server-side as `service_role` (RLS-bypassing). Mirrors `email_deliveries`. No `is_admin()` PostgREST-SELECT policy (the feed never uses PostgREST `from()`).

**11. THREE identities — who runs what (resolves whole-plan finding PF1; canonical client/grant contract for ALL phases).**
- **Sync-path hold WRITES (Phase 2)** — system-initiated, no admin user: **direct `service_role` SQL inside the existing `lockedShowTx`** (JS lock holder). `created_by='system'`. REVOKE-exempt by role.
- **Admin mutation RPCs (Phase 3 `mi11_approve_hold`/`mi11_reject_hold`, Phase 4 `undo_change`)** — admin-user-initiated: SECURITY DEFINER, **`grant execute … to authenticated` (revoke from `anon`; do NOT grant to / rely on `service_role`)**, body **gates on `public.is_admin()`** (typed forbidden result if false) and stamps `created_by = public.current_admin_email()`. Called from the admin server action via the **cookie-bound authenticated Supabase server client** (the admin's session JWT — `lib/supabase/server.ts`) **after `requireAdmin`**, NOT the service-role client. `is_admin()` + `pg_advisory_xact_lock` both work inside a SECURITY DEFINER RPC invoked via PostgREST authenticated (JWT claims readable; lock taken in the body). Matches the repo's existing admin-RPC pattern (grep `is_admin()` + `security definer` in `supabase/migrations/`). The Approve action reads Drive `modifiedTime` in the server action BEFORE the RPC call (F13) and passes it as `p_observed_modified_time`.
- **Feed READS (Phase 5)** — server-side `service_role` (RLS-bypassing) per resolution #10.

**13. Schema-correctness pins (resolve whole-plan R2 — PF6/PF7/PF8).**
- **PF6 — `crew_members` column types for the undo restore.** `name/email/phone/role/flight_info` are **`text`** (use `v_before->>'col'`); `role_flags` is **`text[]`** (restore `coalesce(array(select jsonb_array_elements_text(v_before->'role_flags')), '{}')::text[]`); `date_restriction`/`stage_restriction` are **`jsonb`** (restore `v_before->'col'`, NOT `->>`). The Phase-4 phantom-column guard is extended to also assert the restore EXPRESSION is type-correct per column (not just that the name exists).
- **PF7 — `show_change_log.created_by`** is a real column (added above: `text not null default 'system'`). Phase 1's migration + schema test include it; auto-apply rows get `'system'`, admin RPC rows stamp `current_admin_email()`.
- **PF8 — `change_kind` is ALWAYS a structural value, NEVER `MI-*`** (whole-plan R3 closes the residual). The complete set: undoable crew-identity `{crew_added, crew_removed, crew_renamed}`; gate-resolved (not undoable) `crew_email_changed`; non-crew `{field_changed, section_shrunk, asset_drift}`. **Disposition → change_kind map for the MI-11 gate rows (Phase 3 `mi11_approve_hold`/`mi11_reject_hold`):** `email_change→'crew_email_changed'`, `rename→'crew_renamed'`, `removal→'crew_removed'` (status `applied` on approve, `rejected` on reject). The undoable predicate `isCrewDomainChangeKind` = `{crew_added, crew_removed, crew_renamed}` AND `status='applied'`. NO writer (Phase 2/3/4) inserts a `change_kind` matching `/^MI-/`; Phase 5 feed fixtures seed structural values only. **A structural guard test (Phase 1) fails if any `show_change_log` insert in the migrations OR TS sets `change_kind` to an `MI-*` value.** (The MI invariant code, when useful, lives in the `summary` text — never in `change_kind`.)

**12. Message codes added in ONE Phase 1 task (resolves PF3).** Phase 1 includes a concrete task doing the full §12.4 three-lockstep (master-spec §12.4 prose + `pnpm gen:spec-codes` regenerating `lib/messages/__generated__/spec-codes.ts` + `lib/messages/catalog.ts` rows, ONE commit) for **every** code in resolution #5 (7 result codes + 4 `mi11_pending_*` summary keys incl. `mi11_pending_rename_folded`). Phases 3/4/5/6 only **reference** these (their catalog steps are verification-only). No phase ships a raw code or uncataloged summary (x1-catalog-parity enforces lockstep).

**18. Undo idempotency + supersession — a row goes non-actionable two ways (resolves PF16 + PF19).** The feed offers Undo ONLY for `change_kind ∈ {crew_added,crew_removed,crew_renamed} AND status='applied'`; `undo_change` rejects any target whose `status` is **not** `'applied'` with `{ok:false,code:'UNDO_SUPERSEDED'}` (this status guard runs FIRST, before the `before_image IS NULL` tombstone branch — so a superseded row never falls into the tombstone path). A crew-domain row becomes non-actionable in **two** ways, both flipping `status` **under the show lock**:
  - **(a) Undo (PF16):** `undo_change` success sets the ORIGINAL row `status='undone'` + inserts the `source='undo'` (`undo_of=<orig>`) row. A double-submit → `UNDO_SUPERSEDED`.
  - **(b) Newer same-entity change (PF19):** when the apply / `cleanup_superseded_before_images` processes a NEWER change to the same `entity_ref`, it sets the OLDER same-entity crew-domain rows `status='superseded'` (AND nulls their `before_image`) — so a stale Undo is both hidden by the feed and rejected by `undo_change`. This prevents the corruption where a superseded `crew_removed` row whose `before_image` was nulled would otherwise be Undone via the tombstone fallthrough.
  `'superseded'` is in the `show_change_log.status` CHECK set (Phase 1). Tests: double-undo → `UNDO_SUPERSEDED` + orig `status='undone'`; a newer same-entity sync → older row `status='superseded'`, feed omits Undo, `undo_change`→`UNDO_SUPERSEDED` (no tombstone fallthrough).
  - **RPC enforces the undoable set — the UI gate is NOT the security boundary (resolves PF22).** `undo_change` is `SECURITY DEFINER` + admin-callable with an arbitrary `p_change_log_id`, so it must NOT trust the feed's action gating. After the lock + `status='applied'` check, it **guards on `change_kind`**: only `crew_added | crew_removed | crew_renamed` proceed; anything else (`crew_email_changed`, `field_changed`, `section_shrunk`, `asset_drift`, …) → `{ok:false,code:'UNDO_NOT_FOUND'}` with **no mutation**. The Direction is selected by **`change_kind`**, NOT by `before_image IS NULL`: `crew_added`→tombstone (B); `crew_removed`/`crew_renamed`→restore (A). Phase 4 RED test: an applied `crew_email_changed` and a `section_shrunk`/`field_changed` row → `UNDO_NOT_FOUND`, zero `crew_members`/`sync_holds`/`show_change_log` mutation. Phase 5's undoable predicate and Phase 4's RPC guard share the SAME set `{crew_added,crew_removed,crew_renamed}`.

**17. Pending-gate payload + Phase-6 action-file lock guard (resolves PF14/PF15).** The feed renders pending text from `FeedEntry.summary` (server-rendered old→new via `lib/messages`) and mounts Approve/Reject from `gate{holdId,disposition}` — **NO** `detail`/`groupState`/`conflictCode` fields (the swap/collision/`IDENTITY_WOULD_COLLIDE` outcome surfaces from the Approve RPC's typed result AFTER submit, not pre-rendered). Phase 6 consumes ONLY the canonical `FeedEntry` fields (`summary`, `gate`, `changeLogId`); it never reads a field Phase 5 doesn't produce (resolves PF17).
- **PF14:** the canonical `FeedEntry` now carries an optional `gate` ({holdId, disposition}) populated by `readShowChangeFeed` for every `action==='approve_reject'` entry, and an optional `changeLogId` for every `action==='undo'` entry. Phase 5 populates them; Phase 6 consumes `gate` to mount `Mi11GateActions` and `changeLogId` for Undo — NO second query. Phase 5 test: every `approve_reject` entry has a `gate` with a real `holdId`+`disposition`; every `undo` entry has a `changeLogId`. Phase 6 test: a pending entry renders Approve/Reject wired to `gate.holdId`.
- **PF15:** Phase 6's `app/admin/show/[slug]/_actions.ts` server actions **DELEGATE** to the already-guarded Phase 3/4 helpers (`lib/sync/holds/mi11GateActions.ts` `approveMi11Hold`/`rejectMi11Hold`, and the Phase 4 undo action) — they do NOT call the RPCs inline, and they NEVER wrap them in `withShowAdvisoryLock` (the RPC self-locks; single-holder, §4.1). Phase 6 adds a task extending `tests/auth/advisoryLockRpcDeadlock.test.ts` `sourceFiles` to include `app/admin/show/[slug]/_actions.ts`, asserting none of the three lock-taking RPC calls occur inside a JS-held show lock.
- **PF23 — `approveMi11Hold` resolves `driveFileId` from the HOLD, not the client/page.** The F13 Drive re-check needs the file's current `modifiedTime` before the RPC, but the feed payload carries only `holdId` (a CLIENT-submitted value). Binding `driveFileId` from the page is unsafe — a `holdId` from a different show would re-check the wrong file. So `approveMi11Hold(holdId)` (the helper signature is now just `holdId`): **(1)** `requireAdmin` (JS session gate); **(2)** a NON-locking read of `sync_holds` by `id=holdId` to get the AUTHORITATIVE `drive_file_id` (+ `show_id`) **via the SERVICE-ROLE server client** — NOT the authenticated client, because `sync_holds` is RLS-locked from `authenticated` per F9 (resolution #10); an authed-client SELECT would permission-error. This read is server-only after `requireAdmin` (same posture as the feed read). If the hold is gone → typed `MI11_HOLD_ALREADY_RESOLVED` (no Drive call); **(3)** `fetchDriveFileMetadata(driveFileId)` (typed returned-/thrown-error → `MI11_DRIVE_RECHECK_FAILED`, no RPC, invariant 9 / F15); **(4)** `mi11_approve_hold(holdId, observedModifiedTime)` via the **cookie-bound authenticated** client (the RPC's `is_admin()` gate + advisory lock — resolution #11). So the helper uses TWO clients: service-role for the lookup READ, authed for the mutation RPC. `driveFileId` is NEVER client/page-supplied. **Real permission-boundary test (not mocked):** prove `approveMi11Hold` resolves `drive_file_id` while a direct `authenticated` SELECT on `sync_holds` stays denied. Phase 3 owns the helper; Phase 6's `mi11ApproveAction` submits only `holdId` and delegates. Tests: the Drive re-check runs against the HOLD's file; a Drive read failure returns the typed non-mutating result and never calls the RPC.

**16. `undo_override` release tests the SOURCE-CONFLICT baseline, not `held_value` (resolves PF13).** An undo override is reverting what the *sheet* did; it must persist while the sheet still reproduces that change, and release only when the sheet diverges from it — comparing to `held_value` is wrong (an undone removal keeps Alice present while the sheet still omits her, so `held_value`≠sheet is *immediately* true → the next sync would re-remove her). So a `crew_identity` `undo_override` hold stores, alongside `held_value`, a **`baseline`** = the undone change's signature:
- **undo of a removal** → `held_value`=the restored crew row; `baseline={kind:'removal'}` (the sheet OMITS this `entity_key`). Apply: **retain** the held row (exclude from `deleteCrewMembersNotIn`). **Release** when the incoming parse CONTAINS `entity_key` again (the sheet re-added them) — then apply the sheet's value.
- **undo of a rename** (Alice→Alicia) → `held_value`=Alice's restored row; `baseline={kind:'rename', suppressed_added:{name:'Alicia', email:…}}`. Apply: **retain** Alice AND **suppress** the `suppressed_added` row (by name+email, even if different from Alice). **Release** when the incoming parse NO LONGER matches the baseline (Alice present again OR the `suppressed_added` entity gone/changed).
- **undo of an add / tombstone** (held-absent, already correct — F11) → `held_value={absent:true,name,email}`; `baseline={kind:'add', added:{name,email}}`. Apply: **suppress** that member's upsert. **Release** when the parse stops adding them. (This is the symmetric case; keep it.)
The general rule: **release iff the incoming parse would no longer reproduce the undone change.** Phase 4 (`undo_change`) WRITES `held_value`+`baseline`; Phase 2 honors both. Phase 2 next-sync RED tests MUST include: undo-removal + next sync with the sheet STILL omitting the crew → crew STAYS (no re-removal); undo-rename with a DIFFERENT replacement name/email → restored row stays AND the replacement is NOT re-added (no duplicate); release-on-reconcile for each.

**15. LOCK ORDER — advisory lock BEFORE any row lock (resolves PF11 CRITICAL; deadlock-class — M5 R20).** Every lock-taking admin RPC (`mi11_approve_hold`, `mi11_reject_hold`, `undo_change`) acquires the per-show `pg_advisory_xact_lock(hashtext('show:'||drive_file_id))` **BEFORE** any `SELECT … FOR UPDATE` on `sync_holds`/`show_change_log`/`crew_members`. The sync path already holds the advisory lock and then touches `sync_holds` rows; if an admin RPC grabbed a row lock first and then waited on the advisory lock, the show deadlocks under burst. **Required RPC shape:** (1) **non-locking** read (`select … into` WITHOUT `for update`) of just the hold/log row to discover `drive_file_id`/`show_id`; (2) `perform pg_advisory_xact_lock(hashtext('show:'||drive_file_id))`; (3) **re-select** the row `FOR UPDATE` and **re-validate** (`kind`, `base_modified_time`, still-`mi11_pending`, proposed state) before mutating. **Structural guard:** extend `tests/auth/advisoryLockRpcDeadlock.test.ts` (or a sibling) to FAIL if any lock-taking RPC body contains a `FOR UPDATE` lexically before its `pg_advisory_xact_lock`.

**14. The apply honors BOTH hold kinds (resolves PF10 — cross-phase contract).** `applyParseResult`'s hold-aware path (Phase 2) reads **every** open hold for the show — `kind='mi11_pending'` AND `kind='undo_override'` — and applies the right semantics per `(kind, domain, held_value)`: `mi11_pending` crew_email = pin old email + fold rename/removal + reserve target (gated, has feed Approve/Reject); `undo_override` crew_email = pin old email **terminally** (a reject — no pending UI); `undo_override` crew_identity held-present (`held_value`=prior row) = retain/re-insert + exclude-from-delete + suppress the added row; `undo_override` crew_identity held-absent (`held_value={absent:true,…}`) = suppress that member's upsert. **Release-on-reconcile (§4.3)** applies to undo_override holds: each releases when the sheet's value for that entity stops conflicting. Phase 3 (reject → undo_override) and Phase 4 (undo → undo_override) WRITE these holds; **Phase 2 OWNS honoring them on the next sync** (Phase 2 task 2.8b + next-sync RED tests). This is why a rejected email / restored crew member survives subsequent unchanged syncs.
