# Spec — Step 3 Publish/Finish-Setup streaming progress

**Date:** 2026-06-30
**Slug:** `step3-publish-streaming-progress`
**Status:** Draft (autonomous-ship pipeline)
**Owner surface:** UI (Opus) + two API routes (response-encoding only)

---

## 1. Goal

When the operator clicks the Step 3 **"Publish N shows & finish setup"** button, the only feedback today is the button label cycling through `Publishing batch 1…` → `Publishing batch 2…` → `Publishing…` (`components/admin/FinalizeButton.tsx:255-259`). For a folder under the 100-sheet batch cap (`app/api/admin/onboarding/finalize/route.ts:28` `BATCH_CAP = 100`) the whole publish is a **single** 30–60 s request during which the label never even changes.

Give the operator **per-sheet streaming progress** during publish — a determinate bar, an `X of Y` count, and the name of the sheet currently being published — followed by a **distinct "Finishing setup…" final step** for the CAS phase. Mirror the proven Step 2 scan streaming pattern (`lib/onboarding/scanProgress.ts`, `app/api/admin/onboarding/scan/route.ts`, `components/admin/wizard/Step2Verify.tsx`).

This is a **response-encoding + UI change only**. No DB logic, RPC, advisory-lock topology, or `wizard_finalize_checkpoints` contract changes.

## 2. Scope

### In scope

- New shared wire-contract module `lib/onboarding/finalizeProgress.ts` (the NDJSON event/result types + content-type constant), imported by BOTH routes (producers) and `FinalizeButton` (consumer), so any server/client drift is a compile error — same discipline as `lib/onboarding/scanProgress.ts:1-7`.
- `app/api/admin/onboarding/finalize/route.ts`: add a streaming sibling handler + `POST` content-negotiation; refactor the existing handler's auth and batch core into shared helpers so the non-streaming path stays byte-for-byte identical.
- `app/api/admin/onboarding/finalize-cas/route.ts`: same dual-mode treatment, emitting CAS phase events.
- `components/admin/FinalizeButton.tsx`: read the NDJSON streams, morph the button region into an inline progress panel, render the determinate bar / per-sheet count / distinct finishing step. Preserve every existing terminal state (race-row re-apply links, CAS per-row recovery, generic error, complete).
- Tests: new streaming-handler tests for both routes; `tests/components/admin/FinalizeButton.test.tsx` migrated to NDJSON stream mocks (with the JSON safety-net path retained for error cases).

### Out of scope

- The **resume-after-interruption** surfaces (`components/admin/FinalizeInProgress.tsx`, `components/admin/ReadyToPublish.tsx`, the dispatcher at `app/admin/page.tsx`) — they already show `X of Y sheets published` from the checkpoint and are unchanged. Reload mid-run still routes there (checkpoint untouched).
- Any DB schema, migration, RPC, or advisory-lock change.
- Background jobs / a single server-driven endpoint — explicitly rejected (would rewrite the finalize contract and the checkpoint/resume model).

## 3. Resolved decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Granularity: per-sheet streaming** (`row` events). | Only option that shows real progress during the single-batch case (where all the wall-clock time is). User-approved. |
| D2 | **Placement: inline morph** — while running, the `wizard-finalize` region shows the progress panel in place of the button. | Keeps the review context; user-approved. |
| D3 | **CAS shown as a distinct final step** ("Finishing setup…") with phase sub-labels (applying / publishing / subscribing). | User-approved. |
| D4 | **Dual-mode via `Accept: application/x-ndjson` negotiation at `POST` only.** Keep `handleOnboardingFinalize` / `handleOnboardingFinalizeCas` as the unchanged non-streaming functions; add `*Stream` siblings. | The 17+ `tests/onboarding/finalize*.test.ts` files call the non-streaming functions directly and assert HTTP status + flat body; dual-mode keeps them ALL green and proves "DB logic byte-for-byte identical." The client's `!isStream` safety net handles their `mockJsonResponse` shape. |
| D5 | **Grand-total denominator derived server-side** via a `listed` event that reuses the existing `countRemainingCleanRows` helper, computed at batch start ONLY when a streaming progress callback is present. | The loop processes BOTH `'staged'` and `'applied'` manifest rows (`finalize/route.ts:393`), so `publishCount` alone is the wrong denominator. Computing the count only under a callback keeps the non-streaming path byte-identical (no new query). |
| D6 | **Native `<progress>` element + instant state swaps** (mirror `components/admin/wizard/Step2Verify.tsx:422-431`). No bespoke animations. | Matches the sibling Step 2 surface; sidesteps the animation-bug class; the bar value change is the only motion and it is native. |
| D7 | **Streamed `row`/`phase`/`listed` events are OPTIMISTIC; the terminal `{type:"result", body}` is authoritative.** | Same contract Step 2 uses (`scanProgress.ts:20-30`). The body is the exact JSON the non-streaming path returns. |

