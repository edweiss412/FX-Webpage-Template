# Step 3 Publish/Finish-Setup Streaming Progress — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the wizard Step 3 "Publish N shows & finish setup" action live per-sheet streaming progress (determinate bar + `X of Y` count + current sheet name) followed by a distinct "Finishing setup…" step, mirroring the Step 2 scan streaming.

**Architecture:** Response-encoding + UI change only. A new shared NDJSON wire-contract module (`lib/onboarding/finalizeProgress.ts`) is imported by both finalize routes (producers) and `FinalizeButton` (consumer). Each finalize route gains a streaming sibling handler chosen by `POST` via `Accept: application/x-ndjson`; the existing non-streaming functions are refactored to share a core but keep byte-identical behavior (proven by the unchanged endpoint tests). `FinalizeButton` reads the streams and morphs its button region into an inline progress panel. NO DB logic, RPC, advisory-lock, or checkpoint change.

**Tech Stack:** Next.js 16 (route handlers, `ReadableStream`, `NextResponse`), React 19 client component, Vitest + Testing Library (jsdom), postgres.js (untouched), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-30-step3-publish-streaming-progress.md` (Codex-APPROVED). Read it — this plan implements it and does not restate every rationale.

## Global Constraints (verbatim from spec / AGENTS.md)

- **DB logic byte-for-byte identical.** Only response writing is added. The non-streaming `handleOnboardingFinalize` / `handleOnboardingFinalizeCas` keep their exact signatures, HTTP statuses, and JSON bodies; the existing `tests/onboarding/finalize*.test.ts` prove this by passing UNCHANGED.
- **Advisory-lock single-holder (invariant #2) unchanged.** `tryFinalizeLock` (`pg_try_advisory_xact_lock('finalize:<session>')`) stays the sole holder inside the same `withTx` it has today. Streaming wrappers wrap that SAME transaction — no new/nested holder. (Topology declared below.)
- **No raw error codes in UI (invariant #5).** All copy routes through `lib/messages/lookup.ts` `messageFor(code).dougFacing`; `GENERIC_ERROR` is the code-less fallback. Race-row links render verbatim from the server's `re_apply_url`.
- **Supabase call-boundary discipline (invariant #9).** No new DB call sites. The one additive read reuses the existing `countRemainingCleanRows` helper and fires only under a streaming callback.
- **UI quality gate (invariant #8).** `FinalizeButton.tsx` is a UI surface ⇒ `/impeccable critique` AND `/impeccable audit` on the diff; HIGH/CRITICAL fixed or `DEFERRED.md`.
- **Commit per task (invariant #6).** Conventional commits, `--no-verify` (worktree shares the global lint-staged hook).
- **Content type:** `application/x-ndjson` (constant `FINALIZE_STREAM_CONTENT_TYPE`). **`maxDuration = 300`** on both finalize routes.

## Meta-test inventory (mandatory declaration)

**None created or extended.** No new RPC-gated table (no PostgREST DML lockdown), no new auth/Supabase helper (no `tests/auth/_metaInfraContract.test.ts` row), no new `admin_alerts.upsert` catalog row, no new advisory-lock surface (no `tests/auth/advisoryLockRpcDeadlock.test.ts` change), no sentinel-in-optional-text tile. The change is response-encoding + UI only.

## Advisory-lock holder topology (mandatory — plan is adjacent to `pg_advisory*`)

The plan edits code paths that CALL `tryFinalizeLock` but does not change lock acquisition. Holders for hashkey `finalize:<wizardSessionId>`:

- `/finalize`: `tryFinalizeLock(tx, wizardSessionId)` at `app/api/admin/onboarding/finalize/route.ts:1063`, inside `runtime.withTx` (single JS-side transaction; `pg_try_advisory_xact_lock`). **Sole holder.**
- `/finalize-cas`: `tryFinalizeLock(tx, wizardSessionId)` at `app/api/admin/onboarding/finalize-cas/route.ts:670`, inside `deps.withTx`. **Sole holder.**
- Per-show locks: `withRowTx(driveFileId, …)` / `adoptShowLockHeld` inside the finalize transaction — unchanged; the streaming wrappers do not touch `withRowTx`.

**New code's holder layer:** NONE. `handleOnboardingFinalizeStream` / `handleOnboardingFinalizeCasStream` run the EXACT SAME `withTx` closure (moved inside a `ReadableStream.start()`), so the lock is still acquired at exactly one layer with no nesting. No `advisoryLockRpcDeadlock.test.ts` extension needed.

---

## File Structure

- **Create** `lib/onboarding/finalizeProgress.ts` — NDJSON event unions, result-body types (moved from `FinalizeButton.tsx`), `FINALIZE_STREAM_CONTENT_TYPE`. One responsibility: the shared server↔client wire contract.
- **Modify** `app/api/admin/onboarding/finalize/route.ts` — extract `resolveFinalizer` + `executeFinalizeBatch(runtime, email, callbacks?)`; add `handleOnboardingFinalizeStream`, `POST` negotiation, `maxDuration`.
- **Modify** `app/api/admin/onboarding/finalize-cas/route.ts` — add optional `onPhase` to `runFinalizeCas`; add `handleOnboardingFinalizeCasStream`, `POST` negotiation, `maxDuration`.
- **Modify** `components/admin/FinalizeButton.tsx` — import shared types; NDJSON streaming reader; inline progress panel; state machine + refs; guards.
- **Create** `tests/onboarding/finalizeStream.test.ts` — streaming `/finalize` handler.
- **Create** `tests/onboarding/finalizeCasStream.test.ts` — streaming `/finalize-cas` handler.
- **Modify** `tests/components/admin/FinalizeButton.test.tsx` — NDJSON mocks; progress, multi-batch, safety-net, race, interruption, transition, layout-structure assertions.

---

## Task 1: Shared wire-contract module

**Files:**
- Create: `lib/onboarding/finalizeProgress.ts`
- Modify: `components/admin/FinalizeButton.tsx:46-86` (move the body types out; re-import them)
- Test: `tests/onboarding/finalizeProgress.test.ts`

**Interfaces:**
- Produces: `FINALIZE_STREAM_CONTENT_TYPE: "application/x-ndjson"`; types `FinalizeProgressEvent`, `FinalizeStreamMessage`, `FinalizeResultBody`, `FinalizeCasPhase`, `FinalizeCasProgressEvent`, `FinalizeCasStreamMessage`, `FinalizeCasResultBody`, and the moved body types `PerRowFailure`, `PerRowOk`, `PerRowEntry`, `FinalizeBatchResponse`, `CasPerRowEntry`, `FinalizeErrorResponse`, `FinalizeResponse`, `FinalizeCasResponse`.

- [ ] **Step 1: Write the failing test** — `tests/onboarding/finalizeProgress.test.ts`

```ts
import { describe, expect, test } from "vitest";
import {
  FINALIZE_STREAM_CONTENT_TYPE,
  type FinalizeStreamMessage,
  type FinalizeCasStreamMessage,
} from "@/lib/onboarding/finalizeProgress";

