# Plan — Admin Field Override Layer (audit 3.2)

**Spec:** `docs/superpowers/specs/2026-07-07-admin-field-overrides.md` (APPROVED; autonomous-ship — both user-review gates waived per AGENTS.md autonomous-ship gate).
**Slug:** `admin-field-overrides`
**Branch / worktree:** `feat/admin-field-overrides` @ `/Users/ericweiss/FX-Webpage-Template/.claude/worktrees/admin-field-overrides`
**Implementer:** Opus / Claude Code (UI surfaces P6 are Opus-only per ROUTING hard rule; the whole feature is Opus-owned).

---

## Pre-draft verification notes (live-code citation pass — stale/imprecise citations corrected)

Every task below cites live-verified `file:line`. The following spec/prompt citations were **stale or imprecise** against the live worktree and are corrected here — use the corrected forms in tasks; do NOT silently re-diverge:

1. **`transportTileVisible` lives in `lib/visibility/scopeTiles.ts:177`**, NOT `lib/visibility/transportTransitions.ts`. The latter is the transition-matrix/animation DOC module (`TRANSPORT_TRANSITION_MATRIX`, `transportTransitionTreatment:193`, `directedTransportTreatment:210`) — it references `transportTileVisible` in prose only. **`transportTileVisible` takes an options object** `transportTileVisible(opts: { transportation, viewerName, isAdmin, ... })` (`scopeTiles.ts:177`), not a positional `viewerName`. Spec §3.5/§12 "change `transportTransitions.ts`" is imprecise: the ONE definitional change is to the `scopeTiles.ts` `opts` shape (add `viewerNameAliases`). No edit to `transportTransitions.ts` is needed. The 3 `namesRefer` match sites are `scopeTiles.ts:192` (driver), `:200` (assigned_names), and `getShowForViewer.ts:103` (`hotelVisibleToViewer`).
2. **`buildNeedsAttention` is DEFINED in `lib/admin/needsAttention.ts:231`** (input type `BuildNeedsAttentionInput:64`), and only **CALLED** at `lib/admin/loadNeedsAttention.ts:291`. The 4th stream requires edits to BOTH files: a new input type + `NeedsAttentionItem` variant + build logic in `needsAttention.ts`; a new query + `.map` into the call in `loadNeedsAttention.ts`.
3. **`hotelVisibleToViewer` is at `getShowForViewer.ts:103`** (spec said `:104`); `viewerName` is derived from the crew lookup at `:285-305` selecting `role_flags, name, flight_info` (spec said `:291-305` — the lookup block; it does NOT currently select `sheet_name`).
4. **`crew_members.claimed_via_oauth_at` + `selections_reset_at` are later-migration additions** (`20260524000001_crew_members_claimed_via_oauth_at.sql`, `20260703000000_crew_members_selections_reset_at.sql`), not the initial DDL (`20260501000000_initial_public_schema.sql:31`; unique `(show_id,name)` `:43`, `crew_members_email_canonical` CHECK `:44-46`). The `previousCrewMembers` snapshot type (`applyParseResult.ts:11-14`) carries `id` + `claimed_via_oauth_at` (NOT `selections_reset_at`) — a §3.6 write that must preserve `selections_reset_at` reads it via a widened snapshot select (Task 7). **No `crew_members.sheet_name` column exists yet** (clean slate).
5. **§12.4 catalog-parity gate path is `tests/cross-cutting/codes.test.ts`** (+ `tests/cross-cutting/extract-spec-codes.test.ts`), NOT `tests/messages/codes.test.ts` (AGENTS.md/prompt say the latter — it does not exist). `pnpm gen:spec-codes` = `tsx scripts/extract-spec-codes.ts` (`package.json:22`). `CODE_SCENARIOS` (`tests/cross-cutting/code-scenarios.ts:13`) is **auto-derived** from `SPEC_CODES` via `Object.keys(...)` — it needs **no manual per-code edit**; adding the two admin-alert rows to §12.4 prose + running `gen:spec-codes` populates it automatically.
6. **`_metaAdminAlertCatalog.test.ts` extracts the `AdminAlertCode` union via regex** (`export type AdminAlertCode =([\s\S]*?);`, `:53`) and asserts each production `admin_alerts.upsert` code has a non-null `dougFacing` (`:57`, `test.each`) — it is not literally a `CODE_SCENARIOS` construct. `INTERPOLATED_DOUG_FACING_CODES` gates placeholder-bearing copy.
7. **`AdminAlertCode` currently has 36 members** (`upsertAdminAlert.ts:4-38`, `AMBIGUOUS_EMAIL_BINDING`…`WIZARD_SESSION_SUPERSEDED_RACE`), → **38** after adding the two override codes — spec §10 "36→38" is **accurate**. A catalog row's keys (from `catalog.ts:1084` `SHOW_UNPUBLISHED`) are `{ code, resolution, audience, dougFacing, crewFacing, followUp, helpfulContext, title, longExplanation, helpHref }` (some rows omit `resolution`/`audience`).
8. **Forensic `FIELD_OVERRIDE_*` codes are NOT catalog rows.** `logAdminOutcome.code` is a free-form SHOUTY_SNAKE string (`lib/log/logAdminOutcome.ts:9`) explicitly outside §12.4; forensic codes are registered ONLY in `tests/log/_auditableMutations.ts` (`AUDITABLE_MUTATIONS:13`, plus a code set `SANCTIONED_CODES:312` / `NEW_FORENSIC_CODES:390`). Confirms spec §10 "Decided (not deferred)".
9. **`resolveAdminAlert` is exported at `resolveAdminAlert.ts:25`** (singular) + `resolveAdminAlerts:51` (plural). Spec's `:13` is the internal `assertNotInboxRouted` guard, not the exported fn.
10. **`app/admin/show/[slug]/page.tsx` (`AdminShowPage:140`, `requireAdmin()` `:147`) is the per-show admin STATUS/actions surface** (header chip, Open crew page, share URL, rotate/reset, `PerShowAlertSection`, `ReSyncButton`, `syncStatusBucket`). It reads crew via `readCrew` (`:244`, `.from("crew_members")`) and **renders crew rows at `:709-745`** (`crew.map(...)`, `<li data-testid={`admin-show-crew-row-${id}`}>`, name `<span className="text-base font-semibold text-text-strong">` `:728`, role `:729`) — spec §8.4 cite `:709-743` is accurate. It has **no** dates/venue/hotel blocks — those are net-new render (Task 14). `applyShowSnapshot`'s shows UPDATE arms are at `:1437`/`:1463` (two variants), not `:1432`/`:1458`.
11. **Wizard sections build from the PENDING parse** (`SectionData`, `step3ReviewSections.tsx:2840`; caps `CREW_CAP=30`, `HOTELS_CAP=12`), rendered at `app/admin/show/staged/[stagedId]/page.tsx`. The R18 rule (widget sources from LIVE loader, not pending `SectionData`) is therefore a genuine cross-plane wiring change (Task 15), not a one-line swap.
12. **`applyShowSnapshot` def at `runScheduledCronSync.ts:1304`; `sql.begin` at `:1801`; first-seen INSERT `insertFirstSeenShowWithSlugRetry` at `:1506`; `deleteCrewMembersNotIn`/`upsertCrewMembers` tx-methods at `:1560`/`:1567-1584`** — all verified accurate. `phase2.ts`: stale short-circuit `:305-306`; `applyParseResult(tx,{...})` call `:369`; the post-apply change-log slot (comment `:380`, guard `if (port && snapshot.previousCrewMembers …)` `:383`, `writeAutoApplyChanges` `callTx` `:390`). `planHoldAwareApply` (`holdAwareApply.ts:151`) returns `{ plan: HoldAwarePlan, survivingHolds }` where `HoldAwarePlan = { crewMembers, protectedNames:Set, heldNames:Set, … }` (`:30-36`) — the §3.6 reconciliation consumes `plan` and must preserve `survivingHolds` threading. `requireAdmin()` (void) `:294`, `requireAdminIdentity()` (`{email}`) `:279`, `AdminIdentity` `:90`. `ChangeFeedBadge` span `:50`, `bg-info-bg text-text-subtle` variant `:26`, `rounded-pill`.

All other spec citations verified accurate (`resolvePickerSelection.ts:96`, `namesRefer` at `nameMatch.ts:63`, `holdAwareApply.ts:151` `planHoldAwareApply`, `setPullSheetOverrideRpc.ts:34`, `20260706000000_pull_sheet_override.sql:42` advisory lock, `20260618000000...:47` `(coalesce(show_id::text,''),code) where resolved_at is null` dedup, `is_admin()` `20260501002000_rls_policies.sql:23`, `RPC_GATED_TABLES` `postgrest-dml-lockdown.test.ts:147`, `advisoryLockRpcDeadlock.test.ts` `migrationFiles:33`, `_auditableMutations.ts:13`, `canonicalize.ts:2`, `ChangeFeedBadge.tsx:26` `bg-info-bg text-text-subtle`, `mi11GateActions.ts:34` `mapRpcOutcome`, `logAdminOutcome.ts:27`, hotel_reservations columns, crew_members `unique(show_id,name)` + email-canonical CHECK).

---

## Goal

Give Doug a durable, in-app **field override** for 6 fields (show dates/venue, crew name/role, hotel name/address) that survives every full-replace re-sync of stable parse output, renders an "Overridden — sheet says X" chip on admin surfaces (never on the crew page), reverts in one click, and — when the sheet changes so an override's target vanishes — **deactivates loudly** (needs-attention + best-effort bell) rather than silently. Applied as a **write-time pre-write transform** in the existing per-show advisory-locked sync tx (readers untouched except one bounded crew-name visibility alias), plus an immediate-apply SECURITY DEFINER RPC for instant UI feedback. Crew identity is preserved by an **id-keyed parsed-identity reconciliation** so `crew_members.id` (the picker-cookie key) never churns across a rename.

## Architecture (from spec §3–§7)

- **Storage:** new RPC-gated `public.admin_overrides` table (§4.1) + new nullable `crew_members.sheet_name` column (§4.4, the crew-name visibility alias). One migration `20260707000000_admin_field_overrides.sql`.
- **Writer RPC:** `set_field_override(p_op ∈ {upsert,revert,repoint,discard}, …)` SECURITY DEFINER, in-RPC single advisory-lock holder, two-part CAS (CAS-A `version` + CAS-B live-value), service-role-only EXECUTE (§7). Immediate-apply of one live row for instant feedback.
- **Sync overlay (two stages, inside the existing `withShowLock` tx — no new lock):**
  - **Stage A (pure, before `applyShowSnapshot`):** `overrideShowHotel(parseResult, activeOverrides)` transforms `show` (dates/venue) + `hotel` rows and plans their `sheet_value`/stale side-effects. Zero writes. Threaded into `applyShowSnapshot`/the hotel writer.
  - **Crew (post-hold, inside `applyParseResult`):** the **id-keyed parsed-identity reconciliation** (§3.6) — hold disposition on RAW parse first (§3.4), then a **four-phase uniqueness-safe write** (delete → park-at-`\x1f` sentinel → insert → assign-finals) of the FULL parsed row (only name/role overridden), plus `crew_members.sheet_name`. Replaces the legacy name-keyed `deleteCrewMembersNotIn`/`upsertCrewMembers` **only when a crew override is active**.
  - **Stage B (applied-path-only, at `phase2.ts:378`):** `commitOverrideSideEffects` writes `sheet_value` refreshes + `active=false` deactivations (`deactivation_code`) + `version` bumps to `admin_overrides`, atomic with the change-log writes. A stale short-circuit (`phase2.ts:305-306`) never reaches Stage B → `admin_overrides` untouched on a stale sync.
- **Crew-name visibility alias (§3.5, the one reader exception):** `crew_members.sheet_name` carries the pre-override parsed name; `getShowForViewer` builds `viewerNameAliases = [name, ...(sheet_name?[sheet_name]:[])]`; `namesReferAny` widens the 3 crew-page match sites; the alias is threaded to all 4 transport callers.
- **Signal:** durable inactive-row needs-attention stream (4th stream in `buildNeedsAttention`) + best-effort coarse per-(show,code) `admin_alert` bell (auto-resolve-only).
- **UI:** one `<OverrideableField>` component on two surfaces — the review wizard (Surface A, LIVE-sourced) and the live-show admin page (Surface B, net-new dates/venue/hotel blocks).

## Tech stack

Next.js 16, React 19, TypeScript (strict), Supabase Postgres (postgres.js `tx.unsafe`, SECURITY DEFINER RPCs, RLS), Vitest + jsdom + Testing Library, Playwright (real-browser layout), Tailwind v4. No new dependencies.

## Global constraints (every task preserves all)

Plan-wide AGENTS.md invariants:
- **#1 TDD-per-task** — failing test → run-fails → minimal impl → run-passes → commit. Never impl before its test.
- **#2 Advisory-lock single-holder** — `set_field_override` locks **in-RPC** (single holder); the JS action NEVER locks. The sync overlay runs inside the existing JS-side `withShowLock` (no new lock). Migration filename added to `advisoryLockRpcDeadlock.test.ts` `migrationFiles:33`.
- **#3 Email canonicalization** — no email is overridable; `created_by`/`p_actor` canonicalized via `lib/email/canonicalize.ts` at the action boundary (primary), `admin_overrides_created_by_canonical` CHECK is the safety net; the id-keyed crew write canonicalizes the parsed `email` it carries.
- **#5 No raw error codes in UI** — every override error routed through `lib/messages/lookup.ts`.
- **#6 Commit-per-task** — conventional commits (`feat/test/fix(scope)`); one task = one commit; no batching.
- **#7 Spec is canonical.**
- **#8 UI impeccable v3 dual-gate** — `/impeccable critique` + `/impeccable audit` on the UI diff (P6); HIGH/CRITICAL fixed or DEFERRED before cross-model review.
- **#9 Supabase call-boundary** — the override helper destructures `{data,error}`, distinguishes returned vs thrown, uses `mapRpcOutcome`; registered in `_metaInfraContract.test.ts` (or inline `// not-subject-to-meta`).
- **#10 Mutation observability** — `setFieldOverrideAction` is an **admin surface** → `AUDITABLE_MUTATIONS` rows + `adminOutcomeBehavior.test.ts` success-branch proof for all 4 op codes; emits post-commit, outside the lock.
- **PostgREST DML lockdown** — INSERT/UPDATE/DELETE REVOKEd from anon+authenticated on `admin_overrides`; row in `postgrest-dml-lockdown.test.ts` `RPC_GATED_TABLES:147`.
- **Validation-schema-parity** — regen manifest + surgical validation apply for BOTH `admin_overrides` (table) and `crew_members.sheet_name` (column).

Spec correctness invariants (P0 regardless of test status): the §3.6 **id-keyed** crew write (never name-keyed delete/upsert when an override is active); the **four-phase** uniqueness-safe write order (§3.6/R24); **no name-only convergence continuity** (fail-closed, §3.6/R23); crew `active=false` decided **post-hold** only (R11); hotel duplicate-name **fail-closed** on all 3 paths (sync/RPC/loader, R16/R19/R20/R30); `sheet_value` ALWAYS the parsed value, never recaptured on edit (R6/R7); `version` bumped on mutation + deactivation/reactivation but NOT on benign `sheet_value` refresh (R30); active crew-**name** repoint DISALLOWED (R25); active discard DISALLOWED (R14); create is UPSERT-reactivate on the unique key (R28); the crew write carries the FULL parsed row (R29).

---

## Meta-test inventory (declared per AGENTS.md)

