// Who runs Business Agent, for the privacy policy (/privacy) and the terms of service (/terms). Fill in `operator` and `address`
// with the company's legal name and registered address before submitting Google's app
// verification: GDPR requires the data controller to be identified.
export const LEGAL = {
  service: 'Business Agent',
  domain: 'businesssagent.com',
  /** Legal name of the company that runs Business Agent, e.g. "Business Agent SL". */
  operator: '',
  /** Registered address of that company. */
  address: '',
  /** Where privacy requests go (set up forwarding to a real inbox, e.g. Cloudflare Email Routing). */
  contactEmail: 'privacy@businesssagent.com',
  /** Where everything else goes (questions, account closure). */
  supportEmail: 'support@businesssagent.com',
  /** Date of this version of the privacy policy. */
  updated: '2026-09-30',
  /** Date of this version of the terms of service. */
  termsUpdated: '2026-10-12',
}
