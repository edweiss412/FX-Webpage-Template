import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { runPsql, sqlString } from "@/tests/reports/_dbHelpers";
import type { SubmitReportResult } from "@/lib/reports/submit";

// ---------------------------------------------------------------------------
// Harness half 1 (§K5): route validation. Model on tests/reports/auth.test.ts:1-80,
// adapted to inject deps directly via the exported `handleReport(req, deps)` seam
// (app/api/report/route.ts:198) instead of `vi.mock`-ing "@/lib/reports/submit" —
// harness half 2 below imports the REAL submitReport from that same module, and a
// file-scoped vi.mock of it would silently shadow that import too.
// ---------------------------------------------------------------------------

const { handleReport } = await import("@/app/api/report/route");

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    resolvePickerSelection: vi.fn(async () => ({ kind: "no_selection" }) as const),
    requireAdminIdentity: vi.fn(async (): Promise<{ email: string }> => {
      throw new Error("forbidden");
    }),
    submitReport: vi.fn(
      async (): Promise<SubmitReportResult> => ({
        status: 501,
        body: { ok: false, code: "NOT_IMPLEMENTED" },
      }),
    ),
    readCrewRoleFlags: vi.fn(async () => ({ ok: true as const, roleFlags: [] as string[] })),
    ...overrides,
  };
}

const validAdminBody = {
  idempotency_key: "018f2f4c-8f54-4c28-9f56-f0f1b2c3d4e5",
  message: "Staged wizard row looks wrong",
  surface: "admin",
};

function request(body: unknown) {
  return new NextRequest("https://crew.fxav.test/api/report", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/report — show_id null loosening (route validation, §K5)", () => {
  test("show_id null + surface admin + admin auth OK → accepted (submitReport called)", async () => {
    const deps = makeDeps({
      requireAdminIdentity: vi.fn(async () => ({ email: "admin@example.com" })),
      submitReport: vi.fn(async () => ({
        status: 201,
        body: { ok: true, status: "created", github_issue_url: "https://github.test/issue/9" },
      })),
    });

    const response = await handleReport(request({ ...validAdminBody, show_id: null }), deps);

    expect(response.status).toBe(201);
    expect(deps.submitReport).toHaveBeenCalledWith(
      { kind: "admin", email: "admin@example.com" },
      expect.objectContaining({ show_id: null, surface: "admin" }),
    );
  });

  test("show_id null + surface crew_footer → 400, submitReport and picker NOT called", async () => {
    const deps = makeDeps();

    const response = await handleReport(
      request({ ...validAdminBody, show_id: null, surface: "crew_footer" }),
      deps,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false });
    expect(deps.resolvePickerSelection).not.toHaveBeenCalled();
    expect(deps.submitReport).not.toHaveBeenCalled();
  });

  test("show_id non-UUID string + admin → 400 (string still must be UUIDv4)", async () => {
    const deps = makeDeps();

    const response = await handleReport(
      request({ ...validAdminBody, show_id: "not-a-uuid" }),
      deps,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false });
    expect(deps.submitReport).not.toHaveBeenCalled();
  });

  test("show_id absent (undefined) + admin → 400 (only explicit null is loosened)", async () => {
    const deps = makeDeps();

    const response = await handleReport(request({ ...validAdminBody }), deps);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false });
    expect(deps.submitReport).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Harness half 2 (§K6): formatters + call-site guards. Model on
// tests/reports/showContext.test.ts (hoisted supabaseMock records every
// from() query; githubMock.createIssue captures {title, body}).
// ---------------------------------------------------------------------------

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
                  return { data: null, error: null };
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

const { submitReport, buildCrewIssueBody } = await import("@/lib/reports/submit");

const adminIdentity = "staged-wizard-fixture@example.com";
const WSID = "018f2f4c-3333-4333-9333-000000000009";

function cleanupByIdempotencyKey(keys: string[]): void {
  runPsql(`
    delete from public.reports where idempotency_key in (${keys.map((k) => `${sqlString(k)}::uuid`).join(", ")});
    delete from public.report_rate_limits where identity = ${sqlString(adminIdentity)};
  `);
}

