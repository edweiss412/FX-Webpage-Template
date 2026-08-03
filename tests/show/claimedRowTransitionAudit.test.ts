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
 * Each declared conditional must be present in the source AND carry a
 * treatment in spec §6. The audit's own falsification: add a SIXTH conditional
 * with no row here and this file fails.
 */
const SOURCE = readFileSync(
  join(process.cwd(), "app", "show", "[slug]", "[shareToken]", "_ClaimedRowButton.tsx"),
  "utf8",
);

/** C1–C5, each with the marker that proves it is still present. */
const DECLARED = [
  {
    id: "C1",
    what: "onClick pending guard (early return + preventDefault)",
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
    what: "chip present vs absent when role is empty (idle only)",
    marker: /role && \(/,
    treatment: "instant",
  },
  {
    id: "C4",
    what: "chip text: role vs Signing in…",
    marker: /Signing in…/,
    treatment: "instant",
  },
  {
    id: "C5",
    what: "pageshow listener resetting pending",
    marker: /if \(event\.persisted\) setPending\(false\);/,
    treatment: "instant, no exit animation",
  },
] as const;

describe("_ClaimedRowButton transition audit", () => {
  test.each(DECLARED)("$id is present and has a declared treatment", ({ marker, treatment }) => {
    expect(SOURCE).toMatch(marker);
    expect(treatment.length).toBeGreaterThan(0);
  });

  test("every conditional in the source is declared above", () => {
    // Count the render-level ternaries and && guards, plus the two early-exit
    // conditionals in the handler and the pageshow listener. A sixth branch
    // lands here with no DECLARED row and fails the count.
    const ternaries = SOURCE.match(/\?\s*\(/g)?.length ?? 0;
    const andGuards = SOURCE.match(/\{?\s*\w+ && \(/g)?.length ?? 0;
    const ifGuards = SOURCE.match(/\bif \(/g)?.length ?? 0;

    expect(
      ternaries + andGuards + ifGuards,
      `conditionals found: ${ternaries} ternaries + ${andGuards} && guards + ${ifGuards} if guards. ` +
        `If you added a branch, add its row to DECLARED with its §6 treatment.`,
    ).toBe(DECLARED.length);
  });

  test("no animation class rides the state swap itself", () => {
    // §6 declares idle→pending instant. A transition/duration class on the
    // spinner or chip would contradict that; the spinner's own spin is the
    // only motion, and it is reduced-motion aware.
    expect(SOURCE).toMatch(/animate-spin motion-reduce:animate-none/);
    expect(SOURCE).not.toMatch(/transition-\w+ [^"]*picker-row-spinner/);
  });
});
