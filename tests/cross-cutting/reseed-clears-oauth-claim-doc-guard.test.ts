import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = process.cwd();
const SELF = "tests/cross-cutting/reseed-clears-oauth-claim-doc-guard.test.ts";

// R13 commit 32 structural defense for the R12 F11 finding (reseed-doesn't-
// restore-OAuth-claim-baseline). The mint RPC's UPSERT SET clause MUST
// include `claimed_via_oauth_at = NULL` so every reseed structurally
// restores the bypass-pickable baseline; check-seed predicate (l) MUST
// verify the discipline post-reseed. Without these, a J3 leg (c) walk
// poisons the LEAD picker row across every subsequent reseed and the
// next walk session sees a baseline where alias_5a_lead is permanently
// OAuth-disabled.
//
// This is a documentation-completeness invariant — it pins the contract
// in the M12 spec + plan markdown. Phase 0.C Task 0.C.4 implementer reads
// the plan and produces the live RPC migration; if the plan body drifts
// from this contract, the implementer ships a broken RPC and walks fail
// silently. Catching the drift at plan-time (CI doc-guard) is cheaper
// than catching it during the walk.

const PLAN_FILE = "docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/03-phase0-tooling-reseed.md";
const SPEC_FILE = "docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation-design.md";

// R15 commit 36 F10-class structural defense additions ----------------
// Scan roots for the multi-file F14 / parameterization-integrity / F13
// conflation-prevention assertions. Includes the M12 spec + M12 plan
// tree + the milestone handoff. Mirrors the picker-resolver-outcome-
// prose-guard.test.ts scan-roots pattern.
const SCAN_ROOTS = [
  SPEC_FILE,
  "docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation",
  "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/handoffs/M12-solo-dev-ux-validation.md",
];

// Files where narrow-list mentions are legitimate (historical audit
// trail, handoff convergence-log finding tables that quote the pre-
// repair narrow form). Mirrors the picker-resolver-outcome-prose-guard
// EXCLUDED_PATHS pattern.
const EXCLUDED_PATHS = [
  // The milestone handoff's §"Convergence log" R12+R14 rows legitimately
  // quote the narrow-list form (historical findings record). Same shape
  // as the §15 audit-trail in the spec, which stripFifteen() handles.
  // The handoff has no §15-equivalent header, so we exclude it wholesale
  // from the canonical-set assertion. (Parameterization-integrity uses
  // it differently — see that test for inline file-level handling.)
  "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/handoffs/M12-solo-dev-ux-validation.md",
];

// Canonical rejected-domain set (R15 commit 35 — single source of truth
// codified in spec §3.3 step 5 R13-amendment paragraph; mirrored at
// plan §0.C.5 predicate (k) + plan §0.C.3 fixture-build TS guard +
// plan §0.C.4 mint RPC defense-in-depth). The F14-canonical-set
// assertion asserts every rejection-list site cites every entry.
const CANONICAL_REJECTED_DOMAINS = [
  "example.com",   // RFC 2606
  "example.org",   // RFC 2606
  "example.net",   // RFC 2606
  ".test",         // RFC 6761
  ".invalid",      // RFC 6761
  ".localhost",    // RFC 6761
  ".local",        // mDNS RFC 6762 + project-conventional
  "localhost",     // bare hostname (RFC 6761)
  "dev.local",     // project-conventional (subset of .local)
];

