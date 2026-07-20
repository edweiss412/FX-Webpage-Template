// @vitest-environment jsdom
/**
 * tests/components/admin/compactAlertCard.test.tsx
 *
 * CompactAlertCard shell contract (spec 2026-07-20-show-alert-compact §3.1, §5.1).
 *
 * The shell owns band presence and the tone/stripe class map; adapters own
 * "does this slot have anything to say" (§3.1 — a ReactNode that renders
 * nothing is indistinguishable from content at the shell boundary). These
 * tests pin the shell half of that split.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CompactAlertCard } from "@/components/admin/CompactAlertCard";

afterEach(cleanup);

describe("CompactAlertCard — band presence (§5.1)", () => {
  // Failure mode: a band made conditional while its `border-t` divider wrapper
  // stays unconditional, leaving a stray rule across an empty card.
  test.each([
    ["null", null],
    ["undefined", undefined],
    ["false", false as const],
    ["empty string", ""],
  ])("detail band absent when the slot is %s", (_label, value) => {
    render(<CompactAlertCard message="m" detailBand={value} />);
    expect(screen.queryByTestId("compact-alert-detail-band")).toBeNull();
  });

  test.each([
    ["null", null],
    ["undefined", undefined],
    ["false", false as const],
    ["empty string", ""],
  ])("controls band absent when the slot is %s", (_label, value) => {
    render(<CompactAlertCard message="m" controlsBand={value} />);
    expect(screen.queryByTestId("compact-alert-controls-band")).toBeNull();
  });

  test("footer bar absent when BOTH footer slots are absent", () => {
    render(<CompactAlertCard message="m" footerLeft={null} footerRight={undefined} />);
    expect(screen.queryByTestId("compact-alert-footer")).toBeNull();
  });

  test("footer bar renders with only a left cluster", () => {
    render(<CompactAlertCard message="m" footerLeft={<span>left</span>} />);
    expect(screen.getByTestId("compact-alert-footer")).toBeInTheDocument();
    expect(screen.queryByTestId("compact-alert-footer-right")).toBeNull();
  });

  // Failure mode this catches: implementing the bar with `justify-between`.
  // A LONE flex child under justify-between sits at the START edge, so the
  // resolve button would render left-aligned on every auto-clear-free card
  // whose footer has no left cluster (spec §2, R2 finding 2).
  test("footerRight alone is pinned right via ml-auto, never justify-between", () => {
    render(<CompactAlertCard message="m" footerRight={<button type="button">Go</button>} />);
    const bar = screen.getByTestId("compact-alert-footer");
    expect(bar.className).not.toContain("justify-between");
    expect(screen.getByTestId("compact-alert-footer-right").className).toContain("ml-auto");
  });

  test("both clusters render with the right one still carrying ml-auto", () => {
    render(
      <CompactAlertCard
        message="m"
        footerLeft={<span>left</span>}
        footerRight={<button type="button">Go</button>}
      />,
    );
    expect(screen.getByTestId("compact-alert-footer-left")).toBeInTheDocument();
    expect(screen.getByTestId("compact-alert-footer-right").className).toContain("ml-auto");
  });

  // The uniform presence rule (§5.1): only null/undefined/false/"" count as
  // absent. Adapters normalize 0/NaN/[] to null themselves (§5.2); the shell
  // deliberately does NOT special-case them, and this pins that boundary so a
  // future "smarter" emptiness check does not silently swallow a real 0.
  test.each([
    ["zero", 0],
    ["NaN", Number.NaN],
    ["empty array", [] as never],
  ])("detail band RENDERS when the slot is %s (adapter's job to normalize)", (_label, value) => {
    render(<CompactAlertCard message="m" detailBand={value} />);
    expect(screen.getByTestId("compact-alert-detail-band")).toBeInTheDocument();
  });

  test("message row always renders and carries the message", () => {
    render(<CompactAlertCard message={<span>hello card</span>} />);
    expect(screen.getByTestId("compact-alert-message").textContent).toContain("hello card");
  });

  test("help trigger renders inside the message row when supplied, absent otherwise", () => {
    const { rerender } = render(
      <CompactAlertCard message="m" helpTrigger={<button type="button">?</button>} />,
    );
    expect(screen.getByTestId("compact-alert-message").textContent).toContain("?");
    rerender(<CompactAlertCard message="m" />);
    expect(screen.getByTestId("compact-alert-message").textContent).not.toContain("?");
  });
});

describe("CompactAlertCard — tone skins and stripe forcing (§3.1, amendment A5)", () => {
  test("warning tone: amber skin, severity glyph, honors the stripe prop", () => {
    render(<CompactAlertCard message="m" tone="warning" stripe="review" />);
    const card = screen.getByTestId("compact-alert-card");
    expect(card.className).toContain("bg-warning-bg");
    expect(card.className).toContain("border-l-status-review");
    expect(screen.getByTestId("compact-alert-message").textContent).toContain("!");
  });

  test("warning tone: critical alerts get the degraded stripe", () => {
    render(<CompactAlertCard message="m" tone="warning" stripe="degraded" />);
    expect(screen.getByTestId("compact-alert-card").className).toContain(
      "border-l-status-degraded",
    );
  });

  // Failure mode: a tone map that honors a caller's stripe on a non-severity
  // card. Health rows would then be re-skinned by severity, which is exactly
  // what amendment A5 exists to prevent (severity stays on the weight badge).
  test.each([["muted"], ["neutral"]] as const)(
    "%s tone forces stripe none and omits the glyph even when a stripe is passed",
    (tone) => {
      render(<CompactAlertCard message="m" tone={tone} stripe="degraded" />);
      const card = screen.getByTestId("compact-alert-card");
      expect(card.className).not.toContain("border-l-status-degraded");
      expect(card.className).not.toContain("border-l-status-review");
      expect(screen.getByTestId("compact-alert-message").textContent).not.toContain("!");
    },
  );

  test("muted tone uses the sunken surface; neutral uses the plain surface", () => {
    const { rerender } = render(<CompactAlertCard message="m" tone="muted" />);
    expect(screen.getByTestId("compact-alert-card").className).toContain("bg-surface-sunken");
    rerender(<CompactAlertCard message="m" tone="neutral" />);
    const neutral = screen.getByTestId("compact-alert-card").className;
    expect(neutral).toContain("bg-surface");
    expect(neutral).not.toContain("bg-surface-sunken");
  });

  test("neutral and muted dividers drop the amber alpha", () => {
    render(<CompactAlertCard message="m" tone="neutral" detailBand={<span>d</span>} />);
    const band = screen.getByTestId("compact-alert-detail-band");
    expect(band.className).toContain("border-border");
    expect(band.className).not.toContain("warning-text");
  });

  test("className merges onto the root rather than replacing shell classes", () => {
    render(<CompactAlertCard message="m" className="mt-4" />);
    const card = screen.getByTestId("compact-alert-card");
    expect(card.className).toContain("mt-4");
    expect(card.className).toContain("rounded-sm");
  });
});
