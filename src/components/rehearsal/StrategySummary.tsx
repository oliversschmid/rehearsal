"use client";
import type { AgentRationale, PredictedReach } from "@/lib/reportInsights";

/**
 * StrategySummary — restates the campaign goal, projects reach against the
 * audience pool, and lists the copilot agent's key strategic choices with
 * rationale. Renders only when we have a fresh rehearsal (not for historical
 * runs — that view stays clean).
 */
export function StrategySummary({
  goal,
  reach,
  rationale,
}: {
  goal: string;
  reach: PredictedReach;
  rationale: AgentRationale;
}) {
  return (
    <div className="card p-4">
      <div className="text-[10.5px] uppercase tracking-wider text-[var(--muted)] font-medium mb-3">
        Strategy
      </div>
      <div className="space-y-3">
        <Row eyebrow="Goal">
          <div className="text-[13.5px] text-[var(--foreground)]">{goal}</div>
        </Row>
        <Row eyebrow="Predicted reach">
          <div className="text-[13.5px] text-[var(--foreground)]">
            Predicted to resonate with{" "}
            <span className="font-semibold tabular-nums">
              ~{reach.engaged.toLocaleString()}
            </span>{" "}
            of{" "}
            <span className="font-semibold tabular-nums">
              {reach.poolSize.toLocaleString()}
            </span>
            {reach.poolSize > 0 && (
              <span className="text-[var(--muted)]">
                {" "}
                ({Math.round(reach.pct * 100)}%)
              </span>
            )}
            .
          </div>
        </Row>
        <Row eyebrow="Agent rationale">
          <ul className="space-y-1.5">
            {rationale.bullets.map((b, i) => (
              <li
                key={i}
                className="text-[12.5px] text-[var(--foreground)] leading-relaxed pl-3 relative"
              >
                <span className="absolute left-0 top-[7px] w-1 h-1 rounded-full bg-[var(--muted)]" />
                {b}
              </li>
            ))}
          </ul>
        </Row>
      </div>
    </div>
  );
}

function Row({
  eyebrow,
  children,
}: {
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: "140px 1fr" }}>
      <div className="text-[10.5px] uppercase tracking-wider text-[var(--muted)] font-medium pt-0.5">
        {eyebrow}
      </div>
      <div>{children}</div>
    </div>
  );
}