| Meta-test | Action | Task |
|---|---|---|
| `set_field_override` grant lockdown (execute revoked public/anon/authenticated; granted service_role) | **NEW** `tests/db/setFieldOverrideGrants.test.ts` | Task 1, 3 |
| `tests/db/postgrest-dml-lockdown.test.ts` `RPC_GATED_TABLES:147` | **EXTEND** — add `admin_overrides` (`selectAnon:false, selectAuthenticated:true` RLS-confined; INS/UPD/DEL revoked from anon+authenticated; service_role ALL) | Task 1 |
| `tests/auth/advisoryLockRpcDeadlock.test.ts` (`migrationFiles:33`, `:100+` `toContain`) | **EXTEND** — register `set_field_override` migration + RPC as an in-RPC single holder | Task 3 |
| `tests/log/_auditableMutations.ts` (`AUDITABLE_MUTATIONS:13`) + `tests/log/adminOutcomeBehavior.test.ts` | **EXTEND** — 4 rows (`FIELD_OVERRIDE_SET/REVERTED/REPOINTED/DISCARDED`) on `setFieldOverrideAction` + success-branch proof | Task 12, 14 |
| `tests/messages/_metaAdminAlertCatalog.test.ts` + `tests/cross-cutting/codes.test.ts` + `tests/cross-cutting/extract-spec-codes.test.ts` | **EXTEND** — 2 new `AdminAlertCode`s (`OVERRIDE_TARGET_MISSING`, `OVERRIDE_NAME_CONFLICT`) | Task 11 |
| `tests/db/validation-schema-parity.test.ts` | **SATISFY** — table + column reach validation (regen manifest + surgical apply) | Task 2 |
| `tests/admin/no-inline-email-normalization.test.ts` (walks `lib/sync` at `:98`) | **SATISFY** — any name/`sheet_name` `.trim()` in `lib/sync` carries `// canonicalize-exempt:` | Task 6, 7 |
| `tests/auth/_metaInfraContract.test.ts` (`INFRA_PRODUCERS:69`, auth-domain roots `:336`) | **SATISFY** — new override helper registered OR inline `// not-subject-to-meta:` (it is not an auth-domain helper — the domain roots are `lib/auth,app/auth,app/api/auth,app/api/show`, so `lib/overrides/*` is out of scope; register via inline exemption + explicit `{data,error}` discipline) | Task 4 |
| sentinel-hiding walker (`_metaSentinelHidingContract`) | **N/A** — no crew-page tile change; the alias is a match-set widen, not a new rendered element | — |

---

## Advisory-lock holder topology (mandatory — spec §7.2, §9, AGENTS.md invariant 2)

Hashkey space touched: `hashtext('show:' || drive_file_id)`.

| Holder | Layer | Existing / New | Notes |
|---|---|---|---|
| Cron/sync apply tx (`sql.begin` at `runScheduledCronSync.ts:1801`, lock in `withShowLock`/`lockedShowTx.ts:57-62,74`) | JS-side `withShowLock` | **Existing** | Stage A transform, §3.6 crew reconciliation (inside `applyParseResult`), and Stage B side-effects ALL run inside this one existing holder. **No new lock added to the sync path.** |
| `set_field_override` RPC | **in-RPC** `perform pg_advisory_xact_lock(hashtext('show:'||p_drive_file_id))` | **NEW holder** | **Single holder = RPC only.** The JS action (`setFieldOverrideAction`, Task 14) does NOT take the `show:` lock — it calls the RPC which is the sole holder for that call. Never nested under a JS-side `show:` lock (M5 R20 deadlock class). Mirrors `set_pull_sheet_override:42`. |

**Resolution:** each hashkey is locked at exactly one layer per call. The sync overlay adds **zero** new lock acquisitions (it rides the existing `withShowLock`). The RPC is a standalone in-RPC holder (matches `set_pull_sheet_override`). Task 3 EXTENDS `advisoryLockRpcDeadlock.test.ts` (migration + `toContain` proof that the RPC self-locks and the JS action does not).

---

## Layout / transition tasks

- **Real-browser layout task REQUIRED** (spec §8.6): `<OverrideableField>` + chip sit inside `FieldRowList`'s fixed `grid-cols-[7.5rem_minmax(0,1fr)]` row (`step3ReviewSections.tsx:283`). Task 16 asserts (Playwright, real browser) the value cell's rendered width ≤ its grid track width for a long override value at 375px and 1280px — jsdom is insufficient.
- **Transition-audit task REQUIRED** (spec §8.7): 4 states (`plain`/`editing`/`overridden`/`stale`) + a compound (editing while a background sync bumps `version` → 409). Task 16 audits every `AnimatePresence`/ternary/conditional and pins the 409-compound path.

---

## Anti-tautology test rules (apply to every test task)

