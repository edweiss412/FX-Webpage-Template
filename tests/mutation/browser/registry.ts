import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname } from "node:path";
import type { AcceptedSurvivor } from "../source/ledger";

/**
 * The browser-mutant registry (spec §2).
 *
 * Enrollment is opt-in and explicit, exactly as the vitest mode's registry is
 * (`tests/mutation/source/registry.ts`): one row per surface, no discovery, no
 * inference from path or filename.
 *
 * The ONE structural difference is the operator family. A Playwright guard
 * suite's mutants are bespoke component edits no declared operator expresses, so
 * this mode's family is a CLOSED, hand-enumerated list of explicit edits per
 * surface — deliberately not a generic className/AST operator, because each
 * widening of a recognizer is a bigger target for the next review round
 * (spec §1.1.2).
 */
export type MutantEdit = {
  /** Repo-relative (or absolute) path of the file the edit targets. Must exist. */
  file: string;
  /** Exact source text to replace. MUST occur exactly once in `file`. */
  from: string;
  /** Replacement text. `""` expresses a removal. MUST differ from `from`. */
  to: string;
};

export type ExplicitMutant = {
  /** Surface-unique stable key; the ledger/site id is `explicit:<key>`. */
  key: string;
  /** 1..N substitutions applied together as ONE atomic mutant. */
  edits: MutantEdit[];
  /** What production defect this mutant isolates, with its origin citation. */
  reason: string;
};

export type DecidingSuite =
  | { kind: "playwright"; config: string; filter: string; project: string }
  | { kind: "vitest"; path: string };

export type BrowserGuardSurface = {
  id: string;
  /** All suites run per mutant; a mutant is KILLED if ANY suite rejects it. */
  suites: DecidingSuite[];
  mutants: ExplicitMutant[];
  /** Minimum acceptable mutation score, in (0, 1]. */
  scoreFloor: number;
  /** Liveness control: a hand-chosen edit the suites must obviously kill. */
  control: ExplicitMutant;
  accepted: AcceptedSurvivor[];
};

/**
 * The ledger/site id of an explicit mutant.
 *
 * CONTENT-anchored, not positional. The vitest mode derives ids from position so
 * that drift surfaces as a stale-plus-new pair
 * (`tests/mutation/source/operators.ts:42-47`); an explicit mutant's anchor is
 * the `from` text itself, so drift surfaces EARLIER and LOUDER — a `from` that
 * no longer occurs exactly once fails validation before any child spawns.
 */
export const browserSiteId = (mutant: { key: string }): string => `explicit:${mutant.key}`;

/** A `BACKLOG.md` / `DEFERRED.md` entry id, matching the repo-wide citation shape. */
const BACKLOG_REF = /^(BL|DEF)-[A-Z0-9]+(-[A-Z0-9]+)*$/;

/**
 * Per-edit anchor rules, applied to every mutant AND to the control.
 *
 * Zero occurrences is an unreachable mutant, two is an ambiguous anchor — both
 * authoring errors, and the same rule the vitest control anchor carries
 * (`tests/mutation/source/registry.ts:88-98`).
 */
function validateEdits(label: string, edits: readonly MutantEdit[], problems: string[]): void {
  if (edits.length === 0) {
    problems.push(`${label}: edits is empty; it mutates nothing`);
    return;
  }

  edits.forEach((edit, i) => {
    const where = `${label} edit ${i}`;
    if (edit.from === edit.to) {
      problems.push(`${where}: from and to are identical; it mutates nothing`);
    }
    if (!edit.file || !existsSync(edit.file)) {
      problems.push(`${where}: file does not exist on disk: ${edit.file}`);
      return;
    }
    // An empty `from` would make `split` report one occurrence per character
    // boundary; reject it as its own problem rather than as a count.
    if (edit.from === "") {
      problems.push(`${where}: from is empty; an empty anchor targets nothing`);
      return;
    }
    const occurrences = readFileSync(edit.file, "utf8").split(edit.from).length - 1;
    if (occurrences === 0) {
      problems.push(`${where}: from does not occur in ${edit.file}: ${JSON.stringify(edit.from)}`);
    } else if (occurrences > 1) {
      problems.push(
        `${where}: from occurs ${occurrences} times in ${edit.file}; ` +
          `an ambiguous anchor makes the edit's target unknowable, so it must occur exactly once`,
      );
    }
  });
}

