/**
 * NOT a discovered test. `*.fixture.ts` cannot match BASE_INCLUDE
 * (vitest.projects.ts:34), so no default project ever resolves this file; it is
 * invoked as a child run by tests/mutation/_metaOverlayConfigParity.test.ts.
 *
 * Its entire job is the `@/` import below. If the per-mutant overlay config
 * loses its alias, this file fails to resolve and the child run exits non-zero.
 * That is the executable half of the parity guard: the structural half compares
 * config values, and a config value can be right while resolution is broken.
 */
import { expect, it } from "vitest";

import { siteId } from "@/tests/mutation/source/operators";

it("resolves a module through the @ alias", () => {
  expect(
    siteId({
      operator: "integer-literal",
      start: 0,
      end: 1,
      replacement: "1",
      line: 1,
      column: 1,
      from: "0",
      to: "1",
    }),
  ).toBe("integer-literal:1:1:0>1");
});
