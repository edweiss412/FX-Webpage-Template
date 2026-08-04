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
// `sat(ur)?` — the standard "Sat" abbreviation matched NOTHING while every other weekday had
// its short form, because the alternation required the full "satur" (review R10). Both the
// distinct-weekday count and the trailing check inherited the gap.
const WEEKDAY_SOURCE = "\\b(mon|tues?|wed(nes)?|thur?s?|fri|sat(ur)?|sun)(day)?\\b";
const WEEKDAYS = new RegExp(WEEKDAY_SOURCE, "gi");
/** Non-global twin: `.test()` on a /g regex is stateful and skips every other call. */
const WEEKDAYS_ANY = new RegExp(WEEKDAY_SOURCE, "i");

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
/** "26" and "2026" are the same year. One normalizer so every date shape agrees. */
const norm4 = (y: string | undefined): string | undefined =>
  y === undefined ? undefined : y.length === 2 ? `20${y}` : y;

function isAmbiguousLabel(dayLabel: string): boolean {
  const collapsed = dayLabel.replace(/(?<=\d)\s+(?=\d)/g, "");

  // SIGNAL 1 -- more than one distinct calendar day, in ANY of the shapes a date gets written.
  // The month-name form is what the parser reads; the rest are here because review R8 listed
  // them as second-day forms the earlier version missed.
  const days = new Set<string>();
  const years = new Set<string>();
  const spans: [number, number][] = [];
  // The YEAR is recorded separately from the month-day key, and by EVERY form. Keying dates on
  // month-day alone is what lets "May 5, 2026 / May 5, 2027" read as one day; recovering years
  // from only the month-led form (the previous fix) left the same hole open whenever the two
  // dates use different shapes -- "May 5, 2026 / 2027-05-05", "/ 5 May 2027", "/ 05/05/2027"
  // all slipped through (review R9). A missing year matches anything and is simply not recorded.
  const add = (key: string, m: RegExpMatchArray, year?: string) => {
    days.add(key);
    if (year) years.add(year);
    spans.push([m.index!, m.index! + m[0]!.length]);
  };
  for (const m of collapsed.matchAll(
    /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/g, // "May 5", "May 6th"
  )) {
    const mo = MONTHS[m[1]!.toLowerCase().replace(/\.$/, "")];
    if (mo) {
      // Two-digit and apostrophe years ("May 8, 26", "May 8, '26") count too. The slash form
      // already normalized them, so omitting them here was an inconsistency INSIDE the accepted
      // domain, not a scope boundary (review R10).
      const after = collapsed.slice(m.index! + m[0]!.length).match(/^\s*,?\s*'?(\d{4}|\d{2})\b/);
      add(`${String(mo).padStart(2, "0")}-${m[2]!.padStart(2, "0")}`, m, norm4(after?.[1]));
    }
  }
  // Day-first REQUIRES a year, and that is not cosmetic. Without it the pattern is just
  // "<number> <word>", which matched the number in "Day 1 May 5, 2026", "Session 3 May 5, 2026",
  // "Room 12 May 5, 2026" and the pdfjs glyph-split "2 6 May 5, 2026" -- reading a phantom second
  // date into four ordinary headings and unfolding them. Found by re-reading the function whole
  // rather than by a failing test, which is why the corpus cases below now cover it.
  for (const m of collapsed.matchAll(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?\s*,?\s*'?(\d{4}|\d{2})\b/g, // "6 May 2026"
  )) {
    const mo = MONTHS[m[2]!.toLowerCase().replace(/\.$/, "")];
    if (mo) add(`${String(mo).padStart(2, "0")}-${m[1]!.padStart(2, "0")}`, m, norm4(m[3]));
  }
  // Numeric dates as a FAMILY: both orders (year-first, month-first) times all three separators
  // (slash, dash, dot), with 1-or-2-digit fields. The previous version knew exactly two members
  // -- month-first slash and strict two-digit ISO -- so "2026/05/06", "05-06-2026", "05.06.2026"
  // and "2026-5-6" each read as ZERO dates and a combined row folded for the viewer whose day it
  // names (review R12, and the same shape as R8's slash/ISO findings -- swept as a class this
  // time). The backreference requires ONE separator per date, so a mixed "5/6-2026" stays unread
  // and lands in the caller's null guard. Day-vs-month order inside the month-first form is not
  // resolved (a European "06.05.2026" keys as 06-05): for THIS question a different key in either
  // reading means a second day, and the mismatch only ever fires toward fail-open.
  for (const m of collapsed.matchAll(/\b(\d{4})([/.-])(\d{1,2})\2(\d{1,2})\b/g)) {
    add(`${m[3]!.padStart(2, "0")}-${m[4]!.padStart(2, "0")}`, m, m[1]); // "2026/05/06", "2026-5-6"
  }
  for (const m of collapsed.matchAll(/\b(\d{1,2})([/.-])(\d{1,2})\2(\d{2,4})\b/g)) {
    add(`${m[1]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`, m, norm4(m[4])); // "05-06-2026"
  }
  // Day-first with NO year -- "/ 6 May" (review R12). The year requirement above exists because
  // a bare "<number> <month>" reads phantom dates out of "Day 1 May 5, 2026" and its corpus
  // siblings. What actually separates those from a real trailing "6 May" is what FOLLOWS the
  // month name: a digit there means the month starts its own month-led date, so the leading
  // number belongs to something else ("Day 1", "Room 12", a glyph-split "2 6"). The same
  // lookahead cedes "6 May 2026" and "6 May '27" to the with-year scan above, which records
  // their year; this form has none to record.
  for (const m of collapsed.matchAll(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\b\.?(?!\s*,?\s*'?\d)/g,
  )) {
    const mo = MONTHS[m[2]!.toLowerCase()];
    if (mo) add(`${String(mo).padStart(2, "0")}-${m[1]!.padStart(2, "0")}`, m);
  }
  if (days.size === 0) return false; // unparseable -- the caller's null guard owns this
  if (days.size > 1) return true;

  // SIGNAL 2 -- the same month-day in two YEARS. Only years attached to a MONTH-led date count.
  if (years.size > 1) return true; // the same month-day in two different years

  // COUNT **AND** POSITION. Both were tried alone across review rounds R4-R8 and each is
  // insufficient in a way the other covers:
  //
  //   counting alone   missed "May 5, 2026 / Wednesday" -- ONE weekday, because the primary
  //                    date carries none, so no "more than one" threshold fires (R8).
  //   position alone   misses "Wednesday / Tuesday, May 5, 2026" -- the second day LEADS the
  //                    date, so examining only trailing text sees nothing. Found by sweeping
  //                    leading forms after the positional rewrite; five such labels leaked.
  //
  // So a day-token is ambiguous if it appears more than once ANYWHERE, or if it appears at all
  // AFTER the date. Text before the date may qualify it ("Tuesday, ...", "Day 1 - ..."); a
  // SECOND such token cannot be qualifying anything.
  const lastSpanEnd = Math.max(...spans.map(([, end]) => end));
  const trailing = collapsed.slice(lastSpanEnd);

  const weekdaysAll = new Set(
    (collapsed.match(WEEKDAYS) ?? []).map((w) => w.toLowerCase().slice(0, 3)),
  );
  if (weekdaysAll.size > 1) return true; // "Wednesday / Tuesday, ...", "Wed-Thu, ...", "Mon/Tue"
  if (WEEKDAYS_ANY.test(trailing)) return true; // "... / Wednesday"

  if (/\bdays\s*#?\s*\d/i.test(collapsed)) return true; // a plural span, wherever it sits
  const dayNs = collapsed.match(/\bday\s*#?\s*\d{1,2}\b/gi) ?? [];
  if (dayNs.length > 1) return true; // "... Day 1 / Day 2"
  // A TRAILING Day-N is deliberately NOT a signal. "Tuesday, May 5, 2026 — Day 1" names one
  // day, and so do "Show Day 1" and "(Travel Day 2)" -- review R9 showed the trailing rule
  // rejected all three, and because ambiguity is checked with `.some()`, ONE such heading
  // unfolds the entire link. This reverses a call made in R8, where "May 5, 2026 / Day 2" was
  // read as a second day. Both readings are defensible; a trailing Day-N naming the date it
  // follows is far more common in real agendas, and the over-fire is the worse failure because
  // it silently disables the feature rather than merely showing more than necessary. Two Day-N
  // phrases are still ambiguous, which is what catches the genuine list case.

  // A spoken ordinal date, anywhere. An ordinal FOLLOWED BY A NOUN modifies that noun
  // ("The 8th Floor", "The 2nd Session") and is not a date; that lookahead is the whole
  // discriminator, and it is why this can safely scan the entire label rather than the tail.
  // The follower must be CAPITALIZED to count as the noun being modified. An earlier version
  // excluded any following word, which also swallowed "the 6th and Tuesday, May 5, 2026" -- a
  // real second-day reference whose only signal is this ordinal. Note the missing /i flag: with
  // it, `[A-Z]` would match lowercase too and the lookahead would exclude everything, so the
  // ordinal suffixes are spelled in both cases instead.
  return /\b\d{1,2}(?:st|nd|rd|th|ST|ND|RD|TH)\b(?!\s+[A-Z])/.test(collapsed);
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
  //
  // DOCUMENTED LIMIT (demoted from BACKLOG.md 2026-08-04 under the AGENTS.md ledger filing bar;
  // `BL-AGENDA-PERLINK-COMPLETENESS` is archived in BACKLOG-archive.md with the full body).
  // `R` is the SHOW-WIDE restricted day set, so completeness is judged show-wide even though this
  // function is called once per agenda link. A show whose agenda PDFs are DATE-PARTITIONED across
  // links — link A covering day 1, link B covering day 2 — therefore fails completeness on both and
  // shows every day on both. Per-link completeness is probably the right rule, and PR #610 chose
  // deliberately not to change it. It stays a limit rather than queue work because the failure is
  // FAIL-OPEN: the viewer sees more than their assignment, never less, so no day is ever hidden by
  // this. Probed 2026-08-04 — the corpus holds two multi-agenda-link show fixtures, only one of
  // which has two PDFs, and zero date-partitioned multi-extraction instances anywhere.
  // UN-DEFER TRIGGER: a real show ships date-partitioned agenda PDFs across links. The repair is
  // per-link completeness, with the invariant search in `tests/agenda/agendaViewerDaysInvariant.test.ts`
  // extended to multi-link fixtures FIRST — it has no multi-link case today.
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
