// @vitest-environment jsdom
/**
 * Unit tests for the shared AccentButton atom (M5-D7).
 *
 * The accent-button chrome had drifted across ~8 admin call sites
 * (ResolveAlertButton, PendingPanelRetryButton, ReSyncButton,
 * PublishShowButton, RunFinalCASButton, ResumeFinalizeButton,
 * FinalizeButton, StagedReviewCard). M5-D7 extracts the canonical
 * composition into one atom so the chrome can't re-drift; a structural
 * meta-test (tests/styles/accent-button-atom.test.ts) bans raw
 * compositions in the migrated files outside the atom.
 *
 * These tests pin the atom's contract:
 *   - the canonical shared chrome is always emitted;
 *   - size / fontWeight / ringOffset / inline / selfStart / shadow /
 *     minWidthTap variant props reproduce each migrated site exactly;
 *   - native button props (type, onClick, disabled, aria-busy,
 *     data-testid, children) pass through unchanged;
 *   - the className escape hatch is appended last.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { AccentButton } from "@/components/shared/AccentButton";

afterEach(() => {
  cleanup();
});

// The non-negotiable chrome every accent button shares (DESIGN.md L33
// — text-accent-text is the foreground designed for bg-accent only).
const CANONICAL_BASE_TOKENS = [
  "rounded-sm",
  "bg-accent",
  "text-accent-text",
  "transition-colors",
  "duration-fast",
  "hover:bg-accent-hover",
  "focus-visible:outline-none",
  "focus-visible:ring-2",
  "focus-visible:ring-focus-ring",
  "focus-visible:ring-offset-2",
];

function classOf(markup: string): string {
  const match = markup.match(/class="([^"]*)"/);
  return match ? match[1] : "";
}

describe("AccentButton — canonical chrome", () => {
  it("always emits the canonical shared accent-button tokens", () => {
    const cls = classOf(renderToStaticMarkup(<AccentButton>Go</AccentButton>));
    for (const token of CANONICAL_BASE_TOKENS) {
      expect(cls, `missing canonical token: ${token}`).toContain(token);
    }
  });

  it("uses ONLY @theme design tokens — no inline arbitrary [..] values", () => {
    const cls = classOf(
      renderToStaticMarkup(
        <AccentButton size="lg" inline selfStart shadow>
          Go
        </AccentButton>,
      ),
    );
    // No square-bracket arbitrary utilities (e.g. px-[12px], tracking-[..]).
    // shadow-(--shadow-tile) uses the arrow CSS-var form, which is a named
    // token reference, not an arbitrary literal — explicitly allowed.
    const arbitrary = cls.match(/\b[\w:-]+\[[^\]]+\]/g) ?? [];
    expect(arbitrary, `arbitrary inline utilities found: ${arbitrary.join(", ")}`).toEqual([]);
  });

  it("emits disabled-state tokens by default", () => {
    const cls = classOf(renderToStaticMarkup(<AccentButton>Go</AccentButton>));
    expect(cls).toContain("disabled:cursor-not-allowed");
    expect(cls).toContain("disabled:opacity-60");
  });
});

describe("AccentButton — variant props", () => {
  it('size="md" (default) emits px-4 py-2 + tap floor', () => {
    const cls = classOf(renderToStaticMarkup(<AccentButton>Go</AccentButton>));
    expect(cls).toContain("min-h-tap-min");
    expect(cls).toContain("px-4");
    expect(cls).toContain("py-2");
  });

  it('size="sm" emits px-4 text-sm (no py)', () => {
    const cls = classOf(renderToStaticMarkup(<AccentButton size="sm">Go</AccentButton>));
    expect(cls).toContain("px-4");
    expect(cls).toContain("text-sm");
    expect(cls).not.toMatch(/\bpy-2\b/);
  });

  it('size="lg" emits px-6 text-base', () => {
    const cls = classOf(renderToStaticMarkup(<AccentButton size="lg">Go</AccentButton>));
    expect(cls).toContain("px-6");
    expect(cls).toContain("text-base");
  });

  it("fontWeight prop toggles medium vs semibold", () => {
    expect(classOf(renderToStaticMarkup(<AccentButton fontWeight="medium">x</AccentButton>))).toContain(
      "font-medium",
    );
    expect(
      classOf(renderToStaticMarkup(<AccentButton fontWeight="semibold">x</AccentButton>)),
    ).toContain("font-semibold");
  });

  it("ringOffset variant emits the matching ring-offset color token", () => {
    expect(classOf(renderToStaticMarkup(<AccentButton ringOffset="bg">x</AccentButton>))).toContain(
      "focus-visible:ring-offset-bg",
    );
    expect(
      classOf(renderToStaticMarkup(<AccentButton ringOffset="warning-bg">x</AccentButton>)),
    ).toContain("focus-visible:ring-offset-warning-bg");
    expect(
      classOf(renderToStaticMarkup(<AccentButton ringOffset="surface-raised">x</AccentButton>)),
    ).toContain("focus-visible:ring-offset-surface-raised");
    // default (no ringOffset prop) emits NO colored offset token.
    const plain = classOf(renderToStaticMarkup(<AccentButton>x</AccentButton>));
    expect(plain).not.toMatch(/focus-visible:ring-offset-(bg|warning-bg|surface-raised|surface)\b/);
  });

  it("inline emits inline-flex centering; default does not", () => {
    expect(classOf(renderToStaticMarkup(<AccentButton inline>x</AccentButton>))).toContain(
      "inline-flex",
    );
    expect(classOf(renderToStaticMarkup(<AccentButton>x</AccentButton>))).not.toContain(
      "inline-flex",
    );
  });

  it("selfStart emits self-start; shadow emits the tile shadow; minWidthTap emits min-w floor", () => {
    expect(classOf(renderToStaticMarkup(<AccentButton selfStart>x</AccentButton>))).toContain(
      "self-start",
    );
    expect(classOf(renderToStaticMarkup(<AccentButton shadow>x</AccentButton>))).toContain(
      "shadow-(--shadow-tile)",
    );
    expect(classOf(renderToStaticMarkup(<AccentButton minWidthTap>x</AccentButton>))).toContain(
      "min-w-tap-min",
    );
    expect(classOf(renderToStaticMarkup(<AccentButton>x</AccentButton>))).not.toContain(
      "min-w-tap-min",
    );
  });
});

describe("AccentButton — native prop pass-through", () => {
  it("forwards children, type, data-testid, disabled, aria-busy", () => {
    render(
      <AccentButton type="submit" data-testid="my-btn" disabled aria-busy>
        Publishing…
      </AccentButton>,
    );
    const btn = screen.getByTestId("my-btn");
    expect(btn).toHaveAttribute("type", "submit");
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(btn).toHaveTextContent("Publishing…");
  });

  it("defaults type to button when unspecified", () => {
    render(<AccentButton data-testid="default-type">x</AccentButton>);
    expect(screen.getByTestId("default-type")).toHaveAttribute("type", "button");
  });

  it("fires onClick", () => {
    const onClick = vi.fn();
    render(
      <AccentButton data-testid="clickable" onClick={onClick}>
        x
      </AccentButton>,
    );
    screen.getByTestId("clickable").click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("appends the className escape hatch after the canonical chrome", () => {
    const cls = classOf(renderToStaticMarkup(<AccentButton className="disabled:hover:bg-accent">x</AccentButton>));
    expect(cls).toContain("bg-accent");
    expect(cls).toContain("disabled:hover:bg-accent");
    // escape hatch must be appended (last), so its tokens win in cascade order.
    expect(cls.trimEnd().endsWith("disabled:hover:bg-accent")).toBe(true);
  });
});