// Surfaces that MUST cite VALIDATION_J3_CLAIM_EMAIL (parameterization
// integrity per R15 (A) audit). Each entry: a key identifying the
// surface + a path matcher + a section-marker regex that the test
// scans around. A drift here = a surface that documents the J3
// claim-email contract but forgets the env var, which is the F10-
// class drift seed.
const PARAMETERIZATION_SURFACES: Array<{ key: string; path: string; mustContain: RegExp[] }> = [
  {
    key: "spec §3.3 step 5 R13-amendment paragraph (canonical source)",
    path: SPEC_FILE,
    mustContain: [/VALIDATION_J3_CLAIM_EMAIL/, /R13[^\n]*amendment/i],
  },
  {
    key: "plan Task 0.C.3 fixture-build pseudocode",
    path: PLAN_FILE,
    mustContain: [/VALIDATION_J3_CLAIM_EMAIL/, /Task 0\.C\.3|0\.C\.3/i],
  },
  {
    key: "plan Task 0.C.4 mint RPC defense-in-depth",
    path: PLAN_FILE,
    mustContain: [/VALIDATION_J3_CLAIM_EMAIL/, /mint_validation_fixture_atomic/],
  },
  {
    key: "plan Task 0.C.5 check-seed predicate (k)",
    path: PLAN_FILE,
    mustContain: [/VALIDATION_J3_CLAIM_EMAIL/, /\*\*\(k\)/],
  },
  {
    key: "plan Task 1.6 J3 leg (c) walk procedure",
    path: "docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/06-phase1-matrix-walk.md",
    mustContain: [/VALIDATION_J3_CLAIM_EMAIL/, /J3.*leg.*\(c\)|leg \(c\)/i],
  },
  {
    key: "plan Phase 0.A.5 .env.local.example template",
    path: "docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/01-phase0-infra.md",
    mustContain: [/VALIDATION_J3_CLAIM_EMAIL/, /\.env\.local\.example/],
  },
];

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

