// The delimiter walk's cost as input size grows, shipped versus a candidate
// module — the executable form of the design's complexity argument.
//
// `SCAN_MODULE=<path>` selects the candidate (default: the shipped scan.ts).
// Three families, each parameterised by size:
//   FLAT    ordinary text, no nesting — the ordinary-authoring case
//   NESTED  d levels of `$( ${ $( …` — the case a construct-aware walk re-enters
//   WIDE    k sibling constructs at depth 1 — the shape the live corpus has
// A walk that is linear in the input reports a flat ms/KB column. A walk that
// re-enters spans reports a rising one on NESTED and a flat one on WIDE, which
// is the signature the design's O(n x d) bound predicts.
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "../../../../../..");
const modulePath = process.env.SCAN_MODULE
  ? resolve(process.env.SCAN_MODULE)
  : join(ROOT, "tests/cross-cutting/psqlStartupFiles/scan.ts");
const { scanSource } = (await import(pathToFileURL(modulePath).href)) as {
  scanSource: (source: string, file: string) => unknown[];
};
console.log(`scanner module: ${modulePath}`);

const flat = (n: number): string => `echo ${"x".repeat(n)}\n`;
const nested = (d: number): string =>
  `echo ${"$(echo ${A:-".repeat(d)}v${"})".repeat(d)}\n`;

const wide = (k: number): string => `echo ${"$(echo ${A:-v}) ".repeat(k)}\n`;

const time = (source: string): number => {
  const t0 = performance.now();
  scanSource(source, "probe.sh");
  return performance.now() - t0;
};

const rows: Array<[string, string, number]> = [];
for (const n of [2_000, 8_000, 32_000, 128_000]) rows.push([`FLAT n=${n}`, flat(n), n]);
for (const d of [8, 32, 128, 512]) {
  const s = nested(d);
  rows.push([`NESTED d=${d} (n=${s.length})`, s, s.length]);
}
for (const k of [50, 200, 800, 3200]) {
  const s = wide(k);
  rows.push([`WIDE k=${k} (n=${s.length})`, s, s.length]);
}

console.log(`\n${"case".padEnd(30)} ${"bytes".padEnd(8)} ${"ms".padEnd(9)} us/KB`);
for (const [label, source, n] of rows) {
  time(source); // warm
  const runs = [time(source), time(source), time(source)].sort((a, b) => a - b);
  const ms = runs[1]!;
  console.log(
    `${label.padEnd(30)} ${String(n).padEnd(8)} ${ms.toFixed(2).padEnd(9)} ${((ms * 1000) / (n / 1024)).toFixed(1)}`,
  );
}
