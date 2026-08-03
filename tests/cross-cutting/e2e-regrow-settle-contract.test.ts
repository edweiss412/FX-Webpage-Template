// DRAFT of tests/cross-cutting/e2e-regrow-settle-contract.test.ts
//
// Structural guard for the T-REGROW settle contract (spec
// docs/superpowers/specs/ci/2026-08-02-ci-boot-overlap-implementation.md §6).
//
// T-REGROW's two armed measurements used fixed `page.waitForTimeout` calls. The
// re-placement they were waiting for is an async effect downstream of the body's
// growth, so on a loaded runner the measurement read the PRE-re-placement state
// and the clip-rect assertion failed — observed once on PR #604 in
// lifecycle-layout-e2e / mobile-safari, 24 passed / 1 failed, and green on a
// re-run of the identical tree.
//
// This guard pins the fix in place: no fixed wait inside T-REGROW, and a retry
// anchored at EACH arming site. A slice-wide `.toPass(` COUNT would not work —
// `openHub`'s own kebab-click retry lives inside the slice, so "at least two" is
// already satisfied by openHub plus ONE converted measurement, and a half-done
// conversion would pass.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SPEC_PATH = join(process.cwd(), "tests", "e2e", "admin-lifecycle-layout.spec.ts");
const SOURCE = readFileSync(SPEC_PATH, "utf8");

/** T-REGROW's body: from its `test(` line to the banner opening the next case. */
const regrowSlice = (): string => {
  const start = SOURCE.indexOf('test("T-REGROW:');
  const end = SOURCE.indexOf("// ── T-CARET-1", start);
  expect(start, "T-REGROW's test( line not found — the slice regex is stale").toBeGreaterThan(-1);
  expect(end, "the T-CARET-1 banner that bounds T-REGROW not found").toBeGreaterThan(start);
  return SOURCE.slice(start, end);
};

/**
 * Characters after an arming site within which its retry must appear. Measured,
 * not guessed: applying the fix puts `.toPass(` at +333 for the ladder site and
 * +733 for the real-run site, whose retried block carries the two invariant
 * comments. 600 would fail the correct implementation; 900 clears the larger site
 * by ~170 and stays far short of the ~1,280 separating the two sites.
 */
const ARM_WINDOW = 900;

describe("T-REGROW settle contract", () => {
  it("reads a plausible T-REGROW body (anti-vacuity)", () => {
    const slice = regrowSlice();
    expect(slice.length, "slice is implausibly short — the bounds are wrong").toBeGreaterThan(500);
    expect(slice).toContain("archive-show-confirm-button");
    expect(slice).toContain("measure()");
  });

  it("contains no fixed wait — the settle must be condition-based", () => {
    expect(
      regrowSlice().includes("page.waitForTimeout("),
      "T-REGROW must not use a fixed wait: the re-placement it waits for is an async effect " +
        "downstream of the body's growth, and a fixed wait reads the pre-re-placement state on a " +
        "loaded runner (PR #604, lifecycle-layout-e2e / mobile-safari)",
    ).toBe(false);
  });

  it("anchors a retry at EACH arming site, not merely somewhere in the body", () => {
    const slice = regrowSlice();
    const sites: number[] = [];
    for (let i = slice.indexOf("archive-show-confirm-button"); i !== -1; ) {
      sites.push(i);
      i = slice.indexOf("archive-show-confirm-button", i + 1);
    }
    expect(sites.length, "T-REGROW should arm the confirm exactly twice (ladder + real run)").toBe(2);
    sites.forEach((at, n) => {
      const window = slice.slice(at, at + ARM_WINDOW);
      expect(window, `arming site ${n + 1}: no measure() within ${ARM_WINDOW} chars`).toContain(
        "measure()",
      );
      expect(
        window,
        `arming site ${n + 1}: no .toPass( within ${ARM_WINDOW} chars — a slice-wide toPass COUNT ` +
          "would pass here on openHub's own retry plus one converted measurement, which is exactly " +
          "the half-done conversion this assertion exists to catch",
      ).toContain(".toPass(");
      expect(
        window.includes("waitForTimeout"),
        `arming site ${n + 1}: a fixed wait reappeared`,
      ).toBe(false);
    });
  });
});
