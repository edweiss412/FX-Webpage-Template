import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expectedIdentities } from "./capture-evidence";
import { EVIDENCE_FILENAME } from "./help-screenshots";

/** The four fields that reach the capture only through a docker passthrough. */
const PASSTHROUGH_FIELDS = ["eventName", "runnerName", "runnerArch", "runnerOs"] as const;

const PRE_ENCODE = ["pixelWidth", "pixelHeight", "pixelSha256"] as const;
const POST_ENCODE = ["webpBytes", "webpSha256"] as const;

type Entry = Record<string, unknown> & { key?: unknown; theme?: unknown };

function identityOf(entry: Entry): string {
  return `${String(entry.key)}-${String(entry.theme)}`;
}

function isRefused(entry: Entry): boolean {
  return entry.refusedReason !== null && entry.refusedReason !== undefined;
}

/**
 * Check an evidence record, BRANCHING ON THE RUN'S OUTCOME.
 *
 * Two traps pull in opposite directions here.
 *
 * A null-heavy record — every entry present, runner fields set, every
 * post-encode field null — satisfies "no short record, no empty runner, no
 * non-null-on-refused" while describing a run that encoded nothing.
 *
 * But demanding a full-length record is equally wrong: the capture ABORTS on
 * the first refusal, so a short record is the CORRECT shape for a genuine
 * refusal, and a parser rejecting it would fail every one of them while
 * satisfying a carelessly worded acceptance criterion.
 *
 * So: a clean run must be complete; a refused run must end with exactly one
 * refused entry, every earlier entry complete and none after it.
 *
 * `local` waives the four passthrough fields, which cannot exist off a runner,
 * and NOTHING else — a mode that waives more is a mode that satisfies the AC
 * without the instrument working.
 */
export function verifyEvidence(
  record: unknown,
  expected: string[],
  opts: { local?: boolean },
): string[] {
  const problems: string[] = [];
  // A non-object record is a DIFFERENT failure from a malformed one, and the
  // cast alone does not save the property read: `null` and a bare string both
  // reach `run.entries` and throw a TypeError, which surfaces as a crashed
  // parser step rather than as the problem list this function exists to return.
  if (typeof record !== "object" || record === null || Array.isArray(record)) {
    return [
      `capture evidence record is not a JSON object (got ${record === null ? "null" : typeof record})`,
    ];
  }
  const run = record as Record<string, unknown>;
  const entries = (Array.isArray(run.entries) ? run.entries : []) as Entry[];

  if (opts.local !== true) {
    for (const field of PASSTHROUGH_FIELDS) {
      if (typeof run[field] !== "string" || run[field] === "") {
        problems.push(
          `${field} is empty; the docker step must forward it with a value-less -e ${field}`,
        );
      }
    }
  }

  const identities = entries.map(identityOf);
  const duplicates = identities.filter((id, i) => identities.indexOf(id) !== i);
  if (duplicates.length > 0) {
    problems.push(`duplicate identities: ${[...new Set(duplicates)].join(", ")}`);
  }

  const refusedAt = entries.findIndex(isRefused);

  if (refusedAt === -1) {
    const missing = expected.filter((id) => !identities.includes(id));
    if (missing.length > 0) {
      problems.push(`clean run is missing identities: ${missing.join(", ")}`);
    }
  } else {
    if (refusedAt !== entries.length - 1) {
      problems.push(
        `entries recorded after the refused entry ${identityOf(entries[refusedAt]!)}: ` +
          `${entries
            .slice(refusedAt + 1)
            .map(identityOf)
            .join(", ")}`,
      );
    }
    const refused = entries[refusedAt]!;
    if (typeof refused.refusedReason !== "string" || refused.refusedReason === "") {
      problems.push(`${identityOf(refused)} is refused but names no refusedReason`);
    }
    for (const field of POST_ENCODE) {
      if (refused[field] !== null) {
        problems.push(
          `${identityOf(refused)} is refused but carries post-encode ${field}; ` +
            "a refusal writes no image, so bytes mean the check ran after the write",
        );
      }
    }
  }

  const completeThrough = refusedAt === -1 ? entries.length : refusedAt;
  const completed = entries.slice(0, completeThrough);
  for (const entry of completed) {
    for (const field of [...PRE_ENCODE, ...POST_ENCODE]) {
      if (entry[field] === null || entry[field] === undefined) {
        problems.push(`${identityOf(entry)} is complete but ${field} is missing`);
      }
    }
  }

  // Layer 2's PREMISE, asserted on the record rather than assumed.
  //
  // `checkGeometry` records a SKIP when it finds no committed baseline, which is
  // right on its own: certifying a comparison that never happened would let every
  // new manifest entry pass its own first run. But nothing read the skip back, so
  // if the baseline naming or the output directory ever moves, EVERY entry skips,
  // the geometry layer performs zero comparisons, and the run is green. A layer
  // that silently checks nothing is the failure mode this repo has a rule about.
  //
  // One skip is ordinary (a newly added manifest entry). ALL of them, on a run
  // that completed entries at all, means the baselines were not where the layer
  // looked -- so that is the condition, and it cannot fire on an empty set.
  const skipped = completed.filter(
    (entry) => (entry as Record<string, unknown>).geometrySkippedReason !== undefined,
  );
  if (completed.length > 0 && skipped.length === completed.length) {
    problems.push(
      `layer 2 compared nothing: all ${completed.length} completed entries record ` +
        `geometrySkippedReason (${[...new Set(skipped.map((e) => String((e as Record<string, unknown>).geometrySkippedReason)))].join(", ")}). ` +
        "One skip is a new manifest entry; every entry skipping means the baselines were not where the layer looked",
    );
  }

  return problems;
}

/**
 * The absent-record branch, as its own exported decision.
 *
 * An absent record is not a malformed one, and a raw ENOENT stack tells an
 * operator nothing about which of the two they are looking at. It is exported
 * rather than inlined into `main` because `main` is reachable only by running
 * the script, so an inlined branch could only be tested by spawning a process
 * -- and an untestable branch is how a message like this rots into a stale path
 * nobody notices. The caller owns the exit; this owns only the verdict.
 */
export function absentRecordProblem(path: string): string[] | null {
  if (existsSync(path)) return null;
  return [
    `no capture evidence record at ${path}`,
    // Deliberately does NOT assume the operator forgot to run the capture. In
    // CI this step is `if: always()`, so it also runs when something upstream
    // failed before the capture started, and an unconditional "produce one
    // with ..." is then a second red step blaming a person for a build fault.
    "the capture writes this record. If an earlier step failed, that failure is the cause and this is a symptom; if you are running locally, produce one with `pnpm screenshot:help`",
  ];
}

function main(): void {
  const local = process.argv.includes("--local");
  const path = join(process.cwd(), "public/help/screenshots", EVIDENCE_FILENAME);

  const absent = absentRecordProblem(path);
  if (absent !== null) {
    for (const line of absent) console.error(line);
    process.exit(1);
  }

  const problems = verifyEvidence(
    JSON.parse(readFileSync(path, "utf8")),
    expectedIdentities(),
    local ? { local: true } : {},
  );

  if (problems.length > 0) {
    console.error(`capture evidence record is not acceptable (${path}):`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log(`capture evidence record OK (${local ? "local" : "ci"})`);
}

if ((process.argv[1] ?? "").endsWith("scripts/verify-capture-evidence.ts")) main();
