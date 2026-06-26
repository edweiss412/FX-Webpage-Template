import { Readable } from "node:stream";
import type { drive_v3 } from "googleapis";
import { describe, expect, test, vi } from "vitest";
import {
  fetchEmbeddedImageBytesTimed,
  fetchLinkedRevisionBytesTimed,
} from "@/lib/sync/assetRecovery";
import {
  snapshotFetchEmbeddedImageBytesTimed,
  snapshotFetchLinkedRevisionBytesTimed,
} from "@/lib/sync/defaultSnapshotAssetsForApply";
import { cronFetchEmbeddedImageBytesTimed } from "@/lib/sync/runScheduledCronSync";
import type {
  EmbeddedImageStub,
  LinkedFolderItemStub,
  PersistedDiagrams,
} from "@/lib/parser/types";

const asDrive = (revisionsGet: ReturnType<typeof vi.fn>): drive_v3.Drive =>
  ({ revisions: { get: revisionsGet } }) as unknown as drive_v3.Drive;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const embeddedEntry = (contentUrl: string | null) =>
  ({ contentUrl }) as unknown as PersistedDiagrams["embeddedImages"][number];
const linkedEntry = () =>
  ({
    driveFileId: "file-1",
    headRevisionId: "rev-1",
  }) as unknown as PersistedDiagrams["linkedFolderItems"][number];

// A web body that produces no chunks; it errors only when the caller's signal
// aborts — i.e. a genuinely stalled (no-progress) download.
function stallingWebBody(signal: AbortSignal): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      signal.addEventListener("abort", () =>
        controller.error(signal.reason ?? new Error("aborted")),
      );
    },
  });
}

// A web body that enqueues `count` chunks at `intervalMs` gaps then closes — a
// healthy-but-slow download that keeps making progress. It is signal-AWARE
// (errors on abort, like stallingWebBody): this is load-bearing — if the guard
// were a total-time timer (or the production `onChunk -> guard.reset()` wiring
// regressed), the guard fires mid-download, aborts the signal, errors this
// stream, and the read returns null instead of the full bytes, failing the
// "not aborted" assertion. With correct idle-reset the signal never fires.
function progressingWebBody(
  count: number,
  intervalMs: number,
  signal: AbortSignal,
): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      signal.addEventListener("abort", () =>
        controller.error(signal.reason ?? new Error("aborted")),
      );
    },
    async pull(controller) {
      if (signal.aborted) return;
      if (i >= count) {
        controller.close();
        return;
      }
      await wait(intervalMs);
      if (signal.aborted) return;
      controller.enqueue(new Uint8Array([i & 0xff]));
      i += 1;
    },
  });
}

// Widened margins for the real-timer progressing tests: chunk gap << idle budget
// (4x headroom) so scheduling jitter on shared CI cannot trip a false abort, and
// total download (COUNT * GAP) > budget so a broken total-time guard fires
// mid-download.
const PROGRESS_COUNT = 6;
const PROGRESS_GAP_MS = 25;
const PROGRESS_BUDGET_MS = 100;

const webResponse = (body: ReadableStream<Uint8Array> | null, ok = true) =>
  ({ ok, body }) as unknown as Response;

