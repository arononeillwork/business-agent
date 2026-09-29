import type { Metadata } from "next";
import { tradeCategories, trades } from "@/data/trades";
import { PageHeader } from "@/components/LinkList";
import { TradesDirectory } from "@/components/TradesDirectory";

export const metadata: Metadata = { title: "Tradespeople" };

export default function TradesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Trusted locals"
        title="Tradespeople we'd call again"
        intro="Recommended electricians, handymen, plumbers, painters and cleaners around Marbella and San Pedro."
      />
      <TradesDirectory trades={trades} categories={tradeCategories} />
      <p className="mt-8 text-sm text-muted">
        Know someone great? Recommend them and we&apos;ll add them after a check. Always agree a written quote (presupuesto) before work starts.
      </p>
    </>
  );
}
