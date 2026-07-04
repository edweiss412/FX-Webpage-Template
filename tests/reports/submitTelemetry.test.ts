import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { cleanupReportFixtures, seedShow } from "@/tests/reports/_dbHelpers";
import { setLogSink, resetLogSink } from "@/lib/log";
import type { LogRecord } from "@/lib/log/types";

// S3: report-submission success (a genuine 201-created) previously left only a `reports`
// DB row + a GitHub issue — no app_events breadcrumb tying request→outcome. Each
// 201-created path now emits a fail-open `void log.info` CREW_REPORT_SUBMITTED forensic
// breadcrumb (showId + issueUrl). Recovered/duplicate/error paths do NOT emit (no false
// "submitted" trace).

const githubMock = vi.hoisted(() => ({
  calls: [] as Array<{ title: string; body: string; labels: string[] }>,
  createIssue: vi.fn(async (input: { title: string; body: string; labels: string[] }) => {
    githubMock.calls.push(input);
    return {
      htmlUrl: `https://github.com/edweiss412/FX-Webpage-Template/issues/${githubMock.calls.length}`,
      issueNumber: githubMock.calls.length,
      labels: input.labels,
    };
  }),
}));

vi.mock("@/lib/github/issues", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/github/issues")>();
  return { ...actual, createIssue: githubMock.createIssue };
});

const { submitReport } = await import("@/lib/reports/submit");

const showId = "018f2f4c-3333-4333-9333-000000000001";
const adminIdentity = "doug@example.com";

function body(idempotencyKey: string) {
  return {
    idempotency_key: idempotencyKey,
    show_id: showId,
    message: "The schedule looks wrong",
    surface: "admin_parse_panel",
    reporter_role: "A1",
  };
}

describe("submitReport success telemetry (S3)", () => {
  beforeEach(() => {
    githubMock.calls = [];
    githubMock.createIssue.mockClear();
    seedShow(showId, "s3-telemetry");
  });

  afterEach(() => {
    resetLogSink();
    cleanupReportFixtures(showId, [adminIdentity]);
  });

  test("201-created emits exactly one CREW_REPORT_SUBMITTED info with showId + issueUrl", async () => {
    const sink: LogRecord[] = [];
    setLogSink((r) => {
      sink.push(r);
    });
    const key = "018f2f4c-8f54-4c28-9f56-a0a1a2a3a4a5";

    const result = await submitReport({ kind: "admin", email: adminIdentity }, body(key));
    expect(result.status).toBe(201);

    const rec = sink.filter((r) => r.code === "CREW_REPORT_SUBMITTED");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.level).toBe("info");
    expect(rec[0]!.source).toBe("reports.submit");
    expect(rec[0]!.showId).toBe(showId);
    expect(rec[0]!.context.issueUrl).toBe(
      "https://github.com/edweiss412/FX-Webpage-Template/issues/1",
    );
  });

  test("duplicate (200) emits NO CREW_REPORT_SUBMITTED breadcrumb", async () => {
    const key = "018f2f4c-8f54-4c28-9f56-b0b1b2b3b4b5";

    // First create (suppress the setup emit) → 201.
    setLogSink(() => {});
    const first = await submitReport({ kind: "admin", email: adminIdentity }, body(key));
    expect(first.status).toBe(201);

    // Re-submitting the same idempotency key resolves to a 200 duplicate — no new create,
    // so no CREW_REPORT_SUBMITTED breadcrumb.
    const sink: LogRecord[] = [];
    setLogSink((r) => {
      sink.push(r);
    });
    const second = await submitReport({ kind: "admin", email: adminIdentity }, body(key));
    expect(second.status).toBe(200);
    expect(sink.some((r) => r.code === "CREW_REPORT_SUBMITTED")).toBe(false);
  });
});
