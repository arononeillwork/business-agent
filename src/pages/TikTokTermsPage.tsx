import { Link } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { LEGAL } from '../../shared/legal'
import { H, LegalPage, Mail, P, Ul, operatorLine } from '../components/legal'

// The TikTok terms (no sign-in needed), for TikTok's app review: the rules for publishing to TikTok
// from the Social planner. They add to the general terms of service (/terms).

const UPDATED = '2026-10-19'

const ext = (href: string, text: string) => <Link href={href} target="_blank" rel="noreferrer">{text}</Link>

export function TikTokTermsPage() {
  const L = LEGAL
  const support = <Mail to={L.supportEmail} />
  const terms = <Link component={RouterLink} to="/terms">terms of service</Link>
  const privacy = <Link component={RouterLink} to="/tiktok/privacy">TikTok privacy notice</Link>
  return (
    <LegalPage title="TikTok terms" updated={UPDATED}>
      <H>1. About these terms</H>
      <P>
        These terms apply when a business connects its TikTok account to {L.service} ({L.domain}), run by {operatorLine()}{' '}
        (“we”, “us”). They add to our {terms}; where the two differ on TikTok, these terms apply. How we handle TikTok data is
        explained in our {privacy}.
      </P>

      <H>2. What the TikTok connection does</H>
      <P>
        With TikTok connected, the business’s admins can plan photo posts in the Social planner and have {L.service} publish
        them to the business’s TikTok account at the date and time they choose. {L.service} only publishes posts the business
        has written and scheduled; it never posts on its own, and it does not read, like, comment on or follow anything.
      </P>

      <H>3. Who can connect</H>
      <Ul items={[
        'Only an admin of the business can connect TikTok, and only to a TikTok account that the business owns or is allowed to post for.',
        'Connecting means signing in on TikTok and allowing the access shown there. You can disconnect at any time (section 7).',
      ]} />

      <H>4. TikTok’s own rules</H>
      <P>Everything published through {L.service} is also subject to TikTok’s rules, which you agree to follow:</P>
      <Ul items={[
        ext('https://www.tiktok.com/legal/terms-of-service', 'TikTok Terms of Service'),
        ext('https://www.tiktok.com/community-guidelines', 'TikTok Community Guidelines'),
        <>{ext('https://www.tiktok.com/legal/page/global/music-usage-confirmation/en', 'TikTok Music Usage Confirmation')}: TikTok may add music to photo posts, so by scheduling a post to TikTok you agree to it.</>,
        <>{ext('https://www.tiktok.com/legal/page/global/bc-policy/en', 'TikTok Branded Content Policy')}, when a post promotes a brand, product or service other than your own.</>,
      ]} />

      <H>5. Your content</H>
      <Ul items={[
        'You are responsible for the photos and captions you schedule, and for having the rights to publish them, including permission from anyone who can be recognised in a photo.',
        'Captions should be honest and clearly mark advertising or paid partnerships where TikTok or the law requires it.',
        'You keep all rights to your content. You allow us to store it and send it to TikTok only to publish it as you asked.',
      ]} />

      <H>6. How publishing works</H>
      <Ul items={[
        'Photo posts need one JPEG photo; the planner checks this before scheduling.',
        'Before every post, we ask TikTok what the account may post. Posts are public when TikTok allows it; while TikTok is still reviewing our app, posts can only be private (visible to the account alone), and the app says so.',
        'TikTok processes each post after it is sent, which can take a few minutes. The Social planner shows the outcome and a link to the post. If a post fails, we retry, then show the reason.',
        'TikTok decides what it accepts and may limit, delay, remove or change how posts work. We are not responsible for TikTok’s decisions, availability or changes, or for the reach or results of any post.',
      ]} />

      <H>7. Disconnecting</H>
      <P>
        Disconnect at any time in {L.service} (Connections → TikTok → Disconnect), which deletes the stored access straight away
        and stops all scheduled posting to TikTok, or remove {L.service} in TikTok’s settings (Settings and privacy → Security
        and permissions → Apps and services permissions). Posts already published stay on TikTok until you delete them there.
      </P>

      <H>8. Not affiliated with TikTok</H>
      <P>
        {L.service} is an independent service. It is not made, sponsored or endorsed by TikTok or ByteDance. TikTok is a
        trademark of its owner.
      </P>

      <H>9. Suspension</H>
      <P>
        We may pause a business’s TikTok posting if it breaks these terms or TikTok’s rules, or if TikTok asks us to. Where we
        reasonably can, we will tell the business first.
      </P>

      <H>10. Liability, law and changes</H>
      <P>
        The liability limits, governing law (Spain, courts of Marbella) and process for changing terms in our {terms} also apply
        to these terms.
      </P>

      <H>11. Contact</H>
      <P>Questions about publishing to TikTok: {support}.</P>
    </LegalPage>
  )
}
