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

export type DerivedAlertRowFields = {
  identityText: string | null;
  messageParams: MessageParams;
  crewName: string | null;
};

export function deriveAlertRowFields(
  row: { code: string; context: Record<string, unknown> | null },
  identity: AlertIdentity | undefined,
): DerivedAlertRowFields {
  const projected = projectIdentityContext(row.context, { includePii: true });
  return {
    identityText: identity ? describeAlert(identity, { includePii: true }) : null,
    messageParams: deriveAlertMessageParams(row.code, row.context, identity ?? null, "show"),
    crewName: crewNameFor(row.code, projected, identity),
  };
}
