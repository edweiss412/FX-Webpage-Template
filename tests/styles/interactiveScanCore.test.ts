import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { premiseHolds } from "../_shared/premise";
import {
  FLOOR_COMPONENT_ALLOWLIST,
  allStrings,
  defeaterPresent,
  heightFloorSatisfied,
  scanInteractiveElements,
  type ScanElement,
} from "./interactiveScanCore";

const el = (over: Partial<ScanElement>): ScanElement => ({
  file: "x.tsx",
  line: 1,
  tag: "button",
  paths: [[]],
  unresolved: false,
  hasClassName: true,
  ...over,
});

// Fixture harness (plan R2 F3): the resolver is ALSO exercised end-to-end through temp files,
// so a flattening scanner or first-wins lookup cannot stay green on unit cases alone.
function scanFixture(source: string) {
  const dir = mkdtempSync(join(tmpdir(), "scan-fixture-"));
  mkdirSync(join(dir, "components"), { recursive: true });
  mkdirSync(join(dir, "app"), { recursive: true });
  writeFileSync(join(dir, "components", "Fx.tsx"), source);
  return scanInteractiveElements(dir);
}

describe("resolver corpus walk", () => {
  const all = scanInteractiveElements(process.cwd());
  it("covers the live corpus (premise: non-trivial)", () => {
    premiseHolds("corpus has >=300 in-scope elements", all.length >= 300);
  });
  it("resolves same-file helper calls (segClass shape, spec §5.2 rule 6)", () => {
    const seg = all.filter((e) => e.file.endsWith("DashboardBucketSegmentedControl.tsx"));
    premiseHolds("segmented control links found", seg.length >= 2);
    expect(seg.some((e) => allStrings(e).some((str) => /text-text-subtle/.test(str)))).toBe(true);
  });
  it("resolves imported constants one hop (SECONDARY_ACTION_CLASS consumers clear)", () => {
    const re = all.find((e) => e.file.endsWith("RescanSheetButton.tsx"));
    expect(re && heightFloorSatisfied(re)).toBe(true);
  });
  it("marks prop-flow children unresolved (ClaimedRowButton, spec §10)", () => {
    const c = all.find((e) => e.file.endsWith("_ClaimedRowButton.tsx"));
    expect(c?.unresolved).toBe(true);
  });
  it("includes allowlisted component call sites without onClick (RetryWatchButton)", () => {
    expect(
      all.some((e) => e.file.endsWith("RetryWatchButton.tsx") && e.tag === "AccentButton"),
    ).toBe(true);
  });
});

describe("resolver end-to-end fixtures (plan R2 F3, executable, not comments)", () => {
  it("innermost const shadows outer: shadowed under-floor value must NOT clear", () => {
    const els = scanFixture(
      [
        'const k = "min-h-tap-min";',
        "export function C() {",
        '  const k = "min-h-0";',
        "  return <button className={k}>x</button>;",
        "}",
      ].join("\n"),
    );
    const b = els.find((e) => e.tag === "button");
    expect(b && heightFloorSatisfied(b)).toBe(false);
  });
  it("a ternary emits two paths, not a flattened union", () => {
    const els = scanFixture(
      [
        "export function C({ f }: { f: boolean }) {",
        '  return <button className={f ? "min-h-tap-min" : "px-2"}>x</button>;',
        "}",
      ].join("\n"),
    );
    const b = els.find((e) => e.tag === "button");
    expect(b?.paths.length).toBe(2);
    expect(b && heightFloorSatisfied(b)).toBe(false); // one floorless path
  });
  // A spread CAN carry or override className, so the default is demotion. But
  // the overwhelmingly common shape in this corpus is a conditional spread of
  // object LITERALS (`{...(external ? { target, rel } : {})}`), whose keys are
  // right there to read: it provably cannot touch className, and demoting it
  // would put a dozen correctly-floored controls into a census that then rots.
  it("a spread of object literals without a className key does not demote", () => {
    const els = scanFixture(
      [
        "export function C({ external }: { external: boolean }) {",
        '  return <button {...(external ? { target: "_blank", rel: "noopener" } : {})} className="min-h-tap-min">x</button>;',
        "}",
      ].join("\n"),
    );
    const b = els.find((e) => e.tag === "button");
    expect(b?.unresolved).toBe(false);
    expect(b && heightFloorSatisfied(b)).toBe(true);
  });
  it.each([
    ["{...rest}", "an identifier the resolver cannot read"],
    ['{...{ [key]: "" }}', "a computed key that could be className"],
    ['{...{ className: "min-h-0" }}', "a literal className the element inherits"],
  ])("a spread of %s demotes", (spread) => {
    const els = scanFixture(
      [
        "export function C({ rest, key }: { rest: object; key: string }) {",
        `  return <button ${spread} className="min-h-tap-min">x</button>;`,
        "}",
      ].join("\n"),
    );
    const b = els.find((e) => e.tag === "button");
    expect(b?.unresolved).toBe(true);
    expect(b && heightFloorSatisfied(b)).toBe(false);
  });
  it("nested conditional keeps ancestry: inner both-branch floor under a floorless outer arm never clears", () => {
    const els = scanFixture(
      [
        "export function C({ a, b }: { a: boolean; b: boolean }) {",
        '  return <button className={a ? (b ? "min-h-tap-min" : "min-h-tap-min") : ""}>x</button>;',
        "}",
      ].join("\n"),
    );
    const btn = els.find((e) => e.tag === "button");
    expect(btn && heightFloorSatisfied(btn)).toBe(false); // the a-false path has no floor
  });
});

