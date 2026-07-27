"use client";
import { useEffect, useRef, useState } from "react";
import type { Customer } from "@/lib/types";

type ChatMsg = { id: string; role: "user" | "assistant"; content: string };

/**
 * Full-height chat block used on the twin detail rail. Renders inside the
 * rail scroll body; the actual input lives in the CopilotDock — but for a
 * dedicated twin page, we want a self-contained chat instead of routing via
 * the shared dock. So this block owns its own input.
 */
export function AskThisCustomerBlock({ customer }: { customer: Customer }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length, sending]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    const userMsg: ChatMsg = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);
    try {
      const res = await fetch("/api/twin-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customer.id,
          message: text,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const body = await res.json();
      const reply: ChatMsg = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content:
          typeof body?.reply === "string"
            ? body.reply
            : body?.reply?.content ?? "…",
      };
      setMessages((prev) => [...prev, reply]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: "Couldn't reach the twin. Try again.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-full min-h-[400px]">
      <div className="text-[10.5px] uppercase tracking-wider text-[var(--muted)] font-medium mb-2">
        Ask {customer.firstName}
      </div>
      <div
        ref={listRef}
        className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1"
      >
        {messages.length === 0 && (
          <div className="text-[12px] text-[var(--muted)] leading-relaxed">
            Ask anything about {customer.firstName}&apos;s orders, tickets, or
            what they&apos;d think of a campaign. Answers are grounded in this
            twin&apos;s real data.
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[90%] px-2.5 py-1.5 text-[12.5px] leading-relaxed rounded-xl ${
                m.role === "user"
                  ? "bg-[var(--foreground)] text-white"
                  : "bg-gray-100 text-[var(--foreground)] border border-[var(--border)]"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-gray-100 border border-[var(--border)] text-[11.5px] text-[var(--muted)]">
              thinking…
            </div>
          </div>
        )}
      </div>
      <div className="pt-2 mt-2 border-t border-[var(--border)] flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          disabled={sending}
          placeholder="Ask this customer…"
          className="!text-[13px] !py-1.5"
        />
        <button
          className="btn btn-primary !py-1.5 !px-3 text-[13px]"
          disabled={sending || !input.trim()}
          onClick={send}
        >
          Send
        </button>
      </div>
    </div>
  );
}
