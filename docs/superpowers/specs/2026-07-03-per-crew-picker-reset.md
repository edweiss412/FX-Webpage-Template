# Spec — Per-crew picker reset (unified admin control)

**Date:** 2026-07-03
**Slug:** `per-crew-picker-reset`
**Author:** Opus 4.8 (autonomous ship pipeline)
**Status:** Draft → self-review → Codex adversarial-review → APPROVE

---

## 0. One-paragraph summary

Add the ability for an admin to reset **one specific crew member's** picker selection, without nuking every crew member's selection as the existing global "Reset picker" does. Today the only selection-reset lever is `reset_picker_epoch_atomic`, which bumps `shows.picker_epoch` and forces the **entire** roster to re-pick. This adds a per-member invalidation — a new `crew_members.selections_reset_at timestamptz` column, checked in the picker resolver exactly the way `claimed_via_oauth_at` is checked today — plus a new admin-gated `SECURITY DEFINER` RPC and a reworked admin UI that unifies both scopes under one control (default: pick a crew member; secondary option: reset all). It is a **correctness nudge** (force re-pick), **not** access control — a reset crew member can immediately re-pick the same name from the ungated picker (`AGENTS.md` crew-auth-pivot: role filtering is UX, not a security gate). The blast radius is one DB column, two resolver branches, one new RPC, one reworked admin control, and three help-doc copy edits. **No new §12.4 error codes.**

---

## 1. Problem & intent

### 1.1 Current state (all cited against live code)

- The picker cookie stores per-show entries `{ id, e, t }` where `id` = crew member UUID, `e` = picker epoch, `t` = pick timestamp in millis (`lib/auth/picker/cookieEnvelope.ts:9-10`, field meanings validated at `:25-38`).
- `resolvePickerSelection` (`lib/auth/picker/resolvePickerSelection.ts`) resolves a cookie entry to a crew identity. It reads `shows.picker_epoch,published,archived` (`:72-76`) and `crew_members.id,claimed_via_oauth_at` (`:91-96`), and returns one of: `resolved`, `no_selection`, `epoch_stale`, `removed_from_roster`, `identity_invalidated` (reason `claimed_after_pick` | `session_mismatch`), `show_unavailable`, `infra_error` (union at `:5-17`).
- The **only** per-member invalidation today is the OAuth-claim check: `if (crewRow.claimed_via_oauth_at !== null)` → `claimEpochMillis = Math.floor(new Date(...).getTime())` → `if (entry.t <= claimEpochMillis)` → `identity_invalidated` (`resolvePickerSelection.ts:107-117`). The **same** comparison is duplicated in the google-success branch of `resolveShowPageAccess.ts:209-229` (`if (!crewClaimRow?.claimed_via_oauth_at)` and `if (entry.t <= claimEpochMillis)` → `needs_picker_bootstrap`).
- The **only** reset lever is global: `resetPickerEpoch` (`lib/auth/picker/resetPickerEpoch.ts:21-23`) → RPC `reset_picker_epoch_atomic` (`supabase/migrations/20260523000003_reset_picker_epoch_atomic.sql`), which bumps `shows.picker_epoch` under a per-show advisory lock (`:30`) and forces every device to re-pick.
- The admin UI renders the global reset via `<ResetPickerEpochButton showId compact rowLabel="Reset name picker" ...>` inside `CurrentShareLinkPanel`'s `actions` slot (`app/admin/show/[slug]/page.tsx:771-776`). The page already loads the crew roster with `id, name, role` (`readCrew`, `page.tsx:238-245`).

### 1.2 The gap

There is no way to re-ask **one** crew member to re-pick. If Doug learns out-of-band that a single identity is mis-bound (someone picked the wrong name), his only lever forces the **whole** roster to re-pick — collateral friction. The per-member invalidation primitive already exists in spirit (`claimed_via_oauth_at`); this feature generalizes it into an admin-triggerable per-member reset.

### 1.3 Intent (non-goals stated explicitly)

- **It is a correctness nudge, not access control.** A reset member returns to the ungated "who are you?" picker and can re-pick the same name. This does **not** revoke access; that remains **rotate share token** (change the gate) or **roster removal** (`removed_from_roster` auto-fires). This is consistent with the ratified crew-auth pivot (`AGENTS.md` → "role filtering is UX not security").
- **Blind targeting is intended.** The admin picks a crew member by name from the roster based on out-of-band information; the server does not (and will not) track which device picked whom. Picker selections remain device-local signed cookies. **No server-side selection tracking is introduced.**
- **Low frequency is acknowledged.** This is the correct *primitive* (global reset is the special case of per-member reset), not a high-volume feature. YAGNI: no bulk-multi-select, no "reset by role", no scheduled resets.