## 4. Architecture

### 4.1 Shared wire contract — `lib/onboarding/finalizeProgress.ts` (NEW)

Defines the event union, the result-body type aliases (re-exported from / co-located with the existing response shapes), and the content-type constant. Mirrors `scanProgress.ts`.

```ts
export const FINALIZE_STREAM_CONTENT_TYPE = "application/x-ndjson";

// ---- /finalize batch stream ----
export type FinalizeProgressEvent =
  | { type: "listed"; total: number } // finishable clean rows remaining at THIS batch's start
  | { type: "row"; done: number; total: number; name: string | null; driveFileId: string };

// FinalizeBatchResponse | FinalizeErrorResponse — moved here from FinalizeButton so producer+consumer share one source.
export type FinalizeResultBody = FinalizeBatchResponse | FinalizeErrorResponse;

export type FinalizeStreamMessage =
  | FinalizeProgressEvent
  | { type: "result"; body: FinalizeResultBody };

// ---- /finalize-cas stream ----
export type FinalizeCasPhase = "applying" | "publishing" | "subscribing";
export type FinalizeCasProgressEvent = { type: "phase"; phase: FinalizeCasPhase };

export type FinalizeCasResultBody = FinalizeCasResponse; // success | { ok:false, code, per_row? }

export type FinalizeCasStreamMessage =
  | FinalizeCasProgressEvent
  | { type: "result"; body: FinalizeCasResultBody };
```

The response-body types (`FinalizeBatchResponse`, `FinalizeErrorResponse`, `PerRowEntry`, `PerRowFailure`, `PerRowOk`, `CasPerRowEntry`, `FinalizeCasResponse`) currently live in `FinalizeButton.tsx:46-86`. They move into (or are re-exported from) this shared module so the routes and the button share one definition.

### 4.2 `/finalize` producer (dual-mode)

Refactor `handleOnboardingFinalize` (`finalize/route.ts:1029`) into three shared pieces; behavior of the non-streaming path is unchanged:

1. `resolveFinalizer(runtime): Promise<{ email: string } | { error: Response }>` — extract the existing auth block (`finalize/route.ts:1034-1047`) verbatim (returns 500 `ADMIN_SESSION_LOOKUP_FAILED` / 403 `ADMIN_FORBIDDEN`).
2. `executeFinalizeBatch(runtime, finalizerEmail, callbacks?): Promise<Response>` — the existing `runtime.withTx(...)` body (`finalize/route.ts:1054-1186`) + post-commit `revalidateShow` loop (`1190-1192`) + the `catch → errorResponse(500, …)` wrapper (`1194-1208`), unchanged EXCEPT two additive callback hooks:
   - **`listed` emission point — single, early, before any branch.** Immediately AFTER the precondition gate passes (after `ensureCheckpoint` returns a checkpoint at `finalize/route.ts:1071-1072`) and BEFORE the `final_cas_done` early return (`1073`), the `all_batches_complete` early return (`1090`), the zero-row short-circuit (`1104`), AND the row loop — **only if `callbacks?.onListed`**: `callbacks.onListed(await countRemainingCleanRows(tx, wizardSessionId))`. This one placement guarantees that EVERY non-error streaming response emits exactly one `listed` (including all zero-row finishes), then zero-or-more `row`, then one terminal `result`. Precondition-ERROR paths (`CHECKPOINT_MISSING` at `1060`/`1072`, `CONCURRENT_FINALIZE_IN_FLIGHT` at `1064`, `WIZARD_SESSION_SUPERSEDED` at `1068`, `ONBOARDING_NOT_RESOLVED` at `1099`) return BEFORE this point and emit only the terminal `{result, ok:false}` with no `listed`. (No callback ⇒ no extra query ⇒ the non-streaming path is byte-identical.)
   - After each `perRow.push(...)` inside the loop (`finalize/route.ts:1169-1174`): `callbacks?.onRow?.({ done: perRow.length, total: approvedRows.length, name: parsedShowTitle(row.parse_result) ?? null, driveFileId: row.drive_file_id })`. (`parsedShowTitle` is already imported and used at `finalize/route.ts:1172`; def `lib/onboarding/blockerDisplayName.ts:12`.)
