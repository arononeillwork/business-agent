// The two changes, each made by saying it once and each made the same way, so it's easy to follow:
//   what the owner asks, the AI calling Business Agent through the connector, its answer, then where it
//   shows, each place ticking "Updated" (Business Agent itself first).
// Typed, at the counter on the laptop: Sundays close at three (update_business_details) → the app,
//   Google Maps, the website.
// Said, on the phone: 2 for 1 croissants from one today on the café TV (save_offer) → the app, the TV.
import type { ReactNode } from 'react'
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion'
import { Caption, Cream, Em, Phone, Sfx, useEnter } from '../kit'
import { Globe } from '../places'
import { ChangePill, Everywhere, type Place } from '../owner/parts'
import { MapsHours, MapsIcon, WebsiteHours } from '../owner/where'
import { BA, text } from '../theme'
import { AiText, ChatWindow, Composer, PhoneChat, ToolCall, UserBubble, keysOf, typed, typedBy, words, wordsBy } from './chat'
import { CHAT_LEN } from './timeline'
import { AppHours, AppIcon, AppOffer, TvOffer } from './where'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

/** After the chat: the change at the top, a line to each place it shows, each arriving "Updated". */
function Shows({ title, change, places }: { title: ReactNode; change: { title: string; value: string }; places: Place[] }) {
  return (
    <>
      <Caption title={title} at={0} width={1100} size={64} />
      <ChangePill at={2} title={change.title} value={change.value} />
      <Everywhere at={4} places={places} />
      {places.map((_, i) => <Sfx key={i} name="pop" at={20 + i * 10} volume={0.28} />)}
      {places.map((_, i) => <Sfx key={`p${i}`} name="ping" at={30 + i * 10} volume={0.12} />)}
    </>
  )
}

// ---------- Typed, on the laptop ----------
const TYPED = 'We’re closing at 3 on Sundays from now on.'
const T1 = { type: 26, send: 0, tool: 0, done: 0, reply: 0 }
T1.send = typedBy(TYPED, T1.type) + 10
T1.tool = T1.send + 18
T1.done = T1.tool + 40
T1.reply = T1.done + 8
const REPLY1 = 'Done. Sundays are now 09:00 to 15:00, in Business Agent, on Google Maps and on your website.'

export function Typed({ len }: { len: number }) {
  const frame = useCurrentFrame()
  const win = useEnter(2, 200)
  const winOut = interpolate(frame, [CHAT_LEN - 10, CHAT_LEN], [1, 0], clamp)
  const out = interpolate(frame, [len - 10, len], [1, 0], clamp)
  const sent = frame >= T1.send
  return (
    <Cream>
      <AbsoluteFill style={{ opacity: out }}>
        {frame < CHAT_LEN && (
          <>
            <Caption title={<>At the counter? <Em>Type it.</Em></>} at={0} out={CHAT_LEN} />
            <ChatWindow x={305} y={190} width={1310} height={820}
              style={{ opacity: win * winOut, translate: `0 ${interpolate(win, [0, 1], [80, 0]) + interpolate(winOut, [0, 1], [50, 0])}px` }}
              composer={<Composer value={sent ? '' : typed(TYPED, frame, T1.type)} typing={!sent && frame >= T1.type - 6} sendAt={T1.send} />}>
              {sent && <UserBubble at={T1.send}>{TYPED}</UserBubble>}
              <ToolCall at={T1.tool} done={T1.done} tool="Update business details" />
              <AiText at={T1.reply} text={REPLY1} />
            </ChatWindow>
          </>
        )}
        <Sequence from={CHAT_LEN} layout="none">
          <Shows title={<><Em>Instantly,</Em> everywhere it shows.</>} change={{ title: 'Opening hours', value: 'Sunday 09:00–15:00' }}
            places={[
              { name: 'Business Agent', icon: <AppIcon />, width: 470, body: a => <AppHours at={a} /> },
              { name: 'Google Maps', icon: <MapsIcon />, width: 470, body: a => <MapsHours at={a} /> },
              { name: 'Your website', icon: <Globe />, width: 470, body: a => <WebsiteHours at={a} /> },
            ]} />
        </Sequence>
      </AbsoluteFill>
      {keysOf(TYPED, T1.type).map((f, i) => <Sfx key={i} name="key" at={f} volume={0.16} />)}
      <Sfx name="click" at={T1.send} volume={0.28} />
      <Sfx name="ping" at={T1.done} volume={0.22} />
      <Sfx name="whoosh" at={CHAT_LEN - 10} volume={0.22} />
      <Sfx name="whoosh" at={len - 10} volume={0.2} />
    </Cream>
  )
}

