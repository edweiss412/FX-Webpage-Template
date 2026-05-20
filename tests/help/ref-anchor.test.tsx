// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RefAnchor } from "@/app/help/_components/RefAnchor";

afterEach(() => cleanup());

describe("<RefAnchor>", () => {
  it("renders an h2 with id={id} by default (Phase E pages use it as section heading)", () => {
    render(<RefAnchor id="REPORT_HORIZON_EXPIRED">Report horizon expired</RefAnchor>);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveAttribute("id", "REPORT_HORIZON_EXPIRED");
    expect(heading).toHaveTextContent("Report horizon expired");
  });

  // r5 fix per D-r4 finding 1: /help/errors lists every catalog code as an h3
  // beneath an h2-shaped page heading. Support optional `as` prop for that case.
  it("renders an h3 when `as='h3'` (used in /help/errors per-code list)", () => {
    render(<RefAnchor id="X" as="h3">X</RefAnchor>);
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading).toHaveAttribute("id", "X");
  });

  it("renders a copy-link affordance with aria-label", () => {
    render(<RefAnchor id="X">Y</RefAnchor>);
    const linkBtn = screen.getByRole("link", { name: /copy link to this section/i });
    expect(linkBtn).toHaveAttribute("href", "#X");
  });

  it("throws when id violates the catalog-code regex (build-time invariant)", () => {
    expect(() => render(<RefAnchor id="bad-id">x</RefAnchor>)).toThrow();
    expect(() => render(<RefAnchor id="123_NUMERIC_LEAD">x</RefAnchor>)).toThrow();
  });
});
