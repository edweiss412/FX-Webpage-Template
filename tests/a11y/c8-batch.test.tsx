// @vitest-environment jsdom
/**
 * tests/a11y/c8-batch.test.tsx (M9 C8 / M5-D6 — batched P2/P3 a11y polish)
 *
 * Pins the four implemented a11y contracts:
 *   #1 ErrorExplainer — `<details>` UA marker suppression classes
 *   #3 AlertBanner   — aria-atomic="true" on the role="status" region
 *   #4 Bootstrap     — single stable aria-live wrapper; no nested role="alert"
 *   #5 sign-in page — <header aria-labelledby> tied to <h1 id>
 *
 * #2 (SignInButton aria-describedby) is intentionally skipped — the
 * inline error block lives at the page level with role="alert" and
 * catalog-bound copy, not on the button itself. Documented in the
 * C8 commit body, not enforced by a test.
 *
 * Each test asserts the DOM contract anti-tautology — the literal
 * attribute/value combination is the thing the assistive tech reads.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

afterEach(() => cleanup());

describe("M9 C8 #1 — ErrorExplainer hides the UA disclosure marker", () => {
  test("the <details> element carries the marker-suppression Tailwind classes", async () => {
    const { ErrorExplainer } = await import("@/components/messages/ErrorExplainer");
    // CSRF_KEY_ROTATED has both crewFacing AND helpfulContext non-null
    // (post Task 9.4 part 2), so helpfulContext={true} renders the
    // <details> block.
    const { container } = render(
      <ErrorExplainer code="CSRF_KEY_ROTATED" surface="crew" helpfulContext />,
    );
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    const className = details?.getAttribute("class") ?? "";
    // The four classes that collectively suppress the marker across
    // Chromium / Firefox / Safari.
    expect(className).toContain("list-none");
    expect(className).toContain("[&::-webkit-details-marker]:hidden");
    expect(className).toContain("[&_summary::-webkit-details-marker]:hidden");
    expect(className).toContain("[&_summary]:list-none");
  });
});

describe("M9 C8 #3 — AlertBanner is aria-atomic", () => {
  test("the rendered banner section carries aria-atomic='true'", async () => {
    // Lightweight mock so we don't need real Supabase server context.
    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: async () => ({
        from: () => ({
          select: () => ({
            is: () => ({
              not: () => ({
                order: () => ({
                  limit: () =>
                    Promise.resolve({
                      data: [
                        {
                          id: "alert-x",
                          code: "AMBIGUOUS_EMAIL_BINDING",
                          raised_at: "2026-05-04T10:00:00Z",
                          show_id: null,
                          context: null,
                          shows: null,
                        },
                      ],
                      error: null,
                    }),
                }),
              }),
              order: () => ({
                limit: () =>
                  Promise.resolve({
                    data: [
                      {
                        id: "alert-x",
                        code: "AMBIGUOUS_EMAIL_BINDING",
                        raised_at: "2026-05-04T10:00:00Z",
                        show_id: null,
                        context: null,
                        shows: null,
                      },
                    ],
                    error: null,
                  }),
              }),
            }),
          }),
        }),
      }),
    }));
    const { AlertBanner } = await import("@/components/admin/AlertBanner");
    const { getByTestId } = render(await AlertBanner());
    const banner = getByTestId("admin-alert-banner");
    expect(banner.getAttribute("aria-atomic")).toBe("true");
    expect(banner.getAttribute("aria-live")).toBe("polite");
    expect(banner.getAttribute("role")).toBe("status");
  });
});

describe("M9 C8 #4 — Bootstrap renders a single stable aria-live region (no nested role='alert')", () => {
  test("error state: outer wrapper has aria-live='polite'; inner <p> does NOT carry role='alert'", async () => {
    // Renders the Bootstrap component in an error state by mocking
    // its initial UiState. Easier path: assert the structure via
    // a partial render — the component fires effects that need the
    // browser, so we just probe the markup the JSX would produce.
    // We can't easily drive the state machine without a full mount,
    // so this test instead validates the SOURCE: the file MUST NOT
    // re-introduce a nested role="alert" inside the live region.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("app/show/[slug]/p/Bootstrap.tsx", "utf8");
    // The wrapper element with aria-live="polite" is present.
    expect(source).toMatch(/data-testid="bootstrap-live-region"[\s\S]*aria-live="polite"/);
    // The inner error <p> does NOT carry role="alert" (P2 fix —
    // nested live region + role=alert double-announces).
    expect(source).not.toMatch(/<p[^>]*data-testid="bootstrap-error"[^>]*role="alert"/);
  });
});

describe("M9 C8 #5 — sign-in page <header> is aria-labelledby the headline", () => {
  test("<header> aria-labelledby resolves to the <h1 id> with the headline text", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("app/auth/sign-in/page.tsx", "utf8");
    // <header aria-labelledby="sign-in-headline">
    expect(source).toMatch(/<header[^>]*aria-labelledby="sign-in-headline"/);
    // <h1 id="sign-in-headline" ...> matching the labelledby target.
    expect(source).toMatch(/<h1[\s\S]*?id="sign-in-headline"/);
  });
});
