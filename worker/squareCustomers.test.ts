import { describe, expect, it } from 'vitest'
import { fromSquare, instagramOf, plan } from './squareCustomers'

describe('Square customers made for people who post about the café on Instagram', () => {
  const rep = { id: 'SQR1', given_name: '_natashapm', nickname: '@_natashapm', reference_id: 'rep:r-1',
    note: 'Posts about the café on Instagram (@_natashapm). Their credit: pay with "Gift card on file".' }

  it('come in from Instagram, with their Instagram name', () => {
    expect(fromSquare(rep)).toMatchObject({ square_id: 'SQR1', source: 'instagram', instagram: '_natashapm', first_name: '_natashapm' })
    // Everyone else Square has is from Square.
    expect(fromSquare({ id: 'SQC1', given_name: 'Tom', nickname: 'Tommy' })).toMatchObject({ source: 'square', instagram: null })
  })

  it('reads the name from the nickname, or from the note when that’s all there is', () => {
    expect(instagramOf({ nickname: '@casa.social', reference_id: 'rep:r-2' })).toBe('casa.social')
    expect(instagramOf({ note: 'Posts about the café on Instagram (@nahia.2.0). Their credit: pay with "Gift card on file".' })).toBe('nahia.2.0')
    // A nickname that isn't an Instagram name, and a note that doesn't say so: nothing.
    expect(instagramOf({ nickname: '@not a name', reference_id: 'rep:r-3' })).toBeNull()
    expect(instagramOf({ nickname: 'Tommy', note: 'Likes oat milk' })).toBeNull()
  })

  it('puts right the ones already here as from Square, and leaves where anyone else came from alone', () => {
    const existing = [
      { id: 'c-1', square_id: 'SQR1', source: 'square' as const, instagram: null, first_name: '_natashapm', last_name: null, email: null, phone: null,
        company: null, birthday: null, notes: rep.note },
      { id: 'c-2', square_id: 'SQR2', source: 'walk_in' as const, instagram: null, first_name: 'Ola', last_name: null, email: null, phone: null,
        company: null, birthday: null, notes: null },
    ]
    const { add, fill } = plan([fromSquare(rep)!, fromSquare({ ...rep, id: 'SQR2', given_name: 'Ola' })!], existing)
    expect(add).toEqual([])
    expect(fill).toEqual([
      { id: 'c-1', patch: { source: 'instagram', instagram: '_natashapm' } },
      // Typed here as a walk-in: it stays one, with the gaps filled (the Instagram name and Square's note).
      { id: 'c-2', patch: { instagram: '_natashapm', notes: rep.note } },
    ])
  })
})
