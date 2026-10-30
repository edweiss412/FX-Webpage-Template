// @vitest-environment jsdom
/**
 * The crew show route's sibling surfaces each render the saved-copy marker the
 * spec 4.3 table assigns them: `<ShowUnavailable />`, the picker and the
 * sign-in-or-skip gate `purge`, naming the show; the route's not-found page
 * `check`, naming none (the token resolved to no show); and the route's
 * `error.tsx` `hold`, naming none.
 *
 * Each case reads the marker twice: from the rendered DOM (exactly one marker
 * element, spec 4.3) and from the server's static markup with the worker's own
 * reader, which is what a document load hands the worker. The static markup is
 * a first render with no effects run, so a marker that appeared only after
 * mount would fail there; the picker's mount purge is the first half of the
 * "picking a name" transition, so its marker must be in that first render.
 *
 * `resolveShowPageAccess` and the service client are mocked, as in
 * tests/show/savedCopyMarkerArms.test.tsx; the surfaces and the marker render
 * for real.
 *
 * Failure modes caught: a sibling rendering no marker (the worker then purges
 * on its own judgement, fail closed, but a client-side render posts nothing);
 * either ShowUnavailable call site in page.tsx passing no show id or another
 * show's (the purge then misses this show's copy, which lives under another
 * URL); not-found or error naming a show they cannot know; a marker gated on a
 * mount effect; and a TerminalFailure outside the route (app/me) growing a
 * marker it was never given.
 */
import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/auth/picker/showPageChainRequest", () => ({
  buildShowPageChainRequest: vi.fn(async () => new Request("http://internal/")),
}));
vi.mock("@/lib/auth/picker/resolveShowPageAccess", () => ({ resolveShowPageAccess: vi.fn() }));
vi.mock("@/lib/data/getShowForViewer", async (orig) => ({
  ...(await orig<typeof import("@/lib/data/getShowForViewer")>()),
  getShowForViewer: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServiceRoleClient: vi.fn() }));
vi.mock("@/lib/observe/captureBoundaryError", () => ({ captureBoundaryError: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  usePathname: () => "/show/s/t",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import CrewError from "@/app/show/[slug]/[shareToken]/error";
import CrewLinkNotFound from "@/app/show/[slug]/[shareToken]/not-found";
import ShowPage from "@/app/show/[slug]/[shareToken]/page";
import { TerminalFailure } from "@/components/auth/TerminalFailure";
import { resolveShowPageAccess } from "@/lib/auth/picker/resolveShowPageAccess";
import { CrewMemberNotInShowError, getShowForViewer } from "@/lib/data/getShowForViewer";
import { MARKER_ID, readMarker, type Marker } from "@/lib/offline/marker";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { premiseHolds } from "@/tests/_shared/premise";

type Access = Awaited<ReturnType<typeof resolveShowPageAccess>>;
type ServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;
type RosterBuilder = {
  select: () => RosterBuilder;
  eq: () => RosterBuilder;
  order: () => Promise<{ data: unknown; error: unknown }>;
};

const SHOW = "3f2b8c1e-9d4a-4e6b-8a57-1c2d3e4f5a6b";
const CREW = "7c1e0d42-2b6f-4a39-9e81-5f3a2c4b6d70";

const ROSTER_ROW = {
  id: CREW,
  name: "Test Crew",
  role: "A1",
  role_flags: [],
  claimed_via_oauth_at: null,
};

function mockAccess(value: Access): void {
  vi.mocked(resolveShowPageAccess).mockResolvedValue(value);
}

/** The service client: the roster always reads; the show reads as `published` or not. */
function mockReads({ published }: { published: boolean }): void {
  vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({
    from: (table: string) => {
      if (table === "shows") {
        const result = { data: { published, archived: false }, error: null };
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(result) }) }) };
      }
      const q: RosterBuilder = {
        select: () => q,
        eq: () => q,
        order: () => Promise.resolve({ data: [ROSTER_ROW], error: null }),
      };
      return q;
    },
  } as unknown as ServiceClient);
}

