// @vitest-environment jsdom
// attention-alert-routing §3.2: the two parse notices render as banner LINES atop
// the Parse-warnings panel, above the list/empty-state, scoped to their own testid
// so the list cannot satisfy the copy assertion, and NOT as CompactAlertCards.
import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import {
  WarningsBreakdown,
  Step3SectionChromeContext,
  type Step3SectionChrome,
} from "@/components/admin/wizard/step3ReviewSections";
import { toNoteItem, composeParseNote, type NoteItem } from "@/lib/admin/parseAttentionNote";
import type { AttentionItem } from "@/lib/admin/attentionItems";
import type { ParseWarning } from "@/lib/parser/types";

afterEach(cleanup);

const note = (code: string, errorCode: string | null = null): NoteItem =>
  toNoteItem({
    id: `alert:${code}`,
    kind: "alert",
    tone: "notice",
    sectionId: "warnings",
    crewKey: null,
    actionable: false,
    menuTitle: "x",
    menuSubtitle: null,
    alert: {
      alertId: code,
      code,
      template: null,
      params: {},
      action: null,
      helpHref: null,
      raisedAt: "2026-07-20T00:00:00Z",
      occurrenceCount: 1,
      autoClearNote: null,
      failedKeys: null,
      dataGaps: null,
      errorCode,
    },
  } as AttentionItem)!;

const warning = (code: string): ParseWarning =>
  ({ code, severity: "warn", message: `w ${code}` }) as ParseWarning;

function renderPanel(parseNotes: NoteItem[] | undefined, warnings: ParseWarning[]) {
  const chrome = {
    Icon: (() => null) as never,
    label: "Warnings",
    flagged: false,
    sectionId: "warnings" as const,
    dfid: "d1",
    parseNotes,
  } as unknown as Step3SectionChrome;
  return render(
    <Step3SectionChromeContext.Provider value={chrome}>
      <WarningsBreakdown dfid="d1" warnings={warnings} mode="resync" />
    </Step3SectionChromeContext.Provider>,
  );
}

describe("parse notices render as banner lines in the warnings panel", () => {
  it("PARSE note with items: full composed line, in its own testid, above the list, not a card", () => {
    const { container: root } = renderPanel(
      [note("PARSE_ERROR_LAST_GOOD", "MI-4_NO_CREW")],
      [warning("UNKNOWN_FIELD")],
    );
    const container = screen.getByTestId("parse-attention-notes");
    const p = within(container).getByTestId("parse-attention-note-PARSE_ERROR_LAST_GOOD");
    const expected = composeParseNote(note("PARSE_ERROR_LAST_GOOD", "MI-4_NO_CREW"), 1);
    expect(p.textContent).toBe(`${expected.lead} ${expected.rest}`);
    // NOT a CompactAlertCard anywhere in the notes container (a wrapping/sibling
    // card would evade a check scoped to the <p>).
    expect(container.querySelector('[data-testid^="compact-alert-card"]')).toBeNull();
    // No live-region semantics — page context, not an announcement.
    expect(container.getAttribute("role")).toBeNull();
    expect(container.getAttribute("aria-live")).toBeNull();
    // DOM ORDER: the notes container precedes the warnings-list / empty-state.
    const panel = container.parentElement!;
    const kids = [...panel.children];
    const notesIdx = kids.indexOf(container);
    const list = panel.querySelector("ul, ol");
    if (list) {
      const listIdx = kids.indexOf(list.closest(":scope > *") ?? list);
      expect(notesIdx).toBeLessThan(listIdx);
    }
    // The container is the FIRST child of the panel body either way.
    expect(root.querySelector('[data-testid="parse-attention-notes"]')).toBe(container);
  });

  it("empty list: the 'below' clause is absent (state 4 variant)", () => {
    renderPanel([note("PARSE_ERROR_LAST_GOOD", null)], []);
    const p = screen.getByTestId("parse-attention-note-PARSE_ERROR_LAST_GOOD");
    expect(p.textContent).not.toMatch(/Anything listed below/);
  });

  it("two simultaneous notices are two <p> siblings, PARSE first", () => {
    renderPanel(
      [note("RESYNC_QUALITY_REGRESSED"), note("PARSE_ERROR_LAST_GOOD")],
      [warning("UNKNOWN_FIELD")],
    );
    const container = screen.getByTestId("parse-attention-notes");
    const codes = [...container.querySelectorAll("p")].map((p) =>
      p.getAttribute("data-testid")?.replace("parse-attention-note-", ""),
    );
    expect(codes).toEqual(["PARSE_ERROR_LAST_GOOD", "RESYNC_QUALITY_REGRESSED"]);
  });

  it("no notes: no container renders", () => {
    renderPanel(undefined, [warning("UNKNOWN_FIELD")]);
    expect(screen.queryByTestId("parse-attention-notes")).toBeNull();
  });
});
