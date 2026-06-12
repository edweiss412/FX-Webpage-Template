// M12.13 Task 11 — REAL-DB route matrix (spec §3 route-level regressions):
// bare-token rejection without consuming; invalid-r × {live, expired,
// consumed} → neutral 404 + ZERO state change (in particular the expired
// branch's token-clear side effect must NOT fire for an invalid r — R18);
// valid token+r → 200 + archived; post-consumption token+old-r → neutral 404
// with no code; expired+valid-r → the catalog-coded expired shape (and only
// THAT path may clear the token). Drives the real route handler against the
// local stack — the mocked sibling file pins shape mapping; this one pins
// state.
import { afterAll, describe, expect, it } from "vitest";
import postgres, { type Sql } from "postgres";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { closeB2Helpers, seedAutoPublishedShowWithUnpublishToken } from "@/tests/db/_b2Helpers";
import { mintIdFor, recipientBindingFor } from "@/lib/sync/unpublishBinding";
import { POST } from "@/app/api/show/[slug]/unpublish/route";

const DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// not-subject-to-meta: test-only fixture connection against the local stack;
// faults fail the test directly rather than needing a typed infra result.
const sql: Sql = postgres(DB_URL, { max: 1, prepare: false });

const insertedAdminEmails: string[] = [];

async function seedActiveAdminEmail(): Promise<string> {
  const email = `m1213-t11-route-${randomUUID().slice(0, 8)}@example.com`;
  await sql`insert into public.admin_emails (email, note) values (${email}, 'M12.13 Task 11 route fixture')`;
  insertedAdminEmails.push(email);
  return email;
}

async function fullShowSnapshot(showId: string): Promise<Record<string, unknown>> {
  const [row] =
    await sql`select to_jsonb(s) as snapshot from public.shows s where id = ${showId}::uuid`;
  if (!row) throw new Error(`fullShowSnapshot: show not found (${showId})`);
  return row.snapshot as Record<string, unknown>;
}

async function postRoute(slug: string, qs: string) {
  return POST(
    new NextRequest(`https://fxav.test/api/show/${slug}/unpublish${qs}`, { method: "POST" }),
    { params: Promise.resolve({ slug }) },
  );
}

afterAll(async () => {
  if (insertedAdminEmails.length > 0) {
    await sql`delete from public.admin_emails where email in ${sql(insertedAdminEmails)}`;
  }
  await sql.end({ timeout: 5 });
  await closeB2Helpers();
});

