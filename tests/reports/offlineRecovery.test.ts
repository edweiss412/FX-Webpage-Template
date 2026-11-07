/**
 * tests/reports/offlineRecovery.test.ts
 *
 * Crew offline spec 2026-10-26 §5.2: `offline` lives in `reports.context`. The
 * send that files the issue owns those fields, and a retry against an existing
 * reservation never goes through `reportContext`, so the lease claim has to
 * carry them. Through the real `submitReport` and a real database, with only
 * GitHub mocked.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { cleanupReportFixtures, runPsql, seedShow, sqlString } from "@/tests/reports/_dbHelpers";

const githubMock = vi.hoisted(() => ({
  createIssue: vi.fn(),
  findIssueByMarker: vi.fn(),
}));

vi.mock("@/lib/github/issues", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/github/issues")>();
  return {
    ...actual,
    createIssue: githubMock.createIssue,
    findIssueByMarker: githubMock.findIssueByMarker,
  };
});

const { submitReport } = await import("@/lib/reports/submit");

const showId = "018f2f4c-3333-4333-9333-000000000061";
const key = "018f2f4c-8f54-4c28-9f56-f0f1b2c3d561";
const adminIdentity = "offline-recovery@example.com";
const auth = { kind: "admin", email: adminIdentity } as const;
const otherIdentity = "offline-recovery-other@example.com";
const otherAuth = { kind: "admin", email: otherIdentity } as const;

const ordinary = {
  idempotency_key: key,
  show_id: showId,
  message: "Dock B moved",
  surface: "crew",
};
const T1 = {
  writtenAt: "2026-11-07T14:31:00.000Z",
  pageRenderedAt: "2026-11-07T14:14:00.000Z",
  sentAt: "2026-11-07T15:00:00.000Z",
};
const T2 = { ...T1, sentAt: "2026-11-07T16:00:00.000Z" };

const ISSUE = {
  htmlUrl: "https://github.com/edweiss412/FX-Webpage-Template/issues/offline-recovery",
  issueNumber: 561,
  labels: ["bug-report"],
};

function storedContext(): Record<string, unknown> {
  const raw = runPsql(
    `select context::text from public.reports where idempotency_key = ${sqlString(key)}::uuid;`,
  );
  return JSON.parse(raw) as Record<string, unknown>;
}

function expireLease(): void {
  runPsql(`
    update public.reports
       set processing_lease_until = now() - interval '1 second'
     where idempotency_key = ${sqlString(key)}::uuid;
  `);
}

function issueBodyOfCall(n: number): string {
  const call = githubMock.createIssue.mock.calls[n] as [{ body: string }];
  return call[0].body;
}

describe("offline fields on an existing reservation", () => {
  beforeEach(() => {
    seedShow(showId, "offline-recovery");
    githubMock.createIssue.mockReset();
    githubMock.findIssueByMarker.mockReset();
    githubMock.findIssueByMarker.mockResolvedValue(null);
  });

  afterEach(() => {
    cleanupReportFixtures(showId, [adminIdentity, otherIdentity]);
  });

  test("an ordinary POST whose answer was lost, retried from the queue, gains the fields", async () => {
    githubMock.createIssue
      .mockRejectedValueOnce(new Error("GitHub 5xx after reservation"))
      .mockResolvedValueOnce(ISSUE);

    expect((await submitReport(auth, ordinary)).status).toBe(502);
    expect("offline" in storedContext()).toBe(false);

    expireLease();
    expect((await submitReport(auth, { ...ordinary, offline: T1 })).status).toBe(201);

    expect(storedContext().offline).toEqual(T1);
    expect(issueBodyOfCall(1)).toContain("**Written with no signal**");
  });

  test("a queued POST retried later stores the sent time its issue prints", async () => {
    githubMock.createIssue
      .mockRejectedValueOnce(new Error("GitHub 5xx after reservation"))
      .mockResolvedValueOnce(ISSUE);

    expect((await submitReport(auth, { ...ordinary, offline: T1 })).status).toBe(502);
    expect(storedContext().offline).toEqual(T1);

    expireLease();
    expect((await submitReport(auth, { ...ordinary, offline: T2 })).status).toBe(201);

    expect(storedContext().offline).toEqual(T2);
    expect(issueBodyOfCall(1)).toContain(`sent at ${T2.sentAt}.`);
  });

  test("a retry with no offline fields leaves the context as it was", async () => {
    githubMock.createIssue
      .mockRejectedValueOnce(new Error("GitHub 5xx after reservation"))
      .mockResolvedValueOnce(ISSUE);

    await submitReport(auth, ordinary);
    const before = storedContext();
    expireLease();
    expect((await submitReport(auth, ordinary)).status).toBe(201);

    expect(storedContext()).toEqual(before);
    expect("offline" in storedContext()).toBe(false);
  });

  test("a retry that finds the issue on GitHub files nothing and changes nothing", async () => {
    githubMock.createIssue.mockRejectedValueOnce(new Error("GitHub 5xx after reservation"));
    githubMock.findIssueByMarker.mockResolvedValue(ISSUE);

    await submitReport(auth, ordinary);
    const before = storedContext();
    expireLease();
    await submitReport(auth, { ...ordinary, offline: T1 });

    expect(githubMock.createIssue).toHaveBeenCalledTimes(1);
    expect(storedContext()).toEqual(before);
  });

  describe("a key belongs to the reporter who reserved it", () => {
    function storedReporter(): string {
      return runPsql(
        `select reported_by from public.reports where idempotency_key = ${sqlString(key)}::uuid;`,
      );
    }

    test("another reporter cannot complete an expired reservation", async () => {
      githubMock.createIssue.mockRejectedValueOnce(new Error("GitHub 5xx after reservation"));
      expect((await submitReport(auth, ordinary)).status).toBe(502);
      const before = storedContext();
      expireLease();

      const refused = await submitReport(otherAuth, { ...ordinary, offline: T1 });

      expect(refused).toEqual({ status: 401, body: { ok: false } });
      expect(githubMock.createIssue).toHaveBeenCalledTimes(1);
      expect(githubMock.findIssueByMarker).not.toHaveBeenCalled();
      expect(storedContext()).toEqual(before);
      expect(storedReporter()).toBe(adminIdentity);
    });

    test("another reporter does not learn a finished report's issue", async () => {
      githubMock.createIssue.mockResolvedValueOnce(ISSUE);
      expect((await submitReport(auth, ordinary)).status).toBe(201);

      expect(await submitReport(otherAuth, ordinary)).toEqual({ status: 401, body: { ok: false } });
    });

    test("the same reporter still recovers its own reservation", async () => {
      githubMock.createIssue
        .mockRejectedValueOnce(new Error("GitHub 5xx after reservation"))
        .mockResolvedValueOnce(ISSUE);
      await submitReport(auth, ordinary);
      expireLease();
      expect((await submitReport(auth, ordinary)).status).toBe(201);
    });
  });
});
