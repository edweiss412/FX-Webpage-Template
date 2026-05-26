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

// R23 commit 50 F24 — anti-tautology repair for the R21 F20 canonical-
// tables-completeness assertion. Pre-R23 the assertion accepted any
// subset row that listed >=1 canonical var; the F24 finding showed
// that a row claiming "3 vars; J3-claim-email NOT required" but
// naming only 1 of the 3 required SUPABASE_* vars passes silently —
// the same incomplete-CLI-contract class the guard was meant to
// prevent.
//
// The repair: derive the required-vars set from the row's stated
// reason. If the row claims a numeric cardinality ("4 vars" / "3 vars"
// / "2 vars" / "1 var"), the named canonical literals MUST equal
// that count. If the row carries an omission reason ("J3-claim-email
// NOT required" / "J3-claim-email is omitted"), the expected set is
// the canonical 4 minus VALIDATION_J3_CLAIM_EMAIL — i.e., all 3
// SUPABASE_* vars MUST appear. The "not-subject-to-meta: <reason>"
// waiver still passes (the inline reason justifies the deviation).
//
// Returns null if the row passes; otherwise a finding object with
// the offending reason + present/missing var lists. Exported as a
// pure function so the F24 negative-case test can exercise it
// directly against synthetic broken/valid fixture rows without
// having to mutate the live spec.
type CanonicalRowFinding = {
  reason: string;
  presentVars: string[];
  missingVars: string[];
};

// R25 commit 54 — F10-class CONTRACT-LEVEL structural defense.
// F10-class hit 4 rounds (R12 F10 + R14 F13/F14 + R20 F20 + R24 F25).
// Per AGENTS.md "Structural-defense calibration (M12 plan R5 amendment)"
// the prior per-syntactic-form defenses (R15 prose grep; R21 spec-table
// row scan) were each correct WITHIN their scoped surface but the class
// is broader: env-var contract drift can land in plan task lists, code-
// fenced .env.local.example templates, plan prose, commit-template
// blocks, etc. R25 ships a single contract-level walker:
//
//   1. SOURCE OF TRUTH: spec §9.1.2 is the canonical per-CLI env-var
//      table. Other surfaces either (a) reproduce a row of that
//      table (validated by F20 already), (b) cross-reference §9.1.2
//      (must say so explicitly within a window of the enumeration),
//      or (c) carry their own enumeration which must list all 4
//      canonical vars OR carry a recognised subset reason.
//
//   2. CLUSTER DETECTION: a "cluster" is a line that names at least
//      one canonical VALIDATION_* literal AND occurs within an
//      enumeration context. The enumeration-context signal is
//      EITHER (i) the same line names ≥2 distinct canonical literals
//      (a comma/list shape), OR (ii) the line contains an
//      enumeration phrase like "required env vars" / "env vars
//      per" / "MUST be set" / "all four" / "all 4" / "four
//      VALIDATION_*" within ±2 lines of the canonical literal.
//      Single-var citations (e.g., the line throwing
//      `VALIDATION_SUPABASE_URL is required`) do NOT trigger the
//      walker — they're not env-var contract enumerations.
//
//   3. CROSS-REF VS OWN-ENUMERATION: within a ±10 line window of
//      the cluster line, look for cross-reference phrasing like
//      "spec §9.1.2", "canonical CLI env-var map", "canonical per-
//      CLI env-var", "see §9.1.2 for". If present AND the cluster
//      cardinality matches the §9.1.2 row's contract OR the
//      enumeration uses subset markers consistent with a §9.1.2
//      cross-reference, PASS. Otherwise apply
//      `evaluateCanonicalEnvVarCluster()` (a sibling of
//      `evaluateCanonicalTableRow()` adapted for non-table contexts).
//
// This walker generalises the R21 F20 / R23 F24 helper so future
// F10-class drift fails CI regardless of syntactic form.

type ClusterFinding = {
  reason: string;
  presentVars: string[];
  missingVars: string[];
};

// Sibling of `evaluateCanonicalTableRow()` adapted for non-table
// contexts. Operates on a "cluster window" string (the line under
// inspection PLUS surrounding ±2 lines for cardinality / J3-
// omission / waiver markers, since prose enumerations sometimes
// split the cardinality marker from the var list across adjacent
// lines or formatting tokens).
// R27 commit 59 — RETIRED. The R25 contract-level walker used this
// helper for per-cluster satisfiability checks (full 4 / waiver / valid
// subset). R27's structural-exclusivity walker SUPERSEDES that model —
// any own-enumeration outside the two authorized surfaces fails
// unconditionally, no satisfiability check needed. The helper is kept
// for historical reference (the R25 commit 54 design rationale comment
// block at line 794 above cites it) but marked unused with a `_` prefix
// to satisfy lint. If a future amendment ever re-introduces a
// satisfiability model, this is the starting point.
function _evaluateCanonicalEnvVarCluster_retired_R27(
  clusterWindow: string,
  canonicalVars: readonly string[],
): ClusterFinding | null {
  const presentVars = canonicalVars.filter((v) => clusterWindow.includes(v));
  const missingVars = canonicalVars.filter((v) => !clusterWindow.includes(v));

  // Pass 1: cluster enumerates all 4 canonical vars verbatim within
  // the window — passes.
  if (presentVars.length === canonicalVars.length) {
    return null;
  }

  // Pass 2: cluster carries the explicit "not-subject-to-meta: <reason>"
  // waiver — passes.
  if (/not-subject-to-meta:/i.test(clusterWindow)) {
    return null;
  }

  // Subset semantics: cluster claims a smaller cardinality + names a
  // reason. Parse out the stated cardinality + the J3-claim-email
  // omission marker.
  const cardinalityMatch = clusterWindow.match(/\b([1-4])\s+vars?\b/i);
  const claimedCardinality = cardinalityMatch ? Number.parseInt(cardinalityMatch[1], 10) : null;
  const j3ClaimEmailOmitted =
    /\bJ3[-_]?claim[-_]?email[^.]{0,80}(NOT required|omitted|is omitted|excluded)/i.test(
      clusterWindow,
    );

  // Without ANY subset marker (no cardinality, no J3 omission, no
  // waiver), the cluster has fewer than 4 vars and no justification —
  // fails per contract-level (R25 commit 54) extension of R21 F20.
  if (claimedCardinality === null && !j3ClaimEmailOmitted) {
    return {
      reason:
        "env-var enumeration cluster references VALIDATION_* but does not list all 4 canonical env vars AND does not carry an explicit subset marker (cardinality '<N> vars' OR 'J3-claim-email NOT required' OR 'not-subject-to-meta: <reason>')",
      presentVars,
      missingVars,
    };
  }

  if (j3ClaimEmailOmitted) {
    // Required set = canonical 4 minus J3_CLAIM_EMAIL. ALL 3
    // SUPABASE_* vars must be present in the cluster window.
    const requiredSet = canonicalVars.filter((v) => v !== "VALIDATION_J3_CLAIM_EMAIL");
    const missingFromRequired = requiredSet.filter((v) => !clusterWindow.includes(v));
    if (missingFromRequired.length > 0) {
      return {
        reason: `cluster claims "J3-claim-email NOT required" / omitted (3 SUPABASE_* vars required) but ${missingFromRequired.length} required var(s) absent`,
        presentVars,
        missingVars: missingFromRequired,
      };
    }
    if (claimedCardinality !== null && presentVars.length !== claimedCardinality) {
      return {
        reason: `cluster claims "${claimedCardinality} vars" but ${presentVars.length} canonical literal(s) present — cardinality mismatch (anti-tautology guard)`,
        presentVars,
        missingVars,
      };
    }
    return null;
  }

  // Cardinality stated without J3 omission marker: count of named
  // canonical literals MUST equal stated cardinality.
  if (claimedCardinality !== null && presentVars.length !== claimedCardinality) {
    return {
      reason: `cluster claims "${claimedCardinality} vars" but ${presentVars.length} canonical literal(s) present — cardinality mismatch`,
      presentVars,
      missingVars,
    };
  }

  return null;
}

