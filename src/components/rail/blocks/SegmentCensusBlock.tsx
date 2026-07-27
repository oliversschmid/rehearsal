"use client";
import type { GroundingQuality, TicketTheme } from "@/lib/types";
import { themeLabel } from "@/lib/audienceMetrics";

export function SegmentCensusBlock({
  realCustomers,
  groundedTwins,
  projectedTwins,
  grounding,
  topThemes,
  activeTheme,
  onFilterTheme,
}: {
  realCustomers: number;
  groundedTwins: number;
  projectedTwins: number;
  grounding: { rich: number; medium: number; thin: number };
  topThemes: { theme: TicketTheme; count: number }[];
  activeTheme: TicketTheme | null;
  onFilterTheme: (t: TicketTheme | null) => void;
}) {
  const total = grounding.rich + grounding.medium + grounding.thin || 1;
  const bars: { key: GroundingQuality; label: string; cls: string; pct: number }[] = [
    { key: "rich", label: "rich", cls: "bg-[var(--success)]", pct: (grounding.rich / total) * 100 },
    { key: "medium", label: "medium", cls: "bg-[var(--highlight)]", pct: (grounding.medium / total) * 100 },
    { key: "thin", label: "thin", cls: "bg-[var(--muted-2)]", pct: (grounding.thin / total) * 100 },
  ];

  return (
    <>
      <div className="card p-4">
        <div className="text-[10.5px] uppercase tracking-wider text-[var(--muted)] font-medium">
          Segment census
        </div>
        <ul className="mt-2 space-y-1.5 text-[12.5px]">
          <li className="flex justify-between">
            <span className="text-[var(--muted)]">Real customers</span>
            <b className="tabular-nums">{realCustomers.toLocaleString()}</b>
          </li>
          <li className="flex justify-between">
            <span className="text-[var(--muted)]">Grounded twins</span>
            <b className="tabular-nums">{groundedTwins.toLocaleString()}</b>
          </li>
          <li className="flex justify-between">
            <span className="text-[var(--muted)]">Projected twins</span>
            <b className="tabular-nums">{projectedTwins.toLocaleString()}</b>
          </li>
        </ul>
        <div className="mt-3">
          <div className="text-[10.5px] uppercase tracking-wider text-[var(--muted)] mb-1">
            Grounding quality
          </div>
          <div className="flex h-2 rounded-full overflow-hidden border border-[var(--border)]">
            {bars.map((b) => (
              <div
                key={b.key}
                className={b.cls}
                style={{ width: `${b.pct}%` }}
                title={`${b.label}: ${Math.round(b.pct)}%`}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10.5px] text-[var(--muted-2)]">
            <span>rich {grounding.rich}</span>
            <span>medium {grounding.medium}</span>
            <span>thin {grounding.thin}</span>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <div className="text-[10.5px] uppercase tracking-wider text-[var(--muted)] font-medium">
          Top ticket themes
        </div>
        {topThemes.length === 0 ? (
          <div className="mt-2 text-[12px] text-[var(--muted)] italic">No tickets in segment.</div>
        ) : (
          <ul className="mt-2 space-y-1">
            {topThemes.slice(0, 3).map((t) => {
              const active = activeTheme === t.theme;
              return (
                <li key={t.theme}>
                  <button
                    onClick={() => onFilterTheme(active ? null : t.theme)}
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-left text-[12.5px] transition-colors ${
                      active
                        ? "bg-[var(--accent-soft)] text-[var(--foreground)]"
                        : "text-[var(--foreground)] hover:bg-gray-50"
                    }`}
                  >
                    <span className="truncate">{themeLabel(t.theme)}</span>
                    <span className={`chip !text-[10.5px] shrink-0 ${active ? "chip-accent" : ""}`}>
                      {t.count}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