- Assert against **data inputs / DB rows**, never the rendering container: id-stability reads `crew_members.id` before/after two real sync runs; `sheet_value` reads `admin_overrides.sheet_value` directly; deactivation reads `admin_overrides.active`/`deactivation_code`.
- **Derive expected values from fixtures**, never hardcode: the vanished `match_key` comes from a fixture whose 2nd-sync parse omits a member; hotel dup-name resolution derives from fixture `check_in` values; visibility from fixture names.
- **Chip DOM scan** clones the row and `.remove()`s the value cell before asserting the chip text (can't pass on the value alone).
- Every test task states the **concrete failure mode** it catches — never merely "the function was called."
- Exercise **NaN/null/empty/boundary**: empty override value, null `sheet_value`, `override===null`, `disabled`, a live-anchor matching zero rows, dates-vs-jsonb display mismatch (R17).

---

# TASKS

## Task 1 — Migration: `admin_overrides` table + `crew_members.sheet_name` + grant lockdown + DML-lockdown registry row

**Spec:** §4.1, §4.4, §9.4. **Files:**
- `supabase/migrations/20260707000000_admin_field_overrides.sql` (NEW)
- `tests/db/setFieldOverrideGrants.test.ts` (NEW — grant + column + RLS meta-test)
- `tests/db/postgrest-dml-lockdown.test.ts` (EXTEND — `RPC_GATED_TABLES:147`)

**Interfaces — Produces:**
- `public.admin_overrides` (id, show_id FK→shows ON DELETE CASCADE, domain, field, match_key, override_value jsonb, sheet_value jsonb, active bool, deactivation_code text, version int, created_by text, created_at, updated_at; CHECKs `admin_overrides_deactivation_code_chk`, `admin_overrides_created_by_canonical`, `admin_overrides_domain_field_chk`; unique `admin_overrides_uniq (show_id,domain,field,match_key)`; partial index `admin_overrides_show_active_idx (show_id) where active`; DML lockdown REVOKE/GRANT; RLS `admin_only`).
- `public.crew_members.sheet_name text` (nullable).

### Step 1.1 — Failing grant/column/RLS meta-test

`tests/db/setFieldOverrideGrants.test.ts` (gated `describe.skipIf(!process.env.TEST_DATABASE_URL)`, matching sibling `tests/db/*`):

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("admin_overrides schema + lockdown", () => {
  let sql: ReturnType<typeof postgres>;
  beforeAll(() => { sql = postgres(url!, { max: 1 }); });
  afterAll(async () => { await sql.end(); });

  it("admin_overrides: INS/UPD/DEL revoked from anon+authenticated; SELECT revoked from anon, granted authenticated; service_role ALL", async () => {
    const grants = await sql<{ grantee: string; privilege_type: string }[]>`
      select grantee, privilege_type from information_schema.role_table_grants
      where table_schema='public' and table_name='admin_overrides'
        and grantee in ('anon','authenticated','service_role')`;
    const has = (g: string, p: string) => grants.some((r) => r.grantee === g && r.privilege_type === p);
    for (const p of ["INSERT","UPDATE","DELETE"]) {
      expect(has("anon", p)).toBe(false);
      expect(has("authenticated", p)).toBe(false);
    }
    expect(has("anon","SELECT")).toBe(false);
    expect(has("authenticated","SELECT")).toBe(true);   // RLS-confined by admin_only
    for (const p of ["SELECT","INSERT","UPDATE","DELETE"]) expect(has("service_role", p)).toBe(true);
  });

  it("admin_overrides: RLS enabled + admin_only SELECT policy present", async () => {
    const [{ relrowsecurity }] = await sql<{ relrowsecurity: boolean }[]>`
      select relrowsecurity from pg_class where oid='public.admin_overrides'::regclass`;
    expect(relrowsecurity).toBe(true);
    const pol = await sql<{ polname: string; cmd: string }[]>`
      select polname, cmd from pg_policies where schemaname='public' and tablename='admin_overrides'`;
    expect(pol.some((p) => p.polname === "admin_only")).toBe(true);
  });

  it("admin_overrides: CHECK constraints + unique + partial index exist", async () => {
    const cons = await sql<{ conname: string }[]>`
      select conname from pg_constraint where conrelid='public.admin_overrides'::regclass`;
    const names = new Set(cons.map((c) => c.conname));
    expect(names.has("admin_overrides_deactivation_code_chk")).toBe(true);
    expect(names.has("admin_overrides_created_by_canonical")).toBe(true);
    expect(names.has("admin_overrides_domain_field_chk")).toBe(true);
    expect(names.has("admin_overrides_uniq")).toBe(true);
    const [{ exists }] = await sql<{ exists: boolean }[]>`
      select exists(select 1 from pg_indexes where indexname='admin_overrides_show_active_idx') as exists`;
    expect(exists).toBe(true);
  });

  it("crew_members.sheet_name exists, nullable, no default", async () => {
    const cols = await sql<{ is_nullable: string; column_default: string | null }[]>`
      select is_nullable, column_default from information_schema.columns
      where table_name='crew_members' and column_name='sheet_name'`;
    expect(cols).toHaveLength(1);
    expect(cols[0].is_nullable).toBe("YES");
    expect(cols[0].column_default).toBeNull();
  });

  it("domain_field CHECK admits the 7 valid pairs and rejects show-with-nonempty-key + unknown field", async () => {
    // apply-twice-safe smoke via a savepoint; never leaves rows behind.
    await sql.begin(async (tx) => {
      const showId = (await tx`select id from public.shows limit 1`)[0]?.id;
      if (!showId) return; // no shows seeded — CHECK shape already asserted above
      const ok = async (d: string, f: string, k: string) =>
        tx`insert into public.admin_overrides(show_id,domain,field,match_key,override_value,created_by)
           values (${showId},${d},${f},${k},'"x"'::jsonb,'a@b.co') returning id`;
      for (const [d,f,k] of [["show","dates",""],["show","venue",""],["crew","name","Jon"],
        ["crew","role","Jon"],["hotel","hotel_name","H"],["hotel","hotel_address","H"]] as const) {
        await expect(ok(d,f,k)).resolves.toBeDefined();
      }
      await expect(ok("show","dates","x")).rejects.toThrow(); // show requires match_key=''
      await expect(ok("crew","email","Jon")).rejects.toThrow(); // unknown field
      throw new Error("rollback"); // discard the savepoint — test rows never persist
    }).catch((e) => { if (!/rollback/.test(String(e))) throw e; });
  });
});
```

Run `pnpm vitest run tests/db/setFieldOverrideGrants.test.ts` → **FAILS** (table/column absent). Record failing text naming the missing relation.

### Step 1.2 — Migration (minimal impl)

Write `supabase/migrations/20260707000000_admin_field_overrides.sql` **verbatim from spec §4.1** (the full DDL block, lines 172-228) followed by the §4.4 `crew_members.sheet_name` block (lines 265-269). Apply locally: `psql "$DATABASE_URL_LOCAL" -f supabase/migrations/20260707000000_admin_field_overrides.sql` (or the repo's local-apply path — the same mechanism the sibling `tests/db/*` suites assume), then `notify pgrst, 'reload schema';`.

Re-run Step 1.1 → **PASSES**.

### Step 1.3 — Extend `postgrest-dml-lockdown.test.ts` `RPC_GATED_TABLES`

Add to `RPC_GATED_TABLES` (`:147`) — match the existing `RpcGatedTable` shape (`{ table, closed_at, selectAnon, selectAuthenticated, postBody, rowFilter }`):

```ts
{
  table: "admin_overrides",
  closed_at: "20260707000000_admin_field_overrides.sql:219",
  selectAnon: false,
  selectAuthenticated: true, // RLS-confined to admins via admin_only (like ignored_warnings)
  postBody: { show_id: "00000000-0000-0000-0000-000000000000", domain: "show", field: "dates", match_key: "", override_value: {}, created_by: "a@b.co" },
  rowFilter: "?domain=eq.show",
},
```

Run `pnpm vitest run tests/db/postgrest-dml-lockdown.test.ts` → PASSES (anon+authenticated INS/UPD/DEL rejected; the bidirectional-parity meta-test sees the new REVOKE).

**Deliverable:** table + column live locally; grant/RLS/CHECK meta-test green; DML-lockdown registry green.
**Commit:** `feat(db): admin_overrides table + crew_members.sheet_name + PostgREST DML lockdown`

---

## Task 2 — Schema manifest regen + validation-project apply

**Spec:** §12 validation-parity row; AGENTS.md validation-schema-parity gate. **Files:** `supabase/__generated__/schema-manifest.json` (regen).

### Steps (fail-first — the parity gate IS this task's test)
1. Confirm Task 1's migration is applied to the LOCAL all-migrations DB.
2. **RED:** run `pnpm vitest run tests/db/validation-schema-parity.test.ts` and **observe FAIL** — Layer-1 (DB-free tripwire) fails because the committed manifest lacks `admin_overrides` + `crew_members.sheet_name`; Layer-2 fails because validation lacks them. Record failing output.
3. `pnpm gen:schema-manifest` (`tsx scripts/generate-schema-manifest.ts`) → regenerates `supabase/__generated__/schema-manifest.json` including the new table + column. Stage it.
4. Apply the migration **surgically** to validation project `vzakgrxqwcalbmagufjh` (blocked for `db push`): `psql "$TEST_DATABASE_URL" -f supabase/migrations/20260707000000_admin_field_overrides.sql` (TEST_DATABASE_URL is in MAIN `.env.local` — the "validation creds in MAIN .env.local" lesson) then `psql "$TEST_DATABASE_URL" -c "notify pgrst, 'reload schema';"`.
5. **GREEN:** re-run `pnpm vitest run tests/db/validation-schema-parity.test.ts` → both layers pass. Commit only after RED→GREEN observed.

**Deliverable:** manifest includes the new table + column; validation ⊇ manifest.
**Commit:** `chore(db): regen schema manifest + apply admin_overrides migration to validation`

---

## Task 3 — `set_field_override` SECURITY DEFINER RPC + grants + deadlock-topology pin

**Spec:** §7.1–§7.6, §5.1–§5.3. **Files:**
- `supabase/migrations/20260707000000_admin_field_overrides.sql` (APPEND the RPC + grants to the Task-1 migration — same file, still apply-twice-safe via `create or replace`)
- `tests/db/setFieldOverrideGrants.test.ts` (EXTEND — RPC execute-grant assertion)
- `tests/auth/advisoryLockRpcDeadlock.test.ts` (EXTEND — `migrationFiles:33` + `toContain`)

**Interfaces — Produces:** `public.set_field_override(p_drive_file_id text, p_op text, p_domain text, p_field text, p_match_key text, p_new_match_key text, p_override_value jsonb, p_actor text, p_expected_version int, p_expected_current_value jsonb, p_current_ordinal int, p_expected_live_hotel_name text) returns jsonb` — discriminated `{ ok:true, value } | { ok:false, code }`. EXECUTE revoked from public/anon/authenticated, granted service_role.

### Step 3.1 — Failing RPC-behavior tests (subset; full matrix in Task 4)

Extend `tests/db/setFieldOverrideGrants.test.ts` with the execute-grant assertion (fails until the RPC exists):

```ts
it("set_field_override: execute revoked from public/anon/authenticated, granted service_role", async () => {
  const rows = await sql<{ grantee: string }[]>`
    select grantee from information_schema.role_routine_grants
    where routine_name='set_field_override' and privilege_type='EXECUTE'`;
  const g = new Set(rows.map((r) => r.grantee));
  expect(g.has("service_role")).toBe(true);
  expect(g.has("authenticated")).toBe(false);
  expect(g.has("anon")).toBe(false);
  expect(g.has("PUBLIC")).toBe(false);
});
```

PLUS a **core behavioral subset** (DB-integration, gated on `TEST_DATABASE_URL`) in `tests/overrides/setFieldOverrideCore.test.ts` so the Step-3.2 RPC body is exercised by real behavior in THIS task, not only the grant assertion (R3b-1 — TDD-per-task: the complex body must not commit unexercised; the exhaustive edge matrix stays in Task 4). Each `it` seeds a show + rows via the tx port, calls `set_field_override` directly, and asserts BOTH the live-row change AND the `admin_overrides` row:
- create → live row shows `override_value` AND an `admin_overrides` row exists (`active`, `version=1`, `sheet_value`=prior live), for one field of EACH domain (show `dates`, crew `name`, hotel `hotel_name`);
- edit (crew `role`) → `override_value` updated, `sheet_value` preserved, `version` bumped;
- revert (crew `name`) → live row restored to `sheet_value`, `crew_members.sheet_name` cleared to NULL (R3b-3), override row deleted;
- crew `name` create then read `crew_members.sheet_name` = `match_key` (R3b-3 alias set immediately);
- CAS-A create-when-active-exists → 409 `OVERRIDE_STALE_REVIEW`;
- discard on an active row → 409 `OVERRIDE_INVALID_STATE`, nothing mutated;
- one §7.4 reject (empty crew `name`) → 409, no row written.

Run → **FAILS** (routine absent).

### Step 3.2 — RPC body (minimal impl)

Append to the migration. The body implements §7.2 obligations. Full plpgsql (single-holder lock; CAS-A version; CAS-B live value; per-op semantics upsert-reactivate/edit/revert/repoint/discard; hotel unconditional exactly-one-live-match resolver; crew `currentLiveName` resolver; all guards §7.4):

```sql
create or replace function public.set_field_override(
  p_drive_file_id text, p_op text, p_domain text, p_field text, p_match_key text,
  p_new_match_key text, p_override_value jsonb, p_actor text,
  p_expected_version int, p_expected_current_value jsonb,
  p_current_ordinal int,  -- RPC-8: ADVISORY only (observed ordinal), NOT a locator — hotels resolve by the
                          -- unconditional exactly-one match on hotel_name[+disambiguator] (spec §7.2:369, R20).
                          -- Kept in the signature per spec §7.1; intentionally unused in the body.
  p_expected_live_hotel_name text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_show_id uuid;
  v_row public.admin_overrides%rowtype;
  v_found boolean;          -- F1: PIN the override-row lookup's FOUND; every later SELECT resets `found`.
  v_disamb text;            -- §5.3 content disambiguator carried in p_match_key (after \x1f), or null
  v_target_id uuid;         -- resolved live-row id (crew/hotel)
  v_release_id uuid;        -- F2: OLD target A id for a repoint release (resolved from A's own identity)
  v_live_name text;         -- currentLiveName (crew) / currentLiveHotelName (hotel)
  v_match_count int;
  v_captured jsonb;
  v_bval jsonb;             -- F2: CAS-B value of the NEW target B on repoint
  v_reason text;            -- F3: _validate_override_value result (NULL = ok, else a reason token)
begin
  -- (1) single-holder advisory lock in-RPC; resolve show inside the lock.
  perform pg_advisory_xact_lock(hashtext('show:' || p_drive_file_id));
  select id into v_show_id from public.shows where drive_file_id = p_drive_file_id;
  if v_show_id is null then return jsonb_build_object('ok', false, 'code', 'SHOW_NOT_FOUND'); end if;

  -- validate op discriminator (domain/field value guards are enforced by _validate_override_value, F3).
  -- RPC3-1: NULL-safe — a NULL boolean in an IF is NOT true, so a NULL p_op would otherwise skip every
  -- op branch and fall through to the (unguarded) upsert block.
  if p_op is null or p_op not in ('upsert','revert','repoint','discard') then
    return jsonb_build_object('ok', false, 'code', 'OVERRIDE_INVALID_OP'); end if;
  -- RPC-5 + RPC3-1: reject NULL or unknown (domain,field) up front, so no later CASE/else silently
  -- mistreats it (e.g. an unknown show field falling through to the venue arm).
  if p_domain is null or p_field is null
     or not ((p_domain='show'  and p_field in ('dates','venue'))
          or (p_domain='crew'  and p_field in ('name','role'))
          or (p_domain='hotel' and p_field in ('hotel_name','hotel_address'))) then
    return jsonb_build_object('ok', false, 'code', 'OVERRIDE_INVALID_OP'); end if;
  -- RPC5-1: show is a SINGLETON — force the canonical empty match_key so CAS-A, the unique key
  -- `(show_id,domain,field,match_key)`, and every lookup collapse to exactly ONE override row per
  -- (show,field). Without this, a caller passing a different p_match_key would bypass the active-create
  -- collision check and insert a SECOND active show override writing the same `shows` field.
  if p_domain='show' then p_match_key := ''; p_new_match_key := ''; end if;
  -- RPC5+ (class-close for NULL required inputs): the typed JS caller never sends these NULL, but the RPC
  -- is the security boundary — fail closed before touching state. (p_match_key '' is valid; p_override_value
  -- NULL is caught by §7.4 _validate_override_value; p_drive_file_id NULL already yields SHOW_NOT_FOUND.)
  if p_match_key is null or p_actor is null or (p_op='repoint' and p_new_match_key is null) then
    return jsonb_build_object('ok', false, 'code', 'OVERRIDE_INVALID_OP'); end if;

  -- read the current override row for (target) under the lock.
  select * into v_row from public.admin_overrides
   where show_id=v_show_id and domain=p_domain and field=p_field and match_key=p_match_key;
  v_found := found;   -- F1: capture NOW; crew/hotel resolution + _current_field_value below RESET `found`.

  -- RPC2-3: revert/repoint/discard are EXISTING-row ops — they MUST carry the version CAS (never the
  -- NULL-expected create path), else an inactive row could be repointed/discarded without a version check
  -- (CAS-A's NULL branch only guards ACTIVE rows). Force them into the version-match else-branch below.
  if p_op in ('revert','repoint','discard') and p_expected_version is null then
    return jsonb_build_object('ok', false, 'code', 'OVERRIDE_STALE_REVIEW'); end if;

  -- CAS-A (R15): version guards the override row. NULL expected => create (assert no ACTIVE row).
  if p_expected_version is null then
    if v_found and v_row.active then
      return jsonb_build_object('ok', false, 'code', 'OVERRIDE_STALE_REVIEW'); end if; -- active create-collision
  else
    if not v_found or v_row.version <> p_expected_version then
      return jsonb_build_object('ok', false, 'code', 'OVERRIDE_STALE_REVIEW'); end if; -- 409 (mismatch)
  end if;

  -- RPC-2/RPC-3: revert/repoint/discard operate on an EXISTING override row (never a create). Require it
  -- present regardless of the p_expected_version shape, so a NULL-version caller cannot reach a live-apply
  -- or delete no-op against a missing row (`v_row.id` NULL).
  if p_op in ('revert','repoint','discard') and not v_found then
    return jsonb_build_object('ok', false, 'code', 'OVERRIDE_STALE_REVIEW'); end if;
  if p_op = 'revert' and not v_row.active then     -- revert removes an ACTIVE override; an inactive row uses discard.
    return jsonb_build_object('ok', false, 'code', 'OVERRIDE_INVALID_STATE'); end if;

  -- ===== resolve the CURRENT/CREATE target row (per domain) =====
  -- F2 INVARIANT: `p_expected_live_hotel_name` ALWAYS describes the target being created / repointed-TO
  -- (B for repoint; the sole target for create/edit/revert). The OLD target A in a repoint is resolved
  -- from the override row's OWN stored identity (v_row.override_value for a hotel_name repoint / the
  -- active hotel_name override output for a hotel_address repoint; currentLiveName(p_match_key) for crew)
  -- inside the repoint branch — NOT from p_expected_live_hotel_name (which now = B).
  if p_domain = 'show' then
    v_target_id := v_show_id; -- singleton, PK anchor
  elsif p_domain = 'crew' then
    if p_op in ('upsert','revert') then
      -- currentLiveName = active name override output else match_key (§7.6). Resolves the CURRENT target A.
      select coalesce((select (o.override_value #>> '{}') from public.admin_overrides o
          where o.show_id=v_show_id and o.domain='crew' and o.field='name'
            and o.match_key=p_match_key and o.active), p_match_key) into v_live_name;
      select id into v_target_id from public.crew_members
        where show_id=v_show_id and name=v_live_name;
      if v_target_id is null then     -- §7.6:437 zero live match when the UI expected one => 409, never a silent no-op.
        return jsonb_build_object('ok', false, 'code', 'OVERRIDE_STALE_REVIEW'); end if;
    end if;
    -- (repoint resolves A [release] + B [apply] in its own branch; discard is inactive-only, no live row.)
  elsif p_domain = 'hotel' then
    v_disamb := case when position(chr(31) in p_match_key) > 0
                     then substr(p_match_key, position(chr(31) in p_match_key)+1) else null end;
    if p_op in ('upsert','revert') then
      -- unconditional exactly-one-live-match on p_expected_live_hotel_name [+ recomputed disambiguator] (R20).
      -- (repoint resolves A + B itself in its branch; discard is inactive-only and applies to no live row.)
      select count(*), (array_agg(id))[1] into v_match_count, v_target_id from public.hotel_reservations hr -- RPC2-1: min(uuid) not in PG
        where hr.show_id=v_show_id and hr.hotel_name=p_expected_live_hotel_name
          and (v_disamb is null
               or (coalesce(to_char(hr.check_in,'YYYY-MM-DD'),'')
                   || coalesce(chr(31)||hr.confirmation_no,'')) = v_disamb
               or coalesce(to_char(hr.check_in,'YYYY-MM-DD'),'') = v_disamb);
      if v_match_count <> 1 then
        return jsonb_build_object('ok', false, 'code', 'OVERRIDE_STALE_REVIEW'); end if; -- 0 or >1 => 409
    end if;
  end if;

  -- CAS-B (R16) — CREATE-ONLY (F2). The live field of the create target must still equal
  -- p_expected_current_value; repoint's CAS-B is against NEW target B and runs in the repoint branch.
  -- (edit is guarded by CAS-A version; revert/discard need no value CAS.) R3b-4: NOT skipped when the
  -- expected value is SQL NULL — §7.2 requires CAS-B on every create; `is distinct from` handles NULL
  -- correctly (live NULL vs expected NULL passes; a sync that filled a null field 409s). The caller
  -- always passes the field's current value (SQL/JSON null when the field was empty at UI-load).
  -- RPC-6: normalize both sides to canonical jsonb 'null' so a SQL-NULL live value and a JSON-null expected
  -- (or vice-versa) compare equal — `x is distinct from y` treats SQL NULL and 'null'::jsonb as different.
  if p_op = 'upsert' and p_expected_version is null then
    if p_domain='show' and p_field='dates' and
       coalesce((select dates from public.shows where id=v_show_id),'null'::jsonb)
         is distinct from coalesce(p_expected_current_value,'null'::jsonb) then
      return jsonb_build_object('ok', false, 'code', 'OVERRIDE_STALE_REVIEW'); end if;
    if p_domain='show' and p_field='venue' and
       coalesce((select venue from public.shows where id=v_show_id),'null'::jsonb)
         is distinct from coalesce(p_expected_current_value,'null'::jsonb) then
      return jsonb_build_object('ok', false, 'code', 'OVERRIDE_STALE_REVIEW'); end if;
    if p_domain='crew' then
      if coalesce((select to_jsonb(case when p_field='name' then name else role end)
            from public.crew_members where id=v_target_id),'null'::jsonb)
            is distinct from coalesce(p_expected_current_value,'null'::jsonb) then
        return jsonb_build_object('ok', false, 'code', 'OVERRIDE_STALE_REVIEW'); end if;
    end if;
    if p_domain='hotel' then
      if coalesce((select to_jsonb(case when p_field='hotel_name' then hotel_name else hotel_address end)
            from public.hotel_reservations where id=v_target_id),'null'::jsonb)
            is distinct from coalesce(p_expected_current_value,'null'::jsonb) then
        return jsonb_build_object('ok', false, 'code', 'OVERRIDE_STALE_REVIEW'); end if;
    end if;
  end if;

  -- ===== op semantics =====
  if p_op = 'discard' then
    if v_row.active then return jsonb_build_object('ok', false, 'code', 'OVERRIDE_INVALID_STATE'); end if; -- R14
    delete from public.admin_overrides where id=v_row.id;
    return jsonb_build_object('ok', true, 'value', 'discarded');
  end if;

  if p_op = 'revert' then
    -- restore sheet_value to the live row, then delete the override row. sheet_name→NULL on a crew-name revert (R3b-3).
    perform public._apply_override_live(v_show_id, p_domain, p_field, v_target_id, v_row.sheet_value, null);
    delete from public.admin_overrides where id=v_row.id;
    return jsonb_build_object('ok', true, 'value', v_row.sheet_value);
  end if;

  if p_op = 'repoint' then
    if p_domain='crew' and p_field='name' and v_row.active then
      return jsonb_build_object('ok', false, 'code', 'OVERRIDE_INVALID_STATE'); end if; -- R25 active-name repoint
    -- Resolve OLD target A's release id UP FRONT (active repoint only), BEFORE the §7.4 collision check, so
    -- that check can exclude A (RPC2-2 — A still holds the override value now but is about to be released;
    -- without the exclusion, repointing a hotel_name override to B keeping the same value self-conflicts).
    -- Resolve A from its OWN identity (F2), NOT p_expected_live_hotel_name (which = B).
    if v_row.active then
      if p_domain='crew' then
        -- RPC-1: crew resolver above is gated to upsert/revert, so v_target_id is NULL on repoint — resolve A
        -- HERE via currentLiveName(p_match_key). (Active crew-NAME repoint rejected above ⇒ only crew-ROLE here.)
        select coalesce((select (o.override_value #>> '{}') from public.admin_overrides o
            where o.show_id=v_show_id and o.domain='crew' and o.field='name'
              and o.match_key=p_match_key and o.active), p_match_key) into v_live_name;
        select id into v_release_id from public.crew_members where show_id=v_show_id and name=v_live_name;
      else -- hotel: A's current live hotel_name = active hotel_name override output else the parsed name in p_match_key
        select coalesce(
          (select o.override_value #>> '{}' from public.admin_overrides o
             where o.show_id=v_show_id and o.domain='hotel' and o.field='hotel_name'
               and o.match_key=p_match_key and o.active),
          split_part(p_match_key, chr(31), 1)) into v_live_name;
        v_release_id := public._resolve_live_id(v_show_id, 'hotel', p_field, p_match_key, v_live_name);
      end if;
    end if;
    -- CAS-B against the NEW target B (F2), required on every repoint-to-new (R3b-4 — NOT skipped on
    -- NULL expected; `is distinct from` handles NULL). p_expected_live_hotel_name describes B (F2 INVARIANT).
    v_bval := public._current_field_value(v_show_id, p_domain, p_field, p_new_match_key, p_expected_live_hotel_name);
    if coalesce(v_bval,'null'::jsonb) is distinct from coalesce(p_expected_current_value,'null'::jsonb) then -- RPC-6 normalize
      return jsonb_build_object('ok', false, 'code', 'OVERRIDE_STALE_REVIEW'); end if;
    -- §7.4 value guard on the (possibly new) override value, targeting B, EXCLUDING the releasing A (RPC2-2).
    v_reason := public._validate_override_value(v_show_id, p_domain, p_field, p_new_match_key,
                  public._resolve_live_id(v_show_id, p_domain, p_field, p_new_match_key, p_expected_live_hotel_name),
                  coalesce(p_override_value, v_row.override_value), v_release_id);
    if v_reason is not null then return jsonb_build_object('ok', false, 'code', 'OVERRIDE_STALE_REVIEW'); end if;
    -- target-key collision at the new key (R29): active => 409; inactive => supersede (delete) in-tx.
    perform 1 from public.admin_overrides
      where show_id=v_show_id and domain=p_domain and field=p_field and match_key=p_new_match_key and id<>v_row.id and active;
    if found then return jsonb_build_object('ok', false, 'code', 'OVERRIDE_INVALID_STATE'); end if;
    delete from public.admin_overrides
      where show_id=v_show_id and domain=p_domain and field=p_field and match_key=p_new_match_key and id<>v_row.id and not active;
    if v_row.active then
      -- release OLD target A to its stored sheet_value (role/hotel only — active name repoint rejected above).
      perform public._apply_override_live(v_show_id, p_domain, p_field, v_release_id, v_row.sheet_value, null);
    end if;
    -- capture B's parsed value (un-overridden => live == sheet) and apply. sheet_name→p_new_match_key on a
    -- crew-name (inactive) repoint (R3b-3); ignored by role/hotel arms.
    v_captured := public._current_field_value(v_show_id, p_domain, p_field, p_new_match_key, p_expected_live_hotel_name);
    update public.admin_overrides set match_key=p_new_match_key, active=true, deactivation_code=null,
      sheet_value=v_captured, override_value=coalesce(p_override_value, override_value),
      version=version+1, updated_at=now() where id=v_row.id returning * into v_row;
    perform public._apply_override_live(v_show_id, p_domain, p_field,
      public._resolve_live_id(v_show_id, p_domain, p_field, p_new_match_key, p_expected_live_hotel_name),
      v_row.override_value, p_new_match_key);
    return jsonb_build_object('ok', true, 'value', v_row.override_value);
  end if;

  -- p_op = 'upsert' (create or edit). RPC3-1: explicitly gate — reaching here with any non-upsert op would
  -- be a logic error (all others returned above); fail closed rather than run create/edit for it.
  if p_op <> 'upsert' then return jsonb_build_object('ok', false, 'code', 'OVERRIDE_INVALID_OP'); end if;
  -- §7.4 value guard on the create/edit target (F3); target self excluded from collision via v_target_id.
  -- RPC-9: a value-guard failure collapses to OVERRIDE_STALE_REVIEW deliberately (spec §10:574 "reuse an
  -- existing code; do not invent one") — the TS validateOverrideValue (Task 5) gives the precise pre-RPC UI
  -- message, so a §7.4 failure reaching the RPC means the client's view is stale/inconsistent (reload).
  v_reason := public._validate_override_value(v_show_id, p_domain, p_field, p_match_key, v_target_id, p_override_value);
  if v_reason is not null then return jsonb_build_object('ok', false, 'code', 'OVERRIDE_STALE_REVIEW'); end if;
  if not v_found or not v_row.active then
    -- CREATE (or reactivate a retained inactive row — R28). capture the CURRENT live value as sheet_value.
    v_captured := public._current_field_value(v_show_id, p_domain, p_field, p_match_key, p_expected_live_hotel_name);
    insert into public.admin_overrides(show_id,domain,field,match_key,override_value,sheet_value,active,deactivation_code,created_by,version)
      values (v_show_id,p_domain,p_field,p_match_key,p_override_value,v_captured,true,null,lower(trim(p_actor)),1)
      on conflict (show_id,domain,field,match_key) do update
        set override_value=excluded.override_value, active=true, deactivation_code=null,
            sheet_value=excluded.sheet_value, version=public.admin_overrides.version+1, updated_at=now();
  else
    -- EDIT (active): update override_value only; PRESERVE sheet_value (R7); bump version.
    update public.admin_overrides set override_value=p_override_value, version=version+1, updated_at=now()
      where id=v_row.id;
  end if;
  -- sheet_name→match_key on crew-name create/edit (R3b-3); ignored by role/hotel/show arms.
  perform public._apply_override_live(v_show_id, p_domain, p_field, v_target_id, p_override_value, p_match_key);
  return jsonb_build_object('ok', true, 'value', p_override_value);
end $$;

revoke execute on function public.set_field_override(text,text,text,text,text,text,jsonb,text,int,jsonb,int,text)
  from public, anon, authenticated;
grant execute on function public.set_field_override(text,text,text,text,text,text,jsonb,text,int,jsonb,int,text) to service_role;
```

Plus **four** small `security definer` helper functions in the SAME migration, defined **BEFORE** `set_field_override` (so it can call them), kept private (REVOKE execute from public/anon/authenticated; no grant to authenticated — only the outer RPC, running in its own SECURITY DEFINER context, calls them). H1–H3 realize §7.3's "RPC path = one targeted UPDATE"; **H4 `_validate_override_value` enforces the §7.4 value guards RPC-side under the lock (F3)** — the race-safe backstop to the TS `validateOverrideValue` (Task 5). They keep the outer body readable. Complete, implementable bodies:

```sql
-- (H1) Resolve the live row id for a (domain, match_key) under the caller's lock.
-- crew: currentLiveName (§7.6) = active name override output else match_key; unique per show.
-- hotel: R20 UNCONDITIONAL exactly-one-live-match on p_expected_live_hotel_name [+ §5.3 disambiguator
--        recomputed from NON-OVERRIDABLE booking cols check_in[+confirmation_no], NEVER names[] (R30)];
--        zero-or-many => 40001 (route maps to 409 stale_review), never a guessed row.
-- show: the singleton shows.id.
create or replace function public._resolve_live_id(
  p_show_id uuid, p_domain text, p_field text, p_match_key text, p_expected_live_hotel_name text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_live_name text;
  v_disamb text;
  v_count int;
  v_id uuid;
begin
  if p_domain = 'show' then
    return p_show_id;
  elsif p_domain = 'crew' then
    select coalesce((select (o.override_value #>> '{}') from public.admin_overrides o
        where o.show_id=p_show_id and o.domain='crew' and o.field='name'
          and o.match_key=p_match_key and o.active), p_match_key) into v_live_name;
    select id into v_id from public.crew_members where show_id=p_show_id and name=v_live_name;
    if v_id is null then
      raise exception 'crew live row not found for %', v_live_name using errcode='40001'; end if;
    return v_id;
  else -- hotel
    v_disamb := case when position(chr(31) in p_match_key) > 0
                     then substr(p_match_key, position(chr(31) in p_match_key)+1) else null end;
    select count(*), (array_agg(id))[1] into v_count, v_id from public.hotel_reservations hr -- RPC2-1: min(uuid) not in PG
      where hr.show_id=p_show_id and hr.hotel_name=p_expected_live_hotel_name
        and (v_disamb is null
             -- recompute disambiguator from booking columns only (R30): 'YYYY-MM-DD' [+ \x1f + confirmation_no]
             or (coalesce(to_char(hr.check_in,'YYYY-MM-DD'),'')
                 || coalesce(chr(31)||hr.confirmation_no,'')) = v_disamb
             or coalesce(to_char(hr.check_in,'YYYY-MM-DD'),'') = v_disamb);
    if v_count <> 1 then
      raise exception 'hotel live row not unique (count=%)', v_count using errcode='40001'; end if;
    return v_id;
  end if;
end $$;

-- (H2) Read the current live field value as jsonb — CAS-B source + create/repoint sheet_value capture.
-- Reads the exact row _resolve_live_id resolves; dates/venue are jsonb columns, the four text fields
-- are wrapped with to_jsonb so the RPC's `is distinct from p_expected_current_value` compares like-for-like.
create or replace function public._current_field_value(
  p_show_id uuid, p_domain text, p_field text, p_match_key text, p_expected_live_hotel_name text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_val jsonb;
begin
  if p_domain='show' then
    if p_field='dates' then select dates into v_val from public.shows where id=p_show_id;
    else                    select venue into v_val from public.shows where id=p_show_id; end if;
    return v_val;
  end if;
  v_id := public._resolve_live_id(p_show_id, p_domain, p_field, p_match_key, p_expected_live_hotel_name);
  if p_domain='crew' then
    if p_field='name' then select to_jsonb(name) into v_val from public.crew_members where id=v_id;
    else                    select to_jsonb(role) into v_val from public.crew_members where id=v_id; end if;
  else -- hotel
    if p_field='hotel_name' then select to_jsonb(hotel_name) into v_val from public.hotel_reservations where id=v_id;
    else                          select to_jsonb(hotel_address) into v_val from public.hotel_reservations where id=v_id; end if;
  end if;
  return v_val;
end $$;

-- (H3) Apply a value to ONE live row. shows: WHERE id=p_show_id (singleton); crew/hotel: WHERE id=p_target_id.
-- jsonb columns (dates/venue) take p_value directly; text columns extract the scalar with #>>'{}'.
-- (H3) p_sheet_name (R3b-3): the crew-name arm ALSO maintains crew_members.sheet_name so the §3.5/§4.4
-- visibility-alias invariant ("sheet_name = match_key iff an active name override") holds CONTINUOUSLY —
-- immediately after the RPC apply, not only after the next sync. Callers pass match_key on apply/edit/
-- (inactive) repoint and NULL on revert. Ignored by every non-(crew,name) arm.
create or replace function public._apply_override_live(
  p_show_id uuid, p_domain text, p_field text, p_target_id uuid, p_value jsonb, p_sheet_name text default null
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if p_domain='show' and p_field='dates' then
    update public.shows set dates=p_value where id=p_show_id;
  elsif p_domain='show' and p_field='venue' then
    update public.shows set venue=p_value where id=p_show_id;
  elsif p_domain='crew' and p_field='name' then
    update public.crew_members set name=(p_value #>> '{}'), sheet_name=p_sheet_name where id=p_target_id;
  elsif p_domain='crew' and p_field='role' then
    update public.crew_members set role=(p_value #>> '{}') where id=p_target_id;
  elsif p_domain='hotel' and p_field='hotel_name' then
    update public.hotel_reservations set hotel_name=(p_value #>> '{}') where id=p_target_id;
  elsif p_domain='hotel' and p_field='hotel_address' then
    update public.hotel_reservations set hotel_address=(p_value #>> '{}') where id=p_target_id;
  else
    raise exception 'unknown (domain,field) (%,%)', p_domain, p_field using errcode='22023';
  end if;
  -- RPC-7 (STRUCTURAL class-defense): a targeted apply matching ZERO live rows means the resolved id was
  -- NULL/stale — RAISE rather than let the override row mutate while the live row silently no-ops. Escapes
  -- as SQLSTATE 40001 → the JS helper maps it to OVERRIDE_STALE_REVIEW (R3b-6). This closes the entire
  -- "override metadata written but live row not touched" bug class at the single write chokepoint, so a
  -- resolver regression anywhere upstream fails LOUD (409) instead of silently, rather than needing a
  -- per-op guard. (Every apply above touches exactly one row: show singleton PK, crew/hotel by id.)
  if not found then
    raise exception 'override apply matched no live row (domain=%, field=%)', p_domain, p_field using errcode='40001'; end if;
end $$;

-- (H4, F3) §7.4 value guards — enforced RPC-side under the lock (race-safe backstop; the TS
-- validateOverrideValue gives the precise pre-RPC UI message). Returns NULL = ok, else a reason token.
-- Overrides are write-time applied, so every live crew_members.name / hotel_reservations.hotel_name
-- ALREADY equals its FINAL name (R27) — a collision is equality against ANOTHER live row's current value.
-- p_exclude_id_2 (RPC2-2): a SECOND live id to exclude from the collision check — the OLD target A of an
-- active repoint, which still holds the override value at validation time but is about to be released.
-- NULL for every non-repoint call (`id is distinct from NULL` never filters).
create or replace function public._validate_override_value(
  p_show_id uuid, p_domain text, p_field text, p_match_key text, p_target_id uuid, p_value jsonb,
  p_exclude_id_2 uuid default null
) returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_text text;
begin
  if p_domain='show' then                    -- dates/venue: a NON-EMPTY jsonb object (deep dates/venue shape
    -- is validated authoritatively TS-side in validateOverrideValue, Task 5 — non-race, knows the shape).
    if p_value is null or jsonb_typeof(p_value) <> 'object' or p_value = '{}'::jsonb then return 'invalid_shape'; end if;
    return null;
  end if;
  if jsonb_typeof(p_value) <> 'string' then return 'invalid_shape'; end if; -- the four text fields MUST be JSON strings (reject number/object/bool).
  v_text := p_value #>> '{}';                 -- extract the scalar.
  if v_text is null or btrim(v_text) = '' then return 'empty'; end if;
  if p_field='name'          and v_text = p_match_key then return 'noop'; end if;
  if p_field='hotel_name'    and v_text = split_part(p_match_key, chr(31), 1) then return 'noop'; end if; -- name part before the §5.3 disambiguator
  if p_field='name'          and length(v_text) > 200 then return 'too_long'; end if;
  if p_field='role'          and length(v_text) > 120 then return 'too_long'; end if;
  if p_field='hotel_name'    and length(v_text) > 200 then return 'too_long'; end if;
  if p_field='hotel_address' and length(v_text) > 300 then return 'too_long'; end if;
  if p_field='name' then
    -- collide vs any OTHER member's FINAL live name OR its PARSED identity (§7.4: a future revert that
    -- de-overrides that member would otherwise collapse two (show_id,name) rows). Parsed identity =
    -- the member's active name-override match_key if it has one, else its live name.
    if exists(
      select 1 from public.crew_members cm
       where cm.show_id=p_show_id and cm.id is distinct from p_target_id and cm.id is distinct from p_exclude_id_2
         and (cm.name = v_text
              or coalesce(
                   (select o.match_key from public.admin_overrides o
                      where o.show_id=p_show_id and o.domain='crew' and o.field='name' and o.active
                        and (o.override_value #>> '{}') = cm.name),
                   cm.name) = v_text))
    then return 'name_conflict'; end if;
  elsif p_field='hotel_name' then             -- collide vs any OTHER reservation's live (= FINAL) hotel_name (R27: FINAL only, never parsed).
    if exists(select 1 from public.hotel_reservations hr
                where hr.show_id=p_show_id and hr.id is distinct from p_target_id
                  and hr.id is distinct from p_exclude_id_2 and hr.hotel_name=v_text)
    then return 'name_conflict'; end if;
  end if;
  return null;
end $$;

-- Ownership note (RPC4-1): all FIVE functions (set_field_override + these 4 helpers) are created in THIS
-- one migration file, applied by a single role — so they share an owner. A SECURITY DEFINER function runs
-- as its owner, and an owner ALWAYS retains EXECUTE on its own functions regardless of REVOKE; these REVOKEs
-- only strip public/anon/authenticated. So the outer RPC can always call the helpers. (No cross-owner grant
-- is needed; do NOT grant helper EXECUTE to service_role — that would re-expose them via PostgREST.)
revoke execute on function public._resolve_live_id(uuid,text,text,text,text)   from public, anon, authenticated;
revoke execute on function public._current_field_value(uuid,text,text,text,text) from public, anon, authenticated;
revoke execute on function public._apply_override_live(uuid,text,text,uuid,jsonb,text) from public, anon, authenticated;
revoke execute on function public._validate_override_value(uuid,text,text,text,uuid,jsonb,uuid) from public, anon, authenticated;
```

**Note on `set_field_override`'s inline resolution vs H1:** the outer RPC body above computes `v_target_id` inline for the CAS/apply of the CURRENT `p_match_key` (so it can 409 before mutating), and calls `public._resolve_live_id(...)` only on the **repoint** branch to locate the NEW target (`p_new_match_key`). Both paths use the same fail-closed rules (crew `currentLiveName`; hotel unconditional exactly-one-match → `40001`). A `40001` raised inside H1/H3 propagates out of the RPC; the JS action's `mapRpcOutcome` maps the returned error to `OVERRIDE_STALE_REVIEW`/`SYNC_INFRA_ERROR` (invariant 9) — so H1's raise is equivalent to the inline `return jsonb_build_object('ok',false,'code','OVERRIDE_STALE_REVIEW')` guards. (Both surface as 409 stale-review to the admin UI; no silent no-op.)

Apply locally; re-run Step 3.1 → grant assertion PASSES. Also assert (in `setFieldOverrideGrants.test.ts`) that all **four** `_`-prefixed helpers (`_resolve_live_id`, `_current_field_value`, `_apply_override_live`, `_validate_override_value`) have EXECUTE revoked from public/anon/authenticated (internal-only).

### Step 3.3 — Extend `advisoryLockRpcDeadlock.test.ts`

Add `"supabase/migrations/20260707000000_admin_field_overrides.sql"` to `migrationFiles` (`:33`) and a `toContain("set_field_override")` assertion in the lock-taker block (`:100+`) proving the RPC self-locks (single holder). Add a comment: `// set_field_override — in-RPC single holder (spec §7.2); the JS action never locks.`

Run `pnpm vitest run tests/auth/advisoryLockRpcDeadlock.test.ts` → PASSES.

**Deliverable:** RPC live locally; execute locked down; deadlock topology pinned.
**Commit:** `feat(db): set_field_override RPC (in-RPC single-holder lock, CAS-A/B, per-op semantics)`

---

## Task 4 — `setFieldOverride.ts` helper (service-role client, mapRpcOutcome, infra-contract) + full RPC test matrix

**Spec:** §7, §8.4, §12. **Files:**
- `lib/overrides/setFieldOverride.ts` (NEW)
- `tests/overrides/setFieldOverride.test.ts` (NEW — full §12 matrix, DB-integration)
- `tests/auth/_metaInfraContract.test.ts` (SATISFY — inline exemption or registry)

**Interfaces — Produces:** `setFieldOverride(params: SetFieldOverrideParams, deps?): Promise<{ ok:true; value:unknown } | { ok:false; code:string }>` — constructs the service-role client (`(deps?.createClient ?? createSupabaseServiceRoleClient)()`, mirroring `setPullSheetOverrideRpc.ts:34`), `const { data, error } = await client.rpc("set_field_override", params)`, then maps the discriminated outcome (invariant 9): a returned-error with SQLSTATE `40001` → `OVERRIDE_STALE_REVIEW`, any other error → `SYNC_INFRA_ERROR`, `data.ok` → pass through (mirrors `mapRpcOutcome`'s contract; the 40001 discrimination is the override-specific addition, R3b-6).

### Step 4.1 — Failing helper unit test (mocked client — call-boundary discipline)

`tests/overrides/setFieldOverride.unit.test.ts`: inject a fake `createClient` returning `{ rpc: async () => ({ data, error }) }`; assert (a) returned-error with `code:"40001"` → `{ok:false, code:"OVERRIDE_STALE_REVIEW"}` (R3b-6 — helper-raised stale target, NOT infra); (a2) returned-error with any other code → `{ok:false, code:"SYNC_INFRA_ERROR"}`; (b) `data.ok===false` → `{ok:false, code:data.code}`; (c) `data.ok===true` → `{ok:true, value}`; (d) null/unexpected → infra fault (never silent success). Run → FAILS (module absent).

### Step 4.2 — Helper (minimal impl)

```ts
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type SetFieldOverrideParams = {
  p_drive_file_id: string; p_op: "upsert"|"revert"|"repoint"|"discard";
  p_domain: "show"|"crew"|"hotel"; p_field: string; p_match_key: string;
  p_new_match_key: string | null; p_override_value: unknown; p_actor: string;
  p_expected_version: number | null; p_expected_current_value: unknown;
  p_current_ordinal: number | null; p_expected_live_hotel_name: string | null;
};
type Deps = { createClient?: typeof createSupabaseServiceRoleClient };
export type SetFieldOverrideResult = { ok: true; value: unknown } | { ok: false; code: string };

export async function setFieldOverride(params: SetFieldOverrideParams, deps?: Deps): Promise<SetFieldOverrideResult> {
  const client = (deps?.createClient ?? createSupabaseServiceRoleClient)();
  // not-subject-to-meta: lib/overrides is not an auth-domain surface (_metaInfraContract roots are
  // lib/auth,app/auth,app/api/auth,app/api/show); this call-site still honors invariant 9 explicitly.
  const { data, error } = await client.rpc("set_field_override", params);
  // R3b-6: a helper-raised stale target surfaces as Postgres SQLSTATE 40001 (PostgREST puts it on
  // error.code) — map it to the stale-review contract, NOT infra; every OTHER error is a genuine fault.
  if (error) return { ok: false, code: error.code === "40001" ? "OVERRIDE_STALE_REVIEW" : "SYNC_INFRA_ERROR" };
  const d = data as { ok?: boolean; code?: string; value?: unknown } | null;
  if (d && d.ok === false) return { ok: false, code: d.code ?? "SYNC_INFRA_ERROR" };
  if (d && d.ok === true) return { ok: true, value: d.value };
  return { ok: false, code: "SYNC_INFRA_ERROR" };
}
```

Run Step 4.1 → PASSES. Confirm `_metaInfraContract` still green (the inline `// not-subject-to-meta:` covers the new call site since `lib/overrides` is outside the walked auth roots — verify by running `pnpm vitest run tests/auth/_metaInfraContract.test.ts`).

### Step 4.3 — Full RPC matrix (DB-integration, gated on TEST_DATABASE_URL)

`tests/overrides/setFieldOverride.test.ts` — the complete §12 `setFieldOverride.test.ts` matrix (each `it` states its failure mode):
- **ops:** upsert(create)/upsert(edit)/revert/repoint/discard for each domain.
- **CAS-A version (R15):** two stale pages editing one active override — first bumps `version`, second (stale `p_expected_version`) 409s; stale revert/repoint/discard 409; create-when-active-exists 409.
- **R30 benign refresh vs deactivation:** a `sheet_value` refresh in the window does NOT 409 an open edit (same version); a deactivation in the window DOES (version bumped).
- **R28 create-reactivate:** create on a target with a retained inactive row REACTIVATES (`active=true`, `deactivation_code=null`, `sheet_value` recaptured from live, `version+1`) — no `admin_overrides_uniq` violation.
- **sheet_value invariant (R6/R7):** create-then-revert AND edit-then-revert, both WITHOUT any sync, restore the true sheet value for each of the 6 fields (edit must NOT recapture the prior override).
- **§7.6 crew anchor matrix:** edit `John→Jonathan`, revert `John→Jon` hit the correct row; role apply+revert while a name override is active resolves via the sibling; inactive/stale crew-NAME repoint succeeds with no old live row; wrong active-anchor (concurrent sync moved the live name) → 409 not silent no-op.
- **R25 active crew-name repoint:** 409 invalid-state, mutates nothing (A, B, override row unchanged); active role + hotel repoint succeed (release-A-then-apply-B).
- **R14 active discard:** 409 for show/crew/hotel, row + live value intact.
- **R29 repoint target-key collision:** into an active override → 409; into an inactive → superseded (deleted), exactly one row at the key; for both active and inactive source overrides.
- **CAS-B live-value (R16/R17):** a sync correcting the underlying field (per field) between UI-load and create/repoint-to-new → 409; value sent as RAW loader-source jsonb so dates/venue don't false-409.
- **hotel row-locator (R19/R20):** two same-name reservations with a reorder/insert-before between load and save → 409 (both fields); a UNIQUE-at-load name gaining a same-name sibling → 409 via the unconditional gate; a benign pure reorder keeping the name unique still resolves with no false 409.
- **guards §7.4:** crew name collision + hotel_name FINAL-name collision rejected at create/edit; empty/whitespace/`= match_key` no-op rejected; caps. (RPC-enforced via `_validate_override_value`, F3 — the tests hit the RPC directly, not the TS helper.)
- **F1 create-row durability:** create for each domain with NO pre-existing override row asserts the `admin_overrides` row EXISTS afterward (query it back), NOT merely the live-row change — guards the stale-PL/pgSQL-`FOUND` regression where a create silently falls into the edit branch (`where id=<null>` no-op) and never inserts while the live apply still runs.
- **F2 inactive repoint no false-409:** an INACTIVE role + hotel override repointed to a live B with `p_expected_current_value` SET succeeds (old target A vanished → must NOT false-409); asserts CAS-B was evaluated against B (the new target), not the gone A.
- **RPC-1 crew-role active repoint release:** an ACTIVE crew-**role** repoint restores A's role to its `sheet_value` AND applies to B — asserts A is resolved inside the repoint branch (the crew resolver is gated to upsert/revert, so a null `v_target_id` release would silently no-op A; regression guard).
- **RPC-2/3 op-on-missing/inactive row:** `revert`/`repoint`/`discard` with `p_expected_version=NULL` against a NON-existent override row → 409, nothing mutated (no `where id=NULL` delete/apply); `revert` on an INACTIVE row → `OVERRIDE_INVALID_STATE`.
- **RPC-5 unknown (domain,field):** e.g. `('show','name')` or `('crew','hotel_name')` → `OVERRIDE_INVALID_OP`, nothing written.
- **RPC-7 apply-matches-no-live-row (STRUCTURAL):** force a resolved target to vanish between resolution and apply (delete the crew/hotel row inside a concurrent tx, or feed a domain whose live row was removed) → the RPC raises SQLSTATE 40001 → helper maps to `OVERRIDE_STALE_REVIEW`, and the `admin_overrides` row is UNCHANGED (the raise rolls the whole locked tx back). Pins the `_apply_override_live` FOUND-assert that closes the silent-live-no-op class.
- **RPC2-1 hotel resolver returns a real row:** any two-same-name hotel resolution path (create/edit/repoint) actually resolves the disambiguated row (regression guard: `min(uuid)` does not exist in PG — the resolver uses `(array_agg(id))[1]`; a `min(id)` transcription would error every hotel op).
- **RPC2-2 active hotel_name repoint keeping the same value:** an active `hotel_name` override on A (value `Hilton`) repointed to a new reservation B, `p_override_value` omitted → SUCCEEDS (A is excluded from the FINAL-name collision because it is the releasing target); A reverts to its parsed name, B becomes `Hilton`, exactly one live `Hilton`.
- **RPC2-3 non-create ops require a version:** `revert`/`repoint`/`discard` called with `p_expected_version=NULL` → 409 `OVERRIDE_STALE_REVIEW` (they must carry the version CAS; an inactive row cannot be repointed/discarded via the create path).
- **RPC3-1 NULL/invalid discriminators:** `p_op`/`p_domain`/`p_field` = NULL or an unknown value → `OVERRIDE_INVALID_OP`, never falls through to the upsert block.
- **RPC5-1 show singleton match_key:** a second show `dates` create with a DIFFERENT `p_match_key` than the first is treated as the SAME target (match_key canonicalized to `''`) → blocked by the active-create collision (one active show override per field, never two).
- **canonical `created_by`:** a mixed-case `p_actor` is stored `lower(trim())` (or rejected by the CHECK).
- **lock held:** assert `pg_advisory_xact_lock` is taken (structural — via the deadlock pin in Task 3; this suite asserts a concurrent conflicting op serializes).

Run → all PASS. (Anti-tautology: every hotel/CAS assertion derives expected values from fixture `check_in`/live rows, never hardcoded.)

**Deliverable:** helper + exhaustive RPC matrix green.
**Commit:** `feat(overrides): setFieldOverride helper + full set_field_override RPC test matrix`

---

# PHASE 3 — Sync write-time apply (Stage A pure transform · §3.6 id-keyed crew reconciliation · Stage B side-effects)

**Phase-3 architecture recap (spec §3.2–§3.6, §5, §7.3):** all inside the existing `withShowLock` tx (no new lock).
- **Stage A** (pure, before `applyShowSnapshot`): `overrideShowHotel(parseResult, activeOverrides)` → `{ overriddenParseResult, plannedShowHotelSideEffects }`. Transforms `show`.dates/venue + hotel rows; plans `sheet_value`/stale for show+hotel (NO holds). Zero writes.
- **Crew** (post-hold, inside `applyParseResult`): the §3.6 id-keyed reconciliation — hold disposition on RAW parse first, then the four-phase write; emits its own crew side-effects (deactivations/sheet_value/sheet_name).
- **Stage B** (applied-path-only, at `phase2.ts:380` slot): `commitOverrideSideEffects(tx, sideEffects)` writes ALL `admin_overrides` mutations (sheet_value refresh, `active=false`+`deactivation_code`, `version` bumps) — from Stage A (show/hotel) + crew reconciliation — atomic with the change-log writes. Never reached on a stale short-circuit → `admin_overrides` untouched on stale sync.

## Task 5 — Shared pure helpers: `validateOverrideValue` + `matchOverrideTarget` + hotel disambiguator

**Spec:** §5.3, §7.3, §7.4. **Files:**
- `lib/overrides/validateOverrideValue.ts` (NEW), `lib/overrides/matchOverrideTarget.ts` (NEW), `lib/overrides/hotelDisambiguator.ts` (NEW)
- `tests/overrides/validateOverrideValue.test.ts`, `tests/overrides/matchOverrideTarget.test.ts` (NEW)

**Interfaces — Produces:**
- `validateOverrideValue(field, value, ctx: { currentParsedNames?: string[]; currentLiveNames?: string[]; otherActiveNameOutputs?: string[]; otherFinalHotelNames?: string[]; matchKey: string }): { ok:true } | { ok:false; code:string }` — the §7.4 guard table (empty/whitespace reject; `= match_key` no-op; crew name collision; hotel_name FINAL-name collision; caps 200/120/200/300; dates/venue shape). Used by BOTH the RPC-adjacent TS validation path and the sync transform.
- `computeHotelDisambiguator(res: { check_in: string|null; confirmation_no: string|null }): string` — `check_in` (`YYYY-MM-DD`), `+ \x1f + confirmation_no` when needed (§5.3). Delimiter `\x1f` (unit-separator). Never uses `names[]` (R30).
- `matchOverrideTarget(override, parsed: { crewNames?: string[]; hotels?: HotelRow[] }): { matched: boolean; disambiguatorUnique: boolean }` — parsed-identity + disambiguator matching (§5.3/§3.6); fail-closed when a same-name hotel group's disambiguator resolves to ≠1.

### Step 5.1 — Failing tests
`validateOverrideValue.test.ts`: each of the 6 fields' reject cases + caps; **derive** collision inputs from a fixture crew/hotel list (not hardcoded); assert `= match_key` → no-op reject; assert a `.trim()`-exempt path for names carries the `// canonicalize-exempt` comment (grep the source in-test). `matchOverrideTarget.test.ts`: a unique hotel name matches; a same-name pair resolves via `check_in` disambiguator; a same-name pair whose disambiguator collides (equal check_in AND equal confirmation_no) → `disambiguatorUnique:false` (fail-closed). Run → FAIL (modules absent).

### Step 5.2 — Implement (minimal). Full guard table per §7.4; `\x1f` delimiter; NaN/null guards (empty→reject, null hotel fields→`''` in disambiguator). Add `// canonicalize-exempt: crew display name, not an email` on any name `.trim()` (the no-inline-email meta-test walks `lib/sync`; these helpers are `lib/overrides` — but the sync transform in Task 6/7 imports them into `lib/sync`, so keep trims out of `lib/sync` files or exempt them there). Run → PASS.

**Deliverable:** shared validate + match helpers green; used by RPC-side (Task 4) and sync-side (Task 6/7).
**Commit:** `feat(overrides): shared validateOverrideValue + matchOverrideTarget + hotel disambiguator`

## Task 6 — Stage A pure transform `overrideShowHotel` (show + hotel) + FINAL-name collision + wiring before `applyShowSnapshot`

**Spec:** §3.2 Stage A, §5.1, §5.3, §6 (hotel deactivation). **Files:**
- `lib/sync/overrideShowHotel.ts` (NEW)
- `lib/sync/loadActiveOverrides.ts` (NEW — reads `admin_overrides where show_id=? and active` inside the tx via the tx port; `{data,error}` discipline)
- `lib/sync/phase2.ts` (WIRE — `runPhase2` is the single owner of the parse: local `let parseResult = args.parseResult` (`phase2.ts:244`); the `applyShowSnapshot` CALL is `phase2.ts:288`; the `applyParseResult` CALL is `phase2.ts:368`. Call `overrideShowHotel` BEFORE the `applyShowSnapshot` call and **REBIND the local `parseResult` to `overriddenParseResult`** so BOTH the snapshot writer (`:288`) AND the later `applyParseResult` (`:368`) consume the SAME overridden parse; carry `plannedShowHotelSideEffects` to the Stage B slot at `phase2.ts:380`. NOTE: `applyShowSnapshot`/`deleteCrewMembersNotIn`/`upsertCrewMembers` at `runScheduledCronSync.ts:1304/1560/1567` are the tx-PORT *implementations*, not the call sites — the overlay must inject at the `phase2.ts` call sites, not the port bodies.)
- `tests/sync/overrideShowHotel.test.ts` (NEW — pure transform), `tests/sync/overrideShowHotelWiring.test.ts` (NEW — phase2 wiring, SYNC-1)

**Interfaces — Produces:** `overrideShowHotel(parseResult, activeOverrides): { overriddenParseResult: ParseResult; showHotelSideEffects: OverrideSideEffect[] }` where `OverrideSideEffect = { overrideId: string; sheetValue: unknown } | { overrideId: string; deactivate: 'target_missing'|'name_conflict' }`. **PURE** — zero DB writes.
- `show`: replace `parseResult.show.dates`/`.venue` with `override_value`; plan `sheetValue` = original parsed value (may be null). Never deactivates.
- `hotel`: for each active hotel override, resolve the (name + disambiguator) `match_key` against the parsed hotel set via `matchOverrideTarget`. Exactly-one → set that row's `hotel_name`/`hotel_address` = `override_value`, plan `sheetValue`. Zero/>1 → plan `deactivate:'target_missing'` (fail-closed, R16), do NOT apply. **FINAL-name collision (R26/R27):** compute each reservation's FINAL `hotel_name` (own active override output else parsed); if applying a `hotel_name` override would make two FINAL names coincide → plan `deactivate:'name_conflict'`, do NOT apply (compare FINALs, not raw parsed — R27). `hotel_address` never collides.

### Step 6.1 — Failing tests (`overrideShowHotel.test.ts`)
- show dates+venue replaced in `overriddenParseResult`; `sheetValue` = original parsed value; parsed-null dates → `sheetValue:null`, override still applied. Failure mode: writing to DB (assert zero tx calls — pass a spy tx and assert unused).
- hotel unique-name apply; hotel matched across a reorder (name-keyed, R16); **dup-name resolved by `check_in`**; **dup-name disambiguator non-unique → `deactivate:'target_missing'`, row NOT mutated** (derive from fixture check_in values).
- **R27 multi-hotel composition:** A parsed `Marriott`→override `Hilton`, B parsed `Hilton`→override `Hyatt` — FINALs `Hilton`/`Hyatt` distinct → NEITHER deactivates, both applied. Failure mode caught: collision-over-raw-parsed falsely deactivating A.
- **R26 runtime collision:** A active override→`Hilton`, B parses as `Hilton` un-overridden → FINALs coincide → A planned `deactivate:'name_conflict'`, A's override NOT applied (no two live `Hilton` rows).
- **Wiring (SYNC-1, `overrideShowHotelWiring.test.ts`):** a phase2-level test asserting that after wiring BOTH `applyShowSnapshot` (`phase2.ts:288`) AND `applyParseResult` (`:368`) receive the `overriddenParseResult` (the rebound local `parseResult`), not the original — spy both tx methods, assert the show/hotel fields they see are the OVERRIDDEN values. Fails until Step 6.2 rebinds `parseResult`.
Run → FAIL.

### Step 6.2 — Implement `overrideShowHotel` + `loadActiveOverrides` (tx-port read, `{data,error}`), wire before `applyShowSnapshot` (rebind the local `parseResult` to `overriddenParseResult` — makes the SYNC-1 wiring test pass). The wiring passes `overriddenParseResult` where `applyShowSnapshot`/`replaceHotelReservations` previously read `parseResult`; `showHotelSideEffects` is threaded to the Stage-B slot (Task 8). Run → PASS.

**Deliverable:** pure show/hotel transform green; wired before the snapshot writer; zero DB writes in Stage A.
**Commit:** `feat(sync): Stage-A pure overrideShowHotel transform (show/hotel) before applyShowSnapshot`

## Task 7 — §3.6 id-keyed crew reconciliation inside `applyParseResult` (post-hold, four-phase write)

**Spec:** §3.4, §3.6, §5.2, §14. **THE core correctness task.** **Files:**
- `lib/sync/reconcileCrewOverrides.ts` (NEW — the id-keyed algorithm)
- `lib/sync/applyParseResult.ts` (WIRE — after `planHoldAwareApply` returns `:112`, when a crew override is active, route through `reconcileCrewOverrides` instead of `deleteCrewMembersNotIn`/`upsertCrewMembers`; widen the `previousCrewMembers` snapshot select to include `selections_reset_at`)
- `tests/sync/reconcileCrewOverrides.test.ts` (NEW — pure-unit of the algorithm)

**Interfaces — Produces:** `reconcileCrewOverrides(args: { showId; postHoldCrew: CrewMemberRow[]; heldRetained: CrewMemberRow[]; protectedNames: Set<string>; heldNames: Set<string>; previousCrewMembers: PreviousCrewMember[]; activeCrewOverrides: ActiveOverride[] }): { writes: CrewWritePlan; crewSideEffects: OverrideSideEffect[]; sheetNameByFinal: Map<string,string|null> }` where `CrewWritePlan` is the ordered four-phase set: `{ deletes: string[/*id*/]; parks: {id:string}[]; inserts: FullCrewRow[]; finals: {id:string; row: FullCrewRow; sheetName: string|null}[] }`. **PURE plan** — the tx port executes it (Task 7.3).

The algorithm (spec §3.6 verbatim intent):
1. `prevByParsedIdentity: Map<parsedName,{id,name}>` from `previousCrewMembers` (parsedIdentity = active name override's `match_key` if the prev row has one, else `prevRow.name`).
2. Desired next = for each **post-hold member** (NOT held-retained — SYNC-4): the FULL parsed row (all mutable cols), only `name`→`displayName` (active name override output else parsedName) and `role`→`finalRole` (active role override else parsed role); `email` canonicalized (`lib/email/canonicalize.ts`); `id`/`claimed_via_oauth_at`/`selections_reset_at` preserved from the live row. **Held-retained members (removal-suppressed by a hold — the parse dropped them, so there is NO parsed row to rebuild) are NOT in desired-next; they are protected identities that classify as retain-no-write in step 4** (their live row, incl. any active override, is left exactly as-is — no update/park/final/side-effect).
3. **Collision resolution (step 1):** if two desired `displayName`s coincide, the OVERRIDE-derived one loses → `deactivate:'name_conflict'`, its `displayName` falls back to its own `parsedName`; re-check (bounded one pass). **If BOTH coinciding outputs are override-derived (SYNC-6), deactivate ALL override-derived members in that colliding group** — each falls back to its own `parsedName` (which are distinct, since only the override outputs coincided), a deterministic fail-closed resolution. **No name-only convergence (R23):** a vanished parsedIdentity is ALWAYS `target_missing` even if a same-named row appears — never silent re-key.
4. **Match & classify by id (step 2):** parsedName in prev+next → UPDATE by id (rename in place); next-only → INSERT (new id, incl. a new person whose name equals a retired override output — fresh id); prev-only → held/protected ? retain (no write, id preserved, override stays active) : DELETE by id + `deactivate:'target_missing'` for ALL override rows of that member (name AND sibling role).
5. **Four-phase order (R24):** deletes → park renamed survivors at `\x1f__reassign__' || id` → inserts (finals now free) → assign-finals (full parsed row, only name/role overridden, `sheet_name` = match_key when a name override active else NULL). **Inserted rows (`FullCrewRow`) carry `sheet_name` explicitly = NULL (SYNC-5): a next-only member is newly parsed and has no active name override** (a deactivated override is never reactivated — R23). Name-unchanged members still get a full-column UPDATE (refresh role/email/phone/flags/restrictions/flight_info/sheet_name).

