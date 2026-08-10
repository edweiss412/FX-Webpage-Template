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
 * The string-literal first argument is the discriminator: every real Supabase
 * builder/RPC call names its table or function as a literal, while the two
 * non-Supabase `.from(` shapes in this corpus (`Array.from(iterable)`,
 * `Array.from({ length: n })`) take no literal at all. The quote class includes
 * the backtick because a no-substitution template is an ordinary string
 * argument Prettier leaves alone (spec R2 F2). The optional `<...>` segment
 * covers the SDK's explicit type arguments — `.rpc<T>("x")` typechecks against
 * `SupabaseClient` and must be visible (spec R4 F1).
 *
 * Nothing between the method name and its argument list is assumed adjacent:
 * whitespace, an optional generic segment, and an optional `?.` may all sit
 * there. `sb.from <Row>("x")`, `sb.rpc/* note *\/<Row>("x")` (a comment is
 * blanked to spaces before the scan) and `sb.rpc?.("x")` all typecheck against
 * `SupabaseClient`, and every one of them was silently invisible when the
 * pattern required adjacency (whole-diff R3 F2, F3).
 *
 * The literal body runs lazily to the BACKREFERENCED closing quote, so the only
 * character it excludes is the one that opened it. An earlier form excluded all
 * three quote characters and `$` outright, which silently dropped
 * `.rpc("cost$center")`, `.from("crew's")`, `.rpc('say"hi')`, a backticked
 * `cost$center`, and `.from("")` — ordinary authoring that compiles, made
 * invisible to every layer. Substitution templates are excluded where they
 * actually live (below), not by banning `$` from every quoting style.
 */
