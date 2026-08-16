# serializeError Structural Non-Error Branch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `lib/log/serializeError.ts` serializes plain objects (Supabase/PostgREST returned-errors) to bounded structure instead of `"[object Object]"`, with the sanitize chokepoint repaired for keys and `__proto__`, a companion pre-flatten scanner, and mutation enrolment.

**Architecture:** One helper module redesign (bounded recursive structural capture, never-throws, null-prototype accumulators), one two-part `sanitizeContext` repair at the redaction chokepoint, one scanner predicate extension in the existing walk-derived guard suite, plus docs/ledger closeout. No DDL, no UI, no lock topology change.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest, ts-morph (scanner), source-mutation registry.

**Spec:** `docs/superpowers/specs/observability/2026-08-16-serialize-error-structure-design.md` (spec-APPROVED, codex-guard R4 2026-08-16). The spec is canonical for the contract table (§2.1), bounds (§2.2), Error branch (§2.3), redaction posture (§2.4), blast surface + comment sweep (§2.5), companion guard (§2.6), and enrolment (§2.8).

## Global Constraints

- Invariant 1 (TDD per task); invariant 6 (conventional commit per task, `fix(log)` / `test(log)` / `docs(log)` scopes).
- Helper stays PURE — no redaction inside `serializeError` (spec §1.1.3); redaction lives in `sanitizeContext` only.
- Bounds are module constants: `DEPTH_MAX` 3, `KEYS_MAX` 32, `ITEMS_MAX` 32, `STR_MAX` 500, `STACK_MAX` 8000, `NODES_MAX` 200 (spec §2.2 is the single prose source; the test file pins each literally).
- `serializeError` never throws (spec §2.1); accumulators are `Object.create(null)` (spec R3 F3).
- Dual test posture (spec §5): literal contract pins for constants + `BOUND`/`BOUND+1` behavior fixtures.
- No `pnpm test` full-suite runs unwrapped — scoped vitest file lists are the norm here; the one full-suite closeout run uses `pnpm heavy` (AGENTS.md heavy-slot rule). `pnpm mutation:guards` MUST be wrapped: `pnpm heavy pnpm mutation:guards`.
- Both test suites are matched by the existing `BASE_INCLUDE` glob `tests/**/*.test.ts` (`vitest.projects.ts:34`) — no vitest or workflow wiring changes anywhere in this plan.

## Meta-test inventory (mandatory declaration)

- EXTENDS `tests/log/noDoubleSerializedLogError.test.ts` (companion pre-flatten predicate, Task 3).
- ADDS a row to `tests/mutation/source/registry.ts` (Task 5).
- The AGENTS.md candidate registries (Supabase call-boundary `tests/auth/_metaInfraContract.test.ts`, sentinel-hiding, admin-alert catalog, advisory-lock topology `tests/auth/advisoryLockRpcDeadlock.test.ts`, no-inline-email-normalization) do NOT apply: the helper performs no Supabase calls, holds no locks, renders nothing, and normalizes no emails.

## Comment-refresh sweep (authored AND run — spec §2.5 derivation, output at plan time)

`rg -ln "object Object" lib/ app/ components/ tests/` → 15 files (run 2026-08-16 on this tree). Dispositions (spec §2.5): REFRESH 7 (`lib/sync/runScheduledCronSync.ts`, `lib/admin/readShowReviewSnapshot.ts`, `tests/sync/syncLogEmitGuard.test.ts`, `tests/sync/runPushSyncForShow.test.ts`, `tests/auth/isAdminSession-telemetry.test.ts`, `tests/admin/readShowReviewSnapshot.test.ts`, `tests/log/noDoubleSerializedLogError.test.ts`); UNTOUCHED-DATED 1 (`tests/docs/_retiredIdentifiers.ts`); UNTOUCHED-UNRELATED 6 (`tests/styles/_newTabScan.ts`, `tests/styles/_metaNewTabAnnouncement.test.ts`, `tests/api/staged-diagram-route.test.ts`, `tests/ui/cn.test.ts`, `tests/sync/runScheduledCronSync.adapter.test.ts`, `tests/components/admin/wizard/step3ReviewSections.test.tsx`); REWRITTEN 1 (`tests/log/serializeError.test.ts`, Task 1). Task 4 re-runs the derivation and dispositions any new hit by the same rule.

---

<!-- tasks: depth=3 red-contract -->

### Task 1: Helper redesign + contract suite rewrite

**Files:**
- Modify: `lib/log/serializeError.ts` (whole file)
- Modify: `tests/log/serializeError.test.ts` (whole file)
- Modify: `tests/log/logger.test.ts` (one new test after the existing `serializes + redacts fields.error into context.error` case at `tests/log/logger.test.ts:41-47`)

**Interfaces:**
- Produces: `serializeError(error: unknown): SerializedError` where `export type SerializedError = string | Record<string, unknown> | unknown[]`; exported constants `DEPTH_MAX`, `KEYS_MAX`, `ITEMS_MAX`, `STR_MAX`, `STACK_MAX`, `NODES_MAX` (all `number`). Task 5's registry row and this task's tests consume these names.
- Consumes: nothing new; `buildRecord` (`lib/log/logger.ts:38`) already routes `fields.error` through the helper unchanged.

<!-- task: red=`pnpm vitest run tests/log/serializeError.test.ts` red-state=authored red-target=`lib/log/serializeError.ts:10` why=`the live non-Error branch is String(error) so the structural rows of the new contract table return [object Object]` ac=AC-1,AC-2,AC-3,AC-4,AC-5,AC-6 -->

