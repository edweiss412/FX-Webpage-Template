import type { GuardSurface } from "../../registry";

/**
 * The control surface's registry row, defined ONCE so the in-process schedule
 * proof and the live integration case cannot describe different surfaces.
 *
 * Deliberately NOT added to `GUARD_SURFACES`: it is apparatus. The probe reaches
 * it through the injectable `surfaces` seam.
 */
export const CONTROL_SURFACE: GuardSurface = {
  id: "processProbeControl",
  sourcePath: "tests/mutation/source/fixtures/processProbe/source.ts",
  suitePaths: [
    "tests/mutation/source/fixtures/processProbe/suite1.fixture.ts",
    "tests/mutation/source/fixtures/processProbe/suite2.fixture.ts",
  ],
  operators: ["relational-boundary"],
  scoreFloor: 1,
  millisPerBoot: 1000,
  control: { from: "n < 3", to: "n > 3" },
  accepted: [],
};
