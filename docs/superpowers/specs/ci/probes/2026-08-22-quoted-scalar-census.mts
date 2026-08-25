// AC-6: the live-corpus census of executable YAML scalar styles.
//
// The spec's digest-neutrality argument rests on this reading zero quoted
// executable scalars: with no such input in the corpus, a repair scoped to the
// quoted path cannot move the AC-5 finding set. That makes the census a GATE,
// not a note, so it lives here as a runnable program rather than as a number
// quoted in prose. `--expect-quoted <n>` turns it from a reporter into a check.
//
// Keys mirror the scanner's own two sets — `EXECUTABLE_WORKFLOW_KEYS`
// (`run`, `shell`) and `CONTAINER_ARGV_KEYS` (`entrypoint`, `args`) — because
// every one of them is text that RUNS, and all four are exposed to the same
// YAML-quoting defect.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isPair, isScalar, isSeq, parseDocument, visit } from "yaml";

const EXECUTABLE_KEYS = new Set(["run", "shell", "entrypoint", "args"]);
const QUOTED = new Set(["QUOTE_SINGLE", "QUOTE_DOUBLE"]);

const argv = process.argv.slice(2);
const at = argv.indexOf("--expect-quoted");
const expected = at === -1 ? null : Number(argv[at + 1]);

const files = execFileSync("git", ["ls-files", "*.yml", "*.yaml"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

const tally = new Map<string, number>();
const quoted: string[] = [];
let parseFailures = 0;
const parseFailureFiles: string[] = [];

for (const file of files) {
  const source = readFileSync(file, "utf8");
  // `parseDocument` does NOT throw on malformed YAML -- it returns a document
  // carrying `errors` and a partially built tree. Catching a throw therefore
  // counted nothing, and review found the consequence: one ordinary edit to a
  // live workflow (`runs-on: [ubuntu-latest`) produced three parser errors while
  // this census printed `parse failures: 0` and PASSED, having walked a
  // half-parsed tree. That is the read-correctly-or-signal bound broken in the
  // silent direction, which is the one direction this arc exists to close.
  //
  // Both shapes are failures now: a throw, and a document that reports errors.
  let doc;
  try {
    doc = parseDocument(source);
  } catch {
    parseFailures++;
    parseFailureFiles.push(`${file} (threw)`);
    continue;
  }
  if (doc.errors.length > 0) {
    parseFailures++;
    parseFailureFiles.push(`${file} (${doc.errors.length} parser error(s): ${doc.errors[0]?.message ?? "?"})`);
    continue;
  }
  visit(doc, {
    Pair(_k: unknown, pair: unknown) {
      if (!isPair(pair as never)) return;
      const key = (pair as { key?: { value?: unknown } }).key?.value as string;
      if (!EXECUTABLE_KEYS.has(key)) return;
      const value = (pair as { value?: unknown }).value as {
        type?: string;
        range?: [number, number, number];
      };
      // A SEQUENCE under an executable key is the normal shape for `args:` and
      // `entrypoint:`, and the scanner descends into it — `CONTAINER_ARGV_KEYS`
      // collects each item. Returning early on a non-scalar therefore certified
      // a NARROWER input class than the scanner handles, so this census could
      // report zero on a file the scanner reads. Diff review round 3 found it.
      //
      // Measured when it was fixed: the live corpus holds ZERO sequences under
      // an executable key, so this widening does not move AC-6's answer. It
      // makes the same answer true of a wider class instead of true by luck.
      const record = (node: { type?: string; range?: [number, number, number] }) => {
        const type = node.type ?? "UNKNOWN";
        const row = `${key}:${type}`;
        tally.set(row, (tally.get(row) ?? 0) + 1);
        if (QUOTED.has(type) && node.range)
          quoted.push(`${file}:${source.slice(0, node.range[0]).split("\n").length} ${row}`);
      };
      if (isSeq(value as never)) {
        for (const item of (value as unknown as { items?: unknown[] }).items ?? []) {
          if (isScalar(item as never)) record(item as never);
        }
        return;
      }
      if (!isScalar(value as never)) return;
      record(value);
    },
  });
}

console.log(`tracked YAML files: ${files.length} (parse failures: ${parseFailures})`);
for (const [row, count] of [...tally].sort()) console.log(`  ${row} = ${count}`);
console.log(`QUOTED executable scalars: ${quoted.length}`);
for (const q of quoted) console.log(`  ${q}`);

// A zero over an UNPARSED file is not a pass either, and for the same reason the
// empty-population check below exists: the count describes only what was read.
// This ABORTS rather than warns because AC-6's zero underwrites the arc's
// digest-neutrality argument, and a zero taken over a half-parsed tree would
// carry that argument on evidence nobody gathered.
if (parseFailures > 0) {
  console.error(`ABORT: ${parseFailures} file(s) did not parse cleanly — the census describes only the rest.`);
  for (const f of parseFailureFiles) console.error(`  ${f}`);
  process.exit(2);
}

// A zero over an empty population is not a pass: if the walk found no
// executable scalar at all, the zero above describes nothing.
if (tally.size === 0) {
  console.error("ABORT: no executable scalar of any style was found — the census describes nothing.");
  process.exit(2);
}

if (expected !== null && quoted.length !== expected) {
  console.error(`FAIL: expected ${expected} quoted executable scalar(s), found ${quoted.length}.`);
  process.exit(1);
}
if (expected !== null) console.log(`PASS: quoted executable scalar count is ${expected}, as expected.`);
