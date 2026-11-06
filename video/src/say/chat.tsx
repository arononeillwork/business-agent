// The AI the owner talks to, drawn (not a picture of any one app): a chat with Business Agent added as a
// custom connector, on a laptop and on a phone. What's typed appears letter by letter in the box; what's
// said comes in word by word while the microphone listens; the AI's call to the connector shows as a
// line ("Easy Beans Coffee · Update business details") that ticks when it's done; its answer streams in.
import type { CSSProperties, ReactNode } from 'react'
import { Img, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { siClaude } from 'simple-icons'
import { Logo, useEnter } from '../kit'
import { BA, display, text } from '../theme'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

/** How much of `s` is typed by `frame`: one character every `per` frames from `at`. */
export const typed = (s: string, frame: number, at: number, per = 2.4) => s.slice(0, Math.max(0, Math.floor((frame - at) / per)))
/** The frame the last character of `s` is typed. */
export const typedBy = (s: string, at: number, per = 2.4) => at + Math.ceil(s.length * per)
/** The frames each key is pressed at, for the key sound (every other character, not the spaces). */
export const keysOf = (s: string, at: number, per = 2.4) => [...s].flatMap((c, i) => (c !== ' ' && i % 2 === 0 ? [Math.round(at + i * per)] : []))
/** How much of `s` has come in by `frame`, word by word, one every `per` frames from `at`. */
export const words = (s: string, frame: number, at: number, per = 4) => {
  const all = s.split(' ')
  const n = Math.max(0, Math.min(all.length, Math.floor((frame - at) / per) + 1))
  return frame < at ? '' : all.slice(0, n).join(' ')
}
export const wordsBy = (s: string, at: number, per = 4) => at + (s.split(' ').length - 1) * per

/** The caret at the end of what's being typed. */
export function Caret({ height = 30 }: { height?: number }) {
  const frame = useCurrentFrame()
  return <span style={{ display: 'inline-block', width: 3, height, marginLeft: 2, verticalAlign: 'text-bottom', background: BA.ink, opacity: Math.floor(frame / 15) % 2 ? 0 : 1 }} />
}

/** The AI's mark beside what it says. */
export const AiMark = ({ size = 34 }: { size?: number }) => (
  <span style={{ width: size, height: size, borderRadius: size / 2, background: '#F6EEE8', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
    <Logo icon={siClaude} size={size * 0.62} />
  </span>
)

/** What the owner sent: a bubble on the right (a microphone on it when it was said). */
export function UserBubble({ at, children, said, size = 28, maxWidth = 760 }: { at: number; children: ReactNode; said?: boolean; size?: number; maxWidth?: number }) {
  const p = useEnter(at, 200)
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', opacity: p, translate: `0 ${interpolate(p, [0, 1], [18, 0])}px` }}>
      <div style={{ maxWidth, padding: `${size * 0.5}px ${size * 0.75}px`, borderRadius: size * 0.9, background: BA.tint, fontFamily: text, fontSize: size, lineHeight: 1.35,
        color: BA.ink, display: 'flex', gap: size * 0.4, alignItems: 'flex-start' }}>
        {said && <span style={{ marginTop: size * 0.12 }}><MicGlyph size={size * 0.9} color={BA.roseDeep} /></span>}
        <span>{children}</span>
      </div>
    </div>
  )
}

/** What the AI says back, streaming in beside its mark. */
export function AiText({ at, text: s, per = 3, size = 28, children }: { at: number; text: string; per?: number; size?: number; children?: ReactNode }) {
  const frame = useCurrentFrame()
  if (frame < at) return null
  return (
    <div style={{ display: 'flex', gap: size * 0.5, alignItems: 'flex-start', fontFamily: text, fontSize: size, lineHeight: 1.4, color: BA.ink }}>
      <AiMark size={size * 1.25} />
      <div style={{ flex: 1, paddingTop: size * 0.05 }}>{words(s, frame, at, per)}{children}</div>
    </div>
  )
}

/** The AI calling Business Agent through its connector: the business, the tool, and a tick once it's done. */
export function ToolCall({ at, done, tool, size = 24, business = 'Easy Beans Coffee' }: { at: number; done: number; tool: string; size?: number; business?: string }) {
  const frame = useCurrentFrame()
  const p = useEnter(at, 200)
  if (frame < at) return null
  const ok = frame >= done
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.55, marginLeft: size * 1.75, padding: `${size * 0.45}px ${size * 0.8}px ${size * 0.45}px ${size * 0.45}px`,
      alignSelf: 'flex-start', borderRadius: size * 0.6, border: `1px solid ${BA.line}`, background: '#fff', fontFamily: text, fontSize: size, color: BA.soft,
      opacity: p, translate: `0 ${interpolate(p, [0, 1], [12, 0])}px`, width: 'fit-content' }}>
      <Img src={staticFile('brand/icon.png')} style={{ width: size * 1.45, height: size * 1.45, borderRadius: size * 0.4, border: `1px solid ${BA.line}`, padding: 2, background: '#fff' }} />
      <span style={{ fontWeight: 600, color: BA.ink }}>{business}</span>
      <span style={{ color: BA.faint }}>·</span>
      <span>{tool}</span>
      {ok ? <Check size={size * 1.05} /> : <Spinner size={size * 0.9} />}
    </div>
  )
}

