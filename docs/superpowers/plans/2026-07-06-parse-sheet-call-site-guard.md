# parseSheet Call-Site Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guard the unwrapped `parseSheet` call in the cron sync pipeline so a parser throw is caught and routed to the same fail-closed `hard_fail` handling as a normal parse hardError, never crashing the sync.

**Architecture:** Three surgical edits. (1) Parser exports a pure `buildThrownParsedSheet(message)` that returns the minimal `ParsedSheet` shape carrying a `PARSE_THREW` hardError. (2) `runInvariants` treats a `PARSE_THREW` hardError as a `hard_fail` trigger under the existing `MI-1_VERSION_DETECTION_FAILED` failedCode. (3) The sync call site wraps `parseSheet` in try/catch: on throw it synthesizes the thrown sheet (fail-closed) and emits a best-effort forensic `PARSE_SHEET_THREW` log. The rest of the pipeline is byte-identical to a normal MI-1 flow (enrich → phase1 → hard_fail → retain last-good + `PARSE_ERROR_LAST_GOOD` for existing shows; `pending_ingestions` for first-seen).

**Tech Stack:** TypeScript, Vitest, Next.js 16 sync pipeline (`lib/sync`), parser (`lib/parser`), structured logger (`lib/log`).

**Spec:** `docs/superpowers/specs/2026-07-06-parse-sheet-call-site-guard.md` (Codex-APPROVED after 4 rounds).

> **Implementation amendment (2026-07-06).** Task 2 (extend `runInvariants` to route a new `PARSE_THREW` code) was **dropped** during implementation: the full-suite `codes.test.ts` producer-scan gate requires every `code:` literal in `app/`+`lib/` to be §12.4-cataloged, so a new `PARSE_THREW` literal orphans CI. `buildThrownParsedSheet` (Task 1) now reuses the cataloged `MI-1_VERSION_DETECTION_FAILED` hardError code, which routes to `hard_fail` via the *existing* `invariants.ts:111` gate — **no `runInvariants` edit**. The Task-1 test asserts the MI-1 code and adds a `runInvariants`-composition assertion (first-seen + existing) in place of the removed Task-2 tests. Task 3's `log.error(` is written contiguous (single token) so `stripLogEmissionCalls` excludes `PARSE_SHEET_THREW` from the producer scan; the guard's hardError assertions check `MI-1_VERSION_DETECTION_FAILED`. See the spec's "Implementation amendment" for the full rationale. Everything below that names `PARSE_THREW` is superseded — read it as `MI-1_VERSION_DETECTION_FAILED`, and skip Task 2.

## Global Constraints

- **TDD per task:** failing test → run-red → minimal impl → run-green → commit. One task per commit.
- **Conventional commits, `--no-verify`** (shared lint-staged hook belongs to the main checkout): `feat(parser):`, `feat(sync):`, etc. Every commit message ends with the two trailer lines used elsewhere in this branch (`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` and the `Claude-Session:` line).
- **Advisory lock (invariant 2): untouched.** The guard is entirely inside `prepareProcessOneFile`, which runs BEFORE the per-show lock (`runScheduledCronSync.ts:2542` is outside the `lock(...)` wrapper at `:2568`). No `pg_advisory*` call is added or moved.
- **No §12.4 catalog change.** `PARSE_THREW` (a `ParseError.code`) and `PARSE_SHEET_THREW` (a `log.*` code) are free strings (`lib/parser/types.ts:22`; `lib/log/types.ts:4-13`), NOT admin-alert catalog codes. Do not touch `lib/messages/catalog.ts`, `gen:spec-codes`, or master-spec §12.4.
- **No new meta-test** (spec §4.3): `prepareProcessOneFile` is an internal sync function, outside the mutation-surface scanner (`tests/log/_metaMutationSurfaceObservability.test.ts`) and the admin-outcome AST registry (`tests/log/_metaAdminOutcomeContract.test.ts`).
- **Routed failedCode stays `MI-1_VERSION_DETECTION_FAILED`** (already cataloged / rendered via `lib/messages/lookup.ts`) — invariant 5 preserved; `PARSE_THREW` never reaches a UI-visible code path.
- **Full suite before push:** the change touches the shared chokepoint `runInvariants`; run `pnpm test` (not just scoped files), then `pnpm typecheck`, `pnpm lint`, `pnpm format:check` (memory: scoped gates miss regressions; `--no-verify` bypasses prettier).

