import { Box, Link, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { LEGAL } from '../../shared/legal'
import { H, LegalPage, Mail, P, Ul, operatorLine } from '../components/legal'
import { msg, t, tr } from '../i18n'

// The public privacy policy (no sign-in needed). Google, Meta and TikTok check it before approving
// the app, so it states exactly what the app does with data from each connected service.

const CONNECTIONS: [string, string, string][] = [
  [msg('Google Business Profile (Google Maps)'), msg('Manage the business listing'), msg('Keep opening hours and closures up to date, and publish posts the business writes.')],
  ['Gmail', msg('Send email (send only)'), msg('Send team alerts and sign-in emails from the business’s own address. The app cannot read, search or delete email.')],
  ['Google Drive', msg('Files the app creates only'), msg('Save timecard and hours-record exports to a “Business Agent” folder. The app cannot see any other file.')],
  ['YouTube (YouTube Music)', msg('Read playlists (read only)'), msg('Show a person’s own playlists on the Music page and the café’s approved playlist.')],
  ['Microsoft Outlook', msg('Send email'), msg('Send team alerts and sign-in emails from the business’s own address.')],
  ['Microsoft OneDrive', msg('Read and write files'), msg('Save timecard and hours-record exports.')],
  [msg('Instagram, Facebook Page'), msg('Publish posts; read the profile'), msg('Publish posts the business schedules, and show its latest posts.')],
  ['TikTok', msg('Publish photo posts; basic profile'), msg('Publish posts the business schedules.')],
  [msg('Instagram, TikTok, LinkedIn Page, Facebook Page'), msg('Read the account’s statistics (read only)'),
    msg('Show the business’s admins followers, reach and how each post did, on the Analytics page. Kept up to 3 hours, then read again.')],
  ['Spotify', msg('Read playlists; control playback'), msg('Show playlists and play or pause the approved café playlist.')],
  ['WhatsApp (Meta)', msg('Send messages from the business number'), msg('Shift reminders and changes, only to people who switched WhatsApp messages on.')],
]

export function PrivacyPage() {
  const L = LEGAL
  const who = operatorLine()
  const mail = <Mail to={L.contactEmail} />
  return (
    <LegalPage title={t('Privacy policy')} updated={L.updated}>

        <H>{t('Who we are')}</H>
        <P>
          {t('{service} ({domain}) is a team app for small businesses: rota, clock-ins and timecards, time off, opening hours, a shared calendar and connections to the apps a business already uses. It is run by {who}.', { service: L.service, domain: L.domain, who })}
        </P>
        <P>
          {tr('For the people who sign up and run a business on {service}, we decide how their account data is used (we are the {controller}). For the team members a business adds, and the work records it keeps about them, the business decides; we store and process that data on its behalf (we are its {processor}). Team members can contact their employer, or us, about their data.', {
            service: L.service,
            controller: <b>{t('data controller')}</b>,
            processor: <b>{t('data processor')}</b>,
          })}
        </P>

        <H>{t('What we collect')}</H>
        <Ul items={[
          tr('{label} name, email address, phone number (optional), how you prefer to be contacted, and how you sign in (password, Google or Microsoft). Passwords are stored only as a one-way hash by our sign-in provider.', { label: <b>{t('Account:')}</b> }),
          tr('{label} shifts on the rota, clock-in and clock-out times, breaks, time-off requests, corrections to timecards (with who made them and why), and pay rates. Pay is visible only to the person it belongs to and to admins allowed to see pay.', { label: <b>{t('Work records:')}</b> }),
          tr('{label} name, address, contact details, tax ID, opening hours, brand colours and logo, expenses, calendar events and social media posts (with their photos).', { label: <b>{t('Business details:')}</b> }),
          tr('{label} notification choices, appearance preferences, followed sports teams and competitions.', { label: <b>{t('Settings:')}</b> }),
          tr('{label} for connecting AI assistants: we keep only a hash, never the key itself.', { label: <b>{t('Access keys')}</b> }),
          tr('{label} access tokens for the services a business or person connects (below), encrypted.', { label: <b>{t('Connected apps:')}</b> }),
        ]} />
        <P>
          {t('We do not use advertising or analytics trackers, and we do not collect location. The app stores only what it needs in your browser to keep you signed in and remember your preferences.')}
        </P>

        <H>{t('How we use it')}</H>
        <Ul items={[
          t('To run the service: show the rota, record working hours, handle time off, keep the calendar and opening hours up to date, and send the alerts the business and each person asked for.'),
          t('To meet legal duties such as the working-hours record (registro de jornada) Spanish law requires employers to keep.'),
          t('To keep the service secure and working: sign-in checks, logs of changes to timecards, and checks that connected apps still work.'),
          t('To reply when you contact us.'),
        ]} />
        <P>
          {t('The legal bases are: performing our contract with the business and with you; the business’s and our legal obligations; our legitimate interest in running a secure, reliable service; and your consent for optional messages (for example WhatsApp), which you can withdraw at any time in My account or by replying STOP.')}
        </P>
        <P>{t('We never sell personal data, and we do not use it for advertising.')}</P>

        <H>{t('Connected apps and Google user data')}</H>
        <P>
          {t('A business can connect its own accounts, and each person can connect their own music account. Each connection asks only for the access below, is used only for the purpose shown, and can be removed at any time from the Connections page (or My account), or from the other service’s own security settings.')}
        </P>
        <Box sx={{ overflowX: 'auto', mb: 2 }}>
          <Table size="small" sx={{ '& td, & th': { verticalAlign: 'top' } }}>
            <TableHead><TableRow><TableCell>{t('Service')}</TableCell><TableCell>{t('Access')}</TableCell><TableCell>{t('Used to')}</TableCell></TableRow></TableHead>
            <TableBody>
              {CONNECTIONS.map(([s, a, u]) => (
                <TableRow key={s}><TableCell sx={{ fontWeight: 500 }}>{t(s)}</TableCell><TableCell>{t(a)}</TableCell><TableCell>{t(u)}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
        <P>
          {tr('{service}’s use and transfer to any other app of information received from Google APIs will adhere to the {policy}, including the Limited Use requirements. In particular, data from Google services is used only to provide the features described above; it is not used for advertising, not sold, not used to train AI models, and not read by people except with the user’s permission, for security or to comply with the law. The same applies to data from Microsoft, Meta, TikTok and Spotify.', {
            service: L.service,
            policy: <Link href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">{t('Google API Services User Data Policy')}</Link>,
          })}
        </P>

        <H>{t('Where data is stored and who processes it')}</H>
        <Ul items={[
          tr('{name}: database and sign-in, hosted in the European Union (Ireland).', { name: <b>{'Supabase'}</b> }),
          tr('{name}: hosting of the app and of photos for posts.', { name: <b>{'Cloudflare'}</b> }),
          tr('{name}: only when you connect them, to do what the connection is for.', { name: <b>{t('Google, Microsoft, Meta, TikTok and Spotify')}</b> }),
        ]} />
        <P>
          {t('Where a provider handles data outside the European Economic Area, the transfer is covered by the European Commission’s standard contractual clauses or an adequacy decision.')}
        </P>

        <H>{t('How long we keep it')}</H>
        <P>
          {t('We keep data while the business’s account is active. Working-hours records are kept for four years, as Spanish law requires. When a business closes its account, or a person is removed, we delete or anonymise their data within 30 days, except what we must keep by law. Disconnecting an app deletes its stored tokens straight away.')}
        </P>

        <H>{t('Security')}</H>
        <P>
          {t('Data is encrypted in transit and at rest; tokens for connected apps are additionally encrypted by the app. Access rules in the database mean each person sees only what their role allows (for example, staff never see other people’s pay).')}
        </P>

        <H>{t('Your rights')}</H>
        <P>
          {tr('You can ask to access, correct, delete or export your data, to restrict or object to how it is used, and to withdraw consent. Write to {mail}. How to have your data deleted, step by step: {deletion}. If your data is held for your employer, you can also ask them directly. You have the right to complain to your data protection authority; in Spain that is the {authority}.', {
            mail,
            deletion: <Link component={RouterLink} to="/data-deletion">{t('data deletion')}</Link>,
            authority: <Link href="https://www.aepd.es" target="_blank" rel="noreferrer">{'Agencia Española de Protección de Datos'}</Link>,
          })}
        </P>

        <H>{t('Children')}</H>
        <P>{t('{service} is for businesses and their teams, and is not meant for children under 16.', { service: L.service })}</P>

        <H>{t('Changes')}</H>
        <P>{t('If we change this policy, we will update the date above and, for important changes, tell account owners by email.')}</P>

        <H>{t('Contact')}</H>
        <P>{who ? tr('Questions about privacy: {mail}, {who}.', { mail, who }) : tr('Questions about privacy: {mail}.', { mail })}</P>

    </LegalPage>
  )
}
