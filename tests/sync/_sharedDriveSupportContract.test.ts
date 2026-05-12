import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const DRIVE_API_SURFACES = ["lib/sync", "lib/drive", "app/api"] as const;

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
  if (!token) return null;
  const tokenIndex = callArgsIndex + afterOpenParen.index! + afterOpenParen[0].lastIndexOf(token);
  if (token === "{") return extractBalancedObject(source, tokenIndex);

  const declarations = [
    ...source
      .slice(0, callArgsIndex)
      .matchAll(new RegExp(`(?:const|let)\\s+${token}\\b[^=]*=\\s*\\{`, "g")),
  ];
  const declaration = declarations.at(-1);
  if (declaration?.index == null) return null;
  const openBraceIndex = declaration.index + declaration[0].lastIndexOf("{");
  return extractBalancedObject(source, openBraceIndex);
}

describe("Shared Drive support contract", () => {
  // Scope: Drive v3 API exposes `supportsAllDrives` / `includeItemsFromAllDrives`
  // only on file-level surfaces (`files.*`, `drives.*`, `permissions.*`, etc.).
  // `revisions.*` inherits access from the parent file's own `supportsAllDrives`
  // grant and does NOT accept these params (the @googleapis/drive typings reject
  // them; the REST API silently ignores them). This contract therefore asserts
  // the Shared Drive flags ONLY on `files.(get|list)` call sites — adding the
  // flag to `revisions.*` would break typecheck without changing semantics. The
  // companion negative test below asserts no `revisions.*` call carries the
  // flags so the false-positive class from R2 (closed at R3.1) can't recur.
  test("every Drive files get/list call opts into Shared Drive support", () => {
    const violations: string[] = [];
    for (const path of DRIVE_API_SURFACES.flatMap(tsFiles).sort()) {
      const source = readFileSync(join(root, path), "utf8");
      for (const match of source.matchAll(/\.files\.(get|list)\s*\(/g)) {
        const object = resolveObjectArgument(source, match.index + match[0].length);
        const callSite = `${path}:${lineNumber(source, match.index)}`;
        if (!object?.match(/\bsupportsAllDrives\s*:\s*true\b/)) {
          violations.push(`${callSite} missing supportsAllDrives: true`);
        }
        if (
          match[1] === "list" &&
          !object?.match(/\bincludeItemsFromAllDrives\s*:\s*true\b/)
        ) {
          violations.push(`${callSite} missing includeItemsFromAllDrives: true`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test("no Drive revisions.* call carries supportsAllDrives or includeItemsFromAllDrives", () => {
    // Negative regression for R3.1: Drive v3 rejects these params on
    // revisions.*. Re-adding them would compile only behind an `as` cast
    // (silently ignored at runtime) and would lock in a contract-violating
    // pattern. The first arm above only asserts files.* PRESENCE; this
    // arm asserts revisions.* ABSENCE so the false-positive class can't
    // sneak back in via a different callee shape.
    const violations: string[] = [];
    for (const path of DRIVE_API_SURFACES.flatMap(tsFiles).sort()) {
      const source = readFileSync(join(root, path), "utf8");
      for (const match of source.matchAll(/\.revisions\.(get|list)\s*\(/g)) {
        const object = resolveObjectArgument(source, match.index + match[0].length);
        const callSite = `${path}:${lineNumber(source, match.index)}`;
        if (object?.match(/\bsupportsAllDrives\b/)) {
          violations.push(`${callSite} contains supportsAllDrives (invalid on revisions.*)`);
        }
        if (object?.match(/\bincludeItemsFromAllDrives\b/)) {
          violations.push(
            `${callSite} contains includeItemsFromAllDrives (invalid on revisions.*)`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test("inline getDriveClient files.get calls are covered by the Shared Drive contract", () => {
    const path = "lib/sync/verifyReelOnApply.ts";
    const source = readFileSync(join(root, path), "utf8");
    const match = [...source.matchAll(/\bgetDriveClient\(\)\.(files|revisions)\.(get|list)\s*\(/g)].find(
      (candidate) => candidate[1] === "files" && candidate[2] === "get",
    );

    expect(match, "expected live getDriveClient().files.get inline-callee fixture").toBeDefined();
    const object = resolveObjectArgument(source, match!.index! + match![0].length);

    // Negative regression confirmation: removing this flag from the live
    // getDriveClient().files.get call makes this test fail.
    expect(object).toMatch(/\bsupportsAllDrives\s*:\s*true\b/);
  });
});
