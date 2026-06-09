# Sync changes feed + identity-only gate — Design Spec

**Date:** 2026-06-08
**Status:** Draft (brainstorming output, pre-plan)
**Supersedes (behaviorally):** the "stage on any MI-6…MI-14" review-gate model in the master spec §6.8 / §12 (the per-invariant stage decision). This spec narrows the gate; it does not change the invariant *definitions* (MI-6…MI-14 still compute exactly as today).

---

## 1. Problem & goal

When a watched Google Sheet changes, the sync pipeline parses it and — if any of the "stage-for-approval" invariants MI-6…MI-14 fire — holds the **entire** parse in `pending_syncs` for the admin to Apply or Discard as one atomic unit (master spec §6.8; `lib/sync/phase1.ts`). In practice almost all of those invariants are *notifications*, not decisions: the code already encodes this — most `TriggeredReviewItem` types have a single forced reviewer action (`lib/parser/types.ts:372`), and only the name-change family ever offered a real branch.

A trace of the **current** (post-M11.5 picker + OAuth-claim) auth model shows that the only change which silently breaks a live viewer's access is **MI-11** (an existing crew member's email changes): the OAuth-claim path matches a viewer to a crew row by `crew_members.email` = their Google account email (`lib/auth/validateGoogleSession.ts:125`), re-checked live every request (`lib/auth/picker/resolvePickerSelection.ts:122-143`), so changing the email evicts whoever claimed that identity. Every other invariant is either unambiguous + recoverable (shrinkage, field degradation, role) or self-healing (a same-email rename: email is the match key **and** is unique per show — partial unique index `crew_members_show_email_unique` at `supabase/migrations/20260501000000_initial_public_schema.sql:49` — so OAuth viewers re-claim the new row automatically).

**Goal.** Stop gating routine changes. **Auto-apply everything except MI-11**; surface every change in a per-show **changes feed**; give each auto-applied change a **per-item undo**. A single **per-entity hold** mechanism underpins both the MI-11 gate and undo, so the apply engine stays atomic and the show never has to pause wholesale.

