import { Link } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { LEGAL } from '../../shared/legal'
import { H, LegalPage, Mail, P, Ul } from '../components/legal'

// The public data deletion instructions (no sign-in needed): Meta asks for this link for apps
// that use Facebook Login or connect Facebook and Instagram.

const UPDATED = '2026-10-13'

export function DataDeletionPage() {
  const e = LEGAL
  const privacy = <Mail to={e.contactEmail} />
  const support = <Mail to={e.supportEmail} />
  const privacyLink = (
    <Link component={RouterLink} to="/privacy">
      privacy policy
    </Link>
  )

  return (
    <LegalPage title="Data deletion" updated={UPDATED}>
      <P>
        You can ask {e.service} to delete your data at any time. This page explains how, what we
        delete and how long it takes. It applies to data held about you on {e.domain}, including
        anything we received when you signed in with Facebook, Google or Microsoft, or connected
        Facebook, Instagram or WhatsApp.
      </P>

      <H>1. Remove Facebook or Instagram from {e.service}</H>
      <P>
        If you signed in with Facebook, or connected Facebook or Instagram, and only want to remove
        that link, do either of these. Both delete what we store for it straight away.
      </P>
      <Ul
        items={[
          <>
            In {e.service}: open <strong>Connections</strong> (or <strong>My account</strong>) and
            choose <strong>Disconnect</strong> next to Facebook or Instagram.
          </>,
          <>
            In Facebook: go to <strong>Settings &amp; privacy → Settings → Apps and websites</strong>,
            find {e.service} and choose <strong>Remove</strong>. You can tick the option to also
            delete posts, photos and videos {e.service} published on your behalf.
          </>,
        ]}
      />

      <H>2. Delete all your data</H>
      <P>To have your account and personal data deleted:</P>
      <Ul
        items={[
          <>
            Email {privacy} with the subject <strong>“Delete my data”</strong>, from the email address
            you sign in with.
          </>,
          'Tell us the name of the business you belong to, and whether you want your own data deleted or the whole business account closed (account owners only).',
          'If we cannot confirm the request comes from you, we will ask for more details before deleting anything.',
        ]}
      />
      <P>
        If you are a team member, you can also ask your employer: an admin can remove you from the
        business, which starts the same deletion.
      </P>

      <H>3. What we delete</H>
      <Ul
        items={[
          'Your account: name, email address, phone number, sign-in details and settings.',
          'Access tokens for every app you connected, including Facebook, Instagram and WhatsApp, and any profile data we received from them.',
          'Access keys for AI assistants.',
          'For a closed business account: its business details, rota, calendar, to-do list, expenses and scheduled posts.',
        ]}
      />

      <H>4. What we must keep</H>
      <P>
        Spanish law requires employers to keep working-hours records (the registro de jornada) for
        four years. We keep those records, and anything else the law requires, for that period only,
        then delete them. Posts already published to Facebook or Instagram stay on those services
        until you delete them there.
      </P>

      <H>5. How long it takes</H>
      <P>
        We confirm we have received your request within 7 days, and complete the deletion within 30
        days. We email you when it is done. Disconnecting an app deletes its tokens immediately.
      </P>

      <H>6. More information</H>
      <P>
        Our {privacyLink} explains what data we hold and your other rights, including the right to
        complain to the Agencia Española de Protección de Datos. Questions about deletion:{' '}
        {privacy}. Anything else: {support}.
      </P>
    </LegalPage>
  )
}
