import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expectedIdentities } from "./capture-evidence";
import { STAGING_DIR_NAME } from "./capture-evidence";
import { EVIDENCE_FILENAME } from "./help-screenshots";

/** The four fields that reach the capture only through a docker passthrough. */
const PASSTHROUGH_FIELDS = ["eventName", "runnerName", "runnerArch", "runnerOs"] as const;

const POST_ENCODE = ["webpBytes", "webpSha256"] as const;

/** A sha256 hex digest, which is what both hash fields claim to be. */
const SHA256 = /^[0-9a-f]{64}$/;

/**
 * TYPED predicates, not presence checks.
 *
 * Round 1 of the whole-diff review repaired this validator by adding
 * presence checks, and round 2 showed why that was the wrong altitude: every
 * one of them asked "is the field there" while the interesting failures are
 * "is it the right KIND of thing". A numeric `pixelSha256` skipped the digest
 * check entirely, because that check was guarded by `typeof value === "string"`
 * and so declined to fire on exactly the values that most needed it. Dimensions
 * arrived as strings, and as negative numbers. `faultHits` arrived as a string.
 *
 * A validator that only rejects absence certifies any record whose fields exist,
 * which is close to certifying nothing. These are the shape AND the domain.
 */
const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isSha256 = (v: unknown): v is string => isNonEmptyString(v) && SHA256.test(v);
const isPositiveInt = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v > 0;
const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

