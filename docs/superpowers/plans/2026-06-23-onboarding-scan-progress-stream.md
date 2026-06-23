# Onboarding Scan Progress (streamed) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fake elapsed-seconds counter on onboarding wizard Step 2 with a real-time, determinate progress bar driven by an NDJSON stream of per-sheet scan progress.

**Architecture:** The scan route streams `ReadableStream` NDJSON (`listed` → `prepared`×N → `staging` → terminal `result`) from the same request that runs the scan; `runOnboardingScan` emits progress via an optional `onProgress` callback threaded through `mapWithConcurrency`'s new `onItemComplete`; `Step2Verify` reads the stream and renders a determinate bar + "Just read" status line. No DB migration, no advisory-lock topology change.

**Tech Stack:** Next.js 16.2.4 (App Router, Node runtime), React 19.2, TypeScript, Vitest (+ jsdom for components), Testing Library, Tailwind v4, `postgres` (postgres.js).

**Spec:** `docs/superpowers/specs/2026-06-23-onboarding-scan-progress-stream.md` (adversarially reviewed, APPROVED 3 rounds).

## Global Constraints

- **TDD per task** (plan-wide invariant 1): failing test → minimal impl → passing test → commit. Never implement before the test.
- **No raw error codes in UI** (invariant 5): all client-rendered failures route through `copyForCode`→`messageFor`; unknown/null code → generic copy. **No new §12.4 code is added.**
- **UI quality gate** (invariant 8): the `Step2Verify` diff must pass `/impeccable critique` AND `/impeccable audit` (Task 8); HIGH/CRITICAL fixed or `DEFERRED.md`.
- **Supabase call-boundary** (invariant 9): N/A — no new Supabase client calls; the route's DB access is the existing `postgres.js` reserve path, unchanged.
- **Advisory-lock topology:** unchanged — no `pg_advisory*` edits, no new DB writes. (Declared per the plan-time rule.)
- **Meta-test inventory:** none created or extended — no new auth helper, RPC-gated table, admin-alert row, advisory-lock surface, or tile sentinel. (Declared.)
- **Migration→validation parity:** N/A — no `supabase/migrations/**` change.
- **Commit per task**, conventional commits: `feat(onboarding):`, `test(onboarding):`, `feat(crew-page):` etc. Use `--no-verify` is NOT required; run hooks normally. Branch: `worktree-scan-progress-stream` (already off `origin/main`).
- **Return type of `runOnboardingScan` is unchanged** — progress is purely additive (`onProgress` optional). The existing DB outcome tests are the regression guard.
- **`OnboardingScanResult` union, `toScanResponseBody`, and all current scan outcomes are unchanged.** Only the response *encoding* (single JSON → NDJSON stream) and an additive progress callback change.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `lib/onboarding/scanProgress.ts` | Shared event union + content-type const (producer & consumer) | **Create** |
| `lib/async/mapWithConcurrency.ts` | Bounded-concurrency map + optional per-completion callback | Modify |
| `lib/sync/runOnboardingScan.ts` | Emit `listed`/`prepared`/`staging` via `onProgress` | Modify |
| `app/api/admin/onboarding/scan/route.ts` | Stream the run phase as NDJSON; `maxDuration` | Modify |
| `components/admin/wizard/Step2Verify.tsx` | Stream reader + determinate bar + status line | Modify (UI) |
| `tests/onboarding/scanProgress.test.ts` | Pins the event contract const/types | **Create** |
| `tests/async/mapWithConcurrency.test.ts` | `onItemComplete` behavior | Extend |
| `tests/sync/onboarding.test.ts` | `onProgress` event sequence (reuses existing fakes — DRY) | Extend |
| `tests/onboarding/scanRoute.test.ts` | NDJSON streaming + preserved pre-stream errors | Rewrite success paths |
| `tests/components/admin/wizard/Step2Verify.test.tsx` | Streaming fetch reader + bar | Rewrite/extend |
| `tests/components/admin/wizard/Step2Verify.layout.test.ts` (or e2e) | Real-browser bar dimensions | **Create** (Task 6) |

> **DRY note (R3):** the spec named a new `tests/onboarding/scanProgressEvents.test.ts`. The plan instead extends `tests/sync/onboarding.test.ts`, which already owns `FakeOnboardingTx`, `file()`, `parseResult()`, and the `runWith()` deps helper — reusing them avoids duplicating ~200 lines of fakes. Net coverage is identical.

---

### Task 1: Shared scan-progress event contract

**Files:**
- Create: `lib/onboarding/scanProgress.ts`
- Test: `tests/onboarding/scanProgress.test.ts`

**Interfaces:**
- Produces: `ScanProgressEvent`, `ScanResultBody`, `ScanStreamMessage`, `SCAN_STREAM_CONTENT_TYPE` — consumed by Tasks 3 (`onProgress` event type), 4 (route emit), 5 (client reader).

- [ ] **Step 1: Write the failing test**

```ts
// tests/onboarding/scanProgress.test.ts
import { describe, expect, test } from "vitest";
import {
  SCAN_STREAM_CONTENT_TYPE,
  type ScanProgressEvent,
  type ScanResultBody,
  type ScanStreamMessage,
} from "@/lib/onboarding/scanProgress";

describe("scanProgress contract", () => {
  test("content-type is NDJSON", () => {
    expect(SCAN_STREAM_CONTENT_TYPE).toBe("application/x-ndjson");
  });

  test("event/message/result-body shapes are assignable as specified", () => {
    const listed: ScanProgressEvent = { type: "listed", total: 19 };
    const prepared: ScanProgressEvent = { type: "prepared", done: 1, total: 19, name: "II — East Coast" };
    const staging: ScanProgressEvent = { type: "staging" };
    const errBody: ScanResultBody = { ok: false, code: null };
    const okBody: ScanResultBody = {
      outcome: "completed",
      wizardSessionId: "w",
      folderId: "f",
      totals: { staged: 1, hard_failed: 0, skipped_non_sheet: 0, live_row_conflict: 0 },
    };
    const msgs: ScanStreamMessage[] = [listed, prepared, staging, { type: "result", body: okBody }, { type: "result", body: errBody }];
    expect(msgs).toHaveLength(5);
    // discriminant is present on every progress event
    for (const m of [listed, prepared, staging]) expect(typeof m.type).toBe("string");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/onboarding/scanProgress.test.ts`
Expected: FAIL — `Cannot find module '@/lib/onboarding/scanProgress'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/onboarding/scanProgress.ts
import type { OnboardingScanResponseBody } from "@/lib/onboarding/scanResponse";

/** Incremental progress events emitted during an onboarding scan. */
export type ScanProgressEvent =
  | { type: "listed"; total: number }
  | { type: "prepared"; done: number; total: number; name: string }
  | { type: "staging" };

/**
 * Terminal-event body. Superset of OnboardingScanResponseBody (completed |
 * schema_missing | superseded, scanResponse.ts:43-45) PLUS the mid-run-failure
 * shape that body cannot model. `code` widens to string | null so the route's
 * D7 `{ ok:false, code:null }` fits and the client's copyForCode(null) → generic.
 */
export type ScanResultBody =
  | OnboardingScanResponseBody
  | { ok: false; code: string | null };

/** One NDJSON line on the wire: a progress event or the terminal result. */
export type ScanStreamMessage =
  | ScanProgressEvent
  | { type: "result"; body: ScanResultBody };

export const SCAN_STREAM_CONTENT_TYPE = "application/x-ndjson";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/onboarding/scanProgress.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/onboarding/scanProgress.ts tests/onboarding/scanProgress.test.ts
git commit -m "feat(onboarding): shared scan-progress event contract"
```

