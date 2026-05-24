import { beforeEach, describe, expect, test, vi } from "vitest";
import { COOKIE_NAME, decodePickerCookie, encodePickerCookie } from "@/lib/auth/picker/cookieEnvelope";
import { cleanupStaleEntry, cleanupStaleEntryCore } from "@/lib/auth/picker/cleanupStaleEntry";
import { upsertAdminAlert } from "@/lib/adminAlerts/upsertAdminAlert";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({ upsertAdminAlert: vi.fn() }));

const KEY = "0".repeat(64);
const SHOW_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_SHOW_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CREW_ID = "22222222-2222-2222-2222-222222222222";
const OTHER_CREW_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const SLUG = "show-one";
const TOKEN = "a".repeat(64);

const cookieSet = vi.fn();
let existingCookie: string | undefined;

function fd(input: Partial<Record<"slug" | "shareToken" | "showId" | "expectedEpoch" | "expectedCrewMemberId", string>> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) form.set(key, value);
  }
  return form;
}

beforeEach(() => {
  process.env.PICKER_COOKIE_SIGNING_KEY = KEY;
  existingCookie = undefined;
  cookieSet.mockReset();
  vi.mocked(revalidatePath).mockReset();
  vi.mocked(upsertAdminAlert).mockReset();
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => (name === COOKIE_NAME && existingCookie ? { name, value: existingCookie } : undefined),
    set: cookieSet,
  } as never);
});

describe("cleanupStaleEntry", () => {
  test("compare-and-deletes only matching stale entry and emits PICKER_SELECTION_RACE", async () => {
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
      cleanupStaleEntryCore({
        slug: SLUG,
        shareToken: TOKEN,
        showId: SHOW_ID,
        expectedEpoch: 1,
        expectedCrewMemberId: CREW_ID,
      }),
    ).resolves.toEqual({ ok: true, action: "cleaned" });

    const decoded = decodePickerCookie(cookieSet.mock.calls[0]![1] as string, KEY);
    expect(decoded?.selections[SHOW_ID]).toBeUndefined();
    expect(decoded?.selections[OTHER_SHOW_ID]).toEqual({ id: OTHER_CREW_ID, e: 2, t: 200 });
    expect(upsertAdminAlert).toHaveBeenCalledWith({
      showId: SHOW_ID,
      code: "PICKER_SELECTION_RACE",
      context: {
        show_id: SHOW_ID,
        stale_epoch: 1,
        stale_crew_member_id: CREW_ID,
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/show/${SLUG}/${TOKEN}`);
  });

  test("noop preserves newer state when epoch or crew member differs", async () => {
    existingCookie = encodePickerCookie({ v: 1, selections: { [SHOW_ID]: { id: CREW_ID, e: 2, t: 100 } } }, KEY);

    await expect(
      cleanupStaleEntryCore({
        slug: SLUG,
        shareToken: TOKEN,
        showId: SHOW_ID,
        expectedEpoch: 1,
        expectedCrewMemberId: CREW_ID,
      }),
    ).resolves.toEqual({ ok: true, action: "noop" });

    expect(cookieSet).not.toHaveBeenCalled();
    expect(upsertAdminAlert).not.toHaveBeenCalled();
  });

  test("clears the cookie when the matching stale entry is the only entry", async () => {
    existingCookie = encodePickerCookie({ v: 1, selections: { [SHOW_ID]: { id: CREW_ID, e: 1, t: 100 } } }, KEY);

    await expect(
      cleanupStaleEntryCore({
        slug: SLUG,
        shareToken: TOKEN,
        showId: SHOW_ID,
        expectedEpoch: 1,
        expectedCrewMemberId: CREW_ID,
      }),
    ).resolves.toEqual({ ok: true, action: "cleaned" });

    expect(cookieSet).toHaveBeenCalledWith(
      COOKIE_NAME,
      "",
      expect.objectContaining({ httpOnly: true, maxAge: 0, sameSite: "lax", secure: true }),
    );
  });

  test("validates FormData and parsed expected epoch", async () => {
    await expect(cleanupStaleEntry(fd({ slug: SLUG, shareToken: TOKEN, showId: SHOW_ID, expectedEpoch: "x" }))).resolves.toEqual({
      ok: false,
      code: "PICKER_INVALID_INPUT",
    });
    await expect(
      cleanupStaleEntryCore({
        slug: SLUG,
        shareToken: TOKEN,
        showId: SHOW_ID,
        expectedEpoch: 1,
        expectedCrewMemberId: "not-uuid",
      }),
    ).resolves.toEqual({ ok: false, code: "PICKER_INVALID_INPUT" });
  });
});
