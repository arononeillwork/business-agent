// 18:00. The café closed at three, and its owner is still at it: to-do lists, reminders and the same
// change to make in app after app pile up, faster and faster. Then the review when one's missed.
import type { ReactNode } from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import { siGmail, siGoogle, siGooglemaps, siInstagram, siSquare, siWhatsapp } from 'simple-icons'
import { Caption, Logo, Sfx, easeOut, useEnter } from '../kit'
import { BA, display, hand, text } from '../theme'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
const START = 96   // the first thing to do
const SPAN = 112   // and the last, this long after
const REVIEW = 216 // the 1-star review

const Glyph = ({ d, color = BA.ink, size = 30 }: { d: string; color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24"><path d={d} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></svg>
)
const GLOBE = 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-9 9h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z'
const TV = 'M3 5h18v12H3zM8 21h8M12 17v4'
const BAG = 'M5 8h14l-1 13H6L5 8zm4 0V6a3 3 0 0 1 6 0v2'
const CAL = 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5'
const BELL = 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0'

type Item =
  | { kind: 'note'; x: number; y: number; r: number; colour: string; title: string; lines: string[] }
  | { kind: 'window'; x: number; y: number; r: number; icon: ReactNode; name: string; task: string; value: string }
  | { kind: 'ping'; x: number; y: number; icon: ReactNode; app: string; message: string }

// In the order they arrive.
const ITEMS: Item[] = [
  { kind: 'window', x: 470, y: 130, r: -2, icon: <Logo icon={siGooglemaps} size={28} />, name: 'Google Maps', task: 'Holiday hours · 24–26 Dec', value: 'Closed' },
  { kind: 'note', x: 110, y: 160, r: -4, colour: '#FFF1BF', title: 'Christmas!', lines: ['Google hours', 'Website footer', 'Sign on the door', 'Tell the team'] },
  { kind: 'ping', x: 1180, y: 80, icon: <Logo icon={siWhatsapp} size={30} />, app: 'WhatsApp', message: 'Julio: can’t do Sunday, sorry' },
  { kind: 'window', x: 1060, y: 190, r: 2, icon: <Glyph d={GLOBE} />, name: 'Your website', task: 'Footer · Opening hours', value: 'Sunday: Closed' },
  { kind: 'ping', x: 690, y: 92, icon: <Glyph d={BELL} color={BA.roseDeep} />, app: 'Reminders', message: 'Reprint the drinks menu' },
  { kind: 'note', x: 1500, y: 150, r: 3, colour: '#FCE2E6', title: 'New prices', lines: ['Flat white €3.80', 'Square', 'Menus × 12', 'TV board'] },
  { kind: 'window', x: 170, y: 500, r: 1.5, icon: <Logo icon={siSquare} size={28} />, name: 'Square', task: 'Flat White · price', value: '€3.80' },
  { kind: 'ping', x: 70, y: 410, icon: <Logo icon={siGoogle} size={30} />, app: 'Google', message: 'Check your hours for the holidays' },
  { kind: 'ping', x: 250, y: 300, icon: <Logo icon={siWhatsapp} size={30} />, app: 'WhatsApp', message: 'Maria: can you open tomorrow?' },
  { kind: 'window', x: 1300, y: 470, r: -1.5, icon: <Glyph d={TV} />, name: 'TV menu', task: 'Edit the menu board', value: '€3.80' },
  { kind: 'ping', x: 1430, y: 370, icon: <Glyph d={CAL} color={BA.lilacDeep} />, app: 'Calendar', message: 'VAT return due Friday' },
  { kind: 'note', x: 760, y: 470, r: -2, colour: '#E6F1DD', title: 'This week', lines: ['Sunday rota', 'Pay invoices', 'Answer reviews', 'Post on Instagram'] },
  { kind: 'ping', x: 820, y: 360, icon: <Logo icon={siGoogle} size={30} />, app: 'Google Reviews', message: 'New review: ★☆☆☆☆' },
  { kind: 'window', x: 560, y: 300, r: 1, icon: <Glyph d={BAG} />, name: 'Click & collect', task: 'Online menu · Flat White', value: '€3.80' },
  { kind: 'ping', x: 360, y: 650, icon: <Logo icon={siInstagram} size={30} />, app: 'Instagram', message: 'Post your Christmas hours' },
  { kind: 'ping', x: 1110, y: 300, icon: <Glyph d={CAL} color={BA.lilacDeep} />, app: 'Calendar', message: 'Terrace licence ends in 3 days' },
  { kind: 'ping', x: 1000, y: 690, icon: <Logo icon={siGmail} size={30} />, app: 'Gmail', message: 'Invoice from your milk supplier' },
  { kind: 'ping', x: 1460, y: 640, icon: <Logo icon={siSquare} size={30} />, app: 'Square', message: '3 items still at the old price' },
]
const N = ITEMS.length
/** When each arrives: slowly at first, then faster and faster. */
const arrival = (i: number) => START + Math.round(SPAN * Math.pow(i / (N - 1), 0.72))

function Note({ item }: { item: Extract<Item, { kind: 'note' }> }) {
  return (
    <div style={{ width: 300, padding: '22px 26px 26px', background: item.colour, boxShadow: '0 18px 40px rgba(0,0,0,0.35)', fontFamily: hand, color: '#2B2522' }}>
      <div style={{ fontWeight: 700, fontSize: 40, lineHeight: 1 }}>{item.title}</div>
      {item.lines.map(l => (
        <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 32, fontWeight: 500, marginTop: 8 }}>
          <span style={{ width: 20, height: 20, border: '2.5px solid #2B2522', borderRadius: 4, flexShrink: 0 }} />{l}
        </div>
      ))}
    </div>
  )
}