---

## File Structure

- `lib/parser/index.ts` — add exported `buildThrownParsedSheet(message: string): ParsedSheet` (wraps the existing private `buildMinimalParsedSheet`, `:481`).
- `lib/parser/invariants.ts` — extend the `versionFailed` predicate (`:108-118`) to also fire on a `PARSE_THREW` hardError; crash-specific message.
- `lib/sync/runScheduledCronSync.ts` — replace the bare parse call (`:2775`) with a guarded try/catch that synthesizes via `buildThrownParsedSheet` and logs `PARSE_SHEET_THREW`.
- `tests/parser/buildThrownParsedSheet.test.ts` — NEW: unit test for the builder shape.
- `tests/invariants/mi.test.ts` — extend: `PARSE_THREW` → `hard_fail` (existing-prior + first-seen `prior=null`).
- `tests/sync/parseSheetCallSiteGuard.test.ts` — NEW: guard behavior (catch/synth/log/robustness/wiring), modeled on `tests/sync/parse-error-last-good-producer.test.ts`.

---

## Task 1: Parser — `buildThrownParsedSheet`

**Files:**
- Modify: `lib/parser/index.ts` (add export near `buildMinimalParsedSheet`, `:481-514`)
- Test: `tests/parser/buildThrownParsedSheet.test.ts` (create)

**Interfaces:**
- Consumes: private `buildMinimalParsedSheet(templateVersion, hardErrors)` (`lib/parser/index.ts:481`), types `ParsedSheet` / `ParseError` (`lib/parser/types.ts`).
- Produces: `export function buildThrownParsedSheet(message: string): ParsedSheet` — returns a minimal sheet with `template_version === "v4"`, empty crew/rooms, and `hardErrors === [{ code: "PARSE_THREW", message }]`. Consumed by Task 3.

- [ ] **Step 1: Write the failing test**

Create `tests/parser/buildThrownParsedSheet.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildThrownParsedSheet } from "@/lib/parser";

describe("buildThrownParsedSheet", () => {
  it("returns a minimal ParsedSheet carrying a single PARSE_THREW hardError", () => {
    const sheet = buildThrownParsedSheet("boom");
    // The PARSE_THREW code is what routes the thrown parse to hard_fail (Task 2); if this
    // shape drifts, a caught throw would stop hard-failing and could auto-apply an empty sheet.
    expect(sheet.hardErrors).toEqual([{ code: "PARSE_THREW", message: "boom" }]);
    expect(sheet.show.template_version).toBe("v4");
    expect(sheet.crewMembers).toEqual([]);
    expect(sheet.rooms).toEqual([]);
    expect(sheet.show.title).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/parser/buildThrownParsedSheet.test.ts`
Expected: FAIL — `buildThrownParsedSheet` is not exported from `@/lib/parser`.

- [ ] **Step 3: Write minimal implementation**

In `lib/parser/index.ts`, immediately after the closing brace of `buildMinimalParsedSheet` (after `:514`), add:

```ts
/**
 * Build the minimal fail-closed ParsedSheet for a caught parser THROW (audit rec-6 / finding #17).
 * The parser is contractually non-throwing; the sync call-site guard uses this to convert an
 * unexpected throw into a hardError-bearing sheet so it routes to hard_fail like any parse failure.
 * Pure — no side effects (the sync layer owns telemetry).
 */
export function buildThrownParsedSheet(message: string): ParsedSheet {
  return buildMinimalParsedSheet("v4", [{ code: "PARSE_THREW", message }]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/parser/buildThrownParsedSheet.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/parser/index.ts tests/parser/buildThrownParsedSheet.test.ts
git commit --no-verify -m "feat(parser): export buildThrownParsedSheet for caught-throw fail-closed routing

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012YhyW9W8ovPvfvgeBvnQG8"
```

---

## Task 2: Invariants — route `PARSE_THREW` to `hard_fail`

**Files:**
- Modify: `lib/parser/invariants.ts` (`versionFailed` block, `:108-118`)
- Test: `tests/invariants/mi.test.ts` (extend the `MI-1: version detection` describe block, near `:99-133`)

