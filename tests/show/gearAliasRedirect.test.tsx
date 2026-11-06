// @vitest-environment jsdom
/**
 * tests/show/gearAliasRedirect.test.tsx (crew page redesign PR C Task 8)
 *
 * The show page's own two redirect paths with an old `s=gear` as input (spec line
 * 242, the plan's "Redirect allow-lists" row): the picker bootstrap redirect keeps
 * `gate` when the URL carries one, and the sign-in gate takes the page's
 * `allowlistedS`. tests/crew/sectionIdConsumption.test.ts pins that the page spells
 * no id of its own; this drives the function, so a page that stopped passing the
 * canonical value down fails here.
 */
import { render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/auth/picker/showPageChainRequest", () => ({
  buildShowPageChainRequest: vi.fn(async () => new Request("http://internal/")),
}));
vi.mock("@/lib/auth/picker/resolveShowPageAccess", () => ({ resolveShowPageAccess: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((path: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { path });
  }),
  usePathname: () => "/show/s/t",
}));

import ShowPage from "@/app/show/[slug]/[shareToken]/page";
import { resolveShowPageAccess } from "@/lib/auth/picker/resolveShowPageAccess";
import { LEGACY_SECTION_ALIASES } from "@/lib/crew/resolveActiveSection";
import { premiseHolds } from "@/tests/_shared/premise";

type Access = Awaited<ReturnType<typeof resolveShowPageAccess>>;

const SLUG = "sample-show";
const TOKEN = "a".repeat(64);
const SHOW = `/show/${SLUG}/${TOKEN}`;
const SHOW_ID = "11111111-1111-1111-1111-111111111111";

function page(search: { s?: string; gate?: string }) {
  return ShowPage({
    params: Promise.resolve({ slug: SLUG, shareToken: TOKEN }),
    searchParams: Promise.resolve(search),
  });
}

/** The URL the page redirects to, read from the mocked `redirect`'s throw. */
async function bootstrapNext(search: { s?: string; gate?: string }): Promise<string> {
  vi.mocked(resolveShowPageAccess).mockResolvedValue({
    kind: "needs_picker_bootstrap",
    intentToken: "intent",
  } as Access);
  const path = await page(search).then(
    () => {
      throw new Error("expected a redirect, none thrown");
    },
    (err: { path?: string }) => err.path ?? "",
  );
  const url = new URL(path, "http://internal");
  premiseHolds("the page redirected to the bootstrap route", url.pathname.endsWith("bootstrap"));
  return url.searchParams.get("next") ?? "";
}

describe("the show page's redirects (PR C Task 8)", () => {
  test("gear alias: the picker bootstrap carries s=rooms, keeping a gate only when the URL has one", async () => {
    premiseHolds("the aliases hold gear", Object.hasOwn(LEGACY_SECTION_ALIASES, "gear"));
    expect(await bootstrapNext({ s: "gear" })).toBe(`${SHOW}?s=rooms`);
    expect(await bootstrapNext({ s: "gear", gate: "skip" })).toBe(`${SHOW}?s=rooms&gate=skip`);
    // Positive control: a current id takes the same path as itself.
    expect(await bootstrapNext({ s: "venue" })).toBe(`${SHOW}?s=venue`);
  });

  test("gear alias: the sign-in gate takes s=rooms, on its skip link and its sign-in next", async () => {
    vi.mocked(resolveShowPageAccess).mockResolvedValue({
      kind: "no_auth",
      showId: SHOW_ID,
      reason: "first_contact",
    } as Access);
    const { getByTestId } = render(await page({ s: "gear" }));
    expect(getByTestId("sign-in-or-skip-gate-skip-cta").getAttribute("href")).toBe(
      `${SHOW}?s=rooms&gate=skip`,
    );
    expect(getByTestId("sign-in-or-skip-gate-sign-in-cta").getAttribute("href")).toBe(
      `/auth/sign-in?next=${encodeURIComponent(`${SHOW}?s=rooms`)}`,
    );
  });
});
