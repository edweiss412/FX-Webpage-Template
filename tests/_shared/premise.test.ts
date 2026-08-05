import { describe, expect, it } from "vitest";

import { premise, premiseHolds } from "./premise";

describe("premise", () => {
  it("passes silently when the premise holds", () => {
    expect(() => premise("101 is past the cap", 101, 100)).not.toThrow();
  });

  it("throws when it does not hold, quoting both numbers", () => {
    expect(() => premise("13 is past the cap", 13, 100)).toThrow(/13 is past the cap/);
    expect(() => premise("13 is past the cap", 13, 100)).toThrow(/13/);
    expect(() => premise("13 is past the cap", 13, 100)).toThrow(/100/);
  });

  it("names the failure as a PREMISE failure, not an ordinary one", () => {
    // The distinction is load-bearing: a premise failure means the environment
    // is wrong for this test, an assertion failure means the code is. Repairing
    // the first as if it were the second is exactly how a red test became a
    // vacuous one in PR #701.
    expect(() => premise("x", 0, 0)).toThrow(/premise not met/i);
    expect(() => premise("x", 0, 0)).toThrow(/proves nothing/i);
  });

  it("treats the bound as strict; equal is not past", () => {
    expect(() => premise("boundary", 100, 100)).toThrow(/premise not met/i);
  });

  it("premiseHolds carries the non-numeric form, with the same message shape", () => {
    expect(() => premiseHolds("git reported at least one ref", false)).toThrow(
      /premise not met: git reported at least one ref/,
    );
    expect(() => premiseHolds("git reported at least one ref", false)).toThrow(/proves nothing/i);
    expect(() => premiseHolds("git reported at least one ref", true)).not.toThrow();
  });
});
