// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { CrewUnderRowStack } from "@/components/admin/wizard/step3ReviewSections";
import type { ReactNode } from "react";

// Task 9 (plan §9). The under-row stack disclosure is a native <details> — no
// AnimatePresence, chevron transform only. Source-scan (AnimatePresence has no DOM
// signature) + behavioral checks.

afterEach(cleanup);
const node = (id: string): ReactNode => <div key={id} data-testid={id} />;

describe("CrewUnderRowStack — transition audit", () => {
  test("source-scan: the stack introduces no AnimatePresence / motion in its region", () => {
    const src = readFileSync(
      join(process.cwd(), "components/admin/wizard/step3ReviewSections.tsx"),
      "utf8",
    );
    // Scope to the CrewUnderRowStack function body.
    const start = src.indexOf("export function CrewUnderRowStack");
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf("export function CrewBreakdown", start);
    const region = src.slice(start, end);
    expect(region).not.toMatch(/AnimatePresence/);
    expect(region).not.toMatch(/motion\./);
  });

  test("the disclosure is a native <details> (instant, no animation wrapper)", () => {
    render(<CrewUnderRowStack nodes={[node("a"), node("b"), node("c")]} ckey="k" />);
    const more = screen.getByTestId("crew-warn-more-k");
    expect(more.tagName.toLowerCase()).toBe("details");
    // Closed by default; opening is native (attribute), not a mounted animation.
    expect(more.hasAttribute("open")).toBe(false);
    more.setAttribute("open", "");
    expect(more.querySelector('[data-testid="c"]')).toBeTruthy();
  });

  test("chevron/summary uses transform utility only (no layout-shifting animation)", () => {
    render(<CrewUnderRowStack nodes={[node("a"), node("b"), node("c")]} ckey="k" />);
    const summary = screen.getByTestId("crew-warn-more-k").querySelector("summary");
    expect(summary).toBeTruthy();
    // The disclosure marker is suppressed (custom summary), so no default triangle jump.
    expect(summary!.className).toContain("[&::-webkit-details-marker]:hidden");
  });
});
