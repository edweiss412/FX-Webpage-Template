import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  scripts: Record<string, string>;
};
const segments = (): string[] =>
  (pkg.scripts.heavy ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

describe("the heavy script wires the reaper AHEAD of the wrapper", () => {
  // A substring match on "heavy-reap" would pass on a report-only invocation, the wrong
  // interpreter, or a segment that merely mentions the name - so each part is asserted
  // separately (plan round 1 finding 5).
  // Anchored to the START of the segment, because a segment that merely CONTAINS the text runs
  // something else: `echo tsx scripts/heavy-reap.ts --kill --quiet` satisfies every unanchored
  // assertion while reaping nothing (plan round 4 finding 4).
  it("invokes the reaper through tsx, by path, as the command itself", () => {
    expect(segments()[0]).toMatch(/^tsx\s+scripts\/heavy-reap\.ts(\s|$)/);
  });

  it("invokes it in DESTRUCTIVE mode, or trigger 1 bounds nothing", () => {
    expect(segments()[0]).toMatch(/(^|\s)--kill(\s|$)/);
  });

  it("invokes it quietly, so admission is not spammed", () => {
    expect(segments()[0]).toMatch(/(^|\s)--quiet(\s|$)/);
  });

  it("makes the WRAPPER the last segment, invoked as the command itself", () => {
    const last = segments()[segments().length - 1];
    expect(last).toMatch(/^python3\s+scripts\/with-heavy-slot\.py(\s|$)/);
    expect(last?.endsWith("--")).toBe(true);
  });

  it.each([
    ["echo tsx scripts/heavy-reap.ts --kill --quiet", "a non-live reaper segment"],
    ["echo python3 scripts/with-heavy-slot.py --", "a non-live wrapper segment"],
  ])("rejects %s (%s)", (segment) => {
    // The escape the anchors close, asserted directly rather than trusted.
    expect(segment).not.toMatch(/^tsx\s+scripts\/heavy-reap\.ts(\s|$)/);
    expect(segment).not.toMatch(/^python3\s+scripts\/with-heavy-slot\.py(\s|$)/);
  });

  it("sequences with ';' and never '&&', so a failing reaper cannot block admission", () => {
    expect(pkg.scripts.heavy).not.toContain("&&");
  });
});

describe("AC-8 fail-open, executed against real pnpm", () => {
  const build = (reaper: string, wrapper = "node show.js --"): string => {
    const dir = mkdtempSync(join(tmpdir(), "heavy-trigger-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "trigger-probe",
        version: "0.0.0",
        scripts: { heavy: `${reaper}; ${wrapper}` },
      }),
    );
    writeFileSync(
      join(dir, "show.js"),
      "console.log('ARGV ' + JSON.stringify(process.argv.slice(2)));",
    );
    writeFileSync(join(dir, "fail.js"), "process.exit(3);");
    writeFileSync(
      join(dir, "exit42.js"),
      "console.log('ARGV ' + JSON.stringify(process.argv.slice(2))); process.exit(42);",
    );
    return dir;
  };
  const run = (dir: string, args: string[]): { out: string; code: number } => {
    try {
      return {
        out: execFileSync("pnpm", ["heavy", ...args], { cwd: dir, encoding: "utf8" }),
        code: 0,
      };
    } catch (e) {
      const err = e as { stdout?: string; status?: number };
      return { out: err.stdout ?? "", code: err.status ?? -1 };
    }
  };

  it.each([
    ["absent reaper", "node no-such-reaper.js"],
    ["reaper exiting 3", "node fail.js"],
  ])(
    "%s: the wrapper still runs with identical argv",
    (_label, reaper) => {
      expect(run(build(reaper), ["pnpm", "mutation:guards"]).out).toContain(
        `ARGV ["--","pnpm","mutation:guards"]`,
      );
    },
    120_000,
  );

  it("forwards an explicit '--' through to the wrapper", () => {
    expect(run(build("node fail.js"), ["--", "node", "-e", "1"]).out).toContain(
      `ARGV ["--","--","node","-e","1"]`,
    );
  }, 120_000);

  it("still returns the wrapper's own exit status behind a failing reaper", () => {
    expect(run(build("node fail.js", "node exit42.js --"), ["x"]).code).toBe(42);
  }, 120_000);
});
