// Bash oracle: does each spelling REALLY execute the command, or is the
// scanner silent about nothing?
//
// The snippets are BASE64 rather than literal shell text ON PURPOSE. They are
// instances of the very family this arc censuses, and a .sh file carrying them
// would enter the scanner's own corpus - so the census would count its author's
// fixtures as live population. Measured: committing them as oracle-run.sh took
// the shell surface from 19 attached targets / 0 substitution-bearing to 28 / 5,
// every one of the 5 mine.
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SNIPPETS: Record<string, string> = {
  "CONTROL-detached-backtick": "Y2F0ID4gYHBzcWwgLWMgInNlbGVjdCAxImAK",
  "A-bare-backtick-attached": "Y2F0ID5gcHNxbCAtYyAic2VsZWN0IDEiYAo=",
  "B-dollarparen-in-dq": "Y2F0ID4iJChwc3FsIC1jICJzZWxlY3QgMSIpIgo=",
  "C-backtick-in-dq": "Y2F0ID4iYHBzcWwgLWMgInNlbGVjdCAxImAiCg==",
  "D-locale-quoted": "Y2F0ID4kIiQocHNxbCAtYyAic2VsZWN0IDEiKSIK",
  "E-brace-default-operand": "Y2F0ID4ke09VVDotJChwc3FsIC1jICJzZWxlY3QgMSIpfQo=",
  "F-attached-here-string": "cmVhZCAtciBQRyA8PDxwJ3NxbCcKIiRQRyIgLWMgInNlbGVjdCAxIgo=",
  "G-brace-in-double-quote": "Y2F0ID4iJHtPVVQ6LSQocHNxbCAtYyAic2VsZWN0IDEiKX0iCg==",
  "H-escaped-backtick": "Y2F0ID4iYGVjaG8gXFxcYCA7IHBzcWwgLWMgInNlbGVjdCAxImAiCg==",
  "I-midconstruct-attribution": "Y2F0ID5gcHJpbnRmICJcMTQwIjsgcHNxbCAtYyAic2VsZWN0IDEiYAo=",
  "J-multiline-continuation-in-dq": "Y2F0ID4iL2Rldi9udWxsXAokKHBzcWwgLWMgInNlbGVjdCAxIikiCg==",
  "K-fd-prefixed-operator": "Y2F0IDI+IiQocHNxbCAtYyAic2VsZWN0IDEiKSIK",
  // The 2026-08-21 acceptance-set sweep's fixtures. Added because item 6 of
  // the handover requires it and because skipping it let five fixtures assert
  // a resolved site for a command bash never runs: `>"$(true)"` expands to an
  // EMPTY filename and bash aborts the command AT that redirection before the
  // next one expands, and a function defined-but-never-called and a `case` arm
  // on unset `$x` enter nothing at all.
  "S1-same-command-both": "Y2F0ID4iJChwc3FsIC1jICdvbmUnKSIgMj4iJChwc3FsIC1jICd0d28nKSIK",
  "S2-same-command-first": "Y2F0ID4iJChwc3FsIC1jICdvbmUnKSIgMj4iJChlY2hvIHR3by50eHQpIgo=",
  "S3-same-command-last": "Y2F0ID4iJChlY2hvIG9uZS50eHQpIiAyPiIkKHBzcWwgLWMgJ29uZScpIgo=",
  "S4-same-command-middle": "Y2F0ID4iJChlY2hvIG9uZS50eHQpIiAyPiIkKHBzcWwgLWMgJ3gnKSIgPCIkKGVjaG8gL2Rldi9udWxsKSIK",
  "S5-same-command-bare-first": "Y2F0ID4kKHBzcWwgLWMgJ29uZScpIDI+IiQocHNxbCAtYyAndHdvJykiCg==",
  "S6-eof-closed-no-newline": "Y2F0ID4iJChwc3FsIC1jICdzZWxlY3QgMScpIg==",
  "S7-eof-backslash-last-byte": "Y2F0ID4iJChwc3FsIC1jICdzZWxlY3QgMScpIlw=",
  "S8-eof-bare-target": "Y2F0ID4kKHBzcWwgLWMgJ3gnKQ==",
  "S9-function-body-called": "ZigpIHsKICBjYXQgPiIkKHBzcWwgLWMgJ3gnKSIKfQpmCg==",
  "S10-after-heredoc": "Y2F0IDw8RU9GCnBsYWluCkVPRgpjYXQgPiIkKHBzcWwgLWMgJ3gnKSIK",
  "S11-case-arm-matching": "Y2FzZSBhIGluCiAgYSkgY2F0ID4iJChwc3FsIC1jICd4JykiIDs7CmVzYWMK",
  "S12-crlf": "Y2F0ID4iJChwc3FsIC1jICdzZWxlY3QgMScpIg0K",
};

