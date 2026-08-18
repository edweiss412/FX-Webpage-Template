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
 * CANDIDATE CONTRACT v2 — THE UNIT OF CLASSIFICATION IS THE TYPESCRIPT
 * STATEMENT (2026-08-17 spec
 * docs/superpowers/specs/ci/2026-08-17-modal-wait-candidate-contract-design.md).
 * Both of the parent arc's documented limits were CLASSES, not lists, and both
 * had the same root: a candidate carried one physical line, so origin (d) could
 * only ever answer "does THIS LINE activate" and origin (f) could only ever
 * count waits in aggregate. Formatting decided what the census could see.
 *
 * The producer now parses each population file and attributes every origin match
 * to its NEAREST ENCLOSING STATEMENT, so a split-chained activation (`await page`
 * / `.getByTestId(...)` / `.press("Enter")`) and a `page.evaluate` body whose
 * `click()` sits above the testid on the argument line are both ONE candidate
 * carrying the verb in its text. `disposition.ts`'s refusal gates read that
 * text, so an activation the rules do not recognize falls through to
 * `undisposed` — in front of a human — instead of into a silent exclusion.
 * Closes BL-MODAL-WAIT-LINE-GRANULARITY-ACTIVATION.
 *
 * Origin matching runs over COMMENT-STRIPPED bytes, not raw text. The stripper
 * preserves length and offsets, so a match offset addresses the same location in
 * the raw AST while a comment byte is a space when the regexes run. This is the
 * mechanism, not a parser premise: spec review R2 refuted "trivia has no
 * enclosing statement" by probe — a comment position sits INSIDE the enclosing
 * statement's span and `getText()` includes interior comments, so a raw-text
 * census silently re-certified a commented-out activation at all nine
 * current-corpus instances of the class. Comments therefore produce no
 * candidates at all, and commenting a member site out drops its candidate and
 * REDS the member count.
 *
 * Waits are SITE-ASSOCIATED, by declaration. `disposition.ts`'s `N_WAIT_SITES`
 * declares every `awaitReviewModalOrRecover` call as a (file, enclosing scope
 * title, label source text) triple, and `observedNWaitSites` below is the
 * observation half. A wait cut from one test and pasted into another arrives
 * with the wrong scope and reds NAMING BOTH ENDS while the count stays 12 —
 * the move the aggregate count could not see. Closes
 * BL-MODAL-WAIT-SITE-ASSOCIATED-COUNTS.
 *
 * DOCUMENTED LIMIT — within-scope PLACEMENT is invisible. The registry pins
 * presence and scope, never position: a wait relocated WITHIN its declared
 * (file, scope) keeps its triple, including the worst placement, below the
 * assertions it protects. Verifying position means classifying the downstream
 * assertions a wait protects, which is the control-flow analysis both ledger
 * rows declined. Cost, stated exactly: a mis-placed wait leaves its scope
 * failing the gateway-502 class as a generic downstream timeout, without the
 * annotation or the `show_review_snapshot_failed` hint — degraded but LOUD,
 * never a silent pass.
 *
 * DOCUMENTED LIMIT — a lying declaration passes. A registry row or a label that
 * names the wrong site is consistent as far as this census can see; declarations
 * are trusted as declarations, exactly as the ledger's invariant-12 status
 * markers are. What the census buys is REVIEWABILITY — the label sits in the
 * diff beside the site it claims.
 *
 * DOCUMENTED LIMIT — cross-STATEMENT and cross-FUNCTION activation. A binding
 * (`const trigger = page.locator(...)`) and a later `trigger.click()` are two
 * statements, and an activation inside a project helper the statement merely
 * CALLS is not in its text at all. Both fall to `undisposed` through the
 * narrowed reference arms rather than to silent certification.
 *
 * Deliberate narrowness (§4.4 fence): the guard recognizes the single-line
 * navigation shape only. A URL assembled on a previous line and passed as a
 * variable, a click-open, and any adversarial spelling are NOT recognized —
 * they file to documented limits 5 and 7, never to guard growth.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import ts from "typescript";

import { stripCommentsForFile } from "../../_shared/stripComments";

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

/**
 * Origin (f): a site that has ALREADY ADOPTED the helper.
 *
 * Without this origin the census silently loses every adopted site the moment it
 * adopts. A Shape-G call is `openShowReviewModal(page, slug)` — it carries no
 * route text, so origin (a) cannot see it, and no other origin proposes it
 * either. Diff review measured the consequence: 28 of the 51 member sites had
 * dropped out of the candidate set, leaving the "total disposition over the
 * member census" ranging over 20 members instead of 51.
 *
 * Import lines are excluded: an import is not an open site.
 */
