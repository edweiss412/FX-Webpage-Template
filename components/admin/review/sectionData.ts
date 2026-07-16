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

export type PublishedSectionData = SectionCore & {
  mode: "published";
  showId: string;
  slug: string;
  archived: boolean;
  published: boolean;
};

export type SectionData = StagedSectionData | PublishedSectionData;

export function isStaged(d: SectionData): d is StagedSectionData {
  return d.mode === "staged";
}

export function isPublished(d: SectionData): d is PublishedSectionData {
  return d.mode === "published";
}
