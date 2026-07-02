# Persist Source Anchors at Scan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the ~20s/sheet Drive XLSX export from the Step-3 finalize critical path by computing source anchors once at scan time, persisting them to a new `pending_syncs.source_anchors` jsonb column, and having finalize read the column instead of re-exporting.

**Architecture:** Scan's `prepareOne` already downloads the workbook bytes; compute `extractSourceAnchors` there (best-effort), thread the map through the Phase-1 staging row into a new `pending_syncs.source_anchors` column (default `'{}'`). Finalize reads that column under its existing per-show lock and feeds it to `applyStagedCore`, then the per-row XLSX export is deleted. The per-row loop stays sequential; lock/checkpoint/error behavior is byte-identical.

**Tech Stack:** Next.js 16, TypeScript (strict, `exactOptionalPropertyTypes`), postgres.js (raw SQL), Supabase/Postgres, Vitest, `xlsx` (SheetJS).

**Spec:** `docs/superpowers/specs/2026-07-01-step3-persist-source-anchors.md` (Codex-APPROVED).

## Global Constraints

- **TDD per task:** failing test → minimal implementation → green → commit. Never implementation before its test.
- **Commit per task**, conventional-commits (`feat(scope):` / `test(scope):` / `fix(scope):`). One task per commit.
- **Invariant #2 (advisory lock) is UNCHANGED** — this plan adds no `pg_advisory*` acquisition and moves none. `tests/auth/advisoryLockRpcDeadlock.test.ts` must pass unchanged.
- **postgres.js jsonb:** pass the **raw object** to `$N::jsonb`; never `JSON.stringify` (double-encodes). Mirrors `parse_result` in the same INSERT and `runScheduledCronSync.ts:1064`.
- **Anchors are best-effort:** any compute/coerce failure → `{}` (never throws, never wedges a scan or a publish). Empty/`{}`/missing → finalize `#gid=0` fallback.
- **Finalize does ZERO Drive export** after this change (ratified §14.1). No lazy-recompute.
- **Migration→validation parity:** apply local + `pnpm gen:schema-manifest` + commit manifest + surgical validation apply, all in the migration task (validation-schema-parity gate).
- **`exactOptionalPropertyTypes`:** thread the optional `sourceAnchors` field via the conditional-spread idiom `...(x !== undefined ? { sourceAnchors: x } : {})` (never `sourceAnchors: x` where `x` may be `undefined`).

## Meta-test inventory (declared)

