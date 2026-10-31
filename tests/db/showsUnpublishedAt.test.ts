// shows.unpublished_at (spec docs/superpowers/specs/2026-10-26-crew-offline-saved-copy-design.md
// §4.11): one nullable column, stamped by the BEFORE UPDATE trigger shows_stamp_unpublished_at
// on every unpublish that does not archive. The saved-copy status route reads it to tell an
// archive that followed an unpublish (wipe the copy) from an archive alone (§4.5, R15).
//
// Every value is read back with an explicit `select unpublished_at` on the show's own row, so
// each unpublish path is checked on its own, not only against the other path. Timestamps are
// compared in SQL (text round-trip keeps microseconds), never as JS Dates.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  asAdminRpc,
  closeB2Helpers,
  seedAutoPublishedShowWithUnpublishToken,
  seedLiveShowWithToken,
  sqlClient,
} from "@/tests/db/_b2Helpers";
import { unpublishShowViaEmailedLink } from "@/lib/sync/unpublishShow";
import { mintIdFor, recipientBindingFor } from "@/lib/sync/unpublishBinding";

const insertedAdminEmails: string[] = [];

afterAll(async () => {
  if (insertedAdminEmails.length > 0) {
    await sqlClient`delete from public.admin_emails where email in ${sqlClient(insertedAdminEmails)}`;
  }
  await closeB2Helpers();
});

async function seedActiveAdminEmail(): Promise<string> {
  const email = `unpublished-at-${randomUUID().slice(0, 8)}@example.com`;
  await sqlClient`insert into public.admin_emails (email, note) values (${email}, 'shows.unpublished_at fixture')`;
  insertedAdminEmails.push(email);
  return email;
}

/** The row's unpublished_at as timestamptz text (microsecond precision), or null. */
async function readUnpublishedAt(showId: string): Promise<string | null> {
  const [row] = await sqlClient<{ unpublished_at: string | null }[]>`
    select unpublished_at::text as unpublished_at from public.shows where id = ${showId}::uuid`;
  if (!row) throw new Error(`readUnpublishedAt: show not found (${showId})`);
  return row.unpublished_at;
}

/** The database clock, so a stamp can be bracketed without trusting the test host's clock. */
async function dbClock(): Promise<string> {
  const [row] = await sqlClient<{ t: string }[]>`select clock_timestamp()::text as t`;
  if (!row) throw new Error("dbClock: clock_timestamp() returned no row");
  return row.t;
}

async function isWithin(value: string, lo: string, hi: string): Promise<boolean> {
  const [row] = await sqlClient<{ ok: boolean }[]>`
    select (${value}::timestamptz between ${lo}::timestamptz and ${hi}::timestamptz) as ok`;
  if (!row) throw new Error("isWithin: comparison returned no row");
  return row.ok;
}

async function isLater(value: string, than: string): Promise<boolean> {
  const [row] = await sqlClient<{ ok: boolean }[]>`
    select (${value}::timestamptz > ${than}::timestamptz) as ok`;
  if (!row) throw new Error("isLater: comparison returned no row");
  return row.ok;
}

/** Unpublish through the admin RPC (unpublish_show -> _unpublish_show_core) and return the stamp. */
async function unpublishViaRpc(showId: string): Promise<string> {
  const lo = await dbClock();
  await asAdminRpc("unpublish_show", { p_show_id: showId });
  const hi = await dbClock();
  const stamped = await readUnpublishedAt(showId);
  expect(stamped, "_unpublish_show_core left unpublished_at null").not.toBeNull();
  expect(await isWithin(stamped!, lo, hi), `stamp ${stamped} outside [${lo}, ${hi}]`).toBe(true);
  return stamped!;
}

describe("shows.unpublished_at column", () => {
  it("exists on public.shows as a nullable timestamptz with no default", async () => {
    const rows = await sqlClient<
      { is_nullable: string; data_type: string; column_default: string | null }[]
    >`
      select is_nullable, data_type, column_default
        from information_schema.columns
       where table_schema = 'public' and table_name = 'shows' and column_name = 'unpublished_at'`;
    expect(rows.map((r) => ({ ...r }))).toEqual([
      { is_nullable: "YES", data_type: "timestamp with time zone", column_default: null },
    ]);
  });
});

describe("shows_stamp_unpublished_at trigger", () => {
  it("admin unpublish (_unpublish_show_core) stamps the row", async () => {
    const s = await seedLiveShowWithToken();
    expect(await readUnpublishedAt(s.showId)).toBeNull();
    await unpublishViaRpc(s.showId);
  });

  it("token unpublish (unpublishAndConsumeUnpublishToken) stamps its own row", async () => {
    const s = await seedAutoPublishedShowWithUnpublishToken();
    expect(await readUnpublishedAt(s.showId)).toBeNull();
    const email = await seedActiveAdminEmail();
    const r = recipientBindingFor(email, s.showId, mintIdFor(s.unpublishToken));

    const lo = await dbClock();
    const res = await unpublishShowViaEmailedLink({ slug: s.slug, token: s.unpublishToken, r });
    const hi = await dbClock();

    expect(res.outcome).toBe("success");
    const stamped = await readUnpublishedAt(s.showId);
    expect(stamped, "token unpublish left unpublished_at null").not.toBeNull();
    expect(await isWithin(stamped!, lo, hi), `stamp ${stamped} outside [${lo}, ${hi}]`).toBe(true);
  });

  it("archive_show of a live show (published true to false, archived true) leaves it null", async () => {
    const s = await seedLiveShowWithToken();
    await asAdminRpc("archive_show", { p_show_id: s.showId });
    expect(await readUnpublishedAt(s.showId)).toBeNull();
  });

  it("archive after an unpublish, then unarchive, leave the unpublish stamp unchanged", async () => {
    const s = await seedLiveShowWithToken();
    const stamped = await unpublishViaRpc(s.showId);

    await asAdminRpc("archive_show", { p_show_id: s.showId });
    expect(await readUnpublishedAt(s.showId)).toBe(stamped);

    await asAdminRpc("unarchive_show", { p_show_id: s.showId });
    expect(await readUnpublishedAt(s.showId)).toBe(stamped);
  });

  it("republish leaves the earlier stamp in place", async () => {
    const s = await seedLiveShowWithToken();
    const stamped = await unpublishViaRpc(s.showId);

    await asAdminRpc("publish_show", { p_show_id: s.showId });
    const [row] = await sqlClient<{ published: boolean }[]>`
      select published from public.shows where id = ${s.showId}::uuid`;
    expect(row?.published).toBe(true);
    expect(await readUnpublishedAt(s.showId)).toBe(stamped);
  });

  it("an unrelated update of a published show leaves it null", async () => {
    const s = await seedLiveShowWithToken();
    await sqlClient`update public.shows set title = 'Renamed Show' where id = ${s.showId}::uuid`;
    expect(await readUnpublishedAt(s.showId)).toBeNull();
  });

  it("a second unpublish after republish moves the stamp forward", async () => {
    const s = await seedLiveShowWithToken();
    const first = await unpublishViaRpc(s.showId);
    await asAdminRpc("publish_show", { p_show_id: s.showId });

    const second = await unpublishViaRpc(s.showId);
    expect(await isLater(second, first), `second stamp ${second} not after ${first}`).toBe(true);
  });
});
