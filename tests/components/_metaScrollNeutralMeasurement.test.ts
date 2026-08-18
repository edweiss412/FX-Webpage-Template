/**
 * Invariant (spec 2026-08-17-rowactions-submenu-reveal-scroll-clamp §4.1):
 * measuring a panel's natural size must not mutate its scroll state. The only
 * place allowed to clear an inline size cap is the withNaturalSize helper,
 * which snapshots and restores scroll offsets around the clear. A bare
 * cap-clearing assignment anywhere else is the defect class that reverted
 * every keyboard reveal in the capped row-actions submenu (probe P1/P2, spec
 * §2): layout with no cap clamps scrollTop to 0 and the restore does not
 * restore it.
 *
 * Derived cover: the tree is walked from disk, so a NEW measurement site that
 * bypasses the helper fails by default. Threat fence (spec §4.4): this guards
 * the repo's established direct-assignment idiom against accidental
 * reintroduction; obfuscated spellings are a documented limit (spec §8).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { premise } from "../_shared/premise";

const REPO_ROOT = join(__dirname, "..", "..");
const ROOTS = ["components", "lib"] as const;
const HELPER_SUFFIX = join("lib", "popover", "naturalSize.ts");

/** A cap-clearing assignment: `.style.maxHeight = ""` (any quote flavor). */
const CLEAR_RE = /\.style\.(maxHeight|maxWidth)\s*=\s*(""|''|``)/;

function walk(dir: string, acc: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) acc.push(full);
  }
}

describe("scroll-neutral measurement (derived cover)", () => {
  it("no cap-clearing assignment outside the withNaturalSize helper", () => {
    const files: string[] = [];
    for (const root of ROOTS) walk(join(REPO_ROOT, root), files);
    // PREMISE: the walk actually covered the tree the invariant ranges over.
    premise("the walk covered the tree the invariant ranges over", files.length, 50);
    const offenders = files.filter(
      (f) => !f.endsWith(sep + HELPER_SUFFIX) && CLEAR_RE.test(readFileSync(f, "utf8")),
    );
    expect(
      offenders.map((f) => f.slice(REPO_ROOT.length + 1)),
      "cap-clearing assignment outside lib/popover/naturalSize.ts: route the measurement through withNaturalSize (spec §4.2)",
    ).toEqual([]);
  });

  // Scanner self-tests (positive AND negative, per the repair-economy rule):
  it("recognizes every quote flavor of a bare clear", () => {
    expect(CLEAR_RE.test('el.style.maxHeight = ""')).toBe(true);
    expect(CLEAR_RE.test("el.style.maxWidth = ''")).toBe(true);
    expect(CLEAR_RE.test("panel.style.maxHeight = ``")).toBe(true);
    expect(CLEAR_RE.test('body.style.maxWidth  =  ""')).toBe(true);
  });

  it("does not fire on cap SETS or unrelated properties", () => {
    expect(CLEAR_RE.test("el.style.maxWidth = `${w}px`")).toBe(false);
    expect(CLEAR_RE.test('el.style.maxHeight = "425px"')).toBe(false);
    expect(CLEAR_RE.test('el.style.height = ""')).toBe(false);
    // Placement application, not measurement (spec §4.2 both-branch writes):
    expect(CLEAR_RE.test('el.style.removeProperty("max-height")')).toBe(false);
    // Clone-capture spelling, documented limit (spec §8, captureElement.ts):
    expect(CLEAR_RE.test('clone.style.maxHeight = "none"')).toBe(false);
  });
});
