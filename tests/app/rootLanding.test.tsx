// @vitest-environment jsdom
// Root landing Task 3 — public `/` landing page (root-landing spec §4.2).
// Full async-page render with the session probe mocked: anonymous → card +
// EXACT CTA href + verbatim crew line + h1 containing FXAV; authenticated →
// redirect("/auth/sign-in?next=/admin") via the throwing-sentinel Next
// semantic, card NOT rendered; infra_error → fail-open card render WITH the
// "[root-landing]" console.error operator signal (fails if observability is
// dropped); no raw catalog-code shapes anywhere in rendered text.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { RootSessionProbeResult } from "@/lib/auth/rootSessionProbe";

const state = vi.hoisted(() => ({
  probeResult: { kind: "anonymous" } as RootSessionProbeResult,
  redirectCalls: [] as string[],
}));

vi.mock("@/lib/auth/rootSessionProbe", () => ({
  rootSessionProbe: async () => state.probeResult,
}));
// Next's redirect() throws (NEXT_REDIRECT) — mirror that semantic so the
// page's control flow after redirect is provably unreachable.
class RedirectSentinel extends Error {
  constructor(public readonly target: string) {
    super(`NEXT_REDIRECT_SENTINEL:${target}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (target: string) => {
    state.redirectCalls.push(target);
    throw new RedirectSentinel(target);
  },
}));

async function renderPage() {
  const mod = await import("@/app/page");
  const ui = await mod.default();
  return render(ui);
}

beforeEach(() => {
  state.probeResult = { kind: "anonymous" };
  state.redirectCalls = [];
});
afterEach(() => {
  cleanup();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("root landing page / (root-landing spec §4.2)", () => {
  it("anonymous: card with exact CTA href, verbatim crew line, and an h1 containing FXAV", async () => {
    await renderPage();

    const card = screen.getByTestId("root-landing-card");
    expect(card).toBeInTheDocument();

    // EXACT href — the CTA routes through the existing sign-in resolution.
    const cta = within(card).getByTestId("root-landing-signin");
    expect(cta).toHaveAttribute("href", "/auth/sign-in?next=/admin");

    // Verbatim crew line (spec §4.2 copy — no paraphrase drift).
    expect(
      within(card).getByText("On a crew? The link Doug sent goes straight to your show."),
    ).toBeInTheDocument();

    // Brand h1 — scoped within the card so a sibling can't satisfy it.
    const h1 = within(card).getByRole("heading", { level: 1 });
    expect(h1.textContent).toContain("FXAV");

    expect(state.redirectCalls).toHaveLength(0);
  });

  it("authenticated: redirect() with exactly /auth/sign-in?next=/admin and NO card", async () => {
    state.probeResult = { kind: "authenticated" };

    await expect(renderPage()).rejects.toBeInstanceOf(RedirectSentinel);
    expect(state.redirectCalls).toEqual(["/auth/sign-in?next=/admin"]);
    // The throwing sentinel means nothing rendered — card absent.
    expect(screen.queryByTestId("root-landing-card")).toBeNull();
  });

  it("infra_error: fail-open card render AND the [root-landing] operator signal", async () => {
    state.probeResult = {
      kind: "infra_error",
      message: "getUser threw: RAW_INFRA_DETAIL_42 boom",
    };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await renderPage();

    // Fail-open posture (spec §4.1.2): the card still renders.
    expect(screen.getByTestId("root-landing-card")).toBeInTheDocument();
    expect(state.redirectCalls).toHaveLength(0);

    // Operator signal — fails if the observability line is dropped.
    expect(errorSpy).toHaveBeenCalled();
    const firstArgs = errorSpy.mock.calls.map((c) => c[0]);
    expect(firstArgs.some((a) => typeof a === "string" && a.includes("[root-landing]"))).toBe(true);
  });

  it("no raw catalog-code shapes in rendered text (anonymous AND infra_error)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    for (const probe of [
      { kind: "anonymous" } as const,
      { kind: "infra_error", message: "SOME_RAW_CODE_99 detail" } as const,
    ]) {
      state.probeResult = probe;
      const { container } = await renderPage();
      const domText = container.textContent ?? "";
      // Invariant 5: nothing shaped like a raw catalog code (SCREAMING_SNAKE)
      // may surface in user-visible text.
      expect(domText).not.toMatch(/[A-Z][A-Z_]{5,}/);
      expect(domText).not.toContain("SOME_RAW_CODE_99");
      cleanup();
      vi.resetModules();
    }
    void errorSpy;
  });
});
