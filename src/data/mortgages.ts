import type { Link } from "@/lib/types";

// Indicative buyer costs in Andalucía. Percentages apply to the purchase price.
export type Fee = { name: string; resale?: number; newBuild?: number; fixed?: [number, number]; note: string };

export const purchaseFees: Fee[] = [
  { name: "ITP transfer tax", resale: 7, note: "Resale only. Andalucía flat rate (reduced rates may apply to young buyers)." },
  { name: "IVA (VAT)", newBuild: 10, note: "New builds only. Replaces ITP." },
  { name: "AJD stamp duty", newBuild: 1.2, note: "New builds only (Andalucía)." },
  { name: "Lawyer", resale: 1, newBuild: 1, note: "≈ 1% + 21% IVA. Always use an independent lawyer." },
  { name: "Notary", fixed: [600, 1200], note: "Purchase deed (escritura)." },
  { name: "Land Registry", fixed: [400, 800], note: "Registering the title." },
  { name: "Valuation (tasación)", fixed: [300, 600], note: "Required by the bank and paid by the buyer." },
  { name: "Gestoría", fixed: [300, 500], note: "Handles taxes and registration paperwork." },
];

export const mortgageFacts = [
  { label: "Max loan (residents)", value: "≈ 80% of value" },
  { label: "Max loan (non-residents)", value: "≈ 60–70% of value" },
  { label: "Typical max term", value: "25–30 years, ending by age ~75" },
  { label: "Budget on top of price", value: "≈ 10–13% in costs" },
];

export const rateTypes = [
  { name: "Fixed (fijo)", detail: "The same payment for the whole term. Safer, and usually a slightly higher rate." },
  { name: "Variable", detail: "Euribor + a spread (diferencial), reviewed every 6–12 months." },
  { name: "Mixed (mixto)", detail: "Fixed for the first 5–15 years, then variable." },
];

export const buyerProtections =
  "Under Ley 5/2019 the bank pays the mortgage-deed stamp duty, notary, registry and gestoría for the mortgage itself. You pay the valuation. Early repayment fees are capped by law.";

export const searchSites: Link[] = [
  { label: "Idealista", url: "https://www.idealista.com", note: "Biggest Spanish portal" },
  { label: "Fotocasa", url: "https://www.fotocasa.es", note: "Large Spanish portal" },
  { label: "Kyero", url: "https://www.kyero.com", note: "Aimed at international buyers" },
  { label: "pisos.com", url: "https://www.pisos.com", note: "Spanish portal" },
  { label: "Habitaclia", url: "https://www.habitaclia.com", note: "Spanish portal" },
];

export const mortgageBrokers: Link[] = [
  { label: "iAhorro", url: "https://www.iahorro.com", note: "Mortgage comparison + broker" },
  { label: "HelpMyCash", url: "https://www.helpmycash.com", note: "Rate comparisons" },
  { label: "Banco de España – mortgage guide", url: "https://clientebancario.bde.es", note: "Official consumer info" },
];