---

### Task 2: `mapWithConcurrency` per-completion callback

**Files:**
- Modify: `lib/async/mapWithConcurrency.ts:17-49`
- Test: `tests/async/mapWithConcurrency.test.ts` (extend)

**Interfaces:**
- Produces: `mapWithConcurrency(items, limit, fn, onItemComplete?)` where `onItemComplete?: (info: { index: number; done: number; total: number; item: T; result: R }) => void`. Consumed by Task 3.

- [ ] **Step 1: Write the failing tests** (append to the existing `describe("mapWithConcurrency", …)`)

```ts
  test("fires onItemComplete once per item with a monotonic running done-count", async () => {
    const items = ["a", "b", "c", "d"];
    const seen: Array<{ done: number; total: number; index: number; item: string; result: string }> = [];
    const result = await mapWithConcurrency(
      items,
      2,
      async (s, i) => `${i}:${s}`,
      (info) => seen.push(info),
    );
    expect(result).toEqual(["0:a", "1:b", "2:c", "3:d"]);
    expect(seen).toHaveLength(items.length);
    // done is strictly 1..N regardless of completion order (derived from input length)
    expect(seen.map((s) => s.done)).toEqual(items.map((_, i) => i + 1));
    expect(seen.every((s) => s.total === items.length)).toBe(true);
    // every item + its result is reported exactly once
    expect(new Set(seen.map((s) => s.item))).toEqual(new Set(items));
    expect(new Set(seen.map((s) => s.result))).toEqual(new Set(["0:a", "1:b", "2:c", "3:d"]));
  });

  test("does not invoke onItemComplete for an empty input", async () => {
    let calls = 0;
    const result = await mapWithConcurrency([], 4, async (n) => n, () => { calls += 1; });
    expect(result).toEqual([]);
    expect(calls).toBe(0);
  });

  test("a throwing onItemComplete neither rejects the map nor masks a real fn rejection", async () => {
    // throwing callback on success must be swallowed
    const ok = await mapWithConcurrency([1, 2], 2, async (n) => n, () => { throw new Error("cb boom"); });
    expect(ok).toEqual([1, 2]);
    // a real fn rejection still surfaces even with a throwing callback registered
    await expect(
      mapWithConcurrency([1, 2], 2, async (n) => { if (n === 1) throw new Error("fn boom"); return n; },
        () => { throw new Error("cb boom"); }),
    ).rejects.toThrow("fn boom");
  });

  test("omitting onItemComplete behaves exactly like the 3-arg form", async () => {
    const result = await mapWithConcurrency([1, 2, 3], 2, async (n) => n * 10);
    expect(result).toEqual([10, 20, 30]);
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run tests/async/mapWithConcurrency.test.ts`
Expected: FAIL — the new `onItemComplete` arg is ignored (callback never fires → `seen` empty).

- [ ] **Step 3: Implement** — replace the function body (`:17-49`) with:

```ts
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  onItemComplete?: (info: { index: number; done: number; total: number; item: T; result: R }) => void,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`mapWithConcurrency limit must be a positive integer, got ${limit}`);
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;
  let completed = 0;
  let failed = false;

  const worker = async (): Promise<void> => {
    // `nextIndex++` is atomic relative to the single-threaded event loop: the
    // read+increment happens with no intervening await, so each worker claims a
    // unique index before yielding.
    while (!failed) {
      const index = nextIndex++;
      if (index >= items.length) return;
      const item = items[index] as T;
      let result: R;
      try {
        result = await fn(item, index);
      } catch (error) {
        failed = true;
        throw error;
      }
      results[index] = result;
      // Success path only. `completed += 1` then the callback run with no
      // intervening await keeps `done` race-free (same reasoning as nextIndex++).
      completed += 1;
      if (onItemComplete) {
        try {
          onItemComplete({ index, done: completed, total: items.length, item, result });
        } catch {
          // A throwing callback must never set `failed` / mask a real fn rejection.
        }
      }
    }
  };

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
```

Also update the JSDoc contract block (`:1-16`): add a bullet documenting `onItemComplete` and that **it fires in completion order, not input order** (`index` maps a completion back to its input slot); callback errors are swallowed.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run tests/async/mapWithConcurrency.test.ts`
Expected: PASS (all old + new tests).

- [ ] **Step 5: Commit**

```bash
git add lib/async/mapWithConcurrency.ts tests/async/mapWithConcurrency.test.ts
git commit -m "feat: mapWithConcurrency optional per-completion onItemComplete callback"
```

---

### Task 3: `runOnboardingScan` emits progress

**Files:**
- Modify: `lib/sync/runOnboardingScan.ts` — `RunOnboardingScanDeps` (`:141-161`), `prepareOnboardingFiles` (`:891-925`), `scanPreparedFiles` (`:804-815`)
- Test: `tests/sync/onboarding.test.ts` (extend; reuses `runWith`/`file`/`FakeOnboardingTx`)

**Interfaces:**
- Consumes: `ScanProgressEvent` (Task 1); `mapWithConcurrency(..., onItemComplete)` (Task 2).
- Produces: `RunOnboardingScanDeps.onProgress?: (e: ScanProgressEvent) => void`. Consumed by Task 4.

- [ ] **Step 1: Write the failing test** (append inside `describe("runOnboardingScan", …)` in `tests/sync/onboarding.test.ts`)

```ts
  test("emits listed → prepared×N (monotonic done, named) → staging via onProgress, and the result is unchanged", async () => {
    const { runOnboardingScan } = await import("@/lib/sync/runOnboardingScan");
    const { ScanProgressEvent } = {} as never; // type-only marker; events typed below
    const files = [file("file-1"), file("file-2"), file("file-3")];
    const N = files.length; // derive expectations from the fixture (anti-hardcode)

    const txWith = new FakeOnboardingTx();
    const events: Array<{ type: string; done?: number; total?: number; name?: string }> = [];
    const resultWith = await runOnboardingScan("folder-1", W1, {
      tx: txWith,
      listFolder: vi.fn(async () => files),
      fetchMarkdownWithBinding: vi.fn(async (driveFileId: string) => ({
        binding: { bindingToken: `tok-${driveFileId}`, modifiedTime: "2026-05-08T12:00:00.000Z" },
        markdown: `markdown:${driveFileId}`,
      })),
      parseSheet: vi.fn((markdown: string) => ({ markdown }) as unknown as ParsedSheet),
      enrichWithDrivePins: vi.fn(async () => parseResult()),
      onProgress: (e) => events.push(e),
    });

    // listed first, with the real folder size
    expect(events[0]).toEqual({ type: "listed", total: N });
    // exactly N prepared events; done is 1..N (monotonic by construction); names ⊆ fixture
    const prepared = events.filter((e) => e.type === "prepared");
    expect(prepared).toHaveLength(N);
    expect(prepared.map((e) => e.done)).toEqual(files.map((_, i) => i + 1));
    expect(prepared.every((e) => e.total === N)).toBe(true);
    expect(new Set(prepared.map((e) => e.name))).toEqual(new Set(files.map((f) => f.name)));
    // staging is the last progress event (emitted before the stage loop, after prepare)
    expect(events.at(-1)).toEqual({ type: "staging" });

    // result identical to a run WITHOUT onProgress (progress is purely additive)
    const txWithout = new FakeOnboardingTx();
    const resultWithout = await runOnboardingScan("folder-1", W1, {
      tx: txWithout,
      listFolder: vi.fn(async () => files),
      fetchMarkdownWithBinding: vi.fn(async (driveFileId: string) => ({
        binding: { bindingToken: `tok-${driveFileId}`, modifiedTime: "2026-05-08T12:00:00.000Z" },
        markdown: `markdown:${driveFileId}`,
      })),
      parseSheet: vi.fn((markdown: string) => ({ markdown }) as unknown as ParsedSheet),
      enrichWithDrivePins: vi.fn(async () => parseResult()),
    });
    expect(resultWith).toEqual(resultWithout);
  });
