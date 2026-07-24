// @vitest-environment jsdom
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

afterEach(() => cleanup());

import { sheetWarningsPanelCount } from "@/lib/admin/sheetWarningsCount";
import { NoteWarningCard, notePopoverParts } from "@/components/admin/NoteWarningCard";
import { correctionLoopCopy } from "@/components/admin/CorrectionLoopCallout";
import { reviewWarningTitle } from "@/lib/admin/reviewWarningTitle";
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";
import type { ParseWarning } from "@/lib/parser/types";

describe("sheetWarningsPanelCount (spec §2.3)", () => {
  it("sums visible info rows and active here-cards; ignored and elsewhere excluded by construction", () => {
    expect(sheetWarningsPanelCount({ visibleInfoRows: 2, activeHere: 3 })).toBe(5);
    expect(sheetWarningsPanelCount({ visibleInfoRows: 0, activeHere: 0 })).toBe(0);
  });
});

// ── Task 4: note popovers (spec §2.4) ───────────────────────────────────────

const blank = (s: string | null | undefined): boolean =>
  s == null || s.trim().length === 0;
const nonBlank = (s: string | null | undefined): boolean => !blank(s);

const CODES = Object.keys(MESSAGE_CATALOG) as MessageCode[];
// Codes selected from the LIVE catalog so expectations can never be re-authored
// literals (anti-tautology): the test computes copy the same way the source does.
const HAS_LONG = CODES.find((c) => nonBlank(MESSAGE_CATALOG[c].longExplanation))!;
const LONG_BLANK_CTX = CODES.find(
  (c) => blank(MESSAGE_CATALOG[c].longExplanation) && nonBlank(MESSAGE_CATALOG[c].helpfulContext),
)!;
const HAS_CTX = CODES.find((c) => nonBlank(MESSAGE_CATALOG[c].helpfulContext))!;
const NOT_A_CODE = "NOT_A_CODE"; // absent from the catalog by construction

// buildSheetDeepLink only yields an href for an allowlisted tab title.
const CELL = { title: "INFO", gid: 0, a1: "A1" };
const RESYNC = correctionLoopCopy("resync");

function warnWith(overrides: Partial<ParseWarning> & { code: string }): ParseWarning {
  return { severity: "info", message: "", ...overrides };
}

/** Mirrors the source's first-non-blank rule; returns the ORIGINAL (untrimmed) value. */
function expectedCopyFor(code: MessageCode): string | null {
  const e = MESSAGE_CATALOG[code];
  if (nonBlank(e.longExplanation)) return e.longExplanation;
  if (nonBlank(e.helpfulContext)) return e.helpfulContext;
  return null;
}

describe("notePopoverParts (spec §2.4 truth table)", () => {
  const CASES: ReadonlyArray<
    [label: string, w: ParseWarning, copy: string | null, sentence: string | null]
  > = [
    ["copy+cell", warnWith({ code: HAS_LONG, sourceCell: CELL }), expectedCopyFor(HAS_LONG), RESYNC],
    ["copy only", warnWith({ code: HAS_LONG, sourceCell: null }), expectedCopyFor(HAS_LONG), null],
    ["cell only", warnWith({ code: NOT_A_CODE, sourceCell: CELL }), null, RESYNC],
    ["neither", warnWith({ code: NOT_A_CODE, sourceCell: null }), null, null],
  ];
  it.each(CASES)("%s", (_l, w, copy, sentence) => {
    expect(notePopoverParts(w)).toEqual({ copy, sentence });
  });
  it("blank longExplanation falls through to helpfulContext (first-non-blank, not ??)", () => {
    const p = notePopoverParts(warnWith({ code: LONG_BLANK_CTX, sourceCell: null }));
    expect(p.copy).toBe(MESSAGE_CATALOG[LONG_BLANK_CTX].helpfulContext);
    expect(p.sentence).toBeNull();
  });
});

/** The HoverHelp body stays mounted (visually hidden) for screen readers, so the
 *  paragraphs are queryable without opening the popover. First child = copy
 *  paragraph; a `<p class="mt-2">` sibling = the sentence paragraph. */
function popoverBodyEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    '[data-testid^="note-warning-help-"][data-testid$="-body"]',
  );
}
function popoverTriggerEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    '[data-testid^="note-warning-help-"][data-testid$="-trigger"]',
  );
}

describe("NoteWarningCard rendered popover (all four truth-table rows)", () => {
  it("copy+cell: two paragraphs, copy first, sentence second", () => {
    render(<NoteWarningCard warning={warnWith({ code: HAS_LONG, sourceCell: CELL })} driveFileId="d1" />);
    const body = popoverBodyEl();
    expect(body).not.toBeNull();
    expect(body!.firstElementChild!.textContent).toBe(expectedCopyFor(HAS_LONG));
    expect(body!.querySelector("p.mt-2")!.textContent).toBe(RESYNC);
  });

  it("copy only: single copy paragraph", () => {
    render(<NoteWarningCard warning={warnWith({ code: HAS_LONG, sourceCell: null })} driveFileId="d1" />);
    const body = popoverBodyEl();
    expect(body!.firstElementChild!.textContent).toBe(expectedCopyFor(HAS_LONG));
    expect(body!.querySelector("p.mt-2")).toBeNull();
  });

  it("cell only: single sentence paragraph", () => {
    render(<NoteWarningCard warning={warnWith({ code: NOT_A_CODE, sourceCell: CELL })} driveFileId="d1" />);
    const body = popoverBodyEl();
    expect(body!.firstElementChild!.textContent).toBe(RESYNC);
    expect(body!.querySelector("p.mt-2")).toBeNull();
  });

  it("neither: no ? trigger rendered", () => {
    render(<NoteWarningCard warning={warnWith({ code: NOT_A_CODE, sourceCell: null })} driveFileId="d1" />);
    expect(popoverTriggerEl()).toBeNull();
    expect(popoverBodyEl()).toBeNull();
  });

  it("blank-longExplanation fallthrough renders helpfulContext paragraph", () => {
    render(<NoteWarningCard warning={warnWith({ code: LONG_BLANK_CTX, sourceCell: null })} driveFileId="d1" />);
    expect(popoverBodyEl()!.firstElementChild!.textContent).toBe(
      MESSAGE_CATALOG[LONG_BLANK_CTX].helpfulContext,
    );
  });

  it("neutral tone, title, guidance; no severity glyph, no Report/Ignore buttons", () => {
    const w = warnWith({ code: HAS_CTX, sourceCell: null });
    render(<NoteWarningCard warning={w} driveFileId="d1" />);
    const card = screen.getByTestId("compact-alert-card");
    // Neutral skin, never the amber severity surface.
    expect(card.className).toContain("bg-surface");
    expect(card.className).not.toContain("bg-warning-bg");
    // Title from reviewWarningTitle.
    expect(screen.getByTestId("note-warning-title").textContent).toBe(reviewWarningTitle(w));
    // Guidance line present (helpfulContext-derived).
    expect(screen.getByTestId("note-warning-guidance")).not.toBeNull();
    // No severity glyph "!" in the message row.
    const messageRow = screen.getByTestId("compact-alert-message");
    expect(within(messageRow).queryByText("!")).toBeNull();
    // No mutate controls.
    expect(screen.queryByRole("button", { name: /report|ignore/i })).toBeNull();
  });

  it("no guidance element when context blank", () => {
    render(<NoteWarningCard warning={warnWith({ code: NOT_A_CODE, sourceCell: null })} driveFileId="d1" />);
    expect(screen.queryByTestId("note-warning-guidance")).toBeNull();
  });

  it("Open in Sheet renders iff buildSheetDeepLink yields href (null driveFileId + cell → absent)", () => {
    // Present driveFileId + allowlisted cell → link renders.
    const { unmount } = render(
      <NoteWarningCard warning={warnWith({ code: NOT_A_CODE, sourceCell: CELL })} driveFileId="d1" />,
    );
    expect(screen.getByTestId("note-warning-sheet-link")).not.toBeNull();
    unmount();
    // Null driveFileId → buildSheetDeepLink returns null → no link.
    render(<NoteWarningCard warning={warnWith({ code: NOT_A_CODE, sourceCell: CELL })} driveFileId={null} />);
    expect(screen.queryByTestId("note-warning-sheet-link")).toBeNull();
  });
});
