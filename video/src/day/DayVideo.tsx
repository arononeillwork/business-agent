// "A day in the life of a café owner": the day before Business Agent (drawn), then the same day with
// it (recorded in the app), side by side, and the brand. 112 seconds over video/music/day.py.
import { Audio } from '@remotion/media'
import { AbsoluteFill, Sequence, interpolate, staticFile, useVideoConfig } from 'remotion'
import { BA } from '../theme'
import { AFTER, BEFORE, END, RECAP, TURN } from './timeline'
import { Alarm, Bills, Call, Chalkboard, Closing, LateNight, Letter, Opening, Serving, TitleCard } from './Before'
import { Accounts, CloseUp, EndCard, Home, Inbox, LastDay, Licence, OpenUp, Order, Posts, Recap, Rewind } from './After'

const at = ([from, to]: readonly [number, number]) => ({ from, durationInFrames: to - from })
const len = ([from, to]: readonly [number, number]) => to - from

export function DayVideo() {
  const { durationInFrames } = useVideoConfig()
  return (
    <AbsoluteFill style={{ background: BA.night }}>
      <Sequence name="Title" {...at(BEFORE.title)}><TitleCard /></Sequence>
      <Sequence name="06:45 alarm" {...at(BEFORE.alarm)}><Alarm /></Sequence>
      <Sequence name="07:00 opening" {...at(BEFORE.open)}><Opening /></Sequence>
      <Sequence name="09:00 serving" {...at(BEFORE.serve)}><Serving /></Sequence>
      <Sequence name="10:30 call" {...at(BEFORE.call)}><Call /></Sequence>
      <Sequence name="12:00 chalkboard" {...at(BEFORE.chalk)}><Chalkboard /></Sequence>
      <Sequence name="14:00 bills" {...at(BEFORE.bills)}><Bills /></Sequence>
      <Sequence name="15:00 closing" {...at(BEFORE.close)}><Closing /></Sequence>
      <Sequence name="21:30 laptop" {...at(BEFORE.night)}><LateNight /></Sequence>
      <Sequence name="23:10 letter" {...at(BEFORE.letter)}><Letter /></Sequence>
      <Sequence name="Rewind" {...at(TURN)}><Rewind /></Sequence>
      <Sequence name="07:00 open up" {...at(AFTER.open)}><OpenUp len={len(AFTER.open)} /></Sequence>
      <Sequence name="09:00 inbox" {...at(AFTER.messages)}><Inbox len={len(AFTER.messages)} /></Sequence>
      <Sequence name="10:30 order" {...at(AFTER.order)}><Order len={len(AFTER.order)} /></Sequence>
      <Sequence name="12:00 posts" {...at(AFTER.social)}><Posts len={len(AFTER.social)} /></Sequence>
      <Sequence name="13:00 last-day offer" {...at(AFTER.offer)}><LastDay len={len(AFTER.offer)} /></Sequence>
      <Sequence name="14:00 accounts" {...at(AFTER.accounts)}><Accounts len={len(AFTER.accounts)} /></Sequence>
      <Sequence name="14:30 licence" {...at(AFTER.licence)}><Licence len={len(AFTER.licence)} /></Sequence>
      <Sequence name="15:00 close up" {...at(AFTER.close)}><CloseUp len={len(AFTER.close)} /></Sequence>
      <Sequence name="15:30 home" {...at(AFTER.home)}><Home /></Sequence>
      <Sequence name="Side by side" {...at(RECAP)}><Recap /></Sequence>
      <Sequence name="Brand" {...at(END)}><EndCard /></Sequence>
      <Audio src={staticFile('audio/day-music.mp3')}
        volume={f => interpolate(f, [0, 6, durationInFrames - 45, durationInFrames], [0, 0.9, 0.9, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
    </AbsoluteFill>
  )
}
