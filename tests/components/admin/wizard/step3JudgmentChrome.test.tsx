// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/step3JudgmentChrome.test.tsx (Task 11 — spec §7.3a / §7.4)
 *
 * The THREE card-face visual states (plain / judgment / needs-look) that mirror
 * the §7.2 row buckets, plus the §7.4 transition inventory:
 *   - clean     → border-border,        no judgment chip, "View" trigger
 *   - judgment  → border-border,        judgment chip,    "View" trigger
 *   - needs-look→ border-border-strong,  no judgment chip, "Review" trigger
 *
 * Distinguished by the judgment chip (info tone, testid `-judgment-chip`) + the
 * border + the trigger label. All three pairs transition INSTANTLY (§7.4): a
 * re-render swaps state synchronously with no AnimatePresence, verified both
 * statically (2a guard) and behaviorally (2b, table-driven all pairs).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Step3SheetCard } from "@/components/admin/wizard/Step3SheetCard";
import { type Step3Row } from "@/components/admin/wizard/Step3Review";
import type { ParseResult, ParseWarning } from "@/lib/parser/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/onboarding",
}));

const WSID = "11111111-1111-1111-1111-111111111111";
const AMBIGUITY_GAP = "ROOM_HEADER_SPLIT_AMBIGUOUS"; // ambiguity AND gap class → judgment
const NON_AMBIGUITY_GAP = "FIELD_UNREADABLE"; // gap class, not ambiguity → needs-look
const w = (code: string): ParseWarning => ({ severity: "warn", code, message: code });

function cardRow(dfid: string, warnings: ParseWarning[]): Step3Row {
  return {
    driveFileId: dfid,
    driveFileName: `${dfid}.gsheet`,
    status: "staged",
    parseResult: { show: { title: "Judgment Show" }, warnings } as unknown as ParseResult,
  };
}
const cleanProps = (dfid: string) => ({ row: cardRow(dfid, []), wizardSessionId: WSID });
const judgmentProps = (dfid: string) => ({
  row: cardRow(dfid, [w(AMBIGUITY_GAP)]),
  wizardSessionId: WSID,
});
const needsLookProps = (dfid: string) => ({
  row: cardRow(dfid, [w(NON_AMBIGUITY_GAP)]),
  wizardSessionId: WSID,
});

/** Read a card's tri-state purely from the rendered DOM (the derivation's effect). */
function cardState(root: HTMLElement, dfid: string): "clean" | "judgment" | "needsLook" {
  const article = root.querySelector(`[data-testid="wizard-step3-card-${dfid}"]`) as HTMLElement;
  const hasChip = !!root.querySelector(`[data-testid="wizard-step3-card-${dfid}-judgment-chip"]`);
  const strong = article.classList.contains("border-border-strong");
  if (strong) return "needsLook";
  return hasChip ? "judgment" : "clean";
}

afterEach(() => cleanup());

describe("Step3SheetCard — three judgment states (spec §7.3a)", () => {
  test("clean row: border-border, no judgment chip, View", () => {
    const dfid = "c";
    const { container, getByTestId, queryByTestId } = render(
      <Step3SheetCard {...cleanProps(dfid)} />,
    );
    expect(cardState(container, dfid)).toBe("clean");
    expect(queryByTestId(`wizard-step3-card-${dfid}-judgment-chip`)).toBeNull();
    expect(getByTestId(`wizard-step3-card-${dfid}-more`).textContent).toBe("View");
  });

  test("judgment row: border-border + judgment chip + View (calm, not amber)", () => {
    const dfid = "j";
    const { container, getByTestId } = render(<Step3SheetCard {...judgmentProps(dfid)} />);
    expect(cardState(container, dfid)).toBe("judgment");
    const chip = getByTestId(`wizard-step3-card-${dfid}-judgment-chip`);
    expect(chip.textContent).toContain("Parsed with judgment");
    // Info tone, never the amber warn tone.
    expect(chip.className).toContain("bg-info-bg");
    expect(chip.className).not.toContain("bg-warning-bg");
    const article = getByTestId(`wizard-step3-card-${dfid}`);
    expect(article.classList.contains("border-border-strong")).toBe(false);
    expect(getByTestId(`wizard-step3-card-${dfid}-more`).textContent).toBe("View");
  });

  test("needs-look row: border-border-strong, no judgment chip, Review", () => {
    const dfid = "n";
    const { container, getByTestId, queryByTestId } = render(
      <Step3SheetCard {...needsLookProps(dfid)} />,
    );
    expect(cardState(container, dfid)).toBe("needsLook");
    expect(queryByTestId(`wizard-step3-card-${dfid}-judgment-chip`)).toBeNull();
    expect(getByTestId(`wizard-step3-card-${dfid}-more`).textContent).toBe("Review");
  });
});

