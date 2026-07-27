import type {
  Campaign,
  CopilotContext,
  Flow,
  FlowNode,
  MessageContent,
  TicketTheme,
} from "./types";
import { getAudienceGroup, getCampaigns, getCustomers } from "./store";

/** Deterministic mock — real LLM plugs in later via generateWithAnthropic. */

let cachedClient: unknown = null;
async function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (cachedClient) return cachedClient;
  const mod = await import("@anthropic-ai/sdk");
  cachedClient = new mod.default({ apiKey: process.env.ANTHROPIC_API_KEY });
  return cachedClient;
}

/** Enriched context used by prompts. */
function contextSummary(ctx: CopilotContext | undefined): string {
  if (!ctx) return "";
  const bits: string[] = [];
  if (ctx.audienceGroupId) {
    const ag = getAudienceGroup(ctx.audienceGroupId);
    if (ag) {
      const size = ag.memberIds.length;
      const customers = getCustomers().filter((c) => ag.memberIds.includes(c.id));
      const rich = customers.filter((c) => c.groundingQuality === "rich").length;
      bits.push(`Audience: ${ag.name} (${size} twins, ${rich} rich profiles). ${ag.description}`);
    }
  }
  if (ctx.ticketThemes?.length) {
    bits.push(`Support themes to weigh: ${ctx.ticketThemes.join(", ")}.`);
  }
  if (ctx.referenceCampaignIds?.length) {
    const refs = getCampaigns().filter((c) => ctx.referenceCampaignIds?.includes(c.id));
    if (refs.length) {
      bits.push(
        "Reference past campaigns:\n" +
          refs
            .map((r) => `  - ${r.name} [${r.tags.join(", ")}]${r.historicalOutcome ? ` — open ${(r.historicalOutcome.openRate * 100).toFixed(0)}%, unsubs ${r.historicalOutcome.unsubs}` : ""}`)
            .join("\n"),
      );
    }
  }
  bits.push(`Channels the marketer wants used: ${describeChannels(ctx.channels)}.`);
  return bits.join("\n");
}

/** Resolve the marketer's channel preference, defaulting to both if not set. */
export function resolvedChannels(ctx: CopilotContext | undefined): Array<"email" | "sms"> {
  const raw = ctx?.channels?.length ? ctx.channels : ["email", "sms"];
  // Preserve the order email → sms for prompt clarity + flow ordering
  const set = new Set(raw);
  const out: Array<"email" | "sms"> = [];
  if (set.has("email")) out.push("email");
  if (set.has("sms")) out.push("sms");
  return out.length ? out : ["email", "sms"];
}

function describeChannels(channels?: Array<"email" | "sms">): string {
  const resolved = resolvedChannels({ channels });
  if (resolved.length === 2) return "email AND SMS (use both)";
  if (resolved[0] === "email") return "email only (do NOT include SMS steps)";
  return "SMS only (do NOT include email steps)";
}

/* ============================================================
   Meta generation — short, descriptive campaign name + goal
   from the marketer's freeform prompt.
   ============================================================ */

export async function generateCampaignMeta(
  prompt: string,
  ctx: CopilotContext,
): Promise<{ name: string; description: string }> {
  const client = await getClient();
  if (client) {
    try {
      const audience = ctx.audienceGroupId ? getAudienceGroup(ctx.audienceGroupId) : null;
      // @ts-expect-error dynamic sdk shape
      const resp = await client.messages.create({
        model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
        max_tokens: 200,
        temperature: 0.3,
        system: `You are naming a lifecycle marketing campaign for the DTC skincare brand Verve & Vine. Return ONLY compact JSON: {"name": "<2-5 words, title case, no quotes>", "description": "<one sentence, ~15 words, plain English, no marketing fluff>"}. The name should be memorable and distinct (e.g. "Winter Winback", "Serum Restock", "Fresh Start Loyalists"). The description should read like an internal goal statement.`,
        messages: [
          {
            role: "user",
            content: `Prompt: ${prompt}\nAudience: ${audience?.name ?? "unspecified"}${audience?.description ? " — " + audience.description : ""}`,
          },
        ],
      });
      const first = resp.content?.[0];
      const text: string = first && "text" in first ? first.text : "";
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed.name && parsed.description) {
          return { name: String(parsed.name).slice(0, 60), description: String(parsed.description).slice(0, 200) };
        }
      }
    } catch { /* fall through to mock */ }
  }
  return mockGenerateMeta(prompt, ctx);
}

