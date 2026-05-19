import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export type SpecCodePayload = {
  dougFacing: string | null;
  crewFacing: string | null;
  followUp: string | null;
  helpfulContext: string | null;
};

export type RetiredCodePayload = {
  retiredIn: string;
  replacedBy: string | null;
};

export type ExtractSpecCodesOptions = {
  sourcePath: string;
  validateRenderedHelpfulContext?: boolean;
};

export type ExtractedSpecCodes = {
  specCodes: Record<string, SpecCodePayload>;
  retiredCodes: Record<string, RetiredCodePayload>;
};

const SPEC_PATH = "docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md";
const OUTPUT_PATH = "lib/messages/__generated__/spec-codes.ts";
const HELP_CONTEXT_ANCHOR = "<!-- §12.4 helpfulContext appendix";
const CODE_RE = /^[A-Z][A-Za-z0-9_-]*(?:_[A-Za-z0-9_-]+)*$/;
const PSEUDO_NULL_SENTINELS = new Set(["null", "none", "n/a", "na"]);
const RENDERED_CONTEXT_ROOTS = ["app", "lib", "components", "middleware.ts"] as const;
const RENDERED_MESSAGE_FOR_RE =
  /messageFor\(\s*["'`]([A-Z][A-Za-z0-9_-]*(?:_[A-Za-z0-9_-]+)+)["'`][\s\S]{0,160}?\)\.dougFacing/g;
const RENDERED_ERROR_EXPLAINER_RE =
  /<ErrorExplainer[^>\n]+code=["'`]([A-Z][A-Za-z0-9_-]*(?:_[A-Za-z0-9_-]+)+)["'`]/g;

function stripOuterQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function unescapeMarkdown(value: string): string {
  return value.replace(/\\\|/g, "|").replace(/\\_/g, "_");
}

function splitMarkdownRow(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let escaped = false;
  const trimmed = line.trim();
  const body = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;

  for (const char of body) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }
    if (char === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.length > 0) cells.push(current.trim());

  while (cells.at(-1) === "") cells.pop();
  return cells;
}

function normalizeCell(raw: string, code: string): string | null {
  const value = unescapeMarkdown(stripOuterQuotes(raw.trim()));
  if (value === "" || value === "—") return null;

  const lower = value.toLowerCase();
  if (PSEUDO_NULL_SENTINELS.has(lower) || lower.includes("no doug-facing message")) {
    throw new Error(
      `§12.4 row uses pseudo-null sentinel '${value}' for code ${code}; use '—' (em-dash) or empty cell per §12.4 Conventions`,
    );
  }

  if (
    lower.startsWith("(admin log only") ||
    lower.startsWith("(admin-log-only") ||
    lower.startsWith("(operator log only") ||
    lower.startsWith("(operator-log-only") ||
    lower.startsWith("(operator-only") ||
    lower.startsWith("(admin-info log")
  ) {
    return null;
  }

  return value;
}

function cleanCodeCell(raw: string): string {
  return raw
    .trim()
    .replace(/^~~/, "")
    .replace(/~~$/, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .trim();
}

function codeFromCell(raw: string): string | null {
  const cleaned = cleanCodeCell(raw);
  if (!cleaned || cleaned.startsWith("|")) return null;
  const code = cleaned.split(/\s+/)[0];
  if (!code || !CODE_RE.test(code)) return null;
  return code;
}

function retiredKeyFromCell(raw: string): string | null {
  const cleaned = cleanCodeCell(raw);
  if (!cleaned) return null;
  return cleaned;
}

function isDelimiterRow(cells: readonly string[]): boolean {
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function isHeaderRow(cells: readonly string[]): boolean {
  return cells[0]?.toLowerCase() === "code";
}

function findCatalogSection(markdown: string): string {
  const start = markdown.search(/^### 12\.4 User-facing message catalog/m);
  if (start === -1) throw new Error("§12.4 User-facing message catalog heading not found");

  const rest = markdown.slice(start);
  const end = rest.search(/\n## 13\.|\n\*\*v2\+ candidates\*\*/);
  return end === -1 ? rest : rest.slice(0, end);
}

function parseYamlString(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\n/g, "\n")
      .replace(/\\\\/g, "\\");
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

function parseHelpfulContextAppendix(section: string): Record<string, string> {
  const anchorIndex = section.indexOf(HELP_CONTEXT_ANCHOR);
  if (anchorIndex === -1) throw new Error("§12.4 helpfulContext appendix anchor not found");

  const afterAnchor = section.slice(anchorIndex);
  const fenceStart = afterAnchor.indexOf("```yaml");
  if (fenceStart === -1) throw new Error("§12.4 helpfulContext appendix yaml fence not found");
  const yamlStart = fenceStart + "```yaml".length;
  const fenceEnd = afterAnchor.indexOf("```", yamlStart);
  if (fenceEnd === -1) throw new Error("§12.4 helpfulContext appendix yaml fence is not closed");

  const yaml = afterAnchor.slice(yamlStart, fenceEnd);
  const entries: Record<string, string> = {};
  for (const line of yaml.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf(":");
    if (separator === -1) {
      throw new Error(`Malformed §12.4 helpfulContext YAML line: ${trimmed}`);
    }
    const key = trimmed.slice(0, separator).trim();
    const value = parseYamlString(trimmed.slice(separator + 1));
    if (!CODE_RE.test(key)) {
      throw new Error(`Malformed §12.4 helpfulContext code key: ${key}`);
    }
    if (!value.trim()) {
      throw new Error(`§12.4 helpfulContext appendix missing entry for code ${key}`);
    }
    entries[key] = value;
  }
  return entries;
}

function parseRows(section: string): {
  tableCodes: Record<string, Omit<SpecCodePayload, "helpfulContext">>;
  retiredCodes: Record<string, RetiredCodePayload>;
} {
  const tableCodes: Record<string, Omit<SpecCodePayload, "helpfulContext">> = {};
  const lineByCode: Record<string, number> = {};
  const retiredCodes: Record<string, RetiredCodePayload> = {};
  const lines = section.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (!line.trim().startsWith("|")) return;
    const cells = splitMarkdownRow(line);
    if (cells.length < 5 || isHeaderRow(cells) || isDelimiterRow(cells)) return;
    const codeCell = cells[0] ?? "";
    if (codeCell.includes("**")) return;

    const retired = codeCell.trim().startsWith("~~");
    if (retired) {
      const key = retiredKeyFromCell(codeCell);
      if (!key) throw new Error(`Malformed retired §12.4 row at ${index + 1}`);
      retiredCodes[key] = {
        retiredIn: "§12.4",
        replacedBy: extractReplacement(cells.slice(1).join(" | ")),
      };
      return;
    }

    const code = codeFromCell(codeCell);
    if (!code) return;

    const payload = {
      dougFacing: normalizeCell(cells[2] ?? "", code),
      crewFacing: normalizeCell(cells[3] ?? "", code),
      followUp: normalizeCell(cells[4] ?? "", code),
    };

    const existing = tableCodes[code];
    if (existing && JSON.stringify(existing) !== JSON.stringify(payload)) {
      throw new Error(
        [
          `SPEC_DUPLICATE_ACTIVE_CODE ${code}`,
          `first row line ${lineByCode[code]}, duplicate row line ${index + 1}`,
          ...diffPayload(existing, payload),
        ].join("\n"),
      );
    }
    tableCodes[code] = payload;
    lineByCode[code] = lineByCode[code] ?? index + 1;
  });

  return { tableCodes, retiredCodes };
}

function extractReplacement(text: string): string | null {
  const matches = [...text.matchAll(/`([A-Z][A-Za-z0-9_-]*(?:_[A-Za-z0-9_-]+)*)`/g)].map(
    (match) => match[1],
  );
  return matches[0] ?? null;
}

function diffPayload(
  left: Omit<SpecCodePayload, "helpfulContext">,
  right: Omit<SpecCodePayload, "helpfulContext">,
): string[] {
  return (["dougFacing", "crewFacing", "followUp"] as const)
    .filter((field) => left[field] !== right[field])
    .map((field) => `${field}: ${JSON.stringify(left[field])} != ${JSON.stringify(right[field])}`);
}

function walkSourceFiles(roots: readonly string[]): string[] {
  const files: string[] = [];
  const walk = (path: string) => {
    const stats = statSync(path);
    if (!stats.isDirectory()) {
      if (/\.(ts|tsx)$/.test(path)) files.push(path);
      return;
    }

    for (const entry of readdirSync(path)) {
      const child = join(path, entry);
      if (entry === "__generated__") continue;
      walk(child);
    }
  };

  for (const root of roots) {
    walk(root);
  }
  return files.sort();
}

function lineNumberAt(source: string, index: number): number {
  return source.slice(0, index).split(/\r?\n/).length;
}

function renderedHelpfulContextSites(): Array<{ code: string; fileName: string; line: number }> {
  const sites: Array<{ code: string; fileName: string; line: number }> = [];
  for (const fileName of walkSourceFiles(RENDERED_CONTEXT_ROOTS)) {
    const source = readFileSync(fileName, "utf8");
    for (const pattern of [RENDERED_MESSAGE_FOR_RE, RENDERED_ERROR_EXPLAINER_RE]) {
      pattern.lastIndex = 0;
      for (const match of source.matchAll(pattern)) {
        if (match[1]) {
          sites.push({
            code: match[1],
            fileName,
            line: lineNumberAt(source, match.index ?? 0),
          });
        }
      }
    }
  }
  return sites;
}

export function extractSpecCodesFromMarkdown(
  markdown: string,
  options: ExtractSpecCodesOptions,
): ExtractedSpecCodes {
  const section = findCatalogSection(markdown);
  const { tableCodes, retiredCodes } = parseRows(section);
  const helpfulContext = parseHelpfulContextAppendix(section);
  const specCodes: Record<string, SpecCodePayload> = {};
  const invariantErrors: string[] = [];

  for (const key of Object.keys(helpfulContext)) {
    if (!(key in tableCodes)) {
      invariantErrors.push(`§12.4 helpfulContext appendix references unknown code ${key}`);
    }
  }

  for (const [code, payload] of Object.entries(tableCodes)) {
    const context = helpfulContext[code] ?? null;
    if (payload.dougFacing !== null && context === null) {
      invariantErrors.push(
        `§12.4 helpfulContext appendix missing entry for code ${code} (dougFacing is non-null)`,
      );
    }
    if (payload.dougFacing === null && context !== null) {
      invariantErrors.push(
        `§12.4 helpfulContext appendix has entry for code ${code} whose dougFacing is null (admin-log-only codes never surface to Doug — remove the YAML entry)`,
      );
    }
    specCodes[code] = { ...payload, helpfulContext: context };
  }

  if (invariantErrors.length > 0) {
    throw new Error(invariantErrors.join("\n"));
  }

  if (options.validateRenderedHelpfulContext ?? true) {
    for (const site of renderedHelpfulContextSites()) {
      const row = specCodes[site.code];
      if (!row || row.helpfulContext === null) {
        throw new Error(
          `§12.4 helpfulContext appendix missing entry for ${site.code}; the code is rendered to Doug via messageFor at ${site.fileName}:${site.line} but has no helpfulContext for the <ErrorExplainer> link to render`,
        );
      }
    }
  }

  return { specCodes, retiredCodes };
}

function stableObjectLiteral(value: unknown, indent = 0): string {
  const pad = " ".repeat(indent);
  const childPad = " ".repeat(indent + 2);
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableObjectLiteral(item, indent)).join(", ")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  if (entries.length === 0) return "{}";
  return [
    "{",
    ...entries.map(
      ([key, entry]) => `${childPad}${JSON.stringify(key)}: ${stableObjectLiteral(entry, indent + 2)},`,
    ),
    `${pad}}`,
  ].join("\n");
}

export function renderGeneratedSpecCodes(extracted: ExtractedSpecCodes): string {
  return `// Generated by scripts/extract-spec-codes.ts. Do not edit by hand.

export type SpecCodePayload = {
  dougFacing: string | null;
  crewFacing: string | null;
  followUp: string | null;
  helpfulContext: string | null;
};

export const SPEC_CODES = ${stableObjectLiteral(extracted.specCodes)} as const satisfies Record<string, SpecCodePayload>;

export const RETIRED_CODES = ${stableObjectLiteral(extracted.retiredCodes)} as const;
`;
}

export function generateSpecCodesFile(specPath = SPEC_PATH, outputPath = OUTPUT_PATH): void {
  const markdown = readFileSync(specPath, "utf8");
  const extracted = extractSpecCodesFromMarkdown(markdown, { sourcePath: specPath });
  const rendered = renderGeneratedSpecCodes(extracted);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, rendered);
  console.log(
    `Generated ${relative(process.cwd(), outputPath)} from ${Object.keys(extracted.specCodes).length} active §12.4 codes and ${Object.keys(extracted.retiredCodes).length} retired rows.`,
  );
}

const invokedPath = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;
if (invokedPath) {
  generateSpecCodesFile();
}