describe("finalizeProgress wire contract", () => {
  test("content-type constant matches the scan stream convention", () => {
    expect(FINALIZE_STREAM_CONTENT_TYPE).toBe("application/x-ndjson");
  });

  test("finalize stream union accepts listed, row, and terminal result", () => {
    // Compile-time coverage: if a variant's shape drifts, this file fails to typecheck.
    const msgs: FinalizeStreamMessage[] = [
      { type: "listed", total: 3 },
      { type: "row", done: 1, total: 3, name: "East Coast", driveFileId: "f1" },
      { type: "row", done: 2, total: 3, name: null, driveFileId: "f2" },
      {
        type: "result",
        body: {
          status: "all_batches_complete",
          wizard_session_id: "s",
          remaining_count: 0,
          unresolved_manifest_count: 0,
          per_row: [],
        },
      },
      { type: "result", body: { ok: false, code: "CONCURRENT_FINALIZE_IN_FLIGHT" } },
    ];
    expect(msgs).toHaveLength(5);
  });

  test("cas stream union accepts phase events and terminal result", () => {
    const msgs: FinalizeCasStreamMessage[] = [
      { type: "phase", phase: "applying" },
      { type: "phase", phase: "publishing" },
      { type: "phase", phase: "subscribing" },
      {
        type: "result",
        body: { status: "finalize_complete", wizard_session_id: "s", watched_folder_id: "wf" },
      },
      { type: "result", body: { ok: false, code: "STAGED_PARSE_OUTDATED_AT_PHASE_D", per_row: [] } },
    ];
    expect(msgs).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/ericweiss/fxav-step3-publish-progress && pnpm vitest run tests/onboarding/finalizeProgress.test.ts`
Expected: FAIL — `Cannot find module '@/lib/onboarding/finalizeProgress'`.

- [ ] **Step 3: Create the module** — `lib/onboarding/finalizeProgress.ts`

```ts
/**
 * lib/onboarding/finalizeProgress.ts
 *
 * Shared wire contract for the streamed Step-3 publish/finish-setup progress,
 * imported by BOTH routes (producers: finalize + finalize-cas) and <FinalizeButton>
 * (consumer). Defining it once turns any server/client drift into a compile error —
 * the same discipline as lib/onboarding/scanProgress.ts.
 *
 * Each route emits one JSON object per line (NDJSON): zero or more progress events,
 * then exactly one terminal `result`. Progress events are OPTIMISTIC; the terminal
 * `result.body` is authoritative and equals the non-streaming JSON body.
 */

export const FINALIZE_STREAM_CONTENT_TYPE = "application/x-ndjson";

// ---- response body types (moved verbatim from FinalizeButton.tsx) ----
export type PerRowFailure = {
  drive_file_id: string;
  wizard_session_id: string;
  code: string;
  re_apply_url: string;
  display_name?: string;
};
export type PerRowOk = {
  drive_file_id: string;
  wizard_session_id: string;
  code: "OK";
};
export type PerRowEntry = PerRowFailure | PerRowOk;

export type FinalizeBatchResponse = {
  status: "batch_complete" | "all_batches_complete";
  wizard_session_id: string;
  remaining_count: number;
  unresolved_manifest_count: number;
  per_row: PerRowEntry[];
};

export type CasPerRowEntry = { drive_file_id: string; code: string; display_name?: string };
export type FinalizeErrorResponse = { ok: false; code: string; per_row?: CasPerRowEntry[] };
export type FinalizeResponse = FinalizeBatchResponse | FinalizeErrorResponse;

export type FinalizeCasResponse =
  | { status: "finalize_complete"; wizard_session_id: string; watched_folder_id: string }
  | FinalizeErrorResponse;

// ---- /finalize batch stream ----
export type FinalizeProgressEvent =
  | { type: "listed"; total: number }
  | { type: "row"; done: number; total: number; name: string | null; driveFileId: string };
export type FinalizeResultBody = FinalizeBatchResponse | FinalizeErrorResponse;
export type FinalizeStreamMessage =
  | FinalizeProgressEvent
  | { type: "result"; body: FinalizeResultBody };

// ---- /finalize-cas stream ----
export type FinalizeCasPhase = "applying" | "publishing" | "subscribing";
export type FinalizeCasProgressEvent = { type: "phase"; phase: FinalizeCasPhase };
export type FinalizeCasResultBody = FinalizeCasResponse;
export type FinalizeCasStreamMessage =
  | FinalizeCasProgressEvent
  | { type: "result"; body: FinalizeCasResultBody };
```

- [ ] **Step 4: Re-point `FinalizeButton.tsx` at the shared types.** Remove the local `type PerRowFailure … FinalizeCasResponse` block (`FinalizeButton.tsx:46-86`) and import them instead. Add near the other imports:

```ts
import {
  FINALIZE_STREAM_CONTENT_TYPE,
  type PerRowFailure,
  type CasPerRowEntry,
  type FinalizeBatchResponse,
  type FinalizeResponse,
  type FinalizeCasResponse,
  type FinalizeStreamMessage,
  type FinalizeCasStreamMessage,
} from "@/lib/onboarding/finalizeProgress";
```

(Leave the rest of `FinalizeButton.tsx` unchanged in this task — the streaming reader lands in Task 4. This step only relocates the types so the module has a real consumer and `tsc` proves parity.)

- [ ] **Step 5: Run the test + typecheck**

Run: `cd /Users/ericweiss/fxav-step3-publish-progress && pnpm vitest run tests/onboarding/finalizeProgress.test.ts && pnpm exec tsc --noEmit`
Expected: test PASS; `tsc` clean (proves `FinalizeButton.tsx` still compiles against the moved types).

- [ ] **Step 6: Commit**

```bash
git add lib/onboarding/finalizeProgress.ts components/admin/FinalizeButton.tsx tests/onboarding/finalizeProgress.test.ts
git commit --no-verify -m "feat(onboarding): shared finalize NDJSON wire contract"
```

---

## Task 2: `/finalize` streaming producer (dual-mode)

**Files:**
- Modify: `app/api/admin/onboarding/finalize/route.ts` (refactor `handleOnboardingFinalize` `:1029-1213`; add stream sibling + POST)
- Test: `tests/onboarding/finalizeStream.test.ts` (new); regression `tests/onboarding/finalize.test.ts` + `tests/onboarding/finalizeRevalidate.test.ts`

**Interfaces:**
- Consumes: `FINALIZE_STREAM_CONTENT_TYPE`, `FinalizeStreamMessage`, `FinalizeResultBody` (Task 1); existing `depsWithDefaults`, `countRemainingCleanRows`, `parsedShowTitle`, `errorResponse`, `ONBOARDING_FINALIZE_INTERNAL_ERROR`.
- Produces: `handleOnboardingFinalizeStream(request, deps?)`; unchanged `handleOnboardingFinalize`. Progress-callback type:
```ts
type FinalizeProgressCallbacks = {
  onListed?: (total: number) => void;
  onRow?: (e: { done: number; total: number; name: string | null; driveFileId: string }) => void;
};
```

- [ ] **Step 1: Write the failing test** — `tests/onboarding/finalizeStream.test.ts`

Reuse the `FakeFinalizeDb` / deps-injection shape from `tests/onboarding/finalize.test.ts` (import its helpers or copy the minimal fake). The test drives `handleOnboardingFinalizeStream(request, deps)`, reads the NDJSON body, and asserts the event sequence. Include a shared NDJSON reader:

```ts
async function readNdjson(res: Response): Promise<Array<Record<string, unknown>>> {
  expect(res.headers.get("content-type")).toBe("application/x-ndjson");
  const text = await res.text();
  return text
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l));
}
```

Assertions (derive expected counts from the fixture, never hardcode):
1. **Happy path, single batch of N rows** (seed the fake with N clean `'staged'`/`'applied'` rows): the stream emits exactly one `listed` with `total === N`, then N `row` events with `done` running `1..N` and `total === N` and a `name`/`driveFileId` per row, then exactly one terminal `{type:"result", body}` whose `body` DEEP-EQUALS the object returned by the non-streaming `handleOnboardingFinalize(request(), deps)` for an identically-seeded fake (anti-tautology: assert against the non-streaming body, not a re-derived literal).
2. **Zero-row finish** (seed `checkpoint.status="all_batches_complete"`, no approved rows): emits one `listed` (`total === 0`), NO `row` events, then terminal `{type:"result", body:{status:"all_batches_complete", …}}`.
3. **Precondition error** (`finalizeLocked=false` → lock contention): emits NO `listed`, NO `row`, exactly one terminal `{type:"result", body:{ok:false, code:"CONCURRENT_FINALIZE_IN_FLIGHT"}}` on an HTTP 200 stream; and the non-streaming `handleOnboardingFinalize` for the same fake returns HTTP `409` with the same body (proves the status divergence is intentional and confined to streaming).
4. **Auth failure is PRE-STREAM** (deps.requireAdminIdentity throws `ADMIN_FORBIDDEN`): `handleOnboardingFinalizeStream` returns a NON-stream `403` JSON `{ok:false, code:"ADMIN_FORBIDDEN"}` (content-type NOT ndjson) — mirrors scan auth.
5. **`onListed`/`onRow` NOT invoked on the non-streaming path:** seed a fake that counts how many times `countRemainingCleanRows`'s SQL is executed; call `handleOnboardingFinalize` (non-streaming) → the count is exactly 1 (the existing end-of-loop remaining count). Call `handleOnboardingFinalizeStream` → the count is exactly 2 (start `listed` + end). **Catches:** the extra query leaking into the non-streaming path.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/onboarding/finalizeStream.test.ts`
Expected: FAIL — `handleOnboardingFinalizeStream` is not exported.

- [ ] **Step 3: Refactor + implement.** In `app/api/admin/onboarding/finalize/route.ts`:

(a) Extract auth into `resolveFinalizer` (verbatim body from `:1034-1047`):

```ts
async function resolveFinalizer(
  runtime: ReturnType<typeof depsWithDefaults>,
): Promise<{ email: string } | { error: Response }> {
  try {
    const admin = await runtime.requireAdminIdentity();
    return { email: admin.email };
  } catch (error) {
    const code =
      typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
    if (code === "ADMIN_SESSION_LOOKUP_FAILED") {
      return { error: errorResponse(500, "ADMIN_SESSION_LOOKUP_FAILED") };
    }
    return { error: errorResponse(403, "ADMIN_FORBIDDEN") };
  }
}
```

(b) Extract the transaction body + post-commit revalidate + catch into `executeFinalizeBatch`, taking the resolved `finalizerEmail` and optional callbacks. This is the EXACT current `try { const response = await runtime.withTx(async (tx) => { … }); for (…) revalidateShow; return response; } catch { return errorResponse(500, …); }` block (`:1052-1208`), with TWO additive hooks:

```ts
async function executeFinalizeBatch(
  runtime: ReturnType<typeof depsWithDefaults>,
  finalizerEmail: string,
  callbacks?: FinalizeProgressCallbacks,
): Promise<Response> {
  const appliedShowIds = new Set<string>();
  try {
    const response = await runtime.withTx(async (tx) => {
      const wizardSessionId = await readCandidateSessionId(tx);
      if (!wizardSessionId) return errorResponse(409, "WIZARD_FINALIZE_CHECKPOINT_MISSING");
      const locked = await tryFinalizeLock(tx, wizardSessionId);
      if (!locked) return errorResponse(409, "CONCURRENT_FINALIZE_IN_FLIGHT");
      const activeSessionId = await readActiveSessionForUpdate(tx);
      if (activeSessionId !== wizardSessionId) return errorResponse(409, WIZARD_SESSION_SUPERSEDED);
      const checkpoint = await ensureCheckpoint(tx, wizardSessionId);
      if (!checkpoint) return errorResponse(409, "WIZARD_FINALIZE_CHECKPOINT_MISSING");

      // §4.2 D5: single early `listed` — AFTER the precondition gate, BEFORE every zero-row
      // branch and the loop, so every non-error stream emits exactly one listed. Only under a
      // callback → the non-streaming path runs no extra query (byte-identical).
      if (callbacks?.onListed) {
        callbacks.onListed(await countRemainingCleanRows(tx, wizardSessionId));
      }

      if (checkpoint.status === "final_cas_done") {
        return NextResponse.json({ status: "all_batches_complete", wizard_session_id: wizardSessionId, remaining_count: 0, unresolved_manifest_count: 0, per_row: [] });
      }
      const approvedRows = await selectFinishableCleanRows(tx, wizardSessionId, runtime.batchCap);
      const unresolved = await unresolvedManifestCount(tx, wizardSessionId);
      if (checkpoint.status === "all_batches_complete" && approvedRows.length === 0 && unresolved === 0) {
        return NextResponse.json({ status: "all_batches_complete", wizard_session_id: wizardSessionId, remaining_count: 0, unresolved_manifest_count: 0, per_row: [] });
      }
      if (approvedRows.length === 0 && unresolved > 0) {
        return errorResponse(409, "ONBOARDING_NOT_RESOLVED", { unresolved_manifest_count: unresolved });
      }
      if (approvedRows.length === 0) {
        return await finalizeBatchTailResponse({ tx, wizardSessionId, remainingCount: 0, unresolvedManifestCount: 0, perRow: [] });
      }
      const perRow: PerRowResult[] = [];
      for (const row of approvedRows) {
        // … UNCHANGED per-row body (anchors + withRowTx(processApprovedRow) + FirstSeenProvenanceRaceError demote) …
        // after the existing perRow.push(...) branch:
        callbacks?.onRow?.({
          done: perRow.length,
          total: approvedRows.length,
          name: parsedShowTitle(row.parse_result) ?? null,
          driveFileId: row.drive_file_id,
        });
      }
      const remainingCount = await countRemainingCleanRows(tx, wizardSessionId);
      const unresolvedAfterBatch = await unresolvedManifestCount(tx, wizardSessionId);
      return await finalizeBatchTailResponse({ tx, wizardSessionId, remainingCount, unresolvedManifestCount: unresolvedAfterBatch, perRow });
    });
    for (const showId of appliedShowIds) revalidateShow(showId);
    return response;
  } catch (error) {
    console.error(`onboarding finalize: unexpected failure: ${error instanceof Error ? error.message : String(error)}`, error);
    return errorResponse(500, ONBOARDING_FINALIZE_INTERNAL_ERROR);
  }
}
```

> Preserve the per-row loop body EXACTLY as it is today (`:1116-1174`) — the `onRow` call is the only addition, placed AFTER the existing push. Do not reorder or alter anchors/`withRowTx`/`FirstSeenProvenanceRaceError` handling.

(c) Rewrite `handleOnboardingFinalize` to compose the extracts (behavior identical):

```ts
export async function handleOnboardingFinalize(
  _request: Request,
  deps: FinalizeRouteDeps = {},
): Promise<Response> {
  const runtime = depsWithDefaults(deps);
  const finalizer = await resolveFinalizer(runtime);
  if ("error" in finalizer) return finalizer.error;
  return executeFinalizeBatch(runtime, finalizer.email);
}
```

(d) Add the streaming sibling, `maxDuration`, and POST negotiation (spec §4.2 code):

```ts
export async function handleOnboardingFinalizeStream(
  _request: Request,
  deps: FinalizeRouteDeps = {},
): Promise<Response> {
  const runtime = depsWithDefaults(deps);
  const finalizer = await resolveFinalizer(runtime);
  if ("error" in finalizer) return finalizer.error; // pre-stream real non-200
  const encoder = new TextEncoder();
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (msg: FinalizeStreamMessage) => {
        if (canceled) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(msg) + "\n")); // jsonb-text-exempt: NDJSON wire encoding, not a postgres.js jsonb param
        } catch {
          canceled = true;
        }
      };
      try {
        const response = await executeFinalizeBatch(runtime, finalizer.email, {
          onListed: (total) => emit({ type: "listed", total }),
          onRow: (e) => emit({ type: "row", ...e }),
        });
        emit({ type: "result", body: (await response.json()) as FinalizeResultBody });
      } catch {
        emit({ type: "result", body: { ok: false, code: ONBOARDING_FINALIZE_INTERNAL_ERROR } });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      canceled = true;
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": FINALIZE_STREAM_CONTENT_TYPE,
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  if ((request.headers.get("accept") ?? "").includes(FINALIZE_STREAM_CONTENT_TYPE)) {
    return await handleOnboardingFinalizeStream(request);
  }
  return await handleOnboardingFinalize(request);
}
```

Add imports at the top of the route: `FINALIZE_STREAM_CONTENT_TYPE`, `type FinalizeStreamMessage`, `type FinalizeResultBody` from `@/lib/onboarding/finalizeProgress`.

- [ ] **Step 4: Run the new streaming test**

Run: `pnpm vitest run tests/onboarding/finalizeStream.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the regression suite (proves non-streaming byte-identity)**

Run: `pnpm vitest run tests/onboarding/finalize.test.ts tests/onboarding/finalizeRevalidate.test.ts tests/onboarding/finalizeApprovalRace.test.ts`
Expected: PASS, unchanged.

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/onboarding/finalize/route.ts tests/onboarding/finalizeStream.test.ts
git commit --no-verify -m "feat(onboarding): stream /finalize per-row progress as NDJSON"
```

---

## Task 3: `/finalize-cas` streaming producer (dual-mode)

**Files:**
- Modify: `app/api/admin/onboarding/finalize-cas/route.ts` (`runFinalizeCas` `:646`; `handleOnboardingFinalizeCas` `:751`; add stream sibling + POST)
- Test: `tests/onboarding/finalizeCasStream.test.ts` (new); regression `tests/onboarding/finalize-cas.test.ts`

**Interfaces:**
- Consumes: `FINALIZE_STREAM_CONTENT_TYPE`, `FinalizeCasStreamMessage`, `FinalizeCasResultBody` (Task 1); existing `runFinalizeCas`, `depsWithDefaults`, `revalidateShow`, `errorResponse`.
- Produces: `handleOnboardingFinalizeCasStream(request, routeDeps?)`; `runFinalizeCas` gains optional 4th param `onPhase?: (p: FinalizeCasPhase) => void`.

- [ ] **Step 1: Write the failing test** — `tests/onboarding/finalizeCasStream.test.ts`

Mirror `tests/onboarding/finalize-cas.test.ts`'s fake/deps. Assertions:
1. **Success path** (seed shadows + a publishable show): the stream emits `phase:"applying"`, then `phase:"publishing"`, then `phase:"subscribing"`, then terminal `{type:"result", body:{status:"finalize_complete", watched_folder_id, …}}` — IN THAT ORDER. `deps.subscribeToWatchedFolder` is called exactly once, and the `subscribing` phase is emitted BEFORE that call resolves (assert via ordering: push a marker into a shared array from a `subscribeToWatchedFolder` spy and from the emit sink; the `subscribing` event index precedes the subscribe-call marker).
2. **Blocked shadow** (seed a shadow whose apply returns non-OK): emits `phase:"applying"` then terminal `{type:"result", body:{ok:false, code:"STAGED_PARSE_OUTDATED_AT_PHASE_D", per_row:[…]}}`; NO `publishing`/`subscribing`; `subscribeToWatchedFolder` NOT called.
3. **Terminal body deep-equals** the non-streaming `handleOnboardingFinalizeCas` body for an identically-seeded fake (anti-tautology).
4. **Auth pre-stream:** requireAdminIdentity throws → non-stream `403` JSON.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/onboarding/finalizeCasStream.test.ts`
Expected: FAIL — `handleOnboardingFinalizeCasStream` not exported.

- [ ] **Step 3: Implement.** In `app/api/admin/onboarding/finalize-cas/route.ts`:

(a) Add the optional `onPhase` param to `runFinalizeCas` and two additive calls:

```ts
async function runFinalizeCas(
  tx: FinalizeCasRouteTx,
  deps: ReturnType<typeof depsWithDefaults>,
  affectedShowIds: Set<string>,
  onPhase?: (p: FinalizeCasPhase) => void,
): Promise<FinalizeCasResult> {
  // … UNCHANGED preconditions (session/lock/checkpoint/approvedCount/unresolved/legacyAmbiguous) …
  onPhase?.("applying");
  const shadowResults: ShadowApplyResult[] = [];
  for (const row of await readShadowRows(tx, wizardSessionId)) { /* … unchanged … */ }
  const blocked = shadowResults.filter((row) => row.code !== "OK");
  if (blocked.length > 0) return errorResponse(409, "STAGED_PARSE_OUTDATED_AT_PHASE_D", { per_row: shadowResults });
  await deleteShadowRows(tx, wizardSessionId);
  onPhase?.("publishing");
  for (const showId of await publishAppliedWizardShows(tx, wizardSessionId)) affectedShowIds.add(showId);
  // … unchanged deleteWizardDeferrals / promoteSettings / markFinalCasDone / return … (NO subscribe here)
}
```

(b) Keep `handleOnboardingFinalizeCas` (`:751`) unchanged (it passes no `onPhase`, so behavior is identical). Add the streaming sibling — reproduce its post-commit sequence (`:771-783`) around the phase/terminal emits, with `subscribing` emitted immediately before `subscribeToWatchedFolder`:

```ts
export async function handleOnboardingFinalizeCasStream(
  _request: Request,
  routeDeps: FinalizeCasRouteDeps = {},
): Promise<Response> {
  const deps = depsWithDefaults(routeDeps);
  try {
    await deps.requireAdminIdentity();
  } catch (error) {
    const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
    if (code === "ADMIN_SESSION_LOOKUP_FAILED") return errorResponse(500, "ADMIN_SESSION_LOOKUP_FAILED");
    return errorResponse(403, "ADMIN_FORBIDDEN");
  }
  const encoder = new TextEncoder();
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (msg: FinalizeCasStreamMessage) => {
        if (canceled) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(msg) + "\n")); // jsonb-text-exempt: NDJSON wire encoding
        } catch {
          canceled = true;
        }
      };
      const affectedShowIds = new Set<string>();
      try {
        const result = await deps.withTx((tx) =>
          runFinalizeCas(tx, deps, affectedShowIds, (p) => emit({ type: "phase", phase: p })),
        );
        for (const showId of affectedShowIds) revalidateShow(showId);
        if (result instanceof Response) {
          emit({ type: "result", body: (await result.json()) as FinalizeCasResultBody });
        } else {
          emit({ type: "phase", phase: "subscribing" });
          await deps.subscribeToWatchedFolder(result.watched_folder_id);
          emit({ type: "result", body: result });
        }
      } catch {
        emit({ type: "result", body: { ok: false, code: "ONBOARDING_FINALIZE_INTERNAL_ERROR" } });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      canceled = true;
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": FINALIZE_STREAM_CONTENT_TYPE,
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  if ((request.headers.get("accept") ?? "").includes(FINALIZE_STREAM_CONTENT_TYPE)) {
    return await handleOnboardingFinalizeCasStream(request);
  }
  return await handleOnboardingFinalizeCas(request);
}
```

> Note: `result` on the success branch is the plain `{ status:"finalize_complete", … , idempotent? }` object (not a Response) — the `idempotent` early-return path (`:660`) is also a plain object, so it flows through the `subscribing`+subscribe branch identically to today's non-streaming `handleOnboardingFinalizeCas`, which calls `subscribeToWatchedFolder(result.watched_folder_id)` for ANY non-Response result. Preserve that parity.

Add imports: `FINALIZE_STREAM_CONTENT_TYPE`, `type FinalizeCasPhase`, `type FinalizeCasStreamMessage`, `type FinalizeCasResultBody` from `@/lib/onboarding/finalizeProgress`.

- [ ] **Step 4: Run the new streaming test**

Run: `pnpm vitest run tests/onboarding/finalizeCasStream.test.ts`
Expected: PASS.

- [ ] **Step 5: Regression**

Run: `pnpm vitest run tests/onboarding/finalize-cas.test.ts`
Expected: PASS, unchanged.

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/onboarding/finalize-cas/route.ts tests/onboarding/finalizeCasStream.test.ts
git commit --no-verify -m "feat(onboarding): stream /finalize-cas phase progress as NDJSON"
```

