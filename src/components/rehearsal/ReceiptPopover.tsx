"use client";
import { useEffect, useRef, useState } from "react";
import type { Customer, EvidenceRef } from "@/lib/types";

export function ReceiptPopover({ customerId, ref_ }: { customerId: string; ref_: EvidenceRef }) {
  const [open, setOpen] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  async function load() {
    if (customer) return;
    const c = await fetch(`/api/customers/${customerId}`).then((r) => r.json());
    setCustomer(c);
  }

  const label = `${ref_.type}:${ref_.id.slice(-5)}`;

  return (
    <div className="relative inline-block" ref={wrapRef}>
      <button
        className="chip chip-accent text-[11px] cursor-pointer"
        onClick={() => { load(); setOpen(!open); }}
      >↳ {label}</button>
      {open && (
        <div className="absolute z-30 top-full left-0 mt-1 card p-3 shadow-xl w-80 max-h-64 overflow-y-auto text-[12px]">
          {!customer ? (
            <div className="text-[var(--muted)]">Loading…</div>
          ) : (
            <ReceiptContent customer={customer} ref_={ref_} />
          )}
        </div>
      )}
    </div>
  );
}

function ReceiptContent({ customer, ref_ }: { customer: Customer; ref_: EvidenceRef }) {
  if (ref_.type === "ticket") {
    const t = customer.tickets.find((x) => x.id === ref_.id);
    if (!t) return <div className="text-[var(--muted)]">Ticket not found.</div>;
    return (
      <div>
        <div className="text-[11px] uppercase tracking-wider text-[var(--muted)] mb-1">Support ticket</div>
        <div className="font-medium">{t.subject}</div>
        <div className="text-[11px] text-[var(--muted)] mb-2">{t.theme} · {t.date.slice(0, 10)}</div>
        <p className="italic text-[var(--foreground)]">&ldquo;{t.excerpt}&rdquo;</p>
      </div>
    );
  }
  if (ref_.type === "order") {
    const o = customer.orders.find((x) => x.id === ref_.id);
    if (!o) return <div className="text-[var(--muted)]">Order not found.</div>;
    return (
      <div>
        <div className="text-[11px] uppercase tracking-wider text-[var(--muted)] mb-1">Order</div>
        <div className="text-[11px] text-[var(--muted)] mb-2">{o.date.slice(0, 10)} — ${o.total}{o.discountCode ? ` (code ${o.discountCode})` : ""}</div>
        <ul className="list-disc ml-4 space-y-0.5">
          {o.items.map((it, i) => <li key={i}>{it.name} — ${it.price}</li>)}
        </ul>
      </div>
    );
  }
  return <div className="text-[var(--muted)]">Engagement summary.</div>;
}
