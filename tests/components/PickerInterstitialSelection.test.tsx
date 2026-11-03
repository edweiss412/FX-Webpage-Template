// @vitest-environment jsdom
/**
 * tests/components/PickerInterstitialSelection.test.tsx (crew page redesign PR B Task 9)
 *
 * The picker selection's redirect (plan decision 7): an active roster row submits
 * the form-action wrapper inside `_PickerInterstitial.tsx`, which redirects to the
 * show URL with `s` alone, dropping `gate=skip` by design. An old `?s=travel`
 * carried through the form must come back as `s=hotels` (spec line 242, "applied
 * everywhere `s` is resolved").
 *
 * The wrapper is not exported; it is the function React holds as the row form's
 * `action` prop, read here from the rendered form element's props. Its three
 * collaborators are mocked: the same-origin gate admits, `selectIdentity`
 * succeeds, and `redirect` throws a NEXT_REDIRECT digest carrying the URL.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("@/lib/auth/sameOriginServerAction", () => ({
  isSameOriginServerAction: async () => true,
  rejectCrossOriginVoid: () => undefined,
}));
vi.mock("@/lib/auth/picker/selectIdentity", () => ({
  selectIdentity: async () => ({ ok: true }),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: (path: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${path}` });
  },
}));

import { PickerInterstitial } from "@/app/show/[slug]/[shareToken]/_PickerInterstitial";

afterEach(cleanup);

const SLUG = "sample-show";
const TOKEN = "a".repeat(64);

const ACTIVE_ROW = {
  id: "22222222-2222-2222-2222-222222222222",
  name: "Alice Adams",
  role: "Audio A1",
  role_flags: [],
  claimed_via_oauth_at: null as null,
};

/** The function React holds as the form's `action` prop. */
function formAction(form: HTMLFormElement): (formData: FormData) => Promise<void> {
  const key = Object.keys(form).find((k) => k.startsWith("__reactProps"));
  const action =
    key === undefined
      ? undefined
      : (form as unknown as Record<string, { action?: unknown }>)[key]?.action;
  if (typeof action !== "function") throw new Error("the row form holds no action function");
  return action as (formData: FormData) => Promise<void>;
}

async function redirectOf(s: string | undefined): Promise<string> {
  const { getAllByTestId } = render(
    <PickerInterstitial
      slug={SLUG}
      shareToken={TOKEN}
      showId="11111111-1111-1111-1111-111111111111"
      banner={null}
      staleCleanupHint={null}
      roster={[ACTIVE_ROW]}
      s={s}
    />,
  );
  const form = (getAllByTestId("picker-roster-row")[0] as HTMLButtonElement).closest("form")!;
  try {
    await formAction(form)(new FormData(form));
  } catch (err) {
    return (err as { digest?: string }).digest ?? "";
  }
  throw new Error("expected a NEXT_REDIRECT, none thrown");
}

describe("picker selection redirect (plan decision 7)", () => {
  test("a selection carries an old s=travel as s=hotels and no gate", async () => {
    const digest = await redirectOf("travel");
    expect(digest).toBe(`NEXT_REDIRECT;replace;/show/${SLUG}/${TOKEN}?s=hotels`);
  });

  test("positive control: a current id is carried as itself, and no s at all leaves the bare URL", async () => {
    expect(await redirectOf("venue")).toBe(`NEXT_REDIRECT;replace;/show/${SLUG}/${TOKEN}?s=venue`);
    cleanup();
    expect(await redirectOf(undefined)).toBe(`NEXT_REDIRECT;replace;/show/${SLUG}/${TOKEN}`);
  });
});
