/**
 * META — `lib/data` Supabase call-boundary contract (AGENTS.md invariant 9).
 *
 * Spec: docs/superpowers/specs/ci/2026-08-09-libdata-call-boundary-metatest-design.md
 *
 * Three layers over one scan:
 *
 *   Layer 1 — orphan scan. `lib/data` is walked from DISK, so a file added
 *     tomorrow is covered by default rather than silently exempt. A file with a
 *     Supabase call site must be registered below, or carry an inline
 *     `// not-subject-to-meta: <reason>` waiver, or this fails naming it.
 *
 *   Layer 2 — per-site reconciliation. The scanner's ORDERED extraction is
 *     deep-equalled against the registry rows, both directions. There is
 *     deliberately NO authored count anywhere in this file: a count reconciles
 *     against itself, so a new unchecked call plus a bumped number would pass
 *     every layer (spec R1 F1). And a row cannot exist without a discharge,
 *     because the row TYPE requires a `pin` or a `coveredBy` citation.
 *
 *   Layer 3 — planted self-tests. Every claim this scanner makes, and every
 *     limit it accepts, is a positive or negative fixture below rather than
 *     prose in a comment.
 *
 * Sibling domains own their own registry-style meta-tests; the auth domain's is
 * `tests/auth/_metaInfraContract.test.ts`, deliberately untouched here (spec §1.1).
 */
import ts from "typescript";
import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { premise } from "../_shared/premise";
import { stripCommentsForFile } from "../_shared/stripComments";

const LIB_DATA_ROOT = "lib/data";

// The full set of module extensions this toolchain compiles — not only .ts/.tsx.
// tsconfig.json includes `**/*.mts`, so an .mts module carrying a Supabase call
// must not be invisible to the walk (spec R1 F2). Only .ts files exist in
// lib/data today; the widening is fails-by-default headroom.
const MODULE_FILE_RE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

/**
 * Sites come from the PARSE, not from a text pattern.
 *
 * Four consecutive review rounds each found another spelling that a regex over
 * the source text could not see — a bare `$` in the name, an escaped `\${`, a
 * backslash line continuation, a space or a comment before the type arguments,
 * `?.`, `!`, `?.<T>` — and every one of them was SILENTLY invisible, which is
 * the one failure mode this guard promises never to have. Widening the pattern
 * once more would have answered the wrong question: "does this text look like a
 * call?" ranges over an open set of spellings and does not terminate.
 *
 * The parser answers the question that actually matters — "is this a call whose
 * callee is a member named `from` or `rpc`, with a static string first
 * argument?" — and answers it for every spelling at once. Comments, whitespace,
 * type arguments, optional calls, non-null assertions and parentheses are
 * syntax the parser has already resolved before this code sees the node.
 */
function parse(file: string, source: string): ts.SourceFile {
  // The FILE NAME carries the script kind: `createSourceFile` reads .tsx as TSX
  // and .ts as TS, which matters because parsing plain .ts as TSX misreads
  // `<T>(x: T) => x` as JSX.
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
}

/**
 * Strip the wrappers that mean nothing at runtime: grouping parentheses, the
 * non-null `!`, and the three type-assertion forms (`x as T`, `<T>x`,
 * `x satisfies T`). All erase to the expression inside.
 *
 * It applies to the ARGUMENT as much as the callee — `sb.from(("x"))`,
 * `sb.from("x" as const)`, `sb.rpc(<const>"x")`, `sb.rpc("x"!)` and
 * `sb.from("x" satisfies string)` are five spellings of one call with one static
 * name, and all five were silently invisible while only the callee was unwrapped
 * (whole-diff R5 F1).
 */
function unwrap(node: ts.Expression): ts.Expression {
  let expr = node;
  for (;;) {
    if (
      ts.isParenthesizedExpression(expr) ||
      ts.isNonNullExpression(expr) ||
      ts.isAsExpression(expr) ||
      ts.isSatisfiesExpression(expr) ||
      ts.isTypeAssertionExpression(expr) ||
      // An instantiation expression: `(sb.from<Row>)("x")` and `(sb.from)<Row>("x")`
      // are the same call with its type arguments supplied separately (R6 F1).
      ts.isExpressionWithTypeArguments(expr)
    ) {
      expr = expr.expression;
      continue;
    }
    return expr;
  }
}

/** `sb.from(…)`, `sb?.from(…)`, `sb!.from(…)`, `(sb).from(…)`, `sb["from"](…)`. */
function calleeMemberName(node: ts.Expression): string | undefined {
  const expr = unwrap(node);
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  if (ts.isElementAccessExpression(expr)) {
    const arg = unwrap(expr.argumentExpression);
    return ts.isStringLiteralLike(arg) ? arg.text : undefined;
  }
  return undefined;
}

/**
 * `Array.from("abc")` is a real call with a static string argument and is not a
 * Supabase boundary. It is the one such collision PRESENT IN THIS CORPUS
 * (`lib/data/normalizeDateRestriction.ts`), and it surfaced as a loud false
 * positive — a red test naming an innocent line, the safe direction but still
 * wrong (R5 F4).
 *
 * Deliberately NOT generalised to `Buffer.from`, `Readable.from`,
 * `Uint8Array.from`, `globalThis.Array.from` and the rest (R6 F2). Enumerating
 * built-in receivers is an open set, and this arc has already paid five rounds
 * for a recognizer whose convergence criterion was enumeration. Their worst case
 * is a LOUD false positive whose response is one waiver comment, which §1.4
 * admits as a documented limit (§6.8) — while the alternatives that would close
 * it by heuristic (a capitalized-receiver rule, say) trade a loud false positive
 * for a SILENT miss on a client held in a capitalized binding, and that trade is
 * the one the consequence bound forbids.
 */
function isStandardLibraryFrom(callee: ts.Expression): boolean {
  const expr = unwrap(callee);
  if (!ts.isPropertyAccessExpression(expr)) return false;
  // Unwrap the RECEIVER too, so `(Array).from(…)` is the same call as
  // `Array.from(…)` — the exclusion was not even internally consistent (R6 F2).
  const receiver = unwrap(expr.expression);
  return ts.isIdentifier(receiver) && receiver.text === "Array";
}

type Site = { kind: "from" | "rpc"; literal: string };

