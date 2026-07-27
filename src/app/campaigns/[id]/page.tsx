import { notFound } from "next/navigation";
import {
  getAudienceGroup,
  getCampaign,
  getCustomers,
  getHistoricalCampaigns,
  getLatestRehearsal,
  getRehearsals,
} from "@/lib/store";
import { CampaignEditor } from "@/components/CampaignEditor";
import { estimatedEligibleCount } from "@/lib/rehearse";

export const dynamic = "force-dynamic";

export default async function CampaignPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await props.params;
  const search = await props.searchParams;
  const campaign = getCampaign(id);
  if (!campaign) return notFound();
  const audience = getAudienceGroup(campaign.audienceGroupId);
  const eligible = estimatedEligibleCount(campaign);
  const latest = getLatestRehearsal(campaign.id);
  const runs = getRehearsals()
    .filter((r) => r.campaignId === campaign.id)
    .sort((a, b) => b.ranAt.localeCompare(a.ranAt));
  const customers = getCustomers();
  const requestedView = (search?.view as string) ?? "flow";
  const view: "flow" | "rehearsal" =
    requestedView === "rehearsal" ? "rehearsal" : "flow";
  const twinsById = Object.fromEntries(
    customers
      .filter((c) => audience?.memberIds.includes(c.id))
      .map((c) => [
        c.id,
        {
          id: c.id,
          name: `${c.firstName} ${c.lastInitial}.`,
          grounding: c.groundingQuality,
        },
      ]),
  );

  const historical = getHistoricalCampaigns();

  return (
    <CampaignEditor
      initialCampaign={campaign}
      audience={audience ? { id: audience.id, name: audience.name, memberCount: audience.memberIds.length, description: audience.description } : null}
      eligible={eligible}
      initialRehearsal={latest ?? null}
      initialRuns={runs}
      initialView={view}
      twinsById={twinsById}
      historicalCampaigns={historical}
    />
  );
}
