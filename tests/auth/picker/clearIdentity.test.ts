import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  COOKIE_NAME,
  decodePickerCookie,
  encodePickerCookie,
} from "@/lib/auth/picker/cookieEnvelope";
import {
  clearIdentity,
  clearIdentityAndSkip,
  clearIdentityCore,
} from "@/lib/auth/picker/clearIdentity";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    const error = new Error("NEXT_REDIRECT") as Error & { digest: string };
    error.digest = `NEXT_REDIRECT;replace;${path};false`;
    throw error;
  },
}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

const logMock = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));
vi.mock("@/lib/log", () => ({ log: logMock }));
// Task 4: the guest path signs the browser out, so the module now constructs a
// Supabase server client. `calls` records ORDER across the cookie write and the
// signOut so a correct-calls/wrong-order implementation still fails — the order
// IS the contract (spec §4.3: picker entry first, so no failure state strands a
// live foreign session beside a stale identity).
const calls: string[] = [];
const supabaseMock = vi.hoisted(() => ({
  signOut: vi.fn(),
  createClient: vi.fn(),
  throwOnCreate: false,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    if (supabaseMock.throwOnCreate) throw new Error("SUPABASE_URL unset");
    supabaseMock.createClient();
    return { auth: { signOut: supabaseMock.signOut } };
  },
}));

const KEY = "0".repeat(64);
const SHOW_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_SHOW_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CREW_ID = "22222222-2222-2222-2222-222222222222";
const OTHER_CREW_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const SLUG = "show-one";
const TOKEN = "a".repeat(64);

const cookieSet = vi.fn();
let existingCookie: string | undefined;

function fd(input: Partial<{ slug: string; shareToken: string; showId: string }> = {}) {
  const form = new FormData();
  if (input.slug !== undefined) form.set("slug", input.slug);
  if (input.shareToken !== undefined) form.set("shareToken", input.shareToken);
  if (input.showId !== undefined) form.set("showId", input.showId);
  return form;
}

beforeEach(() => {
  process.env.PICKER_COOKIE_SIGNING_KEY = KEY;
  existingCookie = undefined;
  cookieSet.mockReset();
  cookieSet.mockImplementation(() => {
    calls.push("cookieSet");
  });
  calls.length = 0;
  supabaseMock.signOut.mockReset();
  supabaseMock.signOut.mockImplementation(async () => {
    calls.push("signOut");
    // Distinct from "signOut": lets a test prove revocation COMPLETED rather
    // than merely having been entered.
    calls.push("signOutResolved");
    return { error: null };
  });
  supabaseMock.createClient.mockReset();
  supabaseMock.throwOnCreate = false;
  logMock.info.mockClear();
  logMock.error.mockClear();
  vi.mocked(revalidatePath).mockReset();
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) =>
      name === COOKIE_NAME && existingCookie ? { name, value: existingCookie } : undefined,
    // getAll feeds the guest path's Supabase-auth-cookie sweep. Includes a
    // chunked shard, a code-verifier, and an unrelated cookie so the matcher is
    // exercised in both directions.
    getAll: () => [
      { name: "sb-test-auth-token", value: "a" },
      { name: "sb-test-auth-token.0", value: "b" },
      { name: "sb-test-auth-token-code-verifier", value: "c" },
      { name: "unrelated-cookie", value: "d" },
      ...(existingCookie ? [{ name: COOKIE_NAME, value: existingCookie }] : []),
    ],
    set: cookieSet,
  } as never);
});

