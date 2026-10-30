// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/warningSectionJumps.test.tsx
 * (warning-card-fixes spec §8.2, §8.3, §5.5; plan Task 17)
 *
 * The staged wizard's warning cards jump to the section they talk about: one "Go to
 * <section>" button per active warn card whose warning routes to a rendered section, a
 * reservation jump for the four hotel judgment codes with a valid index, and nothing on
 * info rows, dismissed rows, Venue with no address, or a surface that supplies no jump.
 *
 * Section labels and membership come from the chrome's own `jumpSections` list, never
 * retyped, so a label the surface renders is the label the card says.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import {
  HOTELS_CAP,
  Step3SectionChromeContext,
  WarningsBreakdown,
  type Step3SectionChrome,
} from "@/components/admin/wizard/step3ReviewSections";
import { reviewWarningTitle } from "@/lib/admin/reviewWarningTitle";
import { stripEmphasis } from "@/lib/messages/collapsedSummary";
import { sectionForWarning, type SectionId } from "@/lib/admin/step3SectionStatus";
import { HOTEL_RESERVATION_JUDGMENT_CODES } from "@/lib/admin/warningReadingDisplay";
import type { ArchivedPullSheetTab } from "@/lib/drive/exportSheetToMarkdown";
import type { ParseWarning } from "@/lib/parser/types";
import { premiseHolds } from "@/tests/_shared/premise";

const DFID = "drive-abc-123";
const WSID = "00000000-1111-4222-8333-444444444444";

beforeEach(() => {
  refresh.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 200 })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const JUMP_SECTIONS: ReadonlyArray<{ id: SectionId; label: string }> = [
  { id: "venue", label: "Venue" },
  { id: "crew", label: "Crew" },
  { id: "hotels", label: "Hotels" },
  { id: "packlist", label: "Pack list" },
];
const labelOf = (id: SectionId): string => {
  const hit = JUMP_SECTIONS.find((s) => s.id === id);
  if (!hit) throw new Error(`no jump section ${id}`);
  return hit.label;
};

const TAB: ArchivedPullSheetTab = {
  tabName: "OLD GEAR",
  headerPreviews: ["AUDIO 1"],
  fingerprint: "fp-old-gear",
  included: false,
  contentChangedSinceAccept: false,
};

const crewField: ParseWarning = {
  severity: "warn",
  code: "UNKNOWN_FIELD",
  message: "Unrecognized crew row label: 'Hats'",
  blockRef: { kind: "crew", name: "Hats" },
  rawSnippet: "Hats | blue",
};
const archived: ParseWarning = {
  severity: "warn",
  code: "PULL_SHEET_ON_ARCHIVED_TAB",
  message: 'Pull sheet found on archived tab "OLD GEAR"; left out of the parse.',
  blockRef: { kind: "pull_sheet_archived_tab", name: "OLD GEAR" },
  rawSnippet: "AUDIO 1",
};
const guestSplit = (index: number | undefined): ParseWarning => ({
  severity: "warn",
  code: "HOTEL_GUEST_SPLIT_AMBIGUOUS",
  message: "Hotel line ran together",
  blockRef:
    index === undefined
      ? { kind: "hotels", field: "guests" }
      : { kind: "hotels", field: "guests", index },
  rawSnippet: "Hyatt Regency Eric Weiss - 110525",
  resolution: { resolvable: false, reason: "raw-not-guest-scoped" },
});

type Spies = {
  onJumpToSection: ReturnType<typeof vi.fn>;
  onJumpToHotel: ReturnType<typeof vi.fn>;
};

function renderRows(
  warnings: ParseWarning[],
  opts: {
    chrome?: Partial<Step3SectionChrome>;
    omit?: ReadonlyArray<"onJumpToSection" | "onJumpToHotel" | "jumpSections" | "hotelCount">;
    ignored?: readonly number[];
  } = {},
): Spies {
  const spies: Spies = { onJumpToSection: vi.fn(), onJumpToHotel: vi.fn() };
  const full: Record<string, unknown> = {
    Icon: (() => null) as never,
    label: "Warnings",
    flagged: false,
    dfid: DFID,
    sectionId: "warnings",
    onJumpToSection: spies.onJumpToSection,
    onJumpToHotel: spies.onJumpToHotel,
    jumpSections: JUMP_SECTIONS,
    hotelCount: 2,
    ...opts.chrome,
  };
  for (const k of opts.omit ?? []) delete full[k];
  const ignored = new Set(opts.ignored ?? []);
  const model = {
    active: warnings
      .map((_, index) => ({ index, reportSurfaceId: `sid-${index}` }))
      .filter((x) => !ignored.has(x.index)),
    ignored: [...ignored].map((index) => ({ index, reportSurfaceId: `sid-${index}` })),
  };
  render(
    <Step3SectionChromeContext.Provider value={full as Step3SectionChrome}>
      <WarningsBreakdown
        dfid={DFID}
        warnings={warnings}
        mode="rescan"
        useRawDecisions={[]}
        wizardSessionId={WSID}
        dq={{
          target: { kind: "staged", wizardSessionId: WSID, driveFileId: DFID },
          model,
        }}
        archivedPullSheetTabs={[TAB]}
        pullSheetOverride={null}
      />
    </Step3SectionChromeContext.Provider>,
  );
  return spies;
}

