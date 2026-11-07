import { within } from "@testing-library/react";
import { expect } from "vitest";

/**
 * A panel card that prints no title: the section's own heading names it (crew panel
 * follow-ups spec §4). The label survives only as the card's hidden search group, so
 * the page's headings and text meet it once, and the card's search entries keep it.
 */
export function expectUntitledPanel(card: Element, label: string): void {
  expect(card.querySelector('[data-slot="panel-card-chip"]')).toBeNull();
  expect(within(card as HTMLElement).queryByRole("heading", { name: label })).toBeNull();
  const group = card.querySelector("[data-search-group]");
  expect(group?.textContent).toBe(label);
  expect(group?.hasAttribute("hidden")).toBe(true);
}
