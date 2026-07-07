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
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("@/lib/data/loadShowShareToken", () => ({
  loadShowShareToken: vi.fn(),
}));

import { buildCrewLinkMailtos } from "@/app/admin/show/[slug]/crewLinkMailto";
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
    const { getByTestId } = render(await CurrentShareLinkPanel({ showId: SHOW_ID, slug: SLUG }));
    const code = getByTestId("admin-current-share-link-url");
    expect(code.textContent).toBe(`https://crew.fxav.show/show/${SLUG}/${TOKEN}`);
  });

  test("calls loadShowShareToken with the showId prop", async () => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.show";
    vi.mocked(loadShowShareToken).mockResolvedValue(TOKEN);
    render(await CurrentShareLinkPanel({ showId: SHOW_ID, slug: SLUG }));
    expect(loadShowShareToken).toHaveBeenCalledWith(SHOW_ID);
  });

  // Codex R2 — single render-scoped token snapshot. When the caller passes a
  // `token` prop, the panel MUST use that exact value and NOT re-read (so the
  // header chip and this panel can't render two different tokens from a
  // concurrent rotation).
  test("uses the passed token snapshot and does NOT re-read (no race-prone double read)", async () => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.show";
    // If the panel ignored the prop and re-read, it would get DIFFERENT_TOKEN.
    const DIFFERENT_TOKEN = "b".repeat(64);
    vi.mocked(loadShowShareToken).mockResolvedValue(DIFFERENT_TOKEN);
    const { getByTestId } = render(
      await CurrentShareLinkPanel({ showId: SHOW_ID, slug: SLUG, token: TOKEN }),
    );
    expect(loadShowShareToken).not.toHaveBeenCalled();
    expect(getByTestId("admin-current-share-link-url").textContent).toBe(
      `https://crew.fxav.show/show/${SLUG}/${TOKEN}`,
    );
  });

  test("passed token=null renders the unavailable state without re-reading", async () => {
    vi.mocked(loadShowShareToken).mockResolvedValue(TOKEN); // would succeed if (wrongly) re-read
    const { getByTestId, queryByTestId } = render(
      await CurrentShareLinkPanel({ showId: SHOW_ID, slug: SLUG, token: null }),
    );
    expect(loadShowShareToken).not.toHaveBeenCalled();
    expect(queryByTestId("admin-current-share-link-url")).toBeNull();
    expect(getByTestId("admin-current-share-link-unavailable")).toBeTruthy();
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
    const { container } = render(await CurrentShareLinkPanel({ showId: SHOW_ID, slug: SLUG }));
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
    const { getByTestId } = render(await CurrentShareLinkPanel({ showId: SHOW_ID, slug: SLUG }));
    const btn = getByTestId("admin-current-share-link-copy-button") as HTMLButtonElement;
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.getAttribute("aria-label") ?? "").toMatch(/copy/i);
  });

  test("falls back to localhost origin when NEXT_PUBLIC_SITE_ORIGIN is unset (dev parity)", async () => {
    delete process.env.NEXT_PUBLIC_SITE_ORIGIN;
    vi.mocked(loadShowShareToken).mockResolvedValue(TOKEN);
    const { getByTestId } = render(await CurrentShareLinkPanel({ showId: SHOW_ID, slug: SLUG }));
    const code = getByTestId("admin-current-share-link-url");
    expect(code.textContent).toBe(`http://localhost:3000/show/${SLUG}/${TOKEN}`);
  });

  // M12.5 — Rotate/Reset are folded INTO this card via the `actions` slot. The
  // slot MUST render inside the panel card both when a token exists AND when it's
  // unavailable (rotate must stay reachable after a failed token read, §6 R1).
  test("renders the actions slot INSIDE the card when a token exists", async () => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.show";
    vi.mocked(loadShowShareToken).mockResolvedValue(TOKEN);
    const { getByTestId } = render(
      await CurrentShareLinkPanel({
        showId: SHOW_ID,
        slug: SLUG,
        token: TOKEN,
        actions: <button data-testid="fold-action">Rotate</button>,
      }),
    );
    const card = getByTestId("admin-current-share-link-panel");
    const action = getByTestId("fold-action");
    expect(card.contains(action)).toBe(true);
  });

  test("renders the actions slot INSIDE the card even when the token is unavailable", async () => {
    const { getByTestId } = render(
      await CurrentShareLinkPanel({
        showId: SHOW_ID,
        slug: SLUG,
        token: null,
        actions: <button data-testid="fold-action">Rotate</button>,
      }),
    );
    const card = getByTestId("admin-current-share-link-panel");
    expect(getByTestId("admin-current-share-link-unavailable")).toBeTruthy();
    expect(card.contains(getByTestId("fold-action"))).toBe(true);
  });

  test("URL display has the share-link section heading + crew-facing copy", async () => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.show";
    vi.mocked(loadShowShareToken).mockResolvedValue(TOKEN);
    const { getByTestId } = render(await CurrentShareLinkPanel({ showId: SHOW_ID, slug: SLUG }));
    const root = getByTestId("admin-current-share-link-panel");
    expect(root.textContent).toMatch(/share[- ]link/i);
  });

  test("URL <code> has NO title attribute (attestation HIGH: token-in-hover-tooltip)", async () => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.show";
    vi.mocked(loadShowShareToken).mockResolvedValue(TOKEN);
    const { getByTestId } = render(await CurrentShareLinkPanel({ showId: SHOW_ID, slug: SLUG }));
    const code = getByTestId("admin-current-share-link-url");
    expect(code.getAttribute("title")).toBeNull();
  });

  test("Copy button has NO aria-live (attestation HIGH: live region on focusable control)", async () => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.show";
    vi.mocked(loadShowShareToken).mockResolvedValue(TOKEN);
    const { getByTestId } = render(await CurrentShareLinkPanel({ showId: SHOW_ID, slug: SLUG }));
    const btn = getByTestId("admin-current-share-link-copy-button");
    expect(btn.getAttribute("aria-live")).toBeNull();
  });

  test("Copy announcement lives on a sibling sr-only status node (a11y pattern)", async () => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.show";
    vi.mocked(loadShowShareToken).mockResolvedValue(TOKEN);
    const { getByTestId } = render(await CurrentShareLinkPanel({ showId: SHOW_ID, slug: SLUG }));
    const announce = getByTestId("admin-current-share-link-copy-announce");
    expect(announce.getAttribute("role")).toBe("status");
    expect(announce.getAttribute("aria-live")).toBe("polite");
    expect(announce.className).toContain("sr-only");
    // Pre-copy: empty announcement so SRs don't say anything.
    expect(announce.textContent).toBe("");
  });
});

