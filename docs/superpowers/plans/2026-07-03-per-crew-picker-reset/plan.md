# Per-crew Picker Reset — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin reset **one** crew member's picker selection (forcing only that member to re-pick) without the existing global reset that re-prompts the entire roster.

**Architecture:** New nullable `crew_members.selections_reset_at timestamptz`, stamped only by a new admin-gated `SECURITY DEFINER` RPC `reset_crew_member_selection` (per-show advisory lock, single in-RPC holder). The picker resolver gains a per-member staleness check mirroring the existing `claimed_via_oauth_at` check, producing a new internal union member `selection_reset` that maps to the **existing** crew banner `PICKER_EPOCH_STALE_BANNER`. A unified admin control adds per-member reset (default) alongside the existing global reset-all. Correctness nudge, not access control.

**Tech Stack:** Next.js 16 (App Router, RSC + Server Actions), Supabase Postgres (SQL migrations, SECURITY DEFINER RPCs), TypeScript, Vitest, Playwright, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-07-03-per-crew-picker-reset.md` (APPROVED, Codex 6 rounds). Every task cites the spec section it implements. Read the spec's §2 Resolved Decisions before starting.

## Global Constraints

- **TDD per task:** failing test → run-fail → minimal impl → run-pass → commit. Never impl before its test.
- **Commit per task**, conventional commits: `feat(auth):` / `test(auth):` / `feat(admin):` / `feat(db):` / `docs(help):`. Use `--no-verify` (shared hooks belong to the main checkout); run `pnpm format:check` before pushing.
- **Advisory lock single-holder:** the new RPC self-locks in-RPC; the JS server action MUST NOT wrap it in `withShowAdvisoryLock`. Register both surfaces in `tests/auth/advisoryLockRpcDeadlock.test.ts` (Task 2).
- **No raw error codes in UI** (invariant 5). The admin control renders admin-authored inline copy (spec §6.2), NOT the crew-facing picker catalog copy.
- **Supabase call-boundary** (invariant 9): destructure `{ data, error }`; distinguish returned-error from not-found; register the new helper in `tests/auth/_metaInfraContract.test.ts` (Task 8).
- **No new §12.4 codes; no `admin_alerts` change** (spec §2.4, §8). The per-member reset emits NO admin alert.
- **UI = Opus + impeccable dual-gate** (invariant 8): Task 9 runs `/impeccable critique` AND `/impeccable audit`; HIGH/CRITICAL fixed or `DEFERRED.md`'d before cross-model review.
- **Migration → validation parity:** apply locally, `pnpm gen:schema-manifest` + commit, apply surgically to validation project (Task 11).
- **Result-kind name:** `selection_reset` (exact). **Column:** `crew_members.selections_reset_at` (exact). **RPC:** `reset_crew_member_selection(p_show_id uuid, p_crew_member_id uuid) returns timestamptz` (exact).

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260703000000_crew_members_selections_reset_at.sql` | Create | The nullable column |
| `supabase/migrations/20260703000001_reset_crew_member_selection.sql` | Create | Admin RPC (lock, guard, stamp) |
| `lib/auth/picker/resolvePickerSelection.ts` | Modify | `selection_reset` union + read + branch |
| `lib/auth/picker/resolveShowPageAccess.ts` | Modify | dual-surface check + `toPageResult` + union |
| `app/show/[slug]/[shareToken]/page.tsx` | Modify | `selection_reset` banner case |
| `app/api/show/[slug]/version/route.ts` | Modify | `selection_reset` switch case |
| `app/api/realtime/subscriber-token/route.ts` | Modify | `selection_reset` switch case |
| `lib/auth/picker/validatePickerAssetSession.ts` | Modify | `selection_reset` switch case |
| `lib/auth/picker/resetCrewMemberSelection.ts` | Create | Server action (no alert) |
| `app/admin/show/[slug]/PickerResetControl.tsx` | Create | Unified admin control (per-crew + reset-all) |
| `app/admin/show/[slug]/page.tsx` | Modify | Render unified control; pass roster |
| `tests/auth/advisoryLockRpcDeadlock.test.ts` | Modify | Register new RPC (4 surfaces) |
| `tests/auth/_metaInfraContract.test.ts` | Modify | Register new helper file |
| `app/help/admin/sharing-links/page.mdx`, `app/help/admin/per-show-panel/page.mdx`, `app/help/tour/page.mdx` | Modify | Copy: per-crew + reset-all |
| `supabase/__generated__/schema-manifest.json` | Regenerate | +`selections_reset_at` |

---

## Task 1: Migration — `selections_reset_at` column

Implements spec §3.1. **Files:** Create `supabase/migrations/20260703000000_crew_members_selections_reset_at.sql`; Test `tests/db/selectionsResetAtColumn.test.ts` (or extend the schema-manifest test).

**Interfaces — Produces:** column `public.crew_members.selections_reset_at timestamptz null`.