describe("fetchEmbeddedImageBytesTimed (DXT-2 stall guard)", () => {
  test("returns null (fail-soft) when the download stalls past the idle budget — never hangs", async () => {
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) =>
      Promise.resolve(webResponse(stallingWebBody(init!.signal!))),
    );

    const result = await fetchEmbeddedImageBytesTimed(
      embeddedEntry("https://drive/img"),
      {},
      {
        fetch: fetchImpl as unknown as typeof fetch,
        getAccessToken: async () => "tok",
        timeoutMs: 20,
      },
    );

    expect(result).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // The fetch was bound by the guard's signal.
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  test("a healthy slow-but-progressing download is NOT aborted (idle-reset, not total-time)", async () => {
    // Total download (6*25=150ms) > the 100ms budget, but each chunk resets the
    // guard, so it never fires. The signal-aware body means a regressed reset
    // would surface as null (see progressingWebBody).
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) =>
      Promise.resolve(
        webResponse(progressingWebBody(PROGRESS_COUNT, PROGRESS_GAP_MS, init!.signal!)),
      ),
    );

    const result = await fetchEmbeddedImageBytesTimed(
      embeddedEntry("https://drive/img"),
      {},
      {
        fetch: fetchImpl as unknown as typeof fetch,
        getAccessToken: async () => "tok",
        timeoutMs: PROGRESS_BUDGET_MS,
      },
    );

    expect(result).not.toBeNull();
    expect((result as { bytes: Uint8Array }).bytes).toHaveLength(PROGRESS_COUNT);
  });

  test("a NON-timeout fetch error propagates (only stalls become null)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNRESET boom");
    });

    await expect(
      fetchEmbeddedImageBytesTimed(
        embeddedEntry("https://drive/img"),
        {},
        {
          fetch: fetchImpl as unknown as typeof fetch,
          getAccessToken: async () => "tok",
          timeoutMs: 1000,
        },
      ),
    ).rejects.toThrow("boom");
  });

  test("returns null on !ok / !body without throwing", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(webResponse(null, false)));
    const result = await fetchEmbeddedImageBytesTimed(
      embeddedEntry("https://drive/img"),
      {},
      {
        fetch: fetchImpl as unknown as typeof fetch,
        getAccessToken: async () => "tok",
        timeoutMs: 20,
      },
    );
    expect(result).toBeNull();
  });

  test("returns null without fetching when contentUrl is absent", async () => {
    const fetchImpl = vi.fn();
    const result = await fetchEmbeddedImageBytesTimed(
      embeddedEntry(null),
      {},
      {
        fetch: fetchImpl as unknown as typeof fetch,
      },
    );
    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("fetchLinkedRevisionBytesTimed (DXT-2 stall guard)", () => {
  test("returns null (fail-soft) when the Node revision stream stalls — guard destroys it, no hang", async () => {
    const stallingNodeStream = new Readable({ read() {} }); // never pushes
    const drive = asDrive(vi.fn(async () => ({ data: stallingNodeStream })));

    const result = await fetchLinkedRevisionBytesTimed(linkedEntry(), {}, { drive, timeoutMs: 20 });

    expect(result).toBeNull();
    expect(stallingNodeStream.destroyed).toBe(true); // the guard interrupted it
  });

  test("reads a healthy Node revision stream to completion", async () => {
    const nodeStream = Readable.from([new Uint8Array([1, 2]), new Uint8Array([3])]);
    const drive = asDrive(vi.fn(async () => ({ data: nodeStream })));

    const result = await fetchLinkedRevisionBytesTimed(
      linkedEntry(),
      {},
      { drive, timeoutMs: 1000 },
    );

    expect((result as { bytes: Uint8Array }).bytes).toHaveLength(3);
  });

  test("a NON-timeout revisions.get error propagates (only stalls become null)", async () => {
    const drive = asDrive(
      vi.fn(async () => {
        throw new Error("revision 404 boom");
      }),
    );

    await expect(
      fetchLinkedRevisionBytesTimed(linkedEntry(), {}, { drive, timeoutMs: 1000 }),
    ).rejects.toThrow("boom");
  });

  // revisions.get can (defensively) yield a Web ReadableStream rather than a Node
  // Readable; cover that branch too. The guard's signal is passed to revisions.get,
  // so a signal-aware web stream is interrupted on stall.
  test("web-stream revision branch (data instanceof ReadableStream): stall → null", async () => {
    const drive = asDrive(
      vi.fn(async (_params: unknown, options: { signal: AbortSignal }) => ({
        data: stallingWebBody(options.signal),
      })),
    );
    const result = await fetchLinkedRevisionBytesTimed(linkedEntry(), {}, { drive, timeoutMs: 20 });
    expect(result).toBeNull();
  });

  test("web-stream revision branch: healthy progressing → bytes", async () => {
    const drive = asDrive(
      vi.fn(async (_params: unknown, options: { signal: AbortSignal }) => ({
        data: progressingWebBody(PROGRESS_COUNT, PROGRESS_GAP_MS, options.signal),
      })),
    );
    const result = await fetchLinkedRevisionBytesTimed(
      linkedEntry(),
      {},
      {
        drive,
        timeoutMs: PROGRESS_BUDGET_MS,
      },
    );
    expect((result as { bytes: Uint8Array }).bytes).toHaveLength(PROGRESS_COUNT);
  });
});

// The snapshot-apply port mirrors the recovery port; cover the same load-bearing
// behaviors (web stall, progressing, node stall) against its own helpers.
const snapshotEmbedded = (contentUrl: string | null) =>
  ({ contentUrl }) as unknown as EmbeddedImageStub;
const snapshotLinked = () =>
  ({ driveFileId: "file-1", headRevisionId: "rev-1" }) as unknown as LinkedFolderItemStub;

describe("snapshotFetch*Timed (DXT-2 stall guard, apply path)", () => {
  test("web download stall → null (fail-soft), never hangs", async () => {
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) =>
      Promise.resolve(webResponse(stallingWebBody(init!.signal!))),
    );
    const result = await snapshotFetchEmbeddedImageBytesTimed(
      snapshotEmbedded("https://drive/img"),
      {
        fetch: fetchImpl as unknown as typeof fetch,
        getAccessToken: async () => "tok",
        timeoutMs: 20,
      },
    );
    expect(result).toBeNull();
  });

  test("healthy slow-but-progressing web download is NOT aborted", async () => {
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) =>
      Promise.resolve(
        webResponse(progressingWebBody(PROGRESS_COUNT, PROGRESS_GAP_MS, init!.signal!)),
      ),
    );
    const result = await snapshotFetchEmbeddedImageBytesTimed(
      snapshotEmbedded("https://drive/img"),
      {
        fetch: fetchImpl as unknown as typeof fetch,
        getAccessToken: async () => "tok",
        timeoutMs: PROGRESS_BUDGET_MS,
      },
    );
    expect((result as { bytes: Uint8Array }).bytes).toHaveLength(PROGRESS_COUNT);
  });

  test("Node revision stream stall → guard destroys it → null", async () => {
    const stallingNodeStream = new Readable({ read() {} });
    const drive = asDrive(vi.fn(async () => ({ data: stallingNodeStream })));
    const result = await snapshotFetchLinkedRevisionBytesTimed(snapshotLinked(), {
      drive,
      timeoutMs: 20,
    });
    expect(result).toBeNull();
    expect(stallingNodeStream.destroyed).toBe(true);
  });
});

