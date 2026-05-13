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

// Strip JSX block comments + single-line // comments + JSDoc blocks
// from a source string so the structural regexes below only see the
// JSX/TS attributes themselves — not comment references to them.
// Match-anywhere `data-testid="bootstrap-error"` inside a comment
// would otherwise fool the negative-regex check (M9 C8 R2 finding).
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "") // /* … */ blocks (incl. JSDoc)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "") // {/* JSX comments */}
    .replace(/^\s*\/\/.*$/gm, ""); // // line comments
}

describe("M9 C8 #4 — Bootstrap renders a single stable aria-live region (no nested role='alert')", () => {
  // The Bootstrap component is a 'use client' state machine that
  // fires a network request to /api/auth/redeem-link inside an effect.
  // A full jsdom mount would require mocking next/navigation, fetch,
  // window.location.hash, and bootstrapMint — too much wiring for a
  // structural-contract test. Instead we assert source-shape
  // invariants that capture both the positive (wrapper present) and
  // the negative (no nested role=alert) contracts, with attribute-
  // order-independent matching + comment-stripping (R2 improvements).
  test("source: wrapper element carries aria-live='polite' (any attribute order)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = stripComments(readFileSync("app/show/[slug]/p/Bootstrap.tsx", "utf8"));
    // Find the wrapper element by its data-testid; assert aria-live
    // appears anywhere within its opening-tag attribute list.
    const wrapperMatch = source.match(
      /<div\b([\s\S]*?\bdata-testid="bootstrap-live-region"[\s\S]*?)>/,
    );
    expect(wrapperMatch).not.toBeNull();
    const wrapperAttrs = wrapperMatch?.[1] ?? "";
    expect(wrapperAttrs).toContain('aria-live="polite"');
  });

  test("source: bootstrap-error <p> does NOT carry role='alert' (any attribute order)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = stripComments(readFileSync("app/show/[slug]/p/Bootstrap.tsx", "utf8"));
    const errorMatch = source.match(
      /<p\b([\s\S]*?\bdata-testid="bootstrap-error"[\s\S]*?)>/,
    );
    expect(errorMatch).not.toBeNull();
    const errorAttrs = errorMatch?.[1] ?? "";
    // P2 regression guard: nested live region + role=alert double-announces.
    expect(errorAttrs).not.toContain('role="alert"');
  });

  test("source: exactly one aria-live attribute on a JSX element (no double regions)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = stripComments(readFileSync("app/show/[slug]/p/Bootstrap.tsx", "utf8"));
    // Count `aria-live="..."` ONLY when it appears inside a JSX tag
    // (preceded by whitespace, not by a comment-marker like `//` or `*`).
    // A simpler structural filter: split by line and check each line
    // for the attribute pattern; skip lines that are inside JSDoc /
    // line-comments (start with `//` or `*`).
    const attrCount = source
      .split("\n")
      .filter((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) return false;
        return /\baria-live="/.test(line);
      }).length;
    expect(attrCount).toBe(1);
  });
});

describe("M9 C8 #5 — sign-in page <header> is aria-labelledby the headline", () => {
  // The sign-in page is an async Server Component that redirects on
  // valid sessions and reads from a Promise<SearchParams> — full
  // rendering requires extensive mocking. The contract being
  // verified is purely structural (attribute pairing), so a
  // source-shape test with attribute-order-independent matching is
  // sufficient. R2 improvement: also verify the labelledby target
  // appears exactly once as an `id` attribute (proves the pairing
  // is unique and resolvable).
  test("source: <header> aria-labelledby='sign-in-headline' (any attribute order)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = stripComments(readFileSync("app/auth/sign-in/page.tsx", "utf8"));
    // <header> can span multiple lines; use [\s\S]*? to span newlines.
    const headerMatch = source.match(/<header\b([\s\S]*?)>/);
    expect(headerMatch).not.toBeNull();
    const headerAttrs = headerMatch?.[1] ?? "";
    expect(headerAttrs).toContain('aria-labelledby="sign-in-headline"');
  });

  test("source: a single id='sign-in-headline' exists, on a <h1> with the headline text", async () => {
    const { readFileSync } = await import("node:fs");
    const source = stripComments(readFileSync("app/auth/sign-in/page.tsx", "utf8"));
    // Use `\bid="...` so `data-testid="sign-in-headline"` (which
    // contains `id="..."` as a substring of `testid="..."`) does NOT
    // satisfy the regex — \b is the boundary between `d` (word) and
    // `i` (word), so we need `\sid=` or anchor at line start.
    const idMatches = source.match(/(?:^|[\s\t])id="sign-in-headline"/g);
    expect(idMatches).not.toBeNull();
    expect(idMatches?.length ?? 0).toBe(1);
    // The id is on a <h1> element AND the heading text is "Sign in
    // with Google". Multi-line attribute span is allowed.
    expect(source).toMatch(
      /<h1\b[\s\S]*?id="sign-in-headline"[\s\S]*?>[\s\S]*?Sign in with Google[\s\S]*?<\/h1>/,
    );
  });
});
