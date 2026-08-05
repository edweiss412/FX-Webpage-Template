import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { adoptionBoundary, ROUND_THRESHOLD, isCountedStage } from "../lib/reviewRounds/constants";
import { readArcs } from "../lib/reviewRounds/corpus";
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
  /** Present when the corpus's earliest startedAt precedes the boundary, which
   *  means the declared constant is wrong. */
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
  const triggerRateByMonth: Report["triggerRateByMonth"] = {};
  for (const arc of arcs) {
    const byStage = new Map<string, ReviewRoundRow[]>();
    for (const row of arc.rows) {
      if (row.status !== "verdict" || !isCountedStage(row.stage)) continue;
      const group = byStage.get(row.stage);
      if (group) group.push(row);
      else byStage.set(row.stage, [row]);
    }
    for (const rows of byStage.values()) {
      const stamps = rows
        .map((r) => r.startedAt)
        .filter((s): s is string => s !== null)
        .sort();
      const month = (stamps[0] ?? "unknown").slice(0, 7);
      const bucket = triggerRateByMonth[month] ?? { population: 0, triggered: 0, rate: 0 };
      bucket.population += 1;
      if (new Set(rows.map((r) => r.round)).size >= ROUND_THRESHOLD) bucket.triggered += 1;
      bucket.rate = bucket.triggered / bucket.population;
      triggerRateByMonth[month] = bucket;
    }
  }

  // --- finding totals by stage ----------------------------------------------
  // `null` is EXCLUDED and counted on its own. Folding it into zero understates
  // every total and is indistinguishable from "no findings found".
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
      "merged-arc scan REFUSED: this is a shallow clone, so its history is truncated. The silent-arc list is withheld, not empty.",
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

  // The DECLARED boundary is never checked against the corpus, but a corpus that
  // predates it means the boundary is wrong, and saying so is cheaper than
  // deriving a number nothing can check.
  const earliest = arcs
    .flatMap((a) => a.rows)
    .map((r) => r.startedAt)
    .filter((s): s is string => s !== null)
    .sort()[0];
  const boundaryAdvisory =
    boundary !== null && earliest !== undefined && Date.parse(earliest) < Date.parse(boundary)
      ? `ADVISORY: the earliest recorded row (${earliest}) precedes the declared adoption boundary (${boundary}), so the boundary is wrong.`
      : null;

  return {
    arcs: arcRows,
    malformedRows,
    triggerRateByMonth,
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

  out.push("", `filing threshold: ${ROUND_THRESHOLD} counted rounds in one stage`, "");
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