3. `handleOnboardingFinalize(request, deps)` (non-streaming, **public contract preserved**) = `resolveFinalizer` → on error return it; else `return executeFinalizeBatch(runtime, email)` with NO callbacks. Identical bytes to today.

New streaming sibling:

```ts
export async function handleOnboardingFinalizeStream(request, deps = {}): Promise<Response> {
  const runtime = depsWithDefaults(deps);
  const a = await resolveFinalizer(runtime);
  if ("error" in a) return a.error;            // PRE-STREAM real non-200 (mirrors scan auth)
  const encoder = new TextEncoder();
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (msg: FinalizeStreamMessage) => {
        if (canceled) return;
        try { controller.enqueue(encoder.encode(JSON.stringify(msg) + "\n")); }
        catch { canceled = true; }
      };
      try {
        const response = await executeFinalizeBatch(runtime, a.email, {
          onListed: (total) => emit({ type: "listed", total }),
          onRow: (e) => emit({ type: "row", ...e }),
        });
        const body = (await response.json()) as FinalizeResultBody;
        emit({ type: "result", body });
      } catch {
        emit({ type: "result", body: { ok: false, code: ONBOARDING_FINALIZE_INTERNAL_ERROR } });
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
    cancel() { canceled = true; }, // work already completed inside executeFinalizeBatch's promise
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

export const maxDuration = 300; // hold the function open for the streamed batch (mirrors scan/route.ts:20)

export async function POST(request: Request): Promise<Response> {
  if ((request.headers.get("accept") ?? "").includes(FINALIZE_STREAM_CONTENT_TYPE)) {
    return await handleOnboardingFinalizeStream(request);
  }
  return await handleOnboardingFinalize(request);
}
```

**`executeFinalizeBatch` returns a fully-buffered `NextResponse`** (the batch already completed inside `withTx`), so `await response.json()` in the stream reads its in-memory body — no double DB work, no re-entry. The post-commit `revalidateShow` calls happen inside `executeFinalizeBatch` before it returns, i.e. before the terminal `result` is emitted.

**HTTP-status note (D4 consequence):** precondition failures the non-streaming path returns as 409 (e.g. `CONCURRENT_FINALIZE_IN_FLIGHT`, `WIZARD_SESSION_SUPERSEDED`, `ONBOARDING_NOT_RESOLVED`, `WIZARD_FINALIZE_CHECKPOINT_MISSING`) occur inside `withTx`, so on the STREAMING path they surface as a terminal `{type:"result", body:{ok:false, code, …}}` on a 200 stream. This is safe because `FinalizeButton` is **status-agnostic** today — it branches on body shape (`"ok" in body && body.ok === false`), never on `response.status` (`FinalizeButton.tsx:150`). The non-streaming function keeps the real 409s, so every existing endpoint test is unaffected.

### 4.3 `/finalize-cas` producer (dual-mode)

`runFinalizeCas` (`finalize-cas/route.ts:646`) returns `Response | { status:"finalize_complete", … }`. Add an optional `onPhase?: (p: FinalizeCasPhase) => void` parameter, threaded with two additive calls (no-op when absent):

- `onPhase?.("applying")` immediately before the shadow-apply loop (`finalize-cas/route.ts:714`).
- `onPhase?.("publishing")` immediately before `publishAppliedWizardShows` (`finalize-cas/route.ts:733`).

