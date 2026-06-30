# Observability Phase 3 (Sentry + client-error capture) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Wire Sentry (`@sentry/nextjs`) for all client+server error capture AND mirror React error-boundary crashes into `app_events` (visible on the Phase 2 `/admin/observability` page), with new global + crew error boundaries.

**Architecture:** Two independent paths. (1) Sentry SDK auto-instruments via `instrumentation.ts` + `instrumentation-client.ts` + `withSentryConfig`; no-op when DSN unset. (2) A best-effort in-house mirror: error boundaries call a guarded `captureBoundaryError` → `reportClientError` POSTs to a public, same-origin-guarded `/api/observe/client-error` → `lib/log.error` → `app_events`. No DB migration.

**Tech Stack:** Next.js 16 (App Router), `@sentry/nextjs ^10.51.0` (pinned), Supabase service-role (via `lib/log`), Tailwind v4, vitest.

**Spec:** `docs/superpowers/specs/2026-06-30-observability-sentry-phase3-design.md` (APPROVED, 4 adversarial rounds).

## Global Constraints

- **No DB migration** — `app_events` reused (spec §0.3).
- **DSN-unset ⇒ no-op** — every `Sentry.init` passes `enabled: Boolean(<dsn>)`; `pnpm build` (= `node scripts/with-admin-dev-flag.mjs next build`) MUST succeed with no `SENTRY_*` set (CI has none) (spec §0.6/§8).
- **Fail-open mirror** — the reporter, the boundary helper, and the endpoint never throw into render and never return 5xx (spec §0.5).
- **Mirror scope = boundary crashes only** (spec §0.2). `window.onerror`/`unhandledrejection` → Sentry only.
- **No raw error codes in UI** — boundary fallbacks render catalog COPY via `lib/messages/lookup` (invariant 5). Crew/global use `crewFacing`; admin uses `dougFacing`.
- **`log.error` fields are TOP-LEVEL** (not nested under `context:`) — `RESERVED = {source,code,showId,driveFileId,requestId,actorHash,error,persist}` (`lib/log/logger.ts:27-50`); everything else spreads into `app_events.context`.
- **TDD per task; commit per task** (conventional commits, `--no-verify`, trailers).
- **UI files** (`app/global-error.tsx`, `app/show/[slug]/[shareToken]/error.tsx`, the 3 admin `error.tsx`) → impeccable v3 dual-gate at close-out (Task 14).
- **`.tsx` tests** need `// @vitest-environment jsdom` + `import "@testing-library/jest-dom/vitest";` + `afterEach(cleanup)` (repo default env is `node`, `globals:false`).

---

### Task 1: `parseSampleRate` helper (pure)

**Files:** Create `lib/observe/parseSampleRate.ts`; Test `tests/observe/parseSampleRate.test.ts`.
**Interfaces — Produces:** `parseSampleRate(raw: string | undefined): number` — `0` for undefined/empty/NaN/negative; clamps `>1` → `1`; else the parsed float. Consumed by the Sentry server/edge config (Task 7).

- [ ] **Step 1: failing test** — `tests/observe/parseSampleRate.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { parseSampleRate } from "@/lib/observe/parseSampleRate";

describe("parseSampleRate", () => {
  test("undefined/empty/non-numeric/negative → 0", () => {
    for (const v of [undefined, "", "  ", "abc", "-1", "-0.5", "NaN"]) {
      expect(parseSampleRate(v)).toBe(0);
    }
  });
  test("> 1 clamps to 1", () => {
    expect(parseSampleRate("2")).toBe(1);
    expect(parseSampleRate("1.5")).toBe(1);
  });
  test("in-range passes through", () => {
    expect(parseSampleRate("0")).toBe(0);
    expect(parseSampleRate("0.1")).toBe(0.1);
    expect(parseSampleRate("1")).toBe(1);
  });
});
```
- [ ] **Step 2: run → FAIL** `pnpm vitest run tests/observe/parseSampleRate.test.ts` (module not found).
- [ ] **Step 3: implement** `lib/observe/parseSampleRate.ts`:
```ts
// Clamp a Sentry sample-rate env value into [0,1]; any malformed input → 0 (errors-only).
export function parseSampleRate(raw: string | undefined): number {
  if (raw == null || raw.trim() === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n > 1 ? 1 : n;
}
```
- [ ] **Step 4: run → PASS.**
- [ ] **Step 5: commit** `feat(observe): parseSampleRate clamp helper for Sentry trace rate`

---

### Task 2: `getRequiredCrewFacing` lookup helper

**Files:** Modify `lib/messages/lookup.ts` (add after `getRequiredDougFacing`, ~line 130); Test `tests/messages/getRequiredCrewFacing.test.ts`.
**Interfaces — Produces:** `getRequiredCrewFacing(code: MessageCode, params?: MessageParams): string` — returns `crewFacing`, throws if null. Consumed by the crew + global boundaries (Tasks 9, 10).

