import { Link } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { LEGAL } from '../../shared/legal'
import { H, LegalPage, Mail, P, Ul } from '../components/legal'
import { t, tr } from '../i18n'

// The public data deletion instructions (no sign-in needed): Meta asks for this link for apps
// that use Facebook Login or connect Facebook and Instagram.

const UPDATED = '2026-10-13'

export function DataDeletionPage() {
  const e = LEGAL
  const service = e.service
  const privacy = <Mail to={e.contactEmail} />
  const support = <Mail to={e.supportEmail} />
  const privacyLink = (
    <Link component={RouterLink} to="/privacy">
      {t('privacy policy')}
    </Link>
  )

  return (
    <LegalPage title={t('Data deletion')} updated={UPDATED}>
      <P>
        {t('You can ask {service} to delete your data at any time. This page explains how, what we delete and how long it takes. It applies to data held about you on {domain}, including anything we received when you signed in with Facebook, Google or Microsoft, or connected Facebook, Instagram or WhatsApp.', { service, domain: e.domain })}
      </P>

      <H>{t('1. Remove Facebook or Instagram from {service}', { service })}</H>
      <P>
        {t('If you signed in with Facebook, or connected Facebook or Instagram, and only want to remove that link, do either of these. Both delete what we store for it straight away.')}
      </P>
      <Ul
        items={[
          tr('In {service}: open {connections} (or {account}) and choose {disconnect} next to Facebook or Instagram.', {
            service,
            connections: <strong>{t('Connections')}</strong>,
            account: <strong>{t('My account')}</strong>,
            disconnect: <strong>{t('Disconnect')}</strong>,
          }),
          tr('In Facebook: go to {path}, find {service} and choose {remove}. You can tick the option to also delete posts, photos and videos {service} published on your behalf.', {
            service,
            path: <strong>{t('Settings & privacy → Settings → Apps and websites')}</strong>,
            remove: <strong>{t('Remove')}</strong>,
          }),
        ]}
      />

      <H>{t('2. Delete all your data')}</H>
      <P>{t('To have your account and personal data deleted:')}</P>
      <Ul
        items={[
          tr('Email {email} with the subject {subject}, from the email address you sign in with.', {
            email: privacy,
            subject: <strong>{t('“Delete my data”')}</strong>,
          }),
          t('Tell us the name of the business you belong to, and whether you want your own data deleted or the whole business account closed (account owners only).'),
          t('If we cannot confirm the request comes from you, we will ask for more details before deleting anything.'),
        ]}
      />
      <P>
        {t('If you are a team member, you can also ask your employer: an admin can remove you from the business, which starts the same deletion.')}
      </P>

      <H>{t('3. What we delete')}</H>
      <Ul
        items={[
          t('Your account: name, email address, phone number, sign-in details and settings.'),
          t('Access tokens for every app you connected, including Facebook, Instagram and WhatsApp, and any profile data we received from them.'),
          t('Access keys for AI assistants.'),
          t('For a closed business account: its business details, rota, calendar, to-do list, expenses and scheduled posts.'),
        ]}
      />

      <H>{t('4. What we must keep')}</H>
      <P>
        {t('Spanish law requires employers to keep working-hours records (the registro de jornada) for four years. We keep those records, and anything else the law requires, for that period only, then delete them. Posts already published to Facebook or Instagram stay on those services until you delete them there.')}
      </P>

      <H>{t('5. How long it takes')}</H>
      <P>
        {t('We confirm we have received your request within 7 days, and complete the deletion within 30 days. We email you when it is done. Disconnecting an app deletes its tokens immediately.')}
      </P>

      <H>{t('6. More information')}</H>
      <P>
        {tr('Our {privacy} explains what data we hold and your other rights, including the right to complain to the Agencia Española de Protección de Datos. Questions about deletion: {email}. Anything else: {support}.', {
          privacy: privacyLink,
          email: privacy,
          support,
        })}
      </P>
    </LegalPage>
  )
}
