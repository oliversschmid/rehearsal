"use client";
import { useMemo, useRef, useState } from "react";
import type { Campaign, Flow, FlowNode, MessageContent, Channel } from "@/lib/types";
import { MessageComposer } from "./MessageComposer";
import { SchedulePopover } from "./SchedulePopover";

/**
 * Flow editor.
 *   1. No right-hand Campaign Schedule column — the schedule lives behind
 *      a gear icon on the Trigger node.
 *   2. Flow canvas fills the full card width.
 */
export function FlowView({
  campaign,
  onCampaignChange,
  onScheduleSaved,
  onMessageEdited,
}: {
  campaign: Campaign;
  onCampaignChange: (c: Campaign) => void;
  onScheduleSaved: (c: Campaign) => void;
  /** Called any time a message node's content changes — used to flip the
   *  rail into a "stale" state without waiting for a save. */
  onMessageEdited: () => void;
}) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAnchor, setScheduleAnchor] = useState<DOMRect | null>(null);
  const gearRef = useRef<HTMLButtonElement>(null);
  const linearNodes = useMemo(() => walkLinear(campaign.flow), [campaign.flow]);

  function commitFlow(nextFlow: Flow) {
    onCampaignChange({ ...campaign, flow: nextFlow });
  }

  function insertAfter(parentId: string, kind: "message" | "delay" | "split", channel?: Channel) {
    const newId = `n${Date.now()}`;
    const flow = clone(campaign.flow);
    const parent = flow.nodes[parentId];
    if (!parent) return;
    const oldNext = getNext(parent);
    let newNode: FlowNode;
    if (kind === "delay") {
      newNode = { id: newId, type: "delay", amount: 3, unit: "days", next: oldNext };
    } else if (kind === "split") {
      newNode = { id: newId, type: "split", condition: "opened_previous", yesNext: oldNext };
    } else {
      newNode = {
        id: newId,
        type: "message",
        channel: channel ?? "email",
        content:
          (channel ?? "email") === "email"
            ? {
                channel: "email",
                email: { subject: "New email", preheader: "", body: "", ctaText: "See more", ctaUrl: "" },
              }
            : { channel: "sms", sms: { message: "" } },
        next: oldNext,
      };
    }
    setNext(parent, newId);
    flow.nodes[newId] = newNode;
    commitFlow(flow);
    if (kind === "message") setSelectedNodeId(newId);
  }

  function deleteNode(nodeId: string) {
    const flow = clone(campaign.flow);
    const gone = flow.nodes[nodeId];
    if (!gone) return;
    const goneNext = getNext(gone);
    for (const n of Object.values(flow.nodes)) {
      if (n.type === "split") {
        if (n.yesNext === nodeId) n.yesNext = goneNext;
        if (n.noNext === nodeId) n.noNext = goneNext;
      } else if (getNext(n) === nodeId) {
        setNext(n, goneNext);
      }
    }
    delete flow.nodes[nodeId];
    commitFlow(flow);
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
  }

  function saveMessage(nodeId: string, next: MessageContent) {
    const flow = clone(campaign.flow);
    const node = flow.nodes[nodeId];
    if (node?.type === "message") {
      node.content = next;
      node.channel = next.channel;
    }
    commitFlow(flow);
    onMessageEdited();
  }

  function updateDelay(nodeId: string, amount: number, unit: "hours" | "days") {
    const flow = clone(campaign.flow);
    const node = flow.nodes[nodeId];
    if (node?.type === "delay") {
      node.amount = amount;
      node.unit = unit;
    }
    commitFlow(flow);
  }

  // Resolving the id every render means a selection pointing at a node that
  // has since been removed simply reads as "nothing selected" — no effect
  // needed to null the id out afterwards.
  const selectedNode = (selectedNodeId ? campaign.flow.nodes[selectedNodeId] : null) ?? null;
  const isEditingMessage = selectedNode?.type === "message";

  return (
    <div className="rounded-2xl overflow-hidden border border-[var(--border)] min-h-[560px] relative flex flex-col">
      <div className="canvas-dots p-8 flex-1">
        <div className="max-w-md mx-auto">
          {linearNodes.map((n, i) => (
            <div key={n.id}>
              <NodeCard
                node={n}
                selected={selectedNode?.id === n.id}
                onSelect={() => n.type === "message" ? setSelectedNodeId(n.id) : setSelectedNodeId(null)}
                onDelay={updateDelay}
                onDelete={n.type !== "trigger" ? () => deleteNode(n.id) : undefined}
                onOpenSchedule={
                  n.type === "trigger"
                    ? (rect) => {
                        setScheduleAnchor(rect);
                        setScheduleOpen(true);
                      }
                    : undefined
                }
                gearRef={n.type === "trigger" ? gearRef : undefined}
              />
              {i < linearNodes.length - 1 && <Connector />}
              {i < linearNodes.length && (
                <InsertMenu onInsert={(kind, channel) => insertAfter(n.id, kind, channel)} />
              )}
              {i < linearNodes.length - 1 && <Connector />}
            </div>
          ))}
        </div>
      </div>

      {isEditingMessage && selectedNode && (
        <div className="absolute inset-0 bg-white flex flex-col animate-[composerin_180ms_cubic-bezier(0.16,1,0.3,1)]">
          <ComposerBackBar
            onBack={() => setSelectedNodeId(null)}
            channel={selectedNode.content.channel}
          />
          <div className="flex-1 min-h-0">
            <MessageComposer
              nodeId={selectedNode.id}
              initial={selectedNode.content}
              onSave={(next) => saveMessage(selectedNode.id, next)}
              onClose={() => setSelectedNodeId(null)}
              onDelete={() => deleteNode(selectedNode.id)}
            />
          </div>
        </div>
      )}

      {scheduleOpen && (
        <SchedulePopover
          campaign={campaign}
          anchor={scheduleAnchor}
          onClose={() => setScheduleOpen(false)}
          onSaved={onScheduleSaved}
        />
      )}
    </div>
  );
}