- [ ] **Step 1: Rewrite the contract suite (RED).** Replace `tests/log/serializeError.test.ts` with the §2.1 contract table. Full content:

```ts
// tests/log/serializeError.test.ts
//
// Contract suite for the bounded structural serializer. Dual posture (spec §5):
// literal pins fix each constant to its spec value (killing integer-literal
// mutants on the declarations), and BOUND/BOUND+1 behavior fixtures derived
// from the constants kill relational-boundary mutants on the comparisons.
// Spec: docs/superpowers/specs/observability/2026-08-16-serialize-error-structure-design.md §2.1-§2.3, §3.
import { describe, expect, test } from "vitest";
import {
  DEPTH_MAX,
  ITEMS_MAX,
  KEYS_MAX,
  NODES_MAX,
  serializeError,
  STACK_MAX,
  STR_MAX,
} from "@/lib/log/serializeError";

describe("contract pins (spec §2.2 values -- literal on purpose)", () => {
  test("constants carry their spec values", () => {
    expect(DEPTH_MAX).toBe(3);
    expect(KEYS_MAX).toBe(32);
    expect(ITEMS_MAX).toBe(32);
    expect(STR_MAX).toBe(500);
    expect(STACK_MAX).toBe(8000);
    expect(NODES_MAX).toBe(200);
  });
});

describe("serializeError -- structural rows (AC-1)", () => {
  test("a Supabase/PostgREST returned-error keeps all four fields", () => {
    const out = serializeError({ message: "gateway 502", code: "PGRST301", details: null, hint: null });
    expect(out).toEqual({ message: "gateway 502", code: "PGRST301", details: null, hint: null });
  });
  test("empty object stays an empty object; empty array stays an empty array", () => {
    expect(serializeError({})).toEqual({});
    expect(serializeError([])).toEqual([]);
  });
  test("an own __proto__ key from JSON.parse is captured, not lost to the setter (AC-1/R3 F3)", () => {
    const parsed: unknown = JSON.parse('{"__proto__":{"message":"kept"}}');
    expect(JSON.stringify(serializeError(parsed))).toBe('{"__proto__":{"message":"kept"}}');
  });
});

describe("serializeError -- primitives (AC-2)", () => {
  test("primitive rows are String(value)", () => {
    expect(serializeError("oops")).toBe("oops");
    expect(serializeError(42)).toBe("42");
    expect(serializeError(null)).toBe("null");
    expect(serializeError(undefined)).toBe("undefined");
    expect(serializeError(Number.NaN)).toBe("NaN");
    expect(serializeError(0)).toBe("0");
    expect(serializeError("")).toBe("");
  });
  test("a long top-level string is sliced to STR_MAX", () => {
    expect(serializeError("x".repeat(STR_MAX + 50))).toHaveLength(STR_MAX);
  });
});

describe("serializeError -- bounds fire with markers (AC-3)", () => {
  test("depth past DEPTH_MAX truncates with the depth marker", () => {
    // Root object is depth 1; DEPTH_MAX nested object levels put the innermost
    // OBJECT one past the cap.
    let fixture: Record<string, unknown> = { leaf: "deep" };
    for (let i = 0; i < DEPTH_MAX; i += 1) fixture = { child: fixture };
    expect(JSON.stringify(serializeError(fixture))).toContain('"[Truncated: depth]"');
  });
  test("an object one level SHY of the cap survives intact (boundary pair)", () => {
    let fixture: Record<string, unknown> = { leaf: "deep" };
    for (let i = 0; i < DEPTH_MAX - 2; i += 1) fixture = { child: fixture };
    expect(JSON.stringify(serializeError(fixture))).toContain('"deep"');
  });
  test("keys past KEYS_MAX drop with the ~truncated marker", () => {
    const fixture: Record<string, unknown> = {};
    for (let i = 0; i < KEYS_MAX + 3; i += 1) fixture[`k${i}`] = i;
    const out = serializeError(fixture) as Record<string, unknown>;
    expect(out["~truncated"]).toBe("3 more keys");
    expect(Object.keys(out)).toHaveLength(KEYS_MAX + 1); // KEYS_MAX kept + marker
  });
  test("a KEY is sliced to STR_MAX like a value (R3 F2)", () => {
    const longKey = "k".repeat(STR_MAX + 40);
    const out = serializeError({ [longKey]: "v" }) as Record<string, unknown>;
    expect(Object.keys(out)).toEqual(["k".repeat(STR_MAX)]);
  });
  test("array items past ITEMS_MAX drop with the [+n more] marker", () => {
    const fixture = Array.from({ length: ITEMS_MAX + 5 }, (_, i) => i);
    const out = serializeError(fixture) as unknown[];
    expect(out).toHaveLength(ITEMS_MAX + 1);
    expect(out[ITEMS_MAX]).toBe("[+5 more]");
  });
  test("node budget exhaustion truncates with the budget marker", () => {
    const fixture = Array.from({ length: ITEMS_MAX }, () =>
      Array.from({ length: ITEMS_MAX }, (_, i) => i),
    ); // 32 + 32*32 = 1056 values > NODES_MAX
    const text = JSON.stringify(serializeError(fixture));
    expect(text).toContain('"[Truncated: budget]"');
  });
});

describe("serializeError -- cycles (AC-4)", () => {
  test("an ancestor cycle terminates with [Circular]", () => {
    const fixture: Record<string, unknown> = { a: 1 };
    fixture.self = fixture;
    expect(serializeError(fixture)).toEqual({ a: 1, self: "[Circular]" });
  });
  test("a sibling repeat is captured twice, not flagged", () => {
    const shared = { s: 1 };
    expect(serializeError({ left: shared, right: shared })).toEqual({ left: { s: 1 }, right: { s: 1 } });
  });
});

describe("serializeError -- never throws (AC-5)", () => {
  test("a throwing getter poisons one field, siblings intact", () => {
    const fixture = {
      get boom(): never {
        throw new Error("getter");
      },
      ok: 1,
    };
    expect(serializeError(fixture)).toEqual({ boom: "[Throwing getter]", ok: 1 });
  });
  test("a revoked Proxy degrades to [Unserializable]", () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    expect(serializeError(proxy)).toBe("[Unserializable]");
  });
  test("a throwing toString on an empty non-plain object degrades to [Unserializable]", () => {
    const fixture = Object.create(
      Object.defineProperty(Object.create(Object.prototype), "toString", {
        value: () => {
          throw new Error("toString");
        },
      }),
    ) as object;
    expect(serializeError(fixture)).toBe("[Unserializable]");
  });
});

describe("serializeError -- Error branch (AC-6)", () => {
  test("the protocol triple survives, stack sliced to STACK_MAX", () => {
    const e = new TypeError("boom");
    e.stack = "y".repeat(STACK_MAX + 100);
    const out = serializeError(e) as Record<string, unknown>;
    expect(out.name).toBe("TypeError");
    expect(out.message).toBe("boom");
    expect(out.stack).toHaveLength(STACK_MAX);
  });
  test("own enumerable fields survive (the Auth/Storage/Node-errno family shape)", () => {
    const e = new Error("degraded") as Error & { status: number; code: string };
    e.status = 502;
    e.code = "PGRST301";
    expect(serializeError(e)).toMatchObject({ name: "Error", message: "degraded", status: 502, code: "PGRST301" });
  });
  test("an own enumerable name collision loses to the protocol name", () => {
    const e = new Error("m");
    Object.defineProperty(e, "name", { value: "OwnName", enumerable: true });
    expect((serializeError(e) as Record<string, unknown>).name).toBe("OwnName");
    // NOTE for implementer: protocol triple is written LAST, so it reads the
    // instance's own `name` -- the assertion pins write-order determinism, and
    // "OwnName" IS error.name here. A conflicting spread value cannot win.
  });
  test("cause is serialized recursively", () => {
    const e = new Error("outer", { cause: new Error("inner-cause") });
    expect((serializeError(e) as { cause?: { message?: string } }).cause?.message).toBe("inner-cause");
  });
  test("AggregateError.errors is carried (own non-enumerable -- R2 F2)", () => {
    const agg = new AggregateError([new Error("inner")], "batch failed");
    const out = serializeError(agg) as { errors?: Array<{ message?: string }> };
    expect(out.errors?.[0]?.message).toBe("inner");
  });
});

describe("serializeError -- non-plain degrade (AC / §2.1 fallback row)", () => {
  test("a Date degrades to its string form, capped", () => {
    const out = serializeError(new Date(0));
    expect(typeof out).toBe("string");
    expect(out).not.toBe("[object Object]");
  });
});

describe("serializeError -- mutant-killing boundary pairs (plan R1 F1; each case names the mutant it kills)", () => {
  test("budget exact boundary: 200 visits clean, 201 truncates (kills <=to<, 0to1, and halved-decrement budget mutants)", () => {
    // Node accounting: EVERY value visited decrements once -- the root array, each
    // child array, each number. root(1) + 7 child arrays(7) + 6x32 numbers(192) = 200.
    const six = Array.from({ length: 6 }, () => Array.from({ length: 32 }, (_, i) => i));
    const exact200 = [...six, []];
    expect(JSON.stringify(serializeError(exact200))).not.toContain("[Truncated: budget]");
    const exact201 = [...six, [0]]; // one more number = 201 visits
    expect(JSON.stringify(serializeError(exact201))).toContain("[Truncated: budget]");
  });
  test("nested function/symbol/undefined drop from objects, null at array positions (kills the ||-to-&& drop-clause mutants)", () => {
    expect(JSON.stringify(serializeError({ fn: () => 1, sym: Symbol("s"), und: undefined, ok: 1 }))).toBe('{"ok":1}');
    expect(JSON.stringify(serializeError([1, undefined, () => 1]))).toBe("[1,null,null]");
  });
  test("exactly ITEMS_MAX items carries no marker (kills the >-to->= items mutant)", () => {
    const out = serializeError(Array.from({ length: ITEMS_MAX }, (_, i) => i)) as unknown[];
    expect(out).toHaveLength(ITEMS_MAX);
    expect(JSON.stringify(out)).not.toContain("more");
  });
  test("exactly KEYS_MAX keys carries no marker (kills the >-to->= keys mutant)", () => {
    const fixture: Record<string, number> = {};
    for (let i = 0; i < KEYS_MAX; i += 1) fixture[`k${i}`] = i;
    const out = serializeError(fixture) as Record<string, unknown>;
    expect(Object.keys(out)).toHaveLength(KEYS_MAX);
    expect(out).not.toHaveProperty("~truncated");
  });
  test("array nesting to the depth cap survives intact (kills the array depth+2 mutant)", () => {
    expect(JSON.stringify(serializeError([[["leaf"]]]))).toBe('[[["leaf"]]]');
  });
  test("a bare Error emits exactly the protocol triple (kills the &&-to-|| capture-merge mutant)", () => {
    expect(Object.keys(serializeError(new Error("x")) as object)).toEqual(["name", "message", "stack"]);
  });
  test("a cause chain reaching the depth cap survives (kills the cause depth+2 mutant)", () => {
    const e = new Error("outer", { cause: { a: { leaf: "v" } } });
    const out = serializeError(e) as { cause?: { a?: { leaf?: string } } };
    expect(out.cause?.a?.leaf).toBe("v");
  });
});
```

