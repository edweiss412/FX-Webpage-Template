// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/wizardAttentionMenu.test.tsx
 * (wizard-review-attention-menu spec §3.3 — Task 7)
 *
 * The wizard's warning index. It renders NO overlay markup of its own — the
 * chrome is the published menu's exported AttentionMenuFrame — so what these
 * cases pin is the wizard-specific part: which group leads, what names the
 * panel, the per-entry row identity, and that NOTHING is capped. An index that
 * hides entries is the defect this feature exists to fix, so the no-cap case
 * builds past any plausible cap rather than trusting the scroller.
 *
 * Every expected count is read off the derivation's own output, never restated.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { WizardAttentionMenu } from "@/components/admin/wizard/WizardAttentionMenu";
import { deriveWarningAttention } from "@/lib/admin/warningAttention";
import { reviewWarningTitle } from "@/lib/admin/reviewWarningTitle";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { isAmbiguityCode } from "@/lib/parser/ambiguityCodes";
import type { SectionId } from "@/lib/admin/step3SectionStatus";
import type { ParseWarning } from "@/lib/parser/types";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const DFID = "drive-abc-123";
const TB = `wizard-step3-card-${DFID}`;

const SECTIONS = [
  { id: "crew" as SectionId, label: "Crew" },
  { id: "rooms" as SectionId, label: "Rooms" },
];

const warn = (code: string): ParseWarning => ({
  severity: "warn",
  code,
  message: "",
  blockRef: { kind: "crew" },
});

/** Built through the production derivation, so `tone` is the real
 *  isAmbiguityCode partition rather than a value this test chose. */
function attentionFor(codes: string[]) {
  return deriveWarningAttention(
    codes.map((code, index) => ({
      id: `warning:${index}`,
      sectionId: (index % 2 === 0 ? "crew" : "rooms") as SectionId,
      warning: warn(code),
      index,
    })),
    SECTIONS,
  );
}

const NEEDS = "UNKNOWN_FIELD";
const JUDG = "ROOM_HEADER_SPLIT_AMBIGUOUS";

function renderMenu(codes: string[], over: { open?: boolean; onNavigate?: () => void } = {}) {
  const attention = attentionFor(codes);
  const pillRef = createRef<HTMLButtonElement>();
  const pill = document.createElement("button");
  document.body.appendChild(pill);
  (pillRef as { current: HTMLButtonElement | null }).current = pill;
  const onClose = vi.fn();
  const onNavigate = over.onNavigate ?? vi.fn();
  render(
    <WizardAttentionMenu
      dfid={DFID}
      attention={attention}
      open={over.open ?? true}
      onClose={onClose}
      onNavigate={onNavigate}
      pillRef={pillRef}
    />,
  );
  return { attention, onClose, onNavigate, pill };
}

const rowTid = (index: number) => `${TB}-attention-row-${index}`;

