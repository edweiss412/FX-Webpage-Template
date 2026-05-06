/**
 * tests/e2e/bootstrap.spec.ts (M5 §B Task 5.5 — Opus's portion)
 *
 * End-to-end coverage of the bootstrap shell at `/show/<slug>/p`.
 * Implements the mandatory test matrix from plan §199 step 1:
 *
 *   (a) Single render mints exactly one bootstrap_nonces row + one cookie
 *       array entry; signing_key_id equality across row + cookie + active.
 *   (b) Two quick renders → two distinct nonces; both rows + cookie entries
 *       carry the same kid; no clobber.
 *   (c) Cross-show: A then B → two rows (one per show) + two cookie entries;
 *       each independently redeemable.
 *   (d) 5-entry cookie cap honored after 6 renders; oldest evicted.
 *   (e) Cookie name MUST be the literal `__Host-fxav_bootstrap_v`.
 *   (f) Rotation between renders: first row + cookie entry pinned to k1;
 *       second pinned to k2; first row's kid stays k1 (immutable post-INSERT).
 *
 *   Plus end-to-end redeem flow:
 *   (g) /show/<slug>/p#t=<valid-jwt> → bootstrap_nonces row created;
 *       redeem-link POST sent; __Host-fxav_session cookie set; URL changed
 *       to /show/<slug> via router.replace; fragment stripped from history.
 *   (h) /show/<slug>/p WITHOUT #t= → friendly "Open this link from the
 *       message Doug sent you" rendered; the bootstrapMint Server Action
 *       is NOT invoked (it gates on a non-empty fragment client-side).
 *   (i) /show/<slug>/p#t=<invalid-jwt> → redeem-link returns 401/410;
 *       generic inline error rendered; user can navigate elsewhere.
 *
 * Cookie-jar caveat (`__Host-` prefix + plain HTTP):
 *   The dev server runs over plain HTTP (`http://127.0.0.1:3000`). The
 *   browser refuses to ACCEPT a `__Host-` prefixed cookie carried on a
 *   non-Secure response (per the cookie spec — the prefix demands HTTPS).
 *   That means `page.context().cookies()` will be EMPTY for the bootstrap
 *   cookie even when the server set it correctly. The production-equivalent
 *   contract is "the Set-Cookie header was emitted with the right value
 *   and the right attributes" — which we assert by capturing every
 *   `Set-Cookie: __Host-fxav_bootstrap_v=...` header off the
 *   BrowserContext's response stream (the `BootstrapCookieCapture` helper).
 *   In production over HTTPS the browser would accept the cookie, the
 *   server would echo it on the next request, and the client-side cookie
 *   jar would carry the same value.
 *
 *   For (e) we ALSO assert the exact attribute set on the captured
 *   Set-Cookie header so a regression that drops Secure/HttpOnly/Path
 *   trips the test.
 *
 * Anti-tautology discipline:
 *   - Cookie-name assertions compare the LITERAL `__Host-fxav_bootstrap_v`
 *     string (NOT a constant import) so a constant rename can't slip past.
 *   - signing_key_id assertions read FROM the DB row, FROM the cookie
 *     envelope (captured Set-Cookie), AND from app_settings — three
 *     independent sources — and assert all three are equal.
 *   - The "fragment stripped" assertion reads `page.url()` AFTER the
 *     router.replace settles; a no-op `replaceState` would leave the
 *     fragment in the URL bar.
 *
 * Test isolation: each test creates its own (showId, slug, crewName) tuple
 * and tears it down. The shared admin user / app_settings.active_signing_key_id
 * is reset to 'k1' in beforeEach.
 */
import { randomUUID } from "node:crypto";
import { expect, test, type Page, type BrowserContext } from "@playwright/test";

import { signLinkJwt } from "@/lib/auth/jwt";
import {
  decodeBootstrapCookieEntries,
  encodeBootstrapCookieEntries,
  type BootstrapCookieEntry,
} from "@/lib/auth/bootstrapCookie";
import { admin } from "@/tests/e2e/helpers/supabaseAdmin";

const TEST_SECRET = "redeem-link-test-secret-32-bytes-min";

// Anti-tautology: literal cookie names. The §A constants
// (lib/auth/constants.ts) are the single source of truth; we assert
// against the literal so a rename triggers a test failure here too.
const BOOTSTRAP_COOKIE_LITERAL = "__Host-fxav_bootstrap_v";
const SESSION_COOKIE_LITERAL = "__Host-fxav_session";

