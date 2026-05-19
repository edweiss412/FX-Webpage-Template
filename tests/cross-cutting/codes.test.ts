import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { RETIRED_CODES, SPEC_CODES } from "@/lib/messages/__generated__/spec-codes";
import { CODE_SCENARIOS } from "@/tests/cross-cutting/code-scenarios";

const SOURCE_ROOTS = ["app", "lib", "components"] as const;
const PRODUCER_RE = /\bcode:\s*["'`]([A-Z][A-Za-z0-9_-]*(?:_[A-Za-z0-9_-]+)+)["'`]/g;

function walkSourceFiles(): string[] {
  const files: string[] = [];
  const walk = (path: string) => {
    for (const entry of readdirSync(path)) {
      const child = join(path, entry);
      const stats = statSync(child);
      if (stats.isDirectory()) {
        if (entry === "__generated__") continue;
        walk(child);
      } else if (/\.(ts|tsx)$/.test(entry)) {
        files.push(child);
      }
    }
  };

  for (const root of SOURCE_ROOTS) {
    walk(root);
  }
  files.push("middleware.ts");
  return files.sort();
}

function rgCodeProducerLiterals(): Set<string> {
  const output = execFileSync(
    "rg",
    ["--no-heading", "--line-number", String.raw`\bcode:\s*['"\`][A-Z][A-Za-z0-9_-]*(?:_[A-Za-z0-9_-]+)+['"\`]`, "app", "lib", "middleware.ts"],
    { encoding: "utf8" },
  );
  const codes = new Set<string>();
  for (const rawLine of output.split(/\r?\n/)) {
    if (
      rawLine.startsWith("lib/messages/catalog.ts:") ||
      rawLine.startsWith("lib/messages/__generated__/")
    ) {
      continue;
    }
    for (const match of rawLine.matchAll(PRODUCER_RE)) {
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
  for (const file of walkSourceFiles()) {
    if (file === "lib/messages/catalog.ts") continue;
    if (file.startsWith("lib/messages/__generated__/")) continue;
    const source = readFileSync(file, "utf8");
    if (producer.test(source)) locations.push(relative(process.cwd(), file));
  }
  return locations;
}

describe("AC-X.1 §12.4 catalog parity", () => {
  test("catalog and scenario registry deep-match every active §12.4 code", async () => {
    expect(Object.keys(MESSAGE_CATALOG).sort()).toEqual(Object.keys(SPEC_CODES).sort());
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

      const observed = await CODE_SCENARIOS[code as keyof typeof SPEC_CODES].run();
      expect(observed, `scenario for ${code} did not emit it`).toContain(code);
    }
  });

  test("source code literals do not introduce orphan active-style message codes", () => {
    const allowed = new Set([...Object.keys(SPEC_CODES), ...Object.keys(RETIRED_CODES)]);
    const orphans = [...rgCodeProducerLiterals()].filter((code) => !allowed.has(code)).sort();
    expect(orphans, `orphan producer codes not in §12.4: ${orphans.join(", ")}`).toEqual([]);
  });

  test("producer-site discovery is code-shape based and finds committed producer literals", () => {
    const producerCodes = rgCodeProducerLiterals();
    expect(producerCodes.has("LEAKED_LINK_DETECTED")).toBe(true);
    expect(producerCodes.has("REPORT_PIPELINE_FAILED")).toBe(true);
  });

  test("retired §12.4 codes have no producer, runtime catalog entry, or scenario", () => {
    for (const code of Object.keys(RETIRED_CODES)) {
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
    }
  });

  test("x1-catalog-parity is wired as a named audit script and workflow job", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.["gen:spec-codes"]).toBe("tsx scripts/extract-spec-codes.ts");
    expect(packageJson.scripts?.["test:audit:x1-catalog"]).toContain(
      "vitest run tests/cross-cutting/",
    );

    const workflowPath = ".github/workflows/x-audits.yml";
    expect(existsSync(workflowPath)).toBe(true);
    const workflow = readFileSync(workflowPath, "utf8");
    expect(workflow).toContain("x1-catalog-parity:");
    expect(workflow).toContain("pnpm test:audit:x1-catalog");
    expect(workflow).toContain("pnpm gen:spec-codes");
  });
});
