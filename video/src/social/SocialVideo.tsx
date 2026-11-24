// "From an idea to a scheduled post.": Business Agent and the posts that never get made, for the Sales page's card
// "Instagram and TikTok never get posted". The café's last post, six weeks ago, and "post on Insta" crossed off week
// after week. Then the app: on Sam's phone the team's ideas for posts, one taken, the photo added and handed in; at
// the computer the owner makes the post in one press, adds a line, and schedules it for six on every account. Six
// o'clock: the post on Instagram and on TikTok, and the brand. 76 seconds over video/music/social.py.
import { Audio } from '@remotion/media'
import { AbsoluteFill, Sequence, interpolate, staticFile, useVideoConfig } from 'remotion'
import { EndCard } from '../day/After'
import { BA } from '../theme'
import { Post, Team } from './Chapters'
import { Problem, Recap, Title } from './Drawn'
import { SOCIAL, lenOf, type SocialScene } from './timeline'

const at = (k: SocialScene) => ({ from: SOCIAL[k][0], durationInFrames: lenOf(k) })

export function SocialVideo() {
  const { durationInFrames } = useVideoConfig()
  return (
    <AbsoluteFill style={{ background: BA.bg }}>
      <Sequence name="From an idea to a scheduled post." {...at('title')}><Title /></Sequence>
      <Sequence name="Six weeks ago" {...at('problem')}><Problem len={lenOf('problem')} /></Sequence>
      <Sequence name="1 The team" {...at('phone')}><Team len={lenOf('phone')} /></Sequence>
      <Sequence name="2 One press" {...at('post')}><Post len={lenOf('post')} /></Sequence>
      <Sequence name="Six o'clock" {...at('recap')}><Recap len={lenOf('recap')} /></Sequence>
      <Sequence name="Brand" {...at('end')}><EndCard /></Sequence>
      <Audio src={staticFile('audio/social-music.mp3')}
        volume={f => interpolate(f, [0, 6, durationInFrames - 45, durationInFrames], [0, 0.9, 0.9, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
    </AbsoluteFill>
  )
}
