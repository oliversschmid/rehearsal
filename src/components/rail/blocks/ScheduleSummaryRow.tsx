"use client";
import { useRef, useState } from "react";
import type { Campaign } from "@/lib/types";
import { DEFAULT_SCHEDULE } from "@/lib/types";
import { SchedulePopover, describeScheduleShort } from "../../SchedulePopover";

export function ScheduleSummaryRow({
  campaign,
  onSaved,
}: {
  campaign: Campaign;
  onSaved: (c: Campaign) => void;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const schedule = campaign.schedule ?? DEFAULT_SCHEDULE;

  return (
    <div className="card p-3 flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] uppercase tracking-wider text-[var(--muted)] font-medium">
          Schedule
        </div>
        <div className="text-[12px] text-[var(--foreground)] mt-0.5 truncate">
          {describeScheduleShort(schedule)}
        </div>
      </div>
      <button
        ref={btnRef}
        className="btn btn-ghost !p-1 text-[var(--muted-2)] hover:text-[var(--foreground)] shrink-0"
        onClick={() => {
          setAnchor(btnRef.current?.getBoundingClientRect() ?? null);
          setOpen(true);
        }}
        aria-label="Edit schedule"
        title="Edit schedule"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15.232 5.232a2.5 2.5 0 013.536 3.536L7.5 20H4v-3.5L15.232 5.232z" />
        </svg>
      </button>
      {open && (
        <SchedulePopover
          campaign={campaign}
          anchor={anchor}
          onClose={() => setOpen(false)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
