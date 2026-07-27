import fs from "fs";
import path from "path";
import type {
  Customer,
  AudienceGroup,
  HistoricalCampaign,
  Campaign,
  RehearsalResult,
  RehearsalDistribution,
  ScorecardEntry,
  FlowNode,
} from "./types";
import {
  generateCustomers,
  generateAudienceGroups,
  generateHistoricalCampaigns,
  generateSeedDraftCampaign,
  historicalToCampaigns,
} from "./seed";

/* ================================================================
   Storage adapter — Vercel Blob in production, filesystem in dev.
   Reads are sync from an in-memory cache populated at module load
   (top-level await). Writes are async — callers must `await` so
   blob writes complete before the serverless function returns.
   ================================================================ */

const USE_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;
const DATA_DIR = path.join(process.cwd(), "data");

const KEYS = [
  "customers",
  "audiences",
  "historical",
  "campaigns",
  "rehearsals",
  "scorecard",
] as const;
type Key = (typeof KEYS)[number];

type Cache = {
  customers: Customer[];
  audiences: AudienceGroup[];
  historical: HistoricalCampaign[];
  campaigns: Campaign[];
  rehearsals: RehearsalResult[];
  scorecard: ScorecardEntry[];
};

const cache: Cache = {
  customers: [],
  audiences: [],
  historical: [],
  campaigns: [],
  rehearsals: [],
  scorecard: [],
};

/* ---------------- fs adapter (dev) ----------------------------- */

function fsReadJson<T>(key: Key, fallback: T): T {
  const p = path.join(DATA_DIR, `${key}.json`);
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return fallback;
  }
}
function fsWriteJson(key: Key, data: unknown) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, `${key}.json`), JSON.stringify(data, null, 2));
}
function fsExists(key: Key): boolean {
  return fs.existsSync(path.join(DATA_DIR, `${key}.json`));
}

/* ---------------- blob adapter (prod) -------------------------- */

async function blobReadJson<T>(key: Key): Promise<T | null> {
  const { list } = await import("@vercel/blob");
  const { blobs } = await list({ prefix: `${key}.json`, limit: 1 });
  const blob = blobs[0];
  if (!blob) return null;
  const res = await fetch(blob.url, { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as T;
}
async function blobWriteJson(key: Key, data: unknown): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(`${key}.json`, JSON.stringify(data, null, 2), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
    allowOverwrite: true,
  });
}

/* ---------------- seed data (used on first-run) ---------------- */

function buildSeed(): Cache {
  const customers = fsReadJson<Customer[] | null>("customers", null) ?? generateCustomers();
  const audiences = fsReadJson<AudienceGroup[] | null>("audiences", null) ?? generateAudienceGroups(customers);
  const historical =
    fsReadJson<HistoricalCampaign[] | null>("historical", null) ?? generateHistoricalCampaigns(audiences);
  const campaigns =
    fsReadJson<Campaign[] | null>("campaigns", null) ?? [
      generateSeedDraftCampaign(),
      ...historicalToCampaigns(historical),
    ];
  const rehearsals = fsReadJson<RehearsalResult[] | null>("rehearsals", null) ?? [];
  const scorecard = fsReadJson<ScorecardEntry[] | null>("scorecard", null) ?? seedScorecard();
  return { customers, audiences, historical, campaigns, rehearsals, scorecard };
}

