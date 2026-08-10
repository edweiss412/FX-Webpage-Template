/**
 * Structural meta-test: UI-label crosswalk between help MDX and shipped source.
 *
 * Walks every `.mdx` file under `app/help/**` (plus `app/help/errors/page.tsx`),
 * extracts candidate UI labels from bolded strings (`**Label**`) and backticked
 * spans (`` `Label` ``), filters to PROBABLE UI-control labels, then asserts
 * each label either:
 *   (a) appears in production source code (`app/` excluding `app/help/`,
 *       `components/`); OR
 *   (b) is explicitly exempted in `_uiLabelExceptions.ts` with a DEFERRED.md
 *       `deferredId` and rationale.
 *
 * Catches the M11 Phase E spec-vs-shipped drift class (D1 sharing-link
 * controls, D2 wizard step labels, D3 dashboard row actions, D4 per-show
 * sub-section headings) at meta-level so future drift surfaces as a clean
 * test failure with file:line context, not as a silent docs/code mismatch.
 *
 * See AGENTS.md §1.7 (docs are spec-canonical) and the M11 Phase E plan.
 */

import { describe, it, expect } from "vitest";
import { renderedTextOf } from "./_renderedTextHaystack";
import { stripCommentsForFile } from "../_shared/stripComments";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { DECLARED_UI_LABELS, UI_LABEL_EXCEPTIONS } from "./_uiLabelExceptions";
import { INDIRECT_COPY_SOURCES } from "./_uiLabelIndirectCopySources";
import { THIRD_PARTY_UI_LABELS } from "./_uiLabelThirdPartyCarve";

const REPO_ROOT = process.cwd();

// ──────────────────────────────────────────────────────────────────────────
// File discovery
// ──────────────────────────────────────────────────────────────────────────

