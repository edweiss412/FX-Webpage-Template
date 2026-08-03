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
// DOCUMENTED LIMITS — read before filing a paraphrase as a defect.
//
// This is a REGRESSION GUARD over a corpus, not a proof that no phrasing can
// express the claim. English paraphrase is an open space; three consecutive
// adversarial rounds each produced a new form (R2: `administrator access`,
// cross-sentence subjects; R3: `admin privileges`, `admin dashboard`, claims in
// string literals; R4: `allows access to`, `permits entry to`, contrastive
// "not only … but", three-line wraps). Every one was real and every one is now a
// fixture — but a fourth round would find a fifth family, and patching toward
// completeness has no fixed point.
//
// So the contract is the one AGENTS.md sets for detector surfaces (see
// docs/agents/adversarial-round-economy-2026-07-31.md): a new paraphrase is a
// FIXTURE, filed when someone demonstrates it, not a blocker. What the guard
// guarantees:
//
//   1. The three instances this branch found can never return silently — they are
//      pinned by name, in the two documents and the source tree that held them.
//   2. The recognizer's shape is auditable: SUBJECT + granting VERB + admin/ops
//      OBJECT, minus clause-scoped negation, minus contrastive idioms. Every
//      widening so far has been to the vocabulary, never to that shape.
//   3. It never fires on the CORRECTED prose, which is the property that makes it
//      usable at all — a guard that flags its own fix gets deleted.
//
// What it does NOT guarantee: that an author determined to phrase the claim
// unusually cannot. That is the accepted residue, and the reason the corrected
// prose also names `is_admin()` explicitly — a reader who checks the code is the
// backstop this guard is not.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { commentRanges } from "@/tests/_shared/stripComments";

import { walkPlansTree } from "@/tests/docs/_invariant8Closeout";

const ROOT = process.cwd();
const MASTER_SPEC = "docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md";

/**
 * CURRENT-STATE documents: prose a reader consults to learn how things ARE.
 * Whole-diff R2 found a third in-force claim in `00-overview.md` — canonical per
 * AGENTS.md invariant 7 — which neither the MI-9 scan nor the production-source
 * scan could see. Dated records (handoffs, closed milestone plans) are deliberately
 * NOT here: they say what was true when written.
 */
const CURRENT_STATE_DOCS = [
  MASTER_SPEC,
  "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/00-overview.md",
  "AGENTS.md",
  "PRODUCT.md",
  "DESIGN.md",
] as const;

const SUBJECT = /\b(LEAD|FINANCIALS|role_flags|capability (?:role|flag))\b/i;
const VERB =
  /\b(grants?|granting|unlocks?|unlocking|confers?|conferring|provides?|providing|gives? access to|enables? access to|allows? (?:access|entry) to|permits? (?:access|entry) to|opens? up)\b/i;
// "admin" or "administrator" followed by any surface/permission noun, plus the
// ops variants. Whole-diff R3: an enumerated noun list missed `admin privileges`
// and `admin dashboard`, which are the same claim — so the noun is a class, not a
// list.
// The surface noun is REQUIRED. An earlier draft made it optional, which turned
// bare "admin" into an object and produced false positives on true sentences like
// "grant financials … viewer.kind === 'admin'". The class is
// (admin|administrator) + a surface/permission noun, plus the ops variants.
const OBJECT =
  /\b((?:admin|administrator)\s*(?:access|privileges?|rights?|surfaces?|tools?|panels?|dashboards?|pages?|routes?|areas?|capabilit(?:y|ies))|admin\/ops|admin\/financials|ops\/financial|(?:the\s+)?(?:internal\s+)?ops\s+(?:surface|access))\b/i;
