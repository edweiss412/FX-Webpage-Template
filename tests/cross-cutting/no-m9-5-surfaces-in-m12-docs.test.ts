import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { walkSourceFiles } from "@/lib/messages/__internal__/walkSourceFiles";

/**
 * M12-DOCS-M9.5-SURFACE-WALKER — extend the X.3 retired-surface audit
 * (`tests/cross-cutting/no-m9-5-surfaces.test.ts`) to the M12 solo-dev-ux
 * amendment plan/spec markdown, which lives under `docs/` and is therefore
 * OUT of the X.3 walker's `["app","lib","components","tests"]` scope. A stale
 * M9.5 signed-link reference can land in plan/spec prose without X.3 catching
 * it (R67 F55 surfaced exactly this class on `02-phase0-validation-state.md`).
 *
 * The M12 docs are dominated by LEGITIMATELY-HISTORICAL references — RETIRED
 * markers, "table dropped at cutover" rationale, §15 adversarial audit-trail
 * finding tables, strikethrough rows, the PostgREST-DML-lockdown registry
 * documentation explaining WHY `crew_member_auth` is absent. Those MUST pass.
 * Only a NEW, non-historical reference (a stale citation that survived the
 * picker-pivot rebase) is an offender. The historical-context exclusions below
 * encode the bounded set of legitimate patterns.
 */

const DOCS_ROOTS = [
  "docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation",
];
const DESIGN_SPEC =
  "docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation-design.md";

const CANONICAL_X3_TEST = "tests/cross-cutting/no-m9-5-surfaces.test.ts";

// Mirrors the canonical X.3 forbidden list. The "lockstep" test below pins
// this to the canonical array so the two cannot silently drift.
const TERMS = [
  "crew_member_auth",
  "link_sessions",
  "revoked_links",
  "bootstrap_nonces",
  "validateLinkSession",
  "validateCrewAssetSession",
  "resolveShowViewer",
  "__Host-fxav_session",
  "__Host-fxav_bootstrap_v",
  "IssueLinkButton",
  "RevokeAllLinksButton",
  "signedLinks",
  "signLinkJwt",
  "verifyLinkJwt",
  "app/api/auth/redeem-link",
  "app/show/[slug]/p/",
  "crew_link",
  "crew_google",
] as const;

/**
 * Keywords that, when present near a forbidden term, mark the reference as
 * legitimately historical. NONE of these is a substring of any forbidden term
 * (verified by the anti-self-satisfying guard test below), so a term can never
 * satisfy its own exclusion. Matched case-insensitively.
 */
const HISTORICAL_KEYWORDS = [
  "retired",
  "deleted",
  "dropped",
  "removed",
  "cutover",
  "superseded",
  "historical",
  "precedent",
  "legacy",
  "pre-m11.5",
  "picker-pivot",
  "picker pivot",
  // M9.5-grants + M11.5-cutover migration filenames are unambiguous
  // historical-citation anchors.
  "signed_link_admin_table_grants",
  "cutover_drop_m9_5",
  "20260523000099",
];

const HISTORICAL_WINDOW = 3;

// Plan-wide invariant 2 enumerates the advisory-lock table list, which names
// `crew_member_auth` as a historical member of that mutation set. A line that
// lists it alongside the other lock-guarded tables is documenting the
// invariant, not introducing a live signed-link surface.
const INVARIANT_2_TABLE_LIST =
  /pending_syncs|pending_ingestions|advisory[ _-]?lock|mutates\s+`?shows`?/i;

function isStrikethrough(line: string, term: string): boolean {
  // ~~ ... term ... ~~ on the same line (GFM strikethrough row/cell).
  const strikeSpans = line.match(/~~[^~]*~~/g) ?? [];
  return strikeSpans.some((span) => span.includes(term));
}

function hasHistoricalKeywordNearby(lines: string[], index: number): boolean {
  const lo = Math.max(0, index - HISTORICAL_WINDOW);
  const hi = Math.min(lines.length - 1, index + HISTORICAL_WINDOW);
  for (let i = lo; i <= hi; i += 1) {
    const lower = (lines[i] ?? "").toLowerCase();
    if (HISTORICAL_KEYWORDS.some((kw) => lower.includes(kw))) return true;
  }
  return false;
}

/** True once we have entered the `## 15. Adversarial-review audit trail`
 *  section (and any `### 15.x` subsection) — everything from there on is the
 *  round-by-round finding-table audit record that names the retired vocabulary
 *  as part of the historical convergence log. */
function inAuditTrailSection(lines: string[], index: number): boolean {
  for (let i = index; i >= 0; i -= 1) {
    const ln = lines[i] ?? "";
    const m = ln.match(/^#{1,4}\s+(?:§\s*)?15(\.|\s|$)/);
    if (m) return true;
    // A higher-or-equal-level heading that is NOT §15 closes the window.
    if (/^#{1,2}\s+/.test(ln) && !/^#{1,2}\s+(?:§\s*)?15(\.|\s|$)/.test(ln)) {
      return false;
    }
  }
  return false;
}

type Offender = { file: string; line: number; term: string; text: string };

function scanFile(file: string): Offender[] {
  const offenders: Offender[] = [];
  const lines = readFileSync(file, "utf8").split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    for (const term of TERMS) {
      if (!line.includes(term)) continue;
      if (isStrikethrough(line, term)) continue;
      if (hasHistoricalKeywordNearby(lines, i)) continue;
      if (inAuditTrailSection(lines, i)) continue;
      if (INVARIANT_2_TABLE_LIST.test(line)) continue;
      offenders.push({ file, line: i + 1, term, text: line.trim().slice(0, 160) });
    }
  }
  return offenders;
}

function docFiles(): string[] {
  const planMd = walkSourceFiles(DOCS_ROOTS, { extensions: [".md"] });
  return [...planMd, DESIGN_SPEC];
}

describe("M9.5 signed-link surfaces are absent from M12 amendment docs", () => {
  test("forbidden-term list stays in lockstep with the canonical X.3 audit", () => {
    const canonical = readFileSync(CANONICAL_X3_TEST, "utf8");
    const block = canonical.match(/const TERMS = \[([\s\S]*?)\];/);
    expect(block, "canonical X.3 TERMS array not found").not.toBeNull();
    const canonicalTerms = [...(block![1] ?? "").matchAll(/"([^"]+)"/g)]
      .map((m) => m[1] ?? "")
      .sort();
    expect([...TERMS].sort()).toEqual(canonicalTerms);
  });

  test("historical-exclusion keywords are never substrings of a forbidden term", () => {
    for (const term of TERMS) {
      for (const kw of HISTORICAL_KEYWORDS) {
        expect(
          term.toLowerCase().includes(kw),
          `keyword "${kw}" is a substring of forbidden term "${term}" — exclusion would be self-satisfying`,
        ).toBe(false);
      }
    }
  });

  test("M12 solo-dev-ux plan + design spec carry no NON-historical M9.5 references", () => {
    const offenders = docFiles().flatMap(scanFile);
    expect(
      offenders.map((o) => `${o.file}:${o.line} [${o.term}] ${o.text}`),
      "Each offender is a forbidden M9.5 term in a NON-historical context. If the reference is legitimately historical, add a RETIRED/DROPPED/cutover marker within 3 lines, strike it through, or place it in the §15 audit trail.",
    ).toEqual([]);
  });
});
