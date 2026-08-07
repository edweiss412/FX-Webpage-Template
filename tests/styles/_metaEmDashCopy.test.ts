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
 * A sentinel is the glyph standing in for a missing value ({checkIn ?? "—"}) or
 * a decorative aria-hidden separator. The spec exempts that class by name at
 * `lib/visibility/emptyState.ts`; encoding it STRUCTURALLY keeps the exemption
 * narrow, because a file may hold both a sentinel and real copy and a per-file
 * row would silently exempt the copy too.
 *
 * TWO CONDITIONS, both learned from a real bypass. The first version tested
 * `text.trim() === EM_DASH`, and the impeccable audit defeated it three ways —
 * all of them idiomatic authoring, not obfuscation:
 *
 *   <span>Notifications{" — "}unseen</span>      renders "Notifications — unseen"
 *   "Notifications " + "—" + ` ${count} unseen`  renders "Notifications — 3 unseen"
 *   `Notifications ${"—"} ${count} unseen`       renders "Notifications — 3 unseen"
 *
 * So:
 *   1. WHITESPACE IS NOT TRIMMED for string literals. A padded `" — "` is a
 *      SEPARATOR glued between text; a bare `"—"` is a value. JsxText is still
 *      trimmed, because there the surrounding whitespace is JSX formatting the
 *      renderer collapses, not authored padding.
 *   2. A literal whose parent BUILDS A STRING — a `+` concatenation, or a span
 *      of a template expression — is never a sentinel, whatever it contains. It
 *      is a fragment of a larger sentence by construction.
 */
function isSentinel(node: ts.Node, text: string, isJsx: boolean): boolean {
  const bare = isJsx ? text.trim() === EM_DASH : text === EM_DASH;
  if (!bare) return false;
  const parent = node.parent;
  if (!parent) return true;
  // Concatenated into a larger string.
  if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return false;
  }
  // Interpolated into a template: `… ${"—"} …`.
  if (ts.isTemplateSpan(parent) || ts.isTemplateExpression(parent)) return false;
  // A JSX child sitting beside other children is a separator, not a lone value.
  if (ts.isJsxExpression(parent) && parent.parent && "children" in parent.parent) {
    const siblings = (parent.parent as unknown as { children: readonly ts.Node[] }).children;
    const meaningful = siblings.filter(
      (c) => !(ts.isJsxText(c) && c.text.trim().length === 0) && c !== parent,
    );
    if (meaningful.length > 0) return false;
  }
  return true;
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
  source.split("\n").forEach((raw, i) => {
    if (/^\s*(```|~~~)/.test(raw)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    const isTableDelimiter = /^\s*\|[\s\-:|]*\|?\s*$/.test(raw);
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

    // Table DELIMITER rows are elided; table CELL prose is not (asserted above).
    const delimiter = ["| --- | :--: |", "|---|---|"].join("\n");
    expect(scanMarkdown("premise.mdx", delimiter), "table delimiter rows are elided").toEqual([]);
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

  it("PREMISE: a lone glyph is a sentinel, but glyph-plus-prose is not", () => {
    // The sentinel carve-out must not become a way to smuggle prose past the
    // guard. A literal that IS the glyph is skipped; the moment any prose joins
    // it, it is copy again.
    expect(scanTypeScript("x.tsx", `const a = "—";`), "a lone glyph is a sentinel").toHaveLength(0);
    expect(
      scanTypeScript("x.tsx", `const a = "— needs review";`),
      "glyph plus prose is copy, not a sentinel",
    ).not.toHaveLength(0);
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
