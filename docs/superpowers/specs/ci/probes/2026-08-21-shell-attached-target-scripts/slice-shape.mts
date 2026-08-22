// What does the ATTACHED-target regex actually CONSUME, per spelling?
//
// The pattern is read out of SOURCE, so this is the real matcher and not a
// retyped model of it. The only modelled step is "rest begins immediately after
// the operator", which is exactly what the call site did (`const rest =
// text.slice(i + 1)` with `i` already advanced past the operator), and it is
// stated here rather than assumed silently.
//
// EVIDENTIARY, and therefore pinned to the BASE revision rather than to the
// working tree. This probe's subject is the character-run regex that
// BL-SHELL-ATTACHED-REDIRECTION-TARGET-SUBSTITUTION DELETED, so reading the
// working tree makes it abort - which is the repair having landed, not a broken
// probe. Its table is spec section 2.1: a RECORD of what the pre-repair matcher
// consumed, and the argument for replacing it. A record must not be updated to
// stay current, so the source is a fixed sha no later edit can invalidate, and
// the probe PRINTS which one it read.
import { execFileSync } from "node:child_process";

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
/** Repo root, derived from this file so the probe runs in any checkout. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../..");

/** The revision spec section 2.1 measured. Named, not inferred. */
const BASE = "e5d1d723d";
const src = execFileSync(
  "git",
  ["-C", ROOT, "show", `${BASE}:tests/cross-cutting/psqlStartupFiles/scan.ts`],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);
const pat = src.match(/const attached = (\/\^\(\?:.*?\/)\.exec\(rest\)/);
if (!pat) {
  // A floor on the read: an empty or unexpected `git show` renders identically
  // to "the pattern is not there", and only one of those is a real answer.
  console.error(
    `ABORT: attached pattern not found in ${BASE} (read ${src.length} bytes). ` +
      "The base is wrong or the checkout lacks that revision -- this probe cannot report.",
  );
  process.exit(2);
}
console.log(`source: ${BASE}:tests/cross-cutting/psqlStartupFiles/scan.ts (${src.length} bytes)`);
const ATTACHED = new RegExp(pat[1]!.slice(1, -1));
console.log("pattern as shipped at that revision:", pat[1], "\n");

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
