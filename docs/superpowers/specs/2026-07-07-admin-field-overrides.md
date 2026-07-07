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

The user-approved intent (brainstorming): overrides applied at **write-time** in the same per-show advisory-locked transaction; readers (crew page, picker, auth, admin) stay untouched and read normal live rows; the chip needs the sheet value stored on the override row. (Refined below: this holds for 5 of 6 fields; the crew **name** override additionally needs one bounded read-side visibility alias — §3.5 — because a rename is a cross-domain identity change, not a pure value swap.)

**Refinement discovered during live-code verification (documented so the reviewer does not relitigate):** the override must be applied as a **transform of the parse output *before* `applyParseResult`'s delete/upsert**, mirroring `holdAwareApply` (`lib/sync/holds/holdAwareApply.ts:151`; consumed at `applyParseResult.ts:100-116`) — **not** as a post-write in-place UPDATE of the just-written row.

Rationale (the id-churn failure of post-write rename):
- `crew_members` PK is `id uuid`; natural key `unique (show_id, name)` (`20260501000000_initial_public_schema.sql:32,43`). Re-sync does `deleteCrewMembersNotIn(showId, names)` then `upsertCrewMembers` `on conflict (show_id, name) do update` (`runScheduledCronSync.ts:1560,1567-1584`).
- The **picker resolves crew identity by `crew_members.id`** in the signed cookie (`lib/auth/picker/resolvePickerSelection.ts:52,87,96-97,154` — matches `.eq("id", entry.id)`, never consults name).
- If a name override were applied post-write (row renamed 'Jon'→'John' after apply), the **next** sync's parse still yields 'Jon': `deleteCrewMembersNotIn(['Jon',…])` deletes the 'John' row (not in the parsed set), then `upsert('Jon')` inserts a **new row with a new id**. The picker cookie (old id) breaks on every sync.
- With the **pre-write transform**, the parsed crew list is folded 'Jon'→'John' *before* delete/upsert: `deleteCrewMembersNotIn(['John',…])` keeps the persisted 'John' row; `upsert(show_id,'John') do update` updates it **in place**; `id` is stable across every sync. Picker cookie survives. Same visible result, correct identity.

The two mechanisms are visually identical to Doug; only the pre-write one is correct across syncs. This spec mandates pre-write.

### 3.2 Injection points (two, because two writers touch overridable columns)

The locked apply transaction is opened at `runScheduledCronSync.ts:1801` (`sql.begin`), lock acquired JS-side in `withShowLock`/`lockedShowTx.ts:57-62,74` (single JS-side holder — invariant 2). Inside it, in order:

1. `applyShowSnapshot` (`runScheduledCronSync.ts:1304`) — writes `shows.dates`/`shows.venue` (UPDATE arms at `:1432`,`:1458`). **`show`-domain overrides (dates/venue) transform the ParseResult *before* this writer consumes it.**
2. `runPhase2` → `applyParseResult` (`lib/sync/phase2.ts:369`) — writes crew + hotels. **`hotel`-domain overrides transform the hotel rows before `replaceHotelReservations`.** **`crew`-domain overrides (name/role) apply to the POST-HOLD crew write list *inside* `applyParseResult` — see the critical hold-ordering rule §3.4.** They must NOT be folded into the ParseResult that `applyParseResult` feeds to the hold engine.

**Two clearly-separated stages — the transform is PURE; the override-table side-effects are gated on the apply actually proceeding.** This separation is mandatory because `runPhase2` can **short-circuit stale**: `applyShowSnapshot` returns `outcome:"stale"` under its modified-time guard and `runPhase2` returns immediately (`lib/sync/phase2.ts:305-306`) — **before** `applyParseResult` (`:369`) and the post-apply slot (`:378`) ever run, yet the surrounding tx still commits. If override-table writes (`sheet_value`, `active=false`) were emitted before `applyShowSnapshot`, a stale/replayed sync would commit them even though no live row changed — pausing valid overrides and refreshing `sheet_value` from a stale parse (a false needs-attention). So:

- **Stage A — pure transform (before `applyShowSnapshot`).** `overrideParseResult(parseResult, activeOverrides) → { overriddenParseResult, plannedSheetValues, plannedStale, plannedConflicts }`. Pure: reads the ParseResult + the active overrides, returns the overridden ParseResult **and the *planned* side-effects**, but performs **zero writes** (no live-row writes, no `admin_overrides` writes). If the sync short-circuits stale after this, nothing was persisted — no harm.
- **Stage B — override-table side-effects (at the post-apply slot `phase2.ts:378`, applied path only).** Only reached when `applyShowSnapshot` returned `updated` and `applyParseResult` ran. Here `commitOverrideSideEffects(tx, plannedSheetValues, plannedStale, plannedConflicts)` writes `sheet_value` refreshes and `active=false` deactivations to `admin_overrides` — atomic with the applied change-log writes already in that slot (`:383-399`). A stale short-circuit never reaches this stage, so `admin_overrides` is untouched on a stale sync.

Stage A's overridden `show`/`hotel` values are threaded into `applyShowSnapshot` / the hotel writer. **Crew overrides are the exception (§3.4): they are applied to the post-hold write list inside `applyParseResult`, NOT folded into the ParseResult the hold engine sees.** Readers are **untouched EXCEPT** the crew-page visibility name-match layer, which gains a bounded override→sheet-name alias (§3.5 — the one deliberate reader exception, required so a renamed viewer still sees their own hotel/transport). All other read paths (picker, auth, admin) are unchanged; invariant-9 boundaries hold.

### 3.3 sheet_value capture + stale detection

The *planned* side-effects computed in Stage A, persisted in Stage B (§3.2):
- **sheet_value:** each active override's field **parsed value** (matched by `match_key` against the original pre-transform ParseResult) → `admin_overrides.sheet_value` (refreshed every applied sync — powers the chip).
- **stale/conflict:** if `match_key` is **not present** in the parsed identifiers **and the member's row is not being held/protected** (i.e. genuine removal — §3.4 invariant), or applying a crew-name override would collide (§6), the override is **deactivated** (`active=false`). A held row keeps its active override (§3.4 last matrix row). `show`-domain overrides never go stale (singleton always present; parsed dates/venue null → `sheet_value=null`, override still applies).

All `admin_overrides` writes happen in **Stage B, inside the locked tx, on the applied path only**. The best-effort `admin_alert` push is **post-commit, outside the lock** (§6, invariant 10) — and is additive to the durable inactive-row signal, never the sole signal.