function Window({ item }: { item: Extract<Item, { kind: 'window' }> }) {
  return (
    <div style={{ width: 400, background: '#2A2420', borderRadius: 18, overflow: 'hidden', boxShadow: '0 26px 54px rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ height: 34, background: '#342C27', display: 'flex', alignItems: 'center', gap: 7, padding: '0 14px' }}>
        {['#F2766B', '#F4BF4F', '#61C554'].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: 5, background: c, opacity: 0.85 }} />)}
      </div>
      <div style={{ padding: '16px 20px 20px', background: '#FBF8F4', fontFamily: text }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontWeight: 600, fontSize: 24, color: BA.ink }}>{item.icon}{item.name}</div>
        <div style={{ fontSize: 19, color: BA.soft, marginTop: 10 }}>{item.task}</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <div style={{ flex: 1, height: 42, borderRadius: 10, border: `1.5px solid ${BA.roseDeep}`, background: '#fff', display: 'flex', alignItems: 'center',
            padding: '0 12px', fontSize: 20, color: BA.ink }}>{item.value}</div>
          <div style={{ height: 42, padding: '0 18px', borderRadius: 21, background: BA.rose, display: 'flex', alignItems: 'center', fontWeight: 600, fontSize: 18, color: BA.ink }}>Save</div>
        </div>
      </div>
    </div>
  )
}

function Ping({ item }: { item: Extract<Item, { kind: 'ping' }> }) {
  return (
    <div style={{ width: 450, display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', borderRadius: 24, background: 'rgba(250,247,243,0.96)',
      boxShadow: '0 20px 44px rgba(0,0,0,0.4)', fontFamily: text }}>
      <div style={{ width: 52, height: 52, borderRadius: 14, background: '#fff', display: 'grid', placeItems: 'center', boxShadow: 'inset 0 0 0 1px rgba(43,37,34,0.08)', flexShrink: 0 }}>{item.icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: 21, color: BA.ink }}>
          <span>{item.app}</span><span style={{ fontWeight: 500, fontSize: 17, color: BA.faint }}>now</span>
        </div>
        <div style={{ fontSize: 21, color: BA.soft, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.message}</div>
      </div>
    </div>
  )
}

function Pile({ i }: { i: number }) {
  const frame = useCurrentFrame()
  const at = arrival(i)
  const p = useEnter(at, 13)
  const item = ITEMS[i]
  const r = item.kind === 'ping' ? 0 : item.r
  // Older things sink back as new ones arrive; everything dims when the review lands.
  const older = interpolate(frame, [at + 20, at + 60], [1, 0.8], clamp)
  const dim = interpolate(frame, [REVIEW - 4, REVIEW + 8], [1, 0.28], clamp)
  const from = item.kind === 'ping' ? [0, -40] : [0, 40]
  return (
    <div style={{ position: 'absolute', left: item.x, top: item.y, rotate: `${r}deg`, opacity: Math.min(1, p * 1.4) * older * dim,
      scale: String(interpolate(p, [0, 1], [0.85, 1])), translate: `${from[0] * (1 - p)}px ${from[1] * (1 - p)}px` }}>
      {item.kind === 'note' ? <Note item={item} /> : item.kind === 'window' ? <Window item={item} /> : <Ping item={item} />}
    </div>
  )
}

