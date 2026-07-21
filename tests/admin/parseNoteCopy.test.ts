// @vitest-environment node
// Frozen copy oracle (attention-alert-routing §3.2, R1#4). Expected strings are
// FROZEN literals transcribed from the spec, independent of composeParseNote, so
// this is not tautological. Plus a composed-string hygiene sweep over all 8 titles.
import { describe, expect, it } from "vitest";
import { composeParseNote, toNoteItem, type NoteItem } from "@/lib/admin/parseAttentionNote";
import { PARSE_FAILURE_ALLOWLIST } from "@/lib/messages/parseFailureReason";
import type { AttentionItem } from "@/lib/admin/attentionItems";

const mk = (code: string, errorCode: string | null): NoteItem =>
  toNoteItem({
    id: `alert:${code}`,
    kind: "alert",
    tone: "notice",
    sectionId: "warnings",
    crewKey: null,
    actionable: false,
    menuTitle: "x",
    menuSubtitle: null,
    alert: {
      alertId: code,
      code,
      template: null,
      params: {},
      action: null,
      helpHref: null,
      raisedAt: "2026-07-20T00:00:00Z",
      occurrenceCount: 1,
      autoClearNote: null,
      failedKeys: null,
      dataGaps: null,
      errorCode,
    },
  } as AttentionItem)!;

const EXPECT = {
  s1: {
    lead: "Crew are still seeing the last good version.",
    rest: "Your latest changes didn't go through. Two crew rows share an email. Anything listed below is from the version crew can see, not from the change that failed.",
  },
  s2: {
    lead: "Crew are still seeing the last good version.",
    rest: "Your latest changes didn't go through. Anything listed below is from the version crew can see, not from the change that failed.",
  },
  s3: {
    lead: "Crew are still seeing the last good version.",
    rest: "Your latest changes didn't go through. No crew rows.",
  },
  s4: {
    lead: "Crew are still seeing the last good version.",
    rest: "Your latest changes didn't go through.",
  },
  s5: {
    lead: "This version is live for crew.",
    rest: "The latest changes lost some detail, and the problems below are what stopped reading.",
  },
  s6: { lead: "This version is live for crew.", rest: "The latest changes lost some detail." },
} as const;

describe("6-state copy matrix (frozen oracle)", () => {
  it("s1", () =>
    expect(composeParseNote(mk("PARSE_ERROR_LAST_GOOD", "MI-5b_DUPLICATE_CREW_EMAIL"), 3)).toEqual(EXPECT.s1));
  it("s2", () => expect(composeParseNote(mk("PARSE_ERROR_LAST_GOOD", null), 3)).toEqual(EXPECT.s2));
  it("s3", () =>
    expect(composeParseNote(mk("PARSE_ERROR_LAST_GOOD", "MI-4_NO_CREW"), 0)).toEqual(EXPECT.s3));
  it("s4", () => expect(composeParseNote(mk("PARSE_ERROR_LAST_GOOD", null), 0)).toEqual(EXPECT.s4));
  it("s5", () => expect(composeParseNote(mk("RESYNC_QUALITY_REGRESSED", null), 3)).toEqual(EXPECT.s5));
  it("s6", () => expect(composeParseNote(mk("RESYNC_QUALITY_REGRESSED", null), 0)).toEqual(EXPECT.s6));
});

describe("composed-string hygiene across ALL 8 reason titles", () => {
  it.each([...PARSE_FAILURE_ALLOWLIST])("%s: no em dash / doubled period / doubled space", (rc) => {
    const c = composeParseNote(mk("PARSE_ERROR_LAST_GOOD", rc), 2);
    const s = `${c.lead} ${c.rest}`;
    expect(s).not.toMatch(/—/);
    expect(s).not.toMatch(/\.\./);
    expect(s).not.toMatch(/ {2}/);
  });
});
