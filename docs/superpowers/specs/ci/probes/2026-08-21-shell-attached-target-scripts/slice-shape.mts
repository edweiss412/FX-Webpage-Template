// What does the ATTACHED-target regex actually CONSUME, per spelling?
//
// The pattern is read out of the shipped source, so this is the real matcher
// and not a retyped model of it. The only modelled step is "rest begins
// immediately after the operator", which is exactly what the shipped call site
// does (`const rest = text.slice(i + 1)` with `i` already advanced past the
// operator), and it is stated here rather than assumed silently.
import { readFileSync } from "node:fs";

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
/** Repo root, derived from this file so the probe runs in any checkout. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../..");

const src = readFileSync(`${ROOT}/tests/cross-cutting/psqlStartupFiles/scan.ts`, "utf8");
const pat = src.match(/const attached = (\/\^\(\?:.*?\/)\.exec\(rest\)/);
if (!pat) {
  console.error("ABORT: attached pattern not found");
  process.exit(2);
}
const ATTACHED = new RegExp(pat[1]!.slice(1, -1));
console.log("shipped pattern:", pat[1], "\n");

const CASES: Array<[id: string, op: string, rest: string]> = [
  ["A bare backtick", ">", "`psql -c 'select 1'`"],
  ["B $() in double-quoted", ">", `"$(psql -c 'select 1')"`],
  ["C backtick in double-quoted", ">", `"\`psql -c 'select 1'\`"`],
  ["D locale-quoted", ">", `$"$(psql -c 'select 1')"`],
  ["E ${} default operand", ">", "${OUT:-$(psql -c 'select 1')}"],
  ["F attached here-string", "<<<", "p'sql'"],
  ["-- control: plain path", ">", "/dev/null"],
  ["-- control: $() no spaces", ">", "$(psql)"],
];

for (const [id, op, rest] of CASES) {
  const m = ATTACHED.exec(rest);
  const consumed = m ? m[0] : null;
  const remainder = m ? rest.slice(m[0].length) : rest;
  console.log(`${id}`);
  console.log(`  operator : ${JSON.stringify(op)}`);
  console.log(`  rest     : ${JSON.stringify(rest)}`);
  console.log(`  CONSUMED : ${JSON.stringify(consumed)}`);
  console.log(`  remainder: ${JSON.stringify(remainder)}`);
  console.log(`  whole?   : ${consumed === rest ? "YES — target eaten whole" : "NO — partial"}`);
  console.log("");
}
