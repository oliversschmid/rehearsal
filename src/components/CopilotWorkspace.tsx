"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Campaign, CopilotIteration, CopilotMessage, Flow, FlowNode, MessageContent } from "@/lib/types";
import { usePrefersReducedMotion } from "@/lib/clientHooks";
import { MessageComposer } from "./MessageComposer";
import { RailSlot } from "./rail/RailContext";
import { SchedulePopover } from "./SchedulePopover";

/**
 * CopilotWorkspace. The chat panel is pushed to the right rail via
 * RailSlot (with hideDock so the rail's generic CopilotDock doesn't
 * double up). The flow surface owns the full main content width.
 */
export function CopilotWorkspace({
  initialCampaign,
  onCampaignRefetched,
}: {
  initialCampaign: Campaign;
  onCampaignRefetched?: (c: Campaign) => void;
}) {
  const [campaign, setCampaign] = useState<Campaign>(initialCampaign);
  const [messages, setMessages] = useState<CopilotMessage[]>(initialCampaign.copilotHistory ?? []);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [engine, setEngine] = useState<{ mode: "claude" | "mock"; model: string } | null>(null);
  const [iterations, setIterations] = useState<CopilotIteration[]>(initialCampaign.copilotIterations ?? []);
  const [viewingIteration, setViewingIteration] = useState<number | null>(
    initialCampaign.copilotSelectedIteration ?? (initialCampaign.copilotIterations?.at(-1)?.iteration ?? null),
  );
  const [committing, setCommitting] = useState(false);
  const [scheduleAnchor, setScheduleAnchor] = useState<DOMRect | null>(null);
  // If the user navigated away mid-generation and came back, copilotState is
  // still "iterating" but our client didn't fire the generate stream. Show
  // the rehearsing pane and poll for the campaign until it transitions to
  // "ready".
  const [resuming, setResuming] = useState(
    initialCampaign.copilotState === "iterating",
  );
  const viewingSnapshot = iterations.find((s) => s.iteration === viewingIteration) ?? null;
  const displayFlow = viewingSnapshot?.flow ?? campaign.flow;
  // Resolved every render, so an id left pointing at a node the copilot has
  // since regenerated away simply reads as "not editing" — no effect needed
  // to null the id out afterwards.
  const editingNode = (editingNodeId ? campaign.flow.nodes[editingNodeId] : null) ?? null;
  const isEditingMessage = editingNode?.type === "message";

  useEffect(() => {
    fetch("/api/copilot/engine").then((r) => r.json()).then(setEngine);
  }, []);

  // Resume-on-return: if the campaign is still iterating when this page
  // mounts (user navigated away mid-run), poll every 2s and refresh state
  // until the server marks it "ready".
  useEffect(() => {
    if (!resuming) return;
    let cancelled = false;
    const id = setInterval(async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/campaigns/${campaign.id}`);
        if (!res.ok) return;
        const c: Campaign = await res.json();
        setCampaign(c);
        setMessages(c.copilotHistory ?? []);
        setIterations(c.copilotIterations ?? []);
        if (c.copilotSelectedIteration != null) {
          setViewingIteration(c.copilotSelectedIteration);
        }
        if (c.copilotState !== "iterating") {
          setResuming(false);
          onCampaignRefetched?.(c);
        }
      } catch { /* keep polling */ }
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [resuming, campaign.id, onCampaignRefetched]);

  async function saveMessageContent(nodeId: string, next: MessageContent) {
    const nextFlow: Flow = JSON.parse(JSON.stringify(campaign.flow));
    const node = nextFlow.nodes[nodeId];
    if (node?.type === "message") {
      node.content = next;
      node.channel = next.channel;
    }
    const res = await fetch(`/api/campaigns/${campaign.id}/flow`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextFlow),
    });
    const updated: Campaign = await res.json();
    setCampaign(updated);
    onCampaignRefetched?.(updated);
  }

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, generating]);

  const state = campaign.copilotState ?? "gathering";
  const hasFlow = Object.values(campaign.flow.nodes).some((n) => n.type === "message");

  async function sendMessage(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text) return;
    setSending(true);
    setInput("");

    const nowIso = new Date().toISOString();
    const userMsg: CopilotMessage = { id: `local-${Date.now()}`, role: "user", content: text, createdAt: nowIso };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await fetch("/api/copilot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: campaign.id, message: text }),
      });
      const { reply, intent } = await res.json();
      setMessages((prev) => [...prev, reply as CopilotMessage]);

      if (intent === "ready_to_generate" && !hasFlow) {
        await runGenerate("initial");
      } else if (intent === "modify_and_rerun" && hasFlow) {
        await runGenerate("modify");
      }
    } finally {
      setSending(false);
    }
  }

  async function runGenerate(mode: "initial" | "modify") {
    setGenerating(true);
    try {
      const res = await fetch("/api/copilot/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: campaign.id, mode }),
      });
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const evStr of events) {
          const dataLine = evStr.split("\n").find((l) => l.startsWith("data:"));
          if (!dataLine) continue;
          const payload = JSON.parse(dataLine.slice(5).trim());
          if (payload.type === "chat_message") {
            setMessages((prev) => [...prev, payload.message as CopilotMessage]);
          } else if (payload.type === "iteration_snapshot") {
            const snap = payload.snapshot as CopilotIteration;
            setIterations((prev) => {
              const filtered = prev.filter((s) => s.iteration !== snap.iteration);
              return [...filtered, snap].sort((a, b) => a.iteration - b.iteration);
            });
            setViewingIteration(snap.iteration);
          } else if (payload.type === "flow_ready" && mode === "initial") {
            setIterations([]);
            setViewingIteration(null);
          } else if (payload.type === "done") {
            const updated = payload.campaign as Campaign;
            setCampaign(updated);
            setIterations(updated.copilotIterations ?? []);
            setViewingIteration(updated.copilotSelectedIteration ?? updated.copilotIterations?.at(-1)?.iteration ?? null);
            onCampaignRefetched?.(updated);
          }
        }
      }
    } finally {
      setGenerating(false);
    }
  }

  const chatBody = useMemo(() => (
    <div className="flex flex-col h-full min-h-0">
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5">
        {messages.map((m) => (
          <MessageBubble key={m.id} msg={m} />
        ))}
        {sending && <TypingBubble label="thinking…" />}
        {(generating || resuming) && <TypingBubble label="rehearsing…" />}
      </div>
      <div className="p-2 border-t border-[var(--border)] bg-white shrink-0">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !sending && sendMessage()}
            placeholder={hasFlow ? "Ask for a tweak, or say 'launch it'" : "Reply to copilot, or say 'let's go'"}
            disabled={sending || generating || resuming}
            className="!text-[12.5px] !py-1.5"
          />
          <button
            className="btn btn-primary !py-1.5 !px-3 !text-[12.5px]"
            onClick={() => sendMessage()}
            disabled={sending || generating || resuming || !input.trim()}
          >
            Send
          </button>
        </div>
        {!hasFlow && !generating && !resuming && (
          <button
            className="mt-1.5 text-[11px] text-[var(--muted)] hover:text-[var(--foreground)] inline-flex items-center gap-1"
            onClick={() => sendMessage("Let's go — draft it and rehearse.")}
            disabled={sending || generating}
          >
            <PlayIcon /> Skip discussion — generate now
          </button>
        )}
      </div>
    </div>
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [messages, input, sending, generating, resuming, engine, state, hasFlow]);

  return (
    <>
      <RailSlot
        headerLabel=""
        headerTitle=""
        campaignId={campaign.id}
        hideDock
        hideHeader
        bodyFillHeight
        body={chatBody}
      />

      <div
        className="relative rounded-2xl overflow-hidden border border-[var(--border)] bg-white"
        style={{
          height: "calc(100vh - 208px)",
          minHeight: "560px",
        }}
      >
        <div className="canvas-dots relative flex flex-col overflow-hidden h-full">
          {!hasFlow && !generating && !resuming && <PlaceholderPane state={state} />}
          {(generating || resuming) && <RehearsingPane iterations={iterations} />}
          {hasFlow && !generating && !resuming && (
            <>
              {iterations.length > 0 && (
                <IterationSelector
                  iterations={iterations}
                  viewing={viewingIteration ?? iterations.at(-1)?.iteration ?? 1}
                  selected={campaign.copilotSelectedIteration ?? iterations.at(-1)?.iteration ?? 1}
                  onView={(i) => setViewingIteration(i)}
                  onKeep={async () => {
                    if (viewingIteration == null || committing) return;
                    setCommitting(true);
                    try {
                      const res = await fetch("/api/copilot/select-iteration", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ campaignId: campaign.id, iteration: viewingIteration }),
                      });
                      const updated: Campaign = await res.json();
                      setCampaign(updated);
                      onCampaignRefetched?.(updated);
                    } finally {
                      setCommitting(false);
                    }
                  }}
                  committing={committing}
                />
              )}
              <FlowSummaryPane
                campaign={{ ...campaign, flow: displayFlow, lastScore: viewingSnapshot?.score ?? campaign.lastScore }}
                onSelectNode={(id) => setEditingNodeId(id)}
                selectedNodeId={editingNode?.id ?? null}
                onOpenSchedule={(rect) => setScheduleAnchor(rect)}
                schedule={campaign.schedule}
              />
            </>
          )}
        </div>

        {scheduleAnchor && (
          <SchedulePopover
            campaign={campaign}
            anchor={scheduleAnchor}
            onClose={() => setScheduleAnchor(null)}
            onSaved={(c) => {
              setCampaign(c);
              onCampaignRefetched?.(c);
            }}
          />
        )}

        {isEditingMessage && editingNode && (
          <div className="absolute inset-0 bg-white flex flex-col animate-[composerin_180ms_cubic-bezier(0.16,1,0.3,1)] z-10">
            <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--border)] bg-white shrink-0">
              <button
                className="btn btn-ghost !py-1 !px-2 text-[13px]"
                onClick={() => setEditingNodeId(null)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
                Back to flow
              </button>
              <span className="text-[var(--muted-2)]">/</span>
              <span className="text-[13px] text-[var(--muted)]">Compose {editingNode.content.channel === "email" ? "email" : "SMS"}</span>
              <span className="ml-auto text-[11px] text-[var(--muted)]">Manual edits don&apos;t auto-rehearse — ask copilot to re-run when you&apos;re back.</span>
            </div>
            <div className="flex-1 min-h-0">
              <MessageComposer
                nodeId={editingNode.id}
                initial={editingNode.content}
                onSave={(next) => saveMessageContent(editingNode.id, next)}
                onClose={() => setEditingNodeId(null)}
                onDelete={() => setEditingNodeId(null)}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* ============================================================
   Flow-surface panes.
   ============================================================ */

function PlaceholderPane({ state }: { state: string }) {
  return (
    <div className="flex-1 grid place-items-center p-10 text-center">
      <div className="max-w-md">
        <div className="w-14 h-14 rounded-full bg-white border border-[var(--border)] grid place-items-center mx-auto text-[var(--foreground)]">
          <SparkleIcon large />
        </div>
        <h3 className="text-[15px] font-semibold mt-4">
          {state === "gathering" ? "Talking through the plan" : "Ready when you are"}
        </h3>
        <p className="text-[13px] text-[var(--muted)] mt-2 leading-relaxed">
          Your campaign will appear here once copilot drafts the flow and rehearses it against the simulated audience. Chat in the rail to shape the plan.
        </p>
      </div>
    </div>
  );
}

function RehearsingPane({ iterations }: { iterations: CopilotIteration[] }) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setNow(Date.now() - start), 250);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.floor(now / 1000);
  return (
    <div className="relative flex-1 overflow-hidden">
      <TwinAmbientField />
      {/* Center overlay — status + iteration progress */}
      <div className="absolute inset-0 grid place-items-center p-10 text-center pointer-events-none">
        <div className="relative">
          <div className="mx-auto w-14 h-14 rounded-full grid place-items-center bg-white/90 backdrop-blur border border-[var(--border)] shadow-sm">
            <Spinner />
          </div>
          <div className="mt-4 text-[14px] text-[var(--foreground)] font-semibold">
            Copilot is rehearsing against your simulated audience…
          </div>
          <div className="mt-1 text-[11.5px] text-[var(--muted)]">
            {iterations.length > 0
              ? `Iteration ${iterations.length + 1} of 3 · ${seconds}s elapsed`
              : `${seconds}s elapsed — watch the chat for live iteration results.`}
          </div>
          {iterations.length > 0 && (
            <div className="mt-3 flex justify-center gap-2">
              {iterations.map((s) => (
                <div key={s.iteration} className="chip chip-highlight !text-[10.5px]">
                  Iter {s.iteration} · {s.score}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* Ambient background — dozens of small "twin" dots reacting in staggered
 * waves. Deterministic per-index seed so the layout is stable across ticks
 * but the state cycles continuously. Respects prefers-reduced-motion. */
const TWIN_INITIALS = [
  "MJ", "DK", "AS", "JL", "RP", "CT", "EN", "BH", "SN", "LG",
  "AK", "TM", "IS", "VC", "OB", "PW", "FA", "HR", "YE", "ZL",
  "GM", "NA", "QF", "UD", "XS", "WB", "KO", "JC", "MR", "DP",
];

function TwinAmbientField() {
  const [tick, setTick] = useState(0);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setTick((t) => t + 1), 350);
    return () => clearInterval(id);
  }, [reduced]);

  const N = 54;
  return (
    <div className="absolute inset-0 p-6">
      <div
        className="grid gap-3 h-full opacity-[0.55]"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(38px, 1fr))" }}
      >
        {Array.from({ length: N }, (_, i) => (
          <TwinDot key={i} index={i} tick={reduced ? 0 : tick} reduced={reduced} />
        ))}
      </div>
    </div>
  );
}

type TwinState = "pending" | "opened" | "clicked" | "ignored" | "unsub";

function TwinDot({ index, tick, reduced }: { index: number; tick: number; reduced: boolean }) {
  // Each dot has its own rhythm — offset by prime multiples so waves don't sync.
  const phase = reduced ? 0 : (tick + index * 7) % 24;
  const state: TwinState =
    phase < 3 ? "pending"
    : phase < 7 ? "opened"
    : phase < 11 ? "clicked"
    : phase < 14 ? "clicked"
    : phase < 17 ? "ignored"
    : phase < 19 ? (index % 11 === 0 ? "unsub" : "ignored")
    : "pending";

  const style = STATE_STYLES[state];
  return (
    <div
      className="aspect-square rounded-full grid place-items-center text-[9px] font-semibold transition-all duration-500"
      style={{
        background: style.bg,
        color: style.fg,
        transform: state === "clicked" ? "scale(1.08)" : "scale(1)",
        boxShadow: state === "clicked" ? `0 0 0 3px ${style.ring}` : "none",
      }}
      aria-hidden
    >
      {TWIN_INITIALS[index % TWIN_INITIALS.length]}
    </div>
  );
}

const STATE_STYLES: Record<TwinState, { bg: string; fg: string; ring: string }> = {
  pending:  { bg: "#ececec", fg: "#9ca3af", ring: "transparent" },
  opened:   { bg: "#dbeafe", fg: "#1d4ed8", ring: "rgba(29,78,216,0.15)" },
  clicked:  { bg: "#bbf7d0", fg: "#166534", ring: "rgba(22,101,52,0.18)" },
  ignored:  { bg: "#f3f4f6", fg: "#9ca3af", ring: "transparent" },
  unsub:    { bg: "#fecaca", fg: "#991b1b", ring: "rgba(153,27,27,0.15)" },
};

function IterationSelector({
  iterations,
  viewing,
  selected,
  onView,
  onKeep,
  committing,
}: {
  iterations: CopilotIteration[];
  viewing: number;
  selected: number;
  onView: (i: number) => void;
  onKeep: () => void;
  committing: boolean;
}) {
  const isKept = selected === viewing;
  return (
    <div className="px-6 pt-3 pb-2 border-b border-[var(--border)] bg-white/95 backdrop-blur flex items-center justify-between gap-3">
      <div className="flex gap-4">
        {iterations.map((s) => {
          const active = viewing === s.iteration;
          const chosen = selected === s.iteration;
          return (
            <button
              key={s.iteration}
              onClick={() => onView(s.iteration)}
              title={s.appliedOppTitle ? `After copilot applied: ${s.appliedOppTitle}` : "Initial draft"}
              className={`relative pb-1.5 text-[13px] transition-colors flex items-center gap-2 ${
                active ? "text-[var(--foreground)] font-semibold" : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              <span>Draft {s.iteration}</span>
              <span className="tabular-nums text-[11.5px] text-[var(--muted-2)]">{s.score}</span>
              {chosen && (
                <span className="chip chip-success !text-[10px] !py-0 !px-1.5 !gap-1">
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                  Kept
                </span>
              )}
              {active && (
                <span className="absolute left-0 right-0 -bottom-[1px] h-[2px] bg-[var(--foreground)]" />
              )}
            </button>
          );
        })}
      </div>
      {!isKept && (
        <button
          onClick={onKeep}
          disabled={committing}
          className="text-[12px] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors font-medium"
        >
          {committing ? "Keeping…" : "Keep this draft →"}
        </button>
      )}
    </div>
  );
}


