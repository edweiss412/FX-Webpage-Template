// @vitest-environment jsdom
/**
 * Transition audit for the two finalize progress renderers (spec §3.4).
 *
 * The spec's Transition Inventory says every conditional render in these
 * subtrees is INSTANT, so this guard pins that absence. An absence guard passes
 * the moment it is authored, which is why its discriminating power comes from
 * planted mutants rather than from a pre-existing defect — the mutant-red
 * treatment (docs/agents/writing-plans.md:28). The six families it must catch are
 * enumerated in the plan; each was planted, observed failing, and reverted.
 *
 * The oracle inspects FOUR mechanisms, because four review rounds each found the
 * previous closure blind to one this repository actually uses:
 *   1. framer primitives      — AnimatePresence / motion.* in the render path
 *   2. utility classes        — transition-* / animate-* on a subtree node
 *   3. inline style           — style.transition / style.animation on a node
 *   4. stylesheet selectors   — DERIVED from app/globals.css, not enumerated,
 *                               because route-enter and friends match neither
 *                               pattern above and a hand-list re-opens the moment
 *                               anyone adds a rule.
 *
 * SCOPE is the progress subtrees only. The footer's Back button carries a
 * legitimate `transition-colors` hover treatment, and a file-scoped assertion
 * would red on correct code.
 */
import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { premise, premiseHolds } from "../../_shared/premise";
import { stripCssComments } from "../../_shared/stripComments";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/",
}));

import { FinalizeButton } from "@/components/admin/FinalizeButton";
import { Step3ReviewWithFinalize } from "@/components/admin/wizard/Step3ReviewWithFinalize";
import type { Step3Row } from "@/components/admin/wizard/Step3Review";
import type { ParseResult } from "@/lib/parser/types";
import { controllableNdjson } from "./_finalizeStreamHarness";

const WIZARD_SESSION_ID = "11111111-2222-4333-8444-555555555555";
const GLOBALS = join(__dirname, "..", "..", "..", "app", "globals.css");
const SOURCES = [
  join(__dirname, "..", "..", "..", "components", "admin", "FinalizeButton.tsx"),
  join(__dirname, "..", "..", "..", "components", "admin", "wizard", "Step3ReviewWithFinalize.tsx"),
];

/** Every selector in globals.css whose body declares animation: or transition:. */
function animatingSelectors(): string[] {
  // Comment stripping goes through the shared module, never a local regex
  // (tests/cross-cutting/_metaStripCommentsSingleSource.test.ts). It is also the
  // correct one here: a naive /\*...\*/ sweep also eats a comment-looking run
  // inside a quoted value, and this file then loses the rule that contained it.
  const css = stripCssComments(readFileSync(GLOBALS, "utf8"));
  const out: string[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1]!.replace(/\s+/g, " ").trim();
    if (!sel || sel.startsWith("@")) continue;
    // Shorthand AND longhand: `animation-name:` / `transition-property:` animate just as
    // well as `animation:` / `transition:`, and the shorthand-only form let a rule using
    // only longhands out (whole-diff R1 finding 3). The optional `-<word>` tail is the
    // whole widening — the property set is closed, so this does not re-open next round.
    if (/(?<![-\w])(animation|transition)(-[a-z-]+)?\s*:/.test(m[2]!)) out.push(sel);
  }
  return [...new Set(out)];
}

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function step3Row(driveFileId: string, title: string): Step3Row {
  return {
    driveFileId,
    driveFileName: `${title}.gsheet`,
    status: "applied",
    parseResult: { show: { title } } as unknown as ParseResult,
  };
}

/**
 * BOTH renderers, because they independently render the same progress and R1 found
 * the audit driving only one of them: an animation added to the compact tracking in
 * Step3 passed while AC-5c claimed both were covered.
 */
