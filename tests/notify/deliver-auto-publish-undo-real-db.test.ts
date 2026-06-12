import postgres from "postgres";
import { describe, expect, test, vi } from "vitest";

import { deliverRealtimeCandidates, type DeliverySql } from "@/lib/notify/deliver";
import {
  listRealtimeCandidates,
  type AutoPublishUndoCandidate,
  type CandidateSql,
} from "@/lib/notify/detect/candidates";
import type { SendArgs } from "@/lib/notify/send";
import { mintIdFor } from "@/lib/sync/unpublishBinding";
import { unpublishShow } from "@/lib/sync/unpublishShow";

const DB_URL = process.env.TEST_DATABASE_URL;
const ORIGIN = "https://crew.fxav.app";

type Sql = ReturnType<typeof postgres>;

async function seedUndoShow(
  sql: Sql,
  suffix: string,
  token: string,
  expires: Date,
): Promise<{ showId: string; slug: string; driveFileId: string }> {
  const driveFileId = `drive-${suffix}`;
  const slug = `show-${suffix}`;
  const [show] = await sql<{ id: string }[]>`
    insert into public.shows (drive_file_id, slug, title, client_label, template_version, published, archived, unpublish_token, unpublish_token_expires_at)
    values (${driveFileId}, ${slug}, 'Undo Delivery Show', 'Client', 'v4', true, false, ${token}::uuid, ${expires})
    returning id
  `;
  return { showId: show!.id, slug, driveFileId };
}

async function detectUndoCandidate(sql: Sql, showId: string): Promise<AutoPublishUndoCandidate> {
  const result = await listRealtimeCandidates(sql as unknown as CandidateSql);
  expect(result.kind).toBe("ok");
  if (result.kind !== "ok") throw new Error("detection failed");
  const candidate = result.candidates.find(
    (c): c is AutoPublishUndoCandidate => c.kind === "auto_publish_undo" && c.showId === showId,
  );
  expect(candidate).toBeDefined();
  return candidate!;
}

async function cleanup(sql: Sql, recipient: string, showId: string | undefined, driveLike: string) {
  await sql`delete from public.email_deliveries where recipient = ${recipient}`;
  await sql`delete from public.admin_emails where email = ${recipient}`;
  if (showId) {
    await sql`delete from public.admin_alerts where show_id = ${showId}::uuid`;
  }
  await sql`delete from public.shows where drive_file_id like ${driveLike}`;
}