describe("height floor (spec §5.1/§5.2 rules 1-4, 7) and defeaters (rule 8)", () => {
  it.each([
    ["min-h-tap-min", true],
    ["size-tap-min", true],
    ["h-11", true],
    ["min-h-[44px]", true],
    ["h-10", false],
    ["min-w-tap-min", false],
    ["w-11", false],
  ])("single-path floor token %s -> %s", (tok, want) => {
    expect(heightFloorSatisfied(el({ paths: [[tok as string]] }))).toBe(want);
  });
  it("floor on every path clears; floor on one of two paths never clears (rules 3-4)", () => {
    expect(heightFloorSatisfied(el({ paths: [["min-h-tap-min a"], ["min-h-tap-min b"]] }))).toBe(
      true,
    );
    expect(heightFloorSatisfied(el({ paths: [["min-h-tap-min"], ["px-2"]] }))).toBe(false);
  });
  it("unresolved never clears (rule 2)", () => {
    expect(heightFloorSatisfied(el({ paths: [["min-h-tap-min"]], unresolved: true }))).toBe(false);
  });
  it("rule 7: allowlisted component clears with no className, but a call-site defeater demotes", () => {
    expect(
      heightFloorSatisfied(el({ tag: "AccentButton", paths: [[]], hasClassName: false })),
    ).toBe(true);
    expect(heightFloorSatisfied(el({ tag: "AccentButton", paths: [["min-h-0!"]] }))).toBe(false);
    expect(heightFloorSatisfied(el({ tag: "AccentButton", paths: [[]], unresolved: true }))).toBe(
      false,
    );
  });
  it.each(["min-h-0!", "max-h-10!", "[height:0]!", "[min-height:0]", "sm:min-h-0", "hover:h-4"])(
    "defeater %s demotes even from a minority path",
    (tok) => {
      expect(defeaterPresent(el({ paths: [["min-h-tap-min"], [tok]] }))).toBe(true);
    },
  );
  it("a clean floor string carries no defeater", () => {
    expect(defeaterPresent(el({ paths: [["inline-flex min-h-tap-min px-4"]] }))).toBe(false);
  });

  // A named spacing token is the general case of which `min-h-tap-min` is one
  // instance: the value lives in `app/globals.css`'s `@theme`, so the floor is
  // read from the token surface rather than from a hand-kept list that goes
  // stale the day a token is added.
  it.each([
    ["min-h-confirm-box", true], // --spacing-confirm-box: 60px
    ["min-h-tile-min-h", true], // --spacing-tile-min-h: 96px
    ["min-h-header-link-slot", false], // --spacing-header-link-slot: 30px, under the floor
  ])("named spacing token %s floors -> %s", (tok, want) => {
    expect(heightFloorSatisfied(el({ paths: [[tok as string]] }))).toBe(want);
  });
  it("a sub-floor named spacing token is a defeater", () => {
    expect(defeaterPresent(el({ paths: [["min-h-tap-min h-header-link-slot"]] }))).toBe(true);
  });

  // Descendant-scoped and pseudo-element tokens style something OTHER than the
  // element's own box, so they can neither prove nor destroy its height.
  it.each(["[&_svg]:size-4", "[&>svg]:h-3", "before:h-4", "after:min-h-0"])(
    "%s is not an element-level defeater",
    (tok) => {
      expect(defeaterPresent(el({ paths: [[`min-h-tap-min ${tok}`]] }))).toBe(false);
      expect(heightFloorSatisfied(el({ paths: [[`min-h-tap-min ${tok}`]] }))).toBe(true);
    },
  );
  it.each(["[&_svg]:min-h-tap-min", "before:h-tap-min"])(
    "%s alone does not prove the element's own floor",
    (tok) => {
      expect(heightFloorSatisfied(el({ paths: [[tok as string]] }))).toBe(false);
    },
  );
  it("the pseudo-element expansion recipes DO floor (spec §5.1)", () => {
    // Explicit-height form: a 44px absolutely-positioned pseudo IS the hit area.
    expect(
      heightFloorSatisfied(el({ paths: [["relative before:absolute before:h-tap-min"]] })),
    ).toBe(true);
    // Negative-inset form.
    expect(
      heightFloorSatisfied(el({ paths: [["relative before:absolute before:-inset-y-2"]] })),
    ).toBe(true);
    // A non-expanding pseudo is not a recipe.
    expect(heightFloorSatisfied(el({ paths: [["relative before:absolute before:inset-0"]] }))).toBe(
      false,
    );
  });
});

describe("floor-component allowlist companion (spec §5.2 rule 7)", () => {
  it.each(FLOOR_COMPONENT_ALLOWLIST)("$tag base class declaration carries the floor", (row) => {
    // Scoped to the BASE_CLASS declaration, NOT the whole file: a comment elsewhere in the
    // file also contains the token, so a whole-file `toContain` is a false-green mutant
    // (plan R1 F6, probed: AccentButton.tsx line 86 comment vs line 106 live token).
    const src = readFileSync(row.file, "utf8");
    const decl = src.match(/const BASE_CLASS = cn\(([\s\S]*?)\);/);
    expect(decl, `${row.file}: BASE_CLASS declaration not found`).not.toBeNull();
    expect((decl as RegExpMatchArray)[1]).toContain(row.mustContain);
  });
});
