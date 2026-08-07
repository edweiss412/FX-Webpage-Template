/**
 * tests/styles/_metaEmDashCopy.test.ts — the em-dash copy guard (BL-EM-DASH-POLICY).
 *
 * `DESIGN.md` §9 says "No em dashes. Use commas, colons, semicolons, periods,
 * parentheses. Also not `--`." That was aspirational for as long as nothing
 * checked it. This is the check.
 *
 * WHY IT IS STRUCTURAL, NOT A GREP. A raw-character scan over these files
 * counts COMMENTS, and comments are explicitly out of scope — the earlier
 * censuses that motivated this entry were inflated exactly that way (the
 * catalog's nine raw hits are all comments; its copy strings are clean). So the
 * scanner parses TypeScript and keys on NODE KINDS:
 *
 *   StringLiteral, NoSubstitutionTemplateLiteral,
 *   TemplateHead / TemplateMiddle / TemplateTail,   <- the escaping class
 *   JsxText, and JSX attribute string values.
 *
 * The template FRAGMENTS matter and are easy to miss: TypeScript's
 * `isStringLiteralLike` excludes them, so a scanner built on that helper alone
 * silently misses live copy — including both known notify hits, which are
 * `TemplateMiddle`.
 *
 * THE `--` RULE IS A STRUCTURAL EXCLUSION, NOT A PER-HIT EXEMPTION LIST. In
 * markdown, fenced code blocks and TABLE DELIMITER rows legitimately contain
 * runs of dashes. Both are elided before the `--` scan. Table CELL prose is NOT
 * elided: eliding every `|`-prefixed line would silently permit a `--` inside
 * rendered copy, which is the thing being guarded.
 *
 * CONVERGENCE CONTRACT (spec §2.3). Consequence bound: every covered surface is
 * dash-free or exempted BY NAME with a reason; a new dash fails CI naming its
 * file and line; nothing is ever silently rewritten. Threat model: accidental
 * authoring by an ordinary contributor. Adversarial obfuscation — homoglyphs,
 * HTML entities, U+2013 en-dash substitution — is OUT of scope and files to the
 * spec's documented limits. The accept-set is keyed on surface + code point.
 *
 * CI WIRING: a `.test.ts` under `tests/styles/` is matched by
 * `PARALLEL_TEST_GLOBS` (`vitest.projects.ts`), so this runs in the `parallel`
 * project of `unit-suite` on every PR. A `.spec.ts` rename would go dark.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { stripCssComments } from "@/tests/_shared/stripComments";

const ROOT = join(__dirname, "..", "..");

/** U+2014 EM DASH. The one code point this guard is about. */
const EM_DASH = "—";

/**
 * Covered roots. This list GROWS task by task within the branch that ships the
 * guard (catalog + MDX, then `lib/**`, then `components/**` + `app/**`), because
 * a single end-state guard cannot be green between batches.
 *
 * `app/api/**` is excluded WITH ITS REASON: route handlers surface user-visible
 * text exclusively through §12.4 catalog codes (invariant 5), so their literals
 * are internal by contract — and the catalog itself is a covered surface.
 */
// `lib/messages/catalog.ts` is NOT listed separately: it lives under `lib`, so
// naming it too would scan it twice and report every hit in duplicate. The
// catalog's coverage is asserted by a premise below rather than by a redundant
// root entry.
const COVERED_TS_ROOTS: readonly string[] = ["lib", "components", "app"];

/** Markdown/MDX prose roots. */
const COVERED_MDX_ROOTS: readonly string[] = ["app/help"];

/**
 * Reasons-required exemption registry.
 *
 * A denylist of "copy-looking" contexts is exactly the accept-set failure mode
 * this guard exists to avoid, so non-copy literals the scan sweeps in are
 * handled HERE, by name and with a reason, rather than by narrowing the scan.
 *
 * Key: repo-relative path, or a `dir/**` prefix for a wholly-internal tree.
 */
