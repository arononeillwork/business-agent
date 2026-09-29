import type { Metadata } from "next";
import { Check, ExternalLink, Minus, Plane } from "lucide-react";
import { airportOptions, rideOptions } from "@/data/transport";
import { PageHeader } from "@/components/LinkList";

export const metadata: Metadata = { title: "Taxis & transport" };

export default function TransportPage() {
  return (
    <>
      <PageHeader
        eyebrow="Getting around"
        title="PideTaxi vs Uber & co."
        intro="Licensed local taxis and private-hire (VTC) apps both work on the Costa del Sol. Here's when to use which."
      />

      <div className="grid gap-4 md:grid-cols-2">
        {rideOptions.map((o) => (
          <div key={o.name} className={`card ${o.name === "PideTaxi" ? "ring-2 ring-accent" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">{o.name}</h2>
                <span className="chip mt-2">{o.type}</span>
              </div>
              {o.name === "PideTaxi" && <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white">Local pick</span>}
            </div>

            <dl className="mt-5 space-y-3 text-sm">
              {[
                ["Pricing", o.pricing],
                ["Airport", o.airport],
                ["Booking & payment", o.booking],
                ["Best for", o.bestFor],
              ].map(([k, v]) => (
                <div key={k} className="grid grid-cols-[120px_1fr] gap-2">
                  <dt className="text-muted">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 grid gap-4 border-t border-line pt-4 text-sm sm:grid-cols-2">
              <ul className="space-y-1">
                {o.pros.map((p) => (
                  <li key={p} className="flex gap-2">
                    <Check size={16} className="mt-0.5 shrink-0 text-green-600" /> {p}
                  </li>
                ))}
              </ul>
              <ul className="space-y-1">
                {o.cons.map((c) => (
                  <li key={c} className="flex gap-2 text-muted">
                    <Minus size={16} className="mt-0.5 shrink-0" /> {c}
                  </li>
                ))}
              </ul>
            </div>

            <a href={o.url} target="_blank" rel="noreferrer" className="link mt-5 inline-flex items-center gap-1 text-sm">
              Get {o.name} <ExternalLink size={14} />
            </a>
          </div>
        ))}
      </div>

      <section className="mt-14">
        <h2 className="flex items-center gap-2 text-2xl font-semibold">
          <Plane className="text-accent" /> Málaga airport → Marbella
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {airportOptions.map((a) => (
            <div key={a.name} className="card">
              <h3 className="font-semibold">{a.name}</h3>
              <p className="mt-1 text-sm text-muted">{a.detail}</p>
              {a.url && (
                <a href={a.url} target="_blank" rel="noreferrer" className="link mt-2 inline-block text-sm">
                  Website
                </a>
              )}
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted">Fares are indicative and change each year. Taxi airport supplements and night rates apply.</p>
      </section>
    </>
  );
}
