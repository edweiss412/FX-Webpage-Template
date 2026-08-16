/**
 * Regression pin for the 2026-08-16 control-outline swap.
 *
 * Spec: docs/superpowers/specs/2026-08-16-control-outline-surface-fills-design.md
 * Plan: docs/superpowers/plans/2026-08-16-control-outline-surface-fills.md
 *
 * THREAT FENCE (spec §7): this suite defends against ONE thing — this arc's own
 * 21 swaps being reverted or half-reverted (the two-arm ternary case). It does
 * NOT defend against a contributor adding a NEW control at
 * `border-border-strong`; spec §5.2 records the five review rounds that
 * established why that forward guard was CUT rather than shipped.
 */

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { premise } from "../_shared/premise";
import { CENSUS, resolveCensus } from "./controlOutlineScan";
import { allStrings, scanInteractiveElements, type ScanElement } from "./interactiveScanCore";

/**
 * ONE root, read by BOTH the premise and the resolver.
 *
 * Plan review R2 F1 caught the alternative: a premise taken from `cwd` while the
 * rows resolve from some other `rootDir` is a premise about an ADJACENT input,
 * and it passes at 362 while every row assertion fails for an environmental
 * reason. Pre-dispatch mutant (d) — point this at an empty temp dir — is the
 * check that premise and case share an input.
 */
const ROOT = process.cwd();

const UNIVERSE = scanInteractiveElements(ROOT);

/**
 * Executed at module scope, unconditionally and never inside a `.each` callback:
 * a scanner returning `[]` (bad root, changed extension filter, parse
 * regression) makes every "carries `border-text-faint`" assertion vacuously
 * unfindable, and the suite would pass forever. Measured universe: 362.
 */
premise("scanner reaches the component tree", UNIVERSE.length, 200);

const RESOLVED = resolveCensus(ROOT);

/** Whole-token match. `border-text-faint-x` is NOT `border-text-faint`. */
function carries(element: ScanElement, token: string): boolean {
  const whole = new RegExp(`(^|\\s)${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`);
  return allStrings(element).some((s) => whole.test(s));
}

/** Every render alternative carries the token — not merely one of them. */
function everyPathCarries(element: ScanElement, token: string): boolean {
  const whole = new RegExp(`(^|\\s)${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`);
  return element.paths.every((path) => path.some((s) => whole.test(s)));
}

/**
 * Local six-line fixture harness. `tests/styles/interactiveScanCore.test.ts:41`
 * has the same shape and does NOT export it; replicated here deliberately
 * rather than exporting it from a module the mutation registry already enrols.
 */
function scanFixture(source: string): ScanElement[] {
  const dir = mkdtempSync(join(tmpdir(), "control-outline-fixture-"));
  const path = join(dir, "components/Fx.tsx");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, source);
  return scanInteractiveElements(dir);
}

describe("control-outline census (spec §4.2)", () => {
  /**
   * Asserted against the LITERAL 21, never against anything derived from
   * `CENSUS`. Without this, deleting a row deletes its test case and the suite
   * still passes: the premise still sees 362, the unresolved pin still sees 13,
   * and every surviving row still resolves. This is the vacuous-iteration
   * failure and it is the single most important case in the file.
   */
  it("holds exactly 21 rows", () => {
    expect(CENSUS.length).toBe(21);
  });

  /** A duplicated row must not stand in for a deleted one and keep the count. */
  it("has 21 distinct row identities", () => {
    const identities = new Set(CENSUS.map((r) => `${r.file}:${r.line}`));
    expect(identities.size).toBe(21);
  });

  /**
   * Pinned as an EQUALITY, not a ceiling (spec §5.3). A fourteenth unresolvable
   * element reds here and gets triaged instead of joining a silent pool; a count
   * that DROPS is also worth knowing, because it usually means an indirection
   * was resolved and a control just entered the cover.
   */
  it("leaves the scanner's unresolved pool at 13", () => {
    expect(UNIVERSE.filter((e) => e.unresolved).length).toBe(13);
  });
});

