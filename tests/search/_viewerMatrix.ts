/**
 * The INV-1 viewer matrix (spec §11.1): one named case per gate the parity and
 * leak suites must see flipped, each a ready `SectionBuildInput` plus a name.
 *
 * This module asserts nothing. Each section task states, per case it uses, the
 * premise its own render must show (tests/_shared/premise.ts), because only a
 * render can prove a gate actually flipped. Cap-crossing counts are derived
 * from the exported caps, never typed, and `budgetVisible` is computed the way
 * `CrewShell` computes it, so a case cannot claim an entitlement the shell
 * would not grant.
 */
import { CONTACTS_INLINE_CAP, CREW_INLINE_CAP } from "@/components/crew/sections/CrewSection";
import { CASE_CAP, ROOM_DETAIL_CAP } from "@/components/crew/sections/GearSection";
import { SOURCE_CAP, TRUNCATE_AT } from "@/components/crew/sections/todayRows";
import { SHOWS_CAP } from "@/components/crew/primitives/KeyTimesStrip";
import { INITIAL_VISIBLE } from "@/components/diagrams/galleryLimits";
import type { AgendaDay, AgendaExtraction } from "@/lib/agenda/types";
import { TITLE_TRUNCATE_AT } from "@/lib/crew/agendaDisplay";
import { CREW_TECH_SPEC_KEYS } from "@/lib/crew/eventDetailsSpecs";
import type { RoomDetailKey } from "@/lib/crew/roomDetailFields";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { GearDiscipline } from "@/lib/parser/gearClassification";
import type {
  ContactRow,
  PersistedDiagrams,
  PersistedEmbeddedImage,
  PullSheetCase,
  ScheduleDay,
  TransportationRow,
} from "@/lib/parser/types";
import type { SectionBuildInput } from "@/lib/search/sections";
import { financialsVisible } from "@/lib/visibility/scopeTiles";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";

export type ViewerCase = SectionBuildInput & { name: string };

/** The pinned request clock. 16:00Z is noon in the default venue timezone (America/New_York). */
export const MATRIX_TODAY = new Date("2026-05-14T16:00:00Z");
export const MATRIX_TODAY_ISO = "2026-05-14";

const SHOW_ID = "11111111-1111-4111-8111-111111111111";
const REV = "22222222-2222-4222-8222-222222222222";

/** The viewer row `makeShowForViewer` ships by default. */
const VIEWER_ID = "c1";
const VIEWER_NAME = "Test Crew";
const CREW_VIEWER: Viewer = { kind: "crew", crewMemberId: VIEWER_ID };

const pad = (n: number) => String(n).padStart(2, "0");

