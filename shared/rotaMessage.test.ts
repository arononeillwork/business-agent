import { describe, expect, it } from 'vitest'
import { rotaMessage, whatsappShareLink } from './rotaMessage'

const words = { heading: 'Easy Beans Coffee: the rota for 7–13 Dec', nobody: 'Nobody on', footer: 'See it any time in the app: https://app.test/rota' }

describe('the rota for the team’s WhatsApp group', () => {
  it('a line a day, earliest first, a day with nobody on, and the link back to the app', () => {
    const text = rotaMessage([
      { label: 'Mon 7', shifts: [{ who: 'Maria', from: '10:00', to: '15:00' }, { who: 'Julio', from: '07:45', to: '15:00' }] },
      { label: 'Tue 8', shifts: [] },
      { label: 'Sun 13', shifts: [{ who: 'Open shift', from: '09:00', to: '16:00' }] },
    ], words)
    expect(text).toBe([
      '*Easy Beans Coffee: the rota for 7–13 Dec*',
      '',
      '*Mon 7*: Julio 07:45–15:00, Maria 10:00–15:00',
      '*Tue 8*: Nobody on',
      '*Sun 13*: Open shift 09:00–16:00',
      '',
      'See it any time in the app: https://app.test/rota',
    ].join('\n'))
  })

  it('shares through WhatsApp’s own link, the message encoded', () => {
    expect(whatsappShareLink('*Mon 7*: Julio 07:45–15:00\nhttps://app.test/rota?x=1&y=2'))
      .toBe('https://wa.me/?text=*Mon%207*%3A%20Julio%2007%3A45%E2%80%9315%3A00%0Ahttps%3A%2F%2Fapp.test%2Frota%3Fx%3D1%26y%3D2')
  })
})
