// "Just say it": Business Agent from the owner's own AI, added once as a custom connector, then used in
// whatever way suits: typed at the counter (Sundays close at three), said on the phone (2 for 1 croissants
// on the café TV from one), and anything asked (the rota, the licences, the hours). Each change lands in
// Business Agent at once and goes on to everywhere it shows. It ends on "How much is your time worth?".
// 106 seconds over video/music/say.py, shown on the Demos page.
import { Audio } from '@remotion/media'
import { AbsoluteFill, Sequence, interpolate, staticFile, useVideoConfig } from 'remotion'
import { BA } from '../theme'
import { Ask } from './Ask'
import { Spoken, Typed } from './Change'
import { Connect, Title } from './Intro'
import { Close, Compare } from './Outro'
import { SAY, lenOf, type SayScene } from './timeline'

const at = (k: SayScene) => ({ from: SAY[k][0], durationInFrames: lenOf(k) })

export function SayVideo() {
  const { durationInFrames } = useVideoConfig()
  return (
    <AbsoluteFill style={{ background: BA.bg }}>
      <Sequence name="Just say it" {...at('title')}><Title /></Sequence>
      <Sequence name="Connect it once" {...at('connect')}><Connect len={lenOf('connect')} /></Sequence>
      <Sequence name="Typed: Sundays close at three" {...at('typed')}><Typed len={lenOf('typed')} /></Sequence>
      <Sequence name="Said: 2 for 1 croissants on the TV" {...at('spoken')}><Spoken len={lenOf('spoken')} /></Sequence>
      <Sequence name="Ask it anything" {...at('ask')}><Ask len={lenOf('ask')} /></Sequence>
      <Sequence name="The usual way, or one sentence" {...at('compare')}><Compare len={lenOf('compare')} /></Sequence>
      <Sequence name="How much is your time worth?" {...at('close')}><Close /></Sequence>
      <Audio src={staticFile('audio/say-music.mp3')}
        volume={f => interpolate(f, [0, 6, durationInFrames - 45, durationInFrames], [0, 0.9, 0.9, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
    </AbsoluteFill>
  )
}