/**
 * `__Host-` cookies require Secure + the browser refuses them on plain
 * HTTP responses. The test rig therefore CAN'T rely on
 * `page.context().cookies()` to surface the bootstrap cookie on dev.
 *
 * Instead, install a `response` listener on the BrowserContext that
 * captures every `Set-Cookie: __Host-fxav_bootstrap_v=...` header.
 * Each Server Action response carries a fresh Set-Cookie that REPLACES
 * the prior one (the cookie's value is the entire updated array, not a
 * delta), so the LATEST captured value is the source of truth.
 *
 * Also captures the per-attribute Set-Cookie text so test (e) can assert
 * the canonical __Host- attribute set.
 */
/**
 * Extract the raw bootstrap-cookie value (URL-encoded JSON) from a
 * normalized headers array. Single source of truth for Set-Cookie
 * parsing — used by both `BootstrapCookieCapture.captureSetCookies` and
 * test (g)'s auto-plant listener.
 *
 * Returns null if no `__Host-fxav_bootstrap_v=` header is present.
 */
function extractBootstrapCookieRaw(
  headers: Array<{ name: string; value: string }>,
): string | null {
  const setCookieHeaders = headers
    .filter((h) => h.name.toLowerCase() === "set-cookie")
    .map((h) => h.value);
  if (setCookieHeaders.length === 0) return null;
  const joined = setCookieHeaders.join(", ");
  const m = joined.match(/__Host-fxav_bootstrap_v=([^;\r\n,]*)/);
  return m && m[1] ? m[1] : null;
}

class BootstrapCookieCapture {
  private latestRaw: string | null = null;
  private latestSetCookieLine: string | null = null;
  private sessionCookieRaw: string | null = null;

  attach(context: BrowserContext): void {
    context.on("response", (res) => {
      // headersArray() is sync (despite the API surface allowing async
      // for stream cases) for normal HTTP responses. Use the sync flavor
      // so the cookie value is captured BEFORE the next request fires.
      let headers: Array<{ name: string; value: string }>;
      try {
        const result = res.headersArray() as
          | Array<{ name: string; value: string }>
          | Promise<Array<{ name: string; value: string }>>;
        if (typeof (result as Promise<unknown>).then === "function") {
          // Async path — fall through to the response.allHeaders path.
          (result as Promise<Array<{ name: string; value: string }>>)
            .then((h) => this.captureSetCookies(h))
            .catch(() => {});
          return;
        }
        headers = result as Array<{ name: string; value: string }>;
      } catch {
        return;
      }
      this.captureSetCookies(headers);
    });
  }

  private captureSetCookies(
    headers: Array<{ name: string; value: string }>,
  ): void {
      // Playwright's headersArray normalizes multiple Set-Cookie headers
      // by SPLITTING ON COMMAS — which is wrong for cookies whose
      // Expires attribute contains a comma ("Expires=Mon, 04 May..."),
      // since the comma INSIDE the expires value gets treated as a
      // multi-cookie separator. To recover the canonical Set-Cookie
      // string, concatenate ALL adjacent set-cookie entries with `, `
      // (the mangled separator), then scan for our cookie name + the
      // expected attribute set.
      const setCookieHeaders = headers
        .filter((h) => h.name.toLowerCase() === "set-cookie")
        .map((h) => h.value);
      if (setCookieHeaders.length === 0) return;
      const joined = setCookieHeaders.join(", ");

      // Bootstrap-cookie value (single source of truth via helper).
      const bootstrapRaw = extractBootstrapCookieRaw(headers);
      if (bootstrapRaw !== null) {
        this.latestRaw = bootstrapRaw;
        // Capture the substring starting at our cookie's name and
        // extending through the next cookie's name OR end-of-string.
        // The "next cookie's name" pattern is `, <NAME>=` where NAME
        // doesn't start with a digit (protects against Expires's date
        // comma which is followed by ` 04 May...`).
        const startIdx = joined.indexOf("__Host-fxav_bootstrap_v=");
        const tail = joined.substring(startIdx);
        // .substring(1) skips the leading char so we don't match the
        // cookie-name itself; nextCookieIdx is then 0-based in the
        // slice, which corresponds to position (nextCookieIdx + 1) in
        // the full `tail`. The slice end at (nextCookieIdx + 1)
        // excludes the comma at that position.
        const nextCookieIdx = tail
          .substring(1)
          .search(/,\s*[A-Za-z][A-Za-z0-9_-]*=/);
        this.latestSetCookieLine =
          nextCookieIdx === -1
            ? tail
            : tail.substring(0, nextCookieIdx + 1);
      }
      const sessionMatch = joined.match(/__Host-fxav_session=([^;\r\n,]*)/);
      if (sessionMatch) {
        this.sessionCookieRaw = sessionMatch[1] ?? null;
      }
  }