### Step 7.1 — Failing pure-unit tests (`reconcileCrewOverrides.test.ts`)
Every assertion states its failure mode; expected ids/names derived from fixtures:
- **id stable** across apply/edit/release: same `id` in `finals` as `prevByParsedIdentity`.
- **collision (R11):** manufactured collision → override `deactivate:'name_conflict'` AND the pre-conflict id stays bound to its original parsed identity (never in `inserts`/reassigned).
- **R23 fail-closed convergence:** `Jon→John` override, next parse emits `John`, `Jon` gone → `deactivate:'target_missing'` (NOT re-key); a different `John` arriving → in `inserts` (fresh id); a name+role dual override on the vanished member → BOTH rows deactivated.
- **R29 full-column refresh:** on an override-active show, a member whose sheet `email`/`phone`/`role_flags`/`date_restriction`/`stage_restriction`/`flight_info` changed → the `finals` row carries the NEW values (only name/role overridden; email canonicalized; id/claimed_via_oauth_at/selections_reset_at preserved). Failure mode: dropping any mutable column.
- **R24 write order:** a two-member name-swap cycle (`A:Jon→John`, `B:John→Jon`), a runtime collision, and the R23 input each produce a `CrewWritePlan` whose phases (delete→park→insert→finals) are individually constraint-safe; a helper `assertNoTransientUniqueViolation(plan)` simulates sequential application and FAILS under a naive insert-before-park ordering.
- **post-hold only (R11):** the fn takes the hold plan as input; a test asserts `deactivate` decisions require `protectedNames`/`heldNames` (a held prev-only member is retained, NOT deactivated).
Run → FAIL.