describe("clearIdentity", () => {
  test("removes the show entry while preserving other shows", async () => {
    existingCookie = encodePickerCookie(
      {
        v: 1,
        selections: {
          [SHOW_ID]: { id: CREW_ID, e: 1, t: 100 },
          [OTHER_SHOW_ID]: { id: OTHER_CREW_ID, e: 2, t: 200 },
        },
      },
      KEY,
    );

    await expect(
      clearIdentityCore({ slug: SLUG, shareToken: TOKEN, showId: SHOW_ID }),
    ).resolves.toEqual({
      ok: true,
    });

    const encoded = cookieSet.mock.calls[0]![1] as string;
    const decoded = decodePickerCookie(encoded, KEY);
    expect(decoded?.selections[SHOW_ID]).toBeUndefined();
    expect(decoded?.selections[OTHER_SHOW_ID]).toEqual({ id: OTHER_CREW_ID, e: 2, t: 200 });
    expect(revalidatePath).toHaveBeenCalledWith(`/show/${SLUG}/${TOKEN}`);
  });

  test("clears cookie when the envelope becomes empty", async () => {
    existingCookie = encodePickerCookie(
      { v: 1, selections: { [SHOW_ID]: { id: CREW_ID, e: 1, t: 100 } } },
      KEY,
    );

    await expect(
      clearIdentityCore({ slug: SLUG, shareToken: TOKEN, showId: SHOW_ID }),
    ).resolves.toEqual({
      ok: true,
    });

    expect(cookieSet).toHaveBeenCalledWith(
      COOKIE_NAME,
      "",
      expect.objectContaining({ httpOnly: true, maxAge: 0, sameSite: "lax", secure: true }),
    );
  });

  test("validates FormData fields", async () => {
    await expect(clearIdentity(fd({ slug: SLUG }))).resolves.toEqual({
      ok: false,
      code: "PICKER_INVALID_INPUT",
    });
    await expect(
      clearIdentityCore({ slug: SLUG, shareToken: TOKEN, showId: "not-uuid" }),
    ).resolves.toEqual({
      ok: false,
      code: "PICKER_INVALID_INPUT",
    });
  });

  test("clearIdentityAndSkip clears then redirects to gate skip", async () => {
    existingCookie = encodePickerCookie(
      { v: 1, selections: { [SHOW_ID]: { id: CREW_ID, e: 1, t: 100 } } },
      KEY,
    );

    await expect(
      clearIdentityAndSkip(fd({ slug: SLUG, shareToken: TOKEN, showId: SHOW_ID })),
    ).rejects.toMatchObject({
      digest: expect.stringContaining(`/show/${SLUG}/${TOKEN}?gate=skip`),
    });
    expect(cookieSet).toHaveBeenCalled();
  });
});

describe("clearIdentity telemetry — PICKER_IDENTITY_CLEARED", () => {
  test("emits when an existing entry is cleared", async () => {
    existingCookie = encodePickerCookie(
      { v: 1, selections: { [SHOW_ID]: { id: CREW_ID, e: 1, t: 100 } } },
      KEY,
    );
    await clearIdentityCore({ slug: SLUG, shareToken: TOKEN, showId: SHOW_ID });
    expect(logMock.info).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        code: "PICKER_IDENTITY_CLEARED",
        source: "auth.picker.clearIdentity",
        showId: SHOW_ID,
      }),
    );
  });

  test("does NOT emit when there is no picker cookie (nothing to clear)", async () => {
    existingCookie = undefined;
    await clearIdentityCore({ slug: SLUG, shareToken: TOKEN, showId: SHOW_ID });
    expect(logMock.info).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ code: "PICKER_IDENTITY_CLEARED" }),
    );
  });

  test("does NOT emit when the cookie has no entry for this show (no-op)", async () => {
    existingCookie = encodePickerCookie(
      { v: 1, selections: { [OTHER_SHOW_ID]: { id: OTHER_CREW_ID, e: 2, t: 200 } } },
      KEY,
    );
    await clearIdentityCore({ slug: SLUG, shareToken: TOKEN, showId: SHOW_ID });
    expect(logMock.info).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ code: "PICKER_IDENTITY_CLEARED" }),
    );
  });

  test("does NOT emit on invalid input", async () => {
    await clearIdentityCore({ slug: "", shareToken: TOKEN, showId: SHOW_ID });
    expect(logMock.info).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ code: "PICKER_IDENTITY_CLEARED" }),
    );
  });

  test("does NOT emit when clearIdentityCore catches a thrown fault (spec §5 *Core throw path)", async () => {
    existingCookie = encodePickerCookie(
      { v: 1, selections: { [SHOW_ID]: { id: CREW_ID, e: 1, t: 100 } } },
      KEY,
    );
    // `await cookies()` (no inner try) → propagates to the clearIdentityCore catch;
    // the emit (after the cookie rewrite) is never reached.
    vi.mocked(cookies).mockRejectedValueOnce(new Error("cookie store down"));
    await expect(
      clearIdentityCore({ slug: SLUG, shareToken: TOKEN, showId: SHOW_ID }),
    ).resolves.toEqual({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
    expect(logMock.info).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ code: "PICKER_IDENTITY_CLEARED" }),
    );
  });
});

