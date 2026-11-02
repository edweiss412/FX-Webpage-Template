/**
 * lib/crew/crewSections.ts: the sections a crew viewer may open.
 *
 * One membership list read by both the compact "All sections" card and the
 * wide left nav, so the two can never differ (crew page redesign spec §4.6).
 *
 * Entitlement and membership are two predicates (crew page redesign PR B plan,
 * decision 1). `crewSectionEntitled` says whether the viewer may see a section
 * at all: the shell builds a body for every entitled id and resolves `?s=`
 * against them. Membership, `crewSectionsFor`, is the entitled ids in
 * `CREW_SECTION_IDS` order; from PR B one content rule narrows it (an Agenda
 * with nothing in it is entitled and unlisted). PR A's one gate stands, under
 * the registry id: `billing` only when `financialsVisible` holds. `today` is the
 * home, not a section.
 *
 * Membership never reads the projection's data: a domain whose fetch failed
 * (`tileErrors`) keeps its section listed, and the section shows its own
 * degraded state. `data` is in the signature because the rules from PR B on
 * read it (spec §5.1).
 *
 * Pure and server-safe.
 */
import type { ShowForViewer } from "@/lib/data/getShowForViewer";
import type { ViewerContext } from "@/lib/data/viewerContext";
import { CREW_SECTION_IDS, type SectionId } from "@/lib/crew/resolveActiveSection";
import { sectionPeek, type SectionPeekViewer } from "@/lib/crew/sectionPeek";
import { showSection, type ShowSectionId } from "@/lib/showSections/registry";
import { financialsVisible } from "@/lib/visibility/scopeTiles";

/** A section the list and the nav can open. `today` is the home, not a section. */
export type CrewSectionId = Exclude<SectionId, "today">;

export type CrewSection = { id: CrewSectionId; label: string };

/** What entitlement and membership read about the viewer: the billing gate's two inputs. */
export type CrewSectionsViewer = Pick<ViewerContext, "viewerFlags" | "isAdmin">;

/**
 * The crew sections moved onto a shared body (components/show-panels/), named
 * explicitly rather than derived (PR B plan, decision 2): `schedule`, `venue` and
 * `crew` are registry ids long before they move, and `schedule` never does. Each
 * section task appends its own ids in its own commit. A moved section's label and
 * glyph are its registry record's (decisions 2 and 3), so the crew page and the
 * admin popup name and draw it the same way.
 */
export const CREW_MOVED_IDS = [
  "billing",
  "venue",
  "crew",
  "contacts",
] as const satisfies readonly (CrewSectionId & ShowSectionId)[];

type CrewMovedId = (typeof CREW_MOVED_IDS)[number];

/** Whether the section reads its label and glyph from the registry. */
export function isCrewMovedSection(id: CrewSectionId): id is CrewMovedId {
  return (CREW_MOVED_IDS as readonly string[]).includes(id);
}

/** The crew's own names for the sections not yet moved (spec §5.1, PR A's labels). */
const CREW_OWN_LABELS: Readonly<Record<Exclude<CrewSectionId, CrewMovedId>, string>> = {
  schedule: "Schedule",
  travel: "Travel",
  gear: "Gear",
};

/**
 * The crew sections' labels: the registry's for a moved section, the crew's own
 * for the rest. The one label source: the "All sections" rows, the wide nav, the
 * sheet's title and its close button's name all read it.
 */
export const CREW_SECTION_LABELS: Readonly<Record<CrewSectionId, string>> = Object.fromEntries(
  CREW_SECTION_IDS.map((id) => [
    id,
    isCrewMovedSection(id) ? showSection(id).label : CREW_OWN_LABELS[id],
  ]),
) as Record<CrewSectionId, string>;

/** The wide nav's first item, the Today block (spec §5.3). */
export const CREW_TODAY_LABEL = "Today";

/**
 * Any crew section id's label, `today` included: search's result chips and
 * group headings (search spec §6.3) read the same names the list and the nav do.
 */
export function crewSectionLabel(id: SectionId): string {
  return id === "today" ? CREW_TODAY_LABEL : CREW_SECTION_LABELS[id];
}

/** A listed section plus its one-line peek, as the client receives it. */
export type CrewSectionEntry = CrewSection & { peek: string | null };

type SectionGate = (data: ShowForViewer, viewer: CrewSectionsViewer) => boolean;

/**
 * The sections a viewer may be refused, each with the predicate that admits it.
 * A section with no row here is entitled for every viewer.
 */
const SECTION_GATES: Readonly<Partial<Record<CrewSectionId, SectionGate>>> = {
  billing: (_data, viewer) => financialsVisible(viewer.viewerFlags, viewer.isAdmin),
};

/**
 * The sections every viewer is listed, in nav order: the rows the loading
 * skeleton may show before the projection says who the viewer is, so it never
 * shows a row that may not render.
 */
export const CREW_ALWAYS_SECTION_IDS: readonly CrewSectionId[] = CREW_SECTION_IDS.filter(
  (id) => !Object.hasOwn(SECTION_GATES, id),
);

/** Whether this viewer may see the section at all; the home always. */
export function crewSectionEntitled(
  id: SectionId,
  data: ShowForViewer,
  viewer: CrewSectionsViewer,
): boolean {
  if (id === "today") return true;
  const gate = SECTION_GATES[id];
  return gate === undefined || gate(data, viewer);
}

/** The sections this viewer may open, in nav order. */
export function crewSectionsFor(data: ShowForViewer, viewer: CrewSectionsViewer): CrewSection[] {
  return CREW_SECTION_IDS.filter((id) => crewSectionEntitled(id, data, viewer)).map((id) => ({
    id,
    label: CREW_SECTION_LABELS[id],
  }));
}

/**
 * The props the compact "All sections" card and the wide nav receive: the
 * membership with each section's peek, built on the server. A peek reads only
 * what its section shows this viewer (`sectionPeek`), so the list never carries
 * a value the viewer is withheld.
 */
export function crewSectionEntries(
  data: ShowForViewer,
  viewer: SectionPeekViewer,
): CrewSectionEntry[] {
  return crewSectionsFor(data, viewer).map((section) => ({
    ...section,
    peek: sectionPeek(section.id, data, viewer),
  }));
}
