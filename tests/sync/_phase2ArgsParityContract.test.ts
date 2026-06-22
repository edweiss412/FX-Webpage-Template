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

function extractFunctionBody(src: string, name: string): string | null {
  const match = src.match(new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`));
  if (!match?.index) return null;
  const openIndex = src.indexOf("{", match.index);
  if (openIndex === -1) return null;
  return src.slice(openIndex + 1, findMatchingBrace(src, openIndex));
}

function extractSuccessTailAfterPhase2(src: string, marker: string): string {
  const markerIndex = src.indexOf(marker);
  if (markerIndex === -1) throw new Error(`Marker not found: ${marker}`);
  const staleIndex = src.indexOf('if (phase2.outcome === "stale")', markerIndex);
  if (staleIndex === -1) throw new Error(`Stale branch not found after marker: ${marker}`);
  const staleOpenIndex = src.indexOf("{", staleIndex);
  const staleCloseIndex = findMatchingBrace(src, staleOpenIndex);
  const returnIndex = src.indexOf("return ", staleCloseIndex);
  if (returnIndex === -1) throw new Error(`Success return not found after marker: ${marker}`);
  const returnEndIndex = src.indexOf(";", returnIndex);
  if (returnEndIndex === -1)
    throw new Error(`Success return end not found after marker: ${marker}`);
  return src.slice(staleCloseIndex + 1, returnEndIndex + 1);
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

function awaitedCallNames(tail: string): string[] {
  const calls = new Set<string>();
  const callPattern =
    /await\s+([A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*)\s*(?:<[^>]+>)?(?:\?\.)?\(/g;
  for (const match of tail.matchAll(callPattern)) {
    const callName = match[1];
    if (callName) calls.add(callName);
  }
  return [...calls].sort();
}

function tailAlertCodes(tail: string, sources: string[]): string[] {
  const bodies: string[] = [];
  const visited = new Set<string>();
  const collect = (body: string) => {
    bodies.push(body);
    for (const callName of awaitedCallNames(body)) {
      const localName = callName.split(".").at(-1);
      if (!localName || visited.has(localName)) continue;
      visited.add(localName);
      for (const source of sources) {
        const nested = extractFunctionBody(source, localName);
        if (nested) collect(nested);
      }
    }
  };
  collect(tail);
  const codes = new Set<string>();
  for (const body of bodies) {
    for (const match of body.matchAll(/code:\s*"([^"]+)"/g)) {
      if (match[1]) codes.add(match[1]);
    }
  }
  return [...codes].sort();
}

function objectKeysForAwaitedCall(tail: string, callName: string): string[] | null {
  const marker = `await ${callName}(`;
  const markerIndex = tail.indexOf(marker);
  if (markerIndex === -1) return null;
  const openIndex = tail.indexOf("{", markerIndex);
  if (openIndex === -1) return null;
  return phase2ArgKeys(tail.slice(openIndex + 1, findMatchingBrace(tail, openIndex)));
}

describe("first-seen auto-publish cron/retry parity contract", () => {
  test("retry passes the same Phase 2 args and post-Phase-2 tail shape as cron", () => {
    const cronSource = readFileSync(join(root, "lib/sync/runScheduledCronSync.ts"), "utf8");
    const retrySource = readFileSync(join(root, "lib/sync/runManualStageForFirstSeen.ts"), "utf8");

    const cronArgs = extractObjectAfter(cronSource, "const phase2 = await runPhase2_unlocked(");
    const retryArgs = extractObjectAfter(
      retrySource,
      "const phase2 = await (deps.runPhase2 ?? runPhase2)(tx,",
    );

    expect(phase2ArgKeys(retryArgs)).toEqual(phase2ArgKeys(cronArgs));

    const cronTail = extractSuccessTailAfterPhase2(
      cronSource,
      "const phase2 = await runPhase2_unlocked(",
    );
    const retryTail = extractSuccessTailAfterPhase2(
      retrySource,
      "const phase2 = await (deps.runPhase2 ?? runPhase2)(tx,",
    );

    const cronCalls = awaitedCallNames(cronTail);
    expect(awaitedCallNames(retryTail)).toEqual(cronCalls);
    expect(tailAlertCodes(retryTail, [retrySource, cronSource])).toEqual(
      tailAlertCodes(cronTail, [cronSource]),
    );

    for (const callName of cronCalls) {
      const cronKeys = objectKeysForAwaitedCall(cronTail, callName);
      if (!cronKeys) continue;
      expect(objectKeysForAwaitedCall(retryTail, callName)).toEqual(cronKeys);
    }
  });
});
