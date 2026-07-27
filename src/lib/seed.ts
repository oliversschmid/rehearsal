import type {
  Customer,
  AudienceGroup,
  HistoricalCampaign,
  Campaign,
  Order,
  Ticket,
  TicketTheme,
  Trait,
  Engagement,
  GroundingQuality,
} from "./types";
import { DEFAULT_SCHEDULE } from "./types";

/** Deterministic mulberry32 PRNG so seed data is stable across runs. */
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}
function pickN<T>(rng: () => number, arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length; i++) {
    const idx = Math.floor(rng() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString();
}

const FIRST_NAMES = [
  "Maya","Jordan","Ava","Liam","Sofia","Noah","Emma","Ethan","Olivia","Aiden",
  "Mia","Lucas","Zoe","Isaac","Isla","Leo","Nora","Owen","Elena","Kai",
  "Harper","Mateo","Ruby","Miles","Amelia","Wren","Riley","Sage","Iris","June",
  "Theo","Nina","Ellis","Rosa","Kian","Selah","Cyrus","Priya","Ines","Anya",
  "Marisol","Devon","Aisha","Simone","Rina","Tomas","Yuki","Ines","Amara","Kofi",
];
const LAST_INITIALS = ["A","B","C","D","F","G","H","J","K","L","M","N","P","R","S","T","V","W","Y","Z"];

const PRODUCTS = [
  { name: "Ritual Serum 30ml", price: 68 },
  { name: "Bloom Cleanser", price: 32 },
  { name: "Renew Moisturizer", price: 54 },
  { name: "Overnight Repair Mask", price: 48 },
  { name: "Vitamin C Elixir", price: 72 },
  { name: "Petal Toner", price: 28 },
  { name: "Silk SPF 30", price: 44 },
  { name: "Botanical Eye Cream", price: 58 },
  { name: "Refill: Serum 100ml", price: 148 },
  { name: "Wellness Gummies (30ct)", price: 34 },
];

const TICKET_TEMPLATES: Record<TicketTheme, { subject: string; excerpts: string[] }> = {
  "shipping-delay": {
    subject: "Where is my order?",
    excerpts: [
      "Hey, my order's been stuck in 'shipped' for 9 days now. Any update? Kind of frustrated tbh.",
      "This is my third order and the shipping is always so slow. Considering going back to Sephora.",
      "Tracking hasn't moved since Tuesday and I need this before the weekend. Please help.",
      "Hi — the box arrived but two of the items were missing. Frustrating.",
    ],
  },
  "shade-mismatch": {
    subject: "Wrong shade?",
    excerpts: [
      "The tinted moisturizer looks nothing like the swatch on your site. Way too orange.",
      "I ordered 'Rose' and got something that reads pink under any light. Can I exchange?",
    ],
  },
  "subscription-cancel": {
    subject: "Cancel my subscription",
    excerpts: [
      "Please cancel — the price keeps going up and I can find the same ingredients cheaper elsewhere.",
      "I love the product but $68 every month is more than I can commit to right now. Cancel please.",
      "Cancel. I don't need this arriving every 30 days, I still have two unopened bottles.",
    ],
  },
  "ingredient-question": {
    subject: "Ingredient question",
    excerpts: [
      "Is the Renew moisturizer fragrance-free? I'm pregnant and being careful. Site is unclear.",
      "Does the serum have retinol? I'm on tretinoin from my derm and don't want to double up.",
    ],
  },
  "damaged-item": {
    subject: "Bottle broken on arrival",
    excerpts: [
      "The serum bottle arrived cracked and there's product all over the box. Really disappointed.",
      "Pump on the moisturizer was jammed — couldn't even open it. Second time this has happened.",
    ],
  },
  "discount-request": {
    subject: "Any discount codes?",
    excerpts: [
      "Are there any active codes? I was about to check out and saw the total. A bit steep.",
      "First-time buyer here — is there a welcome discount I'm missing?",
    ],
  },
};

const TRAIT_LIBRARY = [
  "discount-conditioned",
  "full-price repeat buyer",
  "shipping-sensitive",
  "ingredient-conscious",
  "one-time gift buyer",
  "subscription canceller",
  "VIP",
  "fatigued",
  "brand loyal",
  "price-sensitive",
];

type Archetype =
  | "vip_full_price"
  | "gift_one_time"
  | "discount_conditioned"
  | "sub_canceller_price"
  | "loyal_shipping_complaint"
  | "lapsed_first_timer"
  | "engaged_low_purchase"
  | "cold";

function assignArchetype(i: number, total: number): Archetype {
  // Distribute recognizable archetypes; rest fall into a background mix.
  if (i < 8) return "vip_full_price";
  if (i < 16) return "loyal_shipping_complaint";
  if (i < 26) return "sub_canceller_price";
  if (i < 40) return "discount_conditioned";
  if (i < 52) return "gift_one_time";
  if (i < 90) return "lapsed_first_timer";
  if (i < 120) return "engaged_low_purchase";
  return "cold";
}

function groundingForArchetype(a: Archetype): GroundingQuality {
  switch (a) {
    case "vip_full_price":
    case "loyal_shipping_complaint":
    case "sub_canceller_price":
      return "rich";
    case "discount_conditioned":
    case "gift_one_time":
    case "lapsed_first_timer":
      return "medium";
    default:
      return "thin";
  }
}

function makeOrder(rng: () => number, idx: number, cid: string, daysBack: number, opts: { discount?: boolean; big?: boolean }): Order {
  const nItems = opts.big ? 3 + Math.floor(rng() * 2) : 1 + Math.floor(rng() * 2);
  const items = pickN(rng, PRODUCTS, nItems).map((p) => ({ name: p.name, price: p.price }));
  const subtotal = items.reduce((s, it) => s + it.price, 0);
  const discountCode = opts.discount ? pick(rng, ["WELCOME15", "SPRING20", "FRIEND10"]) : undefined;
  const total = Math.round((discountCode ? subtotal * 0.85 : subtotal) * 100) / 100;
  return {
    id: `${cid}-o${idx}`,
    date: daysAgo(daysBack),
    items,
    total,
    discountCode,
  };
}

function makeTicket(rng: () => number, idx: number, cid: string, theme: TicketTheme, daysBack: number): Ticket {
  const tpl = TICKET_TEMPLATES[theme];
  return {
    id: `${cid}-t${idx}`,
    date: daysAgo(daysBack),
    theme,
    subject: tpl.subject,
    excerpt: pick(rng, tpl.excerpts),
    resolved: rng() > 0.3,
  };
}

function buildCustomer(rng: () => number, i: number): Customer {
  const cid = `c${String(i).padStart(3, "0")}`;
  const arch = assignArchetype(i, 150);
  const grounding = groundingForArchetype(arch);
  const firstName = FIRST_NAMES[i % FIRST_NAMES.length];
  const lastInitial = pick(rng, LAST_INITIALS);
  const createdAt = daysAgo(90 + Math.floor(rng() * 500));

  const orders: Order[] = [];
  const tickets: Ticket[] = [];
  let engagement: Engagement;
  const traits: Trait[] = [];

  const addTrait = (label: string, evidence: Trait["evidence"]) => traits.push({ label, evidence });

  switch (arch) {
    case "vip_full_price": {
      const n = 5 + Math.floor(rng() * 4);
      for (let k = 0; k < n; k++) {
        orders.push(makeOrder(rng, k, cid, 8 + k * 25, { big: rng() > 0.5 }));
      }
      engagement = {
        opensLast90d: 18 + Math.floor(rng() * 10),
        clicksLast90d: 6 + Math.floor(rng() * 5),
        lastOpenDaysAgo: 1 + Math.floor(rng() * 5),
        unsubRisk: "low",
        smsOptedIn: rng() > 0.3,
        smsClicksLast90d: 2 + Math.floor(rng() * 4),
        smsOptOutRisk: "low",
      };
      addTrait("VIP", orders.slice(0, 2).map((o) => ({ type: "order", id: o.id } as const)));
      addTrait("full-price repeat buyer", orders.slice(0, 2).map((o) => ({ type: "order", id: o.id } as const)));
      break;
    }
    case "loyal_shipping_complaint": {
      const n = 3 + Math.floor(rng() * 2);
      for (let k = 0; k < n; k++) orders.push(makeOrder(rng, k, cid, 12 + k * 40, {}));
      const t = makeTicket(rng, 0, cid, "shipping-delay", 20 + Math.floor(rng() * 30));
      tickets.push(t);
      if (rng() > 0.5) tickets.push(makeTicket(rng, 1, cid, "shipping-delay", 80 + Math.floor(rng() * 30)));
      engagement = {
        opensLast90d: 10 + Math.floor(rng() * 6),
        clicksLast90d: 3 + Math.floor(rng() * 3),
        lastOpenDaysAgo: 3 + Math.floor(rng() * 8),
        unsubRisk: "low",
        smsOptedIn: rng() > 0.4,
        smsClicksLast90d: 1 + Math.floor(rng() * 2),
        smsOptOutRisk: "low",
      };
      addTrait("brand loyal", orders.slice(0, 2).map((o) => ({ type: "order", id: o.id } as const)));
      addTrait("shipping-sensitive", tickets.map((tk) => ({ type: "ticket", id: tk.id } as const)));
      break;
    }
    case "sub_canceller_price": {
      const n = 2 + Math.floor(rng() * 2);
      for (let k = 0; k < n; k++) orders.push(makeOrder(rng, k, cid, 60 + k * 35, {}));
      const t = makeTicket(rng, 0, cid, "subscription-cancel", 30 + Math.floor(rng() * 20));
      tickets.push(t);
      if (rng() > 0.6) tickets.push(makeTicket(rng, 1, cid, "discount-request", 45 + Math.floor(rng() * 15)));
      engagement = {
        opensLast90d: 4 + Math.floor(rng() * 4),
        clicksLast90d: 1 + Math.floor(rng() * 2),
        lastOpenDaysAgo: 12 + Math.floor(rng() * 20),
        unsubRisk: rng() > 0.5 ? "high" : "med",
        smsOptedIn: rng() > 0.7,
        smsClicksLast90d: 0,
        smsOptOutRisk: "med",
      };
      addTrait("subscription canceller", tickets.map((tk) => ({ type: "ticket", id: tk.id } as const)));
      addTrait("price-sensitive", tickets.map((tk) => ({ type: "ticket", id: tk.id } as const)));
      break;
    }
    case "discount_conditioned": {
      const n = 2 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) orders.push(makeOrder(rng, k, cid, 20 + k * 40, { discount: true }));
      if (rng() > 0.5) tickets.push(makeTicket(rng, 0, cid, "discount-request", 15 + Math.floor(rng() * 30)));
      engagement = {
        opensLast90d: 8 + Math.floor(rng() * 6),
        clicksLast90d: 2 + Math.floor(rng() * 3),
        lastOpenDaysAgo: 4 + Math.floor(rng() * 10),
        unsubRisk: "med",
        smsOptedIn: rng() > 0.4,
        smsClicksLast90d: 1 + Math.floor(rng() * 2),
        smsOptOutRisk: "low",
      };
      addTrait("discount-conditioned", orders.slice(0, 2).map((o) => ({ type: "order", id: o.id } as const)));
      break;
    }
    case "gift_one_time": {
      orders.push(makeOrder(rng, 0, cid, 60 + Math.floor(rng() * 60), { big: true, discount: rng() > 0.5 }));
      engagement = {
        opensLast90d: 3 + Math.floor(rng() * 3),
        clicksLast90d: 0 + Math.floor(rng() * 2),
        lastOpenDaysAgo: 30 + Math.floor(rng() * 30),
        unsubRisk: "med",
        smsOptedIn: rng() > 0.7,
        smsClicksLast90d: 0,
        smsOptOutRisk: "med",
      };
      addTrait("one-time gift buyer", [{ type: "order", id: orders[0].id }]);
      break;
    }
    case "lapsed_first_timer": {
      orders.push(makeOrder(rng, 0, cid, 80 + Math.floor(rng() * 100), { discount: rng() > 0.4 }));
      if (rng() > 0.7) tickets.push(makeTicket(rng, 0, cid, pick(rng, ["ingredient-question", "shade-mismatch"] as TicketTheme[]), 70 + Math.floor(rng() * 60)));
      engagement = {
        opensLast90d: 2 + Math.floor(rng() * 4),
        clicksLast90d: 0 + Math.floor(rng() * 1),
        lastOpenDaysAgo: 20 + Math.floor(rng() * 40),
        unsubRisk: "low",
        smsOptedIn: rng() > 0.5,
        smsClicksLast90d: 0,
        smsOptOutRisk: "low",
      };
      addTrait("lapsed first-timer", [{ type: "order", id: orders[0].id }]);
      break;
    }
    case "engaged_low_purchase": {
      if (rng() > 0.4) orders.push(makeOrder(rng, 0, cid, 40 + Math.floor(rng() * 40), {}));
      engagement = {
        opensLast90d: 12 + Math.floor(rng() * 8),
        clicksLast90d: 2 + Math.floor(rng() * 3),
        lastOpenDaysAgo: 2 + Math.floor(rng() * 5),
        unsubRisk: "low",
        smsOptedIn: rng() > 0.5,
        smsClicksLast90d: 1,
        smsOptOutRisk: "low",
      };
      break;
    }
    default: {
      engagement = {
        opensLast90d: 0 + Math.floor(rng() * 2),
        clicksLast90d: 0,
        lastOpenDaysAgo: 60 + Math.floor(rng() * 40),
        unsubRisk: "low",
        smsOptedIn: false,
        smsClicksLast90d: 0,
        smsOptOutRisk: "low",
      };
    }
  }

  if (engagement.opensLast90d > 15 && engagement.clicksLast90d > 4) {
    if (!traits.some((t) => t.label === "engaged"))
      traits.push({ label: "engaged", evidence: [] });
  }
  if (engagement.lastOpenDaysAgo > 45) {
    traits.push({ label: "fatigued", evidence: [] });
  }

  return {
    id: cid,
    firstName,
    lastInitial,
    createdAt,
    orders,
    tickets,
    engagement,
    traits,
    groundingQuality: grounding,
  };
}