- [ ] **Step 1: failing test** — pick one existing crew-only code (`GOOGLE_NO_CREW_MATCH`, `crewFacing` set, `dougFacing` null) and one Doug-only code to prove the throw:
```ts
import { describe, expect, test } from "vitest";
import { getRequiredCrewFacing } from "@/lib/messages/lookup";

describe("getRequiredCrewFacing", () => {
  test("returns crewFacing copy when present", () => {
    expect(getRequiredCrewFacing("GOOGLE_NO_CREW_MATCH")).toMatch(/crew list/i);
  });
  test("throws when crewFacing is null", () => {
    // ADMIN_ROUTE_LOAD_FAILED has dougFacing copy but crewFacing null
    expect(() => getRequiredCrewFacing("ADMIN_ROUTE_LOAD_FAILED")).toThrow(/no Crew-facing copy/);
  });
});
```
- [ ] **Step 2: run → FAIL** (export missing). (If `ADMIN_ROUTE_LOAD_FAILED.crewFacing` is NOT null, substitute any `crewFacing:null` code found via `grep -n 'crewFacing: null' lib/messages/catalog.ts | head`.)
- [ ] **Step 3: implement** — add to `lib/messages/lookup.ts` (mirror of `getRequiredDougFacing` at line 124):
```ts
export function getRequiredCrewFacing(code: MessageCode, params?: MessageParams): string {
  const value = getCrewFacing(code, params);
  if (value === null) {
    throw new Error(`getRequiredCrewFacing: code ${code} has no Crew-facing copy`);
  }
  return value;
}
```
- [ ] **Step 4: run → PASS.**
- [ ] **Step 5: commit** `feat(messages): getRequiredCrewFacing (mirror of getRequiredDougFacing)`

---

### Task 3: `PAGE_RENDER_FAILED` §12.4 code (three-way lockstep)

**Files:** Modify `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§12.4 table); run `pnpm gen:spec-codes` → regenerates `lib/messages/__generated__/spec-codes.ts`; Modify `lib/messages/catalog.ts` (add `PAGE_RENDER_FAILED` row). Test: existing `tests/cross-cutting/codes.test.ts` (x1 parity) must pass.
**Interfaces — Produces:** `MessageCode` `"PAGE_RENDER_FAILED"` with `crewFacing` copy, `dougFacing: null`. Consumed by Tasks 9, 10.

- [ ] **Step 1:** add the §12.4 row to the master spec (match the existing row format, e.g. line ~2791). Columns: `| PAGE_RENDER_FAILED | client error boundary tripped (render crash) | (none) | This page ran into a problem. Try reloading — if it keeps happening, text Doug. | Crew → reload |`. (dougFacing column empty/`—` since null.)
- [ ] **Step 2: run → RED** `pnpm gen:spec-codes && pnpm vitest run tests/cross-cutting/codes.test.ts` — x1-catalog-parity FAILS (the §12.4 prose now declares `PAGE_RENDER_FAILED` but the runtime `catalog.ts` has no such row). This is the failing test driving the catalog.
- [ ] **Step 3:** add the catalog row to `lib/messages/catalog.ts` (match `GOOGLE_NO_CREW_MATCH` format):
```ts
PAGE_RENDER_FAILED: {
  code: "PAGE_RENDER_FAILED",
  dougFacing: null,
  crewFacing: "This page ran into a problem. Try reloading — if it keeps happening, text Doug.",
  followUp: "Crew → reload",
  helpfulContext: null,
  title: null,
  longExplanation: null,
  helpHref: null,
},
```
(Insert alphabetically/where peers sit; match exact field order + trailing comma.)
- [ ] **Step 4: run → GREEN** `pnpm vitest run tests/cross-cutting/codes.test.ts` (x1-catalog-parity) → PASS (the three layers now agree). Also `pnpm gen:internal-code-enums` then `pnpm vitest run tests/cross-cutting/no-raw-codes.test.ts` → PASS.
- [ ] **Step 5: commit** `feat(messages): PAGE_RENDER_FAILED crew-facing code (spec §12.4 + gen + catalog lockstep)` — stage the spec, the generated file, AND catalog.ts together.

---

### Task 4: `reportClientError` client reporter

**Files:** Create `lib/observe/reportClientError.ts`; Test `tests/observe/reportClientError.test.ts`.
**Interfaces — Produces:** `reportClientError(input: { error: unknown; area: "crew" | "admin" | "root"; componentStack?: string; digest?: string }): void` — dedups per signature, POSTs `{area,message,stack,componentStack,digest,url}` to `/api/observe/client-error`, never throws. Consumed by `captureBoundaryError` (Task 5).

- [ ] **Step 1: failing test** (`// @vitest-environment jsdom`):
```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { reportClientError, __resetReportDedupForTests } from "@/lib/observe/reportClientError";

describe("reportClientError", () => {
  beforeEach(() => {
    __resetReportDedupForTests();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(null, { status: 202 }))));
  });
  afterEach(() => vi.unstubAllGlobals());

  test("POSTs once with area+message+stack to the endpoint", () => {
    reportClientError({ error: new Error("boom"), area: "crew" });
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("/api/observe/client-error");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ area: "crew", message: "boom" });
    expect(typeof body.stack).toBe("string");
    expect((init as RequestInit).keepalive).toBe(true);
  });
  test("dedups identical signatures (one POST), different signatures (two)", () => {
    // SAME instance twice → identical message+stack → one signature → one POST. (Two separate
    // `new Error("boom")` would have different `.stack` line numbers and wrongly dedup-miss.)
    const e = new Error("boom");
    reportClientError({ error: e, area: "crew" });
    reportClientError({ error: e, area: "crew" });
    reportClientError({ error: new Error("other"), area: "crew" });
    expect((fetch as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2);
  });
  test("empty message → '(no message)'", () => {
    reportClientError({ error: new Error(""), area: "admin" });
    const body = JSON.parse(((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit).body as string);
    expect(body.message).toBe("(no message)");
  });
  test("client-side caps: oversized message/stack truncated BEFORE the POST (≤ 1000 / 8000)", () => {
    const err = Object.assign(new Error("m".repeat(5000)), { stack: "s".repeat(20000) });
    reportClientError({ error: err, area: "crew" });
    const body = JSON.parse(((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit).body as string);
    expect(body.message.length).toBe(1000);
    expect(body.stack.length).toBe(8000);
  });
  test("fail-open: rejected fetch does NOT throw", () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network"))));
    expect(() => reportClientError({ error: new Error("x"), area: "root" })).not.toThrow();
  });
});
```
- [ ] **Step 2: run → FAIL.**
- [ ] **Step 3: implement** `lib/observe/reportClientError.ts`:
```ts
// Client-safe. NO server imports. Best-effort mirror of boundary crashes to /api/observe/client-error.
type Area = "crew" | "admin" | "root";
const seen = new Set<string>();
// Client-side caps mirror the server caps (spec §3) so we never send oversized bodies on the wire.
const CAPS = { message: 1000, stack: 8000, componentStack: 8000, digest: 200, url: 2000 } as const;

function toError(e: unknown): { message: string; stack?: string } {
  if (e instanceof Error) return { message: e.message || "(no message)", stack: e.stack };
  return { message: String(e) || "(no message)" };
}

export function __resetReportDedupForTests(): void {
  seen.clear();
}

export function reportClientError(input: {
  error: unknown;
  area: Area;
  componentStack?: string;
  digest?: string;
}): void {
  try {
    if (typeof fetch === "undefined") return;
    const { message, stack } = toError(input.error);
    const signature = `${input.area}|${message}|${(stack ?? "").slice(0, 200)}`;
    if (seen.has(signature)) return;
    seen.add(signature);
    const payload: Record<string, string> = { area: input.area, message: message.slice(0, CAPS.message) };
    if (stack) payload.stack = stack.slice(0, CAPS.stack);
    if (input.componentStack) payload.componentStack = input.componentStack.slice(0, CAPS.componentStack);
    if (input.digest) payload.digest = input.digest.slice(0, CAPS.digest);
    if (typeof location !== "undefined") payload.url = location.href.slice(0, CAPS.url);
    void fetch("/api/observe/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* fail-open: never throw into a boundary effect */
  }
}
```
- [ ] **Step 4: run → PASS.**
- [ ] **Step 5: commit** `feat(observe): reportClientError (dedup + fail-open client reporter)`

