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
