// @vitest-environment jsdom
/**
 * tests/components/step3SheetCard.test.tsx (Task D2 — spec §4.2/§4.3/§4.6)
 *
 * Pins the presentational contract of <Step3SheetCard>: the inline step-3
 * card for ONE cleanly-parsed `staged` Step3Row. Summary (always visible) +
 * breakdown (expand toggle) are rendered from `row.parseResult`.
 *
 * Anti-tautology discipline (AGENTS.md): every count / badge / cap assertion
 * DERIVES its expected value from the fixture's own array lengths
 * (`FIX.crewMembers.length`, etc.) — NEVER a hardcoded numeral. A fixture
 * with N crew cannot satisfy a hardcoded "12 crew" by accident; the assertion
 * is computed from N so it tracks any fixture change.
 *
 * Scope is D2 ONLY: no checkbox, no select-all, no approve/ignore wiring
 * (those are D3/D4). The card here is purely presentational (a `row` prop).
 */
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, fireEvent, within } from "@testing-library/react";
import type { ParseResult, ShowRow, CrewMemberRow, RoomRow, HotelReservationRow, RunOfShow } from "@/lib/parser/types";
import { Step3SheetCard } from "@/components/admin/wizard/Step3SheetCard";
import type { Step3Row } from "@/components/admin/wizard/Step3Review";

afterEach(() => cleanup());

const DFID = "drive-abc-123";

// ── Fixture builders (every expectation derives from THESE dimensions) ──
function crew(n: number): CrewMemberRow[] {
  return Array.from({ length: n }, (_, i) => ({
    name: `Crew Person ${i + 1}`,
    email: null,
    phone: null,
    role: `Role ${i + 1}`,
    role_flags: i % 2 === 0 ? (["LEAD"] as const).slice() : [],
    date_restriction: { kind: "none" } as const,
    stage_restriction: { kind: "none" } as const,
    flight_info: null,
  }));
}

function rooms(n: number): RoomRow[] {
  return Array.from({ length: n }, (_, i) => ({
    kind: "gs" as const,
    name: `Ballroom ${i + 1}`,
    dimensions: null,
    floor: null,
    setup: null,
    set_time: null,
    show_time: null,
    strike_time: null,
    audio: null,
    video: null,
    lighting: null,
    scenic: null,
    power: null,
    digital_signage: null,
    other: null,
    notes: null,
  }));
}

function hotels(n: number): HotelReservationRow[] {
  return Array.from({ length: n }, (_, i) => ({
    ordinal: i + 1,
    hotel_name: `Hotel ${i + 1}`,
    hotel_address: null,
    names: [`Guest ${i + 1}`],
    confirmation_no: null,
    check_in: "2026-04-10",
    check_out: "2026-04-12",
    notes: null,
  }));
}

function runOfShow(days: number, entriesPerDay: number): RunOfShow {
  const out: RunOfShow = {};
  for (let d = 0; d < days; d++) {
    const iso = `2026-04-${String(10 + d).padStart(2, "0")}`;
    out[iso] = {
      entries: Array.from({ length: entriesPerDay }, (_, e) => ({
        start: `${8 + e}:00 AM`,
        title: `Session ${d + 1}.${e + 1}`,
      })),
      showStart: "8:00 AM",
      window: null,
    };
  }
  return out;
}

function show(overrides: Partial<ShowRow> = {}): ShowRow {
  return {
    title: "Asset Mgmt Summit",
    client_label: "Acme Capital",
    client_contact: null,
    template_version: "v4",
    venue: null,
    dates: {
      travelIn: "2026-04-09",
      set: null,
      showDays: ["2026-04-10", "2026-04-11"],
      travelOut: "2026-04-12",
    },
    schedule_phases: {},
    event_details: {},
    agenda_links: [],
    coi_status: null,
    po: null,
    proposal: null,
    invoice: null,
    invoice_notes: null,
    ...overrides,
  };
}

