import type { Page } from "@playwright/test";

/** The marker a fault branch carries. Deliberately NOT `data-degraded`. */
export const RENDER_FAULT_ATTRIBUTE = "data-render-fault";

/** What an empty attribute value reports, per spec section 4.5. */
export const UNSPECIFIED_REASON = "(unspecified)";

/**
 * Report every `data-render-fault` marker inside the subtree the gate captures.
 *
 * `rootSelector` mirrors the manifest entry's `captureSelector`, which is
 * optional — when it is absent the capture screenshots the full page, so the
 * subtree is the document. That is a legitimate case and distinct from a root
 * that is PRESENT but resolves to nothing, which throws: "no root" and "clean
 * root" must never be one answer, because the replacement-class fault this
 * instrument exists for produces exactly the first while looking like the
 * second.
 *
 * Scope matters in both directions. A detector scoped to the document fires on
 * chrome the gate never captures; one scoped too narrowly misses the card. The
 * root itself is in scope — a branch that replaces the captured element marks
 * that element, not a descendant of it.
 *
 * `data-degraded` is untouched by design: it is a live product state on the
 * crew hero, and a healthy capture renders it every run.
 */
export async function detectRenderFaults(page: Page, rootSelector?: string): Promise<string[]> {
  if (rootSelector !== undefined) {
    const count = await page.locator(rootSelector).count();
    if (count === 0) {
      throw new Error(
        `render-fault scan root ${rootSelector} matched no element; ` +
          "a root that is absent is not a clean root",
      );
    }
  }

  return await page.evaluate(
    ({ selector, attribute, unspecified }) => {
      const root: ParentNode | null =
        selector === null ? document : document.querySelector(selector);
      if (root === null) return [];

      const marked: Element[] = [...root.querySelectorAll(`[${attribute}]`)];
      // A replacement branch marks the captured element itself, so the root is
      // in scope; querySelectorAll only ever returns descendants.
      if (root instanceof Element && root.hasAttribute(attribute)) marked.unshift(root);

      return marked.map((element) => {
        const value = element.getAttribute(attribute) ?? "";
        return value === "" ? unspecified : value;
      });
    },
    {
      selector: rootSelector ?? null,
      attribute: RENDER_FAULT_ATTRIBUTE,
      unspecified: UNSPECIFIED_REASON,
    },
  );
}