---

## Task 4: `FinalizeButton` streaming consumer + inline progress panel

> **UI TASK — Opus only.** Ends with the impeccable dual-gate (Task 6).

**Files:**
- Modify: `components/admin/FinalizeButton.tsx`
- Test: `tests/components/admin/FinalizeButton.test.tsx`

**Interfaces:**
- Consumes: `FINALIZE_STREAM_CONTENT_TYPE`, stream/response types (Task 1); the two streaming routes (Tasks 2-3).
- Produces: unchanged public props (`wizardSessionId`, `disabled`, `publishCount`, `uncheckedCleanCount`). New testids: `wizard-finalize-progress`, `wizard-finalize-progressbar`, `wizard-finalize-count`, `wizard-finalize-current`, `wizard-finalize-cas-phase`.

- [ ] **Step 1: Write the failing tests** — migrate `tests/components/admin/FinalizeButton.test.tsx`. Add an NDJSON mock helper and cover:

```ts
function mockNdjsonResponse(lines: unknown[]): Response {
  const body = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
  return {
    ok: true,
    status: 200,
    headers: { get: (k: string) => (k.toLowerCase() === "content-type" ? "application/x-ndjson" : null) },
    body: new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(body));
        c.close();
      },
    }),
    json: async () => {
      throw new Error("stream response has no json()");
    },
  } as unknown as Response;
}
```

