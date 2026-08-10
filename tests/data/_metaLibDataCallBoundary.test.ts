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

/**
 * The member being called and the object it is called on, for both access
 * forms. One extractor, so a rule that reads the member name and a rule that
 * reads the receiver can never disagree about what the call IS — they did
 * twice, and both times the exclusion below was the one left behind
 * (whole-diff R6 F2 on `(Array).from`, R9 F1 on `Array["from"]`).
 */
function calleeParts(node: ts.Expression): { receiver: ts.Expression; member: string } | undefined {
  const expr = unwrap(node);
  if (ts.isPropertyAccessExpression(expr)) {
    return { receiver: unwrap(expr.expression), member: expr.name.text };
  }
  if (ts.isElementAccessExpression(expr)) {
    const key = unwrap(expr.argumentExpression);
    if (!ts.isStringLiteralLike(key)) return undefined;
    return { receiver: unwrap(expr.expression), member: key.text };
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
function isStandardLibraryFrom(receiver: ts.Expression): boolean {
  return ts.isIdentifier(receiver) && receiver.text === "Array";
}

type Site = { kind: "from" | "rpc"; literal: string };

/**
 * Is this node a Supabase call site, and if so which one?
 *
 * ONE predicate, because every rule that asks "is this a site" must get the
 * same answer. Two readers of that question have now disagreed twice: the
 * `Array` exclusion once lagged the member-name reader (R9 F1), and the
 * erasure used for pin coupling once lagged the exclusion, so a pin naming only
 * an innocent `Array.from("x")` could be erased along with the real call and
 * look coupled to it (R14 F1). The answer lives here now, and nowhere else.
 */
function siteAt(node: ts.Node): { site: Site; argument: ts.Node } | undefined {
  if (!ts.isCallExpression(node)) return undefined;
  const parts = calleeParts(node.expression);
  if (parts === undefined) return undefined;
  if (parts.member !== "from" && parts.member !== "rpc") return undefined;
  const first = node.arguments[0];
  if (first === undefined) return undefined;
  const argument = unwrap(first);
  // `isStringLiteralLike` is a string literal OR a no-substitution template —
  // exactly the two forms that name a table statically. A template WITH
  // substitutions is a genuinely dynamic name and stays a documented limit
  // (§6.1); the parser draws that line, so an escaped `\${` inside an otherwise
  // static template is simply part of the name. `.text` is the COOKED value:
  // the name Postgres would see.
  if (!ts.isStringLiteralLike(argument)) return undefined;
  if (isStandardLibraryFrom(parts.receiver)) return undefined;
  return { site: { kind: parts.member, literal: argument.text }, argument };
}

function extractSites(source: string, file = "planted.ts"): Site[] {
  const sites: Site[] = [];
  const visit = (node: ts.Node): void => {
    const found = siteAt(node);
    if (found !== undefined) sites.push(found.site);
    ts.forEachChild(node, visit);
  };
  visit(parse(file, source));
  return sites;
}

/**
 * A pin is the author's RegExp, and it may carry `g` or `y` — which make
 * `.test()` STATEFUL. `lastIndex` then survives from one call to the next, so a
 * pin shared between two rows could report dependence for a row it never
 * guarded, purely from where the previous call left off (R14 F2). Every match
 * runs on a fresh, stateless copy.
 */
function matchesPin(pattern: RegExp, text: string): boolean {
  return new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, "")).test(text);
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
  // A DEFAULT export binds the name `default`, whatever the declaration is
  // called: `export default function addAdminEmail` exports `default`, and the
  // declaration name is local (R12 F2). `declare` erases entirely.
  const isRuntimeExport = (node: ts.Node): boolean =>
    hasModifier(node, ts.SyntaxKind.ExportKeyword) &&
    !hasModifier(node, ts.SyntaxKind.DeclareKeyword) &&
    !hasModifier(node, ts.SyntaxKind.DefaultKeyword);

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
 * The names a suite actually MENTIONS: every identifier it writes, and every
 * static string it contains.
 *
 * Three rounds landed on the text-containment predicate this replaces, each
 * with a token that the source spells one way and the language reads another:
 * ASCII `\b` let `x$get` satisfy `$get` (R7), a letter/digit approximation of
 * IdentifierPart let `get\u0301x` satisfy `get` (R8), and raw `#` and `\`
 * still let `#get`, `get\u0301x` and `admin_emails\u005Fv2` satisfy their
 * tokens (R10). Each repair widened a character class, and the next round found
 * the next spelling — the same open-set mistake the SCANNER escaped by moving
 * to the parse, and the same answer applies. Source text is not identifier
 * text: `\u005F` IS an underscore, `#get` is a private identifier and not
 * `get`, and only the lexer knows.
 *
 * String literals are collected alongside identifiers because a table name is
 * cited as a string, and because §6.5's ratified limit is that a mention in a
 * test title still counts. Comments contribute nothing, which is R2 F4's
 * comment-only rejection now falling out of the parse rather than needing a
 * separate strip.
 */
function mentionedNames(file: string, source: string): Set<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) names.add(node.text);
    else if (ts.isStringLiteralLike(node)) names.add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(parse(file, source));
  return names;
}