// Flow 5 (audit 5.2) — persistent "Email this link to crew" anchors.
// Spec docs/superpowers/specs/2026-07-07-flow5-rotate-disclosure-mailto.md §2.4/§6.3.
describe("<CurrentShareLinkPanel> — email-crew anchors", () => {
  const CREW_EMAILS = ["a@example.com", "b@example.com"];
  const SHOW_TITLE = "RPAS Central";

  test("token + emails → single anchor with helper-derived href", async () => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.show";
    const { getAllByTestId, queryByTestId } = render(
      await CurrentShareLinkPanel({
        showId: SHOW_ID,
        slug: SLUG,
        token: TOKEN,
        crewEmails: CREW_EMAILS,
        showTitle: SHOW_TITLE,
      }),
    );
    const url = `https://crew.fxav.show/show/${SLUG}/${TOKEN}`;
    const expected = buildCrewLinkMailtos({ emails: CREW_EMAILS, url, showTitle: SHOW_TITLE });
    expect(expected).toHaveLength(1);
    const anchors = getAllByTestId("admin-current-share-link-email-button");
    expect(anchors).toHaveLength(1);
    expect(anchors[0]!.getAttribute("href")).toBe(expected[0]!.href);
    expect(anchors[0]!.textContent).toContain("Email this link to crew");
    expect(anchors[0]!.textContent).not.toMatch(/\(\d+ of \d+\)/);
    expect(queryByTestId("admin-current-share-link-email-note")).toBeNull();
  });

  // Adversarial R2 — an implementation rendering only mailtos[0] must fail.
  test("multi-batch roster: anchor count, (N of M) labels, hrefs match every helper batch", async () => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.show";
    const bigRoster = Array.from(
      { length: 60 },
      (_, i) => `${"a".repeat(60)}${String(i).padStart(4, "0")}@example.com`,
    );
    const { getAllByTestId } = render(
      await CurrentShareLinkPanel({
        showId: SHOW_ID,
        slug: SLUG,
        token: TOKEN,
        crewEmails: bigRoster,
        showTitle: SHOW_TITLE,
      }),
    );
    const url = `https://crew.fxav.show/show/${SLUG}/${TOKEN}`;
    const expected = buildCrewLinkMailtos({ emails: bigRoster, url, showTitle: SHOW_TITLE });
    expect(expected.length).toBeGreaterThan(1);
    const anchors = getAllByTestId("admin-current-share-link-email-button");
    expect(anchors).toHaveLength(expected.length);
    expected.forEach((m, i) => {
      expect(anchors[i]!.getAttribute("href")).toBe(m.href);
      expect(anchors[i]!.textContent).toContain(
        `Email this link to crew (${m.batch} of ${m.batchCount})`,
      );
    });
    // Impeccable critique P1 — partial-distribution trap (see rotate counterpart).
    const note = getAllByTestId("admin-current-share-link-email-note");
    expect(note).toHaveLength(1);
    expect(note[0]!.textContent).toContain(`${expected.length} separate emails`);
  });

  test("token + no emails → no anchor", async () => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.show";
    const { queryByTestId } = render(
      await CurrentShareLinkPanel({ showId: SHOW_ID, slug: SLUG, token: TOKEN, crewEmails: [] }),
    );
    expect(queryByTestId("admin-current-share-link-email-button")).toBeNull();
  });

  test("unavailable branch (token null) → no anchor even with emails", async () => {
    const { queryByTestId, getByTestId } = render(
      await CurrentShareLinkPanel({
        showId: SHOW_ID,
        slug: SLUG,
        token: null,
        crewEmails: CREW_EMAILS,
        showTitle: SHOW_TITLE,
      }),
    );
    expect(getByTestId("admin-current-share-link-unavailable")).toBeTruthy();
    expect(queryByTestId("admin-current-share-link-email-button")).toBeNull();
  });
});
