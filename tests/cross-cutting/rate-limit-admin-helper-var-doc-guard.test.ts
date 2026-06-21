import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// R35 commit 72 F33 helper-categorization structural defense.
//
// R33 commit 68 added `VALIDATION_ADMIN_EMAIL` as a per-outcome helper
// variable scoped to ONE specific CLI/outcome:
// `validation:report-fixtures --outcome rate-limit-admin`. It is NOT
// part of the canonical 4-var validation env-var contract (the
// SUPABASE trio + J3 claim email) governed by the structural-
// exclusivity walker at
// `tests/cross-cutting/reseed-clears-oauth-claim-doc-guard.test.ts`
// (which deliberately stays at canonical-4 to keep the contract
// surface stable — see the R35 walker-decision rationale in plan
// 01 commit 71 + the R35 handoff F33 row).
//
// R34 surfaced F33 (HIGH): R33 missed the propagation gap — the env
// template at plan 01 Phase 0.A.5 didn't name the helper var. Per
// AGENTS.md "fix-round regression budget" rule, R35 closes the
// propagation gap at the plan template AND ships THIS structural
// defense so future M12 doc surfaces that reference `rate-limit-admin`
// or `REPORT_RATE_LIMITED_ADMIN` in a contract-discussion context
// MUST cite `VALIDATION_ADMIN_EMAIL` near the discussion OR carry an
// explicit cross-reference to the canonical contract site (spec
// §9.1.2 report-fixtures row OR handoff §9 R31 producer map).
//
// The structural-exclusivity walker can't cover this surface because
// ADMIN_EMAIL is NOT a canonical literal in its CANONICAL_VARS list.
// This dedicated walker IS the F33 helper-scope defense.

const ROOT = process.cwd();
const SELF = "tests/cross-cutting/rate-limit-admin-helper-var-doc-guard.test.ts";

const SPEC_FILE =
  "docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation-design.md";
const HANDOFF_FILE =
  "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/handoffs/M12-solo-dev-ux-validation.md";
const PLAN_TREE =
  "docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation";

// The handoff file's convergence log legitimately quotes the F32 / F33
// finding wording verbatim (historical record), so it's excluded
// wholesale — mirrors the EXCLUDED_PATHS pattern used by the
// structural-exclusivity walker.
const EXCLUDED_PATHS = new Set([HANDOFF_FILE, SELF]);

// The strict canonical-source marker is the same one used by the
// structural-exclusivity walker — spec §9.1.2 carries it; the
// `.env.local.example` template block at plan 01 carries it. Inside
// either authorized surface, contract enumerations are by design.
const CANONICAL_SOURCE_MARKER = "canonical-env-var-source: keep";

// Contract-discussion context signals: when `rate-limit-admin` or
// `REPORT_RATE_LIMITED_ADMIN` appears NEAR any of these tokens, the
// discussion is about the harness/quota contract (where ADMIN_EMAIL is
// the load-bearing dependency) rather than a passing mention.
const CONTRACT_CONTEXT_TOKENS: RegExp[] = [
  /report_rate_limits/,
  /\bidentity\b/i,
  /canonicaliz/i,
  /\bcleanup\b/i,
  /\bharness\b/i,
  /\bINSERT\b/,
  /\bUPSERT\b/i,
  /\bquota\b/i,
  /\benforceQuota\b/,
  /\bbucket\b/i,
  /\bhour_bucket\b/i,
  /producer[\s-]*state/i,
  /producer[\s-]*table/i,
  /\bfixture-/i,
  /\bvalidation:report-fixtures\b/,
  /--outcome/,
];

