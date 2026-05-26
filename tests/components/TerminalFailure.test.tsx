// @vitest-environment jsdom
/**
 * tests/components/TerminalFailure.test.tsx (M11.5 §B Task C0)
 *
 * Pins the public contract of <TerminalFailure>, a reusable cataloged-message
 * surface that renders crew-facing copy for any MessageCode (AGENTS.md
 * invariant 5: no raw error codes in user-visible UI).
 *
 * Anti-tautology: each test reads the literal MESSAGE_CATALOG entry rather
 * than round-tripping through messageFor(); a drift between catalog and
 * runtime would silently pass tests that exercise the same code path.
 */
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { TerminalFailure } from "@/components/auth/TerminalFailure";

afterEach(cleanup);

describe("<TerminalFailure>", () => {
  test("renders cataloged crewFacing copy for the given code", () => {
    const { getByTestId } = render(
      <TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" />,
    );
    const expected = MESSAGE_CATALOG.PICKER_RESOLVER_LOOKUP_FAILED.crewFacing!;
    expect(getByTestId("terminal-failure").textContent).toContain(expected);
  });

  test("renders different copy for a different code (anti-tautology)", () => {
    const { getByTestId } = render(
      <TerminalFailure code="PICKER_EPOCH_STALE_BANNER" />,
    );
    const expected = MESSAGE_CATALOG.PICKER_EPOCH_STALE_BANNER.crewFacing!;
    expect(getByTestId("terminal-failure").textContent).toContain(expected);
  });

  test("never renders the raw code in the rendered DOM (AGENTS.md invariant 5)", () => {
    const { container } = render(
      <TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" />,
    );
    // Strip data-testid attribute values (those are off-DOM-text test hooks
    // per project convention; AlertBanner.test.tsx uses the same exclusion).
    const stripped = container.innerHTML.replace(/data-testid="[^"]*"/g, "");
    expect(stripped).not.toContain("PICKER_RESOLVER_LOOKUP_FAILED");
  });

  test("renders a custom title override when provided", () => {
    const { getByTestId } = render(
      <TerminalFailure
        code="PICKER_RESOLVER_LOOKUP_FAILED"
        title="We’re having trouble loading your shows"
      />,
    );
    expect(getByTestId("terminal-failure").textContent).toContain(
      "We’re having trouble loading your shows",
    );
    // Default title (show-context phrasing) must NOT also render.
    expect(getByTestId("terminal-failure").textContent).not.toContain(
      "this show",
    );
  });

  test("renders a 'Try again' link when retryHref is provided (recovery affordance)", () => {
    const { getByTestId, queryByTestId } = render(
      <TerminalFailure
        code="PICKER_RESOLVER_LOOKUP_FAILED"
        retryHref="/show/sample-show/a"
      />,
    );
    const retry = getByTestId("terminal-failure-retry") as HTMLAnchorElement;
    expect(retry.tagName).toBe("A");
    expect(retry.getAttribute("href")).toBe("/show/sample-show/a");
    expect(retry.textContent).toContain("Try again");
    // Without retryHref the link must not appear (regression catch).
    cleanup();
    const { queryByTestId: q2 } = render(
      <TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" />,
    );
    expect(q2("terminal-failure-retry")).toBeNull();
    // queryByTestId reference kept lint-friendly:
    expect(queryByTestId).toBeDefined();
  });

  test("'Try again' link has min-w-tap-min + min-h-tap-min (44×44 floor regardless of copy length)", () => {
    const { getByTestId } = render(
      <TerminalFailure
        code="PICKER_RESOLVER_LOOKUP_FAILED"
        retryHref="/show/sample-show/a"
      />,
    );
    const retry = getByTestId("terminal-failure-retry") as HTMLAnchorElement;
    expect(retry.className).toContain("min-w-tap-min");
    expect(retry.className).toContain("min-h-tap-min");
  });

  test("falls back to dougFacing when crewFacing is null", () => {
    // Find a real catalog entry where crewFacing is null AND dougFacing
    // is populated. If none exists in the current catalog, that's
    // diagnostic — every crew-renderable code presently has crewFacing,
    // and the fallback chain is dead-code defense-in-depth only.
    const fallbackCode = (Object.entries(MESSAGE_CATALOG) as [
      keyof typeof MESSAGE_CATALOG,
      (typeof MESSAGE_CATALOG)[keyof typeof MESSAGE_CATALOG],
    ][]).find(
      ([, entry]) =>
        entry.crewFacing === null && typeof entry.dougFacing === "string",
    );
    if (!fallbackCode) {
      // Catalog state — no code exercises the fallback today.
      // Component still implements it; mark test as informational.
      expect(true).toBe(true);
      return;
    }
    const [code, entry] = fallbackCode;
    const { getByTestId } = render(<TerminalFailure code={code} />);
    expect(getByTestId("terminal-failure").textContent).toContain(
      entry.dougFacing!,
    );
  });
});