---

## 2. Resolved decisions (disagreement-loop preempts — cite before relitigating)

These are deliberate, cited decisions. A reviewer challenging one must first read the cited precedent.

1. **New internal result kind `selection_reset` (NOT reuse of `identity_invalidated` or `epoch_stale`).**
   - The dispatch brief said "reuse the existing invalidation result kind." On citation review this is wrong on the merits: reusing `identity_invalidated` routes the crew member to the banner `PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER` = *"This identity is now claimed by a signed-in user…"* (`lib/messages/catalog.ts:2858-2867`), which is **false and misleading** for an admin reset. Faking `epoch_stale` is semantically false — the epoch is **unchanged** — and would mis-stamp the `PICKER_SELECTION_RACE` cleanup alert's `stale_epoch`.
   - Resolution: add a dedicated internal TS union member `selection_reset` that maps to the **existing** crew banner `PICKER_EPOCH_STALE_BANNER` = *"Doug reset access for this show — pick yourself again."* (`catalog.ts:2718-2727`), which is exactly accurate. **A new TS union member is not a §12.4 code.** No catalog change, no `gen:spec-codes` change.

2. **Dual-surface resolver check.** `selections_reset_at` is checked in **both** `resolvePickerSelection.ts` AND the google-success branch of `resolveShowPageAccess.ts`, mirroring the existing `claimed_via_oauth_at` dual-check (`resolvePickerSelection.ts:107-117` + `resolveShowPageAccess.ts:209-229`). Omitting the second surface would be the exact "companion-surface" miss the repo's Codex-notes call out.

3. **Reset-all keeps the epoch mechanism.** The unified control's "reset all" path calls the **existing** `reset_picker_epoch_atomic` (epoch bump) unchanged — cheaper (one `shows` column) than stamping every crew row, and already tested/locked. "Unified" refers to the **UI** (one entry point), not a merged DB mechanism. This honors the dispatch's "global reset becomes the reset-all special case of the unified control."

4. **Reuse `PICKER_EPOCH_RESET` admin alert for the per-member case.** The new server action emits the existing admin alert `PICKER_EPOCH_RESET` (`catalog.ts:2692-2704`) with an added `context.scope: "member"` and `context.crew_member_id`. **No copy edit** to the §12.4 row (avoids the 3-way-lockstep hazard; the copy "Picker selections were reset for this show…" remains true for a single-member reset). No new alert code.

5. **No PostgREST-DML-lockdown change.** `crew_members` is already RPC-gated: `INSERT/UPDATE/DELETE` are REVOKEd from `anon,authenticated` (`supabase/migrations/20260521000000_signed_link_admin_table_grants.sql:80-81`) and registered in `tests/db/postgrest-dml-lockdown.test.ts:148-159`. The new RPC is the required write path; the lockdown already forbids direct writes. No registry row change.

6. **`selection_reset` check precedes the `claimed_after_pick` check** in `resolvePickerSelection` — an admin reset should force re-pick even for a claimed identity. Documented in §5.2.

---

## 3. Data layer

### 3.1 New column

New migration `supabase/migrations/20260703000000_crew_members_selections_reset_at.sql`, mirroring the shape of `20260524000001_crew_members_claimed_via_oauth_at.sql:1-5`:

```sql
alter table public.crew_members
  add column if not exists selections_reset_at timestamptz null;

comment on column public.crew_members.selections_reset_at is
  'Per-member picker reset marker. When non-null, any picker cookie selection with pick-timestamp <= this value is invalidated and the crew member is re-prompted to pick. Stamped only by reset_crew_member_selection (admin, SECURITY DEFINER). NULL = never reset (default).';
```

- `add column if not exists` → apply-twice idempotent.
- Nullable, default NULL → existing rows unaffected; the resolver treats NULL as "never reset" (§5.1 guard).
- No CHECK needed (a bare nullable timestamptz).

### 3.2 Flag lifecycle table (per project spec-review rule)