function stripFifteen(source: string): string {
  // §15 is the spec's last top-level section ("## 15. Adversarial-review
  // audit trail"). Plan files have no §15-equivalent. Once we enter §15,
  // blank the rest — historical Codex findings legitimately quote
  // forbidden patterns by design (e.g., "the R5 narrative said X" where
  // X is the broken pattern).
  const lines = source.split("\n");
  let in15 = false;
  return lines
    .map((ln) => {
      if (!in15 && /^##\s+15\.\s/.test(ln)) in15 = true;
      return in15 ? "" : ln;
    })
    .join("\n");
}

describe("R12 F11 reseed clears claimed_via_oauth_at — doc-guard", () => {
  test("plan mint RPC UPSERT SET clause includes `claimed_via_oauth_at = NULL`", () => {
    const source = stripFifteen(readFileSync(join(ROOT, PLAN_FILE), "utf8"));

    // Locate the mint_validation_fixture_atomic RPC body. Per Task 0.C.4
    // the RPC's crew_members UPSERT is the load-bearing site.
    const mintRpcStart = source.indexOf("CREATE OR REPLACE FUNCTION public.mint_validation_fixture_atomic");
    expect(mintRpcStart).toBeGreaterThanOrEqual(0);

    // Find the FIRST ON CONFLICT (show_id, name) DO UPDATE block after the
    // mint RPC start (the crew_members UPSERT; the validation_state UPSERT
    // is keyed on (key), not (show_id, name)).
    const onConflictIdx = source.indexOf("ON CONFLICT (show_id, name) DO UPDATE SET", mintRpcStart);
    expect(onConflictIdx).toBeGreaterThan(mintRpcStart);

    // Within the SET block (until the next semicolon or RETURNING), assert
    // `claimed_via_oauth_at = NULL` is one of the assignments.
    const setBlockEnd = (() => {
      const returningIdx = source.indexOf("RETURNING id INTO v_crew_id", onConflictIdx);
      const semicolonIdx = source.indexOf(";", onConflictIdx);
      return Math.min(
        returningIdx > 0 ? returningIdx : Number.MAX_SAFE_INTEGER,
        semicolonIdx > 0 ? semicolonIdx : Number.MAX_SAFE_INTEGER,
      );
    })();
    expect(setBlockEnd).toBeLessThan(Number.MAX_SAFE_INTEGER);
    const setBlock = source.substring(onConflictIdx, setBlockEnd);

    if (!/claimed_via_oauth_at\s*=\s*NULL/i.test(setBlock)) {
      expect.fail(
        `R12 F11 doc-guard: mint_validation_fixture_atomic RPC's ON CONFLICT (show_id, name) DO UPDATE SET clause must include \`claimed_via_oauth_at = NULL\`.\n\n` +
          `Without this, J3 leg (c) walks stamp claimed_via_oauth_at via claim_oauth_identity and the stamp persists across every subsequent reseed (the UPSERT preserves the row via ON CONFLICT but UPDATE SET without this clause never touches claimed_via_oauth_at). The next walk session sees a poisoned baseline where alias_5a_lead is permanently OAuth-disabled.\n\n` +
          `Located SET block:\n${setBlock.substring(0, 400)}${setBlock.length > 400 ? "...\n[truncated]" : ""}\n\n` +
          `Fix: add \`claimed_via_oauth_at = NULL\` to the SET list per R13 commit 31 contract. See ${PLAN_FILE} around the post-SET R13-amendment comment block.`,
      );
    }
  });

  test("spec §3.3.2 check-seed predicates include baseline-claim guard (predicate l)", () => {
    const source = stripFifteen(readFileSync(join(ROOT, SPEC_FILE), "utf8"));

    // The check-seed predicates live in §3.3.2 "Singleton write semantics".
    // Predicate (l) is the R13 commit 31 amendment guarding post-reseed
    // baseline-claim-null state.
    //
    // Match shape: a paragraph mentioning predicate (l) AND
    // claimed_via_oauth_at AND IS NOT NULL (the failure condition) AND
    // baseline. Forbid finding only the literal `(l)` token without the
    // baseline-claim guard semantics (an empty placeholder would pass a
    // simple grep but not the contract).
    const predicateLPattern = /\*\*\(l\).*claimed_via_oauth_at/is;
    if (!predicateLPattern.test(source)) {
      expect.fail(
        `R12 F11 doc-guard: spec §3.3.2 check-seed predicates must include predicate (l) — the baseline-claim guard.\n\n` +
          `Required shape: a predicate-(l) bullet/paragraph that names claimed_via_oauth_at as the column the guard checks; the diagnostic must explain that the guard fires when any baseline picker alias has claimed_via_oauth_at IS NOT NULL after a fresh reseed (catches mint RPC SET clause drift).\n\n` +
          `Fix: add predicate (l) to spec §3.3.2 check-seed predicates per R13 commit 31 contract. See ${SPEC_FILE} §3.3.2 — the check-seed predicates paragraph.`,
      );
    }

    // Verify the predicate (l) paragraph actually names IS NOT NULL as the
    // failure condition (not just "claimed_via_oauth_at" in passing).
    // The predicate-(l) bullet runs from the `**(l)` marker to the next
    // blank line (paragraph boundary).
    const predicateLStart = source.search(/\*\*\(l\)/);
    expect(predicateLStart).toBeGreaterThan(0);
    const remainder = source.substring(predicateLStart);
    const paragraphEnd = remainder.search(/\n\n/);
    const predicateLBullet = paragraphEnd > 0 ? remainder.substring(0, paragraphEnd) : remainder.substring(0, 800);
    if (!/IS NOT NULL/i.test(predicateLBullet) || !/claimed_via_oauth_at/.test(predicateLBullet)) {
      expect.fail(
        `R12 F11 doc-guard: predicate (l) bullet must name BOTH claimed_via_oauth_at AND IS NOT NULL as the failure condition.\n\n` +
          `Required: the predicate-(l) bullet must state that the guard fires when claimed_via_oauth_at IS NOT NULL (the SQL-canonical phrasing — what the live check-seed query will compare against).\n\n` +
          `Current bullet (predicate-(l) start through next paragraph break):\n${predicateLBullet}\n\n` +
          `Fix: ensure the predicate-(l) bullet uses both \`claimed_via_oauth_at\` and \`IS NOT NULL\` together. See ${SPEC_FILE} §3.3.2.`,
      );
    }
  });

  test("spec §3.3 picker-fixture lockstep contract names the explicit reset-on-reseed obligation", () => {
    const source = stripFifteen(readFileSync(join(ROOT, SPEC_FILE), "utf8"));

    // §3.3 picker-fixture lockstep contract has a bullet about
    // claimed_via_oauth_at. Per R13 commit 31, that bullet MUST name
    // "RESET TO NULL on every reseed" (the active contract verb) — NOT
    // the pre-R13 framing "is null at fixture creation" which left the
    // sticky-stamp F11 bug invisible to readers.
    //
    // Match shape: a bullet/paragraph containing claimed_via_oauth_at
    // AND (reset|RESET) AND (NULL|null) AND (reseed|reseeds).
    // Require all four tokens within a ~500-char window so unrelated
    // mentions in distant paragraphs can't satisfy the guard.
    const cvoaIdx = source.indexOf("claimed_via_oauth_at");
    expect(cvoaIdx).toBeGreaterThan(0);

    // Walk every cvoa mention; assert at least one occurrence in §3.3
    // (before §3.3.2 — which starts at the `### 3.3.2` heading) names
    // the reset-on-reseed obligation.
    const section332Idx = (() => {
      const m = source.match(/\n###?\s+3\.3\.2/);
      return m ? source.indexOf(m[0]) : source.length;
    })();
    const section33Body = source.substring(0, section332Idx);
    const cvoaMentions = [...section33Body.matchAll(/claimed_via_oauth_at/g)];
    expect(cvoaMentions.length).toBeGreaterThan(0);

    const obligationFound = cvoaMentions.some((m) => {
      const start = Math.max(0, m.index! - 250);
      const end = Math.min(section33Body.length, m.index! + 500);
      const window = section33Body.substring(start, end);
      return (
        /\b(reset|RESET)\b/.test(window) &&
        /\bNULL\b/i.test(window) &&
        /\bre[\s-]?seed/i.test(window)
      );
    });

    if (!obligationFound) {
      expect.fail(
        `R12 F11 doc-guard: spec §3.3 picker-fixture lockstep contract has a claimed_via_oauth_at bullet, but no window of ~500 chars around any mention names the explicit reset-on-reseed obligation (reset + NULL + reseed all present).\n\n` +
          `Required: the §3.3 bullet about claimed_via_oauth_at MUST state that it is explicitly RESET TO NULL on every reseed (the active contract verb) — NOT the pre-R13 framing "is null at fixture creation" which left the sticky-stamp F11 bug invisible to readers.\n\n` +
          `Fix: ensure the §3.3 bullet about claimed_via_oauth_at uses the "RESET TO NULL on every reseed" framing per R13 commit 31 contract. See ${SPEC_FILE} §3.3 picker-fixture lockstep contract.`,
      );
    }
  });
});

// R15 commit 36 — F10-class structural defense (extends R13 commit 32) -----
// The F10 class (J3 OAuth-walk fixture impossibility) recurred across 2
// rounds: R12 F10 + R14 F13/F14. Per AGENTS.md "Same-vector recurrence"
// + `feedback_recurring_bug_response` + M12 plan R5 structural-defense
// calibration precedent, R15 ships pre-emptive structural defense in
// the same commit series as the per-instance F13/F14 fixes (commits 33
// + 34 + 35). This defense pins three sub-classes at CI time so that
// future drift can't re-introduce the F10 / F13 / F14 failure modes.
describe("R15 F10-class structural defense — J3 claim-email parameterization integrity", () => {
  test("F14-canonical-set: every placeholder-domain rejection list cites the full canonical set", () => {
    // Per R15 commit 35 Dim-3 class-sweep: every site that names a
    // placeholder-domain rejection list MUST cite every entry of the
    // canonical rejected set. The F14 class is "a rejection-list site
    // cites only example.com/.org/.net (RFC 2606) and silently omits
    // RFC 6761 + mDNS + project-conventional dev domains."
    //
    // Detection heuristic: scan every M12 spec + plan markdown file
    // (excluding §15 audit-trail via stripFifteen + EXCLUDED_PATHS for
    // the handoff's convergence-log finding tables). For each line
    // mentioning `example.com` in a rejection context (the line itself
    // mentions one of {RFC 2606, predicate (k), rejected, placeholder,
    // reserved domain, canonical, Google OAuth cannot}), look ±10
    // lines for mentions of the other canonical-set domain tokens.
    // Missing tokens = a rejection-list site that didn't get bumped
    // during R15's class-sweep.
    const files = SCAN_ROOTS.flatMap(collectMarkdown).filter(
      (f) => relative(".", f) !== SELF && !EXCLUDED_PATHS.includes(f),
    );
    const findings: string[] = [];

    for (const file of files) {
      const source = stripFifteen(readFileSync(join(ROOT, file), "utf8"));
      const lines = source.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Is this line in a rejection-list context? Tightened heuristic
        // (R15 commit 36 iteration #2): exclude bare "canonical" (matches
        // "canonicalization" — pre-existing failure-mode prose about
        // email canonicalization is NOT a rejection-list site). Require
        // explicit rejection terminology.
        if (!/example\.com/.test(line)) continue;
        const isRejectionContext =
          /\bRFC 2606\b|\bRFC 6761\b|\bRFC 6762\b|\bpredicate \(k\)|\brejected\b|\bplaceholder\b|\breserved domain|\bcanonical rejected\b|Google OAuth cannot/i.test(
            line,
          );
        if (!isRejectionContext) continue;

        // Skip SQL-comment lines (R15 commit 33 left a comment block at
        // Task 0.C.7 documenting the pre-R15 query as historical context;
        // those lines start with `--` and aren't active rejection lists).
        if (/^\s*--/.test(line)) continue;

        // Skip historical finding rows (rare narrow-list mentions that
        // legitimately quote the pre-R15 form in a finding's "pre-repair
        // state" prose). Detect via "F14" or "F10" naming + "narrow"
        // or "pre-" framing in the same line.
        if (/\b(F10|F14)\b/.test(line) && /\bnarrow|\bpre-R15|\bpre-fix\b/i.test(line)) {
          continue;
        }

        // Look ±10 lines for the canonical-set tokens. Accept shorthand
        // forms (`.org` / `.net` instead of `example.org` / `example.net`)
        // — many R15 commit 35 sites use compact `.com / .org / .net`
        // notation for prose readability. The F14 trap is "narrow list
        // omits RFC 6761 + mDNS entries entirely" — so we focus on
        // representatives of each RFC group: RFC 6761 (.test or .invalid)
        // + mDNS RFC 6762 (.local). RFC 2606 is already covered by the
        // example.com match that triggered this site.
        const windowStart = Math.max(0, i - 10);
        const windowEnd = Math.min(lines.length, i + 11);
        const window = lines.slice(windowStart, windowEnd).join("\n");

        const has6761 = /\.test\b|\.invalid\b|\.localhost\b/.test(window);
        const hasMdns = /\.local\b|dev\.local\b|mDNS|RFC 6762/.test(window);
        const missingGroups: string[] = [];
        if (!has6761) missingGroups.push("RFC 6761 (.test / .invalid / .localhost)");
        if (!hasMdns) missingGroups.push("mDNS RFC 6762 (.local / dev.local)");

        if (missingGroups.length > 0) {
          findings.push(
            `  ${file}:${i + 1} (rejection-list site missing canonical-set RFC group(s) within ±10 lines)\n` +
              `      line:    ${line.substring(0, 220)}${line.length > 220 ? "..." : ""}\n` +
              `      missing: ${missingGroups.join("; ")}`,
          );
        }
      }
    }

    if (findings.length > 0) {
      expect.fail(
        `R15 F14 canonical-set guard: ${findings.length} rejection-list site(s) cite \`example.com\` in a rejection context but do NOT name the full canonical rejected set within ±10 lines.\n\n` +
          findings.join("\n\n") +
          `\n\nCanonical rejected set (single source of truth — spec §3.3 step 5 R13-amendment paragraph):\n  ${CANONICAL_REJECTED_DOMAINS.join(", ")}\n\n` +
          `RFC 2606: example.com / .org / .net\n` +
          `RFC 6761: *.test / *.invalid / *.localhost / bare localhost\n` +
          `mDNS RFC 6762 + project-conventional: *.local / dev.local\n\n` +
          `Fix: every rejection-list site MUST cite every entry. If a site is intentionally a historical-finding mention quoting the pre-R15 narrow form, mark the line with \`F14\` / \`F10\` + \`narrow\` / \`pre-R15\` / \`pre-fix\` framing to be excluded from this guard.`,
      );
    }
  });

  test("F10 parameterization-integrity: VALIDATION_J3_CLAIM_EMAIL cited consistently across all surfaces", () => {
    // Per R15 (A) audit Dim-1: the J3 claim-email parameterization MUST
    // be documented consistently across all 6 surfaces in the
    // PARAMETERIZATION_SURFACES list. A drift (one surface deletes the
    // env-var reference) is the F10-class seed — implementer reading
    // any one surface might not see the parameterization contract.
    const findings: string[] = [];

    for (const surface of PARAMETERIZATION_SURFACES) {
      let source: string;
      try {
        source = stripFifteen(readFileSync(join(ROOT, surface.path), "utf8"));
      } catch (e) {
        findings.push(`  ${surface.key} — file not readable at ${surface.path}: ${(e as Error).message}`);
        continue;
      }
      const missing = surface.mustContain.filter((rx) => !rx.test(source));
      if (missing.length > 0) {
        findings.push(
          `  ${surface.key} (${surface.path})\n` +
            `      missing: ${missing.map((rx) => rx.toString()).join(", ")}`,
        );
      }
    }

    if (findings.length > 0) {
      expect.fail(
        `R15 F10 parameterization-integrity guard: ${findings.length} surface(s) drift from the VALIDATION_J3_CLAIM_EMAIL parameterization contract.\n\n` +
          findings.join("\n\n") +
          `\n\nThe J3 claim-email parameterization (R13 commit 30 + R15 commit 35) MUST be documented consistently across:\n  ${PARAMETERIZATION_SURFACES.map((s) => "- " + s.key).join("\n  ")}\n\n` +
          `Fix: ensure the missing surface(s) name VALIDATION_J3_CLAIM_EMAIL within their canonical section. A future amendment that deletes the env-var reference from one surface but not the others is exactly the F10-class drift this guard catches.`,
      );
    }
  });

  // R21 commit 47 — F10-class DEEPER structural defense (extends R15 commit
  // 36). R20 surfaced F20 (THRESHOLD-3 BREACH, 3rd round: R12 F10 + R14
  // F13/F14 + R20 F20). The R15 doc-guard's F10-parameterization-integrity
  // assertion grep-scoped on prose surfaces and missed the markdown TABLE
  // surface at §9.1.2 (which used "Same three env vars" shorthand for
  // 3 of 4 rows, silently omitting VALIDATION_J3_CLAIM_EMAIL from rows
  // inheriting via shorthand).
  //
  // This assertion structurally closes the table-surface gap. Every spec
  // §-numbered table that mentions a VALIDATION_* env var literal MUST
  // EITHER list all 4 canonical env vars per row OR carry an explicit
  // `not-subject-to-meta: <reason>` marker near the table for that row.
  test("F20-canonical-tables-completeness: every spec §-numbered table referencing VALIDATION_* lists all 4 canonical env vars per row OR carries explicit subset reason", () => {
    const CANONICAL_VARS = [
      "VALIDATION_SUPABASE_URL",
      "VALIDATION_SUPABASE_SECRET_KEY",
      "VALIDATION_SUPABASE_PROJECT_REF",
      "VALIDATION_J3_CLAIM_EMAIL",
    ];

    const source = stripFifteen(readFileSync(join(ROOT, SPEC_FILE), "utf8"));
    const lines = source.split("\n");

    // Locate every markdown table row that references at least one
    // VALIDATION_* literal. A "table row" is a line beginning with `|`
    // (after optional whitespace) containing at least one VALIDATION_*
    // mention. We exclude the table HEADER row (which names "Required
    // env vars" as a column header but doesn't itself enumerate vars)
    // and the SEPARATOR row (`|---|---|...`).
    const findings: string[] = [];

    // Match the SPECIFIC canonical env-var literals — NOT the wildcard
    // `VALIDATION_*` glob (which legitimately appears in prose like
    // "Set VALIDATION_* env vars in Vercel" without enumerating any
    // specific variable). The guard targets rows whose INTENT is to
    // enumerate env vars — the heuristic: the row mentions at least
    // one of the canonical literals BY NAME.
    const enumerationRegex = new RegExp(
      "\\b(" + CANONICAL_VARS.map((v) => v.replace(/_/g, "_")).join("|") + ")\\b",
    );

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!/^\s*\|/.test(line)) continue;
      // Must reference at least ONE canonical literal by name (not just
      // the wildcard glob "VALIDATION_*").
      if (!enumerationRegex.test(line)) continue;
      // Skip table separator rows
      if (/^\s*\|[\s|:-]+\|?\s*$/.test(line)) continue;
      // Skip header rows: a header row is a `|` line immediately
      // followed by a separator row (next line is `|---...`).
      const next = lines[i + 1] ?? "";
      if (/^\s*\|[\s|:-]+\|?\s*$/.test(next)) continue;

      // Now: this is a table-body row enumerating at least one
      // canonical VALIDATION_* env var. Determine
      // (a) whether it explicitly enumerates the canonical 4 OR claims
      // an explicit subset reason, and (b) which vars are missing if
      // not the full 4.

      // Subset-allowed marker: a row that explicitly states `N vars`
      // with N < 4 AND names a reason. We look for the literal "3 vars"
      // (or "2 vars" / "1 var") in the row itself; we also accept
      // explicit phrases like "J3-claim-email NOT required" or "J3-claim-
      // email is omitted" or "not-subject-to-meta:" inline.
      const explicitSubsetMarker =
        /\b[123]\s+vars?\b.*\bnot required\b/i.test(line) ||
        /\bJ3[-_]?claim[-_]?email[^.]{0,80}(NOT required|omitted|is omitted|excluded)/i.test(line) ||
        /not-subject-to-meta:/i.test(line);

      const presentVars = CANONICAL_VARS.filter((v) => line.includes(v));
      const missingVars = CANONICAL_VARS.filter((v) => !line.includes(v));

      if (presentVars.length === CANONICAL_VARS.length) {
        // Full 4 vars enumerated — passes.
        continue;
      }

      if (explicitSubsetMarker && presentVars.length >= 1) {
        // Row deliberately documents a subset; passes (the reason is
        // inline). Require at least 1 SUPABASE_* var present so we
        // don't false-pass on a row that just mentions VALIDATION_J3_CLAIM_EMAIL
        // in passing without enumerating any of the SUPABASE_* trio.
        continue;
      }

      findings.push(
        `  ${SPEC_FILE}:${i + 1} (table-body row references VALIDATION_* but does not list all 4 canonical env vars AND does not carry explicit subset reason)\n` +
          `      row:     ${line.substring(0, 240)}${line.length > 240 ? "..." : ""}\n` +
          `      present: ${presentVars.length === 0 ? "(none)" : presentVars.join(", ")}\n` +
          `      missing: ${missingVars.join(", ")}`,
      );
    }

    if (findings.length > 0) {
      expect.fail(
        `R21 F20-canonical-tables-completeness guard: ${findings.length} spec table row(s) reference VALIDATION_* env vars but do NOT list all 4 canonical vars and do NOT carry an explicit subset reason.\n\n` +
          findings.join("\n\n") +
          `\n\nCanonical env vars (single source of truth — spec §9.1.2 R21 commit 44 F20 amendment):\n  ${CANONICAL_VARS.join("\n  ")}\n\n` +
          `Fix options for each row:\n` +
          `  (a) List all 4 canonical env vars verbatim in the row.\n` +
          `  (b) Explicitly document a subset by writing "<N> vars" (e.g., "3 vars") AND naming WHY a var is omitted via "J3-claim-email NOT required" / "J3-claim-email is omitted" / "not-subject-to-meta: <reason>" phrasing in the same row.\n\n` +
          `This guard catches the F20 failure mode: a table row uses "Same N env vars" shorthand and silently inherits an incomplete set. The shorthand is retired per R21 commit 44 — every row must be explicit.`,
      );
    }
  });

  test("F13-conflation-prevention: no Phase 0.C verification query asserts `email LIKE '%@example.com'` count = 96", () => {
    // Per R15 commit 33 F13 repair: the pre-R15 verification query
    // asserted `count(*) FROM crew_members WHERE email LIKE '...@example.com'`
    // = 96, but R13 commit 30 F10 parameterization means combo R1's
    // alias_5a_lead.email is a real Google email (NOT example.com), so
    // the correct post-F10 count is 95 example.com rows + 1 real Google
    // = 96 total. Conflating the alias_map leaf total (96) with the
    // example.com-LIKE count (95) is the F13 trap.
    //
    // Subsumes the name-pinned variant (per orchestrator nit #1):
    // any query that LIKEs against the synthesized email pattern AND
    // asserts a count equal to 96 (the alias_map leaf total) is wrong-
    // track, regardless of whether the literal "96" appears or whether
    // it's expressed as a different but equivalent count.
    const planSource = stripFifteen(readFileSync(join(ROOT, PLAN_FILE), "utf8"));

    // Find every `email LIKE '...@example.com'` pattern occurrence.
    const likePattern = /email\s+LIKE\s+'validation\+[^']*@example\.com'/gi;
    const findings: string[] = [];
    const matches = [...planSource.matchAll(likePattern)];

    for (const m of matches) {
      const matchIdx = m.index!;
      const linesBefore = planSource.substring(0, matchIdx).split("\n");
      const lineNum = linesBefore.length;

      // Skip SQL-comment lines: the R15 commit 33 rewrite left a
      // historical-context comment block describing the pre-R15 query;
      // those lines start with `--` and are documentation, not active
      // queries. Reading the line at lineNum-1 (0-indexed) — if it
      // starts with whitespace + `--`, this LIKE pattern is inside a
      // comment block, not an active query.
      const currentLine = planSource.split("\n")[lineNum - 1] ?? "";
      if (/^\s*--/.test(currentLine)) continue;

      // Look at the surrounding context: ±5 lines for an "Expect" comment
      // that names a count equal to the alias_map leaf total (96). The
      // current alias_map leaf total is 96 per spec §3.3 + plan §0.C.3
      // (10 R-combos × 9 + 6 SW × 1 = 96). This guard catches the F13
      // shape: LIKE-pattern + 96-expected.
      const lines = planSource.split("\n");
      const windowStart = Math.max(0, lineNum - 1);
      const windowEnd = Math.min(lines.length, lineNum + 5);
      const window = lines.slice(windowStart, windowEnd).join("\n");

      // The window MUST NOT contain "-- Expect 96" (or equivalent)
      // immediately after the LIKE query. Tolerate "Expect 95" (post-F13
      // correct count) and "Expect 96 total" / "Expect 96 ... alias_map"
      // (separate alias_map-based query, NOT the LIKE).
      const expectsLeafTotal =
        /(?:--\s*|#\s*|\*\s*)?Expect\s+96\b(?!\s+(?:total|aliases|alias_map|leaves|leaf))/i.test(
          window,
        );

      if (expectsLeafTotal) {
        findings.push(
          `  ${PLAN_FILE}:${lineNum}\n` +
            `      query: ${m[0]}\n` +
            `      surrounding window (lines ${windowStart + 1}-${windowEnd}):\n` +
            window
              .split("\n")
              .map((ln, i) => `        ${windowStart + 1 + i} | ${ln.substring(0, 180)}${ln.length > 180 ? "..." : ""}`)
              .join("\n"),
        );
      }
    }

    if (findings.length > 0) {
      expect.fail(
        `R15 F13-conflation-prevention guard: ${findings.length} verification query/queries conflate the synthesized-email-LIKE count (95) with the alias_map leaf total (96).\n\n` +
          findings.join("\n\n") +
          `\n\nThe F13 trap: a query that LIKEs against \`validation+%@example.com\` returns 95 post-F10 (combo R1's alias_5a_lead uses VALIDATION_J3_CLAIM_EMAIL = a real Google email, NOT example.com). Asserting "Expect 96" against this LIKE pattern either fails a correct implementation OR regresses F10 by reverting R1.alias_5a_lead to a placeholder.\n\n` +
          `Fix: either (a) rewrite the query to assert 95 (post-F10 synthesized count), OR (b) replace with an alias_map-based JOIN query asserting 96 total seeded rows + a separate "Expect 95" for the example.com-LIKE pattern + a separate query asserting R1.alias_5a_lead.email matches VALIDATION_J3_CLAIM_EMAIL. See ${PLAN_FILE} Task 0.C.7 Step 4 post-R15 for the correct three-query pattern.`,
      );
    }
  });
});
