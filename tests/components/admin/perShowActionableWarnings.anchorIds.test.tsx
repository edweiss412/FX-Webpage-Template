// @vitest-environment jsdom
/**
 * tests/components/admin/perShowActionableWarnings.anchorIds.test.tsx
 * (wizard-review-attention-menu spec §4.4 / §12.19b — Task 5)
 *
 * `anchorIds` is positional: entry i names the anchor for item i. The failure
 * mode this file exists to catch is a MISALIGNMENT that renders — a short,
 * long, or empty-string array quietly stamping the wrong id on a card, so the
 * published menu's jump lands on someone else's warning. Each case asserts the
 * attribute per index, including the indices that must carry NOTHING.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PerShowActionableWarnings } from "@/components/admin/PerShowActionableWarnings";
import { premiseHolds } from "@/tests/_shared/premise";
import type { ParseWarning } from "@/lib/parser/types";

afterEach(cleanup);

const warn = (i: number): ParseWarning => ({
  severity: "warn",
  code: "UNKNOWN_FIELD",
  message: `warning ${i}`,
  blockRef: { kind: "crew" },
});

const ITEMS = [warn(0), warn(1), warn(2)];

function renderWith(anchorIds?: readonly string[]) {
  render(
    <PerShowActionableWarnings
      items={ITEMS}
      driveFileId="DRIVE_X"
      renderItemControls={() => null}
      {...(anchorIds === undefined ? {} : { anchorIds })}
    />,
  );
  const cards = screen.getAllByTestId("per-show-actionable-item");
  premiseHolds("every fixture item rendered", cards.length === ITEMS.length);
  return cards.map((li) => li.getAttribute("data-attention-anchor"));
}

describe("PerShowActionableWarnings anchorIds (spec §4.4)", () => {
  it("absent prop: no card carries the attribute", () => {
    expect(renderWith()).toEqual([null, null, null]);
  });

  it("empty array: no card carries the attribute", () => {
    expect(renderWith([])).toEqual([null, null, null]);
  });

  it("aligned: each card carries its own id, by index", () => {
    expect(renderWith(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("shorter than items: the covered prefix is stamped, the tail carries nothing", () => {
    expect(renderWith(["a", "b"])).toEqual(["a", "b", null]);
  });

  it("longer than items: the surplus is dropped, no extra card appears", () => {
    expect(renderWith(["a", "b", "c", "d"])).toEqual(["a", "b", "c"]);
  });

  it("empty string at an index: that card carries nothing rather than an empty attribute", () => {
    // An empty attribute would match `[data-attention-anchor]` and steal a jump
    // aimed at nothing, which is worse than no attribute at all.
    expect(renderWith(["", "b", ""])).toEqual([null, "b", null]);
  });
});
