"use client";
import Link from "next/link";
import type { ScorecardEntry } from "@/lib/types";
import { SlideOver } from "./SlideOver";

export function ScorecardSlideOver({
  data,
  onClose,
}: {
  data: { entries: ScorecardEntry[]; winRate: { correct: number; total: number; rate: number }; biasNote: string } | null;
  onClose: () => void;
}) {
  return (
    <SlideOver title="Scorecard" onClose={onClose}>
      {!data ? (
        <div className="text-sm text-[var(--muted)]">Loading…</div>
      ) : (
        <>
          <div className="card p-5 mb-5">
            <div className="text-[13px] text-[var(--muted)] mb-1">Rolling accuracy · last 30 days</div>
            <div className="text-3xl font-semibold tracking-tight">
              {data.winRate.correct}/{data.winRate.total} correct
              <span className="ml-3 text-lg text-[var(--muted)] font-normal">
                {Math.round(data.winRate.rate * 100)}%
              </span>
            </div>
            <p className="mt-3 text-[13px] text-[var(--warn)]">{data.biasNote}</p>
          </div>
          <h3 className="text-[11px] uppercase tracking-wider text-[var(--muted)] mb-2">Resolved predictions</h3>
          <div className="card divide-y divide-[var(--border)] overflow-hidden">
            {data.entries.map((e) => (
              <Link
                key={e.campaignId}
                href={`/campaigns/${e.campaignId}?view=report`}
                onClick={onClose}
                className="p-4 flex items-start gap-4 hover:bg-gray-50 transition-colors group"
              >
                <div className={`chip ${e.hit ? "chip-success" : "chip-danger"} shrink-0`}>
                  {e.hit ? "Hit" : "Miss"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate group-hover:text-[var(--accent)] transition-colors">{e.campaignName}</div>
                  <div className="text-[12px] text-[var(--muted)] mt-0.5">
                    Predicted: <span className="text-[var(--foreground)]">{e.predictedCall}</span>
                    <span className="mx-2">·</span>
                    Actual: <span className="text-[var(--foreground)]">{e.actualOutcome}</span>
                  </div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--muted-2)] group-hover:text-[var(--accent)] shrink-0 mt-1"><path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </Link>
            ))}
          </div>
          <p className="mt-4 text-[12px] text-[var(--muted-2)] leading-relaxed">
            Every row is one campaign&apos;s resolved prediction. Click any row to open its Report view. Track record feeds the autonomy policy — the agent&apos;s permissions scale with these hits.
          </p>
        </>
      )}
    </SlideOver>
  );
}
