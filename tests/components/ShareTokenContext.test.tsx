// @vitest-environment jsdom
/**
 * tests/components/ShareTokenContext.test.tsx
 *
 * Pins the monotonic-epoch gate (spec §3.2 / §6.1): the client token cache
 * accepts an update iff its epoch >= the held epoch, so no ordering of server
 * refreshes / rotations can revert a copy surface to a dead token.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ShareTokenProvider, useShareToken } from "@/app/admin/show/[slug]/ShareTokenContext";

function Probe() {
  const { token, applyRotated } = useShareToken();
  return (
    <>
      <span data-testid="tok">{token ?? "∅"}</span>
      <button onClick={() => applyRotated("NEW", 6)}>rot</button>
    </>
  );
}

function P(props: { initialToken: string | null; initialEpoch: number }) {
  return (
    <ShareTokenProvider {...props}>
      <Probe />
    </ShareTokenProvider>
  );
}

const tok = () => screen.getByTestId("tok").textContent;

afterEach(cleanup);

describe("ShareTokenProvider epoch gate", () => {
  test("applyRotated updates the token", () => {
    render(<P initialToken="OLD" initialEpoch={5} />);
    fireEvent.click(screen.getByText("rot"));
    expect(tok()).toBe("NEW");
  });

  test("stale refresh (lower epoch) is rejected after a rotate, any arrival order", () => {
    const { rerender } = render(<P initialToken="OLD" initialEpoch={5} />);
    fireEvent.click(screen.getByText("rot")); // {NEW, 6}
    rerender(<P initialToken="OLD" initialEpoch={5} />); // stale refresh lands late
    expect(tok()).toBe("NEW");
    rerender(<P initialToken="NEW" initialEpoch={6} />); // the rotate's own refresh echo
    rerender(<P initialToken="OLD" initialEpoch={5} />); // stale AFTER the echo
    expect(tok()).toBe("NEW");
  });

  test("newer epoch is accepted (external rotation picked up on refresh)", () => {
    const { rerender } = render(<P initialToken="OLD" initialEpoch={5} />);
    rerender(<P initialToken="NEW2" initialEpoch={7} />);
    expect(tok()).toBe("NEW2");
  });

  test("transient null at the same epoch after a rotate keeps the token", () => {
    const { rerender } = render(<P initialToken="OLD" initialEpoch={5} />);
    fireEvent.click(screen.getByText("rot")); // {NEW, 6}
    rerender(<P initialToken={null} initialEpoch={6} />); // token-read fault, same epoch
    expect(tok()).toBe("NEW");
  });

  test("null at a higher epoch fails closed", () => {
    const { rerender } = render(<P initialToken="TOK" initialEpoch={5} />);
    rerender(<P initialToken={null} initialEpoch={6} />);
    expect(tok()).toBe("∅");
  });

  test("lifecycle archive→republish accepts the re-rotated token", () => {
    const { rerender } = render(<P initialToken="OLD" initialEpoch={5} />);
    fireEvent.click(screen.getByText("rot")); // {NEW, 6}
    rerender(<P initialToken={null} initialEpoch={7} />); // archived (token rotated, hidden)
    rerender(<P initialToken="T3" initialEpoch={8} />); // re-published, lifecycle-rotated
    expect(tok()).toBe("T3");
  });

  test("cross-show key remount resets state (a lower epoch on show B is fine)", () => {
    const { rerender } = render(
      <ShareTokenProvider key="A" initialToken="TA" initialEpoch={5}>
        <Probe />
      </ShareTokenProvider>,
    );
    expect(tok()).toBe("TA");
    rerender(
      <ShareTokenProvider key="B" initialToken="TB" initialEpoch={1}>
        <Probe />
      </ShareTokenProvider>,
    );
    expect(tok()).toBe("TB");
  });

  test("useShareToken outside a provider throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/within ShareTokenProvider/);
    spy.mockRestore();
  });
});
