// Easy Beans' own roles and staff rules are saved text, shown in the app's language with tk(): each one
// needs its Spanish (src/i18n/es/easyBeansHandbook.ts), or it stays in English when someone switches.
import { describe, expect, it } from 'vitest'
import { spanish } from './es'
import { EASY_BEANS_ROLES, EASY_BEANS_RULES } from '../data/easyBeansHandbook'
import { ROLE_PRESETS } from '../../shared/roles'

describe('Spanish for saved roles and rules', () => {
  it('has every one of Easy Beans’ own roles and staff rules', () => {
    const texts = [
      ...EASY_BEANS_ROLES.flatMap(r => [r.name, r.summary, ...r.core, ...r.also]),
      ...EASY_BEANS_RULES.flatMap(s => [s.title, s.intro, ...s.rules]),
    ].filter((x): x is string => !!x)
    expect(texts.filter(x => !(x in spanish))).toEqual([])
  })

  it('has the ready-made roles as they’re saved, the adviser filled in', () => {
    const filled = ROLE_PRESETS.flatMap(p => p.duties.map(d => d.text)).filter(x => x.includes('{adviser}'))
      .flatMap(x => ['gestoría', 'accountant'].map(adviser => x.replace('{adviser}', adviser)))
    expect(filled.filter(x => !(x in spanish))).toEqual([])
  })
})
