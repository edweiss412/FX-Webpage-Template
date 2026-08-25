/**
 * The AC coverage arm's view builder: mdast in, `AcBlocks` out.
 *
 * ADAPTER SIDE on purpose. It takes an mdast `Root`, and even
 * `import type { Root } from "mdast"` is a third-party specifier that the
 * pure core's relative-imports-only guard would otherwise have to exempt.
 * Keeping it here means that guard stays absolute
 * (spec `docs/superpowers/specs/ci/2026-08-25-planlint-ac-command-observability-design.md` §8.3).
 *
 * ONE function, called by both `scripts/spec-lint.ts` and the suites through
 * `tests/specLint/acCoverageView.ts`. Two builders would drift, which is §8.3's
 * own argument one level down.
 */
import type { Root, RootContent } from "mdast";

import type { AcBlocks, AcCell, AcHtmlBlock, AcRow, AcTableBlock } from "../../lib/specLint/types";

/** A cell's rendered text and its inlineCode values. remark decides both. */
function cellView(node: RootContent): AcCell {
  let text = "";
  const codes: string[] = [];
  const walk = (n: RootContent): void => {
    if (n.type === "text") text += n.value;
    else if (n.type === "inlineCode") {
      text += n.value;
      codes.push(n.value);
    }
    for (const c of ("children" in n ? n.children : []) as RootContent[]) walk(c);
  };
  walk(node);
  return { text, codes };
}

/**
 * Every `html` and `table` block, FLATTENED into document order.
 *
 * Flattened, not top-level: a declaration inside a blockquote should still govern
 * the table beside it, and top-level-only iteration was probed binding a
 * declaration PAST a blockquoted table to the next one down. The arm never asks
 * how deep a block sat.
 */
export function blocksFrom(root: Root): AcBlocks {
  const out: (AcHtmlBlock | AcTableBlock)[] = [];
  const walk = (n: Root | RootContent): void => {
    if (n.type === "html") {
      out.push({ kind: "html", line: n.position?.start.line ?? 0, value: n.value });
      return;
    }
    if (n.type === "table") {
      const [header, ...rows] = n.children;
      if (header !== undefined) {
        out.push({
          kind: "table",
          line: n.position?.start.line ?? 0,
          header: header.children.map(cellView),
          rows: rows.map(
            (r): AcRow => ({
              line: r.position?.start.line ?? 0,
              cells: r.children.map(cellView),
            }),
          ),
        });
      }
      return; // a table's children are cells, never blocks we want
    }
    for (const c of ("children" in n ? n.children : []) as RootContent[]) walk(c);
  };
  walk(root);
  return out;
}
