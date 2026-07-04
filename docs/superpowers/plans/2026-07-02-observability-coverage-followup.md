# Observability Coverage Follow-up — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make top-level `cron.sync` throws attributable, add a stable-failure `stateChanged` signal, surface the notify skip-reason, and add a build-SHA `/api/health` endpoint.

**Architecture:** Extract one shared `classifyProcessed` helper (counts + capped breadcrumbs + uncapped fingerprint) consumed by both `summarizeSync` and a new throw-attach path in `runScheduledCronSync`; the generic `runCronRoute` wrapper lifts an attached `syncRunContext` onto the error log. `annotateSyncStateChange` does one indexed prior-row compare (fail-open). Two tiny additions: `/api/health` and a `detail` on `summarizeNotify`.

**Tech Stack:** Next.js 16 App Router, TypeScript (strict, `exactOptionalPropertyTypes`), Supabase (postgres.js + supabase-js), vitest.

## Global Constraints (from spec + AGENTS.md)
- TDD per task: failing test → minimal impl → passing test → commit (invariant 1).
- Scanner-safety: `withCronRunSummary` keeps `code: CRON_RUN_SUMMARY` a **literal**; new fields (`driveFileId`, `detail`) are runtime **variables** — never `code:"LITERAL"` in a scanned root (`lib`/`app`).
- Invariant 9 (Supabase boundary): the S3 read destructures `{ data, error }`, distinguishes returned-vs-thrown, and **fails open** (never breaks the cron).
- No UI (all `lib/**` + `app/api/**`) → no impeccable gate. No DB schema, no advisory-lock, no §12.4 catalog change.
- `exactOptionalPropertyTypes`: omit optional keys via conditional spread; never assign `undefined`.
- Conventional commits: `feat(...)`, `test(...)`, `refactor(...)`.
- Codex adversarial-review after self-review; then whole-diff review; then real CI green → merge.

## Meta-test inventory (declared)
- `annotateSyncStateChange` = new Supabase read boundary → Task 4 adds a `// not-subject-to-meta: cron summary annotation, fail-open by contract` comment at the call site + a dedicated fail-open unit test (returned-`{error}` and thrown both yield the canonical fail-open shape). No auth/admin-alert/advisory-lock/email-normalization surface touched.
- `tests/cross-cutting/cron-run-summary-scanner-safety.test.ts` must stay green (Task 3/7 verify `CRON_RUN_SUMMARY` never leaks into the internal-code-enum manifest).

## File Structure
- Create `lib/cron/classifyProcessed.ts` — shared classifier.
- Modify `lib/cron/summarizeSync.ts` — consume classifier + set `detail.failuresFingerprint`.
- Modify `lib/sync/runScheduledCronSync.ts` — hoist state, clear-on-benign, outer try/catch attach.
- Modify `lib/cron/withCronRunSummary.ts` — catch reads `syncRunContext`, spreads `driveFileId`+`detail`.
- Create `lib/cron/annotateSyncStateChange.ts` — prior-row compare (fail-open).
- Modify `app/api/cron/sync/route.ts` — `await annotateSyncStateChange(summarizeSync(result))`.
- Create `app/api/health/route.ts` — build-SHA endpoint.
- Modify `app/api/cron/notify/route.ts` — `summarizeNotify` adds `detail`.
- Tests co-located: `tests/cron/classifyProcessed.test.ts`, extend `tests/cron/summarizeSync.test.ts` + `tests/cron/withCronRunSummary.test.ts`, `tests/sync/cronSyncThrowAttribution.test.ts`, `tests/cron/annotateSyncStateChange.test.ts`, `tests/api/health.test.ts`, `tests/cron/summarizeNotify.test.ts` (or extend an existing notify test).

---

### Task 1: `classifyProcessed` shared classifier

**Files:** Create `lib/cron/classifyProcessed.ts`; Test `tests/cron/classifyProcessed.test.ts`.

**Interfaces — Produces:**
```ts
export const MAX_FAILURE_BREADCRUMBS = 25;
export type ClassifiedProcessed = {
  counts: { processed: number; applied: number; staged: number; skipped: number; failed: number };
  breadcrumbs: Array<{ driveFileId: string; outcome: string; code?: string }>;
  failuresTruncated: boolean;
  fingerprintParts: string[];
};
export function classifyProcessed(processed: RunScheduledCronSyncResult["processed"]): ClassifiedProcessed;
```