function mockGenerateMeta(prompt: string, ctx: CopilotContext): { name: string; description: string } {
  const p = prompt.toLowerCase();
  const audience = ctx.audienceGroupId ? getAudienceGroup(ctx.audienceGroupId) : null;

  let intent: string;
  if (/reactivat|winback|win back|lapsed|come back|return|bring back/.test(p)) intent = "winback";
  else if (/launch|new product|drop|introduc|debut/.test(p)) intent = "launch";
  else if (/discount|% off|promo|sale|save/.test(p)) intent = "promo";
  else if (/welcome|onboard|first order/.test(p)) intent = "welcome";
  else if (/vip|loyal|reward|thank/.test(p)) intent = "loyalty";
  else intent = "engagement";

  const audienceShort = audience?.name
    ? audience.name.toLowerCase().includes("lapsed") ? "Lapsed"
      : audience.name.toLowerCase().includes("vip") ? "VIP"
      : audience.name.toLowerCase().includes("subscription") ? "Sub cancellers"
      : audience.name.toLowerCase().includes("loyal") ? "Full-price loyalists"
      : audience.name
    : "audience";

  const nameByIntent: Record<string, string> = {
    winback: `${audienceShort} winback`,
    launch: "Product launch",
    promo: `${audienceShort} promo`,
    welcome: "Welcome series",
    loyalty: "VIP thank-you",
    engagement: `${audienceShort} nudge`,
  };

  const descByIntent: Record<string, string> = {
    winback: `Bring back ${audience?.name?.toLowerCase() ?? "lapsed customers"} with a value-led message tuned to their history.`,
    launch: `Introduce a new product to ${audience?.name?.toLowerCase() ?? "the target audience"} with a clear reason to try it.`,
    promo: `Push a time-bound offer to ${audience?.name?.toLowerCase() ?? "the target audience"}.`,
    welcome: `Onboard first-time customers and set expectations for the next 30 days.`,
    loyalty: `Reward high-value repeat buyers with a quiet acknowledgement — no promo.`,
    engagement: `Re-engage ${audience?.name?.toLowerCase() ?? "the target audience"} with relevant, low-pressure copy.`,
  };

  const name = titleCase(nameByIntent[intent]);
  const description = descByIntent[intent];
  return { name, description };
}

function titleCase(s: string): string {
  return s.split(" ").map((w) => w.length > 3 ? w[0].toUpperCase() + w.slice(1) : w).join(" ").replace(/^./, (c) => c.toUpperCase());
}

