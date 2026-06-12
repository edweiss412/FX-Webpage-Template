/**
 * tests/notify/auto-publish-undo-live-probe-real-db.test.ts
 *
 * M12.13 Task 14.1 — LIVE-INTEGRATION PROBE for the auto_publish_undo delivery
 * leg (B3 precedent: a mocked-only review of an external-integration surface is
 * tautological per AGENTS.md, so one true end-to-end probe against the real
 * local stack is required).
 *
 * What this drives FOR REAL (no mocking of detector / deliver / binding / undo):
 *   - seed a live unpublish_token under the per-show advisory lock (the
 *     locked-fixture psql tx pattern — lib/sync mutations of `shows` run inside
 *     `pg_advisory_xact_lock(hashtext('show:' || drive_file_id))`, plan invariant 2);
 *   - REAL detection: `listRealtimeCandidates(sql)` against the real `shows` row;
 *   - REAL delivery: `deliverRealtimeCandidates({...},{sql, sendEmail})` writing a
 *     REAL `public.email_deliveries` row and rendering the REAL per-recipient email;
 *   - REAL recipient binding: the email URL's `r` validates for the seeded admin
 *     via `bindingMatchesActiveAdmin` (the same predicate the confirm page uses);
 *   - REAL in-app undo: plain `unpublishShow({slug, token})` consumes the token;
 *   - the residue-scrub zero-row invariant on `admin_alerts` (plan T4.5 recurring guard).
 *
 * The ONLY mocked seam is Resend (`lib/notify/send.ts`): an injected `sendEmail`
 * spy captures the rendered email and proves NO real network call is made.
 *
 * TEST_DATABASE_URL-guarded like the sibling real-DB notify tests. NOTE: the
 * repo's `.env.local` points TEST_DATABASE_URL at the VALIDATION pooler, so this
 * probe NEVER relies on the delivery loop's own env-resolved connection (which
 * would hit validation). It connects to the LOCAL stack EXPLICITLY and injects
 * that `sql` into both detect and deliver — exactly the sibling-probe shape in
 * tests/notify/deliver-auto-publish-undo-real-db.test.ts.
 */
import postgres from "postgres";
import { afterEach, describe, expect, test, vi } from "vitest";

import { deliverRealtimeCandidates, type DeliverySql } from "@/lib/notify/deliver";
import {
  listRealtimeCandidates,
  type AutoPublishUndoCandidate,
  type CandidateSql,
} from "@/lib/notify/detect/candidates";
import type { SendArgs } from "@/lib/notify/send";
import {
  bindingMatchesActiveAdmin,
  mintIdFor,
  recipientBindingFor,
} from "@/lib/sync/unpublishBinding";
import { unpublishShow } from "@/lib/sync/unpublishShow";

// The probe drives the LOCAL stack explicitly (see header) — never the
// .env.local validation pooler. The presence of TEST_DATABASE_URL is the gate;
// the local default is the connection target.
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const ORIGIN = "https://crew.fxav.app";

type Sql = ReturnType<typeof postgres>;

let activeSql: Sql | undefined;
const seededDriveLikes: string[] = [];
const seededRecipients: string[] = [];

afterEach(async () => {
  // Clean up every seed-prefixed row this run created. Locked deletes for shows
  // (invariant 2: `shows` mutations run under the per-show advisory lock).
  if (activeSql) {
    for (const recipient of seededRecipients) {
      await activeSql`delete from public.email_deliveries where recipient = ${recipient}`;
      await activeSql`delete from public.admin_emails where email = ${recipient}`;
    }
    for (const driveLike of seededDriveLikes) {
      const rows = await activeSql<{ id: string; drive_file_id: string }[]>`
        select id::text as id, drive_file_id from public.shows where drive_file_id like ${driveLike}
      `;
      for (const row of rows) {
        await activeSql`delete from public.admin_alerts where show_id = ${row.id}::uuid`;
        // Locked delete (invariant 2): one tx holding the per-show advisory lock.
        await activeSql.begin(async (tx) => {
          await tx`select pg_advisory_xact_lock(hashtext('show:' || ${row.drive_file_id}))`;
          await tx`delete from public.shows where drive_file_id = ${row.drive_file_id}`;
        });
      }
    }
    await activeSql.end({ timeout: 5 });
    activeSql = undefined;
  }
  seededDriveLikes.length = 0;
  seededRecipients.length = 0;
});

/**
 * Seed a published show holding a LIVE unpublish_token (24h expiry) inside ONE
 * transaction that holds the per-show advisory lock — the locked-fixture pattern
 * (lib/sync mutations of `shows` are invariant-2 locked surfaces). Returns ids.
 */
