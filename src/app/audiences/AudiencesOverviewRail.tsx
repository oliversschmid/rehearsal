"use client";
import { useMemo } from "react";
import { RailSlot } from "@/components/rail/RailContext";

type Totals = {
  realCustomers: number;
  simulatedTwins: number;
  realDelta14d: number;
  twinDelta14d: number;
  amplification: number;
  revenue90d: number;
};

export function AudiencesOverviewRail({
  totals,
  audienceBars,
}: {
  totals: Totals;
  audienceBars: { label: string; value: number; pct: number }[];
}) {
  const body = useMemo(
    () => (
      <>
        <div className="card p-3">
          <div className="text-[10.5px] uppercase tracking-wider text-[var(--muted)] font-medium mb-1.5">
            Totals
          </div>
          <ul className="divide-y divide-[var(--border)]">
            <TotalRow
              label="Real customers"
              value={totals.realCustomers.toLocaleString()}
              delta={totals.realDelta14d}
            />
            <TotalRow
              label="Simulated twins"
              value={totals.simulatedTwins.toLocaleString()}
              delta={totals.twinDelta14d}
              sub={`${totals.amplification.toFixed(1)}× amp`}
            />
            <TotalRow
              label="Est. revenue"
              value={`$${totals.revenue90d.toLocaleString()}`}
              sub="last 90 days"
            />
          </ul>
        </div>

        {audienceBars.length > 0 && (
          <div className="card p-3">
            <div className="text-[10.5px] uppercase tracking-wider text-[var(--muted)] font-medium mb-1.5">
              Audiences by size
            </div>
            <ul className="space-y-1">
              {audienceBars.map((b) => (
                <li key={b.label} className="py-0.5">
                  <div className="flex items-baseline justify-between gap-2 text-[11.5px] leading-tight">
                    <span className="text-[var(--foreground)] truncate">{b.label}</span>
                    <span className="text-[var(--muted)] tabular-nums shrink-0">
                      {b.value.toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-1 h-1 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full bg-[var(--foreground)]"
                      style={{ width: `${Math.max(2, b.pct)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </>
    ),
    [totals, audienceBars],
  );

  return (
    <RailSlot
      headerLabel="Simulated population"
      headerTitle="All audiences"
      hideDock
      body={body}
    />
  );
}

function TotalRow({
  label,
  value,
  delta,
  sub,
}: {
  label: string;
  value: string;
  delta?: number;
  sub?: string;
}) {
  return (
    <li className="py-2 first:pt-1 last:pb-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11.5px] text-[var(--muted)]">{label}</span>
        <span className="inline-flex items-baseline gap-1.5">
          <span className="tabular-nums text-[13.5px] font-semibold text-[var(--foreground)]">
            {value}
          </span>
          {delta !== undefined && delta !== 0 && (
            <span
              className={`text-[10px] tabular-nums font-medium ${
                delta > 0 ? "text-[var(--success)]" : "text-[var(--danger)]"
              }`}
            >
              {delta > 0 ? "+" : "−"}
              {Math.abs(delta).toLocaleString()}
            </span>
          )}
        </span>
      </div>
      {sub && (
        <div className="text-[10.5px] text-[var(--muted-2)] leading-tight mt-0.5">
          {sub}
        </div>
      )}
    </li>
  );
}
