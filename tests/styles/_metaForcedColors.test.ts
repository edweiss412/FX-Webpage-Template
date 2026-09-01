/**
 * Forced-colors fragility guard. Spec
 * `docs/superpowers/specs/2026-09-01-forced-colors-pass.md`, plan Task 1 and Task 2.
 *
 * WHAT THIS GUARD IS FOR. Under `forced-colors: active` a UA drops box-shadow,
 * text-shadow and gradients outright, and forces every colour onto its own
 * palette. An affordance carried only by those properties has no forced-colors
 * existence; an off state written as a transparent border or outline INVERTS and
 * becomes visible. Both classes are silent: nothing errors, a suite that never
 * emulates forced colors stays green, and the defect reaches a crew member using
 * Windows High Contrast on the venue floor.
 *
 * The premise cases below are not ceremony. This guard's failure mode is
 * vacuity — a parser that matched nothing, or a walk that reached no file, makes
 * every assertion here trivially true — so each arm proves it SAW a known member
 * before it asserts anything about content.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { premise, premiseHolds } from "../_shared/premise";

import { CARRIER_CENSUS } from "./forcedColorsCensus";
import { scanCarrierLoss, type CarrierLoss } from "./forcedColorsScan";

const ROOT = join(__dirname, "..", "..");
const GLOBALS = join(ROOT, "app", "globals.css");
const CSS = readFileSync(GLOBALS, "utf8");

const FINDINGS: CarrierLoss[] = scanCarrierLoss(CSS);

// The parse reached the file, and the file is the one we think it is. A scanner
// handed an empty string returns [] and every emptiness assertion below passes.
premiseHolds(
  "the parsed stylesheet contains the share-link cue this pass is named for",
  CSS.includes("@keyframes share-link-flash-ring"),
);
premise("the stylesheet declares rules to walk", CSS.split("{").length, 100);

describe("forced-colors carrier loss (Arm 2)", () => {
  it("reaches the stylesheet and reports something", () => {
    // Anti-vacuity. Arm 2 returning [] on today's tree would make the inventory
    // case below pass while the guard saw nothing at all.
    expect(FINDINGS.length).toBeGreaterThan(0);
  });

  it("arm 2 inventory", () => {
    // Prints the rows so the spec can cite this command instead of pasting a
    // count that goes stale the next time anyone edits globals.css.
    const rows = FINDINGS.map(
      (f) =>
        `${f.kind}  ${f.context.join(" > ")}${f.context.length ? " > " : ""}${f.subject}  [${f.carriers.join(",")}]`,
    ).sort();
    console.log(`\narm 2 inventory (${rows.length} rows)\n${rows.map((r) => `  ${r}`).join("\n")}`);
    expect(rows.length).toBe(FINDINGS.length);
  });

  it("finds the share-link ring, whose only carrier is a dropped box-shadow", () => {
    const ring = FINDINGS.find((f) => f.subject === "@keyframes share-link-flash-ring");
    expect(ring, "the cue this pass is named for must be reported").toBeDefined();
    expect(ring?.kind).toBe("a2b-animation");
    expect(ring?.carriers).toEqual(["box-shadow"]);
  });

  it("finds the step-3 steady fallback, whose carrier is FORCED rather than dropped", () => {
    // Spec review R1 finding 2: a first draft required a DROPPED carrier, which
    // silently missed every rule whose carriers are forced instead. This case is
    // that finding pinned, so the narrower criterion cannot come back.
    const steady = FINDINGS.find(
      (f) =>
        f.subject === "[data-step3-warning-flash]" &&
        f.context.some((c) => c.includes("prefers-reduced-motion")),
    );
    expect(steady, "a forced-only carrier set is still an empty surviving set").toBeDefined();
    expect(steady?.carriers).toEqual(["background-color"]);
  });

  it("leaves no reported rule outside the census", () => {
    // The ASSERTING case, which the two printing cases above are not. Round 4 of
    // plan review caught that an inventory which only prints is not a gate: a
    // contributor adding a new carrier-loss rule to globals.css would see it
    // reported and nothing would fail. This is what makes AC-7 bite.
    const censused = new Set(CARRIER_CENSUS.map((row) => row.subject));
    const uncensused = FINDINGS.map((f) => f.subject).filter((s) => !censused.has(s));
    expect(
      uncensused,
      "a carrier-loss rule with no disposition — repair it or give it a census row naming what survives",
    ).toEqual([]);
  });

  it("holds exactly 17 census rows", () => {
    // The anti-vacuity literal. A subset assertion passes while the census grows
    // silently, so the count is pinned separately; the equivalent case in
    // tests/styles/_metaControlOutlineFill.test.ts:117 calls itself "the single
    // most important case in the file" for this reason.
    expect(CARRIER_CENSUS).toHaveLength(17);
    expect(new Set(CARRIER_CENSUS.map((r) => r.subject)).size).toBe(17);
  });

  it("reads the SOURCE stylesheet, where a utility is not an affordance", () => {
    // Run the same criterion over compiled output and it reports an order of
    // magnitude more, every extra one a Tailwind .shadow-*/.ring-* utility that
    // does declare a shadow and nothing else. True about Tailwind, useless about
    // this app. Asserted rather than described so the choice is re-measured.
    const compiledLike = `.shadow-tile { box-shadow: var(--shadow-tile-runtime); }
.ring-2 { box-shadow: var(--tw-ring-shadow); }
.shadow-popover { box-shadow: var(--shadow-popover-runtime); }`;
    const utilities = scanCarrierLoss(compiledLike);
    expect(
      utilities.length,
      "the criterion DOES report bare utilities, which is why the arm is pointed at source",
    ).toBe(3);
    // And none of them is in the census, because none is an affordance.
    const censused = new Set(CARRIER_CENSUS.map((r) => r.subject));
    expect(utilities.every((u) => !censused.has(u.subject))).toBe(true);
  });

  it("does not report a rule that keeps a surviving carrier", () => {
    // The discriminating half. Without it every assertion above is satisfied by a
    // scanner that reports EVERYTHING, which is as useless as one that reports
    // nothing and passes far more of the cases above.
    const withCarrier = scanCarrierLoss(
      `.x { box-shadow: 0 0 0 2px red; outline: 2px solid red; }`,
    );
    expect(withCarrier).toEqual([]);
    const withoutCarrier = scanCarrierLoss(`.x { box-shadow: 0 0 0 2px red; }`);
    expect(withoutCarrier).toHaveLength(1);
  });

  it("judges an animation by its whole property set, not step by step", () => {
    // A keyframe step in isolation looks like a rule with one forced carrier.
    // Judged that way, EVERY colour animation in the file reports. The unit is
    // the animation.
    const mixed = scanCarrierLoss(
      `@keyframes k { from { background-color: red; outline-width: 0; } to { background-color: blue; outline-width: 4px; } }`,
    );
    expect(mixed, "an animation that also moves a surviving property still paints").toEqual([]);
  });
});
