// components/admin/telemetry/EventVolumeSparkline.tsx
//
// A tiny hourly-volume sparkline for the Events·24h stat card. Bars scale
// linearly to [3px, 22px] against the window's max (min 1, so an all-zero
// window renders a flat 3px baseline rather than collapsing). The last bar
// (the current, partial hour) is accented; the rest are neutral. Decorative
// granularity — a single role="img" summary label, no per-bar labels.

const MIN_H = 3;
const MAX_H = 22;

export function EventVolumeSparkline({ buckets }: { buckets: number[] }) {
  const max = Math.max(1, ...buckets);
  const last = buckets.length - 1;
  return (
    <span
      data-testid="event-sparkline"
      role="img"
      aria-label="Event volume over the last 24 hours"
      className="flex h-[22px] items-end gap-[2px]"
    >
      {buckets.map((v, i) => {
        const height = MIN_H + (Math.max(0, v) / max) * (MAX_H - MIN_H);
        return (
          <span
            key={i}
            data-bar
            className={`w-1 rounded-[1px] ${i === last ? "bg-accent" : "bg-border-strong"}`}
            style={{ height: `${height}px` }}
          />
        );
      })}
    </span>
  );
}
