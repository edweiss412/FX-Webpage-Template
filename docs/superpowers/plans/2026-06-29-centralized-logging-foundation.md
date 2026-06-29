# Centralized Logging Foundation (Phase 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single `lib/log` chokepoint that writes every log to console and selectively persists structured events to a new locked-down `app_events` table, with request correlation and the silent infra producers tapped — closing the "silent server faults / no durable queryable log / no correlation" gaps.

**Architecture:** A TS logger (`lib/log`) merges an `AsyncLocalStorage` request context, serializes + sanitizes (JSON-safe + email-redacted) the payload, always writes to `console`, and — above a level threshold — persists a row to `public.app_events` via a service-role insert. The table is DML-locked-down (`revoke all` from anon/authenticated; `service_role` retains all DML per the lockdown Layer-1 contract) with append-only enforced by a structural writer guard and a daily prune. The five typed auth infra producers plus four silent fault sites are tapped to emit, and `_metaInfraContract` is extended so a missing emission fails CI.

**Tech Stack:** Next.js 16 (App Router, Node serverless runtime), Supabase (Postgres + `supabase-js` service-role client + `postgres.js`), Vitest, pg_cron.

**Spec:** `docs/superpowers/specs/2026-06-29-centralized-logging-foundation-design.md` (APPROVED, Codex adversarial review 3 rounds).

## Global Constraints

- **TDD per task** — failing test → minimal impl → passing test → commit. Never implementation before its test.
- **Commit per task**, conventional commits: `feat(log):` / `test(log):` / `feat(db):` / `feat(auth):` / `feat(sync):` / `refactor(auth):`. Use `--no-verify` only in the autonomous worktree per AGENTS.md.
- **No raw error codes in user-visible UI** (invariant 5) — Phase 1 renders nothing; `app_events.code` is free-form, NOT §12.4-gated.
- **Supabase call-boundary discipline** (invariant 9) — destructure `{ error }` (never bare `data`); `persist.ts` is a best-effort sink that swallows + degrades to console and **never throws over the caller's error**; it carries an inline `// not-subject-to-meta:` waiver.
- **PII** — the logger never accepts a raw email; actor PII enters only as the already-hashed `actorHash`; `sanitizeContext` additionally redacts any email substring from message/context/serialized-error before console + persist. `lib/log` does NOT import `hashForLog`.
- **Advisory locks** (invariant 2) — Phase 1 adds **no** lock holders; the persist insert is lock-free; the cron tap emits outside the `show:` lock. `tests/auth/advisoryLockRpcDeadlock.test.ts` unchanged.
- **Append-only** — `service_role` keeps ALL DML (required by `tests/db/postgrest-dml-lockdown.test.ts:437-472`); append-only is enforced by the structural writer guard + the sole `prune_app_events` delete.
- **Migration parity** — the new migration applies locally + regenerates `supabase/__generated__/schema-manifest.json` (commit it) + applies surgically to the validation project (3-layer `validation-schema-parity` gate).
- **Node runtime everywhere** (no `runtime='edge'`) → `AsyncLocalStorage` is safe.
- **Migration number** `20260629000002` — must sort lexically after `20260629000001_agenda_extract_leases.sql`; renumber only if `origin/main` adds a same-day migration before merge.

## File Structure

**New — `lib/log/` (the chokepoint):**
- `serializeError.ts` — `serializeError(unknown)` (promoted from `app/auth/callback/route.ts:77-81`).
- `sanitize.ts` — `redactEmails(string)`, `sanitizeContext(message, context)` (JSON-safe + email-redacted).
- `requestContext.ts` — `AsyncLocalStorage` ctx: `runWithRequestContext`, `getRequestContext`, `deriveRequestId`, `setRequestShowId`.
- `types.ts` — `LogLevel`, `LogFields`, `LogRecord`, `Sink`.
- `logger.ts` — `log.{error,warn,info,debug}`, threshold, `setLogSink`/`resetLogSink`, default sink (console + persist).
- `persist.ts` — `persistAppEvent(record)` service-role insert (best-effort).
- `index.ts` — barrel re-export.

**New — DB + tests:**
- `supabase/migrations/20260629000002_app_events.sql`
- `tests/log/{serializeError,sanitize,requestContext,logger,persist,appEventsSchema,callbackUsesSerializeError,nonAuthTaps,correlationSeeding,_metaAppEventsWriter}.test.ts`
- (Auth-producer emission is asserted inside the extended `tests/auth/_metaInfraContract.test.ts` — no separate auth-tap test file.)

**Modified:**
- `app/auth/callback/route.ts` — replace local `errorLogValue` with `serializeError`.
- Auth taps: `lib/auth/requireAdmin.ts`, `lib/auth/isAdminSession.ts`, `lib/auth/validateGoogleIdentity.ts`, `lib/auth/validateGoogleSession.ts`, `lib/data/adminEmails.ts` (Task 11).
- Non-auth taps: `lib/geocoding/cache.ts`, `lib/sync/runScheduledCronSync.ts`, `app/api/admin/onboarding/scan/route.ts`, `app/api/report/route.ts` (Task 12).
- Correlation seeding: `app/api/cron/sync/route.ts`, `app/api/report/route.ts`, `app/api/admin/sync/[slug]/route.ts`, `app/api/admin/staged/[fileId]/apply/route.ts`, `app/api/auth/picker-bootstrap/route.ts` (ALS); `app/api/admin/onboarding/scan/route.ts` (explicit capture) (Task 13).
- Meta-tests: `tests/auth/_metaInfraContract.test.ts` (emission), `tests/db/postgrest-dml-lockdown.test.ts` (registry).
- `supabase/__generated__/schema-manifest.json` (regen).

---

### Task 1: `serializeError`

**Files:**
- Create: `lib/log/serializeError.ts`
- Test: `tests/log/serializeError.test.ts`

**Interfaces:**
- Produces: `serializeError(error: unknown): unknown` — `Error` → `{ name, message, stack }`; else `String(error)`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/log/serializeError.test.ts
import { describe, expect, test } from "vitest";
import { serializeError } from "@/lib/log/serializeError";

