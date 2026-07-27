"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { RailSlot } from "@/components/rail/RailContext";
import { TwinBioCard, type TwinBio } from "@/components/rail/blocks/TwinBioCard";
import { SegmentStatsBlock } from "@/components/rail/blocks/SegmentStatsBlock";
import { themeLabel } from "@/lib/audienceMetrics";
import type { TicketTheme } from "@/lib/types";

type StatRow = { label: string; value: string; sub?: string };

export function SegmentDetailRail({
  segmentName,
  bio,
  topThemes,
  activeTheme,
  stats,
}: {
  segmentName: string;
  bio: TwinBio;
  topThemes: { theme: TicketTheme; count: number }[];
  activeTheme: TicketTheme | null;
  stats: {
    realCustomers: { headline: string; deltaLabel?: string; rows: StatRow[] };
    simulatedTwins: { headline: string; deltaLabel?: string; rows: StatRow[] };
  };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();

  function setTheme(next: TicketTheme | null) {
    const usp = new URLSearchParams(params?.toString() ?? "");
    if (!next) usp.delete("theme");
    else usp.set("theme", next);
    const qs = usp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname ?? "");
  }

  return (
    <RailSlot
      headerLabel="Segment"
      headerTitle={segmentName}
      hideDock
      body={
        <>
          <TwinBioCard bio={bio} segmentName={segmentName} />
          <SegmentStatsBlock
            realCustomers={stats.realCustomers}
            simulatedTwins={stats.simulatedTwins}
          />
          {topThemes.length > 0 && (
            <div className="card p-4">
              <div className="text-[10.5px] uppercase tracking-wider text-[var(--muted)] font-medium">
                Top ticket themes
              </div>
              <ul className="mt-2 space-y-1">
                {topThemes.slice(0, 3).map((t) => {
                  const active = activeTheme === t.theme;
                  return (
                    <li key={t.theme}>
                      <button
                        onClick={() => setTheme(active ? null : t.theme)}
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
            </div>
          )}
        </>
      }
    />
  );
}
