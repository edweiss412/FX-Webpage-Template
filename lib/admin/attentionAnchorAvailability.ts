// lib/admin/attentionAnchorAvailability.ts
//
// Per-section anchor availability (attention-alert-routing §3.3). Returns a Map
// keyed by the anchor-hosting section — NOT a global set — so bucketAttention checks
// each anchor against the section that will render it. Availability REUSES the exact
// predicates the render gates use, so availability and render can never disagree:
//   - `diagrams`: `hasDiagramSignal` — the same gate the Diagrams sub-block render
//     (`PublishedDiagramsBreakdown` / staged fork) and the rooms badge use.
//   - `opening_reel`: the field's value after the existing `stripOpeningReelText`
//     cleanup + `trim()` is non-empty — the exact `valueFor("opening_reel")` the
//     EventDetailsBreakdown field render applies before its `length > 0` filter.
import { hasDiagramSignal } from "@/components/admin/wizard/step3ReviewSections";
import { resolveCurrentDiagrams } from "@/lib/data/diagrams";
import { stripOpeningReelText } from "@/lib/visibility/openingReelText";
import { isStaged, type SectionData } from "@/components/admin/review/sectionData";
import type { AttentionAnchor } from "@/lib/admin/attentionItems";

export function anchorsForData(
  data: SectionData,
): Map<"rooms" | "event", Set<AttentionAnchor>> {
  const map = new Map<"rooms" | "event", Set<AttentionAnchor>>();

  // Mirror the sub-block render fork EXACTLY (step3ReviewSections.tsx): staged reads
  // the parser diagrams directly; published resolves the persisted snapshot first.
  const diagramsPresent = isStaged(data)
    ? hasDiagramSignal(data.diagrams)
    : hasDiagramSignal(resolveCurrentDiagrams(data.diagrams));
  if (diagramsPresent) map.set("rooms", new Set<AttentionAnchor>(["diagrams"]));

  // Match EventDetailsBreakdown's `valueFor("opening_reel")`:
  //   String(ed[key] ?? "").trim() → stripOpeningReelText(text).trim()
  const raw = (data.eventDetails as Record<string, unknown> | null | undefined)?.["opening_reel"];
  const reel = stripOpeningReelText(String(raw ?? "").trim()).trim();
  if (reel.length > 0) map.set("event", new Set<AttentionAnchor>(["opening_reel"]));

  return map;
}
