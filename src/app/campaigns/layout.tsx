import { RailProvider } from "@/components/rail/RailContext";

export default function CampaignsLayout({ children }: { children: React.ReactNode }) {
  return (
    <RailProvider>
      <div
        data-ui="v2"
        className="min-h-screen text-[var(--foreground)]"
        style={{ background: "#fafafa" }}
      >
        {children}
      </div>
    </RailProvider>
  );
}