function seedScorecard(): ScorecardEntry[] {
  return [
    { campaignId: "hc1", campaignName: "Winter Winback '25", predictedCall: "Middle of range", actualOutcome: "28% open — middle", hit: true },
    { campaignId: "hc2", campaignName: "New Year, New Skin", predictedCall: "Strong — ship it", actualOutcome: "34% open — strong", hit: true },
    { campaignId: "hc3", campaignName: "Valentine's Gift Guide", predictedCall: "Strong — ship it", actualOutcome: "32% open — strong", hit: true },
    { campaignId: "hc5", campaignName: "Save your subscription 20%", predictedCall: "Weak — rework", actualOutcome: "12 unsubs — weak", hit: true },
    { campaignId: "hc6", campaignName: "Spring Refresh Preview", predictedCall: "Exceptional", actualOutcome: "39% open — exceptional", hit: true },
    { campaignId: "hc8", campaignName: "Bloom Cleanser launch", predictedCall: "Exceptional", actualOutcome: "41% open — exceptional", hit: true },
    { campaignId: "hc9", campaignName: "Come back — 15% off", predictedCall: "Middle of range", actualOutcome: "27% open — middle", hit: true },
    { campaignId: "hc12", campaignName: "Reactivation — last shot", predictedCall: "Don't send", actualOutcome: "15 unsubs — confirmed", hit: true },
    { campaignId: "hc4", campaignName: "Serum Restock", predictedCall: "Strong — ship it", actualOutcome: "25% open — middle", hit: false },
  ];
}

/* ---------------- init + persist ------------------------------- */

async function loadCache(): Promise<void> {
  const seed = buildSeed();
  if (USE_BLOB) {
    await Promise.all(
      KEYS.map(async (k) => {
        const existing = await blobReadJson(k);
        if (existing !== null) {
          (cache as Record<string, unknown>)[k] = existing;
        } else {
          (cache as Record<string, unknown>)[k] = seed[k];
          await blobWriteJson(k, seed[k]);
        }
      }),
    );
  } else {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    for (const k of KEYS) {
      if (!fsExists(k)) fsWriteJson(k, seed[k]);
      (cache as Record<string, unknown>)[k] = fsReadJson(k, seed[k]);
    }
  }
}

await loadCache();

/**
 * Read a collection. In prod (blob mode), returns the in-memory cache so
 * we don't fetch blobs on every request. In dev (fs mode), re-reads from
 * disk each time to avoid stale-cache issues when Turbopack splits routes
 * into separate module instances — POST-in-one-route + GET-in-another
 * would otherwise see divergent caches.
 */
function read<K extends Key>(key: K): Cache[K] {
  if (!USE_BLOB) {
    return fsReadJson(key, cache[key]) as Cache[K];
  }
  return cache[key];
}

async function persist<K extends Key>(key: K): Promise<void> {
  if (USE_BLOB) {
    await blobWriteJson(key, cache[key]);
  } else {
    fsWriteJson(key, cache[key]);
  }
}

/* ================================================================
   Public API — sync reads, async writes.
   ================================================================ */

export function getCustomers(): Customer[] {
  return read("customers");
}
export function getCustomer(id: string): Customer | undefined {
  return read("customers").find((c) => c.id === id);
}

export function getAudienceGroups(): AudienceGroup[] {
  return read("audiences");
}
export function getAudienceGroup(id: string): AudienceGroup | undefined {
  return read("audiences").find((a) => a.id === id);
}
export async function saveAudienceGroup(group: AudienceGroup): Promise<void> {
  const all = read("audiences");
  const idx = all.findIndex((a) => a.id === group.id);
  if (idx >= 0) all[idx] = group;
  else all.push(group);
  cache.audiences = all;
  await persist("audiences");
}
export async function deleteAudienceGroup(id: string): Promise<void> {
  cache.audiences = read("audiences").filter((a) => a.id !== id);
  await persist("audiences");
}

export function getHistoricalCampaigns(): HistoricalCampaign[] {
  return read("historical");
}

export function getCampaigns(): Campaign[] {
  return read("campaigns");
}
export function getCampaign(id: string): Campaign | undefined {
  return read("campaigns").find((c) => c.id === id);
}
export async function saveCampaign(campaign: Campaign): Promise<void> {
  campaign.updatedAt = new Date().toISOString();
  const all = read("campaigns");
  const idx = all.findIndex((c) => c.id === campaign.id);
  if (idx >= 0) all[idx] = campaign;
  else all.push(campaign);
  cache.campaigns = all;
  await persist("campaigns");
}
export async function deleteCampaign(id: string): Promise<void> {
  cache.campaigns = read("campaigns").filter((c) => c.id !== id);
  await persist("campaigns");
}

