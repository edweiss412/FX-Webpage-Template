// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { deriveScanRoots, parseManifestRoutes } from "@/scripts/help-screenshots-routes";

const MANIFEST_PATH = join(process.cwd(), "scripts/help-screenshots.manifest.ts");
const LIVE = readFileSync(MANIFEST_PATH, "utf8");

describe("the route set itself is asserted, not merely the roots it derives", () => {
  // Two routes happen to share a segment today, so a roots-only assertion is
  // satisfied by a parser that sees a strict subset of the routes.
  it("parses every route, plain-string and template-literal alike", () => {
    const routes = parseManifestRoutes(LIVE);
    expect(routes).toEqual([
      "/admin",
      "/admin",
      "/admin/show/${...}/preview/${...}",
      "/admin/needs-attention",
      "/admin/show/${...}/preview/${...}?s=today",
      "/admin/show/${...}/preview/${...}?s=gear",
      "/admin/show/${...}/preview/${...}?s=schedule",
    ]);
  });

  it("sees the template-literal routes a quote-only parser cannot", () => {
    expect(parseManifestRoutes(LIVE).filter((r) => r.includes("${...}"))).toHaveLength(4);
  });
});

describe("the derived roots are what the guard scans", () => {
  it("derives components plus one app segment per distinct route segment", () => {
    expect(deriveScanRoots(parseManifestRoutes(LIVE))).toEqual(["app/admin", "components"]);
  });
});

// Every live route routes under /admin, so a quote-only parser and a complete
// parser derive the SAME roots from this manifest. A same-segment mutant is
// vacuous against the exact defect it targets -- measured, not assumed.
describe("both mutants are required, and each is blind to the other's target", () => {
  const TEMPLATE_ROUTE = "    route: `/show/${SLUG}/${TOKEN}`,";
  const PLAIN_ROUTE = '    route: "/show/fixed-slug",';

  function withExtraEntry(routeLine: string): string {
    // A replacer function: the route line is data, and a runtime string in the
    // replacement slot would be read as a `$`-pattern mini-language
    // (tests/cross-cutting/replacementString.test.ts).
    return LIVE.replace(
      '    route: "/admin/needs-attention",',
      () => `    route: "/admin/needs-attention",\n  },\n  {\n${routeLine}`,
    );
  }

  it("a DISTINCT template-literal route adds app/show", () => {
    const mutated = withExtraEntry(TEMPLATE_ROUTE);
    expect(parseManifestRoutes(mutated)).toContain("/show/${...}/${...}");
    expect(deriveScanRoots(parseManifestRoutes(mutated))).toEqual([
      "app/admin",
      "app/show",
      "components",
    ]);
  });

  it("a DISTINCT plain-string route adds app/show", () => {
    const mutated = withExtraEntry(PLAIN_ROUTE);
    expect(parseManifestRoutes(mutated)).toContain("/show/fixed-slug");
    expect(deriveScanRoots(parseManifestRoutes(mutated))).toEqual([
      "app/admin",
      "app/show",
      "components",
    ]);
  });

  // The measurement behind requiring both: a parser that freezes the three
  // currently-quoted routes while parsing template literals generically passes
  // the route-set assertion AND the distinct-template mutant. Only the
  // plain-string mutant separates it. Expected counts: current 7/7,
  // distinct-template 8/8, distinct-plain 8 against a bad 7.
  it("a same-segment mutant changes neither population, which is why it is vacuous", () => {
    const sameSegment = withExtraEntry('    route: "/admin/another",');
    expect(parseManifestRoutes(sameSegment)).toHaveLength(8);
    expect(deriveScanRoots(parseManifestRoutes(sameSegment))).toEqual(["app/admin", "components"]);
  });
});
