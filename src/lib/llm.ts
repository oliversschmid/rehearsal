import type {
  Customer,
  MessageContent,
  TwinResponse,
  TwinAction,
  EvidenceRef,
  Opportunity,
  Campaign,
} from "./types";

/** Thin adapter: uses Anthropic when ANTHROPIC_API_KEY is set, else a deterministic mock. */

const HAS_KEY = !!process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

let cachedClient: unknown = null;
async function getClient() {
  if (!HAS_KEY) return null;
  if (cachedClient) return cachedClient;
  const mod = await import("@anthropic-ai/sdk");
  cachedClient = new mod.default({ apiKey: process.env.ANTHROPIC_API_KEY! });
  return cachedClient;
}

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function contentHash(content: MessageContent, positionCtx: string): string {
  const s = JSON.stringify({ content, positionCtx });
  return String(hashString(s));
}

/* ============================================================
   TWIN RESPONSE — real or mocked
   ============================================================ */

function renderMessage(content: MessageContent): string {
  if (content.channel === "email") {
    return `SUBJECT: ${content.email.subject}\nPREHEADER: ${content.email.preheader}\n\n${content.email.body}\n\nCTA: ${content.email.ctaText} → ${content.email.ctaUrl}`;
  }
  return `SMS: ${content.sms.message}${content.sms.link ? "\nLink: " + content.sms.link : ""}`;
}

function twinSystemPrompt(twin: Customer, channel: "email" | "sms", campaignGoal: string): string {
  const orders = twin.orders.map((o) => `- ${o.id}: ${o.date.slice(0,10)} — ${o.items.map(i => i.name).join(", ")} — $${o.total}${o.discountCode ? " (code " + o.discountCode + ")" : ""}`).join("\n") || "  (no orders)";
  const tickets = twin.tickets.map((t) => `- ${t.id}: ${t.date.slice(0,10)} [${t.theme}] "${t.excerpt}"`).join("\n") || "  (no support history)";
  const traits = twin.traits.map((t) => `- ${t.label} (evidence: ${t.evidence.map((e) => e.type + ":" + e.id).join(", ") || "derived"})`).join("\n") || "  (none)";
  const eng = twin.engagement;
  const engStr = `- opens (90d): ${eng.opensLast90d}, clicks: ${eng.clicksLast90d}, last open: ${eng.lastOpenDaysAgo}d ago, unsub risk: ${eng.unsubRisk}, SMS opted-in: ${eng.smsOptedIn}, SMS opt-out risk: ${eng.smsOptOutRisk}`;

  const smsAddendum = channel === "sms"
    ? `\nThis is a text message on your personal phone. You tolerate far less from brands over SMS than email — react accordingly. If a brand texts you outside normal waking hours or too often, you may unsubscribe.`
    : "";

  return `You are simulating ${twin.firstName} ${twin.lastInitial}., a real customer of Verve & Vine (DTC skincare).
Ground every behavior in this customer's actual data:
Orders:
${orders}
Support history:
${tickets}
Engagement:
${engStr}
Traits:
${traits}
You are about to receive a marketing ${channel === "email" ? "email" : "text message"} from the brand.${smsAddendum}
Campaign goal (context — the customer doesn't know this): ${campaignGoal}
Respond ONLY as JSON on a single line:
{"action":"open_click"|"open_ignore"|"ignore"|"unsubscribe"|"spam","reaction":"<1-2 sentence in-character reaction>","groundedIn":["<ticket or order id>", ...]}
Rules: the reaction must be consistent with the data above. If this customer's data suggests fatigue or irritation with this type of message, act on it. groundedIn must contain at least one real id or the reaction will be discarded.`;
}