export const Check = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill={BA.good} /><path d="M7 12.5l3.2 3.2L17 9" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
)

function Spinner({ size = 22 }: { size?: number }) {
  const frame = useCurrentFrame()
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ rotate: `${frame * 14}deg` }}>
      <circle cx="12" cy="12" r="9" fill="none" stroke={BA.line} strokeWidth="3" />
      <path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke={BA.roseDeep} strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export const MicGlyph = ({ size = 28, color = BA.ink }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24"><rect x="8.5" y="3" width="7" height="12" rx="3.5" fill={color} /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" stroke={color} strokeWidth="1.9" fill="none" strokeLinecap="round" /></svg>
)
const SendGlyph = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
)

/** The connector, on in this chat: a small plug and the business's name. */
export function ConnectorPill({ size = 20, name = 'Easy Beans Coffee' }: { size?: number; name?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.45, padding: `${size * 0.3}px ${size * 0.75}px ${size * 0.3}px ${size * 0.35}px`, borderRadius: 999,
      background: BA.goodSoft, color: BA.good, fontFamily: text, fontWeight: 600, fontSize: size, whiteSpace: 'nowrap' }}>
      <Img src={staticFile('brand/icon.png')} style={{ width: size * 1.35, height: size * 1.35, borderRadius: size * 0.4, background: '#fff', padding: 1 }} />
      {name}
      <span style={{ width: size * 0.45, height: size * 0.45, borderRadius: '50%', background: BA.good }} />
    </span>
  )
}

/** The box at the bottom: what's being typed (or the placeholder), the microphone, and send. */
export function Composer({ value, typing, listening, micAt, sendAt, size = 26, style }: {
  value: string; typing?: boolean; listening?: boolean; micAt?: number; sendAt?: number; size?: number; style?: CSSProperties
}) {
  const frame = useCurrentFrame()
  const pressMic = micAt !== undefined ? interpolate(frame, [micAt, micAt + 4, micAt + 10], [1, 0.82, 1], clamp) : 1
  const pressSend = sendAt !== undefined ? interpolate(frame, [sendAt, sendAt + 4, sendAt + 10], [1, 0.82, 1], clamp) : 1
  const ready = value.length > 0 && !listening
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.5, padding: `${size * 0.55}px ${size * 0.55}px ${size * 0.55}px ${size * 0.9}px`, borderRadius: size * 1.1,
      background: '#fff', border: `1px solid ${BA.line}`, boxShadow: '0 10px 30px rgba(60,40,30,0.08)', fontFamily: text, fontSize: size, ...style }}>
      <div style={{ flex: 1, minHeight: size * 1.4, display: 'flex', alignItems: 'center', color: value ? BA.ink : BA.faint, lineHeight: 1.35 }}>
        {listening ? <Waveform size={size} /> : <span>{value || 'Ask anything…'}{typing && <Caret height={size * 1.1} />}</span>}
      </div>
      <span style={{ width: size * 1.8, height: size * 1.8, borderRadius: '50%', display: 'grid', placeItems: 'center', scale: String(pressMic),
        background: listening ? BA.roseDeep : 'transparent', boxShadow: listening ? `0 0 0 ${6 + 4 * Math.sin(frame / 5)}px rgba(168,90,104,0.18)` : 'none' }}>
        <MicGlyph size={size * 1.05} color={listening ? '#fff' : BA.soft} />
      </span>
      <span style={{ width: size * 1.8, height: size * 1.8, borderRadius: '50%', display: 'grid', placeItems: 'center', scale: String(pressSend),
        background: ready ? BA.ink : BA.line }}>
        <SendGlyph size={size} />
      </span>
    </div>
  )
}

