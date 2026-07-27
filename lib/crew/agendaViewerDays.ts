/**
 * lib/crew/agendaViewerDays.ts — which rows of ONE agenda extraction belong to this viewer.
 *
 * Per-link by construction (spec §3): the caller invokes this once per agenda link and never
 * shares a result between links, because one PDF can parse while another does not.
 *
 * Returns ROW INDICES, not dates. The live extractor writes `date: null` on every
 * `AgendaDay` (spec §2.5 fact 1), so a date set would identify nothing at the render site.
 *
 * Fails open — `{ kind: "all" }` — whenever the viewer's days cannot be established
 * COMPLETELY. Partial knowledge is treated as no knowledge, because a partially-correct fold
 * silently hides a day the viewer works while looking entirely normal on screen.
 */
import { normalizeAgendaExtraction } from "@/lib/agenda/normalizeAgendaExtraction";
import { parseIsoFromDayLabel } from "@/lib/crew/agendaDayForToday";

export type ViewerAgendaDays = { kind: "all" } | { kind: "subset"; rows: ReadonlySet<number> };

const ALL: ViewerAgendaDays = { kind: "all" };

export function visibleAgendaDaysForViewer(
  /**
   * RAW jsonb, normalized here. Mirrors `agendaSessionsForToday`, which also takes the raw
   * `extracted` value and normalizes internally (`lib/crew/agendaDayForToday.ts:55`). Taking
   * the raw value keeps the boundary in one place: the caller does not have a normalized
   * extraction to hand, because `AgendaScheduleBlock` normalizes its own prop.
   */
  extracted: unknown,
  /**
   * The viewer's days: the dates of the caller's already-computed `visibleDays`, i.e. the
   * restriction intersected with the show's AGGREGATE dates (spec §2).
   *
   * Taken pre-intersected rather than recomputed from the aggregate. The caller has this value
   * already, and `visibleShowDays` is documented as the single source for that set with an
   * explicit drift warning, so computing a second intersection here is exactly the drift that
   * comment guards against.
   */
  viewerDates: readonly string[],
  /**
   * The viewer's RAW restriction dates, which may include dates outside the show's aggregate.
   * Needed separately: `restriction \ viewerDates` is precisely the set of days the viewer is
   * assigned that the show's own dates do not contain, which is what the disagreement guard
   * below detects.
   */
  restrictionDates: readonly string[],
): ViewerAgendaDays {
  const extraction = normalizeAgendaExtraction(extracted);
  // Not high-confidence or no days: the component renders nothing for this link
  // (`components/crew/AgendaScheduleBlock.tsx:58`), so there is nothing to fold.
  if (!extraction || extraction.confidence !== "high" || extraction.days.length === 0) return ALL;

  const restriction = new Set(restrictionDates);
  const R = new Set(viewerDates);

  const parsed = extraction.days.map((day) => parseIsoFromDayLabel(day.dayLabel));

  // The sheet and the PDF disagree about which dates exist: this extraction carries a block
  // for a date the viewer is assigned that the show's own dates do not contain. That is
  // partial knowledge, so fail open rather than fold a worked day.
  const disagrees = parsed.some((iso) => iso !== null && restriction.has(iso) && !R.has(iso));
  if (disagrees) return ALL;

  // L is a set of DATES even though the return value is row indices: an extraction may carry
  // two blocks for one date, and counting ROWS would make |located| exceed |R| and mis-declare
  // completeness on exactly the input that needs to fail open.
  const located = new Set<string>();
  const rows = new Set<number>();
  parsed.forEach((iso, i) => {
    if (iso !== null && R.has(iso)) {
      located.add(iso);
      rows.add(i);
    }
  });

  // `located` ⊆ `R` by construction, so equal sizes means every assigned day was found.
  if (R.size === 0 || located.size !== R.size) return ALL;

  // EVERY row must also be identifiable, not just every assigned DATE (whole-diff review, HIGH).
  // Proving "May 5 appears somewhere" does not prove which rows belong to May 5. Given
  // ["Tuesday, May 5, 2026", "Day 1 continued", "Wednesday, May 6, 2026"] and a May 5 assignment,
  // date-completeness passes on row 0 and folds row 1 -- a continuation of the viewer's own day,
  // hidden and unmarked. A row whose label does not parse has UNKNOWN ownership, and unknown
  // ownership is exactly the partial knowledge this function refuses to fold on.
  if (parsed.some((iso) => iso === null)) return ALL;

  // An empty subset is the dangerous value ("fold iff my index is absent" would fold every
  // row, including the viewer's own), and it is UNREACHABLE here by construction rather than
  // by a guard: reaching this line means R is non-empty and `located.size === R.size`, so
  // `located` holds at least one date, so at least one index was added to `rows`.
  //
  // A guard was written here first. Mutation testing removed it and every test still passed,
  // which is the signature of dead code rather than of a weak test -- so it was deleted rather
  // than pinned. The property is still asserted by the suite; it just holds structurally.
  return { kind: "subset", rows };
}
