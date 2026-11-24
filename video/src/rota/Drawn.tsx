// The shared rota video's drawn scenes: the title; the rota somewhere in the team's group chat (a photo of a paper
// rota, "is this the new one?", "who's on Saturday?"); the rota on WhatsApp, if you like (Sam's own shifts from the
// café's number, as the `rota_published` template words them for Easy Beans, in Spanish; and the whole week in the
// team's group, the message the app wrote, from video/capture/rota.mjs); and one rota with every phone round it.
// The chats are drawn, not WhatsApp's app, with its mark. The demo's Julio is Sam here, as in the recordings.
import type { ReactNode } from 'react'
import { AbsoluteFill, Img, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { siWhatsapp } from 'simple-icons'
import { Caption, Card, Cream, Em, Logo, Phone, Sfx, Tick, useEnter } from '../kit'
import { BA, display, hand, text } from '../theme'
import group from '../../public/clips/rota-group.json'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

function Word({ children, at, italic }: { children: string; at: number; italic?: boolean }) {
  const p = useEnter(at, 16)
  return (
    <span style={{ display: 'inline-block', opacity: Math.min(1, p * 1.3), translate: `0 ${interpolate(p, [0, 1], [40, 0])}px`,
      fontStyle: italic ? 'italic' : 'normal', color: italic ? BA.roseDeep : BA.ink, marginRight: '0.24em' }}>{children}</span>
  )
}

export function Title() {
  const frame = useCurrentFrame()
  const eyebrow = useEnter(4, 200)
  const out = interpolate(frame, [108, 120], [1, 0], clamp)
  return (
    <Cream>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: out }}>
        <div style={{ fontFamily: text, fontWeight: 600, fontSize: 28, letterSpacing: '0.16em', textTransform: 'uppercase', color: BA.roseDeep,
          opacity: eyebrow, translate: `0 ${interpolate(eyebrow, [0, 1], [14, 0])}px`, marginBottom: 26 }}>Easy Beans Coffee · A shared rota</div>
        <div style={{ fontFamily: display, fontWeight: 500, fontSize: 132, lineHeight: 1.06, letterSpacing: '-0.02em', textAlign: 'center' }}>
          <div><Word at={10}>One</Word><Word at={14}>rota.</Word></div>
          <div><Word at={28} italic>Everyone</Word><Word at={32} italic>on</Word><Word at={36} italic>the</Word><Word at={40} italic>same</Word><Word at={44} italic>page.</Word></div>
        </div>
      </AbsoluteFill>
      <Sfx name="pop" at={30} volume={0.22} />
    </Cream>
  )
}

/** WhatsApp's *bold*, as it shows in a chat. */
function Rich({ children }: { children: string }) {
  return <>{children.split(/(\*[^*\n]+\*)/g).map((part, i) => (part.startsWith('*') && part.endsWith('*') ? <b key={i}>{part.slice(1, -1)}</b> : <span key={i}>{part}</span>))}</>
}

interface Message { at: number; from?: string; colour?: string; me?: boolean; body: ReactNode }