// Negation counts only when it sits ADJACENT to the granting verb. Whole-diff
// review finding 3: a sentence-wide negation test let an unrelated "not" suppress
// a real claim ("LEAD grants admin access, not just financials access"), which is
// the worst direction for this guard to fail in.
const NEGATOR = String.raw`(?:no|not|never|neither|nor|cannot|can't|doesn't|don't|does not|do not|no longer|without)`;
// "not only X but Y" and friends are CONTRASTIVE: the negation qualifies the scope
// of the claim, it does not deny it. Whole-diff R4 showed clause-wide negation
// suppressing "LEAD not only unlocks financials but grants admin access" — a real
// claim. These are stripped before the negation test.
const CONTRASTIVE = /\bnot (?:only|just|merely|simply|limited to|restricted to|confined to)\b/gi;

/**
 * True when a sentence positively claims a capability flag confers an admin or
 * ops surface. A negator in the SAME CLAUSE as the granting verb disqualifies it
 * — the corrected prose says "neither grants admin access" explicitly, and a guard
 * that fired on the correction would be unusable. Scoping to the clause rather
 * than the whole sentence is what keeps an unrelated "not" elsewhere from
 * suppressing a real claim (whole-diff R1 finding 3).
 */
export function claimsAdminGrant(sentence: string): boolean {
  if (!SUBJECT.test(sentence) || !OBJECT.test(sentence)) return false;
  const verbs = [...sentence.matchAll(new RegExp(VERB.source, "gi"))];
  if (verbs.length === 0) return false;
  // A claim survives if ANY granting verb is un-negated: negation must attach to
  // the verb (within ~24 chars before it), not merely appear somewhere in the
  // sentence.
  return verbs.some((m) => {
    const at = m.index ?? 0;
    // Whole-diff R2: a FIXED 12-character window let "No role_flags element grants
    // admin access" through as a positive claim, because the negator sits 22
    // characters back. The window is the whole clause before the verb instead —
    // a negator anywhere between the clause boundary and the verb negates it.
    const clauseStart = Math.max(
      sentence.lastIndexOf(".", at - 1) + 1,
      sentence.lastIndexOf(";", at - 1) + 1,
      sentence.lastIndexOf(",", at - 1) + 1,
      0,
    );
    const before = sentence.slice(clauseStart, at).replace(CONTRASTIVE, " ");
    // A hyphenated compound ("capability-granting elements") is a CATEGORY label,
    // not an assertion that something grants an admin surface. The corrected MI-9
    // row opens with exactly that phrase.
    if (sentence[at - 1] === "-") return false;
    return !new RegExp(`\\b${NEGATOR}\\b`, "i").test(before);
  });
}

/**
 * Sentences with a capability SUBJECT carried forward.
 *
 * Whole-diff R2: "LEAD is a capability flag. It grants admin access." escaped,
 * because the second sentence's subject is a pronoun. Within one block, once a
 * capability subject has been named, later subject-less sentences inherit it —
 * which is how a reader parses them too.
 */
export function withCarriedSubject(parts: readonly string[]): string[] {
  let carried: string | null = null;
  return parts.map((s) => {
    const m = SUBJECT.exec(s);
    if (m !== null) {
      carried = m[0];
      return s;
    }
    return carried === null ? s : `${carried} ${s}`;
  });
}

