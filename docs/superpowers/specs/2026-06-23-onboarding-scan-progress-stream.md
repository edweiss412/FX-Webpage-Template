# Spec: Real-time progress for the onboarding folder scan (Step 2)

**Date:** 2026-06-23
**Status:** Draft (autonomous-ship; both user-review gates waived per AGENTS.md autonomous-ship gate)
**Surface:** Admin onboarding wizard, Step 2 ("Verify your folder")

---

## 1. Problem

When an operator pastes a Drive folder URL on wizard Step 2 and clicks "Verify and scan", the app shows a progress panel with a **fake** signal: an elapsed-seconds counter driven by a 1s `setInterval` (`components/admin/wizard/Step2Verify.tsx:105-126,263-266`). The route does all the work and returns a single JSON blob at the end (`app/api/admin/onboarding/scan/route.ts:235-242`). The component's own docstring records that real streaming was deferred: _"Streaming progress events from the route is intentionally out of Phase 2 scope (it would require a backend contract extension we have not pinned)"_ (`Step2Verify.tsx:20-26`).

The operator cannot tell whether a large folder is progressing or hung. We will replace the fake counter with a **determinate, real-time progress bar** keyed to sheets actually read, plus a status line naming the most-recently-read sheet.

## 2. Where the time goes (constraint that drives the design)

`runOnboardingScan` (`lib/sync/runOnboardingScan.ts:974-988`) has two phases:

