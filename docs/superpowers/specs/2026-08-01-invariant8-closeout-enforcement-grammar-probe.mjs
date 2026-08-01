#!/usr/bin/env node
// Grammar probe for BL-INVARIANT8-CLOSEOUT-ENFORCEMENT (spec sibling; §3.3 authority twin).
// The accept/reject table below is the plant source for M3/M7/M8; keep in sync with the
// shipped helper through every review round (lane-probe discipline from PR #646).

const RAN =
  /^impeccable-gate: critique=(RAN|RAN-DEGRADED) audit=(RAN|RAN-DEGRADED) p0=(0|[1-9]\d*) p1=(0|[1-9]\d*) dispositions=(recorded|none)$/;
const NA = /^impeccable-gate: N\/A — no UI surface$/;
const TEMPLATE =
  /^impeccable-gate: critique=<RAN\|RAN-DEGRADED> audit=<RAN\|RAN-DEGRADED> p0=<int> p1=<int> dispositions=<recorded\|none>$/;

// inTemplateFile: whether the containing file is in MARKER_TEMPLATE_FILES (§4.5).
function verdict(rawLine, inTemplateFile) {
  const line = rawLine.trimStart(); // §3.3: classify on the trimmed line
  if (!line.startsWith("impeccable-gate:")) return "not-marker";
  const m = RAN.exec(line);
  if (m) {
    const p0 = Number(m[3]);
    const p1 = Number(m[4]);
    const disp = m[5];
    if (p0 + p1 > 0 && disp !== "recorded") return "malformed";
    if (p0 + p1 === 0 && disp !== "none") return "malformed";
    return inTemplateFile ? "malformed" : "valid"; // §4.1.6: valid markers forbidden in template files
  }
  if (NA.test(line)) return inTemplateFile ? "malformed" : "valid";
  if (TEMPLATE.test(line)) return inTemplateFile ? "template" : "malformed";
  return "malformed";
}

const cases = [
  // [line, inTemplateFile, expected]
  ["impeccable-gate: critique=RAN audit=RAN p0=0 p1=0 dispositions=none", false, "valid"],
  ["impeccable-gate: critique=RAN-DEGRADED audit=RAN p0=1 p1=2 dispositions=recorded", false, "valid"],
  ["impeccable-gate: N/A — no UI surface", false, "valid"],
  ["Critique skipped. Audit pending.", false, "not-marker"], // P-HEDGE, the entry's canonical string
  ["For backend-only milestones use `impeccable-gate: N/A — no UI surface` here.", true, "not-marker"], // inline quote, mid-line
  ["impeccable-gate: critique=SKIPPED audit=RAN p0=0 p1=0 dispositions=none", false, "malformed"],
  ["impeccable-gate: critique=RAN p0=0 p1=0 dispositions=none", false, "malformed"],
  ["impeccable-gate: critique=RAN audit=RAN p0=1 p1=0 dispositions=none", false, "malformed"], // cross-check
  ["impeccable-gate: critique=RAN audit=RAN p0=0 p1=0 dispositions=recorded", false, "malformed"], // cross-check
  ["impeccable-gate: critique=RAN audit=RAN p0=00 p1=0 dispositions=none", false, "malformed"], // leading zero
  ["impeccable-gate: N/A — no UI surface (probably)", false, "malformed"],
  ["impeccable-gate: N/A - no UI surface", false, "malformed"], // hyphen, not the ratified em-dash
  ["  impeccable-gate: critique=SKIPPED audit=RAN p0=0 p1=0 dispositions=none", false, "malformed"], // indented typo VISIBLE
  ["  impeccable-gate: critique=RAN audit=RAN p0=0 p1=0 dispositions=none", false, "valid"], // indented valid counts
  ["impeccable-gate: critique=<RAN|RAN-DEGRADED> audit=<RAN|RAN-DEGRADED> p0=<int> p1=<int> dispositions=<recorded|none>", true, "template"],
  ["impeccable-gate: critique=<RAN|RAN-DEGRADED> audit=<RAN|RAN-DEGRADED> p0=<int> p1=<int> dispositions=<recorded|none>", false, "malformed"], // TEMPLATE outside template file
  ["impeccable-gate: critique=RAN audit=RAN p0=0 p1=0 dispositions=none", true, "malformed"], // valid marker inside template file forbidden
];

let fail = 0;
for (const [line, inTpl, want] of cases) {
  const got = verdict(line, inTpl);
  if (got !== want) {
    console.log(`MISMATCH: tpl=${inTpl} ${JSON.stringify(line)} want=${want} got=${got}`);
    fail += 1;
  }
}
console.log(fail === 0 ? `ALL ${cases.length} CASES OK` : `${fail} mismatches`);
process.exit(fail === 0 ? 0 : 1);
