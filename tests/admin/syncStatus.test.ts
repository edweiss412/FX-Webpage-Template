// M12.2 Phase A Task 3 — syncStatusBucket maps the COMPLETE canonical
// last_sync_status enum (master spec line 182) through a strict ordered
// priority into a status-indicator bucket (spec §5.2). Sync HEALTH only —
// decoupled from live/publishing. Every canonical value is mapped; any
// unrecognized value defensively buckets to `warn` (makes enum drift VISIBLE
// to the operator, never silently "clean").
import { describe, expect, it } from "vitest";
import { syncStatusBucket } from "@/lib/admin/syncStatus";

describe("syncStatusBucket", () => {
  it.each([
    ["drive_error", "warn"],
    ["sheet_unavailable", "warn"],
    ["parse_error", "warn"],
    ["pending_review", "review"],
    ["pending", "idle"],
    ["ok", "positive"],
    [null, "idle"],
    ["totally_unknown_value", "warn"], // R5: unrecognized -> defensive warn, NOT idle
  ])("maps %s -> %s", (status, bucket) => {
    expect(syncStatusBucket(status as string | null).bucket).toBe(bucket);
  });

  it("labels each canonical value exactly per spec §5.2", () => {
    expect(syncStatusBucket("drive_error").label).toBe("Couldn't reach Drive");
    expect(syncStatusBucket("sheet_unavailable").label).toBe("Sheet not in folder");
    expect(syncStatusBucket("parse_error").label).toBe("Couldn't read the sheet");
    expect(syncStatusBucket("pending_review").label).toBe("Changes to review");
    expect(syncStatusBucket("pending").label).toBe("Sync in progress");
    expect(syncStatusBucket("ok").label).toBe("Synced");
    expect(syncStatusBucket(null).label).toBe("Not synced yet");
    expect(syncStatusBucket("xyzzy").label).toBe("Unknown sync state");
  });
});
