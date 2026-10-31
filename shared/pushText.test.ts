import { describe, expect, it } from 'vitest'
import { languageOf, pushText } from './pushText'

const holiday = { title: 'Bank holiday tomorrow: Día de Andalucía', body: 'x', kind: 'bank_holiday' as const,
  data: { event: 'e', date: '2027-02-28', days: 1, name: 'Día de Andalucía', category: 'regional', town: null } }

describe('push notifications in each person’s language', () => {
  it('follows the language they read the app in, else the team’s', () => {
    expect(languageOf({ languages: ['en', 'es'], language: 'es' })).toBe('es')
    expect(languageOf({ language: 'es' }, ['en'])).toBe('en')
    expect(languageOf({}, ['es'])).toBe('es')
    expect(languageOf(null)).toBe('en')
  })

  it('says a holiday reminder in English or Spanish', () => {
    expect(pushText(holiday, 'en')).toEqual({ title: 'Bank holiday tomorrow: Día de Andalucía',
      body: 'Sunday 28 February · Andalucía holiday. Check the rota and the opening hours.' })
    expect(pushText(holiday, 'es')).toEqual({ title: 'Festivo mañana: Día de Andalucía',
      body: 'domingo, 28 de febrero · Festivo de Andalucía. Revisa los turnos y el horario.' })
    expect(pushText({ ...holiday, data: { ...holiday.data, days: 7, category: 'local', town: 'Marbella' } }, 'es').title).toBe('Festivo dentro de 7 días: Día de Andalucía')
  })

  it('translates mentions and tests, and leaves other text as written', () => {
    expect(pushText({ title: '@cafe tagged you in a post', body: 'Hola', kind: 'instagram_mention' }, 'es')).toEqual({ title: '@cafe te ha etiquetado en una publicación', body: 'Hola' })
    expect(pushText({ title: 'Test notification', body: 'x', kind: 'test' }, 'es').title).toBe('Notificación de prueba')
    expect(pushText({ title: 'SGAE runs out on 01/02/2027', body: null, kind: null }, 'es')).toEqual({ title: 'SGAE runs out on 01/02/2027', body: null })
  })
})
