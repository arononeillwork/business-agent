// "What does a flat white really cost?": Business Agent and prices set by feel, for the Sales page's card of that name.
// Easy Beans Coffee's chalkboard menu, its costs a guess; then the roaster's new price for the beans. The app, the till
// connected: a flat white built from what goes in (€0,61 to make, €2,30 to the café); the beans' new price typed once
// and every coffee recosted; the advisor's thin margin, and Pain au chocolat at €2,90, on target. The board again,
// every price with its cost, and the brand. 94 seconds over video/music/costing.py.
import { Audio } from '@remotion/media'
import { AbsoluteFill, Sequence, interpolate, staticFile, useVideoConfig } from 'remotion'
import { EndCard } from '../day/After'
import { BA } from '../theme'
import { Beans, Cost, Margin } from './Chapters'
import { Problem, Recap, Title } from './Drawn'
import { COSTING, lenOf, type CostingScene } from './timeline'

const at = (k: CostingScene) => ({ from: COSTING[k][0], durationInFrames: lenOf(k) })

export function CostingVideo() {
  const { durationInFrames } = useVideoConfig()
  return (
    <AbsoluteFill style={{ background: BA.bg }}>
      <Sequence name="What does a flat white really cost?" {...at('title')}><Title /></Sequence>
      <Sequence name="Prices by feel" {...at('problem')}><Problem len={lenOf('problem')} /></Sequence>
      <Sequence name="1 What it costs" {...at('cost')}><Cost len={lenOf('cost')} /></Sequence>
      <Sequence name="2 When costs move" {...at('beans')}><Beans len={lenOf('beans')} /></Sequence>
      <Sequence name="3 Thin margins" {...at('margin')}><Margin len={lenOf('margin')} /></Sequence>
      <Sequence name="Every price, on real costs" {...at('recap')}><Recap len={lenOf('recap')} /></Sequence>
      <Sequence name="Brand" {...at('end')}><EndCard /></Sequence>
      <Audio src={staticFile('audio/costing-music.mp3')}
        volume={f => interpolate(f, [0, 6, durationInFrames - 45, durationInFrames], [0, 0.9, 0.9, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
    </AbsoluteFill>
  )
}