const EXEMPT: Readonly<Record<string, string>> = {
  // ── Developer-gated surfaces: not product copy ──────────────────────────
  "app/admin/dev/page.tsx":
    "the developer-gated /admin/dev fixture page; Doug is not a developer and cannot reach it, so its literals are not product copy",
  "components/admin/telemetry/TelemetryOverviewStrip.tsx":
    "sentinel glyph on the developer-gated telemetry page",
  "lib/dev/**":
    "developer-gated dev tooling; nothing here renders to Doug or to crew (directory-level row is legal for a wholly-internal tree)",

  // ── Generated artifacts: a repair would be undone by the next regen ─────
  "lib/audit/email-boundaries.generated.ts":
    "generated artifact — regenerating would resurrect the dash, so the source of truth is the generator, not this file",

  // ── SQL text: never rendered ────────────────────────────────────────────
  "lib/sync/runScheduledCronSync.ts":
    "SQL template literals and their inline comments; SQL text is sent to Postgres, never to a person",
  "lib/sync/runOnboardingScan.ts": "SQL template literal; never rendered",
  "lib/drive/watch.ts": "SQL template literals; never rendered",
  "lib/onboarding/sessionLifecycle.ts": "SQL template literal; never rendered",
  "lib/notify/deliver.ts":
    "SQL template literal; never rendered (the notify COPY lives in templates/, which is covered)",

  // ── Operator-invisible diagnostics: console/CI only, per invariant 5 ────
  "lib/sync/applyStaged.ts":
    "SQL template literal plus log/throw diagnostics; invariant 5 keeps raw operational text out of the UI, so these surface only in consoles and CI",
  "lib/sync/applyStagedCore.ts": "log/throw diagnostics; surfaced only in consoles and CI",
  "lib/sync/unpublishBinding.ts": "log/throw diagnostic; surfaced only in consoles and CI",
  "lib/sync/phase2.ts": "diagnostic string; surfaced only in consoles and CI",
  "lib/audit/noGlobalCursor.ts": "audit-script diagnostic; CI output, not product copy",
  "components/realtime/ShowRealtimeBridge.tsx":
    "realtime bridge log strings; the component renders null by contract, so these reach a console and never a surface",
  "app/help/_components/RefAnchor.tsx":
    "throw messages for authoring mistakes in MDX call sites; they fail the build, they do not render",
  "lib/driveIdCoverage/introspect.ts": "introspection diagnostic; CI output, not product copy",
  "lib/validation/fixtures.ts": "validation-harness diagnostics; CI output, not product copy",
  "lib/validation/reseedFixtures.ts": "validation-harness diagnostics; CI output, not product copy",

  // ── Developer-facing artifacts that are not UI ──────────────────────────
  "lib/reports/submit.ts":
    "GitHub-issue body — a developer-facing artifact, not a surface Doug or crew reads in the app",

  // ── Metadata consumed by tests and the dev gallery, never rendered ──────
  "lib/visibility/capabilityTransitions.ts":
    "matrix `reason` metadata; read by tests and the dev gallery, never rendered to a user",
  "lib/visibility/transportTransitions.ts":
    "matrix `reason` metadata; read by tests and the dev gallery, never rendered to a user",
  "lib/time/rightNowTransitions.ts":
    "matrix `reason` metadata; read by tests and the dev gallery, never rendered to a user",
  "lib/parser/blocks/crew.ts":
    "parser decision-note registry string; test-consumed provenance, never rendered",
  "lib/parser/blocks/rooms.ts":
    "parser decision-note registry string; test-consumed provenance, never rendered",

  // ── The dash is the VALUE, not prose ────────────────────────────────────
  "lib/visibility/emptyState.ts":
    "the standalone U+2014 sentinel glyph — an empty-value placeholder, not prose; the sentinel-hiding contract treats it as a known sentinel",
  "lib/parser/blocks/ops.ts": "standalone sentinel glyph, not prose",
  "lib/parser/index.ts":
    "a REGEX CHARACTER CLASS matching sheet-authored dashes — a load-bearing pattern literal; repairing it would change what the parser recognizes",
  "lib/specLint/sections.ts":
    "quotes the canonical spec-heading text it lints for; the heading itself lives in docs/**, which is out of the accept-set by name",
};

/** Files whose ENTIRE tree is internal; every literal inside is exempt. */
const exemptPrefixes = () =>
  Object.keys(EXEMPT)
    .filter((k) => k.endsWith("/**"))
    .map((k) => k.slice(0, -3));

/**
 * `app/api/**` is out of the accept-set BY CONTRACT, not by exemption row: route
 * handlers surface user-visible text exclusively through §12.4 catalog codes
 * (invariant 5), so their literals are internal by construction — and the
 * catalog itself is a covered surface, so the copy is still guarded, one layer
 * up. Encoded here rather than as ~N registry rows that would each restate the
 * same reason.
 */
const OUT_OF_SET = (rel: string): boolean => rel.startsWith("app/api/");

function isExempt(rel: string): boolean {
  if (OUT_OF_SET(rel)) return true;
  if (Object.prototype.hasOwnProperty.call(EXEMPT, rel)) return true;
  return exemptPrefixes().some((p) => rel === p || rel.startsWith(`${p}/`));
}

export type Hit = { file: string; line: number; text: string; token: string };