describe("POST /api/show/[slug]/unpublish — real-DB state matrix", () => {
  it("bare slug+token → 404, token INTACT (no consume), row byte-unchanged", async () => {
    const seeded = await seedAutoPublishedShowWithUnpublishToken();
    const before = await fullShowSnapshot(seeded.showId);

    const response = await postRoute(seeded.slug, `?token=${seeded.unpublishToken}`);
    await expect(response.json()).resolves.toEqual({ ok: false });
    expect(response.status).toBe(404);

    expect(await fullShowSnapshot(seeded.showId)).toEqual(before);
  });

  it("invalid-r × LIVE token → neutral 404, zero state change", async () => {
    const seeded = await seedAutoPublishedShowWithUnpublishToken();
    await seedActiveAdminEmail();
    const before = await fullShowSnapshot(seeded.showId);

    const response = await postRoute(
      seeded.slug,
      `?token=${seeded.unpublishToken}&r=0123456789abcdef`,
    );
    await expect(response.json()).resolves.toEqual({ ok: false });
    expect(response.status).toBe(404);

    const after = await fullShowSnapshot(seeded.showId);
    expect(after).toEqual(before);
    expect(after.unpublish_token).not.toBeNull();
    expect(after.archived).toBe(false);
  });

  it("invalid-r × EXPIRED token → neutral 404 and the expired token-clear side effect does NOT fire (R18)", async () => {
    const seeded = await seedAutoPublishedShowWithUnpublishToken();
    await seedActiveAdminEmail();
    await sql`update public.shows set unpublish_token_expires_at = now() - interval '1 hour' where id = ${seeded.showId}::uuid`;
    const before = await fullShowSnapshot(seeded.showId);

    const response = await postRoute(
      seeded.slug,
      `?token=${seeded.unpublishToken}&r=0123456789abcdef`,
    );
    const body = await response.json();
    expect(body).toEqual({ ok: false });
    expect(response.status).toBe(404);

    const after = await fullShowSnapshot(seeded.showId);
    expect(after).toEqual(before);
    expect(after.unpublish_token).not.toBeNull();
  });

  it("invalid-r × CONSUMED token → neutral 404, NO code (r underivable, R19), zero state change", async () => {
    const seeded = await seedAutoPublishedShowWithUnpublishToken();
    const email = await seedActiveAdminEmail();
    const oldR = recipientBindingFor(email, seeded.showId, mintIdFor(seeded.unpublishToken));

    // Consume legitimately first.
    const consume = await postRoute(seeded.slug, `?token=${seeded.unpublishToken}&r=${oldR}`);
    expect(consume.status).toBe(200);

    const before = await fullShowSnapshot(seeded.showId);
    const response = await postRoute(
      seeded.slug,
      `?token=${seeded.unpublishToken}&r=0123456789abcdef`,
    );
    const body = await response.json();
    expect(body).toEqual({ ok: false });
    expect(response.status).toBe(404);
    expect(await fullShowSnapshot(seeded.showId)).toEqual(before);
  });

  it("valid token+r → 200 { ok:true, showId }; show archived + token consumed", async () => {
    const seeded = await seedAutoPublishedShowWithUnpublishToken();
    const email = await seedActiveAdminEmail();
    const r = recipientBindingFor(email, seeded.showId, mintIdFor(seeded.unpublishToken));

    const response = await postRoute(seeded.slug, `?token=${seeded.unpublishToken}&r=${r}`);
    await expect(response.json()).resolves.toEqual({ ok: true, showId: seeded.showId });
    expect(response.status).toBe(200);

    const after = await fullShowSnapshot(seeded.showId);
    expect(after.archived).toBe(true);
    expect(after.published).toBe(false);
    expect(after.unpublish_token).toBeNull();
  });

  it("post-consumption token+OLD-r (the previously-valid capability) → neutral 404, NO code in the body", async () => {
    const seeded = await seedAutoPublishedShowWithUnpublishToken();
    const email = await seedActiveAdminEmail();
    const r = recipientBindingFor(email, seeded.showId, mintIdFor(seeded.unpublishToken));

    const first = await postRoute(seeded.slug, `?token=${seeded.unpublishToken}&r=${r}`);
    expect(first.status).toBe(200);

    const second = await postRoute(seeded.slug, `?token=${seeded.unpublishToken}&r=${r}`);
    const body = await second.json();
    expect(body).toEqual({ ok: false });
    expect(Object.keys(body)).toEqual(["ok"]);
    expect(JSON.stringify(body)).not.toContain("UNPUBLISH_TOKEN_CONSUMED");
    expect(second.status).toBe(404);
  });

  it("expired token + VALID r → 400 { ok:false, code: UNPUBLISH_TOKEN_EXPIRED } (the binding-validated path may clear the token)", async () => {
    const seeded = await seedAutoPublishedShowWithUnpublishToken();
    const email = await seedActiveAdminEmail();
    const r = recipientBindingFor(email, seeded.showId, mintIdFor(seeded.unpublishToken));
    await sql`update public.shows set unpublish_token_expires_at = now() - interval '1 hour' where id = ${seeded.showId}::uuid`;

    const response = await postRoute(seeded.slug, `?token=${seeded.unpublishToken}&r=${r}`);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: "UNPUBLISH_TOKEN_EXPIRED",
    });
    expect(response.status).toBe(400);

    const after = await fullShowSnapshot(seeded.showId);
    // The legitimate expired branch clears the dead token but never archives.
    expect(after.unpublish_token).toBeNull();
    expect(after.archived).toBe(false);
  });
});
