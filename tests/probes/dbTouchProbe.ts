// Per-test-file database-touch probe.
//
// WHY THIS EXISTS: the 2026-07-20 reclassification spike established that
// "the file passes with no database reachable" is NOT evidence that a file is
// safe to run in the parallel/no-DB project. A file can pass without a DB and
// still WRITE to one when a DB is present — those writes were previously
// serialized by `fileParallelism: false`, and running them concurrently
// corrupts shared state for the serial phase that follows. That criterion is
// invisible to a pass/fail run (see the memo
// `feedback-db-free-is-three-separate-claims`), so it needs instrumentation,
// not another green run.
//
// WHY THE SOCKET LAYER: every database path in this repo bottoms out in a TCP
// connect — postgres.js dials Postgres directly (54322) and the Supabase JS
// client reaches PostgREST over HTTP (54321). Wrapping `net.Socket.prototype
// .connect` therefore catches BOTH with one hook, and catches any future client
// too. Wrapping the DRIVERS instead would need a hook per library and would
// miss anything that imports a connection helper the probe doesn't know about.
//
// WHY IT DOES NOT MUTATE BEHAVIOR: the wrapper records and then delegates to
// the original `connect` with the original arguments and `this`. It never
// swallows an error, never rewrites a target, and never returns a substitute
// socket. A probe that changed connect semantics would fail every DB test in
// the suite and produce a measurement of the probe rather than of the tests.
import net from "node:net";

export type DbTouch = {
  /** Repo-relative path of the test file that was current when the socket opened. */
  file: string;
  host: string;
  port: number;
};

type ConnectFn = typeof net.Socket.prototype.connect;

const ORIGINAL_CONNECT: ConnectFn = net.Socket.prototype.connect;

let installed = false;
let currentTestFile = "<unattributed>";
let touches: DbTouch[] = [];

/**
 * Normalize the several overloads of `Socket.connect` into a host/port pair.
 * Overloads: (options), (port[, host]), (path) for a unix socket.
 */
function targetOf(args: unknown[]): { host: string; port: number } {
  const [first, second] = args;

  // `net.connect(...)` / `net.createConnection(...)` do NOT spread their
  // arguments into `Socket.prototype.connect` — they pass the result of Node's
  // internal `normalizeArgs`, i.e. a SINGLE argument that is the array
  // `[options, callback]`. Unwrap one level so both call shapes are handled.
  // (Verified empirically against Node's real socket, not a stub: without this
  // every connect through `net.connect` records port 0.)
  if (Array.isArray(first)) return targetOf(first as unknown[]);

  if (typeof first === "number") {
    return { host: typeof second === "string" ? second : "localhost", port: first };
  }

  if (typeof first === "string") {
    // A unix-socket path. Port 0 marks "not a TCP target" — kept rather than
    // dropped so an IPC-based DB client still shows up as a touch.
    return { host: first, port: 0 };
  }

  if (first !== null && typeof first === "object") {
    const options = first as { host?: unknown; port?: unknown; path?: unknown };
    if (typeof options.path === "string") return { host: options.path, port: 0 };
    return {
      host: typeof options.host === "string" ? options.host : "localhost",
      port: typeof options.port === "number" ? options.port : Number(options.port ?? 0),
    };
  }

  return { host: "<unknown>", port: 0 };
}

/**
 * Install the probe. Idempotent: `tests/setup.ts` runs once per test FILE in a
 * worker that is reused across files, so a non-idempotent installer would stack
 * N wrappers and record N duplicates of every connect on the Nth file.
 */
export function installDbTouchProbe(): void {
  if (installed) return;
  installed = true;

  net.Socket.prototype.connect = function patchedConnect(
    this: net.Socket,
    ...args: Parameters<ConnectFn>
  ): net.Socket {
    const { host, port } = targetOf(args as unknown[]);
    touches.push({ file: currentTestFile, host, port });
    return ORIGINAL_CONNECT.apply(this, args);
  } as ConnectFn;
}

export function uninstallDbTouchProbe(): void {
  if (!installed) return;
  installed = false;
  net.Socket.prototype.connect = ORIGINAL_CONNECT;
}

/**
 * Attribute subsequent connects to `file`. Called from `tests/setup.ts`, which
 * runs per test file, so the value is correct for synchronous and awaited
 * connects. A connect that escapes its own file (an un-awaited promise leaking
 * past teardown) is attributed to whichever file was current when the socket
 * actually opened — which is the honest answer: that connection really did run
 * concurrently with the later file.
 */
export function setCurrentTestFile(file: string): void {
  currentTestFile = file;
}

export function recordedTouches(): readonly DbTouch[] {
  return touches;
}

export function resetRecordedTouches(): void {
  touches = [];
}
