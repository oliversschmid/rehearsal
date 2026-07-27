"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Channel, CopilotContext, TicketTheme } from "@/lib/types";

const GREETINGS = [
  "What are we building today?",
  "Let's get started.",
  "Ready to draft something new?",
  "What's the campaign in your head?",
  "Give me a goal — I'll take it from there.",
  "Where should this send land?",
  "What audience are we trying to move?",
  "Tell me the outcome, I'll write the plan.",
  "What are we saying, and to whom?",
  "Let's rehearse a campaign together.",
  "Sketch the ask — I'll shape the rest.",
  "What win are we chasing this week?",
  "What message would earn a reply?",
  "Big idea, small brief — either works.",
  "Where should we point our simulated audience?",
];

function randomGreeting(): string {
  return GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
}

const THEME_OPTIONS: { value: TicketTheme; label: string }[] = [
  { value: "shipping-delay", label: "Shipping delay" },
  { value: "shade-mismatch", label: "Shade mismatch" },
  { value: "subscription-cancel", label: "Subscription cancel" },
  { value: "ingredient-question", label: "Ingredient question" },
  { value: "damaged-item", label: "Damaged item" },
  { value: "discount-request", label: "Discount request" },
];

type PastCampaign = { id: string; name: string; lastScore?: number; tags: string[] };

