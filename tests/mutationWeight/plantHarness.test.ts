/**
 * The plant harness refuses an unusable entry, and says why.
 *
 * This exists because of a measured failure rather than a hypothesis. A repair
 * to `legSeconds` restructured the loop an existing plant anchored on, so that
 * anchor matched zero times; nobody ran the harness, and the arc went on
 * asserting a "37 plants, 0 escaped" baseline that was false at the commit it
 * cited. The refusal itself was never missing. What was missing was any
 * executable statement that the refusal still fires, which is what this is.
 *
 * `--self-test` runs two synthetic entries that MUST be refused: a target that
 * does not exist, and an anchor matching nothing. Both short-circuit before
 * vitest is spawned, so the whole check costs a process start rather than a
 * mutation sweep.
 */
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function selfTest(): { code: number; out: string } {
  try {
    return {
      code: 0,
      out: execFileSync("node", ["scripts/mutation-weight-plant.mjs", "--self-test"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

describe("mutation-weight-plant --self-test", () => {
  const { code, out } = selfTest();

  it("exits zero, meaning both unusable entries were refused", () => {
    expect(out).toContain("OK");
    expect(code).toBe(0);
  });

  it("refuses them as ANCHOR-FAIL specifically, not merely as not-caught", () => {
    // The REASON is the assertion. An ESCAPE also lands in the failure list, so a
    // check that counted failures passed while the anchor guard was deleted
    // outright: the mismatched entry fell through to a no-op replace, ran green,
    // and was recorded as an escape. Planting that deletion is what produced this
    // case, and reverting to a count would let it back in.
    expect(out).toContain("2/2 refused as ANCHOR-FAIL");
    expect(out).not.toContain("ESCAPED");
  });

  it("names the missing target and the unmatched anchor separately", () => {
    // Two distinct refusal paths, so a single message covering both would hide
    // whichever one stopped firing.
    expect(out).toMatch(/target .*there-is-no-such-file\.ts not found/);
    expect(out).toMatch(/anchor occurs 0 times/);
  });
});
