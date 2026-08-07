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
 * The ONLY places a bare em-dash glyph is allowed to stand as an empty-value
 * sentinel, keyed by FILE with an exact count.
 *
 * WHY A SITE LIST AND NOT A SYNTAX RULE. Three successive syntax rules were
 * defeated, each by ordinary composition rather than obfuscation:
 *
 *   v1  `text.trim() === EM_DASH`                 `{" — "}` between siblings
 *   v2  v1 + "parent must not build a string"     `const SEP = "—"` in a template;
 *                                                 `[…,"—",…].join(" ")`;
 *                                                 a nested `<span>—</span>`
 *   v3  "a `??`/`||` fallback, or aria-hidden"    `{separator ?? "—"}` between
 *                                                 prose; `aria-hidden` hides from
 *                                                 the a11y tree, NOT from sighted
 *                                                 readers
 *
 * The common defect is that "does this render alone?" is not decidable from a
 * literal's syntax, so every shape-based allowance is a shape real copy can wear.
 * Six sites use a sentinel; enumerating them costs six rows and cannot be widened
 * by writing ordinary code. A new sentinel needs a deliberate row here.
 *
 * The count is part of the key: adding a SECOND glyph to a file registered for
 * one fails loudly rather than inheriting its allowance.
 *
 * RESIDUAL LIMIT, stated rather than hidden: within a registered file, the count
 * does not say WHICH literal, so swapping a registered sentinel for a separator
 * in that same file would pass. That is four files and six literals of exposure,
 * against "every `??` fallback in every covered file" before — and each of those
 * files is copy-reviewed under the invariant-8 gate.
 */
const SENTINEL_SITES: Readonly<Record<string, number>> = {
  "components/admin/ShowsTable.tsx": 2, // {startText ?? "—"}, {endText ?? "—"}
  "components/admin/wizard/step3ReviewSections.tsx": 3, // {checkIn}, {checkOut}, aria-hidden separator
  "components/admin/telemetry/TelemetryOverviewStrip.tsx": 1, // <span aria-hidden>—</span>
};

/** Per-file tally of bare glyphs seen, so the registered count is exact. */
function isSentinel(rel: string, text: string, isJsx: boolean, seen: Map<string, number>): boolean {
  const bare = isJsx ? text.trim() === EM_DASH : text === EM_DASH;
  if (!bare) return false;
  const allowed = SENTINEL_SITES[rel];
  if (allowed === undefined) return false;
  const n = (seen.get(rel) ?? 0) + 1;
  seen.set(rel, n);
  return n <= allowed;
}

export function scanTypeScript(rel: string, source: string): Hit[] {
  const sf = ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, true);
  const hits: Hit[] = [];
  const seen = new Map<string, number>();
  const record = (node: ts.Node, text: string, isJsx = false) => {
    if (!text.includes(EM_DASH)) return;
    if (isSentinel(rel, text, isJsx, seen)) return;
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
/** Cells in a pipe row, GFM-style: split on unescaped `|`, drop the outer empties. */
function cellCount(line: string): number {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").length;
}

export function scanMarkdown(rel: string, source: string): Hit[] {
  const hits: Hit[] = [];
  let fenced = false;
  let headerCells = 0;
  // A delimiter row is the SECOND row of a table and nothing else. Matching it
  // by SHAPE alone elided `| -- |` sitting in a DATA row, which renders as a
  // visible cell — probed against the project's own @mdx-js/mdx + remark-gfm
  // pipeline, which compiles it to <td>{"--"}</td>. Tracking position is what
  // makes the elision structural rather than a shape that real content can wear.
  let tableRow = 0;
  source.split("\n").forEach((raw, i) => {
    if (/^\s*(```|~~~)/.test(raw)) {
      fenced = !fenced;
      tableRow = 0;
      return;
    }
    if (fenced) return;
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
    const isTableDelimiter =
      tableRow === 2 &&
      /^\s*\|[\s\-:|]*\|?\s*$/.test(raw) &&
      cellCount(raw) === headerCells &&
      headerCells > 0;
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
        ? walkFiles(abs, (f) => /\.tsx?$/.test(f) && !/\.d\.ts$/.test(f))
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

  it("PREMISE: the sentinel allowance is keyed on SITE, not on syntax", () => {
    // An UNREGISTERED file gets no allowance, whatever shape it uses. These are
    // exactly the R2 bypasses; every one renders a visible em dash.
    const bypasses = [
      `const C = () => <p>Notifications {separator ?? "\u2014"} unseen</p>;`,
      `const C = () => <p>Notifications {separator || "\u2014"} unseen</p>;`,
      `const C = () => <p>Notifications <span aria-hidden="true">\u2014</span> unseen</p>;`,
      `const C = () => <span aria-hidden="true"><b>N</b>\u2014<b>u</b></span>;`,
      `const SEP = "\u2014";`,
    ];
    for (const src of bypasses) {
      expect(
        scanTypeScript("components/unregistered.tsx", src),
        `an unregistered file gets no sentinel allowance: ${src}`,
      ).not.toHaveLength(0);
    }

    // A REGISTERED file gets exactly its registered count and no more. The count
    // is part of the key so a new glyph cannot inherit the allowance.
    const reg = "components/admin/telemetry/TelemetryOverviewStrip.tsx";
    expect(SENTINEL_SITES[reg], "fixture assumes this file allows 1").toBe(1);
    expect(
      scanTypeScript(reg, `const C = () => <span aria-hidden>\u2014</span>;`),
      "the registered sentinel is allowed",
    ).toHaveLength(0);
    expect(
      scanTypeScript(
        reg,
        `const C = () => <><span aria-hidden>\u2014</span><span aria-hidden>\u2014</span></>;`,
      ),
      "a SECOND glyph exceeds the registered count and is a hit",
    ).not.toHaveLength(0);
  });

  it("PREMISE: every registered sentinel site is real and exactly counted", () => {
    // Stale-row ratchet on the site list. A registered file that no longer holds
    // its declared number of sentinels is a standing allowance nobody watches;
    // scanning it clean is only possible when the real count matches.
    for (const [rel, n] of Object.entries(SENTINEL_SITES)) {
      const abs = join(ROOT, rel);
      expect(() => statSync(abs), `registered sentinel site is gone: ${rel}`).not.toThrow();
      expect(
        scanTypeScript(rel, readFileSync(abs, "utf8")),
        `${rel} is registered for ${n} sentinel(s) but scans dirty`,
      ).toEqual([]);
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
