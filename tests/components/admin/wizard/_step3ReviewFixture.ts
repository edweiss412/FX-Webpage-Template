/**
 * tests/components/admin/wizard/_step3ReviewFixture.ts
 *
 * Shared fixture builders for Step3Review tests. Mirrored from
 * tests/components/step3SheetCard.test.tsx to support multiple test suites
 * with consistent ParseResult + Step3Row shapes.
 */
import type {
  ParseResult,
  ShowRow,
  CrewMemberRow,
  RoomRow,
  HotelReservationRow,
  RunOfShow,
} from "@/lib/parser/types";
import type { Step3Row } from "@/components/admin/wizard/Step3Review";

const DFID = "drive-abc-123";

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
    // Real A/V (video) gear so the room COUNTS toward Rooms & scope
    // (roomHasScope) — the count excludes no-A/V rooms; exclusion is tested
    // separately.
    audio: null,
    video: "(1) Projector",
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
      showEnd: null,
      window: null,
    };
  }
  return out;
}

export function show(overrides: Partial<ShowRow> = {}): ShowRow {
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

export function buildParseResult(overrides: Partial<ParseResult> = {}): ParseResult {
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
    archivedPullSheetTabs: [],
    runOfShow: runOfShow(3, 2),
    hardErrors: [],
    ...overrides,
  };
}

export function stagedRow(pr: ParseResult | null, overrides: Partial<Step3Row> = {}): Step3Row {
  return {
    driveFileId: DFID,
    driveFileName: "asset-mgmt-summit.sheet",
    status: "staged",
    parseResult: pr,
    ...overrides,
  };
}
