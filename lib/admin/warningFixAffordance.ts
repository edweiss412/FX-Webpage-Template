import { deriveUseRawControlState } from "@/components/admin/UseRawControl";
import type { ParseWarning } from "@/lib/parser/types";
import type { UseRawDecision } from "@/lib/sync/useRawOverlay";

/**
 * Whether the SOLE actionable site (WarningsBreakdown) would render an
 * interactive fix control for this warning — used to pick the callout jump
 * label ("Fix in Parse warnings" vs "Review in Parse warnings").
 *
 * Drift-proof: the use-raw branch reuses the SAME `deriveUseRawControlState`
 * the control renders from (no duplicated IN_SCOPE set); the role branch
 * mirrors `RoleRecognizeControlBoundary`'s `token.length === 0 → null` gate.
 * `tests/admin/warningFixAffordance.test.tsx` pins both to the live gates.
 */
export function warningOffersFix(
  warning: Pick<ParseWarning, "code" | "resolution" | "roleToken">,
  decision: UseRawDecision | undefined,
): boolean {
  if (warning.code === "UNKNOWN_ROLE_TOKEN" && (warning.roleToken ?? "").trim().length > 0) {
    return true;
  }
  const state = deriveUseRawControlState(warning, decision, false);
  return state !== null && state !== "legacy-unavailable" && state !== "disabled";
}
