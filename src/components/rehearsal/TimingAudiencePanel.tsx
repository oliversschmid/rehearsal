"use client";
import type {
  AudienceFit,
  CadenceVerdict,
  ChannelMix,
} from "@/lib/reportInsights";

/**
 * TimingAudiencePanel — three signals in one card:
 *   Left:  cadence (touches, span, window, frequency cap) + verdict
 *   Right: audience-fit read from the segment matrix
 *   Bottom (full-width): channel mix (email vs sms engagement)
 */
export function TimingAudiencePanel({
  cadence,
  fit,
  channels,
}: {
  cadence: CadenceVerdict;
  fit: AudienceFit;
  channels: ChannelMix;
}) {
  return (
    <div className="card p-4">
      <div className="text-[10.5px] uppercase tracking-wider text-[var(--muted)] font-medium mb-3">
        Timing & audience
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <CadenceBlock cadence={cadence} />
        <AudienceFitBlock fit={fit} />
      </div>
      <div className="mt-4 pt-4 border-t border-[var(--border)]">
        <ChannelMixBlock mix={channels} />
      </div>
    </div>
  );
}

function CadenceBlock({ cadence }: { cadence: CadenceVerdict }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wider text-[var(--muted)] font-medium">
        Cadence
      </div>
      <div className="text-[15px] font-semibold text-[var(--foreground)] mt-1 tabular-nums">
        {cadence.touchCount} touch{cadence.touchCount === 1 ? "" : "es"}
        {cadence.spanDays > 0 ? ` · ${cadence.spanDays}d` : ""}
      </div>
      <div className="text-[12px] text-[var(--muted)] mt-0.5">
        {cadence.windowLabel} · {cadence.frequencyLabel}
      </div>
      <div className="text-[12.5px] italic text-[var(--muted)] mt-2 leading-relaxed">
        {cadence.verdict}
      </div>
    </div>
  );
}

function AudienceFitBlock({ fit }: { fit: AudienceFit }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wider text-[var(--muted)] font-medium">
        Audience fit
      </div>
      <div className="mt-1 space-y-1.5">
        {fit.bestSegment && (
          <div className="flex items-center gap-2">
            <span className="chip chip-success !text-[10.5px]">
              {fit.bestSegment.scorePct}%
            </span>
            <span className="text-[12.5px] text-[var(--foreground)] truncate">
              {fit.bestSegment.label}
            </span>
          </div>
        )}
        {fit.worstSegment && fit.worstSegment.label !== fit.bestSegment?.label && (
          <div className="flex items-center gap-2">
            <span className="chip chip-warn !text-[10.5px]">
              {fit.worstSegment.scorePct}%
            </span>
            <span className="text-[12.5px] text-[var(--foreground)] truncate">
              {fit.worstSegment.label}
            </span>
          </div>
        )}
        {!fit.bestSegment && !fit.worstSegment && (
          <div className="text-[12px] text-[var(--muted)]">
            No segment breakdown available.
          </div>
        )}
      </div>
      <div className="text-[12.5px] italic text-[var(--muted)] mt-2 leading-relaxed">
        {fit.sentence}
      </div>
    </div>
  );
}

function ChannelMixBlock({ mix }: { mix: ChannelMix }) {
  const email = mix.email;
  const sms = mix.sms;
  const both = !!email && !!sms;
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wider text-[var(--muted)] font-medium">
        Channel mix
      </div>
      {both ? (
        <div className="mt-2 space-y-1.5">
          <ChannelBar
            label={email!.label}
            pct={Math.round(email!.engagement * 100)}
            color="var(--accent)"
          />
          <ChannelBar
            label={sms!.label}
            pct={Math.round(sms!.engagement * 100)}
            color="var(--highlight)"
          />
        </div>
      ) : (
        <div className="text-[12.5px] text-[var(--muted)] mt-1">
          {email?.label ?? sms?.label ?? "No channel data"}
          {(email || sms) &&
            ` · ${Math.round(((email ?? sms)!.engagement) * 100)}% engagement`}
        </div>
      )}
      <div className="text-[12.5px] italic text-[var(--muted)] mt-2 leading-relaxed">
        {mix.verdict}
      </div>
    </div>
  );
}

function ChannelBar({
  label,
  pct,
  color,
}: {
  label: string;
  pct: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="text-[11.5px] text-[var(--muted)] w-12 shrink-0">
        {label}
      </div>
      <div
        className="flex-1 h-2 rounded-full overflow-hidden"
        style={{ background: "var(--border)" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, Math.max(0, pct))}%`,
            background: color,
          }}
        />
      </div>
      <div className="text-[11.5px] tabular-nums text-[var(--foreground)] w-10 text-right">
        {pct}%
      </div>
    </div>
  );
}