function mockTwinResponse(twin: Customer, content: MessageContent, campaignGoal: string): TwinResponse {
  const rng = mulberry(hashString(twin.id + JSON.stringify(content) + campaignGoal));
  const isEmail = content.channel === "email";
  const text = isEmail
    ? (content.email.subject + " " + content.email.body).toLowerCase()
    : content.sms.message.toLowerCase();

  const traitLabels = new Set(twin.traits.map((t) => t.label));
  const hasDiscountLang = /(discount|off|save|% off|last chance|urgent|hurry)/.test(text);
  const hasEmpathyLang = /(no discount|we get it|worth a look|thoughtful|since you last)/.test(text);
  const isSubscriptionAsk = /(subscribe|subscription|monthly|auto)/.test(text);

  let openProp = 0.35;
  let clickIfOpen = 0.35;
  let unsubProp = 0.02;
  const spamProp = 0.005;

  // Engagement baseline
  openProp += Math.min(0.35, twin.engagement.opensLast90d / 60);
  openProp -= Math.min(0.25, twin.engagement.lastOpenDaysAgo / 200);
  if (twin.engagement.unsubRisk === "high") unsubProp += 0.15;
  else if (twin.engagement.unsubRisk === "med") unsubProp += 0.05;

  // Channel adjustment
  if (!isEmail) {
    openProp += 0.15; // texts are read more
    if (!twin.engagement.smsOptedIn) {
      // Shouldn't be sent, but if it is: unsub jumps
      unsubProp += 0.2;
    }
    if (twin.engagement.smsOptOutRisk === "med") unsubProp += 0.05;
    // SMS unsubscribe language sensitivity is tighter
    if (hasDiscountLang) unsubProp += 0.03;
  }

  // Trait-driven
  if (traitLabels.has("subscription canceller") && isSubscriptionAsk) unsubProp += 0.2;
  if (traitLabels.has("subscription canceller") && hasDiscountLang) clickIfOpen -= 0.1;
  if (traitLabels.has("full-price repeat buyer")) {
    if (hasDiscountLang) {
      openProp -= 0.1;
      clickIfOpen -= 0.15;
    } else if (hasEmpathyLang) {
      clickIfOpen += 0.15;
    }
  }
  if (traitLabels.has("VIP") && hasEmpathyLang) clickIfOpen += 0.1;
  if (traitLabels.has("discount-conditioned") && hasDiscountLang) clickIfOpen += 0.25;
  if (traitLabels.has("fatigued")) {
    openProp -= 0.15;
    unsubProp += 0.05;
  }
  if (traitLabels.has("shipping-sensitive") && /(ship|delivery|arrival)/.test(text)) {
    clickIfOpen -= 0.1;
  }

  const roll = rng();
  const rollUnsub = rng();
  const rollSpam = rng();
  let action: TwinAction;
  if (rollSpam < spamProp) action = "spam";
  else if (rollUnsub < unsubProp) action = "unsubscribe";
  else if (roll < openProp) {
    action = rng() < Math.max(0, clickIfOpen) ? "open_click" : "open_ignore";
  } else action = "ignore";

  // Reaction text — pick from grounded phrases
  const grounded: EvidenceRef[] = [];
  let reaction = "";
  if (traitLabels.has("shipping-sensitive") && twin.tickets.length) {
    const t = twin.tickets.find((x) => x.theme === "shipping-delay");
    if (t) {
      grounded.push({ type: "ticket", id: t.id });
      reaction = action === "unsubscribe"
        ? "Still frustrated about the shipping delay — this feels tone-deaf."
        : action.startsWith("open") ? "Ok, I'll look — but they still owe me an update on that late order." : "Ignoring — my last order is still limping through shipping.";
    }
  } else if (traitLabels.has("subscription canceller") && twin.tickets.length) {
    const t = twin.tickets.find((x) => x.theme === "subscription-cancel");
    if (t) {
      grounded.push({ type: "ticket", id: t.id });
      reaction = action === "unsubscribe"
        ? "Cancelled the subscription for a reason. Don't need reminders."
        : action.startsWith("open") ? "Curious what they say — the price was the whole problem though." : "Passing. Already told them no.";
    }
  } else if (traitLabels.has("full-price repeat buyer") && twin.orders.length) {
    grounded.push({ type: "order", id: twin.orders[0].id });
    reaction = hasDiscountLang
      ? "Ugh, another 'last chance' email. Was just about to reorder at full price."
      : action.startsWith("open") ? "This actually sounds like they're paying attention. Worth a click." : "Skimming — nothing new.";
  } else if (traitLabels.has("discount-conditioned") && twin.orders.length) {
    grounded.push({ type: "order", id: twin.orders[0].id });
    reaction = hasDiscountLang
      ? "Discount? Now you have my attention."
      : action.startsWith("open") ? "Ok, opening — but no code, no click." : "Skip. Come back with a code.";
  } else if (traitLabels.has("lapsed first-timer") && twin.orders.length) {
    grounded.push({ type: "order", id: twin.orders[0].id });
    if (hasEmpathyLang) {
      reaction = action.startsWith("open")
        ? "Ok, this doesn't feel like the usual push. Might take a look."
        : "Not really in market right now — but appreciate the tone.";
    } else if (hasDiscountLang) {
      reaction = action.startsWith("open") ? "Discount pulled me in, we'll see." : "Passing on another 'come back' email.";
    } else {
      reaction = action === "open_click"
        ? "Something caught my eye — quick look."
        : action === "open_ignore"
        ? "Opened, skimmed, moved on."
        : "Ignoring.";
    }
  } else if (traitLabels.has("one-time gift buyer") && twin.orders.length) {
    grounded.push({ type: "order", id: twin.orders[0].id });
    reaction = action === "open_click"
      ? "Sure, I remember buying this once — worth a peek."
      : "Bought this as a gift months ago. Not really the target audience.";
  } else if (twin.orders.length) {
    grounded.push({ type: "order", id: twin.orders[0].id });
    if (action === "open_click") reaction = "Interested — clicking through.";
    else if (action === "open_ignore") reaction = "Read the whole thing, didn't feel a need to click.";
    else if (action === "unsubscribe") reaction = "Too much, unsubscribing.";
    else reaction = "Skimmed the subject, closed it.";
  }

  // Enforce principle 2 — reactions require receipts. Thin twins get action-only.
  if (!grounded.length) {
    return {
      twinId: twin.id,
      messageNodeId: "",
      action,
      reaction: "",
      groundedIn: [],
    };
  }

  return { twinId: twin.id, messageNodeId: "", action, reaction, groundedIn: grounded };
}

