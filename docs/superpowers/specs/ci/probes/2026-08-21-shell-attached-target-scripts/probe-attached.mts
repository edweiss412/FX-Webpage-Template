// The acceptance set, through the shipped scanners.
//
// TWO MODES, and the second is why this file changed at spec round 1. The
// original only printed, and exited non-zero solely when a positive control
// failed — so all six subjects staying silent AFTER the repair still exited 0.
// A probe cited as an acceptance proof must be able to fail for the thing it
// proves.
//
//   (default)          BASELINE — the subjects are expected SILENT. This is the
//                      pre-change state, and it is what makes the zeros a
//                      measurement rather than an assumption.
//   --expect-report    POST-CHANGE — the subjects are expected to REPORT. Exits
//                      1 naming every subject still silent.
//
// The four positive controls are expected to report in BOTH modes: they are
// what makes a zero attributable rather than the artefact of a broken read, and
// the run ABORTS if any of them goes quiet.
import {
  scanSource,
  scanShellIndirection,
} from "../../../../../../tests/cross-cutting/psqlStartupFiles/scan.ts";

type Result = {
  sites: ReturnType<typeof scanSource>;
  hits: ReturnType<typeof scanShellIndirection>;
};
/**
 * `holds` is the POST-CHANGE expectation. A report/silent binary was not enough:
 * spec round 1 finding 4 is a WRONG-ATTRIBUTION case that already REPORTS today
 * (`nested:false, nestedInBacktick:false` for a psql that genuinely sits inside
 * a backtick span), and a binary that only asks "did anything report" is
 * structurally blind to it — the outcome right, the reason wrong.
 */
type Case = {
  id: string;
  kind: "control" | "subject";
  src: string;
  holds: (r: Result) => boolean;
};

const REPORTS = (r: Result) => r.sites.length > 0 || r.hits.length > 0;
const IN_BACKTICK = (r: Result) =>
  r.sites.some((s) => (s as unknown as { nestedInBacktick?: boolean }).nestedInBacktick === true);

// Every body is a psql invocation with NO -X / --no-psqlrc, i.e. the reportable
// case. The CONTROLS are the same bodies in positions the lexer already reads.
const CASES: Case[] = [
  { id: "CONTROL detached backtick target", kind: "control", holds: REPORTS, src: "cat > `psql -c 'select 1'`\n" },
  {
    id: "CONTROL detached dollar-paren target",
    kind: "control",
    holds: REPORTS,
    src: "cat > $(psql -c 'select 1')\n",
  },
  { id: "CONTROL plain call", kind: "control", holds: REPORTS, src: "psql -c 'select 1'\n" },
  {
    id: "CONTROL detached here-string binding",
    kind: "control",
    holds: REPORTS,
    src: "read -r PG <<< p'sql'\n\"$PG\" -c 'select 1'\n",
  },

  // ---- the acceptance set (spec 2.2 A-F)
  { id: "A bare backtick ATTACHED target", kind: "subject", holds: REPORTS, src: "cat >`psql -c 'select 1'`\n" },
  {
    id: "B dollar-paren inside ATTACHED double-quoted target",
    kind: "subject",
    holds: REPORTS,
    src: "cat >\"$(psql -c 'select 1')\"\n",
  },
  {
    id: "C backtick inside ATTACHED double-quoted target",
    kind: "subject",
    holds: REPORTS,
    src: "cat >\"`psql -c 'select 1'`\"\n",
  },
  {
    id: "D locale-quoted ATTACHED target with substitution",
    kind: "subject",
    holds: REPORTS,
    src: "cat >$\"$(psql -c 'select 1')\"\n",
  },
  {
    id: "E substitution inside ATTACHED brace target",
    kind: "subject",
    holds: REPORTS,
    src: "cat >${OUT:-$(psql -c 'select 1')}\n",
  },
  {
    id: "F plain ATTACHED here-string binding",
    kind: "subject",
    holds: REPORTS,
    src: "read -r PG <<<p'sql'\n\"$PG\" -c 'select 1'\n",
  },

  // ---- spec round 1 finding 3: a one-edit composition of B and E, inside the
  //      accept set. Bash executes it; the scanner must not be silent.
  {
    id: "G brace inside an ATTACHED double-quoted target (composition of B and E)",
    kind: "subject",
    holds: REPORTS,
    src: 'cat >"${OUT:-$(psql -c \'select 1\')}"\n',
  },
  // ---- spec round 1 finding 4, BOTH directions of the escaped-backtick class.
  //      Round 2 replaced an earlier H that did not execute at all: the oracle
  //      measured executions=0, so it witnessed nothing. Both of these execute.
  {
    // Executes psql and is ENTIRELY SILENT — the forbidden direction in its
    // strongest form.
    id: "H escaped backtick in an ATTACHED double-quoted target (silent)",
    kind: "subject",
    holds: REPORTS,
    src: "cat >\"`echo \\\\\\` ; psql -c \"select 1\"`\"\n",
  },
  {
    // Executes psql and REPORTS, with nested:false and nestedInBacktick:false
    // for a psql that sits inside a backtick body. The outcome looks right and
    // the reason is wrong, which a presence assertion cannot see.
    id: "I mid-construct stop mis-attributes a backtick body (attribution)",
    kind: "subject",
    holds: IN_BACKTICK,
    src: "cat >`printf \"\\140\"; psql -c \"select 1\"`\n",
  },
];

const expectReport = process.argv.includes("--expect-report");

let controlsSilent = 0;
let subjectsUnmet = 0;
let subjectsReporting = 0;
const unmetSubjects: string[] = [];

for (const c of CASES) {
  const sites = scanSource(c.src, "probe/attached.sh");
  const hits = scanShellIndirection(c.src, "probe/attached.sh");
  const reports = c.holds({ sites, hits });
  if (c.kind === "control" && !reports) controlsSilent++;
  if (c.kind === "subject") {
    if (reports) subjectsReporting++;
    else {
      subjectsUnmet++;
      unmetSubjects.push(c.id);
    }
  }
  console.log(
    `${reports ? "HOLDS  " : "not yet"}  sites=${sites.length} indirection=${hits.length}  ${c.id}`,
  );
}

const controls = CASES.filter((c) => c.kind === "control").length;
const subjects = CASES.filter((c) => c.kind === "subject").length;
console.log(`\npopulation: ${CASES.length} cases — ${controls} controls, ${subjects} subjects`);
console.log(`controls reporting: ${controls - controlsSilent}/${controls}`);
console.log(`subjects whose expectation HOLDS: ${subjectsReporting}/${subjects}`);

if (controlsSilent > 0) {
  console.error(
    `\nPROBE VOID: ${controlsSilent} positive control(s) went silent, so every subject zero is unattributable.`,
  );
  process.exit(2);
}

if (expectReport) {
  if (subjectsUnmet > 0) {
    console.error(`\nFAIL: ${subjectsUnmet} subject(s) do not meet their expectation:`);
    for (const id of unmetSubjects) console.error(`  - ${id}`);
    process.exit(1);
  }
  console.log(`\nPASS: all ${subjects} subject expectations hold.`);
} else {
  if (subjectsReporting > 0) {
    console.error(
      `\nFAIL (baseline mode): ${subjectsReporting} subject expectation(s) already hold; the baseline this arc measured has moved.`,
    );
    process.exit(1);
  }
  console.log(`\nBASELINE: no subject expectation holds yet, with ${controls}/${controls} controls reporting.`);
}
