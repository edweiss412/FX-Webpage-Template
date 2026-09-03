// @vitest-environment jsdom
//
// The projection's guard table (spec §6.3) and the full collision corpus every
// adversarial round produced (spec §6.2), ported from the committed probe at
// docs/superpowers/specs/observability/probes/2026-08-26-client-value-projection.ts.
//
// 15 of the 34 pairs assert their COLLISION rather than discrimination: they are
// documented limits 6 and 7, and a test asserting they discriminate would assert a
// falsehood that fails the moment anyone checks. Every other pair asserts two
// distinct signatures. The counts here are the counts of the tables below — an
// earlier version said "four of 25" after the tables had grown.
import { describe, expect, test } from "vitest";
import { describeClientValue, tag } from "@/lib/observe/describeClientValue";

// The signature the transport builds for a non-`Error` value: no stack, and
// `detail` sliced at 200 (lib/observe/clientErrorTransport.ts §6.4).
const CAP_MESSAGE = 1000;
const CAP_DETAIL_IN_SIGNATURE = 200;
function signature(value: unknown): string {
  const { message, detail } = describeClientValue(value);
  return `client.crew|error|${message.slice(0, CAP_MESSAGE)}||${detail.slice(0, CAP_DETAIL_IN_SIGNATURE)}`;
}
const collides = (a: unknown, b: unknown): boolean => signature(a) === signature(b);

describe("describeClientValue — the guard table (spec §6.3)", () => {
  test("a plain object with code and message: the label joins its own fields", () => {
    const code = "PGRST301";
    const message = "planted";
    const d = describeClientValue({ code, message });
    // Derived from the fixture, never a rendered literal: dropping either field fails.
    expect(d.message).toBe(`${code}: ${message}`);
    expect(d.detail).toContain(code);
    expect(d.detail).toContain(message);
  });

  test.each([
    ["a name-only object", { name: "FooError" }, "FooError"],
    ["no name/code/message", { a: 1 }, "(no message)"],
    ["an empty object", {}, "(no message)"],
    ["an array", [1, 2], "(no message)"],
    ["a string", "x", "x"],
    ["an empty string", "", "(no message)"],
    ["zero", 0, "0"],
    ["false", false, "false"],
    ["NaN", NaN, "NaN"],
    ["null", null, "null"],
    ["undefined", undefined, "undefined"],
  ] as const)("%s → message %j", (_label, value, expected) => {
    expect(describeClientValue(value).message).toBe(expected);
  });

  test("an empty field is not joined into the label, and a set field beside it still is", () => {
    // The guard at lib/observe/describeClientValue.ts:129 is `typeof v === "string" && v !== ""`,
    // and the second half is what this pins. Drop it and `parts` gains an empty string, so the
    // label grows a separator describing a field nobody set: ": planted" rather than "planted".
    //
    // Derived from the fixture on both sides -- the expected label IS the value of the field that
    // carries text, never a rendered literal -- so giving the empty field a value changes the
    // expectation and the case cannot pass by ignoring emptiness.
    const message = "planted";
    expect(describeClientValue({ code: "", message }).message).toBe(message);
    expect(describeClientValue({ name: "", message }).message).toBe(message);
    expect(describeClientValue({ name: "", code: "", message }).message).toBe(message);
  });

  test("an object whose only text field is empty has no message to render", () => {
    // The other side of the same guard. Without `v !== ""`, `parts` holds one empty string,
    // `parts.length > 0` is true, and the label becomes "" -- a crash row that renders blank
    // instead of saying it carried no message.
    //
    // All three keys in turn, so the case cannot pass because one particular key is special.
    for (const key of ["name", "code", "message"] as const) {
      expect(describeClientValue({ [key]: "" }).message, `only ${key}, empty`).toBe("(no message)");
    }
  });

  test("no input in the table renders as the bare string [object Object]", () => {
    for (const v of [{ a: 1 }, {}, [1, 2], "x", 0, false, NaN, null, undefined, new Map()]) {
      const { message, detail } = describeClientValue(v);
      expect(message, `message for ${String(v)}`).not.toBe("[object Object]");
      expect(detail, `detail for ${String(v)}`).not.toBe("[object Object]");
    }
  });

  test("a primitive's detail carries its runtime type tag", () => {
    expect(describeClientValue(0).detail).toBe("number 0");
    expect(describeClientValue("0").detail).toBe("string 0");
    expect(describeClientValue(null).detail).toBe("null null");
    expect(describeClientValue(BigInt(1)).detail).toBe("bigint 1");
  });

  test("a structure's detail is the rendered structure, untagged and unambiguous", () => {
    // It starts with `{` or `[`, so it can never be read as a tagged primitive.
    expect(describeClientValue({ a: 1 }).detail).toBe('{"a":1}');
    expect(describeClientValue([1, 2]).detail).toBe("[1,2]");
  });

  test("render keeps what JSON.stringify destroys — NaN and the infinities", () => {
    // JSON's number grammar writes all three as null, which is what collapsed
    // { a: NaN } into { a: null }. This is the whole reason render exists.
    expect(describeClientValue({ a: NaN }).detail).toBe('{"a":NaN}');
    expect(describeClientValue({ a: Infinity }).detail).toBe('{"a":Infinity}');
    expect(describeClientValue({ a: -Infinity }).detail).toBe('{"a":-Infinity}');
    expect(JSON.stringify({ a: NaN })).toBe('{"a":null}'); // the behaviour being avoided
  });

  test("a ROOT Map degrades to its type name and is still separable from that string", () => {
    // serializeError §4 limit 5, inherited. The tag keeps a root Map distinct from
    // a string reading "[object Map]" — and only at the root: the nested pair is
    // in the collision table below, under limit 7.
    expect(describeClientValue(new Map()).message).toBe("[object Map]");
    expect(collides(new Map(), "[object Map]")).toBe(false);
    expect(collides({ v: new Map() }, { v: "[object Map]" })).toBe(true);
  });
});

