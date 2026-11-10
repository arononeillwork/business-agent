import { describe, expect, it } from 'vitest'
import { languageOf, pushText } from './pushText'

const holiday = { title: 'Bank holiday tomorrow: Día de Andalucía', body: 'x', kind: 'bank_holiday' as const,
  data: { event: 'e', date: '2027-02-28', days: 1, name: 'Día de Andalucía', category: 'regional', town: 'Andalucía' } }

describe('push notifications in each person’s language', () => {
  it('follows the language they read the app in, else the team’s', () => {
    expect(languageOf({ languages: ['en', 'es'], language: 'es' })).toBe('es')
    expect(languageOf({ language: 'es' }, ['en'])).toBe('en')
    expect(languageOf({}, ['es'])).toBe('es')
    expect(languageOf(null)).toBe('en')
  })

  it('says a holiday reminder in English or Spanish', () => {
    expect(pushText(holiday, 'en')).toEqual({ title: 'Bank holiday tomorrow: Día de Andalucía',
      body: 'Sunday 28 February · Regional holiday (Andalucía). Check the rota and the opening hours.' })
    expect(pushText(holiday, 'es')).toEqual({ title: 'Festivo mañana: Día de Andalucía',
      body: 'domingo, 28 de febrero · Festivo autonómico (Andalucía). Revisa los turnos y el horario.' })
    expect(pushText({ ...holiday, data: { ...holiday.data, days: 7, category: 'local', town: 'Marbella' } }, 'es').title).toBe('Festivo dentro de 7 días: Día de Andalucía')
  })

  it('says the reminder to add a town’s local holidays in English or Spanish', () => {
    const note = { title: 'Add Marbella’s local holidays for 2027', body: 'x', kind: 'town_holidays' as const, data: { year: 2027, town: 'Marbella' } }
    expect(pushText(note, 'en')).toEqual({ title: 'Add Marbella’s local holidays for 2027',
      body: 'Its town hall sets two days off each year. Add them so the rota and holiday pay know them.' })
    expect(pushText(note, 'es')).toEqual({ title: 'Añade las fiestas locales de Marbella de 2027',
      body: 'Su ayuntamiento fija dos festivos cada año. Añádelos para que los turnos y la paga de los festivos los tengan en cuenta.' })
  })

  it('translates mentions and tests, and leaves other text as written', () => {
    expect(pushText({ title: '@cafe tagged you in a post', body: 'Hola', kind: 'instagram_mention' }, 'es')).toEqual({ title: '@cafe te ha etiquetado en una publicación', body: 'Hola' })
    expect(pushText({ title: '@nora.eats posted a reel with you', body: null, kind: 'instagram_mention' }, 'es')).toEqual({ title: '@nora.eats ha publicado un reel contigo', body: null })
    expect(pushText({ title: 'Post cashback for Nora: €14.66 to approve', body: null }, 'es').title).toMatch(/^Cashback por publicación para Nora: 14,66\s?€ por aprobar$/)
    expect(pushText({ title: '@nora.eats posted about the café: waiting for your OK as a rep', body: null }, 'es'))
      .toEqual({ title: '@nora.eats ha publicado sobre la cafetería: espera tu OK como comercial', body: null })
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
    expect(es('On offer till closing: Butter croissants', '9 left on their last day, €1,96 until 15:00. Square isn’t changed: take the offer price at the till.'))
      .toEqual({ title: 'En oferta hasta el cierre: Butter croissants', body: 'Quedan 9 en su último día, a 1,96 € hasta las 15:00. Square no cambia: cóbralo al precio de la oferta.' })
    expect(es('Your tips: 12.50 €').title).toBe('Tus propinas: 12,50 €')
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

  it('writes amounts and readings with the person’s decimal mark, whatever the language', () => {
    const say = (title: string, lang: 'en' | 'es', numbers: 'comma' | 'point', body: string | null = null) => pushText({ title, body, kind: null }, lang, numbers)
    const offer = '1.5 left on their last day, €1.96 until 15:00. Square isn’t changed: take the offer price at the till.'
    // An Irish business (the point, as it has before anyone chooses), in English or Spanish.
    expect(say('Expense to approve: Julio, 15.00 €', 'en', 'point').title).toBe('Expense to approve: Julio, €15.00')
    expect(say('Expense to approve: Julio, 15.00 €', 'es', 'point').title).toBe('Gasto por aprobar: Julio, €15.00')
    expect(say('Bonus for Marta: €25.00 to approve', 'en', 'point').title).toBe('Bonus for Marta: €25.00 to approve')
    expect(say('Bonus for Marta: €25.00 to approve', 'es', 'point').title).toBe('Bonus para Marta: €25.00 por aprobar')
    expect(say('Out of range: Fridge 1 8.4 °C', 'en', 'point').title).toBe('Out of range: Fridge 1 8.4 °C')
    expect(say('On offer till closing: Scones', 'en', 'point', offer).body).toBe(offer)
    expect(say('Expense approved: Taxi', 'en', 'point', '15.00 €')).toEqual({ title: 'Expense approved: Taxi', body: '€15.00' })
    // A tip pool's share, and an offer's price however it was saved (Spain's "€1,96" too); a set price as written.
    expect(say('Your tips: 12.50 €', 'en', 'point').title).toBe('Your tips: €12.50')
    expect(say('On offer till closing: Scones', 'en', 'point', offer.replace('€1.96', '€1,96')).body).toBe(offer)
    expect(say('On offer till closing: Scones', 'en', 'point', offer.replace('€1.96', '2 for €3')).body).toBe(offer.replace('€1.96', '2 for €3'))
    expect(say('Expense approved: Taxi', 'es', 'comma', '15.00 €').body).toBe('15,00 €')
    // A Spanish business keeps its comma, read in English too.
    expect(say('Expense to approve: Julio, 15.00 €', 'en', 'comma').title).toBe('Expense to approve: Julio, 15,00 €')
    expect(say('Bonus for Marta: €1234.50 to approve', 'en', 'comma').title).toBe('Bonus for Marta: 1.234,50 € to approve')
    expect(say('Out of range: Nevera 1 -3.0 °C', 'en', 'comma').title).toBe('Out of range: Nevera 1 -3,0 °C')
    expect(say('Your tips: 12.50 €', 'en', 'comma').title).toBe('Your tips: 12,50 €')
    expect(say('On offer till closing: Scones', 'en', 'comma', offer).body).toBe(offer.replace('1.5', '1,5').replace('€1.96', '1,96 €'))
    expect(say('On offer till closing: Scones', 'es', 'comma', offer.replace('€1.96', '€1,96')).body)
      .toBe('Quedan 1,5 en su último día, a 1,96 € hasta las 15:00. Square no cambia: cóbralo al precio de la oferta.')
    // Text without numbers stays as written in English.
    expect(say('Follow up: Boda de Ana', 'en', 'comma').title).toBe('Follow up: Boda de Ana')
  })

  it('says an error alert to HQ’s admins (the app_errors migration) in Spanish, the error’s own message as it was', () => {
    const es = (title: string, body: string | null = null) => pushText({ title, body, kind: null }, 'es')
    const body = 'In cron: outbox. The details are on Businesses, under Errors.'
    expect(es('New error: Square stopped working', body)).toEqual({ title: 'Error nuevo: Square stopped working',
      body: 'En cron: outbox. Los detalles están en Negocios, en Errores.' })
    expect(es('An error is back: Cannot read properties of undefined (reading \'x\')').title)
      .toBe('Ha vuelto un error: Cannot read properties of undefined (reading \'x\')')
    expect(pushText({ title: 'New error: Square stopped working', body, kind: null }, 'en')).toEqual({ title: 'New error: Square stopped working', body })
  })
})
