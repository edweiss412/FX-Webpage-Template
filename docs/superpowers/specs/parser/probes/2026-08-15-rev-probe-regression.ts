// Independent review probe: which rows that the CURRENT parser surfaces as
// UNKNOWN_FIELD are dropped by the spec's calibrated 72-row baseline?
// Focus: the four labels spec §3.2 lists as "confirmed non-catches" and §9
// files as documented limits. Are they surfaced TODAY?
import { readFileSync } from "node:fs";
import { FIXTURES } from "@/tests/parser/mutation/fixtures";
import { parseSheet } from "@/lib/parser";

const WATCH = ["cell phone:", "fax:", "alt. e-mail:", "event name:", "e-mail:", "address:", "phone:"];

const hits = new Map<string, { count: number; fixtures: Set<string>; kinds: Set<string> }>();

for (const f of FIXTURES) {
  const md = readFileSync(f.path, "utf8");
  for (const w of parseSheet(md, f.path).warnings) {
    if (w.code !== "UNKNOWN_FIELD") continue;
    const name = String((w.blockRef as any)?.name ?? "").trim();
    const key = name.toLowerCase();
    if (!WATCH.includes(key)) continue;
    const e = hits.get(key) ?? { count: 0, fixtures: new Set<string>(), kinds: new Set<string>() };
    e.count++;
    e.fixtures.add(f.path);
    e.kinds.add(String((w.blockRef as any)?.kind ?? "?"));
    hits.set(key, e);
  }
}

console.log("Label | surfaced TODAY as UNKNOWN_FIELD | #fixtures | kinds");
for (const k of WATCH) {
  const e = hits.get(k);
  console.log(
    `  ${k.padEnd(14)} | ${e ? `YES x${e.count}` : "no"} | ${e ? e.fixtures.size : 0} | ${e ? [...e.kinds].join(",") : "-"}`,
  );
}
