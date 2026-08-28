// tests/components/telemetry/telemetryRetryButtonSites.test.ts
//
// The three call sites of TelemetryRetryButton must not collide
// (BL-TELEMETRY-FALLBACK-RETRY, plan Task 1b.5).
//
// The defect this catches is a copy-paste: a second site pasted from the first, keeping its
// `testId` or its `what`. Both failures are silent. A duplicated `testId` makes every
// `getByTestId` in the peer suites ambiguous or, worse, satisfied by the wrong control; a
// duplicated `what` ships two buttons whose only distinguishing feature for a screen-reader
// user, the accessible name, is identical.
//
// DERIVED from the tree rather than from a list, so a fourth site added tomorrow is covered
// by this file on the day it lands rather than on the day someone remembers. The scan is a
// fixed JSX tag name and two attribute literals over `app/` + `components/`; it classifies
// nothing and must not grow into something that does.
//
// WHAT THIS FILE CLAIMS, stated exactly, because two review rounds pushed on the edges of a
// looser claim: every DIRECT `<TelemetryRetryButton …>` usage in `app/` + `components/` is
// the canonical two-literal-prop self-closing form, there are exactly three of them, and
// each stands on its own warning plate with the shared container layout. Total over direct
// usage, and the tag-mention bridge below is what makes it total there.
//
// DOCUMENTED LIMIT — indirect usage is outside the claim, and deliberately so.
// `const Retry = TelemetryRetryButton;` then `<Retry what="…" testId="…" />` is valid JSX
// that ships a fourth control while both counts here stay at three. Probed 2026-08-27 on
// this branch: planted at `EventTimeline.tsx`, this suite reported 7 passed and
// `eventTimeline.test.tsx` reported 6 passed, so nothing on the branch sees it.
// `React.createElement(TelemetryRetryButton, …)` and any dynamic dispatch are outside it for
// the same reason.
//
// Not repaired, and the direction is the point. Closing it means resolving identifiers,
// which is a TSX AST walk with import-binding and ancestor association — a recognizer, and a
// bigger target for the next round than the thing it replaced. Review round 1 raised prop
// SHAPES and round 2 raised ALIASING; one input family per round against a growing parser is
// the shape this repo's repair-direction rule says to stop rather than feed. The threat this
// guard defends against is an ordinary authoring mistake: a contributor adding a fourth
// fallback writes the tag, and the tag is what this file counts. Aliasing a component to add
// a second retry to one fallback is deliberate indirection, not a slip.
//
// RE-FILE TRIGGER: any indirect usage of this component appearing in the live tree, or a
// second component in this directory needing the same census, which would make an AST-based
// helper pay for itself across more than one caller.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { premise } from "../../_shared/premise";
import { stripCommentsForFile } from "../../_shared/stripComments";

const ROOT = join(__dirname, "..", "..", "..");
const ROOTS = ["app", "components"];

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.isFile() && p.endsWith(".tsx") ? [p] : [];
  });
}

type Site = { file: string; what: string; testId: string; at: number; src: string };

