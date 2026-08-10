// A DERIVED ban on the Tailwind arrow form `utility-(--token)` for tokens the `@theme`
// block declares — never an enumeration of the tokens that happen to be wrong today.
//
// Spec: docs/superpowers/specs/2026-08-09-quick-wins-2-mech.md §2.2
// Plan: docs/superpowers/plans/2026-08-09-quick-wins-2/plan.md, Task A2
//
// WHY A REPO GUARD AND NOT THE LINT RULE. `better-tailwindcss/enforce-canonical-classes`
// was believed to enforce canonical forms for every `@theme` token; probed 2026-08-09 it
// does not. Of the 35 `var(--…-runtime)` indirection tokens the block declares, direct
// ESLint probes found 29 already canonicalized and SIX silent: `--shadow-tile`,
// `--shadow-popover`, `--color-text-subtle`, `--color-text-faint`, `--color-accent`,
// `--color-accent-on-bg`. Which tokens the plugin happens to see is not a contract, so the
// ban is derived from the token DECLARATIONS instead: for every covered namespace the
// `@theme` token generates a canonical utility resolving the SAME token, so the arrow form
// is never necessary. That covers the measured silent residue, every future token on
// arrival, and is merely redundant where the plugin already reports.
//
// THE ONE EXCLUDED NAMESPACE: `--breakpoint-*`. Against the installed Tailwind 4.2.4
// compiler, `min-w-(--breakpoint-sm)` emits `var(--breakpoint-sm)` while `min-w-sm`
// resolves `--container-sm` — a DIFFERENT token. There is no token-preserving canonical
// form there, so a mistaken "canonicalization" would silently change the resolved value.
// The tree carries zero live breakpoint arrows; the exclusion protects the legitimate
// spelling should one appear (spec §4 limit 6).
//
// SCOPE (spec §4 limit 1): string literals in tracked `.ts`/`.tsx` under `app/`,
// `components/`, `lib/`. A class assembled at runtime from fragments (`"shadow-(" + t +
// ")"`) is invisible — the same posture as every specLint guard. Accidental authoring is
// the threat model; adversarial obfuscation files as a documented limit, not a finding.
//
// SELF-TESTS ARE EXECUTABLE AND IN THIS FILE (writing-plans, repair-economy rule 4): a
// scanner's claims are planted as positive AND negative shapes in the same commit as the
// scanner. There are zero live breakpoint arrows to exercise the exclusion with, so the
// exclusion would otherwise be an untested assertion about nothing. The four mutation
// families this guard is reviewed against, each with its killing fixture:
//
//   token-parse namespace narrowing  → the three-namespace positive set. The >=30 premise
//                                      alone does NOT catch it: 105 declarations survive a
//                                      broad namespace loss.
//   extension-set narrowing          → the .ts + .tsx positive pair (every namespace is
//                                      planted at BOTH extensions and all three roots).
//   namespace-exclusion removal      → the `--breakpoint-*` negative.
//   comment-stripping removal        → the comment-only negative.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";

import { premise, premiseHolds } from "../_shared/premise";
import { stripCssComments } from "../_shared/stripComments";

const ROOT = process.cwd();
const GLOBALS = path.join(ROOT, "app/globals.css");

/** The roots a shipped className can live in. */
const UI_ROOTS = ["app", "components", "lib"] as const;

/** The extensions this guard reads (spec §4 limit 1). */
const UI_EXTENSIONS = [".ts", ".tsx"] as const;

/**
 * The one excluded namespace, by PREFIX rather than by token name — a fourth breakpoint
 * token added tomorrow is excluded on arrival, with no edit here.
 */
const EXCLUDED_NAMESPACE = "--breakpoint-";

/* ────────────────────────────────────────────────────────────────────────────
 * Deriving the covered token set from the `@theme` block
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Every custom property declared directly inside `@theme { … }`.
 *
 * Comments are stripped first: the block's prose names token spellings (including arrow
 * forms it deprecates), and a declaration-shaped line inside a comment is not a
 * declaration. The block carries no nested rule, so brace depth 1 is the whole body.
 */
