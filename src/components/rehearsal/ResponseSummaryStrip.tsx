"use client";
import { useMemo, useState } from "react";
import type {
  RehearsalDistribution,
  RehearsalResult,
  TwinAction,
} from "@/lib/types";
import type { TwinMeta } from "../CampaignEditor";

/**
 * Horizontal stacked bar of response distribution + toggles for the two
 * split views (segment / documented-vs-projected). Clicking a bar segment
 * asks the parent to filter the Evidence section.
 */

type FilterAction = TwinAction | "negative";

type SplitMode = "overall" | "segment" | "grounding";

type BarRow = { label: string; counts: RehearsalDistribution; total: number };

export function ResponseSummaryStrip({
  result,
  twinsById,
  onSegmentClick,
}: {
  result: RehearsalResult;
  twinsById: Record<string, TwinMeta>;
  onSegmentClick: (filter: FilterAction) => void;
}) {
  const [mode, setMode] = useState<SplitMode>("overall");

  const rows: BarRow[] = useMemo(() => {
    if (mode === "overall") {
      const dist = result.distribution ?? deriveDistribution(result);
      return [{ label: "All twins", counts: dist, total: sumDist(dist) }];
    }
    if (mode === "segment") {
      // Build twin → segment mapping from the segment matrix.
      const twinToSeg = new Map<string, string>();
      for (const cell of result.segmentMatrix) {
        for (const tid of cell.twinIds) {
          if (!twinToSeg.has(tid)) twinToSeg.set(tid, cell.segmentLabel);
        }
      }
      const bySeg = new Map<string, RehearsalDistribution>();
      for (const r of result.responses) {
        const seg = twinToSeg.get(r.twinId) ?? "General";
        const d = bySeg.get(seg) ?? emptyDist();
        d[r.action]++;
        bySeg.set(seg, d);
      }
      return [...bySeg.entries()].map(([label, counts]) => ({
        label,
        counts,
        total: sumDist(counts),
      }));
    }
    // grounding
    const groups = new Map<string, RehearsalDistribution>([
      ["Documented", emptyDist()],
      ["Projected", emptyDist()],
    ]);
    for (const r of result.responses) {
      const meta = twinsById[r.twinId];
      const bucket = meta && meta.grounding === "thin" ? "Projected" : "Documented";
      const d = groups.get(bucket)!;
      d[r.action]++;
    }
    return [...groups.entries()].map(([label, counts]) => ({
      label,
      counts,
      total: sumDist(counts),
    }));
  }, [mode, result, twinsById]);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3 gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-[var(--muted)]">Response summary</div>
          <div className="text-sm text-[var(--muted-2)]">Click a segment to filter the Evidence section below.</div>
        </div>
        <div className="flex items-center gap-1 text-[11.5px]">
          <ToggleBtn active={mode === "overall"} onClick={() => setMode("overall")}>Overall</ToggleBtn>
          <ToggleBtn active={mode === "segment"} onClick={() => setMode("segment")}>By segment</ToggleBtn>
          <ToggleBtn active={mode === "grounding"} onClick={() => setMode("grounding")}>Documented vs projected</ToggleBtn>
        </div>
      </div>

      <div className="space-y-3">
        {rows.map((row) => (
          <BarRow key={row.label} row={row} onSegmentClick={onSegmentClick} />
        ))}
      </div>
    </div>
  );
}

function BarRow({
  row,
  onSegmentClick,
}: {
  row: BarRow;
  onSegmentClick: (filter: FilterAction) => void;
}) {
  const { counts, total, label } = row;
  const negative = counts.unsubscribe + counts.spam;
  const segments: Array<{ key: FilterAction; count: number; color: string; label: string }> = [
    { key: "open_click", count: counts.open_click, color: "var(--success)", label: "clicked" },
    { key: "open_ignore", count: counts.open_ignore, color: "color-mix(in oklab, var(--warn) 40%, white)", label: "opened, ignored" },
    { key: "ignore", count: counts.ignore, color: "#d1d5db", label: "ignored" },
    { key: "negative", count: negative, color: "var(--danger)", label: "negative" },
  ];
  return (
    <div>
      <div className="flex items-center justify-between mb-1 text-[11.5px]">
        <div className="font-medium text-[var(--foreground)]">{label}</div>
        <div className="text-[var(--muted)] tabular-nums">{total} responses</div>
      </div>
      <div className="w-full h-3 rounded-full overflow-hidden flex bg-gray-100">
        {segments.map((s) => {
          const pct = total ? (s.count / total) * 100 : 0;
          if (pct === 0) return null;
          return (
            <button
              key={s.key}
              onClick={() => onSegmentClick(s.key)}
              title={`${s.label}: ${s.count}`}
              className="h-full transition-opacity hover:opacity-80"
              style={{ width: `${pct}%`, background: s.color }}
            />
          );
        })}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--muted)]">
        {segments.map((s) => (
          <button
            key={s.key}
            onClick={() => onSegmentClick(s.key)}
            className="inline-flex items-center gap-1.5 hover:text-[var(--foreground)]"
          >
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
            <span>
              {s.label} <span className="tabular-nums text-[var(--foreground)]">{s.count}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ToggleBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`px-2.5 py-1 rounded-md ${
        active ? "bg-[var(--foreground)] text-[var(--accent-fg)]" : "hover:bg-gray-50 text-[var(--muted)]"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function emptyDist(): RehearsalDistribution {
  return { open_click: 0, open_ignore: 0, ignore: 0, unsubscribe: 0, spam: 0 };
}

function deriveDistribution(r: RehearsalResult): RehearsalDistribution {
  const d = emptyDist();
  for (const resp of r.responses) d[resp.action]++;
  return d;
}

function sumDist(d: RehearsalDistribution): number {
  return d.open_click + d.open_ignore + d.ignore + d.unsubscribe + d.spam;
}

export type { FilterAction };
