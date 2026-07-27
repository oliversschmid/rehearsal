import { notFound } from "next/navigation";
import Link from "next/link";
import { getCustomer } from "@/lib/store";
import { TwinDetail } from "@/components/TwinDetail";

export const dynamic = "force-dynamic";

export default async function CustomerPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const c = getCustomer(id);
  if (!c) return notFound();
  return (
    <div className="max-w-5xl mx-auto p-8">
      <div className="text-[12px] text-[var(--muted)]">
        <Link href="/audiences" className="hover:underline">Audiences</Link>
        <span className="mx-2">/</span>
        <span>Twin detail</span>
      </div>
      <TwinDetail customer={c} />
    </div>
  );
}
