/**
 * app/show/[slug]/p/actions.ts (M5 §B Task 5.5 — Opus's portion)
 *
 * Server Action invoked by the bootstrap shell's client island
 * (`Bootstrap.tsx`) on mount to mint a fresh `bootstrap_nonces` row +
 * append a matching entry to the `__Host-fxav_bootstrap_v` cookie array.
 * The returned `{ nonce }` is then echoed by the client into the
 * `/api/auth/redeem-link` POST body alongside the JWT extracted from
 * `location.hash`.
 *
 * Why a Server Action and not a route handler?
 *   The bootstrap shell page (`page.tsx`) is a Server Component. Next 16
 *   forbids cookie mutation from a Server Component render path
 *   (`cookies().set()` throws). Three options were considered (see the
 *   implementer-prompt §A→§B notes):
 *     (a) Convert the page to a `route.ts` handler — loses JSX rendering.
 *     (b) middleware.ts — §A territory, off-limits for §B.
 *     (c) Server Action triggered by the client island on mount — runs in
 *         a Server-Action context where `cookies().set()` works. Cleanest
 *         architectural fit; preserves JSX; isolates DB + cookie mutation
 *         from the SSR render. WINNER.
 *
 * Read-with-INSERT atomicity invariant (plan §199):
 *   The row's `signing_key_id`, the cookie entry's `signing_key_id`, and
 *   the value of `app_settings.active_signing_key_id` MUST be EQUAL at the
 *   moment of mint. If a §7.2.3 global-rotation operator UPDATE slips
 *   between the read and the INSERT, the redeem-link route's row-vs-cookie
 *   kid comparison would mis-classify a benign rotation race as
 *   `CSRF_DENIED` (instead of the correct `CSRF_KEY_ROTATED`). To prevent
 *   the race, we read `app_settings.active_signing_key_id` INSIDE the
 *   per-show advisory lock, then INSERT the row and write the cookie
 *   entry from the SAME captured value — all within the same lock.
 *
 * Per-show advisory lock invariant (AGENTS.md §1.2):
 *   Every code path that mutates `bootstrap_nonces` (a row keyed by show)
 *   runs inside `withShowAdvisoryLock(showId, 'try', ...)`. The 'try'
 *   mode is correct: bootstrap rendering should NOT block on a contended
 *   lock — if another concurrent bootstrap mint is in flight for this
 *   show, surface the transient error so the page reload retries
 *   naturally. (At 30s nonce TTL + ~1ms INSERT, contention is effectively
 *   impossible in practice; the lock exists as a defense-in-depth
 *   guarantee.)
 *
 * Cookie array contract:
 *   - Existing array is parsed defensively (any malformed cookie is
 *     treated as empty so a corrupted prior session doesn't lock the user
 *     out).
 *   - New entry `{ nonce_hash, show_id, issued_at, signing_key_id }` is
 *     appended at the end of the array.
 *   - Array is then capped at `BOOTSTRAP_COOKIE_ENTRY_LIMIT` (5) entries
 *     by slicing from the tail (`.slice(-LIMIT)`); this evicts the
 *     OLDEST entries, preserving the most-recent.
 *   - Set via `cookies().set(name, value, opts)` with the canonical
 *     `__Host-` attribute set: HttpOnly, Secure, SameSite=Lax, Path=/,
 *     Max-Age=30, NO Domain (the `__Host-` prefix forbids it).
 *
 * Defense-in-depth input validation:
 *   The `showId` parameter is client-controlled (the Bootstrap.tsx island
 *   reads it from a server-rendered prop and echoes it). We MUST validate
 *   the UUID shape before any DB call — a malformed value would otherwise
 *   leak into Postgres as a typed-cast error. We use a literal UUID regex
 *   (NOT imported from `lib/auth/constants`'s `UUID_RE`) because the
 *   `lib/auth/*` surface is §A territory; duplicating the format-only
 *   regex at a single internal callsite is acceptable per the same
 *   precedent set by `app/admin/actions.ts:35`.
 *
 * Error semantics:
 *   The action throws on every failure path (malformed input, DB read
 *   error, DB INSERT error, missing app_settings row). Throws propagate
 *   to the client island as a Promise rejection; `Bootstrap.tsx` renders
 *   the generic inline-error fallback (no raw error code per
 *   AGENTS.md §1.5). We deliberately do NOT pre-catch and translate to a
 *   structured `{ ok: false, code }` shape — the client island never
 *   surfaces the failure code to the user; a single throw → catch
 *   pattern keeps the action minimal and the error path uniform.
 */
"use server";

import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";

import {
  BOOTSTRAP_COOKIE_ENTRY_LIMIT,
  BOOTSTRAP_COOKIE_NAME,
  BOOTSTRAP_NONCE_MAX_AGE_SEC,
} from "@/lib/auth/constants";
import { withShowAdvisoryLock } from "@/lib/db/advisoryLock";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

// Local UUID regex — duplicated from `lib/auth/constants.ts` (UUID_RE)
// because §B (this file's milestone) cannot modify §A's lib/auth surface.
// A single internal callsite of a stable, format-only regex is acceptable
// duplication; see also `app/admin/actions.ts:35`.
//
// Case-sensitive (no /i flag) to match the canonical regex at
// `lib/auth/constants.ts:9`. Postgres normalizes UUIDs to lowercase on
// storage, so legitimate showIds always arrive in lowercase from
// `resolveShowIdFromSlug`. Accepting uppercase hex would be overly
// permissive and would diverge from the canonical auth surface.
// (`app/admin/actions.ts:35` is still /i — that's §A territory and out
// of scope for this milestone; tightening it is tracked separately.)
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type BootstrapCookieEntry = {
  nonce_hash: string;
  show_id: string;
  issued_at: string;
  signing_key_id: string;
};

