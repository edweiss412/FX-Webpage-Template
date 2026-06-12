/**
 * tests/notify/email-delivery-failed-undo-real-db.test.ts (M12.13 Task 10 —
 * spec §4.3b)
 *
 * Real-DB lifecycle matrix for the auto_publish_undo failure-reconciliation
 * arm: a failed undo email keeps the per-show EMAIL_DELIVERY_FAILED alert open
 * while {toggle enabled + own recipient active + live-token hash == context
 * mintId + context window unexpired + published + !archived}; it resolves on
 * each §4.3b condition; rows without context.mintId are non-current; and an
 * UNKNOWN undo channel leaves an open alert untouched (R11) where a clean
 * read would have resolved it.
 */
import postgres from "postgres";
import { describe, expect, test } from "vitest";

import {
  reconcileEmailDeliveryState,
  type ChannelToggleState,
  type EmailDeliveryFailedSql,
} from "@/lib/notify/detect/emailDeliveryFailed";
import { mintIdFor } from "@/lib/sync/unpublishBinding";

const DB_URL = process.env.TEST_DATABASE_URL;
const ENABLED: ChannelToggleState = { kind: "enabled" };
const DISABLED: ChannelToggleState = { kind: "disabled" };
const UNKNOWN: ChannelToggleState = { kind: "unknown" };

type Sql = ReturnType<typeof postgres>;

function inputWithUndo(undo: ChannelToggleState) {
  return {
    alertOnSyncProblems: DISABLED,
    dailyReviewDigest: DISABLED,
    alertOnAutoPublish: undo,
    configValid: true,
    todayET: "2026-06-02",
  };
}

async function reconcile(sql: Sql, undo: ChannelToggleState) {
  await expect(
    reconcileEmailDeliveryState(inputWithUndo(undo), {
      sql: sql as unknown as EmailDeliveryFailedSql,
    }),
  ).resolves.toMatchObject({ kind: "ok" });
}

async function openAlertCount(sql: Sql, showId: string): Promise<number> {
  const rows = await sql<{ id: string }[]>`
    select id from public.admin_alerts
     where show_id = ${showId}::uuid
       and code = 'EMAIL_DELIVERY_FAILED'
       and resolved_at is null
  `;
  return rows.length;
}