export function declaredThemeTokens(css: string): string[] {
  const stripped = stripCssComments(css);
  const names = new Set<string>();

  // EVERY `@theme` block, not the first (cross-model review R2). One block is
  // all this file has today — probed — but "the first one" is a grammar
  // assumption the CSS never made, and a second block is ordinary authoring.
  let from = 0;
  for (;;) {
    const open = stripped.indexOf("@theme", from);
    if (open === -1) break;
    const brace = stripped.indexOf("{", open);
    if (brace === -1) break;

    let depth = 0;
    let end = -1;
    for (let i = brace; i < stripped.length; i += 1) {
      const ch = stripped[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) break;

    // EVERY declaration, not the first per line. `--a: 1px; --b: 2px;` on one
    // line is valid CSS and was invisible to a line-anchored read.
    const body = stripped.slice(brace + 1, end);
    for (const match of body.matchAll(/(?:^|[;{])\s*(--[a-z0-9-]+)\s*:/g)) {
      if (match[1] !== undefined) names.add(match[1]);
    }
    from = end + 1;
  }
  return [...names].sort();
}

const DECLARED_TOKENS = declaredThemeTokens(fs.readFileSync(GLOBALS, "utf8"));
const COVERED_TOKENS = DECLARED_TOKENS.filter((t) => !t.startsWith(EXCLUDED_NAMESPACE));
const COVERED_SET = new Set(COVERED_TOKENS);

/* ────────────────────────────────────────────────────────────────────────────
 * The scanner
 * ──────────────────────────────────────────────────────────────────────────── */

interface ArrowSite {
  file: string;
  line: number;
  token: string;
  /** The source text of the string literal the arrow was found in. */
  text: string;
}

/** `utility-(--token)` — Tailwind v4's CSS-variable shorthand. */
const ARROW = /-\((--[a-z0-9-]+)\)/g;

/**
 * String-literal nodes only.
 *
 * Restricting to literals is what makes "comment-only lines excluded" structural rather
 * than a regex that has to model comment syntax: a comment is not a literal node, so it
 * can never reach the matcher. Template literals are read through their head/middle/tail
 * tokens, so a class list assembled with an interpolation still has its literal spans
 * scanned.
 */
function isScannableLiteral(node: ts.Node): boolean {
  return (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    node.kind === ts.SyntaxKind.TemplateHead ||
    node.kind === ts.SyntaxKind.TemplateMiddle ||
    node.kind === ts.SyntaxKind.TemplateTail
  );
}

function scanSource(rel: string, src: string): ArrowSite[] {
  const sourceFile = ts.createSourceFile(
    rel,
    src,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const sites: ArrowSite[] = [];
  const visit = (node: ts.Node): void => {
    if (isScannableLiteral(node)) {
      const start = node.getStart(sourceFile);
      // The RAW source text, not `node.text`: an arrow form carries no escape sequence, so
      // the two agree on content, and only the raw span lets a match offset resolve back to
      // a real line number.
      const raw = src.slice(start, node.getEnd());
      ARROW.lastIndex = 0;
      let match: RegExpExecArray | null = ARROW.exec(raw);
      while (match !== null) {
        const token = match[1];
        if (token !== undefined && COVERED_SET.has(token)) {
          sites.push({
            file: rel,
            line: sourceFile.getLineAndCharacterOfPosition(start + match.index).line + 1,
            token,
            text: raw,
          });
        }
        match = ARROW.exec(raw);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return sites;
}

function scanRoots(opts: {
  root: string;
  roots: readonly string[];
  tracked: boolean;
}): ArrowSite[] {
  const files = opts.tracked
    ? trackedFiles(opts.root, opts.roots)
    : walkFiles(opts.root, opts.roots);
  return files.flatMap((rel) =>
    scanSource(rel, fs.readFileSync(path.join(opts.root, rel), "utf8")),
  );
}

/** Tracked files only — an untracked scratch file is not a shipped className. */
function trackedFiles(root: string, roots: readonly string[]): string[] {
  return execFileSync("git", ["ls-files", "-z", ...roots], {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
  })
    .toString("utf8")
    .split("\0")
    .filter(
      (f) =>
        f.length > 0 && UI_EXTENSIONS.includes(path.extname(f) as (typeof UI_EXTENSIONS)[number]),
    )
    .sort();
}

function walkFiles(root: string, roots: readonly string[]): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const childRel = path.join(rel, entry.name);
      if (entry.isDirectory()) walk(childRel);
      else if (UI_EXTENSIONS.includes(path.extname(entry.name) as (typeof UI_EXTENSIONS)[number])) {
        out.push(childRel);
      }
    }
  };
  roots.forEach(walk);
  return out.sort();
}

/* ────────────────────────────────────────────────────────────────────────────
 * The self-test fixture — three namespaces × three roots × two extensions
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The three namespaces the positive set spans, and the fixture's own spelling of the
 * excluded one.
 *
 * `BREAKPOINT_PREFIX` is deliberately a SEPARATE literal from `EXCLUDED_NAMESPACE` above,
 * even though the two agree today. Deriving the negative from the scanner's own constant
 * would make the exclusion self-fulfilling: mutating `EXCLUDED_NAMESPACE` would move the
 * fixture with it and no assertion would notice. Held apart, that same mutation makes the
 * breakpoint negative get REPORTED, and the negatives test names it.
 */
const FIXTURE_NAMESPACES = ["--shadow-", "--spacing-", "--color-"] as const;
const BREAKPOINT_PREFIX = "--breakpoint-";

/**
 * The fixture's OWN roots and extensions, deliberately re-spelled rather than
 * reusing the scanner's constants (cross-model review R1, probed).
 *
 * A fixture that plants into `UI_ROOTS` and then scans `UI_ROOTS` moves WITH any
 * mutation of that constant: deleting `"app"` silently excluded 168 tracked
 * files and all four tests still passed, because the plants left with the scan.
 * Held apart, the same mutation loses a third of the positives AND fails the
 * agreement assertion below by name.
 */
const FIXTURE_ROOTS = ["app", "components", "lib"] as const;
const FIXTURE_EXTENSIONS = [".ts", ".tsx"] as const;

/**
 * A SECOND, independent read of the declared token names — a plain scan of the
 * `@theme` block rather than the scanner's own parser.
 *
 * Same reason: planting with tokens the scanner parsed makes the plants follow
 * the parser. Appending `-mut` to every parsed name left all four tests green,
 * because the fixture asked for the mutated spellings too. Reading the file
 * independently and then asserting the scanner AGREES turns that mutation into
 * a named failure.
 */
export function independentlyDeclaredTokens(css = fs.readFileSync(GLOBALS, "utf8")): string[] {
  // A different MECHANISM from the scanner's brace walk: split on `@theme`,
  // take each segment up to its closing brace at depth zero, and collect every
  // declaration. It reaches the same answer by another route, which is the
  // point — and it now covers multiple blocks and multiple declarations per
  // line, the two grammar shapes both readers used to miss together
  // (cross-model review R2; probed at one block and zero same-line pairs today,
  // so this closes a real class rather than a live defect).
  const stripped = stripCssComments(css);
  const names = new Set<string>();
  for (const segment of stripped.split("@theme").slice(1)) {
    const brace = segment.indexOf("{");
    if (brace === -1) continue;
    let depth = 0;
    let end = segment.length;
    for (let i = brace; i < segment.length; i += 1) {
      if (segment[i] === "{") depth += 1;
      else if (segment[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    for (const match of segment
      .slice(brace + 1, end)
      .matchAll(/(?:^|[;{])\s*(--[a-z0-9-]+)\s*:/g)) {
      if (match[1] !== undefined) names.add(match[1]);
    }
  }
  return [...names].sort();
}

const INDEPENDENT_TOKENS = independentlyDeclaredTokens();

/** Every root × extension combination — the walker-coverage dimension. */
const COMBINATIONS = FIXTURE_ROOTS.flatMap((root) =>
  FIXTURE_EXTENSIONS.map((ext) => ({ root, ext })),
);

interface Fixture {
  dir: string;
  /**
   * One REAL declared token per namespace, derived from the parsed set rather than spelled
   * out — a token rename cannot rot the fixture, and a positive built from a token the
   * parser did not find would be unfalsifiable by construction. `undefined` means the parse
   * found NOTHING in that namespace, which the positives test reports BY NAMESPACE rather
   * than throwing at module load: a parser narrowed to one namespace is exactly the mutation
   * this fixture exists to name.
   */
  tokens: readonly { namespace: string; token: string | undefined }[];
  breakpointToken: string | undefined;
  signature: (root: string, ext: string, token: string) => string;
}

const UNDECLARED_TOKEN = "--not-a-theme-token-quickwins2";

function buildFixture(): Fixture {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "theme-arrow-ban-"));
  const tokens = FIXTURE_NAMESPACES.map((namespace) => ({
    namespace,
    // From the INDEPENDENT read, not from COVERED_TOKENS — see the note above.
    token: INDEPENDENT_TOKENS.filter((t) => !t.startsWith(BREAKPOINT_PREFIX)).find((t) =>
      t.startsWith(namespace),
    ),
  }));
  const planted = tokens.flatMap((t) => (t.token === undefined ? [] : [t.token]));
  const signature = (root: string, ext: string, token: string): string => `${root}${ext}|${token}`;

  // Every namespace planted at EVERY root × extension combination. Narrowing the parser to
  // one namespace loses two thirds of the positives; dropping either extension loses half;
  // dropping a root loses a third. Each failure names itself.
  COMBINATIONS.forEach(({ root, ext }) => {
    const rel = path.join(root, "nested", `Fixture${ext === ".tsx" ? "Tsx" : "Ts"}${ext}`);
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    // Non-JSX shape, valid in `.ts` as well as `.tsx`.
    const lines = planted.map(
      (token, index) =>
        `export const planted${index} = "px-2 shadow-(${token}) fx-${signature(root, ext, token)}";`,
    );
    fs.writeFileSync(abs, `${lines.join("\n")}\n`, "utf8");
  });

  // The negatives, in one `.tsx` file. Each carries a marker so a wrongly-reported one is
  // named rather than counted. The comment negative uses a token spelling that IS covered,
  // so it discriminates the literal restriction rather than the covered-set filter.
  const breakpointToken = INDEPENDENT_TOKENS.find((t) => t.startsWith(BREAKPOINT_PREFIX));
  const commentToken = planted[0] ?? "--shadow-tile";

  const negAbs = path.join(dir, "components", "Negatives.tsx");
  fs.mkdirSync(path.dirname(negAbs), { recursive: true });
  fs.writeFileSync(
    negAbs,
    [
      `export const negBreakpoint = "neg-breakpoint min-w-(${breakpointToken ?? BREAKPOINT_PREFIX + "sm"})";`,
      `export const negNonTheme = "neg-non-theme shadow-(${UNDECLARED_TOKEN})";`,
      `// neg-comment shadow-(${commentToken}) — named here in order to deprecate it`,
      `/* neg-block-comment shadow-(${commentToken}) */`,
      `export const negCanonical = "neg-canonical shadow-tile";`,
      "",
    ].join("\n"),
    "utf8",
  );

  return { dir, tokens, breakpointToken, signature };
}

const fixture = buildFixture();
afterAll(() => {
  fs.rmSync(fixture.dir, { recursive: true, force: true });
});

/* ────────────────────────────────────────────────────────────────────────────
 * The guard
 * ──────────────────────────────────────────────────────────────────────────── */

describe("no `@theme`-token arrow forms survive in class strings (spec §2.2)", () => {
  // ── The premise, stated executably and UNCONDITIONALLY ──────────────────────────────
  //
  // A ban whose passing state is "found nothing" cannot prove its scanner works by finding
  // an empty set. These run before the clean-tree assertion, and none sits inside a `.each`
  // callback whose case count could be zero.

  it("premise / agreement: the scanner's roots, extensions and parsed tokens match an INDEPENDENT read", () => {
    // The three mutations this catches, each of which left every other assertion
    // in this file green when the fixture shared these constants with the scanner
    // (cross-model review R1, probed):
    //   delete a root       -> 168 (app) / 496 (lib) tracked files silently unscanned
    //   narrow an extension -> half the tree silently unscanned
    //   rename every token  -> the covered set matches nothing real
    expect([...UI_ROOTS], "the scanner's roots no longer match the fixture's").toEqual([
      ...FIXTURE_ROOTS,
    ]);
    expect([...UI_EXTENSIONS], "the scanner's extensions no longer match the fixture's").toEqual([
      ...FIXTURE_EXTENSIONS,
    ]);
    const missing = INDEPENDENT_TOKENS.filter((t) => !DECLARED_TOKENS.includes(t));
    const extra = DECLARED_TOKENS.filter((t) => !INDEPENDENT_TOKENS.includes(t));
    expect(
      { missing, extra },
      "the scanner's parsed token set disagrees with an independent read of the same @theme block",
    ).toEqual({ missing: [], extra: [] });
  });

  it("premise / grammar: BOTH readers see multiple @theme blocks and multiple declarations per line", () => {
    // The scanner and its independent cross-check shared two blind spots — only
    // the first block, only the first declaration per line — so they AGREED
    // while a declared token's arrow use went unreported (cross-model review
    // R2). Agreement between two readers is only evidence when they can
    // disagree, so the grammar is now planted as a fixture instead of assumed.
    const fixture = [
      "@theme {",
      "  --color-first: #000;",
      "  --color-same-line-a: 1px; --color-same-line-b: 2px;",
      "}",
      ":root { --not-a-theme-token: 3px; }",
      "@theme {",
      "  --color-second-block: #fff;",
      "}",
    ].join("\n");
    const expected = [
      "--color-first",
      "--color-same-line-a",
      "--color-same-line-b",
      "--color-second-block",
    ];
    expect(declaredThemeTokens(fixture), "the scanner's parser").toEqual(expected);
    expect(independentlyDeclaredTokens(fixture), "the independent cross-check").toEqual(expected);
  });

  it("premise / parse: the @theme block yields a real token set", () => {
    premise("declared @theme tokens parsed from app/globals.css", DECLARED_TOKENS.length, 30);
    premise("covered tokens after the --breakpoint-* exclusion", COVERED_TOKENS.length, 30);
    // The exclusion actually excluded something — otherwise it is a no-op that a mutation
    // could delete without any assertion noticing.
    expect(
      DECLARED_TOKENS.length - COVERED_TOKENS.length,
      "the --breakpoint-* exclusion removed no token; the exclusion negative below would be vacuous",
    ).toBeGreaterThan(0);
  });

  const fixtureSites = scanRoots({ root: fixture.dir, roots: FIXTURE_ROOTS, tracked: false });

  it("premise / positives: flags every namespace at every root × extension", () => {
    // A namespace the PARSE lost never reaches the plant, so it can never show up as a
    // missing signature below. Reported first, by namespace: this is the shape a parser
    // narrowed to one namespace takes, and it is the one the >=30 token premise cannot see
    // (105 declarations survive a broad namespace loss).
    const unresolved = fixture.tokens.filter((t) => t.token === undefined).map((t) => t.namespace);
    // Planted from the independent read, so this is the assertion that binds the
    // plants to the SCANNER: narrow its parse and the planted token stops being
    // covered, which is reported here rather than vanishing with the fixture.
    const uncovered = fixture.tokens.flatMap((t) =>
      t.token !== undefined && !COVERED_SET.has(t.token) ? [t.token] : [],
    );
    expect(
      uncovered,
      "these planted tokens are declared in @theme but the scanner's covered set does not hold " +
        "them, so the positives below can no longer discriminate anything",
    ).toEqual([]);
    expect(
      unresolved,
      "the @theme parse found NO token in these namespaces, so the positive set no longer " +
        "spans the scan space. A parser narrowed to one namespace passes every other " +
        "assertion in this file while arrow forms in the dropped namespaces go unreported.",
    ).toEqual([]);

    const seen = new Set(
      fixtureSites.flatMap((s) => {
        const match = /fx-([^"\s]+)/.exec(s.text);
        return match?.[1] !== undefined ? [match[1]] : [];
      }),
    );
    const missing = COMBINATIONS.flatMap(({ root, ext }) =>
      fixture.tokens.flatMap((t) =>
        t.token === undefined || seen.has(fixture.signature(root, ext, t.token))
          ? []
          : [fixture.signature(root, ext, t.token)],
      ),
    );
    expect(
      missing,
      "the scanner drops these root × extension × namespace combinations. An arrow form in " +
        "one of them would never be reported and the clean-tree assertion below would still " +
        "pass — the vacuous-premise failure this fixture exists to catch.",
    ).toEqual([]);
    premise("planted positive fixtures", COMBINATIONS.length * fixture.tokens.length, 10);
  });

  it("premise / negatives: does NOT flag breakpoints, non-theme variables, comments, or canonical utilities", () => {
    premiseHolds(
      "the @theme block declares at least one --breakpoint-* token, so the exclusion negative is not vacuous",
      fixture.breakpointToken !== undefined,
    );
    premiseHolds(
      `${UNDECLARED_TOKEN} is NOT declared in @theme, so the non-theme negative tests the covered-set filter`,
      !DECLARED_TOKENS.includes(UNDECLARED_TOKEN),
    );

    const negatives = fixtureSites.filter((s) => s.file.endsWith("Negatives.tsx"));
    const wronglyReported = negatives.map((s) => `${s.file}:${s.line} — ${s.token} in ${s.text}`);
    expect(
      wronglyReported,
      "a negative fixture was reported. `--breakpoint-*` has NO token-preserving canonical " +
        "utility (min-w-sm resolves --container-sm), a non-`@theme` variable is out of scope, " +
        "and a comment naming an arrow form in order to deprecate it is not a class string.",
    ).toEqual([]);
    // …and the negatives file really was scanned, so "reported nothing" is a result rather
    // than a walker that never opened the file.
    const negFile = path.join(fixture.dir, "components", "Negatives.tsx");
    premiseHolds("the negatives fixture file exists on the scanned path", fs.existsSync(negFile));
    premiseHolds(
      "the negatives fixture is reachable by the same walker that found the positives",
      walkFiles(fixture.dir, FIXTURE_ROOTS).includes(path.join("components", "Negatives.tsx")),
    );
  });

  // ── The guard itself ────────────────────────────────────────────────────────────────

  it("reports zero arrow forms of a declared @theme token under app/, components/, lib/", () => {
    // THE FIXTURE NEVER EXERCISES THIS WALKER. Every premise above runs through
    // `walkFiles` (an on-disk temp tree); the live guard runs through
    // `trackedFiles` (`git ls-files`). So a `trackedFiles` that returned NOTHING
    // — a wrong git argument, a cwd that is not a repository, a filter that
    // drops every extension — would report zero offenders and PASS, with all
    // four premises still green.
    //
    // Found by sweeping THIS FILE for the class the last two review rounds kept
    // landing on ("the fixture shares an assumption with the mechanism"), rather
    // than by waiting for a third round to land on it. The two walkers are
    // deliberately different code, so the fixture cannot vouch for this one; a
    // floor on what it returns can.
    const trackedCount = trackedFiles(ROOT, UI_ROOTS).length;
    premise("tracked .ts/.tsx files the live scan actually opened", trackedCount, 200);

    const offenders = scanRoots({ root: ROOT, roots: UI_ROOTS, tracked: true }).map(
      (s) => `${s.file}:${s.line} — ${s.token}`,
    );
    expect(
      offenders,
      "arrow-form class token(s). For every covered namespace the `@theme` token generates a " +
        "canonical utility resolving the SAME token — `shadow-(--shadow-tile)` is `shadow-tile` " +
        "— so the arrow form is never necessary, and `better-tailwindcss/enforce-canonical-classes` " +
        "is measurably SILENT on part of this set (six tokens, probed 2026-08-09). Replace each " +
        "with its canonical utility. `--breakpoint-*` is excluded by rule and never appears here.",
    ).toEqual([]);
  });
});
