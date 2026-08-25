// Construct NESTING DEPTH over the live corpus, and the walk's cost as a
// function of it.
//
// The design's complexity argument rests on one number: how deeply a real file
// in this repository nests `${…}` / `$(…)` / backtick constructs. The
// construct-aware walk visits a character once per ENCLOSING construct, so the
// bound is O(n x d) and `d` is what makes that a claim rather than a hope.
// Measured here rather than asserted, over the same surfaces production reads.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../../../../../..");
const EXTENSIONS = [".sh", ".bash", ".yml", ".yaml"];
const SKIP = new Set([".git", "node_modules", "docs", ".next", "dist", "out", "build", "coverage"]);

const files: string[] = [];
const walk = (dir: string): void => {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) walk(full);
    else if (EXTENSIONS.some((e) => entry.endsWith(e))) files.push(full);
  }
};
walk(ROOT);

/** Depth of `${`/`$(`/backtick nesting, counted the way the walk recurses.
 *  This is an INDICATOR, not a bound in either direction, and diff review round 4
 *  is why this comment no longer claims otherwise. Quote state is deliberately not
 *  tracked, which OVER-counts by decrementing on a quoted `)` or `}`; the same
 *  omission also UNDER-counts, because process-substitution openers are not
 *  counted at all. `echo ${OUT:-<(echo }; psql -c 'x')}` reports max 1 while the
 *  production matcher reaches 2, since the outer `${` walk delegates into `<(`.
 *  A measurement that errs in BOTH directions bounds nothing, so the cost claim
 *  rests on AC-6's measured same-session ratio, which does not depend on how `d`
 *  is counted. See the design's census paragraph, which says the same. */
const depthOf = (text: string): { max: number; at: number } => {
  let depth = 0;
  let max = 0;
  let at = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === "\\") {
      i++;
      continue;
    }
    if ((c === "$" && (text[i + 1] === "{" || text[i + 1] === "(")) || c === "`") {
      depth++;
      if (depth > max) {
        max = depth;
        at = i;
      }
      if (c === "$") i++;
      continue;
    }
    if (c === "}" || c === ")" || c === "`") depth = Math.max(0, depth - 1);
  }
  return { max, at };
};

let worst = { file: "", max: 0, at: 0 };
const histogram = new Map<number, number>();
let bytes = 0;
for (const f of files) {
  const text = readFileSync(f, "utf8");
  bytes += text.length;
  const d = depthOf(text);
  histogram.set(d.max, (histogram.get(d.max) ?? 0) + 1);
  if (d.max > worst.max) worst = { file: relative(ROOT, f), max: d.max, at: d.at };
}
console.log(`files: ${files.length}   bytes: ${bytes}`);
console.log("max-depth histogram (depth: files):");
for (const d of [...histogram.keys()].sort((a, b) => a - b)) console.log(`  ${d}: ${histogram.get(d)}`);
console.log(`\nDEEPEST: ${worst.file} depth ${worst.max}`);
if (worst.file !== "") {
  const text = readFileSync(join(ROOT, worst.file), "utf8");
  console.log(`  at offset ${worst.at}: ${JSON.stringify(text.slice(worst.at, worst.at + 90))}`);
}
console.log(`\nMAX LIVE DEPTH: ${worst.max}`);
if (files.length === 0) {
  console.error("ABORT: no files walked — the histogram describes nothing");
  process.exit(2);
}
