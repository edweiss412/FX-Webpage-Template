import { describe, expect, test } from "vitest";

import type { OfflineFields } from "@/lib/reports/offlineMeta";
import {
  buildAdminIssueBody,
  buildCrewIssueBody,
  reportContext,
  type ReportAuthContext,
  type RequestBody,
} from "@/lib/reports/submit";
import { premiseHolds } from "@/tests/_shared/premise";

const baseBody: RequestBody = {
  idempotency_key: "018f2f4c-8f54-4c28-9f56-f0f1b2c3d4e5",
  show_id: "018f2f4c-0000-4000-9000-000000000001",
  surface: "admin_parse_panel",
  message: "Doug note with context",
  fieldRef: {
    path: "rooms[0].audio",
    driveFileId: "drive-file-123",
  },
  parseWarnings: [{ code: "UNKNOWN_ROLE_TOKEN", row: 14 }],
  rawSnippet: "raw sheet text near the problem",
  viewerVisibleSection: "schedule",
  userAgent: "test-browser/1.0",
  lastSyncTimestamp: "2026-05-12T15:00:00Z",
  staleTier: "fresh",
  rightNowState: { state: "show_day_n", day: 1 },
};

describe("report issue body templates", () => {
  test("admin body leads with a self-identifying Summary headline (data-quality report)", () => {
    // Failure mode: a dev triaging the GitHub issue can't tell at a glance what/where the
    // problem is without reading the whole body. The Summary line must self-identify.
    const body = buildAdminIssueBody(
      { kind: "admin", email: "doug@example.com" },
      {
        ...baseBody,
        surface: "data-quality",
        fieldRef: {
          surface: "data-quality",
          code: "UNKNOWN_FIELD",
          sourceCell: { title: "INFO", gid: 0, a1: "A55" },
          blockRef: null,
        },
        parseWarnings: [
          {
            code: "UNKNOWN_FIELD",
            message: "Unrecognized event_details row label: 'Floor Plan'",
            sourceCell: { title: "INFO", gid: 0, a1: "A55" },
          },
        ],
        rawSnippet: "Floor Plan | LINK",
      },
      null,
      {
        title: "RPAS Central",
        slug: "rpas",
        drive_file_id: "d1",
        last_synced_at: "2026-06-03T10:00:00Z",
      },
    );
    const firstLine = body.split("\n")[0]!;
    expect(firstLine).toContain("**Summary:**");
    expect(firstLine).toContain("Unrecognized event_details row label: 'Floor Plan'");
    expect(firstLine).toContain("(UNKNOWN_FIELD)");
    expect(firstLine).toContain("RPAS Central");
    expect(firstLine).toContain("A55");
  });

  test("Summary headline degrades cleanly for a non-data-quality report (no warning/code)", () => {
    // Failure mode: a crew/admin report without an autocaptured warning renders "undefined"
    // or crashes. It must fall back to surface + show.
    const body = buildAdminIssueBody(
      { kind: "admin", email: "doug@example.com" },
      {
        ...baseBody,
        surface: "admin_parse_panel",
        fieldRef: { path: "venue.notes" },
        parseWarnings: null,
        rawSnippet: null,
      },
      null,
      { title: "Test Show", slug: "test-show", drive_file_id: "d1", last_synced_at: null },
    );
    const firstLine = body.split("\n")[0]!;
    expect(firstLine).toContain("**Summary:**");
    expect(firstLine).toContain("Test Show");
    expect(firstLine).not.toContain("undefined");
    expect(firstLine).not.toContain("null");
  });

  test("admin body contains canonicalized admin email, raw snippet, and marker", () => {
    // Failure modes: admin attribution regresses to literal "admin"; the
    // template regresses to the old minimal builder; the retry marker drops.
    const body = buildAdminIssueBody({ kind: "admin", email: "doug@example.com" }, baseBody, null);

    expect(body).toContain("**Reported by:** doug@example.com");
    expect(body).not.toContain("**Reported by:** admin\n");
    expect(body).toContain("raw sheet text near the problem");
    expect(body).toContain(`<!-- fxav-report-id: ${baseBody.idempotency_key} -->`);
  });

  test("admin body contains field ref, parse warnings, drive file ID, last sync, user agent, and message", () => {
    // Failure mode: body rendering ignores autocaptured admin RequestBody fields.
    const body = buildAdminIssueBody({ kind: "admin", email: "doug@example.com" }, baseBody, null);

    expect(body).toContain("rooms[0].audio");
    expect(body).toContain("UNKNOWN_ROLE_TOKEN");
    expect(body).toContain("drive-file-123");
    expect(body).toContain("2026-05-12T15:00:00Z");
    expect(body).toContain("test-browser/1.0");
    expect(body).toContain("> Doug note with context");
  });

  test("admin body renders a card-scoped fieldRef {cardId, region} (per-card report, #207)", () => {
    // Failure mode: a future formatValue change silently drops the card context
    // that lets a deep-link report self-identify its card + sheet region.
    const body = buildAdminIssueBody(
      { kind: "admin", email: "doug@example.com" },
      { ...baseBody, fieldRef: { cardId: "today-dress", region: "dress" } },
      null,
    );
    expect(body).toContain("Field/section ref:");
    expect(body).toContain("today-dress");
    expect(body).toContain("dress");
  });

  test("admin body uses server-derived show context when client autocapture omits show fields", () => {
    // Failure mode: production callers send only show_id, so issue bodies
    // regress to UUID/Not captured instead of the spec-required show context.
    const { lastSyncTimestamp: _lastSyncTimestamp, ...bodyWithoutLastSync } = baseBody;
    const body = buildAdminIssueBody(
      { kind: "admin", email: "doug@example.com" },
      {
        ...bodyWithoutLastSync,
        fieldRef: { path: "venue.notes" },
      },
      null,
      {
        title: "Test Show",
        slug: "test-show",
        drive_file_id: "drive_123",
        last_synced_at: "2026-05-12T16:30:00Z",
      },
    );

    expect(body).toContain("**Show:** Test Show (test-show)");
    expect(body).toContain("**Show drive file ID:** drive_123");
    expect(body).toContain("**Last sync:** 2026-05-12T16:30:00Z");
  });

  test("crew body omits crew identity while retaining visible section and page state", () => {
    // Failure modes: crew privacy regression leaks direct identity; the template
    // regresses to the old minimal builder and drops crew-page autocapture.
    const body = buildCrewIssueBody(
      {
        kind: "crew",
        source: "google",
        showId: baseBody.show_id as string,
        crewMemberId: "018f2f4c-0000-4000-9000-000000000002",
        email: "alex.crew@example.com",
        name: "Alex Crew",
        roleFlags: ["A1", "LEAD"],
      },
      baseBody,
      "A1,LEAD",
    );

    expect(body).not.toContain("alex.crew@example.com");
    expect(body).not.toContain("Alex Crew");
    expect(body).not.toContain("018f2f4c-0000-4000-9000-000000000002");
    expect(body).toContain("**Section being viewed:** schedule");
    expect(body).toContain("show_day_n");
    expect(body).toContain("A1,LEAD");
    expect(body).toContain(`<!-- fxav-report-id: ${baseBody.idempotency_key} -->`);
  });

  test("crew body uses server-derived show context when client autocapture omits show fields", () => {
    // Failure mode: real crew footer submissions omit title/slug/drive id and
    // the body renders UUID/Not captured instead of server-owned metadata.
    const { lastSyncTimestamp: _lastSyncTimestamp, ...bodyWithoutLastSync } = baseBody;
    const body = buildCrewIssueBody(
      {
        kind: "crew",
        source: "google",
        showId: baseBody.show_id as string,
        crewMemberId: "018f2f4c-0000-4000-9000-000000000002",
        roleFlags: ["A1"],
      },
      {
        ...bodyWithoutLastSync,
        fieldRef: null,
      },
      "A1",
      {
        title: "Test Show",
        slug: "test-show",
        drive_file_id: "drive_123",
        last_synced_at: "2026-05-12T16:30:00Z",
      },
    );

    expect(body).toContain("**Show:** Test Show (test-show)");
    expect(body).toContain("**Show drive file ID:** drive_123");
    expect(body).toContain("- Last sync: 2026-05-12T16:30:00Z");
  });
});

