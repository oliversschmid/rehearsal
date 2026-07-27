"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ALL_CAMPAIGN_TAGS, TAG_LABEL } from "@/lib/types";
import type { CampaignTag } from "@/lib/types";

/* ============================================================
   Manual create — centered popup, matching the copilot modal's shell
   ============================================================ */

export function ManualCreateModal({
  audiences,
  onClose,
}: {
  audiences: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [audienceGroupId, setAudienceGroupId] = useState(audiences[0]?.id ?? "");
  const [tags, setTags] = useState<CampaignTag[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    setSubmitting(true);
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name || "Untitled campaign",
        goal,
        audienceGroupId,
        tags,
        audienceLabel: audiences.find((a) => a.id === audienceGroupId)?.name,
      }),
    });
    const c = await res.json();
    router.push(`/campaigns/${c.id}`);
  }

  function toggleTag(t: CampaignTag) {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center animate-[fadein_120ms_ease-out] p-6" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="card bg-white w-full max-w-[960px] shadow-2xl animate-[composerin_180ms_cubic-bezier(0.16,1,0.3,1)]"
      >
        <div className="px-8 pt-8 pb-2 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-[var(--foreground)] text-white grid place-items-center shrink-0">
              <PencilIcon />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-[var(--muted)] font-medium">Manual build</div>
              <h2 className="text-[24px] font-semibold tracking-tight mt-0.5 leading-tight">Build your campaign from scratch</h2>
              <p className="text-[13px] text-[var(--muted)] mt-2 leading-relaxed max-w-xl">
                Fill in the basics — you&apos;ll design the flow and write the copy yourself, then rehearse when you&apos;re ready.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost !p-2" aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="p-8 pt-4 grid gap-5" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Spring Winback" />
          </div>
          <div>
            <label>Audience</label>
            <select value={audienceGroupId} onChange={(e) => setAudienceGroupId(e.target.value)}>
              {audiences.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label>Goal — what should this campaign accomplish?</label>
            <textarea
              rows={4}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Reactivate customers who lapsed after their first purchase, without leaning on a discount."
              className="!py-3.5 !px-4"
            />
            <p className="mt-1 text-[11px] text-[var(--muted)]">The rehearsal engine will use your goal verbatim when scoring the campaign.</p>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label>Tags</label>
            <div className="flex gap-2 flex-wrap">
              {ALL_CAMPAIGN_TAGS.map((t) => {
                const on = tags.includes(t);
                const c = tagColor(t);
                return (
                  <button
                    key={t}
                    onClick={() => toggleTag(t)}
                    type="button"
                    className="cursor-pointer inline-flex items-center transition-colors"
                    style={{
                      padding: "4px 10px",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 500,
                      background: on ? c.bg : "#f3f3f2",
                      color: on ? c.fg : "#6b7280",
                      border: "none",
                    }}
                  >
                    {TAG_LABEL[t]}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-[var(--muted)]">Tags class the campaign so the score compares apples to apples.</p>
          </div>
        </div>

        <div className="px-8 py-5 border-t border-[var(--border)] flex items-center justify-end gap-2">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary !py-2.5 !px-4" onClick={submit} disabled={submitting || !audienceGroupId}>
            {submitting ? "Creating…" : "Create campaign"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Deterministic per-tag color so each tag reads distinct when selected. */
const TAG_PALETTE: { bg: string; fg: string }[] = [
  { bg: "#eaf6ef", fg: "#116534" }, // green
  { bg: "#e7f0ff", fg: "#1e40af" }, // blue
  { bg: "#fef7e3", fg: "#8a5b00" }, // yellow
  { bg: "#f3e8ff", fg: "#6b21a8" }, // purple
  { bg: "#fdecec", fg: "#9b1c1c" }, // red
  { bg: "#ffe4ec", fg: "#9d174d" }, // pink
  { bg: "#d6f4ee", fg: "#115e59" }, // teal
  { bg: "#fce6d3", fg: "#9a3412" }, // orange
];

function tagColor(t: string): { bg: string; fg: string } {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return TAG_PALETTE[(h >>> 0) % TAG_PALETTE.length];
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15.232 5.232a2.5 2.5 0 013.536 3.536L7.5 20H4v-3.5L15.232 5.232z" />
    </svg>
  );
}
