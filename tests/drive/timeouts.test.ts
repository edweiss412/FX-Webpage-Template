import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DRIVE_FILES_GET_TIMEOUT_MS } from "@/lib/drive/timeouts";
import { DRIVE_FILES_GET_TIMEOUT_MS as reexported } from "@/lib/drive/fetch";

describe("lib/drive/timeouts", () => {
  it("holds the 8s metadata budget and is re-exported by fetch.ts", () => {
    expect(DRIVE_FILES_GET_TIMEOUT_MS).toBe(8_000);
    expect(reexported).toBe(DRIVE_FILES_GET_TIMEOUT_MS);
  });

  it("is a leaf module: no imports AND no re-exports (routes must not inherit fetch.ts's xlsx cost)", () => {
    const src = readFileSync("lib/drive/timeouts.ts", "utf8");
    expect(src).not.toMatch(/^\s*import /m);
    // A circular `export ... from "@/lib/drive/fetch"` re-export would satisfy
    // both value assertions while pulling xlsx right back in. No module
    // specifier of any kind may appear in this file.
    expect(src).not.toMatch(/\bfrom\s+["']/);
  });
});