const SUPABASE_CALL_RE =
  /\.(from|rpc)\s*(?:<[^>()]*>)?\s*(?:\?\.)?\s*\(\s*(["'`])((?:\\[\s\S]|[^\\])*?)\2/g;

type Site = { kind: "from" | "rpc"; literal: string };

/**
 * Is this backtick literal a genuinely DYNAMIC name?
 *
 * Only an unescaped `${` opens a substitution. Dropping every literal whose raw
 * text contains `${` also drops `` `cost\${center}` ``, which evaluates to the
 * static string `cost${center}` — silently, which is the one thing this guard
 * must never do. Removing escape PAIRS first is what makes the test exact: it
 * consumes `\$` (so the `{` is left harmless) and consumes `\\` (so a literal
 * backslash cannot hide the live `${` that follows it).
 */
function isSubstitutionTemplate(literal: string): boolean {
  return literal.replace(/\\[\s\S]/g, "").includes("${");
}

function extractSites(strippedSource: string): Site[] {
  const re = new RegExp(SUPABASE_CALL_RE.source, "g");
  const sites: Site[] = [];
  let match = re.exec(strippedSource);
  while (match !== null) {
    const kind = match[1];
    const quote = match[2];
    const literal = match[3];
    if ((kind === "from" || kind === "rpc") && literal !== undefined) {
      // A SUBSTITUTION template is a genuinely dynamic name and stays a
      // documented limit (§6.1); a no-substitution template is an ordinary
      // string argument and counts.
      if (!(quote === "`" && isSubstitutionTemplate(literal))) sites.push({ kind, literal });
    }
    match = re.exec(strippedSource);
  }
  return sites;
}

const WAIVER_MARKER = "// not-subject-to-meta:";

/**
 * The marker must OPEN its own line comment: optional indentation, then `//`,
 * then the marker and a non-empty reason.
 *
 * Anchoring to the line start is what keeps a QUOTED marker from waiving. A
 * `/* // not-subject-to-meta: … *\/` block, or a JSDoc line reading
 * ` * // not-subject-to-meta: …`, is documentation ABOUT the convention — and
 * both were accepted by the earlier unanchored form, because comment-stripping
 * removes a block comment just as thoroughly as a line comment, so
 * "absent after strip" could not tell them apart (whole-diff R2 F3). Writing
 * about the directive in a JSDoc is ordinary; silently waiving a real call site
 * because someone documented the convention is not acceptable.
 */
const WAIVER_WITH_REASON_RE = /^[ \t]*\/\/ not-subject-to-meta: \S/m;

/**
 * Comment-proof waiver recognition, tightening the auth test's raw substring
 * check (spec R3 F3). Both halves must hold: the ORIGINAL opens a line comment
 * with the marker and a non-empty reason, AND the marker is gone from the
 * comment-STRIPPED source. Present-in-original plus absent-after-strip proves
 * the marker lives in a comment, so a marker inside a string literal cannot
 * waive; the line anchor proves it is the LINE comment that carries it.
 */
function isWaived(original: string, stripped: string): boolean {
  return WAIVER_WITH_REASON_RE.test(original) && !stripped.includes(WAIVER_MARKER);
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

/** Exported identifiers of a module, anchored so a mention inside a body cannot count. */
function exportedNames(strippedSource: string): Set<string> {
  const re = /^export (?:async )?(?:function|const) ([A-Za-z_$][\w$]*)/gm;
  const names = new Set<string>();
  let match = re.exec(strippedSource);
  while (match !== null) {
    const name = match[1];
    if (name !== undefined) names.add(name);
    match = re.exec(strippedSource);
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

function containsWholeWord(haystack: string, token: string): boolean {
  if (token === "") return false;
  return new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(haystack);
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
    const exports = exportedNames(stripped);

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
  const stripped = stripCommentsForFile(source, file);
  return { file, original: source, stripped, sites: extractSites(stripped) };
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
    .filter((entry) => !isWaived(entry.original, entry.stripped))
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
    const plantSites = (source: string): Site[] =>
      extractSites(stripCommentsForFile(source, "planted.ts"));

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

    // One shape, several spellings: what sits between the method name and its
    // argument list is not always adjacent. Each of these typechecks against the
    // installed `SupabaseClient`, and each was SILENTLY invisible — the site
    // vanished from the extraction, so Layer 1 saw no call and Layer 2 still
    // reconciled (whole-diff R3 F2, F3).
    test("the method, its type arguments and its argument list need not be adjacent", () => {
      expect(plantSites('await sb.from <Row>("spaced_generic");')).toEqual([
        { kind: "from", literal: "spaced_generic" },
      ]);
      // A comment between the two is blanked to spaces before the scan, so it
      // reaches the scanner as the same shape by a different route.
      expect(plantSites('await sb.rpc/* note */<Row>("commented_generic");')).toEqual([
        { kind: "rpc", literal: "commented_generic" },
      ]);
      expect(plantSites('await sb.rpc?.("optional_rpc");')).toEqual([
        { kind: "rpc", literal: "optional_rpc" },
      ]);
      expect(plantSites('await sb.from?.("optional_table");')).toEqual([
        { kind: "from", literal: "optional_table" },
      ]);
      expect(plantSites('await sb.rpc<Row>?.("optional_typed");')).toEqual([
        { kind: "rpc", literal: "optional_typed" },
      ]);
      // The discriminator is unchanged: still no string literal, still no site.
      expect(plantSites("const xs = Array.from (iterable);")).toEqual([]);
      expect(plantSites("const ys = Array.from?.(iterable);")).toEqual([]);
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
      // An escaped closing quote does not end the literal.
      expect(plantSites('await sb.from("say \\"hi\\"").select("*");')).toEqual([
        { kind: "from", literal: 'say \\"hi\\"' },
      ]);
    });

    // Two more shapes that were SILENTLY dropped — the same failure mode as the
    // class above, found by probing the repaired scanner rather than the
    // original (whole-diff R2 F1, F2).
    test("an escaped ${ is a static name, and a backslash line continuation does not end the literal", () => {
      // `\${` produces the two characters `$` and `{` at runtime, so the name is
      // static. Testing for `${` in the raw text called it dynamic and dropped it.
      expect(plantSites("await sb.rpc(`cost\\${center}`);")).toEqual([
        { kind: "rpc", literal: "cost\\${center}" },
      ]);
      // A real substitution is still dropped, including one behind a literal
      // backslash — `\\` is an escaped backslash, so the `${` after it is live.
      expect(plantSites("await sb.from(`${tableVar}`);")).toEqual([]);
      expect(plantSites("await sb.from(`a\\\\${tableVar}`);")).toEqual([]);
      // A backslash line continuation: the escape must be able to consume a line
      // terminator, which `\\.` cannot — `.` is not dot-all.
      for (const [name, terminator] of [
        ["LF", "\n"],
        ["CR", "\r"],
        ["CRLF", "\r\n"],
        ["LS", "\u2028"],
        ["PS", "\u2029"],
      ] as const) {
        expect(plantSites(`await sb.from("continued\\${terminator}name");`), name).toEqual([
          { kind: "from", literal: `continued\\${terminator}name` },
        ]);
      }
    });

    test("extracts sites in source order, distinguishing kind and duplicate literals", () => {
      expect(
        plantSites(
          'const a = await sb.from("shows_internal").select("run_of_show");\n' +
            'const b = await sb.rpc("viewer_version_token");\n' +
            'const c = await sb.from("shows_internal").select("financials");\n',
        ),
      ).toEqual([
        { kind: "from", literal: "shows_internal" },
        { kind: "rpc", literal: "viewer_version_token" },
        { kind: "from", literal: "shows_internal" },
      ]);
    });

    test("rejects the corpus's non-Supabase shapes", () => {
      expect(plantSites("const years = Array.from(iterable);")).toEqual([]);
      expect(plantSites("const xs = Array.from({ length: n });")).toEqual([]);
      expect(plantSites("const o = Object.fromEntries(pairs);")).toEqual([]);
    });

    test("documented limit §6.1: dynamic names and paren/nested-angle generics are invisible", () => {
      expect(plantSites("await sb.from(tableVar);")).toEqual([]);
      expect(plantSites("await sb.rpc(fnVar, { p: 1 });")).toEqual([]);
      expect(plantSites("await sb.from(`${tableVar}`);")).toEqual([]);
      expect(plantSites("await sb.from(`prefix_${tableVar}_suffix`);")).toEqual([]);
      expect(plantSites('await sb.rpc<Record<string, () => void>>("parens_generic");')).toEqual([]);
      expect(plantSites('await sb.rpc<Array<string>>("nested_angles");')).toEqual([]);
    });

    test("comment stripping is load-bearing", () => {
      expect(plantSites('// await sb.from("commented_line");')).toEqual([]);
      expect(plantSites('/* await sb.from("commented_block"); */')).toEqual([]);
      // The same bytes outside a comment ARE seen — so the two assertions above
      // fail for the right reason, and dropping the strip from the scan path
      // turns them red rather than leaving them vacuously green.
      expect(plantSites('await sb.from("commented_line");')).toEqual([
        { kind: "from", literal: "commented_line" },
      ]);
    });
  });

  describe("waiver self-tests", () => {
    const plantWaiver = (source: string): boolean =>
      isWaived(source, stripCommentsForFile(source, "planted.ts"));

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
      ]) {
        const source = `${spelling}\nawait sb.from("x");`;
        expect(plantWaiver(source), spelling).toBe(false);
        expect(undischargedFiles([scan("lib/data/__near_miss.ts", source)], {}), spelling).toEqual([
          "lib/data/__near_miss.ts",
        ]);
      }
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

    // The export scanner reads `export function` / `export const` declarations.
    // A symbol exported only through a re-export list is not seen — and the
    // result is a REJECTION naming the row, not a silent pass, which is the
    // direction the consequence bound requires. Pinned so the limit is a
    // decision rather than an accident.
    test("a via exported only via a re-export list is rejected, not silently accepted", () => {
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
      ).toEqual([expect.stringContaining("is not an exported identifier")]);
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