function ComposerBackBar({ onBack, channel }: { onBack: () => void; channel: "email" | "sms" }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--border)] bg-white">
      <button className="btn btn-ghost !py-1 !px-2 text-[13px]" onClick={onBack}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
        Back to flow
      </button>
      <span className="text-[var(--muted-2)]">/</span>
      <span className="text-[13px] text-[var(--muted)]">Compose {channel === "email" ? "email" : "SMS"}</span>
    </div>
  );
}

function walkLinear(flow: Flow): FlowNode[] {
  const out: FlowNode[] = [];
  const seen = new Set<string>();
  let cur: string | undefined = flow.rootId;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const n: FlowNode | undefined = flow.nodes[cur];
    if (!n) break;
    out.push(n);
    cur = n.type === "split" ? n.yesNext : n.next;
  }
  return out;
}
function getNext(n: FlowNode): string | undefined {
  return n.type === "split" ? n.yesNext : n.next;
}
function setNext(n: FlowNode, next: string | undefined) {
  if (n.type === "split") n.yesNext = next;
  else n.next = next;
}
function clone<T>(x: T): T { return JSON.parse(JSON.stringify(x)); }

function Connector() {
  return <div className="h-4 w-px bg-[var(--border-strong)] mx-auto" />;
}

function InsertMenu({ onInsert }: { onInsert: (kind: "message" | "delay" | "split", channel?: Channel) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex justify-center my-1 relative">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="w-7 h-7 rounded-full bg-white border border-[var(--border-strong)] text-[var(--muted)] hover:text-white hover:bg-[var(--foreground)] hover:border-[var(--foreground)] transition-colors grid place-items-center shadow-sm"
          title="Insert step"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
        </button>
      ) : (
        <div className="card p-2 flex items-center gap-1 shadow-lg z-10 bg-white">
          <button className="btn btn-ghost text-xs" onClick={() => { onInsert("message", "email"); setOpen(false); }}>
            <EmailIcon /> Email
          </button>
          <button className="btn btn-ghost text-xs" onClick={() => { onInsert("message", "sms"); setOpen(false); }}>
            <SmsIcon /> SMS
          </button>
          <button className="btn btn-ghost text-xs" onClick={() => { onInsert("delay"); setOpen(false); }}>⧗ Delay</button>
          <button className="btn btn-ghost text-xs" onClick={() => { onInsert("split"); setOpen(false); }}>⇆ Split</button>
          <button className="btn btn-ghost text-xs" onClick={() => setOpen(false)}>×</button>
        </div>
      )}
    </div>
  );
}

function EmailIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>;
}
function SmsIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="3" width="12" height="18" rx="2" /><path d="M10 18h4" /></svg>;
}

