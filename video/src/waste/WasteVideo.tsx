// "Don't bin it. Sell it.": Business Agent and food waste, for the Sales page's food waste card. Easy Beans
// Coffee at closing time, its leftovers going in the bin; then a batch of banana bread logged once in the app
// with how long it keeps and when it goes half price; two days later, on its last day, it's on offer by itself,
// on Offers & specials and the café's TV; the same tray sold instead of binned. 90 seconds over
// video/music/waste.py.
import { Audio } from '@remotion/media'
import { AbsoluteFill, Sequence, interpolate, staticFile, useVideoConfig } from 'remotion'
import { EndCard } from '../day/After'
import { BA } from '../theme'
import { Bin, Title, Wait } from './Drawn'
import { Log, Offer, Screen } from './Recorded'
import { Result } from './Result'
import { WASTE, lenOf, type WasteScene } from './timeline'

const at = (k: WasteScene) => ({ from: WASTE[k][0], durationInFrames: lenOf(k) })

export function WasteVideo() {
  const { durationInFrames } = useVideoConfig()
  return (
    <AbsoluteFill style={{ background: BA.bg }}>
      <Sequence name="Don't bin it. Sell it." {...at('title')}><Title /></Sequence>
      <Sequence name="Closing time: the bin" {...at('bin')}><Bin len={lenOf('bin')} /></Sequence>
      <Sequence name="1 Log it once" {...at('log')}><Log len={lenOf('log')} /></Sequence>
      <Sequence name="Two days later" {...at('wait')}><Wait len={lenOf('wait')} /></Sequence>
      <Sequence name="2 On offer by itself" {...at('offer')}><Offer len={lenOf('offer')} /></Sequence>
      <Sequence name="3 On the café TV" {...at('tv')}><Screen len={lenOf('tv')} /></Sequence>
      <Sequence name="Sold, not binned" {...at('result')}><Result len={lenOf('result')} /></Sequence>
      <Sequence name="Brand" {...at('end')}><EndCard /></Sequence>
      <Audio src={staticFile('audio/waste-music.mp3')}
        volume={f => interpolate(f, [0, 6, durationInFrames - 45, durationInFrames], [0, 0.9, 0.9, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
    </AbsoluteFill>
  )
}
