/**
 * tests/cross-cutting/no-inline-email-normalization-in-plan-doc-guard.test.ts
 *
 * R49 commit 89 F44 STRUCTURAL DEFENSE — plan/spec markdown guard against
 * inline-email-normalization instructions.
 *
 * Background: `tests/admin/no-inline-email-normalization.test.ts` enforces
 * AGENTS.md invariant 3 ("Email canonicalization at every boundary;
 * `lib/email/canonicalize.ts` is the only function that touches raw emails
 * before they enter the system") at the CODE surface — it walks `.ts`/`.tsx`
 * files under `app/`, `lib/`, `tests/e2e/helpers/` and rejects `.toLowerCase()`
 * / `.trim()` patterns outside comments.
 *
 * R48 F44 surfaced a NEW class: the PLAN markdown itself instructed the
 * implementer to write `lower(trim('<dev-email>'))` directly in SQL — an
 * inline-email-normalization invariant-3 violation that the code-side
 * meta-test cannot catch because the plan is markdown, not TS. R49 commit 88
 * fixed the per-instance site at plan 01:30-38 and class-swept the rest of
 * the Phase 0 plan + spec; this test is the structural defense pinning the
 * invariant for future plan/spec drift.
 *
 * Forbidden actionable patterns in plan/spec markdown:
 *   - `lower(trim(...))` SQL fragment with email-context
 *   - `LOWER(...)` SQL fragment with email-context
 *   - `email.toLowerCase()` / `email.trim()` TS fragments
 *
 * Per the existing F21-class architecture in
 * `reseed-clears-oauth-claim-doc-guard.test.ts`, escape hatches are:
 *   - HISTORICAL_QUALIFIER prose ("pre-R49", "retired", "legacy", etc.)
 *     within 200-char lookback (intentional retrospective references)
 *   - `<!-- not-inline-email-norm: <reason> -->` inline waiver within
 *     200-char lookback (explicit per-instance opt-out)
 *   - Surfaces in the per-finding audit-trail of the handoff doc that
 *     LEGITIMATELY quote broken prior wording verbatim are excluded
 *     wholesale (mirrors EXCLUDED_PATHS in the sibling test)
 *
 * Critically the regexes are tuned to require an EMAIL-context co-anchor
 * within a tight window (table name, column, prose word "email") so SQL
 * fragments in unrelated contexts don't false-fire.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = process.cwd();

const PLAN_DIR =
  "docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation";
const SPEC_FILE =
  "docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation-design.md";
const HANDOFF_FILE =
  "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/handoffs/M12-solo-dev-ux-validation.md";

function collectMarkdown(target: string): string[] {
  const full = join(ROOT, target);
  let stat;
  try {
    stat = statSync(full);
  } catch {
    return [];
  }
  if (stat.isFile()) {
    return target.endsWith(".md") ? [target] : [];
  }
  const out: string[] = [];
  for (const ent of readdirSync(full)) {
    const rel = join(target, ent);
    const entStat = statSync(join(ROOT, rel));
    if (entStat.isDirectory()) {
      if (ent === "node_modules" || ent === ".next") continue;
      out.push(...collectMarkdown(rel));
    } else if (rel.endsWith(".md")) {
      out.push(rel);
    }
  }
  return out;
}

interface PatternSpec {
  class: string;
  rx: RegExp;
  explain: string;
}

const FORBIDDEN_PATTERNS: PatternSpec[] = [
  {
    class: "sql:lower-trim-email",
    // `lower(trim(...))` OR `LOWER(TRIM(...))` requiring email-context
    // co-anchor inside the inner argument (within ~80 chars).
    rx: /\blower\s*\(\s*trim\s*\([\s\S]{0,80}?(?:\bemail\b|admin_emails|crew_member_auth|<[\w-]*email[\w-]*>)/i,
    explain:
      "actionable `lower(trim(...))` SQL fragment in email context bypasses `lib/email/canonicalize.ts` (AGENTS.md invariant 3). Plan markdown must instruct the implementer to call the helper first and pass the canonical literal to SQL.",
  },
  {
    class: "sql:lower-email",
    // Bare `lower(<email-value-or-placeholder>)` — same invariant-3
    // violation shape without the trim wrapper.
    rx: /\blower\s*\(\s*(?:'[^']*@[^']*'|<[\w-]*email[\w-]*>)/i,
    explain:
      "actionable `lower(<email>)` SQL fragment bypasses `lib/email/canonicalize.ts`.",
  },
  {
    class: "ts:email-tolowercase-or-trim",
    // `<something>email<something>.toLowerCase()` / `.trim()` patterns.
    rx: /\b\w*email\w*\s*\.\s*(?:toLowerCase|trim)\s*\(\s*\)/i,
    explain:
      "actionable `<email>.toLowerCase()` / `<email>.trim()` TS fragment in plan markdown is an inline-normalization instruction.",
  },
];

// Retrospective-frame qualifiers that bypass the regex when present in
// the 200-char window AROUND the match. Mirrors the F21-class pattern
// at `reseed-clears-oauth-claim-doc-guard.test.ts:2207`.
const HISTORICAL_QUALIFIER_RX =
  /\b(pre-R\d+|pre-r\d+|pre-amendment|earlier\s+draft|original\s+draft|originally\s+drafted|originally\s+framed|legacy|retired|deprecated|historical|before\s+R\d+|prior\s+to\s+R\d+|the\s+pre-R\d+\s+|F\d+\s+finding\s+pre-|R49\s+commit\s+88\s+F44\s+amendment|R49\s+F44\s+amendment|Do\s+NOT\s+use\s+inline)\b/i;
// DDL-citation qualifiers that bypass the regex when the regex match
// describes the live CHECK constraint shape (which is legitimately
// `lower(trim(email))` — the citation describes existing migration DDL,
// NOT an implementer instruction). These must be IMMEDIATELY adjacent
// (~120 char window) to bind tightly to the cited DDL fragment.
const DDL_CITATION_RX =
  /\b(CHECK\s+constraint\s+enforces|CHECK\s+constraint\s+on\s+the\s+table\s+is\s+the\s+safety\s+net|the\s+safety\s+net|byte-identical|describing\s+existing|live\s+DDL\s+at)\b/i;
const WAIVER_RX = /<!--\s*not-inline-email-norm:\s*[^-]/i;
// Narrow-frame lookback: 200 chars before AND 200 chars after the match.
// Matches F21-class default and binds qualifiers tightly to the match.
const NARROW_FRAME_CHARS = 200;
// Wider lookback specifically for the R49 commit 88 F44 amendment
// paragraph (which is ~1KB long and qualifies any inline normalization
// described inside it as the amendment's own internal documentation).
const AMENDMENT_FRAME_CHARS = 1200;
const AMENDMENT_FRAME_RX = /R49\s+commit\s+88\s+F44\s+amendment/i;

/**
 * Files where invariant-3 violation prose is LEGITIMATELY quoted as part of
 * audit-trail / convergence-log / DEFERRED-extension contracts. These
 * surfaces describe the forbidden pattern by name in order to forbid it;
 * they are not implementer instructions and must not trip the guard.
 */
