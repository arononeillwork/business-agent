// The landing page's video: 76 seconds, 1920 × 1080, the scenes in order over the music.
import { Audio } from '@remotion/media'
import { AbsoluteFill, Sequence, interpolate, staticFile, useVideoConfig } from 'remotion'
import { SceneFade } from './kit'
import { ColdOpen } from './scenes/ColdOpen'
import { Turn } from './scenes/Turn'
import { Setup } from './scenes/Setup'
import { Hours } from './scenes/Hours'
import { Menu } from './scenes/Menu'
import { Team } from './scenes/Team'
import { Close } from './scenes/Close'
import { SCENES } from './timeline'
import { BA } from './theme'

const len = (k: keyof typeof SCENES) => SCENES[k].to - SCENES[k].from

export function LandingVideo() {
  const { durationInFrames } = useVideoConfig()
  return (
    <AbsoluteFill style={{ background: BA.bg }}>
      <Sequence name="23:47" from={SCENES.cold.from} durationInFrames={len('cold')}><ColdOpen /></Sequence>
      <Sequence name="Changed it once?" from={SCENES.turn.from} durationInFrames={len('turn')}><Turn /></Sequence>
      <Sequence name="Set up" from={SCENES.setup.from} durationInFrames={len('setup')}><SceneFade end={len('setup')} inLen={1}><Setup /></SceneFade></Sequence>
      <Sequence name="Opening hours" from={SCENES.hours.from} durationInFrames={len('hours')}><SceneFade end={len('hours')}><Hours /></SceneFade></Sequence>
      <Sequence name="Menu" from={SCENES.menu.from} durationInFrames={len('menu')}><SceneFade end={len('menu')}><Menu /></SceneFade></Sequence>
      <Sequence name="Team" from={SCENES.team.from} durationInFrames={len('team')}><SceneFade end={len('team')} outLen={6}><Team /></SceneFade></Sequence>
      <Sequence name="Close" from={SCENES.close.from} durationInFrames={len('close')}><Close /></Sequence>
      <Audio src={staticFile('audio/music.mp3')}
        volume={f => interpolate(f, [0, 6, durationInFrames - 45, durationInFrames], [0, 0.9, 0.9, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
    </AbsoluteFill>
  )
}
