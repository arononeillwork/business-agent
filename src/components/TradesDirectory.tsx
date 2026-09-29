"use client";

import { useState } from "react";
import { BadgeCheck, MessageCircle, Phone } from "lucide-react";
import type { TradeCategory, Tradesperson } from "@/lib/types";

export function TradesDirectory({ trades, categories }: { trades: Tradesperson[]; categories: TradeCategory[] }) {
  const [filter, setFilter] = useState<TradeCategory | "All">("All");
  const shown = filter === "All" ? trades : trades.filter((t) => t.trade === filter);

  return (
    <>
      <div className="mb-6 flex flex-wrap gap-2">
        {(["All", ...categories] as const).map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              filter === c ? "bg-accent text-white" : "border border-line bg-surface hover:border-accent"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((t) => (
          <div key={t.id} className={`card flex flex-col ${t.placeholder ? "border-dashed" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <span className="chip">{t.trade}</span>
              {t.placeholder ? (
                <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">Placeholder</span>
              ) : (
                t.verified && <BadgeCheck className="text-sea" aria-label="Verified" />
              )}
            </div>
            <h3 className="mt-3 text-lg font-semibold">{t.name}</h3>
            <p className="mt-1 text-sm text-muted">{t.notes}</p>
            <p className="mt-3 text-sm">
              <span className="text-muted">Areas:</span> {t.areas.join(", ")}
            </p>
            <p className="text-sm">
              <span className="text-muted">Speaks:</span> {t.languages.join(", ")}
            </p>
            <div className="mt-auto flex gap-2 pt-5">
              <a href={`tel:${t.phone.replace(/\s/g, "")}`} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-line py-2.5 text-sm font-medium hover:border-accent">
                <Phone size={16} /> Call
              </a>
              {t.whatsapp && (
                <a
                  href={`https://wa.me/${t.whatsapp}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#25d366] py-2.5 text-sm font-medium text-white hover:opacity-90"
                >
                  <MessageCircle size={16} /> WhatsApp
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
