// M12.2 Phase A Task 4 — StatStrip (spec §5.1). Four tokenized stat cells:
// Active shows / Live now / Need review / Crew. Equal-height row (Tailwind v4
// items-stretch is NOT default — DESIGN §7, so the row sets items-stretch and
// each cell h-full). Every number is tabular-nums. The live dot shows only when
// liveCount>0; the Need-review number tints status-review only when >0. When
// statsScope==='shown' (overflow, unreachable at FXAV scale) the Live + Crew
// labels are qualified as not-global so a truncated read never reads as global.
import { StatusIndicator } from "@/components/admin/StatusIndicator";

type StatStripProps = {
  activeCount: number;
  liveCount: number;
  needReviewCount: number;
  crewTotal: number;
  statsScope: "global" | "shown";
};

function finite(v: number): number {
  return Number.isFinite(v) ? v : 0;
}

function StatCell({
  testid,
  label,
  value,
  valueTestid,
  valueClassName = "text-text-strong",
  children,
}: {
  testid: string;
  label: string;
  value: number;
  valueTestid: string;
  valueClassName?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      data-testid={testid}
      className="flex h-full flex-col gap-0.5 rounded-md border border-border bg-surface p-4 shadow-tile"
    >
      <div className="flex items-center gap-2">
        <span
          data-testid={valueTestid}
          className={`text-2xl font-bold tabular-nums ${valueClassName}`}
        >
          {finite(value)}
        </span>
        {children}
      </div>
      <span className="text-xs font-medium uppercase text-text-subtle" style={{ letterSpacing: "var(--tracking-eyebrow)" }}>
        {label}
      </span>
    </div>
  );
}

export function StatStrip({
  activeCount,
  liveCount,
  needReviewCount,
  crewTotal,
  statsScope,
}: StatStripProps) {
  const shown = statsScope === "shown";
  const live = finite(liveCount);
  const review = finite(needReviewCount);

  const liveLabel = shown ? "Live now across the shown shows" : "Live now";
  const crewLabel = shown ? "Crew across the shown shows" : "Crew across all shows";

  return (
    <div
      data-testid="stat-strip"
      className="grid grid-cols-2 items-stretch gap-tile-gap sm:grid-cols-4"
    >
      <StatCell
        testid="stat-cell-active"
        valueTestid="stat-value-active"
        label="Active shows"
        value={activeCount}
      />
      <StatCell
        testid="stat-cell-live"
        valueTestid="stat-value-live"
        label={liveLabel}
        value={live}
      >
        {live > 0 && (
          <span data-testid="stat-live-dot" className="inline-flex">
            <StatusIndicator status="live" label="" />
          </span>
        )}
      </StatCell>
      <StatCell
        testid="stat-cell-review"
        valueTestid="stat-value-review"
        label="Need review"
        value={review}
        valueClassName={review > 0 ? "text-status-review-text" : "text-text-strong"}
      />
      <StatCell
        testid="stat-cell-crew"
        valueTestid="stat-value-crew"
        label={crewLabel}
        value={crewTotal}
      />
    </div>
  );
}
