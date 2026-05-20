import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();

function findMatchingBrace(src: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < src.length; i++) {
    const char = src[i];
    if (char === "{") depth++;
    if (char === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error(`No matching brace found for index ${openIndex}`);
}

function extractObjectAfter(src: string, marker: string): string {
  const markerIndex = src.indexOf(marker);
  if (markerIndex === -1) throw new Error(`Marker not found: ${marker}`);
  const openIndex = src.indexOf("{", markerIndex);
  if (openIndex === -1) throw new Error(`Object open not found after marker: ${marker}`);
  return src.slice(openIndex + 1, findMatchingBrace(src, openIndex));
}

function splitTopLevelEntries(objectBody: string): string[] {
  const entries: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < objectBody.length; i++) {
    const char = objectBody[i];
    if (char === "{" || char === "(" || char === "[") depth++;
    if (char === "}" || char === ")" || char === "]") depth--;
    if (char === "," && depth === 0) {
      entries.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) entries.push(current.trim());
  return entries;
}

function phase2ArgKeys(objectBody: string): string[] {
  const keys = new Set<string>();
  for (const entry of splitTopLevelEntries(objectBody)) {
    const normalizedEntry = entry
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, "").trim())
      .filter(Boolean)
      .join("\n");
    const spreadMatch = normalizedEntry.match(/\?\s*\{\s*([A-Za-z_$][\w$]*)\s*\}\s*:/);
    if (spreadMatch?.[1]) {
      keys.add(spreadMatch[1]);
      continue;
    }
    const propertyMatch = normalizedEntry.match(/^([A-Za-z_$][\w$]*)\s*:/);
    if (propertyMatch?.[1]) {
      keys.add(propertyMatch[1]);
      continue;
    }
    const shorthandMatch = normalizedEntry.match(/^([A-Za-z_$][\w$]*)$/);
    if (shorthandMatch?.[1]) keys.add(shorthandMatch[1]);
  }
  return [...keys].sort();
}

describe("Phase 2 auto-publish argument parity contract", () => {
  test("first-seen retry passes the same Phase 2 argument keys as cron auto-publish", () => {
    const cronSource = readFileSync(join(root, "lib/sync/runScheduledCronSync.ts"), "utf8");
    const retrySource = readFileSync(
      join(root, "lib/sync/runManualStageForFirstSeen.ts"),
      "utf8",
    );

    const cronArgs = extractObjectAfter(
      cronSource,
      "const phase2 = await runPhase2_unlocked(",
    );
    const retryArgs = extractObjectAfter(
      retrySource,
      "const phase2 = await (deps.runPhase2 ?? runPhase2)(tx,",
    );

    expect(phase2ArgKeys(retryArgs)).toEqual(phase2ArgKeys(cronArgs));
  });
});