---

### Task 5: `captureBoundaryError` dual-capture guard

**Files:** Create `lib/observe/captureBoundaryError.ts`; Test `tests/observe/captureBoundaryError.test.ts`.
**Interfaces — Consumes:** `reportClientError` (Task 4), `@sentry/nextjs`. **Produces:** `captureBoundaryError(error: unknown, area: "crew"|"admin"|"root"): void` — derives the Next `error.digest` internally (App Router `error.tsx` boundaries receive only `{error, reset}` — NO `componentStack`); each capture in its OWN try/catch; one throwing never blocks the other; never throws. Consumed by all boundaries (Tasks 9-11). (Deriving digest internally also avoids the `exactOptionalPropertyTypes` friction of passing `{ digest: error.digest }` where `error.digest` is `string | undefined`.)

- [ ] **Step 1: failing test** (mock both `@sentry/nextjs` and the reporter):
```ts
import { afterEach, describe, expect, test, vi } from "vitest";
const h = vi.hoisted(() => ({ captureException: vi.fn(), reportClientError: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: h.captureException }));
vi.mock("@/lib/observe/reportClientError", () => ({ reportClientError: h.reportClientError }));
import { captureBoundaryError } from "@/lib/observe/captureBoundaryError";
const { captureException, reportClientError } = h;

afterEach(() => { captureException.mockReset(); reportClientError.mockReset(); });

describe("captureBoundaryError", () => {
  test("calls BOTH Sentry and the mirror with area + derived digest", () => {
    const err = Object.assign(new Error("x"), { digest: "d1" });
    captureBoundaryError(err, "crew");
    expect(captureException).toHaveBeenCalledWith(err);
    expect(reportClientError).toHaveBeenCalledWith(expect.objectContaining({ error: err, area: "crew", digest: "d1" }));
  });
  test("Sentry throwing does NOT block the mirror (and never throws)", () => {
    captureException.mockImplementation(() => { throw new Error("sentry down"); });
    expect(() => captureBoundaryError(new Error("x"), "admin")).not.toThrow();
    expect(reportClientError).toHaveBeenCalledTimes(1);
  });
  test("mirror throwing does NOT block Sentry (and never throws)", () => {
    reportClientError.mockImplementation(() => { throw new Error("mirror down"); });
    expect(() => captureBoundaryError(new Error("x"), "root")).not.toThrow();
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
```
- [ ] **Step 2: run → FAIL.**
- [ ] **Step 3: implement** `lib/observe/captureBoundaryError.ts`:
```ts
import * as Sentry from "@sentry/nextjs";
import { reportClientError } from "@/lib/observe/reportClientError";

// The single guarded entry point every error boundary calls. Sentry + the app_events mirror are
// captured INDEPENDENTLY (each in its own try/catch) so one failing never blocks the other or
// re-crashes the boundary effect.
export function captureBoundaryError(error: unknown, area: "crew" | "admin" | "root"): void {
  try {
    Sentry.captureException(error);
  } catch {
    /* ignore */
  }
  try {
    const digest =
      error && typeof (error as { digest?: unknown }).digest === "string"
        ? (error as { digest: string }).digest
        : undefined;
    // Build the input WITHOUT a `digest: undefined` key (exactOptionalPropertyTypes).
    reportClientError(digest ? { error, area, digest } : { error, area });
  } catch {
    /* ignore */
  }
}
```
- [ ] **Step 4: run → PASS.**
- [ ] **Step 5: commit** `feat(observe): captureBoundaryError dual-capture guard (Sentry + mirror, independently guarded)`

---

### Task 6: mirror endpoint `/api/observe/client-error` + trust-domain registration

