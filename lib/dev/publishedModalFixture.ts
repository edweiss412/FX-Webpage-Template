/**
 * lib/dev/publishedModalFixture.ts
 * (spec 2026-07-21-attention-modal-switcher-gallery §3.1)
 *
 * The base modal-data fixture for the switcher gallery, lifted from the real
 * `baseProps` helper (tests/components/admin/showpage/publishedReviewModal.test.tsx)
 * MINUS the 8 action functions (client-owned) — using the SAME real builders the
 * production loader uses (`buildPublishedSectionData`), so the gallery never
 * hand-rolls a modal shape. `buildGallerySnapshot` optionally populates the
 * rooms/event anchors so an anchored alert lands in its true section.
 */
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import { buildSectionWarningModel } from "@/lib/admin/sectionWarningModel";
// SERVER-SAFE section inclusion — NOT the `"use client"` `step3Sections`. This
// fixture builder runs inside the server route, and calling a client function
// server-side throws ("Attempted to call step3Sections() from the server").
// `renderedSectionIds` from sectionInclusion is the crypto/client-free walker
// production uses at app/admin/_showReviewModal.tsx:326.
import { renderedSectionIds as includedSectionIds } from "@/components/admin/review/sectionInclusion";
import type { ShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";
import type { ParseWarning } from "@/lib/parser/types";
import type { PublishedSectionData } from "@/components/admin/review/sectionData";
import { GALLERY_NOW, GALLERY_SLUG, type GalleryModalData } from "@/lib/dev/galleryModalTypes";
import { isShowLiveOnDate } from "@/lib/time/showSpan";
import { buildSheetDeepLink } from "@/lib/sheet-links/buildSheetDeepLink";
import type { ScenarioFixture } from "@/lib/dev/attentionScenarios/types";
import type { PersistedEmbeddedImage, RunOfShow, AgendaEntry } from "@/lib/parser/types";
import type { AgendaExtraction } from "@/lib/agenda/types";

const GALLERY_SHOW_ID = "99999999-9999-4999-8999-999999999999";
const GALLERY_DRIVE_FILE_ID = "DRIVE_GALLERY";
const GALLERY_TITLE = "Gallery Preview Show";
// Production parity: the loader derives openSheetHref via buildSheetDeepLink
// (app/admin/_showReviewModal.tsx:386), which pins #gid=0.
const GALLERY_SHEET_HREF = buildSheetDeepLink(GALLERY_DRIVE_FILE_ID);

export type AnchorFlags = { diagrams?: boolean; openingReel?: boolean };

/**
 * A `PersistedDiagrams` value that passes `hasDiagramSignal`
 * (`diagrams != null && (linkedFolder != null || images/items > 0)`), wrapped in
 * the post-M7 `{ current }` envelope `resolveCurrentDiagrams` expects.
 */
function diagramsWithSignal() {
  return {
    current: {
      snapshot_revision_id: "gallery-diagrams-rev",
      snapshot_status: "complete" as const,
      linkedFolder: {
        driveFolderId: "gallery-folder",
        driveFolderUrl: "https://drive.google.com/drive/folders/gallery",
      },
      embeddedImages: [],
      linkedFolderItems: [],
    },
  };
}

/**
 * The gallery's storable show snapshot. Base has no anchors (`diagrams: null`,
 * `event_details: null`); `opts.anchors` populates them so `anchorsForData`
 * yields the corresponding anchor and an anchored alert lands in rooms/event.
 */
export function buildGallerySnapshot(
  warnings: ParseWarning[] = [],
  opts: { anchors?: AnchorFlags } = {},
): ShowReviewSnapshot {
  const anchors = opts.anchors ?? {};
  return {
    show: {
      id: GALLERY_SHOW_ID,
      title: GALLERY_TITLE,
      client_label: "Gallery Client",
      client_contact: null,
      dates: {
        travelIn: "2026-05-01",
        set: null,
        showDays: ["2026-05-02"],
        travelOut: "2026-05-03",
      },
      venue: { name: "Gallery Hall", address: "1 Preview St", loadingDock: "Dock B, rear alley" },
      event_details: anchors.openingReel
        ? {
            opening_reel: "Gallery opening reel content",
            dress_code: "Business casual",
            polling: "Yes",
          }
        : null,
      agenda_links: [{ label: "Show agenda", url: "https://example.test/gallery-agenda" }],
      coi_status: "received",
      diagrams: anchors.diagrams ? diagramsWithSignal() : null,
      pull_sheet: [],
      source_anchors: {},
      drive_file_id: GALLERY_DRIVE_FILE_ID,
      archived: false,
      published: true,
    },
    internal: {
      financials: null,
      parse_warnings: warnings,
      raw_unrecognized: null,
      run_of_show: {},
      use_raw_decisions: [],
      show_id: GALLERY_SHOW_ID,
    },
    crew_members: [
      { id: "cccccccc-0000-4000-8000-000000000001", name: "Gallery Crew", role: "PM" },
      {
        id: "cccccccc-0000-4000-8000-000000000002",
        name: "Avery Chen",
        role: "TD",
        email: "avery@example.test",
      },
      {
        id: "cccccccc-0000-4000-8000-000000000003",
        name: "Blake Osei",
        role: "A1",
        phone: "555-0102",
      },
      { id: "cccccccc-0000-4000-8000-000000000004", name: "Casey Ruiz", role: "V1" },
      { id: "cccccccc-0000-4000-8000-000000000005", name: "Devon Park", role: "LD" },
      { id: "cccccccc-0000-4000-8000-000000000006", name: "Emerson Doyle", role: "Carp" },
    ],
    rooms: [
      {
        id: "dddddddd-0000-4000-8000-000000000001",
        kind: "gs",
        name: "Grand Ballroom",
        floor: "2nd floor",
        dimensions: "80x120",
        power: "200A 3-phase",
        set_time: "07:00",
        show_time: "09:00",
        strike_time: "22:00",
      },
      {
        id: "dddddddd-0000-4000-8000-000000000002",
        kind: "breakout",
        name: "Cedar Room",
        setup: "Rounds of 8",
        audio: "Podium mic",
      },
      {
        id: "dddddddd-0000-4000-8000-000000000003",
        kind: "additional",
        name: "Green Room",
        notes: "Crew hold",
      },
    ],
    hotel_reservations: [
      {
        id: "eeeeeeee-0000-4000-8000-000000000001",
        ordinal: 1,
        hotel_name: "Hotel Meridian",
        hotel_address: "2 Plaza Way",
        names: ["Gallery Crew", "Avery Chen"],
        confirmation_no: "CONF-1001",
        check_in: "2026-04-30",
        check_out: "2026-05-03",
      },
      {
        id: "eeeeeeee-0000-4000-8000-000000000002",
        ordinal: 2,
        hotel_name: "Hotel Meridian",
        names: ["Blake Osei"],
        confirmation_no: "CONF-1002",
        check_in: "2026-05-01",
        check_out: "2026-05-03",
      },
    ],
    transportation: [
      {
        id: "ffffffff-0000-4000-8000-000000000001",
        driver_name: "Morgan Lee",
        driver_phone: "555-0110",
        vehicle: "26ft box truck",
        parking: "Dock B",
        loadout_name: "Sam Porter",
        notes: "Staging via the rear alley only",
        schedule: [
          { stage: "Load in", date: "2026-05-01", time: "7:00 AM", assigned_names: ["Morgan Lee"] },
        ],
      },
      {
        id: "ffffffff-0000-4000-8000-000000000002",
        driver_name: "Riley Nax",
        vehicle: "Sprinter",
        schedule: [],
      },
    ],
    contacts: [
      {
        id: "abababab-0000-4000-8000-000000000001",
        kind: "venue",
        name: "Jordan Vale",
        email: "jordan@example.test",
        phone: "555-0120",
      },
      {
        id: "abababab-0000-4000-8000-000000000002",
        kind: "in_house_av",
        name: "Sam Rios",
        phone: "555-0121",
      },
    ],
  };
}

/** Rendered section ids for the warning model — the server-safe section walker. */
function renderedSectionIds(data: PublishedSectionData) {
  return new Set(includedSectionIds(data));
}

/**
 * The base data half of `PublishedReviewModalProps` (no action functions).
 * `over` overrides top-level keys last (a caller varies `data`/`bySection`/
 * `attentionItems`/`alertsDegraded`). `data` is ALWAYS a complete
 * `PublishedSectionData` from the real builder — never a nested partial.
 */
export function buildGalleryModalData(over: Partial<GalleryModalData> = {}): GalleryModalData {
  const data = buildPublishedSectionData(buildGallerySnapshot([]), { slug: GALLERY_SLUG });
  const bySection = buildSectionWarningModel({
    slug: GALLERY_SLUG,
    warnings: data.warnings,
    ignoredFingerprints: new Set<string>(),
    renderedSectionIds: renderedSectionIds(data),
  });
  return {
    data,
    bySection,
    slug: GALLERY_SLUG,
    showId: GALLERY_SHOW_ID,
    title: GALLERY_TITLE,
    archived: false,
    published: true,
    finalizeOwned: false,
    isLive: false,
    lastSyncedAt: "2026-07-01T17:48:00.000Z",
    lastCheckedAt: "2026-07-01T17:58:00.000Z",
    lastSyncStatus: "ok",
    now: GALLERY_NOW,
    attentionItems: [],
    alertsDegraded: false,
    openSheetHref: GALLERY_SHEET_HREF,
    crewEmails: [],
    pickerCrew: [],
    feed: { entries: [], truncated: false },
    alertId: null,
    ...over,
  };
}

// ── applyFixture: the single ScenarioFixture mapping (modal-state-coverage §3.2) ──
//
// Every GalleryModalData field production DERIVES from the snapshot is derived
// the same way here (the spec's derivation-parity table) — never independently
// injected. Deterministic throughout: index-derived values, no Date.now.

import type { PickerResetCrewRow } from "@/app/admin/show/[slug]/PickerResetControl";

/** app/admin/_showReviewModal.tsx CREW_ROSTER_READ_CAP mirror (parity-tested). */
const ROSTER_READ_CAP = 500;

export type AppliedFixture = {
  snapshot: ShowReviewSnapshot;
  dataOverrides: Partial<GalleryModalData>;
};

function pad3(i: number): string {
  return String(i).padStart(3, "0");
}

function genCrewRow(i: number): Record<string, unknown> {
  return {
    id: `cccccccc-0000-4000-8000-${pad3(i)}000000000`.slice(0, 36),
    name: `Crew Member ${pad3(i)}`,
    role: i % 2 === 0 ? "Tech" : "Hand",
  };
}

function genRoomRow(i: number): Record<string, unknown> {
  return {
    id: `dddddddd-0000-4000-8000-${pad3(i)}000000000`.slice(0, 36),
    kind: "breakout",
    name: `Breakout ${pad3(i)}`,
  };
}

function genHotelRow(i: number): Record<string, unknown> {
  return {
    id: `eeeeeeee-0000-4000-8000-${pad3(i)}000000000`.slice(0, 36),
    ordinal: i,
    hotel_name: `Hotel Annex ${pad3(i)}`,
    names: [`Crew Member ${pad3(i)}`],
  };
}

/** Fixed-length (~63-char) emails so mailto batching overflows deterministically. */
function genEmail(i: number): string {
  return `crew.member.${pad3(i)}.${"x".repeat(24)}@example-long-domain.test`;
}

function scheduleOverflowRos(): RunOfShow {
  const ros: RunOfShow = {};
  const agendaEntry = (d: number, e: number): AgendaEntry => ({
    start: `${String(8 + (e % 8)).padStart(2, "0")}:00 AM`,
    title: `Session ${d}-${e}`,
  });
  for (let d = 1; d <= 15; d++) {
    const iso = `2026-08-${String(d).padStart(2, "0")}`;
    ros[iso] = {
      entries: Array.from({ length: 8 }, (_, e) => agendaEntry(d, e)),
      showStart: null,
      showEnd: null,
      window: null,
    };
  }
  ros["2026-08-16"] = {
    entries: [
      { start: "8:00 AM", title: "Strike", kind: "strike" },
      { start: "11:00 AM", title: "Load out", kind: "loadout" },
    ],
    showStart: null,
    showEnd: null,
    window: null,
  };
  return ros;
}

function genDiagramImages(n: number): PersistedEmbeddedImage[] {
  return Array.from({ length: n }, (_, i) => ({
    sheetTab: "Diagrams",
    objectId: `gallery-img-${pad3(i)}`,
    mimeType: "image/png",
    sheetsRevisionId: "gallery-rev-1",
    embeddedFingerprint: `fp-${pad3(i)}`,
    recovery_disposition: "normal" as const,
    snapshotPath: `diagrams/gallery-img-${pad3(i)}.png`,
  }));
}

/**
 * A high-confidence extraction overflowing every admin preview cap: 3 days × 5
 * sessions (15 > AGENDA_ADMIN_SESSIONS_CAP 8 → droppedSessions and droppedDays)
 * with one 8-track session (> tracks-per-session cap 6 → droppedTracks).
 */
function agendaOverflowExtraction(): AgendaExtraction {
  const session = (d: number, i: number) => ({
    time: `${9 + i}:00 AM – ${9 + i}:40 AM`,
    title: `Day ${d} Session ${i + 1}`,
    room: null,
    tracks:
      d === 1 && i === 0
        ? Array.from({ length: 8 }, (_, t) => ({
            label: `T${t + 1}`,
            title: `Track ${t + 1}`,
            room: null,
          }))
        : [],
    drift: null,
  });
  return {
    confidence: "high",
    corrections: 0,
    days: [1, 2, 3].map((d) => ({
      dayLabel: `Day ${d}`,
      date: `2026-05-0${d}`,
      sessions: Array.from({ length: 5 }, (_, i) => session(d, i)),
    })),
    extractorVersion: 1,
  };
}

function genAgendaLinks(n: number): Array<Record<string, unknown>> {
  return Array.from({ length: n }, (_, i) => ({
    label: `AGENDA ${i + 1} - Breakout ${i + 1}`,
    fileId: `gallery-agenda-${pad3(i)}`,
    url: `https://drive.google.com/file/d/gallery-agenda-${pad3(i)}/view`,
  }));
}

function genPackCases(cases: number, itemsPerCase: number): Array<Record<string, unknown>> {
  return Array.from({ length: cases }, (_, c) => ({
    caseLabel: `Case ${pad3(c + 1)}`,
    items: Array.from({ length: itemsPerCase }, (_, i) => ({
      qty: 1,
      cat: "AV",
      subCat: null,
      item: `Item ${pad3(c + 1)}-${pad3(i + 1)}`,
    })),
  }));
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Apply a validated ScenarioFixture to the base snapshot and derive the
 * data-half overrides. `opts.firstSurvivingAlertId` is required by the
 * alertFlash knob (validateScenario guarantees a survivor exists; the modal
 * builder passes the id it derived).
 */
export function applyFixture(
  base: ShowReviewSnapshot,
  fixture: ScenarioFixture | undefined,
  opts: { firstSurvivingAlertId?: string } = {},
): AppliedFixture {
  const snapshot: ShowReviewSnapshot = {
    ...base,
    show: { ...base.show },
    internal: base.internal === null ? null : { ...base.internal },
    crew_members: [...base.crew_members],
    rooms: [...base.rooms],
    hotel_reservations: [...base.hotel_reservations],
    transportation: [...base.transportation],
    contacts: [...base.contacts],
  };
  const dataOverrides: Partial<GalleryModalData> = {};
  const fx = fixture ?? {};

  // ── Lifecycle (both halves from this one mapping) ──────────────────────────
  const archived = fx.archived === true;
  if (fx.archived !== undefined || fx.published !== undefined) {
    const published = archived ? false : (fx.published ?? true);
    snapshot.show.archived = archived;
    snapshot.show.published = published;
    dataOverrides.archived = archived;
    dataOverrides.published = published;
    // Loader parity: finalizeOwned is forced false when archived.
    if (archived) dataOverrides.finalizeOwned = false;
  }
  if (fx.finalizeOwned === true && !archived) dataOverrides.finalizeOwned = true;
  if (fx.isLive === true) {
    // Production derives isLive as published && isShowLiveOnDate(dates, today)
    // (app/admin/_showReviewModal.tsx:384); the knob reshapes dates around
    // GALLERY_NOW and then runs the SAME derivation over the reshaped snapshot
    // (never asserts true) so a lifecycle contradiction the validator missed
    // would surface as a false badge here, not silently render live.
    snapshot.show.dates = {
      travelIn: "2026-06-30",
      set: null,
      showDays: ["2026-07-01"],
      travelOut: "2026-07-02",
    };
    dataOverrides.isLive =
      snapshot.show.published === true &&
      isShowLiveOnDate(
        snapshot.show.dates as Parameters<typeof isShowLiveOnDate>[0],
        GALLERY_NOW.toISOString().slice(0, 10),
      );
  }
  if (fx.neverSynced === true) {
    dataOverrides.lastSyncedAt = null;
    dataOverrides.lastCheckedAt = null;
  }
  if (fx.checkedAbsent === true) dataOverrides.lastCheckedAt = null;
  if (fx.lastSyncStatus !== undefined) dataOverrides.lastSyncStatus = fx.lastSyncStatus;
  if (fx.titleAbsent === true) {
    // Production converts the adapter's empty title to null (title || null);
    // the snapshot keeps the storable empty string.
    snapshot.show.title = "";
    dataOverrides.title = null;
  }
  if (fx.datesAbsent === true) {
    snapshot.show.dates = { travelIn: null, set: null, showDays: [], travelOut: null };
  }
  if (fx.clientAbsent === true) snapshot.show.client_label = "";

  // ── Empty sections ─────────────────────────────────────────────────────────
  for (const key of fx.empty ?? []) {
    if (key === "crew") snapshot.crew_members = [];
    if (key === "venue") snapshot.show.venue = null;
    if (key === "rooms") snapshot.rooms = [];
    if (key === "hotels") snapshot.hotel_reservations = [];
    if (key === "transport") snapshot.transportation = [];
    if (key === "contacts") snapshot.contacts = [];
    if (key === "billing") snapshot.show.coi_status = null;
    if (key === "agenda") snapshot.show.agenda_links = [];
  }

  // ── Volumes ────────────────────────────────────────────────────────────────
  const vol = fx.volumes ?? {};
  if (vol.crew !== undefined) {
    const rows = snapshot.crew_members.slice(0, vol.crew);
    for (let i = rows.length; i < vol.crew; i++) rows.push(genCrewRow(i + 1));
    snapshot.crew_members = rows;
  }
  if (vol.rooms !== undefined) {
    const rows = snapshot.rooms.slice(0, vol.rooms);
    for (let i = rows.length; i < vol.rooms; i++) rows.push(genRoomRow(i + 1));
    snapshot.rooms = rows;
  }
  if (vol.hotels !== undefined) {
    const rows = snapshot.hotel_reservations.slice(0, vol.hotels);
    for (let i = rows.length; i < vol.hotels; i++) rows.push(genHotelRow(i + 1));
    snapshot.hotel_reservations = rows;
  }
  if (vol.hotelGuests !== undefined) {
    const first = snapshot.hotel_reservations[0];
    if (first !== undefined) {
      snapshot.hotel_reservations = [
        {
          ...(first as Record<string, unknown>),
          names: Array.from({ length: vol.hotelGuests }, (_, i) => `Guest ${pad3(i + 1)}`),
        },
        ...snapshot.hotel_reservations.slice(1),
      ];
    }
  }
  if (vol.schedule === "overflow" && snapshot.internal !== null) {
    snapshot.internal = { ...snapshot.internal, run_of_show: scheduleOverflowRos() };
  }
  if (vol.diagramImages !== undefined) {
    snapshot.show.diagrams = {
      current: {
        snapshot_revision_id: "gallery-diagrams-rev",
        snapshot_status: "complete" as const,
        linkedFolder: null,
        embeddedImages: genDiagramImages(vol.diagramImages),
        linkedFolderItems: [],
      },
    };
  }
  if (vol.packlist !== undefined) {
    snapshot.show.pull_sheet = genPackCases(vol.packlist.cases, vol.packlist.itemsPerCase);
  }
  if (vol.agenda === "overflow") {
    const links = Array.isArray(snapshot.show.agenda_links)
      ? [...(snapshot.show.agenda_links as Array<Record<string, unknown>>)]
      : [];
    const first = links[0];
    if (first !== undefined) {
      links[0] = { ...first, fileId: "gallery-agenda-000", extracted: agendaOverflowExtraction() };
      snapshot.show.agenda_links = links;
    }
  }
  if (vol.agendaLinks !== undefined) {
    snapshot.show.agenda_links = genAgendaLinks(vol.agendaLinks);
  }

  // ── Share roster reshape ───────────────────────────────────────────────────
  if (fx.share !== undefined) {
    const n = fx.share.crewEmails;
    // Grow the roster when the requested email count exceeds it (validation
    // forbids exceeding an EXPLICIT volumes.crew).
    const rows = [...snapshot.crew_members];
    for (let i = rows.length; i < n; i++) rows.push(genCrewRow(i + 1));
    snapshot.crew_members = rows.map((r, i) =>
      i < n
        ? { ...(r as Record<string, unknown>), email: genEmail(i + 1) }
        : (r as Record<string, unknown>),
    );
  }

  // ── Derived data-half fields (production parity) ───────────────────────────
  const rosterOverCap = snapshot.crew_members.length > ROSTER_READ_CAP;
  // crewEmails: loader parity (app/admin/_showReviewModal.tsx:347-362).
  const derivedEmails = rosterOverCap
    ? []
    : snapshot.crew_members
        .map((r) => (r as Record<string, unknown>).email)
        .filter((e): e is string => typeof e === "string" && e.includes("@"));
  // ALWAYS re-derive when a fixture is applied (not just share/over-cap): any
  // roster mutation (empty crew, volumes.crew) must flow into crewEmails or the
  // static base emails leak through (whole-diff review A P1).
  if (fixture !== undefined) dataOverrides.crewEmails = derivedEmails;
  // pickerCrew: loader parity (archived ? [] : every snapshot row).
  const pickerCrew: PickerResetCrewRow[] = archived
    ? []
    : snapshot.crew_members.map((r) => {
        const row = (r ?? {}) as Record<string, unknown>;
        return { id: str(row.id) ?? "", name: str(row.name) ?? "", role: str(row.role) };
      });
  if (fixture !== undefined) dataOverrides.pickerCrew = pickerCrew;
  if (rosterOverCap) {
    // Loader parity: over the cap the actionable roster affordances are blanked
    // (previewRoster: []) while the crew SECTION still renders every row.
    const data = buildPublishedSectionData(snapshot, { slug: GALLERY_SLUG });
    dataOverrides.data = { ...data, previewRoster: [] };
  }
  if (fx.alertFlash === true && opts.firstSurvivingAlertId !== undefined) {
    dataOverrides.alertId = opts.firstSurvivingAlertId;
  }

  return { snapshot, dataOverrides };
}
