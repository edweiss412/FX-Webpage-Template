// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/adminSectionDom.test.tsx
 * (crew page redesign PR B plan, Task 1: "Admin DOM invariant" layer 1;
 * spec docs/superpowers/specs/2026-10-26-crew-page-redesign-design.md line 505)
 *
 * PR B moves seven admin section bodies (venue, crew, contacts, agenda, hotels,
 * transport, billing) into components/show-panels/ and has the admin render them
 * from there. The spec forbids any change to the admin popup's RENDERED DOM while
 * that happens, and the section-header PNGs cannot see a body. This suite is the
 * proof: it renders each of the seven sections and compares the section subtree's
 * markup with a golden file under `__golden__/`, captured once, with `-u`, on the
 * unmodified admin tree.
 *
 * Two render paths per fixture, because both exist in production:
 *   - "surface": through `ShowReviewSurface`, the chrome provider both the staged
 *     wizard modal and the published review modal mount. The golden is the
 *     `<section data-testid="wizard-step3-card-<dfid>-review-section-<id>">`
 *     subtree, chrome (heading row, panel card) included.
 *   - "bare": the registry entry's `render(d)` with no chrome provider, which takes
 *     `BreakdownSection`'s no-chrome branch.
 *
 * A golden diff is a defect, never a re-baseline (plan, "Admin DOM invariant").
 * Regenerating is `-u` on purpose and is reviewable as a diff under `__golden__/`;
 * a MISSING golden fails here instead of being written, so a deleted file cannot
 * silently come back as whatever the current tree renders.
 *
 * React `useId()` values are the one normalized thing: client-rendered ids come
 * from a module-global counter, so their absolute values depend on every render
 * that ran before in the process. Each distinct id in a subtree is renumbered by
 * first appearance (`«rid0»`, `«rid1»`, ...), which keeps the wiring (which `id`
 * each `aria-labelledby` names) and drops only the counter.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin/show/admin-section-dom",
  useSearchParams: () => new URLSearchParams(),
}));

