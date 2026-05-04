/**
 * tests/admin/bootstrapMint.test.ts (M5 §B Task 5.5 — Opus's portion)
 *
 * Unit-test harness for `bootstrapMint`, the Server Action that
 * `app/show/[slug]/p/Bootstrap.tsx` invokes from its `useEffect` to:
 *   1. Run inside `withShowAdvisoryLock(showId, 'try', ...)` — round-8
 *      §B reverted R8 #2's switch to 'block' because blocking-mode held
 *      a DB connection per waiter (no lock_timeout / pool cap, burst-load
 *      caused connection exhaustion). Burst-resilience moved to
 *      client-side retry/backoff in Bootstrap.tsx.
 *   2. Read `app_settings.active_signing_key_id` INSIDE the lock so a
 *      concurrent §7.2.3 rotation can't slip between the read and the
 *      INSERT (the read-with-INSERT atomicity invariant from plan §199).
 *   3. INSERT a `bootstrap_nonces` row at composite PK `(nonce_hash, show_id)`
 *      pinned to the captured signing_key_id.
 *   4. APPEND a `{ nonce_hash, show_id, issued_at, signing_key_id }` entry
 *      to the `__Host-fxav_bootstrap_v` cookie array (cap 5; evict oldest).
 *   5. Set the cookie via `cookies().set(...)` with the canonical `__Host-`
 *      attribute set (HttpOnly, Secure, SameSite=Lax, Path=/, Max-Age=30,
 *      no Domain).
 *   6. Return `{ nonce }` so the client island can echo it (alongside the
 *      JWT extracted from `location.hash`) into the redeem-link POST body.
 *
 * Mock surface:
 *   - `next/headers` cookies() — get/set/getAll a programmable cookie store.
 *   - `@/lib/supabase/server` createSupabaseServiceRoleClient — the
 *     Supabase builder mocks `.from('app_settings').select(...).eq(...)
 *     .single()` (returns `{ data: { active_signing_key_id } }`) and
 *     `.from('bootstrap_nonces').insert(...)` (records the row).
 *   - `@/lib/db/advisoryLock` withShowAdvisoryLock — spied so we can
 *     assert the action ran inside it with mode 'try'.
 *
 * Anti-tautology discipline:
 *   - Cookie-name assertion compares against the literal
 *     `__Host-fxav_bootstrap_v` (NOT `BOOTSTRAP_COOKIE_NAME` re-import) so
 *     a bug that renamed the constant would slip past a same-name check.
 *   - Cap test seeds 5 entries; assertion is "exactly 5 after the 6th
 *     insert AND the oldest entry's nonce_hash is gone" (proves eviction,
 *     not "length stays at 5 by accident").
 *   - Rotation test seeds the mock to return 'k1' on the first call and
 *     'k2' on the second; row writes + cookie entries assert the captured
 *     value flows from the read (proves atomicity).
 *   - Defensive: malformed showId triggers no DB call AND no cookie
 *     mutation AND throws (caller is client-controlled — input validation
 *     at the action surface is mandatory).
 *
 * Cookie name consistency: the literal `__Host-fxav_bootstrap_v` is hardcoded
 * in `lib/auth/constants.ts:2` and must remain the single source of truth.
 * All assertions in this file use the literal string for anti-tautology.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const COOKIE_NAME_LITERAL = "__Host-fxav_bootstrap_v";
const VALID_SHOW_ID = "11111111-2222-3333-4444-555555555555";
const SECOND_SHOW_ID = "22222222-3333-4444-5555-666666666666";

// Hoisted shared mock state. Each test mutates these to drive specific
// scenarios (rotation between calls, existing cookie array contents, DB
// errors, etc).
const mockState = vi.hoisted(() => ({
  // Sequence of values returned by successive `app_settings.select(...).single()`
  // calls. Tests push values; the mock pops them in order.
  signingKeyIdSequence: [] as string[],
  // Captured `bootstrap_nonces.insert(...)` payloads (one per call).
  insertedNonces: [] as Array<{
    nonce_hash: string;
    show_id: string;
    signing_key_id: string;
  }>,
  // Failure mode toggles — when set, the next insert returns this error.
  insertError: null as null | { message: string },
  // R12 #3: defense-in-depth published-show gate inside bootstrapMint.
  // Default true; tests that exercise the unpublished-show rejection
  // path flip this to false.
  showPublished: true as boolean,
  showLookupError: null as null | { message: string },
  // Programmable cookie store. Tests pre-seed entries to exercise cap +
  // append behavior.
  cookieJar: new Map<
    string,
    {
      value: string;
      options?: {
        httpOnly?: boolean;
        secure?: boolean;
        sameSite?: "lax" | "strict" | "none";
        path?: string;
        maxAge?: number;
        domain?: string;
      };
    }
  >(),
  // Spies for set/withShowAdvisoryLock observation.
  setSpy: vi.fn(),
  withLockSpy: vi.fn(),
}));

// Mock encoding contract — mirrors Next 16's wire behavior:
//   - cookies().set(name, value, opts) URL-encodes the raw value when
//     emitting Set-Cookie. The browser stores the encoded form and sends
//     it back on subsequent requests; cookies().get(name).value then
//     returns the URL-encoded string. Production code (parseExistingCookie
//     in actions.ts and the §A redeem-link route) decodes once on read.
//   - This mock therefore: (a) URL-encodes on .set() before storing,
//     (b) returns the encoded value as-is on .get(). The
//     `readCookieArray` helper below decodes once on read, mirroring the
//     production read path. Seed values written directly into cookieJar
//     in tests must therefore be PRE-ENCODED (URL-encoded JSON) — the
//     "existing cookie array with 5 entries" test does this.
//   - This contract catches a re-introduced double-encode regression in
//     `actions.ts` (passing `encodeURIComponent(JSON.stringify(...))`
//     would produce a doubly-encoded value that decodes to garbage).
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get(name: string) {
      const entry = mockState.cookieJar.get(name);
      if (!entry) return undefined;
      return { name, value: entry.value };
    },
    set(name: string, value: string, options?: Record<string, unknown>) {
      mockState.setSpy(name, value, options);
      // Simulate Next 16's auto-encoding on the wire.
      mockState.cookieJar.set(name, {
        value: encodeURIComponent(value),
        options: options as never,
      });
    },
    getAll() {
      return Array.from(mockState.cookieJar.entries()).map(([name, e]) => ({
        name,
        value: e.value,
      }));
    },
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => {
    const builder = (table: string) => {
      if (table === "app_settings") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => {
                const next = mockState.signingKeyIdSequence.shift();
                if (next === undefined) {
                  return {
                    data: null,
                    error: { message: "no more signing key id values seeded" },
                  };
                }
                return { data: { active_signing_key_id: next }, error: null };
              },
            }),
          }),
        };
      }
      if (table === "shows") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => {
                if (mockState.showLookupError) {
                  return { data: null, error: mockState.showLookupError };
                }
                return {
                  data: { published: mockState.showPublished },
                  error: null,
                };
              },
            }),
          }),
        };
      }
      if (table === "bootstrap_nonces") {
        return {
          insert: async (row: {
            nonce_hash: string;
            show_id: string;
            signing_key_id: string;
          }) => {
            if (mockState.insertError) {
              return { error: mockState.insertError, data: null };
            }
            mockState.insertedNonces.push({
              nonce_hash: row.nonce_hash,
              show_id: row.show_id,
              signing_key_id: row.signing_key_id,
            });
            return { error: null, data: null };
          },
        };
      }
      throw new Error(`unexpected from(${table})`);
    };
    return { from: builder };
  },
  // Not used by bootstrapMint, but the action's module imports may pull this
  // path; provide a stub so vi.mock fully shadows the real module.
  createSupabaseServerClient: async () => {
    throw new Error("not used in bootstrapMint");
  },
}));

vi.mock("@/lib/db/advisoryLock", () => ({
  withShowAdvisoryLock: async <T,>(
    showId: string,
    mode: "try" | "block",
    fn: () => T | Promise<T>,
  ): Promise<T> => {
    mockState.withLockSpy(showId, mode);
    return await fn();
  },
}));

// Import AFTER mocks so the action's module-level imports resolve to them.
import { bootstrapMint } from "@/app/show/[slug]/p/actions";

function resetState() {
  mockState.signingKeyIdSequence = [];
  mockState.insertedNonces = [];
  mockState.insertError = null;
  mockState.showPublished = true;
  mockState.showLookupError = null;
  mockState.cookieJar.clear();
  mockState.setSpy.mockClear();
  mockState.withLockSpy.mockClear();
}

function readCookieArray(): Array<{
  nonce_hash: string;
  show_id: string;
  issued_at: string;
  signing_key_id: string;
}> {
  const entry = mockState.cookieJar.get(COOKIE_NAME_LITERAL);
  if (!entry) return [];
  const decoded = decodeURIComponent(entry.value);
  return JSON.parse(decoded) as Array<{
    nonce_hash: string;
    show_id: string;
    issued_at: string;
    signing_key_id: string;
  }>;
}

async function sha256Hex(input: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(input).digest("hex");
}

describe("bootstrapMint", () => {
  beforeEach(() => {
    resetState();
  });

  afterEach(() => {
    resetState();
  });

  test("happy path: returns nonce; writes one row; appends one cookie entry; sets cookie with __Host- attributes", async () => {
    mockState.signingKeyIdSequence.push("k1");

    const result = await bootstrapMint(VALID_SHOW_ID);

    expect(typeof result.nonce).toBe("string");
    expect(result.nonce.length).toBeGreaterThan(0);

    // Advisory lock contract: held in 'try' mode for this showId.
    // R8 #2 briefly switched this to 'block' for burst-load resilience,
    // but round-8 §B caught that 'block' mode causes DB connection
    // exhaustion (each waiter holds a connection while queued, no
    // lock_timeout). Reverted to 'try' in R9 #2; burst-resilience moved
    // to client-side retry/backoff in Bootstrap.tsx.
    expect(mockState.withLockSpy).toHaveBeenCalledTimes(1);
    expect(mockState.withLockSpy).toHaveBeenCalledWith(VALID_SHOW_ID, "try");

    // Exactly one row inserted; signing_key_id matches what we seeded.
    expect(mockState.insertedNonces).toHaveLength(1);
    const row = mockState.insertedNonces[0]!;
    expect(row.show_id).toBe(VALID_SHOW_ID);
    expect(row.signing_key_id).toBe("k1");
    expect(row.nonce_hash).toBe(await sha256Hex(result.nonce));

    // Cookie array has exactly one entry; entry shape is correct.
    const arr = readCookieArray();
    expect(arr).toHaveLength(1);
    expect(arr[0]!.nonce_hash).toBe(row.nonce_hash);
    expect(arr[0]!.show_id).toBe(VALID_SHOW_ID);
    expect(arr[0]!.signing_key_id).toBe("k1");
    expect(typeof arr[0]!.issued_at).toBe("string");
    expect(new Date(arr[0]!.issued_at).toString()).not.toBe("Invalid Date");

    // Cookie attributes — anti-tautology: literal cookie name AND every
    // canonical __Host- attribute.
    expect(mockState.setSpy).toHaveBeenCalledTimes(1);
    const [name, _value, opts] = mockState.setSpy.mock.calls[0]! as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(name).toBe(COOKIE_NAME_LITERAL);
    expect(opts.httpOnly).toBe(true);
    expect(opts.secure).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.path).toBe("/");
    expect(opts.maxAge).toBe(30);
    // no Domain — the __Host- prefix forbids it.
    expect(opts.domain).toBeUndefined();
  });

  test("two quick mints on same show → two distinct nonces in cookie array; row signing_key_ids match captured values", async () => {
    mockState.signingKeyIdSequence.push("k1", "k1");

    const a = await bootstrapMint(VALID_SHOW_ID);
    const b = await bootstrapMint(VALID_SHOW_ID);

    expect(a.nonce).not.toBe(b.nonce);
    expect(mockState.insertedNonces).toHaveLength(2);
    expect(mockState.insertedNonces[0]!.signing_key_id).toBe("k1");
    expect(mockState.insertedNonces[1]!.signing_key_id).toBe("k1");

    const arr = readCookieArray();
    expect(arr).toHaveLength(2);
    expect(arr[0]!.nonce_hash).toBe(await sha256Hex(a.nonce));
    expect(arr[1]!.nonce_hash).toBe(await sha256Hex(b.nonce));
  });

  test("cross-show: mints on showA then showB → two entries, one per show; both kept under cap", async () => {
    mockState.signingKeyIdSequence.push("k1", "k1");

    const a = await bootstrapMint(VALID_SHOW_ID);
    const b = await bootstrapMint(SECOND_SHOW_ID);

    expect(mockState.insertedNonces).toHaveLength(2);
    expect(mockState.insertedNonces[0]!.show_id).toBe(VALID_SHOW_ID);
    expect(mockState.insertedNonces[1]!.show_id).toBe(SECOND_SHOW_ID);

    const arr = readCookieArray();
    expect(arr).toHaveLength(2);
    expect(arr[0]!.show_id).toBe(VALID_SHOW_ID);
    expect(arr[0]!.nonce_hash).toBe(await sha256Hex(a.nonce));
    expect(arr[1]!.show_id).toBe(SECOND_SHOW_ID);
    expect(arr[1]!.nonce_hash).toBe(await sha256Hex(b.nonce));
  });

  test("5-entry cap honored: 6 mints → cookie has exactly 5 entries; oldest is evicted", async () => {
    mockState.signingKeyIdSequence.push("k1", "k1", "k1", "k1", "k1", "k1");

    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(await bootstrapMint(VALID_SHOW_ID));
    }

    const arr = readCookieArray();
    expect(arr).toHaveLength(5);

    // The oldest (results[0]) should be evicted; the remaining five should
    // be results[1..5] in order.
    const oldestHash = await sha256Hex(results[0]!.nonce);
    expect(arr.find((e) => e.nonce_hash === oldestHash)).toBeUndefined();

    for (let i = 1; i < 6; i++) {
      const expectedHash = await sha256Hex(results[i]!.nonce);
      expect(arr[i - 1]!.nonce_hash).toBe(expectedHash);
    }

    // All 6 rows still INSERTed at the DB layer (eviction is cookie-only).
    expect(mockState.insertedNonces).toHaveLength(6);
  });

  test("rotation between mints: first row + cookie entry pinned to k1; second row + cookie entry to k2; first cookie entry stays k1 (immutable in flight)", async () => {
    mockState.signingKeyIdSequence.push("k1", "k2");

    const a = await bootstrapMint(VALID_SHOW_ID);
    const b = await bootstrapMint(VALID_SHOW_ID);

    // Row state: each row carries the kid captured at its INSERT time.
    expect(mockState.insertedNonces).toHaveLength(2);
    const rowA = mockState.insertedNonces.find(
      async (r) => r.nonce_hash === (await sha256Hex(a.nonce)),
    )!;
    const rowB = mockState.insertedNonces.find(
      async (r) => r.nonce_hash === (await sha256Hex(b.nonce)),
    )!;
    expect(mockState.insertedNonces[0]!.signing_key_id).toBe("k1");
    expect(mockState.insertedNonces[1]!.signing_key_id).toBe("k2");
    void rowA;
    void rowB;

    const arr = readCookieArray();
    expect(arr).toHaveLength(2);
    expect(arr[0]!.signing_key_id).toBe("k1");
    expect(arr[1]!.signing_key_id).toBe("k2");
  });

  test("cookie entry's signing_key_id === row's signing_key_id === captured-from-app_settings value (read-with-INSERT atomicity)", async () => {
    mockState.signingKeyIdSequence.push("k7");

    const r = await bootstrapMint(VALID_SHOW_ID);

    const row = mockState.insertedNonces[0]!;
    const arr = readCookieArray();
    const entry = arr[0]!;

    expect(row.signing_key_id).toBe("k7");
    expect(entry.signing_key_id).toBe("k7");
    expect(row.signing_key_id).toBe(entry.signing_key_id);
    expect(entry.nonce_hash).toBe(await sha256Hex(r.nonce));
  });

  test("malformed showId (not a UUID) → throws; no DB call; no cookie mutation", async () => {
    mockState.signingKeyIdSequence.push("k1"); // would be consumed if we got that far

    await expect(bootstrapMint("not-a-uuid")).rejects.toThrow();

    // Should never have entered the lock — input validation precedes the lock.
    expect(mockState.withLockSpy).not.toHaveBeenCalled();
    expect(mockState.insertedNonces).toHaveLength(0);
    expect(mockState.setSpy).not.toHaveBeenCalled();
  });

  test("malformed showId (empty string) → throws; no DB call", async () => {
    await expect(bootstrapMint("")).rejects.toThrow();
    expect(mockState.withLockSpy).not.toHaveBeenCalled();
    expect(mockState.insertedNonces).toHaveLength(0);
  });

  test("malformed showId (SQL-injection shape) → throws; no DB call", async () => {
    await expect(
      bootstrapMint("'; DROP TABLE bootstrap_nonces; --"),
    ).rejects.toThrow();
    expect(mockState.withLockSpy).not.toHaveBeenCalled();
    expect(mockState.insertedNonces).toHaveLength(0);
  });

  test("malformed showId (uppercase hex) → throws; no DB call (UUID_RE is case-sensitive, matching `lib/auth/constants.ts:9`)", async () => {
    // Postgres normalizes UUIDs to lowercase on storage, so legitimate
    // showIds always arrive lowercase from `resolveShowIdFromSlug`.
    // Uppercase hex must be rejected (case-sensitive match per the
    // canonical regex at lib/auth/constants.ts:9).
    mockState.signingKeyIdSequence.push("k1"); // would be consumed if /i slipped back in
    await expect(
      bootstrapMint("11111111-AAAA-1111-1111-111111111111"),
    ).rejects.toThrow();
    expect(mockState.withLockSpy).not.toHaveBeenCalled();
    expect(mockState.insertedNonces).toHaveLength(0);
    expect(mockState.setSpy).not.toHaveBeenCalled();
  });

  test("DB insert error → throws; cookie not written", async () => {
    mockState.signingKeyIdSequence.push("k1");
    mockState.insertError = { message: "rls denied" };

    await expect(bootstrapMint(VALID_SHOW_ID)).rejects.toThrow();

    // The lock was entered (input validation passed), but the cookie write
    // happens only after the row INSERT succeeds. So no cookie mutation.
    expect(mockState.withLockSpy).toHaveBeenCalledTimes(1);
    expect(mockState.setSpy).not.toHaveBeenCalled();
  });

  test("missing app_settings row → throws; no INSERT; no cookie", async () => {
    // Don't push any signing key id; the mock will return an error.
    await expect(bootstrapMint(VALID_SHOW_ID)).rejects.toThrow();
    expect(mockState.insertedNonces).toHaveLength(0);
    expect(mockState.setSpy).not.toHaveBeenCalled();
  });

  test("existing cookie array with 5 entries: 6th mint evicts oldest entry only (cookie-side cap)", async () => {
    // Pre-seed cookie with 5 existing entries (simulating a prior page render).
    // Direct cookieJar.set bypasses the mocked cookies().set, so this seed
    // must be PRE-ENCODED (URL-encoded) to match the wire-format contract
    // documented above (the cookieJar stores wire-format values; reads
    // decode once via decodeURIComponent).
    const prefilled = Array.from({ length: 5 }).map((_, i) => ({
      nonce_hash: `existing-hash-${i}`,
      show_id: VALID_SHOW_ID,
      issued_at: new Date(Date.now() - (5 - i) * 1000).toISOString(),
      signing_key_id: "k1",
    }));
    mockState.cookieJar.set(COOKIE_NAME_LITERAL, {
      value: encodeURIComponent(JSON.stringify(prefilled)),
    });
    mockState.signingKeyIdSequence.push("k1");

    const r = await bootstrapMint(VALID_SHOW_ID);

    const arr = readCookieArray();
    expect(arr).toHaveLength(5);
    // Oldest (existing-hash-0) is evicted; latest is the freshly minted one.
    expect(arr.find((e) => e.nonce_hash === "existing-hash-0")).toBeUndefined();
    expect(arr[arr.length - 1]!.nonce_hash).toBe(await sha256Hex(r.nonce));
  });

  test("existing malformed cookie → treated as empty; new entry is the only one written", async () => {
    mockState.cookieJar.set(COOKIE_NAME_LITERAL, {
      value: "not-valid-json-or-encoded",
    });
    mockState.signingKeyIdSequence.push("k1");

    const r = await bootstrapMint(VALID_SHOW_ID);

    const arr = readCookieArray();
    expect(arr).toHaveLength(1);
    expect(arr[0]!.nonce_hash).toBe(await sha256Hex(r.nonce));
  });

  test("R12 #3: refuses unpublished shows; no row inserted; no cookie set", async () => {
    // Round-11 §B HIGH: bootstrapMint had no defense-in-depth check
    // for shows.published. The page-level gate at /show/[slug]/p
    // (R11 #2) stops normal flow, but Server Actions have their own
    // dispatch path; a direct caller could still mint a nonce and
    // cookie entry against an unpublished show. Now bootstrapMint
    // looks up shows.published inside the lock and throws if not
    // published — no DB row, no cookie mutation, no signing-key read.
    mockState.showPublished = false;
    mockState.signingKeyIdSequence.push("k1");

    await expect(bootstrapMint(VALID_SHOW_ID)).rejects.toThrow(
      /show not available/,
    );

    expect(mockState.insertedNonces).toEqual([]);
    expect(mockState.setSpy).not.toHaveBeenCalled();
    // Signing-key sequence unconsumed — the published gate ran before
    // the app_settings read.
    expect(mockState.signingKeyIdSequence).toEqual(["k1"]);
  });

  test("R12 #3: shows.published lookup error throws before any mutation", async () => {
    mockState.showLookupError = { message: "fake DB outage" };
    mockState.signingKeyIdSequence.push("k1");

    await expect(bootstrapMint(VALID_SHOW_ID)).rejects.toThrow(
      /shows\.published lookup failed/,
    );

    expect(mockState.insertedNonces).toEqual([]);
    expect(mockState.setSpy).not.toHaveBeenCalled();
  });
});
