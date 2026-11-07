/**
 * tests/reports/offlineMeta.test.ts
 *
 * Crew offline spec 2026-10-26 §5.2: the `offline` fields the route accepts and
 * the section they put in the GitHub issue.
 */
import { describe, expect, test } from "vitest";

import {
  OFFLINE_CLOCK_SKEW_MS,
  offlineIssueLines,
  parseOfflineFields,
  type OfflineFields,
} from "@/lib/reports/offlineMeta";

const RECEIVED = new Date("2026-11-07T15:05:00.000Z");
const WRITTEN = "2026-11-07T14:31:00.000Z";
const RENDERED = "2026-11-07T14:14:00.000Z";

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

describe("parseOfflineFields", () => {
  test.each([[undefined], [null]])("%s is an ordinary report, nothing dropped", (raw) => {
    expect(parseOfflineFields(raw, RECEIVED)).toEqual({ fields: null, dropped: false });
  });

  test.each([
    ["a string", "offline"],
    ["a number", 7],
    ["no writtenAt", { pageRenderedAt: RENDERED }],
    ["a numeric writtenAt", { writtenAt: 1762525860000 }],
    ["prose", { writtenAt: "yesterday" }],
    ["a date with no time", { writtenAt: "2026-11-07" }],
    ["a date that does not exist", { writtenAt: "2026-02-30T10:00:00.000Z" }],
  ])("%s is dropped", (_name, raw) => {
    expect(parseOfflineFields(raw, RECEIVED)).toEqual({ fields: null, dropped: true });
  });

  test("a clock a day ahead passes, one millisecond more does not", () => {
    const limit = RECEIVED.getTime() + OFFLINE_CLOCK_SKEW_MS;
    expect(parseOfflineFields({ writtenAt: iso(limit) }, RECEIVED).fields?.writtenAt).toBe(
      iso(limit),
    );
    expect(parseOfflineFields({ writtenAt: iso(limit + 1) }, RECEIVED)).toEqual({
      fields: null,
      dropped: true,
    });
  });

  test("a report held for a month passes: there is no lower bound", () => {
    const old = iso(RECEIVED.getTime() - 30 * 24 * 60 * 60 * 1000);
    expect(parseOfflineFields({ writtenAt: old }, RECEIVED).dropped).toBe(false);
  });

  test("the timestamp the client writes is the shape the parser accepts", () => {
    // The modal stamps with toISOString; a validator that refused it would drop
    // every real report while every fixture above passed.
    const written = new Date(RECEIVED.getTime() - 1234).toISOString();
    expect(parseOfflineFields({ writtenAt: written }, RECEIVED).fields?.writtenAt).toBe(written);
  });

  test("sentAt is the server's receipt, whatever the phone sent", () => {
    const raw = {
      writtenAt: WRITTEN,
      pageRenderedAt: RENDERED,
      sentAt: "2001-01-01T00:00:00.000Z",
    };
    expect(parseOfflineFields(raw, RECEIVED)).toEqual({
      fields: { writtenAt: WRITTEN, pageRenderedAt: RENDERED, sentAt: RECEIVED.toISOString() },
      dropped: false,
    });
  });

  test.each([[undefined], [null]])(
    "a %s render time is null and nothing is dropped",
    (rendered) => {
      const parsed = parseOfflineFields({ writtenAt: WRITTEN, pageRenderedAt: rendered }, RECEIVED);
      expect(parsed.fields?.pageRenderedAt).toBeNull();
      expect(parsed.dropped).toBe(false);
    },
  );

  test.each([["not a time"], [42]])("a malformed render time (%s) keeps the rest", (rendered) => {
    const parsed = parseOfflineFields({ writtenAt: WRITTEN, pageRenderedAt: rendered }, RECEIVED);
    expect(parsed.fields).toEqual({
      writtenAt: WRITTEN,
      pageRenderedAt: null,
      sentAt: RECEIVED.toISOString(),
    });
    expect(parsed.dropped).toBe(true);
  });
});

describe("offlineIssueLines", () => {
  const fields: OfflineFields = {
    writtenAt: WRITTEN,
    pageRenderedAt: RENDERED,
    sentAt: RECEIVED.toISOString(),
  };

  test.each([[null], [undefined]])("%s adds nothing", (value) => {
    expect(offlineIssueLines(value)).toEqual([]);
  });

  test("the heading and both sentences, exactly", () => {
    expect(offlineIssueLines(fields)).toEqual([
      "**Written with no signal**",
      "",
      `Written at ${WRITTEN} (phone time), sent at ${RECEIVED.toISOString()}.`,
      `They were looking at the copy saved at ${RENDERED}.`,
      "",
    ]);
  });

  test("with no render time the second sentence is gone", () => {
    const text = offlineIssueLines({ ...fields, pageRenderedAt: null }).join("\n");
    expect(text).toContain("Written at");
    expect(text).not.toContain("They were looking");
  });
});