- [ ] **Step 1: Write the failing test** — `tests/db/selectionsResetAtColumn.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("crew_members.selections_reset_at migration", () => {
  test("migration adds a nullable timestamptz column, idempotently", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260703000000_crew_members_selections_reset_at.sql"),
      "utf8",
    );
    expect(sql).toMatch(/add column if not exists selections_reset_at timestamptz null/i);
    expect(sql).toMatch(/comment on column public\.crew_members\.selections_reset_at/i);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (file missing): `pnpm vitest run tests/db/selectionsResetAtColumn.test.ts`
- [ ] **Step 3: Create the migration:**

```sql
-- Per-crew picker reset (2026-07-03): per-member picker-selection invalidation marker.
-- Mirrors 20260524000001_crew_members_claimed_via_oauth_at.sql shape.
alter table public.crew_members
  add column if not exists selections_reset_at timestamptz null;

comment on column public.crew_members.selections_reset_at is
  'Per-member picker reset marker. When non-null, any picker cookie selection with pick-timestamp (entry.t, millis) <= this value is invalidated and the crew member is re-prompted to pick. Stamped only by reset_crew_member_selection (admin, SECURITY DEFINER). NULL = never reset (default).';
```

- [ ] **Step 4: Apply locally + run test — expect PASS.** Apply to the local dev DB (per repo convention, e.g. `psql "$DATABASE_URL" -f supabase/migrations/20260703000000_crew_members_selections_reset_at.sql` then `notify pgrst, 'reload schema';`), then `pnpm vitest run tests/db/selectionsResetAtColumn.test.ts`.
- [ ] **Step 5: Commit:** `git add supabase/migrations/20260703000000_* tests/db/selectionsResetAtColumn.test.ts && git commit --no-verify -m "feat(db): add crew_members.selections_reset_at for per-crew picker reset"`

---

## Task 2: Migration — `reset_crew_member_selection` RPC + advisory-lock registration

Implements spec §4, §7.2, §7.6, §10. **Files:** Create `supabase/migrations/20260703000001_reset_crew_member_selection.sql`; Modify `tests/auth/advisoryLockRpcDeadlock.test.ts`; Test `tests/auth/resetCrewMemberSelectionRpc.test.ts` (SQL-shape assertions; behavioral DB test if the repo's RPC tests run against a live local DB — follow the sibling `reset_picker_epoch_atomic` test's harness).

**Interfaces — Produces:** RPC `public.reset_crew_member_selection(p_show_id uuid, p_crew_member_id uuid) returns timestamptz` (NULL on not-found; raises `42501` for non-admin).

- [ ] **Step 1: Write the failing SQL-shape test** — `tests/auth/resetCrewMemberSelectionRpc.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260703000001_reset_crew_member_selection.sql"),
  "utf8",
);

describe("reset_crew_member_selection RPC", () => {
  test("admin-gated", () => expect(sql).toMatch(/if not public\.is_admin\(\)/));
  test("single in-RPC advisory lock on show key", () =>
    expect(sql).toMatch(/pg_advisory_xact_lock\(hashtext\('show:' \|\| v_drive_file_id\)\)/));
  test("missing-show guard returns NULL before the lock (no raise)", () => {
    const lockIdx = sql.indexOf("pg_advisory_xact_lock");
    const guardIdx = sql.search(/if v_drive_file_id is null then\s+return null;/);
    expect(guardIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(lockIdx); // guard precedes lock
  });
  test("scopes the UPDATE by (id, show_id)", () =>
    expect(sql).toMatch(/where id = p_crew_member_id\s+and show_id = p_show_id/));
  test("stamps clock_timestamp() and returns the marker", () =>
    expect(sql).toMatch(/set selections_reset_at = clock_timestamp\(\)/));
  test("does NOT call publish_show_invalidation (crew_members AFTER UPDATE trigger publishes)", () =>
    expect(sql).not.toMatch(/publish_show_invalidation/));
  test("revokes broadly then grants execute to authenticated", () => {
    expect(sql).toMatch(/revoke all on function public\.reset_crew_member_selection\(uuid, uuid\) from public, anon, authenticated, service_role/);
    expect(sql).toMatch(/grant execute on function public\.reset_crew_member_selection\(uuid, uuid\) to authenticated/);
  });
});
```

- [ ] **Step 2: Run — expect FAIL:** `pnpm vitest run tests/auth/resetCrewMemberSelectionRpc.test.ts`
- [ ] **Step 3: Create the migration** (mirrors `20260523000003`, with the missing-show guard returning NULL per spec §4.1, and NO publish helper per §4/finding #6):

```sql
-- Per-crew picker reset (2026-07-03): admin reset of ONE crew member's picker selection.
-- SECURITY DEFINER; the ONLY advisory-lock holder for this path — callers MUST NOT wrap it
-- in a JS-side per-show lock. Unlike reset_picker_epoch_atomic (which mutates shows and calls
-- publish_show_invalidation), this mutates crew_members, whose AFTER UPDATE statement trigger
-- (crew_members_publish_invalidation) already publishes — so NO explicit helper call.
create or replace function public.reset_crew_member_selection(p_show_id uuid, p_crew_member_id uuid)
  returns timestamptz
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_drive_file_id text;
  v_reset_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'admin role required'
      using errcode = '42501',
            hint = 'reset_crew_member_selection is admin-only';
  end if;

  select drive_file_id
    into v_drive_file_id
    from public.shows
   where id = p_show_id;

  -- Missing show → typed not-found (NULL), NOT a raise, so both not-found paths
  -- (missing show, missing/wrong-show crew member) stay discriminable at the JS boundary.
  if v_drive_file_id is null then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtext('show:' || v_drive_file_id));

  update public.crew_members
     set selections_reset_at = clock_timestamp()
   where id = p_crew_member_id
     and show_id = p_show_id
   returning selections_reset_at into v_reset_at;

  -- v_reset_at is NULL when no row matched (bad id / wrong show / removed member).
  return v_reset_at;
