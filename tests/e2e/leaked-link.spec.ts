import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { signLinkJwt } from "@/lib/auth/jwt";
import { admin } from "@/tests/e2e/helpers/supabaseAdmin";

const TEST_SECRET = "redeem-link-test-secret-32-bytes-min";
const showId = randomUUID();
const crewMemberId = randomUUID();
const slug = `leaked-link-${showId.slice(0, 8)}`;
const crewName = "Leak Tester";

async function setAuthVersions(current: number, maxIssued = current, revokedBelow = 0) {
  const { error } = await admin.from("crew_member_auth").upsert({
    show_id: showId,
    crew_name: crewName,
    current_token_version: current,
    max_issued_version: maxIssued,
    revoked_below_version: revokedBelow,
  });
  if (error) throw new Error(error.message);
}

async function leakedUrl(path: string, tokenVersion: number): Promise<string> {
  const { token } = await signLinkJwt({
    showId,
    name: crewName,
    tokenVersion,
  });
  return `${path}?t=${encodeURIComponent(token)}`;
}

async function authRow() {
  const { data, error } = await admin
    .from("crew_member_auth")
    .select("current_token_version, max_issued_version, revoked_below_version")
    .eq("show_id", showId)
    .eq("crew_name", crewName)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function revokedRows() {
  const { data, error } = await admin
    .from("revoked_links")
    .select("crew_name, token_version, revoked_reason")
    .eq("show_id", showId)
    .order("token_version", { ascending: true });
  if (error) throw new Error(error.message);
  return data;
}

test.beforeAll(async () => {
  process.env.JWT_SIGNING_SECRET = TEST_SECRET;
  await admin.from("shows").delete().eq("id", showId);
  const showInsert = await admin.from("shows").insert({
    id: showId,
    drive_file_id: `drive-${showId}`,
    slug,
    title: "Leaked Link Test",
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
    email: "leaked-link@fxav.test",
    role: "A1",
    role_flags: ["A1"],
  });
  if (crewInsert.error) throw new Error(crewInsert.error.message);
});

test.afterAll(async () => {
  await admin.from("shows").delete().eq("id", showId);
});

test.beforeEach(async () => {
  await admin.from("revoked_links").delete().eq("show_id", showId);
  await setAuthVersions(1);
  await admin.from("app_settings").update({ active_signing_key_id: "k1" }).eq("id", "default");
});

test("scans leaked ?t= on the root crew page and raises the revocation floor for the live version", async ({
  request,
}) => {
  await setAuthVersions(3);

  const response = await request.get(await leakedUrl(`/show/${slug}`, 3));

  expect(response.status()).toBe(410);
  await expect(response.json()).resolves.toMatchObject({ code: "LEAKED_LINK_DETECTED" });
  expect(await revokedRows()).toEqual([
    { crew_name: crewName, token_version: 3, revoked_reason: "leaked_query_token" },
  ]);
  expect(await authRow()).toMatchObject({
    current_token_version: 3,
    max_issued_version: 3,
    revoked_below_version: 3,
  });
});

test("leaked stale versions only add an idempotent surgical revocation row on any show subroute", async ({
  request,
}) => {
  await setAuthVersions(5, 5, 0);
  const url = await leakedUrl(`/show/${slug}/future/subroute`, 3);

  const first = await request.get(url);
  const second = await request.get(url);

  expect(first.status()).toBe(410);
  expect(second.status()).toBe(410);
  expect(await revokedRows()).toEqual([
    { crew_name: crewName, token_version: 3, revoked_reason: "leaked_query_token" },
  ]);
  expect(await authRow()).toMatchObject({
    current_token_version: 5,
    max_issued_version: 5,
    revoked_below_version: 0,
  });
});

test("leaked future versions lift current max issued and floor together in one transaction", async ({
  request,
}) => {
  await setAuthVersions(3, 3, 0);

  const response = await request.get(await leakedUrl(`/show/${slug}/p/anything`, 7));

  expect(response.status()).toBe(410);
  await expect(response.json()).resolves.toMatchObject({ code: "LEAKED_LINK_DETECTED" });
  expect(await revokedRows()).toEqual([
    { crew_name: crewName, token_version: 7, revoked_reason: "leaked_query_token" },
  ]);
  expect(await authRow()).toMatchObject({
    current_token_version: 7,
    max_issued_version: 7,
    revoked_below_version: 7,
  });
});
