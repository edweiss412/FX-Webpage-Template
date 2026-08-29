import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  COOKIE_NAME,
  decodePickerCookie,
  encodePickerCookie,
} from "@/lib/auth/picker/cookieEnvelope";
import { selectIdentity, selectIdentityCore } from "@/lib/auth/picker/selectIdentity";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    const error = new Error("NEXT_REDIRECT") as Error & { digest: string };
    error.digest = `NEXT_REDIRECT;replace;${path};false`;
    throw error;
  },
}));
// `headers` joins `cookies` here because the same-origin gate
// (lib/auth/sameOriginServerAction.ts) reads Fetch Metadata off the request.
// WITHOUT the export the gate's headers() call throws for want of it and lands
// in the no-request-scope catch-allow, so a "cross-site" case here would be
// ALLOWED rather than refused and would prove nothing. The default below is
// same-origin, so every pre-existing case still passes the gate and keeps
// exercising the real body. Same shape as tests/auth/picker/clearIdentity.test.ts.
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));

const headerMap = new Map<string, string>();
const setHeaders = (h: Record<string, string>): void => {
  headerMap.clear();
  for (const [k, v] of Object.entries(h)) headerMap.set(k.toLowerCase(), v);
};
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServiceRoleClient: vi.fn() }));
const logMock = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));
vi.mock("@/lib/log", () => ({ log: logMock }));
const upsertAdminAlertMock = vi.hoisted(() => vi.fn(async (_input: unknown): Promise<void> => {}));
vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({
  upsertAdminAlert: upsertAdminAlertMock,
}));

const KEY = "0".repeat(64);
const SHOW_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_SHOW_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CREW_ID = "22222222-2222-2222-2222-222222222222";
const OTHER_CREW_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const SLUG = "show-one";
const TOKEN = "a".repeat(64);
const OBSERVED = 1_737_028_800_123;

const cookieSet = vi.fn();
let existingCookie: string | undefined;
let rpcRow: {
  out_show_id: string | null;
  out_picker_epoch: number | null;
  out_observed_at_millis: number | null;
  out_rejection_code: string | null;
} | null;
let rpcError: unknown;

function formData(input: Partial<{ slug: string; shareToken: string; crewMemberId: string }> = {}) {
  const fd = new FormData();
  if (input.slug !== undefined) fd.set("slug", input.slug);
  if (input.shareToken !== undefined) fd.set("shareToken", input.shareToken);
  if (input.crewMemberId !== undefined) fd.set("crewMemberId", input.crewMemberId);
  return fd;
}

beforeEach(() => {
  logMock.warn.mockClear();
  logMock.info.mockClear();
  setHeaders({ "sec-fetch-site": "same-origin" });
  vi.mocked(headers).mockResolvedValue({
    get: (k: string) => headerMap.get(k.toLowerCase()) ?? null,
  } as unknown as Awaited<ReturnType<typeof headers>>);
  process.env.PICKER_COOKIE_SIGNING_KEY = KEY;
  existingCookie = undefined;
  rpcError = null;
  rpcRow = {
    out_show_id: SHOW_ID,
    out_picker_epoch: 7,
    out_observed_at_millis: OBSERVED,
    out_rejection_code: null,
  };
  cookieSet.mockReset();
  upsertAdminAlertMock.mockReset();
  upsertAdminAlertMock.mockResolvedValue(undefined);
  vi.mocked(revalidatePath).mockReset();
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) =>
      name === COOKIE_NAME && existingCookie ? { name, value: existingCookie } : undefined,
    set: cookieSet,
  } as never);
  vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({
    rpc: vi.fn(() => ({
      single: vi.fn(async () => ({ data: rpcRow, error: rpcError })),
    })),
  } as never);
});

