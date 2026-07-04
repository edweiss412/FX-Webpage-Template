import { describe, expect, test } from "vitest";
import { formatEvents, formatEventLineNdjson } from "@/scripts/observe/format";
const row = {
  id: "a",
  occurredAt: "2026-07-03T00:00:00.000Z",
  level: "error" as const,
  source: "cron.sync",
  message: "boom",
  code: "C",
  requestId: null,
  showId: null,
  driveFileId: null,
  actorHash: null,
  context: {},
  showTitle: null,
  showSlug: null,
};

describe("format", () => {
  test("empty table → (no rows)", () => {
    expect(formatEvents([], false)).toContain("(no rows)");
  });
  test("json → parseable, round-trips input", () => {
    const out = formatEvents([row], true);
    expect(JSON.parse(out)).toEqual([row]);
  });
  test("table contains level+code+message from the input", () => {
    const out = formatEvents([row], false);
    expect(out).toContain(row.level);
    expect(out).toContain(row.code);
    expect(out).toContain(row.message);
  });
  test("ndjson line is one parseable object", () => {
    const line = formatEventLineNdjson(row);
    expect(line.endsWith("\n")).toBe(true);
    expect(JSON.parse(line)).toEqual(row);
  });
});