### Non-goals (explicitly out of scope)
- **Cross-show "Needs attention" rollup (backlog #11)** — a later surface that reads the same `sync_holds` / `sync_audit` data. Not in this spec.
- **Two-way sheet write-back** — filed as `BL-TWO-WAY-SHEET-SYNC`. The app stays read-only on Google.
- **Multi-step undo history** — undo is one-step (the immediately-prior value).
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
                              record events in sync_audit (extended)
                                          │
                          per-show CHANGES FEED (admin show page)
                            • auto-applied → [Undo]
                            • mi11_pending → [Approve] [Reject]
                                          │
                   Undo → restore entity from prior snapshot + undo_override hold
                   Approve → release hold + apply new email (evicts/enables claim)
```

**Components (each independently testable):**
1. **Decision rule** (`lib/sync/phase1.ts`) — route auto-apply vs hold-and-apply based on MI-11 presence.
2. **`sync_holds` store + helpers** (new) — the per-entity hold set; CRUD + release evaluation.
3. **Hold-aware apply** (`lib/sync/applyParseResult.ts`) — reconcile snapshot minus held entities.
4. **Snapshot retention** — full `parse_result` retained on `sync_audit` for one-step undo.
5. **Feed data layer** — read `sync_audit` (+ open `sync_holds`) per show.
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
| `held_value` | jsonb not null | the value the apply pins (e.g. `{"email":"a@old.test"}`; for an undo-suppressed removal, the retained entity row) |
| `kind` | text not null | `mi11_pending` \| `undo_override` |
| `created_at` | timestamptz not null default now() | |
| `created_by` | text not null | admin email (canonicalized) or `'system'` |

- `UNIQUE (show_id, domain, entity_key)` — at most one active hold per entity (a new conflicting change supersedes / re-evaluates, never duplicates).
- `CHECK (domain in ('crew_email','crew_identity'))` for v1 (extensible later). **Migration discipline:** the inline `tables/`-equivalent CHECK and any `migrations/` CHECK must accept the same set; new domains use `DROP CONSTRAINT IF EXISTS` + `ADD` for apply-twice idempotency.
- **PostgREST DML lockdown:** `sync_holds` mutations flow only through SECURITY DEFINER RPCs (advisory-lock-gated). `REVOKE INSERT, UPDATE, DELETE ON public.sync_holds FROM anon, authenticated;` in the creating migration, **and** a `RPC_GATED_TABLES` registry row in `tests/db/postgrest-dml-lockdown.test.ts` (per the class-wide invariant). It is also covered by the new `validation-schema-parity` gate automatically (it's a `public` table → manifest).

### 4.2 Hold-aware apply contract
`applyParseResult` (`lib/sync/applyParseResult.ts:49`) gains a hold lookup at the top of the locked transaction and applies this contract **per entity**, leaving all non-held entities to the existing whole-snapshot reconcile:

- **`crew_email` hold on crew "Alice":** when upserting Alice's row, write `held_value.email` instead of the parse's email. Everything else about Alice (and every other crew member) follows the sheet.
- **`crew_identity` hold (undo of a rename/removal):** retain the held entity row (re-insert if the parse would delete it) and suppress the conflicting added row, per §6.3.
- All section/field steps are unchanged in v1 (no holds in those domains yet).

**Grain & contract:** the apply remains *one row per crew member per show*; the hold layer only **substitutes values for held keys**, never changes row cardinality semantics beyond "retain a held entity the sheet would drop." Single advisory-lock holder is preserved — holds are read and written **inside** the existing `withPostgresSyncPipelineLock` transaction (`lib/sync/runScheduledCronSync.ts`); no new lock layer (plan-wide invariant 2).

### 4.3 Release semantics
A hold releases (row deleted) when **either**:
1. **Admin action** — Approve/Reject an `mi11_pending` (§5), or Redo an `undo_override` (re-apply the sheet's value).
2. **Sheet reconciliation** — on a later sync, the sheet's value for that entity no longer conflicts with `held_value` (the source was corrected, or changed to something new). On a *new* conflicting value for an `mi11_pending` entity, the hold is **re-evaluated** (the pending email target updates; still one hold, not a duplicate). On a new value for an `undo_override`, the override **releases** and the new value applies (the admin's "don't re-apply *that*" no longer matches — the sheet moved on).

**Flag lifecycle** (per the project's flag-lifecycle discipline):

| field | storage | write path | read path | effect |
|---|---|---|---|---|
| `kind=mi11_pending` | `sync_holds` | decision rule (§2) on MI-11 detect | apply (§4.2) pins old email; feed renders Approve/Reject | email withheld until approve |
| `kind=undo_override` | `sync_holds` | Undo action (§6) / MI-11 Reject (§5) | apply (§4.2) pins held value; release eval (§4.3) | sheet change suppressed until reconciled |

No zombie states: every hold is written by exactly one path, read by the apply + the feed, and released by admin action or sheet reconciliation.

---

## 5. MI-11 gate flow

1. **Detect** — MI-11 present → write `mi11_pending` hold per flagged crew: `domain='crew_email'`, `entity_key=<crew name>`, `held_value={email:<current live email>}`, `created_by='system'`.
2. **Apply** — the rest of the parse auto-applies; the held crew member keeps the old email.
3. **Feed entry** — `mi11_pending` renders: *"<name> — email change pending: <old> → <new>"* with **[Approve] [Reject]** (copy via `lib/messages` — no raw codes, invariant 5).
4. **Approve** (admin-gated server action, advisory-locked) → release the hold + set the crew row's email to the new value. **This is the only moment** a claimed session is evicted (old-email holder fails the live email check on next request → `session_mismatch`) and the new email becomes claimable.
5. **Reject** → convert the hold to `undo_override` pinning the old email; feed shows *"rejected — keeping <old>."* It releases per §4.3 when the sheet's email for that crew changes again.

**Guard conditions:** Approve/Reject are idempotent against a stale hold (if the hold already released via sheet reconciliation, the action no-ops with a typed "already resolved" result, surfaced through `lib/messages`). Concurrent sync + approve are serialized by the per-show advisory lock.

---

## 6. The changes feed (admin show page)

### 6.1 Data source
Backed by `sync_audit` (`supabase/migrations/20260501001000_internal_and_admin.sql:204`), already indexed `(show_id, applied_at desc)` and `(drive_file_id, applied_at desc)` — purpose-built for a per-show reverse-chron feed. **Extension:** today `sync_audit` is written only on the review-Apply path (`lib/sync/applyStaged.ts:881`). Auto-applies (Phase 2) must **also** write `sync_audit` rows so the feed shows them. Open `sync_holds` rows are joined in as `pending` / `undone` entries.

### 6.2 Entry shape & scope
Each feed entry: `{ summary, occurred_at, status, action }` where `status ∈ {auto_applied, pending, rejected, undone}` and `action ∈ {undo, approve_reject, none}`. **Scope (signal-rich, not noisy):** entries cover the invariant-flagged changes (MI-6…MI-14, asset drift) + notable structural changes (crew add/remove). Routine field syncs that trip no invariant are **not** individually logged. **Cap/truncation:** the feed shows the most recent *N* (proposed 50) entries with an explicit "older changes not shown" note when truncated (never a silent cut).

### 6.3 Undo flow (per-item, one-step)
On an `auto_applied` entry → **Undo** (admin-gated, advisory-locked):
1. Restore the affected entity from the **retained prior snapshot** (§7): for a removal/rename, re-insert the prior entity row and suppress the sheet's replacement; for a field change, restore the prior value.
2. Write an `undo_override` hold (`domain='crew_identity'` for rename/removal, `held_value=<prior entity row>`; `entity_key` = the prior crew name; for a rename the key also records the suppressed added name so the apply skips re-adding it).
3. The show **keeps syncing**; only the held entity is pinned. The feed entry flips to *"undone — overriding the sheet."*
4. **Release** per §4.3: when the sheet's value for that entity next changes, the override releases and the new value applies. One-step — the override pins the immediately-prior value only.

**Guard conditions:** Undo is available only while the entry reflects current live state (if a newer sync already changed that entity, Undo is disabled with a "superseded — re-sync changed this" note). Undo of a `crew_identity` whose prior row's email is now claimed by someone else (via the unique-email index) is rejected with a typed conflict result.

---

## 7. Prior-snapshot retention

Undo restores an entity to its pre-apply value, so the **last applied snapshot per show** is retained. **Decision (approved):** store the full `parse_result` on the `sync_audit` row (today it stores `parse_result_summary` only — `sync_audit` DDL at migration `:211-214`). One-step undo reads the most recent `sync_audit.parse_result` for the show. (Rejected alternative: a `last_applied_snapshot` column on `shows`.) Retention is one row deep for undo purposes; older `sync_audit` rows keep their summary for the feed history but need not retain full payloads (storage bound).

---

## 8. UI surfaces (Opus / impeccable)

- **Changes feed** — new component on the admin show page (`app/admin/show/[slug]/`). Reverse-chron list; each entry renders summary + relative time + status + action. Reduced-motion + dimensional invariants per DESIGN.md; real-browser layout assertion per the layout-dimensions rule.
- **MI-11 gate card** — a **slimmed** replacement for the whole-parse `StagedReviewCard` (`components/admin/StagedReviewCard.tsx`): just the email-change Approve/Reject for the held crew, not a full-parse review. The legacy whole-parse `ParsePanel` review path is removed (no invariant stages a whole parse anymore except the held-email case).
- **Undo / resolve affordances** in feed entries (44px tap targets, accessible names, WCAG per DESIGN.md).

All UI ships under invariant 8 (impeccable dual-gate) and the UI-always-Opus routing rule.

---

## 9. Migration & test surface

**Meta-tests created/extended (declared up front per writing-plans discipline):**
- `tests/db/postgrest-dml-lockdown.test.ts` — **extended** with a `sync_holds` `RPC_GATED_TABLES` row + REVOKE.
- `validation-schema-parity` — **automatic** coverage of `sync_holds` (new `public` table → manifest; regen + apply to validation per the gate's checklist).
- New structural test pinning the **single advisory-lock holder** across the hold read/write (extends `tests/auth/advisoryLockRpcDeadlock.test.ts` topology if a new RPC surface is added).

**Migrations:** `sync_holds` table + REVOKE + RPC(s); `sync_audit.parse_result` column add (`add column if not exists parse_result jsonb`); apply both to the validation project (the `validation-schema-parity` gate will fail until they land there).

**Key test cases (each names its failure mode):**
- Decision rule: MI-11-only parse → email held, rest applied (catches "whole-parse still staged").
- Hold-aware apply: held crew keeps old email while a sibling crew's email change (no MI-11? — N/A) / a hotel drop applies (catches "hold blocks unrelated changes").
- MI-11 Approve evicts old-email claim + enables new (catches "email applied without claim transition").
- Undo restores one entity, leaves siblings (catches "undo clobbers FYI changes").
- Undo + sheet-still-conflicts → no re-apply next sync; sheet-reconciled → override releases (catches whack-a-mole + stuck-override).
- Same-email rename (MI-12) auto-applies and an OAuth viewer self-heals (catches "rename gated" regression).

**Invariants preserved:** advisory-lock single-holder (2), email canonicalization at boundaries (3), no global cursor (4), no raw error codes in feed copy (5), spec-canonical (7), impeccable dual-gate on UI (8), Supabase call-boundary discipline (9).

---

## 10. Routing

- **Backend** (decision rule, `sync_holds` + RPCs + REVOKE, hold-aware apply, snapshot retention, feed data layer, migrations) — Codex-eligible per ROUTING.md.
- **UI** (feed, gate card, undo affordances) — Opus + impeccable (UI-always-Opus rule).
- Per-domain split recorded in the milestone handoff.

---

## 11. Open questions for spec review
- `sync_audit.parse_result` storage growth — acceptable to retain full payload only on the most-recent row per show, summary on older? (Proposed yes.)
- Exact `entity_key` encoding for a `crew_identity` undo of a rename (records both retained + suppressed names) — confirm the format in the plan.
- Feed entry cap (proposed 50) and whether sync *failures* (`sync_log`, distinct from `sync_audit`) appear in the same feed or a separate "technical log" expander.
