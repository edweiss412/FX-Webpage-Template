// Invariant-8 closeout walker for the plans-tree closeout guard.
//
// Port of the reviewed probes at
// docs/superpowers/specs/2026-08-01-invariant8-closeout-enforcement-probes.mjs
// (unit partition + declaration fold) and
// docs/superpowers/specs/2026-08-01-invariant8-closeout-enforcement-grammar-probe.mjs
// (marker grammar; 17-case accept/reject table). Spec:
// docs/superpowers/specs/2026-08-01-invariant8-closeout-enforcement-design.md
// (canonical; spec r3 APPROVE + two ratified deltas recorded in §4/§8).
//
// HONEST CEILING (spec §7): this walker and its guard verify that a declaring
// plan unit CARRIES a well-formed gate claim (the marker line), not that the
// impeccable gate actually ran or that its findings are honest. A fabricated
// marker is a deliberate lie in a reviewed diff — reviewer territory. The
// guard's green means "every declaring unit carries a claim or a frozen debt
// row", nothing stronger.

import { readdirSync } from "node:fs";
import { join } from "node:path";

export interface Marker {
  form: "ran" | "na";
  critique?: "RAN" | "RAN-DEGRADED";
  audit?: "RAN" | "RAN-DEGRADED";
  p0?: number;
  p1?: number;
  dispositions?: "recorded" | "none";
}

export interface ParsedMarkers {
  valid: Marker[];
  template: number;
  malformed: string[];
}

export type UnitVerdict = "conforms" | "no-marker" | "malformed-marker";

const DATED = /^\d{4}-\d{2}-\d{2}-/;
const CRITIQUE = /impeccable critique/i;
const AUDIT = /impeccable audit/i;
const CLOSEOUT_SUFFIX = /-(closeout|CLOSEOUT)\.md$/;

// §3.3 — exact, anchored on the trimmed line. Integers reject leading zeros.
const RAN_FORM =
  /^impeccable-gate: critique=(RAN|RAN-DEGRADED) audit=(RAN|RAN-DEGRADED) p0=(0|[1-9]\d*) p1=(0|[1-9]\d*) dispositions=(recorded|none)$/;
const NA_FORM = /^impeccable-gate: N\/A — no UI surface$/;
const TEMPLATE_FORM =
  /^impeccable-gate: critique=<RAN\|RAN-DEGRADED> audit=<RAN\|RAN-DEGRADED> p0=<int> p1=<int> dispositions=<recorded\|none>$/;
const MARKER_PREFIX = "impeccable-gate:";

/** Filesystem acquisition (spec r1 F1: its own exported layer). Returns root-relative paths. */
export function walkPlansTree(rootAbsPath: string): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    for (const ent of readdirSync(join(rootAbsPath, rel), { withFileTypes: true })) {
      const childRel = rel === "" ? ent.name : `${rel}/${ent.name}`;
      if (ent.isDirectory()) walk(childRel);
      else out.push(childRel);
    }
  };
  walk("");
  return out.sort();
}

/**
 * §3.1 partition: topmost dated segment opens a unit; the closeout-attach rule
 * folds a stem-matching `-closeout.md`/`-CLOSEOUT.md` sibling into its plan's
 * unit (r2 F1 ratification). Undated files are reported separately.
 */
export function partitionUnits(paths: string[]): {
  units: Map<string, string[]>;
  undated: string[];
} {
  const flatSet = new Set(
    paths.filter((rel) => {
      const segs = rel.split("/");
      const datedIdx = segs.findIndex((s) => DATED.test(s));
      return datedIdx !== -1 && datedIdx === segs.length - 1;
    }),
  );
  const attachTarget = (rel: string): string | null => {
    if (!CLOSEOUT_SUFFIX.test(rel)) return null;
    const plan = rel.replace(CLOSEOUT_SUFFIX, ".md");
    return flatSet.has(plan) ? plan : null;
  };

  const units = new Map<string, string[]>();
  const undated: string[] = [];
  for (const rel of paths) {
    const segs = rel.split("/");
    const datedIdx = segs.findIndex((s) => DATED.test(s));
    if (datedIdx === -1) {
      undated.push(rel);
      continue;
    }
    let key = segs.slice(0, datedIdx + 1).join("/");
    if (datedIdx === segs.length - 1) {
      const target = attachTarget(rel);
      if (target !== null) key = target;
    }
    const members = units.get(key);
    if (members === undefined) units.set(key, [rel]);
    else members.push(rel);
  }
  return { units, undated };
}

/** §3.2 — the unit-wide fold: some file matches critique AND some file matches audit. */
export function declaresGate(files: Map<string, string>): boolean {
  let anyCritique = false;
  let anyAudit = false;
  for (const text of files.values()) {
    if (!anyCritique && CRITIQUE.test(text)) anyCritique = true;
    if (!anyAudit && AUDIT.test(text)) anyAudit = true;
    if (anyCritique && anyAudit) return true;
  }
  return false;
}

/**
 * §3.3 — classify every marker line in `text` (leading-whitespace-TRIMMED
 * before classification, so indented typos are rejected, never invisible).
 * `opts.template` is whether the containing file is a template file (§4.5):
 * there the TEMPLATE form is allowed (and non-conferring) while valid
 * RAN/N-A forms are forbidden (§4.1.6); everywhere else the TEMPLATE form
 * is malformed. Template-ness is a parameter, not a registry read (r2 F1).
 */
export function parseMarkers(text: string, opts: { template: boolean }): ParsedMarkers {
  const result: ParsedMarkers = { valid: [], template: 0, malformed: [] };
  for (const rawLine of text.split("\n")) {
    // CRLF checkouts are honest inputs (whole-diff r1): strip the \r before
    // classification so a Windows working tree cannot red every valid marker.
    const line = rawLine.replace(/\r$/, "").trimStart();
    if (!line.startsWith(MARKER_PREFIX)) continue;
    const ran = RAN_FORM.exec(line);
    if (ran !== null) {
      const p0 = Number(ran[3]);
      const p1 = Number(ran[4]);
      const dispositions = ran[5] as "recorded" | "none";
      const crossCheckOk =
        p0 + p1 > 0 ? dispositions === "recorded" : dispositions === "none";
      if (!crossCheckOk || opts.template) {
        result.malformed.push(line);
        continue;
      }
      result.valid.push({
        form: "ran",
        critique: ran[1] as "RAN" | "RAN-DEGRADED",
        audit: ran[2] as "RAN" | "RAN-DEGRADED",
        p0,
        p1,
        dispositions,
      });
      continue;
    }
    if (NA_FORM.test(line)) {
      if (opts.template) result.malformed.push(line);
      else result.valid.push({ form: "na" });
      continue;
    }
    if (TEMPLATE_FORM.test(line)) {
      if (opts.template) result.template += 1;
      else result.malformed.push(line);
      continue;
    }
    result.malformed.push(line);
  }
  return result;
}

/**
 * Strictness rule (§3.3): ONE valid marker conforms the unit, but ONE
 * malformed marker line anywhere reds it regardless — a typo'd marker must
 * never silently not-count.
 */
export function unitVerdict(
  files: Map<string, string>,
  opts: { templateFiles: ReadonlySet<string> },
): UnitVerdict {
  let anyValid = false;
  let anyMalformed = false;
  for (const [path, text] of files) {
    const parsed = parseMarkers(text, { template: opts.templateFiles.has(path) });
    if (parsed.valid.length > 0) anyValid = true;
    if (parsed.malformed.length > 0) anyMalformed = true;
  }
  if (anyMalformed) return "malformed-marker";
  return anyValid ? "conforms" : "no-marker";
}
