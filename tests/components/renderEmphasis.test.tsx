// @vitest-environment jsdom
/**
 * tests/components/renderEmphasis.test.tsx
 *
 * Pins the shared catalog-emphasis renderer used by <ErrorExplainer> and
 * <StaleFooter>. The §12.4 catalog authors copy with Markdown emphasis
 * (`*em*`, `**bold**`, `_em_`); before this helper existed those markers
 * leaked verbatim into user-visible text (crew literally saw
 * "Last synced *2 hours* ago." — StaleFooter rendered the raw string, and
 * the AlertBanner comment claiming "the panel's <ErrorExplainer> renders
 * them styled" was aspirational, not true).
 *
 * Concrete failure modes pinned here:
 *  1. Literal `*` / `**` / `_` markers visible to crew/Doug (the leak).
 *  2. Over-eager matching that mangles the `***` day-restriction token in
 *     CREW_DAY_RESTRICTED copy ("(`***` in the role)" must survive intact).
 *  3. Internal underscores in tokens like (SW-POST_SHOW) being eaten by the
 *     `_em_` pass (same word-boundary contract as stripEmphasis).
 */
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { renderEmphasis } from "@/components/messages/renderEmphasis";

function renderToContainer(text: string) {
  return render(<p data-testid="subject">{renderEmphasis(text)}</p>);
}

describe("renderEmphasis", () => {
  afterEach(() => {
    cleanup();
  });

  test("plain text passes through unchanged", () => {
    const { getByTestId } = renderToContainer("Your email isn't on the crew list.");
    expect(getByTestId("subject").textContent).toBe("Your email isn't on the crew list.");
    expect(getByTestId("subject").querySelector("em, strong")).toBeNull();
  });

  test("*em* renders as <em> with no literal asterisks in text", () => {
    const { getByTestId } = renderToContainer("Last synced *2 hours* ago.");
    const node = getByTestId("subject");
    expect(node.textContent).toBe("Last synced 2 hours ago.");
    expect(node.textContent).not.toContain("*");
    expect(node.querySelector("em")?.textContent).toBe("2 hours");
  });

  test("**bold** renders as <strong> with no literal asterisks in text", () => {
    const { getByTestId } = renderToContainer("**Made a mistake?** Use Undo.");
    const node = getByTestId("subject");
    expect(node.textContent).toBe("Made a mistake? Use Undo.");
    expect(node.querySelector("strong")?.textContent).toBe("Made a mistake?");
  });

  test("word-boundary _em_ renders as <em>", () => {
    const { getByTestId } = renderToContainer("Heads-up: _RPAS Central_ now has _12_ crew rows.");
    const node = getByTestId("subject");
    expect(node.textContent).toBe("Heads-up: RPAS Central now has 12 crew rows.");
    const ems = node.querySelectorAll("em");
    expect(Array.from(ems).map((e) => e.textContent)).toEqual(["RPAS Central", "12"]);
  });

  test("the *** day-restriction token survives untouched", () => {
    const { getByTestId } = renderToContainer("flagged as day-restricted (`***` in the role)");
    const node = getByTestId("subject");
    expect(node.textContent).toBe("flagged as day-restricted (`***` in the role)");
    expect(node.querySelector("em, strong")).toBeNull();
  });

  test("internal underscores in tokens like (SW-POST_SHOW) are left intact", () => {
    const { getByTestId } = renderToContainer("section (SW-POST_SHOW) changed");
    const node = getByTestId("subject");
    expect(node.textContent).toBe("section (SW-POST_SHOW) changed");
    expect(node.querySelector("em")).toBeNull();
  });

  test("mixed bold + em in one string", () => {
    const { getByTestId } = renderToContainer("*RPAS*: stalled. **Check the dashboard.**");
    const node = getByTestId("subject");
    expect(node.textContent).toBe("RPAS: stalled. Check the dashboard.");
    expect(node.querySelector("em")?.textContent).toBe("RPAS");
    expect(node.querySelector("strong")?.textContent).toBe("Check the dashboard.");
  });
});