describe("WizardAttentionMenu (spec §3.3)", () => {
  it("mixed: needs-look heading leads outside the scroller, judgment group follows with a top border", () => {
    const { attention } = renderMenu([NEEDS, JUDG, NEEDS]);
    premise("two needs-look entries", attention.needsLook.length, 1);
    premiseHolds("one judgment entry", attention.judgment.length === 1);
    const panel = screen.getByTestId(`${TB}-review-attention-menu`);
    expect(panel.getAttribute("role")).toBe("group");
    expect(panel.getAttribute("aria-label")).toBe("Needs a look");

    const scroller = screen.getByRole("group", { name: "Warnings to review" });
    const lead = screen.getByTestId("wizard-attention-needslook-heading");
    // OUTSIDE the scroller, so it keeps labelling the panel while a long list
    // scrolls under it (the published "Needs you" placement).
    expect(scroller.contains(lead)).toBe(false);
    expect(lead.nextElementSibling).toBe(scroller);

    const judgHeading = screen.getByTestId("wizard-attention-judgment-heading");
    expect(scroller.contains(judgHeading)).toBe(true);
    expect(judgHeading.className).toContain("border-t");
    expect(judgHeading.className).not.toContain("rounded-t-md");

    // Every entry rendered, needs-look before judgment.
    const rendered = [
      ...panel.querySelectorAll<HTMLElement>(`[data-testid^="${TB}-attention-row-"]`),
    ];
    expect(rendered.map((r) => r.getAttribute("data-testid"))).toEqual([
      ...attention.needsLook.map((e) => rowTid(e.index)),
      ...attention.judgment.map((e) => rowTid(e.index)),
    ]);
  });

  it("judgment-only: the judgment heading leads and rounds, no needs-look heading, panel named Judgment calls", () => {
    const { attention } = renderMenu([JUDG, JUDG]);
    premiseHolds("no needs-look entries", attention.needsLook.length === 0);
    expect(screen.getByTestId(`${TB}-review-attention-menu`).getAttribute("aria-label")).toBe(
      "Judgment calls",
    );
    expect(screen.queryByTestId("wizard-attention-needslook-heading")).toBeNull();
    const heading = screen.getByTestId("wizard-attention-judgment-heading");
    expect(heading.className).toContain("rounded-t-md");
    expect(heading.className).not.toContain("border-t");
  });

  it("rows carry the tone dot their entry's tone dictates, and the section label as second line", () => {
    const { attention } = renderMenu([NEEDS, JUDG]);
    premiseHolds("ROOM_HEADER_SPLIT_AMBIGUOUS is an ambiguity code", isAmbiguityCode(JUDG));
    const needs = attention.needsLook[0]!;
    const judg = attention.judgment[0]!;
    const needsRow = screen.getByTestId(rowTid(needs.index));
    const judgRow = screen.getByTestId(rowTid(judg.index));
    expect(needsRow.querySelector(".bg-status-review")).toBeTruthy();
    expect(needsRow.querySelector(".sr-only")?.textContent).toBe("needs review: ");
    expect(judgRow.querySelector(".border-text-faint")).toBeTruthy();
    expect(judgRow.querySelector(".bg-transparent")).toBeTruthy();
    expect(judgRow.querySelector(".sr-only")?.textContent).toBe("judgment call: ");
    // Titles come from the shared helper (invariant 5: never a bare code).
    expect(needsRow.textContent).toContain(reviewWarningTitle(needs.warning));
    expect(needsRow.textContent).toContain(needs.sectionLabel);
    expect(judgRow.textContent).toContain(judg.sectionLabel);
    // The two entries were routed to DIFFERENT sections, so the labels being
    // distinct is what proves the row reads its own entry.
    expect(needs.sectionLabel).not.toBe(judg.sectionLabel);
  });

  it("a judgment row is pressable: click closes, then navigates with the entry", () => {
    const calls: string[] = [];
    const onNavigate = vi.fn(() => calls.push("navigate"));
    const attention = attentionFor([JUDG]);
    const pillRef = createRef<HTMLButtonElement>();
    const pill = document.createElement("button");
    document.body.appendChild(pill);
    (pillRef as { current: HTMLButtonElement | null }).current = pill;
    render(
      <WizardAttentionMenu
        dfid={DFID}
        attention={attention}
        open
        onClose={vi.fn(() => calls.push("close"))}
        onNavigate={onNavigate}
        pillRef={pillRef}
      />,
    );
    const entry = attention.judgment[0]!;
    const row = screen.getByTestId(rowTid(entry.index));
    expect(row.tagName).toBe("BUTTON");
    fireEvent.click(row);
    expect(calls).toEqual(["close", "navigate"]);
    expect(onNavigate).toHaveBeenCalledWith(entry);
  });

  it("open=false renders nothing at all", () => {
    renderMenu([NEEDS], { open: false });
    expect(screen.queryByTestId(`${TB}-review-attention-menu`)).toBeNull();
    expect(screen.queryByTestId(rowTid(0))).toBeNull();
  });

  it("no row cap: every entry renders even well past the pill's 99+ display cap", () => {
    // The defect this feature fixes is an index that hides entries, so the cap
    // case builds past any plausible one and counts the rendered rows against
    // the derivation's own total.
    const { attention } = renderMenu(Array.from({ length: 100 }, () => NEEDS));
    premise("list exceeds the visible cap", attention.all.length, 99);
    const rows = document.querySelectorAll(`[data-testid^="${TB}-attention-row-"]`);
    expect(rows.length).toBe(attention.all.length);
  });

  it("renders no overlay markup of its own — the frame owns the panel", () => {
    // §5: the wizard menu consumes AttentionMenuFrame. If it grew its own
    // panel div, there would be two, and the popover-overlay registry would
    // owe a second row.
    renderMenu([NEEDS]);
    expect(screen.getAllByTestId(`${TB}-review-attention-menu`).length).toBe(1);
    expect(screen.queryByTestId("published-show-review-attention-menu")).toBeNull();
  });
});
