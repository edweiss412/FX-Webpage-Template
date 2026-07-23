import type {
  ArchivedPullSheetTab,
  ClientContact,
  ContactRow,
  CrewMemberRow,
  HotelReservationRow,
  ParseResult,
  ParseWarning,
  PullSheetCase,
  RoomRow,
  RunOfShow,
  ShowRow,
  TransportationRow,
} from "@/lib/parser/types";
import type { Step3Row } from "@/components/admin/wizard/Step3Review";
import type { UseRawDecision } from "@/lib/sync/useRawOverlay";
import type { OverrideSnapshot } from "@/lib/sync/pullSheetOverride";
import type { AdminAgendaItem } from "@/lib/agenda/agendaAdminPreview";

/**
 * The mode-agnostic content contract every section panel renders from (spec
 * §3.2). Staged and published sources map onto this shape — see the plan's
 * per-field mapping table for the staged-source / published-source pairing.
 */
export type SectionCore = {
  // header
  title: string;
  clientLabel: string | null;
  dates: ShowRow["dates"] | null;
  // section content
  venue: ShowRow["venue"];
  eventDetails: ShowRow["event_details"] | null;
  clientContact: ClientContact | null;
  contacts: ContactRow[];
  ros: RunOfShow;
  agendaBaseline: AdminAgendaItem[];
  hotels: HotelReservationRow[];
  transportation: TransportationRow | null;
  rooms: RoomRow[];
  diagrams: ParseResult["diagrams"] | null;
  crewMembers: CrewMemberRow[];
  pullSheet: PullSheetCase[];
  archivedPullSheetTabs: ArchivedPullSheetTab[];
  // PSAT-1 (spec §3.1): the durable override snapshot, mode-agnostic. Staged: from
  // pending_syncs.pull_sheet_override. Published: null (no staged affordance).
  pullSheetOverride: OverrideSnapshot;
  billing: {
    coiStatus: string | null;
    proposal: string | null;
    po: string | null;
    invoice: string | null;
    invoiceNotes: string | null;
  };
  // cross-section
  warnings: ParseWarning[];
  useRawDecisions: UseRawDecision[];
  rawUnrecognized: ParseResult["raw_unrecognized"] | null;
  sourceAnchors: Step3Row["sourceAnchors"];
  driveFileId: string | null;
};

export type StagedSectionData = SectionCore & {
  mode: "staged";
  pr: ParseResult;
  row: Step3Row;
  dfid: string;
  wizardSessionId: string;
};

/** Null-tolerant wire projection of `shows.pull_sheet_override` (spec 2026-07-23 §4). Mirrors
 *  PostgreSQL `->>` per field (absent/JSON-null → null; string verbatim; any non-string → null),
 *  so the strict two-string `OverrideSnapshot` type is deliberately NOT reused. Round-trips the
 *  RPC's structural CAS; malformed rows are recoverable via the RPC's revoke carve-out. */
export type PullSheetOverrideWire = { tabName: string | null; fingerprint: string | null } | null;

/** The published Gear-section archived-tab include offer (spec 2026-07-23 §2.1). The adapter
 *  ALWAYS emits `null`; `_showReviewModal` is the sole attach site (post-augmentation after the
 *  warning model exists), gating on `published && !archived && driveFileId != null && names > 0`. */
export type PublishedArchivedTabOffer = { tabNames: string[]; slug: string } | null;

export type PublishedSectionData = SectionCore & {
  mode: "published";
  showId: string;
  slug: string;
  archived: boolean;
  published: boolean;
  /** §4 wire projection of the durable override (null-tolerant). */
  pullSheetOverrideWire: PullSheetOverrideWire;
  /** §2.1 include offer. Adapter emits null; modal attaches. Absent in staged (exactOptional). */
  archivedTabOffer?: PublishedArchivedTabOffer;
  // §5.5 Preview-As roster: the `crew_members` DB ids (with display name), index-aligned
  // with `crewMembers` — both derive from the adapter's single crew display sort, so
  // `previewRoster[i]` is the persisted id of `crewMembers[i]`. `CrewMemberRow` is a pure
  // parser type with no id; this carries the id the crew-scoped Preview-As link needs
  // without polluting that shape. Absent in staged mode (exactOptionalPropertyTypes).
  previewRoster?: { id: string; name: string }[];
};

export type SectionData = StagedSectionData | PublishedSectionData;

/**
 * The single staged-source → `StagedSectionData` mapping (spec §3.2). Every
 * construction site — the prod card and each test/e2e fixture builder — routes
 * through this one function so the header/section-content/billing derivation is
 * defined exactly once. The mode-agnostic *list* fields differ per site (prod
 * coerces via `arr()` + strips legacy anchors; fixtures pass raw arrays), so
 * they are inputs rather than derived here — the caller owns that choice while
 * the shared `pr`/`row`/`dfid` derivation stays mechanical and identical.
 */
export function buildStagedSectionData(input: {
  pr: ParseResult;
  row: Step3Row;
  dfid: string;
  wizardSessionId: string;
  // Site-specific SectionCore list fields (prod: arr()/strip; fixtures: raw).
  crewMembers: CrewMemberRow[];
  rooms: RoomRow[];
  hotels: HotelReservationRow[];
  pullSheet: PullSheetCase[];
  archivedPullSheetTabs: ArchivedPullSheetTab[];
  pullSheetOverride: OverrideSnapshot;
  ros: RunOfShow;
  warnings: ParseWarning[];
  agendaBaseline: AdminAgendaItem[];
  useRawDecisions: UseRawDecision[];
}): StagedSectionData {
  const {
    pr,
    row,
    dfid,
    wizardSessionId,
    crewMembers,
    rooms,
    hotels,
    pullSheet,
    archivedPullSheetTabs,
    pullSheetOverride,
    ros,
    warnings,
    agendaBaseline,
    useRawDecisions,
  } = input;
  return {
    mode: "staged",
    pr,
    row,
    dfid,
    wizardSessionId,
    // ── SectionCore (spec §3.2), derived once from the staged pr/row/dfid. ──
    title: pr.show.title || row.driveFileName || dfid,
    clientLabel: pr.show.client_label || null,
    dates: pr.show.dates,
    venue: pr.show.venue,
    eventDetails: pr.show.event_details,
    clientContact: pr.show.client_contact,
    contacts: pr.contacts ?? [],
    transportation: pr.transportation,
    diagrams: pr.diagrams,
    billing: {
      coiStatus: pr.show.coi_status,
      proposal: pr.show.proposal,
      po: pr.show.po,
      invoice: pr.show.invoice,
      invoiceNotes: pr.show.invoice_notes,
    },
    rawUnrecognized: pr.raw_unrecognized ?? null,
    sourceAnchors: row.sourceAnchors ?? {},
    driveFileId: dfid,
    // ── Site-specific list fields, passed through verbatim. ──
    crewMembers,
    rooms,
    hotels,
    pullSheet,
    archivedPullSheetTabs,
    pullSheetOverride,
    ros,
    warnings,
    agendaBaseline,
    useRawDecisions,
  };
}

export function isStaged(d: SectionData): d is StagedSectionData {
  return d.mode === "staged";
}

export function isPublished(d: SectionData): d is PublishedSectionData {
  return d.mode === "published";
}