function parseExistingCookie(
  raw: string | undefined,
): BootstrapCookieEntry[] {
  if (!raw) return [];
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((entry): entry is BootstrapCookieEntry => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return false;
    }
    const e = entry as Record<string, unknown>;
    return (
      typeof e.nonce_hash === "string" &&
      typeof e.show_id === "string" &&
      typeof e.issued_at === "string" &&
      typeof e.signing_key_id === "string"
    );
  });
}

export type BootstrapMintResult = {
  /**
   * The fresh nonce (UUIDv4 — 122 random bits, exceeds the §A schema's
   * 128-bit "cryptographically random" requirement when paired with
   * SHA-256 hashing in the DB row). The client island echoes this value
   * verbatim into the `/api/auth/redeem-link` POST body alongside the
   * JWT extracted from `location.hash`; the redeem-link route hashes
   * SHA-256(nonce) and compares against the stored `nonce_hash` (per
   * `app/api/auth/redeem-link/route.ts:51-53`).
   */
  nonce: string;
};

export async function bootstrapMint(
  showId: string,
): Promise<BootstrapMintResult> {
  // Defense-in-depth UUID validation — caller is client-controlled (the
  // Bootstrap.tsx island echoes a server-rendered prop). Reject anything
  // not UUID-shaped BEFORE entering the lock or hitting the DB.
  if (typeof showId !== "string" || !UUID_RE.test(showId)) {
    throw new Error("bootstrapMint: showId must be a UUID");
  }

  // Round-8 §B finding: 'block' mode (R8 #2) caused DB connection exhaustion
  // — withShowAdvisoryLock allocates one postgres client per call, and a
  // burst of 50+ blocked waiters all held a connection while queued on the
  // same show lock, with no lock_timeout / pool cap. Reverting to 'try'
  // mode (which fails fast on contention without holding a connection) and
  // moving burst-resilience into a CLIENT-SIDE retry/backoff loop in
  // Bootstrap.tsx. Each retry is a fresh request that creates and releases
  // a connection — connections never queue.
  const result = await withShowAdvisoryLock(showId, "try", async () => {
    const supabase = createSupabaseServiceRoleClient();

    // (1) Read active signing key id INSIDE the lock so concurrent
    // §7.2.3 rotation can't slip between this SELECT and the INSERT
    // below. The captured value is then used as the SAME source-of-truth
    // for both (a) the bootstrap_nonces row write and (b) the cookie
    // envelope entry write — guaranteeing the redeem-link route's
    // row-vs-cookie kid comparison succeeds for every legitimate render.
    const { data: appSettings, error: appSettingsError } = await supabase
      .from("app_settings")
      .select("active_signing_key_id")
      .eq("id", "default")
      .single();
    if (
      appSettingsError ||
      !appSettings ||
      typeof appSettings.active_signing_key_id !== "string" ||
      appSettings.active_signing_key_id.length === 0
    ) {
      throw new Error(
        "bootstrapMint: active signing key id unavailable from app_settings",
      );
    }
    const signingKeyId: string = appSettings.active_signing_key_id;

    // (2) Generate the nonce + SHA-256 hash for the row's PK component.
    // UUIDv4 is 122 random bits; combined with the show_id composite-PK
    // partition this exceeds the §A schema's "cryptographically random"
    // requirement and matches the pattern already established by the
    // redeem-link route's session-token mint (`route.ts:234`).
    const nonce = randomUUID();
    const nonceHash = createHash("sha256").update(nonce).digest("hex");

    // (3) INSERT the row at composite PK (nonce_hash, show_id) carrying
    // the captured signing_key_id. The insert is non-conditional — the
    // 122-bit nonce + show_id partition makes a PK collision effectively
    // impossible in any realistic time horizon.
    const insertResult = await supabase.from("bootstrap_nonces").insert({
      nonce_hash: nonceHash,
      show_id: showId,
      signing_key_id: signingKeyId,
    });
    if (insertResult.error) {
      throw new Error(
        `bootstrapMint: bootstrap_nonces insert failed: ${insertResult.error.message}`,
      );
    }

    // (4) Append + cap the cookie array; set the cookie via Next's
    // cookies() API. Server-Action context allows mutation (Server
    // Component render context does not — that's why we route through a
    // Server Action rather than mutating from the page render).
    const cookieStore = await cookies();
    const existing = parseExistingCookie(
      cookieStore.get(BOOTSTRAP_COOKIE_NAME)?.value,
    );
    const newEntry: BootstrapCookieEntry = {
      nonce_hash: nonceHash,
      show_id: showId,
      issued_at: new Date().toISOString(),
      signing_key_id: signingKeyId,
    };
    const updated = [...existing, newEntry].slice(
      -BOOTSTRAP_COOKIE_ENTRY_LIMIT,
    );
    // Next 16's cookies().set(name, value, opts) URL-encodes the value
    // automatically when emitting the Set-Cookie header. We pass the raw
    // JSON string and let Next encode it once — the on-the-wire value
    // matches the §A redeem-link route's `decodeURIComponent(raw)` parse
    // contract (`app/api/auth/redeem-link/route.ts:68`). A second
    // encodeURIComponent here would produce a double-encoded value that
    // the §A parser would decode only once, yielding garbage JSON.
    const cookieValue = JSON.stringify(updated);

    cookieStore.set(BOOTSTRAP_COOKIE_NAME, cookieValue, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: BOOTSTRAP_NONCE_MAX_AGE_SEC,
      // Note: no `domain` — the __Host- prefix forbids it.
    });

    return { nonce } satisfies BootstrapMintResult;
  });

  return result;
}