function FlowSummaryPane({
  campaign,
  onSelectNode,
  selectedNodeId,
  onOpenSchedule,
  schedule,
}: {
  campaign: Campaign;
  onSelectNode: (id: string) => void;
  selectedNodeId: string | null;
  onOpenSchedule: (rect: DOMRect) => void;
  schedule?: Campaign["schedule"];
}) {
  const nodes = useMemo(() => walkLinear(campaign), [campaign]);
  return (
    <div className="flex-1 p-8 overflow-y-auto">
      <div className="max-w-xl mx-auto">
        <div className="mb-4 text-center">
          <div className="inline-flex items-center gap-2 chip chip-accent">
            <SparkleIcon /> Drafted by copilot
          </div>
        </div>
        {nodes.map((n, i) => (
          <div key={n.id}>
            <NodeSummary
              node={n}
              selected={selectedNodeId === n.id}
              onSelect={n.type === "message" ? () => onSelectNode(n.id) : undefined}
              onOpenSchedule={n.type === "trigger" ? onOpenSchedule : undefined}
              schedule={n.type === "trigger" ? schedule : undefined}
            />
            {i < nodes.length - 1 && <div className="h-4 w-px bg-[var(--border-strong)] mx-auto" />}
          </div>
        ))}
        <div className="mt-6 text-[11.5px] text-[var(--muted)] text-center leading-relaxed">
          Rehearsals ran automatically. Latest score: <b className="text-[var(--foreground)] tabular-nums">{campaign.lastScore ?? "—"}/100</b>.<br />
          Click a message to review or edit copy. Ask copilot in the rail to tweak and re-rehearse.
        </div>
      </div>
    </div>
  );
}