const jumpAt = (i: number) =>
  screen.queryByTestId(`wizard-step3-card-${DFID}-warning-${i}-section-jump`);
const allJumps = () => document.querySelectorAll('[data-testid$="-section-jump"]');
const titleOf = (w: ParseWarning) => stripEmphasis(reviewWarningTitle(w));

describe("section jumps on staged warning cards (spec §8.3)", () => {
  it("a crew field card says Go to Crew and jumps to that section", () => {
    premiseHolds("the crew field routes to crew", sectionForWarning(crewField) === "crew");
    const spies = renderRows([crewField]);
    const jump = jumpAt(0);
    if (!jump) throw new Error("no jump on the crew card");
    expect(jump.tagName).toBe("BUTTON");
    expect(jump.getAttribute("data-jump")).toBe("crew");
    expect(jump).toHaveAccessibleName(`Go to ${labelOf("crew")} for ${titleOf(crewField)}`);
    fireEvent.click(jump);
    expect(spies.onJumpToSection).toHaveBeenCalledExactlyOnceWith("crew");
    expect(spies.onJumpToHotel).not.toHaveBeenCalled();
  });

  it("the jump follows the help text, before the row's controls", () => {
    renderRows([crewField]);
    const row = screen.getByTestId(`wizard-step3-card-${DFID}-warning-0`);
    const jump = jumpAt(0)!;
    const controls = within(row).getByTestId("dq-controls");
    expect(jump.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the archived pull sheet card says Go to Pack list, between the include and Report", () => {
    premiseHolds(
      "the archived card routes to Pack list",
      sectionForWarning(archived) === "packlist",
    );
    const spies = renderRows([archived]);
    const jump = jumpAt(0);
    if (!jump) throw new Error("no jump on the archived card");
    expect(jump).toHaveAccessibleName(`Go to ${labelOf("packlist")} for ${titleOf(archived)}`);
    const include = screen.getByTestId(`wizard-step3-card-${DFID}-warning-0-archived-include`);
    const controls = screen.getByTestId("dq-controls");
    expect(include.compareDocumentPosition(jump) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(jump.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(allJumps()).toHaveLength(1);
    fireEvent.click(jump);
    expect(spies.onJumpToSection).toHaveBeenCalledExactlyOnceWith("packlist");
  });

  describe("reservation jump boundary (B-JUMP-INDEX), hotelCount 2", () => {
    it("pins the hotel code set at its spec size", () => {
      expect(HOTEL_RESERVATION_JUDGMENT_CODES.size).toBe(4);
      expect(HOTEL_RESERVATION_JUDGMENT_CODES.has("HOTEL_GUEST_SPLIT_AMBIGUOUS")).toBe(true);
    });
    it.each([
      ["0", 0],
      ["1 (hotelCount - 1)", 1],
    ])("index %s: Go to this reservation in Hotels", (_label, index) => {
      const w = guestSplit(index);
      const spies = renderRows([w]);
      const jump = jumpAt(0)!;
      expect(jump.getAttribute("data-jump")).toBe("reservation");
      expect(jump).toHaveAccessibleName(`Go to this reservation in Hotels for ${titleOf(w)}`);
      fireEvent.click(jump);
      expect(spies.onJumpToHotel).toHaveBeenCalledExactlyOnceWith(index);
      expect(spies.onJumpToSection).not.toHaveBeenCalled();
    });
    it.each([
      ["2 (hotelCount)", 2],
      ["-1", -1],
      ["NaN", Number.NaN],
      ["1.5", 1.5],
      ["absent", undefined],
    ])("index %s: Go to Hotels", (_label, index) => {
      const w = guestSplit(index);
      const spies = renderRows([w]);
      const jump = jumpAt(0)!;
      expect(jump.getAttribute("data-jump")).toBe("hotels");
      expect(jump).toHaveAccessibleName(`Go to ${labelOf("hotels")} for ${titleOf(w)}`);
      fireEvent.click(jump);
      expect(spies.onJumpToSection).toHaveBeenCalledExactlyOnceWith("hotels");
      expect(spies.onJumpToHotel).not.toHaveBeenCalled();
    });
  });

  describe("reservation jump boundary past the card cap (B-JUMP-INDEX)", () => {
    // 13 hotels render 12 cards, so the staged spread passes Math.min(13, HOTELS_CAP).
    const count = Math.min(13, HOTELS_CAP);
    it("pins the cap at its spec value", () => {
      expect(HOTELS_CAP).toBe(12);
    });
    it("index 11 jumps to the reservation", () => {
      renderRows([guestSplit(11)], { chrome: { hotelCount: count } });
      expect(jumpAt(0)!.getAttribute("data-jump")).toBe("reservation");
    });
    it("index 12 falls back to Hotels", () => {
      renderRows([guestSplit(12)], { chrome: { hotelCount: count } });
      expect(jumpAt(0)!.getAttribute("data-jump")).toBe("hotels");
    });
  });

  it("a hotel judgment code without a hotel jump callback falls back to Hotels", () => {
    const spies = renderRows([guestSplit(0)], { omit: ["onJumpToHotel"] });
    expect(jumpAt(0)!.getAttribute("data-jump")).toBe("hotels");
    fireEvent.click(jumpAt(0)!);
    expect(spies.onJumpToSection).toHaveBeenCalledExactlyOnceWith("hotels");
  });

  it("a hotel code outside the reservation set never gets the reservation jump", () => {
    const w: ParseWarning = { ...crewField, blockRef: { kind: "hotels", index: 0 } };
    premiseHolds(
      "the control code is outside the set",
      !HOTEL_RESERVATION_JUDGMENT_CODES.has(w.code),
    );
    renderRows([w]);
    expect(jumpAt(0)!.getAttribute("data-jump")).toBe("hotels");
  });

  it("Venue with no address gets no jump; another venue warning does (R4)", () => {
    const missing: ParseWarning = {
      severity: "warn",
      code: "VENUE_ADDRESS_MISSING",
      message: "Venue has no address",
      blockRef: { kind: "venue" },
    };
    const otherVenue: ParseWarning = { ...crewField, blockRef: { kind: "venue", name: "Dock" } };
    premiseHolds("both route to venue", sectionForWarning(missing) === "venue");
    renderRows([missing, otherVenue]);
    expect(jumpAt(0)).toBeNull();
    expect(jumpAt(1)?.getAttribute("data-jump")).toBe("venue");
  });

  it("an info row gets no jump", () => {
    const info: ParseWarning = { ...crewField, severity: "info" };
    renderRows([info, crewField]);
    expect(jumpAt(0)).toBeNull();
    expect(jumpAt(1)).not.toBeNull();
  });

  it("Ignored and Accepted rows get no jump", () => {
    const judgment: ParseWarning = {
      severity: "warn",
      code: "CREW_COLUMN_POSITIONAL_FALLBACK",
      message: "Crew columns were read by position.",
      blockRef: { kind: "crew" },
    };
    renderRows([crewField, judgment, crewField], { ignored: [0, 1] });
    // Both dismissed lists render, and neither carries a jump; the active control does.
    expect(screen.getByTestId(`wizard-step3-card-${DFID}-ignored-list`)).toBeTruthy();
    expect(screen.getByTestId(`wizard-step3-card-${DFID}-accepted-list`)).toBeTruthy();
    expect(allJumps()).toHaveLength(1);
    expect(jumpAt(2)).not.toBeNull();
  });

  it("a target absent from jumpSections gets no jump", () => {
    const schedule: ParseWarning = { ...crewField, blockRef: { kind: "schedule" } };
    premiseHolds("it routes to schedule", sectionForWarning(schedule) === "schedule");
    premiseHolds("schedule is not offered", !JUMP_SECTIONS.some((s) => s.id === "schedule"));
    renderRows([schedule, crewField]);
    expect(jumpAt(0)).toBeNull();
    expect(jumpAt(1)).not.toBeNull();
  });

  it("a warning that routes nowhere gets no jump", () => {
    const nowhere: ParseWarning = { ...crewField, blockRef: { kind: "not_a_section" } };
    premiseHolds("it routes nowhere", sectionForWarning(nowhere) === null);
    renderRows([nowhere, crewField]);
    expect(jumpAt(0)).toBeNull();
    expect(jumpAt(1)).not.toBeNull();
  });

  it("no onJumpToSection in the chrome: no jump at all", () => {
    renderRows([crewField, archived, guestSplit(0)], { omit: ["onJumpToSection"] });
    expect(allJumps()).toHaveLength(0);
  });

  it("no jumpSections in the chrome (the published pointer spread): no jump at all", () => {
    renderRows([crewField, archived, guestSplit(0)], { omit: ["jumpSections"] });
    expect(allJumps()).toHaveLength(0);
  });

  it("every card carries at most one jump, and every jump names its card", () => {
    const ws = [crewField, archived, guestSplit(0), guestSplit(5)];
    renderRows(ws);
    ws.forEach((w, i) => {
      const row = screen.getByTestId(`wizard-step3-card-${DFID}-warning-${i}`);
      const jumps = row.querySelectorAll('[data-testid$="-section-jump"]');
      expect(jumps, `row ${i}`).toHaveLength(1);
      expect(jumps[0]!.textContent?.endsWith(` for ${titleOf(w)}`), `row ${i}`).toBe(true);
    });
  });
});
