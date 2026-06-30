# Observability Phase 4 (console.* migration + no-console rule) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Migrate runtime `console.*` to `lib/log` (server) + a `clientLog` bridge (client), and add a `no-console` eslint rule, completing the observability arc.

**Architecture:** Server `console.*`→`log.{error,warn,info}({source})`. Client: a thin `clientLog(level,source,msg,ctx?)` (console always; warn/error also POST to a generalized `/api/observe/client-error`); `TileErrorBoundary`→`captureBoundaryError(error,"tile",{componentStack,tileId})`. A `no-console:error` rule across app/lib/components with a 5-file exemption + a ts-morph meta-test.

**Spec:** `docs/superpowers/specs/2026-06-30-observability-console-migration-phase4-design.md` (APPROVED, 5 rounds).

## Global Constraints
- **No DB migration; no new §12.4 codes; no advisory locks; zero visual/DOM change.**
- `log.*` fields TOP-LEVEL (logger RESERVED = `{source,code,showId,driveFileId,requestId,actorHash,error,persist}`; rest → `app_events.context`). An `Error` → the reserved `error` field.
- **5-file no-console exemption (exact):** `scripts/**`, `tests/**`, `lib/log/logger.ts`, `lib/log/persist.ts`, `lib/observe/clientLog.ts`.
- **Finite endpoint `ALLOWED_SOURCES`:** `client.crew`, `client.admin`, `client.root`, `client.tile`, `client.realtime`.
- TDD per task; commit per task (`--no-verify`; trailers).
- **Impeccable v3 dual-gate RUNS at close-out** (invariant 8 is file-based; non-visual → trivial PASS).

---

### Task 1: `clientErrorTransport` (shared) + `clientLog`

**Files:** Create `lib/observe/clientErrorTransport.ts`, `lib/observe/clientLog.ts`; Test `tests/observe/clientLog.test.ts`.
**Interfaces — Produces:** `clientErrorTransport(input: { source: string; level: "warn"|"error"; message: string; stack?: string; componentStack?: string; digest?: string; tileId?: string }): void` (dedup+cap+keepalive POST, never throws). `clientLog(level: "warn"|"error"|"info"|"debug", source: string, message: string, context?: unknown): void`.

- [ ] **Step 1: failing test** `tests/observe/clientLog.test.ts` (`// @vitest-environment jsdom`):
```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { clientLog } from "@/lib/observe/clientLog";
import { __resetClientTransportDedupForTests } from "@/lib/observe/clientErrorTransport";

describe("clientLog", () => {
  beforeEach(() => {
    __resetClientTransportDedupForTests();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(null, { status: 202 }))));
  });
  afterEach(() => vi.unstubAllGlobals());

  test("warn → console.warn(msg,ctx) AND one POST body = exactly {source,level,message}", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    clientLog("warn", "client.realtime", "boom", { reason: "x" });
    expect(warn).toHaveBeenCalledWith("boom", { reason: "x" });
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    expect(f).toHaveBeenCalledTimes(1);
    const body = JSON.parse((f.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toEqual({ source: "client.realtime", level: "warn", message: "boom" }); // NO context mirrored
    warn.mockRestore();
  });
  test("info/debug → console only, NO POST", () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    clientLog("info", "client.realtime", "ok");
    expect(fetch as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });
  test("dedup: same (source,level,message) → one POST", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    clientLog("warn", "client.realtime", "same");
    clientLog("warn", "client.realtime", "same");
    clientLog("warn", "client.realtime", "different");
    expect(fetch as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(2);
  });
  test("fail-open: rejected fetch does not throw", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("net"))));
    expect(() => clientLog("error", "client.realtime", "x")).not.toThrow();
  });
});
```
- [ ] **Step 2: run → FAIL.**
- [ ] **Step 3: implement** `lib/observe/clientErrorTransport.ts`:
```ts
// Client-safe shared transport for the app_events mirror. NO server imports.
const seen = new Set<string>();
const CAPS = { message: 1000, stack: 8000, componentStack: 8000, digest: 200, url: 2000, tileId: 200 } as const;

export function __resetClientTransportDedupForTests(): void {
  seen.clear();
}

export function clientErrorTransport(input: {
  source: string;
  level: "warn" | "error";
  message: string;
  stack?: string;
  componentStack?: string;
  digest?: string;
  tileId?: string;
}): void {
  try {
    if (typeof fetch === "undefined") return;
    const message = input.message.slice(0, CAPS.message);
    const signature = `${input.source}|${input.level}|${message}|${(input.stack ?? "").slice(0, 200)}`;
    if (seen.has(signature)) return;
    seen.add(signature);
    const payload: Record<string, string> = { source: input.source, level: input.level, message };
    if (input.stack) payload.stack = input.stack.slice(0, CAPS.stack);
    if (input.componentStack) payload.componentStack = input.componentStack.slice(0, CAPS.componentStack);
    if (input.digest) payload.digest = input.digest.slice(0, CAPS.digest);
    if (input.tileId) payload.tileId = input.tileId.slice(0, CAPS.tileId);
    if (typeof location !== "undefined") payload.url = location.href.slice(0, CAPS.url);
    void fetch("/api/observe/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* fail-open */
  }
}
```
`lib/observe/clientLog.ts` (sanctioned console wrapper — exempt from no-console):
```ts
import { clientErrorTransport } from "@/lib/observe/clientErrorTransport";

// ALWAYS console (browser dev keeps the full structured context). warn/error ALSO mirror to
// app_events (level-gated, spec §0.4); info/debug are console-only. context is NEVER mirrored.
export function clientLog(
  level: "warn" | "error" | "info" | "debug",
  source: string,
  message: string,
  context?: unknown,
): void {
  // eslint-disable-next-line no-console -- this file IS the sanctioned console wrapper
  if (context === undefined) console[level](message);
  // eslint-disable-next-line no-console
  else console[level](message, context);
  if (level === "warn" || level === "error") {
    clientErrorTransport({ source, level, message });
  }
}
```
(Note: the file is also in the eslint exemption list, so the inline disables are belt-and-suspenders; keep them for clarity.)
- [ ] **Step 4: run → PASS.**
- [ ] **Step 5: commit** `feat(observe): clientErrorTransport + clientLog (console always; warn/error mirror)`

