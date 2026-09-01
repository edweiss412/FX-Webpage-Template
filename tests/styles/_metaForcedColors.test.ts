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

import { CARRIER_CENSUS, COLLAPSE_CENSUS } from "./forcedColorsCensus";
import { scanCarrierLoss, type CarrierLoss } from "./forcedColorsScan";
import { findCollisions, findUndecidable, loadTokenSurvival } from "./forcedColorsProjection";
import { scanInteractiveElements } from "./interactiveScanCore";

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

// The scan options are load-bearing, not tidy. State-carrying classes commonly sit
// on a painted CHILD rather than on the interactive ancestor — the onboarding step
// pill is exactly that shape — so default options are blind to the very sites this
// pass exists to find.
const UNRESOLVED: string[] = [];
const ELEMENTS = scanInteractiveElements(ROOT, {
  textEntry: true,
  paintedChildren: true,
  onUnresolvedComponent: (i) => UNRESOLVED.push(`${i.file}:${i.line} <${i.tag}>`),
});

premise("the scanner reaches the component tree", ELEMENTS.length, 200);

// Module scope rather than a hook: logic inside `beforeAll` is untestable by
// construction, and a premise inside a callback whose case count can be zero never
// executes in exactly the degenerate case it exists for.
const SURVIVAL = await loadTokenSurvival(ELEMENTS, GLOBALS);

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
    // Keyed on subject AND context, because a subject alone aliases across at-rule
    // contexts: `[data-step3-warning-flash]` exists at the top level and again
    // inside the reduced-motion arm, so a subject-only match let one row license a
    // candidate in the other while the fixed row count stayed green. Whole-diff R1.
    const key = (subject: string, context: readonly string[]) =>
      `${context.join(" > ")}||${subject}`;
    const censused = new Set(CARRIER_CENSUS.map((row) => key(row.subject, row.context)));
    const uncensused = FINDINGS.filter((f) => !censused.has(key(f.subject, f.context))).map((f) =>
      key(f.subject, f.context),
    );
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

  it("records the two cues this pass deliberately leaves alone", () => {
    // Spec §8 limits 7 and 8. Both concern the freshness cue, and both are the
    // kind of thing that rots into an unexplained absence: someone later sees a
    // reported rule with no repair and either repairs it — which for limit 7 would
    // SUPPRESS a working cue, the spec's first draft mistake — or widens the arm
    // to stop reporting it, which hides the class.
    const bySubject = new Map(CARRIER_CENSUS.map((row) => [row.subject, row]));
    for (const subject of [
      "@keyframes section-freshness-flash-1",
      "@keyframes section-freshness-flash-2",
      "[data-section-freshness-flash]",
    ]) {
      const row = bySubject.get(subject);
      expect(row, `${subject} must carry a census row`).toBeDefined();
      expect(row?.disposition, `${subject} is a deliberate flatten, not a repair`).toBe(
        "deliberate-flatten",
      );
    }
  });

  it("keeps the freshness keyframe bodies identical, which an existing pin requires", () => {
    // The cue alternates -1 and -2 to restart, and a drift pin keeps the two
    // bodies the same (app/globals.css:1186-1191). This pass does not touch them,
    // and this case is what makes that a checked claim rather than an intention:
    // repairing one and not the other would leave a flash whose two halves behave
    // differently depending on which one fired.
    const one = CSS.slice(CSS.indexOf("@keyframes section-freshness-flash-1"));
    const two = CSS.slice(CSS.indexOf("@keyframes section-freshness-flash-2"));
    const body = (text: string) => text.slice(text.indexOf("{"), text.indexOf("}\n}") + 3);
    expect(body(one).replace(/-1/g, ""), "the two freshness bodies have drifted apart").toBe(
      body(two).replace(/-2/g, ""),
    );
  });

  it("DESIGN.md carries the pattern, including the per-affordance clause", () => {
    // AC-9. The whole-section pin plus a clause pin, because a section that
    // survives with rule 4 deleted does not pin what bl-orch made a condition of
    // approving the mechanism change: a future author who reads "selected takes
    // Highlight" and goes looking for a selected TOKEN will not find one, and the
    // next thing they try is re-pointing a shared token, which is the failure §3.3
    // records.
    // Fenced blocks are stripped first. The four string-presence mutants this pin
    // owes include "present but not live", and a bare `toContain` passes when the
    // clause is moved inside a code fence — where it reads as an example rather
    // than as the rule. Two of the four mutants were red without this and one was
    // green, which is what put the strip here.
    const design = readFileSync(join(ROOT, "DESIGN.md"), "utf8").replace(/^```[\s\S]*?^```/gm, "");
    expect(design).toContain("Forced colors — outline is the durable carrier");
    expect(design).toContain("They are NOT tokens");
    expect(design, "rule 4's per-affordance clause is the one bl-orch required").toContain(
      "applied PER AFFORDANCE",
    );
    // And the ARIA distinction, which is the pass's sharpest finding and the one
    // most likely to be "simplified" away by someone who reads rule 3 alone.
    expect(design).toContain("ARIA is not a carrier, but it is an excellent selector");
  });

  it("cites no probe row the probe does not measure", () => {
    // Spec review R1 finding 4: the spec licensed `text-shadow` as a measured
    // dropped property while the probe never set or read it. That instance is
    // repaired; this is the CLASS, and it is derivable from both documents rather
    // than re-checked by hand the next time someone adds a claim.
    const spec = readFileSync(
      join(ROOT, "docs/superpowers/specs/2026-09-01-forced-colors-pass.md"),
      "utf8",
    );
    const producer = readFileSync(join(ROOT, "scripts/probes/forced-colors-mechanism.mjs"), "utf8");
    const defined = new Set(
      [...producer.matchAll(/"(M\d+[a-z]?)-[a-z-]+"/g)].map((m) => m[1] as string),
    );
    for (const m of producer.matchAll(/#(M\d+[a-z]?)-[a-z-]+/g)) defined.add(m[1] as string);
    const cited = new Set([...spec.matchAll(/\bM(\d+[a-z]?)\b/g)].map((m) => `M${m[1]}`));

    // Both sides derived, so neither list is typed. A subset assertion alone would
    // pass on a spec that cites nothing, which is why the cited set is premised.
    premise("the spec cites probe rows at all", cited.size, 5);
    premise("the producer defines probe cases at all", defined.size, 5);
    const dangling = [...cited].filter((row) => !defined.has(row)).sort();
    expect(dangling, "the spec cites a probe row the probe does not measure").toEqual([]);
  });

  it("recognises a dropped gradient in every form an author writes it", () => {
    // Three forms whole-diff R1 probed and the first criterion missed, each one
    // ordinary refactor from the live progress rules.
    for (const [label, css] of [
      ["background shorthand", `.x { background: linear-gradient(red, blue); }`],
      ["gradient behind a variable", `.x { background-image: var(--fc-gradient); }`],
      ["shorthand behind a variable", `.x { background: var(--fc-gradient); }`],
    ] as const) {
      expect(scanCarrierLoss(css), `${label} is a dropped carrier`).toHaveLength(1);
    }
    // And a non-gradient image is NOT one, so the widening is not a blanket.
    expect(scanCarrierLoss(`.x { background-image: url(/a.png); }`)).toEqual([]);
  });

  it("reports an animation whose properties are a MIXTURE of dropped and forced", () => {
    // The uniform-set requirement let a mixture through: nothing author-visible
    // moves, but neither `allDropped` nor `allForced` held.
    expect(
      scanCarrierLoss(
        `@keyframes k { from { background-color: red; box-shadow: 0 0 0 2px red; } to { background-color: blue; box-shadow: none; } }`,
      ),
      "a mixture paints nothing either",
    ).toHaveLength(1);
    // A surviving property in the set still exempts it, so the rule is "does
    // ANYTHING survive", not "are they all the same kind of doomed".
    expect(
      scanCarrierLoss(
        `@keyframes k { from { background-color: red; outline-width: 0; } to { background-color: blue; outline-width: 4px; } }`,
      ),
    ).toEqual([]);
  });

  it("does not report the pass's own repairs as defects", () => {
    // The cure is not the disease. A rule scoped to forced-colors IS the treatment,
    // so applying the carrier criterion to it is a category error — and the guard
    // found this by reporting this pass's own `[data-quiet]` repair, which declares
    // a border colour and nothing else.
    const repair = scanCarrierLoss(
      `@media (forced-colors: active) { .x { border-color: Canvas; } }`,
    );
    expect(repair, "a rule that applies only under forced colors is the answer").toEqual([]);
    // And the same declaration OUTSIDE the block is still reported, so the
    // exclusion is scoped rather than a hole.
    expect(scanCarrierLoss(`.x { border-color: Canvas; }`)).toHaveLength(1);
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

  it("counts a longhand outline property as a surviving carrier", () => {
    // `outline-style` reaches the predicate through its REGEX branch, not the
    // `outline` shorthand equality above it, and no case exercised that branch —
    // a surviving mutant flipped the `||` between them to `&&` and nothing
    // noticed. A rule keeping only the longhand still keeps its carrier.
    expect(scanCarrierLoss(`.x { box-shadow: 0 0 0 2px red; outline-style: solid; }`)).toEqual([]);
    // And the same rule without it is still reported, so the case discriminates
    // rather than asserting that nothing is ever reported.
    expect(scanCarrierLoss(`.x { box-shadow: 0 0 0 2px red; }`)).toHaveLength(1);
  });

  it("treats a gradient as a dropped carrier only on background-image", () => {
    // Two surviving mutants lived on this one line: the `&&` joining the property
    // test to the value test, and the `===` in the property test. Both widen
    // `isDroppedGradient` to fire on any gradient-valued declaration, so a
    // `mask-image` gradient becomes a carrier the rule does not actually have.
    expect(
      scanCarrierLoss(`.x { mask-image: linear-gradient(red, blue); }`),
      "a gradient on a property this pass does not model is not a carrier",
    ).toEqual([]);
    // The real case still reports, so the narrowing is not a blanket exemption.
    expect(scanCarrierLoss(`.x { background-image: linear-gradient(red, blue); }`)).toHaveLength(1);
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

describe("forced-colors state collapse (Arm 1)", () => {
  it("sees a painted child, which default options cannot", () => {
    // The discriminating case for the options themselves. Under default options the
    // wizard's step pill is invisible: the scanner reports its <Link> ancestor with
    // one path. This case fails if `paintedChildren` is ever dropped.
    const pill = ELEMENTS.find(
      (el) => el.file.endsWith("OnboardingWizard.tsx") && el.admittedAs === "painted-child",
    );
    expect(
      pill,
      "the step pill is a painted child; without that option it is unseen",
    ).toBeDefined();
    expect(new Set(pill?.paths.map((p) => p.join(" "))).size).toBeGreaterThan(1);
  });

  it("reports the collapsing pairs as pairs, not as element unions", () => {
    const collisions = findCollisions(ELEMENTS, SURVIVAL);
    premiseHolds("some element collapses on today's tree", collisions.length > 0);

    // CrewSubNav's tab has eight paths and only some pairs collide. A union over all
    // eight would report tokens that have nothing to do with the collision, which is
    // why the unit is the pair.
    const tab = collisions.find((c) => c.file.endsWith("CrewSubNav.tsx"));
    expect(tab, "the crew tab bar collapses and must be reported").toBeDefined();
    expect(tab?.differing).toContain("border-transparent");
    expect(tab?.differing).toContain("border-accent");
  });

  it("does not treat a shadow or ring utility as a survivor", () => {
    // The instrument bug plan review R2 found: candidatesToCss returns the
    // candidate's rule PLUS the @property definitions its custom properties need,
    // and those declare syntax/inherits/initial-value. Scanning the whole string
    // reads shadow-tile and every ring utility as author-controlled, which HIDES
    // collapses. Silent, and it looks like a smaller inventory.
    // Derived over the tokens the scan actually found, not a typed list: a named
    // token the corpus stops wearing would make a hardcoded assertion vacuous, and
    // `shadow-popover` is exactly that case today (no scanned element wears it).
    const shadowish = [...SURVIVAL.keys()].filter((t) =>
      /^(shadow-|ring-\d|ring-offset-\d)/.test(t.replace(/^[a-z0-9@:[\]()<>_-]*:/, "")),
    );
    premise("the corpus wears at least one shadow or ring utility", shadowish.length, 0);
    const survivors = shadowish.filter((t) => SURVIVAL.get(t) !== false);
    expect(survivors, "a dropped carrier reported as a survivor hides collapses").toEqual([]);
  });

  it("leaves no collapsing element outside the census", () => {
    const collisions = findCollisions(ELEMENTS, SURVIVAL);
    const sites = new Set(collisions.map((c) => `${c.file}:${c.line}`));
    const censused = new Set(COLLAPSE_CENSUS.map((r) => r.site));
    const undisposed = [...sites].filter((s) => !censused.has(s)).sort();
    expect(
      undisposed,
      "a collapsing element with no disposition — repair it, or name the carrier that survives",
    ).toEqual([]);
  });

  it("holds exactly 42 collapse rows, each disposed once", () => {
    // The anti-vacuity literal. A subset assertion passes while the census grows
    // silently, and the family sum is what stops a new site landing in no family.
    expect(COLLAPSE_CENSUS).toHaveLength(42);
    expect(new Set(COLLAPSE_CENSUS.map((r) => r.site)).size).toBe(42);
    const repaired = COLLAPSE_CENSUS.filter((r) => r.disposition === "repaired");
    expect(repaired, "the repair set the pass owes AC-4").toHaveLength(12);
  });

  it("gives every repair row a binding, and says which are not yet browser-bound", () => {
    // Whole-diff review R1's first finding: AC-4 renders the colliding class
    // strings against the live compiled stylesheet, which proves the CSS repair,
    // and does not render the component. A row holding only a site and a token pair
    // cannot be navigated to, so a live condition could invert and the synthetic
    // case would stay green.
    //
    // Requiring the binding is what turns that from invisible into addressable. It
    // does not by itself close the gap — `bound` says so per row — but a repair
    // added later cannot skip the question.
    const repairs = COLLAPSE_CENSUS.filter((r) => r.disposition === "repaired");
    const unbound = repairs.filter((r) => r.binding === undefined).map((r) => r.site);
    expect(unbound, "a repair row with no stated way to reach the control").toEqual([]);

    const thin = repairs
      .filter((r) => (r.binding?.locator.length ?? 0) < 3 || (r.binding?.toggle.length ?? 0) < 10)
      .map((r) => r.site);
    expect(thin, "a binding that names no real locator or no real toggle").toEqual([]);

    // The honest count, pinned so it can only move deliberately. Every repair is
    // currently proved at the CSS level and none is proved through its live
    // component; spec §8 records that and names the re-open trigger.
    const bound = repairs.filter((r) => r.binding?.bound === true).length;
    expect(bound, "browser-bound repair rows; raising this is the point of the binding field").toBe(
      0,
    );
  });

  it("gives every non-repair row a reason that names something", () => {
    // A census whose reasons are empty is a filter wearing a census's clothes.
    //
    // `"same"` is a legal back-reference to the row above, which keeps a run of
    // sibling sites readable — but ONLY when that row states a real reason, so a
    // run cannot start with one and carry nothing. Checked rather than trusted.
    const SUBSTANTIVE = 20;
    const thin: string[] = [];
    COLLAPSE_CENSUS.forEach((row, i) => {
      if (row.disposition === "repaired") return;
      if (row.reason.trim().length >= SUBSTANTIVE) return;
      const previous = COLLAPSE_CENSUS[i - 1];
      const backReferenceOk =
        row.reason.trim() === "same" &&
        previous !== undefined &&
        previous.disposition === row.disposition &&
        previous.reason.trim().length >= SUBSTANTIVE;
      if (!backReferenceOk) thin.push(row.site);
    });
    expect(thin, "a disposition without a stated carrier is not a disposition").toEqual([]);
  });

  it("rejects a back-reference chain, which is what makes one unreadable", () => {
    // The discriminating half. Without it the case above passes on a census whose
    // rows all say "same" — the exact degenerate it exists to forbid — and it also
    // has to reject a CHAIN, because the second "same" in a row points at a row
    // that itself named nothing. Three switch-track rows were written that way and
    // this is what caught them.
    const chain = [
      {
        site: "a.tsx:1",
        disposition: "deliberate-flatten" as const,
        reason: "a real stated reason, long enough",
      },
      { site: "b.tsx:2", disposition: "deliberate-flatten" as const, reason: "same" },
      { site: "c.tsx:3", disposition: "deliberate-flatten" as const, reason: "same" },
    ];
    const SUBSTANTIVE = 20;
    const thin = chain.filter((row, i) => {
      if (row.reason.trim().length >= SUBSTANTIVE) return false;
      const previous = chain[i - 1];
      return !(
        row.reason.trim() === "same" &&
        previous !== undefined &&
        previous.disposition === row.disposition &&
        previous.reason.trim().length >= SUBSTANTIVE
      );
    });
    expect(
      thin.map((r) => r.site),
      "the SECOND same in a chain points at nothing",
    ).toEqual(["c.tsx:3"]);
  });

  it("reports what it cannot decide instead of passing it", () => {
    const undecidable = findUndecidable(ELEMENTS, UNRESOLVED);
    // AC-4c. A component the resolver cannot name used to vanish from the cover in
    // silence, which is the one outcome the consequence bound forbids.
    //
    // EXACT, not "non-empty". Whole-diff R1: a growth-only check stays green as the
    // set grows, which is the whole failure it exists to catch — and it made the
    // plan's claimed `aria-current:bg-accent` plant unable to go red. The literal
    // is the anti-vacuity case here exactly as it is for the two censuses.
    expect(
      undecidable.length,
      "the cannot-decide set moved; read the new rows and either resolve them or re-pin",
    ).toBe(124);
    expect(
      undecidable.every((row) => /:\d+ </.test(row) || row.includes("single-path-state-variant")),
      "every cannot-decide row names a site",
    ).toBe(true);
  });
});
