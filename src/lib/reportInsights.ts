/**
 * reportInsights.ts
 *
 * Pure helper functions that derive the "Strategy summary" and
 * "Timing & audience" panels for the Rehearsal report from a
 * `Campaign` + `RehearsalResult`. These functions never touch the
 * filesystem or network — callers pass in whatever context they
 * already have (e.g. `getAudienceGroup(campaign.audienceGroupId)`,
 * `getHistoricalCampaigns()`).
 */

import type {
  Campaign,
  Channel,
  FlowNode,
  HistoricalCampaign,
  RehearsalResult,
  SegmentMatrixCell,
  TwinResponse,
} from "./types";

/** Minimal audience shape needed for rationale copy (name + optional description). */
export type AudienceForRationale = {
  name: string;
  description?: string;
};
import { sourcePoolFor } from "./audienceMetrics";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ChannelStat = {
  engagement: number; // 0..1 weighted engagement rate
  sends: number;      // number of responses/sends counted
  label: string;      // display label ("Email" / "SMS")
};

export type ChannelMix = {
  email?: ChannelStat;
  sms?: ChannelStat;
  verdict: string; // one-line summary
};

export type PredictedReach = {
  engaged: number;   // twins predicted to engage, scaled to pool
  poolSize: number;
  pct: number;       // engaged/poolSize (0..1)
  sentence: string;
};

export type CadenceVerdict = {
  touchCount: number;
  spanDays: number;
  windowLabel: string;
  frequencyLabel: string;
  verdict: string;
};

export type AudienceFit = {
  bestSegment?: { label: string; scorePct: number };
  worstSegment?: { label: string; scorePct: number };
  sentence: string;
};

export type PositioningLine = {
  sentence: string;
};

export type AgentRationale = {
  bullets: string[];
};

/* ------------------------------------------------------------------ */
/*  Small utilities                                                    */
/* ------------------------------------------------------------------ */