function mulberry(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function generateTwinResponse(
  twin: Customer,
  content: MessageContent,
  campaignGoal: string,
): Promise<TwinResponse> {
  const client = await getClient();
  if (!client) return mockTwinResponse(twin, content, campaignGoal);

  try {
    const system = twinSystemPrompt(twin, content.channel, campaignGoal);
    const user = renderMessage(content);
    // @ts-expect-error dynamic sdk shape
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 350,
      temperature: 0.3,
      system,
      messages: [{ role: "user", content: user }],
    });
    const first = resp.content?.[0];
    const text: string = first && "text" in first ? first.text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("no json");
    const parsed = JSON.parse(jsonMatch[0]);
    const evidenceRefs: EvidenceRef[] = (parsed.groundedIn ?? [])
      .map((id: string): EvidenceRef | null => {
        const t = twin.tickets.find((x) => x.id === id);
        if (t) return { type: "ticket", id };
        const o = twin.orders.find((x) => x.id === id);
        if (o) return { type: "order", id };
        return null;
      })
      .filter(Boolean) as EvidenceRef[];
    if (!evidenceRefs.length) {
      return { twinId: twin.id, messageNodeId: "", action: parsed.action, reaction: "", groundedIn: [] };
    }
    return {
      twinId: twin.id,
      messageNodeId: "",
      action: parsed.action as TwinAction,
      reaction: String(parsed.reaction ?? ""),
      groundedIn: evidenceRefs,
    };
  } catch {
    return mockTwinResponse(twin, content, campaignGoal);
  }
}

