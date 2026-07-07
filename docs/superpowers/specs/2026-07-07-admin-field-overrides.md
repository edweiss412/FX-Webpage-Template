# Spec — Admin Field Override Layer (audit 3.2)

**Date:** 2026-07-07
**Slug:** admin-field-overrides
**Audit source:** `docs/audits/e2e-real-world-variation-preparedness-2026-07-07.md` §6 Flow 3 item 3.2 (also §5 P0-2, §5 seam scenario I, §7 item 3).
**Status:** Autonomous-ship (both spec + plan user-review gates waived per AGENTS.md autonomous-ship gate; user approved in brainstorming 2026-07-07).

---

## 1. Problem

Doug (non-technical operator) cannot correct a wrong displayed value and make the fix stick.

- The parser sometimes produces a **confident-but-wrong** value (mis-read date, glued/mis-split hotel name, typo'd crew name, wrong role). It renders as authoritative on the crew page with **zero signal** (audit P0-2). The `unknown_asterisk` fail-closed valve only fires when the parser *knows* it doesn't know.
- The only correction loop today is edit-the-Google-Sheet → "Re-sync from Drive" (`components/admin/ReSyncButton.tsx`, audit Flow 3.1). That fails when the *sheet is correct* and the parser mis-read it, or when Doug wants a display value that differs from the sheet.
- Every re-sync is a **full replace**: `applyParseResult` (`lib/sync/applyParseResult.ts:91`) unconditionally rewrites crew, hotels, transportation, contacts, and `shows_internal`; `applyShowSnapshot` (`lib/sync/runScheduledCronSync.ts:1304`) rewrites `shows.dates`/`shows.venue`. So even a manual DB edit is clobbered on the next sync (audit seam scenario I).

**Goal:** a durable **admin override** — Doug sets the right value in-app; it survives every re-sync; the surface shows "overridden — sheet says X"; one click reverts.

## 2. Scope

### 2.1 Overridable fields (6)

| Domain | Field | Storage target | Natural id (match_key) |
|---|---|---|---|
| `show` | `dates` | `shows.dates` (jsonb) | `''` (singleton — one shows row) |
| `show` | `venue` | `shows.venue` (jsonb) | `''` (singleton) |
| `crew` | `name` | `crew_members.name` (text) | parsed crew name |
| `crew` | `role` | `crew_members.role` (text) | parsed crew name |
| `hotel` | `hotel_name` | `hotel_reservations.hotel_name` (text) | parsed hotel name (+ ordinal disambiguator, §5.3) |
| `hotel` | `hotel_address` | `hotel_reservations.hotel_address` (text) | parsed hotel name (+ ordinal) |

Column citations: `shows.dates`/`shows.venue` (`supabase/__generated__/schema-manifest.json` `shows`); `crew_members.name text`, `role text not null` (`supabase/migrations/20260501000000_initial_public_schema.sql:37`); `hotel_reservations.hotel_name`/`hotel_address` (schema-manifest `hotel_reservations`).

### 2.2 Non-goals

- **No new overridable fields beyond the 6.** Contacts, transportation, rooms, financials, run-of-show, flight_info, phone, email are out of scope. (Email is additionally out because it is identity/auth-load-bearing and canonicalization-gated — invariant 3.)
- **No free-form value editing UI beyond a single-line text/structured input per field.** The dates/venue editors reuse the existing structured shapes; no rich editor.
- **No override of parser *behavior*** (no per-show parser config). Overrides act on parse *output* only.
- **No bulk/CSV override import.** One field at a time.
- **Crew `email` is never overridable** (see above).

### 2.3 Success criteria

1. Doug overrides any of the 6 fields from either the review wizard **or** the live-show admin page; the live row shows the override value immediately.
2. The override survives an arbitrary number of full-replace re-syncs with **stable crew_members.id** (picker cookies survive).
3. Every overridden field renders an "Overridden — sheet says X" chip on the admin surfaces; the crew page renders the override value as normal data (no chip on crew side).
4. Revert restores the current sheet value in one click.
5. When the sheet changes so an override's target vanishes, the override **deactivates** (row reverts to parsed value) and Doug gets a **needs-attention** signal with re-point / discard actions. Never silent.
6. All invariants (2, 3, 5, 9, 10) hold; new RPC-gated table is PostgREST-locked; new codes follow §12.4 lockstep; migration reaches validation.

---

## 3. Architecture — write-time **pre-write transform** (not post-write rewrite)

### 3.1 The mechanism and why pre-write

The user-approved intent (brainstorming): overrides applied at **write-time** in the same per-show advisory-locked transaction; readers (crew page, picker, auth, admin) stay untouched and read normal live rows; the chip needs the sheet value stored on the override row.

**Refinement discovered during live-code verification (documented so the reviewer does not relitigate):** the override must be applied as a **transform of the parse output *before* `applyParseResult`'s delete/upsert**, mirroring `holdAwareApply` (`lib/sync/holds/holdAwareApply.ts:151`; consumed at `applyParseResult.ts:100-116`) — **not** as a post-write in-place UPDATE of the just-written row.

Rationale (the id-churn failure of post-write rename):
- `crew_members` PK is `id uuid`; natural key `unique (show_id, name)` (`20260501000000_initial_public_schema.sql:32,43`). Re-sync does `deleteCrewMembersNotIn(showId, names)` then `upsertCrewMembers` `on conflict (show_id, name) do update` (`runScheduledCronSync.ts:1560,1567-1584`).
- The **picker resolves crew identity by `crew_members.id`** in the signed cookie (`lib/auth/picker/resolvePickerSelection.ts:52,87,96-97,154` — matches `.eq("id", entry.id)`, never consults name).
- If a name override were applied post-write (row renamed 'Jon'→'John' after apply), the **next** sync's parse still yields 'Jon': `deleteCrewMembersNotIn(['Jon',…])` deletes the 'John' row (not in the parsed set), then `upsert('Jon')` inserts a **new row with a new id**. The picker cookie (old id) breaks on every sync.
- With the **pre-write transform**, the parsed crew list is folded 'Jon'→'John' *before* delete/upsert: `deleteCrewMembersNotIn(['John',…])` keeps the persisted 'John' row; `upsert(show_id,'John') do update` updates it **in place**; `id` is stable across every sync. Picker cookie survives. Same visible result, correct identity.

The two mechanisms are visually identical to Doug; only the pre-write one is correct across syncs. This spec mandates pre-write.

### 3.2 Injection points (two, because two writers touch overridable columns)

The locked apply transaction is opened at `runScheduledCronSync.ts:1801` (`sql.begin`), lock acquired JS-side in `withShowLock`/`lockedShowTx.ts:57-62,74` (single JS-side holder — invariant 2). Inside it, in order:

1. `applyShowSnapshot` (`runScheduledCronSync.ts:1304`) — writes `shows.dates`/`shows.venue` (UPDATE arms at `:1432`,`:1458`). **`show`-domain overrides (dates/venue) must transform the ParseResult *before* this writer consumes it.**
2. `runPhase2` → `applyParseResult` (`lib/sync/phase2.ts:369`) — writes crew + hotels. **`crew`/`hotel`-domain overrides transform the crew list + hotel rows *before* `applyParseResult`'s delete/upsert.**

Therefore the override transform runs **once, at the earliest point after parse where the full `ParseResult` exists and we are inside the lock**, producing an **overridden `ParseResult`** threaded through both writers. Concretely: a new `applyOverrides(tx, showId, parseResult) → { overriddenParseResult, sheetValues, staleOverrides }` step invoked before `applyShowSnapshot`, threading the overridden result forward. (The plan pins the exact call site; the ParseResult originates upstream of `applyShowSnapshot` in the same locked section.)

Readers are **untouched** — no crew-page, picker, auth, or admin read-path change. This preserves invariant 9 boundaries and keeps blast radius to the write path + admin edit surfaces.

### 3.3 sheet_value capture + stale detection (same step)

`applyOverrides` also, for each active override:
- Computes the field's **parsed value** by matching `match_key` against the original (pre-transform) ParseResult, and writes it to `admin_overrides.sheet_value` (refreshed every sync — powers the chip).
- If `match_key` is **not present** in the parsed identifiers (crew name gone, hotel name gone), the override is **deactivated** (`active=false`) and a stale `admin_alert` is emitted (§6). `show`-domain overrides never go stale (singleton always present; if parsed dates/venue is null, `sheet_value=null` and the override still applies).

`sheet_value` refresh and `active=false` writes to `admin_overrides` happen **inside** the locked tx (they mutate override state alongside the apply). The stale `admin_alert` emit is **post-commit, outside the lock** (invariant 10).

---

## 4. Data model — `admin_overrides` table

### 4.1 DDL (new migration `20260707000000_admin_field_overrides.sql`)

```sql
create table if not exists public.admin_overrides (
  id             uuid primary key default gen_random_uuid(),
  show_id        uuid not null references public.shows(id) on delete cascade,
  domain         text not null,
  field          text not null,
  match_key      text not null,          -- '' for show singleton; parsed crew name; parsed hotel name (+ '' ordinal for dups)
  override_value jsonb not null,         -- structured (dates/venue) or json string (name/role/hotel_*)
  sheet_value    jsonb,                  -- last parsed value; refreshed each sync; null = never matched / parsed null
  active         boolean not null default true,   -- false = deactivated (stale), row retained until repoint/discard
  created_by     text not null,          -- canonicalized admin email
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint admin_overrides_domain_field_chk check (
       (domain = 'show'  and field in ('dates','venue')          and match_key = '')
    or (domain = 'crew'  and field in ('name','role'))
    or (domain = 'hotel' and field in ('hotel_name','hotel_address'))
  ),
  constraint admin_overrides_uniq unique (show_id, domain, field, match_key)
);
create index if not exists admin_overrides_show_active_idx
  on public.admin_overrides (show_id) where active;

-- PostgREST DML lockdown (RPC-gated table discipline; invariant + BL-ADMIN-POSTGREST-DML-LOCKDOWN).
-- created_by holds an admin email (PII) → NO select for anon/authenticated either. Crew page never
-- reads this table (it reads the already-overridden live rows). All admin reads go via service-role
-- or the admin-only RLS policy below.
-- Reads are SERVICE-ROLE ONLY. The admin UI loads override state server-side (admin pages/actions
-- already hold a service-role client behind requireAdmin/requireAdminIdentity); the crew page never
-- reads this table. So NO SELECT for anon/authenticated and NO authenticated RLS policy — a
-- `for select to authenticated` policy would be dead anyway once the base SELECT privilege is
-- revoked (RLS narrows granted privileges; it does not grant them). RLS is enabled as belt-and-
-- suspenders (deny-by-default for authenticated; service_role bypasses RLS and has table privileges).
revoke insert, update, delete, select on table public.admin_overrides from anon, authenticated;
alter table public.admin_overrides enable row level security;
-- (no policy: authenticated/anon get zero rows; all reads flow through service_role)
```

Idempotency: `create table if not exists` + `create index if not exists`; the REVOKE/GRANT are idempotent. Apply-twice safe.

### 4.2 CHECK / enum migration matrix

This is a **new** table; there is no pre-existing enum to migrate. The composite CHECK (`admin_overrides_domain_field_chk`) enumerates every valid `(domain, field)` pair × the `match_key=''` requirement for the singleton `show` domain:

| domain | field | match_key | CHECK admits? |
|---|---|---|---|
| show | dates | `''` | ✓ |
| show | venue | `''` | ✓ |
| show | dates | non-empty | ✗ (rejected) |
| crew | name | any | ✓ |
| crew | role | any | ✓ |
| hotel | hotel_name | any | ✓ |
| hotel | hotel_address | any | ✓ |
| any | (other field) | any | ✗ |

No transitional dual-value window (single new table, one-shot). No retired columns.

### 4.3 `override_value` / `sheet_value` shapes (guard conditions)

`jsonb` to accommodate structured `dates`/`venue` and scalar strings uniformly:
- `dates`: same shape as `shows.dates` (the parser's date structure). Guard: a malformed/empty dates override is rejected by the RPC before write (§7.4).
- `venue`: same shape as `shows.venue`.
- `name`/`role`/`hotel_name`/`hotel_address`: a JSON string. Guard: empty string / whitespace-only rejected by the RPC (a blank override is meaningless — Doug should revert instead). Length-capped (§7.4). `role` accepts any non-empty string (free-text — no enum; `20260501000000_initial_public_schema.sql:37`).
- `sheet_value` null: field was never matched this sync, OR the parsed value is genuinely null (parsed dates absent). The chip renders "sheet has no value" in that case (§8.5).

---

## 5. Per-domain apply mechanics

### 5.1 `show` domain (dates, venue) — singleton

- `match_key = ''`. Always one row per `(show_id, field)`.
- Apply: replace `parseResult.show.dates` / `.venue` with `override_value` before `applyShowSnapshot` writes. `sheet_value` = the original parsed dates/venue (may be null).
- Never stale.
- Immediate-apply RPC path (§7): `UPDATE public.shows SET dates = $override WHERE id = $show_id` (resp. `venue`).
- Revert: `UPDATE public.shows SET dates = $sheet_value WHERE id = $show_id`; delete override row.

### 5.2 `crew` domain (name, role) — matched by parsed name

- `match_key` = the **parsed** crew name (the sheet's name, pre-override).
- **role override**: in the pre-write transform, for the crew member whose parsed `name === match_key`, set `role = override_value`. Safe (role is display-only, free-text). `sheet_value` = parsed role.
- **name override**: fold the crew list `name: match_key → override_value` before delete/upsert (§3.1). `sheet_value` = parsed name (= match_key).
  - **No auth-table write needed.** The signed-link crew-auth table was **retired** in the M9.5 picker cutover (`drop table if exists public.crew_member_auth` — `supabase/migrations/20260523000099_cutover_drop_m9_5.sql:26`; absent from `schema-manifest.json`; zero `lib/` references; the term is on the M9.5 forbidden-surface list `tests/cross-cutting/no-m9-5-surfaces-in-m12-docs.test.ts` `TERMS`). Crew identity is now **id-keyed picker only**, and the apply-path `provisionAddedCrewAuth`/`revokeRemovedCrewAuth` tx methods are no-ops (`runScheduledCronSync.ts:1601-1609`). A name override therefore writes **only** `crew_members.name` (via the pre-write fold) with **no companion auth write** — nothing to reconcile.
  - **picker_epoch:** do **NOT** bump. Picker cookie is id-keyed and the id is stable (§3.1); a parser rename does not bump picker_epoch either (`unpublishShow.ts:152` comment; bumps only in rotate/reset/lifecycle RPCs — `20260523000004:37`, `20260523000003:33`, `20260601*`). Bumping would force an unnecessary re-pick.
  - **MI-7b:** unaffected. MI-7b/rename-staging is a **parser/staging-layer** concern keyed on parse output (`lib/parser/invariants.ts:329+`; crew rename = name set-difference in `applyParseResult.ts:121-126`). The override transforms parse output *before* the diff, so from the diff's perspective the roster is stable at the override value across syncs → no spurious re-stage. (If instead the override were fed back as a *parser* input it would trip MI-7b; it is not.)
- Both crew overrides go **stale** when `match_key` ∉ parsed crew names.

**Dual override on one member:** a member may have both a `name` and a `role` override (two rows, same `match_key` = parsed name). Apply order: role first (keyed on parsed name), then name fold. Both share the same `match_key`; the name override does not change the `role` override's key (both key on the *parsed* name). ✓

### 5.3 `hotel` domain (hotel_name, hotel_address) — matched by parsed name (+ ordinal)

- Hotels are **fully replaced** each sync (`replaceHotelReservations`, `applyParseResult.ts:132`) with unstable ids; MI-7b keys hotels on **ordinal** (`invariants.ts:329+`).
- **match_key** = the parsed `hotel_name`. Matching by name (not ordinal) is robust to reorder (a hotel added at the top shifts ordinals but not names).
- **Duplicate parsed hotel names** (two reservations, same `hotel_name`): disambiguate by appending the **ordinal among same-named rows** to `match_key`, using a `` (unit-separator) delimiter that cannot occur in a hotel name: `match_key = "Marriott"` for a unique name, `match_key = "Marriott0"`, `"Marriott1"` for the 1st/2nd same-named. The UI hides the delimiter and shows "Marriott (2nd)". This keeps the natural-name match while resolving the dup edge deterministically.
- Apply: in the pre-write transform, for the hotel row(s) whose parsed name (+dup-ordinal) matches, set `hotel_name` / `hotel_address` = `override_value`. `sheet_value` = parsed value.
- Stale when the (name + dup-ordinal) match_key is absent from the parsed hotel set.
- Immediate-apply RPC path: hotel rows have unstable ids, so the RPC applies by re-deriving the current row: `UPDATE public.hotel_reservations SET hotel_name = $override WHERE show_id = $1 AND ordinal = $current_ordinal` — the RPC receives the **current ordinal** from the UI (which read it live) as a CAS anchor; if the ordinal no longer matches the expected name, the RPC returns a stale-review error (row changed since review). The durable re-application is the sync transform (by name).

---

## 6. Stale policy + signal

When `applyOverrides` finds an active override whose `match_key` is absent from the freshly parsed identifiers:

1. Set `admin_overrides.active = false` **inside the locked tx** (atomic with the apply). The live row therefore renders the **parsed** value (the override no longer transforms it).
2. **Durable needs-attention signal = the inactive row itself** (this is the "never silent" guarantee). `loadNeedsAttention` gains a **4th derived stream**: `select … from admin_overrides where not active` (joined to `shows`), added to `buildNeedsAttention` (`lib/admin/loadNeedsAttention.ts:291`, alongside the existing `pending_ingestions`/`pending_syncs`/`admin_alerts` streams; input type in `lib/admin/needsAttention.ts`). Because the row's `active=false` commits in the SAME transaction as the apply, the signal cannot be lost — there is no post-commit step whose failure could hide it. A crash after commit still leaves an inactive row that the next needs-attention load surfaces.
3. **Best-effort push (not the durable guarantee):** post-commit (outside the lock), also emit an `admin_alert` via `upsertAdminAlert` (`lib/adminAlerts/upsertAdminAlert.ts:46`) with a new `AdminAlertCode` (`OVERRIDE_TARGET_MISSING`, or `OVERRIDE_NAME_CONFLICT` for the collision case, §10) so the realtime bell/NotifBell lights up immediately. If this emit fails, the needs-attention row from step 2 still stands — the alert is additive, not load-bearing. The alert is therefore **not** routed via `INBOX_ROUTED_CODES` (avoids double-surfacing the same item as both a derived-stream row and a routed-alert row).
4. The needs-attention row offers **re-point** (update `match_key` to a current identifier, reactivate) and **discard** (delete the override row) — both via `set_field_override` RPC variants (§7).

Deactivate-not-delete means a transient sheet glitch (row briefly dropped) does not lose Doug's correction; he re-points or discards deliberately. Accumulation is bounded: deactivated rows are visible needs-attention items that Doug resolves.

**Runtime name-collision (target present but output collides).** The RPC write-time guard (§7.4) prevents *creating* a colliding crew-name override, but a *later* sync can introduce the collision — e.g. the sheet adds a real crew member whose name equals an existing override's output. If `applyOverrides` detects that applying an active crew-name override would produce two crew rows sharing `(show_id, name)` (fold collision), it **must not** apply the fold (that would collapse rows — the audit-2 finding). Instead it **deactivates** the override (`active=false` in-tx, row renders parsed value) — the same durable inactive-row needs-attention signal as stale (§6 step 2) — and additionally emits a best-effort `admin_alert` `OVERRIDE_NAME_CONFLICT` (§10) bell push whose copy tells Doug his override name now clashes with a real crew member; the needs-attention row offers re-point (choose a different name) or discard. Same deactivate+surface machinery as stale, different code + copy. The `overrideApply` test asserts no row collapse occurs on a manufactured collision (§13).

---

## 7. Writer RPC — `set_field_override`

### 7.1 Shape

A single SECURITY DEFINER RPC handles create/edit, revert, re-point, and discard via a `p_op` discriminator. Mirrors `set_pull_sheet_override` (`supabase/migrations/20260706000000_pull_sheet_override.sql:21-93`) for the lock + CAS + REVOKE pattern, and the MI-11 hold approve/reject action layering (`lib/sync/holds/mi11GateActions.ts:107-113`) for the JS call boundary.

```sql
create or replace function public.set_field_override(
  p_drive_file_id text,
  p_op            text,        -- 'upsert' | 'revert' | 'repoint' | 'discard'
  p_domain        text,
  p_field         text,
  p_match_key     text,
  p_new_match_key text,        -- repoint target; null otherwise
  p_override_value jsonb,      -- upsert only
  p_actor         text,        -- canonicalized admin email
  p_expected_sheet_value jsonb,-- CAS: the sheet_value the admin's UI last saw (row-state guard)
  p_current_ordinal int        -- hotel immediate-apply anchor; null for show/crew
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$ ... $$;
```

### 7.2 Body obligations

1. **Per-show advisory lock in-RPC (single holder for this path):** `perform pg_advisory_xact_lock(hashtext('show:' || p_drive_file_id));` — the JS action never locks (mirrors `set_pull_sheet_override:42`, and the MI-11 PF15 no-inline-`.rpc` rule at `feed.ts:10-14`). Resolve `p_drive_file_id → show_id` inside the lock.
2. **Belt-and-suspenders auth:** `execute` revoked from anon/authenticated, granted to `service_role` only (§7.5). The app-layer gate is `requireAdminIdentity()`.
3. **Row-state CAS:** read the current `sheet_value` (or current row value) under the lock; if it differs from `p_expected_sheet_value`, raise `errcode 40001` (→ route maps to 409 stale_review), preventing a stale admin page from clobbering a newer sync's value. For hotels, additionally verify `p_current_ordinal` still names the expected hotel.
4. **Op semantics:**
   - `upsert`: validate `override_value` (§7.4) incl. the name-collision guard; upsert `admin_overrides` (`active=true`); immediately apply to the live row via the RPC immediate-apply helper (§7.3). No auth-table write (§5.2).
   - `revert`: restore `sheet_value` to the live row; delete the override row. No auth-table write.
   - `repoint`: update `match_key = p_new_match_key`, `active=true`; apply to the newly-targeted live row.
   - `discard`: delete the override row (no live-row change — the row already shows the parsed value since deactivation).
5. Return a discriminated `jsonb` result (`{ ok, value | code }`) for `mapRpcOutcome` (`mi11GateActions.ts:34`, invariant 9).

### 7.3 Two distinct apply paths; share ONLY match + validate

The two paths must **not** share a live-row updater — a shared row-updater is exactly what would let the sync path drift back into post-write live-row UPDATEs and reintroduce the id-churn class (§3.1). They differ in kind:

- **Sync path = pure pre-write transform.** `applyOverridesToParseResult(parseResult, activeOverrides) → { overriddenParseResult, sheetValues, staleOverrides, conflicts }`. Takes and returns a `ParseResult`; performs **no live-row writes**. The overridden `ParseResult` is threaded into `applyShowSnapshot` + `applyParseResult`, which do the delete/upsert exactly as today. This path is id-stable *structurally* — it writes nothing directly; the existing upsert-by-`(show_id,name)` keeps ids stable (§3.1).
- **RPC path = DB immediate-apply.** `applyOverrideToLiveRow(tx, show_id, override)` — one targeted `UPDATE` of a single live row (shows / crew_members by `(show_id,name)` / hotel_reservations by ordinal), used ONLY by `set_field_override` for instant feedback. Never runs on the sync path.

**Shared, and only these two pure helpers:** `matchOverrideTarget(...)` (natural-id + dup-ordinal matching, §5.3) and `validateOverrideValue(field, value, showContext)` (guards + the name-collision check, §7.4). Matching and validation are identical across paths; *application* is deliberately not shared.

### 7.4 Value guard conditions (RPC-enforced)

| field | reject when | cap |
|---|---|---|
| dates | not a valid dates jsonb shape / empty | — |
| venue | not a valid venue jsonb shape | — |
| name | empty/whitespace-only after (exempt) trim; `= match_key` (no-op); **or collides** — equals any *other* current parsed crew name, any current live crew name, or any *other* active crew-name override's output for this show (would collapse two `(show_id,name)` rows on upsert). | 200 chars |
| role | empty/whitespace-only | 120 chars |
| hotel_name | empty/whitespace-only | 200 chars |
| hotel_address | empty/whitespace-only | 300 chars |

A name `.trim()` in `lib/sync` or the RPC-adjacent TS is flagged by `tests/admin/no-inline-email-normalization.test.ts` (`FORBIDDEN_PATTERNS` includes `.trim()`, scope `lib/sync` — `:54-59,97-98`). Any such trim carries a same-line `// canonicalize-exempt: crew display name, not an email` comment (`:44`).

### 7.5 Grants

```sql
revoke execute on function public.set_field_override(text,text,text,text,text,text,jsonb,text,jsonb,int)
  from public, anon, authenticated;
grant  execute on function public.set_field_override(...) to service_role;
```

### 7.6 Crew-name immediate-apply anchors (per-op)

The RPC's immediate live-row `UPDATE` for a **crew name** must anchor on the name the row **currently** holds, which is NOT always `match_key`: once a name override is active, the live `crew_members.name` is the override's `override_value`, not the parsed `match_key`. Anchors per op (all under the advisory lock, with a CAS on the stored override row so a stale UI can't clobber a newer state):

| Op | Live-row anchor (`WHERE show_id=$1 AND name=…`) | New value | CAS |
|---|---|---|---|
| `upsert` — **first** override on this member (no active row yet) | `match_key` (the parsed/live name) | `override_value` | `p_expected_sheet_value` = current parsed name |
| `upsert` — **edit** an already-active override (e.g. `John`→`Jonathan`) | the **currently stored** `override_value` (the live name `John`) | new `override_value` | expected = the currently stored `override_value` |
| `revert` | the currently stored `override_value` (live name) | `sheet_value` (the parsed name) | expected = currently stored `override_value` |
| `repoint` | validate BOTH: old target (`match_key` or stored value) exists to release, new target is a live parsed name to bind | applies to the new target | expected = current row (match_key + active) |

If the anchor matches **zero** rows (the live name isn't what the UI thought — a sync moved it), the RPC raises the CAS 409 `stale_review` (§7.2.3) rather than silently no-op'ing, so the admin UI is told to reload rather than showing a stale value until the next sync. `show`/`hotel` domains anchor on the shows PK / hotel ordinal respectively and do not have this parsed-vs-current ambiguity (single row / ordinal CAS already covers it). Tests: edit-active-name-override and revert-active-name-override both assert the correct live row updates and a wrong-anchor raises 409 (§13).

---

## 8. UI — two edit surfaces, one component

UI is **Opus-only** (invariant: routing "UI work is always Opus"); ships under the impeccable v3 dual-gate (invariant 8: `/impeccable critique` + `/impeccable audit`, HIGH/CRITICAL fixed or DEFERRED before cross-model review).

### 8.1 Shared `<OverrideableField>` component

`components/admin/overrides/OverrideableField.tsx` — one component used by both surfaces. Props:

```ts
type OverrideableFieldProps = {
  driveFileId: string;
  domain: "show" | "crew" | "hotel";
  field: "dates" | "venue" | "name" | "role" | "hotel_name" | "hotel_address";
  matchKey: string;            // '' for show
  currentValue: React.ReactNode | string; // the live (possibly overridden) rendered value
  override: OverrideState | null;          // { overrideValue, sheetValue, active } | null
  currentOrdinal?: number;     // hotel only (CAS anchor)
  disabled?: boolean;          // e.g. archived show
};
```

Renders the value + (when overridden & active) the "Overridden — sheet says X" chip + edit/revert affordances. It is a client component that calls the server action (§8.4). Guard: `override === null` → plain value + an "Edit" affordance; `override.active === false` (stale) → parsed value + a muted "Override paused — sheet no longer has «matchKey»" note with re-point / discard.

### 8.2 Chip

Reuse `components/admin/ChangeFeedBadge.tsx` (labeled text pill, DESIGN tokens `bg-info-bg`) rather than `DataQualityBadge` (icon-only). Chip text: `Overridden` with a title/expander showing `sheet says "<sheetValue>"`. Not on the crew page (crew reads the override value as normal data — no chip, per §2.3).

### 8.3 Surface A — review wizard section cards

`components/admin/wizard/step3ReviewSections.tsx` — wrap the relevant rows in `FieldRowList` (`:279`, the `label:value` grid) with `<OverrideableField>`:
- `VenueBreakdown` (`:787`) → venue.
- `CrewBreakdown` (`:1118`) → per-member name + role.
- hotels section body → hotel_name + hotel_address.
- dates: the show-level date row.

The wizard passes `driveFileId` (`s.dfid`) and the parsed values already present on `SectionData` (`:2870`). Editing here mutates the live row immediately (pre-publish rows are live rows).

### 8.4 Surface B — live-show admin detail

`app/admin/show/[slug]/page.tsx` (`AdminShowPage:140`, gated `requireAdmin()` `:147`). Today it renders crew rows (`:709-743`) but **no dates/venue/hotel blocks** — these are **net-new render**:
- Crew rows (`:709-743`): wrap name + role with `<OverrideableField>`.
- **New "Show details" block**: dates + venue, each an `<OverrideableField>`.
- **New "Hotels" block**: per-reservation hotel_name + hotel_address.

Server action `app/admin/show/[slug]/_actions/overrides.ts` — thin layer: `requireAdminIdentity()` gate → delegate to `lib/overrides/setFieldOverride.ts` helper (which does `createSupabaseServerClient()` + `supabase.rpc("set_field_override", …)` + `mapRpcOutcome` + returns discriminated result), then **post-commit** `logAdminOutcome({ code: "FIELD_OVERRIDE_SET"|"FIELD_OVERRIDE_REVERTED", … })` (§11) + `revalidateShow`. **No inline `.rpc` in the action** (deadlock rule, `feed.ts:10-14`).

### 8.5 Guard conditions (every prop / state)

| State | Renders |
|---|---|
| `override === null` | Live parsed value + "Edit" affordance. |
| `override.active`, `sheetValue` non-null | Override value + "Overridden — sheet says «sheetValue»" chip + Edit/Revert. |
| `override.active`, `sheetValue === null` | Override value + "Overridden — sheet has no value" chip + Edit/Revert. |
| `override.active === false` (stale) | **Parsed** value + muted "Override paused — sheet no longer has «matchKey»" + Re-point/Discard. |
| `disabled` (archived show) | Value read-only, no affordances. |
| `currentValue` empty/parsed-null, no override | Existing empty-state copy (unchanged). |

### 8.6 Dimensional invariants

The chip + edit affordance sit inside `FieldRowList`'s grid row (`grid-cols-[7.5rem_minmax(0,1fr)]`, `step3ReviewSections.tsx:283`). The value cell (`minmax(0,1fr)`) must contain value + chip + affordance without overflowing the row. **Dimensional invariant:** the value cell is `min-w-0` (already `minmax(0,1fr)`); the chip wraps below the value on narrow widths (flex-wrap), never forcing horizontal scroll. A real-browser Playwright assertion verifies the value cell's rendered width ≤ its grid track width for a long override value at 375px and 1280px viewports.

### 8.7 Transition inventory

States: `plain` (no override), `editing` (input open), `overridden`, `stale`. Pairs:

| From → To | Treatment |
|---|---|
| plain → editing | instant (input appears; no animation needed) |
| editing → overridden | instant on save success; chip appears (no motion required — data change) |
| editing → plain | instant on cancel |
| overridden → editing | instant (input pre-filled with override value) |
| overridden → plain | instant on revert (chip disappears) |
| overridden → stale | occurs on a **sync**, not an in-page action → next page load renders stale state; no in-page transition |
| stale → plain | instant on discard |
| stale → overridden | instant on re-point success |
| plain/overridden → error | inline error message under the field (via `lib/messages/lookup.ts`; no raw code — invariant 5) |

Compound: editing while a background sync deactivates the same override → on save, the RPC CAS (`p_expected_sheet_value`) mismatches → 409 stale_review → inline "This field changed since you opened it — reload" (mapped copy). No mid-animation compound (all instant).

---

## 9. Security & invariants matrix

| Invariant | Obligation | Where |
|---|---|---|
| **2** advisory lock single-holder | `set_field_override` locks in-RPC; JS action never locks. Sync overlay runs inside existing JS-side `withShowLock` (no new lock). Add migration filename to `advisoryLockRpcDeadlock.test.ts` `migrationFiles:33`. | §7.2, §3.2 |
| **3** email canonicalization | No email is overridable. `created_by` canonicalized at the action boundary before RPC. | §2.2, §7 |
| **5** no raw codes in UI | All override errors routed through `lib/messages/lookup.ts`; §10 codes have Doug-facing copy. | §8.7, §10 |
| **9** Supabase call-boundary | Override helper destructures `{data,error}`, distinguishes returned vs thrown, uses `mapRpcOutcome`; registered in `_metaInfraContract.test.ts` (or inline `// not-subject-to-meta`). | §8.4 |
| **10** mutation observability | `set_field_override` action is an **admin surface** → `AUDITABLE_MUTATIONS` row + `adminOutcomeBehavior.test.ts` success-branch proof. Emits post-commit, outside the lock. | §11 |
| PostgREST DML lockdown | REVOKE ins/upd/del from anon+authenticated on `admin_overrides`; add row to `postgrest-dml-lockdown.test.ts` `RPC_GATED_TABLES:147`. | §4.1, §12 |

### 9.4 RLS / SELECT posture

`admin_overrides.created_by` holds an admin email (PII). **Decision: reads are service-role only.** The crew page never reads `admin_overrides` (it reads the already-overridden live rows); the admin UI loads override state **server-side** through a service-role client already held behind `requireAdmin`/`requireAdminIdentity` (same pattern as other admin server reads). So: `revoke insert,update,delete,select` from anon+authenticated; `enable row level security` with **no policy** (belt-and-suspenders — authenticated/anon get zero rows even if a base grant later slips; `service_role` bypasses RLS). There is deliberately **no** `for select to authenticated` RLS policy — that would be inert once the base SELECT privilege is revoked (RLS narrows granted privileges, it does not grant them; this was the R2 contradiction). The lockdown meta-test row records `selectAnon=false, selectAuthenticated=false`. No PII reaches any non-service-role client.

---

## 10. Error / alert codes (§12.4 lockstep)

Four new codes: **two** forensic outcome codes (`FIELD_OVERRIDE_SET`, `FIELD_OVERRIDE_REVERTED` — logAdminOutcome only, NOT §12.4) and **two** admin-alert codes (`OVERRIDE_TARGET_MISSING`, `OVERRIDE_NAME_CONFLICT`). Only the two admin-alert codes touch §12.4 lockstep; each lands in **all** lockstep surfaces in one commit (spec §12.4 prose → `pnpm gen:spec-codes` → `lib/messages/__generated__/spec-codes.ts` → `lib/messages/catalog.ts` → `tests/cross-cutting/code-scenarios.ts` `CODE_SCENARIOS`; parity gate `tests/cross-cutting/codes.test.ts:70,74`).

| Code | Kind | Audience | Doug-facing copy (draft) |
|---|---|---|---|
| `FIELD_OVERRIDE_SET` | forensic outcome (`logAdminOutcome`) | — (not user-rendered) | n/a |
| `FIELD_OVERRIDE_REVERTED` | forensic outcome (`logAdminOutcome`) | — | n/a |
| `OVERRIDE_TARGET_MISSING` | `admin_alerts` (new `AdminAlertCode`) | doug | "An override you set no longer matches the sheet. The field is showing the sheet's value again — re-point the override to the right row or discard it." |
| `OVERRIDE_NAME_CONFLICT` | `admin_alerts` (new `AdminAlertCode`) | doug | "A name override you set now clashes with a real crew member of the same name. We paused it and are showing the sheet's name — re-point it to a different name or discard it." |

**Decided (not deferred):** `FIELD_OVERRIDE_SET` / `FIELD_OVERRIDE_REVERTED` are **forensic outcome codes only** — `logAdminOutcome.code` is a free `string` ("see the meta-test registry", `lib/log/logAdminOutcome.ts:9`), validated by the `AUDITABLE_MUTATIONS` registry, **not** the §12.4 catalog parity gate. They are NOT §12.4 rows and NOT in `catalog.ts` (precedent: `archive.ts:42` emits forensic `SHOW_ARCHIVED`, distinct from the user-rendered catalog code `SHOW_ARCHIVED_BY_ADMIN` at `catalog.ts:1741`). Only `OVERRIDE_TARGET_MISSING` goes through the full lockstep.

`OVERRIDE_TARGET_MISSING` and `OVERRIDE_NAME_CONFLICT` are **two** new `AdminAlertCode`s (`lib/adminAlerts/upsertAdminAlert.ts:3` union, 36 members → 38). Each fans out to `tests/messages/_metaAdminAlertCatalog.test.ts`, §12.4 prose + helpfulContext appendix, and the audience/identity matrices (~9 surfaces each per MEMORY `reference_admin_alert_code_lockstep_surfaces`). They are **not** added to `INBOX_ROUTED_CODES` — needs-attention surfaces stale/conflict overrides via the durable inactive-row stream (§6 step 2), so routing the alert too would double-list the item.

Additionally, a user-facing **stale-review** error surfaces on the CAS 409 path — reuse an existing `stale_review`/`SYNC_INFRA_ERROR` code if one fits (`mi11GateActions.ts` maps these); do not invent a new one if an existing code covers "row changed since you opened it."

---

## 11. Telemetry (invariant 10)

- `set_field_override` action → **admin surface** (body calls `requireAdminIdentity()`). Requires:
  - `AUDITABLE_MUTATIONS` registry row (`tests/log/_auditableMutations.ts:13`, shape `{file, fn, code}`): `{ file: "app/admin/show/[slug]/_actions/overrides.ts", fn: "setFieldOverrideAction", code: "FIELD_OVERRIDE_SET" }` (+ revert variant).
  - Executable success-branch proof in `tests/log/adminOutcomeBehavior.test.ts` (real logger via `setLogSink` spy `:8`): asserts the code is recorded on the committed-success branch.
- `logAdminOutcome` (`lib/log/logAdminOutcome.ts:27`, `AdminOutcome {code,source,actorEmail?,driveFileId?,showId?,result?,extra?}`) emitted **post-commit, outside the lock tx**. `actorEmail` = canonicalized admin email; **no secrets** (no share tokens; `match_key`/values are show content, allowed).
- The **wizard** surface (`step3ReviewSections` edit) calls the **same** action → same telemetry (no separate registry row per surface; per-function coverage).
- Stale/conflict `admin_alert` emit is separate, best-effort telemetry (the `OVERRIDE_TARGET_MISSING` / `OVERRIDE_NAME_CONFLICT` upsert), post-commit — additive to the durable inactive-row needs-attention signal (§6), never the sole signal.

---

## 12. Meta-test inventory (declared per AGENTS.md)

**Extends:**
- `lib/admin/loadNeedsAttention.ts` + `lib/admin/needsAttention.ts` — add the 4th derived stream (`admin_overrides where not active`) to `buildNeedsAttention` (`:291`); its existing test file gains a case asserting an inactive override surfaces as a needs-attention row.
- `tests/db/postgrest-dml-lockdown.test.ts` — add `admin_overrides` to `RPC_GATED_TABLES` (`:147`), `{selectAnon:false, selectAuthenticated:false, postBody:…}`.
- `tests/auth/advisoryLockRpcDeadlock.test.ts` — add migration filename to `migrationFiles` (`:33`); document `set_field_override` as an in-RPC single holder in the allow-list comments (`:100+`).
- `tests/log/_auditableMutations.ts` + `tests/log/adminOutcomeBehavior.test.ts` — registry rows + behavioral proof.
- `tests/messages/_metaAdminAlertCatalog.test.ts`, `tests/cross-cutting/codes.test.ts` — new codes.
- `tests/db/validation-schema-parity.test.ts` — satisfied by regen manifest + surgical validation apply.
- `tests/admin/no-inline-email-normalization.test.ts` — any name trim carries `// canonicalize-exempt`.

**Creates:**
- `tests/sync/overrideApply.test.ts` — the pre-write transform: override folds into crew list before delete/upsert; crew_members.id stable across two syncs (the id-churn regression, §3.1); name-collision fold-conflict deactivates without row collapse (§5.2/§6); hotel matched by name across reorder; show dates/venue overridden; sheet_value refreshed; **stale deactivation surfaces via the inactive-row needs-attention stream even when the post-commit alert emit throws** (durability test — §6 step 2 vs step 3).
- `tests/overrides/setFieldOverride.test.ts` — RPC ops (upsert/revert/repoint/discard), CAS 409, guard rejections (incl. name collision), lock held, **and the active-name-override anchors (§7.6): edit `John`→`Jonathan` and revert `John`→`Jon` both update the correct live row; a wrong anchor (live name moved by a concurrent sync) raises 409, not a silent zero-row no-op.**
- Real-browser layout assertion for the chip/field-row dimensional invariant (§8.6).

**Not applicable:** sentinel-hiding walker (no crew-page tile change); `_metaInfraContract` applies to the new override helper (registered).

---

## 13. Testing strategy (anti-tautology)

- **id-stability test derives from two real sync runs** — assert the *same* `crew_members.id` value before/after a second sync with an active name override; failure mode caught: post-write rename churning id (§3.1). Not "the function was called."
- **sheet_value assertion reads `admin_overrides.sheet_value` directly**, not a rendered container.
- **Chip DOM scan** clones the row and removes the value cell before asserting the chip text, so the assertion can't pass on the value alone.
- **Stale test** derives the vanished `match_key` from a fixture whose second-sync parse omits a crew member — expected alert code + `active=false` derived from the fixture, not hardcoded.
- **Hotel dup-name test** uses a fixture with two identical parsed hotel names; asserts the ``-ordinal disambiguation targets the right row.
- **CAS test** simulates a concurrent sync changing `sheet_value` between UI-read and RPC-call → 409.

---

## 14. Tier × domain × layer matrix

| Layer | show (dates/venue) | crew (name/role) | hotel (name/address) |
|---|---|---|---|
| DDL (admin_overrides) | shared table | shared | shared |
| CHECK | `field in (dates,venue), match_key=''` | `field in (name,role)` | `field in (hotel_name,hotel_address)` |
| Apply transform | replace parseResult.show before applyShowSnapshot | fold crew list before delete/upsert | replace hotel rows before replace |
| Live-row write (RPC immediate) | `UPDATE shows` | `UPDATE crew_members` | `UPDATE hotel_reservations` by ordinal |
| Auth reconcile | N/A | **none** (auth table retired M9.5; picker id-keyed) | N/A |
| picker_epoch | N/A | **no bump** | N/A |
| Stale possible? | no (singleton) | yes | yes |
| Match key | `''` | parsed name | parsed name + dup-ordinal |
| Wizard UI | date row + VenueBreakdown | CrewBreakdown rows | hotels body |
| Live-show UI | **new** Show-details block | crew rows :709-743 | **new** Hotels block |
| Revert | UPDATE shows = sheet_value | UPDATE crew_members = sheet_value, **no auth write** (anchor = current override_value, §7.6) | UPDATE hotel by ordinal |
| Tests | overrideApply + RPC + layout | + id-stability + collision guard | + dup-name + reorder |

---

## 15. Watchpoints (do-not-relitigate — for the reviewer)

1. **Pre-write transform, NOT post-write rename** — this is a deliberate correctness refinement of the approved "write-time overlay", justified by the crew_members.id-churn/picker-cookie failure of post-write rename (§3.1, cited `resolvePickerSelection.ts:96`, `runScheduledCronSync.ts:1560-1584`). Not a scope change.
2. **picker_epoch deliberately NOT bumped on name override** — id-keyed cookie survives; matches parser-rename behavior (`unpublishShow.ts:152`). Bumping would be a worse UX (forced re-pick).
3. **Deactivate-not-delete on stale** — a deliberate anti-data-loss choice (transient sheet glitch must not lose Doug's correction). User-approved in brainstorming.
4. **No auth-table write on name override** — the signed-link `crew_member_auth` table was retired in the M9.5 picker cutover (`20260523000099_cutover_drop_m9_5.sql:26`); crew identity is id-keyed picker only. A name override writes `crew_members.name` and nothing else. Do not reintroduce any retired M9.5 auth surface.
5. **Readers untouched** — no crew-page/picker/auth read-path change is required or wanted; the override lives entirely in the write path + admin edit surfaces. Invariant-9 boundaries unchanged.
6. **`` hotel dup delimiter** — chosen because it cannot occur in a hotel name; UI hides it. Not a hack to relitigate.
7. **Crew email intentionally excluded** — identity/canonicalization load-bearing (invariant 3).
