import { describe, expect, test } from "vitest";

import { buildAdminIssueBody, buildCrewIssueBody, type RequestBody } from "@/lib/reports/submit";

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
