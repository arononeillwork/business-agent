// Everything business-specific that the code needs at build time. Details that admins edit
// (address, phone, notes, opening hours) live in the database `business` row instead.
// New client = copy this file, new Supabase project, new Worker.

export const businessConfig = {
  id: 'easy-beans',
  name: 'Easy Beans Coffee',
  shortName: 'Easy Beans',
  /** Where this business's app is deployed (the demo shows it in the AI set-up steps). */
  appUrl: 'https://business-agent.arononeillwork.workers.dev',
  timezone: 'Europe/Madrid',
  locale: 'es-ES',
  currency: 'EUR',
  weekStartsOn: 1 as const, // Monday
  // Brand guidelines, Edition 01 (April 2026): see src/theme.ts for the full palette.
  brand: {
    primary: '#F79BA4',     // Rose Pink
    secondary: '#C6C2BB',   // Grey Limewash
    background: '#FBF8F4',  // cream
  },
  // Spain: Estatuto de los Trabajadores defaults. Convenio may be stricter; admins can edit
  // the live values in Settings, these are fallbacks.
  rules: {
    breakAfterHours: 6,
    minBreakMinutes: 15,
    maxDailyHours: 9,
    maxWeeklyHours: 40,
    minRestHours: 12,
    peak: { start: '11:00', end: '15:00' },
  },
}

export type BusinessConfig = typeof businessConfig
