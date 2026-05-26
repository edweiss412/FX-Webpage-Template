import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = process.cwd();

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