async function seedUndoShowLocked(
  sql: Sql,
  suffix: string,
  token: string,
  expires: Date,
): Promise<{ showId: string; slug: string; driveFileId: string }> {
  const driveFileId = `drive-${suffix}`;
  const slug = `show-${suffix}`;
  // One transaction holding the per-show advisory lock (invariant 2): every
  // lib/sync mutation of `shows` runs inside pg_advisory_xact_lock(hashtext(...)).
  const showId = await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('show:' || ${driveFileId}))`;
    const [inserted] = await tx<{ id: string }[]>`
      insert into public.shows
        (drive_file_id, slug, title, client_label, template_version,
         published, archived, unpublish_token, unpublish_token_expires_at)
      values (${driveFileId}, ${slug}, 'Live Probe Undo Show', 'Client', 'v4',
              true, false, ${token}::uuid, ${expires})
      returning id
    `;
    return inserted!.id;
  });
  return { showId, slug, driveFileId };
}

async function detectUndoCandidate(sql: Sql, showId: string): Promise<AutoPublishUndoCandidate> {
  const result = await listRealtimeCandidates(sql as unknown as CandidateSql);
  expect(result.kind).toBe("ok");
  if (result.kind !== "ok") throw new Error("detection failed");
  const candidate = result.candidates.find(
    (c): c is AutoPublishUndoCandidate => c.kind === "auto_publish_undo" && c.showId === showId,
  );
  expect(candidate, "detection should surface the seeded undo candidate").toBeDefined();
  return candidate!;
}

describe("auto_publish_undo LIVE-INTEGRATION probe — real local DB (M12.13 T14.1)", () => {
  test.skipIf(!TEST_DB_URL)(
    "real detect→deliver writes a real email_deliveries row (exact context, no token, valid binding), dedups, " +
      "skips after a real in-app undo, and leaves zero token-bearing SHOW_FIRST_PUBLISHED alerts",
    async () => {
      const sql = postgres(LOCAL_DB_URL, { max: 1, prepare: false });
      activeSql = sql;
      const suffix = `undo-probe-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const recipient = `notify-${suffix}@example.com`;
      const token = "78787878-7878-4878-8878-787878787878";
      seededDriveLikes.push(`%${suffix}%`);
      seededRecipients.push(recipient);

      const expires = new Date(Date.now() + 24 * 3_600_000);
      const seeded = await seedUndoShowLocked(sql, suffix, token, expires);
      const { showId, slug } = seeded;
      await sql`insert into public.admin_emails (email) values (${recipient}) on conflict do nothing`;

      // --- 1+2. REAL detection → REAL delivery, Resend mocked at the seam. ---
      const sends: SendArgs[] = [];
      const sendEmail = vi.fn(async (args: SendArgs) => {
        sends.push(args);
        return { ok: true as const, messageId: `msg-${sends.length}` };
      });

      const candidate = await detectUndoCandidate(sql, showId);
      expect(candidate.token).toBe(token); // raw token rides in-memory only
      expect(candidate.mintId).toBe(mintIdFor(token));

      const first = await deliverRealtimeCandidates(
        { candidates: [candidate], recipients: [recipient], origin: ORIGIN },
        { sql: sql as unknown as DeliverySql, sendEmail },
      );
      expect(first).toMatchObject({ kind: "ok", sent: 1, skipped: 0, failed: 0 });
      expect(sendEmail).toHaveBeenCalledTimes(1); // exactly one render, no real network

      // --- 3. The REAL email_deliveries row: exact context, NO token anywhere. ---
      const rows = await sql<
        {
          kind: string;
          dedup_key: string;
          show_id: string;
          triggered_codes: string[];
          ctx_keys: string[];
          ctx_slug: string;
          ctx_title: string;
          ctx_expires: string;
          mint_id: string | null;
          row_json: string;
        }[]
      >`
        select kind, dedup_key, show_id::text as show_id, triggered_codes,
               array(select jsonb_object_keys(context) order by 1) as ctx_keys,
               context->>'slug' as ctx_slug,
               context->>'title' as ctx_title,
               context->>'expires_at' as ctx_expires,
               context->>'mintId' as mint_id,
               row_to_json(email_deliveries)::text as row_json
          from public.email_deliveries
         where recipient = ${recipient} and status = 'sent'
      `;
      expect(rows).toHaveLength(1);
      const row = rows[0]!;
      expect(row.kind).toBe("auto_publish_undo");
      expect(row.show_id).toBe(showId);
      expect(row.triggered_codes).toEqual(["SHOW_FIRST_PUBLISHED"]);
      // Context is EXACTLY {slug,title,expires_at,mintId} — no more, no less.
      expect(row.ctx_keys).toEqual(["expires_at", "mintId", "slug", "title"]);
      expect(row.ctx_slug).toBe(slug);
      expect(row.ctx_title).toBe("Live Probe Undo Show");
      expect(row.mint_id).toBe(mintIdFor(token));
      expect(new Date(row.ctx_expires).getTime()).toBe(candidate.expiresAt.getTime());
      // NO raw token in the serialized row OR the dedup key (secret hygiene §4.1).
      expect(row.row_json).not.toContain(token);
      expect(row.dedup_key).not.toContain(token);
      expect(row.dedup_key).toBe(`${showId}:${mintIdFor(token)}`);

      // --- The captured email carries the bearer URL with token + r. ---
      const sent = sends[0]!;
      const expectedR = recipientBindingFor(recipient, showId, mintIdFor(token));
      const expectedHref = `${ORIGIN}/show/${slug}/unpublish?token=${token}&r=${expectedR}`;
      expect(sent.text).toContain(expectedHref);
      // The HTML body escapes `&` per escapeHtml — same URL, &amp; in the href attr.
      expect(sent.html).toContain(expectedHref.replace("&r=", "&amp;r="));

      // Parse `r` straight out of the rendered link and validate it the way the
      // confirm page does: it must resolve to the seeded (unrevoked) admin.
      const match = sent.text.match(/[?&]r=([0-9a-f]+)/);
      expect(match, "rendered link must carry an r= binding").not.toBeNull();
      const rFromEmail = match![1]!;
      const activeAdmins = await sql<{ email: string }[]>`
        select email from public.admin_emails where revoked_at is null and email = ${recipient}
      `;
      expect(
        bindingMatchesActiveAdmin(activeAdmins, rFromEmail, showId, mintIdFor(token)),
        "the emailed r must validate for this recipient via the real binding predicate",
      ).toBe(true);

      // --- 4. Dedup: re-run detect→deliver on the still-live token → no 2nd row. ---
      const candidateAgain = await detectUndoCandidate(sql, showId);
      const second = await deliverRealtimeCandidates(
        { candidates: [candidateAgain], recipients: [recipient], origin: ORIGIN },
        { sql: sql as unknown as DeliverySql, sendEmail },
      );
      expect(second).toMatchObject({ kind: "ok", sent: 0 });
      const afterDedup = await sql<{ n: string }[]>`
        select count(*)::text as n from public.email_deliveries
         where recipient = ${recipient} and status = 'sent'
      `;
      expect(afterDedup[0]!.n).toBe("1");

      // --- 5. Currentness: a REAL in-app undo consumes the token; re-detection
      //        finds nothing and delivery sends nothing new. ---
      const undone = await unpublishShow({ slug, token });
      expect(undone.outcome).toBe("success");

      const afterUndo = await listRealtimeCandidates(sql as unknown as CandidateSql);
      expect(afterUndo.kind).toBe("ok");
      if (afterUndo.kind === "ok") {
        const stillThere = afterUndo.candidates.find(
          (c) => c.kind === "auto_publish_undo" && c.showId === showId,
        );
        expect(stillThere, "consumed token must not re-surface as a candidate").toBeUndefined();
      }
      // Belt-and-suspenders: even if a stale candidate were re-fed, deliver's
      // currentness guard would skip it (token no longer matches the live row).
      const staleDelivery = await deliverRealtimeCandidates(
        { candidates: [candidate], recipients: [recipient], origin: ORIGIN },
        { sql: sql as unknown as DeliverySql, sendEmail },
      );
      expect(staleDelivery).toMatchObject({ kind: "ok", sent: 0 });
      const afterUndoRows = await sql<{ n: string }[]>`
        select count(*)::text as n from public.email_deliveries where recipient = ${recipient}
      `;
      expect(afterUndoRows[0]!.n).toBe("1"); // still just the one original send

      // --- 6. Scrub recurring guard (plan T4.5): the producer no longer writes
      //        the raw token into SHOW_FIRST_PUBLISHED alert context. Globally
      //        zero such rows (the one-shot scrub + producer flip applied in T4). ---
      const tokenBearing = await sql<{ n: string }[]>`
        select count(*)::text as n from public.admin_alerts
         where code = 'SHOW_FIRST_PUBLISHED' and context ? 'unpublish_token'
      `;
      expect(tokenBearing[0]!.n).toBe("0");
    },
    60_000,
  );
});