Test cases (derive `total` from the fixture line count, never hardcode a magic number):
1. **Single-batch happy path:** `fetch` → `mockNdjsonResponse([{type:"listed",total:2},{type:"row",done:1,total:2,name:"East Coast",driveFileId:"f1"},{type:"row",done:2,total:2,name:"RPAS",driveFileId:"f2"},{type:"result",body:{status:"all_batches_complete",wizard_session_id:W,remaining_count:0,unresolved_manifest_count:0,per_row:[]}}])`, then `/finalize-cas` → `mockNdjsonResponse([{type:"phase",phase:"applying"},{type:"phase",phase:"publishing"},{type:"phase",phase:"subscribing"},{type:"result",body:{status:"finalize_complete",wizard_session_id:W,watched_folder_id:"wf"}}])`. Assert: the `wizard-finalize-progress` panel renders; `wizard-finalize-progressbar` reaches `value === 2` and `max === 2`; `wizard-finalize-count` reads `2 of 2 shows`; `wizard-finalize-current` shows the last streamed name; then the panel shows "Finishing setup…" with `wizard-finalize-cas-phase`; then `wizard-finalize-publish-complete` + `refreshMock` called. Assert the idle `wizard-finalize-button` is NOT in the document while the panel is shown (the morph).
2. **Missing name fallback:** a `row` with `name:null` → `wizard-finalize-current` shows the `driveFileId`.
3. **Multi-batch accumulation:** batch 1 stream `[{listed,total:2 (=remaining incl. batch)},{row done1..2},{result batch_complete remaining_count:1}]` then batch 2 `[{listed,total:1},{row done1},{result all_batches_complete}]` then CAS. Assert the bar's final `value === 3` and `max === 3` (grandTotal reconciled across batches; NO reset between batches). **Catches:** per-batch denominator reset / drift.
4. **`!isStream` JSON safety net:** `fetch` → the legacy `mockJsonResponse({ok:false, code:"ONBOARDING_NOT_RESOLVED"})` (no `.body`, no ndjson header) → renders Doug-facing copy via `messageFor`. **Catches:** breaking the error/legacy path in the migration.
5. **Race-row under streaming:** batch stream terminal `{type:"result", body:{status:"batch_complete", per_row:[{drive_file_id:"f1", code:"STAGED_PARSE_REVISION_RACE_DURING_FINALIZE", re_apply_url:"/x", wizard_session_id:W}], …}}` → renders `wizard-finalize-race-row` + a `wizard-finalize-reapply-f1` link with `href="/x"`; does NOT call `/finalize-cas`.
6. **Stream interruption:** an ndjson body that ends after a `row` with NO terminal `result` → `wizard-finalize-error` with the generic copy, no raw code.
7. **Retry resets progress:** drive case 6 to error, then re-click and drive a fresh single-batch happy path → the bar starts from 0 and the count denominator is the NEW stream's total (not inflated). **Catches:** stale `completedRef`/`grandTotalRef`.
8. **Layout structure (jsdom, spec §7):** while running, `wizard-finalize-progressbar` has the `w-full` class; `wizard-finalize-progress` is present and is a block `flex flex-col`; the idle button is absent.
9. **Preserved:** existing "renders enabled by default", "respects disabled prop", label text, and soft-confirm tests (update only the intermediate button-text assertions that referenced `Publishing batch N…`, which the panel replaces).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/components/admin/FinalizeButton.test.tsx`
Expected: FAIL — new testids/behaviors absent.

- [ ] **Step 3: Implement the consumer.** In `components/admin/FinalizeButton.tsx`:

(a) State machine + refs (spec §4.4):

```ts
type ButtonState =
  | { kind: "idle" }
  | { kind: "running"; phase: "batch"; done: number; total: number; lastName: string | null }
  | { kind: "running"; phase: "cas"; casPhase: FinalizeCasPhase | null }
  | { kind: "race_row"; failures: PerRowFailure[] }
  | { kind: "cas_per_row"; rows: CasPerRowEntry[] }
  | { kind: "error"; copy: string; code: string | null }
  | { kind: "complete" };