/** Contiguous non-blank lines, joined, with the 1-based line the run starts on. */
export function paragraphs(text: string): { start: number; body: string }[] {
  const out: { start: number; body: string }[] = [];
  let start = 0;
  let run: string[] = [];
  const flush = (): void => {
    if (run.length > 0) out.push({ start, body: run.join(" ").replace(/\s+/g, " ").trim() });
    run = [];
  };
  for (const [i, line] of text.split("\n").entries()) {
    if (line.trim() === "") flush();
    else {
      if (run.length === 0) start = i + 1;
      run.push(line);
    }
  }
  flush();
  return out;
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
    // The three escapes the whole-diff review demonstrated, now pinned:
    ["LEAD additionally provides the admin surface", true],
    ["LEAD grants admin access, not just financials access", true],
    ["Neither LEAD nor FINANCIALS grants admin access", false],
    // Whole-diff R2's probe strings:
    ["LEAD grants administrator access", true],
    ["FINANCIALS grants access to admin tools", true],
    ["LEAD grants access to the internal ops surface", true],
    ["No role_flags element grants admin access", false],
    // Whole-diff R4's probe strings:
    ["LEAD allows access to the admin dashboard", true],
    ["A FINANCIALS flag permits entry to administrator pages", true],
    ["LEAD not only unlocks financials but grants admin access", true],
    ["LEAD is not limited to financials and grants admin access", true],
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

  it("every current-state document exists (a rename must not silently drop it)", () => {
    const gone = CURRENT_STATE_DOCS.filter((f) => !existsSync(join(ROOT, f)));
    expect(gone).toEqual([]);
  });

  it("no CURRENT-STATE document makes the claim", () => {
    const offending: string[] = [];
    for (const file of CURRENT_STATE_DOCS) {
      const text = readFileSync(join(ROOT, file), "utf8");
      if (!SUBJECT.test(text) || !OBJECT.test(text)) continue;
      // Join each PARAGRAPH (contiguous non-blank lines), not a two-line window.
      // Whole-diff R4: a claim split across three lines escaped a pairwise window,
      // and prose wraps wherever the formatter decides — so the unit has to be the
      // paragraph, which is what a reader sees.
      for (const { start, body } of paragraphs(text)) {
        for (const s of withCarriedSubject(sentences(body))) {
          if (claimsAdminGrant(s)) offending.push(`${file}:${start} ${s.slice(0, 140)}`);
        }
      }
    }
    expect(
      [...new Set(offending)],
      "A current-state document asserting a capability flag grants admin/ops access. These are read " +
        "as contracts, not as records of what was once true.",
    ).toEqual([]);
  });

  it("no production source comment makes the claim either", () => {
    const offending: string[] = [];
    for (const file of productionFiles()) {
      const text = readFileSync(join(ROOT, file), "utf8");
      if (!SUBJECT.test(text) || !OBJECT.test(text)) continue;
      // Analyze whole COMMENTS, not single lines: whole-diff R1 finding 3 showed a
      // claim wrapped across two comment lines escaped a line-at-a-time scan, and
      // comment reflow is exactly how that happens. Comment boundaries come from
      // the project's single-source stripper rather than a local `//` test — the
      // rule tests/cross-cutting/_metaStripCommentsSingleSource.test.ts enforces,
      // and the reason it exists: hand-rolled comment logic disagrees with itself.
      const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
      const lineStarts = [0, ...[...text.matchAll(/\n/g)].map((m) => (m.index ?? 0) + 1)];
      const lineOf = (pos: number): number => {
        let lo = 0;
        let hi = lineStarts.length - 1;
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2);
          if ((lineStarts[mid] ?? 0) <= pos) lo = mid;
          else hi = mid - 1;
        }
        return lo + 1;
      };
      const ranges = commentRanges(text, kind);
      for (const [start, end] of ranges) {
        const body = text
          .slice(start, end)
          .replace(/^\/\*+|\*+\/$|^\/\/+/gm, " ")
          .replace(/^\s*\*/gm, " ")
          .replace(/\s+/g, " ")
          .trim();
        for (const s of withCarriedSubject(sentences(body))) {
          if (claimsAdminGrant(s)) offending.push(`${file}:${lineOf(start)} ${s}`);
        }
      }
      // ...and everything OUTSIDE the comments. Whole-diff R3: routing the scan
      // through commentRanges alone silently dropped string literals, template
      // literals and JSX text — user-visible copy is exactly where a capability
      // claim would do the most harm, so scanning only comments inverted the
      // priority. Comment spans are blanked (not removed) so line numbers hold.
      let code = text;
      for (const [start, end] of ranges) {
        code =
          code.slice(0, start) + code.slice(start, end).replace(/[^\n]/g, " ") + code.slice(end);
      }
      for (const { start, body } of paragraphs(code)) {
        for (const s of withCarriedSubject(sentences(body))) {
          if (claimsAdminGrant(s)) offending.push(`${file}:${start} ${s.slice(0, 140)}`);
        }
      }
    }
    expect(offending, "production source asserting a capability flag grants admin/ops access").toEqual([]);
  });
});
