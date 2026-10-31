// What the café's change looks like where customers see it: its Google Maps listing (hours, or the
// menu), its own website, and the team's calendar. Shown as cards that tick "Updated".
import type { ReactNode } from 'react'
import { interpolate, useCurrentFrame } from 'remotion'
import { siGooglemaps } from 'simple-icons'
import { Card, Crop, Logo, Tick, useEnter } from './kit'
import { BA, text } from './theme'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

/** A card arriving: rises and settles, `at` frames in. */
export function Arrive({ at, x, y, width, children }: { at: number; x: number; y: number; width: number; children: ReactNode }) {
  const p = useEnter(at, 15)
  return (
    <div style={{ position: 'absolute', left: x, top: y, width, opacity: Math.min(1, p * 1.4),
      translate: `0 ${interpolate(p, [0, 1], [70, 0])}px`, scale: String(interpolate(p, [0, 1], [0.94, 1])) }}>
      {children}
    </div>
  )
}

/** A card's top line: what it is, and the tick. */
export function Head({ icon, name, at }: { icon: ReactNode; name: string; at: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 24px 16px', fontFamily: text, fontWeight: 600, fontSize: 26, color: BA.ink }}>
      {icon}<span style={{ flex: 1 }}>{name}</span><Tick at={at} size={20} />
    </div>
  )
}

/** A soft rose marker sweeping over what changed. */
export function Mark({ at, children, style }: { at: number; children: ReactNode; style?: React.CSSProperties }) {
  const frame = useCurrentFrame()
  const p = interpolate(frame, [at, at + 12], [0, 1], clamp)
  return (
    <span style={{ position: 'relative', display: 'inline-block', ...style }}>
      <span style={{ position: 'absolute', left: -8, right: -8, top: '8%', bottom: '8%', borderRadius: 8, background: BA.roseSoft,
        transformOrigin: 'left', scale: `${p} 1`, zIndex: 0 }} />
      <span style={{ position: 'relative', zIndex: 1 }}>{children}</span>
    </span>
  )
}

const Row = ({ left, right, at }: { left: ReactNode; right: ReactNode; at?: number }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 24px', fontFamily: text, fontSize: 23, color: BA.ink, borderTop: `1px solid ${BA.lineSoft}` }}>
    <span style={{ color: BA.soft }}>{left}</span>
    <span style={{ fontWeight: 600 }}>{at === undefined ? right : <Mark at={at}>{right}</Mark>}</span>
  </div>
)

/** The café on Google Maps: its hours, or its menu. */
export function MapsCard({ at, mode, head = true }: { at: number; mode: 'hours' | 'menu'; head?: boolean }) {
  return (
    <Card>
      {head && <Head icon={<Logo icon={siGooglemaps} size={30} />} name="Google Maps" at={at + 10} />}
      <div style={{ padding: head ? '0 24px 14px' : '22px 24px 14px' }}>
        <div style={{ fontFamily: text, fontWeight: 600, fontSize: 30, color: BA.ink }}>Easy Beans Coffee</div>
        <div style={{ fontFamily: text, fontSize: 20, color: BA.faint, marginTop: 4 }}>
          4.6 <span style={{ color: '#F4B400' }}>★★★★★</span> (25)
        </div>
        <div style={{ display: 'flex', gap: 22, marginTop: 16, fontFamily: text, fontWeight: 600, fontSize: 20 }}>
          {['Overview', 'Menu', 'Reviews'].map(tab => {
            const on = (mode === 'hours' && tab === 'Overview') || (mode === 'menu' && tab === 'Menu')
            return <span key={tab} style={{ color: on ? '#1A73E8' : BA.faint, borderBottom: on ? '3px solid #1A73E8' : '3px solid transparent', paddingBottom: 6 }}>{tab}</span>
          })}
        </div>
      </div>
      {mode === 'hours' ? (
        <>
          <Row left="Monday – Saturday" right="09:00–15:00" />
          <Row left="Sunday" right="Closed" at={at + 16} />
          <Row left="24–26 December" right="Closed · Christmas" at={at + 22} />
        </>
      ) : (
        <>
          <Row left="Flat White" right="€3.80" at={at + 16} />
          <Row left="Cappuccino" right="€3.50" />
          <Row left="Latte" right="€4.00" />
          <Row left="Americano" right="€2.80" />
        </>
      )}
      <div style={{ height: 10 }} />
    </Card>
  )
}

/** The café's own website (easybeanscoffee.com): the opening hours in its footer. */
export function WebsiteHoursCard({ at, width }: { at: number; width: number }) {
  const k = width / 700
  return (
    <Card>
      <Head icon={<Globe />} name="Your website" at={at + 10} />
      <div style={{ position: 'relative', borderTop: `1px solid ${BA.lineSoft}` }}>
        <Crop src="stills/web-hours.png" x={200} y={795} w={700} h={170} width={width} />
        <Ring at={at + 16} x={(398 - 200) * k} y={(916 - 795) * k} w={232 * k} h={44 * k} />
      </div>
    </Card>
  )
}

/** The team's calendar: the Christmas closure on Thursday, Friday and Saturday. */
export function CalendarCard({ at, width }: { at: number; width: number }) {
  const k = width / 710
  return (
    <Card>
      <Head icon={<CalendarGlyph />} name="Team calendar" at={at + 10} />
      <div style={{ position: 'relative', borderTop: `1px solid ${BA.lineSoft}` }}>
        <Crop src="stills/calendar.png" x={1150} y={975} w={710} h={105} width={width} />
        <Ring at={at + 16} x={(1154 - 1150) * k} y={(1008 - 975) * k} w={704 * k} h={34 * k} />
      </div>
    </Card>
  )
}

/** A rose ring drawn round what changed. */
export function Ring({ at, x, y, w, h }: { at: number; x: number; y: number; w: number; h: number }) {
  const frame = useCurrentFrame()
  const p = interpolate(frame, [at, at + 14], [0, 1], clamp)
  const per = 2 * (w + h)
  return (
    <svg style={{ position: 'absolute', left: x - 6, top: y - 6, overflow: 'visible' }} width={w + 12} height={h + 12}>
      <rect x={3} y={3} width={w + 6} height={h + 6} rx={(h + 6) / 2} fill="none" stroke={BA.roseDeep} strokeWidth={4}
        strokeDasharray={per + 40} strokeDashoffset={(1 - p) * (per + 40)} />
    </svg>
  )
}

export const Globe = () => (
  <svg width={30} height={30} viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-9 9h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" fill="none" stroke={BA.roseDeep} strokeWidth={1.8} /></svg>
)
export const CalendarGlyph = () => (
  <svg width={30} height={30} viewBox="0 0 24 24"><path d="M4 6h16v14H4zM4 10h16M8 3v5M16 3v5" fill="none" stroke={BA.lilacDeep} strokeWidth={1.8} strokeLinecap="round" /></svg>
)
