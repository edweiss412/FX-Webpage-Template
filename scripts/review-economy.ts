import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { adoptionBoundary, ROUND_THRESHOLD, isCountedStage } from "../lib/reviewRounds/constants";
import { arcSumTotals, type ArcSumTotal, readArcs } from "../lib/reviewRounds/corpus";
import { countedRounds, recordedRounds } from "../lib/reviewRounds/count";
import { mergedArcs, type MergedArc } from "../lib/reviewRounds/mergedArcs";
import type { ReviewRoundRow } from "../lib/reviewRounds/row";

export type StageCounts = { counted: number; recorded: number };
export type Report = {
  arcs: { branch: string; baseSha: string; stages: Record<string, StageCounts> }[];
  /** Lines `readArcs` REJECTED. Non-empty means every count in this report was
   *  computed over a partial corpus, and the arcs concerned say so beside their
   *  counts. Disclosed rather than refused: the rows that DID parse are real
   *  data, and disclosure is what separates a partial answer from one labelled
   *  complete. */
  malformedRows: { arc: string; file: string; line: number }[];
  /** One row per `(branch directory, stage)` whose rounds SUMMED across every
   *  base reach the threshold. `marked` comes from the gate's own predicate and
   *  is never recomputed here: a second copy of an obligation rule drifts from
   *  the first silently, which is what both spec-review findings on this report
   *  were. */
  arcTotals: ArcSumTotal[];
  triggerRateByMonth: Record<string, { population: number; triggered: number; rate: number }>;
  findingsByStage: Record<string, { total: number; declaredRows: number; undeclaredRows: number }>;
  /** null means WITHHELD - a shallow clone or an unset boundary. Never [] for
   *  those cases: an empty list is a completed scan that found nothing. */
  silentArcs: { branch: string; baseSha: string; sha: string; mergedAt: string }[] | null;
  /** null WHENEVER silentArcs is: both come out of the one merged-arc scan, so
   *  a run that refused the scan cannot report an authoritative 0 one line
   *  under the refusal. Never 0 for a scan that did not happen. */
  preAdoptionMergeCount: number | null;
  unrecognizedMerges: { sha: string; subject: string }[];
  shallow: boolean;
  /** Present when the corpus's chronologically earliest PLACEABLE startedAt
   *  precedes the boundary and no same-branch pre-adoption merge covers it.
   *  An observation with its causes left open, never a verdict on the constant:
   *  the adoption arc's own rows predate the boundary by construction. Withheld
   *  (null) whenever the merge scan refused, since the exclusion needs it. */
  boundaryAdvisory: string | null;
  notes: string[];
};

export type ReportOptions = {
  /** Defaults to `adoptionBoundary(repoRoot)`. Injectable because the production
   *  value is read from git and is null in every fixture repo. */
  adoptionBoundary?: string | null;
  /** Defaults to `mergedArcs(repoRoot).recognized`. Injectable because the
   *  silent-arc join needs merges no fixture repo's real history contains. */
  mergedArcs?: MergedArc[];
};

const arcKey = (branch: string, baseSha: string): string => `${branch}\u0000${baseSha}`;

// ---------------------------------------------------------------------------
// Timestamp placement for the boundary advisory (spec §3.1, §3.2).
// ---------------------------------------------------------------------------

/**
 * The accept-set for a `startedAt`, keyed on STRUCTURE (spec §3.2).
 *
 *  - An EXPLICIT offset, because a timezone-less string parses host-dependently:
 *    `2026-08-31T23:00:00` against the boundary `2026-09-01T00:00:00.000Z` is
 *    PRE-boundary under `TZ=UTC` and POST-boundary under `TZ=America/New_York`,
 *    so the same accepted row silently flips the advisory by environment.
 *  - The offset hour and minute BOUNDED to the real range. An unbounded
 *    `[+-]\d{2}:\d{2}` admits `+24:00` and `+00:60`, which `Date.parse` maps to
 *    NaN AFTER the structural test has already said "placeable" - every
 *    comparison then returns false with no note, which is silent invisibility.
 *  - Fractional seconds capped at MILLISECONDS, because ECMAScript compares at
 *    millisecond precision: a `.0001` past a `.000` merge parses EQUAL, and a
 *    chronologically-later row silently slips inside the exclusion cap.
 */
