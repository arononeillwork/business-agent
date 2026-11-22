import { describe, expect, it } from 'vitest'
import { cleanProspect, cleanWebsite, followUpDue, lanes, nameFromHandle, prospectError, readContact, type Prospect, type SalesBoard } from './salesTeam'

describe('a contact pasted into one box', () => {
  it('an Instagram link or @name is their Instagram name', () => {
    expect(readContact('https://www.instagram.com/the_bootes_cafe/')).toEqual({ kind: 'instagram', value: 'the_bootes_cafe' })
    expect(readContact(' https://www.instagram.com/Roasted.Spain/?hl=en ')).toEqual({ kind: 'instagram', value: 'roasted.spain' })
    expect(readContact('instagram.com/santaroaster?igsh=abc123')).toEqual({ kind: 'instagram', value: 'santaroaster' })
    expect(readContact('https://m.instagram.com/kekimarbella')).toEqual({ kind: 'instagram', value: 'kekimarbella' })
    expect(readContact('@KekiMarbella')).toEqual({ kind: 'instagram', value: 'kekimarbella' })
  })

  it('a phone number, kept the usual way (Spanish when there’s no country code)', () => {
    expect(readContact('600 111 222')).toEqual({ kind: 'phone', value: '+34 600 111 222' })
    expect(readContact('+34600111222')).toEqual({ kind: 'phone', value: '+34 600 111 222' })
    expect(readContact('0044 7700 900123')).toEqual({ kind: 'phone', value: '+44 7700 900123' })
  })

  it('an email or a website', () => {
    expect(readContact('Hola@CafeLola.es')).toEqual({ kind: 'email', value: 'hola@cafelola.es' })
    expect(readContact('cafelola.es')).toEqual({ kind: 'website', value: 'https://cafelola.es' })
    expect(readContact('https://www.cafelola.es/carta')).toEqual({ kind: 'website', value: 'https://www.cafelola.es/carta' })
  })

  it('anything else is nothing (taken as the name)', () => {
    expect(readContact('Café Lola')).toBeNull()
    expect(readContact('')).toBeNull()
    expect(readContact('123')).toBeNull()
    expect(readContact('https://www.instagram.com/')).toBeNull()
  })
})

describe('names to start from', () => {
  it('come from the Instagram name', () => {
    expect(nameFromHandle('the_bootes_cafe')).toBe('The Bootes Cafe')
    expect(nameFromHandle('roasted.spain')).toBe('Roasted Spain')
    expect(nameFromHandle('kekimarbella')).toBe('Kekimarbella')
  })
  it('a website isn’t Instagram’s', () => {
    expect(cleanWebsite('instagram.com/x')).toBeNull()
    expect(cleanWebsite('not a site')).toBeNull()
  })
})

