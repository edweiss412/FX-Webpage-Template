import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  COOKIE_NAME,
  decodePickerCookie,
  encodePickerCookie,
} from "@/lib/auth/picker/cookieEnvelope";
import { selectIdentity, selectIdentityCore } from "@/lib/auth/picker/selectIdentity";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
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
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServiceRoleClient: vi.fn() }));
const logMock = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));
vi.mock("@/lib/log", () => ({ log: logMock }));

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
});
