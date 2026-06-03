/**
 * M12.1 T4.3 — pg-cron-pivot-doc-guard.
 *
 * Walks M12.1 docs (spec + plan tree) + the parent M12 spec (R27 F53) and
 * asserts that 8 forbidden API-surface-verification patterns do NOT appear
 * outside allowlisted finding-history contexts. Each pattern catches a class
 * of regression that surfaced during M12.1's R1-R26 adversarial-review loop.
 *
 * Self-exclusion (R6 F15): this test file MUST contain the forbidden literals
 * to define them as regex patterns + bidirectional regression fixtures. The
 * walker skips this file entirely.
 *
 * Allowlist (R7 F18 + R13 F33 + R28 F55):
 *   - Inline `<!-- not-doc-guard-class: <reason> -->` within 5 lines
 *   - Lines containing `R\d+ F\d+` (round/finding citations)
 *   - Lines containing finding-history keywords: "Caught:", "Refined:", "Repair:",
 *     "was: ", "fix:", "finding history"
 *   - Lines inside HTML comments
 *
 * Patterns (semantic):
 *   1. Vault schema drift  — supabase_vault.foo function-call/table-access
 *   2. HTTP POST verb drift — net.http_post( function-call
 *   3. jobname-on-job_run_details — querying jobname against cron.job_run_details
 *      without joining cron.job
 *   4. Non-existent pg_cron column drift — cron.job_run_details + started_at/
 *      ended_at/created_at/updated_at (real columns: start_time/end_time)
 *   5. db-push-reapply assumption — "db push → expect FAIL" shape
 *   6. Unescaped LIKE wildcard — `LIKE 'fxav_cron_%'` without nearby ESCAPE
 *   7. Double-backslash ESCAPE — `ESCAPE '\\'` (PG parses as 2-char string)
 *   8. Secret-bearer SELECT — `SELECT decrypted_secret FROM vault.decrypted_secrets`
 *      outside cron.schedule body context
 *
 * Bidirectional regression fixtures (R14 F35): every pattern has a negative
 * case (introduce violation → expect FAIL) AND a positive case (legitimate
 * near-violation → expect PASS) below.
 */

import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const REPO_ROOT = process.cwd();
const SELF_RELATIVE = "tests/cross-cutting/pg-cron-pivot-doc-guard.test.ts";
const SELF_ABSOLUTE = resolve(REPO_ROOT, SELF_RELATIVE);

const WALKED_FILES = [
  "docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot-design.md",
  "docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation-design.md",
  "docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-02-m12.2-phase-b3-email-delivery-design.md",
  "docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-30-m12.2-admin-redesign/M12.2-phase-b3-email-delivery.md",
];

const WALKED_DIRS = [
  "docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot",
];

// Pattern definitions. Each is a class-of-regression with a regex source +
// semantic name. The regex source is interpreted as case-insensitive.
interface ForbiddenPattern {
  id: number;
  name: string;
  regex: RegExp;
  // Optional structural check: a function that returns true if the match is a
  // genuine violation, false if it's a contextual false-positive that the
  // simple regex caught. Used for patterns 3 / 6 where simple regex isn't
  // sufficient (need to look at surrounding text).
  contextOk?: (text: string, matchIndex: number) => boolean;
}

