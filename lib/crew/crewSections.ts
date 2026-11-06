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
 * `CREW_SECTION_IDS` order, narrowed by one content rule: an Agenda with no
 * agenda file is entitled and unlisted (PR B Task 10). Four gates (spec line
 * 240): `billing` only when `financialsVisible` holds; `transport` for an admin,
 * a viewer `transportTileVisible` admits, or a viewer whose "Your flight" card
 * renders a row (PR B Task 9), since a viewer with neither has nothing the
 * section may show them, and an empty state there would claim no transport
 * exists when it is only withheld, so the section is not theirs (plan decision
 * 1); `agenda` whenever the viewer's dates are not suppressed (PR B Task 10); and
 * `packlist` only when `isPackListVisibleToday` holds (PR C plan decision 1), a
 * gate and not a content rule, so a member with no pull sheet shows the empty state.
 * `today` is the home, not a section.
 *
 * Membership never reads a domain whose fetch can fail: a domain whose fetch
 * failed (`tileErrors`) keeps its section listed, and the section shows its own
 * degraded state. The Agenda's content rule reads the show row's agenda links,
 * which arrive with the show itself, not from a fetch of their own (spec §5.1).
 *
 * Pure and server-safe.
 */
import type { ShowForViewer } from "@/lib/data/getShowForViewer";
import { hasAgendaFile } from "@/components/crew/agendaScheduleRows";
import { suppressesDates } from "@/lib/crew/dateSuppression";
import { viewerFlightShown } from "@/lib/crew/flightDisplay";
import { CREW_SECTION_IDS, type SectionId } from "@/lib/crew/resolveActiveSection";
import { sectionPeek, type SectionPeekViewer } from "@/lib/crew/sectionPeek";
import { showSection } from "@/lib/showSections/registry";
import { isPackListVisibleToday } from "@/lib/visibility/packList";
import { financialsVisible, transportTileVisible } from "@/lib/visibility/scopeTiles";

/** A section the list and the nav can open. `today` is the home, not a section. */
export type CrewSectionId = Exclude<SectionId, "today">;

export type CrewSection = { id: CrewSectionId; label: string };

/**
 * What entitlement and membership read about the viewer: the peeks' shape, which is
 * the billing gate's two inputs, the date restriction the Transport gate's own-flight
 * rule reads, and the stage restriction and clock the Pack list gate reads.
 */
export type CrewSectionsViewer = SectionPeekViewer;

/**
 * The crew sections' labels, each the registry's, so the crew page and the admin
 * popup name a section the same way (AC-10). The one label source: the "All sections"
 * rows, the wide nav, the sheet's title and its close button's name all read it.
 */
export const CREW_SECTION_LABELS: Readonly<Record<CrewSectionId, string>> = Object.fromEntries(
  CREW_SECTION_IDS.map((id) => [id, showSection(id).label]),
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

/** A stretch of nav entries under one group; an entry with no group has none. */
export type CrewNavRun<T> = { group: string | undefined; items: T[] };

/**
 * The wide nav's entries as contiguous runs of a group (PR C plan decision 11). A run
 * starts where an entry's group differs from the one before it, so a group with no
 * member draws nothing and no entry can fall out, which a filter over the group list
 * could not promise. The live nav and the loading skeleton both draw these.
 */
export function crewNavRuns<T extends { group?: string }>(items: readonly T[]): CrewNavRun<T>[] {
  const runs: CrewNavRun<T>[] = [];
  for (const item of items) {
    const last = runs.at(-1);
    if (last !== undefined && last.group === item.group) last.items.push(item);
    else runs.push({ group: item.group, items: [item] });
  }
  return runs;
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
  transport: (data, viewer) =>
    viewer.isAdmin ||
    transportTileVisible({
      transportation: data.transportation,
      viewerId: data.viewerId,
      transportationOwnerIds: data.transportationOwnerIds,
      viewerName: data.viewerName,
      viewerNameAliases: data.viewerNameAliases,
      isAdmin: viewer.isAdmin,
    }) ||
    viewerFlightShown(data.viewerFlightInfo, suppressesDates(viewer.dateRestriction)),
  // Hidden for a viewer whose dates are suppressed (spec §6.2 `agenda` row): an
  // agenda is a schedule of days, so its days are a claim about theirs.
  agenda: (_data, viewer) => !suppressesDates(viewer.dateRestriction),
  // Today's rule, unchanged, and for a plain admin too (PR C plan decision 1).
  packlist: (data, viewer) =>
    isPackListVisibleToday({
      show: data.show,
      restriction: viewer.stageRestriction,
      today: viewer.today,
    }),
};

/**
 * The one content rule membership adds to entitlement (spec line 240, plan
 * decision 1): an Agenda is listed only when the show has an agenda link with a
 * file, the same test the section's empty state reads. Every other id is listed
 * whenever it is entitled.
 */
function listedWithContent(id: CrewSectionId, data: ShowForViewer): boolean {
  return id !== "agenda" || hasAgendaFile(data.show.agenda_links);
}

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

/**
 * The sections the list and the nav offer this viewer, in nav order: the entitled
 * ones with something to show (an Agenda with no file is entitled and unlisted).
 */
export function crewSectionsFor(data: ShowForViewer, viewer: CrewSectionsViewer): CrewSection[] {
  return CREW_SECTION_IDS.filter(
    (id) => crewSectionEntitled(id, data, viewer) && listedWithContent(id, data),
  ).map((id) => ({
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
  viewer: CrewSectionsViewer,
): CrewSectionEntry[] {
  return crewSectionsFor(data, viewer).map((section) => ({
    ...section,
    peek: sectionPeek(section.id, data, viewer),
  }));
}
