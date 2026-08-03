// tests/docs/capabilityClaimProse.test.ts
//
// No `role_flags` element grants admin access. `public.is_admin()` reads the JWT
// `app_metadata.role` claim and the `admin_emails` table and never consults
// `role_flags`; every production use of LEAD is crew-page visibility, financials
// entitlement, capability-change plumbing, or parser vocabulary.
//
// The claim that it DOES grant admin access outlived that fact in three places,
// each found separately: the §12.4 catalog copy (corrected 2026-08-02), master
// spec §6.8 MI-9, and `lib/sync/phase2.ts` — the last two on 2026-08-03. The
// first two are prose a reader trusts; the third is a comment justifying a code
// path. So this guard scans BOTH the spec row and production source: an earlier
// draft scoped to the spec row alone, which left the production comment free to
// regress with the guard still green.
//
// THE RECOGNIZER IS A POSITIVE-CLAIM MATCHER, NOT AN ADMIN/GRANT BAN. The
// corrected MI-9 row deliberately contains both "admin" and "grants" — it says
// neither capability flag grants admin access, and names `is_admin()`. A raw ban
// could never go green. So the matcher requires a capability SUBJECT, a granting
// VERB, and an admin OBJECT in one sentence, with a negation guard. Six fixtures
// below make that reviewable instead of a regex nobody can audit.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { walkPlansTree } from "@/tests/docs/_invariant8Closeout";

const ROOT = process.cwd();
const MASTER_SPEC = "docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md";

const SUBJECT = /\b(LEAD|FINANCIALS|role_flags|capability (?:role|flag))\b/i;
const VERB = /\b(grants?|granting|unlocks?|confers?|gives? access to)\b/i;
const OBJECT = /\b(admin\/ops|ops surface|admin surface|admin access|admin\/financials|ops\/financial)\b/i;
const NEGATED = /\b(no|not|never|neither|nor|does not|doesn't|cannot|can't|no longer)\b/i;

/**
 * True when a sentence positively claims a capability flag confers an admin or
 * ops surface. Negation anywhere in the sentence disqualifies it — the corrected
 * prose says so explicitly, and a guard that fired on the correction would be
 * unusable.
 */
export function claimsAdminGrant(sentence: string): boolean {
  if (!SUBJECT.test(sentence) || !VERB.test(sentence) || !OBJECT.test(sentence)) return false;
  return !NEGATED.test(sentence);
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.;])\s+|\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Every `| MI-9` table row, located by row marker rather than line number. The
 * spec carries two: §6.8's capability statement and the auth-floor table's row.
 * Both are in-force prose, so both are scanned.
 */
function mi9Rows(): string[] {
  const lines = readFileSync(join(ROOT, MASTER_SPEC), "utf8").split("\n");
  return lines.filter((l) => /^\| MI-9\s/.test(l));
}

/** The §6.8 row: the one that states which flags are capability-granting. */
function mi9CapabilityRow(): string[] {
  return mi9Rows().filter((l) => l.includes("capability-granting"));
}

/** Every `.ts`/`.tsx` under the production roots, comments included. */
function productionFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const rel of walkPlansTree(join(ROOT, dir))) {
      if (/\.tsx?$/.test(rel)) out.push(join(dir, rel));
    }
  };
  for (const dir of ["app", "components", "lib"]) walk(dir);
  return out;
}

describe("capability-claim recognizer", () => {
  it.each([
    ["LEAD additionally grants the admin/ops surface", true],
    ["(LEAD or FINANCIALS) would grant ops/financial access silently", true],
    ["LEAD and FINANCIALS are the capability-granting role_flags elements; neither grants admin access", false],
    ["LEAD does not grant admin access", false],
    ["ops/financials field-alias fuzzy fallback (resolveAliasScoped), derived above", false],
    ["This fires only for LEAD or FINANCIALS, the roles that unlock internal financials", false],
  ])("%s → %s", (sentence, expected) => {
    expect(claimsAdminGrant(sentence as string)).toBe(expected);
  });
});

describe("no in-force prose claims a role flag grants admin access", () => {
  it("locates the §6.8 capability row, exactly once, with non-trivial text", () => {
    const canonical = mi9CapabilityRow();
    expect(
      canonical,
      "the §6.8 MI-9 capability statement moved or lost its 'capability-granting' wording — " +
        "the scan below would then be reading nothing",
    ).toHaveLength(1);
    expect((canonical[0] ?? "").length).toBeGreaterThan(200);
    expect(mi9Rows().length).toBeGreaterThanOrEqual(1);
  });

  it("no MI-9 row makes an admin-grant claim", () => {
    const offending = mi9Rows().flatMap((row) => sentences(row).filter(claimsAdminGrant));
    expect(offending, "master spec MI-9 rows").toEqual([]);
  });

  it("walks a non-trivial production tree (a broken glob must not pass by scanning nothing)", () => {
    expect(productionFiles().length).toBeGreaterThan(100);
  });

  it("no production source comment makes the claim either", () => {
    const offending: string[] = [];
    for (const file of productionFiles()) {
      const text = readFileSync(join(ROOT, file), "utf8");
      if (!SUBJECT.test(text) || !OBJECT.test(text)) continue;
      for (const [i, line] of text.split("\n").entries()) {
        for (const s of sentences(line)) {
          if (claimsAdminGrant(s)) offending.push(`${file}:${i + 1} ${s}`);
        }
      }
    }
    expect(offending, "production source asserting a capability flag grants admin/ops access").toEqual([]);
  });
});