// ── §7.4 transition inventory ────────────────────────────────────────────────
const WIZARD_DIR = join(process.cwd(), "components/admin/wizard");
// Captured pre-implementation (rg -c "transition-(all|colors|opacity)") — the T11
// chrome adds ZERO transition classes and ZERO AnimatePresence; this guard fails if
// a later edit animates a status state (spec §7.4: all pairs instant).
const PREEXISTING_TRANSITION_COUNTS: Record<string, number> = {
  "Step3Review.tsx": 6,
  "Step3SheetCard.tsx": 4,
  "step3ReviewSections.tsx": 5,
  // 11 = modal 6 + surface 5. Task 13 (consolidated-admin-show-page §5/§9) added
  // the Overview/Changes extra rail items, whose side-rail + chip buttons carry
  // the same `transition-colors duration-fast` hover affordance every registry
  // rail/chip item carries (+2). These two hover transitions are enumerated in
  // spec §9, so this bump is an acknowledged, spec-sanctioned rail affordance —
  // NOT a new state-swap animation (all pairs stay instant; the sole animated
  // element remains the sliding rail indicator).
  "Step3ReviewModal.tsx": 11,
};

describe("§7.4 transition audit — 2a static guard (all pairs instant)", () => {
  for (const [file, expected] of Object.entries(PREEXISTING_TRANSITION_COUNTS)) {
    test(`${file}: no AnimatePresence, transition-class count pinned at ${expected}`, () => {
      // Phase-1 extraction (spec 2026-07-16 §5): the Step-3 review rail/content
      // moved to components/admin/review/ShowReviewSurface.tsx. The guard FOLLOWS
      // the moved code — for the modal entry it scans modal + surface as one body,
      // so the pinned count is modal 6 + surface 5 = 11 (the surface's 3 original
      // rail transitions plus Task 13's 2 extra-rail hover affordances, spec §9).
      // Other files are unaffected.
      let src = readFileSync(join(WIZARD_DIR, file), "utf8");
      if (file === "Step3ReviewModal.tsx") {
        src += `\n${readFileSync(
          join(process.cwd(), "components/admin/review/ShowReviewSurface.tsx"),
          "utf8",
        )}`;
      }
      expect(src.includes("AnimatePresence")).toBe(false);
      expect((src.match(/transition-(?:all|colors|opacity)/g) ?? []).length).toBe(expected);
    });
  }
});

describe("§7.4 transition audit — 2b behavioral (every pair re-renders synchronously)", () => {
  const PAIRS: Array<["clean" | "judgment" | "needsLook", "clean" | "judgment" | "needsLook"]> = [
    ["clean", "judgment"],
    ["judgment", "clean"],
    ["clean", "needsLook"],
    ["needsLook", "clean"],
    ["judgment", "needsLook"],
    ["needsLook", "judgment"],
  ];
  const propsFor = (s: "clean" | "judgment" | "needsLook", dfid: string) =>
    s === "clean"
      ? cleanProps(dfid)
      : s === "judgment"
        ? judgmentProps(dfid)
        : needsLookProps(dfid);

  test.each(PAIRS)("%s → %s is synchronously instant (no waitFor)", (from, to) => {
    const dfid = "t";
    const { container, rerender } = render(<Step3SheetCard {...propsFor(from, dfid)} />);
    expect(cardState(container, dfid)).toBe(from); // synchronous — no animation gate
    rerender(<Step3SheetCard {...propsFor(to, dfid)} />);
    expect(cardState(container, dfid)).toBe(to); // synchronous — instant swap
  });
});
