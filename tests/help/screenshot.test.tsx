// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Screenshot } from "@/app/help/_components/Screenshot";

afterEach(() => cleanup());

describe("<Screenshot>", () => {
  it("renders a <picture> with light + dark sources at the expected paths", () => {
    const { container } = render(<Screenshot name="dashboard-active-shows" alt="The dashboard." />);
    const picture = container.querySelector("picture");
    expect(picture).not.toBeNull();

    const darkSource = picture!.querySelector("source[media='(prefers-color-scheme: dark)']");
    expect(darkSource).not.toBeNull();
    expect(darkSource!.getAttribute("srcset")).toBe("/help/screenshots/dashboard-active-shows-dark.webp");

    const img = picture!.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe("/help/screenshots/dashboard-active-shows-light.webp");
    expect(img!.getAttribute("alt")).toBe("The dashboard.");
  });

  it("renders an optional caption", () => {
    const { container } = render(
      <Screenshot name="x" alt="Y" caption="Dashboard, mid-show" />,
    );
    expect(container.querySelector("figcaption")?.textContent).toContain("Dashboard, mid-show");
  });

  // r2 fix per D-r1 finding 1: regression guard. If someone reintroduces
  // `key` as the public prop, React would strip it and the rendered src
  // would contain "undefined".
  it("never renders a src/srcset containing the literal 'undefined' (regression guard for reserved-key trap)", () => {
    const { container } = render(<Screenshot name="dashboard-overview" alt="x" />);
    const html = container.innerHTML;
    expect(html).not.toContain("undefined");
  });

  // r4 fix per D-r3 finding 2: empty name must throw, not silently produce
  // `/help/screenshots/-light.webp`. Spec §6.3 documents this as a build-fail.
  it("throws when name prop is empty string (build-fail per spec §6.3)", () => {
    expect(() => render(<Screenshot name="" alt="x" />)).toThrow(/name.*empty/i);
  });

  it("throws when name prop is whitespace-only (defense-in-depth)", () => {
    expect(() => render(<Screenshot name="   " alt="x" />)).toThrow(/name.*empty/i);
  });
});