### Step 7.2 — Implement `reconcileCrewOverrides` (pure). Run → PASS.

### Step 7.3 — Failing integration test `tests/sync/overrideApply.test.ts` (DB, two real sync runs) — RED FIRST (SYNC-1: test precedes the wiring/executor)
The §12 `overrideApply.test.ts` contract: id stable across TWO syncs through apply/edit/release; collision id-swap impossible; R23 fail-closed; R24 write-order commits (name-swap cycle, runtime collision, R23 input — all no `unique(show_id,name)` violation, asserted to FAIL under naive ordering); R29 full-column refresh; hotel matched by name across reorder; show dates/venue overridden; **crew `active=false` planned POST-HOLD (fails if decided before hold disposition)**; **stale deactivation surfaces via the inactive-row needs-attention stream even when the post-commit alert throws**; **stale-short-circuit sync leaves `admin_overrides` completely unchanged** (Stage A pure / Stage B applied-path-only); **the `activeCrewOverrides` reaching `applyParseResult` come from the single locked-tx `loadActiveOverrides` read, not a second query** (assert one read). Run → **FAILS** (routing + tx-port four-phase executor + `activeCrewOverrides` plumbing absent).

### Step 7.4 — Wire `applyParseResult` + tx-port executor + `activeCrewOverrides` plumbing → GREEN
(a) **`activeCrewOverrides` source (SYNC-2):** in `phase2.ts`, partition the single `loadActiveOverrides` result (Task 6, read once inside the locked tx) into show/hotel/crew; pass the **crew** partition as a new `activeCrewOverrides` arg on the `applyParseResult(tx, {...})` call (`phase2.ts:368`), extending the `applyParseResult` args type. (b) In `applyParseResult.ts`, after `planHoldAwareApply` (`:112`): if `activeCrewOverrides.length > 0`, call `reconcileCrewOverrides`, then execute the plan via new tx-port methods `crewDeleteByIds`, `crewParkAtSentinel`, `crewInsertFull`, `crewAssignFinals` (added to the `ApplyParseResultTx` interface + the `runScheduledCronSync.ts` tx implementation) IN THE FOUR-PHASE ORDER — SKIP the legacy `deleteCrewMembersNotIn`/`upsertCrewMembers` for this show; when `activeCrewOverrides.length === 0`, the legacy name-keyed path runs unchanged. Emit `crewSideEffects` to the Stage-B slot. Widen `previousCrewMembers` snapshot select to include `selections_reset_at`. (`provisionAddedCrewAuth`/`revokeRemovedCrewAuth` remain no-ops — auth table retired M9.5; §5.2.) Run Step 7.3 → **PASS**.

