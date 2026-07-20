#!/usr/bin/env node
// Join the DB-touch probe's JSONL rows against vitest's JSON results, and
// classify every test file.
//
// Two independent signals are needed, because either alone is misleading:
//   - probe rows answer "did this file open a database socket?"
//   - vitest results answer "did this file actually run any tests?"
// A file that skipped (loopback-guarded DB tests skip when TEST_DATABASE_URL is
// remote) opens no socket and would otherwise look DB-free. That is the vacuous
// pass that sank the previous spike, so it gets its own bucket here rather than
// being silently counted as a candidate.
//
// Usage: node scripts/analyze-db-touch.mjs [probeDir]
import fs from "node:fs";
import path from "node:path";

const probeDir = process.argv[2] ?? ".db-touch-probe";

// VALIDITY GATE. The first measurement run was silently worthless: Docker died
// partway through, so the local Postgres went away and DB-bound files began
// SKIPPING instead of connecting. Skipped files open no socket, so they look
// DB-free — reproducing the exact vacuity this instrumentation exists to
// eliminate. Refuse to classify a run whose log shows the database was
// unreachable, rather than leaving it to a human to notice.
const logPath = path.join(probeDir, "run.log");
if (fs.existsSync(logPath)) {
  const log = fs.readFileSync(logPath, "utf8");
  const refused = (log.match(/ECONNREFUSED 127\.0\.0\.1:(54321|54322)/g) ?? []).length;
  if (refused > 0) {
    console.error(
      `REFUSING TO CLASSIFY: ${refused} connection(s) to the local Supabase stack were refused during this run.\n` +
        "The database was down for part of it, so DB-bound files skipped instead of connecting and would be\n" +
        "misclassified as DB-free. Bring the stack up (docker + `supabase start`) and re-run the measurement.",
    );
    process.exit(1);
  }
}

const rows = new Map();
for (const entry of fs.readdirSync(probeDir)) {
  if (!entry.endsWith(".jsonl")) continue;
  const text = fs.readFileSync(path.join(probeDir, entry), "utf8");
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    const row = JSON.parse(line);
    // A file can appear once per worker; sum rather than overwrite.
    const prior = rows.get(row.file);
    rows.set(
      row.file,
      prior
        ? { ...row, total: prior.total + row.total, db: prior.db + row.db }
        : { ...row },
    );
  }
}

const results = JSON.parse(fs.readFileSync(path.join(probeDir, "vitest-results.json"), "utf8"));
const ran = new Map();
for (const result of results.testResults ?? []) {
  const rel = path.relative(process.cwd(), result.name);
  const assertions = result.assertionResults ?? [];
  ran.set(rel, {
    executed: assertions.filter((a) => a.status === "passed" || a.status === "failed").length,
    skipped: assertions.filter((a) => a.status !== "passed" && a.status !== "failed").length,
  });
}

const buckets = { candidate: [], dbTouching: [], vacuous: [], unmeasured: [] };

for (const [file, row] of rows) {
  const counts = ran.get(file);
  if (!counts) {
    buckets.unmeasured.push({ file, ...row });
  } else if (counts.executed === 0) {
    buckets.vacuous.push({ file, ...row, ...counts });
  } else if (row.db > 0) {
    buckets.dbTouching.push({ file, ...row, ...counts });
  } else {
    buckets.candidate.push({ file, ...row, ...counts });
  }
}

// Files vitest ran but the probe never emitted a row for — a probe gap, and a
// loud one: silently dropping them would understate the DB-touching count.
for (const [file, counts] of ran) {
  if (!rows.has(file)) buckets.unmeasured.push({ file, missingProbeRow: true, ...counts });
}

const line = (label, list) => `${label.padEnd(22)} ${String(list.length).padStart(4)}`;
console.log("=== DB-touch classification ===");
console.log(line("DB-touching", buckets.dbTouching));
console.log(line("candidate (ran, no DB)", buckets.candidate));
console.log(line("vacuous (0 executed)", buckets.vacuous));
console.log(line("unmeasured", buckets.unmeasured));
console.log(line("TOTAL", [...rows.keys()]));

fs.writeFileSync(
  path.join(probeDir, "classification.json"),
  `${JSON.stringify(buckets, null, 2)}\n`,
);
console.log(`\nWrote ${path.join(probeDir, "classification.json")}`);
