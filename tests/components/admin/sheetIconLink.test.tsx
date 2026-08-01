// @vitest-environment jsdom
/**
 * tests/components/admin/sheetIconLink.test.tsx
 *
 * SheetIconLink unit contract (spec 2026-07-26-sheet-icon-link-affordance-class §3/§7.6):
 *   - aria builder: subject form / whitespace-only fallback / .trim() applied.
 *   - hardening: <a target="_blank" rel="noopener noreferrer">, testid passthrough.
 *   - icon: aria-hidden svg, size-4, contributes nothing to the accessible name.
 *   - colour/motion contract via WHOLE-TOKEN-SET EQUALITY: the rendered class
 *     token set equals exactly base ∪ ring-offset variant ∪ passed className
 *     tokens. The expected set is a literal HERE, never imported from the
 *     component — any smuggled utility (a transform under any variant stack,
 *     text-text-subtle, a new size) fails by construction (spec §7.6; the
 *     ban-pattern form was killed in review r2 because negative/arbitrary/
 *     stacked-variant transform spellings slip prefix regexes).
 *   - className={null} is inert (the `?? ""` append — spec §3 guard table).
 */
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { SheetIconLink } from "@/components/admin/SheetIconLink";

afterEach(cleanup);

const HREF = "https://docs.google.com/spreadsheets/d/test-dfid/edit#gid=0";

/** Spec §3 base class literal, token-by-token. A test-side literal by design. */
const BASE_TOKENS = [
  "relative",
  "inline-grid",
  "size-5",
  "shrink-0",
  "place-items-center",
  "rounded-sm",
  "text-text",
  "transition-colors",
  "duration-fast",
  "before:absolute",
  "before:-inset-y-3",
  "before:-left-2.5",
  "before:-right-3.5",
  "before:content-['']",
  "hover:text-text-strong",
  "active:text-text-strong",
  "focus-visible:outline-none",
  "focus-visible:ring-2",
  "focus-visible:ring-focus-ring",
  "focus-visible:ring-offset-2",
];

function renderLink(overrides: Partial<React.ComponentProps<typeof SheetIconLink>> = {}) {
  render(
    <SheetIconLink
      href={HREF}
      subjectLabel="Rooms & scope"
      testId="test-sheetlink"
      ringOffset="bg"
      {...overrides}
    />,
  );
  return screen.getByTestId(overrides.testId ?? "test-sheetlink") as HTMLAnchorElement;
}

function tokensOf(el: HTMLElement): Set<string> {
  return new Set(el.className.split(/\s+/).filter(Boolean));
}

describe("SheetIconLink aria builder", () => {
  it("names the subject and the destination, announcing the new tab", () => {
    const link = renderLink();
    expect(link).toHaveAccessibleName(
      "Open the source sheet for Rooms & scope in Google Sheets (opens in a new tab)",
    );
  });

  it("trims the subject before interpolating", () => {
    const link = renderLink({ subjectLabel: "  Contacts  " });
    expect(link).toHaveAccessibleName(
      "Open the source sheet for Contacts in Google Sheets (opens in a new tab)",
    );
  });

  it("whitespace-only subject falls back to the no-subject phrasing (no dangling 'for')", () => {
    const link = renderLink({ subjectLabel: "   " });
    expect(link).toHaveAccessibleName(
      "Open the source sheet in Google Sheets (opens in a new tab)",
    );
  });

  it("the icon is aria-hidden and adds no icon noise to the name", () => {
    const link = renderLink();
    const svg = link.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("aria-hidden")).toBe("true");
    expect(svg!.classList.contains("size-4")).toBe(true);
    // The accessible name is exactly the label — nothing appended by children.
    expect(link).toHaveAccessibleName(
      "Open the source sheet for Rooms & scope in Google Sheets (opens in a new tab)",
    );
  });
});

describe("SheetIconLink hardening + passthrough", () => {
  it("is an <a> with target=_blank and hardened rel, href and testid passed through", () => {
    const link = renderLink({ testId: "custom-id" });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe(HREF);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });
});

/** Backdrop-matched variant literals (audit P2: bg-surface-sunken over bg-bg
 *  measures 1.03:1 dark — invisible; each backdrop's wash is a token one REAL
 *  step away from itself, alongside its container-matched ring offset. The
 *  repo defines no `dark:` variant, so per-theme splits are impossible —
 *  bg-surface is the bg-site wash that steps up in dark, where the defect
 *  was measured). */
const BG_VARIANT_TOKENS = ["focus-visible:ring-offset-bg", "hover:bg-surface", "active:bg-surface"];
const SURFACE_VARIANT_TOKENS = [
  "focus-visible:ring-offset-surface",
  "hover:bg-surface-sunken",
  "active:bg-surface-sunken",
];

describe("SheetIconLink class token set (spec §7.6 set-equality)", () => {
  it("ringOffset=bg renders EXACTLY base + the bg variant literals", () => {
    const link = renderLink({ ringOffset: "bg" });
    expect(tokensOf(link)).toEqual(new Set([...BASE_TOKENS, ...BG_VARIANT_TOKENS]));
  });

  it("ringOffset=surface renders EXACTLY base + the surface variant literals", () => {
    const link = renderLink({ ringOffset: "surface" });
    expect(tokensOf(link)).toEqual(new Set([...BASE_TOKENS, ...SURFACE_VARIANT_TOKENS]));
  });

  it("positional className tokens append, nothing else changes", () => {
    const link = renderLink({ className: "sm:order-1 sm:ml-0.5" });
    expect(tokensOf(link)).toEqual(
      new Set([...BASE_TOKENS, ...BG_VARIANT_TOKENS, "sm:order-1", "sm:ml-0.5"]),
    );
  });

  it("a runtime null className is inert — no 'null' token, base set intact", () => {
    const link = renderLink({ className: null as unknown as string });
    expect(tokensOf(link)).toEqual(new Set([...BASE_TOKENS, ...BG_VARIANT_TOKENS]));
  });
});