/** The microphone listening: bars that move with the voice. */
export function Waveform({ size = 26, bars = 30 }: { size?: number; bars?: number }) {
  const frame = useCurrentFrame()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.16, height: size * 1.4 }}>
      {Array.from({ length: bars }, (_, i) => {
        const h = 0.18 + 0.82 * Math.abs(Math.sin(frame / 3.1 + i * 0.9) * Math.sin(frame / 7.3 + i * 0.37))
        return <span key={i} style={{ width: size * 0.16, height: size * 1.3 * h, borderRadius: size, background: BA.roseDeep, opacity: 0.55 + 0.45 * h }} />
      })}
    </div>
  )
}

/** The chat app on a computer: its top bar (the AI, the connector on), the conversation, and the box. */
export function ChatWindow({ x, y, width, height, children, composer, style }: {
  x: number; y: number; width: number; height: number; children: ReactNode; composer: ReactNode; style?: CSSProperties
}) {
  return (
    <div style={{ position: 'absolute', left: x, top: y, width, height, borderRadius: 22, overflow: 'hidden', background: '#FDFBF9',
      boxShadow: '0 40px 90px rgba(60,40,30,0.22), 0 8px 24px rgba(60,40,30,0.10), 0 0 0 1px rgba(43,37,34,0.08)', display: 'flex', flexDirection: 'column', ...style }}>
      <div style={{ height: 64, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14, padding: '0 24px', borderBottom: `1px solid ${BA.line}`, background: '#fff' }}>
        {['#F2766B', '#F4BF4F', '#61C554'].map(c => <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />)}
        <span style={{ marginLeft: 14 }}><Logo icon={siClaude} size={28} /></span>
        <span style={{ fontFamily: display, fontWeight: 500, fontSize: 28, color: BA.ink }}>Claude</span>
        <span style={{ flex: 1 }} />
        <ConnectorPill />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 22, padding: '28px 120px 20px', overflow: 'hidden',
        maskImage: 'linear-gradient(to bottom, transparent 0, #000 70px)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 70px)' }}>{children}</div>
      <div style={{ padding: '0 110px 28px' }}>{composer}</div>
    </div>
  )
}

/** The chat app on a phone's screen (drawn at the phone's 393 × 852 and scaled to it). */
export function PhoneChat({ width, children, composer }: { width: number; children: ReactNode; composer: ReactNode }) {
  const k = width / 393
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#FDFBF9' }}>
      <div style={{ width: 393, height: 852, transformOrigin: '0 0', scale: String(k), display: 'flex', flexDirection: 'column', fontFamily: text }}>
        <div style={{ height: 112, flexShrink: 0, display: 'flex', alignItems: 'flex-end', gap: 9, padding: '0 18px 12px', borderBottom: `1px solid ${BA.line}`, background: '#fff' }}>
          <Logo icon={siClaude} size={22} />
          <span style={{ fontFamily: display, fontWeight: 500, fontSize: 21, color: BA.ink }}>Claude</span>
          <span style={{ flex: 1 }} />
          <ConnectorPill size={13} />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 14, padding: '16px 16px 12px', overflow: 'hidden' }}>{children}</div>
        <div style={{ padding: '0 12px 34px' }}>{composer}</div>
      </div>
    </div>
  )
}
