import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const ROOTS = ["components", "app/show"];
const BLOCKED_HOST_RE = /(?:drive|docs)\.google\.com/;

function sourceFilesUnder(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...sourceFilesUnder(path));
    } else if (/\.(?:ts|tsx|js|jsx)$/.test(entry)) {
      files.push(path);
    }
  }

  return files;
}

describe("crew surface source hygiene", () => {
  test("components and app/show source do not contain raw Google Drive hostnames", () => {
    const offenders = ROOTS.flatMap(sourceFilesUnder).filter((path) =>
      BLOCKED_HOST_RE.test(readFileSync(path, "utf8")),
    );

    expect(offenders).toEqual([]);
  });
});
