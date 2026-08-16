import { expect, it } from "vitest";
import { MARKER } from "./marker";

/**
 * Asserts the OVERLAID text, so its exit code is the whole signal:
 *
 *   - run under the browser-mode overlay config with a manifest overlaying
 *     `marker.ts` → passes, proving the child observed the mutant;
 *   - run with no manifest → FAILS, proving the pass above was not vacuous.
 *
 * A `.fixture.ts` name keeps it out of every default project's include set; it
 * is executed only as a child of tests/mutation/browser/overlayWiring.test.ts.
 */
it("observes the mutant text the overlay served", () => {
  expect(MARKER).toBe("MUTANT");
});
