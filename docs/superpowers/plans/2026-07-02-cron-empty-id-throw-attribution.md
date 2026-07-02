# cron.sync empty-ID Drive guard + throw-path attribution — implementation plan

> **For agentic workers:** TDD per task — failing test → minimal impl → passing test → commit. Steps use `- [ ]`.

**Goal:** Stop the recurring `cron.sync` `File not found: .` (empty-ID Drive `files.get`) from being an anonymous, unattributable throw — by guarding both Drive `files.get` chokepoints with a typed `InvalidDriveFileIdError` and hoisting throw-attribution to the request-context ALS so any detached/route-tail cron.sync throw carries which-record context.

**Architecture:** Two runtime-only changes: (1) a shared `assertNonEmptyDriveFileId` guard at the two `drive.files.get` chokepoints (`lib/drive/fetch.ts` `driveFilesGet`, `lib/drive/agendaDrive.ts` byte-download); (2) an additive ALS shadow of `runScheduledCronSync`'s in-flight `phase`/`driveFileId`/`processedCount`, read as a fallback in `runCronRoute`'s throw-catch when `err.syncRunContext` is absent, stamped `detail.source`.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`), Next.js 16, Vitest, `postgres`, googleapis Drive v3.

**Spec:** `docs/superpowers/specs/2026-07-02-cron-empty-id-throw-attribution-design.md` (Codex-APPROVE'd).

## Global Constraints

- **Invariant 9:** no new Supabase call site (ALS reads are in-memory). No `annotateSyncStateChange`/`summarizeSync` change.
- **Scanner-safety:** `code: CRON_RUN_SUMMARY` stays a literal inside a `log.error(...)` span; `detail.source` is a runtime string value (`"sync-body"`/`"als-fallback"`), never a `code:"LITERAL"`. No §12.4 code, no `gen:*` regen.
- **exactOptionalPropertyTypes:** optional fields cleared with `= null` or reassigned to concrete values; `cronCtxFromALS` builds `processedBeforeThrow` via conditional spread. Never `= undefined`, never `delete`.
- **Fail-open:** the ALS fallback is computed **inside** the existing swallow-logging-faults `try/catch` in `runCronRoute`; it can never throw out of the wrapper nor alter the rethrow.
- **No advisory-lock topology change.** No migration. No UI.
- **Commit per task**, conventional-commits; `--no-verify` is NOT used (let the pre-commit hook run).

## File Structure

- `lib/drive/fetch.ts` — add `InvalidDriveFileIdError` + `assertNonEmptyDriveFileId`; call it at the top of `driveFilesGet`. (Task 1)
- `lib/drive/agendaDrive.ts` — call `assertNonEmptyDriveFileId(fileId)` at the top of the byte-download `try`. (Task 1)
- `lib/log/requestContext.ts` — extend `RequestContext` + add `setCronInFlight`. (Task 2)
- `lib/log/index.ts` — re-export `setCronInFlight`. (Task 2)
- `lib/sync/runScheduledCronSync.ts` — `setPhase`/`setInFlightId` closures mirroring to the ALS. (Task 3)
- `lib/cron/withCronRunSummary.ts` — `cronCtxFromALS` fallback + `detail.source`, inside the swallowed catch. (Task 4)
- Tests: `tests/drive/invalidDriveFileId.test.ts` (new, Task 1); `tests/log/requestContext.test.ts` (new or extend, Task 2); `tests/sync/cronSyncThrowAttribution.test.ts` (extend, Task 3); `tests/cron/withCronRunSummary.test.ts` (extend, Task 4).

---

### Task 1: Empty-ID guard at both Drive `files.get` chokepoints

**Files:**
- Modify: `lib/drive/fetch.ts` (after `DriveFetchError` at :108; guard call in `driveFilesGet` at :275)
- Modify: `lib/drive/agendaDrive.ts` (guard call at the top of the byte-download `try`, before `drive.files.get` at :115)
- Test: `tests/drive/invalidDriveFileId.test.ts` (new)

**Interfaces produced:** `class InvalidDriveFileIdError extends DriveFetchError`; `function assertNonEmptyDriveFileId(fileId: unknown): asserts fileId is string`.

- [ ] **Step 1: Write the failing test** — `tests/drive/invalidDriveFileId.test.ts`

```ts
import { describe, expect, test, vi } from "vitest";