export function CopilotStartModal({
  audiences,
  onClose,
}: {
  audiences: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [audienceGroupId, setAudienceGroupId] = useState<string | undefined>();
  const [themes, setThemes] = useState<Set<TicketTheme>>(new Set());
  const [referenceIds, setReferenceIds] = useState<Set<string>>(new Set());
  const [pastCampaigns, setPastCampaigns] = useState<PastCampaign[]>([]);
  const [channels, setChannels] = useState<Set<Channel>>(new Set(["email", "sms"]));
  const [openPicker, setOpenPicker] = useState<"audience" | "themes" | "refs" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // Rotates each time the modal mounts (one greeting per new-campaign session)
  const greeting = useMemo(() => randomGreeting(), []);

  useEffect(() => {
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then((rows) => {
        setPastCampaigns(
          (rows as PastCampaign[])
            .filter((c) => (c as unknown as { historicalOutcome?: unknown }).historicalOutcome)
            .slice(0, 12),
        );
      });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function start() {
    if (!prompt.trim() || !audienceGroupId || submitting) return;
    setSubmitting(true);
    const ctx: CopilotContext = {
      audienceGroupId,
      ticketThemes: [...themes],
      referenceCampaignIds: [...referenceIds],
      channels: [...channels],
    };
    const res = await fetch("/api/copilot/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: prompt.trim(), context: ctx }),
    });
    const { id } = await res.json();
    router.push(`/campaigns/${id}`);
  }

  const audienceLabel = audienceGroupId ? audiences.find((a) => a.id === audienceGroupId)?.name : null;
  const themeCount = themes.size;
  const refCount = referenceIds.size;
  const canSubmit = prompt.trim().length > 4 && !!audienceGroupId && channels.size > 0;

  function toggleChannel(ch: Channel) {
    setChannels((prev) => {
      const next = new Set(prev);
      if (next.has(ch)) next.delete(ch); else next.add(ch);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center animate-[fadein_120ms_ease-out] p-6" onClick={onClose}>
      <div
        ref={rootRef}
        onClick={(e) => e.stopPropagation()}
        className="card bg-white w-full max-w-[720px] shadow-2xl animate-[composerin_180ms_cubic-bezier(0.16,1,0.3,1)]"
      >
        <div className="px-5 pt-5 pb-1 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-[17px] font-semibold tracking-tight leading-tight">{greeting}</h3>
          </div>
          <button onClick={onClose} className="btn btn-ghost !p-1.5" aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="px-5 pt-3 pb-3">
          <textarea
            autoFocus
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Reactivate lapsed first-timers without offering a discount. Emphasize what we've improved since they last bought."
            className="!text-[13.5px] !leading-relaxed !py-2.5 !px-3 resize-none"
          />
        </div>

        <div className="px-5 pb-4 relative">
          <div className="flex items-center gap-2 flex-wrap">
            <ContextPill
              active={!!audienceGroupId}
              label={audienceLabel ?? "Audience"}
              onClick={() => setOpenPicker(openPicker === "audience" ? null : "audience")}
              required
            />
            <ContextPill
              active={themeCount > 0}
              label={themeCount > 0 ? `${themeCount} ticket theme${themeCount === 1 ? "" : "s"}` : "Ticket themes"}
              onClick={() => setOpenPicker(openPicker === "themes" ? null : "themes")}
            />
            <ContextPill
              active={refCount > 0}
              label={refCount > 0 ? `${refCount} past campaign${refCount === 1 ? "" : "s"}` : "Previous campaigns"}
              onClick={() => setOpenPicker(openPicker === "refs" ? null : "refs")}
            />
            <ChannelToggle label="Email" on={channels.has("email")} onClick={() => toggleChannel("email")} />
            <ChannelToggle label="SMS" on={channels.has("sms")} onClick={() => toggleChannel("sms")} />
          </div>

          {openPicker === "audience" && (
            <PopoverPanel onClose={() => setOpenPicker(null)}>
              <div className="text-[11px] text-[var(--muted)] uppercase tracking-wider px-3 pt-3 pb-1">Select an audience</div>
              {audiences.map((a) => {
                const selected = audienceGroupId === a.id;
                return (
                  <button
                    key={a.id}
                    className="w-full text-left px-3 py-2 text-[13px] flex items-center justify-between gap-2 hover:bg-gray-50"
                    style={
                      selected
                        ? { background: "#ffe5df", color: "#c04a35", fontWeight: 500 }
                        : undefined
                    }
                    onClick={() => { setAudienceGroupId(a.id); setOpenPicker(null); }}
                  >
                    <span className="truncate">{a.name}</span>
                    {selected && <CheckIcon />}
                  </button>
                );
              })}
            </PopoverPanel>
          )}

          {openPicker === "themes" && (
            <PopoverPanel onClose={() => setOpenPicker(null)}>
              <div className="text-[11px] text-[var(--muted)] uppercase tracking-wider px-3 pt-3 pb-1">Toggle ticket themes</div>
              {THEME_OPTIONS.map((t) => {
                const on = themes.has(t.value);
                return (
                  <label key={t.value} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => {
                        const next = new Set(themes);
                        if (next.has(t.value)) next.delete(t.value); else next.add(t.value);
                        setThemes(next);
                      }}
                    />
                    <span className="text-[13px]">{t.label}</span>
                  </label>
                );
              })}
            </PopoverPanel>
          )}

          {openPicker === "refs" && (
            <PopoverPanel onClose={() => setOpenPicker(null)}>
              <div className="text-[11px] text-[var(--muted)] uppercase tracking-wider px-3 pt-3 pb-1">
                Reference past campaigns
              </div>
              {pastCampaigns.length === 0 && <div className="text-[12px] text-[var(--muted)] px-3 py-4">No sent campaigns yet.</div>}
              {pastCampaigns.map((c) => {
                const on = referenceIds.has(c.id);
                return (
                  <label key={c.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => {
                        const next = new Set(referenceIds);
                        if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
                        setReferenceIds(next);
                      }}
                    />
                    <span className="text-[13px] font-medium truncate flex-1 min-w-0">{c.name}</span>
                    {c.tags.length > 0 && (
                      <span className="text-[10.5px] text-[var(--muted)] shrink-0 truncate max-w-[40%]">
                        {c.tags.join(", ")}
                      </span>
                    )}
                  </label>
                );
              })}
            </PopoverPanel>
          )}

        </div>

        <div className="px-5 py-3 border-t border-[var(--border)] flex items-center justify-between gap-3">
          <p className="text-[11.5px] text-[var(--muted)]">
            {!audienceGroupId ? "Pick an audience to continue." : "You can add more context in chat after this."}
          </p>
          <div className="flex gap-2">
            <button className="btn btn-secondary !py-1.5 !px-3 !text-[12.5px]" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary !py-1.5 !px-3 !text-[12.5px]" onClick={start} disabled={!canSubmit || submitting}>
              {submitting ? "Starting…" : "Start with copilot"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContextPill({
  active,
  label,
  required,
  onClick,
}: {
  active: boolean;
  label: string;
  required?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="chip cursor-pointer !text-[12px]"
      style={
        active
          ? { background: "#ffe5df", color: "#c04a35" }
          : undefined
      }
    >
      {active ? <CheckIcon /> : <PlusIcon />}
      {label}
      {required && !active && <span className="text-[var(--danger)] ml-0.5">*</span>}
    </button>
  );
}

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

/** Filled blue when on, hollow when off. No popover — direct toggle. */
function ChannelToggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="chip cursor-pointer !text-[12px] transition-colors"
      style={
        on
          ? { background: "#ffe5df", color: "#c04a35" }
          : undefined
      }
      aria-pressed={on}
      title={on ? `${label} is on — click to remove from the flow` : `${label} is off — click to add`}
    >
      {label === "Email" ? <EmailIcon /> : <SmsIcon />}
      {label}
    </button>
  );
}

function EmailIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>;
}
function SmsIcon() {
  return <svg width="10" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="3" width="12" height="18" rx="2" /><path d="M10 18h4" /></svg>;
}

function PopoverPanel({ children, onClose: _onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="absolute left-8 right-8 top-full mt-1 card bg-white shadow-xl z-20 max-h-72 overflow-y-auto">
      {children}
    </div>
  );
}

function SparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l1.7 4.6L18 8.3l-4.6 1.7L11.7 15 10 10l-4.6-1.7L10 6.6 12 2zm7 10l1 2.6 2.6 1-2.6 1L19 19l-1-2.6-2.6-1L18 14.4 19 12z" />
    </svg>
  );
}
function PlusIcon() {
  return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;
}