---

### Task 2: generalize `/api/observe/client-error` endpoint

**Files:** Modify `app/api/observe/client-error/route.ts`; Modify `tests/observe/clientErrorRoute.test.ts` (adapt P3 tests to the `{source,level}` shape).
**Interfaces — Produces:** handler accepting `{ source, level?, message, stack?, componentStack?, digest?, url?, tileId? }`.

- [ ] **Step 1: update the test** — replace `area`-based cases with: valid `{source:"client.realtime",level:"warn",message}` → 202 + `log.warn` with that source; `source` not in `ALLOWED_SOURCES` (`"evil"`,`"client.foo"`,`"client.realtime.x"`) → 400; `level:"info"`/`"debug"`/bad → 400; default `level` (omitted) → `error`; oversized message → truncate+202; `tileId` forwarded; **rate-cap keyed by source** (21st same-source → dropped + one warn); same-origin/content-type/null-body/fail-open(sync+async) unchanged. Run → FAIL.
- [ ] **Step 2: implement** — in `route.ts`: replace `const AREAS = new Set(["crew","admin","root"])` with:
```ts
const ALLOWED_SOURCES = new Set(["client.crew", "client.admin", "client.root", "client.tile", "client.realtime"]);
const CAPS = { message: 1000, stack: 8000, componentStack: 8000, digest: 200, url: 2000, tileId: 200 } as const;
```
After the same-origin + content-type + JSON-object guards (unchanged), replace the area validation + write with:
```ts
const source = body.source;
const level = body.level === undefined ? "error" : body.level;
const rawMessage = typeof body.message === "string" ? body.message.trim() : "";
if (typeof source !== "string" || !ALLOWED_SOURCES.has(source) || (level !== "warn" && level !== "error") || rawMessage === "") {
  return Response.json({ ok: false }, { status: 400 });
}
const gate = allow(source, Date.now()); // rate-key by source (was area)
if (!gate.ok) {
  if (gate.warn) {
    await runWithRequestContext({ requestId: deriveRequestId(req.headers) }, () =>
      safeLog(() => log.warn("client-error mirror rate cap hit", { source: "observe.client-error", capped: source })),
    );
  }
  return Response.json({ ok: true }, { status: 202 });
}
await runWithRequestContext({ requestId: deriveRequestId(req.headers) }, () =>
  safeLog(() =>
    log[level](rawMessage.slice(0, CAPS.message), {
      source,
      stack: cap(body.stack, CAPS.stack),
      componentStack: cap(body.componentStack, CAPS.componentStack),
      digest: cap(body.digest, CAPS.digest),
      url: cap(body.url, CAPS.url),
      tileId: cap(body.tileId, CAPS.tileId),
    }),
  ),
);
return Response.json({ ok: true }, { status: 202 });
```
(`allow`/`safeLog`/`cap` already exist from P3; `allow`'s param is now a source string — same Map logic. The `log[level]` is `log.warn` or `log.error`.)
- [ ] **Step 3: run → PASS.**
- [ ] **Step 4: commit** `feat(observe): generalize client-error endpoint to {source,level} with finite ALLOWED_SOURCES`

---

### Task 3: `reportClientError` + `captureBoundaryError` (use transport, +tile, +tileId/componentStack)

**Files:** Modify `lib/observe/reportClientError.ts`, `lib/observe/captureBoundaryError.ts`; Modify `tests/observe/reportClientError.test.ts`, `tests/observe/captureBoundaryError.test.ts`.

- [ ] **Step 1: update tests** — reportClientError: now POSTs `{source:"client.<area>", level:"error", message, …}` (assert source/level not `area`); accepts `tileId?` → forwarded. captureBoundaryError: `(error,"tile",{componentStack,tileId})` → `Sentry.captureException(error,{tags:{tileId}})` AND transport gets `source:"client.tile"`, `componentStack`, `tileId`; `(error,"crew")` (no extra) unchanged → `source:"client.crew"`, no tileId, `captureException(error, undefined)`. Run → FAIL.
- [ ] **Step 2: implement** — `reportClientError.ts`: change `Area` to `"crew"|"admin"|"root"|"tile"`, add `tileId?` to input, and route through the shared transport:
```ts
import { clientErrorTransport } from "@/lib/observe/clientErrorTransport";
type Area = "crew" | "admin" | "root" | "tile";
// keep toError + __resetReportDedupForTests (delegate the latter to the transport reset)
export function reportClientError(input: { error: unknown; area: Area; componentStack?: string; digest?: string; tileId?: string }): void {
  const { message, stack } = toError(input.error);
  clientErrorTransport({
    source: `client.${input.area}`,
    level: "error",
    message,
    ...(stack ? { stack } : {}),
    ...(input.componentStack ? { componentStack: input.componentStack } : {}),
    ...(input.digest ? { digest: input.digest } : {}),
    ...(input.tileId ? { tileId: input.tileId } : {}),
  });
}
```
(Drop the duplicated dedup/cap/fetch from reportClientError — now in the transport. `__resetReportDedupForTests` re-exports `__resetClientTransportDedupForTests`.)
`captureBoundaryError.ts`:
```ts
export function captureBoundaryError(
  error: unknown,
  area: "crew" | "admin" | "root" | "tile",
  extra?: { componentStack?: string; tileId?: string },
): void {
  try {
    Sentry.captureException(error, extra?.tileId ? { tags: { tileId: extra.tileId } } : undefined);
  } catch {
    /* ignore */
  }
  try {
    const digest =
      error && typeof (error as { digest?: unknown }).digest === "string"
        ? (error as { digest: string }).digest
        : undefined;
    reportClientError({
      error,
      area,
      ...(digest ? { digest } : {}),
      ...(extra?.componentStack ? { componentStack: extra.componentStack } : {}),
      ...(extra?.tileId ? { tileId: extra.tileId } : {}),
    });
  } catch {
    /* ignore */
  }
}
```
- [ ] **Step 3: run → PASS** (incl. the P3 boundary tests in tests/observe/globalError/crewError/adminErrorWiring — they call `(error,area)`, unchanged behavior; adapt any assertion that checked the old `area` POST field to the new `source`).
- [ ] **Step 4: commit** `refactor(observe): route reportClientError through the shared transport; captureBoundaryError +tile +tileId +componentStack`

---

### Task 4: `TileErrorBoundary` → `captureBoundaryError`

**Files:** Modify `components/shared/TileErrorBoundary.tsx`; Test `tests/observe/tileErrorBoundary.test.tsx`.

- [ ] **Step 1: failing test** — render a `<TileErrorBoundary tileId="t1">` around a throwing child; assert `captureBoundaryError` (mocked) called once with `(error, "tile", { componentStack: expect.any(String), tileId: "t1" })`; with no `tileId` prop → `tileId: "unknown"`; the fallback (`TileErrorFallback`) still renders. (jsdom; mock `@/lib/observe/captureBoundaryError`.)
- [ ] **Step 2: run → FAIL.**
- [ ] **Step 3: implement** — in `TileErrorBoundary.tsx` `componentDidCatch`, replace the `console.error(...)` with:
```ts
import { captureBoundaryError } from "@/lib/observe/captureBoundaryError";
// …
override componentDidCatch(error: Error, info: ErrorInfo) {
  captureBoundaryError(error, "tile", {
    ...(info.componentStack ? { componentStack: info.componentStack } : {}),
    tileId: this.props.tileId ?? "unknown",
  });
}
```
(`info.componentStack` is `string | null` → spread only when present, exactOptional-safe.)
- [ ] **Step 4: run → PASS.**
- [ ] **Step 5: commit** `feat(observe): TileErrorBoundary → captureBoundaryError (Sentry tag + mirror + componentStack)`

---

### Task 5: `ShowRealtimeBridge` → `clientLog` (15 sites, message-enriched)

**Files:** Modify `components/realtime/ShowRealtimeBridge.tsx`; Test `tests/observe/showRealtimeBridge.test.tsx` (assert the 4 `outcome: failed` migrations carry distinct reason-bearing messages — spec §3.2/§12.8).

- [ ] **Step 1: failing test** — mock `@/lib/observe/clientLog`; drive (or unit-extract) the renewal-failure paths; assert each mirrored warn calls `clientLog("warn","client.realtime", <distinct message>, <ctx>)` and that the 4 `JWT_RENEWED outcome: failed` calls have DISTINCT messages (reason folded). Minimal viable: assert the migrated source contains the exact enriched message strings (a source-grep test if driving the realtime stack is impractical). Run → FAIL.
- [ ] **Step 2: implement** — replace each `console.warn|info(...)` with `clientLog(...)`, `source: "client.realtime"`, FOLDING the `reason` into the message for the 4 generic `outcome: failed` sites:
  - L305 `console.warn("[ShowRealtimeBridge] version endpoint returned auth_denied; forcing refresh…", {status})` → `clientLog("warn","client.realtime","version endpoint returned auth_denied; forcing refresh",{status:result.status})`
  - L384 → `clientLog("warn","client.realtime","JWT renew outcome auth_denied — viewer session revoked; forcing refresh",{reason:"mint_auth_denied",status:mintResult.status})`
  - L391 → `clientLog("warn","client.realtime","BROADCAST_AUTH_FAILED — JWT renewal mint failed; will retry via bounded backoff")`
  - L400 → `clientLog("warn","client.realtime","JWT renew outcome failed (mint_failed)",{reason:"mint_failed"})`
  - L419 → `clientLog("warn","client.realtime","BROADCAST_AUTH_FAILED — setAuth threw during renewal",err)`
  - L423 → `clientLog("warn","client.realtime","JWT renew outcome failed (set_auth_threw)",{reason:"set_auth_threw",err})`
  - L494 → `clientLog("warn","client.realtime","subscription failed during renewal",err)`
  - L495 → `clientLog("warn","client.realtime","JWT renew outcome failed (subscribe_threw)",{reason:"subscribe_threw",err})`
  - L527 → `clientLog("warn","client.realtime","JWT renew outcome failed (readiness_failed)",{reason:"readiness_failed",err})`
  - L567 → `clientLog("info","client.realtime","JWT renew outcome success")` (console-only, no POST)
  - L650 → `clientLog("warn","client.realtime","unknown system event",unknownEvent)`
  - L690 → `clientLog("warn","client.realtime","subscription failed: initial JWT mint returned no token; falling back to no-op (no retry loop)",{reason})`
  - L701 → `clientLog("warn","client.realtime","subscription failed: setAuth threw",err)`
  - L732 → `clientLog("warn","client.realtime","subscription failed",err)`
  - L752 → `clientLog("warn","client.realtime","subscription readiness failed",err)`
  Keep the `[ShowRealtimeBridge]` semantics in the `source` (`client.realtime`); drop the bracket prefix from the message text (source carries it). Preserve every surrounding control-flow line (`return;`, comments, backoff resets) verbatim.
- [ ] **Step 3: run → PASS** + `pnpm typecheck`.
- [ ] **Step 4: commit** `feat(observe): ShowRealtimeBridge console.warn/info → clientLog(client.realtime), reason folded into message`

---

### Task 6: server `console.*` → `lib/log` (the §2 table, ~50 sites / ~26 files)

**Files:** the §2 spec table (app/auth, app/admin, app/api/**, lib/*, server components). Each: `console.error→log.error`, `warn→log.warn`, `log|info→log.info`, with the table's `source`; an `Error` 2nd arg → `{ error }`; a structured 2nd arg → named context fields; drop the `[bracket]` prefix (→ source). Import `{ log } from "@/lib/log"` once per file.
**Interfaces — Consumes:** `lib/log` (`log`).

> Implementation note: this is a mechanical 1:1 transform across ~26 files — fan out (a Workflow, one agent per file-cluster) at execution time; EACH migrated file ends with `pnpm typecheck` green for that file. The transform rule + per-file source come from the spec §2 table. Server components/actions have no ALS → `requestId: null` (graceful); do NOT add `runWithRequestContext`.

- [ ] **Step 1: failing spot-test** (`tests/observe/serverMigrationSpot.test.ts`) — for a representative route (`app/api/admin/sync/[slug]/route.ts`), mock `@/lib/log` and exercise its error path; assert `log.error` called with `source: "api.admin.sync"` and the `Error` in the reserved `error` field; HTTP response unchanged. Run → FAIL (until migrated).
- [ ] **Step 2: migrate** all §2-table files per the rule. (Workflow fan-out; commit logically — e.g. per area: `app/api`, `lib`, `server components`, `app/auth+admin`.) After each cluster: `pnpm typecheck` green.
- [ ] **Step 3: run the spot-test → PASS;** `pnpm typecheck` 0.
- [ ] **Step 4: commit** per cluster, e.g. `refactor(log): migrate app/api console.* → lib/log` / `…lib/* …` / `…server components …` / `…app auth+admin …`

---

### Task 7: `no-console` eslint rule + 5-file exemption

**Files:** Modify `eslint.config.mjs`.

- [ ] **Step 1: implement** — add `"no-console": "error"` to the main rules block (`eslint.config.mjs:53`, the `files:["**/*.{ts,tsx,…}"]` block), and add an override block BEFORE `prettier`:
```js
{
  files: ["scripts/**", "tests/**", "lib/log/logger.ts", "lib/log/persist.ts", "lib/observe/clientLog.ts"],
  rules: { "no-console": "off" },
},
```
- [ ] **Step 2: verify** — `pnpm lint` → 0 errors (all runtime console.* now migrated; the 5 exempt surfaces pass). Plant a `console.log("x")` in `app/admin/actions.ts`, run `pnpm lint` → it ERRORS; remove it. Plant one in `scripts/seed-m12-catalog-fields.ts` → NOT flagged.
- [ ] **Step 3: commit** `feat(lint): no-console error across app/lib/components (5-file exemption)`

---

### Task 8: no-console exemption meta-test (ts-morph)

**Files:** Create `tests/cross-cutting/no-console-exemptions.test.ts`.

- [ ] **Step 1: failing test** — (a) read `eslint.config.mjs`, assert the override `files` array equals exactly `["scripts/**","tests/**","lib/log/logger.ts","lib/log/persist.ts","lib/observe/clientLog.ts"]`; (b) a `ts-morph` `Project` over `app/`+`lib/`+`components/` (excluding the 5 exempt + `.next`), walk `CallExpression`s whose callee text matches `/^console\.(log|warn|error|info|debug)$/`, assert `[]` (comments/strings ignored by AST). Negative-control comment in the test asserts a `// console.log` line in a fixture string is NOT matched but a real call IS. (Mirror the ts-morph setup in `lib/audit/noGlobalCursor.ts`.)
- [ ] **Step 2: run → FAIL if any stray remains; then PASS** after Tasks 4-6.
- [ ] **Step 3: commit** `test(cross-cutting): no-console exemption registry + AST no-stray-console walk`

---

### Task 9: full suite + typecheck + lint + format

- [ ] `pnpm typecheck` 0; `pnpm prettier --write .` + `pnpm format:check` clean; `pnpm lint` 0; `pnpm test` (full) — only the known env-only failures (`test-auth-gate`, `email-canonicalization`, `pg-cron-coverage`); triage any other vs merge-base. Commit any fixups.

### Task 10: impeccable v3 dual-gate + whole-diff Codex review

- [ ] **Impeccable** (invariant 8) — `/impeccable critique`+`/impeccable audit` on the touched UI files (ShowRealtimeBridge, TileErrorBoundary, the migrated server components) via a fresh attestation. Non-visual → expected PASS; record any HIGH/CRITICAL.
- [ ] **Whole-diff Codex review** to APPROVE (fresh-eyes; do-not-relitigate the spec §0/§6 + the ratified decisions).

### Task 11: Execution handoff
- [ ] Push → PR → real CI green (the new `no-console` job must be green) → `gh pr merge --merge` → fast-forward main (`0 0`).

---

## Meta-test inventory
- **no-console exemption registry (NEW):** Task 8 — exact 5-file set + AST no-stray-console walk.
- **Supabase call-boundary / advisory-lock / §12.4:** N/A (no new Supabase call, no locks, no codes). Declared.
