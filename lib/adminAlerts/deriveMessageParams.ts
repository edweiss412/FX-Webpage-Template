/**
 * Read-time message params for alert copy templates (spec
 * docs/superpowers/specs/2026-07-17-condensed-alert-copy-design.md §4.1).
 *
 * Merges the row's raw producer context (scalars only — interpolate() ignores
 * non-scalars) with params derived from the ALREADY-RESOLVED identity, so
 * catalog dougFacing templates can name the sheet/show inline. Every derived
 * key always resolves (fallback phrases), so converted codes never leak a
 * literal <placeholder>; the render-site unresolved-placeholder guard stays as
 * defense-in-depth only. Derived keys override context keys on collision (a
 * producer bag can never spoof the resolved identity). Pure — no I/O.
 */
import type { MessageParams } from "@/lib/messages/lookup";
import type { AlertIdentity } from "@/lib/adminAlerts/identityTypes";

const LEAD_HINT = " Lead changes must be confirmed in the show page.";
const ROLE_CHANGES_FALLBACK = "a crew member's role flags changed — see the show page.";
const CHANGE_LINE_CAP = 3;

type RoleChange = { crew_name: string; prior_flags: string[]; new_flags: string[] };

function segmentValue(identity: AlertIdentity | null, label: string): string | null {
  const seg = identity?.segments.find((s) => s.label === label);
  return seg && seg.value ? seg.value : null;
}

function quoted(value: string | null, fallback: string): string {
  return value ? `'${value}'` : fallback;
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
  params["sheet-name"] = quoted(segmentValue(identity, "Sheet"), "this sheet");
  params["show-name"] = quoted(segmentValue(identity, "Show"), "this show");
  if (code === "ROLE_FLAGS_NOTICE") {
    const changes = parseChanges(context);
    params["role-changes"] = roleChangesParam(changes);
    params["lead-hint"] = leadHintParam(changes);
  }
  return params as MessageParams;
}