// Cross-reference signals: either of these inside the ±10-line window
// counts as a legitimate pointer to the canonical contract site.
const CROSS_REF_TOKENS: RegExp[] = [
  /VALIDATION_ADMIN_EMAIL/,
  /spec\s*§\s*9\.1\.2/i,
  /§\s*9\.1\.2/i,
  /handoff\s*§\s*9/i,
  /R31\s*(?:commit|producer|§A)/i,
  /R33\s*commit\s*6[89]/i,
  /R33\s*commit\s*70/i,
  /<!--\s*not-rate-limit-admin-class:\s*[^-]/i,
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
  // Spec §15 audit-trail historically quotes broken patterns by design.
  // Plan files have no §15-equivalent (no-op for plan tree).
  const lines = source.split("\n");
  let in15 = false;
  return lines
    .map((ln) => {
      if (!in15 && /^##\s+15\.\s/.test(ln)) in15 = true;
      return in15 ? "" : ln;
    })
    .join("\n");
}

// Returns true if the cluster window (±10 lines around the
// rate-limit-admin / REPORT_RATE_LIMITED_ADMIN occurrence) carries
// EITHER an ADMIN_EMAIL citation OR an explicit cross-reference to
// the canonical contract site.
function clusterCarriesContract(
  window: string,
  expectedFound: { found: boolean; via: string | null } = { found: false, via: null },
): { found: boolean; via: string | null } {
  for (const rx of CROSS_REF_TOKENS) {
    if (rx.test(window)) {
      return { found: true, via: rx.toString() };
    }
  }
  return expectedFound;
}

function clusterIsContractDiscussion(window: string): boolean {
  return CONTRACT_CONTEXT_TOKENS.some((rx) => rx.test(window));
}

// Returns null if the doc surface passes; otherwise a list of
// finding strings.
function scanFileForRateLimitAdminContract(file: string, source: string): string[] {
  const lines = source.split("\n");
  const findings: string[] = [];

  // Detect canonical-source-marker scope: any line inside spec §9.1.2's
  // heading scope OR inside a fenced block carrying the marker is
  // exempt (the contract enumeration lives there by design).
  const markerExempt: boolean[] = new Array(lines.length).fill(false);

  // §9.1.2 heading scope (spec only).
  if (file === SPEC_FILE) {
    let in912 = false;
    for (let i = 0; i < lines.length; i++) {
      if (/^###\s+9\.1\.2\b/.test(lines[i]!)) in912 = true;
      else if (in912 && /^###?\s+9\.[1-9]\.[3-9]\b/.test(lines[i]!)) in912 = false;
      else if (in912 && /^##\s+/.test(lines[i]!)) in912 = false;
      if (in912) markerExempt[i] = true;
    }
  }

  // Fenced-block scope around any `canonical-env-var-source: keep`
  // marker (plan 01 .env.local.example template).
  const inFence: boolean[] = new Array(lines.length).fill(false);
  let fenceOpen = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^```/.test(lines[i]!)) {
      fenceOpen = !fenceOpen;
      inFence[i] = fenceOpen;
      continue;
    }
    inFence[i] = fenceOpen;
  }
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]!.includes(CANONICAL_SOURCE_MARKER)) continue;
    // Marker inside / immediately above a fence — exempt the whole fence.
    if (inFence[i]) {
      let s = i;
      while (s > 0 && inFence[s - 1] && !/^```/.test(lines[s - 1]!)) s--;
      let e = i;
      while (e < lines.length - 1 && inFence[e + 1] && !/^```/.test(lines[e + 1]!)) e++;
      for (let k = s; k <= e; k++) markerExempt[k] = true;
    } else {
      // Look ahead past blank / comment lines for a fence opener.
      let probe = i + 1;
      while (probe < lines.length && /^\s*(#|<!--|$)/.test(lines[probe]!)) probe++;
      if (probe < lines.length && /^```/.test(lines[probe]!)) {
        const s = probe;
        let e = probe;
        while (e + 1 < lines.length && !/^```/.test(lines[e + 1]!)) e++;
        if (e + 1 < lines.length) e++;
        for (let k = s; k <= e; k++) markerExempt[k] = true;
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    if (markerExempt[i]) continue;
    const line = lines[i]!;
    // Trigger on either token.
    if (!/rate-limit-admin\b/.test(line) && !/REPORT_RATE_LIMITED_ADMIN/.test(line)) continue;

    // Skip historical-finding rows (pre-R33 / pre-amendment quotes).
    const HISTORICAL_QUALIFIER_RX =
      /\b(pre-R\d+|pre-r\d+|pre-amendment|earlier\s+draft|originally\s+drafted|legacy|retired|deprecated|historical|prior\s+to\s+R\d+|F3[12]\s+finding)\b/i;
    const wbStart = Math.max(0, i - 5);
    const wbEnd = Math.min(lines.length, i + 6);
    const tightWindow = lines.slice(wbStart, wbEnd).join("\n");
    if (HISTORICAL_QUALIFIER_RX.test(tightWindow)) continue;

    // Wider cluster window for contract / cross-ref detection.
    const clusterStart = Math.max(0, i - 10);
    const clusterEnd = Math.min(lines.length, i + 11);
    const clusterWindow = lines.slice(clusterStart, clusterEnd).join("\n");

    // Only fire on contract-discussion contexts. Passing mentions
    // (e.g., a list of modal outcome codes) are exempt.
    if (!clusterIsContractDiscussion(clusterWindow)) continue;

    const contractResult = clusterCarriesContract(clusterWindow);
    if (contractResult.found) continue;

    findings.push(
      `  ${file}:${i + 1} (rate-limit-admin contract discussion lacks ADMIN_EMAIL citation OR cross-reference)\n` +
        `      line:        ${line.substring(0, 200)}${line.length > 200 ? "..." : ""}\n` +
        `      cluster:     ±10 lines [${clusterStart + 1}-${clusterEnd}]\n` +
        `      missing:     VALIDATION_ADMIN_EMAIL literal OR cross-reference to spec §9.1.2 / handoff §9 R31`,
    );
  }

  return findings;
}

describe("R35 commit 72 F33 helper-categorization — rate-limit-admin contract structural defense", () => {
  test("every M12 doc surface referencing rate-limit-admin in a contract context cites VALIDATION_ADMIN_EMAIL OR a canonical cross-reference", () => {
    const files = [SPEC_FILE, ...collectMarkdown(PLAN_TREE)];
    const findings: string[] = [];

    for (const file of files) {
      if (EXCLUDED_PATHS.has(file)) continue;
      let raw: string;
      try {
        raw = readFileSync(join(ROOT, file), "utf8");
      } catch {
        continue;
      }
      const source = stripFifteen(raw);
      findings.push(...scanFileForRateLimitAdminContract(file, source));
    }

    if (findings.length > 0) {
      expect.fail(
        `R35 F33 helper-categorization guard: ${findings.length} rate-limit-admin contract-discussion site(s) lack the required ADMIN_EMAIL citation OR canonical cross-reference.\n\n` +
          findings.join("\n\n") +
          `\n\nThe \`rate-limit-admin\` outcome of \`validation:report-fixtures\` requires the \`VALIDATION_ADMIN_EMAIL\` helper env var (R33 commit 68 + R35 commit 71 F33 propagation). Any contract-discussion site (lines naming \`report_rate_limits\` / \`identity\` / \`canonicaliz\` / \`harness\` / \`cleanup\` / \`bucket\` / \`outcome\` / \`producer\` / \`enforceQuota\` / \`fixture-\` / \`validation:report-fixtures\` / \`--outcome\` within ±10 lines of \`rate-limit-admin\` or \`REPORT_RATE_LIMITED_ADMIN\`) MUST EITHER:\n` +
          `  (a) name \`VALIDATION_ADMIN_EMAIL\` literally within the ±10-line window, OR\n` +
          `  (b) carry an explicit cross-reference within the window: \`spec §9.1.2\` / \`§9.1.2\` / \`handoff §9\` / \`R31 commit\` / \`R31 producer\` / \`R31 §A\` / \`R33 commit 68\` / \`R33 commit 69\` / \`R33 commit 70\`, OR\n` +
          `  (c) carry an inline waiver comment: \`<!-- not-rate-limit-admin-class: <reason> -->\`, OR\n` +
          `  (d) be prefixed with a historical-narrative qualifier (\`pre-R33\` / \`originally drafted\` / \`F32 finding\` / \`retired\`).\n\n` +
          `This guard codifies the F33 helper-categorization structural defense. The structural-exclusivity walker at \`tests/cross-cutting/reseed-clears-oauth-claim-doc-guard.test.ts\` does NOT cover ADMIN_EMAIL (it is not a canonical literal in that walker's CANONICAL_VARS list — by design, since ADMIN_EMAIL is per-outcome-scoped rather than CLI-wide). This dedicated walker IS the helper-scope defense.`,
      );
    }
  });

  // Negative-case fixtures pin the regex semantics at CI time — broken
  // synthetic prose MUST trigger the guard; corrective forms MUST pass.
  test("negative case: synthetic broken-prose triggers the guard; corrective + cross-ref + waiver + historical-frame fixtures pass", () => {
    // BROKEN: contract discussion citing rate-limit-admin without
    // ADMIN_EMAIL or any cross-reference.
    const brokenFixture =
      "The harness writes a `report_rate_limits` row for the `rate-limit-admin` outcome with the identity field set to a canonicalized admin email and `count=11`; cleanup deletes the bucket via the standard predicate.";
    const brokenFindings = scanFileForRateLimitAdminContract("synthetic-broken.md", brokenFixture);
    expect(brokenFindings.length).toBeGreaterThan(0);

    // PASSING (a) — names ADMIN_EMAIL within window.
    const passingNamesAdminEmail =
      "The harness writes a `report_rate_limits` row for the `rate-limit-admin` outcome with `identity = canonicalize($VALIDATION_ADMIN_EMAIL)` and `count=11`; cleanup deletes the bucket via the canonical predicate.";
    expect(
      scanFileForRateLimitAdminContract("synthetic-passing-a.md", passingNamesAdminEmail).length,
    ).toBe(0);

    // PASSING (b) — cross-reference to spec §9.1.2.
    const passingCrossRefSpec =
      "The harness writes a `report_rate_limits` row for the `rate-limit-admin` outcome per spec §9.1.2; cleanup deletes the bucket via the canonical predicate.";
    expect(
      scanFileForRateLimitAdminContract("synthetic-passing-b.md", passingCrossRefSpec).length,
    ).toBe(0);

    // PASSING (b') — cross-reference to handoff §9 R31 producer map.
    const passingCrossRefR31 =
      "The harness writes a `report_rate_limits` row for the `rate-limit-admin` outcome per handoff §9 R31 producer map; cleanup deletes the bucket via the canonical predicate.";
    expect(
      scanFileForRateLimitAdminContract("synthetic-passing-b2.md", passingCrossRefR31).length,
    ).toBe(0);

    // PASSING (c) — inline waiver comment.
    const passingWaiver =
      "<!-- not-rate-limit-admin-class: historical finding quote, F32 narrative --> The harness writes a `report_rate_limits` row for the `rate-limit-admin` outcome with the identity field set to a canonicalized admin email.";
    expect(scanFileForRateLimitAdminContract("synthetic-passing-c.md", passingWaiver).length).toBe(
      0,
    );

    // PASSING (d) — historical-narrative qualifier.
    const passingHistorical =
      "Pre-R33 the spec said the harness wrote a `report_rate_limits` row for the `rate-limit-admin` outcome with a `validation:` identity prefix — that wording was retired in R33 commit 68.";
    expect(
      scanFileForRateLimitAdminContract("synthetic-passing-d.md", passingHistorical).length,
    ).toBe(0);

    // PASSING — passing mention (no contract-discussion context).
    const passingNonContract =
      "The four outcomes that flow through ReportModal are IDEMPOTENCY_IN_FLIGHT, REPORT_HORIZON_EXPIRED, REPORT_RATE_LIMITED_ADMIN, and REPORT_RATE_LIMITED_CREW.";
    expect(
      scanFileForRateLimitAdminContract("synthetic-passing-nc.md", passingNonContract).length,
    ).toBe(0);
  });
});