/* ============================================================
   OPPORTUNITY GENERATION — real or mocked
   ============================================================ */

export type OppInput = {
  campaign: Campaign;
  responseStats: {
    total: number;
    open_click: number;
    open_ignore: number;
    ignore: number;
    unsubscribe: number;
    spam: number;
    bySegment: Record<string, { unsub: number; ignore: number; click: number; total: number }>;
    topObjections: { label: string; count: number; sampleTicketIds: string[] }[];
  };
  messageNodes: {
    id: string;
    channel: "email" | "sms";
    subject?: string;
    body: string;
  }[];
};

export async function generateOpportunities(input: OppInput): Promise<Opportunity[]> {
  const client = await getClient();
  if (!client) return mockOpportunities(input);
  try {
    const messageNodeIds = input.messageNodes.map((m) => m.id).join(", ");
    const system = `You are a lifecycle marketing analyst. Given a campaign, its rehearsal response stats, and the copy of each message, produce at most 5 ranked, specific opportunities to improve the campaign. Rank by impact × confidence.

Return ONLY a JSON array. Every element MUST match this exact shape (no missing fields):

[
  {
    "id": "opp-<nodeId>-<short-slug>",
    "type": "subject" | "copy" | "tone" | "timing" | "exclusion",
    "target": {
      "nodeId": "<one of these EXACT message node ids: ${messageNodeIds}>",
      "field": "subject" | "preheader" | "body" | "ctaText" | "message" | "delayAmount"
    },
    "change": "<the new text or value the app should apply — for a subject opp put the new subject; for a body opp put the full replacement body; for a timing opp put the number of days as a string>",
    "why": "<one sentence, grounded in the response stats or objections above>",
    "impactRange": [<lower int between 2 and 9>, <upper int between 2 and 9>],
    "title": "<short human-readable label>"
  }
]

Rules:
- Impact must be modest: 2–9 points, upper ≥ lower.
- Every opportunity's target.nodeId MUST be one of these exact ids: ${messageNodeIds}. Do not invent new node ids.
- For subject/preheader/body/ctaText, target.nodeId must point to an EMAIL message. For "message" field, it must point to an SMS message.
- No commentary, no markdown fences — pure JSON array.`;
    const user = JSON.stringify(input);
    // @ts-expect-error dynamic sdk shape
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      temperature: 0.3,
      system,
      messages: [{ role: "user", content: user }],
    });
    const first = resp.content?.[0];
    const text: string = first && "text" in first ? first.text : "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("no array");
    const arr = JSON.parse(jsonMatch[0]);
    const validNodeIds = new Set(input.messageNodes.map((m) => m.id));
    const valid = validateOpportunities(arr, validNodeIds);
    // If Claude returned nothing valid, fall back to the deterministic mock so
    // the iteration loop still has something to apply.
    return valid.length ? valid : mockOpportunities(input);
  } catch {
    return mockOpportunities(input);
  }
}

/** Strictly validate LLM-generated opportunities — drop any that don't match the shape. */
function validateOpportunities(raw: unknown, validNodeIds: Set<string>): Opportunity[] {
  if (!Array.isArray(raw)) return [];
  const out: Opportunity[] = [];
  for (const o of raw as Array<Record<string, unknown>>) {
    if (!o || typeof o !== "object") continue;
    const type = o.type as string;
    if (!["subject", "copy", "tone", "timing", "exclusion"].includes(type)) continue;
    const target = o.target as { nodeId?: string; field?: string } | undefined;
    if (!target || typeof target.nodeId !== "string") continue;
    if (type !== "exclusion" && !validNodeIds.has(target.nodeId)) continue;
    const impact = o.impactRange as [number, number] | undefined;
    if (!Array.isArray(impact) || impact.length !== 2 || typeof impact[0] !== "number") continue;
    out.push({
      id: typeof o.id === "string" ? o.id : `opp-${target.nodeId}-${type}`,
      type: type as Opportunity["type"],
      target: { nodeId: target.nodeId, field: target.field as Opportunity["target"]["field"] },
      change: typeof o.change === "string" ? o.change : "",
      why: typeof o.why === "string" ? o.why : "",
      impactRange: [Math.max(2, Math.min(9, impact[0])), Math.max(2, Math.min(9, impact[1] ?? impact[0]))],
      title: typeof o.title === "string" ? o.title : "Suggested improvement",
    });
    if (out.length >= 5) break;
  }
  return out;
}

