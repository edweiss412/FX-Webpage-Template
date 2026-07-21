// @vitest-environment node
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import child_process from "node:child_process";
import {
  installSubprocessDbProbe,
  uninstallSubprocessDbProbe,
  looksLikeDbCommand,
} from "./subprocessDbProbe";
import { setCurrentTestFile, recordedTouches, resetRecordedTouches } from "./dbTouchProbe";

beforeEach(() => {
  resetRecordedTouches();
  setCurrentTestFile("tests/example/sub.test.ts");
});

afterAll(() => uninstallSubprocessDbProbe());

describe("looksLikeDbCommand", () => {
  // The 40 misclassified files reach Postgres via execFileSync("psql", [url]).
  // That is the exact shape that must register as a DB touch.
  it("recognizes a psql invocation", () => {
    expect(looksLikeDbCommand("psql", ["postgresql://x@127.0.0.1:54322/postgres"])).toBe(true);
  });

  it("recognizes a supabase CLI db subcommand", () => {
    expect(looksLikeDbCommand("supabase", ["db", "query", "select 1"])).toBe(true);
  });

  it("recognizes a DB target hidden in an argument", () => {
    expect(looksLikeDbCommand("some-wrapper", ["--dsn", "postgres://a@host:5432/db"])).toBe(true);
    expect(looksLikeDbCommand("node", ["seed.js", "--port", "54322"])).toBe(true);
  });

  // Must NOT flag ordinary subprocesses, or every codexGuard/spawn test would be
  // wrongly held in the serial project.
  it("does not flag a non-DB subprocess", () => {
    expect(looksLikeDbCommand("node", ["scripts/build.mjs"])).toBe(false);
    expect(looksLikeDbCommand("git", ["ls-files"])).toBe(false);
    expect(looksLikeDbCommand("supabase", ["--version"])).toBe(false);
  });
});

describe("installSubprocessDbProbe", () => {
  it("records a DB touch when a test shells out to psql (execFileSync)", () => {
    installSubprocessDbProbe();
    // `false` exits nonzero; we only need the LAUNCH to be observed, not success.
    // Route the psql-shaped argv through a harmless binary so the test needs no
    // real database, proving the probe records at spawn time, not on connect.
    try {
      child_process.execFileSync("psql", ["postgresql://nope@127.0.0.1:1/none"], {
        timeout: 500,
      });
    } catch {
      /* expected: no server */
    }

    const touches = recordedTouches();
    expect(touches).toHaveLength(1);
    expect(touches[0]?.file).toBe("tests/example/sub.test.ts");
    expect(touches[0]?.host).toBe("subprocess:psql");
  });

  it("does not record a non-DB subprocess", () => {
    installSubprocessDbProbe();
    child_process.execFileSync("true", [], { timeout: 500 });

    expect(recordedTouches()).toEqual([]);
  });

  it("records via spawn as well as execFile", () => {
    installSubprocessDbProbe();
    const child = child_process.spawn("psql", ["postgres://x@127.0.0.1:1/y"]);
    child.on("error", () => {});
    child.kill();

    expect(recordedTouches().some((t) => t.host === "subprocess:psql")).toBe(true);
  });

  it("stops recording once uninstalled", () => {
    installSubprocessDbProbe();
    uninstallSubprocessDbProbe();
    try {
      child_process.execFileSync("psql", ["postgres://x@127.0.0.1:1/y"], { timeout: 500 });
    } catch {
      /* expected */
    }

    expect(recordedTouches()).toEqual([]);
  });
});