`handleOnboardingFinalizeCas` (`finalize-cas/route.ts:751`) is preserved as the non-streaming function. The `subscribing` phase is post-commit (the `deps.subscribeToWatchedFolder(...)` call at `finalize-cas/route.ts:782`), so the streaming sibling emits `phase:"subscribing"` right before that call. Streaming sibling shape mirrors §4.2:

```ts
export async function handleOnboardingFinalizeCasStream(request, routeDeps = {}): Promise<Response> {
  const deps = depsWithDefaults(routeDeps);
  // auth pre-stream (extract finalize-cas/route.ts:756-765) → real non-200 on failure
  // stream.start():
  //   const affectedShowIds = new Set();
  //   try {
  //     const result = await deps.withTx(tx => runFinalizeCas(tx, deps, affectedShowIds, p => emit({type:"phase",phase:p})));
  //     for (const id of affectedShowIds) revalidateShow(id);
  //     if (result instanceof Response) { emit({type:"result", body: await result.json()}); }
  //     else { emit({type:"phase",phase:"subscribing"}); await deps.subscribeToWatchedFolder(result.watched_folder_id); emit({type:"result", body: result}); }
  //   } catch { emit({type:"result", body:{ ok:false, code:"ONBOARDING_FINALIZE_INTERNAL_ERROR" }}); }
  //   finally { controller.close(); }
}
export const maxDuration = 300;
export async function POST(request) {
  return (request.headers.get("accept") ?? "").includes(FINALIZE_STREAM_CONTENT_TYPE)
    ? handleOnboardingFinalizeCasStream(request)
    : handleOnboardingFinalizeCas(request);
}
```

The non-streaming `handleOnboardingFinalizeCas` already does `revalidateShow` + `subscribeToWatchedFolder` + serialize (`finalize-cas/route.ts:771-783`); the streaming sibling reproduces that same post-commit sequence around the phase/terminal emits. Refactor the shared post-commit body into a helper if it reduces duplication, but it must remain byte-equivalent for the non-streaming path.

### 4.4 `FinalizeButton` consumer

Keep the client-driven multi-batch loop (`FinalizeButton.tsx:133-218`). Per batch, `fetch("/api/admin/onboarding/finalize", { method:"POST", headers:{ Accept: FINALIZE_STREAM_CONTENT_TYPE } })`, then mirror `Step2Verify`'s reader (`components/admin/wizard/Step2Verify.tsx:232-272`):

- `isStream = response.ok && contentType.includes(FINALIZE_STREAM_CONTENT_TYPE) && response.body != null`.
- `!isStream` → `const body = await response.json()` and run the existing terminal handling (handles pre-stream non-200 JSON AND legacy mocks).
- stream → `getReader()` + `TextDecoder` + newline-buffered `dispatchLine`; `listed`/`row` update progress state; terminal `{type:"result", body}` runs the existing terminal handling on `body`.

State machine (replaces `ButtonState`, `FinalizeButton.tsx:101-107`):

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

A `completedRef` accumulates rows finished across prior batches; `grandTotalRef` holds the latest grand total; a `lastNameRef`/state field holds the current sheet name. **`runLoop` resets `completedRef = 0`, `grandTotalRef = 0`, and the last-name to `null` at entry** (before the first batch fetch), so a retry from the `error` / `race_row` / `cas_per_row` states starts a fresh accumulator with no stale inflation. This is correct on retry because the server's `listed`/`countRemainingCleanRows` already reflects only the REMAINING finishable rows (rows finalized in a prior attempt were consumed/deleted, `finalize/route.ts:620` `deleteApprovedPending`), so a from-zero bar over the remaining work is the intended UX. Progress math (D5):

- On `listed`: `grandTotalRef = completedRef + listed.total`. Render bar `max = grandTotalRef`, `value = completedRef` (0-of-N for the new batch).
- On `row`: `value = completedRef + event.done`; `lastName = event.name || event.driveFileId`; status line `Publishing: <lastName> (value of grandTotalRef)`.
- On batch terminal `result` with `status:"batch_complete"` and clean `per_row`: `completedRef += <this batch's total>` (the last `row.total`, or `0` if the batch had no rows) and continue the loop.
- On `all_batches_complete` (clean): transition to `{kind:"running", phase:"cas", casPhase:null}` and POST `/finalize-cas` (Accept NDJSON); `phase` events update `casPhase`; terminal applies the CAS body.