export function generateCustomers(): Customer[] {
  const rng = makeRng(0xa5a5c001);
  const out: Customer[] = [];
  for (let i = 0; i < 150; i++) out.push(buildCustomer(rng, i));
  return out;
}

export function generateAudienceGroups(customers: Customer[]): AudienceGroup[] {
  const byArch = (predicate: (c: Customer) => boolean, cap: number) =>
    customers.filter(predicate).slice(0, cap).map((c) => c.id);

  const lapsed = byArch(
    (c) => c.orders.length === 1 && c.engagement.lastOpenDaysAgo > 15,
    38,
  );
  const vip = byArch(
    (c) => c.traits.some((t) => t.label === "VIP"),
    22,
  );
  const cancellers = byArch(
    (c) => c.traits.some((t) => t.label === "subscription canceller"),
    18,
  );
  const loyalists = byArch(
    (c) => c.traits.some((t) => t.label === "full-price repeat buyer" || t.label === "brand loyal"),
    25,
  );
  const shippingSensitive = byArch(
    (c) => c.traits.some((t) => t.label === "shipping-sensitive"),
    16,
  );
  const discountConditioned = byArch(
    (c) => c.traits.some((t) => t.label === "discount-conditioned"),
    22,
  );
  const oneTimeGift = byArch(
    (c) => c.traits.some((t) => t.label === "one-time gift buyer"),
    16,
  );
  const highEngaged = byArch(
    (c) => c.engagement.opensLast90d > 15 && c.engagement.lastOpenDaysAgo < 7,
    30,
  );
  const smsEngaged = byArch(
    (c) => c.engagement.smsOptedIn && c.engagement.smsClicksLast90d > 1,
    28,
  );
  const cold = byArch(
    (c) => c.engagement.lastOpenDaysAgo > 45 && c.engagement.opensLast90d < 3,
    35,
  );

  return [
    {
      id: "ag-lapsed-first",
      name: "Lapsed first-timers",
      description: "Customers who purchased once and haven't returned in 90+ days.",
      memberIds: lapsed,
      source: "seeded",
    },
    {
      id: "ag-vip",
      name: "VIP repeat buyers",
      description: "High-value customers with 5+ orders at full price.",
      memberIds: vip,
      source: "seeded",
    },
    {
      id: "ag-sub-cancellers",
      name: "Subscription cancellers",
      description: "Customers who cancelled subscriptions, often citing price.",
      memberIds: cancellers,
      source: "seeded",
    },
    {
      id: "ag-loyalists",
      name: "Full-price loyalists",
      description: "Repeat buyers who consistently pay full price.",
      memberIds: loyalists,
      source: "seeded",
    },
    {
      id: "ag-shipping-sensitive",
      name: "Shipping-complaint returners",
      description: "Customers who flagged shipping issues but stayed on the list.",
      memberIds: shippingSensitive,
      source: "seeded",
    },
    {
      id: "ag-discount-conditioned",
      name: "Discount-conditioned buyers",
      description: "Only convert when a discount is present. Sensitive to pricing signals.",
      memberIds: discountConditioned,
      source: "seeded",
    },
    {
      id: "ag-gift-buyers",
      name: "One-time gift buyers",
      description: "Bought once as a gift, no repeat purchase behavior yet.",
      memberIds: oneTimeGift,
      source: "seeded",
    },
    {
      id: "ag-highly-engaged",
      name: "Highly engaged readers",
      description: "Opens and clicks consistently — regardless of purchase frequency.",
      memberIds: highEngaged,
      source: "seeded",
    },
    {
      id: "ag-sms-engaged",
      name: "SMS-engaged customers",
      description: "Opted in to SMS and actively click links from texts.",
      memberIds: smsEngaged,
      source: "seeded",
    },
    {
      id: "ag-cold-list",
      name: "Cold subscribers",
      description: "On the list but haven't opened anything in 45+ days.",
      memberIds: cold,
      source: "seeded",
    },
  ];
}

