"use client";

export type StatRow = { label: string; value: string; sub?: string };

export function SegmentStatsBlock({
  realCustomers,
  simulatedTwins,
}: {
  realCustomers: { headline: string; deltaLabel?: string; rows: StatRow[] };
  simulatedTwins: { headline: string; deltaLabel?: string; rows: StatRow[] };
}) {
  return (
    <>
      <StatCard
        title="Real customers"
        headline={realCustomers.headline}
        deltaLabel={realCustomers.deltaLabel}
        rows={realCustomers.rows}
      />
      <StatCard
        title="Simulated twins"
        headline={simulatedTwins.headline}
        deltaLabel={simulatedTwins.deltaLabel}
        rows={simulatedTwins.rows}
      />
    </>
  );
}

function StatCard({
  title,
  headline,
  deltaLabel,
  rows,
}: {
  title: string;
  headline: string;
  deltaLabel?: string;
  rows: StatRow[];
}) {
  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between">
        <div className="text-[10.5px] uppercase tracking-wider text-[var(--muted)] font-medium">
          {title}
        </div>
        {deltaLabel && (
          <span className="text-[10.5px] text-[var(--muted-2)] tabular-nums">{deltaLabel}</span>
        )}
      </div>
      <div className="mt-1 text-[22px] font-semibold tabular-nums leading-none">{headline}</div>
      <ul className="mt-3 space-y-1.5 text-[12.5px]">
        {rows.map((r) => (
          <li key={r.label} className="flex justify-between items-baseline gap-3">
            <span className="text-[var(--muted)] truncate">{r.label}</span>
            <span className="text-right shrink-0">
              <b className="tabular-nums">{r.value}</b>
              {r.sub && (
                <span className="block text-[10.5px] text-[var(--muted-2)]">{r.sub}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