describe("selectIdentityCore", () => {
  test("rejects legacy or malformed input", async () => {
    await expect(
      selectIdentityCore({ showId: SHOW_ID, crewMemberId: CREW_ID } as never),
    ).resolves.toEqual({
      ok: false,
      code: "PICKER_INVALID_INPUT",
    });
    await expect(
      selectIdentityCore({ slug: SLUG, shareToken: TOKEN, crewMemberId: "not-uuid" }),
    ).resolves.toEqual({
      ok: false,
      code: "PICKER_INVALID_INPUT",
    });
  });

  test("returns RPC rejection codes without writing cookies", async () => {
    rpcRow = {
      out_show_id: null,
      out_picker_epoch: null,
      out_observed_at_millis: null,
      out_rejection_code: "PICKER_INVALID_SHARE_TOKEN",
    };

    await expect(
      selectIdentityCore({ slug: SLUG, shareToken: TOKEN, crewMemberId: CREW_ID }),
    ).resolves.toEqual({
      ok: false,
      code: "PICKER_INVALID_SHARE_TOKEN",
    });
    expect(cookieSet).not.toHaveBeenCalled();
  });

  test("mints a signed picker cookie using RPC observed_at_millis and preserves other shows", async () => {
    existingCookie = encodePickerCookie(
      { v: 1, selections: { [OTHER_SHOW_ID]: { id: OTHER_CREW_ID, e: 2, t: 123 } } },
      KEY,
    );

    await expect(
      selectIdentityCore({ slug: SLUG, shareToken: TOKEN, crewMemberId: CREW_ID }),
    ).resolves.toEqual({
      ok: true,
    });

    expect(cookieSet).toHaveBeenCalledWith(
      COOKIE_NAME,
      expect.any(String),
      expect.objectContaining({ httpOnly: true, maxAge: 7_776_000, sameSite: "lax", secure: true }),
    );
    const encoded = cookieSet.mock.calls[0]![1] as string;
    const decoded = decodePickerCookie(encoded, KEY);
    expect(decoded?.selections[SHOW_ID]).toEqual({ id: CREW_ID, e: 7, t: OBSERVED });
    expect(decoded?.selections[OTHER_SHOW_ID]).toEqual({ id: OTHER_CREW_ID, e: 2, t: 123 });
    expect(revalidatePath).toHaveBeenCalledWith(`/show/${SLUG}/${TOKEN}`);
  });

  test("maps returned or thrown RPC faults to typed infra error", async () => {
    rpcError = { message: "db failed" };
    await expect(
      selectIdentityCore({ slug: SLUG, shareToken: TOKEN, crewMemberId: CREW_ID }),
    ).resolves.toEqual({
      ok: false,
      code: "PICKER_RESOLVER_LOOKUP_FAILED",
    });

    vi.mocked(createSupabaseServiceRoleClient).mockImplementation(() => {
      throw new Error("missing env");
    });
    await expect(
      selectIdentityCore({ slug: SLUG, shareToken: TOKEN, crewMemberId: CREW_ID }),
    ).resolves.toEqual({
      ok: false,
      code: "PICKER_RESOLVER_LOOKUP_FAILED",
    });
  });

  test("emits PICKER_IDENTITY_SELECTED on a committed selection", async () => {
    await selectIdentityCore({ slug: SLUG, shareToken: TOKEN, crewMemberId: CREW_ID });
    expect(logMock.info).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        code: "PICKER_IDENTITY_SELECTED",
        source: "auth.picker.selectIdentity",
        showId: SHOW_ID, // rpcRow.out_show_id
        crewMemberId: CREW_ID,
        epoch: 7, // rpcRow.out_picker_epoch
      }),
    );
  });

  test("does NOT emit PICKER_IDENTITY_SELECTED on rejection / infra fault", async () => {
    rpcRow = {
      out_show_id: null,
      out_picker_epoch: null,
      out_observed_at_millis: null,
      out_rejection_code: "PICKER_INVALID_SHARE_TOKEN",
    };
    await selectIdentityCore({ slug: SLUG, shareToken: TOKEN, crewMemberId: CREW_ID });
    rpcError = { message: "db failed" };
    await selectIdentityCore({ slug: SLUG, shareToken: TOKEN, crewMemberId: CREW_ID });
    await selectIdentityCore({ slug: "", shareToken: TOKEN, crewMemberId: CREW_ID }); // invalid input
    expect(logMock.info).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ code: "PICKER_IDENTITY_SELECTED" }),
    );
  });

  test("does NOT emit when selectIdentityCore catches a thrown fault (spec §5 *Core throw path)", async () => {
    // rpcRow stays valid (beforeEach default) so the RPC succeeds; the throw is forced
    // in the post-RPC cookie section (`await cookies()`), which is OUTSIDE the inner RPC
    // try — it propagates to the outer selectIdentityCore catch, and the emit (after the
    // cookie set) is never reached.
    vi.mocked(cookies).mockRejectedValueOnce(new Error("cookie store down"));
    await expect(
      selectIdentityCore({ slug: SLUG, shareToken: TOKEN, crewMemberId: CREW_ID }),
    ).resolves.toEqual({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
    expect(logMock.info).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ code: "PICKER_IDENTITY_SELECTED" }),
    );
  });
});