describe("describeClientValue — total, for every hostile shape", () => {
  // The module's contract is that no value, however strange, breaks the caller.
  // It is called from a window error handler and an unhandledrejection handler,
  // so a throw here loses the very crash it exists to record AND emits an
  // uncaught error on the way out. A throwing Proxy trap did exactly that before
  // tag() was made total — measured, not hypothesised.
  test.each([
    ["a null-prototype object", () => Object.create(null) as object],
    [
      "a Proxy whose get trap throws",
      () =>
        new Proxy(
          {},
          {
            get() {
              throw new Error("trap");
            },
          },
        ),
    ],
    [
      "an object whose constructor getter throws",
      () =>
        Object.defineProperty({}, "constructor", {
          get() {
            throw new Error("ctor");
          },
        }),
    ],
    [
      "an object whose toString throws",
      () => ({
        toString() {
          throw new Error("ts");
        },
      }),
    ],
    [
      "a cyclic object",
      () => {
        const o: Record<string, unknown> = {};
        o.self = o;
        return o;
      },
    ],
    [
      "a revoked Proxy",
      () => {
        const { proxy, revoke } = Proxy.revocable({}, {});
        revoke();
        return proxy;
      },
    ],
  ])("%s does not throw, and still yields two strings", (_label, make) => {
    const value = make();
    let out: { message: string; detail: string } | undefined;
    expect(() => {
      out = describeClientValue(value);
    }).not.toThrow();
    expect(typeof out!.message).toBe("string");
    expect(typeof out!.detail).toBe("string");
  });
});