**Files:** Create `app/api/observe/client-error/route.ts`; Modify `lib/audit/trustDomains.ts` (`PROTECTED_ROUTES`); Test `tests/observe/clientErrorRoute.test.ts`. Verify `tests/cross-cutting/auth-chain-audit.test.ts` passes.
**Interfaces — Consumes:** `lib/log` (`log`), `lib/log/requestContext` (`runWithRequestContext`, `deriveRequestId`). **Produces:** `POST(req: Request): Promise<Response>` + an exported testable `handleClientError(req: Request): Promise<Response>`.

**TDD order:** the route's unit test drives the handler; the auth-chain-audit (existing) drives the registration (red while the route exists but is unclassified → green once registered).

- [ ] **Step 1: failing test** `tests/observe/clientErrorRoute.test.ts` — mock `@/lib/log`:
```ts
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
const h = vi.hoisted(() => ({ logError: vi.fn(), logWarn: vi.fn() }));
vi.mock("@/lib/log", () => ({ log: { error: h.logError, warn: h.logWarn, info: vi.fn(), debug: vi.fn() } }));
import { handleClientError, __resetClientErrorStateForTests } from "@/app/api/observe/client-error/route";

// Default headers = same-origin browser fetch (content-type json + Sec-Fetch-Site same-origin).
function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://x/api/observe/client-error", {
    method: "POST",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
beforeEach(() => { h.logError.mockReset(); h.logWarn.mockReset(); __resetClientErrorStateForTests(); });

describe("client-error endpoint", () => {
  test("valid same-origin POST → 202 + one log.error, source=client.<area>, no code, fields top-level", async () => {
    const r = await handleClientError(req({ area: "crew", message: "boom", stack: "S", url: "u" }));
    expect(r.status).toBe(202);
    expect(h.logError).toHaveBeenCalledTimes(1);
    const [msg, fields] = h.logError.mock.calls[0]!;
    expect(msg).toBe("boom");
    expect(fields).toMatchObject({ source: "client.crew", stack: "S", url: "u" });
    expect(fields.code).toBeUndefined();
    expect(fields.context).toBeUndefined(); // fields are TOP-LEVEL, not nested
  });
  test("structural-invalid → 400 (no write): unknown area, empty message, malformed JSON, null/array/primitive JSON", async () => {
    for (const b of [{ area: "nope", message: "x" }, { area: "crew", message: "   " }, "{not json", "null", "[]", "42"]) {
      expect((await handleClientError(req(b))).status).toBe(400);
    }
    expect(h.logError).not.toHaveBeenCalled();
  });
  test("oversized message → 202 + TRUNCATED write (not 400)", async () => {
    const r = await handleClientError(req({ area: "admin", message: "x".repeat(5000) }));
    expect(r.status).toBe(202);
    expect((h.logError.mock.calls[0]![0] as string).length).toBe(1000);
  });
  test("content-type not json → 400 (no write)", async () => {
    const r = await handleClientError(req({ area: "crew", message: "boom" }, { "content-type": "text/plain" }));
    expect(r.status).toBe(400);
    expect(h.logError).not.toHaveBeenCalled();
  });
  test("same-origin guard: cross-site → 403; Sec-Fetch-Site absent + foreign Origin → 403; absent + matching Origin → 202", async () => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://app.example";
    // cross-site (Sec-Fetch-Site present) → 403
    expect((await handleClientError(req({ area: "crew", message: "b" }, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
    // Sec-Fetch-Site ABSENT + foreign Origin → 403 (override default by passing empty sec-fetch-site is not possible; build a bespoke Request)
    const foreign = new Request("https://x", { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: JSON.stringify({ area: "crew", message: "b" }) });
    expect((await handleClientError(foreign)).status).toBe(403);
    // Sec-Fetch-Site ABSENT + matching Origin → 202
    const ok = new Request("https://x", { method: "POST", headers: { "content-type": "application/json", origin: "https://app.example" }, body: JSON.stringify({ area: "crew", message: "b" }) });
    expect((await handleClientError(ok)).status).toBe(202);
    expect(h.logError).toHaveBeenCalledTimes(1); // only the matching-origin one wrote
  });
  test("rate backstop: 21st in-window call DROPPED (202, no extra error write) + warns ONCE", async () => {
    for (let i = 0; i < 20; i++) await handleClientError(req({ area: "crew", message: `m${i}` }));
    expect(h.logError).toHaveBeenCalledTimes(20);
    const r = await handleClientError(req({ area: "crew", message: "m20" }));
    expect(r.status).toBe(202);
    expect(h.logError).toHaveBeenCalledTimes(20); // dropped — no 21st error write
    expect(h.logWarn).toHaveBeenCalledTimes(1); // rate cap "logged once" (spec §3)
    await handleClientError(req({ area: "crew", message: "m21" })); // also dropped
    expect(h.logWarn).toHaveBeenCalledTimes(1); // still once this window
  });
  test("fail-open: log.error throws SYNC → still 202 (never 5xx)", async () => {
    h.logError.mockImplementation(() => { throw new Error("sink down"); });
    expect((await handleClientError(req({ area: "root", message: "boom" }))).status).toBe(202);
  });
  test("fail-open: log.error returns a REJECTED promise → still 202 (awaited rejection swallowed)", async () => {
    h.logError.mockReturnValue(Promise.reject(new Error("persist rejected")));
    expect((await handleClientError(req({ area: "root", message: "boom" }))).status).toBe(202);
  });
});
```
- [ ] **Step 2: run → FAIL** (route module not found).
- [ ] **Step 3: implement** `app/api/observe/client-error/route.ts`:
```ts
import { log } from "@/lib/log";
import { runWithRequestContext, deriveRequestId } from "@/lib/log/requestContext";

const AREAS = new Set(["crew", "admin", "root"]);
const CAPS = { message: 1000, stack: 8000, componentStack: 8000, digest: 200, url: 2000 } as const;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const counters = new Map<string, { count: number; resetAt: number; warned: boolean }>();

export function __resetClientErrorStateForTests(): void {
  counters.clear();
}

// Swallow BOTH sync throws and async rejections from the best-effort log sink (log.* returns the
// emit promise, lib/log/logger.ts:82). Awaited so the route never returns before the write resolves
// AND a rejected persist can never become an unhandled rejection (spec §0.5 fail-open).
async function safeLog(fn: () => unknown): Promise<void> {
  try {
    await fn();
  } catch {
    /* ignore */
  }
}

function sameOrigin(req: Request): boolean {
  const sfs = req.headers.get("sec-fetch-site");
  if (sfs) return sfs === "same-origin";
  const origin = req.headers.get("origin");
  const site = process.env.NEXT_PUBLIC_SITE_ORIGIN;
  return Boolean(origin && site && origin === site);
}

function cap(v: unknown, n: number): string | undefined {
  return typeof v === "string" && v.length > 0 ? v.slice(0, n) : undefined;
}

// Best-effort per-instance backstop. Returns { ok } and, on the FIRST drop of a window, { warn:true }
// so the caller emits exactly ONE rate-cap warning per window per area (spec §3 "logged once").
function allow(area: string, now: number): { ok: boolean; warn: boolean } {
  const c = counters.get(area);
  if (!c || now >= c.resetAt) {
    counters.set(area, { count: 1, resetAt: now + WINDOW_MS, warned: false });
    return { ok: true, warn: false };
  }
  if (c.count >= MAX_PER_WINDOW) {
    const warn = !c.warned;
    c.warned = true;
    return { ok: false, warn };
  }
  c.count += 1;
  return { ok: true, warn: false };
}

export async function handleClientError(req: Request): Promise<Response> {
  if (req.headers.get("content-type")?.includes("application/json") !== true) {
    return Response.json({ ok: false }, { status: 400 });
  }
  if (!sameOrigin(req)) return Response.json({ ok: false }, { status: 403 });
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  // Reject non-object JSON (null, arrays, primitives) BEFORE field access — else `body.area` throws.
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return Response.json({ ok: false }, { status: 400 });
  }
  const body = parsed as Record<string, unknown>;
  const area = body.area;
  const rawMessage = typeof body.message === "string" ? body.message.trim() : "";
  if (typeof area !== "string" || !AREAS.has(area) || rawMessage === "") {
    return Response.json({ ok: false }, { status: 400 });
  }
  // Best-effort per-instance backstop (acknowledged weak in serverless; client dedup is primary).
  const gate = allow(area, Date.now());
  if (!gate.ok) {
    if (gate.warn) {
      await runWithRequestContext({ requestId: deriveRequestId(req.headers) }, () =>
        safeLog(() => log.warn("client-error mirror rate cap hit", { source: "observe.client-error", area })),
      );
    }
    return Response.json({ ok: true }, { status: 202 });
  }
  // AWAIT the write (log.error returns the emit promise) inside safeLog so a rejected sink/persist
  // is caught here and can never escape as an unhandled rejection (fail-open: never 5xx).
  await runWithRequestContext({ requestId: deriveRequestId(req.headers) }, () =>
    safeLog(() =>
      log.error(rawMessage.slice(0, CAPS.message), {
        source: `client.${area}`,
        stack: cap(body.stack, CAPS.stack),
        componentStack: cap(body.componentStack, CAPS.componentStack),
        digest: cap(body.digest, CAPS.digest),
        url: cap(body.url, CAPS.url),
      }),
    ),
  );
  return Response.json({ ok: true }, { status: 202 });
}

export async function POST(req: Request): Promise<Response> {
  return handleClientError(req);
}
```
(Note: `runWithRequestContext` already wraps; the `log.error` shape sends fields TOP-LEVEL per Global Constraints. `deriveRequestId(req.headers)` mirrors `app/api/report/route.ts:209-213`.)
- [ ] **Step 4: run** the route test → PASS. Then `pnpm vitest run tests/cross-cutting/auth-chain-audit.test.ts` → **FAIL** (the new `app/api/observe/client-error/route.ts` is "not classified in TRUST_DOMAINS"). This is the red driving the registration.
- [ ] **Step 5: register the route** — add to `lib/audit/trustDomains.ts` `PROTECTED_ROUTES` (match the existing object-literal format):
```ts
{ path: "app/api/observe/client-error/route.ts", chain: "public" },
```
- [ ] **Step 6: run** `pnpm vitest run tests/cross-cutting/auth-chain-audit.test.ts` → **PASS** (route classified).
- [ ] **Step 7: commit** `feat(observe): public client-error mirror endpoint (same-origin guarded, fail-open) + trust-domain registration`

