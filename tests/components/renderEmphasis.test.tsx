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
import { renderCatalogEmphasis, renderEmphasis } from "@/components/messages/renderEmphasis";

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

/**
 * renderCatalogEmphasis: the param-safe entry point (Codex R1 MEDIUM).
 * Emphasis is parsed on the catalog TEMPLATE; parameter values are inserted
 * afterwards as opaque text and byte-preserved. The failure mode pinned: a
 * sheet literally named "Foo *draft*" interpolated into "_<sheet-name>_ is
 * live" used to have its asterisks eaten as markup, which split the outer
 * underscore pair and leaked literal "_" into the visible text.
 */
describe("renderCatalogEmphasis", () => {
  afterEach(() => {
    cleanup();
  });

  function renderTemplate(template: string, params?: Record<string, string>) {
    return render(<p data-testid="subject">{renderCatalogEmphasis(template, params)}</p>);
  }

  test("param value containing paired asterisks is byte-preserved inside the styled wrapper", () => {
    const { getByTestId } = renderTemplate("_<sheet-name>_ is now live for crew.", {
      "sheet-name": "Foo *draft*",
    });
    const node = getByTestId("subject");
    expect(node.querySelector("em")?.textContent).toBe("Foo *draft*");
    expect(node.textContent).toBe("Foo *draft* is now live for crew.");
    // The catalog-authored underscore pair must be styled away, not split.
    expect(node.textContent).not.toContain("_");
  });

  test("param value with paired underscores is byte-preserved, not parsed", () => {
    const { getByTestId } = renderTemplate("*<sheet-name>*: sync stalled.", {
      "sheet-name": "spring _gala_ 2026",
    });
    const node = getByTestId("subject");
    expect(node.querySelector("em")?.textContent).toBe("spring _gala_ 2026");
    expect(node.textContent).toBe("spring _gala_ 2026: sync stalled.");
  });

  test("param value with **bold** markers and a trailing underscore is not parsed", () => {
    const { getByTestId } = renderTemplate("Email <email> is already an admin.", {
      email: "**ops**_@example.com_",
    });
    const node = getByTestId("subject");
    expect(node.textContent).toBe("Email **ops**_@example.com_ is already an admin.");
    expect(node.querySelector("em, strong")).toBeNull();
  });

  test("missing params leave the placeholder token intact (interpolate semantics)", () => {
    const { getByTestId } = renderTemplate("_<sheet-name>_ was edited again.");
    const node = getByTestId("subject");
    expect(node.querySelector("em")?.textContent).toBe("<sheet-name>");
    expect(node.textContent).toBe("<sheet-name> was edited again.");
  });

  test("snake_case param keys satisfy hyphenated placeholders (messageFor parity)", () => {
    const { getByTestId } = renderTemplate("_<sheet-name>_ lost rows.", {
      sheet_name: "RPAS Central",
    });
    expect(getByTestId("subject").textContent).toBe("RPAS Central lost rows.");
  });
});