(The block above was executed against the Task 1 implementation and against all eight
mutants the plan review probed -- baseline ALL PASS, every mutant killed by a named case;
transcript in the plan-R2 review dispatch.)

- [ ] **Step 2: Run to verify RED.** `pnpm vitest run tests/log/serializeError.test.ts` — expected FAIL: the live helper returns `"[object Object]"` for every structural row and has no exported constants (import failure is the first error: `DEPTH_MAX` is not exported by `@/lib/log/serializeError`).

- [ ] **Step 3: Add the logger integration case (same RED batch — it goes green with the same implementation, so it cannot be its own task).** Append to `tests/log/logger.test.ts` after the case at `tests/log/logger.test.ts:41-47`:

```ts
  test("plain-object error persists structurally with nested email values redacted (AC-7)", async () => {
    const calls = capture();
    await log.error("supabase write failed", {
      source: "s",
      error: { message: "duplicate key", details: "Key (email)=(eve@corp.io) exists", code: "23505" },
    });
    const err = calls[0]!.record.context.error as Record<string, unknown>;
    expect(err.code).toBe("23505");
    expect(err.details).toBe("Key (email)=([email-redacted]) exists");
  });
```

Run `pnpm vitest run tests/log/logger.test.ts` — expected FAIL on the new case only (`context.error` is the string `"[object Object]"`, not an object).