function extractSites(source: string, file = "planted.ts"): Site[] {
  const sites: Site[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const method = calleeMemberName(node.expression);
      const first = node.arguments[0];
      const arg = first === undefined ? undefined : unwrap(first);
      // `isStringLiteralLike` is a string literal OR a no-substitution template
      // — exactly the two forms that name a table statically. A template WITH
      // substitutions is a genuinely dynamic name and stays a documented limit
      // (§6.1); the parser draws that line, so an escaped `\${` inside an
      // otherwise-static template is simply part of the name. `.text` is the
      // COOKED value: the name Postgres would see.
      if (
        (method === "from" || method === "rpc") &&
        arg !== undefined &&
        ts.isStringLiteralLike(arg) &&
        !isStandardLibraryFrom(node.expression)
      ) {
        sites.push({ kind: method, literal: arg.text });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(file, source));
  return sites;
}

const WAIVER_WITH_REASON_RE = /^\/\/ not-subject-to-meta: \S/;

/**
 * The marker must be the whole of a LINE comment, and the PARSE decides which
 * comments those are.
 *
 * Textual anchoring could not: a block comment whose inner line begins with the
 * marker satisfies any "starts a line" test, and comment-stripping erases a
 * block just as thoroughly as a line comment, so "absent after strip" could not
 * tell them apart either (whole-diff R2 F3, R4 F4).
 *
 * Nor could a context-free LEXER, which was the first repair: it reads `//`
 * inside a regex character class (`/[// not-subject-to-meta: ]+/`) or inside JSX
 * text (`<div>// not-subject-to-meta: fake</div>`) as a line comment, so a
 * marker that is not a comment at all silently waived a live call site
 * (whole-diff R5 F2). Comment ranges anchored to parsed token positions know
 * the difference, because by then the regex literal and the JSX text are nodes */
function lineCommentTexts(file: string, source: string): string[] {
  const sourceFile = parse(file, source);
  const full = sourceFile.getFullText();
  const seen = new Set<number>();
  const texts: string[] = [];
  const visit = (node: ts.Node): void => {
    for (const range of ts.getLeadingCommentRanges(full, node.getFullStart()) ?? []) {
      if (seen.has(range.pos)) continue;
      seen.add(range.pos);
      if (range.kind === ts.SyntaxKind.SingleLineCommentTrivia) {
        texts.push(full.slice(range.pos, range.end).trim());
      }
    }
    for (const child of node.getChildren(sourceFile)) visit(child);
  };
  visit(sourceFile);
  return texts;
}

function isWaived(file: string, original: string): boolean {
  return lineCommentTexts(file, original).some((text) => WAIVER_WITH_REASON_RE.test(text));
}

/**
 * A registry row's discharge is part of its TYPE: there is no way to name a
 * call site here without also naming what proves it compliant. `pin` is a shape
 * assertion against the file's own source; `coveredBy` cites the behavioral
 * suites that exercise the boundary at runtime, through the exported `via`
 * symbol. The non-empty tuple types are the compile-time half of the
 * anti-vacuity defence and `validateRows` is the runtime half — both exist
 * because a cast defeats either one alone.
 */
type SiteRow = { kind: "from" | "rpc"; literal: string } & (
  | { pin: [RegExp, ...RegExp[]] }
  | { coveredBy: [string, ...string[]]; via: string }
);

type Registry = Record<string, SiteRow[]>;

type ReadFile = (path: string) => string;

const readFromDisk: ReadFile = (path) => readFileSync(path, "utf8");

/**
 * Exported identifiers, read from the parse.
 *
 * A line-anchored regex counted text that merely LOOKED like an export
 * declaration — a line inside a multiline template, or after a backslash
 * continuation, made `via: "addAdmin"` pass while only `addAdminEmail` was
 * exported (whole-diff R4 F5). It also could not see `export { addAdminEmail }`,
 * which is a real export; the parse sees both correctly, so a limit that existed
 * only because the recognizer was weak goes away with it.
 */
function exportedNames(file: string, source: string): Set<string> {
  const names = new Set<string>();
  const hasModifier = (node: ts.Node, kind: ts.SyntaxKind): boolean =>
    ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === kind);
  // A `via` names the wrapper a suite CALLS, so only runtime bindings qualify.
  // `export declare …` and every type-only spelling erase at compile time and
  // export nothing callable, yet each parses as an export (whole-diff R5 F3).
  const isRuntimeExport = (node: ts.Node): boolean =>
    hasModifier(node, ts.SyntaxKind.ExportKeyword) &&
    !hasModifier(node, ts.SyntaxKind.DeclareKeyword);

  for (const statement of parse(file, source).statements) {
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      if (isRuntimeExport(statement) && statement.name) names.add(statement.name.text);
    } else if (ts.isVariableStatement(statement)) {
      if (isRuntimeExport(statement)) {
        for (const decl of statement.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) names.add(decl.name.text);
        }
      }
    } else if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
      const clause = statement.exportClause;
      // The EXPORTED name is what a caller can import: `a as c` exports `c`.
      // A per-specifier `type` marker erases the same way `export type {}` does.
      if (clause && ts.isNamedExports(clause)) {
        for (const element of clause.elements) {
          if (!element.isTypeOnly) names.add(element.name.text);
        }
      }
    }
  }
  return names;
}

/**
 * Does this pin name the row's literal as the QUOTED ARGUMENT of a call?
 *
 * A bare substring test is not coupling: `shows` is a substring of
 * `shows_internal` and both are live literals here, so a `shows` row could be
 * discharged by a pin copied off a `shows_internal` site — precisely the defect
 * the coupling rule exists to stop. An empty literal was worse: `includes("")`
 * is true of every pin (whole-diff R3 F1). Requiring the delimiters makes the
 * test say what it means.
 *
 * A literal carrying regex metacharacters appears escaped in the pin source and
 * will NOT be found here — that is a rejection naming the row, which is the
 * signalled direction; no live row is affected.
 */
function pinEmbedsLiteral(patternSource: string, literal: string): boolean {
  return ['"', "'", "`"].some((quote) => patternSource.includes(`${quote}${literal}${quote}`));
}

/**
 * Is `token` present as a whole IDENTIFIER, not merely as a substring?
 *
 * `\b` cannot answer this: it is an ASCII word boundary, so it sees one between
 * `x` and `$`, and one between `é` and `X`. A `via` of `$get` was therefore
 * satisfied by an unrelated `x$get`, and a `via` of `café` by `caféX` — a
 * citation discharged by a suite that never mentions the symbol at all, which is
 * outside §6.5's "mention, not exercise" and simply wrong (whole-diff R7 F1).
 *
 * Nor does an approximation of "letter, digit, `_` or `$`": ECMAScript's
 * IdentifierPart also admits combining marks (`Mn`, `Mc`), connector
 * punctuation beyond `_` (`Pc`), `Other_ID_Continue`, non-letter `ID_Start`
 * characters like `℘`, and the zero-width joiners — so `get\u0301x` is one
 * identifier that a `via` of `get` was still matching inside (whole-diff R8 F1).
 *
 * The definition is therefore TAKEN, not approximated: IdentifierPart is
 * `ID_Continue` plus `$`, ZWNJ and ZWJ, and `\p{ID_Continue}` is a Unicode
 * property escape the regex engine already implements. Enumerating the families
 * it covers would be the same open-set mistake this suite has refused
 * elsewhere; naming the property closes all of them at once.
 */
const IDENTIFIER_CHAR = "[\\p{ID_Continue}$\\u200C\\u200D]";

