import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const DRIVE_API_SURFACES = ["lib/sync", "lib/drive", "app/api/asset"] as const;

function tsFiles(path: string): string[] {
  const absolute = join(root, path);
  if (!statSync(absolute, { throwIfNoEntry: false })?.isDirectory()) return [];
  const files: string[] = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) files.push(...tsFiles(child));
    if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) files.push(child);
  }
  return files;
}

function lineNumber(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

function extractBalancedObject(source: string, openBraceIndex: number): string | null {
  let depth = 0;
  for (let index = openBraceIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(openBraceIndex, index + 1);
    }
  }
  return null;
}

function resolveObjectArgument(source: string, callArgsIndex: number): string | null {
  const afterOpenParen = source.slice(callArgsIndex).match(/^\s*(\{|\w+)/);
  if (!afterOpenParen) return null;

  const token = afterOpenParen[1];
  const tokenIndex = callArgsIndex + afterOpenParen.index! + afterOpenParen[0].lastIndexOf(token);
  if (token === "{") return extractBalancedObject(source, tokenIndex);

  const declarations = [
    ...source
      .slice(0, callArgsIndex)
      .matchAll(new RegExp(`(?:const|let)\\s+${token}\\b[^=]*=\\s*\\{`, "g")),
  ];
  const declaration = declarations.at(-1);
  if (!declaration?.index) return null;
  const openBraceIndex = declaration.index + declaration[0].lastIndexOf("{");
  return extractBalancedObject(source, openBraceIndex);
}

describe("Shared Drive support contract", () => {
  test("every Drive files/revisions get/list call opts into Shared Drive support", () => {
    const violations: string[] = [];
    for (const path of DRIVE_API_SURFACES.flatMap(tsFiles).sort()) {
      const source = readFileSync(join(root, path), "utf8");
      for (const match of source.matchAll(/drive\.(revisions|files)\.(get|list)\s*\(/g)) {
        const object = resolveObjectArgument(source, match.index + match[0].length);
        const callSite = `${path}:${lineNumber(source, match.index)}`;
        if (!object?.match(/\bsupportsAllDrives\s*:\s*true\b/)) {
          violations.push(`${callSite} missing supportsAllDrives: true`);
        }
        if (
          match[1] === "files" &&
          match[2] === "list" &&
          !object?.match(/\bincludeItemsFromAllDrives\s*:\s*true\b/)
        ) {
          violations.push(`${callSite} missing includeItemsFromAllDrives: true`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