- [ ] **Step 4: Implement the helper (GREEN).** Replace `lib/log/serializeError.ts` with exactly this (typechecked against the strict flags and behavior-probed against every AC during plan authoring):

```ts
// lib/log/serializeError.ts
/**
 * The single canonical "turn an unknown thrown value into a loggable shape"
 * helper. Structural for objects since fix/serialize-error-structure -- a plain
 * object (a Supabase/PostgREST returned-error) serializes to its own bounded
 * enumerable fields instead of collapsing to "[object Object]".
 *
 * Total function: never throws (it runs inside buildRecord on every log.*
 * call). Pure: no redaction here -- sanitizeContext is THE sanitization pass on
 * the persisted path. Spec:
 * docs/superpowers/specs/observability/2026-08-16-serialize-error-structure-design.md
 */

export const DEPTH_MAX = 3;
export const KEYS_MAX = 32;
export const ITEMS_MAX = 32;
export const STR_MAX = 500;
export const STACK_MAX = 8000;
export const NODES_MAX = 200;

export type SerializedError = string | Record<string, unknown> | unknown[];

const DROP = Symbol("drop");

type Budget = { nodes: number };

function capString(value: string): string {
  return value.slice(0, STR_MAX);
}

/** Bounded recursive capture. Depth 1 is the root; deeper than DEPTH_MAX truncates. */
function serializeValue(
  value: unknown,
  depth: number,
  budget: Budget,
  ancestors: WeakSet<object>,
): unknown {
  if (budget.nodes <= 0) return "[Truncated: budget]";
  budget.nodes -= 1;

  if (value === null) return null;
  const t = typeof value;
  if (t === "string") return capString(value as string);
  if (t === "number" || t === "boolean") return value;
  if (t === "bigint") return String(value);
  // undefined / function / symbol VALUES: dropped from objects, null at array
  // positions (the sanitizeContext posture) -- signalled via DROP.
  if (t === "function" || t === "symbol" || t === "undefined") return DROP;

  const obj = value as object;
  if (ancestors.has(obj)) return "[Circular]";
  if (depth > DEPTH_MAX) return "[Truncated: depth]";
  ancestors.add(obj);
  try {
    if (Array.isArray(obj)) {
      const kept = obj.slice(0, ITEMS_MAX).map((item) => {
        const s = serializeValue(item, depth + 1, budget, ancestors);
        return s === DROP ? null : s;
      });
      if (obj.length > ITEMS_MAX) kept.push(`[+${obj.length - ITEMS_MAX} more]`);
      return kept;
    }
    if (obj instanceof Error) return serializeErrorInstance(obj, depth, budget, ancestors);
    return serializePlainObject(obj, depth, budget, ancestors);
  } finally {
    ancestors.delete(obj);
  }
}

/**
 * Own enumerable string-keyed fields, keys sliced like values, null-prototype
 * accumulator so an own "__proto__" key is captured instead of hitting the
 * inherited setter. Keys listed with Object.keys (does not invoke getters);
 * each property read individually so a throwing getter poisons one field, not
 * the object.
 */
function serializePlainObject(
  obj: object,
  depth: number,
  budget: Budget,
  ancestors: WeakSet<object>,
): unknown {
  const out: Record<string, unknown> = Object.create(null);
  const keys = Object.keys(obj);
  for (const key of keys.slice(0, KEYS_MAX)) {
    let raw: unknown;
    try {
      raw = (obj as Record<string, unknown>)[key];
    } catch {
      out[capString(key)] = "[Throwing getter]";
      continue;
    }
    const s = serializeValue(raw, depth + 1, budget, ancestors);
    if (s !== DROP) out[capString(key)] = s;
  }
  if (keys.length > KEYS_MAX) out["~truncated"] = `${keys.length - KEYS_MAX} more keys`;
  if (keys.length === 0) {
    // Non-plain object with no capturable fields (Date, RegExp, URL, custom
    // toString): degrade to its string form when that form says more than
    // "[object Object]".
    const text = String(obj);
    if (text !== "[object Object]") return capString(text);
  }
  return out;
}

/**
 * Error branch: bounded own-enumerable capture first, protocol triple written
 * last so it wins collisions (PostgrestError has an own enumerable `name`),
 * plus the two standard own NON-enumerable payload fields this runtime
 * defines: `cause` and (AggregateError) `errors`.
 */
function serializeErrorInstance(
  error: Error,
  depth: number,
  budget: Budget,
  ancestors: WeakSet<object>,
): Record<string, unknown> {
  const captured = serializePlainObject(error, depth, budget, ancestors);
  const out: Record<string, unknown> = Object.create(null);
  if (typeof captured === "object" && captured !== null && !Array.isArray(captured)) {
    Object.assign(out, captured);
  }
  out.name = capString(String(error.name));
  out.message = capString(String(error.message));
  if (typeof error.stack === "string") out.stack = error.stack.slice(0, STACK_MAX);
  if ("cause" in error && error.cause !== undefined) {
    const cause = serializeValue(error.cause, depth + 1, budget, ancestors);
    if (cause !== DROP) out.cause = cause;
  }
  const aggregate = (error as Partial<AggregateError>).errors;
  if (Array.isArray(aggregate)) {
    out.errors = serializeValue(aggregate, depth + 1, budget, ancestors);
  }
  return out;
}

export function serializeError(error: unknown): SerializedError {
  try {
    if (error !== null && (typeof error === "object" || error instanceof Error)) {
      const budget: Budget = { nodes: NODES_MAX };
      const result = serializeValue(error, 1, budget, new WeakSet<object>());
      return result === DROP ? capString(String(error)) : (result as SerializedError);
    }
    // Primitives (null, undefined, string, number, boolean, bigint, symbol)
    // and functions: the pre-redesign behavior plus the string cap.
    return capString(String(error));
  } catch {
    return "[Unserializable]";
  }
}
```