function walkLinear(c: Campaign): FlowNode[] {
  const out: FlowNode[] = [];
  const seen = new Set<string>();
  let cur: string | undefined = c.flow.rootId;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const n: FlowNode | undefined = c.flow.nodes[cur];
    if (!n) break;
    out.push(n);
    cur = n.type === "split" ? n.yesNext : n.next;
  }
  return out;
}

function NodeSummary({
  node,
  selected,
  onSelect,
  onOpenSchedule,
  schedule,
}: {
  node: FlowNode;
  selected?: boolean;
  onSelect?: () => void;
  onOpenSchedule?: (rect: DOMRect) => void;
  schedule?: Campaign["schedule"];
}) {
  if (node.type === "trigger") {
    return (
      <TriggerCard
        audienceLabel={node.audienceLabel}
        schedule={schedule}
        onOpenSchedule={onOpenSchedule}
      />
    );
  }
  if (node.type === "delay") {
    return (
      <div className="card p-3 bg-white">
        <div className="eyebrow">Delay</div>
        <div className="text-[13px] mt-0.5 font-medium">{node.amount} {node.unit}</div>
      </div>
    );
  }
  if (node.type === "split") {
    return (
      <div className="card p-3 bg-white">
        <div className="eyebrow">Split</div>
        <div className="text-[13px] mt-0.5 font-medium">If {node.condition === "opened_previous" ? "opened previous" : "clicked previous"}</div>
      </div>
    );
  }
  return (
    <button
      className={`card p-3 bg-white text-left w-full transition-all ${
        selected
          ? "!border-[var(--foreground)] shadow-[0_0_0_3px_var(--accent-soft)]"
          : "hover:!border-[var(--border-strong)] hover:shadow-sm cursor-pointer"
      }`}
      onClick={onSelect}
    >
      <div className="eyebrow flex items-center gap-2">
        {node.channel === "email" ? <EmailIcon /> : <SmsIcon />}
        {node.channel === "email" ? "Email" : "SMS"}
        <span className="ml-auto text-[10px] text-[var(--muted-2)] font-normal normal-case tracking-normal">click to edit</span>
      </div>
      {node.content.channel === "email" ? (
        <EmailPreview email={node.content.email} />
      ) : (
        <SmsPreview msg={node.content.sms.message} />
      )}
    </button>
  );
}

