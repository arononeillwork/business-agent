import { Link } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { LEGAL } from '../../shared/legal'
import { H, LegalPage, Mail, P, Ul, operatorLine } from '../components/legal'
import { t, tr } from '../i18n'

// The TikTok privacy notice (no sign-in needed), for TikTok's app review: exactly what the TikTok
// connection reads, keeps and sends (worker/providers/tiktok.ts, proveTikTok in worker/connections.ts).
// The general privacy policy (/privacy) covers everything else.

const UPDATED = '2026-10-19'

export function TikTokPrivacyPage() {
  const L = LEGAL
  const service = L.service
  const mail = <Mail to={L.contactEmail} />
  const privacy = <Link component={RouterLink} to="/privacy">{t('privacy policy')}</Link>
  return (
    <LegalPage title={t('TikTok privacy notice')} updated={UPDATED}>
      <P>
        {tr('This notice explains what {service} ({domain}), run by {operator}, does with data when a business connects its TikTok account. It adds to our {privacy}, which applies to everything else in {service}.', {
          service,
          domain: L.domain,
          operator: operatorLine(),
          privacy,
        })}
      </P>

      <H>{t('What the TikTok connection is for')}</H>
      <P>
        {t('A business’s admin can connect the business’s TikTok account on the Connections page, using TikTok’s own sign-in (Login Kit). {service} then publishes the photo posts the business plans in its Social planner, at the time the business chooses. It does nothing else with the account.', { service })}
      </P>
      <P>{t('We ask TikTok for two permissions only:')}</P>
      <Ul items={[
        tr('{scope}: the account’s ID, display name and profile picture, to show which account is connected.', { scope: <b>{'user.info.basic'}</b> }),
        tr('{scope}: to publish the business’s own photo posts directly to its TikTok account.', { scope: <b>{'video.publish'}</b> }),
      ]} />

      <H>{t('Data we receive from TikTok')}</H>
      <Ul items={[
        tr('{label} the account’s TikTok ID (open ID), display name, username and profile picture.', { label: <b>{t('Account identity:')}</b> }),
        tr('{label} which privacy levels the account may post with, checked before every post as TikTok requires.', { label: <b>{t('Posting settings:')}</b> }),
        tr('{label} an access token (valid for a day) and a refresh token (valid for a year) that let us post for the business.', { label: <b>{t('Access tokens:')}</b> }),
        tr('{label} whether each post was published, and its ID and link on TikTok.', { label: <b>{t('Post results:')}</b> }),
      ]} />
      <P>
        {t('We do not read the account’s videos, followers, likes, comments, messages, analytics or any other TikTok user’s data.')}
      </P>

      <H>{t('Data we send to TikTok')}</H>
      <P>{t('Only what the business plans to post, when it is due:')}</P>
      <Ul items={[
        t('The photo, sent as a JPEG. TikTok fetches it from a private, signed link on our domain that opens only that photo.'),
        t('The caption the business wrote (its first line becomes the post title).'),
        t('The privacy level: public when the account allows it, otherwise visible only to the account.'),
      ]} />

      <H>{t('How we use it')}</H>
      <Ul items={[
        t('To show the business which TikTok account is connected, and whether posts can be public yet.'),
        t('To publish the posts the business scheduled, and show the outcome with a link to each post.'),
        t('To tell the business’s admins if the connection stops working, so they can connect again.'),
      ]} />
      <P>
        {t('We never sell TikTok data, use it for advertising, share it with third parties other than to run the service, or use it to train AI models. People at {service} look at it only when the business asks for help, for security, or when the law requires it.', { service })}
      </P>

      <H>{t('Storage and security')}</H>
      <P>
        {t('TikTok tokens are encrypted by the app before they are stored, in a database hosted in the European Union (Supabase, Ireland). Only the server that publishes posts can decrypt them; nobody using the app, including the business’s own admins, can see them. Everything is sent over encrypted connections.')}
      </P>

      <H>{t('How long we keep it')}</H>
      <Ul items={[
        t('Tokens: until the business disconnects TikTok, which deletes them straight away. If the access is removed on TikTok’s side, the tokens stop working and are replaced or deleted when the business connects again or disconnects.'),
        t('The username and post results: as part of the business’s social planner, until the business deletes the post, disconnects TikTok or closes its account (deleted within 30 days of closing).'),
      ]} />

      <H>{t('Disconnecting and deleting your data')}</H>
      <Ul items={[
        tr('In {service}: {path}. This deletes the stored tokens immediately and stops all posting.', {
          service,
          path: <b>{t('Connections → TikTok → Disconnect')}</b>,
        }),
        tr('In TikTok: {path}, choose {service} and remove it. (Menu names can vary slightly between app versions.)', {
          service,
          path: <b>{t('Profile → Menu → Settings and privacy → Security and permissions → Apps and services permissions')}</b>,
        }),
        tr('To have all data deleted, email {mail} with the subject {subject}, or follow the steps on our {deletion} page. We complete deletion within 30 days.', {
          mail,
          subject: t('“Delete my data”'),
          deletion: <Link component={RouterLink} to="/data-deletion">{t('data deletion')}</Link>,
        }),
      ]} />
      <P>{t('Posts already published stay on TikTok until you delete them in the TikTok app.')}</P>

      <H>{t('Your rights')}</H>
      <P>
        {tr('You can ask to access, correct, delete or export your data, or object to how it is used, by writing to {mail}. You can also complain to the Spanish data protection authority, the {authority}.', {
          mail,
          authority: <Link href="https://www.aepd.es" target="_blank" rel="noreferrer">{'Agencia Española de Protección de Datos'}</Link>,
        })}
      </P>

      <H>{t('Changes')}</H>
      <P>{t('If we change this notice, we will update the date above and, for important changes, tell account owners by email.')}</P>

      <H>{t('Contact')}</H>
      <P>{tr('Questions about TikTok data: {mail}, {who}.', { mail, who: operatorLine() })}</P>
    </LegalPage>
  )
}
