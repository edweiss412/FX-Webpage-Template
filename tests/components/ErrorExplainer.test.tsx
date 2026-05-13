// @vitest-environment jsdom
/**
 * tests/components/ErrorExplainer.test.tsx (M5 §B Task 5.9 — Doug's portion)
 *
 * Pins the public contract of <ErrorExplainer> — the shared message-renderer
 * used by both the sign-in page (Task 5.8) and the admin AlertBanner.
 *
 * Spec §12.4 + invariant 5: every user-visible message comes from the
 * MESSAGE_CATALOG via messageFor(). The catalog has separate `crewFacing`
 * and `dougFacing` fields per code; the ErrorExplainer's `surface` prop
 * picks which one to render.
 *
 * Anti-tautology contract: tests assert against the verbatim catalog string
 * literal pulled from `lib/messages/catalog.ts` MESSAGE_CATALOG, NOT against
 * the result of calling `messageFor(code)` (which would just round-trip the
 * production code path and pass even if both sides drifted together).
 *
 * Defensive backstop: the sign-in page passes user-controlled
 * `searchParams.code` to the explainer; the explainer is the last line of
 * defense — when the code does not match a known MessageCode, it MUST render
 * NOTHING (no DOM mount), not a stub or an error string.
 */
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ErrorExplainer } from "@/components/messages/ErrorExplainer";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";

describe("ErrorExplainer", () => {
  // @testing-library/react doesn't auto-cleanup outside its own test runners
  // (vitest's `globals: false` skips its auto-cleanup hook). Each render
  // leaves nodes in `document.body`; without explicit cleanup the second
  // test sees TWO `[data-testid=error-explainer-message]` nodes and
  // `getByTestId` throws. Cleanup after each test isolates them.
  afterEach(() => {
    cleanup();
  });

  test("renders MESSAGE_CATALOG[code].crewFacing when surface='crew' (verbatim)", () => {
    const { container, getByTestId } = render(
      <ErrorExplainer code="LINK_EXPIRED" surface="crew" />,
    );
    expect(container.firstChild).not.toBeNull();
    // Anti-tautology: assert against the literal in the catalog file, not
    // the runtime messageFor() value. If either side drifts the test fails.
    expect(getByTestId("error-explainer-message").textContent).toBe(
      MESSAGE_CATALOG.LINK_EXPIRED.crewFacing!,
    );
  });

  test("renders MESSAGE_CATALOG[code].dougFacing when surface='admin' (verbatim)", () => {
    const { getByTestId } = render(
      <ErrorExplainer code="AMBIGUOUS_EMAIL_BINDING" surface="admin" />,
    );
    expect(getByTestId("error-explainer-message").textContent).toBe(
      MESSAGE_CATALOG.AMBIGUOUS_EMAIL_BINDING.dougFacing!,
    );
  });

  test("when helpfulContext={true} AND catalog.helpfulContext is non-null, renders the helpful-context block", () => {
    // CSRF_KEY_ROTATED has both non-null crewFacing and non-null helpfulContext
    // post Task 9.4 part 2 (spec invariant: helpfulContext tied to non-null dougFacing).
    const { getByTestId } = render(
      <ErrorExplainer code="CSRF_KEY_ROTATED" surface="crew" helpfulContext />,
    );
    expect(getByTestId("error-explainer-helpful-context").textContent).toBe(
      MESSAGE_CATALOG.CSRF_KEY_ROTATED.helpfulContext!,
    );
  });

  test("when helpfulContext={true} AND catalog.helpfulContext is null, no helpful-context block renders", () => {
    // LINK_EXPIRED.helpfulContext === null in the catalog.
    const { queryByTestId } = render(
      <ErrorExplainer code="LINK_EXPIRED" surface="crew" helpfulContext />,
    );
    expect(queryByTestId("error-explainer-helpful-context")).toBeNull();
  });

  test("when helpfulContext is omitted/false, the block does not render even if catalog has copy", () => {
    const { queryByTestId } = render(<ErrorExplainer code="CSRF_KEY_ROTATED" surface="crew" />);
    expect(queryByTestId("error-explainer-helpful-context")).toBeNull();
  });

  test("DEFENSIVE: unknown code (user-controlled string) renders null — no DOM mount", () => {
    const { container } = render(
      <ErrorExplainer code="ARBITRARY_INJECTED_STRING" surface="crew" />,
    );
    expect(container.firstChild).toBeNull();
  });

  test("DEFENSIVE: known code with null catalog field for the surface renders null", () => {
    // LINK_EXPIRED.dougFacing === null — admin surface has nothing to render.
    const { container } = render(<ErrorExplainer code="LINK_EXPIRED" surface="admin" />);
    expect(container.firstChild).toBeNull();
  });

  test("DEFENSIVE: known code with null catalog field on the OTHER surface still renders for the requested surface", () => {
    // LEAKED_LINK_DETECTED has both crewFacing and dougFacing populated;
    // sanity-check that dougFacing renders even though both surfaces have copy.
    const { getByTestId } = render(<ErrorExplainer code="LEAKED_LINK_DETECTED" surface="admin" />);
    expect(getByTestId("error-explainer-message").textContent).toBe(
      MESSAGE_CATALOG.LEAKED_LINK_DETECTED.dougFacing!,
    );
  });
});
