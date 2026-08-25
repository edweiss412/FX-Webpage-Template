// Owned by tests/mutation/_metaOverlayConfigParity.test.ts.
//
// The FAILING half of the bail:1 contract. The first case fails, so a run under
// `bail: 1` must stop here and the second case must never execute. The second
// case writes a marker, so its absence is what proves the run stopped early --
// an exit code alone cannot tell "stopped at the failure" from "ran everything
// and failed", which is the whole distinction this fixture exists to make.
import { writeFileSync } from "node:fs";

import { expect, it } from "vitest";

it("fails first, so a run under bail:1 stops here", () => {
  expect(1).toBe(2);
});

it("writes a marker, which only a run that did NOT bail can reach", () => {
  const marker = process.env["FX_BAIL_MARKER"];
  if (marker === undefined || marker === "") throw new Error("FX_BAIL_MARKER is required");
  writeFileSync(marker, "reached");
});
