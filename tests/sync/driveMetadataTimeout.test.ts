import type { drive_v3 } from "googleapis";
import { describe, expect, test, vi } from "vitest";
import { DRIVE_FILES_GET_TIMEOUT_MS } from "@/lib/drive/fetch";
import { defaultDrive } from "@/lib/sync/verifyReelOnApply";
import { defaultRetryEmbeddedRevisionAvailability } from "@/lib/sync/applyStaged";

// Deterministic + fast: no real backoff wait, zero jitter.
const fastRetry = { sleep: async () => {}, random: () => 0 };

const driveWithFilesGet = (get: ReturnType<typeof vi.fn>): drive_v3.Drive =>
  ({ files: { get } }) as unknown as drive_v3.Drive;
const driveWithRevisionsList = (list: ReturnType<typeof vi.fn>): drive_v3.Drive =>
  ({ revisions: { list } }) as unknown as drive_v3.Drive;

describe("verifyReelOnApply defaultDrive.getFileMetadata (DXT-3 metadata timeout)", () => {
  test("forwards a per-call gaxios timeout + retry:false to files.get (supportsAllDrives stays in params)", async () => {
    const get = vi.fn().mockResolvedValue({ data: { mimeType: "video/mp4" } });
    const meta = await defaultDrive({
      drive: driveWithFilesGet(get),
      retry: fastRetry,
    }).getFileMetadata("file-1");

    expect(meta.mimeType).toBe("video/mp4");
    expect(get).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "file-1", supportsAllDrives: true }),
      { timeout: DRIVE_FILES_GET_TIMEOUT_MS, retry: false },
    );
  });

  test("retries a gaxios TimeoutError (classified transient 504), then succeeds", async () => {
    const get = vi
      .fn()
      .mockRejectedValueOnce({ code: "TimeoutError" })
      .mockResolvedValue({ data: { mimeType: "video/mp4" } });
    const meta = await defaultDrive({
      drive: driveWithFilesGet(get),
      retry: fastRetry,
    }).getFileMetadata("file-1");

    expect(meta.mimeType).toBe("video/mp4");
    expect(get).toHaveBeenCalledTimes(2);
  });

  test("does NOT retry a non-transient 404 — it propagates to drift handling (called once)", async () => {
    const get = vi.fn().mockRejectedValue({ code: 404 });
    await expect(
      defaultDrive({ drive: driveWithFilesGet(get), retry: fastRetry }).getFileMetadata("file-1"),
    ).rejects.toMatchObject({ code: 404 });
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe("applyStaged defaultRetryEmbeddedRevisionAvailability (DXT-3 metadata timeout)", () => {
  test("forwards a per-call gaxios timeout + retry:false to revisions.list; true when a revision has an id", async () => {
    const list = vi.fn().mockResolvedValue({ data: { revisions: [{ id: "rev-1" }] } });
    const available = await defaultRetryEmbeddedRevisionAvailability("sheet-1", {
      drive: driveWithRevisionsList(list),
      retry: fastRetry,
    });

    expect(available).toBe(true);
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "sheet-1", fields: "revisions(id)" }),
      { timeout: DRIVE_FILES_GET_TIMEOUT_MS, retry: false },
    );
  });

  test("retries a gaxios TimeoutError then succeeds", async () => {
    const list = vi
      .fn()
      .mockRejectedValueOnce({ code: "TimeoutError" })
      .mockResolvedValue({ data: { revisions: [{ id: "rev-1" }] } });
    const available = await defaultRetryEmbeddedRevisionAvailability("sheet-1", {
      drive: driveWithRevisionsList(list),
      retry: fastRetry,
    });

    expect(available).toBe(true);
    expect(list).toHaveBeenCalledTimes(2);
  });

  test("returns false when no revision carries an id", async () => {
    const list = vi.fn().mockResolvedValue({ data: { revisions: [{ id: null }] } });
    const available = await defaultRetryEmbeddedRevisionAvailability("sheet-1", {
      drive: driveWithRevisionsList(list),
      retry: fastRetry,
    });
    expect(available).toBe(false);
  });
});