/** A chat on a phone: its name at the top, the messages arriving one by one. */
function Chat({ title, sub, avatar, messages, time = '18:20' }: { title: string; sub: string; avatar: ReactNode; messages: Message[]; time?: string }) {
  const frame = useCurrentFrame()
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#EFE9E1', fontFamily: text, color: BA.ink, display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 44, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 26px 6px', fontSize: 14, fontWeight: 600, background: '#fff' }}>
        <span>{time}</span><Logo icon={siWhatsapp} size={16} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px 12px', background: '#fff', borderBottom: `1px solid ${BA.line}` }}>
        {avatar}
        <div><div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div><div style={{ fontSize: 12, color: BA.faint }}>{sub}</div></div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 8, padding: '12px 12px 18px', overflow: 'hidden' }}>
        {messages.filter(m => frame >= m.at).map((m, i) => {
          const p = interpolate(frame, [m.at, m.at + 8], [0, 1], clamp)
          return (
            <div key={i} style={{ alignSelf: m.me ? 'flex-end' : 'flex-start', maxWidth: '86%', padding: '8px 11px', borderRadius: m.me ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
              background: m.me ? '#DDF3D0' : '#fff', boxShadow: '0 1px 1px rgba(0,0,0,0.08)', fontSize: 13, lineHeight: 1.38, whiteSpace: 'pre-wrap',
              opacity: p, translate: `0 ${interpolate(p, [0, 1], [16, 0])}px` }}>
              {m.from && <div style={{ fontWeight: 700, fontSize: 12, color: m.colour ?? BA.roseDeep, marginBottom: 2 }}>{m.from}</div>}
              {m.body}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const Initial = ({ letter, colour, size = 34 }: { letter: string; colour: string; size?: number }) => (
  <div style={{ width: size, height: size, borderRadius: size / 2, background: colour, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: size * 0.42 }}>{letter}</div>
)

/** A photo of last week's paper rota, crossed out and written over. */
function PaperRota() {
  return (
    <div style={{ width: 230, height: 160, background: '#FBF8F1', rotate: '-3deg', borderRadius: 4, boxShadow: '0 2px 6px rgba(0,0,0,0.18)', padding: '10px 12px',
      boxSizing: 'border-box', fontFamily: hand, fontSize: 17, lineHeight: 1.15, color: '#3a3a3a', backgroundImage: 'repeating-linear-gradient(transparent 0 21px, #D9E3EE 21px 22px)' }}>
      <div style={{ fontWeight: 700, fontSize: 20 }}>ROTA <span style={{ color: '#C5221F' }}>v3 FINAL</span></div>
      <div>Mon–Fri: Sam 7:45, Maria 10</div>
      <div><s>Sat: Maria, Mark</s> Sat: ??</div>
      <div><s>Sun: Sam</s> Sun: ask Maria</div>
    </div>
  )
}

export function Problem({ len }: { len: number }) {
  const frame = useCurrentFrame()
  const phone = useEnter(6, 200)
  const second = 180
  const out = interpolate(frame, [len - 12, len], [1, 0], clamp)
  const messages: Message[] = [
    { at: 16, me: true, body: <><PaperRota /><div style={{ marginTop: 6 }}>New rota 👆</div></> },
    { at: 70, from: 'Maria', colour: '#B3404F', body: 'Is this the new one? 🤔' },
    { at: 110, from: 'Sam', colour: '#4A6536', body: 'Am I on Saturday?' },
    { at: 150, from: 'Maria', colour: '#B3404F', body: 'I thought I was off Tuesday?' },
    { at: second + 20, me: true, body: 'Sorry, v4 coming tonight 🙈' },
    { at: second + 70, from: 'Mark', colour: '#5B4A86', body: 'Who’s on Saturday then?' },
  ]
  return (
    <Cream>
      <AbsoluteFill style={{ opacity: out }}>
        <Sequence durationInFrames={second} layout="none"><Caption title={<>The rota, <Em>somewhere in the group chat.</Em></>} at={4} out={second} width={1400} size={64} /></Sequence>
        <Sequence from={second} layout="none"><Caption title={<>“Who’s on Saturday?” <Em>Again.</Em></>} width={1400} size={64} /></Sequence>
        <div style={{ position: 'absolute', left: 760, top: 170, opacity: phone, translate: `0 ${interpolate(phone, [0, 1], [70, 0])}px` }}>
          <Phone width={400}>
            <Chat title="Team Easy Beans" sub="Maria, Sam, Mark, you" avatar={<Img src={staticFile('brand/icon.png')} style={{ width: 34, height: 34, borderRadius: 17 }} />} messages={messages} />
          </Phone>
        </div>
      </AbsoluteFill>
      {messages.map(m => <Sfx key={m.at} name="pop" at={m.at} volume={0.14} />)}
      <Sfx name="whoosh" at={len - 12} volume={0.2} />
    </Cream>
  )
}

function Label({ at, children }: { at: number; children: ReactNode }) {
  const p = useEnter(at, 200)
  return <div style={{ fontFamily: text, fontWeight: 600, fontSize: 26, color: BA.ink, textAlign: 'center', marginTop: 22, width: 560, marginLeft: -110, opacity: p }}>{children}</div>
}

/** Sam's own shifts, as the café's WhatsApp number sends them (the `rota_published` template, Easy Beans' Spanish). */
const SAM = 'Hola Sam, tus turnos de la semana del 07/12: Mon 07 07:45-15:00, Tue 08 07:45-15:00, Wed 09 07:45-15:00, Thu 10 07:45-15:00, Fri 11 07:45-15:00, Sat 12 09:00-14:00'

export function Chats({ len }: { len: number }) {
  const frame = useCurrentFrame()
  const a = useEnter(6, 200)
  const b = useEnter(16, 200)
  const out = interpolate(frame, [len - 12, len], [1, 0], clamp)
  return (
    <Cream>
      <AbsoluteFill style={{ opacity: out }}>
        <Caption title={<>WhatsApp too, <Em>if you like.</Em></>} at={0} width={1400} size={64} />
        <div style={{ position: 'absolute', left: 440, top: 170, width: 340, opacity: a, translate: `0 ${interpolate(a, [0, 1], [70, 0])}px` }}>
          <div style={{ position: 'relative', height: 712 }}>
            <Phone width={340}>
              <Chat title="Easy Beans Coffee" sub="Business account" avatar={<Img src={staticFile('brand/icon.png')} style={{ width: 34, height: 34, borderRadius: 17 }} />}
                messages={[{ at: 30, body: SAM }]} time="18:05" />
            </Phone>
          </div>
          <Label at={40}>Each person: <Em>their own shifts</Em></Label>
        </div>
        <div style={{ position: 'absolute', left: 1140, top: 170, width: 340, opacity: b, translate: `0 ${interpolate(b, [0, 1], [70, 0])}px` }}>
          <div style={{ position: 'relative', height: 712 }}>
            <Phone width={340}>
              <Chat title="Team Easy Beans" sub="Maria, Sam, Mark, you" avatar={<Img src={staticFile('brand/icon.png')} style={{ width: 34, height: 34, borderRadius: 17 }} />}
                messages={[{ at: 60, me: true, body: <Rich>{group.text}</Rich> }, { at: 130, from: 'Maria', colour: '#B3404F', body: '👍 Got it, Sunday’s mine' }]} time="18:06" />
            </Phone>
          </div>
          <Label at={70}>The team’s group: <Em>the whole week</Em></Label>
        </div>
      </AbsoluteFill>
      <Sfx name="ping" at={30} volume={0.2} />
      <Sfx name="ping" at={60} volume={0.2} />
      <Sfx name="pop" at={130} volume={0.14} />
      <Sfx name="whoosh" at={len - 12} volume={0.2} />
    </Cream>
  )
}

/** One of the team's phones round the rota, arriving at `at`. */
function PersonPhone({ name, colour, x, y, at }: { name: string; colour: string; x: number; y: number; at: number }) {
  const q = useEnter(at, 14)
  return (
    <div style={{ position: 'absolute', left: 350 + x - 46, top: 280 + y - 70, width: 92, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      opacity: Math.min(1, q * 1.5), scale: String(interpolate(q, [0, 1], [0.7, 1])) }}>
      <div style={{ width: 64, height: 110, borderRadius: 14, background: '#1F1A17', padding: 5, boxSizing: 'border-box' }}>
        <div style={{ width: '100%', height: '100%', borderRadius: 10, background: '#fff', display: 'grid', placeItems: 'center' }}><Initial letter={name[0]} colour={colour} size={30} /></div>
      </div>
      <div style={{ fontFamily: text, fontWeight: 600, fontSize: 20, color: BA.ink }}>{name}</div>
    </div>
  )
}

/** The one rota, and the team's phones round it, each lit as the rota reaches it. */
function Hub({ at }: { at: number }) {
  const frame = useCurrentFrame()
  const people = [
    { name: 'Maria', colour: '#B3404F', x: -250, y: -170 }, { name: 'Sam', colour: '#4A6536', x: 250, y: -170 },
    { name: 'Mark', colour: '#5B4A86', x: -250, y: 170 }, { name: 'Cleaner', colour: '#6B625A', x: 250, y: 170 },
  ]
  const centre = useEnter(at, 200)
  return (
    <div style={{ position: 'relative', width: 700, height: 560 }}>
      <svg width={700} height={560} style={{ position: 'absolute', inset: 0 }}>
        {people.map((p, i) => {
          const k = interpolate(frame, [at + 14 + i * 8, at + 30 + i * 8], [0, 1], clamp)
          return <line key={p.name} x1={350} y1={280} x2={350 + p.x * k} y2={280 + p.y * k} stroke={BA.rose} strokeWidth={4} strokeDasharray="10 10" />
        })}
      </svg>
      <Card style={{ position: 'absolute', left: 230, top: 200, width: 240, padding: '18px 20px', boxSizing: 'border-box', fontFamily: text, textAlign: 'center',
        scale: String(interpolate(centre, [0, 1], [0.8, 1])), opacity: centre }}>
        <div style={{ fontWeight: 700, fontSize: 24, color: BA.ink }}>The rota</div>
        <div style={{ fontSize: 17, color: BA.faint, marginTop: 4 }}>7–13 Dec · one place</div>
      </Card>
      {people.map((p, i) => <PersonPhone key={p.name} {...p} at={at + 26 + i * 8} />)}
    </div>
  )
}

function Point({ at, children }: { at: number; children: ReactNode }) {
  const p = useEnter(at, 200)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontFamily: text, fontSize: 29, lineHeight: 1.3, color: BA.ink, opacity: p,
      translate: `${interpolate(p, [0, 1], [40, 0])}px 0` }}>
      <Tick at={at + 4} label="" size={22} /><span>{children}</span>
    </div>
  )
}

export function Recap({ len }: { len: number }) {
  const frame = useCurrentFrame()
  const line = useEnter(120, 200)
  const out = interpolate(frame, [len - 12, len], [1, 0], clamp)
  return (
    <Cream>
      <AbsoluteFill style={{ opacity: out }}>
        <Caption title={<>One rota. <Em>Every phone.</Em></>} at={0} width={1400} size={64} />
        <div style={{ position: 'absolute', left: 250, top: 230 }}><Hub at={6} /></div>
        <div style={{ position: 'absolute', left: 1050, top: 330, width: 560, display: 'flex', flexDirection: 'column', gap: 28 }}>
          <Point at={50}>One rota, in one place</Point>
          <Point at={64}>Changed once, seen by everyone</Point>
          <Point at={78}>Open shifts taken in a tap</Point>
          <Point at={92}>On WhatsApp too, if you like</Point>
          <div style={{ fontFamily: text, fontSize: 27, lineHeight: 1.5, color: BA.soft, marginTop: 6, opacity: line }}>
            The rota goes out in minutes, and “who’s on Saturday?” stops being a question.
          </div>
        </div>
      </AbsoluteFill>
      {[50, 64, 78, 92].map(f => <Sfx key={f} name="pop" at={f + 4} volume={0.16} />)}
      <Sfx name="whoosh" at={len - 12} volume={0.2} />
    </Cream>
  )
}
