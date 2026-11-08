// Tax for a business in Ireland: which returns are due when, with Revenue (revenue.ie, filed on ROS).
// The Tax page shows these for an Irish business instead of the Agencia Tributaria's modelos (tax.ts),
// in the same table, with the same statuses and documents. Dates are ROS's: filing and paying online
// gives until the 23rd (the 19th or 14th otherwise), and Form 11 until Revenue's ROS date each November;
// they assume the accounts run to 31 December. Checked against Revenue's pages (each return's `source`),
// its Agent's Guide to the Collector-General's Division and its VIES and RTD manuals on IRELAND_TAX_CHECKED;
// the accountant confirms.
import type { Country } from './country'
import { filingsFor, type Filing, type FilingPeriod, type TaxSettings } from './tax'
import { msg } from './i18n'

/** When the dates and rules here were last checked against Revenue's pages. */
export const IRELAND_TAX_CHECKED = '2026-11-08'

export const REVENUE = {
  vat: 'https://www.revenue.ie/en/vat/accounting-for-vat/how-to-account-for-value-added-tax/when-vat-becomes-payable.aspx',
  // The VIES Traders Manual: its filing dates and frequency (the VIES and Intrastat page links to it, without them).
  vies: 'https://www.revenue.ie/en/tax-professionals/tdm/value-added-tax/vat-information-exchange-system-VIES/vies-traders-manual.pdf',
  paye: 'https://www.revenue.ie/en/employing-people/paying-your-employees-tax-to-revenue/paying-tax-to-revenue.aspx',
  preliminary: 'https://www.revenue.ie/en/companies-and-charities/corporation-tax-for-companies/corporation-tax-payment-and-filing/when-is-preliminary-ct-due.aspx',
  ct: 'https://www.revenue.ie/en/companies-and-charities/corporation-tax-for-companies/corporation-tax-payment-and-filing/payment-and-filing.aspx',
  form11: 'https://www.revenue.ie/en/self-assessment-and-self-employment/filing-your-tax-return/index.aspx',
  calendar: 'https://www.revenue.ie/en/tax-professionals/calendar/index.aspx',
  ros: 'https://www.ros.ie',
} as const

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
/** The year and month `n` months after year y, month m. */
const plus = (y: number, m: number, n: number): [number, number] => [y + Math.floor((m - 1 + n) / 12), ((m - 1 + n) % 12) + 1]
/** The ROS day (the 23rd) of the month after month m of year y, and the first day it can be filed. */
const after = (y: number, m: number): [string, string] => {
  const [ny, nm] = plus(y, m, 1)
  return [ymd(ny, nm, 1), ymd(ny, nm, 23)]
}

/**
 * The last day to pay and file Form 11 on ROS for a tax year, as Revenue announces it each year (the
 * date otherwise is 31 October). From Revenue's "Filing your tax return" page and its Agent's Guide.
 */
export const FORM11_ROS_DATES: Record<number, string> = { 2024: '2025-11-19', 2025: '2026-11-18' }

/**
 * Every return an Irish business files for the tax year, in the order they fall due. Revenue's dates
 * aren't moved for weekends or bank holidays here: Revenue's pages don't say that a 23rd on one moves
 * (it gave the 2025 Form 11's 31 October as Saturday 31 October 2026), so the 23rd is shown as it is
 * (earlier is always safe) and the page asks the accountant.
 */
export function irishFilingsFor(year: number, s: TaxSettings): Filing[] {
  const out: Filing[] = []
  const add = (model: string, period: FilingPeriod, name: string, what: string, [opens, due]: [string, string], source: string) =>
    out.push({ model, year, period, name, what, opens, due, source })

  // VAT: a VAT3 every two months (January and February, March and April…), and the year's Return of Trading Details.
  for (let n = 1; n <= 6; n++) {
    add('VAT3', `${n}B` as FilingPeriod, msg('VAT return'), msg('VAT charged on sales minus VAT paid on purchases, for the two months.'),
      after(year, n * 2), REVENUE.vat)
  }
  add('RTD', '0A', msg('Return of Trading Details'), msg('The year’s sales and purchases by VAT rate, sent with the year’s last VAT3.'),
    [ymd(year + 1, 1, 1), ymd(year + 1, 1, 23)], REVENUE.vat)
  if (s.intra_eu) for (let q = 1; q <= 4; q++) {
    add('VIES', `${q}T` as FilingPeriod, msg('EU sales listing (VIES)'),
      msg('Sales to VAT-registered businesses elsewhere in the EU, for the quarter (a nil one when there were none). Each month instead once goods sold to them pass €50,000 a quarter.'),
      after(year, q * 3), REVENUE.vies)
  }
  // Payroll (PAYE Modernisation): each payroll goes to Revenue on or before pay day; the month's statement is paid by the 23rd.
  if (s.withholding) for (let m = 1; m <= 12; m++) {
    add('PAYE', `${m}M` as FilingPeriod, msg('Payroll taxes (PAYE, PRSI and USC)'),
      msg('Each payroll goes to Revenue on or before pay day; Revenue’s statement for the month is paid by the 23rd on ROS.'), after(year, m), REVENUE.paye)
  }
  if (s.sole_trader) {
    const ros = FORM11_ROS_DATES[year]
    add('F11', '0A', msg('Income tax return (Form 11)'),
      ros ? msg('The year’s income tax, with the balance for it and preliminary tax for the next year: by 31 October, or Revenue’s later date shown here when you both pay and file on ROS.')
        : msg('The year’s income tax, with the balance for it and preliminary tax for the next year: by 31 October. Paying and filing on ROS usually gives until mid-November, once Revenue sets the date.'),
      [ymd(year + 1, 1, 1), ros ?? ymd(year + 1, 10, 31)], REVENUE.form11)
  } else {
    if (s.instalments) {
      add('CT1', '1P', msg('Preliminary Corporation Tax'),
        msg('Paid ahead on this year’s Corporation Tax, in its 11th month: 90% of this year’s tax, or 100% of last year’s. A new company whose first year’s tax is under €200,000 pays none that year; one whose last year’s was over €200,000 pays in two parts.'),
        [ymd(year, 11, 1), ymd(year, 11, 23)], REVENUE.preliminary)
    }
    add('CT1', '0A', msg('Corporation Tax return (CT1)'), msg('The year’s return, and any tax still to pay, 9 months after the year end.'),
      [ymd(year + 1, 1, 1), ymd(year + 1, 9, 23)], REVENUE.ct)
  }
  return out.sort((a, b) => a.due.localeCompare(b.due) || a.model.localeCompare(b.model))
}

/** The returns for the business's country: the Agencia Tributaria's modelos in Spain, Revenue's in Ireland. */
export const filingsIn = (country: Country, year: number, s: TaxSettings): Filing[] =>
  country === 'IE' ? irishFilingsFor(year, s) : filingsFor(year, s)

/** A return's code as shown: "Form 11" for the F11 (Spain's annual accounts are shown as "Accounts" by the page). */
export const irishModelLabel = (model: string) => (model === 'F11' ? 'Form 11' : model)
