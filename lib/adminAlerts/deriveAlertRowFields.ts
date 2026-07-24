// The DB-independent tail of `fetchPerShowAlerts` (spec
// docs/superpowers/specs/2026-07-20-attention-scenario-gallery-design.md §3.3).
//
// `admin_alerts` stores only `id, code, context, raised_at, occurrence_count`.
// `identityText`, `messageParams`, and `crewName` are DERIVED from `context` plus
// a resolved `AlertIdentity`. The dev scenario gallery must render exactly what
// the production modal renders for the same row, so both call THIS function and
// the derivation cannot drift between them.
import { describeAlert } from "./describeAlert";
import { deriveAlertMessageParams } from "./deriveMessageParams";
import { projectIdentityContext } from "./projectIdentityContext";
import type { AlertIdentity } from "./identityTypes";
import type { MessageParams } from "@/lib/messages/lookup";

/**
 * §3.1a crewName rule. `projected` is the SAME sanitized projection the resolver
 * consumed (capped, control-char-stripped), never raw context; the segment
 * fallback reads the resolved identity's "Crew"-labeled segment.
 *
 * Moved verbatim from lib/adminAlerts/fetchPerShowAlerts.ts:58 so the two
 * consumers share one implementation.
 */
function crewNameFor(
  code: string,
  projected: ReturnType<typeof projectIdentityContext>,
  identity: AlertIdentity | undefined,
): string | null {
  if (code === "ROLE_FLAGS_NOTICE") {
    const names = projected.display.role_change_crew_names;
    if (projected.counts.role_change_count !== 1 || !names || names.length !== 1) return null;
    const name = names[0]!;
    return name.trim().length > 0 ? name : null;
  }
  const crewSegs = (identity?.segments ?? []).filter((s) => s.label === "Crew");
  if (crewSegs.length !== 1) return null;
  const value = crewSegs[0]!.value;
  return value.trim().length > 0 ? value : null;
}

// Same shape-validation the identity projection uses for resolution ids
// (lib/adminAlerts/projectIdentityContext.ts:16). crew_member_ids is never
// sanitized (the token redactor would corrupt a hex-run inside a UUID); it is
// shape-validated only.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * §6.2 crew-match derivation. For `AMBIGUOUS_EMAIL_BINDING` only, reads the
 * involved rows' DB ids from `context.crew_member_ids` (stored by
 * `upsertAmbiguousEmailAlert`, lib/auth/validateGoogleSession.ts:45), UUID-
 * validates each member, deduplicates (order-preserving), and carries
 * `expectedCount = crewMemberIds.length` post-dedup so the placement layer never
 * re-derives it. Any malformed/missing/empty/non-array/non-UUID member → the
 * whole match is rejected (undefined) and the banner stays section-top.
 */
function deriveCrewMatch(
  code: string,
  context: Record<string, unknown> | null,
): { crewMemberIds: string[]; expectedCount: number } | undefined {
  if (code !== "AMBIGUOUS_EMAIL_BINDING") return undefined;
  const raw = context?.crew_member_ids;
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string" || !UUID_RE.test(v)) return undefined;
    if (!seen.has(v)) {
      seen.add(v);
      ids.push(v);
    }
  }
  if (ids.length === 0) return undefined;
  return { crewMemberIds: ids, expectedCount: ids.length };
}

export type DerivedAlertRowFields = {
  identityText: string | null;
  messageParams: MessageParams;
  crewName: string | null;
  /** §6.2: id-matched crew fan-out target for `AMBIGUOUS_EMAIL_BINDING`. Optional,
   *  spread-inserted only when derived (exactOptionalPropertyTypes; absent == no
   *  match — there is no explicit null). */
  crewMatch?: { crewMemberIds: string[]; expectedCount: number };
};

export function deriveAlertRowFields(
  row: { code: string; context: Record<string, unknown> | null },
  identity: AlertIdentity | undefined,
): DerivedAlertRowFields {
  const projected = projectIdentityContext(row.context, { includePii: true });
  const crewMatch = deriveCrewMatch(row.code, row.context);
  return {
    identityText: identity ? describeAlert(identity, { includePii: true }) : null,
    messageParams: deriveAlertMessageParams(row.code, row.context, identity ?? null, "show"),
    crewName: crewNameFor(row.code, projected, identity),
    ...(crewMatch ? { crewMatch } : {}),
  };
}
