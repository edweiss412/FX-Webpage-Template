// Structural guard for the three de-waited lifecycle-layout cases
// (BL-E2E-LAYOUT-FIXED-WAIT-RESIDUE).
//
// SIBLING OF `e2e-regrow-settle-contract.test.ts`, which pins the same contract
// for T-REGROW. That case was converted first, after a fixed wait produced a
// real failure on PR #604 — mobile-safari, 24 passed / 1 failed, green on a
// re-run of the identical tree. Three fixed waits survived that sweep in three
// other cases; this guard covers them and states the extra rule their conversion
// needs.
//
// THE EXTRA RULE: A SETTLE PREDICATE MUST NOT BE THE ASSERTION. The entry names
// this as the review focus, and it is the failure mode that makes a converted
// wait WORSE than the fixed one it replaced. A `toPass` retries its callback
// until it stops throwing; if the callback asserts what the test is there to
// prove, the case reports green on a run where the product never did the thing —
// it simply waited until it had, or timed out into a failure blamed on flake.
// The fixed wait was at least honest about proving nothing.
//
// So each site is checked in both directions: the retry must EXIST, and its
// callback must NOT mention the tokens the case's own assertions are written in.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SPEC_PATH = join(process.cwd(), "tests", "e2e", "admin-lifecycle-layout.spec.ts");
const SOURCE = readFileSync(SPEC_PATH, "utf8");

/** Chars after the anchor within which the site's retry must appear. */
const SITE_WINDOW = 1400;

const CALLBACK_OPENER = "expect(async () => {";

/**
 * The three converted sites.
 *
 * `anchor` is the source token immediately BEFORE the settle point — the action
 * whose completion the case used to sleep through. `forbidden` is the vocabulary
 * of that case's own assertions: tokens whose appearance inside the retry
 * callback would mean the wait condition and the assertion have merged.
 */
const SITES: ReadonlyArray<{
  name: string;
  anchor: string;
  slice: { from: string; to: string };
  forbidden: readonly string[];
}> = [
  {
    name: "T-CONFIRM-SCROLL",
    anchor: `const confirm = popover.getByTestId("archive-show-confirm-button");`,
    slice: {
      from: `test("390x560: arming scrolls`,
      to: "// ── T-REGROW",
    },
    // The case asserts the recorded call's SHAPE and the resulting geometry.
    // The predicate may know a call happened; it may not know any of this.
    forbidden: ["opts?.block", "handlerCall", "scrollHeight", "confirmTop", "clientHeight"],
  },
  {
    name: "T-FIT/T-REACH",
    anchor: `await expect(popover.getByTestId("archive-show-confirm-button")).toBeVisible();`,
    slice: {
      from: "test(`T-FIT/T-REACH @ 390x${height}",
      to: 'test("T-TRANSITION:',
    },
    // The case asserts containment of the body within `bounds`, and hit-testing.
    forbidden: ["bounds.top", "bounds.bottom", "armedHit", "elementFromPoint", "TOL"],
  },
  {
    name: "T-TRANSITION",
    // 420, not 560. The case used to resize ACROSS THE SIDE FLIP, and the dock
    // retired that boundary: ShareHub's trigger sits on the panel floor, so the
    // module answers `top` at every height and no viewport pair flips it. The
    // resize now crosses the CAP boundary between 460 and 560 instead — a
    // measured bracket, not an exact threshold (derivation:
    // docs/superpowers/specs/ci/2026-08-26-lifecycle-popover-docked-geometry-repair.md §2),
    // which is a boundary of the same kind and the one witness left that proves
    // placement re-ran.
    anchor: "await page.setViewportSize({ width: 390, height: 420 });",
    slice: {
      from: 'test("T-TRANSITION:',
      to: 'test("T-CARET-OPENER',
    },
    // The case asserts the cap crossing, that the cap equals the room, that the
    // confirm node SURVIVED (not remounted), and the panel-containment maths.
    // `after.cap` and `roomOnChosenSide` join the list with the new witness: the
    // predicate may watch the styles settle, it may not read the answer the case
    // is there to check.
    forbidden: [
      "data-transition-probe",
      "sameConfirmNode",
      "popoverStillOpen",
      "withinBounds",
      "after.cap",
      "roomOnChosenSide",
    ],
  },
];