```

> Add the import for the event type at the top of the file if you prefer typing `events` precisely: `import type { ScanProgressEvent } from "@/lib/onboarding/scanProgress";` and type `events: ScanProgressEvent[]`. (The inline structural type above also compiles.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/sync/onboarding.test.ts -t "emits listed"`
Expected: FAIL — `onProgress` not in deps / `events` stays empty.

- [ ] **Step 3: Implement** — three edits in `lib/sync/runOnboardingScan.ts`:

(a) Import the event type (top of file, with the other type imports):

```ts
import type { ScanProgressEvent } from "@/lib/onboarding/scanProgress";
```

(b) Add `onProgress` to `RunOnboardingScanDeps` (after the existing `withShowLock?` field, `:156-160`):

```ts
  onProgress?: (event: ScanProgressEvent) => void;
```

(c) In `prepareOnboardingFiles` (`:895-924`), emit `listed` right after the listing and pass an `onItemComplete` to `mapWithConcurrency`:

```ts
  const files = await listFolder(folderId);
  deps.onProgress?.({ type: "listed", total: files.length });
  // … existing fetchMarkdownWithBinding/parseSheet/enrich/driveClient setup + prepareOne …
  return mapWithConcurrency(files, ONBOARDING_PREPARE_CONCURRENCY, prepareOne, (info) =>
    deps.onProgress?.({
      type: "prepared",
      done: info.done,
      total: info.total,
      name: info.item.name,
    }),
  );
```

(d) Widen `scanPreparedFiles`'s `deps` Pick to include `onProgress` and emit `staging` before the loop (`:804-815`):

```ts
async function scanPreparedFiles(
  folderId: string,
  wizardSessionId: string,
  preparedFiles: PreparedOnboardingFile[],
  deps: Pick<RunOnboardingScanDeps, "runPhase1" | "withShowLock" | "onProgress">,
  withTx: <R>(fn: (tx: OnboardingScanTx) => Promise<R>) => Promise<R>,
): Promise<OnboardingScanResult> {
  const processed: ProcessedOnboardingFile[] = [];
  const runPhase1Impl = deps.runPhase1 ?? runPhase1;
  const lock = deps.withShowLock ?? defaultWithShowLock;
  deps.onProgress?.({ type: "staging" });

  for (const prepared of preparedFiles) {
    // … unchanged …
```

(The `scanPreparedFiles(folderId, wizardSessionId, preparedFiles, deps, withTx)` call sites at `:970` and `:986` already forward the full `deps`, so no call-site change is needed.)

- [ ] **Step 4: Run to verify pass** (new test + full file for no regression)

Run: `pnpm vitest run tests/sync/onboarding.test.ts`
Expected: PASS (new `emits listed…` test + all existing).

- [ ] **Step 5: Commit**

```bash
git add lib/sync/runOnboardingScan.ts tests/sync/onboarding.test.ts
git commit -m "feat(onboarding): emit listed/prepared/staging progress from runOnboardingScan"
```

---

### Task 4: Stream the scan route as NDJSON

**Files:**
- Modify: `app/api/admin/onboarding/scan/route.ts` (`:31-37` deps type, `:235-247` body + `maxDuration`)
- Test: `tests/onboarding/scanRoute.test.ts` (keep pre-stream error tests; rewrite success/outcome paths for NDJSON)

**Interfaces:**
- Consumes: `runOnboardingScan(folderId, wizardSessionId, { onProgress })` (Task 3); `ScanStreamMessage`, `SCAN_STREAM_CONTENT_TYPE` (Task 1); `toScanResponseBody` (existing).
- Produces: a `200 application/x-ndjson` stream on the run path; unchanged non-200 JSON on pre-stream errors.

- [ ] **Step 1: Write the failing tests** — add an NDJSON reader helper + rewrite the success/outcome assertions. Keep the pre-stream error tests (`INVALID_FOLDER_URL`/`FOLDER_*`/non-admin) exactly as they are — they still return single JSON.

```ts
// helper (add near the top of the test file)
async function readNdjson(response: Response): Promise<unknown[]> {
  const text = await response.text();
  return text.split("\n").filter((l) => l.trim().length > 0).map((l) => JSON.parse(l));
}
function terminal(messages: unknown[]): unknown {
  const last = messages.at(-1) as { type?: string; body?: unknown };
  expect(last?.type).toBe("result");
  return last!.body;
}

// REWRITE: AC-10.2 success (was response.json()). Add this import to the file:
//   import { toScanResponseBody } from "@/lib/onboarding/scanResponse";
test("AC-10.2 success streams NDJSON; terminal body == toScanResponseBody (derived, anti-tautology)", async () => {
  const db = new FakeScanDb();
  // The expected terminal body is computed FROM the injected result via the SAME
  // helper the route uses — never hand-authored — so the assertion cannot drift
  // from the shared response contract and cannot pass against a wrong shape.
  const result = {
    outcome: "completed" as const,
    processed: [{ driveFileId: "sheet-1", outcome: "staged" as const }],
  };
  const routeDeps = deps(db, { runOnboardingScan: vi.fn(async () => result) });
  const response = await handleOnboardingScan(
    request("https://drive.google.com/drive/folders/folder-1"),
    routeDeps,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/x-ndjson");
  const messages = await readNdjson(response);
  const expectedBody = toScanResponseBody(result, {
    wizardSessionId: W1,
    folderId: "folder-1",
    folderName: "FXAV Onboarding",
  });
  expect(terminal(messages)).toEqual(expectedBody);
  // 3rd arg now carries onProgress (the assertion at old :164 must be updated)
  expect(routeDeps.runOnboardingScan).toHaveBeenCalledWith(
    "folder-1", W1, expect.objectContaining({ onProgress: expect.any(Function) }),
  );
});

test("progress events emitted by the scan are forwarded as NDJSON lines before the result", async () => {
  const db = new FakeScanDb();
  const routeDeps = deps(db, {
    runOnboardingScan: vi.fn(async (_f, _w, d?: { onProgress?: (e: unknown) => void }) => {
      d?.onProgress?.({ type: "listed", total: 2 });
      d?.onProgress?.({ type: "prepared", done: 1, total: 2, name: "A" });
      d?.onProgress?.({ type: "prepared", done: 2, total: 2, name: "B" });
      d?.onProgress?.({ type: "staging" });
      return { outcome: "completed" as const, processed: [
        { driveFileId: "a", outcome: "staged" as const },
        { driveFileId: "b", outcome: "staged" as const },
      ] };
    }),
  });
  const response = await handleOnboardingScan(
    request("https://drive.google.com/drive/folders/folder-1"),
    routeDeps,
  );
  const messages = (await readNdjson(response)) as Array<{ type: string }>;
  expect(messages.map((m) => m.type)).toEqual(["listed", "prepared", "prepared", "staging", "result"]);
});

test("mid-run throw becomes a terminal {ok:false, code:null} on a 200 stream", async () => {
  const db = new FakeScanDb();
  const routeDeps = deps(db, {
    runOnboardingScan: vi.fn(async () => { throw new Error("drive exploded"); }),
  });
  const response = await handleOnboardingScan(
    request("https://drive.google.com/drive/folders/folder-1"),
    routeDeps,
  );
  expect(response.status).toBe(200);
  const messages = await readNdjson(response);
  expect(terminal(messages)).toEqual({ ok: false, code: null });
});
```