1. **Prepare** (`prepareOnboardingFiles`, `:891-925`) — lists the folder, then for each sheet does a Drive export round-trip + parse + enrich, fanned out at concurrency `ONBOARDING_PREPARE_CONCURRENCY = 12` (`:63`) via `mapWithConcurrency` (`:924`). This is the **dominant cost** (~1.35s/sheet per the file's own benchmark, `:50-55`). It performs **zero database writes** — it is a deliberately pre-lock, side-effect-free Drive read (`:902-909`).
2. **Stage** (`scanPreparedFiles`, `:804-869`) — fast DB staging; one `onboarding_scan_manifest` row committed per file in its own per-file transaction.

Because the slow phase writes nothing to the DB, a "poll a status table" design would show no progress for the entire wait and then snap to done. The progress signal therefore must come from the **same request that does the work** → **stream it**.

## 3. Goals / Non-goals

**Goals**
- Determinate progress bar on Step 2, advancing as each sheet's Drive read completes ("N of M sheets"), with a "Just read: \<name\>" status line.
- True real-time: events flush incrementally from the route as work happens.
- Preserve every existing scan outcome/error contract verbatim (completed / superseded / schema_missing / pre-run errors).

**Non-goals (out of scope)**
- No DB migration; no new `onboarding_scan_manifest` / `app_settings` columns.
- No advisory-lock topology change (no new DB writes anywhere).
- No new §12.4 error code (mid-run failure reuses the existing generic client fallback).
- No change to the scan's parsing/staging/locking behavior — purely additive observability + a response-encoding change.
- No progress for **other** scan callers (cron sync, single-file retry, wizard restage). `onProgress` is optional and only the Step-2 route supplies it.

## 4. Resolved decisions (single source of truth)

| # | Decision | Value |
|---|---|---|
| D1 | Wire format | NDJSON (one JSON object per line, `\n`-terminated), `Content-Type: application/x-ndjson` |
| D2 | Status-line content | running count + bar + "Just read: \<name of most-recently-completed sheet\>" |
| D3 | Prepare concurrency | unchanged: `ONBOARDING_PREPARE_CONCURRENCY = 12` |
| D4 | What drives the bar | the **prepare** phase (`done`/`total` of files); the stage phase shows "Finishing up…" |
| D5 | Terminal event body | `toScanResponseBody(result, ctx)` — byte-identical to today's response body |
| D6 | Pre-run errors (auth/url/folder/reserve) | unchanged: non-200 JSON `{ ok:false, code }`, **no stream opened** |
| D7 | Mid-run failure (after stream opens) | terminal event `{ type:"result", body:{ ok:false, code:null } }`; client shows the existing generic "couldn't reach Drive" copy. No new catalog code. |
| D8 | Route segment config | add `export const maxDuration = 300` |
| D9 | Empty folder | `total:0` → bar treated as complete; go straight to "Finishing up…" → success ("Found 0 items") |
| D10 | Name truncation | the "Just read" name is single-line, `truncate` (CSS ellipsis); no character cap in the data |
| D11 | Reduced motion | `prefers-reduced-motion` → bar width snaps (no transition); no other motion |

## 5. Architecture

```
Step2Verify (client)                 scan/route.ts (server)              runOnboardingScan (lib)
──────────────────                   ──────────────────────             ───────────────────────
POST {folderUrl}  ───────────────▶   auth / parseUrl / verifyFolder
                                     / reserveWizardSession
   (on !ok or application/json)  ◀──  non-200 JSON {ok:false,code}   (D6, unchanged)
                                          │ (all preconditions pass)
                                          ▼
   read NDJSON via                   new Response(ReadableStream,     onProgress(e) ─┐
   body.getReader()             ◀──  application/x-ndjson)            emits:         │
     • listed {total}                     emit = enqueue(JSON+"\n")   • listed ◀─ prepareOnboardingFiles after listFolder
     • prepared {done,total,name}         result = await runOnboardingScan(         • prepared ◀─ mapWithConcurrency onItemComplete
     • staging                              ..., { onProgress: emit })               • staging ◀─ scanPreparedFiles start
     • result {body}             ◀──    emit({type:"result",body:toScanResponseBody})
                                        catch → emit terminal {ok:false,code:null} (D7)
                                        finally → controller.close()
```

### 5.1 Unit: progress event contract — NEW `lib/onboarding/scanProgress.ts`

Single source of truth for the event union, imported by both the route (producer) and `Step2Verify` (consumer), mirroring how `scanResponse.ts` is shared (`lib/onboarding/scanResponse.ts:4-6`). Server/client drift becomes a compile error.

```ts
import type { OnboardingScanResponseBody } from "@/lib/onboarding/scanResponse";

export type ScanProgressEvent =
  | { type: "listed"; total: number }
  | { type: "prepared"; done: number; total: number; name: string }
  | { type: "staging" };

// What the client reads off the wire: progress events plus the terminal line.
export type ScanStreamMessage =
  | ScanProgressEvent
  | { type: "result"; body: OnboardingScanResponseBody };

export const SCAN_STREAM_CONTENT_TYPE = "application/x-ndjson";
```

- **Guard conditions:** `total` ≥ 0; `done` is 1..`total` and monotonically non-decreasing across `prepared` events (callback fires once per file); `name` is `DriveListedFile.name` (always present — used today at `runOnboardingScan.ts:471`), may be empty string for a degenerate file (render falls back to a neutral label, see §5.5).
- **Dependencies:** type-only import of `OnboardingScanResponseBody`.

### 5.2 Unit: `mapWithConcurrency` — add optional `onItemComplete` (`lib/async/mapWithConcurrency.ts`)

Current signature (`:17-21`): `mapWithConcurrency<T,R>(items, limit, fn): Promise<R[]>`. Add a 4th optional parameter:

```ts
onItemComplete?: (info: { index: number; done: number; total: number; item: T; result: R }) => void
```

- Maintain a shared `let completed = 0` in the closure. In the worker success path, right after `results[index] = await fn(items[index], index)` (`:38`), do `completed += 1` then call `onItemComplete?.({ index, done: completed, total: items.length, item, result })`. The increment + call have **no intervening `await`**, so `done` is race-free (same single-threaded-atomicity reasoning the file already documents for `nextIndex++`, `:31-33`).
- Wrap the callback invocation in its own `try { … } catch { /* ignore */ }` so a throwing callback **cannot** set `failed = true` and mask a real `fn` rejection (the existing fail-fast path is `:39-42`).
- Placement is **success-only** (after `fn` resolves). On a `fn` rejection the map is fail-fast (`:34,39-42`); we do not report progress for failed/abandoned items. (For the onboarding scan, `prepareOne` failures are infra faults that abort the whole scan, so partial progress on failure is moot.)
- **Backward compatibility:** the 2 production call sites — the import (`runOnboardingScan.ts:3`) and the single call (`:924`) — plus all 8 test invocations (`tests/async/mapWithConcurrency.test.ts:16,26,43,55,66,83-85`) use the 3-arg form. A trailing optional param changes nothing for them.
- **Guard conditions:** empty input → `workerCount = 0` (`:46`), no worker spawned, `onItemComplete` never fires, returns `[]`. Consumers must handle 0/0.
- Update the JSDoc contract block (`:1-16`) to document the new param and that **callback firing order is completion order, not input order** (`index` maps a completion back to its input slot).

### 5.3 Unit: `runOnboardingScan` — thread `onProgress` (`lib/sync/runOnboardingScan.ts`)

- Add `onProgress?: (e: ScanProgressEvent) => void` to `RunOnboardingScanDeps` (`:141-161`).
- `prepareOnboardingFiles` (`:891-925`): after `const files = await listFolder(folderId)` (`:896`), call `deps.onProgress?.({ type: "listed", total: files.length })`. Pass an `onItemComplete` to `mapWithConcurrency` (`:924`) that emits `{ type:"prepared", done, total, name: item.name }` — note the **`item`** (the `DriveListedFile`), not the prepared result, supplies the name (the result for a non-sheet has no separate name field; `item.name` always does).
- `scanPreparedFiles` (`:804-869`): emit `deps.onProgress?.({ type:"staging" })` once before the per-file loop (`:815`). Thread `onProgress` via the existing `deps` it already receives (`:808`).
- **Return type and all outcomes are unchanged.** Progress is additive and fires only when `onProgress` is supplied. The DB-backed outcome tests (e.g. `tests/onboarding/onboardingScanLiveRowConflictDb.test.ts`, `tests/sync/onboarding.test.ts`) assert on the `OnboardingScanResult` union and stay green.
- **Ordering guarantee for the client:** `listed` is emitted before any `prepared` (listing precedes the map); `staging` is emitted after prepare returns (prepare fully resolves before `scanPreparedFiles` runs, `:985-986`); the route appends `result` last. The `schema_missing` early return (`:980-981`) emits **no** progress events — the route still appends the terminal `result`, and the client handles a `result` arriving with no prior `listed`/`prepared` (§5.5).

### 5.4 Unit: scan route — stream the run phase (`app/api/admin/onboarding/scan/route.ts`)

- Add `export const maxDuration = 300;` (D8) and keep the existing Node runtime (the route already imports `node:crypto` + `postgres`, `:1-2`).
- `handleOnboardingScan` keeps its precondition order unchanged: `requireAdminIdentity` (`:207-216`) → `parseDriveFolderId` (`:219-220`) → `verifyFolder` (`:222-223`) → `reserveWizardSession` (`:225-233`). Each failure still returns the **current** non-200 JSON via `errorResponse` (D6). **No stream is opened on these paths** — auth/validation tests asserting HTTP status are unaffected.
- Replace only the final `NextResponse.json(toScanResponseBody(...))` (`:235-242`) with a streamed `Response`:

```ts
const encoder = new TextEncoder();
const stream = new ReadableStream<Uint8Array>({
  async start(controller) {
    const emit = (msg: ScanStreamMessage) =>
      controller.enqueue(encoder.encode(JSON.stringify(msg) + "\n"));
    try {
      const result = await runtime.runOnboardingScan(folder.folderId, wizardSessionId, {
        onProgress: emit, // ScanProgressEvent ⊂ ScanStreamMessage
      });
      emit({ type: "result", body: toScanResponseBody(result, {
        wizardSessionId, folderId: folder.folderId, folderName: folder.folderName,
      }) });
    } catch {
      emit({ type: "result", body: { ok: false, code: null } }); // D7
    } finally {
      controller.close();
    }
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

- **`ScanRouteDeps.runOnboardingScan` signature** (`:36`) gains the optional 3rd `deps` arg (it already matches `runOnboardingScan`'s real shape, which has `deps` as its 3rd param, `:974-978`) — injection for tests still works.
- **Producer drives to completion regardless of client back-pressure.** The scan runs inside `start()`; `controller.enqueue` of small text lines buffers in memory if the client reads slowly, so a stalled browser reader does not pause the scan or prolong the per-show advisory lock / DB connection beyond today's duration. (The lock is per-file and short; the reused connection is held for the scan body exactly as today, `:501-505,936`.)
- **Precedent:** three asset routes already return `new Response(readableStream, …)` (`app/api/asset/diagram/[show]/[rev]/[key]/route.ts:388-418`, `app/api/asset/reel/[show]/route.ts:579`, `app/api/asset/agenda/[show]/[id]/route.ts:546`). There is no `middleware.ts` buffering `/api/admin/**`, and `vercel.json` is only `{ "framework": "nextjs" }`.

### 5.5 Unit: `Step2Verify` — stream reader + determinate bar (UI; `components/admin/wizard/Step2Verify.tsx`)

UI code → Opus + impeccable v3 dual-gate (AGENTS.md invariant 8).

**State.** Extend `FormState.submitting` to carry progress sub-state:
```ts
| { kind: "submitting"; startedAt: number; folderUrl: string; progress: ScanProgress }
type ScanProgress =
  | { phase: "connecting" }                               // before `listed`
  | { phase: "reading"; done: number; total: number; lastName: string | null }
  | { phase: "finishing" }                                // after `staging`
```
`success` / `error` / `idle` unchanged. The `elapsedSeconds` interval logic (`:105-126`) is retained as secondary text.

**Fetch handling** (replaces `:134-176`):
1. POST `{folderUrl}` as today (request stays `Content-Type: application/json`, so the existing request-header test at `tests/components/admin/wizard/Step2Verify.test.tsx:89` holds).
2. If `!response.ok` **or** `Content-Type` is not `application/x-ndjson` → read `response.json()` and run **today's** body handling verbatim (covers D6 pre-run errors and is a safety net). The existing `outcome`/`ok:false`/`copyForCode` branches (`:141-168`) are reused.
3. Else stream: `const reader = response.body!.getReader()`, `TextDecoder`, line-buffer (split on `\n`, keep partial trailing line across reads). For each complete line, `JSON.parse` → dispatch `ScanStreamMessage`:
   - `listed` → `progress = { phase:"reading", done:0, total, lastName:null }`. If `total === 0` → `{ phase:"finishing" }` (D9).
   - `prepared` → `{ phase:"reading", done, total, lastName: name || null }`.
   - `staging` → `{ phase:"finishing" }`.
   - `result` → run today's outcome handling on `body`: `completed`→`setState(success)`; `superseded`→`setState(idle)` + `router.refresh()` (`:146-153`); `ok:false`/`schema_missing`→`setState(error, copyForCode(code))`. **`code:null` → generic fallback copy** (`copyForCode` already returns the generic string for unrecognized/missing codes, `:92-99`).
4. If the stream ends with **no** `result` message, or `fetch`/read throws, or `response.body` is null in the stream branch → today's generic error: `setState(error, "We could not reach Drive just now. Check your connection and try again.", code:null)` (`:169-175`).

**Rendered progress panel** (replaces `:254-268`). When `kind === "submitting"`:
- A native `<progress>` element (or `role="progressbar"`) with `aria-valuemin={0}`, `aria-valuemax={total}`, `aria-valuenow={done}` when `phase==="reading"`; **indeterminate** (no `value`) for `connecting`/`finishing`.
- Heading text by phase: `connecting`/`reading` → "Looking through your folder…"; `finishing` → "Finishing up…".
- The folder URL line (`:262`) retained.
- Count line, `reading` only: "**{done} of {total}** sheets" (tabular-nums).
- "Just read" line, `reading` + `lastName` non-null: "Just read: {lastName}" — single line, `truncate` (D10).
- Elapsed-seconds line retained as secondary muted text.

**Accessibility / motion:**
- Wrapper keeps `role="status" aria-live="polite"` (`:256-257`). To avoid screen-reader spam on every `prepared` tick, the **count/just-read** lines live in an `aria-hidden` visual region; a separate visually-hidden `aria-live="polite"` node announces **phase changes only** ("Looking through your folder", "Finishing up", and the final success/error already announced by their own `role`).
- `<progress>` bar fill animates via CSS `transition: width`; under `prefers-reduced-motion: reduce`, the transition is removed (snap) (D11).

**Dimensional Invariants** (Tailwind v4 here does not default `.flex` to `align-items: stretch` — [[feedback_tailwind_v4_flex_items_stretch]]):
- The progress panel is the existing bordered container (`:259`); it is height-`auto` (content-driven), no fixed-dimension parent constrains a flex/grid child here.
- The bar element spans the panel's content width: `w-full` on the `<progress>` (and its wrapper). The bar has a fixed height (e.g. `h-2`) set explicitly on the element; its parent does not impose a conflicting height.
- This component has **no fixed-height parent containing flex children**, so the only invariant to verify in a real browser is: the `<progress>` (and its fallback track/fill) renders at the panel's full content width and the documented fixed bar height. A Playwright assertion checks `progressEl.clientWidth === panelContentWidth` (±0.5px) and `progressEl.clientHeight === <bar-height>`.

**Transition Inventory.** Visual states: `idle`, `connecting`, `reading`, `finishing`, `success`, `error`. Treatments:

| From → To | Treatment |
|---|---|
| idle → connecting | instant (panel appears on submit) |
| connecting → reading | instant swap of heading + reveal of count line; bar goes indeterminate→determinate |
| reading → reading (done++) | bar `width` animates (CSS transition); count + "Just read" text swap instantly |
| reading → finishing | heading swaps to "Finishing up…"; bar → indeterminate (or held full); instant |
| connecting → finishing (empty folder, D9) | instant (skips reading) |
| reading/finishing → success | panel replaced by success summary (instant; today's behavior) |
| reading/finishing → error | panel replaced by error alert (instant; today's behavior) |
| any submitting → idle (superseded) | panel removed + `router.refresh()` (instant) |
| connecting → error (pre-run error via JSON branch) | instant |

Compound: a `result` arriving mid-`reading` (e.g. fast `schema_missing` or a superseded race) overrides the current `progress` immediately — the result branch always wins over a pending `prepared` (events are processed in stream order; once `result` is seen the reader loop ends).

## 6. Error handling (all paths)

| Failure | When | Behavior | HTTP |
|---|---|---|---|
| Not admin / session lookup | before stream | `errorResponse(403, ADMIN_FORBIDDEN)` / `(500, ADMIN_SESSION_LOOKUP_FAILED)` (`:209-216`) | 403/500 JSON |
| Malformed folder URL | before stream | `errorResponse(400, INVALID_FOLDER_URL)` (`:220`) | 400 JSON |
| Folder not shared/found/not-folder | before stream | `errorResponse(folder.status, folder.code)` (`:223`) | 403/404/400 JSON |
| schema_missing | in stream | terminal `result` with `{outcome:"schema_missing",code:WIZARD_ISOLATION_INDEXES_MISSING}` → client renders catalog copy | 200 NDJSON |
| superseded | in stream | terminal `result` with `{outcome:"superseded",…}` → client `router.refresh()` | 200 NDJSON |
| Mid-run infra throw (`OnboardingScanInfraError`, Drive throttle exhausted, DB fault) | in stream | terminal `result` `{ok:false,code:null}` (D7) → client generic copy + retry | 200 NDJSON |
| Network drop / function timeout mid-stream | in stream | reader ends with no `result` (or read throws) → client generic copy + retry | — |

**Invariant 5 (no raw error codes):** every client-rendered failure goes through `copyForCode` → `messageFor` (`:92-99`); `code:null` and unrecognized codes fall to the generic non-code copy. No raw `§12.4` code is shown. No new code is added.

## 7. Invariants & meta-tests

- **Invariant 1 (TDD per task):** every task is failing-test-first.
- **Invariant 5 (no raw error codes):** §6.
- **Invariant 8 (UI quality gate):** `Step2Verify.tsx` change runs `/impeccable critique` + `/impeccable audit`; HIGH/CRITICAL fixed or `DEFERRED.md`.
- **Invariant 9 (Supabase call-boundary):** N/A — no new Supabase client calls; the route's DB access is the existing `postgres.js` `withTx` reserve path, unchanged. (Declared, not silently skipped.)
- **Meta-test inventory:** none created or extended. No new auth helper, no new RPC-gated table, no new admin-alert catalog row, no new advisory-lock surface, no new tile sentinel. Declared "none applies."
- **Advisory-lock holder topology:** unchanged. The plan touches no `pg_advisory*` call; no new DB writes are added in the prepare phase (which is deliberately pre-lock); the stage phase's per-file lock acquisition (`:818-836`) is untouched. Declared.
- **Migration→validation parity:** N/A — no `supabase/migrations/**` change.

## 8. Testing plan (anti-tautology; each test names the failure mode it catches)

1. **`mapWithConcurrency` (`tests/async/mapWithConcurrency.test.ts`, extend):**
   - `onItemComplete` fires exactly once per item; `done` is strictly monotonic `1..N`; `total === items.length`. *Catches:* a callback that fires per-worker or double-counts.
   - When `onItemComplete` is omitted, results are byte-identical to the 3-arg form. *Catches:* a regression that makes the param non-optional or changes ordering.
   - A **throwing** `onItemComplete` does NOT reject the map and does NOT mask a real `fn` rejection. *Catches:* callback placed inside the fail-fast try without isolation.
   - Empty input → callback never fires, returns `[]`. *Catches:* a 0/0 crash.
2. **`runOnboardingScan` onProgress (new `tests/onboarding/scanProgressEvents.test.ts`):** with injected `listFolder`/`fetchMarkdownWithBinding`/`parseSheet`/`enrich` and a recording `onProgress`, assert the event sequence: one `listed{total:N}` (N derived from the injected file list length, **not** hardcoded), then N `prepared` with monotonic `done` and each `name` ∈ the injected file names, then `staging`. Assert the returned `OnboardingScanResult` is identical with and without `onProgress`. *Catches:* events that drift from the real file set, wrong total, or a behavior change when progress is enabled. Derive N from the fixture (anti-hardcode).
3. **scan route (`tests/onboarding/scanRoute.test.ts`, rewrite success path):**
   - Pre-run errors (auth/url/folder) still return non-200 JSON `{ok:false,code}`. *Catches:* accidentally streaming an error.
   - Success returns `Content-Type: application/x-ndjson`; reading the stream yields ≥1 `prepared` event and a terminal `result` whose `body` **equals `toScanResponseBody(injectedResult, ctx)`** (assert against the helper output, not the rendered totals — anti-tautology). *Catches:* terminal body drift from the canonical contract.
   - Mid-run throw → terminal `{type:"result",body:{ok:false,code:null}}`, status 200. *Catches:* an exception leaking as an empty 500.
4. **`scanResponse.test.ts`:** unchanged — reused as the terminal-body oracle.
5. **`Step2Verify` (`tests/components/admin/wizard/Step2Verify.test.tsx`, rewrite fetch mock):** mock `fetch` to return a `Response` with a `ReadableStream` body emitting `listed`→`prepared`→`prepared`→`result(completed)`; assert the bar's `aria-valuenow/max`, the "N of M" text, and the "Just read: \<name\>" line update, then the success summary renders. Separate cases: `result(superseded)`→`router.refresh()` called; `result(schema_missing)`→catalog copy; mid-stream end with no result→generic error; `total:0`→straight to success("Found 0 items"). Derive "N of M" from the emitted events (anti-hardcode). The request-header `Content-Type: application/json` assertion (`:89`) is retained. *Catches:* a reader that mis-parses NDJSON, drops the partial-line buffer, or fails the empty-folder path.
6. **Layout (real browser, Playwright or chrome-devtools `evaluate_script`):** with the panel in `reading` state, `getBoundingClientRect()` on the `<progress>` asserts `width === panel content width` (±0.5px) and `height === <bar-height>`. jsdom is insufficient. *Catches:* a collapsed/zero-width bar that unit tests miss.
7. **Transition audit:** enumerate the component's conditional renders / `<progress>` determinate↔indeterminate toggle per the §5.5 inventory; assert each transition is the declared treatment (animated width vs instant), including the compound `result`-mid-`reading` override.

## 9. Risks carried to close-out

- **Real-Vercel incremental flush.** Local + Docker green is necessary but not sufficient ([[feedback_byte_comparison_ci_gates_pin_capture_environment]] sibling lesson: local-passes/prod-differs). Verify on a real Vercel deploy that NDJSON bytes arrive incrementally (not buffered to the end) — manual close-out check; if buffered, confirm `X-Accel-Buffering: no` + `no-transform` are honored and the function is Fluid/Node (it is).
- **`main` requires 12 CI checks** ([[feedback_ci_pin_and_branch_protection]]) — real CI green on all 12 before merge, not just local.

## 10. Files

| File | Change |
|---|---|
| `lib/onboarding/scanProgress.ts` | NEW — event union + content-type const |
| `lib/async/mapWithConcurrency.ts` | add optional `onItemComplete` (+JSDoc) |
| `lib/sync/runOnboardingScan.ts` | add `onProgress` to deps; emit listed/prepared/staging |
| `app/api/admin/onboarding/scan/route.ts` | stream run phase; `maxDuration`; preconditions unchanged |
| `components/admin/wizard/Step2Verify.tsx` | stream reader + determinate bar + status line |
| `tests/async/mapWithConcurrency.test.ts` | extend |
| `tests/onboarding/scanProgressEvents.test.ts` | NEW |
| `tests/onboarding/scanRoute.test.ts` | rewrite success path for NDJSON |
| `tests/components/admin/wizard/Step2Verify.test.tsx` | rewrite fetch mock for streaming |

## 11. Watchpoints — do NOT relitigate (cite, don't re-derive)

These contracts are intentional. A reviewer should challenge whether they are *correctly implemented*, not whether they should exist.

- **Streaming over DB-polling.** The prepare phase (the dominant cost) does **zero** DB writes (`runOnboardingScan.ts:902-925`); a poller would show 0/N for the entire wait then snap. Streaming the working request is the only design that surfaces prepare-phase progress without adding writes to the deliberately pre-lock, side-effect-free phase (which would risk the advisory-lock topology). Decided in brainstorming; not reopened.
- **Mid-run failure is a terminal in-band event on a 200, not a 4xx/5xx.** Once the first NDJSON byte flushes, the HTTP status is committed. **Pre-run** errors (auth/url/folder/reserve) keep their real status because they run before the stream opens (§6, D6). This split is the whole point of ordering preconditions ahead of `runOnboardingScan`.
- **No new §12.4 catalog code.** Mid-run failures reuse `code:null` → the existing generic client copy (`copyForCode`, `Step2Verify.tsx:92-99`). Adding a code would trigger the §12.4 three-lockstep (spec prose + `gen:spec-codes` + `catalog.ts`, enforced by the x1 gate) for zero user benefit.
- **`onItemComplete` reports success only.** `mapWithConcurrency` is fail-fast; a `prepareOne` failure aborts the whole scan (infra fault), so per-item progress on failure is moot. The callback is isolated in its own try/catch so it cannot mask a real rejection.
- **`maxDuration = 300` is a new pattern for this repo** (no existing `export const maxDuration` in `app/`). Intentional — a streamed scan holds the function open for the scan's duration; 300s is the platform default ceiling and covers worst-case multi-file folders.
- **Return type of `runOnboardingScan` is unchanged.** Progress is additive (`onProgress` optional); the DB outcome tests are the regression guard that behavior did not change.

**Genuinely open (not a relitigation):** real-Vercel incremental flush is verifiable only on a deploy (§9) — this is a close-out gate, not a spec ambiguity.