**Interfaces:**
- Consumes: `runInvariants(prior, next)` (`lib/parser/invariants.ts`), returns `{ outcome: "hard_fail" | "stage" | "pass"; failedCodes; messages }`.
- Produces: a `PARSE_THREW` hardError now yields `outcome: "hard_fail"` with `failedCodes` including `MI-1_VERSION_DETECTION_FAILED` and a crash-specific `messages` entry, for both `prior !== null` (existing show) and `prior === null` (first-seen).

- [ ] **Step 1: Write the failing test**

In `tests/invariants/mi.test.ts`, inside the `describe("MI-1: version detection", ...)` block (after the existing hardError test near `:133`), add. Reuse the file's existing `synthParseResult()` helper (used at `:95`) for a version-valid baseline and inject the hardError:

```ts
it("hard fails when a PARSE_THREW hardError is present (existing show)", () => {
  const next = {
    ...synthParseResult(),
    hardErrors: [{ code: "PARSE_THREW", message: "Cannot read properties of undefined" }],
  };
  const prior = synthParseResult(); // non-null prior = existing show
  const r = runInvariants(prior, next);
  expect(r.outcome).toBe("hard_fail");
  if (r.outcome === "hard_fail") {
    expect(r.failedCodes).toContain("MI-1_VERSION_DETECTION_FAILED");
    // Crash-specific operator message, NOT the "Version detection failed: got 'v4'" string.
    expect(r.messages.some((m) => m.toLowerCase().includes("parser error"))).toBe(true);
  }
});

it("hard fails when a PARSE_THREW hardError is present (first-seen, prior=null)", () => {
  // Proves the caught-throw routes to hard_fail on a first-seen show too. Combined with the
  // existing first-seen hard_fail coverage (tests/sync/phase1.test.ts:585 → pending_ingestions
  // written, no shows row), this is the full first-seen throw outcome.
  const next = {
    ...synthParseResult(),
    hardErrors: [{ code: "PARSE_THREW", message: "boom" }],
  };
  const r = runInvariants(null, next);
  expect(r.outcome).toBe("hard_fail");
  if (r.outcome === "hard_fail") {
    expect(r.failedCodes).toContain("MI-1_VERSION_DETECTION_FAILED");
  }
});
```

> If `synthParseResult()` is not the exact helper name in `mi.test.ts`, use the file's existing version-valid `ParseResult` builder (the one passed to `runInvariants(null, ...)` at line ~95) and spread the `hardErrors` override onto it — do NOT hardcode a full sheet.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/invariants/mi.test.ts -t "PARSE_THREW"`
Expected: FAIL — `outcome` is `"pass"` (or `"stage"`), not `"hard_fail"`, because `versionFailed` does not yet recognize `PARSE_THREW`.

- [ ] **Step 3: Write minimal implementation**

In `lib/parser/invariants.ts`, replace the `versionFailed` block (`:108-118`) with:

