import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const repoRoot = process.cwd();

const DATA_API_CONSUMERS = [
  "app/api/realtime/subscriber-token/route.ts",
  "app/api/asset/diagram/[show]/[rev]/[key]/route.ts",
  "app/api/asset/reel/[show]/route.ts",
  "app/api/asset/agenda/[show]/[id]/route.ts",
  "app/api/show/[slug]/version/route.ts",
  "app/api/report/route.ts",
] as const;

function source(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function walkFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) return walkFiles(fullPath);
    if (!/\.(ts|tsx)$/.test(entry)) return [];
    return [path.relative(repoRoot, fullPath)];
  });
}

describe("picker resolver data API callsite contract", () => {
  test("data APIs do not import Google or legacy signed-link session validators", () => {
    for (const file of DATA_API_CONSUMERS) {
      expect(source(file), file).not.toMatch(/validateGoogleSession|validateLinkSession/);
    }
  });

  test("resolveShowPageAccess remains page-route only and is not imported by app/api", () => {
    const offenders = walkFiles(path.join(repoRoot, "app/api")).filter((file) =>
      source(file).includes("resolveShowPageAccess"),
    );

    expect(offenders).toEqual([]);
  });
});
