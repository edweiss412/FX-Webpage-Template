// M12.13 Task 3 — REAL-DB revocation-vs-consume serialization (spec §3 R12).
//
// The wrapper's in-transaction `for share` read of unrevoked admin_emails must
// SERIALIZE against a concurrent revocation UPDATE: a revocation that commits
// before the consume means the recipient NEVER consumes (neutral outcome,
// token intact). Runs against the local Supabase stack like the repo's other
// real-DB tests (tests/db/_b2Helpers.ts idiom: TEST_DATABASE_URL ??
// DATABASE_URL ?? local 127.0.0.1:54322).
import { afterAll, describe, expect, it } from "vitest";
import postgres, { type Sql } from "postgres";
import { randomUUID } from "node:crypto";
import { closeB2Helpers, seedAutoPublishedShowWithUnpublishToken } from "@/tests/db/_b2Helpers";
import { unpublishShowViaEmailedLink } from "@/lib/sync/unpublishShow";
import { mintIdFor, recipientBindingFor } from "@/lib/sync/unpublishBinding";

const DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// not-subject-to-meta: test-only fixture connection against the local stack;
// faults fail the test directly rather than needing a typed infra result.
const sql: Sql = postgres(DB_URL, { max: 2, prepare: false });

const insertedAdminEmails: string[] = [];

async function seedActiveAdminEmail(): Promise<string> {
  const email = `m1213-task3-${randomUUID().slice(0, 8)}@example.com`;
  await sql`insert into public.admin_emails (email, note) values (${email}, 'M12.13 Task 3 concurrency fixture')`;
  insertedAdminEmails.push(email);
  return email;
}

async function showState(showId: string): Promise<{
  unpublish_token: string | null;
  archived: boolean;
  published: boolean;
}> {
  const [row] = await sql`
    select unpublish_token::text as unpublish_token, archived, published
      from public.shows where id = ${showId}::uuid`;
  if (!row) throw new Error(`showState: show not found (${showId})`);
  return row as { unpublish_token: string | null; archived: boolean; published: boolean };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

afterAll(async () => {
  if (insertedAdminEmails.length > 0) {
    await sql`delete from public.admin_emails where email in ${sql(insertedAdminEmails)}`;
  }
  await sql.end({ timeout: 5 });
  await closeB2Helpers();
});

describe("unpublishShowViaEmailedLink revocation-vs-consume serialization (real DB)", () => {
  it("revoked-before-consume NEVER consumes: wrapper blocks on the in-flight revocation, then exits neutral with the token intact", async () => {
    const seeded = await seedAutoPublishedShowWithUnpublishToken();
    const email = await seedActiveAdminEmail();
    const r = recipientBindingFor(email, seeded.showId, mintIdFor(seeded.unpublishToken));

    // Connection A: an OPEN (uncommitted) revocation of the recipient. The
    // wrapper's `for share` read must block against this row's update lock.
    const revokeConn: Sql = postgres(DB_URL, { max: 1, prepare: false });
    try {
      let wrapper: ReturnType<typeof unpublishShowViaEmailedLink> | undefined;
      let settledMidFlight: boolean | undefined;
      await revokeConn.begin(async (revokeTx) => {
        await revokeTx`
          update public.admin_emails
             set revoked_at = now(), revoked_by = ${randomUUID()}::uuid
           where email = ${email}`;

        // Connection B (wrapper-owned): start the consume mid-flight. Do NOT
        // await it inside this callback — it can only resolve after this tx
        // commits (that is the serialization under test).
        wrapper = unpublishShowViaEmailedLink({
          slug: seeded.slug,
          token: seeded.unpublishToken,
          r,
        });
        let settled = false;
        void wrapper.then(
          () => {
            settled = true;
          },
          () => {
            settled = true;
          },
        );

        // Serialization evidence: while the revocation tx is open, the wrapper
        // must still be blocked on the FOR-SHARE read (not resolved).
        await sleep(750);
        settledMidFlight = settled;
        // returning commits the revocation
      });

      expect(settledMidFlight).toBe(false);
      // Revocation committed FIRST → the recipient never consumes.
      await expect(wrapper!).resolves.toEqual({ outcome: "not_found", status: 404 });
    } finally {
      await revokeConn.end({ timeout: 5 });
    }

    const state = await showState(seeded.showId);
    expect(state.unpublish_token).toBe(seeded.unpublishToken);
    expect(state.archived).toBe(false);
    expect(state.published).toBe(true);
  });

  it("consume-commit before revoke → success; a post-consumption re-submit with the old r is neutral (R19)", async () => {
    const seeded = await seedAutoPublishedShowWithUnpublishToken();
    const email = await seedActiveAdminEmail();
    const r = recipientBindingFor(email, seeded.showId, mintIdFor(seeded.unpublishToken));

    await expect(
      unpublishShowViaEmailedLink({ slug: seeded.slug, token: seeded.unpublishToken, r }),
    ).resolves.toEqual({ outcome: "success", status: 200, showId: seeded.showId });

    const state = await showState(seeded.showId);
    expect(state.unpublish_token).toBeNull();
    expect(state.archived).toBe(true);
    expect(state.published).toBe(false);

    // Revocation landing AFTER the consume changes nothing further…
    await sql`
      update public.admin_emails
         set revoked_at = now(), revoked_by = ${randomUUID()}::uuid
       where email = ${email}`;

    // …and the public double-submit sees NEUTRAL, never CONSUMED (R19).
    await expect(
      unpublishShowViaEmailedLink({ slug: seeded.slug, token: seeded.unpublishToken, r }),
    ).resolves.toEqual({ outcome: "not_found", status: 404 });
  });
});
