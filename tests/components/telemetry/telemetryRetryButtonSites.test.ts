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
});
