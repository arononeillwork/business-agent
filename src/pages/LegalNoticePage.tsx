import { Link } from '@mui/material'
import { Fragment } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { LEGAL, companyDetails } from '../../shared/legal'
import { H, LegalPage, Mail, P, Ul } from '../components/legal'
import { t, tr } from '../i18n'

// The public legal notice (aviso legal; no sign-in needed): what Spain's LSSI (article 10) asks every
// website to say about who runs it. The company's details show once they're filled in (shared/legal.ts).

export function LegalNoticePage() {
  const L = LEGAL
  const service = L.service
  const support = <Mail to={L.supportEmail} />
  const privacyMail = <Mail to={L.contactEmail} />
  const terms = <Link component={RouterLink} to="/terms">{t('terms of service')}</Link>
  const privacy = <Link component={RouterLink} to="/privacy">{t('privacy policy')}</Link>
  const dpa = <Link component={RouterLink} to="/dpa">{t('data processing agreement')}</Link>
  const pricing = <Link component={RouterLink} to="/pricing">{t('pricing page')}</Link>
  return (
    <LegalPage title={t('Legal notice')} updated={L.noticeUpdated}>
      <P>
        {t('This notice gives the information about {service} that Spain’s Law 34/2002 on information society services and electronic commerce (the LSSI, article 10) asks every website to give: who runs it, how to reach them, and the rules for using it.', { service })}
      </P>

      <H>{t('1. Who runs {service}', { service })}</H>
      <P>{t('The owner of {domain} and of {service} (“we”, “us”) is:', { domain: L.domain, service })}</P>
      <Ul items={[
        ...companyDetails().map(d => <Fragment key={d.key}><b>{t(d.label)}</b> {d.value}</Fragment>),
        <><b>{t('Email:')}</b> {support}</>,
        <><b>{t('Website:')}</b> {L.domain}</>,
      ]} />

      <H>{t('2. How to contact us')}</H>
      <P>
        {L.contactEmail === L.supportEmail
          ? tr('Write to {support} about the service, your account or personal data.', { support })
          : tr('Write to {support} about the service or your account, and to {privacy} about personal data.', { support, privacy: privacyMail })}
      </P>

      <H>{t('3. What the website is for')}</H>
      <P>
        {tr('{domain} presents {service}, a team app for small businesses, and is where businesses sign up and use it. Using the app is governed by the {terms}; how we handle personal data, by the {privacy} and, for the data a business keeps in the app, by the {dpa}. Prices are shown on the {pricing}, in euros; VAT is added where it applies.', {
          domain: L.domain, service, terms, privacy, dpa, pricing,
        })}
      </P>

      <H>{t('4. Intellectual and industrial property')}</H>
      <P>
        {t('The website and the app, their software, design, text and logos, and the name {service}, belong to us or are used with their owners’ permission. You may look at them, and use the app as the terms of service allow; copying, changing or distributing them in any other way needs our written permission. Other brands shown (for example those of the apps a business can connect) belong to their owners.', { service })}
      </P>

      <H>{t('5. Liability')}</H>
      <P>
        {t('We work to keep the information on this website accurate and the service available, but cannot promise that it is always complete, up to date, or free of interruptions and errors. We are not responsible for the content of other websites linked from ours, or for how they handle data. What we are liable for when a business uses the app is set out in the terms of service. None of this limits liability that cannot be limited by law.')}
      </P>
      <P>
        {tr('What businesses keep in the app or publish through it (posts, menus, offers, screens) is their own responsibility. If you think something breaks the law or your rights, write to {support} and we will act on it promptly.', { support })}
      </P>

      <H>{t('6. Personal data and cookies')}</H>
      <P>
        {tr('How we handle personal data is explained in the {privacy}. The website uses no advertising or analytics cookies or trackers: it keeps in your browser only what it needs to keep you signed in and remember your preferences.', { privacy })}
      </P>

      <H>{t('7. Law and courts')}</H>
      <P>
        {t('This notice and the use of the website are governed by Spanish law. Any dispute goes to the courts of Marbella (Málaga, Spain), unless the law gives you the right to use other courts, as it does for consumers.')}
      </P>
    </LegalPage>
  )
}
