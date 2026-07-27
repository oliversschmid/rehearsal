"use client";
import { useEffect, useRef, useState } from "react";
import type { CampaignStatus, GroundingQuality } from "@/lib/types";

/** Marketer-facing labels for the internal rich/medium/thin data-coverage buckets. */
export const GROUNDING_LABEL: Record<GroundingQuality, string> = {
  rich: "detailed",
  medium: "partial",
  thin: "minimal",
};

export function GroundingChip({ quality }: { quality: GroundingQuality }) {
  const cls = quality === "rich" ? "chip-success" : quality === "medium" ? "chip-highlight" : "";
  return (
    <span
      className={`chip text-[10px] ${cls}`}
      title="Rehearsal signal — how much real data backs this twin's reactions."
    >
      {GROUNDING_LABEL[quality]}
    </span>
  );
}

/**
 * ScoreBadge with a 400ms count-up animation when the score changes.
 * The chip colour follows the standard score bands.
 */
export function ScoreBadge({ score }: { score: number | undefined }) {
  // Holds the tween value only while a count-up is in flight. The rest of the
  // time `score` renders directly, so no effect has to seed this from props.
  const [animated, setAnimated] = useState<number | null>(null);
  const prevRef = useRef<number | undefined>(score);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = prevRef.current;
    prevRef.current = score;
    // Nothing to tween between: first paint, cleared score, or no change.
    if (from === undefined || score === undefined || from === score) return;
    // Copied post-guard so both read as plain numbers inside `step` — a
    // hoisted function declaration doesn't inherit the narrowing above.
    const base = from;
    const to = score;
    const start = performance.now();
    const duration = 400;
    function step(t: number) {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setAnimated(Math.round(base + (to - base) * eased));
      if (p < 1) rafRef.current = requestAnimationFrame(step);
      else setAnimated(null); // hand rendering back to the live score
    }
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [score]);

  const display = animated ?? score;
  if (display === undefined) return <span className="chip">Not rehearsed</span>;
  const cls =
    display >= 85 ? "chip-success"
    : display >= 70 ? "chip-success"
    : display >= 50 ? "chip"
    : display >= 30 ? "chip-warn"
    : "chip-danger";
  return (
    <span className={`chip ${cls}`}>
      <b className="tabular-nums">{display}</b>
      <span className="text-[10px] font-normal">/100</span>
    </span>
  );
}

/**
 * StatusBadge using the v2 pastel chip palette:
 *   draft → neutral, rehearsed → info, send-ready → warn,
 *   active → success, paused → neutral,
 *   sent → neutral, completed → success, archived → neutral.
 */
const STATUS_STYLE_V2: Record<CampaignStatus, { cls: string; label: string }> = {
  draft:         { cls: "chip-neutral", label: "Draft" },
  rehearsed:     { cls: "chip-info",    label: "Rehearsed" },
  "send-ready":  { cls: "chip-warn",    label: "Send-ready" },
  active:        { cls: "chip-success", label: "Live" },
  paused:        { cls: "chip-neutral", label: "Paused" },
  sent:          { cls: "chip-neutral", label: "Sent" },
  completed:     { cls: "chip-success", label: "Completed" },
  archived:      { cls: "chip-neutral", label: "Archived" },
};

export function StatusBadge({ status }: { status: CampaignStatus | string }) {
  const s = STATUS_STYLE_V2[status as CampaignStatus] ?? { cls: "chip-neutral", label: String(status) };
  return (
    <span className={`chip ${s.cls}`}>
      {(status === "active" || status === "paused") && (
        <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${status === "active" ? "bg-[var(--chip-success-fg)] animate-pulse" : "bg-[var(--chip-warn-fg)]"}`} />
      )}
      {s.label}
    </span>
  );
}
