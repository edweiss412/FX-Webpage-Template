import { expect, it } from "vitest";

// Tracked, correctly spelled, and unreachable: this directory's vitest.config.ts
// does not include it, so `vitest run` exits non-zero for a COLLECTION reason
// and `vitest list` is silently empty.
it("is never collected by the fixture project", () => {
  expect(true).toBe(true);
});
