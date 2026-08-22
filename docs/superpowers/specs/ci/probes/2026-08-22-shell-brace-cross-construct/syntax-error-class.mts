// Is "bash REJECTS this input and the scanner reports a site anyway" a property
// of the CROSSING, or a general pre-existing property of the scanner?
//
// Spec review round 1 finding 2 raised a `$$(` spelling on which bash exits 2
// and the scanner still resolves a `PsqlSite`. This probe answers the scope
// question that finding turns on: five ORDINARY syntax errors, none involving a
// crossing or a `$$`, measured against the shipped scanner.
//
// The answer decides the repair direction. If only the `$$` spelling fabricated,
// it is a gap in this design's accept-set and must be closed. If every syntax
// error does, closing it means the walk becomes a bash PARSER — the growth
// design §1.2 row 2 fences — and the honest disposition is a documented limit
// with this measurement attached to it.
//
// `SCAN_MODULE=<path>` adds a second module to the report. The ASSERTION is
// always made against the shipped scanner, because the claim being pinned is
// about what the surface already does.
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const ROOT = resolve(import.meta.dirname, "../../../../../..");
const dir = mkdtempSync(join(tmpdir(), "syntax-error-class-"));

/** Five ordinary authoring mistakes. None is a crossing; none carries a `$$`. */
const CASES: Array<[string, string]> = [
  ["unterminated single quote", `psql -c 'x`],
  ["stray close paren", `psql -c x )`],
  ["done without do", `done\npsql -c 'x'`],
  ["fi without if", `fi\npsql -c 'x'`],
  ["unmatched close brace", `}\npsql -c 'x'`],
];

const bashParses = (source: string): boolean => {
  const file = join(dir, "case.sh");
  writeFileSync(file, source + "\n");
  try {
    execFileSync("bash", ["-n", file], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
};

type Scanner = {
  scanSource: (source: string, file: string) => Array<Record<string, unknown>>;
  scanShellIndirection: (source: string, file: string) => unknown[];
};

const SHIPPED = "tests/cross-cutting/psqlStartupFiles/scan.ts";
const modules = [SHIPPED, ...(process.env.SCAN_MODULE ? [process.env.SCAN_MODULE] : [])];

let fabricated = 0;
let rejected = 0;
for (const relativePath of modules) {
  const scan = (await import(pathToFileURL(resolve(ROOT, relativePath)).href)) as Scanner;
  console.log(`\n--- ${relativePath}`);
  for (const [id, source] of CASES) {
    const parses = bashParses(source);
    const sites = scan.scanSource(source, "x.sh");
    const hits = scan.scanShellIndirection(source, "x.sh");
    if (relativePath === SHIPPED) {
      if (!parses) rejected++;
      if (!parses && sites.length > 0) fabricated++;
    }
    const attribution = sites.length > 0 ? ` nested=${sites.map((s) => s.nested).join(",")}` : "";
    console.log(
      `${id.padEnd(28)} bash=${(parses ? "parses" : "SYNTAX ERROR").padEnd(13)} sites=${sites.length} hits=${hits.length}${attribution}`,
    );
  }
}

// A control on the PREMISE: if bash stopped rejecting these, the probe would be
// measuring nothing and a clean result would mean nothing.
if (rejected !== CASES.length) {
  console.error(
    `ABORT: only ${rejected}/${CASES.length} cases are syntax errors under this bash — the probe's subject does not exist here.`,
  );
  process.exit(2);
}

console.log(`\n${fabricated}/${rejected} bash-REJECTED inputs still yield a site on the shipped scanner`);

// ASSERTED, not printed. The design's syntax-error documented limit rests on the
// fabrication being GENERAL rather than specific to one spelling; if a future
// scanner starts validating syntax, this fails and that limit must be re-read.
if (fabricated !== rejected) {
  console.error(
    `FAIL: ${rejected - fabricated} bash-rejected input(s) no longer fabricate. The documented limit citing this probe assumes the fabrication is general — re-read it rather than leaving it standing.`,
  );
  process.exit(1);
}
console.log("PASS: the fabrication is GENERAL — not a property of the crossing, and not closable without a parser.");
