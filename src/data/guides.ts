import type { Guide } from "@/lib/types";

// Order here is the recommended order for newcomers ("Your path" on the home page).
export const guides: Guide[] = [
  {
    slug: "nie",
    title: "NIE & TIE",
    summary:
      "Your foreigner identity number. You need it to buy property, open most bank accounts, sign contracts and pay taxes.",
    category: "Paperwork",
    timeEstimate: "1–6 weeks (mostly waiting for an appointment)",
    cost: "≈ €12 (NIE) · ≈ €16–21 (TIE card)",
    updated: "2026-09-29",
    documents: [
      "Passport + photocopy",
      "Form EX-15 (NIE only) or EX-17 (TIE card), filled in and printed",
      "Tasa Modelo 790 código 012, paid at a bank",
      "Proof of why you need it (e.g. property reservation, job offer)",
      "Appointment confirmation (cita previa)",
      "Passport photo (TIE only)",
    ],
    steps: [
      {
        title: "Work out which document you need",
        detail:
          "NIE = the number only (non-residents, e.g. buying a holiday home). EU citizens moving here get the green Registration Certificate (EX-18). Non-EU residents, including UK nationals, get a TIE card with their residence visa or permit.",
      },
      {
        title: "Book a cita previa",
        detail:
          "Choose province Málaga, then 'Policía – Asignación de NIE' (or 'Toma de huellas' for the TIE). Slots go fast. Check early morning, or use a gestor.",
        link: {
          label: "Cita previa extranjería",
          url: "https://icp.administracionelectronica.gob.es/icpplus/index.html",
        },
      },
      {
        title: "Fill in the form",
        detail: "Download EX-15 (or EX-17 / EX-18) from the Ministry site. Print two copies and sign both.",
        link: {
          label: "Immigration forms (EX-xx)",
          url: "https://www.inclusion.gob.es/web/migraciones/modelos-de-solicitud",
        },
      },
      {
        title: "Pay the fee (Modelo 790 código 012)",
        detail: "Generate the form online, print it and pay at any bank branch. Keep the stamped copy.",
        link: {
          label: "Modelo 790-012",
          url: "https://sede.policia.gob.es/Tasa790_012/",
        },
      },
      {
        title: "Attend the appointment",
        detail:
          "Take originals and copies to the Extranjería / Policía Nacional office named on your booking (Marbella or Málaga). You will get the NIE certificate on the day or a collection date.",
      },
      {
        title: "Collect your TIE (residents only)",
        detail: "About 30–45 days after fingerprinting, book a 'Recogida de tarjeta' appointment and collect your card.",
      },
    ],
    tips: [
      "A gestor or lawyer can book and attend for you, usually for €50–150.",
      "Your NIE number never changes, even when the TIE card is renewed.",
    ],
    links: [
      { label: "Sede Administraciones Públicas", url: "https://sede.administracionespublicas.gob.es" },
      { label: "Policía Nacional – foreigners", url: "https://www.policia.es/_es/extranjeria.php" },
    ],
  },
  {
    slug: "padron",
    title: "Empadronamiento (Padrón)",
    summary:
      "Register at your town hall. It unlocks healthcare, schools, local tax discounts and is required for residency.",
    category: "Paperwork",
    timeEstimate: "Same day to 1 week",
    cost: "Free",
    updated: "2026-09-29",
    documents: [
      "Passport and NIE / TIE",
      "Title deeds (escritura), or rental contract plus a recent utility bill",
      "Padrón application form (from the town hall)",
    ],
    steps: [
      {
        title: "Book an appointment at the town hall",
        detail:
          "In Marbella you can book online or visit the Oficina de Atención al Ciudadano. San Pedro residents can use the Tenencia de Alcaldía in San Pedro.",
        link: { label: "Ayuntamiento de Marbella", url: "https://www.marbella.es" },
      },
      {
        title: "Hand in your documents",
        detail: "Every adult in the household registers. Bring each person's passport.",
      },
      {
        title: "Ask for a certificado de empadronamiento",
        detail: "You need this certificate for healthcare, school enrolment and residency. It is usually valid for 3 months.",
      },
    ],
    tips: ["Request a new certificate whenever a process asks for one. Old ones are often rejected."],
    links: [{ label: "Ayuntamiento de Marbella", url: "https://www.marbella.es" }],
  },
  {
    slug: "bank-account",
    title: "Open a Spanish bank account",
    summary: "Needed for direct debits, utilities, community fees and your mortgage.",
    category: "Money",
    timeEstimate: "1 day – 2 weeks",
    cost: "Free – €15/month depending on account",
    updated: "2026-09-29",
    documents: [
      "Passport",
      "NIE (non-resident accounts are possible without one at some banks)",
      "Proof of address and income / employment",
    ],
    steps: [
      {
        title: "Choose resident or non-resident",
        detail: "Non-resident accounts are easier to open but often cost more. Switch to a resident account once you have your TIE.",
      },
      {
        title: "Compare banks",
        detail:
          "Traditional banks (CaixaBank, Santander, BBVA, Sabadell, Unicaja) have branches locally. Online banks (Openbank, ING, Revolut with a Spanish IBAN) are cheaper.",
      },
      { title: "Book a branch appointment or apply online", detail: "Ask for the fees to be waived, e.g. if your salary or pension is paid into the account." },
    ],
    links: [{ label: "Banco de España – bank customer portal", url: "https://clientebancario.bde.es" }],
  },
  {
    slug: "social-security",
    title: "Social Security number",
    summary: "Your número de afiliación. You need it to work, register as autónomo, and get public healthcare.",
    category: "Health",
    timeEstimate: "Same day – 2 weeks",
    cost: "Free",
    updated: "2026-09-29",
    documents: ["Passport and NIE / TIE", "Form TA.1", "Padrón certificate (often requested)"],
    steps: [
      {
        title: "Apply online or at a TGSS office",
        detail: "Use Import@ss with a digital certificate or Cl@ve, or book an appointment at the Tesorería General in Marbella.",
        link: { label: "Import@ss", url: "https://portal.seg-social.gob.es/wps/portal/importass/importass" },
      },
      { title: "Receive your number", detail: "Keep the resolution letter. Employers and the health centre will ask for it." },
    ],
    links: [{ label: "Seguridad Social", url: "https://www.seg-social.es" }],
  },
  {
    slug: "health-card",
    title: "Public health card (SAS)",
    summary: "Register with your local health centre and get your tarjeta sanitaria from the Servicio Andaluz de Salud.",
    category: "Health",
    timeEstimate: "1–4 weeks",
    cost: "Free if you contribute or hold an S1 · otherwise Convenio Especial",
    updated: "2026-09-29",
    documents: [
      "Passport and TIE / NIE",
      "Padrón certificate",
      "Social Security entitlement document (or S1 registered with INSS)",
    ],
    steps: [
      { title: "Get your entitlement confirmed", detail: "Workers are covered through Social Security. UK/EU state pensioners register their S1 with INSS." },
      { title: "Go to your nearest Centro de Salud", detail: "They register you and assign a GP (médico de cabecera). The card arrives by post." },
      {
        title: "Install ClicSalud+",
        detail: "Use it to book GP appointments, see prescriptions and results.",
        link: { label: "ClicSalud+", url: "https://ws060.juntadeandalucia.es/salud/clicsalud/" },
      },
    ],
    links: [{ label: "Servicio Andaluz de Salud", url: "https://www.sspa.juntadeandalucia.es/servicioandaluzdesalud/" }],
  },
  {
    slug: "digital-certificate",
    title: "Digital certificate & Cl@ve",
    summary: "Do almost all admin online: taxes, DGT, Social Security and appointments.",
    category: "Paperwork",
    timeEstimate: "1 day – 1 week",
    cost: "Free",
    updated: "2026-09-29",
    documents: ["NIE / TIE", "Passport", "Request code from the FNMT website"],
    steps: [
      {
        title: "Request the certificate online",
        detail: "On the FNMT site choose 'Persona física' → 'Obtener certificado software'. You receive a request code by email.",
        link: { label: "FNMT – Persona física", url: "https://www.sede.fnmt.gob.es/certificados/persona-fisica" },
      },
      { title: "Verify your identity", detail: "Take your code and ID to an accreditation office (Hacienda, Social Security or some town halls)." },
      { title: "Download and back it up", detail: "Download it on the same computer and browser you used to request it. Export a .p12 backup." },
      {
        title: "Set up Cl@ve too",
        detail: "Cl@ve is a simpler PIN or app login accepted by most government sites.",
        link: { label: "Cl@ve", url: "https://clave.gob.es" },
      },
    ],
    links: [{ label: "FNMT", url: "https://www.sede.fnmt.gob.es" }],
  },
  {
    slug: "driving-licence",
    title: "Driving licence & car",
    summary: "Exchange your foreign licence if needed, plus ITV, insurance and car tax basics.",
    category: "Driving",
    timeEstimate: "2–8 weeks",
    cost: "≈ €30 DGT fee + medical check",
    updated: "2026-09-29",
    documents: ["Current licence", "TIE / residency proof", "Padrón certificate", "Photo", "Medical certificate (Centro de Reconocimiento)"],
    steps: [
      {
        title: "Check whether you must exchange",
        detail:
          "EU/EEA licences stay valid. UK and some other licences can be exchanged under bilateral agreements. You can usually drive on them for 6 months after becoming resident.",
      },
      {
        title: "Book 'Canje de permiso' at the DGT",
        detail: "Málaga Jefatura Provincial. Pay tasa 2.3 online first.",
        link: { label: "DGT sede electrónica", url: "https://sede.dgt.gob.es" },
      },
      { title: "Car admin", detail: "ITV (MOT) every 1–2 years depending on age. Road tax (IVTM) is paid to your town hall." },
    ],
    links: [{ label: "DGT", url: "https://www.dgt.es" }],
  },
  {
    slug: "taxes",
    title: "Tax basics",
    summary: "Tax residency, annual returns, and the forms expats most often need.",
    category: "Money",
    timeEstimate: "Ongoing",
    cost: "Gestor ≈ €100–300 per return",
    updated: "2026-09-29",
    documents: ["NIE", "Digital certificate or Cl@ve", "Income and asset statements"],
    steps: [
      { title: "Know if you're tax resident", detail: "Usually yes if you spend 183+ days in Spain in a calendar year, or your main interests are here." },
      { title: "Annual income tax (Modelo 100)", detail: "The filing campaign runs roughly April to June for the previous year." },
      { title: "Foreign assets (Modelo 720)", detail: "Declare overseas assets over €50,000 per category by 31 March." },
      { title: "Non-residents with property (Modelo 210)", detail: "Imputed income tax on Spanish property, filed yearly." },
      { title: "Moving for work? Look at the Beckham regime", detail: "A flat tax option for new arrivals. Apply within 6 months (Modelo 149)." },
    ],
    tips: ["Use a local gestor or asesor fiscal for your first year. It is worth it."],
    links: [{ label: "Agencia Tributaria", url: "https://sede.agenciatributaria.gob.es" }],
  },
  {
    slug: "utilities",
    title: "Utilities & internet",
    summary: "Electricity, water, gas and fibre: switching names and choosing providers.",
    category: "Home",
    timeEstimate: "1–3 weeks",
    cost: "Varies",
    updated: "2026-09-29",
    documents: ["NIE", "Spanish IBAN", "Deeds or rental contract", "CUPS code (on the previous electricity bill)"],
    steps: [
      { title: "Electricity", detail: "The grid in Andalucía is run by e-distribución (Endesa). Choose any retailer: Endesa, Iberdrola, Naturgy, Octopus, Holaluz and others." },
      { title: "Water", detail: "The provider depends on your municipality. Ask the town hall, community administrator or previous owner which company serves your address." },
      { title: "Internet & mobile", detail: "Check fibre coverage by address: Movistar, Vodafone, Orange, Digi, O2, MásMóvil." },
      { title: "Change of name (cambio de titular)", detail: "Ask the previous owner for recent bills so the handover is quick." },
    ],
    links: [{ label: "CNMC price comparator", url: "https://comparador.cnmc.gob.es" }],
  },
];

export const getGuide = (slug: string) => guides.find((g) => g.slug === slug);
