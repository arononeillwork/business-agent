import { describe, expect, it } from 'vitest'
import {
  BUSINESS_QUESTIONS, DOCUMENTS, GRANTS, QUESTIONS, cleanAnswers, deadlineOf, documentsFor, evaluate, evaluateAll, knownAnswers, nextStage,
  profileOf, questionMatters, type GrantProfile,
} from './grants'

const TODAY = '2026-10-20'
const grant = (id: string) => GRANTS.find(g => g.id === id)!
// Easy Beans Coffee: an SL in San Pedro de Alcántara (Marbella), three employees.
const known = knownAnswers({ tax_id: 'B12345674', address: 'C. Pizarro, 8, 29670 San Pedro de Alcántara, Málaga', business_type: 'Specialty café, drinks-first, owner-run' }, 3)
const easyBeans = (answers: Partial<GrantProfile> = {}) => profileOf(known, answers)
const status = (id: string, p: GrantProfile, today = TODAY) => evaluate(grant(id), p, today).status

describe('the catalogue', () => {
  it('has only the verified grants, each with an official source and the date it was checked', () => {
    expect(GRANTS.map(g => g.id)).not.toContain('kit-digital')
    expect(GRANTS.map(g => g.id)).not.toContain('inea-empresas')
    for (const g of GRANTS) {
      expect(g.source).toMatch(/^https:\/\//)
      expect(g.checked).toMatch(/^2026-09-2[34]$/)
      for (const d of g.documents) expect(DOCUMENTS[d.id], `${g.id}: ${d.id}`).toBeDefined()
    }
  })
})

describe('what the app knows already', () => {
  it('reads an SL in Marbella, a café, from the business details', () => {
    expect(known).toEqual({ entity: 'sl', province: 'malaga', town: 'large', sector: 'hospitality', employees: 3 })
  })
  it('an autónomo elsewhere in Andalucía, or outside it', () => {
    expect(knownAnswers({ tax_id: '12345678Z', address: 'Calle Sierpes 1, 41004 Sevilla', business_type: 'Shop' }, null))
      .toEqual({ entity: 'autonomo', province: 'andalucia' })
    expect(knownAnswers({ tax_id: null, address: 'Gran Vía 1, 28013 Madrid', business_type: null }, 0)).toEqual({ province: 'outside', employees: 0 })
  })
  it('a small town in Málaga province stays unsure (only the large ones are known)', () => {
    expect(knownAnswers({ tax_id: null, address: 'Plaza de la Constitución 1, 29400 Ronda', business_type: null }, null).town).toBe('large')
    expect(knownAnswers({ tax_id: null, address: 'Calle Real 2, 29360 Montejaque', business_type: null }, null).town).toBeUndefined()
  })
  it('answers someone gave win over what the app worked out', () => {
    expect(easyBeans({ employees: 5 }).employees).toBe(5)
  })
  it('saved answers keep only what the rules know, of the right kind', () => {
    expect(cleanAnswers({ debts: 'no', age: 34, nope: 'x', town: 5, startY: null })).toEqual({ debts: 'no', age: 34, startY: null })
    expect(cleanAnswers('junk')).toEqual({})
  })
})

describe('Easy Beans on 20 Oct 2026', () => {
  it('the Diputación grant and Línea 2 are out: Marbella is a large town, and SL partners are excluded', () => {
    const p = easyBeans({ debts: 'no' })
    expect(status('diputacion-6000', p)).toBe('no')
    expect(status('linea-2', p)).toBe('no')
  })
  it('Talento Joven is open to 31 Dec when hiring an under-30 full-time', () => {
    const x = evaluate(grant('talento-joven'), easyBeans({ debts: 'no', hiring: 'yes', candidate: 'youth' }), TODAY)
    // Their place on the Cámara's programme can only be checked with them.
    expect(x.status).toBe('check')
    expect(deadlineOf(x, TODAY)).toEqual({ kind: 'date', date: '2026-12-31', days: 72 })
    expect(status('talento-joven', easyBeans({ debts: 'no', hiring: 'no' }))).toBe('no')
    expect(status('talento-joven', easyBeans({ debts: 'yes', hiring: 'yes', candidate: 'youth' }))).toBe('no')
  })
  it('grants whose call closed on 30 Sep wait for the next call', () => {
    const p = easyBeans({ debts: 'no', replaceEquip: 'yes' })
    expect(status('equipos-hosteleria', p, '2026-09-30')).toBe('yes')
    const after = evaluate(grant('equipos-hosteleria'), p, TODAY)
    expect(after.status).toBe('next')
    expect(deadlineOf(after, TODAY)).toEqual({ kind: 'closed' })
  })
  it('PYMETUR has no call yet, and FUNDAE is already theirs with employees', () => {
    expect(evaluate(grant('pymetur'), easyBeans(), TODAY)).toMatchObject({ status: 'next' })
    expect(deadlineOf(evaluate(grant('pymetur'), easyBeans(), TODAY), TODAY)).toEqual({ kind: 'not_open' })
    expect(status('fundae', easyBeans())).toBe('active')
    expect(status('fundae', easyBeans({ employees: 0 }))).toBe('no')
  })
  it('Pyme Digital needs the IAE before 2024', () => {
    expect(status('pyme-digital', easyBeans({ startY: 2026, startM: 4 }))).toBe('no')
    expect(status('pyme-digital', easyBeans({ startY: 2019, startM: 4, turnover: 'yes', debts: 'no' }))).toBe('next')
  })
  it('results list what can be applied for first and what doesn’t fit last', () => {
    const all = evaluateAll(easyBeans({ debts: 'no', hiring: 'yes', candidate: 'youth' }), TODAY)
    expect(all[0].status).toBe('check')
    expect(all.at(-1)!.status).toBe('no')
  })
})

describe('Cuota Cero: the window after a year on the tarifa plana', () => {
  const p = (altaY: number, altaM: number) => profileOf({ province: 'malaga', entity: 'autonomo' },
    { alta: 'date', altaY, altaM, tarifaPlana: 'yes', empadronado: 'yes', debts: 'no' })
  it('inside the window before the call closes: apply by the earlier of the two', () => {
    const x = evaluate(grant('cuota-cero'), p(2025, 9), '2026-09-15')
    expect(x.status).toBe('yes')
    expect(x.result.deadline).toBe('2026-09-30')
  })
  it('a window that opens after this call: the next call', () => {
    expect(evaluate(grant('cuota-cero'), p(2026, 1), '2026-09-15').status).toBe('next')
  })
  it('a window long gone: not eligible', () => {
    expect(evaluate(grant('cuota-cero'), p(2023, 1), '2026-09-15').status).toBe('no')
  })
})

describe('Línea 2: the amount', () => {
  it('depends on age, gender and town size', () => {
    const p = (answers: Partial<GrantProfile>) => evaluate(grant('linea-2'), profileOf({ entity: 'autonomo', province: 'malaga' }, answers), '2026-09-01').result
    expect(p({ age: 28, gender: 'f', town: 'small' }).max).toBe(5500)
    expect(p({ age: 40, gender: 'm', town: 'large' }).max).toBe(3800)
    expect(p({ age: 40, gender: 'na' }).amount).toBeUndefined()
  })
})

describe('adaptive questions', () => {
  it('the business questions are always there; the rest only while they matter', () => {
    expect(BUSINESS_QUESTIONS.every(q => questionMatters(q, easyBeans(), TODAY))).toBe(true)
    const asked = (p: GrantProfile) => QUESTIONS.filter(q => questionMatters(q, p, TODAY)).map(q => q.key)
    // Línea 2 is out for an SL, so gender (which only sets its amount) isn't asked.
    expect(asked(easyBeans())).not.toContain('gender')
    expect(asked(easyBeans())).toContain('hiring')
    // Not hiring: who they'd hire no longer matters.
    expect(asked(easyBeans({ hiring: 'no' }))).not.toContain('candidate')
  })
})

describe('applications', () => {
  it('move through the stages; rejected and closed are the end', () => {
    expect(nextStage('interested')).toBe('gathering')
    expect(nextStage('submitted')).toBe('awarded')
    expect(nextStage('info_requested')).toBe('awarded')
    expect(nextStage('obligations')).toBe('closed')
    expect(nextStage('rejected')).toBeNull()
    expect(nextStage('closed')).toBeNull()
  })
  it('company documents only for a company', () => {
    const g = grant('equipos-hosteleria')
    expect(documentsFor(g, 'sl').map(d => d.id)).toContain('escrituras')
    expect(documentsFor(g, 'autonomo').map(d => d.id)).not.toContain('escrituras')
  })
})
