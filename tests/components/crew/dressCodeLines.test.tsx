// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DressCodeLines } from "@/components/crew/DressCodeLines";

afterEach(cleanup);

const CANONICAL =
  "Set/Strike: Black Pants, Black Polo Shirt, Black Footwear\n" +
  "Show: Black Pants, Black Long Sleeve Button Down Shirt, Black Footwear";

describe("DressCodeLines", () => {
  it("renders each phase as a term and its attire as the definition", () => {
    render(<DressCodeLines value={CANONICAL} />);
    // Catches a regression to one flat text block: with no dl there are no terms.
    expect(screen.getAllByRole("term").map((el) => el.textContent)).toEqual(["Set/Strike", "Show"]);
    expect(screen.getAllByRole("definition").map((el) => el.textContent)).toEqual([
      "Black Pants, Black Polo Shirt, Black Footwear",
      "Black Pants, Black Long Sleeve Button Down Shirt, Black Footwear",
    ]);
  });

  it("keeps free text as one paragraph with its line breaks", () => {
    const value = "Business casual\nNo logos";
    const { container } = render(<DressCodeLines value={value} />);
    expect(screen.queryAllByRole("term")).toHaveLength(0);
    const p = container.querySelector("p");
    expect(p?.textContent).toBe(value);
    // jsdom computes no layout; the class is what preserves the "\n" on screen.
    expect(p).toHaveClass("whitespace-pre-line");
  });
});
