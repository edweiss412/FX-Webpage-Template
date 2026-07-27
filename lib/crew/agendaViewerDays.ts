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
import { MONTHS, parseIsoFromDayLabel } from "@/lib/crew/agendaDayForToday";

export type ViewerAgendaDays = { kind: "all" } | { kind: "subset"; rows: ReadonlySet<number> };

const ALL: ViewerAgendaDays = { kind: "all" };

/**
 * How many DISTINCT calendar dates a day label names.
 *
 * Deliberately re-implements `parseIsoFromDayLabel`'s scan with the /g flag rather than
 * calling it, because that function's contract is "the first date" and this one's question is
 * "how many". Kept adjacent so the two regexes are visibly the same shape; if the shared one
 * changes, this must change with it, which the mixed-format test pins.
 */
const WEEKDAYS = /\b(mon|tues?|wed(nes)?|thur?s?|fri|satur|sun)(day)?\b/gi;

/** Any month name, used to detect a SECOND month reference in the leftover text. */
const MONTH_NAME = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\b/i;
/** Any 1-2 digit number, with or without an ordinal suffix. Years are removed before this runs. */
const DAY_NUMBER = /\b\d{1,2}(st|nd|rd|th)?\b/i;

/**
 * Can this label be attributed to exactly ONE day?
 *
 * WHITELIST, not blacklist, and that inversion is the point. The previous version enumerated
 * signals that indicate a second day, and review found a new shape for six consecutive rounds --
 * two full dates, then a second weekday name, then an ordinal ("the 6th"), then a month-day with
 * no year ("/ May 6"). Every fix was correct and every one was another instance. A list of known
 * ways to say "another day" cannot be finished; the set of ways English writes a date is not
 * bounded by what a reviewer has thought of yet.
 *
 * So this asks the opposite question. Find the one month-day pair, remove every occurrence of it,
 * allow a single weekday name, and require what remains to contain NOTHING
 * day-shaped. Anything left over -- another month name, another number, an ordinal, a second
 * weekday -- means the label says something about days that this function did not understand, and
 * an ununderstood label is not safe to fold.
 *
 * Over-firing is the intended direction: a false positive costs a fully expanded agenda, which is
 * today's behaviour and what spec §1.1 calls acceptable. A false negative hides the day the viewer
 * came to see. Verified against the real corpus, including pdfjs glyph-split forms like
 * "Tuesday, March 2 4 , 202 6" (tests/crew/agendaDayForToday.test.ts), which collapse first and
 * pass.
 *
 * Zero pairs deliberately returns false: that is the unparseable case, and the null guard in the
 * caller owns it. Claiming it here would make that guard unreachable -- twice already in this file
 * a broader check upstream has silently killed a narrower one downstream.
 */
function isAmbiguousLabel(dayLabel: string): boolean {
  const collapsed = dayLabel.replace(/(?<=\d)\s+(?=\d)/g, "");

  const pairs = new Set<string>();
  const spans: [number, number][] = [];
  for (const m of collapsed.matchAll(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})\b/g)) {
    const month = MONTHS[m[1]!.toLowerCase().replace(/\.$/, "")];
    if (!month) continue;
    pairs.add(`${String(month).padStart(2, "0")}-${m[2]!.padStart(2, "0")}`);
    spans.push([m.index!, m.index! + m[0]!.length]);
  }
  if (pairs.size === 0) return false; // unparseable -- the caller's null guard owns this
  if (pairs.size > 1) return true;

  // Blank out every occurrence of the single date, then the year, then ONE weekday name.
  let rest = "";
  let cursor = 0;
  for (const [a, b] of spans) {
    rest += collapsed.slice(cursor, a);
    cursor = b;
  }
  rest += collapsed.slice(cursor);

  const weekdays = rest.match(WEEKDAYS) ?? [];
  if (new Set(weekdays.map((w) => w.toLowerCase().slice(0, 3))).size > 1) return true;
  rest = rest.replace(WEEKDAYS, " ");

  return MONTH_NAME.test(rest) || DAY_NUMBER.test(rest);
}

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

  // A row that names MORE THAN ONE distinct date cannot be assigned to a single day, and
  // `parseIsoFromDayLabel` hides that: it calls `.match()` without /g, so it reports only the
  // FIRST date it finds. A combined row like
  //   "Tuesday, May 5, 2026 / Wednesday, May 6, 2026"
  // reports itself as May 5, so a May 6 viewer folds it -- while it explicitly covers May 6.
  // Every row parses, so the unidentifiable-row guard below cannot see this.
  //
  // DISTINCT dates, not regex hits: a label may repeat one date ("Tuesday, May 5, 2026
  // (May 5, 2026 rehearsal)") and is still perfectly identifiable. Counting hits would fail
  // open on chatty labels and quietly disable the feature.
  if (extraction.days.some((day) => isAmbiguousLabel(day.dayLabel))) return ALL;

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