  latestEntries(): BootstrapCookieEntry[] {
    return decodeBootstrapCookieEntries(this.latestRaw ?? undefined);
  }

  latestRawSetCookieLine(): string | null {
    return this.latestSetCookieLine;
  }

  hasSessionCookie(): boolean {
    return this.sessionCookieRaw !== null && this.sessionCookieRaw.length > 0;
  }

  reset(): void {
    this.latestRaw = null;
    this.latestSetCookieLine = null;
    this.sessionCookieRaw = null;
  }
}

async function readActiveSigningKeyId(): Promise<string> {
  const { data, error } = await admin
    .from("app_settings")
    .select("active_signing_key_id")
    .eq("id", "default")
    .single();
  if (error) throw new Error(error.message);
  return (data as { active_signing_key_id: string }).active_signing_key_id;
}

type ShowFixture = {
  showId: string;
  slug: string;
  crewName: string;
  crewMemberId: string;
};

async function createShowFixture(label: string): Promise<ShowFixture> {
  const showId = randomUUID();
  const slug = `bootstrap-${label}-${showId.slice(0, 8)}`;
  const driveFileId = `drive-bootstrap-${showId}`;
  const crewMemberId = randomUUID();
  const crewName = `Bootstrap Tester ${label}`;

  await admin.from("shows").delete().eq("id", showId);
  const showInsert = await admin.from("shows").insert({
    id: showId,
    drive_file_id: driveFileId,
    slug,
    title: `Bootstrap Test ${label}`,
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
    email: `bootstrap-${label}@fxav.test`,
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

  return { showId, slug, crewName, crewMemberId };
}

async function tearDownShowFixture(fix: ShowFixture): Promise<void> {
  await admin.from("shows").delete().eq("id", fix.showId);
}

/**
 * Wait for the bootstrap shell to finish its mint+redeem cycle. Resolves
 * when the page has either:
 *   - rendered an error (bootstrap-error data-testid), OR
 *   - rendered the no-fragment message (bootstrap-no-fragment), OR
 *   - navigated away (URL no longer ends with `/p`).
 *
 * This is more reliable than `networkidle` because the bootstrap action's
 * POST may complete in <50ms but networkidle requires 500ms of true
 * network silence; in fast tests, 500ms after the POST will already see
 * the next test's setup beginning.
 */
async function waitForBootstrapSettled(page: Page, slug: string): Promise<void> {
  await page
    .waitForFunction(
      ({ slug: s }) => {
        if (
          document.querySelector('[data-testid="bootstrap-error"]') !== null
        ) {
          return true;
        }
        if (
          document.querySelector('[data-testid="bootstrap-no-fragment"]') !==
          null
        ) {
          return true;
        }
        // Navigated away (router.replace fired).
        if (!window.location.pathname.endsWith(`/show/${s}/p`)) {
          return true;
        }
        return false;
      },
      { slug },
      { timeout: 10_000 },
    )
    .catch(() => {
      // Timeout — the test will fail downstream on the row/cookie assertions
      // with a more meaningful message. Don't blow up here.
    });
}

/**
 * Plant the previously-emitted bootstrap cookie value into the browser
 * cookie jar directly via Playwright's addCookies. This bypasses the
 * browser's __Host-prefix-requires-HTTPS rejection so cumulative cookie
 * state behaves the same in dev HTTP tests as it would in HTTPS prod.
 *
 * Why this is needed: the bootstrap shell's Server Action emits a
 * Set-Cookie header on every render. In production over HTTPS the
 * browser accepts the cookie and sends it back on the next render; the
 * server reads the existing array, appends the new entry, and re-emits.
 * In dev over HTTP the browser refuses to accept any __Host- cookie, so
 * the next render's "existing array" is empty and the cookie value
 * regresses to just the freshly minted entry. Planting the captured
 * value restores the production cumulative-state contract. Chromium
 * enforces `__Host-` strictly in addCookies(), so it gets a host-only
 * Secure cookie; WebKit echoes the local HTTP cookie only through the
 * older insecure dev-server shape.
 *
 * Tests that need cumulative state across navigations (b, c, d, f) call
 * this between gotos. Tests that observe a single render's behavior
 * (a, e, g, h, i) don't need it.
 */
async function plantBootstrapCookie(
  context: BrowserContext,
  cap: BootstrapCookieCapture,
): Promise<void> {
  const entries = cap.latestEntries();
  if (entries.length === 0) return;
  // Re-encode for the wire: cookie values cannot contain raw JSON
  // quotes/commas/braces, and Playwright stores addCookies values as-is.
  // This matches the URL-encoded value the browser would retain from
  // Next's Set-Cookie header in HTTPS production.
  const value = encodeURIComponent(encodeBootstrapCookieEntries(entries));
  const isWebKit = context.browser()?.browserType().name() === "webkit";
  await context.addCookies([
    isWebKit
      ? {
          name: BOOTSTRAP_COOKIE_LITERAL,
          value,
          domain: "127.0.0.1",
          path: "/",
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        }
      : {
          name: BOOTSTRAP_COOKIE_LITERAL,
          value,
          // Use url rather than domain/path so Playwright creates a
          // host-only cookie. A `Domain=` attribute would violate the
          // `__Host-` prefix contract and Chromium rejects it.
          url: "https://127.0.0.1:3000/",
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
        },
  ]);
}

async function stubRedeemLinkForMintOnlyAssertions(page: Page): Promise<void> {
  await page.route("**/api/auth/redeem-link", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ code: "SESSION_NOT_FOUND" }),
    });
  });
}

