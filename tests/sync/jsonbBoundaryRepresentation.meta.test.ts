import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * STRUCTURAL DEFENSE for the postgres.js jsonb DOUBLE-ENCODE bug class
 * (M12 Phase 0.F smoke 3, 5th onboarding defect — the finalize 500).
 *
 * The class: the DB layer is postgres.js, which serializes a `$N::jsonb`
 * parameter by running its OWN JSON serializer on the JS value. A write site
 * that passed `JSON.stringify(obj)` (a STRING) for a jsonb param therefore
 * DOUBLE-ENCODED it into a jsonb STRING SCALAR. postgres.js read it back as a
 * JS string, and dereferencing a nested field (`parse_result.show.title`) threw
 * an uncaught TypeError → empty 500 body. The correct form passes the RAW value
 * (object/array/null) — postgres.js serializes it exactly once via the `::jsonb`
 * cast — or `sql.json(value)` in a tagged-template position.
 *
 * Every raw-SQL access in `lib/sync/` + `app/api/admin/onboarding/` runs on
 * postgres.js, INCLUDING files that don't import it directly but run SQL through
 * an injected tx (e.g. `applyStaged.ts`). The first sweep missed `applyStaged.ts`
 * for exactly that reason — so this guard walks the WHOLE subtree, not a list of
 * direct postgres importers.
 *
 * Rule: no `JSON.stringify(` in these DB-layer files. A jsonb param must receive
 * the raw value (or `sql.json(...)`). If a genuine NON-jsonb use ever arises
 * (a text column, a log line), annotate that line with `// jsonb-text-exempt:
 * <reason>` and the guard allows it.
 *
 * Sibling to `timestampInstantSafety.meta.test.ts` (the Date-vs-ISO peer class).
 */
const ROOT = join(__dirname, "..", "..");
// ALL postgres.js raw-SQL DB-layer roots — NOT just lib/sync + onboarding. The
// double-encode class spans every file that builds a `$N::jsonb` param (Codex
// R4 found lib/reports/leaseProtocol.ts outside the original narrow scope). A
// new DB-layer dir that runs postgres.js SQL must be added here.
const SUBTREES = [
  "lib/sync",
  "lib/reports",
  "lib/onboarding",
  "lib/drive",
  "lib/db",
  "lib/adminAlerts",
  "app/api/admin",
  "app/api/cron",
  "app/api/drive",
];
const EXEMPTION = "jsonb-text-exempt";

function isCommentLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith("*") || t.startsWith("//") || t.startsWith("/*");
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (full.endsWith(".ts") && !full.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("jsonb write-boundary representation (structural defense)", () => {
  const files = SUBTREES.flatMap((sub) => walk(join(ROOT, sub)));

  test("the DB-layer subtree is non-empty (guard actually scans something)", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  test("no `JSON.stringify(` feeds a postgres.js jsonb param in any DB-layer root", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (
          line.includes("JSON.stringify(") &&
          !line.includes(EXEMPTION) &&
          !isCommentLine(line)
        ) {
          const rel = file.slice(ROOT.length + 1);
          offenders.push(`${rel}:${i + 1}  ${line.trim()}`);
        }
      });
    }
    expect(
      offenders,
      `Found JSON.stringify in postgres.js DB-layer code. A \`$N::jsonb\` param must ` +
        `receive the RAW value (postgres.js serializes it once via the cast) or ` +
        `\`sql.json(...)\` — JSON.stringify double-encodes it into a jsonb STRING ` +
        `SCALAR (the M12 Phase 0.F smoke-3 finalize-500 class). If this is a genuine ` +
        `non-jsonb use, annotate the line with \`// ${EXEMPTION}: <reason>\`.\n` +
        offenders.join("\n"),
    ).toEqual([]);
  });
});
