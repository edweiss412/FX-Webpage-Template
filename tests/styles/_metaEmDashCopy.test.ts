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
 * Is this literal an empty-value SENTINEL rather than prose?
 *
 * NARROW BY ENUMERATION, not by inference. Two earlier versions tried to infer
 * "renders alone" from syntax and were both defeated, because that question is
 * not decidable from a literal's neighbourhood:
 *
 *   v1 `text.trim() === EM_DASH`            beaten by `{" — "}` between siblings
 *   v2 v1 + "parent must not build a string" beaten by a named constant
 *                                            (`const SEP = "—"` used in a
 *                                            template), by `[…,"—",…].join(" ")`,
 *                                            and by a nested <span>—</span>
 *
 * Every one of those is idiomatic composition, i.e. inside the declared threat
 * model. So the rule now recognizes only the two shapes the corpus actually
 * uses for a missing value, and everything else is copy:
 *
 *   1. the RIGHT operand of a `??` / `||` fallback — `{checkIn ?? "—"}`
 *      (4 sites: ShowsTable start/end, step3 checkIn/checkOut)
 *   2. JsxText inside an element carrying `aria-hidden` — a decorative glyph
 *      (2 sites: step3 separator, TelemetryOverviewStrip)
 *
 * A new sentinel shape must be added here deliberately, which is the point: an
 * enumerated allowance cannot be widened by accident, and the v1/v2 bypasses all
 * fail closed under it.
 */
function isSentinel(node: ts.Node, text: string, isJsx: boolean): boolean {
  const bare = isJsx ? text.trim() === EM_DASH : text === EM_DASH;
  if (!bare) return false;
  const parent = node.parent;
  if (!parent) return false;

  if (isJsx) {
    // Shape 2: decorative glyph, hidden from assistive tech.
    const el = ts.isJsxElement(parent) ? parent.openingElement : undefined;
    if (!el) return false;
    return el.attributes.properties.some(
      (a) => ts.isJsxAttribute(a) && a.name.getText() === "aria-hidden",
    );
  }

  // Shape 1: the fallback side of a nullish/or default.
  if (!ts.isBinaryExpression(parent)) return false;
  const op = parent.operatorToken.kind;
  const isFallback = op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken;
  return isFallback && parent.right === node;
}

export function scanTypeScript(rel: string, source: string): Hit[] {
  const sf = ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, true);
  const hits: Hit[] = [];
  const record = (node: ts.Node, text: string, isJsx = false) => {
    if (!text.includes(EM_DASH)) return;
    if (isSentinel(node, text, isJsx)) return;
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
export function scanMarkdown(rel: string, source: string): Hit[] {
  const hits: Hit[] = [];
  let fenced = false;
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
    tableRow = isPipeRow ? tableRow + 1 : 0;
    const isTableDelimiter = tableRow === 2 && /^\s*\|[\s\-:|]*\|?\s*$/.test(raw);
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

  it("PREMISE: real sentinels are still exempt", () => {
    // The other half of the same boundary: tightening the rule must not start
    // flagging the empty-value placeholders it exists to allow.
    const sentinels = [
      `const C = () => <p>{checkIn ?? "\u2014"}</p>;`,
      `const C = () => <span aria-hidden="true">\n  \u2014\n</span>;`,
    ];
    for (const src of sentinels) {
      expect(
        scanTypeScript("components/sentinel.tsx", src),
        `this sentinel must stay exempt: ${src}`,
      ).toHaveLength(0);
    }
  });

  it("PREMISE: the sentinel allowance is exactly two enumerated shapes", () => {
    // EXEMPT: the two shapes the corpus actually uses for a missing value.
    expect(
      scanTypeScript("x.tsx", `const C = () => <p>{checkIn ?? "\u2014"}</p>;`),
      "a ?? fallback glyph is a sentinel",
    ).toHaveLength(0);
    expect(
      scanTypeScript("x.tsx", `const C = () => <span aria-hidden="true">\u2014</span>;`),
      "an aria-hidden glyph is a sentinel",
    ).toHaveLength(0);

    // NOT EXEMPT: anything else, including a bare module-level glyph constant.
    // The earlier rule allowed this, and the review used exactly that to smuggle
    // a separator into a template.
    expect(
      scanTypeScript("x.tsx", `const SEP = "\u2014";`),
      "a bare glyph constant is NOT a sentinel — it can be composed into copy",
    ).not.toHaveLength(0);
    expect(
      scanTypeScript("x.tsx", `const a = "\u2014 needs review";`),
      "glyph plus prose is copy",
    ).not.toHaveLength(0);
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