| Field | Storage | Write path(s) | Read path(s) | Actual effect on output |
|---|---|---|---|---|
| `crew_members.selections_reset_at` | `public.crew_members` column (nullable timestamptz) | **Only** `reset_crew_member_selection` RPC (`= clock_timestamp()`). Reset-all path does NOT touch it (uses epoch). | `resolvePickerSelection.ts` (new `.select` field + compare); `resolveShowPageAccess.ts` google branch (new `.select` field + compare) | When non-null and `entry.t <= selections_reset_at`: resolver returns `selection_reset` → crew sees `PICKER_EPOCH_STALE_BANNER` and re-picks; google-branch returns `needs_picker_bootstrap`. Otherwise no effect. |

No zombie-flag risk: written by exactly one path, read by exactly two, with a concrete output effect.

### 3.3 Tier × layer matrix (DB-touching change)

Only the **crew (booking-adjacent)** tier is touched; there is no user/client/shift analogue of a picker selection. Matrix by layer:

| Layer | Action |
|---|---|
| Table DDL | Add `selections_reset_at` (§3.1) |
| Inline CHECK | N/A — nullable timestamptz, no constraint |
| RPC read path | `resolvePickerSelection` + `resolveShowPageAccess` add column to `.select` and compare (§5) |
| RPC write path | New `reset_crew_member_selection` (§4) |
| Propagation trigger | N/A — not propagated across shows; per-`crew_members`-row |
| Cleanup function | N/A — column is not user config; no sync-cleanup touches it. Sync re-writes of a crew row (`applyParseResult`) MUST NOT clear it (§4.4 note) |
| Frontend form | Reworked admin control (§6) |
| Audit page | N/A — no dedicated audit surface; admin alert `PICKER_EPOCH_RESET` covers forensics |
| Tests | §7 |
| Schema manifest | Regenerate `pnpm gen:schema-manifest` → `supabase/__generated__/schema-manifest.json` crew_members block (currently `:73-86`, **12 cols → 13** — the current 12 already include `claimed_via_oauth_at`) |
| Validation project | Apply migration surgically (`supabase db query --linked`) per `validation-schema-parity` gate |

---

## 4. RPC — `reset_crew_member_selection`

### 4.1 Contract

New migration `supabase/migrations/20260703000001_reset_crew_member_selection.sql`, mirroring `20260523000003_reset_picker_epoch_atomic.sql`.