Render (inline morph): while `kind==="running"`, render the progress panel **in place of** the button (button hidden); otherwise render the button. The `race_row` / `cas_per_row` / `error` / `complete` panels render exactly as today (`FinalizeButton.tsx:270-349`), unchanged. The soft-confirm dialog (`FinalizeSoftConfirm`, `FinalizeButton.tsx:363-447`) is unchanged and still gates before `runLoop`.

## 5. Streaming contract — exact event shapes

`/finalize` (one HTTP request per batch):
```
{"type":"listed","total":<int ≥0>}            // once, at batch start (finishable clean rows remaining)
{"type":"row","done":<1..N>,"total":<N>,"name":<string|null>,"driveFileId":<string>}   // per processed row
{"type":"result","body":<FinalizeBatchResponse | FinalizeErrorResponse>}               // exactly one, terminal
```
`/finalize-cas` (one HTTP request):
```
{"type":"phase","phase":"applying"}
{"type":"phase","phase":"publishing"}
{"type":"phase","phase":"subscribing"}        // only on the success path, before the Drive subscribe
{"type":"result","body":<FinalizeCasResponse>}   // exactly one, terminal
```
`total` in `listed` is finishable-remaining at batch start; `total` in `row` is THIS batch's row count (`approvedRows.length` ≤ 100). The client reconciles cross-batch via `completedRef` (§4.4). A batch with zero approved rows (the `finalize/route.ts:1104` short-circuit and the two `all_batches_complete` early returns at `1074`/`1090`) emits `listed` (total possibly 0) then the terminal `result` with no `row` events — the bar shows 0-of-0 / immediately advances.

## 6. State machine + Transition Inventory

States: **idle**, **confirming** (soft dialog open; pure overlay, not a `ButtonState` — `confirmOpen` flag), **running:batch**, **running:cas**, **complete**, **race_row**, **error**, **cas_per_row**.

| From → To | Trigger | Treatment |
|-----------|---------|-----------|
| idle → confirming | click w/ `uncheckedCleanCount > 0` | instant — dialog renders (existing) |
| idle → running:batch | click w/ `uncheckedCleanCount === 0` | instant — button hidden, panel shown |
| confirming → running:batch | Continue | instant |
| confirming → idle | Go back / Esc | instant (existing) |
| running:batch → running:batch | `row` events / next batch | bar `value` advances (native `<progress>`); status line text swaps |
| running:batch → running:cas | `all_batches_complete` clean | instant — panel switches to "Finishing setup…" |
| running:cas → running:cas | `phase` events | sub-label text swaps; instant |
| running:cas → complete | `finalize_complete` | instant — panel → complete copy; `router.refresh()` |
| running:batch → race_row | non-OK `per_row` | instant — panel → re-apply list (existing) |
| running:batch → error | network throw / `ok:false` / unknown status | instant — panel → error copy (existing) |
| running:cas → error | network throw / `ok:false` (no per_row) | instant |
| running:cas → cas_per_row | `ok:false` w/ `per_row` | instant — recovery list (existing) |
| error/race_row/cas_per_row → running:batch | re-click button | instant (button visible in those states) |

**Compound transitions:** the flow is strictly linear (single in-flight request at a time; the button is `disabled` while `isRunning`, `FinalizeButton.tsx:221`), so there is no "state A changes while state B mid-transition." The only concurrent surface is the soft-confirm dialog, which always resolves to idle or running:batch BEFORE any request fires (`runLoop` sets `confirmOpen=false` first). No compound animation cases.

All transitions are **instant content swaps** (D6); the sole motion is the native `<progress>` bar `value` change. This matches `Step2Verify` (no `AnimatePresence`, no ternary-with-`exit`, no Framer Motion).

## 7. Dimensional Invariants

Tailwind v4 does not default `.flex` to `align-items: stretch` (project invariant). Relationships to guarantee:

