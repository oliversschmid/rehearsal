"use client";
import { useMemo, useState } from "react";
import type { Campaign, RehearsalResult } from "@/lib/types";
import type { TwinMeta } from "../CampaignEditor";
import { ReceiptPopover } from "./ReceiptPopover";

type Tab = "reactions" | "objections" | "matrix";

export function EvidenceSection({
  result,
  campaign,
  twinsById,
}: {
  result: RehearsalResult;
  campaign: Campaign;
  twinsById: Record<string, TwinMeta>;
}) {
  const [tab, setTab] = useState<Tab>("reactions");
  return (
    <div className="card">
      <div className="px-5 pt-4">
        <div className="text-[11px] uppercase tracking-wider text-[var(--muted)]">Evidence</div>
        <div className="text-[12.5px] text-[var(--muted)] mt-0.5">
          Reactions, objections, and segment × message performance — every quote links to a receipt.
        </div>
      </div>
      <div className="flex gap-1 px-3 pt-3 pb-2 border-b border-[var(--border)]">
        <TabBtn active={tab === "reactions"} onClick={() => setTab("reactions")}>Reactions</TabBtn>
        <TabBtn active={tab === "objections"} onClick={() => setTab("objections")}>Objection digest</TabBtn>
        <TabBtn active={tab === "matrix"} onClick={() => setTab("matrix")}>Segment × Message</TabBtn>
      </div>
      <div className="p-5">
        {tab === "reactions" && <Reactions result={result} twinsById={twinsById} />}
        {tab === "objections" && <Objections result={result} />}
        {tab === "matrix" && <Matrix result={result} campaign={campaign} twinsById={twinsById} />}
      </div>
    </div>
  );
}

function TabBtn({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button className={`px-3 py-1.5 text-xs rounded-md font-medium ${active ? "bg-white shadow-sm text-[var(--foreground)]" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`} onClick={onClick}>{children}</button>
  );
}

function Reactions({ result, twinsById }: { result: RehearsalResult; twinsById: Record<string, TwinMeta> }) {
  const withReactions = result.responses.filter((r) => r.reaction && r.groundedIn.length > 0);
  if (!withReactions.length) return <div className="text-sm text-[var(--muted)]">No grounded reactions available. (Reactions without receipts are hidden per policy.)</div>;
  return (
    <div className="grid gap-3">
      {withReactions.slice(0, 24).map((r, i) => {
        const t = twinsById[r.twinId];
        return (
          <div key={i} className="flex items-start gap-3 border-b border-[var(--border)] pb-3 last:border-b-0">
            <div className="w-9 h-9 rounded-full bg-gray-100 grid place-items-center text-xs font-semibold text-[var(--muted)] shrink-0">
              {(t?.name ?? "?").split(" ").map((s) => s[0]).slice(0, 2).join("")}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{t?.name ?? r.twinId}</span>
                <ActionChip action={r.action} />
              </div>
              <div className="text-[13.5px] text-[var(--foreground)] mt-1 leading-relaxed">&ldquo;{r.reaction}&rdquo;</div>
              <div className="mt-1 flex gap-1 flex-wrap">
                {r.groundedIn.map((ref, j) => (
                  <ReceiptPopover key={j} customerId={r.twinId} ref_={ref} />
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ActionChip({ action }: { action: import("@/lib/types").TwinAction }) {
  const map: Record<string, { cls: string; label: string }> = {
    open_click: { cls: "chip-success", label: "opened & clicked" },
    open_ignore: { cls: "chip-warn", label: "opened, ignored" },
    ignore: { cls: "", label: "ignored" },
    unsubscribe: { cls: "chip-danger", label: "unsubscribed" },
    spam: { cls: "chip-danger", label: "marked spam" },
  };
  const m = map[action];
  return <span className={`chip ${m.cls}`}>{m.label}</span>;
}

function Objections({ result }: { result: RehearsalResult }) {
  if (!result.objections.length) return <div className="text-sm text-[var(--muted)]">No repeated objections detected.</div>;
  return (
    <div className="grid gap-3">
      {result.objections.map((o, i) => (
        <details key={i} className="border border-[var(--border)] rounded-lg p-3">
          <summary className="flex items-center justify-between cursor-pointer">
            <span className="text-sm font-medium">{o.label}</span>
            <span className="chip">echoed in {o.echoCount} tickets</span>
          </summary>
          <div className="mt-2 text-[12px] text-[var(--muted)]">
            Sample tickets: {o.sampleTicketIds.join(", ")}
          </div>
        </details>
      ))}
    </div>
  );
}

function Matrix({ result, campaign, twinsById }: { result: RehearsalResult; campaign: Campaign; twinsById: Record<string, TwinMeta> }) {
  const messages = useMemo(
    () => Object.values(campaign.flow.nodes).filter((n) => n.type === "message"),
    [campaign],
  );
  const segments = useMemo(() => [...new Set(result.segmentMatrix.map((c) => c.segmentLabel))].sort(), [result]);
  const cellMap = new Map<string, typeof result.segmentMatrix[number]>();
  for (const c of result.segmentMatrix) cellMap.set(`${c.segmentLabel}|${c.messageNodeId}`, c);
  const [drill, setDrill] = useState<string | null>(null);

  if (!segments.length || !messages.length) return <div className="text-sm text-[var(--muted)]">Nothing to show.</div>;

  return (
    <>
      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr>
              <th className="text-left text-[11px] uppercase tracking-wider text-[var(--muted)] font-medium pr-4 pb-2">Segment</th>
              {messages.map((m, i) => (
                <th key={m.id} className="text-[11px] uppercase tracking-wider text-[var(--muted)] font-medium px-2 pb-2 text-center">
                  Msg {i + 1} <span className="text-[10px]">({m.type === "message" ? m.channel : ""})</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {segments.map((seg) => (
              <tr key={seg}>
                <td className="text-[13px] pr-4 py-1 whitespace-nowrap">{seg}</td>
                {messages.map((m) => {
                  const cell = cellMap.get(`${seg}|${m.id}`);
                  const strength = cell?.strength ?? 0;
                  const bg = heatColor(strength);
                  return (
                    <td key={m.id} className="p-1" style={{ minWidth: 60 }}>
                      <div
                        className="heat-cell"
                        style={{ background: bg, color: strength > 0.6 ? "white" : "#374151" }}
                        onClick={() => cell && setDrill(`${seg}|${m.id}`)}
                        title={`${seg} × Msg — strength ${Math.round(strength * 100)}%`}
                      >
                        {cell ? Math.round(strength * 100) : "–"}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {drill && (() => {
        const cell = cellMap.get(drill);
        if (!cell) return null;
        return (
          <div className="mt-4 card p-4">
            <div className="text-[11px] uppercase tracking-wider text-[var(--muted)] mb-2">
              {cell.segmentLabel} — contributing twins
            </div>
            <div className="flex gap-2 flex-wrap">
              {cell.twinIds.map((id) => <span key={id} className="chip">{twinsById[id]?.name ?? id}</span>)}
            </div>
          </div>
        );
      })()}
    </>
  );
}

function heatColor(s: number): string {
  // clamp then map to a green ramp
  const t = Math.max(0, Math.min(1, s));
  const light = 96 - t * 55;
  return `hsl(160, 55%, ${light}%)`;
}