function NodeCard({
  node,
  selected,
  onSelect,
  onDelay,
  onDelete,
  onOpenSchedule,
  gearRef,
}: {
  node: FlowNode;
  selected: boolean;
  onSelect: () => void;
  onDelay: (id: string, n: number, u: "hours" | "days") => void;
  onDelete?: () => void;
  onOpenSchedule?: (anchor: DOMRect) => void;
  gearRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  if (node.type === "trigger") {
    return (
      <div>
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md mb-1.5 text-[11px] font-medium"
             style={{ background: "#ffe5df", color: "#a63e29" }}>
          <TriggerDot /> Trigger
        </div>
        <NodeShell selected={false} onClick={undefined}>
          <IconTile color="yellow"><TriggerIcon /></IconTile>
          <NodeBody>
            <NodeTitle>Enters audience</NodeTitle>
            <NodeSubtitle>{node.audienceLabel}</NodeSubtitle>
          </NodeBody>
          {onOpenSchedule && (
            <button
              ref={gearRef}
              className="p-1 text-[var(--muted-2)] hover:text-[var(--foreground)] rounded-md hover:bg-gray-100 shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onOpenSchedule(gearRef?.current?.getBoundingClientRect() ?? new DOMRect());
              }}
              aria-label="Edit schedule"
              title="Edit schedule"
            >
              <ScheduleIcon />
            </button>
          )}
        </NodeShell>
      </div>
    );
  }
  if (node.type === "delay") {
    return (
      <NodeShell selected={false}>
        <IconTile color="gray"><ClockIcon /></IconTile>
        <NodeBody>
          <NodeTitle>Wait</NodeTitle>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="number"
              min={1}
              max={30}
              value={node.amount}
              onChange={(e) => onDelay(node.id, Number(e.target.value), node.unit)}
              onClick={(e) => e.stopPropagation()}
              className="!w-14 !py-1 !text-[12.5px]"
            />
            <select
              value={node.unit}
              onChange={(e) => onDelay(node.id, node.amount, e.target.value as "hours" | "days")}
              onClick={(e) => e.stopPropagation()}
              className="!w-20 !py-1 !text-[12.5px]"
            >
              <option value="hours">hours</option>
              <option value="days">days</option>
            </select>
          </div>
        </NodeBody>
        {onDelete && <DeleteBtn onClick={onDelete} />}
      </NodeShell>
    );
  }
  if (node.type === "split") {
    return (
      <NodeShell selected={false}>
        <IconTile color="purple"><BranchIcon /></IconTile>
        <NodeBody>
          <NodeTitle>If / else</NodeTitle>
          <NodeSubtitle>
            If <b>{node.condition === "opened_previous" ? "opened previous" : "clicked previous"}</b>
          </NodeSubtitle>
        </NodeBody>
        {onDelete && <DeleteBtn onClick={onDelete} />}
      </NodeShell>
    );
  }
  // message
  const preview =
    node.content.channel === "email"
      ? node.content.email.subject || "(empty subject)"
      : node.content.sms.message.slice(0, 60) || "(empty message)";
  const channelName = node.channel === "email" ? "Send email" : "Send SMS";
  return (
    <NodeShell selected={selected} onClick={onSelect}>
      <IconTile color={node.channel === "email" ? "blue" : "green"}>
        {node.channel === "email" ? <EmailIcon /> : <SmsIcon />}
      </IconTile>
      <NodeBody>
        <div className="flex items-center gap-2 flex-wrap">
          <NodeTitle>{channelName}</NodeTitle>
          {node.draftedByAgent && (
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded"
              style={{ background: "#f3e8ff", color: "#6b21a8" }}
            >
              drafted by agent
            </span>
          )}
        </div>
        <NodeSubtitle>{preview}</NodeSubtitle>
      </NodeBody>
      {onDelete && (
        <DeleteBtn
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        />
      )}
    </NodeShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Node card scaffolding                                             */
/* ------------------------------------------------------------------ */

function NodeShell({
  children,
  selected,
  onClick,
}: {
  children: React.ReactNode;
  selected: boolean;
  onClick?: () => void;
}) {
  const clickable = !!onClick;
  return (
    <div
      className={`rounded-xl border p-3 flex items-start gap-3 bg-white transition-colors ${
        clickable ? "cursor-pointer" : ""
      }`}
      style={{
        borderColor: selected ? "var(--foreground)" : "#ececec",
        boxShadow: selected ? "0 0 0 3px var(--accent-soft)" : "none",
      }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

function NodeBody({ children }: { children: React.ReactNode }) {
  return <div className="min-w-0 flex-1">{children}</div>;
}

function NodeTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[14px] font-semibold text-[var(--foreground)] leading-tight">
      {children}
    </div>
  );
}

function NodeSubtitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[12.5px] text-[var(--muted)] mt-0.5 leading-relaxed truncate">
      {children}
    </div>
  );
}

const TILE_COLORS: Record<string, { bg: string; fg: string }> = {
  yellow: { bg: "#fef3d7", fg: "#a16207" },
  blue:   { bg: "#dbeafe", fg: "#1d4ed8" },
  green:  { bg: "#dcfce7", fg: "#166534" },
  purple: { bg: "#f3e8ff", fg: "#6b21a8" },
  gray:   { bg: "#f3f4f6", fg: "#4b5563" },
};

function IconTile({ color, children }: { color: keyof typeof TILE_COLORS | string; children: React.ReactNode }) {
  const c = TILE_COLORS[color as string] ?? TILE_COLORS.gray;
  return (
    <div
      className="w-8 h-8 rounded-[7px] grid place-items-center shrink-0"
      style={{ background: c.bg, color: c.fg }}
    >
      {children}
    </div>
  );
}

function TriggerDot() {
  return <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#a63e29" }} />;
}

function TriggerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="9" opacity="0.35" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function BranchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="5" r="2" />
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="19" r="2" />
      <path d="M6 7v10M6 12h8a4 4 0 014 4v1" />
    </svg>
  );
}

function ScheduleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

function DeleteBtn({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  return (
    <button className="btn btn-ghost !p-1 text-[var(--muted-2)] hover:text-[var(--danger)]" onClick={onClick} aria-label="Delete step">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M6 7v13a2 2 0 002 2h8a2 2 0 002-2V7M9 7V4h6v3" /></svg>
    </button>
  );
}
