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
import { SOURCE_CAP } from "@/components/crew/sections/TodaySection";
import { SHOWS_CAP } from "@/components/crew/primitives/KeyTimesStrip";
import { INITIAL_VISIBLE } from "@/components/diagrams/galleryLimits";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { resolveViewerContext } from "@/lib/data/viewerContext";
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

/**
 * Venue and show fields every case shares, so every section has lines to
 * render. `over` replaces top-level fields wholesale, except `show`, whose
 * fields merge over the shared ones.
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
      event_details: { internet: "SSID: FXAV Password: ORDTG.", power: "Two 20A circuits" },
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

/** Transport exists but names someone else, so the viewer's transport tile is hidden. */
export const crewNoTransport = makeCase(
  "crewNoTransport",
  CREW_VIEWER,
  base({ transportation: transport("Pat Driver") }),
);

/** The viewer is the driver (by name and by resolved owner id), so the transport tile shows. */
export const crewWithTransport = makeCase(
  "crewWithTransport",
  CREW_VIEWER,
  base({ transportation: transport(VIEWER_NAME), transportationOwnerIds: [VIEWER_ID] }),
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

export const ALL_CASES: readonly ViewerCase[] = [
  crewNoTransport,
  crewWithTransport,
  leadWithFinancials,
  dateSuppressed,
  overCaps,
  todayOnlyLines,
  diagramsNamedAndUnnamed,
  adminViewer,
];