/**
 * Does this pin actually DEPEND on the row's call?
 *
 * Not "does the pin's text mention it" — that question is unanswerable, and
 * four rounds proved it. A bare substring let a `shows` row take a
 * `shows_internal` pin (R3 F1); the literal alone let an `rpc("shared")` row
 * take a `from("shared")` pin (R11 F1); a missing left boundary let
 * `notfrom("x")` take a `from` row (R12 F1); and reading that boundary out of
 * the pattern text still broke on supplementary-plane characters and on
 * `\u{61}from` (R13 F1, F2). Each repair lexed the pin's SOURCE a little
 * better and the next round found the next spelling — because a regex source is
 * a pattern, not a program, and lexing it is the same open-set mistake the
 * scanner and the mention check both escaped by asking a real question instead.
 *
 * The real question is behavioral: ERASE this row's call from the source, and
 * the pin must stop matching. A pin copied from another site, or from the other
 * call kind, or naming a different function entirely, goes on matching and is
 * rejected — whatever its text looks like. The erasure runs through the PARSE,
 * so every spelling the scanner already understands is erased too.
 *
 * Only the ARGUMENT is erased, not the callee. Erasing the callee as well was
 * this repair's own first bug, and a mutant found it: with `sb.from` blanked, a
 * pin of `/sb\.from\(/` — which names the member and nothing else, and would
 * discharge any `from` row in the file — stops matching and is ACCEPTED.
 * Leaving the callee in place keeps such a pin matching, so it is rejected,
 * which is what "this pin guards THIS site" has to mean.
 */
