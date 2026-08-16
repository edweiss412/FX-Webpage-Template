import { basename } from "node:path";

/** Worker entrypoints, verified present in this checkout (spec §4.2a). */
export const WORKER_ENTRYPOINTS = [
  "vitest/dist/workers/forks.js",
  "vitest/dist/workers/threads.js",
  "vitest/dist/workers/vmForks.js",
  "vitest/dist/workers/vmThreads.js",
  "vitest/dist/workers/runVmTests.js",
  "playwright/lib/worker/workerMain.js",
  "next/dist/compiled/jest-worker/processChild.js",
] as const;

/** Spec §4.3. The only definition of the ceiling. */
export const DEFAULT_MIN_AGE_SECONDS = 14400;

export type ParsedRow = {
  kind: "parsed";
  pid: number;
  ppid: number | null;
  etimeSeconds: number | null;
  /** R5. The classification-time half of K2's identity triple, from the SAME read that classified. */
  startedAt: string | null;
  command: string;
};
export type UnparsableRow = { kind: "unparsable"; raw: string; problem: string };
export type ProcRow = ParsedRow | UnparsableRow;

export type ReapConfig = {
  // No clock field: `etime` is already an ELAPSED duration, so the age clause compares two
  // durations. See the spec's §5 note.
  minAgeSeconds: number;
  minAgeSource: "default" | "env";
  minAgeRejected?: string;
  selfPid: number;
  selfAncestry: readonly number[];
};

/** `undecidable` covers R2, R3 and R5. */
export type Skip = "not-a-worker" | "has-live-parent" | "too-young" | "self" | "undecidable";

export type Decision =
  | { pid: number; reap: true; shape: string; ageSeconds: number }
  | { pid: number; reap: false; because: Skip; detail?: string }
  | { reap: false; because: "unparsable"; raw: string; detail: string };

export type Classification = { decisions: Decision[]; configNotes: string[] };

/** Clause (a): node as argv[0], a declared entrypoint as the LAST token. */
function workerShape(command: string): string | null {
  const tokens = command.split(/\s+/).filter((t) => t.length > 0);
  const argv0 = tokens[0];
  const last = tokens[tokens.length - 1];
  if (argv0 === undefined || last === undefined || tokens.length < 2) return null;
  if (basename(argv0) !== "node") return null;
  return WORKER_ENTRYPOINTS.find((e) => last.endsWith(e)) ?? null;
}

export function classify(rows: readonly ProcRow[], config: ReapConfig): Classification {
  const configNotes: string[] =
    config.minAgeRejected === undefined
      ? []
      : [`FX_REAP_MIN_AGE_S rejected: ${config.minAgeRejected}; using ${config.minAgeSeconds}`];
  const live = new Set<number>();
  for (const row of rows) if (row.kind === "parsed") live.add(row.pid);
  const selfSet = new Set<number>([config.selfPid, ...config.selfAncestry]);

  const decisions: Decision[] = rows.map((row) => {
    if (row.kind === "unparsable") {
      return { reap: false, because: "unparsable", raw: row.raw, detail: row.problem };
    }
    const shape = workerShape(row.command);
    if (shape === null) return { pid: row.pid, reap: false, because: "not-a-worker" };
    if (selfSet.has(row.pid)) return { pid: row.pid, reap: false, because: "self" };
    if (row.ppid === null) return { pid: row.pid, reap: false, because: "undecidable" };
    if (row.ppid !== 1) {
      return live.has(row.ppid)
        ? { pid: row.pid, reap: false, because: "has-live-parent" }
        : { pid: row.pid, reap: false, because: "undecidable" };
    }
    if (row.etimeSeconds === null) return { pid: row.pid, reap: false, because: "undecidable" };
    // R5: without a classification-time start time, K2 has nothing to compare a pre-signal read
    // against, so the target could not be signalled safely even if every other clause held.
    if (row.startedAt === null) return { pid: row.pid, reap: false, because: "undecidable" };
    if (row.etimeSeconds < config.minAgeSeconds) {
      return { pid: row.pid, reap: false, because: "too-young" };
    }
    return { pid: row.pid, reap: true, shape, ageSeconds: row.etimeSeconds };
  });

  return { decisions, configNotes };
}
