import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function syncLayerAppendedReviewItems(): string[] {
  const normalizedTypes = source("lib/parser/types.ts").replace(/^\s*\/\/\s?/gm, "");
  const match = normalizedTypes.match(
    /includes asset-review items \(([^)]+)\) that the[\s\S]*?SYNC layer \(NOT runInvariants\) appends/,
  );
  const capturedCodes = match?.[1];
  expect(capturedCodes).toBeDefined();
  if (!capturedCodes) {
    throw new Error(
      "Missing sync-layer-appended TriggeredReviewItem comment in lib/parser/types.ts",
    );
  }

  return capturedCodes
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);
}

describe("Phase 1 sync-layer warning bridge contract", () => {
  test("every sync-layer-appended TriggeredReviewItem variant has an explicit Phase 1 bridge path", () => {
    const phase1 = source("lib/sync/phase1.ts");
    const bridgeStart = phase1.indexOf("function syncLayerReviewItems");
    const runPhase1Start = phase1.indexOf("export async function runPhase1");

    expect(bridgeStart).toBeGreaterThan(-1);
    expect(runPhase1Start).toBeGreaterThan(bridgeStart);

    const bridgeBody = phase1.slice(bridgeStart, runPhase1Start);
    for (const code of syncLayerAppendedReviewItems()) {
      expect(bridgeBody, `${code} is missing from syncLayerReviewItems`).toContain(code);
    }

    expect(phase1).toMatch(/syncLayerReviewItems\(\s*args,\s*args\.parseResult,\s*show\s*\)/);
  });
});