```ts
  const validVersions = new Set(["v1", "v2", "v4"]);
  // A caught parser THROW (audit rec-6 / finding #17) is surfaced as a PARSE_THREW hardError by the
  // sync call-site guard. Route it to hard_fail exactly like MI-1, reusing the MI-1 failedCode so no
  // new §12.4 catalog code enters the routed/rendered path (invariant 5).
  const parserThrew = next.hardErrors.some((e) => e.code === "PARSE_THREW");
  const versionFailed =
    !validVersions.has(next.show.template_version) ||
    next.hardErrors.some((e) => e.code === "MI-1_VERSION_DETECTION_FAILED") ||
    parserThrew;

  if (versionFailed) {
    failedCodes.push("MI-1_VERSION_DETECTION_FAILED");
    messages.push(
      parserThrew
        ? "Parser error: the sheet could not be parsed (unexpected internal error)."
        : `Version detection failed: got '${next.show.template_version}', expected v1/v2/v4`,
    );
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/invariants/mi.test.ts -t "PARSE_THREW"`
Expected: PASS. Then run the whole file to confirm no regression: `pnpm vitest run tests/invariants/mi.test.ts` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/parser/invariants.ts tests/invariants/mi.test.ts
git commit --no-verify -m "feat(parser): route PARSE_THREW hardError to hard_fail under MI-1 code

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012YhyW9W8ovPvfvgeBvnQG8"
```

---

## Task 3: Sync — guard the call site + forensic log

**Files:**
- Modify: `lib/sync/runScheduledCronSync.ts` (parse call, `:2775`; `buildThrownParsedSheet` import — add to the existing `@/lib/parser` import at `:45`)
- Test: `tests/sync/parseSheetCallSiteGuard.test.ts` (create; model on `tests/sync/parse-error-last-good-producer.test.ts`)

**Interfaces:**
- Consumes: `buildThrownParsedSheet` (Task 1); `prepareProcessOneFile` / `processOneFile_unlocked` / `ProcessOneFileDeps` / `SyncPipelineTx` (exported from `@/lib/sync/runScheduledCronSync`); `log` + `setLogSink` + `resetLogSink` (`@/lib/log`); `LogRecord` type (`@/lib/log/types`).
- Produces: a guarded parse call — a throwing `deps.parseSheet` yields `prepared.kind === "ready"` with `prepared.parseResult.hardErrors` containing `{ code: "PARSE_THREW" }`, plus a best-effort `log.error({ source:"sync", code:"PARSE_SHEET_THREW", driveFileId, error })`. No exception propagates.

- [ ] **Step 1: Write the failing tests**

Create `tests/sync/parseSheetCallSiteGuard.test.ts`. (The `deps` / `fileMeta` shapes are copied from the working harness in `tests/sync/parse-error-last-good-producer.test.ts`; `enrichWithDrivePins` is injected as a passthrough so the synthesized thrown sheet reaches `prepared.parseResult` unchanged.)

```ts
import { afterEach, describe, expect, test, vi } from "vitest";

import type { DriveListedFile } from "@/lib/drive/list";
import type { ParseResult } from "@/lib/parser/types";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import { setLogSink, resetLogSink } from "@/lib/log";
import type { LogRecord } from "@/lib/log/types";
import {
  prepareProcessOneFile,
  processOneFile_unlocked,
  type ProcessOneFileDeps,
  type SyncPipelineTx,
} from "@/lib/sync/runScheduledCronSync";

function fileMeta(id: string): DriveListedFile {
  return {
    driveFileId: id,
    name: `${id} Sheet`,
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-05-08T12:00:00.000Z",
    parents: ["folder-1"],
    headRevisionId: "head-1",
  };
}

// Passthrough enrich: forward whatever ParsedSheet the (guarded) parse produced, unchanged.
const passthroughEnrich = vi.fn(async (parsed: unknown) => parsed as ParseResult);

function baseDeps(overrides: Partial<ProcessOneFileDeps> = {}): ProcessOneFileDeps {
  return {
    perFileProcessor: vi.fn(async () => ({ outcome: "proceed" as const, mode: "cron" as const })),
    captureBinding: vi.fn(async () => ({
      bindingToken: "binding-1",
      modifiedTime: "2026-05-08T12:00:00.000Z",
    })),
    fetchMarkdownAtRevision: vi.fn(async () => "# something the parser will choke on"),
    enrichWithDrivePins: passthroughEnrich,
    ...overrides,
  } as unknown as ProcessOneFileDeps;
}

afterEach(() => {
  resetLogSink();
  vi.clearAllMocks();
});

