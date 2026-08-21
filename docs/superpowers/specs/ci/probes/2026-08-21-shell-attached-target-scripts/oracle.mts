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
  "K-fd-prefixed-operator": "Y2F0IDI+IiQocHNxbCAtYyAic2VsZWN0IDEiKSIK"
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
