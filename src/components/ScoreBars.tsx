"use client";

/**
 * Compact score visualization used in tables: five short colored dashes
 * followed by the score number. Color band mirrors ScoreBadge.
 */
export function ScoreBars({ value }: { value?: number | null }) {
  if (value == null) {
    return <span className="text-[var(--muted-2)] text-[12.5px] tabular-nums">—</span>;
  }
  // <50 red, 50–79 yellow, 80+ green
  const color =
    value >= 80 ? "#22c55e" : value >= 50 ? "#eab308" : "#ef4444";
  const dim = "#e5e7eb";
  const filled = Math.max(1, Math.min(5, Math.round(value / 20)));
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="inline-flex gap-[3px]">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="inline-block rounded-full"
            style={{
              width: 7,
              height: 3,
              background: i < filled ? color : dim,
            }}
          />
        ))}
      </span>
      <span className="tabular-nums text-[13px] font-medium text-[var(--foreground)]">
        {value}
      </span>
    </span>
  );
}