---

### Task 7: Sentry config files + no-op gate test

**Files:** Create `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts`, `instrumentation-client.ts` (repo root); Test `tests/observe/sentryNoopGate.test.ts`.
**Interfaces — Consumes:** `parseSampleRate` (Task 1), `@sentry/nextjs`.

- [ ] **Step 1: failing structural test** `tests/observe/sentryNoopGate.test.ts` (reads the source files; asserts every `Sentry.init` is `enabled`-gated on a DSN env):
```ts
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

const FILES = ["sentry.server.config.ts", "sentry.edge.config.ts", "instrumentation-client.ts"];
describe("Sentry no-op gate (spec §0.6/§8)", () => {
  test.each(FILES)("%s gates Sentry.init enabled on Boolean(<dsn env>)", (f) => {
    const src = readFileSync(f, "utf8");
    expect(src).toMatch(/Sentry\.init\(/);
    expect(src).toMatch(/enabled:\s*Boolean\(process\.env\.(NEXT_PUBLIC_)?SENTRY_DSN\)/);
  });
  test("server/edge use parseSampleRate (no raw Number())", () => {
    for (const f of ["sentry.server.config.ts", "sentry.edge.config.ts"]) {
      expect(readFileSync(f, "utf8")).toMatch(/parseSampleRate\(process\.env\.SENTRY_TRACES_SAMPLE_RATE\)/);
    }
  });
  test("instrumentation exports register + onRequestError", () => {
    const src = readFileSync("instrumentation.ts", "utf8");
    expect(src).toMatch(/export async function register\(/);
    expect(src).toMatch(/export const onRequestError = Sentry\.captureRequestError/);
  });
});
```
- [ ] **Step 2: run → FAIL.**
- [ ] **Step 3: implement** the 4 files:
`sentry.server.config.ts`:
```ts
import * as Sentry from "@sentry/nextjs";
import { parseSampleRate } from "@/lib/observe/parseSampleRate";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: parseSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE),
});
```
`sentry.edge.config.ts`: identical to server (same body).
`instrumentation.ts`:
```ts
import * as Sentry from "@sentry/nextjs";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge") await import("./sentry.edge.config");
}

export const onRequestError = Sentry.captureRequestError;
```
`instrumentation-client.ts`:
```ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
```
- [ ] **Step 4: run → PASS.**
- [ ] **Step 5: commit** `feat(observe): Sentry server/edge/client config + instrumentation (DSN-gated no-op)`