const RENDERERS = [
  {
    name: "FinalizeButton",
    subtree: "wizard-finalize-progress",
    mount: () => render(<FinalizeButton wizardSessionId={WIZARD_SESSION_ID} publishCount={2} />),
  },
  {
    name: "Step3ReviewWithFinalize",
    subtree: "wizard-step3-tracking",
    mount: () =>
      render(
        <Step3ReviewWithFinalize
          wizardSessionId={WIZARD_SESSION_ID}
          rows={[step3Row("dfid-a", "Alpha"), step3Row("dfid-b", "Bravo")]}
          finishable
          initialPublishCount={2}
          initialUncheckedCleanCount={0}
        />,
      ),
  },
] as const;

async function panel(renderer: (typeof RENDERERS)[number], phase: "batch" | "cas") {
  const batch = controllableNdjson();
  const cas = controllableNdjson();
  fetchMock.mockResolvedValueOnce(batch.response).mockResolvedValueOnce(cas.response);
  const view = renderer.mount();
  await act(async () => {
    fireEvent.click(view.getByTestId("wizard-finalize-button"));
  });
  await act(async () => {
    batch.push({ type: "listed", total: 2 });
    batch.push({ type: "row", done: 1, total: 2, name: "East Coast", driveFileId: "f1" });
  });
  if (phase === "cas") {
    await act(async () => {
      batch.push({
        type: "result",
        body: {
          status: "all_batches_complete",
          wizard_session_id: WIZARD_SESSION_ID,
          remaining_count: 0,
          unresolved_manifest_count: 0,
          per_row: [],
        },
      });
      batch.close();
    });
    await act(async () => {
      cas.push({ type: "phase", phase: "applying" });
    });
  }
  return { ...view, batch, cas };
}

async function batchPanel() {
  return panel(RENDERERS[0], "batch");
}

