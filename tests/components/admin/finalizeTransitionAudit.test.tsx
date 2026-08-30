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
    if (/(?<![-\w])(animation|transition)\s*:/.test(m[2]!)) out.push(sel);
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

async function batchPanel() {
  const batch = controllableNdjson();
  fetchMock
    .mockResolvedValueOnce(batch.response)
    .mockResolvedValueOnce(controllableNdjson().response);
  const view = render(<FinalizeButton wizardSessionId={WIZARD_SESSION_ID} publishCount={2} />);
  await act(async () => {
    fireEvent.click(view.getByTestId("wizard-finalize-button"));
  });
  await act(async () => {
    batch.push({ type: "listed", total: 2 });
    batch.push({ type: "row", done: 1, total: 2, name: "East Coast", driveFileId: "f1" });
  });
  return { ...view, batch };
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

  test("no node in the progress subtree animates, by class, inline style, or stylesheet rule", async () => {
    const { getByTestId } = await batchPanel();
    const group = getByTestId("wizard-finalize-progress");
    const nodes = [group, ...Array.from(group.querySelectorAll("*"))] as HTMLElement[];

    // Premise: a subtree of one node would satisfy every assertion below.
    premise("the progress subtree has real descendants", nodes.length, 3);

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
      expect(el.className, `${el.tagName} class`).not.toMatch(/\b(transition|animate)-/);
      expect(el.style.transition ?? "", `${el.tagName} inline transition`).toBe("");
      expect(el.style.animation ?? "", `${el.tagName} inline animation`).toBe("");
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
  });
});
