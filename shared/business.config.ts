// What the code needs at build time. Each business's own details (its name, address, phone, time zone,
// country, opening hours) live in its database `business` row; `name` here is only what shows while that
// hasn't loaded, so it's The Business Agent's, not a business's.

export const businessConfig = {
  id: 'easy-beans',
  name: 'The Business Agent',
  shortName: 'The Business Agent',
  /** Where the app is: businesssagent.com (the demo shows it in the AI set-up steps; menus, images and push use it). */
  appUrl: 'https://businesssagent.com',
  /**
   * The Worker's own address, which the custom domain points at. Square's app has its redirect and
   * webhook registered here (and signs webhooks with the URL), so those stay on it.
   */
  workersUrl: 'https://business-agent.arononeillwork.workers.dev',
  timezone: 'Europe/Madrid',
  /** ISO 3166 country: whose employment law Staff benefits shows (shared/benefits.ts). */
  country: 'ES' as const,
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