/**
 * Every extension the project actually compiles. `.tsx?` alone silently excluded
 * `.mts`, `.js`, `.jsx`, `.mjs`, and `.cjs` — and this repo sets `allowJs: true`
 * and includes `.mts`, so a new rendered `.jsx` page or a `.mts` notify module
 * was outside the scan while looking covered.
 */
const SOURCE_EXT = /\.(m|c)?[jt]sx?$/;

function lineOf(source: string, pos: number): number {
  return source.slice(0, pos).split("\n").length;
}

/**
 * Executable string literals and rendered JSX text, by NODE KIND.
 *
 * Exported so the premise fixtures below can drive the same function the live
 * scan uses — a premise that exercised a different code path would prove
 * nothing about the guard that actually runs.
 */
/**
 * The ONLY places a bare em-dash glyph may stand as an empty-value sentinel,
 * keyed by FILE and by the EXACT enclosing expression.
 *
 * WHY NOT A SYNTAX RULE, AND WHY NOT A COUNT. Four allowances have been defeated
 * on this branch, each by ordinary composition rather than obfuscation:
 *
 *   v1  `text.trim() === EM_DASH`              `{" — "}` between siblings
 *   v2  + "parent must not build a string"     `const SEP = "—"` in a template;
 *                                              `[…,"—",…].join(" ")`; nested span
 *   v3  "a `??`/`||` fallback, or aria-hidden" `{sep ?? "—"}` between prose;
 *                                              aria-hidden hides from the a11y
 *                                              tree, NOT from sighted readers
 *   v4  a per-file COUNT                       RELOCATION: move the glyph to a
 *                                              visible label, demote a real
 *                                              sentinel to "-", count unchanged
 *
 * So the key is the enclosing expression's own source text, normalized for
 * whitespace. Moving a glyph anywhere else in the same file changes that text
 * and is a hit; the allowance cannot be inherited by new code.
 *
 * Both ratchets below are load-bearing: every registered anchor must still be
 * FOUND (a stale allowance is a standing hole), and a registered file must scan
 * clean (no extra glyph rides along).
 */
const SENTINEL_ANCHORS: Readonly<Record<string, readonly string[]>> = {
  "components/admin/ShowsTable.tsx": ['startText ?? "—"', 'endText ?? "—"'],
  "components/admin/wizard/step3ReviewSections.tsx": [
    'checkIn ?? "—"',
    'checkOut ?? "—"',
    '<span aria-hidden="true" className="px-1.5 font-normal text-text-faint"> — </span>',
  ],
  "components/admin/telemetry/TelemetryOverviewStrip.tsx": ["<span aria-hidden>—</span>"],
};

/** Whitespace-normalized source text, so formatting churn is not a false alarm. */
const anchorKey = (node: ts.Node): string => node.getText().replace(/\s+/g, " ").trim();

function isSentinel(
  rel: string,
  text: string,
  isJsx: boolean,
  node: ts.Node,
  hit: Map<string, number>,
): boolean {
  const bare = isJsx ? text.trim() === EM_DASH : text === EM_DASH;
  if (!bare) return false;
  const anchors = SENTINEL_ANCHORS[rel];
  if (!anchors) return false;
  const parent = node.parent;
  if (!parent) return false;
  const key = anchorKey(parent);
  if (!anchors.includes(key)) return false;
  hit.set(key, (hit.get(key) ?? 0) + 1);
  return true;
}

/** Anchors consumed by the LAST scanTypeScript call, with counts. AST-derived. */
export const lastAnchorUse = new Map<string, number>();

export function scanTypeScript(rel: string, source: string): Hit[] {
  const sf = ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, true);
  const hits: Hit[] = [];
  lastAnchorUse.clear();
  const anchorsHit = lastAnchorUse;
  const record = (node: ts.Node, text: string, isJsx = false) => {
    if (!text.includes(EM_DASH)) return;
    if (isSentinel(rel, text, isJsx, node, anchorsHit)) return;
    hits.push({
      file: rel,
      line: lineOf(source, node.getStart(sf)),
      text: text.trim(),
      token: EM_DASH,
    });
  };
  const walk = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      node.kind === ts.SyntaxKind.TemplateHead ||
      node.kind === ts.SyntaxKind.TemplateMiddle ||
      node.kind === ts.SyntaxKind.TemplateTail
    ) {
      record(node, (node as ts.LiteralLikeNode).text);
    } else if (ts.isJsxText(node)) {
      record(node, node.text, true);
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return hits;
}

/**
 * Markdown prose. Fenced code is elided; so are TABLE DELIMITER rows, which are
 * pipes, dashes, colons and whitespace and nothing else. Table CELL prose stays
 * scanned.
 */
