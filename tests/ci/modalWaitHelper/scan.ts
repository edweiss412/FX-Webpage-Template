/**
 * tests/ci/modalWaitHelper/scan.ts — the modal-wait guard's predicate module.
 *
 * Spec: docs/superpowers/specs/ci/2026-08-16-modal-wait-boundary-helper-adoption-design.md
 * §4.4 (the guard) and §2.1 / AC-2b (the candidate enumeration).
 *
 * Three exports, ONE shared route constant:
 *
 *   MODAL_ROUTE_PATTERN   the single source for "a /admin route carrying a
 *                         `show` query param in ANY position". Both the
 *                         violation scan and candidate origin (a) resolve it,
 *                         never two regexes that happen to agree (AC-2b-pattern).
 *   scanForViolations()   the guard: a line that both calls `goto(` and carries
 *                         that route is a violation unless it declares an
 *                         exemption.
 *   enumerateCandidates() every open site the five §2.1 origins can produce,
 *                         with NO hand-maintained list on either side — the
 *                         test-side half is a filesystem walk, the product-side
 *                         half is a scan of app/ + components/ + the alert
 *                         action builders.
 *
 * Population is walked from disk, so a NEW spec file is covered by default
 * rather than silently exempt. `tests/e2e/helpers/**` is outside the population
 * by construction, which is why the helper's own `page.goto` needs no exemption.
 *
 * Deliberate narrowness (§4.4 fence): the guard recognizes the single-line
 * navigation shape only. A URL assembled on a previous line and passed as a
 * variable, a click-open, and any adversarial spelling are NOT recognized —
 * they file to documented limits 5 and 7, never to guard growth.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * A `/admin` route carrying a `show` query parameter in ANY parameter position.
 *
 * The character class stops at a quote or backtick so the match cannot run past
 * the end of the string literal it started in. Not `/g` — a global regex carries
 * `lastIndex` between `.test()` calls and would skip every other line.
 */