/** The slice of source belonging to one case. */
function sliceOf(site: (typeof SITES)[number]): string {
  const start = SOURCE.indexOf(site.slice.from);
  expect(
    start,
    `${site.name}: opening anchor not found — the slice anchors are stale`,
  ).toBeGreaterThan(-1);
  const end = SOURCE.indexOf(site.slice.to, start + 1);
  expect(end, `${site.name}: closing anchor not found after the opening one`).toBeGreaterThan(
    start,
  );
  return SOURCE.slice(start, end);
}

/** The retry callback body that follows a site's anchor. */
function retryBodyAt(site: (typeof SITES)[number], slice: string): string {
  const at = slice.indexOf(site.anchor);
  expect(at, `${site.name}: settle anchor not found inside its own case`).toBeGreaterThan(-1);
  const window = slice.slice(at, at + SITE_WINDOW);
  const opener = window.indexOf(CALLBACK_OPENER);
  expect(
    opener,
    `${site.name}: no \`${CALLBACK_OPENER}\` within ${SITE_WINDOW} chars of its settle point — ` +
      `the fixed wait was removed without a retry replacing it, which is strictly worse than ` +
      `leaving it in`,
  ).toBeGreaterThan(-1);
  const rest = window.slice(opener);
  const close = rest.indexOf("}).toPass(");
  expect(
    close,
    `${site.name}: the retry callback is not closed by a .toPass( within the window`,
  ).toBeGreaterThan(-1);
  return rest.slice(0, close);
}

describe("lifecycle-layout settle contract (BL-E2E-LAYOUT-FIXED-WAIT-RESIDUE)", () => {
  it("the guard's own premise: the spec file was read and the sites exist", () => {
    // A guard whose source read silently returned nothing would pass every row
    // below vacuously. Assert the corpus is real before asserting anything about
    // it (tests/_shared/premise.ts shape).
    expect(SOURCE.length).toBeGreaterThan(10_000);
    expect(SITES.length).toBe(3);
    for (const site of SITES) expect(sliceOf(site).length).toBeGreaterThan(200);
  });

  it("has no fixed wait anywhere in the spec", () => {
    // Whole-file, not per-slice. A fixed wait re-added to a case this guard does
    // not slice would otherwise be invisible, and the class is "fixed waits in
    // this spec", not "fixed waits in four named cases".
    const hits = SOURCE.split("\n")
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter((r) => r.line.includes("waitForTimeout"));
    expect(
      hits.map((h) => `${h.n}: ${h.line}`),
      "a fixed wait sleeps through the event it is standing in for; settle on a signal instead",
    ).toEqual([]);
  });

  for (const site of SITES) {
    it(`${site.name}: settles on a retry at its own site`, () => {
      expect(retryBodyAt(site, sliceOf(site)).length).toBeGreaterThan(40);
    });

    it(`${site.name}: the settle predicate is not the assertion`, () => {
      const body = retryBodyAt(site, sliceOf(site));
      const leaked = site.forbidden.filter((token) => body.includes(token));
      expect(
        leaked,
        `${site.name}'s retry callback mentions ${leaked.join(", ")} — vocabulary from the case's ` +
          `OWN assertions. A retry that waits until its assertion holds reports green on a run ` +
          `where the product never acted, which is the tautology this entry exists to prevent. ` +
          `Settle on the condition that PRECEDES the measurement, never on the measured value.`,
      ).toEqual([]);
    });

    it(`${site.name}: its assertions stay OUTSIDE the retry`, () => {
      // The complement of the row above. The forbidden vocabulary must still
      // appear in the case — just after the retry, not inside it. Without this,
      // deleting the assertions entirely would satisfy the tautology check.
      const slice = sliceOf(site);
      const present = site.forbidden.filter((token) => slice.includes(token));
      expect(
        present.length,
        `${site.name}: none of its assertion vocabulary (${site.forbidden.join(", ")}) appears in ` +
          `the case at all — the tautology check above would pass on a case that asserts nothing`,
      ).toBeGreaterThan(0);
    });
  }
});
