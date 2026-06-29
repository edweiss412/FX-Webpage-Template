// tests/log/logger.test.ts
import { afterEach, describe, expect, test, vi } from "vitest";
import { log, resetLogSink, setLogSink } from "@/lib/log";
import type { LogRecord } from "@/lib/log/types";
import { runWithRequestContext } from "@/lib/log/requestContext";

function capture() {
  const calls: { record: LogRecord; persist: boolean }[] = [];
  setLogSink((record, persist) => {
    calls.push({ record, persist });
  });
  return calls;
}

afterEach(() => resetLogSink());

describe("logger", () => {
  test("builds a record: reserved keys → columns, extras → context", async () => {
    const calls = capture();
    await log.error("kaboom", {
      source: "test/site",
      code: "X_FAILED",
      showId: "s1",
      driveFileId: "d1",
      actorHash: "h1",
      extra: "ctx",
    });
    const { record } = calls[0]!;
    expect(record).toMatchObject({
      level: "error",
      message: "kaboom",
      source: "test/site",
      code: "X_FAILED",
      showId: "s1",
      driveFileId: "d1",
      actorHash: "h1",
    });
    expect(record.context).toEqual({ extra: "ctx" });
  });

  test("serializes + redacts fields.error into context.error", async () => {
    const calls = capture();
    await log.error("boom", { source: "s", error: new Error("mail eve@corp.io now") });
    const err = calls[0]!.record.context.error as { message: string };
    expect(err.message).toBe("mail [email-redacted] now");
  });

  test("threshold: error/warn always persist; debug never; info only with code/persist", async () => {
    const calls = capture();
    await log.error("a", { source: "s" });
    await log.warn("b", { source: "s" });
    await log.debug("c", { source: "s" });
    await log.info("d", { source: "s" });
    await log.info("e", { source: "s", code: "C" });
    await log.info("f", { source: "s", persist: true });
    expect(calls.map((c) => `${c.record.level}:${c.persist}`)).toEqual([
      "error:true",
      "warn:true",
      "debug:false",
      "info:false",
      "info:true",
      "info:true",
    ]);
  });

  test("auto-attaches requestId/showId from ALS; explicit fields win", async () => {
    const calls = capture();
    await runWithRequestContext({ requestId: "req-7", showId: "show-als" }, async () => {
      await log.warn("x", { source: "s" });
      await log.warn("y", { source: "s", requestId: "explicit", showId: "explicit-show" });
    });
    expect(calls[0]!.record.requestId).toBe("req-7");
    expect(calls[0]!.record.showId).toBe("show-als");
    expect(calls[1]!.record.requestId).toBe("explicit");
    expect(calls[1]!.record.showId).toBe("explicit-show");
  });

  test("explicit null overrides ALS; omission falls through to ALS", async () => {
    const calls = capture();
    await runWithRequestContext({ requestId: "req-als", showId: "show-als" }, async () => {
      await log.warn("a", { source: "s", requestId: null, showId: null });
      await log.warn("b", { source: "s" }); // omitted → inherits ALS
    });
    // explicit null = "no correlation" → wins over ALS
    expect(calls[0]!.record.requestId).toBeNull();
    expect(calls[0]!.record.showId).toBeNull();
    // omitted = "not provided" → inherits ALS (exactOptionalPropertyTypes forbids
    // passing `undefined` explicitly, so omission is the only fall-through path)
    expect(calls[1]!.record.requestId).toBe("req-als");
    expect(calls[1]!.record.showId).toBe("show-als");
  });

  test("default sink writes to console even with no ALS", async () => {
    // Use debug (never persists) so the default sink does NOT attempt a real
    // service-role insert in a unit test.
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    await log.debug("boom", { source: "auth/x", code: "C" });
    expect(spy).toHaveBeenCalledWith(
      "[auth/x] boom",
      expect.objectContaining({ code: "C", level: "debug" }),
    );
    spy.mockRestore();
  });
});