**Deliverable:** id-keyed crew reconciliation live; two-sync id-stability proven; four-phase order pinned.
**Commit:** `feat(sync): id-keyed parsed-identity crew reconciliation (four-phase write, post-hold) [§3.6]`

## Task 8 — Stage B `commitOverrideSideEffects` wiring + version-bump rules + hold-ordering test + matchKey durability + wizard-live-source

**Spec:** §3.2 Stage B, §3.3, §4.1 (version R30), §6. **Files:**
- `lib/sync/commitOverrideSideEffects.ts` (NEW — the ONLY writer of `admin_overrides` on the sync path)
- `lib/sync/phase2.ts` (WIRE — call at the `:380` post-apply slot, applied-path-only; pass show/hotel side-effects from Stage A + crew side-effects from §3.6)
- `tests/sync/overrideHoldOrdering.test.ts`, `tests/overrides/matchKeyDurability.test.ts`, `tests/overrides/wizardLiveSource.test.ts`, `tests/overrides/deactivationReason.test.ts` (NEW)

**Interfaces — Produces:** `commitOverrideSideEffects(tx, sideEffects: OverrideSideEffect[]): Promise<void>` — the `OverrideSideEffect` union is EXACTLY `{ overrideId: string; sheetValue: unknown } | { overrideId: string; deactivate: 'target_missing'|'name_conflict' }` (two variants; the sync NEVER reactivates — SYNC-3). For each: `sheetValue` refresh → `UPDATE admin_overrides SET sheet_value=$1, updated_at=now() WHERE id=$2` (**does NOT bump version** — R30 benign refresh); `deactivate` → `UPDATE admin_overrides SET active=false, deactivation_code=$1, version=version+1, updated_at=now() WHERE id=$2 AND active` (bumps version). **No reactivation side-effect exists on the sync path** (SYNC-3/R23 fail-closed: a vanished-then-reappeared target is NOT auto-reactivated — Doug re-points/discards; reactivation happens ONLY in the RPC via create-reactivate/repoint). `{data,error}` discipline on every call. Runs INSIDE the locked tx, applied-path-only (the slot at `phase2.ts:380` is unreachable on a stale short-circuit `:305-306`).

### Step 8.1 — Failing tests
`overrideHoldOrdering.test.ts` (§3.4 matrix, active `Jon→John`, live id X): (a) email/reconcile hold + `Jon` present → disposition follows RAW `Jon`, row `John`, id stable; (b) removal-suppression hold + parse omits `Jon` → row X retained as `John`, id stable, override NOT deactivated (R10); (c) genuine removal → deleted + deactivated stale. Failure modes: folding into ParseResult before hold planning; deferring the fold; protecting under the raw name (churns id).
`matchKeyDurability.test.ts` (§8.2a/§8.1): a role edit while a name override active persists under the parsed name + survives next sync; a hotel_address edit/create/revert while a hotel_name override active anchors via the live-name CAS; two same-name hotels at first-create each get the content-disambiguator matchKey; R26 sync-introduced hotel_name collision deactivates `name_conflict`; R27 multi-hotel composition survives stable-parse sync; `expectedCurrentValue` is raw loader-source (dates/venue no false-409).
`wizardLiveSource.test.ts` (R18): pending re-sync parse ≠ live row → the widget's CAS-B/value/`sheet_value` are the LIVE values, self-correcting to the pending parse after a simulated finalize/apply.
`deactivationReason.test.ts` (R12/R30): stale→`'target_missing'`, collision→`'name_conflict'` set IN the locked tx; needs-attention renders the correct reason even when `upsertAdminAlert` throws; alert lifecycle coherence (two paused same-code overrides collapse to one alert while surfacing two rows; last-cleared resolves the alert; stays open while ≥1 paused).
Run → FAIL (module absent / version bumped on benign refresh).

