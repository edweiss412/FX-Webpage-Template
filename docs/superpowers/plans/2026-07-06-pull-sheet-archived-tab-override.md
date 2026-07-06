# Plan — Pull-sheet on archived ("OLD") tabs: detect + in-app override

**Spec:** `docs/superpowers/specs/2026-07-06-pull-sheet-archived-tab-override.md` (APPROVE, 12 rounds)
**Slug:** `pull-sheet-archived-tab-override`
**Branch / worktree:** `feat/pull-sheet-archived-tab-override` @ `/Users/ericweiss/fxav-worktrees/pull-sheet-archived-tab`
**Implementer:** Opus / Claude Code (UI surface → Opus-only per ROUTING hard rule).

---

## Pre-draft verification notes (stale-citation corrections)

Every task below cites live-verified `file:line`. The following spec/prompt citations were **stale or imprecise** against the live worktree and are corrected here (do NOT silently diverge — use the corrected forms in tasks):

1. **§12.4 catalog-parity test path.** Spec §13 + AGENTS.md say `tests/messages/codes.test.ts`. **Does not exist.** Live path is **`tests/cross-cutting/codes.test.ts`** (+ `tests/cross-cutting/extract-spec-codes.test.ts`). `pnpm gen:spec-codes` runs `scripts/extract-spec-codes.ts` (`package.json:22`). The x1 gate is `test:audit:x1-catalog-parity` (`package.json:31`) → `vitest run tests/cross-cutting/codes.test.ts tests/cross-cutting/extract-spec-codes.test.ts`.
2. **Advisory-lock single-holder contract test path.** Prompt/MEMORY reference `tests/auth/_advisoryLockSingleHolderContract.test.ts`. **Not in `tests/auth/`.** Live path is **`tests/sync/_advisoryLockSingleHolderContract.test.ts`**. The deadlock-topology pin `tests/auth/advisoryLockRpcDeadlock.test.ts` DOES exist. Task 8 extends BOTH.
3. **`PackListBreakdown` definition line.** Spec cites `:2599`/`:2604` (those are the section-registry render call sites: `label: "Pack list"` at `:2599`, `render: (s) => <PackListBreakdown .../>` at `:2604`). The **component definition** is `step3ReviewSections.tsx:1313`; `"No pack list parsed."` is at `:1323`; the section DTO field `pullSheet: PullSheetCase[]` is at `:2053`.
4. **`source_anchors` → `shows` propagation site.** Spec §5.5 says "exactly as `source_anchors` is propagated"; the live propagation is in **`lib/sync/applyStagedCore.ts:434`** and the first-seen INSERT threads `sourceAnchors` at `applyStagedCore.ts:~1152-1155` — NOT `applyRescanDecisionUnderLock.ts`. Flow A propagation Task 9 patches `applyStagedCore.ts`.
5. **Shadow payload does NOT currently carry `source_anchors`.** `lib/onboarding/shadowPayload.ts` has zero `source_anchors` refs; source_anchors is persisted at scan to `pending_syncs` and read live by finalize (`finalize/route.ts:911,918,971`). So Flow B carrying `pull_sheet_override` + `pull_sheet_override_applied` in `shows_pending_changes.payload` (spec §5.5) is **genuinely new plumbing** — there is no existing shadow field to mirror one-to-one. Task 9 builds it.
6. **`ParseResult` is assembled in `lib/sync/enrichWithDrivePins.ts:~387-400`** (the `const result: ParseResult = {...}` builder; file is 423 lines). Adding `archivedPullSheetTabs` to the `ParseResult` shape (Task 4) requires patching this builder plus every other `ParseResult` producer (class-sweep in Task 4).
7. **Route admin gates differ.** `rescan-sheet/route.ts:56` uses `requireAdmin()` (void). `finalize/route.ts:202-203` uses `requireAdminIdentity()` (`{email}`). The new accept/revoke route (Task 8) needs the actor email for `logAdminOutcome`, so it uses **`requireAdminIdentity`**.
8. **In-RPC session guard precedent** is `app_settings.pending_wizard_session_id` validated against the passed session id (`rescanWizardSheet.ts:103-115`). The RPC's in-body guard (5.4) mirrors this.

All other spec citations verified accurate (exporter `:206`/`:222`, `pull-sheet.ts:33/59-60/92/125/151`, `types.ts:4/210-217/378/404`, `dataGaps.ts:30/69/85`, `fetch.ts:497/614`, `showDayTimeAnchors.ts:58-60`, `logAdminOutcome.ts:27`, `_auditableMutations.ts:13`, migration precedents).

---

## Goal

Un-silence the exporter's `/\bOLD\b/i` worksheet drop when the archived tab actually contains a pull-sheet block, and give admins an in-app, content-pinned, per-show override to include exactly that tab's pull-sheet case regions — without editing the Google Sheet and without ever letting stale/swapped gear silently publish. Default stays skip; the anti-contamination guard (DEF-2) is preserved for every non-accepted tab.

## Architecture (from spec §5)