/** Recursively collect file paths under `dir` matching the predicate. */
function walk(dir: string, predicate: (filename: string) => boolean): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      out.push(...walk(full, predicate));
    } else if (entry.isFile() && predicate(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function helpDocFiles(): string[] {
  const helpRoot = join(REPO_ROOT, "app/help");
  const mdx = walk(helpRoot, (n) => n.endsWith(".mdx"));
  const errorsPage = join(helpRoot, "errors/page.tsx");
  try {
    statSync(errorsPage);
    mdx.push(errorsPage);
  } catch {
    // errors page may be absent in some snapshots; that's fine.
  }
  return mdx;
}

function productionSourceFiles(): string[] {
  const out: string[] = [];
  const appRoot = join(REPO_ROOT, "app");
  const helpDir = join(REPO_ROOT, "app/help");
  const apiDir = join(REPO_ROOT, "app/api");
  out.push(
    ...walk(appRoot, (n) => /\.(tsx?|jsx?)$/.test(n)).filter(
      (p) => !p.startsWith(helpDir) && !p.startsWith(apiDir),
    ),
  );
  const componentsRoot = join(REPO_ROOT, "components");
  out.push(...walk(componentsRoot, (n) => /\.(tsx?|jsx?)$/.test(n)));
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// Candidate extraction
// ──────────────────────────────────────────────────────────────────────────

type Candidate = {
  /** The label string. */
  label: string;
  /** Repo-relative file path the label was found in. */
  file: string;
  /** 1-indexed line number. */
  line: number;
};

// Markers that disqualify a candidate from being a UI label.
const DISQUALIFYING_CHARS = ["/", ".", "#", "=", "<", ">", "{", "}", "@"];

// Generic copy / emphasis / brand strings that bolding/backticking marks for
// stress but are NOT UI controls. Keeping these out of the candidate set is
// what makes the test high-signal — otherwise every reviewer has to write a
// "this isn't a UI label" exception entry, which defeats the contract.
const STOPWORDS = new Set<string>([
  // Brand / proper nouns referenced in narrative
  "Doug",
  "Eric",
  "FXAV",
  "Drive",
  "Sheets",
  "Google",
  "Google Drive",
  "Google Sheets",
  // Status descriptors used as narrative emphasis (not interactive controls)
  "Green check",
  "Parsed and ready",
  "Couldn't parse",
  "Skipped",
  "Already in live sync",
  // Conceptual/narrative emphasis terms that appear bolded in MDX prose but
  // are NOT UI control labels. They describe categories or behaviors at the
  // paragraph level and don't render as buttons, badges, headings, or input
  // labels anywhere in the shipped surface.
  "One-time setup",
  "Daily rhythm",
  "Crew communication",
  "Hotel and room info",
  "Role-restricted information",
  // parse-data-quality-warnings: the three data-quality CLASS names, bolded as
  // list leads in /help/admin/parse-warnings. They are conceptual categories, not
  // UI controls — the shipped chip/panel render the lowercase descriptive form
  // ("2 unreadable fields") via DATA_GAP_CLASS_LABELS (lib/parser/dataGaps.ts), a
  // variable, never a literal button/heading string in app/ or components/.
  "Unreadable field",
  "Unknown section",
  "Vanished block",
  // Inline example placeholder: the bolded form "Previewing as Alex Rivera"
  // illustrates the shipped "Previewing as <name>" banner with a sample
  // crew name. The shipped UI string is "Previewing as" (matched separately
  // in PreviewBanner.tsx) — the interpolated name is not a separate label.
  "Previewing as Alex Rivera",
]);

// Words whose presence inside an otherwise short bolded phrase strongly
// suggests narrative emphasis rather than a UI control label. UI controls
// rarely contain conjunctions or possessive/instructional pronouns.
const NARRATIVE_LEXEMES = new Set<string>([
  "your",
  "our",
  "my",
  "their",
  "his",
  "her",
  "you",
  "we",
  "us",
  "outside",
  "about",
  "with",
  "from",
  "into",
  "make",
  "appears",
  "fails",
  "happens",
  "comes",
  "goes",
  "tap",
  "tapping",
  "wait",
  "need",
]);

function isProbableUiLabel(raw: string): boolean {
  const s = raw.trim();
  if (s.length === 0) return false;
  const words = s.split(/\s+/);
  // UI labels are typically 1–4 words. Anything longer is almost certainly
  // a sentence fragment / instruction, not a button label.
  if (words.length === 0 || words.length > 4) return false;
  for (const ch of DISQUALIFYING_CHARS) {
    if (s.includes(ch)) return false;
  }
  if (!/^[A-Z]/.test(s)) return false;
  if (STOPWORDS.has(s)) return false;
  // Bolded sentence-style emphasis often ends with a period INSIDE the
  // bold (e.g. `**Actions.**` or `**Crew.**`). Trailing punctuation has
  // already been stripped by extractCandidates(); if the original bolded
  // form was a single word + period, what's left here is a single word and
  // we keep it (it's caught by the casing rule). The narrative-lexeme
  // filter below handles multi-word sentence-style emphasis.
  // Filter narrative lexemes: any word match (case-insensitive) disqualifies.
  for (const w of words) {
    const lower = w.toLowerCase().replace(/[^a-z]/g, "");
    if (NARRATIVE_LEXEMES.has(lower)) return false;
  }
  // Multi-word labels: every non-first word should be either lowercase
  // (sentence-case label like "Issue new link") or capitalized (Title Case
  // label like "Active Shows"). Either is fine. We DO reject phrases where
  // a non-first word starts with an unusual character (e.g., digits) — these
  // are typically narrative.
  return true;
}

const BOLD_RE = /\*\*([^*\n]+?)\*\*/g;
const BACKTICK_RE = /`([^`\n]+?)`/g;

function extractCandidates(filePath: string, content: string): Candidate[] {
  const out: Candidate[] = [];
  const lines = content.split(/\r?\n/);
  const relFile = relative(REPO_ROOT, filePath);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    for (const re of [BOLD_RE, BACKTICK_RE]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        const rawInner = m[1];
        if (rawInner === undefined) continue;
        // Detect "sentence-style list-item emphasis": pattern is
        //   `- **Some Category.**` (or with comma/colon) followed by prose.
        // The bolded span ends with punctuation INSIDE the asterisks. These
        // are categorical emphasis tokens, NOT UI button/link labels.
        // (UI control labels in this project are never authored with a
        // trailing period — verified in PRODUCT.md / DESIGN.md naming.)
        if (/[.,:]$/.test(rawInner)) continue;
        // Also detect: paragraph-style sentence emphasis where the bolded
        // run continues into a sentence (the bold ends with a period AFTER
        // the asterisks — e.g. `**Open the per-show panel ...**` followed
        // by `.`). These are full sentences, length-filtered downstream by
        // the 4-word cap, but skip them cleanly when they start with a
        // verb-ish imperative followed by an article.
        // Strip trailing punctuation (ASCII + unicode ellipsis) and any
        // trailing whitespace before the trimmed punctuation.
        const cleaned = rawInner.replace(/[\s.,;:!?)\]…]+$/u, "").trim();
        if (isProbableUiLabel(cleaned)) {
          out.push({ label: cleaned, file: relFile, line: i + 1 });
        }
      }
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// Production-source label search
// ──────────────────────────────────────────────────────────────────────────

/**
 * Strip line and block comments from a TS/TSX/JS/JSX source string before
 * haystack inclusion. Phase E R8 finding: a literal substring that ONLY
 * appears inside a comment (e.g., the legacy "Open in Drive" reference inside
 * components/agenda/AgendaEmbed.tsx JSDoc) used to satisfy the crosswalk and
 * let a false-positive UI-label claim ride through. Real UI labels live in
 * JSX text, prop values, or string literals, never in comments.
 *
 * Simple regex strip: removes line comments (slash-slash to EOL) and block
 * comments (slash-star to star-slash) non-greedy. Edge cases like double-slash
 * inside string literals are intentionally not handled: the FXAV codebase does
 * not author UI labels inside such literals, and any false-negative on a real
 * shipped label would surface as a test failure (rather than the silent
 * false-positive class this strip eliminates).
 */
/**
 * `import` STATEMENTS ARE REMOVED, not just comments (BL-HELP-UI-LABEL-CROSSWALK-EXACT-MATCH).
 *
 * An import specifier is a module identifier; it is never rendered, so it can
 * never attest that documented copy names a real control. Leaving them in is how
 * `**Viewer**` at `app/help/getting-started/page.mdx:10` passed the crosswalk —
 * on `import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer"`,
 * a bare word-bounded identifier that the word-boundary tier below cannot tell
 * from a button label. Comments were already stripped; imports are the same
 * category of non-text and were simply missed.
 *
 * Deliberately NOT extended to all identifiers. A component name that IS the
 * label often appears as an identifier near where it renders, and stripping
 * those would turn this guard's failures into noise. Imports are safe because
 * the specifier list is syntactically closed and never reaches the DOM.
 */
function stripProductionSource(source: string, filePath: string): string {
  return stripCommentsForFile(source, filePath).replace(/^\s*import\s[^;]*?;?\s*$/gm, "");
}

/**
 * RENDERED TEXT ONLY (BL-CROSSWALK-HAYSTACK-RENDERED-TEXT-ONLY, spec §2.5):
 * the haystack is built from the AST's render-position text — JsxText,
 * string/template content inside JSX expression CHILDREN, and a named
 * allowlist of user-visible attributes. Type annotations, bare constant
 * initializers, object keys, and test ids contribute nothing, so a match now
 * attests a LABEL, not a lexeme. Copy rendered indirectly through constants
 * is handled loud via _uiLabelIndirectCopySources.ts, never silently included.
 */
function buildProductionHaystack(): string {
  const files = productionSourceFiles();
  let haystack = "";
  for (const f of files) {
    try {
      haystack += "\n" + renderedTextOf(readFileSync(f, "utf8"), f);
    } catch {
      // skip unreadable files
    }
  }
  return haystack;
}

/**
 * Normalize a string for cross-source label comparison. The DECLARED_UI_LABELS
 * registry layer is hand-authored against MDX prose (straight ASCII quotes),
 * but production JSX often encodes apostrophes/quotes as HTML entities
 * (`&rsquo;`, `&quot;`) or curly Unicode characters. Normalize both sides to
 * straight ASCII so equivalent labels match.
 */
function normalizeForCompare(s: string): string {
  return s
    .replace(/&rsquo;|&lsquo;|&apos;|[‘’‚‛]/g, "'")
    .replace(/&rdquo;|&ldquo;|&quot;|[“”„‟]/g, '"');
}

/**
 * BL-HELP-UI-LABEL-CROSSWALK-EXACT-MATCH — the short-label tier.
 *
 * THE LIVE BUG. A plain substring test attests a /help label against ANY
 * occurrence of those characters in production source, including one inside an
 * identifier. `**Share**` at `app/help/getting-started/page.mdx:8` passed on
 * `ShareHub` / `shareToken`; `**Viewer**` at :10 passed on `getShowForViewer`.
 * Both are import names the user can never see, so the crosswalk was attesting
 * that documented copy names a real control while proving nothing of the kind —
 * and it fails in the SILENT direction, which is why it survived.
 *
 * WHY A LENGTH TIER rather than word-boundary matching for everything. A long
 * label ("Re-sync from sheet") cannot collide with an identifier by accident;
 * the collision risk is concentrated in short common words. Long labels also
 * legitimately appear split across JSX children, where a `\b` regex over the
 * flattened haystack would produce false FAILURES — and a guard that cries wolf
 * gets exemptions added to silence it, which is worse than the hole it closed.
 * Six characters INCLUSIVE, because `Viewer` is six and is one of the two live
 * instances this closes.
 *
 * CONSEQUENCE BOUND: a label either matches at a word boundary or is reported by
 * name. There is no third outcome and nothing is silently skipped.
 *
 * THREAT MODEL: ordinary authoring drift — copy naming a control that does not
 * exist, or that was renamed. Not adversarial: source deliberately shaped to
 * plant a boundary-delimited match is out of scope.
 */
export const SHORT_LABEL_MAX = 6;

/** Regex-escape, so a label containing `(`/`.`/`+` is matched literally. */
function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Does `haystack` contain `label` as REAL UI text?
 *
 * Short labels must match at word boundaries; longer ones keep the substring
 * test. Both layers of the crosswalk call THIS function, so the two can never
 * disagree about what counts as a match — the registry layer having a different
 * matching rule from the heuristic layer would just move the hole.
 */
export function haystackAttestsLabel(haystack: string, label: string): boolean {
  if (label.length > SHORT_LABEL_MAX) return haystack.includes(label);
  // `\b` is wrong at both ends for a label that starts or ends with a
  // non-word character (`+ Add`): `\b` there asserts a word char is adjacent,
  // which inverts the intent. Anchor with an explicit non-word-or-edge lookaround
  // on each side instead, chosen per end from the label's own first/last char.
  const startsWord = /^\w/.test(label);
  const endsWord = /\w$/.test(label);
  const left = startsWord ? "(?<![\\w])" : "";
  const right = endsWord ? "(?![\\w])" : "";
  return new RegExp(`${left}${escapeForRegex(label)}${right}`).test(haystack);
}

function buildExceptionIndex(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const ex of UI_LABEL_EXCEPTIONS) {
    if (!map.has(ex.file)) map.set(ex.file, new Set());
    map.get(ex.file)!.add(ex.label);
  }
  return map;
}

