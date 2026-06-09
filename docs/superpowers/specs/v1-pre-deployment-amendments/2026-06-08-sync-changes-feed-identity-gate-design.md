# Sync changes feed + identity-only gate — Design Spec

**Date:** 2026-06-08
**Status:** Draft (brainstorming output, pre-plan)
**Supersedes (behaviorally):** the "stage on any MI-6…MI-14" review-gate model in the master spec §6.8 / §12 (the per-invariant stage decision). This spec narrows the gate; it does not change the invariant *definitions* (MI-6…MI-14 still compute exactly as today).

---

## 1. Problem & goal

When a watched Google Sheet changes, the sync pipeline parses it and — if any of the "stage-for-approval" invariants MI-6…MI-14 fire — holds the **entire** parse in `pending_syncs` for the admin to Apply or Discard as one atomic unit (master spec §6.8; `lib/sync/phase1.ts`). In practice almost all of those invariants are *notifications*, not decisions: the code already encodes this — most `TriggeredReviewItem` types have a single forced reviewer action (`lib/parser/types.ts:372`), and only the name-change family ever offered a real branch.

A trace of the **current** (post-M11.5 picker + OAuth-claim) auth model shows that the only change which silently breaks a live viewer's access is **MI-11** (an existing crew member's email changes): the OAuth-claim path matches a viewer to a crew row by `crew_members.email` = their Google account email (`lib/auth/validateGoogleSession.ts:125`), re-checked live every request (`lib/auth/picker/resolvePickerSelection.ts:122-143`), so changing the email evicts whoever claimed that identity. Every other invariant is either unambiguous + recoverable (shrinkage, field degradation, role) or self-healing (a same-email rename: email is the match key **and** is unique per show — partial unique index `crew_members_show_email_unique` at `supabase/migrations/20260501000000_initial_public_schema.sql:49` — so OAuth viewers re-claim the new row automatically).

**Goal.** Stop gating routine changes. **Auto-apply everything except MI-11**; surface every change in a per-show **changes feed**; give each auto-applied **crew-identity** change a **per-item undo**. A single **per-entity hold** mechanism underpins both the MI-11 gate and undo, so the apply engine stays atomic and the show never has to pause wholesale.

