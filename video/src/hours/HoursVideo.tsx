// "Month end without the spreadsheet.": Business Agent and the hours and tips, for the Sales page's card "Adding up
// hours and tips". Month end by hand: a paper timesheet added up and crossed out, and the tip jar with "÷ hours?".
// Then the app: Maria clocks in on her phone and out after her shift; on Sunday evening the week's Timecards are
// added up, a correction approved in one press, the week approved and saved for payroll; on Monday morning the card
// tips come in from Square, the jar's cash is added, and it's all shared out by the hours each person worked. Maria's
// share on her phone, and the brand. 96 seconds over video/music/hours.py.
import { Audio } from '@remotion/media'
import { AbsoluteFill, Sequence, interpolate, staticFile, useVideoConfig } from 'remotion'
import { EndCard } from '../day/After'
import { BA } from '../theme'
import { ClockIn, Hours, Tips } from './Chapters'
import { Problem, Recap, Title } from './Drawn'
import { HOURS, lenOf, type HoursScene } from './timeline'

const at = (k: HoursScene) => ({ from: HOURS[k][0], durationInFrames: lenOf(k) })

export function HoursVideo() {
  const { durationInFrames } = useVideoConfig()
  return (
    <AbsoluteFill style={{ background: BA.bg }}>
      <Sequence name="Month end without the spreadsheet." {...at('title')}><Title /></Sequence>
      <Sequence name="Month end by hand" {...at('problem')}><Problem len={lenOf('problem')} /></Sequence>
      <Sequence name="1 Clock in" {...at('phone')}><ClockIn len={lenOf('phone')} /></Sequence>
      <Sequence name="2 The hours" {...at('hours')}><Hours len={lenOf('hours')} /></Sequence>
      <Sequence name="3 The tips" {...at('tips')}><Tips len={lenOf('tips')} /></Sequence>
      <Sequence name="Already done" {...at('recap')}><Recap len={lenOf('recap')} /></Sequence>
      <Sequence name="Brand" {...at('end')}><EndCard /></Sequence>
      <Audio src={staticFile('audio/hours-music.mp3')}
        volume={f => interpolate(f, [0, 6, durationInFrames - 45, durationInFrames], [0, 0.9, 0.9, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
    </AbsoluteFill>
  )
}