function TriggerCard({
  audienceLabel,
  schedule,
  onOpenSchedule,
}: {
  audienceLabel: string;
  schedule?: Campaign["schedule"];
  onOpenSchedule?: (rect: DOMRect) => void;
}) {
  const scheduleLine = schedule ? summarizeSchedule(schedule) : null;
  return (
    <div>
      {onOpenSchedule && (
        <div className="flex justify-end mb-1.5">
          <button
            className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--muted)] hover:text-[var(--foreground)] px-2 py-1 rounded-md hover:bg-white transition-colors"
            title="Schedule & exclusions"
            aria-label="Open schedule"
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              onOpenSchedule(rect);
            }}
          >
            <CalendarIcon />
            Schedule
          </button>
        </div>
      )}
      <div className="card p-3 bg-white">
        <div className="eyebrow">Trigger</div>
        <div className="text-[13px] mt-0.5 font-medium truncate">{audienceLabel}</div>
        {scheduleLine && (
          <div className="text-[11px] text-[var(--muted)] mt-1 truncate">{scheduleLine}</div>
        )}
      </div>
    </div>
  );
}

function summarizeSchedule(s: NonNullable<Campaign["schedule"]>): string {
  const days = s.daysOfWeek?.length
    ? s.daysOfWeek.length === 7
      ? "every day"
      : s.daysOfWeek.length === 5 && s.daysOfWeek.every((d) => d >= 1 && d <= 5)
        ? "weekdays"
        : s.daysOfWeek
            .slice()
            .sort()
            .map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d])
            .join(", ")
    : "any day";
  const window = s.sendWindow
    ? `${fmtHour(s.sendWindow.startHour)}–${fmtHour(s.sendWindow.endHour)}`
    : null;
  const cap = s.frequencyCap ? `cap ${s.frequencyCap.max}/${s.frequencyCap.per}` : null;
  return [days, window, cap].filter(Boolean).join(" · ");
}