- [ ] **Step 1: Write the failing test**
```ts
// tests/cron/classifyProcessed.test.ts
import { describe, expect, test } from "vitest";
import { classifyProcessed, MAX_FAILURE_BREADCRUMBS } from "@/lib/cron/classifyProcessed";
import { CONCURRENT_SYNC_SKIPPED } from "@/lib/sync/lockedShowTx";

const p = (driveFileId: string, result: unknown) => ({ driveFileId, result: result as never });

describe("classifyProcessed", () => {
  test("counts applied/stage/skipped and conservative-unknown⇒failed", () => {
    const c = classifyProcessed([
      p("a", { outcome: "applied" }),
      p("b", { outcome: "stage" }),
      p("c", { outcome: "skipped" }),
      p("d", { outcome: "hard_fail", code: "MI-3_NO_VALID_DATES" }),
      p("e", { outcome: "weird_new_outcome" }), // unknown ⇒ failed
    ] as never);
    expect(c.counts).toEqual({ processed: 5, applied: 1, staged: 1, skipped: 1, failed: 2 });
    expect(c.breadcrumbs).toEqual([
      { driveFileId: "d", outcome: "hard_fail", code: "MI-3_NO_VALID_DATES" },
      { driveFileId: "e", outcome: "weird_new_outcome" },
    ]);
    expect(c.failuresTruncated).toBe(false);
    expect(c.fingerprintParts).toEqual(["d|MI-3_NO_VALID_DATES", "e|weird_new_outcome"]);
  });
  test("ConcurrentSyncSkipped shape ⇒ skipped, not failed", () => {
    const c = classifyProcessed([p("x", { skipped: CONCURRENT_SYNC_SKIPPED })] as never);
    expect(c.counts).toMatchObject({ skipped: 1, failed: 0 });
  });
  test("breadcrumbs cap at 25 but fingerprintParts is uncapped", () => {
    const many = Array.from({ length: 30 }, (_, i) => p(`f${i}`, { outcome: "hard_fail" }));
    const c = classifyProcessed(many as never);
    expect(c.counts.failed).toBe(30);
    expect(c.breadcrumbs).toHaveLength(MAX_FAILURE_BREADCRUMBS);
    expect(c.failuresTruncated).toBe(true);
    expect(c.fingerprintParts).toHaveLength(30); // UNCAPPED — this is the R2 fix
  });
});
```

- [ ] **Step 2: Run to verify it fails**
Run: `pnpm exec vitest run tests/cron/classifyProcessed.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**
```ts
// lib/cron/classifyProcessed.ts
import type { RunScheduledCronSyncResult } from "@/lib/sync/runScheduledCronSync";
import { CONCURRENT_SYNC_SKIPPED } from "@/lib/sync/lockedShowTx";

// Benign (non-failure) outcomes. Anything NOT here, NOT the ConcurrentSyncSkipped shape,
// is counted as `failed` (conservative) — a NEW/missed outcome surfaces, never silently benign.
const SKIPPED = new Set(["skipped", "asset_recovery"]);
export const MAX_FAILURE_BREADCRUMBS = 25;

export type ClassifiedProcessed = {
  counts: { processed: number; applied: number; staged: number; skipped: number; failed: number };
  breadcrumbs: Array<{ driveFileId: string; outcome: string; code?: string }>;
  failuresTruncated: boolean;
  fingerprintParts: string[];
};