| Parent | Child | Invariant | Mechanism |
|--------|-------|-----------|-----------|
| `wizard-finalize` container (`flex flex-col gap-3`, `FinalizeButton.tsx:243`) | progress panel | panel spans full container width | panel root `w-full` (it is a block `flex flex-col`, full width by default in a column flex) |
| progress panel | `<progress>` bar | bar spans full panel width, fixed height | `className="h-2 w-full"` (matches `components/admin/wizard/Step2Verify.tsx:423`) |
| `wizard-finalize` container | button (idle) vs panel (running) | **no HORIZONTAL shift; panel width == container width** | panel root is a full-width block in the column flex; `data-testid="wizard-finalize-progress"`. Vertical growth IS expected and accepted — the panel (bar + count line + status line) is taller than the idle button; the morph is honest about replacing the button, not pretending to be the same height. The container's left edge and width do not change. |

Real-browser (Playwright) layout assertion required (jsdom insufficient): with the panel rendered, assert (a) `<progress>` `getBoundingClientRect().width` equals the panel's content width (±0.5px), (b) the panel width equals the `wizard-finalize` container width (±0.5px), and (c) the panel's `getBoundingClientRect().left` equals the container's `left` (±0.5px) — i.e. NO horizontal shift. Height equality is explicitly NOT asserted (the panel is legitimately taller than the button).

## 8. Guard conditions (every prop / input / event field)

- `publishCount` undefined → legacy label `Finish setup and publish` (existing, `FinalizeButton.tsx:225-228`); progress still works (denominator comes from `listed`, not `publishCount`).
- `publishCount === 0` does NOT disable the button. The disabled gate is `disabled={!finishable}` (`components/admin/wizard/Step3ReviewWithFinalize.tsx:56`), the resolution gate — independent of `publishCount`. A finishable session with `publishCount === 0` and `uncheckedCleanCount > 0` (all clean rows unchecked → all become Held) is a valid publish; the loop still processes the `'staged'` rows. The progress denominator NEVER reads `publishCount` (it reads `listed`), so a `0` count cannot divide-by-zero and the bar still works for an all-Held finish.
- `uncheckedCleanCount` default `0` (existing default, `FinalizeButton.tsx:123`) → no soft confirm. The live values flow from the optimistic checkbox overlay (`components/admin/wizard/Step3ReviewWithFinalize.tsx:54-58`), so the label/soft-confirm track the boxes with no round-trip lag.
- `disabled` true (i.e. `!finishable`) → button disabled, click is a no-op (`onPrimaryClick` early return, `FinalizeButton.tsx:234`); no progress UI is reachable until the session is finishable.
- `listed.total === 0` → `grandTotal = completedRef + 0`; if `grandTotal === 0` the bar renders `value=0 max=undefined` (indeterminate) to avoid `0/0`; status line shows "Finishing up…" rather than "0 of 0".
- `row.name` null/empty → status line falls back to `row.driveFileId`; if both unusable, generic "this sheet".
- `row.done > grandTotal` (estimate drift) → clamp `value = Math.min(value, grandTotal)` so the native bar never exceeds `max`.
- Stream interruption (reader throws / `done` before terminal `result`) → mirror `components/admin/wizard/Step2Verify.tsx:262-270`: if no terminal `result` was seen, set `{kind:"error", copy: GENERIC_ERROR, code:null}` (no raw code).
- Non-200 / non-NDJSON response (pre-stream error, proxy stripped `Accept`) → `!isStream` branch reads `response.json()` and runs the same terminal handling (race_row / cas_per_row / error / continue).
- `fetch` network throw → `{kind:"error", copy: GENERIC_ERROR, code:null}` (existing, `FinalizeButton.tsx:145-147`).
- Double-click guard preserved: `runLoop` early-returns while `state.kind === "running"` (`FinalizeButton.tsx:134`) and the button is `disabled` while running.

## 9. Error handling & no-raw-codes (invariant #5)

Every terminal failure routes copy through `lib/messages/lookup.ts` `messageFor(code).dougFacing` via the existing `lookupDougFacing` helper (`FinalizeButton.tsx:109-113`), with `GENERIC_ERROR` (`FinalizeButton.tsx:116-117`) as the code-less fallback. Race-row links render verbatim from the server's pre-built `re_apply_url` (`FinalizeButton.tsx:288-294`) — the client never composes URLs. The streamed `{ok:false, code}` terminal bodies pass through the identical handling. No `console`/raw code reaches the rendered DOM.

