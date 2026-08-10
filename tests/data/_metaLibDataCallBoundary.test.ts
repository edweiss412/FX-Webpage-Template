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
 * argument Prettier leaves alone (spec R2 F2); the `$` exclusion in the literal
 * class keeps substitution templates out, since those are dynamic names and
 * fall under the documented limit (spec §6.1). The optional `<...>` segment
 * covers the SDK's explicit type arguments — `.rpc<T>("x")` typechecks against
 * `SupabaseClient` and must be visible (spec R4 F1).
 */
const SUPABASE_CALL_RE = /\.(from|rpc)(?:<[^>()]*>)?\s*\(\s*(["'`])([^"'`$]+)\2/g;

type Site = { kind: "from" | "rpc"; literal: string };

function extractSites(strippedSource: string): Site[] {
  const re = new RegExp(SUPABASE_CALL_RE.source, "g");
  const sites: Site[] = [];
  let match = re.exec(strippedSource);
  while (match !== null) {
    const kind = match[1];
    const literal = match[3];
    if ((kind === "from" || kind === "rpc") && literal !== undefined) {
      sites.push({ kind, literal });
    }
    match = re.exec(strippedSource);
  }
  return sites;
}

const WAIVER_MARKER = "// not-subject-to-meta:";
const WAIVER_WITH_REASON_RE = /\/\/ not-subject-to-meta: \S/;

/**
 * Comment-proof waiver recognition, tightening the auth test's raw substring
 * check (spec R3 F3). Both halves must hold: the ORIGINAL carries a marker with
 * a non-empty reason, AND the marker is gone from the comment-STRIPPED source.
 * Present-in-original plus absent-after-strip proves the marker lives in a
 * comment, so a marker sitting inside a string literal cannot waive anything.
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
        if (!row.pin.some((pattern) => pattern.source.includes(row.literal))) {
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
          suiteText = readFile(suite);
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

    for (const [file, rows] of Object.entries(REGISTRY)) {
      const extracted = byFile.get(file)?.sites ?? [];
      expect(
        extracted,
        `Supabase call-site drift in ${file}. The scanner's ordered extraction no longer ` +
          "matches the registry rows: add, remove, or reorder rows to match, and give any " +
          "new row its own pin or coveredBy discharge.",
      ).toEqual(rows.map((row) => ({ kind: row.kind, literal: row.literal })));
    }
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

    test("registry rows discharge a file even when it also carries a waiver comment", () => {
      const planted = [scan(ORPHAN, `// not-subject-to-meta: planted reason\n${CALL}`)];
      const registry: Registry = {
        [ORPHAN]: [{ kind: "from", literal: "planted_table", pin: [/from\("planted_table"\)/] }],
      };
      expect(undischargedFiles(planted, registry)).toEqual([]);
      // …and precedence is real: the rows, not the waiver, are what Layer 2 checks.
      expect(undischargedFiles(planted, {})).toEqual([]);
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
