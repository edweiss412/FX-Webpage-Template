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
const COVERED_TS_ROOTS: readonly string[] = ["lib/messages/catalog.ts", "lib"];

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

function isExempt(rel: string): boolean {
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
export function scanTypeScript(rel: string, source: string): Hit[] {
  const sf = ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, true);
  const hits: Hit[] = [];
  const record = (node: ts.Node, text: string) => {
    if (!text.includes(EM_DASH)) return;
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
      record(node, node.text);
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
  it("no covered surface carries an em dash or a `--` in user-visible copy", () => {
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
