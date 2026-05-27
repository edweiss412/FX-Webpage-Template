/**
 * tests/cross-cutting/validation-tooling-tz-pin.test.ts — M12 Phase 0.C
 * Task 0.C.8 (DEFERRED.md `M12-PHASE0C-TZ-PIN-METATEST`).
 *
 * Structural defense for the TZ-pin / current_date discipline across
 * validation tooling. Greps every `.sql` migration matching
 * `supabase/migrations/*validation*.sql` AND every `.ts` script matching
 * `scripts/validation-*.ts` for the lowercase string `current_date`. Each
 * match MUST be either:
 *   (a) inside the bounded-skew sanity check:
 *         abs(<iso>::date - current_date) > 1
 *       (integer-day comparison — R11 F9 corrected from the broken
 *       extract(epoch from ...) form), OR
 *   (b) carry an inline waiver comment:
 *         // not-validation-today-iso: <reason>
 *         -- not-validation-today-iso: <reason>
 *
 * Default discipline: TZ-pinned `validationTodayIso` (UTC `YYYY-MM-DD`)
 * wins; `current_date` (Postgres server clock) is the skew-check only.
 *
 * R27 commit 56 F26 extension — also scans `scripts/validation-check-seed.ts`
 * for any predicate body comparing `last_seed_date` or
 * `combos_seeded_dates[...]` against `current_date`; these MUST compare
 * against `$VALIDATION_TODAY_ISO` (the TS-side canonical UTC value).
 *
 * Closes DEFERRED.md entry M12-PHASE0C-TZ-PIN-METATEST + R13 commit 29
 * phantom-structural-defense audit.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = process.cwd();

const SCAN_ROOTS = {
  migrations: "supabase/migrations",
  scripts: "scripts",
};

function listValidationMigrations(): string[] {
  return readdirSync(join(ROOT, SCAN_ROOTS.migrations))
    .filter((f) => /validation/i.test(f) && f.endsWith(".sql"))
    .map((f) => join(SCAN_ROOTS.migrations, f));
}

function listValidationScripts(): string[] {
  const out: string[] = [];
  for (const f of readdirSync(join(ROOT, SCAN_ROOTS.scripts))) {
    if (/^validation-[\w-]+\.ts$/.test(f)) {
      out.push(join(SCAN_ROOTS.scripts, f));
    }
  }
  // Helpers under scripts/lib/validation-*.ts are also in scope.
  const libDir = join(SCAN_ROOTS.scripts, "lib");
  try {
    for (const f of readdirSync(join(ROOT, libDir))) {
      if (/^validation-[\w-]+\.ts$/.test(f)) {
        out.push(join(libDir, f));
      }
    }
  } catch {
    // lib dir may not exist; not a failure.
  }
  return out;
}

type Violation = {
  file: string;
  line: number;
  context: string;
};

function isAcceptableContext(line: string, surroundingLines: string[]): boolean {
  // Pure comment-only lines (full-line SQL `--` or TS `//`) are documentation,
  // not code-path uses. The waiver-comment branch below still applies — a
  // line that says `-- not-validation-today-iso: X` is both a comment AND
  // an explicit waiver. The TZ-pin contract polices CODE paths, not prose
  // descriptions of those code paths in headers / comments.
  if (/^\s*(--|\/\/)/.test(line)) return true;

  // (a) bounded-skew sanity check.
  //   abs(<expr>::date - current_date) > 1
  if (/abs\([^)]*::date\s*-\s*current_date\s*\)/i.test(line)) return true;

  // (b) inline waiver comment on the same line or the preceding non-blank line.
  if (/(?:--|\/\/)\s*not-validation-today-iso\b/i.test(line)) return true;
  for (let i = surroundingLines.length - 1; i >= 0; i--) {
    const prev = surroundingLines[i];
    if (!prev) continue;
    if (/^\s*$/.test(prev)) continue;
    if (/(?:--|\/\/)\s*not-validation-today-iso\b/i.test(prev)) return true;
    break;
  }
  return false;
}

function scanFile(absPath: string, relPath: string): Violation[] {
  const out: Violation[] = [];
  const body = readFileSync(absPath, "utf8");
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    // Match lowercase `current_date` only (case-sensitive per the contract).
    // Use .match with /g per the project's regex-iteration convention.
    const matches = line.match(/\bcurrent_date\b/g);
    if (!matches) continue;
    const surrounding = lines.slice(Math.max(0, i - 3), i);
    if (!isAcceptableContext(line, surrounding)) {
      out.push({
        file: relPath,
        line: i + 1,
        context: line.trim(),
      });
    }
  }
  return out;
}

describe("validation-tooling-tz-pin meta-test (M12-PHASE0C-TZ-PIN-METATEST)", () => {
  test("every `current_date` reference in validation .sql migrations is inside the bounded-skew check or carries a waiver", () => {
    const migrations = listValidationMigrations();
    expect(
      migrations.length,
      "No validation migrations found; expected at least the mint + finalize RPC files.",
    ).toBeGreaterThan(0);

    const violations: Violation[] = [];
    for (const rel of migrations) {
      violations.push(...scanFile(join(ROOT, rel), rel));
    }
    expect(
      violations,
      `Bare current_date references found in validation migrations — wrap in abs(<iso>::date - current_date) > 1 OR add an inline waiver comment:\n${violations
        .map((v) => `  ${v.file}:${v.line}: ${v.context}`)
        .join("\n")}`,
    ).toEqual([]);
  });

  test("every `current_date` reference in scripts/validation-*.ts (+ scripts/lib/validation-*.ts) is inside the bounded-skew check or carries a waiver", () => {
    const scripts = listValidationScripts();
    expect(
      scripts.length,
      "No validation scripts found; expected reseed/check-seed/resolve-alias + lib helpers.",
    ).toBeGreaterThan(0);

    const violations: Violation[] = [];
    for (const rel of scripts) {
      violations.push(...scanFile(join(ROOT, rel), rel));
    }
    expect(
      violations,
      `Bare current_date references found in validation scripts — TZ-pinned validationTodayIso wins; current_date is for skew-check only:\n${violations
        .map((v) => `  ${v.file}:${v.line}: ${v.context}`)
        .join("\n")}`,
    ).toEqual([]);
  });

  test("R27 F26 extension — check-seed compares last_seed_date / combos_seeded_dates against $VALIDATION_TODAY_ISO, not current_date", () => {
    const checkSeed = "scripts/validation-check-seed.ts";
    const body = readFileSync(join(ROOT, checkSeed), "utf8");
    // Each `last_seed_date` and `combos_seeded_dates[...]` comparison in
    // the predicate bodies MUST not reference current_date — the canonical
    // value is the TS-side `validationTodayIso`. The acceptable-contexts
    // helper (bounded-skew or waiver) doesn't apply here because the script
    // itself doesn't invoke a `current_date` skew check; it's a pure TS
    // surface. Simply assert `current_date` is absent.
    const matches = body.match(/\bcurrent_date\b/g) ?? [];
    expect(
      matches,
      `${checkSeed} references current_date — predicate bodies must compare last_seed_date / combos_seeded_dates against $VALIDATION_TODAY_ISO (the script-computed TZ-pinned value).`,
    ).toEqual([]);
  });
});
