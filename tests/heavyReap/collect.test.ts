import { execFileSync, spawn } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { premiseHolds } from "../_shared/premise";
import { PS_TIMEOUT_MS, collect, parseEtime, parsePsOutput } from "../../lib/heavyReap/collect";

const SAMPLE = readFileSync(new URL("./fixtures/ps-sample.txt", import.meta.url), "utf8");
const FAKE_PS = new URL("./fixtures/fake-ps.mjs", import.meta.url).pathname;

describe("parsePsOutput", () => {
  it("premise: the committed fixture contains a real worker line", () => {
    premiseHolds("ps-sample.txt holds >=1 vitest worker", SAMPLE.includes("vitest/dist/workers/"));
  });

  it("parses every non-empty line into a row", () => {
    const expected = SAMPLE.split("\n").filter((l) => l.trim().length > 0).length;
    expect(parsePsOutput(SAMPLE)).toHaveLength(expected);
  });

  it("keeps a full-length worker command intact", () => {
    const lengths = parsePsOutput(SAMPLE)
      .filter((r) => r.kind === "parsed" && r.command.includes("vitest/dist/workers/"))
      .map((r) => (r.kind === "parsed" ? r.command.length : 0));
    expect(Math.max(...lengths)).toBeGreaterThan(200);
  });

  it("R1: a line with no numeric pid becomes an unparsable row", () => {
    expect(parsePsOutput("garbage line\n")[0]).toMatchObject({ kind: "unparsable" });
  });

  const LS = "Sun Aug 16 09:35:23 2026";

  it.each([
    ["R2", `  700  xx  01:00 ${LS} node /x/vitest/dist/workers/forks.js`, "ppid"],
    ["R3", `  700  1  zzzz ${LS} node /x/vitest/dist/workers/forks.js`, "etimeSeconds"],
  ])("%s: an unparsable field becomes null, not a dropped row", (_id, line, field) => {
    expect(parsePsOutput(`${line}\n`)[0]).toMatchObject({ kind: "parsed", [field]: null });
  });

  it("reads lstart out of its fixed five-token window and leaves the command intact", () => {
    const row = parsePsOutput(`  700  1  01:00 ${LS} /usr/bin/node /x/a b.js\n`)[0];
    expect(row).toMatchObject({
      kind: "parsed",
      startedAt: LS,
      command: "/usr/bin/node /x/a b.js",
    });
  });

  it("pins LC_ALL=C, because lstart is %c and its token count is locale-dependent", () => {
    // The ambient locale must not reach ps: under zh_CN it renders in FOUR tokens on this machine,
    // which would shift a token between startedAt and command.
    process.env.LC_ALL = "zh_CN.UTF-8";
    process.env.LANG = "zh_CN.UTF-8";
    try {
      const r = collect();
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const self = r.rows.find((row) => row.kind === "parsed" && row.pid === process.pid);
      premiseHolds("this process appears in the live read", self !== undefined);
      expect(self).toMatchObject({ kind: "parsed" });
      if (self?.kind === "parsed") expect(self.startedAt).not.toBeNull();
    } finally {
      delete process.env.LC_ALL;
      delete process.env.LANG;
    }
  }, 20_000);

  it("an unvalidatable lstart makes the ROW unparsable, not a row with a shifted command", () => {
    // Emitting a parsed row here would slide a date fragment into `command`, where it becomes
    // argv[0] and the row declines as not-a-worker: the right verdict for the wrong reason, and a
    // reason no report would explain (round 14).
    const row = parsePsOutput(
      "  700  1  01:00 not-a-date node /x/vitest/dist/workers/forks.js\n",
    )[0];
    expect(row).toMatchObject({ kind: "unparsable" });
    if (row?.kind === "unparsable") expect(row.problem).toContain("lstart");
  });

  it("a short line with no lstart field at all is likewise unparsable", () => {
    expect(parsePsOutput("  700  1  01:00 /usr/bin/node /x/a.js\n")[0]).toMatchObject({
      kind: "unparsable",
    });
  });

  it("C2: empty ps output yields zero rows, not a throw", () => {
    expect(parsePsOutput("")).toEqual([]);
  });
});

