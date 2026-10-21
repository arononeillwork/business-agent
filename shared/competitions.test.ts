import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RULES, basesLegales, cleanHandle, draw, entriesFromCsv, entryProblems, newEntries, parseComments, phaseOf, plusDays, spanishMoments, suggest,
  type Competition, type SuggestInput,
} from './competitions'

const TODAY = '2026-10-21' // a Wednesday
const business = { name: 'Easy Beans Coffee', instagram: '@easybeanscoffee' }

const base: Pick<Competition, 'name' | 'kind' | 'channels' | 'starts_on' | 'ends_on' | 'draw_on' | 'prize' | 'prize_value' | 'winners' | 'reserves' | 'how_to_enter' | 'rules'> = {
  name: 'Sorteo de Navidad', kind: 'instagram_giveaway', channels: ['instagram'], starts_on: '2026-12-01', ends_on: '2026-12-20', draw_on: '2026-12-21',
  prize: 'Una cesta de café', prize_value: 45, winners: 1, reserves: 2, how_to_enter: ['Sigue a @easybeanscoffee', 'Comenta con quién vendrías'], rules: DEFAULT_RULES,
}

/** Four weeks of takings, every day €800 except Mondays (€400). */
const takings = Array.from({ length: 28 }, (_, i) => {
  const date = plusDays('2026-09-21', i) // 21 Sep 2026 is a Monday
  return { date, gross: i % 7 === 0 ? 400 : 800 }
})

describe('competitions: ideas', () => {
  it('the Spanish moments come round in order, with the moving ones worked out', () => {
    const m = spanishMoments(TODAY)
    expect(m[0]).toMatchObject({ key: 'halloween', date: '2026-10-31' })
    expect(m.find(x => x.key === 'blackfriday')!.date).toBe('2026-11-27') // the day after the 4th Thursday
    expect(m.find(x => x.key === 'madre')!.date).toBe('2027-05-02') // the first Sunday in May
    expect(m.map(x => x.date)).toEqual([...m.map(x => x.date)].sort())
  })

  it('suggests from the calendar, the quiet day, a big match and the stock, best first', () => {
    const input: SuggestInput = {
      today: TODAY, business, takings, consenting: 12, followers: 640,
      events: [{ starts_on: '2026-11-08', title: 'Mercadillo navideño', category: 'local' }, { starts_on: '2026-10-25', title: 'Closed for painting', category: 'closure' }],
      bigMatches: [{ starts_at: '2026-11-01T20:00:00Z', title: 'Real Madrid – Barcelona' }],
      stock: [
        { id: 'mug', name: 'Easy Beans mug', retail: true, active: true, on_hand: 12, par_level: 4, cost_per_unit: 4, sell_price: 12 },
        { id: 'beans', name: 'Beans 1 kg', retail: true, active: true, on_hand: 3, par_level: 6, cost_per_unit: 14, sell_price: 24 }, // below par
        { id: 'milk', name: 'Milk', retail: false, active: true, on_hand: 40, par_level: 10, cost_per_unit: 1, sell_price: null }, // not for sale
      ],
      newestDrink: 'Iced pumpkin latte',
    }
    const ideas = suggest(input)
    expect(ideas.map(i => i.score)).toEqual([...ideas.map(i => i.score)].sort((a, b) => b - a))
    const keys = ideas.map(i => i.key)
    expect(keys).toEqual(expect.arrayContaining(['moment-halloween-2026', 'moment-blackfriday-2026', 'event-2026-11-08', 'quiet-0', 'match-2026-11-01', 'signup-2026-11-15', 'photo-2026-10', 'name-Iced pumpkin latte']))
    expect(keys).not.toContain('event-2026-10-25') // a closure isn't a fiesta
    expect(keys.slice(0, 2)).toEqual(['quiet-0', 'moment-halloween-2026']) // Mondays take half: that comes first

    const halloween = ideas.find(i => i.key === 'moment-halloween-2026')!
    expect(halloween).toMatchObject({ starts_on: TODAY, ends_on: '2026-10-29', draw_on: '2026-10-30', prize_item_id: 'mug', prize_value: 12, channels: ['instagram'] })
    expect(halloween.caption_es).toContain('@easybeanscoffee')
    expect(halloween.caption_es).toContain('no patrocinada ni gestionada por Instagram')
    expect(halloween.how_to_enter).toHaveLength(halloween.how_to_enter_es.length)

    const blackFriday = ideas.find(i => i.key === 'moment-blackfriday-2026')!
    expect(blackFriday).toMatchObject({ starts_on: '2026-11-13', ends_on: '2026-11-25', draw_on: '2026-11-26' })

    const quiet = ideas.find(i => i.key === 'quiet-0')!
    expect(quiet.why.vars).toMatchObject({ day: 'Mondays', percent: 46 }) // 400 against a mean of 742.86
    expect(quiet.starts_on).toBe('2026-10-26') // the next Monday
    expect(quiet.how_to_enter_es[0]).toContain('los lunes')
  })

  it('a gift card when nothing in the shop is spare; nothing twice; few days of takings, no quiet-day idea', () => {
    const ideas = suggest({
      today: TODAY, business, takings: takings.slice(0, 10),
      existing: [{ kind: 'instagram_giveaway', status: 'live', starts_on: '2026-10-15', ends_on: '2026-10-30', name: 'Halloween' }],
    })
    const keys = ideas.map(i => i.key)
    expect(keys).not.toContain('moment-halloween-2026')
    expect(keys).toContain('moment-blackfriday-2026')
    expect(keys.some(k => k.startsWith('quiet'))).toBe(false)
    expect(ideas.find(i => i.key === 'signup-2026-11-15')!.prize).toEqual({ text: 'A {amount} gift card', vars: { amount: 10 } })
  })
})

