// "One rota. Everyone on the same page.": Business Agent's shared rota, for the Sales page's card of that name. The
// rota somewhere in the team's group chat, "who's on Saturday?" again. Then one rota in one place: the owner adds Sam's
// Saturday once; Maria's phone shows the same rota and she takes Sunday's open shift in a tap; back at the computer
// it's all there, and it goes on WhatsApp too if you like, each person their own shifts and the whole week to the
// team's group. One rota with every phone round it, and the brand. 96 seconds over video/music/rota.py.
import { Audio } from '@remotion/media'
import { AbsoluteFill, Sequence, interpolate, staticFile, useVideoConfig } from 'remotion'
import { EndCard } from '../day/After'
import { BA } from '../theme'
import { Change, EveryPhone, WhatsApp } from './Chapters'
import { Chats, Problem, Recap, Title } from './Drawn'
import { ROTA, lenOf, type RotaScene } from './timeline'

const at = (k: RotaScene) => ({ from: ROTA[k][0], durationInFrames: lenOf(k) })

export function RotaVideo() {
  const { durationInFrames } = useVideoConfig()
  return (
    <AbsoluteFill style={{ background: BA.bg }}>
      <Sequence name="One rota. Everyone on the same page." {...at('title')}><Title /></Sequence>
      <Sequence name="The group chat" {...at('problem')}><Problem len={lenOf('problem')} /></Sequence>
      <Sequence name="1 One rota" {...at('change')}><Change len={lenOf('change')} /></Sequence>
      <Sequence name="2 Every phone" {...at('phone')}><EveryPhone len={lenOf('phone')} /></Sequence>
      <Sequence name="3 WhatsApp too" {...at('whatsapp')}><WhatsApp len={lenOf('whatsapp')} /></Sequence>
      <Sequence name="WhatsApp, if you like" {...at('chats')}><Chats len={lenOf('chats')} /></Sequence>
      <Sequence name="One rota, every phone" {...at('recap')}><Recap len={lenOf('recap')} /></Sequence>
      <Sequence name="Brand" {...at('end')}><EndCard /></Sequence>
      <Audio src={staticFile('audio/rota-music.mp3')}
        volume={f => interpolate(f, [0, 6, durationInFrames - 45, durationInFrames], [0, 0.9, 0.9, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
    </AbsoluteFill>
  )
}
