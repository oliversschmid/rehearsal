"use client";
import Link from "next/link";
import type { Opportunity } from "@/lib/types";

export function TopOpportunityBlock({
  campaignId,
  opportunity,
  totalCount,
}: {
  campaignId: string;
  opportunity: Opportunity;
  totalCount: number;
}) {
  return (
    <div className="card p-4">
      <div className="text-[10.5px] uppercase tracking-wider text-[var(--muted)] font-medium">
        Top opportunity
      </div>
      <div className="mt-2 text-[13px] font-medium leading-snug">
        {opportunity.title}
      </div>
      <div className="mt-1 text-[11.5px] text-[var(--muted)] leading-snug line-clamp-3">
        {opportunity.why}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="chip !text-[10.5px]">{opportunity.type}</span>
        <span className="chip chip-accent !text-[10.5px]">
          +{opportunity.impactRange[0]}–{opportunity.impactRange[1]}
        </span>
      </div>
      {totalCount > 1 && (
        <Link
          href={`/campaigns/${campaignId}?view=rehearsal`}
          className="mt-2.5 inline-flex items-center gap-1 text-[11.5px] text-[var(--accent)] hover:underline"
        >
          All opportunities ({totalCount}) →
        </Link>
      )}
    </div>
  );
}
