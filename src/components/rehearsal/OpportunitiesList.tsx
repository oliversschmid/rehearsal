"use client";
import { useState } from "react";
import type { Opportunity, OpportunityType } from "@/lib/types";

/**
 * OpportunitiesList. Groups opportunities into Content (subject/copy/tone) and
 * Strategy (timing/exclusion) sub-sections. The rail's stale banner is the
 * only re-run control.
 */

const CONTENT_TYPES = new Set<OpportunityType>(["subject", "copy", "tone"]);
const STRATEGY_TYPES = new Set<OpportunityType>(["timing", "exclusion"]);

export function OpportunitiesList({
  opportunities,
  appliedIds,
  onApply,
}: {
  opportunities: Opportunity[];
  appliedIds: Set<string>;
  onApply: (id: string) => Promise<void>;
}) {
  const [applying, setApplying] = useState<string | null>(null);

  if (!opportunities.length) {
    return (
      <div className="card p-5">
        <div className="text-[11px] uppercase tracking-wider text-[var(--muted)] mb-2">Opportunities</div>
        <div className="text-sm text-[var(--muted)]">
          No improvements found — this campaign looks well-tuned for its audience.
        </div>
      </div>
    );
  }

  const content = opportunities.filter((o) => CONTENT_TYPES.has(o.type));
  const strategy = opportunities.filter((o) => STRATEGY_TYPES.has(o.type));

  return (
    <div className="card p-5">
      <div className="mb-3">
        <div className="text-[11px] uppercase tracking-wider text-[var(--muted)]">Opportunities</div>
        <div className="text-sm text-[var(--muted-2)]">
          Ranked by impact × confidence. Apply, then re-run from the rail.
        </div>
      </div>

      <div className="space-y-5">
        {content.length > 0 && (
          <Group
            title="Content opportunities"
            items={content}
            applying={applying}
            appliedIds={appliedIds}
            onApply={onApply}
            setApplying={setApplying}
          />
        )}
        {strategy.length > 0 && (
          <Group
            title="Strategy opportunities"
            items={strategy}
            applying={applying}
            appliedIds={appliedIds}
            onApply={onApply}
            setApplying={setApplying}
          />
        )}
      </div>
    </div>
  );
}

function Group({
  title,
  items,
  applying,
  appliedIds,
  onApply,
  setApplying,
}: {
  title: string;
  items: Opportunity[];
  applying: string | null;
  appliedIds: Set<string>;
  onApply: (id: string) => Promise<void>;
  setApplying: (id: string | null) => void;
}) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wider text-[var(--muted)] font-medium mb-2">
        {title} · {items.length}
      </div>
      <div className="grid gap-3">
        {items.map((o) => {
          const applied = appliedIds.has(o.id);
          return (
            <div key={o.id} className="card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{o.title}</div>
                  <div className="text-[12px] text-[var(--muted)] mt-1">{o.why}</div>
                  <div className="mt-2 flex gap-2 flex-wrap">
                    <span className="chip">{o.type}</span>
                    <span className="chip chip-accent">
                      predicted impact +{o.impactRange[0]}–{o.impactRange[1]}
                    </span>
                    {applied && <span className="chip chip-success">Applied</span>}
                  </div>
                  <details className="mt-2">
                    <summary className="text-[11px] text-[var(--muted)] cursor-pointer">Show change</summary>
                    <pre className="mt-2 whitespace-pre-wrap text-[12px] bg-gray-50 p-3 rounded border border-[var(--border)]">
                      {o.change}
                    </pre>
                  </details>
                </div>
                <div className="shrink-0">
                  <button
                    className="btn btn-primary"
                    disabled={applied || applying === o.id}
                    onClick={async () => {
                      setApplying(o.id);
                      await onApply(o.id);
                      setApplying(null);
                    }}
                  >
                    {applied ? "Applied" : applying === o.id ? "Applying…" : "Apply"}
                  </button>
                </div>
              </div>
              {applied && o.didImprove === false && (
                <div className="mt-2 text-[12px] text-[var(--warn)]">
                  Applied — no measurable improvement in the last re-run.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