import { ShowReviewSurface } from "@/components/admin/review/ShowReviewSurface";
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import {
  buildStagedSectionData,
  isStaged,
  type SectionData,
} from "@/components/admin/review/sectionData";
import { includesAgenda } from "@/components/admin/review/sectionInclusion";
import {
  CREW_CAP,
  HOTELS_CAP,
  __resetAgendaThrottleForTests,
  step3Sections,
} from "@/components/admin/wizard/step3ReviewSections";
import { canonicalCrewKey } from "@/lib/admin/attentionItems";
import type { SectionAttention } from "@/lib/admin/sectionAttention";
import type { SectionId } from "@/lib/admin/step3SectionStatus";
import { HOTEL_RESERVATION_JUDGMENT_CODES } from "@/lib/admin/warningReadingDisplay";
import { buildAdminAgendaPreview, type AdminAgendaItem } from "@/lib/agenda/agendaAdminPreview";
import {
  AGENDA_ADMIN_SESSIONS_CAP,
  AGENDA_ADMIN_TRACKS_PER_SESSION_CAP,
  EXTRACTOR_VERSION,
} from "@/lib/agenda/constants";
import type { AgendaExtraction } from "@/lib/agenda/types";
import { parseHotels } from "@/lib/parser/blocks/hotels";
import type {
  ClientContact,
  ContactRow,
  CrewMemberRow,
  HotelReservationRow,
  ParseWarning,
  ShowRow,
  TransportationRow,
} from "@/lib/parser/types";
import { newAggregator } from "@/lib/parser/warnings";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";
import type { ShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { buildPublishedSurfaceProps } from "@/tests/helpers/publishedSurfaceProps";
import { sectionDataArgs, show, stagedRow } from "./_step3ReviewFixture";

// ── The seven sections PR B moves (spec §6.3) ───────────────────────────────

const SHARED = [
  "venue",
  "crew",
  "contacts",
  "agenda",
  "hotels",
  "transport",
  "billing",
] as const satisfies readonly SectionId[];
type SharedId = (typeof SHARED)[number];

const KINDS = ["surface", "bare"] as const;
type Kind = (typeof KINDS)[number];

const GOLDEN_DIR = join(process.cwd(), "tests/components/admin/wizard/__golden__");

// One drive file id for both modes, so a staged-against-published difference in
// a golden is mode-dependent markup and never just a different testid string.
const DFID = "drive-section-dom";
const WSID = "00000000-1111-4222-8333-555555555555";
const SHOW_ID = "55555555-6666-4777-8888-999999999999";
const SLUG = "admin-section-dom";

// ── React id normalization ───────────────────────────────────────────────────

/** Every React `useId()` shape: `_r_<n>_` / `_R_<n>_` (react-dom 19.2, what this
 *  repo emits), `«r0»` and `:r0:` (earlier majors). Same shapes as
 *  tests/helpers/step3HeaderBaseline.ts, numbered instead of collapsed. */
const REACT_ID = /(?:_[Rr]_[0-9a-z]+_|«r[0-9a-z]+»|:r[0-9a-z]+:)/g;

function normalizeIds(html: string): string {
  const seen = new Map<string, string>();
  return html.replace(REACT_ID, (id) => {
    let out = seen.get(id);
    if (out === undefined) {
      out = `«rid${seen.size}»`;
      seen.set(id, out);
    }
    return out;
  });
}

// ── Content fixtures (mode-agnostic; each mode projects them its own way) ───

type Billing = SectionData["billing"];

type Content = {
  venue: ShowRow["venue"];
  clientContact: ClientContact | null;
  contacts: ContactRow[];
  crew: CrewMemberRow[];
  hotels: HotelReservationRow[];
  transport: TransportationRow | null;
  billing: Billing;
  agendaLinks: AgendaLink[];
};

type AgendaLink = { label: string; fileId?: string; url?: string; extracted?: unknown };

function member(over: Partial<CrewMemberRow> & { name: string }): CrewMemberRow {
  return {
    email: null,
    phone: null,
    role: "",
    role_flags: [],
    date_restriction: { kind: "none" },
    stage_restriction: { kind: "none" },
    flight_info: null,
    ...over,
  };
}

function hotel(over: Partial<HotelReservationRow> & { ordinal: number }): HotelReservationRow {
  return {
    hotel_name: null,
    hotel_address: null,
    names: [],
    confirmation_no: null,
    check_in: null,
    check_out: null,
    notes: null,
    ...over,
  };
}

function session(
  time: string,
  title: string | null,
  room: string | null,
  tracks: AgendaExtraction["days"][number]["sessions"][number]["tracks"] = [],
  drift: string | null = null,
) {
  return { time, title, room, tracks, drift };
}

/** A high-confidence extraction past every admin agenda cap: more sessions than
 *  AGENDA_ADMIN_SESSIONS_CAP across three days (so a whole day drops too) and one
 *  session with more tracks than AGENDA_ADMIN_TRACKS_PER_SESSION_CAP. */
function cappedExtraction(): AgendaExtraction {
  const tracks = Array.from({ length: AGENDA_ADMIN_TRACKS_PER_SESSION_CAP + 2 }, (_, i) => ({
    label: `Track ${String.fromCharCode(65 + i)}`,
    title: i % 2 === 0 ? `Breakout ${i + 1}` : null,
    room: i % 3 === 0 ? `Room ${i + 1}` : null,
  }));
  return {
    confidence: "high",
    corrections: 1,
    extractorVersion: EXTRACTOR_VERSION,
    days: [
      {
        dayLabel: "Day 1",
        date: "2026-04-10",
        sessions: [
          session("8:00 AM – 8:30 AM", "Registration", "Foyer"),
          session("9:00 AM – 9:45 AM", "Opening keynote", "Ballroom A"),
          session("10:00 AM – 11:00 AM", "Breakouts", null, tracks),
          session("11:15 AM – 12:00 PM", null, "Ballroom A"),
          session("12:25 PM – 1:15 PM", "Lunch", null, [], "start→12:25 PM (source: 12:25 AM)"),
          session("1:30 PM – 2:15 PM", "Panel", "Ballroom B"),
        ],
      },
      {
        dayLabel: "Day 2",
        date: "2026-04-11",
        sessions: [
          session("8:30 AM – 9:00 AM", "Coffee", "Foyer"),
          session("9:00 AM – 10:00 AM", "Fireside chat", "Ballroom A"),
          session("10:15 AM – 11:00 AM", "Workshop", "Room 3"),
          session("11:15 AM – 12:00 PM", "Closing", "Ballroom A"),
        ],
      },
      {
        dayLabel: "Day 3",
        date: null,
        sessions: [
          session("9:00 AM – 9:30 AM", "Wrap", null),
          session("10:00 AM – 10:30 AM", "Load out", null),
        ],
      },
    ],
  };
}

const FULL: Content = {
  venue: {
    name: "The Masonic Auditorium",
    address: "1111 California St",
    city: "San Francisco, CA 94108",
    loadingDock: "Rear alley off Taylor St, 2 bays, 9ft clearance",
    googleLink: "https://maps.google.com/?q=masonic",
  },
  clientContact: {
    name: "Dana Client",
    phone: "(415) 555-0100",
    email: "dana@client.example",
    officePhone: "(415) 555-0101",
    secondary: { name: "Sam Second", phone: "415-555-0102", email: null },
  },
  contacts: [
    {
      kind: "venue",
      name: "Vic Venue",
      phone: "(415) 555-0120",
      email: "vic@venue.example",
      notes: "Dock key at security",
    },
    { kind: "in_house_av", name: null, phone: "(415) 555-0130", email: null, notes: null },
    // No name and no phone or email: contactBlocks drops it.
    { kind: "venue", name: null, phone: null, email: null, notes: "Notes only" },
  ],
  crew: [
    member({
      name: "Avery Lead",
      role: "A1",
      role_flags: ["LEAD"],
      phone: "(415) 555-0110",
      email: "avery@crew.example",
    }),
    member({ name: "Blake Phone", role: "V1", phone: "415.555.0111" }),
    member({ name: "Casey Email", role: "L1", email: "casey@crew.example" }),
    member({
      name: "Devon Partial",
      role: "Stagehand",
      date_restriction: { kind: "explicit", days: ["2026-04-10"] },
    }),
    member({ name: "Emery Asterisk", date_restriction: { kind: "unknown_asterisk", days: null } }),
    member({ name: "", role: "Runner" }),
    // Fillers sort after every named row above in the published adapter's name
    // sort, so both modes keep the branch rows inside CREW_CAP.
    ...Array.from({ length: CREW_CAP - 4 }, (_, i) =>
      member({ name: `Zed Member ${String(i + 7).padStart(2, "0")}`, role: "Utility" }),
    ),
  ],
  hotels: [
    hotel({
      ordinal: 1,
      hotel_name: "Hotel Nikko",
      hotel_address: "222 Mason St, San Francisco",
      names: ["Avery Lead", "Blake Phone"],
      confirmation_no: "CONF-1",
      check_in: "2026-04-09",
      check_out: "2026-04-12",
      notes: "Late checkout",
    }),
    hotel({
      ordinal: 2,
      hotel_name: "Hyatt Regency",
      names: ["Eric Weiss"],
      check_in: "2026-04-10",
      check_out: "2026-04-11",
    }),
    hotel({ ordinal: 3, hotel_name: "Check-in Only Inn", check_in: "2026-04-10" }),
    hotel({ ordinal: 4, hotel_name: "No Dates Lodge" }),
    hotel({ ordinal: 5, names: ["Casey Email"], check_in: "2026-04-10", check_out: "2026-04-11" }),
    ...Array.from({ length: HOTELS_CAP - 4 }, (_, i) =>
      hotel({
        ordinal: i + 6,
        hotel_name: `Overflow Hotel ${String(i + 6).padStart(2, "0")}`,
        check_in: "2026-04-09",
        check_out: "2026-04-10",
      }),
    ),
  ],
  transport: {
    driver_name: "Pat Driver",
    driver_phone: "(415) 555-0199",
    driver_email: "pat@drive.example",
    loadout_name: "Lou Loadout",
    loadout_phone: "+1 415 555 0198",
    loadout_email: "lou@drive.example",
    vehicle: "26ft box truck",
    // A sentinel plate beside a real colour reaches both vehicle sub-line tones.
    license_plate: "TBD",
    color: "White",
    parking: "Lot B, level 2",
    schedule: [
      {
        stage: "Load In",
        date: "2026-04-09",
        time: "7:00 AM",
        assigned_names: ["Avery Lead", "Blake Phone"],
      },
      // No stage: TransportBreakdown drops the leg.
      { stage: "", date: "2026-04-10", time: "8:00 AM", assigned_names: [] },
      { stage: "Show", date: null, time: null, assigned_names: [] },
      { stage: "Load Out", date: "2026-04-12", time: "11:00 PM", assigned_names: ["Casey Email"] },
    ],
    notes: "Call the driver 30 minutes before load out.",
  },
  billing: {
    coiStatus: "Received",
    proposal: "P-2041",
    po: "PO-7788",
    invoice: "INV-3301",
    invoiceNotes: "Net 30, bill to Acme AP",
  },
  agendaLinks: [
    { label: "Main Agenda", fileId: "agenda-main", extracted: cappedExtraction() },
    // Never extracted: a ready row with no schedule.
    { label: "Breakout Agenda", url: "https://example.com/breakout.pdf" },
  ],
};

const SENTINEL: Content = {
  venue: { name: "TBD", address: "N/A", city: "TBA", loadingDock: "-", googleLink: "—" },
  clientContact: {
    name: "TBD",
    phone: "N/A",
    email: "TBA",
    officePhone: "-",
    secondary: { name: "—", phone: "TBD", email: "N/A" },
  },
  contacts: [{ kind: "venue", name: "TBA", phone: "-", email: "—", notes: "TBD" }],
  crew: [member({ name: "TBD", role: "N/A", phone: "TBA", email: "-", flight_info: "—" })],
  hotels: [
    hotel({
      ordinal: 1,
      hotel_name: "TBD",
      hotel_address: "N/A",
      names: ["TBA"],
      confirmation_no: "-",
      check_in: "TBD",
      check_out: "—",
      notes: "N/A",
    }),
  ],
  transport: {
    driver_name: "TBD",
    driver_phone: "N/A",
    driver_email: "TBA",
    loadout_name: "-",
    loadout_phone: "—",
    loadout_email: "TBD",
    vehicle: "N/A",
    license_plate: "TBA",
    color: "-",
    parking: "—",
    schedule: [{ stage: "TBD", date: "N/A", time: "TBA", assigned_names: ["-"] }],
    notes: "—",
  },
  billing: { coiStatus: "TBD", proposal: "N/A", po: "TBA", invoice: "-", invoiceNotes: "—" },
  agendaLinks: [
    {
      label: "TBD",
      fileId: "agenda-sentinel",
      extracted: {
        confidence: "high",
        corrections: 0,
        extractorVersion: EXTRACTOR_VERSION,
        days: [
          {
            dayLabel: "TBD",
            date: "N/A",
            sessions: [session("TBA", "-", "—", [{ label: "TBD", title: "N/A", room: "TBA" }])],
          },
        ],
      } satisfies AgendaExtraction,
    },
  ],
};

const EMPTY: Content = {
  venue: null,
  clientContact: null,
  contacts: [],
  crew: [],
  hotels: [],
  transport: null,
  billing: { coiStatus: null, proposal: null, po: null, invoice: null, invoiceNotes: null },
  // One link and no extraction: the agenda section mounts and shows its
  // no-schedule state. (An empty link list removes the section; see nulldfid.)
  agendaLinks: [{ label: "Agenda" }],
};

/** The parsed inline guest split (a real parse, as hotelReservationMarker.test.tsx
 *  uses), re-pointed at reservation `index`. */
function judgedHotelWarning(index: number): ParseWarning {
  const agg = newAggregator();
  parseHotels("| Hotel Reservations | Hyatt Regency Eric Weiss - 110525 |", "v2", agg);
  const w = agg.warnings.find((x) => x.code === "HOTEL_GUEST_SPLIT_AMBIGUOUS");
  if (w === undefined) throw new Error("the inline guest split parse emitted no warning");
  return { ...w, blockRef: { ...(w.blockRef ?? { kind: "hotels" }), index } };
}

const JUDGED_HOTEL_INDEX = 1;

// ── Mode projections ─────────────────────────────────────────────────────────

function stagedData(c: Content, warnings: ParseWarning[] = []): SectionData {
  const args = sectionDataArgs(
    {
      show: show({
        venue: c.venue,
        client_contact: c.clientContact,
        coi_status: c.billing.coiStatus,
        proposal: c.billing.proposal,
        po: c.billing.po,
        invoice: c.billing.invoice,
        invoice_notes: c.billing.invoiceNotes,
      }),
      crewMembers: c.crew,
      hotelReservations: c.hotels,
      transportation: c.transport,
      contacts: c.contacts,
      warnings,
    },
    { dfid: DFID },
  );
  // The staged baseline is note-only (no freshness), exactly what the wizard
  // seeds before its extract POST; the ready items arrive through `fetch`.
  return buildStagedSectionData({
    ...args,
    row: stagedRow(args.pr, { driveFileId: DFID }),
    wizardSessionId: WSID,
    agendaBaseline: buildAdminAgendaPreview(c.agendaLinks),
  });
}

/** The extract route's 200 body for a staged fixture: the same builder the
 *  server runs, with every extracted link fresh and hrefs validated. */
function stagedReadyItems(c: Content): AdminAgendaItem[] {
  const fresh = new Set<number>();
  c.agendaLinks.forEach((l, i) => {
    if (l.extracted != null) fresh.add(i);
  });
  return buildAdminAgendaPreview(c.agendaLinks, { freshByLinkKey: fresh, validatedHrefs: true });
}

function publishedData(
  c: Content,
  opts: { driveFileId: string | null; agendaLinks?: AgendaLink[] },
): SectionData {
  const snapshot: ShowReviewSnapshot = {
    show: {
      id: SHOW_ID,
      title: "Admin Section DOM Show",
      client_label: "Acme Capital",
      client_contact: c.clientContact,
      dates: {
        travelIn: "2026-04-09",
        set: null,
        showDays: ["2026-04-10", "2026-04-11"],
        travelOut: "2026-04-12",
      },
      venue: c.venue,
      event_details: null,
      agenda_links: opts.agendaLinks ?? c.agendaLinks,
      coi_status: c.billing.coiStatus,
      diagrams: null,
      pull_sheet: [],
      source_anchors: {},
      drive_file_id: opts.driveFileId,
      archived: false,
      published: true,
    },
    internal: {
      financials: {
        proposal: c.billing.proposal,
        po: c.billing.po,
        invoice: c.billing.invoice,
        invoice_notes: c.billing.invoiceNotes,
      },
      parse_warnings: [],
      raw_unrecognized: null,
      run_of_show: {},
      use_raw_decisions: [],
      show_id: SHOW_ID,
    },
    crew_members: c.crew.map((m, i) => ({
      id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      ...m,
    })),
    rooms: [],
    hotel_reservations: c.hotels.map((h) => ({ ...h })),
    transportation: c.transport ? [{ id: "transport-1", ...c.transport }] : [],
    contacts: c.contacts.map((x, i) => ({ id: `contact-${i + 1}`, ...x })),
  };
  return buildPublishedSectionData(snapshot, { slug: SLUG });
}

// ── Scenarios ────────────────────────────────────────────────────────────────

type Scenario = {
  name: string;
  data: SectionData;
  /** Staged only: the extract route's 200 body. */
  readyAgenda: AdminAgendaItem[];
  /** Mount props beyond `data`, as the mode's real modal passes them. */
  surfaceProps: Omit<ComponentProps<typeof ShowReviewSurface>, "data">;
  agendaMounts: boolean;
  /** Premises on the fixture's own inputs, per section. */
  inputPremises: Partial<Record<SharedId, () => void>>;
  /** Substrings the captured subtree must hold: the branch the input premise
   *  claims was in fact rendered, so the golden carries it. */
  reached: Partial<Record<`${Kind}:${SharedId}`, string[]>>;
};

const STAGED_MOUNT: Scenario["surfaceProps"] = {
  // Step3ReviewModal.tsx:1027 mounts the surface with these (attentionJump null).
  scrollerRef: { current: null },
  layout: "modal",
};

function publishedMount(extra: Partial<Scenario["surfaceProps"]> = {}): Scenario["surfaceProps"] {
  // The published modal's mount props (routedWarnings, renderSectionExtras,
  // layout) from the shared helper; `data` is replaced per scenario, and every
  // published fixture here carries no parse warnings, matching the helper's
  // own empty warning list (stated as a premise below).
  const { data: _helperData, ...props } = buildPublishedSurfaceProps();
  void _helperData;
  return { ...props, ...extra };
}

const isSentinel = (v: string | null | undefined): boolean =>
  typeof v === "string" && v.trim() !== "" && shouldHideGenericOptional(v);

/** Every text field the seven bodies show, read from the fixture's own inputs. */
function shownTextFields(c: Content): Record<SharedId, (string | null | undefined)[]> {
  const ex = c.agendaLinks
    .map((l) => l.extracted as AgendaExtraction | undefined)
    .filter((x): x is AgendaExtraction => x !== undefined);
  return {
    venue: [
      c.venue?.name,
      c.venue?.address,
      c.venue?.city,
      c.venue?.loadingDock,
      c.venue?.googleLink,
    ],
    crew: c.crew.flatMap((m) => [m.name, m.role, m.phone, m.email]),
    contacts: [
      c.clientContact?.name,
      c.clientContact?.phone,
      c.clientContact?.email,
      c.clientContact?.officePhone,
      c.clientContact?.secondary?.name,
      c.clientContact?.secondary?.phone,
      c.clientContact?.secondary?.email,
      ...c.contacts.flatMap((x) => [x.name, x.phone, x.email]),
    ],
    agenda: [
      ...c.agendaLinks.map((l) => l.label),
      ...ex.flatMap((e) =>
        e.days.flatMap((d) => [
          d.dayLabel,
          d.date,
          ...d.sessions.flatMap((s) => [
            s.time,
            s.title,
            s.room,
            ...s.tracks.flatMap((t) => [t.label, t.title, t.room]),
          ]),
        ]),
      ),
    ],
    hotels: c.hotels.flatMap((h) => [
      h.hotel_name,
      h.hotel_address,
      ...h.names,
      h.check_in,
      h.check_out,
    ]),
    transport: c.transport
      ? [
          c.transport.driver_name,
          c.transport.driver_phone,
          c.transport.driver_email,
          c.transport.loadout_name,
          c.transport.loadout_phone,
          c.transport.loadout_email,
          c.transport.vehicle,
          c.transport.license_plate,
          c.transport.color,
          c.transport.parking,
          c.transport.notes,
          ...c.transport.schedule.flatMap((l) => [l.stage, l.date, l.time, ...l.assigned_names]),
        ]
      : [],
    billing: [
      c.billing.coiStatus,
      c.billing.proposal,
      c.billing.po,
      c.billing.invoice,
      c.billing.invoiceNotes,
    ],
  };
}

function fullPremises(c: Content, mode: "staged" | "published"): Scenario["inputPremises"] {
  const t = c.transport;
  return {
    crew: () => premise("crew members past CREW_CAP", c.crew.length, CREW_CAP),
    hotels: () => premise("hotels past HOTELS_CAP", c.hotels.length, HOTELS_CAP),
    contacts: () =>
      premiseHolds(
        "a client contact with a secondary, plus venue and in-house rows",
        c.clientContact !== null &&
          c.clientContact.secondary != null &&
          c.contacts.some((x) => x.kind === "venue") &&
          c.contacts.some((x) => x.kind === "in_house_av"),
      ),
    transport: () =>
      premiseHolds(
        "transport with all four cells (driver, load out, vehicle, parking) and staged route legs",
        t !== null &&
          [t.driver_name, t.loadout_name, t.vehicle, t.parking].every((v) => !!v?.trim()) &&
          t.schedule.filter((l) => l.stage.trim() !== "").length > 1,
      ),
    agenda: () => {
      const extracted = c.agendaLinks[0]?.extracted as AgendaExtraction | undefined;
      const sessions = extracted?.days.reduce((n, d) => n + d.sessions.length, 0) ?? 0;
      premise(
        `a ready ${mode} agenda item whose sessions pass AGENDA_ADMIN_SESSIONS_CAP (the "Show all" leaf)`,
        sessions,
        AGENDA_ADMIN_SESSIONS_CAP,
      );
    },
  };
}

function sentinelPremises(c: Content): Scenario["inputPremises"] {
  const fields = shownTextFields(c);
  const out: Scenario["inputPremises"] = {};
  for (const id of SHARED) {
    out[id] = () => {
      premise(`the ${id} fixture fills at least one shown text field`, fields[id].length, 0);
      premiseHolds(
        `every text field the ${id} body shows holds a sentinel`,
        fields[id].every(isSentinel),
      );
    };
  }
  return out;
}

function emptyPremises(c: Content): Scenario["inputPremises"] {
  return {
    venue: () => premiseHolds("no venue", c.venue === null),
    crew: () => premiseHolds("no crew", c.crew.length === 0),
    contacts: () =>
      premiseHolds(
        "no client contact and no contacts",
        !c.clientContact && c.contacts.length === 0,
      ),
    hotels: () => premiseHolds("no hotels", c.hotels.length === 0),
    transport: () => premiseHolds("no transportation", c.transport === null),
    billing: () =>
      premiseHolds(
        "no billing value",
        Object.values(c.billing).every((v) => v === null),
      ),
    agenda: () =>
      premiseHolds(
        "agenda links that carry no extraction",
        c.agendaLinks.length > 0 && c.agendaLinks.every((l) => l.extracted == null),
      ),
  };
}

const FULL_REACHED: Scenario["reached"] = {
  "surface:crew": ["…and 2 more people", "Unnamed"],
  "bare:crew": ["…and 2 more people", "Unnamed"],
  "surface:hotels": ["…and 1 more hotels", 'data-testid="hotel-stay-nights"'],
  "bare:hotels": ["…and 1 more hotels", 'data-testid="hotel-stay-nights"'],
  "surface:contacts": ["Client contact (secondary)", "In-house AV"],
  "bare:contacts": ["Client contact (secondary)", "In-house AV"],
  "surface:transport": [">Driver<", ">Load out<", ">Vehicle<", ">Parking<", ">Route<"],
  "bare:transport": [">Driver<", ">Load out<", ">Vehicle<", ">Parking<", ">Route<"],
  "surface:agenda": ['data-testid="agenda-show-all"', "…and 4 more sessions"],
  "bare:agenda": ['data-testid="agenda-show-all"', "…and 4 more sessions"],
  "surface:venue": ['data-testid="venue-dock"', 'data-testid="venue-directions"'],
  "bare:venue": ['data-testid="venue-dock"', 'data-testid="venue-directions"'],
};

const FULL_STAGED_WARNINGS = [judgedHotelWarning(JUDGED_HOTEL_INDEX)];

const ATTENTION_ROW_NAME = "Avery Lead";
const ATTENTION_ROW_INDEX = 3;

/** Published crew attention: a section-top banner, three banners under one named
 *  row (two visible, one behind the "1 more" disclosure), and one banner fanned
 *  out by row index. Opaque nodes, as the modal hands them over. */
function crewAttention(): SectionAttention {
  const probe = (id: string): ReactNode => (
    <div key={id} data-testid={id}>
      {id}
    </div>
  );
  const attention: SectionAttention = new Map();
  attention.set("crew", {
    sectionTop: [probe("probe-crew-top")],
    byCrewKey: new Map([
      [
        canonicalCrewKey(ATTENTION_ROW_NAME),
        [probe("probe-under-row-1"), probe("probe-under-row-2"), probe("probe-under-row-3")],
      ],
    ]),
    byRowIndex: new Map([[ATTENTION_ROW_INDEX, [probe("probe-row-index-3")]]]),
  });
  return attention;
}

function buildScenarios(): Scenario[] {
  const fullStaged = stagedData(FULL, FULL_STAGED_WARNINGS);
  const fullPublished = publishedData(FULL, { driveFileId: DFID });
  const nullDfid = publishedData(FULL, { driveFileId: null, agendaLinks: [] });
  return [
    {
      name: "full-staged",
      data: fullStaged,
      readyAgenda: stagedReadyItems(FULL),
      surfaceProps: STAGED_MOUNT,
      agendaMounts: true,
      inputPremises: {
        ...fullPremises(FULL, "staged"),
        hotels: () => {
          premise("hotels past HOTELS_CAP", FULL.hotels.length, HOTELS_CAP);
          premiseHolds(
            "a rendered hotel carries a judgment-call code",
            FULL_STAGED_WARNINGS.some(
              (w) =>
                HOTEL_RESERVATION_JUDGMENT_CODES.has(w.code) &&
                w.severity === "warn" &&
                w.blockRef?.index === JUDGED_HOTEL_INDEX &&
                JUDGED_HOTEL_INDEX < HOTELS_CAP,
            ),
          );
        },
      },
      reached: {
        ...FULL_REACHED,
        "surface:hotels": [
          ...(FULL_REACHED["surface:hotels"] ?? []),
          'data-testid="wizard-step3-hotel-judgment-marker"',
          "Parsed with judgment",
        ],
      },
    },
    {
      name: "full-published",
      data: fullPublished,
      readyAgenda: [],
      surfaceProps: publishedMount({ sectionAttention: crewAttention() }),
      agendaMounts: true,
      inputPremises: {
        ...fullPremises(FULL, "published"),
        crew: () => {
          premise("crew members past CREW_CAP", FULL.crew.length, CREW_CAP);
          premiseHolds(
            "crew attention targets a rendered row by name and by index",
            fullPublished.crewMembers
              .slice(0, CREW_CAP)
              .some((m) => m.name === ATTENTION_ROW_NAME) &&
              ATTENTION_ROW_INDEX < Math.min(fullPublished.crewMembers.length, CREW_CAP),
          );
          premiseHolds(
            "published crew row actions enabled (published, not archived, every row has an id)",
            fullPublished.mode === "published" &&
              fullPublished.published &&
              !fullPublished.archived &&
              (fullPublished.previewRoster ?? []).length === FULL.crew.length &&
              (fullPublished.previewRoster ?? []).every((r) => r.id !== ""),
          );
          premiseHolds(
            "the published fixture carries no parse warnings (the helper's mount props are built over none)",
            fullPublished.warnings.length === 0,
          );
        },
      },
      reached: {
        ...FULL_REACHED,
        "surface:crew": [
          ...(FULL_REACHED["surface:crew"] ?? []),
          'data-testid="probe-crew-top"',
          'data-testid="crew-warn-more-',
          'data-testid="probe-row-index-3"',
          'data-testid="crew-row-menu-button-',
        ],
        "bare:crew": [...(FULL_REACHED["bare:crew"] ?? []), 'data-testid="crew-row-menu-button-'],
      },
    },
    {
      name: "sentinel-staged",
      data: stagedData(SENTINEL),
      readyAgenda: stagedReadyItems(SENTINEL),
      surfaceProps: STAGED_MOUNT,
      agendaMounts: true,
      inputPremises: sentinelPremises(SENTINEL),
      reached: {},
    },
    {
      name: "empty-staged",
      data: stagedData(EMPTY),
      readyAgenda: stagedReadyItems(EMPTY),
      surfaceProps: STAGED_MOUNT,
      agendaMounts: true,
      inputPremises: emptyPremises(EMPTY),
      reached: {
        "surface:agenda": ["No schedule detected in this PDF."],
        "bare:agenda": ["No schedule detected in this PDF."],
      },
    },
    {
      name: "empty-published",
      data: publishedData(EMPTY, { driveFileId: DFID }),
      readyAgenda: [],
      surfaceProps: publishedMount(),
      agendaMounts: true,
      inputPremises: emptyPremises(EMPTY),
      reached: {
        "surface:agenda": ["No schedule detected in this PDF."],
        "bare:agenda": ["No schedule detected in this PDF."],
      },
    },
    {
      name: "nulldfid-published",
      data: nullDfid,
      readyAgenda: [],
      surfaceProps: publishedMount(),
      agendaMounts: false,
      inputPremises: Object.fromEntries(
        SHARED.map((id) => [
          id,
          () => premiseHolds("a null drive file id", nullDfid.driveFileId === null),
        ]),
      ),
      reached: {
        "bare:venue": ['data-testid="wizard-step3-card-null-breakdown-venue"'],
        "surface:venue": ['data-testid="wizard-step3-card--review-section-venue"'],
      },
    },
  ];
}

const SCENARIOS = buildScenarios();

function sectionsOf(sc: Scenario): SharedId[] {
  const rendered = new Set(step3Sections(sc.data).map((s) => s.id));
  return SHARED.filter((id) => rendered.has(id));
}

function goldenName(sc: Scenario, kind: Kind, id: SharedId): string {
  return `${sc.name}--${kind}--${id}.html`;
}

// ── Capture ──────────────────────────────────────────────────────────────────

let readyAgenda: AdminAgendaItem[] = [];

beforeEach(() => {
  __resetAgendaThrottleForTests();
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const body = url.includes("/api/admin/onboarding/extract-agenda/")
        ? { items: readyAgenda }
        : {};
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** A staged agenda starts "loading" and fetches; wait for its terminal state so
 *  the golden is the settled render, never a moment of the poll. */
async function settle(container: HTMLElement, d: SectionData, agendaInTree: boolean) {
  if (!isStaged(d) || !agendaInTree) return;
  await waitFor(() => {
    const region = container.querySelector(
      `[data-testid="wizard-step3-card-${d.dfid}-agenda-parsing"]`,
    );
    expect(region?.getAttribute("class")).toBe("sr-only");
  });
}

function surfaceDfid(d: SectionData): string {
  // ShowReviewSurface.tsx's own rule for its section testids.
  return isStaged(d) ? d.dfid : (d.driveFileId ?? "");
}

const captures = new Map<string, Promise<Map<SharedId, string>>>();

function capture(sc: Scenario, kind: Kind): Promise<Map<SharedId, string>> {
  const key = `${sc.name}:${kind}`;
  let p = captures.get(key);
  if (p === undefined) {
    p = kind === "surface" ? captureSurface(sc) : captureBare(sc);
    captures.set(key, p);
  }
  return p;
}

async function captureSurface(sc: Scenario): Promise<Map<SharedId, string>> {
  readyAgenda = sc.readyAgenda;
  const view = render(<ShowReviewSurface {...sc.surfaceProps} data={sc.data} />);
  await settle(view.container, sc.data, sc.agendaMounts);
  const out = new Map<SharedId, string>();
  const dfid = surfaceDfid(sc.data);
  for (const id of SHARED) {
    const el = view.container.querySelector(
      `[data-testid="wizard-step3-card-${dfid}-review-section-${id}"]`,
    );
    if (el !== null) out.set(id, normalizeIds(el.outerHTML));
  }
  view.unmount();
  return out;
}

async function captureBare(sc: Scenario): Promise<Map<SharedId, string>> {
  readyAgenda = sc.readyAgenda;
  const out = new Map<SharedId, string>();
  for (const def of step3Sections(sc.data)) {
    const id = def.id as SharedId;
    if (!(SHARED as readonly SectionId[]).includes(def.id)) continue;
    const view = render(<>{def.render(sc.data)}</>);
    await settle(view.container, sc.data, id === "agenda");
    out.set(id, normalizeIds(view.container.innerHTML));
    view.unmount();
  }
  return out;
}

// ── Comparison ───────────────────────────────────────────────────────────────

function updatingGoldens(): boolean {
  const state = expect.getState().snapshotState as unknown as
    | { snapshotUpdateState?: string }
    | undefined;
  return state?.snapshotUpdateState === "all";
}

async function compareGolden(name: string, html: string): Promise<void> {
  if (!existsSync(join(GOLDEN_DIR, name)) && !updatingGoldens()) {
    throw new Error(
      `golden ${name} is missing. The goldens are captured once, with -u, on the unmodified ` +
        "admin tree (PR B plan, Task 1); a missing one is a defect, never a fresh capture.",
    );
  }
  await expect(`${html}\n`).toMatchFileSnapshot(`./__golden__/${name}`);
}

describe("admin section DOM golden (spec line 505, PR B invariant)", () => {
  describe.each(SCENARIOS)("$name", (sc) => {
    it("mounts the agenda section exactly when its fixture says it does", () => {
      expect(includesAgenda(sc.data)).toBe(sc.agendaMounts);
      expect(sectionsOf(sc)).toEqual(SHARED.filter((id) => id !== "agenda" || sc.agendaMounts));
    });

    describe.each(KINDS)("%s", (kind) => {
      it.each(sectionsOf(sc))("%s matches its golden", async (id) => {
        const captured = await capture(sc, kind);
        const html = captured.get(id);
        premiseHolds(`the ${kind} render produced a ${id} section subtree`, html !== undefined);
        sc.inputPremises[id]?.();
        for (const needle of sc.reached[`${kind}:${id}`] ?? []) {
          premiseHolds(`the ${kind} ${id} subtree renders ${needle}`, html!.includes(needle));
        }
        await compareGolden(goldenName(sc, kind, id), html!);
      });
    });

    if (!sc.agendaMounts) {
      it("renders no agenda section on the surface", async () => {
        const captured = await capture(sc, "surface");
        expect(captured.has("agenda")).toBe(false);
      });
    }
  });

  it("the golden directory holds exactly the goldens the scenarios derive", () => {
    const expected = SCENARIOS.flatMap((sc) =>
      KINDS.flatMap((kind) => sectionsOf(sc).map((id) => goldenName(sc, kind, id))),
    ).sort();
    premise("the scenarios derive at least one golden", expected.length, 0);
    const actual = readdirSync(GOLDEN_DIR)
      .filter((f) => f.endsWith(".html"))
      .sort();
    expect(actual).toEqual(expected);
  });
});
