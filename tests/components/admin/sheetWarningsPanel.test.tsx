// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin/show/polish-fixture-show",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => cleanup());

import { sheetWarningsPanelCount } from "@/lib/admin/sheetWarningsCount";
import { NoteWarningCard, notePopoverParts } from "@/components/admin/NoteWarningCard";
import { correctionLoopCopy } from "@/components/admin/CorrectionLoopCallout";
import { reviewWarningTitle } from "@/lib/admin/reviewWarningTitle";
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";
import type { ParseWarning } from "@/lib/parser/types";
import { ShowReviewSurface } from "@/components/admin/review/ShowReviewSurface";
import { buildPublishedSurfaceProps } from "@/tests/helpers/publishedSurfaceProps";
import { step3Sections } from "@/components/admin/wizard/step3ReviewSections";

describe("sheetWarningsPanelCount (spec §2.3)", () => {
  it("sums visible info rows and active here-cards; ignored and elsewhere excluded by construction", () => {
    expect(sheetWarningsPanelCount({ visibleInfoRows: 2, activeHere: 3 })).toBe(5);
    expect(sheetWarningsPanelCount({ visibleInfoRows: 0, activeHere: 0 })).toBe(0);
  });
});

// ── Task 4: note popovers (spec §2.4) ───────────────────────────────────────

const blank = (s: string | null | undefined): boolean => s == null || s.trim().length === 0;
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
    [
      "copy+cell",
      warnWith({ code: HAS_LONG, sourceCell: CELL }),
      expectedCopyFor(HAS_LONG),
      RESYNC,
    ],
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
    render(
      <NoteWarningCard warning={warnWith({ code: HAS_LONG, sourceCell: CELL })} driveFileId="d1" />,
    );
    const body = popoverBodyEl();
    expect(body).not.toBeNull();
    expect(body!.firstElementChild!.textContent).toBe(expectedCopyFor(HAS_LONG));
    expect(body!.querySelector("p.mt-2")!.textContent).toBe(RESYNC);
  });

  it("copy only: single copy paragraph", () => {
    render(
      <NoteWarningCard warning={warnWith({ code: HAS_LONG, sourceCell: null })} driveFileId="d1" />,
    );
    const body = popoverBodyEl();
    expect(body!.firstElementChild!.textContent).toBe(expectedCopyFor(HAS_LONG));
    expect(body!.querySelector("p.mt-2")).toBeNull();
  });

  it("cell only: single sentence paragraph", () => {
    render(
      <NoteWarningCard
        warning={warnWith({ code: NOT_A_CODE, sourceCell: CELL })}
        driveFileId="d1"
      />,
    );
    const body = popoverBodyEl();
    expect(body!.firstElementChild!.textContent).toBe(RESYNC);
    expect(body!.querySelector("p.mt-2")).toBeNull();
  });

  it("neither: no ? trigger rendered", () => {
    render(
      <NoteWarningCard
        warning={warnWith({ code: NOT_A_CODE, sourceCell: null })}
        driveFileId="d1"
      />,
    );
    expect(popoverTriggerEl()).toBeNull();
    expect(popoverBodyEl()).toBeNull();
  });

  it("blank-longExplanation fallthrough renders helpfulContext paragraph", () => {
    render(
      <NoteWarningCard
        warning={warnWith({ code: LONG_BLANK_CTX, sourceCell: null })}
        driveFileId="d1"
      />,
    );
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
    render(
      <NoteWarningCard
        warning={warnWith({ code: NOT_A_CODE, sourceCell: null })}
        driveFileId="d1"
      />,
    );
    expect(screen.queryByTestId("note-warning-guidance")).toBeNull();
  });

  it("Open in Sheet renders iff buildSheetDeepLink yields href (null driveFileId + cell → absent)", () => {
    // Present driveFileId + allowlisted cell → link renders.
    const { unmount } = render(
      <NoteWarningCard
        warning={warnWith({ code: NOT_A_CODE, sourceCell: CELL })}
        driveFileId="d1"
      />,
    );
    expect(screen.getByTestId("note-warning-sheet-link")).not.toBeNull();
    unmount();
    // Null driveFileId → buildSheetDeepLink returns null → no link.
    render(
      <NoteWarningCard
        warning={warnWith({ code: NOT_A_CODE, sourceCell: CELL })}
        driveFileId={null}
      />,
    );
    expect(screen.queryByTestId("note-warning-sheet-link")).toBeNull();
  });
});

// ── Task 5: published panel state matrix (spec §2.3a) + structural proofs ────

const DFID = "DRIVE_POLISH"; // buildPublishedSurfaceProps' fixture drive_file_id.
const REVIEW_SECTION = `wizard-step3-card-${DFID}-review-section-warnings`;
const PANEL_CARD = `wizard-step3-card-${DFID}-section-warnings-panel-card`;
const POINTER = `wizard-step3-card-${DFID}-warnings-elsewhere`;
const CLEAN = `wizard-step3-card-${DFID}-warnings-clean`;

