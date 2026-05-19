import { existsSync, readFileSync } from "node:fs";
import { relative } from "node:path";
import { describe, expect, test } from "vitest";

import { walkSourceFiles } from "@/lib/messages/__internal__/walkSourceFiles";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { RETIRED_CODES, SPEC_CODES } from "@/lib/messages/__generated__/spec-codes";
import { CODE_SCENARIOS } from "@/tests/cross-cutting/code-scenarios";

const ACTIVE_PRODUCER_ROOTS = ["app", "lib", "middleware.ts"] as const;
const RETIRED_LITERAL_ROOTS = ["app", "lib", "components", "middleware.ts"] as const;
const PRODUCER_RE = /\bcode:\s*["'`]([A-Z][A-Za-z0-9_-]*(?:_[A-Za-z0-9_-]+)+)["'`]/g;
const RETIRED_LITERAL_ALLOWLIST: Record<string, ReadonlySet<string>> = {
  FIRST_SEEN_REVIEW: new Set([
    "components/admin/StagedReviewCard.tsx",
    "lib/parser/types.ts",
  ]),
};

function codeProducerLiterals(): Set<string> {
  const codes = new Set<string>();
  for (const file of walkSourceFiles(ACTIVE_PRODUCER_ROOTS)) {
    if (
      file === "lib/messages/catalog.ts" ||
      file.startsWith("lib/messages/__generated__/")
    ) {
      continue;
    }
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(PRODUCER_RE)) {
      if (match[1]) codes.add(match[1]);
    }
  }
  return codes;
}

function producerLocations(code: string): string[] {
  const locations: string[] = [];
  const producer = new RegExp(
    String.raw`\bcode:\s*["'\`]${code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`]`,
    "g",
  );
  for (const file of walkSourceFiles(ACTIVE_PRODUCER_ROOTS)) {
    if (file === "lib/messages/catalog.ts") continue;
    if (file.startsWith("lib/messages/__generated__/")) continue;
    const source = readFileSync(file, "utf8");
    if (producer.test(source)) locations.push(relative(process.cwd(), file));
  }
  return locations;
}

function retiredLiteralLocations(code: string): string[] {
  const locations: string[] = [];
  const literal = new RegExp(
    String.raw`["'\`]${code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`]`,
    "g",
  );
  const allowlist = RETIRED_LITERAL_ALLOWLIST[code] ?? new Set<string>();
  for (const file of walkSourceFiles(RETIRED_LITERAL_ROOTS)) {
    const relativePath = relative(process.cwd(), file);
    if (relativePath === "lib/messages/catalog.ts") continue;
    if (relativePath.startsWith("lib/messages/__generated__/")) continue;
    if (allowlist.has(relativePath)) continue;
    const source = readFileSync(file, "utf8");
    if (literal.test(source)) locations.push(relativePath);
  }
  return locations;
}

describe("AC-X.1 §12.4 catalog parity", () => {
  test("catalog and scenario registry deep-match every active §12.4 code", async () => {
    expect(Object.keys(MESSAGE_CATALOG).sort()).toEqual(Object.keys(SPEC_CODES).sort());
    // AC-X.1(d) producer reachability is enforced by the code-shape source
    // scan below. The registry remains a typed coverage ledger, but it does
    // not pretend to emit codes itself; that was tautological.
    expect(Object.keys(CODE_SCENARIOS).sort()).toEqual(Object.keys(SPEC_CODES).sort());

    for (const [code, specRow] of Object.entries(SPEC_CODES)) {
      const catalogRow = MESSAGE_CATALOG[code as keyof typeof MESSAGE_CATALOG];
      expect(catalogRow.dougFacing, `catalog ${code}.dougFacing differs from §12.4`).toEqual(
        specRow.dougFacing,
      );
      expect(catalogRow.crewFacing, `catalog ${code}.crewFacing differs from §12.4`).toEqual(
        specRow.crewFacing,
      );
      expect(catalogRow.followUp, `catalog ${code}.followUp differs from §12.4`).toEqual(
        specRow.followUp,
      );
      expect(
        catalogRow.helpfulContext,
        `catalog ${code}.helpfulContext differs from §12.4`,
      ).toEqual(specRow.helpfulContext);
    }
  });

  test("source code literals do not introduce orphan active-style message codes", () => {
    const allowed = new Set([...Object.keys(SPEC_CODES), ...Object.keys(RETIRED_CODES)]);
    const orphans = [...codeProducerLiterals()].filter((code) => !allowed.has(code)).sort();
    expect(orphans, `orphan producer codes not in §12.4: ${orphans.join(", ")}`).toEqual([]);
  });

  test("producer-site discovery is code-shape based and finds committed producer literals", () => {
    const producerCodes = codeProducerLiterals();
    expect(producerCodes.has("LEAKED_LINK_DETECTED")).toBe(true);
    expect(producerCodes.has("REPORT_PIPELINE_FAILED")).toBe(true);
  });

  test("retired variant rows use bare identifiers with variant metadata", () => {
    expect(RETIRED_CODES.OAUTH_STATE_INVALID).toMatchObject({
      replacedBy: "OAUTH_STATE_INVALID",
      retiredIn: "§12.4",
      variant: "operator-log-only variant",
    });
    expect(RETIRED_CODES.OAUTH_REDIRECT_INVALID).toMatchObject({
      replacedBy: "OAUTH_REDIRECT_INVALID",
      retiredIn: "§12.4",
      variant: "operator-log-only variant",
    });
    expect(SPEC_CODES.OAUTH_STATE_INVALID).toBeDefined();
    expect(SPEC_CODES.OAUTH_REDIRECT_INVALID).toBeDefined();
  });

  test("retired §12.4 codes have no producer, runtime catalog entry, or scenario", () => {
    for (const [code, retired] of Object.entries(RETIRED_CODES)) {
      if (code in SPEC_CODES) {
        expect(
          retired.variant,
          `retired variant ${code} collides with an active canonical row and must carry variant metadata`,
        ).not.toBeNull();
        continue;
      }
      expect(Object.keys(MESSAGE_CATALOG), `retired code ${code} still in catalog`).not.toContain(
        code,
      );
      expect(Object.keys(CODE_SCENARIOS), `retired code ${code} still in scenarios`).not.toContain(
        code,
      );
      expect(
        producerLocations(code),
        `retired code ${code} still has a producer`,
      ).toEqual([]);
      expect(
        retiredLiteralLocations(code),
        `retired code ${code} still has a non-allowlisted string literal`,
      ).toEqual([]);
    }
  });

  test("x1-catalog-parity is wired as a named audit script and workflow job", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.["gen:spec-codes"]).toBe("tsx scripts/extract-spec-codes.ts");
    expect(packageJson.scripts?.["test:audit:x1-catalog-parity"]).toContain(
      "vitest run tests/cross-cutting/",
    );

    const workflowPath = ".github/workflows/x-audits.yml";
    expect(existsSync(workflowPath)).toBe(true);
    const workflow = readFileSync(workflowPath, "utf8");
    expect(workflow).toContain("x1-catalog-parity:");
    expect(workflow).toContain("pnpm test:audit:x1-catalog-parity");
    expect(workflow).toContain("pnpm gen:spec-codes");
    expect(workflow).toContain("uses: actions/upload-artifact@v4");
    expect(workflow).toContain("if: always()");
    expect(workflow).toContain("name: x1-catalog-parity-${{ github.run_id }}-${{ github.run_attempt }}-${{ github.job }}");
    expect(workflow).toContain("x1-catalog-parity-generated.diff");
    expect(workflow).toContain("x1-catalog-parity.log");
  });
});