### 3.4 Hold-ordering rule (crew overrides apply AFTER hold-aware planning)

`applyParseResult` runs `planHoldAwareApply` on **`args.parseResult`** (`applyParseResult.ts:100-108`); that engine builds `parseByName` and treats a `match_key` absent from the parse as a **rename/removal** (`holdAwareApply.ts:75-122` — `undoOverrideReleased`, `mi11Reconciled`, reservation logic all key on `hold.entity_key` against `parseByName`). If a crew-name override folded `Jon → John` into the ParseResult *before* hold planning, an open MI-11 hold on `Jon` would see `Jon` as vanished and mis-release / retarget / suppress based on the **override** rather than the **raw sheet** — corrupting guarded-change semantics.

**Rule:** the hold engine consumes the **RAW** parse (`match_key` names). Crew name/role overrides are applied to the **post-hold crew write list** — the `crewMembers` array `planHoldAwareApply` returns (`applyParseResult.ts:112`) — *after* line 116 and *before* the `deleteCrewMembersNotIn` / `upsertCrewMembers` at `:128-129`. Concretely:

1. `planHoldAwareApply(args.parseResult)` → post-hold `crewMembers` (raw names), `protectedNames`, `heldNames`.
2. **Apply crew overrides** to that post-hold list: fold `name`, set `role`. Compute `nextCrewNames` / `deleteKeepNames` / `added` / `removed` from the **override-folded** names (so `deleteCrewMembersNotIn` keeps the persisted override-named row → id stable, §3.1; and change-log add/remove reflects the folded roster, not a phantom `Jon`-removed/`John`-added pair).
3. delete/upsert with the override-folded list.

**Hold × override id-stability — ONE invariant closes the whole class (comprehensive, replaces per-case patching).**

> **Live-row-name invariant.** Every name that drives delete/upsert — the `deleteKeepNames` set, and every hold-derived `protectedNames` / `heldNames` / reservation-target / fold-result — is expressed as the member's **CURRENT LIVE ROW NAME** = (its active name override's output if one exists, else the raw parsed name). No existing `crew_members` row is ever delete+reinserted; ids are preserved by construction. An override deactivates as **stale** (§6) **only** when its member's live row is genuinely being **removed** (would be deleted regardless of the override) — never merely because the raw `match_key` is absent while the row is being **held/protected**.

Mechanically: hold **disposition** (release / retarget / suppress / reconcile) is decided by `planHoldAwareApply` on the **RAW** parse (correct — it must see sheet truth). Then, before `deleteCrewMembersNotIn`/`upsertCrewMembers`, **map every raw name the hold engine emitted through the active name override** to the current live name. The complete disposition matrix for a member with an active name override `Jon → John` (live row id X):

