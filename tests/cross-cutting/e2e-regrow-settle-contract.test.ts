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
 * Characters after an arming site within which its retry must appear. Measured
 * against the real file, not guessed: the single surviving site puts `.toPass(`
 * at +659, so 900 clears it by 241. A 600-char window would REJECT the correct
 * implementation — that was measured too. When prose pushed a site past the
 * window, the comment moved above the arming click rather than the window
 * widening: a window that grows to accommodate comments stops being a guard, and
 * that is exactly what happened when T-REGROW was re-derived for the docked
 * anchor — the explanation of each assertion sits above the arming click.
 */
const ARM_WINDOW = 900;

/** The retry callback's opening token, matched literally at each arming site. */
const CALLBACK_OPENER = "expect(async () => {";

/**
 * Per arming site, the measurement fields whose presence inside the retry callback
 * is what makes the retry REAL.
 *
 * ONE site since the dock. T-REGROW used to arm twice: once in a ladder that
 * swept viewports for a height where the idle body fit its side uncapped and the
 * armed body did not, and once in the real run. That state is unreachable at
 * EVERY viewport now — the room on the chosen side grows at 0.85 per viewport
 * pixel while the body is capped at `min(0.7*vh, 480)`, so the room outruns the
 * body (derivation:
 * docs/superpowers/specs/ci/2026-08-26-lifecycle-popover-docked-geometry-repair.md §2).
 * The ladder went with it, and the surviving site carries every field the two
 * used to split — which is why this list got LONGER as it got shorter by one row.
 *
 * DOCUMENTED LIMIT, stated so it is not rediscovered: this is a source-text
 * TRIPWIRE, not a proof of semantics. It cannot tell an assertion from the same
 * token inside a comment, and no textual predicate can — three review rounds
 * closed three progressively hollower callbacks and a fourth shape is always
 * constructible against a purely generic check. Naming the invariant's own fields
 * is where the tripwire stops being generic: a hollow callback cannot mention what
 * it never measured, and moving the real assertions outside the retry removes
 * these tokens from the callback body. What ultimately proves the retry works is
 * the case itself running in `lifecycle-layout-e2e`.
 */
const ARM_SITE_REQUIRED_FIELDS: readonly (readonly string[])[] = [
  [
    "scrollHeight",
    "idle!.scrollHeight",
    "roomOnChosenSide",
    "natural",
    "inlineMaxHeight",
    "overflow",
    "bodyTop",
    "bodyBottom",
    "boundsTop",
    "boundsBottom",
  ],
];

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
    // ONE arming site since the dock retired the ladder — see
    // ARM_SITE_REQUIRED_FIELDS above. Pinned as an EQUALITY, not a floor: a
    // re-added ladder would arm a second time and must come back through this
    // guard rather than past it.
    expect(sites.length, "T-REGROW should arm the confirm exactly once (the real run)").toBe(1);
    sites.forEach((at, n) => {
      const window = slice.slice(at, at + ARM_WINDOW);
      // Proximity alone would accept a one-shot measurement followed by an
      // unrelated retry, so the three tokens are required IN ORDER: the retry
      // callback opens, the measurement happens inside it, and the block closes
      // with .toPass. That ordering is what establishes containment from source
      // text — `expect(async () => {` … `measure()` … `}).toPass(`.
      const opensAt = window.indexOf(CALLBACK_OPENER);
      const measuresAt = window.indexOf("measure()");
      const passesAt = window.indexOf(".toPass(");
      expect(
        opensAt,
        `arming site ${n + 1}: no retry callback opens within ${ARM_WINDOW} chars`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        measuresAt,
        `arming site ${n + 1}: no measure() within ${ARM_WINDOW} chars`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        passesAt,
        `arming site ${n + 1}: no .toPass( within ${ARM_WINDOW} chars — a slice-wide toPass COUNT ` +
          "would pass here on openHub's own retry plus one converted measurement, which is exactly " +
          "the half-done conversion this assertion exists to catch",
      ).toBeGreaterThanOrEqual(0);
      expect(
        opensAt < measuresAt && measuresAt < passesAt,
        `arming site ${n + 1}: the measurement must sit INSIDE the retry callback ` +
          `(callback opens at +${opensAt}, measure() at +${measuresAt}, .toPass( at +${passesAt})`,
      ).toBe(true);
      // Token ORDER alone still admits a hollow retry: a review mutation reduced
      // the callback to `expect(async () => { void measure(); }).toPass(...)` and
      // moved the real read back outside, and every assertion above stayed green.
      // So the callback BODY must actually await the measurement and assert on it.
      // Slice from AFTER the opener, not from it: `expect(async () => {` is itself
      // an `expect(`, so counting from opensAt would make any assertion check
      // trivially true.
      const callbackBody = window.slice(opensAt + CALLBACK_OPENER.length, passesAt);
      expect(
        /await\s+measure\(\)/.test(callbackBody),
        `arming site ${n + 1}: the retry callback must AWAIT measure() — a callback that ` +
          "fires it and discards the promise retries on nothing",
      ).toBe(true);
      // Name the invariant's OWN fields rather than asking for "an expect(".
      // Three review rounds each defeated a more generic predicate with a hollower
      // callback -- `void measure()`, then no assertion at all, then
      // `expect(true).toBe(true)`. Every one of them satisfies a shape check and
      // none of them retries the thing under test. Requiring the fields the
      // measurement actually returns is what a hollow callback cannot supply, and
      // it fails just as loudly if the real assertions are moved back outside.
      for (const field of ARM_SITE_REQUIRED_FIELDS[n]!) {
        expect(
          callbackBody.includes(field),
          `arming site ${n + 1}: the retry callback must assert on \`${field}\` — without it the ` +
            "retry is decorative and the invariant is being read once, outside the retry",
        ).toBe(true);
      }
      expect(
        window.includes("waitForTimeout"),
        `arming site ${n + 1}: a fixed wait reappeared`,
      ).toBe(false);
    });
  });
});