describe("auto_publish_undo failure reconciliation — real DB (spec §4.3b)", () => {
  test.skipIf(!DB_URL)(
    "current-while predicate + every resolution condition, with re-opens between",
    async () => {
      const sql = postgres(DB_URL!, { max: 1, prepare: false });
      const suffix = `undo-reconcile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const driveFileId = `drive-${suffix}`;
      const recipient = `notify-${suffix}@example.com`;
      const otherAdmin = `notify-other-${suffix}@example.com`;
      const token = "89898989-8989-4989-8989-898989898989";
      const remint = "9a9a9a9a-9a9a-4a9a-8a9a-9a9a9a9a9a9a";
      const mintId = mintIdFor(token);
      const expiresAt = new Date(Date.now() + 12 * 3_600_000).toISOString();
      let showId: string | undefined;

      try {
        const [show] = await sql<{ id: string }[]>`
          insert into public.shows (drive_file_id, slug, title, client_label, template_version, published, archived, unpublish_token, unpublish_token_expires_at)
          values (${driveFileId}, ${`show-${suffix}`}, 'Undo Reconcile Show', 'Client', 'v4', true, false, ${token}::uuid, ${expiresAt}::timestamptz)
          returning id
        `;
        showId = show!.id;
        await sql`insert into public.admin_emails (email) values (${recipient}) on conflict do nothing`;
        await sql`insert into public.admin_emails (email) values (${otherAdmin}) on conflict do nothing`;
        await sql`
          insert into public.email_deliveries (
            kind, channel, dedup_key, show_id, recipient, triggered_codes, context, status, error, attempt_count
          )
          values (
            'auto_publish_undo', 'email',
            ${`${showId}:${mintId}`}, ${showId}::uuid, ${recipient},
            array['SHOW_FIRST_PUBLISHED']::text[],
            ${sql.json({ slug: `show-${suffix}`, title: "Undo Reconcile Show", expires_at: expiresAt, mintId })},
            'failed', 'provider', 1
          )
        `;

        // CURRENT-WHILE: toggle on + own recipient active + mint matches +
        // window live + published + !archived → alert opens.
        await reconcile(sql, ENABLED);
        expect(await openAlertCount(sql, showId)).toBe(1);

        // Resolution 1: toggle OFF (deliberate disable) → resolves; re-enable → re-opens.
        await reconcile(sql, DISABLED);
        expect(await openAlertCount(sql, showId)).toBe(0);
        await reconcile(sql, ENABLED);
        expect(await openAlertCount(sql, showId)).toBe(1);

        // Resolution 2 (R4 per-row strictness): the failed row's OWN recipient
        // revoked while ANOTHER admin stays active → resolves. (The
        // revoke-atomicity CHECK requires revoked_by alongside revoked_at.)
        await sql`update public.admin_emails set revoked_at = now(), revoked_by = '00000000-0000-4000-8000-0000000000ff'::uuid where email = ${recipient}`;
        await reconcile(sql, ENABLED);
        expect(await openAlertCount(sql, showId)).toBe(0);
        await sql`update public.admin_emails set revoked_at = null, revoked_by = null where email = ${recipient}`;
        await reconcile(sql, ENABLED);
        expect(await openAlertCount(sql, showId)).toBe(1);

        // Resolution 3: CONSUMPTION (token columns cleared by the undo) → resolves.
        await sql`update public.shows set unpublish_token = null, unpublish_token_expires_at = null where id = ${showId}::uuid`;
        await reconcile(sql, ENABLED);
        expect(await openAlertCount(sql, showId)).toBe(0);
        await sql`update public.shows set unpublish_token = ${token}::uuid, unpublish_token_expires_at = ${expiresAt}::timestamptz where id = ${showId}::uuid`;
        await reconcile(sql, ENABLED);
        expect(await openAlertCount(sql, showId)).toBe(1);

        // Resolution 4: RE-MINT (live token hash no longer equals the row's
        // context.mintId; expiry untouched — same window timestamp, only the
        // mint identity distinguishes) → resolves.
        await sql`update public.shows set unpublish_token = ${remint}::uuid where id = ${showId}::uuid`;
        await reconcile(sql, ENABLED);
        expect(await openAlertCount(sql, showId)).toBe(0);
        await sql`update public.shows set unpublish_token = ${token}::uuid where id = ${showId}::uuid`;
        await reconcile(sql, ENABLED);
        expect(await openAlertCount(sql, showId)).toBe(1);

        // R11: an UNKNOWN undo channel leaves the OPEN alert untouched even in
        // a state where a clean DISABLED read would resolve it.
        await reconcile(sql, UNKNOWN);
        expect(await openAlertCount(sql, showId)).toBe(1);

        // Resolution 5: window EXPIRY (the row's context window passes) → resolves
        // even while the toggle read is UNKNOWN — non-toggle conditions make the
        // row KNOWN non-current, so unknown does not pin it open.
        await sql`
          update public.email_deliveries
             set context = jsonb_set(context, '{expires_at}', to_jsonb((now() - interval '1 hour')::text))
           where recipient = ${recipient}
        `;
        await reconcile(sql, UNKNOWN);
        expect(await openAlertCount(sql, showId)).toBe(0);
        await sql`
          update public.email_deliveries
             set context = jsonb_set(context, '{expires_at}', to_jsonb(${expiresAt}::text))
           where recipient = ${recipient}
        `;
        await reconcile(sql, ENABLED);
        expect(await openAlertCount(sql, showId)).toBe(1);

        // Resolution 6: LATER SUCCESS for the same (kind, dedup_key, recipient) → resolves.
        await sql`update public.email_deliveries set status = 'sent' where recipient = ${recipient}`;
        await reconcile(sql, ENABLED);
        expect(await openAlertCount(sql, showId)).toBe(0);
      } finally {
        await sql`delete from public.email_deliveries where recipient = ${recipient}`;
        await sql`delete from public.admin_emails where email in (${recipient}, ${otherAdmin})`;
        if (showId) {
          await sql`delete from public.admin_alerts where show_id = ${showId}::uuid`;
        }
        await sql`delete from public.shows where drive_file_id = ${driveFileId}`;
        await sql.end({ timeout: 5 });
      }
    },
  );

  test.skipIf(!DB_URL)(
    "a failed undo row WITHOUT context.mintId is non-current — the alert never opens (forward-compat)",
    async () => {
      const sql = postgres(DB_URL!, { max: 1, prepare: false });
      const suffix = `undo-nomint-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const driveFileId = `drive-${suffix}`;
      const recipient = `notify-${suffix}@example.com`;
      const token = "abababab-abab-4bab-8bab-abababababab";
      const expiresAt = new Date(Date.now() + 12 * 3_600_000).toISOString();
      let showId: string | undefined;

      try {
        const [show] = await sql<{ id: string }[]>`
          insert into public.shows (drive_file_id, slug, title, client_label, template_version, published, archived, unpublish_token, unpublish_token_expires_at)
          values (${driveFileId}, ${`show-${suffix}`}, 'No Mint Show', 'Client', 'v4', true, false, ${token}::uuid, ${expiresAt}::timestamptz)
          returning id
        `;
        showId = show!.id;
        await sql`insert into public.admin_emails (email) values (${recipient}) on conflict do nothing`;
        await sql`
          insert into public.email_deliveries (
            kind, channel, dedup_key, show_id, recipient, triggered_codes, context, status, error, attempt_count
          )
          values (
            'auto_publish_undo', 'email',
            ${`${showId}:${mintIdFor(token)}`}, ${showId}::uuid, ${recipient},
            array['SHOW_FIRST_PUBLISHED']::text[],
            ${sql.json({ slug: `show-${suffix}`, title: "No Mint Show", expires_at: expiresAt })},
            'failed', 'provider', 1
          )
        `;

        await reconcile(sql, ENABLED);
        expect(await openAlertCount(sql, showId)).toBe(0);
      } finally {
        await sql`delete from public.email_deliveries where recipient = ${recipient}`;
        await sql`delete from public.admin_emails where email = ${recipient}`;
        if (showId) {
          await sql`delete from public.admin_alerts where show_id = ${showId}::uuid`;
        }
        await sql`delete from public.shows where drive_file_id = ${driveFileId}`;
        await sql.end({ timeout: 5 });
      }
    },
  );
});
