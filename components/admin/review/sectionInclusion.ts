/**
 * components/admin/review/sectionInclusion.ts
 *
 * The pure, server-safe section-INCLUSION logic for the Step-3 review registry:
 * which `SectionId`s render (and in what order) for a given `SectionData`. It
 * has NO `"use client"` directive and imports only types + `SectionData`, so a
 * Server Component (the consolidated per-show admin page) can import and CALL it
 * directly — unlike `step3Sections` in the `"use client"` module
 * `step3ReviewSections.tsx`, whose exports are opaque client references on the
 * server and throw when invoked from an RSC.
 *
 * SINGLE SOURCE OF TRUTH for the inclusion rule: `step3Sections` (which layers on
 * each section's Icon / label / group / render) consumes `includesAgenda` here
 * for its one data-dependent branch, and `tests/components/admin/review/
 * sectionInclusion.test.ts` pins `step3Sections(d).map(s => s.id)` ===
 * `renderedSectionIds(d)` so the two can never drift.
 */
import type { SectionData } from "@/components/admin/review/sectionData";
import type { SectionId } from "@/lib/admin/step3SectionStatus";

/**
 * The Agenda section renders only when a baseline exists (spec §3.5) — it is the
 * ONE data-dependent section in the registry. Every other section renders for
 * all `SectionData`. `step3Sections` calls this for its agenda push so the rule
 * lives in exactly one place.
 */
export function includesAgenda(d: SectionData): boolean {
  return d.agendaBaseline.length > 0;
}

/**
 * The ordered list of `SectionId`s `step3Sections` renders for `d`. Mirrors the
 * registry order in `step3Sections` (pinned by the lockstep test): the fixed
 * spine with `agenda` inserted after `schedule` only when a baseline exists.
 */
export function renderedSectionIds(d: SectionData): SectionId[] {
  const ids: SectionId[] = ["venue", "event", "crew", "contacts", "schedule"];
  if (includesAgenda(d)) ids.push("agenda");
  ids.push("hotels", "transport", "rooms", "packlist", "billing", "warnings", "report");
  return ids;
}
