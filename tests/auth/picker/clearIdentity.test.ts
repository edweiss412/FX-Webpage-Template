import { beforeEach, describe, expect, test, vi } from "vitest";
import { COOKIE_NAME, decodePickerCookie, encodePickerCookie } from "@/lib/auth/picker/cookieEnvelope";
import { clearIdentity, clearIdentityAndSkip, clearIdentityCore } from "@/lib/auth/picker/clearIdentity";
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
  vi.mocked(revalidatePath).mockReset();
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => (name === COOKIE_NAME && existingCookie ? { name, value: existingCookie } : undefined),
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

    await expect(clearIdentityCore({ slug: SLUG, shareToken: TOKEN, showId: SHOW_ID })).resolves.toEqual({
      ok: true,
    });

    const encoded = cookieSet.mock.calls[0]![1] as string;
    const decoded = decodePickerCookie(encoded, KEY);
    expect(decoded?.selections[SHOW_ID]).toBeUndefined();
    expect(decoded?.selections[OTHER_SHOW_ID]).toEqual({ id: OTHER_CREW_ID, e: 2, t: 200 });
    expect(revalidatePath).toHaveBeenCalledWith(`/show/${SLUG}/${TOKEN}`);
  });

  test("clears cookie when the envelope becomes empty", async () => {
    existingCookie = encodePickerCookie({ v: 1, selections: { [SHOW_ID]: { id: CREW_ID, e: 1, t: 100 } } }, KEY);

    await expect(clearIdentityCore({ slug: SLUG, shareToken: TOKEN, showId: SHOW_ID })).resolves.toEqual({
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
    await expect(clearIdentityCore({ slug: SLUG, shareToken: TOKEN, showId: "not-uuid" })).resolves.toEqual({
      ok: false,
      code: "PICKER_INVALID_INPUT",
    });
  });

  test("clearIdentityAndSkip clears then redirects to gate skip", async () => {
    existingCookie = encodePickerCookie({ v: 1, selections: { [SHOW_ID]: { id: CREW_ID, e: 1, t: 100 } } }, KEY);

    await expect(clearIdentityAndSkip(fd({ slug: SLUG, shareToken: TOKEN, showId: SHOW_ID }))).rejects.toMatchObject({
      digest: expect.stringContaining(`/show/${SLUG}/${TOKEN}?gate=skip`),
    });
    expect(cookieSet).toHaveBeenCalled();
  });
});
