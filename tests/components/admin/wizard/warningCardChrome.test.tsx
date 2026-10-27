// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/warningCardChrome.test.tsx
 * (warning-card-fixes spec §3.2, §3.3, §3.5; plan Task 7)
 *
 * The wizard warning card's title row: the sheet icon link at its end, the
 * Judgment call tag on judgment rows only, an sr-only prefix in place of the
 * visible severity word, and no 44px floor on a link-less row.
 *
 * Fixture rows are scoped by their own testids, so a sibling row can never
 * satisfy (or break) another row's assertion. This file never quotes the sheet
 * icon's accessible-name phrase (it is counted repo-wide by
 * tests/components/admin/sheetIconLinkContainment.test.ts); it asserts the
 * aria-label CONTAINS the card title instead.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { ParseWarning } from "@/lib/parser/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin/onboarding",
  useSearchParams: () => new URLSearchParams(),
}));

import { WarningsBreakdown } from "@/components/admin/wizard/step3ReviewSections";
import { JudgmentCallTag } from "@/components/admin/JudgmentCallTag";
import { attentionMarkClass } from "@/components/admin/review/attentionMark";
import { reviewWarningTitle } from "@/lib/admin/reviewWarningTitle";
import { stripEmphasis } from "@/lib/messages/collapsedSummary";

afterEach(() => cleanup());

const DFID = "drive-abc-123";
const CELL = { title: "INFO", gid: 0, a1: "A5", scope: "cell" as const };

const NEEDS_LOOK: ParseWarning = {
  severity: "warn",
  code: "UNKNOWN_FIELD",
  message: "Unrecognized client row label: 'Backdrup'",
  blockRef: { kind: "client", name: "Backdrup" },
  rawSnippet: "Backdrup | black velour",
  sourceCell: CELL,
};
const JUDGMENT: ParseWarning = {
  severity: "warn",
  code: "CREW_COLUMN_POSITIONAL_FALLBACK",
  message: "m",
  sourceCell: CELL,
};
const INFO_ROW: ParseWarning = {
  severity: "info",
  code: "AGENDA_PDF_UNREADABLE",
  message: "An info-level note about the sheet",
  sourceCell: CELL,
};
const LINKLESS: ParseWarning = {
  severity: "warn",
  code: "SCHEDULE_TIME_UNPARSED",
  message: "x",
};
const ROWS = [NEEDS_LOOK, JUDGMENT, INFO_ROW, LINKLESS] as const;
const [I_NEEDS, I_JUDGMENT, I_INFO, I_LINKLESS] = [0, 1, 2, 3] as const;

const rowId = (i: number) => `wizard-step3-card-${DFID}-warning-${i}`;

function renderRows() {
  const q = render(<WarningsBreakdown dfid={DFID} warnings={[...ROWS]} mode="rescan" />);
  const li = (i: number) => q.getByTestId(rowId(i));
  const titleRow = (i: number) => q.getByTestId(`${rowId(i)}-title-row`);
  return { q, li, titleRow };
}

const tokens = (el: Element) => new Set(el.className.split(/\s+/).filter(Boolean));

describe("wizard warning title row (spec §3.5)", () => {
  test("each linked row ends its title row with the sheet icon, named for the card title", () => {
    const { q, titleRow } = renderRows();
    for (const i of [I_NEEDS, I_JUDGMENT, I_INFO]) {
      const row = titleRow(i);
      const link = q.getByTestId(`${rowId(i)}-sheetlink`);
      expect(link.tagName).toBe("A");
      expect(row.lastElementChild, `row ${i}: the anchor is the row's LAST child`).toBe(link);
      const title = stripEmphasis(reviewWarningTitle(ROWS[i]!));
      expect(title.length).toBeGreaterThan(0);
      expect(link.getAttribute("aria-label")).toContain(title);
      expect(tokens(row).has("min-h-tap-min"), `row ${i}: a linked row keeps the 44px floor`).toBe(
        true,
      );
    }
  });

  test("the old standalone text link is gone from every row", () => {
    const { q } = renderRows();
    expect(
      q.container.querySelector(
        `[data-testid^="wizard-step3-card-${DFID}-warning-"][data-testid$="-open"]`,
      ),
    ).toBeNull();
  });

  test("a row with no sourceCell has no icon link and no 44px floor", () => {
    const { q, titleRow } = renderRows();
    expect(q.queryByTestId(`${rowId(I_LINKLESS)}-sheetlink`)).toBeNull();
    expect(tokens(titleRow(I_LINKLESS)).has("min-h-tap-min")).toBe(false);
  });

  test("no severity word renders on any row", () => {
    const { li, titleRow } = renderRows();
    for (const i of [I_NEEDS, I_JUDGMENT, I_INFO, I_LINKLESS]) {
      // The title row is where the word lived. Clone it and drop the title node,
      // so a title that happens to contain "info" can neither satisfy nor break this.
      const clone = titleRow(i).cloneNode(true) as HTMLElement;
      const titleNode = clone.querySelector(".font-medium.text-text-strong");
      expect(titleNode, `row ${i}: the title node exists to remove`).not.toBeNull();
      titleNode!.remove();
      expect(clone.textContent ?? "").not.toMatch(/\bwarn\b/i);
      expect(clone.textContent ?? "").not.toMatch(/\binfo\b/i);
      // And nowhere on the card as a standalone token, the old span's shape.
      const standalone = Array.from(li(i).querySelectorAll("*")).filter((el) =>
        ["warn", "info"].includes((el.textContent ?? "").trim().toLowerCase()),
      );
      expect(standalone, `row ${i}`).toHaveLength(0);
    }
  });

  test("the sr-only prefix names the kind, and the judgment row has none", () => {
    const { titleRow } = renderRows();
    const srText = (i: number) =>
      Array.from(titleRow(i).querySelectorAll(".sr-only")).map((el) => el.textContent);
    expect(srText(I_NEEDS)).toEqual(["Needs a look: "]);
    expect(srText(I_LINKLESS)).toEqual(["Needs a look: "]);
    expect(srText(I_INFO)).toEqual(["Note: "]);
    expect(srText(I_JUDGMENT)).toEqual([]);
  });

  test("the Judgment call tag renders on the judgment row only, and is not focusable", () => {
    const { q, titleRow } = renderRows();
    for (const i of [I_NEEDS, I_INFO, I_LINKLESS]) {
      expect(q.queryByTestId(`${rowId(i)}-judgment-tag`), `row ${i}`).toBeNull();
    }
    const tag = q.getByTestId(`${rowId(I_JUDGMENT)}-judgment-tag`);
    expect(titleRow(I_JUDGMENT).contains(tag)).toBe(true);
    expect(tag.textContent).toBe("Judgment call");
    expect(tag.tagName).toBe("SPAN");
    expect(tag.getAttribute("tabindex")).toBeNull();
    expect(tag.getAttribute("role")).toBeNull();
    expect(tag.closest("a, button")).toBeNull();
    expect(tag.querySelector("a, button, [tabindex]")).toBeNull();
  });
});