```

Inside the component: `const completedRef = useRef(0); const grandTotalRef = useRef(0);`.

(b) A shared NDJSON reader mirroring `Step2Verify.tsx:243-268` (buffer across chunks; `dispatchLine` returns `true` on terminal). Two dispatchers — one for finalize batch, one for CAS — each returning the terminal `body` (or `null` if not terminal). Batch dispatch updates progress:
- On `listed`: `grandTotalRef.current = completedRef.current + msg.total;` `setState(s => s.kind==="running" && s.phase==="batch" ? { ...s, done: completedRef.current, total: grandTotalRef.current } : s);`
- On `row`: `const done = Math.min(completedRef.current + msg.done, grandTotalRef.current || completedRef.current + msg.done); setState(s => s.kind==="running" && s.phase==="batch" ? { ...s, done, total: grandTotalRef.current, lastName: msg.name || msg.driveFileId } : s);`
- On `result`: return `msg.body` to the loop (terminal). AFTER a clean `batch_complete`, the loop does `completedRef.current += lastRowTotalThisBatch` (track the batch's `row.total` in a local; `0` if no rows) before continuing.

(c) `runLoop` (adapt existing `:133-218`): at entry, `completedRef.current = 0; grandTotalRef.current = 0;` and `setState({ kind:"running", phase:"batch", done:0, total:0, lastName:null })`. Each batch `fetch("/api/admin/onboarding/finalize", { method:"POST", headers:{ Accept: FINALIZE_STREAM_CONTENT_TYPE } })`; branch on `isStream = response.ok && (response.headers?.get?.("content-type") ?? "").includes(FINALIZE_STREAM_CONTENT_TYPE) && response.body != null`; `!isStream` → `const body = await response.json()` and run the SAME terminal handling. Terminal handling is the existing per-row-failure → `race_row`, `batch_complete` → continue (accumulate completedRef), `all_batches_complete` → break, `ok:false` → error. Then transition to `{ kind:"running", phase:"cas", casPhase:null }`, `fetch("/api/admin/onboarding/finalize-cas", { headers:{ Accept } })`, read phase events → `setState(s => s.kind==="running"&&s.phase==="cas" ? {...s, casPhase: msg.phase} : s)`, apply the CAS terminal body exactly as today (`cas_per_row` / error / complete + `router.refresh()`).

(d) Render the inline morph (replace the button while running):

```tsx
{state.kind === "running" ? (
  <div data-testid="wizard-finalize-progress" className="flex flex-col gap-2 rounded-md border border-border bg-surface-sunken p-tile-pad text-sm text-text">
    {state.phase === "batch" ? (
      <>
        <p className="text-base font-semibold text-text-strong" aria-hidden="true">Publishing your shows…</p>
        <progress
          data-testid="wizard-finalize-progressbar"
          className="h-2 w-full"
          max={state.total > 0 ? state.total : undefined}
          value={state.total > 0 ? Math.min(state.done, state.total) : undefined}
          aria-label="Publish progress"
          aria-valuemin={0}
          aria-valuemax={state.total > 0 ? state.total : undefined}
          aria-valuenow={state.total > 0 ? Math.min(state.done, state.total) : undefined}
        />
        {state.total > 0 ? (
          <p className="tabular-nums text-text-subtle" data-testid="wizard-finalize-count" aria-hidden="true">
            {Math.min(state.done, state.total)} of {state.total} show{state.total === 1 ? "" : "s"}
          </p>
        ) : null}
        {state.lastName ? (
          <p className="truncate text-text" data-testid="wizard-finalize-current" title={state.lastName} aria-hidden="true">
            <span className="text-text-subtle">Publishing: </span>{state.lastName}
          </p>
        ) : null}
      </>
    ) : (
      <>
        <p className="text-base font-semibold text-text-strong" aria-hidden="true">Finishing setup…</p>
        <p className="text-text-subtle" data-testid="wizard-finalize-cas-phase" aria-hidden="true">{casPhaseLabel(state.casPhase)}</p>
      </>
    )}
    <span className="sr-only" role="status" aria-live="polite">
      {state.phase === "cas" ? "Finishing setup" : "Publishing your shows"}
    </span>
  </div>
) : (
  <AccentButton /* …existing button… */ >
    {idleLabel}
  </AccentButton>
)}
```

with `casPhaseLabel`:

```ts
function casPhaseLabel(phase: FinalizeCasPhase | null): string {
  switch (phase) {
    case "applying": return "Applying your edits…";
    case "publishing": return "Publishing shows…";
    case "subscribing": return "Connecting your folder…";
    default: return "Finishing up…";
  }
}
```

The soft-confirm, `race_row`, `cas_per_row`, `error`, and `complete` blocks (`:262-349`) stay exactly as today (still rendered below, and now the button is hidden only while `running`). Copy the idle `AccentButton` (`:244-260`) into the `else` branch, minus the `isRunning` text ternary (idle always shows `idleLabel`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/components/admin/FinalizeButton.test.tsx`
Expected: PASS.

