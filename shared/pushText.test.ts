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
    expect(pushText({ title: 'Tasting night', body: 'Bring friends', kind: null }, 'es')).toEqual({ title: 'Tasting night', body: 'Bring friends' })
  })

  it('says every kind of alert the database and the Worker write in Spanish', () => {
    const es = (title: string, body: string | null = null) => pushText({ title, body, kind: null }, 'es')
    expect(es('Time to post your reel on Instagram and TikTok').title).toBe('Toca publicar tu reel en Instagram y TikTok')
    expect(es('Time to post your story on social media').title).toBe('Toca publicar tu historia en redes sociales')
    expect(es('Follow up: Boda de Ana').title).toBe('Seguimiento: Boda de Ana')
    expect(es('Expense to approve: Julio, 12.50 €').title).toBe('Gasto por aprobar: Julio, 12,50 €')
    expect(es('Expense paid back: Taxi').title).toBe('Gasto reembolsado: Taxi')
    expect(es('Time to send: Black Friday').title).toBe('Toca enviar: Black Friday')
    expect(es('On offer till closing: Butter croissants', '9 left on their last day, €1.96 until 15:00. Square isn’t changed: take the offer price at the till.'))
      .toEqual({ title: 'En oferta hasta el cierre: Butter croissants', body: 'Quedan 9 en su último día, a €1.96 hasta las 15:00. Square no cambia: cóbralo al precio de la oferta.' })
    expect(es('Out of range: Nevera 1 8.4 °C').title).toBe('Fuera de rango: Nevera 1 8,4 °C')
    expect(es('SGAE runs out on 01/02/2027', 'It renews by itself: check it went through.'))
      .toEqual({ title: 'SGAE caduca el 01/02/2027', body: 'Se renueva sola: comprueba que se ha hecho.' })
    expect(es('New 2★ review from someone: worth a reply').title).toBe('Nueva reseña de 2★ de alguien: merece respuesta')
    expect(es('New 5★ review from Laura').title).toBe('Nueva reseña de 5★ de Laura')
    expect(es('Café Sol has closed for good, says Google').title).toBe('Café Sol ha cerrado definitivamente, según Google')
    expect(es('3 new places on Google nearby').title).toBe('3 sitios nuevos en Google cerca')
    expect(es('Bonus for Marta: €25.00 to approve').title).toBe('Bonus para Marta: 25,00 € por aprobar')
    expect(es('Square stopped working').title).toBe('Square ha dejado de funcionar')
    expect(es('Real Madrid – Barça', 'Coming up Sat 07 Nov, 21:00. You asked to be reminded.').body)
      .toBe('Se acerca: sáb 7 nov, 21:00. Pediste que te avisáramos.')
    // Someone's own words stay as they are, and English stays English.
    expect(es('Real Madrid – Barça').title).toBe('Real Madrid – Barça')
    expect(pushText({ title: 'Follow up: Boda de Ana', body: null, kind: null }, 'en').title).toBe('Follow up: Boda de Ana')
  })
})