describe("auto_publish_undo deliver-time currentness — real DB (spec §4.3)", () => {
  test.skipIf(!DB_URL)(
    "token CONSUMED via the in-app undo path between detect and deliver → no send, no email_deliveries row",
    async () => {
      const sql = postgres(DB_URL!, { max: 1, prepare: false });
      const suffix = `undo-consume-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const recipient = `notify-${suffix}@example.com`;
      const token = "12121212-1212-4212-8212-121212121212";
      let showId: string | undefined;

      try {
        const seeded = await seedUndoShow(
          sql,
          suffix,
          token,
          new Date(Date.now() + 12 * 3_600_000),
        );
        showId = seeded.showId;
        await sql`insert into public.admin_emails (email) values (${recipient}) on conflict do nothing`;

        const candidate = await detectUndoCandidate(sql, showId);

        // Consume between detection and delivery via the REAL in-app path.
        const undone = await unpublishShow({ slug: seeded.slug, token });
        expect(undone.outcome).toBe("success");

        const sendEmail = vi.fn(async () => ({ ok: true as const, messageId: "never" }));
        const result = await deliverRealtimeCandidates(
          { candidates: [candidate], recipients: [recipient], origin: ORIGIN },
          { sql: sql as unknown as DeliverySql, sendEmail },
        );

        expect(result).toMatchObject({ kind: "ok", skipped: 1, sent: 0, failed: 0 });
        expect(sendEmail).not.toHaveBeenCalled();
        const rows =
          await sql`select 1 from public.email_deliveries where recipient = ${recipient}`;
        expect(rows).toHaveLength(0);
      } finally {
        await cleanup(sql, recipient, showId, `%${suffix}%`);
        await sql.end({ timeout: 5 });
      }
    },
  );

  test.skipIf(!DB_URL)("token EXPIRED between detect and deliver → no send, no row", async () => {
    const sql = postgres(DB_URL!, { max: 1, prepare: false });
    const suffix = `undo-expire-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const recipient = `notify-${suffix}@example.com`;
    const token = "23232323-2323-4323-8323-232323232323";
    let showId: string | undefined;

    try {
      const seeded = await seedUndoShow(sql, suffix, token, new Date(Date.now() + 12 * 3_600_000));
      showId = seeded.showId;
      await sql`insert into public.admin_emails (email) values (${recipient}) on conflict do nothing`;

      const candidate = await detectUndoCandidate(sql, showId);
      await sql`update public.shows set unpublish_token_expires_at = now() - interval '1 hour' where id = ${showId}::uuid`;

      const sendEmail = vi.fn(async () => ({ ok: true as const, messageId: "never" }));
      const result = await deliverRealtimeCandidates(
        { candidates: [candidate], recipients: [recipient], origin: ORIGIN },
        { sql: sql as unknown as DeliverySql, sendEmail },
      );

      expect(result).toMatchObject({ kind: "ok", skipped: 1, sent: 0, failed: 0 });
      expect(sendEmail).not.toHaveBeenCalled();
      const rows = await sql`select 1 from public.email_deliveries where recipient = ${recipient}`;
      expect(rows).toHaveLength(0);
    } finally {
      await cleanup(sql, recipient, showId, `%${suffix}%`);
      await sql.end({ timeout: 5 });
    }
  });

  test.skipIf(!DB_URL)(
    "token RE-MINTED between detect and deliver (different mintId, same expiry) → stale candidate skips",
    async () => {
      const sql = postgres(DB_URL!, { max: 1, prepare: false });
      const suffix = `undo-remint-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const recipient = `notify-${suffix}@example.com`;
      const token = "34343434-3434-4434-8434-343434343434";
      const remintToken = "45454545-4545-4545-8545-454545454545";
      let showId: string | undefined;

      try {
        const seeded = await seedUndoShow(
          sql,
          suffix,
          token,
          new Date(Date.now() + 12 * 3_600_000),
        );
        showId = seeded.showId;
        await sql`insert into public.admin_emails (email) values (${recipient}) on conflict do nothing`;

        const candidate = await detectUndoCandidate(sql, showId);
        expect(candidate.mintId).toBe(mintIdFor(token));
        // Re-mint: new token, expiry untouched (same ms) — only the mint
        // identity distinguishes the stale candidate from the live row.
        await sql`update public.shows set unpublish_token = ${remintToken}::uuid where id = ${showId}::uuid`;

        const sendEmail = vi.fn(async () => ({ ok: true as const, messageId: "never" }));
        const result = await deliverRealtimeCandidates(
          { candidates: [candidate], recipients: [recipient], origin: ORIGIN },
          { sql: sql as unknown as DeliverySql, sendEmail },
        );

        expect(result).toMatchObject({ kind: "ok", skipped: 1, sent: 0, failed: 0 });
        expect(sendEmail).not.toHaveBeenCalled();
        const rows =
          await sql`select 1 from public.email_deliveries where recipient = ${recipient}`;
        expect(rows).toHaveLength(0);
      } finally {
        await cleanup(sql, recipient, showId, `%${suffix}%`);
        await sql.end({ timeout: 5 });
      }
    },
  );
});

describe("auto_publish_undo ledger writes — real DB (spec §4.1/§4.3 R14)", () => {
  test.skipIf(!DB_URL)(
    "sent row has exact context {slug,title,expires_at,mintId}, no token anywhere; same-show re-mint with FORCED-EQUAL expires_at ms gets a DISTINCT dedupKey and is NOT deduped against the first delivery",
    async () => {
      const sql = postgres(DB_URL!, { max: 1, prepare: false });
      const suffix = `undo-ledger-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const recipient = `notify-${suffix}@example.com`;
      const token1 = "56565656-5656-4656-8656-565656565656";
      const token2 = "67676767-6767-4767-8767-676767676767";
      let showId: string | undefined;

      try {
        const expires = new Date(Date.now() + 12 * 3_600_000);
        const seeded = await seedUndoShow(sql, suffix, token1, expires);
        showId = seeded.showId;
        await sql`insert into public.admin_emails (email) values (${recipient}) on conflict do nothing`;

        // First mint: detect → deliver → sent.
        const c1 = await detectUndoCandidate(sql, showId);
        const sends: SendArgs[] = [];
        const sendEmail = vi.fn(async (args: SendArgs) => {
          sends.push(args);
          return { ok: true as const, messageId: `msg-${sends.length}` };
        });
        const first = await deliverRealtimeCandidates(
          { candidates: [c1], recipients: [recipient], origin: ORIGIN },
          { sql: sql as unknown as DeliverySql, sendEmail },
        );
        expect(first).toMatchObject({ kind: "ok", sent: 1 });

        // Row shape: exact context keys, mintId present, raw token absent from
        // the ENTIRE serialized row and the dedup key.
        const rows = await sql<
          {
            kind: string;
            dedup_key: string;
            show_id: string;
            triggered_codes: string[];
            ctx_keys: string[];
            mint_id: string | null;
            row_json: string;
          }[]
        >`
          select kind, dedup_key, show_id::text as show_id, triggered_codes,
                 array(select jsonb_object_keys(context) order by 1) as ctx_keys,
                 context->>'mintId' as mint_id,
                 row_to_json(email_deliveries)::text as row_json
            from public.email_deliveries
           where recipient = ${recipient} and status = 'sent'
        `;
        expect(rows).toHaveLength(1);
        expect(rows[0]!.kind).toBe("auto_publish_undo");
        expect(rows[0]!.show_id).toBe(showId);
        expect(rows[0]!.triggered_codes).toEqual(["SHOW_FIRST_PUBLISHED"]);
        expect(rows[0]!.ctx_keys).toEqual(["expires_at", "mintId", "slug", "title"]);
        expect(rows[0]!.mint_id).toBe(mintIdFor(token1));
        expect(rows[0]!.row_json).not.toContain(token1);
        expect(rows[0]!.dedup_key).not.toContain(token1);
        expect(rows[0]!.dedup_key).toBe(`${showId}:${mintIdFor(token1)}`);

        // The EMAIL carries the bearer link (the only place the token lives).
        expect(sends[0]!.text).toContain(`token=${token1}`);

        // Re-mint the SAME show with a FORCED-EQUAL expires_at (column untouched
        // → identical ms). Strict same-ms reading: only the token hash
        // disambiguates the two mints.
        await sql`update public.shows set unpublish_token = ${token2}::uuid where id = ${showId}::uuid`;
        const c2 = await detectUndoCandidate(sql, showId);
        expect(c2.expiresAt.getTime()).toBe(c1.expiresAt.getTime());
        expect(c2.dedupKey).not.toBe(c1.dedupKey);

        const second = await deliverRealtimeCandidates(
          { candidates: [c2], recipients: [recipient], origin: ORIGIN },
          { sql: sql as unknown as DeliverySql, sendEmail },
        );
        // NOT deduped against the first mint's sent row: a real second send.
        expect(second).toMatchObject({ kind: "ok", sent: 1, skipped: 0 });
        expect(sendEmail).toHaveBeenCalledTimes(2);
        const both = await sql<{ dedup_key: string }[]>`
          select dedup_key from public.email_deliveries
           where recipient = ${recipient} and status = 'sent'
           order by created_at asc
        `;
        expect(both).toHaveLength(2);
        expect(both[0]!.dedup_key).not.toBe(both[1]!.dedup_key);
      } finally {
        await cleanup(sql, recipient, showId, `%${suffix}%`);
        await sql.end({ timeout: 5 });
      }
    },
  );
});
