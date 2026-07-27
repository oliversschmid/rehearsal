"use client";
import { useState } from "react";
import type { Customer, Trait } from "@/lib/types";
import { GROUNDING_LABEL } from "./ScoreBadge";
import { RailSlot } from "./rail/RailContext";
import { AskThisCustomerBlock } from "./rail/blocks/AskThisCustomerBlock";

/**
 * TwinDetail. Emits a <RailSlot> that fills the entire rail with the
 * "Ask this customer" chat (input + conversation), hiding the standard
 * CopilotDock so the twin page is a single conversation surface.
 */
export function TwinDetail({ customer }: { customer: Customer }) {
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());

  function highlightForTrait(t: Trait) {
    const s = new Set<string>();
    for (const e of t.evidence) s.add(`${e.type}:${e.id}`);
    setHighlighted(s);
  }

  const groundingCls =
    customer.groundingQuality === "rich"
      ? "chip-success"
      : customer.groundingQuality === "medium"
      ? "chip-highlight"
      : "";

  return (
    <>
      <RailSlot
        headerLabel="Twin"
        headerTitle={`${customer.firstName} ${customer.lastInitial}.`}
        headerAside={
          <span className={`chip !text-[10px] ${groundingCls}`} title="Rehearsal signal">
            {GROUNDING_LABEL[customer.groundingQuality]}
          </span>
        }
        hideDock
        body={<AskThisCustomerBlock customer={customer} />}
      />

      <div className="flex items-start gap-4 mt-3">
        <div className="w-16 h-16 rounded-full bg-gray-100 grid place-items-center text-lg font-semibold text-[var(--muted)]">
          {customer.firstName[0]}{customer.lastInitial}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{customer.firstName} {customer.lastInitial}.</h1>
          <div className="mt-1 text-[12px] text-[var(--muted)]">Customer since {customer.createdAt.slice(0, 10)}</div>
          <div className="mt-3 flex gap-2 flex-wrap">
            <span
              className={`chip ${groundingCls}`}
              title="Rehearsal signal — how much real data backs this twin's reactions."
            >
              {GROUNDING_LABEL[customer.groundingQuality]} signal
            </span>
            {customer.traits.map((t) => (
              <button key={t.label} onClick={() => highlightForTrait(t)} className="chip cursor-pointer hover:brightness-95" title="Highlight evidence">{t.label}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 mt-8" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Orders</h3>
            <span className="text-[11px] text-[var(--muted)]">from Shopify order history</span>
          </div>
          <div className="mt-4 space-y-3">
            {customer.orders.length === 0 && <div className="text-sm text-[var(--muted)]">No orders.</div>}
            {customer.orders.map((o) => {
              const hit = highlighted.has(`order:${o.id}`);
              return (
                <div key={o.id} className={`border rounded-lg p-3 transition-colors ${hit ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)]"}`}>
                  <div className="flex justify-between text-[12px] text-[var(--muted)]">
                    <span>{o.date.slice(0, 10)}</span>
                    <span>${o.total}{o.discountCode ? ` · ${o.discountCode}` : ""}</span>
                  </div>
                  <ul className="mt-1 text-[13px] list-disc ml-4">
                    {o.items.map((it, i) => <li key={i}>{it.name}</li>)}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Support conversations</h3>
            <span className="text-[11px] text-[var(--muted)]">from Gorgias</span>
          </div>
          <div className="mt-4 space-y-3">
            {customer.tickets.length === 0 && <div className="text-sm text-[var(--muted)]">No tickets.</div>}
            {customer.tickets.map((t) => {
              const hit = highlighted.has(`ticket:${t.id}`);
              return (
                <div key={t.id} className={`border rounded-lg p-3 transition-colors ${hit ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)]"}`}>
                  <div className="flex justify-between text-[12px] text-[var(--muted)]">
                    <span>{t.theme}</span>
                    <span>{t.date.slice(0, 10)}</span>
                  </div>
                  <div className="text-[13px] font-medium mt-1">{t.subject}</div>
                  <p className="text-[13px] italic text-[var(--foreground)] mt-1">&ldquo;{t.excerpt}&rdquo;</p>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section className="card p-5 mt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Engagement</h3>
          <span className="text-[11px] text-[var(--muted)]">last 90 days</span>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-4 mt-4 text-[13px]">
          <Stat label="Opens" value={customer.engagement.opensLast90d} />
          <Stat label="Clicks" value={customer.engagement.clicksLast90d} />
          <Stat label="Last open" value={`${customer.engagement.lastOpenDaysAgo}d ago`} />
          <Stat label="Unsub risk" value={customer.engagement.unsubRisk} />
          <Stat label="SMS opted-in" value={customer.engagement.smsOptedIn ? "yes" : "no"} />
          <Stat label="SMS opt-out risk" value={customer.engagement.smsOptOutRisk} />
        </div>
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-[var(--muted)]">{label}</div>
      <div className="text-[15px] font-medium mt-0.5">{value}</div>
    </div>
  );
}
