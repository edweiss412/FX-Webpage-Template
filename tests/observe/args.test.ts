import { describe, expect, test } from "vitest";
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