export const MODAL_ROUTE_PATTERN = /admin\?[^"'`]*\bshow=/;

/** A `goto(` call on this line. Matches `page.goto(`, `pageB.goto(`, bare `goto(`. */
const GOTO_CALL = /\bgoto\(/;

/** The escape hatch: `// modal-wait-exempt: <reason>` on the line or the one above. */
const EXEMPTION_MARKER = /\/\/\s*modal-wait-exempt:(.*)$/;

/** Origin (b): a `goto(` whose first argument is not a string literal. */
const GOTO_LITERAL_FIRST_ARG = /\bgoto\(\s*[`"']/;

/** Origin (c): the legacy route that 307s into the modal. */
const LEGACY_SHOW_ROUTE = "/admin/show/";

/** Origin (e): a re-navigation of the URL already in the address bar. */
const RENAVIGATION_CALL = /\b(?:reload|goBack|goForward)\(/;

/** Origin (d), product side: a client island that builds the open href. */
const OPEN_HREF_CALL = /\bopenHref\(/;

/** How far from an href site to look for the enclosing element's testid. */
const TESTID_WINDOW = 12;

const TESTID_ATTR = /data-testid=(?:\{`([^`$]*)|["']([^"']*)["'])/;

export type SourceLine = { file: string; line: number; text: string };

export type Violation = SourceLine;

export type Exemption = SourceLine & { reason: string };

export type ScanResult = { violations: Violation[]; exemptions: Exemption[] };

export type CandidateOrigin =
  | "a-route-literal"
  | "b-nonliteral-goto"
  | "c-legacy-route"
  | "d-link-activation"
  | "e-renavigation";

export type Candidate = SourceLine & { origin: CandidateOrigin };

export type ProductOpenSurface = {
  file: string;
  line: number;
  /** The literal prefix of the element's data-testid, where it has one. */
  testIdPrefix: string | null;
};

function readLines(absolute: string): string[] {
  return readFileSync(absolute, "utf8").split("\n");
}

/** Filesystem walk of `tests/e2e/*.spec.ts` — top level only, matching the glob. */
export function e2eSpecFiles(root: string): string[] {
  const dir = join(root, "tests", "e2e");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".spec.ts"))
    .map((name) => join("tests", "e2e", name))
    .sort();
}

function walkSourceFiles(root: string, relativeDir: string): string[] {
  const absolute = join(root, relativeDir);
  // A throwaway fixture root holds only tests/e2e; the product scan contributes
  // nothing there rather than throwing. The real repo always has both trees,
  // which the meta-test asserts as a premise so this cannot silently empty
  // origin (d) in production.
  if (!existsSync(absolute)) return [];
  const out: string[] = [];
  const visit = (dirAbsolute: string): void => {
    for (const entry of readdirSync(dirAbsolute).sort()) {
      const child = join(dirAbsolute, entry);
      if (statSync(child).isDirectory()) {
        visit(child);
        continue;
      }
      if (child.endsWith(".ts") || child.endsWith(".tsx")) {
        out.push(relative(root, child).split(sep).join("/"));
      }
    }
  };
  visit(absolute);
  return out;
}

/**
 * The exemption declared for `index` (0-based), or null when there is none.
 * An empty reason returns the empty string, which the caller treats as a
 * violation — an exemption that explains nothing is not an exemption.
 */
function exemptionReasonAt(lines: string[], index: number): string | null {
  for (const candidateIndex of [index, index - 1]) {
    const text = lines[candidateIndex];
    if (text === undefined) continue;
    const match = EXEMPTION_MARKER.exec(text);
    if (match) return (match[1] ?? "").trim();
  }
  return null;
}

/**
 * The guard. A line in the population that both calls `goto(` and carries the
 * modal route is a violation, unless it declares a non-empty exemption reason.
 */
export function scanForViolations(root: string = process.cwd()): ScanResult {
  const violations: Violation[] = [];
  const exemptions: Exemption[] = [];

  for (const file of e2eSpecFiles(root)) {
    const lines = readLines(join(root, file));
    lines.forEach((text, index) => {
      if (!GOTO_CALL.test(text) || !MODAL_ROUTE_PATTERN.test(text)) return;
      const site: SourceLine = { file, line: index + 1, text: text.trim() };
      const reason = exemptionReasonAt(lines, index);
      if (reason === null || reason === "") {
        violations.push(site);
        return;
      }
      exemptions.push({ ...site, reason });
    });
  }

  return { violations, exemptions };
}

/**
 * Origin (d), product half: every client surface whose href or push targets the
 * review-modal route, with the enclosing element's testid prefix where it has
 * one. Nothing about this list is typed by hand.
 */
export function productOpenSurfaces(root: string = process.cwd()): ProductOpenSurface[] {
  const files = [
    ...walkSourceFiles(root, "app"),
    ...walkSourceFiles(root, "components"),
    // The alert action builders are the indirection every BellPanel /
    // HealthAlertsPanel `action.href` resolves through (spec §2.1 (d)).
    "lib/adminAlerts/alertActions.ts",
  ].filter((file) => existsSync(join(root, file)));

  const surfaces: ProductOpenSurface[] = [];
  for (const file of files) {
    const lines = readLines(join(root, file));
    lines.forEach((text, index) => {
      const isOpenSite = MODAL_ROUTE_PATTERN.test(text) || OPEN_HREF_CALL.test(text);
      if (!isOpenSite) return;
      surfaces.push({ file, line: index + 1, testIdPrefix: nearestTestIdPrefix(lines, index) });
    });
  }
  return surfaces;
}

function nearestTestIdPrefix(lines: string[], index: number): string | null {
  for (let distance = 0; distance <= TESTID_WINDOW; distance += 1) {
    for (const probe of distance === 0 ? [index] : [index - distance, index + distance]) {
      const text = lines[probe];
      if (text === undefined) continue;
      const match = TESTID_ATTR.exec(text);
      if (!match) continue;
      const prefix = (match[1] ?? match[2] ?? "").trim();
      if (prefix !== "") return prefix;
    }
  }
  return null;
}

/**
 * Every open site the five §2.1 origins can produce. The union is the input to
 * the total disposition (AC-2b): every candidate here is a member or an
 * exclusion, with no leftovers on either side.
 */
export function enumerateCandidates(root: string = process.cwd()): Candidate[] {
  const testIdPrefixes = [
    ...new Set(
      productOpenSurfaces(root)
        .map((surface) => surface.testIdPrefix)
        .filter((prefix): prefix is string => prefix !== null),
    ),
  ];

  const candidates: Candidate[] = [];
  for (const file of e2eSpecFiles(root)) {
    const lines = readLines(join(root, file));
    lines.forEach((text, index) => {
      const site = { file, line: index + 1, text: text.trim() };
      const push = (origin: CandidateOrigin): void => {
        candidates.push({ ...site, origin });
      };

      if (MODAL_ROUTE_PATTERN.test(text)) push("a-route-literal");
      if (GOTO_CALL.test(text) && !GOTO_LITERAL_FIRST_ARG.test(text)) push("b-nonliteral-goto");
      if (text.includes(LEGACY_SHOW_ROUTE)) push("c-legacy-route");
      if (testIdPrefixes.some((prefix) => text.includes(prefix))) push("d-link-activation");
      if (RENAVIGATION_CALL.test(text)) push("e-renavigation");
    });
  }
  return candidates;
}

/** The shape a disposition rule must have to be classifiable. Authored in disposition.ts. */
export type ClassifiableRule = {
  id: string;
  origin: CandidateOrigin;
  expectedCount?: number;
  match: (candidate: Candidate) => boolean;
};

export type Classification = {
  /** Candidates no rule claims — the AC-2b failure. */
  undisposed: Candidate[];
  /** Candidates two or more rules claim — the disposition is ambiguous, not total. */
  ambiguous: Array<{ candidate: Candidate; ruleIds: string[] }>;
  /** Actual match count per rule id, including the rules that matched nothing. */
  countsByRule: Map<string, number>;
};

/**
 * The total-disposition check (AC-2b): every candidate is claimed by exactly one
 * rule. A candidate no rule claims is undisposed; a candidate two rules claim is
 * ambiguous, which is the same defect wearing the other face — the disposition
 * has to say ONE thing about each site.
 */
export function classifyCandidates(
  candidates: Candidate[],
  rules: readonly ClassifiableRule[],
): Classification {
  const undisposed: Candidate[] = [];
  const ambiguous: Array<{ candidate: Candidate; ruleIds: string[] }> = [];
  const countsByRule = new Map<string, number>(rules.map((rule) => [rule.id, 0]));

  for (const candidate of candidates) {
    const hits = rules.filter((rule) => rule.origin === candidate.origin && rule.match(candidate));
    if (hits.length === 0) undisposed.push(candidate);
    if (hits.length > 1) ambiguous.push({ candidate, ruleIds: hits.map((rule) => rule.id) });
    for (const hit of hits) countsByRule.set(hit.id, (countsByRule.get(hit.id) ?? 0) + 1);
  }

  return { undisposed, ambiguous, countsByRule };
}