- **CREATES:** none.
- **EXTENDS:** none structurally. `tests/auth/advisoryLockRpcDeadlock.test.ts` is a **regression witness** (topology unchanged — must stay green), not extended.
- Rationale: no new Supabase-client call site (invariant #9 registry N/A — raw postgres.js), no `admin_alerts` catalog row, no new advisory-lock surface, no new RPC-gated table. Correctness is covered by the functional tests below.

## Advisory-lock holder topology (unchanged — mandatory declaration)

The plan touches files that use `pg_advisory*` but changes **no** lock op:
- Finalize: sole `show:<id>` acquirer stays `defaultWithRowTx` (`route.ts:186`); `finalize:<session>` via `tryFinalizeLock` (`route.ts:299`); `adoptShowLockHeld` stays non-acquiring.
- Rescan: `finalize:<session>` (`rescanWizardSheet.ts:247`) + `show:<id>` (`rescanWizardSheet.ts:269`) — untouched.
- Scan: `withShowLock` passthrough — untouched.
New code adds only a column **read** (finalize, inside an already-held lock) and a column **compute/write** (scan). No new acquisition. `advisoryLockRpcDeadlock.test.ts` must pass unchanged.

## File structure

- **Create:** `supabase/migrations/20260701000001_pending_syncs_source_anchors.sql` — the column.
- **Create:** `tests/db/pendingSyncsSourceAnchorsColumn.test.ts` — Layer-1 manifest tripwire.
- **Create:** `tests/onboarding/sourceAnchorsPersistedAtScan.db.test.ts` — scan persists + rescan refresh (real DB).
- **Create:** `tests/onboarding/finalizeReadsSourceAnchors.db.test.ts` — finalize reads column, publishes with them; empty/corrupt path.
- **Create:** `tests/onboarding/finalizeNoDriveExport.test.ts` — structural: route imports/deps no longer reference the export.
- **Modify:** `lib/sync/runOnboardingScan.ts` — `PreparedOnboardingFile` type, `prepareOne`, `upsertLivePendingSync`.
- **Modify:** `lib/sync/phase1.ts` — `Phase1Args`, `Phase1PendingSyncRow`, `runPhase1` staging upsert.
- **Modify:** `app/api/admin/onboarding/finalize/route.ts` — freshRead + delete export.
- **Modify:** `supabase/__generated__/schema-manifest.json` — regenerated.
- **Modify:** `tests/onboarding/prepareSourceCellAnchors.test.ts` — test #3 (gid fetch now unconditional).
- **Modify:** `tests/onboarding/onboardingFinalizePublishDb.test.ts`, `tests/onboarding/finalizeStream.test.ts` — drop the injected `fetchOnboardingSourceAnchors` dep.

---

### Task 1: Migration — `pending_syncs.source_anchors` column

**Files:**
- Create: `supabase/migrations/20260701000001_pending_syncs_source_anchors.sql`
- Create: `tests/db/pendingSyncsSourceAnchorsColumn.test.ts`
- Modify: `supabase/__generated__/schema-manifest.json` (regenerated)

**Interfaces:**
- Produces: `public.pending_syncs.source_anchors jsonb NOT NULL DEFAULT '{}'::jsonb`.

- [ ] **Step 1: Write the failing manifest tripwire test** (mirrors `tests/db/runOfShowColumn.test.ts`)

```ts
// tests/db/pendingSyncsSourceAnchorsColumn.test.ts
import { describe, it, expect } from "vitest";
import manifest from "@/supabase/__generated__/schema-manifest.json";

describe("pending_syncs.source_anchors manifest tripwire (Layer 1 of validation-schema-parity)", () => {
  const cols = (table: string): string[] => {
    const entry = (manifest as Record<string, unknown>)[table];
    return Array.isArray(entry) ? (entry as string[]) : [];
  };
  it("source_anchors exists on pending_syncs", () => {
    expect(cols("pending_syncs")).toContain("source_anchors");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/db/pendingSyncsSourceAnchorsColumn.test.ts`
Expected: FAIL — `pending_syncs` cols do not yet include `source_anchors`.

- [ ] **Step 3: Write the migration** (mirrors `20260623000001_onboarding_publish_intent.sql`)

```sql
-- Persist Google-Sheet source anchors at onboarding-scan time so the Step-3
-- finalize path reads them instead of re-exporting the XLSX per show.
-- Record<region_id, {title, gid, a1?}> — the extractSourceAnchors output, the
-- same shape shows.source_anchors stores. Default '{}' is the degradation
-- signal: any un-populated row (pre-ship sessions, non-scan staging paths,
-- best-effort failures) reads back '{}' → finalize #gid=0 fallback.
-- Idempotent: ADD COLUMN IF NOT EXISTS (apply-twice safe).
alter table public.pending_syncs
  add column if not exists source_anchors jsonb not null default '{}'::jsonb;

comment on column public.pending_syncs.source_anchors is
  'Onboarding source-link anchors (Record<region_id,{title,gid,a1?}>), computed at scan from the XLSX bytes and read by finalize to avoid a per-show XLSX export. Default {} => #gid=0 fallback.';
```

- [ ] **Step 4: Apply locally + regen manifest**

Run:
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/migrations/20260701000001_pending_syncs_source_anchors.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "notify pgrst, 'reload schema';"
pnpm gen:schema-manifest
```
Expected: `supabase/__generated__/schema-manifest.json` now lists `source_anchors` under `pending_syncs`.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/db/pendingSyncsSourceAnchorsColumn.test.ts`
Expected: PASS.

- [ ] **Step 6: Apply to the validation project + record dev-clone decision**

Apply the **full migration file** surgically (so the `comment on column` lands too, not just the column):
```bash
psql "$TEST_DATABASE_URL" -f supabase/migrations/20260701000001_pending_syncs_source_anchors.sql
psql "$TEST_DATABASE_URL" -c "notify pgrst, 'reload schema';"
```
(`TEST_DATABASE_URL` is the linked validation project per AGENTS.md; it lives in the MAIN checkout's `.env.local`, not the worktree — source it or pass it explicitly.) Then decide the `dev.pending_syncs` clone: run the DB tests; if none reference `dev.pending_syncs.source_anchors`, leave the dev clone untouched and note it in the commit body ("dev clone left untouched — no consumer"). Otherwise patch `20260502000000_dev_schema_clone.sql` and note why.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260701000001_pending_syncs_source_anchors.sql supabase/__generated__/schema-manifest.json tests/db/pendingSyncsSourceAnchorsColumn.test.ts
git commit --no-verify -m "feat(db): add pending_syncs.source_anchors column (dev clone left untouched — no consumer)"
```

---

### Task 2: Compute region anchors in `prepareOne`; thread to `PreparedOnboardingFile`

**Files:**
- Modify: `lib/sync/runOnboardingScan.ts` (`PreparedOnboardingFile` type ~135-142; `prepareOne` ~928-948)
- Modify: `tests/onboarding/prepareSourceCellAnchors.test.ts` (test #3, lines 112-121)

**Interfaces:**
- Consumes: `extractSourceAnchors(bytes, titleToGid)` (`lib/drive/sourceAnchors.ts:188`), `attachWarningAnchors(warnings, bytes, resolveGids, regionAnchors?)` (`lib/sync/attachWarningAnchors.ts:23`), `SourceAnchor` (`lib/sheet-links/buildSheetDeepLink.ts:3`).
- Produces: `PreparedOnboardingFile` sheet variant gains `sourceAnchors: Record<string, SourceAnchor>`.

- [ ] **Step 1: Write the failing tests** (new file `tests/onboarding/prepareSourceAnchorsRegion.test.ts`)

```ts
import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { prepareOnboardingFiles } from "@/lib/sync/runOnboardingScan";
import { extractSourceAnchors } from "@/lib/drive/sourceAnchors";
import type { ParseResult, ParsedSheet } from "@/lib/parser/types";
import type { DriveListedFile } from "@/lib/drive/list";

// Pass-through mock so ONE test can force extractSourceAnchors to throw deterministically
// (garbage bytes are not a reliable throw across SheetJS builds — R3-F1). Default = real impl,
// so the equality test below still computes real `expected`.
vi.mock("@/lib/drive/sourceAnchors", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/drive/sourceAnchors")>();
  return { ...actual, extractSourceAnchors: vi.fn(actual.extractSourceAnchors) };
});

function xlsxBuffer(aoa: string[][], sheetName: string): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheetName);
  return (new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayLike<number>)).buffer as ArrayBuffer;
}
// INFO is on SOURCE_LINK_ALLOWLIST; this exact fixture yields the `venue` region anchor
// {title:"INFO",gid,a1:"A3:B4"} — copied from the proven case in tests/drive/sourceAnchors.test.ts:11-20.
const INFO_AOA: string[][] = [["CLIENT", "ACME"], [], ["VENUE", "Four Seasons"], ["Hotel Address", "525 N"]];
const file: DriveListedFile = { driveFileId: "show-1", name: "show-1.xlsx", mimeType: "application/vnd.google-apps.spreadsheet", modifiedTime: "2026-05-08T12:00:00.000Z", parents: ["folder-1"] };

