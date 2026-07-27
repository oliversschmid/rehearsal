"use client";
import type { RehearsalResult } from "@/lib/types";

/**
 * Runs are ordered newest-first. Each row: "Run N · score (+delta)" plus a
 * one-line reason for that run (typically the applied opportunity title). The
 * currently viewed row is highlighted; clicking picks that runId.
 *
 * Parent controls both the runs list and the "viewing" state — this component
 * is purely presentational.
 */
export function RunHistoryBlock({
  runs,
  viewingRunId,
  onView,
  onBackToLatest,
}: {
  runs: RehearsalResult[];
  /** null = viewing latest. */
  viewingRunId: string | null;
  onView: (runId: string) => void;
  onBackToLatest: () => void;
}) {
  if (runs.length === 0) {
    return (
      <div className="card p-4">
        <div className="text-[10.5px] uppercase tracking-wider text-[var(--muted)] font-medium">
          Run history
        </div>
        <div className="mt-2 text-[12px] text-[var(--muted)] italic">
          No runs yet — this campaign hasn&apos;t been rehearsed.
        </div>
      </div>
    );
  }

  // Sort newest-first
  const sorted = [...runs].sort((a, b) => b.ranAt.localeCompare(a.ranAt));
  const total = sorted.length;

  return (
    <div className="card p-4">
      <div className="text-[10.5px] uppercase tracking-wider text-[var(--muted)] font-medium">
        Run history
      </div>
      {viewingRunId && (
        <div className="mt-2 text-[11.5px] rounded-md p-2 flex items-center justify-between"
             style={{ background: "var(--highlight-soft)", color: "var(--highlight)" }}>
          <span>
            Viewing{" "}
            <b>
              Run{" "}
              {sorted.length -
                sorted.findIndex((r) => r.runId === viewingRunId)}
            </b>
          </span>
          <button
            className="text-[var(--highlight)] hover:underline font-medium"
            onClick={onBackToLatest}
          >
            Back to latest
          </button>
        </div>
      )}
      <ul className="mt-2 space-y-1">
        {sorted.map((r, i) => {
          const runNumber = total - i;
          const previous = sorted[i + 1];
          const delta =
            previous !== undefined ? r.verdict.score - previous.verdict.score : null;
          const isCurrent =
            viewingRunId === r.runId || (!viewingRunId && i === 0);
          const description = describeRun(r, i === total - 1);
          return (
            <li key={r.runId}>
              <button
                onClick={() => onView(r.runId)}
                className={`w-full text-left px-2 py-1.5 rounded-md transition-colors ${
                  isCurrent
                    ? "bg-[var(--accent-soft)] border border-[var(--border-strong)]"
                    : "hover:bg-gray-50 border border-transparent"
                }`}
              >
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[12px] font-medium">Run {runNumber}</span>
                  <span className="text-[12px] tabular-nums text-[var(--foreground)]">
                    · {r.verdict.score}
                  </span>
                  {delta !== null && delta !== 0 && (
                    <span
                      className={`text-[11px] tabular-nums ${
                        delta > 0 ? "text-[var(--success)]" : "text-[var(--danger)]"
                      }`}
                    >
                      ({delta > 0 ? "+" : ""}
                      {delta})
                    </span>
                  )}
                  <span className="ml-auto text-[10.5px] text-[var(--muted-2)]">
                    {formatShortDate(r.ranAt)}
                  </span>
                </div>
                <div className="text-[11px] text-[var(--muted)] mt-0.5 truncate">
                  {description}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function describeRun(r: RehearsalResult, isFirst: boolean): string {
  if (r.diffSummary && r.diffSummary.length) {
    // Show the most descriptive line (`applied: …` > `edited: …` > default).
    const applied = r.diffSummary.find((s) => s.startsWith("applied:"));
    if (applied) return applied;
    const edited = r.diffSummary.find((s) => s.startsWith("edited:"));
    if (edited) return edited;
    return r.diffSummary[0];
  }
  if (isFirst) return "initial run";
  // Fallback for legacy runs without a stored diffSummary.
  const applied = r.opportunities.find((o) => o.applied);
  if (applied) return `applied: ${applied.title}`;
  return r.verdict.driver;
}

function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return iso.slice(5, 10);
  }
}
