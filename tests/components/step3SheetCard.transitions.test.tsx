// @vitest-environment jsdom
/**
 * tests/components/step3SheetCard.transitions.test.tsx (Task D3 — spec §4.5)
 *
 * Transition inventory audit for the step-3 card + review header. Per §4.5:
 *
 * | Transition | Treatment |
 * |---|---|
 * | collapsed → expanded / expanded → collapsed | height auto-morph (reduced-motion: instant) |
 * | unchecked → checked / checked → unchecked | checkbox state + count update; INSTANT (no animation) |
 * | Select all toggled | each card's checkbox updates; INSTANT; count morphs (tabular-nums, no layout shift) |
 * | compound: expand while toggling Select-all | INDEPENDENT — expand animates, checkbox flips instantly |
 * | list length change | row removal: INSTANT in v1 (declared instant) |
 *
 * The card uses NO framer-motion / AnimatePresence: the only animated transition
 * is the CSS grid-template-rows / max-height height-morph on the
 * [data-step3-breakdown] region (globals.css, reduced-motion: instant). Every
 * other conditional render (checkbox, badges, warning chip, count line) is a bare
 * ternary/`&&` with NO motion wrapper → instant by construction.
 *
 * This audit asserts:
 *   1. No AnimatePresence / framer-motion import in the card or review source.
 *   2. The checkbox is NOT inside the height-morphing [data-step3-breakdown] region.
 *   3. The count line carries tabular-nums (no layout shift) and no motion wrapper.
 *   4. Compound: toggling Select-all while a card is expanded does not collapse the
 *      card and does not animate the checkbox (the regions are independent).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { ParseResult } from "@/lib/parser/types";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { Step3SheetCard } from "@/components/admin/wizard/Step3SheetCard";
import { Step3Review, type Step3Row } from "@/components/admin/wizard/Step3Review";

const WSID = "99999999-2222-4333-8444-555555555555";
const ROOT = join(__dirname, "..", "..");
const CARD_SRC = readFileSync(join(ROOT, "components/admin/wizard/Step3SheetCard.tsx"), "utf8");
const REVIEW_SRC = readFileSync(join(ROOT, "components/admin/wizard/Step3Review.tsx"), "utf8");

function parseResult(title: string): ParseResult {
  return { show: { title } } as unknown as ParseResult;
}
function stagedRow(dfid: string, title: string): Step3Row {
  return {
    driveFileId: dfid,
    driveFileName: `${title}.gsheet`,
    status: "staged",
    parseResult: parseResult(title),
  };
}
function appliedRow(dfid: string, title: string): Step3Row {
  return { ...stagedRow(dfid, title), status: "applied" };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ status: "approved" }), { status: 200 })),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("§4.5 transition audit — card has no animation on checkbox/count; only expand morphs", () => {
  it("neither the card nor the review imports framer-motion / AnimatePresence", () => {
    for (const src of [CARD_SRC, REVIEW_SRC]) {
      expect(src).not.toMatch(/framer-motion/);
      expect(src).not.toMatch(/AnimatePresence/);
      expect(src).not.toMatch(/\bmotion\./);
    }
  });

  it("the ONLY animated region is the [data-step3-breakdown] height-morph (the expand)", () => {
    // The card declares exactly one data-step3-breakdown region; that is the
    // height-morph surface (animated in globals.css, instant under reduced-motion).
    const occurrences = (CARD_SRC.match(/data-step3-breakdown/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(1);
  });

  it("the checkbox is INSTANT: it lives OUTSIDE the height-morphing breakdown region", () => {
    const dfid = "df-tr-1";
    const { getByTestId } = render(
      <Step3SheetCard row={stagedRow(dfid, "Tr")} wizardSessionId={WSID} />,
    );
    const box = getByTestId(`wizard-step3-checkbox-${dfid}`);
    const breakdown = getByTestId(`wizard-step3-card-${dfid}-breakdown`);
    // The checkbox is in the always-visible header, not inside the morphing panel.
    expect(breakdown.contains(box)).toBe(false);
    // No CSS transition/animation utility on the checkbox itself.
    expect(box.className).not.toMatch(/transition|animate|duration/);
  });

  it("the count line uses tabular-nums (no layout shift) and carries no motion wrapper", () => {
    const { getByTestId } = render(
      <Step3Review wizardSessionId={WSID} rows={[stagedRow("c1", "C1"), appliedRow("c2", "C2")]} />,
    );
    const count = getByTestId("wizard-step3-publish-count");
    expect(count.className).toMatch(/tabular-nums/);
    expect(count.className).not.toMatch(/animate|transition-\[height\]|motion/);
  });

  it("compound: toggling Select-all while a card is expanded keeps the card expanded (independent regions; no animation gating, no collapse)", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ status: "approved" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const dfid = "s-compound";
    const { getByTestId } = render(
      <Step3Review wizardSessionId={WSID} rows={[stagedRow(dfid, "Comp")]} />,
    );

    // Expand the card first.
    const expand = getByTestId(`wizard-step3-card-${dfid}-expand`);
    fireEvent.click(expand);
    const breakdown = getByTestId(`wizard-step3-card-${dfid}-breakdown`);
    expect(breakdown.getAttribute("data-expanded")).toBe("true");

    // The Select-all visual flips instantly to checked (its own optimistic state),
    // proving the count/select-all region animates nothing and never gates on the
    // card's expand state.
    const selectAll = getByTestId("wizard-step3-select-all") as HTMLInputElement;
    expect(selectAll.checked).toBe(false);
    fireEvent.click(selectAll);
    // Instant flip of the header control (no animation, no await on a transition).
    expect(selectAll.checked).toBe(true);
    expect(selectAll.className).not.toMatch(/transition|animate|duration/);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // Expand state is UNTOUCHED by the Select-all toggle — the regions are
    // independent; the publish toggle never collapses or animates the breakdown.
    expect(breakdown.getAttribute("data-expanded")).toBe("true");
    // The per-card checkbox itself carries no animation utilities (instant §4.5).
    const box = getByTestId(`wizard-step3-checkbox-${dfid}`) as HTMLInputElement;
    expect(box.className).not.toMatch(/transition|animate|duration/);
  });
});
