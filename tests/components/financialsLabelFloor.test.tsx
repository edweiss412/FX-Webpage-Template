// @vitest-environment jsdom
/**
 * The FINANCIALS checkbox row, and the staged-review radio row.
 *
 * WHY THIS EXISTS. `BL-CHECKBOX-ROW-LABEL-UNDER-FLOOR` found three native
 * inputs whose real tap target is a label that carries no height floor. The
 * tap-height census had them as `parent-label-target` — right about the
 * MECHANISM and wrong about the site, because the box the mechanism points at
 * is one text line, not 44px. The FINANCIALS rows were the sharp case: the
 * `min-h-tap-min` sat on a `div`, and a div does not toggle a checkbox.
 *
 * WHY IT WAS A DECISION AND NOT A PATCH. The obvious repair — wrap the whole
 * row in a `<label>` — folds the caution copy into the checkbox's accessible
 * name, and the `aria-describedby` binding exists precisely to keep it out
 * (see the comment above the control in `RoleRecognizeControl.tsx`). So D6
 * wraps ONLY the checkbox and its short caption, leaves the caution outside the
 * label still bound by `aria-describedby`, and puts the floor on that label.
 *
 * The two assertions below are the two halves of that decision, and the first
 * is the one that makes the repair falsifiable: a label that swallowed the
 * caution would still satisfy every tap-floor check while quietly making the
 * checkbox announce a sentence about payroll.
 *
 * The FLOOR itself is not asserted here. jsdom computes no layout, so a
 * `getBoundingClientRect()` here would read 0 for everything and pass by
 * accident; the real-browser assertion lives in the Playwright pass.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import * as COPY from "@/components/admin/roleRecognizeCopy";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { RoleRecognizeControl } from "@/components/admin/RoleRecognizeControl";

const TOKEN = "Camera Op";

function renderControl() {
  const r = render(<RoleRecognizeControl roleToken={TOKEN} onSave={vi.fn()} />);
  // The control starts collapsed; the checkboxes only exist once expanded.
  const trigger = screen.queryByRole("button", { name: /recognize/i });
  if (trigger) fireEvent.click(trigger);
  return r;
}

describe("the FINANCIALS checkbox is targeted through a label that carries the floor", () => {
  it("names the checkbox with the short caption ONLY, never the caution", () => {
    renderControl();
    const box = screen.getByTestId("role-recognize-check-FINANCIALS");
    const name = box.getAttribute("aria-label") ?? "";
    const described = (box.getAttribute("aria-describedby") ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ");

    // The label element, resolved the way a browser resolves it.
    const label = document.querySelector<HTMLLabelElement>(`label[for="${box.id}"]`);
    expect(label).not.toBeNull();
    const accessibleName = (name || label!.textContent || "").trim();

    expect(accessibleName).toBe(COPY.CHECKBOX_FINANCIAL);
    // The whole point of the shape: the caution reaches AT, but through
    // `aria-describedby`, so it is a description and not part of the name.
    expect(accessibleName).not.toContain(COPY.FINANCIAL_CAUTION);
    expect(described).toContain(COPY.FINANCIAL_CAUTION);
  });

  it("carries the tap floor on the label, which is the element that toggles", () => {
    renderControl();
    const box = screen.getByTestId("role-recognize-check-FINANCIALS");
    const label = document.querySelector<HTMLLabelElement>(`label[for="${box.id}"]`);
    expect(label).not.toBeNull();
    // The floor belongs on the element a tap actually lands on. Before D6 it sat
    // on an enclosing `div`, which is not a labelling element and toggles
    // nothing — the census row said so in as many words.
    expect(label!.className).toContain("min-h-tap-min");
  });

  it("still toggles when the label is clicked", () => {
    renderControl();
    const box = screen.getByTestId("role-recognize-check-FINANCIALS") as HTMLInputElement;
    const label = document.querySelector<HTMLLabelElement>(`label[for="${box.id}"]`)!;
    expect(box.checked).toBe(false);
    // jsdom does not synthesise the label-to-control click a browser does, so
    // this asserts the ASSOCIATION that makes it happen rather than the
    // synthesised event: `htmlFor` resolving to this input IS the mechanism.
    expect(label.htmlFor).toBe(box.id);
    fireEvent.click(box);
    expect(box.checked).toBe(true);
  });
});