describe("parseSheet call-site guard (finding #17)", () => {
  test("a throwing parser does NOT crash prepare; synthesizes a PARSE_THREW sheet", async () => {
    // Without the guard this call throws and aborts the file's processing (the finding-#17 bug).
    const deps = baseDeps({
      parseSheet: vi.fn(() => {
        throw new Error("Cannot read properties of undefined (reading 'x')");
      }),
    });
    const prepared = await prepareProcessOneFile(
      "drive-file-1",
      "cron",
      fileMeta("drive-file-1"),
      deps,
      async () => null,
    );
    expect(prepared.kind).toBe("ready");
    if (prepared.kind === "ready") {
      expect(prepared.parseResult.hardErrors).toContainEqual(
        expect.objectContaining({ code: "PARSE_THREW" }),
      );
    }
  });

  test("emits a forensic PARSE_SHEET_THREW log with source and driveFileId", async () => {
    const records: LogRecord[] = [];
    setLogSink((record) => {
      records.push(record);
    });
    const deps = baseDeps({
      parseSheet: vi.fn(() => {
        throw new Error("boom");
      }),
    });
    await prepareProcessOneFile("drive-file-9", "cron", fileMeta("drive-file-9"), deps, async () => null);
    const rec = records.find((r) => r.code === "PARSE_SHEET_THREW");
    expect(rec, "a PARSE_SHEET_THREW record must be emitted").toBeDefined();
    expect(rec!.level).toBe("error");
    expect(rec!.source).toBe("sync");
    // driveFileId is the reserved correlation field (LogRecord.driveFileId), not free context.
    expect(rec!.driveFileId).toBe("drive-file-9");
  });

  test("a throwing/rejecting log sink does not break the guard", async () => {
    setLogSink(() => {
      throw new Error("sink is down");
    });
    const deps = baseDeps({
      parseSheet: vi.fn(() => {
        throw new Error("boom");
      }),
    });
    // parsed is synthesized BEFORE the log call and the log rejection is swallowed, so prepare
    // still reaches ready with the PARSE_THREW sheet.
    const prepared = await prepareProcessOneFile(
      "drive-file-2",
      "cron",
      fileMeta("drive-file-2"),
      deps,
      async () => null,
    );
    expect(prepared.kind).toBe("ready");
    if (prepared.kind === "ready") {
      expect(prepared.parseResult.hardErrors).toContainEqual(
        expect.objectContaining({ code: "PARSE_THREW" }),
      );
    }
  });

  test("a pathological throw value (throwing toString) does not break the guard", async () => {
    const hostile = {
      toString() {
        throw new Error("cannot stringify me");
      },
    };
    const deps = baseDeps({
      parseSheet: vi.fn(() => {
        throw hostile; // String(error) would throw; message-extraction try/catch must absorb it
      }),
    });
    const prepared = await prepareProcessOneFile(
      "drive-file-3",
      "cron",
      fileMeta("drive-file-3"),
      deps,
      async () => null,
    );
    expect(prepared.kind).toBe("ready");
    if (prepared.kind === "ready") {
      expect(prepared.parseResult.hardErrors).toContainEqual(
        expect.objectContaining({ code: "PARSE_THREW" }),
      );
    }
  });

  test("existing-show throw path reaches PARSE_ERROR_LAST_GOOD (wiring survives the throw)", async () => {
    // Wiring proof: a throw → PARSE_THREW-bearing prepared → hard_fail branch → alert. The REAL
    // PARSE_THREW→hard_fail decision is proven independently in tests/invariants/mi.test.ts; here
    // runPhase1 is stubbed to the hard_fail it would return, isolating the throw→alert wiring.
    const upsertAdminAlert = vi.fn(async () => "alert-1");
    const priorParseResult = {
      show: { title: "FXAV Spring Tour" },
      warnings: [],
    } as unknown as ParseResult;
    const tx = {
      async queryOne<T>(sql: string) {
        if (sql.includes("from public.shows where drive_file_id")) return { archived: false } as T;
        return { held: true } as T;
      },
      readShowForPhase1: vi.fn(async () => ({
        showId: "show-1",
        driveFileId: "drive-file-1",
        lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
        lastSyncStatus: "ok",
        lastSyncError: null,
        priorParseResult,
        priorParseWarningsRaw: null,
      })),
      upsertAdminAlert,
    } as unknown as LockedShowTx<SyncPipelineTx>;
    const deps = baseDeps({
      parseSheet: vi.fn(() => {
        throw new Error("boom");
      }),
      runPhase1: vi.fn(async () => ({
        outcome: "hard_fail" as const,
        code: "MI-1_VERSION_DETECTION_FAILED",
        failedCodes: ["MI-1_VERSION_DETECTION_FAILED"],
        message: "Parser error",
        showId: "show-1",
      })),
    });
    const file = fileMeta("drive-file-1");
    const prepared = await prepareProcessOneFile("drive-file-1", "cron", file, deps, async () => null);
    expect(prepared.kind).toBe("ready");
    if (prepared.kind === "ready") {
      expect(prepared.parseResult.hardErrors).toContainEqual(
        expect.objectContaining({ code: "PARSE_THREW" }),
      );
    }
    const result = await processOneFile_unlocked(tx, "drive-file-1", "cron", file, deps, prepared);
    expect(result).toMatchObject({ outcome: "hard_fail" });
    expect(upsertAdminAlert).toHaveBeenCalledWith({
      showId: "show-1",
      code: "PARSE_ERROR_LAST_GOOD",
      context: { drive_file_id: "drive-file-1", sheet_name: "FXAV Spring Tour" },
    });
  });

  test("first-seen throw path → hard_fail writes pending_ingestions, no shows row (REAL runPhase1)", async () => {
    // Full first-seen e2e (spec §4.2): throwing parser → guard synthesizes PARSE_THREW → REAL
    // runPhase1 (deps.runPhase1 omitted) → runInvariants(null, ...) hard_fails on PARSE_THREW →
    // no existing shows row → upsertLivePendingIngestion. Proves the guard, PARSE_THREW routing,
    // pending-ingestion write, and null showId together — non-tautological (real runPhase1).
    const upsertLivePendingIngestion = vi.fn(async () => "pending-1");
    const updateShowParseError = vi.fn(async () => "show-x"); // must NOT be called (no shows row)
    const tx = {
      async queryOne<T>(sql: string) {
        if (sql.includes("from public.shows where drive_file_id")) return { archived: false } as T;
        return { held: true } as T;
      },
      readShowForPhase1: vi.fn(async () => null), // first-seen: no existing show
      upsertLivePendingIngestion,
      updateShowParseError,
    } as unknown as LockedShowTx<SyncPipelineTx>;
    const deps = baseDeps({
      parseSheet: vi.fn(() => {
        throw new Error("boom");
      }),
      // deps.runPhase1 intentionally omitted → runPhase1_unlocked uses the REAL runPhase1.
    });
    const file = fileMeta("drive-file-new");
    const prepared = await prepareProcessOneFile("drive-file-new", "cron", file, deps, async () => null);
    expect(prepared.kind).toBe("ready");
    const result = await processOneFile_unlocked(tx, "drive-file-new", "cron", file, deps, prepared);
    expect(result).toMatchObject({ outcome: "hard_fail", showId: null });
    expect(updateShowParseError).not.toHaveBeenCalled();
    expect(upsertLivePendingIngestion).toHaveBeenCalledTimes(1);
    expect(upsertLivePendingIngestion).toHaveBeenCalledWith(
      expect.objectContaining({
        driveFileId: "drive-file-new",
        lastErrorCode: "MI-1_VERSION_DETECTION_FAILED",
      }),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/sync/parseSheetCallSiteGuard.test.ts`
Expected: FAIL — the first test rejects/throws (unguarded call site propagates the injected throw); `PARSE_SHEET_THREW` record absent.

> Harness note: the fake-tx surface (`queryOne`, `readShowForPhase1`, `upsertAdminAlert`, `upsertLivePendingIngestion`) mirrors the working harness in `tests/sync/parse-error-last-good-producer.test.ts` (which drives the same `processOneFile_unlocked` wrapper — `assertShowLockHeld` / `readShowArchived_unlocked` / `recheckLiveDeferralAfterLock` are satisfied by `queryOne`). If the REAL `runPhase1` touches an additional `tx` method on the first-seen hard_fail path during red-run, add it to the fake `tx` as a `vi.fn` returning the minimal shape the call needs — do not stub `runPhase1` itself (that would defeat the point of this test).

- [ ] **Step 3: Write the implementation**

3a. Add `buildThrownParsedSheet` to the existing parser import in `lib/sync/runScheduledCronSync.ts:45`. It currently reads:

```ts
import { parseSheet as parseMarkdownSheet } from "@/lib/parser";
```

Change to:

```ts
import { parseSheet as parseMarkdownSheet, buildThrownParsedSheet } from "@/lib/parser";
```

3b. Replace the bare call at `:2775`:

```ts
const parsed = (deps.parseSheet ?? parseMarkdownSheet)(markdown, fileMeta.name);
```

with the guarded form:

```ts
let parsed: ParsedSheet;
try {
  parsed = (deps.parseSheet ?? parseMarkdownSheet)(markdown, fileMeta.name);
} catch (error) {
  // The parser is contractually non-throwing (it degrades to hardErrors). A throw here means a
  // novel structure hit an unanticipated path. Route it to the SAME fail-closed handling as a
  // parse hardError (retain last-good + PARSE_ERROR_LAST_GOOD for existing; pending_ingestions for
  // first-seen) instead of aborting the sync. Audit rec-6 / finding #17.
  let message: string;
  try {
    message = error instanceof Error ? error.message : String(error);
  } catch {
    // Pathological throw value (throwing toString/valueOf, or Error with a throwing message getter).
    message = "unknown parser error (unstringifiable throw value)";
  }
  // Synthesize the fail-closed sheet FIRST — the guard must not depend on logging succeeding.
  parsed = buildThrownParsedSheet(message);
  // Forensic, best-effort: never let a logging fault break the guard or leak an unhandled rejection.
  void log
    .error("Parser threw on sheet parse; routing to hard_fail", {
      source: "sync",
      code: "PARSE_SHEET_THREW",
      driveFileId,
      error,
    })
    .catch(() => {});
}
```

> `ParsedSheet` is already imported in this file (it appears in the `deps.parseSheet` signature at `:474`). If the type is not in scope, add it to the existing `@/lib/parser/types` import. `log` is imported at `:17`. `driveFileId` is the function parameter in scope at this point.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/sync/parseSheetCallSiteGuard.test.ts`
Expected: PASS (all 6).

- [ ] **Step 5: Commit**

```bash
git add lib/sync/runScheduledCronSync.ts tests/sync/parseSheetCallSiteGuard.test.ts
git commit --no-verify -m "feat(sync): guard parseSheet call site, route throw to fail-closed hard_fail

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012YhyW9W8ovPvfvgeBvnQG8"
```

---

## Task 4: Full verification + regression sweep

**Files:** none (verification only).

- [ ] **Step 1: Regression — Supabase call-boundary meta-test unaffected**

Run: `pnpm vitest run tests/sync/_metaInfraContract.test.ts`
Expected: PASS (the change adds no new Supabase call; this confirms the boundary scan and any comment-fragile anchors are intact — memory: structural meta-tests are comment/format-fragile).

- [ ] **Step 2: Full test suite** (shared chokepoint `runInvariants` was edited)

Run: `pnpm test`
Expected: PASS. If any parser/sync/invariants test regresses, fix before proceeding (do not `--no-verify` past a red suite).

- [ ] **Step 3: Typecheck / lint / format** (vitest strips types; `--no-verify` bypassed prettier)

Run: `pnpm typecheck && pnpm lint && pnpm format:check`
Expected: all PASS.

- [ ] **Step 4: No commit** — this task produces no code; it gates the close-out.

---

## Self-Review (completed during authoring)

**Spec coverage:**
- §2.1 `PARSE_THREW` non-catalog code → Task 1 (builder) + Task 2 (routing). ✓
- §2.2 exported minimal-sheet builder → Task 1. ✓
- §2.3 `runInvariants` routes `PARSE_THREW` → `hard_fail` → Task 2. ✓
- §2.4 guarded call site + forensic log (synth-first, `.catch`, `source`/`driveFileId`, message-extraction guard) → Task 3 impl. ✓
- §2.5 advisory lock unchanged → Global Constraints + verified pre-lock. ✓
- §3 guard conditions (Error / non-Error / unstringifiable / existing / first-seen / log-fault) → Task 3 tests + Task 2 first-seen. ✓
- §4.1 parser unit (builder shape; `PARSE_THREW`→`hard_fail`) → Tasks 1, 2. ✓
- §4.2 sync e2e (survives throw; existing→alert; first-seen→pending with null showId via REAL runPhase1; forensic log; log-fault; pathological) → Task 3 tests (6 tests). ✓
- §4.3 no new meta-test; Supabase boundary regression; full suite → Task 4. ✓

**Placeholder scan:** every code step contains complete code; the only conditional note is the `synthParseResult()` helper-name fallback in Task 2 (the file's real helper is used if the name differs) — this is a naming safeguard, not a placeholder.

**Type consistency:** `buildThrownParsedSheet(message: string): ParsedSheet` is named identically in Tasks 1 and 3; `PARSE_THREW` (hardError code) and `PARSE_SHEET_THREW` (log code) are used consistently and never conflated; `MI-1_VERSION_DETECTION_FAILED` is the routed failedCode throughout.
