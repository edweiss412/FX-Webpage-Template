// The census's browser-side DOM walk, extracted so it can be REGRESSION TESTED
// rather than only exercised through 32 live admin routes.
//
// It lived inline in `font-rendering-census.spec.ts` and shipped a defect that
// only mobile-safari could reach (below). A copy of the walk in a test would
// have proven nothing about the shipped one -- both the census and
// `censusWalkShadow.spec.ts` now call THIS function, so a regression in it
// fails a fast, deterministic test instead of hiding until the browser that
// happens to build a shadow root runs the suite.
//
// NO TEST-FRAMEWORK IMPORT MAY EVER ENTER THIS FILE: it is serialized into the
// page by `page.evaluate`, so it must be self-contained and free of anything
// that does not survive the boundary.

/** One text-bearing element or pseudo-element, and the family it resolved to. */
export interface CensusFinding {
  readonly tag: string;
  readonly family: string;
  readonly kind: string;
  readonly testid: string;
  /**
   * Which of the caller's structural selectors this element matches.
   *
   * Evaluated IN THE PAGE, because that is the only place `Element.matches`
   * exists — findings cross the boundary as plain data, so a selector the
   * Node side tried to apply afterwards could only ever compare strings. The
   * mono manifest documents "a data-testid, or a role/name pair rendered as a
   * selector"; without this the second half was unimplemented, and the matcher
   * silently fell back to exact-testid or tag-name equality.
   */
  readonly matched: string[];
}

/**
 * Every text-bearing element and content-bearing pseudo in the document,
 * crossing open shadow boundaries.
 *
 * THE BUG THIS SIGNATURE NOW CARRIES IN ITS BODY. `createTreeWalker`'s
 * `currentNode` starts AT the root, and `SHOW_ELEMENT` filters only what
 * `nextNode()` RETURNS -- never the starting node. Reading the root as an
 * Element is right for `document.body` and wrong for a shadow root, which is a
 * DocumentFragment with no `getAttribute`. The census threw
 * `el.getAttribute is not a function` on every admin route under mobile-safari
 * and passed under chromium, because only WebKit built a shadow host on those
 * pages. Local green, CI red -- the class this repo has been bitten by before.
 */
export function collectFontFindings({
  cannotHost,
  pseudos,
  selectors = [],
}: {
  cannotHost: string;
  pseudos: string[];
  selectors?: string[];
}): CensusFinding[] {
  const out: CensusFinding[] = [];

  const walkRoot = (root: Node): void => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    // Start at the root only when the root IS an element; otherwise take the
    // first node the filter actually vetted.
    let n: Node | null = root.nodeType === Node.ELEMENT_NODE ? root : w.nextNode();
    for (; n; n = w.nextNode()) {
      const el = n as HTMLElement;
      if (el.offsetParent === null && el.tagName !== "BODY") continue;
      const hasText = Array.from(el.childNodes).some(
        (c) => c.nodeType === 3 && (c.textContent ?? "").trim() !== "",
      );
      const testid = el.getAttribute("data-testid") ?? "";
      const matched = selectors.filter((sel) => {
        try {
          return el.matches(sel);
        } catch {
          return false; // an unparseable selector is the manifest's problem, not a crash here
        }
      });
      if (hasText) {
        out.push({
          tag: el.tagName,
          family: getComputedStyle(el).fontFamily,
          kind: el.matches(cannotHost) ? "computed-only" : "probe-hostable",
          testid,
          matched,
        });
      }
      // Pseudo-elements cannot host a child probe at all; the demonstrated
      // escape is ::placeholder { font-family: <other> }, which no child probe
      // anywhere in the document can see.
      for (const pseudo of pseudos) {
        const cs = getComputedStyle(el, pseudo);
        if (cs.content && cs.content !== "none" && cs.content !== "normal") {
          out.push({
            tag: `${el.tagName}${pseudo}`,
            family: cs.fontFamily,
            kind: "pseudo",
            testid,
            matched,
          });
        }
      }
      if (el.shadowRoot) walkRoot(el.shadowRoot);
    }
  };

  walkRoot(document.body);
  return out;
}