function fmtHour(h: number): string {
  const period = h < 12 ? "am" : "pm";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}${period}`;
}

function CalendarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

function EmailPreview({ email }: { email: import("@/lib/types").EmailContent }) {
  return (
    <div className="mt-1">
      <div className="text-[13px] font-semibold truncate">{email.subject || "(empty subject)"}</div>
      {email.preheader && (
        <div className="text-[11.5px] text-[var(--muted)] truncate mt-0.5">{email.preheader}</div>
      )}
      {email.body && (
        <p className="text-[12px] text-[var(--foreground)] mt-1.5 leading-relaxed line-clamp-3 whitespace-pre-wrap">
          {email.body}
        </p>
      )}
      {email.ctaText && (
        <div className="mt-2 text-[11px] text-[var(--muted)]">
          <span className="chip !text-[10px] !py-0 !px-1.5">CTA</span> {email.ctaText}
        </div>
      )}
    </div>
  );
}

function SmsPreview({ msg }: { msg: string }) {
  const chars = msg.length;
  const segments = Math.max(1, Math.ceil(chars / 160));
  return (
    <div className="mt-1.5">
      <p className="text-[12px] text-[var(--foreground)] leading-relaxed whitespace-pre-wrap">{msg || "(empty message)"}</p>
      <div className="mt-1.5 text-[10.5px] text-[var(--muted)]">{chars} chars · {segments} segment{segments === 1 ? "" : "s"}</div>
    </div>
  );
}

/* ============================================================
   Chat bubbles
   ============================================================ */

function MessageBubble({ msg }: { msg: CopilotMessage }) {
  const isUser = msg.role === "user";
  const isSystemish =
    msg.kind === "iteration_start" ||
    msg.kind === "iteration_result" ||
    msg.kind === "opportunity_applied" ||
    msg.kind === "final";
  if (isSystemish) return <SystemLine msg={msg} />;
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] px-2.5 py-1.5 text-[12.5px] leading-relaxed rounded-xl ${
          isUser
            ? "bg-[var(--foreground)] text-white"
            : "bg-gray-100 text-[var(--foreground)] border border-[var(--border)]"
        }`}
      >
        {renderContent(msg.content)}
      </div>
    </div>
  );
}

