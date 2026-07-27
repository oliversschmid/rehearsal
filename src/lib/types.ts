export type Channel = "email" | "sms";

export type TicketTheme =
  | "shipping-delay"
  | "shade-mismatch"
  | "subscription-cancel"
  | "ingredient-question"
  | "damaged-item"
  | "discount-request";

export type GroundingQuality = "rich" | "medium" | "thin";
export type UnsubRisk = "low" | "med" | "high";

export type EvidenceRef =
  | { type: "ticket"; id: string }
  | { type: "order"; id: string }
  | { type: "engagement"; id: string };

export type Trait = { label: string; evidence: EvidenceRef[] };

export type Order = {
  id: string;
  date: string;
  items: { name: string; price: number }[];
  total: number;
  discountCode?: string;
};

export type Ticket = {
  id: string;
  date: string;
  theme: TicketTheme;
  subject: string;
  excerpt: string;
  resolved: boolean;
};

export type Engagement = {
  opensLast90d: number;
  clicksLast90d: number;
  lastOpenDaysAgo: number;
  unsubRisk: UnsubRisk;
  smsOptedIn: boolean;
  smsClicksLast90d: number;
  smsOptOutRisk: UnsubRisk;
};

export type Customer = {
  id: string;
  firstName: string;
  lastInitial: string;
  createdAt: string;
  orders: Order[];
  tickets: Ticket[];
  engagement: Engagement;
  traits: Trait[];
  groundingQuality: GroundingQuality;
};

export type AudienceGroup = {
  id: string;
  name: string;
  description: string;
  memberIds: string[];
  source: "seeded" | "description" | "support-signal";
};

export type CampaignTag =
  | "newsletter"
  | "winback"
  | "launch"
  | "promo"
  | "loyalty"
  | "onboarding"
  | "announcement"
  | "educational"
  | "restock"
  | "seasonal"
  | "referral"
  | "milestone";

/** Marketer-facing capitalized labels for tags — always render tags through this map. */
export const TAG_LABEL: Record<CampaignTag, string> = {
  newsletter: "Newsletter",
  winback: "Winback",
  launch: "Launch",
  promo: "Promo",
  loyalty: "Loyalty",
  onboarding: "Onboarding",
  announcement: "Announcement",
  educational: "Educational",
  restock: "Restock",
  seasonal: "Seasonal",
  referral: "Referral",
  milestone: "Milestone",
};

export const ALL_CAMPAIGN_TAGS: CampaignTag[] = [
  "newsletter", "winback", "launch", "promo",
  "loyalty", "onboarding", "announcement", "educational",
  "restock", "seasonal", "referral", "milestone",
];

export type HistoricalCampaign = {
  id: string;
  name: string;
  tags: CampaignTag[];
  sentAt: string;
  audienceGroupId: string;
  performanceIndex: number;
  outcome: { openRate: number; clickRate: number; unsubs: number };
};

export type EmailContent = {
  subject: string;
  preheader: string;
  body: string;
  ctaText: string;
  ctaUrl: string;
};

export type SmsContent = {
  message: string;
  link?: string;
};

export type MessageContent =
  | { channel: "email"; email: EmailContent }
  | { channel: "sms"; sms: SmsContent };

export type FlowNode =
  | { id: string; type: "trigger"; audienceLabel: string; next?: string }
  | { id: string; type: "delay"; amount: number; unit: "hours" | "days"; next?: string }
  | {
      id: string;
      type: "message";
      channel: Channel;
      content: MessageContent;
      draftedByAgent?: boolean;
      next?: string;
    }
  | {
      id: string;
      type: "split";
      condition: "opened_previous" | "clicked_previous";
      yesNext?: string;
      noNext?: string;
    };

export type Flow = {
  rootId: string;
  nodes: Record<string, FlowNode>;
};

export type CampaignStatus =
  | "draft"
  | "rehearsed"
  | "send-ready"
  | "active"    // currently sending / running
  | "paused"    // was active, halted temporarily
  | "sent"      // legacy alias for completed (historical seed data uses this)
  | "completed" // finished sending, has outcome data
  | "archived"; // hidden from main list

export type AppliedOpportunity = {
  opportunityId: string;
  appliedAt: string;
  scoreBefore: number;
  scoreAfter?: number;
};

export type Suppression = {
  customerId: string;
  reason: "fatigue" | "predicted_unsub" | "spam_flag" | "support_conflict";
  detail: string;
  receiptRefs: EvidenceRef[];
};

export type RehearsalHistoryEntry = {
  ranAt: string;
  score: number;
  runId: string;
};

export type ScheduleConfig = {
  timezone: string;                       // IANA tz, e.g. "America/Los_Angeles"
  startAt?: string;                       // ISO date-time when the campaign should begin (optional; defaults to launch time)
  sendWindow: { startHour: number; endHour: number }; // 0–23 in recipient-local time
  daysOfWeek: number[];                   // 0=Sun … 6=Sat
  frequencyCap: { max: number; per: "day" | "week" | "month" };
  respectSmsQuietHours: boolean;          // enforce 9pm–8am local block for SMS
  sendTimeOptimization: boolean;          // let the engine pick each recipient's best hour
};

