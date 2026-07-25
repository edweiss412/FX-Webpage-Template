import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import vitestConfig from "@/vitest.config";

// Structural guard for DB-test connection hygiene.
//
// 42 test files construct a postgres.js client at IMPORT time (module scope, not
// inside a hook), and 93 of the suite's 162 client constructions pass no
// `idle_timeout` — postgres.js defaults it to 0, meaning "never auto-close". On
// paper that reads like a connection leak that accumulates across the whole DB
// leg and exhausts local Postgres `max_connections` (100). It does not, and the
// reason is entirely structural: the serial project runs with vitest's forks
// pool and the default `isolate: true`, which gives every test file its own
// fresh child process. The fork exits when the file finishes and the kernel
// closes its sockets, so nothing carries over to the next file.
//
// Measured 2026-07-24 against the full serial project (837 files, 7651 tests,
// 474s), sampling pg_stat_activity every 0.5s: baseline 20 backends, peak 33
// total, and peak 6 held by postgres.js clients (application_name is empty for
// postgres.js; the named backends are PostgREST/realtime/pg_cron/pg_net). Peak 6
// is exactly the `max: 6` pool in tests/db/_holdsHelpers.ts — across 837 files
// the suite never exceeded a SINGLE file's pool. Zero accumulation.
//
// That measurement is only true while the isolation holds. Three config edits
// would each break it and silently reintroduce the accumulation the numbers
// above rule out:
//
//   1. `isolate: false` on the serial project — one fork serves every file, so
//      all 42 import-time clients stack up for the length of the run.
//   2. `pool: "threads"` — workers share ONE process, so per-file sockets are no
//      longer reclaimed by process exit. (Already measured and rejected on
//      performance grounds at vitest.config.ts's parallel-project comment; this
//      pins the correctness reason too.)
//   3. `fileParallelism: true` on serial — files overlap, so peaks add instead
//      of alternating. Also pinned by vitest-projects-partition.test.ts for the
//      DB-race reason; asserted here again for the connection-count reason, so
//      neither guard's removal silently drops the other's coverage.
//
// If any of these ever becomes desirable, the connection work the 2026-07-24
// measurement made unnecessary becomes necessary again: a shared
// `makeTestSql()` factory with `idle_timeout` + an `endAllTestSql()` teardown,
// hand-auditing the advisory-lock and concurrency tests that deliberately hold
// a connection open across statements.
//
// `pnpm db:reset-pool` remains the runtime mitigation, but for a different
// cause: concurrent load from several worktrees, dev servers, and psql sessions
// sharing one local Postgres — not test-file leaks.

const ROOT = process.cwd();
const TESTS_DIR = join(ROOT, "tests");

type ProjectTest = {
  name: string;
  fileParallelism?: boolean;
  isolate?: boolean;
  pool?: string;
  poolOptions?: Record<string, { isolate?: boolean }>;
};
type ProjectEntry = { test: ProjectTest };

const rootTest = (vitestConfig as { test?: ProjectTest & { projects?: ProjectEntry[] } }).test ?? {
  name: "root",
};
const projects = rootTest.projects ?? [];
const serial = projects.find((p) => p.test.name === "serial")?.test;

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listTsFiles(full));
    else if (/\.tsx?$/.test(ent.name)) out.push(relative(ROOT, full).split(sep).join("/"));
  }
  return out;
}

// An IMPORT-TIME client: a module-scope binding initialized by a postgres()
// call. Anchored to the start of a line so a construction inside a function,
// hook, or arrow factory (`const newConn = () => postgres(...)`) does not
// count — those open on call and are closed by their caller.
//
// The `= postgres(` shape also can't collide with the loopback-guard regex
// literals several helpers declare (`/^postgres(?:ql)?:\/\/.../`), because
// there the `=` is followed by `/`. Counting those cost a wrong premise once
// already: a naive `grep postgres(` reports three files as unclosed clients
// that construct no client at all.
const IMPORT_TIME_CLIENT = /^(?:export\s+)?(?:const|let)\s+\w+(?:\s*:\s*\w+)?\s*=\s*postgres\s*\(/m;

const importTimeClientFiles = listTsFiles(TESTS_DIR).filter((f) =>
  IMPORT_TIME_CLIENT.test(readFileSync(join(ROOT, f), "utf8")),
);

describe("DB-test connection hygiene depends on process-per-file isolation", () => {
  // Anti-vacuity: every assertion below is about protecting these files. If the
  // suite ever stops constructing import-time clients the guard is moot, and it
  // should be deleted deliberately rather than passing on an empty set.
  it("the invariant has real subjects — many test files construct import-time clients", () => {
    expect(
      importTimeClientFiles.length,
      "expected the import-time-client census to be non-trivial (42 at 2026-07-24); " +
        "if this collapsed, the clients moved into hooks and this guard can be retired",
    ).toBeGreaterThan(30);
  });

  it("the serial project never disables per-file isolation", () => {
    expect(serial, "vitest.config.ts must define a `serial` project").toBeDefined();
    expect(
      serial!.isolate,
      "serial.isolate must stay unset/true — `false` shares one fork across all files, " +
        `stacking all ${importTimeClientFiles.length} import-time postgres.js clients for the whole run`,
    ).not.toBe(false);
    expect(
      rootTest.isolate,
      "root test.isolate must stay unset/true — it is inherited by the serial project via `extends: true`",
    ).not.toBe(false);
  });

  it("neither root nor serial disables isolation through poolOptions", () => {
    // `isolate` is settable per-pool as well as top-level; a poolOptions entry
    // wins over the top-level default, so checking only `isolate` leaves a hole.
    for (const [label, cfg] of [
      ["root", rootTest],
      ["serial", serial!],
    ] as const) {
      for (const [pool, opts] of Object.entries(cfg.poolOptions ?? {})) {
        expect(
          opts?.isolate,
          `${label}.poolOptions.${pool}.isolate must stay unset/true (per-file fork isolation)`,
        ).not.toBe(false);
      }
    }
  });

  it("the serial project runs on the forks pool, not threads", () => {
    // Threads share ONE process, so a finished file's sockets are not reclaimed
    // by process exit the way a forked child's are.
    for (const [label, value] of [
      ["root", rootTest.pool],
      ["serial", serial!.pool],
    ] as const) {
      expect(
        value,
        `${label} must not use the threads pool — workers would share a process and retain sockets`,
      ).not.toBe("threads");
    }
  });

  it("the serial project keeps files sequential, so per-file peaks alternate instead of adding", () => {
    expect(
      serial!.fileParallelism,
      "serial.fileParallelism must stay false — overlapping DB files sum their pools " +
        "instead of peaking one at a time (measured peak: 6 of max_connections 100)",
    ).toBe(false);
  });

  it("db:reset-pool still exists as the runtime mitigation for concurrent-load exhaustion", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(
      pkg.scripts?.["db:reset-pool"],
      "db:reset-pool is referenced by this guard's rationale and by BACKLOG.md",
    ).toBeTruthy();
  });
});
