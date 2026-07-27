"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SlideOver } from "./SlideOver";
import type { TicketTheme } from "@/lib/types";
import { GROUNDING_LABEL } from "./ScoreBadge";

type PreviewMatch = {
  id: string;
  name: string;
  grounding: "rich" | "medium" | "thin";
  orderCount: number;
  matchingTickets: { id: string; theme: string; date: string; excerpt: string }[];
};

const THEME_OPTIONS: { value: TicketTheme; label: string; hint: string }[] = [
  { value: "shipping-delay", label: "Shipping delay", hint: "late deliveries, stuck in transit" },
  { value: "shade-mismatch", label: "Shade mismatch", hint: "wrong color, swatch off" },
  { value: "subscription-cancel", label: "Subscription cancel", hint: "cancelled, often citing price" },
  { value: "ingredient-question", label: "Ingredient question", hint: "safety, pregnancy, allergies" },
  { value: "damaged-item", label: "Damaged item", hint: "broken bottle, jammed pump" },
  { value: "discount-request", label: "Discount request", hint: "asking for a code" },
];

export function NewAudienceGroupButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        New audience
      </button>
      {open && <NewAudienceGroupSlideOver onClose={() => setOpen(false)} />}
    </>
  );
}

function NewAudienceGroupSlideOver({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [themes, setThemes] = useState<Set<TicketTheme>>(new Set());
  const [preview, setPreview] = useState<{ key: string; matches: PreviewMatch[] } | null>(null);
  const [saving, setSaving] = useState(false);

  // Identity of the current filter. Doubles as the fetch key and as the way to
  // tell whether the stored preview is still in step with what's selected.
  const themeKey = [...themes].sort().join(",");

  useEffect(() => {
    if (!themeKey) return;
    let cancelled = false;
    fetch("/api/audience-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ themes: themeKey.split(",") }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setPreview({ key: themeKey, matches: d.matches });
      });
    return () => { cancelled = true; };
  }, [themeKey]);

  // Derived rather than stored, so a result belonging to a superseded filter
  // reads as "still loading" instead of flashing the previous selection's
  // matches — and an out-of-order response can't overwrite a newer one.
  const matches = preview?.key === themeKey ? preview.matches : [];
  const loading = themeKey !== "" && preview?.key !== themeKey;

  function toggleTheme(t: TicketTheme) {
    setThemes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  }

  async function save() {
    if (!name.trim() || matches.length === 0) return;
    setSaving(true);
    const memberIds = matches.map((m) => m.id);
    const themeSummary = [...themes].join(", ");
    const finalDescription =
      description.trim() ||
      `Customers with tickets tagged: ${themeSummary}.`;
    await fetch("/api/audiences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: finalDescription,
        memberIds,
        source: "support-signal",
      }),
    });
    onClose();
    router.refresh();
  }

  return (
    <SlideOver title="New audience" onClose={onClose} widthClass="!w-[min(760px,100%)]">
      <div className="space-y-6">
        <ConnectedSourceCard />

        <div>
          <label>Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Shipping-complaint returners"
          />
        </div>

        <div>
          <label>Filter by ticket theme</label>
          <ThemeMultiSelect
            options={THEME_OPTIONS}
            selected={themes}
            onToggle={toggleTheme}
            onClear={() => setThemes(new Set())}
          />
          <p className="mt-1 text-[11px] text-[var(--muted)]">Themes are synced from Gorgias. Select one or more to preview matching customers.</p>
        </div>

        <div>
          <label>Description <span className="text-[var(--muted-2)] font-normal">(optional)</span></label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Auto-generated from the ticket themes if left blank."
          />
        </div>

        <PreviewPanel themes={themes} matches={matches} loading={loading} />

        <div className="pt-4 flex justify-end gap-2 border-t border-[var(--border)] -mx-6 px-6 sticky bottom-0 bg-white">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={save}
            disabled={saving || !name.trim() || matches.length === 0}
          >
            {saving ? "Saving…" : `Save ${matches.length} customer${matches.length === 1 ? "" : "s"} as audience`}
          </button>
        </div>
      </div>
    </SlideOver>
  );
}

