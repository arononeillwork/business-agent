import { describe, expect, it } from 'vitest'
import {
  DOCUMENTS, GRANTS, IE_GRANTS, cleanAnswers, deadlineOf, evaluate, evaluateAll, grantsFor, knownAnswers, profileOf, questionMatters, questionsFor,
  type GrantProfile,
} from './grants'
import { IE_RULES } from './grantsIreland'

const TODAY = '2026-11-07'
const grant = (id: string) => IE_GRANTS.find(g => g.id === id)!
// The Daily Grind: a café in Dublin with four employees, opened in March 2025.
const known = knownAnswers({ tax_id: 'IE1234567T', address: '12 Camden Street, Dublin 2', business_type: 'Café' }, 4, 'IE')
const dailyGrind = (answers: Partial<GrantProfile> = {}) => profileOf(known, { startY: 2025, startM: 3, debts: 'no', ...answers })
const status = (id: string, p: GrantProfile, today = TODAY) => evaluate(grant(id), p, today).status

describe('Ireland’s catalogue', () => {
  it('the LEO’s supports, Microfinance Ireland, Enterprise Ireland and SEAI, each with its official page and the day it was checked', () => {
    expect(IE_GRANTS.map(g => g.body)).toEqual(expect.arrayContaining(['Local Enterprise Office', 'Microfinance Ireland', 'Enterprise Ireland', 'SEAI (Sustainable Energy Authority of Ireland)']))
    expect(IE_GRANTS.map(g => g.id)).toEqual(expect.arrayContaining(['ie-grow-digital', 'ie-priming', 'ie-expansion', 'ie-lean', 'ie-mentoring',
      'ie-start-your-own-business', 'ie-green-for-business', 'ie-energy-efficiency', 'ie-microfinance', 'ie-enterprise-ireland', 'ie-seai-energy-audit', 'ie-seai-solar']))
    for (const g of IE_GRANTS) {
      expect(g.source, g.id).toMatch(/^https:\/\/(www\.)?(localenterprise\.ie|microfinanceireland\.ie|enterprise-ireland\.com|seai\.ie)\//)
      expect(g.checked).toBe('2026-11-07')
      expect(g.id).toMatch(/^[a-z0-9-]{2,60}$/) // grant_applications.grant_id
      expect(IE_RULES[g.rule], g.id).toBeDefined()
      for (const d of g.documents) expect(DOCUMENTS[d.id], `${g.id}: ${d.id}`).toBeDefined()
    }
  })

  it('the country picks the grants and the questions; Spain keeps its own', () => {
    expect(grantsFor('ES')).toBe(GRANTS)
    expect(grantsFor('IE')).toBe(IE_GRANTS)
    expect(grantsFor()).toBe(GRANTS)
    expect(evaluateAll(dailyGrind(), TODAY, 'IE').map(x => x.grant.id).sort()).toEqual(IE_GRANTS.map(g => g.id).sort())
    expect(questionsFor('IE').business.map(q => q.key)).toEqual(['entity', 'sector', 'startY', 'employees'])
    expect(questionsFor('ES').business.map(q => q.key)).toContain('province')
  })

  it('reads a café and its staff from the business details, and keeps Irish answers when saved', () => {
    expect(known).toEqual({ sector: 'hospitality', employees: 4 })
    expect(knownAnswers({ tax_id: null, address: null, business_type: 'Pub' }, null, 'IE')).toEqual({ sector: 'hospitality' })
    expect(cleanAnswers({ ieTurnover: 'to2m', ieSolar: 'yes', nonsense: 1 })).toEqual({ ieTurnover: 'to2m', ieSolar: 'yes' })
  })
})

describe('the rules for an Irish café', () => {
  it('the LEO’s start-up and expansion grants don’t go to local services like cafés', () => {
    expect(status('ie-priming', dailyGrind({ ieTrades: 'yes' }))).toBe('no')
    expect(status('ie-expansion', dailyGrind({ ieTrades: 'yes' }))).toBe('no')
    expect(evaluate(grant('ie-priming'), dailyGrind(), TODAY).result.conds[0].note?.text).toMatch(/Cafés, restaurants, shops/)
    expect(status('ie-enterprise-ireland', dailyGrind())).toBe('no')
  })

  it('a maker selling beyond its area: the Priming Grant in the first 18 months, then the Business Expansion Grant', () => {
    const maker = (startY: number, startM: number) => dailyGrind({ sector: 'industry', ieTrades: 'yes', startY, startM })
    expect(status('ie-priming', maker(2026, 1))).toBe('yes')
    expect(status('ie-expansion', maker(2026, 1))).toBe('no')
    expect(status('ie-priming', maker(2024, 1))).toBe('no')
    expect(status('ie-expansion', maker(2024, 1))).toBe('yes')
    expect(status('ie-priming', { ...maker(2026, 1), debts: 'yes' })).toBe('no') // tax owed: no tax clearance
  })

  it('the Grow Digital Voucher: after Digital for Business, 6 months’ trading and up to 50 employees', () => {
    expect(status('ie-grow-digital', dailyGrind())).toBe('check')
    expect(status('ie-grow-digital', dailyGrind({ ieDigitalReport: 'yes' }))).toBe('yes')
    expect(status('ie-grow-digital', dailyGrind({ ieDigitalReport: 'yes', employees: 60 }))).toBe('no')
    // Opened two months ago: later, from six months' trading.
    const fresh = evaluate(grant('ie-grow-digital'), dailyGrind({ ieDigitalReport: 'yes', startY: 2026, startM: 9 }), TODAY)
    expect(fresh.status).toBe('next')
    expect(fresh.result.whenNote?.vars?.date).toBe('2027-03-01')
    expect(deadlineOf(fresh, TODAY)).toEqual({ kind: 'later' })
  })

  it('green supports: Green for Business, then the Energy Efficiency Grant with its report and a rates bill', () => {
    expect(status('ie-green-for-business', dailyGrind({ ieTurnover: 'to2m' }))).toBe('yes')
    expect(status('ie-green-for-business', dailyGrind({ ieTurnover: 'under30k' }))).toBe('no')
    expect(status('ie-energy-efficiency', dailyGrind({ ieGreenReport: 'yes', ieRates: 'yes' }))).toBe('yes')
    expect(status('ie-energy-efficiency', dailyGrind({ ieGreenReport: 'no', ieRates: 'yes' }))).toBe('check')
    expect(status('ie-energy-efficiency', dailyGrind({ ieGreenReport: 'yes', ieRates: 'no' }))).toBe('no')
    expect(deadlineOf(evaluate(grant('ie-energy-efficiency'), dailyGrind(), TODAY), TODAY)).toEqual({ kind: 'all_year' })
  })

  it('a loan from Microfinance Ireland, SEAI’s audit voucher and solar grant, mentoring and the course', () => {
    expect(status('ie-microfinance', dailyGrind({ ieTurnover: 'to2m' }))).toBe('check')
    expect(status('ie-microfinance', dailyGrind({ employees: 12 }))).toBe('no')
    expect(status('ie-seai-energy-audit', dailyGrind({ ieEnergySpend: 'yes' }))).toBe('yes')
    expect(status('ie-seai-energy-audit', dailyGrind({ ieEnergySpend: 'no' }))).toBe('no')
    expect(status('ie-seai-solar', dailyGrind({ ieSolar: 'no' }))).toBe('no')
    expect(status('ie-mentoring', dailyGrind())).toBe('yes')
    expect(status('ie-start-your-own-business', dailyGrind())).toBe('yes')
    expect(status('ie-start-your-own-business', dailyGrind({ startY: 2020, startM: 1 }))).toBe('no')
  })

  it('a question goes once it can’t change anything: trading wider doesn’t matter for a café', () => {
    const q = (key: string) => questionsFor('IE').questions.find(x => x.key === key)!
    expect(questionMatters(q('ieTrades'), dailyGrind(), TODAY, 'IE')).toBe(false)
    expect(questionMatters(q('ieTrades'), dailyGrind({ sector: 'industry' }), TODAY, 'IE')).toBe(true)
    expect(questionMatters(q('ieEnergySpend'), dailyGrind(), TODAY, 'IE')).toBe(true)
    expect(questionMatters(q('debts'), dailyGrind(), TODAY, 'IE')).toBe(true)
  })
})
