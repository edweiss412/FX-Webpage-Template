import { describe, expect, it, test } from "vitest";
import { parseObserveArgs } from "@/scripts/observe/args";
const UUID = "11111111-1111-1111-1111-111111111111";

describe("parseObserveArgs", () => {
  test("events filters map correctly", () => {
    const r = parseObserveArgs([
      "events",
      "--level",
      "warn,error",
      "--show",
      UUID,
      "--since",
      "7d",
      "--limit",
      "250",
    ]);
    if (r.kind !== "ok") throw new Error(r.message);
    expect(r.command).toBe("events");
    expect(r.eventFilters.levels).toEqual(["warn", "error"]);
    expect(r.eventFilters.showId).toBe(UUID);
    expect(r.eventFilters.sinceHours).toBe(168);
    expect(r.limit).toBe(250);
  });
  test("--since all → null, 1h → 1", () => {
    expect(
      (parseObserveArgs(["events", "--since", "all"]) as { eventFilters: { sinceHours: unknown } })
        .eventFilters.sinceHours,
    ).toBeNull();
    expect(
      (parseObserveArgs(["events", "--since", "1h"]) as { eventFilters: { sinceHours: unknown } })
        .eventFilters.sinceHours,
    ).toBe(1);
  });
  test("invalid level tokens dropped; non-uuid show dropped", () => {
    const r = parseObserveArgs(["events", "--level", "foo,warn", "--show", "nope"]);
    if (r.kind !== "ok") throw new Error("err");
    expect(r.eventFilters.levels).toEqual(["warn"]);
    expect(r.eventFilters.showId).toBeUndefined();
  });
  test("events extra text filters (q, source, request)", () => {
    const r = parseObserveArgs([
      "events",
      "--q",
      "boom",
      "--source",
      "cron.sync",
      "--request",
      "r1",
    ]);
    if (r.kind !== "ok") throw new Error("err");
    expect(r.eventFilters).toMatchObject({ q: "boom", source: "cron.sync", requestId: "r1" });
  });
  test("alerts --open --code", () => {
    const r = parseObserveArgs(["alerts", "--open", "--code", "X"]);
    if (r.kind !== "ok") throw new Error("err");
    expect(r.alertFilters).toMatchObject({ openOnly: true, code: "X" });
  });
  test("codes positional", () => {
    const r = parseObserveArgs(["codes", "WATCH_CHANNEL_ORPHANED"]);
    if (r.kind !== "ok") throw new Error("err");
    expect(r).toMatchObject({ command: "codes", codeArg: "WATCH_CHANNEL_ORPHANED" });
  });
  test("tail follow + interval; limit undefined (20 default applied at dispatch)", () => {
    const r = parseObserveArgs(["tail", "--follow", "--interval", "10"]);
    if (r.kind !== "ok") throw new Error("err");
    expect(r).toMatchObject({ command: "tail", follow: true, interval: 10 });
    expect(r.limit).toBeUndefined();
  });
  test("unknown command and unknown flag → error", () => {
    expect(parseObserveArgs(["bogus"]).kind).toBe("error");
    expect(parseObserveArgs(["events", "--nope"]).kind).toBe("error");
  });
  test("--help / -h / no-args resolve to the help command (not an unknown-flag error)", () => {
    expect(parseObserveArgs(["--help"])).toMatchObject({ kind: "ok", command: "help" });
    expect(parseObserveArgs(["-h"])).toMatchObject({ kind: "ok", command: "help" });
    expect(parseObserveArgs([])).toMatchObject({ kind: "ok", command: "help" });
    expect(parseObserveArgs(["events", "--help"])).toMatchObject({ kind: "ok", command: "help" });
  });
});

const SESSION = "8e5568a8-b3cd-4033-9840-18cba07a55c6";

describe("new-command fail-closed validation (Codex R4 F1 / R5 F1)", () => {
  it.each([
    [["staged", "--session", "not-a-uuid"], /--session must be a UUID/],
    [["staged", "--session", "not-a-uuid", "--reveal-email"], /--session must be a UUID/],
    [["warnings", "--show", "not-a-uuid"], /--show must be a UUID/],
    [["synclog", "--file", ""], /--file/],
    [["failures", "--code", "x".repeat(201)], /--code/],
    [["staged", "--since", "30d"], /--since must be 1h\|24h\|7d\|all/],
    [["synclog", "--status", ""], /--status/],
    [["failures", "--code", "A,B"], /--code must be a single/],
    [["synclog", "--status", "ok,error"], /--status must be a single/],
    [["staged", "--file", "a,b"], /--file must be a single/],
  ])("%j → kind error", (argv, re) => {
    const p = parseObserveArgs(argv as string[]);
    expect(p.kind).toBe("error");
    if (p.kind === "error") expect(p.message).toMatch(re);
  });
  it("existing events posture unchanged: bad --show / --since silently fall back", () => {
    const p = parseObserveArgs(["events", "--show", "not-a-uuid", "--since", "30d"]);
    expect(p.kind).toBe("ok");
    if (p.kind === "ok") {
      expect(p.eventFilters.showId).toBeUndefined();
      expect(p.eventFilters.sinceHours).toBe(24);
    }
  });
  it("valid staged flags map to stagedFilters incl. includePii from --reveal-email", () => {
    const p = parseObserveArgs([
      "staged",
      "--session",
      SESSION,
      "--warnings-only",
      "--full",
      "--reveal-email",
    ]);
    expect(p.kind).toBe("ok");
    if (p.kind === "ok") {
      expect(p.stagedFilters).toMatchObject({
        sessionId: SESSION,
        warningsOnly: true,
        includePii: true,
      });
      expect(p.full).toBe(true);
    }
  });
});

describe("comma lists on events/tail --code/--source (spec §3.2)", () => {
  it("single token → singular field (back-compat)", () => {
    const p = parseObserveArgs(["events", "--code", "A", "--source", "sync"]);
    if (p.kind !== "ok") throw new Error("expected ok");
    expect(p.eventFilters.code).toBe("A");
    expect(p.eventFilters.codes).toBeUndefined();
  });
  it("multi token → plural field, empties dropped", () => {
    const p = parseObserveArgs(["events", "--code", "A,B,,C", "--source", "s1,s2"]);
    if (p.kind !== "ok") throw new Error("expected ok");
    expect(p.eventFilters.codes).toEqual(["A", "B", "C"]);
    expect(p.eventFilters.code).toBeUndefined();
    expect(p.eventFilters.sources).toEqual(["s1", "s2"]);
  });
});

describe("--reveal-email → includePii on all five PII-capable new-command filters", () => {
  it.each([
    ["staged", "stagedFilters", ["--session", SESSION]],
    ["failures", "failureFilters", ["--session", SESSION]],
    ["warnings", "warningsFilters", ["--show", SESSION]],
    ["synclog", "syncLogFilters", ["--file", "abc"]],
    ["deferred", "deferredFilters", []],
  ] as const)("%s → %s.includePii", (command, filterKey, extraArgs) => {
    const p = parseObserveArgs([command, ...extraArgs, "--reveal-email"]);
    expect(p.kind).toBe("ok");
    if (p.kind === "ok") {
      const filters = (p as unknown as Record<string, { includePii?: boolean }>)[filterKey]!;
      expect(filters.includePii).toBe(true);
    }
  });
  it("watch has no includePii field", () => {
    const p = parseObserveArgs(["watch", "--reveal-email"]);
    expect(p.kind).toBe("ok");
    if (p.kind === "ok") {
      expect(
        (p as unknown as { watchFilters: Record<string, unknown> }).watchFilters,
      ).not.toHaveProperty("includePii");
    }
  });
});
