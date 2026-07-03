// Published-toggle parity contract (spec §3.4): the emailed token-consume path and the admin
// unpublish_show RPC are the feature's two deliberate mutation sites for pure unpublish — this
// test pins that they reach the SAME end-state (and the same finalize-owned refusal), so the
// two sites cannot drift. (Successor of the retired token-Unpublish ↔ archive_show parity.)
import { randomUUID } from "node:crypto";
import { afterAll, describe, it, expect } from "vitest";
import {
  seedAutoPublishedShowWithUnpublishToken,
  asAdminRpc,
  unpublishedStateSnapshot,
  closeB2Helpers,
  sqlClient,
} from "@/tests/db/_b2Helpers";
import { unpublishShowViaEmailedLink } from "@/lib/sync/unpublishShow";
import { mintIdFor, recipientBindingFor } from "@/lib/sync/unpublishBinding";

const insertedAdminEmails: string[] = [];

async function seedActiveAdminEmail(): Promise<string> {
  const email = `pub-toggle-parity-${randomUUID().slice(0, 8)}@example.com`;
  await sqlClient`insert into public.admin_emails (email, note) values (${email}, 'published-toggle parity fixture')`;
  insertedAdminEmails.push(email);
  return email;
}

async function seedFinalizeOwnership(showId: string, driveFileId: string): Promise<void> {
  const wiz = randomUUID();
  await sqlClient`insert into public.wizard_finalize_checkpoints (wizard_session_id, status)
                  values (${wiz}::uuid, 'in_progress')`;
  await sqlClient`insert into public.shows_pending_changes
                    (wizard_session_id, drive_file_id, show_id, payload, applied_by_email, applied_at_intent)
                  values (${wiz}::uuid, ${driveFileId}, ${showId}::uuid, '{}'::jsonb, 'dlarson@fxav.net', now())`;
}

afterAll(async () => {
  if (insertedAdminEmails.length > 0) {
    await sqlClient`delete from public.admin_emails where email in ${sqlClient(insertedAdminEmails)}`;
  }
  await closeB2Helpers();
});

describe("token Unpublish ↔ admin unpublish_show parity", () => {
  it("token Unpublish reaches the same PURE-UNPUBLISHED end-state as admin unpublish_show", async () => {
    const a = await seedAutoPublishedShowWithUnpublishToken({ withScratch: true }); // RPC path
    const b = await seedAutoPublishedShowWithUnpublishToken({ withScratch: true }); // token path
    await asAdminRpc("unpublish_show", { p_show_id: a.showId });
    const email = await seedActiveAdminEmail();
    const r = recipientBindingFor(email, b.showId, mintIdFor(b.unpublishToken));
    const res = await unpublishShowViaEmailedLink({ slug: b.slug, token: b.unpublishToken, r });
    expect(res.outcome).toBe("success");
    // published=false / archived untouched / archived_at null / token pair null / share_token
    // UNrotated / picker_epoch UNbumped / all 3 scratch tables intact / SHOW_UNPUBLISHED alert.
    expect(await unpublishedStateSnapshot(b)).toEqual(await unpublishedStateSnapshot(a));
  });

  it("live+finalize-owned: RPC raises FINALIZE_OWNED_SHOW and the emailed path returns finalize_owned with the token intact", async () => {
    const a = await seedAutoPublishedShowWithUnpublishToken();
    const b = await seedAutoPublishedShowWithUnpublishToken();
    await seedFinalizeOwnership(a.showId, a.driveFileId);
    await seedFinalizeOwnership(b.showId, b.driveFileId);

    await expect(asAdminRpc("unpublish_show", { p_show_id: a.showId })).rejects.toThrow(
      /FINALIZE_OWNED_SHOW/,
    );

    const email = await seedActiveAdminEmail();
    const r = recipientBindingFor(email, b.showId, mintIdFor(b.unpublishToken));
    const res = await unpublishShowViaEmailedLink({ slug: b.slug, token: b.unpublishToken, r });
    expect(res).toEqual({ outcome: "finalize_owned", status: 409, showId: b.showId });

    const [row] = await sqlClient`
      select published, unpublish_token::text as unpublish_token
        from public.shows where id = ${b.showId}::uuid`;
    expect(row?.published).toBe(true);
    expect(row?.unpublish_token).toBe(b.unpublishToken); // NOT consumed
  });
});
