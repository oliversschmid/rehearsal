"use client";
import { useEffect } from "react";

/**
 * Phosphor-terminal "About this build" popup. Explains what's real, what's
 * seed data, and what would ship in v2. Reached from a small link at the
 * bottom of the sidebar.
 */
export function BuildNoteModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-6"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[640px] overflow-hidden"
        style={{
          background: "#0a0f0a",
          border: "1px solid #1a3a1a",
          borderRadius: 10,
          boxShadow: "0 24px 60px -20px rgba(0,255,65,0.15), 0 0 0 1px #1a3a1a",
          fontFamily: "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
      >
        {/* Title bar */}
        <div
          className="flex items-center justify-between px-3 py-2"
          style={{ background: "#0f1a0f", borderBottom: "1px solid #163516" }}
        >
          <div className="flex items-center gap-1.5">
            <span style={{ width: 10, height: 10, borderRadius: 999, background: "#4ade80", opacity: 0.85 }} />
            <span style={{ width: 10, height: 10, borderRadius: 999, background: "#163516" }} />
            <span style={{ width: 10, height: 10, borderRadius: 999, background: "#163516" }} />
          </div>
          <div className="text-[11px]" style={{ color: "#4ade80", opacity: 0.7 }}>
            about-this-build.md — verve-and-vine
          </div>
          <button
            onClick={onClose}
            className="text-[11px] hover:opacity-100"
            style={{ color: "#4ade80", opacity: 0.7 }}
            aria-label="Close"
          >
            [ close ]
          </button>
        </div>

        {/* Terminal body */}
        <div
          className="relative px-5 py-4 text-[12.5px] leading-[1.55]"
          style={{
            color: "#4ade80",
            maxHeight: "70vh",
            overflowY: "auto",
          }}
        >
          {/* subtle scanlines */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(74,222,128,0.04) 2px, rgba(74,222,128,0.04) 3px)",
            }}
          />
          <div className="relative">
            <Line prompt="$" text="cat build-notes.md" />

            <Section title="REAL">
              <Item>copilot &rarr; anthropic claude (drafting, iteration)</Item>
              <Item>flow builder + rehearsals &rarr; vercel blob (persisted)</Item>
              <Item>scoring engine &rarr; real percentile math + banding</Item>
              <Item>opportunities &rarr; grounded in twin response data</Item>
            </Section>

            <Section title="FAKED">
              <Item>verve &amp; vine is fictional (no real brand)</Item>
              <Item>customers, twins, historical performance &rarr; seed data</Item>
              <Item>no shopify or gorgias connection; those signals are simulated</Item>
              <Item>&quot;launch&quot; is a status flip, no real send pipeline</Item>
            </Section>

            <Section title="NEXT (v2)">
              <Item>brand knowledge base the copilot draws from</Item>
              <Item>data connector to ingest real customers, simulate real twins</Item>
              <Item>ESP + SMS wiring for actual sends</Item>
              <Item>multi-user workspaces with per-account isolation</Item>
              <Item>proactive recommender: flags cold cohorts before you ask</Item>
            </Section>

            <div className="mt-4 flex items-center">
              <span style={{ color: "#4ade80", opacity: 0.85 }}>$</span>
              <span
                className="ml-2 inline-block"
                style={{
                  width: 8,
                  height: 14,
                  background: "#4ade80",
                  animation: "buildNoteCursor 1s steps(2, start) infinite",
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes buildNoteCursor {
          to { visibility: hidden; }
        }
      `}</style>
    </div>
  );
}

function Line({ prompt, text }: { prompt: string; text: string }) {
  return (
    <div className="flex gap-2">
      <span style={{ color: "#4ade80", opacity: 0.85 }}>{prompt}</span>
      <span>{text}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div style={{ color: "#86efac", fontWeight: 600 }}>[{title}]</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Item({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span style={{ color: "#4ade80", opacity: 0.6 }}>&gt;</span>
      <span>{children}</span>
    </div>
  );
}
