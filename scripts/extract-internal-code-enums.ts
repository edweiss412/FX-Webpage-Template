import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { Project } from "ts-morph";

import { walkSourceFiles } from "@/lib/messages/__internal__/walkSourceFiles";
import { stripLogEmissionCalls } from "@/lib/messages/__internal__/stripLogEmissionCalls";
import {
  scanParseWarningSites,
  type SiteScan,
} from "@/lib/messages/__internal__/parseWarningSites";

export type InternalCodeEnumPayload = {
  source: string;
};

export type InternalCodeEnums = Record<string, InternalCodeEnumPayload>;

const OUTPUT_PATH = "lib/messages/__generated__/internal-code-enums.ts";
const CODE_RE = /^[A-Z][A-Za-z0-9_-]*(?:_[A-Za-z0-9_-]+)+$/;
const CODE_LITERAL_RE = /["'`]([A-Z][A-Za-z0-9_-]*(?:_[A-Za-z0-9_-]+)+)["'`]/g;
const CODE_PROPERTY_RE = /\bcode\s*:\s*["'`]([A-Z][A-Za-z0-9_-]*(?:_[A-Za-z0-9_-]+)+)["'`]/g;
const CONST_CODE_RE =
  /\b(?:export\s+)?const\s+[A-Z][A-Z0-9_]*\s*=\s*["'`]([A-Z][A-Za-z0-9_-]*(?:_[A-Za-z0-9_-]+)+)["'`]/g;
const FAILED_CODES_PUSH_RE =
  /\bfailedCodes\.push\(\s*["'`]([A-Z][A-Za-z0-9_-]*(?:_[A-Za-z0-9_-]+)+)["'`]\s*\)/g;
const LAST_SYNC_STATUS_VALUES = new Set([
  "ok",
  "drive_error",
  "sheet_unavailable",
  "parse_error",
  "pending_review",
]);

/**
 * Scan roots for the parse-warning pass. `lib/dev/**` is excluded because the
 * attention-scenario gallery builds SYNTHETIC warnings and would otherwise define
 * its own universe — the self-justification tautology the ledger guard warns about.
 */
const WARNING_SCAN_EXCLUDED = /^(tests|docs|e2e|scripts|supabase|public|\.github)\//;
function inWarningScanRoots(rel: string): boolean {
  if (!/^(lib|app)\//.test(rel) || WARNING_SCAN_EXCLUDED.test(rel)) return false;
  return (
    !rel.startsWith("lib/dev/") &&
    !rel.startsWith("lib/messages/__generated__/") &&
    rel !== "lib/messages/catalog.ts"
  );
}

/**
 * Memoized: loading the ts-morph project costs ~39s and the scan ~65s end-to-end,
 * so a process pays once. Vitest runs each test FILE in its own worker process
 * here, so a module-scope memo cannot be shared across files — which is why
 * exactly ONE test file performs a fresh extraction (spec §3.5).
 */
let warningScan: SiteScan | null = null;
let injectedProject: Project | null = null;

/**
 * Share an already-loaded ts-morph project. The guard test builds one for its own
 * wider production-tree scan; without this it would load a SECOND project and pay
 * the ~39s twice in the one file that is meant to be the suite's single extractor.
 */
export function shareProjectForWarningScan(project: Project): void {
  injectedProject = project;
  warningScan = null;
}

function scanWarningSites(): SiteScan {
  if (warningScan) return warningScan;
  const project = injectedProject ?? new Project({ tsConfigFilePath: "tsconfig.json" });
  warningScan = scanParseWarningSites(project, { include: inWarningScanRoots });
  return warningScan;
}

/** Sites whose code the checker could not resolve — surfaced, never dropped. */
export function unresolvedParseWarningSites(): string[] {
  return scanWarningSites().signalled;
}

function add(out: Map<string, Set<string>>, code: string, source: string): void {
  if (!code) return;
  const sources = out.get(code) ?? new Set<string>();
  sources.add(source);
  out.set(code, sources);
}

function addCodeLiteralsFromSource(
  out: Map<string, Set<string>>,
  sourceText: string,
  provenance: string,
  regex = CODE_LITERAL_RE,
): void {
  // Exclude lib/log emission codes: `log.*({ code: "X" })` is a free-form
  // forensic app_events code, not a persisted/user-facing internal-code-enum.
  const scannable = stripLogEmissionCalls(sourceText);
  for (const match of scannable.matchAll(regex)) {
    const code = match[1];
    if (code && CODE_RE.test(code)) add(out, code, provenance);
  }
}

function readFiles(roots: readonly string[]): Array<{ path: string; source: string }> {
  return walkSourceFiles(roots)
    .filter((path) => !path.startsWith("lib/messages/__generated__/"))
    .filter((path) => path !== "lib/messages/catalog.ts")
    .map((path) => ({ path, source: readFileSync(path, "utf8") }));
}

function stableObjectLiteral(entries: InternalCodeEnums): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))),
    null,
    2,
  ).replace(/"([A-Za-z_$][A-Za-z0-9_$]*)":/g, "$1:");
}

export function extractInternalCodeEnums(): InternalCodeEnums {
  const out = new Map<string, Set<string>>();

  // parse_warnings.code is recognized by TYPE, not by spelling: every syntactic
  // mechanism was refuted by probe, and matching factories by their written return
  // type missed `warning(): Phase2Args["parseResult"]["warnings"][number]` entirely,
  // leaving 11 real §12.4 codes dark. See lib/messages/__internal__/parseWarningSites.ts
  // and spec 2026-08-03-scanner-precision-cluster-design.md §3.1.
  for (const [code] of scanWarningSites().codes) add(out, code, "parse_warnings.code");

  for (const { source } of readFiles(["supabase/migrations", "lib/sync", "app/api"])) {
    for (const status of LAST_SYNC_STATUS_VALUES) {
      if (source.includes(status)) add(out, status, "shows.last_sync_status");
    }
  }

  for (const { source } of readFiles([
    "lib/parser",
    "lib/sync",
    "lib/onboarding",
    "app/api/admin",
  ])) {
    if (
      /\blast_error_code\b|hardErrors|pending_ingestions|still_failed|staged_parse/i.test(source)
    ) {
      addCodeLiteralsFromSource(
        out,
        source,
        "pending_ingestions.last_error_code",
        CODE_PROPERTY_RE,
      );
      addCodeLiteralsFromSource(
        out,
        source,
        "pending_ingestions.last_error_code",
        FAILED_CODES_PUSH_RE,
      );
      addCodeLiteralsFromSource(out, source, "pending_ingestions.last_error_code", CONST_CODE_RE);
    }
  }

  for (const { source } of readFiles(["lib", "app/api"])) {
    if (/\badmin_alerts?\b|upsertAdminAlert|upsert_admin_alert/i.test(source)) {
      addCodeLiteralsFromSource(out, source, "admin_alerts.code", CODE_PROPERTY_RE);
      addCodeLiteralsFromSource(out, source, "admin_alerts.code", CONST_CODE_RE);
    }
  }

  return Object.fromEntries(
    [...out.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, sources]) => [code, { source: [...sources].sort().join(",") }]),
  );
}

export function renderInternalCodeEnums(entries: InternalCodeEnums): string {
  return [
    "// Generated by scripts/extract-internal-code-enums.ts. Do not edit by hand.",
    "",
    "export type InternalCodeEnumPayload = {",
    "  source: string;",
    "};",
    "",
    `export const INTERNAL_CODE_ENUMS = ${stableObjectLiteral(entries)} as const satisfies Record<string, InternalCodeEnumPayload>;`,
    "",
    "export type InternalCodeEnum = keyof typeof INTERNAL_CODE_ENUMS;",
    "",
  ].join("\n");
}

export function writeInternalCodeEnums(outputPath = OUTPUT_PATH): void {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, renderInternalCodeEnums(extractInternalCodeEnums()));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeInternalCodeEnums();
}
