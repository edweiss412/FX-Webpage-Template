// spec:lint CLI adapter (spec docs/superpowers/specs/2026-07-19-spec-lint.md §2/§7).
// All I/O lives here; the core under lib/specLint/** is pure and injected.
import { execFileSync, spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  spliceFixturePlanForText,
  synthesizeFixtureFindings,
  type FixtureSpliceEntry,
} from "../lib/specLint/fixtureContract";
import { splitLines } from "../lib/specLint/parse";
import {
  collectionProbePlanForText,
  parseCheckPlanForText,
  parseFailedLines,
  planExecutionsForText,
  probesToSpawn,
} from "../lib/specLint/redContract";
import { exitCodeForResult, runLint } from "../lib/specLint/run";
import type {
  ExecOutcome,
  ExecResults,
  FileResolver,
  Finding,
  FixtureOutcome,
  FixtureResults,
  LintResult,
  ParseResults,
  ProbeResults,
} from "../lib/specLint/types";

export interface SpawnResult {
  status: number | null;
  signal: NodeJS.Signals | string | null;
  error?: { code?: string; message?: string };
  stderr: string;
  /** Captured for collection probes only; a red command's is discarded. */
  stdout?: string;
}

export interface CliDeps {
  cwd(): string;
  repoRoot(): string;
  listTrackedFiles(): string[];
  lstatKind(p: string): "file" | "dir" | "symlink" | "missing";
  readFileBytes(p: string): Buffer;
  realpath(p: string): string;
  /**
   * Runs one command (arms spec §4.4). Takes the cwd EXPLICITLY because the
   * contract is "repo root", which `runCli` discovers as a local — never the
   * caller's cwd.
   *
   * `mode` selects the shell invocation: `"parse"` is `sh -nc` (syntax check
   * only, nothing executes) and `"exec"` is `sh -c`. It is a PARAMETER rather
   * than two methods because the two are otherwise spawn-indistinguishable at
   * this seam — `sh -nc 'printf EXECUTED'` writes 0 bytes and `sh -c` writes 8 —
   * so a defective default path running the wrong one would look identical to
   * any test that only recorded the command.
   */
  spawn(command: string, cwd: string, timeoutMs: number, mode: "parse" | "exec"): SpawnResult;

  /**
   * The fixture splice seam (fixture spec §4.2). Every path below is
   * REPO-RELATIVE — the directory name is part of the contract
   * (`tests/.spec-lint-fixtures-<pid>-<counter>/`, gitignored, collected by
   * `BASE_INCLUDE`), and resolving it here rather than at the call site keeps
   * one definition of where a splice lands.
   *
   * `pid` is injected rather than read from `process` so the collision refusal
   * in §4.2 step 1 is reachable by a test at all: with the real pid the
   * directory name is different on every run and no test could ever seed one.
   */
  pid(): number;
  exists(relPath: string): boolean;
  mkdir(relPath: string): void;
  write(relPath: string, body: string): void;
  readFile(relPath: string): string;
  rm(relPath: string): void;
}

/** Env seam for the per-command ceiling; a 600-second case is untestable. */
const TIMEOUT_ENV = "SPEC_LINT_EXEC_TIMEOUT_SECS";
const DEFAULT_TIMEOUT_SECS = 600;
const STDERR_TAIL = 200;

/**
 * `spawnSync`'s result fields are NOT mutually exclusive: a SIGTERM-ignoring
 * child overruns the ceiling and returns `status: 0` WITH `error: ETIMEDOUT`
 * (probed in review round 4). Classification is therefore ERROR-FIRST — a
 * command that exceeded the ceiling was not observed under the contract,
 * whatever it eventually exited with.
 */
export function classifySpawnResult(r: {
  status: number | null;
  signal: NodeJS.Signals | string | null;
  error?: { code?: string; message?: string };
}): ExecOutcome {
  if (r.error) {
    if (r.error.code === "ETIMEDOUT") return { kind: "timeout" };
    return { kind: "spawn-error", message: r.error.message ?? r.error.code ?? "spawn failed" };
  }
  if (r.signal) return { kind: "signal", signal: String(r.signal) };
  // No status, no signal, no error: nothing was observed, so this must never
  // read as a non-zero exit (which would mean "red observed").
  if (r.status === null) return { kind: "spawn-error", message: "no exit status" };
  return { kind: "exit", code: r.status };
}

interface CliOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// fs error codes that mean "this file is unreadable" (file-local, expected class);
// anything else thrown by readFileBytes on a cited read is an infra fault → exit 2.
const UNREADABLE_FS_CODES = new Set(["EACCES", "EPERM", "ENOENT", "EISDIR", "ELOOP", "ENOTDIR"]);