describe("selectIdentity FormData entry", () => {
  test("parses FormData and delegates to the core", async () => {
    await expect(
      selectIdentity(formData({ slug: SLUG, shareToken: TOKEN, crewMemberId: CREW_ID })),
    ).resolves.toEqual({
      ok: true,
    });
  });

  test("redirects claimed identity attempts after logging tamper signal", async () => {
    rpcRow = {
      out_show_id: null,
      out_picker_epoch: null,
      out_observed_at_millis: null,
      out_rejection_code: "PICKER_IDENTITY_CLAIMED",
    };
    await expect(
      selectIdentity(formData({ slug: SLUG, shareToken: TOKEN, crewMemberId: CREW_ID })),
    ).rejects.toMatchObject({
      digest: expect.stringContaining(
        `/auth/sign-in?next=${encodeURIComponent(`/show/${SLUG}/${TOKEN}`)}`,
      ),
    });

    expect(logMock.warn).toHaveBeenCalledTimes(1);
    // The tamper signal flows through lib/log; the message payload is a JSON envelope,
    // the reserved `source` rides the fields arg.
    expect(logMock.warn.mock.calls[0]![1]).toMatchObject({ source: "auth.picker.selectIdentity" });
    const logged = JSON.parse(logMock.warn.mock.calls[0]![0] as string) as Record<string, unknown>;
    expect(logged).toMatchObject({
      event: "picker.identity_claimed",
      tamper: true,
      slug: SLUG,
      crewMemberId: CREW_ID,
    });
    expect(logged).not.toHaveProperty("shareToken");
  });

  test("tamper branch raises a global admin alert BEFORE the redirect", async () => {
    // BL-PICKER-TAMPER-ADMIN-ALERT: the forensic warn now also surfaces as an
    // operator-visible admin_alerts row. Placement constraints under test:
    // BEFORE redirect() (which throws to unwind — an upsert after it never
    // runs), showId null (no lookup on a rejected-tamper path), and the share
    // token NEVER enters the context.
    rpcRow = {
      out_show_id: null,
      out_picker_epoch: null,
      out_observed_at_millis: null,
      out_rejection_code: "PICKER_IDENTITY_CLAIMED",
    };
    await expect(
      selectIdentity(formData({ slug: SLUG, shareToken: TOKEN, crewMemberId: CREW_ID })),
    ).rejects.toMatchObject({ digest: expect.stringContaining("/auth/sign-in") });

    expect(upsertAdminAlertMock).toHaveBeenCalledTimes(1);
    const arg = upsertAdminAlertMock.mock.calls[0]![0] as {
      showId: string | null;
      code: string;
      context: Record<string, unknown>;
    };
    expect(arg.code).toBe("PICKER_IDENTITY_CLAIMED_TAMPER");
    expect(arg.showId).toBeNull();
    expect(arg.context).toMatchObject({ slug: SLUG, crew_member_id: CREW_ID });
    // The share token is a secret (rotateShareToken emits epoch_<n>, never the
    // token) — it must not appear ANYWHERE in the context payload.
    expect(JSON.stringify(arg.context)).not.toContain(TOKEN);
  });

  test("a failed alert upsert never replaces the security redirect", async () => {
    // upsertAdminAlert THROWS on RPC error (lib/adminAlerts/upsertAdminAlert.ts).
    // Unguarded, a failed upsert would surface a 500 instead of the redirect —
    // strictly worse, since the tamperer learns they hit something. The catch
    // logs PICKER_ALERT_FAILED and the redirect still unwinds.
    rpcRow = {
      out_show_id: null,
      out_picker_epoch: null,
      out_observed_at_millis: null,
      out_rejection_code: "PICKER_IDENTITY_CLAIMED",
    };
    upsertAdminAlertMock.mockRejectedValueOnce(new Error("alert rpc down"));
    await expect(
      selectIdentity(formData({ slug: SLUG, shareToken: TOKEN, crewMemberId: CREW_ID })),
    ).rejects.toMatchObject({ digest: expect.stringContaining("/auth/sign-in") });

    expect(logMock.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ code: "PICKER_ALERT_FAILED" }),
    );
  });
});

/**
 * The class-B representative behavioral proof (origin-sweep spec §6B.2).
 *
 * Both cases run on the SAME spies. The baseline is not decoration: the suite's
 * pre-existing wrapper case asserts only `{ ok: true }`, which an implementation
 * that reached NEITHER mutation would also satisfy, so it cannot establish that
 * the zero-call assertions below mean "never reached".
 */