function fmtHour(h: number): string {
  const period = h < 12 ? "am" : "pm";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}${period}`;
}

function daysLabel(days: number[] | undefined): string {
  if (!days || !days.length) return "any day";
  if (days.length === 7) return "every day";
  if (days.length === 5 && days.every((d) => d >= 1 && d <= 5)) return "weekdays";
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days.slice().sort().map((d) => names[d]).join(", ");
}

function messageNodes(campaign: Campaign): FlowNode[] {
  return Object.values(campaign.flow.nodes).filter((n) => n.type === "message");
}

function channelsInFlow(campaign: Campaign): Channel[] {
  const set = new Set<Channel>();
  for (const n of Object.values(campaign.flow.nodes)) {
    if (n.type === "message") set.add(n.channel);
  }
  return [...set];
}

/**
 * Sum of delay-node amounts (converted to days) across the flow.
 * Rough proxy for how long the campaign spans end-to-end.
 */
function spanDaysFromFlow(campaign: Campaign): number {
  let days = 0;
  for (const n of Object.values(campaign.flow.nodes)) {
    if (n.type === "delay") {
      const inDays = n.unit === "hours" ? n.amount / 24 : n.amount;
      days += inDays;
    }
  }
  return Math.round(days);
}

function actionWeight(action: TwinResponse["action"]): number {
  if (action === "open_click") return 1;
  if (action === "open_ignore") return 0.4;
  return 0;
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

/* ------------------------------------------------------------------ */
/*  Predicted reach                                                    */
/* ------------------------------------------------------------------ */

export function predictedReach(
  campaign: Campaign,
  rehearsal: RehearsalResult,
): PredictedReach {
  const responses = rehearsal.responses;
  const total = responses.length || 1;
  // Weight actions: full weight for clicks, partial for opens, none for
  // ignore/unsub/spam. Then dampen so the sample-based rate never claims
  // 100% of the pool will resonate (a rehearsal is a projection, not a
  // guarantee — hard ceiling matches the same principle as MAX_DISPLAYED_SCORE).
  const engagementRaw = responses.reduce((s, r) => {
    if (r.action === "open_click") return s + 1;
    if (r.action === "open_ignore") return s + 0.5;
    return s;
  }, 0) / total;
  // 85% ceiling — never claim we can move the whole audience.
  const engagementRate = Math.min(0.85, engagementRaw);

  const poolSize = sourcePoolFor(campaign.audienceGroupId);
  const engaged = Math.round(engagementRate * poolSize);
  const pct = poolSize > 0 ? engaged / poolSize : 0;

  const pctLabel = Math.round(pct * 100);
  const sentence = `Predicted to resonate with ~${engaged.toLocaleString()} of ${poolSize.toLocaleString()} (${pctLabel}%).`;
  return { engaged, poolSize, pct, sentence };
}

/* ------------------------------------------------------------------ */
/*  Cadence verdict                                                    */
/* ------------------------------------------------------------------ */

export function cadenceVerdict(campaign: Campaign): CadenceVerdict {
  const touchCount = messageNodes(campaign).length;
  const spanDays = spanDaysFromFlow(campaign);

  const s = campaign.schedule;
  const windowLabel = s?.sendWindow
    ? `${fmtHour(s.sendWindow.startHour)}–${fmtHour(s.sendWindow.endHour)}, ${daysLabel(s.daysOfWeek)}`
    : "no send window set";
  const frequencyLabel = s?.frequencyCap
    ? `cap ${s.frequencyCap.max}/${s.frequencyCap.per.charAt(0) === "w" ? "wk" : s.frequencyCap.per.slice(0, 2)}`
    : "no cap";

  let verdict: string;
  if (touchCount <= 1) {
    verdict = "Single touch — clean, no fatigue risk.";
  } else if (touchCount >= 3 && spanDays < 10) {
    verdict = `${touchCount} touches in ${spanDays} days — heavy for this audience.`;
  } else if (touchCount === 2 && spanDays >= 3) {
    verdict = `2 touches spaced ${spanDays}d — reasonable pacing.`;
  } else {
    verdict = `${touchCount} touches over ${spanDays}d — check for fatigue after send 2.`;
  }

  return { touchCount, spanDays, windowLabel, frequencyLabel, verdict };
}

/* ------------------------------------------------------------------ */
/*  Audience fit                                                       */
/* ------------------------------------------------------------------ */

export function audienceFit(rehearsal: RehearsalResult): AudienceFit {
  const matrix = rehearsal.segmentMatrix ?? [];
  if (!matrix.length) {
    return {
      sentence: "Single-segment audience — no fit comparison available.",
    };
  }

  // Aggregate per segment: average `strength` (0..1) across message nodes.
  const bySeg = new Map<string, number[]>();
  for (const cell of matrix as SegmentMatrixCell[]) {
    const arr = bySeg.get(cell.segmentLabel) ?? [];
    arr.push(cell.strength);
    bySeg.set(cell.segmentLabel, arr);
  }
  const segRates = [...bySeg.entries()].map(([label, arr]) => ({
    label,
    scorePct: Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 100),
  }));

  if (segRates.length === 1) {
    const only = segRates[0];
    return {
      bestSegment: only,
      sentence: `Lands with ${only.label} (${only.scorePct}% engaged).`,
    };
  }

  const sorted = [...segRates].sort((a, b) => b.scorePct - a.scorePct);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const sentence =
    best.scorePct === worst.scorePct
      ? `Even response across segments (~${best.scorePct}%).`
      : `Lands with ${best.label} (${best.scorePct}% engaged), leaves ${worst.label} cold (${worst.scorePct}%).`;

  return { bestSegment: best, worstSegment: worst, sentence };
}

/* ------------------------------------------------------------------ */
/*  Channel mix                                                        */
/* ------------------------------------------------------------------ */

export function channelMix(
  campaign: Campaign,
  rehearsal: RehearsalResult,
): ChannelMix {
  // Look up channel for each message node.
  const nodeChannel = new Map<string, Channel>();
  for (const n of Object.values(campaign.flow.nodes)) {
    if (n.type === "message") nodeChannel.set(n.id, n.channel);
  }

  const buckets: Record<Channel, { weight: number; count: number }> = {
    email: { weight: 0, count: 0 },
    sms: { weight: 0, count: 0 },
  };
  for (const r of rehearsal.responses) {
    const ch = nodeChannel.get(r.messageNodeId);
    if (!ch) continue;
    buckets[ch].count += 1;
    buckets[ch].weight += actionWeight(r.action);
  }

  const channels = channelsInFlow(campaign);
  const emailStat: ChannelStat | undefined = buckets.email.count
    ? {
        engagement: buckets.email.weight / buckets.email.count,
        sends: buckets.email.count,
        label: "Email",
      }
    : undefined;
  const smsStat: ChannelStat | undefined = buckets.sms.count
    ? {
        engagement: buckets.sms.weight / buckets.sms.count,
        sends: buckets.sms.count,
        label: "SMS",
      }
    : undefined;

  if (channels.length <= 1) {
    const onlyLabel = channels[0] === "sms" ? "SMS" : "Email";
    return {
      email: emailStat,
      sms: smsStat,
      verdict: `${onlyLabel} only.`,
    };
  }

  if (!emailStat || !smsStat) {
    // Flow has both, but responses only landed on one — likely no responses yet
    // for the other node. Fall back to a neutral sentence.
    return {
      email: emailStat,
      sms: smsStat,
      verdict: "Mixed channels — not enough response data to compare yet.",
    };
  }

  const higher = emailStat.engagement >= smsStat.engagement ? emailStat : smsStat;
  const lower = higher === emailStat ? smsStat : emailStat;
  const hPct = Math.round(higher.engagement * 100);
  const lPct = Math.round(lower.engagement * 100);
  const verdict =
    hPct === lPct
      ? `${emailStat.label} and ${smsStat.label} are performing evenly (~${hPct}% engagement).`
      : `${higher.label} carries the flow — ${hPct}% engagement vs ${lPct}% for ${lower.label}.`;

  return { email: emailStat, sms: smsStat, verdict };
}

/* ------------------------------------------------------------------ */
/*  Positioning line (vs prior campaigns of same tag)                  */
/* ------------------------------------------------------------------ */

export function positioningLine(
  campaign: Campaign,
  rehearsal: RehearsalResult,
  historical: HistoricalCampaign[],
): PositioningLine {
  const tagSet = new Set(campaign.tags);
  const like = historical.filter((h) => h.tags.some((t) => tagSet.has(t)));
  if (!like.length) {
    return { sentence: "No prior like-tagged campaigns to compare against." };
  }
  const med = Math.round(median(like.map((h) => h.performanceIndex)));
  const lift = Math.round(rehearsal.verdict.score - med);
  const tagLabel = campaign.tags[0] ?? "past";
  const sign = lift > 0 ? "+" : "";
  const base = `${sign}${lift}pt vs your ${tagLabel} median.`;

  const driver = rehearsal.verdict.driver?.trim();
  const includeDriver = driver && driver.length > 0 && driver.length <= 80;
  return {
    sentence: includeDriver ? `${base} Best driver: ${driver}` : base,
  };
}

/* ------------------------------------------------------------------ */
/*  Agent rationale (why the copilot made the choices it did)          */
/* ------------------------------------------------------------------ */

export function agentRationale(
  campaign: Campaign,
  audience?: AudienceForRationale,
): AgentRationale {
  const iterations = campaign.copilotIterations ?? [];
  const bullets: string[] = [];

  // 1. Audience choice.
  if (audience) {
    const desc = audience.description?.trim();
    bullets.push(
      desc
        ? `Targeting ${audience.name} — ${desc}.`
        : `Targeting ${audience.name}.`,
    );
  }

  // 2. Channel choice.
  const chs = channelsInFlow(campaign);
  if (chs.length >= 2) {
    bullets.push("Mixed email + SMS to catch different response modes.");
  } else if (chs[0] === "email") {
    bullets.push("Email-only — long-form room for context and CTA.");
  } else if (chs[0] === "sms") {
    bullets.push("SMS-only — short-fuse channel for time-sensitive nudges.");
  }

  // 3. Timing choice.
  const s = campaign.schedule;
  if (s?.sendWindow) {
    const dl = daysLabel(s.daysOfWeek);
    bullets.push(
      `${dl.charAt(0).toUpperCase() + dl.slice(1)} sends, ${fmtHour(s.sendWindow.startHour)}–${fmtHour(s.sendWindow.endHour)} — respects the audience's engagement rhythm.`,
    );
  }

  // 4. Iteration-driven applied opportunities. Walk iterations in order and,
  //    for each iteration whose `appliedOppTitle` produced it (iterations 2+),
  //    show the score lift from the prior iteration.
  for (let i = 1; i < iterations.length; i++) {
    const cur = iterations[i];
    const prev = iterations[i - 1];
    if (cur.appliedOppTitle) {
      bullets.push(
        `Applied '${cur.appliedOppTitle}' after iter ${prev.iteration}: raised score ${prev.score}→${cur.score}.`,
      );
    }
  }

  // If we produced nothing derived from the copilot loop, keep the bullet count
  // small but honest.
  if (!iterations.length && bullets.length === 0) {
    return { bullets: ["Rationale not captured for this campaign."] };
  }
  if (!iterations.length) {
    // We still have static-flow bullets; append a single honest note that the
    // copilot didn't leave behind iteration rationale.
    bullets.push("No copilot iterations recorded — rationale inferred from the flow.");
  }

  // Cap at 5 bullets to keep the panel scannable.
  return { bullets: bullets.slice(0, 5) };
}
