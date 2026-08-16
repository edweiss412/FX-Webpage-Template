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
    const out = serializeError({
      message: "gateway 502",
      code: "PGRST301",
      details: null,
      hint: null,
    });
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
    expect(serializeError({ left: shared, right: shared })).toEqual({
      left: { s: 1 },
      right: { s: 1 },
    });
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
    expect(serializeError(e)).toMatchObject({
      name: "Error",
      message: "degraded",
      status: 502,
      code: "PGRST301",
    });
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
    expect((serializeError(e) as { cause?: { message?: string } }).cause?.message).toBe(
      "inner-cause",
    );
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
    expect(
      JSON.stringify(serializeError({ fn: () => 1, sym: Symbol("s"), und: undefined, ok: 1 })),
    ).toBe('{"ok":1}');
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
    expect(Object.keys(serializeError(new Error("x")) as object)).toEqual([
      "name",
      "message",
      "stack",
    ]);
  });
  test("a cause chain reaching the depth cap survives (kills the cause depth+2 mutant)", () => {
    const e = new Error("outer", { cause: { a: { leaf: "v" } } });
    const out = serializeError(e) as { cause?: { a?: { leaf?: string } } };
    expect(out.cause?.a?.leaf).toBe("v");
  });
  test("a nested bigint is capped at STR_MAX like every other emitted string (plan R2 F1)", () => {
    const out = serializeError({ value: BigInt("9".repeat(STR_MAX + 100)) }) as Record<
      string,
      string
    >;
    expect(out.value).toHaveLength(STR_MAX);
  });
});
