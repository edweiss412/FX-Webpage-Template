import { readFileSync } from "node:fs";
import { parseSheet } from "@/lib/parser";
const p = "fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md";
const md = readFileSync(p, "utf8");
const blocks = md.split(/\n\s*\n/);
const base = parseSheet(md, p).warnings.filter((w) => w.code === "TYPO_NORMALIZED");
console.log("base TYPO_NORMALIZED:", base.length);
for (let i = 0; i + 1 < blocks.length; i++) {
  const sw = [...blocks.slice(0, i), blocks[i + 1]!, blocks[i]!, ...blocks.slice(i + 2)].join("\n\n");
  const w = parseSheet(sw, p).warnings.filter((x) => x.code === "TYPO_NORMALIZED");
  if (w.length !== base.length) {
    console.log(`SWAP B${i}<->B${i + 1}: ${base.length} -> ${w.length}`);
    for (const x of w) console.log("   ", JSON.stringify({ code: x.code, message: x.message, rawSnippet: x.rawSnippet }));
    console.log("   B" + i + " head:", (blocks[i] ?? "").split("\n")[0]?.slice(0, 90));
    console.log("   B" + (i + 1) + " head:", (blocks[i + 1] ?? "").split("\n")[0]?.slice(0, 90));
  }
}
