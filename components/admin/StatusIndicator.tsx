// M12.2 Phase A — StatusIndicator (DESIGN.md §1.3 status-signal hues).
//
// A dot + text pair for sync / health / review state on the admin dashboard
// and per-show page. Color is ALWAYS paired with the text label (never
// color-only) — the §1 color-blind floor. Hues come from the @theme status
// tokens via Tailwind utilities; no inline hex/px (token discipline §10).
//
// The `live` variant adds a CSS ping behind the dot, disabled under
// prefers-reduced-motion (`motion-reduce:hidden`). An out-of-set status
// string defensively falls back to `idle` so a partial-render value can
// never crash the component.
//
// `pulse` is an OPT-IN subtle "heartbeat" halo behind the POSITIVE (synced)
// dot only — used by the sync-status surfaces (dashboard Sync column,
// per-show sync strip) to signal "healthy + actively being checked". It is
// deliberately slower/smaller than live's `animate-ping` (Model 1: synced
// pulses subtle, live pulses stronger) and hides under prefers-reduced-motion.
// It is a no-op on any non-positive status, so generic positive dots
// (Published pills, badges) never inherit it.

const STATUSES = ["live", "positive", "review", "warn", "idle"] as const;
export type StatusKind = (typeof STATUSES)[number];

// Literal class strings (not template-constructed) so Tailwind v4's content
// scan emits each utility into the built CSS.
const DOT_BG: Record<StatusKind, string> = {
  live: "bg-status-live",
  positive: "bg-status-positive",
  review: "bg-status-review",
  warn: "bg-status-warn",
  idle: "bg-status-idle",
};

// The bare status dot (no text). Color is health/state only; callers MUST pair it
// with a visible text label (the §1 color-blind floor) — StatusIndicator does this
// inline; the StatusStrip stacks the dot beside its own text lines.
export function StatusDot({ status, pulse = false }: { status: StatusKind; pulse?: boolean }) {
  const known: StatusKind = (STATUSES as readonly string[]).includes(status)
    ? (status as StatusKind)
    : "idle";

  return (
    <span className="relative inline-flex shrink-0">
      {known === "live" && (
        <span
          aria-hidden="true"
          className="absolute inline-flex size-full rounded-full bg-status-live opacity-60 animate-ping motion-reduce:hidden"
        />
      )}
      {known === "positive" && pulse && (
        // Subtle heartbeat: slower (2.8s) + smaller (scale 2) than live's ping, so
        // healthy-sync reads as "alive" without competing with the live signal.
        // Keyframe `sync-heartbeat` lives in globals.css; motion-reduce hides it.
        <span
          data-testid="status-pulse-positive"
          aria-hidden="true"
          className="absolute inline-flex size-full rounded-full bg-status-positive animate-[sync-heartbeat_2.8s_cubic-bezier(0,0,0.2,1)_infinite] motion-reduce:hidden"
        />
      )}
      <span
        data-testid={`status-dot-${known}`}
        aria-hidden="true"
        className={`relative inline-block size-2 rounded-full ${DOT_BG[known]}`}
      />
    </span>
  );
}

export function StatusIndicator({
  status,
  label,
  pulse = false,
}: {
  status: StatusKind;
  label: string;
  pulse?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <StatusDot status={status} pulse={pulse} />
      <span className="text-sm text-text-subtle">{label}</span>
    </span>
  );
}
