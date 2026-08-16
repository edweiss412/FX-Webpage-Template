// Independent review probe: what blockRef.kind do today's UNKNOWN_FIELD warnings carry?
import { readFileSync } from "node:fs";
import { FIXTURES } from "@/tests/parser/mutation/fixtures";
import { parseSheet } from "@/lib/parser";

const byKind = new Map<string, number>();
const tpRows: { fixture: string; key: string; kind: string; block: string }[] = [];
let total = 0;

const TP_LABELS = new Set([
  "stage",
  "storage",
  "address:",
  "phone:",
  "client:/contact:",
  "e-mail:",
]);

for (const f of FIXTURES) {
  const md = readFileSync(f.path, "utf8");
  const res = parseSheet(md, f.path);
  for (const w of res.warnings) {
    if (w.code !== "UNKNOWN_FIELD") continue;
    total++;
    const kind = String(w.blockRef?.kind ?? "<none>");
    byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
    const name = String(w.blockRef?.name ?? "");
    if (TP_LABELS.has(name.trim().toLowerCase())) {
      tpRows.push({ fixture: f.path, key: name, kind, block: kind });
    }
  }
}

console.log("TOTAL UNKNOWN_FIELD today:", total);
console.log("by blockRef.kind:", JSON.stringify([...byKind.entries()], null, 2));
console.log("\nAudited-TP-label rows and their kind:");
for (const r of tpRows) console.log(`  ${r.fixture}  key="${r.key}"  kind="${r.kind}"`);
console.log("\nTP-label row count:", tpRows.length);
