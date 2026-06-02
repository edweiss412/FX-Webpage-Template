import { describe, it, expect } from "vitest";
import {
  seedLiveShowWithToken, seedAutoPublishedShowWithUnpublishToken, asAdminRpc, archivedStateSnapshot,
} from "@/tests/db/_b2Helpers";
import { unpublishShow } from "@/lib/sync/unpublishShow";

describe("token Unpublish ↔ admin archive_show parity", () => {
  it("token Unpublish reaches the same archived end-state as admin archive_show", async () => {
    const a = await seedLiveShowWithToken({ withScratch: true }); // archive_show path
    const b = await seedAutoPublishedShowWithUnpublishToken({ withScratch: true }); // token path
    await asAdminRpc("archive_show", { p_show_id: a.showId });
    const res = await unpublishShow({ slug: b.slug, token: b.unpublishToken });
    expect(res.outcome).toBe("success");
    const sa = await archivedStateSnapshot(a);
    const sb = await archivedStateSnapshot(b);
    // archived / published=false / archived_at set / unpublish_token null / share_token rotated /
    // picker_epoch bumped (both start at 1 → 2) / all 3 scratch tables cleared.
    expect(sb).toEqual(sa);
  });
});