/** Returns which LLM is powering the copilot right now. */
export function currentCopilotEngine(): { mode: "claude" | "mock"; model: string } {
  if (process.env.ANTHROPIC_API_KEY) {
    return { mode: "claude", model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001" };
  }
  return { mode: "mock", model: "deterministic mock" };
}

/* ============================================================
   Chat turn — copilot responds to the marketer
   ============================================================ */

export async function copilotChat(
  campaign: Campaign,
  userMessage: string,
  opts: { forceChat?: boolean } = {},
): Promise<{ reply: string; intent: "chat" | "ready_to_generate" | "modify_and_rerun" }> {
  const history = campaign.copilotHistory ?? [];
  const ctxStr = contextSummary(campaign.copilotContext);
  const trimmed = userMessage.trim();

  // Broad set of phrases that mean "stop asking, start building". Single-word
  // triggers like "go" / "start" / "yes" are matched only when they stand alone
  // to avoid false positives like "yes but change the tone…".
  const singleWordTriggers = /^(go|start|build|draft|generate|create|make it|do it|yes|yep|yeah|sure|ok|okay|sounds good|let'?s go|proceed|run it|ship it)[.!\s]*$/i;
  const readyPhrases =
    /(let'?s (go|start|launch|do it|run it|do this|build|draft)|start (drafting|generating|building)|ready to (go|start|build|generate|launch)|generate (it|the (flow|campaign|draft))|create (it|the (flow|campaign|draft))|draft it|build it|go ahead|make it|run the (sim|rehears)|launch (it|the campaign)|yes[,.]? (start|go|launch|do|build|draft|make it)|sounds good[,.]? (go|start|launch|build)|i'?m ready|(let'?s|we should) (rehears|draft|build|generate))/i;
  const modifyPhrases = /(change|update|make (it|the)|rewrite|shorter|longer|softer|harder|more|less|try|swap|remove|add|tighten|punchier|warmer|colder|urgency|tone)/i;

  // Detect intent from user's message. The forceChat flag is used by
  // /api/copilot/start so the very first response is always a conversational
  // opener (never an immediate "drafting…" acknowledgment), giving the
  // marketer the expected question-and-answer intro.
  let intent: "chat" | "ready_to_generate" | "modify_and_rerun" = "chat";
  if (!opts.forceChat) {
    if (singleWordTriggers.test(trimmed) || readyPhrases.test(userMessage)) {
      intent = "ready_to_generate";
    } else if (campaign.copilotState === "ready" && modifyPhrases.test(userMessage)) {
      intent = "modify_and_rerun";
    }
  }

  const client = await getClient();
  if (client) {
    try {
      const system = `You are the Simulated Audiences campaign copilot for the DTC skincare brand Verve & Vine. You help a marketer scope, draft, and refine an email/SMS campaign that will be rehearsed against a simulated audience of twins.

Absolute rules for every turn:
- Be concise: 1–3 sentences. Ask ONE focused question when it meaningfully sharpens the draft.
- Ground every response in the specific words of the marketer's brief AND the audience/context. Never open with a generic "a couple of quick questions" style dropdown.
- Reference at least one specific detail from what they wrote (a product they mentioned, the incentive stance they took, the audience name, a ticket theme). If they wrote "no discount" — respect that in your question. If they named a product — mention it back.
- Never invent products beyond: Ritual Serum, Bloom Cleanser, Renew Moisturizer, Overnight Repair Mask, Vitamin C Elixir, Petal Toner, Silk SPF 30, Botanical Eye Cream, Wellness Gummies.
- Never quote made-up customer reactions. Never invent metrics.
- If the marketer signals readiness ("let's go", "run it", "generate", "start", "go", "yes"), acknowledge you're about to draft and rehearse — don't ask more questions.
- If a flow already exists and they ask for changes, confirm exactly what you'll change and say you'll re-run the rehearsals.
- Never quote or preview the actual message copy (no subject lines, preheaders, body paragraphs, CTA text, or SMS text) in chat. The marketer sees the copy live in the flow view on the left — describe the change in the abstract only (e.g. "I'll soften the opener and tighten the CTA"), never repeat the words themselves.

Marketer's brief (verbatim, treat as highest-priority context): ${campaign.goal}

Audience & context for this session:
${ctxStr || "(no additional context beyond the brief)"}

Copilot state: ${campaign.copilotState ?? "gathering"}${opts.forceChat ? " — this is the FIRST turn. Reply with a scoping question tailored to their brief. Never say 'drafting now' on this turn." : ""}`;

      const messages = [
        ...history.filter((h) => h.kind !== "iteration_start" && h.kind !== "iteration_result" && h.kind !== "opportunity_applied").map((h) => ({
          role: h.role,
          content: h.content,
        })),
        { role: "user" as const, content: userMessage },
      ];

      // @ts-expect-error dynamic sdk shape
      const resp = await client.messages.create({
        model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
        max_tokens: 250,
        temperature: 0.4,
        system,
        messages,
      });
      const first = resp.content?.[0];
      const text: string = first && "text" in first ? first.text : "";
      return { reply: text || mockReply(campaign, userMessage, intent), intent };
    } catch {
      // fall through to mock
    }
  }
  return { reply: mockReply(campaign, userMessage, intent), intent };
}

function mockReply(campaign: Campaign, userMessage: string, intent: "chat" | "ready_to_generate" | "modify_and_rerun"): string {
  const history = campaign.copilotHistory ?? [];
  const turnCount = history.filter((h) => h.role === "user").length;
  const ctx = campaign.copilotContext;
  const audienceName = ctx?.audienceGroupId ? getAudienceGroup(ctx.audienceGroupId)?.name : "your audience";

  if (intent === "ready_to_generate") {
    return `Got it. I'll draft the flow and rehearse it against ${audienceName} — a few passes to tune the copy. Give me about 30 seconds.`;
  }
  if (intent === "modify_and_rerun") {
    return `Sure — I'll apply that change and re-run the rehearsal. One moment.`;
  }

  // First-turn scoping question — tailored to the actual prompt so replies feel
  // grounded in what the marketer asked for, not a canned dropdown.
  if (turnCount <= 1) {
    return firstTurnScopingQuestion(userMessage, campaign, audienceName ?? "your audience");
  }
  if (turnCount === 2) {
    return `Makes sense. I'm thinking a two-step flow — an opener email, then a 3-day delay followed by an SMS check-in. Ready for me to draft and rehearse, or want to tweak the structure first?`;
  }
  return `Anything else to fold in? Otherwise say the word and I'll draft it up.`;
}

const PRODUCTS = [
  "ritual serum", "bloom cleanser", "renew moisturizer", "overnight repair mask",
  "vitamin c elixir", "petal toner", "silk spf 30", "botanical eye cream",
  "wellness gummies",
];

/** Generates a scoping question tailored to keywords in the marketer's prompt. */
function firstTurnScopingQuestion(prompt: string, campaign: Campaign, audienceName: string): string {
  const p = prompt.toLowerCase();
  const themes = new Set(campaign.copilotContext?.ticketThemes ?? []);
  const refs = campaign.copilotContext?.referenceCampaignIds ?? [];

  // Pull any product mentions out of the brief
  const productMatch = PRODUCTS.find((prod) => p.includes(prod));
  const productHint = productMatch
    ? productMatch.replace(/\b\w/g, (c) => c.toUpperCase())
    : null;

  // Ticket-theme-informed openers take priority
  if (themes.has("subscription-cancel")) {
    return `Understood. You flagged the subscription-cancel theme — do you want to address the price objection head-on, or lead with what's changed since they left?`;
  }
  if (themes.has("shipping-delay")) {
    return `Got it. Shipping-delay tickets are common in this cohort. Should the copy acknowledge that directly ("we know delivery has been rocky"), or steer clear of it entirely?`;
  }
  if (themes.has("damaged-item")) {
    return `Noted the damaged-item theme. Should this open with an apology and a make-good, or focus on new packaging and QC changes?`;
  }
  if (themes.has("discount-request")) {
    return `Since discount-request is in the mix, do you want to lean into a code, or reframe value without one?`;
  }

  // Reference-campaign informed
  if (refs.length) {
    return `Got the brief and the reference campaign${refs.length > 1 ? "s" : ""}. Should I match that voice, or take a different angle for ${audienceName}?`;
  }

  // Intent-based branches
  if (/reactivat|winback|win back|lapsed|come back|return|bring back/.test(p)) {
    if (/no (discount|offer|promo|code)|without .* (discount|offer|promo)|value-led|no code/.test(p)) {
      return `Got it — winback without a discount. Do you want to spotlight one specific update (a product, a policy change), or lead with a broader "here's what we've been up to" tone?`;
    }
    return `Winback for ${audienceName}. Is a small incentive on the table, or purely value-led? And is there one product or update you want to lead with?`;
  }
  if (/launch|new product|drop|debut|introduc/.test(p)) {
    return productHint
      ? `A launch for ${productHint}. Do you want an educational opener (why it exists) or a straight "it's here" reveal?`
      : `A product launch — want an educational opener or a straight reveal? And is there a specific hero product I should focus on?`;
  }
  if (/vip|loyal|reward|thank/.test(p)) {
    return `A loyalty note for ${audienceName}. Should this feel like a quiet thank-you, or open with an exclusive perk?`;
  }
  if (/welcome|onboard|first order/.test(p)) {
    return `A welcome flow. Do you want the opener to focus on product education, brand story, or getting them to their second purchase quickly?`;
  }
  if (/urgency|last chance|flash|ending|24 ?hours|48 ?hours/.test(p)) {
    return `Urgency-driven send. Do you want tone-perfect FOMO or a softer "before it's gone" nudge? SMS quiet hours will still apply.`;
  }
  if (/discount|sale|% off|save/.test(p)) {
    return `A promo. Should I lead with the offer up top, or set up value first and drop the code near the CTA?`;
  }
  if (/education|explain|how to|guide/.test(p)) {
    return `An educational send. Should it read like a short blog post or a punchier tips-list format?`;
  }

  // Generic fallback that at least echoes what they said
  const briefEcho = prompt.split(/[.!?]/)[0]?.trim().slice(0, 100) ?? prompt.slice(0, 100);
  return `Got it: "${briefEcho}${briefEcho.length >= 100 ? "…" : ""}". One quick question — is there a specific product to spotlight, and how promotional should the tone feel?`;
}

/* ============================================================
   Flow generation — first pass draft based on chat history + context
   ============================================================ */

export async function generateInitialFlow(campaign: Campaign): Promise<Flow> {
  const ctx = campaign.copilotContext;
  const audience = ctx?.audienceGroupId ? getAudienceGroup(ctx.audienceGroupId) : null;
  const audienceLabel = audience ? `enters audience: ${audience.name}` : "enters audience";
  const channels = resolvedChannels(ctx);
  const wantsEmail = channels.includes("email");
  const wantsSms = channels.includes("sms");

  // Try Claude first — it writes real copy grounded in the goal + chat history + audience.
  const client = await getClient();
  if (client) {
    try {
      const drafted = await draftFlowWithClaude(campaign);
      if (drafted && (drafted.email || drafted.sms)) {
        return assembleFlowFromDraft(audienceLabel, drafted, wantsEmail, wantsSms);
      }
    } catch { /* fall through to template */ }
  }

  // Mock fallback — pick a flow shape that matches the campaign intent AND channels
  return mockFlowByShape(campaign, audienceLabel);
}

function assembleFlowFromDraft(
  audienceLabel: string,
  drafted: { email?: MessageContent; sms?: MessageContent },
  wantsEmail: boolean,
  wantsSms: boolean,
): Flow {
  // Email-only
  if (wantsEmail && !wantsSms && drafted.email) {
    return {
      rootId: "n1",
      nodes: {
        n1: { id: "n1", type: "trigger", audienceLabel, next: "n2" },
        n2: { id: "n2", type: "message", channel: "email", draftedByAgent: true, content: drafted.email },
      },
    };
  }
  // SMS-only
  if (wantsSms && !wantsEmail && drafted.sms) {
    return {
      rootId: "n1",
      nodes: {
        n1: { id: "n1", type: "trigger", audienceLabel, next: "n2" },
        n2: { id: "n2", type: "message", channel: "sms", draftedByAgent: true, content: drafted.sms },
      },
    };
  }
  // Both
  if (drafted.email && drafted.sms) {
    return {
      rootId: "n1",
      nodes: {
        n1: { id: "n1", type: "trigger", audienceLabel, next: "n2" },
        n2: { id: "n2", type: "message", channel: "email", draftedByAgent: true, content: drafted.email, next: "n3" },
        n3: { id: "n3", type: "delay", amount: 3, unit: "days", next: "n4" },
        n4: { id: "n4", type: "message", channel: "sms", draftedByAgent: true, content: drafted.sms },
      },
    };
  }
  // Partial — take whichever channel we got
  const single = drafted.email
    ? { channel: "email" as const, content: drafted.email }
    : drafted.sms
    ? { channel: "sms" as const, content: drafted.sms }
    : null;
  if (!single) return { rootId: "n1", nodes: { n1: { id: "n1", type: "trigger", audienceLabel } } };
  return {
    rootId: "n1",
    nodes: {
      n1: { id: "n1", type: "trigger", audienceLabel, next: "n2" },
      n2: { id: "n2", type: "message", channel: single.channel, draftedByAgent: true, content: single.content },
    },
  };
}

/** Chooses a flow structure appropriate to the campaign intent + channel selection. */
function mockFlowByShape(campaign: Campaign, audienceLabel: string): Flow {
  const brief = campaignBriefText(campaign).toLowerCase();
  const channels = resolvedChannels(campaign.copilotContext);
  const email = channels.includes("email");
  const sms = channels.includes("sms");

  // Build a linear flow from an ordered list of steps, chaining next pointers.
  const linear = (steps: FlowNode[]): Flow => {
    const nodes: Record<string, FlowNode> = { n1: { id: "n1", type: "trigger", audienceLabel } };
    let prev: FlowNode = nodes.n1;
    for (const s of steps) {
      const withNext = { ...s };
      (prev as { next?: string }).next = withNext.id;
      nodes[withNext.id] = withNext;
      prev = withNext;
    }
    return { rootId: "n1", nodes };
  };

  const emailNode = (id: string, kind: "opener" | "followup" = "opener"): FlowNode => ({
    id, type: "message", channel: "email", draftedByAgent: true, content: draftEmail(campaign, kind),
  });
  const smsNode = (id: string): FlowNode => ({
    id, type: "message", channel: "sms", draftedByAgent: true, content: draftSms(campaign),
  });
  const delay = (id: string, amount: number, unit: "hours" | "days"): FlowNode => ({
    id, type: "delay", amount, unit,
  });

  const isTimeSensitive = /super\s?bowl|black\s?friday|bfcm|cyber\s?monday|flash|24\s?hours|48\s?hours|last chance|ends tonight/.test(brief);
  const isWelcome = /welcome|onboard|first order|new subscriber|new customer/.test(brief);
  const isLoyalty = /loyal|vip|thank[-\s]?you|reward|milestone|anniversary|birthday/.test(brief);
  const isLaunch = /launch|drop|debut|introduc|new product|announcing/.test(brief);

  // Time-sensitive: email + short delay + SMS (drop whichever channel is off)
  if (isTimeSensitive) {
    if (email && sms) return linear([emailNode("n2"), delay("n3", 6, "hours"), smsNode("n4")]);
    if (email) return linear([emailNode("n2"), delay("n3", 12, "hours"), emailNode("n4", "followup")]);
    return linear([smsNode("n2")]);
  }

  // Welcome / onboarding: 3-email drip (fall back to 2 SMS if email off)
  if (isWelcome) {
    if (email) {
      return linear([emailNode("n2"), delay("n3", 2, "days"), emailNode("n4", "followup"), delay("n5", 5, "days"), emailNode("n6", "followup")]);
    }
    return linear([smsNode("n2"), delay("n3", 3, "days"), smsNode("n4")]);
  }

  // Loyalty / thank-you: single message
  if (isLoyalty) {
    if (email) return linear([emailNode("n2")]);
    return linear([smsNode("n2")]);
  }

  // Launch / product drop: announcement email + gap + SMS reminder
  if (isLaunch) {
    if (email && sms) return linear([emailNode("n2"), delay("n3", 4, "days"), emailNode("n4", "followup"), delay("n5", 1, "days"), smsNode("n6")]);
    if (email) return linear([emailNode("n2"), delay("n3", 4, "days"), emailNode("n4", "followup")]);
    return linear([smsNode("n2"), delay("n3", 2, "days"), smsNode("n4")]);
  }

  // Default winback shape: email + 3d + SMS (drop whichever is off)
  if (email && sms) return linear([emailNode("n2"), delay("n3", 3, "days"), smsNode("n4")]);
  if (email) return linear([emailNode("n2"), delay("n3", 4, "days"), emailNode("n4", "followup")]);
  return linear([smsNode("n2")]);
}

async function draftFlowWithClaude(campaign: Campaign): Promise<{ email?: MessageContent; sms?: MessageContent } | null> {
  const client = await getClient();
  if (!client) return null;
  const ctx = campaign.copilotContext;
  const ctxStr = contextSummary(ctx);
  const channels = resolvedChannels(ctx);
  const wantsEmail = channels.includes("email");
  const wantsSms = channels.includes("sms");
  const history = (campaign.copilotHistory ?? [])
    .filter((h) => !h.kind || h.kind === "message")
    .map((h) => `${h.role.toUpperCase()}: ${h.content}`)
    .join("\n");

  // Build the required JSON schema dynamically based on channel selection
  const schemaBits: string[] = [];
  if (wantsEmail) {
    schemaBits.push(`  "email": {
    "subject": "<under 55 chars>",
    "preheader": "<under 90 chars>",
    "body": "<3–4 short paragraphs, use \\\\n\\\\n between paragraphs; may reference {{firstName}}>",
    "ctaText": "<2–4 words>",
    "ctaUrl": "https://verveandvine.example/new"
  }`);
  }
  if (wantsSms) {
    schemaBits.push(`  "sms": {
    "message": "<under 160 chars, include a link and 'Reply STOP to opt out'>",
    "link": "https://verveandvine.example/new"
  }`);
  }

  const system = `You are drafting lifecycle marketing copy for Verve & Vine (DTC skincare). Write in a calm, human, brand-owned voice. Never invent products beyond: Ritual Serum, Bloom Cleanser, Renew Moisturizer, Overnight Repair Mask, Vitamin C Elixir, Petal Toner, Silk SPF 30, Botanical Eye Cream, Wellness Gummies.

Channel constraint: ${describeChannels(ctx?.channels)}.

Return ONLY JSON with these top-level keys:
{
${schemaBits.join(",\n")}
}
${!wantsSms ? "\nDo NOT include an sms key." : ""}${!wantsEmail ? "\nDo NOT include an email key." : ""}`;

  const followupText = wantsEmail && wantsSms
    ? "Draft the opener email and the SMS follow-up (sent 3 days later)."
    : wantsEmail
    ? "Draft the opener email (no SMS)."
    : "Draft the SMS (no email).";

  const user = `Campaign goal: ${campaign.goal}
Context:
${ctxStr}
Chat so far:
${history}

${followupText}`;

  // @ts-expect-error dynamic sdk shape
  const resp = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
    max_tokens: 900,
    temperature: 0.4,
    system,
    messages: [{ role: "user", content: user }],
  });
  const first = resp.content?.[0];
  const text: string = first && "text" in first ? first.text : "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  const parsed = JSON.parse(match[0]);

  const out: { email?: MessageContent; sms?: MessageContent } = {};
  if (wantsEmail && parsed?.email?.subject) {
    out.email = {
      channel: "email",
      email: {
        subject: String(parsed.email.subject),
        preheader: String(parsed.email.preheader ?? ""),
        body: String(parsed.email.body ?? ""),
        ctaText: String(parsed.email.ctaText ?? "See more"),
        ctaUrl: String(parsed.email.ctaUrl ?? "https://verveandvine.example/new"),
      },
    };
  }
  if (wantsSms && parsed?.sms?.message) {
    out.sms = {
      channel: "sms",
      sms: {
        message: String(parsed.sms.message),
        link: parsed.sms.link ? String(parsed.sms.link) : undefined,
      },
    };
  }
  // Need at least one — otherwise fall back to mock
  if (!out.email && !out.sms) return null;
  return out;
}

/**
 * Prompt-aware mock email drafter — extracts keywords from the marketer's
 * brief and chat history so even without an API key the copy references
 * the actual campaign (e.g. "Superbowl", "makeup", specific products).
 */
function draftEmail(campaign: Campaign, kind: "opener" | "followup"): MessageContent {
  const brief = campaignBriefText(campaign);
  const kws = extractKeywords(brief);
  const themes = new Set<TicketTheme>(campaign.copilotContext?.ticketThemes ?? []);
  const softTone = /without .*(discount|offer|promo|code)|no (discount|offer|promo|code)|value.?led|no code/i.test(brief);

  // Occasion / seasonality
  let occasion: string | null = null;
  if (/super\s?bowl/i.test(brief)) occasion = "the Super Bowl";
  else if (/valentine/i.test(brief)) occasion = "Valentine's";
  else if (/black\s?friday|bfcm|cyber\s?monday/i.test(brief)) occasion = "Black Friday";
  else if (/mother'?s day/i.test(brief)) occasion = "Mother's Day";
  else if (/father'?s day/i.test(brief)) occasion = "Father's Day";
  else if (/holiday|christmas|xmas/i.test(brief)) occasion = "the holidays";
  else if (/new year/i.test(brief)) occasion = "the new year";
  else if (/summer/i.test(brief)) occasion = "summer";
  else if (/winter/i.test(brief)) occasion = "winter";
  else if (/spring/i.test(brief)) occasion = "spring";
  else if (/fall|autumn/i.test(brief)) occasion = "fall";

  // Subject line
  let subj: string;
  if (occasion && kws.hero) {
    subj = kind === "opener"
      ? `${capitalize(kws.hero)} for ${occasion}`
      : `Still time — ${kws.hero} for ${occasion}`;
  } else if (occasion) {
    subj = kind === "opener" ? `A little something for ${occasion}` : `Before ${occasion}`;
  } else if (kws.hero) {
    subj = kind === "opener" ? `Meet ${capitalize(kws.hero)}` : `Second look — ${capitalize(kws.hero)}`;
  } else if (softTone) {
    subj = kind === "opener" ? "Something to come back to" : "Still thinking of you";
  } else {
    subj = kind === "opener" ? "A reason to come back" : "Second look?";
  }

  // Preheader
  let preheader: string;
  if (occasion && kws.hero) preheader = `Our ${kws.hero} was made for moments like this.`;
  else if (occasion) preheader = `A moment for what matters — ${occasion}.`;
  else if (softTone) preheader = "No discounts. Just the reason you tried us.";
  else preheader = "A quick update — worth 30 seconds.";

  // Body paragraphs
  const paragraphs: string[] = [];
  paragraphs.push("Hi {{firstName}},");

  if (occasion && kws.hero) {
    paragraphs.push(`${occasion.charAt(0).toUpperCase() + occasion.slice(1)} deserves a routine that shows up. Our ${kws.hero} is the one we reach for when the day matters more than usual.`);
  } else if (occasion) {
    paragraphs.push(`${occasion.charAt(0).toUpperCase() + occasion.slice(1)} is around the corner. We put together a short list of what our team is reaching for right now.`);
  } else if (softTone) {
    paragraphs.push("A lot of skincare brands would send you a discount right now. We'd rather tell you what we've been working on since you last visited.");
  } else {
    paragraphs.push("We wanted to check in — a lot has changed since you last shopped with us.");
  }

  if (kws.hero && !occasion) {
    paragraphs.push(`Our ${kws.hero} has a new formulation — the one that's been getting stopped-in-the-street compliments for our team. If a routine got complicated, we simplified it.`);
  } else if (themes.has("shipping-delay")) {
    paragraphs.push("We also revamped fulfillment — orders now ship in 24 hours from a new coast-to-coast warehouse. If shipping held you back, that's fixed.");
  } else if (themes.has("subscription-cancel")) {
    paragraphs.push("Subscriptions are smarter now — pause anytime, skip a month, or swap products without emailing us. Yours is one click away.");
  } else if (occasion) {
    paragraphs.push("A few things we love, all in one place — no rush, no urgency, just a shortlist you can trust.");
  }

  paragraphs.push(occasion ? `Take a look before ${occasion} arrives.` : "Worth a look.");

  const body = paragraphs.join("\n\n");

  // CTA
  const ctaText = occasion
    ? kind === "opener" ? "Shop the edit" : "See what's still in stock"
    : kws.hero
    ? `Meet ${capitalize(kws.hero)}`
    : "See what's new";

  return {
    channel: "email",
    email: {
      subject: subj,
      preheader,
      body,
      ctaText,
      ctaUrl: "https://verveandvine.example/new",
    },
  };
}

function draftSms(campaign: Campaign): MessageContent {
  const brief = campaignBriefText(campaign);
  const kws = extractKeywords(brief);
  const softTone = /without .*(discount|offer|promo|code)|no (discount|offer|promo|code)|value.?led/i.test(brief);
  const occasion = /super\s?bowl/i.test(brief) ? "Super Bowl"
    : /valentine/i.test(brief) ? "Valentine's"
    : /black\s?friday|bfcm/i.test(brief) ? "Black Friday"
    : /holiday|christmas/i.test(brief) ? "holidays"
    : null;

  let msg: string;
  if (occasion && kws.hero) {
    msg = `Verve & Vine: your ${occasion} edit is live — includes the ${kws.hero}. verveandvine.example/new. Reply STOP to opt out.`;
  } else if (occasion) {
    msg = `Verve & Vine: a small ${occasion} edit from us. verveandvine.example/new. Reply STOP to opt out.`;
  } else if (kws.hero) {
    msg = `Verve & Vine: quick nudge — our ${kws.hero} is back. verveandvine.example/new. Reply STOP to opt out.`;
  } else if (softTone) {
    msg = "Verve & Vine: last check-in — no offer, just the update we mentioned. verveandvine.example/new. Reply STOP to opt out.";
  } else {
    msg = "Verve & Vine: a fresh drop is live. verveandvine.example/new. Reply STOP to opt out.";
  }
  return { channel: "sms", sms: { message: msg, link: "https://verveandvine.example/new" } };
}

/** Concatenates the marketer's brief + user chat turns for keyword extraction. */
function campaignBriefText(campaign: Campaign): string {
  const chatText = (campaign.copilotHistory ?? [])
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n");
  return `${campaign.goal}\n${chatText}`;
}

const PRODUCT_ALIASES: [RegExp, string][] = [
  [/ritual serum/i, "Ritual Serum"],
  [/bloom cleanser/i, "Bloom Cleanser"],
  [/renew moisturizer/i, "Renew Moisturizer"],
  [/overnight repair mask/i, "Overnight Repair Mask"],
  [/vitamin c elixir/i, "Vitamin C Elixir"],
  [/petal toner/i, "Petal Toner"],
  [/silk spf/i, "Silk SPF 30"],
  [/botanical eye cream/i, "Botanical Eye Cream"],
  [/wellness gummies/i, "Wellness Gummies"],
];

const CATEGORY_ALIASES: [RegExp, string][] = [
  [/makeup line|makeup collection|makeup range/i, "makeup line"],
  [/makeup/i, "makeup edit"],
  [/skincare line|skincare collection/i, "skincare line"],
  [/serum/i, "Ritual Serum"],
  [/cleanser/i, "Bloom Cleanser"],
  [/moisturizer/i, "Renew Moisturizer"],
  [/spf|sunscreen/i, "Silk SPF 30"],
  [/mask/i, "Overnight Repair Mask"],
  [/eye cream/i, "Botanical Eye Cream"],
];

function extractKeywords(text: string): { hero: string | null } {
  for (const [rx, name] of PRODUCT_ALIASES) {
    if (rx.test(text)) return { hero: name };
  }
  for (const [rx, name] of CATEGORY_ALIASES) {
    if (rx.test(text)) return { hero: name };
  }
  return { hero: null };
}

function capitalize(s: string): string {
  return s.replace(/^./, (c) => c.toUpperCase());
}

/* ============================================================
   Modification pass — react to a "make it shorter" style ask
   ============================================================ */

export async function modifyFlowForRequest(campaign: Campaign, userInstruction: string): Promise<Flow> {
  const client = await getClient();
  if (client) {
    try {
      const rewritten = await rewriteFlowWithClaude(campaign, userInstruction);
      if (rewritten) return rewritten;
    } catch { /* fall through to mock */ }
  }

  // Mock fallback — rule-based edits so the demo still moves without a key
  const flow: Flow = JSON.parse(JSON.stringify(campaign.flow));
  const lower = userInstruction.toLowerCase();
  const messageNodes = Object.values(flow.nodes).filter((n) => n.type === "message");

  for (const n of messageNodes) {
    if (n.type !== "message") continue;
    if (n.content.channel === "email") {
      if (/shorter|tighten|concise/.test(lower)) {
        n.content.email.body = n.content.email.body
          .split("\n\n").slice(0, 2).join("\n\n");
      }
      if (/(warmer|friendlier|softer)/.test(lower)) {
        n.content.email.subject = "Just wanted to say hi";
      }
      if (/(discount|offer|% off|promo)/.test(lower) && !/no discount/.test(lower)) {
        n.content.email.body += "\n\nUse code WELCOME15 for 15% off your next order.";
        n.content.email.subject = n.content.email.subject.replace(/^./, (c) => c.toUpperCase()) + " — 15% off";
      }
      if (/(remove|drop|no) discount/.test(lower)) {
        n.content.email.body = n.content.email.body.replace(/Use code [^.]+\./g, "").trim();
        n.content.email.subject = n.content.email.subject.replace(/\s*—\s*\d+%\s*off/i, "");
      }
    } else if (n.content.channel === "sms") {
      if (/shorter|tighten|concise/.test(lower)) {
        n.content.sms.message = "Verve & Vine: fresh drop is live. verveandvine.example/new. STOP to opt out.";
      }
      if (/urgency|now|last chance/.test(lower)) {
        n.content.sms.message = "Verve & Vine: last chance — Ritual Serum drop ends tonight. verveandvine.example/new. STOP to opt out.";
      }
    }
  }
  return flow;
}

async function rewriteFlowWithClaude(campaign: Campaign, userInstruction: string): Promise<Flow | null> {
  const client = await getClient();
  if (!client) return null;
  const flow = JSON.parse(JSON.stringify(campaign.flow)) as Flow;

  // Only expose message-node content to Claude — the graph topology stays intact.
  const messageNodes = Object.values(flow.nodes).filter((n) => n.type === "message");
  const currentCopy = messageNodes.map((n) => {
    if (n.type !== "message") return null;
    if (n.content.channel === "email") {
      return { id: n.id, channel: "email", ...n.content.email };
    }
    return { id: n.id, channel: "sms", message: n.content.sms.message, link: n.content.sms.link ?? null };
  }).filter(Boolean);

  const system = `You are the campaign copilot for Verve & Vine (DTC skincare). The marketer just asked you to modify the current flow. Rewrite only what the instruction targets; leave everything else unchanged. Voice: calm, human, brand-owned. Return ONLY JSON matching the shape you were given, updated with the changes:
{
  "messages": [
    { "id": "<node id>", "channel": "email" | "sms",
      "subject"?, "preheader"?, "body"?, "ctaText"?, "ctaUrl"?,   // email fields
      "message"?, "link"?                                          // sms fields
    }
  ]
}`;

  const user = `Instruction: ${userInstruction}
Campaign goal: ${campaign.goal}
Current messages:
${JSON.stringify(currentCopy, null, 2)}`;

  // @ts-expect-error dynamic sdk shape
  const resp = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
    max_tokens: 900,
    temperature: 0.4,
    system,
    messages: [{ role: "user", content: user }],
  });
  const first = resp.content?.[0];
  const text: string = first && "text" in first ? first.text : "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  const parsed = JSON.parse(match[0]);
  if (!parsed?.messages?.length) return null;

  for (const upd of parsed.messages as Array<Record<string, unknown>>) {
    const node = flow.nodes[String(upd.id)];
    if (!node || node.type !== "message") continue;
    if (node.content.channel === "email") {
      const e = node.content.email;
      if (typeof upd.subject === "string") e.subject = upd.subject;
      if (typeof upd.preheader === "string") e.preheader = upd.preheader;
      if (typeof upd.body === "string") e.body = upd.body;
      if (typeof upd.ctaText === "string") e.ctaText = upd.ctaText;
      if (typeof upd.ctaUrl === "string") e.ctaUrl = upd.ctaUrl;
    } else if (node.content.channel === "sms") {
      if (typeof upd.message === "string") node.content.sms.message = upd.message;
      if (typeof upd.link === "string") node.content.sms.link = upd.link;
    }
  }
  return flow;
}
