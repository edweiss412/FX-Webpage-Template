// M11 Phase B.2: parse master-spec §12.4 markdown and derive the canonical
// admin-log-only code set.
//
// Contract:
// - §12.4 table is 5 columns: Code | Where it surfaces | Doug | Crew | Follow-up.
// - Both Doug and Crew cells must be canonical null shapes.
// - Only rows in §12.4 are considered when the section heading is present.
// - Escaped pipes (`\|`) inside cells must not shift column indexes.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DEFAULT_SPEC_PATH = "docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md";
const ESCAPED_PIPE_SENTINEL = "<<ESCAPED-PIPE>>";

function sliceSection124(markdown: string): string {
  const lines = markdown.split("\n");
  const startIdx = lines.findIndex((line) => /^### 12\.4 /.test(line));
  if (startIdx === -1) return markdown;

  let endIdx = lines.length;
  for (let index = startIdx + 1; index < lines.length; index++) {
    if (/^(## |### )/.test(lines[index] ?? "")) {
      endIdx = index;
      break;
    }
  }

  return lines.slice(startIdx, endIdx).join("\n");
}

function isNullShape(cell: string): boolean {
  if (cell === "—") return true;
  if (cell === "") return true;
  return /^\(admin log only(\b| —)/.test(cell);
}

function splitMarkdownRow(line: string): string[] {
  return line
    .replace(/\\\|/g, ESCAPED_PIPE_SENTINEL)
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim().replace(new RegExp(ESCAPED_PIPE_SENTINEL, "g"), "|"));
}

export function extractAdminLogOnlyCodes(markdown: string): string[] {
  const section = sliceSection124(markdown);
  const codes: string[] = [];

  for (const line of section.split("\n")) {
    if (!line.startsWith("|") || !line.endsWith("|")) continue;
    if (line.includes("---")) continue;

    const cells = splitMarkdownRow(line);
    if (cells.length < 4) continue;

    const codeMatch = cells[0]?.match(/^`([A-Z][A-Z0-9_]*)`$/);
    if (!codeMatch) continue;

    const dougCell = cells[2] ?? "";
    const crewCell = cells[3] ?? "";

    const code = codeMatch[1];
    if (code && isNullShape(dougCell) && isNullShape(crewCell)) {
      codes.push(code);
    }
  }

  return codes;
}

const invokedPath = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;
if (invokedPath) {
  const path = process.argv[2] ?? DEFAULT_SPEC_PATH;
  for (const code of extractAdminLogOnlyCodes(readFileSync(path, "utf8"))) {
    console.log(code);
  }
}
