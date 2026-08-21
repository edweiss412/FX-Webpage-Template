// Does the AC-5 digest DISCRIMINATE on the fields it claims to pin?
//
// Spec round 2 finding 2: the original digest hashed only collection key, file,
// line and text-or-form. Every one of the 76 live sites carries
// `suppressesStartupFiles: true`, `nested: false`, `nestedInBacktick: false` and
// `exemptReason: null` — so flipping any of them produced an IDENTICAL digest. A
// false advisory and an attribution regression, the two directions section 5
// forbids, were both invisible to the check written to be the consequence bound.
//
// Changing the digest is not evidence that it now discriminates. This probe is.
// It flips one field at a time on a CLONE of the real records and requires the
// digest to move for every one.
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { collectPsqlUsage } from "../../../../../../tests/cross-cutting/psqlStartupFiles/scan.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../..");

/** The same serialisation `baseline-corpus.mts` digests. */
function digest(usage: Record<string, unknown>): string {
  const rows: string[] = [];
  for (const k of Object.keys(usage)) {
    const v = usage[k];
    if (!Array.isArray(v)) continue;
    for (const e of v as Array<Record<string, unknown>>) {
      const fields = Object.keys(e)
        .sort()
        .map((f) => `${f}=${JSON.stringify(e[f] ?? null)}`)
        .join("\t");
      rows.push(`${k}\t${fields}`);
    }
  }
  rows.sort();
  return createHash("sha1").update(rows.join("\n") + "\n").digest("hex");
}

const usage = collectPsqlUsage(ROOT) as unknown as { sites: Array<Record<string, unknown>> };
if (usage.sites.length === 0) {
  console.error("ABORT: no sites — nothing to perturb, so a clean result would mean nothing.");
  process.exit(2);
}

const clone = () => JSON.parse(JSON.stringify(usage)) as Record<string, unknown>;
const base = digest(clone());
console.log(`baseline digest: ${base}  over ${usage.sites.length} sites\n`);

/** The fields whose live values are CONSTANT across the corpus, which is what
 *  made the original digest blind to them. */
const FIELDS = [
  "suppressesStartupFiles",
  "nested",
  "nestedInBacktick",
  "exemptReason",
  "hasDynamicTokens",
];

let blind = 0;
for (const field of FIELDS) {
  const m = clone() as { sites: Array<Record<string, unknown>> };
  const before = m.sites[0]![field];
  m.sites[0]![field] = field === "exemptReason" ? "MUTATED" : !before;
  const d = digest(m);
  const detected = d !== base;
  if (!detected) blind++;
  console.log(`flip sites[0].${field.padEnd(24)} ${detected ? "DETECTED" : "*** BLIND ***"}`);
}

console.log(`\n${FIELDS.length - blind}/${FIELDS.length} perturbations detected`);
if (blind > 0) {
  console.error(`FAIL: the digest is blind to ${blind} field(s) it claims to pin.`);
  process.exit(1);
}
console.log("PASS: the digest discriminates on every field section 5 cares about.");