Also REWRITE the two passthrough cases (schema_missing / superseded) and the totals/live_row_conflict cases to assert `terminal(await readNdjson(response))` instead of `await json(response)` (status stays 200; the `terminal` body equals the same objects asserted today). Update the `toHaveBeenCalledWith("folder-2", W2)` assertion (old :296) to the 3-arg `expect.objectContaining({ onProgress: expect.any(Function) })` form.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run tests/onboarding/scanRoute.test.ts`
Expected: FAIL — route still returns single JSON (`content-type` not ndjson; `readNdjson` parse / `toHaveBeenCalledWith` 3-arg mismatch).

- [ ] **Step 3: Implement** — in `app/api/admin/onboarding/scan/route.ts`:

(a) Add the segment config at the top (after imports):

```ts
export const maxDuration = 300;
```

(b) Add the stream imports:

```ts
import { SCAN_STREAM_CONTENT_TYPE, type ScanStreamMessage } from "@/lib/onboarding/scanProgress";
```

(c) Widen `ScanRouteDeps.runOnboardingScan` (`:36`) to accept the optional 3rd deps arg (matches the real signature):

```ts
  runOnboardingScan?: (
    folderId: string,
    wizardSessionId: string,
    deps?: { onProgress?: (event: import("@/lib/onboarding/scanProgress").ScanProgressEvent) => void },
  ) => Promise<OnboardingScanResult>;
```

(d) Replace the final block (`:235-242`) — keep everything above (`reserveWizardSession`) unchanged:

```ts
  const encoder = new TextEncoder();
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // emit MUST swallow enqueue errors: after a client cancels, enqueue throws,
      // and emit is also called for listed/staging OUTSIDE mapWithConcurrency's
      // isolated callback — an uncaught throw would abort the scan mid-flight.
      const emit = (msg: ScanStreamMessage) => {
        if (canceled) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(msg) + "\n"));
        } catch {
          canceled = true;
        }
      };
      try {
        const result = await runtime.runOnboardingScan(folder.folderId, wizardSessionId, {
          onProgress: emit,
        });
        emit({
          type: "result",
          body: toScanResponseBody(result, {
            wizardSessionId,
            folderId: folder.folderId,
            folderName: folder.folderName,
          }),
        });
      } catch {
        emit({ type: "result", body: { ok: false, code: null } });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed/canceled */
        }
      }
    },
    cancel() {
      // Client aborted the read; the scan still runs to completion inside start()'s
      // promise (consistent wizard-session state). emit() no-ops via `canceled`.
      canceled = true;
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": SCAN_STREAM_CONTENT_TYPE,
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run tests/onboarding/scanRoute.test.ts`
Expected: PASS (rewritten streaming tests + preserved pre-stream error tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/onboarding/scan/route.ts tests/onboarding/scanRoute.test.ts
git commit -m "feat(onboarding): stream the scan route as NDJSON progress + maxDuration"
```

---

### Task 5: `Step2Verify` stream reader + determinate bar (UI)

**Files:**
- Modify: `components/admin/wizard/Step2Verify.tsx`
- Test: `tests/components/admin/wizard/Step2Verify.test.tsx` (add streaming mock + new cases; keep request-header + error-path tests)

**Interfaces:**
- Consumes: `SCAN_STREAM_CONTENT_TYPE`, `ScanStreamMessage`, `ScanResultBody` (Task 1); the route's NDJSON stream (Task 4).

> UI task — at close-out it goes through the invariant-8 impeccable dual-gate (Task 8). Implement to the spec's §5.5 exactly.

- [ ] **Step 1: Write the failing tests** — add a streaming mock helper and new cases.

```ts
// helper: a Response whose body streams the given messages as NDJSON, split into
// the provided raw chunks (to exercise chunk-boundary buffering).
function streamResponse(chunks: string[], init: { status?: number } = {}): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? "application/x-ndjson" : null) },
    body,
    json: async () => { throw new Error("json() must not be called on a stream response"); },
  } as unknown as Response;
}
function ndjson(...messages: unknown[]): string {
  return messages.map((m) => JSON.stringify(m) + "\n").join("");
}

// A stream the TEST drives, so intermediate phases are observable (the prior
// version enqueued everything synchronously and only saw the success panel).
function controllableStreamResponse(init: { status?: number } = {}) {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(c) { controller = c; } });
  const response = {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? "application/x-ndjson" : null) },
    body,
    json: async () => { throw new Error("json() must not be called on a stream response"); },
  } as unknown as Response;
  const push = async (...messages: unknown[]) => {
    await act(async () => {
      controller.enqueue(encoder.encode(messages.map((m) => JSON.stringify(m) + "\n").join("")));
      await Promise.resolve();
    });
  };
  const close = async () => { await act(async () => { controller.close(); await Promise.resolve(); }); };
  return { response, push, close };
}

test("reading phase: determinate bar (aria), count, and Just-read update per prepared event", async () => {
  const total = 3; // expectations derived from the stream, never hardcoded against a fixture
  const { response, push, close } = controllableStreamResponse();
  fetchMock.mockResolvedValue(response);
  const { getByTestId, findByTestId, queryByTestId } = render(<Step2Verify />);
  fireEvent.change(getByTestId("wizard-step2-folder-url-input"), {
    target: { value: "https://drive.google.com/drive/folders/abc123" },
  });
  await act(async () => { fireEvent.click(getByTestId("wizard-step2-submit")); });

  // connecting → indeterminate bar (no aria-valuenow yet)
  expect(getByTestId("wizard-step2-progressbar").getAttribute("aria-valuenow")).toBeNull();

  await push({ type: "listed", total });
  await push({ type: "prepared", done: 1, total, name: "Alpha" });
  // stream reads resolve async — poll with waitFor (CI-flake lesson)
  await waitFor(() =>
    expect(getByTestId("wizard-step2-progressbar").getAttribute("aria-valuenow")).toBe("1"),
  );
  expect(getByTestId("wizard-step2-progressbar").getAttribute("aria-valuemax")).toBe(String(total));
  expect(getByTestId("wizard-step2-count").textContent ?? "").toMatch(new RegExp(`\\b1\\b[^0-9]*\\b${total}\\b`));
  expect(getByTestId("wizard-step2-lastname").textContent ?? "").toContain("Alpha");

  await push({ type: "prepared", done: 2, total, name: "Bravo" });
  await waitFor(() =>
    expect(getByTestId("wizard-step2-progressbar").getAttribute("aria-valuenow")).toBe("2"),
  );
  expect(getByTestId("wizard-step2-lastname").textContent ?? "").toContain("Bravo");

  await push({ type: "staging" });
  // finishing → count line gone, heading flips, bar indeterminate again
  await waitFor(() => expect(queryByTestId("wizard-step2-count")).toBeNull());
  expect(getByTestId("wizard-step2-progress").textContent ?? "").toMatch(/Finishing up/i);

  await push({ type: "result", body: completedScanBody(["staged", "staged", "staged"], "Shows 2026") });
  await close();
  const success = await findByTestId("wizard-step2-success");
  expect(success.textContent ?? "").toMatch(new RegExp(`\\b${total}\\b`));
});

test("result-before-listed: a terminal result with no prior progress still resolves", async () => {
  const { response, push, close } = controllableStreamResponse();
  fetchMock.mockResolvedValue(response);
  const { getByTestId, findByTestId } = render(<Step2Verify />);
  fireEvent.change(getByTestId("wizard-step2-folder-url-input"), {
    target: { value: "https://drive.google.com/drive/folders/abc123" },
  });
  await act(async () => { fireEvent.click(getByTestId("wizard-step2-submit")); });
  await push({ type: "result", body: { outcome: "schema_missing", code: "WIZARD_ISOLATION_INDEXES_MISSING" } });
  await close();
  expect(await findByTestId("wizard-step2-error")).toBeTruthy();
});

test("parses NDJSON across chunk boundaries and an unterminated final line", async () => {
  const total = 2;
  // split a single object across two chunks; pack two objects in one chunk;
  // final result line has NO trailing newline.
  const resultBody = completedScanBody(["staged", "staged"], "Shows 2026");
  fetchMock.mockResolvedValue(
    streamResponse([
      `{"type":"listed","to`,
      `tal":${total}}\n{"type":"prepared","done":1,"total":${total},"name":"A"}\n`,
      `{"type":"prepared","done":2,"total":${total},"name":"B"}\n`,
      JSON.stringify({ type: "result", body: resultBody }), // no trailing \n
    ]),
  );
  const { getByTestId, findByTestId } = render(<Step2Verify />);
  fireEvent.change(getByTestId("wizard-step2-folder-url-input"), {
    target: { value: "https://drive.google.com/drive/folders/abc123" },
  });
  await act(async () => { fireEvent.click(getByTestId("wizard-step2-submit")); });
  expect(await findByTestId("wizard-step2-success")).toBeTruthy();
});

