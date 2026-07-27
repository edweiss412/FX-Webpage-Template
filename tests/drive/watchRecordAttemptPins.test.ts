// Structural source pins for the recordAttempt call-site topology (backoff
// spec §3.3a caller table; §6 classes 18/7). A deps-injected spy replaces the
// whole subscribe function and cannot observe the OPTIONS the production
// default binding passes, and reconcile's default binding is a same-module
// lexical no mock can reach — so the literals are pinned at the source level,
// the same idiom as the observe secret-scan pin (lib/observe/query/watch.ts:1-5).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync("lib/drive/watch.ts", "utf8");

describe("recordAttempt call-site pins (spec §3.3a)", () => {
  it("reconcile's default subscribe binding opts IN", () => {
    const m = src.match(/deps\.subscribeToWatchedFolder \?\?[\s\S]{0,200}?recordAttempt: true/);
    expect(m, "reconcile call site must pass recordAttempt: true").toBeTruthy();
  });

  it("refresh's default subscribe binding does NOT opt in (class 7, half b)", () => {
    const m = src.match(/const subscribe =[\s\S]{0,300}?;/);
    expect(m, "refresh default binding not found").toBeTruthy();
    expect(m![0]).not.toContain("recordAttempt");
  });
});
