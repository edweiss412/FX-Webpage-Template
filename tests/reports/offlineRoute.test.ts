/**
 * tests/reports/offlineRoute.test.ts
 *
 * Crew offline spec 2026-10-26 §5.1 and §5.2 at the route: who may file a queued
 * report, what happens to `offline`, and the telemetry code. Through the real
 * `handleReport` and the real viewer key, with auth and `submitReport` injected.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const keyMock = vi.hoisted(() => ({ unavailable: false }));

vi.mock("@/lib/offline/viewerKey", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/offline/viewerKey")>();
  return {
    viewerKey: (showId: string, crewMemberId: string) =>
      keyMock.unavailable ? null : actual.viewerKey(showId, crewMemberId),
  };
});

import { handleReport } from "@/app/api/report/route";
import { resetLogSink, setLogSink } from "@/lib/log";
import type { LogRecord } from "@/lib/log/types";
import { viewerKey } from "@/lib/offline/viewerKey";
import type { ReportAuthContext, RequestBody, SubmitReportResult } from "@/lib/reports/submit";
import { premiseHolds } from "@/tests/_shared/premise";

const SHOW = "018f2f4c-0000-4000-9000-000000000001";
const CREW = "018f2f4c-0000-4000-9000-0000000000a1";
const OTHER_CREW = "018f2f4c-0000-4000-9000-0000000000b2";
const RECEIVED = new Date("2026-11-07T15:05:00.000Z");
const WRITTEN = "2026-11-07T14:31:00.000Z";
const RENDERED = "2026-11-07T14:14:00.000Z";

const ordinary = {
  idempotency_key: "018f2f4c-8f54-4c28-9f56-f0f1b2c3d4e5",
  show_id: SHOW,
  message: "Freight elevator 3 is out",
  surface: "crew",
};
const offline = { writtenAt: WRITTEN, pageRenderedAt: RENDERED };

type Who = "crew" | "admin" | "nobody";

function harness(who: Who) {
  const calls: Array<{ auth: ReportAuthContext; body: RequestBody }> = [];
  const submitReport = vi.fn(
    async (auth: ReportAuthContext, body: RequestBody): Promise<SubmitReportResult> => {
      calls.push({ auth, body });
      return { status: 201, body: { ok: true, status: "created" } };
    },
  );
  const deps = {
    resolvePickerSelection: vi.fn(async () =>
      who === "crew"
        ? { kind: "resolved", crewMemberId: CREW, epoch: 1 }
        : { kind: "no_selection" },
    ),
    requireAdminIdentity: vi.fn(async () => {
      if (who === "admin") return { email: "doug@example.com" };
      throw new Error("forbidden");
    }),
    submitReport,
    readCrewRoleFlags: vi.fn(async () => ({ ok: true as const, roleFlags: ["A1"] })),
  } as unknown as Parameters<typeof handleReport>[1];
  return { deps, calls, submitReport };
}

function post(body: unknown): Request {
  return new Request("https://crew.fxav.test/api/report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const sink: LogRecord[] = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: RECEIVED });
  vi.stubEnv("PICKER_COOKIE_SIGNING_KEY", "ab".repeat(32));
  keyMock.unavailable = false;
  sink.length = 0;
  setLogSink((record) => {
    sink.push(record);
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  resetLogSink();
});

function matching(): string {
  const key = viewerKey(SHOW, CREW);
  premiseHolds("the viewer key is available in this environment", key !== null);
  return key as string;
}

function differing(): string {
  const key = viewerKey(SHOW, OTHER_CREW);
  premiseHolds("another crew member has another key", key !== null && key !== matching());
  return key as string;
}

describe("who may file a queued report", () => {
  // A queued report is only ever filed for the crew member who wrote it. Each
  // refusal stands for a report filed under a name that did not write it.
  test.each<[string, Who, () => Record<string, unknown>, number]>([
    ["crew, no writer", "crew", () => ({ offline }), 401],
    ["crew, matching writer", "crew", () => ({ offline, writer: matching() }), 201],
    ["crew, another person's writer", "crew", () => ({ offline, writer: differing() }), 401],
    ["admin, no writer", "admin", () => ({ offline }), 401],
    ["admin, a writer", "admin", () => ({ offline, writer: matching() }), 401],
    ["nobody, no writer", "nobody", () => ({ offline }), 401],
    ["nobody, a writer", "nobody", () => ({ offline, writer: matching() }), 401],
  ])("%s", async (_name, who, extra, status) => {
    const { deps, submitReport } = harness(who);
    const response = await handleReport(post({ ...ordinary, ...extra() }), deps);
    expect(response.status).toBe(status);
    expect(submitReport).toHaveBeenCalledTimes(status === 201 ? 1 : 0);
    if (status === 401) await expect(response.json()).resolves.toEqual({ ok: false });
  });

  test("a writer alone makes a body queued: another person's is refused and never reserves", async () => {
    const { deps, submitReport } = harness("crew");
    const response = await handleReport(post({ ...ordinary, writer: differing() }), deps);
    expect(response.status).toBe(401);
    expect(submitReport).not.toHaveBeenCalled();
  });

  test("a matching writer with no offline files as an ordinary report", async () => {
    const { deps, calls } = harness("crew");
    const response = await handleReport(post({ ...ordinary, writer: matching() }), deps);
    expect(response.status).toBe(201);
    expect(calls[0]?.body.offline).toBeUndefined();
  });

  test.each<[Who, number]>([
    ["crew", 201],
    ["admin", 201],
    ["nobody", 401],
  ])("a body with neither is exactly today's path for %s", async (who, status) => {
    const { deps, calls } = harness(who);
    const response = await handleReport(post(ordinary), deps);
    expect(response.status).toBe(status);
    if (status === 201) expect(calls[0]?.body).toEqual(ordinary);
  });

  test("offline dropped by validation still counts as queued", async () => {
    const { deps, submitReport } = harness("crew");
    const far = new Date(RECEIVED.getTime() + 25 * 60 * 60 * 1000).toISOString();
    const response = await handleReport(post({ ...ordinary, offline: { writtenAt: far } }), deps);
    expect(response.status).toBe(401);
    expect(submitReport).not.toHaveBeenCalled();
  });

  test("no signing key: a 500 the sender retries, never a refusal, and nothing filed", async () => {
    const writer = matching();
    keyMock.unavailable = true;
    const { deps, submitReport } = harness("crew");
    const response = await handleReport(post({ ...ordinary, offline, writer }), deps);
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ ok: false, code: "REPORT_PIPELINE_FAILED" });
    expect(submitReport).not.toHaveBeenCalled();
  });

  test.each([[7], ["x".repeat(200)], [{}]])("a malformed writer is a 400", async (writer) => {
    const { deps, submitReport } = harness("crew");
    const response = await handleReport(post({ ...ordinary, offline, writer }), deps);
    expect(response.status).toBe(400);
    expect(submitReport).not.toHaveBeenCalled();
  });
});

describe("the offline fields", () => {
  test("reach submitReport normalized, with the body otherwise unchanged", async () => {
    const { deps, calls } = harness("crew");
    const writer = matching();
    await handleReport(post({ ...ordinary, offline, writer }), deps);
    expect(calls[0]?.body).toEqual({
      ...ordinary,
      writer,
      offline: { ...offline, sentAt: RECEIVED.toISOString() },
    });
  });

  test("a far-future writtenAt files the report without them, and warns", async () => {
    const { deps, calls } = harness("crew");
    const far = new Date(RECEIVED.getTime() + 25 * 60 * 60 * 1000).toISOString();
    const response = await handleReport(
      post({ ...ordinary, offline: { writtenAt: far }, writer: matching() }),
      deps,
    );
    expect(response.status).toBe(201);
    expect("offline" in (calls[0]?.body ?? {})).toBe(false);
    expect(sink.filter((r) => r.level === "warn" && r.source === "api/report")).toHaveLength(1);
  });

  test("no offline, no warning", async () => {
    const { deps } = harness("crew");
    await handleReport(post({ ...ordinary, writer: matching() }), deps);
    expect(sink.filter((r) => r.level === "warn")).toEqual([]);
  });
});

describe("REPORT_SUBMITTED_FROM_OFFLINE_QUEUE", () => {
  const emitted = () => sink.filter((r) => r.code === "REPORT_SUBMITTED_FROM_OFFLINE_QUEUE");

  test("one info record on success, after submitReport settled", async () => {
    const { deps, submitReport } = harness("crew");
    let emittedBeforeSettled = false;
    submitReport.mockImplementationOnce(async () => {
      await Promise.resolve();
      emittedBeforeSettled = emitted().length > 0;
      return { status: 200, body: { ok: true, status: "duplicate" } };
    });
    await handleReport(post({ ...ordinary, offline, writer: matching() }), deps);
    expect(emittedBeforeSettled).toBe(false);
    const records = emitted();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ level: "info", source: "api/report", showId: SHOW });
    expect(JSON.stringify(records[0])).toContain('"duplicate"');
  });

  test("the record carries no writer, no message and no key", async () => {
    const { deps } = harness("crew");
    const writer = matching();
    await handleReport(post({ ...ordinary, offline, writer }), deps);
    const text = JSON.stringify(emitted());
    expect(text).not.toContain(writer);
    expect(text).not.toContain(ordinary.message);
    expect(text).not.toContain(ordinary.idempotency_key);
  });

  test("not without offline", async () => {
    const { deps } = harness("crew");
    await handleReport(post({ ...ordinary, writer: matching() }), deps);
    expect(emitted()).toEqual([]);
  });

  test("not on a failure", async () => {
    const { deps, submitReport } = harness("crew");
    submitReport.mockImplementationOnce(async () => ({
      status: 502,
      body: { ok: false, code: "REPORT_LOOKUP_INCONCLUSIVE" },
    }));
    await handleReport(post({ ...ordinary, offline, writer: matching() }), deps);
    expect(emitted()).toEqual([]);
  });
});