export function generateHistoricalCampaigns(groups: AudienceGroup[]): HistoricalCampaign[] {
  const specs: Array<
    Omit<HistoricalCampaign, "id" | "sentAt" | "audienceGroupId"> & { audienceId: string }
  > = [
    { name: "Winter Winback '25", tags: ["winback"], performanceIndex: 62, outcome: { openRate: 0.28, clickRate: 0.041, unsubs: 6 }, audienceId: "ag-lapsed-first" },
    { name: "New Year, New Skin", tags: ["launch", "newsletter"], performanceIndex: 78, outcome: { openRate: 0.34, clickRate: 0.068, unsubs: 4 }, audienceId: "ag-loyalists" },
    { name: "Valentine's Gift Guide", tags: ["promo", "newsletter"], performanceIndex: 71, outcome: { openRate: 0.32, clickRate: 0.055, unsubs: 5 }, audienceId: "ag-vip" },
    { name: "Serum Restock", tags: ["newsletter"], performanceIndex: 55, outcome: { openRate: 0.25, clickRate: 0.03, unsubs: 3 }, audienceId: "ag-loyalists" },
    { name: "Save your subscription 20%", tags: ["winback", "promo"], performanceIndex: 44, outcome: { openRate: 0.21, clickRate: 0.024, unsubs: 12 }, audienceId: "ag-sub-cancellers" },
    { name: "Spring Refresh Preview", tags: ["launch"], performanceIndex: 83, outcome: { openRate: 0.39, clickRate: 0.082, unsubs: 3 }, audienceId: "ag-vip" },
    { name: "Weekly digest #12", tags: ["newsletter"], performanceIndex: 48, outcome: { openRate: 0.23, clickRate: 0.028, unsubs: 4 }, audienceId: "ag-loyalists" },
    { name: "Bloom Cleanser launch", tags: ["launch"], performanceIndex: 88, outcome: { openRate: 0.41, clickRate: 0.091, unsubs: 2 }, audienceId: "ag-vip" },
    { name: "Come back — 15% off", tags: ["winback", "promo"], performanceIndex: 58, outcome: { openRate: 0.27, clickRate: 0.038, unsubs: 8 }, audienceId: "ag-lapsed-first" },
    { name: "Sunscreen season", tags: ["newsletter", "launch"], performanceIndex: 66, outcome: { openRate: 0.30, clickRate: 0.049, unsubs: 4 }, audienceId: "ag-loyalists" },
    { name: "Members-only preview", tags: ["newsletter"], performanceIndex: 75, outcome: { openRate: 0.35, clickRate: 0.062, unsubs: 3 }, audienceId: "ag-vip" },
    { name: "Reactivation — last shot", tags: ["winback"], performanceIndex: 39, outcome: { openRate: 0.18, clickRate: 0.019, unsubs: 15 }, audienceId: "ag-lapsed-first" },
  ];
  return specs.map((s, i) => ({
    id: `hc${i + 1}`,
    name: s.name,
    tags: s.tags,
    sentAt: daysAgo(15 + i * 8),
    audienceGroupId: s.audienceId,
    performanceIndex: s.performanceIndex,
    outcome: s.outcome,
  }));
}

