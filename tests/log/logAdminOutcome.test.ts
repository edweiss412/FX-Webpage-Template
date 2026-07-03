import { describe, expect, test, vi, beforeEach } from "vitest";

const logMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock("@/lib/log", () => ({ log: logMock }));

import { logAdminOutcome } from "@/lib/log/logAdminOutcome";
import { hashForLog } from "@/lib/email/hashForLog";

beforeEach(() => logMock.info.mockClear());

describe("logAdminOutcome", () => {
  test("emits log.info with message===code, actorHash (derived), and correlation", async () => {
    await logAdminOutcome({
      code: "STAGE_APPLIED",
      source: "api.admin.onboarding.staged.apply",
      actorEmail: "admin@example.com",
      driveFileId: "drive-1",
      wizardSessionId: "wiz-1",
      result: "reapplied",
    });
    // actorHash derived at test time from hashForLog — never hardcoded.
    expect(logMock.info).toHaveBeenCalledWith("STAGE_APPLIED", {
      code: "STAGE_APPLIED",
      source: "api.admin.onboarding.staged.apply",
      actorHash: hashForLog("admin@example.com"),
      driveFileId: "drive-1",
      wizardSessionId: "wiz-1",
      result: "reapplied",
    });
  });

  test("omits actorHash entirely when actorEmail is absent (never hashes '')", async () => {
    await logAdminOutcome({ code: "SHOW_FINALIZED", source: "api.admin.onboarding.finalize" });
    const [message, fields] = logMock.info.mock.calls[0]!;
    expect(message).toBe("SHOW_FINALIZED");
    expect(fields).not.toHaveProperty("actorHash");
    // absent optionals are omitted, not `undefined`
    expect(fields).toEqual({ code: "SHOW_FINALIZED", source: "api.admin.onboarding.finalize" });
  });

  test("showId + extra spread into the fields", async () => {
    await logAdminOutcome({
      code: "SHOW_FINALIZED",
      source: "s",
      showId: "show-9",
      extra: { committedCount: 3 },
    });
    expect(logMock.info.mock.calls[0]![1]).toMatchObject({ showId: "show-9", committedCount: 3 });
  });

  test("returns a promise that resolves after log.info (awaitable/durable)", async () => {
    let resolved = false;
    logMock.info.mockImplementationOnce(async () => {
      resolved = true;
    });
    await logAdminOutcome({ code: "STAGE_DISCARDED", source: "s" });
    expect(resolved).toBe(true);
  });
});
