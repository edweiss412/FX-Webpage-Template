// BL-TASKCONTRACT-SORT-COMPARATOR-EQUALKEY — the finding comparator is partial.
//
// `checkTaskContract` sorts by `docLine` then `code`. Two findings sharing both
// keys compare equal, so their relative order is whatever the engine's sort
// leaves behind. V8's is stable, so in practice they come out in push order —
// but ECMA-262 does not require an inconsistent comparator to produce any
// particular result, and the report those findings render into is read by a
// human. "The order is fine because V8 happens to be stable" is a fact about the
// runtime, not about this function.
//
// The entry's own suggestion is the fix: add the message as a third key, making
// the comparator TOTAL over the fields a finding actually has.
//
// ANTI-TAUTOLOGY. A test that sorts a list and asserts the result matches what
// the comparator produced is vacuous. These assertions are on the ORDERING
// RELATION itself: an input deliberately built in the wrong order must come out
// in the right one, and the comparator must be antisymmetric on the pair. The
// input is shuffled relative to the expected output, so a no-op comparator fails
// rather than passing by luck of push order.
import { describe, expect, it } from "vitest";
// Relative, not the `@/` alias, and that matters: the source-mutation runner
// substitutes a mutated copy of this module, and an aliased import resolves past
// the substitution to the pristine original — every mutant would then "survive"
// against a file the test never loaded. `taskContract.test.ts` imports the same
// way for the same reason.
import { compareFindings } from "../../lib/specLint/taskContract";

type F = { docLine: number; code: string; message: string };

const f = (docLine: number, code: string, message: string): F => ({ docLine, code, message });

describe("the task-contract finding comparator is a total order", () => {
  it("breaks a (docLine, code) tie by message", () => {
    // Presented in the WRONG order, so a comparator that returns 0 for this pair
    // leaves them wrong and fails. Push order cannot rescue it.
    const findings = [f(10, "TASK_AC_UNRESOLVED", "zebra"), f(10, "TASK_AC_UNRESOLVED", "alpha")];
    const sorted = [...findings].sort(compareFindings);
    expect(sorted.map((x) => x.message)).toEqual(["alpha", "zebra"]);
  });

  it("is antisymmetric on that pair, not merely non-zero", () => {
    const a = f(10, "TASK_AC_UNRESOLVED", "alpha");
    const z = f(10, "TASK_AC_UNRESOLVED", "zebra");
    expect(compareFindings(a, z)).toBeLessThan(0);
    expect(compareFindings(z, a)).toBeGreaterThan(0);
    // And reflexive: a finding equals itself, so the sort has a fixed point.
    expect(compareFindings(a, { ...a })).toBe(0);
  });

  it("keeps docLine as the primary key and code as the secondary", () => {
    // The new third key must not outrank the two that were already there: a
    // message-first comparator would pass the tie test above and reorder the
    // whole report.
    const findings = [
      f(20, "AAA_CODE", "aaa"),
      f(10, "ZZZ_CODE", "zzz"),
      f(10, "AAA_CODE", "zzz"),
      f(10, "AAA_CODE", "aaa"),
    ];
    const sorted = [...findings].sort(compareFindings);
    expect(sorted.map((x) => [x.docLine, x.code, x.message])).toEqual([
      [10, "AAA_CODE", "aaa"],
      [10, "AAA_CODE", "zzz"],
      [10, "ZZZ_CODE", "zzz"],
      [20, "AAA_CODE", "aaa"],
    ]);
  });

  it("orders a fully tied triple deterministically regardless of input order", () => {
    // Three findings identical but for message, fed in every one of the six
    // permutations, must produce the same output every time. This is the
    // property "stable sort happens to work" cannot supply: stability preserves
    // INPUT order, so six inputs would give six different reports.
    const msgs = ["alpha", "middle", "zebra"];
    const perms = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ];
    for (const p of perms) {
      const sorted = p
        .map((i) => f(7, "SAME_CODE", msgs[i]!))
        .sort(compareFindings)
        .map((x) => x.message);
      expect(sorted, `permutation ${p.join("")} disagrees`).toEqual(msgs);
    }
  });
});
