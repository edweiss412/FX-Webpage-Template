// @vitest-environment jsdom
/**
 * tests/components/step3SheetCard.transitions.test.tsx (spec §4.5, post "More"-dialog)
 *
 * Transition inventory audit for the step-3 card + review header after the
 * inline height-morph breakdown was replaced by the "More" details overlay
 * (<Step3DetailsDialog>: a bottom sheet on mobile, a centered popup on desktop).
 *
 * | Transition | Treatment |
 * |---|---|
 * | closed → details open / open → closed | dialog rise (mobile) / pop (desktop) + scrim fade — CSS, reduced-motion: instant |
 * | unchecked → checked / checked → unchecked | checkbox state + count update; INSTANT (no animation) |
 * | Select all toggled | each card's checkbox updates; INSTANT; count morphs (tabular-nums, no layout shift) |
 * | compound: toggle Select-all while the details dialog is open | INDEPENDENT — dialog stays open, checkbox flips instantly |
 * | list length change | row removal: INSTANT in v1 (declared instant) |
 *
 * The card/review/dialog use NO framer-motion / AnimatePresence: the only
 * animated surfaces are the dialog panel + scrim, animated purely in globals.css
 * ([data-step3-details-panel] / [data-step3-details-scrim], reduced-motion:
 * instant). Every other conditional render (checkbox, badges, warning chip,
 * count line, the whole breakdown's mount/unmount) is a bare ternary/`&&` with
 * NO motion wrapper → instant by construction.
 *
 * This audit asserts:
 *   1. No AnimatePresence / framer-motion import in the card, review, OR dialog.
 *   2. The animation lives on the dialog's CSS hooks (not the card); the card no
 *      longer ships the retired [data-step3-breakdown] height-morph region.
 *   3. The checkbox is INSTANT and lives OUTSIDE the details dialog.
 *   4. The count line carries tabular-nums (no layout shift) and no motion wrapper.
 *   5. Compound: toggling Select-all while the dialog is open keeps it open and
 *      does not animate the checkbox (the regions are independent).
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
const DIALOG_SRC = readFileSync(
  join(ROOT, "components/admin/wizard/Step3DetailsDialog.tsx"),
  "utf8",
);

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

describe("§4.5 transition audit — only the details dialog animates; checkbox/count are instant", () => {
  it("neither the card, the review, nor the dialog imports framer-motion / AnimatePresence", () => {
    for (const src of [CARD_SRC, REVIEW_SRC, DIALOG_SRC]) {
      expect(src).not.toMatch(/framer-motion/);
      expect(src).not.toMatch(/AnimatePresence/);
      expect(src).not.toMatch(/\bmotion\./);
    }
  });

  it("the animated surface is the dialog's CSS hooks; the card no longer ships the height-morph region", () => {
    // The dialog carries the rise/pop/scrim hooks (animated in globals.css).
    expect(DIALOG_SRC).toMatch(/data-step3-details-panel/);
    expect(DIALOG_SRC).toMatch(/data-step3-details-scrim/);
    // The retired inline height-morph region is gone from the card.
    expect(CARD_SRC).not.toMatch(/data-step3-breakdown/);
  });

  it("the checkbox is INSTANT: it lives OUTSIDE the details dialog (and there is no dialog until 'More')", () => {
    const dfid = "df-tr-1";
    const { getByTestId, queryByTestId } = render(
      <Step3SheetCard row={stagedRow(dfid, "Tr")} wizardSessionId={WSID} />,
    );
    const box = getByTestId(`wizard-step3-checkbox-${dfid}`);
    // Closed: no dialog in the DOM at all.
    expect(queryByTestId(`wizard-step3-card-${dfid}-details-dialog`)).toBeNull();
    // No CSS transition/animation utility on the checkbox input itself.
    expect(box.className).not.toMatch(/transition|animate|duration/);
    // Open the dialog → the checkbox stays in the always-visible header, not inside it.
    fireEvent.click(getByTestId(`wizard-step3-card-${dfid}-more`));
    const dialog = getByTestId(`wizard-step3-card-${dfid}-details-dialog`);
    expect(dialog.contains(box)).toBe(false);
  });

  it("the count line uses tabular-nums (no layout shift) and carries no motion wrapper", () => {
    const { getByTestId } = render(
      <Step3Review wizardSessionId={WSID} rows={[stagedRow("c1", "C1"), appliedRow("c2", "C2")]} />,
    );
    const count = getByTestId("wizard-step3-publish-count");
    expect(count.className).toMatch(/tabular-nums/);
    expect(count.className).not.toMatch(/animate|transition-\[height\]|motion/);
  });

  it("compound: toggling Select-all while the details dialog is open keeps it open (independent regions)", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ status: "approved" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const dfid = "s-compound";
    const { getByTestId } = render(
      <Step3Review wizardSessionId={WSID} rows={[stagedRow(dfid, "Comp")]} />,
    );

    // Open the details dialog first.
    fireEvent.click(getByTestId(`wizard-step3-card-${dfid}-more`));
    expect(getByTestId(`wizard-step3-card-${dfid}-details-dialog`)).not.toBeNull();

    // The Select-all visual flips instantly to checked (its own optimistic state),
    // proving the count/select-all region animates nothing and never gates on the
    // dialog's open state.
    const selectAll = getByTestId("wizard-step3-select-all") as HTMLInputElement;
    expect(selectAll.checked).toBe(false);
    fireEvent.click(selectAll);
    expect(selectAll.checked).toBe(true);
    expect(selectAll.className).not.toMatch(/transition|animate|duration/);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // The dialog is UNTOUCHED by the Select-all toggle — the regions are
    // independent; the publish toggle never closes or animates the overlay.
    expect(getByTestId(`wizard-step3-card-${dfid}-details-dialog`)).not.toBeNull();
    // The per-card checkbox itself carries no animation utilities (instant §4.5).
    const box = getByTestId(`wizard-step3-checkbox-${dfid}`) as HTMLInputElement;
    expect(box.className).not.toMatch(/transition|animate|duration/);
  });
});
