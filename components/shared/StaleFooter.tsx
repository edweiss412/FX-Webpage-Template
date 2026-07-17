/**
 * components/shared/StaleFooter.tsx — crew-facing "as of" footer with
 * §12.4 catalog-bound copy. Spec §5.4 / AC-9.1; age tiers re-based onto
 * `last_checked_at` (last successful Drive check) per spec
 * 2026-07-16-last-checked-at §5.2 — an idle-but-healthy show reads calm.
 *
 * Branches on `last_sync_status` × age (age = time since last successful check):
 *   - `drive_error`        → DRIVE_FETCH_FAILED (red, regardless of age)
 *   - `sheet_unavailable`  → SHEET_UNAVAILABLE (red, regardless of age)
 *   - `parse_error`        → PARSE_ERROR_LAST_GOOD (red, regardless of age)
 *   - `pending_review` / `shrink_held` → fall through to the age ladder like
 *     `ok` (crew see valid last-good; the former >6h→SEVERE sub-clause is DROPPED
 *     because the tier now reflects check-freshness, not content age; audit #3)
 *   - `ok` / `pending`     → fall through to age tier ladder:
 *       <10 min:    subtle (no code)
 *       10 min-1h:  subtle + dot (no code)
 *       1h-6h:      yellow + SYNC_DELAYED_MODERATE
 *       >6h:        red + SYNC_DELAYED_SEVERE
 *
 * Catalog-bound: every code-driven branch routes through `messageFor` so
 * the §12.4 catalog is the only source of user-visible copy (invariant 5).
 *
 * Server Component (no 'use client').
 */
import { messageFor, type MessageCode } from "@/lib/messages/lookup";
import { renderCatalogEmphasis } from "@/components/messages/renderEmphasis";
import { formatRelative } from "@/lib/time/relative";

type StaleFooterProps = {
  /**
   * `shows.last_checked_at` — the last successful Drive check (spec
   * 2026-07-16-last-checked-at §5.2). Drives BOTH the "as-of" relative time and
   * the yellow/red tier, so an idle-but-healthy show (checked every 5 min,
   * content unchanged) reads calm, not "sync delayed".
   */
  lastCheckedAt: Date | string | null;
  lastSyncStatus: string | null | undefined;
  /**
   * Required as of M11 Phase C Task C.2 (AC-11.38). Every caller MUST pass
   * the current instant explicitly so the render is deterministic under
   * screenshot capture (`X-Screenshot-Frozen-Now` is honored by the
   * server-side `lib/time/now.ts` utility; callers thread the resolved
   * value here). Removing the previous `?? new Date()` default closes the
   * wall-clock-bound drift surface for catalogged stale-data copy.
   */
  now: Date;
};

type Tier = "subtle" | "subtle-dot" | "yellow" | "red";

// Tier styling — uses the project's existing token vocabulary
// (app/globals.css @theme). `text-text-subtle` and `text-warning-text` are
// the canonical neutral + amber tones; the project does not expose a
// dedicated "critical" red token today, so the red tier intensifies the
// warning tone with `font-medium`. If a future DESIGN.md amendment adds a
// danger/critical token, swap `red` to that token.
const TIER_CLASS: Record<Tier, string> = {
  subtle: "text-text-subtle",
  "subtle-dot": "text-text-subtle",
  yellow: "text-warning-text",
  red: "text-warning-text font-medium",
};

function selectCodeAndTier(
  lastSyncStatus: string | null | undefined,
  ageMs: number,
): { code: MessageCode | null; tier: Tier } {
  if (lastSyncStatus === "drive_error") return { code: "DRIVE_FETCH_FAILED", tier: "red" };
  if (lastSyncStatus === "sheet_unavailable") return { code: "SHEET_UNAVAILABLE", tier: "red" };
  if (lastSyncStatus === "parse_error") return { code: "PARSE_ERROR_LAST_GOOD", tier: "red" };

  const hours = ageMs / 3_600_000;

  // `pending_review` and `shrink_held` (re-sync quality gate, audit #3): crew see the valid
  // LAST-GOOD roster. The former ">6h escalates to SEVERE" sub-clause is DROPPED (spec
  // 2026-07-16-last-checked-at §5.2) — the tier is now driven by last_checked_at (age since the
  // last successful Drive CHECK), so a checked-recently show is not "delayed" regardless of status.
  // Both fall through to the age ladder exactly like `ok`/`pending`.
  const minutes = ageMs / 60_000;
  if (minutes < 10) return { code: null, tier: "subtle" };
  if (minutes < 60) return { code: null, tier: "subtle-dot" };
  if (hours <= 6) return { code: "SYNC_DELAYED_MODERATE", tier: "yellow" };
  return { code: "SYNC_DELAYED_SEVERE", tier: "red" };
}

export function StaleFooter({ lastCheckedAt, lastSyncStatus, now }: StaleFooterProps) {
  if (!lastCheckedAt) return null;

  const t = typeof lastCheckedAt === "string" ? new Date(lastCheckedAt) : lastCheckedAt;
  const ageMs = now.getTime() - t.getTime();
  const relative = formatRelative(t, now);
  const { code, tier } = selectCodeAndTier(lastSyncStatus, ageMs);

  if (!code) {
    return (
      <div
        data-testid="stale-footer"
        data-tier={tier}
        className={`text-xs ${TIER_CLASS[tier]} flex items-center gap-1.5`}
      >
        {tier === "subtle-dot" ? <span aria-hidden="true">·</span> : null}
        <span>Last checked {relative} ago</span>
      </div>
    );
  }

  // Raw template; the time value interpolates AFTER emphasis parsing so
  // it is inserted as opaque text (param-safe contract, Codex R1).
  const text = messageFor(code).crewFacing ?? "";

  return (
    <div
      data-testid="stale-footer"
      data-tier={tier}
      data-code={code}
      className={`text-xs ${TIER_CLASS[tier]}`}
    >
      {renderCatalogEmphasis(text, { time: relative })}
    </div>
  );
}