function stagedWizardBody(idempotencyKey: string, overrides: Record<string, unknown> = {}) {
  return {
    idempotency_key: idempotencyKey,
    show_id: null as string | null,
    surface: "admin",
    fieldRef: {
      kind: "wizard-step3",
      driveFileId: "drive-abc-123",
      wizardSessionId: WSID,
      driveFileName: "Sheet A",
      stagedShowTitle: "Staged Show",
    },
    ...overrides,
  };
}

describe("submitReport / formatters — show_id null (§K6)", () => {
  const usedKeys: string[] = [];

  beforeEach(() => {
    githubMock.calls = [];
    githubMock.createIssue.mockClear();
    supabaseMock.queries = [];
    supabaseMock.createSupabaseServiceRoleClient.mockClear();
    usedKeys.length = 0;
  });

  afterEach(() => {
    cleanupByIdempotencyKey(usedKeys);
  });

  test("call-site guard: show_id null → readReportShowContext never called (both call sites)", async () => {
    const key = "018f2f4c-8f54-4c28-9f56-f0f1b2c3d4a1";
    usedKeys.push(key);

    const result = await submitReport(
      { kind: "admin", email: adminIdentity },
      stagedWizardBody(key, { showTitle: "Staged Show" }),
    );

    expect(result.status).toBe(201);
    expect(supabaseMock.queries).toEqual([]);
  });

  test("issue body: showTitle present + show_id null → staged title, driveFileId, no null/deleted", async () => {
    const key = "018f2f4c-8f54-4c28-9f56-f0f1b2c3d4a2";
    usedKeys.push(key);
    const body = stagedWizardBody(key, { showTitle: "Staged Show" });

    const result = await submitReport({ kind: "admin", email: adminIdentity }, body);

    expect(result.status).toBe(201);
    const issueBody = githubMock.calls[0]?.body ?? "";
    const showLine = issueBody.split("\n").find((line) => line.startsWith("**Show:**"));
    expect(showLine).toContain("Staged Show");
    expect(issueBody).toContain((body.fieldRef as { driveFileId: string }).driveFileId);
    expect(issueBody).not.toMatch(/\bnull\b/);
    expect(issueBody).not.toContain("(deleted)");
  });

  test("issue body: showTitle/showSlug null + show_id null → terminal staged-wizard fallback", async () => {
    const key = "018f2f4c-8f54-4c28-9f56-f0f1b2c3d4a3";
    usedKeys.push(key);
    const body = stagedWizardBody(key, { showTitle: null, showSlug: null });

    const result = await submitReport({ kind: "admin", email: adminIdentity }, body);

    expect(result.status).toBe(201);
    const issueBody = githubMock.calls[0]?.body ?? "";
    const showLine = issueBody.split("\n").find((line) => line.startsWith("**Show:**"));
    expect(showLine).toContain("staged wizard sheet (no show record)");
    expect(issueBody).not.toMatch(/\bnull\b/);
    expect(issueBody).not.toContain("(deleted)");
    const summaryLine = issueBody.split("\n").find((line) => line.startsWith("**Summary:**"));
    expect(summaryLine).not.toContain("null");
  });
});

describe("buildCrewIssueBody — null-hardening (pure unit, direct import)", () => {
  test("show_id null, no showContext, showSlug null → fallback family, never a null literal", () => {
    const body = {
      idempotency_key: "018f2f4c-8f54-4c28-9f56-f0f1b2c3d4a4",
      show_id: null as string | null,
      showSlug: null,
      message: "note",
      surface: "crew_footer",
    };

    const result = buildCrewIssueBody(
      { kind: "crew", source: "picker", showId: "unused", crewMemberId: "cm-1", roleFlags: [] },
      body,
      null,
      undefined,
    );

    const reportedByLine = result.split("\n")[0];
    expect(reportedByLine).toContain("staged wizard sheet (no show record)");
    expect(reportedByLine).not.toMatch(/\bnull\b/);
  });
});
