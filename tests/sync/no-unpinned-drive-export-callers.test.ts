import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const scanRoots = ["lib/sync", "app/api/cron", "app/api/drive"] as const;

function tsFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolute = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...tsFiles(absolute));
    } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(absolute);
    }
  }
  return files;
}

describe("M6 same-revision export binding guard", () => {
  test("runtime sync surfaces do not call unpinned fetchSheetAsMarkdown()", () => {
    const offenders: string[] = [];

    for (const root of scanRoots) {
      const absoluteRoot = join(process.cwd(), root);
      if (!statSync(absoluteRoot, { throwIfNoEntry: false })?.isDirectory()) continue;
      for (const absoluteFile of tsFiles(absoluteRoot)) {
        const contents = readFileSync(absoluteFile, "utf8");
        if (/not-subject-to-binding:\s+.+/.test(contents)) continue;
        if (/\bfetchSheetAsMarkdown\s*\(/.test(contents)) {
          offenders.push(relative(process.cwd(), absoluteFile));
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
