// Subprocess database-touch probe — the companion to the socket probe.
//
// WHY THIS EXISTS: the socket probe hooks THIS process's net.Socket, so it is
// blind to a DB connection opened by a CHILD process. That is not a corner
// case here: 40 of the repo's `tests/db/*` files reach Postgres via
// `execFileSync("psql", [url])`, and the socket probe classified every one of
// them as DB-free. Moving them into the concurrent project reintroduced the
// exact shared-DB corruption the whole measurement exists to prevent. No
// in-process socket/driver hook (including instrumenting postgres.js) can see a
// child psql — but the spawn CALL is in-process, so hooking child_process at
// launch and inspecting argv closes the gap.
//
// It records into the SAME touch log as the socket probe (dbTouchProbe), with a
// `subprocess:<cmd>` host marker, so summarizeFile counts both uniformly.
import child_process from "node:child_process";
import { recordSubprocessTouch } from "./dbTouchProbe";

const DB_COMMANDS = new Set(["psql", "pg_dump", "pg_restore", "pg_isready", "pg_ctl", "initdb"]);
const DB_URL = /\bpostgres(?:ql)?:\/\//i;
const DB_PORT = /\b(5432|6543|54321|54322)\b/;

/**
 * True when a subprocess launch will (or very likely will) reach a database.
 * Deliberately conservative on the negative side: a false "yes" only keeps a
 * file serial (safe); a false "no" would let a DB-writer run concurrently
 * (corruption). `supabase` counts only for its db-touching subcommands, so
 * `supabase --version` and `supabase status` do not trip it.
 */
export function looksLikeDbCommand(command: string, args: readonly string[]): boolean {
  const base = command.split("/").pop() ?? command;
  if (DB_COMMANDS.has(base)) return true;

  if (base === "supabase") {
    return args.some((a) => a === "db") && !args.includes("--version");
  }

  return args.some((a) => typeof a === "string" && (DB_URL.test(a) || DB_PORT.test(a)));
}

type Wrapped = {
  execFileSync: typeof child_process.execFileSync;
  execSync: typeof child_process.execSync;
  spawn: typeof child_process.spawn;
  spawnSync: typeof child_process.spawnSync;
};

let originals: Wrapped | null = null;

/** Node's exec/spawn family take (command, args?, options?); args may be omitted. */
function argvOf(rest: unknown[]): string[] {
  const first = rest[0];
  return Array.isArray(first) ? (first as string[]) : [];
}

export function installSubprocessDbProbe(): void {
  if (originals !== null) return;
  originals = {
    execFileSync: child_process.execFileSync,
    execSync: child_process.execSync,
    spawn: child_process.spawn,
    spawnSync: child_process.spawnSync,
  };

  const record = (command: unknown, rest: unknown[]): void => {
    if (typeof command !== "string") return;
    const base = command.split("/").pop() ?? command;
    if (looksLikeDbCommand(command, argvOf(rest))) {
      recordSubprocessTouch(`subprocess:${base}`);
    }
  };

  child_process.execFileSync = function (this: unknown, command: unknown, ...rest: unknown[]) {
    record(command, rest);
    return (originals as Wrapped).execFileSync.apply(child_process, [command, ...rest] as never);
  } as typeof child_process.execFileSync;

  // execSync takes a full command STRING; treat the whole thing as argv[0].
  child_process.execSync = function (this: unknown, command: unknown, ...rest: unknown[]) {
    if (typeof command === "string" && looksLikeDbCommand(command, [command])) {
      recordSubprocessTouch("subprocess:sh");
    }
    return (originals as Wrapped).execSync.apply(child_process, [command, ...rest] as never);
  } as typeof child_process.execSync;

  child_process.spawn = function (this: unknown, command: unknown, ...rest: unknown[]) {
    record(command, rest);
    return (originals as Wrapped).spawn.apply(child_process, [command, ...rest] as never);
  } as typeof child_process.spawn;

  child_process.spawnSync = function (this: unknown, command: unknown, ...rest: unknown[]) {
    record(command, rest);
    return (originals as Wrapped).spawnSync.apply(child_process, [command, ...rest] as never);
  } as typeof child_process.spawnSync;
}

export function uninstallSubprocessDbProbe(): void {
  if (originals === null) return;
  child_process.execFileSync = originals.execFileSync;
  child_process.execSync = originals.execSync;
  child_process.spawn = originals.spawn;
  child_process.spawnSync = originals.spawnSync;
  originals = null;
}
