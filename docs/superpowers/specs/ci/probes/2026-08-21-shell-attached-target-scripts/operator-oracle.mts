// Which redirection operators does BASH actually expand an attached target for?
//
// The scanner's `LITERAL_TARGET_REDIRECTIONS` is a claim about the shell, so
// the shell is what settles it. This runs one real bash script per operator
// with a fake psql on PATH and counts executions, which is the only instrument
// that can DISAGREE with the constant: a check whose two sides both come from
// `REDIRECTION_PARTITION` moves them together and can never fail.
//
// The operator LIST is derived from the shipped array, so an operator added to
// the lexer is measured here by construction rather than silently exempt. The
// expected split is derived from the shipped set too - and that is sound only
// because bash, not the module, supplies the observation.
//
// The snippets are BASE64 for the same reason `oracle.mts`'s are: they are
// instances of the very family this arc censuses, and a literal shell-shaped
// string in a committed file is corpus. Measured on this arc: committing the
// snippets as a runnable script took the shell surface from 19 attached targets
// with 0 substitution-bearing to 28 with 5, every one of them the author's.
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { REDIRECTION_PARTITION } from "../../../../../../tests/cross-cutting/psqlStartupFiles/scan";

/** `cat @OP@"$(psql -c 'select 1')"` - the operator is substituted per run. */
const TEMPLATE = "Y2F0IEBPUEAiJChwc3FsIC1jICdzZWxlY3QgMScpIgo=";
/** A bare `psql -c 'select 1'`. The POSITIVE CONTROL: without it, a harness
 *  that cannot run anything at all - wrong PATH, unwritable log, no bash -
 *  reports zero executions for every operator, and a uniform zero renders
 *  identically to a real finding about the shell. */
const CONTROL = "cHNxbCAtYyAnc2VsZWN0IDEnCg==";
/** A fake psql that records the call and prints a filename, so the redirection
 *  it is a target for still has something to write to. */
const FAKE = "IyEvYmluL2Jhc2gKcHJpbnRmICJSQU5cbiIgPj4gIiRMT0dGSUxFIgplY2hvIG91dC50eHQK";

const dir = mkdtempSync(join(tmpdir(), "attached-operator-oracle-"));
const bin = join(dir, "bin");
mkdirSync(bin);
const fake = join(bin, "psql");
writeFileSync(fake, Buffer.from(FAKE, "base64").toString("utf8"));
chmodSync(fake, 0o755);

/** Executions of the fake psql for one snippet. */
function executions(id: string, script: string): number {
  const path = join(dir, `${id}.sh`);
  const log = join(dir, `${id}.log`);
  writeFileSync(path, script);
  writeFileSync(log, "");
  try {
    execFileSync("bash", [path], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}`, LOGFILE: log },
      stdio: "ignore",
      cwd: dir,
    });
  } catch {
    // A redirection error (`<&` on a non-descriptor) is an EXPECTED outcome and
    // says nothing about whether the word was expanded first. The log does.
  }
  return readFileSync(log, "utf8").split("\n").filter((line) => line === "RAN").length;
}

const controlRuns = executions("control", Buffer.from(CONTROL, "base64").toString("utf8"));
if (controlRuns !== 1) {
  console.error(
    `ABORT: the positive control ran psql ${controlRuns} times, not once. ` +
      "The harness cannot execute anything, so every zero below would be its own artefact.",
  );
  process.exit(2);
}
console.log(`positive control: psql executed ${controlRuns}x — the harness can observe an execution\n`);

const template = Buffer.from(TEMPLATE, "base64").toString("utf8");
const measured: Array<[operator: string, runs: number]> = [];
for (const operator of REDIRECTION_PARTITION.all) {
  const id = `op-${Buffer.from(operator).toString("hex")}`;
  measured.push([operator, executions(id, template.replace("@OP@", operator))]);
}

const literal = new Set(REDIRECTION_PARTITION.literalTarget);
let disagreements = 0;
for (const [operator, runs] of measured) {
  const declaredLiteral = literal.has(operator);
  const expected = declaredLiteral ? 0 : 1;
  const ok = runs === expected;
  if (!ok) disagreements++;
  console.log(
    `${ok ? "ok  " : "MISS"}  ${operator.padEnd(4)} executions=${runs}  ` +
      `declared=${declaredLiteral ? "LITERAL delimiter" : "EXPANDED"}`,
  );
}

const expandedCount = measured.length - literal.size;
console.log(
  `\npopulation: ${measured.length} operators — ${expandedCount} expand an attached ` +
    `substitution, ${literal.size} take the target literally`,
);

if (disagreements > 0) {
  console.error(
    `\nFAIL: bash disagrees with LITERAL_TARGET_REDIRECTIONS on ${disagreements} operator(s). ` +
      "The scanner either collects bodies bash never runs, or declines bodies it does.",
  );
  process.exit(1);
}
console.log(
  "PASS: bash agrees with LITERAL_TARGET_REDIRECTIONS on every shipped operator.",
);
