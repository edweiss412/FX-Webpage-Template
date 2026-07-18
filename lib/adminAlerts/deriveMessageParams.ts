/**
 * Read-time message params for alert copy templates (spec
 * docs/superpowers/specs/2026-07-17-condensed-alert-copy-design.md §4.1).
 *
 * Merges the row's raw producer context (scalars only — interpolate() ignores
 * non-scalars) with params derived from the ALREADY-RESOLVED identity, so
 * catalog dougFacing templates can name the sheet/show inline. Every derived
 * key always resolves (fallback phrases), so converted codes never leak a
 * literal <placeholder>; the render-site unresolved-placeholder guard stays as
 * defense-in-depth only.
 *
 * Priority chain per param: identity-resolved value (rename-proof, preferred;
 * always wins over context when present — real anti-spoof) > context-derived
 * value (producer-supplied, read with the same hyphen/underscore
 * normalization `interpolate()` uses — see lib/messages/lookup.ts) > fallback
 * phrase. Fallback applies ONLY when neither identity nor context supplies
 * the value (Fix Round 1: identity resolving to null must NOT clobber a
 * context-supplied value — see tests/adminAlerts/deriveMessageParams.test.ts
 * and the SHEET_UNAVAILABLE regression in
 * tests/components/admin/perShowAlertInterpolation.test.tsx). Pure — no I/O.
 */
import type { MessageParams } from "@/lib/messages/lookup";
import type { AlertIdentity } from "@/lib/adminAlerts/identityTypes";
import { ALERT_IDENTITY_MAP } from "@/lib/adminAlerts/alertIdentityMap";

const LEAD_HINT = " Lead changes must be confirmed in the show page.";
const ROLE_CHANGES_FALLBACK = "a crew member's role flags changed — see the show page.";
const CHANGE_LINE_CAP = 3;

/**
 * The full set of identity-derived param tokens (spec
 * docs/superpowers/specs/2026-07-18-alert-copy-full-sweep-design.md §3):
 * every template placeholder whose value can be sourced from a resolved
 * `AlertIdentity` segment (directly, or via the identity-declared
 * contextField/count mapping below). Consumed by Task 5's token-inventory
 * meta-test so the two can't drift.
 */
export const IDENTITY_PARAM_TOKENS: ReadonlySet<string> = new Set([
  "sheet-name",
  "show-name",
  "repo",
  "file-name",
  "role-changes",
  "crew-name",
  "email",
  "crew-row-count",
  "failed-sheet-names",
]);

// count segments render as `${n} ${label}${plural}` (formatCount,
// resolveAlertIdentities.ts:118-125) — always label-less (kind-lossy).
function isNumericPhraseShape(value: string): boolean {
  return /^\d+\s/.test(value);
}

// email segments are always label-less (kind-lossy) — distinguish from a
// count segment's numeric-phrase shape by the `@` an email always carries.
function isEmailShape(value: string): boolean {
  return /@/.test(value);
}

// Per-code count/contextField SegmentSpec `key` -> the generic param it
// feeds. Deliberately sparse: only entries listed here contribute to a
// generic mapped param; every other count/contextField spec (e.g.
// ROLE_FLAGS_NOTICE's role_change_count / role_change_crew_names) is
// consumed by its own dedicated composition (roleChangesParam) and must NOT
// also populate crew-row-count/failed-sheet-names.
const COUNT_PARAM_BY_SPEC_KEY: Record<string, string> = {
  crew_member_count: "crew-row-count",
};
const CONTEXT_FIELD_PARAM_BY_SPEC_KEY: Record<string, string> = {
  failed_sheet_names: "failed-sheet-names",
};

type MappedIdentityParam = { value: string; pii: boolean };