/**
 * ALL non-comment CSS text, not just `content:`.
 *
 * The first version keyed on a line-local `content:` regex and had SIX
 * demonstrated escapes — a value on the next line, `var(--sep)` indirection, a
 * glyph inside what looks like a comment but is a string, `list-style-type`,
 * `quotes` + `open-quote`, and `@counter-style symbols`. Every one renders.
 *
 * Enumerating rendering properties is the same losing game the sentinel rule
 * played four times, so this does not enumerate: comments are stripped (the same
 * comments-are-not-copy rule parsing gives the TypeScript scanner) and ANY
 * remaining em dash is a hit. CSS has no legitimate non-rendered em dash outside
 * a comment, so the conservative direction is also the correct one — and
 * `app/globals.css`'s 57 dashes are all in comments, so the corpus is clean
 * under the strict rule.
 */
export function scanCss(rel: string, source: string): Hit[] {
  // STRING-AWARE comment stripping, via the repo's SINGLE SOURCE
  // (tests/_shared/stripComments). A regex strip removed `/* — */` even when it
  // was the VALUE of `content:` — a rendered string that merely looks like a
  // comment — and my first repair hand-rolled a second lexer, which
  // _metaStripCommentsSingleSource correctly rejected. The shared one also
  // handles CSS escape sequences in code state, which mine did not.
  const stripped = stripCssComments(source);
  const hits: Hit[] = [];
  stripped.split("\n").forEach((line, i) => {
    if (line.includes(EM_DASH)) {
      hits.push({ file: rel, line: i + 1, text: line.trim(), token: EM_DASH });
    }
  });
  return hits;
}

/** Cells in a pipe row, GFM-style: split on unescaped `|`, drop the outer empties. */
function splitCells(line: string): string[] {
  // A pipe is escaped only by an ODD run of backslashes: `\|` escapes, `\\|`
  // does not. A `(?<!\\)` lookbehind got even runs wrong, so 2, 4 and 6
  // backslashes each mis-counted the row and let a rendered `--` be elided.
  const trimmed = line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|\s*$/, "");
  const cells: string[] = [];
  let cur = "";
  let slashes = 0;
  for (const ch of trimmed) {
    if (ch === "|" && slashes % 2 === 0) {
      cells.push(cur);
      cur = "";
      slashes = 0;
      continue;
    }
    slashes = ch === "\\" ? slashes + 1 : 0;
    cur += ch;
  }
  cells.push(cur);
  return cells;
}

function cellCount(line: string): number {
  return splitCells(line).length;
}

export function scanMarkdown(rel: string, source: string): Hit[] {
  const hits: Hit[] = [];
  let fenceChar: string | null = null;
  let fenceLen = 0;
  let headerCells = 0;
  // A delimiter row is the SECOND row of a table and nothing else. Matching it
  // by SHAPE alone elided `| -- |` sitting in a DATA row, which renders as a
  // visible cell — probed against the project's own @mdx-js/mdx + remark-gfm
  // pipeline, which compiles it to <td>{"--"}</td>. Tracking position is what
  // makes the elision structural rather than a shape that real content can wear.
  let tableRow = 0;
  source.split("\n").forEach((raw, i) => {
    // GFM fences: a closer must use the SAME character and be at least as long
    // as the opener, and a backtick opener's info string may not contain a
    // backtick. A single boolean toggled by "starts with ``` or ~~~" was
    // defeated three ways — an invalid backtick info string, a ~~~ line inside a
    // backtick fence, and a ``` line inside a storage fence — each leaving
    // later prose unscanned.
    // Up to three SPACES, per GFM. `\s{0,3}` also matched tabs, and a
    // tab-indented ``` is not a fence opener — which silently un-scanned every
    // line after it. Elision is strict on purpose: anything this does not
    // positively recognize gets SCANNED, so ambiguity produces a surfaced hit
    // rather than a silent pass.
    const fence = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(raw);
    if (fence) {
      const marks = fence[1]!;
      const info = fence[2] ?? "";
      const char = marks[0]!;
      if (!fenceChar) {
        // Opening. A backtick opener with a backtick in its info string is not
        // a fence at all.
        if (char === "`" && info.includes("`")) {
          // not a fence; fall through and scan this line as prose
        } else {
          fenceChar = char;
          fenceLen = marks.length;
          tableRow = 0;
          return;
        }
      } else if (char === fenceChar && marks.length >= fenceLen && info.trim() === "") {
        fenceChar = null;
        fenceLen = 0;
        tableRow = 0;
        return;
      } else {
        // A different fence char, a short run, or an info string: still inside.
        return;
      }
    }
    if (fenceChar) return;
    const isPipeRow = /^\s*\|/.test(raw);
    if (isPipeRow) {
      tableRow += 1;
      if (tableRow === 1) headerCells = cellCount(raw);
    } else {
      tableRow = 0;
      headerCells = 0;
    }
    // GFM recognizes a table only when the delimiter row has EXACTLY as many
    // cells as the header. When they differ the whole block renders as a
    // PARAGRAPH — probed against the project's @mdx-js/mdx + remark-gfm
    // pipeline — so eliding on shape alone let `| A | B |` / `| -- |` through as
    // visible text. Column parity is the rule, not a heuristic.
    // Every delimiter CELL must independently match GFM's grammar
    // (`:?-+:?`). Shape-matching the whole line accepted `| -- | |` and
    // `| -- | : |`, which GFM rejects — so the block renders as a paragraph and
    // its `--` is visible text.
    const isTableDelimiter =
      tableRow === 2 &&
      headerCells > 0 &&
      cellCount(raw) === headerCells &&
      splitCells(raw).every((c) => /^:?-+:?$/.test(c.trim()));
    if (raw.includes(EM_DASH)) {
      hits.push({ file: rel, line: i + 1, text: raw.trim(), token: EM_DASH });
    }
    if (!isTableDelimiter && raw.includes("--")) {
      hits.push({ file: rel, line: i + 1, text: raw.trim(), token: "--" });
    }
  });
  return hits;
}