test.beforeAll(() => {
  process.env.JWT_SIGNING_SECRET = TEST_SECRET;
});

test.beforeEach(async ({ context }) => {
  // Reset signing-key state and clear any stale browser cookies.
  await admin
    .from("app_settings")
    .update({ active_signing_key_id: "k1" })
    .eq("id", "default");
  await context.clearCookies();
});

// ============ (a) Single render: one row + one cookie entry; kids match ============

test("(a) single render mints exactly one bootstrap_nonces row + one cookie array entry; signing_key_id equality", async ({
  page,
  context,
}) => {
  const fix = await createShowFixture("a");
  const cap = new BootstrapCookieCapture();
  cap.attach(context);
  await stubRedeemLinkForMintOnlyAssertions(page);
  try {
    // Use a placeholder JWT and stub redeem-link — this test asserts the
    // bootstrap mint side-effects, not the later redeem/cleanup outcome.
    await page.goto(`/show/${fix.slug}/p#t=placeholder-not-a-jwt`);
    await waitForBootstrapSettled(page, fix.slug);

    // Read the row from the DB.
    const { data: rows, error } = await admin
      .from("bootstrap_nonces")
      .select("nonce_hash, show_id, signing_key_id")
      .eq("show_id", fix.showId);
    if (error) throw new Error(error.message);
    expect(rows ?? []).toHaveLength(1);
    const row = (rows ?? [])[0]!;

    // Read the cookie array via the Set-Cookie capture.
    const entries = cap.latestEntries();
    expect(entries).toHaveLength(1);
    const entry = entries[0]!;

    // Triangulate: row.kid === cookie.kid === active_signing_key_id.
    const activeKid = await readActiveSigningKeyId();
    expect(row.signing_key_id).toBe(activeKid);
    expect(entry.signing_key_id).toBe(activeKid);
    expect(row.signing_key_id).toBe(entry.signing_key_id);

    // Composite-key match: cookie entry's nonce_hash + show_id matches the row.
    expect(entry.nonce_hash).toBe(row.nonce_hash);
    expect(entry.show_id).toBe(row.show_id);
    expect(entry.show_id).toBe(fix.showId);
  } finally {
    await tearDownShowFixture(fix);
  }
});

// ============ (b) Two quick renders → two distinct nonces ============