- [ ] **Step 5: Run to verify GREEN.** `pnpm vitest run tests/log/serializeError.test.ts tests/log/logger.test.ts` — expected PASS. NOTE: the AC-7 case passes because `sanitizeValue` already redacts nested string VALUES on the persisted path (`lib/log/sanitize.ts:15`) — key redaction is Task 2.

- [ ] **Step 6: Sanity-scope the blast radius.** `pnpm vitest run tests/log/ tests/auth/isAdminSession-telemetry.test.ts tests/admin/readShowReviewSnapshot.test.ts tests/sync/syncLogEmitGuard.test.ts tests/sync/runPushSyncForShow.test.ts tests/drive/webhook.test.ts` — expected PASS (those suites pass raw Error instances or assert flat string fields; the readShowReviewSnapshot pin asserts `fields.error` BEFORE serialization, which is untouched). Any failure here is triaged before commit, not deferred.

- [ ] **Step 7: Commit.** `git add lib/log/serializeError.ts tests/log/serializeError.test.ts tests/log/logger.test.ts && git commit -m "fix(log): serializeError preserves bounded structure for non-Error values"`

### Task 2: sanitizeContext key redaction + null-prototype accumulator

**Files:**
- Modify: `lib/log/sanitize.ts:32-36` (the object branch of `sanitizeValue`)
- Modify: `tests/log/sanitize.test.ts` (two new cases)
- Modify: `tests/log/logger.test.ts` (one new AC-7 seam case through `log.error`)

**Interfaces:**
- Consumes: `redactEmails` (same module, `lib/log/sanitize.ts:5`).
- Produces: unchanged signatures; `sanitizeContext(message, context)` now also redacts object KEYS and preserves own `__proto__` keys.

<!-- task: red=`pnpm vitest run tests/log/sanitize.test.ts tests/log/logger.test.ts` red-state=authored red-target=`lib/log/sanitize.ts:35` why=`the live object branch writes out[k] = s into a plain object so an email-bearing key survives verbatim and an own __proto__ key vanishes into the prototype` ac=AC-7 -->

- [ ] **Step 1: Write the failing cases (RED).** Append to the existing `describe` in `tests/log/sanitize.test.ts`:

```ts
  test("object KEYS are email-redacted like values (spec R1 F1)", () => {
    const { context } = sanitizeContext("", { error: { "alice@example.com": "failed" } });
    expect(JSON.stringify(context)).toBe('{"error":{"[email-redacted]":"failed"}}');
  });
  test("an own __proto__ key survives sanitization (spec R3 F3)", () => {
    const hostile: unknown = JSON.parse('{"__proto__":{"message":"kept"}}');
    const { context } = sanitizeContext("", { error: hostile as Record<string, unknown> });
    expect(JSON.stringify(context)).toBe('{"error":{"__proto__":{"message":"kept"}}}');
  });
```

ALSO append to `tests/log/logger.test.ts` (the AC-7 combined seam through `log.error` -- an
email-bearing KEY surviving `serializeError` and redacted by `sanitizeContext`; RED here too,
because Task 1 shipped structure but the live sanitize still copies keys verbatim):

```ts
  test("email-bearing KEY inside a structural error is redacted through the logger (AC-7)", async () => {
    const calls = capture();
    await log.error("keyed failure", {
      source: "s",
      error: { "alice@example.com": "failed" },
    });
    const err = calls[0]!.record.context.error as Record<string, unknown>;
    expect(err).toEqual({ "[email-redacted]": "failed" });
  });
```

