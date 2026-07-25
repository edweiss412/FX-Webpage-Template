import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import vitestConfig from "@/vitest.config";

// Structural guard for DB-test connection hygiene.
//
// Measured 2026-07-24: the suite holds 106 module-scope postgres.js clients, 60
// of them (across 59 files) with no `.end()` on their own binding — mostly the
// `probe` client DB tests open to read state back. 86 of 155 constructions pass
// no `idle_timeout`, which postgres.js leaves `null`, meaning never auto-close.
// Nothing in those files closes those connections. What does is process exit:
// vitest gives each test file its own worker and terminates it when the file
// finishes. Full numbers in BACKLOG-archive.md's withdrawn
// BL-TEST-PG-CLIENT-TEARDOWN entry, which is where that measurement lives (it
// graduated out of BACKLOG.md on 2026-07-25); this file exists to keep the
// property it depends on from being switched off.
//
// Two independent settings govern it. File parallelism does NOT disable
// isolation — it schedules several still-isolated workers at once:
//
//   1. `isolate: false` — one worker serves many files, so clients nothing
//      closes stack up for the length of the run.
//   2. file parallelism on the serial project — many pools held at once rather
//      than roughly one at a time.
//
// Both are settable in the config file, from the command line, and (for
// parallelism) via VITEST_MAX_WORKERS, so both are checked against the RESOLVED
// runtime config. An earlier version of this guard read the imported config and
// passed 6/6 under `--no-isolate --pool=threads`.
//
// `pool` is deliberately NOT pinned. An earlier version pinned it away from
// "threads" on the theory that thread workers share a process and retain
// sockets; with isolate:true vitest terminates thread workers too, so pool
// choice does not affect connection lifetime. It also asserted
// `poolOptions.<pool>.isolate`, a key vitest 4 removed — an assertion vitest
// ignores cannot fail meaningfully.
//
// This file also no longer carries an AST census of unclosed clients. It could
// not do the job it was added for: a wrapper teardown (`afterAll(() =>
// closeSql(sql))`) leaves the count unchanged though the clients are genuinely
// closed, and moving construction behind a factory collapses the count though
// nothing was closed at all — so it could neither confirm nor deny that the
// invariant still had subjects, while catching none of the configuration
// regressions the assertions below do catch. The subject count above is a
// measured fact with a date on it, not something to re-derive on every run.

const ROOT = process.cwd();

type ProjectTest = { name: string; fileParallelism?: boolean; isolate?: boolean };
type ProjectEntry = { test: ProjectTest };

const projects =
  (vitestConfig as { test?: { projects?: ProjectEntry[] } }).test?.projects ??
  ([] as ProjectEntry[]);
const serial = projects.find((p) => p.test.name === "serial")?.test;

// The resolved config THIS worker is running under. Unlike the imported config,
// it reflects CLI flags and env overrides.
const runtimeConfig = (
  globalThis as Record<string, unknown> & {
    __vitest_worker__?: {
      config?: { isolate?: boolean; name?: string; maxWorkers?: number };
    };
  }
).__vitest_worker__?.config;

// The knobs, as bare tokens. NOT as flag spellings with values.
//
// Earlier versions tried to match the harmful spellings precisely and lost:
// `--isolate false` with two spaces, a tab, or a line break between; `=+2`;
// `=0` and `=foo`, which Number.parseInt turns into 0/NaN and vitest then
// resolves to default (parallel) workers. Meanwhile the value matching rejected
// benign `01`, `1e2`, and `--fileParallelism false`. Every round of tightening
// produced both new misses and new false rejections.
//
// So this does not parse values at all. A run-command source may not MENTION
// these knobs. That is coarser than the real rule and deliberately so: it
// cannot be evaded by a spelling, and when it fires wrongly it fires loudly,
// which is the correct direction for a guard whose failure mode is otherwise
// silent. There are zero occurrences in these files today, so the rule costs
// nothing until someone reaches for one of the knobs — at which point they can
// record the safe use here with its reason.
const ISOLATION_KNOBS = [/isolate/i, /file-?parallelism/i, /VITEST_(?:MAX|MIN)_WORKERS/];

// Where runs are launched from. Every file under scripts/ is read regardless of
// extension: an extensionless executable, a .zsh, or a format that does not
// exist yet is a launcher too, and an extension allowlist fails OPEN for each
// one. package.json and the workflows are the other two surfaces.
//
// What this still cannot see: a flag assembled at runtime, a value arriving
// from repo or org CI settings, a composite action's internals, or an alternate
// `--config` whose file sets `isolate: false`.
function runCommandSources(): string[] {
  const out = [join(ROOT, "package.json")];
  const walk = (dir: string): void => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.isFile()) out.push(full);
    }
  };
  walk(join(ROOT, ".github", "workflows"));
  walk(join(ROOT, "scripts"));
  return out;
}