// ---------------------------------------------------------------------------
// help surface (2026-08-09 spec §2.4). The null-show fallback branches on the
// surface: help issues read as non-show recurrence reports, the staged-wizard
// copy stays for everything else.
// ---------------------------------------------------------------------------
describe("help surface issue body (spec §2.4)", () => {
  const HELP_CODE = "AMBIGUOUS_EMAIL_BINDING";

  const helpBody: RequestBody = {
    ...baseBody,
    surface: "help",
    show_id: null,
    showTitle: null,
    showSlug: null,
    fieldRef: { helpCode: HELP_CODE },
  };

  test("renders non-show line, help surface, and helpCode; no wizard copy", () => {
    const body = buildAdminIssueBody(
      { kind: "admin", email: "doug@example.com" },
      helpBody,
      null,
      undefined,
    );

    // Line-anchored: a suffix on the fallback string fails here, where a bare
    // `toContain` would pass.
    expect(body).toMatch(/^\*\*Show:\*\* non-show recurrence report \(\/help\/errors\)$/m);
    expect(body).toMatch(/^\*\*Surface:\*\* help$/m);
    expect(body).toContain(HELP_CODE);
    expect(body).not.toContain("staged wizard sheet");
  });

  test("keeps wizard copy for admin + null show", () => {
    const body = buildAdminIssueBody(
      { kind: "admin", email: "doug@example.com" },
      { ...helpBody, surface: "admin", fieldRef: { kind: "wizard-step3" } },
      null,
      undefined,
    );

    expect(body).toMatch(/^\*\*Show:\*\* staged wizard sheet \(no show record\)$/m);
    expect(body).not.toContain("non-show recurrence report");
  });
});

