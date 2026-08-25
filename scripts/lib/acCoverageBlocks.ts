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
/**
 * Structural fields that are never authored prose. Everything else is collected.
 *
 * DEFAULT-INCLUDE is the whole point. An enumeration of text-bearing fields was
 * wrong four rounds running -- link destinations (r2), duplicate-definition
 * precedence and `imageReference` alt (r3), then titles on all four title-bearing
 * forms (r4) -- because a list of fields is always one field behind the format.
 * Inverting it closes the class: a string mdast carries in the cell reaches the
 * scan unless it is named here, so a field this module has never heard of is
 * INCLUDED rather than dropped, and the failure mode becomes harmless noise in a
 * pin scan rather than a silent wrong accept.
 */
const STRUCTURAL_FIELDS = new Set(["type", "referenceType", "align", "lang", "meta", "checked"]);

/**
 * A cell's strings and its inlineCode values. remark decides both.
 *
 * `text` is EVERY string mdast carries in the cell, minus the structural fields
 * above. `codes` still holds inlineCode only: a URL or a title is not a command,
 * and admitting one there would let a link masquerade as a runnable cell.
 */
function cellView(node: RootContent, defs: ReadonlyMap<string, DefinitionStrings>): AcCell {
  let text = "";
  const codes: string[] = [];
  const walk = (n: RootContent): void => {
    // `for...in` rather than `Object.entries`, which allocates a pair-array per
    // node. Same default-include semantics, no allocation. It is NOT why the
    // corpus suite needed a larger bound: measured over the 699-document plan
    // corpus, remark's parse is 20578ms and this whole view builder is 223ms, so
    // the walk is 99% parser. Recorded because the tempting story -- "the new
    // collection made it slow" -- is the one the measurement refutes.
    for (const key in n) {
      const value = (n as unknown as Record<string, unknown>)[key];
      if (typeof value !== "string" || value === "" || STRUCTURAL_FIELDS.has(key)) continue;
      // `text`/`inlineCode` values join the flow directly so rendered prose reads
      // as written; every other string is delimited, because a URL abutting the
      // next word would invent a token neither one contains.
      text +=
        n.type === "text" || (n.type === "inlineCode" && key === "value") ? value : ` ${value} `;
    }
    if (n.type === "inlineCode") codes.push(n.value);
    if (n.type === "linkReference" || n.type === "imageReference") {
      const d = defs.get(n.identifier.toLowerCase());
      if (d) text += ` ${d.url} ${d.title ?? ""} `;
    }
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
type DefinitionStrings = { url: string; title: string | null | undefined };

function definitionsOf(root: Root): ReadonlyMap<string, DefinitionStrings> {
  const out = new Map<string, DefinitionStrings>();
  const walk = (n: Root | RootContent): void => {
    if (n.type === "definition" && !out.has(n.identifier.toLowerCase())) {
      // URL and TITLE both: a reference form's pin can live in either (r4).
      out.set(n.identifier.toLowerCase(), { url: n.url, title: n.title });
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
