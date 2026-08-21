// The corpus finding set, digest-pinned — the AC-5 drift detector.
//
// Runs with no arguments: prints the counts AND the digest. An output path is
// optional. Spec round 1 finding 6 caught the earlier version REQUIRING argv[2]
// while the spec named it as a runnable command, and never printing the digest
// it was cited for — a probe whose promised output it did not produce.
//
// `--expect <digest>` turns it from a reporter into a GATE: it exits 1 when the
// finding set has moved. A probe that only prints cannot fail, and a check that
// cannot fail is not a check.
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { collectPsqlUsage } from "../../../../../../tests/cross-cutting/psqlStartupFiles/scan.ts";

/** Repo root, derived from this file so the probe runs in any checkout. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../..");

const argv = process.argv.slice(2);
const expectAt = argv.indexOf("--expect");
const expected = expectAt === -1 ? null : argv[expectAt + 1];
const outPath = argv.find((a, i) => !a.startsWith("--") && i !== expectAt + 1) ?? null;

const u = collectPsqlUsage(ROOT) as Record<string, unknown>;
const keys = Object.keys(u);
for (const k of keys) {
  const v = u[k];
  if (Array.isArray(v)) console.log(`${k}: ${v.length}`);
}

const rows: string[] = [];
for (const k of keys) {
  const v = u[k];
  if (!Array.isArray(v)) continue;
  for (const e of v as Array<Record<string, unknown>>) {
    // EVERY field, DERIVED from the record rather than hand-listed, with keys
    // sorted so the serialisation is stable.
    //
    // Spec round 2 finding 2: the earlier digest hashed only key, file, line and
    // text-or-form. All 76 live sites carry `suppressesStartupFiles: true`,
    // `nested: false`, `nestedInBacktick: false` and `exemptReason: null`, so
    // flipping any one of them — a false advisory, or an attribution
    // regression — left the digest IDENTICAL. That is exactly the presence-only
    // blindness this spec diagnosed for case H, in the check written to be the
    // consequence bound. Deriving the field set also means a field added to
    // PsqlSite later is covered by default rather than silently omitted.
    const fields = Object.keys(e)
      .sort()
      .map((f) => `${f}=${JSON.stringify(e[f] ?? null)}`)
      .join("\t");
    rows.push(`${k}\t${fields}`);
  }
}
rows.sort();

// A record that serialises to nothing would hash cleanly and mean nothing.
const FIELD_FLOOR = 5;
const thin = rows.filter((r) => r.split("\t").length - 1 < FIELD_FLOOR);
if (thin.length > 0) {
  console.error(
    `ABORT: ${thin.length} row(s) carry fewer than ${FIELD_FLOOR} fields — the serialisation is not reading the records.`,
  );
  process.exit(2);
}

const body = rows.join("\n") + "\n";
const digest = createHash("sha1").update(body).digest("hex");

console.log(`\nTOTAL ROWS: ${rows.length}`);
console.log(`DIGEST: ${digest}`);

if (outPath) {
  writeFileSync(outPath, body);
  console.log(`wrote ${outPath}`);
}

// A zero-row corpus would digest cleanly and mean nothing (rule: a clean zero
// over an empty population is not a pass).
if (rows.length === 0) {
  console.error("ABORT: zero rows — the walk found nothing, so the digest describes nothing.");
  process.exit(2);
}

if (expected !== null) {
  if (digest === expected) {
    console.log(`PASS: finding set matches the pinned digest over ${rows.length} rows.`);
  } else {
    console.error(`FAIL: finding set MOVED.\n  expected ${expected}\n  actual   ${digest}`);
    process.exit(1);
  }
}