// ---------- Said, on the phone ----------
const SAID = 'Put two for one on croissants from one o’clock today, on the café TV.'
const T2 = { mic: 46, talk: 62, send: 0, tool: 0, done: 0, reply: 0 }
T2.send = wordsBy(SAID, T2.talk, 7) + 24
T2.tool = T2.send + 16
T2.done = T2.tool + 40
T2.reply = T2.done + 8
const REPLY2 = 'Done: “2 for 1 croissants” goes on the café TV at 13:00, until you close at 18:00.'
const PHONE = 460

export function Spoken({ len }: { len: number }) {
  const frame = useCurrentFrame()
  const phone = useEnter(4, 200)
  const phoneOut = interpolate(frame, [CHAT_LEN - 10, CHAT_LEN], [1, 0], clamp)
  const out = interpolate(frame, [len - 10, len], [1, 0], clamp)
  const listening = frame >= T2.mic && frame < T2.send
  const sent = frame >= T2.send
  const heard = words(SAID, frame, T2.talk, 7)
  const screenW = PHONE - 2 * Math.round(PHONE * 0.035)
  return (
    <Cream>
      <AbsoluteFill style={{ opacity: out }}>
        {frame < CHAT_LEN && (
          <>
            <Caption title={<>On the go? <Em>Just say it.</Em></>} x={900} y={340} width={860} size={84} out={CHAT_LEN}
              sub="Tap the microphone and talk: in the car, at the market, with your hands full." />
            <div style={{ position: 'absolute', left: 300, top: 60, opacity: phone * phoneOut, translate: `0 ${interpolate(phone, [0, 1], [90, 0]) + interpolate(phoneOut, [0, 1], [40, 0])}px` }}>
              <Phone width={PHONE} style={{ position: 'relative' }}>
                <PhoneChat width={screenW}
                  composer={<Composer size={20} value="" listening={listening} micAt={T2.mic} sendAt={T2.send} />}>
                  {/* While it listens, what it hears, word by word. */}
                  {listening && heard && (
                    <div style={{ alignSelf: 'flex-end', maxWidth: 330, padding: '12px 16px', borderRadius: 20, border: `1.5px dashed ${BA.rose}`, fontFamily: text, fontSize: 21,
                      lineHeight: 1.4, color: BA.soft, fontStyle: 'italic' }}>{heard}</div>
                  )}
                  {sent && <UserBubble at={T2.send} said size={21} maxWidth={340}>{SAID}</UserBubble>}
                  <ToolCall at={T2.tool} done={T2.done} tool="Save an offer" size={15} />
                  <AiText at={T2.reply} text={REPLY2} size={21} />
                </PhoneChat>
              </Phone>
            </div>
          </>
        )}
        <Sequence from={CHAT_LEN} layout="none">
          <Shows title={<>On the TV <Em>by one.</Em></>} change={{ title: 'Offers & specials', value: '2 for 1 croissants · from 13:00' }}
            places={[
              { name: 'Business Agent', icon: <AppIcon />, width: 520, body: a => <AppOffer at={a} /> },
              { name: 'Café TV', icon: null, width: 760, bare: true, body: () => <TvOffer width={760} /> },
            ]} />
        </Sequence>
      </AbsoluteFill>
      <Sfx name="mic" at={T2.mic} volume={0.3} />
      <Sfx name="click" at={T2.send} volume={0.28} />
      <Sfx name="ping" at={T2.done} volume={0.22} />
      <Sfx name="whoosh" at={CHAT_LEN - 10} volume={0.22} />
      <Sfx name="whoosh" at={len - 10} volume={0.2} />
    </Cream>
  )
}
