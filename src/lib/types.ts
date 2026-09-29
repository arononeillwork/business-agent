// Shapes mirror the future Supabase tables, so data files can be swapped for DB queries later.

export type Link = { label: string; url: string; note?: string };

export type Step = { title: string; detail: string; link?: Link };

export type GuideCategory = "Paperwork" | "Money" | "Health" | "Driving" | "Home";

export type Guide = {
  slug: string;
  title: string;
  summary: string;
  category: GuideCategory;
  timeEstimate: string;
  cost: string;
  updated: string; // ISO date the info was last reviewed
  documents: string[];
  steps: Step[];
  tips?: string[];
  links: Link[];
};

export type TradeCategory = "Electrician" | "Handyman" | "Plumber" | "Painter / Plasterer" | "Cleaner";

export type Tradesperson = {
  id: string;
  name: string;
  trade: TradeCategory;
  areas: string[];
  phone: string;
  whatsapp?: string; // international format, digits only e.g. 34600000000
  languages: string[];
  notes: string;
  verified: boolean;
  placeholder?: boolean;
};
