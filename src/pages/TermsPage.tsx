import { Link } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { LEGAL } from '../../shared/legal'
import { H, LegalPage, Mail, P, Ul, operatorLine } from '../components/legal'

// The public terms of service (no sign-in needed). Google's consent screen links here, next to
// the privacy policy. Written for businesses (the app is a business-to-business service).

export function TermsPage() {
  const L = LEGAL
  const support = <Mail to={L.supportEmail} />
  const privacy = <Link component={RouterLink} to="/privacy">privacy policy</Link>
  return (
    <LegalPage title="Terms of service" updated={L.termsUpdated}>
      <H>1. About these terms</H>
      <P>
        These terms are an agreement between {operatorLine()} (“we”, “us”), which runs {L.service} at {L.domain}, and the
        business that opens an account (“the business”, “you”), together with each person the business invites. By creating
        an account or using {L.service} you agree to them. If you use it on behalf of a business, you confirm you are allowed
        to accept them for that business.
      </P>

      <H>2. The service</H>
      <P>
        {L.service} is a team app for small businesses: the rota, clock-ins and timecards, time off, opening hours, a shared
        calendar and to-do list, finances, and connections to apps the business already uses (for example Google Maps, Gmail,
        Google Drive, Outlook, Instagram, Facebook, TikTok, WhatsApp and Spotify).
      </P>
      <P>
        {L.service} is free while it is in early access. If we introduce paid plans, we will tell account owners at least 30 days
        before, and nothing is charged unless the business agrees to a plan.
      </P>

      <H>3. Accounts</H>
      <Ul items={[
        'The business’s admins decide who joins, what role each person has (admin, employee or partner) and what admins can see, such as pay.',
        'Keep sign-in details and access keys secret, and tell us straight away if you think someone else has used them.',
        'Give accurate details, and keep them up to date.',
        `${L.service} is for people aged 16 or over.`,
      ]} />

      <H>4. Your data</H>
      <P>
        The business owns the data it puts into {L.service}: its team’s details, working hours, rota, expenses, posts and so
        on. We use it only to provide the service, as our {privacy} explains. For the team members’ data, we act as the
        business’s data processor, on its instructions; a data processing agreement (GDPR article 28) is available on request
        at {support}.
      </P>
      <P>
        Admins can export working-hours records and timecards at any time. When a business closes its account, we delete its
        data within 30 days, except what the law requires us to keep (for example working-hours records, kept for four years).
      </P>

      <H>5. The business’s responsibilities as an employer</H>
      <P>
        {L.service} helps a business keep its rota, record working hours (the registro de jornada) and work out hours and pay.
        The business remains responsible for meeting employment, working-time, tax and data-protection law, and for checking
        figures before relying on them. Nothing in {L.service} is legal, tax or payroll advice.
      </P>

      <H>6. Connected apps</H>
      <Ul items={[
        'When you connect another service, you allow us to use it on your behalf, only for the purpose shown when you connect (the privacy policy lists each one), until you disconnect it.',
        'Those services have their own terms, which also apply to you. We are not responsible for their availability, or for changes they make that limit what the connection can do.',
        'Posts, opening hours, messages and emails sent through a connection are sent because the business asked for them; the business is responsible for their content.',
        'You can disconnect any app at any time on the Connections page or in My account.',
      ]} />

      <H>7. AI assistants and access keys</H>
      <P>
        A person can connect an AI assistant (such as Claude) with a personal access key. The assistant then acts with that
        person’s permissions, no more. The person is responsible for what they ask it to do, and can withdraw the key at any time.
      </P>

      <H>8. Acceptable use</H>
      <P>Do not use {L.service} to:</P>
      <Ul items={[
        'break the law, or other people’s rights (including privacy and intellectual property);',
        'store or send other people’s personal data without a lawful reason;',
        'send spam or misleading messages;',
        'get around security, access other businesses’ data, or test the service’s security without our written permission;',
        'overload or disrupt the service, or copy it to build a competing product.',
      ]} />

      <H>9. Availability and changes</H>
      <P>
        We work to keep {L.service} available and secure, but cannot promise it will always be uninterrupted or free of errors.
        We may improve or change features; if a change significantly reduces what the business can do, we will tell account
        owners in advance.
      </P>

      <H>10. Suspending or closing an account</H>
      <P>
        The business can stop using {L.service} and close its account at any time by writing to {support}. We may suspend or
        close an account that breaks these terms or puts the service or other users at risk; where we reasonably can, we will
        warn the business first and give it the chance to export its data.
      </P>

      <H>11. Intellectual property</H>
      <P>
        We own {L.service}, its software and its design. The business keeps all rights to its own content and gives us permission
        to store, process and display it only as needed to provide the service.
      </P>

      <H>12. Liability</H>
      <P>
        {L.service} is provided as it is, to the extent the law allows. We are not liable for indirect losses, such as lost profits,
        lost business or lost data that could have been exported. Our total liability in any 12 months is limited to what the
        business paid us in that period, or 100 euros if it paid nothing. None of this limits liability that cannot be limited by
        law, such as for fraud or gross negligence.
      </P>

      <H>13. Changes to these terms</H>
      <P>
        If we change these terms, we will update the date above. For important changes we will tell account owners by email at
        least 30 days before they apply. Continuing to use {L.service} after that means accepting the new terms.
      </P>

      <H>14. Law and disputes</H>
      <P>
        These terms are governed by Spanish law. Any dispute goes to the courts of Marbella (Málaga, Spain), unless the law gives
        you the right to use other courts.
      </P>

      <H>15. Contact</H>
      <P>Questions about these terms: {support}. About your data: <Mail to={L.contactEmail} />.</P>
    </LegalPage>
  )
}
