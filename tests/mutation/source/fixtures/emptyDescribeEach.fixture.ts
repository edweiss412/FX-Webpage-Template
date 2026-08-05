/**
 * NOT discovered. Invoked by tests/mutation/_metaPremiseContract.test.ts, which
 * asserts this file's child run exits NON-ZERO.
 *
 * The describe.each twin of the empty-producer case. Zero registrations means
 * zero NESTED tests, so a premise anywhere inside the describe body is
 * unreachable -- which is why a premise must dominate every enclosing
 * producer-derived registration, not merely sit inside the test it guards
 * (spec §3.3.2.2).
 */
import { describe, expect, it } from "vitest";

import { premise } from "@/tests/_shared/premise";

const rows: string[] = [];

premise("the producer yielded cases to register", rows.length, 0);

describe.each(rows)("never registered %s", (r) => {
  it("never runs", () => {
    expect(r).toBeDefined();
  });
});

it("an unrelated passing test, so a green file would be green for the wrong reason", () => {
  expect(1).toBe(1);
});
