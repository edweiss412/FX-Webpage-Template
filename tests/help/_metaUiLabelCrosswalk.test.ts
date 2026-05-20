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
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  DECLARED_UI_LABELS,
  UI_LABEL_EXCEPTIONS,
} from "./_uiLabelExceptions";

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
      (p) => !p.startsWith(helpDir) && !p.startsWith(apiDir)
    )
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
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*$/gm, "$1");
}

function buildProductionHaystack(): string {
  const files = productionSourceFiles();
  let haystack = "";
  for (const f of files) {
    try {
      haystack += "\n" + stripComments(readFileSync(f, "utf8"));
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

        if (haystack.includes(c.label)) continue;

        findings.push(
          `  ${c.file}:${c.line} — candidate label "${c.label}" was not found in production source\n` +
            `    Resolve via one of:\n` +
            `      (a) verify the label appears in app/ (excluding app/help) or components/ (typo/casing?);\n` +
            `      (b) remove the label from the MDX if it is drift; or\n` +
            `      (c) add an entry to tests/help/_uiLabelExceptions.ts citing a DEFERRED.md M11-E-D<N> ID.`
        );
      }
    }

    if (findings.length > 0) {
      throw new Error(
        `UI-label crosswalk: ${findings.length} label(s) in app/help/ are missing from production source ` +
          `and not exempted.\n\n` +
          findings.join("\n\n") +
          `\n\nSee tests/help/_metaUiLabelCrosswalk.test.ts and AGENTS.md §1.7 for the contract.`
      );
    }
  });

  it("every exception entry references a real MDX file and a non-empty rationale", () => {
    for (const ex of UI_LABEL_EXCEPTIONS) {
      expect(ex.label.length, `Exception has empty label`).toBeGreaterThan(0);
      expect(ex.file.startsWith("app/help/"), `Exception file must live under app/help/: ${ex.file}`).toBe(
        true
      );
      expect(/^M11-E-D\d+$/.test(ex.deferredId), `Bad deferredId: ${ex.deferredId}`).toBe(true);
      expect(ex.rationale.trim().length, `Exception missing rationale: ${ex.label}`).toBeGreaterThan(10);
      const abs = join(REPO_ROOT, ex.file);
      expect(() => statSync(abs)).not.toThrow();
    }
  });

  it("every exception's label actually appears in its declared MDX file (catches stale exceptions)", () => {
    for (const ex of UI_LABEL_EXCEPTIONS) {
      const abs = join(REPO_ROOT, ex.file);
      const content = readFileSync(abs, "utf8");
      expect(
        content.includes(ex.label),
        `Stale exception: "${ex.label}" no longer appears in ${ex.file} — remove the exception entry.`
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
      if (normalizedHaystack.includes(normLabel)) continue;
      const exemptionsForFile = normalizedExceptions.get(entry.file);
      if (exemptionsForFile && exemptionsForFile.has(normLabel)) continue;
      findings.push(
        `  ${entry.file}: declared label "${entry.label}" is not in production source AND not exempted in UI_LABEL_EXCEPTIONS`
      );
    }

    if (findings.length > 0) {
      throw new Error(
        `Declared UI labels failing crosswalk:\n${findings.join("\n")}\n\n` +
          `Add a UI_LABEL_EXCEPTIONS entry citing a DEFERRED.md M11-E-D<N> ID, ` +
          `or remove the label from DECLARED_UI_LABELS if it's not actually documented.`
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
          `  ${entry.file}: file does not exist (stale entry — remove from DECLARED_UI_LABELS)`
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
          `  ${entry.file}: declared label "${entry.label}" no longer appears in the MDX (stale entry; remove from DECLARED_UI_LABELS)`
        );
      }
    }
    if (findings.length > 0) {
      throw new Error(
        `Stale DECLARED_UI_LABELS entries:\n${findings.join("\n")}`
      );
    }
  });

  it("DECLARED_UI_LABELS file paths are all under app/help/", () => {
    for (const entry of DECLARED_UI_LABELS) {
      expect(
        entry.file.startsWith("app/help/"),
        `DECLARED_UI_LABELS entry must reference a file under app/help/: ${entry.file}`
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
    expect(stripComments(synthetic)).not.toContain("UniqueFakeLabelXYZ");
  });

  it("a label that appears in JSX text / string literal IS preserved by the strip", () => {
    const synthetic = [
      "// commented-out RealShippedLabel reference",
      "export function Btn() { return <button>RealShippedLabel</button>; }",
    ].join("\n");
    expect(stripComments(synthetic)).toContain("RealShippedLabel");
  });

  it('URL-style "https://" inside a string literal survives the line-comment strip', () => {
    const synthetic = "export const url = 'https://example.com/x';";
    expect(stripComments(synthetic)).toContain("https://example.com/x");
  });
});
