"use client";
import { useState } from "react";
import { CopilotStartModal } from "./CopilotStartModal";
import { ManualCreateModal } from "./ManualCreateModal";

export function NewCampaignActionCards({
  audiences,
}: {
  audiences: { id: string; name: string }[];
}) {
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  return (
    <>
      <div
        className="grid gap-3 max-w-[560px]"
        style={{ gridTemplateColumns: "1fr 1fr" }}
      >
        <ActionCard
          onClick={() => setCopilotOpen(true)}
          icon={<SparkleIcon />}
          eyebrow="Recommended"
          title="Start with copilot"
          body="Describe the goal. Copilot drafts the flow and rehearses it."
          primary
        />
        <ActionCard
          onClick={() => setManualOpen(true)}
          icon={<PencilIcon />}
          title="Build manually"
          body="Compose the flow yourself, then rehearse when ready."
        />
      </div>

      {copilotOpen && (
        <CopilotStartModal audiences={audiences} onClose={() => setCopilotOpen(false)} />
      )}
      {manualOpen && (
        <ManualCreateModal audiences={audiences} onClose={() => setManualOpen(false)} />
      )}
    </>
  );
}

function ActionCard({
  onClick,
  icon,
  eyebrow,
  title,
  body,
  primary,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  eyebrow?: string;
  title: string;
  body: string;
  primary?: boolean;
}) {
  const primaryFg = "#8a2f1e";
  const primaryMuted = "#a04a3a";
  const primaryGradient =
    "linear-gradient(135deg, #ffffff 0%, #fff2ec 40%, #ffcabf 75%, #ff9781 100%)";
  return (
    <button
      onClick={onClick}
      className="card text-left p-4 transition-all cursor-pointer group hover:border-[var(--border-strong)]"
      style={
        primary
          ? {
              background: primaryGradient,
              borderColor: "#ffcabf",
              color: primaryFg,
            }
          : undefined
      }
    >
      <div
        className="w-9 h-9 rounded-[6px] grid place-items-center"
        style={
          primary
            ? { background: "rgba(255,255,255,0.75)", color: primaryFg }
            : { background: "#f5f5f5", color: "var(--foreground)" }
        }
      >
        {icon}
      </div>
      {eyebrow && (
        <div
          className="mt-3 text-[10.5px] uppercase tracking-wider font-medium"
          style={{ color: primary ? primaryMuted : "var(--muted)" }}
        >
          {eyebrow}
        </div>
      )}
      <div
        className={`${eyebrow ? "mt-1" : "mt-3"} text-[15px] font-semibold`}
        style={{ color: primary ? primaryFg : "var(--foreground)" }}
      >
        {title}
      </div>
      <p
        className="mt-1 text-[12px] leading-relaxed"
        style={{ color: primary ? primaryMuted : "var(--muted)" }}
      >
        {body}
      </p>
    </button>
  );
}

function SparkleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l1.7 4.6L18 8.3l-4.6 1.7L11.7 15 10 10l-4.6-1.7L10 6.6 12 2zm7 10l1 2.6 2.6 1-2.6 1L19 19l-1-2.6-2.6-1L18 14.4 19 12z" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}