// ──────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────

describe("Help MDX UI-label crosswalk (Phase E meta-test)", () => {
  it("every probable UI label in help docs is either shipped or registered as a M11-E-D<N> exception", () => {
    const docs = helpDocFiles();
    expect(docs.length).toBeGreaterThan(0);

    const haystack = buildProductionHaystack();
    const exceptions = buildExceptionIndex();

    const findings: string[] = [];

    for (const doc of docs) {
      const content = readFileSync(doc, "utf8");
      const candidates = extractCandidates(doc, content);
      const seen = new Set<string>();
      for (const c of candidates) {
        const key = `${c.file} ${c.label}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const exemptionsForFile = exceptions.get(c.file);
        if (exemptionsForFile && exemptionsForFile.has(c.label)) continue;
        // Third-party controls (Drive's Share/Viewer) are correct copy that
        // was never this app's label to attest; indirect-copy rows carry the
        // labels whose strings live in constants/derive functions and render
        // indirectly. Both registries are validated (shape + stale) below.
        if (THIRD_PARTY_UI_LABELS.some((r) => r.file === c.file && r.label === c.label)) continue;
        if (INDIRECT_COPY_SOURCES.some((r) => r.file === c.file && r.label === c.label)) continue;

        if (haystackAttestsLabel(haystack, c.label)) continue;

        findings.push(
          `  ${c.file}:${c.line} — candidate label "${c.label}" was not found in production source\n` +
            `    Resolve via one of:\n` +
            `      (a) verify the label appears in app/ (excluding app/help) or components/ (typo/casing?);\n` +
            `      (b) remove the label from the MDX if it is drift; or\n` +
            `      (c) add an entry to tests/help/_uiLabelExceptions.ts citing a DEFERRED.md M11-E-D<N> ID;\n` +
            `      (d) if the string is defined in a constant and rendered indirectly, add a row to\n` +
            `          tests/help/_uiLabelIndirectCopySources.ts citing the defining source file; or\n` +
            `      (e) if the label names ANOTHER product's control (e.g. Google Drive), add a row to\n` +
            `          tests/help/_uiLabelThirdPartyCarve.ts naming the product.`,
        );
      }
    }

    if (findings.length > 0) {
      throw new Error(
        `UI-label crosswalk: ${findings.length} label(s) in app/help/ are missing from production source ` +
          `and not exempted.\n\n` +
          findings.join("\n\n") +
          `\n\nSee tests/help/_metaUiLabelCrosswalk.test.ts and AGENTS.md §1.7 for the contract.`,
      );
    }
  });

  it("every exception entry references a real MDX file and a non-empty rationale", () => {
    for (const ex of UI_LABEL_EXCEPTIONS) {
      expect(ex.label.length, `Exception has empty label`).toBeGreaterThan(0);
      expect(
        ex.file.startsWith("app/help/"),
        `Exception file must live under app/help/: ${ex.file}`,
      ).toBe(true);
      expect(/^M11-E-D\d+$/.test(ex.deferredId), `Bad deferredId: ${ex.deferredId}`).toBe(true);
      expect(
        ex.rationale.trim().length,
        `Exception missing rationale: ${ex.label}`,
      ).toBeGreaterThan(10);
      const abs = join(REPO_ROOT, ex.file);
      expect(() => statSync(abs)).not.toThrow();
    }
  });

  it("every third-party carve row is shaped, live, and NOT a shipped control", () => {
    for (const row of THIRD_PARTY_UI_LABELS) {
      expect(row.file.startsWith("app/help/"), `carve file under app/help/: ${row.file}`).toBe(
        true,
      );
      expect(
        row.product.trim().length,
        `carve row for "${row.label}" names a product`,
      ).toBeGreaterThan(0);
      expect(
        row.reason.trim().length,
        `carve row for "${row.label}" needs a reason`,
      ).toBeGreaterThan(10);
      // Stale check: the label still appears in its MDX file.
      const content = readFileSync(join(REPO_ROOT, row.file), "utf8");
      expect(
        content.includes(row.label),
        `Stale carve: "${row.label}" no longer appears in ${row.file} — remove the row.`,
      ).toBe(true);
    }
  });

  it("every indirect-copy row cites a source that really defines the label, and is not attested directly", () => {
    const haystack = buildProductionHaystack();
    for (const row of INDIRECT_COPY_SOURCES) {
      expect(row.file.startsWith("app/help/"), `row file under app/help/: ${row.file}`).toBe(true);
      expect(
        row.reason.trim().length,
        `indirect row for "${row.label}" needs a reason`,
      ).toBeGreaterThan(10);
      // The citation is executable: the defining source file carries the
      // literal. A reworded constant fails HERE, by name, instead of silently
      // un-anchoring the row.
      const source = readFileSync(join(REPO_ROOT, row.source), "utf8");
      expect(
        source.includes(row.label),
        `Indirect-copy row for "${row.label}" cites ${row.source}, which no longer contains the literal — update or remove the row.`,
      ).toBe(true);
      // Stale check the other way: if the label became RENDERED text, the row
      // is dead weight and the automatic haystack should carry it instead.
      expect(
        haystackAttestsLabel(haystack, row.label),
        `Indirect-copy row for "${row.label}" is stale: the rendered haystack now attests it directly — remove the row.`,
      ).toBe(false);
      // And the label must still appear in its MDX file.
      const content = readFileSync(join(REPO_ROOT, row.file), "utf8");
      expect(
        content.includes(row.label),
        `Stale indirect-copy row: "${row.label}" no longer appears in ${row.file} — remove the row.`,
      ).toBe(true);
    }
  });

  it("every exception's label actually appears in its declared MDX file (catches stale exceptions)", () => {
    for (const ex of UI_LABEL_EXCEPTIONS) {
      const abs = join(REPO_ROOT, ex.file);
      const content = readFileSync(abs, "utf8");
      expect(
        content.includes(ex.label),
        `Stale exception: "${ex.label}" no longer appears in ${ex.file} — remove the exception entry.`,
      ).toBe(true);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Declared-registry layer (Phase E structural-defense extension)
// ──────────────────────────────────────────────────────────────────────────
//
// The heuristic layer above catches bolded `**Label**` and backticked
// `` `Label` `` UI-label candidates. It does NOT catch labels mentioned in
// plain prose, `##` headings, or quoted strings — those would balloon false
// positives. This layer adds an EXPLICIT per-page declaration: every Phase E
// MDX page lists its UI-control claims here, and the test asserts each is
// either shipped in production or exempted via UI_LABEL_EXCEPTIONS citing
// a DEFERRED.md M11-E-D<N> ID. This catches D2/D3/D4-shape drift the
// heuristic misses (prose-only mentions of "Open", "Re-sync", etc.).
// See AGENTS.md §1.7 and the Phase E plan retrospective.

describe("Help MDX UI-label crosswalk — declared registry layer", () => {
  it("every declared UI label is either shipped in production OR exempted", () => {
    const haystack = buildProductionHaystack();
    const normalizedHaystack = normalizeForCompare(haystack);
    const exceptions = buildExceptionIndex();
    const normalizedExceptions = new Map<string, Set<string>>();
    for (const [file, labels] of exceptions.entries()) {
      const ns = new Set<string>();
      for (const l of labels) ns.add(normalizeForCompare(l));
      normalizedExceptions.set(file, ns);
    }

    const findings: string[] = [];
    for (const entry of DECLARED_UI_LABELS) {
      const normLabel = normalizeForCompare(entry.label);
      if (haystackAttestsLabel(normalizedHaystack, normLabel)) continue;
      const exemptionsForFile = normalizedExceptions.get(entry.file);
      if (exemptionsForFile && exemptionsForFile.has(normLabel)) continue;
      findings.push(
        `  ${entry.file}: declared label "${entry.label}" is not in production source AND not exempted in UI_LABEL_EXCEPTIONS`,
      );
    }

    if (findings.length > 0) {
      throw new Error(
        `Declared UI labels failing crosswalk:\n${findings.join("\n")}\n\n` +
          `Add a UI_LABEL_EXCEPTIONS entry citing a DEFERRED.md M11-E-D<N> ID, ` +
          `or remove the label from DECLARED_UI_LABELS if it's not actually documented.`,
      );
    }
  });

  it("stale-entry guard: every declared label still appears in its claimed MDX file", () => {
    const findings: string[] = [];
    for (const entry of DECLARED_UI_LABELS) {
      const absPath = join(REPO_ROOT, entry.file);
      let exists = true;
      try {
        statSync(absPath);
      } catch {
        exists = false;
      }
      if (!exists) {
        findings.push(
          `  ${entry.file}: file does not exist (stale entry — remove from DECLARED_UI_LABELS)`,
        );
        continue;
      }
      const content = readFileSync(absPath, "utf8");
      // Normalize both sides: MDX prose uses straight quotes, but if a future
      // editor pass swaps to curly/typographic quotes the entry shouldn't
      // become stale for a purely typographic reason.
      const normalizedContent = normalizeForCompare(content);
      const normalizedLabel = normalizeForCompare(entry.label);
      if (!normalizedContent.includes(normalizedLabel)) {
        findings.push(
          `  ${entry.file}: declared label "${entry.label}" no longer appears in the MDX (stale entry; remove from DECLARED_UI_LABELS)`,
        );
      }
    }
    if (findings.length > 0) {
      throw new Error(`Stale DECLARED_UI_LABELS entries:\n${findings.join("\n")}`);
    }
  });

  it("DECLARED_UI_LABELS file paths are all under app/help/", () => {
    for (const entry of DECLARED_UI_LABELS) {
      expect(
        entry.file.startsWith("app/help/"),
        `DECLARED_UI_LABELS entry must reference a file under app/help/: ${entry.file}`,
      ).toBe(true);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Comment-stripping regression (Phase E R8)
// ──────────────────────────────────────────────────────────────────────────
//
// Pins the contract that a label string appearing ONLY inside a comment is
// NOT treated as in-production. Without comment-stripping, the "Open in Drive"
// JSDoc reference in components/agenda/AgendaEmbed.tsx silently satisfied the
// crosswalk's substring match, allowing a docs-vs-shipped drift to ride
// through. See Codex R8 + the stripComments function above.

describe("Help MDX UI-label crosswalk: comment-stripping regression (R8)", () => {
  it("a label that appears ONLY in a comment is not counted as in-production", () => {
    const synthetic = [
      "// This is a fake label only in a comment: UniqueFakeLabelXYZ",
      "/* Another comment with UniqueFakeLabelXYZ */",
      "export const realThing = 'something-else';",
    ].join("\n");
    expect(synthetic).toContain("UniqueFakeLabelXYZ");
    expect(stripProductionSource(synthetic, "synthetic.tsx")).not.toContain("UniqueFakeLabelXYZ");
  });

  it("a label that appears in JSX text / string literal IS preserved by the strip", () => {
    const synthetic = [
      "// commented-out RealShippedLabel reference",
      "export function Btn() { return <button>RealShippedLabel</button>; }",
    ].join("\n");
    expect(stripProductionSource(synthetic, "synthetic.tsx")).toContain("RealShippedLabel");
  });

  it('URL-style "https://" inside a string literal survives the line-comment strip', () => {
    const synthetic = "export const url = 'https://example.com/x';";
    expect(stripProductionSource(synthetic, "synthetic.tsx")).toContain("https://example.com/x");
  });
});

describe("rendered-text haystack premise (BL-CROSSWALK-HAYSTACK-RENDERED-TEXT-ONLY)", () => {
  // The entry's two premise fixtures, planted BEFORE the rebuild (plan G2
  // step 1). Under the all-source haystack the negative fixture ATTESTS —
  // a bare constant initializer is indistinguishable from a button label —
  // which is exactly the false assurance the rebuild removes.
  const FIXTURE = [
    'const auditKind = "PlantedPhantomLabel";',
    "type Props = { viewer: PlantedAnnotationLabel };",
    "export function Fixture(props: Props) {",
    "  return (",
    '    <section data-testid="planted-testid-label" aria-label="Planted aria label">',
    "      <button>PlantedJsxTextLabel</button>",
    '      <span>{"PlantedExpressionChildLabel"}</span>',
    "      <output>{`Connected · ${String(props.viewer)}`}</output>",
    '      <input placeholder="Planted placeholder label" />',
    "    </section>",
    "  );",
    "}",
  ].join("\n");

  it("NEGATIVE premise: a non-rendered constant or annotation contributes NOTHING", () => {
    const text = renderedTextOf(FIXTURE, "components/Fixture.tsx");
    expect(text).not.toContain("PlantedPhantomLabel");
    expect(text).not.toContain("PlantedAnnotationLabel");
    // data-testid is NOT on the user-visible attribute allowlist.
    expect(text).not.toContain("planted-testid-label");
  });

  it("POSITIVE premise: JSX text, expression children, template fragments, and user-visible attributes contribute", () => {
    const text = renderedTextOf(FIXTURE, "components/Fixture.tsx");
    expect(text).toContain("PlantedJsxTextLabel");
    expect(text).toContain("PlantedExpressionChildLabel");
    // The DriveConnectionPanel seed shape: a TemplateHead fragment in render
    // position ("Connected · " before the interpolation).
    expect(text).toContain("Connected · ");
    expect(text).toContain("Planted aria label");
    expect(text).toContain("Planted placeholder label");
  });
});

describe("rendered-text extraction hardening (mutation-gate survivors, 2026-08-10)", () => {
  // Each row kills a surviving mutant from the surface's first enrollment
  // (score 0.824 vs floor 0.9): an accept-set branch no premise fixture reached.
  it("a string literal INSIDE a template interpolation in render position contributes", () => {
    const source =
      'export const P = ({ on }: { on: boolean }) => <i>{`state ${on ? "PlantedTernaryLabel" : "off"}`}</i>;';
    expect(renderedTextOf(source, "components/P.tsx")).toContain("PlantedTernaryLabel");
  });

  it("a template TAIL fragment after the interpolation contributes", () => {
    const source =
      "export const P = ({ n }: { n: number }) => <i>{`Connected · ${n} tail-marker`}</i>;";
    expect(renderedTextOf(source, "components/P.tsx")).toContain(" tail-marker");
  });

  it("an EMPTY attribute expression is skipped, not read through", () => {
    // `title={}` parses as a JsxExpression with no expression; the guard must
    // skip it (the surviving connector flip crashed here).
    const source = "export const P = () => <span title={}><b>StillRenderedLabel</b></span>;";
    expect(renderedTextOf(source, "components/P.tsx")).toContain("StillRenderedLabel");
  });
});

describe("the short-label tier (BL-HELP-UI-LABEL-CROSSWALK-EXACT-MATCH)", () => {
  it("PREMISE: the tier discriminates — a short label matches only at word boundaries", () => {
    // Without this the tier could be `return true` and every crosswalk assertion
    // would still pass. Both directions, on a label at the INCLUSIVE boundary.
    expect(haystackAttestsLabel("<button>Viewer</button>", "Viewer")).toBe(true);
    expect(haystackAttestsLabel("getShowForViewer", "Viewer")).toBe(false);
    expect(haystackAttestsLabel("ShareHub shareToken", "Share")).toBe(false);
    expect(haystackAttestsLabel('"Share link rotated."', "Share")).toBe(true);
    // Length boundary: 6 is IN the tier, 7 is not.
    expect("Viewer".length).toBe(SHORT_LABEL_MAX);
    expect(haystackAttestsLabel("xxViewersxx", "Viewer")).toBe(false);
    expect(haystackAttestsLabel("getShowForViewers", "Viewers")).toBe(true); // 7 → substring tier
  });

  it("a label bounded by non-word characters is matched, not rejected", () => {
    // `\b` at both ends is wrong for a label whose own first/last char is not a
    // word char: there `\b` demands an ADJACENT word char, inverting the intent.
    expect(haystackAttestsLabel("<span>+ Add</span>", "+ Add")).toBe(true);
    expect(haystackAttestsLabel("(3)", "(3)")).toBe(true);
  });

  it("CLOSED (was DOCUMENTED LIMIT): a type annotation no longer reaches the haystack", () => {
    // U8's probe pinned the residual — `viewer: Viewer`, a TYPE ANNOTATION in
    // app/show/[slug]/[shareToken]/_CrewShell.tsx, attested `**Viewer**` as a
    // button label — and its pin was written to FAIL the day the rendered-text
    // haystack landed. It did (M-wave 2 W-GUARDS,
    // BL-CROSSWALK-HAYSTACK-RENDERED-TEXT-ONLY), and this is the flipped form:
    // the annotation text is structurally absent from the haystack now, so the
    // false-attestation path the limit documented cannot recur silently.
    // Share/Viewer themselves are third-party rows in
    // _uiLabelThirdPartyCarve.ts — Google Drive's controls, never candidates.
    const haystack = buildProductionHaystack();
    expect(haystack.includes("viewer: Viewer")).toBe(false);
    // The annotation's source file still carries it (else this pin is stale
    // and proves nothing about exclusion — premise, not tautology).
    const crewShell = readFileSync(
      join(REPO_ROOT, "app/show/[slug]/[shareToken]/_CrewShell.tsx"),
      "utf8",
    );
    expect(crewShell.includes("viewer: Viewer")).toBe(true);
  });
});