### Step 8.2 — Implement `commitOverrideSideEffects` + wire at `phase2.ts:380` (applied-path-only). Version-bump rules exactly per R30 (bump on deactivate/reactivate + mutation, NOT on benign sheet_value refresh). Run → PASS.

**Deliverable:** Stage B side-effects committed atomically on the applied path; version semantics + hold ordering + matchKey durability + wizard live-source + deactivation reason all green.
**Commit:** `feat(sync): Stage-B commitOverrideSideEffects + version-bump rules + stale/deactivation [§3.2/§6]`


# PHASE 4 — Crew-name visibility alias (the one reader exception, §3.5)

## Task 9 — `namesReferAny` + `getShowForViewer` alias set + thread `viewerNameAliases` through all 4 transport callers

**Spec:** §3.5, §12. **Files:**
- `lib/data/nameMatch.ts` (ADD `namesReferAny`)
- `lib/data/getShowForViewer.ts` (SELECT `sheet_name`; build `viewerNameAliases`; switch `hotelVisibleToViewer:103` to `namesReferAny`; project `viewerNameAliases` into the view-model)
- `lib/visibility/scopeTiles.ts` (`transportTileVisible:177` opts — add `viewerNameAliases: string[]`; switch `:192`/`:200` to `namesReferAny`)
- `components/crew/sections/ScheduleSection.tsx:103`, `TravelSection.tsx:172`, `VenueSection.tsx:129`, `TodaySection.tsx:219` (pass `data.viewerNameAliases`)
- `tests/crew/nameOverrideVisibilityAlias.test.ts` (NEW) + update existing transport/hotel visibility tests

**Interfaces — Produces:**
- `namesReferAny(ref: string, aliases: (string|null)[]): boolean` = `aliases.some(a => a != null && namesRefer(ref, a))` (`nameMatch.ts`).
- `getShowForViewer` view-model gains `viewerNameAliases: string[]` = `[name, ...(sheet_name ? [sheet_name] : [])]` (alongside existing `viewerName`). The crew lookup (`:285-305`) additionally selects `sheet_name`.
- `transportTileVisible(opts)` accepts `viewerNameAliases: string[]` (replacing the scalar `viewerName` for matching; keep `viewerName` if other branches need it, but the two `namesRefer` sites use `namesReferAny(ref, opts.viewerNameAliases)`).