| Raw parse has `Jon`? | Held? | Keep-set entry | Row action | Override state |
|---|---|---|---|---|
| yes | no | `John` (folded) | upsert `(show_id,'John')` updates row X in place | active |
| yes | yes (email / reserve / reconcile hold) | `John` (raw `Jon` mapped through override) | row X updated; hold disposition decided on raw `Jon` | active |
| no | no (genuine removal) | — (not kept) | row X deleted | **stale** (deactivated — member gone) |
| no | yes (removal-suppression hold) | **`John`** (raw `Jon` mapped through override to the current live name) | row X **retained** (NOT deleted, NOT reinserted as `Jon`) | **active** (the row persists as `John`; the member isn't gone, just held) |

The last row is the R10 fix: a removal-suppression hold protects the row under its **current live name `John`**, not raw `Jon` — so row X (id X) survives, and the override stays active (deactivating + reinserting `Jon` would churn the id). Tests (§13): (a) open email/reconcile hold + active `Jon→John` + `Jon` present → `crew_members.id` stable, hold disposition follows raw; (b) removal-suppression hold + active `Jon→John` + parse omits `Jon` → `crew_members.id` stable, row stays `John`, override NOT deactivated; (c) genuine removal (omit `Jon`, no hold) → row deleted, override deactivated (stale).

### 3.5 Crew-name visibility alias (the one reader exception)

A crew **name** override is a **cross-domain identity alias**, not merely a display rename. The crew page resolves the viewer's identity by `crew_members.id` (picker, `resolvePickerSelection.ts:96`) and then reads `viewerName` from `crew_members.name`; name-bearing **parsed reference** fields (`transportation.driver_name`, schedule `assigned_names[]`, `hotel_reservations.names[]`) still carry the **sheet** name and are matched against `viewerName` via `namesRefer` (`lib/visibility/scopeTiles.ts`, `lib/data/nameMatch.ts`). If `viewerName` becomes `John` but those refs still say `Jon`, the viewer's own hotel/transport could disappear — violating success criterion 3.

**Blast radius is narrower than it first appears.** `namesRefer` (`lib/data/nameMatch.ts:63`) compares **surname-only** for two multi-token names (first name intentionally ignored — catches Bill↔William). So `namesRefer('Jon Smith','John Smith') = TRUE`: a **first-name** correction already keeps the viewer matched to their hotel/transport with zero extra work. **Only a surname-changing override** (`'Jon Smith'→'Jon Smyth'`, or a wholesale rename) breaks the match. The alias contract exists to make that remaining case correct.

**Exactly three match sites** (from the reference-surface map): `lib/visibility/scopeTiles.ts:192` (`transportation.driver_name`), `:200` (schedule `assigned_names[]`), and `lib/data/getShowForViewer.ts:104` (`hotelVisibleToViewer` → `hotel_reservations.names[]`). All three call `namesRefer(ref, viewerName)`, where `viewerName` = `crew_members.name` (read by id at `getShowForViewer.ts:291-305`). No other reader matches by crew name (schedule/day gating is by `date_restriction`/`role_flags`, never name; identity resolution is id-based at `resolvePickerSelection.ts:96` and never name).

**Contract — alias colocated on `crew_members`, no `admin_overrides` read in the crew path:** the write transform stores the pre-override sheet name in a new nullable column **`crew_members.sheet_name`** (set to `match_key` when a name override is applied, `NULL` otherwise — §4.4). `getShowForViewer` already fetches the viewer's `crew_members` row by id; it additionally selects `sheet_name` and builds a viewer **alias set** `viewerNames = [name] ++ (sheet_name ? [sheet_name] : [])`. The three sites match a ref if it refers to **any** alias via a shared helper `namesReferAny(ref, viewerNames)`. Additive only — widens the viewer's own matches to include rows still tagged with their sheet name; never narrows, reassigns, or mutates a parsed ref; no `admin_overrides` read in the crew path (no RLS conflict).

**Concrete plumbing (R10 — the alias must actually REACH the two transport sites).** Today the transport predicate receives only the scalar `viewerName` (`scopeTiles.ts` `transportTileVisible(..., viewerName)`, and `ScheduleSection.tsx:105` forwards `viewerName` into the embedded transport tile). Widening one call site is not enough — the alias array must be threaded end-to-end. Required changes:
1. `getShowForViewer` projects a new **`viewerNameAliases: string[]`** field (= `[name, ...(sheet_name ? [sheet_name] : [])]`) into the view-model it returns (alongside the existing `viewerName`), so downstream consumers get the alias set, not just the display name.
2. **Hotels** (`getShowForViewer.ts:104` `hotelVisibleToViewer`): same-file, switch its `namesRefer(res.names[i], viewerName)` to `namesReferAny(res.names[i], viewerNameAliases)`.
3. **Transport** (`scopeTiles.ts:192,200`): change `transportTileVisible` (and the `transportTransitions.ts` mirror) to accept **`viewerNameAliases: string[]`** instead of / in addition to `viewerName`, matching via `namesReferAny`. Update **every caller** — the `ScheduleSection.tsx` → `TransportTile` prop thread must forward `viewerNameAliases`, not `viewerName`.
4. Update the existing transport/hotel visibility tests, and add the regression render test (§13) that **fails if transport matching receives only the override display name** (i.e., a surname-changing override with the alias NOT threaded would hide the viewer's own transport).

`namesReferAny(ref, aliases)` = `aliases.some(a => a != null && namesRefer(ref, a))` — a thin wrapper in `lib/data/nameMatch.ts`. This is the **only** crew-page reader change; it is a match-set widen threaded through the transport prop chain, not a new rendered element.

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
  created_by     text not null,          -- canonicalized admin email (canonicalized at the RPC boundary; CHECK is the invariant-3 safety net)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Invariant 3: schema-level CHECK is the email safety net (mirrors crew_members_email_canonical,
  -- 20260501000000_initial_public_schema.sql:44-46). created_by is always an admin email here
  -- (overrides have no 'system' path), so it must be lower/trim-canonical and non-empty.
  constraint admin_overrides_created_by_canonical check (
    created_by = lower(trim(created_by)) and created_by <> ''
  ),
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
-- WRITES are RPC-only (INSERT/UPDATE/DELETE revoked from anon+authenticated → only the
-- service_role SECURITY DEFINER RPC mutates). READS are admin-only via RLS: SELECT is granted to
-- authenticated but an admin_only policy (public.is_admin()) confines rows to admins, so the
-- existing cookie-bound admin loaders (loadNeedsAttention, needsAttentionCount) can read the
-- inactive-override needs-attention stream WITHOUT new service-role plumbing. anon gets nothing.
-- created_by holds an admin email — visible ONLY to admins under the policy (accepted: admin emails
-- already surface across the admin UI). The crew page never reads this table.
revoke insert, update, delete on table public.admin_overrides from anon, authenticated;
revoke select                 on table public.admin_overrides from anon;
grant  select                 on table public.admin_overrides to authenticated;   -- gated by admin_only RLS below
grant  all privileges         on table public.admin_overrides to service_role;    -- service_role retains ALL (reads + RPC writes); required by postgrest-dml-lockdown registry
alter table public.admin_overrides enable row level security;
drop policy if exists admin_only on public.admin_overrides;   -- idempotency: CREATE POLICY has no IF NOT EXISTS; drop-first makes apply-twice safe
create policy admin_only on public.admin_overrides
  for select to authenticated
  using ( public.is_admin() );   -- canonical predicate (rls_policies.sql:23, ignored_warnings_rls.sql); service_role bypasses RLS
```

`grant all ... to service_role` is not optional: `tests/db/postgrest-dml-lockdown.test.ts` asserts every RPC-gated table keeps `service_role` SELECT/INSERT/UPDATE/DELETE = true. The registry row (§12) records `serviceRole: ALL, selectAnon:false, selectAuthenticated:true` (authenticated SELECT is present but RLS-confined to admins — the same posture as `ignored_warnings`). INSERT/UPDATE/DELETE remain revoked from authenticated (the lockdown invariant).

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

### 4.4 `crew_members.sheet_name` — visibility alias column

The crew-name visibility alias (§3.5) requires the crew read path to know a renamed viewer's original sheet name **without** reading the admin-only `admin_overrides` table. A new nullable column carries it, colocated on the row `getShowForViewer` already fetches:

```sql
-- same migration file as admin_overrides (20260707000000_admin_field_overrides.sql)
alter table public.crew_members
  add column if not exists sheet_name text;   -- original parsed name when a name override is active; NULL otherwise
comment on column public.crew_members.sheet_name is
  'Set to the pre-override parsed name when an admin name override is active on this row (visibility alias, spec 2026-07-07 §3.5); NULL when name is un-overridden. Written only by the crew override write-transform.';
```

- **Write rule** (crew override transform, §3.4 step 2): when a `name` override is applied to a member, set `sheet_name = match_key` (the parsed name); when no active name override, `sheet_name = NULL`. Idempotent — recomputed every applied sync from the active overrides.
- **Guard:** `sheet_name` is display-only (a crew name, non-PII). It is NOT a second identity key (identity stays id-based). A `.trim()`/normalization on it in `lib/sync` needs the `// canonicalize-exempt` comment (§7.4).
- Fully-replaced-safe: on any sync with no name override, the column resets to `NULL` (no stale alias). `crew_members` is upserted in place (id stable), so `sheet_name` rides along.
- CHECK/enum: none (free-text nullable). Manifest + validation-parity: the column is introspected by `gen:schema-manifest` and must reach the validation project (§12).

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

When Stage A (§3.2) finds an active override whose `match_key` is absent from the freshly parsed identifiers **and whose member/row is not being held/protected** (genuine removal — a held row is NOT stale; §3.4 invariant) (planned in Stage A, committed in Stage B on the applied path):

1. Set `admin_overrides.active = false` **inside the locked tx** (atomic with the apply). The live row therefore renders the **parsed** value (the override no longer transforms it).
2. **Durable needs-attention signal = the inactive row itself** (this is the "never silent" guarantee). BOTH `loadNeedsAttention` (page rows) AND `needsAttentionCount` (nav badge) gain a **4th derived stream**: `select … from admin_overrides where not active` (joined to `shows`), added to `buildNeedsAttention` (`lib/admin/loadNeedsAttention.ts:291`, alongside the existing `pending_ingestions`/`pending_syncs`/`admin_alerts` streams; input type in `lib/admin/needsAttention.ts`). The existing cookie-bound admin client reads it directly under the `admin_only` RLS policy (§9.4) — no service-role loader needed. Because the row's `active=false` commits in the SAME transaction as the apply, the signal cannot be lost — there is no post-commit step whose failure could hide it. A crash (or a thrown `admin_alert` emit) after commit still leaves an inactive row that both the page row and the badge count surface.
3. **Best-effort push (not the durable guarantee):** post-commit (outside the lock), also emit an `admin_alert` via `upsertAdminAlert` (`lib/adminAlerts/upsertAdminAlert.ts:46`) with a new `AdminAlertCode` (`OVERRIDE_TARGET_MISSING`, or `OVERRIDE_NAME_CONFLICT` for the collision case, §10) so the realtime bell/NotifBell lights up immediately. If this emit fails, the needs-attention row from step 2 still stands — the alert is additive, not load-bearing. The alert is therefore **not** routed via `INBOX_ROUTED_CODES` (avoids double-surfacing the same item as both a derived-stream row and a routed-alert row).
4. The needs-attention row offers **re-point** (update `match_key` to a current identifier, reactivate) and **discard** (delete the override row) — both via `set_field_override` RPC variants (§7).

Deactivate-not-delete means a transient sheet glitch (row briefly dropped) does not lose Doug's correction; he re-points or discards deliberately. Accumulation is bounded: deactivated rows are visible needs-attention items that Doug resolves.

**Runtime name-collision (target present but output collides).** The RPC write-time guard (§7.4) prevents *creating* a colliding crew-name override, but a *later* sync can introduce the collision — e.g. the sheet adds a real crew member whose name equals an existing override's output. If Stage A (§3.2) detects that applying an active crew-name override would produce two crew rows sharing `(show_id, name)` (fold collision), it **must not** apply the fold (that would collapse rows — the audit-2 finding). Instead it **deactivates** the override (`active=false` in-tx, row renders parsed value) — the same durable inactive-row needs-attention signal as stale (§6 step 2) — and additionally emits a best-effort `admin_alert` `OVERRIDE_NAME_CONFLICT` (§10) bell push whose copy tells Doug his override name now clashes with a real crew member; the needs-attention row offers re-point (choose a different name) or discard. Same deactivate+surface machinery as stale, different code + copy. The `overrideApply` test asserts no row collapse occurs on a manufactured collision (§13).

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
   - `upsert` (**create** — no active override on this target): validate `override_value` (§7.4) incl. the name-collision guard; **capture the current live value (= the parsed/sheet value, since nothing is overridden yet) into `admin_overrides.sheet_value` in the SAME locked tx, BEFORE overwriting the live row**; insert `admin_overrides` (`active=true`, `sheet_value` set); apply `override_value` to the live row (§7.3). No auth-table write (§5.2).
   - `upsert` (**edit** — override already active): validate; update `admin_overrides.override_value` only, **PRESERVE the existing `sheet_value`** (do NOT recapture — the current live value is the *previous override*, not the sheet value); apply the new `override_value` to the live row.
   - `revert`: restore `sheet_value` to the live row; delete the override row. No auth-table write.

   **sheet_value invariant (R6/R7):** `admin_overrides.sheet_value` ALWAYS holds the **parsed/sheet** value, never an override value. It is captured **once at create** (when the live value still equals the sheet value) and thereafter refreshed **only from the parsed source** on each applied sync (Stage B). It is **never** overwritten on an *edit* (the live value there is the prior override — capturing it would poison revert, R7 finding). This makes revert correct at every moment, including: (a) create-then-revert-before-any-sync (captured-at-create value restored, R6); (b) edit-then-revert-before-any-sync (preserved sheet_value restored, not the discarded prior override, R7). `repoint` to a fresh target captures **that target's** current parsed value (it is un-overridden, so live == sheet). Applies to all 6 fields. Tested: create-then-revert AND edit-then-revert, both without any intervening sync, restore the true sheet value for every field.
   - `repoint` (**active** override — moving from a still-live old target A to a new target B): a **two-target** tx in this order — (1) **release old target A**: restore A's live field from the override row's current stored `sheet_value` (so A stops showing the override and A's `(show_id,name)` frees up); (2) set `match_key = p_new_match_key`, `active=true`, **capture B's current parsed value into `sheet_value`**; (3) apply `override_value` to B. Releasing A **before** applying to B is mandatory for crew-name repoint — otherwise A still holds the override name and step 3 could collide on `(show_id,name)` uniqueness. Tested for crew name, crew role, and hotel: A is restored to its sheet value AND B shows the override, with the name-uniqueness ordering exercised.
   - `repoint` (**inactive/stale** override — old target vanished by definition, §7.6): no old live row to release; validate the stored-row CAS + the new target's no-collision; set `match_key = p_new_match_key`, `active=true`, capture B's parsed value into `sheet_value`, apply to B.
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

### 7.6 Crew immediate-apply anchoring (comprehensive — all ops × states)

The RPC's immediate live-row `UPDATE` for a **crew** field (name OR role) cannot blindly anchor on `match_key`, because a prior **active name override** may already have renamed the live row: the parsed `match_key` is `Jon` but the live `crew_members.name` is `John`. One unifying resolver removes every special case.

**Resolver (single rule for all crew ops):**
> `currentLiveName(show_id, match_key) =` the `override_value` of this member's **active `name` override** if one exists, ELSE `match_key`.
>
> Every crew immediate-apply `UPDATE ... WHERE show_id=$1 AND name = currentLiveName(...)`. A role override and a name override on the same member share the same `match_key` (the parsed name), so a role op resolves the live row through the sibling active name override automatically. `crew_members.name` is unique per show, so this resolves exactly one row.

**Per op × state** (all under the advisory lock; every op takes a **stored-override-row CAS** on `p_expected_sheet_value` / expected prior state so a stale UI cannot clobber a newer sync):

| Op | Field | Precondition | Live-row anchor | New value |
|---|---|---|---|---|
| `upsert` (create) | name | no active name override yet | `match_key` | `override_value` |
| `upsert` (edit) | name | name override already active | `currentLiveName` (the stored `override_value`) | new `override_value` |
| `upsert` (create/edit) | role | any | `currentLiveName` (resolves through active sibling name override, else `match_key`) | `override_value` |
| `revert` | name | active | `currentLiveName` | `sheet_value` (parsed name) |
| `revert` | role | active | `currentLiveName` | `sheet_value` (parsed role) |
| `repoint` (**active** override) | name/role | target row still live | (1) **restore old target A to its stored `sheet_value`** (release — A stops showing the override, frees A's `(show_id,name)`); (2) validate new target B is a current parsed identifier, no collision; capture B's parsed value into `sheet_value` | apply to B **after** releasing A (ordering mandatory for name uniqueness, §7.2) |
| `repoint` (**inactive/stale** override) | name/role | old target vanished **by definition** | **do NOT require the old live row.** Validate only: (a) the stored inactive override-row CAS, (b) the new `match_key` is a current parsed identifier with no collision (§7.4). Then set `match_key`=new target, `active=true`, and apply. | apply to new target |
| `discard` | any | any | — (no live-row change) | — |

**Inactive-repoint is the primary stale-recovery path** (R4 finding): a stale override's parsed target is gone, so repoint MUST NOT require releasing an old live row — otherwise re-point could only ever fail and Doug is forced to discard+recreate. The active vs inactive branch above is mandatory.

If a live-row anchor matches **zero** rows when the UI expected one (a sync moved the row out from under an *active*-override op), the RPC raises CAS 409 `stale_review` (§7.2 item 3) rather than silently no-op'ing — the admin UI reloads instead of showing a stale value until the next sync. `show`/`hotel` domains anchor on the shows PK / hotel ordinal and have no parsed-vs-current ambiguity.

Tests (§13): edit-active-name, revert-active-name, **apply-and-revert-role-while-name-override-active** (finding 3), **repoint-after-target-disappearance** succeeds without an old live row (finding 2), **active-repoint restores the old target A to its sheet value AND applies to B** for crew name / crew role / hotel, exercising the release-before-apply name-uniqueness ordering (R8 finding), and a wrong active-anchor raises 409.

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
  matchKey: string;            // '' for show; the DURABLE PARSED key (§8.2a) — NOT the display value
  currentValue: React.ReactNode | string; // the live (possibly overridden) rendered value
  override: OverrideState | null;          // { overrideValue, sheetValue, active } | null
  currentOrdinal?: number;     // hotel only (CAS anchor)
  disabled?: boolean;          // e.g. archived show
};
```

Renders the value + (when overridden & active) the "Overridden — sheet says X" chip + edit/revert affordances. It is a client component that calls the server action (§8.4). Guard: `override === null` → plain value + an "Edit" affordance; `override.active === false` (stale) → parsed value + a muted "Override paused — sheet no longer has «matchKey»" note with re-point / discard.

### 8.2a `matchKey` derivation (CRITICAL — pass the parsed key, not the display value)

`matchKey` MUST be the **durable parsed identifier**, never the live display value. After an active name override the live crew row shows `John` but its `match_key` is the parsed `Jon`; if a follow-on **role** edit (or a **hotel_address** edit after a `hotel_name` override) were keyed on the *display* value, the override would be written under `John`/the-override-hotel-name and the next sync — which matches on RAW parse — would fail to find it and deactivate it (or hit the wrong row). The admin loaders therefore derive `matchKey` from source, not display:

- **crew** (`name` and `role` fields on a member): `matchKey = crew_members.sheet_name ?? crew_members.name`. `sheet_name` (§4.4) holds the parsed name whenever any name override is active; otherwise `name` *is* the parsed name. A member's `name` and `role` `OverrideableField`s **share** this one `matchKey` (both key on the member's parsed name — §5.2), so a role edit while a name override is active is correctly keyed to `Jon`, not `John`.
- **hotel** (`hotel_name` and `hotel_address` on a reservation): the admin loader reads the reservation's active override rows (it already queries `admin_overrides` to render chips + `sheet_value`) and uses the stored `match_key` (the parsed hotel name + dup-ordinal, §5.3); with no active override, `matchKey = hotel_reservations.hotel_name` (which is then the parsed name). Both `hotel_name` and `hotel_address` fields on a reservation share this `matchKey`. (No `sheet_hotel_name` column is needed — the admin surface can read `admin_overrides`, unlike the crew path.)
- **show**: `matchKey = ''` (singleton).

Tested: a role edit while a name override is active, and a hotel_address edit while a hotel_name override is active, both persist under the PARSED key and survive the next sync (do not deactivate). (§13)

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

Server action `app/admin/show/[slug]/_actions/overrides.ts` — thin layer: `requireAdminIdentity()` gate → delegate to `lib/overrides/setFieldOverride.ts` helper, then **post-commit** `logAdminOutcome({ code: "FIELD_OVERRIDE_SET"|"FIELD_OVERRIDE_REVERTED", … })` (§11) + `revalidateShow`. **No inline `.rpc` in the action** (deadlock rule, `feed.ts:10-14`).

**Client choice (critical):** `set_field_override` EXECUTE is revoked from `authenticated` and granted only to `service_role` (§7.5), so the helper MUST use **`createSupabaseServiceRoleClient()`**, not `createSupabaseServerClient()`. The latter is cookie-bound and uses the publishable/anon key in this repo — it would pass `requireAdminIdentity()` and then fail `permission denied` at the RPC boundary, making every save/revert path unusable. Mirror the exact precedent `lib/onboarding/setPullSheetOverrideRpc.ts:34` (`const client = (deps?.createClient ?? createSupabaseServiceRoleClient)(); const { data, error } = await client.rpc("set_field_override", params)`). `requireAdminIdentity()` at the action layer is the authorization gate; the service-role client is constructed only after that gate passes. The admin email it returns is passed as `p_actor` **canonicalized via `lib/email/canonicalize.ts` at the action boundary** (invariant 3 primary mechanism; the `admin_overrides_created_by_canonical` CHECK is the safety net). The helper destructures `{ data, error }` + `mapRpcOutcome` (invariant 9) and is registered in the infra-contract meta-test.

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
| **3** email canonicalization | No email is overridable. `created_by` is canonicalized at the action boundary via `lib/email/canonicalize.ts` **before** the RPC (primary mechanism), AND the `admin_overrides_created_by_canonical` CHECK (`= lower(trim())` , non-empty) is the schema safety net (§4.1). RPC/action test proves a raw/mixed-case actor email is canonicalized (or rejected) before insert. | §2.2, §4.1, §7 |
| **5** no raw codes in UI | All override errors routed through `lib/messages/lookup.ts`; §10 codes have Doug-facing copy. | §8.7, §10 |
| **9** Supabase call-boundary | Override helper destructures `{data,error}`, distinguishes returned vs thrown, uses `mapRpcOutcome`; registered in `_metaInfraContract.test.ts` (or inline `// not-subject-to-meta`). | §8.4 |
| **10** mutation observability | `set_field_override` action is an **admin surface** → `AUDITABLE_MUTATIONS` row + `adminOutcomeBehavior.test.ts` success-branch proof. Emits post-commit, outside the lock. | §11 |
| PostgREST DML lockdown | REVOKE ins/upd/del from anon+authenticated on `admin_overrides`; add row to `postgrest-dml-lockdown.test.ts` `RPC_GATED_TABLES:147`. | §4.1, §12 |

### 9.4 RLS / SELECT posture

`admin_overrides.created_by` holds an admin email (PII). **Decision: writes RPC-only; reads admin-only via RLS.** INSERT/UPDATE/DELETE are revoked from anon+authenticated (only the service_role RPC mutates — the lockdown invariant). SELECT is **granted to authenticated but confined by an `admin_only` RLS policy** (`public.is_admin()`), so the **existing cookie-bound admin loaders** (`loadNeedsAttention`, `needsAttentionCount`) read the durable inactive-override needs-attention stream directly — no new service-role plumbing, no mixed-client loader. anon gets zero rows. This is the same posture as `ignored_warnings` (`20260702120100_ignored_warnings_rls.sql`). PII (`created_by` admin email) is visible **only to admins** under the policy — accepted, since admin emails already surface across the admin UI. The crew page never reads this table. (This resolves the R2 "pick one posture" contradiction *and* the R4 "service-role-only breaks the cookie loader" finding: authenticated-SELECT-under-RLS is the coherent posture that satisfies both.) The lockdown meta-test row records `selectAnon=false, selectAuthenticated=true (RLS-confined)`.

---

## 10. Error / alert codes (§12.4 lockstep)

Six new codes: **four** forensic outcome codes (`FIELD_OVERRIDE_SET`/`REVERTED`/`REPOINTED`/`DISCARDED` — one per RPC op; logAdminOutcome only, NOT §12.4) and **two** admin-alert codes (`OVERRIDE_TARGET_MISSING`, `OVERRIDE_NAME_CONFLICT`). Only the two admin-alert codes touch §12.4 lockstep; each lands in **all** lockstep surfaces in one commit (spec §12.4 prose → `pnpm gen:spec-codes` → `lib/messages/__generated__/spec-codes.ts` → `lib/messages/catalog.ts` → `tests/cross-cutting/code-scenarios.ts` `CODE_SCENARIOS`; parity gate `tests/cross-cutting/codes.test.ts:70,74`).

| Code | Kind | Audience | Doug-facing copy (draft) |
|---|---|---|---|
| `FIELD_OVERRIDE_SET` | forensic outcome (`logAdminOutcome`) — `upsert` op | — (not user-rendered) | n/a |
| `FIELD_OVERRIDE_REVERTED` | forensic outcome — `revert` op | — | n/a |
| `FIELD_OVERRIDE_REPOINTED` | forensic outcome — `repoint` op | — | n/a |
| `FIELD_OVERRIDE_DISCARDED` | forensic outcome — `discard` op | — | n/a |
| `OVERRIDE_TARGET_MISSING` | `admin_alerts` (new `AdminAlertCode`) | doug | "An override you set no longer matches the sheet. The field is showing the sheet's value again — re-point the override to the right row or discard it." |
| `OVERRIDE_NAME_CONFLICT` | `admin_alerts` (new `AdminAlertCode`) | doug | "A name override you set now clashes with a real crew member of the same name. We paused it and are showing the sheet's name — re-point it to a different name or discard it." |

**Decided (not deferred):** the **four** `FIELD_OVERRIDE_*` codes (one per RPC op: `SET`=upsert, `REVERTED`=revert, `REPOINTED`=repoint, `DISCARDED`=discard) are **forensic outcome codes only** — `logAdminOutcome.code` is a free `string` ("see the meta-test registry", `lib/log/logAdminOutcome.ts:9`), validated by the `AUDITABLE_MUTATIONS` registry, **not** the §12.4 catalog parity gate. They are NOT §12.4 rows and NOT in `catalog.ts` (precedent: `archive.ts:42` emits forensic `SHOW_ARCHIVED`, distinct from the user-rendered catalog code `SHOW_ARCHIVED_BY_ADMIN` at `catalog.ts:1741`). **BOTH** admin-alert codes — `OVERRIDE_TARGET_MISSING` AND `OVERRIDE_NAME_CONFLICT` — go through the full §12.4 lockstep (spec prose → `gen:spec-codes` → `catalog.ts` → `CODE_SCENARIOS` → `_metaAdminAlertCatalog`); the two `FIELD_OVERRIDE_*` forensic codes do not.

`OVERRIDE_TARGET_MISSING` and `OVERRIDE_NAME_CONFLICT` are **two** new `AdminAlertCode`s (`lib/adminAlerts/upsertAdminAlert.ts:3` union, 36 members → 38). Each fans out to `tests/messages/_metaAdminAlertCatalog.test.ts`, §12.4 prose + helpfulContext appendix, and the audience/identity matrices (~9 surfaces each per MEMORY `reference_admin_alert_code_lockstep_surfaces`). They are **not** added to `INBOX_ROUTED_CODES` — needs-attention surfaces stale/conflict overrides via the durable inactive-row stream (§6 step 2), so routing the alert too would double-list the item.

Additionally, a user-facing **stale-review** error surfaces on the CAS 409 path — reuse an existing `stale_review`/`SYNC_INFRA_ERROR` code if one fits (`mi11GateActions.ts` maps these); do not invent a new one if an existing code covers "row changed since you opened it."

---

## 11. Telemetry (invariant 10)

- `set_field_override` action → **admin surface** (body calls `requireAdminIdentity()`). Requires:
  - The action emits a distinct outcome code **per RPC op** — `upsert→FIELD_OVERRIDE_SET`, `revert→FIELD_OVERRIDE_REVERTED`, `repoint→FIELD_OVERRIDE_REPOINTED`, `discard→FIELD_OVERRIDE_DISCARDED` (repoint and discard are real admin mutations — repoint moves which live row is overridden; discard deletes durable override state — so both need first-class audit coverage, R9).
  - An `AUDITABLE_MUTATIONS` registry row (`tests/log/_auditableMutations.ts:13`, shape `{file, fn, code}`) for **each** of the four codes on `setFieldOverrideAction` (`app/admin/show/[slug]/_actions/overrides.ts`).
  - Executable success-branch proof in `tests/log/adminOutcomeBehavior.test.ts` (real logger via `setLogSink` spy `:8`) for **all four ops** — each asserts its code is recorded on the committed-success branch.
- `logAdminOutcome` (`lib/log/logAdminOutcome.ts:27`, `AdminOutcome {code,source,actorEmail?,driveFileId?,showId?,result?,extra?}`) emitted **post-commit, outside the lock tx**. `actorEmail` = canonicalized admin email; **no secrets** (no share tokens; `match_key`/values are show content, allowed).
- The **wizard** surface (`step3ReviewSections` edit) calls the **same** action → same telemetry (no separate registry row per surface; per-function coverage).
- Stale/conflict `admin_alert` emit is separate, best-effort telemetry (the `OVERRIDE_TARGET_MISSING` / `OVERRIDE_NAME_CONFLICT` upsert), post-commit — additive to the durable inactive-row needs-attention signal (§6), never the sole signal.

---

## 12. Meta-test inventory (declared per AGENTS.md)

**Extends:**
- `lib/admin/loadNeedsAttention.ts` (page rows) + `needsAttentionCount` (nav badge) + `lib/admin/needsAttention.ts` — add the 4th derived stream (`admin_overrides where not active`, read under the `admin_only` RLS policy by the existing cookie client) to `buildNeedsAttention` (`:291`); tests assert an inactive override surfaces as **both** a page row and a badge-count increment, **even when the post-commit `admin_alert` emit throws** (the durable-signal proof — §6 step 2).
- `tests/db/postgrest-dml-lockdown.test.ts` — add `admin_overrides` to `RPC_GATED_TABLES` (`:147`): `{selectAnon:false, selectAuthenticated:true, postBody:…}` (authenticated SELECT present but RLS-confined to admins, like `ignored_warnings`); INSERT/UPDATE/DELETE revoked from anon+authenticated; service_role retains ALL (DDL `grant all … to service_role`, §4.1).
- `tests/auth/advisoryLockRpcDeadlock.test.ts` — add migration filename to `migrationFiles` (`:33`); document `set_field_override` as an in-RPC single holder in the allow-list comments (`:100+`).
- `tests/log/_auditableMutations.ts` + `tests/log/adminOutcomeBehavior.test.ts` — registry rows + behavioral success-branch proof for **all four** op codes (`FIELD_OVERRIDE_SET`/`REVERTED`/`REPOINTED`/`DISCARDED`, §11).
- `tests/messages/_metaAdminAlertCatalog.test.ts`, `tests/cross-cutting/codes.test.ts` — new codes.
- `tests/db/validation-schema-parity.test.ts` — the migration adds BOTH `admin_overrides` (table) AND `crew_members.sheet_name` (column, §4.4); regen manifest + surgical validation apply cover both.
- `tests/admin/no-inline-email-normalization.test.ts` — any name/`sheet_name` trim carries `// canonicalize-exempt`.
- The crew-name visibility alias thread (§3.5): `lib/data/nameMatch.ts` gains `namesReferAny`; `lib/data/getShowForViewer.ts` selects `crew_members.sheet_name`, builds + projects `viewerNameAliases`, and switches `hotelVisibleToViewer` (`:104`) to `namesReferAny`; `lib/visibility/scopeTiles.ts` (`:192,200`) + `lib/visibility/transportTransitions.ts` change `transportTileVisible` to take `viewerNameAliases`; the `ScheduleSection.tsx → TransportTile` prop thread forwards `viewerNameAliases`. Existing transport/hotel visibility tests updated; regression test `tests/crew/nameOverrideVisibilityAlias.test.ts` fails if transport gets only the display name.

**Creates:**
- `tests/sync/overrideApply.test.ts` — the pre-write transform: override folds into crew list before delete/upsert; crew_members.id stable across two syncs (the id-churn regression, §3.1); name-collision fold-conflict deactivates without row collapse (§5.2/§6); hotel matched by name across reorder; show dates/venue overridden; sheet_value refreshed; **stale deactivation surfaces via the inactive-row needs-attention stream even when the post-commit alert emit throws** (durability test — §6 step 2 vs step 3); **a stale-short-circuit sync (`applyShowSnapshot` returns `outcome:"stale"`, `phase2.ts:305-306`) leaves `admin_overrides` completely unchanged — no sheet_value refresh, no deactivation** (Stage A pure / Stage B applied-path-only, §3.2).
- `tests/overrides/setFieldOverride.test.ts` — RPC ops (upsert/revert/repoint/discard), CAS 409, guard rejections (incl. name collision), lock held, **`sheet_value` = sheet value always: create-then-revert AND edit-then-revert, both WITHOUT any intervening sync, restore the true sheet value for each of the 6 fields (R6 + R7 data-loss regressions — edit must NOT recapture the prior override into sheet_value)**, and the full §7.6 anchor matrix: edit `John`→`Jonathan` and revert `John`→`Jon` hit the correct live row; **a role override applied AND reverted while a name override is active resolves the live row through the sibling name override** (§7.6 finding 3); **repoint of an inactive/stale override succeeds with the old parsed target absent** (does not require an old live row — §7.6 finding 2); a wrong active-anchor (live name moved by a concurrent sync) raises 409, not a silent zero-row no-op.
- `tests/overrides/matchKeyDurability.test.ts` — the admin loader derives `matchKey` from source not display (§8.2a): a **role edit while a name override is active** persists under the parsed name (not the override), and a **hotel_address edit while a hotel_name override is active** persists under the parsed hotel name; both survive the next sync without deactivating (the R9 mis-key regression). CHECK-canonical `created_by`: a mixed-case actor email is canonicalized before insert (or rejected by the CHECK).
- Real-browser layout assertion for the chip/field-row dimensional invariant (§8.6).

- `tests/sync/overrideHoldOrdering.test.ts` — the full §3.4 hold×override×id matrix with an active name override `Jon→John` (live row id X): (a) email/reconcile hold + `Jon` present → hold disposition follows RAW `Jon`, fold applies (row `John`), `crew_members.id` stable; (b) **removal-suppression hold + parse omits `Jon`** → row X retained as `John` (protected under the CURRENT live name, NOT reinserted as `Jon`), `crew_members.id` stable, override NOT deactivated (R10 case); (c) genuine removal (omit `Jon`, no hold) → row deleted, override deactivated stale. Failure modes caught: folding into the ParseResult before hold planning (corrupts reconciliation), deferring the fold, AND protecting/keeping under the raw name (churns id in the removal-hold case).
- `tests/crew/nameOverrideVisibilityAlias.test.ts` — crew-page render: a **surname-changing** name override (`Jon Smith → Jon Smyth`) — the renamed viewer **still sees their own hotel reservation and transport assignment** (alias set includes `sheet_name`); and a first-name-only override already matches via `namesRefer` surname compare (regression proof the alias doesn't break the working case). Derives expected visibility from fixture names, not hardcoded (§3.5).

**Not applicable:** sentinel-hiding walker (no crew-page tile change; the alias is a match-set widen, not a new rendered element); `_metaInfraContract` applies to the new override helper (registered).

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
| Apply transform | replace parseResult.show before applyShowSnapshot | fold **post-hold** crew list before delete/upsert (§3.4); also set `crew_members.sheet_name` | replace hotel rows before replace |
| Hold ordering | N/A | hold *disposition* on RAW parse; override fold still applies after (§3.4 — **NOT deferred**); `protectedNames`/`heldNames` mapped through the active override so the keep-set preserves the overridden row id | N/A |
| Live-row write (RPC immediate) | `UPDATE shows` | `UPDATE crew_members` (+`sheet_name` on name op); anchor via §7.6 resolver | `UPDATE hotel_reservations` by ordinal |
| Visibility alias | N/A | **name override** → `sheet_name` widens viewer match set at 3 `namesRefer` sites (§3.5); role → N/A | N/A |
| Auth reconcile | N/A | **none** (auth table retired M9.5; picker id-keyed) | N/A |
| picker_epoch | N/A | **no bump** | N/A |
| Stale possible? | no (singleton) | yes | yes |
| Match key | `''` | parsed name | parsed name + dup-ordinal |
| Wizard UI | date row + VenueBreakdown | CrewBreakdown rows | hotels body |
| Live-show UI | **new** Show-details block | crew rows :709-743 | **new** Hotels block |
| Revert | UPDATE shows = sheet_value | UPDATE crew_members = sheet_value, **no auth write** (anchor = current override_value, §7.6) | UPDATE hotel by ordinal |
| Tests | overrideApply + RPC + layout | + id-stability + collision guard + hold-ordering + visibility-alias | + dup-name + reorder |

---

## 15. Watchpoints (do-not-relitigate — for the reviewer)

1. **Pre-write transform, NOT post-write rename** — this is a deliberate correctness refinement of the approved "write-time overlay", justified by the crew_members.id-churn/picker-cookie failure of post-write rename (§3.1, cited `resolvePickerSelection.ts:96`, `runScheduledCronSync.ts:1560-1584`). Not a scope change.
2. **picker_epoch deliberately NOT bumped on name override** — id-keyed cookie survives; matches parser-rename behavior (`unpublishShow.ts:152`). Bumping would be a worse UX (forced re-pick).
3. **Deactivate-not-delete on stale** — a deliberate anti-data-loss choice (transient sheet glitch must not lose Doug's correction). User-approved in brainstorming.
4. **No auth-table write on name override** — the signed-link `crew_member_auth` table was retired in the M9.5 picker cutover (`20260523000099_cutover_drop_m9_5.sql:26`); crew identity is id-keyed picker only. A name override writes `crew_members.name` and nothing else. Do not reintroduce any retired M9.5 auth surface.
5. **Readers untouched EXCEPT one bounded, deliberate exception: the crew-name visibility alias** (§3.5). The single reader change widens the 3 `namesRefer` match sites to a viewer alias set `{name, sheet_name}`; additive-only (never narrows/reassigns), reads a colocated `crew_members` column (no `admin_overrides` read in the crew path, no RLS conflict), mutates no parsed ref. Picker/auth/admin read paths unchanged; invariant-9 boundaries hold. Do not relitigate as "readers must be fully untouched" — a crew NAME override is inherently a cross-domain identity alias, and this is the minimal correct realization.
5a. **Hold-ordering: hold *disposition* on RAW parse, override fold applied AFTER, id preserved** (§3.4). The hold engine MUST see the RAW parse (folding first corrupts MI-11 reconciliation — `holdAwareApply.ts:75-122`). But the override fold is NOT deferred on the hold edge (deferring writes the raw name and churns the id — R7); instead the hold's protected/held names are mapped through the active override so the keep-set preserves the overridden live row id. Do not "simplify" by either folding-before-holds or deferring-on-hold — both are wrong.
5b. **Crew-name propagation is read-side alias, NOT write-side ref rewriting.** We deliberately do NOT rewrite `hotel_reservations.names[]` / `transportation.driver_name` / `assigned_names[]` at write time — that re-solves the "which `Jon`" fuzzy match at write time and risks mis-rewriting a different person. The read-time alias set is provably safe.
5c. **Crew-name override is the high-complexity field (accepted).** The user explicitly chose the full set INCLUDING crew name over the recommended "exclude name", aware it is "significantly larger, higher risk." Its cross-domain machinery (pre-write fold, hold-ordering, `sheet_name` alias, anchor resolver, collision guard) realizes that accepted cost — not scope creep. The other 5 fields are simple value overlays; a future descope of crew name cleanly removes §3.4/§3.5/§4.4/§7.6-crew + the `sheet_name` column.
6. **`` hotel dup delimiter** — chosen because it cannot occur in a hotel name; UI hides it. Not a hack to relitigate.
7. **Crew email intentionally excluded** — identity/canonicalization load-bearing (invariant 3).