describe.each(RESOLVED.map((r, i) => [i + 1, r] as const))(
  "census row %i",
  (_index, resolvedRow) => {
    const label = `${resolvedRow.row.file}:${resolvedRow.row.line}`;

    /**
     * A renamed file or a moved element must RED here rather than silently drop
     * out of the iteration.
     */
    it(`resolves through the scanner (${label})`, () => {
      expect(resolvedRow.element).not.toBeNull();
    });

    it(`carries border-text-faint (${label})`, () => {
      expect(resolvedRow.element).not.toBeNull();
      expect(carries(resolvedRow.element as ScanElement, "border-text-faint")).toBe(true);
    });

    /**
     * NOT redundant with the case above: a two-arm ternary element can carry
     * BOTH tokens if only one arm was edited (spec §4.2's ternary trap).
     */
    it(`no longer carries border-border-strong (${label})`, () => {
      expect(resolvedRow.element).not.toBeNull();
      expect(carries(resolvedRow.element as ScanElement, "border-border-strong")).toBe(false);
    });
  },
);

describe("negative control — the assertion can fail", () => {
  const fixture = `export function Fx() {
  return <button className="border border-border-strong bg-surface">x</button>;
}
`;

  it("finds a constructed border-border-strong button and rejects it", () => {
    const found = scanFixture(fixture);
    /**
     * A fixture that fails to parse returns `[]` and makes the assertion below
     * vacuously true. The repo-scan premise at module scope is ADJACENT to that,
     * not a substitute for it.
     */
    premise("fixture parsed and produced an element", found.length, 0);
    const button = found[0] as ScanElement;
    expect(carries(button, "border-border-strong")).toBe(true);
    expect(carries(button, "border-text-faint")).toBe(false);
  });
});

describe("adjacent tokens survive the swap", () => {
  /**
   * The census pin checks the token that MOVED. This checks the token that must
   * NOT. Plan review R3 probed it: corrupting both `max-sm:border-border` tokens
   * after an otherwise-correct swap leaves every census row reading
   * `faint=true strong=false`, so the whole suite stays green while ShareHub's
   * responsive treatment is silently gone (spec §6 records it at 1.27:1).
   */
  it("keeps max-sm:border-border on BOTH ShareHub ternary arms", () => {
    const shareHub = RESOLVED.find(
      (r) => r.row.file === "components/admin/showpage/ShareHub.tsx",
    )?.element;
    expect(shareHub).toBeTruthy();
    const element = shareHub as ScanElement;
    premise("ShareHub element carries more than one render alternative", element.paths.length, 1);
    expect(everyPathCarries(element, "max-sm:border-border")).toBe(true);
  });
});

describe("switch tracks are untouched (spec §2, §3.1 — AC-2)", () => {
  /**
   * A SOURCE-PRESENCE check over a fixed list of five NAMED files. It classifies
   * nothing and must not grow into a classifier (spec §5.2).
   *
   * It exists because plan review R3 probed that none of these five files
   * appears in the census or in Task 2's fence, so AC-2 was otherwise unverified
   * by any command in the plan and an altered OFF recipe would have shipped
   * undetected. Two of the five are the nested-span paths the cover never saw
   * (spec §3.1).
   */
  const TRACK_PATHS = [
    "components/admin/PublishedToggle.tsx",
    "components/admin/settings/AutoPublishToggle.tsx",
    "components/admin/settings/NotifyToggle.tsx",
    "components/admin/telemetry/AutoRefreshControl.tsx",
    "components/admin/settings/DeveloperToggleButton.tsx",
  ] as const;

  it("names all five render paths", () => {
    expect(TRACK_PATHS.length).toBe(5);
  });

  it.each(TRACK_PATHS)("keeps both branches of the recipe in %s", (file) => {
    const source = readFileSync(join(ROOT, file), "utf8");
    expect(source).toContain("border-accent-edge bg-accent");
    expect(source).toContain("border-border-strong bg-surface-sunken");
  });
});
