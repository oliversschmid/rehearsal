"use client";
import type { Campaign, RehearsalResult, ScorecardEntry } from "@/lib/types";

const POST_LAUNCH_STATUSES = ["active", "paused", "sent", "completed", "archived"];

export function ReportView({
  campaign,
  rehearsal: _rehearsal,
  scorecardEntry,
}: {
  campaign: Campaign;
  rehearsal: RehearsalResult | null;
  scorecardEntry: ScorecardEntry | null;
}) {
  const historical = campaign.historicalOutcome;
  const isPostLaunch = POST_LAUNCH_STATUSES.includes(campaign.status);
  const isResolved = isPostLaunch && !!historical;

  // Pre-launch campaigns get a single clear message instead of empty boxes.
  if (!isPostLaunch) {
    return <NotYetLaunched />;
  }

  // Post-launch but no outcome data yet (active/paused, still collecting)
  if (!historical) {
    return <CollectingOutcomes status={campaign.status} />;
  }

  return (
    <div className="space-y-6">
      <div className="text-[12px] text-[var(--muted)] max-w-2xl leading-relaxed">
        <b className="text-[var(--foreground)]">Report</b> — how the send actually performed and how our prediction compared.
      </div>

      <ResolutionVerdict campaign={campaign} scorecardEntry={scorecardEntry} />

      {isResolved && !scorecardEntry && (
        <div className="card p-5">
          <div className="text-[11px] uppercase tracking-wider text-[var(--muted)] mb-2">Note</div>
          <div className="text-sm text-[var(--muted)]">
            This campaign was sent before the rehearsal engine started tracking predictions — no scorecard entry to compare against.
          </div>
        </div>
      )}
    </div>
  );
}

function NotYetLaunched() {
  return (
    <div className="card p-12 text-center">
      <div className="w-14 h-14 rounded-full bg-[var(--accent-soft)] grid place-items-center text-[var(--foreground)] mx-auto">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 6v6l4 2" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold mt-4">No report yet</h3>
      <p className="text-sm text-[var(--muted)] mt-2 max-w-md mx-auto leading-relaxed">
        Reports become available once the campaign has been launched. Launch it from the top-right, then come back to see actual send performance and how it compared to the predicted outcome.
      </p>
      <p className="text-[11.5px] text-[var(--muted-2)] mt-4">
        Looking for the pre-send verdict? That lives in the <b className="text-[var(--foreground)]">Rehearsal</b> tab.
      </p>
    </div>
  );
}

function CollectingOutcomes({ status }: { status: string }) {
  return (
    <div className="card p-12 text-center">
      <div className="w-14 h-14 rounded-full bg-[var(--accent-soft)] grid place-items-center text-[var(--foreground)] mx-auto">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M4 4v16h16" />
          <path d="M8 16l4-6 3 4 5-8" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold mt-4">Collecting outcomes</h3>
      <p className="text-sm text-[var(--muted)] mt-2 max-w-md mx-auto leading-relaxed">
        This campaign is {status === "paused" ? "paused" : "live"}. Real send data (opens, clicks, unsubs) will populate this report as recipients respond over the next few days.
      </p>
    </div>
  );
}

function ResolutionVerdict({
  campaign,
  scorecardEntry,
}: {
  campaign: Campaign;
  scorecardEntry: ScorecardEntry | null;
}) {
  const outcome = campaign.historicalOutcome!;
  const openPct = Math.round(outcome.openRate * 100);
  const clickPct = (outcome.clickRate * 100).toFixed(1);

  if (!scorecardEntry) {
    // Sent but no prediction on record
    return (
      <div className="card p-6">
        <div className="text-[11px] uppercase tracking-wider text-[var(--muted)] mb-3">Resolved outcome</div>
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Open rate" value={`${openPct}%`} />
          <Stat label="Click rate" value={`${clickPct}%`} />
          <Stat label="Unsubscribes" value={String(outcome.unsubs)} />
        </div>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between gap-4 mb-5">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-[var(--muted)]">Resolution</div>
          <div className="text-lg font-semibold mt-0.5">Predicted vs. actual</div>
        </div>
        <HitMissBadge hit={scorecardEntry.hit} />
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <PredictionCard
          label="What we predicted"
          value={scorecardEntry.predictedCall}
          sub={`Based on the rehearsal against ${campaign.tags.join(", ")} history`}
          tone="predicted"
        />
        <PredictionCard
          label="What actually happened"
          value={scorecardEntry.actualOutcome}
          sub={`${openPct}% open · ${clickPct}% click · ${outcome.unsubs} unsub${outcome.unsubs === 1 ? "" : "s"}`}
          tone={scorecardEntry.hit ? "hit" : "miss"}
        />
      </div>

      <div className="mt-5 pt-4 border-t border-[var(--border)] flex items-start gap-3">
        <ExplainIcon />
        <p className="text-[12.5px] text-[var(--muted)] leading-relaxed">
          {scorecardEntry.hit
            ? "The simulation's call matched the send. This campaign counts as a hit in the overview scorecard."
            : "The simulation was off on this one. Feeds into calibration — see the bias note in the overview scorecard."}
        </p>
      </div>
    </div>
  );
}

function PredictionCard({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "predicted" | "hit" | "miss" }) {
  const border =
    tone === "hit" ? "border-[var(--success)]"
    : tone === "miss" ? "border-[var(--danger)]"
    : "border-[var(--border)]";
  const bg =
    tone === "hit" ? "bg-[var(--success-soft)]"
    : tone === "miss" ? "bg-[var(--danger-soft)]"
    : "bg-white";
  return (
    <div className={`border ${border} ${bg} rounded-lg p-4`}>
      <div className="text-[11px] uppercase tracking-wider text-[var(--muted)]">{label}</div>
      <div className="text-base font-semibold mt-1">{value}</div>
      <div className="text-[12px] text-[var(--muted)] mt-2">{sub}</div>
    </div>
  );
}

function HitMissBadge({ hit }: { hit: boolean }) {
  return (
    <span className={`chip ${hit ? "chip-success" : "chip-danger"} !text-[13px] !py-1.5 !px-3`}>
      {hit ? "✓ Hit" : "✗ Miss"}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-[var(--muted)]">{label}</div>
      <div className="text-lg font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function ExplainIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--muted-2)] shrink-0 mt-0.5">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
    </svg>
  );
}
