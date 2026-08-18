import { expect, it } from "vitest";

// Collectible AND failing: the "red genuinely observed" case needs a non-zero
// exit whose probe collects something. Never run by the repo's own suite — see
// the note in this directory's vitest.config.ts.
it("fails on purpose so the fixture red is observably red", () => {
  expect(1).toBe(2);
});
