/**
 * lib/crew/crewSections.ts: the sections a crew viewer may open.
 *
 * One membership list read by both the compact "All sections" card and the
 * wide left nav, so the two can never differ (crew page redesign spec §4.6).
 *
 * PR A keeps today's crew section ids and labels (spec §5.1): the base ids of
 * `BASE_SECTION_IDS` minus `today`, which now means "home, no sheet", plus
 * `budget` only when `financialsVisible` holds. That is the shell's own
 * entitlement (`app/show/[slug]/[shareToken]/_CrewShell.tsx`, `budgetVisible`),
 * computed by the same predicate, so the list, the section bodies the shell
 * builds and `resolveActiveSection` all agree.
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
import { BASE_SECTION_IDS, type SectionId } from "@/lib/crew/resolveActiveSection";
import { financialsVisible } from "@/lib/visibility/scopeTiles";

/** A section the list and the nav can open. `today` is the home, not a section. */
export type CrewSectionId = Exclude<SectionId, "today">;

export type CrewSection = { id: CrewSectionId; label: string };

/** What membership reads about the viewer: the budget gate's two inputs. */
export type CrewSectionsViewer = Pick<ViewerContext, "viewerFlags" | "isAdmin">;

/** Today's sub-nav labels (`components/crew/CrewSubNav.tsx`, `SECTION_LABELS`). */
export const CREW_SECTION_LABELS: Readonly<Record<CrewSectionId, string>> = {
  schedule: "Schedule",
  venue: "Venue",
  travel: "Travel",
  crew: "Crew",
  gear: "Gear",
  budget: "Budget",
};

/** The sections this viewer may open, in nav order. */
export function crewSectionsFor(_data: ShowForViewer, viewer: CrewSectionsViewer): CrewSection[] {
  const ids: CrewSectionId[] = BASE_SECTION_IDS.flatMap((id) => (id === "today" ? [] : [id]));
  if (financialsVisible(viewer.viewerFlags, viewer.isAdmin)) ids.push("budget");
  return ids.map((id) => ({ id, label: CREW_SECTION_LABELS[id] }));
}
