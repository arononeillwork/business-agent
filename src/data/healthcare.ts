import type { Link } from "@/lib/types";

export type HealthSection = {
  id: string;
  title: string;
  intro: string;
  points: { title: string; detail: string }[];
  links: Link[];
};

export const healthSections: HealthSection[] = [
  {
    id: "public",
    title: "Public (SAS)",
    intro: "Andalucía's Servicio Andaluz de Salud. Free at the point of use once you are entitled.",
    points: [
      { title: "Who's covered", detail: "People working or self-employed and paying Social Security, their dependants, and state pensioners with an S1." },
      { title: "Not working?", detail: "Residents can join the Convenio Especial pay-in scheme after 1 year of padrón. Roughly €60/month under 65 and €157/month from 65 (indicative)." },
      { title: "How to register", detail: "Padrón + Social Security → Centro de Salud → tarjeta sanitaria. See the full walkthrough." },
      { title: "Local hospital", detail: "Hospital Universitario Costa del Sol (Marbella) is the main public hospital for the area." },
    ],
    links: [
      { label: "Servicio Andaluz de Salud", url: "https://www.sspa.juntadeandalucia.es/servicioandaluzdesalud/" },
      { label: "ClicSalud+", url: "https://ws060.juntadeandalucia.es/salud/clicsalud/" },
    ],
  },
  {
    id: "private",
    title: "Private insurance",
    intro: "Faster specialists and English-speaking doctors. Required for most non-lucrative and digital nomad visas.",
    points: [
      { title: "Main insurers", detail: "Sanitas, Adeslas, DKV, Asisa, Mapfre, Cigna, AXA." },
      { title: "Copay vs no copay", detail: "Copago plans are cheaper monthly but charge a few euros per visit. Visas usually require no copay and full coverage." },
      { title: "Private hospitals nearby", detail: "Quirónsalud Marbella, HC Marbella International Hospital, Vithas Xanit (Benalmádena)." },
      { title: "Typical cost", detail: "≈ €50–150/month per adult depending on age, plan and exclusions (indicative)." },
    ],
    links: [
      { label: "Sanitas", url: "https://www.sanitas.es" },
      { label: "Adeslas", url: "https://www.segurcaixaadeslas.es" },
      { label: "DKV", url: "https://dkv.es" },
      { label: "Asisa", url: "https://www.asisa.es" },
    ],
  },
  {
    id: "abroad",
    title: "Visiting / abroad",
    intro: "Cover while you're a tourist in Spain, or when you travel out of it.",
    points: [
      { title: "EHIC / GHIC", detail: "EU visitors use the EHIC. UK visitors use the GHIC for necessary state healthcare. Neither replaces travel insurance." },
      { title: "Travel insurance", detail: "Covers repatriation and private hospitals. Make sure it includes the activities you'll do." },
      { title: "Residents travelling", detail: "Spanish residents with SAS cover can request a Spanish EHIC (TSE) from Social Security." },
      { title: "Emergency numbers", detail: "112 general emergency · 061 medical emergencies (Andalucía)." },
    ],
    links: [
      { label: "Spanish EHIC (TSE)", url: "https://www.seg-social.es" },
      { label: "UK GHIC", url: "https://www.nhs.uk/using-the-nhs/healthcare-abroad/apply-for-a-free-uk-global-health-insurance-card-ghic/" },
    ],
  },
];
