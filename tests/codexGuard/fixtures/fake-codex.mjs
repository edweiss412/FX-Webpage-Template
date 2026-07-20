// Scenario-driven stand-in for the codex CLI. See plan "Fixture scenario protocol"
// (docs/superpowers/plans/2026-07-19-codex-guard/00-plan.md).
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

const recordDir = process.env.FAKE_CODEX_RECORD_DIR;
const scenarioPath = process.env.FAKE_CODEX_SCENARIO;
if (!recordDir || !scenarioPath) {
  process.stderr.write("fake-codex: FAKE_CODEX_RECORD_DIR and FAKE_CODEX_SCENARIO required\n");
  process.exit(97);
}
mkdirSync(recordDir, { recursive: true });
const callN = readdirSync(recordDir).filter((f) => /^call-\d+\.json$/.test(f)).length + 1;

const stdinChunks = [];
let stdinBytes = 0;
process.stdin.on("data", (c) => {
  stdinChunks.push(c);
  stdinBytes += c.length;
});
const stdinDone = new Promise((res) => {
  process.stdin.on("end", res);
  process.stdin.on("error", res);
});

const argv = process.argv.slice(2);
const oIdx = argv.findIndex((a) => a === "-o");
const oFile = oIdx >= 0 ? argv[oIdx + 1] : null;

const scenario = JSON.parse(readFileSync(scenarioPath, "utf8"));
const step = scenario.steps.find((s) => s.onCall === callN) ?? {
  actions: [{ type: "exit", code: 96 }],
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await stdinDone; // wrapper always closes stdin; a hang here IS a wrapper bug surfacing
  writeFileSync(join(recordDir, `pid-${callN}.txt`), String(process.pid));
  writeFileSync(
    join(recordDir, `call-${callN}.json`),
    JSON.stringify({
      argv,
      cwd: process.cwd(),
      stdinBytes,
      stdin: Buffer.concat(stdinChunks).toString("utf8").slice(0, 20000),
      codexHome: process.env.CODEX_HOME ?? null,
    }),
  );
  for (const a of step.actions) {
    if (a.type === "stdout") process.stdout.write(a.text);
    else if (a.type === "stderr") process.stderr.write(a.text);
    else if (a.type === "lastMessage" && oFile) writeFileSync(oFile, a.text);
    else if (a.type === "sleepMs") await sleep(a.ms);
    else if (a.type === "hang") await sleep(2 ** 31 - 1);
    else if (a.type === "emitEvery") {
      const w = a.stream === "stderr" ? process.stderr : process.stdout;
      for (let i = 0; i < a.times; i++) {
        w.write(a.text);
        await sleep(a.ms);
      }
    } else if (a.type === "writeFile") {
      writeFileSync(a.path.replace("$CODEX_HOME", process.env.CODEX_HOME ?? ""), a.text);
    } else if (a.type === "grandchild") {
      // The grandchild writes its own pid file AFTER registering the SIGTERM handler —
      // the file's existence proves the handler is live (a fixture-side write races the
      // grandchild's V8 boot, and an early SIGTERM would kill it via the default action).
      const gc = spawn(
        process.execPath,
        [
          "-e",
          "process.on('SIGTERM',()=>{}); require('node:fs').writeFileSync(process.argv[1], String(process.pid)); setInterval(()=>{},1e6)",
          join(recordDir, `grandchild-pid-${callN}.txt`),
        ],
        { detached: false, stdio: "ignore" },
      );
      void gc;
    } else if (a.type === "exit") process.exit(a.code);
  }
  process.exit(0);
}
main();