describe("clearIdentityAndSkip — guest sign-out (spec §4.3)", () => {
  const fdFull = () => fd({ slug: SLUG, shareToken: TOKEN, showId: SHOW_ID });
  const seedEntry = () => {
    existingCookie = encodePickerCookie(
      { v: 1, selections: { [SHOW_ID]: { id: CREW_ID, e: 1, t: 100 } } },
      KEY,
    );
  };
  /** The action redirects by throwing a NEXT_REDIRECT digest (see the mock). */
  const runExpectingRedirect = async (): Promise<string> => {
    try {
      await clearIdentityAndSkip(fdFull());
    } catch (err) {
      const digest = (err as { digest?: string }).digest ?? "";
      expect(digest.startsWith("NEXT_REDIRECT")).toBe(true);
      return digest;
    }
    throw new Error("expected a NEXT_REDIRECT, none thrown");
  };

  test("clears the picker entry BEFORE signing out, then redirects to ?gate=skip", async () => {
    seedEntry();
    const digest = await runExpectingRedirect();
    expect(digest).toContain("gate=skip");
    // The ordering assertion, not merely "both were called".
    expect(calls.indexOf("cookieSet")).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf("signOut")).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf("cookieSet")).toBeLessThan(calls.indexOf("signOut"));
  });

  test("signs out device-locally, never globally", async () => {
    seedEntry();
    await runExpectingRedirect();
    // The library default is { scope: 'global' }, which would revoke a
    // colleague's sessions on EVERY device they own. A guest tapping a button on
    // a shared iPad must not do that.
    expect(supabaseMock.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  test("clears each Supabase auth cookie and leaves the picker cookie to the core", async () => {
    seedEntry();
    await runExpectingRedirect();
    const cleared = cookieSet.mock.calls
      .filter((c) => (c[2] as { maxAge?: number } | undefined)?.maxAge === 0)
      .map((c) => c[0] as string);
    expect(cleared).toContain("sb-test-auth-token");
    expect(cleared).toContain("sb-test-auth-token.0");
    expect(cleared).toContain("sb-test-auth-token-code-verifier");
    // The sweep must not eat the envelope; only clearIdentityCore touches it,
    // and only for THIS show — other shows' entries survive.
    expect(cleared).not.toContain("unrelated-cookie");
  });

  test.each([
    ["malformed slug", { slug: "Bad Slug", shareToken: TOKEN, showId: SHOW_ID }],
    ["malformed share token", { slug: SLUG, shareToken: "nothex", showId: SHOW_ID }],
    ["malformed show id", { slug: SLUG, shareToken: TOKEN, showId: "not-a-uuid" }],
  ])("%s returns PICKER_INVALID_INPUT with nothing mutated", async (_label, input) => {
    seedEntry();
    await expect(clearIdentityAndSkip(fd(input))).resolves.toEqual({
      ok: false,
      code: "PICKER_INVALID_INPUT",
    });
    // Validation runs BEFORE anything destructive: a malformed direct submission
    // must not sign the person out and only then report the error.
    expect(supabaseMock.createClient).not.toHaveBeenCalled();
    expect(supabaseMock.signOut).not.toHaveBeenCalled();
    expect(cookieSet).not.toHaveBeenCalled();
  });

  test("a clearIdentityCore failure BEFORE any write returns before any sign-out", async () => {
    seedEntry();
    vi.mocked(cookies).mockRejectedValueOnce(new Error("cookie store down"));
    await expect(clearIdentityAndSkip(fdFull())).resolves.toEqual({
      ok: false,
      code: "PICKER_RESOLVER_LOOKUP_FAILED",
    });
    expect(supabaseMock.signOut).not.toHaveBeenCalled();
    expect(cookieSet).not.toHaveBeenCalled();
  });

  test("a clearIdentityCore failure AFTER the deletion is staged still skips sign-out", async () => {
    seedEntry();
    // The partial-mutation state spec §4.3's matrix documents: the cookie write
    // precedes revalidatePath and the emit, so a throw after it is caught and
    // returned as { ok: false } with the deletion ALREADY staged. Injecting at
    // the initial cookies() read (the test above) never reaches this state, so
    // wrong sign-out behavior here would have stayed green.
    vi.mocked(revalidatePath).mockImplementationOnce(() => {
      throw new Error("revalidate failed after the cookie write");
    });
    await expect(clearIdentityAndSkip(fdFull())).resolves.toEqual({
      ok: false,
      code: "PICKER_RESOLVER_LOOKUP_FAILED",
    });
    // Deletion staged...
    expect(cookieSet).toHaveBeenCalled();
    // ...and the session deliberately left alone: the picker entry is gone, so
    // the person lands back on Mode B with nothing exposed and can retry.
    expect(supabaseMock.signOut).not.toHaveBeenCalled();
  });

  test.each([
    [
      "signOut returns an error",
      () => {
        supabaseMock.signOut.mockResolvedValueOnce({ error: { message: "gateway" } });
      },
    ],
    [
      "the client constructor throws",
      () => {
        supabaseMock.throwOnCreate = true;
      },
    ],
    [
      "signOut throws rather than returning an error",
      () => {
        supabaseMock.signOut.mockImplementationOnce(async () => {
          calls.push("signOut");
          throw new Error("network down");
        });
      },
    ],
    [
      "the residual-cookie sweep throws AFTER signOut succeeded",
      () => {
        // Injected on the sweep itself, not on signOut: the previous version of
        // this case made signOut throw and so proved nothing about the sweep.
        // Moving the sweep outside the catch would now fail here.
        cookieSet.mockImplementation((name: string) => {
          calls.push("cookieSet");
          if (name.startsWith("sb-")) throw new Error("cookie write forbidden");
        });
      },
    ],
  ])(
    "%s → catalogued failure code, AUTH_SIGNOUT_FAILED emitted, and NO redirect",
    async (_label, arrange) => {
      seedEntry();
      arrange();
      // No NEXT_REDIRECT: redirecting on failure would loop the person back to
      // the Mode B gate with state half-applied.
      //
      // The code split is deliberate. The RESULT carries a catalogued code,
      // because a `code:` literal in a returned object is scanned as a §12.4
      // user-facing producer (lib/messages/__internal__/codeProducers.ts) and
      // AUTH_SIGNOUT_FAILED is forensic-only, with no catalog row. The forensic
      // code rides the telemetry emit, where the scan strips it.
      await expect(clearIdentityAndSkip(fdFull())).resolves.toEqual({
        ok: false,
        code: "PICKER_RESOLVER_LOOKUP_FAILED",
      });
      expect(logMock.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ code: "AUTH_SIGNOUT_FAILED" }),
      );
    },
  );

  test("a sweep failure is reported AFTER revocation completed, and named as such", async () => {
    seedEntry();
    cookieSet.mockImplementation((name: string) => {
      calls.push("cookieSet");
      if (name.startsWith("sb-")) throw new Error("cookie write forbidden");
    });
    await expect(clearIdentityAndSkip(fdFull())).resolves.toEqual({
      ok: false,
      code: "PICKER_RESOLVER_LOOKUP_FAILED",
    });
    // Ordering: revocation RESOLVED before the sweep threw. Without this, a
    // version that swept BEFORE signing out would satisfy every other assertion
    // while the test name and spec §4.3's matrix both claim revocation first.
    expect(calls).toContain("signOutResolved");
    expect(calls.indexOf("signOutResolved")).toBeLessThan(calls.lastIndexOf("cookieSet"));
    // The three sign-out boundaries stay discriminable in telemetry (invariant 9):
    // this residual state is "already revoked, cookie may linger", materially
    // different from a revocation that never landed.
    expect(logMock.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        code: "AUTH_SIGNOUT_FAILED",
        stage: "residual_cookie_sweep",
      }),
    );
  });

  test.each([
    ["client_construction", () => void (supabaseMock.throwOnCreate = true)],
    [
      "sign_out",
      () => {
        supabaseMock.signOut.mockResolvedValueOnce({ error: { message: "gateway" } });
      },
    ],
  ])("the %s boundary is named in its own emit", async (stage, arrange) => {
    seedEntry();
    arrange();
    await clearIdentityAndSkip(fdFull());
    expect(logMock.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ code: "AUTH_SIGNOUT_FAILED", stage }),
    );
  });

  test("clearIdentity (non-skip) never constructs a Supabase client", async () => {
    seedEntry();
    // The identity chip's "not me" control (components/auth/IdentityChip.tsx)
    // calls this on the viewer's OWN device; it must not destroy a session.
    await expect(clearIdentity(fdFull())).resolves.toEqual({ ok: true });
    expect(supabaseMock.createClient).not.toHaveBeenCalled();
    expect(supabaseMock.signOut).not.toHaveBeenCalled();
  });
});