- **Detection (exporter):** `synthesizeMarkdownFromXlsx(buffer, opts?)` returns `{ markdown, archivedPullSheetTabs }`. For every OLD tab, detect pull-sheet **case regions** (header row where all cells contain "PULL SHEET", through `collectDataBlock`'s span), record one `ArchivedPullSheetTab` with per-region `headerPreviews[]` + a SHA-256 `fingerprint` over all emitted regions. `opts.includePullSheetFromTab` un-skips exactly one tab's pull-sheet regions (rooms/other blocks discarded). `showDayTimeAnchors.ts` stays unconditionally OLD-skipping.
- **Sync layer:** reads the row's `pull_sheet_override`, threads `includePullSheetFromTab`, emits `PULL_SHEET_ON_ARCHIVED_TAB` warnings for `included:false` tabs, compares the `included:true` tab's returned fingerprint (mismatch → discard-and-rerun + auto-clear + `PULL_SHEET_OVERRIDE_CONTENT_CHANGED`), persists `archivedPullSheetTabs` into the staged envelope, and writes `pull_sheet_override_applied` atomically with every staged parse under the `show:` lock.
- **Override storage:** nullable `jsonb` `pull_sheet_override` on `pending_syncs` + `shows`; nullable `jsonb` `pull_sheet_override_applied` on `pending_syncs` only.
- **Accept/revoke:** admin route → `set_pull_sheet_override` SECURITY DEFINER RPC (holds `show:` lock, service-role-only, in-RPC session guard). Compare-and-set against the reviewed `expectedFingerprint`.
- **Publish propagation:** Flow A (pending_syncs→shows), Flow B (existing-show shadow payload→shows), each with a finalize consistency gate; Flow C (live cron deferred apply) gates against durable `shows.pull_sheet_override`.
- **Step-3 UI:** `PackListBreakdown` S1–S4 states driven by `(pr.pullSheet, pr.archivedPullSheetTabs, override-active)`.

## Tech stack

Next.js 16, React 19, TypeScript (strict), Supabase Postgres (postgres.js `tx.unsafe`, SECURITY DEFINER RPCs), Vitest + jsdom + Testing Library, Tailwind v4. No new dependencies.

## Global constraints (copied verbatim from spec §5.10 — the I1–I7 invariant set; every task preserves all seven)

- **I1 — One unit.** Emitted ≡ hashed ≡ parsed ≡ reviewed content: the set of pull-sheet **case regions** (header + `collectDataBlock` items). No path may emit, hash, or review a different slice than the others.
- **I2 — Reviewed = all of it.** The admin is shown *every* emitted region's header (`headerPreviews[]`). A hash never substitutes for reviewable content.
- **I3 — Accept pins only reviewed content.** Accept is compare-and-set: server fresh-detect must equal the persisted `expectedFingerprint` the admin reviewed; any drift between render and click → reject + re-prompt.
- **I4 — Publish gate uses the desired override.** At finalize under the `show:` lock, `applied` must equal `overrideSnapshot(desired)` — Flow A the live `pending_syncs` override, Flow B the payload-carried override; never the stale durable `shows` value.
- **I5 — No stale parse is ever staged OR applied.** Guards under the `show:` lock: (a) override-**row** drift vs the pre-lock snapshot → refuse-and-retry; (b) sheet-**content** drift under an unchanged override → discard-and-rerun: clear override, **re-parse WITHOUT inclusion and stage THAT** (drops only the changed OLD-tab gear, **preserves any current non-OLD pull sheet** — plan-R4/R5; NOT force-emptied), `applied=null`; (c) deferred-apply snapshot gate at apply for ALL three stage-then-apply paths — Flow A/B wizard + Flow C live cron. A changed/mismatched **OLD-tab** gear never yields a staged OR applied `pullSheet` (current non-OLD gear is untouched).
- **I6 — Durable on both flows.** The accepted override reaches `shows.pull_sheet_override` on Flow A and Flow B; cron reads it so accepted gear survives and revoked gear stays gone.
- **I7 — Write surface is locked down.** `set_pull_sheet_override` is service-role-only + in-RPC session-guarded; direct PostgREST callers cannot set/clear overrides.

Plus plan-wide AGENTS.md invariants: #2 advisory-lock single-holder, #5 no-raw-error-codes (all copy via `lib/messages/lookup.ts`), #8 impeccable UI dual-gate, #9 Supabase `{data,error}` call-boundary, #10 mutation-surface instrumentation, TDD-per-task (#1), commit-per-task (#6).

---

## Meta-test inventory (what this milestone CREATES / EXTENDS)

| Meta-test | Action | Task |
|---|---|---|
| `set_pull_sheet_override` grant-lockdown (`execute` revoked from `public`/`anon`/`authenticated`, granted `service_role`) | **NEW** — modeled on the postgrest-dml-lockdown structural pins | Task 1 |
| `tests/auth/advisoryLockRpcDeadlock.test.ts` (deadlock topology) | **EXTEND** — add `set_pull_sheet_override` as a `show:`-keyed holder | Task 8 |
| `tests/sync/_advisoryLockSingleHolderContract.test.ts` (single-holder) | **EXTEND** — RPC-only holder; JS route does NOT take the lock | Task 8 |
| `tests/cross-cutting/codes.test.ts` + `tests/cross-cutting/extract-spec-codes.test.ts` (§12.4 catalog parity) | **EXTEND** — 2 new rows (`PULL_SHEET_ON_ARCHIVED_TAB`, `PULL_SHEET_OVERRIDE_CONTENT_CHANGED`) | Task 5 |
| `tests/log/_auditableMutations.ts` (`AUDITABLE_MUTATIONS`) + `tests/log/adminOutcomeBehavior.test.ts` | **EXTEND** — accept/revoke route rows + success-branch behavioral proof | Task 8 |
| `lib/parser/dataGaps.ts` `GAP_CLASSES` + its drift guard | **EXTEND** — `PULL_SHEET_ON_ARCHIVED_TAB` gap class | Task 4 |
| Supabase call-boundary registry (`_metaInfraContract`) | **NO new surface** — the new route/RPC caller uses standard `{data,error}` destructuring; add inline `// not-subject-to-meta:` where the helper is not an auth helper, or a registry row if applicable | Task 8 |
| sentinel-hiding / `admin_alerts.upsert` catalog | **N/A** — no `admin_alerts.upsert`; declared not-applicable | — |

---

## Advisory-lock holder topology (mandatory — spec §5.7, AGENTS.md invariant 2)

Hashkey space touched: `hashtext('show:' || drive_file_id)`.

| Holder | Layer | Existing / New | Notes |
|---|---|---|---|
| `rescanWizardSheet` locked tx | JS `tx.unsafe(...pg_advisory_xact_lock(hashtext('show:'||$1))...)` | Existing — `lib/onboarding/rescanWizardSheet.ts:170` | Pre-lock export at `:99-139`; the override read + snapshot re-read (5.7) happen around this holder. NOT nested. |
| `applyStagedCore` / `applyRescanDecisionUnderLock` apply | JS `show:` lock (existing) | Existing | Flow A/B finalize gate (5.8) runs inside this holder. Propagation write to `shows` (Task 9) is inside it. |
| `set_pull_sheet_override` RPC | in-RPC `perform pg_advisory_xact_lock(hashtext('show:'||p_drive_file_id))` | **NEW holder** | **Single-holder = RPC only.** The JS route (Task 8) does NOT take the `show:` lock — it calls the RPC which is the sole holder for that call. Never nested under a JS-side `show:` lock (M5 R20 deadlock class). |
| `upsertLivePendingSync` (Flow C stage) / `readLivePendingSyncForApply` (Flow C apply) | JS `show:` lock (existing cron/apply tx) | Existing | `pull_sheet_override_applied` written with the staged parse under this lock (Task 10). |

**Resolution:** each hashkey is locked at exactly one layer per call. The new RPC is a standalone holder (matches the `revoke_leaked_link_atomic` precedent, `supabase/migrations/20260504000004_...sql:27` `perform pg_advisory_xact_lock(hashtext('show:'||...))`). Task 8 EXTENDS `advisoryLockRpcDeadlock.test.ts` (RPC-holds-lock proof) and `_advisoryLockSingleHolderContract.test.ts` (route-does-not-lock proof).

---

## Layout / transition tasks — explicitly NOT required

- **No real-browser layout task.** Per spec §11: `PackListBreakdown` is flow content inside the section card, not a fixed-dimension parent with flex/grid children needing stretch guarantees. No `getBoundingClientRect` parent==child assertion is added. (Stated so it is not added reflexively.)
- **No transition-audit task.** Per spec §10: S1–S4 are content swaps on re-fetch after a re-scan (instant re-renders); no `AnimatePresence`/`exit`/`initial` obligations. The 6 state-pairs are all "instant — re-render" or unreachable. (Stated so it is not added reflexively.)

---

## Anti-tautology test rules (apply to every test task)

- Assert against **data inputs**, not the rendering container: fingerprint/emission tests assert against `archivedPullSheetTabs` / `synthesizeMarkdownFromXlsx(...).markdown`, never against a container that renders both.
- **Derive expected values from fixture cell edits**, never hardcode a SHA-256 hex. A cosmetic-only reformat must yield `===` to the pre-edit fingerprint; a QTY/ITEM/header edit must yield `!==` — computed by mutating the fixture, not by pasting a digest.
- Every test task states the **concrete failure mode** it catches (mapped to §15 test numbers).
- Step-3 DOM tests: scope DOM scans to the Pack list section — clone the tree and `.remove()` sibling sections that independently render a tab name before asserting.

---

# TASKS

## Task 1 — Migration: 3 columns + `set_pull_sheet_override` RPC + grant lockdown + grant meta-test

**Spec:** D3, D8, §8, §5.4. **Files:**
- `supabase/migrations/20260706000000_pull_sheet_override.sql` (NEW)
- `tests/db/setPullSheetOverrideGrants.test.ts` (NEW — grant meta-test)

**Interfaces — Produces:**
- `public.pending_syncs.pull_sheet_override jsonb` (nullable, default `null`)
- `public.shows.pull_sheet_override jsonb` (nullable, default `null`)
- `public.pending_syncs.pull_sheet_override_applied jsonb` (nullable, default `null`)
- RPC `public.set_pull_sheet_override(p_drive_file_id text, p_wizard_session_id uuid, p_tab_name text, p_fingerprint text, p_accepted_by text, p_expected_override_snapshot jsonb) returns jsonb` (row-state CAS on `p_expected_override_snapshot` under the lock — Codex plan-R3-1)

### Step 1.1 — Failing grant meta-test

`tests/db/setPullSheetOverrideGrants.test.ts` (runs against `$TEST_DATABASE_URL`; gated `describe.skipIf(!process.env.TEST_DATABASE_URL)` matching sibling `tests/db/*` suites):

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("set_pull_sheet_override grant lockdown", () => {
  let sql: ReturnType<typeof postgres>;
  beforeAll(() => { sql = postgres(url!, { max: 1 }); });
  afterAll(async () => { await sql.end(); });

  it("revokes execute from public/anon/authenticated, grants service_role", async () => {
    const rows = await sql<{ grantee: string }[]>`
      select grantee from information_schema.role_routine_grants
      where routine_name = 'set_pull_sheet_override' and privilege_type = 'EXECUTE'`;
    const grantees = new Set(rows.map((r) => r.grantee));
    expect(grantees.has("service_role")).toBe(true);
    expect(grantees.has("authenticated")).toBe(false);
    expect(grantees.has("anon")).toBe(false);
    expect(grantees.has("PUBLIC")).toBe(false);
  });

  it("both override columns and the applied column exist with the right nullability/default", async () => {
    const cols = await sql<{ table_name: string; column_name: string; is_nullable: string; column_default: string | null }[]>`
      select table_name, column_name, is_nullable, column_default
      from information_schema.columns
      where (table_name = 'pending_syncs' and column_name in ('pull_sheet_override','pull_sheet_override_applied'))
         or (table_name = 'shows' and column_name = 'pull_sheet_override')`;
    expect(cols).toHaveLength(3);
    for (const c of cols) { expect(c.is_nullable).toBe("YES"); expect(c.column_default).toBeNull(); }
  });

  // Codex plan-R2-3: the new override columns are only safe if the HOST tables already
  // deny direct PostgREST DML — else anon/authenticated could UPDATE pull_sheet_override
  // directly, bypassing the RPC's admin auth + fingerprint CAS + advisory lock. Both tables
  // are already locked down (shows: 20260523000001:45; pending_syncs: 20260601000000:163);
  // this pins that the new columns inherit it (table-level REVOKE is column-wide).
  it("pending_syncs and shows have INSERT/UPDATE/DELETE revoked from anon and authenticated", async () => {
    const grants = await sql<{ table_name: string; grantee: string; privilege_type: string }[]>`
      select table_name, grantee, privilege_type from information_schema.role_table_grants
      where table_schema = 'public' and table_name in ('pending_syncs','shows')
        and grantee in ('anon','authenticated') and privilege_type in ('INSERT','UPDATE','DELETE')`;
    expect(grants).toHaveLength(0); // no write grant to anon/authenticated on either table
  });
});
```

Run: `pnpm vitest run tests/db/setPullSheetOverrideGrants.test.ts` → **FAILS** (routine + columns absent). Verify the failure text names the missing routine.

### Step 1.2 — Migration (minimal impl)

`supabase/migrations/20260706000000_pull_sheet_override.sql`:

```sql
-- Pull-sheet-on-archived-tab override (spec 2026-07-06). Nullable jsonb; NULL = skipped
-- (default). NOT '{}': null is the meaningful "skipped" sentinel (distinct from
-- source_anchors' '{}' neutral). Idempotent: ADD COLUMN IF NOT EXISTS (apply-twice safe).
alter table public.pending_syncs
  add column if not exists pull_sheet_override jsonb;
alter table public.pending_syncs
  add column if not exists pull_sheet_override_applied jsonb;
alter table public.shows
  add column if not exists pull_sheet_override jsonb;

comment on column public.pending_syncs.pull_sheet_override is
  'In-app override to include an archived OLD-tab pull sheet: {tabName,fingerprint,acceptedBy,acceptedAt}|null. NULL=skipped (default). Written only via set_pull_sheet_override RPC + publish propagation.';
comment on column public.pending_syncs.pull_sheet_override_applied is
  'overrideSnapshot({tabName,fingerprint}|null) the currently-staged parse_result was produced under. Deferred-apply consistency gate (spec 5.8). NOT propagated to shows.';
comment on column public.shows.pull_sheet_override is
  'Durable copy of pull_sheet_override, propagated at publish (Flow A/B). Read by cron sync (spec 5.3).';

-- SECURITY DEFINER accept/revoke writer. Sole writer of pending_syncs.pull_sheet_override at
-- the onboarding layer. Holds the per-show advisory lock (single holder — the JS route never
-- locks). Belt-and-suspenders: (1) execute revoked below; (2) in-RPC active-session guard.
create or replace function public.set_pull_sheet_override(
  p_drive_file_id text,
  p_wizard_session_id uuid,
  p_tab_name text,
  p_fingerprint text,
  p_accepted_by text,
  p_expected_override_snapshot jsonb  -- overrideSnapshot({tabName,fingerprint}|null) the admin's UI last saw (row-state CAS)
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_active_session uuid;
  v_current jsonb;
  v_current_snapshot jsonb;
  v_override jsonb;
begin
  -- Per-show advisory lock INSIDE the SECURITY DEFINER tx (single holder). Keeps direct
  -- service-role RPC callers from bypassing the write lock.
  perform pg_advisory_xact_lock(hashtext('show:' || p_drive_file_id));

  -- In-RPC active-session guard (mirrors rescanWizardSheet.ts:103-115): the session must be
  -- the live onboarding session, and the target pending_syncs row must exist.
  select pending_wizard_session_id into v_active_session
    from public.app_settings where id = 'default' limit 1;
  if v_active_session is null or v_active_session <> p_wizard_session_id then
    raise exception 'stale or forged wizard session for pull_sheet_override'
      using errcode = '22023';
  end if;

  -- Row-state CAS (Codex plan-R3-1): read the CURRENT override under the lock and compare its
  -- snapshot to what the admin's UI last saw. A stale S3 page revoking after another accept
  -- (or a stale accept after a revoke) would otherwise clobber the newer decision (lost update).
  select pull_sheet_override into v_current
    from public.pending_syncs
   where drive_file_id = p_drive_file_id and wizard_session_id = p_wizard_session_id;
  if not found then
    raise exception 'no pending_syncs row for (session, drive_file_id)'
      using errcode = 'P0002';
  end if;
  v_current_snapshot := case when v_current is null then null
    else jsonb_build_object('tabName', v_current->>'tabName', 'fingerprint', v_current->>'fingerprint') end;
  -- p_expected_override_snapshot is null|{tabName,fingerprint}; compare with null-safe equality.
  if v_current_snapshot is distinct from p_expected_override_snapshot then
    raise exception 'stale override snapshot (row changed since review)'
      using errcode = '40001';  -- serialization_failure → route maps to 409 stale_review
  end if;

  if p_tab_name is null then
    v_override := null; -- revoke
  else
    v_override := jsonb_build_object(
      'tabName', p_tab_name,
      'fingerprint', p_fingerprint,
      'acceptedBy', p_accepted_by,
      'acceptedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );
  end if;

  update public.pending_syncs
     set pull_sheet_override = v_override
   where drive_file_id = p_drive_file_id and wizard_session_id = p_wizard_session_id;

  return jsonb_build_object('override', v_override);
end;
$$;

revoke execute on function public.set_pull_sheet_override(text, uuid, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.set_pull_sheet_override(text, uuid, text, text, text, jsonb)
  to service_role;
```

Apply locally (TDD invariant 1): `psql "$TEST_DATABASE_URL" -f supabase/migrations/20260706000000_pull_sheet_override.sql && psql "$TEST_DATABASE_URL" -c "notify pgrst, 'reload schema';"`.

### Step 1.3 — Pass + commit

Re-run Step 1.1 → **PASSES**. (Schema-manifest regen + validation-project apply are deferred to Task 14 so the manifest reflects ALL migrations-applied at once, but the LOCAL apply happens now.)

Commit: `feat(db): add pull_sheet_override columns + set_pull_sheet_override RPC with grant lockdown`

---

## Task 2 — Exporter: `ArchivedPullSheetTab` detection, fingerprint, conditional emission

**Spec:** §5.1, D5, D6, I1/I2. **Files:**
- `lib/drive/exportSheetToMarkdown.ts` (edit — `synthesizeMarkdownFromXlsx` at `:206`, OLD-skip at `:222`)
- `tests/drive/exportSheetArchivedPullSheet.test.ts` (NEW)

**Interfaces — Produces:**
```ts
export type ArchivedPullSheetTab = {
  tabName: string;
  headerPreviews: string[];       // one entry per emitted case region, ≤120 chars, ≤4 lines joined " / "
  fingerprint: string;            // SHA-256 hex over all emitted regions (header cells + collectDataBlock items), normalized
  included: boolean;
  contentChangedSinceAccept: boolean; // exporter always false; sync layer sets true on auto-clear (5.2)
};
export function synthesizeMarkdownFromXlsx(
  buffer: ArrayBuffer,
  opts?: { includePullSheetFromTab?: string },
): { markdown: string; archivedPullSheetTabs: ArchivedPullSheetTab[] };
```
**Consumes:** existing `splitBlocks` (`:104`), `normalizePullSheetGrid` (`:123`), `sheetGrid`, the all-cells pull-sheet-header predicate + `collectDataBlock` region rule (mirrors `lib/parser/pull-sheet.ts:60,125-151`).

### Step 2.1 — Failing detection/fingerprint/emission test

Build fixtures as in-memory xlsx via the same `xlsx`/`ExcelJS` helper the file already uses (grep the file's import; construct a workbook with tabs `INFO`, `OLD PULL SHEET`). Test cases (derive expected from fixture edits — anti-tautology):

```ts
import { describe, it, expect } from "vitest";
import { synthesizeMarkdownFromXlsx } from "@/lib/drive/exportSheetToMarkdown";
import { buildXlsx } from "../helpers/buildXlsx"; // helper wrapping the exporter's xlsx lib; add if absent

// Region: header row all-cells "PULL SHEET", then item rows in a LATER block (Codex R7).
const regionA = [
  ["PULL SHEET", "PULL SHEET"],
  ["RIA - CHICAGO, IL"],
  [], // separator -> collectDataBlock scans forward
  ["QTY", "ITEM"],
  ["2", "Shure SM58"],
];

describe("synthesizeMarkdownFromXlsx archived-tab detection", () => {
  it("records one ArchivedPullSheetTab for an OLD tab with a pull-sheet region (included:false by default)", () => {
    const buf = buildXlsx([{ name: "INFO", grid: [["Show", "X"]] }, { name: "OLD PULL SHEET", grid: regionA }]);
    const { markdown, archivedPullSheetTabs } = synthesizeMarkdownFromXlsx(buf);
    expect(archivedPullSheetTabs).toHaveLength(1);
    const t = archivedPullSheetTabs[0];
    expect(t.tabName).toBe("OLD PULL SHEET");
    expect(t.included).toBe(false);
    expect(t.contentChangedSinceAccept).toBe(false);
    expect(t.headerPreviews).toEqual(["RIA - CHICAGO, IL"]); // header-line preview, not the "PULL SHEET" row
    expect(t.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    // included:false => tab dropped from markdown (default anti-contamination)
    expect(markdown).not.toContain("Shure SM58");
  });

  it("stray-mention OLD tab (one cell mentions 'pull sheet', no all-cells header row) yields NO entry", () => {
    const buf = buildXlsx([{ name: "OLD NOTES", grid: [["see pull sheet tab", "notes"], ["misc", "x"]] }]);
    const { archivedPullSheetTabs } = synthesizeMarkdownFromXlsx(buf);
    expect(archivedPullSheetTabs).toHaveLength(0);
  });

  it("cosmetic reformat => same fingerprint; QTY edit => different; header-only edit => different", () => {
    const base = synthesizeMarkdownFromXlsx(buildXlsx([{ name: "OLD PULL SHEET", grid: regionA }]))
      .archivedPullSheetTabs[0].fingerprint;
    const reformatted = regionA.map((r) => [...r]); reformatted.splice(2, 0, []); // extra blank row
    expect(synthesizeMarkdownFromXlsx(buildXlsx([{ name: "OLD PULL SHEET", grid: reformatted }]))
      .archivedPullSheetTabs[0].fingerprint).toBe(base);
    const qty = regionA.map((r) => [...r]); qty[4] = ["3", "Shure SM58"];
    expect(synthesizeMarkdownFromXlsx(buildXlsx([{ name: "OLD PULL SHEET", grid: qty }]))
      .archivedPullSheetTabs[0].fingerprint).not.toBe(base);
    const hdr = regionA.map((r) => [...r]); hdr[1] = ["MIAMI, FL"]; // header-only (Codex R5)
    expect(synthesizeMarkdownFromXlsx(buildXlsx([{ name: "OLD PULL SHEET", grid: hdr }]))
      .archivedPullSheetTabs[0].fingerprint).not.toBe(base);
  });

  it("multi-case tab: previews list every case, fingerprint spans all, 2nd-case edit changes it", () => {
    const two = [...regionA, [], ["PULL SHEET", "PULL SHEET"], ["MIAMI, FL"], ["QTY", "ITEM"], ["1", "DI Box"]];
    const base = synthesizeMarkdownFromXlsx(buildXlsx([{ name: "OLD PULL SHEET", grid: two }]))
      .archivedPullSheetTabs[0];
    expect(base.headerPreviews).toEqual(["RIA - CHICAGO, IL", "MIAMI, FL"]); // I2 all cases reviewed
    const edited = two.map((r) => [...r]); edited[edited.length - 1] = ["2", "DI Box"]; // 2nd case item
    expect(synthesizeMarkdownFromXlsx(buildXlsx([{ name: "OLD PULL SHEET", grid: edited }]))
      .archivedPullSheetTabs[0].fingerprint).not.toBe(base.fingerprint);
  });

  it("includePullSheetFromTab un-skips ONLY pull-sheet regions; rooms/other blocks discarded", () => {
    const withRooms = [...regionA, [], ["ROOMS"], ["Ballroom A"]];
    const { markdown, archivedPullSheetTabs } = synthesizeMarkdownFromXlsx(
      buildXlsx([{ name: "OLD PULL SHEET", grid: withRooms }]),
      { includePullSheetFromTab: "OLD PULL SHEET" },
    );
    expect(markdown).toContain("Shure SM58");     // pull-sheet region emitted
    expect(markdown).not.toContain("Ballroom A");  // DEF-2: rooms NOT leaked
    expect(archivedPullSheetTabs[0].included).toBe(true);
    expect(archivedPullSheetTabs[0].fingerprint).toMatch(/^[0-9a-f]{64}$/); // still returned for compare (5.2)
  });

  it("parse-through (single source of truth): previews carry show identity AND parsePullSheet gets the items (Codex plan-R3-2)", () => {
    // Parser-compatible pull sheet: title/show-identity rows, then variant-B 5-col rows [qty,item,subcat,cat,packed].
    const grid = [
      ["PULL SHEET"], ["RIA - CHICAGO, IL"], ["Lakeview - 7th Floor"], ["Set: 4/15/24"],
      ["QTY", "ITEM", "SUB CAT", "CAT", "PACKED"],
      ["2", "Shure SM58", "Mic", "AUDIO", "FALSE"],
    ];
    const { markdown, archivedPullSheetTabs } = synthesizeMarkdownFromXlsx(
      buildXlsx([{ name: "OLD PULL SHEET", grid }]), { includePullSheetFromTab: "OLD PULL SHEET" });
    // I2: the admin-reviewed preview carries the show identity (not item rows, not the bare "PULL SHEET" token)
    expect(archivedPullSheetTabs[0].headerPreviews[0]).toContain("RIA - CHICAGO, IL");
    expect(archivedPullSheetTabs[0].headerPreviews[0]).not.toMatch(/^PULL SHEET$/);
    // I1: parsePullSheet of the emitted markdown recovers the item — same bytes hashed/emitted/parsed
    const parsed = parsePullSheet(markdown).pullSheet;
    expect(parsed?.flatMap((c) => c.items).some((i) => i.item === "Shure SM58" && i.qty === 2)).toBe(true);
  });
});
```

Run → **FAILS** (function returns a bare string; no `archivedPullSheetTabs`).

### Step 2.2 — Impl (minimal)

In `lib/drive/exportSheetToMarkdown.ts`:
1. Add `import { createHash } from "node:crypto";` and the `ArchivedPullSheetTab` type export.
2. **Single source of truth = the emitted markdown the parser consumes** (Codex plan-R3-2). `normalizePullSheetGrid` (`:123`) for `/PULL SHEET/` tabs COLLAPSES the show-identity/title rows into ONE synthetic `PULL SHEET/<title-parts-joined-by-/>` header cell and slices the original title rows away (`:131-146`) — so building `headerLines` from "rows after the header" would capture ITEM rows, not the show identity, and lose what the admin must review (I2). Instead, derive detection, previews, AND fingerprint from the SAME representation `parsePullSheet` consumes:
   - Run the tab's normal emission path (`normalizePullSheetGrid` → `splitBlocks` → `tableMarkdown`) to produce the **per-tab pull-sheet markdown** — the exact bytes that would reach `parsePullSheet`.
   - A case region begins at a markdown header row whose cells all contain "PULL SHEET" (the synthetic `PULL SHEET/<title>` cell satisfies this), through the `collectDataBlock` span (`pull-sheet.ts:92-97`), stopping before the next such header.
   - `headerPreviews[i]` = the show identity for region `i`, parsed the SAME way `parsePullSheet` derives its `caseLabel`: split the synthetic `PULL SHEET/<title>` header cell on `/`, drop the leading `PULL SHEET` token, join the remaining parts with `" / "`, cap 120 chars (mirror `extractCaseLabel`, `pull-sheet.ts:189-191`). This guarantees `headerPreviews` ≡ what the parser reads ≡ what the admin reviews (I1/I2).
   - `fingerprint` = SHA-256 over the concatenated region markdown (header cell + `collectDataBlock` item rows) — the exact emitted bytes — so emitted ≡ hashed ≡ parsed (I1).
3. Normalization for the fingerprint: operate on the already-`tableMarkdown`-emitted region text (whitespace/pipe layout already canonical), and additionally drop fully-blank lines so an extra blank row is stable (D5). Content is case-significant (no lowercasing).
4. Change the signature to `(buffer, opts?)`, return `{ markdown, archivedPullSheetTabs }`.
5. In the worksheet loop, replace the bare `if (/\bOLD\b/i.test(sheetName)) continue;` (`:222`) with:

```ts
if (/\bOLD\b/i.test(sheetName)) {
  // Build the SAME per-tab pull-sheet markdown parsePullSheet would consume (single source of truth).
  const grid = normalizePullSheetGrid(sheetName, sheetGrid(sheet));
  const tabMarkdown = splitBlocks(grid).map(normalizeBlock).map(tableMarkdown).join("\n\n");
  // Split into case regions: each starts at a header line whose cells all contain "PULL SHEET",
  // through its collectDataBlock span, stopping before the next such header (mirror pull-sheet.ts).
  const regions = collectPullSheetRegionsFromMarkdown(tabMarkdown); // { headerCell, regionMarkdown }[]
  if (regions.length > 0) {
    const included = opts?.includePullSheetFromTab === sheetName;
    const fingerprint = createHash("sha256")
      .update(regions.map((r) => stripBlankLines(r.regionMarkdown)).join("\n\x00\n"), "utf8")
      .digest("hex");
    archivedPullSheetTabs.push({
      tabName: sheetName,
      headerPreviews: regions.map((r) => previewFromHeaderCell(r.headerCell)), // extractCaseLabel-style
      fingerprint,
      included,
      contentChangedSinceAccept: false,
    });
    if (included) {
      // Emit EXACTLY the collected region markdown (same bytes hashed); other blocks discarded (D6, I1).
      tables.push(...regions.map((r) => r.regionMarkdown));
    }
  }
  continue; // non-included OLD tabs (and non-pull-sheet OLD tabs) stay dropped
}
```

- `collectPullSheetRegionsFromMarkdown(md)`: walk markdown table rows; a header row is one whose split cells all contain "PULL SHEET" (`pull-sheet.ts:60`); a region = that header + rows through the `collectDataBlock` span, up to the next such header.
- `previewFromHeaderCell(cell)` (mirror `extractCaseLabel`, `pull-sheet.ts:189-191`): `cell.replace(/&#10;/g," / ").split("/").map(s=>s.trim()).filter(s=>s && s.toUpperCase()!=="PULL SHEET").join(" / ").slice(0,120)`, or `"(no header text)"` when empty (§6).
- `stripBlankLines(md)`: drop fully-blank lines so an extra blank row is stable (D5).

Run → **PASSES**.

Commit: `feat(drive): detect + conditionally emit archived-tab pull-sheet regions with content fingerprint`

---

## Task 3 — Thread callers: `fetch.ts` return-shape + `includePullSheetFromTab`

**Spec:** §5.1 return-shape callers, §12 (call sites `:497`,`:614`). **Files:**
- `lib/drive/fetch.ts` (edit `:497`, `:614`)
- `tests/drive/fetchSheetMarkdownArchived.test.ts` (NEW)
- any other bare-string caller (grep-sweep below)

**Interfaces:** the two fetch helpers (`fetchSheetMarkdownWithBinding` and the sibling at `:614`) must (a) accept + thread an optional `includePullSheetFromTab`, (b) return `archivedPullSheetTabs` alongside `{ markdown, bytes }`.

### Step 3.1 — Grep-sweep for bare-string callers

```
rg -n "synthesizeMarkdownFromXlsx\(" lib app scripts tests
```
Every call that used the bare-string return must move to `.markdown`. Known: `fetch.ts:497`, `:614`. Enumerate the full list in the commit body.

### Step 3.2 — Failing test

```ts
it("fetch helper surfaces archivedPullSheetTabs and threads includePullSheetFromTab", async () => {
  const res = await fetchSheetMarkdownWithBinding(/* stub bytes with an OLD PULL SHEET tab */, {
    includePullSheetFromTab: "OLD PULL SHEET",
  });
  expect(res.archivedPullSheetTabs?.[0]?.included).toBe(true);
  expect(res.markdown).toContain("Shure SM58");
});
```

Run → **FAILS** (option not accepted; field absent).

### Step 3.3 — Impl

At `:497` and `:614`, replace `synthesizeMarkdownFromXlsx(bytes)` with `synthesizeMarkdownFromXlsx(bytes, opts?.includePullSheetFromTab ? { includePullSheetFromTab: opts.includePullSheetFromTab } : undefined)`, destructure `{ markdown, archivedPullSheetTabs }`, and add both to the returned object + the helper's signature/type. Update all bare-string callers from Step 3.1 to `.markdown`. Supabase call-boundary is unaffected (no new Supabase call), but any `{data,error}` in these helpers stays intact.

Run → **PASSES**. Commit: `feat(drive): thread includePullSheetFromTab + archivedPullSheetTabs through fetch helpers`

---

## Task 4 — Types + `ParseResult` shape + `GAP_CLASSES` extension + class-sweep

**Spec:** §5.2, §5.9 exact-shape note, §13 GAP_CLASSES. **Files:**
- `lib/parser/types.ts` (`ParseResult` `:404`, `ParsedSheet` `:378`)
- `lib/parser/dataGaps.ts` (`GAP_CLASSES` `:30`)
- `lib/sync/enrichWithDrivePins.ts` (`ParseResult` builder `~:387-400`) + every other `ParseResult` producer (class-sweep)
- `lib/sync/phase1.ts` (`Phase1ShowRow` `:22`) preview doubles
- `tests/parser/dataGapsArchivedTab.test.ts` (NEW)
- `tests/components/.../dataQualityBadgeArchivedTab.test.tsx` (NEW — badge coverage folded here, fail-first; §15 test 11, was Task 13)

**Interfaces — Produces:** `ParseResult.archivedPullSheetTabs: ArchivedPullSheetTab[]` (required, default `[]`). `PULL_SHEET_ON_ARCHIVED_TAB` in `GAP_CLASSES`.

### Step 4.1 — Failing GAP_CLASSES test

```ts
import { GAP_CLASSES, DATA_GAP_CODES, summarizeDataGaps } from "@/lib/parser/dataGaps";
it("PULL_SHEET_ON_ARCHIVED_TAB is a data-gap class counted by summarizeDataGaps", () => {
  expect(GAP_CLASSES.map((g) => g.code)).toContain("PULL_SHEET_ON_ARCHIVED_TAB");
  expect(DATA_GAP_CODES.has("PULL_SHEET_ON_ARCHIVED_TAB")).toBe(true);
  const summary = summarizeDataGaps([
    { severity: "warn", code: "PULL_SHEET_ON_ARCHIVED_TAB", message: "x" } as any,
  ]);
  expect(summary["PULL_SHEET_ON_ARCHIVED_TAB"]).toBe(1);
});

// DataQualityBadge coverage folded here so it is genuinely FAIL-FIRST (before the GAP_CLASSES
// edit below, the badge cannot count this code) — Codex plan-R2-4. §15 test 11.
it("DataQualityBadge counts a PULL_SHEET_ON_ARCHIVED_TAB warning (derived from summarizeDataGaps, not hardcoded)", () => {
  const warnings = [{ severity: "warn", code: "PULL_SHEET_ON_ARCHIVED_TAB", message: "x" } as any];
  const expectedTotal = summarizeDataGaps(warnings).total; // 0 before the class exists, 1 after
  render(<DataQualityBadge warnings={warnings} />);
  expect(screen.getByTestId("data-quality-badge").textContent).toContain(String(expectedTotal));
  // Fail-first: before GAP_CLASSES has the code, expectedTotal===0 and the badge shows the "clean" state,
  // so the "counts the archived-tab warning" intent fails; after the edit expectedTotal===1 and it passes.
});
```

Run → **FAILS**.

### Step 4.2 — Impl

- `dataGaps.ts:30` append `{ code: "PULL_SHEET_ON_ARCHIVED_TAB", label: "pull sheet on archived tab" },` to `GAP_CLASSES` (before the `as const`). `DATA_GAP_CODES`/`summarizeDataGaps` are single-sourced from it (`:69,73`) so they pick it up.
- `types.ts`: add `archivedPullSheetTabs: ArchivedPullSheetTab[];` to `ParseResult` (`:404` block) and `ParsedSheet` (`:378` block). Import/re-export `ArchivedPullSheetTab` from `@/lib/drive/exportSheetToMarkdown` (or move the type to `types.ts` and have the exporter import it — pick the direction that avoids a cycle; verify with `pnpm typecheck`).
- **Class-sweep every `ParseResult` producer** (per the required-nullable-field lesson — `as`-cast doubles bypass typecheck and break at runtime): `rg -n "ParseResult = \{|: ParseResult\b" lib tests` and add `archivedPullSheetTabs: parsed.archivedPullSheetTabs ?? []` (or `[]`) to each literal — notably `enrichWithDrivePins.ts:~387`. For `Phase1ShowRow`/preview `toEqual` fixtures, add `archivedPullSheetTabs: []` so exact-shape `toEqual` assertions still pass.

Run Step 4.1 + `pnpm typecheck` → **PASSES**. Run full `pnpm vitest run tests/sync tests/parser` to catch shape doubles. Commit: `feat(parser): add archivedPullSheetTabs to ParseResult + PULL_SHEET_ON_ARCHIVED_TAB gap class`

---

## Task 5 — §12.4 codes: 4-gate lockstep (2 warn codes)

**Spec:** §9, D7. **Files (all in ONE commit — 3-way lockstep):**
- `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §12.4 prose (2 new rows)
- `lib/messages/__generated__/spec-codes.ts` (regen via `pnpm gen:spec-codes`)
- `lib/messages/catalog.ts` (2 new rows near existing `PULL_SHEET_*` `:1255`/`:1411`)

### Step 5.1 — Failing parity test

Run `pnpm gen:spec-codes && pnpm vitest run tests/cross-cutting/codes.test.ts tests/cross-cutting/extract-spec-codes.test.ts`. Before edits this passes (no new codes); after adding a catalog row WITHOUT the spec row it must FAIL — so first add ONLY the `catalog.ts` rows and run → **FAILS** with a catalog↔§12.4 divergence naming the two codes. (This proves the gate is live before we satisfy it.)

### Step 5.2 — Impl (all three edits, same commit)

- **§12.4 prose** — add two rows (do NOT `prettier` the master spec — mangles §12.4 cells → x1 divergence):
  - `PULL_SHEET_ON_ARCHIVED_TAB` | warn | doug | "A pull sheet was found on an archived tab ('{tab}') and left out. If it's this show's gear, include it in review; otherwise ignore."
  - `PULL_SHEET_OVERRIDE_CONTENT_CHANGED` | warn | health | "An included archived-tab pull sheet changed and was set back to skipped for safety; admin must re-confirm."
- Run `pnpm gen:spec-codes` → regenerates `spec-codes.ts` with both entries.
- **`catalog.ts`** — add both rows mirroring the existing `PULL_SHEET_PARSE_PARTIAL` shape (`:1255`): `code`, user-facing `message` via lookup, `severity`, `audience`, `helpHref: "/help/errors#<CODE>"`. Namespace guard: `PULL_SHEET_*` is an established parser namespace — no `REPORT_*`-style scanner collision (§9).

Run Step 5.1 command → **PASSES**. Note per the "new §12.4 code = 4 more CI gates" lesson: also run `pnpm gen:internal-code-enums` if present, add help `_families` entries if the help page enumerates codes, and run the FULL `tests/messages/` + `tests/cross-cutting/` suites. Commit: `feat(messages): add PULL_SHEET_ON_ARCHIVED_TAB + PULL_SHEET_OVERRIDE_CONTENT_CHANGED (12.4 lockstep)`

---

## Task 6 — Sync layer: override read, warning emission, content-change discard-and-rerun, envelope persist, `pull_sheet_override_applied` write

**Spec:** §5.2, §5.3, §5.9, I5(b). **Files:**
- `lib/sync/runOnboardingScan.ts` (override read before export; warning emit; envelope persist `parse_result` INSERT `:421,443`; `pull_sheet_override_applied` write)
- `lib/sync/runScheduledCronSync.ts` (cron override read from `shows`; `upsertLivePendingSync:933`)
- `lib/sync/applyStaged.ts` (read paths `:1197,1437`)
- helper `lib/sync/pullSheetOverride.ts` (NEW — `overrideSnapshot`, `emitArchivedTabWarnings`, `reconcileIncludedTab`)
- `tests/sync/pullSheetOverrideReconcile.test.ts` (NEW)

**Interfaces — Produces:**
```ts
export type PullSheetOverride = { tabName: string; fingerprint: string; acceptedBy: string; acceptedAt: string };
export type OverrideSnapshot = { tabName: string; fingerprint: string } | null;
export function overrideSnapshot(o: PullSheetOverride | null): OverrideSnapshot;
export function emitArchivedTabWarnings(tabs: ArchivedPullSheetTab[]): ParseWarning[]; // included:false only
export function reconcileIncludedTab(args: {
  tabs: ArchivedPullSheetTab[]; override: PullSheetOverride | null;
}):
  | { kind: "no_override" }                                    // override null → nothing to reconcile
  | { kind: "match" }                                          // included:true tab, fingerprint === override
  | { kind: "content_changed"; changedTab: ArchivedPullSheetTab } // included:true tab, fingerprint !==
  | { kind: "tab_missing" };                                   // override set but NO tab for override.tabName in tabs
                                                               // (renamed/deleted server-side) — Codex plan-R2-1, spec §6
```

### Step 6.1 — Failing reconcile + emission test

```ts
import { overrideSnapshot, emitArchivedTabWarnings, reconcileIncludedTab } from "@/lib/sync/pullSheetOverride";

it("overrideSnapshot drops audit fields", () => {
  expect(overrideSnapshot({ tabName: "OLD PULL SHEET", fingerprint: "ff", acceptedBy: "a@b.com", acceptedAt: "2026-07-06T00:00:00.000Z" }))
    .toEqual({ tabName: "OLD PULL SHEET", fingerprint: "ff" });
  expect(overrideSnapshot(null)).toBeNull();
});

it("emits one PULL_SHEET_ON_ARCHIVED_TAB per included:false tab, rawSnippet = joined previews", () => {
  const warns = emitArchivedTabWarnings([
    { tabName: "OLD PULL SHEET", headerPreviews: ["RIA - CHICAGO", "MIAMI"], fingerprint: "ff", included: false, contentChangedSinceAccept: false },
  ]);
  expect(warns).toHaveLength(1);
  expect(warns[0]).toMatchObject({
    severity: "warn", code: "PULL_SHEET_ON_ARCHIVED_TAB",
    rawSnippet: "RIA - CHICAGO | MIAMI",
    blockRef: { kind: "pull_sheet_archived_tab", name: "OLD PULL SHEET" },
  });
});

it("reconcileIncludedTab: match / content_changed / tab_missing / no_override", () => {
  const base = { tabName: "OLD PULL SHEET", headerPreviews: ["RIA"], included: true, contentChangedSinceAccept: false };
  const override = { tabName: "OLD PULL SHEET", fingerprint: "ff", acceptedBy: "a", acceptedAt: "t" };
  expect(reconcileIncludedTab({ tabs: [{ ...base, fingerprint: "ff" }], override }).kind).toBe("match");
  expect(reconcileIncludedTab({ tabs: [{ ...base, fingerprint: "ee" }], override }).kind).toBe("content_changed");
  // Override tab renamed/deleted server-side → NO entry for override.tabName (Codex plan-R2-1, spec §6):
  expect(reconcileIncludedTab({ tabs: [], override }).kind).toBe("tab_missing");
  expect(reconcileIncludedTab({ tabs: [{ ...base, tabName: "OTHER OLD", included: false, fingerprint: "zz" }], override }).kind).toBe("tab_missing");
  expect(reconcileIncludedTab({ tabs: [], override: null }).kind).toBe("no_override");
});
```

Run → **FAILS** (helper absent).

### Step 6.2 — Impl helper + wire into scan/cron/apply

- **Single-source discard-and-rerun (structural defense, plan-R4/R5/R6 vector).** The "content_changed/tab_missing → clear override + re-parse WITHOUT inclusion (drops OLD gear, PRESERVES current non-OLD pull sheet) + `_applied=null`" contract is IDENTICAL across all three consumers — `runOnboardingScan`, `rescanWizardSheet`, `runScheduledCronSync`. Implement it ONCE as a shared `pullSheetOverride.ts` helper (e.g. `discardAndRerun({ reparseNoOverride, clearOverride, emit })`) that every path calls, so no path can drift back to force-emptying `pullSheet`. Three same-vector adversarial rounds (empty-vs-preserve) landed on exactly this class; the shared helper closes it structurally.
- `pullSheetOverride.ts`: implement the three functions. `emitArchivedTabWarnings` produces the `ParseWarning` shape from §5.2 (`blockRef.kind = "pull_sheet_archived_tab"`, `rawSnippet = headerPreviews.join(" | ")`). `reconcileIncludedTab`: `null` override → `no_override`; else find the tab whose `tabName === override.tabName` — absent → `tab_missing`; present and `fingerprint === override.fingerprint` → `match`; present and differs → `content_changed`. **`tab_missing` is handled identically to `content_changed`** (Codex plan-R2-1): clear the override, no stale `pullSheet` staged, `_applied = null`, but since there is no server-side tab to re-review, emit `PULL_SHEET_OVERRIDE_CONTENT_CHANGED` and render **S1** (no offer) rather than S4 — the archived tab is simply gone.
- **`runOnboardingScan.ts`:** before calling the fetch helper, read the row's `pull_sheet_override` (destructure `{ data, error }` — invariant 9). Pass `includePullSheetFromTab: override?.tabName`. After parse: push `emitArchivedTabWarnings(...)` into `parse_result.warnings`; set `parse_result.archivedPullSheetTabs = tabs`. If `reconcileIncludedTab` returns `content_changed` **or `tab_missing`** → run the **discard-and-rerun** (5.2, I5b): under the `show:` lock (see Task 7 for the lock reconciliation) clear the override (`update ... set pull_sheet_override = null`), emit `PULL_SHEET_OVERRIDE_CONTENT_CHANGED` (forensic), **re-parse WITHOUT `includePullSheetFromTab`, and stage THAT no-override parse result** with `pull_sheet_override_applied = null`. The no-override re-parse **preserves any current non-OLD pull sheet and drops only the OLD-tab gear** (Codex plan-R4-1) — do NOT force `pullSheet = []`. `parse_result.pullSheet` is empty ONLY when the workbook has no non-OLD pull sheet; a valid current pull sheet on a normal tab survives. For `content_changed`, set the changed tab's entry `contentChangedSinceAccept = true` with the NEW previews/fingerprint (S4). For `tab_missing`, there is no server-side tab → no offer entry → S1 (Codex plan-R2-1). Do NOT persist `overrideSnapshot(override-as-of-lock)` in this branch: the override just mismatched and was cleared, so writing `applied = A` while desired is now `null` would leave finalize permanently blocked after a *safety* clear. `_applied = null` matches the no-override parse actually staged, so `overrideSnapshot(null) === applied` → the row finalizes as a plain no-pull-sheet show.
  For the **non-mismatch** staging paths (normal re-scan, accept-included, no-override), persist `pull_sheet_override_applied = overrideSnapshot(override-as-of-lock)` **atomically with the `parse_result` INSERT** (`:421-443` — add both columns to the upsert column list + `excluded.` set-clause). Only the content-changed branch overrides this to `null`.
- **`rescanWizardSheet.ts` (Codex plan-R6-1 — the accept/revoke/stale-refresh re-scan path, `lib/onboarding/rescanWizardSheet.ts:91`):** this is a SEPARATE scan path from `runOnboardingScan` — it builds `prepared.parseResult` via `prepareOnboardingFiles` → the `fetchSheetMarkdownWithBinding` helper (`fetch.ts:562`, exporter at `:614`), NOT `runOnboardingScan`. It is what the accept route (Task 8 step 5) and the CAS-mismatch refresh (Task 8 step 3, spec §5.4) trigger. It MUST apply the SAME override wiring: (a) before the Drive read, load the row's `pull_sheet_override` and thread `includePullSheetFromTab: override?.tabName` into `prepareOnboardingFiles`/the fetch helper; (b) attach the exporter's returned `archivedPullSheetTabs` onto the persisted `parse_result` envelope (`refreshedParse`) — the same first-class field `runOnboardingScan` writes, so the step-3 preview carries it after a rescan; (c) run `reconcileIncludedTab` under the `show:` lock it already holds (`:80`), and on `content_changed`/`tab_missing` run the identical discard-and-rerun (clear override, re-parse WITHOUT inclusion preserving current non-OLD gear, `_applied = null`, set `contentChangedSinceAccept`), and on the non-mismatch paths persist `pull_sheet_override_applied = overrideSnapshot(override-as-of-lock)`. Without this, accept re-scans, the CAS-refresh (R5-1), and drift-produces-S4 all fail because `rescanWizardSheet` would persist a preview with no `archivedPullSheetTabs`/stale fingerprint.
- **`runScheduledCronSync.ts`:** cron reads `shows.pull_sheet_override`, threads `includePullSheetFromTab`, and runs the SAME `reconcileIncludedTab` on its returned tabs. On `content_changed`/`tab_missing` for a **published** show, cron clears the **durable** `shows.pull_sheet_override` (`update public.shows set pull_sheet_override = null where drive_file_id = ...` under the `show:` lock), emits `PULL_SHEET_OVERRIDE_CONTENT_CHANGED`, and applies the **no-override re-parse** — the changed OLD-tab gear is absent but any current non-OLD pull sheet is preserved (plan-R4/R5/R6; NOT force-emptied — same contract as the onboarding branch), and the next parse runs with no override (Codex plan-R2-2 — the onboarding branch clears `pending_syncs`; the durable post-publish clear happens HERE or the live path stays sticky on a stale fingerprint). `upsertLivePendingSync` (`:933`) writes `pull_sheet_override_applied` with its staged parse (Task 10 covers the Flow C apply gate). Step 6.4 adds the cron test.
- **`applyStaged.ts`:** read paths surface the new columns (additive `select`).

### Step 6.3 — Failing content-changed integration test (staged DB/envelope outcome)

Helper unit tests (6.1) don't prove the staged row. Add an integration test (against `$TEST_DATABASE_URL` or a stubbed `Phase1Tx` that records the upsert args) asserting the **content-changed branch's persisted outcome**:

```ts
it("content-changed accepted tab: staged row has override=null, empty pullSheet, changed tab flagged, _applied=null, warning re-fired", async () => {
  // Arrange: pending_syncs override = {tabName:'OLD PULL SHEET', fingerprint:'ff', ...};
  // exporter now returns the included tab with a DIFFERENT fingerprint 'ee'.
  const staged = await runOnboardingScanForOne({ /* deps producing the mismatch */ });
  expect(staged.pull_sheet_override).toBeNull();                       // cleared
  expect(staged.pull_sheet_override_applied).toBeNull();               // Codex plan-R1-2: NOT overrideSnapshot(A)
  expect(staged.parse_result.pullSheet).toEqual([]);                   // OLD-tab-only workbook → empty (no current pull sheet)
  const tab = staged.parse_result.archivedPullSheetTabs.find((t) => t.tabName === "OLD PULL SHEET");
  expect(tab?.contentChangedSinceAccept).toBe(true);
  expect(tab?.fingerprint).toBe("ee");                                 // NEW fingerprint for re-review
  expect(staged.parse_result.warnings.some((w) => w.code === "PULL_SHEET_OVERRIDE_CONTENT_CHANGED")).toBe(true);
});

it("mixed workbook: current non-OLD pull sheet + accepted OLD tab that drifts => current gear PRESERVED, only OLD gear dropped (Codex plan-R4-1)", async () => {
  // Arrange: a normal 'PULL SHEET' tab with current gear (e.g. 'Current DI Box') AND an accepted OLD tab
  // whose fingerprint now mismatches. The no-override re-parse keeps the current tab's pull sheet.
  const staged = await runOnboardingScanForOne({ /* deps: current tab + drifted OLD tab */ });
  expect(staged.pull_sheet_override).toBeNull();
  expect(staged.pull_sheet_override_applied).toBeNull();
  const items = staged.parse_result.pullSheet.flatMap((c) => c.items).map((i) => i.item);
  expect(items).toContain("Current DI Box");   // current gear NOT erased by the safety clear
  expect(items).not.toContain("Shure SM58");   // OLD-tab gear dropped
});
```

Run → **FAILS** first (branch persists `overrideSnapshot(A)`, or stages the changed OLD gear, or force-empties the current gear), then after Step 6.2 → **PASSES**. Concrete failure modes caught: a safety auto-clear that leaves the row finalize-blocked (`applied=A`, desired=null); that stages the changed OLD gear; OR that erases a legitimate current non-OLD pull sheet (plan-R4-1).

### Step 6.4 — Failing durable cron auto-clear test (published-show content drift)

```ts
it("cron: published show, accepted OLD tab content changed => durable shows.pull_sheet_override cleared, CONTENT_CHANGED emitted, no changed gear applied", async () => {
  // Arrange: shows.pull_sheet_override = {tabName:'OLD PULL SHEET', fingerprint:'ff', ...};
  // exporter returns the included tab with fingerprint 'ee'.
  const { showsUpdate, events, applied } = await runScheduledCronSyncForOne({ /* deps: OLD-tab-only, mismatch */ });
  expect(showsUpdate.pull_sheet_override).toBeNull();                       // durable cleared (Codex plan-R2-2)
  expect(events.some((e) => e.code === "PULL_SHEET_OVERRIDE_CONTENT_CHANGED")).toBe(true);
  // OLD-tab-only fixture → no current gear; assert the CHANGED OLD gear is absent (not that pullSheet is force-emptied).
  expect(applied.pullSheet.flatMap((c) => c.items).map((i) => i.item)).not.toContain("Shure SM58"); // no changed OLD gear applied (I5, plan-R4)
});
it("cron: override tab deleted/renamed server-side (tab_missing) => durable override cleared, no stale gear", async () => { /* same asserts, tab absent from returned tabs */ });
```

Run → **FAILS**, then after Step 6.2 cron wiring → **PASSES**. Concrete failure mode: a published show staying sticky on a stale fingerprint after the archived tab changed/vanished.

### Step 6.5 — Failing `rescanWizardSheet` persistence tests (the accept/refresh re-scan path, Codex plan-R6-1)

`rescanWizardSheet` is a distinct scan path (`prepareOnboardingFiles` → `prepared.parseResult`, exporter at `fetch.ts:614`) — not `runOnboardingScan`. Accept (Task 8 step 5) and the CAS-mismatch refresh (Task 8 step 3 / spec §5.4 R5-1) both trigger it, so it MUST detect + persist archived-tab data or those paths silently break. Tests against a stubbed rescan tx (records the persisted `refreshedParse` + row writes):

```ts
it("rescanWizardSheet: normal rescan persists parse_result.archivedPullSheetTabs (detection wired into THIS path too)", async () => {
  const { persisted } = await rescanWizardSheetForOne({ /* override null; OLD tab present */ });
  expect(persisted.parse_result.archivedPullSheetTabs).toEqual([
    expect.objectContaining({ tabName: "OLD PULL SHEET", fingerprint: expect.any(String), included: false }),
  ]);
});
it("rescanWizardSheet: override active + matching fingerprint => re-scans WITH inclusion (pr.pullSheet populated from OLD tab)", async () => {
  const { persisted } = await rescanWizardSheetForOne({ /* override {tabName:'OLD PULL SHEET', fingerprint:'ff'}; tab still 'ff' */ });
  expect(persisted.parse_result.pullSheet.flatMap((c) => c.items).some((i) => i.item === "Shure SM58")).toBe(true);
  expect(persisted.pull_sheet_override_applied).toEqual({ tabName: "OLD PULL SHEET", fingerprint: "ff" });
});
it("rescanWizardSheet: override active + drifted fingerprint => discard-and-rerun (override cleared, S4 flag, _applied=null, current gear preserved)", async () => {
  const { persisted } = await rescanWizardSheetForOne({ /* override 'ff'; tab now 'ee'; also a current non-OLD pull sheet */ });
  expect(persisted.pull_sheet_override).toBeNull();
  expect(persisted.pull_sheet_override_applied).toBeNull();
  expect(persisted.parse_result.archivedPullSheetTabs.find((t) => t.tabName === "OLD PULL SHEET")?.contentChangedSinceAccept).toBe(true);
  expect(persisted.parse_result.pullSheet.flatMap((c) => c.items).map((i) => i.item)).toContain("Current DI Box"); // R4/R5 preserve current
});
```

Run → **FAILS** (rescan path unwired), then after Step 6.2 `rescanWizardSheet` wiring → **PASSES**. Concrete failure mode caught: accept/stale-refresh triggering a re-scan that persists a preview with NO `archivedPullSheetTabs` (breaking S2/S4 + the R5-1 dead-loop fix) — the exact gap R6-1 flagged.

Run Step 6.1 + 6.3 + 6.4 + 6.5 + `pnpm vitest run tests/sync tests/onboarding` → **PASSES**. Commit: `feat(sync): override read, archived-tab warnings, content-change discard-and-rerun, applied-snapshot write (scan + rescan paths)`

---

## Task 7 — Locked-snapshot protocol (5.7) in `rescanWizardSheet` + cron

**Spec:** §5.7, I5(a). **Files:**
- `lib/onboarding/rescanWizardSheet.ts` (pre-lock export `:99-139`, lock `:170`)
- `tests/onboarding/rescanOverrideLockedSnapshot.test.ts` (NEW)

**Interfaces:** the pre-lock export carries `{ tabName, fingerprint } | null` (`overrideSnapshot(override-used)`); inside the `show:` locked tx (`:170`), re-read `pull_sheet_override`, compute `overrideSnapshot`, and if `!deepEqual(preLockSnapshot, lockedSnapshot)` → refuse-and-retry (do not write staged results from the stale parse).

### Step 7.1 — Failing TOCTOU test

Two races (§12: 2 tests):
```ts
it("revoke-vs-rescan: override cleared under lock after a pre-lock accepted parse => stale parse refused", async () => {
  // pre-lock parse produced under override A; locked re-read returns null => refuse, no OLD gear staged
  const result = await rescanWizardSheet({ /* deps whose locked read returns null */ }, args);
  expect(result.kind).toBe("stale_override_refused"); // typed refuse-and-retry outcome
  // assert no staged parse_result with pull sheet was written
});
it("accept-vs-cron: accept under lock while parse read null pre-lock => null-parse does not overwrite the accept", async () => {
  const result = await rescanWizardSheet({ /* locked read returns override A, pre-lock snapshot null */ }, args);
  expect(result.kind).toBe("stale_override_refused");
});
```

Run → **FAILS**.

### Step 7.2 — Impl

In `rescanWizardSheet`: capture `preLockSnapshot = overrideSnapshot(overrideUsedForExport)`. Inside the `:170` locked tx, `select pull_sheet_override from public.pending_syncs where ...` (destructure `{data,error}`), compute `lockedSnapshot`, and if it differs (tabName/fingerprint/null↔set), return the typed `stale_override_refused` outcome under the caller's retry envelope — do NOT write staged/live results. The auto-clear (Task 6 content_changed) and accept/revoke (Task 8) both run under this same `show:` lock, serializing all transitions. Mirror the same guard in the cron equivalent.

Run → **PASSES**. Commit: `feat(onboarding): locked-snapshot protocol reconciles pre-lock override against under-lock re-read`

---

## Task 8 — Accept/revoke route + RPC caller + AUDITABLE_MUTATIONS + advisory-lock topology pins

**Spec:** §5.4, D8, D9, I3, I7, invariants 2/9/10. **Files:**
- `app/api/admin/onboarding/pull-sheet-override/route.ts` (NEW)
- `tests/log/_auditableMutations.ts` (extend), `tests/log/adminOutcomeBehavior.test.ts` (extend)
- `tests/auth/advisoryLockRpcDeadlock.test.ts` (extend), `tests/sync/_advisoryLockSingleHolderContract.test.ts` (extend)
- `tests/api/pullSheetOverrideRoute.test.ts` (NEW), `tests/db/setPullSheetOverrideRpcAuth.test.ts` (NEW — direct-RPC denial + forged session)

**Interfaces — Consumes:** `requireAdminIdentity()` → `{email}` (`lib/auth/requireAdmin`); service-role Supabase client; `set_pull_sheet_override` RPC. **Produces:** `POST` handler.

Body: `{ driveFileId, wizardSessionId, tabName, expectedFingerprint, expectedOverrideSnapshot }` (accept) | `{ driveFileId, wizardSessionId, tabName: null, expectedOverrideSnapshot }` (revoke). `expectedOverrideSnapshot` = `overrideSnapshot({tabName,fingerprint})|null` the UI last rendered (row-state CAS, Codex plan-R3-1): for a first-time S2 accept it is `null` (no override yet); for a revoke from S3 it is the active override's snapshot; for S4 re-confirm it is `null` (override was auto-cleared). Both accept AND revoke carry it.

### Step 8.1 — Failing route + auth + registry tests

```ts
// route behavior
it("accept: server fingerprint === expectedFingerprint => RPC called with server-computed fingerprint, re-scan triggered", async () => { /* ... */ });
it("accept: server fingerprint !== expectedFingerprint => 409 { status: 'stale_review' } (code-less), RPC NOT called (I3 CAS)", async () => {
  // server fresh-detect returns fingerprint 'ee'; body expectedFingerprint 'ff'
  const res = await POST(reqWith({ driveFileId: "d", wizardSessionId: "s", tabName: "OLD PULL SHEET", expectedFingerprint: "ff" }));
  expect(res.status).toBe(409);
  await expect(res.json()).resolves.toEqual({ status: "stale_review" });
  expect(rpcSpy).not.toHaveBeenCalled();
});
it("accept CAS mismatch REFRESHES the persisted preview before 409, so a second accept succeeds (no dead-loop, plan-R5-1)", async () => {
  // server fresh-detect returns 'ee'; page still holds 'ff'. First accept must trigger the re-scan (refresh envelope to 'ee').
  const res1 = await POST(reqWith({ driveFileId: "d", wizardSessionId: "s", tabName: "OLD PULL SHEET", expectedFingerprint: "ff" }));
  expect(res1.status).toBe(409);
  expect(rescanSpy).toHaveBeenCalled();               // envelope re-persisted with the NEW fingerprint (not left stale)
  expect(rpcSpy).not.toHaveBeenCalled();
  // client re-fetched, now sends the refreshed fingerprint 'ee' → matches server → succeeds
  const res2 = await POST(reqWith({ driveFileId: "d", wizardSessionId: "s", tabName: "OLD PULL SHEET", expectedFingerprint: "ee" }));
  expect(res2.status).toBe(200);
  expect(rpcSpy).toHaveBeenCalledWith(expect.objectContaining({ p_fingerprint: "ee" }));
});
it("stale_review 409 body has no §12.4/lookup code (uncataloged-code guard, Codex plan-R1-3)", async () => {
  const res = await POST(reqWith({ driveFileId: "d", wizardSessionId: "s", tabName: "OLD PULL SHEET", expectedFingerprint: "ff" }));
  const body = await res.json();
  expect(body).not.toHaveProperty("code"); // structured status only; UI re-fetches preview, card carries the message
});
it("accept: named tab has no pull-sheet region server-side => typed error, no override written", async () => { /* ... */ });
it("revoke: tabName null => RPC called with p_tab_name null + p_expected_override_snapshot, re-scan triggered", async () => { /* ... */ });
it("row-state CAS: RPC raises 40001 (override changed since page load) => 409 { status:'stale_review' } (Codex plan-R3-1)", async () => {
  rpcSpy.mockRejectedValueOnce({ code: "40001" });
  const res = await POST(reqWith({ driveFileId: "d", wizardSessionId: "s", tabName: null, expectedOverrideSnapshot: { tabName: "OLD PULL SHEET", fingerprint: "ff" } }));
  expect(res.status).toBe(409);
  await expect(res.json()).resolves.toEqual({ status: "stale_review" });
});
it("non-admin => rejected before any RPC (requireAdminIdentity throws)", async () => { /* ... */ });
it("success branch records logAdminOutcome code PULL_SHEET_OVERRIDE_SET/CLEARED (sink-spy after committed success)", async () => { /* invariant 10 behavioral proof */ });

// _auditableMutations registry: new file+POST+code rows present
// adminOutcomeBehavior: executable success-branch proof for both codes
// advisoryLockRpcDeadlock: set_pull_sheet_override holds show: lock
// _advisoryLockSingleHolderContract: the route file contains NO pg_advisory*/'show:' JS lock
```

The single-holder structural test asserts the route source does NOT contain `pg_advisory` or `hashtext('show:'` (RPC-only holder):
```ts
it("pull-sheet-override route does not take the show: lock in JS (RPC is sole holder)", () => {
  const src = fs.readFileSync("app/api/admin/onboarding/pull-sheet-override/route.ts", "utf8");
  expect(src).not.toMatch(/pg_advisory|hashtext\('show:/);
});
```

Run → **FAILS** (route absent; registry rows missing).

### Step 8.2 — Impl route + registry + pins

Route (`POST`), pattern mirrors `rescan-sheet/route.ts` but uses `requireAdminIdentity`:
1. `const { email } = await requireAdminIdentity();` (gate).
2. Parse body; validate shape (typed 400 via lookup copy on malformed — invariant 5).
3. **Fresh server-side detect** the named tab's current fingerprint (re-fetch bytes + `synthesizeMarkdownFromXlsx`), find the `ArchivedPullSheetTab` for `tabName`. If none → typed error (no pull-sheet region server-side). For accept: if `serverFingerprint !== expectedFingerprint` → **first trigger the standard re-scan (`rescan-sheet` path) so the freshly-detected `archivedPullSheetTabs` (new fingerprint + previews) is re-persisted into the Step-3 envelope** — the RPC is NOT called, so the override is untouched (a first-time S2 offer just re-persists with the new fingerprint; `reconcileIncludedTab` returns `no_override`). THEN return **HTTP 409 with a structured, code-less status body `{ status: "stale_review" }`** (NOT a §12.4 code and NOT a lookup-copy code — Codex plan-R1 finding 3: an uncataloged lookup key resolves to null/throws). Without the re-scan refresh the client would re-fetch the SAME stale envelope (`fingerprint='ff'`) and dead-loop on 409 (plan-R5 finding 1). With it, the client's accept handler treats 409 `stale_review` as "content changed since you reviewed", **re-fetches the Step-3 preview** showing the NEW fingerprint, and a second accept against that new fingerprint matches and succeeds. The changed content surfaces via the existing S2/S4 card copy (which IS cataloged/inline). RPC NOT called (I3).
4. Call `set_pull_sheet_override` with the **service-role client** (`{data,error}` destructure — invariant 9): `p_fingerprint = serverFingerprint` (accept) or `p_tab_name = null` (revoke); pass `p_expected_override_snapshot = body.expectedOverrideSnapshot` for BOTH. The JS route does NOT take the `show:` lock. If the RPC raises `40001` (row-state CAS mismatch — someone changed the override since the admin's page loaded) → the route returns the same **409 `{ status: "stale_review" }`** as the fingerprint-CAS branch; the client re-fetches the preview. (Both the sheet-content CAS in step 3 and the row-state CAS here funnel to the one 409 refresh path.)
5. On success: trigger the existing re-scan (`rescan-sheet` path) so 5.3 re-runs with the new override.
6. **Post-commit, outside any lock tx:** `await logAdminOutcome({ code: tabName ? "PULL_SHEET_OVERRIDE_SET" : "PULL_SHEET_OVERRIDE_CLEARED", actorEmail: email, ... })` (forensic admin codes; §12.4-exempt via `_metaAdminOutcomeContract`). No secret logged (tab name is not a secret).

Registry: add two rows to `AUDITABLE_MUTATIONS` (`{ file: "app/api/admin/onboarding/pull-sheet-override/route.ts", fn: "POST", code: "PULL_SHEET_OVERRIDE_SET" }` and `..._CLEARED`). Extend `adminOutcomeBehavior.test.ts` with the executable success-branch proof for both codes. Extend the two advisory-lock meta-tests.

`setPullSheetOverrideRpcAuth.test.ts` (against `$TEST_DATABASE_URL`): a non-service (authenticated-role) `select set_pull_sheet_override(...)` is denied by the grant; a service-role call with a forged/stale `p_wizard_session_id` raises (no write).

Run all → **PASSES**. Commit: `feat(admin): pull-sheet-override accept/revoke route (CAS, RPC-only lock, audited)`

---

## Task 9 — Publish propagation: Flow A + Flow B

**Spec:** §5.5, I6, corrections #4/#5. **Files:**
- `lib/sync/applyStagedCore.ts` (Flow A propagation, near `source_anchors` `:434` + first-seen INSERT `~:1152`)
- `app/api/admin/onboarding/finalize/route.ts` (Flow B: write both new values into `shows_pending_changes.payload`)
- `lib/onboarding/shadowPayload.ts` (`ParsedShadowPayloadForApply` `:38`, `parseShadowPayloadForApply` `:75` — surface both)
- `lib/onboarding/applyRescanDecisionUnderLock.ts` (Phase-D apply writes `payload.pull_sheet_override` → `shows`)
- `tests/onboarding/pullSheetOverridePropagation.test.ts` (NEW)

### Step 9.1 — Failing propagation tests

```ts
it("Flow A: pending_syncs.pull_sheet_override copied to shows on first-seen publish", async () => { /* assert shows row has the override */ });
it("Flow B: existing-show shadow carries BOTH pull_sheet_override and pull_sheet_override_applied in payload; Phase-D writes override to shows post-pending_syncs-deletion", async () => { /* ... */ });
```

Run → **FAILS**.

### Step 9.2 — Impl

- **Flow A** (`applyStagedCore.ts`): where the first-seen INSERT threads `sourceAnchors` (`~:1155`), also read the locked `pending_syncs.pull_sheet_override` and write it to `shows.pull_sheet_override`. (Under the existing `show:` lock — no new holder.)
- **Flow B** (`finalize/route.ts`): when staging an existing show into `shows_pending_changes.payload`, add `pull_sheet_override` (desired) AND `pull_sheet_override_applied` (the staged parse's snapshot) to the payload object BEFORE deleting the `pending_syncs` row.
- **`shadowPayload.ts`:** extend `ParsedShadowPayloadForApply` with `pullSheetOverride: PullSheetOverride | null` and `pullSheetOverrideApplied: OverrideSnapshot`, and parse/validate them in `parseShadowPayloadForApply` (`:75`) fail-closed like the existing fields.
- **`applyRescanDecisionUnderLock.ts`:** at Phase-D apply, under the `show:` lock, run the 5.8 gate **payload-internally** (`payload.pullSheetOverrideApplied` deep-equals `overrideSnapshot(payload.pullSheetOverride)` — NOT vs stale durable `shows`), and on pass write `payload.pullSheetOverride` to `shows.pull_sheet_override`.

Run → **PASSES**. Commit: `feat(onboarding): propagate pull_sheet_override to shows on both finalize flows (payload-carried for Flow B)`

---

## Task 10 — Flow C: live-cron deferred-apply snapshot + gate

**Spec:** §5.8 Flow C, I5(c), Codex R11. **Files:**
- `lib/sync/runScheduledCronSync.ts` (`upsertLivePendingSync:933` writes `pull_sheet_override_applied`)
- `lib/sync/applyStaged.ts` (`readLivePendingSyncForApply:1197,1437` gate)
- `tests/sync/flowCLivePendingApplyGate.test.ts` (NEW)

### Step 10.1 — Failing Flow C gate test

```ts
it("Flow C: live pending staged under override A, durable shows.override revoked before apply => apply REFUSED (no stale live parse)", async () => {
  // upsertLivePendingSync wrote applied = overrideSnapshot(A); shows.pull_sheet_override = null at apply
  const result = await applyLivePending({ /* deps: shows override null, staged applied = A */ });
  expect(result.kind).toBe("override_snapshot_mismatch"); // discard-and-rerun, not applied
});
```

Run → **FAILS**.

### Step 10.2 — Impl

- `upsertLivePendingSync`: write `pull_sheet_override_applied = overrideSnapshot(override-as-of-lock)` atomically with the staged live `parse_result`, under the `show:` lock.
- `readLivePendingSyncForApply` apply path (`applyStaged.ts:1197/1437`): under the `show:` lock, gate `staged.pull_sheet_override_applied` deep-equals `overrideSnapshot(shows.pull_sheet_override)` (durable IS the desired value for live sync — no wizard/payload). On mismatch → discard-and-rerun (do not apply); next cron re-parses under the current override. On match → apply.

Run → **PASSES**. Commit: `feat(sync): Flow C live-cron deferred-apply gates staged parse against durable override`

---

## Task 11 — Finalize consistency gate (5.8) Flow A/B + failed-re-scan states

**Spec:** §5.8, I4, §15 tests 4/8d. **Files:**
- `lib/onboarding/applyRescanDecisionUnderLock.ts` (Flow A gate) / `applyStagedCore.ts`
- `app/api/admin/onboarding/finalize-cas/route.ts` (surface the typed blocking outcome via lookup copy)
- `tests/onboarding/finalizeOverrideConsistencyGate.test.ts` (NEW)

### Step 11.1 — Failing gate tests (4 cases, §15 test 8d + test 4)

```ts
it("Flow A accepted-then-revoke-then-failed-rescan => finalize REFUSED (applied=A, desired=null)", () => { /* ... */ });
it("Flow A accept-then-failed-rescan => finalize REFUSED until reconverge (override=A, applied=null)", () => { /* ... */ });
it("Flow B durable=A, staged-under-A, revoke=>null, rescan fails => payload {override:null, applied:A} => gate compares A vs null => REFUSED (NOT buggy durable-A pass)", () => { /* Codex R8 */ });
it("Flow B legitimate accept durable-null=>A, staged-under-A => payload {override:A, applied:A} => gate PASSES, shows.override=A (NOT permanently blocked)", () => { /* ... */ });
it("overrideSnapshot compare ignores acceptedBy/acceptedAt: accepted-then-rescanned row DOES finalize (Flow A & B)", () => { /* Codex R3-1 subset-vs-object bug cannot recur */ });
```

Run → **FAILS**.

### Step 11.2 — Impl

Under the `show:` lock at finalize/apply, gate `applied === overrideSnapshot(desired)`:
- **Flow A:** desired = live `pending_syncs.pull_sheet_override`; applied = `pending_syncs.pull_sheet_override_applied`.
- **Flow B:** desired = `payload.pullSheetOverride`; applied = `payload.pullSheetOverrideApplied` (payload-internal, NOT stale durable `shows`).
On mismatch → typed blocking outcome (`re-scan needed before publishing`) surfaced via lookup copy (invariant 5), never a silent apply. Declarative gate — no compensation write; a successful re-scan reconverges `applied` → `override`.

Run → **PASSES**. Commit: `feat(onboarding): finalize gate refuses staged parse out of sync with desired override (Flow A/B)`

---

## Task 12 — Step-3 UI: `PackListBreakdown` S1–S4 (OPUS-OWNED, impeccable dual-gate)

**Spec:** §5.6, §5.9, §6, §10, §11. **OWNERSHIP:** this task's primary deliverable is UI code (`components/`) → **Opus-only** per ROUTING hard rule. Before whole-diff review it MUST pass **invariant-8 impeccable dual-gate**: `/impeccable critique` AND `/impeccable audit` on the diff, HIGH/CRITICAL fixed or DEFERRED.md'd, with the canonical v3 preflight gates (PRODUCT.md → DESIGN.md → register → preflight signal). External attestation required (not self-attested).

**No real-browser layout task** (spec §11 — not a fixed-dimension flex/grid parent). **No transition-audit task** (spec §10 — S1–S4 are instant re-renders). Both stated explicitly so they are not added.

**Files:**
- `components/admin/wizard/step3ReviewSections.tsx` (`PackListBreakdown` def `:1313`, `"No pack list parsed."` `:1323`, DTO `pullSheet` `:2053`, render registration `:2604`)
- `components/admin/wizard/Step3SheetCard.tsx` (`arr(pr.pullSheet)` `:429`, DTO shaping `:542` — add `archivedPullSheetTabs`)
- `tests/components/admin/wizard/packListBreakdownStates.test.tsx` (NEW)

**Interfaces — Consumes:** `pr.pullSheet: PullSheetCase[]`, `pr.archivedPullSheetTabs: ArchivedPullSheetTab[]`, `dfid` (driveFileId), `wizardSessionId` (threaded from `SectionData`), override-active flag. **Produces:** S1–S4 render + accept/revoke buttons POSTing the FULL route body (`driveFileId`, `wizardSessionId`, `tabName`, `expectedFingerprint`) to the Task 8 route.

> **Codex plan-R1 finding 1:** the Task 8 route/RPC requires `wizardSessionId` (in-RPC active-session guard). `PackListBreakdown` MUST receive and send it, or accept/revoke cannot validate the session. `wizardSessionId` is already available in the Step-3 wizard context (the wizard is a single active onboarding session); thread it through `SectionData`/`Step3SheetCard` shaping into `PackListBreakdown` props.

### Step 12.1 — Failing S1–S4 render tests (anti-tautology: assert against data inputs; scope DOM to Pack list section)

```ts
function packListSection(container: HTMLElement) {
  // Clone + remove sibling sections that independently render a tab name (anti-tautology)
  const clone = container.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[data-section]:not([data-section="pack-list"])').forEach((n) => n.remove());
  return clone;
}

it("S1 Empty: no pull sheet, no archived tabs => 'No pack list parsed.'", () => {
  render(<PackListBreakdown dfid="d" wizardSessionId="sess-1" cases={[]} archivedPullSheetTabs={[]} overrideActive={false} />);
  expect(packListSection(screen.getByTestId("step3-card")).textContent).toContain("No pack list parsed.");
});

it("S2 Offer: archivedPullSheetTabs entry (contentChangedSinceAccept:false), no override => warning card lists EVERY headerPreview + both buttons", () => {
  const pr = { pullSheet: [], archivedPullSheetTabs: [
    { tabName: "OLD PULL SHEET", headerPreviews: ["RIA - CHICAGO", "MIAMI"], fingerprint: "ff", included: false, contentChangedSinceAccept: false },
  ]};
  render(<PackListBreakdown dfid="d" wizardSessionId="sess-1" cases={pr.pullSheet} archivedPullSheetTabs={pr.archivedPullSheetTabs} overrideActive={false} />);
  const sec = packListSection(screen.getByTestId("step3-card"));
  expect(sec.textContent).toContain("OLD PULL SHEET");
  expect(sec.textContent).toContain("RIA - CHICAGO"); // I2: every case shown
  expect(sec.textContent).toContain("MIAMI");
  const accept = screen.getByRole("button", { name: /use this show's gear/i });
  // 10b fingerprint transport + full body: accept POSTs driveFileId, wizardSessionId, tabName, expectedFingerprint
  fireEvent.click(accept);
  const body = JSON.parse((fetchSpy.mock.calls.at(-1)![1] as RequestInit).body as string);
  expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("/pull-sheet-override"), expect.anything());
  // S2 first-time accept: expectedOverrideSnapshot is null (no active override yet) — row-state CAS
  expect(body).toEqual({ driveFileId: "d", wizardSessionId: "sess-1", tabName: "OLD PULL SHEET", expectedFingerprint: "ff", expectedOverrideSnapshot: null });
});

it("S3 Included: override active, pullSheet populated => pack list + 'Included from archived tab' note + Revoke posts full body with tabName:null", () => {
  render(<PackListBreakdown dfid="d" wizardSessionId="sess-1"
    cases={[{ caseLabel: "FOH", items: [{ qty: 1, cat: null, subCat: null, item: "Rack" }] }]}
    archivedPullSheetTabs={[{ tabName: "OLD PULL SHEET", headerPreviews: ["RIA"], fingerprint: "ff", included: true, contentChangedSinceAccept: false }]}
    overrideActive={true} />);
  const sec = packListSection(screen.getByTestId("step3-card"));
  expect(sec.textContent).toMatch(/Included from archived tab/i);
  fireEvent.click(screen.getByRole("button", { name: /revoke/i }));
  const body = JSON.parse((fetchSpy.mock.calls.at(-1)![1] as RequestInit).body as string);
  // S3 revoke: expectedOverrideSnapshot = the active override's snapshot (row-state CAS)
  expect(body).toEqual({ driveFileId: "d", wizardSessionId: "sess-1", tabName: null, expectedOverrideSnapshot: { tabName: "OLD PULL SHEET", fingerprint: "ff" } });
});

it("S4 Re-confirm: entry contentChangedSinceAccept:true + override null + empty pullSheet => 'changed — re-confirm' prefix, NOT generic S2 copy (Codex R10-2)", () => {
  const pr = { pullSheet: [], archivedPullSheetTabs: [
    { tabName: "OLD PULL SHEET", headerPreviews: ["MIAMI"], fingerprint: "ee", included: false, contentChangedSinceAccept: true },
  ]};
  render(<PackListBreakdown dfid="d" wizardSessionId="sess-1" cases={[]} archivedPullSheetTabs={pr.archivedPullSheetTabs} overrideActive={false} />);
  expect(screen.getByTestId("step3-card").textContent).toMatch(/changed — re-confirm/i);
});

it("S4 mixed workbook: current non-OLD pull sheet PRESENT + changed OLD tab => renders current pack list AND the re-confirm card (S4 NOT suppressed by non-empty pullSheet, plan-R5-2)", () => {
  render(<PackListBreakdown dfid="d" wizardSessionId="sess-1"
    cases={[{ caseLabel: "FOH", items: [{ qty: 1, cat: null, subCat: null, item: "Current DI Box" }] }]}
    archivedPullSheetTabs={[{ tabName: "OLD PULL SHEET", headerPreviews: ["MIAMI"], fingerprint: "ee", included: false, contentChangedSinceAccept: true }]}
    overrideActive={false} />);
  const sec = packListSection(screen.getByTestId("step3-card"));
  expect(sec.textContent).toContain("Current DI Box");            // current gear still rendered
  expect(sec.textContent).toMatch(/changed — re-confirm/i);        // AND the changed-tab re-confirm card
});

it("multiple OLD tabs => one card + accept button per tab (render all, no truncation)", () => { /* §6 cap */ });
it("empty headerPreviews entry string => '(no header text)' but card still renders", () => { /* §6 guard */ });
```

Run → **FAILS**.

### Step 12.2 — Impl

Extend `PackListBreakdown` props to `{ dfid, wizardSessionId, cases, archivedPullSheetTabs, overrideActive }` (Codex plan-R1-1). Accept/revoke handlers POST the full body: accept `{ driveFileId: dfid, wizardSessionId, tabName, expectedFingerprint, expectedOverrideSnapshot }`; revoke `{ driveFileId: dfid, wizardSessionId, tabName: null, expectedOverrideSnapshot }`. Compute `expectedOverrideSnapshot` from the CURRENT rendered state (row-state CAS, Codex plan-R3-1): when `overrideActive`, it is `{ tabName, fingerprint }` of the `included:true` entry (S3); otherwise `null` (S2 first-time / S4 re-confirm, where no override is active). On a **409 `{ status: "stale_review" }`** response (Codex plan-R1-3), the handler re-fetches the Step-3 preview (same success path) instead of showing a bespoke error — the re-rendered card carries the changed-content message. Render the state table from §5.6:
- **S1:** `cases` empty + `archivedPullSheetTabs` empty → `"No pack list parsed."` (unchanged).
- **S2:** an entry with `contentChangedSinceAccept === false` and `!overrideActive` → per-tab warning card `"Found a pull sheet on archived tab '{tabName}'."`, then `headerPreviews.map((p, i) => "Case {i+1} header reads '{p || "(no header text)"}'")` as a list, `"If this is this show's gear, include it; otherwise leave it skipped."` + `[Use this show's gear]` (POST that entry's `fingerprint` as `expectedFingerprint`) / `[Keep skipped]`.
- **S3:** `overrideActive` + populated `cases` → normal pack list + subtle `"Included from archived tab '{tabName}'."` + `[Revoke]`.
- **S4:** entry `contentChangedSinceAccept === true` + `!overrideActive` → S2 card + prefix `"The archived tab '{tabName}' changed — re-confirm before it publishes."`. **Do NOT gate on empty `cases`** (plan-R5-2): when a current non-OLD pull sheet survived the auto-clear (mixed workbook, plan-R4), render the normal current Pack list from `cases` **and** the changed-tab re-confirm card. S4 is orthogonal to whether `cases` is empty.
All copy via `lib/messages/lookup.ts` (invariant 5 — no raw codes). Buttons call the Task 8 route; on success re-fetch the (re-scanned) preview. Thread `archivedPullSheetTabs` through the DTO in `Step3SheetCard.tsx:542` and the section registry `:2604`. Add `data-section="pack-list"` to the section wrapper for the DOM-scoping test.

Run → **PASSES**. Then run `/impeccable critique` + `/impeccable audit` on the diff; record findings + dispositions. Commit: `feat(admin): Step-3 PackListBreakdown S1-S4 archived-tab offer/include/re-confirm states`

---

## Task 13 — DataQualityBadge coverage — **FOLDED INTO TASK 4** (Codex plan-R2-4)

The badge count assertion was moved into **Task 4 Step 4.1** so it is genuinely **fail-first** (before `PULL_SHEET_ON_ARCHIVED_TAB` is added to `GAP_CLASSES`, `summarizeDataGaps(...).total` is `0`, the badge shows the clean state, and the "counts the archived-tab warning" assertion fails; after the edit it passes). A standalone "run → PASSES with no impl" task violated the TDD invariant (#1), so this task no longer exists as a separate commit. §15 test 11 is delivered by Task 4. Task numbers 14/15 are unchanged.

---

## Task 14 — Schema manifest regen + validation-project apply

**Spec:** §8 Manifest/validation row, AGENTS.md validation-schema-parity gate. **Files:** `supabase/__generated__/schema-manifest.json` (regen), no test file (CI `validation-schema-parity` enforces).

### Steps
1. Confirm the migration is applied to the LOCAL all-migrations DB (Task 1 did this).
2. `pnpm gen:schema-manifest` → regenerates `supabase/__generated__/schema-manifest.json` including the 3 new columns. Commit the regenerated manifest (Layer-1 tripwire fails if skipped).
3. Apply the migration **surgically** to validation project `vzakgrxqwcalbmagufjh` (blocked for `db push`): `psql "$TEST_DATABASE_URL" -f supabase/migrations/20260706000000_pull_sheet_override.sql` (TEST_DATABASE_URL points at validation per the "validation creds in MAIN .env.local" lesson) then `psql "$TEST_DATABASE_URL" -c "notify pgrst, 'reload schema';"`. Layer-2 (`tests/db/validation-schema-parity.test.ts`) asserts validation ⊇ manifest.
4. Verify: `pnpm vitest run tests/db/validation-schema-parity.test.ts` → green.

Commit: `chore(db): regen schema manifest + apply pull_sheet_override migration to validation`

---

## Task 15 — Self-review → Adversarial review (cross-model) → whole-diff → CI → close-out

**MANDATORY** per AGENTS.md writing-plans additions. Between self-review and execution handoff:

1. **Full-suite verification before push** (scoped gates miss regressions): `pnpm test` (full), `pnpm typecheck` (vitest strips types), `pnpm lint` (canonical Tailwind ERROR class), `pnpm format:check` (`--no-verify` bypasses prettier), `pnpm vitest run tests/messages tests/cross-cutting` (12.4 gates), the advisory-lock + auditable-mutation + grant meta-tests.
2. **Impeccable dual-gate** on the UI diff (Task 12) recorded — external attestation.
3. **Adversarial review (cross-model)** via `adversarial-review` skill → Codex, iterate to APPROVE (autonomous-ship: no round budget). Pre-load the do-not-relitigate list from spec §14 (DEF-2 not reverted; single-holder RPC-only lock; both-tables storage intentional; null-default intentional; server-computed fingerprint; content-pin fail-safe; pre-lock reconciled under-lock; both-flow propagation; RPC not a PostgREST bypass; CAS pins reviewed content; persisted fingerprint transport; declarative finalize gate; case-region unit; three deferred-apply paths gated).
4. **Whole-diff Codex cross-model review** to APPROVE (fresh-eyes posture).
5. Push → **real CI green** (not just local — local-passes-CI-fails is its own class) → `gh pr merge --merge` → fast-forward local main.

(This task carries no code; it is the process gate. Do NOT run adversarial review as part of plan authoring — it runs at execution time.)

---

## Test → invariant → spec mapping (coverage check)

| §15 test | Task | Invariant |
|---|---|---|
| 1 Detection | 2 | I1 |
| 2 No-pull-sheet / stray-mention negative | 2 | I1 |
| 3 Un-skip granularity + late-item region | 2 | I1, DEF-2 |
| 4 Fingerprint stability + snapshot subset compare | 2, 11 | I1, I3, I4 |
| 5 Override read/include | 6 | I5 |
| 5b Multi-block pin / 5c accepted-tab metadata / 5d multi-case preview | 2, 6 | I1, I2, I5 |
| 6 Content-change discard-and-rerun (no-override re-parse: OLD gear dropped, current non-OLD gear preserved) | 6 | I5(b) |
| 7 Publish propagation both flows | 9 | I6 |
| 8 Advisory lock + locked snapshot | 7, 8 | I5(a), I7 |
| 8b RPC grant/auth | 1, 8 | I7 |
| 8c Accept CAS | 8 | I3 |
| 8e Flow C live-cron gate | 10 | I5(c) |
| 8d Staged↔override on failed re-scan (both flows) | 11 | I4 |
| 9 Admin gate + behavioral proof | 8 | inv. 10 |
| 10 / 10b Step-3 S1–S4 + fingerprint transport | 12 | I2, I3 |
| 11 DataQualityBadge (fail-first, folded) | 4 | — |
| tab_missing reconcile (renamed/deleted override tab) | 6 | I5, §6 |
| durable cron content-drift auto-clear | 6 | I5, I6 |
| rescanWizardSheet path persists archivedPullSheetTabs + inclusion/drift (accept/refresh path) | 6 (6.5) | I2, I3, I5 |
| PostgREST DML lockdown on host tables | 1 | I7 |

Every I1–I7 invariant and every §15 test has a home. No orphan tests; no orphan tasks.