const HELPER_CALL =
  /\b(?:openShowReviewModalAt|openShowReviewModal|awaitReviewModalOrRecover|openShowReviewFrameAt|awaitReviewFrameOrRecover)\s*\(/;

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
  | "e-renavigation"
  | "f-helper-call";

/** One `awaitReviewModalOrRecover` call found inside a candidate's statement. */
export type NWaitCall = {
  /** 1-based line of the call expression itself. */
  line: number;
  /**
   * SOURCE TEXT of the call's `label:` property value, verbatim — identity, not
   * runtime value, so `` `route-loop:${route}` `` is ONE stable identity across
   * every iteration of the loop it sits in. Null when the call carries no label
   * this extractor can resolve, which the census reports rather than certifies.
   */
  labelSource: string | null;
};

/**
 * A candidate is ONE STATEMENT and ONE ORIGIN (spec §4.1).
 *
 * `text` is the statement's span sliced from the COMMENT-STRIPPED bytes, nested
 * callback bodies included — that span is what refusal gates read, and it is why
 * an activation verb is visible wherever formatting put it. `matchLineText` is
 * the single line the origin matched on, which is what title and assertion rules
 * read: a `test(...)` container claimed by its title must not also be claimable
 * by a body-reading member rule.
 *
 * The exemption is resolved by the SAME `exemptionReasonAt` the guard uses,
 * keyed on the MATCH line. Reading it off the candidate's own text instead would
 * silently depend on comment placement — the escape hatch is valid on the line
 * OR the line above, and only one of those spellings puts the marker inside the
 * candidate's span. (It could not be read from the text at all now: the text is
 * stripped, so every marker in it is spaces.)
 */
export type Candidate = {
  file: string;
  /** 1-based start line of the owning statement; the stable report anchor. */
  line: number;
  /** 1-based end line of the owning statement. */
  endLine: number;
  origin: CandidateOrigin;
  /** Statement span, from the comment-stripped text. */
  text: string;
  /** 1-based line of the FIRST origin match inside the statement. */
  matchLine: number;
  /** That line, stripped and trimmed; the discrimination handle. */
  matchLineText: string;
  /** Nearest enclosing test()/describe() title, or null at module scope. */
  scopeTitle: string | null;
  exemptReason: string | null;
  /** Origin (f) only, and empty for every other origin. */
  nWaitCalls: NWaitCall[];
};

/** The observation half of the §4.2 registry: what the corpus actually holds. */
export type ObservedNWaitSite = {
  file: string;
  line: number;
  scopeTitle: string | null;
  labelSource: string | null;
};

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
    const raw = readFileSync(join(root, file), "utf8");
    const lines = raw.split("\n");
    // Comment-aware, through the shared stripper. A COMMENTED-OUT navigation is
    // not a navigation, and flagging one is a false positive in the direction
    // the premise proof exists to protect: commenting a line out while a fixture
    // is reseeded is ordinary authoring, inside the threat fence. Probed before
    // this guard existed in comment-aware form — a `// await page.goto(…)` and a
    // block-commented one both reported as violations.
    const stripped = stripCommentsForFile(raw, file).split("\n");
    lines.forEach((text, index) => {
      // TWO different questions, so two different texts. "Does this line NAVIGATE?"
      // is about code, so it is asked of the STRIPPED line — otherwise a live
      // statement with a commented-out goto beside it reads as a violation.
      // "Does it declare an EXEMPTION?" is about a comment, so `exemptionReasonAt`
      // keeps reading the RAW line. Asking one question of the other's text is
      // the defect this split closes, in both directions.
      const code = stripped[index] ?? "";
      if (!GOTO_CALL.test(code) || !MODAL_ROUTE_PATTERN.test(code)) return;
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
 * A node is a STATEMENT when its parent holds a statement list — a source file
 * or a block.
 *
 * Derived from the PARENT rather than from a kind list: `ts.SyntaxKind` has no
 * closed "is a statement" predicate in the public API, and an enumerated kind
 * list is exactly the shape that goes stale when TypeScript adds a node type.
 *
 * DELIBERATELY the two shapes only. Earlier arms for module blocks, switch
 * clauses and unbraced control-flow bodies (`if (x) doThing();`) were carried
 * for completeness and were dead: the corpus holds none of them, so the source
 * mutation gate reported twelve survivors that no fixture drawn from the probe
 * domain could kill. Their absence is CONSERVATIVE, never silent — a match in
 * one of those positions attributes to the enclosing `if` / `switch` / module
 * statement instead, which is a LARGER text, so every refusal gate that reads
 * `candidate.text` sees strictly more. Narrowing is also the repair direction
 * both ledger rows ratified.
 */
function isStatementLike(node: ts.Node): boolean {
  const parent: ts.Node | undefined = node.parent;
  if (parent === undefined) return false;
  return ts.isSourceFile(parent) || ts.isBlock(parent);
}

/**
 * The innermost node whose TOKEN span contains `position`, or null.
 *
 * Containment goes through TypeScript's own span predicate rather than a
 * hand-written `position < start || position >= end`. Same semantics, and the
 * boundary is then stated once, by the library that defines what a span is,
 * instead of being re-derived here where each edge is a fresh off-by-one.
 */
function nodeAt(source: ts.SourceFile, position: number): ts.Node | null {
  let found: ts.Node | null = null;
  const visit = (node: ts.Node): void => {
    const span = ts.createTextSpanFromBounds(node.getStart(source), node.getEnd());
    if (!ts.textSpanContainsPosition(span, position)) return;
    found = node;
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
  return found;
}

/**
 * The nearest enclosing statement of `node`.
 *
 * The climb always terminates, and needs no SourceFile guard of its own: the
 * SourceFile has no parent, so `isStatementLike` is false for it and the walk
 * runs off the top into `undefined`. Null therefore means only that `node` was
 * the SourceFile itself — a position in trivia, which comment-stripped matching
 * cannot produce.
 */
function enclosingStatement(node: ts.Node | null): ts.Node | null {
  let current: ts.Node | undefined = node ?? undefined;
  while (current !== undefined) {
    if (isStatementLike(current)) return current;
    current = current.parent;
  }
  return null;
}

/** `test`, `describe` and their `.serial` / `.skip` / `.only` chains. */
const SCOPE_CALLEES = new Set(["test", "describe", "it", "suite"]);

function isScopeCallee(expression: ts.Expression): boolean {
  let current: ts.Expression = expression;
  while (ts.isPropertyAccessExpression(current)) current = current.expression;
  return ts.isIdentifier(current) && SCOPE_CALLEES.has(current.text);
}

/**
 * The nearest enclosing `test(...)` / `describe(...)` title, or null at module
 * scope. This is the registry's scope key (§4.2): the property a wait CANNOT
 * carry with it when it is cut from one test and pasted into another.
 */
function scopeTitleOf(node: ts.Node, source: ts.SourceFile): string | null {
  for (let current: ts.Node | undefined = node; current !== undefined; current = current.parent) {
    if (!ts.isCallExpression(current) || !isScopeCallee(current.expression)) continue;
    const first = current.arguments[0];
    if (first === undefined) continue;
    if (ts.isStringLiteralLike(first)) return first.text;
    if (ts.isTemplateExpression(first)) return first.getText(source);
    // A title that is neither: not a usable scope key, so keep climbing to the
    // enclosing describe rather than inventing one.
  }
  return null;
}

/** The name a call expression invokes, ignoring any receiver. */
function calleeName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

/** The SOURCE TEXT of a call's `label:` property value, or null when it has none. */
function labelSourceOf(call: ts.CallExpression, source: ts.SourceFile): string | null {
  for (const argument of call.arguments) {
    if (!ts.isObjectLiteralExpression(argument)) continue;
    for (const property of argument.properties) {
      const name = property.name;
      if (name === undefined || !ts.isIdentifier(name) || name.text !== "label") continue;
      if (ts.isPropertyAssignment(property)) return property.initializer.getText(source);
      if (ts.isShorthandPropertyAssignment(property)) return property.name.getText(source);
    }
  }
  return null;
}

const N_WAIT_CALLEE = "awaitReviewModalOrRecover";

/** Every `awaitReviewModalOrRecover` call inside `statement`, in source order. */
function nWaitCallsIn(statement: ts.Node, source: ts.SourceFile): NWaitCall[] {
  const calls: NWaitCall[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && calleeName(node.expression) === N_WAIT_CALLEE) {
      calls.push({
        line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
        labelSource: labelSourceOf(node, source),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(statement);
  return calls;
}

/** Regex-safe alternation over the product testid prefixes, or null when empty. */
function testIdPrefixPattern(prefixes: readonly string[]): RegExp | null {
  if (prefixes.length === 0) return null;
  return new RegExp(
    prefixes.map((prefix) => prefix.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")).join("|"),
  );
}

/**
 * Every open site the five §2.1 origins can produce, one candidate per
 * (STATEMENT, origin). The union is the input to the total disposition (AC-2b):
 * every candidate here is a member or an exclusion, with no leftovers on either
 * side.
 *
 * Two properties carry the v2 contract. Origins match the COMMENT-STRIPPED
 * bytes, so a comment can produce no candidate whatever statement spans it — the
 * mechanism that survives spec-review R2's refutation of the "trivia has no
 * enclosing statement" premise. And each match is attributed to its nearest
 * enclosing statement, so the whole statement's text — nested callback bodies
 * included — is what the disposition's refusal gates read.
 */
export function enumerateCandidates(root: string = process.cwd()): Candidate[] {
  const testIdPrefixes = [
    ...new Set(
      productOpenSurfaces(root)
        .map((surface) => surface.testIdPrefix)
        .filter((prefix): prefix is string => prefix !== null),
    ),
  ];

  const prefixPattern = testIdPrefixPattern(testIdPrefixes);

  const candidates: Candidate[] = [];
  for (const file of e2eSpecFiles(root)) {
    const raw = readFileSync(join(root, file), "utf8");
    const rawLines = raw.split("\n");
    // Offsets, lengths and line numbers are preserved by the stripper (its own
    // contract), so a match found in the stripped bytes names the same location
    // in the raw AST, and the raw file's own line map resolves it.
    const stripped = stripCommentsForFile(raw, file);
    const strippedLines = stripped.split("\n");
    const source = ts.createSourceFile(file, raw, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

    // (statement start, origin) — several matches of one origin in one statement
    // are ONE candidate, anchored on the first.
    const claimed = new Set<string>();

    strippedLines.forEach((code, index) => {
      const columns: Array<[CandidateOrigin, number]> = [];
      const at = (origin: CandidateOrigin, column: number): void => {
        if (column >= 0) columns.push([origin, column]);
      };

      at("a-route-literal", code.search(MODAL_ROUTE_PATTERN));
      if (GOTO_CALL.test(code) && !GOTO_LITERAL_FIRST_ARG.test(code)) {
        at("b-nonliteral-goto", code.search(GOTO_CALL));
      }
      at("c-legacy-route", code.indexOf(LEGACY_SHOW_ROUTE));
      // One alternation over every product prefix, so the column is the EARLIEST
      // prefix match on the line without hand-rolled min-of-indexes arithmetic.
      // Null when the product scan found no prefix at all, which is a throwaway
      // fixture root with no app/ or components/ tree — origin (d) then proposes
      // nothing, and the corpus suite's own premise is what forbids that state
      // in the real repo.
      if (prefixPattern !== null) at("d-link-activation", code.search(prefixPattern));
      at("e-renavigation", code.search(RENAVIGATION_CALL));
      at("f-helper-call", code.search(HELPER_CALL));

      for (const [origin, column] of columns) {
        const statement = enclosingStatement(
          nodeAt(source, source.getPositionOfLineAndCharacter(index, column)),
        );
        // Unreachable in practice and kept as the honest total: a match found in
        // stripped bytes always sits inside a token, and every token has an
        // enclosing statement. See the ledger row on this file.
        if (statement === null) continue;

        const start = statement.getStart(source);
        const key = `${start}:${origin}`;
        if (claimed.has(key)) continue;
        claimed.add(key);

        candidates.push({
          file,
          line: source.getLineAndCharacterOfPosition(start).line + 1,
          endLine: source.getLineAndCharacterOfPosition(statement.getEnd()).line + 1,
          origin,
          text: stripped.slice(start, statement.getEnd()),
          matchLine: index + 1,
          matchLineText: code.trim(),
          scopeTitle: scopeTitleOf(statement, source),
          exemptReason: exemptionReasonAt(rawLines, index),
          nWaitCalls: origin === "f-helper-call" ? nWaitCallsIn(statement, source) : [],
        });
      }
    });
  }
  return candidates;
}

/**
 * Every `awaitReviewModalOrRecover` call the census observed, as the triples the
 * declared registry is reconciled against (§4.2).
 *
 * Per CALL, not per candidate: two waits sharing one statement would otherwise
 * reconcile as one, and the arithmetic that the registry's row count IS the
 * member count would silently stop holding.
 */
export function observedNWaitSites(candidates: readonly Candidate[]): ObservedNWaitSite[] {
  return candidates
    .filter((candidate) => candidate.origin === "f-helper-call")
    .flatMap((candidate) =>
      candidate.nWaitCalls.map((call) => ({
        file: candidate.file,
        line: call.line,
        scopeTitle: candidate.scopeTitle,
        labelSource: call.labelSource,
      })),
    );
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