describe("finalize progress transitions are instant", () => {
  test("no framer primitive appears in either renderer's source", () => {
    const sources = SOURCES.map((f) => readFileSync(f, "utf8"));
    premise("both renderer sources were read", sources.length, 1);
    premiseHolds(
      "the sources are the real renderers",
      sources.every((s) => s.includes('state.phase === "batch"')),
    );
    for (const [i, src] of sources.entries()) {
      expect(src, SOURCES[i]).not.toMatch(/\bAnimatePresence\b/);
      expect(src, SOURCES[i]).not.toMatch(/\bmotion\s*\./);
    }
  });

  // R1 finding 2: this ran on FinalizeButton's BATCH phase alone, so an animation in
  // FinalizeButton CAS, Step3 batch, or Step3 CAS passed while AC-5c claimed every
  // conditional render in both renderers was covered. The matrix is 2x2 and closed —
  // completing it finishes a set rather than widening a recognizer.
  test.each(
    RENDERERS.flatMap((r) =>
      (["batch", "cas"] as const).map((ph) => ({ r, ph, label: `${r.name} / ${ph}` })),
    ),
  )("no node in the progress subtree animates: $label", async ({ r, ph }) => {
    const { getByTestId } = await panel(r, ph);
    const group = getByTestId(r.subtree);
    const nodes = [group, ...Array.from(group.querySelectorAll("*"))] as HTMLElement[];

    // Premise: a subtree of one node would satisfy every assertion below.
    // Per-PHASE, because the two phases legitimately render different node counts and a
    // single threshold has to be wrong for one of them. Lowering the batch bar to fit CAS
    // would weaken the cell that renders most of the subtree, so each cell states the floor
    // its own phase clears: batch draws a heading, a <progress>, a count and a name; CAS
    // draws a heading and a phase label.
    premise(`the ${ph} subtree has real descendants`, nodes.length, ph === "batch" ? 3 : 2);

    // Declared transition family (iii), NESTED DUPLICATE, which the descendant-count
    // premise does not catch: an extra unanimated conditional mount RAISES the count and
    // satisfies every per-node check (whole-diff R2 finding 4). A count is a lower bound;
    // duplication needs an identity assertion. Every testid inside the subtree must be
    // unique, so a second conditional mount of the same block fails here rather than
    // passing as "more nodes".
    // Identity is a STRUCTURAL SIGNATURE, not a testid. Keying on `data-testid` alone left
    // every untagged conditional invisible — the compact count and both compact CAS children
    // carry none, so duplicating one raised the descendant count, kept the testid set unique,
    // and passed every motion check (whole-diff R3 finding 2). Tag plus own text identifies a
    // node whether or not anyone remembered to give it a testid, which is the point: the guard
    // must not depend on the very annotation a careless duplicate would omit.
    const ownText = (el: HTMLElement) =>
      Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent ?? "")
        .join("")
        .replace(/\s+/g, " ")
        .trim();
    const sigs = nodes
      .map((el) => `${el.tagName}|${el.getAttribute("data-testid") ?? ""}|${ownText(el)}`)
      // A node with no own text and no testid says nothing about identity; two empty
      // wrappers are not a duplicate mount, so they are excluded rather than counted.
      .filter((sig) => !sig.endsWith("||"));
    const dupes = sigs.filter((sig, i) => sigs.indexOf(sig) !== i);
    expect(dupes, `${ph}: duplicated node inside the progress subtree`).toEqual([]);

    const selectors = animatingSelectors();
    // Premise: the derived cover must actually have derived something, and must
    // include a selector we know animates — otherwise a parser regression turns
    // this into a guard over an empty set.
    premise("globals.css yielded animating selectors", selectors.length, 5);
    premiseHolds(
      "the derivation found a known-animating selector",
      selectors.some((s) => s.includes("route-enter")),
    );

    for (const el of nodes) {
      // The hyphen was mandatory, so Tailwind's BARE `transition` and `animate` utilities
      // (both real classes, both animating) walked straight through (R1 finding 3).
      // Matches either the hyphenated family or the bare class as a whole token.
      expect(el.className, `${el.tagName} class`).not.toMatch(
        // Variant prefixes included. `motion-safe:animate-pulse`, `hover:transition-colors`
        // and every compound form escaped a pattern that demanded whitespace immediately
        // before the utility (whole-diff R3 finding 1), and the stylesheet arm cannot
        // compensate because Tailwind GENERATES those rules — they are never declared in
        // globals.css, so the class attribute is the only place they are visible. The
        // repo uses the form: FinalizeButton.tsx carries three instances today.
        /(?:^|\s)(?:[\w.-]+:)*(transition|animate)(-[\w[\]/.-]+)?(?=\s|$)/,
      );
      // cssText, NOT the shorthand properties. Probed in jsdom: setting
      // transitionProperty/transitionDuration/animationName/animationDuration leaves
      // BOTH `style.transition` and `style.animation` as the empty string while
      // cssText carries all four, so a node animating via inline longhands passed the
      // old check completely (whole-diff R2 finding 5). Distinct from the stylesheet
      // longhand case repaired in R1: that one parses globals.css, this one reads the
      // element's own inline style.
      expect(el.style.cssText, `${el.tagName} inline style`).not.toMatch(
        /(?:^|;|\s)(transition|animation)(-[a-z-]+)?\s*:/,
      );
      for (const sel of selectors) {
        let matches = false;
        try {
          matches = el.matches(sel);
        } catch {
          matches = false; // a selector jsdom cannot parse cannot match either
        }
        expect(matches, `${el.tagName} matches animating selector ${sel}`).toBe(false);
      }
    }
  });

  test("the group's accessible name does not change across the batch to CAS boundary", async () => {
    const { getByTestId, batch } = await batchPanel();
    const before = getByTestId("wizard-finalize-progress").getAttribute("aria-label");
    await act(async () => {
      batch.push({
        type: "result",
        body: {
          status: "all_batches_complete",
          wizard_session_id: WIZARD_SESSION_ID,
          remaining_count: 0,
          unresolved_manifest_count: 0,
          per_row: [],
        },
      });
      batch.close();
    });
    const after = getByTestId("wizard-finalize-progress").getAttribute("aria-label");
    premiseHolds("the label was present before the boundary", before !== null);
    expect(after).toBe(before);
    // Same reason as the two component suites (whole-diff R2 finding 6): comparing the
    // raw attribute across the boundary says nothing if an `aria-labelledby` appears on
    // one side of it, because that is what the name would then be computed from.
    expect(
      getByTestId("wizard-finalize-progress").hasAttribute("aria-labelledby"),
      "aria-labelledby would override the attribute this test compares",
    ).toBe(false);
  });
});