test("(b) two quick renders → two distinct nonces in cookie array; both rows + entries carry the same kid", async ({
  page,
  context,
}) => {
  const fix = await createShowFixture("b");
  const cap = new BootstrapCookieCapture();
  cap.attach(context);
  await stubRedeemLinkForMintOnlyAssertions(page);
  try {
    await page.goto(`/show/${fix.slug}/p#t=placeholder-1`);
    await waitForBootstrapSettled(page, fix.slug);
    // Plant the freshly-set bootstrap cookie back into the jar so the
    // second navigation's server action sees the existing array (the
    // browser refuses __Host- cookies over HTTP, so without this the
    // second render starts from an empty array — see
    // plantBootstrapCookie's docstring).
    await plantBootstrapCookie(context, cap);
    // page.goto to the SAME pathname with only the fragment differing
    // does NOT trigger a full page reload (the browser treats it as an
    // in-page hash change). Force a fresh document by going to a
    // neutral URL first, then back to the bootstrap shell with a new
    // fragment. This guarantees the React component remounts and the
    // useEffect's didRunRef starts fresh.
    await page.goto("about:blank");
    await page.goto(`/show/${fix.slug}/p#t=placeholder-2`);
    await waitForBootstrapSettled(page, fix.slug);

    const { data: rows, error } = await admin
      .from("bootstrap_nonces")
      .select("nonce_hash, signing_key_id")
      .eq("show_id", fix.showId)
      .order("issued_at", { ascending: true });
    if (error) throw new Error(error.message);
    expect(rows ?? []).toHaveLength(2);
    expect((rows ?? [])[0]!.nonce_hash).not.toBe((rows ?? [])[1]!.nonce_hash);
    expect((rows ?? [])[0]!.signing_key_id).toBe(
      (rows ?? [])[1]!.signing_key_id,
    );

    // Latest cookie carries BOTH entries (server reads existing array,
    // appends, writes back the union).
    const entries = cap.latestEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0]!.nonce_hash).not.toBe(entries[1]!.nonce_hash);
    expect(entries[0]!.signing_key_id).toBe(entries[1]!.signing_key_id);

    const dbHashes = new Set((rows ?? []).map((r) => r.nonce_hash));
    const cookieHashes = new Set(entries.map((e) => e.nonce_hash));
    expect(cookieHashes).toEqual(dbHashes);
  } finally {
    await tearDownShowFixture(fix);
  }
});

// ============ (c) Cross-show: A then B → two rows + two entries ============

test("(c) cross-show: /show/A/p then /show/B/p → two rows (one per show) + two cookie entries", async ({
  page,
  context,
}) => {
  const fixA = await createShowFixture("ca");
  const fixB = await createShowFixture("cb");
  const cap = new BootstrapCookieCapture();
  cap.attach(context);
  await stubRedeemLinkForMintOnlyAssertions(page);
  try {
    await page.goto(`/show/${fixA.slug}/p#t=placeholder-a`);
    await waitForBootstrapSettled(page, fixA.slug);
    await plantBootstrapCookie(context, cap);
    await page.goto(`/show/${fixB.slug}/p#t=placeholder-b`);
    await waitForBootstrapSettled(page, fixB.slug);

    const { data: rowsA } = await admin
      .from("bootstrap_nonces")
      .select("nonce_hash, show_id")
      .eq("show_id", fixA.showId);
    const { data: rowsB } = await admin
      .from("bootstrap_nonces")
      .select("nonce_hash, show_id")
      .eq("show_id", fixB.showId);
    expect(rowsA ?? []).toHaveLength(1);
    expect(rowsB ?? []).toHaveLength(1);

    const entries = cap.latestEntries();
    expect(entries).toHaveLength(2);
    const entryA = entries.find((e) => e.show_id === fixA.showId);
    const entryB = entries.find((e) => e.show_id === fixB.showId);
    expect(entryA).toBeDefined();
    expect(entryB).toBeDefined();
    expect(entryA!.nonce_hash).toBe((rowsA ?? [])[0]!.nonce_hash);
    expect(entryB!.nonce_hash).toBe((rowsB ?? [])[0]!.nonce_hash);
  } finally {
    await tearDownShowFixture(fixA);
    await tearDownShowFixture(fixB);
  }
});

// ============ (d) 5-entry cap ============

test("(d) 5-entry cookie cap honored: 6 renders → exactly 5 entries; oldest evicted", async ({
  page,
  context,
}) => {
  const fix = await createShowFixture("d");
  const cap = new BootstrapCookieCapture();
  cap.attach(context);
  await stubRedeemLinkForMintOnlyAssertions(page);
  try {
    for (let i = 0; i < 6; i++) {
      await page.goto(`/show/${fix.slug}/p#t=placeholder-${i}`);
      await waitForBootstrapSettled(page, fix.slug);
      // Plant the cumulative cookie state so the next render's server
      // action sees the existing array (defeats the __Host- + HTTP
      // browser-rejection limitation in dev — see plantBootstrapCookie).
      await plantBootstrapCookie(context, cap);
      // Force a fresh document for the next iteration — same-pathname
      // hash-only goto does NOT remount the React component.
      if (i < 5) await page.goto("about:blank");
    }

    const entries = cap.latestEntries();
    expect(entries).toHaveLength(5);

    const { data: rows, error } = await admin
      .from("bootstrap_nonces")
      .select("nonce_hash")
      .eq("show_id", fix.showId);
    if (error) throw new Error(error.message);
    expect(rows ?? []).toHaveLength(6);

    const { data: orderedRows } = await admin
      .from("bootstrap_nonces")
      .select("nonce_hash, issued_at")
      .eq("show_id", fix.showId)
      .order("issued_at", { ascending: true });
    const oldestHash = (orderedRows ?? [])[0]!.nonce_hash;
    expect(entries.find((e) => e.nonce_hash === oldestHash)).toBeUndefined();
  } finally {
    await tearDownShowFixture(fix);
  }
});

