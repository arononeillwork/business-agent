// "Know your competition.": Business Agent's competitor insights, for the Sales page's card of that name. Easy Beans
// Coffee's street: five cafés round the corner and the owner guessing what they charge, then a new one opening that
// nobody mentioned. Then the Competitors page (Marketing): every place at a glance and what it means in plain words;
// the cappuccino against the street and the price rises lately; Google looking around every week, and the new café
// followed. The street again, known, and the brand. 88 seconds over video/music/competitors.py.
import { Audio } from '@remotion/media'
import { AbsoluteFill, Sequence, interpolate, staticFile, useVideoConfig } from 'remotion'
import { EndCard } from '../day/After'
import { BA } from '../theme'
import { Glance, Nearby, Prices } from './Chapters'
import { Problem, Recap, Title } from './Drawn'
import { COMPETITORS, lenOf, type CompetitorsScene } from './timeline'

const at = (k: CompetitorsScene) => ({ from: COMPETITORS[k][0], durationInFrames: lenOf(k) })

export function CompetitorsVideo() {
  const { durationInFrames } = useVideoConfig()
  return (
    <AbsoluteFill style={{ background: BA.bg }}>
      <Sequence name="Know your competition. Every week." {...at('title')}><Title /></Sequence>
      <Sequence name="The street: guessing" {...at('street')}><Problem len={lenOf('street')} /></Sequence>
      <Sequence name="1 At a glance" {...at('glance')}><Glance len={lenOf('glance')} /></Sequence>
      <Sequence name="2 Prices" {...at('prices')}><Prices len={lenOf('prices')} /></Sequence>
      <Sequence name="3 New nearby" {...at('nearby')}><Nearby len={lenOf('nearby')} /></Sequence>
      <Sequence name="The street, known" {...at('recap')}><Recap len={lenOf('recap')} /></Sequence>
      <Sequence name="Brand" {...at('end')}><EndCard /></Sequence>
      <Audio src={staticFile('audio/competitors-music.mp3')}
        volume={f => interpolate(f, [0, 6, durationInFrames - 45, durationInFrames], [0, 0.9, 0.9, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
    </AbsoluteFill>
  )
}
