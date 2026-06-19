// @vitest-environment jsdom
/**
 * Unit tests for the Avatar atom (Task 4.13.distill — Finding 2 /
 * Section `people` variant support; mock-fidelity Task 2 — colored 40px).
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { Avatar, deriveInitials } from "@/components/atoms/Avatar";
import { avatarColor } from "@/lib/crew/avatarColor";

afterEach(() => {
  cleanup();
});

describe("deriveInitials", () => {
  test("two-token name yields first+last initials uppercased", () => {
    expect(deriveInitials("John Carleo")).toBe("JC");
    expect(deriveInitials("eric weiss")).toBe("EW");
    expect(deriveInitials("  Calvin   Saller  ")).toBe("CS");
  });

  test("three-token name picks first + last (skips middle)", () => {
    expect(deriveInitials("Mary Anne Smith")).toBe("MS");
  });

  test("single-token name yields one initial", () => {
    expect(deriveInitials("Madonna")).toBe("M");
  });

  test("null / undefined / empty / whitespace-only fallback to '?'", () => {
    expect(deriveInitials(null)).toBe("?");
    expect(deriveInitials(undefined)).toBe("?");
    expect(deriveInitials("")).toBe("?");
    expect(deriveInitials("   ")).toBe("?");
  });
});

describe("Avatar", () => {
  test("renders the derived initials inside the chip", () => {
    const html = renderToStaticMarkup(<Avatar name="John Carleo" />);
    expect(html).toContain("JC");
  });

  test("renders the fallback glyph for nullish names so the row layout stays stable", () => {
    const html = renderToStaticMarkup(<Avatar name={null} />);
    expect(html).toContain("?");
  });

  test("chip is aria-hidden — the row's text already conveys the name", () => {
    const html = renderToStaticMarkup(<Avatar name="John Carleo" />);
    expect(html).toMatch(/aria-hidden="true"/);
  });

  test("chip carries the data-testid='avatar' marker for e2e enumeration", () => {
    const html = renderToStaticMarkup(<Avatar name="John Carleo" />);
    expect(html).toContain('data-testid="avatar"');
  });
});

describe("Avatar — colored (mock fidelity)", () => {
  it("applies the deterministic per-name background color + white initials", () => {
    const { getByTestId } = render(<Avatar name="John Carleo" />);
    const el = getByTestId("avatar");
    expect(el).toHaveStyle({ backgroundColor: avatarColor("John Carleo") });
    expect(el).toHaveClass("text-white");
    expect(el.textContent).toBe("JC");
  });

  it("blank name → slate fallback (#515763) + '?'", () => {
    const { getByTestId } = render(<Avatar name="" />);
    const el = getByTestId("avatar");
    expect(el).toHaveStyle({ backgroundColor: "#515763" });
    expect(el.textContent).toBe("?");
  });

  it("renders at the 40px size (size-10)", () => {
    const { getByTestId } = render(<Avatar name="John Carleo" />);
    expect(getByTestId("avatar")).toHaveClass("size-10");
  });
});