describe("assertNonEmptyDriveFileId / InvalidDriveFileIdError", () => {
  test("throws InvalidDriveFileIdError (and instanceof DriveFetchError) for empty/blank/nullish", async () => {
    const { assertNonEmptyDriveFileId, InvalidDriveFileIdError, DriveFetchError } = await import(
      "@/lib/drive/fetch"
    );
    for (const bad of ["", "   ", "\t", undefined, null]) {
      expect(() => assertNonEmptyDriveFileId(bad as unknown)).toThrow(InvalidDriveFileIdError);
      try {
        assertNonEmptyDriveFileId(bad as unknown);
      } catch (e) {
        expect(e).toBeInstanceOf(DriveFetchError); // existing handlers still classify it
      }
    }
  });
  test("passes a valid id through (no throw)", async () => {
    const { assertNonEmptyDriveFileId } = await import("@/lib/drive/fetch");
    expect(() => assertNonEmptyDriveFileId("1AbcDEF")).not.toThrow();
  });
  test("driveFilesGet with an empty id NEVER reaches drive.files.get", async () => {
    const { fetchDriveFileMetadata, InvalidDriveFileIdError } = await import("@/lib/drive/fetch");
    const filesGet = vi.fn();
    const fakeDrive = { files: { get: filesGet } } as never;
    await expect(fetchDriveFileMetadata("", { drive: fakeDrive })).rejects.toThrow(
      InvalidDriveFileIdError,
    );
    expect(filesGet).not.toHaveBeenCalled(); // the empty id never reached the Drive client
  });
  test("driveFilesGet with a valid id DOES reach drive.files.get", async () => {
    const { fetchDriveFileMetadata } = await import("@/lib/drive/fetch");
    const filesGet = vi.fn(async () => ({
      data: { id: "1Valid", name: "n", mimeType: "m", modifiedTime: "t" },
    }));
    const fakeDrive = { files: { get: filesGet } } as never;
    await fetchDriveFileMetadata("1Valid", { drive: fakeDrive });
    expect(filesGet).toHaveBeenCalledTimes(1);
    expect(filesGet.mock.calls[0]![0]).toMatchObject({ fileId: "1Valid" });
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`assertNonEmptyDriveFileId`/`InvalidDriveFileIdError` not exported).

Run: `cd /Users/ericweiss/fxav-emptyid-attribution && npx vitest run tests/drive/invalidDriveFileId.test.ts`

- [ ] **Step 3: Implement** — in `lib/drive/fetch.ts`, immediately after `DriveFetchError` (ends :108):

```ts
export class InvalidDriveFileIdError extends DriveFetchError {
  readonly rawFileId: string;
  constructor(received: unknown) {
    const raw = (() => {
      try {
        return (JSON.stringify(received) ?? String(received)).slice(0, 80);
      } catch {
        return String(received).slice(0, 80);
      }
    })();
    super(`Drive files.get called with an empty or blank fileId (received ${raw})`);
    this.name = "InvalidDriveFileIdError";
    this.rawFileId = raw;
  }
}

export function assertNonEmptyDriveFileId(fileId: unknown): asserts fileId is string {
  if (typeof fileId !== "string" || fileId.trim() === "") {
    throw new InvalidDriveFileIdError(fileId);
  }
}
```

  Then at the **top of `driveFilesGet`** (first statement inside the function body at :275, before the `driveFilesGetCall` thunk):

```ts
  assertNonEmptyDriveFileId((params as { fileId?: unknown }).fileId);
```

  And in `lib/drive/agendaDrive.ts`, import `assertNonEmptyDriveFileId` from `./fetch` and call it as the **first statement inside the `try` at :114** (before `await drive.files.get(...)` at :115):

```ts
    assertNonEmptyDriveFileId(fileId);
```

  (Confirm `fileId` is the byte-download function's param in scope at :114; if the param is named differently, use that name.)

- [ ] **Step 4: Run — expect PASS.** `npx vitest run tests/drive/invalidDriveFileId.test.ts`

- [ ] **Step 5: Commit.**

```bash
git add lib/drive/fetch.ts lib/drive/agendaDrive.ts tests/drive/invalidDriveFileId.test.ts
git commit -m "fix(drive): guard empty/blank fileId at both files.get chokepoints"
```

---

### Task 2: RequestContext ALS — cron in-flight fields + `setCronInFlight`

**Files:**
- Modify: `lib/log/requestContext.ts` (interface :4-7; new mutator after `setRequestShowId` :26)
- Modify: `lib/log/index.ts` (re-export)
- Test: `tests/log/requestContext.test.ts` (new)

**Interfaces produced:** `RequestContext` gains `cronPhase?`, `cronInFlightDriveFileId?`, `cronProcessedCount?`; `setCronInFlight(patch: { phase?: string; driveFileId?: string | null; processedCount?: number }): void`.

- [ ] **Step 1: Write the failing test** — `tests/log/requestContext.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { runWithRequestContext, getRequestContext, setCronInFlight } from "@/lib/log/requestContext";

describe("setCronInFlight", () => {
  test("mutates the current store in place (phase/driveFileId/count)", () => {
    runWithRequestContext({ requestId: "r1" }, () => {
      setCronInFlight({ phase: "file-loop", driveFileId: "df-1", processedCount: 2 });
      expect(getRequestContext()).toMatchObject({
        cronPhase: "file-loop",
        cronInFlightDriveFileId: "df-1",
        cronProcessedCount: 2,
      });
    });
  });
  test("clears driveFileId to null (no stale leak, exactOptional-safe)", () => {
    runWithRequestContext({ requestId: "r1" }, () => {
      setCronInFlight({ driveFileId: "df-1" });
      setCronInFlight({ driveFileId: null, processedCount: 3 });
      expect(getRequestContext()?.cronInFlightDriveFileId).toBeNull();
    });
  });
  test("no-op outside an ALS scope (does not throw)", () => {
    expect(() => setCronInFlight({ phase: "x" })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`setCronInFlight` not exported).

- [ ] **Step 3: Implement** — `lib/log/requestContext.ts`:

```ts
export interface RequestContext {
  requestId: string | null;
  showId?: string | null;
  cronPhase?: string;
  cronInFlightDriveFileId?: string | null;
  cronProcessedCount?: number;
}
```

  After `setRequestShowId` (ends :26):

```ts
export function setCronInFlight(patch: {
  phase?: string;
  driveFileId?: string | null;
  processedCount?: number;
}): void {
  const store = als.getStore();
  if (!store) return;
  if (patch.phase !== undefined) store.cronPhase = patch.phase;
  if (patch.driveFileId !== undefined) store.cronInFlightDriveFileId = patch.driveFileId; // null allowed = clear
  if (patch.processedCount !== undefined) store.cronProcessedCount = patch.processedCount;
}
```

  In `lib/log/index.ts`, add `setCronInFlight` to the `requestContext` re-export block (alongside `setRequestShowId` :9).

- [ ] **Step 4: Run — expect PASS.** `npx vitest run tests/log/requestContext.test.ts`

- [ ] **Step 5: Commit.**

```bash
git add lib/log/requestContext.ts lib/log/index.ts tests/log/requestContext.test.ts
git commit -m "feat(log): add cron in-flight fields + setCronInFlight to request-context ALS"
```

---

### Task 3: Mirror `runScheduledCronSync` in-flight markers to the ALS

**Files:**
- Modify: `lib/sync/runScheduledCronSync.ts` (import `setCronInFlight`; closures after :2860; replace bare assignments)
- Test: `tests/sync/cronSyncThrowAttribution.test.ts` (extend)

**Interfaces consumed:** `setCronInFlight` (Task 2).

- [ ] **Step 1: Write the failing test** — append to `tests/sync/cronSyncThrowAttribution.test.ts`:

```ts
import { runWithRequestContext, getRequestContext } from "@/lib/log/requestContext";

test("mirrors in-flight phase + driveFileId to the request-context ALS", async () => {
  const boom = new Error("lock boom");
  let alsAtThrow: { cronPhase?: string; cronInFlightDriveFileId?: string | null } | undefined;
  await runWithRequestContext({ requestId: "r1" }, async () => {
    await expect(
      runScheduledCronSync({
        folderId: "folder-1",
        listFolder: async () => [],
        listLiveShows: async () => [
          { driveFileId: "missing-1", wizardSessionId: null, showId: "s1" },
        ],
        withShowLock: async () => {
          alsAtThrow = { ...getRequestContext() }; // snapshot at the moment of the throw
          throw boom;
        },
      } as never),
    ).rejects.toThrow("lock boom");
  });
  expect(alsAtThrow).toMatchObject({ cronPhase: "missing-shows", cronInFlightDriveFileId: "missing-1" });
});
```

- [ ] **Step 2: Run — expect FAIL** (ALS cron fields not populated).

- [ ] **Step 3: Implement** — in `lib/sync/runScheduledCronSync.ts`:
  - Add `setCronInFlight` to the `@/lib/log` import.
  - Immediately after `const processed ... = [];` (:2860) add:

```ts
  const setPhase = (p: typeof inFlightPhase) => {
    inFlightPhase = p;
    setCronInFlight({ phase: p });
  };
  const setInFlightId = (id: string | null) => {
    inFlightDriveFileId = id;
    setCronInFlight({ driveFileId: id, processedCount: processed.length });
  };
  setCronInFlight({ phase: inFlightPhase, processedCount: 0 }); // seed "resolve-folder"
```

  - Replace the bare assignments (keep semantics identical):
    - `:2898` `inFlightPhase = "list-folder";` → `setPhase("list-folder");`
    - `:2901` `inFlightPhase = "list-live-shows";` → `setPhase("list-live-shows");`
    - `:2912` `inFlightPhase = "missing-shows";` → `setPhase("missing-shows");`
    - `:2914` `inFlightDriveFileId = show.driveFileId;` → `setInFlightId(show.driveFileId);`
    - `:2929` `inFlightDriveFileId = null; // benign` → `setInFlightId(null);`
    - `:2946` `inFlightDriveFileId = null; // benign` → `setInFlightId(null);`
    - `:2949` `inFlightPhase = "file-loop";` → `setPhase("file-loop");`
    - `:2951` `inFlightDriveFileId = file.driveFileId;` → `setInFlightId(file.driveFileId);`
    - `:2984` `inFlightDriveFileId = null;` → `setInFlightId(null);`
    - `:2987` `inFlightPhase = "finish";` → `setPhase("finish");`

  Do NOT touch the outer `catch` `syncRunContext` attach (:2991-2997) — it stays the primary path and reads the local `let`s (which the closures still update).

- [ ] **Step 4: Run — expect PASS** (this test + the 3 existing throw-attribution tests still green).

Run: `npx vitest run tests/sync/cronSyncThrowAttribution.test.ts`

- [ ] **Step 5: Commit.**

```bash
git add lib/sync/runScheduledCronSync.ts tests/sync/cronSyncThrowAttribution.test.ts
git commit -m "feat(sync): mirror cron in-flight phase/driveFileId to the request-context ALS"
```

---

### Task 4: ALS-fallback attribution + `detail.source` in `runCronRoute`

**Files:**
- Modify: `lib/cron/withCronRunSummary.ts` (add `cronCtxFromALS`; restructure the catch to compute `ctx` inside the swallowed try; add `detail.source`)
- Test: `tests/cron/withCronRunSummary.test.ts` (extend)

**Interfaces consumed:** `getRequestContext` (already imported :6), `RequestContext` type.

- [ ] **Step 1: Write the failing tests** — append to `tests/cron/withCronRunSummary.test.ts`:

```ts
  test("threw WITHOUT syncRunContext but WITH ALS cron ctx → als-fallback attribution", async () => {
    await withCapture(async (sink) => {
      const { runWithRequestContext } = await import("@/lib/log/requestContext");
      const { runCronRoute } = await import("@/lib/cron/withCronRunSummary");
      await runWithRequestContext(
        { requestId: "r1", cronPhase: "file-loop", cronInFlightDriveFileId: "df-x", cronProcessedCount: 3 },
        async () => {
          await expect(
            runCronRoute("sync", req(), async () => {
              throw new Error("detached boom"); // NO syncRunContext
            }),
          ).rejects.toThrow("detached boom");
        },
      );
      expect(sink[0]!.driveFileId).toBe("df-x");
      expect(sink[0]!.context).toMatchObject({
        outcome: "threw",
        detail: { phase: "file-loop", processedBeforeThrow: 3, source: "als-fallback" },
      });
    });
  });

  test("threw WITH syncRunContext → sync-body source + failures still flow", async () => {
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
      await expect(runCronRoute("sync", req(), async () => { throw err; })).rejects.toThrow("kaboom");
      expect(sink[0]!.context).toMatchObject({
        detail: { phase: "missing-shows", source: "sync-body", failures: [{ driveFileId: "df-1" }] },
      });
    });
  });

  test("malformed ALS cron fields → still rethrows, exactly one summary, no crash", async () => {
    await withCapture(async (sink) => {
      const { runWithRequestContext } = await import("@/lib/log/requestContext");
      const { runCronRoute } = await import("@/lib/cron/withCronRunSummary");
      await runWithRequestContext(
        { requestId: "r1", cronPhase: 123 as never, cronProcessedCount: "nope" as never },
        async () => {
          await expect(
            runCronRoute("sync", req(), async () => { throw new Error("boom2"); }),
          ).rejects.toThrow("boom2");
        },
      );
      expect(sink).toHaveLength(1);
      expect(sink[0]!.context).toMatchObject({ outcome: "threw" });
    });
  });

  test("stale-id no-leak: ALS id cleared to null → threw row driveFileId is null", async () => {
    await withCapture(async (sink) => {
      const { runWithRequestContext } = await import("@/lib/log/requestContext");
      const { runCronRoute } = await import("@/lib/cron/withCronRunSummary");
      await runWithRequestContext(
        { requestId: "r1", cronPhase: "finish", cronInFlightDriveFileId: null, cronProcessedCount: 5 },
        async () => {
          await expect(
            runCronRoute("sync", req(), async () => { throw new Error("boom3"); }),
          ).rejects.toThrow("boom3");
        },
      );
      expect(sink[0]!.driveFileId).toBeNull();
      expect(sink[0]!.context).toMatchObject({ detail: { phase: "finish", source: "als-fallback" } });
    });
  });
```

- [ ] **Step 2: Run — expect FAIL** (no ALS fallback / no `detail.source` yet).

- [ ] **Step 3: Implement** — in `lib/cron/withCronRunSummary.ts`:
  - Add a `RequestContext` type import and a module-level mapper:

```ts
import type { RequestContext } from "@/lib/log/requestContext";

function cronCtxFromALS(store: RequestContext | undefined) {
  if (!store || typeof store.cronPhase !== "string") return undefined;
  return {
    phase: store.cronPhase,
    inFlightDriveFileId: store.cronInFlightDriveFileId ?? null,
    ...(typeof store.cronProcessedCount === "number"
      ? { processedBeforeThrow: store.cronProcessedCount }
      : {}),
  };
}
```

  - Restructure the catch (:22-64): REMOVE the `const ctx = (...)?.syncRunContext` computed at :24-34 (currently outside the try). INSIDE the `try {` (at :36), compute:

```ts
      const syncCtx = (err as { syncRunContext?: {
        phase?: string; folderId?: string | null; inFlightDriveFileId?: string | null;
        processedBeforeThrow?: number; failures?: Array<{ driveFileId: string; outcome: string; code?: string }>;
      } } | null)?.syncRunContext;
      const ctx = syncCtx ?? cronCtxFromALS(getRequestContext());
      const attributionSource = syncCtx ? "sync-body" : "als-fallback";
```

  - In the `log.error(...)` call, keep the existing `driveFileId`/`detail` conditional spreads but add `source: attributionSource` **inside** the `detail` object (only emitted when the detail branch fires):

```ts
        ...(ctx?.phase || ctx?.failures?.length || ctx?.folderId || typeof ctx?.processedBeforeThrow === "number"
          ? {
              detail: {
                ...(ctx?.phase ? { phase: ctx.phase } : {}),
                ...(ctx?.folderId ? { folderId: ctx.folderId } : {}),
                ...(ctx?.failures?.length ? { failures: ctx.failures } : {}),
                ...(typeof ctx?.processedBeforeThrow === "number"
                  ? { processedBeforeThrow: ctx.processedBeforeThrow }
                  : {}),
                source: attributionSource,
              },
            }
          : {}),
```

  The whole `const syncCtx`/`ctx`/`attributionSource` + `log.error` stays inside the existing `try { ... } catch { /* swallow */ }` so a malformed store can never mask the cron error.

- [ ] **Step 4: Run — expect PASS** (new tests + all existing `withCronRunSummary` tests green, incl. the non-object-throw and the syncRunContext test).

Run: `npx vitest run tests/cron/withCronRunSummary.test.ts`

- [ ] **Step 5: Commit.**

```bash
git add lib/cron/withCronRunSummary.ts tests/cron/withCronRunSummary.test.ts
git commit -m "fix(cron): attribute detached/route-tail cron.sync throws via ALS fallback"
```

---

### Task 5: Whole-diff verification (typecheck + format + targeted suites)

**Not a code change — the integration gate before adversarial review.**

- [ ] `cd /Users/ericweiss/fxav-emptyid-attribution && pnpm typecheck` — 0 errors (esp. exactOptional on the new fields + mapper).
- [ ] `pnpm exec eslint lib/drive/fetch.ts lib/drive/agendaDrive.ts lib/log/requestContext.ts lib/log/index.ts lib/sync/runScheduledCronSync.ts lib/cron/withCronRunSummary.ts tests/drive/invalidDriveFileId.test.ts tests/log/requestContext.test.ts tests/sync/cronSyncThrowAttribution.test.ts tests/cron/withCronRunSummary.test.ts` — no `no-explicit-any`/errors.
- [ ] `pnpm format:check` (or `prettier --check` the changed files) — clean.
- [ ] Targeted suites green: `npx vitest run tests/drive/invalidDriveFileId.test.ts tests/log/requestContext.test.ts tests/sync/cronSyncThrowAttribution.test.ts tests/cron/withCronRunSummary.test.ts`.
- [ ] Scanner-safety regression: `npx vitest run tests/cross-cutting/cron-run-summary-scanner-safety` (and `tests/cross-cutting/codes.test.ts` if present) — confirms `CRON_RUN_SUMMARY` stays literal + no new producer.
- [ ] Sanity-grep the diff for `= undefined` on the new optional fields and any bare `code:"..."` outside a log span (expect none).