function ThemeMultiSelect({
  options,
  selected,
  onToggle,
  onClear,
}: {
  options: { value: TicketTheme; label: string; hint: string }[];
  selected: Set<TicketTheme>;
  onToggle: (t: TicketTheme) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  const selectedLabels = options.filter((o) => selected.has(o.value)).map((o) => o.label);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm text-left transition-colors ${
          open ? "border-[var(--accent)] ring-3 ring-[color-mix(in_oklab,var(--accent)_15%,white)]" : "border-[var(--border)] bg-white hover:border-[var(--muted-2)]"
        }`}
        style={open ? { boxShadow: "0 0 0 3px color-mix(in oklab, var(--accent) 15%, white)" } : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="min-w-0 flex-1 truncate">
          {selected.size === 0 ? (
            <span className="text-[var(--muted-2)]">Select ticket themes…</span>
          ) : selected.size <= 2 ? (
            selectedLabels.join(", ")
          ) : (
            <>
              <b>{selected.size}</b> themes selected
            </>
          )}
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-[var(--muted-2)] transition-transform shrink-0 ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1 card overflow-hidden shadow-lg">
          {selected.size > 0 && (
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)] bg-gray-50">
              <span className="text-[12px] text-[var(--muted)]">
                <b>{selected.size}</b> selected
              </span>
              <button
                type="button"
                className="text-[12px] text-[var(--accent)] hover:underline"
                onClick={onClear}
              >
                Clear all
              </button>
            </div>
          )}
          <ul className="max-h-72 overflow-y-auto" role="listbox">
            {options.map((o) => {
              const checked = selected.has(o.value);
              return (
                <li key={o.value}>
                  <label className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(o.value)}
                      className="shrink-0"
                    />
                    <span className="text-[13.5px] text-[var(--foreground)]">{o.label}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function ConnectedSourceCard() {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className="w-8 h-8 rounded-md bg-[#f3ecff] grid place-items-center text-[var(--accent)]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H9l-5 4V6z" /></svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">Connected: Gorgias</div>
        <div className="text-[12px] text-[var(--muted)]">Ticket themes and excerpts come from your Gorgias workspace. Refreshed 4m ago.</div>
      </div>
      <span className="chip chip-success">Live</span>
    </div>
  );
}

function PreviewPanel({
  themes,
  matches,
  loading,
}: {
  themes: Set<TicketTheme>;
  matches: PreviewMatch[];
  loading: boolean;
}) {
  const groundingBreakdown = useMemo(() => {
    const g = { rich: 0, medium: 0, thin: 0 };
    for (const m of matches) g[m.grounding]++;
    return g;
  }, [matches]);

  if (themes.size === 0) {
    return (
      <div className="card p-6 text-center text-sm text-[var(--muted)]">
        Select a ticket theme to preview matching customers.
      </div>
    );
  }
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-gray-50">
        <div className="text-sm">
          <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">Preview</span>
          <span className="mx-2 text-[var(--muted-2)]">·</span>
          <b>{matches.length}</b> match{matches.length === 1 ? "" : "es"}
          {loading && <span className="ml-2 text-[var(--muted)] text-[12px]">refreshing…</span>}
        </div>
        {matches.length > 0 && (
          <div className="flex gap-2 text-[11px] text-[var(--muted)]">
            {groundingBreakdown.rich > 0 && <span><span className="inline-block w-2 h-2 rounded-full bg-[var(--success)] mr-1" />{groundingBreakdown.rich} rich</span>}
            {groundingBreakdown.medium > 0 && <span><span className="inline-block w-2 h-2 rounded-full bg-[var(--accent)] mr-1" />{groundingBreakdown.medium} medium</span>}
            {groundingBreakdown.thin > 0 && <span><span className="inline-block w-2 h-2 rounded-full bg-gray-300 mr-1" />{groundingBreakdown.thin} thin</span>}
          </div>
        )}
      </div>
      <div className="max-h-96 overflow-y-auto divide-y divide-[var(--border)]">
        {matches.length === 0 && !loading && (
          <div className="p-6 text-sm text-[var(--muted)] text-center">No customers with tickets in these themes.</div>
        )}
        {matches.map((m) => (
          <div key={m.id} className="px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{m.name}</span>
              <span
                className={`chip text-[10px] ${m.grounding === "rich" ? "chip-success" : m.grounding === "medium" ? "chip-highlight" : ""}`}
                title="Rehearsal signal — how much real data backs this twin."
              >
                {GROUNDING_LABEL[m.grounding]}
              </span>
              <span className="text-[11px] text-[var(--muted)]">{m.orderCount} order{m.orderCount === 1 ? "" : "s"}</span>
            </div>
            <div className="mt-1 space-y-1">
              {m.matchingTickets.slice(0, 2).map((t) => (
                <div key={t.id} className="text-[12px] text-[var(--muted)] leading-relaxed">
                  <span className="chip text-[10px] mr-1">{t.theme}</span>
                  <span className="italic">&ldquo;{t.excerpt}&rdquo;</span>
                </div>
              ))}
              {m.matchingTickets.length > 2 && (
                <div className="text-[11px] text-[var(--muted-2)]">+{m.matchingTickets.length - 2} more matching ticket{m.matchingTickets.length - 2 === 1 ? "" : "s"}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
