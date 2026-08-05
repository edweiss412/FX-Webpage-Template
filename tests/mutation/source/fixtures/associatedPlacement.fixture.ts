/**
 * NOT discovered. Invoked by tests/mutation/_metaPremiseContract.test.ts, which
 * asserts this file's child run exits NON-ZERO.
 *
 * The positive half of the placement contract: the premise sits over the NAMED
 * BINDING the registration consumes, between that binding and the call (spec
 * §3.3.2.2). It executes when the module body is evaluated, before any case is
 * registered and independent of how many there are -- so an empty producer
 * fails LOUDLY here rather than passing silently.
 */
import { expect, test } from "vitest";

import { premiseHolds } from "@/tests/_shared/premise";

const refs: string[] = [];

premiseHolds("the checkout yielded refs to iterate", refs.length > 0);

test.each(refs)("%s resolves", (ref) => {
  expect(ref).toBeDefined();
});