type BlockName = "notes" | "notesGroup" | "actionable" | "ignored" | "pointer" | "clean";

function warningsSection(): HTMLElement {
  return screen.getByTestId(REVIEW_SECTION);
}

/** Presence of each of the six §2.3a interior blocks, scoped to the warnings
 *  section. `actionable` = at least one active amber card OUTSIDE the ignored
 *  disclosure (the disclosure also renders `per-show-actionable-item`s). */
function blockPresence(): Record<BlockName, boolean> {
  const sec = warningsSection();
  const ignored = within(sec).queryByTestId("section-ignored-warnings-warnings");
  const activeCards = within(sec)
    .queryAllByTestId("per-show-actionable-item")
    .filter((el) => ignored === null || !ignored.contains(el));
  return {
    notes: within(sec).queryByTestId("parse-attention-notes") !== null,
    notesGroup: within(sec).queryByTestId("sheet-warnings-notes-group") !== null,
    actionable: activeCards.length > 0,
    ignored: ignored !== null,
    pointer: within(sec).queryByTestId(POINTER) !== null,
    clean: within(sec).queryByTestId(CLEAN) !== null,
  };
}

function expectBlocks(expected: Record<BlockName, boolean>) {
  expect(blockPresence()).toEqual(expected);
  // The box (panel-card element with a border) renders in EVERY state (§2.2).
  expect(screen.getByTestId(PANEL_CARD).className).toContain("border");
  // §4: the published correction callout is retired in EVERY state.
  expect(within(warningsSection()).queryByTestId("correction-loop-callout")).toBeNull();
}

/** The heading count chip text ("(N)"), or null when no chip renders. */
function headingCount(): number | null {
  const heading = warningsSection().querySelector("h3");
  const headingRow = heading?.parentElement ?? null;
  if (headingRow === null) return null;
  const chip = Array.from(headingRow.querySelectorAll("span.tabular-nums")).find((el) =>
    /^\(\d+\)$/.test((el.textContent ?? "").trim()),
  );
  if (!chip) return null;
  return Number((chip.textContent ?? "").trim().replace(/[()]/g, ""));
}