### Non-goals (explicitly out of scope)
- **Cross-show "Needs attention" rollup (backlog #11)** — a later surface that reads the same `sync_holds` / `show_change_log` data. Not in this spec.
- **Two-way sheet write-back** — filed as `BL-TWO-WAY-SHEET-SYNC`. The app stays read-only on Google.
- **Multi-step undo history** — undo is one-step (the immediately-prior value).
- **Undo for non-crew changes** (MI-7 section shrinkage, MI-8/8b/8c field degradation, asset drift) — these appear in the feed as **notification-only** rows in v1 (the current Phase-2 snapshot captures prior *crew* rows only; backing non-crew undo needs a Phase-2 capture widening — deferred, §7 / finding F6). Undo in v1 covers **crew-identity** changes (add/remove/rename).
- **Changing invariant definitions** — MI-1…MI-14 still compute identically; only the *consequence* of MI-6…MI-10, MI-12…MI-14 changes (stage → auto-apply).

---

## 2. The gate set (re-derived from the current auth model)

The dividing line is **"does this change move the OAuth-claim email anchor in a way that breaks or reassigns access?"** Only MI-11 does.

| Invariant | What changes | Access consequence (current model) | Disposition |
|---|---|---|---|
| MI-6 / MI-10 | crew shrinkage / structural guard | removes people (same class as any departure) | **auto-apply** |
| MI-7 / MI-7b | section/keyed-row shrinkage | data smaller; recoverable | **auto-apply** |
| MI-8 / MI-8b / MI-8c | financial / COI / pull-sheet degradation | public field changed; recoverable | **auto-apply** |
| MI-9 | LEAD role flag change | cosmetic role | **auto-apply** |
| MI-12 | rename, **same email** | email (match key) preserved + unique → OAuth viewers self-heal; cookie viewers re-pick once | **auto-apply** |
| MI-13 | name **and** email change (paired) | row replaced; both choices ("rename"/"independent") are functionally identical under the picker model (the old auth-floor distinction is the dead signed-link mechanism — `crew_member_auth` is **not referenced** in `lib/sync/applyParseResult.ts` / `lib/sync/applyStaged.ts`) | **auto-apply (with undo)** |
| MI-14 | rename, **no email** | no OAuth claim possible (null email); cookie viewers re-pick | **auto-apply** |
| MI-13/14 orphan add/remove | unpaired add or remove | a join or a departure | **auto-apply** |
| asset drift (DIAGRAMS_*, REEL_DRIFT) | gallery/reel changed between stage & apply | content; recoverable | **auto-apply** |
| **MI-11** | **existing crew email change (same name)** | **overwrites email in place → evicts the OAuth-claimed session under the old email; new email unclaimable until applied** | **GATE** |

**Decision rule (replaces "stage if any MI-6…MI-14"):** A parse routes to **Phase 2 auto-apply** unless an `MI-11` item is present. If `MI-11` items are present, the parse **still auto-applies**, except the email field of each MI-11-flagged crew member is **held** at its current live value (see §4); every non-MI-11 change applies immediately. First-seen behavior is unchanged — governed by `app_settings.auto_publish_clean_first_seen`; a first-seen sheet has no prior snapshot so MI-11 cannot fire (master spec §6.8 amendment 9).

**Guard conditions:**
- A parse with MI-11 items **and** other (FYI) items: FYI items auto-apply, MI-11 emails hold. Never block the whole parse.
- A parse with MI-11 firing for *N* distinct crew: *N* independent holds, each separately approvable (mirrors the existing per-item-id rule, master spec §6.8 "Per-item identity").
- MI-11 where the prior or new email is `null`: still a held email change; the held value may be `null` (a viewer with no email had no OAuth claim to break, but the hold keeps the gate uniform — approve/reject still applies). The DB partial unique index permits multiple `null` emails, so a hold pinning `null` is safe.

---

## 3. Architecture overview

```
sheet change → parse (unchanged) → runInvariants (unchanged: MI-1…MI-14)
                                          │
                              any MI-11 present?
                          ┌───────────────┴───────────────┐
                         no                               yes
                          │                                │
                   Phase 2 auto-apply              Phase 2 auto-apply
                   (hold-aware)                    + write mi11_pending hold(s)
                          │                                │
                          └──────────────┬─────────────────┘
                                 applyParseResult (HOLD-AWARE):
                                 reconcile sheet→live EXCEPT held entities
                                          │
                          write show_change_log row (before/after image)
                                          │
                          per-show CHANGES FEED (admin show page)
                            • auto-applied → [Undo]
                            • mi11_pending → [Approve] [Reject]
                                          │
                   Undo → restore entity from before_image + undo_override hold
                   Approve → release hold + apply new email (evicts/enables claim)
```

**Components (each independently testable):**
1. **Decision rule** (`lib/sync/phase1.ts`) — route auto-apply vs hold-and-apply based on MI-11 presence.
2. **`sync_holds` store + helpers** (new) — the per-entity hold set; CRUD + release evaluation.
3. **Hold-aware apply** (`lib/sync/applyParseResult.ts`) — reconcile snapshot minus held entities.
4. **`show_change_log` store** (new) — one row per change with `before_image`/`after_image`; the feed source and the one-step-undo before-image.
5. **Feed data layer** — read `show_change_log` (+ open `sync_holds`) per show.
6. **Feed + gate + undo UI** (Opus/impeccable) — admin show page.

---

## 4. The hold mechanism (the spine)

### 4.1 Data model — `sync_holds`
A new table; one row per held change.

| column | type | meaning |
|---|---|---|
| `id` | uuid pk | |
| `show_id` | uuid fk → shows | the show |
| `drive_file_id` | text not null | denormalized for the sync path (mirrors `pending_syncs`) |
| `domain` | text not null | `crew_email` \| `crew_identity` (extensible: `section_row`, `field`) |
| `entity_key` | text not null | stable key within the show+domain (crew **name** for `crew_email`; for `crew_identity` the rename pair, see §6.3) |
| `held_value` | jsonb not null | the **current live crew row** kept pinned while the hold is open — the full prior row, so Reject/undo can restore it and the apply can re-pin it each sync |
| `proposed_value` | jsonb | the **proposed end-state** the sheet wants for this crew slot (for `mi11_pending`) — a tagged disposition so the *same* hold can absorb a later rename or removal (findings F7/F8): one of `{"disposition":"email_change","name":<same>,"email":<new>}`, `{"disposition":"rename","name":<new>,"email":<new>}`, or `{"disposition":"removal"}`. The **durable home** for the proposed identity/disposition — exactly what the feed renders and Approve applies. Null for `undo_override` (which uses `held_value`). |
| `base_modified_time` | timestamptz | the sheet `modifiedTime` the `proposed_value` was read at — a staleness guard so Approve never applies a disposition the sheet has since moved past (see §5). |
| `kind` | text not null | `mi11_pending` \| `undo_override` |
| `created_at` | timestamptz not null default now() | |
| `created_by` | text not null | admin email (canonicalized) or `'system'` |

- `UNIQUE (show_id, domain, entity_key)` — at most one active hold per entity (a new conflicting change supersedes / re-evaluates, never duplicates).
- `CHECK (domain in ('crew_email','crew_identity'))` for v1 (extensible later). **Migration discipline:** the inline `tables/`-equivalent CHECK and any `migrations/` CHECK must accept the same set; new domains use `DROP CONSTRAINT IF EXISTS` + `ADD` for apply-twice idempotency.
- **Lock topology + PostgREST lockdown (single-holder rule, invariant 2).** Two entry points write `sync_holds`, each acquiring the per-show advisory lock at **exactly one** layer, never nested:
  - **Sync/apply path** — the JS wrapper already holds `pg_advisory_xact_lock(hashtext('show:'||drive_file_id))` (`lib/sync/lockedShowTx.ts:57`). Hold reads/writes here run as **direct service-role SQL inside that transaction** — NO nested lock-taking RPC (calling one would deadlock and violate `tests/auth/advisoryLockRpcDeadlock.test.ts`).
  - **Admin actions** (Approve/Reject/Undo) run OUTSIDE any JS-held lock, so they go through a **SECURITY DEFINER RPC that itself acquires the show lock** (blocking `pg_advisory_xact_lock`) — the lock is taken at one layer (the RPC), and these RPCs are never invoked from within a JS-held show lock. The RPC cannot read Drive, so any Drive observation Approve needs (the current `modifiedTime`, §5 finding F13) is read by the JS server action *before* the call and passed in as a parameter.
  - **PostgREST DML lockdown:** `REVOKE INSERT, UPDATE, DELETE ON public.sync_holds FROM anon, authenticated;` forces every PostgREST-reachable (admin) mutation through those RPCs; the sync pipeline writes as `service_role`, exempt from the REVOKE. Add the `RPC_GATED_TABLES` registry row in `tests/db/postgrest-dml-lockdown.test.ts` **and extend `tests/auth/advisoryLockRpcDeadlock.test.ts`** to pin the new admin RPC surfaces (lock-taking, never nested under a JS holder). Also covered automatically by `validation-schema-parity` (public table → manifest).
- **Read posture — admin-only (finding F9).** `sync_holds` exposes held/proposed crew identity (email). **Enable RLS; grant NO direct SELECT to `anon`/`authenticated`;** the feed reads holds through a **server-only (service-role) feed RPC / data layer**, never PostgREST `from('sync_holds')`. Mirror the existing admin-only-read posture used by sensitive audit tables. Tests prove `anon` and non-admin `authenticated` cannot read any `sync_holds` row.

### 4.2 Hold-aware apply contract
`applyParseResult` (`lib/sync/applyParseResult.ts:49`) gains a hold lookup at the top of the locked transaction and applies this contract **per entity**, leaving all non-held entities to the existing whole-snapshot reconcile:

- **`crew_email` hold on crew "Alice":** the held crew member is **frozen at `held_value` (her full live row)** until the hold resolves, and every later sheet change to her is **absorbed into the hold's `proposed_value` disposition** rather than auto-applied — so Approval stays the *only* moment her old-email OAuth claim is evicted/removed. Concretely:
  - **(a) Pin + delete-suppression:** Alice's name is **excluded from `deleteCrewMembersNotIn`** (`lib/sync/applyParseResult.ts:53`; `lib/sync/runScheduledCronSync.ts:1104`) so a later sheet edit cannot drop her; on upsert her row is pinned to `held_value` (email = old).
  - **(b) Email re-target:** a further email change updates `proposed_value={disposition:'email_change',…}` + `base_modified_time` (§4.3).
  - **(c) Rename-while-held (F8):** a later rename (MI-12/13/14 emit removed `Alice` + added `Alicia` — `lib/parser/invariants.ts:596`) **suppresses** the added `Alicia` row and folds into `proposed_value={disposition:'rename',name:'Alicia',email:<new>}`. The feed shows the rename; Approve applies it (rename = delete-old + insert-new, transitioning the claim); Reject pins Alice.
  - **(d) Removal-while-held (F7):** if a later sheet drops Alice entirely (she's already excluded from `deleteCrewMembersNotIn`, so she is **not** silently removed), the hold folds into `proposed_value={disposition:'removal'}`. The feed shows a pending removal; **Approve removes Alice + revokes her claim; Reject pins her as an `undo_override`.** Without this, a held crew member could otherwise survive a sheet removal indefinitely (the F7 risk).
  - **(e) Proposed-target reservation (F16) — the held identity is matched on BOTH the old row AND the proposed target, not the old name alone.** While the hold is open, its `proposed_value.email` / `proposed_value.name` are **reserved**: no *other* row may occupy them before Approval. Otherwise the proposed identity could become claimable without the gate even though the old name still exists — e.g. hold `Alice → x@new`, then sheet sets `Alice: bob@new` **and** adds `Alicia: x@new`; because `Alice` still exists, branches (c)/(d) don't fire, and `Alicia: x@new` would auto-apply, making `x@new` claimable pre-Approval. Rule: any added/other row whose email or name collides with an open hold's `proposed_value` is **suppressed and folded into that hold's pending decision** (or surfaced as a typed `IDENTITY_WOULD_COLLIDE` when it's genuinely a distinct person to disambiguate), until Approve/Reject. When `proposed_value` re-targets (§4.3), the prior target's reservation releases and the new target's is taken.
  - Everything about every *non-held* crew member follows the sheet.
- **`crew_identity` hold — two directions (undo, per §6.3):**
  - **held-present** (undo of a removal/rename): `held_value=<prior crew row>` → retain the held entity row (re-insert if the parse would delete it, exclude its name from `deleteCrewMembersNotIn`) and suppress the conflicting added row.
  - **held-absent / tombstone** (undo of a `crew_added`): `held_value={absent:true, name:<added name>, email:<added email>}` → **suppress the upsert** of that crew member so the sheet's add is not re-applied while the tombstone is open. The added row was deleted at undo time; the tombstone keeps it gone.
- All section/field steps are unchanged in v1 (no holds in those domains yet).

**Grain & contract:** the apply remains *one row per crew member per show*; the hold layer only **substitutes values for held keys** and **suppresses deletion of held entities**, never otherwise changing row cardinality. Lock ownership follows §4.1: the sync-path apply reads/writes holds inside the existing show-locked transaction (JS holder); admin-path hold mutations acquire the lock via their own SECURITY DEFINER RPC. Single-holder per key is preserved — the lock is acquired at exactly one layer in each path, never nested (invariant 2).

### 4.3 Release semantics
A hold releases (row deleted) when **either**:
1. **Admin action** — Approve/Reject an `mi11_pending` (§5), or Redo an `undo_override` (re-apply the sheet's value).
2. **Sheet reconciliation** — on a later sync, if the sheet's state for the held crew member now **matches `held_value`** (the source was corrected back to the old identity, no removal), the `mi11_pending` hold **releases** (no change needed). Otherwise the hold is **re-evaluated in place**: `proposed_value` (its `disposition` — `email_change` / `rename` / `removal`, §4.2 b/c/d) and `base_modified_time` update to the latest sheet state (still one hold, never a duplicate) — so the feed and Approve always reflect the most recent disposition. On a new value for an `undo_override`, the override **releases** and the new value applies (the admin's "don't re-apply *that*" no longer matches — the sheet moved on).

**Flag lifecycle** (per the project's flag-lifecycle discipline):

| field | storage | write path | read path | effect |
|---|---|---|---|---|
| `kind=mi11_pending` | `sync_holds` (`held_value`=live row, `proposed_value`=disposition, `base_modified_time`) | decision rule (§2) on MI-11 detect; re-eval to latest disposition on later edit (§4.3) | apply (§4.2) pins `held_value`; feed renders the `proposed_value` disposition + Approve/Reject | change withheld until Approve; Approve applies exactly `proposed_value` |
| `kind=undo_override` | `sync_holds` | Undo action (§6) / MI-11 Reject (§5) | apply (§4.2) pins held value; release eval (§4.3) | sheet change suppressed until reconciled |

No zombie states: every hold is written by exactly one path, read by the apply + the feed, and released by admin action or sheet reconciliation.

---

## 5. MI-11 gate flow

1. **Detect** — MI-11 present → write `mi11_pending` hold per flagged crew: `domain='crew_email'`, `entity_key=<crew name>`, `held_value=<current live crew row>` (kept live), `proposed_value={disposition:'email_change', name:<same>, email:<sheet's new email>}` (the **durable disposition** — the only persisted home for the proposed end-state once whole-parse `pending_syncs` is off this path), `base_modified_time=<sheet modifiedTime>`, `created_by='system'`. Later sheet edits to this crew member escalate `proposed_value` to a `rename` or `removal` disposition (§4.2 c/d).
2. **Apply** — the rest of the parse auto-applies; the held crew member stays pinned to `held_value`.
3. **Feed entry** — rendered **from the `sync_holds` row** (not `show_change_log`), keyed on `proposed_value.disposition`: *"email change: <old> → <new>"* / *"rename: <old name> → <new name>"* / *"removal"* — with **[Approve] [Reject]** (copy via `lib/messages` — no raw codes, invariant 5).
4. **Approve** (admin-gated lock-taking RPC, §4.1) → apply exactly the locked `proposed_value` disposition: `email_change` → set the crew row's email; `rename` → rename (delete-old + insert-new with the proposed name+email); `removal` → delete the crew row + revoke its claim. Then release the hold and write a `show_change_log` row (`source='mi11_approve'`, `before_image=held_value`, `after_image=`the applied end-state). **This is the only moment** a claimed session is evicted (old-email holder fails the live email check next request → `session_mismatch`) / the row is removed, and any new email becomes claimable.
5. **Reject** → convert the hold to `undo_override` pinning `held_value` (the old crew row, including a removal-rejection that *keeps* the person); write a `show_change_log` row (`source='mi11_reject'`). Feed shows *"rejected — keeping <old>."* Releases per §4.3 when the sheet reconciles.

**Guard conditions:** Approve/Reject are idempotent against a stale hold (if it already released via sheet reconciliation, the action no-ops with a typed "already resolved" result via `lib/messages`). The feed-shown disposition and the applied disposition are guaranteed identical (both are `proposed_value`). Concurrent sync + approve are serialized by the per-show advisory lock.

**Stale-target guard — two-stage orchestration (finding F13).** A Postgres lock-taking RPC **cannot read Drive**, and `shows.last_seen_modified_time` only reflects the *last sync* — it would miss a sheet edit landing in the sync→approve window. So Approve is orchestrated in the JS admin action: **(1)** read the **current Drive `modifiedTime`** for the show's file (in the server action, before any DB mutation); **(2)** call the lock-taking SECURITY DEFINER RPC passing that observed `modifiedTime` as a parameter; **(3)** inside the lock, the RPC compares the observed value to the hold's `base_modified_time` and **rejects with a typed "changed — re-review"** if they differ (Doug edited the sheet past this disposition), else applies `proposed_value`. The Drive read sits in the orchestration (outside the lock); the comparison + mutation are inside the lock — no nested lock, no Drive call from SQL (consistent with §4.1).

**Drive reverify failure (finding F15 — call-boundary discipline, invariant 9).** If step (1)'s Drive metadata read **fails** — returned error or thrown (403/404/429/5xx/timeout) — Approve returns a typed, `lib/messages`-backed, **non-mutating** result ("couldn't re-check the sheet right now — try again"), does **NOT** invoke the lock-taking RPC, and leaves the hold `mi11_pending`. Never applies on a fallback/stale modifiedTime, never surfaces a raw infra error. The `{data,error}` and thrown-error paths are both handled as discriminable typed failures (invariant 9).

**Collision & swap handling (findings F10/F12 — multiple open holds).** A show can have *N* independent `mi11_pending` holds, all pinned to old values, so an Approve can collide with **either** unique constraint: `crew_members_show_email_unique` (`supabase/migrations/20260501000000_initial_public_schema.sql:49`) **or** `unique (show_id, name)` (`:43`). Collision detection is a **directed graph over proposed-and-current `email` and `name` targets**, resolved by **transitive closure**:
  - Start from the Approve target's proposed values (email, name). **A proposed value that equals the approving row's *own* current value for that column (an unchanged column — e.g. the name in a plain `email_change`) is a satisfied self-edge, not a collision** — the row already owns it (finding F14). Only a proposed value that differs from its current owner matters. For each such genuinely-occupied target, find its current owner row. **If that owner is itself an open hold whose disposition *vacates* that target**, add it to the group and **recurse** (covers two-person swaps, A→B→C chains, and cycles). The ordinary single MI-11 email change is therefore a one-node group with no collision.
  - **If any occupied target is owned by a non-vacating row or a non-held live row, reject the ENTIRE group** with a typed `IDENTITY_WOULD_COLLIDE` conflict — the feed renders the conflict, **no Approve button** (never a button that always fails).
  - A **fully-closed** group (every occupied target is vacated by a group member) is approved **atomically in one lock-taking RPC** with a swap-safe write sequence, since neither unique index is deferrable and a naive single-statement reassign fails mid-statement: **park** each conflicting column to a temporary unique sentinel — `email` → **NULL** (index is partial `WHERE email IS NOT NULL`, so NULLs never collide); `name` (NOT NULL) → a **transient reserved placeholder** (e.g. `__hold:<uuid>`) — then reassign the freed targets and settle. The feed renders a closed group as a single **[Approve group]**.
  Tested by: two-person email swap, **3-way email cycle**, **mixed rename+email swap** (exercises name parking), and a **chain terminating at a non-held live row** (must reject) — §9.

---

## 6. The changes feed (admin show page)

### 6.1 Data source — new `show_change_log` table
`sync_audit` **cannot** back the feed: its `staged_id`, `reviewer_choices`, `derived_side_effects`, `parse_result_summary`, `staged_modified_time` columns are NOT NULL staged-review fields (`supabase/migrations/20260501001000_internal_and_admin.sql:204-216`) that a non-staged Phase-2 auto-apply has no values for, and the only writer inserts exactly that staged payload (`lib/sync/applyStaged.ts:873-889,1391-1401`). Overloading it would force fake review data the feed/undo layer would misread. So the feed gets a **dedicated table**; `sync_audit` is left **unchanged** — its legacy review-apply audit role stands, and the feed neither reads nor writes it (an MI-11 Approve writes `show_change_log`; whether it *also* appends a `sync_audit` row if it reuses the `applyStaged` path is an implementation detail orthogonal to the feed).

**`show_change_log`** — one row per notable change, written on **every** apply path (auto-apply, MI-11 approve/reject, undo):

| column | type | meaning |
|---|---|---|
| `id` | uuid pk | |
| `show_id` | uuid fk → shows | |
| `drive_file_id` | text not null | |
| `occurred_at` | timestamptz not null default now() | feed sort key — index `(show_id, occurred_at desc)` |
| `source` | text not null | `auto_apply` \| `mi11_approve` \| `mi11_reject` \| `undo` |
| `change_kind` | text not null | invariant code (`MI-12`, …) or structural (`crew_added` / `crew_removed` / `field_changed`) |
| `entity_ref` | text | the affected entity (crew name; section+key) — addresses per-item undo |
| `summary` | text not null | rendered copy via `lib/messages` (no raw codes, invariant 5) |
| `before_image` | jsonb | the affected **crew** entities' **pre-apply** values — the undo source. Populated only for crew-domain `change_kind`s (the ones the current Phase-2 snapshot captures); null for non-crew FYI rows, which are notification-only in v1 (§7) |
| `after_image` | jsonb | the applied values (feed display) |
| `status` | text not null | `applied` \| `pending` \| `rejected` \| `undone` |
| `undo_of` | uuid fk → show_change_log | set on an undo row; points at the entry it reverts |

The feed reads `show_change_log` (+ open `sync_holds` for `pending` MI-11 entries) through a **server-only (service-role) feed data layer / RPC**. Same lockdown posture as `sync_holds` (§4.1): REVOKE INSERT/UPDATE/DELETE from anon/authenticated, RPC-gated writes, `RPC_GATED_TABLES` registry row, automatic `validation-schema-parity` coverage. **Read posture — admin-only (finding F9):** `before_image`/`after_image` contain crew PII (email, phone, role, restrictions, flight_info per the Phase-2 snapshot). **Enable RLS; grant NO direct SELECT to `anon`/`authenticated`** — the feed reads server-side as service-role, never via PostgREST `from('show_change_log')`. Tests prove `anon`/non-admin `authenticated` cannot read any row or its `before_image` JSON. **CHECK** constraints on `source`/`status`/`change_kind` use `DROP ... IF EXISTS` + `ADD` for apply-twice idempotency.

### 6.2 Entry shape & scope
Each feed entry: `{ summary, occurred_at, status, action }` where `status ∈ {auto_applied, pending, rejected, undone}` and `action ∈ {undo, approve_reject, none}`. **Scope (signal-rich, not noisy):** entries cover the invariant-flagged changes (MI-6…MI-14, asset drift) + notable structural changes (crew add/remove). Routine field syncs that trip no invariant are **not** individually logged.

**Undo availability (v1 scope — finding F6):** the `undo` action is offered **only on crew-domain entries** (`crew_added` / `crew_removed` / the MI-12/13/14 rename rows), whose pre-apply state the current Phase-2 snapshot captures (§7). Non-crew FYI rows (MI-7 section shrinkage, MI-8/8b/8c field degradation, asset drift) are **notification-only** in v1 — `action='none'`, with a "edit the sheet to change this" pointer — because backing their undo would require widening Phase-2 prior-state capture (deferred; see §1 non-goals + §7). This honors the approved "crew-identity undo first, non-crew only if cheap" scope (call 9); F6 showed non-crew is not cheap.

**Cap/truncation:** the feed shows the most recent *N* (proposed 50) entries with an explicit "older changes not shown" note when truncated (never a silent cut).

### 6.3 Undo flow (per-item, one-step — crew-domain entries only in v1)
On an `auto_applied` **crew-domain** entry → **Undo** (admin-gated, lock-taking RPC per §4.1). Two symmetric directions:
1. **Undo of a removal or rename** (`crew_removed` / MI-12/13/14): re-insert the prior crew row from the entry's **`before_image`** (§7) and suppress the sheet's replacement → write a **held-present** `crew_identity` `undo_override` (`held_value=<prior row>`; `entity_key`=prior crew name; for a rename the key also records the suppressed added name so the apply skips re-adding it).
2. **Undo of an add** (`crew_added`, finding F11): there is **no prior row** — `before_image` is null. Instead **delete the added crew row** (revoking any claim it had) and write a **held-absent / tombstone** `crew_identity` `undo_override` (`held_value={absent:true,name,email}`) so the apply **suppresses re-adding** that crew member while the sheet still lists them. Without this, the next sync re-creates the row the feed says was undone.
3. The show **keeps syncing**; only the held entity is pinned (present or absent). The feed entry flips to *"undone — overriding the sheet."*
4. **Release** per §4.3: when the sheet's value for that entity next changes (a held-present row's source changes; a tombstoned add is removed from the sheet or its identity changes), the override releases and the new sheet value applies. One-step.

**Guard conditions:** Undo is available only while the entry reflects current live state (if a newer sync already changed that entity, Undo is disabled with a "superseded — re-sync changed this" note). Undo of a `crew_identity` whose prior row's email is now claimed by someone else (via the unique-email index) is rejected with a typed conflict result.

---

## 7. Prior-state retention for undo

Undo restores a crew entity to its **pre-apply** value, so each crew-domain `show_change_log` row carries a **`before_image`** of the crew rows it changed, captured at apply time *before* the reconcile writes the new values.

**Capture source — what's actually available (finding F6):** Phase 2 already snapshots the **prior crew rows** before applying — `applyShowSnapshot` returns `previousCrewNames` + `previousCrewMembers` (`lib/sync/phase2.ts:33-39`), captured at `lib/sync/runScheduledCronSync.ts:913-932,1088-1100`. The change-log writer persists those prior crew rows into `before_image` *before* `applyParseResult` mutates the tables. This is sufficient for crew add/remove/rename undo. It is **NOT** available for non-crew domains: Phase 2 does **not** capture prior hotel/room/contact rows, show fields, diagrams, or reel state. Widening that capture is out of v1 scope, so **non-crew rows are notification-only** (§6.2) — they get no `before_image` and no undo button. This is the F6 resolution and matches approved scope call 9.

**Why before-image, not the applied `parse_result`** (finding F2): the most-recent *applied* `parse_result` is the **post**-change state, so reading it after an auto-applied removal/rename returns the current live sheet state and **cannot** reconstruct the removed prior entity. The per-entry `before_image` (captured pre-reconcile) is the only reliable undo source.

**Retention / cleanup:** `before_image` is kept while undo is available — one-step, i.e. until a newer change to the **same crew entity** supersedes it. A cleanup pass MAY null `before_image` on superseded rows to bound storage; the feed-history row survives via `summary` + `after_image`.

---

## 8. UI surfaces (Opus / impeccable)

- **Changes feed** — new component on the admin show page (`app/admin/show/[slug]/`). Reverse-chron list; each entry renders summary + relative time + status + action. Reduced-motion + dimensional invariants per DESIGN.md; real-browser layout assertion per the layout-dimensions rule.
- **MI-11 gate card** — a **slimmed** replacement for the whole-parse `StagedReviewCard` (`components/admin/StagedReviewCard.tsx`): just the email-change Approve/Reject for the held crew, not a full-parse review. The legacy whole-parse `ParsePanel` review path is removed (no invariant stages a whole parse anymore except the held-email case).
- **Undo / resolve affordances** in feed entries (44px tap targets, accessible names, WCAG per DESIGN.md).

All UI ships under invariant 8 (impeccable dual-gate) and the UI-always-Opus routing rule.

---

## 9. Migration & test surface

**Meta-tests created/extended (declared up front per writing-plans discipline):**
- `tests/db/postgrest-dml-lockdown.test.ts` — **extended** with `RPC_GATED_TABLES` rows + REVOKEs for **both** `sync_holds` and `show_change_log`.
- `tests/auth/advisoryLockRpcDeadlock.test.ts` — **extended** to pin the new admin lock-taking RPC surfaces (Approve/Reject/Undo, and any hold/change-log mutation RPC) as single-layer holders never nested under a JS-held show lock (the §4.1 topology).
- `validation-schema-parity` — **automatic** coverage of `sync_holds` + `show_change_log` (new `public` tables → manifest; regen + apply to validation per the gate's checklist).

**Migrations:** `sync_holds` table + REVOKE + RPC(s); `show_change_log` table + REVOKE + RPC(s) + `(show_id, occurred_at desc)` index; apply **all** to the validation project (the `validation-schema-parity` gate fails until they land there). `sync_audit` is **unchanged** (the feed does not write to it — finding F1).

**Key test cases (each names its failure mode):**
- Decision rule: MI-11-only parse → email held, rest applied (catches "whole-parse still staged").
- Hold-aware apply: held crew keeps old email while a hotel drop in the same parse applies (catches "hold blocks unrelated changes").
- **Rename-while-held (F3/F8):** Alice has an open MI-11 email hold; next parse renames Alice→Alicia → Alice is NOT deleted, Alicia add suppressed, `proposed_value` escalates to `{disposition:'rename',name:'Alicia',…}`; the feed-shown target equals what Approve applies; old-email claim evicted ONLY on Approve (catches "hold bypassed by rename" + "proposed name lost / feed≠applied").
- **Removal-while-held (F7):** Alice has an open MI-11 hold; next sheet drops Alice → she is NOT silently removed; `proposed_value` becomes `{disposition:'removal'}`; the feed shows a pending removal; Approve removes+revokes, Reject pins her as `undo_override` (catches "held crew survives a sheet removal indefinitely").
- **Old-name-reuse bypass (F16):** open hold `Alice: alice@old → x@new`; sheet then sets `Alice: bob@new` **and** adds `Alicia: x@new` → the `Alicia: x@new` add is **suppressed** (x@new is reserved by the open hold) and folded/surfaced; `x@new` is NOT claimable before Approve (catches "proposed identity leaks via a reused old name + a new row while the hold's old name still exists").
- **Read lockdown (F9):** `anon` and non-admin `authenticated` get zero rows / RLS-denied on `SELECT` from `sync_holds` and `show_change_log` (incl. `before_image`); the server-side feed RPC returns them for an admin (catches "crew PII exposed via PostgREST").
- **Collision graph (F10/F12):** two-person email swap, **3-way email cycle**, **mixed rename+email swap** (exercises NOT-NULL `name` parking to a transient placeholder), and a **chain terminating at a non-held live row** → the first three approve atomically via the swap-safe park sequence and satisfy *both* unique indexes; the last yields a typed `IDENTITY_WOULD_COLLIDE` + no Approve button (catches "Approve-group still hits a unique violation / misclassifies a chain ending at a live row").
- **Plain MI-11 email approve through the resolver (F14):** a single `email_change` (name unchanged) approves with no collision — the unchanged-name self-edge is satisfied, not rejected (catches "ordinary email change is permanently unapprovable as a false self-collision").
- **Stale-target guard (F13):** Drive `modifiedTime` advances after the last sync but before Approve → the JS orchestration reads the new modifiedTime, the locked RPC sees it ≠ `base_modified_time` and rejects with "changed — re-review" (catches "stale disposition approved after Doug moved the sheet"; also asserts `shows.last_seen_modified_time` alone is insufficient).
- **Drive reverify failure (F15):** a returned Drive error and a thrown Drive error on the pre-Approve modifiedTime read each yield a typed non-mutating "try again" result, do NOT call the RPC, and leave the hold pending (catches "approve on a stale fallback / raw infra error surfaced").
- **Crew-added undo tombstone (F11):** an auto-applied `crew_added` → Undo deletes the row + revokes its claim + writes a held-absent tombstone; the next sync (sheet still lists them) does NOT re-create the row; removing them from the sheet releases the tombstone (catches "undone add re-created next sync").
- **MI-11 durable target (F5):** detection writes `proposed_value`=new email; Approve applies `proposed_value` (not the transient parse); an oscillating sheet re-evaluates `proposed_value`+`base_modified_time` in place; Approve against a moved-past target returns "re-review" (catches "proposed email lost / stale target applied").
- MI-11 Approve evicts old-email claim + enables new (catches "email applied without claim transition").
- **Non-crew notification-only (F6):** an MI-7 section shrinkage / MI-8 field degradation auto-applies and produces a feed row with `action='none'` and null `before_image` — **no** undo button (catches "undo offered for a change with no captured prior state").
- **Undo before-image (F2):** auto-applied crew removal → undo re-inserts the removed crew member from `before_image` (catches "undo reads post-state and can't restore a removed entity").
- Undo restores one entity, leaves siblings (catches "undo clobbers FYI changes").
- Undo + sheet-still-conflicts → no re-apply next sync; sheet-reconciled → override releases (catches whack-a-mole + stuck-override).
- **Auto-apply change-log insert (F1):** a Phase-2 auto-apply writes a `show_change_log` row with no staged fields (catches "feed row needs staged_id/reviewer_choices").
- **Lock topology (F4):** an admin Approve RPC acquires the show lock and is never invoked under a JS-held lock; a concurrent cron sync serializes on the same key without deadlock.
- Same-email rename (MI-12) auto-applies and an OAuth viewer self-heals (catches "rename gated" regression).

**Invariants preserved:** advisory-lock single-holder (2), email canonicalization at boundaries (3), no global cursor (4), no raw error codes in feed copy (5), spec-canonical (7), impeccable dual-gate on UI (8), Supabase call-boundary discipline (9). **New-table read security (F9):** RLS-enabled, admin-only/server-only read on `sync_holds` + `show_change_log` (crew PII never PostgREST-reachable).

---

## 10. Routing

- **Backend** (decision rule, `sync_holds` + RPCs + REVOKE, hold-aware apply, snapshot retention, feed data layer, migrations) — Codex-eligible per ROUTING.md.
- **UI** (feed, gate card, undo affordances) — Opus + impeccable (UI-always-Opus rule).
- Per-domain split recorded in the milestone handoff.

---

## 11. Open questions for spec review
- `show_change_log.before_image` storage growth — confirm the cleanup pass (null superseded before-images) is sufficient; define its trigger (on next change to the same entity vs a periodic reaper).
- Exact `entity_key` / `entity_ref` encoding for a `crew_identity` undo of a rename (records both the retained and the suppressed name) — confirm the format in the plan.
- Feed entry cap (proposed 50) and whether sync *failures* (`sync_log`, distinct from `sync_audit`) appear in the same feed or a separate "technical log" expander.
- Escalation copy for a rename-folded-into-an-MI-11-hold (§4.2c) — the combined "email change + rename" pending entry needs a catalog string in §12.4 / `lib/messages`.