describe("serializeError", () => {
  test("Error → {name,message,stack}", () => {
    const e = new TypeError("boom");
    const out = serializeError(e) as { name: string; message: string; stack?: string };
    expect(out.name).toBe("TypeError");
    expect(out.message).toBe("boom");
    expect(typeof out.stack).toBe("string");
  });
  test("non-Error values → String(value)", () => {
    expect(serializeError("oops")).toBe("oops");
    expect(serializeError(42)).toBe("42");
    expect(serializeError(null)).toBe("null");
    expect(serializeError(undefined)).toBe("undefined");
    expect(serializeError({ a: 1 })).toBe("[object Object]");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/log/serializeError.test.ts`
Expected: FAIL — cannot resolve `@/lib/log/serializeError`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/log/serializeError.ts
/**
 * Promoted + generalized from app/auth/callback/route.ts:77-81 — the only
 * error-serialization shape in the codebase. The single canonical "turn an
 * unknown thrown value into a loggable shape" helper.
 */
export function serializeError(error: unknown): unknown {
  return error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : String(error);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/log/serializeError.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/log/serializeError.ts tests/log/serializeError.test.ts
git commit --no-verify -m "feat(log): add serializeError canonical error serializer"
```

---

### Task 2: `sanitize` — JSON-safe + email redaction

**Files:**
- Create: `lib/log/sanitize.ts`
- Test: `tests/log/sanitize.test.ts`

**Interfaces:**
- Produces:
  - `redactEmails(input: string): string` — replaces every email substring with `"[email-redacted]"`.
  - `sanitizeContext(message: string, context: Record<string, unknown>): { message: string; context: Record<string, unknown> }` — returns a JSON-safe, email-redacted copy. Circular → `"[Circular]"`; functions/symbols/undefined dropped; `BigInt`/non-finite number → string.

- [ ] **Step 1: Write the failing test**

```ts
// tests/log/sanitize.test.ts
import { describe, expect, test } from "vitest";
import { redactEmails, sanitizeContext } from "@/lib/log/sanitize";

describe("redactEmails", () => {
  test("redacts emails anywhere in a string", () => {
    expect(redactEmails("contact alice@example.com now")).toBe("contact [email-redacted] now");
    expect(redactEmails("a@b.co and c.d+x@sub.example.org")).toBe("[email-redacted] and [email-redacted]");
  });
  test("leaves non-emails alone", () => {
    expect(redactEmails("no address here @ all")).toBe("no address here @ all");
  });
});

describe("sanitizeContext", () => {
  test("redacts emails in message and nested context", () => {
    const { message, context } = sanitizeContext("from bob@corp.io", {
      a: { b: ["x", "deep eve@corp.io"] },
    });
    expect(message).toBe("from [email-redacted]");
    expect((context.a as { b: string[] }).b[1]).toBe("deep [email-redacted]");
  });
  test("makes circular structures JSON-safe", () => {
    const node: Record<string, unknown> = { name: "n" };
    node.self = node;
    const { context } = sanitizeContext("m", { node });
    expect((context.node as { self: unknown }).self).toBe("[Circular]");
  });
  test("drops functions/undefined and stringifies BigInt / non-finite", () => {
    const { context } = sanitizeContext("m", {
      fn: () => 1,
      u: undefined,
      big: 10n,
      nan: Number.NaN,
      keep: "ok",
    });
    expect(context).not.toHaveProperty("fn");
    expect(context).not.toHaveProperty("u");
    expect(context.big).toBe("10");
    expect(context.nan).toBe("NaN");
    expect(context.keep).toBe("ok");
  });
  test("a sibling repeat (diamond) is NOT marked circular", () => {
    const shared = { v: 1 };
    const { context } = sanitizeContext("m", { a: shared, b: shared });
    expect(context.a).toEqual({ v: 1 });
    expect(context.b).toEqual({ v: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/log/sanitize.test.ts`
Expected: FAIL — cannot resolve `@/lib/log/sanitize`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/log/sanitize.ts
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const REDACTED = "[email-redacted]";

export function redactEmails(input: string): string {
  return input.replace(EMAIL_RE, REDACTED);
}

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
const DROP = Symbol("drop");

function sanitizeValue(value: unknown, seen: WeakSet<object>): Json | typeof DROP {
  if (value === null) return null;
  const t = typeof value;
  if (t === "string") return redactEmails(value as string);
  if (t === "number") return Number.isFinite(value as number) ? (value as number) : String(value);
  if (t === "boolean") return value as boolean;
  if (t === "bigint") return (value as bigint).toString();
  if (t === "function" || t === "symbol" || t === "undefined") return DROP;

  const obj = value as object;
  if (seen.has(obj)) return "[Circular]";
  seen.add(obj);
  try {
    if (Array.isArray(obj)) {
      // arrays keep positions; a dropped element becomes null so indices don't shift
      return obj.map((item) => {
        const s = sanitizeValue(item, seen);
        return s === DROP ? null : s;
      });
    }
    const out: { [k: string]: Json } = {};
    for (const [k, v] of Object.entries(obj)) {
      const s = sanitizeValue(v, seen);
      if (s !== DROP) out[k] = s;
    }
    return out;
  } finally {
    // only true ancestor cycles count; release so sibling repeats aren't flagged
    seen.delete(obj);
  }
}

export function sanitizeContext(
  message: string,
  context: Record<string, unknown>,
): { message: string; context: Record<string, unknown> } {
  const seen = new WeakSet<object>();
  const sanitized = sanitizeValue(context, seen);
  const safeContext =
    sanitized !== DROP && sanitized !== null && typeof sanitized === "object" && !Array.isArray(sanitized)
      ? (sanitized as Record<string, unknown>)
      : {};
  return { message: redactEmails(message), context: safeContext };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/log/sanitize.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/log/sanitize.ts tests/log/sanitize.test.ts
git commit --no-verify -m "feat(log): add sanitizeContext (JSON-safe + email redaction)"
```

---

### Task 3: `requestContext` — AsyncLocalStorage correlation

**Files:**
- Create: `lib/log/requestContext.ts`
- Test: `tests/log/requestContext.test.ts`

**Interfaces:**
- Produces:
  - `interface RequestContext { requestId: string | null; showId?: string | null }`
  - `runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T`
  - `getRequestContext(): RequestContext | undefined`
  - `deriveRequestId(headers: Headers): string` — `x-vercel-id` else `crypto.randomUUID()`
  - `setRequestShowId(showId: string): void` — mutates the active store only

- [ ] **Step 1: Write the failing test**

```ts
// tests/log/requestContext.test.ts
import { describe, expect, test } from "vitest";
import {
  deriveRequestId,
  getRequestContext,
  runWithRequestContext,
  setRequestShowId,
} from "@/lib/log/requestContext";

describe("requestContext", () => {
  test("getRequestContext is undefined outside a run", () => {
    expect(getRequestContext()).toBeUndefined();
  });
  test("context is visible across awaited async + Promise.all", async () => {
    await runWithRequestContext({ requestId: "req-1" }, async () => {
      expect(getRequestContext()?.requestId).toBe("req-1");
      await Promise.all([
        (async () => expect(getRequestContext()?.requestId).toBe("req-1"))(),
        (async () => {
          await Promise.resolve();
          expect(getRequestContext()?.requestId).toBe("req-1");
        })(),
      ]);
    });
    expect(getRequestContext()).toBeUndefined();
  });
  test("deriveRequestId prefers x-vercel-id, else a uuid", () => {
    expect(deriveRequestId(new Headers({ "x-vercel-id": "iad1::abc" }))).toBe("iad1::abc");
    const minted = deriveRequestId(new Headers());
    expect(minted).toMatch(/^[0-9a-f-]{36}$/);
  });
  test("setRequestShowId mutates the active store only", async () => {
    await runWithRequestContext({ requestId: "r" }, () => {
      setRequestShowId("show-9");
      expect(getRequestContext()?.showId).toBe("show-9");
    });
    setRequestShowId("ignored"); // no active store → no throw
    expect(getRequestContext()).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/log/requestContext.test.ts`
Expected: FAIL — cannot resolve `@/lib/log/requestContext`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/log/requestContext.ts
import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  requestId: string | null;
  showId?: string | null;
}

const als = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return als.run(ctx, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return als.getStore();
}

export function deriveRequestId(headers: Headers): string {
  return headers.get("x-vercel-id") ?? crypto.randomUUID();
}

export function setRequestShowId(showId: string): void {
  const store = als.getStore();
  if (store) store.showId = showId;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/log/requestContext.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/log/requestContext.ts tests/log/requestContext.test.ts
git commit --no-verify -m "feat(log): add AsyncLocalStorage request context"
```

---

### Task 4: types + logger core + Sink seam

**Files:**
- Create: `lib/log/types.ts`, `lib/log/logger.ts`, `lib/log/index.ts`
- Test: `tests/log/logger.test.ts`

**Interfaces:**
- Consumes: `serializeError` (Task 1), `sanitizeContext` (Task 2), `getRequestContext` (Task 3). `persistAppEvent` (Task 5) is **lazy-imported** inside the default sink only — Task 4 has no load-time dependency on Task 5, and the capturing-sink tests never reach the persist branch.
- Produces:
  - `types.ts`: `LogLevel = "debug"|"info"|"warn"|"error"`; `LogFields` (`source` required; optional `code/showId/driveFileId/requestId/actorHash/error/persist` + `[k]: unknown`); `LogRecord` (`level,message,source,code,requestId,showId,driveFileId,actorHash,context`); `Sink = (record: LogRecord, persist: boolean) => void | Promise<void>`.
  - `logger.ts`: `log.{error,warn,info,debug}(message, fields): Promise<void>`; `setLogSink(sink)`, `resetLogSink()`.
  - `index.ts`: re-exports `log`, `setLogSink`, `resetLogSink`, `serializeError`, `sanitizeContext`, `redactEmails`, request-context helpers, and all types.

> **Note for the implementer:** `logger.ts` lazy-imports `persistAppEvent` only inside the default sink's persist branch, so Task 4 can be built and tested before Task 5 exists. The capturing-sink tests replace the sink entirely; the one default-sink test uses `log.debug` (never persists) so no real insert is attempted.

- [ ] **Step 1: Write the failing test**

```ts
// tests/log/logger.test.ts
import { afterEach, describe, expect, test, vi } from "vitest";
import { log, resetLogSink, setLogSink } from "@/lib/log";
import type { LogRecord } from "@/lib/log/types";
import { runWithRequestContext } from "@/lib/log/requestContext";

function capture() {
  const calls: { record: LogRecord; persist: boolean }[] = [];
  setLogSink((record, persist) => {
    calls.push({ record, persist });
  });
  return calls;
}

afterEach(() => resetLogSink());

describe("logger", () => {
  test("builds a record: reserved keys → columns, extras → context", async () => {
    const calls = capture();
    await log.error("kaboom", {
      source: "test/site",
      code: "X_FAILED",
      showId: "s1",
      driveFileId: "d1",
      actorHash: "h1",
      extra: "ctx",
    });
    const { record } = calls[0];
    expect(record).toMatchObject({
      level: "error",
      message: "kaboom",
      source: "test/site",
      code: "X_FAILED",
      showId: "s1",
      driveFileId: "d1",
      actorHash: "h1",
    });
    expect(record.context).toEqual({ extra: "ctx" });
  });

  test("serializes + redacts fields.error into context.error", async () => {
    const calls = capture();
    await log.error("boom", { source: "s", error: new Error("mail eve@corp.io now") });
    const err = calls[0].record.context.error as { message: string };
    expect(err.message).toBe("mail [email-redacted] now");
  });

  test("threshold: error/warn always persist; debug never; info only with code/persist", async () => {
    const calls = capture();
    await log.error("a", { source: "s" });
    await log.warn("b", { source: "s" });
    await log.debug("c", { source: "s" });
    await log.info("d", { source: "s" });
    await log.info("e", { source: "s", code: "C" });
    await log.info("f", { source: "s", persist: true });
    expect(calls.map((c) => `${c.record.level}:${c.persist}`)).toEqual([
      "error:true",
      "warn:true",
      "debug:false",
      "info:false",
      "info:true",
      "info:true",
    ]);
  });

  test("auto-attaches requestId/showId from ALS; explicit fields win", async () => {
    const calls = capture();
    await runWithRequestContext({ requestId: "req-7", showId: "show-als" }, async () => {
      await log.warn("x", { source: "s" });
      await log.warn("y", { source: "s", requestId: "explicit", showId: "explicit-show" });
    });
    expect(calls[0].record.requestId).toBe("req-7");
    expect(calls[0].record.showId).toBe("show-als");
    expect(calls[1].record.requestId).toBe("explicit");
    expect(calls[1].record.showId).toBe("explicit-show");
  });

  test("default sink writes to console even with no ALS", async () => {
    // Use debug (never persists) so the default sink does NOT attempt a real
    // service-role insert in a unit test.
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    await log.debug("boom", { source: "auth/x", code: "C" });
    expect(spy).toHaveBeenCalledWith("[auth/x] boom", expect.objectContaining({ code: "C", level: "debug" }));
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/log/logger.test.ts`
Expected: FAIL — cannot resolve `@/lib/log`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/log/types.ts
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  source: string;
  code?: string;
  showId?: string | null;
  driveFileId?: string | null;
  requestId?: string | null;
  actorHash?: string | null;
  error?: unknown;
  persist?: boolean;
  [key: string]: unknown;
}

export interface LogRecord {
  level: LogLevel;
  message: string;
  source: string;
  code: string | null;
  requestId: string | null;
  showId: string | null;
  driveFileId: string | null;
  actorHash: string | null;
  context: Record<string, unknown>;
}

export type Sink = (record: LogRecord, persist: boolean) => void | Promise<void>;
```

```ts
// lib/log/logger.ts
import { getRequestContext } from "./requestContext";
import { sanitizeContext } from "./sanitize";
import { serializeError } from "./serializeError";
import type { LogFields, LogLevel, LogRecord, Sink } from "./types";
// persist.ts is imported LAZILY inside the default sink (below) so loading the
// logger never eagerly loads the Supabase client, and Task 4 has no load-time
// dependency on Task 5.

const RESERVED = new Set([
  "source",
  "code",
  "showId",
  "driveFileId",
  "requestId",
  "actorHash",
  "error",
  "persist",
]);

function shouldPersist(level: LogLevel, code: string | null, persist: boolean): boolean {
  if (level === "error" || level === "warn") return true;
  if (level === "info") return code != null || persist === true;
  return false; // debug
}

function buildRecord(level: LogLevel, message: string, fields: LogFields): LogRecord {
  const ctx = getRequestContext();
  const rawContext: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (!RESERVED.has(k)) rawContext[k] = v;
  }
  if (fields.error !== undefined) rawContext.error = serializeError(fields.error);

  const { message: cleanMessage, context: cleanContext } = sanitizeContext(message, rawContext);

  return {
    level,
    message: cleanMessage,
    source: fields.source,
    code: fields.code ?? null,
    requestId: fields.requestId ?? ctx?.requestId ?? null,
    showId: fields.showId ?? ctx?.showId ?? null,
    driveFileId: fields.driveFileId ?? null,
    actorHash: fields.actorHash ?? null,
    context: cleanContext,
  };
}

const defaultSink: Sink = async (record, persist) => {
  const compact: Record<string, unknown> = {
    level: record.level,
    code: record.code,
    requestId: record.requestId,
    showId: record.showId,
    driveFileId: record.driveFileId,
    actorHash: record.actorHash,
    ...record.context,
  };
  for (const k of Object.keys(compact)) {
    if (compact[k] == null) delete compact[k];
  }
  // The ONE intentional console chokepoint. Always synchronous, before persist.
  console[record.level](`[${record.source}] ${record.message}`, compact);
  if (persist) {
    const { persistAppEvent } = await import("./persist");
    await persistAppEvent(record);
  }
};

let activeSink: Sink = defaultSink;

export function setLogSink(sink: Sink): void {
  activeSink = sink;
}
export function resetLogSink(): void {
  activeSink = defaultSink;
}

async function emit(level: LogLevel, message: string, fields: LogFields): Promise<void> {
  const record = buildRecord(level, message, fields);
  const persist = shouldPersist(level, record.code, fields.persist === true);
  await activeSink(record, persist);
}

export const log = {
  error: (message: string, fields: LogFields) => emit("error", message, fields),
  warn: (message: string, fields: LogFields) => emit("warn", message, fields),
  info: (message: string, fields: LogFields) => emit("info", message, fields),
  debug: (message: string, fields: LogFields) => emit("debug", message, fields),
};
```

```ts
// lib/log/index.ts
export { log, setLogSink, resetLogSink } from "./logger";
export { serializeError } from "./serializeError";
export { redactEmails, sanitizeContext } from "./sanitize";
export {
  deriveRequestId,
  getRequestContext,
  runWithRequestContext,
  setRequestShowId,
} from "./requestContext";
export type { LogFields, LogLevel, LogRecord, Sink } from "./types";
export type { RequestContext } from "./requestContext";
```

- [ ] **Step 4: Run test to verify it passes** (implement Task 5 `persist.ts` first if needed)

Run: `pnpm vitest run tests/log/logger.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/log/types.ts lib/log/logger.ts lib/log/index.ts tests/log/logger.test.ts
git commit --no-verify -m "feat(log): add logger core, threshold, and sink seam"
```

---

### Task 5: `persist` — service-role app_events insert (best-effort)

**Files:**
- Create: `lib/log/persist.ts`
- Test: `tests/log/persist.test.ts`

**Interfaces:**
- Consumes: `createSupabaseServiceRoleClient` (`lib/supabase/server.ts:79-93`), `serializeError` (Task 1), `LogRecord` (Task 4).
- Produces: `persistAppEvent(record: LogRecord): Promise<void>` — inserts into `public.app_events`; on returned-error or thrown error, degrades to `console.error` and returns; **never throws**.

- [ ] **Step 1: Write the failing test**

```ts
// tests/log/persist.test.ts
import { afterEach, describe, expect, test, vi } from "vitest";
import type { LogRecord } from "@/lib/log/types";

const insertMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    from: (_table: string) => ({ insert: insertMock }),
  }),
}));

const record: LogRecord = {
  level: "error",
  message: "m",
  source: "s",
  code: "C",
  requestId: "r",
  showId: "sh",
  driveFileId: "d",
  actorHash: "h",
  context: { a: 1 },
};

afterEach(() => {
  insertMock.mockReset();
  vi.restoreAllMocks();
});

describe("persistAppEvent", () => {
  test("inserts the mapped columns", async () => {
    insertMock.mockResolvedValue({ error: null });
    const { persistAppEvent } = await import("@/lib/log/persist");
    await persistAppEvent(record);
    expect(insertMock).toHaveBeenCalledWith({
      level: "error",
      source: "s",
      message: "m",
      code: "C",
      request_id: "r",
      show_id: "sh",
      drive_file_id: "d",
      actor_hash: "h",
      context: { a: 1 },
    });
  });

  test("returned {error} → console-degrade, no throw", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    insertMock.mockResolvedValue({ error: { message: "denied" } });
    const { persistAppEvent } = await import("@/lib/log/persist");
    await expect(persistAppEvent(record)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith("[log/persist] app_events write failed", expect.any(Object));
  });

  test("thrown error → caught, no throw", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    insertMock.mockRejectedValue(new Error("network"));
    const { persistAppEvent } = await import("@/lib/log/persist");
    await expect(persistAppEvent(record)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith("[log/persist] app_events write threw", expect.any(Object));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/log/persist.test.ts`
Expected: FAIL — cannot resolve `@/lib/log/persist`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/log/persist.ts
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { serializeError } from "./serializeError";
import type { LogRecord } from "./types";

// not-subject-to-meta: best-effort log sink — swallows + degrades to console,
// surfaces no typed infra_error result (a typed result would defeat "never throw
// over the caller's error", invariant 9). Pinned by tests/log/_metaAppEventsWriter.test.ts.
export async function persistAppEvent(record: LogRecord): Promise<void> {
  // record.message + record.context are already JSON-safe + email-redacted (sanitizeContext).
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { error } = await supabase.from("app_events").insert({
      level: record.level,
      source: record.source,
      message: record.message,
      code: record.code,
      request_id: record.requestId,
      show_id: record.showId,
      drive_file_id: record.driveFileId,
      actor_hash: record.actorHash,
      context: record.context,
    });
    if (error) {
      console.error("[log/persist] app_events write failed", { error: serializeError(error) });
    }
  } catch (e) {
    console.error("[log/persist] app_events write threw", { error: serializeError(e) });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/log/persist.test.ts tests/log/logger.test.ts`
Expected: PASS (persist 3 + logger 5).

- [ ] **Step 5: Commit**

```bash
git add lib/log/persist.ts tests/log/persist.test.ts
git commit --no-verify -m "feat(log): add best-effort app_events persist sink"
```

---

### Task 6: migration — `app_events` table, prune, cron

**Files:**
- Create: `supabase/migrations/20260629000002_app_events.sql`
- Test: `tests/log/appEventsSchema.test.ts`

**Interfaces:**
- Produces: `public.app_events` table; `public.prune_app_events(interval)`; `app_events_prune` cron job.

> Requires a local Supabase DB. Apply the migration to the local stack before running the DB test: `psql "$(npx supabase status -o env | sed -n 's/^DB_URL="\(.*\)"/\1/p')" -f supabase/migrations/20260629000002_app_events.sql` (or `supabase db reset` if you prefer a full re-apply). The schema test reads `TEST_DATABASE_URL`/local DB.

- [ ] **Step 1: Write the failing test**

```ts
// tests/log/appEventsSchema.test.ts
import { afterAll, describe, expect, test } from "vitest";
import postgres from "postgres";

const url =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = postgres(url, { max: 1 });
afterAll(async () => { await sql.end(); });

describe("app_events schema", () => {
  test("table + columns exist with the expected types", async () => {
    const cols = await sql<{ column_name: string; data_type: string }[]>`
      select column_name, data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'app_events' order by column_name`;
    const names = cols.map((c) => c.column_name).sort();
    expect(names).toEqual(
      ["actor_hash","code","context","drive_file_id","id","level","message","occurred_at","request_id","show_id","source"].sort(),
    );
  });

  test("level CHECK accepts info/warn/error and rejects debug", async () => {
    for (const level of ["info", "warn", "error"]) {
      await sql`insert into public.app_events (level, source, message) values (${level}, 't', ${level})`;
    }
    const accepted = await sql<{ level: string }[]>`
      select level from public.app_events where source = 't' order by level`;
    expect(accepted.map((r) => r.level)).toEqual(["error", "info", "warn"]);
    await expect(
      sql`insert into public.app_events (level, source, message) values ('debug','t','m')`,
    ).rejects.toThrow();
    await sql`delete from public.app_events where source = 't'`;
  });

  test("anon + authenticated have no DML; service_role retains all", async () => {
    const rows = await sql<{ g: string; p: string; ok: boolean }[]>`
      select grantee g, privilege_type p,
             has_table_privilege(grantee, 'public.app_events', privilege_type) ok
      from (values ('anon','INSERT'),('authenticated','DELETE'),
                   ('service_role','DELETE'),('service_role','INSERT')) as e(grantee, privilege_type)`;
    const map = Object.fromEntries(rows.map((r) => [`${r.g}:${r.p}`, r.ok]));
    expect(map["anon:INSERT"]).toBe(false);
    expect(map["authenticated:DELETE"]).toBe(false);
    expect(map["service_role:DELETE"]).toBe(true);
    expect(map["service_role:INSERT"]).toBe(true);
  });

  test("prune_app_events deletes only rows older than retain", async () => {
    await sql`insert into public.app_events (level, source, message, occurred_at)
              values ('info','prune-test','old', now() - interval '90 days'),
                     ('info','prune-test','new', now())`;
    const deleted = await sql`select public.prune_app_events(interval '60 days') as n`;
    expect(Number(deleted[0].n)).toBeGreaterThanOrEqual(1);
    const remaining = await sql<{ message: string }[]>`
      select message from public.app_events where source = 'prune-test'`;
    expect(remaining.map((r) => r.message)).toEqual(["new"]);
    await sql`delete from public.app_events where source = 'prune-test'`;
  });

  test("prune cron job is registered", async () => {
    const jobs = await sql<{ jobname: string }[]>`
      select jobname from cron.job where jobname = 'app_events_prune'`;
    expect(jobs.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/log/appEventsSchema.test.ts`
Expected: FAIL — relation `public.app_events` does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260629000002_app_events.sql
-- Phase 1 centralized logging: durable, queryable, append-only server-event store.

create table if not exists public.app_events (
  id            uuid primary key default gen_random_uuid(),
  occurred_at   timestamptz not null default now(),
  level         text not null check (level in ('info','warn','error')),
  source        text not null,
  message       text not null,
  code          text,
  request_id    text,
  show_id       uuid references public.shows(id) on delete set null,
  drive_file_id text,
  actor_hash    text,
  context       jsonb not null default '{}'::jsonb
);

create index if not exists app_events_occurred_at_idx on public.app_events (occurred_at desc);
create index if not exists app_events_request_id_idx  on public.app_events (request_id) where request_id is not null;
create index if not exists app_events_show_id_idx      on public.app_events (show_id, occurred_at desc);
create index if not exists app_events_level_idx        on public.app_events (level, occurred_at desc);
create index if not exists app_events_code_idx         on public.app_events (code, occurred_at desc) where code is not null;

-- Lockdown (AGENTS.md cross-cutting #1 / BL-ADMIN-POSTGREST-DML-LOCKDOWN).
-- service_role retains ALL DML — REQUIRED by tests/db/postgrest-dml-lockdown.test.ts:437-472
-- (Layer 1 asserts service_role DELETE/INSERT/SELECT/UPDATE = true for every registered table).
-- Append-only is enforced STRUCTURALLY (tests/log/_metaAppEventsWriter.test.ts writer guard
-- + the sole prune_app_events delete), not at the grant layer.
revoke all on table public.app_events from public, anon, authenticated;
grant all privileges on table public.app_events to service_role;
alter table public.app_events enable row level security; -- no policy; service_role bypasses RLS

create or replace function public.prune_app_events(retain interval default interval '60 days')
  returns integer
  language sql
  security definer
  set search_path = public, pg_temp
as $$
  with deleted as (
    delete from public.app_events where occurred_at < now() - retain returning 1
  )
  select count(*)::int from deleted;
$$;

revoke all on function public.prune_app_events(interval) from public, anon, authenticated;
grant execute on function public.prune_app_events(interval) to service_role;

-- Daily retention prune (SQL-body cron, bootstrap_nonces precedent :33-40). Idempotent.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'app_events_prune') then
    perform cron.unschedule('app_events_prune');
  end if;
  perform cron.schedule(
    'app_events_prune',
    '17 4 * * *',
    'select public.prune_app_events();'
  );
end;
$$;
```

- [ ] **Step 4: Apply locally + run test to verify it passes**

```bash
DB_URL=$(npx supabase status -o env | sed -n 's/^DB_URL="\(.*\)"/\1/p')
psql "$DB_URL" -f supabase/migrations/20260629000002_app_events.sql
psql "$DB_URL" -c "notify pgrst, 'reload schema';"
pnpm vitest run tests/log/appEventsSchema.test.ts
```
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260629000002_app_events.sql tests/log/appEventsSchema.test.ts
git commit --no-verify -m "feat(db): add app_events table, prune function, retention cron"
```

---

### Task 7: schema-manifest regen + validation-project apply

**Files:**
- Modify: `supabase/__generated__/schema-manifest.json` (regenerated)

**Interfaces:**
- Produces: an up-to-date manifest including `app_events` so `validation-schema-parity` Layer 1 (DB-free tripwire) passes; the migration applied to the validation project so Layer 2 passes.

- [ ] **Step 1: Regenerate the manifest (with the migration applied locally from Task 6)**

```bash
pnpm gen:schema-manifest
git diff --stat supabase/__generated__/schema-manifest.json
```
Expected: the diff adds an `"app_events": [...]` key listing its columns.

- [ ] **Step 2: Verify Layer 1 (DB-free tripwire) passes**

Run: `pnpm vitest run tests/db/schema-manifest-lib.test.ts`
Expected: PASS — the migration's `create table public.app_events` is now present in the committed manifest.

- [ ] **Step 3: Apply the migration to the validation project (surgical — `db push` is blocked)**

```bash
# requires the validation project DB URL in TEST_DATABASE_URL (or `supabase db query --linked`)
psql "$TEST_DATABASE_URL" -f supabase/migrations/20260629000002_app_events.sql
psql "$TEST_DATABASE_URL" -c "notify pgrst, 'reload schema';"
```
Expected: applies cleanly (idempotent). If validation creds are unavailable in this environment, record the step as pending and let the CI `validation-schema-parity` Layer 2 job confirm/flag.

- [ ] **Step 3b: Run the real validation-schema-parity gate (all 3 layers)**

```bash
# Layer 1 is DB-free; Layers 2/3 need TEST_DATABASE_URL pointed at the validation project.
pnpm test:audit:validation-schema-parity
```
Expected: PASS — Layer 1 (manifest freshness) green from Step 1's regen; Layer 2 (validation ⊇ manifest) green once Step 3 applied `app_events` to validation. If `TEST_DATABASE_URL` is unset locally, Layer 2/3 skip locally and the **CI** `validation-schema-parity` job is the gate — do NOT mark this task done until that CI job is green (real-CI-green is a separate close-out gate, AGENTS.md).

- [ ] **Step 4: Commit the regenerated manifest**

```bash
git add supabase/__generated__/schema-manifest.json
git commit --no-verify -m "chore(db): regenerate schema manifest for app_events"
```

---

### Task 8: register `app_events` in the PostgREST-DML-lockdown meta-test

**Files:**
- Modify: `tests/db/postgrest-dml-lockdown.test.ts` (add a `RPC_GATED_TABLES` row, `:135`)

**Interfaces:**
- Consumes: the `RpcGatedTable` row shape (`:126-133`): `{ table, closed_at, selectAnon, selectAuthenticated, postBody, rowFilter }`.

- [ ] **Step 1: Add the registry row (this IS the test change — the meta-test's Layer 4 fails first because the migration's `revoke all` is an unregistered orphan)**

First find the exact line of the `revoke all on table public.app_events` statement in the new migration:

```bash
grep -n "revoke all on table public.app_events" supabase/migrations/20260629000002_app_events.sql
```

Then add this object to the `RPC_GATED_TABLES` array (mirror the `show_share_tokens` no-PostgREST-SELECT variant), using that exact line number for `closed_at`:

```ts
  {
    // Phase-1 logging: append-only event log. Writes flow ONLY through the
    // lib/log service-role insert; anon/authenticated have zero access.
    // Append-only is enforced structurally (tests/log/_metaAppEventsWriter.test.ts),
    // NOT at the grant layer — service_role retains ALL DML per Layer 1.
    table: "app_events",
    closed_at: "supabase/migrations/20260629000002_app_events.sql:<REVOKE_LINE>",
    selectAnon: false,
    selectAuthenticated: false,
    postBody: {
      level: "info",
      source: "postgrest-dml-lockdown-test",
      message: "lockdown-test",
    },
    rowFilter: "?source=eq.postgrest-dml-lockdown-test-no-such-row",
  },
```

- [ ] **Step 2: Run the lockdown meta-test (Layer 1 + Layer 4 are DB/grant checks; Layers 2+3 need local Supabase)**

```bash
pnpm vitest run tests/db/postgrest-dml-lockdown.test.ts
```
Expected: PASS — Layer 1 confirms `service_role` ALL / anon+authenticated none; Layer 4 orphan reconciliation now finds the registry row matching the migration `revoke all`.

- [ ] **Step 3: Commit**

```bash
git add tests/db/postgrest-dml-lockdown.test.ts
git commit --no-verify -m "test(db): register app_events in postgrest-dml-lockdown meta-test"
```

---

### Task 9: append-only writer guard + redaction structural guard

**Files:**
- Create: `tests/log/_metaAppEventsWriter.test.ts`

**Interfaces:**
- Consumes: `lib/log/persist.ts` (the sole writer), `lib/log/logger.ts` (must call `sanitizeContext`).

> **TDD note (structural meta-test):** this guard pins an invariant that Tasks 4–5 ALREADY satisfy (persist.ts is the sole writer; logger calls sanitizeContext) — exactly like the repo's existing `tests/db/postgrest-dml-lockdown.test.ts` and `tests/auth/_metaInfraContract.test.ts`, which are introduced over already-true invariants. For this class, the RED phase is NOT "no implementation yet" — it is the **mandatory negative-regression in Step 3** (mutate the code to violate the invariant, prove the guard fails). Per AGENTS.md, meta-tests are a recognized task category; the negative-regression is the failing-test proof.

- [ ] **Step 1: Write the test (the structural guard IS the deliverable)**

```ts
// tests/log/_metaAppEventsWriter.test.ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const ROOTS = ["app", "lib", "scripts"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(full) && !/\.test\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

const files = ROOTS.flatMap((r) => walk(r));

describe("app_events writer guard (append-only)", () => {
  test("only lib/log/persist.ts writes app_events, and only via .insert", () => {
    const RE = /from\(\s*["']app_events["']\s*\)\s*\.\s*(insert|update|delete|upsert)\(/g;
    const hits: { file: string; op: string }[] = [];
    for (const f of files) {
      const flat = readFileSync(f, "utf8").replace(/\s+/g, " ");
      for (const m of flat.matchAll(RE)) hits.push({ file: f, op: m[1] });
    }
    // no in-place mutation anywhere
    expect(hits.filter((h) => h.op !== "insert")).toEqual([]);
    // the only writer is persist.ts
    expect([...new Set(hits.map((h) => h.file))]).toEqual(["lib/log/persist.ts"]);
  });

  test("no raw SQL update/delete of app_events outside the migration", () => {
    const RE = /(update\s+(public\.)?app_events|delete\s+from\s+(public\.)?app_events)\b/i;
    const offenders = files.filter((f) => RE.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  test("logger routes through sanitizeContext (redaction cannot be silently removed)", () => {
    const src = readFileSync("lib/log/logger.ts", "utf8");
    expect(src).toMatch(/sanitizeContext\(/);
  });
});
```

- [ ] **Step 2: Run the guard — expect PASS (already-true invariant)**

Run: `pnpm vitest run tests/log/_metaAppEventsWriter.test.ts`
Expected: PASS (3 tests). The invariant already holds after Tasks 4–5; this is the structural-meta-test pattern, not a missed RED.

- [ ] **Step 3: Negative-regression — PROVE the guard bites (the RED-equivalent, mandatory)**

Mutate each invariant in turn and confirm the matching test FAILS, then revert:
1. In `lib/log/persist.ts`, change `.from("app_events").insert(...)` → `.from("app_events").upsert(...)`. Run the guard → test 1 FAILS (op `upsert` ≠ `insert`). Revert.
2. Add a throwaway line to a scratch file under `lib/` (e.g. a comment-free `await c.from("app_events").delete();` in `lib/log/persist.ts`). Run → test 1 FAILS (second op / file). Revert.
3. In `lib/log/logger.ts`, comment out the `sanitizeContext(` call. Run → test 3 FAILS. Revert.

```bash
git checkout -- lib/log/persist.ts lib/log/logger.ts   # ensure all mutations reverted
pnpm vitest run tests/log/_metaAppEventsWriter.test.ts  # back to PASS
```
Expected: each mutation FAILS the guard; after revert, PASS. This proves the guard catches the real failure modes (second writer, in-place mutation, removed redaction).

- [ ] **Step 4: Commit**

```bash
git add tests/log/_metaAppEventsWriter.test.ts
git commit --no-verify -m "test(log): append-only writer guard + redaction structural guard"
```

---

### Task 10: swap `errorLogValue` → `serializeError` in auth/callback

**Files:**
- Modify: `app/auth/callback/route.ts` (remove local `errorLogValue` at `:77-81`; import `serializeError`)

**Interfaces:**
- Consumes: `serializeError` (Task 1).

- [ ] **Step 1: Add a regression test asserting the route uses the shared serializer**

```ts
// tests/log/callbackUsesSerializeError.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("auth/callback error serialization", () => {
  test("uses the shared serializeError, not a local errorLogValue", () => {
    const src = readFileSync("app/auth/callback/route.ts", "utf8");
    expect(src).not.toMatch(/function errorLogValue/);
    expect(src).toMatch(/from "@\/lib\/log\/serializeError"|from "@\/lib\/log"/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/log/callbackUsesSerializeError.test.ts`
Expected: FAIL — `function errorLogValue` still present.

- [ ] **Step 3: Edit the route**

In `app/auth/callback/route.ts`: delete the local `function errorLogValue(error: unknown) { ... }` (`:77-81`), add `import { serializeError } from "@/lib/log/serializeError";` near the other imports, and replace the three `errorLogValue(...)` call sites (`:90,105,136`) with `serializeError(...)`.

- [ ] **Step 4: Run tests to verify pass (route's own tests + the new guard)**

```bash
pnpm vitest run tests/log/callbackUsesSerializeError.test.ts tests/auth
```
Expected: PASS — no `errorLogValue`, callback auth tests still green.

- [ ] **Step 5: Commit**

```bash
git add app/auth/callback/route.ts tests/log/callbackUsesSerializeError.test.ts
git commit --no-verify -m "refactor(auth): use shared serializeError in callback route"
```

---

### Task 11: Tap auth infra producers + require emission in `_metaInfraContract`

One TDD cycle: the emission assertions added to the meta-test are the failing test; the producer taps make them pass. No separate placeholder test file.

**Files:**
- Modify: `tests/auth/_metaInfraContract.test.ts` (capturing sink + per-producer emission assertions + coverage-derived set-equality)
- Modify: `lib/auth/isAdminSession.ts`, `lib/auth/requireAdmin.ts`, `lib/auth/validateGoogleIdentity.ts`, `lib/auth/validateGoogleSession.ts`, `lib/data/adminEmails.ts`

**Interfaces:**
- Consumes: `log` (`@/lib/log`), `setLogSink`/`resetLogSink`, `LogRecord` (`@/lib/log/types`); the file's existing `infraMock` (`:62-93`) + behavioral describes (`:328-538`).
- Emission contract (level `error`; the `error` field is **omitted** so the tap has no in-scope-variable dependency):

  | Producer (INFRA_PRODUCERS) | tap location | source | code |
  | --- | --- | --- | --- |
  | `isAdminSession` | before each `infra_error` return (`:34,44,55`) | `auth/isAdminSession` | `ADMIN_SESSION_LOOKUP_FAILED` |
  | `requireAdmin` | before each prod `throw new AdminInfraError` (`:165,180,190,213,225,230`; NOT the test hooks `:126,283`) | `auth/requireAdmin` | `ADMIN_SESSION_LOOKUP_FAILED` |
  | `requireAdminIdentity` | none — shares `requireAdmin`'s `AdminInfraError` throw core; its emission assertion checks the same `auth/requireAdmin` record | `auth/requireAdmin` | `ADMIN_SESSION_LOOKUP_FAILED` |
  | `validateGoogleIdentity` | before each `status:500` return (`:50-54,78-82`) | `auth/validateGoogleIdentity` | `ADMIN_SESSION_LOOKUP_FAILED` |
  | `validateGoogleSession` | before each `status:500` return ONLY (`:68-72,87-91,103-107`; NOT 403 arms) | `auth/validateGoogleSession` | `ADMIN_SESSION_LOOKUP_FAILED` |
  | `adminEmails` | in `wrapInfra`'s `catch (err)` (`:271-279`), first statement — single funnel for all `AdminEmailsInfraError` paths | `data/adminEmails` | `ADMIN_EMAILS_INFRA` |

- [ ] **Step 1: Add the failing emission assertions to `tests/auth/_metaInfraContract.test.ts`**

Near the top of the test module, add the canonical producer list, the coverage set, the capturing sink, the helper, and the coverage check:

```ts
import { afterAll, afterEach, beforeEach } from "vitest";
import { resetLogSink, setLogSink } from "@/lib/log";
import type { LogRecord } from "@/lib/log/types";

const INFRA_PRODUCERS = [
  "isAdminSession",
  "validateGoogleIdentity",
  "validateGoogleSession",
  "requireAdmin",
  "requireAdminIdentity",
  "adminEmails",
] as const;

const coveredProducers = new Set<string>();
let emitted: LogRecord[] = [];

beforeEach(() => {
  emitted = [];
  setLogSink((r) => { emitted.push(r); });
});
afterEach(() => resetLogSink());

function assertEmits(producer: string, source: string, code: string) {
  coveredProducers.add(producer); // coverage recorded even if the assertion below fails
  expect(
    emitted.some((r) => r.level === "error" && r.source === source && r.code === code),
    `${producer} did not emit error/${source}/${code}`,
  ).toBe(true);
}

// Coverage is DERIVED from the assertEmits calls that actually ran — NOT a
// hand-copied duplicate of INFRA_PRODUCERS. A producer added to INFRA_PRODUCERS
// without an assertEmits call, or a removed tap, breaks this set-equality.
afterAll(() => {
  expect([...coveredProducers].sort()).toEqual([...INFRA_PRODUCERS].sort());
});
```

Then, inside the EXISTING behavioral test for each producer, after its typed-shape assertion, add the matching `assertEmits(...)`. Example for `isAdminSession` "construction throw" (`:336-341`):

```ts
expect(result).toEqual({ ok: false, reason: "infra_error" });
assertEmits("isAdminSession", "auth/isAdminSession", "ADMIN_SESSION_LOOKUP_FAILED");
```

Add the analogous call in the `validateGoogleIdentity` (500 path), `validateGoogleSession` (500 path), `requireAdmin`, `requireAdminIdentity`, and `lib/data/adminEmails` behavioral tests. `requireAdmin` and `requireAdminIdentity` both assert `("…","auth/requireAdmin","ADMIN_SESSION_LOOKUP_FAILED")`.

- [ ] **Step 2: Run — verify RED**

Run: `pnpm vitest run tests/auth/_metaInfraContract.test.ts`
Expected: FAIL — producers do not emit yet (each `assertEmits` `.some(...)` is `false`).

- [ ] **Step 3: Add the taps.** For each producer add `import { log } from "@/lib/log";` and insert before the relevant return/throw:

- `isAdminSession` (before `:34,44,55` returns): `await log.error("admin session lookup failed", { source: "auth/isAdminSession", code: "ADMIN_SESSION_LOOKUP_FAILED" });`
- `requireAdmin` (before each prod `throw new AdminInfraError(...)`): `await log.error("admin gate infra failure", { source: "auth/requireAdmin", code: "ADMIN_SESSION_LOOKUP_FAILED" });`
- `validateGoogleIdentity` (before each `status:500` return): `await log.error("google identity validation failed", { source: "auth/validateGoogleIdentity", code: "ADMIN_SESSION_LOOKUP_FAILED" });`
- `validateGoogleSession` (before each `status:500` return ONLY): `await log.error("google session validation failed", { source: "auth/validateGoogleSession", code: "ADMIN_SESSION_LOOKUP_FAILED" });`
- `adminEmails` (first line of `wrapInfra`'s `catch (err) {` at `:271-279`): `await log.error("admin emails infra failure", { source: "data/adminEmails", code: "ADMIN_EMAILS_INFRA" });`

No `error` field — emission needs only level/source/code; this avoids any variable-name coupling. `requireAdminIdentity` needs no tap (it shares `requireAdmin`'s throw core).

- [ ] **Step 4: Run — verify GREEN**

Run: `pnpm vitest run tests/auth/_metaInfraContract.test.ts`
Expected: PASS — every producer emits; set-equality holds.
Negative-regression: delete the `isAdminSession` tap → its `assertEmits` fails → restore it.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/isAdminSession.ts lib/auth/requireAdmin.ts lib/auth/validateGoogleIdentity.ts lib/auth/validateGoogleSession.ts lib/data/adminEmails.ts tests/auth/_metaInfraContract.test.ts
git commit --no-verify -m "feat(auth): tap infra producers to emit; require emission in meta-test"
```

---

### Task 12: Tap the non-auth silent fault sites

**Files:**
- Modify: `lib/geocoding/cache.ts`, `lib/sync/runScheduledCronSync.ts`, `app/api/report/route.ts`, `app/api/admin/onboarding/scan/route.ts`
- Test: `tests/log/nonAuthTaps.test.ts`

**Interfaces:** (each tap leaves the existing typed return/throw unchanged)

  | Site | level | code | source |
  | --- | --- | --- | --- |
  | geocode cache 4 `catch{}` (`:41-43,54-56,71-73,89-91`) | warn | — | `geocoding/cache` |
  | cron `missingShows` skip (`:2789-2795`) | info (`persist:true`) | `CONCURRENT_SYNC_SKIPPED` | `cron/sync` |
  | report `readCrewRoleFlags` catch (`:78-84`) | error | `ADMIN_SESSION_LOOKUP_FAILED` | `api/report` |
  | scan catch (`:265-266`) | error | — | `admin/onboarding/scan` (explicit `requestId` in Task 13) |

- [ ] **Step 1: Write the failing test** — one behavioral case (geocode — clean injection point, proves the runtime emission path) + three structural source-assertions (cron, report, scan — their fault is reachable only through heavy DI / a full route handler; the order-locked source-assertion deterministically catches tap removal, the real failure mode; the info+persist→persisted threshold is already unit-proven in Task 4):

```ts
// tests/log/nonAuthTaps.test.ts
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, test, vi } from "vitest";
import { resetLogSink, setLogSink } from "@/lib/log";
import type { LogRecord } from "@/lib/log/types";

function capture(): LogRecord[] { const r: LogRecord[] = []; setLogSink((x) => r.push(x)); return r; }
afterEach(() => { resetLogSink(); vi.resetModules(); vi.restoreAllMocks(); });

describe("geocode cache emits warn on infra fault (behavioral)", () => {
  test("construction throw → {kind:'infra_error'} AND warn/geocoding/cache", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseServiceRoleClient: () => { throw new Error("down"); },
    }));
    const recs = capture();
    const { readGeocodeCache } = await import("@/lib/geocoding/cache");
    const result = await readGeocodeCache("anytown");
    expect(result).toEqual({ kind: "infra_error" });
    expect(recs.some((r) => r.level === "warn" && r.source === "geocoding/cache")).toBe(true);
  });
});

describe("cron CONCURRENT_SYNC_SKIPPED tap present (structural — full cron DI is heavy)", () => {
  test("missingShows skip branch logs persisted info/cron/sync/CONCURRENT_SYNC_SKIPPED", () => {
    const src = readFileSync("lib/sync/runScheduledCronSync.ts", "utf8").replace(/\s+/g, " ");
    // order-locked to the tap object literal (source → code → … → persist:true),
    // [^}]* stays within the object so unrelated statements can't satisfy it.
    expect(src).toMatch(
      /log\.info\([^}]*source:\s*["']cron\/sync["'][^}]*code:\s*["']CONCURRENT_SYNC_SKIPPED["'][^}]*persist:\s*true/,
    );
  });
});

describe("report + scan taps present (structural — fault reachable only via full route)", () => {
  test("report readCrewRoleFlags catch logs api/report + ADMIN_SESSION_LOOKUP_FAILED", () => {
    const src = readFileSync("app/api/report/route.ts", "utf8").replace(/\s+/g, " ");
    expect(src).toMatch(/source:\s*["']api\/report["']/);
    expect(src).toMatch(/log\.(error|warn)\(/);
    expect(src).toMatch(/code:\s*["']ADMIN_SESSION_LOOKUP_FAILED["']/);
  });
  test("onboarding scan catch logs source admin/onboarding/scan", () => {
    const src = readFileSync("app/api/admin/onboarding/scan/route.ts", "utf8").replace(/\s+/g, " ");
    expect(src).toMatch(/log\.error\([^)]*source:\s*["']admin\/onboarding\/scan["']/);
  });
});
```

> Only the geocode case uses runtime injection (`vi.doMock` + dynamic import); `vi.resetModules()` in `afterEach` stops that mock from leaking through the module cache. The cron/report/scan cases are pure source-assertions (no module load), so they need no mocking. The cron regex is order-locked to the tap object literal written in Step 4, so it fails if the tap is removed or its `persist:true`/`code` is dropped.

- [ ] **Step 2: Run — verify it fails**

Run: `pnpm vitest run tests/log/nonAuthTaps.test.ts`
Expected: FAIL — no taps yet.

- [ ] **Step 3: Edit `lib/geocoding/cache.ts`** — add `import { log } from "@/lib/log";`, and inside each of the four `} catch {` blocks before `return { kind: "infra_error" }`:

```ts
      void log.warn("geocode cache infra fault", { source: "geocoding/cache" });
```

- [ ] **Step 4: Edit `lib/sync/runScheduledCronSync.ts`** — add `import { log } from "@/lib/log";`, and in the `missingShows` loop's `if ("skipped" in result) {` branch (`:2789-2795`) before `continue;`:

```ts
      await log.info("missing-show sync skipped on lock contention", {
        source: "cron/sync",
        code: "CONCURRENT_SYNC_SKIPPED",
        driveFileId: show.driveFileId,
        persist: true,
      });
```

- [ ] **Step 5: Edit `app/api/report/route.ts`** — add `import { log } from "@/lib/log";`, in `readCrewRoleFlags`'s bare `} catch {` (`:78`) before the return:

```ts
    void log.error("crew role flags read failed", {
      source: "api/report",
      code: "ADMIN_SESSION_LOOKUP_FAILED",
    });
```

- [ ] **Step 6: Edit `app/api/admin/onboarding/scan/route.ts`** — add `import { log } from "@/lib/log";`, in the `} catch {` (`:265`) before `emit({ type: "result", body: { ok: false, code: null } })`:

```ts
        void log.error("onboarding scan failed", { source: "admin/onboarding/scan" });
```

(Task 13 adds `requestId: scanRequestId` to this call.)

- [ ] **Step 7: Run — verify GREEN**

Run: `pnpm vitest run tests/log/nonAuthTaps.test.ts`
Expected: PASS (4 describes).

- [ ] **Step 8: Commit**

```bash
git add lib/geocoding/cache.ts lib/sync/runScheduledCronSync.ts app/api/report/route.ts app/api/admin/onboarding/scan/route.ts tests/log/nonAuthTaps.test.ts
git commit --no-verify -m "feat(sync): tap non-auth silent fault sites to emit logs"
```

---

### Task 13: Correlation seeding (ALS wrap + explicit capture)

**Files:**
- Modify: `app/api/cron/sync/route.ts`, `app/api/report/route.ts`, `app/api/admin/sync/[slug]/route.ts`, `app/api/admin/staged/[fileId]/apply/route.ts`, `app/api/auth/picker-bootstrap/route.ts` (ALS); `app/api/admin/onboarding/scan/route.ts` (explicit capture)
- Test: `tests/log/correlationSeeding.test.ts`

**Interfaces:** Consumes `runWithRequestContext`, `deriveRequestId` (`@/lib/log`).

- [ ] **Step 1: Write the failing structural test (RED driver — fails until routes are wrapped)**

```ts
// tests/log/correlationSeeding.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const ALS_HANDLERS = [
  "app/api/cron/sync/route.ts",
  "app/api/report/route.ts",
  "app/api/admin/sync/[slug]/route.ts",
  "app/api/admin/staged/[fileId]/apply/route.ts",
  "app/api/auth/picker-bootstrap/route.ts",
];

describe("correlation seeding", () => {
  test.each(ALS_HANDLERS)("%s wraps handler in runWithRequestContext + deriveRequestId", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src, `${file} must wrap its handler`).toMatch(/runWithRequestContext\(/);
    expect(src, `${file} must derive a request id`).toMatch(/deriveRequestId\(/);
  });

  test("onboarding scan uses an explicit captured requestId", () => {
    const src = readFileSync("app/api/admin/onboarding/scan/route.ts", "utf8");
    expect(src).toMatch(/const scanRequestId = deriveRequestId\(/);
    expect(src).toMatch(/requestId:\s*scanRequestId/);
  });
});
```

- [ ] **Step 2: Run — verify RED**

Run: `pnpm vitest run tests/log/correlationSeeding.test.ts`
Expected: FAIL — no handler wraps yet.

- [ ] **Step 3: Wrap the 5 awaited handlers.** For each, add `import { deriveRequestId, runWithRequestContext } from "@/lib/log";` and wrap the WHOLE handler body, preserving the exact signature and return type:

```ts
export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  return runWithRequestContext({ requestId: deriveRequestId(request.headers) }, async () => {
    /* …existing body, unchanged… */
  });
}
```

Read each route's real export first and match it: `cron/sync` and `picker-bootstrap` may be `GET`/`POST` with one `request` arg; the admin routes take a 2nd `{ params }` arg. Keep the body's existing request variable name. (If a handler reads the request body, ensure the wrap is inside the same function so `request` is still in scope — it is, since we wrap the body, not replace the signature.)

- [ ] **Step 4: Explicit capture in the scan route.** In `app/api/admin/onboarding/scan/route.ts` add `import { deriveRequestId } from "@/lib/log";`, and near the top of the handler (before the `ReadableStream` is constructed) add:

```ts
  const scanRequestId = deriveRequestId(request.headers);
```

Change the Task-12 scan tap to: `void log.error("onboarding scan failed", { source: "admin/onboarding/scan", requestId: scanRequestId });`

- [ ] **Step 5: Run — verify GREEN**

Run: `pnpm vitest run tests/log/correlationSeeding.test.ts`
Expected: PASS (6 cases).

- [ ] **Step 6: Run the affected route + sync tests to confirm behavior unchanged**

Run: `pnpm vitest run tests/api tests/auth tests/sync tests/log`
Expected: PASS (or the identical pre-existing failure set as the merge-base — verify any failure is pre-existing, not introduced).

- [ ] **Step 7: Commit**

```bash
git add app/api/cron/sync/route.ts app/api/report/route.ts "app/api/admin/sync/[slug]/route.ts" "app/api/admin/staged/[fileId]/apply/route.ts" app/api/auth/picker-bootstrap/route.ts app/api/admin/onboarding/scan/route.ts tests/log/correlationSeeding.test.ts
git commit --no-verify -m "feat(log): seed request correlation at handlers (ALS + explicit capture)"
```

---

### Task 14: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck + lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: clean. Watch `exactOptionalPropertyTypes`: `LogRecord` fields are definite `| null`, so the persist mapping never passes `undefined`.

- [ ] **Step 2: Full test suite** (the optional-field shape-sweep lesson: enriching shapes can break exact `toEqual` across families)

Run: `pnpm test`
Expected: PASS. If anything fails, confirm pre-existing vs introduced at the merge-base before proceeding.

- [ ] **Step 3: Confirm no advisory-lock topology change**

Run: `pnpm vitest run tests/auth/advisoryLockRpcDeadlock.test.ts`
Expected: PASS, unchanged.

- [ ] **Step 4: Commit any final fixes;** otherwise proceed to whole-diff review.

---

### Task 15: Self-review

Run the writing-plans self-review checklist (spec coverage, placeholder scan, type consistency). Fix inline.

---

### Task 16: Adversarial review (cross-model)

Invoke the `adversarial-review` skill (Codex) on this plan. Iterate to APPROVE (no round budget per AGENTS.md autonomous-ship). Do NOT proceed to execution handoff until APPROVED.

---

### Task 17: Execution handoff

After adversarial APPROVE, execute via subagent-driven-development (fresh subagent per task, two-stage review) or inline executing-plans.
