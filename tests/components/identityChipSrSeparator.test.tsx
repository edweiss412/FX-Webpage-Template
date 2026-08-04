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

it("gives the name/role span an accessible name with a comma between the two", () => {
  render(<IdentityChip name="Eric Weiss" role="Lead A2" {...props} />);
  expect(chipLabelSpan()).toHaveAccessibleName("Eric Weiss, Lead A2");
});

it("changes nothing a sighted user sees — the comma is SR-only", () => {
  render(<IdentityChip name="Eric Weiss" role="Lead A2" {...props} />);
  // The visible run keeps the middle dot and gains no comma. Asserted on the
  // span's own textContent, not the chip's, so the button copy cannot mask a
  // change here.
  expect(chipLabelSpan().textContent).toBe("Eric Weiss · Lead A2");
  expect(chipLabelSpan().textContent).not.toContain(",");
});

it("keeps the middle dot hidden from assistive technology", () => {
  render(<IdentityChip name="Eric Weiss" role="Lead A2" {...props} />);
  const dot = within(chipLabelSpan()).getByText("·", { exact: false });
  expect(dot).toHaveAttribute("aria-hidden", "true");
});

it("derives the label from the props rather than hardcoding a shape", () => {
  // A label built by concatenating literals would still pass the case above.
  // A second, structurally different pair cannot be satisfied by the same string.
  render(<IdentityChip name="Dana Ruiz-Okafor" role="A1" {...props} />);
  expect(chipLabelSpan()).toHaveAccessibleName("Dana Ruiz-Okafor, A1");
});

it("does not leave a dangling comma when the role is empty", () => {
  // Partial data reaches this component during a picker round-trip; "Eric Weiss,"
  // is a worse utterance than the run-on it replaces.
  render(<IdentityChip name="Eric Weiss" role="" {...props} />);
  expect(chipLabelSpan()).toHaveAccessibleName("Eric Weiss");
});

it("does not leave a leading comma when the name is empty", () => {
  render(<IdentityChip name="" role="Lead A2" {...props} />);
  expect(chipLabelSpan()).toHaveAccessibleName("Lead A2");
});
