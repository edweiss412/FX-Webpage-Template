import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { MutantOutcome } from "./runner";

/**
 * The durable per-run sink (spec §5.2).
 *
 * The blind spot this closes is measured, not supposed: the repo's existing
 * record of its own verdict movement is CI-ONLY and FAILURE-ONLY, so the
 * surface with the cleanest reproduction in the corpus — three documented flips
 * on byte-identical inputs — appears ZERO times in it (spec §1.0). A record
 * inheriting either property would be no better than what it replaces, so this
 * one is written on success as well as failure and in local runs as well as CI.
 *
 * WHEN a record is written and WHETHER it survives are INDEPENDENT requirements
 * and satisfying one says nothing about the other. This module is the first
 * half; the `source-shards` upload in `.github/workflows/mutation-harness.yml`
 * is the second, without which the bytes die with the CI workspace.
 */

export const DEFAULT_RECORD_DIR = ".mutation-records";

/**
 * Per-surface retention, deliberately generous.
 *
 * `BACKLOG.md:108` instructs an operator to RE-RUN before acting on a stale-row
 * report, so a sink that kept only the latest would have the confirming run
 * silently destroy the evidence of the run that prompted it — the exact flip
 * case this record exists to make attributable. A cap that could evict run N-1
 * is therefore forbidden outright (AC-17), which is why `prune` refuses to go
 * below two per surface regardless of what is configured here.
 */
export const RETENTION_PER_SURFACE = 25;

/** The floor `prune` will not cross, whatever cap it is handed. */
export const MIN_RETAINED_PER_SURFACE = 2;

export type RunRecord = {
  surfaceId: string;
  /** The run discriminator; also the second component of the filename (AC-18). */
  runId: string;
  startedAt: string;
  passed: boolean;
  score: number;
  outcomes: readonly MutantOutcome[];
};

/**
 * The directory records are written into.
 *
 * `MUTATION_RECORD_DIR` redirects the WHOLE SET rather than one file, so a
 * determinism run can be pointed elsewhere and cannot mix its records into a
 * gate run's — contaminating the very channel built for attribution (AC-18).
 */
export function recordDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.MUTATION_RECORD_DIR;
  return override !== undefined && override !== "" ? override : DEFAULT_RECORD_DIR;
}

/**
 * A run discriminator that is unique per run and SORTS BY RECENCY as a string.
 *
 * The timestamp alone is not sufficient: two runs of the same surface inside one
 * millisecond would collide, and a collision here is an overwrite, which is the
 * single failure this sink exists to prevent.
 */
let counter = 0;
export function newRunId(now: number = Date.now()): string {
  counter += 1;
  const stamp = new Date(now).toISOString().replace(/[-:.]/g, "").replace("T", "-").slice(0, 15);
  return `${stamp}-${String(process.pid)}-${String(counter).padStart(4, "0")}`;
}

/**
 * The filename carries BOTH the surface id and the run discriminator, as
 * separately readable components rather than as an opaque token (AC-18): a
 * reader listing the directory can tell which surface and which run a file
 * belongs to without opening it, and `prune` can group by surface from the name.
 */
function encodeSegment(value: string): string {
  // `encodeURIComponent` leaves `.` UNTOUCHED, and `.` is this name's field
  // separator — so a dotted surface id parses back as a DIFFERENT, shorter
  // surface, and `prune` then groups unrelated surfaces into one bucket and
  // evicts their records as if they were superseded runs of a single surface.
  // Wrong attribution followed by evidence loss.
  return encodeURIComponent(value).replace(/\./g, "%2E");
}

export function recordFileName(surfaceId: string, runId: string): string {
  return `${encodeSegment(surfaceId)}.${encodeSegment(runId)}.json`;
}

/** The inverse of `recordFileName`, or `undefined` for a name this module did not write. */
export function parseRecordFileName(
  name: string,
): { surfaceId: string; runId: string } | undefined {
  if (!name.endsWith(".json")) return undefined;
  const stem = name.slice(0, -".json".length);
  const dot = stem.indexOf(".");
  if (dot <= 0 || dot === stem.length - 1) return undefined;
  const parsed = {
    surfaceId: decodeURIComponent(stem.slice(0, dot)),
    runId: decodeURIComponent(stem.slice(dot + 1)),
  };
  // Round-trip, so the documented contract — `undefined` for a name this module
  // did not write — is DERIVED from the writer rather than restated as a second
  // pattern that can drift away from it.
  if (recordFileName(parsed.surfaceId, parsed.runId) !== name) return undefined;
  return parsed;
}