describe('competitions: the rules', () => {
  it('flags a review asked for to enter, Facebook shares, the Meta line and prizes over €300', () => {
    const texts = (c: Partial<typeof base>) => entryProblems({ ...base, ...c }).map(p => p.text)
    expect(texts({ how_to_enter: ['Leave us a Google review', 'Comment'] })[0]).toMatch(/Don’t ask for a review/)
    expect(texts({ how_to_enter: ['Déjanos una reseña en Google'] }).some(t => /review/.test(t))).toBe(true)
    expect(texts({}).some(t => /review/.test(t))).toBe(false)
    expect(texts({ channels: ['facebook'], how_to_enter: ['Share this post'] }).some(t => /On Facebook/.test(t))).toBe(true)
    expect(texts({ channels: ['instagram'], how_to_enter: ['Share this post'] }).some(t => /On Facebook/.test(t))).toBe(false)
    expect(texts({}).some(t => /Meta asks/.test(t))).toBe(true)
    expect(texts({ channels: ['in_cafe'], kind: 'in_cafe' }).some(t => /Meta asks/.test(t))).toBe(false)
    expect(texts({ prize_value: 300 }).some(t => /€300/.test(t))).toBe(false)
    expect(texts({ prize_value: 300.01 }).some(t => /modelos 111 and 190/.test(t))).toBe(true)
    expect(texts({ rules: { ...DEFAULT_RULES, min_age: 12 } }).some(t => /Under 14s/.test(t))).toBe(true)
    expect(texts({ draw_on: '2026-12-19' })).toContain('The draw is before entries close.')
    expect(texts({ ends_on: null })).toContain('Set the day entries close.')
    expect(texts({ how_to_enter: ['  '] })).toContain('Say how people enter.')
  })

  it('bases legales: the organiser and its CIF, Meta only on Instagram or Facebook, tax only over €300', () => {
    const b = { name: 'Easy Beans Coffee S.L.', tax_id: 'B12345678', address: 'Calle Marqués del Duero 1, San Pedro de Alcántara', email: 'hola@easybeans.es' }
    const ig = basesLegales(base, b)
    expect(ig).toMatch(/^BASES LEGALES DE LA PROMOCIÓN «Sorteo de Navidad»/)
    expect(ig).toContain('Easy Beans Coffee S.L., con CIF/NIF B12345678 y domicilio en Calle Marqués del Duero 1')
    expect(ig).toContain('a través de Instagram')
    expect(ig).toContain('empieza el 01/12/2026 y se puede participar hasta el 20/12/2026')
    expect(ig).toContain('1. Sigue a @easybeanscoffee\n2. Comenta con quién vendrías')
    expect(ig).toContain('un (1) ganador y 2 suplentes')
    expect(ig).toContain('45 € (IVA incluido)')
    expect(ig).toContain('hola@easybeans.es')
    expect(ig).toContain('8. Instagram y Facebook\nEsta promoción no está patrocinada')
    expect(ig).not.toContain('Fiscalidad')
    expect(ig).toContain('9. Aceptación de las bases')

    const cafe = basesLegales({ ...base, channels: ['in_cafe'], kind: 'in_cafe', prize_value: 450 }, { name: 'Easy Beans Coffee' })
    expect(cafe).not.toContain('Instagram')
    expect(cafe).toContain('8. Fiscalidad')
    expect(cafe).toContain('modelos 111 y 190')
    expect(cafe).toContain('9. Aceptación de las bases')
    expect(cafe).toContain('[email del Organizador]')

    const judged = basesLegales({ ...base, kind: 'photo_contest', prize_value: 301 }, b)
    expect(judged).toContain('El ganador se elegirá el 21/12/2026')
    expect(judged).toContain('9. Fiscalidad')
    expect(judged).toContain('10. Aceptación de las bases')
  })
})