// Ordered-walk-with-skips (spec §3): `resolveAlertIdentities` only PUSHES
// segments it could build, so an earlier absent segment (e.g. an
// unresolvable Show) shifts every later segment's array index down. A naive
// positional zip against the code's declared `SegmentSpec[]` would then pair
// specs with the wrong segments. Instead we walk the declared specs in
// order, keeping a cursor into `identity.segments`: a spec consumes the
// segment AT THE CURSOR only when it is kind-compatible (label match for
// labeled kinds; shape match for the label-lossy count/email kinds).  On a
// mismatch the spec's segment is treated as absent — the cursor does NOT
// advance — so a later spec still gets a chance to match once the missing
// segment's "slot" has been skipped.
function walkIdentitySegments(
  code: string,
  identity: AlertIdentity | null,
): Map<string, MappedIdentityParam> {
  const result = new Map<string, MappedIdentityParam>();
  if (!identity) return result;
  const entry = ALERT_IDENTITY_MAP[code];
  if (!entry || "kind" in entry) return result;

  let cursor = 0;
  for (const spec of entry.segments) {
    const seg = identity.segments[cursor];
    if (!seg) continue;
    switch (spec.kind) {
      case "sheetName":
        if (seg.label === "Sheet") cursor++;
        break;
      case "showName":
        if (seg.label === "Show") cursor++;
        break;
      case "crewName":
        if (seg.label === "Crew") {
          result.set("crew-name", { value: seg.value, pii: !!seg.pii });
          cursor++;
        }
        break;
      case "contextField":
        if (seg.label === spec.label) {
          const param = CONTEXT_FIELD_PARAM_BY_SPEC_KEY[spec.key];
          if (param) result.set(param, { value: seg.value, pii: !!seg.pii });
          cursor++;
        }
        break;
      case "count":
        if (seg.label === null && isNumericPhraseShape(seg.value)) {
          const param = COUNT_PARAM_BY_SPEC_KEY[spec.key];
          if (param) result.set(param, { value: seg.value, pii: !!seg.pii });
          cursor++;
        }
        break;
      case "email":
        if (seg.label === null && isEmailShape(seg.value)) {
          // Real email segments are always `pii: true` (resolveAlertIdentities.ts:302)
          // — the cursor still consumes the slot (so later specs stay
          // aligned), but a pii value is never recorded: raw email must
          // never surface through this prose-text channel, only through the
          // structured, includePii-gated identity JSON.
          if (!seg.pii) result.set("email", { value: seg.value, pii: false });
          cursor++;
        }
        break;
    }
  }
  return result;
}

type RoleChange = { crew_name: string; prior_flags: string[]; new_flags: string[] };

function segmentValue(identity: AlertIdentity | null, label: string): string | null {
  const seg = identity?.segments.find((s) => s.label === label);
  return seg && seg.value ? seg.value : null;
}

function quoted(value: string | null, fallback: string): string {
  return value ? `'${value}'` : fallback;
}