function walkFiles(dir: string, match: (f: string) => boolean, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walkFiles(full, match, out);
    else if (match(full)) out.push(full);
  }
  return out;
}

function liveHits(): Hit[] {
  const hits: Hit[] = [];

  for (const root of COVERED_TS_ROOTS) {
    const abs = join(ROOT, root);
    let files: string[];
    try {
      files = statSync(abs).isDirectory()
        ? walkFiles(abs, (f) => SOURCE_EXT.test(f) && !/\.d\.ts$/.test(f))
        : [abs];
    } catch {
      continue;
    }
    for (const f of files) {
      const rel = relative(ROOT, f);
      if (isExempt(rel)) continue;
      hits.push(...scanTypeScript(rel, readFileSync(f, "utf8")));
    }
  }

  for (const root of COVERED_MDX_ROOTS) {
    for (const f of walkFiles(join(ROOT, root), (x) => /\.mdx?$/.test(x))) {
      const rel = relative(ROOT, f);
      if (isExempt(rel)) continue;
      hits.push(...scanMarkdown(rel, readFileSync(f, "utf8")));
    }
  }

  // CSS `content:` renders text, so it is a covered surface too.
  for (const root of COVERED_TS_ROOTS) {
    for (const f of walkFiles(join(ROOT, root), (x) => /\.css$/.test(x))) {
      const rel = relative(ROOT, f);
      if (isExempt(rel) || OUT_OF_SET(rel)) continue;
      hits.push(...scanCss(rel, readFileSync(f, "utf8")));
    }
  }

  return hits;
}