const contained = (real: string, root: string): boolean =>
  real === root || real.startsWith(root + sep);

function usage(json: boolean, msg: string): CliOutput {
  return {
    stdout: "",
    stderr: json ? JSON.stringify({ error: msg }) : msg,
    exitCode: 2,
  };
}

function renderText(result: LintResult): string {
  const out: string[] = [];
  out.push(`spec:lint ${result.doc}`);
  out.push(`kind: ${result.kind} (${result.kindSource})`);
  out.push("");
  const checks = [
    "document",
    "citations",
    "numerics",
    "copy",
    "sections",
    "taskContract",
    "universals",
  ] as const;
  for (const check of checks) {
    const fs = result.findings.filter((f) => f.check === check);
    if (fs.length === 0) continue;
    out.push(`${check}:`);
    for (const f of fs) {
      out.push(
        `  ${f.severity === "fail" ? "FAIL" : "ADVISORY"} ${f.code} ${f.docLine}:${f.column} ${f.message}`,
      );
      if (f.detail !== undefined) out.push(`    detail: ${f.detail}`);
    }
  }
  if (result.inventory.length > 0) {
    out.push("INVENTORY");
    for (const g of result.inventory) {
      const n = g.occurrences.length;
      out.push(`  ${g.raw}: ${n} occurrence${n === 1 ? "" : "s"}`);
      for (const o of g.occurrences) out.push(`    ${o.docLine}:${o.column} ${o.snippet}`);
    }
  }
  const hard = result.findings.filter((f) => f.severity === "fail").length;
  const advisory = result.findings.length - hard;
  out.push(`summary: ${hard} hard, ${advisory} advisory`);
  return out.join("\n") + "\n";
}

/** Repo-relative, gitignored (fixture spec §9), and collected by `BASE_INCLUDE`. */
const SPLICE_DIR_PREFIX = "tests/.spec-lint-fixtures-";
/** Per-process, so two docs in one invocation never share a directory. */
let spliceCounter = 0;

/**
 * The splice lifecycle (fixture spec §4.2), the whole of it in the adapter per
 * the §5 boundary: the directory, the ONE vitest run per doc, the JSON read.
 * The core derives the plan and classifies the outcomes and does nothing else.
 *
 * Every exit path removes the directory in a `finally` — a thrown write, a
 * spawn that threw, a timeout, a signal, unreadable JSON — so no failure can
 * leave a file under `tests/`. The one path that removes NOTHING is the
 * collision refusal, and that is deliberate: a directory this invocation did
 * not create belongs to another live invocation, and a broad cleanup would
 * destroy its splice mid-run.
 *
 * Returns the results map for the core to classify. `findings` is returned
 * alongside as the adapter-local view of the same pure derivation; `runLint`
 * computes the authoritative set from its own model.
 */