function Review() {
  const frame = useCurrentFrame()
  const p = useEnter(REVIEW, 11)
  const shake = frame >= REVIEW && frame < REVIEW + 14 ? Math.sin((frame - REVIEW) * 2.4) * (REVIEW + 14 - frame) * 0.9 : 0
  return (
    <div style={{ position: 'absolute', left: 960 - 380, top: 330, width: 760, opacity: Math.min(1, p * 1.5),
      scale: String(interpolate(p, [0, 1], [1.25, 1])), translate: `${shake}px 0` }}>
      <div style={{ background: '#fff', borderRadius: 26, padding: '34px 40px', boxShadow: '0 40px 100px rgba(0,0,0,0.55)' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[0, 1, 2, 3, 4].map(i => (
            <svg key={i} width={34} height={34} viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" fill={i === 0 ? '#F4B400' : '#E3DDD6'} /></svg>
          ))}
        </div>
        <div style={{ fontFamily: display, fontSize: 46, lineHeight: 1.18, color: BA.ink, marginTop: 18 }}>
          “Google said open on Sunday. We drove over. <em style={{ color: BA.roseDeep }}>Closed.</em>”
        </div>
      </div>
    </div>
  )
}

export function ColdOpen() {
  const frame = useCurrentFrame()
  // The clock: big in the middle while the evening is set, then up into the corner, still going.
  const lift = interpolate(frame, [76, 96], [0, 1], { ...clamp, easing: easeOut })
  const time = frame < 190 ? '18:00' : '18:01'
  const clockIn = interpolate(frame, [0, 14], [0, 1], clamp)
  const lineA = interpolate(frame, [16, 28, 70, 80], [0, 1, 1, 0], clamp)
  const lineB = interpolate(frame, [38, 50, 70, 80], [0, 1, 1, 0], clamp)
  return (
    <AbsoluteFill style={{ background: `radial-gradient(1400px 800px at 50% 0%, #2E2520, ${BA.night} 70%)` }}>
      <div style={{ position: 'absolute', left: interpolate(lift, [0, 1], [960, 1780]), top: interpolate(lift, [0, 1], [400, 950]), translate: '-50% -50%',
        fontFamily: display, fontWeight: 400, fontSize: interpolate(lift, [0, 1], [240, 64]), color: '#fff', opacity: clockIn, letterSpacing: '-0.02em',
        fontVariantNumeric: 'tabular-nums', zIndex: 2 }}>
        {time.slice(0, 2)}<span style={{ opacity: Math.floor(frame / 30) % 2 ? 0.35 : 1 }}>:</span>{time.slice(3)}
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 590, textAlign: 'center', fontFamily: display, fontSize: 64, lineHeight: 1.2, color: '#fff' }}>
        <div style={{ opacity: lineA, translate: `0 ${interpolate(lineA, [0, 1], [16, 0])}px` }}>Your café closed at three.</div>
        <div style={{ opacity: lineB, translate: `0 ${interpolate(lineB, [0, 1], [16, 0])}px`, color: BA.rose, fontStyle: 'italic' }}>But you’re still working.</div>
      </div>
      {ITEMS.map((_, i) => <Pile key={i} i={i} />)}
      <div style={{ opacity: interpolate(frame, [REVIEW - 8, REVIEW], [1, 0], clamp) }}>
        <Caption at={START + 10} title={<>So much to update.<br /><span style={{ color: BA.rose }}>In so many places.</span></>}
          x={110} y={850} width={1500} size={62} light />
      </div>
      <Review />
      <Caption at={REVIEW + 10} title={<>Miss one, and your customers <em style={{ color: BA.rose, fontStyle: 'italic' }}>find out first.</em></>}
        x={110} y={880} width={1700} size={62} light align="center" />
      {ITEMS.map((item, i) => <Sfx key={i} name={item.kind === 'ping' ? 'ping' : 'pop'} at={arrival(i)} volume={item.kind === 'ping' ? 0.1 : 0.16} />)}
      <Sfx name="buzz" at={REVIEW} volume={0.25} />
      <Sfx name="whoosh" at={290} volume={0.3} />
    </AbsoluteFill>
  )
}
