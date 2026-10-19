// All the Spanish, merged from every file in this folder (one per area of the app, so pages can be
// translated side by side). Loaded only when someone switches to Spanish.
export { es as dateLocale } from 'date-fns/locale/es'

const files = import.meta.glob<Record<string, string>>(['./*.ts', '!./index.ts'], { eager: true, import: 'default' })

export const spanish: Record<string, string> = Object.assign({}, ...Object.values(files))
