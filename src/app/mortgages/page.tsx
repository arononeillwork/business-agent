import type { Metadata } from "next";
import { buyerProtections, mortgageBrokers, mortgageFacts, purchaseFees, rateTypes, searchSites } from "@/data/mortgages";
import { LinkList, PageHeader } from "@/components/LinkList";
import { MortgageCalculator } from "@/components/MortgageCalculator";

export const metadata: Metadata = { title: "Mortgages & buying" };

const fmt = (f: (typeof purchaseFees)[number], kind: "resale" | "newBuild") => {
  if (f.fixed) return `€${f.fixed[0]}–${f.fixed[1]}`;
  const v = f[kind];
  return v ? `${v}%` : "–";
};

export default function MortgagesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Buying property"
        title="Mortgages, fees & where to search"
        intro="Budget roughly 10–13% on top of the price in Andalucía. Here's where every euro goes."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {mortgageFacts.map((f) => (
          <div key={f.label} className="card">
            <p className="text-sm text-muted">{f.label}</p>
            <p className="mt-1 text-xl font-semibold">{f.value}</p>
          </div>
        ))}
      </div>

      <section className="mt-12">
        <h2 className="mb-4 text-2xl font-semibold">Calculator</h2>
        <MortgageCalculator />
      </section>

      <section className="mt-12">
        <h2 className="mb-4 text-2xl font-semibold">Purchase costs</h2>
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="px-5 py-3 font-medium">Cost</th>
                <th className="px-5 py-3 font-medium">Resale</th>
                <th className="px-5 py-3 font-medium">New build</th>
                <th className="px-5 py-3 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {purchaseFees.map((f) => (
                <tr key={f.name} className="border-b border-line last:border-0">
                  <td className="px-5 py-3 font-medium">{f.name}</td>
                  <td className="px-5 py-3">{fmt(f, "resale")}</td>
                  <td className="px-5 py-3">{fmt(f, "newBuild")}</td>
                  <td className="px-5 py-3 text-muted">{f.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 rounded-xl bg-sea-soft p-4 text-sm">{buyerProtections}</p>
      </section>

      <section className="mt-12 grid gap-4 md:grid-cols-3">
        {rateTypes.map((r) => (
          <div key={r.name} className="card">
            <h3 className="font-semibold">{r.name}</h3>
            <p className="mt-1 text-sm text-muted">{r.detail}</p>
          </div>
        ))}
      </section>

      <section className="mt-12 grid gap-4 md:grid-cols-2">
        <div className="card">
          <h2 className="text-xl font-semibold">Property search sites</h2>
          <div className="mt-4">
            <LinkList links={searchSites} />
          </div>
        </div>
        <div className="card">
          <h2 className="text-xl font-semibold">Compare mortgages</h2>
          <div className="mt-4">
            <LinkList links={mortgageBrokers} />
          </div>
        </div>
      </section>
    </>
  );
}
