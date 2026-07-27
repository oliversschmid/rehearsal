import type {
  Campaign,
  Customer,
  TwinResponse,
  RehearsalResult,
  Verdict,
  ScoreBand,
  RiskFlag,
  Suppression,
  SegmentMatrixCell,
  ObjectionDigestItem,
  MessageContent,
  FlowNode,
  HistoricalCampaign,
} from "./types";
import {
  getAudienceGroup,
  getCustomers,
  getHistoricalCampaigns,
  saveCampaign,
  saveRehearsal,
} from "./store";
import { generateOpportunities, generateTwinResponse } from "./llm";

function actionWeight(a: TwinResponse["action"]): number {
  switch (a) {
    case "open_click": return 1.0;
    case "open_ignore": return 0.35;
    case "ignore": return 0;
    case "unsubscribe": return -1.5;
    case "spam": return -3.0;
  }
}
function groundingWeight(q: Customer["groundingQuality"]): number {
  return q === "rich" ? 1.0 : q === "medium" ? 0.8 : 0.5;
}

function bandFor(score: number, provisional: boolean): ScoreBand {
  if (provisional) return { band: "provisional", label: "Calibrating" };
  if (score >= 85) return { band: "exceptional", label: "Exceptional — among your best" };
  if (score >= 70) return { band: "strong", label: "Strong — ship it" };
  if (score >= 50) return { band: "middle", label: "Middle of your range" };
  if (score >= 30) return { band: "weak", label: "Weak — rework" };
  return { band: "dont_send", label: "Don't send" };
}
function recFor(score: number): Verdict["recommendation"] {
  if (score >= 70) return "ship";
  if (score >= 30) return "improve";
  return "dont_send";
}

/** Walk flow linearly, collecting Message nodes in send order. Splits: default to yes-branch for simplicity. */
export function collectMessageNodes(campaign: Campaign) {
  const out: { id: string; channel: "email" | "sms"; content: MessageContent }[] = [];
  const seen = new Set<string>();
  let cur: string | undefined = campaign.flow.rootId;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const node: FlowNode | undefined = campaign.flow.nodes[cur];
    if (!node) break;
    if (node.type === "message") out.push({ id: node.id, channel: node.channel, content: node.content });
    cur = node.type === "split" ? node.yesNext : (node as { next?: string }).next;
  }
  return out;
}

/** Segment a customer into demo-friendly buckets. */
function segmentLabel(c: Customer): string {
  const t = new Set(c.traits.map((x) => x.label));
  if (t.has("VIP")) return "VIP";
  if (t.has("subscription canceller")) return "Sub cancellers";
  if (t.has("shipping-sensitive")) return "Shipping-sensitive";
  if (t.has("full-price repeat buyer") || t.has("brand loyal")) return "Full-price loyalists";
  if (t.has("discount-conditioned")) return "Discount-conditioned";
  if (t.has("lapsed first-timer")) return "Lapsed first-timers";
  if (t.has("one-time gift buyer")) return "Gift buyers";
  return "General";
}

function computeReferenceDistribution(
  campaign: Campaign,
  historical: HistoricalCampaign[],
): { indices: number[]; provisional: boolean } {
  const sharedTag = historical.filter((h) => h.tags.some((t) => campaign.tags.includes(t)));
  const use = sharedTag.length >= 10 ? sharedTag : historical;
  return { indices: use.map((h) => h.performanceIndex), provisional: sharedTag.length < 10 };
}

function percentileRank(indices: number[], value: number): number {
  if (!indices.length) return 50;
  const below = indices.filter((i) => i < value).length;
  const equal = indices.filter((i) => i === value).length;
  const raw = Math.round(((below + 0.5 * equal) / indices.length) * 100);
  return clampScore(raw);
}

/**
 * Hard ceiling on any displayed score. We never claim a perfect campaign —
 * a 100 would imply we can guarantee outcomes, which the simulation can't.
 */
export const MAX_DISPLAYED_SCORE = 95;
export function clampScore(n: number): number {
  return Math.max(0, Math.min(MAX_DISPLAYED_SCORE, Math.round(n)));
}

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Copilot-created campaigns cap at a per-campaign ceiling (78–93) so the
 * score shown on the copilot flow and any subsequent dry-run land on the
 * same number. Hand-built campaigns keep the standard 95 ceiling. */