// Read a producer-supplied context value under either key form, mirroring
// interpolate()'s hyphen/underscore normalization (lib/messages/lookup.ts) so
// a producer that writes `sheet_name` satisfies the `sheet-name` param the
// same way it would satisfy a `<sheet-name>` template placeholder directly.
// Count-like context (e.g. SHOW_FIRST_PUBLISHED's crew_count,
// lib/sync/runScheduledCronSync.ts:2369) is written as a NUMBER by its
// producer, not a string — accept finite numbers too (coerced the same way
// interpolate() coerces them, via String(value)), while still rejecting
// null/undefined (already excluded by the params lookup), NaN/non-finite,
// and non-scalar values (booleans/objects never reach here as objects are
// dropped by the context-scalar filter in deriveAlertMessageParams).
function contextStringValue(
  params: Record<string, string | number | boolean | null | undefined>,
  hyphenKey: string,
): string | null {
  const underscoreKey = hyphenKey.replace(/-/g, "_");
  const value = params[hyphenKey] ?? params[underscoreKey];
  if (typeof value === "string" && value !== "") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

// Identity > context > fallback (see module docstring). Identity value is
// quoted for the "rename-proof" resolved-identity display convention;
// context value is used as the producer wrote it (unquoted — restores the
// pre-Task-8 raw-passthrough rendering for the context tier).
function resolveNamedParam(
  params: Record<string, string | number | boolean | null | undefined>,
  hyphenKey: string,
  identityValue: string | null,
  fallback: string,
): string {
  if (identityValue) return quoted(identityValue, fallback);
  return contextStringValue(params, hyphenKey) ?? fallback;
}

// Same identity > context > fallback chain as resolveNamedParam, but
// unquoted: counts are numeric phrases (not names), and email/failed-sheet-
// names are not "name-like" kinds either — quoting is reserved for
// sheetName/showName/crewName (spec §3).
function resolveUnquotedParam(
  params: Record<string, string | number | boolean | null | undefined>,
  hyphenKey: string,
  identityValue: string | null,
  fallback: string,
): string {
  if (identityValue) return identityValue;
  return contextStringValue(params, hyphenKey) ?? fallback;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function parseChanges(context: Record<string, unknown> | null): RoleChange[] {
  const raw = context?.changes;
  if (!Array.isArray(raw)) return [];
  const out: RoleChange[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.crew_name !== "string" || e.crew_name === "") continue;
    if (!isStringArray(e.prior_flags) || !isStringArray(e.new_flags)) continue;
    out.push({ crew_name: e.crew_name, prior_flags: e.prior_flags, new_flags: e.new_flags });
  }
  return out;
}

const fmt = (flags: string[]): string => flags.join(" + ");

function singleSentence(c: RoleChange): string {
  if (c.prior_flags.length === 0) return `${c.crew_name} was added with ${fmt(c.new_flags)}.`;
  if (c.new_flags.length === 0)
    return `${c.crew_name} (${fmt(c.prior_flags)}) was removed from the crew.`;
  return `${c.crew_name}'s role changed from ${fmt(c.prior_flags)} to ${fmt(c.new_flags)}.`;
}

function bulletLine(c: RoleChange): string {
  if (c.prior_flags.length === 0) return `• ${c.crew_name}: added with ${fmt(c.new_flags)}`;
  if (c.new_flags.length === 0) return `• ${c.crew_name}: ${fmt(c.prior_flags)} → (removed)`;
  return `• ${c.crew_name}: ${fmt(c.prior_flags)} → ${fmt(c.new_flags)}`;
}

function roleChangesParam(changes: RoleChange[]): string {
  if (changes.length === 0) return ROLE_CHANGES_FALLBACK;
  if (changes.length === 1) return singleSentence(changes[0]!);
  const lines = changes.slice(0, CHANGE_LINE_CAP).map(bulletLine);
  const overflow =
    changes.length > CHANGE_LINE_CAP
      ? [`+${changes.length - CHANGE_LINE_CAP} more — see show page.`]
      : [];
  return [`${changes.length} role changes:`, ...lines, ...overflow].join("\n");
}

function leadHintParam(changes: RoleChange[]): string {
  const leadDelta = changes.some(
    (c) => c.prior_flags.includes("LEAD") !== c.new_flags.includes("LEAD"),
  );
  return leadDelta ? LEAD_HINT : "";
}

export function deriveAlertMessageParams(
  code: string,
  context: Record<string, unknown> | null,
  identity: AlertIdentity | null,
): MessageParams {
  const params: Record<string, string | number | boolean | null | undefined> = {};
  for (const [key, value] of Object.entries(context ?? {})) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      params[key] = value;
    }
  }
  params["sheet-name"] = resolveNamedParam(
    params,
    "sheet-name",
    segmentValue(identity, "Sheet"),
    "this sheet",
  );
  params["show-name"] = resolveNamedParam(
    params,
    "show-name",
    segmentValue(identity, "Show"),
    "this show",
  );
  const mappedIdentityParams = walkIdentitySegments(code, identity);
  params["crew-name"] = resolveNamedParam(
    params,
    "crew-name",
    mappedIdentityParams.get("crew-name")?.value ?? null,
    "a crew member",
  );
  params["email"] = resolveUnquotedParam(
    params,
    "email",
    mappedIdentityParams.get("email")?.value ?? null,
    "an email address",
  );
  params["crew-row-count"] = resolveUnquotedParam(
    params,
    "crew-row-count",
    mappedIdentityParams.get("crew-row-count")?.value ?? null,
    "two or more crew rows",
  );
  params["failed-sheet-names"] = resolveUnquotedParam(
    params,
    "failed-sheet-names",
    mappedIdentityParams.get("failed-sheet-names")?.value ?? null,
    "some sheets",
  );
  // crew-count / show-date (SHOW_FIRST_PUBLISHED) have no identity segments
  // (spec §3) — plain context ?? fallback, same shape as repo/file_name below.
  params["crew-count"] = contextStringValue(params, "crew-count") ?? "some";
  params["show-date"] = contextStringValue(params, "show-date") ?? "an upcoming date";
  // repo / file_name / attempted_action are raw contextField-sourced
  // placeholders (spec §6): normally always present because their producers
  // write them at upsert time, but the telemetry health panel (Task 9, spec
  // §4.2) has no unresolved-placeholder guard (§4.3 is bell/per-show only)
  // — so, like sheet-name/show-name above, these must always resolve too,
  // never leak a literal <placeholder> when context is missing/null.
  if (code === "BRANCH_PROTECTION_DRIFT" || code === "BRANCH_PROTECTION_MONITOR_AUTH_FAILED") {
    params["repo"] = params["repo"] ?? "this repository";
  }
  if (code === "WIZARD_SESSION_SUPERSEDED_RACE") {
    params["file_name"] = params["file_name"] ?? "this sheet";
    params["attempted_action"] = params["attempted_action"] ?? "a setup action";
  }
  if (code === "ROLE_FLAGS_NOTICE") {
    const changes = parseChanges(context);
    params["role-changes"] = roleChangesParam(changes);
    params["lead-hint"] = leadHintParam(changes);
  }
  return params as MessageParams;
}