- **Signature:** `public.reset_crew_member_selection(p_show_id uuid, p_crew_member_id uuid) returns timestamptz` — returns the stamped `selections_reset_at` (the new marker), **or NULL if no matching `(id, show_id)` row exists** (bad id / wrong show / removed member). It does **NOT** raise on not-found; the NULL return is the discriminable not-found signal consumed by the server action (§4.2). (An admin-gate failure and an infra fault DO raise/error; not-found does not.)
- **Admin gate:** `if not public.is_admin() then raise exception ...` (mirror `20260523000003:15`).
- **Advisory lock:** look up `v_drive_file_id` from `shows` (`:21-24` pattern), then `perform pg_advisory_xact_lock(hashtext('show:' || v_drive_file_id));` (mirror `:30`). **Single holder** — the JS server action must NOT wrap it in `withShowAdvisoryLock` (invariant 2).
- **Write:** `update public.crew_members set selections_reset_at = clock_timestamp() where id = p_crew_member_id and show_id = p_show_id returning selections_reset_at into v_reset_at;` — the `and show_id = p_show_id` guard prevents cross-show resets.
- **Invalidation broadcast — NONE (deliberate; finding #6).** `public.crew_members` already carries a statement-level `AFTER UPDATE` trigger `crew_members_publish_invalidation` → `publish_show_invalidation_after_statement()` (`supabase/migrations/20260501001000_internal_and_admin.sql:95-99`), so the `UPDATE` above auto-publishes the realtime invalidation. The RPC must **NOT** also call `publish_show_invalidation(p_show_id)` — that helper exists specifically for `shows` mutations, which lack the trigger (`supabase/migrations/20260503000000_publish_show_invalidation_helper.sql:5-15`). This is why the epoch RPC (which mutates `shows`) calls the helper but this RPC (which mutates `crew_members`) does not. A test asserts the RPC body does not call the helper (§7.2).
- **Grants:** `revoke all on function ... from public, anon, authenticated, service_role; grant execute on function ... to authenticated;` (mirror `:44-45`).

### 4.2 Return / not-found semantics

- If no row matches `(p_crew_member_id, p_show_id)` (bad id, wrong show, removed member): `v_reset_at` is NULL. The RPC returns NULL. The server action maps NULL → `{ ok: false, code: "PICKER_CREW_MEMBER_NOT_FOUND" }` (existing code, `catalog.ts` — see §8). No exception (keeps the happy/failure paths discriminable per Supabase call-boundary discipline).

### 4.3 Idempotency / apply-twice

- Use `create or replace function`; the migration is re-runnable. Grants use `revoke ... ` + `grant ...` (idempotent).

### 4.4 Interaction notes

- **Sync must not clobber the marker.** `applyParseResult` re-writes crew rows on sheet changes. Confirm it uses column-scoped updates that do not reset `selections_reset_at` (it does not reference the column — dossier item 3 shows `claimed_via_oauth_at` is likewise preserved across sync; `selections_reset_at` follows the same pattern). Add a test asserting a sync round-trip preserves a set `selections_reset_at` (§7).
- **Rename/role change** never needs a reset (picks key by stable `id`, names/roles render from the roster) — the admin uses this only for genuine mis-binds.

---

## 5. Resolver changes

### 5.1 `resolvePickerSelection.ts`

- **Union:** add `| { kind: "selection_reset"; expectedEpoch: number; expectedCrewMemberId: string }` (same shape as `epoch_stale`, to feed the same cleanup hint).
- **Read:** extend the crew `.select` at `:91-96` from `"id, claimed_via_oauth_at"` to `"id, claimed_via_oauth_at, selections_reset_at"`; extend `CrewRow` type (`:25-28`).
- **New branch — placed immediately AFTER the `removed_from_roster` null-check (`:103-105`) and BEFORE the `claimed_via_oauth_at` check (`:107`):**
  ```ts
  if (crewRow.selections_reset_at !== null) {
    const resetAtMillis = Math.floor(new Date(crewRow.selections_reset_at).getTime());
    if (entry.t <= resetAtMillis) {
      return { kind: "selection_reset", expectedEpoch: entry.e, expectedCrewMemberId: entry.id };
    }
  }
  ```
- **Guard conditions:** `selections_reset_at === null` → skip (default). `entry.t > resetAtMillis` (picked after the reset) → skip (they already re-picked). `new Date(...)` on a valid timestamptz string is finite; a malformed value would yield NaN — `entry.t <= NaN` is `false`, so a corrupt marker fails **open** (does not force a spurious reset). This matches the existing `claimed_via_oauth_at` code's implicit behavior (`:108-109`).

### 5.2 Check order rationale

Order after crew read: `removed_from_roster` → **`selection_reset`** → `claimed_after_pick` → `session_mismatch` → `resolved`. An admin reset wins over a claim-after-pick banner because Doug's explicit action should always force a re-pick; and the reset banner ("Doug reset access") is the more accurate message when both could apply.

### 5.3 `resolveShowPageAccess.ts` (google-success branch)

Mirror the `claimed_via_oauth_at` dual-check. Extend `readCrewClaimRow`'s `.select` (`:137`) to include `selections_reset_at`; extend `CrewClaimRow` (`:42-44`). In the google-success block, after the existing claim-epoch check (`:220-229`), add:
```ts
if (crewClaimRow.selections_reset_at !== null) {
  const resetAtMillis = Math.floor(new Date(crewClaimRow.selections_reset_at).getTime());
  if (entry.t <= resetAtMillis) {
    return { kind: "needs_picker_bootstrap", intentToken: signIntentToken(
      { slug, shareToken, exp: Math.floor(Date.now() / 1000) + 60 }, key) };
  }
}
```
Rationale: for an OAuth-claimed member the reset routes to re-bootstrap (same as claim-after-pick at `:221-228`), which re-confirms identity. This keeps the two per-member markers behaviorally parallel. (Note: OAuth-claimed members re-bootstrap to the same identity automatically — the reset is a re-confirmation, not a revocation, for that population. Documented, not a bug.)

### 5.4 Page + interstitial (`app/show/[slug]/[shareToken]/page.tsx`)

- `toPageResult` in `resolveShowPageAccess.ts` (`:75-111`) already switches on the resolver's kinds — add a `selection_reset` case that passes through with `showId` (add to `ResolveShowPageAccessResult` union `:12-34`).
- `page.tsx:232-266`: the shared stale case block currently lists `epoch_stale`/`removed_from_roster`/`identity_invalidated`. Add `selection_reset` to that case group and to the banner map (`:246-251`) → `"PICKER_EPOCH_STALE_BANNER"`. Pass `staleCleanupHint={{ expectedEpoch, expectedCrewMemberId }}` as the others do.
- Update the `assertNever` exhaustiveness (`:268-274`) so a missing branch fails typecheck.

### 5.5 Cleanup path — reused unchanged (§ why it's safe)

`cleanupStaleEntry` compares on `(entry.e === expectedEpoch && entry.id === expectedCrewMemberId)` only (`lib/auth/picker/cleanupStaleEntry.ts:` compare-and-delete). For a per-crew reset the epoch is **unchanged**, so passing `expectedEpoch: entry.e` matches, `expectedCrewMemberId: entry.id` matches → the stale cookie entry is deleted and the member re-picks. After re-pick, the new entry's `t = now > selections_reset_at`, so it resolves cleanly (no banner loop). **No cleanup code change.** The emitted `PICKER_SELECTION_RACE` alert's copy ("a stale saved picker selection was cleaned up after the show access state changed") remains accurate — a reset is an access-state change.

---

### 5.6 ALL `resolvePickerSelection` consumers must handle `selection_reset` (finding #1 — HIGH)

`resolvePickerSelection` is consumed by **five** surfaces, not just the crew page. Adding a union member forces every consumer to handle it. Three are `switch` statements with **no `default`**, so omitting the new kind is a **typecheck failure** (good — it forces the edit, but the spec must enumerate the required change and its semantics). In every case `selection_reset` is handled **identically to `epoch_stale`**: the pick is not valid, deny / re-prompt.

| Consumer | File:line | Current handling of `epoch_stale` group | Required `selection_reset` handling |
|---|---|---|---|
| Crew page | `app/show/[slug]/[shareToken]/page.tsx:232-266` (via `resolveShowPageAccess.toPageResult`) | shared stale case → `PICKER_EPOCH_STALE_BANNER` + cleanup hint | Add to the shared case group + banner map → `PICKER_EPOCH_STALE_BANNER` (§5.4) |
| Version API | `app/api/show/[slug]/version/route.ts:100-104` | grouped `no_selection`/`epoch_stale`/`removed_from_roster` → `401 SHOW_VERSION_AUTH_FAILED` | Add `case "selection_reset":` to that group → same 401 |
| Realtime subscriber-token | `app/api/realtime/subscriber-token/route.ts:167-173` | grouped → `401 SHOW_REALTIME_BROADCAST_AUTH_FAILED` | Add to that group → same 401 |
| Asset session | `lib/auth/picker/validatePickerAssetSession.ts:53-56` | grouped → `unauthorized()` | Add to that group → `unauthorized()` |
| Report API | `app/api/report/route.ts:126-160` | if-chain: `resolved`→ok; `identity_invalidated`/`show_unavailable`→410; `infra_error`→500; **all other kinds fall through** to the admin-auth path → denied for crew | **No code change required** — `selection_reset` falls through exactly like `epoch_stale`/`removed_from_roster` today → non-admin crew denied. A test pins this (§7). Documented so a reviewer does not read the absence as an omission. |

Note: `lib/audit/authPrimitives.ts` lists `lib/auth/picker/resolvePickerSelection.ts` as an auth-chain surface (registry only — not a kind-consumer; no change). Each of the four code-changed consumers gets a test (§7).

## 6. Admin UI — unified reset control

**This is a UI surface → Opus-only + invariant 8 impeccable dual-gate.**

### 6.1 Shape (one control, per-crew default, reset-all secondary)

Replace the current single-purpose `<ResetPickerEpochButton>` in the `CurrentShareLinkPanel` actions slot with a unified `<PickerResetControl>` that:

- **Primary (default) action — reset one crew member:** a labeled select/combobox populated from the already-loaded roster (`crew: { id, name, role }[]` from `page.tsx:238-245`), plus a "Reset" button. Requires a selection before enabling Reset. Two-tap idle→confirm→resolving pattern reused from `ResetPickerEpochButton` (`:27,74-98`). Confirm copy: *"Reset [Name]'s pick? They'll choose their name again on their next visit."* Success: *"Reset [Name]'s picker selection."*
- **Secondary action — reset everyone:** a visually de-emphasized affordance (small text button / link) *"or reset everyone's pick"* that calls the existing global `resetPickerEpoch`. Confirm copy preserved from today: *"Every device's picker re-prompts on next visit."* Success: *"Picker selections reset."*
- Both actions are disabled while any reset is resolving.

### 6.2 Guard conditions (per project rule — every prop's null/empty/zero)

- **Empty roster** (`crew.length === 0`): render only the "reset everyone" affordance disabled with helper text *"No crew to reset yet."* — no member selector. (Empty roster is a real state; `PICKER_EMPTY_ROSTER` exists for the crew side.)
- **Single crew member:** selector still renders (one option) — consistent behavior.
- **Selected member id no longer in roster** (roster changed under the panel): the server action returns `PICKER_CREW_MEMBER_NOT_FOUND`; surface via `lib/messages/lookup.ts` (no raw code — invariant 5). The select resets.
- **Reset returns `PICKER_RESOLVER_LOOKUP_FAILED`** (infra): show the crew-safe copy through `lookup.ts`; leave the panel usable for retry.
- **name is empty string**: the select option shows the row's `role` as a fallback label (names are `not null` in DDL `:34`, so empty is only possible via bad data; guard anyway).

### 6.3 Server action — `lib/auth/picker/resetCrewMemberSelection.ts`

Mirror `resetPickerEpoch.ts`:

- `"use server"`; `// not-subject-to-revalidate (...)` comment — mutates only `crew_members.selections_reset_at`, a picker/auth column NOT in the `getShowForViewer` DATA projection (same rationale as `resetPickerEpoch.ts:8-10`).
- Return type: `{ ok: true; reset_at: string } | { ok: false; code: "PICKER_CREW_MEMBER_NOT_FOUND" | "PICKER_RESOLVER_LOOKUP_FAILED" | "PICKER_INVALID_INPUT" }`.
- **Admin gate:** `requireAdminIdentity()` (returns `{ email }`, needed for the alert hash) — matches `resetPickerEpoch.ts:17`.
- **Input validation:** UUID-validate `showId` and `crewMemberId` → `PICKER_INVALID_INPUT` on failure.
- **RPC:** `supabase.rpc("reset_crew_member_selection", { p_show_id, p_crew_member_id })`; destructure `{ data, error }`; error OR null `data` → `{ ok: false, code }` (NULL data → `PICKER_CREW_MEMBER_NOT_FOUND`; error → `PICKER_RESOLVER_LOOKUP_FAILED`) — distinguishes returned-error from not-found per call-boundary discipline.
- **Alert:** best-effort `upsertAdminAlert({ showId, code: "PICKER_EPOCH_RESET", context: { show_id, scope: "member", crew_member_id, admin_email_hash: hashForLog(adminCtx.email) } })` wrapped in try/catch (mirror `resetPickerEpoch.ts:28-40`).
- **Meta-infra registration:** add `"lib/auth/picker/resetCrewMemberSelection.ts"` to `SUPABASE_CONSTRUCTOR_CONTRACT_FILES` in `tests/auth/_metaInfraContract.test.ts:217-229`, with the constructor call inside a `try` block per the contract.

---

## 7. Testing plan (TDD per task; concrete failure modes)

Every task: failing test → minimal impl → green → commit. Each test states the failure mode it catches.

1. **Migration apply + column presence** (`tests/db/...` or the schema-manifest test): asserts `crew_members.selections_reset_at` exists as nullable timestamptz. *Catches: migration not applied / wrong type.*
2. **RPC unit** (against local DB): admin stamps a member → `selections_reset_at` set + returned; non-admin → exception; wrong `(show_id, member_id)` pair → **NULL return (no raise)**; advisory lock held (assert via the topology test, task 6); **RPC body does NOT call `publish_show_invalidation`** (finding #6 — grep the migration SQL for the helper name, assert absent, since the `crew_members` AFTER UPDATE trigger already publishes). *Catches: missing admin gate, cross-show leak, no lock, redundant double-invalidation.*
3. **Resolver `selection_reset` branch** (`tests/auth/resolvePickerSelection...`): entry with `t` before `selections_reset_at` → `selection_reset` with `{expectedEpoch: entry.e, expectedCrewMemberId: entry.id}`; entry with `t` after → `resolved`; `selections_reset_at === null` → `resolved`; malformed marker (NaN) → does NOT force reset (fails open). Order test: reset wins over claimed_after_pick. *Catches: wrong branch, guard holes, NaN fail-closed regression, wrong precedence.*
4. **`resolveShowPageAccess` google-branch parity**: OAuth session + reset marker after pick → `needs_picker_bootstrap`. *Catches: companion-surface omission.*
5. **Page banner mapping** (component test): `selection_reset` result → renders `PICKER_EPOCH_STALE_BANNER` crew copy (assert against `getCrewFacing("PICKER_EPOCH_STALE_BANNER")`, NOT a hardcoded string — anti-tautology) and mounts the stale-cleanup form with `expectedEpoch`/`expectedCrewMemberId`. *Catches: wrong/misleading banner, missing cleanup.*
6. **Advisory-lock topology** (`tests/auth/advisoryLockRpcDeadlock.test.ts`): register `reset_crew_member_selection` — add its migration to `migrationFiles` (`:33-58`), add `toContain("reset_crew_member_selection")` (`:79-98`), add to `lockTakingMigrations` for the PF11 order check (`:165-178`). *Catches: nested-lock deadlock, lock-before-FOR-UPDATE order.*
7. **Server action** (`tests/auth/resetCrewMemberSelection...`): admin happy path → `{ok:true, reset_at}`; RPC error → `PICKER_RESOLVER_LOOKUP_FAILED`; NULL data → `PICKER_CREW_MEMBER_NOT_FOUND`; bad UUID → `PICKER_INVALID_INPUT`; alert emitted with `scope:"member"`. *Catches: undiscriminated error paths, missing input guard.*
8. **Sync-preserves-marker** (`tests/sync/...`): set `selections_reset_at`, run an `applyParseResult` round-trip that updates the same crew row (name change) → marker preserved. *Catches: sync clobbering the marker.*
9. **Admin UI** (component + real-browser where layout matters): unified control renders member selector from roster; empty roster → only "reset everyone" + helper text; per-member reset calls `resetCrewMemberSelection` with the selected id; "reset everyone" calls `resetPickerEpoch`; failure codes render via `lookup.ts` (no raw code). *Catches: wrong action wiring, empty-roster crash, raw-code leak (invariant 5).*
10. **Meta-infra contract** (`tests/auth/_metaInfraContract.test.ts`): passes with the new file registered. *Catches: unregistered Supabase constructor.*
11. **Schema-parity** (`tests/db/validation-schema-parity.test.ts`): regenerated manifest ⊆ validation project. *Catches: manifest not regenerated / migration not applied to validation.*
12. **Resolver-consumer parity** (finding #1): four tests, one per code-changed consumer, asserting a `selection_reset` result is denied/re-prompted like `epoch_stale`: version route → `401 SHOW_VERSION_AUTH_FAILED`; realtime subscriber-token → `401 SHOW_REALTIME_BROADCAST_AUTH_FAILED`; `validatePickerAssetSession` → `unauthorized()`; report route → non-admin crew denied (falls through admin path). *Catches: an unhandled union member silently granting or 500-ing on a reset cookie in a non-page auth surface.*
13. **Admin-alert 2nd-producer registration** (finding #2): `tests/messages/_metaAdminAlertCatalog.test.ts` passes with `resetCrewMemberSelection.ts` registered as a second `PICKER_EPOCH_RESET` write-site. *Catches: an unregistered admin_alerts producer (documented meta-discipline).*

No fixed-dimension-parent layout invariant is introduced (the control is flow-layout text + a select + buttons); therefore **no dedicated Playwright getBoundingClientRect layout task** is required. **Transition inventory:** the control has states idle → confirm → resolving → (success | error) for each of two actions; these reuse the existing `ResetPickerEpochButton` two-tap pattern (instant text swaps, no animated layout morph). A transition-audit checklist entry is included in the plan, but no compound cross-fade transitions exist (state changes are button-label swaps).

---

## 8. §12.4 / message codes

**No new codes.** Reused, all cited as existing:
- Crew banner: `PICKER_EPOCH_STALE_BANNER` (`catalog.ts:2718`).
- Admin alert: `PICKER_EPOCH_RESET` (`catalog.ts:2692`) with added `context.scope`/`crew_member_id` (context is free-form; no copy edit).
- Failure codes surfaced in UI via `lib/messages/lookup.ts`: `PICKER_CREW_MEMBER_NOT_FOUND`, `PICKER_RESOLVER_LOOKUP_FAILED`, `PICKER_INVALID_INPUT` (all pre-existing per dossier item 13). Invariant 5: UI never shows a raw code.

Because no §12.4 row is added or edited, the `x1-catalog-parity` / `gen:spec-codes` lockstep is **not** triggered. (If Codex insists a distinct member-reset alert code is warranted, that is a follow-up with the full 3-way lockstep — out of scope for this MVP.)

---

## 9. Meta-test inventory (declared per project rule)

- **CREATES:** none.
- **EXTENDS:**
  - `tests/auth/advisoryLockRpcDeadlock.test.ts` — new RPC registration (§7.6).
  - `tests/auth/_metaInfraContract.test.ts` — new helper file registration (§6.3).
  - `tests/messages/_metaAdminAlertCatalog.test.ts` — **register the SECOND `PICKER_EPOCH_RESET` producer** (finding #2). The new server action `resetCrewMemberSelection.ts` is an additional `upsertAdminAlert` write-site for the existing code `PICKER_EPOCH_RESET`. Convert that code's registry entry (currently `path: "lib/auth/picker/resetPickerEpoch.ts"`, `:135-138`) to a multi-site form covering both files (the test already supports a `sites` array and iterates each — the `SHOW_UNPUBLISHED` two-producer precedent at `:205-211` is the pattern). This does **not** add a §12.4 catalog code; it registers a second producer of an existing one.
- **UNCHANGED (declared, with reason):** `tests/db/postgrest-dml-lockdown.test.ts` — `crew_members` already gated + registered (§2.5); no new RPC-gated table.

## 10. Advisory-lock holder topology (mandatory — plan touches `pg_advisory*`)

- Hashkey: `hashtext('show:' || drive_file_id)`.
- **Existing holders for this key (complete set — finding #3).** Every current holder acquires the lock **in-RPC** (self-locking SECURITY DEFINER); there is **no** JS-side `withShowAdvisoryLock` wrapper for this key, and no double-holder. The authoritative, CI-pinned list is `tests/auth/advisoryLockRpcDeadlock.test.ts:80-98`: `reset_picker_epoch_atomic`, `rotate_show_share_token`, `select_identity_atomic`, `claim_oauth_identity`, `mint_validation_fixture_atomic`, `validation_finalize_all_atomic`, `mi11_approve_hold`, `mi11_reject_hold`, `undo_change`, `reset_validation_data` — plus the `show:`-key holders in the b2 show-lifecycle set (`20260601000000`, `20260601000001`, `20260602000000`, `20260602000002`, `20260701000000_published_toggle_unpublish_show`), the signed-link RPCs (`20260504000004_revoke_leaked_link_atomic`, `20260505000001_redeem_link_locked_rpcs`, `20260505000003_recheck_link_session*`, `20260520000000_signed_link_admin_rpcs`), `20260608000004_retire_live_pending_syncs`, `20260611000001_onboarding_fixups_remediation`, and `20260612000003_m12_13_token_context_scrub`. (Grep of record: `rg "pg_advisory_xact_lock\(hashtext\('show:" supabase/migrations`.) The single-holder invariant holds across all of them.
- **New holder:** `reset_crew_member_selection` acquires the lock **in-RPC** (single layer), joining this in-RPC-only set. The JS server action `resetCrewMemberSelection.ts` MUST NOT wrap it in `withShowAdvisoryLock`. Pinned by `advisoryLockRpcDeadlock.test.ts` once registered (§7.6).

---

## 11. Help-doc copy edits (three surfaces)

All three currently describe the global reset. Reword to cover per-crew + reset-all:
- `app/help/admin/sharing-links/page.mdx:24-27,44-50` — "Reset picker selections" → describe choosing a crew member to reset, with reset-all as the broad option.
- `app/help/admin/per-show-panel/page.mdx:64` — update the Share & access enumeration.
- `app/help/tour/page.mdx:93` — update the one-line panel description.
Exact copy drafted in the plan; must not introduce raw error codes.

---

## 12. Numeric / self-consistency sweep

- Crew columns: 12 → **13** after migration (the current 12 already include `claimed_via_oauth_at`; manifest `:73-86`). Single source: §3.3.
- Result-kind union members in `resolvePickerSelection`: 7 → **8** (add `selection_reset`). Single source: §5.1.
- New files: 2 migrations, 1 server action, 1 UI control component, plus edits. No literal reused across sections that isn't cross-referenced.
- "No new §12.4 codes" asserted in §0, §2.4, §8 — consistent.

---

## 13. Out of scope (YAGNI)

- Bulk / multi-select reset; reset-by-role; scheduled resets.
- Server-side selection tracking / "who is currently picked" visibility (deliberately preserved as blind, cookie-only — §1.3).
- Per-member revocation as **access control** (that stays rotate / roster removal).
- Any new §12.4 code or admin-alert code.
- OAuth-claimed-member behavior beyond re-bootstrap (§5.3 note).
