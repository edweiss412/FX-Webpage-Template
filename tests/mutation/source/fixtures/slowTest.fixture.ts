/**
 * NOT discovered. Invoked by tests/mutation/guardSurfaces.gates.test.ts, which
 * lives in the nightly-only mutation project (vitest.projects.ts:87), because
 * 5.2s is not worth paying on every merge.
 *
 * The merge-gating structural check in _metaOverlayConfigParity.test.ts covers
 * the same VALUE on every merge; this proves the value is actually in force,
 * which a config comparison cannot.
 */
import { expect, it } from "vitest";

it("outlives vitest's 5000ms default", async () => {
  const start = Date.now();
  await new Promise((r) => setTimeout(r, 5_200));
  expect(Date.now() - start).toBeGreaterThanOrEqual(5_200);
});
