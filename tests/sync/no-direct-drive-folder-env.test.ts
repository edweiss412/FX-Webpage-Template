import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = process.cwd();
const ALLOWED_HELPER = "lib/appSettings/getWatchedFolderId.ts";

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function collectSourceFiles(relDir: string): string[] {
  const absDir = join(ROOT, relDir);
  return readdirSync(absDir)
    .flatMap((entry) => {
      const rel = `${relDir}/${entry}`;
      const abs = join(ROOT, rel);
      if (statSync(abs).isDirectory()) return collectSourceFiles(rel);
      return /\.(ts|tsx)$/.test(entry) ? [rel] : [];
    })
    .sort();
}

describe("drive folder configuration source of truth", () => {
  test("production code reads GOOGLE_DRIVE_FOLDER_ID / DRIVE_FOLDER_ID only in the watched-folder helper", () => {
    const offenders = [...collectSourceFiles("app"), ...collectSourceFiles("lib")]
      .filter((rel) => rel !== ALLOWED_HELPER)
      .flatMap((rel) => {
        const src = stripComments(readFileSync(join(ROOT, rel), "utf8"));
        const matches = [
          ...src.matchAll(
            /process\.env\.(?:GOOGLE_DRIVE_FOLDER_ID|DRIVE_FOLDER_ID)\b|process\.env\[['"](?:GOOGLE_DRIVE_FOLDER_ID|DRIVE_FOLDER_ID)['"]\]/g,
          ),
        ];
        return matches.map((match) => `${rel}:${match.index ?? 0}:${match[0]}`);
      });

    expect(
      offenders,
      "Runtime sync entrypoints must use app_settings.watched_folder_id via getActiveWatchedFolderId; env is first-boot fallback only.",
    ).toEqual([]);
  });
});