export function classifyProcessed(
  processed: RunScheduledCronSyncResult["processed"],
): ClassifiedProcessed {
  let applied = 0,
    staged = 0,
    skipped = 0,
    failed = 0;
  const breadcrumbs: ClassifiedProcessed["breadcrumbs"] = [];
  const fingerprintParts: string[] = [];
  for (const { driveFileId, result: r } of processed) {
    if ((r as { skipped?: string }).skipped === CONCURRENT_SYNC_SKIPPED) {
      skipped++;
      continue;
    }
    const outcome = (r as { outcome?: string }).outcome;
    if (outcome === "applied") applied++;
    else if (outcome === "stage") staged++;
    else if (outcome && SKIPPED.has(outcome)) skipped++;
    else {
      failed++;
      const code = (r as { code?: string }).code;
      const label = outcome ?? "unknown";
      fingerprintParts.push(`${driveFileId}|${code ?? label}`);
      if (breadcrumbs.length < MAX_FAILURE_BREADCRUMBS) {
        breadcrumbs.push({ driveFileId, outcome: label, ...(code ? { code } : {}) });
      }
    }
  }
  return {
    counts: { processed: processed.length, applied, staged, skipped, failed },
    breadcrumbs,
    failuresTruncated: failed > breadcrumbs.length,
    fingerprintParts,
  };
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm exec vitest run tests/cron/classifyProcessed.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git add lib/cron/classifyProcessed.ts tests/cron/classifyProcessed.test.ts && git commit -m "feat(cron): shared classifyProcessed (counts + capped breadcrumbs + uncapped fingerprint)"`

---

### Task 2: `summarizeSync` consumes the classifier + sets `failuresFingerprint`

**Files:** Modify `lib/cron/summarizeSync.ts`; Test extend `tests/cron/summarizeSync.test.ts`.

**Interfaces — Consumes:** `classifyProcessed` (Task 1). **Produces:** `summarizeSync` now emits `detail.failuresFingerprint` on `partial`.

- [ ] **Step 1: Write failing tests (append)**
```ts
// tests/cron/summarizeSync.test.ts (append inside describe)
import { CONCURRENT_SYNC_SKIPPED } from "@/lib/sync/lockedShowTx";
test("partial → detail.failuresFingerprint is sorted/order-independent", () => {
  const a = summarizeSync({ processed: [p2("z", "hard_fail"), p2("a", "hard_fail")] } as never);
  const b = summarizeSync({ processed: [p2("a", "hard_fail"), p2("z", "hard_fail")] } as never);
  expect((a.detail as any).failuresFingerprint).toBe((b.detail as any).failuresFingerprint);
  expect((a.detail as any).failuresFingerprint).toContain("a|hard_fail");
});
test("beyond-cap composition change → fingerprint differs (uncapped)", () => {
  const base = Array.from({ length: 30 }, (_, i) => p2(`f${i}`, "hard_fail"));
  const changed = base.map((x, i) => (i === 27 ? p2("f27", "parse_error") : x));
  const fA = (summarizeSync({ processed: base } as never).detail as any).failuresFingerprint;
  const fB = (summarizeSync({ processed: changed } as never).detail as any).failuresFingerprint;
  expect(fA).not.toBe(fB);
});
test("heartbeat-only partial → failuresFingerprint 'heartbeat'", () => {
  const s = summarizeSync({
    processed: [p2("ok1", "applied")],
    maintenanceFaults: { syncCronHeartbeat: "infra_error" },
  } as never);
  expect(s.outcome).toBe("partial");
  expect((s.detail as any).failuresFingerprint).toBe("heartbeat");
});
```
(Add helper near top: `const p2 = (driveFileId: string, outcome: string) => ({ driveFileId, result: { outcome } as never });`)

- [ ] **Step 2: Run to verify fail** — `pnpm exec vitest run tests/cron/summarizeSync.test.ts` → FAIL (no failuresFingerprint).

- [ ] **Step 3: Refactor `summarizeSync`** (replace the loop + counts with `classifyProcessed`, add fingerprint):
```ts
// lib/cron/summarizeSync.ts
import type { RunScheduledCronSyncResult } from "@/lib/sync/runScheduledCronSync";
import type { CronRunSummary } from "@/lib/cron/runSummary";
import { classifyProcessed } from "@/lib/cron/classifyProcessed";

export function summarizeSync(result: RunScheduledCronSyncResult): CronRunSummary {
  const { counts, breadcrumbs, failuresTruncated, fingerprintParts } = classifyProcessed(
    result.processed,
  );

  if (result.summary?.outcome === "parse_error") {
    return { outcome: "infra", counts, detail: { summary: result.summary } };
  }
  const heartbeatFault = result.maintenanceFaults?.syncCronHeartbeat === "infra_error";
  if (counts.failed > 0 || heartbeatFault) {
    const failuresFingerprint = fingerprintParts.length
      ? [...fingerprintParts].sort().join(",")
      : "heartbeat";
    const detail = {
      ...(result.maintenanceFaults ? { maintenanceFaults: result.maintenanceFaults } : {}),
      ...(breadcrumbs.length > 0 ? { failures: breadcrumbs } : {}),
      ...(failuresTruncated ? { failuresTruncated: true } : {}),
      failuresFingerprint,
    };
    return { outcome: "partial", counts, detail };
  }
  if (result.summary?.outcome === "skipped") {
    return { outcome: "ok", counts, detail: { skipReason: result.summary.skipReason } };
  }
  return { outcome: "ok", counts };
}
```
(Delete the now-unused `FAILED`/`SKIPPED`/`MAX_FAILURE_BREADCRUMBS`/`CONCURRENT_SYNC_SKIPPED` imports from `summarizeSync.ts` — they moved to `classifyProcessed.ts`.)

- [ ] **Step 4: Run** — `pnpm exec vitest run tests/cron/summarizeSync.test.ts` → PASS (existing + new).
- [ ] **Step 5: Commit** — `refactor(cron): summarizeSync uses classifyProcessed + emits failuresFingerprint`

---

### Task 3: Throw attribution (`runScheduledCronSync` + `withCronRunSummary`)

**Files:** Modify `lib/sync/runScheduledCronSync.ts`, `lib/cron/withCronRunSummary.ts`; Test `tests/sync/cronSyncThrowAttribution.test.ts` + extend `tests/cron/withCronRunSummary.test.ts`.

**Interfaces — Produces:** thrown errors from the sync cron carry `err.syncRunContext = { phase, folderId, inFlightDriveFileId, processedBeforeThrow, failures }`; the wrapper logs `driveFileId` (top-level) + `detail`.

- [ ] **Step 1: Write failing tests**
```ts
// tests/sync/cronSyncThrowAttribution.test.ts
import { describe, expect, test, vi } from "vitest";
import { runScheduledCronSync } from "@/lib/sync/runScheduledCronSync";

// deps injection: force a throw inside the missing-shows loop and assert the thrown
// error carries syncRunContext with the in-flight driveFileId.
describe("cron.sync throw attribution", () => {
  test("throw in missing-shows loop attaches syncRunContext.inFlightDriveFileId", async () => {
    const boom = new Error("lock boom");
    await expect(
      runScheduledCronSync({
        folderId: "folder-1",
        listFolder: async () => [], // no files
        listLiveShows: async () => [{ driveFileId: "missing-1", wizardSessionId: null, showId: "s1" }],
        withShowLock: async () => {
          throw boom;
        },
      } as never),
    ).rejects.toThrow("lock boom");
    const ctx = (boom as { syncRunContext?: any }).syncRunContext;
    expect(ctx).toMatchObject({ phase: "missing-shows", inFlightDriveFileId: "missing-1" });
  });
  test("throw before the loops (folder resolve) → phase set, no inFlight id, processedBeforeThrow 0", async () => {
    const boom = new Error("folder boom");
    await expect(
      runScheduledCronSync({
        getActiveWatchedFolderId: async () => {
          throw boom;
        },
      } as never),
    ).rejects.toThrow("folder boom");
    const ctx = (boom as { syncRunContext?: any }).syncRunContext;
    expect(ctx).toMatchObject({ phase: "resolve-folder", inFlightDriveFileId: null, processedBeforeThrow: 0 });
    expect(ctx.failures).toEqual([]);
  });
});
```
```ts
// tests/cron/withCronRunSummary.test.ts (append) — wrapper lifts syncRunContext
test("threw with syncRunContext → driveFileId column + context.detail.failures", async () => {
  await withCapture(async (sink) => {
    const { runCronRoute } = await import("@/lib/cron/withCronRunSummary");
    const err = Object.assign(new Error("kaboom"), {
      syncRunContext: {
        phase: "missing-shows",
        inFlightDriveFileId: "df-9",
        processedBeforeThrow: 2,
        failures: [{ driveFileId: "df-1", outcome: "hard_fail", code: "X" }],
      },
    });
    await expect(
      runCronRoute("sync", req(), async () => {
        throw err;
      }),
    ).rejects.toThrow("kaboom");
    expect(sink[0]!.level).toBe("error");
    expect(sink[0]!.code).toBe("CRON_RUN_SUMMARY");
    expect(sink[0]!.driveFileId).toBe("df-9"); // reserved → indexed column
    expect(sink[0]!.context).toMatchObject({
      outcome: "threw",
      detail: { phase: "missing-shows", processedBeforeThrow: 2, failures: [{ driveFileId: "df-1" }] },
    });
  });
});
test("threw with a NON-OBJECT error → still logs outcome:threw, no crash", async () => {
  await withCapture(async (sink) => {
    const { runCronRoute } = await import("@/lib/cron/withCronRunSummary");
    await expect(
      runCronRoute("sync", req(), async () => {
        throw "boom-string";
      }),
    ).rejects.toBe("boom-string");
    expect(sink[0]!.context).toMatchObject({ outcome: "threw" });
    expect(sink[0]!.driveFileId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify fail** — `pnpm exec vitest run tests/sync/cronSyncThrowAttribution.test.ts tests/cron/withCronRunSummary.test.ts` → FAIL.

- [ ] **Step 3: Implement — `runScheduledCronSync`** (hoist state after `finishCompletedRun` def ~2746; wrap body 2748→2861; clear id on benign completion only):
```ts
// after the finishCompletedRun definition, BEFORE `const folderResult = ...`:
let inFlightPhase:
  | "resolve-folder" | "list-folder" | "list-live-shows" | "missing-shows" | "file-loop" | "finish" =
  "resolve-folder";
let inFlightDriveFileId: string | null = null;
let resolvedFolderId: string | null = null;
const processed: RunScheduledCronSyncResult["processed"] = []; // HOISTED from ~2781

try {
  // ...existing folder resolve (set inFlightPhase = "list-folder" before listFolder;
  //    resolvedFolderId = folderId after resolve; "list-live-shows" before listLiveShows;
  //    "missing-shows" before that loop; "file-loop" before the file loop; "finish" before finishCompletedRun)...

  // missing-shows loop — set at top, clear ONLY on benign completion (after each push):
  inFlightPhase = "missing-shows";
  for (const show of missingShows) {
    inFlightDriveFileId = show.driveFileId;
    const result = await lockMissingShow(show.driveFileId, (lockedTx) =>
      markMissingShow_unlocked(lockedTx, show),
    );
    if ("skipped" in result) {
      await log.info("missing-show sync skipped on lock contention", { /* unchanged */ });
      processed.push({ driveFileId: show.driveFileId, result });
      inFlightDriveFileId = null; // benign completion
      continue;
    }
    if (result.outcome === "source_gone") revalidateShow(show.showId);
    processed.push({ driveFileId: show.driveFileId, result });
    inFlightDriveFileId = null; // benign completion
  }

  inFlightPhase = "file-loop";
  for (const file of files) {
    inFlightDriveFileId = file.driveFileId;
    try {
      const result = await runOne(file.driveFileId, "cron", file, processDeps);
      revalidateShowFromResult(result);
      processed.push({ driveFileId: file.driveFileId, result });
    } catch (error) {
      const result = { outcome: "parse_error" as const, code: classifySyncFailure(error) };
      await deps.logSync?.({ /* unchanged */ }); // may THROW → id retained → attributed
      processed.push({ driveFileId: file.driveFileId, result });
    }
    inFlightDriveFileId = null; // reached only if neither try nor catch re-threw
  }

  inFlightPhase = "finish";
  return finishCompletedRun({ processed });
} catch (err) {
  if (err && typeof err === "object") {
    (err as { syncRunContext?: unknown }).syncRunContext = {
      phase: inFlightPhase,
      folderId: resolvedFolderId,
      inFlightDriveFileId,
      processedBeforeThrow: processed.length,
      failures: classifyProcessed(processed).breadcrumbs,
    };
  }
  throw err; // preserve semantics; wrapper is the sole emitter (no double-log)
}
```
(Import `classifyProcessed`. NOTE: the two early `return` statements inside the folder-resolve block — `no_folder_configured` and the `SYNC_INFRA_ERROR` arm — stay INSIDE the try; they return normally, not throw, so the catch is not involved. Keep them.)

- [ ] **Step 3b: Implement — `withCronRunSummary.ts` catch** (read `syncRunContext`, spread):
```ts
} catch (err) {
  const durationMs = Date.now() - startedAt;
  const ctx = (err as { syncRunContext?: {
    phase?: string; folderId?: string | null; inFlightDriveFileId?: string | null;
    processedBeforeThrow?: number; failures?: Array<{ driveFileId: string; outcome: string; code?: string }>;
  } } | null)?.syncRunContext;
  try {
    await log.error(`cron ${jobName} run`, {
      source,
      code: CRON_RUN_SUMMARY, // LITERAL — scanner-safe
      jobName,
      outcome: "threw",
      durationMs,
      error: err,
      ...(ctx?.inFlightDriveFileId ? { driveFileId: ctx.inFlightDriveFileId } : {}),
      ...(ctx?.phase || ctx?.failures?.length || ctx?.folderId || typeof ctx?.processedBeforeThrow === "number"
        ? {
            detail: {
              ...(ctx?.phase ? { phase: ctx.phase } : {}),
              ...(ctx?.folderId ? { folderId: ctx.folderId } : {}),
              ...(ctx?.failures?.length ? { failures: ctx.failures } : {}),
              ...(typeof ctx?.processedBeforeThrow === "number"
                ? { processedBeforeThrow: ctx.processedBeforeThrow }
                : {}),
            },
          }
        : {}),
    });
  } catch {
    /* swallow logging fault */
  }
  throw err;
}
```

- [ ] **Step 4: Run** — `pnpm exec vitest run tests/sync/cronSyncThrowAttribution.test.ts tests/cron/withCronRunSummary.test.ts` → PASS. Also run `tests/cross-cutting/cron-run-summary-scanner-safety.test.ts` → PASS (code stays literal).
- [ ] **Step 5: Commit** — `feat(sync): attribute top-level cron.sync throws (in-flight id + partial failures)`

---

### Task 4: `annotateSyncStateChange` + route wiring (S3)

**Files:** Create `lib/cron/annotateSyncStateChange.ts`; Modify `app/api/cron/sync/route.ts`; Test `tests/cron/annotateSyncStateChange.test.ts`.

**Interfaces — Consumes:** `summarizeSync` output. **Produces:** `annotateSyncStateChange(summary): Promise<CronRunSummary>`.

- [ ] **Step 1: Write failing tests**
```ts
// tests/cron/annotateSyncStateChange.test.ts
import { describe, expect, test, vi, beforeEach } from "vitest";

const mockLimit = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: mockLimit }) }) }) }) }),
  }),
}));
import { annotateSyncStateChange } from "@/lib/cron/annotateSyncStateChange";

const partial = (fp: string) => ({ outcome: "partial" as const, counts: { processed: 1 } as any, detail: { failuresFingerprint: fp } });
beforeEach(() => mockLimit.mockReset());

describe("annotateSyncStateChange", () => {
  test("non-partial passes through with NO read", async () => {
    const ok = { outcome: "ok" as const, counts: { processed: 3 } as any };
    expect(await annotateSyncStateChange(ok)).toBe(ok);
    expect(mockLimit).not.toHaveBeenCalled();
  });
  test("same fingerprint as prior → stateChanged false + unchangedSinceRuns increment", async () => {
    mockLimit.mockResolvedValue({ data: [{ context: { detail: { failuresFingerprint: "a|x", unchangedSinceRuns: 2 } } }], error: null });
    const out = await annotateSyncStateChange(partial("a|x"));
    expect(out.detail).toMatchObject({ stateChanged: false, unchangedSinceRuns: 3, failuresFingerprint: "a|x" });
  });
  test("different fingerprint → stateChanged true, no unchangedSinceRuns", async () => {
    mockLimit.mockResolvedValue({ data: [{ context: { detail: { failuresFingerprint: "a|x" } } }], error: null });
    const out = await annotateSyncStateChange(partial("b|y"));
    expect(out.detail).toMatchObject({ stateChanged: true });
    expect((out.detail as any).unchangedSinceRuns).toBeUndefined();
  });
  test("returned {error} → canonical fail-open (fingerprint preserved, stateChanged true), no throw", async () => {
    mockLimit.mockResolvedValue({ data: null, error: { message: "down" } });
    const out = await annotateSyncStateChange(partial("a|x"));
    expect(out.detail).toMatchObject({ stateChanged: true, failuresFingerprint: "a|x" });
    expect((out.detail as any).unchangedSinceRuns).toBeUndefined();
  });
  test("thrown read → identical canonical fail-open", async () => {
    mockLimit.mockRejectedValue(new Error("boom"));
    const out = await annotateSyncStateChange(partial("a|x"));
    expect(out.detail).toMatchObject({ stateChanged: true, failuresFingerprint: "a|x" });
  });
});
```

- [ ] **Step 2: Run to verify fail** — `pnpm exec vitest run tests/cron/annotateSyncStateChange.test.ts` → FAIL.

- [ ] **Step 3: Implement**
```ts
// lib/cron/annotateSyncStateChange.ts
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { CRON_RUN_SUMMARY, type CronRunSummary } from "@/lib/cron/runSummary";

export async function annotateSyncStateChange(summary: CronRunSummary): Promise<CronRunSummary> {
  if (summary.outcome !== "partial") return summary;
  const currentFp = (summary.detail as { failuresFingerprint?: string } | undefined)?.failuresFingerprint;
  // Canonical fail-open: preserve summary+detail (incl fingerprint), set stateChanged:true, skip compare.
  const failOpen = (): CronRunSummary => ({
    ...summary,
    detail: { ...(summary.detail ?? {}), stateChanged: true },
  });
  try {
    const supabase = createSupabaseServiceRoleClient();
    // invariant 9: destructure {data,error}; returned-error → fail-open; thrown → catch → fail-open.
    const { data, error } = await supabase
      .from("app_events")
      .select("context")
      .eq("code", CRON_RUN_SUMMARY)
      .eq("source", "cron.sync")
      .order("occurred_at", { ascending: false })
      .limit(1);
    if (error) return failOpen();
    const priorDetail = (data?.[0]?.context as { detail?: { failuresFingerprint?: string; unchangedSinceRuns?: number } } | undefined)?.detail;
    const priorFp = priorDetail?.failuresFingerprint;
    const stateChanged = priorFp === undefined || priorFp !== currentFp;
    return {
      ...summary,
      detail: {
        ...(summary.detail ?? {}),
        stateChanged,
        ...(stateChanged ? {} : { unchangedSinceRuns: (priorDetail?.unchangedSinceRuns ?? 0) + 1 }),
      },
    };
  } catch {
    return failOpen();
  }
}
```
```ts
// app/api/cron/sync/route.ts — change the summary line:
import { annotateSyncStateChange } from "@/lib/cron/annotateSyncStateChange"; // not-subject-to-meta: cron summary annotation, fail-open by contract
// ...
return {
  response: NextResponse.json({ ok: true, processed: result.processed }),
  summary: await annotateSyncStateChange(summarizeSync(result)),
};
```

- [ ] **Step 4: Run** — `pnpm exec vitest run tests/cron/annotateSyncStateChange.test.ts` → PASS.
- [ ] **Step 5: Commit** — `feat(cron): annotate sync partial summaries with stateChanged (fail-open prior-row compare)`

---

### Task 5: `/api/health` build-SHA endpoint (S4)

**Files:** Create `app/api/health/route.ts`; Test `tests/api/health.test.ts`.

- [ ] **Step 1: Write failing test**
```ts
// tests/api/health.test.ts
import { describe, expect, test, afterEach } from "vitest";
import { GET } from "@/app/api/health/route";
const orig = { ...process.env };
afterEach(() => { process.env = { ...orig }; });
describe("/api/health", () => {
  test("returns the build SHA when set", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "abc123";
    process.env.VERCEL_GIT_COMMIT_REF = "main";
    const body = await (await GET()).json();
    expect(body).toMatchObject({ ok: true, sha: "abc123", ref: "main" });
  });
  test("sha null when unset, still 200", async () => {
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).sha).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify fail** — FAIL (module not found).
- [ ] **Step 3: Implement**
```ts
// app/api/health/route.ts
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET(): Promise<Response> {
  return NextResponse.json({
    ok: true,
    sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    ref: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    builtEnv: process.env.VERCEL_ENV ?? null,
  });
}
```
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `feat(infra): /api/health returns build SHA for deploy-liveness`

---

### Task 6: `summarizeNotify` skip-reason (S5)

**Files:** Modify `app/api/cron/notify/route.ts`; Test `tests/cron/summarizeNotify.test.ts` (export `summarizeNotify` OR test via `runCronRoute`; prefer a direct export if not already).

- [ ] **Step 1: Write failing test**
```ts
// tests/cron/summarizeNotify.test.ts
import { describe, expect, test } from "vitest";
import { summarizeNotify } from "@/app/api/cron/notify/route";
describe("summarizeNotify", () => {
  test("skipped delivery → detail.deliverySkipReason", () => {
    const s = summarizeNotify({ delivery: { kind: "skipped", reason: "config_invalid" }, maintenance: [] } as never);
    expect(s.outcome).toBe("ok");
    expect(s.detail).toMatchObject({ deliveryKind: "skipped", deliverySkipReason: "config_invalid" });
  });
  test("ok delivery → deliveryKind ok, no skip reason", () => {
    const s = summarizeNotify({ delivery: { kind: "ok", sent: 2 }, maintenance: [] } as never);
    expect(s.detail).toMatchObject({ deliveryKind: "ok" });
    expect((s.detail as any).deliverySkipReason).toBeUndefined();
  });
});
```
(If `summarizeNotify` is not exported, add `export` to it.)

- [ ] **Step 2: Run to verify fail** — FAIL.
- [ ] **Step 3: Implement** — add `detail` to `summarizeNotify`'s return + `export`:
```ts
export function summarizeNotify(result: NotifyRunResult): CronRunSummary {
  const deliveryFault =
    result.delivery.kind === "infra_error" || recordsToggleFault(result.delivery);
  const maintenanceFault = result.maintenance.some(
    (step) => step.result.kind === "infra_error" || recordsToggleFault(step.result),
  );
  return {
    outcome: deliveryFault || maintenanceFault ? "infra" : "ok",
    counts: {
      sent: result.delivery.kind === "ok" ? result.delivery.sent : 0,
      maintenanceSteps: result.maintenance.length,
    },
    detail: {
      deliveryKind: result.delivery.kind,
      ...(result.delivery.kind === "skipped" ? { deliverySkipReason: result.delivery.reason } : {}),
    },
  };
}
```
- [ ] **Step 4: Run** — PASS. Re-run any existing notify-route test to confirm no regression.
- [ ] **Step 5: Commit** — `feat(notify): record delivery kind + skip reason in the cron summary`

---

### Task 7: Whole-diff verification + adversarial review + close-out

- [ ] **Step 1:** `pnpm typecheck` → 0 errors. (Watch `exactOptionalPropertyTypes` on the conditional spreads.)
- [ ] **Step 2:** `pnpm lint` → 0 errors; `pnpm format` (prettier write) then `git diff --stat` to stage any formatting.
- [ ] **Step 3:** Full suite `pnpm exec vitest run` → all green (baseline: the 3 known env-only failures test-auth-gate/email-canon/pg-cron are pre-existing and unrelated — confirm none of the changed modules is imported by them).
- [ ] **Step 4:** Confirm `tests/cross-cutting/cron-run-summary-scanner-safety.test.ts` green + run `pnpm gen:internal-code-enums` (if it exists) to confirm no new code leaked into the §12.4 manifest (there should be none — no new SHOUTY literal in a scanned root).
- [ ] **Step 5:** No UI touched → impeccable gate N/A (record in the handoff/PR body).
- [ ] **Step 6:** Codex whole-diff adversarial review → APPROVE.
- [ ] **Step 7:** Push; open PR; real CI green (all required checks CLEAN); `gh pr merge --merge`; fast-forward local `main`; verify `git rev-list --left-right --count main...origin/main` == `0  0`.