export function runFixtureSplice(
  plan: readonly FixtureSpliceEntry[],
  deps: CliDeps,
  timeoutMs: number = DEFAULT_TIMEOUT_SECS * 1000,
): { findings: Finding[]; results: FixtureResults } {
  const done = (results: FixtureResults) => ({
    findings: synthesizeFixtureFindings(plan, results),
    results,
  });
  if (plan.length === 0) return done({ files: new Map() });

  const dir = `${SPLICE_DIR_PREFIX}${deps.pid()}-${++spliceCounter}`;
  if (deps.exists(dir)) {
    // A stale directory is a LOUD non-observation, never a silent overwrite of
    // another session's live splice. Stated before anything is observed, and
    // before anything is spawned.
    return done({
      files: new Map(),
      unavailable: `the splice directory ${dir} already exists, so no block was run`,
    });
  }

  const files = new Map<number, FixtureOutcome>();
  let unavailable: string | undefined;
  try {
    deps.mkdir(dir);
    for (const entry of plan) {
      // The marker line is the FIRST digit run of the basename, and `.test.ts`
      // is what `BASE_INCLUDE` collects. Both halves are load-bearing: the
      // suffix decides whether anything runs, the line decides which block a
      // result belongs to.
      deps.write(`${dir}/line-${entry.line}.fixture.test.ts`, entry.block);
    }
    const report = `${dir}/report.json`;
    const command = `pnpm exec vitest run ${dir} --reporter=json --outputFile=${report}`;
    const outcome = classifySpawnResult(deps.spawn(command, deps.repoRoot(), timeoutMs, "exec"));
    if (outcome.kind !== "exit") {
      // NOT a verdict about any block: the runner never finished, so nothing
      // was observed. The exit CODE is deliberately not read either way — the
      // report is the observation, and a non-zero exit is the ordinary shape
      // of a fixture whose premise failed.
      unavailable =
        outcome.kind === "timeout"
          ? "the fixture run exceeded the SPEC_LINT_EXEC_TIMEOUT_SECS ceiling"
          : outcome.kind === "signal"
            ? `the fixture run was killed by ${outcome.signal}`
            : `the fixture run could not be spawned: ${outcome.message}`;
    } else {
      let raw: string;
      try {
        raw = deps.readFile(report);
      } catch {
        unavailable = `no report was written to ${report}`;
        raw = "";
      }
      if (unavailable === undefined) {
        try {
          const parsed = JSON.parse(raw) as { testResults?: unknown[] };
          for (const entry of parsed.testResults ?? []) {
            const tr = entry as {
              name?: unknown;
              status?: unknown;
              message?: unknown;
              assertionResults?: unknown[];
            };
            const base =
              String(tr.name ?? "")
                .split("/")
                .pop() ?? "";
            const m = /^line-(\d+)\./.exec(base);
            if (m === null) continue;
            const asserts = Array.isArray(tr.assertionResults) ? tr.assertionResults : [];
            const rows = asserts.map(
              (a) => a as { status?: unknown; title?: unknown; failureMessages?: unknown[] },
            );
            files.set(Number(m[1]), {
              fileStatus: String(tr.status ?? ""),
              assertions: rows.map((a) => ({
                status: String(a.status ?? ""),
                title: String(a.title ?? ""),
              })),
              failureMessages: rows.flatMap((a) =>
                Array.isArray(a.failureMessages) ? a.failureMessages.map(String) : [],
              ),
              // BOTH channels. A premise at module scope throws during
              // collection, so the file registers no test case and its message
              // arrives here and nowhere else (fixture spec §2.9). Forwarding
              // only the assertion channel loses the live corpus instance at
              // docs/superpowers/plans/2026-08-04-guard-premise-reachability.md:1174
              // while every pure test in Task 4 still passes.
              fileMessage: String(tr.message ?? ""),
            });
          }
        } catch {
          unavailable = `the report at ${report} was not readable JSON`;
        }
      }
    }
  } catch (e) {
    unavailable = `the fixture run could not be prepared: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    try {
      deps.rm(dir);
    } catch {
      // Best effort: a directory that cannot be removed is reported by the
      // NEXT invocation's collision refusal rather than swallowing this run's
      // verdicts.
    }
  }

  return done(unavailable === undefined ? { files } : { files, unavailable });
}

export function runCli(argv: string[], deps: CliDeps): CliOutput {
  // ---- flag parse (full pass: --json registers as a flag even when a --kind value is missing) ----
  let json = false;
  let execRed = false;
  let kindFlag: string | null = null;
  const positionals: string[] = [];
  const errors: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]!;
    if (tok === "--json") {
      if (json) errors.push("duplicate --json");
      json = true;
    } else if (tok === "--exec-red") {
      if (execRed) errors.push("duplicate --exec-red");
      execRed = true;
    } else if (tok === "--kind") {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        errors.push("--kind requires a value (spec|plan)"); // do NOT consume the next token
      } else {
        if (kindFlag !== null) errors.push("duplicate --kind");
        kindFlag = next;
        i++;
      }
    } else if (tok.startsWith("--")) {
      errors.push(`unknown flag: ${tok}`);
    } else {
      positionals.push(tok);
    }
  }
  if (kindFlag !== null && kindFlag !== "spec" && kindFlag !== "plan") {
    errors.push(`invalid --kind value: ${kindFlag}`);
  }
  if (positionals.length !== 1) {
    errors.push(`expected exactly one document path, got ${positionals.length}`);
  }
  if (errors.length > 0) return usage(json, errors.join("; "));

  // The ceiling is validated BEFORE anything is linted or executed: a malformed
  // value must never silently disable or zero the timeout (spec §4.4).
  const rawTimeout = process.env[TIMEOUT_ENV];
  if (rawTimeout !== undefined && !/^[1-9][0-9]*$/.test(rawTimeout)) {
    return usage(
      json,
      `${TIMEOUT_ENV} must be a positive integer number of seconds; got ${JSON.stringify(rawTimeout)}`,
    );
  }
  const timeoutMs = (rawTimeout === undefined ? DEFAULT_TIMEOUT_SECS : Number(rawTimeout)) * 1000;

  try {
    const docArg = positionals[0]!;
    if (!docArg.endsWith(".md")) return usage(json, `not a markdown file: ${docArg}`);

    // Root discovery: EXACTLY ONCE, from the CLI's cwd — never from the doc's directory.
    const root = deps.repoRoot();

    const docAbs = isAbsolute(docArg) ? docArg : resolve(deps.cwd(), docArg);
    const kind = deps.lstatKind(docAbs);
    if (kind !== "file") return usage(json, `not a regular file (${kind}): ${docArg}`);
    let realDoc: string;
    try {
      realDoc = deps.realpath(docAbs);
    } catch {
      return usage(json, `cannot resolve document path: ${docArg}`);
    }
    if (!contained(realDoc, root)) {
      return usage(json, `document is outside the repository: ${docArg}`);
    }
    const repoRelPath = realDoc.slice(root.length + 1);

    let docKind: "spec" | "plan";
    let kindSource: "inferred" | "explicit";
    if (kindFlag !== null) {
      docKind = kindFlag as "spec" | "plan";
      kindSource = "explicit";
    } else {
      const inSpecs = ("/" + repoRelPath).includes("/specs/");
      const inPlans = ("/" + repoRelPath).includes("/plans/");
      if (inSpecs === inPlans) {
        return usage(
          json,
          inSpecs
            ? "path contains both /specs/ and /plans/; pass --kind spec|plan"
            : "cannot infer kind from path; pass --kind spec|plan",
        );
      }
      docKind = inSpecs ? "spec" : "plan";
      kindSource = "inferred";
    }

    let text: string;
    try {
      text = deps.readFileBytes(docAbs).toString("utf8"); // replacement decode
    } catch {
      return usage(json, `cannot read document: ${docArg}`);
    }

    if (execRed && docKind !== "plan") {
      return usage(json, "--exec-red requires a plan document");
    }

    const tracked = deps.listTrackedFiles();
    const resolver: FileResolver = {
      listTrackedFiles: () => tracked,
      readFileLines: (relPath: string): string[] | null => {
        const abs = join(root, relPath);
        if (deps.lstatKind(abs) !== "file") return null; // symlink, dir, missing
        let real: string;
        try {
          real = deps.realpath(abs);
        } catch {
          return null;
        }
        // §1.1 item 11 hard guarantee: cited content is NEVER read outside the repo
        // (a tracked child reached through a symlinked parent realpaths outside).
        if (!contained(real, root)) return null;
        try {
          return splitLines(deps.readFileBytes(abs).toString("utf8"));
        } catch (e) {
          const code = (e as { code?: string }).code;
          if (code !== undefined && UNREADABLE_FS_CODES.has(code)) return null;
          throw e; // infra fault → exit 2
        }
      },
    };

    // Trailing whitespace off first: a command's final newline would otherwise
    // be the last character of every tail and break the one-line detail
    // rendering.
    const tailOf = (r: SpawnResult): string => (r.stderr ?? "").trimEnd().slice(-STDERR_TAIL);

    // Parse capability (verdict spec §3): EVERY plan-kind invocation, flag or
    // not. `sh -nc` executes nothing, so this is safe on authored reds and on
    // gate commands alike.
    const parsePlan = docKind === "plan" ? parseCheckPlanForText(text) : [];
    let parseResults: ParseResults | null = null;
    if (docKind === "plan") {
      const outcomes = new Map<number, ExecOutcome>();
      const stderrTails = new Map<number, string>();
      for (const { line, command } of parsePlan) {
        const r = deps.spawn(command, root, timeoutMs, "parse");
        outcomes.set(line, classifySpawnResult(r));
        stderrTails.set(line, tailOf(r));
      }
      parseResults = { outcomes, stderrTails };
    }
    // The exclusion is derived by the CORE, from the outcomes just recorded, so
    // the spawn set and the report can never disagree about which markers the
    // parse pass disqualified.
    const excluded = parseFailedLines(parsePlan, parseResults);

    // Execution: sequential, doc order, repo-root cwd, stdout discarded and
    // the stderr tail trimmed here so the core never sees raw output.
    let execResults: ExecResults | null = null;
    let probeResults: ProbeResults | null = null;
    let fixtureResults: FixtureResults | null = null;
    if (execRed) {
      const outcomes = new Map<number, ExecOutcome>();
      const stderrTails = new Map<number, string>();
      for (const { line, command } of planExecutionsForText(text, excluded)) {
        const r = deps.spawn(command, root, timeoutMs, "exec");
        outcomes.set(line, classifySpawnResult(r));
        stderrTails.set(line, tailOf(r));
      }
      execResults = { outcomes, stderrTails };

      // Collection probes run AFTER every red execution, in doc order.
      // Collection executes module scope, so an interleaved probe would run a
      // suite's imports between two red observations.
      const probeOutcomes = new Map<number, ExecOutcome>();
      const probeStdout = new Map<number, string>();
      const probeTails = new Map<number, string>();
      const probePlan = collectionProbePlanForText(text, new Set(tracked), excluded);
      for (const { line, probe } of probesToSpawn(probePlan, execResults)) {
        const r = deps.spawn(probe, root, timeoutMs, "exec");
        probeOutcomes.set(line, classifySpawnResult(r));
        // The list output IS the observation, which is why probe stdout is
        // captured while a red command's stays discarded.
        probeStdout.set(line, r.stdout ?? "");
        probeTails.set(line, tailOf(r));
      }
      probeResults = { outcomes: probeOutcomes, stdout: probeStdout, stderrTails: probeTails };

      // Fixture blocks run LAST: they are whole vitest boots, and a boot
      // between two red observations would run another suite's module scope.
      fixtureResults = runFixtureSplice(spliceFixturePlanForText(text), deps, timeoutMs).results;
    }

    const result = runLint(
      { text, repoRelPath, kind: docKind, kindSource },
      resolver,
      execResults,
      parseResults,
      probeResults,
      fixtureResults,
    );
    return {
      stdout: json ? JSON.stringify(result) + "\n" : renderText(result),
      stderr: "",
      exitCode: exitCodeForResult(result),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      stdout: "",
      stderr: json ? JSON.stringify({ error: msg }) : msg,
      exitCode: 2,
    };
  }
}

// ---- Direct-run entry (not exercised by unit tests) ----
const isEntry = (() => {
  const a = process.argv[1];
  if (!a) return false;
  try {
    return import.meta.url === pathToFileURL(a).href;
  } catch {
    return false;
  }
})();

/**
 * The SHIPPED deps, factored out of the entry block so a suite exercising the
 * real filesystem and a real vitest child drives this object rather than a
 * copy of it. `pid` is the only parameter a test varies, and it is a parameter
 * precisely so the §4.2 collision refusal is reachable at all.
 */
export function nodeDeps(root: string, pid: number): CliDeps {
  const inRepo = (relPath: string) => join(root, relPath);
  return {
    cwd: () => process.cwd(),
    repoRoot: () => root,
    pid: () => process.pid,
    exists: (relPath) => lstatSync(inRepo(relPath), { throwIfNoEntry: false }) !== undefined,
    mkdir: (relPath) => void mkdirSync(inRepo(relPath), { recursive: true }),
    write: (relPath, body) => writeFileSync(inRepo(relPath), body),
    readFile: (relPath) => readFileSync(inRepo(relPath), "utf8"),
    rm: (relPath) => rmSync(inRepo(relPath), { recursive: true, force: true }),
    listTrackedFiles: () =>
      // ":/" pathspec = whole repo regardless of the cwd subdir
      execFileSync("git", ["ls-files", "-z", "--full-name", "--", ":/"], {
        cwd: process.cwd(),
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      })
        .split("\0")
        .filter((p) => p.length > 0),
    lstatKind: (p) => {
      const st = lstatSync(p, { throwIfNoEntry: false });
      if (!st) return "missing";
      if (st.isSymbolicLink()) return "symlink";
      if (st.isDirectory()) return "dir";
      return st.isFile() ? "file" : "missing";
    },
    readFileBytes: (p) => readFileSync(p),
    realpath: (p) => realpathSync(p),
    spawn: (command, cwd, timeoutMs, mode) => {
      // `-nc` is the parse check: sh reads the whole command for syntax and
      // executes none of it. `-c` is the ordinary run.
      const r = spawnSync("sh", [mode === "parse" ? "-nc" : "-c", command], {
        cwd,
        timeout: timeoutMs,
        encoding: "utf8",
      });
      const e = r.error as (Error & { code?: string }) | undefined;
      return {
        status: r.status,
        signal: r.signal,
        ...(e
          ? { error: { ...(e.code === undefined ? {} : { code: e.code }), message: e.message } }
          : {}),
        stderr: r.stderr ?? "",
        stdout: r.stdout ?? "",
      };
    },
  };
}

if (isEntry) {
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
  const r = runCli(process.argv.slice(2), nodeDeps(root, process.pid));
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr + "\n");
  // NOT process.exit(): stdout.write is ASYNC on a pipe, so exiting on the next
  // statement truncates every captured report — codex-guard captures through a
  // pipe by construction, so A1 cannot work until this drains naturally.
  process.exitCode = r.exitCode;
}