test("empty folder (total 0) goes straight to success without a determinate count", async () => {
  fetchMock.mockResolvedValue(
    streamResponse([ ndjson({ type: "listed", total: 0 }, { type: "staging" },
      { type: "result", body: completedScanBody([], "Empty Folder") }) ]),
  );
  const { getByTestId, findByTestId, queryByTestId } = render(<Step2Verify />);
  fireEvent.change(getByTestId("wizard-step2-folder-url-input"), {
    target: { value: "https://drive.google.com/drive/folders/empty" },
  });
  await act(async () => { fireEvent.click(getByTestId("wizard-step2-submit")); });
  expect(await findByTestId("wizard-step2-success")).toBeTruthy();
  expect(queryByTestId("wizard-step2-count")).toBeNull();
});

test("terminal {ok:false, code:null} renders generic copy with no raw code", async () => {
  fetchMock.mockResolvedValue(
    streamResponse([ ndjson({ type: "listed", total: 1 }, { type: "result", body: { ok: false, code: null } }) ]),
  );
  const { getByTestId, findByTestId, container } = render(<Step2Verify />);
  fireEvent.change(getByTestId("wizard-step2-folder-url-input"), {
    target: { value: "https://drive.google.com/drive/folders/abc123" },
  });
  await act(async () => { fireEvent.click(getByTestId("wizard-step2-submit")); });
  const err = await findByTestId("wizard-step2-error");
  expect((err.textContent ?? "").trim().length).toBeGreaterThan(0);
  expect(container.textContent ?? "").not.toContain("null");
});

test("a stream that ends without a result renders the generic error", async () => {
  fetchMock.mockResolvedValue(
    streamResponse([ ndjson({ type: "listed", total: 1 }, { type: "prepared", done: 1, total: 1, name: "X" }) ]),
  );
  const { getByTestId, findByTestId } = render(<Step2Verify />);
  fireEvent.change(getByTestId("wizard-step2-folder-url-input"), {
    target: { value: "https://drive.google.com/drive/folders/abc123" },
  });
  await act(async () => { fireEvent.click(getByTestId("wizard-step2-submit")); });
  expect(await findByTestId("wizard-step2-error")).toBeTruthy();
});
```

> Keep the existing tests: request-header (`Content-Type: application/json`), the 400/403/404 error paths (they use `mockJsonResponse` → `!ok` → JSON branch), schema_missing/superseded (json-path safety net still handles them), network-reject, submit-disabled. They remain valid because the client's non-stream branch (`!ok` || content-type≠ndjson) preserves today's handling.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run tests/components/admin/wizard/Step2Verify.test.tsx`
Expected: FAIL — component does not read the stream (no `wizard-step2-count`, success never reached).

- [ ] **Step 3: Implement** — replace `components/admin/wizard/Step2Verify.tsx` with the streaming version. Full file:

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { messageFor } from "@/lib/messages/lookup";
import { HelpAffordance } from "@/components/admin/HelpAffordance";
import { HelpTooltip } from "@/components/admin/HelpTooltip";
import type { MessageCode } from "@/lib/messages/catalog";
import {
  SCAN_STREAM_CONTENT_TYPE,
  type ScanResultBody,
  type ScanStreamMessage,
} from "@/lib/onboarding/scanProgress";
import type {
  OnboardingScanCompletedBody,
  OnboardingScanTotals,
} from "@/lib/onboarding/scanResponse";

const RECOGNIZED_CODES = new Set<MessageCode>([
  "INVALID_FOLDER_URL",
  "FOLDER_NOT_SHARED",
  "FOLDER_NOT_FOUND",
  "OPERATOR_ERROR_NOT_FOLDER",
  "OPERATOR_ERROR_INCOMPLETE_FOLDER_METADATA",
  "WIZARD_ISOLATION_INDEXES_MISSING",
]);

const GENERIC_DRIVE_ERROR =
  "We could not reach Drive just now. Check your connection and try again.";
const GENERIC_VERIFY_ERROR =
  "We could not verify that folder. Try the link again, or contact the developer if this keeps happening.";

type ScanCompleted = OnboardingScanCompletedBody;

type ScanProgress =
  | { phase: "connecting" }
  | { phase: "reading"; done: number; total: number; lastName: string | null }
  | { phase: "finishing" };

type FormState =
  | { kind: "idle" }
  | { kind: "submitting"; folderUrl: string; progress: ScanProgress }
  | { kind: "success"; result: ScanCompleted }
  | { kind: "error"; copy: string; code: string | null };

function formatTotals(totals: OnboardingScanTotals): number {
  return (
    totals.staged + totals.hard_failed + totals.skipped_non_sheet + (totals.live_row_conflict ?? 0)
  );
}

function copyForCode(code: string | null): string {
  if (code && RECOGNIZED_CODES.has(code as MessageCode)) {
    const entry = messageFor(code as MessageCode);
    if (entry.dougFacing) return entry.dougFacing;
  }
  return GENERIC_VERIFY_ERROR;
}