describe("selectIdentity — the same-origin gate (class-B representative)", () => {
  const validForm = () => formData({ slug: SLUG, shareToken: TOKEN, crewMemberId: CREW_ID });

  test("refuses a cross-site request before the cookie write and the RPC, and emits", async () => {
    // `cross-site` is the truth table's own reject row, not an ad-hoc header set.
    setHeaders({ "sec-fetch-site": "cross-site" });
    const rpc = vi.fn();
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({ rpc } as never);

    await expect(selectIdentity(validForm())).resolves.toEqual({
      ok: false,
      code: "PICKER_INVALID_INPUT",
    });
    expect(cookieSet).toHaveBeenCalledTimes(0);
    expect(rpc).toHaveBeenCalledTimes(0);
    expect(logMock.warn).toHaveBeenCalledWith(
      "cross-origin picker action refused",
      expect.objectContaining({
        code: "PICKER_ORIGIN_REJECTED",
        source: "auth.picker.sameOriginGate",
        action: "selectIdentity",
      }),
    );
  });

  test("same-origin baseline, same spies: the RPC runs AND the cookie is written", async () => {
    setHeaders({ "sec-fetch-site": "same-origin" });
    const rpc = vi.fn(() => ({
      single: vi.fn(async () => ({ data: rpcRow, error: rpcError })),
    }));
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({ rpc } as never);

    await expect(selectIdentity(validForm())).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(cookieSet).toHaveBeenCalledTimes(1);
    expect(logMock.warn).not.toHaveBeenCalled();
  });

  test("the exported CORE carries its own gate, with its own action string", async () => {
    // Deliberate duplication: the wrapper tail-delegates, so on a cross-origin
    // request the wrapper refuses first and this gate never runs in that path.
    // It is load-bearing anyway — every export of a "use server" module is an
    // independently addressable endpoint, and the per-endpoint `action` is what
    // makes deleting the wrapper's guard detectable.
    setHeaders({ "sec-fetch-site": "cross-site" });
    const rpc = vi.fn();
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({ rpc } as never);

    await expect(
      selectIdentityCore({ slug: SLUG, shareToken: TOKEN, crewMemberId: CREW_ID }),
    ).resolves.toEqual({ ok: false, code: "PICKER_INVALID_INPUT" });
    expect(rpc).toHaveBeenCalledTimes(0);
    expect(logMock.warn).toHaveBeenCalledWith(
      "cross-origin picker action refused",
      expect.objectContaining({ action: "selectIdentityCore" }),
    );
  });
});

/**
 * BL-BARE-TYPEOF-STRING-ID-GUARDS. selectIdentity reads all three ids off
 * FormData behind a bare typeof-string (selectIdentity.ts:47-49), which an empty
 * string satisfies. What rejects "" is the regex pass inside
 * selectIdentityCoreImpl (SLUG_RE / TOKEN_RE / UUID_RE, :118-125).
 *
 * The pre-existing malformed-input case above uses "not-uuid" -- a NON-EMPTY bad
 * value. A regex degraded to admit only the empty string keeps rejecting
 * "not-uuid", so that case cannot see this class at all. Hence separate cases.
 *
 * Each asserts the RPC was never reached, not merely that the returned code is
 * PICKER_INVALID_INPUT: an empty id must be refused BEFORE select_identity_atomic
 * is called, so a rejection that happened downstream of the DB would fail here.
 */
describe("selectIdentityCore refuses empty ids before touching the RPC", () => {
  const cases: ReadonlyArray<[string, { slug: string; shareToken: string; crewMemberId: string }]> =
    [
      ["empty slug", { slug: "", shareToken: TOKEN, crewMemberId: CREW_ID }],
      ["empty shareToken", { slug: SLUG, shareToken: "", crewMemberId: CREW_ID }],
      ["empty crewMemberId", { slug: SLUG, shareToken: TOKEN, crewMemberId: "" }],
      ["all three empty", { slug: "", shareToken: "", crewMemberId: "" }],
    ];

  for (const [name, input] of cases) {
    test(`${name} is refused with no RPC call`, async () => {
      const rpc = vi.fn();
      vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({ rpc } as never);
      await expect(selectIdentityCore(input)).resolves.toEqual({
        ok: false,
        code: "PICKER_INVALID_INPUT",
      });
      expect(rpc).toHaveBeenCalledTimes(0);
    });
  }

  test("control: the same path with all three ids well-formed DOES reach the RPC", async () => {
    const single = vi.fn(async () => ({ data: rpcRow, error: null }));
    const rpc = vi.fn(() => ({ single }));
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({ rpc } as never);
    await selectIdentityCore({ slug: SLUG, shareToken: TOKEN, crewMemberId: CREW_ID });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
