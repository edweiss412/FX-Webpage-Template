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

/**
 * A cell's strings and its inlineCode values. remark decides both.
 *
 * `text` is EVERY string mdast carries in the cell, not just `text` nodes. An
 * earlier version collected `text` and `inlineCode` only, and therefore DROPPED
 * a link's destination: `[driver](tests/x.test.ts:72)` reduced to `driver`, so a
 * row citing its criterion's pin as an ordinary Markdown link read as citing
 * nothing and `AC_COMMAND_PIN_UNOBSERVED` could never fire on it (whole-diff
 * review round 2 finding 1). Writing a pin as a link is ordinary authoring, well
 * inside the threat fence, so that was a silent miss rather than a documented
 * limit.
 *
 * The repair is NOT a recognizer: every string added here is one remark already
 * parsed, and the arm keeps scanning `text` exactly as before. Reference forms
 * resolve through the document's own `definition` nodes, which is why the caller
 * threads them in. Raw inline HTML contributes its VERBATIM value -- remark does
 * not parse an `<a href>`, and rather than teach this module to, the href is left
 * inside the string the pin scan already reads.
 *
 * `codes` is unchanged and still holds inlineCode only: a URL is not a command,
 * and admitting one there would let a link masquerade as a runnable cell.
 */
function cellView(node: RootContent, defs: ReadonlyMap<string, string>): AcCell {
  let text = "";
  const codes: string[] = [];
  const walk = (n: RootContent): void => {
    if (n.type === "text") text += n.value;
    else if (n.type === "inlineCode") {
      text += n.value;
      codes.push(n.value);
    } else if (n.type === "link" || n.type === "image") {
      text += ` ${n.url} `;
    } else if (n.type === "linkReference" || n.type === "imageReference") {
      text += ` ${defs.get(n.identifier.toLowerCase()) ?? n.identifier} `;
    } else if (n.type === "html") {
      text += ` ${n.value} `;
    }
    // ALT for BOTH image forms. `image` carried its alt and `imageReference` did
    // not, so a pin written as reference-image alt text rendered visibly and was
    // invisible to the scan (round 3 finding 2) -- the same omission one node type
    // over, which is what a class sweep is supposed to catch the first time.
    if ((n.type === "image" || n.type === "imageReference") && n.alt) text += ` ${n.alt} `;
    for (const c of ("children" in n ? n.children : []) as RootContent[]) walk(c);
  };
  walk(node);
  return { text, codes };
}

/**
 * Every `definition` in the document, so reference links resolve to a URL.
 *
 * FIRST definition wins, which is CommonMark's rule for a duplicated identifier.
 * A plain `Map.set` per definition takes the LAST one, and then the arm inspects
 * a different destination than the document RENDERS: a row could visibly cite the
 * required test while the scan read some other URL, which is a silent wrong
 * accept rather than a miss (whole-diff review round 3 finding 1). Duplicated
 * definitions are ordinary authoring, not obfuscation.
 */
function definitionsOf(root: Root): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  const walk = (n: Root | RootContent): void => {
    if (n.type === "definition" && !out.has(n.identifier.toLowerCase())) {
      out.set(n.identifier.toLowerCase(), n.url);
    }
    for (const c of ("children" in n ? n.children : []) as RootContent[]) walk(c);
  };
  walk(root);
  return out;
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
  const defs = definitionsOf(root);
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
          header: header.children.map((c) => cellView(c, defs)),
          rows: rows.map(
            (r): AcRow => ({
              line: r.position?.start.line ?? 0,
              cells: r.children.map((c) => cellView(c, defs)),
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
