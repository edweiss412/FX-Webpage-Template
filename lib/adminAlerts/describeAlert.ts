// Plain-text formatter for a resolved `AlertIdentity` (spec §3.3). Pure —
// no DB access, no I/O. Consumes the output of `resolveAlertIdentities`.
import type { AlertIdentity } from "./identityTypes";

export function describeAlert(
  identity: AlertIdentity,
  opts: { includePii?: boolean } = {},
): string | null {
  const includePii = opts.includePii ?? true;
  if (identity.global) return null;

  const parts = identity.segments
    .filter((segment) => includePii || !segment.pii)
    .map((segment) => (segment.label ? `${segment.label}: ${segment.value}` : segment.value))
    .filter((text) => text.length > 0);

  return parts.length > 0 ? parts.join(" · ") : null;
}
