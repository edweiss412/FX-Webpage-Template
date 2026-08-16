/**
 * tests/fixtures/stagedParseResult.ts — the hand-built `ParseResult` behind the
 * staged crew preview suites (adapter unit tests AND the real-shell integration
 * arms), so both read one fixture rather than two that can drift.
 *
 * Non-vacuousness premise (plan 2026-08-15-step3-crew-preview, Task 1 coverage
 * closure): EVERY optional nested family is populated, because the adapter
 * suite's generative sweep only visits paths the fixture actually carries.
 * The sentinel-path assertion there pins that premise.
 */
import type { ParseResult } from "@/lib/parser/types";

export const STAGED_FIXTURE_FINANCIALS = {
  po: "PO-77421",
  proposal: "PROP-9930",
  invoice: "INV-55012",
  invoice_notes: "Net 30 via ACH",
} as const;

/**
 * A hand-built `ParseResult`, rebuilt per call so mutation cases never leak.
 *
 * Non-vacuousness premise (plan Task 1, coverage closure): EVERY optional nested
 * family is populated, because the generative sweep below only visits paths the
 * fixture actually carries. The sentinel-path assertion pins that premise.
 */
export function makeStagedParseFixture(): ParseResult {
  return {
    show: {
      title: "Summit 2026",
      client_label: "Northwind",
      client_contact: {
        name: "Ann Client",
        email: "ann@northwind.example",
        phone: "555-0100",
        officePhone: "555-0101",
        secondary: {
          name: "Bo Second",
          email: "bo@northwind.example",
          phone: "555-0102",
          officePhone: "555-0103",
        },
      },
      template_version: "v4",
      venue: {
        name: "Grand Hall",
        address: "1 Main St, Springfield",
        loadingDock: "Dock C",
        googleLink: "https://maps.example/grand-hall",
        notes: "Freight elevator is slow",
        city: "Springfield",
        timezone: "America/New_York",
      },
      dates: {
        travelIn: "2026-06-22",
        set: "2026-06-23",
        showDays: ["2026-06-24", "2026-06-25"],
        travelOut: "2026-06-26",
        loadIn: "8:00 AM",
        setupTime: "10:00 PM",
      },
      schedule_phases: {
        "2026-06-23": ["Set", "Load In"],
        "2026-06-24": ["Show"],
        "2026-06-25": ["Show", "Strike"],
      },
      event_details: { attendance: "400", dress: "Business casual" },
      agenda_links: [
        {
          label: "Run of Show",
          fileId: "drive-agenda-1",
          extracted: {
            confidence: "high",
            corrections: 0,
            days: [{ dayLabel: "Day 1", date: "2026-06-24", sessions: [] }],
            extractorVersion: 3,
          },
        },
        { label: "Client Deck", url: "https://example.com/deck" },
      ],
      coi_status: "Received",
      ...STAGED_FIXTURE_FINANCIALS,
    },
    crewMembers: [
      {
        // 0 — LEAD with an explicit M/D date restriction.
        name: "Dana Lead",
        email: "dana@fxav.example",
        phone: "555-0200",
        role: "Technical Director",
        role_flags: ["LEAD"],
        date_restriction: { kind: "explicit", days: ["6/24"] },
        stage_restriction: { kind: "none" },
        flight_info: "DL 123 arrives 4:10 PM",
      },
      {
        // 1 — stage-restricted (`ONLY***` shape), no explicit days.
        name: "Ravi Stage",
        email: "ravi@fxav.example",
        phone: "555-0201",
        role: "A1 Show Only",
        role_flags: ["A1", "ONLY"],
        date_restriction: { kind: "none" },
        stage_restriction: { kind: "explicit", stages: ["Show"] },
        flight_info: null,
      },
      {
        // 2 — unrestricted, neither entitlement flag.
        name: "Mika Plain",
        email: "mika@fxav.example",
        phone: "555-0202",
        role: "V1",
        role_flags: ["V1"],
        date_restriction: { kind: "none" },
        stage_restriction: { kind: "none" },
        flight_info: null,
      },
      {
        // 3 — FINANCIALS is the ONLY capability flag.
        name: "Fin Watcher",
        email: "fin@fxav.example",
        phone: "555-0203",
        role: "Producer",
        role_flags: ["FINANCIALS"],
        date_restriction: { kind: "none" },
        stage_restriction: { kind: "none" },
        flight_info: null,
      },
    ],
    hotelReservations: [
      {
        ordinal: 1,
        hotel_name: "Harborview Suites",
        hotel_address: "9 Pier Rd",
        names: ["Dana Lead"],
        confirmation_no: "HV-1001",
        check_in: "2026-06-22",
        check_out: "2026-06-26",
        notes: "Late checkout requested",
      },
      {
        ordinal: 2,
        hotel_name: "Riverside Inn",
        hotel_address: "44 River St",
        names: ["Ravi Stage"],
        confirmation_no: "RI-2002",
        check_in: "2026-06-23",
        check_out: "2026-06-26",
        notes: null,
      },
    ],
    rooms: [
      {
        kind: "gs",
        name: "MABEL 1",
        dimensions: "40x60",
        floor: "2",
        setup: "Theater",
        set_time: "6/23 @ 9:00 AM",
        show_time: "6/24 @ 8:00 AM",
        strike_time: "6/25 @ 6:00 PM",
        audio: "L/R PA",
        video: "2x LED",
        lighting: "Wash",
        scenic: "Stage skirt",
        power: "2x 20A",
        digital_signage: "None",
        other: null,
        notes: "Main room",
      },
      {
        // Duplicate NAME on purpose: surrogate ids must stay collision-free.
        kind: "breakout",
        name: "MABEL 1",
        dimensions: "20x30",
        floor: "3",
        setup: "Classroom",
        set_time: "6/23 @ 1:00 PM",
        show_time: "6/24 @ 10:00 AM",
        strike_time: "6/25 @ 4:00 PM",
        audio: "Single speaker",
        video: "1x LED",
        lighting: null,
        scenic: null,
        power: "1x 20A",
        digital_signage: null,
        other: null,
        notes: null,
      },
    ],
    transportation: {
      driver_name: "Mika Plain",
      driver_phone: "555-0300",
      driver_email: "mika@fxav.example",
      loadout_name: "Ravi Stage",
      loadout_phone: "555-0301",
      loadout_email: "ravi@fxav.example",
      vehicle: "Sprinter",
      license_plate: "FXAV-1",
      color: "White",
      parking: "Dock C",
      schedule: [
        {
          stage: "Load In",
          date: "2026-06-23",
          time: "8:00 AM",
          assigned_names: ["Dana Lead"],
        },
      ],
      notes: "Van returns 6/26",
    },
    contacts: [
      {
        kind: "venue",
        name: "Vera Venue",
        email: "vera@grandhall.example",
        phone: "555-0400",
        notes: "Text first",
      },
      {
        kind: "in_house_av",
        name: "Ivan House",
        email: "ivan@grandhall.example",
        phone: "555-0401",
        notes: null,
      },
    ],
    pullSheet: [
      {
        caseLabel: "Case A",
        items: [
          { qty: 2, cat: "Audio", subCat: "Mics", item: "SM58" },
          { qty: 1, cat: "Video", subCat: "Switcher", item: "TriCaster" },
        ],
      },
    ],
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [],
    archivedPullSheetTabs: [],
    runOfShow: {
      "2026-06-24": {
        entries: [
          { start: "8:00 AM", finish: "9:00 AM", trt: "1h", title: "Doors", room: "MABEL 1" },
        ],
        showStart: "8:00 AM",
        showEnd: "6:00 PM",
        window: { start: "8:00 AM", end: "6:00 PM" },
      },
      "2026-06-25": {
        entries: [{ start: "9:00 AM", title: "General Session" }],
        showStart: "9:00 AM",
        showEnd: null,
        window: null,
      },
      // A key OUTSIDE the aggregate-day domain: proves the source ∩ aggregate leg.
      "2026-06-30": {
        entries: [{ start: "10:00 AM", title: "Ghost day" }],
        showStart: null,
        showEnd: null,
        window: null,
      },
    },
    hardErrors: [],
  };
}
