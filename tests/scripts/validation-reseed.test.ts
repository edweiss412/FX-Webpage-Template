// Phase 0.C Task 0.C.1 — help-text shape probe for the validation:reseed CLI.
// Per plan 03 Task 0.C.1 Step 1.
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";

describe("validation-reseed CLI", () => {
  it("prints usage when invoked with --help", () => {
    const out = execFileSync("pnpm", ["-s", "validation:reseed", "--help"], {
      encoding: "utf-8",
    });
    expect(out).toContain("--combo");
    expect(out).toContain("--allow-local-override");
  });
});
