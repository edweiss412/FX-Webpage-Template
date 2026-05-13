/**
 * components/shared/StaleFooter.tsx — crew-facing "as of" footer with
 * §12.4 catalog-bound copy. Spec §5.4 / AC-9.1.
 *
 * Branches on `last_sync_status` × age:
 *   - `drive_error`        → DRIVE_FETCH_FAILED (red, regardless of age)
 *   - `sheet_unavailable`  → SHEET_UNAVAILABLE (red, regardless of age)
 *   - `parse_error`        → PARSE_ERROR_LAST_GOOD (red, regardless of age)
 *   - `pending_review`     → age <6h: behaves like `ok`; age >6h: SYNC_DELAYED_SEVERE
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
import { formatRelative } from "@/lib/time/relative";

type StaleFooterProps = {
  lastSyncedAt: Date | string | null;
  lastSyncStatus: string | null | undefined;
  /** Override for deterministic testing; defaults to new Date() at render. */
  now?: Date;
};

type Tier = "subtle" | "subtle-dot" | "yellow" | "red";

const TIER_CLASS: Record<Tier, string> = {
  subtle: "text-muted",
  "subtle-dot": "text-muted",
  yellow: "text-warning",
  red: "text-critical",
};

function selectCodeAndTier(
  lastSyncStatus: string | null | undefined,
  ageMs: number,
): { code: MessageCode | null; tier: Tier } {
  if (lastSyncStatus === "drive_error") return { code: "DRIVE_FETCH_FAILED", tier: "red" };
  if (lastSyncStatus === "sheet_unavailable") return { code: "SHEET_UNAVAILABLE", tier: "red" };
  if (lastSyncStatus === "parse_error") return { code: "PARSE_ERROR_LAST_GOOD", tier: "red" };

  const hours = ageMs / 3_600_000;

  if (lastSyncStatus === "pending_review" && hours > 6) {
    return { code: "SYNC_DELAYED_SEVERE", tier: "red" };
  }

  // ok / pending / pending_review<=6h — fall through to age tiers
  const minutes = ageMs / 60_000;
  if (minutes < 10) return { code: null, tier: "subtle" };
  if (minutes < 60) return { code: null, tier: "subtle-dot" };
  if (hours <= 6) return { code: "SYNC_DELAYED_MODERATE", tier: "yellow" };
  return { code: "SYNC_DELAYED_SEVERE", tier: "red" };
}

export function StaleFooter({ lastSyncedAt, lastSyncStatus, now }: StaleFooterProps) {
  if (!lastSyncedAt) return null;

  const t = typeof lastSyncedAt === "string" ? new Date(lastSyncedAt) : lastSyncedAt;
  const currentNow = now ?? new Date();
  const ageMs = currentNow.getTime() - t.getTime();
  const relative = formatRelative(t, currentNow);
  const { code, tier } = selectCodeAndTier(lastSyncStatus, ageMs);

  if (!code) {
    return (
      <div
        data-testid="stale-footer"
        data-tier={tier}
        className={`text-xs ${TIER_CLASS[tier]} flex items-center gap-1.5`}
      >
        {tier === "subtle-dot" ? <span aria-hidden="true">·</span> : null}
        <span>Last synced {relative} ago</span>
      </div>
    );
  }

  const message = messageFor(code, { time: relative });
  const text = message.crewFacing ?? "";

  return (
    <div
      data-testid="stale-footer"
      data-tier={tier}
      data-code={code}
      className={`text-xs ${TIER_CLASS[tier]}`}
    >
      {text}
    </div>
  );
}
