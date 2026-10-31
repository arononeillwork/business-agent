// The opening: "Run your café from one place." Then the map of it: Today and the Business advisor in
// the middle (where the owner finds out what to do), and round them everywhere the café shows, each
// line drawn out from the middle.
import type { ReactNode } from 'react'
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { siGooglemaps, siInstagram } from 'simple-icons'
import { Caption, Cream, Em, Logo, Sfx, ease, useEnter } from '../kit'
import { Globe } from '../places'
import { BA, display, text } from '../theme'

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
          opacity: eyebrow, translate: `0 ${interpolate(eyebrow, [0, 1], [14, 0])}px`, marginBottom: 26 }}>Easy Beans Coffee · a morning</div>
        <div style={{ fontFamily: display, fontWeight: 500, fontSize: 124, lineHeight: 1.06, letterSpacing: '-0.02em', textAlign: 'center' }}>
          <div><Word at={10}>Run</Word><Word at={14}>your</Word><Word at={18}>café</Word></div>
          <div><Word at={26} italic>from</Word><Word at={30} italic>one</Word><Word at={34} italic>place.</Word></div>
        </div>
      </AbsoluteFill>
      <Sfx name="pop" at={28} volume={0.22} />
    </Cream>
  )
}

/** A place round the middle: its logo or glyph and its name, in a pill. */
function Node({ x, y, at, icon, name }: { x: number; y: number; at: number; icon: ReactNode; name: string }) {
  const p = useEnter(at, 13)
  return (
    <div style={{ position: 'absolute', left: x, top: y, translate: '-50% -50%', display: 'flex', alignItems: 'center', gap: 14, padding: '16px 26px 16px 18px',
      borderRadius: 999, background: '#fff', boxShadow: '0 16px 40px rgba(60,40,30,0.12), 0 0 0 1px rgba(43,37,34,0.06)', fontFamily: text, fontWeight: 600,
      fontSize: 28, color: BA.ink, whiteSpace: 'nowrap', opacity: Math.min(1, p * 1.5), scale: String(interpolate(p, [0, 1], [0.6, 1])) }}>
      {icon}{name}
    </div>
  )
}

const TvGlyph = () => (
  <svg width={32} height={32} viewBox="0 0 24 24"><rect x="2.5" y="4" width="19" height="12.5" rx="1.6" fill="none" stroke={BA.ink} strokeWidth="1.8" /><path d="M9 20.5h6M12 16.5v4" stroke={BA.ink} strokeWidth="1.8" strokeLinecap="round" /></svg>
)
const MenuGlyph = () => (
  <svg width={32} height={32} viewBox="0 0 24 24"><path d="M6 3h9l3 3v15H6z" fill="none" stroke={BA.matchaDeep} strokeWidth="1.8" strokeLinejoin="round" /><path d="M9 10h6M9 13.5h6M9 17h4" stroke={BA.matchaDeep} strokeWidth="1.8" strokeLinecap="round" /></svg>
)
const StarGlyph = () => (
  <svg width={32} height={32} viewBox="0 0 24 24"><path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" fill="#F4B400" /></svg>
)

/** One of the two places in the middle: Today, or the Business advisor. */
function Centre({ x, at, title, lines, accent }: { x: number; at: number; title: string; lines: [string, string][]; accent: string }) {
  const p = useEnter(at, 200)
  return (
    <div style={{ position: 'absolute', left: x, top: 470, width: 330, boxSizing: 'border-box', padding: '24px 28px 22px', borderRadius: 26, background: '#fff',
      boxShadow: '0 30px 70px rgba(60,40,30,0.16), 0 0 0 1px rgba(43,37,34,0.06)', borderTop: `6px solid ${accent}`, fontFamily: text,
      opacity: p, translate: `0 ${interpolate(p, [0, 1], [40, 0])}px` }}>
      <div style={{ fontFamily: display, fontWeight: 500, fontSize: 40, color: BA.ink }}>{title}</div>
      {lines.map(([a, b]) => (
        <div key={a} style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 22, color: BA.soft }}>
          <span>{a}</span><span style={{ fontWeight: 600, color: BA.ink }}>{b}</span>
        </div>
      ))}
    </div>
  )
}

const NODES = [
  { x: 330, y: 360, icon: <Logo icon={siGooglemaps} size={32} />, name: 'Google Maps' },
  { x: 250, y: 620, icon: <Globe />, name: 'Your website' },
  { x: 360, y: 880, icon: <StarGlyph />, name: 'Google reviews' },
  { x: 1590, y: 360, icon: <TvGlyph />, name: 'Café TV' },
  { x: 1670, y: 620, icon: <MenuGlyph />, name: 'Printed menus' },
  { x: 1560, y: 880, icon: <Logo icon={siInstagram} size={32} />, name: 'Instagram' },
]

export function Hub() {
  const frame = useCurrentFrame()
  const mark = useEnter(4, 14)
  const out = interpolate(frame, [170, 180], [1, 0], clamp)
  return (
    <Cream>
      <AbsoluteFill style={{ opacity: out }}>
        <Caption title={<>Two places tell you what to do.<br /><Em>Everything else follows.</Em></>} align="center" x={160} width={1600} y={56} size={66} at={0} />
        <svg style={{ position: 'absolute', left: 0, top: 0 }} width={1920} height={1080}>
          {NODES.map((n, i) => {
            const fromX = n.x < 960 ? 615 : 1305
            const d = `M ${fromX} 600 C ${(fromX + n.x) / 2} 600, ${(fromX + n.x) / 2} ${n.y}, ${n.x} ${n.y}`
            const p = interpolate(frame, [40 + i * 7, 64 + i * 7], [0, 1], { ...clamp, easing: ease })
            return <path key={n.name} d={d} fill="none" stroke={BA.rose} strokeWidth={3} strokeLinecap="round" strokeDasharray="800" strokeDashoffset={800 * (1 - p)} />
          })}
        </svg>
        <div style={{ position: 'absolute', left: 960, top: 355, translate: '-50% 0', opacity: mark, scale: String(interpolate(mark, [0, 1], [0.6, 1])) }}>
          <Img src={staticFile('brand/icon.png')} style={{ width: 92, height: 92, borderRadius: 28, background: '#fff', padding: 9, border: `1px solid ${BA.line}`,
            boxShadow: '0 16px 40px rgba(60,40,30,0.14)' }} />
        </div>
        <Centre x={615} at={12} title="Today" accent={BA.rose} lines={[['Takings so far', '€481'], ['Running low', '7 items'], ['Jobs to do', '12']]} />
        <Centre x={975} at={20} title="Advisor" accent={BA.lilac} lines={[['Worth doing', '4 things'], ['Read from', 'your figures'], ['Each one', 'a click away']]} />
        {NODES.map((n, i) => <Node key={n.name} {...n} at={56 + i * 7} />)}
      </AbsoluteFill>
      {NODES.map((n, i) => <Sfx key={n.name} name="pop" at={56 + i * 7} volume={0.16} />)}
      <Sfx name="whoosh" at={172} volume={0.22} />
    </Cream>
  )
}