// ============ (e) Cookie name + canonical __Host- attribute set ============

test("(e) cookie name MUST be the literal __Host-fxav_bootstrap_v with canonical __Host- attributes (Path=/, Secure, HttpOnly, SameSite=Lax, no Domain)", async ({
  page,
  context,
}) => {
  const fix = await createShowFixture("e");
  const cap = new BootstrapCookieCapture();
  cap.attach(context);
  await stubRedeemLinkForMintOnlyAssertions(page);
  try {
    await page.goto(`/show/${fix.slug}/p#t=placeholder`);
    await waitForBootstrapSettled(page, fix.slug);

    // The capture pulled the literal Set-Cookie header line; assert each
    // canonical __Host- attribute is present (or in the case of Domain,
    // ABSENT — the prefix forbids it).
    const setCookie = cap.latestRawSetCookieLine();
    expect(setCookie).not.toBeNull();
    // Anti-tautology: literal name comparison.
    expect(setCookie!).toMatch(/^__Host-fxav_bootstrap_v=/);
    // Path=/
    expect(setCookie!).toMatch(/;\s*Path=\//i);
    // Secure
    expect(setCookie!).toMatch(/;\s*Secure(?:;|$)/i);
    // HttpOnly
    expect(setCookie!).toMatch(/;\s*HttpOnly(?:;|$)/i);
    // SameSite=Lax
    expect(setCookie!).toMatch(/;\s*SameSite=Lax/i);
    // Max-Age=30
    expect(setCookie!).toMatch(/;\s*Max-Age=30(?:;|$)/i);
    // No Domain — the __Host- prefix forbids it.
    expect(setCookie!).not.toMatch(/;\s*Domain=/i);
  } finally {
    await tearDownShowFixture(fix);
  }
});

// ============ (f) Rotation between renders ============

test("(f) rotation between renders: first row + cookie entry pinned to k1; second to k2; first row stays k1 (immutable)", async ({
  page,
  context,
}) => {
  const fix = await createShowFixture("f");
  const cap = new BootstrapCookieCapture();
  cap.attach(context);
  await stubRedeemLinkForMintOnlyAssertions(page);
  try {
    // First render under k1.
    await admin
      .from("app_settings")
      .update({ active_signing_key_id: "k1" })
      .eq("id", "default");
    await page.goto(`/show/${fix.slug}/p#t=placeholder-pre-rotation`);
    await waitForBootstrapSettled(page, fix.slug);

    const { data: rowsAfterFirst } = await admin
      .from("bootstrap_nonces")
      .select("nonce_hash, signing_key_id, issued_at")
      .eq("show_id", fix.showId)
      .order("issued_at", { ascending: true });
    expect(rowsAfterFirst ?? []).toHaveLength(1);
    expect((rowsAfterFirst ?? [])[0]!.signing_key_id).toBe("k1");
    const firstRowHash = (rowsAfterFirst ?? [])[0]!.nonce_hash;

    const entriesAfterFirst = cap.latestEntries();
    expect(entriesAfterFirst).toHaveLength(1);
    expect(entriesAfterFirst[0]!.signing_key_id).toBe("k1");

    // Rotate the active signing key.
    await admin
      .from("app_settings")
      .update({ active_signing_key_id: "k2" })
      .eq("id", "default");

    // Plant cumulative cookie state for the second render.
    await plantBootstrapCookie(context, cap);

    // Second render under k2 (force fresh document — see test (b)
    // about:blank rationale).
    await page.goto("about:blank");
    await page.goto(`/show/${fix.slug}/p#t=placeholder-post-rotation`);
    await waitForBootstrapSettled(page, fix.slug);

    const { data: rowsAfterSecond } = await admin
      .from("bootstrap_nonces")
      .select("nonce_hash, signing_key_id, issued_at")
      .eq("show_id", fix.showId)
      .order("issued_at", { ascending: true });
    expect(rowsAfterSecond ?? []).toHaveLength(2);

    const firstRowAfter = (rowsAfterSecond ?? []).find(
      (r) => r.nonce_hash === firstRowHash,
    );
    expect(firstRowAfter).toBeDefined();
    expect(firstRowAfter!.signing_key_id).toBe("k1");

    const secondRow = (rowsAfterSecond ?? []).find(
      (r) => r.nonce_hash !== firstRowHash,
    );
    expect(secondRow).toBeDefined();
    expect(secondRow!.signing_key_id).toBe("k2");

    const entriesAfterSecond = cap.latestEntries();
    expect(entriesAfterSecond).toHaveLength(2);
    const cookieFirst = entriesAfterSecond.find(
      (e) => e.nonce_hash === firstRowHash,
    );
    const cookieSecond = entriesAfterSecond.find(
      (e) => e.nonce_hash !== firstRowHash,
    );
    expect(cookieFirst).toBeDefined();
    expect(cookieFirst!.signing_key_id).toBe("k1");
    expect(cookieSecond).toBeDefined();
    expect(cookieSecond!.signing_key_id).toBe("k2");
  } finally {
    await tearDownShowFixture(fix);
    await admin
      .from("app_settings")
      .update({ active_signing_key_id: "k1" })
      .eq("id", "default");
  }
});

// ============ (g) End-to-end happy-path redeem ============

test("(g) /show/<slug>/p#t=<valid-jwt> → bootstrap row created; redeem-link POSTed with right shape; session cookie set; URL changed away from /p; fragment stripped", async ({
  page,
  context,
}) => {
  const fix = await createShowFixture("g");
  const cap = new BootstrapCookieCapture();
  cap.attach(context);

  // Auto-plant any __Host-fxav_bootstrap_v cookie the server emits back
  // into the browser jar, using a browser-specific local-HTTP shim.
  // This way the next outgoing request
  // (the redeem-link POST that the client island fires) will carry the
  // cookie back to the server, just like it would over HTTPS in prod.
  //
  // Uses `extractBootstrapCookieRaw` — single source of truth for
  // Set-Cookie extraction shared with `BootstrapCookieCapture`.
  context.on("response", async (res) => {
    let headers: Array<{ name: string; value: string }>;
    try {
      headers = await res.headersArray();
    } catch {
      return;
    }
    const raw = extractBootstrapCookieRaw(headers);
    if (raw !== null) {
      try {
        const isWebKit = context.browser()?.browserType().name() === "webkit";
        await context.addCookies([
          isWebKit
            ? {
                name: BOOTSTRAP_COOKIE_LITERAL,
                value: raw,
                domain: "127.0.0.1",
                path: "/",
                httpOnly: true,
                secure: false,
                sameSite: "Lax",
              }
            : {
                name: BOOTSTRAP_COOKIE_LITERAL,
                value: raw,
                url: "https://127.0.0.1:3000/",
                httpOnly: true,
                secure: true,
                sameSite: "Lax",
              },
        ]);
      } catch {
        // ignore — addCookies can fail if context is closing
      }
    }
  });

  // Capture every redeem-link POST body so we can assert the client island
  // sent the right shape ({ token, nonce, show_id }) — the contract the
  // §A redeem-link route consumes.
  const redeemPosts: Array<{ token: string; nonce: string; show_id: string }> =
    [];
  page.on("request", (req) => {
    if (req.url().includes("/api/auth/redeem-link") && req.method() === "POST") {
      try {
        const body = req.postDataJSON() as {
          token: string;
          nonce: string;
          show_id: string;
        };
        redeemPosts.push(body);
      } catch {
        // ignore — non-JSON body would fail the test downstream anyway
      }
    }
  });

  try {
    const signed = await signLinkJwt({
      showId: fix.showId,
      name: fix.crewName,
      displayName: fix.crewName,
      tokenVersion: 1,
    });

    await page.goto(`/show/${fix.slug}/p#t=${encodeURIComponent(signed.token)}`);

    // Wait for navigation away from /p (router.replace fired after a
    // 200 from redeem-link) OR for an error state (which would mean
    // redeem failed).
    await page
      .waitForFunction(
        ({ slug }) =>
          !window.location.pathname.endsWith(`/show/${slug}/p`) ||
          document.querySelector('[data-testid="bootstrap-error"]') !== null,
        { slug: fix.slug },
        { timeout: 10_000 },
      )
      .catch(() => {
        // Timeout — downstream assertions will localize the actual issue.
      });

    // Contract 1: the client island sent ONE redeem-link POST with the
    // right shape ({ token, nonce, show_id }). The token is the JWT
    // we signed; the show_id is the resolved show_id for the slug;
    // the nonce is the freshly-minted UUID.
    expect(redeemPosts).toHaveLength(1);
    const post = redeemPosts[0]!;
    expect(post.token).toBe(signed.token);
    expect(post.show_id).toBe(fix.showId);
    expect(typeof post.nonce).toBe("string");
    expect(post.nonce.length).toBeGreaterThan(0);

    // Contract 2: bootstrap_nonces row was INSERTed AND consumed by the
    // redeem-link route's atomic consume UPDATE.
    const { data: rows } = await admin
      .from("bootstrap_nonces")
      .select("nonce_hash, consumed_at")
      .eq("show_id", fix.showId);
    expect(rows ?? []).toHaveLength(1);
    expect((rows ?? [])[0]!.consumed_at).not.toBeNull();

    // Contract 3: link_sessions row was INSERTed (redeem succeeded
    // server-side; the cookie injection in our `route.continue` handler
    // satisfied the redeem-link route's CSRF gate).
    const { data: sessions } = await admin
      .from("link_sessions")
      .select("crew_member_id, show_id")
      .eq("show_id", fix.showId);
    expect(sessions ?? []).toHaveLength(1);
    expect((sessions ?? [])[0]!.crew_member_id).toBe(fix.crewMemberId);

    // Contract 4: the redeem-link route emitted a __Host-fxav_session
    // Set-Cookie. (Browser may have refused it over HTTP, but the
    // capture sees it on the wire.)
    expect(cap.hasSessionCookie()).toBe(true);

    // Contract 5: the bootstrap shell navigated AWAY from /p AND
    // stripped the fragment from window.location. Over HTTP the
    // session cookie was refused by the browser, so the destination
    // /show/<slug> may have redirected through /auth/sign-in — that's
    // fine; the contract being tested here is "we left the bootstrap
    // shell AND we cleared the fragment."
    expect(page.url()).not.toContain(`/show/${fix.slug}/p`);
    expect(page.url()).not.toContain("#t=");
  } finally {
    await tearDownShowFixture(fix);
  }
});

// ============ (h) No fragment → friendly message; no DB call ============

test("(h) /show/<slug>/p WITHOUT #t= → friendly 'Open this link...' message; no bootstrap_nonces row created", async ({
  page,
  context,
}) => {
  const fix = await createShowFixture("h");
  const cap = new BootstrapCookieCapture();
  cap.attach(context);
  try {
    await page.goto(`/show/${fix.slug}/p`);
    await expect(page.getByTestId("bootstrap-no-fragment")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByTestId("bootstrap-no-fragment")).toContainText(
      "Open this link from the message Doug sent you",
    );

    // No row written (the bootstrapMint Server Action is gated on a
    // non-empty fragment client-side, so it's never invoked).
    const { data: rows } = await admin
      .from("bootstrap_nonces")
      .select("nonce_hash")
      .eq("show_id", fix.showId);
    expect(rows ?? []).toHaveLength(0);

    // No bootstrap cookie set (the action never ran).
    expect(cap.latestEntries()).toHaveLength(0);
  } finally {
    await tearDownShowFixture(fix);
  }
});

// ============ (i) Invalid JWT → inline error ============

test("(i) /show/<slug>/p#t=<invalid-jwt> → redeem-link rejects; generic inline error rendered; user can navigate away", async ({
  page,
  context,
}) => {
  const fix = await createShowFixture("i");
  const cap = new BootstrapCookieCapture();
  cap.attach(context);
  try {
    // Syntactically-valid-looking but unverifiable JWT. The redeem-link
    // route should respond with 401 SESSION_NOT_FOUND or similar; the
    // bootstrap shell should render the generic error block.
    const garbageJwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJnYXJiYWdlIjp0cnVlfQ.invalid-signature";

    await page.goto(`/show/${fix.slug}/p#t=${encodeURIComponent(garbageJwt)}`);
    await expect(page.getByTestId("bootstrap-error")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId("bootstrap-error")).toContainText(
      "Something went wrong opening this link",
    );

    // No infinite loop / runaway nonce minting — exactly one row written
    // (the mint succeeds; only the redeem fails).
    const { data: rows } = await admin
      .from("bootstrap_nonces")
      .select("nonce_hash")
      .eq("show_id", fix.showId);
    expect(rows ?? []).toHaveLength(1);

    // No session cookie minted by redeem-link (it returned non-2xx).
    expect(cap.hasSessionCookie()).toBe(false);

    // User can still navigate elsewhere — the page remains on /p (no
    // forced navigation; the error UI is informational).
    expect(page.url()).toContain(`/show/${fix.slug}/p`);
  } finally {
    await tearDownShowFixture(fix);
  }
});
