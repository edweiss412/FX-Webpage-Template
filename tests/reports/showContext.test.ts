import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { cleanupReportFixtures, seedShow } from "@/tests/reports/_dbHelpers";

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

const supabaseMock = vi.hoisted(() => ({
  showRow: null as {
    title: string;
    slug: string;
    drive_file_id: string;
    last_synced_at: string | null;
  } | null,
  showError: null as unknown,
  queries: [] as Array<{ table: string; columns: string; eqColumn: string; eqValue: string }>,
  createSupabaseServiceRoleClient: vi.fn(() => ({
    from(table: string) {
      return {
        select(columns: string) {
          return {
            eq(eqColumn: string, eqValue: string) {
              return {
                async maybeSingle() {
                  supabaseMock.queries.push({ table, columns, eqColumn, eqValue });
                  return { data: supabaseMock.showRow, error: supabaseMock.showError };
                },
              };
            },
          };
        },
      };
    },
  })),
}));

vi.mock("@/lib/github/issues", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/github/issues")>();
  return { ...actual, createIssue: githubMock.createIssue };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: supabaseMock.createSupabaseServiceRoleClient,
}));

const { submitReport } = await import("@/lib/reports/submit");

const showId = "018f2f4c-2222-4222-9222-000000000001";
const adminIdentity = "doug@example.com";

function minimalBody(idempotencyKey: string) {
  return {
    idempotency_key: idempotencyKey,
    show_id: showId,
    message: "Something is wrong",
    surface: "admin_parse_panel",
  };
}

describe("submitReport show context derivation", () => {
  beforeEach(() => {
    githubMock.calls = [];
    githubMock.createIssue.mockClear();
    supabaseMock.showError = null;
    supabaseMock.showRow = {
      title: "Test Show",
      slug: "test-show",
      drive_file_id: "drive_123",
      last_synced_at: "2026-05-12T16:30:00Z",
    };
    supabaseMock.queries = [];
    supabaseMock.createSupabaseServiceRoleClient.mockClear();
    seedShow(showId, "m8-show-context");
  });

  afterEach(() => {
    cleanupReportFixtures(showId, [adminIdentity]);
  });

  test("minimal production report body still creates issue with server-derived show metadata", async () => {
    const key = "018f2f4c-8f54-4c28-9f56-f0f1b2c3d4f1";

    const result = await submitReport({ kind: "admin", email: adminIdentity }, minimalBody(key));

    expect(result.status).toBe(201);
    expect(githubMock.calls[0]?.body).toContain("**Show:** Test Show (test-show)");
    expect(githubMock.calls[0]?.body).toContain("**Show drive file ID:** drive_123");
    expect(githubMock.calls[0]?.body).toContain("**Last sync:** 2026-05-12T16:30:00Z");
    expect(supabaseMock.queries).toEqual([
      {
        table: "shows",
        columns: "title,slug,drive_file_id,last_synced_at",
        eqColumn: "id",
        eqValue: showId,
      },
    ]);
  });

  test("missing show lookup does not fail the submission and renders deleted-show fallback", async () => {
    const key = "018f2f4c-8f54-4c28-9f56-f0f1b2c3d4f2";
    supabaseMock.showRow = null;

    const result = await submitReport({ kind: "admin", email: adminIdentity }, minimalBody(key));

    expect(result.status).toBe(201);
    expect(githubMock.calls[0]?.body).toContain("**Show:** (deleted)");
    expect(githubMock.calls[0]?.body).toContain("**Show drive file ID:** Not captured");
  });
});
