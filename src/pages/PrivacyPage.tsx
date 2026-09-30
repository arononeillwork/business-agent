import { Box, Link, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { LEGAL } from '../../shared/legal'
import { formatLocal } from '../../shared/time'
import { tokens } from '../theme'

// The public privacy policy (no sign-in needed). Google, Meta and TikTok check it before approving
// the app, so it states exactly what the app does with data from each connected service.

const H = ({ children }: { children: ReactNode }) => (
  <Typography variant="h5" component="h2" sx={{ mt: 5, mb: 1.5 }}>{children}</Typography>
)
const P = ({ children }: { children: ReactNode }) => <Typography sx={{ mb: 1.5, lineHeight: 1.7 }}>{children}</Typography>
const Ul = ({ items }: { items: ReactNode[] }) => (
  <Box component="ul" sx={{ pl: 3, mt: 0, mb: 2, '& li': { mb: 0.75, lineHeight: 1.7 } }}>
    {items.map((it, i) => <li key={i}>{it}</li>)}
  </Box>
)

const CONNECTIONS: [string, string, string][] = [
  ['Google Business Profile (Google Maps)', 'Manage the business listing', 'Keep opening hours and closures up to date, and publish posts the business writes.'],
  ['Gmail', 'Send email (send only)', 'Send team alerts and sign-in emails from the business’s own address. The app cannot read, search or delete email.'],
  ['Google Drive', 'Files the app creates only', 'Save timecard and hours-record exports to a “Business Agent” folder. The app cannot see any other file.'],
  ['YouTube (YouTube Music)', 'Read playlists (read only)', 'Show a person’s own playlists on the Music page and the café’s approved playlist.'],
  ['Microsoft Outlook', 'Send email', 'Send team alerts and sign-in emails from the business’s own address.'],
  ['Microsoft OneDrive', 'Read and write files', 'Save timecard and hours-record exports.'],
  ['Instagram, Facebook Page', 'Publish posts; read the profile', 'Publish posts the business schedules, and show its latest posts.'],
  ['TikTok', 'Publish photo posts; basic profile', 'Publish posts the business schedules.'],
  ['Spotify', 'Read playlists; control playback', 'Show playlists and play or pause the approved café playlist.'],
  ['WhatsApp (Meta)', 'Send messages from the business number', 'Shift reminders and changes, only to people who switched WhatsApp messages on.'],
]

export function PrivacyPage() {
  const L = LEGAL
  const who = [L.operator || L.service, L.address].filter(Boolean).join(', ')
  const mail = <Link href={`mailto:${L.contactEmail}`}>{L.contactEmail}</Link>
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box component="main" sx={{ maxWidth: 760, mx: 'auto', px: { xs: 2, sm: 3 }, py: { xs: 4, sm: 6 } }}>
        <Link component={RouterLink} to="/" underline="hover" sx={{ fontSize: 14 }}>← {L.service}</Link>
        <Typography variant="h3" component="h1" sx={{ mt: 2 }}>Privacy policy</Typography>
        <Typography sx={{ color: 'text.secondary', mt: 1 }}>Last updated {formatLocal(`${L.updated}T12:00:00Z`, 'd MMMM yyyy')}</Typography>

        <H>Who we are</H>
        <P>
          {L.service} ({L.domain}) is a team app for small businesses: rota, clock-ins and timecards, time off, opening
          hours, a shared calendar and connections to the apps a business already uses. It is run by {who}.
        </P>
        <P>
          For the people who sign up and run a business on {L.service}, we decide how their account data is used (we are the
          <b> data controller</b>). For the team members a business adds, and the work records it keeps about them, the
          business decides; we store and process that data on its behalf (we are its <b>data processor</b>). Team members can
          contact their employer, or us, about their data.
        </P>

        <H>What we collect</H>
        <Ul items={[
          <><b>Account:</b> name, email address, phone number (optional), how you prefer to be contacted, and how you sign in (password, Google or Microsoft). Passwords are stored only as a one-way hash by our sign-in provider.</>,
          <><b>Work records:</b> shifts on the rota, clock-in and clock-out times, breaks, time-off requests, corrections to timecards (with who made them and why), and pay rates. Pay is visible only to the person it belongs to and to admins allowed to see pay.</>,
          <><b>Business details:</b> name, address, contact details, tax ID, opening hours, brand colours and logo, expenses, calendar events and social media posts (with their photos).</>,
          <><b>Settings:</b> notification choices, appearance preferences, followed sports teams and competitions.</>,
          <><b>Access keys</b> for connecting AI assistants: we keep only a hash, never the key itself.</>,
          <><b>Connected apps:</b> access tokens for the services a business or person connects (below), encrypted.</>,
        ]} />
        <P>
          We do not use advertising or analytics trackers, and we do not collect location. The app stores only what it needs in
          your browser to keep you signed in and remember your preferences.
        </P>

        <H>How we use it</H>
        <Ul items={[
          'To run the service: show the rota, record working hours, handle time off, keep the calendar and opening hours up to date, and send the alerts the business and each person asked for.',
          'To meet legal duties such as the working-hours record (registro de jornada) Spanish law requires employers to keep.',
          'To keep the service secure and working: sign-in checks, logs of changes to timecards, and checks that connected apps still work.',
          'To reply when you contact us.',
        ]} />
        <P>
          The legal bases are: performing our contract with the business and with you; the business’s and our legal
          obligations; our legitimate interest in running a secure, reliable service; and your consent for optional messages
          (for example WhatsApp), which you can withdraw at any time in My account or by replying STOP.
        </P>
        <P>We never sell personal data, and we do not use it for advertising.</P>

        <H>Connected apps and Google user data</H>
        <P>
          A business can connect its own accounts, and each person can connect their own music account. Each connection asks
          only for the access below, is used only for the purpose shown, and can be removed at any time from the Connections page
          (or My account), or from the other service’s own security settings.
        </P>
        <Box sx={{ overflowX: 'auto', mb: 2 }}>
          <Table size="small" sx={{ '& td, & th': { verticalAlign: 'top' } }}>
            <TableHead><TableRow><TableCell>Service</TableCell><TableCell>Access</TableCell><TableCell>Used to</TableCell></TableRow></TableHead>
            <TableBody>
              {CONNECTIONS.map(([s, a, u]) => (
                <TableRow key={s}><TableCell sx={{ fontWeight: 500 }}>{s}</TableCell><TableCell>{a}</TableCell><TableCell>{u}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
        <P>
          {L.service}’s use and transfer to any other app of information received from Google APIs will adhere to the{' '}
          <Link href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Google API Services User Data Policy</Link>,
          including the Limited Use requirements. In particular, data from Google services is used only to provide the features
          described above; it is not used for advertising, not sold, not used to train AI models, and not read by people except
          with the user’s permission, for security or to comply with the law. The same applies to data from Microsoft, Meta,
          TikTok and Spotify.
        </P>

        <H>Where data is stored and who processes it</H>
        <Ul items={[
          <><b>Supabase</b>: database and sign-in, hosted in the European Union (Ireland).</>,
          <><b>Cloudflare</b>: hosting of the app and of photos for posts.</>,
          <><b>Google, Microsoft, Meta, TikTok and Spotify</b>: only when you connect them, to do what the connection is for.</>,
        ]} />
        <P>
          Where a provider handles data outside the European Economic Area, the transfer is covered by the European Commission’s
          standard contractual clauses or an adequacy decision.
        </P>

        <H>How long we keep it</H>
        <P>
          We keep data while the business’s account is active. Working-hours records are kept for four years, as Spanish law
          requires. When a business closes its account, or a person is removed, we delete or anonymise their data within 30 days,
          except what we must keep by law. Disconnecting an app deletes its stored tokens straight away.
        </P>

        <H>Security</H>
        <P>
          Data is encrypted in transit and at rest; tokens for connected apps are additionally encrypted by the app. Access rules
          in the database mean each person sees only what their role allows (for example, staff never see other people’s pay).
        </P>

        <H>Your rights</H>
        <P>
          You can ask to access, correct, delete or export your data, to restrict or object to how it is used, and to withdraw
          consent. Write to {mail}. If your data is held for your employer, you can also ask them directly. You have the right to
          complain to your data protection authority; in Spain that is the{' '}
          <Link href="https://www.aepd.es" target="_blank" rel="noreferrer">Agencia Española de Protección de Datos</Link>.
        </P>

        <H>Children</H>
        <P>{L.service} is for businesses and their teams, and is not meant for children under 16.</P>

        <H>Changes</H>
        <P>If we change this policy, we will update the date above and, for important changes, tell account owners by email.</P>

        <H>Contact</H>
        <P>Questions about privacy: {mail}{who ? <>, {who}</> : null}.</P>

        <Typography variant="caption" sx={{ display: 'block', mt: 6, color: tokens.inkFaint }}>© {L.service}</Typography>
      </Box>
    </Box>
  )
}