/**
 * Crew offline spec 2026-10-26 §5.2. The two literals are the builders' output
 * captured before the section existed, so an ordinary report staying unchanged
 * is measured against something other than the changed builder.
 */
describe("the offline section", () => {
  const crew: Extract<ReportAuthContext, { kind: "crew" }> = {
    kind: "crew",
    source: "picker",
    showId: "s",
    crewMemberId: "c",
    roleFlags: ["A1"],
  };
  const admin: Extract<ReportAuthContext, { kind: "admin" }> = {
    kind: "admin",
    email: "doug@example.com",
  };
  const body: RequestBody = {
    idempotency_key: "018f2f4c-8f54-4c28-9f56-f0f1b2c3d4e5",
    show_id: "018f2f4c-0000-4000-9000-000000000001",
    surface: "crew",
    message: "Freight elevator 3 is out",
    viewerVisibleSection: "schedule",
    userAgent: "test-browser/1.0",
  };
  const offline: OfflineFields = {
    writtenAt: "2026-11-07T14:31:00.000Z",
    pageRenderedAt: "2026-11-07T14:14:00.000Z",
    sentAt: "2026-11-07T15:05:00.000Z",
  };

  const CREW_BASELINE =
    "**Reported by:** crew member of `018f2f4c-0000-4000-9000-000000000001` (role flags: `A1`)\n_(Reporter identity intentionally NOT included; Eric can look up via `reports.id` if needed.)_\n\n**Show:** 018f2f4c-0000-4000-9000-000000000001\n**Surface:** crew\n**Section being viewed:** schedule\n\n**Crew member's note:**\n\n> Freight elevator 3 is out\n\n**Page state at submission:**\n\n- Right Now state: Not captured\n- Last sync: Not captured\n- Stale tier: Not captured\n- User agent: test-browser/1.0\n\n**Show drive file ID:** Not captured\n\n<!-- fxav-report-id: 018f2f4c-8f54-4c28-9f56-f0f1b2c3d4e5 -->";
  const ADMIN_BASELINE =
    "**Summary:** crew report\n\n**Reported by:** doug@example.com\n**Show:** 018f2f4c-0000-4000-9000-000000000001\n**Surface:** crew\n**Crew context:** Not captured\n**Reporter role snapshot:** N/A - admin submission\n**Field/section ref:** Not captured\n\n**Sheet warnings (this section):**\n\n- None captured\n\n**Doug's note:**\n\n> Freight elevator 3 is out\n\n**Raw snippet:**\n\n```\nNot captured\n```\n\n**Last sync:** Not captured\n**Show drive file ID:** Not captured\n**User agent:** test-browser/1.0\n**Reporter URL:** Not captured\n\n<!-- fxav-report-id: 018f2f4c-8f54-4c28-9f56-f0f1b2c3d4e5 -->";

  test("an ordinary report is unchanged, byte for byte", () => {
    expect(buildCrewIssueBody(crew, body, "A1")).toBe(CREW_BASELINE);
    expect(buildAdminIssueBody(admin, body, null)).toBe(ADMIN_BASELINE);
  });

  test("the crew body has it after the note and before the page state", () => {
    const text = buildCrewIssueBody(crew, { ...body, offline }, "A1");
    const note = text.indexOf("> Freight elevator 3 is out");
    const section = text.indexOf("**Written with no signal**");
    const pageState = text.indexOf("**Page state at submission:**");
    premiseHolds("both anchors exist", note >= 0 && pageState >= 0);
    expect(section).toBeGreaterThan(note);
    expect(section).toBeLessThan(pageState);
    expect(text).toContain(
      "Written at 2026-11-07T14:31:00.000Z (phone time), sent at 2026-11-07T15:05:00.000Z.",
    );
    expect(text).toContain("They were looking at the copy saved at 2026-11-07T14:14:00.000Z.");
  });

  test("the admin body has it after the note and before the raw snippet", () => {
    const text = buildAdminIssueBody(admin, { ...body, offline }, null);
    const note = text.indexOf("> Freight elevator 3 is out");
    const section = text.indexOf("**Written with no signal**");
    const raw = text.indexOf("**Raw snippet:**");
    premiseHolds("both anchors exist", note >= 0 && raw >= 0);
    expect(section).toBeGreaterThan(note);
    expect(section).toBeLessThan(raw);
  });

  test("the writer key reaches neither body nor context", () => {
    const secret = "viewer-key-that-must-stay-out";
    const carried = { ...body, offline, writer: secret };
    expect(buildCrewIssueBody(crew, carried, "A1")).not.toContain(secret);
    expect(buildAdminIssueBody(admin, carried, null)).not.toContain(secret);
    expect(JSON.stringify(reportContext(carried))).not.toContain(secret);
  });

  test("context stores the fields, and an ordinary row keeps its shape", () => {
    expect(reportContext({ ...body, offline }).offline).toEqual(offline);
    expect("offline" in reportContext(body)).toBe(false);
    expect("offline" in reportContext({ ...body, offline: null })).toBe(false);
  });
});
