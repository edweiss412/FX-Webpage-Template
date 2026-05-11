import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const REEL_COLUMNS = [
  "opening_reel_drive_file_id",
  "opening_reel_drive_modified_time",
  "opening_reel_head_revision_id",
  "opening_reel_mime_type",
] as const;

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

describe("opening reel four-column persist contract", () => {
  test("every sync SQL write that touches an opening_reel column touches all four", () => {
    const violations: string[] = [];
    for (const path of tsFiles("lib/sync")) {
      const source = readFileSync(join(root, path), "utf8");
      for (const match of source.matchAll(/update\s+public\.shows[\s\S]*?returning\s+id/gi)) {
        const sql = match[0];
        if (!REEL_COLUMNS.some((column) => sql.includes(column))) continue;
        const missing = REEL_COLUMNS.filter((column) => !sql.includes(column));
        if (missing.length > 0) {
          violations.push(`${path} missing ${missing.join(", ")}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