- [ ] **Step 5: Negative-regression check.** Temporarily break the reconciliation (`completedRef.current = 0` never incremented) and confirm the multi-batch test (case 3) FAILS; revert. Confirm the guard clamp (`Math.min`) matters by feeding a `row.done > total` line and confirming the bar never exceeds `max`.

- [ ] **Step 6: Commit**

```bash
git add components/admin/FinalizeButton.tsx tests/components/admin/FinalizeButton.test.tsx
git commit --no-verify -m "feat(crew-page): inline streaming progress panel for Step 3 publish"
```

---

## Task 5: Transition audit (mandatory — component has a Transition Inventory)

**Files:**
- Test: `tests/components/admin/FinalizeButton.test.tsx` (new `describe("transition audit")` block)

The Transition Inventory (spec §6) is ALL instant swaps — there is NO `AnimatePresence`, NO ternary-with-`exit`, NO Framer Motion in this component (matches `Step2Verify`). The audit pins that and the state exclusivity.

- [ ] **Step 1: Write the failing tests**

- **No animation primitives:** assert the rendered tree contains no element with `data-framer-*` and the component source imports no `framer-motion` (a `grep`-style static assertion: `expect(FinalizeButtonSource).not.toMatch(/AnimatePresence|framer-motion/)` reading the file via `fs`). **Catches:** an accidental animation dependency that would reintroduce the exit-prop bug class.
- **State exclusivity:** for each state (idle, running:batch, running:cas, race_row, cas_per_row, error, complete), exactly one of {`wizard-finalize-button`, `wizard-finalize-progress`, `wizard-finalize-race-row`, `wizard-finalize-cas-per-row`, `wizard-finalize-error`, `wizard-finalize-publish-complete`} governs and the button is present ONLY when not `running`.
- **Compound: soft-confirm mid-flow:** open the soft confirm (`uncheckedCleanCount>0`), click Continue → the confirm closes AND the panel enters `running:batch` (no double-render of button+panel). **Catches:** the confirm not closing before the loop, or the button showing under the panel.
- **Retry compound:** from `error`, the button is present and clickable; clicking re-enters `running:batch` with a reset bar (already covered functionally in Task 4 case 7 — here assert the DOM exclusivity across the error→running transition).

