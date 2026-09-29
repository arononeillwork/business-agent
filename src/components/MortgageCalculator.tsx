"use client";

import { useState } from "react";
import { purchaseFees } from "@/data/mortgages";

const eur = (n: number) => n.toLocaleString("en-GB", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

function Field({ label, value, onChange, suffix, step = 1 }: { label: string; value: number; onChange: (v: number) => void; suffix?: string; step?: number }) {
  return (
    <label className="block">
      <span className="text-sm text-muted">{label}</span>
      <div className="mt-1 flex items-center rounded-xl border border-line bg-bg focus-within:border-accent">
        <input
          type="number"
          value={value}
          step={step}
          min={0}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full bg-transparent px-3 py-2.5 outline-none"
        />
        {suffix && <span className="pr-3 text-sm text-muted">{suffix}</span>}
      </div>
    </label>
  );
}

export function MortgageCalculator() {
  const [price, setPrice] = useState(400000);
  const [depositPct, setDepositPct] = useState(30);
  const [rate, setRate] = useState(3.2);
  const [years, setYears] = useState(25);
  const [newBuild, setNewBuild] = useState(false);

  const loan = price * (1 - depositPct / 100);
  const r = rate / 100 / 12;
  const n = years * 12;
  const monthly = r === 0 ? loan / n : (loan * r) / (1 - Math.pow(1 + r, -n));
  const totalInterest = monthly * n - loan;

  // Use the midpoint of fixed-fee ranges for the estimate.
  const fees = purchaseFees
    .map((f) => {
      const pct = newBuild ? f.newBuild : f.resale;
      const amount = pct ? (price * pct) / 100 : f.fixed ? (f.fixed[0] + f.fixed[1]) / 2 : 0;
      return { name: f.name, amount: f.name === "Lawyer" ? amount * 1.21 : amount };
    })
    .filter((f) => f.amount > 0);
  const totalFees = fees.reduce((s, f) => s + f.amount, 0);
  const cashNeeded = price - loan + totalFees;

  return (
    <div className="card grid gap-8 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="flex rounded-xl bg-bg p-1 text-sm">
          {[false, true].map((nb) => (
            <button
              key={String(nb)}
              onClick={() => setNewBuild(nb)}
              className={`flex-1 rounded-lg py-2 font-medium transition ${newBuild === nb ? "bg-surface shadow-sm" : "text-muted"}`}
            >
              {nb ? "New build" : "Resale"}
            </button>
          ))}
        </div>
        <Field label="Property price" value={price} onChange={setPrice} suffix="€" step={5000} />
        <Field label="Deposit" value={depositPct} onChange={setDepositPct} suffix="%" />
        <Field label="Interest rate (TIN)" value={rate} onChange={setRate} suffix="%" step={0.05} />
        <Field label="Term" value={years} onChange={setYears} suffix="years" />
      </div>

      <div>
        <div className="rounded-2xl bg-accent p-6 text-white">
          <p className="text-sm text-white/80">Monthly payment</p>
          <p className="mt-1 text-4xl font-bold">{Number.isFinite(monthly) ? eur(monthly) : "–"}</p>
          <p className="mt-2 text-sm text-white/80">
            Loan {eur(loan)} · total interest {Number.isFinite(totalInterest) ? eur(totalInterest) : "–"}
          </p>
        </div>

        <div className="mt-4 rounded-2xl border border-line p-5">
          <div className="flex items-baseline justify-between">
            <p className="font-semibold">Cash needed upfront</p>
            <p className="text-xl font-bold">{eur(cashNeeded)}</p>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm">
            <li className="flex justify-between">
              <span className="text-muted">Deposit</span> {eur(price - loan)}
            </li>
            {fees.map((f) => (
              <li key={f.name} className="flex justify-between">
                <span className="text-muted">{f.name}</span> {eur(f.amount)}
              </li>
            ))}
            <li className="flex justify-between border-t border-line pt-1.5 font-medium">
              <span>Costs on top of price</span> {eur(totalFees)} ({((totalFees / price) * 100).toFixed(1)}%)
            </li>
          </ul>
        </div>
        <p className="mt-3 text-xs text-muted">Estimate only. Fixed fees use the midpoint of typical ranges. Ask your bank for a FEIN offer.</p>
      </div>
    </div>
  );
}