// Whole comment lines only. Trailing comments are deliberately NOT stripped: an
// earlier version cut each line at ` #`, which hid a real offender —
// `spawn("vitest", ["run", "label #1", "--no-isolate"])` truncates before the
// flag. The cost is that naming a knob in a trailing comment fails this test,
// which is the loud error rather than the silent one.
function commandLines(body: string): string {
  return body
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("#") && !trimmed.startsWith("//");
    })
    .join("\n");
}

describe("DB-test connection hygiene depends on per-file worker isolation", () => {
  it("the RESOLVED config this run is using keeps isolation on", () => {
    expect(
      runtimeConfig,
      "expected vitest's worker context to expose the resolved config; if vitest changed " +
        "this internal, replace it with another resolved-config source rather than falling " +
        "back to the authored config, which cannot see CLI overrides",
    ).toBeDefined();
    expect(
      runtimeConfig!.isolate,
      "isolate must be true at RUNTIME — false shares one worker across files, so the " +
        "module-scope clients that nothing closes accumulate for the whole run",
    ).toBe(true);
  });

  it("the serial project runs one test file at a time", () => {
    // What this buys, precisely: vitest schedules one file's tasks at a time, so
    // N files do not deliberately hold N pools at once. It is NOT strict
    // non-overlap — vitest does not await worker teardown before starting the
    // next file, so a slow-exiting worker can still hold sockets while its
    // successor begins. That window is why the measurement reports a sampled
    // peak and a trend rather than a ceiling.
    //
    // Runtime side is `maxWorkers`: the worker config does not carry
    // `fileParallelism`, but vitest resolves fileParallelism:false to
    // maxWorkers 1, and `--fileParallelism` / VITEST_MAX_WORKERS leave it
    // otherwise. The project name is asserted beside it so that moving this file
    // into the parallel project — where maxWorkers 1 would not hold — fails
    // loudly instead of quietly becoming a false alarm.
    expect(runtimeConfig, "expected the resolved config").toBeDefined();
    expect(
      runtimeConfig!.name,
      "this guard must run in the serial project; its maxWorkers assertion is only meaningful there",
    ).toBe("serial");
    expect(
      runtimeConfig!.maxWorkers,
      "maxWorkers must be 1 at RUNTIME — anything else lets vitest schedule files " +
        "concurrently, so their pools are held at the same time",
    ).toBe(1);

    // The authored value too. Also pinned by vitest-projects-partition.test.ts
    // for the DB-race reason; asserted here for the connection-count reason so
    // removing either guard does not silently drop the other's coverage.
    expect(serial, "vitest.config.ts must define a `serial` project").toBeDefined();
    expect(
      serial!.fileParallelism,
      "serial.fileParallelism must stay false — concurrent DB files hold their pools at once",
    ).toBe(false);
  });

  it("no committed run command touches the isolation knobs", () => {
    // The runtime assertions above catch every override for runs that INCLUDE
    // this file. This is for the runs that do not — a command targeting only
    // tests/db, say.
    const offenders: string[] = [];
    for (const file of runCommandSources()) {
      const commands = commandLines(readFileSync(file, "utf8"));
      const hit = ISOLATION_KNOBS.find((re) => re.test(commands));
      if (hit) offenders.push(`${file.slice(ROOT.length + 1)} (matched ${String(hit)})`);
    }
    expect(
      offenders,
      "these run-command sources mention a vitest isolation/parallelism knob. If the use is " +
        "genuinely safe, record it here with the reason rather than loosening the pattern — " +
        "value-matching was tried and lost to spelling variants in both directions",
    ).toEqual([]);
  });

  it("the scan actually reads the launch surfaces (anti-vacuity)", () => {
    // A mistyped path would scan nothing and pass forever.
    const files = runCommandSources().map((f) => f.slice(ROOT.length + 1));
    expect(files.length, "expected many run-command sources").toBeGreaterThan(30);
    for (const required of ["package.json", ".github/workflows/", "scripts/"]) {
      expect(
        files.some((f) => f.startsWith(required)),
        `the scan must cover ${required}`,
      ).toBe(true);
    }
    expect(
      statSync(join(ROOT, "package.json")).size,
      "package.json must be non-empty",
    ).toBeGreaterThan(0);
  });
});
