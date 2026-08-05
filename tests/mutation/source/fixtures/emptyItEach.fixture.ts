/**
 * NOT discovered. Invoked by tests/mutation/_metaPremiseContract.test.ts, which
 * asserts this file's child run exits NON-ZERO.
 *
 * Probed at spec R8: with the premise moved INTO the callback, this file passes
 * green -- "Tests 1 passed (1)" -- because vitest registers `.each` cases by
 * iterating the producer, so an empty producer registers nothing and the
 * callback never runs. In exactly the degenerate case the premise exists to
 * detect. The premise below sits in the associated pre-registration position
 * (spec §3.3.2.2), so it executes whatever the producer yields.
 */
import { expect, it } from "vitest";

import { premise } from "@/tests/_shared/premise";

/** Stands in for an environment-derived producer that came back empty. */
const rows: string[] = [];

premise("the producer yielded cases to register", rows.length, 0);

it.each(rows)("never registered %s", (r) => {
  expect(r).toBeDefined();
});

it("an unrelated passing test, so a green file would be green for the wrong reason", () => {
  expect(1).toBe(1);
});
