"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Campaign,
  RehearsalResult,
  TwinAction,
  Verdict,
} from "@/lib/types";
import type { TwinMeta } from "../CampaignEditor";

/**
 * Phase 1 stage. Streams /api/rehearse events into a twin-avatar grid,
 * ticker, elapsed counter, and early-verdict slide-in. Enforces a >=4s
 * runtime by client-side jittered replay when the server responds
 * instantly. Aborts on Cancel (parent decides whether to keep or discard
 * the in-flight run).
 *
 * When the final event arrives we don't render the final layout here — we
 * hand back the final `RehearsalResult` to the parent via onComplete so it
 * can render the Phase 2 layout in place.
 */

const MIN_STAGE_MS = 4_000;
const MAX_STAGE_MS = 90_000;

type Action = TwinAction;

type ChipState = {
  twinId: string;
  action: Action | null;
  filledAt: number | null;
};

export type RunStageProps = {
  campaign: Campaign;
  audienceName: string;
  twins: TwinMeta[];
  totalTwins: number;
  onComplete: (r: RehearsalResult) => void;
  /** Called when Cancel is clicked; parent aborts the stage and reverts UI. */
  onCancel: () => void;
};

export function RunStage({
  campaign,
  audienceName,
  twins,
  totalTwins,
  onComplete,
  onCancel,
}: RunStageProps) {
  const startedAtRef = useRef<number>(Date.now());
  const abortRef = useRef<AbortController | null>(null);
  const completedRef = useRef(false);
  const [now, setNow] = useState<number>(Date.now());
  const [chips, setChips] = useState<ChipState[]>(() =>
    twins.slice(0, totalTwins).map((t) => ({ twinId: t.id, action: null, filledAt: null })),
  );
  const [tickerIdx, setTickerIdx] = useState(0);
  const [tickerVisible, setTickerVisible] = useState(true);
  const [partialVerdict, setPartialVerdict] = useState<Verdict | null>(null);
  const [earlyVerdictShown, setEarlyVerdictShown] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const partialHistoryRef = useRef<number[]>([]);
  const filledCount = chips.filter((c) => c.action !== null).length;

  const grounded = twins.filter((t) => t.grounding !== "thin").length;
  const projected = twins.length - grounded;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(m.matches);
    const cb = () => setReducedMotion(m.matches);
    m.addEventListener("change", cb);
    return () => m.removeEventListener("change", cb);
  }, []);

  // Ticking elapsed-time counter (250ms cadence)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // Ticker rotation — cross-fade ~120ms, hold ~2.5s
  useEffect(() => {
    if (reducedMotion) return;
    if (filledCount === 0) return;
    const id = setInterval(() => {
      setTickerVisible(false);
      window.setTimeout(() => {
        setTickerIdx((i) => i + 1);
        setTickerVisible(true);
      }, 130);
    }, 2500);
    return () => clearInterval(id);
  }, [reducedMotion, filledCount]);

  // Kick off the stream on mount
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    startedAtRef.current = Date.now();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    let cancelled = false;

    async function run() {
      const startedAt = startedAtRef.current;
      let finalResult: RehearsalResult | null = null;
      let outstanding = 0;

      // Per-item jittered fill — fires each chip on its own 150-450ms delay
      // relative to when its event arrived, so the grid feels organic even
      // when the server flushes many events at once.
      function enqueueTwin(twinId: string, action: Action) {
        outstanding++;
        const delay = 150 + Math.floor(Math.random() * 300);
        const t = setTimeout(() => {
          timers.delete(t);
          fillChip(twinId, action);
          outstanding--;
        }, delay);
        timers.add(t);
      }

      try {
        const res = await fetch("/api/rehearse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId: campaign.id }),
          signal: controller.signal,
        });
        if (!res.body) throw new Error("no stream");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (Date.now() - startedAt > MAX_STAGE_MS) {
            controller.abort();
            break;
          }
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const events = buf.split("\n\n");
          buf = events.pop() ?? "";
          for (const evStr of events) {
            const dataLine = evStr.split("\n").find((l) => l.startsWith("data:"));
            if (!dataLine) continue;
            const payload = JSON.parse(dataLine.slice(5).trim());
            if (payload.type === "twin_response") {
              enqueueTwin(payload.twinId, payload.action);
            } else if (payload.type === "partial_verdict") {
              const v: Verdict = payload.verdict;
              partialHistoryRef.current.push(v.score);
              if (partialHistoryRef.current.length > 20) partialHistoryRef.current.shift();
              setPartialVerdict(v);
            } else if (payload.type === "final") {
              finalResult = payload.result as RehearsalResult;
            }
          }
        }
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") {
          cancelled = true;
        } else {
          throw err;
        }
      }

      // Drain any queued applies before the >=4s hold.
      await new Promise<void>((resolve) => {
        const check = () => {
          if (cancelled) return resolve();
          if (outstanding === 0) resolve();
          else setTimeout(check, 80);
        };
        check();
      });

      if (cancelled) return;

      // Enforce minimum stage duration.
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_STAGE_MS) {
        await new Promise((r) => setTimeout(r, MIN_STAGE_MS - elapsed));
      }

      if (finalResult && !completedRef.current) {
        completedRef.current = true;
        onComplete(finalResult);
      }
    }

    void run();

    return () => {
      cancelled = true;
      controller.abort();
      for (const t of timers) clearTimeout(t);
      timers.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.id]);

  function fillChip(twinId: string, action: Action) {
    setChips((prev) => {
      const idx = prev.findIndex((c) => c.twinId === twinId && c.action === null);
      if (idx < 0) return prev;
      const next = prev.slice();
      next[idx] = { ...next[idx], action, filledAt: Date.now() };
      return next;
    });
  }

  // Early verdict detection: >=60% responded AND partial verdict stable in
  // the last 10% of arrivals (within ±3 across the last window).
  useEffect(() => {
    if (earlyVerdictShown || !partialVerdict) return;
    if (chips.length < 30) return; // only slide in for larger runs
    if (filledCount / chips.length < 0.6) return;
    const windowSize = Math.max(2, Math.floor(chips.length * 0.1));
    const recent = partialHistoryRef.current.slice(-windowSize);
    if (recent.length < 2) return;
    const min = Math.min(...recent, partialVerdict.score);
    const max = Math.max(...recent, partialVerdict.score);
    if (max - min <= 3) setEarlyVerdictShown(true);
  }, [chips.length, filledCount, partialVerdict, earlyVerdictShown]);

  function handleCancel() {
    completedRef.current = true; // prevent the min-duration onComplete
    abortRef.current?.abort();
    onCancel();
  }

  const elapsedMs = now - startedAtRef.current;
  const elapsedLabel = formatElapsed(elapsedMs);
  const progressPct = chips.length ? (filledCount / chips.length) * 100 : 0;
  const respondedLabel = `${filledCount} of ${chips.length} twin${chips.length === 1 ? "" : "s"} ${filledCount === 1 ? "has" : "have"} responded`;

  // Build the ticker item from real events.
  const tickerEvents = useMemo(() => {
    const twinName = new Map(twins.map((t) => [t.id, t.name]));
    return chips
      .filter((c) => c.action !== null && c.filledAt !== null)
      .sort((a, b) => (a.filledAt ?? 0) - (b.filledAt ?? 0))
      .map((c) => ({
        name: twinName.get(c.twinId) ?? c.twinId,
        phrase: actionPhrase(c.action as Action),
      }));
  }, [chips, twins]);

  const currentTicker = tickerEvents[tickerEvents.length === 0 ? 0 : (tickerIdx % Math.max(1, tickerEvents.length))];

  return (
    <div className="card p-6 space-y-4">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-lg font-semibold truncate">Rehearsing {campaign.name}</div>
          <div className="text-[12px] text-[var(--muted)] mt-0.5">
            {chips.length} twins · {grounded} grounded, {projected} projected · {audienceName}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-lg tabular-nums font-medium text-[var(--foreground)]">{elapsedLabel}</div>
          <button
            className="btn btn-secondary text-sm"
            onClick={handleCancel}
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Early-verdict slide-in */}
      {earlyVerdictShown && partialVerdict && (
        <EarlyVerdictBand verdict={partialVerdict} />
      )}

      {/* Progress line */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[12.5px] text-[var(--foreground)]">{respondedLabel}</div>
          <div className="text-[11px] text-[var(--muted)] tabular-nums">
            {Math.round(progressPct)}%
          </div>
        </div>
        <div className="w-full h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full bg-[var(--foreground)] transition-[width] ease-linear"
            style={{ width: `${progressPct}%`, transitionDuration: "250ms" }}
          />
        </div>
      </div>

      {/* Twin grid */}
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(22px, 1fr))" }}
      >
        {chips.map((c) => {
          const twin = twins.find((t) => t.id === c.twinId);
          const initials = (twin?.name ?? "?")
            .split(" ")
            .map((s) => s[0])
            .slice(0, 2)
            .join("");
          const bg = chipColor(c.action);
          const border = c.action ? "transparent" : "var(--border-strong)";
          return (
            <div
              key={c.twinId}
              title={`${twin?.name ?? c.twinId}${c.action ? " · " + actionPhrase(c.action) : ""}`}
              className="rounded-full grid place-items-center text-[8px] font-semibold"
              style={{
                width: 20,
                height: 20,
                background: c.action ? bg : "transparent",
                border: `1px solid ${border}`,
                color: c.action ? actionText(c.action) : "transparent",
                transform: c.action && !reducedMotion ? "scale(1)" : undefined,
                transition: reducedMotion
                  ? "none"
                  : "transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1), background 150ms",
                animation: c.action && !reducedMotion ? "chip-pop 150ms ease-out" : undefined,
              }}
            >
              {c.action ? initials : ""}
            </div>
          );
        })}
      </div>

      {/* Event ticker */}
      <div className="text-[12.5px] text-[var(--foreground)] min-h-[1.4em]">
        {currentTicker ? (
          reducedMotion ? (
            <span>
              <span className="text-[var(--muted)]">Latest: </span>
              <b>{currentTicker.name}</b> {currentTicker.phrase}
            </span>
          ) : (
            <span
              style={{
                opacity: tickerVisible ? 1 : 0,
                transition: "opacity 120ms ease",
                display: "inline-block",
              }}
            >
              <b>{currentTicker.name}</b> {currentTicker.phrase}
            </span>
          )
        ) : (
          <span className="text-[var(--muted)]">Waiting for the first response…</span>
        )}
      </div>

      <style>{`
        @keyframes chip-pop {
          0% { transform: scale(0.6); opacity: 0.4; }
          70% { transform: scale(1.15); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function EarlyVerdictBand({ verdict }: { verdict: Verdict }) {
  const clr =
    verdict.score >= 70
      ? "var(--success)"
      : verdict.score >= 50
      ? "var(--accent)"
      : verdict.score >= 30
      ? "var(--warn)"
      : "var(--danger)";
  return (
    <div
      className="rounded-lg p-3 border flex items-center gap-4"
      style={{
        borderColor: "var(--border-strong)",
        background: "var(--accent-soft)",
        animation: "slide-in 260ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <div className="flex items-baseline gap-1.5">
        <span
          className="text-2xl tabular-nums font-semibold leading-none"
          style={{ color: clr }}
        >
          {verdict.score}
        </span>
        <span className="text-[11px] text-[var(--muted)]">/100</span>
      </div>
      <div className="flex-1 text-[12.5px] text-[var(--foreground)] leading-snug">
        {verdict.driver}
      </div>
      <span
        className="chip !text-[10.5px] chip-highlight shrink-0"
        title="This early read may shift as more twins respond."
      >
        Early verdict · refining
      </span>
      <style>{`
        @keyframes slide-in {
          from { transform: translateY(-8px); opacity: 0; }
          to { transform: none; opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function chipColor(a: Action | null): string {
  switch (a) {
    case "open_click": return "var(--success)";
    case "open_ignore": return "#d1d5db";
    case "ignore": return "#f3f4f6";
    case "unsubscribe":
    case "spam": return "var(--danger)";
    default: return "transparent";
  }
}

function actionText(a: Action): string {
  if (a === "open_click" || a === "unsubscribe" || a === "spam") return "white";
  return "#4b5563";
}

function actionPhrase(a: Action): string {
  switch (a) {
    case "open_click": return "clicked email 1";
    case "open_ignore": return "opened but ignored";
    case "ignore": return "ignored the send";
    case "unsubscribe": return "unsubscribed";
    case "spam": return "flagged as spam";
  }
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
