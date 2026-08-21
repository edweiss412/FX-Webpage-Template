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
/**
 * Spec round 4 finding 4: an EXISTENTIAL reading of this predicate is blind to a
 * leftover. Case I emits ONE wrongly top-level site today; a repair that adds a
 * correctly attributed site and leaves the wrong one produces `[wrong, correct]`,
 * which `some(...)` accepts while the forbidden wrong attribution survives. The
 * quantifier is therefore UNIVERSAL: every site this snippet produces must carry
 * the attribution, and at least one must exist so an empty read cannot pass
 * vacuously.
 */
const IN_BACKTICK = (r: Result) => {
  const sites = r.sites as unknown as Array<{ nestedInBacktick?: boolean }>;
  return sites.length > 0 && sites.every((s) => s.nestedInBacktick === true);
};

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
  // ---- spec round 4 findings 2 and 3, BOTH one ordinary edit from B. Every
  //      case above keeps its attached target on ONE physical line and puts a
  //      bare `>` immediately after `cat`, so the set could not see either axis.
  //      Both execute psql once; both were measured silent through BOTH shipped
  //      scanners before this line was written.
  {
    // Round 4 finding 2. The census was repaired for multiline input at round 3
    // and the ACCEPTANCE SET was not, so a same-line-only implementation passed
    // every subject here while staying silent on a form bash executes.
    id: "J backslash continuation inside an ATTACHED double-quoted target (multiline)",
    kind: "subject",
    holds: REPORTS,
    src: 'cat >"/dev/null\\\n$(psql -c \'select 1\')"\n',
  },
  {
    // Round 4 finding 3. Every substitution-bearing subject wrote a BARE `>`
    // after `cat`; case F varies the operator but carries no substitution. An
    // implementation that only handles an attached target when no
    // file-descriptor digit preceded the operator passed the whole gate.
    id: "K file-descriptor-prefixed operator before an ATTACHED substitution",
    kind: "subject",
    holds: REPORTS,
    src: 'cat 2>"$(psql -c \'select 1\')"\n',
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
