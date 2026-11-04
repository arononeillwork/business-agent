// Company values: what the business stands for and how the team behaves (a line each, some with a point
// under them) and the words nobody says in the café, each in English and Spanish, read in the language
// each person uses the app in. The whole team reads them; admins change them. Easy Beans starts with the
// owners' own (the `company_values` migration; the test checks the two agree).
import { msg } from './i18n'

export type ValueKind = 'value' | 'word'

export interface CompanyValue {
  id: string
  /** A value, or a word nobody says. */
  kind: ValueKind
  /** The value it's a point under (values only, one level), or null. */
  parent_id: string | null
  text_en: string | null
  text_es: string | null
  sort: number
}
export type CompanyValueInput = Partial<Omit<CompanyValue, 'id'>> & { id?: string }

/** The same limit as the database's. */
export const VALUE_TEXT_MAX = 300

/** What's wrong before it's saved (the database says the same), or null. */
export function valueProblem(v: Pick<CompanyValueInput, 'text_en' | 'text_es'>): string | null {
  const en = (v.text_en ?? '').trim(), es = (v.text_es ?? '').trim()
  if (!en && !es) return msg('Write it in English or Spanish')
  if (en.length > VALUE_TEXT_MAX || es.length > VALUE_TEXT_MAX) return msg('Keep it to 300 characters')
  return null
}

const bySort = (a: CompanyValue, b: CompanyValue) => a.sort - b.sort || a.id.localeCompare(b.id)

export interface ValueNode { item: CompanyValue; points: CompanyValue[] }
/** The values (or the words) in order, each value with its points in order. */
export function valuesOf(items: CompanyValue[], kind: ValueKind): ValueNode[] {
  const mine = items.filter(i => i.kind === kind)
  return mine.filter(i => !i.parent_id).sort(bySort).map(item => ({ item, points: mine.filter(p => p.parent_id === item.id).sort(bySort) }))
}

/** Values as written: each in both languages, with its points. */
export interface ValuePreset { en: string; es: string; points?: { en: string; es: string }[] }

/** Easy Beans' own, as the owners wrote them (tidied a little), with the Spanish beside them. */
export const EASY_BEANS_VALUES: { values: ValuePreset[]; words: ValuePreset[] } = {
  values: [
    { en: 'Good energy in the café only: leave bad energy away from the café.', es: 'Solo buena energía en el café: la mala energía, fuera del café.', points: [
      { en: 'There’s always someone having a worse day than you.', es: 'Siempre hay alguien que está teniendo un día peor que tú.' },
    ] },
    { en: 'Greet every customer with a smile (even grumpy ones like Aron).', es: 'Recibe a cada cliente con una sonrisa (incluso a los gruñones como Aron).' },
    { en: 'You can always do your job better. Perfect doesn’t exist.', es: 'Siempre puedes hacer tu trabajo mejor. La perfección no existe.' },
    { en: 'Upskill during and outside of working hours: for example, learning English or Spanish.',
      es: 'Sigue aprendiendo dentro y fuera del horario de trabajo: por ejemplo, inglés o español.' },
    { en: 'No cursing allowed (for Aron mainly).', es: 'Prohibido decir palabrotas (sobre todo para Aron).' },
    { en: 'Never take anything for granted (for example, Aron’s first job was for 3 euros an hour).',
      es: 'Nunca des nada por sentado (por ejemplo, el primer trabajo de Aron fue por 3 euros la hora).' },
  ],
  words: [
    { en: 'Horrible', es: 'Horrible' },
    { en: 'Stupido', es: 'Estúpido' },
  ],
}