/**
 * The other half of the consequence bound, and it is an INVERTED claim.
 * These are the spellings the scanner refuses to resolve and REPORTS instead,
 * so each must execute NOTHING - bash dies on the unexpected EOF. If one of
 * them ever runs, an advisory there is hiding a real call site and the
 * conservative direction has flipped. The table above cannot express this:
 * its abort fires when a snippet does NOT execute.
 */
const NON_EXECUTING: Record<string, string> = {
  "N1-dq-never-closes": "Y2F0ID4iJChwc3FsIC1jICdzZWxlY3QgMScp",
  "N2-subst-never-closes": "Y2F0ID4kKHBzcWwgLWMgJ3NlbGVjdCAxJw==",
  "N3-unterminated-backslash": "Y2F0ID4iJChwc3FsIC1jICdzZWxlY3QgMScpXA==",
  "N4-continuation-eof": "Y2F0ID4iYVwKJChwc3FsIC1jICdzZWxlY3QgMScp",
};
const FAKE = "IyEvYmluL2Jhc2gKcHJpbnRmICdSQU4gYXJndj0lc1xuJyAiJCoiID4+ICIkTE9HRklMRSIKZWNobyBvdXQudHh0Cg==";

const dir = mkdtempSync(join(tmpdir(), "attached-oracle-"));
const bin = join(dir, "bin");
mkdirSync(bin);
const fake = join(bin, "psql");
writeFileSync(fake, Buffer.from(FAKE, "base64").toString("utf8"));
chmodSync(fake, 0o755);

let ran = 0;
for (const [id, b64] of Object.entries(SNIPPETS)) {
  const script = join(dir, `${id}.sh`);
  writeFileSync(script, Buffer.from(b64, "base64").toString("utf8"));
  const log = join(dir, `${id}.log`);
  writeFileSync(log, "");
  try {
    execFileSync("bash", [script], {
      cwd: dir,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, LOGFILE: log },
      stdio: "ignore",
    });
  } catch {
    // a failed redirect is fine - the question is only whether the command ran
  }
  const n = readFileSync(log, "utf8").split("\n").filter((l) => l.includes("RAN")).length;
  if (n > 0) ran++;
  console.log(`${id.padEnd(30)} executions=${n}`);
}
console.log(`\n${ran}/${Object.keys(SNIPPETS).length} snippets executed the command`);
if (ran !== Object.keys(SNIPPETS).length) {
  console.error("ABORT: a snippet did not execute - the oracle proves nothing about it");
  process.exit(2);
}

let executed = 0;
for (const [id, b64] of Object.entries(NON_EXECUTING)) {
  const script = join(dir, `${id}.sh`);
  writeFileSync(script, Buffer.from(b64, "base64").toString("utf8"));
  const log = join(dir, `${id}.log`);
  writeFileSync(log, "");
  try {
    execFileSync("bash", [script], {
      cwd: dir,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, LOGFILE: log },
      stdio: "ignore",
    });
  } catch {
    // an unterminated construct is a parse error - that is the point
  }
  const n = readFileSync(log, "utf8").split("\n").filter((l) => l.includes("RAN")).length;
  if (n > 0) executed++;
  console.log(`${id.padEnd(30)} executions=${n}  (must be 0)`);
}
console.log(`${Object.keys(NON_EXECUTING).length - executed}/${Object.keys(NON_EXECUTING).length} unterminated snippets executed nothing`);
if (executed !== 0) {
  console.error("ABORT: an unterminated snippet RAN - the advisory there would be hiding a real call site");
  process.exit(2);
}