function containsWholeWord(haystack: string, token: string): boolean {
  if (token === "") return false;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<!${IDENTIFIER_CHAR})${escaped}(?!${IDENTIFIER_CHAR})`, "u").test(haystack);
}

/**
 * The authoring-time half of the anti-vacuity defence (mirrors `validateSurface`
 * in tests/mutation/source/registry.ts). Returns a problem list rather than
 * throwing, so a single run names every defect instead of the first one.
 */
function validateRows(registry: Registry, readFile: ReadFile = readFromDisk): string[] {
  const problems: string[] = [];

  for (const [file, rows] of Object.entries(registry)) {
    let stripped: string;
    try {
      stripped = stripCommentsForFile(readFile(file), file);
    } catch {
      problems.push(`${file}: registered file cannot be read`);
      continue;
    }
    const exports = exportedNames(file, readFile(file));

    rows.forEach((row, index) => {
      const where = `${file}[${index}] ${row.kind}("${row.literal}")`;

      if ("pin" in row) {
        // Rule 1 — an empty discharge is vacuous: `[].every(...)` is `true` (spec R2 F3).
        if (row.pin.length === 0) {
          problems.push(`${where}: pin is empty — an empty discharge proves nothing`);
          return;
        }
        // Rule 2 — literal coupling. Without it, copying an existing site's pin
        // onto a new row silently discharges an unchecked call; a pin copied
        // from `shows` cannot contain `new_table` (spec R2 F4).
        if (!row.pin.some((pattern) => pinEmbedsLiteral(pattern.source, row.literal))) {
          problems.push(
            `${where}: no pin embeds the row literal — a pin copied from another site cannot guard this one`,
          );
        }
        const unmatched = row.pin.filter((pattern) => !pattern.test(stripped));
        if (unmatched.length > 0) {
          problems.push(`${where}: pin(s) do not match the source: ${unmatched.join(", ")}`);
        }
        return;
      }

      if (row.coveredBy.length === 0) {
        problems.push(`${where}: coveredBy is empty — an empty discharge proves nothing`);
        return;
      }
      // Rule 3 — `via` must EXACTLY match an exported identifier of the scanned
      // file. A containment predicate passes both an empty `via` and a
      // strict-prefix typo (`addAdmin` for `addAdminEmail`); exact membership
      // rejects both (spec R3 F2).
      if (!exports.has(row.via)) {
        problems.push(
          `${where}: via "${row.via}" is not an exported identifier of ${file} (exports: ${[...exports].sort().join(", ")})`,
        );
      }
      for (const suite of row.coveredBy) {
        let suiteText: string;
        try {
          // Comment-stripped: a citation discharged by the suite's own PROSE
          // about the boundary is the weakest form of the §6.5 limit, and it is
          // the one form the machine can rule out for free (whole-diff R2 F4).
          // Mention-not-exercise remains the accepted limit for live code.
          suiteText = stripCommentsForFile(readFile(suite), suite);
        } catch {
          problems.push(`${where}: covering suite ${suite} does not exist`);
          continue;
        }
        // Literal OR via: a suite that mocks at the client boundary never
        // mentions the table literal (spec R2 F1 — tests/data/adminEmails.test.ts
        // names `listAdminEmails` seven times and `admin_emails` zero times).
        if (!containsWholeWord(suiteText, row.literal) && !containsWholeWord(suiteText, row.via)) {
          problems.push(
            `${where}: covering suite ${suite} mentions neither the literal nor via "${row.via}"`,
          );
        }
      }
    });
  }

  return problems;
}

type ScannedFile = { file: string; original: string; stripped: string; sites: Site[] };

function scan(file: string, source: string): ScannedFile {
  // `stripped` is for the PINS, which are text pins by design (§6.3). Site
  // extraction reads the ORIGINAL, because the parser already knows what a
  // comment is.
  const stripped = stripCommentsForFile(source, file);
  return { file, original: source, stripped, sites: extractSites(source, file) };
}

/**
 * Layer 1. Registry precedence is deliberate and comes FIRST: a file carrying
 * registry rows is reconciled per-site by Layer 2 regardless of any waiver
 * comment it also contains, so a file-grain waiver can never exempt a pinned
 * site. Waivers discharge only files with no registry rows.
 */
type Mismatch = { file: string; extracted: Site[]; expected: Site[] };

/**
 * Layer 2, as a function so the precedence self-test can assert on the
 * reconciliation itself. "Not an orphan" cannot distinguish a file discharged
 * by its rows from one discharged by its waiver, so a precedence claim asserted
 * only through `undischargedFiles` is vacuous (whole-diff R2 F5).
 */
function reconciliationMismatches(scanned: ScannedFile[], registry: Registry): Mismatch[] {
  const byFile = new Map(scanned.map((entry) => [entry.file, entry]));
  const mismatches: Mismatch[] = [];
  for (const [file, rows] of Object.entries(registry)) {
    const extracted = byFile.get(file)?.sites ?? [];
    const expected = rows.map((row) => ({ kind: row.kind, literal: row.literal }));
    if (JSON.stringify(extracted) !== JSON.stringify(expected)) {
      mismatches.push({ file, extracted, expected });
    }
  }
  return mismatches;
}

function undischargedFiles(scanned: ScannedFile[], registry: Registry): string[] {
  return scanned
    .filter((entry) => entry.sites.length > 0)
    .filter((entry) => (registry[entry.file]?.length ?? 0) === 0)
    .filter((entry) => !isWaived(entry.file, entry.original))
    .map((entry) => entry.file);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (MODULE_FILE_RE.test(full)) out.push(full);
  }
  return out;
}

/**
 * The 17 live call sites, per file, IN SOURCE ORDER. Two compliant styles are
 * pinned as they are written — destructuring (`const { data, error } = await …`)
 * and result-object (`const showRes = await …; if (showRes.error)`) — because
 * this guard pins current shapes and does not force a style migration (spec §1.2).
 *
 * The two same-literal pairs (`crew_members`, `shows_internal`) are
 * order-distinguished; their pins additionally name distinct result variables,
 * so a reader can tell which pin guards which site (documented limit §6.6).
 */
const REGISTRY: Registry = {
  "lib/data/adminEmails.ts": [
    {
      kind: "from",
      literal: "admin_emails",
      coveredBy: ["tests/data/adminEmails.test.ts"],
      via: "listAdminEmails",
    },
    {
      kind: "rpc",
      literal: "upsert_admin_email_rpc",
      coveredBy: ["tests/data/adminEmails.test.ts"],
      via: "addAdminEmail",
    },
    {
      kind: "rpc",
      literal: "revoke_admin_email_rpc",
      coveredBy: ["tests/data/adminEmails.test.ts"],
      via: "revokeAdminEmail",
    },
    {
      kind: "rpc",
      literal: "set_admin_developer_rpc",
      coveredBy: ["tests/data/setAdminDeveloper.test.ts"],
      via: "setAdminDeveloper",
    },
  ],
  "lib/data/getShowForViewer.ts": [
    {
      kind: "from",
      literal: "crew_members",
      pin: [
        /const lookup = await supabase[\s\S]{0,80}?\.from\("crew_members"\)/,
        /if \(lookup\.error\)/,
      ],
    },
    {
      kind: "from",
      literal: "shows",
      pin: [/const showRes = await supabase\.from\("shows"\)/, /if \(showRes\.error\)/],
    },
    {
      kind: "from",
      literal: "crew_members",
      pin: [
        /const crewRes = await supabase[\s\S]{0,80}?\.from\("crew_members"\)/,
        /if \(crewRes\.error\)/,
      ],
    },
    {
      kind: "from",
      literal: "hotel_reservations",
      pin: [
        /const hotelRes = await supabase[\s\S]{0,80}?\.from\("hotel_reservations"\)/,
        /if \(hotelRes\.error\)/,
      ],
    },
    {
      kind: "from",
      literal: "rooms",
      pin: [/const roomRes = await supabase\.from\("rooms"\)/, /if \(roomRes\.error\)/],
    },
    {
      kind: "from",
      literal: "transportation",
      pin: [
        /const transRes = await supabase[\s\S]{0,80}?\.from\("transportation"\)/,
        /if \(transRes\.error\)/,
      ],
    },
    {
      kind: "from",
      literal: "contacts",
      pin: [/const contactsRes = await supabase\.from\("contacts"\)/, /if \(contactsRes\.error\)/],
    },
    {
      kind: "from",
      literal: "shows_internal",
      pin: [
        /const r = await supabase[\s\S]{0,80}?\.from\("shows_internal"\)[\s\S]{0,80}?\.select\("run_of_show"\)/,
        /if \(r\.error\)/,
      ],
    },
    {
      kind: "from",
      literal: "shows_internal",
      pin: [
        /const internalRes = await supabase[\s\S]{0,80}?\.from\("shows_internal"\)[\s\S]{0,80}?\.select\("financials"\)/,
        /if \(internalRes\.error\)/,
      ],
    },
    {
      kind: "rpc",
      literal: "viewer_version_token",
      pin: [
        /const versionRpc = await supabase\.rpc\("viewer_version_token"/,
        /if \(versionRpc\.error\)/,
      ],
    },
  ],
  "lib/data/listShowsForCrew.ts": [
    {
      kind: "rpc",
      literal: "my_share_tokens_for_email",
      pin: [
        /const \{ data: tokens, error: tokenErr \} = await supabase\.rpc\("my_share_tokens_for_email"\)/,
        /if \(tokenErr\)/,
      ],
    },
    {
      kind: "from",
      literal: "shows",
      pin: [
        /const \{ data: shows, error: showErr \} = await supabase\s*\n?\s*\.from\("shows"\)/,
        /if \(showErr\)/,
      ],
    },
  ],
  "lib/data/loadShowShareToken.ts": [
    {
      kind: "rpc",
      literal: "admin_read_share_token",
      pin: [
        /try \{[\s\S]{0,160}?supabase\.rpc\("admin_read_share_token"/,
        /\} catch \(error\) \{/,
        /const \{ data, error \} = result/,
        /if \(error\)/,
      ],
    },
  ],
};

const LIVE_FILES = walk(LIB_DATA_ROOT).sort();
const SCANNED = LIVE_FILES.map((file) => scan(file, readFromDisk(file)));

// Premises execute unconditionally in the suite body — never inside a `.each`
// callback, whose case count can be zero in exactly the degenerate case the
// premise exists for. A walk that found nothing, or a regex corrupted to match
// nothing, must be a loud failure and not a green suite.
premise("lib/data module files walked", LIVE_FILES.length, 3);
premise(
  "Supabase call sites extracted from lib/data",
  SCANNED.reduce((total, entry) => total + entry.sites.length, 0),
  10,
);

describe("META lib/data Supabase call boundary", () => {
  // Runs first: every later layer reads these rows, so a malformed row must be
  // named as a malformed row rather than surfacing as a confusing pin failure.
  test("every registry row is well-formed and its discharge is live", () => {
    expect(validateRows(REGISTRY)).toEqual([]);
  });

  test("every registered file's site sequence deep-equals its registry rows", () => {
    const byFile = new Map(SCANNED.map((entry) => [entry.file, entry]));

    const stale = Object.keys(REGISTRY).filter((file) => !byFile.has(file));
    expect(stale, "registry names files that no longer exist under lib/data").toEqual([]);

    expect(
      reconciliationMismatches(SCANNED, REGISTRY),
      "Supabase call-site drift. The scanner's ordered extraction no longer matches the " +
        "registry rows: add, remove, or reorder rows to match, and give any new row its " +
        "own pin or coveredBy discharge.",
    ).toEqual([]);
  });

  test("every lib/data Supabase call site is registered, discharged, or waivered", () => {
    const orphans = undischargedFiles(SCANNED, REGISTRY);
    expect(
      orphans,
      `Undischarged Supabase call sites in lib/data:\n${orphans.join("\n")}\n` +
        "Add the file's sites to REGISTRY with a shape pin, discharge them to a named " +
        "behavioral suite with `coveredBy` + `via`, or add an inline " +
        "`// not-subject-to-meta: <reason>` waiver.",
    ).toEqual([]);
  });

  // A waiver reason is read by the next human deciding whether a site is really
  // exempt, so a reason that has silently become FALSE is worse than no reason
  // at all. This one claimed lib/data sits outside every structural scan — true
  // until this file landed, false the moment it did.
  test("the getShowForViewer waiver names its real discharge, not a stale scan-scope claim", () => {
    const source = readFromDisk("lib/data/getShowForViewer.ts");
    expect(source).not.toMatch(/outside _metaInfraContract/);
    // Pin the LOAD-BEARING meaning, not just the path. Forbidding the old phrase
    // and requiring a mention of this file left room for a replacement that
    // named this suite only to deny it applied ("… is unrelated"), which the
    // earlier pair accepted (whole-diff R2 F2). The claim that matters is that
    // the marker is inert because registry rows take precedence.
    const waiver =
      /\/\/ not-subject-to-meta: INERT[\s\S]{0,400}?tests\/data\/_metaLibDataCallBoundary\.test\.ts/;
    expect(source).toMatch(waiver);
    expect(source).toMatch(/\/\/ not-subject-to-meta: INERT[\s\S]{0,400}?precedence/);
  });

  describe("scanner self-tests", () => {
    const plantSites = (source: string): Site[] => extractSites(source);

    test("matches every compliant call shape", () => {
      expect(plantSites('await sb.from("shows").select("*");')).toEqual([
        { kind: "from", literal: "shows" },
      ]);
      expect(plantSites("await sb.rpc('my_share_tokens_for_email');")).toEqual([
        { kind: "rpc", literal: "my_share_tokens_for_email" },
      ]);
      // No-substitution template: an ordinary string argument Prettier leaves alone.
      expect(plantSites("await sb.from(`shows`);")).toEqual([{ kind: "from", literal: "shows" }]);
      expect(plantSites('await sb.rpc<Row>("typed_rpc");')).toEqual([
        { kind: "rpc", literal: "typed_rpc" },
      ]);
      expect(plantSites('await sb.from<Row, Insert>("typed_table");')).toEqual([
        { kind: "from", literal: "typed_table" },
      ]);
      expect(plantSites('await sb.rpc<\n  Row\n>("multiline_generic");')).toEqual([
        { kind: "rpc", literal: "multiline_generic" },
      ]);
      expect(plantSites('await sb.from ("spaced_paren");')).toEqual([
        { kind: "from", literal: "spaced_paren" },
      ]);
    });

    // Every syntactic spelling of the same call. Each of these typechecks
    // against the installed `SupabaseClient`, and each was invisible to the text
    // pattern this scanner replaced — four review rounds found them one or two
    // at a time (whole-diff R3 F2/F3, R4 F1/F2/F3). The parse resolves all of
    // them before this suite sees a node, which is why the list can be closed
    // rather than extended again next round.
    test("every syntactic spelling of the call is the same call", () => {
      const spellings: Array<[string, Site]> = [
        ['await sb.from <Row>("spaced_generic");', { kind: "from", literal: "spaced_generic" }],
        [
          'await sb.rpc/* note */<Row>("commented_generic");',
          { kind: "rpc", literal: "commented_generic" },
        ],
        [
          'await sb./* boundary */from("commented_dot");',
          { kind: "from", literal: "commented_dot" },
        ],
        ['await sb.rpc?.("optional_rpc");', { kind: "rpc", literal: "optional_rpc" }],
        ['await sb.from?.("optional_table");', { kind: "from", literal: "optional_table" }],
        ['await sb.rpc?.<Row>("optional_typed");', { kind: "rpc", literal: "optional_typed" }],
        ['await sb.from!("nonnull");', { kind: "from", literal: "nonnull" }],
        [
          'await sb.from!<Row, Insert>("nonnull_generic");',
          { kind: "from", literal: "nonnull_generic" },
        ],
        ['await (sb).from("parenthesized");', { kind: "from", literal: "parenthesized" }],
        ['await sb["from"]("element_access");', { kind: "from", literal: "element_access" }],
        [
          'await sb.rpc<Record<string, () => void>>("parens_in_generic");',
          { kind: "rpc", literal: "parens_in_generic" },
        ],
        [
          'await sb.rpc<Array<string>>("nested_angles");',
          { kind: "rpc", literal: "nested_angles" },
        ],
      ];
      for (const [source, site] of spellings) {
        expect(plantSites(source), source).toEqual([site]);
      }
    });

    // The ARGUMENT has spellings too, and they erase at runtime exactly like the
    // callee's do. All five were silently invisible while only the callee was
    // unwrapped (whole-diff R5 F1).
    test("wrappers that erase at runtime do not hide the name", () => {
      const spellings: Array<[string, Site]> = [
        ['await sb.from(("parens_arg"));', { kind: "from", literal: "parens_arg" }],
        ['await sb.from("as_const" as const);', { kind: "from", literal: "as_const" }],
        ['await sb.rpc(<const>"angle_assert");', { kind: "rpc", literal: "angle_assert" }],
        ['await sb.rpc("nonnull_arg"!);', { kind: "rpc", literal: "nonnull_arg" }],
        [
          'await sb.from("satisfies_arg" satisfies string);',
          { kind: "from", literal: "satisfies_arg" },
        ],
      ];
      for (const [source, site] of spellings) {
        expect(plantSites(source), source).toEqual([site]);
      }
    });

    // Instantiation expressions: the type arguments are supplied separately and
    // the call is the same call (whole-diff R6 F1). Planted in a declaration
    // initializer, which is where TypeScript actually parses them as such. At
    // statement position `(sb.from<Row>)("x")` is a chain of comparisons, and a
    // leading `await` makes TypeScript read `await (…)` as a call named `await`;
    // reporting no site in either case is correct rather than a miss.
    test("type arguments supplied separately do not hide the call", () => {
      const spellings: Array<[string, Site]> = [
        [
          'const r = (sb.from<Row>)("instantiated_table");',
          { kind: "from", literal: "instantiated_table" },
        ],
        [
          'const r = (sb.rpc<Row>)("instantiated_rpc");',
          { kind: "rpc", literal: "instantiated_rpc" },
        ],
        ['const r = (sb.from)<Row>("grouped_table");', { kind: "from", literal: "grouped_table" }],
        ['const r = (sb.rpc)<Row>("grouped_rpc");', { kind: "rpc", literal: "grouped_rpc" }],
      ];
      for (const [source, site] of spellings) {
        expect(plantSites(source), source).toEqual([site]);
      }
    });

    // A loud false positive is the safe direction, but it is still wrong: this
    // is the one such collision present in this corpus, and it would have redded
    // CI on an innocent line (whole-diff R5 F4).
    test("Array.from with a string argument is not a Supabase boundary", () => {
      expect(plantSites('const chars = Array.from("abc");')).toEqual([]);
      expect(plantSites('const chars = Array.from("abc", (c) => c);')).toEqual([]);
      expect(plantSites('const chars = (Array).from("abc");')).toEqual([]);
      // …and the exclusion is by RECEIVER, so a real boundary with the same
      // argument still counts.
      expect(plantSites('await sb.from("abc");')).toEqual([{ kind: "from", literal: "abc" }]);
    });

    // Documented limit §6.8, made executable rather than left as prose. Other
    // built-ins with a static `from` are NOT excluded: enumerating them is an
    // open set, and their worst case is a LOUD false positive answered by one
    // waiver comment. The heuristics that would close it (a capitalized-receiver
    // rule) trade this for a SILENT miss on a client held in a capitalized
    // binding, which the consequence bound forbids (whole-diff R6 F2).
    test("documented limit §6.8: other built-in `from` receivers are reported, loudly", () => {
      for (const receiver of ["Buffer", "Readable", "Uint8Array"]) {
        expect(plantSites(`const b = ${receiver}.from("abc");`), receiver).toEqual([
          { kind: "from", literal: "abc" },
        ]);
      }
      expect(plantSites('const a = globalThis.Array.from("abc");')).toEqual([
        { kind: "from", literal: "abc" },
      ]);
    });

    test("the discriminator is unchanged: no static string name, no site", () => {
      expect(plantSites("const xs = Array.from (iterable);")).toEqual([]);
      expect(plantSites("const ys = Array.from?.(iterable);")).toEqual([]);
      expect(plantSites("const zs = Array.from({ length: n });")).toEqual([]);
      expect(plantSites('await sb.select("not_a_boundary");')).toEqual([]);
    });

    // The literal class used to exclude all three quote characters AND `$`
    // regardless of which quote opened the literal. Every shape below is
    // ordinary authoring that compiles and that Prettier leaves alone, and each
    // one was SILENTLY invisible: the site vanished from the extraction, so
    // Layer 1 saw no call and Layer 2's deep-equal still matched. That is the
    // one failure mode this guard promises never to have.
    test("matches literals containing the other quote characters, a bare $, or nothing at all", () => {
      expect(plantSites('await sb.rpc("cost$center");')).toEqual([
        { kind: "rpc", literal: "cost$center" },
      ]);
      expect(plantSites('await sb.from("crew\'s");')).toEqual([
        { kind: "from", literal: "crew's" },
      ]);
      expect(plantSites("await sb.rpc('say\"hi');")).toEqual([{ kind: "rpc", literal: 'say"hi' }]);
      // A `$` that does not open a substitution leaves the template ordinary.
      expect(plantSites("await sb.from(`cost$center`);")).toEqual([
        { kind: "from", literal: "cost$center" },
      ]);
      // An empty name is nonsense, but invisible is the wrong way to say so:
      // extract it, so it must be registered and a human sees it.
      expect(plantSites('await sb.from("");')).toEqual([{ kind: "from", literal: "" }]);
      // The literal is the COOKED value — the name Postgres would see.
      expect(plantSites('await sb.from("say \\"hi\\"").select("*");')).toEqual([
        { kind: "from", literal: 'say "hi"' },
      ]);
    });

    // Two more shapes that were SILENTLY dropped — the same failure mode as the
    // class above, found by probing the repaired scanner rather than the
    // original (whole-diff R2 F1, F2).
    test("an escaped ${ is a static name, and a line continuation is part of one", () => {
      // `\\${` produces the two characters `$` and `{`, so the name is static and
      // the parser hands back exactly what Postgres would see.
      expect(plantSites("await sb.rpc(`cost\\${center}`);")).toEqual([
        { kind: "rpc", literal: "cost${center}" },
      ]);
      // A real substitution is a dynamic name and stays a documented limit.
      expect(plantSites("await sb.from(`${tableVar}`);")).toEqual([]);
      expect(plantSites("await sb.from(`a${tableVar}b`);")).toEqual([]);
      // A backslash line continuation is part of the literal, in every
      // JavaScript line terminator.
      for (const [name, terminator] of [
        ["LF", "\n"],
        ["CR", "\r"],
        ["CRLF", "\r\n"],
        ["LS", "\u2028"],
        ["PS", "\u2029"],
      ] as const) {
        expect(plantSites(`await sb.from("contin\\${terminator}ued");`), name).toEqual([
          { kind: "from", literal: "continued" },
        ]);
      }
    });

    // §6.1, and now ONLY this. The generic-segment carve-outs the old text
    // pattern needed are gone: parenthesised and nested-angle type arguments are
    // ordinary syntax to the parser and are asserted as positives above. What
    // remains is the honest limit — a name the source does not state.
    test("documented limit §6.1: only genuinely DYNAMIC names are invisible", () => {
      expect(plantSites("await sb.from(tableVar);")).toEqual([]);
      expect(plantSites("await sb.rpc(fnVar, { p: 1 });")).toEqual([]);
      expect(plantSites("await sb.from(`${tableVar}`);")).toEqual([]);
      expect(plantSites("await sb.from(`prefix_${tableVar}_suffix`);")).toEqual([]);
      expect(plantSites("await sb.from(TABLE.shows);")).toEqual([]);
    });

    // Renamed for accuracy (whole-diff R5 F5): extraction reads the ORIGINAL
    // source and never calls `stripCommentsForFile`, so this proves the PARSER
    // does not mistake commented-out code for code — not that stripping runs.
    // Stripping is still load-bearing elsewhere: the pins and the `coveredBy`
    // containment both read stripped text.
    test("the parser does not see calls that are commented out", () => {
      expect(plantSites('// await sb.from("commented_line");')).toEqual([]);
      expect(plantSites('/* await sb.from("commented_block"); */')).toEqual([]);
      // The same bytes outside a comment ARE seen, so the two assertions above
      // fail for the right reason rather than being vacuously green.
      expect(plantSites('await sb.from("commented_line");')).toEqual([
        { kind: "from", literal: "commented_line" },
      ]);
    });
  });

  describe("waiver self-tests", () => {
    const plantWaiver = (source: string): boolean => isWaived("planted.ts", source);

    test("a commented marker with a reason waives", () => {
      expect(
        plantWaiver("// not-subject-to-meta: projected from the fetched row\nawait x();"),
      ).toBe(true);
    });

    test("a blank reason does not waive", () => {
      expect(plantWaiver("// not-subject-to-meta:\nawait x();")).toBe(false);
      expect(plantWaiver("// not-subject-to-meta:   \nawait x();")).toBe(false);
    });

    test("a marker inside a string literal does not waive", () => {
      expect(plantWaiver('const s = "// not-subject-to-meta: pretending";\nawait x();')).toBe(
        false,
      );
    });

    // Near-miss spellings are NOT recognized, and that is the safe direction: an
    // unrecognized waiver leaves the file undischarged, so Layer 1 reds and names
    // it. The guard's promise is handled-or-signaled; this is the signalled half,
    // pinned here so it stays a decision rather than an accident.
    test("a near-miss marker spelling fails loudly rather than waiving quietly", () => {
      for (const spelling of [
        "//not-subject-to-meta: no space after the slashes",
        "//  not-subject-to-meta: two spaces after the slashes",
        "// not-subject-to-meta : space before the colon",
        "/* not-subject-to-meta: block comment form */",
        // Documentation ABOUT the convention must not waive a real call site.
        // Comment-stripping erases a block comment exactly as it erases a line
        // comment, so "absent after strip" alone could not tell these from the
        // real thing (whole-diff R2 F3).
        "/* // not-subject-to-meta: quoted directive */",
        "/**\n * // not-subject-to-meta: documentation example\n */",
        // R4 F4: the marker on its OWN line inside a block. Every textual "starts
        // a line" test accepts these; only the lexer knows the enclosing range is
        // MultiLineCommentTrivia, never a line comment.
        "/*\n// not-subject-to-meta: inner line of a plain block\n*/",
        "/**\n// not-subject-to-meta: inner line, no leading star\n*/",
        "/*\n    // not-subject-to-meta: inner line, indented\n*/",
        // R5 F2: not comments at all. A context-free lexer reads `//` inside a
        // regex character class as a line comment; the parse knows it is a
        // regex literal.
        "const waiverChars = /[// not-subject-to-meta: ]+/;",
      ]) {
        const source = `${spelling}\nawait sb.from("x");`;
        expect(plantWaiver(source), spelling).toBe(false);
        expect(undischargedFiles([scan("lib/data/__near_miss.ts", source)], {}), spelling).toEqual([
          "lib/data/__near_miss.ts",
        ]);
      }
    });
    // JSX text is the other place a context-free lexer sees a comment that is
    // not one. Planted through a .tsx path so the parse uses the JSX grammar
    // (whole-diff R5 F2).
    test("a marker in JSX text does not waive", () => {
      const source =
        'export const C = () => <div>// not-subject-to-meta: fake</div>;\nawait sb.from("x");';
      expect(isWaived("planted.tsx", source)).toBe(false);
      expect(undischargedFiles([scan("lib/data/__planted.tsx", source)], {})).toEqual([
        "lib/data/__planted.tsx",
      ]);
    });
  });

  describe("orphan-scan self-tests", () => {
    const ORPHAN = "lib/data/__planted_orphan.ts";
    const WAIVERED = "lib/data/__planted_waivered.ts";
    const CLEAN = "lib/data/__planted_clean.ts";
    const CALL = 'await sb.from("planted_table");';

    test("an unregistered, unwaivered call site is flagged; a waivered or call-free file is not", () => {
      const planted = [
        scan(ORPHAN, CALL),
        scan(WAIVERED, `// not-subject-to-meta: planted reason\n${CALL}`),
        scan(CLEAN, "export const x = 1;"),
      ];
      expect(undischargedFiles(planted, {})).toEqual([ORPHAN]);
    });

    test("deleting a waiver from a waiver-discharged file makes it an orphan", () => {
      expect(undischargedFiles([scan(WAIVERED, CALL)], {})).toEqual([WAIVERED]);
    });

    const ROWS: Registry = {
      [ORPHAN]: [{ kind: "from", literal: "planted_table", pin: [/from\("planted_table"\)/] }],
    };

    // Non-vacuous by construction: the planted file has NO waiver, so the two
    // results DIFFER and the registry is what makes the difference. An earlier
    // form planted a file that was already waivered, which returned [] with and
    // without the rows — it could not have detected precedence being reversed
    // (whole-diff R2 F5).
    test("registry rows discharge a file that has no waiver", () => {
      const planted = [scan(ORPHAN, CALL)];
      expect(undischargedFiles(planted, ROWS)).toEqual([]);
      expect(undischargedFiles(planted, {})).toEqual([ORPHAN]);
    });

    // Precedence proper. A waivered file WITH rows is still reconciled per-site,
    // so its waiver cannot smuggle an unpinned call past Layer 2 — asserted on
    // the reconciliation itself, since "not an orphan" cannot distinguish
    // "discharged by rows" from "discharged by the waiver".
    test("a waivered file with rows is still reconciled per-site", () => {
      const waiveredWithRows = scan(
        ORPHAN,
        `// not-subject-to-meta: planted reason\n${CALL}\nawait sb.from("smuggled_table");`,
      );
      expect(undischargedFiles([waiveredWithRows], ROWS)).toEqual([]);
      expect(reconciliationMismatches([waiveredWithRows], ROWS)).toEqual([
        {
          file: ORPHAN,
          extracted: [
            { kind: "from", literal: "planted_table" },
            { kind: "from", literal: "smuggled_table" },
          ],
          expected: [{ kind: "from", literal: "planted_table" }],
        },
      ]);
    });
  });

  describe("validateRows self-tests", () => {
    const SOURCE = "lib/data/__planted.ts";
    const SUITE = "tests/data/__planted.test.ts";

    const reader =
      (files: Record<string, string>): ReadFile =>
      (path) => {
        const text = files[path];
        if (text === undefined) throw new Error(`planted reader: no such file ${path}`);
        return text;
      };

    const MODULE_SOURCE =
      'export async function addAdminEmail() {\n  await sb.from("admin_emails");\n}\n';

    // The positive control. Without it, every rejection below could be produced
    // by a validateRows that rejects everything.
    test("a well-formed registry produces no problems", () => {
      const registry: Registry = {
        [SOURCE]: [
          { kind: "from", literal: "admin_emails", coveredBy: [SUITE], via: "addAdminEmail" },
        ],
      };
      expect(
        validateRows(
          registry,
          reader({ [SOURCE]: MODULE_SOURCE, [SUITE]: "test addAdminEmail rejects a bad email" }),
        ),
      ).toEqual([]);
    });

    test("an empty pin or coveredBy is rejected", () => {
      const emptyPin: Registry = {
        [SOURCE]: [{ kind: "from", literal: "admin_emails", pin: [] } as unknown as SiteRow],
      };
      expect(validateRows(emptyPin, reader({ [SOURCE]: MODULE_SOURCE }))).toEqual([
        expect.stringContaining("pin is empty"),
      ]);

      const emptyCoveredBy: Registry = {
        [SOURCE]: [
          { kind: "from", literal: "admin_emails", coveredBy: [], via: "addAdminEmail" },
        ] as unknown as SiteRow[],
      };
      expect(validateRows(emptyCoveredBy, reader({ [SOURCE]: MODULE_SOURCE }))).toEqual([
        expect.stringContaining("coveredBy is empty"),
      ]);
    });

    // Substring coupling is not coupling. `shows` is a substring of
    // `shows_internal`, and BOTH are live literals in this registry, so a
    // `shows` row could be discharged by a pin copied off a `shows_internal`
    // site — the exact defect the coupling rule exists to stop. An empty
    // literal was worse: `includes("")` is true of every pin, so any pin
    // discharged it (whole-diff R3 F1). The literal must appear as a QUOTED
    // ARGUMENT in the pin, which is what "this pin guards THIS site" means.
    test("a pin coupled only by substring, or to an empty literal, is rejected", () => {
      const source =
        'await sb.from("shows_internal");\nawait sb.from("shows");\nawait sb.from("");\n';
      const substringCollision: Registry = {
        [SOURCE]: [{ kind: "from", literal: "shows", pin: [/\.from\("shows_internal"\)/] }],
      };
      expect(validateRows(substringCollision, reader({ [SOURCE]: source }))).toEqual([
        expect.stringContaining("no pin embeds the row literal"),
      ]);

      const emptyLiteral: Registry = {
        [SOURCE]: [{ kind: "from", literal: "", pin: [/\.from\("shows_internal"\)/] }],
      };
      expect(validateRows(emptyLiteral, reader({ [SOURCE]: source }))).toEqual([
        expect.stringContaining("no pin embeds the row literal"),
      ]);

      // Controls: the honestly-coupled forms of both still pass, so the
      // rejections above are the rule firing and not an unsatisfiable fixture.
      const honest: Registry = {
        [SOURCE]: [
          { kind: "from", literal: "shows", pin: [/\.from\("shows"\)/] },
          { kind: "from", literal: "", pin: [/\.from\(""\)/] },
        ],
      };
      expect(validateRows(honest, reader({ [SOURCE]: source }))).toEqual([]);
    });

    test("a pin copied from another site — matching, but not embedding this row's literal — is rejected", () => {
      const registry: Registry = {
        [SOURCE]: [{ kind: "from", literal: "new_table", pin: [/from\("admin_emails"\)/] }],
      };
      expect(validateRows(registry, reader({ [SOURCE]: MODULE_SOURCE }))).toEqual([
        expect.stringContaining("no pin embeds the row literal"),
      ]);
    });

    test("a pin that no longer matches the source is rejected", () => {
      const registry: Registry = {
        [SOURCE]: [
          {
            kind: "from",
            literal: "admin_emails",
            pin: [/const \{ data, error \} = await sb\.from\("admin_emails"\)/],
          },
        ],
      };
      expect(validateRows(registry, reader({ [SOURCE]: MODULE_SOURCE }))).toEqual([
        expect.stringContaining("do not match the source"),
      ]);
    });

    test("an empty or strict-prefix-typo via is rejected by the exact-export check", () => {
      // The planted suite names the LITERAL, so the containment rule is satisfied
      // for every `via` below and the export rule is the only thing under test.
      const suiteText = "test addAdminEmail writes an admin_emails row";
      for (const via of ["", "addAdmin", "AddAdminEmail"]) {
        const registry: Registry = {
          [SOURCE]: [{ kind: "from", literal: "admin_emails", coveredBy: [SUITE], via }],
        };
        expect(
          validateRows(registry, reader({ [SOURCE]: MODULE_SOURCE, [SUITE]: suiteText })),
          `via "${via}" must be rejected`,
        ).toEqual([expect.stringContaining("is not an exported identifier")]);
      }
      // Control: the exact export name passes, so the rejections above are the
      // rule firing rather than the fixture being unsatisfiable.
      expect(
        validateRows(
          {
            [SOURCE]: [
              { kind: "from", literal: "admin_emails", coveredBy: [SUITE], via: "addAdminEmail" },
            ],
          },
          reader({ [SOURCE]: MODULE_SOURCE, [SUITE]: suiteText }),
        ),
      ).toEqual([]);
    });

    // §6.5 stands: `coveredBy` proves mention, not exercise, and the runtime
    // half stays with the behavioral suites. The one sub-case the machine can
    // rule out for free is a citation discharged by the suite's own PROSE, so
    // containment now reads the suite comment-stripped (whole-diff R2 F4).
    test("a coveredBy suite that mentions the symbol only in a comment is rejected", () => {
      const registry: Registry = {
        [SOURCE]: [
          { kind: "from", literal: "admin_emails", coveredBy: [SUITE], via: "addAdminEmail" },
        ],
      };
      expect(
        validateRows(
          registry,
          reader({
            [SOURCE]: MODULE_SOURCE,
            [SUITE]: "// addAdminEmail writes an admin_emails row\ntest('unrelated', () => {});",
          }),
        ),
      ).toEqual([expect.stringContaining("mentions neither the literal nor via")]);
    });

    test("a coveredBy suite mentioning neither the literal nor via is rejected", () => {
      const registry: Registry = {
        [SOURCE]: [
          { kind: "from", literal: "admin_emails", coveredBy: [SUITE], via: "addAdminEmail" },
        ],
      };
      expect(
        validateRows(
          registry,
          reader({ [SOURCE]: MODULE_SOURCE, [SUITE]: "test something else entirely" }),
        ),
      ).toEqual([expect.stringContaining("mentions neither the literal nor via")]);
    });

    // A symbol exported through a re-export list IS exported, and the parse
    // says so. The line-anchored regex this replaced could not see it, and that
    // limit existed only because the recognizer was weak — so it goes away with
    // the recognizer (whole-diff R4 F5).
    test("a via exported through a re-export list is accepted", () => {
      const reExportSource = "async function addAdminEmail() {}\nexport { addAdminEmail };\n";
      const registry: Registry = {
        [SOURCE]: [
          { kind: "from", literal: "admin_emails", coveredBy: [SUITE], via: "addAdminEmail" },
        ],
      };
      expect(
        validateRows(
          registry,
          reader({ [SOURCE]: reExportSource, [SUITE]: "test addAdminEmail writes admin_emails" }),
        ),
      ).toEqual([]);
    });

    // …and text that merely LOOKS like an export declaration is not one. A line
    // inside a multiline template, or after a backslash continuation, made a
    // bogus `via` pass while only `addAdminEmail` was exported (whole-diff R4 F5).
    test("export-shaped text inside a literal is not an export", () => {
      for (const [name, moduleSource] of [
        [
          "template",
          "export async function addAdminEmail() {}\nconst doc = `\nexport const addAdmin = 1;\n`;\n",
        ],
        [
          "continuation",
          'export async function addAdminEmail() {}\nconst doc = "\\\nexport const addAdmin = 1;";\n',
        ],
      ] as const) {
        const registry: Registry = {
          [SOURCE]: [
            { kind: "from", literal: "admin_emails", coveredBy: [SUITE], via: "addAdmin" },
          ],
        };
        expect(
          validateRows(
            registry,
            reader({ [SOURCE]: moduleSource, [SUITE]: "test addAdmin writes admin_emails" }),
          ),
          name,
        ).toEqual([expect.stringContaining("is not an exported identifier")]);
      }
    });

    // A `via` names the wrapper a suite CALLS. Every spelling below parses as an
    // export and exports nothing callable, so none can discharge a behavioral
    // citation (whole-diff R5 F3).
    test("a via that is type-only or declare-erased is rejected", () => {
      const erased: Array<[string, string]> = [
        ["export type", "function addAdminEmail() {}\nexport type { addAdminEmail };\n"],
        ["inline type specifier", "function addAdminEmail() {}\nexport { type addAdminEmail };\n"],
        ["declare function", "export declare function addAdminEmail(): void;\n"],
        ["declare class", "export declare class addAdminEmail {}\n"],
        ["declare const", "export declare const addAdminEmail: () => void;\n"],
      ];
      for (const [name, moduleSource] of erased) {
        const registry: Registry = {
          [SOURCE]: [
            { kind: "from", literal: "admin_emails", coveredBy: [SUITE], via: "addAdminEmail" },
          ],
        };
        expect(
          validateRows(
            registry,
            reader({
              [SOURCE]: moduleSource,
              [SUITE]: "test addAdminEmail writes an admin_emails row",
            }),
          ),
          name,
        ).toEqual([expect.stringContaining("is not an exported identifier")]);
      }
    });

    // Containment is by IDENTIFIER, not by ASCII word boundary. `\b` sees a
    // boundary between `x` and `$`, and between `é` and `X`, so a citation was
    // dischargeable by a suite that never mentions the symbol at all
    // (whole-diff R7 F1).
    test("a coveredBy suite mentioning only a LARGER identifier is rejected", () => {
      const cases: Array<[string, string, string, string]> = [
        // name, module source, via, suite text
        ["leading $ in via", "export function $get() {}\n", "$get", "test x$get does something"],
        ["trailing $ in via", "export function get$() {}\n", "get$", "test get$x does something"],
        ["unicode via", "export function café() {}\n", "café", "test caféX does something"],
      ];
      for (const [name, moduleSource, via, suiteText] of cases) {
        const registry: Registry = {
          [SOURCE]: [{ kind: "from", literal: "admin_emails", coveredBy: [SUITE], via }],
        };
        expect(
          validateRows(registry, reader({ [SOURCE]: moduleSource, [SUITE]: suiteText })),
          name,
        ).toEqual([expect.stringContaining("mentions neither the literal nor via")]);
      }
    });

    // ECMAScript IdentifierPart is not "letter, digit, `_` or `$`". Each family
    // below continues an identifier, so `get<mark>x` is ONE identifier and a
    // `via` of `get` must not match inside it (whole-diff R8 F1). Taken from the
    // `ID_Continue` property rather than enumerated — this list is the evidence
    // the property covers them, not the mechanism.
    test("a coveredBy suite mentioning a larger identifier in any IdentifierPart family is rejected", () => {
      const families: Array<[string, string]> = [
        ["Mn combining mark", "\u0301"],
        ["Mc spacing mark", "\u0903"],
        ["Pc connector punctuation", "\u203F"],
        ["Other_ID_Continue", "\u00B7"],
        ["non-letter ID_Start", "\u2118"],
        ["ZWNJ", "\u200C"],
        ["ZWJ", "\u200D"],
      ];
      for (const [name, continuation] of families) {
        const registry: Registry = {
          [SOURCE]: [{ kind: "from", literal: "admin_emails", coveredBy: [SUITE], via: "get" }],
        };
        expect(
          validateRows(
            registry,
            reader({
              [SOURCE]: "export function get() {}\n",
              [SUITE]: `test get${continuation}x does something`,
            }),
          ),
          name,
        ).toEqual([expect.stringContaining("mentions neither the literal nor via")]);
      }
    });

    test("a coveredBy suite mentioning the exact identifier is accepted", () => {
      const cases: Array<[string, string, string, string]> = [
        ["leading $ in via", "export function $get() {}\n", "$get", "test $get(1) does something"],
        ["unicode via", "export function café() {}\n", "café", "test café(1) does something"],
      ];
      for (const [name, moduleSource, via, suiteText] of cases) {
        const registry: Registry = {
          [SOURCE]: [{ kind: "from", literal: "admin_emails", coveredBy: [SUITE], via }],
        };
        expect(
          validateRows(registry, reader({ [SOURCE]: moduleSource, [SUITE]: suiteText })),
          name,
        ).toEqual([]);
      }
    });

    // The same boundary applies to the LITERAL operand of the OR.
    test("a coveredBy suite mentioning only a larger table name is rejected", () => {
      const registry: Registry = {
        [SOURCE]: [
          { kind: "from", literal: "admin_emails", coveredBy: [SUITE], via: "addAdminEmail" },
        ],
      };
      expect(
        validateRows(
          registry,
          reader({ [SOURCE]: MODULE_SOURCE, [SUITE]: "test admin_emails_v2 rows" }),
        ),
      ).toEqual([expect.stringContaining("mentions neither the literal nor via")]);
    });

    test("a coveredBy citation to a deleted or renamed suite is rejected", () => {
      const registry: Registry = {
        [SOURCE]: [
          { kind: "from", literal: "admin_emails", coveredBy: [SUITE], via: "addAdminEmail" },
        ],
      };
      expect(validateRows(registry, reader({ [SOURCE]: MODULE_SOURCE }))).toEqual([
        expect.stringContaining("does not exist"),
      ]);
    });
  });
});
