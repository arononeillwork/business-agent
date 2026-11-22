// "Bring them back.": Business Agent and the customers who never come back, for the Sales page's card of that name.
// Easy Beans Coffee's week: a rush on Saturday, a quiet Monday, and regulars the owner knows by their order but can't
// reach. Then the app, the till connected: the regulars on Customers and who said yes, the stamp card from the till;
// the ready-made quiet-day message to them, planned for Monday; the Mondays draw the takings suggest. Monday at ten,
// the message on a regular's phone, and the brand. 94 seconds over video/music/regulars.py.
import { Audio } from '@remotion/media'
import { AbsoluteFill, Sequence, interpolate, staticFile, useVideoConfig } from 'remotion'
import { EndCard } from '../day/After'
import { BA } from '../theme'
import { Campaign, Draw, Regulars } from './Chapters'
import { Quiet, Recap, Title } from './Drawn'
import { REGULARS, lenOf, type RegularsScene } from './timeline'

const at = (k: RegularsScene) => ({ from: REGULARS[k][0], durationInFrames: lenOf(k) })

export function RegularsVideo() {
  const { durationInFrames } = useVideoConfig()
  return (
    <AbsoluteFill style={{ background: BA.bg }}>
      <Sequence name="Bring them back. On the quiet days." {...at('title')}><Title /></Sequence>
      <Sequence name="A quiet Monday" {...at('quiet')}><Quiet len={lenOf('quiet')} /></Sequence>
      <Sequence name="1 Your regulars" {...at('regulars')}><Regulars len={lenOf('regulars')} /></Sequence>
      <Sequence name="2 A message" {...at('campaign')}><Campaign len={lenOf('campaign')} /></Sequence>
      <Sequence name="3 A draw" {...at('draw')}><Draw len={lenOf('draw')} /></Sequence>
      <Sequence name="Monday, ten o'clock" {...at('recap')}><Recap len={lenOf('recap')} /></Sequence>
      <Sequence name="Brand" {...at('end')}><EndCard /></Sequence>
      <Audio src={staticFile('audio/regulars-music.mp3')}
        volume={f => interpolate(f, [0, 6, durationInFrames - 45, durationInFrames], [0, 0.9, 0.9, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
    </AbsoluteFill>
  )
}
