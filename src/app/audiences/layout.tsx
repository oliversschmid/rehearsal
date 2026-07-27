import { RailProvider } from "@/components/rail/RailContext";
import { AgentRail } from "@/components/rail/AgentRail";

export default function AudiencesLayout({ children }: { children: React.ReactNode }) {
  return (
    <RailProvider>
      <div
        data-ui="v2"
        className="grid min-h-screen text-[var(--foreground)]"
        style={{ background: "#fafafa", gridTemplateColumns: "minmax(0, 1fr) 360px" }}
      >
        <div className="min-w-0">{children}</div>
        <AgentRail />
      </div>
    </RailProvider>
  );
}
