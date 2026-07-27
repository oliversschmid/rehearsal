"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRail } from "./RailContext";
import type { CopilotMessage } from "@/lib/types";

export function CopilotDock({
  placeholder,
  campaignId,
}: {
  placeholder?: string;
  campaignId?: string;
}) {
  const { copilot } = useRail();
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Click-away collapses the expanded dock.
  useEffect(() => {
    if (!expanded) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [expanded]);

  // Auto-scroll when new messages arrive.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [copilot.messages.length, expanded]);

  // Filter messages to only ones from this campaign context (or global if no
  // campaignId). Users still see their own messages either way.
  const visible = copilot.messages.filter((m) => {
    if (!campaignId) return !m.campaignId;
    return m.campaignId === campaignId || !m.campaignId;
  });

  const lastExchange = visible.slice(-2);

  async function send() {
    const text = input.trim();
    if (!text || copilot.sending) return;
    setInput("");
    copilot.appendUser(text, campaignId);
    copilot.setSending(true);
    try {
      if (campaignId) {
        const res = await fetch("/api/copilot/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId, message: text }),
        });
        if (res.ok) {
          const { reply } = await res.json();
          copilot.appendAssistant(reply as CopilotMessage, campaignId);
        } else {
          copilot.appendAssistant(
            {
              id: `err-${Date.now()}`,
              role: "assistant",
              content: "Sorry — I couldn't reach copilot. Try again in a moment.",
              createdAt: new Date().toISOString(),
            },
            campaignId,
          );
        }
      } else {
        // List-level chat: no campaign context — reply locally with a nudge.
        copilot.appendAssistant(
          {
            id: `local-${Date.now()}`,
            role: "assistant",
            content:
              "Open a specific campaign to iterate on it, or say 'draft a campaign' to start a new one.",
            createdAt: new Date().toISOString(),
          },
          undefined,
        );
      }
    } finally {
      copilot.setSending(false);
    }
  }

  return (
    <div
      ref={wrapRef}
      className="shrink-0 border-t border-[var(--border)] bg-white flex flex-col"
      style={{
        height: expanded ? "60%" : "120px",
        transition: "height 180ms cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      {copilot.streamStatus && (
        <StreamStatusLine status={copilot.streamStatus} />
      )}
      <div
        ref={listRef}
        className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-2 cursor-text"
        onClick={() => {
          if (!expanded) setExpanded(true);
        }}
      >
        {(expanded ? visible : lastExchange).length === 0 ? (
          <div className="text-[11.5px] text-[var(--muted-2)] italic px-1">
            No messages yet. Say hi.
          </div>
        ) : (
          (expanded ? visible : lastExchange).map((m) => (
            <MessageBubble key={m.id} msg={m} />
          ))
        )}
        {copilot.sending && <TypingBubble />}
      </div>
      <div className="p-2 border-t border-[var(--border)] bg-white shrink-0 flex gap-2">
        <input
          className="!text-[13px] !py-1.5"
          placeholder={placeholder ?? "Ask copilot…"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setExpanded(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          disabled={copilot.sending}
        />
        <button
          className="btn btn-primary !py-1.5 !px-3 text-[13px]"
          onClick={send}
          disabled={copilot.sending || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}

function StreamStatusLine({
  status,
}: {
  status: NonNullable<ReturnType<typeof useRail>["copilot"]["streamStatus"]>;
}) {
  return (
    <div className="px-3 py-1.5 border-b border-[var(--border)] bg-[var(--accent-soft)] text-[11.5px] text-[var(--foreground)] flex items-center gap-2">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--highlight)] animate-pulse" />
      <span className="truncate">{status.label}</span>
      <Link
        className="ml-auto text-[var(--accent)] hover:underline font-medium"
        href={`/campaigns/${status.campaignId}`}
      >
        {status.campaignName} →
      </Link>
    </div>
  );
}

/** Reused inside the dock — deliberately duplicated from CopilotWorkspace. */
function MessageBubble({ msg }: { msg: CopilotMessage }) {
  const isUser = msg.role === "user";
  const isSystemish =
    msg.kind === "iteration_start" ||
    msg.kind === "iteration_result" ||
    msg.kind === "opportunity_applied" ||
    msg.kind === "final";

  if (isSystemish) {
    const badge =
      msg.kind === "iteration_start"
        ? { label: `Iter ${msg.iteration}`, cls: "chip" }
        : msg.kind === "iteration_result"
        ? { label: `Score ${msg.score}`, cls: "chip-highlight" }
        : msg.kind === "opportunity_applied"
        ? { label: "Applied", cls: "chip-accent" }
        : { label: "Done", cls: "chip-success" };
    return (
      <div className="flex items-start gap-2">
        <span className={`chip ${badge.cls} !text-[10px] shrink-0 mt-0.5`}>
          {badge.label}
        </span>
        <div className="text-[12px] text-[var(--muted)] leading-relaxed">
          {renderContent(msg.content)}
        </div>
      </div>
    );
  }

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

function renderContent(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <b key={i}>{p.slice(2, -2)}</b>;
    return <span key={i}>{p}</span>;
  });
}

function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-gray-100 border border-[var(--border)] text-[11.5px] text-[var(--muted)]">
        <span className="inline-flex gap-0.5">
          <span
            className="w-1 h-1 rounded-full bg-[var(--muted)] inline-block animate-pulse"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="w-1 h-1 rounded-full bg-[var(--muted)] inline-block animate-pulse"
            style={{ animationDelay: "120ms" }}
          />
          <span
            className="w-1 h-1 rounded-full bg-[var(--muted)] inline-block animate-pulse"
            style={{ animationDelay: "240ms" }}
          />
        </span>
        thinking…
      </div>
    </div>
  );
}
