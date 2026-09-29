import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Euro } from "lucide-react";
import { guides } from "@/data/guides";
import { PageHeader } from "@/components/LinkList";

export const metadata: Metadata = { title: "Guides" };

export default function GuidesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Walkthroughs"
        title="Step-by-step guides"
        intro="Documents to bring, what it costs, how long it takes, and the official links, all in one place."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {guides.map((g) => (
          <Link key={g.slug} href={`/guides/${g.slug}`} className="card transition hover:-translate-y-0.5 hover:border-accent">
            <span className="chip">{g.category}</span>
            <h2 className="mt-3 text-xl font-semibold">{g.title}</h2>
            <p className="mt-1 text-muted">{g.summary}</p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
              <span className="inline-flex items-center gap-1">
                <Clock size={14} /> {g.timeEstimate}
              </span>
              <span className="inline-flex items-center gap-1">
                <Euro size={14} /> {g.cost}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