describe("parseEtime", () => {
  it.each([
    ["MM:SS", "01:30", 90],
    ["HH:MM:SS", "01:00:00", 3600],
    ["D-HH:MM:SS", "1-00:00:00", 86_400],
    ["the incident's oldest orphan", "1-05:29:53", 106_193],
  ])("parses the %s form", (_label, raw, seconds) => {
    expect(parseEtime(raw)).toBe(seconds);
  });

  it.each([["zzz"], [""], ["12"], ["1-2-3:04:05"]])("rejects %s", (raw) => {
    expect(parseEtime(raw)).toBeNull();
  });
});

describe("collect: AC-7, all three spellings of C1", () => {
  it("binary missing => ps-unavailable", () => {
    const r = collect("/definitely/not/a/real/ps");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problem).toBe("ps-unavailable");
  });

  it("non-zero exit => ps-failed, NOT an empty world", () => {
    process.env.FAKE_PS_MODE = "fail";
    try {
      const r = collect(FAKE_PS);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.problem).toBe("ps-failed");
    } finally {
      delete process.env.FAKE_PS_MODE;
    }
  });

  it("permission denied => ps-failed, NOT an empty world", () => {
    const dir = mkdtempSync(join(tmpdir(), "heavy-reap-denied-"));
    const denied = join(dir, "ps");
    writeFileSync(denied, "#!/bin/sh\necho hi\n");
    chmodSync(denied, 0o000);
    const r = collect(denied);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(["ps-failed", "ps-unavailable"]).toContain(r.problem);
  });

  it("AC-8: a hanging ps is bounded and reported, never waited on forever", () => {
    // No timeout-override seam: nothing reads one, and setting a variable no code consults would
    // read as though this case could bound the wait independently of the constant it guards. The
    // real `PS_TIMEOUT_MS` is what is under test, so the assertion is written against it.
    process.env.FAKE_PS_MODE = "hang";
    const started = Date.now();
    try {
      const r = collect(FAKE_PS);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.problem).toBe("ps-timeout");
    } finally {
      delete process.env.FAKE_PS_MODE;
    }
    const elapsed = Date.now() - started;
    // Bracketed on BOTH sides. An upper bound alone is satisfied by a collector that gave up
    // instantly, which is the failure this case would most want to notice.
    expect(elapsed).toBeGreaterThanOrEqual(PS_TIMEOUT_MS - 1_000);
    expect(elapsed).toBeLessThan(PS_TIMEOUT_MS + 5_000);
  }, 30_000);
});

describe("collect: AC-10 live smoke against an INDEPENDENT ps read", () => {
  it("agrees with a direct ps -o read for a process the test spawned", async () => {
    const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 20000)"]);
    try {
      // Old enough to DISCRIMINATE: at ~1 s the gap between a correct 1 and a wrong 0 sits inside
      // any tolerance, so a collector that zeroed every sub-day age would agree with the check.
      await new Promise((r) => setTimeout(r, 4200));
      const result = collect();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const found = result.rows.find((r) => r.kind === "parsed" && r.pid === child.pid);
      premiseHolds("the spawned child appears in the live ps read", found !== undefined);

      // The criterion's independent observation: a SEPARATE ps invocation, parsed here.
      const direct = execFileSync("ps", ["-o", "ppid=,etime=", "-p", String(child.pid)], {
        encoding: "utf8",
      }).trim();
      const [directPpid, directEtime] = direct.split(/\s+/);
      premiseHolds("the direct ps read returned both fields", directEtime !== undefined);

      expect(found).toMatchObject({ kind: "parsed", ppid: Number(directPpid) });
      const collected = found?.kind === "parsed" ? (found.etimeSeconds ?? -1) : -1;
      // Parsed HERE, not by the production parser. Converting the "independent" observation with
      // `parseEtime` compares the collector against itself, and a collector that zeroed every
      // sub-day age would agree with it.
      const mmss = /^(\d+):(\d+)$/.exec(directEtime ?? "");
      premiseHolds("the child's age is in the MM:SS form this assertion parses", mmss !== null);
      const independent = Number(mmss?.[1] ?? 0) * 60 + Number(mmss?.[2] ?? 0);
      premiseHolds(
        "the child is old enough that a zeroing collector is distinguishable",
        independent >= 3,
      );
      expect(Math.abs(collected - independent)).toBeLessThanOrEqual(1);
    } finally {
      child.kill("SIGKILL");
    }
  }, 20_000);
});