describe('what’s sent for a business', () => {
  it('is tidied, with a name from its Instagram when none is given', () => {
    expect(cleanProspect({ instagram: 'https://www.instagram.com/the_bootes_cafe/', member_id: '0b0e2f6c-1111-4c2d-8e3f-123456789abc' }, true)).toEqual({
      row: { instagram: 'the_bootes_cafe', name: 'The Bootes Cafe', stage: 'to_contact', kind: 'customer', member_id: '0b0e2f6c-1111-4c2d-8e3f-123456789abc' },
    })
    expect(cleanProspect({ name: ' Café Lola ', phone: '600111222', email: 'HOLA@lola.es', stage: 'demo' }, true)).toEqual({
      row: { name: 'Café Lola', phone: '+34 600 111 222', email: 'hola@lola.es', stage: 'demo', kind: 'customer' },
    })
  })

  it('a change sends only what changed', () => {
    expect(cleanProspect({ stage: 'won' }, false)).toEqual({ row: { stage: 'won' } })
    expect(cleanProspect({ kind: 'partner' }, false)).toEqual({ row: { kind: 'partner' } })
    expect(cleanProspect({ kind: 'supplier' }, false)).toEqual({ error: 'A contact is a customer or a partner' })
    expect(cleanProspect({ member_id: null, follow_up_on: '' }, false)).toEqual({ row: { member_id: null, follow_up_on: null } })
    expect(cleanProspect({ instagram: '' }, false)).toEqual({ row: { instagram: null } })
  })

  it('says what isn’t right', () => {
    expect(cleanProspect({ name: 'X' }, true)).toEqual({ error: 'Add a way to reach them: Instagram, a phone number, an email or a website' })
    expect(cleanProspect({ phone: '12' }, true)).toEqual({ error: 'That isn’t a phone number' })
    expect(cleanProspect({ instagram: 'https://tiktok.com/@x y' }, true)).toEqual({ error: 'That isn’t an Instagram link or name' })
    expect(cleanProspect({ email: 'nope' }, true)).toEqual({ error: 'That isn’t an email address' })
    expect(cleanProspect({ name: 'X', phone: '600111222', stage: 'maybe' }, true)).toEqual({ error: 'That isn’t a stage on the board' })
    expect(cleanProspect({ member_id: 'maria' }, false)).toEqual({ error: 'Choose someone on the sales team' })
    expect(cleanProspect({ follow_up_on: 'tomorrow' }, false)).toEqual({ error: 'That isn’t a date' })
    expect(cleanProspect({ phone: '600111222' }, true)).toEqual({ error: 'Give the business a name, or its Instagram' })
  })

  it('the database’s refusals in plain words', () => {
    expect(prospectError('duplicate key value violates unique constraint "sales_prospects_instagram_key"')).toBe('That Instagram is on the board already')
    expect(prospectError('duplicate key value violates unique constraint "sales_team_name_key"')).toBe('Someone on the sales team has that name already')
  })
})

describe('the board', () => {
  const p = (id: string, member_id: string | null, stage: Prospect['stage'], updated_at = '2026-11-20T10:00:00Z'): Prospect => ({
    id, member_id, name: id, stage, instagram: null, phone: null, email: null, website: null, town: null, notes: null, follow_up_on: null,
    created_at: '2026-11-20T10:00:00Z', updated_at,
  })
  const board: SalesBoard = {
    team: [{ id: 'j', name: 'Julio Cesar', position: 2 }, { id: 'm', name: 'Maria Cortes', position: 1 }],
    prospects: [p('a', 'm', 'to_contact'), p('b', 'm', 'to_contact', '2026-11-21T10:00:00Z'), p('c', 'j', 'demo'), p('d', 'gone', 'won')],
  }

  it('a lane per salesperson in order, the latest moved first, then nobody’s', () => {
    const rows = lanes(board)
    expect(rows.map(l => l.member?.name ?? null)).toEqual(['Maria Cortes', 'Julio Cesar', null])
    expect(rows[0].byStage.to_contact.map(x => x.id)).toEqual(['b', 'a'])
    expect(rows[1].byStage.demo.map(x => x.id)).toEqual(['c'])
    expect(rows[2].byStage.won.map(x => x.id)).toEqual(['d'])
  })

  it('no lane for nobody when everyone’s is someone’s', () => {
    expect(lanes({ ...board, prospects: board.prospects.slice(0, 3) }).map(l => l.member?.name)).toEqual(['Maria Cortes', 'Julio Cesar'])
  })

  it('a follow-up due while they’re still being talked to', () => {
    expect(followUpDue({ ...p('x', 'm', 'contacted'), follow_up_on: '2026-11-22' }, '2026-11-22')).toBe(true)
    expect(followUpDue({ ...p('x', 'm', 'contacted'), follow_up_on: '2026-11-23' }, '2026-11-22')).toBe(false)
    expect(followUpDue({ ...p('x', 'm', 'won'), follow_up_on: '2026-11-01' }, '2026-11-22')).toBe(false)
  })
})