- [ ] **Step 2: Run to verify fail, then (if needed) adjust render exclusivity**

Run: `pnpm vitest run tests/components/admin/FinalizeButton.test.tsx -t "transition audit"`
Expected: FAIL initially if any exclusivity is loose; the Task 4 render already enforces button-hidden-while-running, so most pass — add any missing `null` guards.

- [ ] **Step 3: Commit**

```bash
git add tests/components/admin/FinalizeButton.test.tsx
git commit --no-verify -m "test(crew-page): transition audit for finalize progress panel"
```

---

## Task 6: Impeccable v3 dual-gate (invariant #8)

**Files:** none (evaluation of the `FinalizeButton.tsx` diff).

- [ ] **Step 1:** Run `/impeccable critique` on the `FinalizeButton.tsx` diff with the canonical v3 preflight gates (PRODUCT.md → DESIGN.md → register → preflight signal).
- [ ] **Step 2:** Run `/impeccable audit` on the same diff.
- [ ] **Step 3:** Fix every HIGH/CRITICAL finding, or record a `DEFERRED.md` entry with the trigger. Capture findings + dispositions for the PR body.
- [ ] **Step 4:** Re-run any FinalizeButton tests touched by fixes; commit fixes.

```bash
git add -A && git commit --no-verify -m "fix(crew-page): impeccable findings on finalize progress panel"
```