function mockOpportunities(input: OppInput): Opportunity[] {
  const opps: Opportunity[] = [];
  const { campaign, responseStats, messageNodes } = input;

  for (const m of messageNodes) {
    if (m.channel === "email" && m.subject && /last chance|hurry|urgent|final|last call/i.test(m.subject)) {
      opps.push({
        id: `opp-${m.id}-subject`,
        type: "subject",
        target: { nodeId: m.id, field: "subject" },
        change: m.subject.replace(/\s*(—|-)?\s*(last chance|hurry|urgent|final|last call)/i, "").trim() || "Something worth a look",
        why: "Urgency framing triggered ignore/unsub responses in loyal buyers — echoes complaints in the discount-request ticket theme.",
        impactRange: [4, 7],
        title: `Drop urgency framing from "${m.subject}"`,
      });
    }
    if (m.channel === "email" && /\bdiscount\b|%\s*off|save\s*\d+/i.test(m.body) && campaign.tags.includes("winback")) {
      opps.push({
        id: `opp-${m.id}-tone`,
        type: "tone",
        target: { nodeId: m.id, field: "body" },
        change: m.body.replace(/.{0,60}(discount|% off|save \d+%?).{0,60}/gi, "").trim(),
        why: "Discount language conflicts with the goal ('without leaning on a discount'). Full-price loyalists react negatively.",
        impactRange: [3, 6],
        title: "Remove discount language conflicting with campaign goal",
      });
    }
  }

  // Segment-driven exclusion
  const worstSegment = Object.entries(responseStats.bySegment).sort(
    (a, b) => b[1].unsub / (b[1].total || 1) - a[1].unsub / (a[1].total || 1),
  )[0];
  if (worstSegment && worstSegment[1].unsub >= 2) {
    opps.push({
      id: `opp-exclude-${worstSegment[0]}`,
      type: "exclusion",
      target: { nodeId: campaign.flow.rootId },
      change: worstSegment[0],
      why: `${worstSegment[1].unsub} of ${worstSegment[1].total} in "${worstSegment[0]}" unsubscribed in rehearsal — grounded in support-ticket history.`,
      impactRange: [3, 6],
      title: `Suppress high-risk segment: ${worstSegment[0]}`,
    });
  }

  // Timing
  const delayNode = Object.values(campaign.flow.nodes).find((n) => n.type === "delay");
  if (delayNode && delayNode.type === "delay" && delayNode.amount < 3) {
    opps.push({
      id: `opp-timing-${delayNode.id}`,
      type: "timing",
      target: { nodeId: delayNode.id, field: "delayAmount" },
      change: "3",
      why: "Shorter delays over-fired against fatigued opens; stretching the gap reduces ignore rate in the second send.",
      impactRange: [2, 4],
      title: `Increase delay from ${delayNode.amount} to 3 ${delayNode.unit}`,
    });
  }

  return opps.slice(0, 5);
}

/* ============================================================
   TWIN CHAT (Ask this customer)
   ============================================================ */