## 10. Plan-wide invariant compliance

- **#1 TDD** — every task: failing test → minimal impl → green → commit.
- **#2 Advisory lock single-holder** — `tryFinalizeLock` (`finalize/route.ts:1063`, `finalize-cas/route.ts:221`) stays the SOLE `pg_try_advisory_xact_lock('finalize:<session>')` holder, acquired inside the same `withTx` it has today. The streaming wrapper adds NO lock; it wraps the SAME `executeFinalizeBatch`/`runFinalizeCas` transaction. No new holder, no nesting. Topology unchanged; `tests/auth/advisoryLockRpcDeadlock.test.ts` is not affected (no new lock surface). Documented as preserved.
- **#3 Email canonicalization** — N/A (no email handling touched).
- **#4 No global sync cursor** — N/A (no watermark/cursor identifiers introduced).
- **#5 No raw error codes in UI** — §9.
- **#6 Commit per task** — conventional commits, one task per commit.
- **#7 Spec canonical** — this spec governs.
- **#8 UI quality gate** — `FinalizeButton.tsx` is a UI surface ⇒ impeccable v3 critique + audit before cross-model review; HIGH/CRITICAL fixed or `DEFERRED.md`.
- **#9 Supabase call-boundary discipline** — NO new Supabase/DB call sites. The single additive read (`countRemainingCleanRows`) is an existing helper reused under the streaming callback; it already follows the route's `tx.query` boundary. No `_metaInfraContract` registry change required (no new auth/DB helper).

**Meta-test inventory:** none created or extended. No new RPC-gated table (no PostgREST DML lockdown), no new auth/Supabase helper (no `_metaInfraContract` row), no new admin-alert catalog row, no new advisory-lock surface. Declared explicitly per the writing-plans rule.

**PostgREST DML lockdown:** N/A — no new table.

## 11. Backward compatibility

- Non-streaming `handleOnboardingFinalize` / `handleOnboardingFinalizeCas` keep their exact signatures, return types, HTTP statuses, and JSON bodies. All `tests/onboarding/finalize*.test.ts` and `finalizeCas*.test.ts` that call them directly pass UNCHANGED — this is the proof of "DB logic byte-for-byte identical."
- `POST` defaults to the non-streaming path unless `Accept: application/x-ndjson` is present.
- The client always sends the Accept header and falls back to the JSON path if the response is not a stream.

## 12. Test plan (failure mode each test catches)

Server — `tests/onboarding/finalizeStream.test.ts` (NEW):
- Streams `listed` then N `row` events then one terminal `result` whose `body` equals what the non-streaming `handleOnboardingFinalize` returns for the same fixture (assert against the non-streaming body, NOT a re-derived literal — anti-tautology). **Catches:** stream/JSON divergence.
- `listed.total` reconciliation across a 2-batch (>BATCH_CAP) fixture: `completed(batch1) + listed(batch2) === listed(batch1)`. **Catches:** wrong denominator / bar that jumps or overshoots.
- Precondition failure (e.g. `CONCURRENT_FINALIZE_IN_FLIGHT`) under streaming surfaces as a terminal `{type:"result", body:{ok:false, code}}` on a 200 stream, while the non-streaming function still returns 409 for the same inputs. **Catches:** D4 status divergence regressions / a raw code leaking.
- Non-streaming path (no Accept header) is byte-identical to a pinned pre-change snapshot of the response body. **Catches:** accidental behavior change in the shared core.
- `onListed`/`onRow` are NOT invoked on the non-streaming path (spy). **Catches:** the extra `countRemainingCleanRows` query leaking into the non-streaming path.

Server — `tests/onboarding/finalizeCasStream.test.ts` (NEW):
- Emits `applying` → `publishing` → `subscribing` → terminal `finalize_complete` in order; `subscribeToWatchedFolder` called exactly once AFTER `subscribing`. **Catches:** phase ordering / subscribe-before-commit.
- CAS `ok:false` with `per_row` (blocked shadow) surfaces in the terminal body with `per_row` intact. **Catches:** lost recovery payload.