describe("JudgmentCallTag class contract (spec §3.3)", () => {
  // Literals, never imported from the component: a drifted map must fail here.
  const EXPECTED_BORDER = {
    surface: "border-text-faint",
    "surface-sunken": "border-text-faint",
    "warning-bg": "border-control-outline-tinted",
  } as const;
  const ALL_BORDERS = new Set(Object.values(EXPECTED_BORDER));

  for (const plate of Object.keys(EXPECTED_BORDER) as (keyof typeof EXPECTED_BORDER)[]) {
    test(`plate=${plate} carries its own border token and not the other plate's`, () => {
      const q = render(<JudgmentCallTag plate={plate} testId="tag" />);
      const root = q.getByTestId("tag");
      const own = EXPECTED_BORDER[plate];
      expect(tokens(root).has(own)).toBe(true);
      for (const other of ALL_BORDERS) {
        if (other !== own) expect(tokens(root).has(other), other).toBe(false);
      }
      expect(tokens(root).has("whitespace-nowrap")).toBe(true);
      expect(tokens(root).has("shrink-0")).toBe(true);
      expect(tokens(root).has("bg-surface-sunken")).toBe(true);
      const ring = root.querySelector('span[aria-hidden="true"]');
      expect(ring).not.toBeNull();
      expect(ring!.className).toBe(attentionMarkClass("judgment", "sunken"));
      expect(root.textContent).toBe("Judgment call");
    });
  }
});

describe("wizard row kinds: chip and dot (spec §3.2, plan Task 8)", () => {
  // The chip is the row's first child (the 28px severity chip), the dot the first
  // child of the title row's text cluster. Both carry no testid; they are reached
  // structurally from the row's own testids so a sibling row cannot answer.
  const chipOf = (li: HTMLElement) => {
    const chip = li.firstElementChild;
    expect(chip, "the row's first child is its chip").not.toBeNull();
    return chip as HTMLElement;
  };
  const dotOf = (titleRow: HTMLElement) => {
    const dot = titleRow.firstElementChild?.firstElementChild;
    expect(dot, "the cluster's first child is the dot").not.toBeNull();
    return dot as HTMLElement;
  };
  const svgClass = (chip: HTMLElement) => chip.querySelector("svg")?.getAttribute("class") ?? "";

  test("needs-look: warm chip with the triangle, filled warm dot", () => {
    const { li, titleRow } = renderRows();
    for (const i of [I_NEEDS, I_LINKLESS]) {
      const chip = chipOf(li(i));
      expect(tokens(chip).has("bg-warning-bg") && tokens(chip).has("text-warning-text")).toBe(true);
      expect(svgClass(chip)).toMatch(/\blucide-triangle-alert\b/);
      const dot = tokens(dotOf(titleRow(i)));
      expect(dot.has("bg-warning-text")).toBe(true);
      expect(dot.has("bg-transparent")).toBe(false);
    }
  });

  test("judgment: neutral chip with the hollow ring glyph, hollow subtle dot", () => {
    const { li, titleRow } = renderRows();
    const chip = chipOf(li(I_JUDGMENT));
    expect(tokens(chip).has("bg-info-bg") && tokens(chip).has("text-text-subtle")).toBe(true);
    expect(tokens(chip).has("bg-warning-bg")).toBe(false);
    expect(svgClass(chip)).toMatch(/\blucide-circle\b/);
    expect(svgClass(chip)).not.toMatch(/\blucide-triangle-alert\b|\blucide-info\b/);
    const dot = tokens(dotOf(titleRow(I_JUDGMENT)));
    for (const t of ["border-[1.5px]", "border-text-subtle", "bg-transparent"]) {
      expect(dot.has(t), t).toBe(true);
    }
    expect(dot.has("bg-warning-text")).toBe(false);
  });

  test("info: neutral chip with the info glyph, filled faint dot", () => {
    const { li, titleRow } = renderRows();
    const chip = chipOf(li(I_INFO));
    expect(tokens(chip).has("bg-info-bg") && tokens(chip).has("text-text-subtle")).toBe(true);
    expect(svgClass(chip)).toMatch(/\blucide-info\b/);
    const dot = tokens(dotOf(titleRow(I_INFO)));
    expect(dot.has("bg-text-faint")).toBe(true);
    expect(dot.has("bg-warning-text")).toBe(false);
  });
});
