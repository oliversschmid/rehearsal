"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Campaign, CampaignStatus, HistoricalCampaign, RehearsalResult } from "@/lib/types";
import { TAG_LABEL } from "@/lib/types";
import { FlowView } from "./FlowView";
import { RehearsalView } from "./rehearsal/RehearsalView";
import { ScoreBadge, StatusBadge } from "./ScoreBadge";
import { LifecycleToolbar } from "./LifecycleToolbar";
import { EditCampaignMetaButton } from "./EditCampaignMetaButton";
import { CopilotWorkspace } from "./CopilotWorkspace";
import { RailSlot, useRail } from "./rail/RailContext";
import { VerdictBlock } from "./rail/blocks/VerdictBlock";
import { TopOpportunityBlock } from "./rail/blocks/TopOpportunityBlock";
import { ScheduleSummaryRow } from "./rail/blocks/ScheduleSummaryRow";
import { RunHistoryBlock } from "./rail/blocks/RunHistoryBlock";

export type TwinMeta = { id: string; name: string; grounding: "rich" | "medium" | "thin" };

const POST_LAUNCH: CampaignStatus[] = ["active", "paused", "sent", "completed", "archived"];
function isPostLaunch(status: CampaignStatus): boolean {
  return POST_LAUNCH.includes(status);
}
function nextStatusForAction(action: string, current: CampaignStatus): CampaignStatus {
  switch (action) {
    case "launch": return "active";
    case "pause": return "paused";
    case "resume": return "active";
    case "stop": return "completed";
    case "archive": return "archived";
    case "unarchive": return "draft";
    default: return current;
  }
}

type View = "flow" | "rehearsal";

/**
 * CampaignEditor: the campaign detail view.
 *   - Uses FlowView (no schedule column, gear on trigger).
 *   - Uses RehearsalView (no header re-run btn, no empty-state start btn).
 *   - Pushes rail content via <RailSlot>: VerdictBlock, TopOpportunityBlock,
 *     ScheduleSummaryRow (Flow tab) or RunHistoryBlock (Rehearsal).
 *   - No inline stale banner in the main content — the rail owns it.
 *   - Editing any message immediately flips the rail to stale via RailContext.
 */