end;
$$;

revoke all on function public.reset_crew_member_selection(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.reset_crew_member_selection(uuid, uuid) to authenticated;
```

- [ ] **Step 4: Register the RPC in `tests/auth/advisoryLockRpcDeadlock.test.ts` (all 4 surfaces, spec §7.6):**
  - (a) add `"supabase/migrations/20260703000001_reset_crew_member_selection.sql"` to the `migrationFiles` array (~:33-58).
  - (b) add `expect(lockTakingNames).toContain("reset_crew_member_selection")` to the RPC-name assertions (~:79-98).
  - (c) add the same migration path to `lockTakingMigrations` for the PF11 lock-before-`FOR UPDATE` order check (~:165-178).
  - (d) add `"lib/auth/picker/resetCrewMemberSelection.ts"` to the `sourceFiles` JS-caller list (~:100-122) so the single-holder (no `withShowAdvisoryLock` wrapper) assertion covers the new action. *(The file is created in Task 8; if the deadlock test reads the file eagerly, land the (d) edit in Task 8's commit instead and note it here.)*

- [ ] **Step 5: Apply locally + run tests — expect PASS:** apply the migration to the local DB + `notify pgrst`, then `pnpm vitest run tests/auth/resetCrewMemberSelectionRpc.test.ts tests/auth/advisoryLockRpcDeadlock.test.ts`.
- [ ] **Step 6: Commit:** `git commit --no-verify -m "feat(auth): reset_crew_member_selection RPC (per-show lock, single holder) + deadlock-topology registration"`

---

## Task 3: Resolver — `resolvePickerSelection` `selection_reset` branch

Implements spec §5.1, §5.2. **Files:** Modify `lib/auth/picker/resolvePickerSelection.ts`; Test `tests/auth/resolvePickerSelectionReset.test.ts` (follow the existing `resolvePickerSelection` test harness for building signed cookies + mocking the service-role client).

**Interfaces — Produces:** union member `{ kind: "selection_reset"; expectedEpoch: number; expectedCrewMemberId: string }`.

- [ ] **Step 1: Write failing tests** (derive `entry.t` relative to the marker; do not hardcode):

```ts
// selection_reset fires when the pick predates the reset marker
test("pick before selections_reset_at → selection_reset", async () => {
  const resetAt = new Date("2026-07-03T12:00:00Z");
  const entryT = resetAt.getTime() - 1000; // picked before the reset
  const result = await resolveWith({ selections_reset_at: resetAt.toISOString(), entryT, epoch: 4 });
  expect(result).toEqual({ kind: "selection_reset", expectedEpoch: 4, expectedCrewMemberId: CREW_ID });
});
test("pick after selections_reset_at → resolved", async () => {
  const resetAt = new Date("2026-07-03T12:00:00Z");
  const result = await resolveWith({ selections_reset_at: resetAt.toISOString(), entryT: resetAt.getTime() + 1000, epoch: 4 });
  expect(result).toEqual({ kind: "resolved", crewMemberId: CREW_ID });
});
test("selections_reset_at null → resolved (default)", async () => {
  const result = await resolveWith({ selections_reset_at: null, entryT: 1, epoch: 4 });
  expect(result.kind).toBe("resolved");
});
test("malformed marker (NaN) fails OPEN → resolved (no spurious reset)", async () => {
  const result = await resolveWith({ selections_reset_at: "not-a-date", entryT: 1, epoch: 4 });
  expect(result.kind).toBe("resolved");
});
test("reset precedes claimed_after_pick when both apply", async () => {
  const resetAt = new Date("2026-07-03T12:00:00Z");
  const claimAt = new Date("2026-07-03T11:00:00Z");
  const result = await resolveWith({
    selections_reset_at: resetAt.toISOString(),
    claimed_via_oauth_at: claimAt.toISOString(),
    entryT: resetAt.getTime() - 1, epoch: 4,
  });
  expect(result.kind).toBe("selection_reset"); // reset wins
});
```

- [ ] **Step 2: Run — expect FAIL:** `pnpm vitest run tests/auth/resolvePickerSelectionReset.test.ts`
- [ ] **Step 3: Implement in `lib/auth/picker/resolvePickerSelection.ts`:**
  - Add to the union (after `removed_from_roster`): `| { kind: "selection_reset"; expectedEpoch: number; expectedCrewMemberId: string }`.
  - Extend `CrewRow` (`:25-28`): add `selections_reset_at: string | null`.
  - Extend the crew `.select` (`:91-96`): `"id, claimed_via_oauth_at, selections_reset_at"`.
  - Insert the branch **immediately after** the `if (!crewRow) { return removed_from_roster }` block and **before** `if (crewRow.claimed_via_oauth_at !== null)`:

```ts
if (crewRow.selections_reset_at !== null) {
  const resetAtMillis = Math.floor(new Date(crewRow.selections_reset_at).getTime());
  if (entry.t <= resetAtMillis) {
    return { kind: "selection_reset", expectedEpoch: entry.e, expectedCrewMemberId: entry.id };
  }
}
```
  *(NaN fails open: `entry.t <= NaN` is `false`.)*

- [ ] **Step 4: Run — expect PASS:** `pnpm vitest run tests/auth/resolvePickerSelectionReset.test.ts && pnpm typecheck`
- [ ] **Step 5: Commit:** `git commit --no-verify -m "feat(auth): resolvePickerSelection selection_reset branch (per-member reset)"`

---

## Task 4: Resolver — `resolveShowPageAccess` dual-surface + `toPageResult`

Implements spec §5.3, §5.4 (partial), §2.2. **Files:** Modify `lib/auth/picker/resolveShowPageAccess.ts`; Test `tests/auth/resolveShowPageAccessReset.test.ts`.

**Interfaces — Consumes** the `selection_reset` kind from Task 3. **Produces** `{ kind: "selection_reset"; showId; expectedEpoch; expectedCrewMemberId }` on `ResolveShowPageAccessResult`; google-branch returns `needs_picker_bootstrap` on reset.

- [ ] **Step 1: Write failing tests:**

```ts
test("cookie path: selection_reset passes through toPageResult with showId", async () => {
  // resolvePickerSelection → selection_reset ; expect page result carries showId + hint
  const r = await resolveShowPageAccessWith({ pickerResult: { kind: "selection_reset", expectedEpoch: 4, expectedCrewMemberId: CREW_ID } });
  expect(r).toEqual({ kind: "selection_reset", showId: SHOW_ID, expectedEpoch: 4, expectedCrewMemberId: CREW_ID });
});
test("google-success branch: reset marker after pick → needs_picker_bootstrap", async () => {
  const resetAt = new Date("2026-07-03T12:00:00Z");
  const r = await resolveShowPageAccessGoogleWith({ selections_reset_at: resetAt.toISOString(), entryT: resetAt.getTime() - 1 });
  expect(r.kind).toBe("needs_picker_bootstrap");
});
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement:**
  - Add to `ResolveShowPageAccessResult` union (after `removed_from_roster`): `| { kind: "selection_reset"; showId: string; expectedEpoch: number; expectedCrewMemberId: string }`.
  - In `toPageResult` switch, add: `case "selection_reset": return { kind: "selection_reset", showId, expectedEpoch: result.expectedEpoch, expectedCrewMemberId: result.expectedCrewMemberId };`
  - Extend `CrewClaimRow` (`:42-44`): add `selections_reset_at: string | null`; extend `readCrewClaimRow`'s `.select("claimed_via_oauth_at")` → `.select("claimed_via_oauth_at, selections_reset_at")`.
  - In the google-success block, after the existing claim-epoch check (`:220-229`), add (mirrors the claim check):

```ts
if (crewClaimRow.selections_reset_at !== null) {
  const resetAtMillis = Math.floor(new Date(crewClaimRow.selections_reset_at).getTime());
  if (entry.t <= resetAtMillis) {
    return {
      kind: "needs_picker_bootstrap",
      intentToken: signIntentToken(
        { slug, shareToken, exp: Math.floor(Date.now() / 1000) + 60 },
        key,
      ),
    };
  }
}
```

- [ ] **Step 4: Run — expect PASS:** `pnpm vitest run tests/auth/resolveShowPageAccessReset.test.ts && pnpm typecheck`
- [ ] **Step 5: Commit:** `git commit --no-verify -m "feat(auth): resolveShowPageAccess dual-surface selection_reset (cookie + google branches)"`

---

## Task 5: Crew page — `selection_reset` banner

Implements spec §5.4. **Files:** Modify `app/show/[slug]/[shareToken]/page.tsx`; Test `tests/show/pageSelectionResetBanner.test.tsx` (follow the existing page-result test harness).

**Interfaces — Consumes** the page-result `selection_reset` kind from Task 4.

- [ ] **Step 1: Write the failing test** (anti-tautology — assert against `getCrewFacing("PICKER_EPOCH_STALE_BANNER")`, not a hardcoded string):

```ts
import { getCrewFacing } from "@/lib/messages/lookup";
test("selection_reset renders the epoch-stale crew banner + cleanup hint", async () => {
  const ui = await renderShowPageWith({ kind: "selection_reset", showId: SHOW_ID, expectedEpoch: 4, expectedCrewMemberId: CREW_ID });
  expect(ui).toHaveTextContent(getCrewFacing("PICKER_EPOCH_STALE_BANNER"));
  // cleanup form mounted with the hint
  expect(ui.querySelector('[data-testid="picker-stale-cleanup"]')).toBeTruthy();
});
```

- [ ] **Step 2: Run — expect FAIL** (typecheck also fails: `assertNever` on the new kind).
- [ ] **Step 3: Implement in `page.tsx`:** add `case "selection_reset":` to the shared stale case group (`:232-234`) and extend the banner ternary (`:246-251`) so `epoch_stale || selection_reset` → `"PICKER_EPOCH_STALE_BANNER"`:

```ts
const banner =
  result.kind === "epoch_stale" || result.kind === "selection_reset"
    ? "PICKER_EPOCH_STALE_BANNER"
    : result.kind === "removed_from_roster"
      ? "PICKER_REMOVED_FROM_ROSTER_BANNER"
      : "PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER";
```
The `staleCleanupHint={{ expectedEpoch, expectedCrewMemberId }}` is already passed for the shared group — `selection_reset` reuses it (epoch unchanged so the compare-and-delete in `cleanupStaleEntry` still matches on `(e,id)`; spec §5.5).

- [ ] **Step 4: Run — expect PASS:** `pnpm vitest run tests/show/pageSelectionResetBanner.test.tsx && pnpm typecheck`
- [ ] **Step 5: Commit:** `git commit --no-verify -m "feat(crew-page): selection_reset renders epoch-stale re-pick banner"`

---

## Task 6: API/asset consumers — `selection_reset` switch cases

Implements spec §5.6. **Files:** Modify `app/api/show/[slug]/version/route.ts`, `app/api/realtime/subscriber-token/route.ts`, `lib/auth/picker/validatePickerAssetSession.ts`; Test `tests/auth/pickerConsumersSelectionReset.test.ts` + a report fall-through test.

**Interfaces — Consumes** the resolver `selection_reset` kind from Task 3.

- [ ] **Step 1: Write failing tests** (one per consumer; `selection_reset` behaves like `epoch_stale`):

```ts
test("version route denies selection_reset with 401 SHOW_VERSION_AUTH_FAILED", async () => {
  const r = await versionAuthWith({ kind: "selection_reset", expectedEpoch: 4, expectedCrewMemberId: CREW_ID });
  expect(r).toMatchObject({ ok: false, status: 401, error: "SHOW_VERSION_AUTH_FAILED", reason: "selection_reset" });
});
test("realtime subscriber-token denies selection_reset with 401", async () => {
  const r = await realtimeAuthWith({ kind: "selection_reset", expectedEpoch: 4, expectedCrewMemberId: CREW_ID });
  expect(r).toMatchObject({ ok: false, status: 401, error: "SHOW_REALTIME_BROADCAST_AUTH_FAILED", reason: "selection_reset" });
});
test("validatePickerAssetSession denies selection_reset (unauthorized)", async () => {
  const r = await assetSessionWith({ kind: "selection_reset", expectedEpoch: 4, expectedCrewMemberId: CREW_ID });
  expect(r.ok).toBe(false); // unauthorized() response
});
test("report route denies a selection_reset crew cookie (non-admin falls through to admin path)", async () => {
  const r = await reportAuthWith({ kind: "selection_reset", expectedEpoch: 4, expectedCrewMemberId: CREW_ID }); // non-admin session
  expect(r.ok).toBe(false);
});
```

- [ ] **Step 2: Run — expect FAIL** (typecheck: the three no-default switches become non-exhaustive).
- [ ] **Step 3: Implement:** in each of `version/route.ts`, `subscriber-token/route.ts`, `validatePickerAssetSession.ts`, add `case "selection_reset":` to the existing `case "no_selection": case "epoch_stale": case "removed_from_roster":` group (same return). **No change** to `report/route.ts` — `selection_reset` falls through the if-chain to the admin path exactly like `epoch_stale` (spec §5.6 table).
- [ ] **Step 4: Run — expect PASS:** `pnpm vitest run tests/auth/pickerConsumersSelectionReset.test.ts && pnpm typecheck`
- [ ] **Step 5: Commit:** `git commit --no-verify -m "feat(auth): handle selection_reset in version/realtime/asset consumers (deny like epoch_stale)"`

---

## Task 7: Sync-preserves-marker guard

Implements spec §4.4, §7.8. **Files:** Test `tests/sync/selectionsResetAtPreserved.test.ts` (follow the existing `applyParseResult` crew round-trip harness). No source change expected — this pins that sync does not clobber the marker.

- [ ] **Step 1: Write the failing test:** set `selections_reset_at` on a crew row, run an `applyParseResult` round-trip that updates that row (e.g. a name change), assert `selections_reset_at` is unchanged afterward.
- [ ] **Step 2: Run.** If it PASSES immediately (sync already column-scoped), that is the expected outcome — keep it as a regression pin. If it FAILS (sync overwrites/nulls the column), fix `applyParseResult` to preserve `selections_reset_at` (column-scoped update, mirroring how `claimed_via_oauth_at` is preserved), then re-run.
- [ ] **Step 3: Commit:** `git commit --no-verify -m "test(sync): pin selections_reset_at survives a crew-row sync round-trip"`

---

## Task 8: Server action — `resetCrewMemberSelection` (+ meta-infra registration)

Implements spec §6.3, §2.4 (no alert). **Files:** Create `lib/auth/picker/resetCrewMemberSelection.ts`; Modify `tests/auth/_metaInfraContract.test.ts`; Test `tests/auth/resetCrewMemberSelectionAction.test.ts`.

**Interfaces — Produces:** `resetCrewMemberSelection(input: { showId: string; crewMemberId: string }): Promise<{ ok: true; reset_at: string } | { ok: false; code: "PICKER_CREW_MEMBER_NOT_FOUND" | "PICKER_RESOLVER_LOOKUP_FAILED" | "PICKER_INVALID_INPUT" }>`.

- [ ] **Step 1: Write failing tests:**

```ts
test("admin happy path returns reset_at", async () => {
  mockRpc({ data: "2026-07-03T12:00:00Z", error: null });
  await expect(resetCrewMemberSelection({ showId: SHOW_ID, crewMemberId: CREW_ID }))
    .resolves.toEqual({ ok: true, reset_at: "2026-07-03T12:00:00Z" });
});
test("RPC error → PICKER_RESOLVER_LOOKUP_FAILED", async () => {
  mockRpc({ data: null, error: { message: "boom" } });
  await expect(resetCrewMemberSelection({ showId: SHOW_ID, crewMemberId: CREW_ID }))
    .resolves.toEqual({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
});
test("NULL data (not-found) → PICKER_CREW_MEMBER_NOT_FOUND", async () => {
  mockRpc({ data: null, error: null });
  await expect(resetCrewMemberSelection({ showId: SHOW_ID, crewMemberId: CREW_ID }))
    .resolves.toEqual({ ok: false, code: "PICKER_CREW_MEMBER_NOT_FOUND" });
});
test("bad UUID → PICKER_INVALID_INPUT (no RPC call)", async () => {
  await expect(resetCrewMemberSelection({ showId: "nope", crewMemberId: CREW_ID }))
    .resolves.toEqual({ ok: false, code: "PICKER_INVALID_INPUT" });
});
test("emits NO admin_alerts upsert", () => {
  const src = readFileSync("lib/auth/picker/resetCrewMemberSelection.ts", "utf8");
  expect(src).not.toMatch(/upsertAdminAlert/);
});
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** `lib/auth/picker/resetCrewMemberSelection.ts` (mirrors `resetPickerEpoch.ts` minus the alert; bare `requireAdmin`; UUID guard):

```ts
"use server";

import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// not-subject-to-revalidate: resetting a crew member's picker selection mutates only
// crew_members.selections_reset_at — a picker/auth column NOT in the getShowForViewer DATA
// projection. Rendered crew DATA is unchanged, so the `show-${id}` data cache need not bust.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ResetCrewMemberSelectionResult =
  | { ok: true; reset_at: string }
  | { ok: false; code: "PICKER_CREW_MEMBER_NOT_FOUND" | "PICKER_RESOLVER_LOOKUP_FAILED" | "PICKER_INVALID_INPUT" };

export async function resetCrewMemberSelection(input: {
  showId: string;
  crewMemberId: string;
}): Promise<ResetCrewMemberSelectionResult> {
  await requireAdmin();

  if (!UUID_RE.test(input.showId) || !UUID_RE.test(input.crewMemberId)) {
    return { ok: false, code: "PICKER_INVALID_INPUT" };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("reset_crew_member_selection", {
      p_show_id: input.showId,
      p_crew_member_id: input.crewMemberId,
    });
    if (error) return { ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" };
    if (typeof data !== "string") return { ok: false, code: "PICKER_CREW_MEMBER_NOT_FOUND" }; // NULL → not-found
    return { ok: true, reset_at: data };
  } catch {
    return { ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" };
  }
}
```

- [ ] **Step 4: Register in `tests/auth/_metaInfraContract.test.ts`:** add `"lib/auth/picker/resetCrewMemberSelection.ts"` to `SUPABASE_CONSTRUCTOR_CONTRACT_FILES` (~:217-229). *(Also complete Task 2 step 4(d) here if deferred: add the same path to `advisoryLockRpcDeadlock.test.ts` `sourceFiles`.)*
- [ ] **Step 5: Run — expect PASS:** `pnpm vitest run tests/auth/resetCrewMemberSelectionAction.test.ts tests/auth/_metaInfraContract.test.ts tests/auth/advisoryLockRpcDeadlock.test.ts && pnpm typecheck`
- [ ] **Step 6: Commit:** `git commit --no-verify -m "feat(auth): resetCrewMemberSelection server action (no alert) + meta-infra registration"`

---

## Task 9: Admin UI — unified `PickerResetControl` (Opus + impeccable dual-gate)

Implements spec §6.1, §6.2. **UI SURFACE — Opus-only; invariant 8 applies.** **Files:** Create `app/admin/show/[slug]/PickerResetControl.tsx`; Modify `app/admin/show/[slug]/page.tsx` (render it in the Share & access `actions` slot, passing `showId` + `crew`); Test `tests/admin/pickerResetControl.test.tsx`.

**Interfaces — Consumes** `resetCrewMemberSelection` (Task 8) and the existing `resetPickerEpoch`. **Props:** `{ showId: string; crew: { id: string; name: string; role: string }[] }`.

**Design (spec §6.1/§6.2):** one control. Primary: a `<select>` populated from `crew` + a Reset button (two-tap idle→confirm→resolving, reused pattern from `ResetPickerEpochButton`) → `resetCrewMemberSelection({ showId, crewMemberId })`. Secondary: a de-emphasized "reset everyone's pick" affordance → `resetPickerEpoch({ showId })` (confirm copy: "Every device's picker re-prompts on next visit."). Failure/outcome copy is **admin-authored inline** (spec §6.2), NOT crew catalog copy:
- success (member): "Reset {name}'s picker selection."
- not-found (`PICKER_CREW_MEMBER_NOT_FOUND`): "That crew member is no longer on the roster — nothing to reset. Refresh to see the current roster."
- infra/invalid (`PICKER_RESOLVER_LOOKUP_FAILED` / `PICKER_INVALID_INPUT`): "Couldn't reset the picker — please try again."
Guards (spec §6.2): empty roster → only the reset-everyone affordance + "No crew to reset yet."; empty `name` → fall back to `role`; empty `name`+`role` → `(unnamed · <id.slice(0,8)>)`.

- [ ] **Step 1: Write failing tests** (`tests/admin/pickerResetControl.test.tsx`):

```tsx
test("renders a member selector from the roster", () => {
  render(<PickerResetControl showId={SHOW_ID} crew={[{ id: "a…", name: "Alice", role: "A2" }]} />);
  expect(screen.getByRole("option", { name: /Alice/ })).toBeInTheDocument();
});
test("empty roster → only reset-everyone + helper text, no selector", () => {
  render(<PickerResetControl showId={SHOW_ID} crew={[]} />);
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.getByText(/No crew to reset yet/)).toBeInTheDocument();
});
test("empty name+role → id-derived placeholder label", () => {
  render(<PickerResetControl showId={SHOW_ID} crew={[{ id: "abcdef12-0000-0000-0000-000000000000", name: "", role: "" }]} />);
  expect(screen.getByRole("option", { name: /unnamed · abcdef12/ })).toBeInTheDocument();
});
test("per-member reset calls resetCrewMemberSelection with the selected id", async () => {
  const spy = vi.mocked(resetCrewMemberSelection).mockResolvedValue({ ok: true, reset_at: "2026-07-03T12:00:00Z" });
  render(<PickerResetControl showId={SHOW_ID} crew={[{ id: CREW_ID, name: "Alice", role: "A2" }]} />);
  await userEvent.selectOptions(screen.getByRole("combobox"), CREW_ID);
  await userEvent.click(screen.getByRole("button", { name: /reset alice/i })); // idle → confirm
  await userEvent.click(screen.getByRole("button", { name: /confirm/i }));      // confirm → resolving
  expect(spy).toHaveBeenCalledWith({ showId: SHOW_ID, crewMemberId: CREW_ID });
});
test("not-found renders benign inline notice, not crew catalog copy", async () => {
  vi.mocked(resetCrewMemberSelection).mockResolvedValue({ ok: false, code: "PICKER_CREW_MEMBER_NOT_FOUND" });
  const { container } = render(<PickerResetControl showId={SHOW_ID} crew={[{ id: CREW_ID, name: "Alice", role: "A2" }]} />);
  await userEvent.selectOptions(screen.getByRole("combobox"), CREW_ID);
  await userEvent.click(screen.getByRole("button", { name: /reset alice/i }));
  await userEvent.click(screen.getByRole("button", { name: /confirm/i }));
  expect(await screen.findByText(/no longer on the roster/i)).toBeInTheDocument();
  expect(container.textContent).not.toContain(getDougFacing("PICKER_CREW_MEMBER_NOT_FOUND")); // no crew catalog copy
});
test("no raw error code string appears in the DOM after a failure", async () => {
  vi.mocked(resetCrewMemberSelection).mockResolvedValue({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
  const { container } = render(<PickerResetControl showId={SHOW_ID} crew={[{ id: CREW_ID, name: "Alice", role: "A2" }]} />);
  await userEvent.selectOptions(screen.getByRole("combobox"), CREW_ID);
  await userEvent.click(screen.getByRole("button", { name: /reset alice/i }));
  await userEvent.click(screen.getByRole("button", { name: /confirm/i }));
  await screen.findByText(/couldn.t reset the picker/i);
  expect(container.textContent).not.toMatch(/PICKER_[A-Z_]+/); // no raw code leaked
});
test("reset-everyone calls resetPickerEpoch", async () => {
  const spy = vi.mocked(resetPickerEpoch).mockResolvedValue({ ok: true, new_epoch: 5 });
  render(<PickerResetControl showId={SHOW_ID} crew={[{ id: CREW_ID, name: "Alice", role: "A2" }]} />);
  await userEvent.click(screen.getByRole("button", { name: /reset everyone/i }));
  await userEvent.click(screen.getByRole("button", { name: /confirm/i }));
  expect(spy).toHaveBeenCalledWith({ showId: SHOW_ID });
});
```

- [ ] **Step 2: Run — expect FAIL:** `pnpm vitest run tests/admin/pickerResetControl.test.tsx`
- [ ] **Step 3: Implement `PickerResetControl.tsx`** (client component; two-tap transitions per the `ResetPickerEpochButton` pattern; the reset-everyone path may compose/reuse `resetPickerEpoch` directly). Wire into `app/admin/show/[slug]/page.tsx`: replace the `<ResetPickerEpochButton …>` in the Share & access `actions` slot (`:771-776`) with `<PickerResetControl showId={show.id} crew={crew} />` (the page already loads `crew` at `:238-245`). Keep the label-row/confirm/success accessibility contract (role=group, aria-describedby, `data-testid`s) consistent with the existing button.
- [ ] **Step 4: Run — expect PASS:** `pnpm vitest run tests/admin/pickerResetControl.test.tsx && pnpm typecheck`
- [ ] **Step 5: Transition audit** (project writing-plans rule). The control's states are idle → confirm → resolving → (success | error), for BOTH the per-member and reset-all actions — button-label/inline-copy swaps, no `AnimatePresence`, no animated layout morph (spec §7). Assert each conditional block (`{ui === "idle" ? … : …}`, the success/error inline notices) renders the correct element per state, and test the **compound** case: switching the selected crew member while a confirm is pending resets the pending confirm (no stale confirm targeting the previous member). **Layout-dimensions task: N/A** — the control is flow layout (select + buttons + text), no fixed-dimension parent with flex/grid children (spec §7); no Playwright `getBoundingClientRect` assertion required.
- [ ] **Step 6: Impeccable dual-gate (invariant 8):** run `/impeccable critique` AND `/impeccable audit` on the diff for `PickerResetControl.tsx` + the `page.tsx` change. Fix all HIGH/CRITICAL findings, or record deferrals in `DEFERRED.md`. Record findings + dispositions for the handoff.
- [ ] **Step 7: Commit:** `git commit --no-verify -m "feat(admin): unified PickerResetControl (per-crew reset + reset-all)"`

---

## Task 10: Help-doc copy

Implements spec §11. **Files:** Modify `app/help/admin/sharing-links/page.mdx` (`:24-27,44-50`), `app/help/admin/per-show-panel/page.mdx` (`:64`), `app/help/tour/page.mdx` (`:93`). Test: extend the existing help-doc guard test if one asserts on this copy; otherwise a lightweight presence test.

- [ ] **Step 1:** Update the three docs so "Reset picker selections" describes **choosing a crew member to reset** (primary) with **reset everyone** as the broad option. No raw error codes; keep prose accurate (per-member reset = re-pick for one; reset-all = whole roster). Example (`per-show-panel:64`): "…a **Rotate share-token** control, and a **picker reset** — reset one crew member's pick, or everyone's — for when someone picked the wrong identity."
- [ ] **Step 2:** Run any help-doc guard tests + `pnpm build` (MDX compiles): `pnpm vitest run tests/help 2>/dev/null; pnpm typecheck`.
- [ ] **Step 3: Commit:** `git commit --no-verify -m "docs(help): describe per-crew + reset-all picker reset"`

---

## Task 11: Schema manifest + validation-project parity

Implements spec §3.3, Global Constraints. **Files:** Regenerate `supabase/__generated__/schema-manifest.json`.

- [ ] **Step 1:** `pnpm gen:schema-manifest` (introspects the local all-migrations-applied DB). Confirm the `crew_members` block now lists `selections_reset_at` (12 → 13 columns).
- [ ] **Step 2:** Apply BOTH new migrations surgically to the validation project (per repo convention: `supabase db query --linked "<sql>"` or `psql "$TEST_DATABASE_URL" -f …`, then `notify pgrst, 'reload schema';`). Requires `TEST_DATABASE_URL` from the **main** checkout's `.env.local`.
- [ ] **Step 3:** Run the parity gate: `pnpm vitest run tests/db/validation-schema-parity.test.ts` — expect PASS (validation ⊇ manifest).
- [ ] **Step 4: Commit:** `git add supabase/__generated__/schema-manifest.json && git commit --no-verify -m "chore(db): regenerate schema manifest for selections_reset_at + apply to validation"`

---

## Task 12: Full-suite verification + typecheck

- [ ] **Step 1:** `pnpm typecheck` (vitest strips types — this catches `next build` breakers).
- [ ] **Step 2:** `pnpm vitest run` (full suite) — confirm no regression, especially `tests/auth/advisoryLockRpcDeadlock.test.ts`, `tests/auth/_metaInfraContract.test.ts`, `tests/messages/_metaAdminAlertCatalog.test.ts` (unchanged), `tests/db/postgrest-dml-lockdown.test.ts` (unchanged).
- [ ] **Step 3:** `pnpm format:check` (fix with prettier `--write` if needed — `--no-verify` commits skip the hook).
- [ ] **Step 4:** No commit (verification only) unless format fixes were applied.

---

## Meta-test inventory (declared)

- **EXTENDS:** `tests/auth/advisoryLockRpcDeadlock.test.ts` (Task 2, 4 surfaces), `tests/auth/_metaInfraContract.test.ts` (Task 8).
- **UNCHANGED (asserted green):** `tests/messages/_metaAdminAlertCatalog.test.ts` (no alert), `tests/db/postgrest-dml-lockdown.test.ts` (crew_members already gated), `tests/cross-cutting/picker-resolver-outcome-prose-guard.test.ts` (M12-scoped; this spec out of scope).

## Advisory-lock holder topology (declared)

Hashkey `hashtext('show:' || drive_file_id)`. New holder `reset_crew_member_selection` acquires **in-RPC** (single layer); JS action `resetCrewMemberSelection.ts` does NOT wrap it. Pinned by `advisoryLockRpcDeadlock.test.ts` after Task 2 (RPC-name list) + Task 8 (`sourceFiles`). Full existing-holder set: spec §10 (grep-defined; 26 migrations, both `pg_advisory_xact_lock` and `pg_try_advisory_xact_lock`).