function validateMutant(label: string, mutant: ExplicitMutant, problems: string[]): void {
  if (mutant.key.trim() === "") {
    problems.push(`${label}: key is empty; every mutant needs a stable site id`);
  }
  if (mutant.reason.trim() === "") {
    problems.push(`${label}: reason is empty; a mutant must name the defect it isolates`);
  }
  validateEdits(label, mutant.edits, problems);
}

/**
 * Static validation. Returns a list of problems; empty means valid.
 *
 * Every problem is reported — never short-circuited — because a validation
 * failure is a gate failure raised BEFORE any child spawns, and one problem per
 * run turns one ~25-minute run into N of them.
 *
 * The ledger checks below RESTATE rather than import the vitest mode's rules:
 * they live inline in `validateSurface` (`tests/mutation/source/registry.ts:100-138`)
 * with no exported seam, and extracting one would edit the vitest-mode registry,
 * which spec §10 fences off. The one rule that is NOT carried over is the
 * operator-prefix check, which has no meaning for a content-anchored
 * `explicit:<key>` id; its analogue — the row must name a mutant this surface
 * declares — replaces it.
 */
export function validateBrowserSurface(surface: BrowserGuardSurface): string[] {
  const problems: string[] = [];
  const id = surface.id;

  if (surface.suites.length === 0) {
    problems.push(`${id}: suites is empty; no suite can decide any verdict`);
  }
  for (const suite of surface.suites) {
    if (suite.kind === "vitest") {
      if (!existsSync(suite.path)) {
        problems.push(`${id}: vitest suite path does not exist: ${suite.path}`);
      }
      continue;
    }
    if (!existsSync(suite.config)) {
      problems.push(`${id}: playwright suite config does not exist: ${suite.config}`);
      continue;
    }
    // A filter resolving zero tests is the no-tests trap: every mutant would run
    // nothing and score SURVIVED. The baseline closes it at run time (spec §3.3
    // step 1); this closes it at authoring time, which is cheaper by ~25 minutes.
    const specDir = dirname(suite.config);
    const matches = readdirSync(specDir).filter((f) => f.includes(suite.filter));
    if (matches.length === 0) {
      problems.push(
        `${id}: playwright suite filter matches no spec file in ${specDir}: ${suite.filter}`,
      );
    }
  }

  if (surface.mutants.length === 0) {
    problems.push(`${id}: mutants is empty; the run would generate 0 mutants and score NaN`);
  }

  const seenKeys = new Set<string>();
  for (const mutant of surface.mutants) {
    if (seenKeys.has(mutant.key)) {
      problems.push(`${id}: duplicate mutant key: ${mutant.key}`);
    }
    seenKeys.add(mutant.key);
    validateMutant(`${id}: mutant ${mutant.key}`, mutant, problems);
  }

  validateMutant(`${id}: control ${surface.control.key}`, surface.control, problems);

  const floor = surface.scoreFloor;
  if (!Number.isFinite(floor) || floor <= 0 || floor > 1) {
    problems.push(`${id}: scoreFloor must be a finite number in (0, 1], got ${floor}`);
  }

  const declaredSites = new Set(surface.mutants.map(browserSiteId));
  const seenRows = new Set<string>();
  for (const row of surface.accepted) {
    if (seenRows.has(row.siteId)) problems.push(`${id}: duplicate ledger siteId: ${row.siteId}`);
    seenRows.add(row.siteId);

    if (!declaredSites.has(row.siteId)) {
      problems.push(
        `${id}: ledger row siteId names no mutant this surface declares: ${row.siteId}`,
      );
    }

    if (row.reason.trim() === "") {
      problems.push(`${id}: ledger row has an empty reason: ${row.siteId}`);
    }

    // Asymmetric on purpose, exactly as the vitest mode is: a deliberately
    // uncovered gap is debt and must be tracked; a proven equivalence is not.
    if (row.kind === "accepted-gap") {
      const ref = row.ref?.trim() ?? "";
      if (ref === "") {
        problems.push(`${id}: accepted-gap row requires a ref: ${row.siteId}`);
      } else if (!BACKLOG_REF.test(ref)) {
        problems.push(
          `${id}: accepted-gap ref must be a BL-*/DEF-* ledger id, got "${ref}" (${row.siteId})`,
        );
      }
    }
  }

  return problems;
}

/**
 * Enrolled browser surfaces.
 *
 * NO DARK ROWS (spec §1.1.5): a surface is listed here only once the runner can
 * execute its mutants. The tap-target surface is populated in the enrolment task.
 */
export const BROWSER_SURFACES: BrowserGuardSurface[] = [];
