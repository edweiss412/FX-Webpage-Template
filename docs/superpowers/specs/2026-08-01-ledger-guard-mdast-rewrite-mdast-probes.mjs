// Plan-time empirical probes of remark@15 + remark-gfm@4 mdast behavior.
// Each assertion backs a factual claim in the spec (§2/§3/§7) or plan.
import { remark } from "remark";
import remarkGfm from "remark-gfm";

const parse = (md) => remark().use(remarkGfm).parse(md);
const types = (node, out = []) => {
  out.push(node.type);
  for (const c of node.children ?? []) types(c, out);
  return out;
};
const show = (label, md) => {
  const t = parse(md);
  console.log(`--- ${label}\n${JSON.stringify(t.children, (k, v) => (k === "position" ? undefined : v)).slice(0, 400)}`);
};

// 1. Entity references cook in text nodes?
show("entity C&#76;OSED", "C&#76;OSED");
// 2. delete node for ~~CLOSED~~ (GFM)
show("strikethrough", "~~CLOSED~~ id");
// 3. heading with struck id
show("struck heading", "### ~~SOME-ID~~ — text");
// 4. setext heading
show("setext", "BL-X — CLOSED\n---");
// 5. 3-space indented heading vs 4-space (code)
show("3-space heading", "   ## BL-Y — DONE");
show("4-space code", "    ## BL-Z — DONE");
// 6. blockquote-nested heading — top-level child type?
show("bq heading", "> ## BL-Q — CLOSED");
// 7. html comment
show("html comment", "open <!-- Status: CLOSED --> entry");
// 8. table cell
show("table", "| Status |\n| --- |\n| CLOSED |");
// 9. link text
show("link", "[CLOSED](http://x)");
// 10. soft break inside paragraph — one paragraph, text with \n?
show("softbreak", "**Status:** OPEN\nsecond line");
// 11. task-list checkbox
show("tasklist", "- [x] **Status:** CLOSED");
// 12. autolink literal (GFM) — bare URL containing CLOSED
show("autolink", "see https://x.test/CLOSED-thing now");
// 13. strong with nested emphasis label
show("nested label", "**_Status_**: CLOSED");
// 14. lazy continuation blockquote
show("lazy bq", "> **Status:**\nCLOSED");
