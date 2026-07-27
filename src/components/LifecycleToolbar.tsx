"use client";
import { useEffect, useRef, useState } from "react";
import type { CampaignStatus } from "@/lib/types";

export type LifecycleAction = "launch" | "pause" | "resume" | "stop" | "archive" | "unarchive";

/** Which actions are allowed for a given status. */
function allowedActions(status: CampaignStatus): Record<LifecycleAction, boolean> {
  return {
    launch:    false, // Launch is disabled in the sandbox build; see build note.
    pause:     status === "active",
    resume:    status === "paused",
    stop:      ["active", "paused"].includes(status),
    archive:   status === "completed" || status === "sent",
    unarchive: status === "archived",
  };
}

/** Human-friendly reason a button is disabled. */
function disabledReason(action: LifecycleAction, status: CampaignStatus): string | undefined {
  if (allowedActions(status)[action]) return undefined;
  switch (action) {
    case "launch":    return "Launch is disabled in this build";
    case "pause":     return "Only live campaigns can be paused";
    case "resume":    return "Only paused campaigns can be resumed";
    case "stop":      return "Only live or paused campaigns can be stopped";
    case "archive":   return "Only completed campaigns can be archived";
    case "unarchive": return "Only archived campaigns can be unarchived";
  }
}

const ACTION_META: Record<LifecycleAction, { label: string; icon: React.ReactNode; helper?: string; destructive?: boolean }> = {
  launch:    { label: "Launch campaign", icon: <PlayIcon />, helper: "Disabled in this sandbox build" },
  pause:     { label: "Pause",           icon: <PauseIcon />, helper: "Temporarily halt sending" },
  resume:    { label: "Start",           icon: <PlayIcon />, helper: "Resume sending where you left off" },
  stop:      { label: "Stop",            icon: <StopIcon />, helper: "End the campaign, moves to Completed", destructive: true },
  archive:   { label: "Archive",         icon: <ArchiveIcon />, helper: "Hide from the main list", destructive: true },
  unarchive: { label: "Unarchive",       icon: <ArchiveIcon />, helper: "Restore to the main list" },
};

/** Which action is the recommended primary for a given status. Returns null
 *  when there's no meaningful lifecycle action for this state (e.g. draft
 *  campaigns in the sandbox build where launch is disabled). */
function primaryActionFor(status: CampaignStatus): LifecycleAction | null {
  switch (status) {
    case "active":    return "pause";
    case "paused":    return "resume";
    case "completed":
    case "sent":      return "archive";
    case "archived":  return "unarchive";
    default:          return null;
  }
}

const CONFIRM_ACTIONS: Set<LifecycleAction> = new Set(["stop", "archive"]);

export function LifecycleToolbar({
  status,
  onAction,
}: {
  status: CampaignStatus;
  onAction: (a: LifecycleAction) => Promise<void> | void;
}) {
  const [pending, setPending] = useState<LifecycleAction | null>(null);
  const [confirm, setConfirm] = useState<LifecycleAction | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onAway(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onAway);
    return () => document.removeEventListener("mousedown", onAway);
  }, []);

  const primary = primaryActionFor(status);
  const primaryMeta = primary ? ACTION_META[primary] : null;
  const primaryAllowed = primary ? allowedActions(status)[primary] : false;
  const primaryReason = primary ? disabledReason(primary, status) : undefined;

  async function run(a: LifecycleAction) {
    setMenuOpen(false);
    if (CONFIRM_ACTIONS.has(a)) { setConfirm(a); return; }
    setPending(a);
    try { await onAction(a); } finally { setPending(null); }
  }
  async function doConfirmed() {
    if (!confirm) return;
    setPending(confirm);
    try { await onAction(confirm); } finally { setPending(null); setConfirm(null); }
  }

  const ALL_ACTIONS: LifecycleAction[] = ["pause", "resume", "stop", "archive", "unarchive"];

  // No lifecycle actions apply to pre-launch statuses in this sandbox build.
  if (!primary || !primaryMeta) return null;

  return (
    <>
      <div className="inline-flex items-stretch rounded-md shadow-sm border border-[var(--border)] bg-white overflow-hidden" ref={wrapRef}>
        <button
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-[13px] font-medium bg-[var(--foreground)] text-white hover:bg-[#262626] transition-colors ${primaryMeta.destructive ? "hover:bg-[var(--danger)]" : ""}`}
          disabled={!primaryAllowed || pending === primary}
          title={primaryReason}
          onClick={() => run(primary)}
        >
          {primaryMeta.icon}
          {pending === primary ? "Working…" : primaryMeta.label}
        </button>
        <button
          className="w-8 grid place-items-center bg-[var(--foreground)] text-white border-l border-white/20 hover:bg-[#262626] transition-colors"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="More actions"
          aria-expanded={menuOpen}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform ${menuOpen ? "rotate-180" : ""}`}>
            <path d="M6 9l6 6 6-6" strokeLinecap="round" />
          </svg>
        </button>

        {menuOpen && (
          <div className="absolute mt-9 right-0 z-30 card overflow-hidden shadow-xl bg-white w-48" style={{ marginTop: "40px" }}>
            <ul>
              {ALL_ACTIONS.map((a) => {
                const meta = ACTION_META[a];
                const allowed = allowedActions(status)[a];
                const reason = disabledReason(a, status);
                return (
                  <li key={a}>
                    <button
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                        allowed ? "hover:bg-gray-50 cursor-pointer" : "opacity-45 cursor-not-allowed"
                      } ${meta.destructive && allowed ? "hover:text-[var(--danger)]" : ""}`}
                      onClick={() => allowed && run(a)}
                      disabled={!allowed || pending === a}
                      title={reason}
                    >
                      <div className="w-4 h-4 grid place-items-center text-[var(--muted)] shrink-0">{meta.icon}</div>
                      <div className="text-[13px] font-medium">{meta.label}</div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {confirm && (
        <ConfirmDialog
          action={confirm}
          onCancel={() => setConfirm(null)}
          onConfirm={doConfirmed}
          pending={pending === confirm}
        />
      )}
    </>
  );
}

function ConfirmDialog({
  action,
  onCancel,
  onConfirm,
  pending,
}: {
  action: LifecycleAction;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  const copy = {
    stop: {
      title: "Stop this campaign?",
      body: "Stopping ends the send permanently. It moves to Completed and any remaining recipients won't receive further steps in this flow.",
      cta: "Stop campaign",
    },
    archive: {
      title: "Archive this campaign?",
      body: "Archived campaigns are hidden from the main list. You can unarchive later — no data is lost.",
      cta: "Archive",
    },
  }[action as "stop" | "archive"];
  if (!copy) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40" onClick={onCancel}>
      <div className="card p-6 max-w-md m-4 bg-white" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold">{copy.title}</h3>
        <p className="text-[13.5px] text-[var(--muted)] mt-2 leading-relaxed">{copy.body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn btn-secondary" onClick={onCancel} disabled={pending}>Cancel</button>
          <button
            className={action === "stop" ? "btn btn-danger" : "btn btn-primary"}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? "Working…" : copy.cta}
          </button>
        </div>
      </div>
    </div>
  );
}

function PlayIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>; }
function PauseIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>; }
function StopIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1.5" /></svg>; }
function ArchiveIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8" /><path d="M10 12h4" strokeLinecap="round" /></svg>; }