---

### Task 8: `withSentryConfig` wrap + env docs

**Files:** Modify `next.config.ts` (the `export default` at line 76); Modify `.env.local.example`; Test `tests/observe/nextConfigSentry.test.ts`.
**Interfaces — Consumes:** `@sentry/nextjs` `withSentryConfig`.

- [ ] **Step 1: failing structural test** `tests/observe/nextConfigSentry.test.ts` (source-asserts the wrap; a runtime import would execute the Sentry build plugin):
```ts
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
describe("next.config Sentry wrap", () => {
  const src = readFileSync("next.config.ts", "utf8");
  test("withSentryConfig is the OUTER wrapper around withMDX(nextConfig)", () => {
    expect(src).toMatch(/withSentryConfig\(\s*withMDX\(nextConfig\)/);
  });
  test("source-map upload is gated on SENTRY_AUTH_TOKEN (undefined ⇒ skip, no fail)", () => {
    expect(src).toMatch(/authToken:\s*process\.env\.SENTRY_AUTH_TOKEN/);
  });
});
```
- [ ] **Step 2: run → FAIL** (`export default withMDX(nextConfig);` doesn't match).
- [ ] **Step 3: implement** — change `next.config.ts` final line from `export default withMDX(nextConfig);` to:
```ts
import { withSentryConfig } from "@sentry/nextjs";
// ... existing config ...
export default withSentryConfig(withMDX(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  telemetry: false,
});
```
(`withSentryConfig` is the OUTER wrapper around the existing `withMDX(nextConfig)`; preserves MDX. Add the import at the top with the other imports.) Run the Step-1 test → PASS.
- [ ] **Step 4:** add to `.env.local.example` near the existing `SENTRY_DSN` (line 29):
```
# Sentry (Phase 3) — ALL optional; unset ⇒ SDK no-ops, build still succeeds.
NEXT_PUBLIC_SENTRY_DSN=        # client SDK; build-inlined
SENTRY_AUTH_TOKEN=            # source-map upload (CI/local); unset ⇒ upload skipped
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_TRACES_SAMPLE_RATE=    # default 0 (errors-only); clamped to [0,1]
```
- [ ] **Step 5: verify build** `env -u SENTRY_DSN -u NEXT_PUBLIC_SENTRY_DSN -u SENTRY_AUTH_TOKEN pnpm build` (no Sentry secrets) → succeeds (no source-map upload, SDK inert). Expected: build completes; Sentry logs "no auth token, skipping source map upload" or similar, NOT a failure.
- [ ] **Step 6: typecheck** `pnpm typecheck` → 0 errors.
- [ ] **Step 7: commit** `feat(observe): wrap next.config with withSentryConfig + document Sentry env vars`

---

### Task 9: `app/global-error.tsx` (UI — impeccable)

**Files:** Create `app/global-error.tsx`; Test `tests/observe/globalError.test.tsx`.
**Interfaces — Consumes:** `captureBoundaryError` (Task 5), `getRequiredCrewFacing` (Task 2).

- [ ] **Step 1: failing test** (`// @vitest-environment jsdom`; mock the helper + lookup):
```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
const h = vi.hoisted(() => ({ captureBoundaryError: vi.fn() }));
vi.mock("@/lib/observe/captureBoundaryError", () => ({ captureBoundaryError: h.captureBoundaryError }));
import GlobalError from "@/app/global-error";
const { captureBoundaryError } = h;
afterEach(() => { cleanup(); captureBoundaryError.mockReset(); });

describe("global-error", () => {
  test("captures with area=root on mount and renders crew copy + reload", () => {
    const reset = vi.fn();
    const err = Object.assign(new Error("boom"), { digest: "d9" });
    render(<GlobalError error={err} reset={reset} />);
    expect(captureBoundaryError).toHaveBeenCalledWith(err, "root");
    expect(screen.getByText(/try reloading/i)).toBeInTheDocument(); // PAGE_RENDER_FAILED crewFacing
    fireEvent.click(screen.getByRole("button", { name: /reload/i }));
    expect(reset).toHaveBeenCalled();
  });
});
```
- [ ] **Step 2: run → FAIL.**
- [ ] **Step 3: implement** `app/global-error.tsx` (MUST render its own `<html><body>`; DESIGN tokens; mobile-first; `min-h-tap-min` button):
```tsx
"use client";
import { useEffect } from "react";
import { captureBoundaryError } from "@/lib/observe/captureBoundaryError";
import { getRequiredCrewFacing } from "@/lib/messages/lookup";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureBoundaryError(error, "root");
  }, [error]);
  return (
    <html>
      <body>
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-base text-text">{getRequiredCrewFacing("PAGE_RENDER_FAILED")}</p>
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex min-h-tap-min items-center rounded-pill bg-accent px-4 text-accent-text"
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
```
(Final token classes verified against `app/globals.css` `@theme` during impeccable gate; adjust to real tokens.)
- [ ] **Step 4: run → PASS.**
- [ ] **Step 5: commit** `feat(observe): global-error boundary (Sentry+mirror, crew copy)`

---

### Task 10: crew error boundary (UI — impeccable)

**Files:** Create `app/show/[slug]/[shareToken]/error.tsx`; Test `tests/observe/crewError.test.tsx`.
**Interfaces — Consumes:** `captureBoundaryError`, `getRequiredCrewFacing`.

- [ ] **Step 1: failing test** `tests/observe/crewError.test.tsx`:
```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
const h = vi.hoisted(() => ({ captureBoundaryError: vi.fn() }));
vi.mock("@/lib/observe/captureBoundaryError", () => ({ captureBoundaryError: h.captureBoundaryError }));
import CrewError from "@/app/show/[slug]/[shareToken]/error";
const { captureBoundaryError } = h;
afterEach(() => { cleanup(); captureBoundaryError.mockReset(); });

describe("crew error boundary", () => {
  test("captures with area=crew on mount and renders crew copy + try-again", () => {
    const reset = vi.fn();
    const err = Object.assign(new Error("boom"), { digest: "d2" });
    render(<CrewError error={err} reset={reset} />);
    expect(captureBoundaryError).toHaveBeenCalledWith(err, "crew");
    expect(screen.getByText(/try reloading/i)).toBeInTheDocument(); // PAGE_RENDER_FAILED crewFacing
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalled();
  });
});
```
- [ ] **Step 2: run → FAIL.**
- [ ] **Step 3: implement** `app/show/[slug]/[shareToken]/error.tsx` (crew-styled, mobile-first; NO `<html>` — segment boundaries render within the layout):
```tsx
"use client";
import { useEffect } from "react";
import { captureBoundaryError } from "@/lib/observe/captureBoundaryError";
import { getRequiredCrewFacing } from "@/lib/messages/lookup";

export default function CrewError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureBoundaryError(error, "crew");
  }, [error]);
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-base text-text">{getRequiredCrewFacing("PAGE_RENDER_FAILED")}</p>
      <button
        type="button"
        onClick={() => reset()}
        className="inline-flex min-h-tap-min items-center rounded-pill bg-accent px-4 text-accent-text"
      >
        Try again
      </button>
    </main>
  );
}
```
- [ ] **Step 4: run → PASS.**
- [ ] **Step 5: commit** `feat(observe): crew error boundary (Sentry+mirror, crew copy)`

---

### Task 11: wire the 3 admin error boundaries (UI — impeccable)

**Files:** Modify `app/admin/error.tsx`, `app/admin/settings/error.tsx`, `app/admin/settings/admins/error.tsx`; Test `tests/observe/adminErrorWiring.test.tsx`.
**Interfaces — Consumes:** `captureBoundaryError`.

- [ ] **Step 1: failing test** `tests/observe/adminErrorWiring.test.tsx`:
```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { getRequiredDougFacing } from "@/lib/messages/lookup";
const h = vi.hoisted(() => ({ captureBoundaryError: vi.fn() }));
vi.mock("@/lib/observe/captureBoundaryError", () => ({ captureBoundaryError: h.captureBoundaryError }));
import AdminError from "@/app/admin/error";
import SettingsError from "@/app/admin/settings/error";
import AdminsError from "@/app/admin/settings/admins/error";
const { captureBoundaryError } = h;
afterEach(() => { cleanup(); captureBoundaryError.mockReset(); });

const COPY = getRequiredDougFacing("ADMIN_ROUTE_LOAD_FAILED");
describe.each([
  ["admin", AdminError],
  ["settings", SettingsError],
  ["admins", AdminsError],
])("admin boundary %s", (_name, Boundary) => {
  test("captures with area=admin AND still renders ADMIN_ROUTE_LOAD_FAILED copy (no visual change)", () => {
    const err = Object.assign(new Error("x"), { digest: "d3" });
    render(<Boundary error={err} reset={vi.fn()} />);
    expect(captureBoundaryError).toHaveBeenCalledWith(err, "admin");
    expect(screen.getByText(new RegExp(COPY.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"))).toBeInTheDocument();
  });
});
```
- [ ] **Step 2: run → FAIL.**
- [ ] **Step 3: implement** — in EACH of the 3 files, REPLACE the existing `console.error(...)` line inside `useEffect` with `captureBoundaryError(error, "admin");` and add `import { captureBoundaryError } from "@/lib/observe/captureBoundaryError";`. Keep ALL other content (the `getRequiredDougFacing("ADMIN_ROUTE_LOAD_FAILED")` render, the `reset()` button, testids) UNCHANGED — no visual change. (Each boundary's existing `useEffect(() => { … }, [error])` stays; only its body line changes. The admin test asserts `captureBoundaryError` called with `(error, "admin")`.)
- [ ] **Step 4: run → PASS.** Also run any existing admin error.tsx tests to confirm no regression.
- [ ] **Step 5: commit** `refactor(observe): wire admin error boundaries to captureBoundaryError (drop bare console.error)`

---

### Task 12: UI fallback layout + transition audit (per AGENTS.md)

**Files:** Test `tests/observe/errorBoundaryLayout.test.tsx` (jsdom computed-style assertions, per spec §10 — no real-browser parity harness needed because the fallbacks are simple centered columns, not fixed-dimension flex parents).

- [ ] **Step 1:** assert, for global + crew fallbacks: the only interactive control is a single button with class `min-h-tap-min` (≥44px tap target, spec §10); the container is a centered column (`items-center justify-center`, `min-h-screen`/`min-h-[60vh]`). **Transition inventory (spec §11):** assert NO `AnimatePresence`/`motion.`/`transition` in either fallback file (grep the source) — the fallbacks are single-state, instant. Negative control: the test greps the source for `framer-motion` and asserts absent.
```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen, cleanup } from "@testing-library/react";
vi.mock("@/lib/observe/captureBoundaryError", () => ({ captureBoundaryError: vi.fn() }));
import CrewError from "@/app/show/[slug]/[shareToken]/error";
afterEach(cleanup);
const CREW = "app/show/[slug]/[shareToken]/error.tsx";
const GLOBAL = "app/global-error.tsx";
describe("error-boundary fallback layout/transition (§10/§11)", () => {
  test("crew fallback: single rendered button has min-h-tap-min, centered container", () => {
    render(<CrewError error={new Error("x")} reset={() => {}} />);
    expect(screen.getByRole("button").className).toMatch(/min-h-tap-min/);
    // centered column container present
    expect(readFileSync(CREW, "utf8")).toMatch(/items-center[\s\S]*justify-center/);
  });
  test("global fallback: button min-h-tap-min + centered full-viewport column (source — it renders <html>, awkward to RTL-render)", () => {
    const src = readFileSync(GLOBAL, "utf8");
    expect(src).toMatch(/min-h-tap-min/); // the Reload button tap target
    expect(src).toMatch(/min-h-screen/); // full-viewport
    expect(src).toMatch(/items-center[\s\S]*justify-center/); // centered column
  });
  test("both fallbacks are instant — no framer-motion (transition inventory)", () => {
    for (const f of [CREW, GLOBAL]) {
      expect(readFileSync(f, "utf8")).not.toMatch(/framer-motion|AnimatePresence|motion\./);
    }
  });
});
```
- [ ] **Step 2: run → PASS** (after Tasks 9-10). 
- [ ] **Step 3: commit** `test(observe): error-boundary fallback layout + transition (instant) audit`

---

### Task 13: full suite + typecheck + lint + build-vs-runtime

- [ ] **Step 1:** `pnpm typecheck` → 0 errors.
- [ ] **Step 2:** `pnpm prettier --write .` then `pnpm format:check` → clean (per the Phase 2 lesson: `--check .` covers ALL files).
- [ ] **Step 3:** `pnpm lint` → 0 errors (fix any React-purity issues in the boundaries).
- [ ] **Step 4:** `pnpm test` (full vitest). Triage any failure: mine vs pre-existing env/flaky (verify at merge-base per `feedback_verify_pre_existing_failures_at_merge_base`). New code must be green; document env-only failures.
- [ ] **Step 5:** build-vs-runtime: `env -u SENTRY_DSN -u NEXT_PUBLIC_SENTRY_DSN -u SENTRY_AUTH_TOKEN pnpm build` → succeeds.
- [ ] **Step 6: commit** any prettier/lint fixes `chore(observe): prettier + lint + full-suite green`

---

### Task 14: impeccable v3 dual-gate (UI) + Adversarial review (cross-model)

- [ ] **Step 1: impeccable** — run `/impeccable critique` AND `/impeccable audit` on the UI diff (the 5 boundary files) via a fresh subagent (external attestation). Verify token classes against `app/globals.css @theme`; dot+label N/A (no status); 44px button; mobile-first; crew copy plain-language; no raw codes. Fix HIGH/CRITICAL or DEFERRED.md.
- [ ] **Step 2: Adversarial review (cross-model)** — invoke the Codex whole-diff review (REVIEWER-ONLY, fresh-eyes, do-not-relitigate the spec §0 + §6 ratified decisions). Iterate to APPROVE.

---

### Task 15: Execution handoff

- [ ] Push → open PR → real CI green (the `pnpm build` step proves the build-vs-runtime gate with no `SENTRY_*`) → `gh pr merge --merge` → fast-forward local main (verify `0  0`).

---

## Meta-test inventory (per AGENTS.md)

- **Auth-chain registry (EXTEND):** `/api/observe/client-error` → `PROTECTED_ROUTES` chain `public` (Task 6); `auth-chain-audit` pins it.
- **§12.4 catalog parity (EXTEND):** `PAGE_RENDER_FAILED` three-way lockstep (Task 3); `x1-catalog-parity` pins it.
- **Sentry no-op gate (NEW):** `tests/observe/sentryNoopGate.test.ts` (Task 7) pins `enabled: Boolean(<dsn>)` + `parseSampleRate` usage.
- **Supabase call-boundary (`_metaInfraContract`):** N/A — the endpoint writes via `lib/log` (already-covered sink), no direct Supabase call. Declared.

## Advisory-lock holder topology

N/A — Phase 3 touches no `pg_advisory*` surface (no `shows`/`crew_members`/`pending_*` mutation). Declared.