const PLACEABLE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?(Z|[+-](?:0\d|1[0-3]):[0-5]\d|[+-]14:00)$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const isLeapYear = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * The instant a timestamp denotes, or `null` when it cannot be placed. `null`
 * is the ONLY not-placeable signal: a NaN returned into a comparison makes
 * every `<=` false, which reads exactly like "compared and cleared".
 *
 * Three conditions, all of which must hold. The finite-parse net at the end is
 * what makes "placeable implies comparable" true BY CONSTRUCTION rather than by
 * enumerating parser quirks - any residual string the parser cannot place falls
 * out here rather than into a comparison.
 */
function instant(value: string | null): number | null {
  if (value === null) return null;
  const m = PLACEABLE.exec(value);
  if (m === null) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  // Calendar validity, because `Date.parse` SILENTLY NORMALIZES an impossible
  // date: `2026-02-30T00:00:00.000Z` becomes Mar 2 and then compares as a real
  // instant nobody wrote.
  if (month < 1 || month > 12) return null;
  const days = month === 2 && isLeapYear(year) ? 29 : (DAYS_IN_MONTH[month - 1] ?? 0);
  if (day < 1 || day > days) return null;
  if (Number(m[4]) > 23 || Number(m[5]) > 59 || Number(m[6]) > 59) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The two ordering helpers, and the ONLY way this module compares timestamps
 * (spec §3.1). TWO, not one: `<` and `<=` are both load-bearing - the strict
 * boundary check and the inclusive time cap - and collapsing them behind a
 * single helper would need a MODE parameter, which is a discriminating
 * parameter a mutant can flip, added to save a word.
 *
 * What makes this structural rather than per-site is the TYPE, not the count.
 * Both take `number | null` and `instant` is their only producer, so a
 * later-added site that forgets to parse is a COMPILE error rather than a
 * silent lexical compare - and valid ISO-8601 timestamps with non-Z offsets
 * order differently lexically than chronologically, so a lexical site is wrong
 * only under offsets, which is exactly the failure that ships unnoticed.
 * `tests/reviewRounds/advisoryComparatorTopology.test.ts` pins both halves: no
 * timestamp string is ever an operand of a relational operator here, and no
 * ordering helper accepts anything but parsed values.
 *
 * (This comment used to claim "The ONE comparator", two lines above the second
 * one. Corrected 2026-08-09 from the whole-diff review; the guard exists so the
 * claim cannot drift from the code again.)
 *
 * `null` on either side means NOT COMPARABLE, and the caller gets `false` -
 * never "equal", never "earlier".
 */
const atOrBefore = (a: number | null, b: number | null): boolean =>
  a !== null && b !== null && a <= b;

const strictlyBefore = (a: number | null, b: number | null): boolean =>
  a !== null && b !== null && a < b;

export function buildReport(repoRoot: string, opts: ReportOptions = {}): Report {
  const notes: string[] = [];
  const arcs = readArcs(repoRoot);
  const boundary =
    opts.adoptionBoundary !== undefined ? opts.adoptionBoundary : adoptionBoundary(repoRoot);

  // --- rounds per stage per arc, counted vs recorded, NEVER collapsed --------
  // Collapsing stages produces one number that cannot be compared against a
  // per-stage threshold, and counting every recorded row against it obliges an
  // arc on infra noise.
  const arcRows: Report["arcs"] = arcs.map((arc) => {
    const counted = countedRounds(arc.rows);
    const recorded = recordedRounds(arc.rows);
    const stages: Record<string, StageCounts> = {};
    for (const [stage, rowCount] of recorded) {
      stages[stage] = { counted: counted.get(stage) ?? 0, recorded: rowCount };
    }
    return { branch: arc.branch, baseSha: arc.baseSha, stages };
  });

  // --- malformed rows, surfaced rather than swallowed ------------------------
  // `readArcs` keeps every line it REJECTED, and the counts above are computed
  // from `arc.rows` alone - so a corpus with three good lines and one bad one
  // yields `diff 3/3` with nothing saying the input was partial, while the
  // merge gate reading the SAME file reports `malformed_row`. Two tools, one
  // corpus, contradictory answers. This does NOT refuse the way a shallow
  // clone does: the rows that parsed are real data, so the report DISCLOSES,
  // and disclosure is the whole difference between a partial answer and one
  // labelled complete.
  const malformedRows: Report["malformedRows"] = arcs.flatMap((arc) =>
    arc.malformed.map((bad) => ({
      arc: `${arc.branch} ${arc.baseSha}`,
      // `malformed` can only come from a .jsonl, so corpusPath is set; the
      // fallback keeps the field a real location rather than the string "null".
      file: arc.corpusPath ?? arc.dir,
      line: bad.line,
    })),
  );

  // --- trigger rate by month -------------------------------------------------
  // Population is (arc, stage) PAIRS that actually completed a review, not arcs.
  // A pair is bucketed by its FIRST counted row's month and counts as triggered
  // if it EVER crossed - a stage that began in one month and crossed in the next
  // must not land in two buckets, which is how a monthly rate exceeds 1.
  // Straight from the gate's predicate, never a second copy of the rule.
  const arcTotals = arcSumTotals(arcs);

  const triggerRateByMonth: Report["triggerRateByMonth"] = {};
  // Population is (branch DIRECTORY, stage) pairs, not (branch, baseSha, stage).
  // A re-merge opens a second file for the same arc, so counting per base
  // splits one review into two population entries and halves the rate. A pair
  // is bucketed by its DIRECTORY-WIDE first counted row and counts as triggered
  // if the ARC SUM ever crossed - a stage that began in one month and crossed
  // in the next must not land in two buckets, which is how a monthly rate
  // exceeds 1.
  const rowsByDirStage = new Map<string, ReviewRoundRow[]>();
  for (const arc of arcs) {
    for (const row of arc.rows) {
      if (row.status !== "verdict" || !isCountedStage(row.stage)) continue;
      const key = `${arc.branch}\u0000${row.stage}`;
      const group = rowsByDirStage.get(key);
      if (group) group.push(row);
      else rowsByDirStage.set(key, [row]);
    }
  }
  for (const rows of rowsByDirStage.values()) {
    const stamps = rows
      .map((r) => r.startedAt)
      .filter((s): s is string => s !== null)
      .sort();
    const month = (stamps[0] ?? "unknown").slice(0, 7);
    const bucket = triggerRateByMonth[month] ?? { population: 0, triggered: 0, rate: 0 };
    bucket.population += 1;
    // The ARC sum, so a stage that reached the threshold only ACROSS bases
    // counts as triggered - the very case this change exists for.
    if (new Set(rows.map((r) => `${r.baseSha}\u0000${r.round}`)).size >= ROUND_THRESHOLD) {
      bucket.triggered += 1;
    }
    bucket.rate = bucket.triggered / bucket.population;
    triggerRateByMonth[month] = bucket;
  }

  const findingsByStage: Report["findingsByStage"] = {};
  for (const arc of arcs) {
    for (const row of arc.rows) {
      const f = findingsByStage[row.stage] ?? { total: 0, declaredRows: 0, undeclaredRows: 0 };
      if (row.findingCount === null) f.undeclaredRows += 1;
      else {
        f.total += row.findingCount;
        f.declaredRows += 1;
      }
      findingsByStage[row.stage] = f;
    }
  }

  // --- silent arcs, adoption boundary, shallow refusal -----------------------
  const merges =
    opts.mergedArcs !== undefined
      ? { shallow: false, recognized: opts.mergedArcs, unrecognized: [] }
      : mergedArcs(repoRoot);

  const recorded = new Set(
    arcs.filter((a) => a.rows.length > 0).map((a) => arcKey(a.branch, a.baseSha)),
  );
  let silentArcs: Report["silentArcs"] = null;
  // Withheld TOGETHER with the list, because both are outputs of the one scan.
  // Initialised to 0 and left there on a refusal, this prints an authoritative
  // "pre-adoption merges: 0" one line below "silent arcs: WITHHELD" - a partial
  // answer labelled complete, immediately under a correct refusal to give one.
  let preAdoptionMergeCount: Report["preAdoptionMergeCount"] = null;

  if (merges.shallow) {
    // WITHHELD, not empty. A partial answer labelled complete is the §8.2
    // failure, and depth-1 is the normal CI state.
    notes.push(
      "merged-arc scan REFUSED: this is a shallow clone, so its history is truncated. The silent-arc list is withheld, not empty; the boundary advisory is withheld for the same reason.",
    );
  } else if (boundary === null) {
    // An unset boundary treated as the epoch accuses every pre-adoption merge in
    // one run, and the report prints that as fact.
    notes.push(
      "adoption boundary: not yet adopted. lib/reviewRounds/constants.ts is not on main, so no merge can be classified and the silent-arc list is withheld.",
    );
  } else {
    const silent: NonNullable<Report["silentArcs"]> = [];
    let preAdoption = 0;
    for (const merge of merges.recognized) {
      // Post-adoption is STRICTLY LATER than the boundary, so a merge whose
      // timestamp EQUALS it is pre-adoption. That equality is not a corner case
      // - it is this PR. The boundary is the committer date of the merge that
      // put lib/reviewRounds/constants.ts on main, so that merge's own arc
      // carries exactly this timestamp, and this arc has no corpus by ratified
      // design (spec §12). Under a strict `<` test it fell into the
      // post-adoption branch and the report listed the adoption merge itself as
      // silent. The contract goes live WITH that merge, not before it, so the
      // merge that establishes the boundary cannot be obliged by it.
      if (Date.parse(merge.mergedAt) <= Date.parse(boundary)) {
        // Reported as a COUNT, never enumerated (documented limit 7).
        preAdoption += 1;
        continue;
      }
      // Joined on (branch, baseSha), NEVER on branch alone: this repo has reused
      // three branch names across distinct PRs, and a branch-only join reads an
      // older arc's rows as evidence for a later one.
      if (recorded.has(arcKey(merge.branch, merge.baseSha))) continue;
      silent.push({
        branch: merge.branch,
        baseSha: merge.baseSha,
        sha: merge.sha,
        mergedAt: merge.mergedAt,
      });
    }
    // Both assigned here, on the ONE path where the scan actually ran.
    silentArcs = silent;
    preAdoptionMergeCount = preAdoption;
  }

  // --- boundary advisory (spec §3) -------------------------------------------
  // The DECLARED boundary is never checked against the corpus, but a corpus row
  // that predates it AND that no same-branch pre-adoption merge explains is a
  // signal worth printing, and saying so is cheaper than deriving a number
  // nothing can check.
  //
  // What the exclusion rule fixes: the wrapper started writing rows on the
  // adoption BRANCH hours before that branch merged, so the earliest live row
  // predates the boundary by construction. The contract cannot oblige rows
  // written before it went live, and those rows cannot indict the constant -
  // yet the previous message asserted "so the boundary is wrong" on every run.
  const allRows = arcs.flatMap((a) => a.rows);

  // Counted and NAMED whenever any exist, unconditionally - not only when the
  // advisory comes out null. A row the advisory could not place otherwise looks
  // exactly like a row it placed and cleared: `Date.parse` NaN makes every
  // comparison false, and a `null` startedAt is filtered, both in silence.
  const unplaceable = allRows.filter((r) => instant(r.startedAt) === null).length;
  if (unplaceable > 0) {
    notes.push(
      `${unplaceable} row(s) without a placeable startedAt are invisible to the boundary advisory.`,
    );
  }

  let boundaryAdvisory: Report["boundaryAdvisory"] = null;
  // Withheld under a shallow clone for the same reason the silent-arc list is:
  // the exclusion needs the merge classification, and that scan already refused.
  if (boundary !== null && !merges.shallow) {
    const boundaryAt = instant(boundary);

    // branch -> the CHRONOLOGICALLY LATEST pre-adoption merge on that branch.
    // Latest, because several pre-adoption merges of one branch must all be
    // covered by the last of them (spec §3.3); chronological, because a lexical
    // max picks whichever STRING sorts highest, which for offset-bearing
    // timestamps can be the earlier instant, stranding rows outside the cap.
    const capByBranch = new Map<string, number>();
    for (const m of merges.recognized) {
      const mergedAt = instant(m.mergedAt);
      // Pre-adoption under the existing `<=` carve-out: the merge that
      // establishes the boundary carries exactly that timestamp.
      if (!atOrBefore(mergedAt, boundaryAt)) continue;
      const current = capByBranch.get(m.branch);
      if (current === undefined || strictlyBefore(current, mergedAt)) {
        capByBranch.set(m.branch, mergedAt as number);
      }
    }

    // EXCLUDE FIRST, SELECT SECOND. Selecting the global earliest and then
    // nulling the advisory because that one row is covered silently suppresses
    // the signal from every LATER uncovered row (spec §4 case 13).
    let earliest: { at: number; startedAt: string } | null = null;
    for (const row of allRows) {
      const startedAt = row.startedAt;
      if (startedAt === null) continue;
      const at = instant(startedAt);
      if (at === null) continue;
      // Joined on branch + TIME, never on arcKey(branch, baseSha): mergedArcs
      // derives baseSha from the merge-base of the merge's two parents, so a
      // split arc's earlier segments can never match an exact key - which is
      // exactly the live case this rule exists for. Same branch only: a global
      // time cap would let any branch's merge explain any branch's row.
      const cap = capByBranch.get(row.branch);
      if (cap !== undefined && atOrBefore(at, cap)) continue;
      if (earliest === null || strictlyBefore(at, earliest.at)) earliest = { at, startedAt };
    }

    if (earliest !== null && strictlyBefore(earliest.at, boundaryAt)) {
      // Observation plus the open causes, never a verdict. It does NOT claim
      // the row's arc has no pre-adoption merge: a row that merely falls
      // outside its arc's time cap reaches this line WITH one, and that is the
      // case that keeps the reused-branch signal alive.
      boundaryAdvisory = `ADVISORY: the earliest recorded row (${earliest.startedAt}) precedes the declared adoption boundary (${boundary}) and no same-branch pre-adoption merge covers it — the boundary, the row's arc attribution, or the row's own timing is in question.`;
    }
  }

  return {
    arcs: arcRows,
    malformedRows,
    triggerRateByMonth,
    arcTotals,
    findingsByStage,
    silentArcs,
    preAdoptionMergeCount,
    unrecognizedMerges: merges.unrecognized,
    shallow: merges.shallow,
    boundaryAdvisory,
    notes,
  };
}

// ---------------------------------------------------------------------------
// CLI. Read-only, gates nothing, exit 0 always except on its own usage error.
// ---------------------------------------------------------------------------

export function render(report: Report): string {
  const out: string[] = ["review round economy", ""];

  out.push(`arcs recorded: ${report.arcs.length}`);
  for (const arc of report.arcs) {
    const stages = Object.entries(arc.stages)
      .map(([stage, c]) => `${stage} ${c.counted}/${c.recorded}`)
      .join("  ");
    const key = `${arc.branch} ${arc.baseSha}`;
    // The marker sits BESIDE the counts, never in a footnote further down. A
    // reader scanning this list must not be able to take a partial count for a
    // whole one, and a note they have to scroll to is one they may not reach.
    const bad = report.malformedRows.filter((m) => m.arc === key).length;
    const mark = bad > 0 ? `  INCOMPLETE (${bad} malformed row(s) excluded)` : "";
    out.push(`  ${key}  ${stages || "(no rows)"}${mark}`);
  }

  if (report.malformedRows.length > 0) {
    out.push("", `malformed rows, EXCLUDED from every count above: ${report.malformedRows.length}`);
    for (const m of report.malformedRows) out.push(`  ${m.file}:${m.line}  (${m.arc})`);
  }

  out.push(
    "",
    `filing threshold: ${ROUND_THRESHOLD} counted rounds in one stage, summed across every merge base of one arc`,
    "",
  );

  // L1 and L2. The totals line is the reason this report changed: without it
  // a reader sees two bases at 2 and 2 and no number anywhere equals the 4
  // the gate is about to oblige them for. The frozen count is STATED at zero
  // rather than omitted, so an empty exemption set reads as a measurement.
  out.push("rounds summed across every base of one arc:");
  for (const t of report.arcTotals) {
    const mark = t.marked ? "  OWES A FILING" : t.frozen ? "  frozen" : "";
    out.push(`  ${t.branch}  ${t.stage}  ${t.arcSum} across ${t.bases} bases${mark}`);
  }
  if (report.arcTotals.length === 0) out.push("  (none at threshold by sum)");
  out.push(
    "",
    `frozen by the arc-sum grandfather set: ${report.arcTotals.filter((t) => t.frozen).length}`,
  );
  out.push("");
  out.push("trigger rate by month (triggered / population):");
  for (const month of Object.keys(report.triggerRateByMonth).sort()) {
    const r = report.triggerRateByMonth[month]!;
    out.push(`  ${month}  ${r.triggered}/${r.population}  ${(r.rate * 100).toFixed(1)}%`);
  }

  out.push("", "declared findings by stage:");
  for (const stage of Object.keys(report.findingsByStage).sort()) {
    const f = report.findingsByStage[stage]!;
    out.push(
      `  ${stage}  total ${f.total} over ${f.declaredRows} declared row(s), ${f.undeclaredRows} undeclared`,
    );
  }

  out.push("");
  if (report.silentArcs === null) {
    // The withheld case reads differently from the clean one BY CONSTRUCTION.
    out.push("silent arcs: WITHHELD (see notes)");
  } else {
    out.push(`silent arcs: ${report.silentArcs.length}`);
    for (const a of report.silentArcs) out.push(`  ${a.branch} ${a.baseSha}  merged ${a.mergedAt}`);
  }
  out.push(
    report.preAdoptionMergeCount === null
      ? // A numeral here reads as a fact the scan never established, and it sits
        // one line under a refusal that got the same question right.
        "pre-adoption merges: WITHHELD (see notes)"
      : `pre-adoption merges (excluded, not enumerated): ${report.preAdoptionMergeCount}`,
  );

  if (report.unrecognizedMerges.length > 0) {
    out.push("", `unrecognized merge subjects: ${report.unrecognizedMerges.length}`);
    for (const u of report.unrecognizedMerges) out.push(`  ${u.sha.slice(0, 12)}  ${u.subject}`);
  }
  if (report.boundaryAdvisory !== null) out.push("", report.boundaryAdvisory);
  for (const note of report.notes) out.push("", note);
  return out.join("\n") + "\n";
}

export function main(argv: string[]): number {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write("usage: pnpm review:economy [--json]\n");
    return 0;
  }
  const unknown = argv.filter((a) => a !== "--json");
  if (unknown.length > 0) {
    process.stderr.write(`review:economy: unknown argument: ${unknown[0]}\n`);
    return 2;
  }
  const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim();
  const report = buildReport(repoRoot);
  process.stdout.write(
    argv.includes("--json") ? JSON.stringify(report, null, 2) + "\n" : render(report),
  );
  return 0;
}

// Guarded so importing this module from the test suite does not run the CLI.
const entry = process.argv[1];
if (entry !== undefined && fileURLToPath(import.meta.url) === resolve(entry)) {
  // `exitCode`, not `exit()` — writes to a pipe are async and `process.exit()`
  // discards whatever the buffer has not accepted, truncating piped output
  // non-deterministically. Same defect repaired in scripts/ledger-claims.ts,
  // where it was silently cutting the --json claim set at 8192 bytes.
  process.exitCode = main(process.argv.slice(2));
}
