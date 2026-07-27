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

/**
 * Can this label be attributed to exactly ONE day?
 *
 * HOW IT WORKS: find the single month-day pair, blank out every occurrence of it, drop years and
 * clock times, allow one weekday name and one ordinal-position phrase ("Day 1"), then require what
 * remains to contain nothing day-shaped — no second month name, number, ordinal, or weekday.
 *
 * WHAT IT IS NOT, stated plainly because an earlier revision of this comment claimed otherwise and
 * review R6 (HIGH) was right to reject the claim: **this is not a whitelist.** It rejects residual
 * text matching known day-shaped patterns; it does not require residual text to be recognised. So
 * arbitrary prose passes, and "Tuesday, May 5, 2026 and the following day" is folded as a plain
 * May 5 row. A true whitelist — one that only accepts a remainder it can parse — would reject
 * every real heading carrying a venue, track, or session name, which is most of them. That
 * trade is why this rule is shaped the way it is, and it is a genuine limitation rather than an
 * oversight.
 *
 * WHY IT IS STILL WORTH HAVING: six distinct counterexamples across review rounds R2-R5 were all
 * of the form "the label names a second day in a way the previous check did not recognise". This
 * closes every mechanical form of that — a second date, a second weekday, an ordinal, a month-day
 * without a year, the same month-day in two years — and leaves only free prose, which is tracked
 * as `BL-AGENDA-PROSE-SECOND-DAY`.
 *
 * Over-firing is the intended failure direction: a false positive costs a fully expanded agenda,
 * which is today's behaviour and what spec §1.1 calls acceptable, while a false negative hides the
 * day the viewer came to see. But over-firing is not free — it silently disables the feature — so
 * the realistic-single-day corpus in agendaViewerDays.test.ts guards that side, and it is what
 * caught month PREFIXES matching Marriott, Marketing, Augusta and Octagon.
 *
 * Zero month-day pairs deliberately returns false: that is the unparseable case, and the null
 * guard in the caller owns it. Claiming it here would make that guard unreachable — twice in this
 * file a broader check upstream has silently killed a narrower one downstream.
 */
function isAmbiguousLabel(dayLabel: string): boolean {
  const collapsed = dayLabel.replace(/(?<=\d)\s+(?=\d)/g, "");

  // SIGNAL 1 -- more than one distinct month-day. The year is intentionally not part of the key,
  // so "May 5, 2026 / May 6" counts as two (review R5).
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

  // SIGNAL 2 -- the same month-day in two YEARS (review R6). Only years sitting immediately
  // AFTER the date are counted: a free-floating year is metadata, not a second day, and counting
  // every four-digit token rejected "2025 Awards -- Tuesday, May 5, 2026" (review R7).
  const attachedYears = new Set(
    [...collapsed.matchAll(/\b[A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?\s*,?\s*(\d{4})\b/g)].map(
      (m) => m[1]!,
    ),
  );
  if (attachedYears.size > 1) return true;

  // Blank out every occurrence of the single date so the remaining checks see only the rest.
  let rest = "";
  let cursor = 0;
  for (const [a, b] of spans) {
    rest += collapsed.slice(cursor, a);
    cursor = b;
  }
  rest += collapsed.slice(cursor);

  // SIGNAL 3 -- two weekday names ("... / Wednesday", review R4).
  const weekdays = new Set((rest.match(WEEKDAYS) ?? []).map((w) => w.toLowerCase().slice(0, 3)));
  if (weekdays.size > 1) return true;

  // SIGNAL 4 -- two ordinal-position phrases. One ("Day 1 - Tuesday, May 5, 2026") is an
  // extremely common heading and names a single day; two ("... Day 1 / Day 2") do not. The
  // earlier version stripped them GLOBALLY, so any number of them passed (review R7).
  if ((rest.match(/\bday\s*#?\s*\d{1,2}\b/gi) ?? []).length > 1) return true;

  // SIGNAL 5 -- a PLURAL day span ("Days 1-2, May 5, 2026"). Its own signal now, and the reason
  // is worth keeping: the previous rule caught this only by accident, because a generic
  // "any leftover number" check tripped on the residual "-2". Removing that check to stop it
  // rejecting "Room 54" and "Track 2" (review R7) silently un-caught this, and the existing test
  // is what surfaced it. Singular "Day 1" stays a single day; plural does not.
  if (/\bdays\s*#?\s*\d/i.test(rest)) return true;

  // SIGNAL 6 -- a spoken ordinal date ("Wednesday the 6th", review R4). Requires the article,
  // which is what distinguishes it from ordinary numeric furniture: "8th Floor", "Track 2",
  // "Room 54", "Session 3" and clock times all name one day and must keep folding.
  return /\bthe\s+\d{1,2}(st|nd|rd|th)\b/i.test(rest);
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
