import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * M12.1 T1/T4 — no-vercel-cron meta-test.
 *
 * The inverse-contract test that replaces the M6-era `tests/api/vercel-crons.test.ts`.
 * Per M12.1 spec §2.1 + plan T1, the `crons` block in `vercel.json` is removed (not
 * retained-with-comment) because Vercel Hobby tier rejects deployments declaring
 * sub-daily crons. Cron scheduling pivots to Supabase `pg_cron` + `pg_net` per spec §2.3.
 *
 * Assertions:
 *   1. `vercel.json` does NOT contain a `crons` key (T1 owns; T4.1 consolidates).
 *   2. No file under `app/` + `lib/` + `tests/` contains the case-insensitive
 *      substrings `x-vercel-cron` / `vercel-cron` / `VercelCron` — EXCEPT:
 *        - Self-exclusion: this file itself (`tests/cross-cutting/no-vercel-cron.test.ts`)
 *          is excluded from the walk; it MUST contain the forbidden literals to define
 *          them as patterns (R6 F15 fix).
 *        - Per-instance inline waiver: `// not-vercel-cron-class: <reason>` within 5
 *          lines of the match (narrow escape hatch).
 *   3. Anti-tautology: the walker DID encounter the self-exclusion path (proves the
 *      exclusion fired). If the file is missing OR the exclusion is mis-implemented and
 *      the walker tries to scan it anyway, the test fails. Pins the contract that
 *      self-exclusion is the ONLY exemption for THIS particular file.
 */

const REPO_ROOT = process.cwd();
const SELF_RELATIVE = "tests/cross-cutting/no-vercel-cron.test.ts";
const SELF_ABSOLUTE = resolve(REPO_ROOT, SELF_RELATIVE);

const WALKED_ROOTS = ["app", "lib", "tests"] as const;

const FORBIDDEN = [/x-vercel-cron/i, /vercel-cron/i, /VercelCron/];

const SCANNABLE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|sql)$/i;
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  ".turbo",
  "__generated__",
]);

interface Match {
  filePath: string; // repo-relative
  lineNumber: number; // 1-indexed
  lineText: string;
  matchedPattern: string;
}

function* walkFiles(rootAbs: string): Iterable<string> {
  const entries = readdirSync(rootAbs, { withFileTypes: true });
  for (const entry of entries) {
    const childAbs = join(rootAbs, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      yield* walkFiles(childAbs);
    } else if (entry.isFile() && SCANNABLE_EXT.test(entry.name)) {
      yield childAbs;
    }
  }
}

function hasInlineWaiver(lines: string[], matchLineIdx: number): boolean {
  // Look 5 lines around the match for the inline-waiver marker.
  const start = Math.max(0, matchLineIdx - 5);
  const end = Math.min(lines.length, matchLineIdx + 6);
  for (let i = start; i < end; i++) {
    if (/not-vercel-cron-class:/i.test(lines[i] ?? "")) return true;
  }
  return false;
}

function scanRepoForForbidden(): { matches: Match[]; visitedSelf: boolean } {
  const matches: Match[] = [];
  let visitedSelf = false;
  for (const root of WALKED_ROOTS) {
    const rootAbs = resolve(REPO_ROOT, root);
    try {
      statSync(rootAbs);
    } catch {
      continue;
    }
    for (const fileAbs of walkFiles(rootAbs)) {
      // R6 F15 self-exclusion: track whether the walker encountered the self path,
      // but skip scanning it (the file MUST contain the forbidden literals).
      if (fileAbs === SELF_ABSOLUTE) {
        visitedSelf = true;
        continue;
      }
      const content = readFileSync(fileAbs, "utf8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        for (const pattern of FORBIDDEN) {
          if (pattern.test(line)) {
            if (hasInlineWaiver(lines, i)) continue;
            matches.push({
              filePath: relative(REPO_ROOT, fileAbs),
              lineNumber: i + 1,
              lineText: line.trim(),
              matchedPattern: pattern.source,
            });
            break; // one finding per line is enough
          }
        }
      }
    }
  }
  return { matches, visitedSelf };
}

describe("M12.1: no vercel.json crons block (pg_cron pivot)", () => {
  test("vercel.json does NOT contain a `crons` key", () => {
    const config = JSON.parse(readFileSync(join(REPO_ROOT, "vercel.json"), "utf8")) as {
      crons?: unknown;
    };
    expect(config.crons).toBeUndefined();
  });

  test("no Vercel-Cron substrings in app/ + lib/ + tests/ (with self-exclusion + inline waiver)", () => {
    const { matches } = scanRepoForForbidden();
    if (matches.length > 0) {
      const formatted = matches
        .map((m) => `  ${m.filePath}:${m.lineNumber}  ${m.lineText}  [pattern: ${m.matchedPattern}]`)
        .join("\n");
      throw new Error(
        `Found Vercel-Cron references that must be removed or marked with ` +
          `// not-vercel-cron-class: <reason> within 5 lines:\n${formatted}`,
      );
    }
    expect(matches).toEqual([]);
  });

  test("anti-tautology: walker encountered the self path (self-exclusion fired)", () => {
    const { visitedSelf } = scanRepoForForbidden();
    expect(visitedSelf, "self path was not visited — exclusion mis-implemented or file missing").toBe(
      true,
    );
  });
});