export const DEFAULT_SCHEDULE: ScheduleConfig = {
  timezone: "America/Los_Angeles",
  sendWindow: { startHour: 9, endHour: 18 },
  daysOfWeek: [1, 2, 3, 4, 5],
  frequencyCap: { max: 3, per: "week" },
  respectSmsQuietHours: true,
  sendTimeOptimization: false,
};

export type CopilotMessageKind =
  | "message"           // regular chat turn
  | "iteration_start"   // "Rehearsing…" tick at the start of an iteration
  | "iteration_result"  // "Iteration N: 71 — driver…"
  | "opportunity_applied" // "Applying: rewrote subject line"
  | "final";            // "Landed at 78 after 3 iterations"

export type CopilotMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  kind?: CopilotMessageKind;
  iteration?: number;
  score?: number;
  createdAt: string;
};

export type CopilotContext = {
  audienceGroupId?: string;
  ticketThemes?: TicketTheme[];
  referenceCampaignIds?: string[];
  channels?: Channel[]; // "email" and/or "sms" — defaults to both if omitted
};

export type CopilotState =
  | "gathering"     // just started; copilot asking questions
  | "generating"    // producing the flow + first rehearsal loop
  | "iterating"     // running through opportunity-apply loop
  | "ready";        // flow visible, awaiting next chat instruction

export type CopilotIteration = {
  iteration: number;                // 1, 2, 3
  score: number;                    // 0–100
  driver: string;                   // short driver sentence for this pass
  flow: Flow;                       // full flow snapshot as of this iteration
  appliedOppTitle?: string;         // title of the opp that produced this snapshot (iterations 2+)
  createdAt: string;
};

export type Campaign = {
  id: string;
  name: string;
  goal: string;
  audienceGroupId: string;
  tags: CampaignTag[];
  status: CampaignStatus;
  flow: Flow;
  schedule?: ScheduleConfig;
  exclusions?: string[];
  appliedOpportunities?: AppliedOpportunity[];
  lastScore?: number;
  rehearsalHistory?: RehearsalHistoryEntry[];
  createdAt: string;
  updatedAt: string;
  // Copilot fields
  copilotMode?: boolean;
  copilotState?: CopilotState;
  copilotContext?: CopilotContext;
  copilotHistory?: CopilotMessage[];
  copilotIterations?: CopilotIteration[]; // snapshots after each rehearsal pass
  copilotSelectedIteration?: number;       // which iteration the marketer chose to keep (default: last)
  // For historical (sent) campaigns:
  sentAt?: string;
  historicalOutcome?: { openRate: number; clickRate: number; unsubs: number };
};

export type TwinAction =
  | "open_click"
  | "open_ignore"
  | "ignore"
  | "unsubscribe"
  | "spam";

export type TwinResponse = {
  twinId: string;
  messageNodeId: string;
  action: TwinAction;
  reaction: string;
  groundedIn: EvidenceRef[];
};

export type OpportunityType = "copy" | "subject" | "timing" | "exclusion" | "tone";

export type Opportunity = {
  id: string;
  type: OpportunityType;
  target: {
    nodeId: string;
    field?: "subject" | "preheader" | "body" | "ctaText" | "message" | "delayAmount";
    customerIds?: string[];
  };
  change: string;
  why: string;
  impactRange: [number, number];
  title: string;
  applied?: boolean;
  didImprove?: boolean;
};

export type RiskFlag = {
  id: string;
  severity: "low" | "med" | "high";
  label: string;
  explanation: string;
  affectedTwinIds: string[];
  suggestedFix?: string;
};

export type ScoreBand = {
  band: "exceptional" | "strong" | "middle" | "weak" | "dont_send" | "provisional";
  label: string;
};

export type Verdict = {
  score: number;
  provisional: boolean;
  band: ScoreBand;
  driver: string;
  recommendation: "ship" | "improve" | "dont_send";
  referenceCount: number;
};

export type RehearsalDistribution = {
  open_click: number;
  open_ignore: number;
  ignore: number;
  unsubscribe: number;
  spam: number;
};

export type RehearsalResult = {
  runId: string;
  campaignId: string;
  ranAt: string;
  verdict: Verdict;
  responses: TwinResponse[];
  opportunities: Opportunity[];
  suppressions: Suppression[];
  riskFlags: RiskFlag[];
  segmentMatrix: SegmentMatrixCell[];
  objections: ObjectionDigestItem[];
  /** Per-action counts for the run — added on -1 routes for the response strip. */
  distribution?: RehearsalDistribution;
  /** Human-readable list of what changed since the previous run for this campaign. */
  diffSummary?: string[];
};

export type SegmentMatrixCell = {
  segmentLabel: string;
  messageNodeId: string;
  strength: number; // 0..1
  twinIds: string[];
};

export type ObjectionDigestItem = {
  label: string;
  echoCount: number;
  sampleTicketIds: string[];
};

export type ScorecardEntry = {
  campaignId: string;
  campaignName: string;
  predictedCall: string;
  actualOutcome: string;
  hit: boolean;
};
