import type { TradeCategory, Tradesperson } from "@/lib/types";

export const tradeCategories: TradeCategory[] = ["Electrician", "Handyman", "Plumber", "Painter / Plasterer", "Cleaner"];

// PLACEHOLDERS: replace with real, recommended contacts.
// Set `placeholder: false` (or delete it) once an entry is real.
export const trades: Tradesperson[] = [
  {
    id: "electrician-1",
    name: "Your electrician",
    trade: "Electrician",
    areas: ["San Pedro", "Marbella"],
    phone: "+34 600 000 001",
    whatsapp: "34600000001",
    languages: ["English", "Spanish"],
    notes: "Boletín (electrical certificate), rewiring, fault finding.",
    verified: false,
    placeholder: true,
  },
  {
    id: "handyman-1",
    name: "Your handyman",
    trade: "Handyman",
    areas: ["Estepona", "San Pedro"],
    phone: "+34 600 000 002",
    whatsapp: "34600000002",
    languages: ["English"],
    notes: "Flat-pack, shelves, small repairs, key holding.",
    verified: false,
    placeholder: true,
  },
  {
    id: "plumber-1",
    name: "Your plumber",
    trade: "Plumber",
    areas: ["Marbella", "Nueva Andalucía"],
    phone: "+34 600 000 003",
    whatsapp: "34600000003",
    languages: ["Spanish"],
    notes: "Leaks, boilers (termos), bathroom refits.",
    verified: false,
    placeholder: true,
  },
  {
    id: "painter-1",
    name: "Your painter / plasterer",
    trade: "Painter / Plasterer",
    areas: ["Marbella", "Benahavís"],
    phone: "+34 600 000 004",
    languages: ["English", "Spanish"],
    notes: "Interior/exterior painting, damp treatment, plaster repairs.",
    verified: false,
    placeholder: true,
  },
  {
    id: "cleaner-1",
    name: "Your cleaner",
    trade: "Cleaner",
    areas: ["San Pedro", "Guadalmina"],
    phone: "+34 600 000 005",
    whatsapp: "34600000005",
    languages: ["Spanish", "English"],
    notes: "Weekly cleans, holiday-let turnovers.",
    verified: false,
    placeholder: true,
  },
];
