#!/usr/bin/env node
// A stand-in for ps(1), selected via FX_REAP_PS_BIN. Serves both invocations the reaper makes:
// the bulk table read and the per-target identity read.
//
// The table comes from FAKE_PS_TABLE, a JSON array of {pid, ppid, etime, command} (a string entry
// is emitted verbatim, which is how an unparsable row is produced). Tests that exercise --kill put
// the pids of processes THEY SPAWNED in it, so the reaper only ever signals something the test
// owns. FAKE_PS_MODE injects failures.
const args = process.argv.slice(2);
const mode = process.env.FAKE_PS_MODE ?? "table";
const identityRead = args.includes("-o");
// One start time for the whole fixture, so the bulk row and the pre-signal read AGREE by default;
// FAKE_PS_IDENTITY_DRIFT is what makes them disagree, which is K2.
const LSTART = "Sun Aug 16 09:35:23 2026";

if (mode === "fail" && !identityRead) process.exit(2);
if (mode === "identity-fail" && identityRead) process.exit(2);
// A status-1 exit WITH output on EITHER stream is a ps error, not "no such pid": K6, never K1.
if (mode === "identity-noisy-fail" && identityRead) {
  process.stdout.write("ps: some diagnostic\n");
  process.exit(1);
}
if (mode === "identity-stderr-fail" && identityRead) {
  process.stderr.write("ps: some diagnostic\n");
  process.exit(1);
}
if ((mode === "hang" && !identityRead) || (mode === "identity-hang" && identityRead)) {
  setTimeout(() => {}, 60_000);
} else if (!identityRead) {
  const rows = JSON.parse(process.env.FAKE_PS_TABLE ?? "[]");
  // The reaper is this process's PARENT, so injecting a worker-shaped row for `process.ppid` is
  // the only way an end-to-end case can reach the `self` decline: the CLI's pid is not knowable
  // before it is launched.
  if (process.env.FAKE_PS_INCLUDE_SELF === "1") {
    rows.push({
      pid: process.ppid,
      ppid: 1,
      etime: "1-05:29:53",
      command: "/usr/bin/node /x/node_modules/vitest/dist/workers/forks.js",
    });
  }
  process.stdout.write(
    rows
      .map((r) =>
        typeof r === "string" ? r : `${r.pid} ${r.ppid} ${r.etime} ${LSTART} ${r.command}`,
      )
      .map((l) => `${l}\n`)
      .join(""),
  );
} else {
  const pid = args[args.indexOf("-p") + 1];
  if (process.env.FAKE_PS_IDENTITY_GONE === pid) process.exit(1); // status 1, NO output: K1
  // DRIFT makes the PRE-SIGNAL read disagree with the start time the bulk row carried, which is
  // exactly K2: the identity changed since classification. There is only ONE identity read per
  // target now, so this needs no call counter.
  const startedAt =
    process.env.FAKE_PS_IDENTITY_DRIFT === "1" ? "Mon Aug 17 11:11:11 2026" : LSTART;
  const rows = JSON.parse(process.env.FAKE_PS_TABLE ?? "[]");
  const row = rows.find((r) => typeof r !== "string" && String(r.pid) === String(pid));
  const command = row ? row.command : `/usr/bin/node /x/worker-${pid}`;
  process.stdout.write(`${startedAt} ${command}\n`);
}