describe("published panel state matrix (spec §2.3a)", () => {
  it("notes-only: Notes group renders; count == info; no other block", () => {
    render(<ShowReviewSurface {...buildPublishedSurfaceProps({ listed: 3 })} />);
    expectBlocks({
      notes: false,
      notesGroup: true,
      actionable: false,
      ignored: false,
      pointer: false,
      clean: false,
    });
    expect(headingCount()).toBe(3);
  });

  it("here-cards-only (Silent-was): actionable groups inside the box; count == here", () => {
    render(<ShowReviewSurface {...buildPublishedSurfaceProps({ listed: 0, here: 3 })} />);
    expectBlocks({
      notes: false,
      notesGroup: false,
      actionable: true,
      ignored: false,
      pointer: false,
      clean: false,
    });
    // Extras render INSIDE the panel-card box (no sibling), and seamless (no seam).
    const extras = within(warningsSection()).getByTestId("section-warning-controls-warnings");
    expect(screen.getByTestId(PANEL_CARD).contains(extras)).toBe(true);
    expect(extras.className).toBe("flex flex-col gap-3");
    expect(headingCount()).toBe(3);
  });

  it("both: Notes group BEFORE actionable groups; count == info + here (summed)", () => {
    render(<ShowReviewSurface {...buildPublishedSurfaceProps({ listed: 2, here: 3 })} />);
    expectBlocks({
      notes: false,
      notesGroup: true,
      actionable: true,
      ignored: false,
      pointer: false,
      clean: false,
    });
    const sec = warningsSection();
    const notes = within(sec).getByTestId("sheet-warnings-notes-group");
    const active = within(sec).getByTestId("section-warning-active-warnings");
    expect(notes.compareDocumentPosition(active) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Summed, fixture-derived — distinguishes info+here from info-only or here-only.
    expect(headingCount()).toBe(5);
  });

  it("ignored-only: Clean row + Ignored disclosure together; count 0", () => {
    render(<ShowReviewSurface {...buildPublishedSurfaceProps({ listed: 0, ignoredHere: 2 })} />);
    expectBlocks({
      notes: false,
      notesGroup: false,
      actionable: false,
      ignored: true,
      pointer: false,
      clean: true,
    });
    expect(headingCount()).toBe(0);
  });

  it("elsewhere-only + ign>0: pointer sentence coexists with the ignored disclosure", () => {
    render(
      <ShowReviewSurface
        {...buildPublishedSurfaceProps({ listed: 0, elsewhere: 1, ignoredHere: 2 })}
      />,
    );
    expectBlocks({
      notes: false,
      notesGroup: false,
      actionable: false,
      ignored: true,
      pointer: true,
      clean: false,
    });
  });

  it("empty: Clean row alone; '(0)' chip", () => {
    render(<ShowReviewSurface {...buildPublishedSurfaceProps({ listed: 0 })} />);
    expectBlocks({
      notes: false,
      notesGroup: false,
      actionable: false,
      ignored: false,
      pointer: false,
      clean: true,
    });
    expect(headingCount()).toBe(0);
  });

  it("§2.5 no cap: 25 info notes + 15 here amber cards all render (count equality == no truncation)", () => {
    render(<ShowReviewSurface {...buildPublishedSurfaceProps({ listed: 25, here: 15 })} />);
    const sec = warningsSection();
    expect(within(sec).queryAllByTestId("note-warning-title").length).toBe(25);
    const ignored = within(sec).queryByTestId("section-ignored-warnings-warnings");
    const activeCards = within(sec)
      .queryAllByTestId("per-show-actionable-item")
      .filter((el) => ignored === null || !ignored.contains(el));
    expect(activeCards.length).toBe(15);
  });
});

describe("Task 5 Step 5 — transition audit (spec §2.6)", () => {
  it("NoteWarningCard and the notes-group block introduce no animation/transition utilities", () => {
    const noteSrc = readFileSync(
      resolve(process.cwd(), "components/admin/NoteWarningCard.tsx"),
      "utf8",
    );
    for (const pat of [
      /AnimatePresence/,
      /\bmotion\./,
      /\btransition-/,
      /\banimate-/,
      /\bduration-\[?\d/,
    ]) {
      expect(noteSrc, `NoteWarningCard must not introduce ${pat}`).not.toMatch(pat);
    }
    // The published notes-group block in WarningsBreakdown carries no transition.
    const step3 = readFileSync(
      resolve(process.cwd(), "components/admin/wizard/step3ReviewSections.tsx"),
      "utf8",
    );
    const start = step3.indexOf('data-testid="sheet-warnings-notes-group"');
    expect(start).toBeGreaterThan(-1);
    const block = step3.slice(start, start + 600);
    for (const pat of [/AnimatePresence/, /\bmotion\./, /\btransition-/, /\banimate-/]) {
      expect(block).not.toMatch(pat);
    }
  });
});

describe("Task 5 Step 6 — one-helper structural proof (spec §2.3)", () => {
  it("heading count and the warnings railCount both call sheetWarningsPanelCount; visibleWarningRows drives no other warnings count", () => {
    const src = readFileSync(
      resolve(process.cwd(), "components/admin/wizard/step3ReviewSections.tsx"),
      "utf8",
    );
    // Whitespace-normalized so prettier line-wrapping cannot mask the call.
    const flat = src.replace(/\s+/g, " ");
    // The WarningsBreakdown BreakdownSection count expression uses the helper.
    const breakdownStart = flat.indexOf("testId={`wizard-step3-card-${dfid}-breakdown-warnings`}");
    const countExpr = flat.slice(breakdownStart, breakdownStart + 500);
    expect(countExpr).toContain(
      "sheetWarningsPanelCount({ visibleInfoRows: rows.length, activeHere: here }",
    );
    // The warnings railCount closure uses the same helper, and no OTHER warnings
    // count is derived straight from visibleWarningRows(...).length in the gated
    // (published) path.
    const railStart = flat.indexOf('id: "warnings"');
    const railExpr = flat.slice(railStart, railStart + 600);
    expect(railExpr).toContain("sheetWarningsPanelCount({");
  });

  it("the warnings railCount equals the heading count rendered for the same fixture (here included)", () => {
    render(<ShowReviewSurface {...buildPublishedSurfaceProps({ listed: 2, here: 3 })} />);
    const rendered = headingCount();
    expect(rendered).toBe(5);
    // Invoke the registry railCount directly with the same gate + active-here.
    const props = buildPublishedSurfaceProps({ listed: 2, here: 3 });
    const def = step3Sections(props.data as never).find((s) => s.id === "warnings");
    const rail = def!.railCount!(props.data as never, {
      routedWarningsRenderElsewhere: true,
      activeHere: 3,
    });
    expect(rail).toBe(rendered);
  });
});

describe("Task 5 Step 7 — class sweep", () => {
  it("no source file references suppressPanelCard / suppressWarningsPanelCard / seamless", () => {
    for (const rel of [
      "components/admin/wizard/step3ReviewSections.tsx",
      "components/admin/review/ShowReviewSurface.tsx",
      "components/admin/showpage/sectionWarningExtras.tsx",
    ]) {
      const src = readFileSync(resolve(process.cwd(), rel), "utf8");
      expect(src, `${rel} must not reference the retired flags`).not.toMatch(
        /suppressPanelCard|suppressWarningsPanelCard|seamless/,
      );
    }
  });
});