const EXCLUDED_PATHS = new Set<string>([
  HANDOFF_FILE,
  // 03-phase0-tooling-reseed.md authors the DEFERRED `M12-PHASE0C-EMAIL-CANON-EXT`
  // extension contract — quotes forbidden patterns by name in order to
  // forbid them in `scripts/validation-*.ts`. NOT actionable implementer
  // instructions.
  `${PLAN_DIR}/03-phase0-tooling-reseed.md`,
  // DEFERRED.md describes the same extension contract. Same rationale.
  `${PLAN_DIR}/DEFERRED.md`,
  // 00-overview.md:122 references the live-audit walker file list. Same
  // rationale.
  `${PLAN_DIR}/00-overview.md`,
]);

interface Finding {
  file: string;
  line: number;
  matchedClass: string;
  snippet: string;
}

function scanFile(rel: string): Finding[] {
  const abs = join(ROOT, rel);
  const src = readFileSync(abs, "utf8");
  const lines = src.split(/\r?\n/);
  const findings: Finding[] = [];

  for (const pattern of FORBIDDEN_PATTERNS) {
    const globalRx = new RegExp(
      pattern.rx.source,
      pattern.rx.flags.includes("g") ? pattern.rx.flags : `${pattern.rx.flags}g`,
    );
    let m: RegExpExecArray | null;
    while ((m = globalRx.exec(src)) !== null) {
      const matchStart = m.index;
      const matchEnd = matchStart + m[0].length;

      // CRITICAL: if the match is INSIDE a SQL code block (```sql ... ```),
      // the qualifier escape hatches do NOT apply — SQL code blocks are
      // copy-paste implementer instructions, not narrative prose. This is
      // the structural invariant: actionable SQL inside fenced blocks is
      // ALWAYS a finding regardless of surrounding amendment narrative.
      const beforeMatch = src.substring(0, matchStart);
      const lastSqlFenceOpen = Math.max(
        beforeMatch.lastIndexOf("```sql\n"),
        beforeMatch.lastIndexOf("```sql\r\n"),
      );
      const lastSqlFenceClose = beforeMatch.lastIndexOf("\n```");
      const insideSqlBlock =
        lastSqlFenceOpen !== -1 && lastSqlFenceOpen > lastSqlFenceClose;

      if (!insideSqlBlock) {
        // Narrow window (200 chars before + 200 after) for retrospective
        // qualifiers + DDL-citation qualifiers + waivers.
        const narrowStart = Math.max(0, matchStart - NARROW_FRAME_CHARS);
        const narrowEnd = Math.min(src.length, matchEnd + NARROW_FRAME_CHARS);
        const narrowWindow = src.substring(narrowStart, narrowEnd);

        // Wider window (1200 chars) specifically for the R49 amendment
        // paragraph that legitimately quotes the forbidden pattern as part
        // of its own amendment narrative.
        const wideStart = Math.max(0, matchStart - AMENDMENT_FRAME_CHARS);
        const wideEnd = Math.min(src.length, matchEnd + AMENDMENT_FRAME_CHARS);
        const wideWindow = src.substring(wideStart, wideEnd);

        if (HISTORICAL_QUALIFIER_RX.test(narrowWindow)) continue;
        if (DDL_CITATION_RX.test(narrowWindow)) continue;
        if (WAIVER_RX.test(narrowWindow)) continue;
        if (AMENDMENT_FRAME_RX.test(wideWindow)) continue;
      }

      const upToMatch = src.substring(0, matchStart);
      const lineNum = (upToMatch.match(/\n/g)?.length ?? 0) + 1;
      const snippet = lines[lineNum - 1]?.slice(0, 160) ?? "<unavailable>";

      findings.push({
        file: rel,
        line: lineNum,
        matchedClass: pattern.class,
        snippet,
      });
    }
  }
  return findings;
}

