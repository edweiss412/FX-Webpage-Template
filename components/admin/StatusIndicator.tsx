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

export function StatusIndicator({ status, label }: { status: StatusKind; label: string }) {
  const known: StatusKind = (STATUSES as readonly string[]).includes(status)
    ? (status as StatusKind)
    : "idle";

  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative inline-flex shrink-0">
        {known === "live" && (
          <span
            aria-hidden="true"
            className="absolute inline-flex size-full rounded-full bg-status-live opacity-60 animate-ping motion-reduce:hidden"
          />
        )}
        <span
          data-testid={`status-dot-${known}`}
          aria-hidden="true"
          className={`relative inline-block size-2 rounded-full ${DOT_BG[known]}`}
        />
      </span>
      <span className="text-sm text-text-subtle">{label}</span>
    </span>
  );
}
