import { Link } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { LEGAL } from '../../shared/legal'
import { H, LegalPage, Mail, P, Ul, operatorLine } from '../components/legal'

// The TikTok privacy notice (no sign-in needed), for TikTok's app review: exactly what the TikTok
// connection reads, keeps and sends (worker/providers/tiktok.ts, proveTikTok in worker/connections.ts).
// The general privacy policy (/privacy) covers everything else.

const UPDATED = '2026-10-19'

export function TikTokPrivacyPage() {
  const L = LEGAL
  const mail = <Mail to={L.contactEmail} />
  const privacy = <Link component={RouterLink} to="/privacy">privacy policy</Link>
  return (
    <LegalPage title="TikTok privacy notice" updated={UPDATED}>
      <P>
        This notice explains what {L.service} ({L.domain}), run by {operatorLine()}, does with data when a business connects
        its TikTok account. It adds to our {privacy}, which applies to everything else in {L.service}.
      </P>

      <H>What the TikTok connection is for</H>
      <P>
        A business’s admin can connect the business’s TikTok account on the Connections page, using TikTok’s own sign-in
        (Login Kit). {L.service} then publishes the photo posts the business plans in its Social planner, at the time the
        business chooses. It does nothing else with the account.
      </P>
      <P>We ask TikTok for two permissions only:</P>
      <Ul items={[
        <><b>user.info.basic</b>: the account’s ID, display name and profile picture, to show which account is connected.</>,
        <><b>video.publish</b>: to publish the business’s own photo posts directly to its TikTok account.</>,
      ]} />

      <H>Data we receive from TikTok</H>
      <Ul items={[
        <><b>Account identity:</b> the account’s TikTok ID (open ID), display name, username and profile picture.</>,
        <><b>Posting settings:</b> which privacy levels the account may post with, checked before every post as TikTok requires.</>,
        <><b>Access tokens:</b> an access token (valid for a day) and a refresh token (valid for a year) that let us post for the business.</>,
        <><b>Post results:</b> whether each post was published, and its ID and link on TikTok.</>,
      ]} />
      <P>
        We do not read the account’s videos, followers, likes, comments, messages, analytics or any other TikTok user’s data.
      </P>

      <H>Data we send to TikTok</H>
      <P>Only what the business plans to post, when it is due:</P>
      <Ul items={[
        'The photo, sent as a JPEG. TikTok fetches it from a private, signed link on our domain that opens only that photo.',
        'The caption the business wrote (its first line becomes the post title).',
        'The privacy level: public when the account allows it, otherwise visible only to the account.',
      ]} />

      <H>How we use it</H>
      <Ul items={[
        'To show the business which TikTok account is connected, and whether posts can be public yet.',
        'To publish the posts the business scheduled, and show the outcome with a link to each post.',
        'To tell the business’s admins if the connection stops working, so they can connect again.',
      ]} />
      <P>
        We never sell TikTok data, use it for advertising, share it with third parties other than to run the service, or use
        it to train AI models. People at {L.service} look at it only when the business asks for help, for security, or when
        the law requires it.
      </P>

      <H>Storage and security</H>
      <P>
        TikTok tokens are encrypted by the app before they are stored, in a database hosted in the European Union (Supabase,
        Ireland). Only the server that publishes posts can decrypt them; nobody using the app, including the business’s own
        admins, can see them. Everything is sent over encrypted connections.
      </P>

      <H>How long we keep it</H>
      <Ul items={[
        'Tokens: until the business disconnects TikTok, which deletes them straight away. If the access is removed on TikTok’s side, the tokens stop working and are replaced or deleted when the business connects again or disconnects.',
        'The username and post results: as part of the business’s social planner, until the business deletes the post, disconnects TikTok or closes its account (deleted within 30 days of closing).',
      ]} />

      <H>Disconnecting and deleting your data</H>
      <Ul items={[
        <>In {L.service}: <b>Connections → TikTok → Disconnect</b>. This deletes the stored tokens immediately and stops all posting.</>,
        <>In TikTok: <b>Profile → Menu → Settings and privacy → Security and permissions → Apps and services permissions</b>, choose {L.service} and remove it. (Menu names can vary slightly between app versions.)</>,
        <>To have all data deleted, email {mail} with the subject “Delete my data”, or follow the steps on our{' '}
          <Link component={RouterLink} to="/data-deletion">data deletion</Link> page. We complete deletion within 30 days.</>,
      ]} />
      <P>Posts already published stay on TikTok until you delete them in the TikTok app.</P>

      <H>Your rights</H>
      <P>
        You can ask to access, correct, delete or export your data, or object to how it is used, by writing to {mail}. You can
        also complain to the Spanish data protection authority, the{' '}
        <Link href="https://www.aepd.es" target="_blank" rel="noreferrer">Agencia Española de Protección de Datos</Link>.
      </P>

      <H>Changes</H>
      <P>If we change this notice, we will update the date above and, for important changes, tell account owners by email.</P>

      <H>Contact</H>
      <P>Questions about TikTok data: {mail}, {operatorLine()}.</P>
    </LegalPage>
  )
}
