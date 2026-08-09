// `cn` semantics — spec §3.2, every row.
//
// Spec: docs/superpowers/specs/2026-08-07-classname-array-join-cn.md §3
//
// This is mechanism 1 of the migration's three-part equivalence proof (spec §4.2).
// It establishes `cn ≡ filter(Boolean).join(" ")`, which is what lets the operand-parity
// script conclude "same operands ⇒ same output" at the 30 unfiltered sites, given spec
// §4.1's separately-audited claim that every operand there is truthy.
//
// THE NEGATIVE-SPACE ROWS ARE THE LOAD-BEARING ONES. A happy-path-only test passes just
// as well against `tailwind-merge`, which trims, dedupes, and resolves Tailwind conflicts
// — and swapping that in would silently change ~36 rendered class strings across the tree
// while every other check in this arc stayed green. Spec §1.1 R1 rejected `tailwind-merge`
// precisely so the rows below hold; they are what makes that rejection executable rather
// than a comment in a spec.

import { describe, expect, it } from "vitest";

import { cn, type ClassValue } from "@/lib/ui/cn";

describe("cn — spec §3.2", () => {
  it("returns the empty string with no arguments", () => {
    expect(cn()).toBe("");
  });

  it("returns the empty string when every argument is falsy", () => {
    expect(cn(null, undefined, false, "")).toBe("");
  });

  it("returns a single argument unchanged", () => {
    expect(cn("a")).toBe("a");
  });

  it("joins two arguments with a single space", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  // Each falsy kind dropped individually — NOT rendered, and NOT leaving a double space.
  // `["a", "", "b"].join(" ")` is `"a  b"`; `["a", false, "b"].join(" ")` is `"a false b"`.
  // Those two divergences are exactly why spec §4.1's operand audit exists.
  it.each([
    ["empty string", "" as ClassValue],
    ["null", null as ClassValue],
    ["undefined", undefined as ClassValue],
    ["false", false as ClassValue],
  ])("drops a %s argument without leaving a separator", (_label, falsy) => {
    expect(cn("a", falsy, "b")).toBe("a b");
  });

  describe("negative space — behaviors `cn` deliberately does NOT have", () => {
    it("preserves interior whitespace rather than collapsing it", () => {
      expect(cn("a  b")).toBe("a  b");
    });

    it("does not dedupe repeated classes", () => {
      expect(cn("a", "a")).toBe("a a");
    });

    it("preserves operand ORDER (every other row happens to be lexically sorted)", () => {
      // `filter(Boolean).sort().join(" ")` passes every other assertion in this file,
      // because all their multi-value inputs are already in lexical order. Order is
      // load-bearing: `AccentButton` documents "Escape hatch LAST so per-site overrides win
      // cascade order" (spec §9.3), so a sort would silently invert that precedence.
      expect(cn("b", "a")).toBe("b a");
      expect(cn("z-10", "p-2", "m-1")).toBe("z-10 p-2 m-1");
    });

    it("does not resolve Tailwind conflicts (spec §1.1 R1 — no tailwind-merge)", () => {
      expect(cn("p-2", "p-4")).toBe("p-2 p-4");
    });

    it("does not trim a trailing space off its output", () => {
      // Distinct from the leading/interior case below: a `trimEnd()` mutant survives every
      // other row in this file, because no other expected output ENDS in whitespace.
      expect(cn("a ")).toBe("a ");
      expect(cn("a", "b ")).toBe("a b ");
    });

    it("does not trim its own output", () => {
      // A leading/trailing space inside an operand is the operand's, not a separator, so
      // `cn` carries it through. `.trim()` would make E1 sites byte-different from base.
      expect(cn(" a ", "b")).toBe(" a  b");
    });
  });

  describe("ClassValue — enforced by the typechecker, not described in a comment", () => {
    it("admits string, false, null, and undefined", () => {
      const admitted: ClassValue[] = ["a", false, null, undefined];
      expect(cn(...admitted)).toBe("a");
    });

    it("is EXACTLY `string | false | null | undefined`, no wider", () => {
      // The `@ts-expect-error` rows below each reject ONE named shape, so a union widened
      // with something they do not name — `symbol` (throws inside `.join()`), or `boolean`
      // (renders `cn("a", true)` as `"a true"`) — leaves every one of them satisfied. This
      // asserts the union itself, mutually, so any widening OR narrowing fails to compile.
      type Expected = string | false | null | undefined;
      type Equals<A, B> =
        (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
      const exact: Equals<ClassValue, Expected> = true;
      expect(exact).toBe(true);
    });

    it("excludes number and nested arrays", () => {
      // These directives are invisible to Vitest — an unsatisfied `@ts-expect-error` fails
      // only `tsc`, which is why this task's red command runs `pnpm typecheck` too. Without
      // it, a `cn` widened to `unknown[]` would leave these lines silently inert.
      // @ts-expect-error `number` is deliberately outside ClassValue: `cn(0)` must not
      // typecheck, so a `0` can never be silently dropped by the Boolean filter.
      cn(0);
      // @ts-expect-error nested ClassValue[] is deliberately outside ClassValue (spec §3.2);
      // no call site needs it, and excluding it keeps the eslint traversal premise narrow.
      cn(["a"]);
      // @ts-expect-error `object` is deliberately outside ClassValue. Without this row a
      // union widened with `Record<string, unknown>` satisfies both directives above while
      // admitting operands that render as the literal string "[object Object]".
      cn({ a: true });
      expect(true).toBe(true);
    });
  });

  describe("guard conditions — spec §3.3", () => {
    it("never throws on any ClassValue input", () => {
      expect(() => cn(null, undefined, false, "", "a")).not.toThrow();
    });

    it("is equivalent to filter(Boolean).join(' ') at every arity checked", () => {
      // The equivalence stated as a property rather than a table row: this is the exact
      // claim spec §4.2 mechanism 1 contributes to the composed proof.
      const cases: ClassValue[][] = [
        [],
        ["a"],
        ["a", "b"],
        ["a", "", "b"],
        ["a", null, undefined, false, "b"],
        [false, false],
        ["a  b", "c"],
      ];
      for (const parts of cases) {
        expect(cn(...parts)).toBe(parts.filter(Boolean).join(" "));
      }
    });
  });
});