describe("em-dash copy guard — DESIGN.md §9", () => {
  it("no covered surface carries an em dash (or, in MDX prose, a `--`)", () => {
    const hits = liveHits();
    const detail = hits
      .map((h) => `  ${h.file}:${h.line}  [${h.token}]  ${h.text.slice(0, 110)}`)
      .join("\n");
    expect(
      hits,
      hits.length === 0
        ? ""
        : `${hits.length} em-dash/-- hit(s) in covered copy. Repair per DESIGN.md §9 ` +
            `(commas, colons, semicolons, periods, parentheses), or add a reasons-required ` +
            `EXEMPT row naming the file:\n${detail}`,
    ).toEqual([]);
  });

  // ── PREMISES ────────────────────────────────────────────────────────────
  // Each covered surface gets a planted dash proving the scanner can SEE that
  // surface. A guard whose scan cannot reach a root passes unconditionally and
  // would pass forever; these turn that silence into a loud failure. They run
  // unconditionally and survive the corpus repairs, so a later root or
  // node-kind regression cannot leave the guard silently green.

  it("PREMISE: the TypeScript scanner sees every covered node kind", () => {
    const planted = [
      `const a = "plain string — dash";`,
      "const b = `no-substitution — dash`;",
      "const c = `head — ${x} tail`;",
      "const d = `${x} middle — mid ${y}`;",
      "const e = `${x} tail — end`;",
      `const f = <p>jsx text — dash</p>;`,
    ];
    for (const src of planted) {
      expect(
        scanTypeScript("premise.tsx", src),
        `the scanner must see a planted dash in: ${src}`,
      ).not.toHaveLength(0);
    }
  });

  it("PREMISE: TemplateMiddle is seen (isStringLiteralLike would miss it)", () => {
    // The escaping class this guard was widened for. Both known notify copy
    // hits are TemplateMiddle fragments; a scanner built on `isStringLiteralLike`
    // returns zero here while live copy carries a dash.
    const src = "const s = `${a} and ${b} more — open the dashboard ${c}`;";
    const hits = scanTypeScript("premise.ts", src);
    expect(hits, "TemplateMiddle must be scanned").not.toHaveLength(0);
  });

  it("PREMISE: the markdown scanner sees prose, and elides only what it claims", () => {
    const planted = ["Prose with an em — dash.", "", "| Cell prose -- with dashes | x |"];
    expect(
      scanMarkdown("premise.mdx", planted.join("\n")),
      "prose dashes must be seen",
    ).toHaveLength(2);

    // Fenced code is elided.
    const fenced = ["```", "const x = 1; // — and --", "```"].join("\n");
    expect(scanMarkdown("premise.mdx", fenced), "fenced code is elided").toEqual([]);

    // A delimiter row is elided only in its real POSITION: row 2 of a table.
    const realTable = ["| Status | Note |", "| --- | :--: |"].join("\n");
    expect(scanMarkdown("premise.mdx", realTable), "a real delimiter row is elided").toEqual([]);

    // GFM recognizes a table only when header and delimiter have the SAME cell
    // count. When they differ the whole block renders as a PARAGRAPH, so the
    // "delimiter" is visible text — the R2 escaping class. Each of these must be
    // a hit.
    for (const [name, src] of [
      ["header 2 / delim 1", "| A | B |\n| -- |"],
      ["header 1 / delim 2", "| A |\n| -- | -- |"],
      ["header 3 / delim 2", "| A | B | C |\n| -- | -- |"],
    ] as const) {
      expect(
        scanMarkdown("premise.mdx", src),
        `column mismatch renders as a paragraph and must be caught: ${name}`,
      ).not.toHaveLength(0);
    }

    // The same SHAPE in a DATA row is rendered content and must be a hit. This
    // is the escaping class the cross-model review found: `| -- |` on row 3
    // compiles to <td>{"--"}</td> under the project's remark-gfm pipeline.
    const dataRow = ["| Status |", "| --- |", "| -- |"].join("\n");
    expect(
      scanMarkdown("premise.mdx", dataRow),
      "a `--` data cell is NOT a delimiter and must be caught",
    ).not.toHaveLength(0);
  });

  it("PREMISE: the live scan actually reaches its declared roots", () => {
    // A root that resolves to zero files is a guard scanning nothing. This
    // fails loudly if a root is renamed or a glob stops matching.
    for (const root of COVERED_MDX_ROOTS) {
      const files = walkFiles(join(ROOT, root), (x) => /\.mdx?$/.test(x));
      expect(files.length, `covered MDX root resolves to no files: ${root}`).toBeGreaterThan(0);
    }
    for (const root of COVERED_TS_ROOTS) {
      expect(
        () => statSync(join(ROOT, root)),
        `covered TS root does not exist: ${root}`,
      ).not.toThrow();
    }
  });

  it("PREMISE: the lib root is scanned, including template fragments", () => {
    // A PERMANENT fixture, not a corpus observation. The corpus repairs make
    // `lib/**` clean, so nothing in the live tree would notice if this root
    // silently stopped being scanned. Planting the shapes here keeps the root's
    // coverage provable after the corpus goes quiet.
    const planted = [
      `export const copy = "lib plain — dash";`,
      "export const frag = `${a} lib middle — dash ${b}`;",
    ];
    for (const src of planted) {
      expect(
        scanTypeScript("lib/premise.ts", src),
        `the lib root's scanner must see: ${src}`,
      ).not.toHaveLength(0);
    }
    // And the root is actually in the covered list, not merely scannable.
    expect(COVERED_TS_ROOTS, "lib must be a covered root").toContain("lib");
  });

  it("PREMISE: the components/app roots are scanned, incl. JSX shapes", () => {
    // Permanent, for the same reason as the lib premise: the corpus repairs
    // make these roots clean, so nothing live would notice if a root stopped
    // being scanned. JsxText and a JSX attribute string are the shapes unique
    // to these roots.
    const planted = [
      `export const C = () => <p>jsx child — dash</p>;`,
      `export const D = () => <img alt="attr copy — dash" />;`,
      "export const E = `component frag ${x} — dash ${y}`;",
    ];
    for (const src of planted) {
      expect(
        scanTypeScript("components/premise.tsx", src),
        `the component/app scanner must see: ${src}`,
      ).not.toHaveLength(0);
    }
    expect(COVERED_TS_ROOTS, "components must be covered").toContain("components");
    expect(COVERED_TS_ROOTS, "app must be covered").toContain("app");
  });

  it("PREMISE: the three audit bypasses stay closed", () => {
    // Regression fixtures for a REAL bypass. The first sentinel rule tested
    // `text.trim() === EM_DASH` and the impeccable audit defeated it three
    // ways, each idiomatic authoring rather than obfuscation. Each renders a
    // visible "Notifications — …" and each must be a hit.
    const bypasses = [
      `const C = () => <span>Notifications{" — "}unseen</span>;`,
      'const s = "Notifications " + "\u2014" + ` ${count} unseen`;',
      'const s = `Notifications ${"\u2014"} ${count} unseen`;',
    ];
    for (const src of bypasses) {
      expect(
        scanTypeScript("components/bypass.tsx", src),
        `this bypass must be caught: ${src}`,
      ).not.toHaveLength(0);
    }
  });

  it("PREMISE: the sentinel allowance is keyed on the EXACT enclosing expression", () => {
    // An unregistered file gets no allowance, whatever shape it uses.
    for (const src of [
      `const C = () => <p>N {separator ?? "\u2014"} u</p>;`,
      `const C = () => <p>N {separator || "\u2014"} u</p>;`,
      `const C = () => <p>N <span aria-hidden="true">\u2014</span> u</p>;`,
      `const SEP = "\u2014";`,
    ]) {
      expect(
        scanTypeScript("components/unregistered.tsx", src),
        `unregistered files get no allowance: ${src}`,
      ).not.toHaveLength(0);
    }

    // RELOCATION, the v4 bypass: inside a REGISTERED file, moving the glyph to a
    // different expression must be a hit even though the file's glyph count is
    // unchanged. A registered anchor is the expression, not a budget.
    const reg = "components/admin/ShowsTable.tsx";
    expect(
      scanTypeScript(reg, `const a = startText ?? "\u2014";`),
      "the registered anchor is allowed",
    ).toHaveLength(0);
    expect(
      scanTypeScript(reg, `const label = heldText ?? "\u2014";`),
      "a DIFFERENT expression in a registered file is NOT covered by its allowance",
    ).not.toHaveLength(0);
  });

  it("PREMISE: every registered sentinel anchor is still found, and its file scans clean", () => {
    // Two ratchets. A registered anchor that no longer exists is a standing
    // allowance nobody is watching; a registered file that scans dirty means an
    // extra glyph rode in beside the sanctioned ones.
    for (const [rel, anchors] of Object.entries(SENTINEL_ANCHORS)) {
      const abs = join(ROOT, rel);
      expect(() => statSync(abs), `registered sentinel site is gone: ${rel}`).not.toThrow();
      const src = readFileSync(abs, "utf8");
      expect(scanTypeScript(rel, src), `${rel} scans dirty beside its anchors`).toEqual([]);
      // AST CONSUMPTION, not raw `includes`. A source search was spoofable:
      // demote the real sentinel to "-" and add a COMMENT containing the anchor
      // text, and the row still looked live while the allowance sat unused.
      // lastAnchorUse is populated by the scanner itself, so only a literal the
      // AST actually reached can satisfy it.
      const used = new Map(lastAnchorUse);
      for (const a of anchors) {
        expect(used.get(a) ?? 0, `registered anchor is unused in ${rel}: ${a}`).toBe(1);
      }
      expect(
        [...used.keys()].filter((k) => !anchors.includes(k)),
        `${rel} consumed an anchor that is not registered`,
      ).toEqual([]);
    }
  });

  it("PREMISE: every source extension the project compiles is scanned", () => {
    // `.tsx?` alone silently excluded .mts/.js/.jsx/.mjs/.cjs while looking
    // covered, and this repo sets allowJs and includes .mts.
    for (const f of [
      "lib/notify/x.mts",
      "components/X.jsx",
      "app/x/page.jsx",
      "lib/x.mjs",
      "lib/x.cjs",
      "lib/x.js",
    ]) {
      expect(SOURCE_EXT.test(f), `covered extension not scanned: ${f}`).toBe(true);
    }
    expect(SOURCE_EXT.test("lib/x.d.ts"), ".d.ts is excluded elsewhere but still matches").toBe(
      true,
    );
  });

  it("PREMISE: the CSS scan is total, not a list of rendering properties", () => {
    // Six forms that a `content:`-local regex missed; every one renders.
    for (const [name, css] of [
      ["value on the next line", 'body::after {\n  content:\n    "\u2014";\n}'],
      ["var() indirection", '.a { --sep: "\u2014"; content: var(--sep); }'],
      ["comment-looking string", '.a { content: "/* \u2014 */"; }'],
      ["list-style-type", '.a { list-style-type: "\u2014"; }'],
      ["quotes + open-quote", '.a { quotes: "\u2014" "\u2014"; content: open-quote; }'],
      ["@counter-style symbols", '@counter-style x { symbols: "\u2014"; }'],
    ] as const) {
      expect(scanCss("app/x.css", css), `CSS escape must be caught: ${name}`).not.toHaveLength(0);
    }
  });

  it("PREMISE: markdown elision is STRICT — ambiguity scans rather than passes", () => {
    // GFM allows up to three SPACES before a fence. A tab is not a space, so a
    // tab-indented ``` is not an opener; treating it as one un-scanned every
    // following line.
    for (const prefix of ["\t", " \t", "  \t"]) {
      expect(
        scanMarkdown("x.mdx", `${prefix}~~~\nVisible -- prose\n`),
        `a tab-indented fence marker is not an opener: ${JSON.stringify(prefix)}`,
      ).not.toHaveLength(0);
    }

    // Even backslash runs do NOT escape the pipe, so the columns really match
    // and these are real tables... but odd runs DO escape, so the columns do not.
    expect(
      scanMarkdown("x.mdx", "| A \\\\| B |\n| -- | -- |"),
      "an EVEN backslash run leaves the pipe active",
    ).toHaveLength(0);

    // Every delimiter CELL must match GFM's grammar; these do not, so the block
    // is a paragraph and its `--` is visible.
    for (const src of ["| A | B |\n| -- | |", "| A | B |\n| -- | : |", "| A | B |\n| | -- |"]) {
      expect(
        scanMarkdown("x.mdx", src),
        `an invalid delimiter cell means this is prose: ${src}`,
      ).not.toHaveLength(0);
    }
  });

  it("PREMISE: CSS content: is scanned, and CSS comments are not", () => {
    expect(
      scanCss("app/x.css", `body::after { content: "\u2014"; }`),
      "a rendered content: glyph must be caught",
    ).not.toHaveLength(0);
    expect(
      scanCss("app/x.css", `/* a comment \u2014 with a dash */\n.a { color: red; }`),
      "CSS comments are not copy",
    ).toEqual([]);
  });

  it("PREMISE: markdown fences and cells follow GFM, not a shape guess", () => {
    // Escaped pipe: GFM sees ONE header cell, so the two-cell delimiter does not
    // form a table and the block renders as a paragraph.
    expect(
      scanMarkdown("x.mdx", "| A \\| B |\n| -- | -- |"),
      "an escaped pipe means the columns do not match, so this is prose",
    ).not.toHaveLength(0);

    // Fence forms that a single boolean toggle got wrong.
    for (const [name, src] of [
      ["invalid backtick info string", "```js`x\nVisible -- prose\n"],
      ["~~~ inside a backtick fence", "```\n~~~\n```\nVisible -- prose\n"],
      ["``` inside a ```` fence", "````\n```\n````\nVisible -- prose\n"],
    ] as const) {
      expect(
        scanMarkdown("x.mdx", src),
        `prose after this fence form must still be scanned: ${name}`,
      ).not.toHaveLength(0);
    }
  });

  it("PREMISE: the round-1 review's three bypasses stay closed", () => {
    // Each is idiomatic composition that rendered a visible em dash while the
    // v2 rule stayed green. Kept as permanent regressions.
    const bypasses = [
      'const SEP = "\u2014";\nconst s = `Notifications ${SEP} ${count} unseen`;',
      'const s = ["Notifications", "\u2014", "unseen"].join(" ");',
      `const C = () => <span>Notifications <span>\u2014</span> unseen</span>;`,
    ];
    for (const src of bypasses) {
      expect(
        scanTypeScript("components/bypass2.tsx", src),
        `this bypass must be caught: ${src}`,
      ).not.toHaveLength(0);
    }
  });

  it("PREMISE: app/api is out of the set, and the rest of app is not", () => {
    expect(isExempt("app/api/report/route.ts"), "app/api is out of the accept-set").toBe(true);
    expect(isExempt("app/admin/settings/admins/error.tsx"), "the rest of app IS covered").toBe(
      false,
    );
  });

  it("every EXEMPT row still names something that exists", () => {
    // Dead-row ratchet: an exemption that outlived its file is a standing hole
    // nobody is watching.
    const dead = Object.keys(EXEMPT).filter((k) => {
      const p = k.endsWith("/**") ? k.slice(0, -3) : k;
      try {
        statSync(join(ROOT, p));
        return false;
      } catch {
        return true;
      }
    });
    expect(dead, `these EXEMPT rows name paths that no longer exist: ${dead.join(", ")}`).toEqual(
      [],
    );
  });
});