export function getRehearsals(): RehearsalResult[] {
  return read("rehearsals");
}
export function getLatestRehearsal(campaignId: string): RehearsalResult | undefined {
  return read("rehearsals")
    .filter((r) => r.campaignId === campaignId)
    .sort((a, b) => b.ranAt.localeCompare(a.ranAt))[0];
}
export async function saveRehearsal(r: RehearsalResult): Promise<void> {
  if (!r.distribution) r.distribution = computeDistribution(r);
  const all = read("rehearsals");
  if (!r.diffSummary) {
    const prior = all
      .filter((x) => x.campaignId === r.campaignId)
      .sort((a, b) => b.ranAt.localeCompare(a.ranAt))[0];
    const campaign = getCampaign(r.campaignId);
    r.diffSummary = computeDiffSummary(campaign, prior);
  }
  all.push(r);
  cache.rehearsals = all;
  await persist("rehearsals");
}

function computeDistribution(r: RehearsalResult): RehearsalDistribution {
  const d: RehearsalDistribution = {
    open_click: 0, open_ignore: 0, ignore: 0, unsubscribe: 0, spam: 0,
  };
  for (const resp of r.responses) d[resp.action]++;
  return d;
}

function computeDiffSummary(
  campaign: Campaign | undefined,
  prior: RehearsalResult | undefined,
): string[] {
  if (!campaign) return ["initial run"];
  if (!prior) return ["initial run"];
  const priorTime = prior.ranAt;
  const summary: string[] = [];

  const newlyApplied = (campaign.appliedOpportunities ?? []).filter(
    (a) => a.appliedAt > priorTime,
  );
  for (const a of newlyApplied) {
    const opp = prior.opportunities.find((o) => o.id === a.opportunityId);
    summary.push(`applied: ${opp?.title ?? "opportunity"}`);
  }

  const priorExcluded = new Set(prior.suppressions.map((s) => s.customerId));
  const currentExcluded = new Set(campaign.exclusions ?? []);
  let addedExcl = 0;
  for (const id of currentExcluded) if (!priorExcluded.has(id)) addedExcl++;
  if (addedExcl > 0) summary.push(`excluded: ${addedExcl} more twins`);

  if (campaign.updatedAt > priorTime && newlyApplied.length === 0 && addedExcl === 0) {
    const messageNodes = Object.values(campaign.flow.nodes).filter(
      (n: FlowNode) => n.type === "message",
    );
    if (messageNodes.length) summary.push(`edited: campaign content`);
  }

  if (!summary.length) summary.push("re-ran with no changes");
  return summary;
}

export async function overrideLatestRehearsal(
  campaignId: string,
  patch: Partial<RehearsalResult["verdict"]>,
): Promise<void> {
  const all = read("rehearsals");
  const idx = all
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.campaignId === campaignId)
    .sort((a, b) => b.r.ranAt.localeCompare(a.r.ranAt))[0]?.i;
  if (idx === undefined) return;
  all[idx].verdict = { ...all[idx].verdict, ...patch };
  cache.rehearsals = all;
  await persist("rehearsals");
}

export function getScorecard(): ScorecardEntry[] {
  return read("scorecard");
}
export function getScorecardEntry(campaignId: string): ScorecardEntry | undefined {
  return read("scorecard").find((e) => e.campaignId === campaignId);
}
export function scorecardWinRate(): { correct: number; total: number; rate: number } {
  const s = read("scorecard");
  const total = s.length;
  const correct = s.filter((e) => e.hit).length;
  return { correct, total, rate: total ? correct / total : 0 };
}
