/**
 * tests/cross-cutting/no-inline-email-normalization-in-plan-doc-guard.test.ts
 *
 * R49 commit 89 F44 + R51 commit 92 F46 STRUCTURAL DEFENSE — plan/spec
 * markdown guard against (a) inline-email-normalization instructions
 * (R49 / F44 class) and (b) false-semantics claims about canonicalize.ts
 * (R51 / F46 class — DIFFERENT shape, see below).
 *
 * Background: `tests/admin/no-inline-email-normalization.test.ts` enforces
 * AGENTS.md invariant 3 ("Email canonicalization at every boundary;
 * `lib/email/canonicalize.ts` is the only function that touches raw emails
 * before they enter the system") at the CODE surface — it walks `.ts`/`.tsx`
 * files under `app/`, `lib/`, `tests/e2e/helpers/` and rejects `.toLowerCase()`
 * / `.trim()` patterns outside comments.
 *
 * R48 F44 surfaced the FIRST class: the PLAN markdown itself instructed the
 * implementer to write `lower(trim('<dev-email>'))` directly in SQL — an
 * inline-email-normalization invariant-3 violation that the code-side
 * meta-test cannot catch because the plan is markdown, not TS. R49 commit 88
 * fixed the per-instance site at plan 01:30-38 and class-swept the rest of
 * the Phase 0 plan + spec; R49 commit 89 landed the structural defense
 * (FORBIDDEN_PATTERNS sql:* + ts:* classes below).
 *
 * R50 F46 surfaced the SECOND class — plan 03:925 said:
 *   `validation+5a@example.com` canonicalizes to `validation@example.com`
 *   (strip-plus)
 * The live helper at `lib/email/canonicalize.ts:2-6` performs
 * `raw.trim().toLowerCase()` ONLY — does NOT strip plus-aliases. That's
 * a FALSE-SEMANTICS claim about canonicalize.ts contract — it does not
 * fit the F44 SQL-fragment / TS-method-call shape (no `lower(...)`, no
 * `.toLowerCase()`), but it carries equivalent invariant-3 harm:
 * implementers reading the prose can mis-edit the helper toward a
 * non-existent strip-plus contract or mis-diagnose a real CHECK failure.
 * R51 commit 91 fixed the per-instance site; this test extension is the
 * structural defense pinning the second class.
 *
 * Forbidden actionable patterns in plan/spec markdown:
 *   F44 class (SQL/TS fragments):
 *     - `lower(trim(...))` SQL fragment with email-context
 *     - `LOWER(...)` SQL fragment with email-context
 *     - `email.toLowerCase()` / `email.trim()` TS fragments
 *   F46 class (false-semantics prose):
 *     - `<some-prefix>+<alias>@<domain>` canonicalizes to `<same-prefix>@<domain>`
 *       (false strip-plus mapping)
 *     - "strip-plus" / "strips plus" / "strip plus aliases" as claimed
 *       canonicalize.ts behavior
 *     - "removes plus aliases" / "removes the +<alias>" as claimed behavior
 *
 * Per the existing F21-class architecture in
 * `reseed-clears-oauth-claim-doc-guard.test.ts`, escape hatches are:
 *   - HISTORICAL_QUALIFIER prose ("pre-R49", "retired", "legacy", "was FALSE",
 *     "this entry previously claimed", etc.) within 200-char lookback
 *     (intentional retrospective references)
 *   - NEGATION_QUALIFIER prose ("does NOT strip", "never stripped",
 *     "preserved", etc.) within 200-char lookback (correct negated claims)
 *   - `<!-- not-inline-email-norm: <reason> -->` inline waiver within
 *     200-char lookback (explicit per-instance opt-out)
 *   - Surfaces in the per-finding audit-trail of the handoff doc that
 *     LEGITIMATELY quote broken prior wording verbatim are excluded
 *     wholesale (mirrors EXCLUDED_PATHS in the sibling test)
 *
 * Critically the F44 regexes are tuned to require an EMAIL-context co-anchor
 * within a tight window (table name, column, prose word "email") so SQL
 * fragments in unrelated contexts don't false-fire. The F46 regexes are
 * tightly scoped to specific false-claim shapes (`+<alias>@.*canonicalizes
 * to.*@`, `strip-plus`, etc.) for the same reason.
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
  /**
   * R51 F46: prose-class patterns scan EVERY file regardless of
   * EXCLUDED_PATHS — the audit-trail exemption that justifies skipping
   * plan 03 / handoff / DEFERRED for the SQL-fragment classes does NOT
   * apply to prose-class claims, which are equally actionable in any
   * markdown surface. SQL-fragment classes keep EXCLUDED_PATHS to allow
   * those surfaces to legitimately quote forbidden patterns by name in
   * order to forbid them.
   */
  scope: "respects-exclusions" | "all-files";
}