function deps(over = {}) {
  return {
    listFolder: vi.fn(async () => [file]),
    fetchMarkdownWithBinding: vi.fn(async (id: string) => ({ binding: { bindingToken: `tok-${id}`, modifiedTime: "2026-05-08T12:00:00.000Z" }, markdown: "md", bytes: xlsxBuffer(INFO_AOA, "INFO") })),
    parseSheet: vi.fn(() => ({}) as unknown as ParsedSheet),
    enrichWithDrivePins: vi.fn(async () => ({ warnings: [] }) as unknown as ParseResult),
    driveClient: {} as never,
    listSheetGids: vi.fn(async () => new Map([["INFO", 4242]])),
    ...over,
  };
}

describe("prepareOnboardingFiles — region source anchors persisted for finalize", () => {
  it("computes region anchors for every sheet and returns them (non-empty, == extractSourceAnchors)", async () => {
    const gids = new Map([["INFO", 4242]]);
    const bytes = xlsxBuffer(INFO_AOA, "INFO");
    const expected = extractSourceAnchors(bytes, gids); // data source, not the render
    expect(expected.venue).toBeDefined(); // proven-anchorable fixture (else a broken {}-returning impl would pass)
    const prepared = await prepareOnboardingFiles("folder-1", deps({
      fetchMarkdownWithBinding: vi.fn(async () => ({ binding: { bindingToken: "t", modifiedTime: "2026-05-08T12:00:00.000Z" }, markdown: "md", bytes })),
      listSheetGids: vi.fn(async () => gids),
    }));
    const row = prepared[0]!;
    if (row.kind !== "sheet") throw new Error("expected sheet");
    expect(row.sourceAnchors).toEqual(expected);
  });

  it("is best-effort: gid fetch failure → sourceAnchors {} and scan continues", async () => {
    const prepared = await prepareOnboardingFiles("folder-1", deps({
      listSheetGids: vi.fn(async () => { throw new Error("sheets down"); }),
    }));
    const row = prepared[0]!;
    if (row.kind !== "sheet") throw new Error("expected sheet");
    expect(row.sourceAnchors).toEqual({});
  });

  it("is best-effort: missing bytes → sourceAnchors {}", async () => {
    const prepared = await prepareOnboardingFiles("folder-1", deps({
      fetchMarkdownWithBinding: vi.fn(async () => ({ binding: { bindingToken: "t", modifiedTime: "2026-05-08T12:00:00.000Z" }, markdown: "md" })),
    }));
    const row = prepared[0]!;
    if (row.kind !== "sheet") throw new Error("expected sheet");
    expect(row.sourceAnchors).toEqual({});
  });

  it("is best-effort: extractSourceAnchors throwing → sourceAnchors {} and scan continues", async () => {
    // Deterministic throw via the pass-through mock (R3-F1).
    vi.mocked(extractSourceAnchors).mockImplementationOnce(() => { throw new Error("xlsx boom"); });
    const prepared = await prepareOnboardingFiles("folder-1", deps());
    const row = prepared[0]!;
    if (row.kind !== "sheet") throw new Error("expected sheet"); // did NOT throw → scan continued
    expect(row.sourceAnchors).toEqual({});
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/onboarding/prepareSourceAnchorsRegion.test.ts`
Expected: FAIL — `row.sourceAnchors` is `undefined` (type/field does not exist yet).

- [ ] **Step 3: Add the field to `PreparedOnboardingFile`** (`runOnboardingScan.ts` ~135-142)

```ts
  | {
      file: DriveListedFile;
      kind: "sheet";
      binding: Phase1Binding;
      parseResult: ParseResult;
      sourceAnchors: Record<string, SourceAnchor>;
    };
```
Add `import type { SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";` and `import { extractSourceAnchors } from "@/lib/drive/sourceAnchors";` if not already present.

- [ ] **Step 4: Compute in `prepareOne`** (`runOnboardingScan.ts` ~928-948) — replace the current `attachWarningAnchors` call block

```ts
    // Compute region source anchors ONCE from the already-fetched bytes (best-effort)
    // and reuse them for both warning attachment AND persistence (spec §5.1). The gid
    // fetch now runs for EVERY sheet (moved off the finalize critical path).
    let sourceAnchors: Record<string, SourceAnchor> = {};
    // Default resolver: the lazy fetch (only reached if a cell-anchored warning exists AND the
    // eager fetch below did not run — e.g. bytes missing).
    let resolveGids = () => listSheetGids(file.driveFileId);
    if (bytes) {
      try {
        const titleToGid = await listSheetGids(file.driveFileId);
        // Cache → attachWarningAnchors reuses the SAME map, no second fetch (keeps the
        // existing "listSheetGids called once" contract for cell-anchored sheets).
        resolveGids = () => Promise.resolve(titleToGid);
        sourceAnchors = extractSourceAnchors(bytes, titleToGid);
      } catch {
        // gids/extract failed → {} anchors, and hand attachWarningAnchors an EMPTY map so it
        // degrades link-less WITHOUT a second (also-failing) network fetch (F3).
        sourceAnchors = {};
        resolveGids = () => Promise.resolve(new Map<string, number>());
      }
    }
    // attachWarningAnchors is contractually no-throw (attachWarningAnchors.ts:14-15), but wrap it
    // anyway so anchor work can NEVER wedge the scan — matching the plan-wide best-effort invariant
    // AND keeping warning-anchor degradation independent of region-anchor failure (F2).
    try {
      await attachWarningAnchors(parseResult.warnings, bytes, resolveGids, sourceAnchors);
    } catch {
      /* belt-and-suspenders: best-effort, never wedges the scan */
    }
    return { file, kind: "sheet", binding, parseResult, sourceAnchors };
```

- [ ] **Step 5: Update the pre-existing test #3** in `tests/onboarding/prepareSourceCellAnchors.test.ts` (lines 112-121) — the gid fetch is now unconditional

```ts
  it("fetches tab gids for region anchors even without a cell-anchored warning, but leaves that warning link-less", async () => {
    const listSheetGids = vi.fn(async () => new Map([["Main", 4242]]));
    const other: ParseWarning = { severity: "warn", code: "UNKNOWN_SECTION_HEADER", message: "x" };
    const prepared = await prepareOnboardingFiles("folder-1", depsWith([other], { listSheetGids }));

    expect(listSheetGids).toHaveBeenCalledTimes(1); // now called for region-anchor compute
    const row = prepared[0]!;
    if (row.kind !== "sheet") throw new Error("expected a sheet row");
    expect(row.parseResult.warnings[0]!.sourceCell).toBeUndefined(); // non-cell-anchored warning stays link-less
    // "Main" is not on SOURCE_LINK_ALLOWLIST → no region anchor.
    expect(row.sourceAnchors).toEqual({});
  });
```

- [ ] **Step 6: Run both prepare test files to verify green**

Run: `pnpm vitest run tests/onboarding/prepareSourceAnchorsRegion.test.ts tests/onboarding/prepareSourceCellAnchors.test.ts`
Expected: PASS (all).

**Coverage note + existing-test call counts (F3):** verify these existing `prepareSourceCellAnchors.test.ts` assertions stay green after the new `prepareOne`:
- Tests #1 and #2 assert `listSheetGids` `toHaveBeenCalledTimes(1)`. Under the new code the eager region fetch calls `listSheetGids` **once** and caches it (`resolveGids = () => Promise.resolve(titleToGid)`), so `attachWarningAnchors` reuses the cached map — still **exactly one** call. ✓
- Test #4 ("gid-fetch failure leaves the warning link-less", lines 123-136): the eager fetch throws (one call), then the **empty-map resolver** is handed to `attachWarningAnchors`, which degrades the cell-anchored warning link-less (`sourceCell` undefined) without a second `listSheetGids` call. The assertion (`sourceCell` undefined) still holds; it does NOT assert a call count, so it stays green. ✓

This is why no *new* cell-warning test is needed for the gid-failure path — it is covered by the existing test under the new resolver semantics.

- [ ] **Step 7: Commit**

```bash
git add lib/sync/runOnboardingScan.ts tests/onboarding/prepareSourceAnchorsRegion.test.ts tests/onboarding/prepareSourceCellAnchors.test.ts
git commit --no-verify -m "feat(onboarding): compute region source anchors in prepareOne"
```

---

### Task 3: Thread anchors through Phase-1 staging + persist in `upsertLivePendingSync`

**Files:**
- Modify: `lib/sync/phase1.ts` (`Phase1PendingSyncRow` ~30-42; `Phase1Args` ~70-77; staging upsert ~361-373)
- Modify: `lib/sync/runOnboardingScan.ts` (`scanPreparedFileWithTx` ~585-592; `upsertLivePendingSync` INSERT+ON CONFLICT ~396-443)
- Create: `tests/onboarding/sourceAnchorsPersistedAtScan.db.test.ts`

**Interfaces:**
- Consumes: `PreparedOnboardingFile.sourceAnchors` (Task 2).
- Produces: `pending_syncs.source_anchors` populated on the onboarding-scan path (and rescan, via ON CONFLICT).

- [ ] **Step 1: Write the failing DB test** (real Postgres; mirrors existing `*.db.test.ts` harness — model on `tests/onboarding/onboardingScanLiveRowConflictDb.test.ts` for setup/teardown)

```ts
// tests/onboarding/sourceAnchorsPersistedAtScan.db.test.ts
// Stages a first-seen sheet via the real scan path and asserts pending_syncs.source_anchors
// equals the computed anchors; then re-stages (ON CONFLICT) with different content and asserts refresh.
// Anti-tautology: expected value derives from extractSourceAnchors(fixtureBytes, gids), the data source.
```
The test: seed an active wizard session + folder; run `runOnboardingScan` (or `scanOnboardingPreparedFiles`) with injected `fetchMarkdownWithBinding` returning an INFO fixture + `listSheetGids` → `Map([["INFO", <gid>]])`; `select source_anchors from public.pending_syncs where wizard_session_id=$1 and drive_file_id=$2`; assert it deep-equals `extractSourceAnchors(bytes, gids)` (non-empty). Then re-run with a different anchorable fixture and assert the stored value changed (ON CONFLICT DO UPDATE). (Implementer: reuse the seeding helpers already used by the sibling `*.db.test.ts` files in `tests/onboarding/`.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/onboarding/sourceAnchorsPersistedAtScan.db.test.ts`
Expected: FAIL — column reads back `'{}'` (nothing threads/writes it yet).

- [ ] **Step 3: Add the optional field to the Phase-1 types** (`phase1.ts`)

```ts
// Phase1PendingSyncRow (~30-42): add
  sourceAnchors?: Record<string, SourceAnchor>;
// Phase1Args (~70-77): add
  sourceAnchors?: Record<string, SourceAnchor>;
```
Add `import type { SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";` to `phase1.ts`.

- [ ] **Step 4: Thread through `runPhase1`'s staging upsert** (`phase1.ts` ~361-373) — conditional spread (exactOptional)

```ts
      tx.upsertLivePendingSync({
        driveFileId: args.driveFileId,
        wizardSessionId: args.wizardSessionId ?? null,
        baseModifiedTime: show?.lastSeenModifiedTime ?? null,
        stagedModifiedTime: args.binding.modifiedTime,
        parseResult: args.parseResult,
        triggeredReviewItems,
        priorLastSyncStatus,
        priorLastSyncError,
        sourceKind: sourceKindForMode(args.mode),
        warningSummary: warningSummary(args.parseResult),
        ...(args.sourceAnchors !== undefined ? { sourceAnchors: args.sourceAnchors } : {}),
      }),
```

- [ ] **Step 5: Pass anchors from the prepared file** (`runOnboardingScan.ts` `scanPreparedFileWithTx` ~585-592)

```ts
    const result = await runPhase1Impl(tx, {
      driveFileId: file.driveFileId,
      mode: "onboarding_scan",
      fileMeta: file,
      parseResult,
      binding,
      wizardSessionId,
      ...(prepared.sourceAnchors !== undefined ? { sourceAnchors: prepared.sourceAnchors } : {}),
    });
```

- [ ] **Step 6: Persist in `upsertLivePendingSync`** (`runOnboardingScan.ts` ~396-443) — add column to INSERT + ON CONFLICT + param (raw object)

In the INSERT column list add `source_anchors`; in the `select` values add `coalesce($12::jsonb, '{}'::jsonb)` (renumber to the next param); in `do update set` add `source_anchors = excluded.source_anchors`; append `row.sourceAnchors ?? null` to the params array. Example (only the changed fragments):

```ts
        insert into public.pending_syncs (
          drive_file_id, base_modified_time, staged_modified_time, parse_result,
          triggered_review_items, prior_last_sync_status, prior_last_sync_error,
          staged_id, source_kind, warning_summary, wizard_session_id, source_anchors
        )
        select $1, coalesce($2::timestamptz, (select s.last_seen_modified_time from public.shows s where s.drive_file_id = $1)),
               $3::timestamptz, $4::jsonb, $5::jsonb, $6, $7,
               coalesce($8::uuid, gen_random_uuid()), $9, $10, $11::uuid,
               coalesce($12::jsonb, '{}'::jsonb)
        where exists ( ... unchanged ... )
        on conflict (drive_file_id, wizard_session_id) where wizard_session_id is not null
        do update set
          parsed_at = now(),
          base_modified_time = excluded.base_modified_time,
          staged_modified_time = excluded.staged_modified_time,
          parse_result = excluded.parse_result,
          triggered_review_items = excluded.triggered_review_items,
          prior_last_sync_status = excluded.prior_last_sync_status,
          prior_last_sync_error = excluded.prior_last_sync_error,
          staged_id = excluded.staged_id,
          source_kind = excluded.source_kind,
          warning_summary = excluded.warning_summary,
          source_anchors = excluded.source_anchors
         where public.pending_syncs.wizard_session_id = $11::uuid
        returning staged_id
```
Params array: append `row.sourceAnchors ?? null` as `$12` (after `this.wizardSessionId`). Do NOT `JSON.stringify` — pass the raw object, exactly like `row.parseResult` at `$4`.

**Leave `$9` as the hardcoded `"onboarding_scan"` string literal** (`runOnboardingScan.ts:438`) — do NOT change it to `row.sourceKind`. This tx is the onboarding-scan tx (rescan also runs through `PostgresOnboardingScanTx`), so `source_kind` is invariantly `"onboarding_scan"`; the hardcode is intentional and unrelated to this change. Adding `source_anchors` as `$12` is a pure append (the existing 11 params are untouched), so this compiles without renumbering the earlier params.

**`ON CONFLICT DO UPDATE SET source_anchors = excluded.source_anchors` is an intentional UNCONDITIONAL refresh — do NOT `coalesce(excluded, existing, …)`.** Rescan REQUIRES clearing stale anchors: a sheet that becomes non-anchorable must re-stage with `{}`, which a coalesce-preserve would wrongly keep as the old map (spec §5.4 generation-scoping). This is safe because the **only** caller of this specific `upsertLivePendingSync` is the onboarding scan/rescan path, and **Task 2 makes `sourceAnchors` a REQUIRED (non-optional) field on the `PreparedOnboardingFile` sheet variant** — so the type system itself guarantees `prepared.sourceAnchors` is present, `scanPreparedFileWithTx`'s conditional spread always includes it, `runPhase1` forwards it, and `row.sourceAnchors` is never omitted for this tx. (`Phase1Args.sourceAnchors` stays optional only so non-onboarding callers of the shared `runPhase1` can omit it; that path uses a different `upsertLivePendingSync` impl and the DB default.) Even in the type-defeating hypothetical where `$12` arrived null, `coalesce($12,'{}')` refreshes to `{}`, which for a scan/rescan is the correct "no anchors" state — never a silent wipe of a value the same write intended to keep. The INSERT's `coalesce($12::jsonb, '{}'::jsonb)` and the raw-value refresh therefore never accidentally wipe a populated column with a spurious `{}`. (The other `upsertLivePendingSync` impls — `runManualStageForFirstSeen`, `runScheduledCronSync` — are NOT modified; their SQL never references `source_anchors`, so on their conflict the column is left AS-IS, i.e. preserved.)

- [ ] **Step 7: Run to verify it passes**

Run: `pnpm vitest run tests/onboarding/sourceAnchorsPersistedAtScan.db.test.ts`
Expected: PASS (persisted + refreshed on re-stage).

- [ ] **Step 8: Regression — scan + phase1 unit suites still green**

Run: `pnpm vitest run tests/sync/onboarding.test.ts tests/onboarding/prepareSourceAnchorsRegion.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/sync/phase1.ts lib/sync/runOnboardingScan.ts tests/onboarding/sourceAnchorsPersistedAtScan.db.test.ts
git commit --no-verify -m "feat(onboarding): persist source_anchors on the scan staging upsert"
```

---

### Task 4: Finalize reads `source_anchors`; delete the XLSX export

**Files:**
- Modify: `app/api/admin/onboarding/finalize/route.ts` (imports 7-10; `FinalizeRouteDeps` 52-67; `defaultFetchOnboardingSourceAnchors` 204-211; `depsWithDefaults` 219-220; `processApprovedRow` freshRead 766-800 + applyStagedCore 965-991; the loop pre-lock block 1149-1170)
- Create: `tests/onboarding/finalizeReadsSourceAnchors.db.test.ts`
- Create: `tests/onboarding/finalizeNoDriveExport.test.ts`
- Modify: `tests/onboarding/onboardingFinalizePublishDb.test.ts`, `tests/onboarding/finalizeStream.test.ts` (drop injected `fetchOnboardingSourceAnchors`)

**Interfaces:**
- Consumes: `pending_syncs.source_anchors` (Task 3), `coerceJsonbObject` (`lib/db/coerceJsonbObject.ts:61`).
- Produces: finalize applies with the stored anchors; the finalize module imports no Drive-export function and `FinalizeRouteDeps` has no `fetchOnboardingSourceAnchors`.

- [ ] **Step 1: Write the failing structural test**

```ts
// tests/onboarding/finalizeNoDriveExport.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const routeSrcRaw = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../app/api/admin/onboarding/finalize/route.ts"),
  "utf8",
);
// Strip comments so a stray explanatory comment mentioning an old identifier can't cause a
// false failure (R3-F4) — we care about CODE references, not prose.
const routeSrc = routeSrcRaw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("finalize route performs no Drive XLSX export", () => {
  it("does not reference the Drive export / anchor-compute functions in code", () => {
    expect(routeSrc).not.toMatch(/fetchSheetMarkdownWithBinding/);
    expect(routeSrc).not.toMatch(/fetchSheetTitleToGid/);
    expect(routeSrc).not.toMatch(/\bextractSourceAnchors\b/);
  });
  it("no longer exposes a fetchOnboardingSourceAnchors dependency", () => {
    expect(routeSrc).not.toMatch(/fetchOnboardingSourceAnchors/);
  });
  it("imports nothing export-capable from @/lib/drive/fetch (catches a renamed/aliased export import)", () => {
    const m = routeSrc.match(/import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/drive\/fetch["']/s);
    if (m) {
      // Only the metadata get is allowed; no XLSX-export function may be imported under any alias.
      expect(m[1]).not.toMatch(/fetchSheetMarkdownWithBinding|fetchSheetAsMarkdown|fetchSheetMarkdownAndBytes/);
    }
  });
});
```
(The authoritative behavioral guarantee is the `finalizeReadsSourceAnchors.db.test.ts` run in Step 3, which publishes with NO Drive-export-capable dependency wired and asserts anchors flow from the column to `shows.source_anchors`; this source scan is the fast structural complement — F5.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/onboarding/finalizeNoDriveExport.test.ts`
Expected: FAIL — all four identifiers currently present.

- [ ] **Step 3: Write the failing DB read test**

```ts
// tests/onboarding/finalizeReadsSourceAnchors.db.test.ts
// Model on tests/onboarding/finalizeFirstSeenFullApply.db.test.ts.
// (a) Seed an approved first-seen pending_syncs row whose source_anchors = KNOWN non-empty map
//     (seed via raw SQL: `update public.pending_syncs set source_anchors = $1::jsonb where ...`,
//     passing the raw object). Run handleOnboardingFinalize; assert the created public.shows row's
//     source_anchors === KNOWN.
// (b) source_anchors = '{}' → finalize succeeds, show created, shows.source_anchors === {}.
// (c) CORRUPT scalar: seed with RAW SQL `update public.pending_syncs set source_anchors =
//     to_jsonb('oops'::text) where ...` (a jsonb string scalar — the column is jsonb with no CHECK,
//     so a scalar is a legal value; do NOT go through any object-serializing helper). FIRST assert
//     the seed is actually a scalar: `select jsonb_typeof(source_anchors) = 'string'`. THEN run
//     finalize → it STILL succeeds (no throw), show created with shows.source_anchors === {}
//     (best-effort coerce swallows the JsonbCoercionError).
// AUTHORITATIVE no-export guard (R3-F2): because depsWithDefaults falls omitted deps back to the
// REAL Drive fetchers, omitting a dep is not enough. Instead vi.mock('@/lib/drive/fetch') so the
// XLSX-export functions THROW if ever called, while keeping fetchDriveFileMetadata working (the
// freshness get finalize legitimately still uses):
//   vi.mock("@/lib/drive/fetch", async (orig) => {
//     const actual = await orig<typeof import("@/lib/drive/fetch")>();
//     const boom = () => { throw new Error("finalize must not export XLSX"); };
//     return { ...actual, fetchSheetMarkdownWithBinding: boom, fetchSheetAsMarkdownAtRevision: boom,
//              fetchSheetMarkdownAndBytesAtRevision: boom };
//   });
// Then inject a working fetchDriveFileMetadata via deps. If finalize ever tries to export, the mock
// throws and the test fails loudly; after Task 4 it never does. The finalizeNoDriveExport.test.ts
// source-scan is the fast structural complement — together they cover identifier AND behavior.
```
(Implementer: use the same seeding + `handleOnboardingFinalize({ withTx, withRowTx, fetchDriveFileMetadata, requireAdminIdentity })` harness the sibling first-seen DB test uses; read `select source_anchors from public.shows where drive_file_id=$1` after publish.)

- [ ] **Step 4: Run to verify it fails**

Run: `pnpm vitest run tests/onboarding/finalizeReadsSourceAnchors.db.test.ts`
Expected: FAIL — finalize still computes anchors via the deleted-to-be export dep / doesn't read the column.

- [ ] **Step 5: Delete the export + read the column** (`route.ts`)

1. Remove imports `fetchSheetMarkdownWithBinding` (line 7), `fetchSheetTitleToGid` (line 9), `extractSourceAnchors` (line 10). Keep `SourceAnchor` import.
2. Remove `fetchOnboardingSourceAnchors?` from `FinalizeRouteDeps` (~65), `defaultFetchOnboardingSourceAnchors` (204-211), and its `depsWithDefaults` wiring (219-220).
3. In the loop (1149-1170): delete the pre-lock `sourceAnchors` compute block and stop passing `sourceAnchors` into `processApprovedRow`. Remove the `sourceAnchors?` field from `processApprovedRow`'s input type.
4. In `processApprovedRow`'s locked `freshRead` (766-800): add `source_anchors` to the SELECT and its row type. After building `coercedRow`, compute best-effort:

```ts
    let sourceAnchors: Record<string, SourceAnchor> = {};
    try {
      sourceAnchors = coerceJsonbObject<Record<string, SourceAnchor>>(locked.source_anchors);
    } catch {
      // best-effort: a corrupt/empty anchors column must NEVER wedge a publish (#gid=0)
    }
```
Add `import { coerceJsonbObject } from "@/lib/db/coerceJsonbObject";` (note: `coerceJsonbArray`/`asParseResult` are already imported from that module — extend the existing import).
5. In the first-seen `applyStagedCore` call (965-991), replace `...(input.sourceAnchors !== undefined ? { sourceAnchors: input.sourceAnchors } : {})` with:

```ts
    ...(Object.keys(sourceAnchors).length > 0 ? { sourceAnchors } : {}),
```
(An empty map omits the arg → identical to today's `#gid=0` behavior; `applyParseResult` uses `region: args.sourceAnchors ?? {}`.)

- [ ] **Step 6: Update the two tests that injected the deleted dep**

In `tests/onboarding/onboardingFinalizePublishDb.test.ts` and `tests/onboarding/finalizeStream.test.ts`, remove the `fetchOnboardingSourceAnchors` entry from the deps object(s) passed to the finalize handler. Where those tests asserted anchors on the created show, seed `pending_syncs.source_anchors` instead.

- [ ] **Step 7: Run all Task-4 tests + the two updated tests**

Run: `pnpm vitest run tests/onboarding/finalizeNoDriveExport.test.ts tests/onboarding/finalizeReadsSourceAnchors.db.test.ts tests/onboarding/onboardingFinalizePublishDb.test.ts tests/onboarding/finalizeStream.test.ts`
Expected: PASS (all).

- [ ] **Step 8: Commit**

```bash
git add app/api/admin/onboarding/finalize/route.ts tests/onboarding/finalizeNoDriveExport.test.ts tests/onboarding/finalizeReadsSourceAnchors.db.test.ts tests/onboarding/onboardingFinalizePublishDb.test.ts tests/onboarding/finalizeStream.test.ts
git commit --no-verify -m "feat(onboarding): finalize reads source_anchors, drops the XLSX export"
```

---

### Task 5: Full verification + advisory-lock regression witness

**Files:** none (verification only).

- [ ] **Step 1: Typecheck + lint + format**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm prettier --check .`
Expected: clean. (Fix any `exactOptionalPropertyTypes` fallout with the conditional-spread idiom.)

- [ ] **Step 2: Advisory-lock topology regression witness**

Run: `pnpm vitest run tests/auth/advisoryLockRpcDeadlock.test.ts`
Expected: PASS unchanged (no lock op changed).

- [ ] **Step 3: Validation-schema-parity gate** (confirms the manifest was regenerated AND validation was patched — F7)

Run: `pnpm test:audit:validation-schema-parity`
Expected: PASS (Layer 1 = manifest tripwire; Layer 2 = validation superset check). A Layer-1 failure means Task 1's `gen:schema-manifest` wasn't committed; a Layer-2 failure means the surgical validation apply was skipped.

- [ ] **Step 4: Full onboarding + finalize + db suites in isolation**

Run (isolate DB tests to avoid shared-DB pollution, per the worktree gotcha):
```bash
pnpm vitest run tests/onboarding tests/sync/onboarding.test.ts tests/db/pendingSyncsSourceAnchorsColumn.test.ts
```
Expected: PASS. If a `.db.test.ts` fails, re-run it ALONE to rule out shared-DB cross-talk before treating it as a real failure.

- [ ] **Step 5: Commit any format/lint fixups** (if Step 1 changed files)

```bash
git add -A && git commit --no-verify -m "chore(onboarding): tsc/lint/format fixups for source-anchor persistence"
```

---

## Self-Review

**Spec coverage:**
- §4 column → Task 1. §5.1 compute → Task 2. §5.2 thread → Task 3 (steps 3-5). §5.3 persist + ON CONFLICT → Task 3 (step 6). §5.4 rescan auto-wired → covered by Task 3's shared upsert (no separate code; the rescan path reuses `scanOnboardingPreparedFiles`). §6 finalize read + delete → Task 4. §7 write-path matrix → Tasks 3 (scan/rescan populate) + implicit default for others. §8 guards → Task 2 (bytes/gid/extract failures), Task 4 (corrupt coerce). §9 invariants → Task 5 (advisory witness) + structural test Task 4. §11 tests → Tasks 1-4. §4.2 migration parity → Task 1.
- **Gap check:** rescan (§5.4) has no dedicated task because it shares Task 3's upsert; add a note — Task 3's DB test SHOULD include the re-stage/ON CONFLICT assertion (it does, Step 1). ✓

**Placeholder scan:** the two `.db.test.ts` bodies are described rather than fully inlined because they depend on the existing per-file seeding helpers in `tests/onboarding/*.db.test.ts`; the implementer models them on the named sibling files. All type/SQL changes are fully inlined. Acceptable (DB harness reuse, not a vague requirement).

**Type consistency:** `sourceAnchors: Record<string, SourceAnchor>` used consistently across `PreparedOnboardingFile`, `Phase1Args`, `Phase1PendingSyncRow`, and the finalize local. Column `source_anchors` (snake) ↔ field `sourceAnchors` (camel) consistent. `coerceJsonbObject` generic `<Record<string, SourceAnchor>>` matches the stored shape.