describe("describeClientValue — the collision corpus (spec §6.2)", () => {
  test.each([
    [
      "same triple, other fields differ",
      { code: "E", message: "m", a: 1 },
      { code: "E", message: "m", b: 2 },
    ],
    ["different field identity, same text", { name: "SAME" }, { code: "SAME" }],
    ["ambiguous ': ' join", { name: "A", code: "B" }, { name: "A: B" }],
    ["two plain objects", { a: 1 }, { b: 2 }],
    ["number / string", 0, "0"],
    ["boolean / string", false, "false"],
    ["null / string", null, "null"],
    ["undefined / string", undefined, "undefined"],
    ["bigint / number", BigInt(1), 1],
    ["NaN / string", NaN, "NaN"],
    ["symbol / string", Symbol("x"), "Symbol(x)"],
    ["RegExp / string", /re/, "/re/"],
    ["nested NaN / null", { a: NaN }, { a: null }],
    ["nested Infinity / null", { a: Infinity }, { a: null }],
    ["nested -Infinity / null", { a: -Infinity }, { a: null }],
    ["array NaN / null", [NaN], [null]],
    ["array Infinity / null", [Infinity], [null]],
    ["array -Infinity / null", [-Infinity], [null]],
    ["Date a full second apart", new Date(0), new Date(1000)],
  ] as const)("%s → two signatures", (_label, a, b) => {
    expect(collides(a, b)).toBe(false);
  });

  test.each([
    ["-0 against 0, nested", { a: -0 }, { a: 0 }],
    ["-0 against 0, in an array", [-0], [0]],
    ["two Dates inside one second", new Date(0), new Date(1)],
    [
      "two RegExps differing only in lastIndex",
      /re/g,
      (() => {
        const r = /re/g;
        r.lastIndex = 1;
        return r;
      })(),
    ],
    ["nested bigint against its string", { v: BigInt(1) }, { v: "1" }],
    ["nested Map against its string", { v: new Map() }, { v: "[object Map]" }],
    ["nested RegExp against its string", { v: /re/ }, { v: "/re/" }],
    ["array bigint against its string", [BigInt(1)], ["1"]],
    ["nested Set against its string", { v: new Set() }, { v: "[object Set]" }],
    ["nested Date against its string", { v: new Date(0) }, { v: new Date(0).toString() }],
    ["nested URL against its string", { v: new URL("https://x.test/") }, { v: "https://x.test/" }],
    ["array Map against its string", [new Map()], ["[object Map]"]],
    ["array Set against its string", [new Set()], ["[object Set]"]],
    ["array Date against its string", [new Date(0)], [new Date(0).toString()]],
    ["array RegExp against its string", [/re/], ["/re/"]],
    ["array URL against its string", [new URL("https://x.test/")], ["https://x.test/"]],
  ] as const)("%s COLLIDES — documented limits 6 and 7", (_label, a, b) => {
    // Asserted as collisions on purpose. String(-0) is "0"; serializeError
    // degrades a key-less object to String(value), which is second-resolution for
    // a Date and ignores lastIndex; and the runtime tag reaches DEPTH 0 ONLY, so
    // a nested value serializeError stringified during its traversal has lost its
    // type before render sees it. Claiming any of these discriminate would be a
    // lie, and a test making that claim would fail the moment someone checked.
    expect(collides(a, b)).toBe(true);
  });
});

describe("tag — the constructor read is a TYPE check, not a name lookup", () => {
  test("an object carrying its own `constructor` key does not get a fabricated tag", () => {
    // `typeof ctor === "function" && ctor.name` survived `&&` → `||`, and the
    // mutant is not harmless: it reads `.name` off whatever sits at `.constructor`,
    // so a crash object with a `constructor` field of its own gets tagged with a
    // name it invented. That shape is ordinary — an object literal may carry any
    // key — so this is a wrong tag on real input, not a hostile fixture.
    const carrying = { constructor: { name: "Fake" }, a: 1 };
    expect(tag(carrying)).toBe("object");
    expect(describeClientValue(carrying).detail).toBe(
      'object {"constructor":{"name":"Fake"},"a":1}',
    );
  });

  test("a genuine class still contributes its constructor name", () => {
    class Planted {
      a = 1;
    }
    expect(tag(new Planted())).toBe("Planted");
  });
});