describe("cronFetchEmbeddedImageBytesTimed (DXT-2 stall guard, cron path)", () => {
  test("web download stall → null (fail-soft), never hangs", async () => {
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) =>
      Promise.resolve(webResponse(stallingWebBody(init!.signal!))),
    );
    const result = await cronFetchEmbeddedImageBytesTimed("https://drive/img", {
      fetch: fetchImpl as unknown as typeof fetch,
      getAccessToken: async () => "tok",
      timeoutMs: 20,
    });
    expect(result).toBeNull();
  });

  test("healthy slow-but-progressing download returns the bytes (not aborted)", async () => {
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) =>
      Promise.resolve(
        webResponse(progressingWebBody(PROGRESS_COUNT, PROGRESS_GAP_MS, init!.signal!)),
      ),
    );
    const result = await cronFetchEmbeddedImageBytesTimed("https://drive/img", {
      fetch: fetchImpl as unknown as typeof fetch,
      getAccessToken: async () => "tok",
      timeoutMs: PROGRESS_BUDGET_MS,
    });
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result).toHaveLength(PROGRESS_COUNT);
  });

  test("a NON-timeout fetch error propagates", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNRESET boom");
    });
    await expect(
      cronFetchEmbeddedImageBytesTimed("https://drive/img", {
        fetch: fetchImpl as unknown as typeof fetch,
        getAccessToken: async () => "tok",
        timeoutMs: 1000,
      }),
    ).rejects.toThrow("boom");
  });

  test("returns null without fetching when contentUrl is absent", async () => {
    const fetchImpl = vi.fn();
    const result = await cronFetchEmbeddedImageBytesTimed(null, {
      fetch: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