Client — `tests/components/admin/FinalizeButton.test.tsx` (MIGRATED):
- New `mockNdjsonResponse(lines)` helper producing a `ReadableStream` with `Content-Type: application/x-ndjson`. Drives single-batch happy path: bar reaches `value === total`, status line shows the streamed sheet name, then "Finishing setup…", then complete + `router.refresh()`. Expected `total` derived from the fixture's row count, NOT hardcoded (anti-tautology). **Catches:** the panel not rendering progress; wrong count.
- Multi-batch: `completedRef` accumulation across two streamed batches; final `value === grandTotal`. **Catches:** per-batch reset / denominator drift.
- `!isStream` JSON safety net: a `mockJsonResponse({ok:false, code})` (no body/headers) still renders Doug-facing copy. **Catches:** breaking the legacy/error path during the stream migration.
- race-row terminal in a streamed batch renders the re-apply links from `re_apply_url`. **Catches:** losing the race-row gate under streaming.
- stream interruption (reader returns `done` before a terminal `result`) → generic error, no raw code. **Catches:** silent hang / raw-code leak.
- Existing assertions preserved: disabled prop, label text, soft-confirm flow.

Layout — `tests/components/admin/finalizeButtonLayout.browser.test.ts` (NEW, real-browser/Playwright): §7 invariants.

## 13. Numeric sweep / self-consistency

- `BATCH_CAP = 100` is the only batch-size literal; referenced once (§1) and otherwise via the helper.
- `maxDuration = 300` added to both finalize routes (matches `scan/route.ts:20`).
- Content-type `application/x-ndjson` defined once in `finalizeProgress.ts` (`FINALIZE_STREAM_CONTENT_TYPE`) and referenced by symbol everywhere — no literal duplication.
- CAS phases enumerated once (`applying`/`publishing`/`subscribing`) in `FinalizeCasPhase` and referenced by symbol.
- Event types enumerated once in the wire-contract module.

## 14. Reviewer preempts (do-not-relitigate)

Contracts already decided with rationale; challenge only with a concrete defect, not a re-derivation:

- **Dual-mode (D4) over always-stream.** Deliberate, to keep the 17+ `tests/onboarding/finalize*.test.ts` direct-call tests green and to prove "DB logic byte-for-byte identical." Always-stream would force a rewrite of every endpoint test and weaken the proof. The streaming siblings reuse the same core; no logic is duplicated.
- **Streaming precondition errors are 200 + `{ok:false,code}` (D4 HTTP-status note).** Intentional and safe: `FinalizeButton` branches on body shape, never on `response.status` (`FinalizeButton.tsx:150`). The non-streaming function retains the real 409/500s, so the HTTP contract for all existing callers is unchanged. This is the SAME tradeoff scan accepts for its mid-run failures (`scan/route.ts:272`).
- **The one additive read (`countRemainingCleanRows` for `listed`, D5).** Reuses an existing helper, read-only, fires ONLY under a streaming callback — §12 has a spy test proving it is NOT called on the non-streaming path. It does not alter any mutation, decision, or existing response body.
- **Advisory lock unchanged (§10 #2).** The streaming wrappers wrap the SAME `withTx` that already holds `pg_try_advisory_xact_lock('finalize:<session>')`. No new holder, no nesting, no topology change.
- **CAS streaming (D3).** Phase events are additive `onPhase` callbacks; non-streaming `handleOnboardingFinalizeCas` is unchanged. `subscribing` is correctly post-commit (after `withTx`, before the Drive call), preserving the existing ordering at `finalize-cas/route.ts:782`.

## 15. DB-change matrices — N/A

No table DDL, inline CHECK, enum, RPC read/write path, propagation trigger, cleanup function, or migration is touched. The **tier × domain completeness matrix**, **CHECK/enum migration matrix**, and **flag-lifecycle table** are therefore N/A. The `Accept: application/x-ndjson` content-negotiation is a request-time signal, not a stored boolean config flag (no storage / write path / read path to track). The `validation-schema-parity` and PostgREST-DML-lockdown gates are unaffected (no `supabase/migrations/**` change, no new RPC-gated table).
