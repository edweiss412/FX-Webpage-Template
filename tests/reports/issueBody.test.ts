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
        showId: baseBody.show_id,
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
        showId: baseBody.show_id,
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