describe("R49 commit 89 F44 — no inline email normalization in plan/spec markdown", () => {
  test("plan markdown files contain no actionable inline-email-normalization instructions", () => {
    const allPlanFiles = collectMarkdown(PLAN_DIR);
    const scanFiles = allPlanFiles.filter((p) => !EXCLUDED_PATHS.has(p));
    expect(
      scanFiles.length,
      "expected at least one plan markdown file to scan after exclusions",
    ).toBeGreaterThan(0);

    const findings: Finding[] = [];
    for (const rel of scanFiles) {
      findings.push(...scanFile(rel));
    }

    expect(
      findings,
      `inline-email-normalization patterns found in plan markdown (AGENTS.md invariant 3 violation):\n${findings
        .map(
          (f) =>
            `  ${f.file}:${f.line} [${f.matchedClass}]\n    ${f.snippet}`,
        )
        .join("\n")}`,
    ).toEqual([]);
  });

  test("spec markdown contains no actionable inline-email-normalization instructions", () => {
    if (EXCLUDED_PATHS.has(SPEC_FILE)) {
      return;
    }
    const findings = scanFile(SPEC_FILE);
    expect(
      findings,
      `inline-email-normalization patterns found in spec markdown:\n${findings
        .map(
          (f) =>
            `  ${f.file}:${f.line} [${f.matchedClass}]\n    ${f.snippet}`,
        )
        .join("\n")}`,
    ).toEqual([]);
  });

  // Synthetic broken fixtures — must FIRE.
  test("synthetic broken fixture: bare lower(trim) SQL FIRES", () => {
    const fixture = `INSERT INTO public.admin_emails (email, added_at) VALUES (lower(trim('<dev-email>')), now())`;
    const sqlLowerTrimEmail = FORBIDDEN_PATTERNS[0]!.rx;
    expect(sqlLowerTrimEmail.test(fixture)).toBe(true);
  });

  test("synthetic broken fixture: bare lower(<email>) SQL FIRES", () => {
    const fixture = `WHERE email = lower('Ed.Weiss@Gmail.com')`;
    const sqlLowerEmailRx = FORBIDDEN_PATTERNS[1]!.rx;
    expect(sqlLowerEmailRx.test(fixture)).toBe(true);
  });

  test("synthetic broken fixture: rawEmail.toLowerCase() TS FIRES", () => {
    const fixture = `const norm = rawEmail.toLowerCase();`;
    const tsEmailLower = FORBIDDEN_PATTERNS[2]!.rx;
    expect(tsEmailLower.test(fixture)).toBe(true);
  });

  // Synthetic passing fixtures — must NOT FIRE.
  test("synthetic passing fixture: canonicalize-first procedure PASSES", () => {
    const fixture = [
      "CANON_EMAIL=$(pnpm tsx -e \"import('./lib/email/canonicalize.ts')\")",
      "INSERT INTO public.admin_emails (email, added_at)",
      "VALUES ('<canonical-dev-email>', now());",
    ].join("\n");
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(
        pattern.rx.test(fixture),
        `pattern ${pattern.class} unexpectedly fired on canonical post-R49 procedure fixture`,
      ).toBe(false);
    }
  });

  test("synthetic passing fixture: HISTORICAL_QUALIFIER lookback bypasses regex", () => {
    const fixture = `Pre-R49 the plan said lower(trim('<dev-email>')) for admin bootstrap — retired in R49 commit 88 F44 amendment.`;
    const m = FORBIDDEN_PATTERNS[0]!.rx.exec(fixture);
    expect(m).not.toBeNull();
    if (m && m.index !== undefined) {
      const lookback = fixture.substring(
        Math.max(0, m.index - NARROW_FRAME_CHARS),
        m.index + m[0].length,
      );
      expect(HISTORICAL_QUALIFIER_RX.test(lookback)).toBe(true);
    }
  });

  test("synthetic passing fixture: inline waiver bypasses regex", () => {
    const fixture = `<!-- not-inline-email-norm: historical quote from F44 verbatim --> lower(trim('<dev-email>'))`;
    const m = FORBIDDEN_PATTERNS[0]!.rx.exec(fixture);
    expect(m).not.toBeNull();
    if (m && m.index !== undefined) {
      const lookback = fixture.substring(
        Math.max(0, m.index - NARROW_FRAME_CHARS),
        m.index + m[0].length,
      );
      expect(WAIVER_RX.test(lookback)).toBe(true);
    }
  });

  test("synthetic passing fixture: non-email-context lower(trim()) does NOT fire", () => {
    const fixture = `SELECT lower(trim(symbol_name)) FROM frequency_symbols;`;
    const sqlLowerTrimEmailRx = FORBIDDEN_PATTERNS[0]!.rx;
    expect(sqlLowerTrimEmailRx.test(fixture)).toBe(false);
  });

  test("control: lower(trim(email)) sample matches pattern A", () => {
    const sample = `lower(trim(email))`;
    expect(FORBIDDEN_PATTERNS[0]!.rx.test(sample)).toBe(true);
  });
});
