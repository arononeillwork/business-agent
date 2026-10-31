// The close: the morning's four changes, each made once, and everywhere each one went; then the rest
// of the café in the same place (what else the app runs); then the brand, as the day video ends.
import type { ReactNode } from 'react'
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion'
import { Caption, Cream, Em, Sfx, useEnter } from '../kit'
import { Globe } from '../places'
import { BA, text } from '../theme'
import { InstagramIcon, MapsIcon } from './where'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

const Chip = ({ icon, name }: { icon?: ReactNode; name: string }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 18px 8px 12px', borderRadius: 999, background: BA.goodSoft, color: BA.good,
    fontFamily: text, fontWeight: 600, fontSize: 22, whiteSpace: 'nowrap' }}>
    {icon ?? <svg width={22} height={22} viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill={BA.good} /><path d="M7 12.5l3.2 3.2L17 9" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
    {name}
  </span>
)

const small = (icon: ReactNode) => <span style={{ display: 'inline-flex', scale: '0.8' }}>{icon}</span>

const DONE: { n: number; what: ReactNode; where: ReactNode[] }[] = [
  { n: 1, what: <>Sunday closes at <b>15:00</b></>, where: [<Chip key="m" icon={small(<MapsIcon />)} name="Google Maps" />, <Chip key="w" icon={small(<Globe />)} name="Your website" />] },
  { n: 2, what: <>Pain au chocolat at <b>€2,90</b></>, where: [<Chip key="m" icon={small(<MapsIcon />)} name="Google Maps" />, <Chip key="t" name="Café TV" />, <Chip key="p" name="Printed menu" />] },
  { n: 3, what: <>Leftover croissants <b>on offer</b></>, where: [<Chip key="t" name="Café TV" />, <Chip key="i" icon={small(<InstagramIcon />)} name="Instagram story" />] },
  { n: 4, what: <>Tom’s review <b>answered</b></>, where: [<Chip key="m" icon={small(<MapsIcon />)} name="Google Maps" />] },
]

function Row({ n, what, where, at }: { n: number; what: ReactNode; where: ReactNode[]; at: number }) {
  const p = useEnter(at, 200)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 26, padding: '32px 40px', borderTop: n > 1 ? `1px solid ${BA.lineSoft}` : 'none',
      opacity: p, translate: `${interpolate(p, [0, 1], [40, 0])}px 0` }}>
      <span style={{ width: 46, height: 46, borderRadius: 23, background: BA.good, color: '#fff', display: 'grid', placeItems: 'center', fontFamily: text, fontWeight: 700, fontSize: 24, flexShrink: 0 }}>{n}</span>
      <span style={{ width: 540, fontFamily: text, fontSize: 34, color: BA.ink }}>{what}</span>
      <span style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>{where}</span>
    </div>
  )
}

function Done({ len }: { len: number }) {
  const frame = useCurrentFrame()
  const card = useEnter(0, 200)
  const out = interpolate(frame, [len - 10, len], [1, 0], clamp)
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <Caption title={<>Four changes, made once. <Em>Done before the rush.</Em></>} at={0} align="center" x={160} width={1600} />
      <div style={{ position: 'absolute', left: 250, top: 300, width: 1420, borderRadius: 26, background: '#fff', overflow: 'hidden',
        boxShadow: '0 30px 70px rgba(60,40,30,0.16), 0 0 0 1px rgba(43,37,34,0.06)', opacity: card, translate: `0 ${interpolate(card, [0, 1], [50, 0])}px` }}>
        {DONE.map((d, i) => <Row key={d.n} {...d} at={8 + i * 9} />)}
      </div>
      {DONE.map((d, i) => <Sfx key={d.n} name="ping" at={8 + i * 9} volume={0.12} />)}
    </AbsoluteFill>
  )
}

/** What else the café runs in the same place. */
const REST: [string, string][] = [
  ['Rota & clock-in', BA.roseSoft], ['Timecards & payroll', BA.lilacSoft], ['Stock & orders', BA.matchaSoft], ['Suppliers', BA.tint],
  ['Invoices & expenses', BA.lilacSoft], ['Tax', BA.roseSoft], ['Licences', BA.tint], ['Social planner', BA.matchaSoft],
  ['Messages', BA.roseSoft], ['Loyalty', BA.matchaSoft], ['Café music', BA.tint], ['Screens', BA.lilacSoft],
]

function Tile({ name, bg, at }: { name: string; bg: string; at: number }) {
  const p = useEnter(at, 14)
  return (
    <div style={{ height: 120, borderRadius: 22, background: '#fff', boxShadow: '0 16px 36px rgba(60,40,30,0.10), 0 0 0 1px rgba(43,37,34,0.05)',
      display: 'flex', alignItems: 'center', gap: 18, padding: '0 26px', opacity: Math.min(1, p * 1.5), scale: String(interpolate(p, [0, 1], [0.8, 1])) }}>
      <span style={{ width: 52, height: 52, borderRadius: 16, background: bg, flexShrink: 0, display: 'grid', placeItems: 'center' }}>
        <svg width={26} height={26} viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill={BA.good} /><path d="M7 12.5l3.2 3.2L17 9" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      <span style={{ fontFamily: text, fontWeight: 600, fontSize: 30, color: BA.ink }}>{name}</span>
    </div>
  )
}

function Rest({ len }: { len: number }) {
  const frame = useCurrentFrame()
  const out = interpolate(frame, [len - 10, len], [1, 0], clamp)
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <Caption title={<>And the rest of the café, <Em>in the same place.</Em></>} at={0} align="center" x={160} width={1600} />
      <div style={{ position: 'absolute', left: 200, top: 270, width: 1520, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 26 }}>
        {REST.map(([name, bg], i) => <Tile key={name} name={name} bg={bg} at={6 + i * 3} />)}
      </div>
      {[6, 18, 30, 42].map(f => <Sfx key={f} name="pop" at={f} volume={0.14} />)}
    </AbsoluteFill>
  )
}

export function Recap({ len }: { len: number }) {
  const half = Math.round(len / 2)
  return (
    <Cream>
      <Sequence durationInFrames={half}><Done len={half} /></Sequence>
      <Sequence from={half}><Rest len={len - half} /></Sequence>
      <Sfx name="whoosh" at={half - 8} volume={0.18} />
    </Cream>
  )
}
