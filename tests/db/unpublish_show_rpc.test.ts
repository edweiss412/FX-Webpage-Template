import { randomUUID } from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  asAdminRpc,
  callUnpublishShowAsNonAdmin,
  readShow,
  readShareToken,
  scratchCount,
  pendingSyncCount,
  seedLiveShowWithToken,
  seedArchivedShow,
  seedAutoPublishedShowWithUnpublishToken,
  sqlClient,
} from "@/tests/db/_b2Helpers";

async function versionToken(showId: string): Promise<string> {
  const rows = (await sqlClient.unsafe("select public.viewer_version_token($1::uuid) as t", [
    showId,
  ])) as Array<{ t: string }>;
  const row = rows[0];
  if (!row) throw new Error(`viewer_version_token returned no row (${showId})`);
  return row.t;
}

async function unpublishedAlertCount(showId: string): Promise<number> {
  const rows = (await sqlClient.unsafe(
    "select count(*)::int as n from public.admin_alerts where show_id = $1::uuid and code = 'SHOW_UNPUBLISHED'",
    [showId],
  )) as Array<{ n: number }>;
  const row = rows[0];
  if (!row) throw new Error(`admin_alerts count returned no row (${showId})`);
  return row.n;
}

describe("unpublish_show RPC", () => {
  it("pure unpublish: published=false + token pair null; NOTHING else moves; alert upserted; version token flips", async () => {
    const s = await seedAutoPublishedShowWithUnpublishToken({ withScratch: true });
    const before = await readShow(s.showId);
    const scratchBefore = await scratchCount(s.driveFileId);
    const vBefore = await versionToken(s.showId);

    await asAdminRpc("unpublish_show", { p_show_id: s.showId });

    const after = await readShow(s.showId);
    expect(after.published).toBe(false);
    expect(after.unpublish_token).toBeNull();
    expect(after.unpublish_token_expires_at).toBeNull();
    // D1 negative set — derived from the seeded row, never hardcoded:
    expect(after.archived).toBe(before.archived); // still false
    expect(after.archived_at).toBeNull();
    expect(after.picker_epoch).toBe(before.picker_epoch); // NOT bumped
    expect((await readShareToken(s.showId)).share_token).toBe(s.originalToken); // NOT rotated
    expect(await scratchCount(s.driveFileId)).toEqual(scratchBefore); // scratch survives
    expect(await pendingSyncCount(s.driveFileId)).toBeGreaterThan(0);
    expect(await unpublishedAlertCount(s.showId)).toBe(1);
    expect(await versionToken(s.showId)).not.toBe(vBefore); // published component flipped
  });

  it("idempotent no-op on already-unpublished (no duplicate alert)", async () => {
    const s = await seedLiveShowWithToken();
    await asAdminRpc("unpublish_show", { p_show_id: s.showId });
    await asAdminRpc("unpublish_show", { p_show_id: s.showId }); // no throw
    expect(await unpublishedAlertCount(s.showId)).toBe(1);
  });

  it("archived show → SHOW_ARCHIVED_IMMUTABLE", async () => {
    const s = await seedArchivedShow();
    await expect(asAdminRpc("unpublish_show", { p_show_id: s.showId })).rejects.toThrow(
      /SHOW_ARCHIVED_IMMUTABLE/,
    );
  });

  it("LIVE show owned via shows_pending_changes → FINALIZE_OWNED_SHOW, nothing mutated", async () => {
    const s = await seedLiveShowWithToken();
    const w = randomUUID();
    await sqlClient.unsafe(
      `insert into public.wizard_finalize_checkpoints (wizard_session_id, status)
       values ($1::uuid, 'in_progress')`,
      [w],
    );
    await sqlClient.unsafe(
      `insert into public.shows_pending_changes
         (wizard_session_id, drive_file_id, show_id, payload, applied_by_email, applied_at_intent)
       values ($1::uuid, $2, $3::uuid, '{}'::jsonb, 'dlarson@fxav.net', now())`,
      [w, s.driveFileId, s.showId],
    );
    await expect(asAdminRpc("unpublish_show", { p_show_id: s.showId })).rejects.toThrow(
      /FINALIZE_OWNED_SHOW/,
    );
    expect((await readShow(s.showId)).published).toBe(true);
    expect(await unpublishedAlertCount(s.showId)).toBe(0);
  });

  it("unknown id → ADMIN_LINK_SHOW_NOT_FOUND", async () => {
    await expect(asAdminRpc("unpublish_show", { p_show_id: randomUUID() })).rejects.toThrow(
      /ADMIN_LINK_SHOW_NOT_FOUND/,
    );
  });

  it("non-admin caller → forbidden; gate fires before any mutation", async () => {
    const s = await seedLiveShowWithToken();
    await expect(callUnpublishShowAsNonAdmin(s.showId)).rejects.toThrow(
      /forbidden|permission denied/,
    );
    expect((await readShow(s.showId)).published).toBe(true);
  });

  it("publish_show → viewer_version_token flips back (inequality both directions)", async () => {
    const s = await seedLiveShowWithToken();
    await asAdminRpc("unpublish_show", { p_show_id: s.showId });
    const vOff = await versionToken(s.showId);
    await asAdminRpc("publish_show", { p_show_id: s.showId });
    expect(await versionToken(s.showId)).not.toBe(vOff);
  });
});