function parseResult(overrides: Partial<ParseResult> = {}): ParseResult {
  return {
    show: show(),
    crewMembers: crew(12),
    hotelReservations: hotels(2),
    rooms: rooms(4),
    transportation: null,
    contacts: [],
    pullSheet: null,
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [],
    runOfShow: runOfShow(3, 2),
    hardErrors: [],
    ...overrides,
  };
}

function stagedRow(pr: ParseResult | null, overrides: Partial<Step3Row> = {}): Step3Row {
  return {
    driveFileId: DFID,
    driveFileName: "asset-mgmt-summit.sheet",
    status: "staged",
    parseResult: pr,
    ...overrides,
  };
}

const card = (q: ReturnType<typeof render>) => q.getByTestId(`wizard-step3-card-${DFID}`);
const summary = (q: ReturnType<typeof render>) => q.getByTestId(`wizard-step3-card-${DFID}-summary`);

describe("Step3SheetCard — summary (§4.2)", () => {
  test("renders the show title, and client when present", () => {
    const FIX = parseResult();
    const q = render(<Step3SheetCard row={stagedRow(FIX)} />);
    const s = summary(q);
    expect(s.textContent).toContain(FIX.show.title);
    expect(s.textContent).toContain(FIX.show.client_label);
  });

  test("title falls back to driveFileName when parseResult title is empty", () => {
    const FIX = parseResult({ show: show({ title: "" }) });
    const row = stagedRow(FIX, { driveFileName: "fallback-name.sheet" });
    const q = render(<Step3SheetCard row={row} />);
    expect(summary(q).textContent).toContain("fallback-name.sheet");
  });

  test("counts derive from fixture array lengths (anti-tautology)", () => {
    const FIX = parseResult();
    const q = render(<Step3SheetCard row={stagedRow(FIX)} />);
    const s = summary(q).textContent ?? "";
    const days = Object.keys(FIX.runOfShow ?? {}).length;
    expect(s).toContain(`${FIX.crewMembers.length} crew`);
    expect(s).toContain(`${FIX.rooms.length} rooms`);
    expect(s).toContain(`${FIX.hotelReservations.length} hotels`);
    expect(s).toContain(`${days} schedule days`);
    // sanity: the fixture actually has non-trivial dimensions
    expect(FIX.crewMembers.length).toBeGreaterThan(0);
    expect(days).toBe(3);
  });

  test("schedule-day count uses Object.keys(runOfShow), NOT showDays.length", () => {
    // runOfShow has 5 days; showDays has only 2 — the rendered count must be 5.
    const FIX = parseResult({
      runOfShow: runOfShow(5, 1),
      show: show({ dates: { travelIn: null, set: null, showDays: ["2026-04-10", "2026-04-11"], travelOut: null } }),
    });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} />);
    const days = Object.keys(FIX.runOfShow ?? {}).length;
    expect(days).toBe(5);
    expect(FIX.show.dates.showDays.length).toBe(2);
    expect(summary(q).textContent).toContain(`${days} schedule days`);
  });

  test("dates render only present segments", () => {
    const FIX = parseResult({
      show: show({ dates: { travelIn: "2026-04-09", set: null, showDays: ["2026-04-10"], travelOut: null } }),
    });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} />);
    const s = summary(q).textContent ?? "";
    expect(s).toContain("2026-04-09");
    expect(s).toContain("2026-04-10");
    expect(s).not.toContain("Dates not found");
  });

  test("'Dates not found' when no date segments are present", () => {
    const FIX = parseResult({
      show: show({ dates: { travelIn: null, set: null, showDays: [], travelOut: null } }),
    });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} />);
    expect(summary(q).textContent).toContain("Dates not found");
  });

  test("diagrams badge shown iff linkedFolder OR embeddedImages present", () => {
    const withDiagrams = parseResult({
      diagrams: { linkedFolder: { driveFolderId: "f", driveFolderUrl: "https://x" }, embeddedImages: [], linkedFolderItems: [] },
    });
    const q1 = render(<Step3SheetCard row={stagedRow(withDiagrams)} />);
    expect(q1.queryByTestId(`wizard-step3-card-${DFID}-badge-diagrams`)).not.toBeNull();
    cleanup();
    const noDiagrams = parseResult();
    const q2 = render(<Step3SheetCard row={stagedRow(noDiagrams)} />);
    expect(q2.queryByTestId(`wizard-step3-card-${DFID}-badge-diagrams`)).toBeNull();
  });

  test("reel badge shown iff openingReel present", () => {
    const withReel = parseResult({
      openingReel: { driveFileId: "reel-1", drive_modified_time: "2026-04-01T00:00:00Z", headRevisionId: "r1", mimeType: "video/mp4" },
    });
    const q1 = render(<Step3SheetCard row={stagedRow(withReel)} />);
    expect(q1.queryByTestId(`wizard-step3-card-${DFID}-badge-reel`)).not.toBeNull();
    cleanup();
    const q2 = render(<Step3SheetCard row={stagedRow(parseResult())} />);
    expect(q2.queryByTestId(`wizard-step3-card-${DFID}-badge-reel`)).toBeNull();
  });

  test("warnings chip shows the count iff warnings.length > 0", () => {
    const w = [
      { severity: "warn" as const, code: "W1", message: "one" },
      { severity: "info" as const, code: "W2", message: "two" },
    ];
    const FIX = parseResult({ warnings: w });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} />);
    const chip = q.getByTestId(`wizard-step3-card-${DFID}-warnings`);
    expect(chip.textContent).toContain(String(FIX.warnings.length));
  });

  test("no warnings chip when warnings is empty", () => {
    const q = render(<Step3SheetCard row={stagedRow(parseResult({ warnings: [] }))} />);
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-warnings`)).toBeNull();
  });
});

describe("Step3SheetCard — guard conditions (§4.6)", () => {
  test("parseResult null → couldn't-read note, no expand toggle", () => {
    const q = render(<Step3SheetCard row={stagedRow(null, { driveFileName: "broken.sheet" })} />);
    expect(card(q).textContent).toContain("broken.sheet");
    // Apostrophe-agnostic (the component uses a typographic ’): assert the
    // human "couldn't read" sentence is present.
    expect(card(q).textContent).toContain("read the details of this sheet");
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-expand`)).toBeNull();
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-breakdown`)).toBeNull();
  });

  test("parseResult null still falls back to driveFileId when name missing", () => {
    const q = render(<Step3SheetCard row={stagedRow(null, { driveFileName: null })} />);
    expect(card(q).textContent).toContain(DFID);
  });

  test("undefined count arrays coerce to 0 ('0 crew')", () => {
    // Simulate untyped jsonb that lost its arrays (parse_result is cast from
    // untyped jsonb on the wire, OnboardingWizard.tsx:199). Build via a loose
    // record so the deletions mimic missing keys without per-line ts-ignores.
    const broken = parseResult() as unknown as Record<string, unknown>;
    delete broken.crewMembers;
    delete broken.rooms;
    delete broken.hotelReservations;
    delete broken.runOfShow;
    const q = render(<Step3SheetCard row={stagedRow(broken as unknown as ParseResult)} />);
    const s = summary(q).textContent ?? "";
    expect(s).toContain("0 crew");
    expect(s).toContain("0 rooms");
    expect(s).toContain("0 hotels");
    expect(s).toContain("0 schedule days");
  });

  test("undefined warnings → no chip", () => {
    const broken = parseResult() as unknown as Record<string, unknown>;
    delete broken.warnings;
    const q = render(<Step3SheetCard row={stagedRow(broken as unknown as ParseResult)} />);
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-warnings`)).toBeNull();
  });

  test("zero-count clean sheet still renders the counts (a 0 is a signal)", () => {
    const FIX = parseResult({ crewMembers: [], rooms: [], hotelReservations: [], runOfShow: {} });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} />);
    const s = summary(q).textContent ?? "";
    expect(s).toContain("0 crew");
    expect(s).toContain("0 schedule days");
    // a clean (non-null parseResult) sheet still has an expand toggle
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-expand`)).not.toBeNull();
  });
});

describe("Step3SheetCard — breakdown (§4.3)", () => {
  function expand(q: ReturnType<typeof render>) {
    fireEvent.click(q.getByTestId(`wizard-step3-card-${DFID}-expand`));
    return q.getByTestId(`wizard-step3-card-${DFID}-breakdown`);
  }
  // Non-null indexer for the fixtures we build with known length (the project
  // runs noUncheckedIndexedAccess).
  function at<T>(xs: T[], i: number): T {
    return xs[i] as T;
  }

  test("crew breakdown lists names + roles, capped at 30 with '…and K more'", () => {
    const FIX = parseResult({ crewMembers: crew(34) });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} />);
    const b = expand(q);
    const region = within(b).getByTestId(`wizard-step3-card-${DFID}-breakdown-crew`);
    // first member is shown with name + role
    expect(region.textContent).toContain(at(FIX.crewMembers, 0).name);
    expect(region.textContent).toContain(at(FIX.crewMembers, 0).role);
    // 30th shown, 31st NOT shown
    expect(region.textContent).toContain(at(FIX.crewMembers, 29).name);
    expect(region.textContent).not.toContain(at(FIX.crewMembers, 30).name);
    const overflow = FIX.crewMembers.length - 30;
    expect(region.textContent).toContain(`${overflow} more`);
  });

  test("rooms breakdown caps at 20 with overflow note", () => {
    const FIX = parseResult({ rooms: rooms(23) });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} />);
    const region = within(expand(q)).getByTestId(`wizard-step3-card-${DFID}-breakdown-rooms`);
    expect(region.textContent).toContain(at(FIX.rooms, 19).name);
    expect(region.textContent).not.toContain(at(FIX.rooms, 20).name);
    expect(region.textContent).toContain(`${FIX.rooms.length - 20} more`);
  });

  test("hotels breakdown caps at 12 with overflow note", () => {
    const FIX = parseResult({ hotelReservations: hotels(15) });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} />);
    const region = within(expand(q)).getByTestId(`wizard-step3-card-${DFID}-breakdown-hotels`);
    expect(region.textContent).toContain(at(FIX.hotelReservations, 11).hotel_name);
    expect(region.textContent).not.toContain(at(FIX.hotelReservations, 12).hotel_name);
    expect(region.textContent).toContain(`${FIX.hotelReservations.length - 12} more`);
  });

  test("schedule outline caps days at 14 and entries per day at 6", () => {
    const FIX = parseResult({ runOfShow: runOfShow(16, 8) });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} />);
    const region = within(expand(q)).getByTestId(`wizard-step3-card-${DFID}-breakdown-schedule`);
    const ros = FIX.runOfShow ?? {};
    const days = Object.keys(ros);
    const titleAt = (dayIdx: number, entryIdx: number): string => {
      const day = ros[days[dayIdx] as string];
      return (day?.entries[entryIdx] as { title: string }).title;
    };
    // day 14 (index 13) shown, day 15 (index 14) not
    expect(region.textContent).toContain(titleAt(13, 0));
    expect(region.textContent).not.toContain(titleAt(14, 0));
    expect(region.textContent).toContain(`${days.length - 14} more days`);
    // within a shown day, first 6 entries shown, 7th not
    expect(region.textContent).toContain(titleAt(0, 5));
    expect(region.textContent).not.toContain(titleAt(0, 6));
  });

  test("breakdown handles empty arrays without crashing", () => {
    const FIX = parseResult({ crewMembers: [], rooms: [], hotelReservations: [], runOfShow: {} });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} />);
    expect(() => expand(q)).not.toThrow();
  });
});