describe('competitions: entries and the draw', () => {
  it('reads who commented from what Instagram copies, not who they tagged', () => {
    const pasted = [
      'easybeanscoffee', 'Author', '🎁 ¡Sorteo! Comenta con quién vendrías',
      'ana.lopez', '2d', '@pepe_g vamos!!', 'Reply',
      'Pepe_G', '1 d', 'Me encanta 😍 @maria.r', 'Responder', 'See translation',
      '@carla_92', 'luis.m: yo quiero', 'marta • 3 h', '12 likes', 'ana.lopez', '2d', 'otra vez yo',
    ].join('\n')
    expect(parseComments(pasted, '@easybeanscoffee')).toEqual(['ana.lopez', 'pepe_g', 'carla_92', 'luis.m', 'marta'])
  })

  it('cleans a username from @, a link or capitals; refuses what can’t be one', () => {
    expect(cleanHandle(' @Ana.Lopez ')).toBe('ana.lopez')
    expect(cleanHandle('https://www.instagram.com/ana.lopez/')).toBe('ana.lopez')
    expect(cleanHandle('ana lopez')).toBeNull()
    expect(cleanHandle('.ana')).toBeNull()
    expect(cleanHandle('')).toBeNull()
  })

  it('skips who is already in, by username or email, and empty rows', () => {
    const { fresh, skipped } = newEntries([{ handle: 'ana.lopez', email: null }, { handle: null, email: 'pepe@example.com' }], [
      { handle: '@ANA.LOPEZ' }, { email: 'Pepe@Example.com ', name: 'Pepe' }, { handle: 'carla_92' }, { handle: 'carla_92' }, { name: '  ' }, { name: 'Luis', phone: '+34 600 000 000' },
    ])
    expect(fresh.map(e => e.handle ?? e.name)).toEqual(['carla_92', 'Luis'])
    expect(skipped).toBe(4)
  })

  it('reads a sign-up list from a CSV by its headings', () => {
    const csv = '\uFEFFNombre;Apellidos;Correo electrónico;Teléfono;Instagram\nRocío;Martín;Rocio@Example.es;600 111 222;@rocio.m\nTom;;not an email;;\n;;;;\n'
    expect(entriesFromCsv(csv)).toEqual([
      { name: 'Rocío Martín', email: 'rocio@example.es', phone: '+34 600 111 222', handle: 'rocio.m', source: 'csv' },
      { name: 'Tom', email: null, phone: null, handle: null, source: 'csv' },
    ])
    expect(entriesFromCsv('Colour,Size\nred,M')).toBeNull()
  })

  it('draws winners then reserves from the valid entries only, each once', () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({ id: `e${i}`, valid: i !== 3 }))
    let seed = 7
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const picked = draw(entries, 1, 2, random)
    expect(picked.map(p => p.rank)).toEqual([1, 2, 3])
    expect(new Set(picked.map(p => p.id)).size).toBe(3)
    expect(picked.some(p => p.id === 'e3')).toBe(false)
    expect(draw(entries.slice(0, 2), 3, 2)).toHaveLength(2) // fewer entries than places
    const wins = new Map<string, number>()
    for (let i = 0; i < 3000; i++) { const w = draw(entries, 1, 0)[0].id; wins.set(w, (wins.get(w) ?? 0) + 1) }
    expect(wins.size).toBe(9)
    for (const n of wins.values()) expect(n).toBeGreaterThan(200) // about 333 each
  })

  it('live between its days, then waiting for its draw', () => {
    expect(phaseOf({ status: 'live', starts_on: '2026-10-01', ends_on: '2026-10-31' }, TODAY)).toBe('live')
    expect(phaseOf({ status: 'scheduled', starts_on: '2026-11-01', ends_on: '2026-11-30' }, TODAY)).toBe('upcoming')
    expect(phaseOf({ status: 'live', starts_on: '2026-10-01', ends_on: '2026-10-20' }, TODAY)).toBe('to_draw')
    expect(phaseOf({ status: 'drawn', starts_on: null, ends_on: null }, TODAY)).toBe('drawn')
    expect(phaseOf({ status: 'draft', starts_on: '2026-10-01', ends_on: null }, TODAY)).toBe('draft')
  })
})