/** Every mention of the tag, in ANY form, well- or ill-formed. */
const TAG = /<TelemetryRetryButton\b/g;
/** The CANONICAL form: self-closing, exactly these two props, both string literals. */
const CANONICAL = /<TelemetryRetryButton\s+what="([^"]*)"\s+testId="([^"]*)"\s*\/>/g;

function scanned(): { sites: Site[]; tagMentions: number } {
  const sites: Site[] = [];
  let tagMentions = 0;
  for (const root of ROOTS) {
    for (const abs of walk(join(ROOT, root))) {
      const rel = abs.slice(ROOT.length + 1);
      const src = stripCommentsForFile(readFileSync(abs, "utf8"), rel);
      tagMentions += [...src.matchAll(TAG)].length;
      for (const m of src.matchAll(CANONICAL)) {
        sites.push({ file: rel, what: m[1]!, testId: m[2]!, at: m.index!, src });
      }
    }
  }
  return { sites, tagMentions };
}

/**
 * The plate the site actually stands in: the NEAREST preceding `className` carrying a
 * background token, not the first one in the file.
 *
 * Searching the whole file was the shape a review found: with three fallbacks in one file
 * it would answer about someone else's plate and still pass. A backwards scan from the call
 * site is local without being an AST walk, and it REFUSES rather than guessing — a site with
 * no preceding background className returns null and reds, instead of silently inheriting a
 * neighbour's answer.
 */
/**
 * A className is a TOKEN LIST, so every assertion about one goes through here.
 *
 * Both class-name checks in this file were written with `toContain` on the raw string and
 * both were false-passing, but they were repaired one round apart: round 2 caught
 * `"flex"` inside `"flex-col"`, round 3 caught `"bg-warning-bg"` inside `"bg-warning-bgg"`.
 * Two instances of one shape, and fixing the first without sweeping for the second is the
 * drip the class-sweep rule exists to stop. One function now, so a third assertion cannot
 * reintroduce it by being written the old way.
 */
function classTokens(className: string): Set<string> {
  return new Set(className.split(/\s+/).filter(Boolean));
}

function plateFor(site: Site): string | null {
  const before = site.src.slice(0, site.at);
  const all = [...before.matchAll(/className="([^"]*\bbg-[a-z0-9-]+[^"]*)"/g)];
  return all.length === 0 ? null : all[all.length - 1]![1]!;
}

describe("TelemetryRetryButton call sites", () => {
  const { sites: found, tagMentions } = scanned();

  it("premise: the scan reaches the tree and finds the shipped sites", () => {
    // A walk that silently found nothing makes every assertion below vacuously true, which
    // is the failure mode a derived cover is most exposed to.
    premise("the scan found call sites", found.length, 0);
  });

  // THE TOTALITY BRIDGE, and the reason the rest of this file is allowed to be a token scan
  // rather than an AST walk.
  //
  // A whole-diff review was right that the canonical pattern alone is not total over "every
  // call site": a real site written with reordered props, an expression value, a spread, an
  // extra prop, or a non-self-closing tag matches the tag but not the pattern, and would be
  // silently EXCLUDED while the count assertion still read three.
  //
  // This closes that without growing a parser. Every real site necessarily contains the tag,
  // so if the two counts agree, no real site escaped the pattern. If someone writes a site in
  // another form, the counts diverge and THIS case reds, naming the choice: use the canonical
  // form, or widen the pattern deliberately. The narrowing is honest about what it scans and
  // the bridge is what makes the narrow claim total.
  it("every mention of the tag is a canonical call site the census could read", () => {
    expect(tagMentions).toBe(found.length);
  });

  it("every DIRECT tag usage is a canonical call site, and there are three of them", () => {
    // The literal 3 on purpose: asserted against a count derived from `found` this case
    // would pass after a site was deleted, which is the regression it exists to catch.
    expect(found.length).toBe(3);
  });

  it("no two sites share a testId", () => {
    expect(new Set(found.map((s) => s.testId)).size).toBe(found.length);
  });

  it("no two sites share a subject, and none is empty", () => {
    expect(new Set(found.map((s) => s.what)).size).toBe(found.length);
    expect(found.filter((s) => s.what.trim() === "")).toEqual([]);
  });

  // The impeccable gate caught this one as a live defect, and it is the reason the check
  // exists rather than the reason it was written afterwards: the class sweep that added the
  // control repaired the container at two of the three sites and missed the third, so a
  // 44px control abutted its paragraph at 0px where the peers got 8px. Two of three is the
  // exact drip a derived check turns into a red.
  it("every site's fallback plate carries the same container layout", () => {
    for (const site of found) {
      const plate = plateFor(site);
      expect(plate, `${site.testId} has no plate className before it`).not.toBeNull();
      // TOKENS, not substrings. `toContain("flex")` was satisfied by `flex-col`, so a plate
      // that had lost its standalone `flex` still passed at all three sites — and without
      // `display:flex` the `gap-2` this check exists to protect is inert, which is exactly
      // the regression it was written to catch.
      const tokens = classTokens(plate!);
      for (const cls of ["flex", "flex-col", "items-start", "gap-2"]) {
        expect([...tokens], `${site.testId} plate is missing the ${cls} token`).toContain(cls);
      }
    }
  });

  // The control hardcodes `focus-visible:ring-offset-warning-bg` while its API takes only
  // `{ what, testId }`, so a site on an info or danger plate would ship a mismatched offset
  // colour and nothing would say so. Today every site is a warning plate; this is what makes
  // that hardcoding correct, and it turns "a non-warning caller ships a silent mismatch"
  // into a red at the moment such a caller is added.
  // MODE-3 CHECK, from the four-way taxonomy of green mutation results: a mutant can be
  // applied, in-window, and still sit on a branch the test never executes. `plateFor`'s
  // refusal path is exactly that: every live site has a preceding plate, so the `null`
  // return is never taken by the corpus, and a mutant that broke it would come back green
  // for a reason that has nothing to do with the assertion. Exercised here on a synthetic
  // source so the branch is actually run.
  it("plateFor REFUSES rather than guessing when a site has no plate before it", () => {
    const src = 'const X = () => <div><TelemetryRetryButton what="a" testId="b" /></div>;';
    const at = src.indexOf("<TelemetryRetryButton");
    premise("the synthetic source really contains a call site", at, 0);
    expect(plateFor({ file: "synthetic.tsx", what: "a", testId: "b", at, src })).toBeNull();

    // And the positive half on the same synthetic input, so the null above is a refusal
    // rather than a function that returns null for everything.
    const withPlate =
      'const X = () => <div className="bg-warning-bg flex"><TelemetryRetryButton what="a" testId="b" /></div>;';
    const at2 = withPlate.indexOf("<TelemetryRetryButton");
    expect(
      plateFor({ file: "synthetic.tsx", what: "a", testId: "b", at: at2, src: withPlate }),
    ).toContain("bg-warning-bg");
  });

  it("every site stands on the warning plate the control's focus offset assumes", () => {
    for (const site of found) {
      const plate = plateFor(site);
      expect(plate, `${site.testId} has no plate className before it`).not.toBeNull();
      // Token-exact for the same reason the layout check is: `bg-warning-bgg` is a
      // one-character typo that satisfies a substring test while carrying no background at
      // all, and the control's hardcoded `ring-offset-warning-bg` would then paint against
      // a plate that does not exist.
      expect([...classTokens(plate!)], `${site.testId} is not on the warning plate`).toContain(
        "bg-warning-bg",
      );
    }
  });
});
