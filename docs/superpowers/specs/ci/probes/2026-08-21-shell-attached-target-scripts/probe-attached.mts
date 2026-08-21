import { scanSource, scanShellIndirection } from "../../../../../../tests/cross-cutting/psqlStartupFiles/scan.ts";

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
/** Repo root, derived from this file so the probe runs in any checkout. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../..");

type Case = { id: string; expect: "SITE" | "SILENT-TODAY"; src: string };

// Every body is a psql invocation with NO -X / --no-psqlrc, i.e. the reportable
// case. The CONTROLS are the same bodies in positions the lexer already reads.
const CASES: Case[] = [
  // ---- positive controls: these MUST report, or a zero below is a broken read
  { id: "CONTROL detached backtick target", expect: "SITE",
    src: "cat > `psql -c 'select 1'`\n" },
  { id: "CONTROL detached dollar-paren target", expect: "SITE",
    src: "cat > $(psql -c 'select 1')\n" },
  { id: "CONTROL plain call", expect: "SITE",
    src: "psql -c 'select 1'\n" },
  { id: "CONTROL detached here-string binding", expect: "SITE",
    src: "read -r PG <<< p'sql'\n\"$PG\" -c 'select 1'\n" },

  // ---- the acceptance set
  { id: "A bare backtick ATTACHED target", expect: "SILENT-TODAY",
    src: "cat >`psql -c 'select 1'`\n" },
  { id: "B dollar-paren inside ATTACHED double-quoted target", expect: "SILENT-TODAY",
    src: "cat >\"$(psql -c 'select 1')\"\n" },
  { id: "C backtick inside ATTACHED double-quoted target", expect: "SILENT-TODAY",
    src: "cat >\"`psql -c 'select 1'`\"\n" },
  { id: "D locale-quoted ATTACHED target with substitution", expect: "SILENT-TODAY",
    src: "cat >$\"$(psql -c 'select 1')\"\n" },
  { id: "E substitution inside ATTACHED brace target", expect: "SILENT-TODAY",
    src: "cat >${OUT:-$(psql -c 'select 1')}\n" },
  { id: "F plain ATTACHED here-string binding", expect: "SILENT-TODAY",
    src: "read -r PG <<<p'sql'\n\"$PG\" -c 'select 1'\n" },
];

let controls = 0;
let controlsReporting = 0;
const rows: string[] = [];
for (const c of CASES) {
  const sites = scanSource(c.src, "probe/attached.sh");
  const hits = scanShellIndirection(c.src, "probe/attached.sh");
  const reports = sites.length > 0 || hits.length > 0;
  if (c.expect === "SITE") { controls++; if (reports) controlsReporting++; }
  rows.push(
    `${reports ? "REPORTS" : "silent "}  sites=${sites.length} indirection=${hits.length}  ${c.id}`,
  );
}

console.log(rows.join("\n"));
console.log(`\npopulation: ${CASES.length} cases, ${controls} controls`);
console.log(`controls reporting: ${controlsReporting}/${controls}`);
if (controlsReporting !== controls) {
  console.error("\nPROBE VOID: a positive control went silent, so every zero below is unattributable.");
  process.exit(2);
}