export function Step2Verify() {
  const router = useRouter();
  const [folderUrl, setFolderUrl] = useState("");
  const [state, setState] = useState<FormState>({ kind: "idle" });
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startedAtRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isSubmitting = state.kind === "submitting";

  useEffect(() => {
    if (!isSubmitting) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    intervalRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isSubmitting]);

  // Apply a terminal result body (shared by the stream + non-stream branches).
  function applyResultBody(body: ScanResultBody | { ok: false; code: string }) {
    if ("outcome" in body) {
      if (body.outcome === "completed") {
        setState({ kind: "success", result: body });
        return;
      }
      if (body.outcome === "superseded") {
        setState({ kind: "idle" });
        router.refresh();
        return;
      }
      if (body.outcome === "schema_missing") {
        setState({ kind: "error", copy: copyForCode(body.code), code: body.code });
        return;
      }
    }
    if ("ok" in body && body.ok === false) {
      setState({ kind: "error", copy: copyForCode(body.code), code: body.code });
      return;
    }
    setState({ kind: "error", copy: GENERIC_VERIFY_ERROR, code: null });
  }

  // Returns true if `line` was the terminal result (caller stops reading).
  function dispatchLine(line: string): boolean {
    let msg: ScanStreamMessage;
    try {
      msg = JSON.parse(line) as ScanStreamMessage;
    } catch {
      return false;
    }
    if (msg.type === "listed") {
      const total = msg.total;
      setState((s) =>
        s.kind === "submitting"
          ? {
              ...s,
              progress:
                total <= 0
                  ? { phase: "finishing" }
                  : { phase: "reading", done: 0, total, lastName: null },
            }
          : s,
      );
      return false;
    }
    if (msg.type === "prepared") {
      setState((s) =>
        s.kind === "submitting"
          ? { ...s, progress: { phase: "reading", done: msg.done, total: msg.total, lastName: msg.name || null } }
          : s,
      );
      return false;
    }
    if (msg.type === "staging") {
      setState((s) => (s.kind === "submitting" ? { ...s, progress: { phase: "finishing" } } : s));
      return false;
    }
    if (msg.type === "result") {
      applyResultBody(msg.body);
      return true;
    }
    return false;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = folderUrl.trim();
    if (!trimmed) return;
    setElapsedSeconds(0);
    startedAtRef.current = Date.now();
    setState({ kind: "submitting", folderUrl: trimmed, progress: { phase: "connecting" } });
    try {
      const response = await fetch("/api/admin/onboarding/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderUrl: trimmed }),
      });
      const contentType = response.headers?.get?.("content-type") ?? "";
      const isStream =
        response.ok && contentType.includes(SCAN_STREAM_CONTENT_TYPE) && response.body != null;

      if (!isStream) {
        // Pre-stream errors (non-200 JSON) + json-path safety net.
        const body = (await response.json()) as ScanResultBody | { ok: false; code: string };
        applyResultBody(body);
        return;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sawResult = false;
      outer: for (;;) {
        const { value, done } = await reader.read();
        if (value) buffer += decoder.decode(value, { stream: true });
        let nl = buffer.indexOf("\n");
        while (nl >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (line && dispatchLine(line)) {
            sawResult = true;
            break outer;
          }
          nl = buffer.indexOf("\n");
        }
        if (done) break;
      }
      if (!sawResult) {
        const tail = buffer.trim();
        if (tail && dispatchLine(tail)) sawResult = true;
      }
      if (!sawResult) {
        setState({ kind: "error", copy: GENERIC_DRIVE_ERROR, code: null });
      }
    } catch {
      setState({ kind: "error", copy: GENERIC_DRIVE_ERROR, code: null });
    }
  }

  const submitDisabled = isSubmitting || folderUrl.trim().length === 0;
  const progress = state.kind === "submitting" ? state.progress : null;
  const heading =
    progress?.phase === "finishing" ? "Finishing up…" : "Looking through your folder…";
  const determinate = progress?.phase === "reading";

  return (
    <section
      data-testid="wizard-step2"
      aria-labelledby="wizard-step2-heading"
      className="flex flex-col gap-section-gap"
    >
      <header className="flex flex-col gap-2">
        <p
          data-testid="wizard-step2-eyebrow"
          className="text-xs font-medium uppercase text-text-subtle"
          style={{ letterSpacing: "var(--tracking-eyebrow)" }}
        >
          Step 2 of 3
        </p>
        <div className="flex items-center gap-2">
          <h2 id="wizard-step2-heading" className="text-2xl font-semibold text-text-strong">
            Verify your folder
          </h2>
          <HelpTooltip
            label="Help: Verify your folder"
            testId="help-affordance--wizard-step2--tooltip"
          >
            <p>
              Paste the URL of the Drive folder you shared in step 1. We read every Google Sheet
              inside that folder, then walk you through any that need a closer look in step 3.
            </p>
            <p className="mt-2">
              <a
                href="/help/admin/onboarding-wizard#step-2"
                aria-label="Learn more about verifying your folder"
                className="inline-flex min-h-tap-min items-center text-accent-on-bg underline underline-offset-2 hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              >
                Learn more →
              </a>
            </p>
          </HelpTooltip>
        </div>
        <p className="max-w-prose text-base text-text-subtle">
          Paste the link to the folder you just shared. We will read what is inside and bring it in
          for review.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-3 rounded-md border border-border bg-surface p-tile-pad"
      >
        <label htmlFor="wizard-step2-folder-url" className="text-sm font-semibold text-text-strong">
          Folder link
        </label>
        <input
          id="wizard-step2-folder-url"
          data-testid="wizard-step2-folder-url-input"
          type="url"
          value={folderUrl}
          onChange={(e) => setFolderUrl(e.target.value)}
          placeholder="Paste your Drive folder URL"
          autoComplete="off"
          spellCheck={false}
          disabled={isSubmitting}
          className="min-h-tap-min rounded-sm border border-border-strong bg-bg px-3 text-base text-text disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        />
        <button
          type="submit"
          data-testid="wizard-step2-submit"
          disabled={submitDisabled}
          className="inline-flex min-h-tap-min items-center justify-center self-start rounded-sm bg-accent px-6 text-base font-semibold text-accent-text shadow-(--shadow-tile) transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          {isSubmitting ? "Verifying…" : "Verify and scan"}
        </button>
      </form>

      {state.kind === "submitting" && progress ? (
        <div
          data-testid="wizard-step2-progress"
          className="flex flex-col gap-2 rounded-md border border-border bg-surface-sunken p-tile-pad text-sm text-text"
        >
          <p className="font-semibold text-text-strong" aria-hidden="true">
            {heading}
          </p>
          <p className="break-all text-text-subtle" aria-hidden="true">
            {state.folderUrl}
          </p>
          <progress
            data-testid="wizard-step2-progressbar"
            className="h-2 w-full motion-reduce:transition-none"
            max={determinate ? (progress as { total: number }).total : undefined}
            value={determinate ? (progress as { done: number }).done : undefined}
            aria-label="Folder scan progress"
            aria-valuemin={0}
            aria-valuemax={determinate ? (progress as { total: number }).total : undefined}
            aria-valuenow={determinate ? (progress as { done: number }).done : undefined}
          />
          {determinate ? (
            <p className="tabular-nums text-text-subtle" data-testid="wizard-step2-count" aria-hidden="true">
              {(progress as { done: number }).done} of {(progress as { total: number }).total} sheet
              {(progress as { total: number }).total === 1 ? "" : "s"}
            </p>
          ) : null}
          {determinate && (progress as { lastName: string | null }).lastName ? (
            <p
              className="truncate text-text-subtle"
              data-testid="wizard-step2-lastname"
              title={(progress as { lastName: string }).lastName}
              aria-hidden="true"
            >
              Just read: {(progress as { lastName: string }).lastName}
            </p>
          ) : null}
          <p className="tabular-nums text-text-subtle" data-testid="wizard-step2-elapsed" aria-hidden="true">
            {elapsedSeconds} second{elapsedSeconds === 1 ? "" : "s"} elapsed
          </p>
          {/* Screen-reader announcer: phase changes only, not every tick. */}
          <span className="sr-only" role="status" aria-live="polite">
            {heading}
          </span>
        </div>
      ) : null}

      {state.kind === "success" ? (
        <div
          data-testid="wizard-step2-success"
          className="flex flex-col gap-3 rounded-md border border-border bg-surface p-tile-pad"
        >
          <p className="text-base font-semibold text-text-strong">
            {state.result.folderName
              ? `Found ${formatTotals(state.result.totals)} items in ${state.result.folderName}.`
              : `Found ${formatTotals(state.result.totals)} items in your folder.`}
          </p>
          <ul className="flex flex-col gap-1 text-sm text-text-subtle">
            <li>
              Sheets ready for review:{" "}
              <span className="font-semibold tabular-nums text-text">
                {state.result.totals.staged}
              </span>
            </li>
            <li>
              Sheets we could not parse:{" "}
              <span className="font-semibold tabular-nums text-text">
                {state.result.totals.hard_failed}
              </span>
            </li>
            <li>
              Non-sheet files we skipped:{" "}
              <span className="font-semibold tabular-nums text-text">
                {state.result.totals.skipped_non_sheet}
              </span>
            </li>
            {state.result.totals.live_row_conflict !== undefined &&
            state.result.totals.live_row_conflict > 0 ? (
              <li>
                Live-row conflicts:{" "}
                <span className="font-semibold tabular-nums text-text">
                  {state.result.totals.live_row_conflict}
                </span>
              </li>
            ) : null}
          </ul>
          <Link
            href="/admin?step=3"
            data-testid="wizard-step2-advance"
            className="inline-flex min-h-tap-min items-center justify-center self-start rounded-sm bg-accent px-6 text-base font-semibold text-accent-text shadow-(--shadow-tile) transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            Continue to Step 3
          </Link>
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div
          role="alert"
          data-testid="wizard-step2-error"
          className="flex flex-col gap-2 rounded-md border border-border bg-warning-bg p-tile-pad text-base text-warning-text"
        >
          <p className="font-semibold">We could not verify that folder.</p>
          <p>{state.copy}</p>
          <HelpAffordance code={state.code} />
        </div>
      ) : null}
    </section>
  );
}
```

> Notes: the `progress as {…}` narrowings are a TS convenience because `determinate`/`heading` are computed outside the JSX; the implementer may instead narrow inside the JSX via `progress.phase === "reading"` checks — either is fine as long as the rendered output matches. `superseded` keeps `code` typed as the literal; `applyResultBody` accepts the wider union to share the non-stream JSON path.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run tests/components/admin/wizard/Step2Verify.test.tsx`
Expected: PASS (new streaming cases + retained existing cases).