---

## Task 7: Whole-diff verification (pre-close-out)

**Files:** none (gates).

- [ ] **Step 1: Typecheck** — `pnpm exec tsc --noEmit` → clean.
- [ ] **Step 2: Prettier** — `pnpm exec prettier --check .` → clean (format all touched files; per memory `prettier --check .` scans ALL files).
- [ ] **Step 3: Targeted suite** — `pnpm vitest run tests/onboarding/finalizeProgress.test.ts tests/onboarding/finalizeStream.test.ts tests/onboarding/finalizeCasStream.test.ts tests/onboarding/finalize.test.ts tests/onboarding/finalize-cas.test.ts tests/onboarding/finalizeRevalidate.test.ts tests/onboarding/finalizeApprovalRace.test.ts tests/components/admin/FinalizeButton.test.tsx` → all PASS.
- [ ] **Step 4: Audit gates that could be affected** — `pnpm test:audit:x2-no-raw-codes` (new UI copy must route through the catalog; the progress-panel strings are plain UI copy, not §12.4 codes — confirm the no-raw-codes audit still passes). Also run any lint script if present (`pnpm lint` if defined).
- [ ] **Step 5:** No commit (verification only). Proceed to close-out (Stage 4: whole-diff Codex review → push → CI → merge).

---

## Self-review notes (author checklist, completed)

- **Spec coverage:** §4.1→Task 1; §4.2→Task 2; §4.3→Task 3; §4.4/§6/§7/§8→Tasks 4-5; §9 (no-raw-codes)→Tasks 4 + 7.4; §10 invariants→Global Constraints + topology decl; §11 backward-compat→Tasks 2-3 regression steps; §12 tests→Tasks 1-5; §13 numeric→single constants; §14 preempts→carried into the whole-diff review brief.
- **Placeholder scan:** every code step shows concrete code; the two "…unchanged…" markers in Tasks 2-3 explicitly reference the exact existing line ranges to preserve, not vague instructions.
- **Type consistency:** `FinalizeProgressCallbacks`, `onListed`/`onRow`, `onPhase`, the `ButtonState` union, and the shared wire types are named identically across tasks.
- **Anti-tautology:** streaming terminal-body tests assert against the non-streaming body (Tasks 2.1/3.3), progress `total` is derived from fixture line counts (Task 4), and Task 4.5 mutates the impl to prove the multi-batch test bites.
- **Layout task:** right-sized to jsdom per spec §7 (not a fixed-dimension parent) — documented, not omitted.
- **Transition audit:** Task 5, includes compound transitions (soft-confirm mid-flow, error→retry).
- **Fix-round regression budget:** each backend task re-runs the non-streaming regression suite after its refactor (Tasks 2.5 / 3.5).
