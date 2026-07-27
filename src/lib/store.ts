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

/**
 * Distinguishes "the blob genuinely isn't there" (safe to seed) from "the read
 * failed" (must NOT seed — that would overwrite live data with seed data).
 * Transport/service failures throw rather than resolving to `missing`.
 */
type BlobRead<T> = { found: true; data: T } | { found: false };

async function blobReadJson<T>(key: Key): Promise<BlobRead<T>> {
  const { get } = await import("@vercel/blob");
  // `useCache: false` reads from origin storage. Reading the public blob URL
  // instead would go through the CDN, which holds a copy for at least 60s
  // (cacheControlMaxAge cannot be set below 1 minute) — so a read immediately
  // after a write serves the PRE-write JSON. That is what made a freshly
  // created campaign 404 until the TTL lapsed.
  const res = await get(`${key}.json`, { access: "public", useCache: false });
  if (!res || res.statusCode !== 200) return { found: false };
  return { found: true, data: (await new Response(res.stream).json()) as T };
}
async function blobWriteJson(key: Key, data: unknown): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(`${key}.json`, JSON.stringify(data, null, 2), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
    allowOverwrite: true,
    // Minimum permitted value. Reads bypass the CDN, so this only bounds how
    // long anything hitting the public URL directly can lag behind.
    cacheControlMaxAge: 60,
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
        let existing: BlobRead<unknown>;
        try {
          existing = await blobReadJson(k);
        } catch (err) {
          // A transient blob failure must not be mistaken for "first run".
          // Seed in memory only; writing here would destroy live data.
          console.error(`[store] blob read failed for ${k}, not seeding`, err);
          (cache as Record<string, unknown>)[k] = seed[k];
          return;
        }
        if (existing.found) {
          (cache as Record<string, unknown>)[k] = existing.data;
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
 * Sync read from cache. Safe for static seed data (customers, historical,
 * scorecard) that only changes when the deploy rebuilds. In dev, re-reads
 * from disk each time to avoid Turbopack module-instance drift.
 */
function read<K extends Key>(key: K): Cache[K] {
  if (!USE_BLOB) {
    return fsReadJson(key, cache[key]) as Cache[K];
  }
  return cache[key];
}

/**
 * Async read that ALWAYS pulls the latest state from storage. Required for
 * mutable collections (campaigns, audiences, rehearsals) because each
 * Vercel serverless instance has its own in-memory cache — a POST on one
 * instance won't propagate to a warm instance serving the next GET.
 */
async function readFresh<K extends Key>(key: K): Promise<Cache[K]> {
  if (USE_BLOB) {
    // Deliberately NOT wrapped in try/catch. Mutators (saveCampaign et al.)
    // read through here and then persist the result — swallowing a read error
    // and returning the stale cache would write that stale array back over
    // live data. Failing loudly is the safe behaviour.
    const fresh = await blobReadJson<Cache[K]>(key);
    if (fresh.found) {
      (cache as Record<string, unknown>)[key] = fresh.data;
      return fresh.data;
    }
    return cache[key];
  }
  return fsReadJson(key, cache[key]) as Cache[K];
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

export async function getAudienceGroups(): Promise<AudienceGroup[]> {
  return readFresh("audiences");
}
export async function getAudienceGroup(id: string): Promise<AudienceGroup | undefined> {
  return (await readFresh("audiences")).find((a) => a.id === id);
}
export async function saveAudienceGroup(group: AudienceGroup): Promise<void> {
  const all = await readFresh("audiences");
  const idx = all.findIndex((a) => a.id === group.id);
  if (idx >= 0) all[idx] = group;
  else all.push(group);
  cache.audiences = all;
  await persist("audiences");
}
export async function deleteAudienceGroup(id: string): Promise<void> {
  const all = await readFresh("audiences");
  cache.audiences = all.filter((a) => a.id !== id);
  await persist("audiences");
}

export function getHistoricalCampaigns(): HistoricalCampaign[] {
  return read("historical");
}

export async function getCampaigns(): Promise<Campaign[]> {
  return readFresh("campaigns");
}
export async function getCampaign(id: string): Promise<Campaign | undefined> {
  return (await readFresh("campaigns")).find((c) => c.id === id);
}
export async function saveCampaign(campaign: Campaign): Promise<void> {
  campaign.updatedAt = new Date().toISOString();
  const all = await readFresh("campaigns");
  const idx = all.findIndex((c) => c.id === campaign.id);
  if (idx >= 0) all[idx] = campaign;
  else all.push(campaign);
  cache.campaigns = all;
  await persist("campaigns");
}
export async function deleteCampaign(id: string): Promise<void> {
  const all = await readFresh("campaigns");
  cache.campaigns = all.filter((c) => c.id !== id);
  await persist("campaigns");
}

export async function getRehearsals(): Promise<RehearsalResult[]> {
  return readFresh("rehearsals");
}
export async function getLatestRehearsal(campaignId: string): Promise<RehearsalResult | undefined> {
  return (await readFresh("rehearsals"))
    .filter((r) => r.campaignId === campaignId)
    .sort((a, b) => b.ranAt.localeCompare(a.ranAt))[0];
}
export async function saveRehearsal(r: RehearsalResult): Promise<void> {
  if (!r.distribution) r.distribution = computeDistribution(r);
  const all = await readFresh("rehearsals");
  if (!r.diffSummary) {
    const prior = all
      .filter((x) => x.campaignId === r.campaignId)
      .sort((a, b) => b.ranAt.localeCompare(a.ranAt))[0];
    const campaign = await getCampaign(r.campaignId);
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
  const all = await readFresh("rehearsals");
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
