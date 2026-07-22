// The catalog guard contract, as code (spec §3.6).
//
// Two review rounds reported "guards enumerated incompletely" against a prose
// table. A third prose enumeration would have failed the same way, so the rules
// live here: a malformed scenario is rejected by a test and never reaches either
// consumer. That is why §4 specifies rendering behavior rather than per-field
// malformed-input behavior - the malformed cases are unreachable by construction.
import { PARSE_FAILURE_ALLOWLIST } from "@/lib/messages/parseFailureReason";
import type { AttentionScenario, ScenarioAlertRow, ScenarioHoldRow } from "./types";

const ID_RE = /^[a-z0-9][a-z0-9-]{2,47}$/;
const CODE_RE = /^[A-Z][A-Z0-9_]*$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The reserved tag key materialize writes into admin_alerts.context (§5.1b). */
export const DEV_SCENARIO_TAG_KEY = "__devScenario";

const HOLD_DOMAINS = new Set(["crew_email", "crew_identity"]);
const DISPOSITIONS = new Set(["email_change", "rename", "removal"]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isBlank(v: unknown): boolean {
  return typeof v !== "string" || v.trim().length === 0;
}

function parsesAsDate(v: unknown): boolean {
  return typeof v === "string" && v.length > 0 && Number.isFinite(new Date(v).getTime());
}

function validateDisposition(v: unknown, where: string, out: string[]): void {
  if (!isPlainObject(v) || typeof v.disposition !== "string" || !DISPOSITIONS.has(v.disposition)) {
    out.push(`${where}: proposed_value must be a Disposition variant`);
    return;
  }
  if (v.disposition === "removal") return;
  // email_change and rename both require a non-blank name and a string|null email.
  if (isBlank(v.name)) out.push(`${where}: ${v.disposition} requires a non-blank name`);
  if (!(typeof v.email === "string" || v.email === null)) {
    out.push(`${where}: ${v.disposition} requires email as string or null`);
  }
}

/**
 * Per-code context contracts from §3.1. A code listed here that ships with `{}`
 * renders its degenerate form while the spec promises the bound state, so the
 * catalog is rejected rather than quietly showing the wrong card.
 */
function validateCodeContext(row: ScenarioAlertRow, where: string, out: string[]): void {
  const ctx = row.context;
  switch (row.code) {
    case "TILE_PROJECTION_FETCH_FAILED": {
      const keys = ctx.failedKeys;
      if (!Array.isArray(keys) || keys.length === 0 || !keys.every((k) => typeof k === "string")) {
        out.push(`${where}: TILE_PROJECTION_FETCH_FAILED requires context.failedKeys as string[]`);
      }
      return;
    }
    case "SHOW_FIRST_PUBLISHED": {
      const gaps = ctx.data_gaps;
      if (
        !isPlainObject(gaps) ||
        typeof gaps.total !== "number" ||
        gaps.total <= 0 ||
        !isPlainObject(gaps.classes)
      ) {
        out.push(
          `${where}: SHOW_FIRST_PUBLISHED requires context.data_gaps with total greater than 0`,
        );
      }
      return;
    }
    case "PARSE_ERROR_LAST_GOOD": {
      const code = ctx.error_code;
      if (typeof code !== "string" || !PARSE_FAILURE_ALLOWLIST.has(code)) {
        out.push(`${where}: PARSE_ERROR_LAST_GOOD requires an allowlisted context.error_code`);
      }
      return;
    }
    case "ROLE_FLAGS_NOTICE": {
      // crewNameFor reads the PROJECTED context, which derives both fields from
      // ctx.changes[].crew_name (lib/adminAlerts/projectIdentityContext.ts:88-97).
      const changes = ctx.changes;
      const named =
        Array.isArray(changes) &&
        changes.filter((c) => isPlainObject(c) && !isBlank(c.crew_name)).length;
      if (!Array.isArray(changes) || changes.length !== 1 || named !== 1) {
        out.push(`${where}: ROLE_FLAGS_NOTICE requires exactly one named context.changes entry`);
      }
      return;
    }
    case "AMBIGUOUS_EMAIL_BINDING":
    case "OAUTH_IDENTITY_CLAIMED": {
      if (typeof ctx.crew_member_id !== "string" || !UUID_RE.test(ctx.crew_member_id)) {
        out.push(`${where}: ${row.code} requires a UUID context.crew_member_id`);
      }
      const identity = row.galleryIdentity;
      const crewSegs =
        identity && Array.isArray(identity.segments)
          ? identity.segments.filter((s) => s.label === "Crew")
          : [];
      if (crewSegs.length !== 1) {
        out.push(`${where}: ${row.code} requires a galleryIdentity with exactly one Crew segment`);
      }
      return;
    }
    default:
      return;
  }
}

function validateAlert(row: ScenarioAlertRow, i: number, out: string[]): void {
  const where = `alerts[${i}]`;
  if (isBlank(row.code) || !CODE_RE.test(row.code)) out.push(`${where}: malformed code`);
  if (!isPlainObject(row.context)) {
    out.push(`${where}: context must be a plain object, never null or an array`);
  } else if (DEV_SCENARIO_TAG_KEY in row.context) {
    out.push(`${where}: context must not carry the reserved ${DEV_SCENARIO_TAG_KEY} key`);
  }
  if (!parsesAsDate(row.raised_at)) out.push(`${where}: raised_at must parse as a date`);
  if (!Number.isInteger(row.occurrence_count) || row.occurrence_count < 1) {
    out.push(`${where}: occurrence_count must be an integer of at least 1`);
  }
  if (row.galleryIdentity !== undefined && row.galleryIdentity !== null) {
    if (!isPlainObject(row.galleryIdentity) || !Array.isArray(row.galleryIdentity.segments)) {
      out.push(`${where}: galleryIdentity must be null, absent, or carry a segments array`);
    }
  }
  if (isPlainObject(row.context)) validateCodeContext(row, where, out);
}

function validateHold(row: ScenarioHoldRow, i: number, out: string[]): void {
  const where = `holds[${i}]`;
  if (!HOLD_DOMAINS.has(row.domain)) out.push(`${where}: domain outside the CHECK set`);
  if (row.kind !== "mi11_pending") out.push(`${where}: kind must be mi11_pending`);
  if (isBlank(row.entity_key)) out.push(`${where}: entity_key must be non-blank`);
  if (isBlank(row.drive_file_id)) out.push(`${where}: drive_file_id must be non-blank`);
  if (!isPlainObject(row.held_value)) out.push(`${where}: held_value must be a plain object`);
  if (!parsesAsDate(row.base_modified_time)) {
    out.push(`${where}: base_modified_time must parse as a date`);
  }
  validateDisposition(row.proposed_value, where, out);
  if (row.reservation_collisions !== undefined) {
    if (
      !Array.isArray(row.reservation_collisions) ||
      !row.reservation_collisions.every(
        (c) =>
          isPlainObject(c) &&
          typeof c.name === "string" &&
          (typeof c.email === "string" || c.email === null),
      )
    ) {
      out.push(`${where}: reservation_collisions entries must be { name, email|null }`);
    }
  }
}

/** Returns one message per violation; an empty array means the scenario is valid. */
export function validateScenario(s: AttentionScenario): string[] {
  const out: string[] = [];

  if (typeof s.id !== "string" || !ID_RE.test(s.id))
    out.push("id: must match ^[a-z0-9][a-z0-9-]{2,47}$");
  if (isBlank(s.label)) out.push("label: must be non-blank");
  if (s.tier !== 1 && s.tier !== 2 && s.tier !== 3) out.push("tier: must be 1, 2, or 3");

  // bucket and degraded are tier-2 only: predicates are functions and degraded is
  // a loader fault, so neither can be reproduced from stored rows (§5.0).
  if (s.bucket !== undefined) {
    if (s.tier !== 2) out.push("bucket: tier 2 only");
    else if (!isPlainObject(s.bucket)) out.push("bucket: must be an object of predicates");
  }
  if (s.degraded !== undefined) {
    if (s.tier !== 2) out.push("degraded: tier 2 only");
    else if (typeof s.degraded !== "boolean") out.push("degraded: must be a boolean");
  }
  if (s.feedTruncated !== undefined) {
    if (s.tier !== 2) out.push("feedTruncated: tier 2 only");
    else if (typeof s.feedTruncated !== "boolean") out.push("feedTruncated: must be boolean");
  }

  if (!Array.isArray(s.alerts)) out.push("alerts: must be an array");
  else {
    s.alerts.forEach((row, i) => validateAlert(row, i, out));
    const codes = s.alerts.map((r) => r.code);
    if (new Set(codes).size !== codes.length) {
      // admin_alerts carries a partial unique index on (show_id, code) where
      // resolved_at is null, so a duplicate would fail the insert at runtime.
      out.push("alerts: duplicate code within one scenario");
    }
  }

  if (!Array.isArray(s.holds)) out.push("holds: must be an array");
  else {
    s.holds.forEach((row, i) => validateHold(row, i, out));
    const keys = s.holds.map((h) => `${h.domain}:${h.entity_key}`);
    if (new Set(keys).size !== keys.length) {
      // sync_holds carries unique (show_id, domain, entity_key).
      out.push("holds: duplicate (domain, entity_key) within one scenario");
    }
  }

  if (s.warnings !== undefined) {
    if (!Array.isArray(s.warnings)) out.push("warnings: must be an array when present");
    else {
      s.warnings.forEach((w, i) => {
        const where = `warnings[${i}]`;
        if (isBlank(w.code)) out.push(`${where}: code must be non-blank`);
        if (w.severity !== "warn") out.push(`${where}: severity must be warn`);
        if (isBlank(w.message)) out.push(`${where}: message must be non-blank`);
        // Warnings materialize VERBATIM, so a code embedded in the message
        // reaches the real modal and escapes the §1.1 exception scope.
        if (!isBlank(w.code) && !isBlank(w.message) && w.message.includes(w.code)) {
          out.push(`${where}: message must not contain its own code`);
        }
      });
    }
  }

  return out;
}