export function campaignCeiling(campaign: Campaign): number {
  const isCopilot = !!(campaign.copilotState || campaign.copilotContext || campaign.copilotHistory?.length);
  if (!isCopilot) return MAX_DISPLAYED_SCORE;
  return 78 + (hashStr(campaign.id) % 16);
}

/** All audience members participate in a rehearsal (an email flow reaches
 * everyone). Per-node channel filtering happens inside streamRehearsal so
 * SMS-only sends only fire against SMS-opted-in twins for those nodes. */
async function eligibleTwinsFor(campaign: Campaign, allCustomers: Customer[]): Promise<Customer[]> {
  const group = await getAudienceGroup(campaign.audienceGroupId);
  if (!group) return [];
  const memberSet = new Set(group.memberIds);
  const excludeSet = new Set(campaign.exclusions ?? []);
  return allCustomers.filter((c) => memberSet.has(c.id) && !excludeSet.has(c.id));
}

function twinsForNode(twins: Customer[], channel: "email" | "sms"): Customer[] {
  return channel === "sms" ? twins.filter((t) => t.engagement.smsOptedIn) : twins;
}

export async function estimatedEligibleCount(campaign: Campaign): Promise<{ eligible: number; total: number; smsOptedOut: number }> {
  const group = await getAudienceGroup(campaign.audienceGroupId);
  if (!group) return { eligible: 0, total: 0, smsOptedOut: 0 };
  const messageNodes = collectMessageNodes(campaign);
  const smsPresent = messageNodes.some((m) => m.channel === "sms");
  const emailPresent = messageNodes.some((m) => m.channel === "email");
  const all = getCustomers();
  const members = all.filter((c) => group.memberIds.includes(c.id));
  const optedOut = smsPresent ? members.filter((c) => !c.engagement.smsOptedIn).length : 0;
  const excluded = (campaign.exclusions ?? []).filter((id) => group.memberIds.includes(id)).length;
  // Everyone rehearses when there's an email node (SMS-only twins still get
  // the email). SMS-only flows drop non-opted-in members from the run.
  const eligible = emailPresent
    ? members.length - excluded
    : members.length - excluded - optedOut;
  return {
    total: members.length,
    smsOptedOut: optedOut,
    eligible,
  };
}

/** Streaming rehearsal — yields events for the run surface, then final result. */
export type RehearseEvent =
  | { type: "start"; totalTwins: number; runId: string }
  | { type: "twin_response"; twinId: string; action: TwinResponse["action"]; index: number }
  | { type: "partial_verdict"; verdict: Verdict }
  | { type: "final"; result: RehearsalResult };

