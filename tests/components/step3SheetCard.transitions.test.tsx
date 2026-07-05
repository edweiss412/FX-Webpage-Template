// @vitest-environment jsdom
/**
 * tests/components/step3SheetCard.transitions.test.tsx (spec §4.5, post "More"-modal)
 *
 * Transition inventory audit for the step-3 card + review header after the
 * inline height-morph breakdown was replaced by the "More" review modal
 * (<Step3ReviewModal>: a bottom sheet on mobile, a centered panel on desktop;
 * it retired <Step3DetailsDialog> in Task 8 of the 2026-07-02 redesign).
 *
 * | Transition | Treatment |
 * |---|---|
 * | closed → modal open / open → closed | panel rise (mobile) / pop (desktop) + scrim fade — CSS, reduced-motion: instant |
 * | unchecked → checked / checked → unchecked | checkbox state + count update; INSTANT (no animation) |
 * | Select all toggled | each card's checkbox updates; INSTANT; count morphs (tabular-nums, no layout shift) |
 * | compound: toggle Select-all while the review modal is open | INDEPENDENT — modal stays open, checkbox flips instantly |
 * | list length change | row removal: INSTANT in v1 (declared instant) |
 *
 * The card/review/modal use NO framer-motion / AnimatePresence: the only
 * ENTRANCE-animated surfaces are the modal panel + scrim, animated purely in
 * globals.css ([data-step3-review-panel] / [data-step3-review-scrim],
 * reduced-motion: instant); the modal's drag-to-dismiss manipulates inline
 * transform/transition directly (its own §11 audit lives in the modal suite).
 * Every other conditional render (checkbox, badges, warning chip, count line,
 * the whole section body's mount/unmount) is a bare ternary/`&&` with NO
 * motion wrapper → instant by construction.
 *
 * This audit asserts:
 *   1. No AnimatePresence / framer-motion import in the card, review, OR modal.
 *   2. The animation lives on the modal's CSS hooks (not the card); the card no
 *      longer ships the retired [data-step3-breakdown] height-morph region.
 *   3. The checkbox is INSTANT and lives OUTSIDE the review modal.
 *   4. The count line carries tabular-nums (no layout shift) and no motion wrapper.
 *   5. Compound: toggling Select-all while the modal is open keeps it open and
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
import { Step3ReviewWithFinalize } from "@/components/admin/wizard/Step3ReviewWithFinalize";

const WSID = "99999999-2222-4333-8444-555555555555";
const ROOT = join(__dirname, "..", "..");
const CARD_SRC = readFileSync(join(ROOT, "components/admin/wizard/Step3SheetCard.tsx"), "utf8");
const REVIEW_SRC = readFileSync(join(ROOT, "components/admin/wizard/Step3Review.tsx"), "utf8");
const MODAL_SRC = readFileSync(join(ROOT, "components/admin/wizard/Step3ReviewModal.tsx"), "utf8");

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

describe("§4.5 transition audit — only the review modal animates; checkbox/count are instant", () => {
  it("neither the card, the review, nor the modal imports framer-motion / AnimatePresence", () => {
    for (const src of [CARD_SRC, REVIEW_SRC, MODAL_SRC]) {
      expect(src).not.toMatch(/framer-motion/);
      expect(src).not.toMatch(/AnimatePresence/);
      expect(src).not.toMatch(/\bmotion\./);
    }
  });

  it("the animated surface is the modal's CSS hooks; the card no longer ships the height-morph region", () => {
    // The modal carries the rise/pop/scrim hooks (animated in globals.css).
    expect(MODAL_SRC).toMatch(/data-step3-review-panel/);
    expect(MODAL_SRC).toMatch(/data-step3-review-scrim/);
    // The retired inline height-morph region is gone from the card, along with
    // the retired dialog's CSS aliases (Task 8: one overlay, one set of hooks).
    expect(CARD_SRC).not.toMatch(/data-step3-breakdown/);
    expect(CARD_SRC).not.toMatch(/data-step3-details/);
  });

  it("the checkbox is INSTANT: it lives OUTSIDE the review modal (and there is no modal until 'More')", () => {
    const dfid = "df-tr-1";
    const { getByTestId, queryByTestId } = render(
      <Step3SheetCard row={stagedRow(dfid, "Tr")} wizardSessionId={WSID} />,
    );
    const box = getByTestId(`wizard-step3-checkbox-${dfid}`);
    // Closed: no modal in the DOM at all.
    expect(queryByTestId(`wizard-step3-card-${dfid}-review-modal`)).toBeNull();
    // No CSS transition/animation utility on the checkbox input itself.
    expect(box.className).not.toMatch(/transition|animate|duration/);
    // Open the modal → the checkbox stays in the always-visible header, not inside it.
    fireEvent.click(getByTestId(`wizard-step3-card-${dfid}-more`));
    const modal = getByTestId(`wizard-step3-card-${dfid}-review-modal`);
    expect(modal.contains(box)).toBe(false);
  });

  it("the footer center swaps idle hint ↔ tracking with no motion wrapper (count line removed)", () => {
    // Tracking-in-center redesign (2026-07-05): the "N of M selected" count line
    // is gone; the footer center shows a static idle hint while nothing publishes
    // (the optimistic count now rides the Publish button label). The center is an
    // instant conditional swap — no animation wrapper.
    const { getByTestId, queryByTestId } = render(
      <Step3ReviewWithFinalize
        wizardSessionId={WSID}
        rows={[stagedRow("c1", "C1"), appliedRow("c2", "C2")]}
        finishable
        initialPublishCount={1}
        initialUncheckedCleanCount={1}
      />,
    );
    expect(queryByTestId("wizard-step3-publish-count")).toBeNull();
    const center = getByTestId("wizard-step3-footer-center");
    expect(getByTestId("wizard-step3-finish-hint")).toBeTruthy();
    expect(center.className).not.toMatch(/animate|transition-\[height\]|motion/);
  });

  it("compound: toggling Select-all while the review modal is open keeps it open (independent regions)", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ status: "approved" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const dfid = "s-compound";
    const { getByTestId } = render(
      <Step3Review wizardSessionId={WSID} rows={[stagedRow(dfid, "Comp")]} />,
    );

    // Open the review modal first.
    fireEvent.click(getByTestId(`wizard-step3-card-${dfid}-more`));
    expect(getByTestId(`wizard-step3-card-${dfid}-review-modal`)).not.toBeNull();

    // The Select-all visual flips instantly to checked (its own optimistic state),
    // proving the count/select-all region animates nothing and never gates on the
    // dialog's open state.
    const selectAll = getByTestId("wizard-step3-select-all") as HTMLInputElement;
    expect(selectAll.checked).toBe(false);
    fireEvent.click(selectAll);
    expect(selectAll.checked).toBe(true);
    expect(selectAll.className).not.toMatch(/transition|animate|duration/);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // The modal is UNTOUCHED by the Select-all toggle — the regions are
    // independent; the publish toggle never closes or animates the overlay.
    expect(getByTestId(`wizard-step3-card-${dfid}-review-modal`)).not.toBeNull();
    // The per-card checkbox itself carries no animation utilities (instant §4.5).
    const box = getByTestId(`wizard-step3-checkbox-${dfid}`) as HTMLInputElement;
    expect(box.className).not.toMatch(/transition|animate|duration/);
  });
});