/**
 * Drop the oldest records of each surface above `cap`, and NEVER the
 * immediately-previous run of any surface (AC-17).
 *
 * Keyed PER SURFACE rather than on total directory size: a size-keyed pruner
 * can evict both records of a quiet surface to make room for a noisy one, which
 * destroys exactly the comparison the sink exists to support.
 */
export function prune(dir: string, cap: number = RETENTION_PER_SURFACE): string[] {
  const effectiveCap = Math.max(cap, MIN_RETAINED_PER_SURFACE);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const bySurface = new Map<string, { name: string; runId: string }[]>();
  for (const name of names) {
    const parsed = parseRecordFileName(name);
    if (parsed === undefined) continue;
    const bucket = bySurface.get(parsed.surfaceId) ?? [];
    bucket.push({ name, runId: parsed.runId });
    bySurface.set(parsed.surfaceId, bucket);
  }
  const removed: string[] = [];
  for (const bucket of bySurface.values()) {
    // Newest first. `runId` leads with a fixed-width timestamp, so a lexical
    // sort IS a recency sort and no file has to be read to order the set.
    bucket.sort((a, b) => (a.runId < b.runId ? 1 : a.runId > b.runId ? -1 : 0));
    for (const stale of bucket.slice(effectiveCap)) {
      rmSync(join(dir, stale.name), { force: true });
      removed.push(stale.name);
    }
  }
  return removed;
}

export type WriteResult = { kind: "written"; path: string } | { kind: "failed"; reason: string };

/**
 * Write one run record.
 *
 * ADDITIVE BY CONTRACT (AC-14): a write failure is reported on stderr and
 * returns a typed failure. It never throws and never reaches the gate, because
 * a record that can red a green surface is a new way for the harness to lie
 * about the thing it was added to observe. Both halves are required — a silent
 * swallow rebuilds the blind spot, and an uncaught exception changes pass/fail.
 */
export function writeRunRecord(
  record: RunRecord,
  options: { dir?: string; env?: NodeJS.ProcessEnv; cap?: number } = {},
): WriteResult {
  const dir = options.dir ?? recordDir(options.env);
  const path = join(dir, recordFileName(record.surfaceId, record.runId));
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    process.stderr.write(
      `mutation record: could not write ${path} — ${reason}. ` +
        `This is ADDITIVE and does not change the gate's verdict; the run stands, ` +
        `the attribution record for it does not.\n`,
    );
    return { kind: "failed", reason };
  }
  try {
    prune(dir, options.cap);
  } catch (e) {
    process.stderr.write(
      `mutation record: wrote ${path} but could not prune ${dir} — ` +
        `${e instanceof Error ? e.message : String(e)}\n`,
    );
  }
  return { kind: "written", path };
}

/** Read one record back. Throws on a malformed file — a corrupt record is not a silent empty one. */
export function readRunRecord(path: string): RunRecord {
  return JSON.parse(readFileSync(path, "utf8")) as RunRecord;
}

/** Every record currently held for `surfaceId`, newest first. */
export function listRecords(dir: string, surfaceId?: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((n) => {
      const parsed = parseRecordFileName(n);
      return parsed !== undefined && (surfaceId === undefined || parsed.surfaceId === surfaceId);
    })
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

/**
 * The emit path `surfaceCases` calls, extracted so AC-12's four-cell matrix can
 * be driven IN-PROCESS.
 *
 * There is deliberately NO CONDITION here. The blind spot spec §1.0 measures is
 * a record that is CI-only and failure-only, so emission is unconditional on the
 * verdict, unconditional on the gate outcome and unconditional on the
 * environment. `passed && !CI` is the weaker implementation the AC names: it
 * satisfies a passing-local case AND a passing-case-with-CI-unset while omitting
 * passing CI runs entirely, which is why the proof is the MATRIX rather than two
 * points on it.
 */
export function emitRunRecord(input: {
  surfaceId: string;
  passed: boolean;
  score: number;
  outcomes: readonly MutantOutcome[];
  env?: NodeJS.ProcessEnv;
  dir?: string;
  cap?: number;
  now?: number;
}): WriteResult {
  return writeRunRecord(
    {
      surfaceId: input.surfaceId,
      runId: newRunId(input.now),
      startedAt: new Date(input.now ?? Date.now()).toISOString(),
      passed: input.passed,
      score: input.score,
      outcomes: input.outcomes,
    },
    {
      ...(input.dir === undefined ? {} : { dir: input.dir }),
      ...(input.env === undefined ? {} : { env: input.env }),
      ...(input.cap === undefined ? {} : { cap: input.cap }),
    },
  );
}
