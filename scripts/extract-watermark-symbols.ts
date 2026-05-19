import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";

const SPEC_PATH = "docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md";
const OUT_PATH = "lib/audit/watermark-symbols.generated.ts";

export type WatermarkSymbols = {
  authoritativeGatingWatermarks: string[];
  displayOnlyTimestamps: string[];
  syncEntryPoints: string[];
  bannedCombos: string[][];
};

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

function sectionAround(text: string, marker: string): string {
  const index = text.indexOf(marker);
  if (index < 0) throw new Error(`Could not find ${marker} in spec/plan text`);
  return text.slice(index, Math.min(text.length, index + 18000));
}

function normalizeSymbol(value: string): string[] {
  const cleaned = value
    .replace(/\s+/g, " ")
    .replace(/\s*->>\s*/g, "->>")
    .replace(/['"`]/g, "")
    .trim();
  if (cleaned.includes("/")) {
    const [prefix] = cleaned.split(".");
    if (prefix === "fileMeta") {
      return cleaned.split("/").map((part, index) => (index === 0 ? part : `fileMeta.${part}`));
    }
  }
  const braced = cleaned.match(/^([a-z][a-z0-9_]*?)\.\{(.+)\}$/);
  if (braced) {
    const table = braced[1]!;
    const fields = braced[2]!
      .split(",")
      .map((field) => field.trim())
      .filter(Boolean);
    return fields.map((field) => `${table}.${field}`);
  }
  return [cleaned];
}

function collectBacktickSymbols(text: string): string[] {
  const symbols: string[] = [];
  for (const match of text.matchAll(/`([^`]+)`/g)) {
    const raw = match[1];
    if (!raw) continue;
    for (const symbol of normalizeSymbol(raw)) {
      if (/\s/.test(symbol)) continue;
      if (symbol === "shows.diagrams") continue;
      if (symbol === "shows.snapshot_revision_id" || symbol === "shows.base_modified_time") continue;
      if (/^[a-zA-Z][a-zA-Z0-9_]*(?:\.|->>)[a-zA-Z0-9_]+/.test(symbol)) {
        symbols.push(symbol);
      }
    }
  }
  return unique(symbols);
}

function collectSyncEntryPoints(section: string): string[] {
  const match =
    section.match(/sync entry points include ([\s\S]*?); \(3\)/) ??
    section.match(/const SYNC_ENTRY_POINTS = \[([\s\S]*?)\];/);
  if (!match?.[1]) throw new Error("Could not find AC-X.4 sync entry point list");
  return Array.from(match[1].matchAll(/[`"']([a-zA-Z][a-zA-Z0-9_]*)[`"']/g), (entry) => entry[1]).filter(
    (entry): entry is string => Boolean(entry),
  );
}

function collectAuthoritative(section: string, fullText: string): string[] {
  const match =
    section.match(/AUTHORITATIVE_GATING_WATERMARKS[\s\S]*?valid as the RHS of a sync-decision comparison: ([\s\S]*?\)) and `DISPLAY_ONLY_TIMESTAMPS`/) ??
    section.match(/AUTHORITATIVE_GATING_WATERMARKS[\s\S]*?\n([\s\S]*?)\n\s+\*\*DISPLAY_ONLY_TIMESTAMPS/);
  if (!match?.[1]) throw new Error("Could not find AUTHORITATIVE_GATING_WATERMARKS prose");
  const symbols = collectBacktickSymbols(match[1]);
  if (symbols.includes("drive_watch_channels.expires_at")) {
    for (const field of ["activated_at", "superseded_at", "stopped_at", "created_at"]) {
      if (new RegExp(`\\b${field}\\b`).test(fullText)) symbols.push(`drive_watch_channels.${field}`);
    }
  }
  return unique(symbols);
}

function collectDisplayOnly(section: string): string[] {
  const match =
    section.match(/DISPLAY_ONLY_TIMESTAMPS[\s\S]*?sync-decision comparison: ([\s\S]*?\)); a sync-decision read/) ??
    section.match(/DISPLAY_ONLY_TIMESTAMPS[\s\S]*?\n([\s\S]*?)\n\s+\*\*Out-of-scope timestamps/);
  if (!match?.[1]) throw new Error("Could not find DISPLAY_ONLY_TIMESTAMPS prose");
  return collectBacktickSymbols(match[1]);
}

function collectBannedCombos(text: string): string[][] {
  const comboBlock = text.match(/const BANNED_COMBOS[\s\S]*?=\s*\[([\s\S]*?)\];/);
  if (comboBlock?.[1]) {
    return Array.from(comboBlock[1].matchAll(/\[([^\]]+)\]/g), (match) =>
      Array.from(match[1]!.matchAll(/'([^']+)'|"([^"]+)"/g), (part) => part[1] ?? part[2]).filter(
        (token): token is string => Boolean(token),
      ),
    ).filter((combo) => combo.length > 0);
  }
  const shapeFamilies = [
    "last watermark",
    "global watermark",
    "last cursor",
    "global cursor",
    "last poll",
    "last sync at",
    "last run",
    "last processed",
    "watermark at",
    "cursor at",
    "app watermark",
    "app cursor",
  ];
  return shapeFamilies.map((combo) => combo.split(" "));
}

export function extractWatermarkSymbolsFromSpec(text: string): WatermarkSymbols {
  const section = sectionAround(text, "AC-X.4");
  return {
    authoritativeGatingWatermarks: collectAuthoritative(section, text),
    displayOnlyTimestamps: collectDisplayOnly(section),
    syncEntryPoints: collectSyncEntryPoints(section),
    bannedCombos: collectBannedCombos(text),
  };
}

function renderSet(name: string, values: readonly string[]): string {
  const rows = values.map((value) => `  ${JSON.stringify(value)},`).join("\n");
  return `export const ${name}: ReadonlySet<string> = new Set([\n${rows}\n] as const);\n`;
}

function renderCombos(values: readonly (readonly string[])[]): string {
  const rows = values
    .map((combo) => `  [${combo.map((token) => JSON.stringify(token)).join(", ")}],`)
    .join("\n");
  return `export const BANNED_COMBOS: readonly (readonly string[])[] = [\n${rows}\n] as const;\n`;
}

function render(symbols: WatermarkSymbols): string {
  return [
    "// @generated by scripts/extract-watermark-symbols.ts; do not edit.",
    "// Source: docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md §17.2 AC-X.4.",
    `// Counts: ${symbols.authoritativeGatingWatermarks.length} gating watermarks; ${symbols.displayOnlyTimestamps.length} display-only timestamps; ${symbols.syncEntryPoints.length} sync entry points.`,
    renderSet("AUTHORITATIVE_GATING_WATERMARKS", symbols.authoritativeGatingWatermarks),
    renderSet("DISPLAY_ONLY_TIMESTAMPS", symbols.displayOnlyTimestamps),
    renderSet("SYNC_ENTRY_POINTS", symbols.syncEntryPoints),
    renderCombos(symbols.bannedCombos),
    "",
  ].join("\n");
}

function main(): void {
  const spec = readFileSync(SPEC_PATH, "utf8");
  writeFileSync(OUT_PATH, render(extractWatermarkSymbolsFromSpec(spec)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