const FORBIDDEN_PATTERNS: PatternSpec[] = [
  {
    class: "sql:lower-trim-email",
    // `lower(trim(...))` OR `LOWER(TRIM(...))` requiring email-context
    // co-anchor inside the inner argument (within ~80 chars).
    rx: /\blower\s*\(\s*trim\s*\([\s\S]{0,80}?(?:\bemail\b|admin_emails|crew_member_auth|<[\w-]*email[\w-]*>)/i,
    explain:
      "actionable `lower(trim(...))` SQL fragment in email context bypasses `lib/email/canonicalize.ts` (AGENTS.md invariant 3). Plan markdown must instruct the implementer to call the helper first and pass the canonical literal to SQL.",
    scope: "respects-exclusions",
  },
  {
    class: "sql:lower-email",
    // Bare `lower(<email-value-or-placeholder>)` — same invariant-3
    // violation shape without the trim wrapper.
    rx: /\blower\s*\(\s*(?:'[^']*@[^']*'|<[\w-]*email[\w-]*>)/i,
    explain:
      "actionable `lower(<email>)` SQL fragment bypasses `lib/email/canonicalize.ts`.",
    scope: "respects-exclusions",
  },
  {
    class: "ts:email-tolowercase-or-trim",
    // `<something>email<something>.toLowerCase()` / `.trim()` patterns.
    rx: /\b\w*email\w*\s*\.\s*(?:toLowerCase|trim)\s*\(\s*\)/i,
    explain:
      "actionable `<email>.toLowerCase()` / `<email>.trim()` TS fragment in plan markdown is an inline-normalization instruction.",
    scope: "respects-exclusions",
  },
  // R51 commit 92 F46 — false-semantics claims about canonicalize.ts.
  // These patterns catch prose claims that canonicalize.ts strips plus
  // aliases or otherwise transforms emails beyond trim+toLowerCase. The
  // live helper at `lib/email/canonicalize.ts:2-6` performs ONLY
  // `raw.trim().toLowerCase()`. Negated / historical claims escape via
  // HISTORICAL_QUALIFIER_RX + NEGATION_QUALIFIER_RX windows.
  {
    class: "prose:plus-alias-canonicalizes-to-non-plus",
    // Match `<prefix>+<alias>@<domain>` followed (within ~120 chars) by a
    // verb form of "canonicalize" + "to" + `<prefix>@<domain>` (same
    // prefix without the +alias segment). This is the specific false
    // strip-plus mapping that R50 F46 flagged.
    rx: /\b([\w][\w.-]*)\+[\w.-]+@([\w][\w.-]*\.[\w][\w.-]*)\b[\s\S]{0,120}?\bcanonicaliz\w+\s+to\s+`?\1@\2`?/i,
    explain:
      "actionable FALSE-SEMANTICS claim that a plus-alias email canonicalizes to the non-plus form. The live `lib/email/canonicalize.ts:2-6` helper performs `raw.trim().toLowerCase()` ONLY — it does NOT strip plus aliases. Correct the prose to reflect actual semantics or qualify the claim with a HISTORICAL_QUALIFIER (\"pre-R51\", \"was FALSE\", etc.) / NEGATION_QUALIFIER (\"does NOT canonicalize to\", etc.).",
    scope: "all-files",
  },
  {
    class: "prose:strip-plus-claim",
    // "strip-plus" / "strips plus" / "strip plus aliases" / "removes
    // plus aliases" / "removes the +<alias>" — claimed canonicalize.ts
    // behavior. Requires a canonicalize-context anchor within ~160 chars
    // (so unrelated prose about stripping pluses elsewhere doesn't trip).
    rx: /\b(?:canonicaliz\w+|`?canonicalize\.ts`?|lib\/email\/canonicalize)\b[\s\S]{0,160}?\b(?:strip[- ]plus|strips\s+plus|strip\s+plus\s+aliases|removes\s+plus\s+aliases|removes\s+the\s+\+)/i,
    explain:
      "actionable FALSE-SEMANTICS claim that canonicalize.ts strips plus aliases. The live helper does NOT strip plus aliases. Correct the prose or qualify with HISTORICAL_QUALIFIER / NEGATION_QUALIFIER.",
    scope: "all-files",
  },
  {
    class: "prose:strip-plus-claim-reverse",
    // Reverse order: "strip-plus" anchor preceding a canonicalize
    // reference within ~160 chars. Catches "(strip-plus) ...
    // canonicalize.ts" prose order.
    rx: /\b(?:strip[- ]plus|strips\s+plus|strip\s+plus\s+aliases|removes\s+plus\s+aliases|removes\s+the\s+\+)\b[\s\S]{0,160}?\b(?:canonicaliz\w+|`?canonicalize\.ts`?|lib\/email\/canonicalize)\b/i,
    explain:
      "actionable FALSE-SEMANTICS claim that canonicalize.ts strips plus aliases (reverse prose order). Same remediation as forward-order class.",
    scope: "all-files",
  },
];

// Retrospective-frame qualifiers that bypass the regex when present in
// the 200-char window AROUND the match. Mirrors the F21-class pattern
// at `reseed-clears-oauth-claim-doc-guard.test.ts:2207`.
const HISTORICAL_QUALIFIER_RX =
  /\b(pre-R\d+|pre-r\d+|pre-amendment|earlier\s+draft|original\s+draft|originally\s+drafted|originally\s+framed|legacy|retired|deprecated|historical|before\s+R\d+|prior\s+to\s+R\d+|the\s+pre-R\d+\s+|F\d+\s+finding\s+pre-|R49\s+commit\s+88\s+F44\s+amendment|R49\s+F44\s+amendment|R51\s+commit\s+9\d+\s+F46\s+amendment|R51\s+F46\s+amendment|R50\s+surfaced\s+F46|Do\s+NOT\s+use\s+inline|previously\s+claimed|that\s+claim\s+was\s+FALSE|was\s+FALSE\b|claim\s+was\s+false\b|R49\s+\(B\)\s+sweep\s+miss\b)\b/i;
// R51 F46 NEGATION_QUALIFIER_RX — catches prose that correctly NEGATES
// the false claim ("does NOT strip", "never stripped", "preserves the
// `+`", "preserves the plus", "have never stripped", "has never
// stripped"). These are legitimate retrospective / corrective claims
// that document the actual contract.
const NEGATION_QUALIFIER_RX =
  /\b(does\s+NOT\s+strip|do\s+NOT\s+strip|did\s+NOT\s+strip|never\s+strip(?:ped|s)?|has\s+never\s+stripped|have\s+never\s+stripped|preserv(?:e|es|ed|ing)\s+the\s+(?:`?\+`?|plus)|the\s+`?\+`?\s+(?:and|is)\s+preserved|does\s+NOT\s+canonicaliz\w+\s+to|does\s+NOT\s+perform|performs\s+`?raw\.trim\(\)\.toLowerCase\(\)`?\s+ONLY|trim\s*\+\s*toLowerCase\s+only|`?raw\.trim\(\)\.toLowerCase\(\)`?\s+only|canonicaliz\w+\s+to\s+ITSELF|canonicalizes\s+to\s+itself)\b/i;
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

/**
 * R51 F46: prose-class patterns scope. Only the handoff doc is wholesale
 * excluded for prose-classes — it is by its nature an audit-trail
 * recording prior false-claim findings verbatim. All plan + spec files
 * are scanned (including the surfaces F44 wholesale-excludes), because
 * the F46 class is prose-only and the audit-trail rationale that
 * justifies SQL-fragment exemptions does NOT apply.
 */
const F46_EXCLUDED_PATHS = new Set<string>([HANDOFF_FILE]);

interface Finding {
  file: string;
  line: number;
  matchedClass: string;
  snippet: string;
}

function scanFile(rel: string, scopeFilter?: PatternSpec["scope"]): Finding[] {
  const abs = join(ROOT, rel);
  const src = readFileSync(abs, "utf8");
  const lines = src.split(/\r?\n/);
  const findings: Finding[] = [];

  const patterns = scopeFilter
    ? FORBIDDEN_PATTERNS.filter((p) => p.scope === scopeFilter)
    : FORBIDDEN_PATTERNS;

  for (const pattern of patterns) {
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
        if (NEGATION_QUALIFIER_RX.test(narrowWindow)) continue;
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

describe("R51 commit 92 F46 — no false-semantics claims about canonicalize.ts in plan/spec/handoff markdown", () => {
  // Prose-class patterns (scope: "all-files") scan EVERY file regardless
  // of EXCLUDED_PATHS. The audit-trail exemption that justifies skipping
  // plan 03 / handoff / DEFERRED for the SQL-fragment classes does NOT
  // apply to prose-class claims — false-semantics claims are equally
  // actionable in any markdown surface.
  test("plan markdown files contain no actionable false-semantics claims about canonicalize.ts", () => {
    const allPlanFiles = collectMarkdown(PLAN_DIR);
    const scanFiles = allPlanFiles.filter((p) => !F46_EXCLUDED_PATHS.has(p));
    expect(
      scanFiles.length,
      "expected at least one plan markdown file to scan after F46 exclusions",
    ).toBeGreaterThan(0);

    const findings: Finding[] = [];
    for (const rel of scanFiles) {
      findings.push(...scanFile(rel, "all-files"));
    }

    expect(
      findings,
      `false-semantics claims about canonicalize.ts found in plan markdown (live helper at lib/email/canonicalize.ts:2-6 does trim+toLowerCase ONLY):\n${findings
        .map(
          (f) =>
            `  ${f.file}:${f.line} [${f.matchedClass}]\n    ${f.snippet}`,
        )
        .join("\n")}`,
    ).toEqual([]);
  });

  test("spec markdown contains no actionable false-semantics claims about canonicalize.ts", () => {
    if (F46_EXCLUDED_PATHS.has(SPEC_FILE)) return;
    const findings = scanFile(SPEC_FILE, "all-files");
    expect(
      findings,
      `false-semantics claims about canonicalize.ts found in spec markdown:\n${findings
        .map(
          (f) =>
            `  ${f.file}:${f.line} [${f.matchedClass}]\n    ${f.snippet}`,
        )
        .join("\n")}`,
    ).toEqual([]);
  });

  // RED→GREEN synthetic fixtures.
  test("synthetic broken fixture: plan 03:925 PRE-R51 wording FIRES (pattern A)", () => {
    // Verbatim shape of the R50 F46 finding at plan 03:925 BEFORE R51
    // commit 91 rewrite — confirms the new pattern catches the original
    // bug shape.
    const fixture = `Master spec X.5 requires email canonicalization; \`validation+5a@example.com\` canonicalizes to \`validation@example.com\` (strip-plus).`;
    const proseAliasRx = FORBIDDEN_PATTERNS.find(
      (p) => p.class === "prose:plus-alias-canonicalizes-to-non-plus",
    )!.rx;
    expect(proseAliasRx.test(fixture)).toBe(true);
  });

  test("synthetic broken fixture: strip-plus claim about canonicalize.ts FIRES (forward order)", () => {
    const fixture = `The canonicalize.ts helper performs strip-plus on alias segments before write.`;
    const stripPlusRx = FORBIDDEN_PATTERNS.find(
      (p) => p.class === "prose:strip-plus-claim",
    )!.rx;
    expect(stripPlusRx.test(fixture)).toBe(true);
  });

  test("synthetic broken fixture: strip-plus claim FIRES (reverse order)", () => {
    const fixture = `The strip-plus step is performed by canonicalize.ts during the boundary normalize call.`;
    const reverseRx = FORBIDDEN_PATTERNS.find(
      (p) => p.class === "prose:strip-plus-claim-reverse",
    )!.rx;
    expect(reverseRx.test(fixture)).toBe(true);
  });

  test("synthetic broken fixture: 'removes plus aliases' claim FIRES", () => {
    const fixture = `canonicalize() removes plus aliases and lowercases the host.`;
    const stripPlusRx = FORBIDDEN_PATTERNS.find(
      (p) => p.class === "prose:strip-plus-claim",
    )!.rx;
    expect(stripPlusRx.test(fixture)).toBe(true);
  });

  // GREEN — passing fixtures.
  test("synthetic passing fixture: correct semantics ('canonicalizes to ITSELF') PASSES", () => {
    const fixture = `\`validation+5a@example.com\` canonicalizes to ITSELF — the helper performs raw.trim().toLowerCase() only.`;
    // Confirm the pattern would otherwise match the prefix-alias shape,
    // but the negation qualifier window bypasses it.
    const proseAliasRx = FORBIDDEN_PATTERNS.find(
      (p) => p.class === "prose:plus-alias-canonicalizes-to-non-plus",
    )!.rx;
    // The pattern is matching "canonicalizes to ITSELF" without binding
    // the backref, so the regex itself won't match — good.
    expect(proseAliasRx.test(fixture)).toBe(false);
  });

  test("synthetic passing fixture: NEGATION_QUALIFIER ('does NOT strip') bypasses regex", () => {
    // Reverse-order shape: "strip plus aliases" anchor preceding the
    // canonicalize.ts reference within 160 chars. Use the
    // strip-plus-claim-reverse pattern.
    const fixture = `The helper does NOT strip plus aliases — canonicalize.ts performs trim + toLowerCase only.`;
    const reverseRx = FORBIDDEN_PATTERNS.find(
      (p) => p.class === "prose:strip-plus-claim-reverse",
    )!.rx;
    const m = reverseRx.exec(fixture);
    // The regex matches the surface text, but NEGATION_QUALIFIER_RX
    // should fire within the 200-char window so scanFile bypasses it.
    expect(m).not.toBeNull();
    if (m && m.index !== undefined) {
      const lookback = fixture.substring(
        Math.max(0, m.index - NARROW_FRAME_CHARS),
        m.index + m[0].length + NARROW_FRAME_CHARS,
      );
      expect(NEGATION_QUALIFIER_RX.test(lookback)).toBe(true);
    }
  });

  test("synthetic passing fixture: HISTORICAL_QUALIFIER ('previously claimed... was FALSE') bypasses regex", () => {
    const fixture = `R51 F46 amendment: this entry previously claimed \`validation+5a@example.com\` canonicalizes to \`validation@example.com\` via strip-plus — that claim was FALSE.`;
    const proseAliasRx = FORBIDDEN_PATTERNS.find(
      (p) => p.class === "prose:plus-alias-canonicalizes-to-non-plus",
    )!.rx;
    const m = proseAliasRx.exec(fixture);
    expect(m).not.toBeNull();
    if (m && m.index !== undefined) {
      const lookback = fixture.substring(
        Math.max(0, m.index - NARROW_FRAME_CHARS),
        m.index + m[0].length + NARROW_FRAME_CHARS,
      );
      expect(HISTORICAL_QUALIFIER_RX.test(lookback)).toBe(true);
    }
  });

  test("synthetic passing fixture: non-canonicalize 'strip-plus' prose does NOT fire (no canon anchor)", () => {
    // An unrelated mention of "strip-plus" without a canonicalize anchor
    // within 160 chars should NOT trip either prose:strip-plus-* pattern.
    const fixture = `The SMTP relay handles plus-alias forwarding by routing strip-plus rewrites at the MX layer.`;
    const stripPlusRx = FORBIDDEN_PATTERNS.find(
      (p) => p.class === "prose:strip-plus-claim",
    )!.rx;
    const reverseRx = FORBIDDEN_PATTERNS.find(
      (p) => p.class === "prose:strip-plus-claim-reverse",
    )!.rx;
    expect(stripPlusRx.test(fixture)).toBe(false);
    expect(reverseRx.test(fixture)).toBe(false);
  });

  test("synthetic passing fixture: same-prefix different domain does NOT fire", () => {
    // The plus-alias-canonicalizes-to-non-plus pattern requires SAME prefix
    // AND SAME domain (via backrefs). Different domain should not match.
    const fixture = `\`validation+5a@example.com\` canonicalizes to \`validation@example.org\` (hypothetical).`;
    const proseAliasRx = FORBIDDEN_PATTERNS.find(
      (p) => p.class === "prose:plus-alias-canonicalizes-to-non-plus",
    )!.rx;
    expect(proseAliasRx.test(fixture)).toBe(false);
  });
});
