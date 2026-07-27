"use client";
import type { RehearsalResult, Campaign } from "@/lib/types";
import { useRail } from "../RailContext";

/**
 * Three states:
 *   1. never rehearsed → prompt with "Rehearse" CTA
 *   2. rehearsed & fresh → score + risk count + exclusion count summary
 *   3. rehearsed & stale (content changed since last run) → amber banner with Re-run
 *
 * The stale banner is the ONLY re-run control app-wide.
 */
export function VerdictBlock({
  campaign,
  rehearsal,
  onRehearse,
}: {
  campaign: Campaign;
  rehearsal: RehearsalResult | null;
  onRehearse: () => void;
}) {
  const { stale } = useRail();

  if (!rehearsal) {
    return (
      <div className="card p-4">
        <div className="text-[10.5px] uppercase tracking-wider text-[var(--muted)] font-medium">
          Rehearsal verdict
        </div>
        <div className="text-[12.5px] text-[var(--muted)] mt-1 leading-relaxed">
          Never rehearsed. Run against the simulated audience to get a score,
          risks, and opportunities.
        </div>
        <button
          className="btn btn-primary w-full mt-3 !py-1.5 text-[12.5px]"
          onClick={onRehearse}
        >
          Rehearse
        </button>
      </div>
    );
  }

  const score = rehearsal.verdict.score;
  const riskCount = rehearsal.riskFlags.length;
  const exclusionCount = (campaign.exclusions?.length ?? 0) + rehearsal.suppressions.length;
  const bandColor =
    score >= 70 ? "var(--success)" : score >= 50 ? "var(--accent)" : score >= 30 ? "var(--warn)" : "var(--danger)";

  return (
    <div className="space-y-3">
      {stale.stale && (
        <div
          className="rounded-lg p-3 border flex items-center justify-between gap-3"
          style={{
            background: "var(--warn-soft)",
            borderColor: "color-mix(in oklab, var(--warn) 25%, white)",
          }}
        >
          <div className="text-[12px] text-[var(--warn)] leading-snug">
            Content changed since last rehearsal
          </div>
          <button
            className="btn btn-primary !py-1 !px-2.5 text-[11.5px] shrink-0"
            onClick={onRehearse}
          >
            Re-run
          </button>
        </div>
      )}
      <div className="card p-4">
        <div className="text-[10.5px] uppercase tracking-wider text-[var(--muted)] font-medium">
          Rehearsal verdict
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span
            className="text-[28px] font-semibold tabular-nums tracking-tight leading-none"
            style={{ color: bandColor }}
          >
            {score}
          </span>
          <span className="text-[11px] text-[var(--muted)]">/100</span>
          <span className="ml-auto text-[11px] text-[var(--muted)] truncate" title={rehearsal.verdict.band.label}>
            {rehearsal.verdict.band.label.split(" — ")[0]}
          </span>
        </div>
        <p className="text-[12px] text-[var(--foreground)] mt-2 leading-snug line-clamp-3">
          {rehearsal.verdict.driver}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <span className={`chip !text-[10.5px] ${riskCount > 0 ? "chip-warn" : ""}`}>
            {riskCount} {riskCount === 1 ? "risk" : "risks"}
          </span>
          <span className="chip !text-[10.5px]">
            {exclusionCount} excluded
          </span>
        </div>
      </div>
    </div>
  );
}
