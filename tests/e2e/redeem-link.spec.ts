import { createHash, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { signLinkJwt } from "@/lib/auth/jwt";
import { BOOTSTRAP_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { admin } from "@/tests/e2e/helpers/supabaseAdmin";

const TEST_SECRET = "redeem-link-test-secret-32-bytes-min";
const showId = randomUUID();
const crewMemberId = randomUUID();
const slug = `redeem-link-${showId.slice(0, 8)}`;
const driveFileId = `drive-${showId}`;
const crewName = "Redeem Tester";
const nonce = "nonce-for-redeem-link-test";

function nonceHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function bootstrapCookie(entries: unknown[]): string {
  return encodeURIComponent(JSON.stringify(entries));
}

test.beforeAll(async () => {
  process.env.JWT_SIGNING_SECRET = TEST_SECRET;
  await admin.from("shows").delete().eq("id", showId);
  const showInsert = await admin.from("shows").insert({
    id: showId,
    drive_file_id: driveFileId,
    slug,
    title: "Redeem Link Test",
    client_label: "FXAV",
    template_version: "v4",
    archived: false,
    published: true,
  });
  if (showInsert.error) throw new Error(showInsert.error.message);

  const crewInsert = await admin.from("crew_members").insert({
    id: crewMemberId,
    show_id: showId,
    name: crewName,
    email: "redeem-link@fxav.test",
    role: "A1",
    role_flags: ["A1"],
  });
  if (crewInsert.error) throw new Error(crewInsert.error.message);

  const authUpsert = await admin.from("crew_member_auth").upsert({
    show_id: showId,
    crew_name: crewName,
    current_token_version: 1,
    max_issued_version: 1,
    revoked_below_version: 0,
  });
  if (authUpsert.error) throw new Error(authUpsert.error.message);
});

test.afterAll(async () => {
  await admin.from("shows").delete().eq("id", showId);
});

test.beforeEach(async () => {
  await admin.from("link_sessions").delete().eq("show_id", showId);
  await admin.from("bootstrap_nonces").delete().eq("show_id", showId);
  await admin.from("app_settings").update({ active_signing_key_id: "k1" }).eq("id", "default");
});

test("valid signed link redeems to opaque session cookie pinned to verified kid", async ({
  request,
}) => {
  const hash = nonceHash(nonce);
  const nonceInsert = await admin.from("bootstrap_nonces").insert({
    nonce_hash: hash,
    show_id: showId,
    signing_key_id: "k1",
  });
  if (nonceInsert.error) throw new Error(nonceInsert.error.message);

  const signed = await signLinkJwt({
    showId,
    name: crewName,
    displayName: crewName,
    tokenVersion: 1,
  });

  const response = await request.post("/api/auth/redeem-link", {
    headers: {
      Origin: "http://localhost:3000",
      "Sec-Fetch-Site": "same-origin",
      Cookie: `${BOOTSTRAP_COOKIE_NAME}=${bootstrapCookie([
        {
          nonce_hash: hash,
          show_id: showId,
          issued_at: new Date().toISOString(),
          signing_key_id: "k1",
        },
      ])}`,
    },
    data: {
      token: signed.token,
      nonce,
      show_id: showId,
    },
  });

  expect(response.status()).toBe(200);
  const setCookie = response.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie");
  const sessionCookie = setCookie.find((h) => h.value.startsWith(`${SESSION_COOKIE_NAME}=`));
  expect(sessionCookie?.value).toContain("Path=/");
  expect(sessionCookie?.value).toContain("HttpOnly");
  expect(sessionCookie?.value).toContain("Secure");
  expect(sessionCookie?.value).toContain("SameSite=Lax");
  expect(sessionCookie?.value).not.toContain("Domain=");

  const cookieValue = sessionCookie?.value.match(/^__Host-fxav_session=([^;]+)/)?.[1];
  expect(cookieValue).toBeTruthy();
  const decoded = JSON.parse(decodeURIComponent(cookieValue ?? "")) as {
    v: number;
    token: string;
    show_id: string;
  };
  expect(decoded.v).toBe(1);
  expect(decoded.show_id).toBe(showId);
  expect(decoded.token).not.toBe(signed.token);

  const { data: sessionRows, error } = await admin
    .from("link_sessions")
    .select("token, show_id, crew_member_id, jwt_token_version, signing_key_id")
    .eq("token", decoded.token);
  if (error) throw new Error(error.message);
  expect(sessionRows).toEqual([
    {
      token: decoded.token,
      show_id: showId,
      crew_member_id: crewMemberId,
      jwt_token_version: 1,
      signing_key_id: "k1",
    },
  ]);
});

test("same-origin expired nonce returns CSRF_NONCE_EXPIRED without minting a session", async ({
  request,
}) => {
  const hash = nonceHash(nonce);
  const issuedAt = new Date(Date.now() - 31_000).toISOString();
  const nonceInsert = await admin.from("bootstrap_nonces").insert({
    nonce_hash: hash,
    show_id: showId,
    issued_at: issuedAt,
    signing_key_id: "k1",
  });
  if (nonceInsert.error) throw new Error(nonceInsert.error.message);
  const signed = await signLinkJwt({
    showId,
    name: crewName,
    tokenVersion: 1,
  });

  const response = await request.post("/api/auth/redeem-link", {
    headers: {
      Origin: "http://localhost:3000",
      "Sec-Fetch-Site": "same-origin",
      Cookie: `${BOOTSTRAP_COOKIE_NAME}=${bootstrapCookie([
        { nonce_hash: hash, show_id: showId, issued_at: issuedAt, signing_key_id: "k1" },
      ])}`,
    },
    data: { token: signed.token, nonce, show_id: showId },
  });

  expect(response.status()).toBe(403);
  await expect(response.json()).resolves.toMatchObject({
    code: "CSRF_NONCE_EXPIRED",
  });
  const { count } = await admin
    .from("link_sessions")
    .select("token", { count: "exact", head: true })
    .eq("show_id", showId);
  expect(count).toBe(0);
});

test("kid rotation between bootstrap and redeem returns CSRF_KEY_ROTATED", async ({
  request,
}) => {
  const hash = nonceHash(nonce);
  const nonceInsert = await admin.from("bootstrap_nonces").insert({
    nonce_hash: hash,
    show_id: showId,
    signing_key_id: "k1",
  });
  if (nonceInsert.error) throw new Error(nonceInsert.error.message);
  await admin.from("app_settings").update({ active_signing_key_id: "k2" }).eq("id", "default");
  const signed = await signLinkJwt({
    showId,
    name: crewName,
    tokenVersion: 1,
  });

  const response = await request.post("/api/auth/redeem-link", {
    headers: {
      Origin: "http://localhost:3000",
      "Sec-Fetch-Site": "same-origin",
      Cookie: `${BOOTSTRAP_COOKIE_NAME}=${bootstrapCookie([
        {
          nonce_hash: hash,
          show_id: showId,
          issued_at: new Date().toISOString(),
          signing_key_id: "k1",
        },
      ])}`,
    },
    data: { token: signed.token, nonce, show_id: showId },
  });

  expect(response.status()).toBe(403);
  await expect(response.json()).resolves.toMatchObject({
    code: "CSRF_KEY_ROTATED",
  });
});
