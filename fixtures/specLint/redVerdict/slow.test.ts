import { expect, it } from "vitest";

// Collection executes module scope, so this sleep is paid by `vitest list` and
// not only by `vitest run` — which is what lets the CLI suite prove the probe
// ceiling deterministically against a one-second `SPEC_LINT_EXEC_TIMEOUT_SECS`.
await new Promise((resolve) => setTimeout(resolve, 30_000));

it("never gets this far under the fixture ceiling", () => {
  expect(true).toBe(true);
});