function evaluateCanonicalTableRow(
  line: string,
  canonicalVars: readonly string[],
): CanonicalRowFinding | null {
  const presentVars = canonicalVars.filter((v) => line.includes(v));
  const missingVars = canonicalVars.filter((v) => !line.includes(v));

  // Pass 1: row enumerates all 4 canonical vars verbatim — passes.
  if (presentVars.length === canonicalVars.length) {
    return null;
  }

  // Pass 2: row carries the explicit "not-subject-to-meta: <reason>"
  // waiver — passes (the inline reason justifies the deviation; this
  // is the same escape hatch other meta-tests in this project use).
  if (/not-subject-to-meta:/i.test(line)) {
    return null;
  }

  // Subset semantics: row claims a smaller cardinality + names a
  // reason. Parse out the stated cardinality (if any) and the J3-
  // claim-email omission marker (if any), and derive the required
  // set from those.
  const cardinalityMatch = line.match(/\b([1-4])\s+vars?\b/i);
  const claimedCardinality = cardinalityMatch ? Number.parseInt(cardinalityMatch[1], 10) : null;
  const j3ClaimEmailOmitted =
    /\bJ3[-_]?claim[-_]?email[^.]{0,80}(NOT required|omitted|is omitted|excluded)/i.test(line);

  // Without ANY subset marker (no cardinality, no J3 omission, no
  // waiver), the row has fewer than 4 vars and no justification —
  // fails per R21 F20 contract.
  if (claimedCardinality === null && !j3ClaimEmailOmitted) {
    return {
      reason:
        "table-body row references VALIDATION_* but does not list all 4 canonical env vars AND does not carry an explicit subset marker (cardinality '<N> vars' OR 'J3-claim-email NOT required' OR 'not-subject-to-meta: <reason>')",
      presentVars,
      missingVars,
    };
  }

  // Subset marker is present. Compute the required canonical set
  // from the stated reason:
  //   - if J3-claim-email is explicitly omitted → required set is
  //     canonical 4 minus VALIDATION_J3_CLAIM_EMAIL (the 3 SUPABASE_*
  //     vars). ALL 3 must be present.
  //   - else if cardinality N is stated → exactly N of the canonical
  //     literals must be present (the row names which N it picks).
  //   - else (only the J3 marker, no cardinality) → fall through to
  //     the J3-omission path above.
  const requiredSet: string[] = j3ClaimEmailOmitted
    ? canonicalVars.filter((v) => v !== "VALIDATION_J3_CLAIM_EMAIL")
    : (claimedCardinality !== null
        ? canonicalVars.slice(0, claimedCardinality) // placeholder; cardinality-only rows compared below
        : []);

  if (j3ClaimEmailOmitted) {
    const missingFromRequired = requiredSet.filter((v) => !line.includes(v));
    if (missingFromRequired.length > 0) {
      return {
        reason: `row claims "J3-claim-email NOT required" / omitted (3 SUPABASE_* vars required) but ${missingFromRequired.length} required var(s) absent`,
        presentVars,
        missingVars: missingFromRequired,
      };
    }
    // Optional cross-check: if cardinality is also stated, it must
    // match the count of required vars present.
    if (claimedCardinality !== null && presentVars.length !== claimedCardinality) {
      return {
        reason: `row claims "${claimedCardinality} vars" but ${presentVars.length} canonical literal(s) present — cardinality mismatch (anti-tautology guard)`,
        presentVars,
        missingVars,
      };
    }
    return null;
  }

  // Cardinality stated without J3 omission marker: the count of
  // named canonical literals MUST equal the stated cardinality. This
  // catches "4 vars: <only 3 listed>" or "3 vars: <only 1 listed>"
  // shapes.
  if (claimedCardinality !== null && presentVars.length !== claimedCardinality) {
    return {
      reason: `row claims "${claimedCardinality} vars" but ${presentVars.length} canonical literal(s) present — cardinality mismatch (anti-tautology guard per R23 F24)`,
      presentVars,
      missingVars,
    };
  }

  return null;
}

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

      const findingsForRow = evaluateCanonicalTableRow(line, CANONICAL_VARS);
      if (findingsForRow === null) continue; // row passes

      findings.push(
        `  ${SPEC_FILE}:${i + 1} (${findingsForRow.reason})\n` +
          `      row:     ${line.substring(0, 240)}${line.length > 240 ? "..." : ""}\n` +
          `      present: ${findingsForRow.presentVars.length === 0 ? "(none)" : findingsForRow.presentVars.join(", ")}\n` +
          `      missing: ${findingsForRow.missingVars.join(", ")}`,
      );
    }

    if (findings.length > 0) {
      expect.fail(
        `R21 F20-canonical-tables-completeness guard: ${findings.length} spec table row(s) violate the canonical-tables-completeness contract.\n\n` +
          findings.join("\n\n") +
          `\n\nCanonical env vars (single source of truth — spec §9.1.2 R21 commit 44 F20 amendment):\n  ${CANONICAL_VARS.join("\n  ")}\n\n` +
          `Fix options for each row:\n` +
          `  (a) List all 4 canonical env vars verbatim in the row.\n` +
          `  (b) Explicitly document a subset: write "<N> vars" (e.g., "3 vars") AND name WHY one or more vars are omitted via "J3-claim-email NOT required" / "J3-claim-email is omitted" / "not-subject-to-meta: <reason>" phrasing in the same row, AND list ALL non-omitted canonical vars verbatim in the row.\n\n` +
          `This guard catches the F20 failure mode (Same-N-shorthand silently inheriting an incomplete set) AND the R23 F24 failure mode (anti-tautology gap — a subset row that names only 1 of the 3 required SUPABASE_* vars while claiming "3 vars; J3-claim-email NOT required" silently omits 2 required vars).`,
      );
    }
  });

  // R23 commit 50 F24 anti-tautology negative-case assertion. Pins the
  // subset-cardinality fix at CI time: a synthetic broken row with the
  // explicit subset marker but only 1 of 3 required SUPABASE_* vars
  // MUST fail evaluateCanonicalTableRow(). Without this, the R21 F20
  // assertion silently accepts the broken row (pre-R23 behavior).
  test("F24-canonical-tables-completeness negative case: synthetic broken subset row triggers the assertion", () => {
    const CANONICAL_VARS = [
      "VALIDATION_SUPABASE_URL",
      "VALIDATION_SUPABASE_SECRET_KEY",
      "VALIDATION_SUPABASE_PROJECT_REF",
      "VALIDATION_J3_CLAIM_EMAIL",
    ];

    // Positive cases (rows the assertion SHOULD accept).
    const fullFourCanonical =
      "| `pnpm validation:reseed` | 4 vars: VALIDATION_SUPABASE_URL, VALIDATION_SUPABASE_SECRET_KEY, VALIDATION_SUPABASE_PROJECT_REF, VALIDATION_J3_CLAIM_EMAIL | reseed flow |";
    const validSubsetThreeSupabaseVars =
      "| `pnpm validation:resolve-alias` | 3 vars; J3-claim-email NOT required (read-only): VALIDATION_SUPABASE_URL, VALIDATION_SUPABASE_SECRET_KEY, VALIDATION_SUPABASE_PROJECT_REF | read-only lookup |";

    expect(evaluateCanonicalTableRow(fullFourCanonical, CANONICAL_VARS)).toBeNull();
    expect(evaluateCanonicalTableRow(validSubsetThreeSupabaseVars, CANONICAL_VARS)).toBeNull();

    // Negative case: the row the F24 finding called out. Claims
    // "3 vars; J3-claim-email NOT required" but only names ONE of the
    // 3 required SUPABASE_* vars. Pre-R23 the assertion accepted this;
    // post-R23 the assertion MUST reject it.
    const brokenSubsetRow =
      "| `pnpm validation:resolve-alias` | 3 vars; J3-claim-email NOT required: VALIDATION_SUPABASE_URL | read-only lookup |";
    const brokenResult = evaluateCanonicalTableRow(brokenSubsetRow, CANONICAL_VARS);
    expect(brokenResult).not.toBeNull();
    expect(brokenResult?.missingVars).toContain("VALIDATION_SUPABASE_SECRET_KEY");
    expect(brokenResult?.missingVars).toContain("VALIDATION_SUPABASE_PROJECT_REF");

    // Negative case 2: row claims full 4 vars verbatim but actually
    // omits one — the cardinality reason-parse must catch this.
    const claimsFullButMissingOne =
      "| `pnpm validation:reseed` | 4 vars: VALIDATION_SUPABASE_URL, VALIDATION_SUPABASE_SECRET_KEY, VALIDATION_SUPABASE_PROJECT_REF | reseed flow |";
    const missingOneResult = evaluateCanonicalTableRow(claimsFullButMissingOne, CANONICAL_VARS);
    expect(missingOneResult).not.toBeNull();
    expect(missingOneResult?.missingVars).toContain("VALIDATION_J3_CLAIM_EMAIL");

    // Negative case 3: subset marker present but ZERO canonical vars
    // listed — was caught by the old `presentVars.length >= 1` guard;
    // must continue to be caught post-R23.
    const subsetMarkerNoVars =
      "| `pnpm validation:foo` | 3 vars; J3-claim-email NOT required | misc |";
    const noVarsResult = evaluateCanonicalTableRow(subsetMarkerNoVars, CANONICAL_VARS);
    expect(noVarsResult).not.toBeNull();
  });

  // R27 commit 59 — F10-class CONTRACT-LEVEL structural-EXCLUSIVITY walker.
  // SUPERSEDES the R25 commit 54 contract-level walker. F10-class hit
  // 5 rounds (R12 F10 + R14 F13/F14 + R20 F20 + R24 F25 + R26 F28) —
  // each round revealed a NEW syntactic form not covered by prior
  // per-syntactic-form regex defenses (R25's COLON_LIST_FRAME_RX
  // couldn't catch F28's cardinality-only / wildcard-only shape).
  //
  // Per AGENTS.md "Structural-defense calibration (M12 plan R5
  // amendment)" + R25 documented escalation ladder: the F10-class
  // converges structurally only via Option D refactor (single source
  // of truth + structural exclusivity). The refactor at R27 commit 58
  // retired own-enumerations from every M12 doc surface EXCEPT spec
  // §9.1.2 + plan 01 .env.local.example template. This walker enforces
  // that exclusivity: ANY cluster of ≥2 distinct canonical literals
  // outside the two whitelisted surfaces fails.
  //
  // Walker design (replaces the R25 COLON_LIST_FRAME_RX +
  // evaluateCanonicalEnvVarCluster satisfiability model):
  //
  //   1. Scan every M12 doc surface (spec + plan tree + handoff,
  //      with §15 audit-trail stripped + EXCLUDED handoff + SELF).
  //   2. For each line: count distinct canonical literals. If 0, skip.
  //   3. Build a ±5-line cluster window. Count distinct canonical
  //      literals in the window. If <2, skip (single-var paragraphs
  //      like "set VALIDATION_J3_CLAIM_EMAIL to your Google email"
  //      are fine).
  //   4. Cluster has ≥2 distinct canonical literals → potentially a
  //      problem. EXCEPT (any one suffices):
  //      (a) Cluster is inside spec §9.1.2 heading scope (validated
  //          by F20 / F24).
  //      (b) Cluster window contains the literal phrase
  //          "canonical-env-var-source: keep" (the explicit whitelist
  //          marker; carried by spec §9.1.2 + plan 01 .env.local.example
  //          per R27 commit 58 refactor).
  //      (c) ALL canonical-literal occurrences in the cluster appear
  //          inside `process.env.X` references (real TypeScript code
  //          referencing the env var, NOT prose enumerating the env-
  //          var contract — these legitimately appear in plan 03 mint-
  //          RPC integration test snippets).
  //      (d) Cluster is inside a fenced code block (```...```) that
  //          is NOT in a whitelisted surface — exempts SQL exception
  //          messages that mention an env-var name in their diagnostic
  //          text (single-literal SQL strings; the cluster-window
  //          rule already excludes single-literal lines, but adjacent
  //          fenced-code lines naming different literals can land in
  //          the same window).
  //      (e) Cluster window contains an explicit `<!-- not-f28-class:
  //          <reason> -->` waiver (escape hatch for future legitimate
  //          historical-quote needs).
  //   5. Otherwise: FAIL with diagnostic naming the cluster's literals
  //      and the cross-reference fix instruction.
  //
  // This walker is intentionally STRICTER than R25's: it does NOT
  // satisfiability-check (4 vars OR subset reason OR waiver); it
  // enforces structural exclusivity (the only places canonical
  // literals may co-occur are §9.1.2 + .env.local.example +
  // exempted code / waivers). Each new round-find of a syntactic
  // form not yet covered would have meant another walker extension
  // under R25's model; under R27 it requires no walker change —
  // the offending site fails as an unauthorized own-enumeration.
  test("F28-class structural-exclusivity walker: clusters of ≥2 canonical VALIDATION_* literals live ONLY in spec §9.1.2 or the .env.local.example template (everything else is a contract-drift hit)", () => {
    const CANONICAL_VARS = [
      "VALIDATION_SUPABASE_URL",
      "VALIDATION_SUPABASE_SECRET_KEY",
      "VALIDATION_SUPABASE_PROJECT_REF",
      "VALIDATION_J3_CLAIM_EMAIL",
    ];

    // R27 walker — structural-exclusivity. The R25 walker tried to
    // satisfiability-check every cluster (4 vars OR subset reason OR
    // waiver); R26 F28 demonstrated that approach can be silently
    // bypassed by cardinality-only / wildcard-only patterns the regex
    // doesn't recognise. R27 inverts the model: ANY cluster of ≥2
    // canonical literals outside the two authorized surfaces fails.
    //
    // The two authorized surfaces are detected via the explicit marker
    // phrase below — paired with the markers landed in commit 58 at
    // spec §9.1.2 + plan 01 .env.local.example template block.
    const CANONICAL_SOURCE_MARKER = "canonical-env-var-source: keep";
    const F28_WAIVER_RX = /<!--\s*not-f28-class:\s*[^-]/i;

    const F28_EXCLUDED_PATHS = new Set([
      "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/handoffs/M12-solo-dev-ux-validation.md",
      SELF,
    ]);

    const SCAN_FILE_LIST = [
      SPEC_FILE,
      ...collectMarkdown(
        "docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation",
      ),
      "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/handoffs/M12-solo-dev-ux-validation.md",
    ];

    // Helper: are ALL canonical-literal occurrences in this cluster
    // inside `process.env.X` references? Real TypeScript code
    // legitimately co-locates multiple env vars (e.g.,
    // `createClient(process.env.VALIDATION_SUPABASE_URL!,
    // process.env.VALIDATION_SUPABASE_SECRET_KEY!)`). Those are NOT
    // contract enumerations — they're real code. Walker skips.
    function allCanonicalsInProcessEnvCode(
      clusterWindow: string,
      canonicalVars: readonly string[],
    ): boolean {
      let anyMatched = false;
      for (const v of canonicalVars) {
        const regex = new RegExp(v.replace(/_/g, "_"), "g");
        for (const m of clusterWindow.matchAll(regex)) {
          anyMatched = true;
          const idx = m.index ?? 0;
          // Check ~24 chars before for `process.env.` prefix (allows
          // for `process.env.X` and `process.env. X` spacing variants).
          const lookback = clusterWindow.substring(Math.max(0, idx - 24), idx);
          if (!/process\.env\.\s*$/.test(lookback)) return false;
        }
      }
      return anyMatched;
    }

    const findings: string[] = [];

    for (const file of SCAN_FILE_LIST) {
      if (F28_EXCLUDED_PATHS.has(file)) continue;
      let raw: string;
      try {
        raw = readFileSync(join(ROOT, file), "utf8");
      } catch {
        continue;
      }
      const source = stripFifteen(raw);
      const lines = source.split("\n");

      // Track §9.1.2 heading scope (spec file only). Inside §9.1.2:
      // canonical literals are authorized (and the table-body rows
      // are additionally validated by F20 / F24 above).
      let in912Heading = false;
      // Track which lines (zero-indexed) are inside a fenced code
      // block. A toggle: lines starting with ``` flip the state.
      const inFence: boolean[] = new Array(lines.length).fill(false);
      let fenceOpen = false;
      for (let i = 0; i < lines.length; i++) {
        if (/^```/.test(lines[i])) {
          fenceOpen = !fenceOpen;
          inFence[i] = fenceOpen; // the fence line itself counts as inside
          continue;
        }
        inFence[i] = fenceOpen;
      }

      // R29 commit 63 — marker semantics tightened. Pre-R29 the
      // `canonical-env-var-source: keep` marker carried a flat ±60-line
      // window. R28 surfaced that a flat window can silently exempt
      // adjacent prose if literals are added later (e.g., new
      // checklist steps inserted within ±60 lines of the .env.local.example
      // template would inherit the whitelist regardless of whether they
      // intended to be canonical). The tightened semantics:
      //   (a) marker INSIDE or IMMEDIATELY ABOVE a fenced code block —
      //       exempts ONLY that fenced block (the .env.local.example
      //       template carries it this way at plan 01:104).
      //   (b) marker INSIDE a §-numbered heading scope (e.g., just below
      //       `### 9.1.2`) — exempts until the next same/higher heading
      //       (so spec §9.1.2 stays exempt for its entire body, regardless
      //       of how long the table+prose grows).
      // No flat 60-line fallback.
      const inMarkerWindow: boolean[] = new Array(lines.length).fill(false);
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].includes(CANONICAL_SOURCE_MARKER)) continue;

        // Case (a): marker is inside a fenced block (inFence[i] is true)
        // OR the marker line is immediately ABOVE a fenced block opener
        // (next non-blank line starts with ```). Whitelist only the
        // enclosing/adjacent fenced block.
        if (inFence[i]) {
          // Walk back to fence start, forward to fence end.
          let s = i;
          while (s > 0 && inFence[s - 1] && !/^```/.test(lines[s - 1])) s--;
          let e = i;
          while (e < lines.length - 1 && inFence[e + 1] && !/^```/.test(lines[e + 1])) e++;
          for (let k = s; k <= e; k++) inMarkerWindow[k] = true;
          continue;
        }
        // Marker line above a fenced block? Look ahead skipping blank /
        // comment-only lines until the first non-blank line.
        let probe = i + 1;
        while (probe < lines.length && /^\s*(#|<!--|$)/.test(lines[probe])) probe++;
        if (probe < lines.length && /^```/.test(lines[probe])) {
          // Whitelist the fenced block at probe.
          let s = probe;
          let e = probe;
          while (e + 1 < lines.length && !/^```/.test(lines[e + 1])) e++;
          if (e + 1 < lines.length) e++; // include closing fence line
          for (let k = s; k <= e; k++) inMarkerWindow[k] = true;
          continue;
        }

        // Case (b): marker inside a §-numbered heading scope. Look back
        // for the nearest `###`-or-deeper heading; whitelist from that
        // heading until the next same-or-higher heading. (Spec §9.1.2
        // marker lands at line 812, just below the `### 9.1.2` heading
        // at 808.)
        let headStart = -1;
        let headDepth = 0;
        for (let j = i - 1; j >= 0; j--) {
          const m = lines[j].match(/^(#{2,})\s+/);
          if (m) {
            headStart = j;
            headDepth = m[1].length;
            break;
          }
        }
        if (headStart >= 0) {
          let scopeEnd = lines.length;
          for (let j = headStart + 1; j < lines.length; j++) {
            const m = lines[j].match(/^(#{2,})\s+/);
            if (m && m[1].length <= headDepth) {
              scopeEnd = j;
              break;
            }
          }
          for (let k = headStart; k < scopeEnd; k++) inMarkerWindow[k] = true;
        }
      }

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Track §9.1.2 heading scope (spec file only).
        if (/^###\s+9\.1\.2\b/.test(line)) {
          in912Heading = true;
        } else if (in912Heading && /^###?\s+9\.[1-9]\.[3-9]\b/.test(line)) {
          in912Heading = false;
        } else if (in912Heading && /^##\s+/.test(line)) {
          in912Heading = false;
        }

        // Does this line mention any canonical literal?
        const lineCanonicals = CANONICAL_VARS.filter((v) => line.includes(v));
        if (lineCanonicals.length === 0) continue;

        // The structural-exclusivity rule fires on TRUE own-enumeration
        // — a single logical entity (line or fenced block) that names
        // ≥2 distinct canonical literals together. Distributed
        // per-predicate / per-checklist citations where each line
        // happens to name ONE canonical literal but its neighbours
        // name a DIFFERENT one are NOT own-enumerations — they're
        // narrative co-incidence within a ±5 line window. The
        // walker's job is to catch "Required env vars: VAR1, VAR2"
        // and ".env.local.example multi-line var blocks", NOT
        // "predicate (d) cites PROJECT_REF on this line; predicate
        // (k) cites J3_CLAIM_EMAIL three lines later."
        //
        // Two detection modes:
        //   (M1) Same-line co-occurrence: this line itself names ≥2
        //        distinct canonical literals. F25's exact shape, F20
        //        spec-table-row shape, and the structural-exclusivity
        //        rule's primary target.
        //   (M2) Contiguous-line co-occurrence in a fenced template
        //        block: ≥2 distinct canonical literals appear on
        //        consecutive lines (or with at most a single blank-
        //        or-comment line between them) inside a code-fence —
        //        the .env.local.example template shape. The fence
        //        boundary defines the logical entity.
        //
        // Both modes use the SAME cluster window for waiver / marker
        // detection (±5 lines), so existing escape hatches still apply.

        // (M1) Same-line: count distinct canonicals on this line.
        // But require enumeration intent — the canonicals must be in
        // LIST PROXIMITY (separated only by short connectors like
        // `,` `;` `+` ` ` `\`` and at most ~40 chars of inter-literal
        // text). Distant co-occurrence on the same line ("predicate
        // (d) cites PROJECT_REF ... predicate (k) cites
        // J3_CLAIM_EMAIL") is narrative, not enumeration, and must
        // NOT fire the walker. Two literals separated by a sentence
        // boundary (`. ` followed by capital) or a `predicate (X)`
        // citation marker between them are explicitly disqualified.
        const sameLineCount = (() => {
          if (lineCanonicals.length < 2) return lineCanonicals.length;
          // Find the indices of canonical-literal occurrences in this
          // line and check the inter-literal text for narrative
          // disqualifiers.
          const positions: number[] = [];
          for (const v of lineCanonicals) {
            const idx = line.indexOf(v);
            if (idx >= 0) positions.push(idx + v.length); // end of literal
          }
          positions.sort((a, b) => a - b);
          // For each adjacent pair, check the inter-literal substring.
          let listProximityAdjacencies = 0;
          for (let p = 0; p < positions.length - 1; p++) {
            const sliceStart = positions[p];
            const nextLitStart = line.indexOf(
              lineCanonicals.find((v) => {
                const idx = line.indexOf(v, sliceStart);
                return idx >= 0;
              }) ?? "",
              sliceStart,
            );
            if (nextLitStart < 0) continue;
            const inter = line.substring(sliceStart, nextLitStart);
            const interLen = inter.length;
            // Narrative disqualifiers: predicate citation, sentence
            // boundary, long prose, parenthesized R-commit citation
            // shape, or a predicate-letter marker.
            const isNarrative =
              /predicate\s*\([a-z]\)/i.test(inter) ||
              /\*\*\([a-z]\)/i.test(inter) ||
              /\.\s+[A-Z]/.test(inter) ||
              /\bif\s+(?:`|the\b)/i.test(inter) ||
              /\bcheck-seed\b/i.test(inter) ||
              /\bdiagnostic\b/i.test(inter) ||
              interLen > 80;
            if (!isNarrative) listProximityAdjacencies++;
          }
          // Require at least one list-proximity adjacency to call
          // this an enumeration.
          return listProximityAdjacencies > 0 ? lineCanonicals.length : 1;
        })();

        // (M2) Fenced-block contiguous: if this line is inside a code
        // fence, look at the contiguous fence block and count
        // distinct canonicals across its lines.
        let fencedBlockCount = 0;
        let fencedBlockStart = i;
        let fencedBlockEnd = i;
        if (inFence[i]) {
          // Walk back to fence start.
          let s = i;
          while (s > 0 && inFence[s - 1] && !/^```/.test(lines[s - 1])) s--;
          // Walk forward to fence end.
          let e = i;
          while (e < lines.length - 1 && inFence[e + 1] && !/^```/.test(lines[e + 1])) e++;
          fencedBlockStart = s;
          fencedBlockEnd = e;
          const fencedText = lines.slice(s, e + 1).join("\n");
          fencedBlockCount = CANONICAL_VARS.filter((v) => fencedText.includes(v)).length;
        }

        const isOwnEnumeration = sameLineCount >= 2 || fencedBlockCount >= 2;
        if (!isOwnEnumeration) continue;

        // Cluster window for waiver / marker / process.env / fence
        // checks. For fenced-block mode, the window is the block
        // itself; for same-line mode, ±5 lines around the line.
        const clusterStart =
          fencedBlockCount >= 2 ? Math.max(0, fencedBlockStart - 5) : Math.max(0, i - 5);
        const clusterEnd =
          fencedBlockCount >= 2
            ? Math.min(lines.length, fencedBlockEnd + 6)
            : Math.min(lines.length, i + 6);
        const clusterWindow = lines.slice(clusterStart, clusterEnd).join("\n");
        const clusterCanonicals = CANONICAL_VARS.filter((v) => clusterWindow.includes(v));

        // Exemption (a): §9.1.2 heading scope (validated by F20 / F24).
        if (in912Heading) continue;

        // Exemption (b): explicit marker whitelist.
        if (inMarkerWindow[i]) continue;

        // Exemption (e): explicit per-finding waiver.
        if (F28_WAIVER_RX.test(clusterWindow)) continue;

        // Exemption (c): ALL canonical-literal occurrences are
        // inside `process.env.X` real-code references.
        if (allCanonicalsInProcessEnvCode(clusterWindow, CANONICAL_VARS)) continue;

        // Exemption (d): for same-line mode, exempt if the line is
        // inside a fenced code block AND none of the canonical-
        // mentions have prose-context companions outside the fence.
        // (Fenced-block mode is itself exempt only via the marker —
        // the .env.local.example template carries the marker.)
        if (sameLineCount >= 2 && inFence[i]) continue;

        // No exemption applies → contract-drift hit.
        const mode = fencedBlockCount >= 2 && sameLineCount < 2 ? "fenced-block" : "same-line";
        findings.push(
          `  ${file}:${i + 1} [${mode}] (unauthorized own-enumeration of ${clusterCanonicals.length} canonical VALIDATION_* literals outside §9.1.2 / .env.local.example)\n` +
            `      line:    ${line.substring(0, 240)}${line.length > 240 ? "..." : ""}\n` +
            `      cluster canonicals: ${clusterCanonicals.join(", ")}`,
        );
      }
    }

    if (findings.length > 0) {
      expect.fail(
        `R27 commit 59 F10-class structural-exclusivity walker: ${findings.length} cluster(s) of ≥2 canonical VALIDATION_* literals found OUTSIDE the two authorized surfaces (spec §9.1.2 + plan 01-phase0-infra.md .env.local.example template block).\n\n` +
          findings.join("\n\n") +
          `\n\nCanonical env vars (single source of truth — spec §9.1.2 R21 commit 44 F20 amendment + R27 commit 58 Option D refactor):\n  ${CANONICAL_VARS.join("\n  ")}\n\n` +
          `Per R27 Option D refactor: the ONLY two M12 doc surfaces authorized to carry own-enumerations of ≥2 canonical literals are\n` +
          `  (1) spec §9.1.2 canonical CLI table (heading scope is auto-exempt; markers required for prose around it)\n` +
          `  (2) plan 01-phase0-infra.md .env.local.example template block (carries the explicit "canonical-env-var-source: keep" marker)\n\n` +
          `Fix options for each finding:\n` +
          `  (a) Rewrite the cluster as a cross-reference to spec §9.1.2 (e.g., "per the canonical CLI env-var contract at §9.1.2"). Do NOT inline-restate the literal env-var names.\n` +
          `  (b) If the canonical literals appear inside real TypeScript code (\`process.env.X\`), the walker should already auto-exempt; check the cluster window for non-code prose contamination.\n` +
          `  (c) If the canonical literals appear inside fenced code blocks (script/SQL bodies / exception messages), the walker should already auto-exempt; check the cluster window for prose lines outside the fence.\n` +
          `  (d) Add an inline <!-- not-f28-class: <reason> --> waiver comment within ±5 lines of the cluster.\n` +
          `  (e) If the cluster is meant to be a NEW canonical-source surface, add the <!-- canonical-env-var-source: keep --> marker explicitly (DESIGN CHANGE — requires updating the F10-class contract; not the default repair).\n\n` +
          `This walker SUPERSEDES the R25 contract-level satisfiability walker. Per the AGENTS.md "Structural-defense calibration (M12 plan R5 amendment)" + R25 documented escalation ladder: F10-class converges structurally only via Option D (single source of truth + structural exclusivity), NOT via further per-syntactic-form regex extensions.`,
      );
    }
  });

  // R27 commit 59 negative-case test for the structural-exclusivity
  // walker. Pins the new semantics at CI time so future edits cannot
  // relax structural exclusivity without explicit intent. The fixture
  // shapes test (1) the basic ≥2-canonical-co-occurrence rule, (2)
  // the §9.1.2 / marker / waiver / code / fence exemptions, and (3)
  // the cardinality-only / wildcard-only shape F28 named (which the
  // R25 walker silently missed).
  test("F28-class structural-exclusivity walker negative case: ≥2-canonical clusters outside authorized surfaces FIRE; exempted clusters PASS", () => {
    // Pure unit-evaluator mirroring the walker's per-cluster decision
    // logic (without filesystem I/O). Returns true iff the cluster
    // would fire the walker.
    const CANONICAL_VARS = [
      "VALIDATION_SUPABASE_URL",
      "VALIDATION_SUPABASE_SECRET_KEY",
      "VALIDATION_SUPABASE_PROJECT_REF",
      "VALIDATION_J3_CLAIM_EMAIL",
    ];
    const CANONICAL_SOURCE_MARKER = "canonical-env-var-source: keep";
    const F28_WAIVER_RX = /<!--\s*not-f28-class:\s*[^-]/i;

    function clusterFires(opts: {
      window: string;
      in912Heading?: boolean;
      hasMarker?: boolean;
      allInFence?: boolean;
    }): boolean {
      const window = opts.window;
      const clusterCanonicals = CANONICAL_VARS.filter((v) => window.includes(v));
      if (clusterCanonicals.length < 2) return false;
      if (opts.in912Heading) return false;
      if (opts.hasMarker || window.includes(CANONICAL_SOURCE_MARKER)) return false;
      if (F28_WAIVER_RX.test(window)) return false;
      // All-in-process.env check.
      let anyMatched = false;
      let allCode = true;
      for (const v of CANONICAL_VARS) {
        for (const m of window.matchAll(new RegExp(v, "g"))) {
          anyMatched = true;
          const idx = m.index ?? 0;
          const lookback = window.substring(Math.max(0, idx - 24), idx);
          if (!/process\.env\.\s*$/.test(lookback)) allCode = false;
        }
      }
      if (anyMatched && allCode) return false;
      if (opts.allInFence) return false;
      return true;
    }

    // BROKEN fixtures (would fire the walker).

    // F28 base shape — 2 canonicals co-occurring in prose, no exemption.
    const f28BasicCluster =
      "Required env vars: `VALIDATION_SUPABASE_URL`, `VALIDATION_SUPABASE_SECRET_KEY` for the new CLI.";
    expect(clusterFires({ window: f28BasicCluster })).toBe(true);

    // F25 shape — pre-R25 enumeration of 3 vars; structural-exclusivity
    // walker fires regardless of cardinality semantics (R25 satisfiability
    // logic retired).
    const f25Cluster =
      "Required env vars per spec §9.1.2: VALIDATION_SUPABASE_URL, VALIDATION_SUPABASE_SECRET_KEY, VALIDATION_SUPABASE_PROJECT_REF.";
    expect(clusterFires({ window: f25Cluster })).toBe(true);

    // F20 shape — full 4 vars listed in a non-canonical surface.
    // Under R25 the satisfiability check passed (all 4 listed); under
    // R27 the structural-exclusivity rule fires unconditionally
    // because the surface is not §9.1.2 and lacks the marker.
    const f20ShapeUnauthorizedSurface =
      "Full enumeration: VALIDATION_SUPABASE_URL, VALIDATION_SUPABASE_SECRET_KEY, VALIDATION_SUPABASE_PROJECT_REF, VALIDATION_J3_CLAIM_EMAIL.";
    expect(clusterFires({ window: f20ShapeUnauthorizedSurface })).toBe(true);

    // PASSING fixtures.

    // (a) §9.1.2 heading scope.
    expect(clusterFires({ window: f25Cluster, in912Heading: true })).toBe(false);

    // (b) Explicit canonical-source marker.
    const markedCluster =
      "<!-- canonical-env-var-source: keep --> VALIDATION_SUPABASE_URL, VALIDATION_SUPABASE_SECRET_KEY";
    expect(clusterFires({ window: markedCluster })).toBe(false);

    // (c) All canonicals inside process.env code references.
    const processEnvCode =
      "const client = createClient(process.env.VALIDATION_SUPABASE_URL!, process.env.VALIDATION_SUPABASE_SECRET_KEY!);";
    expect(clusterFires({ window: processEnvCode })).toBe(false);

    // (d) Fenced code block (entire cluster inside ```).
    expect(clusterFires({ window: f25Cluster, allInFence: true })).toBe(false);

    // (e) Explicit waiver.
    const waiverCluster =
      "<!-- not-f28-class: quoting pre-R27 finding F25 verbatim --> Required env vars per spec §9.1.2: VALIDATION_SUPABASE_URL, VALIDATION_SUPABASE_SECRET_KEY.";
    expect(clusterFires({ window: waiverCluster })).toBe(false);

    // Single-canonical cluster — passes regardless.
    const singleCanonical =
      "set VALIDATION_J3_CLAIM_EMAIL to your real Google account email.";
    expect(clusterFires({ window: singleCanonical })).toBe(false);

    // F28 cardinality-only shape — no canonical literals present.
    // The walker is only counts distinct canonicals; this cluster
    // has zero, so it does not fire (and the surface should be
    // refactored to drop the cardinality claim per the R27 commit 58
    // refactor — which is the per-instance F28 fix).
    const cardinalityOnly = "documents 3 new VALIDATION_* env vars";
    expect(clusterFires({ window: cardinalityOnly })).toBe(false);

    // Sanity: process.env code mixed with prose enumeration fires.
    // (Code-mix-with-prose isn't a real-code reference.)
    const mixedCodeAndProse =
      "Per spec §9.1.2: VALIDATION_SUPABASE_URL, VALIDATION_SUPABASE_SECRET_KEY. Also process.env.VALIDATION_SUPABASE_PROJECT_REF in the script.";
    expect(clusterFires({ window: mixedCodeAndProse })).toBe(true);
  });

  // R29 commit 63 — F10-class walker REFINEMENT (M3 + M4 + marker tightening).
  // F10-class hit 6 rounds (R12 F10 + R14 F13/F14 + R20 F20 + R24 F25 +
  // R26 F28 + R28 F29). The R27 Option D MODEL — structural exclusivity:
  // only spec §9.1.2 + plan .env.local.example template carry canonical
  // env-var contract references of ANY syntactic form — remains correct.
  // What R28 surfaced is a DETECTION refinement: the R27 walker (M1 ≥2-
  // canonical proximity + M2 fenced-block) catches LITERAL-enumeration
  // shapes but misses three additional syntactic shapes that still
  // reference the contract:
  //
  //   (M3) Cardinality + wildcard prose: "the four env vars", "Set 3
  //        VALIDATION_* env vars", "Four VALIDATION_* env vars",
  //        "SUPABASE_* trio", "all four env vars".
  //   (M4) Single-canonical-literal in CONTRACT-PROSE context: naming
  //        VALIDATION_J3_CLAIM_EMAIL (or any other single canonical
  //        literal) in a checklist paragraph that ALSO references the
  //        env-var contract (markers like "env vars", "environment
  //        variables", "credentials", "the four", "trio",
  //        "VALIDATION_*"). DISAMBIGUATED from operational instructions
  //        like "set X to your Google account email" or "throw if X is
  //        undefined" — those name the var but do NOT enumerate the
  //        contract.
  //
  // Both M3 and M4 fire ONLY outside the two authorized surfaces (spec
  // §9.1.2 heading scope and the .env.local.example fenced block,
  // detected via the `canonical-env-var-source: keep` marker with the
  // R29-tightened semantics: structural — enclosing fence OR enclosing
  // heading scope, NOT a ±60-line flat window).
  test("F29-class walker M3 + M4: cardinality/wildcard prose + single-canonical-in-contract-prose outside authorized surfaces FIRE; operational-instruction citations + authorized surfaces PASS", () => {
    const CANONICAL_VARS = [
      "VALIDATION_SUPABASE_URL",
      "VALIDATION_SUPABASE_SECRET_KEY",
      "VALIDATION_SUPABASE_PROJECT_REF",
      "VALIDATION_J3_CLAIM_EMAIL",
    ];
    const CANONICAL_SOURCE_MARKER = "canonical-env-var-source: keep";
    const F29_WAIVER_RX = /<!--\s*not-f29-class:\s*[^-]/i;

    // ---- M3 detection: cardinality + wildcard prose -----------------
    //
    // Patterns the walker must catch (each pattern represents a way to
    // reference the env-var contract WITHOUT naming canonical literals
    // — which is why the R27 ≥2-literal walker missed them):
    //   • "[0-9]+ VALIDATION_*" (e.g., "3 VALIDATION_*", "4 new VALIDATION_*")
    //   • "[0-9]+ new VALIDATION" + (" env vars" within ~40 chars)
    //   • "(three|four|all four|all three|the four|the three) (env|VALIDATION)"
    //   • "SUPABASE_* trio" / "VALIDATION_SUPABASE_* trio"
    //   • "all (four|three) (canonical|env|VALIDATION)"
    //
    // The detection is line-level. Operational instructions about
    // "all four artifacts" / "all four stages" / etc. (where the noun
    // after the cardinality is NOT env/VALIDATION) do NOT fire — the
    // group-2 capture pin keeps the detection contract-scoped.
    // R29 commit 63: cardinality must be DIRECTLY adjacent to the
    // VALIDATION_* wildcard or to the "env vars" noun phrase (at most
    // one short qualifier word in between like "new"/"canonical"/
    // "validation"). The earlier 40-char-window pattern was too
    // permissive — citation digits like "Phase 0.A" or "R27 commit 58"
    // anywhere on a line would falsely trigger.
    const M3_PATTERNS: Array<{ class: string; rx: RegExp }> = [
      {
        class: "M3:numeric-cardinality + wildcard",
        // "3 VALIDATION_*" / "4 new VALIDATION_*" / "Four VALIDATION_*"
        // / "the four VALIDATION_*". Cardinality + (optional 1-2 short
        // qualifiers like "new"/"canonical"/"validation") + VALIDATION_*.
        // Word boundary on cardinality prevents matching "0.A" / "58".
        rx: /\b(?:[1-9]|three|four|all\s+three|all\s+four|the\s+three|the\s+four|Three|Four|All\s+Three|All\s+Four|The\s+Three|The\s+Four)\s+(?:(?:new|canonical|validation|additional)\s+){0,2}VALIDATION_\*/,
      },
      {
        class: "M3:numeric/word-cardinality + env-vars noun",
        // "the four env vars" / "all four env vars" / "Four env vars"
        // / "Set 3 env vars" / "Set the three env vars".
        // Single-digit cardinality only (no [0-9]+ — citations like
        // "58 env vars in §9" shouldn't fire if the digit is itself
        // a citation; the env-vars-noun adjacency keeps it scoped).
        rx: /\b(?:[1-9]|three|four|all\s+three|all\s+four|the\s+three|the\s+four|Three|Four|All\s+Three|All\s+Four|The\s+Three|The\s+Four)\s+(?:new\s+|canonical\s+|VALIDATION_?\s+|validation\s+)?(?:env|environment)\s+(?:vars?|variables?)\b/,
      },
      {
        class: "M3:wildcard trio shorthand",
        // "SUPABASE_* trio" / "VALIDATION_SUPABASE_* trio".
        rx: /\b(?:VALIDATION_)?SUPABASE_\*\s+trio\b/i,
      },
    ];

    // ---- M4 detection: single-canonical-literal in contract-prose ----
    //
    // The line contains EXACTLY ONE canonical literal (so it's not
    // already caught by M1 / structural-exclusivity), AND the line
    // (or its immediate predecessor) contains a CONTRACT-PROSE marker:
    //   • "env vars" / "environment variables"
    //   • "credentials"
    //   • "VALIDATION_*" (wildcard reference)
    //   • "the (four|three) (env|VALIDATION|canonical)"
    //   • "trio"
    //   • "canonical CLI env-var" / "canonical env-var contract"
    //
    // Disambiguation: the line is EXEMPT if it carries an OPERATIONAL-
    // INSTRUCTION shape:
    //   • "set X to <something>" / "set X to your <something>"
    //   • "throw if X is undefined" / "X is required" / "X must be set"
    //     (single-var validation code)
    //   • "X is gitignored" / "X must equal <something>"
    //   • "X reads from <something>"
    //   • Operational-note: a line that explicitly labels itself
    //     "Operational note" / "operational instruction".
    // R29 commit 63: contract-prose markers are deliberately the
    // COLLECTIVE-CONTRACT shapes — "the four", "trio", "all four", etc.
    // Bare "env var" is too common in legitimate narrative prose
    // ("reads from env var X", "via env var X") and would fire M4 on
    // operational rationale paragraphs. The F29 trap is referencing the
    // env-var CONTRACT as a collective (cardinality + named-group),
    // not naming a single var alongside the word "env var."
    const CONTRACT_PROSE_MARKERS = [
      /VALIDATION_\*/,
      /\b(?:the\s+|all\s+)?(?:four|three)\s+(?:env|VALIDATION|canonical|new|validation)\b/i,
      /\b(?:SUPABASE|VALIDATION)_\*\s+trio\b/i,
      /\bcanonical\s+(?:CLI\s+)?env[-\s]?var\s+(?:contract|map)\b/i,
      /\bcanonical\s+env[-\s]?var\s+contract\b/i,
    ];
    const OPERATIONAL_INSTRUCTION_RX_LIST: RegExp[] = [
      // "set <VAR> to your real Google account email" — must have <VAR>
      // followed by "to" + an object noun phrase.
      /\bset\s+(?:`)?VALIDATION_[A-Z_0-9]+(?:`)?\s+to\s+/i,
      // "throw if VAR is undefined" / "VAR is required" / "VAR must be set".
      /\bVALIDATION_[A-Z_0-9]+\s+is\s+(?:undefined|required|missing|absent|empty|null)\b/i,
      /\bVALIDATION_[A-Z_0-9]+\s+must\s+(?:be|equal)\b/i,
      // "VAR reads from <X>" / "VAR comes from <X>".
      /\bVALIDATION_[A-Z_0-9]+\s+(?:reads|comes|sourced)\s+from\b/i,
      // "VAR is gitignored" / "VAR is not committed".
      /\bVALIDATION_[A-Z_0-9]+\s+is\s+(?:gitignored|not\s+committed|local-only)\b/i,
      // Explicit label of operational-note framing.
      /\boperational\s+(?:note|instruction)\b/i,
      // "responding at VAR" / "values for VAR" — narrative pointer
      // rather than contract enumeration.
      /\bresponding\s+at\s+(?:`)?VALIDATION_/i,
      /\bvalues?\s+for\s+(?:`)?VALIDATION_/i,
    ];

    function lineFiresM4(line: string, prevLine: string): boolean {
      const canonicalsOnLine = CANONICAL_VARS.filter((v) => line.includes(v));
      if (canonicalsOnLine.length !== 1) return false;
      // Operational-instruction shape disqualifies.
      for (const rx of OPERATIONAL_INSTRUCTION_RX_LIST) {
        if (rx.test(line)) return false;
      }
      // Contract-prose marker on this line OR the immediate predecessor.
      const ctx = line + "\n" + prevLine;
      const hasContractMarker = CONTRACT_PROSE_MARKERS.some((rx) => rx.test(ctx));
      return hasContractMarker;
    }

    function lineFiresM3(line: string): { fires: boolean; matchedClass: string | null } {
      for (const pattern of M3_PATTERNS) {
        if (pattern.rx.test(line)) return { fires: true, matchedClass: pattern.class };
      }
      return { fires: false, matchedClass: null };
    }

    // ---- Walk all M12 doc surfaces ----------------------------------
    const F29_EXCLUDED_PATHS = new Set([
      "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/handoffs/M12-solo-dev-ux-validation.md",
      SELF,
    ]);
    const SCAN_FILE_LIST = [
      SPEC_FILE,
      ...collectMarkdown(
        "docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation",
      ),
      "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/handoffs/M12-solo-dev-ux-validation.md",
    ];

    const findings: string[] = [];

    for (const file of SCAN_FILE_LIST) {
      if (F29_EXCLUDED_PATHS.has(file)) continue;
      let raw: string;
      try {
        raw = readFileSync(join(ROOT, file), "utf8");
      } catch {
        continue;
      }
      const source = stripFifteen(raw);
      const lines = source.split("\n");

      // Build the same fence-tracking + marker-window arrays the R27
      // walker uses (so we apply the SAME structural-exclusivity
      // exemption surfaces: §9.1.2 heading scope OR enclosing fence
      // marked with canonical-env-var-source: keep).
      const inFence: boolean[] = new Array(lines.length).fill(false);
      {
        let fenceOpen = false;
        for (let i = 0; i < lines.length; i++) {
          if (/^```/.test(lines[i])) {
            fenceOpen = !fenceOpen;
            inFence[i] = fenceOpen;
            continue;
          }
          inFence[i] = fenceOpen;
        }
      }

      const inMarkerWindow: boolean[] = new Array(lines.length).fill(false);
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].includes(CANONICAL_SOURCE_MARKER)) continue;
        // (a) Marker inside a fenced block.
        if (inFence[i]) {
          let s = i;
          while (s > 0 && inFence[s - 1] && !/^```/.test(lines[s - 1])) s--;
          let e = i;
          while (e < lines.length - 1 && inFence[e + 1] && !/^```/.test(lines[e + 1])) e++;
          for (let k = s; k <= e; k++) inMarkerWindow[k] = true;
          continue;
        }
        // (a') Marker just above a fenced block.
        let probe = i + 1;
        while (probe < lines.length && /^\s*(#|<!--|$)/.test(lines[probe])) probe++;
        if (probe < lines.length && /^```/.test(lines[probe])) {
          let s = probe;
          let e = probe;
          while (e + 1 < lines.length && !/^```/.test(lines[e + 1])) e++;
          if (e + 1 < lines.length) e++;
          for (let k = s; k <= e; k++) inMarkerWindow[k] = true;
          continue;
        }
        // (b) Marker inside a §-numbered heading scope.
        let headStart = -1;
        let headDepth = 0;
        for (let j = i - 1; j >= 0; j--) {
          const m = lines[j].match(/^(#{2,})\s+/);
          if (m) {
            headStart = j;
            headDepth = m[1].length;
            break;
          }
        }
        if (headStart >= 0) {
          let scopeEnd = lines.length;
          for (let j = headStart + 1; j < lines.length; j++) {
            const m = lines[j].match(/^(#{2,})\s+/);
            if (m && m[1].length <= headDepth) {
              scopeEnd = j;
              break;
            }
          }
          for (let k = headStart; k < scopeEnd; k++) inMarkerWindow[k] = true;
        }
      }

      // §9.1.2 heading-scope auto-exemption (spec only).
      const in912Scope: boolean[] = new Array(lines.length).fill(false);
      {
        let in912 = false;
        for (let i = 0; i < lines.length; i++) {
          if (/^###\s+9\.1\.2\b/.test(lines[i])) {
            in912 = true;
          } else if (in912 && /^###?\s+9\.[1-9]\.[3-9]\b/.test(lines[i])) {
            in912 = false;
          } else if (in912 && /^##\s+/.test(lines[i])) {
            in912 = false;
          }
          in912Scope[i] = in912;
        }
      }

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const prev = i > 0 ? lines[i - 1] : "";

        // Skip exempt scopes.
        if (in912Scope[i]) continue;
        if (inMarkerWindow[i]) continue;
        // Per-finding waiver (look ±5 lines).
        const wStart = Math.max(0, i - 5);
        const wEnd = Math.min(lines.length, i + 6);
        const window = lines.slice(wStart, wEnd).join("\n");
        if (F29_WAIVER_RX.test(window)) continue;

        // M3 detection.
        const m3 = lineFiresM3(line);
        if (m3.fires) {
          findings.push(
            `  ${file}:${i + 1} [${m3.matchedClass}]\n` +
              `      line: ${line.substring(0, 240)}${line.length > 240 ? "..." : ""}`,
          );
          continue;
        }

        // M4 detection.
        if (lineFiresM4(line, prev)) {
          const matchedLiteral = CANONICAL_VARS.find((v) => line.includes(v));
          findings.push(
            `  ${file}:${i + 1} [M4:single-canonical-in-contract-prose]\n` +
              `      line:    ${line.substring(0, 240)}${line.length > 240 ? "..." : ""}\n` +
              `      literal: ${matchedLiteral}`,
          );
          continue;
        }
      }
    }

    if (findings.length > 0) {
      expect.fail(
        `R29 commit 63 F10-class walker refinement (M3 + M4): ${findings.length} contract-reference site(s) outside the two authorized surfaces (spec §9.1.2 + plan .env.local.example fenced block).\n\n` +
          findings.join("\n\n") +
          `\n\nDetection rules:\n` +
          `  M3 — cardinality + wildcard prose ("4 VALIDATION_*", "Four env vars", "SUPABASE_* trio", "all four env vars").\n` +
          `  M4 — single canonical literal in a contract-prose paragraph (markers: "env vars", "credentials", "VALIDATION_*", "the four/three", "trio", "canonical env-var contract"). Disambiguated from operational instructions ("set X to <value>", "throw if X is undefined", "X must be set", "X reads from Y", "responding at X", "values for X", explicit "Operational note" label).\n\n` +
          `Fix options:\n` +
          `  (a) Rewrite to a pure cross-reference: "per spec §9.1.2 canonical CLI env-var contract" — NO cardinality, NO wildcard, NO canonical literal restatement.\n` +
          `  (b) If the var has operational meaning, split it onto its own line labeled "Operational note:" so the M4 disambiguation rule passes.\n` +
          `  (c) Add an inline <!-- not-f29-class: <reason> --> waiver within ±5 lines of the cluster.\n\n` +
          `Per R28 honest diagnosis + AGENTS.md "Structural-defense calibration": the R27 Option D MODEL (single source of truth + structural exclusivity) is correct; M3 + M4 are DETECTION refinements catching syntactic shapes the literal-co-occurrence walker can't see.`,
      );
    }
  });

  // R29 commit 63 negative-case test for M3 + M4 + disambiguation +
  // marker-tightening. Pins the new semantics at CI time. Mirrors the
  // F28 negative-case pattern: synthetic broken fixtures fire; synthetic
  // exempt fixtures pass.
  test("F29-class walker M3 + M4 negative case: cardinality/wildcard/contract-prose shapes fire; operational-instruction citations + authorized surfaces pass", () => {
    const CANONICAL_VARS = [
      "VALIDATION_SUPABASE_URL",
      "VALIDATION_SUPABASE_SECRET_KEY",
      "VALIDATION_SUPABASE_PROJECT_REF",
      "VALIDATION_J3_CLAIM_EMAIL",
    ];

    // Mirror of the live-scan walker's M3 patterns + CONTRACT_PROSE_MARKERS
    // (kept in sync with the walker test above — same regexes,
    // duplicated only because this negative-case test exercises a
    // pure-evaluator function rather than the live scan).
    const M3_PATTERNS: RegExp[] = [
      /\b(?:[1-9]|three|four|all\s+three|all\s+four|the\s+three|the\s+four|Three|Four|All\s+Three|All\s+Four|The\s+Three|The\s+Four)\s+(?:(?:new|canonical|validation|additional)\s+){0,2}VALIDATION_\*/,
      /\b(?:[1-9]|three|four|all\s+three|all\s+four|the\s+three|the\s+four|Three|Four|All\s+Three|All\s+Four|The\s+Three|The\s+Four)\s+(?:new\s+|canonical\s+|VALIDATION_?\s+|validation\s+)?(?:env|environment)\s+(?:vars?|variables?)\b/,
      /\b(?:VALIDATION_)?SUPABASE_\*\s+trio\b/i,
    ];

    const CONTRACT_PROSE_MARKERS: RegExp[] = [
      /VALIDATION_\*/,
      /\b(?:the\s+|all\s+)?(?:four|three)\s+(?:env|VALIDATION|canonical|new|validation)\b/i,
      /\b(?:SUPABASE|VALIDATION)_\*\s+trio\b/i,
      /\bcanonical\s+(?:CLI\s+)?env[-\s]?var\s+(?:contract|map)\b/i,
      /\bcanonical\s+env[-\s]?var\s+contract\b/i,
    ];
    const OPERATIONAL_INSTRUCTION_RX_LIST: RegExp[] = [
      /\bset\s+(?:`)?VALIDATION_[A-Z_0-9]+(?:`)?\s+to\s+/i,
      /\bVALIDATION_[A-Z_0-9]+\s+is\s+(?:undefined|required|missing|absent|empty|null)\b/i,
      /\bVALIDATION_[A-Z_0-9]+\s+must\s+(?:be|equal)\b/i,
      /\bVALIDATION_[A-Z_0-9]+\s+(?:reads|comes|sourced)\s+from\b/i,
      /\bVALIDATION_[A-Z_0-9]+\s+is\s+(?:gitignored|not\s+committed|local-only)\b/i,
      /\boperational\s+(?:note|instruction)\b/i,
      /\bresponding\s+at\s+(?:`)?VALIDATION_/i,
      /\bvalues?\s+for\s+(?:`)?VALIDATION_/i,
    ];

    function firesM3(line: string): boolean {
      return M3_PATTERNS.some((rx) => rx.test(line));
    }
    function firesM4(line: string, prevLine = ""): boolean {
      const count = CANONICAL_VARS.filter((v) => line.includes(v)).length;
      if (count !== 1) return false;
      for (const rx of OPERATIONAL_INSTRUCTION_RX_LIST) {
        if (rx.test(line)) return false;
      }
      const ctx = line + "\n" + prevLine;
      return CONTRACT_PROSE_MARKERS.some((rx) => rx.test(ctx));
    }

    // ===== M3 FIRES (broken — pre-R29 docs) ===================

    // F29 case: "the four env vars"
    expect(firesM3("Step 3: Set the four env vars in Vercel.")).toBe(true);
    // F29 case: "SUPABASE_* trio"
    expect(firesM3("paste captured values from 0.A.1 + 0.A.4 for the SUPABASE_* trio")).toBe(true);
    // 00-overview.md:175 pre-R29: "Set 3 VALIDATION_* env vars"
    expect(firesM3("Set 3 VALIDATION_* env vars locally + in Vercel.")).toBe(true);
    // 01-phase0-infra.md:73 pre-R29: "the 4 new VALIDATION_* env vars"
    expect(firesM3("document the 4 new VALIDATION_* env vars")).toBe(true);
    // 01-phase0-infra.md:179 pre-R29: "Four VALIDATION_* env vars"
    expect(firesM3("Four VALIDATION_* env vars set in Vercel Production scope")).toBe(true);
    // Compound cardinality + env-vars-noun:
    expect(firesM3("all four env vars set per the contract")).toBe(true);
    expect(firesM3("the three env vars MUST be set")).toBe(true);

    // ===== M3 PASSES (legitimate non-contract uses) ============

    // "all four artifacts" — noun is "artifacts", NOT env/VALIDATION.
    expect(firesM3("Confirm all four Phase 0.A artifacts exist:")).toBe(false);
    // "all four journeys" — noun is "journeys".
    expect(firesM3("all four journeys (J1–J4) were run end-to-end")).toBe(false);
    // "all four stages" (master spec language).
    expect(firesM3("explicit with all four stages")).toBe(false);
    // Wildcard-only (no cardinality):
    expect(firesM3("Set VALIDATION_* env vars in Vercel + locally.")).toBe(false);
    expect(firesM3("VALIDATION_* env vars in .env.local.example")).toBe(false);

    // ===== M4 FIRES (contract-prose context with single literal) ==

    // F29 case: "names VALIDATION_J3_CLAIM_EMAIL alongside the trio for the four env vars"
    expect(
      firesM4(
        "names VALIDATION_J3_CLAIM_EMAIL alongside the SUPABASE_* trio for the four env vars",
      ),
    ).toBe(true);
    // F29 case: "the four env vars including VALIDATION_J3_CLAIM_EMAIL"
    expect(firesM4("the four env vars including VALIDATION_J3_CLAIM_EMAIL")).toBe(true);
    // Pre-R29 plan 01:73-style fragment with CARDINALITY+collective
    // marker + single literal — fires M4 (the canonical literal is
    // being named alongside a contract-cardinality marker, NOT just
    // alongside the bare phrase "env var").
    expect(
      firesM4(
        "documents the 4 new VALIDATION_* env vars including VALIDATION_J3_CLAIM_EMAIL",
      ),
    ).toBe(true);
    // Previous-line carries the contract-prose marker (the four):
    expect(
      firesM4(
        "this row requires VALIDATION_SUPABASE_URL for target validation.",
        "Required: the four env vars listed below.",
      ),
    ).toBe(true);
    // VALIDATION_* wildcard reference + single literal on same line:
    expect(
      firesM4(
        "the VALIDATION_* env vars (including VALIDATION_J3_CLAIM_EMAIL) follow the §9.1.2 contract",
      ),
    ).toBe(true);

    // ===== M4 PASSES (operational instructions) =================

    // Operational: "set X to your Google account email"
    expect(
      firesM4(
        "set VALIDATION_J3_CLAIM_EMAIL to the dev's real Google account email.",
      ),
    ).toBe(false);
    // Operational: "throw if X is undefined"
    expect(firesM4("throw if VALIDATION_J3_CLAIM_EMAIL is undefined")).toBe(false);
    // Operational: "X is required"
    expect(firesM4("VALIDATION_SUPABASE_URL is required for the reseed script.")).toBe(false);
    // Operational: "X must be set"
    expect(firesM4("VALIDATION_SUPABASE_PROJECT_REF must be set.")).toBe(false);
    // Operational: "X reads from .env.local"
    expect(firesM4("VALIDATION_J3_CLAIM_EMAIL reads from your local .env.local.")).toBe(false);
    // Operational-note label:
    expect(
      firesM4(
        "Operational note: set VALIDATION_J3_CLAIM_EMAIL to a real Google email.",
      ),
    ).toBe(false);
    // "responding at VALIDATION_SUPABASE_URL" — narrative pointer
    expect(firesM4("Supabase prod project responding at VALIDATION_SUPABASE_URL")).toBe(false);
    // Single literal but NO contract-prose marker on this OR prev line:
    expect(firesM4("Tap the alias_5a_lead row to mint the picker cookie.")).toBe(false);
    expect(firesM4("logs the resolved UUID for VALIDATION_SUPABASE_URL inspection")).toBe(false);
    // R29 narrower M4 — bare "env var" + single literal in narrative
    // prose is NOT contract enumeration. R13-amendment / R15 rationale
    // paragraphs in spec §3.3 and plan 03 that explain "the reseed
    // reads env var X and writes it as Y" must PASS — they're
    // operational narrative, not contract enumeration. The F29 trap
    // is COLLECTIVE references ("the four", "trio", "all four") not
    // any mention of "env var" near a single literal.
    expect(
      firesM4(
        "the reseed reads this env var VALIDATION_J3_CLAIM_EMAIL at fixture-build time and writes it",
      ),
    ).toBe(false);
    expect(
      firesM4(
        "via a new env var VALIDATION_J3_CLAIM_EMAIL the dev sets in Phase 0.A",
      ),
    ).toBe(false);
    expect(
      firesM4(
        "predicate (k) fails if VALIDATION_J3_CLAIM_EMAIL is still a placeholder reserved domain at seed time",
      ),
    ).toBe(false);
    // Bare "credentials" + single literal — also legitimate narrative.
    expect(
      firesM4("the credentials are stored under VALIDATION_SUPABASE_SECRET_KEY in Vercel"),
    ).toBe(false);

    // ===== Combined: legitimate spec-§9.1.2 cross-references PASS ==

    // The post-R29 plan 01:73 wording should NOT fire either rule.
    const postR29Plan01Line73 =
      "Modify: `.env.local.example` (document the M12 validation env vars per spec §9.1.2 — the canonical CLI command-by-command env-var contract; §9.1.2 is the SOLE source of truth and this row deliberately does NOT inline-restate the literal env-var names.";
    // M3: no cardinality+wildcard / cardinality+env-vars-noun shape
    // (the standalone "env vars" mention isn't preceded by a
    // cardinality token like "four"/"3"/"the four").
    expect(firesM3(postR29Plan01Line73)).toBe(false);
    // M4: no canonical literal on the line.
    expect(firesM4(postR29Plan01Line73)).toBe(false);

    // Step 3a post-R29: "Operational note" frame.
    const postR29Step3a =
      "Operational note — set `VALIDATION_J3_CLAIM_EMAIL` to the dev's real Google account email.";
    expect(firesM3(postR29Step3a)).toBe(false);
    expect(firesM4(postR29Step3a)).toBe(false);

    // Step 3 post-R29: pure cross-ref.
    const postR29Step3 =
      "Set the M12 validation env vars in Vercel Production scope per the canonical CLI command-by-command env-var contract at spec §9.1.2.";
    // M3: "the M12 validation env vars" — "M12" is not a cardinality
    // token so the cardinality+env-vars-noun pattern does not match.
    expect(firesM3(postR29Step3)).toBe(false);
    // M4: no single canonical literal on the line.
    expect(firesM4(postR29Step3)).toBe(false);
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

  // R23 commit 52 — F21-class prose-consistency structural defense.
  // F21-class is the "prose contradicts a newly-amended contract"
  // failure mode (R20 F21 + R22 F22/F23). R21 (C) class-sweep was
  // spec-and-§-section scoped and missed plan-side surfaces (summary
  // openers, commit-message templates, failure-mode catalogs,
  // narrative paragraphs across plan files, the milestone handoff).
  // R22 surfaced 2 distinct F21-class peers in one round (F22+F23);
  // R23 (A) comprehensive re-analysis surfaced 1 additional peer at
  // 00-overview.md:153, breaching the 3-peer threshold and firing
  // this structural defense per M12 plan R5 precedent.
  //
  // The assertion grep-walks every M12 doc surface (spec + plan tree
  // + milestone handoff, excluding §15 audit-trail and EXCLUDED_PATHS
  // historical-record sections) for two contract-drift wording
  // classes:
  //
  //   (1) Dual-source-sentinel drift — wording that frames the
  //       show_share_tokens row as trigger-only OR asserts the reseed
  //       does NOT write the row OR points operators at manual SQL
  //       backfill as a normal repair path. Per spec §3.3 lockstep +
  //       §3.3.2 R19 commit 43 + R21 commit 45 + R23 commit 48: the
  //       row is maintained by a dual-source sentinel (trigger on
  //       initial INSERT + mint RPC self-heal on every UPSERT update-
  //       path reseed). Forbidden wording: "no direct write to
  //       show_share_tokens is needed", "trigger only", "trigger-
  //       only sentinel", "manual SQL backfill" as a recurring
  //       repair step.
  //
  //   (2) Stable-id drift — wording that implies reseed DELETEs +
  //       INSERTs (recreates rows with fresh ids) the claimed rows.
  //       Per spec §3.3 Cleanup contract + R13 commit 31 F11 + R23
  //       commit 49 F23 + R23 commit 51: the mint RPC's ON CONFLICT
  //       (show_id, name) DO UPDATE preserves the stable
  //       crew_members.id and only resets claimed_via_oauth_at to
  //       NULL. Devices holding stale cookies remain valid because
  //       the id is unchanged. Forbidden wording: "fresh ids" /
  //       "fresh crew_members.id" / "re-creates the affected rows" /
  //       "creates affected rows with fresh ids" in the context of
  //       reseed/OAuth-claim reset.
  //
  // Each match must EITHER be inside a recognised "historical
  // narrative" frame (a sentence that explicitly cites a pre-R19/
  // pre-R13 / "pre-R23" / "pre-amendment" / "earlier draft" /
  // "originally" qualifier within ~120 chars before the match), OR
  // carry an inline `<!-- not-f21-class: <reason> -->` waiver
  // comment within ~200 chars before the match. Anything else is a
  // contract-drift hit and fails the assertion.
  test("F21-class prose-consistency: dual-source-sentinel + stable-id contracts hold across all M12 prose surfaces", () => {
    const F21_FORBIDDEN_PATTERNS: Array<{ class: string; rx: RegExp; explain: string }> = [
      {
        class: "dual-source-sentinel:no-direct-write",
        rx: /no\s+direct\s+write\s+to\s+`?show_share_tokens`?\s+is\s+needed/i,
        explain:
          "show_share_tokens IS written by the mint RPC's section 2.6 self-heal INSERT...ON CONFLICT DO NOTHING on every reseed (R19 commit 43 + R21 commit 45 + R23 commit 48). The trigger-only framing is retired.",
      },
      {
        class: "dual-source-sentinel:trigger-only-sentinel",
        // Require positive framing — exclude phrasing where the
        // assertion is explicitly negated ("NOT a trigger-only
        // sentinel" / "not trigger-only" / "no longer trigger-only").
        // The negation form is the post-amendment corrective wording
        // (it tells the implementer what the contract is NOT) and
        // should pass.
        rx: /(?<!\b(?:not|no\s+longer|never)\s+(?:a\s+)?)trigger[\s-]*only\s+sentinel/i,
        explain:
          "Predicate (g) is a DUAL-source sentinel (trigger on initial INSERT AND mint RPC self-heal on UPSERT update-path), not trigger-only.",
      },
      {
        class: "stable-id:fresh-ids",
        rx: /\bfresh\s+(?:crew_members\.id|ids)\b/i,
        explain:
          "Reseed PRESERVES crew_members.id via ON CONFLICT (show_id, name) DO UPDATE; only claimed_via_oauth_at is reset to NULL. The 'fresh ids' wording implies DELETE+INSERT semantics and contradicts the row-stability contract J3's multi-step walk relies on (R13 commit 31 + R23 commit 49 + R23 commit 51).",
      },
      {
        class: "stable-id:re-creates-affected-rows",
        rx: /re[\s-]?creates?\s+(?:the\s+)?affected\s+rows/i,
        explain:
          "Same as 'fresh ids' — reseed PRESERVES the stable crew_members.id; the wording 'recreates the affected rows' implies DELETE+INSERT and contradicts the canonical Cleanup contract.",
      },
      // R33 commit 70 — F21-class regex extension for the R31/F31
      // "producer table" prose-contradiction shape. F31 (R32 finding)
      // surfaced that the pre-R31 spec §4.2 + §9.1.2 wording framed
      // `reports` as the singular target of validation-report-fixtures.
      // Per R31 producer-map ratification (handoff §9 R31 §A): the
      // harness writes to THREE producer tables (`reports`,
      // `report_rate_limits`, `admin_alerts`) — never just `reports`
      // alone. These two regexes catch the singular-`reports`-target
      // prose-contradiction shape that the prior 4 regexes (F22/F23-
      // shape) didn't cover.
      {
        class: "producer-table:reports-only-target",
        // Match prose framing the validation-report-fixtures HARNESS
        // as `targets ONLY reports` (the pre-R31 §15:1178 historical
        // form is preserved by stripFifteen). The negative-case
        // fixture below ensures the regex fires on the broken shape
        // ("harness targets ONLY `reports`") but passes the post-R33
        // corrective form ("targets ONLY the three v1 producer
        // tables") because the bare `reports` literal is not the
        // immediate object after ONLY in the latter.
        rx: /\b(?:harness\s+)?targets?\s+ONLY\s+`?reports`?\b/i,
        explain:
          "validation-report-fixtures writes to THREE producer tables (`reports` + `report_rate_limits` + `admin_alerts`) per R31 producer-map ratification (handoff §9 R31 §A). The 'targets ONLY `reports`' framing is producer-state mismatch — it materializes nothing observable for rate-limit-admin/crew (those write to `report_rate_limits`, not `reports`) and only a fraction of the observable surface for lookup-inconclusive/orphaned-lost-lease (those primary-surface through `admin_alerts` + `AlertBanner`). Cross-reference the producer-map at handoff §9 R31 §A.",
      },
      {
        class: "producer-table:singular-failure-state",
        // Match prose claiming validation-report-fixtures
        // "materializes the named failure state in the `reports`
        // table" or "INSERTs / UPDATEs the `reports` table directly".
        // Post-R31 wording is "materializes each named failure state
        // via the per-outcome producer-state map" — `via` not `in`,
        // so the corrective form passes. The regex requires both the
        // materialization verb AND the `reports`-as-sole-target
        // wording within a bounded window to avoid false positives on
        // prose that legitimately mentions both concepts in different
        // contexts (e.g., the corrective spec §4.2 row mentions
        // `materializ` and `reports` but separated by 100+ chars of
        // producer-map enumeration).
        rx: /\b(?:materializ\w+\s+(?:the\s+named\s+failure\s+state|each\s+outcome[^.]{0,40})\s+in\s+the\s+`?reports`?\s+table\b|INSERTs?\s*\/\s*UPDATEs?\s+the\s+`?reports`?\s+table\s+directly)/i,
        explain:
          "validation-report-fixtures does NOT materialize each outcome in the `reports` table directly — per R31 producer-map (handoff §9 R31 §A), rate-limit-admin/crew materialize in `report_rate_limits` and lookup-inconclusive/orphaned-lost-lease materialize primarily in `admin_alerts`. The pre-R31 wording 'INSERTs / UPDATEs the `reports` table directly via service role' silently retires the 3-table producer set. Rewrite as 'per-outcome producer-state map per handoff §9 R31 §A' OR enumerate the 3 tables with their per-outcome routing.",
      },
    ];

    const HISTORICAL_QUALIFIER_RX =
      /\b(pre-R\d+|pre-r\d+|pre-amendment|earlier\s+draft|original\s+draft|originally\s+drafted|originally\s+framed|legacy|retired|deprecated|historical|before\s+R\d+|prior\s+to\s+R\d+|the\s+pre-R\d+\s+|F\d+\s+finding\s+pre-)\b/i;
    const WAIVER_RX = /<!--\s*not-f21-class:\s*[^-]/i;
    // For prose like "M11.5-delta-for-m12" or list items quoting
    // historical fixture vocabulary (alias_5a_lead_for_revoke), the
    // historical-qualifier check above is the primary gate. The
    // waiver comment is the explicit escape hatch.

    const SCAN_FILE_LIST = [
      SPEC_FILE,
      ...collectMarkdown(
        "docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation",
      ),
      "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/handoffs/M12-solo-dev-ux-validation.md",
    ];

    // Files where contract-drift wording is legitimately quoted as
    // part of the convergence-log finding tables (the milestone
    // handoff records every finding verbatim, including the broken
    // wording the patch repaired). The §15 audit-trail in the spec
    // is also history-by-design. stripFifteen() handles §15; we
    // exclude the handoff file wholesale here (same posture as
    // EXCLUDED_PATHS above).
    const F21_EXCLUDED_PATHS = new Set([
      "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/handoffs/M12-solo-dev-ux-validation.md",
      SELF,
    ]);

    const findings: string[] = [];

    for (const file of SCAN_FILE_LIST) {
      if (F21_EXCLUDED_PATHS.has(file)) continue;
      let raw: string;
      try {
        raw = readFileSync(join(ROOT, file), "utf8");
      } catch {
        continue;
      }
      const source = stripFifteen(raw);

      for (const pattern of F21_FORBIDDEN_PATTERNS) {
        const matches = [...source.matchAll(new RegExp(pattern.rx.source, pattern.rx.flags + "g"))];
        for (const m of matches) {
          const idx = m.index!;
          const linesBefore = source.substring(0, idx).split("\n");
          const lineNum = linesBefore.length;
          const lookbackStart = Math.max(0, idx - 200);
          const lookbackWindow = source.substring(lookbackStart, idx + m[0].length);

          if (HISTORICAL_QUALIFIER_RX.test(lookbackWindow)) continue;
          if (WAIVER_RX.test(lookbackWindow)) continue;

          findings.push(
            `  ${file}:${lineNum} [${pattern.class}]\n` +
              `      matched: "${m[0]}"\n` +
              `      context: ${(source.split("\n")[lineNum - 1] ?? "").substring(0, 200)}...\n` +
              `      reason:  ${pattern.explain}`,
          );
        }
      }
    }

    if (findings.length > 0) {
      expect.fail(
        `R23 commit 52 F21-class prose-consistency guard: ${findings.length} contract-drift wording site(s) detected across the M12 prose surfaces.\n\n` +
          findings.join("\n\n") +
          `\n\nFix options for each finding:\n` +
          `  (a) Rewrite the prose to match the canonical contract (dual-source sentinel for show_share_tokens; stable crew_members.id with claimed_via_oauth_at-only reset).\n` +
          `  (b) Frame the wording as a historical-narrative quote by prefixing within ~120 chars: "pre-R19 / pre-R13 / earlier draft / originally drafted / retired / historical".\n` +
          `  (c) Add an inline <!-- not-f21-class: <reason> --> waiver comment within ~200 chars before the match.\n\n` +
          `This guard codifies the F21-class structural defense per R23 dispatch + M12 plan R5 precedent. The F21-class same-vector has now closed at the contract level: future prose drift fails CI at write time.`,
      );
    }
  });

  // R23 commit 52 F21-class structural-defense negative-case test.
  // Mirrors the F24 negative-case pattern: synthetic fixtures with
  // the forbidden wording MUST trigger the regex/historical-window
  // logic; synthetic fixtures with the corrective negation OR a
  // historical-qualifier prefix OR an inline waiver MUST pass.
  //
  // This pins the regex semantics at CI time so future edits to
  // the F21-class assertion cannot relax the contract by accident.
  test("F21-class structural-defense negative case: synthetic broken-prose fixtures trigger the regex; corrective-negation + historical-frame + waiver fixtures pass", () => {
    const F21_FORBIDDEN_PATTERNS: Array<{ class: string; rx: RegExp }> = [
      {
        class: "dual-source-sentinel:no-direct-write",
        rx: /no\s+direct\s+write\s+to\s+`?show_share_tokens`?\s+is\s+needed/i,
      },
      {
        class: "dual-source-sentinel:trigger-only-sentinel",
        rx: /(?<!\b(?:not|no\s+longer|never)\s+(?:a\s+)?)trigger[\s-]*only\s+sentinel/i,
      },
      {
        class: "stable-id:fresh-ids",
        rx: /\bfresh\s+(?:crew_members\.id|ids)\b/i,
      },
      {
        class: "stable-id:re-creates-affected-rows",
        rx: /re[\s-]?creates?\s+(?:the\s+)?affected\s+rows/i,
      },
      // R33 commit 70 — F31 producer-table shape (synced with main
      // F21_FORBIDDEN_PATTERNS above).
      {
        class: "producer-table:reports-only-target",
        rx: /\b(?:harness\s+)?targets?\s+ONLY\s+`?reports`?\b/i,
      },
      {
        class: "producer-table:singular-failure-state",
        rx: /\b(?:materializ\w+\s+(?:the\s+named\s+failure\s+state|each\s+outcome[^.]{0,40})\s+in\s+the\s+`?reports`?\s+table\b|INSERTs?\s*\/\s*UPDATEs?\s+the\s+`?reports`?\s+table\s+directly)/i,
      },
    ];
    const HISTORICAL_QUALIFIER_RX =
      /\b(pre-R\d+|pre-r\d+|pre-amendment|earlier\s+draft|original\s+draft|originally\s+drafted|originally\s+framed|legacy|retired|deprecated|historical|before\s+R\d+|prior\s+to\s+R\d+|the\s+pre-R\d+\s+|F\d+\s+finding\s+pre-)\b/i;
    const WAIVER_RX = /<!--\s*not-f21-class:\s*[^-]/i;

    function fixtureFiresF21Class(
      text: string,
    ): { fires: boolean; matchedPattern: string | null } {
      for (const pattern of F21_FORBIDDEN_PATTERNS) {
        const m = text.match(pattern.rx);
        if (!m || m.index === undefined) continue;
        const idx = m.index;
        const lookbackStart = Math.max(0, idx - 200);
        const lookbackWindow = text.substring(lookbackStart, idx + m[0].length);
        if (HISTORICAL_QUALIFIER_RX.test(lookbackWindow)) continue;
        if (WAIVER_RX.test(lookbackWindow)) continue;
        return { fires: true, matchedPattern: pattern.class };
      }
      return { fires: false, matchedPattern: null };
    }

    // BROKEN fixtures (pre-R23 F22/F23/00-overview style).

    const brokenF22Opener =
      "The show_share_tokens row is auto-created by the existing trigger when the reseed RPC inserts the show; no direct write to `show_share_tokens` is needed.";
    expect(fixtureFiresF21Class(brokenF22Opener)).toEqual({
      fires: true,
      matchedPattern: "dual-source-sentinel:no-direct-write",
    });

    const brokenTriggerOnlySentinel =
      "Predicate (g) of check-seed is the trigger-only sentinel — it fires when ANY seeded show is missing its show_share_tokens row.";
    expect(fixtureFiresF21Class(brokenTriggerOnlySentinel)).toEqual({
      fires: true,
      matchedPattern: "dual-source-sentinel:trigger-only-sentinel",
    });

    const brokenF23FreshIds =
      "The next --combo all after an OAuth-claim walk re-creates the affected rows with fresh ids and null claimed_via_oauth_at, restoring the baseline.";
    const brokenF23Result = fixtureFiresF21Class(brokenF23FreshIds);
    expect(brokenF23Result.fires).toBe(true);
    expect([
      "stable-id:fresh-ids",
      "stable-id:re-creates-affected-rows",
    ]).toContain(brokenF23Result.matchedPattern);

    const brokenOverviewRow =
      "Re-seed has no equivalent cleanup; --combo all is the structural reset for OAuth-claim state (fresh crew_members.id with null claimed_via_oauth_at)";
    expect(fixtureFiresF21Class(brokenOverviewRow)).toEqual({
      fires: true,
      matchedPattern: "stable-id:fresh-ids",
    });

    // PASSING fixtures (corrective negation / historical frame /
    // waiver). MUST NOT fire.

    const correctiveNegationOfTriggerOnly =
      "The self-heal is a load-bearing part of the reseed contract — NOT a trigger-only sentinel.";
    expect(fixtureFiresF21Class(correctiveNegationOfTriggerOnly).fires).toBe(false);

    const historicalFrameFreshIds =
      "Pre-R19 the spec described --combo all as re-creating the affected rows with fresh ids — that framing was retired in R13 commit 31 F11 amendment.";
    expect(fixtureFiresF21Class(historicalFrameFreshIds).fires).toBe(false);

    const waiverFreshIds =
      "<!-- not-f21-class: quoting historical finding F11 verbatim --> the pre-rebase wording said 'fresh ids' here.";
    expect(fixtureFiresF21Class(waiverFreshIds).fires).toBe(false);

    // Edge case: corrective negation with "no longer" prefix.
    const noLongerTriggerOnly =
      "Predicate (g) is no longer a trigger-only sentinel — see R19 commit 43 self-heal amendment.";
    expect(fixtureFiresF21Class(noLongerTriggerOnly).fires).toBe(false);

    // Edge case: canonical prose with no forbidden patterns.
    const canonicalProse =
      "The show_share_tokens row is maintained by a dual-source sentinel: trigger on initial INSERT plus mint RPC self-heal on every UPSERT update-path reseed. Reseed PRESERVES the stable crew_members.id and resets claimed_via_oauth_at to NULL.";
    expect(fixtureFiresF21Class(canonicalProse).fires).toBe(false);

    // R33 commit 70 F31 producer-table shape — broken + corrective
    // fixtures.

    // BROKEN (pre-R31 §4.2 paragraph (a) — F31 named hit).
    const brokenF31SingularFailureState =
      "The harness materializes the named failure state in the `reports` table (the only v1 admin-only table in this domain) by writing row shapes per master spec §13.2.3 contracts.";
    expect(fixtureFiresF21Class(brokenF31SingularFailureState)).toEqual({
      fires: true,
      matchedPattern: "producer-table:singular-failure-state",
    });

    // BROKEN (pre-R31 §9.1.2 producer-state column — F31 named hit).
    const brokenF31InsertsUpdatesReports =
      "INSERTs / UPDATEs the `reports` table directly via service role to materialize each outcome's row shape per master spec §13.2.3";
    expect(fixtureFiresF21Class(brokenF31InsertsUpdatesReports)).toEqual({
      fires: true,
      matchedPattern: "producer-table:singular-failure-state",
    });

    // BROKEN (hypothetical pre-R31 §15 historical-narrative form,
    // stripped from real audit-trail use via stripFifteen + corrective
    // negation in the post-R31 spec). Demonstrates the
    // `producer-table:reports-only-target` regex fires on the bare
    // shape.
    const brokenF31HarnessTargetsOnlyReports =
      "Harness targets ONLY `reports` (the v1 admin-only table) — this is producer-state mismatch.";
    expect(fixtureFiresF21Class(brokenF31HarnessTargetsOnlyReports)).toEqual({
      fires: true,
      matchedPattern: "producer-table:reports-only-target",
    });

    // PASSING — post-R33 corrective form. Bare `reports` is NOT the
    // immediate object after ONLY; the regex's `\bONLY\s+`?reports`?\b`
    // anchor requires literal-`reports`-after-ONLY, which is the
    // pre-R31 shape only.
    const correctiveF31ThreeTables =
      "The harness targets ONLY the three v1 producer tables enumerated above (`reports` + `report_rate_limits` + `admin_alerts` — all v1 admin-only tables per master spec §4.3); the producer-set is NOT singular.";
    expect(fixtureFiresF21Class(correctiveF31ThreeTables).fires).toBe(false);

    // PASSING — post-R33 corrective form using `via` (producer-map)
    // instead of `in` (singular-table) for the materialization verb.
    const correctiveF31ViaProducerMap =
      "The harness materializes each named failure state via the per-outcome producer-state map (R31 ratification; canonical source at handoff §9 R31 §A).";
    expect(fixtureFiresF21Class(correctiveF31ViaProducerMap).fires).toBe(false);

    // PASSING — historical-frame around the pre-R31 wording.
    const historicalFrameF31 =
      "Pre-R31 the spec wording 'materializes the named failure state in the `reports` table' was producer-state mismatch — retired in R31 commit a5ed46f producer-map ratification.";
    expect(fixtureFiresF21Class(historicalFrameF31).fires).toBe(false);
  });
});