function sourceWithCallErased(
  file: string,
  original: string,
  stripped: string,
  kind: Site["kind"],
  literal: string,
): string {
  const ranges: Array<[number, number]> = [];
  const sourceFile = parse(file, original);
  const visit = (node: ts.Node): void => {
    const found = siteAt(node);
    if (found !== undefined && found.site.kind === kind && found.site.literal === literal) {
      ranges.push([found.argument.getStart(sourceFile), found.argument.getEnd()]);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  const chars = stripped.split("");
  for (const [from, to] of ranges) {
    for (let at = from; at < to && at < chars.length; at += 1) {
      if (chars[at] !== "\n") chars[at] = "\u0000";
    }
  }
  return chars.join("");
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
        // Rule 2 — call coupling, proven by ERASURE rather than by reading the
        // pattern's text. At least one pin must stop matching once this row's
        // call is removed from the source; a pin that survives its own site's
        // deletion was never guarding it.
        const erased = sourceWithCallErased(file, readFile(file), stripped, row.kind, row.literal);
        if (!row.pin.some((pattern) => !matchesPin(pattern, erased))) {
          problems.push(
            `${where}: no pin depends on this row's call — every pin still matches once the call is erased, so a pin copied from another site, another call kind, or another function cannot be told apart`,
          );
        }
        const unmatched = row.pin.filter((pattern) => !matchesPin(pattern, stripped));
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
        let mentioned: Set<string>;
        try {
          mentioned = mentionedNames(suite, readFile(suite));
        } catch {
          problems.push(`${where}: covering suite ${suite} does not exist`);
          continue;
        }
        // Literal OR via: a suite that mocks at the client boundary never
        // mentions the table literal (spec R2 F1 — tests/data/adminEmails.test.ts
        // names `listAdminEmails` seven times and `admin_emails` zero times).
        if (!mentioned.has(row.literal) && !(row.via !== "" && mentioned.has(row.via))) {
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
      // Element access is the same call, and the exclusion must read the
      // receiver the same way the member name is read — twice it did not
      // (whole-diff R9 F1).
      expect(plantSites('const chars = Array["from"]("abc");')).toEqual([]);
      expect(plantSites('const chars = Array[`from`]("abc");')).toEqual([]);
      expect(plantSites('const chars = Array?.["from"]?.("abc");')).toEqual([]);
      expect(plantSites('const chars = (Array)["from"]("abc");')).toEqual([]);
      // …and the exclusion is by RECEIVER, so a real boundary with the same
      // argument still counts.
      expect(plantSites('await sb.from("abc");')).toEqual([{ kind: "from", literal: "abc" }]);
      expect(plantSites('await sb["from"]("abc");')).toEqual([{ kind: "from", literal: "abc" }]);
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
        expect.stringContaining("no pin depends on this row's call"),
      ]);

      const emptyLiteral: Registry = {
        [SOURCE]: [{ kind: "from", literal: "", pin: [/\.from\("shows_internal"\)/] }],
      };
      expect(validateRows(emptyLiteral, reader({ [SOURCE]: source }))).toEqual([
        expect.stringContaining("no pin depends on this row's call"),
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
        expect.stringContaining("no pin depends on this row's call"),
      ]);
    });

    // `from` and `rpc` can name the same thing, so the literal alone does not
    // identify the site. An unhandled row of one kind could reuse a handled
    // pin of the other, in both directions (whole-diff R11 F1).
    test("a pin borrowed from the other call kind is rejected", () => {
      const source =
        'export async function f() {\n  const a = await sb.from("shared");\n  if (a.error) throw a.error;\n  await sb.rpc("shared");\n}\n';
      const borrowed: Registry = {
        [SOURCE]: [
          { kind: "from", literal: "shared", pin: [/sb\.from\("shared"\)/, /if \(a\.error\)/] },
          { kind: "rpc", literal: "shared", pin: [/sb\.from\("shared"\)/, /if \(a\.error\)/] },
        ],
      };
      expect(validateRows(borrowed, reader({ [SOURCE]: source }))).toEqual([
        expect.stringContaining("no pin depends on this row's call"),
      ]);

      const reversed: Registry = {
        [SOURCE]: [
          { kind: "from", literal: "shared", pin: [/sb\.rpc\("shared"\)/] },
          { kind: "rpc", literal: "shared", pin: [/sb\.rpc\("shared"\)/] },
        ],
      };
      expect(validateRows(reversed, reader({ [SOURCE]: source }))).toEqual([
        expect.stringContaining("no pin depends on this row's call"),
      ]);

      // Control: each row pinned to its OWN call kind passes, so the rejections
      // above are the rule firing and not an unsatisfiable fixture.
      const honest: Registry = {
        [SOURCE]: [
          { kind: "from", literal: "shared", pin: [/sb\.from\("shared"\)/, /if \(a\.error\)/] },
          { kind: "rpc", literal: "shared", pin: [/sb\.rpc\("shared"\)/] },
        ],
      };
      expect(validateRows(honest, reader({ [SOURCE]: source }))).toEqual([]);
    });

    // The member name needs its own LEFT boundary: `notfrom("x")` contains
    // `from("x")` and `myrpc("x")` contains `rpc("x")`, so a pin naming a
    // different function was discharging the row (whole-diff R12 F1).
    test("a pin naming a different function whose name ends in the member is rejected", () => {
      const source =
        'export async function f() {\n  await sb.from("shared_from");\n  await sb.rpc("shared_rpc");\n  notfrom("shared_from");\n  myrpc("shared_rpc");\n}\n';
      const borrowed: Array<[string, SiteRow]> = [
        ["notfrom", { kind: "from", literal: "shared_from", pin: [/notfrom\("shared_from"\)/] }],
        ["myrpc", { kind: "rpc", literal: "shared_rpc", pin: [/myrpc\("shared_rpc"\)/] }],
      ];
      for (const [name, row] of borrowed) {
        expect(validateRows({ [SOURCE]: [row] }, reader({ [SOURCE]: source })), name).toEqual([
          expect.stringContaining("no pin depends on this row's call"),
        ]);
      }

      // Control: the same pins with the real receiver pass, so the rejections
      // are the boundary firing rather than an unsatisfiable fixture.
      expect(
        validateRows(
          {
            [SOURCE]: [
              { kind: "from", literal: "shared_from", pin: [/sb\.from\("shared_from"\)/] },
              { kind: "rpc", literal: "shared_rpc", pin: [/sb\.rpc\("shared_rpc"\)/] },
            ],
          },
          reader({ [SOURCE]: source }),
        ),
      ).toEqual([]);
    });

    // R13's two spellings, and the reason they are no longer expressible: the
    // rule never reads the pattern's text, so how the pattern spells a
    // neighbouring function — with a supplementary-plane character, or with a
    // braced Unicode escape — cannot affect whether it depends on THIS call.
    test("a pin naming a neighbouring function is rejected however that name is spelled", () => {
      const source =
        'export async function f() {\n  await sb.from("shared_from");\n  await sb.rpc("shared_rpc");\n  \u{10400}from("shared_from");\n  afrom("shared_from");\n  \u{10400}rpc("shared_rpc");\n  arpc("shared_rpc");\n}\n';
      const borrowed: Array<[string, SiteRow]> = [
        [
          "astral prefix, from",
          { kind: "from", literal: "shared_from", pin: [/\u{10400}from\("shared_from"\)/u] },
        ],
        [
          "astral prefix, rpc",
          { kind: "rpc", literal: "shared_rpc", pin: [/\u{10400}rpc\("shared_rpc"\)/u] },
        ],
        [
          "braced escape, from",
          { kind: "from", literal: "shared_from", pin: [/\u{61}from\("shared_from"\)/u] },
        ],
        [
          "braced escape, rpc",
          { kind: "rpc", literal: "shared_rpc", pin: [/\u{61}rpc\("shared_rpc"\)/u] },
        ],
      ];
      for (const [name, row] of borrowed) {
        expect(validateRows({ [SOURCE]: [row] }, reader({ [SOURCE]: source })), name).toEqual([
          expect.stringContaining("no pin depends on this row's call"),
        ]);
      }

      // Control: pins on the real sites depend on them and pass.
      expect(
        validateRows(
          {
            [SOURCE]: [
              { kind: "from", literal: "shared_from", pin: [/sb\.from\("shared_from"\)/] },
              { kind: "rpc", literal: "shared_rpc", pin: [/sb\.rpc\("shared_rpc"\)/] },
            ],
          },
          reader({ [SOURCE]: source }),
        ),
      ).toEqual([]);
    });

    // A pin that names the member and not the literal would discharge any row
    // of that kind in the file. It must be rejected — the case that decides
    // whether the erasure covers the callee (it must not).
    test("a pin naming only the member, not the literal, is rejected", () => {
      const source =
        'export async function f() {\n  const a = await sb.from("only_one");\n  if (a.error) throw a.error;\n}\n';
      expect(
        validateRows(
          { [SOURCE]: [{ kind: "from", literal: "only_one", pin: [/sb\.from\(/] }] },
          reader({ [SOURCE]: source }),
        ),
      ).toEqual([expect.stringContaining("no pin depends on this row's call")]);

      // Control: naming the call passes.
      expect(
        validateRows(
          { [SOURCE]: [{ kind: "from", literal: "only_one", pin: [/sb\.from\("only_one"\)/] }] },
          reader({ [SOURCE]: source }),
        ),
      ).toEqual([]);
    });

    // The erasure must ask the SAME question the scanner asks. An excluded
    // `Array.from("shared")` is not a site, so it must not be erased — otherwise
    // a pin naming only that innocent call is erased along with the real one and
    // looks coupled to it (whole-diff R14 F1).
    test("a pin naming an excluded Array.from call does not count as depending on the site", () => {
      const source =
        'export async function f() {\n  const chars = Array.from("shared");\n  const a = await sb.from("shared");\n  if (a.error) throw a.error;\n  return chars;\n}\n';
      expect(
        validateRows(
          { [SOURCE]: [{ kind: "from", literal: "shared", pin: [/Array\.from\("shared"\)/] }] },
          reader({ [SOURCE]: source }),
        ),
      ).toEqual([expect.stringContaining("no pin depends on this row's call")]);

      // Control: the real site's pin still passes, so the rejection is the
      // exclusion firing rather than the fixture being unsatisfiable.
      expect(
        validateRows(
          { [SOURCE]: [{ kind: "from", literal: "shared", pin: [/sb\.from\("shared"\)/] }] },
          reader({ [SOURCE]: source }),
        ),
      ).toEqual([]);
    });

    // `g` and `y` make `.test()` stateful: `lastIndex` survives between calls,
    // so a pin shared by two rows could report dependence for a row it never
    // guarded, purely from where the previous call left off (whole-diff R14 F2).
    test("a stateful pin cannot discharge a row through leftover lastIndex", () => {
      const source =
        'export async function f() {\n  const a = await sb.from("first");\n  const b = await sb.rpc("second");\n}\n';
      for (const flags of ["g", "y", "gi"]) {
        const shared = new RegExp('sb\\.from\\("first"\\)', flags);
        const registry: Registry = {
          [SOURCE]: [
            { kind: "from", literal: "first", pin: [shared] },
            { kind: "rpc", literal: "second", pin: [shared] },
          ],
        };
        // The rpc row is discharged by a pin on the from site; stateless
        // matching must reject it every time, whatever ran before.
        expect(validateRows(registry, reader({ [SOURCE]: source })), flags).toEqual([
          expect.stringContaining('rpc("second"): no pin depends on this row\'s call'),
        ]);
      }
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

    // A suite MENTIONS a name when it writes that identifier or that string —
    // decided by the parse, because source text is not identifier text. Three
    // rounds of character-class widening died here: `x$get` satisfying `$get`
    // (R7), `get\u0301x` satisfying `get` (R8), and `#get` plus every escaped
    // spelling still satisfying theirs (R10).
    test("a larger or differently-spelled identifier does not count as a mention", () => {
      const cases: Array<[string, string, string, string]> = [
        // name, module source, via, suite source
        ["ascii suffix", "export function get() {}\n", "get", "test('x', () => { widget(); });"],
        ["leading $", "export function $get() {}\n", "$get", "test('x', () => { x$get(); });"],
        [
          "combining mark",
          "export function get() {}\n",
          "get",
          "test('x', () => { get\u0301x(); });",
        ],
        ["private identifier", "export function get() {}\n", "get", "class C {\n  #get() {}\n}"],
        [
          "unicode escape suffix",
          "export function get() {}\n",
          "get",
          "test('x', () => { get\\u0301x(); });",
        ],
        [
          "braced escape suffix",
          "export function get() {}\n",
          "get",
          "test('x', () => { get\\u{301}x(); });",
        ],
        [
          "braced escape prefix",
          "export function get() {}\n",
          "get",
          "test('x', () => { x\\u{301}get(); });",
        ],
      ];
      for (const [name, moduleSource, via, suiteSource] of cases) {
        const registry: Registry = {
          [SOURCE]: [{ kind: "from", literal: "admin_emails", coveredBy: [SUITE], via }],
        };
        expect(
          validateRows(registry, reader({ [SOURCE]: moduleSource, [SUITE]: suiteSource })),
          name,
        ).toEqual([expect.stringContaining("mentions neither the literal nor via")]);
      }
    });

    // The LITERAL operand takes the same treatment, including the escape that
    // spells an underscore.
    test("a larger or escaped table name does not count as a mention of the literal", () => {
      for (const [name, suiteSource] of [
        ["larger name", "test('x', () => { insert('admin_emails_v2'); });"],
        ["escaped underscore", "test('x', () => { admin_emails\\u005Fv2(); });"],
        ["braced escape", "test('x', () => { admin_emails\\u{5F}v2(); });"],
      ] as const) {
        const registry: Registry = {
          [SOURCE]: [
            { kind: "from", literal: "admin_emails", coveredBy: [SUITE], via: "addAdminEmail" },
          ],
        };
        expect(
          validateRows(registry, reader({ [SOURCE]: MODULE_SOURCE, [SUITE]: suiteSource })),
          name,
        ).toEqual([expect.stringContaining("mentions neither the literal nor via")]);
      }
    });

    // Controls: the exact identifier and the exact string DO count, so the
    // rejections above are the rule firing rather than an unsatisfiable fixture.
    test("the exact identifier or the exact string counts as a mention", () => {
      const viaMention: Registry = {
        [SOURCE]: [
          { kind: "from", literal: "admin_emails", coveredBy: [SUITE], via: "addAdminEmail" },
        ],
      };
      expect(
        validateRows(
          viaMention,
          reader({
            [SOURCE]: MODULE_SOURCE,
            [SUITE]: "test('x', () => { addAdminEmail(); });",
          }),
        ),
      ).toEqual([]);
      expect(
        validateRows(
          viaMention,
          reader({
            [SOURCE]: MODULE_SOURCE,
            [SUITE]: "test('x', () => { expect(t).toBe('admin_emails'); });",
          }),
        ),
      ).toEqual([]);
    });

    // A DEFAULT export binds the name `default`; the declaration's own name is
    // local and cannot be imported by it (whole-diff R12 F2).
    test("a via naming a default-exported declaration is rejected", () => {
      for (const [name, moduleSource] of [
        ["default function", "export default function addAdminEmail() {}\n"],
        ["default class", "export default class addAdminEmail {}\n"],
      ] as const) {
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
              [SUITE]: "test('x', () => { addAdminEmail(); });",
            }),
          ),
          name,
        ).toEqual([expect.stringContaining("is not an exported identifier")]);
      }
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
