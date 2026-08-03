// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * Transition audit for `_ClaimedRowButton` (spec §6, plan Task 5).
 *
 * `docs/agents/writing-plans.md:9` wants every ternary and conditional block
 * enumerated, not just the state pairs — a two-row state table proves nothing
 * about a component whose branches outnumber it.
 *
 * The census below counts ALL the JSX conditional spellings, not just the
 * parenthesised ones. Whole-diff review measured the earlier version: baseline
 * 5, `pending && (<span />)` → 6 (caught), but `pending && <span />` → 5 and
 * inline `pending ? <A /> : <B />` → 5 both slipped through. Undeclared
 * branches could land while the audit stayed green.
 */
const SOURCE = readFileSync(
  join(process.cwd(), "app", "show", "[slug]", "[shareToken]", "_ClaimedRowButton.tsx"),
  "utf8",
);

/** Every conditional in the component, with its §6 treatment. */
const DECLARED = [
  {
    id: "C1",
    what: "onClick pending guard (preventDefault + early return)",
    marker: /if \(pending\) \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?return;/,
    treatment: "not a render branch — no animation",
  },
  {
    id: "C2",
    what: "lock vs spinner, in a shared fixed-width slot",
    marker: /pending \? \([\s\S]*?picker-row-spinner/,
    treatment: "instant swap; the spinner's rotation is the motion",
  },
  {
    id: "C3",
    what: "idle chip present vs absent when role is empty",
    marker: /role && \(/,
    treatment: "instant",
  },
  {
    id: "C4",
    what: "right column: pending chip vs idle chip",
    marker: /Signing in…/,
    treatment: "instant",
  },
  {
    id: "C5",
    what: "pageshow listener resetting pending on a bfcache restore",
    marker:
      /if \(!event\.persisted\) return;[\s\S]*?clearPendingTimeout\(\);[\s\S]*?setPending\(false\);/,
    treatment: "instant, no exit animation",
  },
  {
    id: "C6",
    what: "clearPendingTimeout guard (shared by unmount, pageshow, re-activation)",
    marker: /function clearPendingTimeout\(\) \{[\s\S]*?if \(timeoutRef\.current !== null\)/,
    treatment: "not a render branch — no animation",
  },
  {
    id: "C7",
    what: "live-region text mirrors pending",
    marker: /role="status"[\s\S]*?aria-live="polite"/,
    treatment: "instant — announcement only, no visual state",
  },
] as const;

describe("_ClaimedRowButton transition audit", () => {
  test.each(DECLARED)("$id is present and has a declared treatment", ({ marker, treatment }) => {
    expect(SOURCE).toMatch(marker);
    expect(treatment.length).toBeGreaterThan(0);
  });

  test("every conditional in the source is declared above", () => {
    // Counts `? (`, `? <`, `? \``, `? "`, `&& (`, `&& <` and `if (`. The
    // JSX-without-parens and template-literal spellings are the ones the first
    // version of this census missed.
    const ternaries = SOURCE.match(/\?\s*[(<`"']/g)?.length ?? 0;
    const andGuards = SOURCE.match(/&&\s*[(<]/g)?.length ?? 0;
    const ifGuards = SOURCE.match(/\bif\s*\(/g)?.length ?? 0;

    expect(
      ternaries + andGuards + ifGuards,
      `conditionals found: ${ternaries} ternaries + ${andGuards} && guards + ${ifGuards} if guards. ` +
        `If you added a branch, add its row to DECLARED with its §6 treatment.`,
    ).toBe(DECLARED.length);
  });

  test("no transition or duration class rides the state swap", () => {
    // §6 declares idle→pending instant. The row's own `transition-colors`
    // arrives via the passed-in rowClassName; nothing INSIDE this component may
    // add one. Asserted on the whole source, so a class on the spinner or the
    // chip both fail — the earlier regex looked for a transition class and a
    // testid inside one quoted string and could never match either.
    expect(SOURCE).not.toMatch(/\btransition-/);
    expect(SOURCE).not.toMatch(/\bduration-/);
  });

  test("the spinner is reduced-motion aware and does not freeze mid-arc", () => {
    // Stops rather than hides: the e2e context runs entirely under reduce, so
    // hiding would blind every spinner oracle, and the chip text is the second
    // signal that keeps a frozen glyph from being the only cue.
    expect(SOURCE).toMatch(/animate-spin motion-reduce:animate-none/);
  });
});