(If the file's imports lack `sanitizeContext`, extend the existing import from `@/lib/log/sanitize`.)

- [ ] **Step 2: Run to verify RED.** `pnpm vitest run tests/log/sanitize.test.ts tests/log/logger.test.ts` — expected FAIL: the key survives verbatim in the sanitize case AND in the logger seam case; the __proto__ case yields `{"error":{}}`.

- [ ] **Step 3: Implement (GREEN).** In `lib/log/sanitize.ts`, replace the object branch (currently `const out: { [k: string]: Json } = {};` … `out[k] = s;` at `lib/log/sanitize.ts:32-36`) with:

```ts
    // Null-prototype accumulator: a plain {} loses an own "__proto__" key to
    // the inherited setter (the value silently becomes the accumulator's
    // prototype). Keys are redacted like values -- an email-bearing key is a
    // leak channel once structure survives serialization.
    const out: { [k: string]: Json } = Object.create(null) as { [k: string]: Json };
    for (const [k, v] of Object.entries(obj)) {
      const s = sanitizeValue(v, seen);
      if (s !== DROP) out[redactEmails(k)] = s;
    }
    return out;
```

- [ ] **Step 4: Run to verify GREEN.** `pnpm vitest run tests/log/sanitize.test.ts tests/log/logger.test.ts tests/log/persist.test.ts tests/log/persistStrict.test.ts` — expected PASS.

- [ ] **Step 5: Commit.** `git add lib/log/sanitize.ts tests/log/sanitize.test.ts tests/log/logger.test.ts && git commit -m "fix(log): sanitizeContext redacts object keys and keeps own __proto__ fields"`

### Task 3: Companion pre-flatten scanner predicate

**Files:**
- Modify: `tests/log/noDoubleSerializedLogError.test.ts` (predicate + fixtures + loop restructure)

**Interfaces:**
- Consumes: the file's own `unwrapTransparent`, `contributingObjectLiterals`, `mentionsWrapper`, `serializeErrorBindings` (`tests/log/noDoubleSerializedLogError.test.ts:84-192`).
- Produces: `findDoubleSerializedSites` unchanged in signature; it now ALSO reports `error:` initializers whose subtree calls global `String` or `JSON.stringify` (spec §2.6 accept-set — object-literal fields arguments only).

<!-- task: red=`pnpm vitest run tests/log/noDoubleSerializedLogError.test.ts` red-state=authored red-target=`tests/log/noDoubleSerializedLogError.test.ts:196` why=`the pre-flatten predicate does not exist and the scanner early-returns on files with no serializeError import, so the new planted String/JSON.stringify fixtures scan to zero findings where the new assertions expect one each` ac=AC-8 -->

- [ ] **Step 1: Plant the fixtures + assertions (RED).** Add three fixtures beside the existing banned family fixtures:

```ts
const STRING_FLATTEN_FIXTURE = `
import { log } from "@/lib/log";

export function stringFlatten(e: unknown) {
  void log.error("string-flattened", { source: "probe", error: String(e) });
}
`;

const JSON_STRINGIFY_FLATTEN_FIXTURE = `
import { log } from "@/lib/log";

export function jsonFlatten(e: unknown) {
  void log.warn("json-flattened", { source: "probe", error: JSON.stringify(e) });
}
`;

const WRAPPED_FLATTEN_FIXTURE = `
import { log } from "@/lib/log";

export function wrappedFlatten(e: unknown) {
  void log.error("as-wrapped flatten", { source: "probe", error: String(e) as unknown });
}
`;
```

Extend the first test's `banned` array with `["string-flatten", STRING_FLATTEN_FIXTURE]`, `["json-stringify-flatten", JSON_STRINGIFY_FLATTEN_FIXTURE]`, `["wrapped-flatten", WRAPPED_FLATTEN_FIXTURE]`. Also extend `ALLOWED_FIXTURE` with a non-flagged shape proving the accept-set is structure-keyed, not spelling-keyed:

```ts
export function messageExtract(err: { message: string }) {
  // Property reads are legitimate site-local extraction, never flagged.
  void log.error("extracted", { source: "probe", error: err.message });
}
```

- [ ] **Step 2: Run to verify RED.** `pnpm vitest run tests/log/noDoubleSerializedLogError.test.ts` — expected FAIL: each new fixture yields 0 findings (the scanner's `serializeErrorBindings` early-return at `tests/log/noDoubleSerializedLogError.test.ts:196-197` skips files that never import `serializeError`, and no pre-flatten predicate exists), while the assertion expects 1.

- [ ] **Step 3: Implement the predicate (GREEN).** Add beside `mentionsWrapper`:

```ts
/**
 * Does the VALUE expression for `error` mention a structure-flattening call --
 * global `String(...)` or `JSON.stringify(...)` -- anywhere in its subtree?
 * Same closed-question-over-a-finite-tree shape as mentionsWrapper: once the
 * helper preserves structure, a call site flattening BEFORE the helper is the
 * residual regression vector (spec §2.6). Scoped to object-literal fields
 * arguments like every other family here; variable-carried fields objects are
 * the parent suite's documented limit (spec §4 limit 10).
 */
function mentionsFlattener(initializer: Node): boolean {
  const calls: Node[] = [...initializer.getDescendantsOfKind(SyntaxKind.CallExpression)];
  if (Node.isCallExpression(initializer)) calls.push(initializer);
  for (const node of calls) {
    if (!Node.isCallExpression(node)) continue;
    const callee = node.getExpression();
    if (Node.isIdentifier(callee) && callee.getText() === "String") return true;
    if (
      Node.isPropertyAccessExpression(callee) &&
      callee.getName() === "stringify" &&
      Node.isIdentifier(callee.getExpression()) &&
      callee.getExpression().getText() === "JSON"
    ) {
      return true;
    }
  }
  return false;
}
```

Then restructure `findDoubleSerializedSites`: the `wrappers.size === 0` early return (`tests/log/noDoubleSerializedLogError.test.ts:196-197`) becomes a plain lookup (`const wrappers = serializeErrorBindings(sourceFile);` with no early return), and the property check becomes:

```ts
        const preSerialized = wrappers.size > 0 && mentionsWrapper(initializerNode, wrappers);
        if (!preSerialized && !mentionsFlattener(initializerNode)) continue;
```

- [ ] **Step 4: Run to verify GREEN — including the live-tree walk.** `pnpm vitest run tests/log/noDoubleSerializedLogError.test.ts` — expected PASS. The live-tree case now also proves the pre-flatten count is zero (probed at plan time via `rg "error: String\(|error: JSON\.stringify" lib/ app/ components/` → zero); if the AST predicate surfaces a hit rg missed, triage it in this task (unwrap it or file the documented-limit disposition) — a loud finding, per the consequence bound.

- [ ] **Step 5: Commit.** `git add tests/log/noDoubleSerializedLogError.test.ts && git commit -m "test(log): scanner also flags String/JSON.stringify pre-flattening of log error fields"`

<!-- tasks: end -->

### Task 5: Mutation enrolment of the helper (outside the marker region -- deliberately)

Enrollment is opt-in with no discovery (`tests/mutation/source/registry.ts:8-11`), so no command can be observed RED on the missing row: the gate simply does not run an unenrolled surface (plan R1 F3). The verification here is the gate RUN after the row lands, not a red-then-green cycle; the row's `control` mutant is the registry's own liveness proof.

**Files:**
- Modify: `tests/mutation/source/registry.ts` (one new `GuardSurface` row)
- Modify: `tests/mutation/guardSurfaces.gate.test.ts` (one `EXPECTED_LEDGER_KINDS` entry -- the gate asserts its keys equal the registry ids at `tests/mutation/guardSurfaces.gate.test.ts:150-155`, so the registry row alone fails the gate)

**Interfaces:**
- Consumes: `lib/log/serializeError.ts` source (Task 1's implementation, including the literal `if (depth > DEPTH_MAX) return "[Truncated: depth]";` line the control mutant targets) and `tests/log/serializeError.test.ts` as the deciding suite.
- Produces: registry row id `serializeErrorStructure`.

- [ ] **Step 1: Add the registry row.** Follow the row shape at `tests/mutation/source/registry.ts:640-648` (`reviewRoundCount` row is the template):

```ts
  {
    id: "serializeErrorStructure",
    sourcePath: "lib/log/serializeError.ts",
    suitePaths: ["tests/log/serializeError.test.ts"],
    operators: [
      "relational-boundary",
      "equality-flip",
      "logical-connector",
      "integer-literal",
      "statement-removal",
    ],
    scoreFloor: 0.95,
    // Inverts the depth guard so truncation fires one level EARLY -- the
    // boundary-pair cases in the suite must notice both directions.
    control: { from: 'if (depth > DEPTH_MAX) return "[Truncated: depth]";', to: 'if (depth >= DEPTH_MAX) return "[Truncated: depth]";' },
    accepted: [],
  },
```

- [ ] **Step 1b: Add the ledger-kind expectation.** In `tests/mutation/guardSurfaces.gate.test.ts`, add to `EXPECTED_LEDGER_KINDS` (beside the `interactiveScanCore` entry):

```ts
  // Fresh enrolment: every survivor is repaid or argued in the registry row's
  // accepted list; a nonzero count appearing here later is a regression to
  // repair rather than a number to bump.
  serializeErrorStructure: {},
```

Adjust the entry in the same commit if Step 2's run files argued `accepted` rows (the value mirrors the row's accepted-kind counts).

- [ ] **Step 2: Run the gate.** `pnpm heavy pnpm mutation:guards` — expected: the row validates and mutants run. First run may report unaccepted survivors: repay each with a strengthened assertion in `tests/log/serializeError.test.ts` (preferred), or file it as an `accepted` row ONLY with an argued equivalence/reachability reason per the ledger shape in `tests/mutation/source/ledger.ts`. AC-10 is satisfied when the score meets the floor with an empty unaccepted-survivor set. If the measured score with a fully-repaid suite sits below 0.95 on argued-equivalent mutants alone, lower `scoreFloor` to the measured value in the same commit and record the number in the commit body — the floor states measurement, not aspiration.

- [ ] **Step 3: Re-run to verify stable.** `pnpm heavy pnpm mutation:guards` — expected PASS.

- [ ] **Step 4: Commit.** `git add tests/mutation/source/registry.ts tests/mutation/guardSurfaces.gate.test.ts tests/log/serializeError.test.ts && git commit -m "test(log): enroll serializeError in the source-mutation guard gate"`

### Task 4: Comment refresh + ledger filing (docs — outside the marker region; no test cycle)

**Files:**
- Modify: the 7 REFRESH files from the sweep table above (comment lines only; no behavior edits)
- Modify: `BACKLOG.md` (one new entry)

**Steps:**

- [ ] **Step 1: Re-run the derivation.** `rg -ln "object Object" lib/ app/ components/ tests/` — disposition any file NOT in the plan-time table by the three-way rule (REFRESH / UNTOUCHED-DATED / UNTOUCHED-UNRELATED) before editing.
- [ ] **Step 2: Refresh the 7 living files.** In each, rewrite the collapse rationale to the post-fix contract. Required content per site: (a) `lib/sync/runScheduledCronSync.ts:2328-2331` and the four spots in `tests/log/noDoubleSerializedLogError.test.ts` (5-7, 32-35, 57-59, 172-175): double-serialization is no longer destructive — an Error re-serialized survives structurally — but stays banned as shape drift + redundant work, enforced statically by this scanner; (b) `tests/sync/syncLogEmitGuard.test.ts:29-33` and `tests/sync/syncLogEmitGuard.test.ts:97-101` plus `tests/sync/runPushSyncForShow.test.ts:289-291`: the `toMatchObject` rows no longer discriminate the double-serialize mutant (spec §4 limit 8) — the walker owns the ban; (c) `lib/admin/readShowReviewSnapshot.ts:49-52` and `tests/admin/readShowReviewSnapshot.test.ts:117-121`: the flat-field extraction is a retained site-local choice (spec §1.1.6), no longer a workaround; (d) `tests/auth/isAdminSession-telemetry.test.ts:17-20`: a plain object no longer masks the message — keep the Error-instance modeling note for production fidelity.
- [ ] **Step 3: File the ledger entry.** Add to `BACKLOG.md` (open section, alongside its observability siblings):

```markdown
### BL-REPORT-CLIENT-ERROR-NON-ERROR-MESSAGE-ONLY -- client boundary crashes collapse non-Error values to String(e)

**Status:** OPEN · **Severity:** LOW (client-only mirror; server logging is structural since fix/serialize-error-structure) · **Class:** observability · **Effort:** S · **Filed:** 2026-08-16 (fix/serialize-error-structure spec §1.1.5)

**Probe evidence.** `lib/observe/reportClientError.ts:11-14` -- `toError` returns `{ message: String(e) }` for non-`Error` values, so a plain-object boundary crash reports `message: "[object Object]"` on the client-error wire. Same defect shape the serializeError arc repaired server-side.

**Why filed rather than fixed in that arc (class-sweep exception (c)).** The client wire is its own surface: `clientErrorTransport` CAPS, the dedup signature (`lib/observe/clientErrorTransport.ts:32`), and the `/api/observe/client-error` route contract would all move -- a redesign of a surface the serializeError PR does not otherwise touch.

**Shape of the fix, when scheduled.** Reuse the structural posture: serialize non-Error crash values to bounded structure (or at minimum their own enumerable fields flattened into `detail`), respecting the wire CAPS.
```

- [ ] **Step 4: Verify + commit.** `pnpm vitest run tests/log/noDoubleSerializedLogError.test.ts tests/sync/syncLogEmitGuard.test.ts tests/sync/runPushSyncForShow.test.ts tests/auth/isAdminSession-telemetry.test.ts tests/admin/readShowReviewSnapshot.test.ts tests/docs/_metaLedgerInProgress.test.ts` — expected PASS (comment-only edits; the ledger meta-test accepts an OPEN entry with no flight fields). `git add BACKLOG.md lib/sync/runScheduledCronSync.ts lib/admin/readShowReviewSnapshot.ts tests/sync/syncLogEmitGuard.test.ts tests/sync/runPushSyncForShow.test.ts tests/auth/isAdminSession-telemetry.test.ts tests/admin/readShowReviewSnapshot.test.ts tests/log/noDoubleSerializedLogError.test.ts && git commit -m "docs(log): refresh collapse-era comments; file BL-REPORT-CLIENT-ERROR-NON-ERROR-MESSAGE-ONLY"` -- explicit paths, never `git add -A`: the review-round corpus under `docs/review-rounds/` accumulates rows at every dispatch and is committed in its own `docs(review): record round corpus` commits (plan R1 F5).

### Task 6: Closeout

- [ ] **Step 1: Full gates, wrapped.** `pnpm heavy pnpm test:fast` (or full `pnpm heavy pnpm test` if the milestone close requires) + `pnpm typecheck` + `pnpm exec eslint lib/log tests/log` — expected PASS.
- [ ] **Step 2: Graduate the ledger entry.** Move `BL-SERIALIZE-ERROR-NON-ERROR-BRANCH-STRINGIFIES` to `BACKLOG-archive.md` per the archive's entry shape (terminal state, what shipped, what was corrected by measurement — the spec's R1-R3 probe corrections belong in the archive record). The `**Status:** IN PROGRESS · **Branch:** fix/serialize-error-structure` marker comes OFF in the same commit (invariant 12 — the archive rejects in-flight entries; graduation and marker removal are one commit, the PR's last docs commit).
- [ ] **Step 3: Commit + PR.** Conventional commits; PR body cites the spec, this plan, and the four probe corrections. Whole-diff codex review to APPROVE precedes merge (implementation-session contract; briefs per AGENTS.md, `--stage diff`).
- [ ] **Step 4: CI green, merge, `git rev-list --left-right --count main...origin/main` = `0 0`.**

## 12. Invariant-8 closeout

impeccable-gate: N/A — no UI surface

## Self-review notes (run at plan time)

- Spec coverage: AC-1..AC-6 → Task 1; AC-7 → Tasks 1-2; AC-8 → Task 3; AC-9 → Task 4; AC-10 → Task 5; §2.4 key repair → Task 2; §2.5 sweep → Task 4; §2.8 → Task 5. No spec requirement without a task.
- The Task 1 implementation snippet was typechecked (`tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes`) and behavior-probed against every AC fixture at plan-authoring time; the probe transcript lives in the review dispatch.
- Type consistency: `SerializedError`, constant names, and `findDoubleSerializedSites` signatures match across tasks.
- RED validity: Task 1 red = missing exports + `String(value)` branch (live tree); Task 2 red = `out[k] = s` on plain `{}` (`lib/log/sanitize.ts:32-36`); Task 3 red = absent predicate + import early-return (`tests/log/noDoubleSerializedLogError.test.ts:196-197`); Task 5 red = absent registry row.