export function generateSeedDraftCampaign(): Campaign {
  const now = new Date().toISOString();
  return {
    id: "spring-winback",
    name: "Spring Winback",
    goal: "Reactivate customers who lapsed after their first purchase, without leaning on a discount. Speak to the reason they tried us in the first place.",
    audienceGroupId: "ag-lapsed-first",
    tags: ["winback"],
    status: "draft",
    schedule: { ...DEFAULT_SCHEDULE },
    flow: {
      rootId: "n1",
      nodes: {
        n1: { id: "n1", type: "trigger", audienceLabel: "enters audience: Lapsed first-timers", next: "n2" },
        n2: {
          id: "n2",
          type: "message",
          channel: "email",
          content: {
            channel: "email",
            email: {
              subject: "Something to come back to",
              preheader: "No discounts. Just the reason you tried us.",
              body: `Hi {{firstName}},\n\nA lot of skincare brands would send you a discount right now. We'd rather tell you what we've been working on since you last visited.\n\nOur Ritual Serum has a new formulation — the one that's been getting stopped-in-the-street compliments for our team. If you left because a routine got complicated, we simplified it. If you left because life got busy, we get it.\n\nWorth a look.`,
              ctaText: "See what's new",
              ctaUrl: "https://verveandvine.example/new",
            },
          },
          next: "n3",
        },
        n3: { id: "n3", type: "delay", amount: 3, unit: "days", next: "n4" },
        n4: {
          id: "n4",
          type: "message",
          channel: "sms",
          content: {
            channel: "sms",
            sms: {
              message:
                "Verve & Vine: last check-in — we saved you a spot on our Ritual Serum waitlist. Peek: verveandvine.example/new. Reply STOP to opt out.",
              link: "https://verveandvine.example/new",
            },
          },
        },
      },
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function historicalToCampaigns(historical: HistoricalCampaign[]): Campaign[] {
  return historical.map((h) => ({
    id: h.id,
    name: h.name,
    goal: `Historical campaign — ${h.tags.join(", ")}`,
    audienceGroupId: h.audienceGroupId,
    tags: h.tags,
    status: "sent" as const,
    flow: {
      rootId: "n1",
      nodes: {
        n1: { id: "n1", type: "trigger", audienceLabel: "historical send" },
      },
    },
    createdAt: h.sentAt,
    updatedAt: h.sentAt,
    sentAt: h.sentAt,
    historicalOutcome: h.outcome,
  }));
}
