// @vitest-environment jsdom
/**
 * tests/components/CurrentShareLinkPanel.test.tsx (M11.5 §B Task F2.5)
 *
 * Pins the public contract of <CurrentShareLinkPanel>:
 *   - happy path: renders canonical URL composed of NEXT_PUBLIC_SITE_ORIGIN +
 *     /show/<slug>/<token> when loadShowShareToken returns a string.
 *   - null path: renders the "share link unavailable" state (NOT a broken
 *     "/show/<slug>/null" URL) when loadShowShareToken returns null.
 *   - throw path: renders the same unavailable state when loadShowShareToken
 *     throws (RPC error). The helper distinguishes returned-error vs
 *     thrown-error per AGENTS.md §1.9; UI treats both as "no link to display".
 *   - security: the share-token never appears in console.{log,warn,error}
 *     output OR on any global property (watchpoint from kickoff brief).
 *   - dev parity: when NEXT_PUBLIC_SITE_ORIGIN is unset, the URL falls back
 *     to the same localhost default used by lib/auth/validateNextParam.ts.
 *
 * Anti-tautology: the rendered URL is asserted as a literal string composed
 * from the test's known SLUG + TOKEN, not derived from the same source the
 * implementation reads. A broken implementation that hardcodes a different
 * token (or misorders /show/<token>/<slug>) cannot pass.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("@/lib/data/loadShowShareToken", () => ({
  loadShowShareToken: vi.fn(),
}));

import { CurrentShareLinkPanel } from "@/app/admin/show/[slug]/CurrentShareLinkPanel";
import { loadShowShareToken } from "@/lib/data/loadShowShareToken";

const SHOW_ID = "11111111-1111-1111-1111-111111111111";
const SLUG = "sample-show";
const TOKEN = "a".repeat(64);

const originalOrigin = process.env.NEXT_PUBLIC_SITE_ORIGIN;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  if (originalOrigin === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_ORIGIN;
  } else {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = originalOrigin;
  }
});

describe("<CurrentShareLinkPanel>", () => {
  test("renders the canonical URL composed of origin + slug + token", async () => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.show";
    vi.mocked(loadShowShareToken).mockResolvedValue(TOKEN);
    const { getByTestId } = render(
      await CurrentShareLinkPanel({ showId: SHOW_ID, slug: SLUG }),
    );
    const code = getByTestId("admin-current-share-link-url");
    expect(code.textContent).toBe(
      `https://crew.fxav.show/show/${SLUG}/${TOKEN}`,
    );
  });

  test("calls loadShowShareToken with the showId prop", async () => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.show";
    vi.mocked(loadShowShareToken).mockResolvedValue(TOKEN);
    render(await CurrentShareLinkPanel({ showId: SHOW_ID, slug: SLUG }));
    expect(loadShowShareToken).toHaveBeenCalledWith(SHOW_ID);
  });

  test("renders 'unavailable' state when loadShowShareToken returns null (non-admin / row missing)", async () => {
    vi.mocked(loadShowShareToken).mockResolvedValue(null);
    const { queryByTestId, getByTestId } = render(
      await CurrentShareLinkPanel({ showId: SHOW_ID, slug: SLUG }),
    );
    expect(queryByTestId("admin-current-share-link-url")).toBeNull();
    expect(queryByTestId("admin-current-share-link-copy-button")).toBeNull();
    expect(getByTestId("admin-current-share-link-unavailable")).toBeTruthy();
  });

  test("renders the same 'unavailable' state when loadShowShareToken throws", async () => {
    vi.mocked(loadShowShareToken).mockRejectedValue(
      new Error("admin_read_share_token failed: boom"),
    );
    const { queryByTestId, getByTestId } = render(
      await CurrentShareLinkPanel({ showId: SHOW_ID, slug: SLUG }),
    );
    expect(queryByTestId("admin-current-share-link-url")).toBeNull();
    expect(getByTestId("admin-current-share-link-unavailable")).toBeTruthy();
  });

  test("never renders a '/show/<slug>/null' URL (guard against null-stringification)", async () => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.show";
    vi.mocked(loadShowShareToken).mockResolvedValue(null);
    const { container } = render(
      await CurrentShareLinkPanel({ showId: SHOW_ID, slug: SLUG }),
    );
    expect(container.textContent ?? "").not.toContain(`/show/${SLUG}/null`);
    expect(container.textContent ?? "").not.toContain("null");
  });

  test("does NOT log the share-token to console (security: token is sensitive)", async () => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.show";
    vi.mocked(loadShowShareToken).mockResolvedValue(TOKEN);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(await CurrentShareLinkPanel({ showId: SHOW_ID, slug: SLUG }));
    for (const spy of [logSpy, warnSpy, errorSpy]) {
      for (const call of spy.mock.calls) {
        for (const arg of call) {
          if (typeof arg === "string") {
            expect(arg).not.toContain(TOKEN);
          }
        }
      }
    }
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test("does NOT stash the share-token on globalThis (security)", async () => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.show";
    vi.mocked(loadShowShareToken).mockResolvedValue(TOKEN);
    const beforeKeys = new Set(Object.keys(globalThis));
    render(await CurrentShareLinkPanel({ showId: SHOW_ID, slug: SLUG }));
    for (const key of Object.keys(globalThis)) {
      if (beforeKeys.has(key)) continue;
      const v = (globalThis as Record<string, unknown>)[key];
      if (typeof v === "string") {
        expect(v).not.toContain(TOKEN);
      }
    }
  });

  test("renders the Copy button with the expected testid + accessible name", async () => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.show";
    vi.mocked(loadShowShareToken).mockResolvedValue(TOKEN);
    const { getByTestId } = render(
      await CurrentShareLinkPanel({ showId: SHOW_ID, slug: SLUG }),
    );
    const btn = getByTestId(
      "admin-current-share-link-copy-button",
    ) as HTMLButtonElement;
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.getAttribute("aria-label") ?? "").toMatch(/copy/i);
  });

  test("falls back to localhost origin when NEXT_PUBLIC_SITE_ORIGIN is unset (dev parity)", async () => {
    delete process.env.NEXT_PUBLIC_SITE_ORIGIN;
    vi.mocked(loadShowShareToken).mockResolvedValue(TOKEN);
    const { getByTestId } = render(
      await CurrentShareLinkPanel({ showId: SHOW_ID, slug: SLUG }),
    );
    const code = getByTestId("admin-current-share-link-url");
    expect(code.textContent).toBe(
      `http://localhost:3000/show/${SLUG}/${TOKEN}`,
    );
  });

  test("URL display has the share-link section heading + crew-facing copy", async () => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.show";
    vi.mocked(loadShowShareToken).mockResolvedValue(TOKEN);
    const { getByTestId } = render(
      await CurrentShareLinkPanel({ showId: SHOW_ID, slug: SLUG }),
    );
    const root = getByTestId("admin-current-share-link-panel");
    expect(root.textContent).toMatch(/share[- ]link/i);
  });

  test("URL <code> has NO title attribute (attestation HIGH: token-in-hover-tooltip)", async () => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.show";
    vi.mocked(loadShowShareToken).mockResolvedValue(TOKEN);
    const { getByTestId } = render(
      await CurrentShareLinkPanel({ showId: SHOW_ID, slug: SLUG }),
    );
    const code = getByTestId("admin-current-share-link-url");
    expect(code.getAttribute("title")).toBeNull();
  });

  test("Copy button has NO aria-live (attestation HIGH: live region on focusable control)", async () => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.show";
    vi.mocked(loadShowShareToken).mockResolvedValue(TOKEN);
    const { getByTestId } = render(
      await CurrentShareLinkPanel({ showId: SHOW_ID, slug: SLUG }),
    );
    const btn = getByTestId("admin-current-share-link-copy-button");
    expect(btn.getAttribute("aria-live")).toBeNull();
  });

  test("Copy announcement lives on a sibling sr-only status node (a11y pattern)", async () => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.show";
    vi.mocked(loadShowShareToken).mockResolvedValue(TOKEN);
    const { getByTestId } = render(
      await CurrentShareLinkPanel({ showId: SHOW_ID, slug: SLUG }),
    );
    const announce = getByTestId("admin-current-share-link-copy-announce");
    expect(announce.getAttribute("role")).toBe("status");
    expect(announce.getAttribute("aria-live")).toBe("polite");
    expect(announce.className).toContain("sr-only");
    // Pre-copy: empty announcement so SRs don't say anything.
    expect(announce.textContent).toBe("");
  });
});
