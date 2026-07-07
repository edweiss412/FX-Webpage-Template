// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/rawUnrecognizedCallout.test.tsx (spec 2026-07-07 §C)
 *
 * The "Content we couldn't read" callout: empty guards, count, escaped-text
 * rendering (no HTML injection), (blank) placeholder, 50-cap, collapse, and
 * reset-to-collapsed on remount (modal reopen).
 */
import { describe, expect, test, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { RawUnrecognizedCallout } from "@/components/admin/wizard/step3ReviewSections";

afterEach(() => cleanup());

describe("RawUnrecognizedCallout", () => {
  test("renders nothing when there is nothing unreadable", () => {
    const { container: c1 } = render(<RawUnrecognizedCallout raw={[]} />);
    expect(c1).toBeEmptyDOMElement();
    const { container: c2 } = render(<RawUnrecognizedCallout raw={null} />);
    expect(c2).toBeEmptyDOMElement();
    const { container: c3 } = render(<RawUnrecognizedCallout raw={undefined} />);
    expect(c3).toBeEmptyDOMElement();
    const { container: c4 } = render(<RawUnrecognizedCallout raw={[{ key: "" }]} />);
    expect(c4).toBeEmptyDOMElement(); // everything dropped
  });

  test("shows the sanitized count in the header and is collapsed by default", () => {
    render(
      <RawUnrecognizedCallout raw={[{ block: "hotels", key: "Room Block", value: "Hilton" }]} />,
    );
    expect(screen.getByText(/Content we couldn't read \(1\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Room Block/)).not.toBeInTheDocument(); // collapsed
  });

  const flat = (el: HTMLElement) => (el.textContent ?? "").replace(/\s+/g, " ");

  test("expands to grouped rows and renders HTML-like text literally (escaped)", () => {
    const hostile = "<script>alert(1)</script>";
    const { container } = render(
      <RawUnrecognizedCallout raw={[{ block: "hotels", key: "Note", value: hostile }]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Content we couldn't read/ }));
    // literal text present in the DOM; no script element was injected/parsed
    expect(container.textContent).toContain(hostile);
    expect(container.querySelector("script")).toBeNull();
  });

  test("renders '(blank)' for an empty value", () => {
    const { container } = render(
      <RawUnrecognizedCallout raw={[{ block: "b", key: "K", value: "" }]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Content we couldn't read/ }));
    expect(flat(container)).toContain("K | (blank)");
  });

  test("caps at 50 and shows a '+N more not shown' line", () => {
    const raw = Array.from({ length: 60 }, (_, i) => ({ block: "b", key: `k${i}`, value: "v" }));
    const { container } = render(<RawUnrecognizedCallout raw={raw} />);
    expect(flat(container)).toContain("Content we couldn't read (60)");
    fireEvent.click(screen.getByRole("button", { name: /Content we couldn't read/ }));
    expect(flat(container)).toContain("+10 more not shown");
  });

  test("collapses when raw changes in place (row swap without remount)", () => {
    const rawA = [{ block: "b", key: "AKEY", value: "AV" }];
    const rawB = [{ block: "b", key: "BKEY", value: "BV" }];
    const { container, rerender } = render(<RawUnrecognizedCallout raw={rawA} />);
    fireEvent.click(screen.getByRole("button", { name: /Content we couldn't read/ }));
    expect(flat(container)).toContain("AKEY | AV");
    rerender(<RawUnrecognizedCallout raw={rawB} />); // same instance, new content
    expect(flat(container)).not.toContain("BKEY | BV"); // collapsed for the new row
  });

  test("resets to collapsed when remounted (modal reopen)", () => {
    const raw = [{ block: "b", key: "K", value: "V" }];
    const first = render(<RawUnrecognizedCallout raw={raw} />);
    fireEvent.click(screen.getByRole("button", { name: /Content we couldn't read/ }));
    expect(flat(first.container)).toContain("K | V");
    first.unmount();
    const second = render(<RawUnrecognizedCallout raw={raw} />); // fresh mount = reopen
    expect(flat(second.container)).not.toContain("K | V"); // collapsed again
  });
});