async function pageElement(searchParams: { gate?: string } = {}): Promise<ReactElement> {
  return (await ShowPage({
    params: Promise.resolve({ slug: "s", shareToken: "t" }),
    searchParams: Promise.resolve(searchParams),
  })) as ReactElement;
}

/**
 * The surface `element` renders carries exactly `expected`, in the DOM and in
 * the first-render static markup the worker reads. `rootTestId` proves the
 * intended surface rendered, so a marker from some other arm cannot pass.
 */
function expectMarker(element: ReactElement, rootTestId: string | null, expected: Marker): void {
  const { container } = render(element);
  if (rootTestId !== null) {
    premiseHolds(
      `the ${rootTestId} surface rendered`,
      container.querySelector(`[data-testid="${rootTestId}"]`) !== null,
    );
  }
  const markers = container.querySelectorAll(`#${MARKER_ID}`);
  expect(markers).toHaveLength(1);
  const marker = markers[0]!;
  expect(marker.tagName).toBe("TEMPLATE");
  expect(marker.getAttribute("data-disposition")).toBe(expected.disposition);
  expect(marker.getAttribute("data-show-id")).toBe(expected.showId);
  expect(marker.hasAttribute("data-viewer")).toBe(false);
  expect(readMarker(container.innerHTML)).toEqual({ kind: "valid", marker: expected });
  expect(readMarker(renderToStaticMarkup(element))).toEqual({ kind: "valid", marker: expected });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ShowUnavailable: purge, naming the show, from both page.tsx call sites", () => {
  test("the unpublished arm passes the show the access result resolved", async () => {
    mockAccess({ kind: "unpublished", showId: SHOW });
    expectMarker(await pageElement(), "crew-show-paused-root", {
      disposition: "purge",
      showId: SHOW,
    });
  });

  test("the raced crew miss, show now unpublished, passes the resolved show", async () => {
    mockAccess({
      kind: "resolved",
      showId: SHOW,
      crewMemberId: CREW,
      source: "cookie",
      pickerEpoch: 7,
    });
    vi.mocked(getShowForViewer).mockRejectedValue(new CrewMemberNotInShowError());
    mockReads({ published: false });
    expectMarker(await pageElement(), "crew-show-paused-root", {
      disposition: "purge",
      showId: SHOW,
    });
  });
});

describe("the sign-in-or-skip gate: purge, naming the show, in both modes", () => {
  test.each(["first_contact", "google_mismatch"] as const)("%s", async (reason) => {
    mockAccess({ kind: "no_auth", showId: SHOW, reason });
    expectMarker(await pageElement(), "sign-in-or-skip-gate", {
      disposition: "purge",
      showId: SHOW,
    });
  });
});

describe("the picker interstitial", () => {
  test("purge, naming the show, present on the first render", async () => {
    mockAccess({ kind: "no_auth", showId: SHOW, reason: "first_contact" });
    mockReads({ published: true });
    expectMarker(await pageElement({ gate: "skip" }), "picker-interstitial-root", {
      disposition: "purge",
      showId: SHOW,
    });
  });
});

describe("the route's boundaries", () => {
  test("not-found: check, naming no show (the token resolved to none)", () => {
    expectMarker(<CrewLinkNotFound />, "crew-not-found-root", {
      disposition: "check",
      showId: null,
    });
  });

  test("error.tsx: hold, naming no show", () => {
    expectMarker(<CrewError error={new Error("boom")} reset={() => {}} />, null, {
      disposition: "hold",
      showId: null,
    });
  });
});

describe("outside the route", () => {
  test("a TerminalFailure given no savedCopy renders no marker (app/me/page.tsx)", () => {
    const { container } = render(<TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" />);
    premiseHolds(
      "the terminal failure rendered",
      container.querySelector('[data-testid="terminal-failure"]') !== null,
    );
    expect(container.querySelector(`#${MARKER_ID}`)).toBeNull();
    expect(readMarker(container.innerHTML)).toEqual({ kind: "absent" });
  });
});
