// Structural guard: no ParseWarning emitter is dark, and the committed manifest
// matches a fresh extraction. Spec 2026-08-03-scanner-precision-cluster-design.md §3.4.
//
// THIS FILE IS THE SUITE'S SINGLE EXTRACTOR. Loading the ts-morph project costs
// ~39s and a full extraction ~65s, and `vitest.config.ts` rejects `isolate: false`,
// so every extracting test FILE is its own process. The artifact-parity assertion
// therefore lives HERE rather than in tests/cross-cutting/no-raw-codes.test.ts, and
// the cron-run-summary guard reads the committed artifact instead of re-extracting.
// One extraction, not three. Moving parity elsewhere silently triples suite cost.
import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";

import { INTERNAL_CODE_ENUMS } from "@/lib/messages/__generated__/internal-code-enums";
import { scanParseWarningSites } from "@/lib/messages/__internal__/parseWarningSites";
import {
  extractInternalCodeEnums,
  shareProjectForWarningScan,
} from "@/scripts/extract-internal-code-enums";

/**
 * The PRODUCTION tree. The exclusion list is load-bearing, not tidiness: the
 * tracked tree holds ~1415 ParseWarning-assignable sites outside the generator's
 * roots, ~1386 of them test fixtures. A whole-tree G1 fails on the existing tree
 * and can never distinguish a new production emitter from a fixture.
 */
const NON_PRODUCTION = /^(tests|docs|e2e|scripts|supabase|public|\.github)\//;
const isDevOrGenerated = (rel: string): boolean =>
  rel.startsWith("lib/dev/") ||
  rel.startsWith("lib/messages/__generated__/") ||
  rel === "lib/messages/catalog.ts";

const inProductionTree = (rel: string): boolean =>
  /\.tsx?$/.test(rel) && !NON_PRODUCTION.test(rel) && !isDevOrGenerated(rel);
const inGeneratorRoots = (rel: string): boolean =>
  /^(lib|app)\//.test(rel) && inProductionTree(rel);

const project = new Project({ tsConfigFilePath: "tsconfig.json" });
// One project for BOTH the wider production scan and the generator's own pass.
shareProjectForWarningScan(project);
const productionScan = scanParseWarningSites(project, { include: inProductionTree });

const generatedWarningCodes = (): string[] =>
  Object.entries(INTERNAL_CODE_ENUMS)
    .filter(([, v]) => (v as { source: string }).source.split(",").includes("parse_warnings.code"))
    .map(([k]) => k);

describe("G1 — every ParseWarning site lies inside the generator's roots", () => {
  it("no production emitter sits outside lib/ or app/", () => {
    const outside = [...productionScan.codes.entries()]
      .flatMap(([code, files]) => [...files].map((f) => ({ code, file: f })))
      .filter((x) => !inGeneratorRoots(x.file))
      .map((x) => `${x.file} defines ${x.code}`);
    expect(
      outside,
      "a ParseWarning emitter landed in a production directory the generator never opens — widen the roots in scripts/extract-internal-code-enums.ts",
    ).toEqual([]);
  });
});

describe("G2 — nothing is dark, and nothing is unresolvable", () => {
  it("every recognized code is in the generated manifest", () => {
    const generated = new Set(generatedWarningCodes());
    const missing = [...productionScan.codes.keys()].filter((c) => !generated.has(c)).sort();
    expect(
      missing,
      "these codes are constructed as ParseWarnings but absent from the manifest — run `pnpm gen:internal-code-enums`",
    ).toEqual([]);
  });

  it("no site's code is unresolvable — the fail-closed default has nothing to report", () => {
    // The recognizer SIGNALS rather than dropping. A non-empty list here is the
    // guard doing its job: a new construction shape it cannot resolve statically.
    expect(
      productionScan.signalled,
      "unresolvable ParseWarning sites — resolve the code to a literal, or record why it cannot be",
    ).toEqual([]);
  });

  it("every skip carries one of the four capture-linked classifications", () => {
    const allowed = new Set(["FRAGMENT", "COPY", "FACTORY_BODY", "USE"]);
    expect(productionScan.skips.filter((s) => !allowed.has(s.kind))).toEqual([]);
    // Skips are how a copy/use avoids being reported twice; if this ever hits zero
    // the classification logic has been disabled rather than satisfied.
    expect(productionScan.skips.length).toBeGreaterThan(0);
  });
});

describe("manifest parity — the committed artifact equals a fresh extraction", () => {
  it("INTERNAL_CODE_ENUMS is up to date", { timeout: 300_000 }, () => {
    // Machine-enforces the "regenerate in the same commit" rule. This assertion
    // moved here from tests/cross-cutting/no-raw-codes.test.ts so the suite performs
    // exactly one fresh extraction.
    expect(INTERNAL_CODE_ENUMS).toEqual(extractInternalCodeEnums());
  });

  it("CRON_RUN_SUMMARY never reaches the manifest", () => {
    // Previously guarded by the content predicate this change removed. It still
    // holds, for a stronger reason: `export const CRON_RUN_SUMMARY = "..."` is not
    // an expression assignable to ParseWarning, so no type-based rule can select it.
    expect(JSON.stringify(INTERNAL_CODE_ENUMS)).not.toContain("CRON_RUN_SUMMARY");
    expect([...productionScan.codes.keys()]).not.toContain("CRON_RUN_SUMMARY");
  });
});
