// What the café's change looks like where customers see it: its Google Maps listing (hours, or the
// menu), its own website, and the team's calendar. Shown as cards that tick "Updated".
import type { ReactNode } from 'react'
import { Img, interpolate, staticFile, useCurrentFrame } from 'remotion'
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

/** What the café's Google Maps listing shows: its hours, or its menu. */
export function MapsBody({ at, mode, pad = 0 }: { at: number; mode: 'hours' | 'menu'; pad?: number }) {
  return (
    <>
      <div style={{ padding: `${pad}px 24px 14px` }}>
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
          <Row left="24–26 December" right="Closed" at={at + 22} />
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
    </>
  )
}

/** The café on Google Maps, as a card. */
export function MapsCard({ at, mode, head = true }: { at: number; mode: 'hours' | 'menu'; head?: boolean }) {
  return (
    <Card>
      {head && <Head icon={<Logo icon={siGooglemaps} size={30} />} name="Google Maps" at={at + 10} />}
      <MapsBody at={at} mode={mode} pad={head ? 0 : 22} />
    </Card>
  )
}

/**
 * "It's changed everywhere", for the opening hours: the change at the top, lines drawn from it to
 * three cards of the same size (Google Maps, the café's website, the team's calendar), each ticking
 * "Updated" with what changed marked.
 */
export function EverywhereHours({ at = 0 }: { at?: number }) {
  const frame = useCurrentFrame()
  const pill = useEnter(at, 200)
  const CARDS = [
    { x: 200, icon: <Logo icon={siGooglemaps} size={30} />, name: 'Google Maps', body: (a: number) => <MapsBody at={a} mode="hours" /> },
    { x: 720, icon: <Globe />, name: 'Your website', body: (a: number) => <WebsiteHours at={a} /> },
    { x: 1240, icon: <CalendarGlyph />, name: 'Team calendar', body: (a: number) => <ChristmasDays at={a} /> },
  ]
  return (
    <>
      <div style={{ position: 'absolute', left: 960, top: 196, translate: '-50% 0', display: 'flex', alignItems: 'center', gap: 16, padding: '14px 26px 14px 16px',
        borderRadius: 999, background: '#fff', boxShadow: '0 16px 40px rgba(60,40,30,0.12), 0 0 0 1px rgba(43,37,34,0.06)', fontFamily: text,
        opacity: pill, scale: String(interpolate(pill, [0, 1], [0.9, 1])) }}>
        <Img src={staticFile('brand/icon.png')} style={{ width: 44, height: 44, borderRadius: 13, background: '#fff', padding: 4, border: `1px solid ${BA.line}` }} />
        <span style={{ fontWeight: 600, fontSize: 28, color: BA.ink }}>Opening hours</span>
        {['Sundays: closed', '24–26 Dec: closed'].map(c => (
          <span key={c} style={{ padding: '6px 16px', borderRadius: 999, background: BA.roseSoft, color: BA.roseDeep, fontWeight: 600, fontSize: 23 }}>{c}</span>
        ))}
      </div>
      <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} width={1920} height={1080}>
        {CARDS.map((c, i) => {
          const x2 = c.x + 240
          const d = `M 960 268 C 960 320, ${x2} 300, ${x2} 368`
          const p = interpolate(frame, [at + 8 + i * 6, at + 26 + i * 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
          return <path key={i} d={d} fill="none" stroke={BA.rose} strokeWidth={3} strokeLinecap="round" strokeDasharray="700" strokeDashoffset={700 * (1 - p)} />
        })}
      </svg>
      {CARDS.map((c, i) => {
        const a = at + 16 + i * 10
        return (
          <Arrive key={c.name} at={a} x={c.x} y={372} width={480}>
            <Card style={{ height: 460, display: 'flex', flexDirection: 'column' }}>
              <Head icon={c.icon} name={c.name} at={a + 10} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', borderTop: `1px solid ${BA.lineSoft}` }}>{c.body(a)}</div>
            </Card>
          </Arrive>
        )
      })}
    </>
  )
}

/** The café's own website (easybeanscoffee.com): the opening hours in its footer, as it is live. */
function WebsiteHours({ at }: { at: number }) {
  const w = 432
  const k = w / 530
  return (
    <div style={{ margin: '0 24px', borderRadius: 16, overflow: 'hidden', background: '#F4ECE7', boxShadow: 'inset 0 0 0 1px rgba(43,37,34,0.06)' }}>
      <div style={{ height: 30, display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', background: '#EDE3DC' }}>
        {['#F2766B', '#F4BF4F', '#61C554'].map(c => <div key={c} style={{ width: 9, height: 9, borderRadius: 5, background: c }} />)}
      </div>
      <div style={{ position: 'relative', padding: '18px 0' }}>
        <Crop src="stills/web-hours.png" x={370} y={805} w={530} h={170} width={w} />
        <Ring at={at + 16} x={(398 - 370) * k} y={18 + (916 - 805) * k} w={232 * k} h={44 * k} />
      </div>
    </div>
  )
}

/** The team's calendar for Christmas: the three days closed, the bank holiday on Friday. */
function ChristmasDays({ at }: { at: number }) {
  const days: [string, number, boolean][] = [['Thu', 24, false], ['Fri', 25, true], ['Sat', 26, false]]
  return (
    <div style={{ margin: '0 24px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderRadius: 16, overflow: 'hidden', boxShadow: 'inset 0 0 0 1px rgba(43,37,34,0.08)' }}>
      {days.map(([day, n, holiday], i) => (
        <div key={n} style={{ padding: '14px 12px 18px', borderLeft: i ? `1px solid ${BA.lineSoft}` : 'none', minHeight: 190, fontFamily: text }}>
          <div style={{ fontSize: 20, color: BA.faint }}>{day}</div>
          <div style={{ fontSize: 40, fontWeight: 600, color: BA.ink, marginTop: 2 }}>{n}</div>
          <div style={{ marginTop: 12 }}><Mark at={at + 16 + i * 3}><span style={{ display: 'inline-block', padding: '5px 12px', borderRadius: 999, background: '#37474F', color: '#fff', fontWeight: 600, fontSize: 19 }}>Closed</span></Mark></div>
          {holiday && <div style={{ marginTop: 8, display: 'inline-block', padding: '5px 10px', borderRadius: 999, background: '#C62828', color: '#fff', fontWeight: 600, fontSize: 16, whiteSpace: 'nowrap' }}>Bank holiday</div>}
        </div>
      ))}
    </div>
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
