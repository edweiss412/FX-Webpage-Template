// Independent review probe: is the "consumption ledger" (block-parser resolution)
// swap-invariant, as spec §2.2 asserts "by construction"?
// parseEventDetails uses EVENT_DETAILS_HEADER_RE.exec(markdown) -> FIRST match in
// DOCUMENT ORDER, then slices to end. If a fixture holds >=2 DETAILS-header blocks,
// an adjacent-block swap that reorders them changes which block is parsed.
import { readFileSync } from "node:fs";
import { FIXTURES } from "@/tests/parser/mutation/fixtures";
import { parseSheet } from "@/lib/parser";
import { parseTableRows } from "@/lib/parser/blocks/_helpers";

const TOKENS = ["EVENT DETAILS", "DETAILS", "DETAILS/ROOM DIAGRAM", "GS DETAILS", "GS DETAILS (FOR BOTH)"];
const isDetailsHeader = (c: string) => TOKENS.includes(c.trim().toUpperCase());

console.log("fixture | #blocks whose col0 is an event DETAILS header | block indices");
const multi: { path: string; idxs: number[] }[] = [];
for (const f of FIXTURES) {
  const md = readFileSync(f.path, "utf8");
  const blocks = md.split(/\n\s*\n/);
  const idxs: number[] = [];
  blocks.forEach((b, i) => {
    const rows = parseTableRows(b);
    const col0 = rows[0]?.[0] ?? "";
    if (isDetailsHeader(col0)) idxs.push(i);
  });
  if (idxs.length > 0) console.log(`  ${f.path}: ${idxs.length} -> [${idxs.join(",")}]`);
  if (idxs.length >= 2) multi.push({ path: f.path, idxs });
}

console.log("\n=== Fixtures with >=2 DETAILS-header blocks:", multi.length, "===");

// For each such fixture, find an adjacent swap that reorders the two headers and
// compare event_details payload.
for (const { path, idxs } of multi) {
  const md = readFileSync(path, "utf8");
  const blocks = md.split(/\n\s*\n/);
  const base = parseSheet(md, path);
  const baseED = JSON.stringify((base as any).event_details ?? null);
  // walk the first header block leftward one adjacent swap at a time is overkill;
  // just try every adjacent swap and report any that changes event_details.
  let changed = 0;
  const examples: string[] = [];
  for (let i = 0; i + 1 < blocks.length; i++) {
    const sw = [...blocks.slice(0, i), blocks[i + 1]!, blocks[i]!, ...blocks.slice(i + 2)].join("\n\n");
    const p = parseSheet(sw, path);
    const ed = JSON.stringify((p as any).event_details ?? null);
    if (ed !== baseED) {
      changed++;
      if (examples.length < 3) examples.push(`B${i}<->B${i + 1}`);
    }
  }
  console.log(`${path}: ${changed} of ${blocks.length - 1} adjacent swaps change event_details; e.g. ${examples.join(", ")}`);
}
