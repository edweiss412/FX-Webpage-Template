/**
 * Fixture loader for the historical re-enactment (spec §6).
 *
 * The two incident blobs ship as files rather than being read from git at test
 * time: the acceptance criterion is pinned by the incident itself, and a frozen
 * blob is the one input a corpus that grows cannot move.
 *
 * The `path` each document is given is its REAL repo-relative path at the
 * incident commit, not the fixture path — so every assertion below reads in the
 * probe record's own units (`spec:220`, `plan:112`) and can be checked against
 * `docs/superpowers/specs/ci/probes/2026-08-20-claim-sweep-after-repair-probes.md`
 * §9.2 without translation.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SweepDocument } from "../../lib/specLint/claimSweep";

const FIXTURE_ROOT = join(process.cwd(), "tests/specLint/fixtures/claimSweep");

/** The incident arc's three documents, by their real repo-relative paths. */
export const INCIDENT_SPEC =
  "docs/superpowers/specs/2026-08-18-control-outline-border-token-design.md";
export const INCIDENT_PLAN = "docs/superpowers/plans/2026-08-18-control-outline-border-token.md";
export const INCIDENT_PROBE =
  "docs/superpowers/specs/probes/2026-08-18-border-border-neutral-fill-census.md";

const STEMS: readonly [path: string, stem: string][] = [
  [INCIDENT_SPEC, "spec"],
  [INCIDENT_PLAN, "plan"],
  [INCIDENT_PROBE, "probe"],
];

/** The two frozen commits, in the order the acceptance criterion names them. */
export const INCIDENT_REVS = ["fede5f084", "c272ebed3"] as const;

/**
 * Every frozen fixture, as `[rev, stem, repo-relative path at that commit]`.
 *
 * DERIVED from `INCIDENT_REVS` x `STEMS` rather than typed out, so a document
 * added to the replay joins the byte-identity cover by construction. A
 * hand-listed manifest re-opens the moment somebody adds a file, and nothing
 * tells you it did.
 */
export const FROZEN_FIXTURES: readonly [rev: string, stem: string, path: string][] =
  INCIDENT_REVS.flatMap((rev) =>
    STEMS.map(([path, stem]) => [rev, stem, path] as [string, string, string]),
  );

/** Absolute path of one frozen fixture on disk. */
export function fixturePath(rev: string, stem: string): string {
  return join(FIXTURE_ROOT, rev, `${stem}.md`);
}

/** Split identically to the probe scripts: 1-based line numbers over `split("\n")`. */
export function fixtureLines(rev: string, stem: string): string[] {
  return readFileSync(join(FIXTURE_ROOT, rev, `${stem}.md`), "utf8").split("\n");
}

/** The three arc documents at `rev`, readable, with no repair spans. */
export function incidentDocs(rev: string): SweepDocument[] {
  return STEMS.map(([path, stem]) => ({ path, lines: fixtureLines(rev, stem) }));
}

/** The unified-0 diff of the repair commit over exactly those three documents. */
export function incidentDiff(rev: string): string {
  return readFileSync(join(FIXTURE_ROOT, rev, "repair.diff"), "utf8");
}

/**
 * The R4 repair's nine numeric survivors, verbatim from probes §9.2 —
 * `<path>:<line>:<column>`. Nine DISTINCT lines, which is why the replay set is
 * identical under a line-keyed and a column-keyed identity, and why the live
 * corpus rather than the replay is where the two diverge.
 */
export const FEDE_SURVIVORS: readonly string[] = [
  `${INCIDENT_SPEC}:220:395`,
  `${INCIDENT_SPEC}:282:47`,
  `${INCIDENT_PLAN}:7:246`,
  `${INCIDENT_PLAN}:9:521`,
  `${INCIDENT_PLAN}:18:139`,
  `${INCIDENT_PLAN}:112:122`,
  `${INCIDENT_PLAN}:119:74`,
  `${INCIDENT_PLAN}:140:95`,
  `${INCIDENT_PLAN}:188:37`,
];

/** The three occurrences the transition-sentence rule excludes (probes §9.2). */
export const FEDE_EXCLUDED: readonly string[] = [
  `${INCIDENT_SPEC}:220:83`,
  `${INCIDENT_PLAN}:79:54`,
  `${INCIDENT_PLAN}:102:290`,
];

/**
 * The survivors that sit INSIDE `fede5f084`'s own hunks, measured from that
 * commit's unified-0 diff. The numeric half must report them anyway — the
 * cheaper "outside the repair's diff" rule is refuted by exactly these
 * (probes §3.1), and the spec's consequence bound at spec:220 is an ADDED line.
 */
export const FEDE_SURVIVORS_INSIDE_OWN_HUNKS: readonly string[] = [
  `${INCIDENT_SPEC}:220:395`,
  `${INCIDENT_SPEC}:282:47`,
  `${INCIDENT_PLAN}:112:122`,
];

/** The R2 repair's declared identifier, and its measured occurrence split. */
export const INCIDENT_IDENTIFIER = "PublishedReviewModal.tsx:964";
/** One deleted character: matches ZERO times exactly and NINE times as a substring. */
export const INCIDENT_IDENTIFIER_TRUNCATED = "PublishedReviewModal.tsx:96";
/** Touched on both sides of the repair's hunk with its classification unchanged (probes §8.1). */
export const COLLATERAL_IDENTIFIER = "components/admin/HoverHelp.tsx:562";

/** The four occurrences OUTSIDE the repair's hunks — what the named half reports. */
export const C272_OUTSIDE_SPANS: readonly string[] = [
  `${INCIDENT_SPEC}:268:116`,
  `${INCIDENT_SPEC}:327:301`,
  `${INCIDENT_PLAN}:211:105`,
  `${INCIDENT_PROBE}:64:36`,
];

/** The five occurrences INSIDE them — the repair's own restated claim. */
export const C272_INSIDE_SPANS: readonly string[] = [
  `${INCIDENT_SPEC}:153:1051`,
  `${INCIDENT_SPEC}:155:30`,
  `${INCIDENT_PLAN}:85:83`,
  `${INCIDENT_PLAN}:148:211`,
  `${INCIDENT_PLAN}:149:328`,
];

/** The collateral identifier's three occurrences outside the hunks (probes §8.1). */
export const C272_COLLATERAL_OUTSIDE: readonly string[] = [
  `${INCIDENT_SPEC}:88:8`,
  `${INCIDENT_SPEC}:269:137`,
  `${INCIDENT_PROBE}:121:4`,
];

/** `<path>:<line>:<column>` for a finding, the key every set assertion uses. */
export function siteKey(f: { docPath: string; docLine: number; column: number }): string {
  return `${f.docPath}:${f.docLine}:${f.column}`;
}
