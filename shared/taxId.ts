// Spanish tax numbers: NIF (DNI) for people, NIE for foreign residents, CIF for companies.
// Checks the control letter/digit, so typos are caught before they reach invoices or the gestoría.

const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE'

/** "b-12 345.678" → "B12345678". */
export const normaliseTaxId = (raw: string) => raw.toUpperCase().replace(/[\s.\-/]/g, '')

export type TaxIdKind = 'NIF' | 'NIE' | 'CIF'

/** What kind of number it is, or an explanation of what's wrong. */
export function checkTaxId(raw: string): { ok: true; value: string; kind: TaxIdKind } | { ok: false; value: string; error: string } {
  const v = normaliseTaxId(raw)
  const bad = (error: string) => ({ ok: false as const, value: v, error })
  if (/^\d{8}[A-Z]$/.test(v)) {
    return DNI_LETTERS[Number(v.slice(0, 8)) % 23] === v[8] ? { ok: true, value: v, kind: 'NIF' } : bad('The NIF letter doesn\'t match the number')
  }
  if (/^[XYZ]\d{7}[A-Z]$/.test(v)) {
    const n = Number('XYZ'.indexOf(v[0]) + v.slice(1, 8))
    return DNI_LETTERS[n % 23] === v[8] ? { ok: true, value: v, kind: 'NIE' } : bad('The NIE letter doesn\'t match the number')
  }
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(v)) {
    const digits = v.slice(1, 8).split('').map(Number)
    let sum = 0
    digits.forEach((d, i) => {
      if (i % 2 === 1) sum += d
      else { const x = d * 2; sum += Math.floor(x / 10) + (x % 10) }
    })
    const c = (10 - (sum % 10)) % 10
    const letter = 'JABCDEFGHI'[c]
    const last = v[8]
    const letterOnly = 'NPQRSW'.includes(v[0])
    const digitOnly = 'ABEH'.includes(v[0])
    const ok = letterOnly ? last === letter : digitOnly ? last === String(c) : last === letter || last === String(c)
    return ok ? { ok: true, value: v, kind: 'CIF' } : bad('The CIF control character doesn\'t match')
  }
  return bad('Use a Spanish CIF (B12345674), NIF (12345678Z) or NIE (X1234567L)')
}