function SystemLine({ msg }: { msg: CopilotMessage }) {
  const badge =
    msg.kind === "iteration_start" ? { label: `Iter ${msg.iteration}`, cls: "chip" }
    : msg.kind === "iteration_result" ? { label: `Score ${msg.score}`, cls: "chip-highlight" }
    : msg.kind === "opportunity_applied" ? { label: "Applied", cls: "chip-accent" }
    : { label: "Done", cls: "chip-success" };
  return (
    <div className="flex items-start gap-2">
      <span className={`chip ${badge.cls} !text-[10px] shrink-0 mt-0.5`}>{badge.label}</span>
      <div className="text-[12px] text-[var(--muted)] leading-relaxed">{renderContent(msg.content)}</div>
    </div>
  );
}

function renderContent(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <b key={i}>{p.slice(2, -2)}</b>;
    return <span key={i}>{p}</span>;
  });
}

function TypingBubble({ label }: { label: string }) {
  return (
    <div className="flex justify-start">
      <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-gray-100 border border-[var(--border)] text-[11.5px] text-[var(--muted)]">
        <span className="inline-flex gap-0.5">
          <Dot delay={0} /> <Dot delay={120} /> <Dot delay={240} />
        </span>
        {label}
      </div>
    </div>
  );
}
function Dot({ delay }: { delay: number }) {
  return <span className="w-1 h-1 rounded-full bg-[var(--muted)] inline-block animate-pulse" style={{ animationDelay: `${delay}ms` }} />;
}

function SparkleIcon({ large }: { large?: boolean } = {}) {
  const s = large ? 24 : 14;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l1.7 4.6L18 8.3l-4.6 1.7L11.7 15 10 10l-4.6-1.7L10 6.6 12 2zm7 10l1 2.6 2.6 1-2.6 1L19 19l-1-2.6-2.6-1L18 14.4 19 12z" />
    </svg>
  );
}
function EmailIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>; }
function SmsIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="3" width="12" height="18" rx="2" /><path d="M10 18h4" /></svg>; }
function PlayIcon() { return <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>; }
function Spinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="animate-spin text-[var(--foreground)]" style={{ animationDuration: "900ms" }}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.15" strokeWidth="3" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