/** Field name to the predicate its value must satisfy on a COMPLETED entry. */
const COMPLETED_FIELD_TYPES: Record<string, (v: unknown) => boolean> = {
  pixelWidth: isPositiveInt,
  pixelHeight: isPositiveInt,
  webpBytes: isPositiveInt,
  pixelSha256: isSha256,
  webpSha256: isSha256,
};

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

  if (!isNonEmptyString(run.cpuModel)) {
    problems.push(
      `cpuModel is missing or not a non-empty string; the record cannot say what machine produced it`,
    );
  }
  if (!isPositiveInt(run.cpuCount)) {
    problems.push(
      `cpuCount is missing or not a positive integer; got ${JSON.stringify(run.cpuCount)}`,
    );
  }

  if (opts.local !== true) {
    for (const field of PASSTHROUGH_FIELDS) {
      if (!isNonEmptyString(run[field])) {
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
    // AC-5 asks for identity EQUALITY, and equality has two directions. Checking
    // only the missing half accepts a record describing captures the manifest
    // never asked for, which is the same defect the capture's own oracle had.
    const missing = expected.filter((id) => !identities.includes(id));
    if (missing.length > 0) {
      problems.push(`clean run is missing identities: ${missing.join(", ")}`);
    }
    const unexpected = identities.filter((id) => !expected.includes(id));
    if (unexpected.length > 0) {
      problems.push(
        `clean run recorded identities the manifest does not expect: ${unexpected.join(", ")}`,
      );
    }
  } else {
    // A refused run's COMPLETED PREFIX still has to match the manifest in order,
    // or the record describes a different run that happened to stop somewhere.
    const prefix = identities.slice(0, refusedAt);
    const expectedPrefix = expected.slice(0, refusedAt);
    if (prefix.join("|") !== expectedPrefix.join("|")) {
      problems.push(
        `refused run's completed prefix does not match the manifest order: ` +
          `got ${prefix.join(", ") || "none"}, expected ${expectedPrefix.join(", ") || "none"}`,
      );
    }
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

    // The refused entry is an identity too. Checking only the prefix let a
    // record certify a refusal attributed to a capture the manifest never
    // requested, which breaks the attribution guarantee the consequence bound
    // rests on: every refusal names the entry it refused.
    const refusedIdentity = identityOf(refused);
    const expectedRefused = expected[refusedAt];
    if (expectedRefused === undefined) {
      problems.push(
        `refused entry ${refusedIdentity} sits at position ${refusedAt}, past the ${expected.length} the manifest expects`,
      );
    } else if (refusedIdentity !== expectedRefused) {
      problems.push(
        `refused entry is ${refusedIdentity} but the manifest expects ${expectedRefused} at that position`,
      );
    }

    if (!isNonEmptyString(refused.refusedReason)) {
      problems.push(`${refusedIdentity} is refused but names no refusedReason`);
    }

    // A refusal has to carry the evidence its OWN reason promises. Both of
    // these were accepted before: an absence with nothing naming what was
    // absent, and a fault refusal with no fault.
    if (refused.refusedReason === "selector-absent" && !isNonEmptyString(refused.absentSelector)) {
      problems.push(
        `${refusedIdentity} refused as selector-absent but names no absentSelector; ` +
          "spec section 4.2.1 requires the missing selector in the entry",
      );
    }
    // Each reason's obligation, ENUMERATED rather than expressed as "everything
    // except selector-absent". That negation was wrong for three of the five
    // shapes the capture actually emits, and it made the always-run CI verifier
    // reject VALID records:
    //
    //   selector-absent        markers, possibly empty (an unmarked replacement
    //                          still refuses) -> needs absentSelector, checked above
    //   RenderFaultError       reasons, non-empty by construction -> needs faultHits
    //   GeometryMismatchError  no hits, carries dimensions instead -> needs geometry
    //   any other error.name   no hits (navigation, post-selector quiescence,
    //                          screenshot, encode, file-write) -> no extra obligation
    //   "unknown"              a non-Error throw -> no extra obligation
    //
    // Writing it as a table is the point: a negation silently acquires every new
    // reason, and gets it wrong by default.
    if (refused.refusedReason === "RenderFaultError") {
      if (!isStringArray(refused.faultHits) || refused.faultHits.length === 0) {
        problems.push(
          `${refusedIdentity} refused as RenderFaultError but records no faultHits; ` +
            "that reason means a marked fault was seen, so the markers are the evidence for it",
        );
      }
    }
    if (refused.refusedReason === "GeometryMismatchError") {
      const g = refused.geometry;
      const dims = typeof g === "object" && g !== null ? (g as Record<string, unknown>) : null;
      const bad =
        dims === null ||
        !["baselineWidth", "baselineHeight", "capturedWidth", "capturedHeight"].every((k) =>
          isPositiveInt(dims[k]),
        );
      if (bad) {
        problems.push(
          `${refusedIdentity} refused as GeometryMismatchError but carries no usable geometry: ` +
            `${JSON.stringify(refused.geometry)}. Spec section 6 makes the observed dimensions the ` +
            "narrowing evidence a geometry refusal exists to provide",
        );
      }
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

  // EVERY entry, refused or not, carries these. A refusal still happened at a
  // time, still ran under a frozen clock, and still reports its markers.
  for (const entry of entries) {
    if (!isNonEmptyString(entry.capturedAtUtc)) {
      problems.push(
        `${identityOf(entry)} has no usable capturedAtUtc: ${JSON.stringify(entry.capturedAtUtc)}`,
      );
    }
    if (!isNonEmptyString(entry.frozenClockInstant)) {
      problems.push(
        `${identityOf(entry)} has no usable frozenClockInstant: ${JSON.stringify(entry.frozenClockInstant)}`,
      );
    }
    if (!isStringArray(entry.faultHits)) {
      problems.push(
        `${identityOf(entry)} faultHits is not an array of strings: ${JSON.stringify(entry.faultHits)}`,
      );
    }
  }

  const completeThrough = refusedAt === -1 ? entries.length : refusedAt;
  const completed = entries.slice(0, completeThrough);
  for (const entry of completed) {
    // One typed pass, not a presence pass plus a shape pass. The two-pass form
    // is what let a numeric hash through: the shape check declined to fire on a
    // non-string, which is precisely the value it should have rejected.
    for (const [field, isValid] of Object.entries(COMPLETED_FIELD_TYPES)) {
      if (!isValid(entry[field])) {
        problems.push(
          `${identityOf(entry)} is complete but ${field} is not valid: ${JSON.stringify(entry[field])}`,
        );
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
 * AC-5's staging-artifact hash comparison, as its own exported decision.
 *
 * The record claims a `webpSha256` per completed entry. Nothing checked that
 * claim against the bytes actually produced, so a record could name digests
 * belonging to no file on disk and still pass. The staging directory is the
 * right comparison target rather than the published one: it is emptied at the
 * START of every run and never at the end, so what sits in it is exactly what
 * THIS run wrote, which is the provenance property the published directory
 * cannot offer.
 *
 * Exported and pure so it is testable without a capture; `main` supplies the
 * real directory.
 */
export function verifyStagingHashes(
  entries: readonly Entry[],
  stagingDir: string,
  // Returns null for an artifact that is not there. ONE injected accessor rather
  // than a reader plus a real `existsSync`: a hidden filesystem call inside a
  // function documented as pure is untestable, and the first version had exactly
  // that, so a fake path short-circuited before any comparison ran.
  readArtifact: (path: string) => Buffer | null,
): string[] {
  const problems: string[] = [];
  for (const entry of entries) {
    if (isRefused(entry)) continue;
    const claimed = entry.webpSha256;
    if (!isSha256(claimed)) {
      // Skipping here was the same defect one layer down: a malformed claim
      // silently waived the comparison that exists to check it.
      problems.push(
        `${identityOf(entry)} claims a webpSha256 that is not a digest, so it cannot be compared: ${JSON.stringify(claimed)}`,
      );
      continue;
    }
    const artifact = join(stagingDir, `${identityOf(entry)}.webp`);
    const bytes = readArtifact(artifact);
    if (bytes === null) {
      problems.push(
        `${identityOf(entry)} claims a webpSha256 but no staging artifact exists at ${artifact}`,
      );
      continue;
    }
    const actual = createHash("sha256").update(bytes).digest("hex");
    if (actual !== claimed) {
      problems.push(
        `${identityOf(entry)} webpSha256 does not match its staging artifact: ` +
          `record says ${claimed}, bytes hash to ${actual}`,
      );
    }
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

  const record: unknown = JSON.parse(readFileSync(path, "utf8"));
  const stagingDir = join(process.cwd(), STAGING_DIR_NAME);
  const stagingProblems = existsSync(stagingDir)
    ? verifyStagingHashes((record as { entries?: Entry[] })?.entries ?? [], stagingDir, (f) =>
        existsSync(f) ? readFileSync(f) : null,
      )
    : local
      ? []
      : [
          `no staging directory at ${stagingDir}; AC-5's artifact hash comparison could not run. ` +
            "It is emptied at the start of a capture and left in place, so its absence means no capture ran here",
        ];

  const problems = verifyEvidence(
    record,
    expectedIdentities(),
    local ? { local: true } : {},
  ).concat(stagingProblems);

  if (problems.length > 0) {
    console.error(`capture evidence record is not acceptable (${path}):`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log(`capture evidence record OK (${local ? "local" : "ci"})`);
}

if ((process.argv[1] ?? "").endsWith("scripts/verify-capture-evidence.ts")) main();
