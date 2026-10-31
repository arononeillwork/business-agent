// "Run your café from one place": how the owner uses Business Agent in the café, one morning. Today and
// the Business advisor say what to do; four changes, each made once in the app, and everywhere each one
// shows follows (Google Maps, the website, the café's TV, the printed menu, Instagram). 114 seconds over
// video/music/owner.py, shown on the Demos page.
import { Audio } from '@remotion/media'
import { AbsoluteFill, Sequence, interpolate, staticFile, useVideoConfig } from 'remotion'
import { EndCard } from '../day/After'
import { BA } from '../theme'
import { Hub, Title } from './Intro'
import { CENTRE_LEN, Plan, TodayAndAdvisor } from './Centre'
import { Hours, Offer, Price, Reviews } from './Fix'
import { Recap } from './Outro'
import { OWNER, lenOf, type OwnerScene } from './timeline'

const at = (k: OwnerScene) => ({ from: OWNER[k][0], durationInFrames: lenOf(k) })

export function OwnerVideo() {
  const { durationInFrames } = useVideoConfig()
  const centre = OWNER.today[0]
  const plan = centre + CENTRE_LEN
  return (
    <AbsoluteFill style={{ background: BA.bg }}>
      <Sequence name="Run your café from one place" {...at('title')}><Title /></Sequence>
      <Sequence name="Today and the advisor, in the middle" {...at('hub')}><Hub /></Sequence>
      <Sequence name="Today, then the advisor" from={centre} durationInFrames={CENTRE_LEN}><TodayAndAdvisor /></Sequence>
      <Sequence name="Four things to do" from={plan} durationInFrames={OWNER.advisor[1] - plan}><Plan len={OWNER.advisor[1] - plan} /></Sequence>
      <Sequence name="1 Opening hours" {...at('hours')}><Hours len={lenOf('hours')} /></Sequence>
      <Sequence name="2 Prices" {...at('price')}><Price len={lenOf('price')} /></Sequence>
      <Sequence name="3 Offers" {...at('offer')}><Offer len={lenOf('offer')} /></Sequence>
      <Sequence name="4 Reviews" {...at('reviews')}><Reviews len={lenOf('reviews')} /></Sequence>
      <Sequence name="Made once, and the rest" {...at('recap')}><Recap len={lenOf('recap')} /></Sequence>
      <Sequence name="Brand" {...at('end')}><EndCard /></Sequence>
      <Audio src={staticFile('audio/owner-music.mp3')}
        volume={f => interpolate(f, [0, 6, durationInFrames - 45, durationInFrames], [0, 0.9, 0.9, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
    </AbsoluteFill>
  )
}
