import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";

const SPEC_PATH = "docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md";
const PLAN_PATH = "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/11-cross-cutting.md";
const OUT_PATH = "lib/audit/email-boundaries.generated.ts";

export type EmailBoundary = {
  layer: string;
  path: string;
  boundaryCheck: string;
};

export type ExtractedEmailBoundaries = {
  specBoundaryKeys: string[];
  planBoundaryKeys: string[];
  planBoundaries: EmailBoundary[];
};

function normalizeCell(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalPath(cell: string): string {
  // Canonicalization rules normalize prose-only table cells to stable path keys:
  // prefer the first code span, collapse multi-file legacy cells to the primary
  // implementation path, and preserve AC-X.5 prose sentinels that have no file.
  if (cell.includes("any other") && cell.includes("admin_alerts.context")) {
    return "any other admin_alerts.context write that includes an email field";
  }
  if (cell.includes("RLS policies")) {
    return "RLS policies that compare auth.email to crew_members.email";
  }
  if (!cell.includes("lib/") && cell.includes("crew_members.email")) {
    return "crew_members.email, transportation.driver_email, transportation.loadout_email, contacts.email, client_contact.email JSONB extracted via CHECK if reachable";
  }
  const codeValues = Array.from(cell.matchAll(/`([^`]+)`/g), (match) => match[1] ?? "");
  if (codeValues.length === 0) return normalizeCell(cell);
  if (codeValues.length === 1) return codeValues[0]!;
  if (
    codeValues[0] === "lib/sync/discard.ts" &&
    codeValues[1] === "lib/admin/onboarding/pendingIngestionsActions.ts"
  ) {
    return "lib/sync/discard.ts";
  }
  if (codeValues[0] === "lib/auth/validateGoogleSession.ts" && cell.includes("WHERE email")) {
    return "lib/auth/validateGoogleSession.ts";
  }
  if (codeValues[0] === "lib/data/listShowsForCrew.ts") return "lib/data/listShowsForCrew.ts";
  return codeValues[0]!;
}

function splitMarkdownRow(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(normalizeCell);
}

export function extractPlanEmailBoundaries(plan: string): EmailBoundary[] {
  const start = plan.indexOf("### Task X.5: Email canonicalization");
  const end = plan.indexOf("### Task X.6:", start);
  if (start < 0 || end < 0) throw new Error("Could not find Task X.5 plan section");
  const section = plan.slice(start, end);
  const rows: EmailBoundary[] = [];
  for (const line of section.split(/\r?\n/)) {
    if (!line.trim().startsWith("|")) continue;
    if (line.includes("---") || line.includes("Layer")) continue;
    const cells = splitMarkdownRow(line);
    if (cells.length < 3) continue;
    const [layer, rawPath, boundaryCheck] = cells;
    if (!layer || !rawPath || !boundaryCheck) continue;
    rows.push({
      layer,
      path: canonicalPath(rawPath),
      boundaryCheck,
    });
  }
  return rows;
}

function key(layer: string, path: string): string {
  return `${layer}:${path}`;
}

function acX5Body(spec: string): string {
  const ac = spec.match(
    /AC-X\.5[\s\S]*?Plan Task X\.5's boundary list is the canonical inventory\./,
  );
  if (!ac?.[0]) throw new Error("Could not find AC-X.5 body in spec");
  return ac[0];
}

function expandCodespan(value: string): string[] {
  const brace = value.match(/^([a-z_][a-z0-9_]*)\.\{([^}]+)\}$/i);
  if (brace?.[1] && brace[2]) {
    return brace[2]
      .split(",")
      .map((part) => `${brace[1]}.${part.trim()}`)
      .filter(Boolean);
  }
  return [value];
}

function acX5Codespans(text: string): string[] {
  return Array.from(text.matchAll(/`([^`]+)`/g), (match) => match[1] ?? "")
    .flatMap(expandCodespan)
    .filter((value) => /[._/]/.test(value));
}

function unmatchedSpecBoundaryKey(token: string): string {
  if (token.includes("WHERE email")) return key("Read", token);
  return key("DB write", token);
}

export function extractSpecEmailBoundaryKeys(
  spec: string,
  planBoundaries: readonly EmailBoundary[] = [],
): string[] {
  const text = acX5Body(spec);
  for (const required of [
    "crew_members.email",
    "admin_alerts.context.*email*",
    "report_rate_limits.identity",
    "sync_audit.applied_by",
    "pending_syncs.wizard_approved_by_email",
    "shows_pending_changes.applied_by_email",
    "deferred_ingestions.deferred_by_email",
    "admin_alerts.resolved_by",
    "listShowsForCrew",
  ]) {
    if (!text.includes(required)) {
      throw new Error(`Could not find AC-X.5 spec boundary marker ${required}`);
    }
  }
  const tokens = acX5Codespans(text);
  const keys = new Set<string>();
  for (const token of tokens) {
    if (token === "crew_members.email") {
      keys.add(key("Parser write", "lib/parser/blocks/crew.ts"));
      keys.add(key("DB write", "lib/sync/applyParseResult.ts"));
      keys.add(key("Read", "lib/auth/validateGoogleSession.ts"));
      keys.add(key("Read", "RLS policies that compare auth.email to crew_members.email"));
      keys.add(
        key(
          "Schema",
          "crew_members.email, transportation.driver_email, transportation.loadout_email, contacts.email, client_contact.email JSONB extracted via CHECK if reachable",
        ),
      );
      continue;
    }
    if (token === "admin_alerts.context.*email*") {
      keys.add(key("DB write", "lib/auth/validateGoogleSession.ts"));
      keys.add(
        key("DB write", "any other admin_alerts.context write that includes an email field"),
      );
      continue;
    }
    if (token === "report_rate_limits.identity") {
      keys.add(key("DB write", "lib/reports/rateLimit.ts"));
      continue;
    }
    if (token === "sync_audit.applied_by") {
      keys.add(key("DB write", "lib/sync/applyStaged.ts"));
      continue;
    }
    if (token === "pending_syncs.wizard_approved_by_email") {
      keys.add(key("DB write", "lib/sync/applyStaged.ts"));
      continue;
    }
    if (token === "shows_pending_changes.applied_by_email") {
      keys.add(key("DB write", "app/api/admin/onboarding/finalize/route.ts"));
      continue;
    }
    if (token.startsWith("app_settings.")) {
      keys.add(key("DB write", "lib/admin/onboarding/finalize.ts"));
      continue;
    }
    if (token === "email_deliveries.recipient") {
      keys.add(key("DB write", "lib/notify/deliver.ts"));
      continue;
    }
    if (token === "deferred_ingestions.deferred_by_email") {
      keys.add(key("DB write", "lib/sync/discard.ts"));
      continue;
    }
    if (token === "admin_alerts.resolved_by") {
      keys.add(key("DB write", "lib/admin/alerts.ts"));
      continue;
    }
    if (token === "listShowsForCrew") {
      keys.add(key("Read", "lib/data/listShowsForCrew.ts"));
      continue;
    }
    if (/^[a-z_][a-z0-9_]*\.[a-z_*][a-z0-9_*]*$/i.test(token)) {
      keys.add(unmatchedSpecBoundaryKey(token));
    }
  }
  for (const boundary of planBoundaries) {
    const boundaryKey = key(boundary.layer, boundary.path);
    if (
      boundaryKey === key("Parser write", "lib/parser/blocks/client.ts") ||
      boundaryKey === key("Parser write", "lib/parser/blocks/transport.ts") ||
      boundaryKey === key("Parser write", "lib/parser/blocks/contacts.ts") ||
      boundary.path.includes("lib/reports/submit.ts") ||
      boundaryKey === key("Read", "lib/data/listShowsForCrew.ts")
    ) {
      keys.add(boundaryKey);
    }
  }
  return Array.from(keys).sort();
}

export function extractEmailBoundariesFromDocs(
  spec: string,
  plan: string,
): ExtractedEmailBoundaries {
  const planBoundaries = extractPlanEmailBoundaries(plan);
  return {
    specBoundaryKeys: extractSpecEmailBoundaryKeys(spec, planBoundaries),
    planBoundaryKeys: planBoundaries.map((boundary) => key(boundary.layer, boundary.path)),
    planBoundaries,
  };
}

function render(boundaries: readonly EmailBoundary[]): string {
  const rows = boundaries
    .map(
      (boundary) =>
        `  ${JSON.stringify({
          layer: boundary.layer,
          path: boundary.path,
          boundaryCheck: boundary.boundaryCheck,
        })},`,
    )
    .join("\n");
  return [
    "// @generated by scripts/extract-email-boundaries.ts; do not edit.",
    "// Source: spec §17.2 AC-X.5 + plan Task X.5 Step 1 boundary table.",
    `// Count: ${boundaries.length} boundaries.`,
    "export type EmailBoundary = { readonly layer: string; readonly path: string; readonly boundaryCheck: string };",
    "export const EMAIL_BOUNDARIES: readonly EmailBoundary[] = [",
    rows,
    "] as const;",
    "",
  ].join("\n");
}

function main(): void {
  const spec = readFileSync(SPEC_PATH, "utf8");
  const plan = readFileSync(PLAN_PATH, "utf8");
  const extracted = extractEmailBoundariesFromDocs(spec, plan);
  writeFileSync(OUT_PATH, render(extracted.planBoundaries));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
