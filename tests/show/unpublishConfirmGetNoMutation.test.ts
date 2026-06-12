// M12.13 Task 11 — the prefetch pin (spec §5): GET performs NO mutation.
// REAL-DB test: render the confirm page (the full server component, real
// postgres readers, no mocks) in every reachable GET state and assert the
// shows row is byte-identical afterwards — token intact, nothing cleared.
// The concrete failure mode this catches is a refactor to mutate on GET
// (e.g. consuming on render, or running the wrapper's expired-branch
// token-clear from the page), which mail prefetchers would detonate.
import { afterAll, describe, expect, it } from "vitest";
import postgres, { type Sql } from "postgres";
import { randomUUID } from "node:crypto";
import { closeB2Helpers, seedAutoPublishedShowWithUnpublishToken } from "@/tests/db/_b2Helpers";
import { mintIdFor, recipientBindingFor } from "@/lib/sync/unpublishBinding";
import Page from "@/app/show/[slug]/unpublish/page";

const DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// not-subject-to-meta: test-only fixture connection against the local stack;
// faults fail the test directly rather than needing a typed infra result.
const sql: Sql = postgres(DB_URL, { max: 1, prepare: false });

const insertedAdminEmails: string[] = [];

async function seedActiveAdminEmail(): Promise<string> {
  const email = `m1213-task11-${randomUUID().slice(0, 8)}@example.com`;
  await sql`insert into public.admin_emails (email, note) values (${email}, 'M12.13 Task 11 GET-no-mutation fixture')`;
  insertedAdminEmails.push(email);
  return email;
}

async function fullShowSnapshot(showId: string): Promise<Record<string, unknown>> {
  const [row] =
    await sql`select to_jsonb(s) as snapshot from public.shows s where id = ${showId}::uuid`;
  if (!row) throw new Error(`fullShowSnapshot: show not found (${showId})`);
  return row.snapshot as Record<string, unknown>;
}

async function renderGet(slug: string, token: string | undefined, r: string | undefined) {
  return Page({
    params: Promise.resolve({ slug }),
    searchParams: Promise.resolve({ token, r } as Record<string, string | string[] | undefined>),
  });
}

afterAll(async () => {
  if (insertedAdminEmails.length > 0) {
    await sql`delete from public.admin_emails where email in ${sql(insertedAdminEmails)}`;
  }
  await sql.end({ timeout: 5 });
  await closeB2Helpers();
});

describe("confirm page GET performs no mutation (real DB)", () => {
  it("confirm state: valid token + valid r renders without touching the row", async () => {
    const seeded = await seedAutoPublishedShowWithUnpublishToken();
    const email = await seedActiveAdminEmail();
    const r = recipientBindingFor(email, seeded.showId, mintIdFor(seeded.unpublishToken));

    const before = await fullShowSnapshot(seeded.showId);
    await renderGet(seeded.slug, seeded.unpublishToken, r);
    const after = await fullShowSnapshot(seeded.showId);

    expect(after).toEqual(before);
    expect(after.unpublish_token).not.toBeNull();
    expect(after.archived).toBe(false);
    expect(after.published).toBe(true);
  });

  it("expired state: GET does NOT run the wrapper's expired token-clear — token survives the render", async () => {
    const seeded = await seedAutoPublishedShowWithUnpublishToken();
    const email = await seedActiveAdminEmail();
    const r = recipientBindingFor(email, seeded.showId, mintIdFor(seeded.unpublishToken));
    await sql`update public.shows set unpublish_token_expires_at = now() - interval '1 hour' where id = ${seeded.showId}::uuid`;

    const before = await fullShowSnapshot(seeded.showId);
    await renderGet(seeded.slug, seeded.unpublishToken, r);
    const after = await fullShowSnapshot(seeded.showId);

    expect(after).toEqual(before);
    expect(after.unpublish_token).not.toBeNull();
  });

  it("binding no-match and bare-token GETs leave the row untouched", async () => {
    const seeded = await seedAutoPublishedShowWithUnpublishToken();
    await seedActiveAdminEmail();

    const before = await fullShowSnapshot(seeded.showId);
    await renderGet(seeded.slug, seeded.unpublishToken, "0123456789abcdef");
    await renderGet(seeded.slug, seeded.unpublishToken, undefined);
    await renderGet(seeded.slug, undefined, undefined);
    const after = await fullShowSnapshot(seeded.showId);

    expect(after).toEqual(before);
    expect(after.unpublish_token).not.toBeNull();
  });
});