const FORBIDDEN_PATTERNS: ForbiddenPattern[] = [
  {
    id: 1,
    name: "Vault schema drift (supabase_vault.fn instead of vault.fn)",
    regex:
      /\bsupabase_vault\.(create_secret|update_secret|decrypted_secrets|secrets)\b/i,
  },
  {
    id: 2,
    name: "HTTP POST verb drift (net.http_post function-call)",
    regex: /\bnet\.http_post\(/i,
  },
  {
    id: 3,
    name: "jobname filter on cron.job_run_details without join to cron.job",
    // Anchor on the FROM clause shape (query-shape, not prose mention).
    regex: /\bfrom\s+cron\.job_run_details\b/i,
    contextOk: (text, matchIndex) => {
      // 500-char forward window covers a typical SELECT body. Skip if no
      // WHERE...jobname filter (just a SELECT * style query → OK).
      const window = text.slice(matchIndex, matchIndex + 500);
      if (!/\bjobname\b/i.test(window)) return true;
      // Allowlist: join to cron.job (the table, NOT job_run_details) makes
      // this a properly-joined query.
      if (/\bjoin\s+cron\.job\b(?!_run_details)/i.test(window)) return true;
      return false;
    },
  },
  {
    id: 4,
    name: "Non-existent pg_cron column drift on cron.job_run_details",
    // Bidirectional: wrong-column ANYWHERE within 200 chars of
    // cron.job_run_details (either before or after).
    regex:
      /(cron\.job_run_details[\s\S]{0,200}?\b(started_at|ended_at|finished_at|run_at|fired_at)\b)|(\b(started_at|ended_at|finished_at|run_at|fired_at)\b[\s\S]{0,200}?cron\.job_run_details)/i,
  },
  {
    id: 5,
    name: "db-push-reapply migration assumption (db push → expect FAIL)",
    // R4 F9 narrowed to assertion-shape only. Look for the broken
    // anti-tautology shape — db push within ~200 chars of "expect FAIL".
    regex: /(?:db push|supabase db push)[\s\S]{0,200}?expect[\s\S]{0,5}FAIL/i,
  },
  {
    id: 6,
    name: "Unescaped LIKE wildcard on jobname prefix",
    // Match `LIKE 'fxav_cron_%'` or similar underscore-bearing pattern
    // WITHOUT a nearby ESCAPE clause.
    regex: /\blike\s+'[a-z][a-z_]*_[a-z_%]+'/i,
    contextOk: (text, matchIndex) => {
      // R10 F26: look FORWARD up to 50 chars for `escape '\'`.
      const window = text.slice(matchIndex, matchIndex + 80);
      return /\bescape\s+'\\/i.test(window);
    },
  },
  {
    id: 7,
    name: "Double-backslash ESCAPE clause (parses as 2-char string in PG)",
    // R6 F14: ESCAPE requires single char; '\\' (2 backslashes in SQL) errors.
    regex: /\bescape\s+'\\\\'/i,
  },
  {
    id: 8,
    name: "Secret-bearer SELECT decrypted_secret outside cron schedule body",
    // R24 F48. Allowed contexts: inside cron.schedule body, inside this test
    // file (self-excluded), inside finding-history (allowlist below).
    regex: /\bselect\s+decrypted_secret\s+from\s+vault\.decrypted_secrets\b/i,
    contextOk: (text, matchIndex) => {
      // Look backward up to 500 chars for cron.schedule + format($body$
      // bracket — if present, this is the legitimate cron-body context.
      const start = Math.max(0, matchIndex - 500);
      const back = text.slice(start, matchIndex);
      return /cron\.schedule\([\s\S]*?format\s*\(\s*\$body\$/i.test(back);
    },
  },
];

// Allowlist regex applied to a 11-line context window (±5 lines from match).
const ALLOWLIST_PATTERNS: RegExp[] = [
  /<!--\s*not-doc-guard-class:/i,
  /\bR\d+\s+F\d+\b/, // round/finding citations
  /\bfinding[- ]history\b/i,
  /\bcaught:/i,
  /\brefined:/i,
  /\brepair:/i,
  /\bwas:\s/i,
  /\bfix:/i,
  /\bHISTORICAL\b/, // explicit historical-row markers
  /audit[- ]trail/i,
];

const SCANNABLE_EXT = /\.md$/i;

function* walkMarkdown(rootAbs: string): Iterable<string> {
  const entries = readdirSync(rootAbs, { withFileTypes: true });
  for (const entry of entries) {
    const childAbs = join(rootAbs, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".")) continue;
      yield* walkMarkdown(childAbs);
    } else if (entry.isFile() && SCANNABLE_EXT.test(entry.name)) {
      yield childAbs;
    }
  }
}

function collectWalkedFiles(): { paths: string[]; visitedSelf: boolean } {
  const paths: string[] = [];
  let visitedSelf = false;
  for (const rel of WALKED_FILES) {
    const abs = resolve(REPO_ROOT, rel);
    try {
      statSync(abs);
      paths.push(abs);
    } catch {
      /* skip missing */
    }
  }
  for (const dir of WALKED_DIRS) {
    const dirAbs = resolve(REPO_ROOT, dir);
    try {
      statSync(dirAbs);
    } catch {
      continue;
    }
    for (const fileAbs of walkMarkdown(dirAbs)) {
      paths.push(fileAbs);
    }
  }
  // Self-exclusion (R6 F15): the walker MUST visit this file's path to
  // confirm the exclusion fired, but skip it from scanning.
  const filteredPaths = paths.filter((p) => {
    if (p === SELF_ABSOLUTE) {
      visitedSelf = true;
      return false;
    }
    return true;
  });
  return { paths: filteredPaths, visitedSelf };
}

interface DocFinding {
  filePath: string;
  lineNumber: number;
  lineText: string;
  pattern: ForbiddenPattern;
}

function lineNumberOf(text: string, charIndex: number): number {
  let n = 1;
  for (let i = 0; i < charIndex && i < text.length; i++) {
    if (text[i] === "\n") n++;
  }
  return n;
}

function lineWindowContext(lines: string[], lineNumber: number): string {
  // ±5 lines.
  const lo = Math.max(0, lineNumber - 1 - 5);
  const hi = Math.min(lines.length, lineNumber - 1 + 6);
  return lines.slice(lo, hi).join("\n");
}

function isAllowlisted(contextText: string): boolean {
  return ALLOWLIST_PATTERNS.some((rx) => rx.test(contextText));
}

function scanTextForPatterns(text: string, sourceLabel: string): DocFinding[] {
  const findings: DocFinding[] = [];
  const lines = text.split("\n");
  for (const pattern of FORBIDDEN_PATTERNS) {
    // Reset lastIndex if global; we use non-global so just .exec from index 0
    // and re-search if there could be multiple matches per file.
    let cursor = 0;
    while (cursor < text.length) {
      const matchText = text.slice(cursor).match(pattern.regex);
      if (!matchText || matchText.index === undefined) break;
      const matchIndex = cursor + matchText.index;
      cursor = matchIndex + Math.max(1, matchText[0].length);

      // Context-aware check (patterns 3 + 6 + 8).
      if (pattern.contextOk && pattern.contextOk(text, matchIndex)) continue;

      const lineNumber = lineNumberOf(text, matchIndex);
      const lineText = lines[lineNumber - 1] ?? "";
      const ctxText = lineWindowContext(lines, lineNumber);
      if (isAllowlisted(ctxText)) continue;

      findings.push({
        filePath: sourceLabel,
        lineNumber,
        lineText: lineText.trim(),
        pattern,
      });
    }
  }
  return findings;
}

function scanWalkedSurfaces(): { findings: DocFinding[]; visitedSelf: boolean; walkedCount: number } {
  const { paths, visitedSelf } = collectWalkedFiles();
  const findings: DocFinding[] = [];
  for (const abs of paths) {
    const text = readFileSync(abs, "utf8");
    findings.push(...scanTextForPatterns(text, relative(REPO_ROOT, abs)));
  }
  return { findings, visitedSelf, walkedCount: paths.length };
}

describe("M12.1: pg-cron-pivot-doc-guard (walks M12.1 + parent M12 spec)", () => {
  test("zero forbidden-pattern matches in walked surfaces", () => {
    const { findings, walkedCount } = scanWalkedSurfaces();
    if (findings.length > 0) {
      const formatted = findings
        .map(
          (f) =>
            `  [${f.pattern.id}] ${f.filePath}:${f.lineNumber}  ${f.lineText}  (${f.pattern.name})`,
        )
        .join("\n");
      throw new Error(
        `Doc-guard found ${findings.length} forbidden-pattern match(es) in ${walkedCount} walked files. ` +
          `Add an inline waiver \`<!-- not-doc-guard-class: <reason> -->\` within 5 lines, OR cite the relevant ` +
          `finding history (R<n> F<n>) within 5 lines, OR remove the violation:\n${formatted}`,
      );
    }
    expect(findings).toEqual([]);
  });

  test("walker visited the parent M12 spec (R27 F53)", () => {
    const { paths } = collectWalkedFiles();
    const parentSpec = "docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation-design.md";
    const hasParent = paths.some((p) => p.endsWith(parentSpec));
    expect(hasParent, "parent M12 spec not in walked surface — R27 F53 regression").toBe(true);
  });

  test("anti-tautology: self file contains forbidden literal fixtures (R6 F15)", () => {
    // The walker's WALKED_DIRS/WALKED_FILES are all under docs/. This test file
    // lives at tests/cross-cutting/ which is structurally outside the walker's
    // scope — self-exclusion is by construction, not by an `if (filePath === ...)`
    // skip during the docs/ walk. To prove the exclusion is load-bearing (not
    // vacuous), assert the self file CONTAINS forbidden literals — without them
    // the bidirectional regression fixtures below have no negative-case material.
    const selfText = readFileSync(SELF_ABSOLUTE, "utf8");
    expect(selfText, "self file should contain net.http_post( literal").toContain(
      "net.http_post(",
    );
    expect(
      selfText,
      "self file should contain supabase_vault.create_secret literal",
    ).toContain("supabase_vault.create_secret");
    expect(
      selfText,
      "self file should contain decrypted_secret from vault.decrypted_secrets literal",
    ).toContain("decrypted_secret from vault.decrypted_secrets");
  });

  // Bidirectional regression fixtures (R13 F33 + R14 F35).
  // Every pattern has a negative case (introduce violation → expect FAIL) AND
  // a positive case (legitimate near-violation → expect PASS) below. All
  // literal forbidden phrases live in THIS self-excluded file (R28 F55).
  describe("bidirectional regression fixtures", () => {
    // Helper: scan a fixture string and return only findings for one pattern id.
    function scanFor(id: number, fixture: string): DocFinding[] {
      const all = scanTextForPatterns(fixture, `fixture#${id}`);
      return all.filter((f) => f.pattern.id === id);
    }

    test("Pattern 1 — Vault schema drift", () => {
      const negative = "Function: supabase_vault.create_secret(...) — wrong schema.";
      const positiveProse = "Vault schema (vault.* NOT supabase_vault.*) consistent across surfaces.";
      const positiveExtCreate = "create extension if not exists supabase_vault with schema vault;";
      expect(scanFor(1, negative)).toHaveLength(1);
      expect(scanFor(1, positiveProse)).toHaveLength(0);
      expect(scanFor(1, positiveExtCreate)).toHaveLength(0);
    });

    test("Pattern 2 — HTTP POST verb drift", () => {
      const negative = "perform net.http_post(url := ..., headers := ...);";
      const positiveProse = "use net.http_get NOT net.http_post — handlers are GET-only.";
      expect(scanFor(2, negative)).toHaveLength(1);
      expect(scanFor(2, positiveProse)).toHaveLength(0);
    });

    test("Pattern 3 — jobname filter on cron.job_run_details without join", () => {
      const negative =
        "select start_time, status from cron.job_run_details where jobname = 'fxav_cron_sync' order by start_time desc;";
      const positiveJoined =
        "select j.jobname, jrd.start_time from cron.job_run_details jrd join cron.job j on j.jobid = jrd.jobid;";
      const positiveProse =
        "cron.job_run_details only has jobid (NOT jobname); jobname lives on cron.job.";
      expect(scanFor(3, negative)).toHaveLength(1);
      expect(scanFor(3, positiveJoined)).toHaveLength(0);
      expect(scanFor(3, positiveProse)).toHaveLength(0);
    });

    test("Pattern 4 — non-existent pg_cron column", () => {
      const negative =
        "select started_at from cron.job_run_details where status = 'succeeded';";
      const positive =
        "select start_time, end_time from cron.job_run_details where status = 'succeeded';";
      expect(scanFor(4, negative)).toHaveLength(1);
      expect(scanFor(4, positive)).toHaveLength(0);
    });

    test("Pattern 5 — db-push-reapply assumption", () => {
      const negative =
        "Edit the migration file, then run db push and expect FAIL on the assertion.";
      const positive = "If db push reports a pending-migration failure, fix and re-apply.";
      expect(scanFor(5, negative)).toHaveLength(1);
      expect(scanFor(5, positive)).toHaveLength(0);
    });

    test("Pattern 6 — unescaped LIKE wildcard", () => {
      const negative =
        "delete from cron.job where jobname like 'fxav_cron_%';";
      const positiveEscaped =
        "delete from cron.job where jobname like 'fxav\\_cron\\_%' escape '\\';";
      expect(scanFor(6, negative)).toHaveLength(1);
      expect(scanFor(6, positiveEscaped)).toHaveLength(0);
    });

    test("Pattern 7 — double-backslash ESCAPE clause", () => {
      const negative =
        "where jobname like 'fxav\\_cron\\_%' escape '\\\\';"; // SQL has '\\' (2 backslashes)
      const positiveSingle =
        "where jobname like 'fxav\\_cron\\_%' escape '\\';"; // SQL has '\' (1 backslash)
      expect(scanFor(7, negative)).toHaveLength(1);
      expect(scanFor(7, positiveSingle)).toHaveLength(0);
    });

    test("Pattern 8 — secret-bearer SELECT outside cron schedule body", () => {
      const negative =
        "select decrypted_secret from vault.decrypted_secrets where name = 'fxav_cron_secret';";
      const positiveInsideCronBody = `perform cron.schedule('fxav_cron_sync', '*/5 * * * *', format($body$
        select net.http_get(
          url := %L,
          headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'fxav_cron_secret')),
          timeout_milliseconds := 300000
        );
      $body$, vercel_url || '/api/cron/sync'));`;
      const positiveProse =
        "the bearer is sourced from Supabase Vault decrypted-secrets, keyed by name fxav_cron_secret.";
      expect(scanFor(8, negative)).toHaveLength(1);
      expect(scanFor(8, positiveInsideCronBody)).toHaveLength(0);
      expect(scanFor(8, positiveProse)).toHaveLength(0);
    });
  });
});
