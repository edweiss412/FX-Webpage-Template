// Independent review probe: TYPO_NORMALIZED is gated on the SAME inVenueFieldScope
// flag spec §2.1 says to delete (venue.ts:135). Is it corpus-live, and is it
// position-sensitive (i.e. does it participate in the AC-N2 swap-invariance gate)?
import { readFileSync } from "node:fs";
import { FIXTURES } from "@/tests/parser/mutation/fixtures";
import { parseSheet } from "@/lib/parser";

const CASES: Array<[string, number[]]> = [
  ["fixtures/shows/raw/2025-03-dci-rpas-central.md", [14, 15, 19]],
  ["fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md", [14, 15]],
  ["fixtures/shows/raw/2025-06-ria-investment-forum.md", [3, 4, 7, 8]],
  ["fixtures/shows/raw/2025-10-consultants-roundtable.md", [22]],
];

const countCode = (md: string, p: string, code: string) =>
  parseSheet(md, p).warnings.filter((w) => w.code === code).length;

console.log("=== TYPO_NORMALIZED corpus census ===");
let total = 0;
for (const f of FIXTURES) {
  const n = countCode(readFileSync(f.path, "utf8"), f.path, "TYPO_NORMALIZED");
  total += n;
  if (n > 0) console.log(`  ${f.path}: ${n}`);
}
console.log("TOTAL TYPO_NORMALIZED today:", total);

console.log("\n=== swap-sensitivity of TYPO_NORMALIZED on the 10 named AC-N2 swaps ===");
for (const [path, pairs] of CASES) {
  const md = readFileSync(path, "utf8");
  const blocks = md.split(/\n\s*\n/);
  const base = countCode(md, path, "TYPO_NORMALIZED");
  for (const i of pairs) {
    const sw = [...blocks.slice(0, i), blocks[i + 1]!, blocks[i]!, ...blocks.slice(i + 2)].join("\n\n");
    const after = countCode(sw, path, "TYPO_NORMALIZED");
    console.log(`  ${path} B${i}<->B${i + 1}: ${base} -> ${after}${base === after ? "" : "   <-- CHANGES"}`);
  }
}

console.log("\n=== exhaustive: adjacent swaps that change TYPO_NORMALIZED count ===");
for (const f of FIXTURES) {
  const md = readFileSync(f.path, "utf8");
  const blocks = md.split(/\n\s*\n/);
  const base = countCode(md, f.path, "TYPO_NORMALIZED");
  let changed = 0;
  for (let i = 0; i + 1 < blocks.length; i++) {
    const sw = [...blocks.slice(0, i), blocks[i + 1]!, blocks[i]!, ...blocks.slice(i + 2)].join("\n\n");
    if (countCode(sw, f.path, "TYPO_NORMALIZED") !== base) changed++;
  }
  if (changed > 0) console.log(`  ${f.path}: ${changed} of ${blocks.length - 1} swaps change it (base=${base})`);
}