- [ ] **Step 5: Commit**

```bash
git add components/admin/wizard/Step2Verify.tsx tests/components/admin/wizard/Step2Verify.test.tsx
git commit -m "feat(crew-page): Step2Verify streams scan progress into a determinate bar"
```

---

### Task 6: Real-browser bar dimensions (standalone-harness manual check)

**Why this is NOT a committed test (R1 fix):** the repo's `vitest.config.ts` collects `tests/**/*.test.ts` (jsdom — cannot compute layout) and `playwright.config.ts` runs only `tests/e2e` (a crew-route harness with no admin-wizard fixture). A `*.test.ts` Playwright file would be mis-collected by vitest. Per spec §5.5 this component has **no fixed-height parent containing flex children**, and the bar's width comes from an explicit `w-full` (not flex `align-items: stretch`), so the heavy CI-Playwright layout gate the project rule targets is **N/A**. The remaining lightweight invariant is verified once, manually, via the standalone real-browser layout harness and the result recorded — no flaky committed artifact.

**Files:** none committed (verification only; record measured numbers in the Task 5 / Task 8 commit body or a `DEFERRED.md` note if it cannot be run).

**Dimensional invariant to confirm (spec §5.5):**
- `<progress data-testid="wizard-step2-progressbar">` renders at the progress panel's full content width (panel width − horizontal `p-tile-pad`), ±0.5px.
- Bar height == `h-2` (8px), ±0.5px.

- [ ] **Step 1: Render the `reading` phase in a real browser.** Use the standalone real-browser layout harness (`reference_standalone_realbrowser_layout_harness`): compile `app/globals.css` with the Tailwind CLI, drop the progress-panel markup (heading + `<progress className="h-2 w-full" value={1} max={3}>` + count) into a static HTML file inside a `p-tile-pad` bordered panel, serve with `python3 -m http.server`, and inspect with Playwright MCP / chrome-devtools.

- [ ] **Step 2: Assert dimensions via `getBoundingClientRect()` / `getComputedStyle`** in the browser console or MCP `evaluate_script`:

```js
const bar = document.querySelector('[data-testid="wizard-step2-progressbar"]');
const panel = document.querySelector('[data-testid="wizard-step2-progress"]');
const s = getComputedStyle(panel);
const contentWidth = panel.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
const b = bar.getBoundingClientRect();
({ widthDelta: Math.abs(b.width - contentWidth), height: b.height }); // expect widthDelta ≤ 0.5, height ≈ 8
```

- [ ] **Step 3: Record the measured numbers** (widthDelta, height) in the Task 8 close-out commit body. If the harness cannot be run in this environment, note it in `DEFERRED.md` with the reason and the manual command for a human to run — do NOT commit a non-running `*.test.ts`.

---

### Task 7: Transition audit

**Files:**
- Modify: `tests/components/admin/wizard/Step2Verify.test.tsx` (add a transition-audit block)

**Structural note (required by the transition-audit rule):** the component uses **no** `framer-motion` / `AnimatePresence`. Every state surface is a plain conditional render (`{state.kind === "…" ? … : null}` / `{cond ? … : null}`), so every transition is **instant** except the native `<progress>` fill, which the browser updates per the `value` attribute (no custom CSS animation — R1 fix; the earlier "CSS width transition" claim was wrong for a native `<progress>`). The audit therefore (a) documents that there are zero animated-presence blocks and (b) behaviorally exercises the non-trivial transitions below.

**Transition Inventory (from spec §5.5) — treatment + where covered:**

| From → To | Treatment | Covered by |
|---|---|---|
| idle → connecting | instant (panel appears on submit) | Task 5 "reading phase" (asserts indeterminate bar pre-listed) |
| connecting → reading | instant; bar indeterminate→determinate | Task 5 "reading phase" (aria-valuenow null → "1") |
| reading → reading (done++) | native `<progress>` value update (no custom anim); text swaps instantly | Task 5 "reading phase" (valuenow 1→2) |
| reading → finishing | instant; bar → indeterminate | Task 5 "reading phase" (staging → count gone) |
| connecting → finishing (empty 0/0) | instant | Task 5 "empty folder" |
| reading/finishing → success | instant | Task 5 "reading phase" / "chunk boundary" |
| reading/finishing → error | instant | Task 5 "{ok:false,code:null}" / "no result" |
| any submitting → idle (superseded) | instant + `router.refresh()` | **Task 7 compound test (below)** |
| connecting → error (pre-run JSON branch) | instant | existing 400/403/404 tests (json path) |
| success → connecting (resubmit; form stays rendered) | instant | **Task 7 resubmit test (below)** |
| error → connecting (resubmit) | instant | **Task 7 resubmit test (below)** |