export function CampaignEditor({
  initialCampaign,
  audience,
  eligible,
  initialRehearsal,
  initialRuns,
  initialView,
  twinsById,
  historicalCampaigns,
}: {
  initialCampaign: Campaign;
  audience: { id: string; name: string; memberCount: number; description?: string } | null;
  eligible: { eligible: number; total: number; smsOptedOut: number };
  initialRehearsal: RehearsalResult | null;
  initialRuns: RehearsalResult[];
  initialView: View;
  twinsById: Record<string, TwinMeta>;
  historicalCampaigns: HistoricalCampaign[];
}) {
  const router = useRouter();
  const rail = useRail();
  const [campaign, setCampaign] = useState<Campaign>(initialCampaign);
  const [pendingCampaign, setPendingCampaign] = useState<Campaign | null>(null);
  const [rehearsal, setRehearsal] = useState<RehearsalResult | null>(initialRehearsal);
  const [runs, setRuns] = useState<RehearsalResult[]>(initialRuns);
  const [view, setView] = useState<View>(initialView);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewingRunId, setViewingRunId] = useState<string | null>(null);
  const [compareRequested, setCompareLatest] = useState(false);

  const working = pendingCampaign ?? campaign;
  const hasUnsavedFlow = !!pendingCampaign;
  const hasMessages = useMemo(
    () => Object.values(working.flow.nodes).some((n) => n.type === "message"),
    [working],
  );

  // Reset rail stale state when the campaign changes (e.g. new run finishes).
  useEffect(() => {
    return () => rail.stale.setStale(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.id]);

  // Resume-poll: if a copilot campaign is still iterating on mount (user
  // navigated away mid-run) or transitions back into iterating, poll every
  // 2s until the server marks it "ready", then refresh runs + rehearsal so
  // the Rehearsal tab and rail catch up without a page refresh.
  useEffect(() => {
    if (campaign.copilotState !== "iterating") return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/campaigns/${campaign.id}`);
        if (!res.ok) return;
        const c: Campaign = await res.json();
        setCampaign(c);
        if (c.copilotState !== "iterating") {
          const rr = await fetch(`/api/rehearsal/${c.id}`);
          if (rr.ok) setRehearsal(await rr.json());
          const rs = await fetch(`/api/campaigns/${c.id}/runs`);
          if (rs.ok) setRuns(await rs.json());
        }
      } catch { /* keep polling */ }
    }, 2000);
    return () => clearInterval(id);
  }, [campaign.copilotState, campaign.id]);

  function switchView(v: View) {
    if (hasUnsavedFlow && v !== "flow") return;
    setView(v);
  }

  async function saveFlow() {
    if (!pendingCampaign) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/flow`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendingCampaign.flow),
      });
      const updated: Campaign = await res.json();
      setCampaign(updated);
      setPendingCampaign(null);
      if (rehearsal) rail.stale.setStale(true);
    } finally {
      setSaving(false);
    }
  }

  function discardFlow() {
    setPendingCampaign(null);
    rail.stale.setStale(false);
  }

  async function refetchCampaign() {
    const c = await fetch(`/api/campaigns/${campaign.id}`).then((r) => r.json());
    setCampaign(c);
    const r = await fetch(`/api/rehearsal/${campaign.id}`);
    if (r.ok) setRehearsal(await r.json());
    const rs = await fetch(`/api/campaigns/${campaign.id}/runs`);
    if (rs.ok) setRuns(await rs.json());
  }

  async function runLifecycleAction(action: "launch" | "pause" | "resume" | "stop" | "archive" | "unarchive") {
    const nextStatus = nextStatusForAction(action, campaign.status);
    const res = await fetch(`/api/campaigns/${campaign.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    const updated: Campaign = await res.json();
    setCampaign(updated);
    router.refresh();
  }

  const startRerun = useCallback(() => {
    setView("rehearsal");
    setRunning(true);
    rail.stale.setStale(false);
    setViewingRunId(null);
  }, [rail.stale]);

  const viewingRun =
    viewingRunId ? runs.find((r) => r.runId === viewingRunId) ?? null : null;

  // "Compare to latest" only means anything while a historical run is open,
  // so gate it on that here. Navigating back to latest drops the comparison
  // with no effect needed to chase the change.
  const compareLatest = viewingRun ? compareRequested : false;

  // The compare toggle lives inside RehearsalView's HistoricalBanner but the
  // state is owned here. Listen for the banner's custom event.
  useEffect(() => {
    const handler = () => setCompareLatest((v) => !v);
    document.addEventListener("rehearsal-toggle-compare", handler as EventListener);
    return () => document.removeEventListener("rehearsal-toggle-compare", handler as EventListener);
  }, []);

  // Build the rail body based on the current view.
  const railBody = useMemo(() => {
    if (view === "rehearsal") {
      return (
        <RunHistoryBlock
          runs={runs}
          viewingRunId={viewingRunId}
          onView={(id) => {
            // Clicking the top-most (latest) run clears the historical mode.
            const sorted = [...runs].sort((a, b) => b.ranAt.localeCompare(a.ranAt));
            if (sorted[0]?.runId === id) setViewingRunId(null);
            else setViewingRunId(id);
          }}
          onBackToLatest={() => setViewingRunId(null)}
        />
      );
    }
    const topOpp = rehearsal?.opportunities.find(
      (o) => !(campaign.appliedOpportunities ?? []).some((a) => a.opportunityId === o.id),
    );
    return (
      <>
        <VerdictBlock
          campaign={campaign}
          rehearsal={rehearsal}
          onRehearse={startRerun}
        />
        {rehearsal && topOpp && (
          <TopOpportunityBlock
            campaignId={campaign.id}
            opportunity={topOpp}
            totalCount={
              rehearsal.opportunities.filter(
                (o) => !(campaign.appliedOpportunities ?? []).some((a) => a.opportunityId === o.id),
              ).length
            }
          />
        )}
        <ScheduleSummaryRow
          campaign={campaign}
          onSaved={(c) => setCampaign(c)}
        />
      </>
    );
  }, [view, runs, viewingRunId, campaign, rehearsal, startRerun]);

  const dockPlaceholder =
    view === "rehearsal"
      ? "Ask why it scored this way"
      : "Ask for a tweak, or say 'improve this campaign'";

  // In copilot-mode Flow view, CopilotWorkspace owns the rail (it renders
  // the copilot chat into the rail body). Everywhere else, we own it.
  const copilotOwnsRail = campaign.copilotMode && view === "flow";

  return (
    <div className={`${copilotOwnsRail ? "max-w-none" : "max-w-6xl mx-auto"} p-8`}>
      {!copilotOwnsRail && (
        <RailSlot
          headerLabel="Campaign"
          headerTitle={working.name}
          dockPlaceholder={dockPlaceholder}
          campaignId={campaign.id}
          body={railBody}
        />
      )}

      <div className="flex items-center justify-between gap-6 mb-4">
        <div className="text-[12px] text-[var(--muted)] flex items-center gap-2">
          <Link href="/campaigns" className="hover:underline">Campaigns</Link>
          <span>/</span>
          <span>{audience?.name ?? "—"}</span>
        </div>
        <div className="flex items-center gap-3 relative">
          <StatusBadge status={campaign.status} />
          <LifecycleToolbar status={campaign.status} onAction={runLifecycleAction} />
        </div>
      </div>

      <div className="flex items-start justify-between mb-6 gap-6">
        <div className="min-w-0">
          <div className="flex items-center min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight truncate">{working.name}</h1>
            <EditCampaignMetaButton
              campaign={campaign}
              onSaved={(updated) => setCampaign(updated)}
              onDeleted={() => router.push("/campaigns")}
            />
          </div>
          <p className="text-sm text-[var(--muted)] mt-1 max-w-2xl">{working.goal}</p>
          <div className="flex gap-2 mt-3 items-center flex-wrap">
            <ScoreBadge score={campaign.lastScore} />
            {working.tags.map((t) => <span key={t} className="chip">{TAG_LABEL[t] ?? t}</span>)}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <TabButton active={view === "flow"} onClick={() => switchView("flow")}>Flow</TabButton>
          <TabButton
            active={view === "rehearsal"}
            onClick={() => switchView("rehearsal")}
            disabled={!hasMessages || hasUnsavedFlow || isPostLaunch(campaign.status)}
            tooltip={
              hasUnsavedFlow ? "Save your flow changes first"
              : isPostLaunch(campaign.status) ? "Rehearsal is locked once a campaign is launched"
              : !hasMessages ? "Add a message first"
              : "Dry-run against the simulated audience; iterate before you send."
            }
          >Rehearsal</TabButton>
        </div>
      </div>

      {hasUnsavedFlow && (
        <div
          className="card p-3 mb-4 flex items-center justify-between gap-4"
          style={{ borderColor: "var(--accent)", background: "var(--accent-soft)" }}
        >
          <div className="text-sm text-[var(--accent)] flex items-center gap-2">
            <UnsavedIcon /> You have unsaved flow changes. Rehearsal is disabled until you save.
          </div>
          <div className="flex gap-2">
            <button className="btn btn-ghost" onClick={discardFlow} disabled={saving}>Discard</button>
            <button className="btn btn-primary" onClick={saveFlow} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      )}

      {view === "flow" && campaign.copilotMode && (
        <CopilotWorkspace
          initialCampaign={campaign}
          onCampaignRefetched={(c) => setCampaign(c)}
        />
      )}
      {view === "flow" && !campaign.copilotMode && (
        <FlowView
          campaign={working}
          onCampaignChange={(next) => {
            const sameAsServer = JSON.stringify(next.flow) === JSON.stringify(campaign.flow);
            setPendingCampaign(sameAsServer ? null : next);
          }}
          onScheduleSaved={(c) => setCampaign(c)}
          onMessageEdited={() => {
            if (rehearsal) rail.stale.setStale(true);
          }}
        />
      )}
      {view === "rehearsal" && (
        <RehearsalView
          campaign={campaign}
          rehearsal={rehearsal}
          runs={runs}
          twinsById={twinsById}
          eligibleCount={eligible.eligible}
          audienceName={audience?.name ?? "audience"}
          audienceDescription={audience?.description}
          historicalCampaigns={historicalCampaigns}
          runOnMount={running}
          viewingRun={viewingRun}
          compareLatest={compareLatest}
          onCancelRun={() => { setRunning(false); }}
          onBackToLatest={() => { setViewingRunId(null); setCompareLatest(false); }}
          onRunComplete={(r) => { setRehearsal(r); setRunning(false); rail.stale.setStale(false); refetchCampaign(); }}
          onApplyOpportunity={async (oppId) => {
            const res = await fetch(`/api/campaigns/${campaign.id}/apply-opportunity`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ opportunityId: oppId }),
            });
            const c = await res.json();
            setCampaign(c);
            rail.stale.setStale(true);
          }}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  disabled,
  tooltip,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  tooltip?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`btn btn-secondary ${active ? "!border-[var(--accent)] !text-[var(--accent)]" : ""}`}
      onClick={onClick}
      disabled={active || disabled}
      title={tooltip}
    >
      {children}
    </button>
  );
}

function UnsavedIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
    </svg>
  );
}
