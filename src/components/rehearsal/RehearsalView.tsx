"use client";
import { useState } from "react";
import type {
  Campaign,
  HistoricalCampaign,
  RehearsalResult,
  RiskFlag,
  Verdict,
} from "@/lib/types";
import type { TwinMeta } from "../CampaignEditor";
import { OpportunitiesList } from "./OpportunitiesList";
import { EvidenceSection } from "./EvidenceSection";
import { RunStage } from "./RunStage";
import { ResponseSummaryStrip, type FilterAction } from "./ResponseSummaryStrip";
import { StrategySummary } from "./StrategySummary";
import { TimingAudiencePanel } from "./TimingAudiencePanel";
import {
  agentRationale,
  audienceFit,
  cadenceVerdict,
  channelMix,
  positioningLine,
  predictedReach,
} from "@/lib/reportInsights";

/**
 * RehearsalView, rebuilt for Experience 2.
 * Layout when a run exists:
 *   1. Verdict band (score / recommendation+driver / risk+exclusions)
 *   2. Suppression block
 *   3. Opportunities
 *   4. Response summary strip
 *   5. Evidence (collapsed by default)
 * Running state: <RunStage /> replaces the entire main content.
 */

export function RehearsalView({
  campaign,
  rehearsal,
  runs,
  twinsById,
  eligibleCount,
  audienceName,
  audienceDescription,
  historicalCampaigns,
  runOnMount,
  viewingRun,
  compareLatest,
  onCancelRun,
  onBackToLatest,
  onRunComplete,
  onApplyOpportunity,
}: {
  campaign: Campaign;
  rehearsal: RehearsalResult | null;
  runs: RehearsalResult[];
  twinsById: Record<string, TwinMeta>;
  eligibleCount: number;
  audienceName: string;
  audienceDescription?: string;
  historicalCampaigns: HistoricalCampaign[];
  runOnMount: boolean;
  /** If set, render this historical run instead of the latest. */
  viewingRun: RehearsalResult | null;
  /** When viewing a historical run, whether to render the side-by-side compare. */
  compareLatest: boolean;
  onCancelRun: () => void;
  onBackToLatest: () => void;
  onRunComplete: (r: RehearsalResult) => void;
  onApplyOpportunity: (id: string) => Promise<void>;
}) {
  const [evidenceFilter, setEvidenceFilter] = useState<FilterAction | null>(null);

  // If we're viewing a historical run, that overrides everything.
  const showResult: RehearsalResult | null = viewingRun ?? rehearsal;
  const isHistorical = !!viewingRun;

  // Historical-run + compare-with-latest view
  if (isHistorical && compareLatest && rehearsal && viewingRun) {
    const idx = runIndex(runs, viewingRun);
    return (
      <div className="space-y-6">
        <HistoricalBanner
          totalRuns={idx}
          compareLatest={compareLatest}
          onBackToLatest={onBackToLatest}
          onToggleCompare={() => {
            document.dispatchEvent(new CustomEvent("rehearsal-toggle-compare"));
          }}
        />
        <div className="grid gap-4 grid-cols-2">
          <CompareCard label={`Run ${idx.index}`} result={viewingRun} twinsById={twinsById} />
          <CompareCard label="Latest" result={rehearsal} twinsById={twinsById} highlight />
        </div>
        <DiffList newer={rehearsal} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isHistorical && viewingRun && (
        <HistoricalBanner
          totalRuns={runIndex(runs, viewingRun)}
          compareLatest={compareLatest}
          onBackToLatest={onBackToLatest}
          onToggleCompare={() => {
            document.dispatchEvent(new CustomEvent("rehearsal-toggle-compare"));
          }}
        />
      )}

      {runOnMount && (
        <RunStage
          campaign={campaign}
          audienceName={audienceName}
          twins={Object.values(twinsById).slice(0, eligibleCount)}
          totalTwins={eligibleCount}
          onComplete={(r) => {
            onRunComplete(r);
          }}
          onCancel={onCancelRun}
        />
      )}

      {!runOnMount && showResult && (
        <>
          <VerdictBand
            verdict={showResult.verdict}
            riskFlags={showResult.riskFlags}
            exclusionsCount={(campaign.exclusions?.length ?? 0)}
            twinsById={twinsById}
            twinCount={showResult.responses.length || eligibleCount}
            positioningSentence={
              !isHistorical
                ? positioningLine(campaign, showResult, historicalCampaigns).sentence
                : undefined
            }
          />

          {!isHistorical && (
            <>
              <StrategySummary
                goal={campaign.goal}
                reach={predictedReach(campaign, showResult)}
                rationale={agentRationale(campaign, { name: audienceName, description: audienceDescription })}
              />
              <TimingAudiencePanel
                cadence={cadenceVerdict(campaign)}
                fit={audienceFit(showResult)}
                channels={channelMix(campaign, showResult)}
              />
            </>
          )}

          {!isHistorical ? (
            <OpportunitiesList
              opportunities={showResult.opportunities.slice(0, 5)}
              appliedIds={new Set((campaign.appliedOpportunities ?? []).map((a) => a.opportunityId))}
              onApply={async (id) => { await onApplyOpportunity(id); }}
            />
          ) : (
            <div className="card p-4 text-[12px] text-[var(--muted)]">
              Opportunities and Apply actions are hidden for historical runs.
            </div>
          )}

          <ResponseSummaryStrip
            result={showResult}
            twinsById={twinsById}
            onSegmentClick={(f) => {
              setEvidenceFilter(f);
            }}
          />

          {evidenceFilter && (
            <div
              className="rounded-md px-3 py-2 text-[12px] flex items-center justify-between gap-3"
              style={{ background: "var(--accent-soft)", color: "var(--foreground)" }}
            >
              <span>
                Evidence filtered to{" "}
                <b>{filterLabel(evidenceFilter)}</b>
              </span>
              <button
                onClick={() => setEvidenceFilter(null)}
                className="text-[var(--muted)] hover:text-[var(--foreground)] font-medium"
              >
                Clear filter
              </button>
            </div>
          )}

          <EvidenceSection
            result={filteredResult(showResult, evidenceFilter)}
            campaign={campaign}
            twinsById={twinsById}
          />
        </>
      )}

      {!runOnMount && !showResult && (
        campaign.copilotMode ? (
          <CopilotStillRehearsingState iterationCount={campaign.copilotIterations?.length ?? 0} />
        ) : (
          <div className="card p-12 text-center">
            <div className="w-14 h-14 rounded-full bg-[var(--accent-soft)] grid place-items-center text-[var(--accent)] mx-auto">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            </div>
            <h3 className="text-lg font-semibold mt-4">Ready to rehearse this campaign?</h3>
            <p className="text-sm text-[var(--muted)] mt-2 max-w-md mx-auto">
              Use the <b>Rehearse</b> button in the copilot rail to start a dry run. Every rehearse action app-wide lives there.
            </p>
          </div>
        )
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Verdict band — Zone A / B / C in a single card                    */
/* ------------------------------------------------------------------ */

function VerdictBand({
  verdict,
  riskFlags,
  exclusionsCount,
  twinsById,
  twinCount,
  positioningSentence,
}: {
  verdict: Verdict;
  riskFlags: RiskFlag[];
  exclusionsCount: number;
  twinsById: Record<string, TwinMeta>;
  twinCount: number;
  positioningSentence?: string;
}) {
  return (
    <div className="card p-5">
      <div className="grid gap-6" style={{ gridTemplateColumns: "200px 1fr 280px" }}>
        <ZoneA verdict={verdict} />
        <ZoneB verdict={verdict} twinCount={twinCount} positioningSentence={positioningSentence} />
        <ZoneC
          riskFlags={riskFlags}
          exclusionsCount={exclusionsCount}
          twinsById={twinsById}
        />
      </div>
    </div>
  );
}

function ZoneA({ verdict }: { verdict: Verdict }) {
  const clr =
    verdict.score >= 70 ? "var(--success)"
    : verdict.score >= 50 ? "var(--accent)"
    : verdict.score >= 30 ? "var(--warn)"
    : "var(--danger)";
  return (
    <div className="flex flex-col items-start gap-2">
      <ScoreDonut score={verdict.score} color={clr} provisional={verdict.provisional} />
      <div className={`text-[13px] font-medium ${bandTextColor(verdict.band.band)}`}>{verdict.band.label}</div>
      {verdict.provisional && (
        <span className="chip !text-[10.5px] chip-highlight" style={{ opacity: 0.75 }} title="Fewer than 10 like-tagged historical campaigns yet — the score will firm up.">
          Calibrating
        </span>
      )}
    </div>
  );
}

function ScoreDonut({
  score,
  color,
  provisional,
}: {
  score: number;
  color: string;
  provisional: boolean;
}) {
  return (
    <div
      className="score-ring"
      style={{
        width: 96,
        height: 96,
        ["--p" as string]: score,
        ["--c" as string]: color,
        opacity: provisional ? 0.85 : 1,
        border: provisional ? "1px dashed var(--border-strong)" : undefined,
      }}
    >
      <div className="relative z-10 text-center">
        <div className="text-2xl font-semibold tracking-tight tabular-nums" style={{ color }}>{score}</div>
        <div className="text-[9px] uppercase tracking-widest text-[var(--muted)]">/100</div>
      </div>
    </div>
  );
}

function ZoneB({
  verdict,
  twinCount,
  positioningSentence,
}: {
  verdict: Verdict;
  twinCount: number;
  positioningSentence?: string;
}) {
  return (
    <div className="flex flex-col justify-center gap-2">
      <div className="flex items-center gap-2">
        <RecChip verdict={verdict} />
      </div>
      <p className="text-[15px] leading-relaxed text-[var(--foreground)]">{verdict.driver}</p>
      <div className="text-[11.5px] text-[var(--muted)]">
        Rehearsed on {twinCount} twin{twinCount === 1 ? "" : "s"} · vs {verdict.referenceCount} prior campaign{verdict.referenceCount === 1 ? "" : "s"}
      </div>
      {positioningSentence && (
        <div className="text-[11.5px] text-[var(--foreground)] mt-0.5">{positioningSentence}</div>
      )}
    </div>
  );
}

function RecChip({ verdict }: { verdict: Verdict }) {
  const map: Record<Verdict["recommendation"], { cls: string; base: string }> = {
    ship: { cls: "chip-success", base: "Ship" },
    improve: { cls: "chip-warn", base: "Improve" },
    dont_send: { cls: "chip-danger", base: "Don't send" },
  };
  const m = map[verdict.recommendation];
  const label = verdict.provisional
    ? verdict.recommendation === "ship" ? "Leaning ship"
      : verdict.recommendation === "improve" ? "Leaning improve"
      : "Leaning don't send"
    : m.base;
  return <span className={`chip ${m.cls}`}>{label}</span>;
}

function ZoneC({
  riskFlags,
  exclusionsCount,
  twinsById,
}: {
  riskFlags: RiskFlag[];
  exclusionsCount: number;
  twinsById: Record<string, TwinMeta>;
}) {
  const [flagsExpanded, setFlagsExpanded] = useState(false);
  const topFlag = riskFlags[0];
  return (
    <div className="flex flex-col gap-3">
      <div
        className={`rounded-lg border p-2.5 ${riskFlags.length ? "cursor-pointer hover:bg-gray-50" : ""}`}
        style={{ borderColor: "var(--border)" }}
        onClick={() => riskFlags.length && setFlagsExpanded((v) => !v)}
      >
        <div className="text-[10.5px] uppercase tracking-wider text-[var(--muted)] font-medium">Risk flags</div>
        {riskFlags.length === 0 ? (
          <div className="text-[12.5px] text-[var(--muted)] mt-0.5">No risk flags</div>
        ) : (
          <>
            <div className="text-[12.5px] font-medium text-[var(--foreground)] mt-0.5">
              {riskFlags.length} {riskFlags.length === 1 ? "flag" : "flags"} · {topFlag?.label}
            </div>
            {flagsExpanded && (
              <ul className="mt-2 space-y-1.5">
                {riskFlags.map((f) => (
                  <li key={f.id} className="text-[11.5px]">
                    <div className="flex items-baseline gap-2">
                      <span className={`chip !text-[10px] ${f.severity === "high" ? "chip-danger" : "chip-warn"}`}>{f.severity}</span>
                      <span className="font-medium">{f.label}</span>
                    </div>
                    <div className="text-[11px] text-[var(--muted)] mt-0.5">
                      Affects {f.affectedTwinIds.slice(0, 3).map((id) => twinsById[id]?.name ?? id).join(", ")}
                      {f.affectedTwinIds.length > 3 ? ` +${f.affectedTwinIds.length - 3}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      <div className="rounded-lg border p-2.5" style={{ borderColor: "var(--border)" }}>
        <div className="text-[10.5px] uppercase tracking-wider text-[var(--muted)] font-medium">Exclusions</div>
        {exclusionsCount === 0 ? (
          <div className="text-[12.5px] text-[var(--muted)] mt-0.5">None</div>
        ) : (
          <div className="text-[12.5px] text-[var(--success)] mt-0.5">
            {exclusionsCount} accepted ✓
          </div>
        )}
      </div>
    </div>
  );
}

function bandTextColor(band: Verdict["band"]["band"]): string {
  if (band === "exceptional" || band === "strong") return "text-[var(--success)]";
  if (band === "middle") return "text-[var(--muted)]";
  if (band === "weak") return "text-[var(--warn)]";
  if (band === "dont_send") return "text-[var(--danger)]";
  return "text-[var(--muted)]";
}

function filterLabel(f: FilterAction): string {
  switch (f) {
    case "open_click": return "clicked";
    case "open_ignore": return "opened & ignored";
    case "ignore": return "ignored";
    case "unsubscribe": return "unsubscribed";
    case "spam": return "spam";
    case "negative": return "negative";
  }
}

function filteredResult(r: RehearsalResult, f: FilterAction | null): RehearsalResult {
  if (!f) return r;
  const matches = (a: RehearsalResult["responses"][number]["action"]) => {
    if (f === "negative") return a === "unsubscribe" || a === "spam";
    return a === f;
  };
  return { ...r, responses: r.responses.filter((resp) => matches(resp.action)) };
}

/* ------------------------------------------------------------------ */
/*  Historical / compare pieces                                       */
/* ------------------------------------------------------------------ */

function HistoricalBanner({
  totalRuns,
  compareLatest,
  onBackToLatest,
  onToggleCompare,
}: {
  totalRuns: { index: number; total: number };
  compareLatest: boolean;
  onBackToLatest: () => void;
  onToggleCompare: () => void;
}) {
  return (
    <div
      className="card p-3 flex items-center justify-between gap-4"
      style={{ borderColor: "var(--highlight)", background: "var(--highlight-soft)" }}
    >
      <div className="text-sm text-[var(--highlight)]">
        Viewing run {totalRuns.index} of {totalRuns.total} · Back to latest
      </div>
      <div className="flex items-center gap-2">
        <button
          className={`btn btn-secondary text-xs ${compareLatest ? "!border-[var(--highlight)] !text-[var(--highlight)]" : ""}`}
          onClick={onToggleCompare}
        >
          {compareLatest ? "Exit compare" : "Compare with latest"}
        </button>
        <button className="btn btn-secondary text-xs" onClick={onBackToLatest}>
          Back to latest
        </button>
      </div>
    </div>
  );
}

function runIndex(runs: RehearsalResult[], viewingRun: RehearsalResult): { index: number; total: number } {
  // Runs come in newest-first from the parent; run #1 is the oldest.
  const sorted = [...runs].sort((a, b) => a.ranAt.localeCompare(b.ranAt));
  const total = sorted.length;
  const found = sorted.findIndex((r) => r.runId === viewingRun.runId);
  return { index: found >= 0 ? found + 1 : total, total };
}

function CompareCard({
  label,
  result,
  twinsById,
  highlight,
}: {
  label: string;
  result: RehearsalResult;
  twinsById: Record<string, TwinMeta>;
  highlight?: boolean;
}) {
  const clr =
    result.verdict.score >= 70 ? "var(--success)"
    : result.verdict.score >= 50 ? "var(--accent)"
    : result.verdict.score >= 30 ? "var(--warn)"
    : "var(--danger)";
  return (
    <div className={`card p-5 space-y-4 ${highlight ? "!border-[var(--foreground)]" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-[var(--muted)]">{label}</div>
        <div className="text-[10.5px] text-[var(--muted-2)]">{formatShort(result.ranAt)}</div>
      </div>
      <div className="flex items-center gap-4">
        <ScoreDonut score={result.verdict.score} color={clr} provisional={result.verdict.provisional} />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium">{result.verdict.band.label}</div>
          <p className="text-[12.5px] text-[var(--muted)] mt-1 line-clamp-3">{result.verdict.driver}</p>
        </div>
      </div>
      <ResponseSummaryStrip result={result} twinsById={twinsById} onSegmentClick={() => {}} />
    </div>
  );
}

function DiffList({ newer }: { newer: RehearsalResult }) {
  const items = newer.diffSummary && newer.diffSummary.length
    ? newer.diffSummary
    : ["No recorded diff between these runs"];
  return (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-wider text-[var(--muted)] mb-2">Changes since this run</div>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="text-[13px] text-[var(--foreground)]">• {it}</li>
        ))}
      </ul>
    </div>
  );
}

function formatShort(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, "0")}`;
  } catch {
    return iso.slice(0, 10);
  }
}

/** Friendly empty state for a copilot campaign that hasn't finished its
 * first rehearsal yet (race between page load and the first `saveRehearsal`
 * call in `streamRehearsal`). */
function CopilotStillRehearsingState({ iterationCount }: { iterationCount: number }) {
  return (
    <div className="card p-12 text-center">
      <div className="w-14 h-14 rounded-full bg-[#ffe5df] grid place-items-center text-[#c04a35] mx-auto">
        <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ animationDuration: "900ms" }}>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
          <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold mt-4">Copilot is still rehearsing this campaign</h3>
      <p className="text-sm text-[var(--muted)] mt-2 max-w-md mx-auto">
        {iterationCount > 0
          ? `Iteration ${iterationCount} of 3 complete. The next verdict will appear here as soon as it lands.`
          : "The first iteration is in flight. Come back in a few seconds or switch to the Flow tab to watch it live."}
      </p>
    </div>
  );
}