### Step 9.1 — Failing test `nameOverrideVisibilityAlias.test.ts`
Real crew-page render (or `getShowForViewer` + `transportTileVisible` unit): a **surname-changing** override (`Jon Smith → Jon Smyth`, `sheet_name='Jon Smith'`) — the renamed viewer STILL sees (a) their own hotel reservation (`hotel_reservations.names[]` still `Jon Smith`), (b) their transport on ALL FOUR surfaces (Schedule tile, Travel ground-transport block, Venue parking, Today transport note). Each surface asserted independently — FAILS if that caller receives only `viewerName`. Plus a **first-name-only** override (`Jon Smith→John Smith`) regression proof: already matches via `namesRefer` surname compare (alias doesn't break the working case). Derive expected visibility from fixture names, never hardcode. Run → FAIL (aliases not threaded; some surfaces still scalar).

### Step 9.2 — Implement `namesReferAny`; add `sheet_name` to the select; build + project `viewerNameAliases`; switch the 3 match sites; update the 4 callers. Update existing transport/hotel visibility tests to pass an alias array (`[viewerName]` where no override). Run → PASS. Confirm no other reader matches by crew name (grep `namesRefer(` under `lib/visibility`, `lib/data` — only the 3 sites; identity is id-based at `resolvePickerSelection.ts:96`).

**Deliverable:** surname-changing name override keeps the renamed viewer's own transport + hotel visible on all 4 surfaces; additive-only; no `admin_overrides` read in the crew path.
**Commit:** `feat(crew-page): viewer name-alias set for renamed-crew visibility (§3.5)`

# PHASE 5 — Needs-attention 4th stream · admin-alert codes · telemetry

## Task 10 — 4th needs-attention derived stream (`admin_overrides where not active`) + page row + nav badge

**Spec:** §6 step 2, §9.4, §12. **Files:**
- `lib/admin/needsAttention.ts` (ADD `NeedsAttentionOverrideInput` type + `NeedsAttentionItem` variant `override_paused` + build logic in `buildNeedsAttention:231`, respecting `RENDER_CAP`/`PAGE_RENDER_CAP`)
- `lib/admin/loadNeedsAttention.ts` (ADD a `select … from admin_overrides where not active` joined to `shows`, read by the existing cookie-bound admin client under the `admin_only` RLS policy — no service-role plumbing; `.map` into the `buildNeedsAttention` call `:291`; extend `needsAttentionCount`)
- `tests/admin/needsAttentionOverride.test.ts` (NEW)

**Interfaces — Produces:** `NeedsAttentionOverrideInput = { overrideId; showId; slug; title; domain; field; matchKey; deactivationCode: 'target_missing'|'name_conflict' }`; a `NeedsAttentionItem` `override_paused` variant rendering **domain-aware copy from the durable `deactivation_code`** (§6 step 4): `target_missing` → "sheet no longer has «matchKey»"; `name_conflict` → "clashes with a real crew member" (crew) / "clashes with another hotel's name" (hotel). Offers re-point / discard (both → `set_field_override` variants).

### Step 10.1 — Failing test
An inactive override surfaces as BOTH a page row and a badge-count increment; copy derives from `deactivation_code` (not the alert); the row renders re-point/discard; cap behavior (`>RENDER_CAP` → truncation note). Run → FAIL.

### Step 10.2 — Implement type + build logic + query + count. The query uses the existing cookie-bound admin client (RLS `admin_only` confines rows to admins). Run → PASS.

**Deliverable:** durable inactive-row signal on page + badge; copy from durable column.
**Commit:** `feat(admin): needs-attention 4th stream for paused field overrides`

## Task 11 — Two admin-alert codes through §12.4 lockstep + auto-resolve lifecycle

**Spec:** §6 step 3, §10, §12. **Files (ONE commit — three-way lockstep):**
- `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§12.4 prose: 2 new rows `OVERRIDE_TARGET_MISSING`, `OVERRIDE_NAME_CONFLICT`, audience `doug`, + helpfulContext appendix) — **never run prettier on the master spec**
- `pnpm gen:spec-codes` → regen `lib/messages/__generated__/spec-codes.ts` (auto-populates `CODE_SCENARIOS` from `SPEC_CODES`)
- `lib/messages/catalog.ts` (2 rows, shape `{ code, resolution:"auto", audience:"doug", dougFacing, crewFacing:null, followUp, helpfulContext, title, longExplanation, helpHref:"/help/errors#OVERRIDE_..." }`, copy from §10 table)
- `lib/adminAlerts/upsertAdminAlert.ts:3` (union 36 → 38)
- `lib/adminAlerts/upsertAdminAlert.ts` best-effort emit at the **sync** deactivation post-commit path (Stage B, Task 8) + a NEW shared helper `lib/adminAlerts/resolveOverrideAlertsForShow.ts` wrapping `resolveAdminAlert.ts` auto-resolve
- `tests/messages/_metaAdminAlertCatalog.test.ts`, `tests/cross-cutting/codes.test.ts`, `tests/cross-cutting/extract-spec-codes.test.ts` (extended by the codes)

**Auto-resolve lifecycle (R30) — ONE shared helper, TWO post-commit call sites (R3b-7).** `resolveOverrideAlertsForShow(showId, code)` re-derives per (show, code): ZERO remaining `active=false` rows of that code → `resolveAdminAlert`; else leave open. It is invoked post-commit from **(1) the SYNC path** (Stage B, wired + tested HERE in Task 11) and **(2) the ADMIN-OP server action** (`discard`/`repoint`/`reactivate` that clears a paused row — wired + tested in **Task 14**, where the action exists; the RPC itself cannot emit post-commit, being in-tx). Task 11 owns the helper + codes + the sync-side wiring/test; the admin-op-side wiring/test is Task 14's deliverable (R3b-7 — a task cannot test a post-commit hook whose action is created two tasks later). Codes are **auto-resolve-only** (not in `INBOX_ROUTED_CODES` — the durable inactive-row stream already surfaces them; routing would double-list). Dedup is coarse per-(show,code) via `20260618000000...:47`.

### Step 11.1 — Failing lockstep test: run `pnpm test:audit:x1-catalog-parity` → FAILS (spec prose has the rows but catalog/generated lack them, or vice-versa). Also `_metaAdminAlertCatalog` fails (union member has no `dougFacing`). Record RED.
### Step 11.2 — Land all three lockstep surfaces + the union edit + the emit/resolve wiring in ONE commit. Re-run x1 + `_metaAdminAlertCatalog` → GREEN. Verify `tests/cross-cutting/codes.test.ts` + `extract-spec-codes.test.ts` pass. Confirm the two codes are NOT added to `INBOX_ROUTED_CODES`.
### Step 11.3 — SYNC-driven lifecycle test (folds into `deactivationReason.test.ts` from Task 8, or a new `tests/overrides/alertLifecycle.test.ts`): drive it through the **sync path only** (the action does not exist yet — R3b-7): two overrides paused by a sync → one unresolved alert + two rows; a later sync that clears the last paused row → alert resolved; stays open while ≥1 paused; every best-effort emit/resolve failure leaves the row stream correct (load-bearing). Assert `resolveOverrideAlertsForShow` is the single re-derivation point. Run → PASS. (Admin-op-driven resolution — discard/repoint/reactivate — is Task 14's lifecycle test.)

**Deliverable:** 2 admin-alert codes fully lockstepped; shared `resolveOverrideAlertsForShow` helper + sync-side best-effort coarse bell with auto-resolve; row stream authoritative.
**Commit:** `feat(admin): OVERRIDE_TARGET_MISSING/OVERRIDE_NAME_CONFLICT alerts (§12.4 lockstep + auto-resolve)`

## Task 12 — Four forensic `FIELD_OVERRIDE_*` codes (AUDITABLE_MUTATIONS + adminOutcomeBehavior)

**Spec:** §10, §11, §12. **Files:**
- `tests/log/_auditableMutations.ts` (ADD 4 rows `{ file:"app/admin/show/[slug]/_actions/overrides.ts", fn:"setFieldOverrideAction", code }` for `FIELD_OVERRIDE_SET`/`REVERTED`/`REPOINTED`/`DISCARDED`; register in the forensic-code set `NEW_FORENSIC_CODES:390` or `SANCTIONED_CODES:312`)

Note: forensic codes are NOT §12.4 rows / NOT in `catalog.ts` (precedent `archive.ts` `SHOW_ARCHIVED`). The action itself is written in Task 14 (per-op code mapping). This task **only pre-registers the static contract** — the registry rows + code-set entries. **The executable behavioral spy (`adminOutcomeBehavior.test.ts`) is NOT written here; it lands RED→GREEN inside Task 14** alongside the action (F4 — a task must not commit a knowingly-RED test across its boundary; invariant 1). The static meta-test `_metaMutationSurfaceObservability.test.ts` walks the filesystem, so a registry row referencing the not-yet-existent action file `app/admin/show/[slug]/_actions/overrides.ts` is inert (no discovered surface fails) — this task's commit is fully GREEN.

### Step 12.1 — Add the 4 registry rows + forensic-code-set entries. These are pure static data. Run `tests/log/_metaMutationSurfaceObservability.test.ts` + the registry's own assertions → the registry rows exist and reference the exact code literals the Task-14 action will emit; the filesystem walk sees no new admin surface yet (action file absent) → GREEN.
### Step 12.2 — Confirm the registry + code-set additions typecheck and the meta-test discovery walk parses cleanly. Run → all assertions PASS (nothing RED is committed; the behavioral proof is Task 14's deliverable).

**Deliverable:** forensic-code registry + code-set entries landed GREEN (the executable behavioral spy is written and made green in Task 14, with the action).
**Commit:** `test(log): register FIELD_OVERRIDE_* forensic codes (static registry)`


# PHASE 6 — UI (Opus + impeccable v3 dual-gate, invariant 8)

**All P6 tasks are Opus-owned UI.** Before writing any component, load `/impeccable` and run its preflight gates (PRODUCT.md → DESIGN.md → register → preflight signal). Every override error routes through `lib/messages/lookup.ts` (invariant 5 — no raw codes).

## Task 13 — `<OverrideableField>` shared component (§8.1, §8.5, §8.2 chip)

**Spec:** §8.1, §8.2, §8.5, §8.7. **Files:** `components/admin/overrides/OverrideableField.tsx` (NEW), `tests/components/overrides/OverrideableField.test.tsx` (NEW).

**Interfaces — Consumes** props exactly per §8.1 (`driveFileId, domain, field, matchKey, currentValue, expectedCurrentValue, override: OverrideState|null, currentOrdinal?, currentLiveHotelName?, disabled?`). **Produces** a client component that renders value + (active override) the `ChangeFeedBadge`-based "Overridden — sheet says «sheetValue»" chip + Edit/Revert; calls the server action (Task 14). Guard states (§8.5 table): `override===null` → value + Edit; `active` + non-null sheetValue → chip + Edit/Revert; `active` + null sheetValue → "Overridden — sheet has no value"; `active===false` → parsed value + muted "Override paused — sheet no longer has «matchKey»" + Re-point/Discard; `disabled` → read-only (+ first-seen "Fix in sheet / publish first" hint); empty/parsed-null no override → existing empty-state copy.

### Step 13.1 — Failing component tests: each of the 6 guard states renders the documented element; the chip DOM scan clones the row and `.remove()`s the value cell before asserting chip text (anti-tautology); a save error renders mapped copy (not a raw code); `expectedCurrentValue` is passed through to the action unchanged. Run → FAIL.
### Step 13.2 — Implement using `ChangeFeedBadge` (`bg-info-bg text-text-subtle` pill, §8.2) — NOT `DataQualityBadge`. Chip text `Overridden` with title/expander `sheet says "<sheetValue>"`. Run → PASS.

**Deliverable:** shared component with all guard states + chip.
**Commit:** `feat(admin): OverrideableField component (chip + guard states) [§8.1/§8.5]`

## Task 14 — Surface B: live-show admin blocks + `_actions/overrides.ts` (service-role client, post-commit telemetry)

**Spec:** §8.4, §11, §9. **Files:**
- `app/admin/show/[slug]/page.tsx` (WRAP crew rows `:709-745` name+role in `<OverrideableField>`; ADD net-new "Show details" block (dates+venue) + "Hotels" block (per-reservation hotel_name+hotel_address); load the live override state via a new loader reading `admin_overrides` for the show)
- `app/admin/show/[slug]/_actions/overrides.ts` (NEW server action `setFieldOverrideAction`)
- `lib/overrides/loadShowOverrides.ts` (NEW — reads `admin_overrides` + computes `matchKey`/`currentLiveHotelName`/`expectedCurrentValue` per §8.2a)
- `tests/log/adminOutcomeBehavior.test.ts` (NEW behavioral describe — WRITE it here (RED) and make it GREEN within this task, F4; a `setLogSink`/sink-spy asserting each per-op forensic code fires ONLY on the committed-success branch)
- `tests/overrides/adminOpAlertLifecycle.test.ts` (NEW — R3b-7 admin-op-driven auto-resolve, written + GREEN here)

**Server action (`setFieldOverrideAction`)** — thin, per §8.4: `requireAdminIdentity()` gate → canonicalize actor email via `lib/email/canonicalize.ts` → delegate to `lib/overrides/setFieldOverride.ts` (service-role client — NOT cookie client; §8.4 critical) → on `ok`, **post-commit** (a) `logAdminOutcome({ code: mapOpToCode(op), source:"admin.show.overrides", actorEmail, driveFileId, showId })` (per-op: upsert→SET, revert→REVERTED, repoint→REPOINTED, discard→DISCARDED); (b) **`resolveOverrideAlertsForShow(showId, "OVERRIDE_TARGET_MISSING")` AND `(…, "OVERRIDE_NAME_CONFLICT")`** (R3b-7 — a discard/repoint/reactivate that cleared the last paused row of a code resolves its bell; best-effort, idempotent, outside any tx); (c) `revalidateShow`. **NO inline `.rpc` in the action** (deadlock rule `feed.ts:10-14`) — the RPC call lives in the helper. `mapRpcOutcome`-shaped result surfaces to the client; a 409 renders mapped stale-review copy (invariant 5).

**`matchKey` derivation (§8.2a, R17)** in `loadShowOverrides`: crew → `sheet_name ?? name`; hotel → active override's stored `match_key`, else the SAME name+disambiguator `match_key` as §5.3 for same-name groups (NOT plain `hotel_name`); show → `''`. Pass `currentLiveHotelName` + advisory `currentOrdinal`. `expectedCurrentValue` = RAW loader-source jsonb (R17), not rendered text.

### Step 14.1 — Failing tests: the action gates on `requireAdminIdentity`; uses the service-role client (assert via injected dep, not cookie client); the NEW `adminOutcomeBehavior` behavioral spy (written here) asserts each per-op forensic code fires post-commit ONLY on the committed-success branch — RED until 14.2 wires the action; a 409 surfaces mapped copy. `loadShowOverrides` derives `matchKey`/`expectedCurrentValue` from source not display (fold `matchKeyDurability` assertions where they touch the loader). Run → FAIL.
### Step 14.2 — Implement the action + loader + the two net-new blocks + crew-row wrap + the two post-commit `resolveOverrideAlertsForShow` calls. Run → PASS. Run `tests/log/adminOutcomeBehavior.test.ts` + `_metaMutationSurfaceObservability.test.ts` → GREEN (admin surface fully covered).
### Step 14.3 — Admin-op alert lifecycle test (`adminOpAlertLifecycle.test.ts`, R3b-7): a sync pauses an override (bell open); the admin then **discards** (or **repoints**, or **reactivates via create**) the last paused row of that code → the post-commit path resolves the bell; while ≥1 paused row of the code remains, the bell stays open; a best-effort resolve failure leaves the durable row stream correct. Run → PASS.

**Deliverable:** Surface B live-show editing for all 6 fields; admin-surface telemetry complete.
**Commit:** `feat(admin): live-show override surface + setFieldOverrideAction (service-role, post-commit telemetry)`

## Task 15 — Surface A: review wizard override widget (LIVE-source, show-exists gate, R18/R15)

**Spec:** §8.3, §12. **Files:**
- `components/admin/wizard/step3ReviewSections.tsx` (WRAP `VenueBreakdown:787` → venue; `CrewBreakdown:1118` → per-member name+role; hotels section body → hotel_name+hotel_address; date row → dates — each in `<OverrideableField>`)
- the wizard data plumbing that feeds `<OverrideableField>` its `currentValue`/`expectedCurrentValue`/`override` from the **LIVE** `loadShowOverrides` loader (Task 14), NOT the pending `SectionData`
- `tests/overrides/wizardLiveSource.test.ts` (satisfy — from Task 8)

**R18 critical:** the widget's value/CAS-B/override-state come from the LIVE loader; the pending `SectionData` parse is **review context only** (drives the surrounding old→new diff). **R15 gate:** the edit affordance is enabled only when the show already has a `shows` row (`disabled` derived from show existence); a genuinely first-seen show renders read-only + the "Overrides become available after you publish this show — until then, correct values in the sheet and Re-sync" hint.

### Step 15.1 — Failing test: for an already-live show with pending re-sync parse ≠ live row, the widget receives LIVE values (assert CAS-B == live field, `sheet_value` == live not pending); a first-seen show (no `shows` row) renders `disabled` + the hint. (Most of this is `wizardLiveSource.test.ts` from Task 8 — here it is wired to the actual wizard component.) Run → FAIL.
### Step 15.2 — Implement the wrap + LIVE-source plumbing + show-exists gate. Run → PASS.

**Deliverable:** wizard inline editing for already-live shows, LIVE-sourced; first-seen gated with hint.
**Commit:** `feat(admin): wizard override widgets (LIVE-source, show-exists gate) [§8.3]`

## Task 16 — Layout-dimensions (real-browser Playwright) + Transition-audit tasks

**Spec:** §8.6, §8.7. **Files:** `tests/components/overrides/OverrideableField.layout.spec.ts` (Playwright), `tests/components/overrides/OverrideableField.transitions.test.tsx`.

### Step 16.1 — Layout (real browser, §8.6 Dimensional Invariants):
> The chip + edit affordance sit inside `FieldRowList`'s `grid-cols-[7.5rem_minmax(0,1fr)]` row (`step3ReviewSections.tsx:283`). The value cell (`minmax(0,1fr)`, `min-w-0`) must contain value + chip + affordance without horizontal overflow; the chip wraps below the value on narrow widths (flex-wrap).

Real-browser assertion (Playwright — jsdom insufficient per Tailwind-v4-no-default-stretch): render `<OverrideableField>` with a LONG override value inside a `FieldRowList` row at **375px** and **1280px**; `getBoundingClientRect()` on the value cell (`data-testid="override-value-cell"`) asserts `cell.width <= track.width + 0.5` (no overflow) and the row does not scroll horizontally (`scrollWidth <= clientWidth + 0.5`). Derive the track width from the rendered grid, not a hardcoded px. Run → assert RED first (add the testid + measure), then GREEN.

### Step 16.2 — Transition-audit (§8.7): enumerate every `AnimatePresence`/ternary/conditional in `OverrideableField`; assert each state-pair is either instant (per the §8.7 table — all instant) or has explicit `exit`/`initial`/`animate`; test the **compound** path: editing while a background sync bumps `version` → save → RPC CAS 409 → inline "This field changed since you opened it — reload" (mapped copy, no raw code). Run → GREEN.

**Deliverable:** real-browser dimensional invariant + transition inventory pinned.
**Commit:** `test(admin): OverrideableField real-browser layout + transition audit [§8.6/§8.7]`

## Task 17 — Impeccable v3 dual-gate on the UI diff (invariant 8)

**Spec:** invariant 8; AGENTS.md. **Not a code task — the UI evaluation gate.**
1. Run `/impeccable critique` on the P6 UI diff (Tasks 13–16) with the canonical v3 preflight gates. Record findings.
2. Run `/impeccable audit` on the same diff. Record findings.
3. Every HIGH/CRITICAL finding is fixed (new commit) OR explicitly deferred via a `DEFERRED.md` entry with rationale. External attestation (not self-attested) per the dual-gate contract.
4. Record findings + dispositions in the milestone handoff §12 (or this plan's close-out note).

**Deliverable:** dual-gate passed; HIGH/CRITICAL resolved or deferred; external attestation recorded. Runs BEFORE the cross-model adversarial review (Task 18).
**Commit (if fixes):** `fix(admin): impeccable dual-gate findings on override UI` (else a docs-only DEFERRED.md commit).

---

## Fix-round regression budget (mandatory per AGENTS.md)

When a fix in any review round patches surface S for class C, the next-round prep MUST: (a) re-grep class C across S after the patch; (b) confirm the relevant meta-test still passes; (c) note both in the round closure. **Highest-risk classes for this milestone** (grep the SHAPE, not the instance):
- **Advisory-lock topology** — any new `pg_advisory*` or `.rpc("set_field_override")` call site: re-run `advisoryLockRpcDeadlock.test.ts`; confirm the JS action still never locks (single-holder). M5 R20 was a CRITICAL deadlock from patching a lock hole on a surface that already had a wrapper.
- **Name-keyed crew writes** — grep `deleteCrewMembersNotIn|upsertCrewMembers` reachable when a crew override is active: MUST be bypassed (id-keyed path only). A regression here reintroduces the R7/R10/R11 id-churn class.
- **Four-phase write order** — any edit to `reconcileCrewOverrides`: re-run the `assertNoTransientUniqueViolation` order test.
- **`sheet_value` recapture on edit** (R7) / **version bump on benign refresh** (R30) — grep `sheet_value` writes + `version=version+1`: confirm edit preserves sheet_value and benign refresh does NOT bump version.
- **Same-vector recurrence** — if 3 consecutive rounds hit the same vector (crew identity, hotel dup-name, CAS), do the comprehensive re-analysis: read §3.6/§5.3/§7 end-to-end, enumerate every requirement, audit the diff against the full checklist BEFORE the next review; ship structural defenses (meta-tests) in that round's repair commit (M12 R5 calibration).

## Class-sweep before patching (mandatory)

On every adversarial finding, grep the codebase for the same bug SHAPE before patching the named instance. Structural meta-tests walk every file in the subtree (not a named list) — `no-inline-email-normalization` walks `lib/sync`; `_metaMutationSurfaceObservability` filesystem-walks admin surfaces; `postgrest-dml-lockdown` bidirectional-parity walks REVOKEs.

---

## Task 18 — Self-review → Adversarial review (cross-model) → whole-diff → CI → close-out

**MANDATORY** per AGENTS.md writing-plans additions. Between self-review and execution handoff:

### Self-review
Full-suite verification before push (scoped gates miss regressions — run ALL):
- `pnpm test` (full — a shared-chokepoint change can break dozens of tests scoped gates miss)
- `pnpm typecheck` (vitest strips types; `next build`/quality-tsc catches TS errors vitest won't — e.g. `tx.unsafe` is `unknown[]`, use `RETURNING`+`.length`)
- `pnpm lint` (CI `quality` runs eslint; canonical-Tailwind ERROR class)
- `pnpm format:check` (`--no-verify` bypasses the prettier hook; CI Format check fails otherwise) — **never prettier the master spec** (§12.4 x1 divergence)
- `pnpm test:audit:x1-catalog-parity` (the 2 new admin-alert codes) + `tests/messages/_metaAdminAlertCatalog.test.ts`
- the advisory-lock + auditable-mutation + DML-lockdown + validation-schema-parity + no-inline-email + infra-contract meta-tests
- Verify `origin/main` hasn't advanced mid-arc (stale-base misread): `git fetch && git rebase origin/main` + re-diff BEFORE review/Codex/push.

### Impeccable dual-gate (Task 17) recorded — external attestation.

### Adversarial review (cross-model)
Invoke the `adversarial-review` skill → Codex; iterate to APPROVE (autonomous-ship: no round budget). Brief MUST include `REVIEWER ONLY` + a fresh-eyes posture + an `EXPLICITLY DO NOT RELITIGATE` block pre-loaded from spec §15 Watchpoints (cite `file:line`): pre-write transform not post-write (§3.1); picker_epoch not bumped (watchpoint 2); deactivate-not-delete (3); no auth-table write M9.5-retired (4); the crew-name visibility alias is the ONE bounded reader exception (5); id-keyed §3.6 reconciliation not name-keyed (5a); four-phase write order (5d); read-side alias not write-side ref rewrite (5b); crew-name accepted high-complexity (5c); `\x1f` hotel delimiter (6); hotel fail-closed on all 3 paths (6a); hotel_name FINAL-name collision (6b); email excluded (7); wizard requires `shows` row + LIVE-source (8/8a); create is UPSERT-reactivate (11/R28); full-parsed-row crew write (12/R29); version-CAS not sheet_value-CAS (9); active crew-name repoint disallowed (10/R25). Inline every load-bearing principle (memory files are invisible to Codex).

### Whole-diff Codex cross-model review to APPROVE (fresh-eyes).

### Push → real CI green → merge → sync main
Push (`--no-verify`) → verify **real CI green** (not just local — local-passes-CI-fails is its own class; `gh pr checks <PR#> --watch`, confirm `mergeStateStatus==CLEAN`) → `gh pr merge --merge` → fast-forward local `main` (verify `git rev-list --left-right --count main...origin/main` == `0  0`).

(This task carries no code; it is the process gate. Do NOT run adversarial review during plan authoring — it runs at execution time.)

---

## Test → spec → invariant mapping (coverage check)

| Spec §12 test surface | Task | Key invariant / R-finding |
|---|---|---|
| `setFieldOverrideGrants` (grant/RLS/CHECK) | 1, 3 | PostgREST lockdown, RLS admin_only |
| `postgrest-dml-lockdown` `admin_overrides` row | 1 | DML lockdown |
| `validation-schema-parity` (table + column) | 2 | validation parity |
| `advisoryLockRpcDeadlock` (RPC single-holder) | 3 | invariant 2 |
| `setFieldOverride.test.ts` (full RPC matrix) | 4 | R6/R7/R14/R15/R16/R17/R19/R20/R25/R28/R29 |
| `validateOverrideValue` / `matchOverrideTarget` | 5 | §7.4 guards, §5.3 fail-closed |
| `overrideShowHotel` (Stage A pure) | 6 | R16/R26/R27, Stage-A purity |
| `reconcileCrewOverrides` + `overrideApply` | 7 | §3.6, R11/R23/R24/R29, id-stability |
| `commitOverrideSideEffects` + `overrideHoldOrdering` + `matchKeyDurability` + `wizardLiveSource` + `deactivationReason` | 8 | §3.2/§3.4/§6, R10/R12/R18/R30 |
| `nameOverrideVisibilityAlias` | 9 | §3.5 (all 4 surfaces) |
| `needsAttentionOverride` (page + badge) | 10 | §6 step 2 durable signal |
| §12.4 lockstep + `_metaAdminAlertCatalog` + alert lifecycle | 11 | §10, R30 auto-resolve |
| `_auditableMutations` + `adminOutcomeBehavior` (4 forensic) | 12, 14 | invariant 10 |
| `OverrideableField` guard states + chip | 13 | §8.1/§8.5 |
| Surface B action + loader (service-role, telemetry, matchKey) | 14 | §8.4, invariant 9/10, R17 |
| Surface A wizard (LIVE-source, show-exists gate) | 15 | §8.3, R15/R18 |
| real-browser layout + transition audit | 16 | §8.6/§8.7 |
| impeccable dual-gate | 17 | invariant 8 |

Every §12 meta-test (Extends + Creates) and every R-finding has a home. No orphan tests; no orphan tasks.

## Task checklist

- [ ] P1 — Task 1 (migration + lockdown), Task 2 (manifest + validation)
- [ ] P2 — Task 3 (RPC), Task 4 (helper + matrix)
- [ ] P3 — Task 5 (helpers), Task 6 (Stage A), Task 7 (§3.6 crew), Task 8 (Stage B + version + hold-ordering)
- [ ] P4 — Task 9 (visibility alias)
- [ ] P5 — Task 10 (needs-attention), Task 11 (alert codes), Task 12 (forensic codes)
- [ ] P6 — Task 13 (component), Task 14 (Surface B), Task 15 (Surface A), Task 16 (layout+transition), Task 17 (impeccable dual-gate)
- [ ] **Self-review** (Task 18 — full suite, typecheck, lint, format, meta-tests, rebase-on-main)
- [ ] **Adversarial review (cross-model)** (Task 18 — Codex to APPROVE, no round budget, do-not-relitigate from §15)
- [ ] Whole-diff Codex cross-model review to APPROVE
- [ ] **Execution handoff** — push → real CI green → `gh pr merge --merge` → fast-forward local main
