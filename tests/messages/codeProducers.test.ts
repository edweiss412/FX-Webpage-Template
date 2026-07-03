import { describe, expect, test } from "vitest";

import {
  ACTIVE_PRODUCER_ROOTS,
  PRODUCER_RE,
  codeProducerLiterals,
} from "@/lib/messages/__internal__/codeProducers";

describe("codeProducers (shared §12.4 producer scan)", () => {
  test("PRODUCER_RE matches a `code:` string literal, NOT a variable reference", () => {
    // This literal-vs-variable distinction is load-bearing for the admin-outcome
    // scanner-safety guard (Assertion 4): logAdminOutcome({ code: SOME_VAR }) must
    // NOT register; a stray `code: "LITERAL"` outside a stripped span must.
    const re = new RegExp(PRODUCER_RE.source, "g");
    expect([...'const x = { code: "SOME_CODE" };'.matchAll(re)].map((m) => m[1])).toEqual([
      "SOME_CODE",
    ]);
    const re2 = new RegExp(PRODUCER_RE.source, "g");
    expect([..."const x = { code: someVar };".matchAll(re2)]).toHaveLength(0);
  });

  test("ACTIVE_PRODUCER_ROOTS is app + lib", () => {
    expect([...ACTIVE_PRODUCER_ROOTS]).toEqual(["app", "lib"]);
  });

  test("codeProducerLiterals scans the live tree and excludes fabricated codes", () => {
    const producers = codeProducerLiterals();
    expect(producers.size).toBeGreaterThan(0); // real §12.4 producers exist in app/+lib/
    expect(producers.has("STRAY_FORENSIC_CODE_XYZ")).toBe(false);
  });
});
