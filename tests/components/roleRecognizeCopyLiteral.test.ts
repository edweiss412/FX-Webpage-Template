// A role token is free text from the Google Sheet, and it reaches `String.replace` as the
// REPLACEMENT argument, where `$&`, `` $` ``, `$'` and `$$` are a substitution grammar rather
// than characters. Spec 2026-08-24-replacement-string-class-sweep §5.
import { describe, expect, it } from "vitest";

import { savedSummary, scopeLine } from "@/components/admin/roleRecognizeCopy";
import { premiseHolds } from "../_shared/premise";

// WHICH tokens discriminate is measured, not assumed. `$1` is the obvious one to reach for and
// proves nothing here: the pattern argument is the string "<TOKEN>", so there is no capture group
// and `$1` is emitted as literal text — a case built on it passes before the repair and after.
const HOSTILE: [string, string][] = [
  ["$' (everything after the match)", "A$'B"],
  ["$& (the matched text)", "X$&Y"],
  ["$` (everything before the match)", "P$`Q"],
  ["$$ (an escaped dollar)", "K$$L"],
];

describe("scopeLine keeps a $-bearing role token literal", () => {
  for (const [label, token] of HOSTILE) {
    it(`round-trips ${label}`, () => {
      const out = scopeLine(token);
      premiseHolds(`${label}: the token reached the output at all`, out.length > 0);
      expect(out, "the token is data, not a substitution pattern").toContain(token);
    });
  }

  it("$1 is NOT a discriminator here, and is present to say so", () => {
    // No capture group in a string pattern, so `$1` survives even unrepaired. Kept as a
    // documented non-discriminator so nobody adds it as coverage.
    expect(scopeLine("M$1N")).toContain("M$1N");
  });
});

describe("savedSummary keeps a $-bearing role token literal", () => {
  for (const [label, token] of HOSTILE) {
    it(`round-trips ${label}`, () => {
      const out = savedSummary(token, []);
      premiseHolds(`${label}: the summary was built`, out.length > 0);
      expect(out, "the token is data, not a substitution pattern").toContain(token);
    });
  }

  it("never leaks the <SUMMARY> placeholder", () => {
    // The sharpest form of this defect: `$'` splices the sentence tail into the middle, which
    // displaces the text the NEXT chained .replace was going to match, so an unreplaced template
    // marker reaches the admin surface.
    expect(savedSummary("T$'Z", [])).not.toContain("<SUMMARY>");
  });
});
