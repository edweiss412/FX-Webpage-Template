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

type Site = { file: string; what: string; testId: string };

function sites(): Site[] {
  const out: Site[] = [];
  for (const root of ROOTS) {
    for (const abs of walk(join(ROOT, root))) {
      const rel = abs.slice(ROOT.length + 1);
      const src = stripCommentsForFile(readFileSync(abs, "utf8"), rel);
      // The usage, not the definition: a self-closing element with both literal props.
      const re = /<TelemetryRetryButton\s+what="([^"]*)"\s+testId="([^"]*)"\s*\/>/g;
      for (const m of src.matchAll(re)) out.push({ file: rel, what: m[1]!, testId: m[2]! });
    }
  }
  return out;
}

describe("TelemetryRetryButton call sites", () => {
  const found = sites();

  it("premise: the scan reaches the tree and finds the shipped sites", () => {
    // A walk that silently found nothing makes every assertion below vacuously true, which
    // is the failure mode a derived cover is most exposed to.
    premise("the scan found call sites", found.length, 0);
  });

  it("every fallback of this shape has one, and there are three of them", () => {
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
      const src = stripCommentsForFile(readFileSync(join(ROOT, site.file), "utf8"), site.file);
      const plate = src.match(/className="([^"]*bg-warning-bg[^"]*)"/);
      expect(plate, `${site.file} has no warning-plate className`).not.toBeNull();
      for (const cls of ["flex", "flex-col", "items-start", "gap-2"]) {
        expect(plate![1], `${site.file} plate is missing ${cls}`).toContain(cls);
      }
    }
  });

  // The control hardcodes `focus-visible:ring-offset-warning-bg` while its API takes only
  // `{ what, testId }`, so a site on an info or danger plate would ship a mismatched offset
  // colour and nothing would say so. Today every site is a warning plate; this is what makes
  // that hardcoding correct, and it turns "a non-warning caller ships a silent mismatch"
  // into a red at the moment such a caller is added.
  it("every site stands on the warning plate the control's focus offset assumes", () => {
    for (const site of found) {
      const src = stripCommentsForFile(readFileSync(join(ROOT, site.file), "utf8"), site.file);
      const plate = src.match(/className="([^"]*bg-(?:warning|info|danger)-bg[^"]*)"/);
      expect(plate, `${site.file} has no tinted plate`).not.toBeNull();
      expect(plate![1], `${site.file} is not on the warning plate`).toContain("bg-warning-bg");
    }
  });
});
