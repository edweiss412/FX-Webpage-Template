// Owned by tests/mutation/_metaOverlayConfigParity.test.ts.
//
// The PASSING half of the bail:1 contract, and the reason a surviving mutant is
// unaffected by it. Nothing here fails, so bail has nothing to fire on and every
// case runs. The marker written by the LAST case is the evidence: a green run
// still pays for its whole suite.
import { writeFileSync } from "node:fs";

import { expect, it } from "vitest";

it("passes, giving bail nothing to fire on", () => {
  expect(1).toBe(1);
});

it("writes a marker, proving a green run still reaches its last case", () => {
  const marker = process.env["FX_BAIL_MARKER"];
  if (marker === undefined || marker === "") throw new Error("FX_BAIL_MARKER is required");
  writeFileSync(marker, "reached");
});