function isoDay(offset: number): string {
  const d = new Date(`${MATRIX_TODAY_ISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

function transport(driverName: string): TransportationRow {
  return {
    driver_name: driverName,
    driver_phone: "555-0101",
    driver_email: null,
    loadout_name: null,
    loadout_phone: null,
    loadout_email: null,
    vehicle: "Sprinter van",
    license_plate: null,
    color: null,
    parking: "Garage B, level 2",
    schedule: [{ stage: "Load In", date: MATRIX_TODAY_ISO, time: "7:00 AM", assigned_names: [] }],
    notes: "Meet at the loading dock",
  };
}

function crewRow(id: string, name: string): ShowForViewer["crewMembers"][number] {
  return {
    id,
    name,
    email: null,
    phone: null,
    role: "A2",
    roleFlags: [],
    dateRestriction: { kind: "none" },
    stageRestriction: { kind: "none" },
  };
}

function viewerRow(over: Partial<ShowForViewer["crewMembers"][number]> = {}) {
  return { ...crewRow(VIEWER_ID, VIEWER_NAME), ...over };
}

function embedded(i: number, alt: string | undefined): PersistedEmbeddedImage {
  return {
    sheetTab: "DIAGRAMS",
    objectId: `obj-${i}`,
    mimeType: "image/png",
    ...(alt === undefined ? {} : { alt }),
    sheetsRevisionId: "sheet-rev-1",
    embeddedFingerprint: `fp-${i}`,
    recovery_disposition: "normal",
    snapshotPath: `diagram-snapshots/shows/${SHOW_ID}/${REV}/embedded-obj-${i}.png`,
  };
}

function diagrams(images: PersistedEmbeddedImage[]): PersistedDiagrams {
  return {
    snapshot_revision_id: REV,
    snapshot_status: "complete",
    linkedFolder: null,
    embeddedImages: images,
    linkedFolderItems: [],
  };
}

const HOTEL = {
  ordinal: 1,
  hotel_name: "Hyatt Regency",
  hotel_address: "1 Main St",
  names: [VIEWER_NAME],
  confirmation_no: "HQ79F",
  check_in: isoDay(-1),
  check_out: isoDay(2),
  notes: "Late checkout approved",
};

type Overrides = NonNullable<Parameters<typeof makeShowForViewer>[0]>;

/** The event details every case shares. A case that sets `event_details` spreads these first. */
const BASE_EVENT_DETAILS = {
  internet: "SSID: FXAV Password: ORDTG.",
  power: "Two 20A circuits",
} as const;

/**
 * Venue and show fields every case shares, so every section has lines to
 * render. `over` replaces top-level fields wholesale, except `show`, whose
 * fields merge over the shared ones (so a case's `event_details` replaces
 * `BASE_EVENT_DETAILS` whole).
 */
function base(over: Overrides = {}): ShowForViewer {
  const { show, ...rest } = over;
  return makeShowForViewer({
    crewMembers: [viewerRow()],
    hotelReservations: [HOTEL],
    rooms: [
      { id: "room-gs", kind: "gs", name: "Grand Ballroom", video: "LED wall", audio: "Two lavs" },
    ],
    viewerId: VIEWER_ID,
    ...rest,
    show: {
      venue: { name: "Grand Hall", address: "123 Main St" },
      dates: {
        travelIn: isoDay(-1),
        set: isoDay(-1),
        showDays: [MATRIX_TODAY_ISO],
        travelOut: isoDay(1),
      },
      event_details: BASE_EVENT_DETAILS,
      ...show,
    },
  });
}

function budgetVisibleFor(viewer: Viewer, data: ShowForViewer): boolean {
  const ctx = resolveViewerContext(viewer, data);
  return financialsVisible(ctx.viewerFlags, ctx.isAdmin);
}

function makeCase(name: string, viewer: Viewer, data: ShowForViewer): ViewerCase {
  return {
    name,
    data,
    viewer,
    today: MATRIX_TODAY,
    budgetVisible: budgetVisibleFor(viewer, data),
    staticPreview: false,
  };
}

/**
 * Today's run of show holds only a load-out entry, the one entry the transport
 * gate decides (`scheduleEntriesForViewer`): the transport cases below render
 * it (Schedule's day card, Today's Mode A list) or drop it, so the gate flips
 * both ways for Schedule and Today too.
 */
const LOADOUT_ONLY_RUN_OF_SHOW: Record<string, ScheduleDay> = {
  [MATRIX_TODAY_ISO]: {
    entries: [{ start: "5:00 PM", title: "Load Out: dock 3 to the truck", kind: "loadout" }],
    showStart: null,
    showEnd: null,
    window: null,
  },
};

/** Transport exists but names someone else, so the viewer's transport tile is hidden. */
export const crewNoTransport = makeCase(
  "crewNoTransport",
  CREW_VIEWER,
  base({ transportation: transport("Pat Driver"), runOfShow: LOADOUT_ONLY_RUN_OF_SHOW }),
);

/** The viewer is the driver (by name and by resolved owner id), so the transport tile shows. */
export const crewWithTransport = makeCase(
  "crewWithTransport",
  CREW_VIEWER,
  base({
    transportation: transport(VIEWER_NAME),
    transportationOwnerIds: [VIEWER_ID],
    runOfShow: LOADOUT_ONLY_RUN_OF_SHOW,
  }),
);

/** A LEAD crew viewer with financials loaded: the Budget section renders. */
export const leadWithFinancials = makeCase(
  "leadWithFinancials",
  CREW_VIEWER,
  base({
    crewMembers: [viewerRow({ roleFlags: ["LEAD"] })],
    financials: {
      po: "PO-4471",
      proposal: "Q-2026-118",
      invoice: "INV-9902",
      invoice_notes: "Net 30",
    },
  }),
);

/** Days marked with an asterisk: dates are suppressed (Schedule unconfirmed, Travel hideDates). */
export const dateSuppressed = makeCase(
  "dateSuppressed",
  CREW_VIEWER,
  base({
    crewMembers: [viewerRow({ dateRestriction: { kind: "unknown_asterisk", days: null } })],
    viewerFlightInfo: "EWR-FLL UNITED 5/13 - 11:29am - 2:34pm HQQ79F",
    transportation: transport(VIEWER_NAME),
  }),
);

const OVER = 2;
const crewCount = CREW_INLINE_CAP + OVER;
const contactCount = Math.max(CONTACTS_INLINE_CAP, SOURCE_CAP) + OVER;
const showDayCount = SHOWS_CAP + OVER;
const caseCount = CASE_CAP + OVER;
const roomCount = ROOM_DETAIL_CAP + OVER;
const diagramCount = INITIAL_VISIBLE + OVER;

const overCapShowDays = Array.from({ length: showDayCount }, (_, i) => isoDay(i - 2));

/**
 * Every list past its cap: roster and contacts past the Crew inline caps, more
 * show days than `SHOWS_CAP` (each with a show start, so each is a key time),
 * more pack cases than `CASE_CAP` on a Set day (so the pack list renders),
 * more detailed rooms than `ROOM_DETAIL_CAP`, more notes than `SOURCE_CAP`
 * (every contact carries one), and more diagrams than `INITIAL_VISIBLE`.
 */
export const overCaps = makeCase(
  "overCaps",
  CREW_VIEWER,
  base({
    show: {
      dates: {
        travelIn: isoDay(-3),
        set: isoDay(-3),
        showDays: overCapShowDays,
        travelOut: isoDay(showDayCount),
      },
      schedule_phases: { [MATRIX_TODAY_ISO]: ["Set"] },
    },
    crewMembers: [
      viewerRow(),
      ...Array.from({ length: crewCount }, (_, i) =>
        crewRow(`crew-${pad(i + 1)}`, `Crew Member ${pad(i + 1)}`),
      ),
    ],
    contacts: Array.from(
      { length: contactCount },
      (_, i): ContactRow => ({
        kind: "venue",
        name: `Venue Contact ${pad(i + 1)}`,
        email: null,
        phone: `555-01${pad(i + 1)}`,
        notes: `Contact note ${pad(i + 1)}`,
      }),
    ),
    runOfShow: Object.fromEntries(
      overCapShowDays.map((d): [string, ScheduleDay] => [
        d,
        { entries: [], showStart: "8:00 AM", showEnd: null, window: null },
      ]),
    ),
    pullSheet: Array.from(
      { length: caseCount },
      (_, i): PullSheetCase => ({
        caseLabel: `Road Case ${pad(i + 1)}`,
        items: [{ qty: 1, cat: null, subCat: null, item: `Cable Loom ${pad(i + 1)}` }],
      }),
    ),
    rooms: Array.from({ length: roomCount }, (_, i) => ({
      id: `room-${pad(i + 1)}`,
      kind: "breakout" as const,
      name: `Breakout ${pad(i + 1)}`,
      dimensions: `${40 + i} x 60`,
    })),
    diagrams: diagrams(
      Array.from({ length: diagramCount }, (_, i) => embedded(i + 1, `Plot ${pad(i + 1)}`)),
    ),
  }),
);

/**
 * Lines only Today renders: a room note (Today is its only render site), and a
 * contact past the Crew contacts cap whose note Today still aggregates.
 */
export const todayOnlyLines = makeCase(
  "todayOnlyLines",
  CREW_VIEWER,
  base({
    rooms: [
      {
        id: "room-gs",
        kind: "gs",
        name: "Grand Ballroom",
        video: "LED wall",
        notes: "Rigging points on the east wall only",
      },
    ],
    contacts: [
      ...Array.from(
        { length: CONTACTS_INLINE_CAP },
        (_, i): ContactRow => ({
          kind: "venue",
          name: `Venue Contact ${pad(i + 1)}`,
          email: null,
          phone: `555-02${pad(i + 1)}`,
          notes: null,
        }),
      ),
      {
        kind: "in_house_av",
        name: "Past Cap Contact",
        email: null,
        phone: null,
        notes: "Ask for the house projector remote",
      },
    ],
  }),
);

/** One diagram with a real name and one without, which the gallery names "Diagram N". */
export const diagramsNamedAndUnnamed = makeCase(
  "diagramsNamedAndUnnamed",
  CREW_VIEWER,
  base({ diagrams: diagrams([embedded(1, "FOH plot"), embedded(2, undefined)]) }),
);

/** An admin viewer: all flags, no restrictions, transport and budget visible. */
export const adminViewer = makeCase(
  "adminViewer",
  { kind: "admin" },
  base({
    viewerId: null,
    transportation: transport("Pat Driver"),
    financials: {
      po: "PO-4471",
      proposal: "Q-2026-118",
      invoice: "INV-9902",
      invoice_notes: "Net 30",
    },
  }),
);

// ── Content cases ────────────────────────────────────────────────────────────
// The default fixture renders almost none of the page (no dates, empty
// `event_details`, no agenda, no run of show), so a line kind no case renders
// would pass parity vacuously. Each case below exists to make a set of line
// kinds render; tests/search/viewerMatrix.test.tsx proves each one does.

/**
 * Joins `parts` with spaces, cycling, until the text is strictly longer than
 * `limit`. Truncation fixtures derive their length from the exported constant
 * this way, so a changed constant cannot silently stop them truncating.
 */
function textLongerThan(limit: number, parts: readonly string[]): string {
  const taken: string[] = [];
  while (taken.join(" ").length <= limit) taken.push(parts[taken.length % parts.length]!);
  return taken.join(" ");
}

/** "Thursday, May 14, 2026": the agenda day-label form `parseIsoFromDayLabel` reads. */
function agendaDayLabel(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function agendaLink(label: string, fileId: string, days: AgendaDay[]) {
  const extracted: AgendaExtraction = {
    confidence: "high",
    corrections: 0,
    extractorVersion: 2,
    days,
  };
  return { label, fileId, extracted };
}

/** Wi-Fi split form: a labeled network and password, no prose. */
export const wifiSplit = makeCase(
  "wifiSplit",
  CREW_VIEWER,
  base({
    show: {
      event_details: { ...BASE_EVENT_DETAILS, internet: "SSID: Hyatt_Meeting\nPassword: ORDTG." },
    },
  }),
);

/**
 * Wi-Fi raw form: a password label with no network label before it, outside
 * the accept-set, so the whole cell renders verbatim as "Crew Wi-Fi".
 */
export const wifiRaw = makeCase(
  "wifiRaw",
  CREW_VIEWER,
  base({
    show: {
      event_details: {
        ...BASE_EVENT_DETAILS,
        internet: "Wifi Ritz-Carlton_CONFERENCE Password: ritzvip",
      },
    },
  }),
);

/** Wi-Fi split form with leading prose, which renders as the "Internet notes" row. */
export const wifiNotes = makeCase(
  "wifiNotes",
  CREW_VIEWER,
  base({
    show: {
      event_details: {
        ...BASE_EVENT_DETAILS,
        internet: "Hardline from Encore\n\nSSID: Hyatt_Meeting\nCode: FITS2025",
      },
    },
  }),
);

/**
 * Today Mode A: today is the show day, the viewer is date-eligible, and today
 * has run-of-show entries AND agenda sessions, so Today renders the bare key
 * times strip (no card) and the merged run-of-show timeline. The GS room's set
 * and strike times give the strip its Set and Strike anchors. The dress code
 * is one paragraph (the unparsed form); `fullContent` carries the phase form.
 */
export const modeAToday = makeCase(
  "modeAToday",
  CREW_VIEWER,
  base({
    rooms: [
      {
        id: "room-gs",
        kind: "gs",
        name: "Grand Ballroom",
        video: "LED wall",
        audio: "Two lavs",
        set_time: "6:00 AM",
        strike_time: "6:00 PM",
      },
    ],
    runOfShow: {
      [MATRIX_TODAY_ISO]: {
        entries: [
          { start: "6:30 AM", title: "Crew Call", room: "Grand Ballroom" },
          { start: "7:00 AM", finish: "7:45 AM", trt: "0:45", title: "Sound Check", av: "A1" },
        ],
        showStart: "6:30 AM",
        showEnd: null,
        window: null,
      },
    } satisfies Record<string, ScheduleDay>,
    show: {
      // A geocoded city, so Today's Where card renders its City row.
      venue: { name: "Grand Hall", address: "123 Main St", city: "Chicago" },
      event_details: {
        ...BASE_EVENT_DETAILS,
        dress_code: "All black, no logos. Closed-toe shoes on the floor.",
      },
      agenda_links: [
        agendaLink("AGENDA", "agenda-mode-a", [
          {
            dayLabel: agendaDayLabel(MATRIX_TODAY_ISO),
            date: null,
            sessions: [
              {
                time: "8:00 AM – 8:45 AM",
                title: "Breakfast and Registration",
                room: "Foyer",
                tracks: [],
                drift: null,
              },
              {
                time: "9:00 AM – 9:40 AM",
                title: "Opening Remarks",
                room: "Grand Ballroom",
                tracks: [],
                drift: null,
              },
            ],
          },
        ]),
      ],
    },
  }),
);

/** One value per scope discipline, typed over `GearDiscipline` so a new discipline fails tsc. */
const GS_SCOPE: Record<GearDiscipline, string> = {
  audio: "Two handheld wireless, four lavs, podium mic",
  video: "Two 16:9 screens, front projection, confidence monitor at DSL",
  lighting: "Stage wash and two uplights on the step-and-repeat",
  scenic: "Pipe and drape upstage, client banner stage right",
  other: "Client laptops at the tech table, presenter clicker",
};

/** Every room-detail field, typed over `RoomDetailKey` so a new field fails tsc. */
const GS_DETAILS: Record<RoomDetailKey, string> = {
  dimensions: "120' x 80'",
  floor: "Level 2",
  setup: "Classroom for 300 with a center aisle",
  set_time: "6:00 AM",
  show_time: "8:00 AM",
  strike_time: "5:30 PM",
};

/** Every whitelisted tech spec, typed over `CREW_TECH_SPEC_KEYS` so a new key fails tsc. */
const TECH_SPECS: Record<(typeof CREW_TECH_SPEC_KEYS)[number], string> = {
  stage_size: "24' x 12' x 2' with ADA ramp stage left",
  podium_type: "Clear acrylic lectern",
  polling: "Slido polling on the GS screens",
  led: "12' x 7' LED wall upstage center",
  scenic: "Branded step-and-repeat at registration",
  gooseneck: "Two goosenecks on the panel table",
  digital_signage: "Room signs on easels outside each breakout",
  test_pattern: "Send the test pattern to the client by 5/8",
  fonts: "Client fonts in the shared folder (Gotham, Mercury)",
  equipment_storage: "Salon 4, behind the GS",
  staff_office_room: "Boardroom 2, second floor",
  record: "Record GS sessions to ProRes, hand drives over at strike",
  virtual_speaker: "One remote speaker on Zoom for the 10:30 panel",
  virtual_audience: "Livestream to the client's event page",
  notes: "Walk-in music at 8:45 AM sharp",
};

/** A run-of-show title past `TITLE_TRUNCATE_AT`, so it folds into a `<details>`. */
const LONG_TITLE = textLongerThan(TITLE_TRUNCATE_AT, [
  "Panel: Private Credit in a Higher-for-Longer World,",
  "with live audience polling and Q&A from the floor",
]);

/** A venue note past `TRUNCATE_AT`, so Today's notes card folds it into a `<details>`. */
const LONG_VENUE_NOTE = textLongerThan(TRUNCATE_AT, [
  "Houseman's name is Fikret and he's very helpful.",
  "Leave an ID with security to get a card for the dock door.",
  "The freight elevator is on the north side, past the kitchen.",
  "Union labor is required for any rigging over ten feet.",
]);

const FULL_SHOW_DAYS = [isoDay(-1), isoDay(0)];

/**
 * Everything a show sheet can fill, for a date-eligible crew viewer on the
 * last show day, which is also the Strike day: show days and dates, two agenda
 * PDFs (both for the FIRST show day, so Today keeps the plain run-of-show list
 * while `modeAToday` covers the merged timeline), run of show with a title
 * longer than `TITLE_TRUNCATE_AT`, a venue note longer than `TRUNCATE_AT`, the
 * phase form of the dress code, COI, venue notes, power, every whitelisted tech
 * spec, keynote, opening reel, every gear discipline, the pack list (today's
 * phases include Strike), and rooms with every detail field.
 */
export const fullContent = makeCase(
  "fullContent",
  CREW_VIEWER,
  base({
    crewMembers: [
      viewerRow(),
      { ...crewRow("crew-lead", "Dana Lee"), role: "A1", roleFlags: ["LEAD"] },
      { ...crewRow("crew-v1", "Marcus Hill"), role: "V1" },
    ],
    hotelReservations: [{ ...HOTEL, check_in: isoDay(-3), check_out: isoDay(1) }],
    contacts: [
      {
        kind: "venue",
        name: "Kurt Ashcraft",
        email: null,
        phone: "312-555-0142",
        notes: "Text before calling, he's on the floor all day",
      },
      {
        kind: "in_house_av",
        name: "Chris Mercado",
        email: null,
        phone: "312-555-0177",
        notes: null,
      },
    ],
    rooms: [
      {
        id: "room-gs",
        kind: "gs",
        name: "Grand Ballroom",
        ...GS_SCOPE,
        ...GS_DETAILS,
        notes: "House power drop is behind the stage left curtain",
      },
      {
        id: "room-salon-1",
        kind: "breakout",
        name: "Salon 1",
        audio: "One handheld, one lav",
        video: "One 65-inch monitor on a cart",
        dimensions: "40' x 30'",
        floor: "Level 2",
        setup: "Theater for 80",
      },
    ],
    runOfShow: {
      [FULL_SHOW_DAYS[0]!]: {
        entries: [
          { start: "7:00 AM", title: "Crew Call", room: "Grand Ballroom" },
          {
            start: "9:00 AM",
            finish: "9:40 AM",
            trt: "0:40",
            title: "Opening Remarks",
            room: "Grand Ballroom",
            av: "A1, V1",
          },
        ],
        showStart: "7:00 AM",
        showEnd: null,
        window: null,
      },
      [FULL_SHOW_DAYS[1]!]: {
        entries: [
          { start: "7:30 AM", title: "Crew Call", room: "Grand Ballroom" },
          {
            start: "9:00 AM",
            finish: "10:15 AM",
            trt: "1:15",
            title: LONG_TITLE,
            room: "Grand Ballroom",
            av: "A1, V1, L1",
          },
          { start: "4:30 PM", title: "Strike: GS and breakouts", kind: "strike" },
        ],
        showStart: "7:30 AM",
        showEnd: null,
        window: null,
      },
    } satisfies Record<string, ScheduleDay>,
    pullSheet: [
      {
        caseLabel: "Audio Rack 1",
        items: [
          { qty: 1, cat: "Audio", subCat: "Console", item: "Yamaha QL1" },
          { qty: 4, cat: "Audio", subCat: "Wireless", item: "Shure ULXD4 receiver" },
        ],
      },
      {
        caseLabel: "Video Case A",
        items: [{ qty: 2, cat: "Video", subCat: "Projector", item: "Panasonic PT-RZ970" }],
      },
    ],
    show: {
      venue: {
        name: "Grand Hall",
        address: "123 Main St",
        loadingDock: "Freight entrance on Rush St, dock 3",
        notes: LONG_VENUE_NOTE,
      },
      dates: {
        travelIn: isoDay(-3),
        set: isoDay(-2),
        showDays: FULL_SHOW_DAYS,
        travelOut: isoDay(1),
        // The Set day has no run of show, so Schedule's day card shows "Setup <time>".
        setupTime: "6:00am",
      },
      schedule_phases: {
        [isoDay(-2)]: ["Load In", "Set"],
        [FULL_SHOW_DAYS[0]!]: ["Show"],
        [FULL_SHOW_DAYS[1]!]: ["Show", "Strike"],
        [isoDay(1)]: ["Load Out"],
      },
      coi_status: "COI received 5/1",
      event_details: {
        ...BASE_EVENT_DETAILS,
        ...TECH_SPECS,
        dress_code: "Set/Strike: Black pants, black FXAV polo\nShow: Business casual, no jeans",
        keynote_requirements: "Confidence monitor at DSL, clicker and timer at the lectern",
        opening_reel: "YES - https://drive.google.com/file/d/1AbCdEfGhIjK/view",
      },
      agenda_links: [
        agendaLink("AGENDA - General Session", "agenda-gs", [
          {
            dayLabel: agendaDayLabel(FULL_SHOW_DAYS[0]!),
            date: null,
            sessions: [
              {
                time: "8:00 AM – 8:45 AM",
                title: "Breakfast and Registration",
                room: "Foyer",
                tracks: [],
                drift: null,
              },
              {
                time: "12:25 PM – 1:15 PM",
                title: "Lunch Keynote",
                room: "Grand Ballroom",
                tracks: [],
                drift: "start→12:25 PM (source: 12:25 AM)",
              },
            ],
          },
        ]),
        agendaLink("AGENDA - Breakouts", "agenda-breakouts", [
          {
            dayLabel: agendaDayLabel(FULL_SHOW_DAYS[0]!),
            date: null,
            sessions: [
              {
                time: "2:00 PM – 2:45 PM",
                title: "Breakout Sessions",
                room: null,
                tracks: [
                  { label: "Track A", title: "Direct Lending Outlook", room: "Salon 1" },
                  { label: "Track B", title: "Fund Finance 101", room: "Salon 2" },
                ],
                drift: null,
              },
            ],
          },
        ]),
      ],
    },
  }),
);

/**
 * The viewer's own flight, for a viewer whose dates are NOT suppressed, so the
 * Travel flight card renders every line `hideDates` strips (`dateSuppressed`
 * carries a flight too, with those lines withheld): a TRAVEL-shaped first leg
 * whose leading token is the itinerary-level "Confirmation", a TECH-shaped
 * second leg with a trailing per-segment "Conf", and a third part with no date,
 * which renders as its raw line. The second leg is after `MATRIX_TODAY`, so it
 * carries the "Next" chip.
 */
export const flightVisible = makeCase(
  "flightVisible",
  CREW_VIEWER,
  base({
    viewerFlightInfo:
      "HQ7PNR 5/13 AA3002 LGA - ORD 7:00am - 9:30am | ORD-LGA UNITED 5/16 - 6:05pm - 9:15pm GEUZAB | Hotel shuttle from baggage claim",
  }),
);

export const ALL_CASES: readonly ViewerCase[] = [
  crewNoTransport,
  crewWithTransport,
  leadWithFinancials,
  dateSuppressed,
  overCaps,
  todayOnlyLines,
  diagramsNamedAndUnnamed,
  adminViewer,
  wifiSplit,
  wifiRaw,
  wifiNotes,
  modeAToday,
  fullContent,
  flightVisible,
];
