import { describe, expect, test, vi } from "vitest";
import { writeSyncCronHeartbeat } from "@/lib/appSettings/writeSyncCronHeartbeat";
import { runScheduledCronSync } from "@/lib/sync/runScheduledCronSync";

function fakeHeartbeatClient(result: { data: unknown; error: unknown }) {
  const select = vi.fn().mockResolvedValue(result);
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  return { client: { from } as never, from, update, eq, select };
}

describe("writeSyncCronHeartbeat", () => {
  test("updates the singleton heartbeat timestamp and selects id so zero-row updates are visible", async () => {
    const { client, from, update, eq, select } = fakeHeartbeatClient({
      data: [{ id: "default" }],
      error: null,
    });

    await expect(writeSyncCronHeartbeat(client)).resolves.toEqual({ kind: "ok" });

    expect(from).toHaveBeenCalledWith("app_settings");
    expect(update).toHaveBeenCalledWith({
      sync_cron_heartbeat_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    expect(eq).toHaveBeenCalledWith("id", "default");
    expect(select).toHaveBeenCalledWith("id");
  });

  test("returned DB error becomes infra_error", async () => {
    const { client } = fakeHeartbeatClient({ data: null, error: { message: "boom" } });

    await expect(writeSyncCronHeartbeat(client)).resolves.toEqual({ kind: "infra_error" });
  });

  test("zero-row update becomes infra_error instead of false-ok", async () => {
    const { client } = fakeHeartbeatClient({ data: [], error: null });

    await expect(writeSyncCronHeartbeat(client)).resolves.toEqual({ kind: "infra_error" });
  });

  test("thrown query fault becomes infra_error", async () => {
    const client = {
      from: () => {
        throw new Error("query fault");
      },
    };

    await expect(writeSyncCronHeartbeat(client as never)).resolves.toEqual({
      kind: "infra_error",
    });
  });
});

describe("runScheduledCronSync heartbeat call sites", () => {
  test("no-folder completed run writes the heartbeat and preserves the skipped summary", async () => {
    const heartbeat = vi.fn().mockResolvedValue({ kind: "ok" });

    const result = await runScheduledCronSync({
      getActiveWatchedFolderId: async () => ({ kind: "no_folder_configured" as const }),
      writeSyncCronHeartbeat: heartbeat,
    });

    expect(heartbeat).toHaveBeenCalledOnce();
    expect(result).toEqual({
      processed: [],
      summary: { outcome: "skipped", skipReason: "no_folder_configured" },
    });
  });

  test("all-quiet completed run writes the heartbeat", async () => {
    const heartbeat = vi.fn().mockResolvedValue({ kind: "ok" });

    const result = await runScheduledCronSync({
      folderId: "folder-1",
      listFolder: async () => [],
      listLiveShows: async () => [],
      writeSyncCronHeartbeat: heartbeat,
    });

    expect(heartbeat).toHaveBeenCalledOnce();
    expect(result).toEqual({ processed: [] });
  });

  test("heartbeat infra_error is recorded without failing an otherwise completed run", async () => {
    const heartbeat = vi.fn().mockResolvedValue({ kind: "infra_error" });

    const result = await runScheduledCronSync({
      folderId: "folder-1",
      listFolder: async () => [],
      listLiveShows: async () => [],
      writeSyncCronHeartbeat: heartbeat,
    });

    expect(result.processed).toEqual([]);
    expect(result.maintenanceFaults).toEqual({ syncCronHeartbeat: "infra_error" });
  });
});
