// @vitest-environment jsdom
//
// BL-IDENTITYCHIP-SR-SEPARATOR — the chip reads as one run-on phrase.
//
// `IdentityChip` renders name, an `aria-hidden` middle dot, and role as flat
// siblings of one span. Hiding the punctuation is correct — nobody wants "middle
// dot" spoken — but it leaves the accessible name as "Eric Weiss Lead A2", with
// no boundary between the person and their job. The entry's promotion mechanics
// are the contract: an `aria-label` of "<name>, <role>" on the parent span, so
// the comma supplies the pause the visual separator supplies for sighted users.
//
// ANTI-TAUTOLOGY. The trap here is asserting the aria-label STRING and stopping:
// that passes even if the label sits on a span whose children still contribute
// their own text, which is not how an accessible name works and not what a
// screen reader would read. So the assertions are:
//   1. the computed accessible name of the span, comma included;
//   2. that the VISIBLE text is unchanged, because this is an SR-only fix and a
//      comma appearing on screen would be a visual regression;
//   3. that the dot is still hidden, so the fix does not re-introduce the
//      punctuation it was added to suppress.
// Fixture names deliberately contain a space and a digit-bearing role, matching
// the entry's own example, so a naive join cannot pass by collapsing whitespace.
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { IdentityChip } from "@/components/auth/IdentityChip";

afterEach(cleanup);

const props = { slug: "east-coast", shareToken: "tok", showId: "s1" };

function chipLabelSpan(): HTMLElement {
  // The identity span is the labelled one; scope by testid so the "Not you?"
  // button's own text can never satisfy an assertion meant for the chip.
  const chip = screen.getByTestId("identity-chip");
  const span = chip.querySelector("[data-testid='identity-chip-identity']");
  if (!span) throw new Error("identity span not found");
  return span as HTMLElement;
}

/** What a SIGHTED reader sees: the chip with sr-only nodes removed. */
function visibleText(): string {
  const clone = chipLabelSpan().cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".sr-only").forEach((n) => n.remove());
  return clone.textContent ?? "";
}

it("carries the separator as REAL sr-only text, not a prohibited aria-label", () => {
  // THE MECHANISM IS THE ASSERTION, and that is the whole point of this case.
  //
  // The first version of this fix put `aria-label` on the parent <span>. A <span>
  // with no role maps to `role=generic`, which PROHIBITS aria-label/labelledby
  // (ARIA 1.2; axe-core `aria-prohibited-attr`). Chrome and Safari often honor it
  // anyway, but nothing requires them to, and browse-mode AT frequently does not.
  //
  // It shipped because nothing could catch it: this repo runs no axe gate, and
  // `toHaveAccessibleName` resolves through jsdom's dom-accessibility-api, which
  // does not implement the generic-role prohibition. The test passed on exactly
  // the engines where the label is dropped — a green test over a fix that may
  // never reach a reader.
  //
  // So the assertion is now on the DOM the reader actually gets: a real text node
  // in the accessibility tree. `sr-only` is already the repo's idiom for this
  // (components/layout/Skeleton.tsx:87, components/diagrams/Gallery.tsx:158).
  render(<IdentityChip name="Eric Weiss" role="Lead A2" {...props} />);
  const span = chipLabelSpan();
  // No prohibited attribute anywhere on the chip.
  expect(span).not.toHaveAttribute("aria-label");
  expect(span.querySelector("[aria-label]")).toBeNull();
  // The separator is a real, unhidden element carrying the comma.
  const sep = span.querySelector("[data-testid='identity-chip-sr-separator']");
  expect(sep, "no sr-only separator element").not.toBeNull();
  expect(sep).toHaveClass("sr-only");
  expect(sep).not.toHaveAttribute("aria-hidden");
  expect(sep!.textContent).toBe(", ");
  // And it sits BETWEEN name and role, which is what makes it a separator
  // rather than a comma floating somewhere in the chip.
  const text = span.textContent ?? "";
  expect(text.indexOf("Eric Weiss")).toBeLessThan(text.indexOf(", "));
  expect(text.indexOf(", ")).toBeLessThan(text.indexOf("Lead A2"));
});

it("changes nothing a sighted user sees — the comma is SR-only", () => {
  render(<IdentityChip name="Eric Weiss" role="Lead A2" {...props} />);
  // Computed by REMOVING sr-only nodes, not by reading raw textContent: the
  // separator is real text now, so raw textContent legitimately contains it.
  // Stripping is what actually models the sighted view.
  expect(visibleText()).toBe("Eric Weiss · Lead A2");
  expect(visibleText()).not.toContain(",");
});

it("keeps the middle dot hidden from assistive technology", () => {
  render(<IdentityChip name="Eric Weiss" role="Lead A2" {...props} />);
  const dot = within(chipLabelSpan()).getByText("·", { exact: false });
  expect(dot).toHaveAttribute("aria-hidden", "true");
});

it("separates any name/role pair, not one hardcoded shape", () => {
  render(<IdentityChip name="Dana Ruiz-Okafor" role="A1" {...props} />);
  const text = chipLabelSpan().textContent ?? "";
  expect(text.indexOf("Dana Ruiz-Okafor")).toBeLessThan(text.indexOf(", "));
  expect(text.indexOf(", ")).toBeLessThan(text.indexOf("A1"));
  expect(visibleText()).toBe("Dana Ruiz-Okafor · A1");
});

it("emits NO separator when the role is empty", () => {
  // Partial data reaches this component during a picker round-trip. A trailing
  // ", " would be spoken as a dangling comma — worse than the run-on it fixes.
  render(<IdentityChip name="Eric Weiss" role="" {...props} />);
  expect(chipLabelSpan().querySelector("[data-testid='identity-chip-sr-separator']")).toBeNull();
  expect(chipLabelSpan().textContent).not.toContain(",");
});

it("emits NO separator when the name is empty", () => {
  render(<IdentityChip name="" role="Lead A2" {...props} />);
  expect(chipLabelSpan().querySelector("[data-testid='identity-chip-sr-separator']")).toBeNull();
  expect(chipLabelSpan().textContent).not.toContain(",");
});
