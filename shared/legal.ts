// Who runs Business Agent, for the privacy policy (/privacy), the terms of service (/terms), the legal
// notice (/legal-notice, Spain's aviso legal) and the data processing agreement (/dpa). Fill in
// `operator`, `nif`, `address` and `registry` once the company exists: GDPR requires the data
// controller to be identified (Google's app verification checks it too), and the LSSI (article 10)
// asks the same of the legal notice. Until then the pages leave out what's blank.
import { msg } from './i18n'

export const LEGAL = {
  service: 'The Business Agent',
  domain: 'businesssagent.com',
  /** Legal name of the company that runs Business Agent, e.g. "The Business Agent SL". */
  operator: '',
  /** That company's tax ID (NIF), e.g. "B12345678". */
  nif: '',
  /** Registered address of that company. */
  address: '',
  /** Its entry in the Registro Mercantil, e.g. "Registro Mercantil de Málaga, tomo 1234, folio 56, hoja MA-78901". */
  registry: '',
  /** Where privacy requests go (set up forwarding to a real inbox, e.g. Cloudflare Email Routing). */
  contactEmail: 'thebusinesssagent@gmail.com',
  /** Where everything else goes (questions, account closure). */
  supportEmail: 'thebusinesssagent@gmail.com',
  /** Date of this version of the privacy policy. */
  updated: '2026-11-08',
  /** Date of this version of the terms of service. */
  termsUpdated: '2026-11-08',
  /** Date of this version of the legal notice. */
  noticeUpdated: '2026-11-08',
  /** Date of this version of the data processing agreement. */
  dpaUpdated: '2026-11-08',
}

type Company = Pick<typeof LEGAL, 'service' | 'operator' | 'nif' | 'address' | 'registry'>

/**
 * Who runs the service, for the legal notice: one line for each detail that's filled in, so a blank
 * one is left out rather than shown as an empty label. The name falls back to the service's, as
 * operatorLine() does (src/components/legal.tsx). `label` is English, shown with t().
 */
export function companyDetails(c: Company = LEGAL): { key: 'name' | 'nif' | 'address' | 'registry'; label: string; value: string }[] {
  const all = [
    { key: 'name' as const, label: msg('Name:'), value: c.operator.trim() || c.service },
    { key: 'nif' as const, label: msg('Tax ID (NIF):'), value: c.nif.trim() },
    { key: 'address' as const, label: msg('Registered address:'), value: c.address.trim() },
    { key: 'registry' as const, label: msg('Commercial Registry:'), value: c.registry.trim() },
  ]
  return all.filter(d => d.value)
}