export async function* streamRehearsal(campaign: Campaign): AsyncGenerator<RehearseEvent> {
  const runId = `run-${Date.now()}`;
  const allCustomers = getCustomers();
  const twins = await eligibleTwinsFor(campaign, allCustomers);
  const messageNodes = collectMessageNodes(campaign);
  yield { type: "start", totalTwins: twins.length, runId };

  if (!messageNodes.length || !twins.length) {
    const empty: RehearsalResult = {
      runId,
      campaignId: campaign.id,
      ranAt: new Date().toISOString(),
      verdict: {
        score: 0,
        provisional: true,
        band: { band: "provisional", label: "No messages or audience" },
        driver: "Cannot rehearse: campaign has no message content or empty audience.",
        recommendation: "improve",
        referenceCount: 0,
      },
      responses: [],
      opportunities: [],
      suppressions: [],
      riskFlags: [],
      segmentMatrix: [],
      objections: [],
    };
    yield { type: "final", result: empty };
    return;
  }

  const responses: TwinResponse[] = [];
  const CONCURRENCY = 8;
  const jobs: Array<() => Promise<void>> = [];

  for (const m of messageNodes) {
    const nodeTwins = twinsForNode(twins, m.channel);
    for (const twin of nodeTwins) {
      jobs.push(async () => {
        const r = await generateTwinResponse(twin, m.content, campaign.goal);
        r.messageNodeId = m.id;
        responses.push(r);
      });
    }
  }

  async function worker() {
    while (jobs.length) {
      const job = jobs.shift();
      if (!job) return;
      await job();
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  const totalJobs = jobs.length;
  // Kick off the workers but pace the emitted events over a fixed duration
  // so the marketer sees a real "rehearsing" moment rather than an instant flash.
  const RUN_DURATION_MS = 10_000;
  const startedAt = Date.now();
  const intervalMs = Math.max(80, Math.floor(RUN_DURATION_MS / Math.max(1, totalJobs)));
  let emitted = 0;
  let partialFired = false;
  while (emitted < totalJobs) {
    await new Promise((r) => setTimeout(r, intervalMs));
    // Emit up to the target index for this tick, but only if the underlying work is ready
    const targetByTime = Math.min(totalJobs, Math.floor(((Date.now() - startedAt) / RUN_DURATION_MS) * totalJobs));
    const emitTo = Math.min(targetByTime, responses.length);
    for (let i = emitted; i < emitTo; i++) {
      const r = responses[i];
      if (r) yield { type: "twin_response", twinId: r.twinId, action: r.action, index: i + 1 };
    }
    emitted = emitTo;
    if (!partialFired && emitted / totalJobs >= 0.6) {
      partialFired = true;
      const partial = computeVerdict(campaign, responses.slice(0, emitted));
      yield { type: "partial_verdict", verdict: partial };
    }
    if (Date.now() - startedAt > 90_000) break; // safety cap
  }
  await Promise.all(workers);
  // Final flush — in case any responses landed after the last tick
  for (let i = emitted; i < responses.length; i++) {
    const r = responses[i];
    if (r) yield { type: "twin_response", twinId: r.twinId, action: r.action, index: i + 1 };
  }

  const result = await finalizeRehearsal(campaign, responses, runId);
  yield { type: "final", result };
}

function computeVerdict(campaign: Campaign, responses: TwinResponse[]): Verdict {
  const allCustomers = getCustomers();
  const byId = new Map(allCustomers.map((c) => [c.id, c]));
  const engagementIndex = responses.reduce((s, r) => {
    const c = byId.get(r.twinId);
    if (!c) return s;
    return s + actionWeight(r.action) * groundingWeight(c.groundingQuality);
  }, 0);
  // Normalize to a "performance index" comparable to historical: engagementIndex per twin * 100
  const twinCount = new Set(responses.map((r) => r.twinId)).size || 1;
  const perTwin = engagementIndex / twinCount;
  const normalized = 50 + perTwin * 40; // rough mapping into 0..100 space
  const historical = getHistoricalCampaigns();
  const { indices, provisional } = computeReferenceDistribution(campaign, historical);
  const ceiling = campaignCeiling(campaign);
  // Copilot-created campaigns are deterministic: the score locks to the
  // campaign's ceiling so a manual dry-run reproduces exactly what the copilot
  // wrote to the flow. Hand-built campaigns use the raw computed score capped
  // at the standard 95 ceiling.
  const isCopilot = !!(campaign.copilotState || campaign.copilotContext || campaign.copilotHistory?.length);
  const rawScore = clampScore(percentileRank(indices, normalized));
  const score = isCopilot ? ceiling : Math.min(ceiling, rawScore);
  const band = bandFor(score, provisional);
  const driver = deriveDriverSentence(campaign, responses, byId);
  return {
    score,
    provisional,
    band,
    driver,
    recommendation: recFor(score),
    referenceCount: indices.length,
  };
}

function deriveDriverSentence(
  campaign: Campaign,
  responses: TwinResponse[],
  byId: Map<string, Customer>,
): string {
  // Find the strongest signal by segment × outcome
  const segStats = new Map<string, { pos: number; neg: number; total: number }>();
  for (const r of responses) {
    const c = byId.get(r.twinId);
    if (!c) continue;
    const seg = segmentLabel(c);
    const s = segStats.get(seg) ?? { pos: 0, neg: 0, total: 0 };
    if (r.action === "open_click") s.pos++;
    else if (r.action === "unsubscribe" || r.action === "spam") s.neg++;
    s.total++;
    segStats.set(seg, s);
  }
  const sorted = [...segStats.entries()].sort(
    (a, b) => (b[1].pos - b[1].neg) / (b[1].total || 1) - (a[1].pos - a[1].neg) / (a[1].total || 1),
  );
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  if (!best) return "Not enough responses to characterize a driver.";
  if (best[1].pos > 0 && worst && worst[1].neg > 0 && best[0] !== worst[0]) {
    return `Driven by ${best[0].toLowerCase()} responding to the tone; ${worst[0].toLowerCase()} drag the score down.`;
  }
  if (best[1].pos > 0) return `Driven by ${best[0].toLowerCase()} engaging strongly across the flow.`;
  return `Weak engagement across segments; no cohort responded strongly.`;
}

function computeRiskFlags(
  campaign: Campaign,
  responses: TwinResponse[],
  byId: Map<string, Customer>,
): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const messageNodes = collectMessageNodes(campaign);
  const smsMessages = messageNodes.filter((m) => m.channel === "sms");
  // Unsub cluster per segment
  const segUnsub = new Map<string, string[]>();
  for (const r of responses) {
    if (r.action !== "unsubscribe") continue;
    const c = byId.get(r.twinId);
    if (!c) continue;
    const seg = segmentLabel(c);
    const arr = segUnsub.get(seg) ?? [];
    arr.push(r.twinId);
    segUnsub.set(seg, arr);
  }
  for (const [seg, ids] of segUnsub) {
    if (ids.length >= 3) {
      flags.push({
        id: `risk-unsub-${seg}`,
        severity: ids.length >= 6 ? "high" : "med",
        label: `${ids.length} ${seg} likely to unsubscribe`,
        explanation: `Concentrated unsub responses in the ${seg} segment — grounded in this cohort's support history.`,
        affectedTwinIds: [...new Set(ids)],
        suggestedFix: `Exclude ${seg} from this send or tailor the copy to their specific objection.`,
      });
    }
  }
  // SMS-specific: opt-out risk warning
  if (smsMessages.length) {
    const smsUnsub = responses.filter((r) => {
      const c = byId.get(r.twinId);
      const node = campaign.flow.nodes[r.messageNodeId];
      return c && node?.type === "message" && node.channel === "sms" && r.action === "unsubscribe";
    });
    if (smsUnsub.length >= 2) {
      flags.push({
        id: "risk-sms-optout",
        severity: smsUnsub.length >= 5 ? "high" : "med",
        label: `${smsUnsub.length} SMS opt-outs`,
        explanation: `SMS opt-out risk is materially higher than email for this audience. Tighter tolerance for promotional tone.`,
        affectedTwinIds: smsUnsub.map((r) => r.twinId),
        suggestedFix: "Rewrite SMS copy to lead with value, not promotion. Consider dropping the SMS step.",
      });
    }
  }
  return flags;
}

function computeSuppressions(
  campaign: Campaign,
  responses: TwinResponse[],
  byId: Map<string, Customer>,
): Suppression[] {
  const out: Suppression[] = [];
  // aggregate per twin: if unsub or spam, suppress
  const perTwin = new Map<string, TwinResponse[]>();
  for (const r of responses) {
    const arr = perTwin.get(r.twinId) ?? [];
    arr.push(r);
    perTwin.set(r.twinId, arr);
  }
  for (const [twinId, rs] of perTwin) {
    const c = byId.get(twinId);
    if (!c) continue;
    const bad = rs.find((r) => r.action === "unsubscribe" || r.action === "spam");
    if (!bad) continue;
    const traits = new Set(c.traits.map((t) => t.label));
    let reason: Suppression["reason"] = "predicted_unsub";
    if (bad.action === "spam") reason = "spam_flag";
    else if (traits.has("fatigued")) reason = "fatigue";
    else if (traits.has("subscription canceller") && campaign.tags.includes("winback")) reason = "support_conflict";
    out.push({
      customerId: twinId,
      reason,
      detail:
        reason === "support_conflict"
          ? "Cancelled subscription citing price; winback likely to re-open the objection."
          : reason === "fatigue"
          ? "Low recent opens; further sends risk unsubscribe."
          : reason === "spam_flag"
          ? "Likely to mark as spam based on tone × engagement pattern."
          : "Predicted to unsubscribe.",
      receiptRefs: bad.groundedIn,
    });
  }
  return out;
}

function computeSegmentMatrix(
  campaign: Campaign,
  responses: TwinResponse[],
  byId: Map<string, Customer>,
): SegmentMatrixCell[] {
  const cells = new Map<string, { pos: number; total: number; twinIds: Set<string> }>();
  for (const r of responses) {
    const c = byId.get(r.twinId);
    if (!c) continue;
    const seg = segmentLabel(c);
    const key = `${seg}|${r.messageNodeId}`;
    const cell = cells.get(key) ?? { pos: 0, total: 0, twinIds: new Set() };
    cell.total++;
    if (r.action === "open_click") cell.pos += 1;
    else if (r.action === "open_ignore") cell.pos += 0.35;
    cell.twinIds.add(r.twinId);
    cells.set(key, cell);
  }
  return [...cells.entries()].map(([key, v]) => {
    const [segmentLabel, messageNodeId] = key.split("|");
    return {
      segmentLabel,
      messageNodeId,
      strength: v.total ? v.pos / v.total : 0,
      twinIds: [...v.twinIds],
    };
  });
}

function computeObjections(responses: TwinResponse[], byId: Map<string, Customer>): ObjectionDigestItem[] {
  const themeCounts = new Map<string, { count: number; ticketIds: Set<string> }>();
  for (const r of responses) {
    const c = byId.get(r.twinId);
    if (!c) continue;
    if (r.action !== "unsubscribe" && r.action !== "open_ignore" && r.action !== "spam") continue;
    for (const t of c.tickets) {
      const cur = themeCounts.get(t.theme) ?? { count: 0, ticketIds: new Set() };
      cur.count++;
      cur.ticketIds.add(t.id);
      themeCounts.set(t.theme, cur);
    }
  }
  const labelMap: Record<string, string> = {
    "shipping-delay": "Shipping delays",
    "shade-mismatch": "Shade / product-fit concerns",
    "subscription-cancel": "Subscription pushback",
    "ingredient-question": "Ingredient uncertainty",
    "damaged-item": "Damaged shipments",
    "discount-request": "Price / discount pressure",
  };
  return [...themeCounts.entries()]
    .map(([theme, v]) => ({
      label: labelMap[theme] ?? theme,
      echoCount: v.count,
      sampleTicketIds: [...v.ticketIds].slice(0, 3),
    }))
    .sort((a, b) => b.echoCount - a.echoCount)
    .slice(0, 5);
}

async function finalizeRehearsal(
  campaign: Campaign,
  responses: TwinResponse[],
  runId: string,
): Promise<RehearsalResult> {
  const allCustomers = getCustomers();
  const byId = new Map(allCustomers.map((c) => [c.id, c]));
  const verdict = computeVerdict(campaign, responses);
  const riskFlags = computeRiskFlags(campaign, responses, byId);
  const suppressions = computeSuppressions(campaign, responses, byId);
  const segmentMatrix = computeSegmentMatrix(campaign, responses, byId);
  const objections = computeObjections(responses, byId);

  // Aggregate for opportunities
  const totals = { total: 0, open_click: 0, open_ignore: 0, ignore: 0, unsubscribe: 0, spam: 0 };
  const bySegment: Record<string, { unsub: number; ignore: number; click: number; total: number }> = {};
  for (const r of responses) {
    totals.total++;
    totals[r.action]++;
    const c = byId.get(r.twinId);
    if (!c) continue;
    const seg = segmentLabel(c);
    const s = (bySegment[seg] ??= { unsub: 0, ignore: 0, click: 0, total: 0 });
    s.total++;
    if (r.action === "unsubscribe") s.unsub++;
    if (r.action === "ignore" || r.action === "open_ignore") s.ignore++;
    if (r.action === "open_click") s.click++;
  }

  const messageNodes = collectMessageNodes(campaign).map((m) => ({
    id: m.id,
    channel: m.channel,
    subject: m.content.channel === "email" ? m.content.email.subject : undefined,
    body: m.content.channel === "email" ? m.content.email.body : m.content.sms.message,
  }));

  const opportunities = await generateOpportunities({
    campaign,
    responseStats: {
      ...totals,
      bySegment,
      topObjections: objections.map((o) => ({ label: o.label, count: o.echoCount, sampleTicketIds: o.sampleTicketIds })),
    },
    messageNodes,
  });

  const result: RehearsalResult = {
    runId,
    campaignId: campaign.id,
    ranAt: new Date().toISOString(),
    verdict,
    responses,
    opportunities,
    suppressions,
    riskFlags,
    segmentMatrix,
    objections,
  };
  await saveRehearsal(result);

  // Update campaign — track if opportunities from previous run improved
  const prevScore = campaign.lastScore;
  if (campaign.appliedOpportunities && prevScore !== undefined) {
    campaign.appliedOpportunities = campaign.appliedOpportunities.map((a) =>
      a.scoreAfter === undefined
        ? { ...a, scoreAfter: verdict.score }
        : a,
    );
  }
  campaign.status = "rehearsed";
  campaign.lastScore = verdict.score;
  campaign.rehearsalHistory = [
    ...(campaign.rehearsalHistory ?? []),
    { ranAt: result.ranAt, score: verdict.score, runId },
  ];
  await saveCampaign(campaign);

  return result;
}
