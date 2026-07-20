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
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

describe("CompactAlertCard — defaults and message-row structure", () => {
  // Failure mode: explicit-tone tests pass while the DEFAULTS are wrong, so
  // every adapter that omits the props gets a silently different card.
  test("omitted tone defaults to warning (amber skin + glyph)", () => {
    render(<CompactAlertCard message="m" />);
    const card = screen.getByTestId("compact-alert-card");
    expect(card.className).toContain("bg-warning-bg");
    expect(screen.getByTestId("compact-alert-message").textContent).toContain("!");
  });

  test("omitted stripe defaults to review", () => {
    render(<CompactAlertCard message="m" />);
    expect(screen.getByTestId("compact-alert-card").className).toContain("border-l-status-review");
  });

  // The `none` case is what PerShowActionableWarnings depends on: its cards
  // carry no stripe today, and passing "none" must actually suppress it
  // rather than fall through to the review default.
  test("warning tone honors every stripe value including none", () => {
    const { rerender } = render(<CompactAlertCard message="m" tone="warning" stripe="none" />);
    let card = screen.getByTestId("compact-alert-card");
    expect(card.className).not.toContain("border-l-status-review");
    expect(card.className).not.toContain("border-l-status-degraded");
    rerender(<CompactAlertCard message="m" tone="warning" stripe="review" />);
    card = screen.getByTestId("compact-alert-card");
    expect(card.className).toContain("border-l-status-review");
    rerender(<CompactAlertCard message="m" tone="warning" stripe="degraded" />);
    card = screen.getByTestId("compact-alert-card");
    expect(card.className).toContain("border-l-status-degraded");
  });

  // Failure mode: an always-rendered trigger wrapper leaves an empty flex
  // child that eats gap space on every card without help.
  test("absent helpTrigger renders no trigger wrapper element at all", () => {
    render(<CompactAlertCard message={<span>msg</span>} />);
    const row = screen.getByTestId("compact-alert-message");
    // message block only (glyph is a span sibling, so count element children
    // that are wrappers around slot content).
    expect(row.querySelectorAll(":scope > div").length).toBe(1);
  });

  // The glyph is decorative: severity reaches assistive tech through the
  // message text and, on health rows, the weight badge (spec §8).
  test("severity glyph is aria-hidden", () => {
    render(<CompactAlertCard message="m" />);
    const glyph = screen.getByTestId("compact-alert-message").querySelector("span[aria-hidden]");
    expect(glyph).not.toBeNull();
    expect(glyph).toHaveAttribute("aria-hidden", "true");
    expect(glyph!.textContent).toBe("!");
  });
});

describe("CompactAlertCard surfaces — contrast guards (impeccable critique P1-b/P1-c)", () => {
  // Alpha variants of warning-text on the amber wash compute BELOW the WCAG floors,
  // and they are invisible to tests/styles/status-token-contrast.test.ts, which pins
  // the full-strength tokens only. Measured on --color-warning-bg #fff3d6:
  //   text-warning-text       8.79:1  (passes body 4.5:1)
  //   text-warning-text/70    4.01:1  (FAILS body 4.5:1 — and a 10px uppercase
  //                                    micro-label is not WCAG "large text")
  //   border-warning-text/40  ~2.0:1  (FAILS the 3:1 non-text UI floor)
  // A source scan is the practical guard: jsdom loads no CSS, so computed contrast
  // cannot be measured here.
  const SURFACES = [
    "components/admin/CompactAlertCard.tsx",
    "components/admin/compactAlertHelp.tsx",
    "components/admin/review/AttentionBanner.tsx",
    "components/admin/PerShowActionableWarnings.tsx",
  ];

  test.each(SURFACES)("%s uses no sub-threshold warning-text alpha for text or borders", (rel) => {
    const src = readFileSync(join(process.cwd(), rel), "utf8");
    const textAlpha = src.match(/text-warning-text\/\d+/g) ?? [];
    expect(textAlpha, `${rel}: alpha-dimmed warning text fails AA on the amber wash`).toEqual([]);
    // Divider hairlines are decorative and exempt; borders that bound a CONTROL
    // (the help trigger) must clear 3:1, so they carry no alpha.
    const borderAlpha = (src.match(/border-warning-text\/(\d+)/g) ?? []).filter((m) => {
      const pct = Number(m.split("/")[1]);
      return pct > 25; // /20 and /25 are the band/footer dividers
    });
    expect(borderAlpha, `${rel}: control borders must not be alpha-dimmed`).toEqual([]);
  });
});