Unreachable (declared, no test): reading → connecting (a started stream only moves forward); success ↔ error directly (a resubmit always passes through `connecting`).

- [ ] **Step 1: Write the failing tests** — Task 7 adds the three transitions not already pinned by Task 5 (compound superseded-mid-reading, success→connecting, error→connecting), plus the structural no-framer assertion.

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Step2Verify transition audit", () => {
  test("structural: component uses no framer-motion / AnimatePresence (all transitions instant)", () => {
    const src = readFileSync(
      resolve(__dirname, "../../../../components/admin/wizard/Step2Verify.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/framer-motion|AnimatePresence/);
  });

  test("compound: a result arriving mid-reading overrides progress immediately (superseded → refresh)", async () => {
    const { response, push, close } = controllableStreamResponse();
    fetchMock.mockResolvedValue(response);
    const { getByTestId } = render(<Step2Verify />);
    fireEvent.change(getByTestId("wizard-step2-folder-url-input"), {
      target: { value: "https://drive.google.com/drive/folders/abc123" },
    });
    await act(async () => { fireEvent.click(getByTestId("wizard-step2-submit")); });
    await push({ type: "listed", total: 5 });
    await push({ type: "prepared", done: 1, total: 5, name: "A" });
    // result wins over the in-flight reading state
    await push({ type: "result", body: { outcome: "superseded", code: "WIZARD_SESSION_SUPERSEDED_DURING_SCAN" } });
    await close();
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
  });

  test("success → connecting on resubmit (form stays rendered)", async () => {
    fetchMock
      .mockResolvedValueOnce(streamResponse([ ndjson(
        { type: "listed", total: 1 }, { type: "result", body: completedScanBody(["staged"], "First") }) ]))
      .mockImplementationOnce(() => new Promise<Response>(() => {})); // 2nd submit hangs in connecting
    const { getByTestId, findByTestId } = render(<Step2Verify />);
    fireEvent.change(getByTestId("wizard-step2-folder-url-input"), {
      target: { value: "https://drive.google.com/drive/folders/abc123" },
    });
    await act(async () => { fireEvent.click(getByTestId("wizard-step2-submit")); });
    await findByTestId("wizard-step2-success");
    await act(async () => { fireEvent.click(getByTestId("wizard-step2-submit")); }); // form still rendered
    expect(await findByTestId("wizard-step2-progress")).toBeTruthy();
  });

  test("error → connecting on resubmit (form stays rendered)", async () => {
    fetchMock
      .mockResolvedValueOnce(mockJsonResponse({ ok: false, code: "FOLDER_NOT_FOUND" }, { status: 404 }))
      .mockImplementationOnce(() => new Promise<Response>(() => {}));
    const { getByTestId, findByTestId } = render(<Step2Verify />);
    fireEvent.change(getByTestId("wizard-step2-folder-url-input"), {
      target: { value: "https://drive.google.com/drive/folders/missing" },
    });
    await act(async () => { fireEvent.click(getByTestId("wizard-step2-submit")); });
    await findByTestId("wizard-step2-error");
    await act(async () => { fireEvent.click(getByTestId("wizard-step2-submit")); });
    expect(await findByTestId("wizard-step2-progress")).toBeTruthy();
  });
});
```

> `controllableStreamResponse`, `streamResponse`, `ndjson`, `mockJsonResponse`, `completedScanBody`, and `refreshMock` are all defined in Task 5's edits to the same file — reuse them (don't redefine). Verify the relative path in the structural test against the actual test-file depth (`tests/components/admin/wizard/` → repo root is four `..`).

- [ ] **Step 2: Run to verify they fail** — Run the file; compound/resubmit cases fail until Task 5's reader + always-rendered form land.
- [ ] **Step 3: Implement** — satisfied by Task 5 (`dispatchLine` returns true on `result` → `break outer`; `applyResultBody` overrides; the `<form>` is always rendered, so resubmit re-enters `connecting`).
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit**

```bash
git add tests/components/admin/wizard/Step2Verify.test.tsx
git commit -m "test(crew-page): Step2Verify transition audit (compound + resubmit + no-framer structural)"
```

---

### Task 8: Impeccable dual-gate + full suite (close-out)

**Files:** none (verification only) — plus a `DEFERRED.md` entry if any HIGH/CRITICAL is deferred.

- [ ] **Step 1: Run the full unit suite + typecheck + lint**

```bash
pnpm vitest run
pnpm typecheck   # or: pnpm tsc --noEmit (use the repo's script)
pnpm lint
```
Expected: all green.

- [ ] **Step 2: Local build** (MDX/config-adjacent safety per repo norms; streaming route compiles)

```bash
pnpm build
```
Expected: success; the `/api/admin/onboarding/scan` route builds with `maxDuration`/Node runtime.

- [ ] **Step 3: Invariant-8 impeccable critique + audit on the `Step2Verify` diff**

Run `/impeccable critique` then `/impeccable audit` on `components/admin/wizard/Step2Verify.tsx` with the canonical v3 preflight gates (PRODUCT.md / DESIGN.md / register / preflight). Fix HIGH + CRITICAL or record an explicit `DEFERRED.md` entry. This must be an **external** attestation (fresh subagent or user), not self-attested.

- [ ] **Step 4: Commit any fixes** from the impeccable pass.

```bash
git add -A && git commit -m "fix(crew-page): impeccable critique/audit findings on Step2Verify"
```

---

## Self-Review

Run after the plan is drafted (checklist; fix inline).

**1. Spec coverage:**
- §5.1 event contract → Task 1 ✓
- §5.2 mapWithConcurrency → Task 2 ✓
- §5.3 runOnboardingScan onProgress + scanPreparedFiles Pick → Task 3 ✓
- §5.4 route streaming + maxDuration + emit isolation + cancel → Task 4 ✓
- §5.5 Step2Verify reader/bar/status/a11y/reduced-motion → Task 5 ✓
- §5.5 Dimensional Invariants → Task 6 ✓
- §5.5 Transition Inventory → Task 7 ✓
- §6 error handling matrix → Tasks 4 (mid-run/preconditions) + 5 (client mapping) ✓
- §7 invariants/meta-test/lock declarations → Global Constraints + Task 8 ✓
- §8 tests (anti-tautology, chunk-boundary, fixture-derived) → Tasks 2/3/4/5/6/7 ✓
- §9 real-Vercel flush → close-out gate (post-merge CI/deploy), noted in handoff ✓

**2. Placeholder scan:** none — every code step shows complete code.

**3. Type consistency:** `ScanProgressEvent`/`ScanResultBody`/`ScanStreamMessage`/`SCAN_STREAM_CONTENT_TYPE` defined in Task 1, consumed identically in Tasks 3/4/5; `onItemComplete` info shape matches between Task 2 (def) and Task 3 (use: `info.done`/`info.total`/`info.item.name`); `onProgress` signature matches between Task 3 (def) and Task 4 (use). `copyForCode(string|null)` matches the widened `ScanResultBody.code`.

## Adversarial review (cross-model)

After self-review, send this plan to Codex via the adversarial-review skill (cross-model). Iterate to convergence (APPROVE) before execution handoff. Do not skip.

## Execution Handoff

(Autonomous-ship: implement via subagent-driven-development or inline TDD; both user gates waived. Real-Vercel incremental-flush verification (§9) is a post-merge close-out check.)