export async function twinChat(
  twin: Customer,
  history: { role: "user" | "assistant"; content: string }[],
  message: string,
): Promise<{ reply: string; citations: EvidenceRef[] }> {
  const client = await getClient();
  if (!client) return mockTwinChat(twin, message);
  try {
    const system = `You are ${twin.firstName} ${twin.lastInitial}., a customer of Verve & Vine (DTC skincare).
Stay in character. Only reference things supported by the data below. If asked about something not in your data, say you can't recall.
Your orders:
${twin.orders.map((o) => `- ${o.id}: ${o.date.slice(0,10)} — ${o.items.map(i=>i.name).join(", ")} — $${o.total}`).join("\n") || "  (none)"}
Your support tickets:
${twin.tickets.map((t) => `- ${t.id}: ${t.theme} — "${t.excerpt}"`).join("\n") || "  (none)"}
Traits: ${twin.traits.map(t=>t.label).join(", ")}
When you cite a specific past event, mention the id in brackets like [${twin.orders[0]?.id ?? "order-id"}] so the receipt can be surfaced.
Reply in 1-3 sentences, in your own voice.`;
    // @ts-expect-error dynamic sdk shape
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 250,
      temperature: 0.6,
      system,
      messages: [...history.map(h => ({ role: h.role, content: h.content })), { role: "user", content: message }],
    });
    const first = resp.content?.[0];
    const text: string = first && "text" in first ? first.text : "";
    return { reply: text, citations: extractCitations(text, twin) };
  } catch {
    return mockTwinChat(twin, message);
  }
}

function extractCitations(text: string, twin: Customer): EvidenceRef[] {
  const out: EvidenceRef[] = [];
  const bracketed = text.match(/\[([^\]]+)\]/g) ?? [];
  for (const b of bracketed) {
    const id = b.slice(1, -1);
    if (twin.tickets.find((x) => x.id === id)) out.push({ type: "ticket", id });
    else if (twin.orders.find((x) => x.id === id)) out.push({ type: "order", id });
  }
  return out;
}

function mockTwinChat(twin: Customer, message: string): { reply: string; citations: EvidenceRef[] } {
  const traits = twin.traits.map((t) => t.label);
  const m = message.toLowerCase();
  const citations: EvidenceRef[] = [];
  let reply = "";
  if (/(price|discount|expensive|cost|cancel|subscription)/.test(m)) {
    if (traits.includes("price-sensitive") || traits.includes("discount-conditioned")) {
      const t = twin.tickets.find(x=>x.theme === "subscription-cancel" || x.theme === "discount-request");
      if (t) citations.push({ type: "ticket", id: t.id });
      reply = `Honestly, price is the whole thing for me. I cancelled the sub because $68 a month adds up${citations.length ? ` [${citations[0].id}]` : ""}.`;
    } else {
      reply = `Price is fine for what it is — I've bought a few times.`;
    }
  } else if (/(ship|delivery|arrive|late|deliver)/.test(m)) {
    const t = twin.tickets.find(x=>x.theme === "shipping-delay");
    if (t) {
      citations.push({ type: "ticket", id: t.id });
      reply = `Shipping's been rough. Last order was stuck for 9 days [${t.id}]. It made me hesitant to reorder.`;
    } else {
      reply = `Shipping has been fine for me, no issues.`;
    }
  } else if (/(buy again|reorder|come back|return|coming back|would you)/.test(m)) {
    if (twin.orders.length) {
      citations.push({ type: "order", id: twin.orders[0].id });
      reply = `Maybe — depends what they show me. My first order [${twin.orders[0].id}] was ok but nothing pulled me back.`;
    } else {
      reply = `I haven't bought yet, still deciding.`;
    }
  } else {
    if (twin.orders.length) citations.push({ type: "order", id: twin.orders[0].id });
    reply = `Not sure I have much to add there. My history with them is pretty limited${citations.length ? ` [${citations[0].id}]` : ""}.`;
  }
  return { reply, citations };
}

/* ============================================================
   AGENT DRAFT / OPTIMIZE (Epic E — stubs for phase 2)
   ============================================================ */
export function isAnthropicConfigured(): boolean {
  return HAS_KEY;
}
